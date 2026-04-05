'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase-browser';

const LAST_TOURNAMENT_KEY = 'dinkdraw_last_tournament';

type LastTournament = {
  id: string;
  title: string;
};

type NavItem = {
  label: string;
  href: string;
};

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [lastTournament, setLastTournament] = useState<LastTournament | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [initials, setInitials] = useState('');
  const [isSignedIn, setIsSignedIn] = useState(false);

  async function loadUser() {
    const supabase = getSupabaseBrowserClient();

    // Use getSession() first — reads from localStorage instantly, no network call
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;

    if (!user) {
      setIsSignedIn(false);
      setInitials('');
      return;
    }

    setIsSignedIn(true);

    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle();

    const name = profile?.display_name?.trim() || user.email?.split('@')[0] || '';
    const computed = name
      .split(/\s+/)
      .slice(0, 2)
      .map((p: string) => p[0]?.toUpperCase() || '')
      .join('');
    setInitials(computed || '?');
  }

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LAST_TOURNAMENT_KEY);
      if (stored) setLastTournament(JSON.parse(stored));
    } catch {}

    const supabase = getSupabaseBrowserClient();

    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const user = session?.user;
      if (!user) {
        setIsSignedIn(false);
        setInitials('');
        return;
      }

      setIsSignedIn(true);

      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .maybeSingle();

      const name = profile?.display_name?.trim() || user.email?.split('@')[0] || '';
      const computed = name
        .split(/\s+/)
        .slice(0, 2)
        .map((p: string) => p[0]?.toUpperCase() || '')
        .join('');
      setInitials(computed || '?');
    });

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadUser();
      }
    };

    const handleFocus = () => {
      loadUser();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  useEffect(() => {
    loadUser();
  }, [pathname]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  function isActive(href: string) {
    return pathname === href;
  }

  const playNav: NavItem[] = [
    { label: 'Home', href: '/' },
    { label: 'Create Tournament', href: '/tournament/create' },
    { label: 'Join Tournament', href: '/tournament/join' },
  ];

  const profileNav: NavItem[] = [
    { label: 'My Tournaments', href: '/my-tournaments' },
    { label: 'My Stats', href: '/my-stats' },
    { label: 'Leaderboard', href: '/leaderboard' },
    { label: 'Account', href: '/account' },
  ];

  return (
    <div className="top-nav-shell">
      <div className="top-nav-mobile-bar">
        <div className="top-nav-brand">DinkDraw</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={() => router.push('/account')}
            className={`nav-avatar ${isSignedIn ? 'signed-in' : 'signed-out'}`}
          >
            {isSignedIn ? initials : '?'}
          </button>

          <button
            type="button"
            className="nav-menu-button"
            onClick={() => setMenuOpen((prev) => !prev)}
          >
            {menuOpen ? 'Close' : 'Menu'}
          </button>
        </div>
      </div>

      <nav className={`top-nav ${menuOpen ? 'open' : ''}`}>
        <div>
          <div style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: '#94a3b8',
            marginBottom: 8,
          }}>
            Play
          </div>
          <div className="top-nav-group">
            {playNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-pill ${isActive(item.href) ? 'active' : ''}`}
              >
                {item.label}
              </Link>
            ))}
            {lastTournament && pathname !== `/tournament/${lastTournament.id}` ? (
              <Link href={`/tournament/${lastTournament.id}`} className="nav-pill accent">
                Resume
              </Link>
            ) : null}
          </div>
        </div>

        <div>
          <div style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: '#94a3b8',
            marginBottom: 8,
          }}>
            {isSignedIn ? 'My Profile' : 'Account'}
          </div>
          <div className="top-nav-group">
            {profileNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-pill ${isActive(item.href) ? 'active' : ''}`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>
    </div>
  );
}
