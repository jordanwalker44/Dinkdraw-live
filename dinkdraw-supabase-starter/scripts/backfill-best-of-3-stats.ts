import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

type TournamentRow = {
  id: string;
  title: string;
  format: 'singles' | 'doubles';
  match_format: string;
  started_at: string | null;
  event_date: string | null;
};

type TournamentPlayerRow = {
  id: string;
  tournament_id: string;
  claimed_by_user_id: string | null;
};

type MatchRow = {
  id: string;
  tournament_id: string;
  round_number: number;
  court_number: number | null;
  team_a_player_1_id: string | null;
  team_a_player_2_id: string | null;
  team_b_player_1_id: string | null;
  team_b_player_2_id: string | null;
  game_1_a: number | null;
  game_1_b: number | null;
  game_2_a: number | null;
  game_2_b: number | null;
  game_3_a: number | null;
  game_3_b: number | null;
  is_bye: boolean;
  is_complete: boolean;
};

type PlayerMatchStatInsert = {
  user_id: string;
  tournament_id: string;
  match_id: string;
  round_number: number;
  played_at: string;
  partner_user_id: string | null;
  opponent_1_user_id: string | null;
  opponent_2_user_id: string | null;
  result: 'win' | 'loss' | 'tie';
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
  point_diff: number;
  format: 'singles' | 'doubles';
};

