import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

type PushRequest = {
  title?: string;
  body?: string;
  url?: string;
  token?: string;
  userId?: string;
};

type PushTokenRow = {
  token: string;
  platform: string;
};

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

async function sendApnsPush(token: string, notification: Required<Pick<PushRequest, 'title' | 'body' | 'url'>>) {
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

    const payload = (await req.json()) as PushRequest;
    const targetUserId = payload.userId || user.id;

    if (targetUserId !== user.id) {
      return new Response(JSON.stringify({ error: 'This test function can only notify your own user' }), {
        status: 403,
        headers: { ...corsHeaders, 'content-type': 'application/json' },
      });
    }

    const notification = {
      title: payload.title?.trim() || 'DinkDraw test',
      body: payload.body?.trim() || 'Push notifications are connected.',
      url: payload.url?.trim() || '/my-tournaments',
    };

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    let tokenRows: PushTokenRow[] = [];

    if (payload.token) {
      tokenRows = [{ token: payload.token, platform: 'ios' }];
    } else {
      const { data, error } = await adminClient
        .from('push_tokens')
        .select('token, platform')
        .eq('user_id', targetUserId)
        .eq('enabled', true)
        .eq('platform', 'ios')
        .order('updated_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      tokenRows = data || [];
    }

    if (!tokenRows.length) {
      return new Response(JSON.stringify({ error: 'No enabled iOS push token found for this user' }), {
        status: 404,
        headers: { ...corsHeaders, 'content-type': 'application/json' },
      });
    }

    const results = [];

    for (const row of tokenRows) {
      if (row.platform !== 'ios') {
        results.push({ platform: row.platform, sent: false, error: 'Only iOS/APNs is implemented in this test function' });
        continue;
      }

      try {
        await sendApnsPush(row.token, notification);
        results.push({ platform: row.platform, sent: true });
      } catch (error) {
        results.push({
          platform: row.platform,
          sent: false,
          error: error instanceof Error ? error.message : 'Unknown send error',
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  } catch (error) {
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
