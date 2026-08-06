drop function if exists public.claim_tournament_player_spot(uuid);

create function public.claim_tournament_player_spot(
  p_slot_id uuid,
  p_gender text
)
returns table (
  claimed_tournament_id uuid,
  tournament_status text,
  claimed_display_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_slot public.tournament_players;
  v_tournament public.tournaments;
  v_profile_name text;
  v_gender text := nullif(lower(btrim(p_gender)), '');
begin
  if v_user_id is null then
    raise exception 'Sign in before claiming a tournament spot';
  end if;

  select tournament_players.* into v_slot
  from public.tournament_players
  where tournament_players.id = p_slot_id
  for update;

  if v_slot.id is null then raise exception 'Tournament spot not found'; end if;

  select tournaments.* into v_tournament
  from public.tournaments
  where tournaments.id = v_slot.tournament_id;

  if v_tournament.format = 'doubles' and v_tournament.doubles_mode = 'mixed'
     and v_gender not in ('male', 'female') then
    raise exception 'Choose Male or Female before claiming this mixed doubles spot.';
  end if;

  if v_slot.claimed_by_user_id = v_user_id then
    if v_tournament.format = 'doubles' and v_tournament.doubles_mode = 'mixed' then
      update public.tournament_players set gender = v_gender where id = v_slot.id;
    end if;
    return query select v_slot.tournament_id, v_tournament.status, v_slot.display_name;
    return;
  end if;

  if v_slot.claimed_by_user_id is not null then
    raise exception 'That tournament spot has already been claimed';
  end if;

  if exists (
    select 1 from public.tournament_players
    where tournament_id = v_slot.tournament_id and claimed_by_user_id = v_user_id
  ) then
    raise exception 'You already claimed a spot in this tournament';
  end if;

  select nullif(trim(display_name), '') into v_profile_name
  from public.profiles where id = v_user_id;

  update public.tournament_players
  set claimed_by_user_id = v_user_id,
      display_name = coalesce(nullif(trim(v_slot.display_name), ''), v_profile_name, 'Player'),
      gender = case
        when v_tournament.format = 'doubles' and v_tournament.doubles_mode = 'mixed' then v_gender
        else gender
      end,
      spot_claim_push_claimed_at = null,
      spot_claim_push_completed_at = null
  where id = v_slot.id;

  update public.matches set is_complete = is_complete
  where tournament_id = v_slot.tournament_id
    and (team_a_player_1_id = v_slot.id or team_a_player_2_id = v_slot.id
      or team_b_player_1_id = v_slot.id or team_b_player_2_id = v_slot.id);

  return query select v_slot.tournament_id, v_tournament.status,
    coalesce(nullif(trim(v_slot.display_name), ''), v_profile_name, 'Player');
end;
$$;

revoke all on function public.claim_tournament_player_spot(uuid, text) from public, anon;
grant execute on function public.claim_tournament_player_spot(uuid, text) to authenticated;

comment on function public.claim_tournament_player_spot(uuid, text) is
'Atomically claims a tournament spot and requires/stores Male or Female for mixed doubles claims.';
