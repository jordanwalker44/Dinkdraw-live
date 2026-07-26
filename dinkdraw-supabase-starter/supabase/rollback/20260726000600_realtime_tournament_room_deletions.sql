-- Emergency rollback for the Phase 2B deletion refresh signal.

begin;

drop trigger if exists touch_tournament_room_after_message_delete
on public.tournament_room_messages;

drop function if exists public.touch_tournament_room_after_message_delete();

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tournament_rooms'
  ) then
    alter publication supabase_realtime
    drop table public.tournament_rooms;
  end if;
end;
$$;

commit;
