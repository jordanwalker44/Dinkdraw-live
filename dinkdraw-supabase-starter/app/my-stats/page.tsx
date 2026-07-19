'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../../lib/supabase-browser';
import { TopNav } from '../../components/TopNav';
import {
  getCutoffDate,
  type EloStatRow,
  type EloProfile,
} from '../../lib/elo';

type TournamentPlayer = {
  id: string;
  tournament_id: string;
  slot_number: number;
  claimed_by_user_id: string | null;
  display_name: string | null;
};

type MatchRow = {
  id: string;
  tournament_id: string;
  round_number: number;
  court_number: number | null;
  team_a_player_1_id: string | null;
  team_a_player_2_id: string | null;
  team_b_player_1_id: string | null;
  team_b_player_2_id: string | null;
  team_a_score: number | null;
  team_b_score: number | null;
  is_bye: boolean;
  is_complete: boolean;
};

type TournamentRow = {
  id: string;
  title: string;
  event_date: string | null;
  started_at: string | null;
  format: string;
  tournament_mode: string | null;
  playoff_format: string | null;
  status: string;
};

type EventResultRow = {
  tournament_id: string;
  placement: number;
};

type MatchSummary = {
  matchId: string;
  tournamentId: string;
  playedAt: string;
  format: string;
  partnerUserId: string | null;
  opponentUserIds: string[];
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  result: 'W' | 'L' | 'T';
};

type TimeFilter = 'lifetime' | '12m' | '6m' | '30d' | '7d';
type FormatTab = 'doubles' | 'singles' | 'overall';

