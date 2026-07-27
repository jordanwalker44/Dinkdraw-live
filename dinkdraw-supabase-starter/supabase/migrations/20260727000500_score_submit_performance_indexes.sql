-- Speed up score submission and the immediate tournament refresh after a score is saved.
-- These match the filters/orderings used by the tournament page and the score-reporting RLS checks.

create index if not exists matches_tournament_round_court_idx
on public.matches (tournament_id, round_number, court_number);

create index if not exists playoff_matches_tournament_round_match_idx
on public.playoff_matches (tournament_id, round_number, match_number);

create index if not exists tournament_players_tournament_claimed_user_idx
on public.tournament_players (tournament_id, claimed_by_user_id)
where claimed_by_user_id is not null;

create index if not exists tournament_players_claimed_user_tournament_idx
on public.tournament_players (claimed_by_user_id, tournament_id)
where claimed_by_user_id is not null;
