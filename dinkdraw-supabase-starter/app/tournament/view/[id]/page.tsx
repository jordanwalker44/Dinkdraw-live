'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '../../../../lib/supabase-browser';
import { TopNav } from '../../../../components/TopNav';

export const dynamic = 'force-dynamic';

type Tournament = {
  id: string;
  title: string;
  join_code: string;
  organizer_user_id: string;
  organizer_name: string | null;
  event_date: string | null;
  event_time: string | null;
  location: string | null;
  player_count: number;
  courts: number;
  rounds: number;
  games_to: number;
  status: string;
  started_at: string | null;
  format: string;
  match_format: string;
};

type PlayerSlot = {
  id: string;
  tournament_id: string;
  slot_number: number;
  display_name: string | null;
  claimed_by_user_id: string | null;
};

type Match = {
  id: string;
  round_number: number;
  court_number: number | null;
  team_a_player_1_id: string | null;
  team_a_player_2_id: string | null;
  team_b_player_1_id: string | null;
  team_b_player_2_id: string | null;
  team_a_score: number | null;
  team_b_score: number | null;
  game_1_a: number | null;
  game_1_b: number | null;
  game_2_a: number | null;
  game_2_b: number | null;
  game_3_a: number | null;
  game_3_b: number | null;
  is_bye: boolean;
  is_complete: boolean;
};

type StandingRow = {
  playerId: string;
  name: string;
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
};

function getSeriesWins(match: Match): { aWins: number; bWins: number } {
  let aWins = 0;
  let bWins = 0;

  if (match.game_1_a !== null && match.game_1_b !== null) {
    if (match.game_1_a > match.game_1_b) aWins += 1;
    else if (match.game_1_b > match.game_1_a) bWins += 1;
  }

  if (match.game_2_a !== null && match.game_2_b !== null) {
    if (match.game_2_a > match.game_2_b) aWins += 1;
    else if (match.game_2_b > match.game_2_a) bWins += 1;
  }

  if (match.game_3_a !== null && match.game_3_b !== null) {
    if (match.game_3_a > match.game_3_b) aWins += 1;
    else if (match.game_3_b > match.game_3_a) bWins += 1;
  }

  return { aWins, bWins };
}

function getSeriesScore(match: Match): { aScore: number; bScore: number } {
  let aScore = 0;
  let bScore = 0;

  if (match.game_1_a !== null) aScore += match.game_1_a;
  if (match.game_1_b !== null) bScore += match.game_1_b;
  if (match.game_2_a !== null) aScore += match.game_2_a;
  if (match.game_2_b !== null) bScore += match.game_2_b;
  if (match.game_3_a !== null) aScore += match.game_3_a;
  if (match.game_3_b !== null) bScore += match.game_3_b;

  return { aScore, bScore };
}

