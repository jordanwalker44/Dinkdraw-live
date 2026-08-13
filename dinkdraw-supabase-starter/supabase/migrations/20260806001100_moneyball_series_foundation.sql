create table if not exists public.moneyball_series (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  organizer_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 100),
  format text not null default 'doubles' check (format in ('singles', 'doubles')),
  doubles_mode text check (doubles_mode is null or doubles_mode in ('rotating', 'fixed', 'mixed')),
  target_wins integer not null default 3 check (target_wins > 0),
  default_buy_in_cents integer not null default 1000 check (default_buy_in_cents > 0 and mod(default_buy_in_cents, 2) = 0),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists moneyball_series_org_name_idx
  on public.moneyball_series (organization_id, lower(name))
  where organization_id is not null and status = 'active';

create unique index if not exists moneyball_series_organizer_name_idx
  on public.moneyball_series (organizer_user_id, lower(name))
  where organization_id is null and status = 'active';

alter table public.tournaments
  add column if not exists moneyball_series_id uuid references public.moneyball_series(id) on delete restrict;

alter table public.tournament_prize_cycles
  add column if not exists moneyball_series_id uuid references public.moneyball_series(id) on delete restrict;

insert into public.moneyball_series (
  organization_id,
  organizer_user_id,
  name,
  format,
  doubles_mode,
  target_wins
)
select distinct on (coalesce(cycle.organization_id::text, 'user:' || cycle.organizer_user_id::text))
  cycle.organization_id,
  cycle.organizer_user_id,
  coalesce(organization.name || ' Moneyball', 'Moneyball Series'),
  coalesce(sample_tournament.format, 'doubles'),
  coalesce(sample_tournament.doubles_mode, 'rotating'),
  cycle.target_wins
from public.tournament_prize_cycles cycle
left join public.organizations organization on organization.id = cycle.organization_id
left join lateral (
  select tournament.format, tournament.doubles_mode
  from public.tournaments tournament
  where tournament.id in (
    select contribution.tournament_id
    from public.tournament_pot_contributions contribution
    where contribution.cycle_id = cycle.id
    union
    select win.tournament_id
    from public.tournament_prize_wins win
    where win.cycle_id = cycle.id
  )
  order by tournament.created_at
  limit 1
) sample_tournament on true
where cycle.moneyball_series_id is null
order by coalesce(cycle.organization_id::text, 'user:' || cycle.organizer_user_id::text), cycle.created_at
on conflict do nothing;

update public.tournament_prize_cycles cycle
set moneyball_series_id = series.id
from public.moneyball_series series
where cycle.moneyball_series_id is null
  and (
    (cycle.organization_id is not null and series.organization_id = cycle.organization_id)
    or (
      cycle.organization_id is null
      and series.organization_id is null
      and series.organizer_user_id = cycle.organizer_user_id
    )
  );

update public.tournaments tournament
set moneyball_series_id = source.moneyball_series_id
from (
  select distinct contribution.tournament_id, cycle.moneyball_series_id
  from public.tournament_pot_contributions contribution
  join public.tournament_prize_cycles cycle on cycle.id = contribution.cycle_id
  where cycle.moneyball_series_id is not null
  union
  select distinct win.tournament_id, cycle.moneyball_series_id
  from public.tournament_prize_wins win
  join public.tournament_prize_cycles cycle on cycle.id = win.cycle_id
  where cycle.moneyball_series_id is not null
) source
where tournament.id = source.tournament_id
  and tournament.moneyball_series_id is null;

drop index if exists public.tournament_prize_cycles_active_organization_idx;
drop index if exists public.tournament_prize_cycles_active_organizer_idx;

create unique index if not exists tournament_prize_cycles_active_series_idx
  on public.tournament_prize_cycles (moneyball_series_id)
  where moneyball_series_id is not null and status in ('active', 'pending_payout');

create index if not exists tournaments_moneyball_series_idx
  on public.tournaments (moneyball_series_id)
  where moneyball_series_id is not null;

