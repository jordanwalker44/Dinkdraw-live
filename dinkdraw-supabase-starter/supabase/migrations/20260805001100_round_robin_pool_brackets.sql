alter table public.tournaments
  add column if not exists pool_brackets_enabled boolean not null default false,
  add column if not exists pool_count integer,
  add column if not exists pool_qualifiers_per_gender integer,
  add column if not exists bracket_match_format text,
  add column if not exists bracket_games_to integer,
  add column if not exists bracket_deciding_game_to integer;

alter table public.tournament_players
  add column if not exists pool_number integer;

alter table public.playoff_matches
  add column if not exists bracket_type text not null default 'championship',
  add column if not exists match_format text not null default 'single',
  add column if not exists games_to integer,
  add column if not exists deciding_game_to integer,
  add column if not exists game_1_a integer,
  add column if not exists game_1_b integer,
  add column if not exists game_2_a integer,
  add column if not exists game_2_b integer,
  add column if not exists game_3_a integer,
  add column if not exists game_3_b integer;

alter table public.tournaments
  drop constraint if exists tournaments_pool_bracket_settings_check;

alter table public.tournaments
  add constraint tournaments_pool_bracket_settings_check check (
    not pool_brackets_enabled or (
      tournament_mode = 'round_robin'
      and format = 'doubles'
      and doubles_mode in ('rotating', 'mixed')
      and pool_count is not null and pool_count >= 2
      and pool_qualifiers_per_gender is not null and pool_qualifiers_per_gender >= 1
      and bracket_match_format in ('single', 'best_of_3')
      and bracket_games_to is not null and bracket_games_to > 0
      and (bracket_deciding_game_to is null or bracket_deciding_game_to > 0)
    )
  );

alter table public.tournament_players
  drop constraint if exists tournament_players_pool_number_check;

alter table public.tournament_players
  add constraint tournament_players_pool_number_check
  check (pool_number is null or pool_number >= 1);

alter table public.playoff_matches
  drop constraint if exists playoff_matches_bracket_type_check;

alter table public.playoff_matches
  add constraint playoff_matches_bracket_type_check
  check (bracket_type in ('championship', 'consolation'));

alter table public.playoff_matches
  drop constraint if exists playoff_matches_match_format_check;

alter table public.playoff_matches
  add constraint playoff_matches_match_format_check
  check (match_format in ('single', 'best_of_3'));

create or replace function public.enforce_pool_brackets_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requires_check boolean := false;
begin
  if tg_op = 'INSERT' then
    v_requires_check := new.pool_brackets_enabled;
  else
    v_requires_check := new.pool_brackets_enabled and (
      not old.pool_brackets_enabled
      or new.pool_count is distinct from old.pool_count
      or new.pool_qualifiers_per_gender is distinct from old.pool_qualifiers_per_gender
      or new.bracket_match_format is distinct from old.bracket_match_format
      or new.bracket_games_to is distinct from old.bracket_games_to
      or new.bracket_deciding_game_to is distinct from old.bracket_deciding_game_to
    );
  end if;

  if v_requires_check and not exists (
       select 1
       from public.feature_entitlements entitlement
       where entitlement.feature_key = 'round_robin_pool_brackets'
         and entitlement.status = 'active'
         and (
           entitlement.user_id = new.organizer_user_id
           or (
             new.organization_id is not null
             and entitlement.organization_id = new.organization_id
           )
         )
     ) then
    raise exception 'Premium pool and bracket access is required.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_pool_brackets_entitlement_trigger on public.tournaments;

create trigger enforce_pool_brackets_entitlement_trigger
before insert or update of pool_brackets_enabled, pool_count, pool_qualifiers_per_gender,
  bracket_match_format, bracket_games_to, bracket_deciding_game_to on public.tournaments
for each row execute function public.enforce_pool_brackets_entitlement();

create or replace function public.enforce_pool_bracket_generation_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.tournaments tournament
    where tournament.id = new.tournament_id and tournament.pool_brackets_enabled
  ) and not exists (
    select 1
    from public.tournaments tournament
    join public.feature_entitlements entitlement
      on entitlement.status = 'active'
     and entitlement.feature_key = 'round_robin_pool_brackets'
     and (
       entitlement.user_id = tournament.organizer_user_id
       or (tournament.organization_id is not null and entitlement.organization_id = tournament.organization_id)
     )
    where tournament.id = new.tournament_id
  ) then
    raise exception 'Premium pool and bracket access is required to generate brackets.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_pool_bracket_generation_entitlement_trigger on public.playoff_matches;

create trigger enforce_pool_bracket_generation_entitlement_trigger
before insert on public.playoff_matches
for each row execute function public.enforce_pool_bracket_generation_entitlement();

create index if not exists tournament_players_tournament_pool_idx
  on public.tournament_players (tournament_id, pool_number);

create index if not exists playoff_matches_tournament_bracket_round_idx
  on public.playoff_matches (tournament_id, bracket_type, round_number, match_number);

comment on column public.tournaments.pool_brackets_enabled is
  'Premium rotating-partner pool play followed by permanent-partner championship and consolation brackets.';

comment on column public.tournament_players.pool_number is
  'One-based pool assignment used during round-robin pool play.';
