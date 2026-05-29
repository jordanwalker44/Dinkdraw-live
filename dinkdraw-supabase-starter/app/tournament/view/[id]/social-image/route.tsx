import { ImageResponse } from 'next/og';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

type PlayerSlot = {
  id: string;
  slot_number: number;
  display_name: string | null;
};

type Match = {
  team_a_player_1_id: string | null;
  team_a_player_2_id: string | null;
  team_b_player_1_id: string | null;
  team_b_player_2_id: string | null;
  team_a_score: number | null;
  team_b_score: number | null;
  game_1_a: number | null;
  game_1_b: number | null;
  game_2_a: number | null;
  game_2_b: number | null;
  game_3_a: number | null;
  game_3_b: number | null;
  is_bye: boolean;
  is_complete: boolean;
};

type StandingRow = {
  playerId: string;
  name: string;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
};

function computeStandings(
  playerSlots: PlayerSlot[],
  matches: Match[],
  isSingles: boolean,
  isBestOf3: boolean
): StandingRow[] {
  const rows = new Map<string, StandingRow>();

  for (const slot of playerSlots) {
    rows.set(slot.id, {
      playerId: slot.id,
      name: slot.display_name || `Player ${slot.slot_number}`,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDiff: 0,
    });
  }

  for (const match of matches) {
    if (
      match.is_bye ||
      !match.is_complete ||
      !match.team_a_player_1_id ||
      !match.team_b_player_1_id
    ) {
      continue;
    }

    const aIds = isSingles
      ? [match.team_a_player_1_id]
      : [match.team_a_player_1_id, match.team_a_player_2_id].filter(Boolean) as string[];

    const bIds = isSingles
      ? [match.team_b_player_1_id]
      : [match.team_b_player_1_id, match.team_b_player_2_id].filter(Boolean) as string[];

    if (isBestOf3) {
      const games = [
        [match.game_1_a, match.game_1_b],
        [match.game_2_a, match.game_2_b],
        [match.game_3_a, match.game_3_b],
      ] as const;

      for (const [aScore, bScore] of games) {
        if (aScore === null || bScore === null) continue;

        for (const id of aIds) {
          const row = rows.get(id);
          if (!row) continue;
          row.pointsFor += aScore;
          row.pointsAgainst += bScore;
          if (aScore > bScore) row.wins += 1;
          if (bScore > aScore) row.losses += 1;
        }

        for (const id of bIds) {
          const row = rows.get(id);
          if (!row) continue;
          row.pointsFor += bScore;
          row.pointsAgainst += aScore;
          if (bScore > aScore) row.wins += 1;
          if (aScore > bScore) row.losses += 1;
        }
      }

      continue;
    }

    if (match.team_a_score === null || match.team_b_score === null) continue;

    for (const id of aIds) {
      const row = rows.get(id);
      if (!row) continue;
      row.pointsFor += match.team_a_score;
      row.pointsAgainst += match.team_b_score;
      if (match.team_a_score > match.team_b_score) row.wins += 1;
      if (match.team_b_score > match.team_a_score) row.losses += 1;
    }

    for (const id of bIds) {
      const row = rows.get(id);
      if (!row) continue;
      row.pointsFor += match.team_b_score;
      row.pointsAgainst += match.team_a_score;
      if (match.team_b_score > match.team_a_score) row.wins += 1;
      if (match.team_a_score > match.team_b_score) row.losses += 1;
    }
  }

  return Array.from(rows.values())
    .map((row) => ({
      ...row,
      pointDiff: row.pointsFor - row.pointsAgainst,
    }))
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
      if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
      return a.name.localeCompare(b.name);
    });
}

