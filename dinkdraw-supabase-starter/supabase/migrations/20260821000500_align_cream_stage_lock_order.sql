create or replace function public.create_cream_stage_matches(
  p_tournament_id uuid,
  p_starting_round integer,
  p_schedule jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament public.tournaments;
  v_stage_end integer;
  v_expected_courts integer;
  v_expected_matches integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_tournament
  from public.tournaments
  where id = p_tournament_id
  for update;

  if not found then raise exception 'Tournament not found'; end if;
  if v_tournament.organizer_user_id <> auth.uid()
     and v_tournament.co_organizer_user_id is distinct from auth.uid() then
    raise exception 'Only an organizer can generate a Cream of the Crop stage';
  end if;
  if v_tournament.tournament_mode <> 'cream_of_the_crop' then
    raise exception 'This is not a Cream of the Crop tournament';
  end if;
  if v_tournament.status <> 'started' then
    raise exception 'The tournament must be started before generating another stage';
  end if;
  if p_starting_round not in (4, 7) then
    raise exception 'Cream stages can only begin at round 4 or round 7';
  end if;

  v_stage_end := p_starting_round + 2;
  v_expected_courts := v_tournament.player_count / 4;
  v_expected_matches := v_expected_courts * 3;

  -- The tournament row lock makes this check-and-insert atomic. Concurrent
  -- taps or organizer devices serialize here, and only the first can insert.
  if exists (
    select 1 from public.matches
    where tournament_id = p_tournament_id
      and round_number between p_starting_round and v_stage_end
  ) then
    raise exception 'This Cream of the Crop stage has already been created';
  end if;

  if exists (
    select 1 from public.matches
    where tournament_id = p_tournament_id
      and round_number between p_starting_round - 3 and p_starting_round - 1
      and not is_complete
  ) or (
    select count(*) from public.matches
    where tournament_id = p_tournament_id
      and round_number between p_starting_round - 3 and p_starting_round - 1
  ) <> v_expected_matches then
    raise exception 'The previous Cream of the Crop stage must be complete before generating the next one';
  end if;

  if jsonb_typeof(p_schedule) <> 'array'
     or jsonb_array_length(p_schedule) <> v_expected_matches then
    raise exception 'The Cream schedule must contain exactly % matches', v_expected_matches;
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_schedule) as row(
      round_number integer,
      court_number integer,
      court_label text,
      team_a_player_1_id uuid,
      team_a_player_2_id uuid,
      team_b_player_1_id uuid,
      team_b_player_2_id uuid,
      is_bye boolean,
      is_complete boolean
    )
    where row.round_number not between p_starting_round and v_stage_end
       or row.court_number not between 1 and v_expected_courts
       or coalesce(row.is_bye, false)
       or coalesce(row.is_complete, false)
       or row.team_a_player_1_id is null
       or row.team_a_player_2_id is null
       or row.team_b_player_1_id is null
       or row.team_b_player_2_id is null
  ) then
    raise exception 'The Cream schedule contains an invalid match';
  end if;

  -- Every round must contain one card per court, with every tournament player
  -- appearing exactly once. This rejects duplicate/missing player cards before
  -- any row is written.
  if exists (
    with schedule as (
      select *
      from jsonb_to_recordset(p_schedule) as row(
        round_number integer,
        court_number integer,
        team_a_player_1_id uuid,
        team_a_player_2_id uuid,
        team_b_player_1_id uuid,
        team_b_player_2_id uuid
      )
    ), appearances as (
      select round_number, court_number, player_id
      from schedule
      cross join lateral unnest(array[
        team_a_player_1_id, team_a_player_2_id,
        team_b_player_1_id, team_b_player_2_id
      ]) as player_id
    )
    select 1
    from (
      select round_number
      from schedule
      group by round_number
      having count(*) <> v_expected_courts
         or count(distinct court_number) <> v_expected_courts

      union all

      select round_number
      from appearances
      group by round_number
      having count(*) <> v_tournament.player_count
         or count(distinct player_id) <> v_tournament.player_count

      union all

      select appearances.round_number
      from appearances
      left join public.tournament_players player
        on player.id = appearances.player_id
       and player.tournament_id = p_tournament_id
      group by appearances.round_number
      having count(player.id) <> v_tournament.player_count
    ) invalid
  ) then
    raise exception 'Each Cream round must contain every player exactly once on one court';
  end if;

  insert into public.matches (
    tournament_id, round_number, court_number, court_label,
    team_a_player_1_id, team_a_player_2_id,
    team_b_player_1_id, team_b_player_2_id,
    team_a_score, team_b_score, is_bye, is_complete
  )
  select
    p_tournament_id, row.round_number, row.court_number, row.court_label,
    row.team_a_player_1_id, row.team_a_player_2_id,
    row.team_b_player_1_id, row.team_b_player_2_id,
    null, null, false, false
  from jsonb_to_recordset(p_schedule) as row(
    round_number integer,
    court_number integer,
    court_label text,
    team_a_player_1_id uuid,
    team_a_player_2_id uuid,
    team_b_player_1_id uuid,
    team_b_player_2_id uuid
  );
end;
$$;

revoke all on function public.create_cream_stage_matches(uuid, integer, jsonb) from public;
grant execute on function public.create_cream_stage_matches(uuid, integer, jsonb) to authenticated;

comment on function public.create_cream_stage_matches(uuid, integer, jsonb) is
  'Atomically validates and inserts a Cream stage, preventing duplicate cards from concurrent generation attempts.';
