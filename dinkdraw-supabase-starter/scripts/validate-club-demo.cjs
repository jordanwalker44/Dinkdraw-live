const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
// Compile only the pure demo engine and its local TypeScript dependencies.
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText, filename);
const { buildClubDemo, demoNames } = require('../lib/club-demo.ts');
for (const count of [8, 16, 32]) {
  for (const format of ['pool', 'round_robin']) {
    const base = { id: 'test', name: 'Demo club', title: 'Test event', logo: null, primary: '#00274C', accent: '#FFCB05', names: demoNames(count), format, seed: 7, step: 0 };
    assert.equal(new Set(base.names).size, count);
    const max = buildClubDemo(base).maxStep;
    for (let step = 0; step <= max; step++) {
      const result = buildClubDemo({ ...base, step });
      assert.equal(result.matches.length, count / 4 * 3);
      for (const round of [1, 2, 3]) {
        const ids = result.matches.filter(m => m.round_number === round).flatMap(m => [m.team_a_player_1_id, m.team_a_player_2_id, m.team_b_player_1_id, m.team_b_player_2_id]);
        assert.equal(ids.length, count);
        assert.equal(new Set(ids).size, count, 'Each player plays exactly once per pool round');
      }
      assert.equal(result.standings.reduce((n, p) => n + p.wins, 0), result.standings.reduce((n, p) => n + p.losses, 0));
      assert.equal(result.standings.reduce((n, p) => n + p.pointDiff, 0), 0);
      assert(result.standings.every(p => p.played === Math.min(step, 3)));
      if (step < 3 || format === 'round_robin') assert.equal(result.playoffs.length, 0);
      for (const match of result.playoffs) {
        if (!match.is_complete) { assert.equal(match.team_a_score, null); assert.equal(match.winner_player_1_id, null); continue; }
        const winner = match.team_a_score > match.team_b_score ? [match.team_a_player_1_id, match.team_a_player_2_id] : [match.team_b_player_1_id, match.team_b_player_2_id];
        assert.deepEqual([match.winner_player_1_id, match.winner_player_2_id], winner);
        if (match.next_match_id) {
          const next = result.playoffs.find(m => m.id === match.next_match_id);
          assert(next);
          assert([next.team_a_player_1_id, next.team_b_player_1_id].includes(winner[0]), 'Winner advances to next round');
        }
      }
      if (step === max && format === 'pool') {
        assert(result.playoffs.every(m => m.is_complete));
        assert.equal(result.playoffs.filter(m => !m.next_match_id).length, 2);
      }
      assert.deepEqual(result, buildClubDemo({ ...base, step }), 'Saved demos reproduce identical scores');
    }
    const reset = buildClubDemo(base);
    assert(reset.matches.every(m => !m.is_complete && m.team_a_score === null));
    assert.equal(reset.playoffs.length, 0);
  }
}
console.log('Club demo checks passed: rosters, scheduling, standings, bracket advancement, reproducibility, and reset.');

