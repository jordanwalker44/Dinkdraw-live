import { createClient } from '@supabase/supabase-js';

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
  is_bye: boolean;
  is_complete: boolean;
};

type StandingRow = {
  name: string;
  wins: number;
  losses: number;
  pointDiff: number;
};

function diffText(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function computeStandings(players: PlayerSlot[], matches: Match[]) {
  const rows = new Map<string, StandingRow>();

  for (const player of players) {
    rows.set(player.id, {
      name: player.display_name || `Player ${player.slot_number}`,
      wins: 0,
      losses: 0,
      pointDiff: 0,
    });
  }

  for (const match of matches) {
    if (
      match.is_bye ||
      !match.is_complete ||
      !match.team_a_player_1_id ||
      !match.team_b_player_1_id ||
      match.team_a_score === null ||
      match.team_b_score === null
    ) {
      continue;
    }

    const aIds = [match.team_a_player_1_id, match.team_a_player_2_id].filter(Boolean) as string[];
    const bIds = [match.team_b_player_1_id, match.team_b_player_2_id].filter(Boolean) as string[];

    for (const id of aIds) {
      const row = rows.get(id);
      if (!row) continue;
      row.pointDiff += match.team_a_score - match.team_b_score;
      if (match.team_a_score > match.team_b_score) row.wins += 1;
      if (match.team_b_score > match.team_a_score) row.losses += 1;
    }

    for (const id of bIds) {
      const row = rows.get(id);
      if (!row) continue;
      row.pointDiff += match.team_b_score - match.team_a_score;
      if (match.team_b_score > match.team_a_score) row.wins += 1;
      if (match.team_a_score > match.team_b_score) row.losses += 1;
    }
  }

  return Array.from(rows.values()).sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
    return a.name.localeCompare(b.name);
  });
}

function PodiumSpot({
  place,
  name,
  record,
  diff,
  color,
  height,
}: {
  place: string;
  name: string;
  record: string;
  diff: string;
  color: string;
  height: number;
}) {
  return (
    <div
      style={{
        flex: 1,
        height,
        borderRadius: 22,
        border: `2px solid ${color}`,
        background: 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(0,0,0,0.22))',
        boxShadow: `0 0 28px ${color}44`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 18,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 42, fontWeight: 950, color }}>{place}</div>
      <div style={{ fontSize: 42, margin: '6px 0' }}>
        {place === '1' ? '🏆' : place === '2' ? '🥈' : '🥉'}
      </div>
      <div style={{ fontSize: 24, fontWeight: 950, color: '#fff', lineHeight: 1.05 }}>
        {name}
      </div>
      <div style={{ marginTop: 12, fontSize: 18, color: 'rgba(255,255,255,0.72)' }}>
        {record} record
      </div>
      <div style={{ marginTop: 4, fontSize: 24, fontWeight: 950, color }}>
        {diff} diff
      </div>
    </div>
  );
}

export default async function ShareCardPage({
  params,
}: {
  params: { id: string };
}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return <main>Missing Supabase environment variables.</main>;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const [tournamentResult, playersResult, matchesResult] = await Promise.all([
    supabase.from('tournaments').select('id, title').eq('id', params.id).maybeSingle(),
    supabase
      .from('tournament_players')
      .select('id, slot_number, display_name')
      .eq('tournament_id', params.id)
      .order('slot_number', { ascending: true }),
    supabase.from('matches').select('*').eq('tournament_id', params.id),
  ]);

  const tournament = tournamentResult.data;
  const standings = computeStandings(
    (playersResult.data || []) as PlayerSlot[],
    (matchesResult.data || []) as Match[]
  );

  const first = standings[0];
  const second = standings[1];
  const third = standings[2];

  if (!tournament || !first) {
    return <main>Results not found.</main>;
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#020b14',
        padding: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: 920,
          aspectRatio: '1 / 1',
          borderRadius: 34,
          padding: 34,
          color: '#fff',
          background:
            'radial-gradient(circle at top, #123a5c 0%, #06182b 45%, #020b14 100%)',
          border: '1px solid rgba(255,203,5,0.35)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ textAlign: 'center', fontSize: 42, fontWeight: 950 }}>
          Dink<span style={{ color: '#FFCB05' }}>Draw</span>
        </div>

        <div
          style={{
            textAlign: 'center',
            marginTop: 8,
            fontSize: 18,
            letterSpacing: 6,
            color: 'rgba(255,255,255,0.72)',
          }}
        >
          PICKLEBALL TOURNAMENT
        </div>

        <h1
          style={{
            textAlign: 'center',
            fontSize: 58,
            lineHeight: 1,
            margin: '28px 0 8px',
            fontWeight: 950,
          }}
        >
          FINAL <span style={{ color: '#FFCB05' }}>RESULTS</span>
        </h1>

        <div
          style={{
            textAlign: 'center',
            fontSize: 24,
            fontWeight: 800,
            color: 'rgba(255,255,255,0.78)',
            marginBottom: 32,
          }}
        >
          {tournament.title}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 16,
            flex: 1,
          }}
        >
          {second ? (
            <PodiumSpot
              place="2"
              name={second.name}
              record={`${second.wins}-${second.losses}`}
              diff={diffText(second.pointDiff)}
              color="#C0C7D2"
              height={280}
            />
          ) : null}

          <PodiumSpot
            place="1"
            name={first.name}
            record={`${first.wins}-${first.losses}`}
            diff={diffText(first.pointDiff)}
            color="#FFCB05"
            height={360}
          />

          {third ? (
            <PodiumSpot
              place="3"
              name={third.name}
              record={`${third.wins}-${third.losses}`}
              diff={diffText(third.pointDiff)}
              color="#CD7F32"
              height={250}
            />
          ) : null}
        </div>

        <div
          style={{
            marginTop: 28,
            borderRadius: 20,
            border: '1px solid rgba(255,203,5,0.45)',
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            alignItems: 'center',
            background: 'rgba(0,0,0,0.22)',
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 850 }}>
            Create. Compete. Celebrate.
          </div>
          <div style={{ fontSize: 22, fontWeight: 950, color: '#FFCB05' }}>
            DINKDRAW.APP
          </div>
        </div>
      </section>
    </main>
  );
}
