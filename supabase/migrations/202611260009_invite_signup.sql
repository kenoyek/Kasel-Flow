create function public.valid_team_signup_invitation(invitation uuid, recipient text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.team_invites
    where id = invitation and email = lower(trim(recipient)) and expires_at > now()
  );
$$;

revoke execute on function public.valid_team_signup_invitation(uuid,text) from public, anon, authenticated;
grant execute on function public.valid_team_signup_invitation(uuid,text) to anon, authenticated;

-- Enable this function as the Before User Created hook in Supabase Auth.
create function public.require_team_invitation_on_signup(event jsonb)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  token text := event->'user'->'user_metadata'->>'kasel_invite';
  address text := event->'user'->>'email';
begin
  if token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    if public.valid_team_signup_invitation(token::uuid, address) then
      return '{}'::jsonb;
    end if;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code',403,'message','A valid invitation for this email is required.'
  ));
end;
$$;

revoke execute on function public.require_team_invitation_on_signup(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.require_team_invitation_on_signup(jsonb) to supabase_auth_admin;

notify pgrst, 'reload schema';
