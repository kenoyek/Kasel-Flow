create table public.private_workspaces (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  workspace jsonb not null,
  revision bigint not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now(),
  constraint workspace_shape check (
    jsonb_typeof(workspace) = 'object'
    and workspace ?& array['projects', 'tasks', 'development', 'creative', 'business', 'automation']
    and jsonb_typeof(workspace->'projects') = 'array'
    and jsonb_typeof(workspace->'tasks') = 'array'
    and jsonb_typeof(workspace->'development') = 'array'
    and jsonb_typeof(workspace->'creative') = 'array'
    and jsonb_typeof(workspace->'business') = 'object'
    and jsonb_typeof(workspace->'automation') = 'object'
    and octet_length(workspace::text) <= 2097152
  )
);

alter table public.private_workspaces enable row level security;
revoke all on public.private_workspaces from public, anon, authenticated;
grant select, insert (owner_id, workspace), update (workspace) on public.private_workspaces to authenticated;

create policy "Read own workspace" on public.private_workspaces
  for select to authenticated using ((select auth.uid()) = owner_id);

create policy "Create own workspace" on public.private_workspaces
  for insert to authenticated with check ((select auth.uid()) = owner_id);

create policy "Update own workspace" on public.private_workspaces
  for update to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create function public.increment_private_workspace_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.increment_private_workspace_revision() from public, anon, authenticated;

create trigger private_workspace_revision
before update on public.private_workspaces
for each row execute function public.increment_private_workspace_revision();
