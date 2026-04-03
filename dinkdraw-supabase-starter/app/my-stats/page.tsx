'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../../lib/supabase-browser';
import { TopNav } from '../../components/TopNav';

type StatRow = {
  id: string;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
  played_at: string;
  tournament_id: string;
};

type TimeFilter = 'lifetime' | '12m' | '6m' | '30d' | '7d';

function getCutoffDate(filter: TimeFilter) {
  if (filter === 'lifetime') return null;

  const now = new Date();

  if (filter === '12m') {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 12);
    return d;
  }

  if (filter === '6m') {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 6);
    return d;
  }

  if (filter === '30d') {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    return d;
  }

  const d = new Date(now);
  d.setDate(d.getDate() - 7);
  return d;
}

function filterLabel(filter: TimeFilter) {
  if (filter === 'lifetime') return 'Lifetime';
  if (filter === '12m') return 'Last 12 Months';
  if (filter === '6m') return 'Last 6 Months';
  if (filter === '30d') return 'Last 30 Days';
  return 'Last 7 Days';
}

export default function MyStatsPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [userId, setUserId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [stats, setStats] = useState<StatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('lifetime');

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
        .eq('user_id', user.id)
        .order('played_at', { ascending: false });

      setStats(statRows || []);
      setLoading(false);
    }

    load();
  }, [supabase]);

  const filteredStats = useMemo(() => {
    const cutoff = getCutoffDate(timeFilter);
    if (!cutoff) return stats;

    return stats.filter((row) => {
      const playedAt = new Date(row.played_at);
      return playedAt >= cutoff;
    });
  }, [stats, timeFilter]);

  const aggregates = useMemo(() => {
    let wins = 0;
    let losses = 0;
    let ties = 0;
    let pointsFor = 0;
    let pointsAgainst = 0;

    const tournamentIds = new Set<string>();

    for (const s of filteredStats) {
      wins += s.wins;
      losses += s.losses;
      ties += s.ties;
      pointsFor += s.points_for;
      pointsAgainst += s.points_against;
      if (s.tournament_id) tournamentIds.add(s.tournament_id);
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
      tournamentsPlayed: tournamentIds.size,
    };
  }, [filteredStats]);

  const initials = useMemo(() => {
    if (!displayName) return 'DD';
    const parts = displayName.trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase() || '').join('') || 'DD';
  }, [displayName]);

  if (!userId && !loading) {
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
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: '#134e4a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: 22,
            }}
          >
            {initials}
          </div>

          <div>
            <div style={{ fontSize: 26, fontWeight: 800 }}>{displayName}</div>
            <div className="muted">{filterLabel(timeFilter)}</div>
          </div>
        </div>
      </div>

      <div
        className="card"
        style={{
          marginBottom: 16,
          padding: 12,
        }}
      >
        <div className="card-title" style={{ marginBottom: 12 }}>
          Time Filter
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
            gap: 8,
          }}
        >
          <FilterButton
            active={timeFilter === 'lifetime'}
            label="Lifetime"
            onClick={() => setTimeFilter('lifetime')}
          />
          <FilterButton
            active={timeFilter === '12m'}
            label="12M"
            onClick={() => setTimeFilter('12m')}
          />
          <FilterButton
            active={timeFilter === '6m'}
            label="6M"
            onClick={() => setTimeFilter('6m')}
          />
          <FilterButton
            active={timeFilter === '30d'}
            label="30D"
            onClick={() => setTimeFilter('30d')}
          />
          <FilterButton
            active={timeFilter === '7d'}
            label="7D"
            onClick={() => setTimeFilter('7d')}
          />
        </div>
      </div>

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

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Summary</div>

        {loading ? (
          <div className="muted">Loading stats...</div>
        ) : (
          <div className="grid">
            <Row label="Tournaments Played" value={aggregates.tournamentsPlayed} />
            <Row label="Matches Played" value={aggregates.matches} />
            <Row label="Wins" value={aggregates.wins} />
            <Row label="Losses" value={aggregates.losses} />
            <Row label="Ties" value={aggregates.ties} />
            <Row label="Points For" value={aggregates.pointsFor} />
            <Row label="Points Against" value={aggregates.pointsAgainst} />
            <Row label="Point Differential" value={aggregates.pointDiff} />
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Recent Matches</div>

        {loading ? (
          <div className="muted">Loading recent matches...</div>
        ) : !filteredStats.length ? (
          <div className="muted">No matches in this time range yet.</div>
        ) : (
          <div className="grid">
            {filteredStats.slice(0, 5).map((match) => (
              <div key={match.id} className="list-item">
                <div className="row-between">
                  <div>
                    <div style={{ fontWeight: 700 }}>
                      {match.wins === 1 ? 'Win' : match.losses === 1 ? 'Loss' : 'Tie'}
                    </div>
                    <div className="muted">
                      {new Date(match.played_at).toLocaleDateString()}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700 }}>
                      {match.points_for}-{match.points_against}
                    </div>
                    <div className="muted">
                      {match.points_for - match.points_against >= 0
                        ? `+${match.points_for - match.points_against}`
                        : match.points_for - match.points_against}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function FilterButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`button ${active ? 'primary' : 'secondary'}`}
      onClick={onClick}
      style={{
        minHeight: 44,
        fontWeight: 700,
      }}
    >
      {label}
    </button>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub: string;
}) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="muted">{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800 }}>{value}</div>
      <div className="muted">{sub}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="row-between">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
