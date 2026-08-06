create or replace function public.search_co_organizer_accounts(
  p_tournament_id uuid,
  p_query text
)
returns table (
  user_id uuid,
  display_name text,
  masked_email text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.tournaments tournament
    where tournament.id = p_tournament_id
      and tournament.organizer_user_id = auth.uid()
  ) then
    raise exception 'Only the tournament organizer can search for a co-organizer.'
      using errcode = '42501';
  end if;

  if length(btrim(p_query)) < 3 then
    raise exception 'Enter at least 3 characters of the person''s name.';
  end if;

  return query
  select
    profile.id,
    profile.display_name,
    case
      when position('@' in profile.email) > 1 then
        left(profile.email, 2) || '***@' || split_part(profile.email, '@', 2)
      else 'Account email hidden'
    end
  from public.profiles profile
  where profile.display_name ilike '%' || btrim(p_query) || '%'
    and profile.id <> auth.uid()
  order by
    case when lower(profile.display_name) = lower(btrim(p_query)) then 0 else 1 end,
    profile.display_name
  limit 10;
end;
$$;

create or replace function public.assign_tournament_co_organizer_by_user_id(
  p_tournament_id uuid,
  p_co_organizer_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_co_organizer_email text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.tournaments tournament
    where tournament.id = p_tournament_id
      and tournament.organizer_user_id = auth.uid()
  ) then
    raise exception 'Only the tournament organizer can assign a co-organizer.'
      using errcode = '42501';
  end if;

  if p_co_organizer_user_id = auth.uid() then
    raise exception 'The organizer is already assigned to this tournament.';
  end if;

  select profile.email into v_co_organizer_email
  from public.profiles profile
  where profile.id = p_co_organizer_user_id;

  if v_co_organizer_email is null then
    raise exception 'DinkDraw account not found.';
  end if;

  update public.tournaments
  set co_organizer_email = v_co_organizer_email,
      co_organizer_user_id = p_co_organizer_user_id
  where id = p_tournament_id;
end;
$$;

revoke all on function public.search_co_organizer_accounts(uuid, text) from public, anon;
revoke all on function public.assign_tournament_co_organizer_by_user_id(uuid, uuid) from public, anon;
grant execute on function public.search_co_organizer_accounts(uuid, text) to authenticated;
grant execute on function public.assign_tournament_co_organizer_by_user_id(uuid, uuid) to authenticated;
