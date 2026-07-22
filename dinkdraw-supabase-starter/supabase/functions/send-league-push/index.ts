import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

type LeagueEvent =
  | { eventType: 'roster_claimed'; leagueId: string }
  | { eventType: 'attendance_requested'; sessionId: string }
  | { eventType: 'substitute_invited'; sessionId: string; regularMemberId: string }
  | { eventType: 'substitute_response'; sessionId: string; regularMemberId: string; accepted: boolean }
  | { eventType: 'session_started'; sessionId: string }
  | { eventType: 'standings_updated'; sessionId: string };
type Notification = { userId: string; title: string; body: string; url: string };
type PushToken = { user_id: string; token: string; platform: string };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function base64UrlEncode(input: ArrayBuffer | Uint8Array | string) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function pemToArrayBuffer(pem: string) {
  const base64 = pem.replace(/\\n/g, '\n').replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '').replace(/\s/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

async function createApnsJwt() {
  const header = { alg: 'ES256', kid: requiredEnv('APNS_KEY_ID') };
  const claims = { iss: requiredEnv('APNS_TEAM_ID'), iat: Math.floor(Date.now() / 1000) };
  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claims))}`;
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', pemToArrayBuffer(requiredEnv('APNS_PRIVATE_KEY')),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  );
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, cryptoKey, new TextEncoder().encode(signingInput),
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
      'apns-push-type': 'alert', 'apns-priority': '10', 'content-type': 'application/json',
    },
    body: JSON.stringify({ aps: { alert: { title: notification.title, body: notification.body }, sound: 'default' }, url: notification.url }),
  });
  if (!response.ok) throw new Error(`APNs failed with ${response.status}: ${await response.text()}`);
}

async function sendNotifications(adminClient: ReturnType<typeof createClient>, notifications: Notification[]) {
  const unique = Array.from(new Map(notifications.filter((item) => !!item.userId).map((item) => [item.userId, item])).values());
  if (!unique.length) return [];
  const { data, error } = await adminClient.from('push_tokens').select('user_id, token, platform')
    .in('user_id', unique.map((item) => item.userId)).eq('enabled', true).eq('platform', 'ios').order('updated_at', { ascending: false });
  if (error) throw error;
  const latest = new Map<string, PushToken>();
  for (const token of (data || []) as PushToken[]) if (!latest.has(token.user_id)) latest.set(token.user_id, token);
  const byUser = new Map(unique.map((item) => [item.userId, item]));
  const results = [];
  for (const token of latest.values()) {
    const notification = byUser.get(token.user_id);
    if (!notification) continue;
    try {
      await sendApnsPush(token.token, notification);
      results.push({ userId: token.user_id, sent: true });
    } catch (error) {
      results.push({ userId: token.user_id, sent: false, error: error instanceof Error ? error.message : 'Push failed' });
    }
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401, headers: corsHeaders });
    const supabaseUrl = requiredEnv('SUPABASE_URL');
    const userClient = createClient(supabaseUrl, requiredEnv('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401, headers: corsHeaders });

    const adminClient = createClient(supabaseUrl, requiredEnv('SUPABASE_SERVICE_ROLE_KEY'));
    const event = await req.json() as LeagueEvent;
    let leagueId = 'leagueId' in event ? event.leagueId : '';
    let session: any = null;
    if ('sessionId' in event) {
      const { data, error } = await adminClient.from('league_sessions').select('*, leagues(*)').eq('id', event.sessionId).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('League session not found');
      session = data;
      leagueId = data.league_id;
    }
    const { data: league, error: leagueError } = await adminClient.from('leagues').select('*').eq('id', leagueId).maybeSingle();
    if (leagueError) throw leagueError;
    if (!league) throw new Error('League not found');

    const isOrganizer = league.organizer_user_id === user.id;
    const { data: members, error: memberError } = await adminClient.from('league_members').select('*').eq('league_id', league.id);
    if (memberError) throw memberError;
    const memberRows = members || [];
    const memberById = new Map(memberRows.map((member: any) => [member.id, member]));
    const notifications: Notification[] = [];
    const leagueUrl = `/leagues/${league.id}`;

    if (event.eventType === 'roster_claimed') {
      const claimed = memberRows.find((member: any) => member.user_id === user.id && member.member_type === 'regular');
      if (!claimed) throw new Error('Claimed roster position not found');
      if (league.organizer_user_id !== user.id) notifications.push({ userId: league.organizer_user_id, title: league.name, body: `${claimed.display_name || 'A player'} claimed roster position ${claimed.roster_position}.`, url: leagueUrl });
    } else if (event.eventType === 'attendance_requested') {
      if (!isOrganizer) throw new Error('Only the organizer can request attendance');
      for (const member of memberRows.filter((item: any) => item.member_type === 'regular' && item.user_id && item.user_id !== user.id)) {
        notifications.push({ userId: member.user_id, title: `${league.name} attendance`, body: `Please confirm your availability for Week ${session.session_number}.`, url: leagueUrl });
      }
    } else if (event.eventType === 'substitute_invited') {
      if (!isOrganizer) throw new Error('Only the organizer can invite a substitute');
      const { data: attendance, error } = await adminClient.from('league_session_attendance').select('*').eq('session_id', event.sessionId).eq('regular_member_id', event.regularMemberId).maybeSingle();
      if (error) throw error;
      const substitute = attendance?.substitute_member_id ? memberById.get(attendance.substitute_member_id) as any : null;
      const regular = memberById.get(event.regularMemberId) as any;
      if (!substitute?.user_id || attendance?.attendance_status !== 'sub_invited') throw new Error('Substitute invitation not found');
      notifications.push({ userId: substitute.user_id, title: `${league.name} substitute request`, body: `Can you play for ${regular?.display_name || 'a league member'} in Week ${session.session_number}?`, url: leagueUrl });
    } else if (event.eventType === 'substitute_response') {
      const regular = memberById.get(event.regularMemberId) as any;
      const substitute = memberRows.find((member: any) => member.user_id === user.id && member.member_type === 'substitute');
      if (!substitute) throw new Error('Substitute membership not found');
      const { data: response, error } = await adminClient.from('league_substitute_responses').select('*')
        .eq('session_id', event.sessionId).eq('regular_member_id', event.regularMemberId)
        .eq('substitute_member_id', substitute.id).eq('responded_by_user_id', user.id)
        .eq('accepted', event.accepted).is('push_sent_at', null).order('responded_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      if (!response) throw new Error('Substitute response not found');
      const { error: claimError } = await adminClient.from('league_substitute_responses')
        .update({ push_sent_at: new Date().toISOString() }).eq('id', response.id).is('push_sent_at', null);
      if (claimError) throw claimError;
      notifications.push({ userId: league.organizer_user_id, title: `${league.name} substitute response`, body: `${substitute.display_name || 'The substitute'} ${event.accepted ? 'accepted' : 'declined'} the Week ${session.session_number} request for ${regular?.display_name || 'a player'}.`, url: leagueUrl });
      if (regular?.user_id && regular.user_id !== league.organizer_user_id) notifications.push({ userId: regular.user_id, title: `${league.name} substitute response`, body: `${substitute.display_name || 'The substitute'} ${event.accepted ? 'accepted' : 'declined'} your Week ${session.session_number} request.`, url: leagueUrl });
    } else if (event.eventType === 'session_started') {
      if (!isOrganizer || !session?.tournament_id) throw new Error('Only the organizer can send session start notifications');
      const { data: mappings, error } = await adminClient.from('league_session_players').select('actual_member_id').eq('session_id', event.sessionId);
      if (error) throw error;
      for (const mapping of mappings || []) {
        const actual = memberById.get(mapping.actual_member_id) as any;
        if (actual?.user_id && actual.user_id !== user.id) notifications.push({ userId: actual.user_id, title: `${league.name} Week ${session.session_number}`, body: 'Teams and the two-match opponent schedule are ready.', url: `/tournament/${session.tournament_id}` });
      }
    } else if (event.eventType === 'standings_updated') {
      if (!isOrganizer || session?.status !== 'completed') throw new Error('Only the organizer can send completed standings notifications');
      for (const member of memberRows.filter((item: any) => item.member_type === 'regular' && item.user_id && item.user_id !== user.id)) {
        notifications.push({ userId: member.user_id, title: `${league.name} standings updated`, body: `Week ${session.session_number} is complete. See the latest adjusted wins and point differential.`, url: leagueUrl });
      }
    } else {
      throw new Error('Unknown League push event');
    }

    const results = await sendNotifications(adminClient, notifications);
    return new Response(JSON.stringify({ ok: true, requested: notifications.length, results }), { headers: { ...corsHeaders, 'content-type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } });
  }
});
