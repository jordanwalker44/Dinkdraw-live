'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavItem = {
  label: string;
  href: string;
  center?: boolean;
  match: (pathname: string) => boolean;
};

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="bottom-nav-svg">
      <path
        d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5a.5.5 0 0 1-.5-.5V14a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v6.5a.5.5 0 0 1-.5.5H5a1 1 0 0 1-1-1v-9.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="bottom-nav-svg">
      <rect x="4" y="4" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="bottom-nav-svg">
      <path
        d="M12 5v14M5 12h14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="bottom-nav-svg">
      <path
        d="M8 4h8v2a4 4 0 0 0 4 4 6 6 0 0 1-6 6h-1v2h3v2H8v-2h3v-2h-1a6 6 0 0 1-6-6 4 4 0 0 0 4-4V4Z"
        fill="currentColor"
      />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="bottom-nav-svg">
      <circle cx="12" cy="8" r="3.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M5 19a7 7 0 0 1 14 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BottomNav() {
  const pathname = usePathname();

  const items: NavItem[] = [
    {
      label: 'Home',
      href: '/',
      match: (p) => p === '/',
    },
    {
      label: 'Tournaments',
      href: '/my-tournaments',
      match: (p) => p === '/my-tournaments' || p.startsWith('/tournament/'),
    },
    {
      label: 'Create',
      href: '/tournament/create',
      center: true,
      match: (p) => p === '/tournament/create',
    },
    {
      label: 'Leaderboard',
      href: '/leaderboard',
      match: (p) => p === '/leaderboard',
    },
    {
      label: 'Account',
      href: '/account',
      match: (p) => p === '/account' || p === '/my-stats',
    },
  ];

  function renderIcon(label: string) {
    switch (label) {
      case 'Home':
        return <HomeIcon />;
      case 'Tournaments':
        return <GridIcon />;
      case 'Create':
        return <PlusIcon />;
      case 'Leaderboard':
        return <TrophyIcon />;
      case 'Account':
        return <UserIcon />;
      default:
        return null;
    }
  }

  return (
    <nav className="bottom-nav" aria-label="Bottom navigation">
      {items.map((item) => {
        const active = item.match(pathname);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`bottom-nav-item ${active ? 'active' : ''} ${item.center ? 'center' : ''}`}
          >
            <span className="bottom-nav-icon">{renderIcon(item.label)}</span>
            <span className="bottom-nav-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
