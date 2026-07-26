do $migration$
declare
  function_definition text;
  old_roster_requirement text := $old$  if exists (
    select 1 from public.league_members
    where league_id = league_row.id and member_type = 'regular'
      and (user_id is null or nullif(btrim(display_name), '') is null)
  ) then raise exception 'Every regular roster position must be claimed before starting'; end if;$old$;
  new_roster_requirement text := $new$  if exists (
    select 1 from public.league_members
    where league_id = league_row.id and member_type = 'regular'
      and nullif(btrim(display_name), '') is null
  ) then raise exception 'Every regular roster position needs a player name before starting'; end if;$new$;
  old_account_requirement text := $old$      if actual_user_id is null then raise exception 'Every actual player must have a DinkDraw account'; end if;
$old$;
begin
  select pg_get_functiondef('public.start_league_session_tournament(uuid)'::regprocedure)
  into function_definition;

  if position(old_roster_requirement in function_definition) = 0 then
    raise exception 'Could not find the League roster requirement to update';
  end if;

  if position(old_account_requirement in function_definition) = 0 then
    raise exception 'Could not find the League player account requirement to update';
  end if;

  function_definition := replace(function_definition, old_roster_requirement, new_roster_requirement);
  function_definition := replace(function_definition, old_account_requirement, '');
  execute function_definition;
end;
$migration$;

create or replace function public.claim_league_roster_spot(
  p_join_code text,
  p_roster_position integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_league_id uuid;
  target_member_id uuid;
  profile_name text;
begin
  if auth.uid() is null then raise exception 'Sign in to join a league'; end if;

  select id into target_league_id
  from public.leagues
  where upper(join_code) = upper(btrim(p_join_code))
    and status in ('draft', 'active');

  if target_league_id is null then raise exception 'League code not found'; end if;
  if exists (select 1 from public.league_members where league_id = target_league_id and user_id = auth.uid()) then
    return target_league_id;
  end if;

  select display_name into profile_name from public.profiles where id = auth.uid();

  update public.league_members
  set user_id = auth.uid(),
      display_name = coalesce(nullif(btrim(display_name), ''), nullif(btrim(profile_name), '')),
      status = 'active',
      updated_at = now()
  where league_id = target_league_id
    and member_type = 'regular'
    and roster_position = p_roster_position
    and user_id is null
  returning id into target_member_id;

  if target_member_id is null then raise exception 'That roster position is unavailable'; end if;

  update public.tournament_players tournament_player
  set claimed_by_user_id = auth.uid()
  from public.league_session_players session_player
  where session_player.regular_member_id = target_member_id
    and session_player.actual_member_id = target_member_id
    and session_player.tournament_player_id = tournament_player.id
    and tournament_player.claimed_by_user_id is null;

  return target_league_id;
end;
$$;

revoke all on function public.claim_league_roster_spot(text, integer) from public, anon;
grant execute on function public.claim_league_roster_spot(text, integer) to authenticated;
