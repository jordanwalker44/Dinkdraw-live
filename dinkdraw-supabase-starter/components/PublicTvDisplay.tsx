'use client';

import { useEffect, useMemo, useState } from 'react';
import { type OrganizationBrand } from './OrganizationBrandBanner';
import { CreamStageTeamStatus } from './CreamStageStatus';
import {
  buildCreamStageStatusMap,
  SHOW_CREAM_STAGE_STATUS,
} from '../lib/cream-stage-status';

type Tournament = {
  title: string;
  court_labels: string[] | null;
  rounds: number;
  status: string;
  pool_brackets_enabled: boolean | null;
};

type PlayerSlot = {
  id: string;
  slot_number: number;
  display_name: string | null;
  pool_number: number | null;
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
  is_bye: boolean;
  is_complete: boolean;
};

type StandingRow = {
  playerId: string;
  slotNumber: number;
  name: string;
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
  finalCourt: number | null;
};

type PlayoffMatch = {
  bracket_type: 'championship' | 'consolation';
  next_match_id: string | null;
  is_complete: boolean;
  winner_player_1_id: string | null;
  winner_player_2_id: string | null;
};

type PublicTvDisplayProps = {
  tournament: Tournament;
  playerSlots: PlayerSlot[];
  matches: Match[];
  standings: StandingRow[];
  currentRound: number;
  isSingles: boolean;
  isLive: boolean;
  organizationBrand?: OrganizationBrand | null;
  tournamentMode?: string | null;
  standingsRankingMethod?: 'record_first' | 'point_diff_first' | null;
  poolStandings?: Array<{ poolNumber: number; standings: StandingRow[] }>;
  playoffMatches?: PlayoffMatch[];
};

function formatDiff(value: number) {
  if (value > 0) return `+${value}`;
  return String(value);
}

function renderScore(value: number | null) {
  return value === null ? '—' : String(value);
}

function getStageLabel(currentRound: number) {
  if (currentRound <= 3) return 'Sort Stage';
  if (currentRound <= 6) return 'Sift Stage';
  return 'Final Stage';
}

function includesPlayer(match: Match, playerId: string) {
  return (
    match.team_a_player_1_id === playerId ||
    match.team_a_player_2_id === playerId ||
    match.team_b_player_1_id === playerId ||
    match.team_b_player_2_id === playerId
  );
}

function formatCourtValue(match: Match | undefined) {
  if (!match) return '-';

  const label = match.court_label?.trim();
  if (label) return label.replace(/^court\s+/i, '');

  return match.court_number === null ? '-' : String(match.court_number);
}

function chunkMatches(matches: Match[], pageSize: number) {
  const pages: Match[][] = [];

  for (let index = 0; index < matches.length; index += pageSize) {
    pages.push(matches.slice(index, index + pageSize));
  }

  return pages.length ? pages : [[]];
}

