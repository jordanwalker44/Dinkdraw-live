'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

export default function DeepLinkHandler() {
  const router = useRouter();
  const [lastUrl, setLastUrl] = useState<string>('No deep link seen yet');

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      setLastUrl('Not native platform');
      return;
    }

    const handleUrl = (incomingUrl?: string) => {
      setLastUrl(incomingUrl || 'Empty URL received');

      if (!incomingUrl) return;

      try {
        const url = new URL(incomingUrl);
        const path = `${url.pathname}${url.search}${url.hash}`;

        if (url.hostname === 'dinkdraw.app' && path.startsWith('/tournament')) {
          setTimeout(() => {
            router.push(path);
          }, 500);
        }
      } catch (error) {
        setLastUrl('Deep link error');
      }
    };

    App.getLaunchUrl().then((result) => {
      handleUrl(result?.url);
    });

    App.addListener('appUrlOpen', (event) => {
      handleUrl(event.url);
    });
  }, [router]);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 80,
        left: 12,
        right: 12,
        zIndex: 99999,
        background: '#fff',
        border: '2px solid red',
        padding: 8,
        fontSize: 12,
        color: '#000',
      }}
    >
      Deep link debug: {lastUrl}
    </div>
  );
}
