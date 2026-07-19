import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

type PushEvent =
  | {
      eventType: 'spot_claimed';
      tournamentId: string;
      slotId?: string;
    }
  | {
      eventType: 'tournament_started';
      tournamentId: string;
    }
  | {
      eventType: 'match_score_submitted';
      tournamentId: string;
      matchId?: string;
    }
  | {
      eventType: 'tournament_completed';
      tournamentId: string;
    };

type Tournament = {
  id: string;
  title: string | null;
  organizer_user_id: string;
  organizer_name: string | null;
  co_organizer_email: string | null;
  co_organizer_user_id: string | null;
  player_count: number;
  courts: number;
  rounds: number;
  allow_player_score_reporting: boolean | null;
  status: string;
  format: string | null;
  tournament_mode: string | null;
};

type PlayerSlot = {
  id: string;
  slot_number: number;
  display_name: string | null;
  claimed_by_user_id: string | null;
};

type Match = {
  id: string;
  round_number: number;
  court_number: number | null;
  court_label: string | null;
  team_a_player_1_id: string | null;
  team_a_player_2_id: string | null;
  team_b_player_1_id: string | null;
  team_b_player_2_id: string | null;
  team_a_score: number | null;
  team_b_score: number | null;
  is_bye: boolean;
  is_complete: boolean;
};

type PushTokenRow = {
  token: string;
  platform: string;
  user_id: string;
};

type Notification = {
  userId: string;
  title: string;
  body: string;
  url: string;
};

