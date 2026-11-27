create table public.team_invitation_history (
  invitation_id uuid primary key,
  team_id uuid not null references public.team_workspaces on delete cascade,
  email text not null,
  member_role text not null check (member_role in ('editor', 'viewer')),
  accepted_at timestamptz not null default statement_timestamp()
);
create index team_invitation_history_team_time on public.team_invitation_history (team_id, accepted_at desc);

alter table public.team_invitation_history enable row level security;
revoke all on public.team_invitation_history from public, anon, authenticated;
grant select on public.team_invitation_history to authenticated;

create policy "Owners read team invitation history" on public.team_invitation_history
for select to authenticated using (public.my_team_role(team_id) = 'owner');

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

  insert into public.team_invitation_history (invitation_id,team_id,email,member_role)
  values (entry.id,entry.team_id,entry.email,entry.member_role);

  return entry.team_id;
end;
$$;

revoke execute on function public.accept_team_invite(uuid) from public, anon, authenticated;
grant execute on function public.accept_team_invite(uuid) to authenticated;

notify pgrst, 'reload schema';
