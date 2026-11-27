create extension if not exists http with schema extensions;

create or replace function kasel_internal.process_mention_emails()
returns void language plpgsql security definer set search_path = ''
as $$
declare
  token text;
  delivery record;
  response_code integer;
  request_body jsonb;
begin
  if not pg_try_advisory_xact_lock(925013,14) then return; end if;

  update kasel_internal.mention_email_outbox
  set completed_at=now(),outcome='expired'
  where completed_at is null and created_at<now()-interval '24 hours';

  select decrypted_secret into token from vault.decrypted_secrets
  where name='kasel_postmark_server_token' and nullif(trim(decrypted_secret),'') is not null limit 1;
  if token is null then return; end if;
  perform set_config('http.curlopt_timeout_ms','8000',true);

  for delivery in
    select o.comment_id,o.recipient,o.attempts+1 as next_attempt,
      case when member.user_id is not null and account.email_confirmed_at is not null then account.email end as verified_email
    from kasel_internal.mention_email_outbox o
    join public.team_task_mentions mention on mention.comment_id=o.comment_id and mention.recipient=o.recipient
    left join public.team_members member on member.team_id=mention.team_id and member.user_id=o.recipient
    left join auth.users account on account.id=o.recipient
    where o.completed_at is null and o.request_id is null and o.next_attempt_at<=now()
    order by o.next_attempt_at
    limit 5 for update of o skip locked
  loop
    if delivery.verified_email is null then
      update kasel_internal.mention_email_outbox
      set completed_at=now(),outcome='recipient_unavailable'
      where comment_id=delivery.comment_id and recipient=delivery.recipient;
      continue;
    end if;

    request_body := jsonb_build_object(
      'From','Kasel OS <hello@kasel.digital>',
      'To',delivery.verified_email,
      'Subject','You were mentioned in Kasel OS',
      'TextBody','A teammate mentioned you in a task discussion. Sign in to https://os.kasel.digital/, open the team workspace, and check Notifications or My Work to read the mention.',
      'Tag','kasel-task-mention','TrackLinks','None','TrackOpens',false
    );
    response_code := null;
    begin
      -- Keep the provider credential in memory, outside pg_net's shared HTTP queue.
      select response.status into response_code from extensions.http((
        'POST','https://api.postmarkapp.com/email',
        array[('X-Postmark-Server-Token',token)::extensions.http_header],
        'application/json',request_body::text
      )::extensions.http_request) response;
    exception when others then
      -- A network failure can occur after delivery. Do not repeat an uncertain send.
      response_code := null;
    end;

    update kasel_internal.mention_email_outbox
    set submitted_at=now(),attempts=delivery.next_attempt,
      next_attempt_at=case when response_code=429 then now()+make_interval(mins=>5*delivery.next_attempt) else next_attempt_at end,
      completed_at=case when response_code=429 and delivery.next_attempt<5 then null else now() end,
      outcome=case
        when response_code=200 then 'sent'
        when response_code=429 and delivery.next_attempt<5 then null
        when response_code between 400 and 499 then 'rejected'
        else 'unknown'
      end
    where comment_id=delivery.comment_id and recipient=delivery.recipient;
  end loop;
end;
$$;

revoke execute on function kasel_internal.process_mention_emails() from public, anon, authenticated;

select cron.schedule('kasel-mention-emails','* * * * *',$job$select kasel_internal.process_mention_emails();$job$);
