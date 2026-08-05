import type { SupabaseClient } from '@supabase/supabase-js';

type TournamentPushEvent =
  | {
      eventType: 'spot_claimed';
      tournamentId: string;
      slotId: string;
    }
  | {
      eventType: 'tournament_started';
      tournamentId: string;
    }
  | {
      eventType: 'match_score_submitted';
      tournamentId: string;
      matchId: string;
    }
  | {
      eventType: 'tournament_completed';
      tournamentId: string;
    }
  | {
      eventType: 'announcement_posted';
      tournamentId: string;
      messageId: string;
    }
  | {
      eventType: 'message_posted';
      tournamentId: string;
      messageId: string;
    }
  | {
      eventType: 'training_partner_invited';
      invitationIds: string[];
    };

export async function sendTournamentPushEvent(
  supabase: SupabaseClient,
  event: TournamentPushEvent
) {
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;

    const { error } = await supabase.functions.invoke('send-tournament-push', {
      body: event,
    });

    if (error) {
      console.warn('Tournament push notification failed', error);
    }
  } catch (error) {
    console.warn('Tournament push notification failed', error);
  }
}

export async function sendTrainingPartnerInvitationPush(
  supabase: SupabaseClient,
  invitationIds: string[]
) {
  if (!invitationIds.length) return;
  await sendTournamentPushEvent(supabase, {
    eventType: 'training_partner_invited',
    invitationIds,
  });
}
