alter table public.team_task_comments add column author_id uuid;
alter table public.team_task_mentions add column notice_kind text not null default 'mention'
  check (notice_kind in ('mention','comment'));

create or replace trigger queue_mention_email after insert on public.team_task_mentions
for each row when (new.notice_kind = 'mention')
execute function kasel_internal.queue_mention_email();

create or replace function public.post_team_task_comment(target_team uuid, target_task text, comment_body text, mentioned_users uuid[] default '{}')
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  comment uuid;
  task_title text;
  task_assignee text;
  author text;
  labels text[];
begin
  if coalesce(public.my_team_role(target_team), '') not in ('owner','editor') then
    raise sqlstate '42501' using message = 'Team editing access required';
  end if;
  perform 1 from public.team_workspaces where id = target_team for share;
  select label into author from public.team_members
  where team_id = target_team and user_id = actor and member_role in ('owner','editor');
  if author is null then raise sqlstate '42501' using message = 'Team editing access required'; end if;

  select task->>'title',task->>'assignee' into task_title,task_assignee from public.team_workspaces t
  cross join lateral jsonb_array_elements(t.workspace->'tasks') task
  where t.id = target_team and task->>'id' = target_task;
  if task_title is null then raise sqlstate '22023' using message = 'Save the task before commenting'; end if;
  if cardinality(mentioned_users) > 10 then raise sqlstate '22023' using message = 'Mention up to 10 teammates'; end if;
  if exists (select 1 from unnest(mentioned_users) id where not exists (
    select 1 from public.team_members where team_id = target_team and user_id = id and user_id <> actor
  )) then raise sqlstate '22023' using message = 'Mentions must match other team members'; end if;

  select coalesce(array_agg(label order by label,user_id),'{}') into labels from public.team_members
  where team_id = target_team and user_id = any(mentioned_users);
  insert into public.team_task_comments(team_id,task_id,author_id,author_label,body,mention_labels)
  values(target_team,target_task,actor,author,trim(comment_body),labels) returning id into comment;

  insert into public.team_task_mentions(comment_id,team_id,recipient,task_id,task_title,author_label,notice_kind)
  select comment,target_team,m.user_id,target_task,task_title,author,
    case when m.user_id = any(mentioned_users) then 'mention' else 'comment' end
  from public.team_members m
  where m.team_id = target_team and m.user_id <> actor and (
    m.user_id = any(mentioned_users) or m.user_id::text = task_assignee or exists(
      select 1 from public.team_task_comments c
      where c.team_id=target_team and c.task_id=target_task
        and (c.author_id=m.user_id or (c.author_id is null and c.author_label=m.label))
    )
  );
  return comment;
end;
$$;

create table public.team_chat_messages (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.team_workspaces on delete cascade,
  author_label text not null,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default statement_timestamp()
);
create index team_chat_messages_room on public.team_chat_messages(team_id,created_at desc,id desc);

alter table public.team_chat_messages enable row level security;
revoke all on public.team_chat_messages from public, anon, authenticated;
grant select on public.team_chat_messages to authenticated;
create policy "Members read team chat" on public.team_chat_messages for select to authenticated
using (public.my_team_role(team_id) is not null);

create function public.post_team_chat_message(target_team uuid, message_body text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  sender text;
  message_id uuid;
begin
  if coalesce(public.my_team_role(target_team),'') not in ('owner','editor') then
    raise sqlstate '42501' using message = 'Team editing access required';
  end if;
  perform 1 from public.team_workspaces where id=target_team for share;
  select label into sender from public.team_members
  where team_id=target_team and user_id=auth.uid() and member_role in ('owner','editor');
  if sender is null then raise sqlstate '42501' using message = 'Team editing access required'; end if;
  insert into public.team_chat_messages(team_id,author_label,body)
  values(target_team,sender,trim(message_body)) returning id into message_id;
  return message_id;
end;
$$;

revoke execute on function public.post_team_chat_message(uuid,text) from public, anon, authenticated;
grant execute on function public.post_team_chat_message(uuid,text) to authenticated;

alter publication supabase_realtime add table public.team_chat_messages, public.team_task_mentions;

notify pgrst, 'reload schema';
