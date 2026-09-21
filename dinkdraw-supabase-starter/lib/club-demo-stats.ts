import { buildClubDemo, type ClubDemo } from './club-demo';

/** All historical records are generated locally; no real profiles or results are read. */
export function buildClubDemoStats(demo: ClubDemo, playerId: string, includeHistory = true) {
  const historical = ['Club Social', 'Weekend Round Robin', 'Friday Night Doubles'].map((title, i) => ({
    ...demo, id: `${demo.id}-history-${i}`, title, format: 'round_robin' as const,
    playStyle: 'rotating' as const, seed: demo.seed + i + 4, step: 3,
  }));
  const events = [...(includeHistory ? historical : []), demo].map((event, index) => {
    const data = buildClubDemo(event);
    const names = Object.fromEntries(data.players.map(p => [p.id, p.display_name]));
    const matches = [...data.matches, ...data.playoffs].filter(m => m.is_complete && !m.is_bye)
      .sort((a, b) => a.round_number - b.round_number || a.id.localeCompare(b.id))
      .filter(m => [m.team_a_player_1_id, m.team_a_player_2_id, m.team_b_player_1_id, m.team_b_player_2_id].includes(playerId))
      .map(m => {
        const a = [m.team_a_player_1_id, m.team_a_player_2_id].includes(playerId);
        const own = a ? [m.team_a_player_1_id, m.team_a_player_2_id] : [m.team_b_player_1_id, m.team_b_player_2_id];
        const opponents = a ? [m.team_b_player_1_id, m.team_b_player_2_id] : [m.team_a_player_1_id, m.team_a_player_2_id];
        const pointsFor = (a ? m.team_a_score : m.team_b_score)!;
        const pointsAgainst = (a ? m.team_b_score : m.team_a_score)!;
        const partner = own.find(id => id && id !== playerId) || null;
        return { id: `${event.id}-${m.id}`, title: event.title, round: m.round_number, pointsFor, pointsAgainst, win: pointsFor > pointsAgainst, partnerId: partner, partner: partner ? names[partner] : null, opponents: opponents.filter(Boolean).map(id => names[id!]).join(' & ') };
      });
    const completed = event.step >= data.maxStep;
    // Bracket placements differ by structure; only claim a first-place result for its champion.
    const final = data.playoffs.filter(m => m.bracket_type === 'championship' && m.is_complete && (!m.elimination_section || m.elimination_section === 'main' || m.elimination_section === 'finals')).at(-1);
    const placement = !completed || data.isLeague ? null : data.isPool
      ? final && [final.winner_player_1_id, final.winner_player_2_id].includes(playerId) ? 1 : null
      : data.standings.findIndex(p => p.playerId === playerId) + 1 || null;
    return { id: event.id, title: event.title, current: event.id === demo.id, label: event.id === demo.id ? 'Current event' : `${historical.length - index} events ago`, completed, placement, matches };
  });
  const matches = events.flatMap(e => e.matches);
  const wins = matches.filter(m => m.win).length;
  const pointsFor = matches.reduce((n, m) => n + m.pointsFor, 0);
  const pointsAgainst = matches.reduce((n, m) => n + m.pointsAgainst, 0);
  let bestWinStreak = 0, run = 0;
  for (const m of matches) { run = m.win ? run + 1 : 0; bestWinStreak = Math.max(bestWinStreak, run); }
  const latest = matches.at(-1);
  let currentStreak = 0;
  for (let i = matches.length - 1; i >= 0 && matches[i].win === latest?.win; i--) currentStreak++;
  const partners = [...new Set(matches.map(m => m.partnerId).filter(Boolean))].map(id => {
    const together = matches.filter(m => m.partnerId === id);
    const w = together.filter(m => m.win).length;
    return { id, name: together[0].partner!, played: together.length, wins: w, losses: together.length - w, winRate: Math.round(w / together.length * 100) };
  }).sort((a, b) => b.winRate - a.winRate || b.played - a.played || a.name.localeCompare(b.name));
  const placements = events.flatMap(e => e.placement === null ? [] : [e.placement]);
  return { events, matches, wins, losses: matches.length - wins, pointsFor, pointsAgainst,
    winRate: matches.length ? Math.round(wins / matches.length * 100) : 0,
    pointDiff: pointsFor - pointsAgainst, bestWinStreak,
    streak: latest ? `${latest.win ? 'W' : 'L'}${currentStreak}` : '—', partners,
    bestFinish: placements.length ? Math.min(...placements) : null,
    podiums: placements.filter(p => p <= 3).length, tournamentWins: placements.filter(p => p === 1).length,
  };
}
