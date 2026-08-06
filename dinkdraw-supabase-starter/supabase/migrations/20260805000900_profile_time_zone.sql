alter table public.profiles
  add column if not exists time_zone text;

create or replace function public.validate_profile_time_zone()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.time_zone is not null
     and not exists (select 1 from pg_timezone_names where name = new.time_zone) then
    raise exception 'Choose a valid timezone';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_profile_time_zone_before_write on public.profiles;
create trigger validate_profile_time_zone_before_write
before insert or update of time_zone on public.profiles
for each row execute function public.validate_profile_time_zone();

comment on column public.profiles.time_zone is
  'Private IANA timezone used as the default when this user creates a league.';

notify pgrst, 'reload schema';