export default function PublicTvDisplay({
  tournament,
  playerSlots,
  matches,
  standings,
  currentRound,
  isSingles,
  isLive,
  organizationBrand,
  tournamentMode,
  standingsRankingMethod,
  poolStandings = [],
  playoffMatches = [],
}: PublicTvDisplayProps) {
  const playersById = Object.fromEntries(playerSlots.map((slot) => [slot.id, slot]));

  function renderPlayerName(id: string | null) {
    if (!id) return 'Open Spot';
    return playersById[id]?.display_name || 'Player';
  }

  function renderTeam(a: string | null, b: string | null) {
    if (isSingles) return renderPlayerName(a);
    return `${renderPlayerName(a)} / ${renderPlayerName(b)}`;
  }

  function renderCourtLabel(match: Match) {
    const court = match.court_label?.trim() || `Court ${match.court_number ?? '-'}`;
    const poolNumber = playersById[match.team_a_player_1_id || '']?.pool_number || playersById[match.team_b_player_1_id || '']?.pool_number;
    return poolNumber ? `Pool ${poolNumber} • ${court}` : court;
  }

  const currentMatches = useMemo(
    () =>
      matches
        .filter((match) => match.round_number === currentRound && !match.is_bye)
        .sort((a, b) => (a.court_number ?? 999) - (b.court_number ?? 999)),
    [matches, currentRound]
  );

  const completeThisRound = currentMatches.filter((match) => match.is_complete).length;
  const totalRounds = tournament.rounds || 9;
  const isCreamOfTheCrop = tournamentMode === 'cream_of_the_crop';
  const showPointDifferential = standingsRankingMethod === 'point_diff_first';
  const currentCreamStageStatus = useMemo(
    () =>
      SHOW_CREAM_STAGE_STATUS && isCreamOfTheCrop
        ? buildCreamStageStatusMap(playerSlots, matches, currentRound)
        : new Map(),
    [isCreamOfTheCrop, playerSlots, matches, currentRound]
  );
  const playableMatches = useMemo(
    () => matches.filter((match) => !match.is_bye),
    [matches]
  );
  const allPlayableMatchesComplete =
    playableMatches.length > 0 && playableMatches.every((match) => match.is_complete);
  const isPoolTournament = !!tournament.pool_brackets_enabled;
  const isFinal = tournament.status === 'completed' || (!isPoolTournament && allPlayableMatchesComplete);
  const nextRound = currentRound + 1;
  const nextRoundMatches = !isCreamOfTheCrop && nextRound <= totalRounds
    ? matches.filter((match) => match.round_number === nextRound && !match.is_bye)
    : [];
  const showNextCourt = !isFinal && nextRoundMatches.length > 0;
  const [poolPageIndex, setPoolPageIndex] = useState(0);
  const activePool = isPoolTournament && poolStandings.length ? poolStandings[poolPageIndex % poolStandings.length] : null;
  const topStandings = (activePool?.standings || standings).slice(0, isCreamOfTheCrop ? 14 : 12);
  const leader = topStandings[0];
  const runnerUp = topStandings[1];
  const thirdPlace = topStandings[2];
  const championshipFinal = playoffMatches.find((match) => match.bracket_type === 'championship' && !match.next_match_id && match.is_complete);
  const consolationFinal = playoffMatches.find((match) => match.bracket_type === 'consolation' && !match.next_match_id && match.is_complete);
  const playoffWinnerName = (match: PlayoffMatch | undefined) => match
    ? [match.winner_player_1_id, match.winner_player_2_id].filter(Boolean).map((id) => renderPlayerName(id)).join(' / ')
    : null;
  const championName = playoffWinnerName(championshipFinal);
  const consolationWinnerName = playoffWinnerName(consolationFinal);
  const courtPages = useMemo(() => chunkMatches(currentMatches, 6), [currentMatches]);
  const [courtPageIndex, setCourtPageIndex] = useState(0);
  const visibleMatches = courtPages[courtPageIndex] || courtPages[0] || [];
  const visibleMatchRowCount =
    visibleMatches.length <= 2 ? 1 : visibleMatches.length <= 4 ? 2 : 3;
  const courtPageStart = courtPageIndex * 6 + 1;
  const courtPageEnd = Math.min(courtPageStart + visibleMatches.length - 1, currentMatches.length);
  const showCourtPager = !isFinal && courtPages.length > 1;

  useEffect(() => {
    setCourtPageIndex(0);
  }, [currentRound, currentMatches.length]);

  useEffect(() => {
    if (isFinal || courtPages.length <= 1) return;

    const interval = window.setInterval(() => {
      setCourtPageIndex((current) => (current + 1) % courtPages.length);
    }, 10000);

    return () => window.clearInterval(interval);
  }, [courtPages.length, isFinal]);

  useEffect(() => {
    if (!isPoolTournament || poolStandings.length <= 1) return;
    const interval = window.setInterval(() => {
      setPoolPageIndex((current) => (current + 1) % poolStandings.length);
    }, 10000);
    return () => window.clearInterval(interval);
  }, [isPoolTournament, poolStandings.length]);

  const biggestClimber = standings
    .filter((row) => row.played > 0)
    .map((row, index) => ({ ...row, rank: index + 1, climb: row.slotNumber - (index + 1) }))
    .sort((a, b) => b.climb - a.climb)[0];

  return (
    <main
      style={{
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        background:
          'radial-gradient(circle at top left, rgba(255,203,5,0.16), transparent 34%), linear-gradient(135deg, #06111f 0%, #071827 45%, #030712 100%)',
        color: '#fff',
        padding: 16,
        boxSizing: 'border-box',
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <section
  style={{
    height: '100%',
    width: '100%',
    display: 'grid',
    gridTemplateColumns: '66% 34%',
    gap: 18,
    minHeight: 0,
    minWidth: 0,
  }}
>
        <div
          style={{
            display: 'grid',
            gridTemplateRows: 'auto minmax(0, 1fr)',
            gap: 18,
            minHeight: 0,
          }}
        >
          <header
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 18,
              alignItems: 'end',
              padding: '16px 20px',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 28,
              background: 'rgba(255,255,255,0.055)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.28)',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 900,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: '#FFCB05',
                  marginBottom: 6,
                }}
              >
                {isFinal ? 'Tournament Complete' : allPlayableMatchesComplete && isPoolTournament ? 'Pool Play Complete' : 'Now Playing'}
              </div>
              <div
                style={{
                  fontSize: isFinal ? 'clamp(42px, 4.9vw, 82px)' : 'clamp(46px, 5.2vw, 86px)',
                  lineHeight: 0.92,
                  fontWeight: 950,
                  letterSpacing: '-0.06em',
                  whiteSpace: 'nowrap',
                }}
              >
                {isFinal ? 'Final Results' : allPlayableMatchesComplete && isPoolTournament ? 'Postseason Next' : `Round ${currentRound}`}
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '9px 14px',
                  borderRadius: 999,
                  background: isFinal
                    ? 'rgba(255,203,5,0.16)'
                    : isLive
                    ? 'rgba(34,197,94,0.16)'
                    : 'rgba(255,203,5,0.14)',
                  border: isFinal
                    ? '1px solid rgba(255,203,5,0.38)'
                    : isLive
                    ? '1px solid rgba(34,197,94,0.42)'
                    : '1px solid rgba(255,203,5,0.35)',
                  color: isFinal ? '#FFCB05' : isLive ? '#86EFAC' : '#FFCB05',
                  fontSize: 14,
                  fontWeight: 950,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}
              >
                {isFinal ? 'Final' : allPlayableMatchesComplete && isPoolTournament ? 'Awaiting Brackets' : isLive ? 'Live' : 'Updating'}
              </div>
              <div
                style={{
                  marginTop: 10,
                  fontSize: 22,
                  fontWeight: 900,
                  color: 'rgba(255,255,255,0.74)',
                }}
              >
                {isFinal
                  ? `${playableMatches.filter((match) => match.is_complete).length}/${playableMatches.length} matches`
                  : showCourtPager
                  ? `Courts ${courtPageStart}-${courtPageEnd} of ${currentMatches.length}`
                  : `${completeThisRound}/${currentMatches.length} complete`}
              </div>
            </div>
          </header>

          <div
            style={{
              minHeight: 0,
              display: 'grid',
              gridTemplateColumns: isFinal ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))',
              gridTemplateRows: isFinal
                ? 'minmax(0, 1fr)'
                : visibleMatchRowCount === 1
                ? 'minmax(220px, 300px)'
                : `repeat(${visibleMatchRowCount}, minmax(0, 1fr))`,
              alignContent: visibleMatchRowCount === 1 && !isFinal ? 'start' : undefined,
              gap: 10,
            }}
          >
            {isFinal ? (
              <article
                style={{
                  minHeight: 0,
                  borderRadius: 30,
                  border: '1px solid rgba(255,203,5,0.26)',
                  background:
                    'radial-gradient(circle at top left, rgba(255,203,5,0.2), transparent 34%), rgba(255,255,255,0.055)',
                  boxShadow: '0 24px 70px rgba(0,0,0,0.3)',
                  padding: '28px 32px',
                  display: 'grid',
                  gridTemplateRows: 'auto minmax(0, 1fr) auto',
                  gap: 24,
                  overflow: 'hidden',
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 950,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      color: '#FFCB05',
                      marginBottom: 10,
                    }}
                  >
                    Champion
                  </div>
                  <div
                    style={{
                      fontSize: 'clamp(54px, 5.2vw, 92px)',
                      lineHeight: 0.98,
                      fontWeight: 950,
                      letterSpacing: '-0.06em',
                    }}
                  >
                    {championName || leader?.name || 'Final standings'}
                  </div>
                  {leader && !championName ? (
                    <div
                      style={{
                        marginTop: 14,
                        fontSize: 28,
                        fontWeight: 950,
                        color: 'rgba(255,255,255,0.78)',
                      }}
                    >
                      {isCreamOfTheCrop
                        ? `${leader.wins}-${leader.losses} on Court ${leader.finalCourt ?? '-'}`
                        : showPointDifferential
                        ? `${formatDiff(leader.pointDiff)} point differential`
                        : `${leader.wins}-${leader.losses}`}
                    </div>
                  ) : null}
                </div>

                {championName ? (
                  <div style={{ minHeight: 0, display: 'grid', gridTemplateColumns: consolationWinnerName ? 'repeat(2, minmax(0, 1fr))' : '1fr', gap: 18, alignItems: 'center' }}>
                    <div style={{ padding: 28, borderRadius: 26, border: '2px solid rgba(255,203,5,0.62)', background: 'rgba(255,203,5,0.12)', textAlign: 'center' }}>
                      <div style={{ color: '#FFCB05', fontSize: 18, fontWeight: 950, letterSpacing: 2 }}>🏆 CHAMPIONS</div>
                      <div style={{ marginTop: 14, fontSize: 'clamp(34px, 3vw, 58px)', fontWeight: 950 }}>{championName}</div>
                    </div>
                    {consolationWinnerName ? (
                      <div style={{ padding: 28, borderRadius: 26, border: '2px solid rgba(167,139,250,0.62)', background: 'rgba(167,139,250,0.10)', textAlign: 'center' }}>
                        <div style={{ color: '#A78BFA', fontSize: 18, fontWeight: 950, letterSpacing: 2 }}>🏅 CONSOLATION WINNERS</div>
                        <div style={{ marginTop: 14, fontSize: 'clamp(30px, 2.7vw, 52px)', fontWeight: 950 }}>{consolationWinnerName}</div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div
                  style={{
                    minHeight: 0,
                    display: championName ? 'none' : 'grid',
                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                    gap: 16,
                    alignItems: 'end',
                  }}
                >
                  {[
                    { label: '1st', row: leader, scale: 1 },
                    { label: '2nd', row: runnerUp, scale: 0.88 },
                    { label: '3rd', row: thirdPlace, scale: 0.78 },
                  ].map((place) =>
                    place.row ? (
                      <div
                        key={place.label}
                        style={{
                          minHeight: `${180 * place.scale}px`,
                          borderRadius: 24,
                          border: '1px solid rgba(255,255,255,0.12)',
                          background:
                            place.label === '1st'
                              ? 'linear-gradient(180deg, rgba(255,203,5,0.2), rgba(255,255,255,0.055))'
                              : 'rgba(255,255,255,0.055)',
                          padding: 18,
                          display: 'grid',
                          alignContent: 'space-between',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 18,
                            fontWeight: 950,
                            color: place.label === '1st' ? '#FFCB05' : 'rgba(255,255,255,0.68)',
                          }}
                        >
                          {place.label}
                        </div>
                        <div>
                          <div
                            style={{
                              fontSize: 'clamp(26px, 2.2vw, 42px)',
                              lineHeight: 1.02,
                              fontWeight: 950,
                              letterSpacing: '-0.05em',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {place.row.name}
                          </div>
                          <div
                            style={{
                              marginTop: 8,
                              fontSize: 20,
                              fontWeight: 950,
                              color: '#FFCB05',
                            }}
                          >
                            {isCreamOfTheCrop
                              ? `${place.row.wins}-${place.row.losses}`
                              : showPointDifferential
                              ? `${formatDiff(place.row.pointDiff)} point differential`
                              : `${place.row.wins}-${place.row.losses}`}
                          </div>
                        </div>
                      </div>
                    ) : null
                  )}
                </div>

                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 900,
                    color: 'rgba(255,255,255,0.68)',
                  }}
                >
                  Final standings are locked.
                </div>
              </article>
            ) : (
            visibleMatches.map((match) => {
              const isComplete = match.is_complete;

              return (
                <article
                  key={match.id}
                  style={{
                    minHeight: 0,
                    borderRadius: 26,
                    border: isComplete
                      ? '1px solid rgba(34,197,94,0.34)'
                      : '1px solid rgba(255,203,5,0.34)',
                    background: isComplete
                      ? 'linear-gradient(180deg, rgba(34,197,94,0.13), rgba(255,255,255,0.045))'
                      : 'linear-gradient(180deg, rgba(255,203,5,0.12), rgba(255,255,255,0.045))',
                    boxShadow: '0 18px 42px rgba(0,0,0,0.24)',
                    padding: '16px 20px',
                    display: 'grid',
                    gridTemplateRows: 'auto minmax(0, 1fr) auto minmax(0, 1fr)',
                    gap: 6,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 'clamp(24px, 1.8vw, 38px)',
                        lineHeight: 1,
                        fontWeight: 950,
                        color: '#FFCB05',
                        letterSpacing: '-0.04em',
                      }}
                    >
                      {renderCourtLabel(match)}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 950,
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        color: isComplete ? '#86EFAC' : '#FFCB05',
                      }}
                    >
                      {isComplete ? 'Final' : 'Live'}
                    </div>
                  </div>

                  <div
  style={{
    alignSelf: 'end',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: 14,
    alignItems: 'center',
    fontSize: 'clamp(18px, 1.45vw, 28px)',
    lineHeight: 1.24,
    fontWeight: 950,
    letterSpacing: '-0.04em',
    overflow: 'hidden',
  }}
>
  <div
    style={{
      minWidth: 0,
      overflow: 'hidden',
      paddingBottom: 4,
    }}
  >
    <div
      style={{
        overflow: 'hidden',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
      }}
    >
      {renderTeam(match.team_a_player_1_id, match.team_a_player_2_id)}
    </div>
    {SHOW_CREAM_STAGE_STATUS && isCreamOfTheCrop ? (
      <CreamStageTeamStatus
        players={[
          {
            id: match.team_a_player_1_id,
            name: renderPlayerName(match.team_a_player_1_id),
          },
          {
            id: match.team_a_player_2_id,
            name: renderPlayerName(match.team_a_player_2_id),
          },
        ]}
        statusByPlayer={currentCreamStageStatus}
        variant="tv"
      />
    ) : null}
  </div>

  <div
    style={{
      minWidth: 52,
      textAlign: 'right',
      fontSize: 'clamp(34px, 2.5vw, 52px)',
      lineHeight: 1,
      fontWeight: 950,
      color: '#FFCB05',
    }}
  >
    {renderScore(match.team_a_score)}
  </div>
</div>

                  <div
                    style={{
                      textAlign: 'center',
                      fontSize: 'clamp(13px, 1vw, 18px)',
                      fontWeight: 950,
                      letterSpacing: '0.22em',
                      textTransform: 'uppercase',
                      color: 'rgba(255,255,255,0.45)',
                    }}
                  >
                    vs
                  </div>

                  <div
  style={{
    alignSelf: 'start',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: 14,
    alignItems: 'center',
    fontSize: 'clamp(18px, 1.45vw, 28px)',
    lineHeight: 1.24,
    fontWeight: 950,
    letterSpacing: '-0.04em',
    overflow: 'hidden',
  }}
>
  <div
    style={{
      minWidth: 0,
      overflow: 'hidden',
      paddingBottom: 4,
    }}
  >
    <div
      style={{
        overflow: 'hidden',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
      }}
    >
      {renderTeam(match.team_b_player_1_id, match.team_b_player_2_id)}
    </div>
    {SHOW_CREAM_STAGE_STATUS && isCreamOfTheCrop ? (
      <CreamStageTeamStatus
        players={[
          {
            id: match.team_b_player_1_id,
            name: renderPlayerName(match.team_b_player_1_id),
          },
          {
            id: match.team_b_player_2_id,
            name: renderPlayerName(match.team_b_player_2_id),
          },
        ]}
        statusByPlayer={currentCreamStageStatus}
        variant="tv"
      />
    ) : null}
  </div>

  <div
    style={{
      minWidth: 52,
      textAlign: 'right',
      fontSize: 'clamp(34px, 2.5vw, 52px)',
      lineHeight: 1,
      fontWeight: 950,
      color: '#FFCB05',
    }}
  >
    {renderScore(match.team_b_score)}
  </div>
</div>
                </article>
              );
            })
            )}
          </div>
        </div>

        <aside
          style={{
            minHeight: 0,
            display: 'grid',
            gridTemplateRows: isCreamOfTheCrop
              ? 'auto minmax(0, 1fr) auto'
              : 'auto minmax(0, 1fr)',
            gap: 16,
          }}
        >
          <div
            style={{
              borderRadius: 28,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.065)',
              padding: 16,
              boxShadow: '0 20px 60px rgba(0,0,0,0.26)',
            }}
          >
            <div
              style={{
                display: 'grid',
                gap: 12,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 950,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: '#FFCB05',
                    marginBottom: 6,
                  }}
                >
                  DinkDraw TV
                </div>
                <div
                  style={{
                    fontSize: 'clamp(28px, 2.2vw, 44px)',
                    lineHeight: 1,
                    fontWeight: 950,
                    letterSpacing: '-0.05em',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tournament.title || 'Tournament'}
                </div>
              </div>

            {organizationBrand?.name ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  minWidth: 0,
                  paddingTop: 10,
                  borderTop: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                {organizationBrand.logo_url ? (
                  <img
                    src={organizationBrand.logo_url}
                    alt={`${organizationBrand.name} logo`}
                    style={{
                      width: 42,
                      height: 42,
                      objectFit: 'contain',
                      borderRadius: 12,
                      background: 'rgba(255,255,255,0.92)',
                      padding: 5,
                      flexShrink: 0,
                    }}
                  />
                ) : null}
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 950,
                      letterSpacing: '0.16em',
                      textTransform: 'uppercase',
                      color: '#FFCB05',
                      marginBottom: 3,
                    }}
                  >
                    Hosted by
                  </div>
                  <div
                    style={{
                      fontSize: 'clamp(18px, 1.2vw, 24px)',
                      lineHeight: 1.05,
                      fontWeight: 950,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {organizationBrand.name}
                  </div>
                </div>
              </div>
            ) : null}
            </div>
          </div>

          <div
            style={{
              minHeight: 0,
              borderRadius: 28,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.06)',
              overflow: 'hidden',
              boxShadow: '0 20px 60px rgba(0,0,0,0.26)',
              display: 'grid',
              gridTemplateRows: 'auto minmax(0, 1fr)',
            }}
          >
            <div
              style={{
                padding: '16px 18px 12px',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <div
                style={{
                  fontSize: 30,
                  lineHeight: 1,
                  fontWeight: 950,
                  letterSpacing: '-0.05em',
                }}
              >
                {isCreamOfTheCrop ? 'Cream Standings' : activePool ? `Pool ${activePool.poolNumber} Standings` : 'Standings'}
              </div>
              <div
                style={{
                  marginTop: 5,
                  color: 'rgba(255,255,255,0.58)',
                  fontSize: 14,
                  fontWeight: 800,
                }}
              >
                {isCreamOfTheCrop
                  ? 'Court ladder • Current record'
                  : activePool
                  ? `Pool rankings • ${poolPageIndex % poolStandings.length + 1} of ${poolStandings.length}`
                  : showPointDifferential ? 'Point differential' : 'Win/loss record'}
              </div>
            </div>

            <div style={{ minHeight: 0, overflow: 'hidden' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isCreamOfTheCrop
                    ? '34px minmax(0, 1fr) 78px 54px 58px 62px'
                    : showNextCourt
                    ? '42px minmax(0, 1fr) 48px 70px'
                    : '46px minmax(0, 1fr) 70px',
                  gap: isCreamOfTheCrop ? 12 : 8,
                  padding: '10px 14px',
                  color: 'rgba(255,255,255,0.52)',
                  fontSize: 12,
                  fontWeight: 950,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}
              >
                <div>#</div>
                <div>Player</div>
                {isCreamOfTheCrop ? (
                  <div style={{ textAlign: 'center', lineHeight: 1.05 }}>
                    Original<br />Rank
                  </div>
                ) : null}
                {showNextCourt ? <div style={{ textAlign: 'center' }}>Next</div> : null}
                <div style={{ textAlign: 'center', lineHeight: 1.05 }}>
                  {isCreamOfTheCrop ? (
                    isFinal ? (
                      <>Final<br />Court</>
                    ) : (
                      'Playing'
                    )
                  ) : showPointDifferential ? 'Diff' : 'W-L'}
                </div>
                {isCreamOfTheCrop ? <div style={{ textAlign: 'right' }}>W-L</div> : null}
                {isCreamOfTheCrop ? <div style={{ textAlign: 'right' }}>Diff</div> : null}
              </div>

              {topStandings.map((row, index) => {
                const place = index + 1;
                const isLeader = leader?.playerId === row.playerId;
                const nextMatch = showNextCourt
                  ? nextRoundMatches.find((match) => includesPlayer(match, row.playerId))
                  : undefined;
                const currentCreamMatch =
                  isCreamOfTheCrop && !isFinal
                    ? currentMatches.find((match) => includesPlayer(match, row.playerId))
                    : undefined;

                return (
                  <div
                    key={row.playerId}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: isCreamOfTheCrop
                        ? '34px minmax(0, 1fr) 78px 54px 58px 62px'
                        : showNextCourt
                        ? '42px minmax(0, 1fr) 48px 70px'
                        : '46px minmax(0, 1fr) 70px',
                      gap: isCreamOfTheCrop ? 12 : 8,
                      alignItems: 'center',
                      padding: isCreamOfTheCrop ? '7px 14px' : '9px 14px',
                      borderTop: '1px solid rgba(255,255,255,0.075)',
                      background: isLeader
                        ? 'linear-gradient(90deg, rgba(255,203,5,0.22), rgba(255,203,5,0.04))'
                        : place <= 3
                        ? 'rgba(255,203,5,0.045)'
                        : 'transparent',
                    }}
                  >
                    <div
                      style={{
                        fontSize: isLeader ? 23 : 18,
                        fontWeight: 950,
                        color: isLeader ? '#FFCB05' : 'rgba(255,255,255,0.82)',
                      }}
                    >
                      {place}
                    </div>
                    <div
                      style={{
                        minWidth: 0,
                        fontSize: isLeader ? 22 : 18,
                        lineHeight: 1.18,
                        fontWeight: 950,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        paddingBottom: 2,
                      }}
                    >
                      {row.name}
                    </div>
                    {isCreamOfTheCrop ? (
                      <div
                        style={{
                          textAlign: 'center',
                          fontSize: isLeader ? 20 : 17,
                          fontWeight: 950,
                          color: 'rgba(255,255,255,0.76)',
                        }}
                      >
                        {row.slotNumber}
                      </div>
                    ) : null}
                    {showNextCourt ? (
                      <div
                        style={{
                          textAlign: 'center',
                          fontSize: isLeader ? 20 : 17,
                          fontWeight: 950,
                          color: 'rgba(255,255,255,0.84)',
                        }}
                      >
                        {formatCourtValue(nextMatch)}
                      </div>
                    ) : null}
                    <div
                      style={{
                        textAlign: 'center',
                      fontSize: isLeader ? 22 : 18,
                      fontWeight: 950,
                    }}
                  >
                      {isCreamOfTheCrop
                        ? isFinal
                          ? row.finalCourt ?? '-'
                          : currentCreamMatch
                          ? formatCourtValue(currentCreamMatch)
                          : 'Pending'
                        : showPointDifferential
                        ? formatDiff(row.pointDiff)
                        : `${row.wins}-${row.losses}`}
                    </div>
                    {isCreamOfTheCrop ? <div
                      style={{
                        textAlign: 'right',
                        fontSize: isLeader ? 22 : 18,
                        fontWeight: 950,
                        color:
                          !isCreamOfTheCrop && row.pointDiff > 0
                            ? '#FFCB05'
                            : 'rgba(255,255,255,0.86)',
                      }}
                    >
                      {`${row.wins}-${row.losses}`}
                    </div> : null}
                    {isCreamOfTheCrop ? (
                      <div
                        style={{
                          textAlign: 'right',
                          fontSize: isLeader ? 20 : 17,
                          fontWeight: 950,
                          color: row.pointDiff > 0 ? '#FFCB05' : 'rgba(255,255,255,0.86)',
                        }}
                      >
                        {formatDiff(row.pointDiff)}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {isCreamOfTheCrop ? (
            <div
              style={{
                borderRadius: 28,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.065)',
                padding: 18,
                boxShadow: '0 20px 60px rgba(0,0,0,0.26)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  alignItems: 'center',
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      fontSize: 26,
                      lineHeight: 1,
                      fontWeight: 950,
                      letterSpacing: '-0.05em',
                    }}
                  >
                    {getStageLabel(currentRound)}
                  </div>
                  <div
                    style={{
                      marginTop: 5,
                      color: 'rgba(255,255,255,0.58)',
                      fontSize: 14,
                      fontWeight: 850,
                    }}
                  >
                    Round {currentRound} of {totalRounds}
                  </div>
                </div>

                {biggestClimber && biggestClimber.climb > 0 ? (
                  <div
                    style={{
                      textAlign: 'right',
                      color: '#FFCB05',
                      fontWeight: 950,
                      fontSize: 14,
                      lineHeight: 1.1,
                    }}
                  >
                    Biggest Climber
                    <br />
                    {biggestClimber.name} +{biggestClimber.climb}
                  </div>
                ) : null}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                {Array.from({ length: totalRounds }).map((_, index) => {
                  const round = index + 1;
                  const isDone = round < currentRound;
                  const isCurrent = round === currentRound;

                  return (
                    <div
                      key={round}
                      style={{
                        height: 14,
                        flex: 1,
                        borderRadius: 999,
                        background: isCurrent
                          ? '#FFCB05'
                          : isDone
                          ? 'rgba(255,203,5,0.55)'
                          : 'rgba(255,255,255,0.16)',
                        boxShadow: isCurrent ? '0 0 22px rgba(255,203,5,0.38)' : 'none',
                      }}
                    />
                  );
                })}
              </div>
            </div>
          ) : null}
        </aside>
      </section>
    </main>
  );
}
