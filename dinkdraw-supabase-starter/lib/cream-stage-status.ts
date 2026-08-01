import { rankCreamOfTheCropStage } from './scheduler';
import type { Match, PlayerSlot } from './tournament-types';

// Emergency off-switch: false restores the previous game-card presentation.
export const SHOW_CREAM_STAGE_STATUS = true;

type StagePlayerInput = {
  id: string;
  tournament_id?: string;
  slot_number: number;
  display_name: string | null;
  claimed_by_user_id?: string | null;
  gender?: string | null;
};

type StageMatchInput = {
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

export type CreamStageStatus = {
  playerId: string;
  courtNumber: number;
  rank: number;
  wins: number;
  losses: number;
  pointDiff: number;
};

export function getCreamStageStart(roundNumber: number) {
  if (roundNumber <= 3) return 1;
  if (roundNumber <= 6) return 4;
  return 7;
}

export function getCreamStageLabel(roundNumber: number) {
  if (roundNumber <= 3) return 'Sort Stage';
  if (roundNumber <= 6) return 'Re-Rank Stage';
  return 'Final Stage';
}

export function buildCreamStageStatusMap(
  players: StagePlayerInput[],
  matches: StageMatchInput[],
  roundNumber: number
) {
  const stageStart = getCreamStageStart(roundNumber);
  const stageEnd = stageStart + 2;
  const schedulerPlayers: PlayerSlot[] = players.map((player) => ({
    id: player.id,
    tournament_id: player.tournament_id || '',
    slot_number: player.slot_number,
    display_name: player.display_name,
    claimed_by_user_id: player.claimed_by_user_id ?? null,
    gender: player.gender ?? null,
  }));
  const schedulerMatches = matches as Match[];
  const rankings = rankCreamOfTheCropStage(
    schedulerPlayers,
    schedulerMatches,
    stageStart
  );
  const gamesPlayed = new Map<string, number>();

  for (const match of matches) {
    if (
      match.is_bye ||
      !match.is_complete ||
      match.round_number < stageStart ||
      match.round_number > stageEnd
    ) {
      continue;
    }

    const playerIds = [
      match.team_a_player_1_id,
      match.team_a_player_2_id,
      match.team_b_player_1_id,
      match.team_b_player_2_id,
    ].filter(Boolean) as string[];

    for (const playerId of playerIds) {
      gamesPlayed.set(playerId, (gamesPlayed.get(playerId) || 0) + 1);
    }
  }

  const statusByPlayer = new Map<string, CreamStageStatus>();

  for (const court of rankings) {
    for (const row of court.rankedPlayers) {
      statusByPlayer.set(row.player.id, {
        playerId: row.player.id,
        courtNumber: court.courtNumber,
        rank: row.rank,
        wins: row.wins,
        losses: (gamesPlayed.get(row.player.id) || 0) - row.wins,
        pointDiff: row.pointDiff,
      });
    }
  }

  return statusByPlayer;
}

export function formatCreamStageDiff(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

export function formatCreamStageRank(rank: number) {
  if (rank === 1) return '1st';
  if (rank === 2) return '2nd';
  if (rank === 3) return '3rd';
  return '4th';
}
