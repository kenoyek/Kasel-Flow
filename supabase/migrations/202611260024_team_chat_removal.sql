alter table public.team_chat_messages
  add column removed_at timestamptz,
  add constraint team_chat_removed_content check (
    removed_at is null or (body = 'Message removed' and pinned_at is null)
  );

create function public.remove_team_chat_message(target_team uuid, target_message uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  perform 1 from public.team_workspaces where id = target_team for share;
  perform 1 from public.team_members
  where team_id = target_team and user_id = actor and member_role in ('owner','editor')
  for share;
  if not found then return false; end if;

  update public.team_chat_messages
  set body = 'Message removed', removed_at = clock_timestamp(), pinned_at = null, edited_at = null
  where team_id = target_team and id = target_message and author_id = actor and removed_at is null;
  if not found then return false; end if;

  delete from public.team_chat_reactions where team_id = target_team and message_id = target_message;
  return true;
end;
$$;

revoke execute on function public.remove_team_chat_message(uuid,uuid) from public, anon, authenticated;
grant execute on function public.remove_team_chat_message(uuid,uuid) to authenticated;

create or replace function public.search_team_chat(target_team uuid, search_text text)
returns table(id uuid, author_id uuid, author_label text, body text, created_at timestamptz)
language sql stable security invoker set search_path = ''
as $$
  select message.id, message.author_id, message.author_label,
    substring(message.body from greatest(1, strpos(lower(message.body), lower(trim(search_text))) - 60) for 240),
    message.created_at
  from public.team_chat_messages message
  where message.team_id = target_team
    and message.removed_at is null
    and char_length(trim(search_text)) between 2 and 120
    and strpos(lower(message.body), lower(trim(search_text))) > 0
  order by message.created_at desc, message.id desc
  limit 26;
$$;

create or replace function public.team_chat_unread_count(target_team uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer
  from public.team_members m
  left join public.team_chat_read_positions p on p.team_id=m.team_id and p.user_id=m.user_id
  join public.team_chat_messages c on c.team_id=m.team_id
  where m.team_id=target_team and m.user_id=(select auth.uid())
    and c.removed_at is null
    and (p.message_id is null or (c.created_at,c.id)>(p.message_at,p.message_id))
    and (c.author_id is distinct from m.user_id and (c.author_id is not null or c.author_label<>m.label));
$$;

create or replace function public.set_team_chat_pin(target_team uuid, target_message uuid, make_pinned boolean)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(public.my_team_role(target_team),'') not in ('owner','editor') then
    raise sqlstate '42501' using message = 'Team editing access required';
  end if;

  perform 1 from public.team_workspaces where id=target_team for update;
  if coalesce(public.my_team_role(target_team),'') not in ('owner','editor') then
    raise sqlstate '42501' using message = 'Team editing access required';
  end if;

  if make_pinned then
    if not exists(select 1 from public.team_chat_messages where team_id=target_team and id=target_message and removed_at is null) then return false; end if;
    update public.team_chat_messages set pinned_at=null
    where team_id=target_team and pinned_at is not null and id<>target_message;
    update public.team_chat_messages set pinned_at=coalesce(pinned_at,statement_timestamp())
    where team_id=target_team and id=target_message;
  else
    update public.team_chat_messages set pinned_at=null
    where team_id=target_team and id=target_message and pinned_at is not null;
  end if;
  return found;
end;
$$;

create or replace function public.edit_team_chat_message(
  target_team uuid, target_message uuid, message_body text, expected_edited_at timestamptz
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  update public.team_chat_messages as message
  set body = trim(message_body),
      edited_at = case when message.body = trim(message_body) then message.edited_at else clock_timestamp() end
  where message.team_id = target_team
    and message.id = target_message
    and message.removed_at is null
    and message.author_id = (select auth.uid())
    and message.edited_at is not distinct from expected_edited_at
    and public.my_team_role(target_team) in ('owner','editor');
  return found;
end;
$$;

create or replace function public.set_team_chat_reaction(target_team uuid, target_message uuid, reaction_emoji text, enabled boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  perform 1 from public.team_workspaces where id = target_team for share;
  perform 1 from public.team_members
  where team_id = target_team and user_id = actor and member_role in ('owner','editor')
  for share;
  if not found then
    raise sqlstate '42501' using message = 'Team editing access required';
  end if;

  perform 1 from public.team_chat_messages
  where team_id = target_team and id = target_message and removed_at is null
  for share;
  if not found then
    raise sqlstate '23503' using message = 'Message is unavailable';
  end if;

  if enabled then
    insert into public.team_chat_reactions(team_id,message_id,user_id,emoji)
    values(target_team,target_message,actor,reaction_emoji)
    on conflict (team_id,message_id,user_id,emoji) do update set active = true
    where not team_chat_reactions.active;
  else
    update public.team_chat_reactions set active = false
    where team_id = target_team and message_id = target_message and user_id = actor
      and emoji = reaction_emoji and active;
  end if;
end;
$$;

notify pgrst, 'reload schema';
