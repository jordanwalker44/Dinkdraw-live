alter table public.tournaments
  add column if not exists standings_ranking_method text not null default 'record_first';

alter table public.tournaments
  drop constraint if exists tournaments_standings_ranking_method_check;

alter table public.tournaments
  add constraint tournaments_standings_ranking_method_check
  check (standings_ranking_method in ('record_first', 'point_diff_first'));

comment on column public.tournaments.standings_ranking_method is
'Organizer-selected round-robin ranking order: record_first uses win/loss then point differential; point_diff_first uses point differential, head-to-head, then win/loss.';
