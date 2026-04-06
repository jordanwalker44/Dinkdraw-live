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
type FormatTab = 'doubles' | 'singles' | 'overall';

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
  const [formatTab, setFormatTab] = useState<FormatTab>('doubles');

  useEffect(() => {
    async function load() {
      setLoading(true);

      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;

      if (!user) {
        setLoading(false);
        return;
      }

      setUserId(user.id);

      const [userStatResult, allStatResult, profileResult] = await Promise.all([
        supabase.from('player_match_stats').select('*').eq('user_id', user.id).order('played_at', { ascending: false }),
        supabase.from('player_match_stats').select('*').order('played_at', { ascending: true }),
        supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
      ]);

      const userStatRows = userStatResult.data || [];
      const allStatRows = allStatResult.data || [];

      setDisplayName(profileResult.data?.display_name || user.email || 'Player');

      const allUserIds = Array.from(
        new Set((allStatRows as EloStatRow[]).map((r) => r.user_id).filter(Boolean))
      );

      const userTournamentIds = Array.from(
        new Set(userStatRows.map((r) => r.tournament_id).filter(Boolean))
      );

      const [profileRowsResult, playersResult, matchesResult] = await Promise.all([
        allUserIds.length > 0
          ? supabase.from('profiles').select('id, display_name, email').in('id', allUserIds)
          : Promise.resolve({ data: [] as EloProfile[] }),
        userTournamentIds.length > 0
          ? supabase.from('tournament_players').select('id, tournament_id, claimed_by_user_id, display_name').in('tournament_id', userTournamentIds)
          : Promise.resolve({ data: [] as TournamentPlayer[] }),
        userTournamentIds.length > 0
          ? supabase.from('matches').select('tournament_id, team_a_player_1_id, team_a_player_2_id, team_b_player_1_id, team_b_player_2_id, team_a_score, team_b_score, is_bye, is_complete').in('tournament_id', userTournamentIds).eq('is_complete', true)
          : Promise.resolve({ data: [] as MatchRow[] }),
      ]);

      setStats(userStatRows as EloStatRow[]);
      setAllStatsForElo(allStatRows as EloStatRow[]);
      setProfiles((profileRowsResult.data || []) as EloProfile[]);
      setAllTournamentPlayers((playersResult.data || []) as TournamentPlayer[]);
      setAllCompletedMatches((matchesResult.data || []) as MatchRow[]);
      setLoading(false);
    }

    load();
  }, [supabase]);

  const filteredStats = useMemo(() => {
    const cutoff = getCutoffDate(timeFilter);
    if (!cutoff) return stats;
    return stats.filter((row) => new Date(row.played_at) >= cutoff);
  }, [stats, timeFilter]);

  const filteredSinglesStats = useMemo(
    () => filteredStats.filter((row) => row.format === 'singles'),
    [filteredStats]
  );

  const filteredDoublesStats = useMemo(
    () => filteredStats.filter((row) => row.format === 'doubles'),
    [filteredStats]
  );

  const filteredLeaderboardStats = useMemo(() => {
    const cutoff = getCutoffDate(timeFilter);
    if (!cutoff) return allStatsForElo;
    return allStatsForElo.filter((row) => new Date(row.played_at) >= cutoff);
  }, [allStatsForElo, timeFilter]);

  const singlesLeaderboardRows = useMemo(
    () => buildLeaderboardRows(filteredLeaderboardStats.filter((r) => r.format === 'singles'), profiles, 1),
    [filteredLeaderboardStats, profiles]
  );

  const doublesLeaderboardRows = useMemo(
    () => buildLeaderboardRows(filteredLeaderboardStats.filter((r) => r.format === 'doubles'), profiles, 1),
    [filteredLeaderboardStats, profiles]
  );

  const singlesRank = useMemo(() => {
    if (!userId) return { rank: '-', totalRanked: 0 };
    const index = singlesLeaderboardRows.findIndex((r) => r.userId === userId);
    return { rank: index >= 0 ? index + 1 : '-', totalRanked: singlesLeaderboardRows.length };
  }, [singlesLeaderboardRows, userId]);

  const doublesRank = useMemo(() => {
    if (!userId) return { rank: '-', totalRanked: 0 };
    const index = doublesLeaderboardRows.findIndex((r) => r.userId === userId);
    return { rank: index >= 0 ? index + 1 : '-', totalRanked: doublesLeaderboardRows.length };
  }, [doublesLeaderboardRows, userId]);

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

  function calcAggregates(statRows: EloStatRow[]) {
    let wins = 0, losses = 0, ties = 0, pointsFor = 0, pointsAgainst = 0;
    const tournamentIds = new Set<string>();
    for (const s of statRows) {
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
  }

  const singlesAggregates = useMemo(() => calcAggregates(filteredSinglesStats), [filteredSinglesStats]);
  const doublesAggregates = useMemo(() => calcAggregates(filteredDoublesStats), [filteredDoublesStats]);
  const overallAggregates = useMemo(() => calcAggregates(filteredStats), [filteredStats]);

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
      (a, b) => new Date(b.played_at).getTime() - new Date(a.played_at).getTime()
    );

    let currentType: 'W' | 'L' | 'T' | null = null;
    let currentCount = 0;
    let bestWinStreak = 0;
    let tempWinStreak = 0;

    for (const row of ordered) {
      const result: 'W' | 'L' | 'T' = row.wins > 0 ? 'W' : row.losses > 0 ? 'L' : 'T';
      if (currentType === null) {
        currentType = result;
        currentCount = 1;
      } else if (result === currentType) {
        currentCount += 1;
      } else {
        break;
      }
    }

    for (const row of ordered) {
      const result: 'W' | 'L' | 'T' = row.wins > 0 ? 'W' : row.losses > 0 ? 'L' : 'T';
      if (result === 'W') {
        tempWinStreak += 1;
        bestWinStreak = Math.max(bestWinStreak, tempWinStreak);
      } else {
        tempWinStreak = 0;
      }
    }

    const recentForm = ordered
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
    if (!userId || !allStatsForElo.length) {
      return { singlesElo: 1000, singlesPeakElo: 1000, singlesDelta: 0, doublesElo: 1000, doublesPeakElo: 1000, doublesDelta: 0 };
    }

    const singlesTimeline = buildEloTimeline(allStatsForElo.filter((r) => r.format === 'singles'));
    const doublesTimeline = buildEloTimeline(allStatsForElo.filter((r) => r.format === 'doubles'));
    const cutoff = getCutoffDate(timeFilter);

    function getEloStats(timeline: Map<string, Array<{ playedAt: string; rating: number }>>) {
      const userTimeline = timeline.get(userId) || [];
      const currentElo = userTimeline.length ? userTimeline[userTimeline.length - 1].rating : 1000;
      const peakElo = userTimeline.length ? Math.max(...userTimeline.map((e) => e.rating)) : 1000;
      if (!cutoff) return { currentElo, peakElo, delta: currentElo - 1000 };
      const before = userTimeline.filter((e) => new Date(e.playedAt).getTime() < cutoff.getTime());
      const inside = userTimeline.filter((e) => new Date(e.playedAt).getTime() >= cutoff.getTime());
      const startElo = before.length ? before[before.length - 1].rating : 1000;
      const endElo = inside.length ? inside[inside.length - 1].rating : startElo;
      return { currentElo: endElo, peakElo, delta: endElo - startElo };
    }

    const singles = getEloStats(singlesTimeline);
    const doubles = getEloStats(doublesTimeline);
    return {
      singlesElo: singles.currentElo, singlesPeakElo: singles.peakElo, singlesDelta: singles.delta,
      doublesElo: doubles.currentElo, doublesPeakElo: doubles.peakElo, doublesDelta: doubles.delta,
    };
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

  const activeStats = formatTab === 'singles' ? filteredSinglesStats : formatTab === 'doubles' ? filteredDoublesStats : filteredStats;
  const activeAggregates = formatTab === 'singles' ? singlesAggregates : formatTab === 'doubles' ? doublesAggregates : overallAggregates;
  const activeElo = formatTab === 'singles'
    ? { elo: eloStats.singlesElo, peak: eloStats.singlesPeakElo, delta: eloStats.singlesDelta }
    : formatTab === 'doubles'
    ? { elo: eloStats.doublesElo, peak: eloStats.doublesPeakElo, delta: eloStats.doublesDelta }
    : { elo: Math.max(eloStats.singlesElo, eloStats.doublesElo), peak: Math.max(eloStats.singlesPeakElo, eloStats.doublesPeakElo), delta: 0 };
  const activeRank = formatTab === 'singles' ? singlesRank : formatTab === 'doubles' ? doublesRank : { rank: '-', totalRanked: 0 };

  return (
    <main className="page-shell">
      <div className="hero">
        <div className="hero-inner">
          <div style={{ width: 70, height: 70, borderRadius: '50%', background: 'rgba(255,203,5,.12)', border: '1px solid rgba(255,203,5,.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 24, margin: '0 auto 12px' }}>
            {initials}
          </div>
          <h1 className="hero-title">{displayName || 'My Stats'}</h1>
          <p className="hero-subtitle">{filterLabel(timeFilter)}</p>
        </div>
      </div>

      <TopNav />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 14 }}>
        <button type="button" className={`button ${formatTab === 'doubles' ? 'primary' : 'secondary'}`} onClick={() => setFormatTab('doubles')}>Doubles</button>
        <button type="button" className={`button ${formatTab === 'singles' ? 'primary' : 'secondary'}`} onClick={() => setFormatTab('singles')}>Singles</button>
        <button type="button" className={`button ${formatTab === 'overall' ? 'primary' : 'secondary'}`} onClick={() => setFormatTab('overall')}>Overall</button>
      </div>

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

      {activeAggregates.matches === 0 && !loading ? (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-title">No {formatTab === 'overall' ? '' : formatTab} stats yet</div>
          <div className="muted">
            {formatTab === 'singles'
              ? 'Play a singles tournament to see your singles stats here.'
              : formatTab === 'doubles'
              ? 'Play a doubles tournament to see your doubles stats here.'
              : 'Complete some matches to see your stats here.'}
          </div>
        </div>
      ) : (
        <>
          {formatTab !== 'overall' ? (
            <div className="card" style={{ marginBottom: 14 }}>
              <div className="card-title">Ranking</div>
              <div className="card-subtitle">Your rating is calculated from every match result. It goes up with wins and down with losses.</div>
              <div className="two-col">
                <SimpleStatCard label="Rating" value={activeElo.elo} sub={timeFilter === 'lifetime' ? 'All time' : filterLabel(timeFilter)} />
                <SimpleStatCard label="Peak Rating" value={activeElo.peak} sub="Lifetime high" />
                <SimpleStatCard label="Rating Change" value={activeElo.delta >= 0 ? `+${activeElo.delta}` : activeElo.delta} sub={filterLabel(timeFilter)} />
                <SimpleStatCard label="Rank" value={activeRank.rank} sub={`${activeRank.totalRanked} ranked`} />
              </div>
            </div>
          ) : null}

          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-title">Performance</div>
            <div className="two-col">
              <SimpleStatCard label="Win Rate" value={`${activeAggregates.winPct}%`} sub={`${activeAggregates.matches} matches`} />
              <SimpleStatCard label="Wins" value={activeAggregates.wins} sub={`${activeAggregates.losses} losses`} />
              <SimpleStatCard label="Points For" value={activeAggregates.pointsFor} sub={`Avg ${activeAggregates.avgPoints}/match`} />
              <SimpleStatCard label="Point Diff" value={activeAggregates.pointDiff} sub="Total" />
            </div>
          </div>

          {formatTab === 'overall' ? (
            <div className="card" style={{ marginBottom: 14 }}>
              <div className="card-title">Achievements</div>
              <div className="two-col">
                <SimpleStatCard label="Best Finish" value={tournamentSummary.bestFinish} sub="Tournament place" />
                <SimpleStatCard label="Podiums" value={tournamentSummary.podiums} sub="Top 3 finishes" />
                <SimpleStatCard label="Tournament Wins" value={tournamentSummary.tournamentWins} sub="1st place finishes" />
                <SimpleStatCard label="Best Win Streak" value={streaks.bestWinStreak} sub="All formats" />
              </div>
            </div>
          ) : null}

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
                  <strong>{activeAggregates.tournamentsPlayed}</strong>
                </div>
              </div>
              <div className="list-item">
                <div className="row-between">
                  <span className="muted">Ties</span>
                  <strong>{activeAggregates.ties}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">Recent Matches</div>
            {loading ? (
              <div className="muted">Loading recent matches...</div>
            ) : !activeStats.length ? (
              <div className="muted">No matches in this time range yet.</div>
            ) : (
              <div className="grid">
                {activeStats.slice(0, 5).map((match) => (
                  <div key={match.id} className="list-item">
                    <div className="row-between">
                      <div>
                        <div style={{ fontWeight: 800 }}>
                          {match.wins === 1 ? 'Win' : match.losses === 1 ? 'Loss' : 'Tie'}
                        </div>
                        <div className="muted">{new Date(match.played_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })}</div>
                        <div className="muted" style={{ marginTop: 2 }}>
                          {match.format === 'singles' ? 'Singles' : 'Doubles'}
                        </div>
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
        </>
      )}
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