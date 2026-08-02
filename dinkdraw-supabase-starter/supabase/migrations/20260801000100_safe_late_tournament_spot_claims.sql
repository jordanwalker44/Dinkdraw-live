-- Allow a player to link their account to an existing tournament slot after
-- play starts or finishes without changing the tournament identity of that slot.

create unique index if not exists tournament_players_one_slot_per_user_idx
on public.tournament_players (tournament_id, claimed_by_user_id)
where claimed_by_user_id is not null;

create or replace function public.claim_tournament_player_spot(p_slot_id uuid)
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
  v_tournament_status text;
  v_profile_name text;
begin
  if v_user_id is null then
    raise exception 'Sign in before claiming a tournament spot';
  end if;

  select tournament_players.*
  into v_slot
  from public.tournament_players
  where tournament_players.id = p_slot_id
  for update;

  if v_slot.id is null then
    raise exception 'Tournament spot not found';
  end if;

  select status
  into v_tournament_status
  from public.tournaments
  where id = v_slot.tournament_id;

  if v_slot.claimed_by_user_id = v_user_id then
    return query
    select v_slot.tournament_id, v_tournament_status, v_slot.display_name;
    return;
  end if;

  if v_slot.claimed_by_user_id is not null then
    raise exception 'That tournament spot has already been claimed';
  end if;

  if exists (
    select 1
    from public.tournament_players
    where tournament_id = v_slot.tournament_id
      and claimed_by_user_id = v_user_id
  ) then
    raise exception 'You already claimed a spot in this tournament';
  end if;

  select nullif(trim(display_name), '')
  into v_profile_name
  from public.profiles
  where id = v_user_id;

  update public.tournament_players
  set
    claimed_by_user_id = v_user_id,
    -- Preserve an organizer-entered name so historical brackets and results do
    -- not change. Only unnamed slots adopt the account profile name.
    display_name = coalesce(
      nullif(trim(v_slot.display_name), ''),
      v_profile_name,
      'Player'
    ),
    spot_claim_push_claimed_at = null,
    spot_claim_push_completed_at = null
  where id = v_slot.id;

  -- Re-fire the existing idempotent stats trigger for every match involving
  -- this slot. This backfills completed games (and submitted best-of-three
  -- games) without changing scores, schedules, courts, or player-slot IDs.
  update public.matches
  set is_complete = is_complete
  where tournament_id = v_slot.tournament_id
    and (
      team_a_player_1_id = v_slot.id
      or team_a_player_2_id = v_slot.id
      or team_b_player_1_id = v_slot.id
      or team_b_player_2_id = v_slot.id
    );

  return query
  select
    v_slot.tournament_id,
    v_tournament_status,
    coalesce(nullif(trim(v_slot.display_name), ''), v_profile_name, 'Player');
end;
$$;

revoke all on function public.claim_tournament_player_spot(uuid) from public, anon;
grant execute on function public.claim_tournament_player_spot(uuid) to authenticated;

-- Claims now go through the atomic function above. Tournament organizers and
-- co-organizers retain their separate management policies.
drop policy if exists "Claim player slot" on public.tournament_players;

comment on function public.claim_tournament_player_spot(uuid)
is 'Atomically links the signed-in user to one existing tournament slot and rebuilds that slot''s historical match stats without changing tournament results.';

create or replace function public.unlink_tournament_player_account(p_slot_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_manager_id uuid := auth.uid();
  v_slot public.tournament_players;
begin
  if v_manager_id is null then
    raise exception 'Sign in before unlinking a tournament account';
  end if;

  select tournament_players.*
  into v_slot
  from public.tournament_players
  where tournament_players.id = p_slot_id
  for update;

  if v_slot.id is null then
    raise exception 'Tournament spot not found';
  end if;

  if not exists (
    select 1
    from public.tournaments
    where id = v_slot.tournament_id
      and (
        organizer_user_id = v_manager_id
        or co_organizer_user_id = v_manager_id
      )
  ) then
    raise exception 'Only a tournament organizer can unlink this account';
  end if;

  if v_slot.claimed_by_user_id is null then
    raise exception 'This tournament spot is not linked to an account';
  end if;

  update public.tournament_players
  set
    claimed_by_user_id = null,
    spot_claim_push_claimed_at = null,
    spot_claim_push_completed_at = null
  where id = v_slot.id;

  -- Rebuild each affected match after removing the account link. The existing
  -- trigger removes the incorrect user's personal stats while preserving every
  -- score and recreating stats for the accounts that remain correctly linked.
  update public.matches
  set is_complete = is_complete
  where tournament_id = v_slot.tournament_id
    and (
      team_a_player_1_id = v_slot.id
      or team_a_player_2_id = v_slot.id
      or team_b_player_1_id = v_slot.id
      or team_b_player_2_id = v_slot.id
    );

  return v_slot.tournament_id;
end;
$$;

revoke all on function public.unlink_tournament_player_account(uuid) from public, anon;
grant execute on function public.unlink_tournament_player_account(uuid) to authenticated;

comment on function public.unlink_tournament_player_account(uuid)
is 'Lets a tournament organizer remove an incorrect account link while preserving the player name, slot, schedule, scores, standings, and tournament results.';
