create table if not exists public.league_attendance_push_reminders (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.league_sessions(id) on delete cascade,
  reminder_hours integer not null check (reminder_hours in (48, 24)),
  scheduled_for timestamptz not null,
  delivery_started_at timestamptz,
  sent_at timestamptz,
  skipped_at timestamptz,
  skip_reason text,
  recipient_count integer check (recipient_count is null or recipient_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, reminder_hours)
);

alter table public.league_attendance_push_reminders enable row level security;

create index if not exists league_attendance_push_reminders_due_idx
on public.league_attendance_push_reminders(scheduled_for)
where sent_at is null and skipped_at is null;

create or replace function public.sync_league_attendance_push_reminders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  start_at timestamptz;
  reminder integer;
begin
  start_at := public.tournament_start_at(new.scheduled_date, new.scheduled_time);

  if start_at is null or new.status in ('in_progress', 'completed', 'cancelled') then
    delete from public.league_attendance_push_reminders
    where session_id = new.id and sent_at is null;
    return new;
  end if;

  foreach reminder in array array[48, 24]
  loop
    insert into public.league_attendance_push_reminders (
      session_id, reminder_hours, scheduled_for, updated_at
    ) values (
      new.id, reminder, start_at - make_interval(hours => reminder), now()
    )
    on conflict (session_id, reminder_hours)
    do update set
      scheduled_for = excluded.scheduled_for,
      delivery_started_at = null,
      skipped_at = null,
      skip_reason = null,
      recipient_count = null,
      updated_at = now()
    where public.league_attendance_push_reminders.sent_at is null;
  end loop;

  return new;
end;
$$;

drop trigger if exists sync_league_attendance_push_reminders_on_sessions on public.league_sessions;
create trigger sync_league_attendance_push_reminders_on_sessions
after insert or update of scheduled_date, scheduled_time, status
on public.league_sessions
for each row execute function public.sync_league_attendance_push_reminders();

insert into public.league_attendance_push_reminders (
  session_id, reminder_hours, scheduled_for, updated_at
)
select
  sessions.id,
  reminder_hours,
  public.tournament_start_at(sessions.scheduled_date, sessions.scheduled_time) - make_interval(hours => reminder_hours),
  now()
from public.league_sessions sessions
cross join (values (48), (24)) as reminders(reminder_hours)
where sessions.status not in ('in_progress', 'completed', 'cancelled')
  and public.tournament_start_at(sessions.scheduled_date, sessions.scheduled_time) is not null
on conflict (session_id, reminder_hours) do nothing;

comment on table public.league_attendance_push_reminders is
  'Idempotent 48-hour player and 24-hour organizer attendance reminder deliveries for league weeks.';

notify pgrst, 'reload schema';
