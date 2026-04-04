'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../../lib/supabase-browser';
import { TopNav } from '../../components/TopNav';
import {
  buildLeaderboardRows,
  getCutoffDate,
  filterLabel,
  type EloStatRow,
  type EloProfile,
} from '../../lib/elo';

type TimeFilter = 'lifetime' | '12m' | '6m' | '30d' | '7d';

export default function LeaderboardPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [stats, setStats] = useState<EloStatRow[]>([]);
  const [profiles, setProfiles] = useState<EloProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('lifetime');
  const [minMatches, setMinMatches] = useState(5);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const { data: statsData, error: statsError } = await supabase
        .from('player_match_stats')
        .select('*')
        .order('played_at', { ascending: true });

      if (statsError) {
        setStats([]);
        setProfiles([]);
        setLoading(false);
        return;
      }

      const rows = (statsData || []) as EloStatRow[];
      setStats(rows);

      const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));

      if (!userIds.length) {
        setProfiles([]);
        setLoading(false);
        return;
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, display_name, email')
        .in('id', userIds);

      setProfiles((profileData || []) as EloProfile[]);
      setLoading(false);
    }

    load();
  }, [supabase]);

  const filteredStats = useMemo(() => {
    const cutoff = getCutoffDate(timeFilter);
    if (!cutoff) return stats;
    return stats.filter((row) => new Date(row.played_at) >= cutoff);
  }, [stats, timeFilter]);

  const leaderboard = useMemo(
    () => buildLeaderboardRows(filteredStats, profiles, minMatches),
    [filteredStats, profiles, minMatches]
  );

  const summary = useMemo(() => ({
    players: leaderboard.length,
    topRating: leaderboard[0]?.rating ?? 1000,
    topWinRate: leaderboard[0]?.winPct ?? 0,
  }), [leaderboard]);

  return (
    <main className="page-shell">
      <div className="hero">
        <div className="hero-inner">
          <img src="/dinkdraw-logo.png" alt="DinkDraw logo" className="hero-logo" />
          <h1 className="hero-title">Leaderboard</h1>
          <p className="hero-subtitle">
            Live player rankings powered by match-by-match Elo.
          </p>
        </div>
      </div>

      <TopNav />

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-title">Filters</div>
        <div className="grid">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 8 }}>
            <FilterButton active={timeFilter === 'lifetime'} label="All" onClick={() => setTimeFilter('lifetime')} />
            <FilterButton active={timeFilter === '12m'} label="12M" onClick={() => setTimeFilter('12m')} />
            <FilterButton active={timeFilter === '6m'} label="6M" onClick={() => setTimeFilter('6m')} />
            <FilterButton active={timeFilter === '30d'} label="30D" onClick={() => setTimeFilter('30d')} />
            <FilterButton active={timeFilter === '7d'} label="7D" onClick={() => setTimeFilter('7d')} />
          </div>

          <div>
            <label className="label">Minimum Matches</label>
            <select
              className="input"
              value={minMatches}
              onChange={(e) => setMinMatches(Number(e.target.value))}
            >
              <option value={1}>1+</option>
              <option value={3}>3+</option>
              <option value={5}>5+</option>
              <option value={10}>10+</option>
              <option value={20}>20+</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-title">Overview</div>
        <div className="two-col">
          <SimpleStatCard label="Time Window" value={filterLabel(timeFilter)} sub="Current leaderboard" />
          <SimpleStatCard label="Ranked Players" value={summary.players} sub={`${minMatches}+ matches`} />
          <SimpleStatCard label="Top Elo" value={summary.topRating} sub="Current leader" />
          <SimpleStatCard label="Top Win Rate" value={`${summary.topWinRate}%`} sub="Current leader" />
        </div>
      </div>

      {loading ? (
        <div className="card">
          <div className="muted">Loading leaderboard...</div>
        </div>
      ) : !leaderboard.length ? (
        <div className="card">
          <div className="card-title">No Ranked Players Yet</div>
          <div className="card-subtitle">
            Try lowering the minimum matches filter or complete more matches.
          </div>
        </div>
      ) : (
        <div className="grid">
          {leaderboard.map((player, index) => {
            const place = index + 1;
            const medal = place === 1 ? '🥇' : place === 2 ? '🥈' : place === 3 ? '🥉' : null;
            const highlightStyle =
              place === 1
                ? { borderColor: 'rgba(250,204,21,.6)', boxShadow: '0 0 0 1px rgba(250,204,21,.35) inset' }
                : place <= 3
                ? { borderColor: 'rgba(163,230,53,.35)' }
                : {};

            return (
              <div key={player.userId} className="card" style={highlightStyle}>
                <div className="row-between" style={{ marginBottom: 12, alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 20, lineHeight: 1.15 }}>
                      {medal ? `${medal} ` : ''}{place}. {player.name}
                    </div>
                    <div className="muted" style={{ marginTop: 6 }}>
                      {player.matches} matches • {player.tournamentsPlayed} tournaments
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, fontSize: 24, lineHeight: 1 }}>{player.rating}</div>
                    <div className="muted" style={{ marginTop: 4 }}>Elo</div>
                  </div>
                </div>

                <div className="two-col" style={{ marginBottom: 12 }}>
                  <MiniStat label="Record" value={`${player.wins}-${player.losses}${player.ties > 0 ? `-${player.ties}` : ''}`} />
                  <MiniStat label="Win Rate" value={`${player.winPct}%`} />
                  <MiniStat label="Point Diff" value={player.pointDiff >= 0 ? `+${player.pointDiff}` : player.pointDiff} />
                  <MiniStat label="Points" value={`${player.pointsFor}-${player.pointsAgainst}`} />
                </div>

                <div className="list-item" style={{ padding: 12 }}>
                  <div className="row-between">
                    <span className="muted">Standing</span>
                    <strong>
                      {place === 1 ? 'Leader' : place <= 3 ? 'Podium' : place <= 10 ? 'Top 10' : `#${place}`}
                    </strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

function FilterButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`button ${active ? 'primary' : 'secondary'}`}
      onClick={onClick}
      style={{ minHeight: 44, fontWeight: 800 }}
    >
      {label}
    </button>
  );
}

function SimpleStatCard({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div className="list-item">
      <div className="muted" style={{ marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.05 }}>{value}</div>
      <div className="muted" style={{ marginTop: 6 }}>{sub}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="list-item" style={{ padding: 12 }}>
      <div className="muted" style={{ marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.05 }}>{value}</div>
    </div>
  );
}
