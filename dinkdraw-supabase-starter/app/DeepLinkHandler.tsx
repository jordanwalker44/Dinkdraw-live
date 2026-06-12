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

    if (!appPlugin) return;

    const handleUrl = (incomingUrl?: string) => {
      if (!incomingUrl) return;

      try {
        const url = new URL(incomingUrl);

        if (url.hostname !== 'dinkdraw.app') return;

        const path = `${url.pathname}${url.search}${url.hash}`;

        if (path.startsWith('/tournament')) {
          router.push(path);
        }
      } catch (error) {
        console.error('Deep link failed:', error);
      }
    };

    appPlugin.getLaunchUrl?.().then((result: { url?: string }) => {
      handleUrl(result?.url);
    });

    const listener = appPlugin.addListener?.('appUrlOpen', (event: { url: string }) => {
      handleUrl(event.url);
    });

    return () => {
      listener?.remove?.();
    };
  }, [router]);

  return null;
}
