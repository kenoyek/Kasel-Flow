create table public.team_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 100),
  workspace jsonb not null default '{"projects":[],"tasks":[]}',
  revision bigint not null default 1,
  constraint team_workspace_shape check (
    jsonb_typeof(workspace) = 'object'
    and workspace ?& array['projects', 'tasks']
    and workspace - array['projects', 'tasks'] = '{}'::jsonb
    and jsonb_typeof(workspace->'projects') = 'array'
    and jsonb_typeof(workspace->'tasks') = 'array'
    and octet_length(workspace::text) <= 2097152
  )
);

create table public.team_members (
  team_id uuid not null references public.team_workspaces on delete cascade,
  user_id uuid not null references auth.users on delete restrict,
  label text not null,
  member_role text not null check (member_role in ('owner', 'editor', 'viewer')),
  primary key (team_id, user_id)
);
create index team_members_user_id on public.team_members (user_id);

create table public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.team_workspaces on delete cascade,
  email text not null,
  member_role text not null check (member_role in ('editor', 'viewer')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  unique (team_id, email)
);
create index team_invites_email on public.team_invites (email);

alter table public.team_workspaces enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invites enable row level security;
revoke all on public.team_workspaces, public.team_members, public.team_invites from public, anon, authenticated;
grant select on public.team_workspaces, public.team_members, public.team_invites to authenticated;

create function public.my_team_role(team uuid)
returns text language sql stable security definer set search_path = ''
as $$
  select member_role from public.team_members where team_id = team and user_id = (select auth.uid());
$$;

create function public.my_verified_team_email()
returns text language sql stable security definer set search_path = ''
as $$
  select lower(email) from auth.users where id = (select auth.uid()) and email_confirmed_at is not null;
$$;

create policy "Members can read team" on public.team_workspaces
for select to authenticated using (public.my_team_role(id) is not null);

create policy "Members can see own membership and owners can manage roster" on public.team_members
for select to authenticated using (user_id = (select auth.uid()) or public.my_team_role(team_id) = 'owner');

create policy "Owners see issued invites and recipients see their active invites" on public.team_invites
for select to authenticated using (
  public.my_team_role(team_id) = 'owner' or (email = (select public.my_verified_team_email()) and expires_at > now())
);

create function public.create_team_workspace(team_name text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  address text := public.my_verified_team_email();
  team uuid;
begin
  if actor is null or address is null then raise sqlstate '42501' using message = 'Verified email required'; end if;
  insert into public.team_workspaces (name) values (trim(team_name)) returning id into team;
  insert into public.team_members values (team, actor, address, 'owner');
  return team;
end;
$$;

create function public.invite_team_member(team uuid, recipient text, access_role text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  address text := lower(trim(recipient));
begin
  if public.my_team_role(team) is distinct from 'owner' then raise sqlstate '42501' using message = 'Team owner required'; end if;
  if address is null or char_length(address) > 254 or address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise sqlstate '22023' using message = 'Enter a valid email';
  end if;
  if exists (select 1 from public.team_members where team_id = team and label = address) then
    raise sqlstate '22023' using message = 'This email is already a team member';
  end if;
  insert into public.team_invites (team_id,email,member_role) values (team,address,access_role)
  on conflict (team_id,email) do update set member_role = excluded.member_role, expires_at = excluded.expires_at;
end;
$$;

create function public.pending_team_invites()
returns table (id uuid, team_name text, member_role text, expires_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select i.id, t.name, i.member_role, i.expires_at
  from public.team_invites i join public.team_workspaces t on t.id = i.team_id
  where i.email = (select public.my_verified_team_email()) and i.expires_at > now()
  order by i.expires_at;
$$;

create function public.accept_team_invite(invitation uuid)
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

create function public.cancel_team_invite(invitation uuid)
returns void language sql security definer set search_path = ''
as $$
  delete from public.team_invites where id = invitation and public.my_team_role(team_id) = 'owner';
$$;

create function public.set_team_member_role(team uuid, member uuid, access_role text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if public.my_team_role(team) is distinct from 'owner' then raise sqlstate '42501' using message = 'Team owner required'; end if;
  if access_role is null then
    delete from public.team_members where team_id = team and user_id = member and member_role <> 'owner';
  elsif access_role in ('editor','viewer') then
    update public.team_members set member_role = access_role where team_id = team and user_id = member and member_role <> 'owner';
  else
    raise sqlstate '22023' using message = 'Invalid team role';
  end if;
end;
$$;

create function public.save_team_workspace(team uuid, expected_revision bigint, snapshot jsonb)
returns bigint language plpgsql security definer set search_path = ''
as $$
declare
  saved bigint;
begin
  if coalesce(public.my_team_role(team), '') not in ('owner','editor') then
    raise sqlstate '42501' using message = 'Team editing access required';
  end if;
  update public.team_workspaces set workspace = snapshot, revision = revision + 1
  where id = team and revision = expected_revision returning revision into saved;
  return saved;
end;
$$;

revoke execute on function public.my_team_role(uuid), public.my_verified_team_email(), public.create_team_workspace(text),
  public.invite_team_member(uuid,text,text), public.pending_team_invites(), public.accept_team_invite(uuid),
  public.cancel_team_invite(uuid), public.set_team_member_role(uuid,uuid,text),
  public.save_team_workspace(uuid,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.my_team_role(uuid), public.my_verified_team_email(), public.create_team_workspace(text),
  public.invite_team_member(uuid,text,text), public.pending_team_invites(), public.accept_team_invite(uuid),
  public.cancel_team_invite(uuid), public.set_team_member_role(uuid,uuid,text),
  public.save_team_workspace(uuid,bigint,jsonb) to authenticated;
