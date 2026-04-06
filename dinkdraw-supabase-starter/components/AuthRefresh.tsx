'use client';

import { useEffect } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase-browser';

export function AuthRefresh() {
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    async function refresh() {
      await supabase.auth.getSession();
    }

    async function keepAlive() {
      try {
        await supabase.from('tournaments').select('id').limit(1);
      } catch {}
    }

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
