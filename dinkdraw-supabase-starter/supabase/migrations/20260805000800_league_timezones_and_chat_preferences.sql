alter table public.leagues
  add column if not exists time_zone text not null default 'America/Denver';

create or replace function public.validate_league_time_zone()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.time_zone) then
    raise exception 'Choose a valid timezone';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_league_time_zone_before_write on public.leagues;
create trigger validate_league_time_zone_before_write
before insert or update of time_zone on public.leagues
for each row execute function public.validate_league_time_zone();

alter table public.tournament_room_user_state
  add column if not exists notification_preference text not null default 'all'
  check (notification_preference in ('all', 'announcements_only', 'off'));

update public.tournament_room_user_state
set notification_preference = case
  when is_muted or not push_enabled then 'off'
  else 'all'
end;

create or replace function public.sync_league_attendance_push_reminders()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  start_at timestamptz;
  reminder integer;
  league_time_zone text;
begin
  select time_zone into league_time_zone from public.leagues where id = new.league_id;
  start_at := public.tournament_start_at(new.scheduled_date, new.scheduled_time, coalesce(league_time_zone, 'America/Denver'));

  if start_at is null or new.status in ('in_progress', 'completed', 'cancelled') then
    delete from public.league_attendance_push_reminders where session_id = new.id and sent_at is null;
    return new;
  end if;

  foreach reminder in array array[48, 24] loop
    insert into public.league_attendance_push_reminders (session_id, reminder_hours, scheduled_for, updated_at)
    values (new.id, reminder, start_at - make_interval(hours => reminder), now())
    on conflict (session_id, reminder_hours) do update set
      scheduled_for = excluded.scheduled_for, delivery_started_at = null,
      skipped_at = null, skip_reason = null, recipient_count = null, updated_at = now()
    where public.league_attendance_push_reminders.sent_at is null;
  end loop;
  return new;
end;
$$;

create or replace function public.reschedule_league_reminders_for_time_zone()
returns trigger language plpgsql security definer set search_path = public as $$
declare session_row public.league_sessions%rowtype;
begin
  if new.time_zone is distinct from old.time_zone then
    for session_row in select * from public.league_sessions where league_id = new.id loop
      perform public.sync_league_attendance_push_reminders_for_session(session_row.id);
    end loop;
    update public.tournament_rooms
    set conversation_closes_at = (new.end_date + 1)::timestamp at time zone new.time_zone,
        updated_at = now()
    where league_id = new.id;
  end if;
  return new;
end;
$$;

create or replace function public.sync_league_attendance_push_reminders_for_session(p_session_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  session_row public.league_sessions%rowtype;
  start_at timestamptz;
  reminder integer;
  league_time_zone text;
begin
  select * into session_row from public.league_sessions where id = p_session_id;
  if not found then return; end if;
  select time_zone into league_time_zone from public.leagues where id = session_row.league_id;
  start_at := public.tournament_start_at(session_row.scheduled_date, session_row.scheduled_time, league_time_zone);
  if start_at is null or session_row.status in ('in_progress', 'completed', 'cancelled') then
    delete from public.league_attendance_push_reminders where session_id = session_row.id and sent_at is null;
    return;
  end if;
  foreach reminder in array array[48, 24] loop
    insert into public.league_attendance_push_reminders (session_id, reminder_hours, scheduled_for, updated_at)
    values (session_row.id, reminder, start_at - make_interval(hours => reminder), now())
    on conflict (session_id, reminder_hours) do update set
      scheduled_for = excluded.scheduled_for, delivery_started_at = null,
      skipped_at = null, skip_reason = null, recipient_count = null, updated_at = now()
    where public.league_attendance_push_reminders.sent_at is null;
  end loop;
end;
$$;

drop trigger if exists reschedule_league_reminders_on_time_zone on public.leagues;
create trigger reschedule_league_reminders_on_time_zone
after update of time_zone on public.leagues
for each row execute function public.reschedule_league_reminders_for_time_zone();

create or replace function public.create_league_room_after_league()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.tournament_rooms (
    tournament_id, league_id, created_by_user_id, posting_mode,
    conversation_enabled_at, conversation_enabled_by_user_id, conversation_closes_at
  ) values (
    null, new.id, new.organizer_user_id, 'conversation', now(), new.organizer_user_id,
    (new.end_date + 1)::timestamp at time zone new.time_zone
  ) on conflict (league_id) where league_id is not null do nothing;
  return new;
end;
$$;

notify pgrst, 'reload schema';
