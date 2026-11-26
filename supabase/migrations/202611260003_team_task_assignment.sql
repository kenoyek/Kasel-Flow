create function public.team_task_assignees(team uuid)
returns table (user_id uuid, label text)
language sql stable security definer set search_path = ''
as $$
  select m.user_id, m.label from public.team_members m
  where m.team_id = team and public.my_team_role(team) is not null
  order by m.label, m.user_id;
$$;

revoke execute on function public.team_task_assignees(uuid) from public, anon, authenticated;
grant execute on function public.team_task_assignees(uuid) to authenticated;

create function public.validate_team_task_assignees()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if exists (
    select 1 from jsonb_array_elements(new.workspace->'tasks') task
    where task->>'assignee' is not null
      and not exists (
        select 1 from public.team_members m
        where m.team_id = new.id and m.user_id::text = task->>'assignee'
      )
  ) then
    raise sqlstate '23514' using message = 'Task assignee must be a team member',
      constraint = 'team_task_assignee_membership';
  end if;
  return new;
end;
$$;

create trigger validate_team_task_assignees
before insert or update of workspace on public.team_workspaces
for each row execute function public.validate_team_task_assignees();

create function public.clear_removed_team_task_assignees()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.team_workspaces t
  set workspace = jsonb_set(t.workspace, '{tasks}', (
    select jsonb_agg(case when task->>'assignee' = old.user_id::text then task - 'assignee' else task end order by line)
    from jsonb_array_elements(t.workspace->'tasks') with ordinality items(task, line)
  )), revision = revision + 1
  where t.id = old.team_id and exists (
    select 1 from jsonb_array_elements(t.workspace->'tasks') task where task->>'assignee' = old.user_id::text
  );
  return old;
end;
$$;

create trigger clear_removed_team_task_assignees
after delete on public.team_members
for each row execute function public.clear_removed_team_task_assignees();

revoke execute on function public.validate_team_task_assignees(), public.clear_removed_team_task_assignees() from public, anon, authenticated;

-- Acquire the same team lock before membership removals and workspace writes.
create or replace function public.set_team_member_role(team uuid, member uuid, access_role text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if public.my_team_role(team) is distinct from 'owner' then raise sqlstate '42501' using message = 'Team owner required'; end if;
  perform 1 from public.team_workspaces where id = team for update;
  if access_role is null then
    delete from public.team_members where team_id = team and user_id = member and member_role <> 'owner';
  elsif access_role in ('editor','viewer') then
    update public.team_members set member_role = access_role where team_id = team and user_id = member and member_role <> 'owner';
  else
    raise sqlstate '22023' using message = 'Invalid team role';
  end if;
end;
$$;

create or replace function public.save_team_workspace(team uuid, expected_revision bigint, snapshot jsonb)
returns bigint language plpgsql security definer set search_path = ''
as $$
declare
  saved bigint;
begin
  if coalesce(public.my_team_role(team), '') not in ('owner','editor') then
    raise sqlstate '42501' using message = 'Team editing access required';
  end if;
  perform 1 from public.team_workspaces where id = team for update;
  if coalesce(public.my_team_role(team), '') not in ('owner','editor') then
    raise sqlstate '42501' using message = 'Team editing access required';
  end if;
  update public.team_workspaces set workspace = snapshot, revision = revision + 1
  where id = team and revision = expected_revision returning revision into saved;
  return saved;
end;
$$;
