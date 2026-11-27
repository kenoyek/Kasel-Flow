alter table public.team_chat_messages add column pinned_at timestamptz;

create unique index team_chat_one_pin on public.team_chat_messages(team_id) where pinned_at is not null;

create function public.set_team_chat_pin(target_team uuid, target_message uuid, make_pinned boolean)
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
    if not exists(select 1 from public.team_chat_messages where team_id=target_team and id=target_message) then return false; end if;
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

revoke execute on function public.set_team_chat_pin(uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.set_team_chat_pin(uuid,uuid,boolean) to authenticated;

notify pgrst, 'reload schema';
