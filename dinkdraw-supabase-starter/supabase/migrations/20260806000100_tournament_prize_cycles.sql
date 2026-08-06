create table if not exists public.tournament_prize_cycles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  organizer_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'pending_payout', 'paid')),
  target_wins integer not null default 3 check (target_wins > 0),
  winner_user_id uuid references auth.users(id) on delete set null,
  pot_paid_cents integer check (pot_paid_cents is null or pot_paid_cents >= 0),
  opened_at timestamptz not null default now(),
  threshold_reached_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists tournament_prize_cycles_active_organization_idx
  on public.tournament_prize_cycles (organization_id)
  where organization_id is not null and status in ('active', 'pending_payout');

create unique index if not exists tournament_prize_cycles_active_organizer_idx
  on public.tournament_prize_cycles (organizer_user_id)
  where organization_id is null and status in ('active', 'pending_payout');

create table if not exists public.tournament_prize_wins (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.tournament_prize_cycles(id) on delete cascade,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  unique (tournament_id, user_id)
);

create table if not exists public.tournament_pot_contributions (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.tournament_prize_cycles(id) on delete cascade,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_cents integer not null default 1000 check (amount_cents = 1000),
  daily_prize_cents integer not null default 500 check (daily_prize_cents = 500),
  grand_prize_cents integer not null default 500 check (grand_prize_cents = 500),
  recorded_by_user_id uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, user_id)
);

create table if not exists public.tournament_daily_prize_winnings (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_cents integer not null check (amount_cents >= 0),
  awarded_at timestamptz not null default now(),
  unique (tournament_id, user_id)
);

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

drop trigger if exists enforce_claimed_pool_tournament_players_trigger on public.tournaments;
create trigger enforce_claimed_pool_tournament_players_trigger
before update of status on public.tournaments
for each row execute function public.enforce_claimed_pool_tournament_players();

alter table public.tournament_prize_cycles enable row level security;
alter table public.tournament_prize_wins enable row level security;
alter table public.tournament_pot_contributions enable row level security;
alter table public.tournament_daily_prize_winnings enable row level security;

create or replace function public.can_manage_tournament_prize_scope(p_tournament_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tournaments tournament
    where tournament.id = p_tournament_id
      and (
        tournament.organizer_user_id = p_user_id
        or exists (
          select 1 from public.organization_members member
          where member.organization_id = tournament.organization_id
            and member.user_id = p_user_id
            and member.role in ('owner', 'admin')
        )
      )
  );
$$;

