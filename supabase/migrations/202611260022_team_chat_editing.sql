alter table public.team_chat_messages add column edited_at timestamptz;

create function public.edit_team_chat_message(
  target_team uuid, target_message uuid, message_body text, expected_edited_at timestamptz
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  update public.team_chat_messages as message
  set body = trim(message_body),
      edited_at = case when message.body = trim(message_body) then message.edited_at else clock_timestamp() end
  where message.team_id = target_team
    and message.id = target_message
    and message.author_id = (select auth.uid())
    and message.edited_at is not distinct from expected_edited_at
    and public.my_team_role(target_team) in ('owner','editor');
  return found;
end;
$$;

revoke execute on function public.edit_team_chat_message(uuid,uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function public.edit_team_chat_message(uuid,uuid,text,timestamptz) to authenticated;
notify pgrst, 'reload schema';
