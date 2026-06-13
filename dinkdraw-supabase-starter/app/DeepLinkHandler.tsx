'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

export default function DeepLinkHandler() {
  const router = useRouter();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const handleUrl = (incomingUrl?: string) => {
  console.log('DEEPLINK DEBUG WEB: incomingUrl', incomingUrl);

  if (!incomingUrl) return;

      try {
        const url = new URL(incomingUrl);

        if (url.hostname !== 'dinkdraw.app') return;

        const path = `${url.pathname}${url.search}${url.hash}`;

        if (path.startsWith('/tournament')) {
  console.log('DEEPLINK DEBUG WEB: pushing path', path);
  router.push(path);
}
      } catch (error) {
        console.error('Deep link failed:', error);
      }
    };

    App.getLaunchUrl().then((result) => {
  console.log('DEEPLINK DEBUG WEB: getLaunchUrl', result);
  handleUrl(result?.url);
});

    const listener = App.addListener('appUrlOpen', (event) => {
  console.log('DEEPLINK DEBUG WEB: appUrlOpen', event);
  handleUrl(event.url);
});

    return () => {
      listener.then((handle) => handle.remove());
    };
  }, [router]);

  return null;
}
