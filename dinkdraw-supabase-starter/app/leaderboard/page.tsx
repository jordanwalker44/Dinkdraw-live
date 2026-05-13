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
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('doubles');
  const [minMatches, setMinMatches] = useState(5);
  const [sortBy, setSortBy] = useState<SortBy>('wins');
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

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
        
        case 'wins':
          if (b.wins !== a.wins) return b.wins - a.wins;
          return b.pointDiff - a.pointDiff;

        case 'winPct':
          if (b.winPct !== a.winPct) return b.winPct - a.winPct;
          return b.pointDiff - a.pointDiff;

        case 'pointDiff':
          if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
          return b.pointDiff - a.pointDiff;

        case 'pointsFor':
          if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
          return b.pointDiff - a.pointDiff;

        case 'matches':
          if (b.matches !== a.matches) return b.matches - a.matches;
          return b.pointDiff - a.pointDiff;

        case 'name':
          return a.name.localeCompare(b.name);

        default:
          return b.pointDiff - a.pointDiff;
      }
    });
  }, [filteredStats, profiles, minMatches, sortBy]);

  const summary = useMemo(
    () => ({
      players: leaderboard.length,
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
        return 'Raturn';
    }
  }

  function toggleExpanded(userId: string) {
    setExpandedUserId((prev) => (prev === userId ? null : userId));
  }

  return (
    <main className="page-shell">
      <div
  className="card soft-enter"
  style={{
    marginBottom: 14,
    padding: 18,
    background:
      'linear-gradient(180deg, rgba(255,203,5,0.12), rgba(255,255,255,0.025))',
    border: '1px solid rgba(255,203,5,0.18)',
    boxShadow:
      '0 1px 0 rgba(255,255,255,0.05) inset, 0 14px 34px rgba(0,0,0,0.24)',
  }}
>
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}>
    <div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 900,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: '#FFCB05',
          marginBottom: 8,
        }}
      >
        Rankings
      </div>

      <h1
        style={{
          margin: 0,
          fontSize: 28,
          fontWeight: 950,
          letterSpacing: '-0.04em',
        }}
      >
        Leaderboard
      </h1>

      <p className="muted" style={{ marginTop: 8 }}>
        See how players stack up based on performance and results.
      </p>
    </div>

    <div
      style={{
        width: 46,
        height: 46,
        borderRadius: 18,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(255,203,5,0.12)',
        border: '1px solid rgba(255,203,5,0.22)',
      }}
    >
      🏆
    </div>
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
            label="Top Win Rate"
            value={`${summary.topWinRate}%`}
            sub="Current leader"
          />
          <SimpleStatCard
            label="Sorting"
            value={sortLabel(sortBy)}
            sub="Current order"
          />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-title">Sort Leaderboard</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 8,
          }}
        >
          <SortButton
            active={sortBy === 'wins'}
            label="Wins"
            onClick={() => setSortBy('wins')}
          />
          <SortButton
            active={sortBy === 'winPct'}
            label="Win %"
            onClick={() => setSortBy('winPct')}
          />
          <SortButton
            active={sortBy === 'pointDiff'}
            label="Point Diff"
            onClick={() => setSortBy('pointDiff')}
          />
          <SortButton
            active={sortBy === 'pointsFor'}
            label="Points For"
            onClick={() => setSortBy('pointsFor')}
          />
          <SortButton
            active={sortBy === 'matches'}
            label="Matches"
            onClick={() => setSortBy('matches')}
          />
          <SortButton
            active={sortBy === 'name'}
            label="Name"
            onClick={() => setSortBy('name')}
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
        <div className="grid" style={{ gap: 10 }}>
          <div
            style={{
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 18,
              overflow: 'hidden',
              background: 'rgba(255,255,255,0.03)',
            }}
          >
           
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '40px minmax(0, 1fr) 70px 66px 58px',
                gap: 8,
                padding: '10px 12px',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.65)',
              }}
            >
              <div style={{ textAlign: 'center' }}>#</div>
              <div>Player</div>
              <div style={{ textAlign: 'center' }}>Win %</div>
              <div style={{ textAlign: 'center' }}>W-L</div>
              <div style={{ textAlign: 'center' }}>Diff</div>
            </div>

            {leaderboard.map((player, index) => {
              const place = index + 1;
              const medal =
                place === 1 ? '🥇' : place === 2 ? '🥈' : place === 3 ? '🥉' : null;
              const isExpanded = expandedUserId === player.userId;

              const rowBackground =
  place === 1
    ? 'linear-gradient(90deg, rgba(255,203,5,0.18), rgba(255,203,5,0.05))'
    : place === 2
    ? 'linear-gradient(90deg, rgba(255,255,255,0.12), rgba(255,255,255,0.03))'
    : place === 3
    ? 'linear-gradient(90deg, rgba(255,140,0,0.18), rgba(255,140,0,0.05))'
    : 'transparent';

              return (
                              <div
                  key={player.userId}
                  style={{
                    borderBottom:
                      index === leaderboard.length - 1
                        ? 'none'
                        : '1px solid rgba(255,255,255,0.08)',
                    background: rowBackground,
                    borderLeft:
                      place === 1
                        ? '3px solid #FFCB05'
                        : place === 2
                        ? '3px solid rgba(255,255,255,0.6)'
                        : place === 3
                        ? '3px solid rgba(255,140,0,0.7)'
                        : '3px solid transparent',
                  }}
                >
                                <button
                    type="button"
                    onClick={() => toggleExpanded(player.userId)}
                    style={{
                      width: '100%',
                      border: 'none',
                      background: 'transparent',
                      color: 'inherit',
                      cursor: 'pointer',
                      padding: '12px 12px',
                      display: 'grid',
                      gridTemplateColumns: '40px minmax(0, 1fr) 70px 66px 58px',
                      gap: 8,
                      alignItems: 'center',
                      textAlign: 'left',
transition: 'background 0.15s ease',
                    }}
                  >
                    <div
                      style={{
                        textAlign: 'center',
                        fontWeight: 900,
                        fontSize: 18,
                        color: place <= 3 ? '#FFCB05' : 'rgba(255,255,255,0.92)',
                      }}
                    >
                      {medal ? medal : place}
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 800,
                          fontSize: 16,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {player.name}
                      </div>
                    </div>

                    <div
                      style={{
                        textAlign: 'center',
                        fontWeight: 900,
                        fontSize: 20,
                      }}
                    >
                      {player.winPct}%
                    </div>

                    <div
                      style={{
                        textAlign: 'center',
                        fontWeight: 800,
                        fontSize: 14,
                        opacity: 0.8,
                      }}
                    >
                      {player.wins}-{player.losses}
                      {player.ties > 0 ? `-${player.ties}` : ''}
                    </div>

                    <div
                      style={{
                        textAlign: 'center',
                        fontWeight: 900,
                        fontSize: 18,
                        color: player.pointDiff > 0 ? '#FFCB05' : 'rgba(255,255,255,0.92)',
                      }}
                    >
                      {player.pointDiff > 0 ? `+${player.pointDiff}` : player.pointDiff}
                    </div>
                  </button>

                  {isExpanded ? (
                    <div style={{ padding: '0 12px 14px 12px' }}>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                          gap: 10,
                          marginTop: 4,
                        }}
                      >
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

                                          <div className="list-item" style={{ padding: 12, marginTop: 10 }}>
                        <div className="row-between" style={{ marginBottom: 8 }}>
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

                        <div className="row-between">
                          <span className="muted">Volume</span>
                          <strong>
                            {player.matches} matches • {player.tournamentsPlayed} tournaments
                          </strong>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
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

function SortButton({
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
