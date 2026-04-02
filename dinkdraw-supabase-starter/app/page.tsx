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

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LAST_TOURNAMENT_KEY);
      if (saved) {
        setLastTournament(JSON.parse(saved));
      }
    } catch {}

    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      setUserEmail(data.user?.email ?? '');
    }

    loadUser();
  }, []);

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

      {userEmail ? (
        <div className="card">
          <div className="card-title">Welcome back</div>
          <div className="card-subtitle">Signed in as {userEmail}</div>

          <div className="grid">
            {lastTournament ? (
              <Link href={`/tournament/${lastTournament.id}`}>
                <button className="action-button green">
                  <div className="action-title">Resume last tournament</div>
                  <div className="action-subtitle">{lastTournament.title || 'Open your most recent tournament'}</div>
                </button>
              </Link>
            ) : null}

            <Link href="/my-tournaments">
              <button className="action-button blue">
                <div className="action-title">My Tournaments</div>
                <div className="action-subtitle">See tournaments you organized or joined.</div>
              </button>
            </Link>
          </div>
        </div>
      ) : null}

      <div className="grid">
        <Link href="/account">
          <button className="action-button blue">
            <div className="action-title">Create an account</div>
            <div className="action-subtitle">Sign up or sign in with Supabase.</div>
          </button>
        </Link>

        <Link href="/tournament/create">
          <button className="action-button green">
            <div className="action-title">Create a Round Robin Tournament</div>
            <div className="action-subtitle">Start a tournament and share the join code right away.</div>
          </button>
        </Link>

        <Link href="/tournament/join">
          <button className="action-button black">
            <div className="action-title">Join a Round Robin Tournament</div>
            <div className="action-subtitle">Enter a join code from any phone.</div>
          </button>
        </Link>
      </div>
    </main>
  );
}
