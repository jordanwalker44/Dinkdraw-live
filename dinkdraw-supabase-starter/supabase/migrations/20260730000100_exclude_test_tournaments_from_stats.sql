alter table public.tournaments
  add column if not exists exclude_from_stats boolean not null default false,
  add column if not exists stats_exclusion_reason text,
  add column if not exists stats_excluded_at timestamptz;

comment on column public.tournaments.exclude_from_stats
is 'When true, this tournament remains available but is excluded from player statistics and leaderboards.';

create or replace function public.remove_excluded_tournament_match_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.tournaments t
    where t.id = new.tournament_id
      and t.exclude_from_stats = true
  ) then
    delete from public.player_match_stats
    where match_id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function public.remove_excluded_tournament_match_stats() from public;
revoke all on function public.remove_excluded_tournament_match_stats() from anon;
revoke all on function public.remove_excluded_tournament_match_stats() from authenticated;

drop trigger if exists zz_remove_excluded_tournament_match_stats on public.matches;

create trigger zz_remove_excluded_tournament_match_stats
after insert or update on public.matches
for each row
execute function public.remove_excluded_tournament_match_stats();

comment on function public.remove_excluded_tournament_match_stats()
is 'Ensures score changes cannot recreate derived player stats for a tournament excluded from statistics.';
