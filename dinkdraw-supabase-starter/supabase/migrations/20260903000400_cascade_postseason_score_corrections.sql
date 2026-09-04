create or replace function public.correct_playoff_match_score(
  p_match_id uuid,
  p_team_a_score integer,
  p_team_b_score integer,
  p_game_1_a integer default null,
  p_game_1_b integer default null,
  p_game_2_a integer default null,
  p_game_2_b integer default null,
  p_game_3_a integer default null,
  p_game_3_b integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.playoff_matches%rowtype;
  v_tournament public.tournaments%rowtype;
  v_downstream public.playoff_matches%rowtype;
  v_winner_team text;
  v_winner_player_1_id uuid;
  v_winner_player_2_id uuid;
  v_winner_seed integer;
  v_winner_changed boolean;
  v_downstream_id uuid;
  v_downstream_team text;
  v_replacement_player_1_id uuid;
  v_replacement_player_2_id uuid;
  v_replacement_seed integer;
  v_cycle_id uuid;
  v_daily_pool_cents integer;
  v_champion_count integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in to correct a postseason score.' using errcode = '42501';
  end if;

  select * into v_match from public.playoff_matches where id = p_match_id for update;
  if not found then raise exception 'Postseason match not found.'; end if;

  select * into v_tournament from public.tournaments where id = v_match.tournament_id for update;
  if v_tournament.organizer_user_id is distinct from auth.uid()
     and v_tournament.co_organizer_user_id is distinct from auth.uid()
     and not public.can_manage_tournament_prize_scope(v_tournament.id, auth.uid()) then
    raise exception 'Only an organizer can correct postseason scores.' using errcode = '42501';
  end if;

  if not v_match.is_complete or v_match.is_bye then
    raise exception 'Only a completed postseason match can be corrected.';
  end if;
  if p_team_a_score is null or p_team_b_score is null
     or p_team_a_score < 0 or p_team_b_score < 0
     or p_team_a_score = p_team_b_score then
    raise exception 'Enter valid, non-tied postseason scores.';
  end if;

  v_winner_team := case when p_team_a_score > p_team_b_score then 'A' else 'B' end;
  v_winner_player_1_id := case when v_winner_team = 'A' then v_match.team_a_player_1_id else v_match.team_b_player_1_id end;
  v_winner_player_2_id := case when v_winner_team = 'A' then v_match.team_a_player_2_id else v_match.team_b_player_2_id end;
  v_winner_seed := case when v_winner_team = 'A' then v_match.team_a_seed else v_match.team_b_seed end;
  v_winner_changed := v_match.winner_team is distinct from v_winner_team;

  if v_winner_changed and v_tournament.moneyball_series_id is not null then
    select cycle.id into v_cycle_id
    from public.tournament_prize_cycles cycle
    join public.tournament_prize_wins win on win.cycle_id = cycle.id
    where win.tournament_id = v_tournament.id
    limit 1;

    if v_cycle_id is not null and exists (
      select 1 from public.tournament_prize_cycles cycle
      where cycle.id = v_cycle_id and cycle.status = 'paid'
    ) then
      raise exception 'This Moneyball cycle has already been paid, so its bracket results cannot be changed.';
    end if;
  end if;

  update public.playoff_matches
  set team_a_score = p_team_a_score,
      team_b_score = p_team_b_score,
      game_1_a = case when v_match.match_format = 'best_of_3' then p_game_1_a else null end,
      game_1_b = case when v_match.match_format = 'best_of_3' then p_game_1_b else null end,
      game_2_a = case when v_match.match_format = 'best_of_3' then p_game_2_a else null end,
      game_2_b = case when v_match.match_format = 'best_of_3' then p_game_2_b else null end,
      game_3_a = case when v_match.match_format = 'best_of_3' then p_game_3_a else null end,
      game_3_b = case when v_match.match_format = 'best_of_3' then p_game_3_b else null end,
      winner_team = v_winner_team,
      winner_player_1_id = v_winner_player_1_id,
      winner_player_2_id = v_winner_player_2_id,
      is_complete = true
  where id = v_match.id;

  if v_winner_changed and v_match.next_match_id is not null then
    v_downstream_id := v_match.next_match_id;
    v_downstream_team := v_match.next_match_team;
    v_replacement_player_1_id := v_winner_player_1_id;
    v_replacement_player_2_id := v_winner_player_2_id;
    v_replacement_seed := v_winner_seed;

    while v_downstream_id is not null loop
      select * into v_downstream
      from public.playoff_matches
      where id = v_downstream_id
      for update;

      if v_downstream_team = 'A' then
        update public.playoff_matches
        set team_a_seed = v_replacement_seed,
            team_a_player_1_id = v_replacement_player_1_id,
            team_a_player_2_id = v_replacement_player_2_id,
            team_a_score = null, team_b_score = null,
            game_1_a = null, game_1_b = null,
            game_2_a = null, game_2_b = null,
            game_3_a = null, game_3_b = null,
            winner_team = null, winner_player_1_id = null, winner_player_2_id = null,
            is_complete = false
        where id = v_downstream.id;
      elsif v_downstream_team = 'B' then
        update public.playoff_matches
        set team_b_seed = v_replacement_seed,
            team_b_player_1_id = v_replacement_player_1_id,
            team_b_player_2_id = v_replacement_player_2_id,
            team_a_score = null, team_b_score = null,
            game_1_a = null, game_1_b = null,
            game_2_a = null, game_2_b = null,
            game_3_a = null, game_3_b = null,
            winner_team = null, winner_player_1_id = null, winner_player_2_id = null,
            is_complete = false
        where id = v_downstream.id;
      end if;

      v_downstream_id := v_downstream.next_match_id;
      v_downstream_team := v_downstream.next_match_team;
      v_replacement_player_1_id := null;
      v_replacement_player_2_id := null;
      v_replacement_seed := null;
    end loop;

    update public.tournaments
    set status = 'started',
        playoff_status = 'in_progress',
        champion_player_1_id = case when v_match.bracket_type = 'championship' then null else champion_player_1_id end,
        champion_player_2_id = case when v_match.bracket_type = 'championship' then null else champion_player_2_id end
    where id = v_tournament.id;

    if v_tournament.moneyball_series_id is not null then
      delete from public.tournament_prize_wins where tournament_id = v_tournament.id;
      delete from public.tournament_daily_prize_winnings where tournament_id = v_tournament.id;

      if v_cycle_id is not null then
        update public.tournament_prize_cycles cycle
        set status = case when exists (
              select 1 from public.tournament_prize_wins win
              where win.cycle_id = v_cycle_id
              group by win.user_id
              having count(*) >= cycle.target_wins
            ) then 'pending_payout' else 'active' end,
            threshold_reached_at = case when exists (
              select 1 from public.tournament_prize_wins win
              where win.cycle_id = v_cycle_id
              group by win.user_id
              having count(*) >= cycle.target_wins
            ) then cycle.threshold_reached_at else null end
        where cycle.id = v_cycle_id;
      end if;
    end if;

    return;
  end if;

  if v_winner_changed and v_match.next_match_id is null and v_match.bracket_type = 'championship' then
    update public.tournaments
    set champion_player_1_id = v_winner_player_1_id,
        champion_player_2_id = v_winner_player_2_id
    where id = v_tournament.id;

    if v_tournament.moneyball_series_id is not null then
      if v_cycle_id is null then v_cycle_id := public.get_or_create_tournament_prize_cycle(v_tournament.id); end if;
      delete from public.tournament_prize_wins where tournament_id = v_tournament.id;
      delete from public.tournament_daily_prize_winnings where tournament_id = v_tournament.id;

      insert into public.tournament_prize_wins (cycle_id, tournament_id, user_id)
      select distinct v_cycle_id, v_tournament.id, player.claimed_by_user_id
      from public.tournament_players player
      where player.id in (v_winner_player_1_id, v_winner_player_2_id)
        and player.claimed_by_user_id is not null;

      select coalesce(sum(contribution.daily_prize_cents), 0) into v_daily_pool_cents
      from public.tournament_pot_contributions contribution
      where contribution.tournament_id = v_tournament.id;
      select count(distinct player.claimed_by_user_id) into v_champion_count
      from public.tournament_players player
      where player.id in (v_winner_player_1_id, v_winner_player_2_id)
        and player.claimed_by_user_id is not null;

      if v_champion_count > 0 then
        insert into public.tournament_daily_prize_winnings (tournament_id, user_id, amount_cents)
        select v_tournament.id, player.claimed_by_user_id, v_daily_pool_cents / v_champion_count
        from public.tournament_players player
        where player.id in (v_winner_player_1_id, v_winner_player_2_id)
          and player.claimed_by_user_id is not null;
      end if;

      update public.tournament_prize_cycles cycle
      set status = case when exists (
            select 1 from public.tournament_prize_wins win where win.cycle_id = v_cycle_id
            group by win.user_id having count(*) >= cycle.target_wins
          ) then 'pending_payout' else 'active' end,
          threshold_reached_at = case when exists (
            select 1 from public.tournament_prize_wins win where win.cycle_id = v_cycle_id
            group by win.user_id having count(*) >= cycle.target_wins
          ) then coalesce(cycle.threshold_reached_at, now()) else null end
      where cycle.id = v_cycle_id;
    end if;
  end if;
end;
$$;

revoke all on function public.correct_playoff_match_score(uuid, integer, integer, integer, integer, integer, integer, integer, integer) from public, anon;
grant execute on function public.correct_playoff_match_score(uuid, integer, integer, integer, integer, integer, integer, integer, integer) to authenticated;

comment on function public.correct_playoff_match_score(uuid, integer, integer, integer, integer, integer, integer, integer, integer) is
  'Corrects postseason scores and reopens every affected downstream bracket match when the winner changes.';
