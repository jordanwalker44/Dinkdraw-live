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
  doubles_mode: string | null;
};

type PlayerSlot = {
  id: string;
  tournament_id: string;
  slot_number: number;
  display_name: string | null;
  claimed_by_user_id: string | null;
  gender: string | null;
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

function getTournamentModeBadges(tournament: Tournament | null) {
  if (!tournament) return [];

  const badges: string[] = [];

  badges.push(tournament.format === 'singles' ? 'Singles' : 'Doubles');

  if (tournament.format === 'doubles') {
    if (tournament.doubles_mode === 'fixed') {
      badges.push('Fixed Partners');
    } else if (tournament.doubles_mode === 'mixed') {
      badges.push('Mixed Rotate');
    } else {
      badges.push('Rotating Partners');
    }
  }

  badges.push(
    tournament.match_format === 'best_of_3' ? 'Best of 3' : 'Single Game'
  );

  return badges;
}

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
  let aTotal = 0;
  let bTotal = 0;

  if (match.game_1_a !== null) aTotal += match.game_1_a;
  if (match.game_1_b !== null) bTotal += match.game_1_b;
  if (match.game_2_a !== null) aTotal += match.game_2_a;
  if (match.game_2_b !== null) bTotal += match.game_2_b;
  if (match.game_3_a !== null) aTotal += match.game_3_a;
  if (match.game_3_b !== null) bTotal += match.game_3_b;

  return { aScore: aTotal, bScore: bTotal };
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
      : [match.team_a_player_1_id, match.team_a_player_2_id].filter(Boolean) as string[];

    const bIds = isSingles
      ? [match.team_b_player_1_id]
      : [match.team_b_player_1_id, match.team_b_player_2_id].filter(Boolean) as string[];

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

export default function TournamentResultsPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [playerSlots, setPlayerSlots] = useState<PlayerSlot[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');

  const isSingles = tournament?.format === 'singles';
  const isBestOf3 = tournament?.match_format === 'best_of_3';
  const publicViewUrl =
    typeof window !== 'undefined' && tournament?.id
      ? `${window.location.origin}/tournament/view/${tournament.id}`
      : '';
  const tournamentModeBadges = getTournamentModeBadges(tournament);

  const playersById = useMemo(
    () => Object.fromEntries(playerSlots.map((slot) => [slot.id, slot])),
    [playerSlots]
  );

  const completedMatches = useMemo(
    () =>
      matches
        .filter((match) => !match.is_bye && match.is_complete)
        .sort((a, b) => {
          if (a.round_number !== b.round_number) return a.round_number - b.round_number;
          return (a.court_number || 0) - (b.court_number || 0);
        }),
    [matches]
  );

  const standings = useMemo(
    () => computeStandings(playerSlots, matches, !!isSingles, !!isBestOf3),
    [playerSlots, matches, isSingles, isBestOf3]
  );

  const winner = standings[0] || null;

  function renderPlayerName(id: string | null) {
    if (!id) return '-';
    return playersById[id]?.display_name || 'Player';
  }

  function renderTeam(a: string | null, b: string | null) {
    if (isSingles) return renderPlayerName(a);
    return `${renderPlayerName(a)} & ${renderPlayerName(b)}`;
  }

  function renderScore(match: Match) {
    if (isBestOf3) {
      const { aWins, bWins } = getSeriesWins(match);
      const { aScore, bScore } = getSeriesScore(match);
      return `${aWins}-${bWins} games (${aScore}-${bScore} points)`;
    }

    return `${match.team_a_score ?? 0}-${match.team_b_score ?? 0}`;
  }

  async function loadResults() {
    setIsLoading(true);
    setMessage('');

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

    if (tournamentResult.error) {
      setMessage(tournamentResult.error.message);
    }

    setTournament(tournamentResult.data || null);
    setPlayerSlots(playersResult.data || []);
    setMatches(matchesResult.data || []);
    setIsLoading(false);
  }

  useEffect(() => {
    void loadResults();
  }, [params.id, supabase]);

  if (isLoading) {
    return (
      <main className="page-shell">
        <div className="hero">
          <div className="hero-inner">
            <img src="/dinkdraw-logo.png" alt="DinkDraw logo" className="hero-logo" />
            <h1 className="hero-title">Tournament Results</h1>
            <p className="hero-subtitle">Loading results...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <div className="hero">
        <div className="hero-inner">
          <img src="/dinkdraw-logo.png" alt="DinkDraw logo" className="hero-logo" />
          <h1 className="hero-title">{tournament?.title || 'Tournament Results'}</h1>

          {tournamentModeBadges.length ? (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                marginTop: 10,
                justifyContent: 'center',
              }}
            >
              {tournamentModeBadges.map((badge) => (
                <span key={badge} className="tag">
                  {badge}
                </span>
              ))}
            </div>
          ) : null}

          <p className="hero-subtitle" style={{ marginTop: 12 }}>
            Final results and completed match summary
          </p>
        </div>
      </div>

      <TopNav />

      <div className="card">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
            marginBottom: 14,
          }}
        >
          <div className="list-item">
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Winner</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#FFCB05' }}>
              {winner?.name || 'TBD'}
            </div>
          </div>

          <div className="list-item">
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Event Details</div>
            <div className="muted">
              {tournament?.event_date || 'No date set'}
              {tournament?.event_time ? ` • ${tournament.event_time}` : ''}
            </div>
            <div className="muted">{tournament?.location || 'No location set'}</div>
          </div>

          <div className="list-item">
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Tournament Status</div>
            <div className="muted">{tournament?.status || 'Unknown'}</div>
            <div className="muted">{completedMatches.length} completed matches</div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 8,
            marginBottom: 18,
          }}
        >
          <Link
            href={`/tournament/${params.id}`}
            className="button secondary"
            style={{ textDecoration: 'none', textAlign: 'center' }}
          >
            Back to Tournament
          </Link>

          <a
            href={publicViewUrl || '#'}
            className="button primary"
            style={{ textDecoration: 'none', textAlign: 'center' }}
            target="_blank"
            rel="noreferrer"
          >
            Open Public View
          </a>
        </div>

        {message ? <div className="notice">{message}</div> : null}

        <div className="list-item" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 800, marginBottom: 10 }}>Final Standings</div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,.12)' }}>
                  <th style={{ padding: '8px 6px' }}>#</th>
                  <th style={{ padding: '8px 6px' }}>Player</th>
                  <th style={{ padding: '8px 6px' }}>W</th>
                  <th style={{ padding: '8px 6px' }}>L</th>
                  <th style={{ padding: '8px 6px' }}>PF</th>
                  <th style={{ padding: '8px 6px' }}>PA</th>
                  <th style={{ padding: '8px 6px' }}>+/-</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row, index) => (
                  <tr
                    key={row.playerId}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,.08)',
                      color: index === 0 ? '#FFCB05' : undefined,
                      fontWeight: index === 0 ? 800 : undefined,
                    }}
                  >
                    <td style={{ padding: '8px 6px' }}>{index + 1}</td>
                    <td style={{ padding: '8px 6px' }}>{row.name}</td>
                    <td style={{ padding: '8px 6px' }}>{row.wins}</td>
                    <td style={{ padding: '8px 6px' }}>{row.losses}</td>
                    <td style={{ padding: '8px 6px' }}>{row.pointsFor}</td>
                    <td style={{ padding: '8px 6px' }}>{row.pointsAgainst}</td>
                    <td style={{ padding: '8px 6px' }}>{row.pointDiff}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="list-item">
          <div style={{ fontWeight: 800, marginBottom: 10 }}>Completed Matches</div>

          {!completedMatches.length ? (
            <div className="muted">No completed matches yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {completedMatches.map((match) => (
                <div key={match.id} className="list-item">
                  <div className="row-between" style={{ marginBottom: 8 }}>
                    <strong>
                      Round {match.round_number} • Court {match.court_number ?? '-'}
                    </strong>
                    <span className="tag green">Complete</span>
                  </div>

                  <div style={{ display: 'grid', gap: 6 }}>
                    <div className="row-between">
                      <span>{renderTeam(match.team_a_player_1_id, match.team_a_player_2_id)}</span>
                      <strong>{match.team_a_score ?? 0}</strong>
                    </div>

                    <div className="row-between">
                      <span>{renderTeam(match.team_b_player_1_id, match.team_b_player_2_id)}</span>
                      <strong>{match.team_b_score ?? 0}</strong>
                    </div>

                    <div className="muted" style={{ marginTop: 4 }}>
                      Summary: {renderScore(match)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
