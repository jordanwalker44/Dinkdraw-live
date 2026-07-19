-- Enforce private profile rows after application reads have moved to
-- public.public_profiles (display names only) or protected admin RPCs.
--
-- This migration deliberately does not change profile insert/update behavior,
-- tournament authorization, organization authorization, or authentication.

drop policy if exists "Read profiles" on public.profiles;
drop policy if exists "Users can read their own profile" on public.profiles;

create policy "Users can read their own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

-- Anonymous clients have no legitimate reason to query the private table.
-- The public_profiles view remains explicitly readable and exposes only id and
-- display_name.
revoke all on table public.profiles from anon;

