'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../../lib/supabase-browser';
import { TopNav } from '../../components/TopNav';

type StatRow = {
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
};

export default function MyStatsPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [userId, setUserId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [stats, setStats] = useState<StatRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;

      if (!user) {
        setLoading(false);
        return;
      }

      setUserId(user.id);

      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .maybeSingle();

      setDisplayName(profile?.display_name || user.email || 'Player');

      const { data: statRows } = await supabase
        .from('player_match_stats')
        .select('*')
        .eq('user_id', user.id);

      setStats(statRows || []);
      setLoading(false);
    }

    load();
  }, [supabase]);

  // ---- AGGREGATES ----

  const aggregates = useMemo(() => {
    let wins = 0;
    let losses = 0;
    let ties = 0;
    let pointsFor = 0;
    let pointsAgainst = 0;

    for (const s of stats) {
      wins += s.wins;
      losses += s.losses;
      ties += s.ties;
      pointsFor += s.points_for;
      pointsAgainst += s.points_against;
    }

    const matches = wins + losses + ties;
    const winPct = matches ? Math.round((wins / matches) * 100) : 0;
    const pointDiff = pointsFor - pointsAgainst;
    const avgPoints = matches ? Math.round(pointsFor / matches) : 0;

    return {
      wins,
      losses,
      ties,
      matches,
      winPct,
      pointsFor,
      pointsAgainst,
      pointDiff,
      avgPoints,
    };
  }, [stats]);

  if (!userId) {
    return (
      <main className="page-shell">
        <TopNav />
        <div className="card">
          <div className="card-title">My Stats</div>
          <div className="muted">Sign in to view your stats.</div>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <TopNav />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: '50%',
              background: '#134e4a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: 22,
            }}
          >
            {displayName.slice(0, 2).toUpperCase()}
          </div>

          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{displayName}</div>
            <div className="muted">DinkDraw Player</div>
          </div>
        </div>
      </div>

      {/* STAT GRID */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <StatCard label="W/L" value={`${aggregates.winPct}%`} sub={`${aggregates.matches} matches`} />
        <StatCard label="Points" value={aggregates.pointsFor} sub={`Avg ${aggregates.avgPoints}/match`} />
        <StatCard label="Wins" value={aggregates.wins} sub={`${aggregates.losses} losses`} />
        <StatCard label="Point Diff" value={aggregates.pointDiff} sub="Total" />
      </div>

      {/* DETAIL CARD */}
      <div className="card">
        <div className="card-title">Performance</div>

        {loading ? (
          <div className="muted">Loading stats...</div>
        ) : (
          <div className="grid">
            <Row label="Matches Played" value={aggregates.matches} />
            <Row label="Wins" value={aggregates.wins} />
            <Row label="Losses" value={aggregates.losses} />
            <Row label="Points For" value={aggregates.pointsFor} />
            <Row label="Points Against" value={aggregates.pointsAgainst} />
            <Row label="Point Differential" value={aggregates.pointDiff} />
          </div>
        )}
      </div>
    </main>
  );
}

function StatCard({ label, value, sub }: { label: string; value: any; sub: string }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="muted">{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800 }}>{value}</div>
      <div className="muted">{sub}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="row-between">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
