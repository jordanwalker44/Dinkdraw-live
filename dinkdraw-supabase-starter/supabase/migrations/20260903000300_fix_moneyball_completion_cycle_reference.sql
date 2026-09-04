create or replace function public.award_pool_tournament_prize_wins()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle_id uuid;
  v_champion_user_id uuid;
  v_daily_pool_cents integer;
  v_champion_count integer;
begin
  if new.status <> 'completed'
     or new.moneyball_series_id is null
     or old.status = 'completed' then
    return new;
  end if;

  if not new.pool_brackets_enabled then
    raise exception 'Moneyball tournaments currently require pool play with postseason brackets.';
  end if;

  v_cycle_id := public.get_or_create_tournament_prize_cycle(new.id);
  if exists (
    select 1
    from public.tournament_prize_cycles cycle
    where cycle.id = v_cycle_id and cycle.status <> 'active'
  ) then
    raise exception 'Confirm the pending prize payout before completing another tournament.';
  end if;

  if exists (
    select 1
    from public.tournament_players player
    where player.tournament_id = new.id
      and player.claimed_by_user_id is not null
      and not exists (
        select 1
        from public.tournament_pot_contributions contribution
        where contribution.tournament_id = new.id
          and contribution.user_id = player.claimed_by_user_id
      )
  ) then
    raise exception 'Record every player''s payment before completing the tournament.';
  end if;

  for v_champion_user_id in
    select distinct player.claimed_by_user_id
    from public.tournament_players player
    where player.id in (new.champion_player_1_id, new.champion_player_2_id)
      and player.claimed_by_user_id is not null
  loop
    insert into public.tournament_prize_wins (cycle_id, tournament_id, user_id)
    values (v_cycle_id, new.id, v_champion_user_id)
    on conflict (tournament_id, user_id) do nothing;
  end loop;

  select coalesce(sum(contribution.daily_prize_cents), 0)
  into v_daily_pool_cents
  from public.tournament_pot_contributions contribution
  where contribution.tournament_id = new.id;

  select count(distinct player.claimed_by_user_id)
  into v_champion_count
  from public.tournament_players player
  where player.id in (new.champion_player_1_id, new.champion_player_2_id)
    and player.claimed_by_user_id is not null;

  if v_champion_count > 0 then
    insert into public.tournament_daily_prize_winnings (tournament_id, user_id, amount_cents)
    select new.id, player.claimed_by_user_id, v_daily_pool_cents / v_champion_count
    from public.tournament_players player
    where player.id in (new.champion_player_1_id, new.champion_player_2_id)
      and player.claimed_by_user_id is not null
    on conflict (tournament_id, user_id)
    do update set amount_cents = excluded.amount_cents;
  end if;

  if exists (
    select 1
    from public.tournament_prize_wins win
    where win.cycle_id = v_cycle_id
    group by win.user_id
    having count(*) >= (
      select cycle.target_wins
      from public.tournament_prize_cycles cycle
      where cycle.id = v_cycle_id
    )
  ) then
    update public.tournament_prize_cycles cycle
    set status = 'pending_payout', threshold_reached_at = now()
    where cycle.id = v_cycle_id;
  end if;

  return new;
end;
$$;

comment on function public.award_pool_tournament_prize_wins() is
  'Awards Moneyball wins and daily prizes when a linked tournament completes.';
