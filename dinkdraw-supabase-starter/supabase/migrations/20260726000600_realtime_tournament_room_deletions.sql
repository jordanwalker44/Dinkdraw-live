-- Make message deletions visible promptly to every eligible room member.
-- Supabase Realtime cannot always identify a deleted row's filtered room, so
-- deletion also touches the parent room and clients reload on that update.

create or replace function public.touch_tournament_room_after_message_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tournament_rooms
  set updated_at = now()
  where tournament_rooms.id = old.room_id;

  return old;
end;
$$;

revoke all on function public.touch_tournament_room_after_message_delete() from public;
revoke all on function public.touch_tournament_room_after_message_delete() from anon;
revoke all on function public.touch_tournament_room_after_message_delete() from authenticated;

drop trigger if exists touch_tournament_room_after_message_delete
on public.tournament_room_messages;

create trigger touch_tournament_room_after_message_delete
after delete on public.tournament_room_messages
for each row
execute function public.touch_tournament_room_after_message_delete();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tournament_rooms'
  ) then
    alter publication supabase_realtime
    add table public.tournament_rooms;
  end if;
end;
$$;

notify pgrst, 'reload schema';
