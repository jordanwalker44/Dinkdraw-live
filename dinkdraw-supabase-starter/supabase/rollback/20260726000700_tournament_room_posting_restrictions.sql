-- Emergency rollback for tournament-room posting restrictions.
-- This removes every active restriction and prevents clients from creating
-- another one. The empty table remains so already-deployed clients can load
-- safely while the application is rolled back.

begin;

delete from public.tournament_room_posting_restrictions;

revoke execute on function public.set_tournament_room_posting_restriction(
  uuid,
  uuid,
  boolean,
  text
) from authenticated;

notify pgrst, 'reload schema';

commit;
