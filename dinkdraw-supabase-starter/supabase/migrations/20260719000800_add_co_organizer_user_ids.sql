-- Add stable co-organizer identity while preserving the existing email field
-- and email-based authorization during the compatibility release.

alter table public.tournaments
add column if not exists co_organizer_user_id uuid
references auth.users(id) on delete set null;

create index if not exists tournaments_co_organizer_user_id_idx
on public.tournaments(co_organizer_user_id)
where co_organizer_user_id is not null;

create or replace function public.sync_tournament_co_organizer_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(new.co_organizer_email), '') is null then
    new.co_organizer_email := null;
    new.co_organizer_user_id := null;
    return new;
  end if;

  select profiles.id
  into new.co_organizer_user_id
  from public.profiles
  where lower(profiles.email) = lower(trim(new.co_organizer_email))
  limit 1;

  return new;
end;
$$;

revoke all on function public.sync_tournament_co_organizer_user_id() from public;
revoke all on function public.sync_tournament_co_organizer_user_id() from anon;
revoke all on function public.sync_tournament_co_organizer_user_id() from authenticated;

drop trigger if exists sync_tournament_co_organizer_user_id_before_write
on public.tournaments;

create trigger sync_tournament_co_organizer_user_id_before_write
before insert or update on public.tournaments
for each row
execute function public.sync_tournament_co_organizer_user_id();

-- The production preflight found four assignments and all four resolve
-- uniquely through the profiles.email constraint. Unknown emails remain
-- pending with a null user ID.
update public.tournaments
set co_organizer_user_id = profiles.id
from public.profiles
where tournaments.co_organizer_email is not null
  and lower(trim(tournaments.co_organizer_email)) = lower(profiles.email)
  and tournaments.co_organizer_user_id is distinct from profiles.id;

comment on column public.tournaments.co_organizer_user_id
is 'Stable co-organizer account identity. Null means no assigned account or a pending email.';

comment on function public.sync_tournament_co_organizer_user_id()
is 'Resolves co_organizer_email to a stable profile ID on every tournament write.';
