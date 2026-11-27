alter table public.team_chat_messages
  add column reply_to uuid,
  add constraint team_chat_message_room_id unique (team_id,id),
  add constraint team_chat_reply_parent foreign key (team_id,reply_to)
    references public.team_chat_messages(team_id,id) on delete set null (reply_to);

create index team_chat_reply_lookup on public.team_chat_messages(team_id,reply_to)
  where reply_to is not null;

create function public.reply_to_team_chat_message(target_team uuid, target_message uuid, message_body text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  sender text;
  message_id uuid;
begin
  if coalesce(public.my_team_role(target_team),'') not in ('owner','editor') then
    raise sqlstate '42501' using message = 'Team editing access required';
  end if;
  perform 1 from public.team_workspaces where id=target_team for share;
  select label into sender from public.team_members
  where team_id=target_team and user_id=actor and member_role in ('owner','editor');
  if sender is null then raise sqlstate '42501' using message = 'Team editing access required'; end if;
  insert into public.team_chat_messages(team_id,author_id,author_label,body,reply_to)
  values(target_team,actor,sender,trim(message_body),target_message) returning id into message_id;
  return message_id;
end;
$$;

create or replace function public.post_team_chat_message(target_team uuid, message_body text)
returns uuid
language sql security definer set search_path = ''
as $$
  select public.reply_to_team_chat_message(target_team,null,message_body);
$$;

revoke execute on function public.reply_to_team_chat_message(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.reply_to_team_chat_message(uuid,uuid,text) to authenticated;
notify pgrst, 'reload schema';
