import type { SupabaseClient } from '@supabase/supabase-js';

export type LeaguePushEvent =
  | { eventType: 'roster_claimed'; leagueId: string }
  | { eventType: 'attendance_requested'; sessionId: string }
  | { eventType: 'substitute_invited'; sessionId: string; regularMemberId: string }
  | { eventType: 'substitute_response'; sessionId: string; regularMemberId: string; accepted: boolean }
  | { eventType: 'session_started'; sessionId: string }
  | { eventType: 'standings_updated'; sessionId: string };

export async function sendLeaguePushEvent(supabase: SupabaseClient, event: LeaguePushEvent) {
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    const { error } = await supabase.functions.invoke('send-league-push', { body: event });
    if (error) console.warn('League push notification failed', error);
  } catch (error) {
    console.warn('League push notification failed', error);
  }
}
