'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavItem = {
  label: string;
  href: string;
  icon: string;
  match: (pathname: string) => boolean;
  center?: boolean;
};

export function BottomNav() {
  const pathname = usePathname();

  const items: NavItem[] = [
    {
      label: 'Home',
      href: '/',
      icon: '⌂',
      match: (p) => p === '/',
    },
    {
      label: 'Tournaments',
      href: '/my-tournaments',
      icon: '◫',
      match: (p) =>
        p === '/my-tournaments' ||
        p.startsWith('/tournament/'),
    },
    {
      label: 'Create',
      href: '/tournament/create',
      icon: '+',
      center: true,
      match: (p) => p === '/tournament/create',
    },
    {
      label: 'Leaderboard',
      href: '/leaderboard',
      icon: '🏆',
      match: (p) => p === '/leaderboard',
    },
    {
      label: 'Account',
      href: '/account',
      icon: '◯',
      match: (p) => p === '/account' || p === '/my-stats',
    },
  ];

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
            <span className="bottom-nav-icon">{item.icon}</span>
            <span className="bottom-nav-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
