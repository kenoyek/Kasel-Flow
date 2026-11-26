create or replace function public.my_verified_team_email()
returns text language sql stable security definer set search_path = ''
as $$
  select lower(email) from auth.users where id = (select auth.uid()) and email_confirmed_at is not null;
$$;

create or replace function public.pending_team_invites()
returns table (id uuid, team_name text, member_role text, expires_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select i.id, t.name, i.member_role, i.expires_at
  from public.team_invites i join public.team_workspaces t on t.id = i.team_id
  where i.email = (select public.my_verified_team_email()) and i.expires_at > now()
  order by i.expires_at;
$$;

create or replace function public.accept_team_invite(invitation uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  entry public.team_invites%rowtype;
begin
  delete from public.team_invites
  where id = invitation and email = public.my_verified_team_email() and expires_at > now()
  returning * into entry;
  if not found then raise sqlstate '42501' using message = 'Invitation unavailable'; end if;
  insert into public.team_members values (entry.team_id, actor, entry.email, entry.member_role)
  on conflict (team_id,user_id) do nothing;
  return entry.team_id;
end;
$$;

revoke execute on function public.my_verified_team_email(), public.pending_team_invites(), public.accept_team_invite(uuid)
from public, anon, authenticated;
grant execute on function public.my_verified_team_email(), public.pending_team_invites(), public.accept_team_invite(uuid)
to authenticated;

notify pgrst, 'reload schema';
