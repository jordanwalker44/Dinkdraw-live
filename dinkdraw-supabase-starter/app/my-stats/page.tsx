'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../../lib/supabase-browser';
import { TopNav } from '../../components/TopNav';
import {
  buildLeaderboardRows,
  buildEloTimeline,
  getCutoffDate,
  filterLabel,
  type EloStatRow,
  type EloProfile,
} from '../../lib/elo';

type TournamentPlayer = {
  id: string;
  tournament_id: string;
  claimed_by_user_id: string | null;
  display_name: string | null;
};

type MatchRow = {
  tournament_id: string;
  team_a_player_1_id: string | null;
  team_a_player_2_id: string | null;
  team_b_player_1_id: string | null;
  team_b_player_2_id: string | null;
  team_a_score: number | null;
  team_b_score: number | null;
  is_bye: boolean;
  is_complete: boolean;
};

type TimeFilter = 'lifetime' | '12m' | '6m' | '30d' | '7d';

export default function MyStatsPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [userId, setUserId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [stats, setStats] = useState<EloStatRow[]>([]);
  const [allStatsForElo, setAllStatsForElo] = useState<EloStatRow[]>([]);
  const [profiles, setProfiles] = useState<EloProfile[]>([]);
  const [allTournamentPlayers, setAllTournamentPlayers] = useState<TournamentPlayer[]>([]);
  const [allCompletedMatches, setAllCompletedMatches] = useState<MatchRow[]>([]);
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

      const { data: userStatRows } = await supabase
        .from('player_match_stats')
        .select('*')
        .eq('user_id', user.id)
        .order('played_at', { ascending: false });

      const { data: allStatRows } = await supabase
        .from('player_match_stats')
        .select('*')
        .order('played_at', { ascending: true });

      const allUserIds = Array.from(
        new Set(((allStatRows || []) as EloStatRow[]).map((r) => r.user_id).filter(Boolean))
      );

      const { data: profileRows } =
        allUserIds.length > 0
          ? await supabase.from('profiles').select('id, display_name, email').in('id', allUserIds)
          : { data: [] as EloProfile[] };

      const userTournamentIds = Array.from(
        new Set((userStatRows || []).map((r) => r.tournament_id).filter(Boolean))
      );

      let tournamentPlayers: TournamentPlayer[] = [];
      let completedMatches: MatchRow[] = [];

      if (userTournamentIds.length > 0) {
        const { data: playersData } = await supabase
          .from('tournament_players')
          .select('id, tournament_id, claimed_by_user_id, display_name')
          .in('tournament_id', userTournamentIds);

        tournamentPlayers = playersData || [];

        const { data: matchesData } = await supabase
          .from('matches')
          .select('tournament_id, team_a_player_1_id, team_a_player_2_id, team_b_player_1_id, team_b_player_2_id, team_a_score, team_b_score, is_bye, is_complete')
          .in('tournament_id', userTournamentIds)
          .eq('is_complete', true);

        completedMatches = matchesData || [];
      }

      setStats((userStatRows || []) as EloStatRow[]);
      setAllStatsForElo((allStatRows || []) as EloStatRow[]);
      setProfiles((profileRows || []) as EloProfile[]);
      setAllTournamentPlayers(tournamentPlayers);
      setAllCompletedMatches(completedMatches);
      setLoading(false);
    }

    load();
  }, [supabase]);

  const filteredStats = useMemo(() => {
    const cutoff = getCutoffDate(timeFilter);
    if (!cutoff) return stats;
    return stats.filter((row) => new Date(row.played_at) >= cutoff);
  }, [stats, timeFilter]);

  const filteredLeaderboardStats = useMemo(() => {
    const cutoff = getCutoffDate(timeFilter);
    if (!cutoff) return allStatsForElo;
    return allStatsForElo.filter((row) => new Date(row.played_at) >= cutoff);
  }, [allStatsForElo, timeFilter]);

  const leaderboardRows = useMemo(
    () => buildLeaderboardRows(filteredLeaderboardStats, profiles, 1),
    [filteredLeaderboardStats, profiles]
  );

  const leaderboardRank = useMemo(() => {
    if (!userId) return { rank: '-', totalRanked: 0 };
    const index = leaderboardRows.findIndex((r) => r.userId === userId);
    return { rank: index >= 0 ? index + 1 : '-', totalRanked: leaderboardRows.length };
  }, [leaderboardRows, userId]);

  const filteredTournamentIds = useMemo(
    () => Array.from(new Set(filteredStats.map((r) => r.tournament_id).filter(Boolean))),
    [filteredStats]
  );

  const filteredTournamentPlayers = useMemo(
    () => allTournamentPlayers.filter((r) => filteredTournamentIds.includes(r.tournament_id)),
    [allTournamentPlayers, filteredTournamentIds]
  );

  const filteredCompletedMatches = useMemo(
    () => allCompletedMatches.filter((r) => filteredTournamentIds.includes(r.tournament_id)),
    [allCompletedMatches, filteredTournamentIds]
  );

  const aggregates = useMemo(() => {
    let wins = 0, losses = 0, ties = 0, pointsFor = 0, pointsAgainst = 0;
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
    return {
      wins, losses, ties, matches,
      winPct: matches ? Math.round((wins / matches) * 100) : 0,
      pointsFor, pointsAgainst,
      pointDiff: pointsFor - pointsAgainst,
      avgPoints: matches ? Math.round(pointsFor / matches) : 0,
      tournamentsPlayed: tournamentIds.size,
    };
  }, [filteredStats]);

  const tournamentSummary = useMemo(() => {
    if (!userId) return { bestFinish: '-', podiums: 0, tournamentWins: 0 };

    const playersByTournament = new Map<string, TournamentPlayer[]>();
    for (const row of filteredTournamentPlayers) {
      if (!playersByTournament.has(row.tournament_id)) playersByTournament.set(row.tournament_id, []);
      playersByTournament.get(row.tournament_id)!.push(row);
    }

    const matchesByTournament = new Map<string, MatchRow[]>();
    for (const row of filteredCompletedMatches) {
      if (!matchesByTournament.has(row.tournament_id)) matchesByTournament.set(row.tournament_id, []);
      matchesByTournament.get(row.tournament_id)!.push(row);
    }

    const finishes: number[] = [];

    for (const tournamentId of filteredTournamentIds) {
      const players = playersByTournament.get(tournamentId) || [];
      const matches = matchesByTournament.get(tournamentId) || [];
      if (!players.length) continue;

      const statsMap = new Map<string, { playerId: string; wins: number; losses: number; pointsFor: number; pointsAgainst: number }>();

      for (const player of players) {
        if (!player.claimed_by_user_id) continue;
        statsMap.set(player.claimed_by_user_id, { playerId: player.claimed_by_user_id, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 });
      }

      for (const match of matches) {
        if (match.is_bye || match.team_a_score === null || match.team_b_score === null) continue;

        const aPlayers = players.filter((p) => [match.team_a_player_1_id, match.team_a_player_2_id].includes(p.id));
        const bPlayers = players.filter((p) => [match.team_b_player_1_id, match.team_b_player_2_id].includes(p.id));
        const aUserIds = aPlayers.map((p) => p.claimed_by_user_id).filter(Boolean) as string[];
        const bUserIds = bPlayers.map((p) => p.claimed_by_user_id).filter(Boolean) as string[];

        for (const id of aUserIds) {
          const row = statsMap.get(id);
          if (!row) continue;
          row.pointsFor += match.team_a_score;
          row.pointsAgainst += match.team_b_score;
          if (match.team_a_score > match.team_b_score) row.wins += 1;
          if (match.team_a_score < match.team_b_score) row.losses += 1;
        }

        for (const id of bUserIds) {
          const row = statsMap.get(id);
          if (!row) continue;
          row.pointsFor += match.team_b_score;
          row.pointsAgainst += match.team_a_score;
          if (match.team_b_score > match.team_a_score) row.wins += 1;
          if (match.team_b_score < match.team_a_score) row.losses += 1;
        }
      }

      const ranked = Array.from(statsMap.values()).sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        const diffA = a.pointsFor - a.pointsAgainst;
        const diffB = b.pointsFor - b.pointsAgainst;
        if (diffB !== diffA) return diffB - diffA;
        if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
        return a.playerId.localeCompare(b.playerId);
      });

      const finish = ranked.findIndex((r) => r.playerId === userId);
      if (finish >= 0) finishes.push(finish + 1);
    }

    const bestFinish = finishes.length ? Math.min(...finishes) : null;
    return {
      bestFinish: bestFinish ?? '-',
      podiums: finishes.filter((f) => f <= 3).length,
      tournamentWins: finishes.filter((f) => f === 1).length,
    };
  }, [filteredTournamentIds, filteredTournamentPlayers, filteredCompletedMatches, userId]);

  const streaks = useMemo(() => {
    const ordered = [...filteredStats].sort(
      (a, b) => new Date(a.played_at).getTime() - new Date(b.played_at).getTime()
    );

    let currentType: 'W' | 'L' | 'T' | null = null;
    let currentCount = 0;
    let bestWinStreak = 0;

    for (const row of ordered) {
      const result: 'W' | 'L' | 'T' = row.wins > 0 ? 'W' : row.losses > 0 ? 'L' : 'T';
      if (result === currentType) { currentCount += 1; }
      else { currentType = result; currentCount = 1; }
      if (result === 'W') bestWinStreak = Math.max(bestWinStreak, currentCount);
    }

    const recentForm = [...filteredStats]
      .sort((a, b) => new Date(b.played_at).getTime() - new Date(a.played_at).getTime())
      .slice(0, 5)
      .map((row) => (row.wins > 0 ? 'W' : row.losses > 0 ? 'L' : 'T'))
      .join(' ');

    return {
      currentStreakLabel: currentType && currentCount > 0 ? `${currentType}${currentCount}` : '-',
      bestWinStreak,
      recentForm: recentForm || '-',
    };
  }, [filteredStats]);

  const eloStats = useMemo(() => {
    if (!userId || !allStatsForElo.length) return { currentElo: 1000, peakElo: 1000, deltaInWindow: 0 };

    const timeline = buildEloTimeline(allStatsForElo);
    const userTimeline = timeline.get(userId) || [];

    const currentElo = userTimeline.length ? userTimeline[userTimeline.length - 1].rating : 1000;
    const peakElo = userTimeline.length ? Math.max(...userTimeline.map((e) => e.rating)) : 1000;
    const cutoff = getCutoffDate(timeFilter);

    if (!cutoff) return { currentElo, peakElo, deltaInWindow: currentElo - 1000 };

    const before = userTimeline.filter((e) => new Date(e.playedAt).getTime() < cutoff.getTime());
    const inside = userTimeline.filter((e) => new Date(e.playedAt).getTime() >= cutoff.getTime());
    const startElo = before.length ? before[before.length - 1].rating : 1000;
    const endElo = inside.length ? inside[inside.length - 1].rating : startElo;

    return { currentElo: endElo, peakElo, deltaInWindow: endElo - startElo };
  }, [allStatsForElo, userId, timeFilter]);

  const initials = useMemo(() => {
    if (!displayName) return 'DD';
    return displayName.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || 'DD';
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
      <div className="hero">
        <div className="hero-inner">
          <div style={{ width: 70, height: 70, borderRadius: '50%', background: 'rgba(163,230,53,.12)', border: '1px solid rgba(163,230,53,.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 24, margin: '0 auto 12px' }}>
            {initials}
          </div>
          <h1 className="hero-title">{displayName || 'My Stats'}</h1>
          <p className="hero-subtitle">{filterLabel(timeFilter)}</p>
        </div>
      </div>

      <TopNav />

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-title">Time Filter</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 8 }}>
          <FilterButton active={timeFilter === 'lifetime'} label="All" onClick={() => setTimeFilter('lifetime')} />
          <FilterButton active={timeFilter === '12m'} label="12M" onClick={() => setTimeFilter('12m')} />
          <FilterButton active={timeFilter === '6m'} label="6M" onClick={() => setTimeFilter('6m')} />
          <FilterButton active={timeFilter === '30d'} label="30D" onClick={() => setTimeFilter('30d')} />
          <FilterButton active={timeFilter === '7d'} label="7D" onClick={() => setTimeFilter('7d')} />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-title">Ranking</div>
        <div className="two-col">
          <SimpleStatCard label="Current Elo" value={eloStats.currentElo} sub={timeFilter === 'lifetime' ? 'All time' : filterLabel(timeFilter)} />
          <SimpleStatCard label="Peak Elo" value={eloStats.peakElo} sub="Lifetime high" />
          <SimpleStatCard label="Elo Change" value={eloStats.deltaInWindow >= 0 ? `+${eloStats.deltaInWindow}` : eloStats.deltaInWindow} sub={filterLabel(timeFilter)} />
          <SimpleStatCard label="Leaderboard Rank" value={leaderboardRank.rank} sub={`${leaderboardRank.totalRanked} ranked`} />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-title">Performance</div>
        <div className="two-col">
          <SimpleStatCard label="Win Rate" value={`${aggregates.winPct}%`} sub={`${aggregates.matches} matches`} />
          <SimpleStatCard label="Wins" value={aggregates.wins} sub={`${aggregates.losses} losses`} />
          <SimpleStatCard label="Points For" value={aggregates.pointsFor} sub={`Avg ${aggregates.avgPoints}/match`} />
          <SimpleStatCard label="Point Diff" value={aggregates.pointDiff} sub="Total" />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-title">Achievements</div>
        <div className="two-col">
          <SimpleStatCard label="Best Finish" value={tournamentSummary.bestFinish} sub="Tournament place" />
          <SimpleStatCard label="Podiums" value={tournamentSummary.podiums} sub="Top 3 finishes" />
          <SimpleStatCard label="Tournament Wins" value={tournamentSummary.tournamentWins} sub="1st place finishes" />
          <SimpleStatCard label="Best Win Streak" value={streaks.bestWinStreak} sub="Lifetime" />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-title">Form</div>
        <div className="grid">
          <div className="list-item">
            <div className="row-between">
              <span className="muted">Current Streak</span>
              <strong>{streaks.currentStreakLabel}</strong>
            </div>
          </div>
          <div className="list-item">
            <div className="row-between">
              <span className="muted">Recent Form</span>
              <strong>{streaks.recentForm}</strong>
            </div>
          </div>
          <div className="list-item">
            <div className="row-between">
              <span className="muted">Tournaments Played</span>
              <strong>{aggregates.tournamentsPlayed}</strong>
            </div>
          </div>
          <div className="list-item">
            <div className="row-between">
              <span className="muted">Ties</span>
              <strong>{aggregates.ties}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-title">Summary</div>
        {loading ? (
          <div className="muted">Loading stats...</div>
        ) : (
          <div className="grid">
            <SummaryRow label="Matches Played" value={aggregates.matches} />
            <SummaryRow label="Wins" value={aggregates.wins} />
            <SummaryRow label="Losses" value={aggregates.losses} />
            <SummaryRow label="Points For" value={aggregates.pointsFor} />
            <SummaryRow label="Points Against" value={aggregates.pointsAgainst} />
            <SummaryRow label="Point Differential" value={aggregates.pointDiff} />
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
                    <div style={{ fontWeight: 800 }}>
                      {match.wins === 1 ? 'Win' : match.losses === 1 ? 'Loss' : 'Tie'}
                    </div>
                    <div className="muted">{new Date(match.played_at).toLocaleDateString()}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800 }}>{match.points_for}-{match.points_against}</div>
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

function FilterButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`button ${active ? 'primary' : 'secondary'}`} onClick={onClick} style={{ minHeight: 44, fontWeight: 800 }}>
      {label}
    </button>
  );
}

function SimpleStatCard({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div className="list-item">
      <div className="muted" style={{ marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.05 }}>{value}</div>
      <div className="muted" style={{ marginTop: 6 }}>{sub}</div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="list-item" style={{ padding: 12 }}>
      <div className="row-between">
        <span className="muted">{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}
