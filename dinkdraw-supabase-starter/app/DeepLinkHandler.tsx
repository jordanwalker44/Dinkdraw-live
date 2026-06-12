'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

export default function DeepLinkHandler() {
  const router = useRouter();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    App.addListener('appUrlOpen', (event) => {
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
  }, [router]);

  return null;
}
