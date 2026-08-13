'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { TopNav } from '../components/TopNav';
import { getSupabaseBrowserClient } from '../lib/supabase-browser';
import {
  RECENT_COMPLETED_TOURNAMENT_DAYS,
  type RecentTournament,
  readRecentTournament,
  saveRecentTournament,
} from '../lib/recent-tournament';

type TournamentShortcutRow = RecentTournament & {
  organizer_user_id: string;
  created_at: string;
  updated_at: string | null;
};

export default function HomePage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [lastTournament, setLastTournament] = useState<RecentTournament | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isLoadingUser, setIsLoadingUser] = useState(true);

  useEffect(() => {
    setLastTournament(readRecentTournament());

    async function loadUser() {
      setIsLoadingUser(true);

      // Use getSession for instant localStorage read
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      setUserEmail(user?.email ?? '');

      if (user) {
        const [{ data: profile }, { data: joinedSlots }] = await Promise.all([
          supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
          supabase.from('tournament_players').select('tournament_id').eq('claimed_by_user_id', user.id),
        ]);
        setDisplayName(profile?.display_name || user.email?.split('@')[0] || '');

        const joinedIds = (joinedSlots || []).map((slot) => slot.tournament_id);
        let tournamentQuery = supabase
          .from('tournaments')
          .select('id, title, status, organizer_user_id, created_at, updated_at');

        tournamentQuery = joinedIds.length
          ? tournamentQuery.or(`organizer_user_id.eq.${user.id},id.in.(${joinedIds.join(',')})`)
          : tournamentQuery.eq('organizer_user_id', user.id);

        const { data: tournamentRows, error: tournamentError } = await tournamentQuery.order(
          'updated_at',
          { ascending: false }
        );
        if (tournamentError) {
          setIsLoadingUser(false);
          return;
        }
        const rows = (tournamentRows || []) as TournamentShortcutRow[];
        const active = rows.find((row) => row.status !== 'completed');
        const recentCutoff = Date.now() - RECENT_COMPLETED_TOURNAMENT_DAYS * 24 * 60 * 60 * 1000;
        const recentCompleted = rows.find(
          (row) => row.status === 'completed' && new Date(row.updated_at || row.created_at).getTime() >= recentCutoff
        );
        const shortcut = active || recentCompleted || null;

        if (shortcut) {
          saveRecentTournament(shortcut);
          setLastTournament(readRecentTournament());
        } else {
          setLastTournament(null);
        }
      }

      setIsLoadingUser(false);
    }

    loadUser();
  }, [supabase]);

    return (
    <main className="page-shell">

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

      {/* Start here */}
<div className="card" style={{ marginBottom: 14 }}>
  <div className="card-title" style={{ color: '#FFCB05' }}>Start Here</div>
  <div className="card-subtitle">
      Create a tournament, join one with a code, or jump back into your latest event.
  </div>

  <div className="grid">
    {userEmail && lastTournament ? (
  <Link href={`/tournament/${lastTournament.id}`}>
    <button
  className="action-button black"
  style={{
    border: '1px solid rgba(255, 203, 5, 0.35)',
    background: 'linear-gradient(180deg, rgba(255,203,5,0.10), rgba(255,255,255,0.035))',
    textAlign: 'center',
  }}
>
      <div className="action-title" style={{ marginBottom: 6 }}>
        {lastTournament.status === 'completed' ? 'Most Recent Tournament' : 'Current Tournament'}
      </div>
      <div
  className="action-subtitle"
  style={{
    opacity: 0.75,
    maxWidth: 220,
    margin: '0 auto',
  }}
>
        {lastTournament.title || 'Open your most recent tournament'}
      </div>
    </button>
  </Link>
) : null}

    <Link href="/tournament/create">
      <button
  className="action-button green"
  style={{
    transform: 'scale(1.02)',
    boxShadow: '0 12px 28px rgba(255, 203, 5, 0.25)',
    textAlign: 'center',
  }}
>
        <div className="action-title" style={{ marginBottom: 6 }}>Create Tournament</div>
        <div
  className="action-subtitle"
  style={{
    opacity: 0.75,
    maxWidth: 220,
    margin: '0 auto',
  }}
>
          Set up players, courts, rounds, and share the join code.
        </div>
      </button>
    </Link>

    <Link href="/tournament/join">
      <button
  className="action-button black"
  style={{
    textAlign: 'center',
  }}
>
        <div className="action-title" style={{ marginBottom: 6 }}>Join Tournament</div>
        <div
  className="action-subtitle"
  style={{
    opacity: 0.75,
    maxWidth: 220,
    margin: '0 auto',
  }}
>
          Enter a 6-letter code from the organizer to claim your spot.
        </div>
      </button>
    </Link>
  </div>
</div>

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
