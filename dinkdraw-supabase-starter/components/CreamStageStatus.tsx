import {
  formatCreamStageDiff,
  formatCreamStageRank,
  type CreamStageStatus,
} from '../lib/cream-stage-status';

function shortPlayerName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export function CreamStageTeamStatus({
  players,
  statusByPlayer,
  variant = 'card',
}: {
  players: Array<{ id: string | null; name: string }>;
  statusByPlayer: Map<string, CreamStageStatus>;
  variant?: 'card' | 'tv';
}) {
  const visiblePlayers = players.filter(
    (player): player is { id: string; name: string } =>
      Boolean(player.id && statusByPlayer.has(player.id))
  );

  if (!visiblePlayers.length) return null;

  return (
    <div
      style={{
        display: variant === 'tv' ? 'flex' : 'grid',
        flexWrap: variant === 'tv' ? 'wrap' : undefined,
        gap: variant === 'tv' ? '5px 12px' : 3,
        marginTop: variant === 'tv' ? 7 : 5,
        color:
          variant === 'tv'
            ? 'rgba(255,255,255,0.68)'
            : 'rgba(255,255,255,0.62)',
        fontSize: variant === 'tv' ? 'clamp(12px, 0.82vw, 16px)' : 11,
        fontWeight: 800,
        lineHeight: 1.25,
      }}
    >
      {visiblePlayers.map((player) => {
        const status = statusByPlayer.get(player.id)!;
        const gamesPlayed = status.wins + status.losses;
        const winPercentage = gamesPlayed
          ? Math.round((status.wins / gamesPlayed) * 100)
          : 0;

        return (
          <div
            key={player.id}
            style={variant === 'tv' ? { whiteSpace: 'nowrap' } : undefined}
          >
            {shortPlayerName(player.name)}: {status.wins}-{status.losses} ({winPercentage}%) •{' '}
            {formatCreamStageDiff(status.pointDiff)} diff •{' '}
            {formatCreamStageRank(status.rank)}
          </div>
        );
      })}
    </div>
  );
}
