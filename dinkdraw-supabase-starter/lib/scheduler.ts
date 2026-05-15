import type { Match, PlayerSlot, ScheduleRow } from './tournament-types';

export function buildCreamOfTheCropStageSchedule(
  players: PlayerSlot[],
  startingRoundNumber: number
): ScheduleRow[] {
  const activePlayers = players.filter((p) => (p.display_name || '').trim() !== '');

  if (activePlayers.length < 4) return [];
  if (activePlayers.length % 4 !== 0) return [];

  const output: ScheduleRow[] = [];
  const courtCount = activePlayers.length / 4;

  for (let courtIndex = 0; courtIndex < courtCount; courtIndex += 1) {
    const courtNumber = courtIndex + 1;
    const courtPlayers = activePlayers.slice(courtIndex * 4, courtIndex * 4 + 4);

    const [p1, p2, p3, p4] = courtPlayers;

    if (!p1 || !p2 || !p3 || !p4) continue;

    output.push({
      round_number: startingRoundNumber,
      court_number: courtNumber,
      court_label: null,
      team_a_player_1_id: p1.id,
      team_a_player_2_id: p2.id,
      team_b_player_1_id: p3.id,
      team_b_player_2_id: p4.id,
      team_a_score: null,
      team_b_score: null,
      is_bye: false,
      is_complete: false,
    });

    output.push({
      round_number: startingRoundNumber + 1,
      court_number: courtNumber,
      court_label: null,
      team_a_player_1_id: p1.id,
      team_a_player_2_id: p3.id,
      team_b_player_1_id: p2.id,
      team_b_player_2_id: p4.id,
      team_a_score: null,
      team_b_score: null,
      is_bye: false,
      is_complete: false,
    });

    output.push({
      round_number: startingRoundNumber + 2,
      court_number: courtNumber,
      court_label: null,
      team_a_player_1_id: p1.id,
      team_a_player_2_id: p4.id,
      team_b_player_1_id: p2.id,
      team_b_player_2_id: p3.id,
      team_a_score: null,
      team_b_score: null,
      is_bye: false,
      is_complete: false,
    });
  }

  return output;
}

export type CreamCourtRanking = {
  courtNumber: number;
  rankedPlayers: Array<{
    player: PlayerSlot;
    rank: number;
    wins: number;
    pointDiff: number;
    pointsFor: number;
    pointsAgainst: number;
    priorSeed: number;
  }>;
};

function getCreamPlayerSeed(player: PlayerSlot, fallbackIndex: number) {
  return typeof player.slot_number === 'number' ? player.slot_number : fallbackIndex + 1;
}

export function rankCreamOfTheCropStage(
  stagePlayers: PlayerSlot[],
  matches: Match[],
  startingRoundNumber: number
): CreamCourtRanking[] {
  const activePlayers = stagePlayers.filter((p) => (p.display_name || '').trim() !== '');

  if (activePlayers.length < 4) return [];
  if (activePlayers.length % 4 !== 0) return [];

  const relevantMatches = matches.filter(
    (match) =>
      !match.is_bye &&
      match.is_complete &&
      match.round_number >= startingRoundNumber &&
      match.round_number <= startingRoundNumber + 2
  );

  const rankings: CreamCourtRanking[] = [];
  const courtCount = activePlayers.length / 4;

  for (let courtIndex = 0; courtIndex < courtCount; courtIndex += 1) {
    const courtNumber = courtIndex + 1;
    const courtPlayers = activePlayers.slice(courtIndex * 4, courtIndex * 4 + 4);

    const stats = new Map<
      string,
      {
        player: PlayerSlot;
        wins: number;
        pointDiff: number;
        pointsFor: number;
        pointsAgainst: number;
        priorSeed: number;
      }
    >();

    courtPlayers.forEach((player, index) => {
      stats.set(player.id, {
        player,
        wins: 0,
        pointDiff: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        priorSeed: getCreamPlayerSeed(player, courtIndex * 4 + index),
      });
    });

    const courtMatches = relevantMatches.filter(
      (match) => match.court_number === courtNumber
    );

    for (const match of courtMatches) {
      if (match.team_a_score === null || match.team_b_score === null) continue;

      const teamAIds = [
        match.team_a_player_1_id,
        match.team_a_player_2_id,
      ].filter(Boolean) as string[];

      const teamBIds = [
        match.team_b_player_1_id,
        match.team_b_player_2_id,
      ].filter(Boolean) as string[];

      const teamAWon = match.team_a_score > match.team_b_score;
      const teamBWon = match.team_b_score > match.team_a_score;

      for (const playerId of teamAIds) {
        const row = stats.get(playerId);
        if (!row) continue;

        row.pointsFor += match.team_a_score;
        row.pointsAgainst += match.team_b_score;
        row.pointDiff += match.team_a_score - match.team_b_score;
        if (teamAWon) row.wins += 1;
      }

      for (const playerId of teamBIds) {
        const row = stats.get(playerId);
        if (!row) continue;

        row.pointsFor += match.team_b_score;
        row.pointsAgainst += match.team_a_score;
        row.pointDiff += match.team_b_score - match.team_a_score;
        if (teamBWon) row.wins += 1;
      }
    }

    const rankedPlayers = Array.from(stats.values())
      .sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
        return a.priorSeed - b.priorSeed;
      })
      .map((row, index) => ({
        ...row,
        rank: index + 1,
      }));

    rankings.push({
      courtNumber,
      rankedPlayers,
    });
  }

  return rankings;
}

