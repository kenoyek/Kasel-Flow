create extension if not exists pg_cron;

create schema kasel_internal;
revoke all on schema kasel_internal from public, anon, authenticated;

create table kasel_internal.mention_email_outbox (
  comment_id uuid not null,
  recipient uuid not null,
  created_at timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  submitted_at timestamptz,
  completed_at timestamptz,
  request_id bigint,
  attempts integer not null default 0,
  outcome text check (outcome in ('sent','rejected','unknown','expired','recipient_unavailable')),
  primary key (comment_id, recipient),
  foreign key (comment_id, recipient) references public.team_task_mentions on delete cascade
);
create index mention_email_outbox_due on kasel_internal.mention_email_outbox(next_attempt_at)
where completed_at is null and request_id is null;

create function kasel_internal.queue_mention_email()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into kasel_internal.mention_email_outbox (comment_id, recipient)
  values (new.comment_id, new.recipient);
  return new;
end;
$$;

create trigger queue_mention_email after insert on public.team_task_mentions
for each row execute function kasel_internal.queue_mention_email();

revoke execute on function kasel_internal.queue_mention_email() from public, anon, authenticated;