export default function MyStatsPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [userId, setUserId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [stats, setStats] = useState<EloStatRow[]>([]);
  const [profiles, setProfiles] = useState<EloProfile[]>([]);
  const [allTournamentPlayers, setAllTournamentPlayers] = useState<TournamentPlayer[]>([]);
  const [allCompletedMatches, setAllCompletedMatches] = useState<MatchRow[]>([]);
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [eventResults, setEventResults] = useState<EventResultRow[]>([]);
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

      const [userStatResult, profileResult] = await Promise.all([
        supabase.from('player_match_stats').select('*').eq('user_id', user.id).order('played_at', { ascending: false }),
        supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
      ]);

      const userStatRows = userStatResult.data || [];

      setDisplayName(profileResult.data?.display_name || user.email || 'Player');

      const allUserIds = Array.from(
        new Set(
          (userStatRows as EloStatRow[]).flatMap((row) => [
            row.partner_user_id,
            row.opponent_1_user_id,
            row.opponent_2_user_id,
          ]).filter((id): id is string => Boolean(id))
        )
      );

      const userTournamentIds = Array.from(
        new Set(userStatRows.map((r) => r.tournament_id).filter(Boolean))
      );

      const [profileRowsResult, playersResult, matchesResult, tournamentsResult, eventResultsResult] = await Promise.all([
        allUserIds.length > 0
          ? supabase.from('profiles').select('id, display_name, email').in('id', allUserIds)
          : Promise.resolve({ data: [] as EloProfile[] }),
        userTournamentIds.length > 0
          ? supabase.from('tournament_players').select('id, tournament_id, slot_number, claimed_by_user_id, display_name').in('tournament_id', userTournamentIds)
          : Promise.resolve({ data: [] as TournamentPlayer[] }),
        userTournamentIds.length > 0
          ? supabase.from('matches').select('id, tournament_id, round_number, court_number, team_a_player_1_id, team_a_player_2_id, team_b_player_1_id, team_b_player_2_id, team_a_score, team_b_score, is_bye, is_complete').in('tournament_id', userTournamentIds).eq('is_complete', true)
          : Promise.resolve({ data: [] as MatchRow[] }),
        userTournamentIds.length > 0
          ? supabase.from('tournaments').select('id, title, event_date, started_at, format, tournament_mode, playoff_format, status').in('id', userTournamentIds)
          : Promise.resolve({ data: [] as TournamentRow[] }),
        userTournamentIds.length > 0
          ? supabase.from('event_results').select('tournament_id, placement').eq('user_id', user.id).in('tournament_id', userTournamentIds)
          : Promise.resolve({ data: [] as EventResultRow[] }),
      ]);

      setStats(userStatRows as EloStatRow[]);
      setProfiles((profileRowsResult.data || []) as EloProfile[]);
      setAllTournamentPlayers((playersResult.data || []) as TournamentPlayer[]);
      setAllCompletedMatches((matchesResult.data || []) as MatchRow[]);
      setTournaments((tournamentsResult.data || []) as TournamentRow[]);
      setEventResults((eventResultsResult.data || []) as EventResultRow[]);
      setLoading(false);
    }

    load();
  }, [supabase]);

  const filteredStats = useMemo(() => {
    const cutoff = getCutoffDate(timeFilter);
    if (!cutoff) return stats;
    return stats.filter((row) => new Date(row.played_at) >= cutoff);
  }, [stats, timeFilter]);

  const matchSummaries = useMemo(() => {
    const grouped = new Map<string, EloStatRow[]>();
    for (const row of filteredStats) {
      if (!grouped.has(row.match_id)) grouped.set(row.match_id, []);
      grouped.get(row.match_id)!.push(row);
    }

    return Array.from(grouped.entries()).map(([matchId, rows]): MatchSummary => {
      const orderedRows = [...rows].sort((a, b) => (a.game_number ?? 1) - (b.game_number ?? 1));
      const first = orderedRows[0];
      const wins = orderedRows.reduce((sum, row) => sum + row.wins, 0);
      const losses = orderedRows.reduce((sum, row) => sum + row.losses, 0);
      const ties = orderedRows.reduce((sum, row) => sum + row.ties, 0);
      return {
        matchId,
        tournamentId: first.tournament_id,
        playedAt: first.played_at,
        format: first.format,
        partnerUserId: first.partner_user_id,
        opponentUserIds: Array.from(new Set([
          first.opponent_1_user_id,
          first.opponent_2_user_id,
        ].filter((id): id is string => Boolean(id)))),
        wins,
        losses,
        ties,
        pointsFor: orderedRows.reduce((sum, row) => sum + row.points_for, 0),
        pointsAgainst: orderedRows.reduce((sum, row) => sum + row.points_against, 0),
        result: wins > losses ? 'W' : losses > wins ? 'L' : 'T',
      };
    }).sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime());
  }, [filteredStats]);

  const activeMatchSummaries = useMemo(
    () => matchSummaries.filter((row) => formatTab === 'overall' || row.format === formatTab),
    [matchSummaries, formatTab]
  );

  const profilesById = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile])),
    [profiles]
  );

  function displayNameFor(userId: string) {
    const profile = profilesById.get(userId);
    return profile?.display_name?.trim() || profile?.email?.split('@')[0] || 'DinkDraw player';
  }

  function buildPeopleSummary(
    kind: 'partner' | 'opponent',
    sourceMatches: MatchSummary[] = activeMatchSummaries
  ) {
    const totals = new Map<string, {
      userId: string;
      matches: number;
      wins: number;
      losses: number;
      ties: number;
      pointsFor: number;
      pointsAgainst: number;
      lastPlayedAt: string;
    }>();

    for (const match of sourceMatches) {
      const ids = kind === 'partner'
        ? (match.partnerUserId ? [match.partnerUserId] : [])
        : match.opponentUserIds;
      for (const id of ids) {
        const row = totals.get(id) || {
          userId: id,
          matches: 0,
          wins: 0,
          losses: 0,
          ties: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          lastPlayedAt: match.playedAt,
        };
        row.matches += 1;
        row.wins += match.result === 'W' ? 1 : 0;
        row.losses += match.result === 'L' ? 1 : 0;
        row.ties += match.result === 'T' ? 1 : 0;
        row.pointsFor += match.pointsFor;
        row.pointsAgainst += match.pointsAgainst;
        if (new Date(match.playedAt) > new Date(row.lastPlayedAt)) row.lastPlayedAt = match.playedAt;
        totals.set(id, row);
      }
    }

    return Array.from(totals.values())
      .map((row) => ({
        ...row,
        name: displayNameFor(row.userId),
        winPct: row.matches ? Math.round((row.wins / row.matches) * 100) : 0,
        pointDiff: row.pointsFor - row.pointsAgainst,
      }))
      .sort((a, b) => b.matches - a.matches || b.winPct - a.winPct || a.name.localeCompare(b.name));
  }

  const partnerSummary = useMemo(
    () => buildPeopleSummary('partner'),
    // displayNameFor is derived from profilesById and intentionally recalculates with profile changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeMatchSummaries, profilesById]
  );

  const opponentSummary = useMemo(
    () => buildPeopleSummary('opponent'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeMatchSummaries, profilesById]
  );

  const bestPartner = useMemo(() => {
    const doublesMatches = matchSummaries.filter((match) => match.format === 'doubles');
    return buildPeopleSummary('partner', doublesMatches)
      .filter((partner) => partner.matches >= 3)
      .sort((a, b) =>
        b.winPct - a.winPct ||
        b.matches - a.matches ||
        b.pointDiff - a.pointDiff ||
        a.name.localeCompare(b.name)
      )[0] || null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchSummaries, profilesById]);

  const placementStats = useMemo(
    () => filteredStats.filter((row) => formatTab === 'overall' || row.format === formatTab),
    [filteredStats, formatTab]
  );

  const filteredTournamentIds = useMemo(
    () => Array.from(new Set(placementStats.map((r) => r.tournament_id).filter(Boolean))),
    [placementStats]
  );

  const filteredTournamentPlayers = useMemo(
    () => allTournamentPlayers.filter((r) => filteredTournamentIds.includes(r.tournament_id)),
    [allTournamentPlayers, filteredTournamentIds]
  );

  const filteredCompletedMatches = useMemo(
    () => allCompletedMatches.filter((r) => filteredTournamentIds.includes(r.tournament_id)),
    [allCompletedMatches, filteredTournamentIds]
  );

  function calcAggregates(statRows: MatchSummary[]) {
    let wins = 0, losses = 0, ties = 0, pointsFor = 0, pointsAgainst = 0;
    const tournamentIds = new Set<string>();
    for (const s of statRows) {
      wins += s.result === 'W' ? 1 : 0;
      losses += s.result === 'L' ? 1 : 0;
      ties += s.result === 'T' ? 1 : 0;
      pointsFor += s.pointsFor;
      pointsAgainst += s.pointsAgainst;
      if (s.tournamentId) tournamentIds.add(s.tournamentId);
    }
    const matches = statRows.length;
    return {
      wins, losses, ties, matches,
      winPct: matches ? Math.round((wins / matches) * 100) : 0,
      pointsFor, pointsAgainst,
      pointDiff: pointsFor - pointsAgainst,
      avgPoints: matches ? Math.round(pointsFor / matches) : 0,
      tournamentsPlayed: tournamentIds.size,
    };
  }

  const singlesAggregates = useMemo(() => calcAggregates(matchSummaries.filter((row) => row.format === 'singles')), [matchSummaries]);
  const doublesAggregates = useMemo(() => calcAggregates(matchSummaries.filter((row) => row.format === 'doubles')), [matchSummaries]);
  const overallAggregates = useMemo(() => calcAggregates(matchSummaries), [matchSummaries]);

  const tournamentSummary = useMemo(() => {
    if (!userId) return { bestFinish: '-', podiums: 0, tournamentWins: 0, averageFinish: '-', placements: [] as Array<{ tournamentId: string; placement: number }> };

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

    const derivedPlacements = new Map<string, number>();

    for (const tournamentId of filteredTournamentIds) {
      const players = playersByTournament.get(tournamentId) || [];
      const matches = matchesByTournament.get(tournamentId) || [];
      if (!players.length) continue;
      const tournament = tournaments.find((row) => row.id === tournamentId);
      const hasPlayoffs = Boolean(tournament?.playoff_format && tournament.playoff_format !== 'none');
      const hasOfficialPlacement = eventResults.some((row) => row.tournament_id === tournamentId);
      if (hasPlayoffs && !hasOfficialPlacement) continue;

      const statsMap = new Map<string, {
        playerId: string;
        wins: number;
        losses: number;
        pointsFor: number;
        pointsAgainst: number;
        finalCourt: number | null;
        latestRound: number;
        initialRank: number;
      }>();
      for (const player of players) {
        statsMap.set(player.id, {
          playerId: player.id,
          wins: 0,
          losses: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          finalCourt: null,
          latestRound: 0,
          initialRank: player.slot_number,
        });
      }

      for (const match of matches) {
        if (match.is_bye || match.team_a_score === null || match.team_b_score === null) continue;
        const aPlayerIds = [match.team_a_player_1_id, match.team_a_player_2_id].filter((id): id is string => Boolean(id));
        const bPlayerIds = [match.team_b_player_1_id, match.team_b_player_2_id].filter((id): id is string => Boolean(id));

        for (const id of aPlayerIds) {
          const row = statsMap.get(id);
          if (!row) continue;
          row.pointsFor += match.team_a_score;
          row.pointsAgainst += match.team_b_score;
          if (match.team_a_score > match.team_b_score) row.wins += 1;
          if (match.team_a_score < match.team_b_score) row.losses += 1;
          if (match.round_number >= row.latestRound) {
            row.latestRound = match.round_number;
            row.finalCourt = match.court_number;
          }
        }

        for (const id of bPlayerIds) {
          const row = statsMap.get(id);
          if (!row) continue;
          row.pointsFor += match.team_b_score;
          row.pointsAgainst += match.team_a_score;
          if (match.team_b_score > match.team_a_score) row.wins += 1;
          if (match.team_b_score < match.team_a_score) row.losses += 1;
          if (match.round_number >= row.latestRound) {
            row.latestRound = match.round_number;
            row.finalCourt = match.court_number;
          }
        }
      }

      const tournamentMode = tournament?.tournament_mode;
      const ranked = Array.from(statsMap.values()).sort((a, b) => {
        if (tournamentMode === 'cream_of_the_crop') {
          const courtA = a.finalCourt ?? 999;
          const courtB = b.finalCourt ?? 999;
          if (courtA !== courtB) return courtA - courtB;
        }
        if (b.wins !== a.wins) return b.wins - a.wins;
        const diffA = a.pointsFor - a.pointsAgainst;
        const diffB = b.pointsFor - b.pointsAgainst;
        if (diffB !== diffA) return diffB - diffA;
        if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
        return a.initialRank - b.initialRank;
      });

      const userPlayerId = players.find((player) => player.claimed_by_user_id === userId)?.id;
      const finish = userPlayerId ? ranked.findIndex((r) => r.playerId === userPlayerId) : -1;
      if (finish >= 0) derivedPlacements.set(tournamentId, finish + 1);
    }

    const officialPlacements = new Map(eventResults.map((row) => [row.tournament_id, row.placement]));
    const placements = filteredTournamentIds
      .map((tournamentId) => ({
        tournamentId,
        placement: officialPlacements.get(tournamentId) ?? derivedPlacements.get(tournamentId),
      }))
      .filter((row): row is { tournamentId: string; placement: number } => typeof row.placement === 'number');
    const finishes = placements.map((row) => row.placement);
    const bestFinish = finishes.length ? Math.min(...finishes) : null;
    return {
      bestFinish: bestFinish ?? '-',
      podiums: finishes.filter((f) => f <= 3).length,
      tournamentWins: finishes.filter((f) => f === 1).length,
      averageFinish: finishes.length
        ? (finishes.reduce((sum, finish) => sum + finish, 0) / finishes.length).toFixed(1)
        : '-',
      placements,
    };
  }, [filteredTournamentIds, filteredTournamentPlayers, filteredCompletedMatches, eventResults, tournaments, userId]);

  const placementHistory = useMemo(() => {
    const tournamentsById = new Map(tournaments.map((tournament) => [tournament.id, tournament]));
    const playerCounts = new Map<string, number>();
    for (const player of allTournamentPlayers) {
      playerCounts.set(player.tournament_id, (playerCounts.get(player.tournament_id) || 0) + 1);
    }
    return tournamentSummary.placements
      .map((row) => ({
        ...row,
        tournament: tournamentsById.get(row.tournamentId),
        fieldSize: playerCounts.get(row.tournamentId) || 0,
      }))
      .sort((a, b) => {
        const aDate = a.tournament?.event_date || a.tournament?.started_at || '';
        const bDate = b.tournament?.event_date || b.tournament?.started_at || '';
        return bDate.localeCompare(aDate);
      });
  }, [tournamentSummary.placements, tournaments, allTournamentPlayers]);

  const streaks = useMemo(() => {
    const ordered = activeMatchSummaries;

    let currentType: 'W' | 'L' | 'T' | null = null;
    let currentCount = 0;
    let bestWinStreak = 0;
    let tempWinStreak = 0;

    for (const row of ordered) {
      const result = row.result;
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
      const result = row.result;
      if (result === 'W') {
        tempWinStreak += 1;
        bestWinStreak = Math.max(bestWinStreak, tempWinStreak);
      } else {
        tempWinStreak = 0;
      }
    }

    const recentForm = ordered.slice(0, 5).map((row) => row.result).join(' ');

    return {
      currentStreakLabel: currentType && currentCount > 0 ? `${currentType}${currentCount}` : '-',
      bestWinStreak,
      recentForm: recentForm || '-',
    };
  }, [activeMatchSummaries]);

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

  const activeAggregates = formatTab === 'singles' ? singlesAggregates : formatTab === 'doubles' ? doublesAggregates : overallAggregates;

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
        Profile
      </div>

      <h1
        style={{
          margin: 0,
          fontSize: 28,
          fontWeight: 950,
          letterSpacing: '-0.04em',
        }}
      >
        My Stats
      </h1>

      <p className="muted" style={{ marginTop: 8 }}>
        Track your wins, performance, and progress over time.
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
      📊
    </div>
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
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-title">Performance</div>
            <div className="two-col">
              <SimpleStatCard label="Win Rate" value={`${activeAggregates.winPct}%`} sub={`${activeAggregates.matches} matches`} />
              <SimpleStatCard label="Wins" value={activeAggregates.wins} sub={`${activeAggregates.losses} losses`} />
              <SimpleStatCard label="Points For" value={activeAggregates.pointsFor} sub={`Avg ${activeAggregates.avgPoints}/match`} />
              <SimpleStatCard label="Point Diff" value={activeAggregates.pointDiff} sub="Total" />
            </div>
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-title">Achievements</div>
            <div className="two-col">
              <SimpleStatCard label="Best Finish" value={tournamentSummary.bestFinish} sub="Tournament place" />
              <SimpleStatCard label="Podiums" value={tournamentSummary.podiums} sub="Top 3 finishes" />
              <SimpleStatCard label="Tournament Wins" value={tournamentSummary.tournamentWins} sub="1st place finishes" />
              <SimpleStatCard label="Average Finish" value={tournamentSummary.averageFinish} sub="Across placed events" />
              <SimpleStatCard label="Best Win Streak" value={streaks.bestWinStreak} sub={formatTab === 'overall' ? 'All formats' : formatTab === 'singles' ? 'Singles' : 'Doubles'} />
              <SimpleStatCard
                label="Best Partner"
                value={bestPartner?.name || '—'}
                sub={bestPartner
                  ? `${bestPartner.winPct}% • ${bestPartner.wins}-${bestPartner.losses} over ${bestPartner.matches} matches`
                  : 'Play 3 matches together to qualify'}
              />
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
                  <strong>{activeAggregates.tournamentsPlayed}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-title">Tournament Results</div>
            <div className="card-subtitle">Your most recent recorded finishes.</div>
            {!placementHistory.length ? (
              <div className="muted">No completed tournament placements in this time range yet.</div>
            ) : (
              <div className="grid">
                {placementHistory.slice(0, 5).map((row) => (
                  <div key={row.tournamentId} className="list-item">
                    <div className="row-between">
                      <div>
                        <div style={{ fontWeight: 800 }}>{row.tournament?.title || 'Tournament'}</div>
                        <div className="muted">
                          {row.tournament?.tournament_mode === 'cream_of_the_crop'
                            ? 'Cream of the Crop'
                            : row.tournament?.format === 'singles' ? 'Singles' : 'Doubles'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 20, fontWeight: 900 }}>{ordinal(row.placement)}</div>
                        <div className="muted">of {row.fieldSize || '-'}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {formatTab !== 'singles' ? (
            <PeopleBreakdownCard
              kind="partner"
              title="Partners"
              emptyMessage="No linked partners in this time range yet. Partners appear after they claim their DinkDraw player slot."
              rows={partnerSummary}
              matches={activeMatchSummaries}
              tournaments={tournaments}
            />
          ) : null}

          <PeopleBreakdownCard
            kind="opponent"
            title="Opponents"
            emptyMessage="No linked opponents in this time range yet. Opponents appear after they claim their DinkDraw player slot."
            rows={opponentSummary}
            matches={activeMatchSummaries}
            tournaments={tournaments}
          />

          <div className="card">
            <div className="card-title">Recent Matches</div>
            {loading ? (
              <div className="muted">Loading recent matches...</div>
            ) : !activeMatchSummaries.length ? (
              <div className="muted">No matches in this time range yet.</div>
            ) : (
              <div className="grid">
                {activeMatchSummaries.slice(0, 5).map((match) => (
                  <div key={match.matchId} className="list-item">
                    <div className="row-between">
                      <div>
                        <div style={{ fontWeight: 800 }}>
                          {match.result === 'W' ? 'Win' : match.result === 'L' ? 'Loss' : 'Tie'}
                        </div>
                        <div className="muted">{new Date(match.playedAt).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })}</div>
                        <div className="muted" style={{ marginTop: 2 }}>
                          {match.format === 'singles' ? 'Singles' : 'Doubles'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 800 }}>{match.pointsFor}-{match.pointsAgainst}</div>
                        <div className="muted">
                          {match.pointsFor - match.pointsAgainst >= 0
                            ? `+${match.pointsFor - match.pointsAgainst}`
                            : match.pointsFor - match.pointsAgainst}
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

type PeopleSummaryRow = {
  userId: string;
  name: string;
  matches: number;
  wins: number;
  losses: number;
  ties: number;
  winPct: number;
  pointDiff: number;
  lastPlayedAt: string;
};

function PeopleBreakdownCard({
  kind,
  title,
  emptyMessage,
  rows,
  matches,
  tournaments,
}: {
  kind: 'partner' | 'opponent';
  title: string;
  emptyMessage: string;
  rows: PeopleSummaryRow[];
  matches: MatchSummary[];
  tournaments: TournamentRow[];
}) {
  const [sortMode, setSortMode] = useState<'played' | 'best' | 'lowest'>('played');
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  const sortedRows = useMemo(() => {
    const eligibleRows = sortMode === 'played' ? rows : rows.filter((row) => row.matches >= 3);
    return [...eligibleRows].sort((a, b) => {
      if (sortMode === 'best') {
        return b.winPct - a.winPct || b.matches - a.matches || b.pointDiff - a.pointDiff || a.name.localeCompare(b.name);
      }
      if (sortMode === 'lowest') {
        return a.winPct - b.winPct || b.matches - a.matches || a.pointDiff - b.pointDiff || a.name.localeCompare(b.name);
      }
      return b.matches - a.matches || b.winPct - a.winPct || b.pointDiff - a.pointDiff || a.name.localeCompare(b.name);
    });
  }, [rows, sortMode]);

  const tournamentsById = useMemo(
    () => new Map(tournaments.map((tournament) => [tournament.id, tournament])),
    [tournaments]
  );

  function matchesForPerson(userId: string) {
    return matches
      .filter((match) => kind === 'partner'
        ? match.partnerUserId === userId
        : match.opponentUserIds.includes(userId))
      .slice(0, 5);
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-title">{title}</div>
      <div className="card-subtitle">Match-level record, win rate, and point differential.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 12 }}>
        <FilterButton label="Most Played" active={sortMode === 'played'} onClick={() => setSortMode('played')} />
        <FilterButton label="Best Record" active={sortMode === 'best'} onClick={() => setSortMode('best')} />
        <FilterButton
          label={kind === 'partner' ? 'Lowest Record' : 'Toughest'}
          active={sortMode === 'lowest'}
          onClick={() => setSortMode('lowest')}
        />
      </div>
      {!rows.length ? (
        <div className="muted">{emptyMessage}</div>
      ) : !sortedRows.length ? (
        <div className="muted">Play at least 3 matches with the same {kind} to compare records.</div>
      ) : (
        <div className="grid">
          {sortedRows.slice(0, 5).map((row) => {
            const isExpanded = expandedUserId === row.userId;
            const personMatches = isExpanded ? matchesForPerson(row.userId) : [];
            return (
              <div key={row.userId} className="list-item" style={{ padding: 0, overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => setExpandedUserId((current) => current === row.userId ? null : row.userId)}
                  aria-expanded={isExpanded}
                  style={{
                    width: '100%',
                    padding: 16,
                    border: 0,
                    background: 'transparent',
                    color: 'inherit',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div className="row-between" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 800 }}>{row.name} <span className="muted" aria-hidden="true">{isExpanded ? '▴' : '▾'}</span></div>
                      <div className="muted">
                        {row.matches} {row.matches === 1 ? 'match' : 'matches'} • {row.wins}-{row.losses}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 900 }}>{row.winPct}%</div>
                      <div className="muted">{row.pointDiff >= 0 ? '+' : ''}{row.pointDiff} diff</div>
                    </div>
                  </div>
                </button>
                {isExpanded ? (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', padding: '4px 16px 14px' }}>
                    <div className="muted" style={{ margin: '10px 0 8px', fontWeight: 800 }}>Recent matches</div>
                    <div className="grid" style={{ gap: 6 }}>
                      {personMatches.map((match) => {
                        const tournament = tournamentsById.get(match.tournamentId);
                        const pointDiff = match.pointsFor - match.pointsAgainst;
                        return (
                          <div key={match.matchId} className="row-between" style={{ padding: '9px 0', gap: 12 }}>
                            <div>
                              <div style={{ fontWeight: 800 }}>
                                {match.result === 'W' ? 'Win' : match.result === 'L' ? 'Loss' : 'Tie'} · {match.pointsFor}-{match.pointsAgainst}
                              </div>
                              <div className="muted">
                                {tournament?.title || 'Tournament'} · {new Date(match.playedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </div>
                            </div>
                            <strong style={{ color: pointDiff >= 0 ? '#8ee6a8' : '#ff9c9c' }}>
                              {pointDiff >= 0 ? '+' : ''}{pointDiff}
                            </strong>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ordinal(value: number) {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  if (value % 10 === 1) return `${value}st`;
  if (value % 10 === 2) return `${value}nd`;
  if (value % 10 === 3) return `${value}rd`;
  return `${value}th`;
}
