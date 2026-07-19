create or replace function public.sync_player_match_stats_from_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament public.tournaments;
  v_team_a_users uuid[];
  v_team_b_users uuid[];
  v_current_user uuid;
  v_partner_user uuid;
  v_game_number integer;
  v_a_score integer;
  v_b_score integer;
  v_played_at timestamptz;
begin
  delete from public.player_match_stats
  where match_id = new.id;

  if new.is_bye or not new.is_complete then
    return new;
  end if;

  select *
  into v_tournament
  from public.tournaments
  where id = new.tournament_id;

  if v_tournament.id is null then
    raise exception 'Tournament not found for match %', new.id;
  end if;

  select coalesce(array_agg(tp.claimed_by_user_id order by tp.slot_number), '{}'::uuid[])
  into v_team_a_users
  from public.tournament_players tp
  where tp.tournament_id = new.tournament_id
    and tp.id in (new.team_a_player_1_id, new.team_a_player_2_id)
    and tp.claimed_by_user_id is not null;

  select coalesce(array_agg(tp.claimed_by_user_id order by tp.slot_number), '{}'::uuid[])
  into v_team_b_users
  from public.tournament_players tp
  where tp.tournament_id = new.tournament_id
    and tp.id in (new.team_b_player_1_id, new.team_b_player_2_id)
    and tp.claimed_by_user_id is not null;

  v_played_at := coalesce(
    new.reported_at,
    v_tournament.started_at,
    case
      when v_tournament.event_date is not null
        then (v_tournament.event_date::text || ' 12:00:00+00')::timestamptz
      else null
    end,
    now()
  );

  if v_tournament.match_format = 'best_of_3' then
    for v_game_number in 1..3 loop
      v_a_score := case v_game_number
        when 1 then new.game_1_a
        when 2 then new.game_2_a
        else new.game_3_a
      end;
      v_b_score := case v_game_number
        when 1 then new.game_1_b
        when 2 then new.game_2_b
        else new.game_3_b
      end;

      if v_a_score is null or v_b_score is null then
        continue;
      end if;

      foreach v_current_user in array v_team_a_users loop
        select opponent into v_partner_user
        from unnest(v_team_a_users) opponent
        where opponent <> v_current_user
        limit 1;

        insert into public.player_match_stats (
          user_id, tournament_id, match_id, game_number, round_number, played_at,
          partner_user_id, opponent_1_user_id, opponent_2_user_id,
          result, wins, losses, ties, points_for, points_against, point_diff, format
        ) values (
          v_current_user, new.tournament_id, new.id, v_game_number, new.round_number, v_played_at,
          v_partner_user, v_team_b_users[1], v_team_b_users[2],
          case when v_a_score > v_b_score then 'win' else 'loss' end,
          case when v_a_score > v_b_score then 1 else 0 end,
          case when v_a_score < v_b_score then 1 else 0 end,
          0, v_a_score, v_b_score, v_a_score - v_b_score, v_tournament.format
        );
      end loop;

      foreach v_current_user in array v_team_b_users loop
        select opponent into v_partner_user
        from unnest(v_team_b_users) opponent
        where opponent <> v_current_user
        limit 1;

        insert into public.player_match_stats (
          user_id, tournament_id, match_id, game_number, round_number, played_at,
          partner_user_id, opponent_1_user_id, opponent_2_user_id,
          result, wins, losses, ties, points_for, points_against, point_diff, format
        ) values (
          v_current_user, new.tournament_id, new.id, v_game_number, new.round_number, v_played_at,
          v_partner_user, v_team_a_users[1], v_team_a_users[2],
          case when v_b_score > v_a_score then 'win' else 'loss' end,
          case when v_b_score > v_a_score then 1 else 0 end,
          case when v_b_score < v_a_score then 1 else 0 end,
          0, v_b_score, v_a_score, v_b_score - v_a_score, v_tournament.format
        );
      end loop;
    end loop;
  else
    if new.team_a_score is null or new.team_b_score is null then
      raise exception 'Completed match % is missing a score', new.id;
    end if;

    foreach v_current_user in array v_team_a_users loop
      select opponent into v_partner_user
      from unnest(v_team_a_users) opponent
      where opponent <> v_current_user
      limit 1;

      insert into public.player_match_stats (
        user_id, tournament_id, match_id, game_number, round_number, played_at,
        partner_user_id, opponent_1_user_id, opponent_2_user_id,
        result, wins, losses, ties, points_for, points_against, point_diff, format
      ) values (
        v_current_user, new.tournament_id, new.id, 1, new.round_number, v_played_at,
        v_partner_user, v_team_b_users[1], v_team_b_users[2],
        case when new.team_a_score > new.team_b_score then 'win' when new.team_a_score < new.team_b_score then 'loss' else 'tie' end,
        case when new.team_a_score > new.team_b_score then 1 else 0 end,
        case when new.team_a_score < new.team_b_score then 1 else 0 end,
        case when new.team_a_score = new.team_b_score then 1 else 0 end,
        new.team_a_score, new.team_b_score, new.team_a_score - new.team_b_score, v_tournament.format
      );
    end loop;

    foreach v_current_user in array v_team_b_users loop
      select opponent into v_partner_user
      from unnest(v_team_b_users) opponent
      where opponent <> v_current_user
      limit 1;

      insert into public.player_match_stats (
        user_id, tournament_id, match_id, game_number, round_number, played_at,
        partner_user_id, opponent_1_user_id, opponent_2_user_id,
        result, wins, losses, ties, points_for, points_against, point_diff, format
      ) values (
        v_current_user, new.tournament_id, new.id, 1, new.round_number, v_played_at,
        v_partner_user, v_team_a_users[1], v_team_a_users[2],
        case when new.team_b_score > new.team_a_score then 'win' when new.team_b_score < new.team_a_score then 'loss' else 'tie' end,
        case when new.team_b_score > new.team_a_score then 1 else 0 end,
        case when new.team_b_score < new.team_a_score then 1 else 0 end,
        case when new.team_b_score = new.team_a_score then 1 else 0 end,
        new.team_b_score, new.team_a_score, new.team_b_score - new.team_a_score, v_tournament.format
      );
    end loop;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_player_match_stats_from_match() from public;
revoke all on function public.sync_player_match_stats_from_match() from anon;
revoke all on function public.sync_player_match_stats_from_match() from authenticated;

drop trigger if exists sync_player_match_stats_after_score on public.matches;

create trigger sync_player_match_stats_after_score
after insert or update
on public.matches
for each row
execute function public.sync_player_match_stats_from_match();

comment on function public.sync_player_match_stats_from_match()
is 'Atomically rebuilds claimed-player stat rows whenever a match score is completed, corrected, or reopened.';
