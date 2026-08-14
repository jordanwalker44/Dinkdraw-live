create or replace function public.replace_tournament_rounds_before_scores(
  p_tournament_id uuid,
  p_rounds integer,
  p_schedule jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament public.tournaments;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_tournament
  from public.tournaments
  where id = p_tournament_id
  for update;

  if not found then
    raise exception 'Tournament not found';
  end if;

  if v_tournament.organizer_user_id <> auth.uid() then
    raise exception 'Only the organizer can change the number of rounds';
  end if;

  if v_tournament.tournament_mode <> 'round_robin' then
    raise exception 'Rounds can only be changed for round robin tournaments';
  end if;

  if v_tournament.status = 'completed' then
    raise exception 'Completed tournaments cannot be changed';
  end if;

  if p_rounds < 1 or p_rounds > 30 then
    raise exception 'Rounds must be between 1 and 30';
  end if;

  if exists (
    select 1 from public.playoff_matches
    where tournament_id = p_tournament_id
  ) then
    raise exception 'Rounds cannot be changed after postseason brackets are generated';
  end if;

  if exists (
    select 1 from public.matches
    where tournament_id = p_tournament_id
      and (
        team_a_score is not null or team_b_score is not null or
        game_1_a is not null or game_1_b is not null or
        game_2_a is not null or game_2_b is not null or
        game_3_a is not null or game_3_b is not null
      )
  ) then
    raise exception 'Rounds cannot be changed after a score has been entered';
  end if;

  if v_tournament.status = 'started' and jsonb_array_length(coalesce(p_schedule, '[]'::jsonb)) = 0 then
    raise exception 'A replacement schedule is required for a started tournament';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_schedule, '[]'::jsonb)) as row(
      round_number integer,
      court_number integer,
      court_label text,
      team_a_player_1_id uuid,
      team_a_player_2_id uuid,
      team_b_player_1_id uuid,
      team_b_player_2_id uuid,
      team_a_score integer,
      team_b_score integer,
      is_bye boolean,
      is_complete boolean
    )
    where row.round_number < 1
       or row.round_number > p_rounds
       or row.court_number < 1
       or exists (
         select 1
         from unnest(array[
           row.team_a_player_1_id,
           row.team_a_player_2_id,
           row.team_b_player_1_id,
           row.team_b_player_2_id
         ]) as ids(player_id)
         where ids.player_id is not null
           and not exists (
             select 1 from public.tournament_players player
             where player.id = ids.player_id
               and player.tournament_id = p_tournament_id
           )
       )
  ) then
    raise exception 'Replacement schedule contains invalid tournament data';
  end if;

  update public.tournaments
  set rounds = p_rounds,
      updated_at = now()
  where id = p_tournament_id;

  delete from public.matches where tournament_id = p_tournament_id;

  if v_tournament.status = 'started' then
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
      null, null, coalesce(row.is_bye, false), coalesce(row.is_complete, false)
    from jsonb_to_recordset(p_schedule) as row(
      round_number integer,
      court_number integer,
      court_label text,
      team_a_player_1_id uuid,
      team_a_player_2_id uuid,
      team_b_player_1_id uuid,
      team_b_player_2_id uuid,
      team_a_score integer,
      team_b_score integer,
      is_bye boolean,
      is_complete boolean
    );
  end if;
end;
$$;

revoke all on function public.replace_tournament_rounds_before_scores(uuid, integer, jsonb) from public;
grant execute on function public.replace_tournament_rounds_before_scores(uuid, integer, jsonb) to authenticated;

comment on function public.replace_tournament_rounds_before_scores(uuid, integer, jsonb) is
  'Atomically changes round count and regenerates a started round robin schedule before any score or postseason bracket exists.';
