alter table public.tournament_rooms
add column if not exists league_id uuid references public.leagues(id) on delete cascade;

create unique index if not exists tournament_rooms_one_league_room_idx
on public.tournament_rooms(league_id) where league_id is not null;

with ranked_rooms as (
  select rooms.id, sessions.league_id,
    row_number() over (partition by sessions.league_id order by sessions.session_number) as room_rank
  from public.tournament_rooms rooms
  join public.league_sessions sessions on sessions.tournament_id = rooms.tournament_id
)
update public.tournament_rooms rooms
set league_id = ranked.league_id,
    posting_mode = 'conversation',
    conversation_closes_at = (leagues.end_date + 1)::timestamp at time zone 'America/Denver',
    conversation_closed_at = null,
    updated_at = now()
from ranked_rooms ranked
join public.leagues leagues on leagues.id = ranked.league_id
where rooms.id = ranked.id and ranked.room_rank = 1;

create or replace function public.can_access_tournament_room(p_room_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tournament_rooms rooms
    join public.tournaments tournaments on tournaments.id = rooms.tournament_id
    where rooms.id = p_room_id and rooms.archived_at is null and (
      tournaments.organizer_user_id = auth.uid()
      or tournaments.co_organizer_user_id = auth.uid()
      or exists (select 1 from public.tournament_players where tournament_id = tournaments.id and claimed_by_user_id = auth.uid())
      or (rooms.league_id is not null and public.can_access_league(rooms.league_id))
    )
  );
$$;

create or replace function public.can_manage_tournament_room(p_room_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tournament_rooms rooms
    join public.tournaments tournaments on tournaments.id = rooms.tournament_id
    where rooms.id = p_room_id and rooms.archived_at is null and (
      tournaments.organizer_user_id = auth.uid()
      or tournaments.co_organizer_user_id = auth.uid()
      or (rooms.league_id is not null and public.can_manage_league(rooms.league_id))
    )
  );
$$;

do $migration$
declare
  function_definition text;
  anchor text := '  update public.league_sessions';
  addition text := $sql$  if exists (select 1 from public.tournament_rooms where league_id = league_row.id) then
    delete from public.tournament_rooms where tournament_id = created_tournament_id;
  else
    update public.tournament_rooms
    set league_id = league_row.id,
        posting_mode = 'conversation',
        conversation_enabled_at = now(),
        conversation_enabled_by_user_id = league_row.organizer_user_id,
        conversation_closes_at = (league_row.end_date + 1)::timestamp at time zone 'America/Denver',
        conversation_closed_at = null,
        updated_at = now()
    where tournament_id = created_tournament_id;
  end if;

$sql$;
begin
  select pg_get_functiondef('public.start_league_session_tournament(uuid)'::regprocedure) into function_definition;
  if position(anchor in function_definition) = 0 then raise exception 'League session update anchor not found'; end if;
  function_definition := replace(function_definition, anchor, addition || anchor);
  execute function_definition;
end;
$migration$;

create or replace function public.close_completed_tournament_conversation()
returns trigger language plpgsql security definer set search_path = public as $$
declare affected_room_id uuid;
begin
  if new.status = 'completed' and old.status is distinct from new.status then
    update public.tournament_rooms set conversation_closes_at = now() + interval '7 days', updated_at = now()
    where tournament_id = new.id and league_id is null and posting_mode = 'conversation' and archived_at is null
    returning id into affected_room_id;
    if affected_room_id is not null then
      insert into public.tournament_room_moderation_actions (room_id, actor_user_id, action_type, reason)
      values (affected_room_id, auth.uid(), 'conversation_close_scheduled', 'Conversation scheduled to become read-only 7 days after tournament completion.');
    end if;
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
