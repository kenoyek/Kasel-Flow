create table public.workspace_admin_access (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.workspace_admin_access enable row level security;
revoke all on public.workspace_admin_access from public, anon, authenticated;

-- Preserve existing private workspaces and let existing team owners keep creating teams.
insert into public.workspace_admin_access (user_id)
select owner_id from public.private_workspaces
union
select user_id from public.team_members where member_role = 'owner';

create function public.can_use_private_workspace()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_admin_access where user_id = (select auth.uid())
  );
$$;

revoke execute on function public.can_use_private_workspace() from public, anon, authenticated;
grant execute on function public.can_use_private_workspace() to authenticated;

create policy "Private workspace access required" on public.private_workspaces
as restrictive for all to authenticated
using ((select public.can_use_private_workspace()))
with check ((select public.can_use_private_workspace()));

create or replace function public.create_team_workspace(team_name text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  address text := public.my_verified_team_email();
  team uuid;
begin
  if actor is null or address is null then raise sqlstate '42501' using message = 'Verified email required'; end if;
  if not public.can_use_private_workspace() then raise sqlstate '42501' using message = 'Workspace administrator required'; end if;
  insert into public.team_workspaces (name) values (trim(team_name)) returning id into team;
  insert into public.team_members values (team, actor, address, 'owner');
  return team;
end;
$$;

notify pgrst, 'reload schema';
