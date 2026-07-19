-- Complete the co-organizer identity transition after all existing
-- assignments were backfilled and application/Edge Function authorization
-- moved to tournaments.co_organizer_user_id.

drop policy if exists "Co-organizers can update tournaments"
on public.tournaments;

create policy "Co-organizers can update tournaments"
on public.tournaments
for update
to authenticated
using (co_organizer_user_id = auth.uid())
with check (co_organizer_user_id = auth.uid());

drop policy if exists "Co-organizers can manage matches"
on public.matches;

create policy "Co-organizers can manage matches"
on public.matches
for all
to authenticated
using (
  exists (
    select 1
    from public.tournaments
    where tournaments.id = matches.tournament_id
      and tournaments.co_organizer_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.tournaments
    where tournaments.id = matches.tournament_id
      and tournaments.co_organizer_user_id = auth.uid()
  )
);

drop policy if exists "Organizers can manage tournament players"
on public.tournament_players;

create policy "Organizers can manage tournament players"
on public.tournament_players
for all
to authenticated
using (
  exists (
    select 1
    from public.tournaments
    where tournaments.id = tournament_players.tournament_id
      and (
        tournaments.organizer_user_id = auth.uid()
        or tournaments.co_organizer_user_id = auth.uid()
      )
  )
)
with check (
  exists (
    select 1
    from public.tournaments
    where tournaments.id = tournament_players.tournament_id
      and (
        tournaments.organizer_user_id = auth.uid()
        or tournaments.co_organizer_user_id = auth.uid()
      )
  )
);