function getProjectedCreamCourt(
  currentCourtNumber: number,
  finishRank: number,
  courtCount: number
) {
  if (finishRank === 1) {
    return Math.max(1, currentCourtNumber - 2);
  }

  if (finishRank === 2) {
    if (currentCourtNumber === 1) return 1;
    return Math.max(2, currentCourtNumber - 1);
  }

  if (finishRank === 3) {
    return Math.min(courtCount, currentCourtNumber + 1);
  }

  return Math.min(courtCount, currentCourtNumber + 2);
}

export function buildNextCreamOfTheCropStagePlayers(
  stagePlayers: PlayerSlot[],
  matches: Match[],
  completedStageStartingRoundNumber: number
): PlayerSlot[] {
  const rankings = rankCreamOfTheCropStage(
    stagePlayers,
    matches,
    completedStageStartingRoundNumber
  );

  if (!rankings.length) return [];

  const courtCount = rankings.length;

  const projectedPlayers = rankings.flatMap((court) =>
    court.rankedPlayers.map((row) => ({
      ...row,
      currentCourtNumber: court.courtNumber,
      projectedCourtNumber: getProjectedCreamCourt(
        court.courtNumber,
        row.rank,
        courtCount
      ),
    }))
  );

  const sortedPlayers = projectedPlayers
  .sort((a, b) => {
    if (a.projectedCourtNumber !== b.projectedCourtNumber) {
      return a.projectedCourtNumber - b.projectedCourtNumber;
    }

    if (a.rank !== b.rank) {
      return a.rank - b.rank;
    }

    if (b.wins !== a.wins) {
      return b.wins - a.wins;
    }

    if (b.pointDiff !== a.pointDiff) {
      return b.pointDiff - a.pointDiff;
    }

    if (b.pointsFor !== a.pointsFor) {
      return b.pointsFor - a.pointsFor;
    }

    if (a.currentCourtNumber !== b.currentCourtNumber) {
      return a.currentCourtNumber - b.currentCourtNumber;
    }

    return a.priorSeed - b.priorSeed;
  })
  .map((row) => row.player);

  return sortedPlayers;
}

export function buildNextCreamOfTheCropStageSchedule(
  stagePlayers: PlayerSlot[],
  matches: Match[],
  completedStageStartingRoundNumber: number,
  nextStageStartingRoundNumber: number
): ScheduleRow[] {
  const nextStagePlayers = buildNextCreamOfTheCropStagePlayers(
    stagePlayers,
    matches,
    completedStageStartingRoundNumber
  );

  if (!nextStagePlayers.length) return [];

  return buildCreamOfTheCropStageSchedule(
    nextStagePlayers,
    nextStageStartingRoundNumber
  );
}
