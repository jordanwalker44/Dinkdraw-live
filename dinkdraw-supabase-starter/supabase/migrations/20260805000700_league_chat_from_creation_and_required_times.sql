alter table public.tournament_rooms alter column tournament_id drop not null;

create or replace function public.create_league_room_after_league()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.tournament_rooms (
    tournament_id, league_id, created_by_user_id, posting_mode,
    conversation_enabled_at, conversation_enabled_by_user_id, conversation_closes_at
  ) values (
    null, new.id, new.organizer_user_id, 'conversation',
    now(), new.organizer_user_id,
    (new.end_date + 1)::timestamp at time zone 'America/Denver'
  ) on conflict (league_id) where league_id is not null do nothing;
  return new;
end;
$$;

drop trigger if exists create_league_room_after_insert on public.leagues;
create trigger create_league_room_after_insert after insert on public.leagues
for each row execute function public.create_league_room_after_league();

insert into public.tournament_rooms (
  tournament_id, league_id, created_by_user_id, posting_mode,
  conversation_enabled_at, conversation_enabled_by_user_id, conversation_closes_at
)
select null, leagues.id, leagues.organizer_user_id, 'conversation', now(), leagues.organizer_user_id,
  (leagues.end_date + 1)::timestamp at time zone 'America/Denver'
from public.leagues
where not exists (select 1 from public.tournament_rooms where league_id = leagues.id)
on conflict (league_id) where league_id is not null do nothing;

create or replace function public.can_access_tournament_room(p_room_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tournament_rooms rooms
    left join public.tournaments tournaments on tournaments.id = rooms.tournament_id
    where rooms.id = p_room_id and rooms.archived_at is null and (
      (rooms.league_id is null and (
        tournaments.organizer_user_id = auth.uid() or tournaments.co_organizer_user_id = auth.uid()
        or exists (select 1 from public.tournament_players where tournament_id = tournaments.id and claimed_by_user_id = auth.uid())
      ))
      or (rooms.league_id is not null and exists (
        select 1 from public.league_members members
        where members.league_id = rooms.league_id and members.user_id = auth.uid() and (
          members.member_type = 'regular' or exists (
            select 1 from public.league_session_attendance attendance
            where attendance.substitute_member_id = members.id and attendance.substitute_accepted_at is not null
          )
        )
      ))
      or (rooms.league_id is not null and public.can_manage_league(rooms.league_id))
    )
  );
$$;

create or replace function public.can_manage_tournament_room(p_room_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tournament_rooms rooms
    left join public.tournaments tournaments on tournaments.id = rooms.tournament_id
    where rooms.id = p_room_id and rooms.archived_at is null and (
      tournaments.organizer_user_id = auth.uid() or tournaments.co_organizer_user_id = auth.uid()
      or (rooms.league_id is not null and public.can_manage_league(rooms.league_id))
    )
  );
$$;

create or replace function public.can_post_tournament_announcement(p_room_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_manage_tournament_room(p_room_id);
$$;

do $migration$
declare function_definition text;
begin
  select pg_get_functiondef('public.create_rotating_doubles_league(uuid,text,date,integer,integer,integer,integer,text,text)'::regprocedure)
  into function_definition;
  function_definition := replace(function_definition,
    $$  if p_session_count < 1 or p_session_count > 52 then$$,
    $$  if nullif(btrim(p_default_time), '') is null then raise exception 'A start time is required so attendance reminders can be scheduled'; end if;

  if p_session_count < 1 or p_session_count > 52 then$$);
  execute function_definition;
end;
$migration$;

create or replace function public.update_league_session_schedule(
  p_session_id uuid, p_scheduled_date date, p_scheduled_time text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare target_league_id uuid;
begin
  select league_id into target_league_id from public.league_sessions
  where id = p_session_id and tournament_id is null for update;
  if target_league_id is null then raise exception 'This week cannot be rescheduled after its tournament is created'; end if;
  if not public.can_manage_league(target_league_id) then raise exception 'Only the league organizer can reschedule a week'; end if;
  if p_scheduled_date is null then raise exception 'Choose a date for this week'; end if;
  if nullif(btrim(p_scheduled_time), '') is null then raise exception 'Choose a start time so attendance reminders can be scheduled'; end if;
  update public.league_sessions set scheduled_date = p_scheduled_date,
    scheduled_time = btrim(p_scheduled_time), updated_at = now() where id = p_session_id;
end;
$$;

notify pgrst, 'reload schema';
