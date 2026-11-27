alter table public.team_chat_messages add column author_id uuid;

create or replace function public.post_team_chat_message(target_team uuid, message_body text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  sender text;
  message_id uuid;
begin
  if coalesce(public.my_team_role(target_team),'') not in ('owner','editor') then
    raise sqlstate '42501' using message = 'Team editing access required';
  end if;
  perform 1 from public.team_workspaces where id=target_team for share;
  select label into sender from public.team_members
  where team_id=target_team and user_id=actor and member_role in ('owner','editor');
  if sender is null then raise sqlstate '42501' using message = 'Team editing access required'; end if;
  insert into public.team_chat_messages(team_id,author_id,author_label,body)
  values(target_team,actor,sender,trim(message_body)) returning id into message_id;
  return message_id;
end;
$$;

create table public.team_chat_read_positions (
  team_id uuid not null,
  user_id uuid not null,
  message_id uuid not null,
  message_at timestamptz not null,
  primary key (team_id,user_id),
  foreign key (team_id,user_id) references public.team_members(team_id,user_id) on delete cascade
);
alter table public.team_chat_read_positions enable row level security;
revoke all on public.team_chat_read_positions from public, anon, authenticated;

create function public.team_chat_unread_count(target_team uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer
  from public.team_members m
  left join public.team_chat_read_positions p on p.team_id=m.team_id and p.user_id=m.user_id
  join public.team_chat_messages c on c.team_id=m.team_id
  where m.team_id=target_team and m.user_id=(select auth.uid())
    and (p.message_id is null or (c.created_at,c.id)>(p.message_at,p.message_id))
    and (c.author_id is distinct from m.user_id and (c.author_id is not null or c.author_label<>m.label));
$$;

create function public.mark_team_chat_read(target_team uuid, through_message uuid)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.team_chat_read_positions(team_id,user_id,message_id,message_at)
  select m.team_id,m.user_id,c.id,c.created_at
  from public.team_members m join public.team_chat_messages c on c.team_id=m.team_id
  where m.team_id=target_team and m.user_id=(select auth.uid()) and c.id=through_message
  on conflict(team_id,user_id) do update set message_id=excluded.message_id,message_at=excluded.message_at
  where (excluded.message_at,excluded.message_id) >
    (team_chat_read_positions.message_at,team_chat_read_positions.message_id);
$$;

revoke execute on function public.team_chat_unread_count(uuid), public.mark_team_chat_read(uuid,uuid) from public, anon, authenticated;
grant execute on function public.team_chat_unread_count(uuid), public.mark_team_chat_read(uuid,uuid) to authenticated;

notify pgrst, 'reload schema';
