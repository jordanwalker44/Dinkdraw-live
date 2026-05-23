'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../../lib/supabase-browser';
import { TopNav } from '../../../components/TopNav';

function normalizeJoinCode(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);
}

function JoinTournamentInner() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState<boolean | null>(null);
  const [showAppDownloadBanner, setShowAppDownloadBanner] = useState(false);

  useEffect(() => {
    const userAgent = window.navigator.userAgent;

    const isIOS =
      /iPad|iPhone|iPod/.test(userAgent) ||
      (window.navigator.platform === 'MacIntel' &&
        window.navigator.maxTouchPoints > 1);

    const isNativeApp =
      new URLSearchParams(window.location.search).get('native_app') === '1';

    const dismissed =
      window.localStorage.getItem(
        'dinkdraw-app-download-banner-dismissed'
      ) === 'true';

    setShowAppDownloadBanner(isIOS && !isNativeApp && !dismissed);
  }, []);

  function dismissAppDownloadBanner() {
    window.localStorage.setItem(
      'dinkdraw-app-download-banner-dismissed',
      'true'
    );

    setShowAppDownloadBanner(false);
  }

  useEffect(() => {
    const codeFromUrl = searchParams.get('code') || '';
    if (codeFromUrl) {
      setCode(normalizeJoinCode(codeFromUrl));
    }

    async function checkAuth() {
      const { data } = await supabase.auth.getSession();
      setIsSignedIn(!!data.session?.user);
    }

    checkAuth();
  }, [searchParams, supabase]);

  const normalizedCode = normalizeJoinCode(code);
  const canJoin = normalizedCode.length > 0 && !isLoading;

  async function handleJoin() {
    setMessage('');

    const joinCode = normalizeJoinCode(code);

    if (!joinCode) {
      setMessage('Enter a join code.');
      return;
    }

    setIsLoading(true);

    const { data, error } = await supabase
      .from('tournaments')
      .select('id, title, join_code, status')
      .eq('join_code', joinCode)
      .maybeSingle();

    setIsLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    if (!data) {
      setMessage(`No tournament found for code "${joinCode}".`);
      return;
    }

    router.push(`/tournament/${data.id}`);
  }

  if (isSignedIn === null) {
    return (
      <div className="card">
        <div className="muted">Loading...</div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="card">
        <div className="card-title">Sign in to join</div>
        <div className="card-subtitle">
          You need an account to claim your spot and track your stats. It only takes a minute to create one.
        </div>
        <div className="grid">
          <button
            className="button primary"
            onClick={() => {
              const codeParam = normalizedCode ? `?returnCode=${normalizedCode}` : '';
              router.push(`/account${codeParam}`);
            }}
          >
            Sign In or Create Account
          </button>
          <div className="muted" style={{ fontSize: 13, textAlign: 'center' }}>
            Your join code <strong>{normalizedCode || '...'}</strong> will be saved and you'll be brought right back.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-title">Enter Join Code</div>
      <div className="card-subtitle">
        Ask the organizer for the 6-character code.
      </div>

      <div className="grid">
        <div>
          <label className="label">Join code</label>
          <input
            className="input"
            value={code}
            onChange={(e) => setCode(normalizeJoinCode(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canJoin) {
                void handleJoin();
              }
            }}
            placeholder="ABC123"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            maxLength={6}
            style={{
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
              textAlign: 'center',
              fontSize: 28,
              fontWeight: 800,
            }}
          />
        </div>

        <button className="button primary" onClick={handleJoin} disabled={!canJoin}>
          {isLoading ? 'Joining...' : 'Join Tournament'}
        </button>

        {message ? <div className="notice">{message}</div> : null}

        {showAppDownloadBanner ? (
          <div
            className="card"
            style={{
              position: 'relative',
              marginTop: 14,
              padding: 10,
              borderColor: 'rgba(255,203,5,.24)',
              background: 'rgba(255,203,5,.06)',
            }}
          >
            <button
              type="button"
              aria-label="Dismiss app download banner"
              onClick={dismissAppDownloadBanner}
              style={{
                position: 'absolute',
                right: 12,
                top: 12,
                border: '1px solid rgba(255,255,255,.18)',
                background: 'rgba(255,255,255,.06)',
                color: '#fff',
                borderRadius: 999,
                width: 30,
                height: 30,
                fontWeight: 900,
              }}
            >
              ×
            </button>

            <div
              style={{
                fontWeight: 900,
                textAlign: 'center',
                marginBottom: 8,
                fontSize: 15,
                paddingRight: 32,
                paddingLeft: 32,
              }}
            >
              Get the DinkDraw iPhone app
            </div>

            <a
              href="https://apps.apple.com/us/app/dinkdraw/id6762402213"
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              <img
                src="/app-store-badge.svg"
                alt="Download on the App Store"
                style={{
                  height: 44,
                  width: 'auto',
                  display: 'block',
                }}
              />
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function JoinTournamentFallback() {
  return (
    <div className="card">
      <div className="muted">Loading join page...</div>
    </div>
  );
}

export default function JoinTournamentPage() {
  return (
    <main
  className="page-shell"
  style={{
    paddingTop: 90,
  }}
>
      <div className="hero" style={{ marginBottom: 8 }}>
  <div className="hero-inner" style={{ padding: '12px 14px' }}>
          <h1 className="hero-title">Join Tournament</h1>
          <p className="hero-subtitle">
            Enter a join code from any phone and jump right into the event.
          </p>
        </div>
      </div>

      <TopNav />

      <Suspense fallback={<JoinTournamentFallback />}>
        <JoinTournamentInner />
      </Suspense>
    </main>
  );
}