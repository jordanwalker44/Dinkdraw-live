'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { BottomNav } from './BottomNav';
import { AppHeader } from './AppHeader';

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const hideBottomNav = pathname?.startsWith('/tournament/view/');
  const bodyBottomPadding = hideBottomNav ? 16 : 88;

  return (
    <>
      <AppHeader />
      <div style={{ paddingBottom: bodyBottomPadding }}>{children}</div>
      {!hideBottomNav ? <BottomNav /> : null}
    </>
  );
}
