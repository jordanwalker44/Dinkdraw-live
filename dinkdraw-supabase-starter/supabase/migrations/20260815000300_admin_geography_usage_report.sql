-- Distinct signed-in players and tournaments per saved tournament location.
-- The admin UI groups these location rows into countries and U.S. states.
create or replace function public.admin_get_geography_usage_report()
returns table (
  location text,
  tournament_count bigint,
  tournament_ids uuid[],
  claimed_user_ids uuid[]
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
    coalesce(nullif(btrim(t.location), ''), 'No location entered') as location,
    count(distinct t.id)::bigint as tournament_count,
    array_agg(distinct t.id) as tournament_ids,
    coalesce(
      array_agg(distinct tp.claimed_by_user_id)
        filter (where tp.claimed_by_user_id is not null),
      array[]::uuid[]
    ) as claimed_user_ids
  from public.tournaments t
  left join public.tournament_players tp on tp.tournament_id = t.id
  where t.started_at is not null or t.status in ('started', 'completed')
  group by coalesce(nullif(btrim(t.location), ''), 'No location entered')
  order by count(distinct tp.claimed_by_user_id) desc, count(distinct t.id) desc;
end;
$$;

revoke all on function public.admin_get_geography_usage_report() from public;
revoke all on function public.admin_get_geography_usage_report() from anon;
grant execute on function public.admin_get_geography_usage_report() to authenticated;
grant execute on function public.admin_get_geography_usage_report() to service_role;

notify pgrst, 'reload schema';
