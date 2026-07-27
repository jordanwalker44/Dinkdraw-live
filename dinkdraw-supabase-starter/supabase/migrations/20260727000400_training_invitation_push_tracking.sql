alter table public.training_partner_invitations
  add column if not exists push_claimed_at timestamptz,
  add column if not exists push_completed_at timestamptz,
  add column if not exists push_sent boolean;

create index if not exists training_partner_push_pending_idx
  on public.training_partner_invitations(sender_id, created_at)
  where status = 'pending' and push_claimed_at is null;
