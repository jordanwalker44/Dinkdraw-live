do $migration$
declare
  source_command text;
  existing_job_id bigint;
begin
  select command into source_command
  from cron.job
  where jobname = 'send-tournament-reminders'
  limit 1;

  if source_command is null then
    raise exception 'The existing authenticated reminder invocation was not found';
  end if;

  select jobid into existing_job_id
  from cron.job
  where jobname = 'send-league-attendance-reminders-hourly'
  limit 1;

  if existing_job_id is null then
    perform cron.schedule(
      'send-league-attendance-reminders-hourly',
      '5 * * * *',
      source_command
    );
  else
    perform cron.alter_job(
      job_id := existing_job_id,
      schedule := '5 * * * *',
      command := source_command,
      active := true
    );
  end if;
end;
$migration$;

comment on table public.league_attendance_push_reminders is
  'League attendance reminders processed hourly, avoiding the former every-two-minute polling load.';
