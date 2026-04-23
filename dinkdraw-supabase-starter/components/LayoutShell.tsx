'use client';

import { usePathname } from 'next/navigation';
import { AuthRefresh } from './AuthRefresh';
import { BottomNav } from './BottomNav';

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const hideBottomNav = pathname.startsWith('/tournament/view/');

  return (
    <>
      <AuthRefresh />
      {children}
      {!hideBottomNav ? <BottomNav /> : null}
    </>
  );
}