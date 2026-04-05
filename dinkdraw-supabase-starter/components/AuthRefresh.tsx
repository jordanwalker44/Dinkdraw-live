'use client';

import { useEffect } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase-browser';

export function AuthRefresh() {
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    async function refresh() {
      await supabase.auth.getSession();
    }

    // Refresh on mount
    refresh();

    // Refresh when screen wakes up
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    };

    // Refresh when window gets focus
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
