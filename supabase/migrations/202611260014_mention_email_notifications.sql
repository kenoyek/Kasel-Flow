create extension if not exists pg_cron;
create extension if not exists pg_net;

revoke all on net.http_request_queue, net._http_response from public, anon, authenticated;

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

create function kasel_internal.process_mention_emails()
returns void language plpgsql security definer set search_path = ''
as $$
declare
  token text;
  delivery record;
  request bigint;
begin
  if not pg_try_advisory_xact_lock(925013,14) then return; end if;

  -- Only a confirmed rate-limit response is retried. A timeout can occur after delivery.
  update kasel_internal.mention_email_outbox o
  set completed_at=case when r.status_code=429 and o.attempts<5 then null else now() end,
      outcome=case
        when r.status_code=200 then 'sent'
        when r.status_code=429 and o.attempts<5 then null
        when r.status_code between 400 and 499 then 'rejected'
        else 'unknown'
      end,
      next_attempt_at=case when r.status_code=429 then now()+make_interval(mins=>5*o.attempts) else o.next_attempt_at end,
      request_id=case when r.status_code=429 and o.attempts<5 then null else o.request_id end
  from net._http_response r where o.request_id=r.id and o.completed_at is null;

  update kasel_internal.mention_email_outbox
  set completed_at=now(),outcome='unknown'
  where completed_at is null and submitted_at<now()-interval '10 minutes' and request_id is not null;

  update kasel_internal.mention_email_outbox
  set completed_at=now(),outcome='expired'
  where completed_at is null and request_id is null and created_at<now()-interval '24 hours';

  select decrypted_secret into token from vault.decrypted_secrets
  where name='kasel_postmark_server_token' and nullif(trim(decrypted_secret),'') is not null limit 1;
  if token is null then return; end if;

  for delivery in
    select o.comment_id,o.recipient,
      case when member.user_id is not null and account.email_confirmed_at is not null then account.email end as verified_email
    from kasel_internal.mention_email_outbox o
    join public.team_task_mentions mention on mention.comment_id=o.comment_id and mention.recipient=o.recipient
    left join public.team_members member on member.team_id=mention.team_id and member.user_id=o.recipient
    left join auth.users account on account.id=o.recipient
    where o.completed_at is null and o.request_id is null and o.next_attempt_at<=now()
    order by o.next_attempt_at
    limit 20 for update of o skip locked
  loop
    if delivery.verified_email is null then
      update kasel_internal.mention_email_outbox
      set completed_at=now(),outcome='recipient_unavailable'
      where comment_id=delivery.comment_id and recipient=delivery.recipient;
      continue;
    end if;
    request := net.http_post(
      url=>'https://api.postmarkapp.com/email',
      body=>jsonb_build_object(
        'From','Kasel OS <hello@kasel.digital>',
        'To',delivery.verified_email,
        'Subject','You were mentioned in Kasel OS',
        'TextBody','A teammate mentioned you in a task discussion. Sign in to https://os.kasel.digital/, open the team workspace, and check Notifications or My Work to read the mention.',
        'Tag','kasel-task-mention','TrackLinks','None','TrackOpens',false
      ),
      headers=>jsonb_build_object('Content-Type','application/json','Accept','application/json','X-Postmark-Server-Token',token),
      timeout_milliseconds=>10000
    );
    update kasel_internal.mention_email_outbox
    set request_id=request,submitted_at=now(),attempts=attempts+1
    where comment_id=delivery.comment_id and recipient=delivery.recipient;
  end loop;
end;
$$;

revoke execute on function kasel_internal.queue_mention_email(), kasel_internal.process_mention_emails() from public, anon, authenticated;

select cron.schedule('kasel-mention-emails','* * * * *',$job$select kasel_internal.process_mention_emails();$job$);
