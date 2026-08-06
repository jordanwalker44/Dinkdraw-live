-- TEMPORARY TEST BYPASS:
-- Pool + postseason tournaments may start with organizer-entered player names
-- that are not linked to DinkDraw accounts. Restore this guard after testing.
create or replace function public.enforce_claimed_pool_tournament_players()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  return new;
end;
$$;

comment on function public.enforce_claimed_pool_tournament_players() is
'TEMPORARY TEST BYPASS: allows unclaimed players in pool + postseason tournaments. Restore the account-claim validation after testing.';
