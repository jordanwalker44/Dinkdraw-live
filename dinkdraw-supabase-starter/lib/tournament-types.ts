export type PlayerSlot = {
  id: string;
  tournament_id: string;
  slot_number: number;
  display_name: string | null;
  claimed_by_user_id: string | null;
  gender: string | null;
};

export type ScheduleRow = {
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

export type Match = {
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
  game_1_a?: number | null;
  game_1_b?: number | null;
  game_2_a?: number | null;
  game_2_b?: number | null;
  game_3_a?: number | null;
  game_3_b?: number | null;
  is_bye: boolean;
  is_complete: boolean;
};
