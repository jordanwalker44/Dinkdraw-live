create or replace function public.search_training_partners(search_term text)
returns table (
  id uuid,
  display_name text
)
language sql
stable
security definer
set search_path = public
as $$
  with search_values as (
    select
      lower(trim(search_term)) as plain,
      regexp_replace(lower(trim(search_term)), '[^a-z0-9]', '', 'g') as compact
  ),
  player_names as (
    select profiles.id, profiles.display_name, 1 as source_priority
    from public.profiles

    union all

    select tournament_players.claimed_by_user_id, tournament_players.display_name, 2
    from public.tournament_players
    where tournament_players.claimed_by_user_id is not null
      and nullif(trim(tournament_players.display_name), '') is not null
  ),
  matches as (
    select
      player_names.id,
      player_names.display_name,
      player_names.source_priority
    from player_names
    cross join search_values
    where player_names.id <> auth.uid()
      and length(search_values.compact) >= 2
      and (
        lower(player_names.display_name) like '%' || search_values.plain || '%'
        or regexp_replace(lower(player_names.display_name), '[^a-z0-9]', '', 'g')
          like '%' || search_values.compact || '%'
      )
  ),
  one_name_per_player as (
    select distinct on (matches.id)
      matches.id,
      matches.display_name
    from matches
    order by matches.id, matches.source_priority, length(matches.display_name)
  )
  select one_name_per_player.id, one_name_per_player.display_name
  from one_name_per_player
  order by one_name_per_player.display_name
  limit 10;
$$;

revoke all on function public.search_training_partners(text) from public;
grant execute on function public.search_training_partners(text) to authenticated;