for (const count of [8, 16, 32]) for (const format of ['round_robin', 'cream', 'pool', 'moneyball', 'league']) {
  const styles = ['cream', 'league'].includes(format) ? ['rotating'] : format === 'round_robin' ? ['rotating', 'fixed', 'mixed', 'singles'] : ['rotating', 'mixed'];
  for (const playStyle of styles) for (const postseason of ['split', 'single', 'single_consolation', 'double', 'triple']) {
    const base = { id: 'expanded', names: demoNames(count), format, playStyle, postseason, seed: 3, step: 0 };
    const max = buildClubDemo(base).maxStep;
    const end = buildClubDemo({ ...base, step: max });
    assert(end.matches.every(m => m.is_complete));
    assert(end.playoffs.every(m => m.is_complete));
    for (let step = 0; step <= max; step++) {
      const d = buildClubDemo({ ...base, step });
      assert(d.matches.every(m => m.is_complete === (m.round_number <= step)));
      for (const round of new Set([...d.matches, ...d.playoffs].map(m => m.round_number))) {
        const ids = [...d.matches, ...d.playoffs].filter(m => m.round_number === round).flatMap(m => [m.team_a_player_1_id, m.team_a_player_2_id, m.team_b_player_1_id, m.team_b_player_2_id].filter(Boolean));
        assert.equal(new Set(ids).size, ids.length, `${format}/${postseason}: no player appears twice in round ${round}`);
      }
      for (const m of d.playoffs.filter(m => !m.is_complete)) assert.equal(m.team_a_score, null);
    }
    if (playStyle === 'mixed') for (const m of end.matches) {
      for (const ids of [[m.team_a_player_1_id, m.team_a_player_2_id], [m.team_b_player_1_id, m.team_b_player_2_id]]) assert.equal(new Set(ids.map(id => end.players.find(p => p.id === id).gender)).size, 2);
    }
    if (format === 'league') { assert.equal(max, 12); assert(end.standings.every(p => p.played === 12)); }
    if (format === 'cream') {
      assert.equal(max, 9);
      assert(end.standings.every(p => p.played === 9 && p.finalCourt));
      assert.equal(buildClubDemo({ ...base, step: 0 }).matches.length, count / 4 * 3);
      assert.equal(buildClubDemo({ ...base, step: 3 }).matches.length, count / 4 * 6);
    }
    if (end.isPool && ['double', 'triple'].includes(postseason)) {
      const losses = new Map();
      for (const m of end.playoffs) {
        const loser = m.winner_team === 'A' ? m.team_b_player_1_id : m.team_a_player_1_id;
        losses.set(loser, (losses.get(loser) || 0) + 1);
      }
      const limit = postseason === 'double' ? 2 : 3;
      const finalists = end.playoffs.filter(m => m.elimination_section === 'finals');
      assert(finalists.length > 0);
      const winner = finalists.at(-1).winner_player_1_id;
      const teamIds = new Set(end.playoffs.flatMap(m => [m.team_a_player_1_id, m.team_b_player_1_id]));
      for (const team of teamIds) assert(team === winner ? (losses.get(team) || 0) < limit : losses.get(team) === limit, `${postseason}: elimination loss limit`);
    }
  }
}
console.log('Expanded formats passed: play styles, all postseason structures, elimination loss limits, and nine-round Cream progression.');

const { buildClubDemoStats } = require('../lib/club-demo-stats.ts');
for (const format of ['pool', 'cream', 'league', 'round_robin', 'moneyball']) {
  const base = { id: 'stats', title: 'Current demo', names: demoNames(16), format, seed: 4, step: 0, postseason: 'triple' };
  const before = buildClubDemoStats(base, 'demo-player-0');
  assert.equal(before.events.length, 4);
  assert.equal(before.matches.length, 9);
  assert.equal(buildClubDemoStats(base, 'demo-player-0', false).matches.length, 0);
  const finalDemo = { ...base, step: buildClubDemo(base).maxStep };
  const career = buildClubDemoStats(finalDemo, 'demo-player-0');
  const current = buildClubDemoStats(finalDemo, 'demo-player-0', false);
  assert.equal(career.matches.length, before.matches.length + current.matches.length);
  assert.equal(career.wins + career.losses, career.matches.length);
  assert.equal(career.pointDiff, career.pointsFor - career.pointsAgainst);
  assert.equal(career.pointsFor, before.pointsFor + current.pointsFor);
  assert.equal(new Set(career.matches.map(m => m.id)).size, career.matches.length);
  assert.equal(career.partners.reduce((n, p) => n + p.played, 0), career.matches.length);
  assert.deepEqual(buildClubDemoStats(base, 'demo-player-0'), before, 'Reset restores statistics without accumulating duplicates');
}
console.log('Demo stats passed: history, current-event totals, partnership totals, IDs, and reset.');