function diffText(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function podiumCard({
  place,
  trophy,
  name,
  record,
  diff,
  accent,
  height,
}: {
  place: string;
  trophy: string;
  name: string;
  record: string;
  diff: string;
  accent: string;
  height: number;
}) {
  return (
    <div
      style={{
        width: 300,
        height,
        borderRadius: 24,
        border: `3px solid ${accent}`,
        background: 'linear-gradient(180deg, #132f4d, #081a2d)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        boxShadow: `0 0 36px ${accent}55`,
      }}
    >
      <div
  style={{
    width: 86,
    height: 86,
    borderRadius: 999,
    background: accent,
    color: '#06182b',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 42,
    fontWeight: 950,
    marginBottom: 14,
  }}
>
  {place}
</div>
      <div
        style={{
          fontSize: 42,
          fontWeight: 900,
          color: accent,
          marginBottom: 10,
        }}
      >
        {place}
      </div>
      <div
        style={{
          fontSize: 34,
          fontWeight: 900,
          color: 'white',
          textAlign: 'center',
          lineHeight: 1.05,
          marginBottom: 18,
          maxWidth: 260,
        }}
      >
        {name}
      </div>
      <div style={{ fontSize: 24, color: 'white', fontWeight: 800 }}>
        {record} record
      </div>
      <div style={{ fontSize: 30, color: accent, fontWeight: 900 }}>
        {diff} diff
      </div>
    </div>
  );
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response('Missing Supabase env vars', { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const [tournamentResult, playersResult, matchesResult] = await Promise.all([
    supabase.from('tournaments').select('*').eq('id', params.id).maybeSingle(),
    supabase
      .from('tournament_players')
      .select('id, slot_number, display_name')
      .eq('tournament_id', params.id)
      .order('slot_number', { ascending: true }),
    supabase
      .from('matches')
      .select('*')
      .eq('tournament_id', params.id),
  ]);

  const tournament = tournamentResult.data;

  if (!tournament) {
    return new Response('Tournament not found', { status: 404 });
  }

  const standings = computeStandings(
    (playersResult.data || []) as PlayerSlot[],
    (matchesResult.data || []) as Match[],
    tournament.format === 'singles',
    tournament.match_format === 'best_of_3'
  );

  const first = standings[0];
  const second = standings[1];
  const third = standings[2];

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background:
            'radial-gradient(circle at top, #123a5c 0%, #06182b 42%, #020b14 100%)',
          color: 'white',
          padding: 48,
          fontFamily: 'Arial',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(135deg, rgba(255,203,5,0.10), transparent 32%, rgba(255,203,5,0.08))',
          }}
        />

        <div
          style={{
            position: 'relative',
            display: 'flex',
            justifyContent: 'center',
            fontSize: 54,
            fontWeight: 900,
            marginBottom: 8,
          }}
        >
          <span>Dink</span>
          <span style={{ color: '#FFCB05' }}>Draw</span>
        </div>

        <div
          style={{
            position: 'relative',
            textAlign: 'center',
            fontSize: 28,
            letterSpacing: 8,
            color: 'rgba(255,255,255,0.78)',
            marginBottom: 18,
          }}
        >
          PICKLEBALL TOURNAMENT
        </div>

        <div
          style={{
            position: 'relative',
            textAlign: 'center',
            fontSize: 76,
            fontWeight: 950,
            letterSpacing: 2,
            marginBottom: 8,
          }}
        >
          FINAL <span style={{ color: '#FFCB05' }}>RESULTS</span>
        </div>

        <div
          style={{
            position: 'relative',
            textAlign: 'center',
            fontSize: 30,
            fontWeight: 800,
            color: 'rgba(255,255,255,0.82)',
            marginBottom: 28,
          }}
        >
          {tournament.title || 'Tournament Complete'}
        </div>

        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            gap: 26,
            flex: 1,
          }}
        >
          {second
            ? podiumCard({
                place: '2',
                trophy: '🥈',
                name: second.name,
                record: `${second.wins}-${second.losses}`,
                diff: diffText(second.pointDiff),
                accent: '#C0C7D2',
                height: 300,
              })
            : null}

          {first
            ? podiumCard({
                place: '1',
                trophy: '🏆',
                name: first.name,
                record: `${first.wins}-${first.losses}`,
                diff: diffText(first.pointDiff),
                accent: '#FFCB05',
                height: 380,
              })
            : null}

          {third
            ? podiumCard({
                place: '3',
                trophy: '🥉',
                name: third.name,
                record: `${third.wins}-${third.losses}`,
                diff: diffText(third.pointDiff),
                accent: '#CD7F32',
                height: 260,
              })
            : null}
        </div>

        <div
          style={{
            position: 'relative',
            marginTop: 28,
            border: '2px solid rgba(255,203,5,0.48)',
            borderRadius: 24,
            padding: '20px 28px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'rgba(0,0,0,0.20)',
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 800 }}>
            Manage. Compete. Celebrate.
          </div>
          <div style={{ fontSize: 32, fontWeight: 950, color: '#FFCB05' }}>
            DINKDRAW.APP
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
