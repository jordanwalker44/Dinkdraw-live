'use client';

import { useEffect, useMemo, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const INSTALL_PROMPT_DISMISSED_KEY = 'dinkdraw_install_prompt_dismissed';

function isIos() {
  if (typeof window === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isInStandaloneMode() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
const [isNativeApp, setIsNativeApp] = useState(false);

  useEffect(() => {
  try {
    const saved = window.localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY);
    if (saved === 'true') {
      setDismissed(true);
    }
  } catch {}
}, []);

useEffect(() => {
  if (typeof window !== 'undefined') {
    setIsNativeApp(window.location.search.includes('native_app=1'));
  }
}, []);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const showIosPrompt = useMemo(() => {
    return isIos() && !isInStandaloneMode() && !dismissed;
  }, [dismissed]);

  const showInstallButton = useMemo(() => {
    return !!deferredPrompt && !isInStandaloneMode() && !dismissed;
  }, [deferredPrompt, dismissed]);

  function dismissPrompt() {
    setDismissed(true);
    try {
      window.localStorage.setItem(INSTALL_PROMPT_DISMISSED_KEY, 'true');
    } catch {}
  }

  async function handleInstall() {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;

    if (choice.outcome === 'accepted') {
      setDismissed(true);
      try {
        window.localStorage.setItem(INSTALL_PROMPT_DISMISSED_KEY, 'true');
      } catch {}
    }

    setDeferredPrompt(null);
  }

if (!showIosPrompt && !showInstallButton) return null;

return (
  <div
    style={{
      position: 'sticky',
      top: 0,
      zIndex: 1000,
      padding: '10px 14px',
      background: '#0f1722',
      borderBottom: '1px solid rgba(255,255,255,.08)',
    }}
  >
    <div
      style={{
        maxWidth: 960,
        margin: '0 auto',
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ fontSize: 14, lineHeight: 1.4 }}>
        <strong style={{ display: 'block', marginBottom: 2 }}>Install DinkDraw</strong>
        {showInstallButton ? (
          <span>Add DinkDraw to your home screen for a faster app-like experience.</span>
        ) : (
          <span>
            On iPhone, tap <strong>Share</strong> then <strong>Add to Home Screen</strong>.
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {showInstallButton ? (
          <button className="button primary" onClick={handleInstall}>
            Install
          </button>
        ) : null}

        <button className="button secondary" onClick={dismissPrompt}>
          Not now
        </button>
      </div>
    </div>
  </div>
);
}
