alter table public.moneyball_series
  add column if not exists is_test boolean not null default false;

drop policy if exists "Moneyball series are publicly visible" on public.moneyball_series;
create policy "Live series are public and test series are private"
on public.moneyball_series for select
using (
  not is_test
  or organizer_user_id = auth.uid()
  or exists (
    select 1 from public.organization_members member
    where member.organization_id = moneyball_series.organization_id
      and member.user_id = auth.uid()
      and member.role in ('owner', 'admin')
  )
);

alter table public.tournaments
  drop constraint if exists tournaments_test_mode_not_moneyball_check;

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
  if new.test_mode is distinct from series_row.is_test then
    raise exception 'Test tournaments must use a private Test Moneyball Series, and live tournaments must use a live series.';
  end if;
  return new;
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
    'daily_winnings_cents', coalesce((
      select sum(winning.amount_cents)
      from public.tournament_daily_prize_winnings winning
      join public.tournaments tournament on tournament.id = winning.tournament_id
      left join public.moneyball_series series on series.id = tournament.moneyball_series_id
      where winning.user_id = auth.uid() and coalesce(series.is_test, false) = false
    ), 0),
    'grand_prize_winnings_cents', coalesce((
      select sum(cycle.pot_paid_cents)
      from public.tournament_prize_cycles cycle
      left join public.moneyball_series series on series.id = cycle.moneyball_series_id
      where cycle.winner_user_id = auth.uid()
        and cycle.status = 'paid'
        and coalesce(series.is_test, false) = false
    ), 0),
    'total_winnings_cents',
      coalesce((
        select sum(winning.amount_cents)
        from public.tournament_daily_prize_winnings winning
        join public.tournaments tournament on tournament.id = winning.tournament_id
        left join public.moneyball_series series on series.id = tournament.moneyball_series_id
        where winning.user_id = auth.uid() and coalesce(series.is_test, false) = false
      ), 0)
      + coalesce((
        select sum(cycle.pot_paid_cents)
        from public.tournament_prize_cycles cycle
        left join public.moneyball_series series on series.id = cycle.moneyball_series_id
        where cycle.winner_user_id = auth.uid()
          and cycle.status = 'paid'
          and coalesce(series.is_test, false) = false
      ), 0),
    'daily_awards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tournament_id', winning.tournament_id,
        'tournament_title', tournament.title,
        'amount_cents', winning.amount_cents,
        'awarded_at', winning.awarded_at
      ) order by winning.awarded_at desc)
      from public.tournament_daily_prize_winnings winning
      join public.tournaments tournament on tournament.id = winning.tournament_id
      left join public.moneyball_series series on series.id = tournament.moneyball_series_id
      where winning.user_id = auth.uid() and coalesce(series.is_test, false) = false
    ), '[]'::jsonb),
    'grand_prize_awards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'cycle_id', cycle.id,
        'amount_cents', cycle.pot_paid_cents,
        'paid_at', cycle.paid_at
      ) order by cycle.paid_at desc)
      from public.tournament_prize_cycles cycle
      left join public.moneyball_series series on series.id = cycle.moneyball_series_id
      where cycle.winner_user_id = auth.uid()
        and cycle.status = 'paid'
        and coalesce(series.is_test, false) = false
    ), '[]'::jsonb)
  );
$$;

comment on column public.moneyball_series.is_test is
  'Private organizer-only series used to exercise Moneyball pots, wins, and payout resets without affecting public or personal live totals.';
