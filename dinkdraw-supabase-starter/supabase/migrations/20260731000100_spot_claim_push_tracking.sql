-- Prevent one claimed player slot from triggering duplicate organizer push deliveries.
-- These fields are maintained only by the service-role Edge Function.

alter table public.tournament_players
  add column if not exists spot_claim_push_claimed_at timestamptz,
  add column if not exists spot_claim_push_completed_at timestamptz;

create index if not exists tournament_players_spot_claim_push_pending_idx
  on public.tournament_players(spot_claim_push_claimed_at)
  where claimed_by_user_id is not null
    and spot_claim_push_claimed_at is not null
    and spot_claim_push_completed_at is null;

comment on column public.tournament_players.spot_claim_push_claimed_at is
  'Set once by the push Edge Function to prevent duplicate spot-claimed delivery.';

comment on column public.tournament_players.spot_claim_push_completed_at is
  'Set after the spot-claimed push delivery attempt finishes.';
