create or replace function public.require_tournament_location()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if nullif(btrim(new.location), '') is null then
    raise exception 'A club or court location is required';
  end if;

  return new;
end;
$$;

drop trigger if exists require_tournament_location on public.tournaments;

create trigger require_tournament_location
before insert or update of location on public.tournaments
for each row
execute function public.require_tournament_location();

notify pgrst, 'reload schema';
