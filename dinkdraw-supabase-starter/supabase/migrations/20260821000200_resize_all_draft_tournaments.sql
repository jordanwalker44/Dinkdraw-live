create or replace function public.resize_draft_tournament(
  p_tournament_id uuid,
  p_player_count integer,
  p_courts integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament public.tournaments;
  v_occupied_count integer;
  v_existing_count integer;
  v_min_players integer;
  v_players_per_court integer;
  v_max_courts integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_tournament
  from public.tournaments
  where id = p_tournament_id
  for update;

  if not found then raise exception 'Tournament not found'; end if;
  if v_tournament.organizer_user_id <> auth.uid() then
    raise exception 'Only the organizer can change tournament size';
  end if;
  if v_tournament.status <> 'draft' then
    raise exception 'Tournament size is locked after the tournament starts';
  end if;
  if exists (select 1 from public.matches where tournament_id = p_tournament_id)
     or exists (select 1 from public.playoff_matches where tournament_id = p_tournament_id) then
    raise exception 'Tournament size cannot be changed after a schedule is generated';
  end if;

  v_min_players := case when v_tournament.format = 'singles' then 3 else 4 end;
  v_players_per_court := case when v_tournament.format = 'singles' then 2 else 4 end;
  v_max_courts := greatest(1, floor(p_player_count::numeric / v_players_per_court)::integer);

  if p_player_count < v_min_players or p_player_count > 40 then
    raise exception '% tournaments require % to 40 players', initcap(v_tournament.format), v_min_players;
  end if;
  if p_courts < 1 or p_courts > v_max_courts then
    raise exception 'This roster supports 1 to % courts', v_max_courts;
  end if;
  if v_tournament.tournament_mode = 'cream_of_the_crop'
     and (p_player_count % 4 <> 0 or p_courts <> p_player_count / 4) then
    raise exception 'Cream of the Crop requires groups of 4 with one court per group';
  end if;
  if coalesce(v_tournament.pool_brackets_enabled, false) then
    if v_tournament.pool_count is null or p_player_count % v_tournament.pool_count <> 0 then
      raise exception 'Players must divide evenly across the tournament''s % pools', v_tournament.pool_count;
    end if;
    if p_courts < v_tournament.pool_count then
      raise exception 'Pool play requires at least % courts', v_tournament.pool_count;
    end if;
    if v_tournament.doubles_mode = 'mixed'
       and (p_player_count / v_tournament.pool_count) % 2 <> 0 then
      raise exception 'Each mixed pool must contain an even number of players';
    end if;
  end if;

  -- Serialize against claims and edits so a newly occupied row cannot be
  -- selected for deletion during the resize.
  perform id
  from public.tournament_players
  where tournament_id = p_tournament_id
  order by slot_number
  for update;

  select count(*) into v_occupied_count
  from public.tournament_players
  where tournament_id = p_tournament_id
    and (
      claimed_by_user_id is not null
      or nullif(btrim(coalesce(display_name, '')), '') is not null
      or nullif(btrim(coalesce(dupr_id, '')), '') is not null
      or gender is not null
    );

  if v_occupied_count > p_player_count then
    raise exception 'This tournament has % occupied spots. Clear players before reducing it to % spots',
      v_occupied_count, p_player_count;
  end if;

  -- Keep every occupied row, preserving its ID and account claim. Use the
  -- earliest empty rows for remaining capacity and remove only surplus empties.
  delete from public.tournament_players player
  where player.tournament_id = p_tournament_id
    and player.id in (
      select id from (
        select id, row_number() over (
          order by
            case when claimed_by_user_id is not null
                   or nullif(btrim(coalesce(display_name, '')), '') is not null
                   or nullif(btrim(coalesce(dupr_id, '')), '') is not null
                   or gender is not null then 0 else 1 end,
            slot_number
        ) as keep_rank
        from public.tournament_players
        where tournament_id = p_tournament_id
      ) ranked
      where keep_rank > p_player_count
    );

  -- Temporarily use negative slots to avoid unique-key collisions while
  -- compacting gaps left by removed empty rows.
  update public.tournament_players
  set slot_number = -slot_number
  where tournament_id = p_tournament_id;

  with resequenced as (
    select id, row_number() over (order by -slot_number)::integer as next_slot
    from public.tournament_players
    where tournament_id = p_tournament_id
  )
  update public.tournament_players player
  set slot_number = resequenced.next_slot, updated_at = now()
  from resequenced
  where player.id = resequenced.id;

  select count(*) into v_existing_count
  from public.tournament_players
  where tournament_id = p_tournament_id;

  if v_existing_count < p_player_count then
    insert into public.tournament_players (tournament_id, slot_number, display_name)
    select p_tournament_id, slot_number, ''
    from generate_series(v_existing_count + 1, p_player_count) as slot_number;
  end if;

  update public.tournaments
  set player_count = p_player_count,
      courts = p_courts,
      court_labels = array(
        select coalesce(v_tournament.court_labels[court_number], 'Court ' || court_number)
        from generate_series(1, p_courts) as court_number
      ),
      playoff_advance_count = case
        when playoff_format = 'everyone' then p_player_count
        when playoff_advance_count is not null then least(playoff_advance_count, p_player_count)
        else null
      end,
      updated_at = now()
  where id = p_tournament_id;
end;
$$;

revoke all on function public.resize_draft_tournament(uuid, integer, integer) from public;
grant execute on function public.resize_draft_tournament(uuid, integer, integer) to authenticated;

comment on function public.resize_draft_tournament(uuid, integer, integer) is
  'Resizes any draft tournament while preserving all occupied and claimed player row IDs.';
