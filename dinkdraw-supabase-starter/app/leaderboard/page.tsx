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
type FormatFilter = 'all' | 'singles' | 'doubles';
type SortBy =
  | 'elo'
  | 'wins'
  | 'winPct'
  | 'pointDiff'
  | 'pointsFor'
  | 'matches'
  | 'name';

export default function LeaderboardPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [stats, setStats] = useState<EloStatRow[]>([]);
  const [profiles, setProfiles] = useState<EloProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('lifetime');
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('all');
  const [minMatches, setMinMatches] = useState(5);
  const [sortBy, setSortBy] = useState<SortBy>('elo');

  useEffect(() => {
    async function load() {
      setLoading(true);

      const { data: statsData, error: statsError } = await supabase
        .from('player_match_stats')
        .select('*');

      if (statsError) {
        setStats([]);
        setProfiles([]);
        setLoading(false);
        return;
      }

      const safeStats = (statsData || []) as EloStatRow[];
      setStats(safeStats);

      const userIds = Array.from(
        new Set(safeStats.map((row) => row.user_id).filter(Boolean))
      );

      if (userIds.length === 0) {
        setProfiles([]);
        setLoading(false);
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, display_name, email')
        .in('id', userIds);

      if (profileError) {
        setProfiles([]);
        setLoading(false);
        return;
      }

      setProfiles((profileData || []) as EloProfile[]);
      setLoading(false);
    }

    load();
  }, [supabase]);

  const filteredStats = useMemo(() => {
    let result = stats;

    const cutoff = getCutoffDate(timeFilter);
    if (cutoff) {
      result = result.filter((row) => new Date(row.played_at) >= cutoff);
    }

    if (formatFilter !== 'all') {
      result = result.filter((row) => row.format === formatFilter);
    }

    return result;
  }, [stats, timeFilter, formatFilter]);

  const leaderboard = useMemo(() => {
    const rows = buildLeaderboardRows(filteredStats, profiles, minMatches);

    return [...rows].sort((a, b) => {
      switch (sortBy) {
        case 'elo':
          return b.rating - a.rating;

        case 'wins':
          if (b.wins !== a.wins) return b.wins - a.wins;
          return b.rating - a.rating;

        case 'winPct':
          if (b.winPct !== a.winPct) return b.winPct - a.winPct;
          return b.rating - a.rating;

        case 'pointDiff':
          if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
          return b.rating - a.rating;

        case 'pointsFor':
          if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
          return b.rating - a.rating;

        case 'matches':
          if (b.matches !== a.matches) return b.matches - a.matches;
          return b.rating - a.rating;

        case 'name':
          return a.name.localeCompare(b.name);

        default:
          return b.rating - a.rating;
      }
    });
  }, [filteredStats, profiles, minMatches, sortBy]);

  const summary = useMemo(
    () => ({
      players: leaderboard.length,
      topRating: leaderboard[0]?.rating ?? 1000,
      topWinRate: leaderboard[0]?.winPct ?? 0,
    }),
    [leaderboard]
  );

  function formatFilterLabel(f: FormatFilter) {
    if (f === 'singles') return 'Singles';
    if (f === 'doubles') return 'Doubles';
    return 'All Formats';
  }

  function sortLabel(s: SortBy) {
    switch (s) {
      case 'elo':
        return 'ELO';
      case 'wins':
        return 'Wins';
      case 'winPct':
        return 'Win %';
      case 'pointDiff':
        return 'Point Differential';
      case 'pointsFor':
        return 'Points For';
      case 'matches':
        return 'Matches Played';
      case 'name':
        return 'Name';
      default:
        return 'ELO';
    }
  }

  return (
    <main className="page-shell">
      <div className="hero">
        <div className="hero-inner">
          <img src="/dinkdraw-logo.png" alt="DinkDraw logo" className="hero-logo" />
          <h1 className="hero-title">Leaderboard</h1>
          <p className="hero-subtitle">
            Live player rankings. Win matches, climb the board.
          </p>
        </div>
      </div>

      <TopNav />

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-title">Filters</div>
        <div className="grid">
          <div>
            <label className="label">Format</label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 8,
              }}
            >
              <FilterButton
                active={formatFilter === 'all'}
                label="All"
                onClick={() => setFormatFilter('all')}
              />
              <FilterButton
                active={formatFilter === 'doubles'}
                label="Doubles"
                onClick={() => setFormatFilter('doubles')}
              />
              <FilterButton
                active={formatFilter === 'singles'}
                label="Singles"
                onClick={() => setFormatFilter('singles')}
              />
            </div>
          </div>

          <div>
            <label className="label">Time Period</label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
                gap: 8,
              }}
            >
              <FilterButton
                active={timeFilter === 'lifetime'}
                label="All"
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

          <div>
            <label className="label">Sort By</label>
            <select
              className="input"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
            >
              <option value="elo">ELO</option>
              <option value="wins">Wins</option>
              <option value="winPct">Win %</option>
              <option value="pointDiff">Point Differential</option>
              <option value="pointsFor">Points For</option>
              <option value="matches">Matches Played</option>
              <option value="name">Name</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-title">Overview</div>
        <div className="two-col">
          <SimpleStatCard
            label="Format"
            value={formatFilterLabel(formatFilter)}
            sub="Current filter"
          />
          <SimpleStatCard
            label="Time Window"
            value={filterLabel(timeFilter)}
            sub="Current leaderboard"
          />
          <SimpleStatCard
            label="Ranked Players"
            value={summary.players}
            sub={`${minMatches}+ matches`}
          />
          <SimpleStatCard
            label="Top Rating"
            value={summary.topRating}
            sub="Current leader"
          />
          <SimpleStatCard
            label="Sorting"
            value={sortLabel(sortBy)}
            sub="Current order"
          />
          <SimpleStatCard
            label="Top Win Rate"
            value={`${summary.topWinRate}%`}
            sub="Current leader"
          />
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
            Try lowering the minimum matches filter, changing the format, or complete
            more matches.
          </div>
        </div>
      ) : (
        <div className="grid">
          {leaderboard.map((player, index) => {
            const place = index + 1;
            const medal =
              place === 1 ? '🥇' : place === 2 ? '🥈' : place === 3 ? '🥉' : null;
            const highlightStyle =
              place === 1
                ? {
                    borderColor: 'rgba(255,203,5,.6)',
                    boxShadow: '0 0 0 1px rgba(255,203,5,.35) inset',
                  }
                : place <= 3
                ? { borderColor: 'rgba(255,203,5,.35)' }
                : {};

            return (
              <div key={player.userId} className="card" style={highlightStyle}>
                <div
                  className="row-between"
                  style={{ marginBottom: 12, alignItems: 'flex-start' }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 20, lineHeight: 1.15 }}>
                      {medal ? `${medal} ` : ''}
                      {place}. {player.name}
                    </div>
                    <div className="muted" style={{ marginTop: 6 }}>
                      {player.matches} matches • {player.tournamentsPlayed} tournaments
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, fontSize: 24, lineHeight: 1 }}>
                      {player.rating}
                    </div>
                    <div className="muted" style={{ marginTop: 4 }}>Rating</div>
                  </div>
                </div>

                <div className="two-col" style={{ marginBottom: 12 }}>
                  <MiniStat
                    label="Record"
                    value={`${player.wins}-${player.losses}${
                      player.ties > 0 ? `-${player.ties}` : ''
                    }`}
                  />
                  <MiniStat label="Win Rate" value={`${player.winPct}%`} />
                  <MiniStat
                    label="Point Diff"
                    value={
                      player.pointDiff >= 0
                        ? `+${player.pointDiff}`
                        : player.pointDiff
                    }
                  />
                  <MiniStat
                    label="Points"
                    value={`${player.pointsFor}-${player.pointsAgainst}`}
                  />
                </div>

                <div className="list-item" style={{ padding: 12 }}>
                  <div className="row-between">
                    <span className="muted">Standing</span>
                    <strong>
                      {place === 1
                        ? 'Leader'
                        : place <= 3
                        ? 'Podium'
                        : place <= 10
                        ? 'Top 10'
                        : `#${place}`}
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
      style={{ minHeight: 44, fontWeight: 800 }}
    >
      {label}
    </button>
  );
}

function SimpleStatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub: string;
}) {
  return (
    <div className="list-item">
      <div className="muted" style={{ marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.05 }}>{value}</div>
      <div className="muted" style={{ marginTop: 6 }}>
        {sub}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="list-item" style={{ padding: 12 }}>
      <div className="muted" style={{ marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.05 }}>{value}</div>
    </div>
  );
}
