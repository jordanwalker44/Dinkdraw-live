create or replace function public.set_all_tournament_pot_payments(
  p_tournament_id uuid,
  p_amount_cents integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle_id uuid;
  affected_count integer;
begin
  if auth.uid() is null or not public.can_manage_tournament_prize_scope(p_tournament_id, auth.uid()) then
    raise exception 'Only an organizer can record pot contributions.' using errcode = '42501';
  end if;
  if coalesce(p_amount_cents, 0) <= 0 or mod(p_amount_cents, 2) <> 0 then
    raise exception 'Enter an amount greater than zero that can be split equally between both prize pots.';
  end if;

  v_cycle_id := public.get_or_create_tournament_prize_cycle(p_tournament_id);
  if not exists (select 1 from public.tournament_prize_cycles where id = v_cycle_id and status = 'active') then
    raise exception 'The current prize cycle is awaiting payout.';
  end if;

  insert into public.tournament_pot_contributions (
    cycle_id, tournament_id, user_id, amount_cents, daily_prize_cents,
    grand_prize_cents, recorded_by_user_id
  )
  select distinct
    v_cycle_id, p_tournament_id, player.claimed_by_user_id, p_amount_cents,
    p_amount_cents / 2, p_amount_cents / 2, auth.uid()
  from public.tournament_players player
  where player.tournament_id = p_tournament_id
    and player.claimed_by_user_id is not null
  on conflict (tournament_id, user_id) do update
  set cycle_id = excluded.cycle_id,
      amount_cents = excluded.amount_cents,
      daily_prize_cents = excluded.daily_prize_cents,
      grand_prize_cents = excluded.grand_prize_cents,
      recorded_by_user_id = excluded.recorded_by_user_id,
      updated_at = now();

  get diagnostics affected_count = row_count;
  return affected_count;
end;
$$;

revoke all on function public.set_all_tournament_pot_payments(uuid, integer) from public, anon;
grant execute on function public.set_all_tournament_pot_payments(uuid, integer) to authenticated;

comment on function public.set_all_tournament_pot_payments(uuid, integer) is
'Atomically records the same buy-in for every account-linked tournament player and splits each contribution equally between daily and grand-prize pots.';
