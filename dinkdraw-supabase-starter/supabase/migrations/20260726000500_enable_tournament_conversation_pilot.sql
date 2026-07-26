-- Phase 2B: unlock the protected conversation functions for the pilot UI.
-- Existing rooms remain announcements_only until their organizer opts in.

grant execute on function public.post_tournament_room_message(uuid, text)
to authenticated;

grant execute on function public.set_tournament_room_conversation(uuid, boolean)
to authenticated;

notify pgrst, 'reload schema';
