create table public.team_activity (
  team_id uuid not null references public.team_workspaces on delete cascade,
  revision bigint not null,
  occurred_at timestamptz not null default statement_timestamp(),
  actor_label text,
  event_type text not null check (event_type in ('created','saved')),
  projects jsonb not null default '{}',
  tasks jsonb not null default '{}',
  primary key (team_id, revision)
);

alter table public.team_activity enable row level security;
revoke all on public.team_activity from public, anon, authenticated;
grant select on public.team_activity to authenticated;

create policy "Team members can read activity" on public.team_activity
for select to authenticated using (public.my_team_role(team_id) is not null);

create function public.team_activity_counts(before_items jsonb, after_items jsonb)
returns jsonb
language sql immutable set search_path = ''
as $$
  with prior as (
    select coalesce(item->>'id', item::text) as id, jsonb_agg(item order by item) as versions
    from jsonb_array_elements(before_items) item group by 1
  ), current_items as (
    select coalesce(item->>'id', item::text) as id, jsonb_agg(item order by item) as versions
    from jsonb_array_elements(after_items) item group by 1
  )
  select jsonb_build_object(
    'added', count(*) filter (where prior.versions is null),
    'removed', count(*) filter (where current_items.versions is null),
    'updated', count(*) filter (where prior.versions is not null and current_items.versions is not null
      and prior.versions <> current_items.versions)
  )
  from prior full join current_items on prior.id = current_items.id;
$$;

create function public.record_team_activity()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.team_activity(team_id,revision,actor_label,event_type)
    values (new.id,new.revision,public.my_verified_team_email(),'created');
  elsif new.revision is distinct from old.revision and new.workspace is distinct from old.workspace then
    insert into public.team_activity(team_id,revision,actor_label,event_type,projects,tasks)
    values (new.id,new.revision,public.my_verified_team_email(),'saved',
      public.team_activity_counts(old.workspace->'projects',new.workspace->'projects'),
      public.team_activity_counts(old.workspace->'tasks',new.workspace->'tasks'));
  end if;
  return new;
end;
$$;

create trigger record_team_activity
after insert or update of workspace on public.team_workspaces
for each row execute function public.record_team_activity();

revoke execute on function public.team_activity_counts(jsonb,jsonb), public.record_team_activity()
from public, anon, authenticated;
