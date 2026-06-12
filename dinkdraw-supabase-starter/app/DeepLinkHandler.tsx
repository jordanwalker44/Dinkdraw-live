'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

declare global {
  interface Window {
    Capacitor?: any;
  }
}

export default function DeepLinkHandler() {
  const router = useRouter();

  useEffect(() => {
    const appPlugin = window.Capacitor?.Plugins?.App;

    if (!appPlugin?.addListener) return;

    const listener = appPlugin.addListener('appUrlOpen', (event: { url: string }) => {
      try {
        const url = new URL(event.url);

        if (url.hostname !== 'dinkdraw.app') return;

        const path = `${url.pathname}${url.search}${url.hash}`;

        if (path.startsWith('/tournament')) {
          router.push(path);
        }
      } catch (error) {
        console.error('Deep link failed:', error);
      }
    });

    return () => {
      listener?.remove?.();
    };
  }, [router]);

  return null;
}
