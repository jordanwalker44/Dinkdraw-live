-- Private location usage reporting for DinkDraw administrators.
--
-- A participant use is a filled tournament roster spot:
--   * claimed: claimed_by_user_id is present
--   * manual: display_name is present without a claim
-- Empty placeholder slots are intentionally excluded.

create or replace function public.admin_get_location_usage_report()
returns table (
  location text,
  tournament_count bigint,
  participant_uses bigint,
  claimed_uses bigint,
  manual_uses bigint,
  distinct_claimed_accounts bigint,
  latest_tournament_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_dinkdraw_admin() then
    raise exception 'Not authorized';
  end if;

  return query
  select
    coalesce(nullif(trim(tournaments.location), ''), 'No location entered') as location,
    count(distinct tournaments.id)::bigint as tournament_count,
    count(tournament_players.id)::bigint as participant_uses,
    count(tournament_players.claimed_by_user_id)::bigint as claimed_uses,
    count(*) filter (
      where tournament_players.claimed_by_user_id is null
    )::bigint as manual_uses,
    count(distinct tournament_players.claimed_by_user_id)::bigint as distinct_claimed_accounts,
    max(
      coalesce(
        tournaments.started_at,
        tournaments.event_date::timestamptz,
        tournaments.created_at
      )
    )
      as latest_tournament_at
  from public.tournaments
  join public.tournament_players
    on tournament_players.tournament_id = tournaments.id
  where tournament_players.claimed_by_user_id is not null
     or nullif(trim(tournament_players.display_name), '') is not null
  group by coalesce(nullif(trim(tournaments.location), ''), 'No location entered')
  order by participant_uses desc, latest_tournament_at desc nulls last;
end;
$$;

revoke all on function public.admin_get_location_usage_report() from public;
revoke all on function public.admin_get_location_usage_report() from anon;
grant execute on function public.admin_get_location_usage_report() to authenticated;
grant execute on function public.admin_get_location_usage_report() to service_role;

notify pgrst, 'reload schema';
