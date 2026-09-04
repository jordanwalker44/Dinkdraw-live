create or replace function public.end_pool_play_early(p_tournament_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament public.tournaments%rowtype;
  v_round record;
  v_completed_through integer := 0;
  v_max_round integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Sign in to end pool play.' using errcode = '42501';
  end if;

  select * into v_tournament
  from public.tournaments
  where id = p_tournament_id
  for update;

  if not found then raise exception 'Tournament not found.'; end if;
  if v_tournament.organizer_user_id is distinct from auth.uid()
     and v_tournament.co_organizer_user_id is distinct from auth.uid() then
    raise exception 'Only an organizer can end pool play.' using errcode = '42501';
  end if;
  if not v_tournament.pool_brackets_enabled then
    raise exception 'This tournament does not use pool play and postseason brackets.';
  end if;
  if v_tournament.status <> 'started' or coalesce(v_tournament.playoff_status, 'not_started') <> 'not_started' then
    raise exception 'Pool play can only be shortened before postseason brackets are generated.';
  end if;
  if exists (select 1 from public.playoff_matches where tournament_id = p_tournament_id) then
    raise exception 'Postseason brackets have already been generated.';
  end if;

  select coalesce(max(round_number), 0) into v_max_round
  from public.matches
  where tournament_id = p_tournament_id;

  for v_round in
    select
      match.round_number,
      bool_and(match.is_bye or match.is_complete) as is_complete,
      bool_or(
        not match.is_bye and (
          match.is_complete
          or match.team_a_score is not null or match.team_b_score is not null
          or match.game_1_a is not null or match.game_1_b is not null
          or match.game_2_a is not null or match.game_2_b is not null
          or match.game_3_a is not null or match.game_3_b is not null
        )
      ) as has_activity
    from public.matches match
    where match.tournament_id = p_tournament_id
    group by match.round_number
    order by match.round_number
  loop
    if v_round.is_complete then
      if v_completed_through + 1 <> v_round.round_number then
        raise exception 'Pool-play rounds must be completed in order before advancing.';
      end if;
      v_completed_through := v_round.round_number;
    else
      if v_round.has_activity then
        raise exception 'Round % is partially played. Finish it or clear its scores before starting postseason.', v_round.round_number;
      end if;
      exit;
    end if;
  end loop;

  if v_completed_through < 1 then
    raise exception 'Complete at least one full pool-play round before starting postseason.';
  end if;
  if v_completed_through >= v_max_round then
    raise exception 'Pool play is already complete. Generate the postseason brackets normally.';
  end if;
  if exists (
    select 1
    from public.matches match
    where match.tournament_id = p_tournament_id
      and match.round_number > v_completed_through
      and not match.is_bye
      and (
        match.is_complete
        or match.team_a_score is not null or match.team_b_score is not null
        or match.game_1_a is not null or match.game_1_b is not null
        or match.game_2_a is not null or match.game_2_b is not null
        or match.game_3_a is not null or match.game_3_b is not null
      )
  ) then
    raise exception 'A future pool-play round contains scores. Clear those scores before starting postseason.';
  end if;

  delete from public.matches
  where tournament_id = p_tournament_id
    and round_number > v_completed_through;

  update public.tournaments
  set rounds = v_completed_through
  where id = p_tournament_id;

  return v_completed_through;
end;
$$;

revoke all on function public.end_pool_play_early(uuid) from public, anon;
grant execute on function public.end_pool_play_early(uuid) to authenticated;

comment on function public.end_pool_play_early(uuid) is
  'Ends pool play after the last wholly completed round and removes untouched future rounds before postseason generation.';
