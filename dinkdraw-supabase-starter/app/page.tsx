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
            Round robin pickleball, built for real use at the courts.
          </p>
        </div>
      </div>

      <TopNav />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Start Here</div>
        <div className="card-subtitle">
          Create a tournament, join with a code, or jump back into your last event.
        </div>

        <div className="grid">
          {lastTournament ? (
            <Link href={`/tournament/${lastTournament.id}`}>
              <button className="action-button green">
                <div className="action-title">Resume Last Tournament</div>
                <div className="action-subtitle">
                  {lastTournament.title || 'Open your most recent tournament'}
                </div>
              </button>
            </Link>
          ) : null}

          <Link href="/tournament/create">
            <button className="action-button blue">
              <div className="action-title">Create Tournament</div>
              <div className="action-subtitle">
                Start a round robin and share the join code right away.
              </div>
            </button>
          </Link>

          <Link href="/tournament/join">
            <button className="action-button black">
              <div className="action-title">Join Tournament</div>
              <div className="action-subtitle">
                Enter a join code from any phone and claim your spot.
              </div>
            </button>
          </Link>
        </div>
      </div>

      {isLoadingUser ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="muted">Loading account...</div>
        </div>
      ) : userEmail ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Welcome Back</div>
          <div className="card-subtitle">Signed in as {userEmail}</div>

          <div className="grid">
            <Link href="/my-tournaments">
              <button className="action-button blue">
                <div className="action-title">My Tournaments</div>
                <div className="action-subtitle">
                  See tournaments you organized or joined.
                </div>
              </button>
            </Link>

            <Link href="/account">
              <button className="action-button black">
                <div className="action-title">Account</div>
                <div className="action-subtitle">
                  Manage your sign-in and profile details.
                </div>
              </button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Account</div>
          <div className="card-subtitle">
            Sign in to save tournaments, resume them later, and manage your profile.
          </div>

          <div className="grid">
            <Link href="/account">
              <button className="action-button blue">
                <div className="action-title">Create Account or Sign In</div>
                <div className="action-subtitle">
                  Use your account to keep your tournaments connected to you.
                </div>
              </button>
            </Link>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">What DinkDraw Does</div>
        <div className="grid">
          <div className="list-item">
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Fast setup</div>
            <div className="muted">
              Create a tournament in seconds and hand out one simple join code.
            </div>
          </div>

          <div className="list-item">
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Live rounds</div>
            <div className="muted">
              Run round-based matchups, enter scores, and keep players moving.
            </div>
          </div>

          <div className="list-item">
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Final results</div>
            <div className="muted">
              Lock standings when the tournament finishes, even if it ends early.
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}