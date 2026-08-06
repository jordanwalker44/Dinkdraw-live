-- Ensure the tournament champion IDs always come from the completed
-- championship final before prize-award triggers run.
create or replace function public.sync_pool_champions_from_final()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare final_match public.playoff_matches;
begin
  if new.pool_brackets_enabled and new.status = 'completed' and old.status is distinct from 'completed' then
    select match.* into final_match
    from public.playoff_matches match
    where match.tournament_id = new.id
      and match.bracket_type = 'championship'
      and match.next_match_id is null
      and match.is_complete
    order by match.round_number desc, match.match_number
    limit 1;

    if final_match.id is null or final_match.winner_player_1_id is null or final_match.winner_player_2_id is null then
      raise exception 'Complete the championship final before completing the tournament.';
    end if;

    new.champion_player_1_id := final_match.winner_player_1_id;
    new.champion_player_2_id := final_match.winner_player_2_id;
  end if;
  return new;
end;
$$;

drop trigger if exists aa_sync_pool_champions_from_final_trigger on public.tournaments;
create trigger aa_sync_pool_champions_from_final_trigger
before update of status on public.tournaments
for each row execute function public.sync_pool_champions_from_final();

alter table public.tournament_pot_contributions
  drop constraint if exists tournament_pot_contributions_amount_cents_check,
  drop constraint if exists tournament_pot_contributions_daily_prize_cents_check,
  drop constraint if exists tournament_pot_contributions_grand_prize_cents_check;

alter table public.tournament_pot_contributions
  add constraint tournament_pot_contributions_amount_cents_check check (amount_cents > 0 and mod(amount_cents, 2) = 0),
  add constraint tournament_pot_contributions_equal_split_check check (
    daily_prize_cents = amount_cents / 2 and grand_prize_cents = amount_cents / 2
  );

drop function if exists public.set_tournament_pot_payment(uuid, uuid, boolean);

create function public.set_tournament_pot_payment(
  p_tournament_id uuid,
  p_user_id uuid,
  p_amount_cents integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare cycle_id uuid;
begin
  if auth.uid() is null or not public.can_manage_tournament_prize_scope(p_tournament_id, auth.uid()) then
    raise exception 'Only an organizer can record pot contributions.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.tournament_players
    where tournament_id = p_tournament_id and claimed_by_user_id = p_user_id
  ) then raise exception 'Player is not linked to this tournament.'; end if;

  cycle_id := public.get_or_create_tournament_prize_cycle(p_tournament_id);
  if not exists (select 1 from public.tournament_prize_cycles where id = cycle_id and status = 'active') then
    raise exception 'The current prize cycle is awaiting payout.';
  end if;

  if coalesce(p_amount_cents, 0) = 0 then
    delete from public.tournament_pot_contributions
    where tournament_id = p_tournament_id and user_id = p_user_id;
    return;
  end if;
  if p_amount_cents < 0 or mod(p_amount_cents, 2) <> 0 then
    raise exception 'Enter an amount that can be divided evenly between the two prize pots.';
  end if;

  insert into public.tournament_pot_contributions (
    cycle_id, tournament_id, user_id, amount_cents, daily_prize_cents,
    grand_prize_cents, recorded_by_user_id
  ) values (
    cycle_id, p_tournament_id, p_user_id, p_amount_cents,
    p_amount_cents / 2, p_amount_cents / 2, auth.uid()
  )
  on conflict (tournament_id, user_id) do update
  set cycle_id = excluded.cycle_id,
      amount_cents = excluded.amount_cents,
      daily_prize_cents = excluded.daily_prize_cents,
      grand_prize_cents = excluded.grand_prize_cents,
      recorded_by_user_id = excluded.recorded_by_user_id,
      updated_at = now();
end;
$$;

create or replace function public.get_tournament_pot_payment_amounts(p_tournament_id uuid)
returns table (user_id uuid, amount_cents integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.can_manage_tournament_prize_scope(p_tournament_id, auth.uid()) then
    raise exception 'Only an organizer can view individual payment amounts.' using errcode = '42501';
  end if;
  return query
  select contribution.user_id, contribution.amount_cents
  from public.tournament_pot_contributions contribution
  where contribution.tournament_id = p_tournament_id;
end;
$$;

revoke all on function public.set_tournament_pot_payment(uuid, uuid, integer) from public, anon;
revoke all on function public.get_tournament_pot_payment_amounts(uuid) from public, anon;
grant execute on function public.set_tournament_pot_payment(uuid, uuid, integer) to authenticated;
grant execute on function public.get_tournament_pot_payment_amounts(uuid) to authenticated;
