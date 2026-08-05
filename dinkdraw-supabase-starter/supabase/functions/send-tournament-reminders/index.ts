import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

type ReminderRow = {
  id: string;
  tournament_id: string;
  reminder_minutes: number;
  scheduled_for: string;
  tournaments: Tournament | null;
};

type Tournament = {
  id: string;
  title: string | null;
  organizer_user_id: string;
  co_organizer_user_id: string | null;
  status: string;
  event_date: string | null;
  event_time: string | null;
};

type PlayerSlot = {
  claimed_by_user_id: string | null;
};

type PushToken = {
  user_id: string;
  token: string;
  platform: string;
};

type Notification = {
  userId: string;
  title: string;
  body: string;
  url: string;
};

type LeagueReminderRow = {
  id: string;
  session_id: string;
  reminder_hours: 48 | 24;
  scheduled_for: string;
  league_sessions: {
    id: string;
    league_id: string;
    session_number: number;
    status: string;
    leagues: { id: string; name: string; organizer_user_id: string } | null;
  } | null;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function base64UrlEncode(input: ArrayBuffer | Uint8Array | string) {
  const bytes =
    typeof input === 'string'
      ? new TextEncoder().encode(input)
      : input instanceof Uint8Array
        ? input
        : new Uint8Array(input);

  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function pemToArrayBuffer(pem: string) {
  const base64 = pem
    .replace(/\\n/g, '\n')
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

async function createApnsJwt() {
  const header = { alg: 'ES256', kid: requiredEnv('APNS_KEY_ID') };
  const claims = { iss: requiredEnv('APNS_TEAM_ID'), iat: Math.floor(Date.now() / 1000) };
  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claims))}`;

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(requiredEnv('APNS_PRIVATE_KEY')),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

async function sendApnsPush(token: string, notification: Omit<Notification, 'userId'>) {
  const useSandbox = (Deno.env.get('APNS_USE_SANDBOX') || 'true').toLowerCase() !== 'false';
  const host = useSandbox ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
  const response = await fetch(`${host}/3/device/${token}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${await createApnsJwt()}`,
      'apns-topic': Deno.env.get('APNS_BUNDLE_ID') || 'com.dinkdraw.app',
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      aps: {
        alert: {
          title: notification.title,
          body: notification.body,
        },
        sound: 'default',
      },
      url: notification.url,
    }),
  });

  if (!response.ok) {
    throw new Error(`APNs failed with ${response.status}: ${await response.text()}`);
  }
}

function uniqueUserIds(ids: Array<string | null | undefined>) {
  return Array.from(new Set(ids.filter((id): id is string => !!id)));
}

function titleFor(tournament: Tournament) {
  return tournament.title?.trim() || 'DinkDraw tournament';
}

function reminderBody(minutes: number) {
  if (minutes === 60) {
    return 'Tournament starts in about 60 minutes. Open DinkDraw to confirm your spot and get ready.';
  }

  return 'Tournament starts in about 5 minutes. Open DinkDraw so you are ready when play begins.';
}

function shouldSkipTournamentStatus(status: string) {
  return ['completed', 'cancelled', 'archived'].includes(status);
}

async function sendNotifications(adminClient: ReturnType<typeof createClient>, notifications: Notification[]) {
  const unique = Array.from(new Map(notifications.map((item) => [item.userId, item])).values());
  if (!unique.length) return [];

  const { data, error } = await adminClient
    .from('push_tokens')
    .select('user_id, token, platform')
    .in(
      'user_id',
      unique.map((item) => item.userId),
    )
    .eq('enabled', true)
    .eq('platform', 'ios')
    .order('updated_at', { ascending: false });

  if (error) throw error;

  const latest = new Map<string, PushToken>();
  for (const token of (data || []) as PushToken[]) {
    if (!latest.has(token.user_id)) latest.set(token.user_id, token);
  }

  const byUser = new Map(unique.map((item) => [item.userId, item]));
  const results = [];

  for (const token of latest.values()) {
    const notification = byUser.get(token.user_id);
    if (!notification) continue;

    try {
      await sendApnsPush(token.token, notification);
      results.push({ userId: token.user_id, platform: token.platform, sent: true });
    } catch (error) {
      console.error('send-tournament-reminders APNs send failed', {
        userId: token.user_id,
        platform: token.platform,
        error: error instanceof Error ? error.message : 'Unknown send error',
      });
      results.push({
        userId: token.user_id,
        platform: token.platform,
        sent: false,
        error: error instanceof Error ? error.message : 'Unknown send error',
      });
    }
  }

  return results;
}

async function skipReminder(
  adminClient: ReturnType<typeof createClient>,
  reminderId: string,
  reason: string,
) {
  const { error } = await adminClient
    .from('tournament_push_reminders')
    .update({ skipped_at: new Date().toISOString(), skip_reason: reason, updated_at: new Date().toISOString() })
    .eq('id', reminderId)
    .is('sent_at', null)
    .is('skipped_at', null);

  if (error) throw error;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'content-type': 'application/json' },
      });
    }

    const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
    const authHeader = req.headers.get('Authorization') || '';
    const apikeyHeader = req.headers.get('apikey') || '';
    const cronSecret = Deno.env.get('REMINDER_CRON_SECRET') || '';
    const cronSecretHeader = req.headers.get('x-cron-secret') || '';
    const isServiceRoleRequest = authHeader === `Bearer ${serviceRoleKey}` || apikeyHeader === serviceRoleKey;
    const isCronSecretRequest = Boolean(cronSecret) && cronSecretHeader === cronSecret;

    if (!isServiceRoleRequest && !isCronSecretRequest) {
      console.error('send-tournament-reminders unauthorized request', {
        hasAuthorization: Boolean(authHeader),
        hasApikey: Boolean(apikeyHeader),
        hasCronSecret: Boolean(cronSecretHeader),
        cronSecretConfigured: Boolean(cronSecret),
      });

      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'content-type': 'application/json' },
      });
    }

    const adminClient = createClient(requiredEnv('SUPABASE_URL'), serviceRoleKey);
    const now = new Date();
    const staleBefore = new Date(now.getTime() - 20 * 60 * 1000).toISOString();
    const leagueStaleBefore = new Date(now.getTime() - 70 * 60 * 1000).toISOString();
    const claimStaleBefore = new Date(now.getTime() - 15 * 60 * 1000).toISOString();

    const { data, error } = await adminClient
      .from('tournament_push_reminders')
      .select(
        'id, tournament_id, reminder_minutes, scheduled_for, tournaments(id, title, organizer_user_id, co_organizer_user_id, status, event_date, event_time)',
      )
      .is('sent_at', null)
      .is('skipped_at', null)
      .lte('scheduled_for', now.toISOString())
      .gte('scheduled_for', staleBefore)
      .or(`delivery_started_at.is.null,delivery_started_at.lt.${claimStaleBefore}`)
      .order('scheduled_for', { ascending: true })
      .limit(25);

    if (error) throw error;

    const reminders = (data || []) as ReminderRow[];
    const outcomes = [];

    console.log('send-tournament-reminders due reminder lookup complete', {
      checkedCount: reminders.length,
      now: now.toISOString(),
      staleBefore,
    });

    for (const reminder of reminders) {
      const tournament = reminder.tournaments;
      const deliveryStartedAt = new Date().toISOString();

      if (!tournament) {
        await skipReminder(adminClient, reminder.id, 'Tournament not found');
        outcomes.push({ reminderId: reminder.id, skipped: true, reason: 'Tournament not found' });
        continue;
      }

      if (reminder.scheduled_for < staleBefore) {
        await skipReminder(adminClient, reminder.id, 'Reminder is stale');
        outcomes.push({ reminderId: reminder.id, tournamentId: tournament.id, skipped: true, reason: 'Stale' });
        continue;
      }

      if (shouldSkipTournamentStatus(tournament.status)) {
        await skipReminder(adminClient, reminder.id, `Tournament status is ${tournament.status}`);
        outcomes.push({
          reminderId: reminder.id,
          tournamentId: tournament.id,
          skipped: true,
          reason: `Tournament status is ${tournament.status}`,
        });
        continue;
      }

      const { data: claimedReminder, error: claimError } = await adminClient
        .from('tournament_push_reminders')
        .update({ delivery_started_at: deliveryStartedAt, updated_at: deliveryStartedAt })
        .eq('id', reminder.id)
        .is('sent_at', null)
        .is('skipped_at', null)
        .or(`delivery_started_at.is.null,delivery_started_at.lt.${claimStaleBefore}`)
        .select('id')
        .maybeSingle();

      if (claimError) throw claimError;

      if (!claimedReminder) {
        outcomes.push({ reminderId: reminder.id, tournamentId: tournament.id, skipped: true, reason: 'Already claimed' });
        continue;
      }

      const { data: players, error: playersError } = await adminClient
        .from('tournament_players')
        .select('claimed_by_user_id')
        .eq('tournament_id', tournament.id);

      if (playersError) throw playersError;

      const recipientIds = uniqueUserIds([
        tournament.organizer_user_id,
        tournament.co_organizer_user_id,
        ...((players || []) as PlayerSlot[]).map((player) => player.claimed_by_user_id),
      ]);

      const notifications = recipientIds.map((userId) => ({
        userId,
        title: `${titleFor(tournament)} soon`,
        body: reminderBody(reminder.reminder_minutes),
        url: `/tournament/${tournament.id}`,
      }));

      const results = await sendNotifications(adminClient, notifications);
      const { error: markSentError } = await adminClient
        .from('tournament_push_reminders')
        .update({ sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', reminder.id)
        .is('sent_at', null)
        .is('skipped_at', null);

      if (markSentError) throw markSentError;

      outcomes.push({
        reminderId: reminder.id,
        tournamentId: tournament.id,
        reminderMinutes: reminder.reminder_minutes,
        requested: notifications.length,
        sent: results.filter((result) => result.sent).length,
        failed: results.filter((result) => !result.sent).length,
      });
    }

    const { data: leagueReminderData, error: leagueReminderError } = await adminClient
      .from('league_attendance_push_reminders')
      .select('id, session_id, reminder_hours, scheduled_for, league_sessions(id, league_id, session_number, status, leagues(id, name, organizer_user_id))')
      .is('sent_at', null)
      .is('skipped_at', null)
      .lte('scheduled_for', now.toISOString())
      .gte('scheduled_for', leagueStaleBefore)
      .or(`delivery_started_at.is.null,delivery_started_at.lt.${claimStaleBefore}`)
      .order('scheduled_for', { ascending: true })
      .limit(25);

    if (leagueReminderError) throw leagueReminderError;

    const leagueReminders = (leagueReminderData || []) as unknown as LeagueReminderRow[];
    const leagueOutcomes = [];

    for (const reminder of leagueReminders) {
      const session = reminder.league_sessions;
      const league = session?.leagues;

      if (!session || !league || ['in_progress', 'completed', 'cancelled'].includes(session.status)) {
        const reason = !session || !league ? 'League week not found' : `League week status is ${session.status}`;
        const { error } = await adminClient.from('league_attendance_push_reminders')
          .update({ skipped_at: new Date().toISOString(), skip_reason: reason, updated_at: new Date().toISOString() })
          .eq('id', reminder.id).is('sent_at', null).is('skipped_at', null);
        if (error) throw error;
        leagueOutcomes.push({ reminderId: reminder.id, skipped: true, reason });
        continue;
      }

      const deliveryStartedAt = new Date().toISOString();
      const { data: claimedReminder, error: claimError } = await adminClient
        .from('league_attendance_push_reminders')
        .update({ delivery_started_at: deliveryStartedAt, updated_at: deliveryStartedAt })
        .eq('id', reminder.id)
        .is('sent_at', null)
        .is('skipped_at', null)
        .or(`delivery_started_at.is.null,delivery_started_at.lt.${claimStaleBefore}`)
        .select('id')
        .maybeSingle();
      if (claimError) throw claimError;
      if (!claimedReminder) continue;

      const { data: attendance, error: attendanceError } = await adminClient
        .from('league_session_attendance')
        .select('regular_member_id, attendance_status')
        .eq('session_id', session.id)
        .eq('attendance_status', 'expected');
      if (attendanceError) throw attendanceError;

      const missingMemberIds = (attendance || []).map((row: any) => row.regular_member_id);
      const { data: missingMembers, error: memberError } = missingMemberIds.length
        ? await adminClient.from('league_members').select('id, user_id, display_name, roster_position')
            .in('id', missingMemberIds).not('user_id', 'is', null)
        : { data: [], error: null };
      if (memberError) throw memberError;

      const claimedMissing = missingMembers || [];
      let notifications: Notification[] = [];
      if (reminder.reminder_hours === 48) {
        notifications = claimedMissing.map((member: any) => ({
          userId: member.user_id,
          title: `${league.name} attendance`,
          body: `Week ${session.session_number} starts in about 48 hours. Please mark Playing, Need Sub, or Absent without substitute.`,
          url: `/leagues/${league.id}`,
        }));
      } else if (claimedMissing.length) {
        const names = claimedMissing
          .map((member: any) => member.display_name?.trim() || `Player ${member.roster_position}`)
          .join(', ');
        notifications = [{
          userId: league.organizer_user_id,
          title: `${league.name} attendance incomplete`,
          body: `${claimedMissing.length} player${claimedMissing.length === 1 ? ' has' : 's have'} not marked attendance for Week ${session.session_number}: ${names}.`,
          url: `/leagues/${league.id}`,
        }];
      }

      const results = await sendNotifications(adminClient, notifications);
      const completedAt = new Date().toISOString();
      const { error: markSentError } = await adminClient.from('league_attendance_push_reminders')
        .update({ sent_at: completedAt, recipient_count: notifications.length, updated_at: completedAt })
        .eq('id', reminder.id).is('sent_at', null).is('skipped_at', null);
      if (markSentError) throw markSentError;

      leagueOutcomes.push({
        reminderId: reminder.id,
        sessionId: session.id,
        reminderHours: reminder.reminder_hours,
        requested: notifications.length,
        sent: results.filter((result) => result.sent).length,
        failed: results.filter((result) => !result.sent).length,
      });
    }

    console.log('send-tournament-reminders complete', {
      checkedCount: reminders.length,
      outcomes,
      leagueCheckedCount: leagueReminders.length,
      leagueOutcomes,
    });

    return new Response(JSON.stringify({ ok: true, checked: reminders.length, outcomes, leagueChecked: leagueReminders.length, leagueOutcomes }), {
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  } catch (error) {
    console.error('send-tournament-reminders failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }
});
