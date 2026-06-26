'use client';

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
};

type PublicTvDisplayProps = {
  tournament: Tournament;
  playerSlots: PlayerSlot[];
  matches: Match[];
  standings: StandingRow[];
  currentRound: number;
  isSingles: boolean;
  isLive: boolean;
};

function formatDiff(value: number) {
  if (value > 0) return `+${value}`;
  return String(value);
}

function getStageLabel(currentRound: number) {
  if (currentRound <= 3) return 'Sort Stage';
  if (currentRound <= 6) return 'Sift Stage';
  return 'Final Stage';
}

export default function PublicTvDisplay({
  tournament,
  playerSlots,
  matches,
  standings,
  currentRound,
  isSingles,
  isLive,
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
  const topStandings = standings.slice(0, 12);
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
        padding: 24,
        boxSizing: 'border-box',
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <section
        style={{
          height: '100%',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.72fr) minmax(360px, 0.9fr)',
          gap: 22,
          minHeight: 0,
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
              gap: 16,
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
                      fontSize: 'clamp(25px, 2.15vw, 45px)',
                      lineHeight: 1.02,
                      fontWeight: 950,
                      letterSpacing: '-0.055em',
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {renderTeam(match.team_a_player_1_id, match.team_a_player_2_id)}
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
                      fontSize: 'clamp(25px, 2.15vw, 45px)',
                      lineHeight: 1.02,
                      fontWeight: 950,
                      letterSpacing: '-0.055em',
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {renderTeam(match.team_b_player_1_id, match.team_b_player_2_id)}
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
            gridTemplateRows: 'auto minmax(0, 1fr) auto',
            gap: 16,
          }}
        >
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
                fontSize: 13,
                fontWeight: 950,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: '#FFCB05',
                marginBottom: 8,
              }}
            >
              DinkDraw TV
            </div>
            <div
              style={{
                fontSize: 'clamp(26px, 2.2vw, 42px)',
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
                Standings
              </div>
              <div
                style={{
                  marginTop: 5,
                  color: 'rgba(255,255,255,0.58)',
                  fontSize: 14,
                  fontWeight: 800,
                }}
              >
                Wins • Point differential
              </div>
            </div>

            <div style={{ minHeight: 0, overflow: 'hidden' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '46px minmax(0, 1fr) 54px 62px',
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
                <div style={{ textAlign: 'center' }}>W</div>
                <div style={{ textAlign: 'right' }}>Diff</div>
              </div>

              {topStandings.map((row, index) => {
                const place = index + 1;
                const isLeader = leader?.playerId === row.playerId;

                return (
                  <div
                    key={row.playerId}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '46px minmax(0, 1fr) 54px 62px',
                      gap: 8,
                      alignItems: 'center',
                      padding: '9px 14px',
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
                        fontSize: isLeader ? 25 : 20,
                        fontWeight: 950,
                        color: isLeader ? '#FFCB05' : 'rgba(255,255,255,0.82)',
                      }}
                    >
                      {place}
                    </div>
                    <div
                      style={{
                        minWidth: 0,
                        fontSize: isLeader ? 24 : 20,
                        lineHeight: 1,
                        fontWeight: 950,
                        letterSpacing: '-0.04em',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.name}
                    </div>
                    <div
                      style={{
                        textAlign: 'center',
                        fontSize: isLeader ? 24 : 20,
                        fontWeight: 950,
                      }}
                    >
                      {row.wins}
                    </div>
                    <div
                      style={{
                        textAlign: 'right',
                        fontSize: isLeader ? 24 : 20,
                        fontWeight: 950,
                        color: row.pointDiff > 0 ? '#FFCB05' : 'rgba(255,255,255,0.86)',
                      }}
                    >
                      {formatDiff(row.pointDiff)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

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
              <div>
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
        </aside>
      </section>
    </main>
  );
}
