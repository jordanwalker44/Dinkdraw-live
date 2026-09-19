import { buildCreamOfTheCropStageSchedule } from './scheduler';
import { buildFixedEliminationGraph, type BracketSource } from './multi-elimination';
import type { BracketMatch } from '../components/TournamentBracket';

export type ClubDemo = {
  id: string; name: string; title: string; logo: string | null;
  primary: string; accent: string; names: string[];
  format: 'pool' | 'round_robin'; step: number; seed: number;
};
const first = ['Alex', 'Morgan', 'Taylor', 'Jordan', 'Casey', 'Riley', 'Jamie', 'Avery', 'Cameron', 'Quinn', 'Drew', 'Reese', 'Sam', 'Parker', 'Skyler', 'Blake', 'Robin', 'Charlie', 'Dakota', 'Hayden', 'Jess', 'Rowan', 'Emerson', 'Finley', 'Logan', 'Harper', 'Kendall', 'Sage', 'Payton', 'River'];
const last = ['Bennett', 'Chen', 'Davis', 'Ellis', 'Garcia', 'Hayes', 'Johnson', 'Kim', 'Lopez', 'Miller', 'Nguyen', 'Patel', 'Reed', 'Santos', 'Turner', 'Wilson'];
export function demoNames(count: number, offset = 0) {
  return Array.from({ length: count }, (_, i) => `${first[(i + offset) % first.length]} ${last[(i * 7 + offset) % last.length]}`);
}
export function newClubDemo(): ClubDemo {
  return { id: crypto.randomUUID(), name: 'Your Club', title: 'Saturday Pickleball Classic', logo: null, primary: '#00274C', accent: '#FFCB05', names: demoNames(16), format: 'pool', step: 0, seed: 1 };
}
export function buildClubDemo(demo: ClubDemo) {
  const players = demo.names.map((name, i) => ({ id: `demo-player-${i}`, tournament_id: demo.id, slot_number: i + 1, display_name: name, claimed_by_user_id: null, gender: null, pool_number: Math.floor(i / 4) + 1 }));
  const scores = (index: number): [number, number] => (index + demo.seed) % 2 ? [11, 4 + ((index * 3 + demo.seed) % 6)] : [4 + ((index * 3 + demo.seed) % 6), 11];
  const matches = buildCreamOfTheCropStageSchedule(players, 1).map((m, i) => ({ ...m, id: `demo-pool-${i}`, team_a_score: demo.step >= m.round_number ? scores(i)[0] : null, team_b_score: demo.step >= m.round_number ? scores(i)[1] : null, is_complete: demo.step >= m.round_number }));
  const standings = players.map(p => {
    const played = matches.filter(m => m.is_complete && [m.team_a_player_1_id, m.team_a_player_2_id, m.team_b_player_1_id, m.team_b_player_2_id].includes(p.id));
    let wins = 0, pointsFor = 0, pointsAgainst = 0;
    played.forEach(m => { const a = [m.team_a_player_1_id, m.team_a_player_2_id].includes(p.id); const own = (a ? m.team_a_score : m.team_b_score)!; const other = (a ? m.team_b_score : m.team_a_score)!; wins += Number(own > other); pointsFor += own; pointsAgainst += other; });
    return { playerId: p.id, slotNumber: p.slot_number, name: p.display_name, played: played.length, wins, losses: played.length - wins, pointsFor, pointsAgainst, pointDiff: pointsFor - pointsAgainst, finalCourt: null };
  }).sort((a, b) => b.wins - a.wins || b.pointDiff - a.pointDiff || a.slotNumber - b.slotNumber);
  const pools = Array.from({ length: players.length / 4 }, (_, i) => ({ poolNumber: i + 1, standings: standings.filter(s => players.find(p => p.id === s.playerId)!.pool_number === i + 1) }));
  const playoffs: Array<BracketMatch & { bracket_type: 'championship' | 'consolation'; winner_player_1_id: string | null; winner_player_2_id: string | null; elimination_section: null }> = [];
  const bracketRounds = Math.log2(players.length / 4);
  if (demo.format === 'pool' && demo.step >= 3) {
    for (const bracket of ['championship', 'consolation'] as const) {
      const teams = pools.map(p => p.standings.slice(bracket === 'championship' ? 0 : 2, bracket === 'championship' ? 2 : 4).map(s => s.playerId));
      const graph = buildFixedEliminationGraph(teams.length, 1);
      const winners = new Map<string, string[]>();
      const resolve = (source: BracketSource): string[] => source.kind === 'seed' ? teams[source.seed - 1] : winners.get(source.matchKey) || [];
      for (const m of graph.matches) {
        const a = resolve(m.inputA), b = resolve(m.inputB);
        const done = demo.step >= 3 + m.sectionRound && a.length === 2 && b.length === 2;
        const [sa, sb] = scores(m.matchNumber + m.sectionRound + (bracket === 'consolation' ? 3 : 0));
        const winner = done ? sa > sb ? a : b : [];
        if (done) winners.set(m.key, winner);
        const next = graph.matches.find(n => [n.inputA, n.inputB].some(s => s.kind === 'match' && s.matchKey === m.key));
        playoffs.push({ id: `${bracket}-${m.key}`, bracket_type: bracket, round_number: m.sectionRound + 3, match_number: m.matchNumber, round_label: m.sectionRound === bracketRounds ? 'Final' : m.sectionRound === bracketRounds - 1 ? 'Semifinal' : 'Quarterfinal', team_a_seed: m.inputA.kind === 'seed' ? m.inputA.seed : null, team_b_seed: m.inputB.kind === 'seed' ? m.inputB.seed : null, team_a_player_1_id: a[0] || null, team_a_player_2_id: a[1] || null, team_b_player_1_id: b[0] || null, team_b_player_2_id: b[1] || null, team_a_score: done ? sa : null, team_b_score: done ? sb : null, winner_team: done ? sa > sb ? 'A' : 'B' : null, next_match_id: next ? `${bracket}-${next.key}` : null, is_bye: false, is_complete: done, winner_player_1_id: winner[0] || null, winner_player_2_id: winner[1] || null, elimination_section: null });
      }
    }
  }
  return { players, matches, standings, pools, playoffs, maxStep: demo.format === 'pool' ? 3 + bracketRounds : 3 };
}
