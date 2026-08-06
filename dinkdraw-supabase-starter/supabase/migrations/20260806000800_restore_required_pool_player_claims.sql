-- Testing is complete. Restore the account-claim requirement for every named
-- player in Pool Play + Postseason Brackets tournaments.
create or replace function public.enforce_claimed_pool_tournament_players()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.pool_brackets_enabled
     and new.status = 'started'
     and old.status is distinct from 'started'
     and exists (
       select 1 from public.tournament_players player
       where player.tournament_id = new.id
         and nullif(btrim(player.display_name), '') is not null
         and player.claimed_by_user_id is null
     ) then
    raise exception 'Every pool tournament player must claim their spot with a DinkDraw account.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

comment on function public.enforce_claimed_pool_tournament_players() is
'Prevents Pool Play + Postseason Brackets tournaments from starting until every named player has claimed a spot with a DinkDraw account.';
