alter table public.tournament_room_messages
add column if not exists league_session_id uuid references public.league_sessions(id) on delete cascade;

create index if not exists tournament_room_messages_league_session_idx
on public.tournament_room_messages(league_session_id, created_at);

update public.tournament_room_messages messages
set league_session_id = sessions.id
from public.tournament_rooms rooms
join public.league_sessions sessions on sessions.tournament_id = rooms.tournament_id
where messages.room_id = rooms.id
  and rooms.league_id is not null
  and messages.message_type = 'announcement'
  and messages.league_session_id is null;

create or replace function public.can_access_tournament_room(p_room_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tournament_rooms rooms
    join public.tournaments tournaments on tournaments.id = rooms.tournament_id
    where rooms.id = p_room_id and rooms.archived_at is null and (
      tournaments.organizer_user_id = auth.uid()
      or tournaments.co_organizer_user_id = auth.uid()
      or (rooms.league_id is null and exists (
        select 1 from public.tournament_players
        where tournament_id = tournaments.id and claimed_by_user_id = auth.uid()
      ))
      or (rooms.league_id is not null and exists (
        select 1 from public.league_members members
        where members.league_id = rooms.league_id and members.user_id = auth.uid() and (
          members.member_type = 'regular'
          or exists (
            select 1 from public.league_session_attendance attendance
            where attendance.substitute_member_id = members.id
              and attendance.substitute_accepted_at is not null
          )
        )
      ))
    )
  );
$$;

create or replace function public.can_view_tournament_room_message(p_message_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.tournament_room_messages messages
    join public.tournament_rooms rooms on rooms.id = messages.room_id
    where messages.id = p_message_id
      and public.can_access_tournament_room(rooms.id)
      and (
        rooms.league_id is null
        or public.can_manage_league(rooms.league_id)
        or exists (
          select 1 from public.league_members regular
          where regular.league_id = rooms.league_id
            and regular.user_id = auth.uid()
            and regular.member_type = 'regular'
        )
        or (
          messages.message_type = 'announcement'
          and messages.league_session_id is not null
          and exists (
            select 1
            from public.league_members substitute
            join public.league_session_attendance attendance
              on attendance.substitute_member_id = substitute.id
            where substitute.league_id = rooms.league_id
              and substitute.user_id = auth.uid()
              and substitute.member_type = 'substitute'
              and attendance.session_id = messages.league_session_id
              and attendance.substitute_accepted_at is not null
          )
        )
      )
  );
$$;

drop policy if exists "Eligible users can view tournament room messages" on public.tournament_room_messages;
create policy "Eligible users can view tournament room messages"
on public.tournament_room_messages for select to authenticated
using (public.can_view_tournament_room_message(id));

create or replace function public.post_tournament_announcement(
  p_room_id uuid,
  p_body text,
  p_league_session_id uuid default null
)
returns table (id uuid, room_id uuid, sender_user_id uuid, message_type text, body text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare clean_body text; target_league_id uuid;
begin
  if auth.uid() is null or not public.can_post_tournament_announcement(p_room_id) then raise exception 'Not authorized'; end if;
  clean_body := btrim(coalesce(p_body, ''));
  if char_length(clean_body) < 1 or char_length(clean_body) > 2000 then raise exception 'Announcement must be between 1 and 2000 characters'; end if;
  select league_id into target_league_id from public.tournament_rooms where tournament_rooms.id = p_room_id;
  if target_league_id is not null and not exists (
    select 1 from public.league_sessions where id = p_league_session_id and league_id = target_league_id
  ) then raise exception 'Choose the league week for this announcement'; end if;
  return query insert into public.tournament_room_messages (room_id, sender_user_id, message_type, body, league_session_id)
  values (p_room_id, auth.uid(), 'announcement', clean_body, case when target_league_id is null then null else p_league_session_id end)
  returning tournament_room_messages.id, tournament_room_messages.room_id, tournament_room_messages.sender_user_id,
    tournament_room_messages.message_type, tournament_room_messages.body, tournament_room_messages.created_at;
end;
$$;

revoke all on function public.post_tournament_announcement(uuid, text, uuid) from public, anon;
grant execute on function public.post_tournament_announcement(uuid, text, uuid) to authenticated, service_role;

do $migration$
declare function_definition text;
begin
  select pg_get_functiondef('public.post_tournament_room_message(uuid,text)'::regprocedure) into function_definition;
  function_definition := replace(function_definition,
    $$  clean_body := btrim(coalesce(p_body, ''));$$,
    $$  if exists (
    select 1 from public.tournament_rooms rooms
    where rooms.id = p_room_id and rooms.league_id is not null
      and not public.can_manage_league(rooms.league_id)
      and not exists (
        select 1 from public.league_members members
        where members.league_id = rooms.league_id and members.user_id = auth.uid() and members.member_type = 'regular'
      )
  ) then raise exception 'Substitutes can view assigned-week announcements but cannot access the league group conversation'; end if;

  clean_body := btrim(coalesce(p_body, ''));$$);
  execute function_definition;
end;
$migration$;

notify pgrst, 'reload schema';
