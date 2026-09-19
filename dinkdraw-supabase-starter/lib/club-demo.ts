import { buildCreamOfTheCropStageSchedule, buildNextCreamOfTheCropStagePlayers } from './scheduler';
import { buildFixedEliminationGraph, buildFirstRoundConsolationGraph, type BracketSource } from './multi-elimination';
import type { BracketMatch } from '../components/TournamentBracket';
import type { Match } from './tournament-types';

export const DEMO_FORMATS = {
  round_robin: 'Round Robin', pool: 'Pool Play + Brackets', cream: 'Cream of the Crop', moneyball: 'Moneyball Series',
};
export const DEMO_POSTSEASONS = {
  split: 'Split Championship + Consolation', single: 'Single Elimination',
  single_consolation: 'Single + First-Round Consolation', double: 'Double Elimination', triple: 'Triple Elimination',
};
export type ClubDemo = {
  id: string; name: string; title: string; logo: string | null;
  primary: string; accent: string; names: string[];
  format: keyof typeof DEMO_FORMATS; step: number; seed: number;
  postseason?: keyof typeof DEMO_POSTSEASONS;
  playStyle?: 'rotating' | 'fixed' | 'mixed' | 'singles';
};
const first = ['Alex', 'Morgan', 'Taylor', 'Jordan', 'Casey', 'Riley', 'Jamie', 'Avery', 'Cameron', 'Quinn', 'Drew', 'Reese', 'Sam', 'Parker', 'Skyler', 'Blake', 'Robin', 'Charlie', 'Dakota', 'Hayden', 'Jess', 'Rowan', 'Emerson', 'Finley', 'Logan', 'Harper', 'Kendall', 'Sage', 'Payton', 'River'];
const last = ['Bennett', 'Chen', 'Davis', 'Ellis', 'Garcia', 'Hayes', 'Johnson', 'Kim', 'Lopez', 'Miller', 'Nguyen', 'Patel', 'Reed', 'Santos', 'Turner', 'Wilson'];
export function demoNames(count: number, offset = 0) {
  return Array.from({ length: count }, (_, i) => `${first[(i + offset) % first.length]} ${last[(i * 7 + offset) % last.length]}`);
}
export function newClubDemo(): ClubDemo {
  return { id: crypto.randomUUID(), name: 'Your Club', title: 'Saturday Pickleball Classic', logo: null, primary: '#00274C', accent: '#FFCB05', names: demoNames(16), format: 'pool', step: 0, seed: 1, postseason: 'split', playStyle: 'rotating' };
}
type DemoPlayoff = BracketMatch & {
  bracket_type: 'championship' | 'consolation'; winner_player_1_id: string | null;
  winner_player_2_id: string | null; elimination_section: 'main' | 'second_chance' | 'last_chance' | 'finals' | null;
};
export function buildClubDemo(demo: ClubDemo) {
  const isPool = demo.format === 'pool' || demo.format === 'moneyball';
  const isCream = demo.format === 'cream';
  const style = isCream ? 'rotating' : demo.playStyle || 'rotating';
  const isSingles = style === 'singles' && !isPool;
  const postseason = demo.postseason || 'split';
  const players = demo.names.map((name, i) => ({ id: `demo-player-${i}`, tournament_id: demo.id, slot_number: i + 1, display_name: name, claimed_by_user_id: null, gender: style === 'mixed' ? (i % 2 ? 'female' : 'male') : null, pool_number: Math.floor(i / 4) + 1 }));
  const scores = (index: number): [number, number] => (index + demo.seed) % 2 ? [11, 4 + ((index * 3 + demo.seed) % 6)] : [4 + ((index * 3 + demo.seed) % 6), 11];
  const fullMatches: Match[] = [];
  function addMatch(a: string[], b: string[], round: number, court: number) {
    const i = fullMatches.length;
    const [sa, sb] = scores(i);
    fullMatches.push({ id: `demo-pool-${i}`, round_number: round, court_number: court, court_label: null, team_a_player_1_id: a[0], team_a_player_2_id: a[1] || null, team_b_player_1_id: b[0], team_b_player_2_id: b[1] || null, team_a_score: sa, team_b_score: sb, is_complete: true, is_bye: false });
  }
  if (isCream || style === 'rotating') {
    let stagePlayers = players;
    for (let stage = 0; stage < (isCream ? 3 : 1); stage++) {
      const start = stage * 3 + 1;
      for (const m of buildCreamOfTheCropStageSchedule(stagePlayers, start)) addMatch([m.team_a_player_1_id!, m.team_a_player_2_id!], [m.team_b_player_1_id!, m.team_b_player_2_id!], m.round_number, m.court_number!);
      if (isCream && stage < 2) stagePlayers = buildNextCreamOfTheCropStagePlayers(stagePlayers, fullMatches, start).map(p => ({ ...p, pool_number: players.find(original => original.id === p.id)!.pool_number }));
    }
  } else if (style === 'mixed') {
    // Alternate partners without ever pairing two players of the same gender.
    for (let round = 1; round <= 3; round++) for (let i = 0; i < players.length; i += 4) {
      const p = players.slice(i, i + 4).map(p => p.id);
      addMatch([p[0], p[round % 2 ? 1 : 3]], [p[2], p[round % 2 ? 3 : 1]], round, i / 4 + 1);
    }
  } else {
    const teams = isSingles ? players.map(p => [p.id]) : Array.from({ length: players.length / 2 }, (_, i) => [players[i * 2].id, players[i * 2 + 1].id]);
    const order = teams.map((_, i) => i);
    for (let round = 1; round <= 3; round++) {
      for (let i = 0; i < order.length / 2; i++) addMatch(teams[order[i]], teams[order[order.length - 1 - i]], round, i + 1);
      order.splice(1, 0, order.pop()!);
    }
  }
  const matches = fullMatches.filter(m => !isCream || m.round_number <= Math.min(9, (Math.floor(demo.step / 3) + 1) * 3)).map(m => ({ ...m, is_complete: demo.step >= m.round_number, team_a_score: demo.step >= m.round_number ? m.team_a_score : null, team_b_score: demo.step >= m.round_number ? m.team_b_score : null }));
  function rank(source: Match[]) {
    return players.map(p => {
      const played = source.filter(m => m.is_complete && [m.team_a_player_1_id, m.team_a_player_2_id, m.team_b_player_1_id, m.team_b_player_2_id].includes(p.id));
      let wins = 0, pointsFor = 0, pointsAgainst = 0;
      played.forEach(m => { const a = [m.team_a_player_1_id, m.team_a_player_2_id].includes(p.id); const own = (a ? m.team_a_score : m.team_b_score)!; const other = (a ? m.team_b_score : m.team_a_score)!; wins += Number(own > other); pointsFor += own; pointsAgainst += other; });
      return { playerId: p.id, slotNumber: p.slot_number, name: p.display_name, gender: p.gender, played: played.length, wins, losses: played.length - wins, pointsFor, pointsAgainst, pointDiff: pointsFor - pointsAgainst, finalCourt: isCream ? played.at(-1)?.court_number ?? null : null };
    }).sort((a, b) => (isCream && demo.step >= 9 ? (a.finalCourt || 99) - (b.finalCourt || 99) : 0) || b.wins - a.wins || b.pointDiff - a.pointDiff || a.slotNumber - b.slotNumber);
  }
  const standings = rank(matches);
  const pools = Array.from({ length: players.length / 4 }, (_, i) => ({ poolNumber: i + 1, standings: standings.filter(s => players.find(p => p.id === s.playerId)!.pool_number === i + 1) }));
  const fullStandings = rank(fullMatches);
  const fullPlayoffs: Array<DemoPlayoff & { availableA: number; availableB: number }> = [];
  const pair = (ids: string[]) => style === 'mixed'
    ? ids.filter(id => players.find(p => p.id === id)!.gender === 'male').map((id, i) => [id, ids.filter(id => players.find(p => p.id === id)!.gender === 'female')[i]])
    : Array.from({ length: ids.length / 2 }, (_, i) => ids.slice(i * 2, i * 2 + 2));
  if (isPool) {
    const qualifying = new Set<string>();
    for (const pool of pools) {
      const ranked = fullStandings.filter(s => pool.standings.some(p => p.playerId === s.playerId));
      const top = style === 'mixed' ? [ranked.find(p => p.gender === 'male')!, ranked.find(p => p.gender === 'female')!] : ranked.slice(0, 2);
      top.forEach(p => qualifying.add(p.playerId));
    }
    const groups = postseason === 'split' ? [true, false] : [true];
    for (const championship of groups) {
      const ids = fullStandings.filter(s => postseason !== 'split' || qualifying.has(s.playerId) === championship).map(s => s.playerId);
      const teams = pair(ids);
      const limit = postseason === 'triple' ? 3 : postseason === 'double' ? 2 : 1;
      const graph = postseason === 'single_consolation' ? buildFirstRoundConsolationGraph(teams.length) : buildFixedEliminationGraph(teams.length, limit);
      const outcomes = new Map<string, { winner: string[]; loser: string[]; round: number }>();
      const losses = new Map<string, number>();
      const prefix = championship ? 'championship' : 'consolation';
      const source = (s: BracketSource) => s.kind === 'seed' ? { team: teams[s.seed - 1], round: 3 } : { team: outcomes.get(s.matchKey)![s.outcome], round: outcomes.get(s.matchKey)!.round };
      function add(a: string[], b: string[], round: number, availableA: number, availableB: number, key: string, section: DemoPlayoff['elimination_section'], label: string) {
        const [sa, sb] = scores(fullPlayoffs.length + 31);
        const winner = sa > sb ? a : b, loser = sa > sb ? b : a;
        losses.set(loser.join('|'), (losses.get(loser.join('|')) || 0) + 1);
        const bracket = championship && (section === null || section === 'main' || section === 'finals') ? 'championship' : 'consolation';
        fullPlayoffs.push({ id: `${prefix}-${key}`, bracket_type: bracket, elimination_section: section, round_number: round, match_number: fullPlayoffs.filter(m => m.round_number === round).length + 1, round_label: label, team_a_seed: teams.findIndex(t => t.join('|') === a.join('|')) + 1, team_b_seed: teams.findIndex(t => t.join('|') === b.join('|')) + 1, team_a_player_1_id: a[0], team_a_player_2_id: a[1], team_b_player_1_id: b[0], team_b_player_2_id: b[1], team_a_score: sa, team_b_score: sb, winner_team: sa > sb ? 'A' : 'B', next_match_id: null, is_bye: false, is_complete: true, winner_player_1_id: winner[0], winner_player_2_id: winner[1], availableA, availableB });
        return { winner, loser, round };
      }
      const sectioned = limit > 1 || postseason === 'single_consolation';
      for (const m of graph.matches) {
        const a = source(m.inputA), b = source(m.inputB);
        const round = Math.max(a.round, b.round) + 1;
        const title = m.section === 'main' ? 'Main Draw' : m.section === 'second_chance' ? 'Second Chance' : 'Last Chance';
        outcomes.set(m.key, add(a.team, b.team, round, a.round, b.round, m.key, sectioned ? m.section : null, `${title} · Round ${m.sectionRound}`));
      }
      for (const m of graph.matches) {
        const next = graph.matches.find(n => [n.inputA, n.inputB].some(s => s.kind === 'match' && s.matchKey === m.key && s.outcome === 'winner'));
        if (next) fullPlayoffs.find(p => p.id === `${prefix}-${m.key}`)!.next_match_id = `${prefix}-${next.key}`;
      }
      if (limit > 1) {
        const finalists = Object.values(graph.champions).map(s => source(s!).team);
        let round = Math.max(...fullPlayoffs.map(m => m.round_number));
        let active = finalists.filter(t => (losses.get(t.join('|')) || 0) < limit);
        while (active.length > 1) {
          active.sort((a, b) => (losses.get(b.join('|')) || 0) - (losses.get(a.join('|')) || 0) || teams.indexOf(a) - teams.indexOf(b));
          const previous = round++;
          add(active[0], active[1], round, previous, previous, `final-${round}`, 'finals', 'Championship Final');
          active = active.filter(t => (losses.get(t.join('|')) || 0) < limit);
        }
      }
    }
  }
  const playoffs: DemoPlayoff[] = demo.step < 3 ? [] : fullPlayoffs.filter(m => m.elimination_section !== 'finals' || Math.max(m.availableA, m.availableB) <= demo.step).map(({ availableA, availableB, ...m }) => {
    const done = demo.step >= m.round_number;
    return { ...m, is_complete: done, team_a_player_1_id: demo.step >= availableA ? m.team_a_player_1_id : null, team_a_player_2_id: demo.step >= availableA ? m.team_a_player_2_id : null, team_b_player_1_id: demo.step >= availableB ? m.team_b_player_1_id : null, team_b_player_2_id: demo.step >= availableB ? m.team_b_player_2_id : null, team_a_seed: demo.step >= availableA ? m.team_a_seed : null, team_b_seed: demo.step >= availableB ? m.team_b_seed : null, team_a_score: done ? m.team_a_score : null, team_b_score: done ? m.team_b_score : null, winner_team: done ? m.winner_team : null, winner_player_1_id: done ? m.winner_player_1_id : null, winner_player_2_id: done ? m.winner_player_2_id : null };
  });
  return { players, matches, standings, pools, playoffs, isPool, isCream, isSingles, courts: players.length / (isSingles ? 2 : 4), maxStep: Math.max(isCream ? 9 : 3, ...fullPlayoffs.map(m => m.round_number)) };
}
