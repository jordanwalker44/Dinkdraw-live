-- Emergency rollback for Phase 2B.
-- This closes any pilot conversations, restores announcements-only mode,
-- and locks the two conversation functions again.

begin;

update public.tournament_rooms
set
  posting_mode = 'announcements_only',
  conversation_closed_at = now(),
  conversation_closed_by_user_id = null,
  updated_at = now()
where posting_mode = 'conversation';

revoke execute on function public.post_tournament_room_message(uuid, text)
from authenticated;

revoke execute on function public.set_tournament_room_conversation(uuid, boolean)
from authenticated;

notify pgrst, 'reload schema';

commit;
