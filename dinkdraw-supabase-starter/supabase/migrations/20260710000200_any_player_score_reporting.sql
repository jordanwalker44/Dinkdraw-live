alter table public.tournaments
add column if not exists allow_any_player_score_reporting boolean not null default false;

comment on column public.tournaments.allow_any_player_score_reporting
is 'When true, claimed players may submit scores for any match in the tournament instead of only their own matches.';

drop policy if exists "Claimed players can submit any match scores when enabled" on public.matches;

create policy "Claimed players can submit any match scores when enabled"
on public.matches
for update
to authenticated
using (
  exists (
    select 1
    from public.tournaments
    join public.tournament_players
      on tournament_players.tournament_id = tournaments.id
    where tournaments.id = matches.tournament_id
      and tournaments.status = 'started'
      and tournaments.allow_player_score_reporting is true
      and tournaments.allow_any_player_score_reporting is true
      and tournament_players.claimed_by_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.tournaments
    join public.tournament_players
      on tournament_players.tournament_id = tournaments.id
    where tournaments.id = matches.tournament_id
      and tournaments.status = 'started'
      and tournaments.allow_player_score_reporting is true
      and tournaments.allow_any_player_score_reporting is true
      and tournament_players.claimed_by_user_id = auth.uid()
  )
);
