export type EloStatRow = {
  id: string;
  match_id: string;
  played_at: string;
  user_id: string;
  partner_user_id: string | null;
  opponent_1_user_id: string | null;
  opponent_2_user_id: string | null;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
  tournament_id: string;
  format: string;
};

export type EloProfile = {
  id: string;
  display_name: string | null;
  email: string | null;
};

export type LeaderboardRow = {
  userId: string;
  name: string;
  matches: number;
  wins: number;
  losses: number;
  ties: number;
  winPct: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
  tournamentsPlayed: number;
  rating: number;
};

export type EloTimeline = Map<string, Array<{ playedAt: string; rating: number }>>;

function expectedScore(ratingA: number, ratingB: number) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function resultScore(result: 'win' | 'loss' | 'tie') {
  if (result === 'win') return 1;
  if (result === 'loss') return 0;
  return 0.5;
}

function getKFactor(matchCount: number) {
  if (matchCount < 10) return 32;
  if (matchCount < 30) return 24;
  return 16;
}

type MatchGroup = {
  matchId: string;
  playedAt: string;
  rows: EloStatRow[];
};

function groupAndSortMatches(stats: EloStatRow[]): MatchGroup[] {
  const grouped = new Map<string, MatchGroup>();

  for (const row of stats) {
    if (!grouped.has(row.match_id)) {
      grouped.set(row.match_id, {
        matchId: row.match_id,
        playedAt: row.played_at,
        rows: [],
      });
    }
    grouped.get(row.match_id)!.rows.push(row);
  }

  return Array.from(grouped.values()).sort(
    (a, b) => new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime()
  );
}

function getTeams(match: MatchGroup): { teamA: string[]; teamB: string[] } | null {
  const first = match.rows[0];
  if (!first) return null;

  // Singles: partner is null, opponents only have 1 player
  const isSingles = !first.partner_user_id && !first.opponent_2_user_id;

  const teamA = isSingles
    ? [first.user_id]
    : [first.user_id, first.partner_user_id].filter(Boolean) as string[];

  const teamB = isSingles
    ? [first.opponent_1_user_id].filter(Boolean) as string[]
    : [first.opponent_1_user_id, first.opponent_2_user_id].filter(Boolean) as string[];

  if (!teamA.length || !teamB.length) return null;

  return { teamA, teamB };
}

export function buildEloTimeline(allStats: EloStatRow[]): EloTimeline {
  const matches = groupAndSortMatches(allStats);
  const ratings = new Map<string, number>();
  const matchCounts = new Map<string, number>();
  const timeline: EloTimeline = new Map();

  const getRating = (id: string) => ratings.get(id) ?? 1000;
  const getCount = (id: string) => matchCounts.get(id) ?? 0;

  for (const match of matches) {
    const teams = getTeams(match);
    if (!teams) continue;

    const { teamA, teamB } = teams;
    const rep = match.rows.find((r) => teamA.includes(r.user_id));
    if (!rep) continue;

    const ratingA = teamA.reduce((s, id) => s + getRating(id), 0) / teamA.length;
    const ratingB = teamB.reduce((s, id) => s + getRating(id), 0) / teamB.length;

    const resultA: 'win' | 'loss' | 'tie' =
      rep.wins > rep.losses ? 'win' : rep.losses > rep.wins ? 'loss' : 'tie';
    const resultB: 'win' | 'loss' | 'tie' =
      resultA === 'win' ? 'loss' : resultA === 'loss' ? 'win' : 'tie';

    const kA = teamA.reduce((s, id) => s + getKFactor(getCount(id)), 0) / teamA.length;
    const kB = teamB.reduce((s, id) => s + getKFactor(getCount(id)), 0) / teamB.length;

    const deltaA = kA * (resultScore(resultA) - expectedScore(ratingA, ratingB));
    const deltaB = kB * (resultScore(resultB) - expectedScore(ratingB, ratingA));

    for (const id of teamA) {
      const next = Math.round(getRating(id) + deltaA);
      ratings.set(id, next);
      matchCounts.set(id, getCount(id) + 1);
      if (!timeline.has(id)) timeline.set(id, []);
      timeline.get(id)!.push({ playedAt: match.playedAt, rating: next });
    }

    for (const id of teamB) {
      const next = Math.round(getRating(id) + deltaB);
      ratings.set(id, next);
      matchCounts.set(id, getCount(id) + 1);
      if (!timeline.has(id)) timeline.set(id, []);
      timeline.get(id)!.push({ playedAt: match.playedAt, rating: next });
    }
  }

  return timeline;
}