create or replace function public.validate_tournament_moneyball_series()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare series_row public.moneyball_series%rowtype;
begin
  if new.moneyball_series_id is null then return new; end if;
  select * into series_row from public.moneyball_series where id = new.moneyball_series_id;
  if not found or series_row.status <> 'active' then
    raise exception 'Select an active Moneyball Series.';
  end if;
  if not new.pool_brackets_enabled then
    raise exception 'Moneyball currently requires pool play with postseason brackets.';
  end if;
  if new.organization_id is distinct from series_row.organization_id then
    raise exception 'The tournament and Moneyball Series must belong to the same organization.';
  end if;
  if new.format is distinct from series_row.format
     or (new.format = 'doubles' and new.doubles_mode is distinct from series_row.doubles_mode) then
    raise exception 'The tournament format must match the selected Moneyball Series.';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_tournament_moneyball_series_trigger on public.tournaments;
create trigger validate_tournament_moneyball_series_trigger
before insert or update of moneyball_series_id, organization_id, format, doubles_mode, pool_brackets_enabled
on public.tournaments
for each row execute function public.validate_tournament_moneyball_series();

alter table public.moneyball_series enable row level security;

drop policy if exists "Moneyball series are publicly visible" on public.moneyball_series;
create policy "Moneyball series are publicly visible"
on public.moneyball_series for select
using (true);

drop policy if exists "Organizers can create moneyball series" on public.moneyball_series;
create policy "Organizers can create moneyball series"
on public.moneyball_series for insert to authenticated
with check (
  organizer_user_id = auth.uid()
  and (
    organization_id is null
    or exists (
      select 1 from public.organization_members member
      where member.organization_id = moneyball_series.organization_id
        and member.user_id = auth.uid()
        and member.role in ('owner', 'admin')
    )
  )
);

drop policy if exists "Organizers can update moneyball series" on public.moneyball_series;
create policy "Organizers can update moneyball series"
on public.moneyball_series for update to authenticated
using (
  organizer_user_id = auth.uid()
  or exists (
    select 1 from public.organization_members member
    where member.organization_id = moneyball_series.organization_id
      and member.user_id = auth.uid()
      and member.role in ('owner', 'admin')
  )
)
with check (
  organizer_user_id = auth.uid()
  or exists (
    select 1 from public.organization_members member
    where member.organization_id = moneyball_series.organization_id
      and member.user_id = auth.uid()
      and member.role in ('owner', 'admin')
  )
);

