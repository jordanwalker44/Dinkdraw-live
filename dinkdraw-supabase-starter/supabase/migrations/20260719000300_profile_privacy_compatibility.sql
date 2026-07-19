-- Compatibility release for profile privacy.
--
-- This intentionally does not remove the existing public profiles policy yet.
-- Deploy the safe interfaces and compatible application reads first. A later,
-- separately reviewed migration will close direct public access to profiles.

create or replace view public.public_profiles
with (security_barrier = true)
as
select
  profiles.id,
  profiles.display_name
from public.profiles;

revoke all on table public.public_profiles from public;
revoke all on table public.public_profiles from anon;
revoke all on table public.public_profiles from authenticated;

grant select on table public.public_profiles to anon;
grant select on table public.public_profiles to authenticated;
grant select on table public.public_profiles to service_role;

create or replace function public.admin_find_user_by_email(p_email text)
returns table (
  id uuid,
  display_name text,
  email text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_dinkdraw_admin() then
    raise exception 'Not authorized';
  end if;

  if nullif(trim(p_email), '') is null then
    raise exception 'Email is required';
  end if;

  return query
  select
    profiles.id,
    profiles.display_name,
    profiles.email
  from public.profiles
  where lower(profiles.email) = lower(trim(p_email))
  limit 1;
end;
$$;

revoke all on function public.admin_find_user_by_email(text) from public;
revoke all on function public.admin_find_user_by_email(text) from anon;
grant execute on function public.admin_find_user_by_email(text) to authenticated;
grant execute on function public.admin_find_user_by_email(text) to service_role;

create or replace function public.admin_get_profiles_by_ids(p_user_ids uuid[])
returns table (
  id uuid,
  display_name text,
  email text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_dinkdraw_admin() then
    raise exception 'Not authorized';
  end if;

  if coalesce(array_length(p_user_ids, 1), 0) > 100 then
    raise exception 'Too many users requested';
  end if;

  return query
  select
    profiles.id,
    profiles.display_name,
    profiles.email
  from public.profiles
  where profiles.id = any(coalesce(p_user_ids, array[]::uuid[]));
end;
$$;

revoke all on function public.admin_get_profiles_by_ids(uuid[]) from public;
revoke all on function public.admin_get_profiles_by_ids(uuid[]) from anon;
grant execute on function public.admin_get_profiles_by_ids(uuid[]) to authenticated;
grant execute on function public.admin_get_profiles_by_ids(uuid[]) to service_role;

notify pgrst, 'reload schema';
