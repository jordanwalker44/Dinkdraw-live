import type { ScheduleRow } from './tournament-types';

// Cyclic whist rotation: keep player 11 fixed and advance the others modulo 11.
// The five finite partner differences occur once, and the five finite opponent
// differences occur twice. Developing the starter through 11 rounds therefore
// gives every player each partner once and each opponent twice.
const TWELVE_PLAYER_STARTER = [[11, 8, 9, 1], [0, 5, 10, 3], [4, 2, 6, 7]];

// Precomputed court permutations retain the exact opponent rotation while
// avoiding 5/4/2 extremes over the full cycle (nine 4/4/3, three 5/3/3).
const TWELVE_PLAYER_COURTS = [
  [3, 2, 1], [2, 1, 3], [1, 3, 2], [2, 3, 1], [1, 2, 3],
  [2, 1, 3], [1, 3, 2], [3, 2, 1], [1, 2, 3], [3, 1, 2], [1, 3, 2],
];

export function buildTwelvePlayerRotation(ids: string[], rounds: number): ScheduleRow[] {
  if (ids.length !== 12 || new Set(ids).size !== 12 || !Number.isInteger(rounds) || rounds < 1 || rounds > 11) {
    throw new Error('The complete twelve-player rotation supports 12 distinct players and 1–11 rounds.');
  }
  return Array.from({ length: rounds }, (_, round) =>
    TWELVE_PLAYER_STARTER.map((starter, court) => {
      const [a1, a2, b1, b2] = starter.map(index => ids[index === 11 ? 11 : (index + round) % 11]);
      return {
        round_number: round + 1, court_number: TWELVE_PLAYER_COURTS[round][court], court_label: null,
        team_a_player_1_id: a1, team_a_player_2_id: a2,
        team_b_player_1_id: b1, team_b_player_2_id: b2,
        team_a_score: null, team_b_score: null, is_bye: false, is_complete: false,
      };
    })
  ).flat();
}

// Compare final court fairness first, then prefix fairness, then repeat stays.
// Fractional tie-breakers cannot outweigh a one-unit primary difference.
export function scoreRotatingCourtBalance(rows: ScheduleRow[], ids: string[]): number {
  const playable = rows.filter(row => !row.is_bye && row.court_number !== null)
    .sort((a, b) => a.round_number - b.round_number);
  const courts = [...new Set(playable.map(row => row.court_number!))];
  if (!courts.length || !ids.length) return 0;
  const counts = new Map(ids.map(id => [id, courts.map(() => 0)]));
  const last = new Map<string, number>();
  const streaks = new Map<string, number>();
  let prefixPenalty = 0;
  let streakPenalty = 0;
  for (const row of playable) {
    const court = courts.indexOf(row.court_number!);
    for (const id of [row.team_a_player_1_id, row.team_a_player_2_id, row.team_b_player_1_id, row.team_b_player_2_id]) {
      if (!id) continue;
      const values = counts.get(id);
      if (!values) continue;
      values[court]++;
      const spread = Math.max(...values) - Math.min(...values);
      prefixPenalty += spread * spread;
      const streak = last.get(id) === court ? (streaks.get(id) ?? 0) + 1 : 1;
      streakPenalty += (streak - 1) ** 2;
      last.set(id, court);
      streaks.set(id, streak);
    }
  }
  const spreads = [...counts.values()].map(values => Math.max(...values) - Math.min(...values));
  const maxGames = playable.length;
  const primary = Math.max(...spreads) * (ids.length * maxGames ** 2 + 1)
    + spreads.reduce((sum, spread) => sum + spread ** 2, 0);
  return primary + prefixPenalty / (prefixPenalty + 1) * 0.5
    + streakPenalty / (streakPenalty + 1) * 0.000001;
}
