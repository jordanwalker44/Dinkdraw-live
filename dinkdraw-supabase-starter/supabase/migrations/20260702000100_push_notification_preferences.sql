create table if not exists public.push_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tournament_updates_enabled boolean not null default true,
  spot_claimed_enabled boolean not null default true,
  match_assignments_enabled boolean not null default true,
  score_updates_enabled boolean not null default true,
  tournament_completed_enabled boolean not null default true,
  reminders_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_notification_preferences enable row level security;

drop policy if exists "Users can view their own push notification preferences" on public.push_notification_preferences;
create policy "Users can view their own push notification preferences"
on public.push_notification_preferences
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own push notification preferences" on public.push_notification_preferences;
create policy "Users can insert their own push notification preferences"
on public.push_notification_preferences
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own push notification preferences" on public.push_notification_preferences;
create policy "Users can update their own push notification preferences"
on public.push_notification_preferences
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own push notification preferences" on public.push_notification_preferences;
create policy "Users can delete their own push notification preferences"
on public.push_notification_preferences
for delete
to authenticated
using (auth.uid() = user_id);
