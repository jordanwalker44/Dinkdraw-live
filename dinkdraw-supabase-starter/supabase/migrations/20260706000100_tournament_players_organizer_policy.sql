drop policy if exists "Organizers can manage tournament players" on public.tournament_players;

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
        or (
          tournaments.co_organizer_email is not null
          and lower(tournaments.co_organizer_email) = lower(auth.jwt() ->> 'email')
        )
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
        or (
          tournaments.co_organizer_email is not null
          and lower(tournaments.co_organizer_email) = lower(auth.jwt() ->> 'email')
        )
      )
  )
);
