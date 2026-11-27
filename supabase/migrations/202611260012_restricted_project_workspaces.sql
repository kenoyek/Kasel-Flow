alter table public.team_workspaces
  add column workspace_kind text not null default 'team',
  add constraint team_workspace_kind check (workspace_kind in ('team','restricted_project')),
  add constraint restricted_workspace_single_project check (
    workspace_kind <> 'restricted_project' or jsonb_array_length(workspace->'projects') = 1
  );

create function public.validate_restricted_project_workspace()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  project_id text := new.workspace->'projects'->0->>'id';
begin
  if project_id is null or project_id = '' or exists (
    select 1 from jsonb_array_elements(new.workspace->'tasks') task
    where task->>'project' is distinct from project_id
  ) then
    raise sqlstate '23514' using message = 'Tasks must belong to the restricted workspace project';
  end if;
  if tg_op = 'UPDATE' and project_id is distinct from old.workspace->'projects'->0->>'id' then
    raise sqlstate '23514' using message = 'The restricted workspace project cannot be replaced';
  end if;
  return new;
end;
$$;

create trigger validate_restricted_project_workspace
before insert or update of workspace on public.team_workspaces
for each row when (new.workspace_kind = 'restricted_project')
execute function public.validate_restricted_project_workspace();

revoke execute on function public.validate_restricted_project_workspace() from public, anon, authenticated;

create function public.create_restricted_project_workspace(project_name text, department_name text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  address text := public.my_verified_team_email();
  workspace_id uuid;
begin
  if actor is null or address is null then
    raise sqlstate '42501' using message = 'Verified email required';
  end if;
  if not public.can_use_private_workspace() then
    raise sqlstate '42501' using message = 'Workspace administrator required';
  end if;
  if department_name is null or department_name not in ('Development','Social Media','Content','Operations') then
    raise sqlstate '22023' using message = 'Choose a department';
  end if;
  insert into public.team_workspaces (name, workspace_kind, workspace)
  values (trim(project_name), 'restricted_project', jsonb_build_object(
    'projects', jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid(), 'name', trim(project_name), 'department', department_name, 'description', '', 'color', 'violet'
    )),
    'tasks', '[]'::jsonb
  )) returning id into workspace_id;
  insert into public.team_members values (workspace_id, actor, address, 'owner');
  return workspace_id;
end;
$$;

revoke execute on function public.create_restricted_project_workspace(text,text) from public, anon, authenticated;
grant execute on function public.create_restricted_project_workspace(text,text) to authenticated;

notify pgrst, 'reload schema';
