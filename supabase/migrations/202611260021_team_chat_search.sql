create function public.search_team_chat(target_team uuid, search_text text)
returns table(id uuid, author_id uuid, author_label text, body text, created_at timestamptz)
language sql stable security invoker set search_path = ''
as $$
  select message.id, message.author_id, message.author_label,
    substring(message.body from greatest(1, strpos(lower(message.body), lower(trim(search_text))) - 60) for 240),
    message.created_at
  from public.team_chat_messages message
  where message.team_id = target_team
    and char_length(trim(search_text)) between 2 and 120
    and strpos(lower(message.body), lower(trim(search_text))) > 0
  order by message.created_at desc, message.id desc
  limit 26;
$$;

revoke execute on function public.search_team_chat(uuid,text) from public, anon, authenticated;
grant execute on function public.search_team_chat(uuid,text) to authenticated;
notify pgrst, 'reload schema';
