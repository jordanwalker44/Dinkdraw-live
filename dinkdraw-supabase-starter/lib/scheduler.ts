import type { PlayerSlot, ScheduleRow } from '../app/tournament/[id]/page';

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
