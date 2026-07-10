'use client';

import { type OrganizationBrand } from './OrganizationBrandBanner';

type Tournament = {
  title: string;
  court_labels: string[] | null;
  rounds: number;
  status: string;
};

type PlayerSlot = {
  id: string;
  slot_number: number;
  display_name: string | null;
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
    return match.court_label?.trim() || `Court ${match.court_number ?? '-'}`;
  }

  const currentMatches = matches
    .filter((match) => match.round_number === currentRound && !match.is_bye)
    .sort((a, b) => (a.court_number ?? 999) - (b.court_number ?? 999));

  const completeThisRound = currentMatches.filter((match) => match.is_complete).length;
  const totalRounds = tournament.rounds || 9;
  const isCreamOfTheCrop = tournamentMode === 'cream_of_the_crop';
  const nextRound = currentRound + 1;
  const nextRoundMatches = !isCreamOfTheCrop && nextRound <= totalRounds
    ? matches.filter((match) => match.round_number === nextRound && !match.is_bye)
    : [];
  const showNextCourt = nextRoundMatches.length > 0;
  const topStandings = standings.slice(0, isCreamOfTheCrop ? 14 : 12);
  const leader = topStandings[0];

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
                Now Playing
              </div>
              <div
                style={{
                  fontSize: 'clamp(46px, 5.2vw, 86px)',
                  lineHeight: 0.92,
                  fontWeight: 950,
                  letterSpacing: '-0.06em',
                  whiteSpace: 'nowrap',
                }}
              >
                Round {currentRound}
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
                  background: isLive ? 'rgba(34,197,94,0.16)' : 'rgba(255,203,5,0.14)',
                  border: isLive ? '1px solid rgba(34,197,94,0.42)' : '1px solid rgba(255,203,5,0.35)',
                  color: isLive ? '#86EFAC' : '#FFCB05',
                  fontSize: 14,
                  fontWeight: 950,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}
              >
                {isLive ? 'Live' : 'Updating'}
              </div>
              <div
                style={{
                  marginTop: 10,
                  fontSize: 22,
                  fontWeight: 900,
                  color: 'rgba(255,255,255,0.74)',
                }}
              >
                {completeThisRound}/{currentMatches.length} complete
              </div>
            </div>
          </header>

          <div
            style={{
              minHeight: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gridTemplateRows: 'repeat(3, minmax(0, 1fr))',
              gap: 10,
            }}
          >
            {currentMatches.map((match) => {
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
      display: '-webkit-box',
      WebkitLineClamp: 2,
      WebkitBoxOrient: 'vertical',
      paddingBottom: 4,
    }}
  >
    {renderTeam(match.team_a_player_1_id, match.team_a_player_2_id)}
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
      display: '-webkit-box',
      WebkitLineClamp: 2,
      WebkitBoxOrient: 'vertical',
      paddingBottom: 4,
    }}
  >
    {renderTeam(match.team_b_player_1_id, match.team_b_player_2_id)}
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
            })}
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
                {isCreamOfTheCrop ? 'Cream Standings' : 'Standings'}
              </div>
              <div
                style={{
                  marginTop: 5,
                  color: 'rgba(255,255,255,0.58)',
                  fontSize: 14,
                  fontWeight: 800,
                }}
              >
                {isCreamOfTheCrop ? 'Court ladder • Current record' : 'Record • Point differential'}
              </div>
            </div>

            <div style={{ minHeight: 0, overflow: 'hidden' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isCreamOfTheCrop
                    ? '40px minmax(0, 1fr) 54px 64px'
                    : showNextCourt
                    ? '42px minmax(0, 1fr) 48px 58px 58px'
                    : '46px minmax(0, 1fr) 58px 62px',
                  gap: 8,
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
                {showNextCourt ? <div style={{ textAlign: 'center' }}>Next</div> : null}
                <div style={{ textAlign: 'center' }}>
                  {isCreamOfTheCrop ? 'Court' : 'W-L'}
                </div>
                <div style={{ textAlign: 'right' }}>
                  {isCreamOfTheCrop ? 'W-L' : 'Diff'}
                </div>
              </div>

              {topStandings.map((row, index) => {
                const place = index + 1;
                const isLeader = leader?.playerId === row.playerId;
                const nextMatch = showNextCourt
                  ? nextRoundMatches.find((match) => includesPlayer(match, row.playerId))
                  : undefined;

                return (
                  <div
                    key={row.playerId}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: isCreamOfTheCrop
                        ? '40px minmax(0, 1fr) 54px 64px'
                        : showNextCourt
                        ? '42px minmax(0, 1fr) 48px 58px 58px'
                        : '46px minmax(0, 1fr) 58px 62px',
                      gap: 8,
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
                      {isCreamOfTheCrop ? row.finalCourt ?? '-' : `${row.wins}-${row.losses}`}
                    </div>
                    <div
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
                      {isCreamOfTheCrop
                        ? `${row.wins}-${row.losses}`
                        : formatDiff(row.pointDiff)}
                    </div>
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
