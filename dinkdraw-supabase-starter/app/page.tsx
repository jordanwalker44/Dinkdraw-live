'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { TopNav } from '../components/TopNav';
import { getSupabaseBrowserClient } from '../lib/supabase-browser';

type LastTournament = {
  id: string;
  title: string;
};

const LAST_TOURNAMENT_KEY = 'dinkdraw_last_tournament';

export default function HomePage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [lastTournament, setLastTournament] = useState<LastTournament | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isLoadingUser, setIsLoadingUser] = useState(true);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LAST_TOURNAMENT_KEY);
      if (saved) setLastTournament(JSON.parse(saved));
    } catch {}

    async function loadUser() {
      setIsLoadingUser(true);

      // Use getSession for instant localStorage read
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      setUserEmail(user?.email ?? '');

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', user.id)
          .maybeSingle();
        setDisplayName(profile?.display_name || user.email?.split('@')[0] || '');
      }

      setIsLoadingUser(false);
    }

    loadUser();
  }, [supabase]);

  return (
  <main className="page-shell" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
    <div
      className="hero"
      style={{
        marginTop: 10,
        padding: '12px 16px 4px 16px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        minHeight: 210,
      }}
    >
      <div
        className="hero-inner"
        style={{
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <img
          src="/dinkdraw-logo.png"
          alt="DinkDraw logo"
          className="hero-logo"
          style={{
  width: '100%',
  maxWidth: 340,
  height: 'auto',
  marginBottom: 4,
}}
        />

        <p className="hero-subtitle">
          Create tournaments, track scores, and share live results
        </p>

        {/* Greeting — only shows when signed in */}
        {!isLoadingUser && userEmail ? (
          <div
  style={{
    marginTop: 8,
    marginBottom: 6,
    color: '#FFCB05',
    fontWeight: 800,
    fontSize: 15,
  }}
>
            Hey, {displayName || userEmail}! 👋
          </div>
        ) : null}
      </div>
    </div>

      <TopNav />

{!isLoadingUser && !userEmail ? (
  <div className="card" style={{ marginBottom: 14, textAlign: 'center' }}>
    <div className="card-title">Get more out of DinkDraw</div>
    <div className="card-subtitle" style={{ marginBottom: 12 }}>
      Sign in to track your stats, rating, and tournament history.
    </div>
    <Link
      href="/account"
      className="button primary"
      style={{
        width: 'fit-content',
        display: 'block',
        margin: '0 auto',
        padding: '10px 24px',
        borderRadius: 999,
      }}
    >
      Sign In or Create Account
    </Link>
  </div>
) : null}

      {/* Resume last tournament */}
      {lastTournament ? (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-title">Resume</div>
          <div className="card-subtitle">Pick up where you left off.</div>
          <Link href={`/tournament/${lastTournament.id}`}>
            <button className="action-button green">
              <div className="action-title">Resume Last Tournament</div>
              <div className="action-subtitle">
                {lastTournament.title || 'Open your most recent tournament'}
              </div>
            </button>
          </Link>
        </div>
      ) : null}

      {/* Main actions */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-title" style={{ color: '#FFCB05' }}>Start a Tournament</div>
        <div className="card-subtitle">
          Running an event? Create one and share the join code. Playing? Enter a code to join.
        </div>
        <div className="grid">
          <Link href="/tournament/create">
            <button className="action-button green">
              <div className="action-title">Create Tournament</div>
              <div className="action-subtitle">
                Set up players, courts, rounds, and share the join code.
              </div>
            </button>
          </Link>
          <Link href="/tournament/join">
            <button className="action-button black">
              <div className="action-title">Join Tournament</div>
              <div className="action-subtitle">
                Enter a 6-letter code from the organizer to claim your spot.
              </div>
            </button>
          </Link>
        </div>
      </div>

      {/* Signed in state */}
      {!isLoadingUser && userEmail ? (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-title" style={{ color: '#FFCB05' }}>Your DinkDraw</div>
          <div className="card-subtitle">Everything connected to your account.</div>
          <div className="grid">
            <Link href="/my-tournaments">
              <button className="button secondary" style={{ textAlign: 'left' }}>
  <div className="action-title">My Tournaments</div>
</button>
            </Link>
            <Link href="/my-stats">
              <button className="button secondary" style={{ textAlign: 'left' }}>
  <div className="action-title">My Stats</div>
</button>
            </Link>
            <Link href="/leaderboard">
              <button className="button secondary" style={{ textAlign: 'left' }}>
  <div className="action-title">Leaderboard</div>
</button>
            </Link>
            <Link href="/account">
              <button className="button secondary" style={{ textAlign: 'left' }}>
  <div className="action-title">Account</div>
</button>
            </Link>
          </div>
        </div>
      ) : null}

      {/* Signed out — new here card */}
{!isLoadingUser && !userEmail ? null : null}

      {/* How it works */}
      <div className="card">
        <div className="card-title" style={{ color: '#FFCB05' }}>How it works</div>
        <div className="grid">
          <div className="list-item">
            <div style={{ fontWeight: 800, marginBottom: 4 }}>1. Create a tournament</div>
            <div className="muted">
              Set your player count, courts, and rounds. A join code is generated automatically.
            </div>
          </div>
          <div className="list-item">
            <div style={{ fontWeight: 800, marginBottom: 4 }}>2. Players join with the code</div>
            <div className="muted">
              Share the 6-letter code at the courts. Players tap Join, enter the code, and claim their spot.
            </div>
          </div>
          <div className="list-item">
            <div style={{ fontWeight: 800, marginBottom: 4 }}>3. Play and submit scores</div>
            <div className="muted">
              The schedule is generated automatically. Enter scores after each match and standings update live.
            </div>
          </div>
          <div className="list-item">
            <div style={{ fontWeight: 800, marginBottom: 4 }}>4. Track your stats</div>
            <div className="muted">
              Signed-in players build a rating, win streak, and tournament history across every event.
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
