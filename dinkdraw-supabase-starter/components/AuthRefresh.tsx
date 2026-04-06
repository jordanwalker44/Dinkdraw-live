'use client';

import { useEffect } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase-browser';

export function AuthRefresh() {
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    async function refresh() {
      await supabase.auth.getSession();
    }

    // Ping the DB to keep it warm
    async function keepAlive() {
      await supabase.from('tournaments').select('id').limit(1);
    }

    // Refresh auth and warm up DB on mount
    refresh();
    keepAlive();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refresh();
        keepAlive();
      }
    };

    const handleFocus = () => {
      refresh();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  return null;
}