function computeStandings(
  playerSlots: PlayerSlot[],
  matches: Match[],
  isSingles: boolean,
  isBestOf3: boolean
): StandingRow[] {
  const rows = new Map<string, StandingRow>();

  for (const slot of playerSlots) {
    rows.set(slot.id, {
      playerId: slot.id,
      name: slot.display_name || `Player ${slot.slot_number}`,
      played: 0,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDiff: 0,
    });
  }

  for (const match of matches) {
    if (
      match.is_bye ||
      !match.is_complete ||
      match.team_a_player_1_id === null ||
      match.team_b_player_1_id === null
    ) {
      continue;
    }

    let aScore: number;
    let bScore: number;

    if (isBestOf3) {
      const series = getSeriesScore(match);
      aScore = series.aScore;
      bScore = series.bScore;
    } else {
      if (match.team_a_score === null || match.team_b_score === null) continue;
      aScore = match.team_a_score;
      bScore = match.team_b_score;
    }

    const aIds = isSingles
      ? [match.team_a_player_1_id]
      : ([match.team_a_player_1_id, match.team_a_player_2_id].filter(Boolean) as string[]);

    const bIds = isSingles
      ? [match.team_b_player_1_id]
      : ([match.team_b_player_1_id, match.team_b_player_2_id].filter(Boolean) as string[]);

    for (const id of [...aIds, ...bIds]) {
      const row = rows.get(id);
      if (row) row.played += 1;
    }

    for (const id of aIds) {
      const row = rows.get(id);
      if (!row) continue;
      row.pointsFor += aScore;
      row.pointsAgainst += bScore;
    }

    for (const id of bIds) {
      const row = rows.get(id);
      if (!row) continue;
      row.pointsFor += bScore;
      row.pointsAgainst += aScore;
    }

    if (isBestOf3) {
      const { aWins, bWins } = getSeriesWins(match);

      if (aWins > bWins) {
        aIds.forEach((id) => {
          const row = rows.get(id);
          if (row) row.wins += 1;
        });
        bIds.forEach((id) => {
          const row = rows.get(id);
          if (row) row.losses += 1;
        });
      } else if (bWins > aWins) {
        bIds.forEach((id) => {
          const row = rows.get(id);
          if (row) row.wins += 1;
        });
        aIds.forEach((id) => {
          const row = rows.get(id);
          if (row) row.losses += 1;
        });
      }
    } else {
      if (aScore > bScore) {
        aIds.forEach((id) => {
          const row = rows.get(id);
          if (row) row.wins += 1;
        });
        bIds.forEach((id) => {
          const row = rows.get(id);
          if (row) row.losses += 1;
        });
      } else if (bScore > aScore) {
        bIds.forEach((id) => {
          const row = rows.get(id);
          if (row) row.wins += 1;
        });
        aIds.forEach((id) => {
          const row = rows.get(id);
          if (row) row.losses += 1;
        });
      }
    }
  }

  return Array.from(rows.values())
    .map((row) => ({
      ...row,
      pointDiff: row.pointsFor - row.pointsAgainst,
    }))
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
      if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
      return a.name.localeCompare(b.name);
    });
}

