create or replace function public.find_tournament_by_join_code(p_join_code text)
returns table (
  id uuid,
  title text,
  join_code text,
  status text
)
language sql
stable
security definer
set search_path = public
as $$
  select tournament.id, tournament.title, tournament.join_code, tournament.status
  from public.tournaments tournament
  where upper(regexp_replace(tournament.join_code, '[^a-zA-Z0-9]', '', 'g')) =
        upper(regexp_replace(coalesce(p_join_code, ''), '[^a-zA-Z0-9]', '', 'g'))
  order by tournament.created_at desc
  limit 1;
$$;

revoke all on function public.find_tournament_by_join_code(text) from public;
grant execute on function public.find_tournament_by_join_code(text) to anon, authenticated;

comment on function public.find_tournament_by_join_code(text) is
'Looks up the limited tournament routing fields for a normalized join code without exposing other private tournament data.';
