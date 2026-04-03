'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../../lib/supabase-browser';
import { TopNav } from '../../components/TopNav';

type PlayerMatchStat = {
  id: string;
  user_id: string;
  match_id: string;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
  played_at: string;
  tournament_id: string;
  partner_user_id: string | null;
  opponent_1_user_id: string | null;
  opponent_2_user_id: string | null;
};

type Profile = {
  id: string;
  display_name: string | null;
  email: string | null;
};

type TimeFilter = 'lifetime' | '12m' | '6m' | '30d' | '7d';

type LeaderboardRow = {
  userId: string;
  name: string;
  matches: number;
  wins: number;
  losses: number;
  ties: number;
  winPct: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
  tournamentsPlayed: number;
  rating: number;
};

type EloMatchGroup = {
  matchId: string;
  playedAt: string;
  rows: PlayerMatchStat[];
};

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

function expectedScore(ratingA: number, ratingB: number) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function resultScore(result: 'win' | 'loss' | 'tie') {
  if (result === 'win') return 1;
  if (result === 'loss') return 0;
  return 0.5;
}

function getKFactor(matchCount: number) {
  if (matchCount < 10) return 32;
  if (matchCount < 30) return 24;
  return 16;
}

export default function LeaderboardPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [stats, setStats] = useState<PlayerMatchStat[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
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

      const rows = (statsData || []) as PlayerMatchStat[];
      setStats(rows);

      const userIds = Array.from(new Set(rows.map((row) => row.user_id).filter(Boolean)));

      if (!userIds.length) {
        setProfiles([]);
        setLoading(false);
        return;
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, display_name, email')
        .in('id', userIds);

      setProfiles((profileData || []) as Profile[]);
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

  const leaderboard = useMemo<LeaderboardRow[]>(() => {
    const profilesById = new Map(profiles.map((p) => [p.id, p]));

    const groupedMatches = new Map<string, EloMatchGroup>();
    for (const row of filteredStats) {
      if (!groupedMatches.has(row.match_id)) {
        groupedMatches.set(row.match_id, {
          matchId: row.match_id,
          playedAt: row.played_at,
          rows: [],
        });
      }
      groupedMatches.get(row.match_id)!.rows.push(row);
    }

    const chronologicalMatches = Array.from(groupedMatches.values()).sort(
      (a, b) => new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime()
    );

    const ratings = new Map<string, number>();
    const matchCounts = new Map<string, number>();

    const totals = new Map<
      string,
      {
        userId: string;
        matches: number;
        wins: number;
        losses: number;
        ties: number;
        pointsFor: number;
        pointsAgainst: number;
        tournaments: Set<string>;
      }
    >();

    function getRating(userId: string) {
      return ratings.get(userId) ?? 1000;
    }

    function getMatchesPlayed(userId: string) {
      return matchCounts.get(userId) ?? 0;
    }

    function bumpMatchCount(userId: string) {
      matchCounts.set(userId, getMatchesPlayed(userId) + 1);
    }

    function ensureTotals(userId: string) {
      if (!totals.has(userId)) {
        totals.set(userId, {
          userId,
          matches: 0,
          wins: 0,
          losses: 0,
          ties: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          tournaments: new Set<string>(),
        });
      }
      return totals.get(userId)!;
    }

    for (const row of filteredStats) {
      const current = ensureTotals(row.user_id);
      current.wins += row.wins;
      current.losses += row.losses;
      current.ties += row.ties;
      current.matches += row.wins + row.losses + row.ties;
      current.pointsFor += row.points_for;
      current.pointsAgainst += row.points_against;
      if (row.tournament_id) current.tournaments.add(row.tournament_id);
    }

    for (const match of chronologicalMatches) {
      const rows = match.rows;

      const teamA = rows.filter((r) => r.wins === 1 || r.losses === 1 || r.ties === 1).filter((r) => {
        const result = r.wins > 0 ? 'win' : r.losses > 0 ? 'loss' : 'tie';
        const opponents = [r.opponent_1_user_id, r.opponent_2_user_id].filter(Boolean);
        if (!opponents.length) return false;
        return rows.some((other) => opponents.includes(other.user_id));
      });

      if (!teamA.length) continue;

      const processed = new Set<string>();
      const first = rows[0];
      const teamAIds = [first.user_id, first.partner_user_id].filter(Boolean) as string[];
      const teamBIds = [first.opponent_1_user_id, first.opponent_2_user_id].filter(Boolean) as string[];

      if (!teamAIds.length || !teamBIds.length) continue;

      teamAIds.forEach((id) => processed.add(id));
      teamBIds.forEach((id) => processed.add(id));

      const teamARating =
        teamAIds.reduce((sum, id) => sum + getRating(id), 0) / teamAIds.length;
      const teamBRating =
        teamBIds.reduce((sum, id) => sum + getRating(id), 0) / teamBIds.length;

      const teamARepresentative = rows.find((r) => teamAIds.includes(r.user_id));
      if (!teamARepresentative) continue;

      const teamAResult: 'win' | 'loss' | 'tie' =
        teamARepresentative.wins > 0
          ? 'win'
          : teamARepresentative.losses > 0
          ? 'loss'
          : 'tie';

      const teamBResult: 'win' | 'loss' | 'tie' =
        teamAResult === 'win' ? 'loss' : teamAResult === 'loss' ? 'win' : 'tie';

      const expectedA = expectedScore(teamARating, teamBRating);
      const expectedB = expectedScore(teamBRating, teamARating);

      const averageKTeamA =
        teamAIds.reduce((sum, id) => sum + getKFactor(getMatchesPlayed(id)), 0) / teamAIds.length;
      const averageKTeamB =
        teamBIds.reduce((sum, id) => sum + getKFactor(getMatchesPlayed(id)), 0) / teamBIds.length;

      const deltaA = averageKTeamA * (resultScore(teamAResult) - expectedA);
      const deltaB = averageKTeamB * (resultScore(teamBResult) - expectedB);

      for (const userId of teamAIds) {
        ratings.set(userId, Math.round(getRating(userId) + deltaA));
        bumpMatchCount(userId);
      }

      for (const userId of teamBIds) {
        ratings.set(userId, Math.round(getRating(userId) + deltaB));
        bumpMatchCount(userId);
      }
    }

    return Array.from(totals.values())
      .map((row) => {
        const profile = profilesById.get(row.userId);
        const winPct = row.matches ? Math.round((row.wins / row.matches) * 100) : 0;
        const pointDiff = row.pointsFor - row.pointsAgainst;

        return {
          userId: row.userId,
          name:
            profile?.display_name?.trim() ||
            profile?.email?.split('@')[0] ||
            'Player',
          matches: row.matches,
          wins: row.wins,
          losses: row.losses,
          ties: row.ties,
          winPct,
          pointsFor: row.pointsFor,
          pointsAgainst: row.pointsAgainst,
          pointDiff,
          tournamentsPlayed: row.tournaments.size,
          rating: getRating(row.userId),
        };
      })
      .filter((row) => row.matches >= minMatches)
      .sort((a, b) => {
        if (b.rating !== a.rating) return b.rating - a.rating;
        if (b.winPct !== a.winPct) return b.winPct - a.winPct;
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
        return a.name.localeCompare(b.name);
      });
  }, [filteredStats, profiles, minMatches]);

  return (
    <main className="page-shell">
      <TopNav />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Global Leaderboard</div>
        <div className="card-subtitle">
          Ranked by real Elo, updated match by match.
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 12 }}>
          Filters
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
            gap: 8,
            marginBottom: 12,
          }}
        >
          <FilterButton active={timeFilter === 'lifetime'} label="Lifetime" onClick={() => setTimeFilter('lifetime')} />
          <FilterButton active={timeFilter === '12m'} label="12M" onClick={() => setTimeFilter('12m')} />
          <FilterButton active={timeFilter === '6m'} label="6M" onClick={() => setTimeFilter('6m')} />
          <FilterButton active={timeFilter === '30d'} label="30D" onClick={() => setTimeFilter('30d')} />
          <FilterButton active={timeFilter === '7d'} label="7D" onClick={() => setTimeFilter('7d')} />
        </div>

        <div className="grid">
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

          <div className="list-item">
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              {filterLabel(timeFilter)}
            </div>
            <div className="muted">
              {leaderboard.length} ranked player{leaderboard.length === 1 ? '' : 's'}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card">
          <div className="muted">Loading leaderboard...</div>
        </div>
      ) : !leaderboard.length ? (
        <div className="card">
          <div className="card-title">No Ranked Players Yet</div>
          <div className="muted">
            Try lowering the minimum matches filter or play more completed matches.
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
                    borderColor: 'rgba(250,204,21,.6)',
                    boxShadow: '0 0 0 1px rgba(250,204,21,.35) inset',
                  }
                : place <= 3
                ? {
                    borderColor: 'rgba(163,230,53,.35)',
                  }
                : {};

            return (
              <div
                key={player.userId}
                className="list-item"
                style={highlightStyle}
              >
                <div className="row-between" style={{ alignItems: 'flex-start', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 18 }}>
                      {medal ? `${medal} ` : ''}
                      {place}. {player.name}
                    </div>

                    <div className="muted" style={{ marginTop: 4 }}>
                      {player.wins}-{player.losses}
                      {player.ties > 0 ? `-${player.ties}` : ''} • {player.matches} matches
                    </div>

                    <div className="muted" style={{ marginTop: 2 }}>
                      {player.tournamentsPlayed} tournaments • PF {player.pointsFor} / PA {player.pointsAgainst}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, fontSize: 20 }}>{player.rating}</div>
                    <div className="muted">Elo</div>
                    <div style={{ fontWeight: 700, marginTop: 6 }}>{player.winPct}%</div>
                    <div className="muted">Win Rate</div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                    gap: 8,
                    marginTop: 12,
                  }}
                >
                  <MiniStat label="Wins" value={player.wins} />
                  <MiniStat label="Diff" value={player.pointDiff >= 0 ? `+${player.pointDiff}` : player.pointDiff} />
                  <MiniStat label="Events" value={player.tournamentsPlayed} />
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
      style={{ minHeight: 44, fontWeight: 700 }}
    >
      {label}
    </button>
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
    <div className="card" style={{ padding: 10 }}>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 18 }}>{value}</div>
    </div>
  );
}
