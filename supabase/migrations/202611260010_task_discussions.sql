create table public.team_task_comments (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.team_workspaces on delete cascade,
  task_id text not null,
  author_label text not null,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  mention_labels text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index team_task_comments_thread on public.team_task_comments (team_id, task_id, created_at desc, id desc);

create table public.team_task_mentions (
  comment_id uuid not null references public.team_task_comments on delete cascade,
  team_id uuid not null references public.team_workspaces on delete cascade,
  recipient uuid not null references auth.users on delete cascade,
  task_id text not null,
  task_title text not null,
  author_label text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  primary key (comment_id, recipient)
);
create index team_task_mentions_inbox on public.team_task_mentions (team_id, recipient, created_at desc);

alter table public.team_task_comments enable row level security;
alter table public.team_task_mentions enable row level security;
revoke all on public.team_task_comments, public.team_task_mentions from public, anon, authenticated;
grant select on public.team_task_comments, public.team_task_mentions to authenticated;

create policy "Team members read task comments" on public.team_task_comments for select to authenticated
using (public.my_team_role(team_id) is not null);
create policy "Recipients read their team mentions" on public.team_task_mentions for select to authenticated
using (recipient = (select auth.uid()) and public.my_team_role(team_id) is not null);

create function public.post_team_task_comment(target_team uuid, target_task text, comment_body text, mentioned_users uuid[] default '{}')
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  comment uuid;
  task_title text;
  author text;
  labels text[];
begin
  if coalesce(public.my_team_role(target_team), '') not in ('owner','editor') then
    raise sqlstate '42501' using message = 'Team editing access required';
  end if;
  perform 1 from public.team_workspaces where id = target_team for share;
  select label into author from public.team_members
  where team_id = target_team and user_id = auth.uid() and member_role in ('owner','editor');
  if author is null then raise sqlstate '42501' using message = 'Team editing access required'; end if;

  select task->>'title' into task_title from public.team_workspaces t
  cross join lateral jsonb_array_elements(t.workspace->'tasks') task
  where t.id = target_team and task->>'id' = target_task;
  if task_title is null then raise sqlstate '22023' using message = 'Save the task before commenting'; end if;
  if cardinality(mentioned_users) > 10 then raise sqlstate '22023' using message = 'Mention up to 10 teammates'; end if;
  if exists (select 1 from unnest(mentioned_users) id where not exists (
    select 1 from public.team_members where team_id = target_team and user_id = id and user_id <> auth.uid()
  )) then raise sqlstate '22023' using message = 'Mentions must match other team members'; end if;

  select coalesce(array_agg(label order by label,user_id),'{}') into labels from public.team_members
  where team_id = target_team and user_id = any(mentioned_users);
  insert into public.team_task_comments(team_id,task_id,author_label,body,mention_labels)
  values(target_team,target_task,author,trim(comment_body),labels) returning id into comment;

  insert into public.team_task_mentions(comment_id,team_id,recipient,task_id,task_title,author_label)
  select comment,target_team,user_id,target_task,task_title,author from public.team_members
  where team_id = target_team and user_id = any(mentioned_users);
  return comment;
end;
$$;

create function public.read_team_task_mention(target_team uuid, target_comment uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.team_task_mentions set read_at = now()
  where team_id = target_team and comment_id = target_comment and recipient = auth.uid()
    and read_at is null and public.my_team_role(target_team) is not null;
$$;

revoke execute on function public.post_team_task_comment(uuid,text,text,uuid[]), public.read_team_task_mention(uuid,uuid)
from public, anon, authenticated;
grant execute on function public.post_team_task_comment(uuid,text,text,uuid[]), public.read_team_task_mention(uuid,uuid)
to authenticated;

notify pgrst, 'reload schema';
