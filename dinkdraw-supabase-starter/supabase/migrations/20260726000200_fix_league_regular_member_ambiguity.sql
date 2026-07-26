do $migration$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.start_league_session_tournament(uuid)'::regprocedure)
  into function_definition;

  if position('  regular_member_id uuid;' in function_definition) = 0
    or position('    foreach regular_member_id in array' in function_definition) = 0
    or position('else regular_member_id end' in function_definition) = 0
    or position('attendance.regular_member_id = regular_member_id;' in function_definition) = 0
    or position('p_session_id, team_row.team_number, regular_member_id, actual_member_id, created_player_id' in function_definition) = 0
  then
    raise exception 'Could not find every ambiguous League member reference to update';
  end if;

  function_definition := replace(function_definition, '  regular_member_id uuid;', '  current_regular_member_id uuid;');
  function_definition := replace(function_definition, '    foreach regular_member_id in array', '    foreach current_regular_member_id in array');
  function_definition := replace(function_definition, 'else regular_member_id end', 'else current_regular_member_id end');
  function_definition := replace(function_definition, 'attendance.regular_member_id = regular_member_id;', 'attendance.regular_member_id = current_regular_member_id;');
  function_definition := replace(
    function_definition,
    'p_session_id, team_row.team_number, regular_member_id, actual_member_id, created_player_id',
    'p_session_id, team_row.team_number, current_regular_member_id, actual_member_id, created_player_id'
  );

  execute function_definition;
end;
$migration$;