function loadEnvFile(filename: string) {
  const filePath = path.join(process.cwd(), filename);
  if (!fs.existsSync(filePath)) return;

  const contents = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function countGameWins(
  games: Array<readonly [number | null, number | null]>
): { aWins: number; bWins: number; aPoints: number; bPoints: number } {
  let aWins = 0;
  let bWins = 0;
  let aPoints = 0;
  let bPoints = 0;

  for (const [a, b] of games) {
    if (a === null || b === null) continue;

    aPoints += a;
    bPoints += b;

    if (a > b) aWins += 1;
    else if (b > a) bWins += 1;
  }

  return { aWins, bWins, aPoints, bPoints };
}

function buildPlayedAt(tournament: TournamentRow, match: MatchRow): string {
  const base =
    tournament.started_at ||
    (tournament.event_date ? `${tournament.event_date}T12:00:00.000Z` : null) ||
    new Date().toISOString();

  const dt = new Date(base);
  if (Number.isNaN(dt.getTime())) {
    return new Date().toISOString();
  }

  dt.setUTCMinutes(dt.getUTCMinutes() + (match.round_number || 0));
  dt.setUTCSeconds(dt.getUTCSeconds() + (match.court_number || 0));

  return dt.toISOString();
}

async function main() {
  loadEnvFile('.env.local');
  loadEnvFile('.env');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL in environment.');
  }

  if (!serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY in environment.');
  }

  const dryRun = process.argv.includes('--dry-run');

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Starting backfill${dryRun ? ' (dry run)' : ''}...`);

  const { data: tournaments, error: tournamentsError } = await supabase
    .from('tournaments')
    .select('id, title, format, match_format, started_at, event_date')
    .eq('match_format', 'best_of_3');

  if (tournamentsError) {
    throw tournamentsError;
  }

  const bestOf3Tournaments = (tournaments || []) as TournamentRow[];

  if (!bestOf3Tournaments.length) {
    console.log('No best_of_3 tournaments found. Nothing to do.');
    return;
  }

  const tournamentIds = bestOf3Tournaments.map((t) => t.id);
  const tournamentsById = new Map(bestOf3Tournaments.map((t) => [t.id, t]));

  console.log(`Found ${bestOf3Tournaments.length} best_of_3 tournaments.`);

  const { data: matches, error: matchesError } = await supabase
    .from('matches')
    .select(
      'id, tournament_id, round_number, court_number, team_a_player_1_id, team_a_player_2_id, team_b_player_1_id, team_b_player_2_id, game_1_a, game_1_b, game_2_a, game_2_b, game_3_a, game_3_b, is_bye, is_complete'
    )
    .in('tournament_id', tournamentIds)
    .eq('is_complete', true)
    .order('tournament_id', { ascending: true })
    .order('round_number', { ascending: true })
    .order('court_number', { ascending: true });

  if (matchesError) {
    throw matchesError;
  }

  const completedMatches = ((matches || []) as MatchRow[]).filter((m) => !m.is_bye);

  console.log(`Found ${completedMatches.length} completed best_of_3 matches.`);

  const { data: tournamentPlayers, error: playersError } = await supabase
    .from('tournament_players')
    .select('id, tournament_id, claimed_by_user_id')
    .in('tournament_id', tournamentIds);

  if (playersError) {
    throw playersError;
  }

  const playerRows = (tournamentPlayers || []) as TournamentPlayerRow[];

  const playersByTournament = new Map<string, Map<string, string | null>>();
  for (const player of playerRows) {
    if (!playersByTournament.has(player.tournament_id)) {
      playersByTournament.set(player.tournament_id, new Map());
    }
    playersByTournament
      .get(player.tournament_id)!
      .set(player.id, player.claimed_by_user_id);
  }

  const inserts: PlayerMatchStatInsert[] = [];

  for (const match of completedMatches) {
    const tournament = tournamentsById.get(match.tournament_id);
    if (!tournament) continue;

    const slotMap = playersByTournament.get(match.tournament_id) || new Map();

    const a1 = match.team_a_player_1_id ? slotMap.get(match.team_a_player_1_id) || null : null;
    const a2 = match.team_a_player_2_id ? slotMap.get(match.team_a_player_2_id) || null : null;
    const b1 = match.team_b_player_1_id ? slotMap.get(match.team_b_player_1_id) || null : null;
    const b2 = match.team_b_player_2_id ? slotMap.get(match.team_b_player_2_id) || null : null;

    const teamAUsers =
      tournament.format === 'singles'
        ? [a1].filter(Boolean) as string[]
        : [a1, a2].filter(Boolean) as string[];

    const teamBUsers =
      tournament.format === 'singles'
        ? [b1].filter(Boolean) as string[]
        : [b1, b2].filter(Boolean) as string[];

    if (!teamAUsers.length && !teamBUsers.length) {
      continue;
    }

    const games = [
      [match.game_1_a, match.game_1_b] as const,
      [match.game_2_a, match.game_2_b] as const,
      [match.game_3_a, match.game_3_b] as const,
    ];

    const { aWins, bWins, aPoints, bPoints } = countGameWins(games);

    if (aWins === 0 && bWins === 0 && aPoints === 0 && bPoints === 0) {
      continue;
    }

    const playedAt = buildPlayedAt(tournament, match);

    const aResult: 'win' | 'loss' | 'tie' =
      aWins > bWins ? 'win' : bWins > aWins ? 'loss' : 'tie';
    const bResult: 'win' | 'loss' | 'tie' =
      bWins > aWins ? 'win' : aWins > bWins ? 'loss' : 'tie';

    for (const currentUserId of teamAUsers) {
      const partnerUserId =
        tournament.format === 'singles'
          ? null
          : teamAUsers.find((id) => id !== currentUserId) || null;

      inserts.push({
        user_id: currentUserId,
        tournament_id: match.tournament_id,
        match_id: match.id,
        round_number: match.round_number,
        played_at: playedAt,
        partner_user_id: partnerUserId,
        opponent_1_user_id: teamBUsers[0] || null,
        opponent_2_user_id: teamBUsers[1] || null,
        result: aResult,
        wins: aWins,
        losses: bWins,
        ties: aWins === bWins ? 1 : 0,
        points_for: aPoints,
        points_against: bPoints,
        point_diff: aPoints - bPoints,
        format: tournament.format,
      });
    }

    for (const currentUserId of teamBUsers) {
      const partnerUserId =
        tournament.format === 'singles'
          ? null
          : teamBUsers.find((id) => id !== currentUserId) || null;

      inserts.push({
        user_id: currentUserId,
        tournament_id: match.tournament_id,
        match_id: match.id,
        round_number: match.round_number,
        played_at: playedAt,
        partner_user_id: partnerUserId,
        opponent_1_user_id: teamAUsers[0] || null,
        opponent_2_user_id: teamAUsers[1] || null,
        result: bResult,
        wins: bWins,
        losses: aWins,
        ties: aWins === bWins ? 1 : 0,
        points_for: bPoints,
        points_against: aPoints,
        point_diff: bPoints - aPoints,
        format: tournament.format,
      });
    }
  }

  console.log(`Prepared ${inserts.length} player_match_stats rows.`);

  if (dryRun) {
    console.log('Dry run complete. No data was deleted or inserted.');
    return;
  }

  const deleteIdChunks = chunkArray(tournamentIds, 200);
  for (const ids of deleteIdChunks) {
    const { error } = await supabase
      .from('player_match_stats')
      .delete()
      .in('tournament_id', ids);

    if (error) {
      throw error;
    }
  }

  console.log('Deleted old player_match_stats rows for best_of_3 tournaments.');

  const insertChunks = chunkArray(inserts, 500);
  for (const chunk of insertChunks) {
    const { error } = await supabase
      .from('player_match_stats')
      .insert(chunk);

    if (error) {
      throw error;
    }
  }

  console.log('Backfill complete.');
  console.log(`Tournaments rebuilt: ${bestOf3Tournaments.length}`);
  console.log(`Matches rebuilt: ${completedMatches.length}`);
  console.log(`Stat rows inserted: ${inserts.length}`);
}

main().catch((error) => {
  console.error('Backfill failed.');
  console.error(error);
  process.exit(1);
});
