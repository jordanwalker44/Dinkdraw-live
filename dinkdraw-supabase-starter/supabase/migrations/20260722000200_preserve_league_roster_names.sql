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
    and user_id is null;

  if not found then raise exception 'That roster position is unavailable'; end if;
  return target_league_id;
end;
$$;

revoke all on function public.claim_league_roster_spot(text, integer) from public, anon;
grant execute on function public.claim_league_roster_spot(text, integer) to authenticated;
