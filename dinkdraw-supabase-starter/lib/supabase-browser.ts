import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient() {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase environment variables.');
  }

  browserClient = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    },
  });

  return browserClient;
}

let publicBrowserClient: SupabaseClient | null = null;

// Only use for data whose SELECT policies already allow anonymous access.
// Supplying accessToken keeps these reads independent of Auth initialization
// and token refresh. Account data and all mutations use the signed-in client.
export function getSupabasePublicBrowserClient() {
  if (publicBrowserClient) return publicBrowserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase environment variables.');
  publicBrowserClient = createClient(url, key, {
    accessToken: async () => key,
  });
  return publicBrowserClient;
}