type ProfileRow = {
  id: string;
  email: string | null;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const tournamentMonitorEmail =
  Deno.env.get('TOURNAMENT_MONITOR_EMAIL')?.trim().toLowerCase() || 'jordanwalker44@gmail.com';

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

function normalizePrivateKey(privateKey: string) {
  return privateKey.replace(/\\n/g, '\n');
}

function pemToArrayBuffer(pem: string) {
  const base64 = normalizePrivateKey(pem)
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

async function createApnsJwt() {
  const teamId = requiredEnv('APNS_TEAM_ID');
  const keyId = requiredEnv('APNS_KEY_ID');
  const privateKey = requiredEnv('APNS_PRIVATE_KEY');

  const header = {
    alg: 'ES256',
    kid: keyId,
  };

  const claims = {
    iss: teamId,
    iat: Math.floor(Date.now() / 1000),
  };

  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(claims),
  )}`;

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKey),
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
  const bundleId = Deno.env.get('APNS_BUNDLE_ID') || 'com.dinkdraw.app';
  const useSandbox = (Deno.env.get('APNS_USE_SANDBOX') || 'true').toLowerCase() !== 'false';
  const host = useSandbox ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
  const jwt = await createApnsJwt();

  const response = await fetch(`${host}/3/device/${token}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${jwt}`,
      'apns-topic': bundleId,
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
    const errorBody = await response.text();
    throw new Error(`APNs failed with ${response.status}: ${errorBody}`);
  }
}

function uniqueUserIds(userIds: Array<string | null | undefined>) {
  return Array.from(new Set(userIds.filter((id): id is string => !!id)));
}

function titleFor(tournament: Tournament) {
  return tournament.title?.trim() || 'DinkDraw tournament';
}

function playerName(slot?: PlayerSlot | null) {
  return slot?.display_name?.trim() || 'A player';
}

function teamName(playersById: Map<string, PlayerSlot>, firstId: string | null, secondId: string | null) {
  const firstName = firstId ? playerName(playersById.get(firstId)) : 'TBD';
  const secondName = secondId ? playerName(playersById.get(secondId)) : '';
  return secondName ? `${firstName} & ${secondName}` : firstName;
}

function matchPlayerIds(match: Match) {
  return [
    match.team_a_player_1_id,
    match.team_a_player_2_id,
    match.team_b_player_1_id,
    match.team_b_player_2_id,
  ].filter((id): id is string => !!id);
}

function isUserInMatch(match: Match, playersById: Map<string, PlayerSlot>, userId: string) {
  return matchPlayerIds(match).some((slotId) => playersById.get(slotId)?.claimed_by_user_id === userId);
}

function courtLabel(match: Match) {
  return match.court_label?.trim() || (match.court_number ? `Court ${match.court_number}` : 'your court');
}

function assignmentBody(match: Match, playersById: Map<string, PlayerSlot>, slot: PlayerSlot) {
  const isTeamA = match.team_a_player_1_id === slot.id || match.team_a_player_2_id === slot.id;
  const partnerId = isTeamA
    ? [match.team_a_player_1_id, match.team_a_player_2_id].find((id) => id && id !== slot.id)
    : [match.team_b_player_1_id, match.team_b_player_2_id].find((id) => id && id !== slot.id);

  const opponentIds = isTeamA
    ? [match.team_b_player_1_id, match.team_b_player_2_id]
    : [match.team_a_player_1_id, match.team_a_player_2_id];

  const partnerText = partnerId ? ` Partner: ${playerName(playersById.get(partnerId))}.` : '';
  const opponents = opponentIds
    .filter((id): id is string => !!id)
    .map((id) => playerName(playersById.get(id)))
    .join(' & ');

  return `Round ${match.round_number}, ${courtLabel(match)}.${partnerText} Opponents: ${opponents || 'TBD'}.`;
}

function nextAssignmentBody(match: Match, playersById: Map<string, PlayerSlot>, slot: PlayerSlot) {
  const isTeamA = match.team_a_player_1_id === slot.id || match.team_a_player_2_id === slot.id;
  const partnerId = isTeamA
    ? [match.team_a_player_1_id, match.team_a_player_2_id].find((id) => id && id !== slot.id)
    : [match.team_b_player_1_id, match.team_b_player_2_id].find((id) => id && id !== slot.id);

  const opponentIds = isTeamA
    ? [match.team_b_player_1_id, match.team_b_player_2_id]
    : [match.team_a_player_1_id, match.team_a_player_2_id];

  const partnerLine = partnerId ? ` Partner: ${playerName(playersById.get(partnerId))}` : '';
  const opponents = opponentIds
    .filter((id): id is string => !!id)
    .map((id) => playerName(playersById.get(id)))
    .join(' & ');

  return `Round ${match.round_number}, ${courtLabel(match)}.${partnerLine}\nOpponents: ${opponents || 'TBD'}`;
}

function nextMatchForSlot(matches: Match[], completedMatch: Match, slotId: string) {
  return matches
    .filter(
      (match) =>
        !match.is_bye &&
        !match.is_complete &&
        match.round_number > completedMatch.round_number &&
        matchPlayerIds(match).includes(slotId),
    )
    .sort((a, b) => {
      if (a.round_number !== b.round_number) return a.round_number - b.round_number;
      return (a.court_number ?? 999) - (b.court_number ?? 999);
    })[0];
}

function firstMatchForSlot(matches: Match[], slotId: string) {
  return matches
    .filter((match) => !match.is_bye && matchPlayerIds(match).includes(slotId))
    .sort((a, b) => {
      if (a.round_number !== b.round_number) return a.round_number - b.round_number;
      return (a.court_number ?? 999) - (b.court_number ?? 999);
    })[0];
}

function hasRemainingPlayableMatches(matches: Match[]) {
  return matches.some((match) => !match.is_bye && !match.is_complete);
}

function canManageTournament(tournament: Tournament, userId: string) {
  if (tournament.organizer_user_id === userId) return true;
  return tournament.co_organizer_user_id === userId;
}

async function loadTournamentContext(adminClient: ReturnType<typeof createClient>, tournamentId: string) {
  const [tournamentResult, playersResult, matchesResult] = await Promise.all([
    adminClient.from('tournaments').select('*').eq('id', tournamentId).maybeSingle(),
    adminClient
      .from('tournament_players')
      .select('id, slot_number, display_name, claimed_by_user_id')
      .eq('tournament_id', tournamentId)
      .order('slot_number', { ascending: true }),
    adminClient
      .from('matches')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('round_number', { ascending: true })
      .order('court_number', { ascending: true }),
  ]);

  if (tournamentResult.error) throw tournamentResult.error;
  if (playersResult.error) throw playersResult.error;
  if (matchesResult.error) throw matchesResult.error;
  if (!tournamentResult.data) throw new Error('Tournament not found');

  const tournament = tournamentResult.data as Tournament;
  const players = (playersResult.data || []) as PlayerSlot[];
  const matches = (matchesResult.data || []) as Match[];
  const playersById = new Map(players.map((player) => [player.id, player]));

  return { tournament, players, matches, playersById };
}

function buildSpotClaimedNotifications(
  event: Extract<PushEvent, { eventType: 'spot_claimed' }>,
  tournament: Tournament,
  players: PlayerSlot[],
  userId: string,
) {
  const claimedSlot =
    (event.slotId ? players.find((slot) => slot.id === event.slotId) : null) ||
    players.find((slot) => slot.claimed_by_user_id === userId);

  if (!claimedSlot || claimedSlot.claimed_by_user_id !== userId) {
    throw new Error('Claimed spot not found for this user');
  }

  const claimedCount = players.filter((slot) => !!slot.claimed_by_user_id).length;

  return [
    {
      userId: tournament.organizer_user_id,
      title: titleFor(tournament),
      body: `${playerName(claimedSlot)} claimed a spot. ${claimedCount} of ${tournament.player_count} spots are claimed.`,
      url: `/tournament/${tournament.id}`,
    },
  ].filter((notification) => notification.userId !== userId);
}

function buildTournamentStartedNotifications(
  tournament: Tournament,
  players: PlayerSlot[],
  matches: Match[],
  playersById: Map<string, PlayerSlot>,
  userId: string,
) {
  if (!canManageTournament(tournament, userId)) {
    throw new Error('Only an organizer can send tournament start notifications');
  }

  const firstRound = Math.min(...matches.filter((match) => !match.is_bye).map((match) => match.round_number));
  const firstRoundMatches = matches.filter((match) => match.round_number === firstRound && !match.is_bye);

  return players
    .filter((slot) => !!slot.claimed_by_user_id)
    .map((slot) => {
      const match = firstRoundMatches.find((item) => matchPlayerIds(item).includes(slot.id));
      const firstMatch = match || firstMatchForSlot(matches, slot.id);

      return {
        userId: slot.claimed_by_user_id as string,
        title: match ? 'Your first match is ready' : `${titleFor(tournament)} started`,
        body: match
          ? assignmentBody(match, playersById, slot)
          : firstMatch
            ? `You are not scheduled in Round ${firstRound}. First match: ${assignmentBody(firstMatch, playersById, slot)}`
            : 'The tournament has started. Open DinkDraw for your first assignment.',
        url: `/tournament/${tournament.id}`,
      };
    });
}

function formatTournamentMode(tournament: Tournament) {
  if (tournament.tournament_mode === 'cream_of_the_crop') return 'Cream of the Crop';
  if (tournament.format === 'singles') return 'Singles';
  return 'Round Robin';
}

async function buildTournamentMonitorStartedNotifications(
  adminClient: ReturnType<typeof createClient>,
  tournament: Tournament,
  existingNotifications: Notification[],
) {
  if (!tournamentMonitorEmail) return [];

  const { data, error } = await adminClient
    .from('profiles')
    .select('id, email')
    .ilike('email', tournamentMonitorEmail)
    .maybeSingle();

  if (error) throw error;

  const monitorProfile = data as ProfileRow | null;
  if (!monitorProfile?.id) {
    console.log('send-tournament-push monitor skipped: profile not found', {
      tournamentMonitorEmail,
    });
    return [];
  }

  if (monitorProfile.id === tournament.organizer_user_id) {
    console.log('send-tournament-push monitor skipped: monitor is organizer', {
      monitorUserId: monitorProfile.id,
      tournamentId: tournament.id,
    });
    return [];
  }

  if (existingNotifications.some((notification) => notification.userId === monitorProfile.id)) {
    console.log('send-tournament-push monitor skipped: monitor already receiving notification', {
      monitorUserId: monitorProfile.id,
      tournamentId: tournament.id,
    });
    return [];
  }

  const organizer = tournament.organizer_name?.trim() || 'Another organizer';
  const monitorNotification = {
    userId: monitorProfile.id,
    title: 'Tournament started',
    body: `${titleFor(tournament)} by ${organizer}. ${tournament.player_count} players, ${tournament.courts} courts, ${tournament.rounds} rounds. ${formatTournamentMode(tournament)}.`,
    url: `/tournament/${tournament.id}`,
  };

  console.log('send-tournament-push monitor notification added', {
    monitorUserId: monitorProfile.id,
    tournamentId: tournament.id,
  });

  return [monitorNotification];
}

function buildMatchScoreNotifications(
  event: Extract<PushEvent, { eventType: 'match_score_submitted' }>,
  tournament: Tournament,
  playersById: Map<string, PlayerSlot>,
  matches: Match[],
  userId: string,
) {
  if (!event.matchId) throw new Error('Missing matchId');

  const match = matches.find((item) => item.id === event.matchId);
  if (!match || !match.is_complete) throw new Error('Completed match not found');

  const canManage = canManageTournament(tournament, userId);
  const canPlayerReport =
    !!tournament.allow_player_score_reporting && isUserInMatch(match, playersById, userId);

  if (!canManage && !canPlayerReport) {
    throw new Error('You cannot send score notifications for this match');
  }

  const teamA = teamName(playersById, match.team_a_player_1_id, match.team_a_player_2_id);
  const teamB = teamName(playersById, match.team_b_player_1_id, match.team_b_player_2_id);
  const score = `${match.team_a_score ?? '-'} - ${match.team_b_score ?? '-'}`;
  const scoreLine = `Round ${match.round_number}: ${teamA} ${score} ${teamB}`;
  const tournamentStillHasMatches = hasRemainingPlayableMatches(matches);
  const playerSlots = matchPlayerIds(match)
    .map((slotId) => playersById.get(slotId))
    .filter((slot): slot is PlayerSlot => !!slot?.claimed_by_user_id);

  const notifications: Notification[] = playerSlots.map((slot) => {
    const nextMatch = nextMatchForSlot(matches, match, slot.id);
    const nextLine = nextMatch
      ? nextAssignmentBody(nextMatch, playersById, slot)
      : tournamentStillHasMatches
        ? 'You are done for now. Open DinkDraw when your next round is ready.'
        : 'Tournament complete. Final results are ready.';

    return {
      userId: slot.claimed_by_user_id as string,
      title: 'Score posted',
      body: `${scoreLine}\n${nextLine}`,
      url: `/tournament/${tournament.id}`,
    };
  });

  if (!canManage && tournament.organizer_user_id !== userId) {
    notifications.push({
      userId: tournament.organizer_user_id,
      title: 'Score entered by player',
      body: scoreLine,
      url: `/tournament/${tournament.id}`,
    });
  }

  return notifications;
}

function buildTournamentCompletedNotifications(
  tournament: Tournament,
  players: PlayerSlot[],
  userId: string,
) {
  const isPlayer = players.some((slot) => slot.claimed_by_user_id === userId);

  if (!canManageTournament(tournament, userId) && !isPlayer) {
    throw new Error('You cannot send completion notifications for this tournament');
  }

  if (tournament.status !== 'completed') {
    throw new Error('Tournament is not completed yet');
  }

  const recipients = uniqueUserIds([
    tournament.organizer_user_id,
    ...players.map((slot) => slot.claimed_by_user_id),
  ]);

  return recipients.map((recipientId) => ({
    userId: recipientId,
    title: `${titleFor(tournament)} complete`,
    body: 'Final results are ready. Tap to view standings.',
    url: `/tournament/${tournament.id}/results`,
  }));
}

async function sendNotifications(adminClient: ReturnType<typeof createClient>, notifications: Notification[]) {
  const uniqueNotifications = Array.from(
    new Map(notifications.map((notification) => [notification.userId, notification])).values(),
  );

  if (!uniqueNotifications.length) {
    console.log('send-tournament-push token lookup skipped', {
      uniqueRecipientCount: 0,
    });
    return [];
  }

  const { data, error } = await adminClient
    .from('push_tokens')
    .select('user_id, token, platform')
    .in(
      'user_id',
      uniqueNotifications.map((notification) => notification.userId),
    )
    .eq('enabled', true)
    .eq('platform', 'ios')
    .order('updated_at', { ascending: false });

  if (error) throw error;

  const tokens = (data || []) as PushTokenRow[];
  const latestTokenByUserId = new Map<string, PushTokenRow>();

  for (const row of tokens) {
    if (!latestTokenByUserId.has(row.user_id)) {
      latestTokenByUserId.set(row.user_id, row);
    }
  }

  const latestTokens = Array.from(latestTokenByUserId.values());

  console.log('send-tournament-push token lookup complete', {
    uniqueRecipientCount: uniqueNotifications.length,
    enabledIosTokenCount: tokens.length,
    latestTokenCount: latestTokens.length,
  });

  const notificationByUserId = new Map(uniqueNotifications.map((notification) => [notification.userId, notification]));
  const results = [];

  for (const row of latestTokens) {
    const notification = notificationByUserId.get(row.user_id);
    if (!notification) continue;

    try {
      await sendApnsPush(row.token, notification);
      results.push({ userId: row.user_id, platform: row.platform, sent: true });
    } catch (error) {
      console.error('send-tournament-push APNs send failed', {
        userId: row.user_id,
        platform: row.platform,
        error: error instanceof Error ? error.message : 'Unknown send error',
      });

      results.push({
        userId: row.user_id,
        platform: row.platform,
        sent: false,
        error: error instanceof Error ? error.message : 'Unknown send error',
      });
    }
  }

  return results;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'content-type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing Authorization bearer token' }), {
        status: 401,
        headers: { ...corsHeaders, 'content-type': 'application/json' },
      });
    }

    const supabaseUrl = requiredEnv('SUPABASE_URL');
    const anonKey = requiredEnv('SUPABASE_ANON_KEY');
    const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Not signed in' }), {
        status: 401,
        headers: { ...corsHeaders, 'content-type': 'application/json' },
      });
    }

    const event = (await req.json()) as PushEvent;

    if (!event.tournamentId) {
      return new Response(JSON.stringify({ error: 'Missing tournamentId' }), {
        status: 400,
        headers: { ...corsHeaders, 'content-type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { tournament, players, matches, playersById } = await loadTournamentContext(
      adminClient,
      event.tournamentId,
    );

    let notifications: Notification[] = [];

    if (event.eventType === 'spot_claimed') {
      notifications = buildSpotClaimedNotifications(event, tournament, players, user.id);
    } else if (event.eventType === 'tournament_started') {
      notifications = buildTournamentStartedNotifications(
        tournament,
        players,
        matches,
        playersById,
        user.id,
      );
      notifications = [
        ...notifications,
        ...(await buildTournamentMonitorStartedNotifications(adminClient, tournament, notifications)),
      ];
    } else if (event.eventType === 'match_score_submitted') {
      notifications = buildMatchScoreNotifications(
        event,
        tournament,
        playersById,
        matches,
        user.id,
      );
    } else if (event.eventType === 'tournament_completed') {
      notifications = buildTournamentCompletedNotifications(tournament, players, user.id);
    } else {
      return new Response(JSON.stringify({ error: 'Unknown push event type' }), {
        status: 400,
        headers: { ...corsHeaders, 'content-type': 'application/json' },
      });
    }

    console.log('send-tournament-push request ready', {
      eventType: event.eventType,
      tournamentId: event.tournamentId,
      requesterUserId: user.id,
      requestedNotificationCount: notifications.length,
      recipientUserIds: notifications.map((notification) => notification.userId),
    });

    const results = await sendNotifications(adminClient, notifications);

    console.log('send-tournament-push results', {
      eventType: event.eventType,
      tournamentId: event.tournamentId,
      requestedNotificationCount: notifications.length,
      sentCount: results.filter((result) => result.sent).length,
      failedCount: results.filter((result) => !result.sent).length,
      results,
    });

    return new Response(JSON.stringify({ ok: true, requested: notifications.length, results }), {
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  } catch (error) {
    console.error('send-tournament-push failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'content-type': 'application/json' },
      },
    );
  }
});