create or replace function public.get_or_create_tournament_prize_cycle(p_tournament_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  tournament_row public.tournaments%rowtype;
  cycle_id uuid;
begin
  select * into tournament_row from public.tournaments where id = p_tournament_id;
  if not found then raise exception 'Tournament not found.'; end if;

  select id into cycle_id
  from public.tournament_prize_cycles cycle
  where cycle.status in ('active', 'pending_payout')
    and (
      (tournament_row.organization_id is not null and cycle.organization_id = tournament_row.organization_id)
      or (tournament_row.organization_id is null and cycle.organization_id is null and cycle.organizer_user_id = tournament_row.organizer_user_id)
    )
  limit 1;

  if cycle_id is null then
    insert into public.tournament_prize_cycles (organization_id, organizer_user_id)
    values (tournament_row.organization_id, tournament_row.organizer_user_id)
    returning id into cycle_id;
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
  if new.status <> 'completed' or not new.pool_brackets_enabled or old.status = 'completed' then
    return new;
  end if;

  cycle_id := public.get_or_create_tournament_prize_cycle(new.id);
  if exists (select 1 from public.tournament_prize_cycles where id = cycle_id and status <> 'active') then
    raise exception 'Confirm the pending prize payout before completing another tournament.';
  end if;

  if exists (
    select 1
    from public.tournament_players player
    where player.tournament_id = new.id
      and player.claimed_by_user_id is not null
      and not exists (
        select 1 from public.tournament_pot_contributions contribution
        where contribution.tournament_id = new.id
          and contribution.user_id = player.claimed_by_user_id
      )
  ) then
    raise exception 'Record every player''s $10 payment before completing the tournament.';
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

drop trigger if exists award_pool_tournament_prize_wins_trigger on public.tournaments;
create trigger award_pool_tournament_prize_wins_trigger
before update of status on public.tournaments
for each row execute function public.award_pool_tournament_prize_wins();

create or replace function public.set_tournament_pot_payment(
  p_tournament_id uuid,
  p_user_id uuid,
  p_paid boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare cycle_id uuid;
begin
  if auth.uid() is null or not public.can_manage_tournament_prize_scope(p_tournament_id, auth.uid()) then
    raise exception 'Only an organizer can record pot contributions.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.tournament_players
    where tournament_id = p_tournament_id and claimed_by_user_id = p_user_id
  ) then raise exception 'Player is not linked to this tournament.'; end if;

  cycle_id := public.get_or_create_tournament_prize_cycle(p_tournament_id);
  if not exists (select 1 from public.tournament_prize_cycles where id = cycle_id and status = 'active') then
    raise exception 'The current prize cycle is awaiting payout.';
  end if;

  if not p_paid then
    delete from public.tournament_pot_contributions
    where tournament_id = p_tournament_id and user_id = p_user_id;
    return;
  end if;

  insert into public.tournament_pot_contributions (
    cycle_id, tournament_id, user_id, amount_cents, daily_prize_cents,
    grand_prize_cents, recorded_by_user_id
  )
  values (cycle_id, p_tournament_id, p_user_id, 1000, 500, 500, auth.uid())
  on conflict (tournament_id, user_id) do update
  set cycle_id = excluded.cycle_id,
      amount_cents = 1000,
      daily_prize_cents = 500,
      grand_prize_cents = 500,
      recorded_by_user_id = excluded.recorded_by_user_id,
      updated_at = now();
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
  cycle_row public.tournament_prize_cycles%rowtype;
  result jsonb;
begin
  select * into tournament_row from public.tournaments where id = p_tournament_id;
  if not found or auth.uid() is null then raise exception 'Tournament not found or sign-in required.'; end if;
  if tournament_row.organizer_user_id <> auth.uid()
     and not exists (select 1 from public.tournament_players where tournament_id = p_tournament_id and claimed_by_user_id = auth.uid())
     and not public.can_manage_tournament_prize_scope(p_tournament_id, auth.uid()) then
    raise exception 'You do not have access to this prize pool.' using errcode = '42501';
  end if;

  perform public.get_or_create_tournament_prize_cycle(p_tournament_id);
  select * into cycle_row from public.tournament_prize_cycles cycle
  where cycle.status in ('active', 'pending_payout')
    and ((tournament_row.organization_id is not null and cycle.organization_id = tournament_row.organization_id)
      or (tournament_row.organization_id is null and cycle.organization_id is null and cycle.organizer_user_id = tournament_row.organizer_user_id))
  limit 1;

  select jsonb_build_object(
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
begin
  if auth.uid() is null or not public.can_manage_tournament_prize_scope(p_tournament_id, auth.uid()) then
    raise exception 'Only an organizer can confirm the payout.' using errcode = '42501';
  end if;
  select * into tournament_row from public.tournaments where id = p_tournament_id;
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

  insert into public.tournament_prize_cycles (organization_id, organizer_user_id)
  values (tournament_row.organization_id, tournament_row.organizer_user_id)
  returning id into next_cycle_id;
  return next_cycle_id;
end;
$$;

create or replace function public.get_my_tournament_winnings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'daily_winnings_cents', coalesce((select sum(amount_cents) from public.tournament_daily_prize_winnings where user_id = auth.uid()), 0),
    'grand_prize_winnings_cents', coalesce((select sum(pot_paid_cents) from public.tournament_prize_cycles where winner_user_id = auth.uid() and status = 'paid'), 0),
    'total_winnings_cents',
      coalesce((select sum(amount_cents) from public.tournament_daily_prize_winnings where user_id = auth.uid()), 0)
      + coalesce((select sum(pot_paid_cents) from public.tournament_prize_cycles where winner_user_id = auth.uid() and status = 'paid'), 0),
    'daily_awards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tournament_id', winning.tournament_id,
        'tournament_title', tournament.title,
        'amount_cents', winning.amount_cents,
        'awarded_at', winning.awarded_at
      ) order by winning.awarded_at desc)
      from public.tournament_daily_prize_winnings winning
      join public.tournaments tournament on tournament.id = winning.tournament_id
      where winning.user_id = auth.uid()
    ), '[]'::jsonb),
    'grand_prize_awards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'cycle_id', cycle.id,
        'amount_cents', cycle.pot_paid_cents,
        'paid_at', cycle.paid_at
      ) order by cycle.paid_at desc)
      from public.tournament_prize_cycles cycle
      where cycle.winner_user_id = auth.uid() and cycle.status = 'paid'
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.set_tournament_pot_payment(uuid, uuid, boolean) to authenticated;
grant execute on function public.get_tournament_prize_dashboard(uuid) to authenticated;
grant execute on function public.confirm_tournament_prize_payout(uuid, uuid) to authenticated;
grant execute on function public.get_my_tournament_winnings() to authenticated;

revoke all on function public.get_or_create_tournament_prize_cycle(uuid) from public, anon, authenticated;
revoke all on function public.can_manage_tournament_prize_scope(uuid, uuid) from public, anon;
