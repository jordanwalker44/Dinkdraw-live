'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

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
  const [lastTournament, setLastTournament] = useState<LastTournament | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LAST_TOURNAMENT_KEY);
      if (stored) {
        setLastTournament(JSON.parse(stored));
      }
    } catch {}
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

        <button
          type="button"
          className="nav-menu-button"
          onClick={() => setMenuOpen((prev) => !prev)}
        >
          {menuOpen ? 'Close' : 'Menu'}
        </button>
      </div>

      <nav className={`top-nav ${menuOpen ? 'open' : ''}`}>
        <div className="top-nav-group">
          {primaryNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-pill ${isActive(item.href) ? 'active' : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="top-nav-group">
          {secondaryNav.map((item) => (
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
      </nav>
    </div>
  );
}
