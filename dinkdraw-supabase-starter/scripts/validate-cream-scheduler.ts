import assert from 'node:assert/strict';
// Node runs this TypeScript file directly with type stripping and therefore
// requires the explicit extension; Next's application compiler does not.
// @ts-ignore -- intentional direct-Node TypeScript import
const schedulerModule = await import('../lib/scheduler.ts');
const {
  buildCreamOfTheCropStageSchedule,
  buildNextCreamOfTheCropStagePlayers,
  rankCreamOfTheCropStage,
} = schedulerModule;
import type { Match, PlayerSlot, ScheduleRow } from '../lib/tournament-types';

const PLAYER_COUNTS = (process.env.CREAM_PLAYER_COUNTS || '8,12,16,20,24')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value >= 4 && value % 4 === 0);
const SCORE_PATTERNS = ['alternating', 'team-a', 'team-b', 'court-seeded', 'close-games'] as const;
const randomRunCount = Math.max(0, Number(process.env.CREAM_RANDOM_RUNS || 50));
const RANDOM_PATTERNS = Array.from({ length: randomRunCount }, (_, index) => `random-${index + 1}` as const);
type ScorePattern = typeof SCORE_PATTERNS[number] | `random-${number}`;
const ALL_PATTERNS: ScorePattern[] = [...SCORE_PATTERNS, ...RANDOM_PATTERNS];

function players(count: number): PlayerSlot[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `player-${index + 1}`,
    tournament_id: `cream-${count}`,
    slot_number: index + 1,
    display_name: `Player ${index + 1}`,
    claimed_by_user_id: index % 3 === 0 ? `user-${index + 1}` : null,
    gender: null,
  }));
}

function completedMatches(
  schedule: ScheduleRow[],
  pattern: ScorePattern
): Match[] {
  return schedule.map((row, index) => {
    const court = row.court_number ?? 0;
    const round = row.round_number;
    let teamAWins = (round + court + index) % 2 === 0;
    let margin = ((round * 3 + court + index) % 8) + 1;

    if (pattern === 'team-a') teamAWins = true;
    if (pattern === 'team-b') teamAWins = false;
    if (pattern === 'court-seeded') teamAWins = court % 2 === 1;
    if (pattern === 'close-games') margin = 1;
    if (pattern.startsWith('random-')) {
      const seed = Number(pattern.slice('random-'.length));
      const value = Math.imul(seed + 17, Math.imul(index + 31, round + court + 13)) >>> 0;
      teamAWins = value % 2 === 0;
      margin = (Math.floor(value / 2) % 10) + 1;
    }

    return {
      ...row,
      id: `match-${round}-${court}-${index}`,
      team_a_score: teamAWins ? 11 : 11 - margin,
      team_b_score: teamAWins ? 11 - margin : 11,
      is_complete: true,
    };
  });
}

function validateStage(
  schedule: ScheduleRow[],
  roster: PlayerSlot[],
  startingRound: number
) {
  const courtCount = roster.length / 4;
  assert.equal(schedule.length, courtCount * 3, 'stage has three cards per court');

  for (let round = startingRound; round <= startingRound + 2; round += 1) {
    const cards = schedule.filter((row) => row.round_number === round);
    assert.equal(cards.length, courtCount, `round ${round} has one card per court`);
    assert.deepEqual(
      cards.map((row) => row.court_number).sort((a, b) => (a ?? 0) - (b ?? 0)),
      Array.from({ length: courtCount }, (_, index) => index + 1),
      `round ${round} uses every court once`
    );

    const appearances = cards.flatMap((row) => [
      row.team_a_player_1_id,
      row.team_a_player_2_id,
      row.team_b_player_1_id,
      row.team_b_player_2_id,
    ]);
    assert.equal(appearances.length, roster.length, `round ${round} has the right player count`);
    assert.equal(new Set(appearances).size, roster.length, `round ${round} has no duplicate players`);
    assert.deepEqual(
      [...new Set(appearances)].sort(),
      roster.map((player) => player.id).sort(),
      `round ${round} includes the complete roster`
    );
  }
}

function validateRankings(
  stagePlayers: PlayerSlot[],
  matches: Match[],
  startingRound: number
) {
  const rankings = rankCreamOfTheCropStage(stagePlayers, matches, startingRound);
  assert.equal(rankings.length, stagePlayers.length / 4, 'one ranking table per court');
  assert.ok(rankings.every((court) => court.rankedPlayers.length === 4), 'four ranked players per court');
  assert.equal(
    new Set(rankings.flatMap((court) => court.rankedPlayers.map((row) => row.player.id))).size,
    stagePlayers.length,
    'rankings contain every player exactly once'
  );
}

