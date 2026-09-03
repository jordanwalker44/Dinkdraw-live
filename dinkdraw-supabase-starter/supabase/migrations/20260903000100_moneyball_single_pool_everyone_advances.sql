alter table public.tournaments
  drop constraint if exists tournaments_pool_bracket_settings_check;

alter table public.tournaments
  add constraint tournaments_pool_bracket_settings_check check (
    not pool_brackets_enabled or (
      tournament_mode = 'round_robin'
      and format = 'doubles'
      and doubles_mode in ('rotating', 'mixed')
      and pool_count is not null and pool_count >= 1
      and pool_qualifiers_per_gender is not null and pool_qualifiers_per_gender >= 1
      and bracket_match_format in ('single', 'best_of_3')
      and bracket_games_to is not null and bracket_games_to > 0
      and (bracket_deciding_game_to is null or bracket_deciding_game_to > 0)
    )
  );

comment on constraint tournaments_pool_bracket_settings_check on public.tournaments is
  'Allows a single pool for Moneyball-style round robin play before postseason brackets.';
