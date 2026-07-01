'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { getSupabaseBrowserClient } from '../lib/supabase-browser';

export default function PushNotificationHandler() {
  const router = useRouter();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const supabase = getSupabaseBrowserClient();
    let isMounted = true;

    async function saveToken(tokenValue: string) {
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      if (!user) return;

      const { error } = await supabase.from('push_tokens').upsert(
        {
          user_id: user.id,
          token: tokenValue,
          platform: Capacitor.getPlatform(),
          enabled: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,token' }
      );

      if (error) {
        console.error('Push token save failed:', error.message);
      }
    }

    async function registerForCurrentUser() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;

      if (Capacitor.getPlatform() === 'android') {
        await PushNotifications.createChannel({
          id: 'tournament_updates',
          name: 'Tournament Updates',
          description: 'Match assignments, scores, and tournament status updates.',
          importance: 4,
          visibility: 1,
          vibration: true,
        });
      }

      let permissions = await PushNotifications.checkPermissions();

      if (permissions.receive === 'prompt' || permissions.receive === 'prompt-with-rationale') {
        permissions = await PushNotifications.requestPermissions();
      }

      if (permissions.receive === 'granted') {
        await PushNotifications.register();
      }
    }

    async function setupPush() {
      const registrationListener = await PushNotifications.addListener('registration', (token) => {
        void saveToken(token.value);
      });

      const registrationErrorListener = await PushNotifications.addListener('registrationError', (error) => {
        console.error('Push registration failed:', error.error);
      });

      const tapListener = await PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
        const url = event.notification.data?.url;

        if (typeof url === 'string' && url.startsWith('/tournament')) {
          router.push(url);
        }
      });

      await registerForCurrentUser();

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          void registerForCurrentUser();
        }
      });

      return async () => {
        subscription.unsubscribe();
        await registrationListener.remove();
        await registrationErrorListener.remove();
        await tapListener.remove();
      };
    }

    let cleanup: (() => Promise<void>) | undefined;

    setupPush()
      .then((handler) => {
        if (isMounted) cleanup = handler;
      })
      .catch((error) => {
        console.error('Push setup failed:', error);
      });

    return () => {
      isMounted = false;
      void cleanup?.();
    };
  }, [router]);

  return null;
}
