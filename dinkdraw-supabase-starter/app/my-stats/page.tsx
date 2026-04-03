'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../../lib/supabase-browser';
import { TopNav } from '../../components/TopNav';

type StatRow = {
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

type Profile = {
  id: string;
  display_name: string | null;
  email: string | null;
};

type TimeFilter = 'lifetime' | '12m' | '6m' | '30d' | '7d';

type EloMatchGroup = {
  matchId: string;
  playedAt: string;
  rows: StatRow[];
};

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

function buildEloTimeline(allStats: StatRow[]) {
  const groupedMatches = new Map<string, EloMatchGroup>();

  for (const row of allStats) {
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
  const timelineByUser = new Map<string, Array<{ playedAt: string; rating: number }>>();

  function getRating(userId: string) {
    return ratings.get(userId) ?? 1000;
  }

  function getMatchesPlayed(userId: string) {
    return matchCounts.get(userId) ?? 0;
  }

  function bumpMatchCount(userId: string) {
    matchCounts.set(userId, getMatchesPlayed(userId) + 1);
  }

  function pushTimeline(userId: string, playedAt: string, rating: number) {
    if (!timelineByUser.has(userId)) {
      timelineByUser.set(userId, []);
    }
    timelineByUser.get(userId)!.push({ playedAt, rating });
  }

  for (const match of chronologicalMatches) {
    const rows = match.rows;
    if (!rows.length) continue;

    const first = rows[0];
    const teamAIds = [first.user_id, first.partner_user_id].filter(Boolean) as string[];
    const teamBIds = [first.opponent_1_user_id, first.opponent_2_user_id].filter(Boolean) as string[];

    if (!teamAIds.length || !teamBIds.length) continue;

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
      const newRating = Math.round(getRating(userId) + deltaA);
      ratings.set(userId, newRating);
      bumpMatchCount(userId);
      pushTimeline(userId, match.playedAt, newRating);
    }

    for (const userId of teamBIds) {
      const newRating = Math.round(getRating(userId) + deltaB);
      ratings.set(userId, newRating);
      bumpMatchCount(userId);
      pushTimeline(userId, match.playedAt, newRating);
    }
  }

  return timelineByUser;
}

function buildLeaderboardRows(
  filteredStats: StatRow[],
  profiles: Profile[],
  minMatches: number
): LeaderboardRow[] {
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
    if (!rows.length) continue;

    const first = rows[0];
    const teamAIds = [first.user_id, first.partner_user_id].filter(Boolean) as string[];
    const teamBIds = [first.opponent_1_user_id, first.opponent_2_user_id].filter(Boolean) as string[];

    if (!teamAIds.length || !teamBIds.length) continue;

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
}

export default function MyStatsPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [userId, setUserId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [stats, setStats] = useState<StatRow[]>([]);
  const [allStatsForElo, setAllStatsForElo] = useState<StatRow[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
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
        new Set(((allStatRows || []) as StatRow[]).map((row) => row.user_id).filter(Boolean))
      );

      const { data: profileRows } =
        allUserIds.length > 0
          ? await supabase
              .from('profiles')
              .select('id, display_name, email')
              .in('id', allUserIds)
          : { data: [] as Profile[] };

      const userTournamentIds = Array.from(
        new Set((userStatRows || []).map((row) => row.tournament_id).filter(Boolean))
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
          .select(
            'tournament_id, team_a_player_1_id, team_a_player_2_id, team_b_player_1_id, team_b_player_2_id, team_a_score, team_b_score, is_bye, is_complete'
          )
          .in('tournament_id', userTournamentIds)
          .eq('is_complete', true);

        completedMatches = matchesData || [];
      }

      setStats((userStatRows || []) as StatRow[]);
      setAllStatsForElo((allStatRows || []) as StatRow[]);
      setProfiles((profileRows || []) as Profile[]);
      setAllTournamentPlayers(tournamentPlayers);
      setAllCompletedMatches(completedMatches);
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

  const filteredLeaderboardStats = useMemo(() => {
    const cutoff = getCutoffDate(timeFilter);
    if (!cutoff) return allStatsForElo;

    return allStatsForElo.filter((row) => {
      const playedAt = new Date(row.played_at);
      return playedAt >= cutoff;
    });
  }, [allStatsForElo, timeFilter]);

  const leaderboardRows = useMemo(() => {
    return buildLeaderboardRows(filteredLeaderboardStats, profiles, 1);
  }, [filteredLeaderboardStats, profiles]);

  const leaderboardRank = useMemo(() => {
    if (!userId) return { rank: '-', totalRanked: 0 };

    const index = leaderboardRows.findIndex((row) => row.userId === userId);
    return {
      rank: index >= 0 ? index + 1 : '-',
      totalRanked: leaderboardRows.length,
    };
  }, [leaderboardRows, userId]);

  const filteredTournamentIds = useMemo(() => {
    return Array.from(new Set(filteredStats.map((row) => row.tournament_id).filter(Boolean)));
  }, [filteredStats]);

  const filteredTournamentPlayers = useMemo(() => {
    return allTournamentPlayers.filter((row) => filteredTournamentIds.includes(row.tournament_id));
  }, [allTournamentPlayers, filteredTournamentIds]);

  const filteredCompletedMatches = useMemo(() => {
    return allCompletedMatches.filter((row) => filteredTournamentIds.includes(row.tournament_id));
  }, [allCompletedMatches, filteredTournamentIds]);

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

  const tournamentSummary = useMemo(() => {
    if (!userId) {
      return {
        bestFinish: '-',
        podiums: 0,
        tournamentWins: 0,
      };
    }

    const playersByTournament = new Map<string, TournamentPlayer[]>();
    for (const row of filteredTournamentPlayers) {
      if (!playersByTournament.has(row.tournament_id)) {
        playersByTournament.set(row.tournament_id, []);
      }
      playersByTournament.get(row.tournament_id)!.push(row);
    }

    const matchesByTournament = new Map<string, MatchRow[]>();
    for (const row of filteredCompletedMatches) {
      if (!matchesByTournament.has(row.tournament_id)) {
        matchesByTournament.set(row.tournament_id, []);
      }
      matchesByTournament.get(row.tournament_id)!.push(row);
    }

    const finishes: number[] = [];

    for (const tournamentId of filteredTournamentIds) {
      const players = playersByTournament.get(tournamentId) || [];
      const matches = matchesByTournament.get(tournamentId) || [];
      if (!players.length) continue;

      const statsMap = new Map<
        string,
        {
          playerId: string;
          wins: number;
          losses: number;
          pointsFor: number;
          pointsAgainst: number;
        }
      >();

      for (const player of players) {
        if (!player.claimed_by_user_id) continue;
        statsMap.set(player.claimed_by_user_id, {
          playerId: player.claimed_by_user_id,
          wins: 0,
          losses: 0,
          pointsFor: 0,
          pointsAgainst: 0,
        });
      }

      for (const match of matches) {
        if (
          match.is_bye ||
          match.team_a_score === null ||
          match.team_b_score === null
        ) {
          continue;
        }

        const aPlayers = players.filter((p) =>
          [match.team_a_player_1_id, match.team_a_player_2_id].includes(p.id)
        );

        const bPlayers = players.filter((p) =>
          [match.team_b_player_1_id, match.team_b_player_2_id].includes(p.id)
        );

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

      const finish = ranked.findIndex((row) => row.playerId === userId);
      if (finish >= 0) finishes.push(finish + 1);
    }

    const bestFinish = finishes.length ? Math.min(...finishes) : null;
    const podiums = finishes.filter((f) => f <= 3).length;
    const tournamentWins = finishes.filter((f) => f === 1).length;

    return {
      bestFinish: bestFinish ?? '-',
      podiums,
      tournamentWins,
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
      const result: 'W' | 'L' | 'T' =
        row.wins > 0 ? 'W' : row.losses > 0 ? 'L' : 'T';

      if (result === currentType) {
        currentCount += 1;
      } else {
        currentType = result;
        currentCount = 1;
      }

      if (result === 'W') {
        bestWinStreak = Math.max(bestWinStreak, currentCount);
      }
    }

    const currentStreakLabel =
      currentType && currentCount > 0 ? `${currentType}${currentCount}` : '-';

    const recentForm = [...filteredStats]
      .sort((a, b) => new Date(b.played_at).getTime() - new Date(a.played_at).getTime())
      .slice(0, 5)
      .map((row) => (row.wins > 0 ? 'W' : row.losses > 0 ? 'L' : 'T'))
      .join(' ');

    return {
      currentStreakLabel,
      bestWinStreak,
      recentForm: recentForm || '-',
    };
  }, [filteredStats]);

  const eloStats = useMemo(() => {
    if (!userId || !allStatsForElo.length) {
      return {
        currentElo: 1000,
        peakElo: 1000,
        startEloForWindow: 1000,
        deltaInWindow: 0,
      };
    }

    const timelineByUser = buildEloTimeline(allStatsForElo);
    const userTimeline = timelineByUser.get(userId) || [];

    const currentElo = userTimeline.length
      ? userTimeline[userTimeline.length - 1].rating
      : 1000;

    const peakElo = userTimeline.length
      ? Math.max(...userTimeline.map((entry) => entry.rating))
      : 1000;

    const cutoff = getCutoffDate(timeFilter);

    if (!cutoff) {
      return {
        currentElo,
        peakElo,
        startEloForWindow: 1000,
        deltaInWindow: currentElo - 1000,
      };
    }

    const beforeWindow = userTimeline.filter(
      (entry) => new Date(entry.playedAt).getTime() < cutoff.getTime()
    );
    const insideWindow = userTimeline.filter(
      (entry) => new Date(entry.playedAt).getTime() >= cutoff.getTime()
    );

    const startEloForWindow = beforeWindow.length
      ? beforeWindow[beforeWindow.length - 1].rating
      : 1000;

    const endEloForWindow = insideWindow.length
      ? insideWindow[insideWindow.length - 1].rating
      : startEloForWindow;

    return {
      currentElo: endEloForWindow,
      peakElo,
      startEloForWindow,
      deltaInWindow: endEloForWindow - startEloForWindow,
    };
  }, [allStatsForElo, userId, timeFilter]);

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
          <FilterButton active={timeFilter === 'lifetime'} label="Lifetime" onClick={() => setTimeFilter('lifetime')} />
          <FilterButton active={timeFilter === '12m'} label="12M" onClick={() => setTimeFilter('12m')} />
          <FilterButton active={timeFilter === '6m'} label="6M" onClick={() => setTimeFilter('6m')} />
          <FilterButton active={timeFilter === '30d'} label="30D" onClick={() => setTimeFilter('30d')} />
          <FilterButton active={timeFilter === '7d'} label="7D" onClick={() => setTimeFilter('7d')} />
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

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <StatCard label="Current Elo" value={eloStats.currentElo} sub={timeFilter === 'lifetime' ? 'All time' : filterLabel(timeFilter)} />
        <StatCard label="Peak Elo" value={eloStats.peakElo} sub="Lifetime high" />
        <StatCard
          label="Elo Change"
          value={eloStats.deltaInWindow >= 0 ? `+${eloStats.deltaInWindow}` : eloStats.deltaInWindow}
          sub={filterLabel(timeFilter)}
        />
        <StatCard
          label="Leaderboard Rank"
          value={leaderboardRank.rank}
          sub={`${leaderboardRank.totalRanked} ranked`}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <StatCard label="Best Finish" value={tournamentSummary.bestFinish} sub="Tournament place" />
        <StatCard label="Podiums" value={tournamentSummary.podiums} sub="Top 3 finishes" />
        <StatCard label="Tournament Wins" value={tournamentSummary.tournamentWins} sub="1st place finishes" />
        <StatCard label="Current Streak" value={streaks.currentStreakLabel} sub="W / L / T" />
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
            <Row label="Best Win Streak" value={streaks.bestWinStreak} />
            <Row label="Recent Form" value={streaks.recentForm} />
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
