-- Prevent one announcement from being used to trigger duplicate push deliveries.
-- These fields are maintained only by the service-role Edge Function.

alter table public.tournament_room_messages
add column push_claimed_at timestamptz,
add column push_completed_at timestamptz,
add column push_recipient_count integer
  check (push_recipient_count is null or push_recipient_count >= 0),
add column push_sent_count integer
  check (push_sent_count is null or push_sent_count >= 0);

create index tournament_room_messages_incomplete_push_idx
on public.tournament_room_messages(push_claimed_at)
where push_claimed_at is not null
  and push_completed_at is null;

comment on column public.tournament_room_messages.push_claimed_at is
  'Set once by the push Edge Function to prevent duplicate announcement delivery.';

comment on column public.tournament_room_messages.push_completed_at is
  'Set after the announcement push delivery attempt finishes.';

