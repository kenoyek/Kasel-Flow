create function public.team_chat_profiles(target_team uuid)
returns table (user_id uuid, label text, display_name text)
language sql stable security definer set search_path = ''
as $$
  select m.user_id,m.label,
    case when jsonb_typeof(u.raw_user_meta_data->'display_name') = 'string'
      then nullif(left(trim(u.raw_user_meta_data->>'display_name'),80),'')
    end
  from public.team_members m
  join auth.users u on u.id=m.user_id
  where m.team_id=target_team and public.my_team_role(target_team) is not null;
$$;

revoke execute on function public.team_chat_profiles(uuid) from public, anon, authenticated;
grant execute on function public.team_chat_profiles(uuid) to authenticated;

notify pgrst, 'reload schema';
