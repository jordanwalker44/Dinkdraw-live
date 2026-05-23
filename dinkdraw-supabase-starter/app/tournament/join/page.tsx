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

  // Still checking auth
  if (isSignedIn === null) {
    return (
      <div className="card">
        <div className="muted">Loading...</div>
      </div>
    );
  }

  // Not signed in — prompt to sign in
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

        <div className="list-item">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Tip</div>
          <div className="muted">
            Codes ignore spaces and lowercase letters, so players can paste them in fast.
          </div>
        </div>

        <button className="button primary" onClick={handleJoin} disabled={!canJoin}>
          {isLoading ? 'Joining...' : 'Join Tournament'}
        </button>

        {message ? <div className="notice">{message}</div> : null}
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

  return (
    <main className="page-shell">
      <div className="hero">
        <div className="hero-inner">
          <h1 className="hero-title">Join Tournament</h1>
          <p className="hero-subtitle">
            Enter a join code from any phone and jump right into the event.
          </p>
        </div>
      </div>

      {showAppDownloadBanner ? (
        <div
          className="card"
          style={{
            marginBottom: 14,
            padding: 14,
            borderColor: 'rgba(255,203,5,.24)',
            background: 'rgba(255,203,5,.06)',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 900, marginBottom: 4 }}>
                Get the DinkDraw app
              </div>

              <div
                className="muted"
                style={{
                  fontSize: 13,
                  lineHeight: 1.35,
                }}
              >
                For the best iPhone tournament experience, download DinkDraw from the App Store.
              </div>
            </div>

            <button
              type="button"
              aria-label="Dismiss app download banner"
              onClick={dismissAppDownloadBanner}
              style={{
                border: '1px solid rgba(255,255,255,.18)',
                background: 'rgba(255,255,255,.06)',
                color: '#fff',
                borderRadius: 999,
                width: 32,
                height: 32,
                fontWeight: 900,
                flex: '0 0 auto',
              }}
            >
              ×
            </button>
          </div>

          <a
            href="https://apps.apple.com/us/app/dinkdraw/id6762402213"
            target="_blank"
            rel="noreferrer"
            className="button primary"
            style={{
              marginTop: 12,
              width: '100%',
            }}
          >
            Download on the App Store
          </a>
        </div>
      ) : null}

      <TopNav />

      <Suspense fallback={<JoinTournamentFallback />}>
        <JoinTournamentInner />
      </Suspense>
    </main>
  );
}