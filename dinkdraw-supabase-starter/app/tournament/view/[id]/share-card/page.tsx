import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { ShareResultsButton } from '../../../../../components/ShareResultsButton';
import { getOrganizationAccentColor } from '../../../../../components/OrganizationBrandBanner';


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
  slotNumber: number;
  wins: number;
  losses: number;
  pointDiff: number;
};

function diffText(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function shortName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return name;
  return `${parts[0]} ${parts[1][0]}.`;
}

function computeStandings(players: PlayerSlot[], matches: Match[]) {
  const rows = new Map<string, StandingRow>();

  for (const player of players) {
    rows.set(player.id, {
  name: player.display_name || `Player ${player.slot_number}`,
  slotNumber: player.slot_number,
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

function PodiumBlock({
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
        minWidth: 0,
        height,
        borderRadius: 18,
        border: `2px solid ${color}`,
        background: 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(0,0,0,0.22))',
        boxShadow: `0 0 22px ${color}33`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '12px 8px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 34, fontWeight: 950, color }}>{place}</div>
      <div style={{ fontSize: 28, marginTop: 2 }}>
        {place === '1' ? '🏆' : place === '2' ? '🥈' : '🥉'}
      </div>
      <div
        style={{
          fontSize: place === '1' ? 24 : 19,
          fontWeight: 950,
          color: '#fff',
          lineHeight: 1.05,
          marginTop: 8,
          wordBreak: 'break-word',
        }}
      >
        {shortName(name)}
      </div>
      <div style={{ marginTop: 10, fontSize: 15, color: 'rgba(255,255,255,0.72)' }}>
        {record}
      </div>
      <div style={{ marginTop: 2, fontSize: 22, fontWeight: 950, color }}>
        {diff}
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
    supabase
      .from('tournaments')
      .select('id, title, tournament_mode, organization_id')
      .eq('id', params.id)
      .maybeSingle(),
    supabase
      .from('tournament_players')
      .select('id, slot_number, display_name')
      .eq('tournament_id', params.id)
      .order('slot_number', { ascending: true }),
    supabase.from('matches').select('*').eq('tournament_id', params.id),
  ]);

  const tournament = tournamentResult.data;
  const organizationResult = tournament?.organization_id
    ? await supabase
        .from('organizations')
        .select('id, name, logo_url, primary_color, accent_color')
        .eq('id', tournament.organization_id)
        .maybeSingle()
    : null;
  const organizationBrand = organizationResult?.data || null;
  const organizationAccent = getOrganizationAccentColor(organizationBrand);
  const standings = computeStandings(
    (playersResult.data || []) as PlayerSlot[],
    (matchesResult.data || []) as Match[]
  );

  const first = standings[0];
const second = standings[1];
const third = standings[2];

const isCreamOfTheCrop = tournament?.tournament_mode === 'cream_of_the_crop';

const biggestClimber = isCreamOfTheCrop
  ? standings
      .map((row, index) => ({
        ...row,
        finishRank: index + 1,
        climb: row.slotNumber - (index + 1),
      }))
      .sort((a, b) => b.climb - a.climb)[0]
  : null;

  if (!tournament || !first) {
    return <main>Results not found.</main>;
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#020b14',
        padding: 14,
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      <div style={{ maxWidth: 430, margin: '0 auto' }}>
        <Link
          href={`/tournament/${params.id}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color: '#FFCB05',
            fontSize: 16,
            fontWeight: 900,
            textDecoration: 'none',
            margin: '16px 0 12px 4px',
          }}
        >
          ← Back to Tournament
        </Link>

        <section
          id="dinkdraw-share-card"
          style={{
            width: '100%',
            maxWidth: 420,
            aspectRatio: 'auto',
            borderRadius: 28,
            padding: '98px 16px 16px',
            color: '#fff',
            background:
              'radial-gradient(circle at top, #123a5c 0%, #06182b 48%, #020b14 100%)',
            border: '1px solid rgba(255,203,5,0.35)',
            boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
            overflow: 'hidden',
          }}
        >
          {organizationBrand ? (
            <div
              style={{
                textAlign: 'center',
                marginTop: -68,
                marginBottom: 18,
              }}
            >
              {organizationBrand.logo_url ? (
                <img
                  src={organizationBrand.logo_url}
                  alt={`${organizationBrand.name} logo`}
                  style={{
                    width: 72,
                    height: 72,
                    objectFit: 'contain',
                    borderRadius: 18,
                    background: 'rgba(255,255,255,0.94)',
                    padding: 8,
                    margin: '0 auto 10px',
                  }}
                />
              ) : null}
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 950,
                  letterSpacing: 2,
                  color: organizationAccent,
                  textTransform: 'uppercase',
                }}
              >
                Hosted by
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 24,
                  lineHeight: 1.05,
                  fontWeight: 950,
                  color: '#fff',
                }}
              >
                {organizationBrand.name}
              </div>
            </div>
          ) : null}

          <div style={{ textAlign: 'center', fontSize: 34, fontWeight: 950 }}>
            Dink<span style={{ color: '#FFCB05' }}>Draw</span>
          </div>

          <div
            style={{
              textAlign: 'center',
              marginTop: 4,
              fontSize: 13,
              letterSpacing: 4,
              color: 'rgba(255,255,255,0.72)',
            }}
          >
            PICKLEBALL TOURNAMENT
          </div>

          <h1
            style={{
              textAlign: 'center',
              fontSize: 42,
              lineHeight: 0.95,
              margin: '22px 0 8px',
              fontWeight: 950,
            }}
          >
            FINAL <span style={{ color: '#FFCB05' }}>RESULTS</span>
          </h1>

          <div
            style={{
              textAlign: 'center',
              fontSize: 19,
              fontWeight: 800,
              color: 'rgba(255,255,255,0.78)',
              marginBottom: 24,
            }}
          >
            {tournament.title}
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
  {isCreamOfTheCrop && biggestClimber ? (
    <>
      <div
        style={{
          padding: '16px',
          borderRadius: 18,
          border: '1px solid #FFCB05',
          background: 'linear-gradient(90deg, rgba(255,203,5,0.20), rgba(255,203,5,0.05))',
          boxShadow: '0 0 24px rgba(255,203,5,0.18)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 950, color: '#FFCB05' }}>
          🏆 CHAMPION
        </div>

        <div style={{ marginTop: 8, fontSize: 30, fontWeight: 950 }}>
          {first.name}
        </div>

        <div style={{ marginTop: 6, fontSize: 17, color: 'rgba(255,255,255,0.72)', fontWeight: 800 }}>
          {first.wins}-{first.losses} record • {diffText(first.pointDiff)} diff
        </div>
      </div>

      <div
        style={{
          padding: '16px',
          borderRadius: 18,
          border: '1px solid rgba(34,197,94,0.75)',
          background: 'linear-gradient(90deg, rgba(34,197,94,0.16), rgba(255,255,255,0.04))',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 950, color: '#86EFAC' }}>
          🚀 BIGGEST CLIMBER
        </div>

        <div style={{ marginTop: 8, fontSize: 28, fontWeight: 950 }}>
          {biggestClimber.name}
        </div>

        <div style={{ marginTop: 6, fontSize: 17, color: 'rgba(255,255,255,0.72)', fontWeight: 800 }}>
          Started #{biggestClimber.slotNumber} → Finished #{biggestClimber.finishRank}
        </div>

        <div style={{ marginTop: 4, fontSize: 24, color: '#86EFAC', fontWeight: 950 }}>
          +{biggestClimber.climb} spots
        </div>
      </div>
    </>
  ) : (
    [
      { place: '1', medal: '🥇', row: first, color: '#FFCB05' },
      { place: '2', medal: '🥈', row: second, color: '#C0C7D2' },
      { place: '3', medal: '🥉', row: third, color: '#CD7F32' },
    ]
      .filter((item) => item.row)
      .map((item) => (
        <div
          key={item.place}
          style={{
            display: 'grid',
            gridTemplateColumns: '54px minmax(0, 1fr) auto',
            gap: 12,
            alignItems: 'center',
            padding: '14px 16px',
            borderRadius: 18,
            border: `1px solid ${item.color}`,
            background:
              item.place === '1'
                ? 'linear-gradient(90deg, rgba(255,203,5,0.18), rgba(255,203,5,0.04))'
                : 'rgba(255,255,255,0.055)',
            boxShadow:
              item.place === '1' ? '0 0 24px rgba(255,203,5,0.18)' : 'none',
          }}
        >
          <div
            style={{
              fontSize: 30,
              fontWeight: 950,
              color: item.color,
              textAlign: 'center',
            }}
          >
            {item.medal}
          </div>

          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: item.place === '1' ? 26 : 23,
                fontWeight: 950,
                color: '#fff',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {item.row!.name}
            </div>

            <div
              style={{
                marginTop: 8,
                fontSize: 16,
                color: 'rgba(255,255,255,0.72)',
                fontWeight: 750,
              }}
            >
              {item.row!.wins}-{item.row!.losses} record
            </div>
          </div>

          <div
            style={{
              fontSize: item.place === '1' ? 30 : 26,
              fontWeight: 950,
              color: item.color,
              textAlign: 'right',
              whiteSpace: 'nowrap',
            }}
          >
            {diffText(item.row!.pointDiff)}
            <div
              style={{
                fontSize: 13,
                color: 'rgba(255,255,255,0.62)',
                fontWeight: 800,
                marginTop: 2,
              }}
            >
              diff
            </div>
          </div>
        </div>
      ))
  )}
</div>

          <div
            style={{
              marginTop: 16,
              borderRadius: 18,
              border: '1px solid rgba(255,203,5,0.45)',
              padding: '14px 16px',
              background: 'rgba(0,0,0,0.22)',
            }}
          >
            <div
  style={{
    fontSize: 20,
    fontWeight: 950,
    textAlign: 'center',
  }}
>
  Create. Compete. Celebrate.
</div>

<div
  style={{
    marginTop: 6,
    fontSize: 22,
    fontWeight: 950,
    color: '#FFCB05',
    textAlign: 'center',
  }}
>
  DINKDRAW.APP
</div>
          </div>
        </section>
        <div style={{ marginTop: 14, paddingBottom: 28 }}>
  <ShareResultsButton
    title={tournament.title || 'DinkDraw Tournament'}
    resultsUrl={`https://dinkdraw.app/tournament/view/${params.id}`}
    shareCardUrl={`https://dinkdraw.app/tournament/view/${params.id}/share-card`}
  />
</div>
      </div>
    </main>
  );
}
