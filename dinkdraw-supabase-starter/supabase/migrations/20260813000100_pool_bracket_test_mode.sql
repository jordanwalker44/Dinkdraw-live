alter table public.tournaments
  add column if not exists test_mode boolean not null default false;

alter table public.tournaments
  drop constraint if exists tournaments_test_mode_not_moneyball_check,
  add constraint tournaments_test_mode_not_moneyball_check check (
    not test_mode or moneyball_series_id is null
  );

create or replace function public.enforce_claimed_pool_tournament_players()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.pool_brackets_enabled
     and not new.test_mode
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

comment on column public.tournaments.test_mode is
  'Allows organizer-entered unclaimed players for schedule and bracket testing. Test tournaments cannot be Moneyball events.';

comment on function public.enforce_claimed_pool_tournament_players() is
  'Requires claimed accounts for pool-and-bracket events unless the organizer explicitly enabled test mode.';
