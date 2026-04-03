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
  const [isLoadingUser, setIsLoadingUser] = useState(true);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LAST_TOURNAMENT_KEY);
      if (saved) {
        setLastTournament(JSON.parse(saved));
      }
    } catch {}

    async function loadUser() {
      setIsLoadingUser(true);
      const { data } = await supabase.auth.getUser();
      setUserEmail(data.user?.email ?? '');
      setIsLoadingUser(false);
    }

    loadUser();
  }, [supabase]);

  return (
    <main className="page-shell">
      <div className="hero">
        <div className="hero-inner">
          <img src="/dinkdraw-logo.png" alt="DinkDraw logo" className="hero-logo" />
          <h1 className="hero-title">DinkDraw</h1>
          <p className="hero-subtitle">
            Run round robin pickleball without the clipboard chaos.
          </p>
        </div>
      </div>

      <TopNav />

      {lastTournament ? (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-title">Resume</div>
          <div className="card-subtitle">
            Pick up where you left off.
          </div>

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

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-title">Start a Tournament</div>
        <div className="card-subtitle">
          Create a new event or join one with a code.
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
                Enter a code and claim your spot from any phone.
              </div>
            </button>
          </Link>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-title">Your DinkDraw</div>

        {isLoadingUser ? (
          <div className="muted">Loading account...</div>
        ) : userEmail ? (
          <>
            <div className="card-subtitle">Signed in as {userEmail}</div>

            <div className="grid">
              <Link href="/my-tournaments">
                <button className="button secondary">My Tournaments</button>
              </Link>

              <Link href="/my-stats">
                <button className="button secondary">My Stats</button>
              </Link>

              <Link href="/leaderboard">
                <button className="button secondary">Leaderboard</button>
              </Link>

              <Link href="/account">
                <button className="button secondary">Account</button>
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="card-subtitle">
              Sign in to track stats, save tournaments, and climb the leaderboard.
            </div>

            <Link href="/account">
              <button className="button primary">Sign In or Create Account</button>
            </Link>
          </>
        )}
      </div>

      <div className="card">
        <div className="card-title">Why People Use It</div>
        <div className="grid">
          <div className="list-item">
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Fast setup</div>
            <div className="muted">
              Create a tournament and start filling spots in seconds.
            </div>
          </div>

          <div className="list-item">
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Live rounds</div>
            <div className="muted">
              Keep courts moving with score entry and automatic round flow.
            </div>
          </div>

          <div className="list-item">
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Player stats</div>
            <div className="muted">
              Logged-in players can track Elo, results, streaks, and rankings.
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
