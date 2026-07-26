create table if not exists public.tournament_push_reminders (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  reminder_minutes integer not null check (reminder_minutes in (60, 5)),
  scheduled_for timestamptz not null,
  delivery_started_at timestamptz,
  sent_at timestamptz,
  skipped_at timestamptz,
  skip_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, reminder_minutes)
);

alter table public.tournament_push_reminders enable row level security;

create index if not exists tournament_push_reminders_due_idx
on public.tournament_push_reminders(scheduled_for)
where sent_at is null and skipped_at is null;

create or replace function public.tournament_start_at(
  p_event_date date,
  p_event_time text,
  p_time_zone text default 'America/Denver'
)
returns timestamptz
language plpgsql
stable
as $$
declare
  cleaned_time text;
begin
  if p_event_date is null or nullif(btrim(p_event_time), '') is null then
    return null;
  end if;

  cleaned_time := substring(btrim(p_event_time) from '^([0-2][0-9]:[0-5][0-9])');

  if cleaned_time is null then
    return null;
  end if;

  return (p_event_date::text || ' ' || cleaned_time)::timestamp at time zone p_time_zone;
end;
$$;

create or replace function public.sync_tournament_push_reminders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  start_at timestamptz;
  reminder integer;
begin
  start_at := public.tournament_start_at(new.event_date, new.event_time);

  if start_at is null then
    delete from public.tournament_push_reminders
    where tournament_id = new.id
      and sent_at is null;
    return new;
  end if;

  foreach reminder in array array[60, 5]
  loop
    insert into public.tournament_push_reminders (
      tournament_id,
      reminder_minutes,
      scheduled_for,
      updated_at
    )
    values (
      new.id,
      reminder,
      start_at - make_interval(mins => reminder),
      now()
    )
    on conflict (tournament_id, reminder_minutes)
    do update set
      scheduled_for = excluded.scheduled_for,
      delivery_started_at = null,
      skipped_at = null,
      skip_reason = null,
      updated_at = now()
    where public.tournament_push_reminders.sent_at is null;
  end loop;

  return new;
end;
$$;

drop trigger if exists sync_tournament_push_reminders_on_tournaments on public.tournaments;
create trigger sync_tournament_push_reminders_on_tournaments
after insert or update of event_date, event_time
on public.tournaments
for each row
execute function public.sync_tournament_push_reminders();

insert into public.tournament_push_reminders (
  tournament_id,
  reminder_minutes,
  scheduled_for,
  updated_at
)
select
  tournaments.id,
  reminder_minutes,
  public.tournament_start_at(tournaments.event_date, tournaments.event_time) - make_interval(mins => reminder_minutes),
  now()
from public.tournaments
cross join (values (60), (5)) as reminders(reminder_minutes)
where public.tournament_start_at(tournaments.event_date, tournaments.event_time) is not null
on conflict (tournament_id, reminder_minutes) do nothing;
