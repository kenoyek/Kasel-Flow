create table public.team_chat_reactions (
  team_id uuid not null,
  message_id uuid not null,
  user_id uuid not null,
  emoji text not null check (emoji in ('👍','❤️','🎉','👀','✅')),
  active boolean not null default true,
  primary key (team_id,message_id,user_id,emoji),
  foreign key (team_id,message_id) references public.team_chat_messages(team_id,id) on delete cascade,
  foreign key (team_id,user_id) references public.team_members(team_id,user_id) on delete cascade
);

alter table public.team_chat_reactions enable row level security;
revoke all on public.team_chat_reactions from public, anon, authenticated;
grant select on public.team_chat_reactions to authenticated;
create policy "Members read team chat reactions" on public.team_chat_reactions for select to authenticated
using (public.my_team_role(team_id) is not null);

create function public.team_chat_reaction_counts(target_team uuid, message_ids uuid[])
returns table(message_id uuid, emoji text, total integer, mine boolean)
language sql stable security invoker set search_path = ''
as $$
  select reaction.message_id, reaction.emoji, count(*)::integer,
    bool_or(reaction.user_id = (select auth.uid()))
  from public.team_chat_reactions reaction
  where reaction.team_id = target_team and reaction.active and reaction.message_id = any(message_ids)
  group by reaction.message_id, reaction.emoji;
$$;

create function public.set_team_chat_reaction(target_team uuid, target_message uuid, reaction_emoji text, enabled boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  perform 1 from public.team_workspaces where id = target_team for share;
  perform 1 from public.team_members
  where team_id = target_team and user_id = actor and member_role in ('owner','editor')
  for share;
  if not found then
    raise sqlstate '42501' using message = 'Team editing access required';
  end if;

  if enabled then
    insert into public.team_chat_reactions(team_id,message_id,user_id,emoji)
    values(target_team,target_message,actor,reaction_emoji)
    on conflict (team_id,message_id,user_id,emoji) do update set active = true
    where not team_chat_reactions.active;
  else
    update public.team_chat_reactions set active = false
    where team_id = target_team and message_id = target_message and user_id = actor
      and emoji = reaction_emoji and active;
  end if;
end;
$$;

revoke execute on function public.team_chat_reaction_counts(uuid,uuid[]), public.set_team_chat_reaction(uuid,uuid,text,boolean) from public, anon, authenticated;
grant execute on function public.team_chat_reaction_counts(uuid,uuid[]), public.set_team_chat_reaction(uuid,uuid,text,boolean) to authenticated;
alter publication supabase_realtime add table public.team_chat_reactions;
notify pgrst, 'reload schema';
