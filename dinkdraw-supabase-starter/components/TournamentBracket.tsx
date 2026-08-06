'use client';

type BracketPlayer = {
  id: string;
  display_name: string | null;
};

export type BracketMatch = {
  id: string;
  bracket_type?: 'championship' | 'consolation';
  round_number: number;
  match_number: number;
  round_label: string | null;
  team_a_seed: number | null;
  team_b_seed: number | null;
  team_a_player_1_id: string | null;
  team_a_player_2_id: string | null;
  team_b_player_1_id: string | null;
  team_b_player_2_id: string | null;
  team_a_score: number | null;
  team_b_score: number | null;
  winner_team: string | null;
  next_match_id: string | null;
  is_bye: boolean;
  is_complete: boolean;
};

function teamName(
  players: Record<string, BracketPlayer>,
  player1Id: string | null,
  player2Id: string | null,
  fallback: string
) {
  const names = [player1Id, player2Id]
    .filter(Boolean)
    .map((id) => players[id as string]?.display_name || 'Player');
  return names.length ? names.join(' & ') : fallback;
}

function BracketSide({
  seed,
  name,
  score,
  winner,
}: {
  seed: number | null;
  name: string;
  score: number | null;
  winner: boolean;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '28px minmax(0, 1fr) 30px',
        alignItems: 'center',
        minHeight: 38,
        padding: '5px 8px',
        background: winner ? 'rgba(255,203,5,0.14)' : 'rgba(255,255,255,0.025)',
        color: winner ? '#FFCB05' : name === 'TBD' ? 'rgba(255,255,255,0.38)' : '#fff',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 900, color: 'rgba(255,255,255,0.48)' }}>
        {seed || '—'}
      </span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 850 }}>
        {name}
      </span>
      <span style={{ textAlign: 'right', fontWeight: 950 }}>{score ?? '—'}</span>
    </div>
  );
}

export function TournamentBracket({
  matches,
  players,
  bracketType,
  title,
  accentColor,
}: {
  matches: BracketMatch[];
  players: Record<string, BracketPlayer>;
  bracketType: 'championship' | 'consolation';
  title: string;
  accentColor: string;
}) {
  const bracketMatches = matches.filter(
    (match) => (match.bracket_type || 'championship') === bracketType
  );
  if (!bracketMatches.length) return null;

  const rounds = Array.from(new Set(bracketMatches.map((match) => match.round_number))).sort((a, b) => a - b);
  const firstRoundCount = Math.max(
    1,
    bracketMatches.filter((match) => match.round_number === rounds[0]).length
  );
  const canvasHeight = Math.max(210, firstRoundCount * 116);

  return (
    <section style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 10 }}>
        <div style={{ color: accentColor, fontWeight: 950, letterSpacing: 1.3, textTransform: 'uppercase' }}>{title}</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.48)', fontWeight: 800 }}>Scroll to follow the path →</div>
      </div>

      <div
        style={{
          overflowX: 'auto',
          borderRadius: 18,
          border: `1px solid ${accentColor}44`,
          background: 'radial-gradient(circle at center, rgba(21,55,84,0.48), rgba(2,11,20,0.72))',
          padding: '16px 18px',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div style={{ display: 'flex', minWidth: rounds.length * 252, height: canvasHeight }}>
          {rounds.map((roundNumber, roundIndex) => {
            const roundMatches = bracketMatches
              .filter((match) => match.round_number === roundNumber)
              .sort((a, b) => a.match_number - b.match_number);

            return (
              <div key={roundNumber} style={{ width: 228, flex: '0 0 228px', marginRight: roundIndex === rounds.length - 1 ? 0 : 24 }}>
                <div style={{ height: 30, color: 'rgba(255,255,255,0.68)', fontSize: 11, fontWeight: 950, letterSpacing: 1.2, textAlign: 'center', textTransform: 'uppercase' }}>
                  {roundMatches[0]?.round_label || `Round ${roundNumber}`}
                </div>
                <div style={{ height: canvasHeight - 30, display: 'flex', flexDirection: 'column', justifyContent: 'space-around' }}>
                  {roundMatches.map((match) => {
                    const teamA = teamName(players, match.team_a_player_1_id, match.team_a_player_2_id, 'TBD');
                    const teamB = match.is_bye
                      ? 'Bye'
                      : teamName(players, match.team_b_player_1_id, match.team_b_player_2_id, 'TBD');
                    const isFinal = !match.next_match_id;

                    return (
                      <div key={match.id} style={{ position: 'relative' }}>
                        <div
                          style={{
                            overflow: 'hidden',
                            borderRadius: 12,
                            border: match.is_complete ? `1px solid ${accentColor}99` : '1px solid rgba(255,255,255,0.13)',
                            background: 'rgba(6,24,43,0.96)',
                            boxShadow: match.is_complete ? `0 0 18px ${accentColor}20` : '0 8px 18px rgba(0,0,0,0.18)',
                          }}
                        >
                          <BracketSide seed={match.team_a_seed} name={teamA} score={match.team_a_score} winner={match.winner_team === 'A' || match.is_bye} />
                          <BracketSide seed={match.team_b_seed} name={teamB} score={match.team_b_score} winner={match.winner_team === 'B'} />
                          {isFinal && match.is_complete ? (
                            <div style={{ padding: '5px 8px', textAlign: 'center', background: `${accentColor}18`, color: accentColor, fontSize: 10, fontWeight: 950, letterSpacing: 1 }}>
                              {bracketType === 'championship' ? 'CHAMPIONS' : 'CONSOLATION WINNERS'}
                            </div>
                          ) : null}
                        </div>
                        {!isFinal ? (
                          <div aria-hidden="true" style={{ position: 'absolute', top: '50%', right: -24, width: 24, borderTop: `2px solid ${accentColor}77` }} />
                        ) : (
                          <div aria-hidden="true" style={{ position: 'absolute', top: '50%', right: -17, transform: 'translateY(-50%)', fontSize: 22 }}>🏆</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
