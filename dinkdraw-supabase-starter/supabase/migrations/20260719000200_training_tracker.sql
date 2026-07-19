create table if not exists public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_date date not null,
  notes text,
  source text not null default 'manual' check (source in ('manual', 'dinkdraw_tournament')),
  tournament_id uuid references public.tournaments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists training_sessions_user_tournament_unique on public.training_sessions(user_id, tournament_id) where tournament_id is not null;
create index if not exists training_sessions_user_date_idx on public.training_sessions(user_id, activity_date desc);

create table if not exists public.training_entries (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_type text not null check (entry_type in ('drill', 'play')),
  duration_minutes integer not null check (duration_minutes > 0 and duration_minutes <= 1440),
  focus_area text,
  custom_name text,
  play_type text,
  play_format text,
  created_at timestamptz not null default now(),
  check ((entry_type = 'drill' and focus_area is not null and play_type is null and play_format is null) or (entry_type = 'play' and play_type is not null and focus_area is null))
);
create index if not exists training_entries_session_idx on public.training_entries(session_id);
create index if not exists training_entries_user_idx on public.training_entries(user_id);

create table if not exists public.training_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  goal_type text not null default 'total_minutes' check (goal_type in ('total_minutes', 'drill_minutes', 'play_minutes', 'active_days')),
  target integer not null check (target > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_tournament_dismissals (
  user_id uuid not null references auth.users(id) on delete cascade,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, tournament_id)
);

alter table public.training_sessions enable row level security;
alter table public.training_entries enable row level security;
alter table public.training_goals enable row level security;
alter table public.training_tournament_dismissals enable row level security;
drop policy if exists "Users manage own training sessions" on public.training_sessions;
drop policy if exists "Users manage own training entries" on public.training_entries;
drop policy if exists "Users manage own training goal" on public.training_goals;
drop policy if exists "Users manage own tournament reminders" on public.training_tournament_dismissals;
create policy "Users manage own training sessions" on public.training_sessions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users manage own training entries" on public.training_entries for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users manage own training goal" on public.training_goals for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users manage own tournament reminders" on public.training_tournament_dismissals for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant all on public.training_sessions to authenticated, service_role;
grant all on public.training_entries to authenticated, service_role;
grant all on public.training_goals to authenticated, service_role;
grant all on public.training_tournament_dismissals to authenticated, service_role;
