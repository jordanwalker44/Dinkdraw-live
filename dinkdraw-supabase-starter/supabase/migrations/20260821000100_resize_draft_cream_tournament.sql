create or replace function public.resize_draft_cream_tournament(
  p_tournament_id uuid,
  p_player_count integer
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
  v_courts integer;
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
    raise exception 'Only the organizer can change tournament size';
  end if;

  if v_tournament.tournament_mode <> 'cream_of_the_crop' then
    raise exception 'Tournament size can only be changed here for Cream of the Crop';
  end if;

  if v_tournament.status <> 'draft' then
    raise exception 'Tournament size is locked after the tournament starts';
  end if;

  if p_player_count < 4 or p_player_count > 40 or p_player_count % 4 <> 0 then
    raise exception 'Cream of the Crop requires 4 to 40 players in groups of 4';
  end if;

  if exists (select 1 from public.matches where tournament_id = p_tournament_id)
     or exists (select 1 from public.playoff_matches where tournament_id = p_tournament_id) then
    raise exception 'Tournament size cannot be changed after a schedule is generated';
  end if;

  -- Serialize against a player claiming or editing a spot while the roster is
  -- being resized, so a newly occupied row can never be selected for deletion.
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

  -- Keep every occupied row (and therefore every claimed player ID). Fill the
  -- remaining capacity with the earliest empty rows, then discard only extras.
  delete from public.tournament_players player
  where player.tournament_id = p_tournament_id
    and player.id in (
      select id
      from (
        select
          id,
          row_number() over (
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

  -- Move retained rows out of the positive range first to avoid collisions with
  -- the unique (tournament_id, slot_number) constraint while resequencing.
  update public.tournament_players
  set slot_number = -slot_number
  where tournament_id = p_tournament_id;

  with resequenced as (
    select id, row_number() over (order by -slot_number)::integer as next_slot
    from public.tournament_players
    where tournament_id = p_tournament_id
  )
  update public.tournament_players player
  set slot_number = resequenced.next_slot,
      updated_at = now()
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

  v_courts := p_player_count / 4;

  update public.tournaments
  set player_count = p_player_count,
      courts = v_courts,
      court_labels = array(
        select coalesce(v_tournament.court_labels[court_number], 'Court ' || court_number)
        from generate_series(1, v_courts) as court_number
      ),
      updated_at = now()
  where id = p_tournament_id;
end;
$$;

revoke all on function public.resize_draft_cream_tournament(uuid, integer) from public;
grant execute on function public.resize_draft_cream_tournament(uuid, integer) to authenticated;

comment on function public.resize_draft_cream_tournament(uuid, integer) is
  'Resizes a draft Cream of the Crop tournament while preserving all occupied and claimed player row IDs.';
