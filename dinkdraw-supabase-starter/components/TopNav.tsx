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

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LAST_TOURNAMENT_KEY);
      if (stored) setLastTournament(JSON.parse(stored));
    } catch {}

    const supabase = getSupabaseBrowserClient();

    async function loadUser() {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;

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

    return () => { subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const primaryNav: NavItem[] = [
    { label: 'Home', href: '/' },
    { label: 'Create', href: '/tournament/create' },
    { label: 'Join', href: '/tournament/join' },
  ];

  const secondaryNav: NavItem[] = [
    { label: 'My Tournaments', href: '/my-tournaments' },
    { label: 'My Stats', href: '/my-stats' },
    { label: 'Leaderboard', href: '/leaderboard' },
    { label: 'Account', href: '/account' },
  ];

  function isActive(href: string) {
    return pathname === href;
  }

  return (
    <div className="top-nav-shell">
      <div className="top-nav-mobile-bar">
        <div className="top-nav-brand">DinkDraw</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Avatar circle */}
          <button
            type="button"
            onClick={() => router.push('/account')}
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: isSignedIn ? 'rgba(255,203,5,.15)' : 'rgba(255,255,255,.08)',
              border: isSignedIn ? '1px solid rgba(255,203,5,.4)' : '1px solid rgba(255,255,255,.15)',
              color: isSignedIn ? '#FFCB05' : '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: 13,
              cursor: 'pointer',
              flexShrink: 0,
            }}
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
        <div className="top-nav-group">
          {primaryNav.map((item) => (
            <Link key={item.href} href={item.href} className={`nav-pill ${isActive(item.href) ? 'active' : ''}`}>
              {item.label}
            </Link>
          ))}
        </div>

        <div className="top-nav-group">
          {secondaryNav.map((item) => (
            <Link key={item.href} href={item.href} className={`nav-pill ${isActive(item.href) ? 'active' : ''}`}>
              {item.label}
            </Link>
          ))}

          {lastTournament && pathname !== `/tournament/${lastTournament.id}` ? (
            <Link href={`/tournament/${lastTournament.id}`} className="nav-pill accent">
              Resume
            </Link>
          ) : null}
        </div>
      </nav>
    </div>
  );
}
