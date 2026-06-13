'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';

function getPathFromDeepLink(url: string): string | null {
  try {
    const parsed = new URL(url);

    if (parsed.hostname !== 'dinkdraw.app') {
      return null;
    }

    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

export default function DeepLinkHandler() {
  const router = useRouter();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    const openDeepLink = (url: string) => {
      const path = getPathFromDeepLink(url);

      console.log('DEEPLINK DEBUG: received url', url);
      console.log('DEEPLINK DEBUG: routing to path', path);

      if (!path) {
        return;
      }

      router.push(path);
    };

    CapacitorApp.getLaunchUrl().then((launchUrl) => {
      if (launchUrl?.url) {
        openDeepLink(launchUrl.url);
      }
    });

    const listener = CapacitorApp.addListener('appUrlOpen', (event) => {
      openDeepLink(event.url);
    });

    return () => {
      listener.then((handle) => handle.remove());
    };
  }, [router]);

  return null;
}
