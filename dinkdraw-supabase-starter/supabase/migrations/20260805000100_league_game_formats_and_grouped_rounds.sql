alter table public.leagues
  drop constraint if exists leagues_regular_player_count_check;

alter table public.leagues
  add constraint leagues_regular_player_count_check
  check (regular_player_count between 4 and 32 and regular_player_count % 4 = 0) not valid;

alter table public.leagues
  add column if not exists game_format text not null default 'two_game';

alter table public.leagues
  drop constraint if exists leagues_game_format_check;

alter table public.leagues
  add constraint leagues_game_format_check
  check (game_format in ('single', 'two_game', 'best_of_3'));

do $migration$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.create_rotating_doubles_league(uuid,text,date,integer,integer,integer,integer,text,text)'::regprocedure)
  into function_definition;

  function_definition := replace(
    function_definition,
    'p_regular_player_count % 2 <> 0',
    'p_regular_player_count % 4 <> 0'
  );
  function_definition := replace(
    function_definition,
    'Rotating doubles requires an even roster of 4 to 32 players',
    'Rotating doubles requires 4 to 32 players in multiples of four'
  );
  function_definition := replace(
    function_definition,
    'p_regular_player_count, p_courts, p_games_to, 2,',
    'p_regular_player_count, p_courts, p_games_to, 2,'
  );

  execute function_definition;
end;
$migration$;

do $migration$
declare
  function_definition text;
  old_match_loop text;
  new_match_insert text;
begin
  select pg_get_functiondef('public.start_league_session_tournament(uuid)'::regprocedure)
  into function_definition;

  function_definition := replace(
    function_definition,
    'league_row.regular_player_count, league_row.courts, (rotation_length - 1) * 2,',
    'league_row.regular_player_count, league_row.courts, (rotation_length - 1),'
  );
  function_definition := replace(
    function_definition,
    $$coalesce(session_row.location, league_row.default_location), now(), 'doubles', 'single',$$,
    $$coalesce(session_row.location, league_row.default_location), now(), 'doubles', league_row.game_format,$$
  );

  old_match_loop := $old$
        for match_copy in 1..2 loop
          insert into public.matches (
            tournament_id, round_number, court_number, court_label,
            team_a_player_1_id, team_a_player_2_id, team_b_player_1_id, team_b_player_2_id,
            is_bye, is_complete
          ) values (
            created_tournament_id, ((opponent_round - 1) * 2) + match_copy,
            court_number, court_labels[court_number],
            case when match_copy = 1 then team_a_players[1] else team_b_players[1] end,
            case when match_copy = 1 then team_a_players[2] else team_b_players[2] end,
            case when match_copy = 1 then team_b_players[1] else team_a_players[1] end,
            case when match_copy = 1 then team_b_players[2] else team_a_players[2] end,
            false, false
          );
        end loop;
$old$;

  new_match_insert := $new$
        insert into public.matches (
          tournament_id, round_number, court_number, court_label,
          team_a_player_1_id, team_a_player_2_id, team_b_player_1_id, team_b_player_2_id,
          is_bye, is_complete
        ) values (
          created_tournament_id, opponent_round,
          court_number, court_labels[court_number],
          team_a_players[1], team_a_players[2], team_b_players[1], team_b_players[2],
          false, false
        );
$new$;

  if position(old_match_loop in function_definition) = 0 then
    raise exception 'Could not find the existing duplicated league match loop';
  end if;

  function_definition := replace(function_definition, old_match_loop, new_match_insert);
  execute function_definition;
end;
$migration$;

comment on column public.leagues.game_format is
  'League matchup scoring: single, two_game (both games always played), or best_of_3.';

do $migration$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.sync_player_match_stats_from_match()'::regprocedure)
  into function_definition;

  function_definition := replace(
    function_definition,
    $$v_tournament.match_format <> 'best_of_3'$$,
    $$v_tournament.match_format not in ('best_of_3', 'two_game')$$
  );
  function_definition := replace(
    function_definition,
    $$v_tournament.match_format = 'best_of_3'$$,
    $$v_tournament.match_format in ('best_of_3', 'two_game')$$
  );

  execute function_definition;
end;
$migration$;