function validateMovement(
  stagePlayers: PlayerSlot[],
  stageMatches: Match[],
  nextPlayers: PlayerSlot[],
  startingRound: number
) {
  const rankings = rankCreamOfTheCropStage(stagePlayers, stageMatches, startingRound);
  const nextCourtByPlayer = new Map(
    nextPlayers.map((player, index) => [player.id, Math.floor(index / 4) + 1])
  );

  for (const court of rankings) {
    for (const row of court.rankedPlayers) {
      const nextCourt = nextCourtByPlayer.get(row.player.id);
      assert.ok(nextCourt, 'every ranked player receives a next court');
      assert.ok(
        Math.abs(nextCourt - court.courtNumber) <= 2,
        `${row.player.id} moves no more than two courts`
      );
      if (row.rank <= 2) {
        assert.ok(nextCourt <= court.courtNumber, `${row.player.id} top-half finisher does not move down`);
      } else {
        assert.ok(nextCourt >= court.courtNumber, `${row.player.id} bottom-half finisher does not move up`);
      }
    }
  }
}

function runTournament(playerCount: number, pattern: ScorePattern) {
  const originalPlayers = players(playerCount);
  const sortSchedule = buildCreamOfTheCropStageSchedule(originalPlayers, 1);
  validateStage(sortSchedule, originalPlayers, 1);
  const sortMatches = completedMatches(sortSchedule, pattern);
  validateRankings(originalPlayers, sortMatches, 1);

  const rerankPlayers = buildNextCreamOfTheCropStagePlayers(originalPlayers, sortMatches, 1);
  assert.equal(rerankPlayers.length, playerCount, 'Re-Rank retains the full roster');
  assert.equal(new Set(rerankPlayers.map((player) => player.id)).size, playerCount, 'Re-Rank roster is unique');
  validateMovement(originalPlayers, sortMatches, rerankPlayers, 1);
  const rerankSchedule = buildCreamOfTheCropStageSchedule(rerankPlayers, 4);
  validateStage(rerankSchedule, originalPlayers, 4);
  const rerankMatches = completedMatches(rerankSchedule, pattern);
  validateRankings(originalPlayers, rerankMatches, 4);

  const finalPlayers = buildNextCreamOfTheCropStagePlayers(originalPlayers, rerankMatches, 4);
  assert.equal(finalPlayers.length, playerCount, 'Final retains the full roster');
  assert.equal(new Set(finalPlayers.map((player) => player.id)).size, playerCount, 'Final roster is unique');
  validateMovement(originalPlayers, rerankMatches, finalPlayers, 4);
  const finalSchedule = buildCreamOfTheCropStageSchedule(finalPlayers, 7);
  validateStage(finalSchedule, originalPlayers, 7);
  validateRankings(originalPlayers, completedMatches(finalSchedule, pattern), 7);

  // A duplicated, missing, or repeated-player card must stop progression.
  assert.deepEqual(
    buildNextCreamOfTheCropStagePlayers(originalPlayers, [...sortMatches, sortMatches[0]], 1),
    [],
    'duplicate cards are rejected'
  );
  assert.deepEqual(
    buildNextCreamOfTheCropStagePlayers(originalPlayers, sortMatches.slice(1), 1),
    [],
    'missing cards are rejected'
  );
  const repeatedPlayerMatches = sortMatches.map((match, index) =>
    index === 0 ? { ...match, team_b_player_2_id: match.team_a_player_1_id } : match
  );
  assert.deepEqual(
    buildNextCreamOfTheCropStagePlayers(originalPlayers, repeatedPlayerMatches, 1),
    [],
    'repeated players are rejected'
  );

  return { playerCount, courts: playerCount / 4, cards: (playerCount / 4) * 9, pattern };
}

const results = PLAYER_COUNTS.flatMap((playerCount) =>
  ALL_PATTERNS.map((pattern) => runTournament(playerCount, pattern))
);

for (const playerCount of PLAYER_COUNTS) {
  const result = results.find((row) => row.playerCount === playerCount)!;
  console.log(
    `PASS ${result.playerCount} players / ${result.courts} courts / ${result.cards} cards / ${ALL_PATTERNS.length} score patterns`
  );
}

console.log(`PASS ${results.length} complete nine-round Cream simulations`);
