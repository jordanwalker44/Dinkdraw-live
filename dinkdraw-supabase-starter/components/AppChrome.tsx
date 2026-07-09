'use client';

import { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { BottomNav } from './BottomNav';
import { AppHeader } from './AppHeader';

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isTvMode, setIsTvMode] = useState(false);

  const isPublicTournamentView = pathname?.startsWith('/tournament/view/');
  const hideBottomNav = isPublicTournamentView;
  const bodyBottomPadding = hideBottomNav ? (isTvMode ? 0 : 16) : 88;

  useEffect(() => {
    if (!isPublicTournamentView) {
      setIsTvMode(false);
      return;
    }

    setIsTvMode(new URLSearchParams(window.location.search).get('tv') === '1');
  }, [isPublicTournamentView, pathname]);

  return (
    <>
      {!isTvMode ? <AppHeader /> : null}
      <div style={{ paddingBottom: bodyBottomPadding }}>{children}</div>
      {!hideBottomNav ? <BottomNav /> : null}
    </>
  );
}
