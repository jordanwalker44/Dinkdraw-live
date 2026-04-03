'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const LAST_TOURNAMENT_KEY = 'dinkdraw_last_tournament';

export function TopNav() {
  const pathname = usePathname();
  const [lastTournament, setLastTournament] = useState<{
    id: string;
    title: string;
  } | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LAST_TOURNAMENT_KEY);
      if (stored) {
        setLastTournament(JSON.parse(stored));
      }
    } catch {}
  }, []);

  function navButton(label: string, href: string) {
    const isActive = pathname === href;

    return (
      <Link href={href}>
        <button
          style={{
            fontWeight: isActive ? 700 : 500,
            opacity: isActive ? 1 : 0.8,
            borderBottom: isActive ? '2px solid #a3e635' : '2px solid transparent',
          }}
        >
          {label}
        </button>
      </Link>
    );
  }

  return (
    <div
      className="top-nav"
      style={{
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
      }}
    >
      {navButton('Home', '/')}
      {navButton('My Tournaments', '/my-tournaments')}
      {navButton('My Stats', '/my-stats')}
      {navButton('Leaderboard', '/leaderboard')}
      {navButton('Create', '/tournament/create')}
      {navButton('Join', '/tournament/join')}

      {lastTournament && pathname !== `/tournament/${lastTournament.id}` && (
        <Link href={`/tournament/${lastTournament.id}`}>
          <button
            style={{
              background: '#a3e635',
              color: '#000',
              fontWeight: 700,
            }}
          >
            Resume
          </button>
        </Link>
      )}
    </div>
  );
}