export function buildLeaderboardRows(
  stats: EloStatRow[],
  profiles: EloProfile[],
  minMatches: number
): LeaderboardRow[] {
  const profilesById = new Map(profiles.map((p) => [p.id, p]));
  const matches = groupAndSortMatches(stats);
  const ratings = new Map<string, number>();
  const matchCounts = new Map<string, number>();
  const totals = new Map<string, {
    userId: string;
    matches: number;
    wins: number;
    losses: number;
    ties: number;
    pointsFor: number;
    pointsAgainst: number;
    tournaments: Set<string>;
  }>();

  const getRating = (id: string) => ratings.get(id) ?? 1000;
  const getCount = (id: string) => matchCounts.get(id) ?? 0;

  const ensureTotals = (userId: string) => {
    if (!totals.has(userId)) {
      totals.set(userId, {
        userId,
        matches: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        tournaments: new Set(),
      });
    }
    return totals.get(userId)!;
  };

  for (const row of stats) {
    const t = ensureTotals(row.user_id);
    t.wins += row.wins;
    t.losses += row.losses;
    t.ties += row.ties;
    t.matches += row.wins + row.losses + row.ties;
    t.pointsFor += row.points_for;
    t.pointsAgainst += row.points_against;
    if (row.tournament_id) t.tournaments.add(row.tournament_id);
  }

  for (const match of matches) {
    const teams = getTeams(match);
    if (!teams) continue;

    const { teamA, teamB } = teams;
    const rep = match.rows.find((r) => teamA.includes(r.user_id));
    if (!rep) continue;

    const ratingA = teamA.reduce((s, id) => s + getRating(id), 0) / teamA.length;
    const ratingB = teamB.reduce((s, id) => s + getRating(id), 0) / teamB.length;

    const resultA: 'win' | 'loss' | 'tie' =
      rep.wins > rep.losses ? 'win' : rep.losses > rep.wins ? 'loss' : 'tie';
    const resultB: 'win' | 'loss' | 'tie' =
      resultA === 'win' ? 'loss' : resultA === 'loss' ? 'win' : 'tie';

    const kA = teamA.reduce((s, id) => s + getKFactor(getCount(id)), 0) / teamA.length;
    const kB = teamB.reduce((s, id) => s + getKFactor(getCount(id)), 0) / teamB.length;

    const deltaA = kA * (resultScore(resultA) - expectedScore(ratingA, ratingB));
    const deltaB = kB * (resultScore(resultB) - expectedScore(ratingB, ratingA));

    for (const id of teamA) {
      ratings.set(id, Math.round(getRating(id) + deltaA));
      matchCounts.set(id, getCount(id) + 1);
    }
    for (const id of teamB) {
      ratings.set(id, Math.round(getRating(id) + deltaB));
      matchCounts.set(id, getCount(id) + 1);
    }
  }

  return Array.from(totals.values())
    .map((row) => {
      const profile = profilesById.get(row.userId);
      const winPct = row.matches ? Math.round((row.wins / row.matches) * 100) : 0;
      return {
        userId: row.userId,
        name: profile?.display_name?.trim() || profile?.email?.split('@')[0] || 'Player',
        matches: row.matches,
        wins: row.wins,
        losses: row.losses,
        ties: row.ties,
        winPct,
        pointsFor: row.pointsFor,
        pointsAgainst: row.pointsAgainst,
        pointDiff: row.pointsFor - row.pointsAgainst,
        tournamentsPlayed: row.tournaments.size,
        rating: getRating(row.userId),
      };
    })
    .filter((r) => r.matches >= minMatches)
    .sort((a, b) => {
      if (b.rating !== a.rating) return b.rating - a.rating;
      if (b.winPct !== a.winPct) return b.winPct - a.winPct;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
      return a.name.localeCompare(b.name);
    });
}

export function getCutoffDate(filter: string): Date | null {
  if (filter === 'lifetime') return null;
  const now = new Date();
  if (filter === '12m') { now.setMonth(now.getMonth() - 12); return now; }
  if (filter === '6m') { now.setMonth(now.getMonth() - 6); return now; }
  if (filter === '30d') { now.setDate(now.getDate() - 30); return now; }
  now.setDate(now.getDate() - 7);
  return now;
}

export function filterLabel(filter: string): string {
  if (filter === 'lifetime') return 'Lifetime';
  if (filter === '12m') return 'Last 12 Months';
  if (filter === '6m') return 'Last 6 Months';
  if (filter === '30d') return 'Last 30 Days';
  return 'Last 7 Days';
}
