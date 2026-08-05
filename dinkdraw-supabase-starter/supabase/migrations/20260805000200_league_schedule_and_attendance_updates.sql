create or replace function public.update_league_session_schedule(
  p_session_id uuid,
  p_scheduled_date date,
  p_scheduled_time text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_league_id uuid;
begin
  select league_id into target_league_id
  from public.league_sessions
  where id = p_session_id and tournament_id is null
  for update;

  if target_league_id is null then
    raise exception 'This week cannot be rescheduled after its tournament is created';
  end if;
  if not public.can_manage_league(target_league_id) then
    raise exception 'Only the league organizer can reschedule a week';
  end if;
  if p_scheduled_date is null then
    raise exception 'Choose a date for this week';
  end if;

  update public.league_sessions
  set scheduled_date = p_scheduled_date,
      scheduled_time = nullif(btrim(p_scheduled_time), ''),
      updated_at = now()
  where id = p_session_id;
end;
$$;

revoke all on function public.update_league_session_schedule(uuid, date, text) from public, anon;
grant execute on function public.update_league_session_schedule(uuid, date, text) to authenticated;

create or replace function public.set_my_league_attendance(
  p_session_id uuid,
  p_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  member_id uuid;
begin
  if p_status not in ('playing', 'sub_needed', 'absent') then
    raise exception 'Attendance must be Playing, Need Sub, or Absence without substitute';
  end if;

  select league_members.id into member_id
  from public.league_sessions
  join public.league_members on league_members.league_id = league_sessions.league_id
  where league_sessions.id = p_session_id
    and league_sessions.tournament_id is null
    and league_sessions.status in ('scheduled', 'attendance_open', 'teams_published')
    and league_members.user_id = auth.uid()
    and league_members.member_type = 'regular';

  if member_id is null then raise exception 'You are not a regular player in this league'; end if;

  update public.league_session_attendance
  set attendance_status = p_status,
      substitute_member_id = case when p_status = 'sub_needed' then substitute_member_id else null end,
      requested_by_user_id = auth.uid(),
      note = nullif(btrim(p_note), ''),
      substitute_accepted_at = null,
      organizer_confirmed_at = null,
      updated_at = now()
  where session_id = p_session_id and regular_member_id = member_id;
end;
$$;

create or replace function public.respond_to_substitute_invitation(
  p_session_id uuid,
  p_regular_member_id uuid,
  p_accept boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  responding_substitute_id uuid;
begin
  select substitute.id into responding_substitute_id
  from public.league_session_attendance
  join public.league_members substitute on substitute.id = league_session_attendance.substitute_member_id
  join public.league_sessions session on session.id = league_session_attendance.session_id
  where league_session_attendance.session_id = p_session_id
    and league_session_attendance.regular_member_id = p_regular_member_id
    and substitute.user_id = auth.uid()
    and league_session_attendance.attendance_status = 'sub_invited'
    and session.tournament_id is null;

  if responding_substitute_id is null then raise exception 'Substitute invitation not found'; end if;

  insert into public.league_substitute_responses (
    session_id, regular_member_id, substitute_member_id, responded_by_user_id, accepted
  ) values (
    p_session_id, p_regular_member_id, responding_substitute_id, auth.uid(), p_accept
  );

  update public.league_session_attendance
  set attendance_status = case when p_accept then 'playing' else 'sub_needed' end,
      substitute_member_id = case when p_accept then substitute_member_id else null end,
      substitute_accepted_at = case when p_accept then now() else null end,
      organizer_confirmed_at = case when p_accept then now() else null end,
      updated_at = now()
  where session_id = p_session_id and regular_member_id = p_regular_member_id;
end;
$$;

revoke all on function public.set_my_league_attendance(uuid, text, text) from public, anon;
revoke all on function public.respond_to_substitute_invitation(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_my_league_attendance(uuid, text, text) to authenticated;
grant execute on function public.respond_to_substitute_invitation(uuid, uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
