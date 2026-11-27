create table public.team_deliverable_reviews (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.team_workspaces on delete cascade,
  task_id text not null,
  task_title text not null,
  requester_id uuid not null,
  requester_label text not null,
  reviewer_id uuid not null,
  reviewer_label text not null,
  title text not null check (char_length(trim(title)) between 1 and 120),
  deliverable_url text not null check (char_length(deliverable_url) <= 2000 and deliverable_url ~ '^https://[^/?#@[:space:]]+([/?#][^[:space:]]*)?$'),
  instructions text not null default '' check (char_length(instructions) <= 4000),
  status text not null default 'pending' check (status in ('pending','approved','changes_requested')),
  decision_note text not null default '' check (char_length(decision_note) <= 4000),
  created_at timestamptz not null default statement_timestamp(),
  decided_at timestamptz
);
create index team_deliverable_reviews_task on public.team_deliverable_reviews(team_id,task_id,created_at desc);
create index team_deliverable_reviews_inbox on public.team_deliverable_reviews(team_id,reviewer_id,created_at desc) where status='pending';

alter table public.team_deliverable_reviews enable row level security;
revoke all on public.team_deliverable_reviews from public, anon, authenticated;
grant select on public.team_deliverable_reviews to authenticated;

create policy "Requesters reviewers and owners read reviews" on public.team_deliverable_reviews
for select to authenticated using (
  public.my_team_role(team_id) = 'owner' or (
    public.my_team_role(team_id) is not null and (select auth.uid()) in (requester_id,reviewer_id)
  )
);

create function public.request_team_deliverable_review(target_team uuid, target_task text, target_reviewer uuid, review_title text, review_url text, review_instructions text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  requester text;
  reviewer text;
  saved_task_title text;
  review_id uuid;
begin
  if coalesce(public.my_team_role(target_team),'') not in ('owner','editor') then
    raise sqlstate '42501' using message = 'Team editing access required';
  end if;
  perform 1 from public.team_workspaces where id=target_team for share;
  select label into requester from public.team_members
  where team_id=target_team and user_id=actor and member_role in ('owner','editor');
  if requester is null then raise sqlstate '42501' using message = 'Team editing access required'; end if;

  select label into reviewer from public.team_members where team_id=target_team and user_id=target_reviewer and user_id<>actor;
  if reviewer is null then raise sqlstate '22023' using message = 'Choose another team member as reviewer'; end if;
  select task->>'title' into saved_task_title from public.team_workspaces
  cross join lateral jsonb_array_elements(workspace->'tasks') task where id=target_team and task->>'id'=target_task;
  if saved_task_title is null then raise sqlstate '22023' using message = 'Save the task before requesting review'; end if;

  insert into public.team_deliverable_reviews(team_id,task_id,task_title,requester_id,requester_label,reviewer_id,reviewer_label,title,deliverable_url,instructions)
  values(target_team,target_task,saved_task_title,actor,requester,target_reviewer,reviewer,trim(review_title),trim(review_url),trim(coalesce(review_instructions,'')))
  returning id into review_id;
  return review_id;
end;
$$;

create function public.decide_team_deliverable_review(target_team uuid, target_review uuid, decision text, note text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if public.my_team_role(target_team) is null then raise sqlstate '42501' using message = 'Team membership required'; end if;
  perform 1 from public.team_workspaces where id=target_team for share;
  if public.my_team_role(target_team) is null then raise sqlstate '42501' using message = 'Team membership required'; end if;
  if decision is null or decision not in ('approved','changes_requested') then raise sqlstate '22023' using message = 'Invalid decision'; end if;
  if decision='changes_requested' and trim(coalesce(note,''))='' then raise sqlstate '22023' using message = 'Explain the changes requested'; end if;
  update public.team_deliverable_reviews
  set status=decision,decision_note=trim(coalesce(note,'')),decided_at=statement_timestamp()
  where id=target_review and team_id=target_team and reviewer_id=auth.uid() and status='pending';
  return found;
end;
$$;

revoke execute on function public.request_team_deliverable_review(uuid,text,uuid,text,text,text), public.decide_team_deliverable_review(uuid,uuid,text,text)
from public, anon, authenticated;
grant execute on function public.request_team_deliverable_review(uuid,text,uuid,text,text,text), public.decide_team_deliverable_review(uuid,uuid,text,text)
to authenticated;

notify pgrst, 'reload schema';
