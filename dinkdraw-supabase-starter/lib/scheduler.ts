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

    const playerIds = [p1.id, p2.id, p3.id, p4.id];
    const omittedFirstIndex = courtIndex % playerIds.length;
    const firstTeamPairsByOmittedIndex: Array<Array<[number, number]>> = [
      [[2, 3], [1, 3], [1, 2]],
      [[2, 3], [0, 2], [0, 3]],
      [[0, 1], [1, 3], [0, 3]],
      [[0, 1], [0, 2], [1, 2]],
    ];
    const allRoundPairs: Array<[[number, number], [number, number]]> = [
      [[0, 1], [2, 3]],
      [[0, 2], [1, 3]],
      [[0, 3], [1, 2]],
    ];
    const firstTeamPairs = firstTeamPairsByOmittedIndex[omittedFirstIndex];

    allRoundPairs.forEach(([pairA, pairB], roundOffset) => {
      const firstPair = firstTeamPairs[roundOffset];
      const firstKey = [...firstPair].sort().join('|');
      const pairAKey = [...pairA].sort().join('|');
      const teamA = firstKey === pairAKey ? pairA : pairB;
      const teamB = firstKey === pairAKey ? pairB : pairA;

      output.push({
        round_number: startingRoundNumber + roundOffset,
        court_number: courtNumber,
        court_label: null,
        team_a_player_1_id: playerIds[teamA[0]],
        team_a_player_2_id: playerIds[teamA[1]],
        team_b_player_1_id: playerIds[teamB[0]],
        team_b_player_2_id: playerIds[teamB[1]],
        team_a_score: null,
        team_b_score: null,
        is_bye: false,
        is_complete: false,
      });
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
  const fallbackPlayers = stagePlayers.filter((p) => (p.display_name || '').trim() !== '');

if (fallbackPlayers.length < 4) return [];
if (fallbackPlayers.length % 4 !== 0) return [];

const playerById = new Map(fallbackPlayers.map((player) => [player.id, player]));
const expectedCourtCount = fallbackPlayers.length / 4;
const stageMatches = matches.filter(
  (match) =>
    !match.is_bye &&
    match.round_number >= startingRoundNumber &&
    match.round_number <= startingRoundNumber + 2
);

// Never attempt to rank a corrupt or partial stage. Previously, duplicate
// opening cards caused the scheduler to fall back to seed order, which hid the
// corruption and produced incorrect courts in the following stage.
if (stageMatches.length !== expectedCourtCount * 3) return [];

for (let round = startingRoundNumber; round <= startingRoundNumber + 2; round += 1) {
  const roundMatches = stageMatches.filter((match) => match.round_number === round);
  if (roundMatches.length !== expectedCourtCount) return [];
  if (new Set(roundMatches.map((match) => match.court_number)).size !== expectedCourtCount) return [];
  if (roundMatches.some((match) =>
    !match.is_complete || match.team_a_score === null || match.team_b_score === null
  )) return [];

  const roundPlayerIds = roundMatches.flatMap((match) => [
    match.team_a_player_1_id,
    match.team_a_player_2_id,
    match.team_b_player_1_id,
    match.team_b_player_2_id,
  ].filter(Boolean) as string[]);

  if (roundPlayerIds.length !== fallbackPlayers.length) return [];
  if (new Set(roundPlayerIds).size !== fallbackPlayers.length) return [];
  if (roundPlayerIds.some((playerId) => !playerById.has(playerId))) return [];
}

const openingRoundMatches = matches
  .filter(
    (match) =>
      !match.is_bye &&
      match.round_number === startingRoundNumber
  )
  .sort((a, b) => (a.court_number ?? 999) - (b.court_number ?? 999));

const orderedPlayerIdsFromMatches = openingRoundMatches.flatMap((match) =>
  [
    match.team_a_player_1_id,
    match.team_a_player_2_id,
    match.team_b_player_1_id,
    match.team_b_player_2_id,
  ].filter(Boolean) as string[]
);

const playersFromMatches = orderedPlayerIdsFromMatches
  .map((playerId) => playerById.get(playerId))
  .filter(Boolean) as PlayerSlot[];

if (playersFromMatches.length !== fallbackPlayers.length) return [];
const activePlayers = playersFromMatches;

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
    if (courtCount === 2) {
    if (finishRank === 1 || finishRank === 2) return 1;
    return 2;
  }
  
  if (courtCount === 3) {
    if (currentCourtNumber === 1) {
      if (finishRank === 1 || finishRank === 2) return 1;
      return 2;
    }

    if (currentCourtNumber === 2) {
      if (finishRank === 1) return 1;
      if (finishRank === 2) return 2;
      return 3;
    }

    if (currentCourtNumber === 3) {
      if (finishRank === 1) return 1;
      if (finishRank === 2) return 2;
      return 3;
    }
  }

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

  // Boundary clamping can leave a projected court with five players and an
  // adjacent court with three (notably with 4+ courts). Rebalance those
  // projections explicitly. A top-half finisher may only stay or move up; a
  // bottom-half finisher may only stay or move down.
  for (let targetCourt = 1; targetCourt <= courtCount; targetCourt += 1) {
    while (projectedPlayers.filter((row) => row.projectedCourtNumber === targetCourt).length < 4) {
      const candidates = projectedPlayers
        .filter((row) => {
          const projectedCount = projectedPlayers.filter(
            (candidate) => candidate.projectedCourtNumber === row.projectedCourtNumber
          ).length;
          if (projectedCount <= 4) return false;
          return row.rank <= 2
            ? targetCourt <= row.currentCourtNumber
            : targetCourt >= row.currentCourtNumber;
        })
        .sort((a, b) => {
          const aProjectionCost = Math.abs(targetCourt - a.projectedCourtNumber);
          const bProjectionCost = Math.abs(targetCourt - b.projectedCourtNumber);
          if (aProjectionCost !== bProjectionCost) return aProjectionCost - bProjectionCost;

          const aMovementCost = Math.abs(targetCourt - a.currentCourtNumber);
          const bMovementCost = Math.abs(targetCourt - b.currentCourtNumber);
          if (aMovementCost !== bMovementCost) return aMovementCost - bMovementCost;

          if (a.rank !== b.rank) return a.rank - b.rank;
          return a.priorSeed - b.priorSeed;
        });

      const selected = candidates[0];
      if (!selected) return [];
      selected.projectedCourtNumber = targetCourt;
    }
  }

  if (Array.from({ length: courtCount }, (_, index) => index + 1).some(
    (courtNumber) => projectedPlayers.filter((row) => row.projectedCourtNumber === courtNumber).length !== 4
  )) return [];

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