export default function PublicTournamentViewPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [playerSlots, setPlayerSlots] = useState<PlayerSlot[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRound, setSelectedRound] = useState(1);
  const [isLive, setIsLive] = useState(false);

  const isSingles = tournament?.format === 'singles';
  const isBestOf3 = tournament?.match_format === 'best_of_3';
  const isStarted = tournament?.status === 'started';
  const isCompleted = tournament?.status === 'completed';

  const playersById = useMemo(
    () => Object.fromEntries(playerSlots.map((slot) => [slot.id, slot])),
    [playerSlots]
  );

  const roundsAvailable = useMemo(() => {
    const roundSet = new Set<number>();
    matches.forEach((m) => roundSet.add(m.round_number));
    if (!roundSet.size && tournament?.rounds) {
      for (let i = 1; i <= tournament.rounds; i += 1) roundSet.add(i);
    }
    return Array.from(roundSet).sort((a, b) => a - b);
  }, [matches, tournament]);

  const currentRound = useMemo(() => {
    if (!matches.length) return roundsAvailable[0] || 1;

    for (const round of roundsAvailable) {
      const roundMatches = matches.filter(
        (m) => m.round_number === round && !m.is_bye
      );
      if (!roundMatches.length) continue;
      if (!roundMatches.every((m) => m.is_complete)) return round;
    }

    return roundsAvailable[roundsAvailable.length - 1] || 1;
  }, [matches, roundsAvailable]);

  const finalRound = useMemo(
    () => roundsAvailable[roundsAvailable.length - 1] || 1,
    [roundsAvailable]
  );

  const completedMatchCount = useMemo(
    () => matches.filter((m) => !m.is_bye && m.is_complete).length,
    [matches]
  );

  const totalPlayableMatchCount = useMemo(
    () => matches.filter((m) => !m.is_bye).length,
    [matches]
  );

  const roundStatusByRound = useMemo(() => {
    const statusMap = new Map<number, 'current' | 'complete' | 'upcoming'>();

    for (const round of roundsAvailable) {
      const roundMatches = matches.filter(
        (m) => m.round_number === round && !m.is_bye
      );

      if (!roundMatches.length) {
        statusMap.set(
          round,
          round === currentRound
            ? 'current'
            : round < currentRound
            ? 'complete'
            : 'upcoming'
        );
        continue;
      }

      if (roundMatches.every((m) => m.is_complete)) statusMap.set(round, 'complete');
      else if (round === currentRound) statusMap.set(round, 'current');
      else if (round < currentRound) statusMap.set(round, 'complete');
      else statusMap.set(round, 'upcoming');
    }

    return statusMap;
  }, [matches, roundsAvailable, currentRound]);

  const matchesForSelectedRound = useMemo(
    () => matches.filter((m) => m.round_number === selectedRound && !m.is_bye),
    [matches, selectedRound]
  );

  const byesForSelectedRound = useMemo(
    () => matches.filter((m) => m.round_number === selectedRound && m.is_bye),
    [matches, selectedRound]
  );

  const currentRoundMatches = useMemo(
    () => matches.filter((m) => m.round_number === currentRound && !m.is_bye),
    [matches, currentRound]
  );

  const currentMatch = useMemo(
    () => currentRoundMatches.find((m) => !m.is_complete) || null,
    [currentRoundMatches]
  );
  
  const upcomingMatch = useMemo(
  () =>
    currentMatch
      ? matches.find(
          (m) =>
            !m.is_complete &&
            !m.is_bye &&
            m.id !== currentMatch.id &&
            (
              m.round_number > currentMatch.round_number ||
              (
                m.round_number === currentMatch.round_number &&
                (m.court_number ?? 0) > (currentMatch.court_number ?? 0)
              )
            )
        ) || null
      : null,
  [matches, currentMatch]
);

  const currentRoundComplete = useMemo(
    () =>
      currentRoundMatches.length > 0 &&
      currentRoundMatches.every((m) => m.is_complete),
    [currentRoundMatches]
  );

  const standings = useMemo(
    () => computeStandings(playerSlots, matches, !!isSingles, !!isBestOf3),
    [playerSlots, matches, isSingles, isBestOf3]
  );

  function renderPlayerName(id: string | null) {
    if (!id) return '-';
    return playersById[id]?.display_name || 'Player';
  }

  function renderTeam(a: string | null, b: string | null) {
    if (isSingles) return renderPlayerName(a);
    return `${renderPlayerName(a)} & ${renderPlayerName(b)}`;
  }

  function renderMatchLabel(match: Match) {
    return `${renderTeam(
      match.team_a_player_1_id,
      match.team_a_player_2_id
    )} vs ${renderTeam(match.team_b_player_1_id, match.team_b_player_2_id)}`;
  }

  function getInitials(playerId1?: string | null, playerId2?: string | null) {
  const getInitialsFromName = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return '?';

    const parts = trimmed.split(/\s+/);

    // First + last name → use first letter of each
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }

    // Single name → use first 2 letters
    return parts[0].slice(0, 2).toUpperCase();
  };

  const getPlayerInitials = (id?: string | null) => {
    if (!id) return '?';

    const player = playerSlots.find((p) => p.id === id);
    return getInitialsFromName(player?.display_name || '');
  };

  if (isSingles) {
    return getPlayerInitials(playerId1);
  }

  const a = getPlayerInitials(playerId1);
  const b = getPlayerInitials(playerId2);

  return `${a} & ${b}`;
}

  function getWinnerStyle(team: 'a' | 'b', match: Match) {
    if (isBestOf3) {
      if (!match.is_complete) return {};
      const { aWins, bWins } = getSeriesWins(match);
      const isWinner =
        (team === 'a' && aWins > bWins) || (team === 'b' && bWins > aWins);
      return isWinner ? { color: '#FFCB05' } : {};
    }

    if (match.team_a_score === null || match.team_b_score === null) return {};

    const aWon = match.team_a_score > match.team_b_score;
    const bWon = match.team_b_score > match.team_a_score;
    const isWinner = (team === 'a' && aWon) || (team === 'b' && bWon);
    return isWinner ? { color: '#FFCB05' } : {};
  }

  function renderBestOf3Match(match: Match) {
    const { aWins, bWins } = getSeriesWins(match);
    const teamAName = renderTeam(
      match.team_a_player_1_id,
      match.team_a_player_2_id
    );
    const teamBName = renderTeam(
      match.team_b_player_1_id,
      match.team_b_player_2_id
    );
    const isCurrentMatch =
      !isCompleted &&
      match.round_number === currentRound &&
      currentMatch?.id === match.id;

    return (
      <div
        key={match.id}
        className="list-item"
        style={
          isCurrentMatch
            ? {
                borderColor: 'rgba(255,203,5,.55)',
                boxShadow: '0 0 0 1px rgba(255,203,5,.25) inset',
              }
            : undefined
        }
      >
        <div className="row-between" style={{ marginBottom: 12 }}>
          <strong>Court {match.court_number ?? '-'}</strong>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {isCurrentMatch ? <span className="tag">Live</span> : null}
            <span style={{ fontSize: 13, fontWeight: 800, color: '#FFCB05' }}>
              {aWins}-{bWins}
            </span>
            <span className={match.is_complete ? 'tag green' : 'tag'}>
              {match.is_complete ? 'Complete' : 'In Progress'}
            </span>
          </div>
        </div>

        <div className="row-between" style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 800, ...getWinnerStyle('a', match) }}>
            {teamAName}
          </div>
          <div style={{ fontWeight: 800, ...getWinnerStyle('b', match) }}>
            {teamBName}
          </div>
        </div>

        <div className="grid" style={{ gap: 8 }}>
          <div className="list-item" style={{ padding: 10 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
              Game 1
            </div>
            <div className="row-between">
              <strong>{match.game_1_a ?? '-'}</strong>
              <strong>{match.game_1_b ?? '-'}</strong>
            </div>
          </div>

          <div className="list-item" style={{ padding: 10 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
              Game 2
            </div>
            <div className="row-between">
              <strong>{match.game_2_a ?? '-'}</strong>
              <strong>{match.game_2_b ?? '-'}</strong>
            </div>
          </div>

          {match.game_3_a !== null || match.game_3_b !== null ? (
            <div className="list-item" style={{ padding: 10 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                Game 3
              </div>
              <div className="row-between">
                <strong>{match.game_3_a ?? '-'}</strong>
                <strong>{match.game_3_b ?? '-'}</strong>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  async function loadTournamentData() {
    const [tournamentResult, playersResult, matchesResult] = await Promise.all([
      supabase.from('tournaments').select('*').eq('id', params.id).maybeSingle(),
      supabase
        .from('tournament_players')
        .select('*')
        .eq('tournament_id', params.id)
        .order('slot_number', { ascending: true }),
      supabase
        .from('matches')
        .select('*')
        .eq('tournament_id', params.id)
        .order('round_number', { ascending: true })
        .order('court_number', { ascending: true }),
    ]);

    setTournament(tournamentResult.data || null);
    setPlayerSlots(playersResult.data || []);
    setMatches(matchesResult.data || []);
  }

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      await loadTournamentData();
      setIsLoading(false);
    }

    load();
  }, [params.id, supabase]);

  useEffect(() => {
    const channel = supabase
  .channel(`public-tournament-live-${params.id}`)
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'matches',
      filter: `tournament_id=eq.${params.id}`,
    },
    () => {
      void loadTournamentData();
    }
  )
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'tournament_players',
      filter: `tournament_id=eq.${params.id}`,
    },
    () => {
      void loadTournamentData();
    }
  )
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'tournaments',
      filter: `id=eq.${params.id}`,
    },
    () => {
      void loadTournamentData();
    }
  )
  .subscribe((status) => {
  setIsLive(status === 'SUBSCRIBED');
});

return () => {
  void supabase.removeChannel(channel);
};
  }, [params.id, supabase]);

  useEffect(() => {
    if (!roundsAvailable.length) return;

    setSelectedRound((prev) => {
      if (!roundsAvailable.includes(prev)) {
        return isCompleted ? finalRound : currentRound;
      }
      return prev;
    });
  }, [roundsAvailable, currentRound, finalRound, isCompleted]);

  if (isLoading) {
    return (
      <main className="page-shell">
        <div className="hero">
          <div className="hero-inner">
            <img
              src="/dinkdraw-logo.png"
              alt="DinkDraw logo"
              className="hero-logo"
            />
            <h1 className="hero-title">Loading tournament...</h1>
          </div>
        </div>
      </main>
    );
  }

  if (!tournament) {
    return (
      <main className="page-shell">
        <div className="hero">
          <div className="hero-inner">
            <img
              src="/dinkdraw-logo.png"
              alt="DinkDraw logo"
              className="hero-logo"
            />
            <h1 className="hero-title">Tournament Not Found</h1>
            <p className="hero-subtitle">
              This public tournament link may be invalid.
            </p>
          </div>
        </div>

        <TopNav />

        <div className="card">
          <div className="card-title">Back to DinkDraw</div>
          <Link href="/" className="button primary">
            Go Home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <div className="hero">
        <div className="hero-inner">
          <img
            src="/dinkdraw-logo.png"
            alt="DinkDraw logo"
            className="hero-logo"
          />
          <h1 className="hero-title">{tournament.title || 'Tournament'}</h1>
          <p className="hero-subtitle">
            {isCompleted
              ? 'Tournament complete'
              : isStarted
              ? `Live now • Round ${currentRound}`
              : 'Waiting to start'}
          </p>
        </div>
      </div>

      <TopNav />

      <div className="card" style={{ marginBottom: 14 }}>
  <div className="row-between" style={{ alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
  <span
    className={
      isCompleted
        ? 'tag'
        : isStarted
        ? 'tag green'
        : 'tag'
    }
  >
    {isCompleted ? 'Complete' : isStarted ? 'Live' : 'Waiting'}
  </span>

  <span className="tag">{isSingles ? 'Singles' : 'Doubles'}</span>
  <span className="tag">{isBestOf3 ? 'Best of 3' : 'Single Game'}</span>

  {!isLive && isStarted ? (
  <span className="tag">Connecting</span>
) : null}
</div>

    <div className="muted" style={{ fontSize: 13 }}>
      {tournament.location
        ? `${tournament.location}${tournament.event_time ? ` • ${tournament.event_time}` : ''}`
        : tournament.event_time || tournament.event_date || ''}
    </div>
  </div>
</div>

        <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-title">Rounds</div>
        <div className="card-subtitle">
          {isCompleted
            ? 'Tournament complete. Scores are final.'
            : isStarted
            ? `Current live round: ${currentRound}`
            : 'Round schedule will appear here after the tournament starts.'}
        </div>

        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-title">Current Round</div>

          {!isStarted ? (
            <div className="muted">Tournament has not started yet.</div>
          ) : isCompleted ? (
            <div className="muted">
              Tournament is complete. Final results are locked.
            </div>
          ) : currentRoundComplete ? (
            <div>
              <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>
                Round {currentRound} is complete
              </div>
              <div className="muted">
                All matches in the current round have been finished.
              </div>
            </div>
          ) : currentMatch ? (
            <div>
    <div
      style={{
        textAlign: 'center',
        marginBottom: 14,
        padding: '10px 12px 4px',
      }}
    >
      <div
        className="muted"
        style={{
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        Round {currentRound}
      </div>

      <div
        style={{
          fontSize: 30,
          fontWeight: 900,
          lineHeight: 1,
          marginBottom: 8,
          color: '#FFCB05',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        Live Match
      </div>

      <div
        style={{
          fontSize: 18,
          fontWeight: 800,
          marginBottom: 10,
        }}
      >
        Court {currentMatch.court_number ?? '-'}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <span className="tag green">Live</span>
      </div>
    </div>

    <div
  className="list-item"
  style={{
    padding: 16,
    textAlign: 'center',
  }}
>
  <div
    style={{
      fontWeight: 800,
      fontSize: 16,
      marginBottom: 10,
      textAlign: 'center',
      opacity: 0.85,
    }}
  >
    {renderMatchLabel(currentMatch)}
  </div>

  <div
    style={{
      display: 'grid',
      gridTemplateColumns: '1fr auto 1fr',
      alignItems: 'center',
      gap: 12,
    }}
  >
    <div
      style={{
        textAlign: 'center',
        transition: 'all 160ms ease',
        ...getWinnerStyle('a', currentMatch),
      }}
    >
      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
  {getInitials(currentMatch.team_a_player_1_id, currentMatch.team_a_player_2_id)}
</div>
      <div style={{ fontSize: 34, fontWeight: 900 }}>
        {isBestOf3
          ? getSeriesScore(currentMatch).aScore
          : currentMatch.team_a_score ?? '-'}
      </div>
    </div>

    <div
      style={{
        fontSize: 18,
        fontWeight: 900,
        opacity: 0.7,
      }}
    >
      —
    </div>

    <div
      style={{
        textAlign: 'center',
        transition: 'all 160ms ease',
        ...getWinnerStyle('b', currentMatch),
      }}
    >
      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
  {getInitials(currentMatch.team_b_player_1_id, currentMatch.team_b_player_2_id)}
</div>
      <div style={{ fontSize: 34, fontWeight: 900 }}>
        {isBestOf3
          ? getSeriesScore(currentMatch).bScore
          : currentMatch.team_b_score ?? '-'}
      </div>
    </div>
  </div>
</div>

{upcomingMatch ? (
  <div
    className="list-item"
    style={{
      padding: 14,
      marginTop: 10,
      opacity: 0.85,
    }}
  >
    <div
      style={{
        fontSize: 12,
        fontWeight: 800,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        marginBottom: 6,
      }}
    >
      Up Next
    </div>

    <div style={{ fontWeight: 800, marginBottom: 6 }}>
      {renderMatchLabel(upcomingMatch)}
    </div>

    <div className="muted" style={{ fontSize: 13 }}>
      Round {upcomingMatch.round_number} • Court {upcomingMatch.court_number ?? '-'}
    </div>
  </div>
) : null}              

    {selectedRound !== currentRound ? (
      <button
        type="button"
        className="button secondary"
        style={{ marginTop: 10 }}
        onClick={() => setSelectedRound(currentRound)}
      >
        Jump to Current Round
      </button>
    ) : null}
  </div>
) : (
            <div className="muted">Waiting for the next match.</div>
          )}
        </div>

        <div className="grid" style={{ marginTop: 14, marginBottom: 14 }}>
          {roundsAvailable.map((round) => {
            const status = roundStatusByRound.get(round);
            const isSelected = selectedRound === round;

            return (
              <button
                key={round}
                type="button"
                className={`button ${isSelected ? 'primary' : 'secondary'}`}
                onClick={() => setSelectedRound(round)}
              >
                {status === 'complete'
                  ? `✓ Round ${round}`
                  : status === 'current'
                  ? `• Round ${round}`
                  : `Round ${round}`}
              </button>
            );
          })}
        </div>

        {!matchesForSelectedRound.length && !byesForSelectedRound.length ? (
          <div className="muted">No matches in this round yet.</div>
        ) : (
          <div className="grid">
            {matchesForSelectedRound.map((match) => {
              const isCurrentMatch =
                !isCompleted &&
                match.round_number === currentRound &&
                currentMatch?.id === match.id;

              if (isBestOf3) return renderBestOf3Match(match);

              return (
                <div
                  key={match.id}
                  className="list-item"
                  style={
                    isCurrentMatch
                      ? {
                          borderColor: 'rgba(255,203,5,.55)',
                          boxShadow: '0 0 0 1px rgba(255,203,5,.25) inset',
                        }
                      : undefined
                  }
                >
                  <div className="row-between" style={{ marginBottom: 12 }}>
                    <strong>Court {match.court_number ?? '-'}</strong>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {isCurrentMatch ? <span className="tag">Live</span> : null}
                      <span className={match.is_complete ? 'tag green' : 'tag'}>
                        {match.is_complete ? 'Complete' : 'In Progress'}
                      </span>
                    </div>
                  </div>

                  <div className="grid" style={{ marginBottom: 12 }}>
                    <div className="list-item" style={{ padding: 12 }}>
                      <div
                        style={{
                          fontWeight: 800,
                          marginBottom: 8,
                          ...getWinnerStyle('a', match),
                        }}
                      >
                        {renderTeam(
                          match.team_a_player_1_id,
                          match.team_a_player_2_id
                        )}
                      </div>
                      <div
                        style={{
                          textAlign: 'center',
                          fontSize: 24,
                          fontWeight: 800,
                        }}
                      >
                        {match.team_a_score ?? '-'}
                      </div>
                    </div>

                    <div className="list-item" style={{ padding: 12 }}>
                      <div
                        style={{
                          fontWeight: 800,
                          marginBottom: 8,
                          ...getWinnerStyle('b', match),
                        }}
                      >
                        {renderTeam(
                          match.team_b_player_1_id,
                          match.team_b_player_2_id
                        )}
                      </div>
                      <div
                        style={{
                          textAlign: 'center',
                          fontSize: 24,
                          fontWeight: 800,
                        }}
                      >
                        {match.team_b_score ?? '-'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {byesForSelectedRound.length ? (
              <div className="list-item">
                <div style={{ fontWeight: 800, marginBottom: 8 }}>
                  Byes This Round
                </div>
                <div className="grid">
                  {byesForSelectedRound.map((bye) => (
                    <div key={bye.id} className="list-item" style={{ padding: 10 }}>
                      {renderPlayerName(bye.team_a_player_1_id)}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">
          {isCompleted ? '🏆 Final Results' : 'Standings'}
        </div>
        <div className="card-subtitle">
          {isCompleted
            ? 'Tournament complete. Final results are locked.'
            : 'Ranked by wins, then point differential, then points scored.'}
        </div>

        {!standings.length ? (
          <div className="muted">Standings will appear once matches are scored.</div>
        ) : (
          <div className="grid">
            {standings.map((row, index) => (
              <div
                key={row.playerId}
                className="list-item"
                style={
                  index === 0 && standings.length > 1
                    ? {
                        borderColor: 'rgba(255,203,5,.55)',
                        boxShadow: '0 0 0 1px rgba(255,203,5,.25) inset',
                      }
                    : undefined
                }
              >
                <div className="row-between" style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 800 }}>
                    #{index + 1} {row.name}
                  </div>
                  {index === 0 && standings.length > 1 ? (
                    <span className="tag green">Leader</span>
                  ) : null}
                </div>

                <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  <div className="list-item" style={{ padding: 10, textAlign: 'center' }}>
                    <div className="muted" style={{ fontSize: 12 }}>Played</div>
                    <div style={{ fontWeight: 800 }}>{row.played}</div>
                  </div>
                  <div className="list-item" style={{ padding: 10, textAlign: 'center' }}>
                    <div className="muted" style={{ fontSize: 12 }}>Wins</div>
                    <div style={{ fontWeight: 800 }}>{row.wins}</div>
                  </div>
                  <div className="list-item" style={{ padding: 10, textAlign: 'center' }}>
                    <div className="muted" style={{ fontSize: 12 }}>Losses</div>
                    <div style={{ fontWeight: 800 }}>{row.losses}</div>
                  </div>
                  <div className="list-item" style={{ padding: 10, textAlign: 'center' }}>
                    <div className="muted" style={{ fontSize: 12 }}>Diff</div>
                    <div style={{ fontWeight: 800 }}>
                      {row.pointDiff > 0 ? `+${row.pointDiff}` : row.pointDiff}
                    </div>
                  </div>
                </div>

                <div className="row-between" style={{ marginTop: 10 }}>
                  <span className="muted">Points For</span>
                  <strong>{row.pointsFor}</strong>
                </div>
                <div className="row-between" style={{ marginTop: 6 }}>
                  <span className="muted">Points Against</span>
                  <strong>{row.pointsAgainst}</strong>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
