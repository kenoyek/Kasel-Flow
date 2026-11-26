create function public.delete_team_workspace(team uuid, expected_revision bigint)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if public.my_team_role(team) is distinct from 'owner' then
    raise sqlstate '42501' using message = 'Team owner required';
  end if;

  delete from public.team_workspaces
  where id = team and revision = expected_revision;

  return found;
end;
$$;

revoke execute on function public.delete_team_workspace(uuid,bigint) from public, anon, authenticated;
grant execute on function public.delete_team_workspace(uuid,bigint) to authenticated;
