create or replace function public.ensure_six_character_league_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
begin
  if new.join_code ~ '^[A-Z0-9]{6}$' then
    return new;
  end if;

  loop
    candidate := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (
      select 1
      from public.leagues
      where join_code = candidate
        and id is distinct from new.id
    );
  end loop;

  new.join_code := candidate;
  return new;
end;
$$;

drop trigger if exists ensure_six_character_league_code_before_write on public.leagues;
create trigger ensure_six_character_league_code_before_write
before insert or update of join_code on public.leagues
for each row execute function public.ensure_six_character_league_code();

update public.leagues
set join_code = join_code
where join_code !~ '^[A-Z0-9]{6}$';

revoke all on function public.ensure_six_character_league_code() from public, anon, authenticated;
