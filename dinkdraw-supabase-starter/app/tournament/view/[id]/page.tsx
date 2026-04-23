'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '../../../../lib/supabase-browser';

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
  court_label: string | null;
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

    const aIds = isSingles
      ? [match.team_a_player_1_id]
      : ([match.team_a_player_1_id, match.team_a_player_2_id].filter(Boolean) as string[]);

    const bIds = isSingles
      ? [match.team_b_player_1_id]
      : ([match.team_b_player_1_id, match.team_b_player_2_id].filter(Boolean) as string[]);

    if (isBestOf3) {
      const games = [
        [match.game_1_a, match.game_1_b],
        [match.game_2_a, match.game_2_b],
        [match.game_3_a, match.game_3_b],
      ] as const;

      for (const [gA, gB] of games) {
        if (gA === null || gB === null) continue;

        for (const id of [...aIds, ...bIds]) {
          const row = rows.get(id);
          if (row) row.played += 1;
        }

        for (const id of aIds) {
          const row = rows.get(id);
          if (!row) continue;
          row.pointsFor += gA;
          row.pointsAgainst += gB;
        }

        for (const id of bIds) {
          const row = rows.get(id);
          if (!row) continue;
          row.pointsFor += gB;
          row.pointsAgainst += gA;
        }

        if (gA > gB) {
          aIds.forEach((id) => {
            const row = rows.get(id);
            if (row) row.wins += 1;
          });
          bIds.forEach((id) => {
            const row = rows.get(id);
            if (row) row.losses += 1;
          });
        } else if (gB > gA) {
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

      continue;
    }

    if (match.team_a_score === null || match.team_b_score === null) continue;

    const aScore = match.team_a_score;
    const bScore = match.team_b_score;

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
    () =>
      matches
        .filter((m) => m.round_number === selectedRound && !m.is_bye)
        .sort((a, b) => (a.court_number ?? 999) - (b.court_number ?? 999)),
    [matches, selectedRound]
  );

  const byesForSelectedRound = useMemo(
    () => matches.filter((m) => m.round_number === selectedRound && m.is_bye),
    [matches, selectedRound]
  );

  const liveMatchIds = useMemo(
    () =>
      new Set(
        matches
          .filter(
            (m) =>
              !m.is_bye &&
              !m.is_complete &&
              m.round_number === currentRound
          )
          .map((m) => m.id)
      ),
    [matches, currentRound]
  );

  const standings = useMemo(
    () => computeStandings(playerSlots, matches, !!isSingles, !!isBestOf3),
    [playerSlots, matches, isSingles, isBestOf3]
  );

  const eventMeta = useMemo(
    () =>
      [tournament?.event_date, tournament?.event_time, tournament?.location]
        .filter(Boolean)
        .join(' • '),
    [tournament?.event_date, tournament?.event_time, tournament?.location]
  );

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

    void load();
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

  function renderPlayerName(id: string | null) {
    if (!id) return '-';
    return playersById[id]?.display_name || 'Player';
  }

  function renderTeam(a: string | null, b: string | null) {
    if (isSingles) return renderPlayerName(a);
    return `${renderPlayerName(a)} & ${renderPlayerName(b)}`;
  }

  function renderStyledMatchLabel(match: Match) {
    return (
      <div
        style={{
          textAlign: 'center',
          marginBottom: 12,
        }}
      >
        <div
          style={{
            fontWeight: 800,
            lineHeight: 1.25,
          }}
        >
          {renderTeam(match.team_a_player_1_id, match.team_a_player_2_id)}
        </div>

        <div
          style={{
            margin: '8px 0',
            color: '#FFCB05',
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            fontSize: 11,
            opacity: 0.7,
          }}
        >
          VS
        </div>

        <div
          style={{
            fontWeight: 800,
            lineHeight: 1.25,
          }}
        >
          {renderTeam(match.team_b_player_1_id, match.team_b_player_2_id)}
        </div>
      </div>
    );
  }

  function renderCourtLabel(match: Match) {
    return match.court_label?.trim() || `Court ${match.court_number ?? '-'}`;
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

  function getRoundChipLabel(round: number) {
    const status = roundStatusByRound.get(round);
    if (status === 'current') return 'LIVE';
    if (status === 'complete') return 'FINAL';
    return 'ROUND';
  }

  function renderBestOf3Match(match: Match) {
    const { aWins, bWins } = getSeriesWins(match);
    const isCurrentMatch =
      !isCompleted &&
      match.round_number === currentRound &&
      liveMatchIds.has(match.id);

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
        <div
         <div
  className="row-between"
  style={{
    marginBottom: 14,
    alignItems: 'center',
    gap: 12,
    paddingBottom: 10,
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  }}
>
        >
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.6)',
                marginBottom: 4,
              }}
            >
              Court
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 900,
                lineHeight: 1.1,
              }}
            >
              {renderCourtLabel(match)}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
            }}
          >
            {isCurrentMatch ? (
              <span
                className="tag"
                style={{
                  background: 'rgba(255,203,5,0.14)',
                  border: '1px solid rgba(255,203,5,0.35)',
                  color: '#FFCB05',
                  fontWeight: 800,
                }}
              >
                LIVE
              </span>
            ) : null}

            <span
              className={match.is_complete ? 'tag green' : 'tag'}
              style={!match.is_complete ? { fontWeight: 800 } : undefined}
            >
              {match.is_complete ? 'COMPLETE' : 'IN PROGRESS'}
            </span>
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>{renderStyledMatchLabel(match)}</div>

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

        <div
          style={{
            marginTop: 10,
            textAlign: 'center',
            fontSize: 13,
            fontWeight: 800,
            color: '#FFCB05',
          }}
        >
          Series wins: {aWins}-{bWins}
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <main className="page-shell">
        <div className="hero">
          <div className="hero-inner">
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
            <h1 className="hero-title">Tournament Not Found</h1>
            <p className="hero-subtitle">
              This public tournament link may be invalid.
            </p>
          </div>
        </div>

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
      <div className="hero" style={{ marginBottom: 12 }}>
        <div className="hero-inner" style={{ paddingBottom: 18 }}>
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

       <div className="card" style={{ marginBottom: 14 }}>
        {isStarted && !isCompleted ? (
          <div
            style={{
              marginBottom: 12,
              padding: 12,
              borderRadius: 10,
              background: 'rgba(255, 203, 5, 0.08)',
              border: '1px solid rgba(255, 203, 5, 0.25)',
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#FFCB05',
                letterSpacing: 1,
              }}
            >
              CURRENT ROUND
            </div>

            <div
              style={{
                fontSize: 22,
                fontWeight: 800,
                marginTop: 2,
              }}
            >
              Round {currentRound}
            </div>
          </div>
        ) : null}

        <div className="card-title">Rounds</div>
        <div className="card-subtitle">
          {isCompleted
            ? 'Tournament complete. Browse any round to review final scores.'
            : isStarted
            ? 'Live matches and scores appear directly inside each round.'
            : 'Round schedule will appear here after the tournament starts.'}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 12,
            marginTop: 12,
            marginBottom: 18,
          }}
        >
          {roundsAvailable.map((round) => {
            const isSelected = selectedRound === round;
            const status = roundStatusByRound.get(round);
            const isCurrent = status === 'current';

            return (
              <button
                key={round}
                type="button"
                onClick={() => setSelectedRound(round)}
                style={{
                  padding: '16px',
                  borderRadius: 14,
                  border: isSelected
                    ? '1px solid rgba(255, 203, 5, 0.6)'
                    : '1px solid rgba(255,255,255,0.08)',
                  background: isSelected
                    ? 'rgba(255, 203, 5, 0.08)'
                    : 'rgba(255,255,255,0.03)',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: 1,
                    color: isCurrent ? '#FFCB05' : 'rgba(255,255,255,0.5)',
                    marginBottom: 6,
                  }}
                >
                  {getRoundChipLabel(round)}
                </div>

                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 800,
                    color: '#fff',
                  }}
                >
                  Round {round}
                </div>
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
                liveMatchIds.has(match.id);

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
                  <div
                    className="row-between"
                    style={{ marginBottom: 12, alignItems: 'flex-start', gap: 10 }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          color: 'rgba(255,255,255,0.6)',
                          marginBottom: 4,
                        }}
                      >
                        Court
                      </div>

                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 900,
                          lineHeight: 1.1,
                        }}
                      >
                        {renderCourtLabel(match)}
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        flexWrap: 'wrap',
                        justifyContent: 'flex-end',
                      }}
                    >
                      {isCurrentMatch ? (
                        <span
                          className="tag"
                          style={{
                            background: 'rgba(255,203,5,0.14)',
                            border: '1px solid rgba(255,203,5,0.35)',
                            color: '#FFCB05',
                            fontWeight: 800,
                          }}
                        >
                          LIVE
                        </span>
                      ) : null}

                      <span
                        className={match.is_complete ? 'tag green' : 'tag'}
                        style={!match.is_complete ? { fontWeight: 800 } : undefined}
                      >
                        {match.is_complete ? 'COMPLETE' : 'IN PROGRESS'}
                      </span>
                    </div>
                  </div>

                  <div style={{ marginBottom: 10 }}>{renderStyledMatchLabel(match)}</div>

                  <div className="grid" style={{ marginBottom: 4 }}>
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
          <div>
            {standings[0] ? (
              <div
                className="list-item"
                style={{
                  marginBottom: 12,
                  borderColor: 'rgba(255,203,5,.55)',
                  boxShadow: '0 0 0 1px rgba(255,203,5,.25) inset',
                }}
              >
                <div
                  className="row-between"
                  style={{ marginBottom: 8, flexWrap: 'wrap' }}
                >
                  <div style={{ fontWeight: 900, fontSize: 20 }}>
                    🥇 {standings[0].name}
                  </div>
                  <span className="tag green">Leader</span>
                </div>

                <div className="muted" style={{ marginBottom: 10 }}>
                  {standings[0].wins}-{standings[0].losses} record • Diff{' '}
                  {standings[0].pointDiff > 0
                    ? `+${standings[0].pointDiff}`
                    : standings[0].pointDiff}
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                    gap: 8,
                  }}
                >
                  <div className="list-item" style={{ padding: 10, textAlign: 'center' }}>
                    <div className="muted" style={{ fontSize: 12 }}>Played</div>
                    <div style={{ fontWeight: 800 }}>{standings[0].played}</div>
                  </div>
                  <div className="list-item" style={{ padding: 10, textAlign: 'center' }}>
                    <div className="muted" style={{ fontSize: 12 }}>Wins</div>
                    <div style={{ fontWeight: 800 }}>{standings[0].wins}</div>
                  </div>
                  <div className="list-item" style={{ padding: 10, textAlign: 'center' }}>
                    <div className="muted" style={{ fontSize: 12 }}>Losses</div>
                    <div style={{ fontWeight: 800 }}>{standings[0].losses}</div>
                  </div>
                  <div className="list-item" style={{ padding: 10, textAlign: 'center' }}>
                    <div className="muted" style={{ fontSize: 12 }}>Diff</div>
                    <div style={{ fontWeight: 800 }}>
                      {standings[0].pointDiff > 0
                        ? `+${standings[0].pointDiff}`
                        : standings[0].pointDiff}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div
              style={{
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 16,
                overflow: 'hidden',
                background: 'rgba(255,255,255,0.03)',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '44px 1fr 72px 64px',
                  padding: '10px 8px',
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.65)',
                }}
              >
                <div style={{ textAlign: 'center' }}>#</div>
                <div>Player</div>
                <div style={{ textAlign: 'center' }}>W-L</div>
                <div style={{ textAlign: 'center' }}>Diff</div>
              </div>

              {standings.slice(1).map((row, index, arr) => {
                const place = index + 2;
                const medal = place === 2 ? '🥈' : place === 3 ? '🥉' : '';

                return (
                  <div
                    key={row.playerId}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '44px 1fr 72px 64px',
                      alignItems: 'center',
                      padding: '12px 8px',
                      borderBottom:
                        index === arr.length - 1
                          ? 'none'
                          : '1px solid rgba(255,255,255,0.08)',
                      background: place <= 3 ? 'rgba(255,203,5,0.04)' : 'transparent',
                    }}
                  >
                    <div style={{ textAlign: 'center', fontWeight: 900 }}>
                      {place}
                    </div>

                    <div
                      style={{
                        fontWeight: 800,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        paddingRight: 8,
                      }}
                    >
                      {medal ? `${medal} ` : ''}
                      {row.name}
                    </div>

                    <div style={{ textAlign: 'center', fontWeight: 800 }}>
                      {row.wins}-{row.losses}
                    </div>

                    <div
                      style={{
                        textAlign: 'center',
                        fontWeight: 800,
                        color: row.pointDiff > 0 ? '#FFCB05' : undefined,
                      }}
                    >
                      {row.pointDiff > 0 ? `+${row.pointDiff}` : row.pointDiff}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
