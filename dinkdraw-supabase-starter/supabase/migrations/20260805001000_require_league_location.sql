do $migration$
declare function_definition text;
begin
  select pg_get_functiondef('public.create_rotating_doubles_league(uuid,text,date,integer,integer,integer,integer,text,text)'::regprocedure)
  into function_definition;

  function_definition := replace(
    function_definition,
    $$  if nullif(btrim(p_default_time), '') is null then raise exception 'A start time is required so attendance reminders can be scheduled'; end if;$$,
    $$  if nullif(btrim(p_default_time), '') is null then raise exception 'A start time is required so attendance reminders can be scheduled'; end if;
  if nullif(btrim(p_default_location), '') is null then raise exception 'A club or court location is required'; end if;$$
  );

  execute function_definition;
end;
$migration$;

notify pgrst, 'reload schema';
