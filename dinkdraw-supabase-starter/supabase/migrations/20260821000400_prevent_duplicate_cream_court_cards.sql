create or replace function public.prevent_duplicate_cream_court_card()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.tournaments tournament
    where tournament.id = new.tournament_id
      and tournament.tournament_mode = 'cream_of_the_crop'
  ) then
    -- Serialize all Cream card inserts for this tournament. This closes the
    -- race for older cached clients that still insert stage rows directly.
    perform pg_advisory_xact_lock(hashtextextended(new.tournament_id::text, 0));

    if exists (
      select 1
      from public.matches match
      where match.tournament_id = new.tournament_id
        and match.round_number = new.round_number
        and match.court_number = new.court_number
    ) then
      raise exception 'A Cream of the Crop card already exists for round % court %',
        new.round_number, new.court_number;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_duplicate_cream_court_card_trigger on public.matches;
create trigger prevent_duplicate_cream_court_card_trigger
before insert on public.matches
for each row execute function public.prevent_duplicate_cream_court_card();

comment on function public.prevent_duplicate_cream_court_card() is
  'Prevents duplicate Cream cards per round and court, including concurrent inserts from older cached clients.';