create or replace function public.get_or_create_tournament_prize_cycle(p_tournament_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  tournament_row public.tournaments%rowtype;
  series_row public.moneyball_series%rowtype;
  cycle_id uuid;
begin
  select * into tournament_row from public.tournaments where id = p_tournament_id;
  if not found then raise exception 'Tournament not found.'; end if;
  if tournament_row.moneyball_series_id is null then
    raise exception 'This tournament is not linked to a Moneyball Series.';
  end if;

  select * into series_row
  from public.moneyball_series
  where id = tournament_row.moneyball_series_id and status = 'active';
  if not found then raise exception 'The selected Moneyball Series is not active.'; end if;

  select id into cycle_id
  from public.tournament_prize_cycles cycle
  where cycle.moneyball_series_id = series_row.id
    and cycle.status in ('active', 'pending_payout')
  limit 1;

  if cycle_id is null then
    insert into public.tournament_prize_cycles (
      organization_id,
      organizer_user_id,
      moneyball_series_id,
      target_wins
    ) values (
      series_row.organization_id,
      tournament_row.organizer_user_id,
      series_row.id,
      series_row.target_wins
    ) returning id into cycle_id;
  end if;
  return cycle_id;
end;
$$;

create or replace function public.award_pool_tournament_prize_wins()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cycle_id uuid;
  champion_user_id uuid;
  daily_pool_cents integer;
  champion_count integer;
begin
  if new.status <> 'completed'
     or new.moneyball_series_id is null
     or old.status = 'completed' then
    return new;
  end if;

  if not new.pool_brackets_enabled then
    raise exception 'Moneyball tournaments currently require pool play with postseason brackets.';
  end if;

  cycle_id := public.get_or_create_tournament_prize_cycle(new.id);
  if exists (select 1 from public.tournament_prize_cycles where id = cycle_id and status <> 'active') then
    raise exception 'Confirm the pending prize payout before completing another tournament.';
  end if;

  if exists (
    select 1 from public.tournament_players player
    where player.tournament_id = new.id
      and player.claimed_by_user_id is not null
      and not exists (
        select 1 from public.tournament_pot_contributions contribution
        where contribution.tournament_id = new.id
          and contribution.user_id = player.claimed_by_user_id
      )
  ) then
    raise exception 'Record every player''s payment before completing the tournament.';
  end if;

  for champion_user_id in
    select distinct player.claimed_by_user_id
    from public.tournament_players player
    where player.id in (new.champion_player_1_id, new.champion_player_2_id)
      and player.claimed_by_user_id is not null
  loop
    insert into public.tournament_prize_wins (cycle_id, tournament_id, user_id)
    values (cycle_id, new.id, champion_user_id)
    on conflict (tournament_id, user_id) do nothing;
  end loop;

  select coalesce(sum(contribution.daily_prize_cents), 0)
  into daily_pool_cents
  from public.tournament_pot_contributions contribution
  where contribution.tournament_id = new.id;

  select count(distinct player.claimed_by_user_id)
  into champion_count
  from public.tournament_players player
  where player.id in (new.champion_player_1_id, new.champion_player_2_id)
    and player.claimed_by_user_id is not null;

  if champion_count > 0 then
    insert into public.tournament_daily_prize_winnings (tournament_id, user_id, amount_cents)
    select new.id, player.claimed_by_user_id, daily_pool_cents / champion_count
    from public.tournament_players player
    where player.id in (new.champion_player_1_id, new.champion_player_2_id)
      and player.claimed_by_user_id is not null
    on conflict (tournament_id, user_id) do update set amount_cents = excluded.amount_cents;
  end if;

  if exists (
    select 1 from public.tournament_prize_wins win
    where win.cycle_id = cycle_id
    group by win.user_id
    having count(*) >= (select target_wins from public.tournament_prize_cycles where id = cycle_id)
  ) then
    update public.tournament_prize_cycles
    set status = 'pending_payout', threshold_reached_at = now()
    where id = cycle_id;
  end if;
  return new;
end;
$$;

create or replace function public.get_tournament_prize_dashboard(p_tournament_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tournament_row public.tournaments%rowtype;
  series_row public.moneyball_series%rowtype;
  cycle_row public.tournament_prize_cycles%rowtype;
  result jsonb;
begin
  select * into tournament_row from public.tournaments where id = p_tournament_id;
  if not found or auth.uid() is null then raise exception 'Tournament not found or sign-in required.'; end if;
  if tournament_row.moneyball_series_id is null then raise exception 'This is not a Moneyball tournament.'; end if;
  if tournament_row.organizer_user_id <> auth.uid()
     and not exists (select 1 from public.tournament_players where tournament_id = p_tournament_id and claimed_by_user_id = auth.uid())
     and not public.can_manage_tournament_prize_scope(p_tournament_id, auth.uid()) then
    raise exception 'You do not have access to this prize pool.' using errcode = '42501';
  end if;

  select * into series_row from public.moneyball_series where id = tournament_row.moneyball_series_id;
  perform public.get_or_create_tournament_prize_cycle(p_tournament_id);
  select * into cycle_row from public.tournament_prize_cycles cycle
  where cycle.moneyball_series_id = tournament_row.moneyball_series_id
    and cycle.status in ('active', 'pending_payout')
  limit 1;

  select jsonb_build_object(
    'series_id', series_row.id,
    'series_name', series_row.name,
    'default_buy_in_cents', series_row.default_buy_in_cents,
    'cycle_id', cycle_row.id,
    'status', cycle_row.status,
    'target_wins', cycle_row.target_wins,
    'grand_pot_cents', coalesce((select sum(grand_prize_cents) from public.tournament_pot_contributions where cycle_id = cycle_row.id), 0),
    'daily_pot_cents', coalesce((select sum(daily_prize_cents) from public.tournament_pot_contributions where tournament_id = p_tournament_id), 0),
    'paid_player_count', (select count(*) from public.tournament_pot_contributions where tournament_id = p_tournament_id),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', roster.user_id,
        'name', roster.name,
        'wins', coalesce(win_counts.wins, 0),
        'paid', contribution.id is not null,
        'cycle_grand_contribution_cents', coalesce(cycle_contribution.amount_cents, 0),
        'eligible_for_payout', coalesce(win_counts.wins, 0) >= cycle_row.target_wins
      ) order by coalesce(win_counts.wins, 0) desc, roster.name)
      from (
        select identity.user_id, max(identity.name) name
        from (
          select player.claimed_by_user_id user_id, coalesce(profile.display_name, player.display_name, 'Player') name
          from public.tournament_players player
          left join public.profiles profile on profile.id = player.claimed_by_user_id
          where player.tournament_id = p_tournament_id and player.claimed_by_user_id is not null
          union all
          select win.user_id, coalesce(profile.display_name, 'Player')
          from public.tournament_prize_wins win
          left join public.profiles profile on profile.id = win.user_id
          where win.cycle_id = cycle_row.id
          union all
          select contribution.user_id, coalesce(profile.display_name, 'Player')
          from public.tournament_pot_contributions contribution
          left join public.profiles profile on profile.id = contribution.user_id
          where contribution.cycle_id = cycle_row.id
        ) identity
        group by identity.user_id
      ) roster
      left join (select user_id, count(*) wins from public.tournament_prize_wins where cycle_id = cycle_row.id group by user_id) win_counts on win_counts.user_id = roster.user_id
      left join public.tournament_pot_contributions contribution on contribution.tournament_id = p_tournament_id and contribution.user_id = roster.user_id and contribution.cycle_id = cycle_row.id
      left join (select user_id, sum(grand_prize_cents) amount_cents from public.tournament_pot_contributions where cycle_id = cycle_row.id group by user_id) cycle_contribution on cycle_contribution.user_id = roster.user_id
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.confirm_tournament_prize_payout(p_tournament_id uuid, p_winner_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle_id uuid;
  pot_cents integer;
  next_cycle_id uuid;
  tournament_row public.tournaments%rowtype;
  series_row public.moneyball_series%rowtype;
begin
  if auth.uid() is null or not public.can_manage_tournament_prize_scope(p_tournament_id, auth.uid()) then
    raise exception 'Only an organizer can confirm the payout.' using errcode = '42501';
  end if;
  select * into tournament_row from public.tournaments where id = p_tournament_id;
  select * into series_row from public.moneyball_series where id = tournament_row.moneyball_series_id;
  v_cycle_id := public.get_or_create_tournament_prize_cycle(p_tournament_id);
  if not exists (
    select 1 from public.tournament_prize_wins win
    join public.tournament_prize_cycles cycle on cycle.id = win.cycle_id
    where win.cycle_id = v_cycle_id and win.user_id = p_winner_user_id
    group by cycle.target_wins
    having count(*) >= cycle.target_wins
  ) then raise exception 'Selected player has not reached the win target.'; end if;

  select coalesce(sum(grand_prize_cents), 0) into pot_cents from public.tournament_pot_contributions where cycle_id = v_cycle_id;
  update public.tournament_prize_cycles
  set status = 'paid', winner_user_id = p_winner_user_id, pot_paid_cents = pot_cents, paid_at = now()
  where id = v_cycle_id and status = 'pending_payout';
  if not found then raise exception 'This cycle is not awaiting payout.'; end if;

  insert into public.tournament_prize_cycles (
    organization_id,
    organizer_user_id,
    moneyball_series_id,
    target_wins
  ) values (
    series_row.organization_id,
    tournament_row.organizer_user_id,
    series_row.id,
    series_row.target_wins
  ) returning id into next_cycle_id;
  return next_cycle_id;
end;
$$;

comment on table public.moneyball_series is
  'A named, organization-scoped Moneyball competition whose wins and grand-prize cycles remain separate from other series.';

comment on column public.tournaments.moneyball_series_id is
  'When set, this tournament contributes payments and championship wins to the selected Moneyball Series.';
