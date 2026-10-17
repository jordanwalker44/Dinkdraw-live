const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');
function compile(source, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, console, Math, require: name => dependencies[name] || {} });
  return exports;
}
const rotation = compile(fs.readFileSync(path.join(root, 'lib/rotating-doubles.ts'), 'utf8'));
// Exercise the actual page entry points, including dispatch, serving-side and
// court post-processing, without mounting React or touching a live tournament.
const page = compile(fs.readFileSync(path.join(root, 'app/tournament/[id]/page.tsx'), 'utf8') +
  '\nexport { buildSchedule, balanceDoublesCourtsInSchedule };', {
  '../../../lib/rotating-doubles': rotation,
});
function players(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, slot_number: i + 1,
    display_name: `Player ${i}`, gender: i % 2 ? 'female' : 'male' }));
}
function audit(rows, n, rounds, courts) {
  const partners = new Map(), opponents = new Map();
  const usage = Array.from({ length: n }, () => Array(courts).fill(0));
  const key = (a, b) => [a, b].sort().join('|');
  const add = (map, a, b) => map.set(key(a, b), (map.get(key(a, b)) || 0) + 1);
  for (let r = 1; r <= rounds; r++) {
    const seen = new Set(), usedCourts = new Set();
    for (const row of rows.filter(row => row.round_number === r)) {
      const a = [row.team_a_player_1_id, row.team_a_player_2_id].filter(Boolean);
      const b = [row.team_b_player_1_id, row.team_b_player_2_id].filter(Boolean);
      for (const id of [...a, ...b]) {
        assert(!seen.has(id), `double booking ${id} round ${r}`); seen.add(id);
        assert(/^p\d+$/.test(id) && +id.slice(1) < n);
      }
      if (row.is_bye) { assert.equal(row.court_number, null); continue; }
      assert.equal(a.length + b.length, 4);
      assert(row.court_number >= 1 && row.court_number <= courts);
      assert(!usedCourts.has(row.court_number)); usedCourts.add(row.court_number);
      add(partners, ...a); add(partners, ...b);
      for (const p of a) for (const q of b) add(opponents, p, q);
      for (const id of [...a, ...b]) usage[+id.slice(1)][row.court_number - 1]++;
      assert.equal(row.team_a_score, null); assert.equal(row.is_complete, false);
    }
    assert.equal(seen.size, n, `missing players round ${r}`);
  }
  return { partners, opponents, usage };
}
console.time('full rotations');
for (let run = 0; run < 12; run++) {
  const rows = page.buildSchedule(players(12), 11, 3, 'doubles', 'rotating');
  const { partners, opponents, usage } = audit(rows, 12, 11, 3);
  assert.equal(rows.length, 33);
  assert.equal(partners.size, 66); assert([...partners.values()].every(n => n === 1));
  assert.equal(opponents.size, 66); assert([...opponents.values()].every(n => n === 2));
  assert(usage.every(c => Math.max(...c) - Math.min(...c) <= 2));
  assert(usage.filter(c => Math.max(...c) - Math.min(...c) === 1).length >= 9);
}
console.timeEnd('full rotations');
for (const rounds of [1, 3, 6, 7, 10]) {
  console.log('Checking partial rotation', rounds);
  const rows = page.buildSchedule(players(12), rounds, 3, 'doubles', 'rotating');
  const result = audit(rows, 12, rounds, 3);
  assert([...result.partners.values()].every(n => n === 1));
  assert([...result.opponents.values()].every(n => n <= 2));
}
for (const [n, rounds, courts, mode] of [[4,3,1,'rotating'],[8,7,2,'rotating'],[10,3,2,'rotating'],[12,3,2,'rotating'],[16,3,4,'rotating'],[12,3,3,'fixed'],[12,3,3,'mixed'],[12,12,3,'rotating']]) {
  console.log('Checking fallback', n, rounds, courts, mode);
  audit(page.buildSchedule(players(n), rounds, courts, 'doubles', mode), n, rounds, courts);
}
// A pathological initial court assignment must improve without altering teams.
const raw = rotation.buildTwelvePlayerRotation(players(12).map(p => p.id), 11);
const unbalanced = raw.map((row, i) => ({ ...row, court_number: i % 3 + 1 }));
const balanced = page.balanceDoublesCourtsInSchedule(unbalanced, players(12).map(p => p.id));
assert(rotation.scoreRotatingCourtBalance(balanced, players(12).map(p => p.id)) < rotation.scoreRotatingCourtBalance(unbalanced, players(12).map(p => p.id)));
const signature = rows => rows.map(r => [r.round_number, ...[r.team_a_player_1_id,r.team_a_player_2_id,r.team_b_player_1_id,r.team_b_player_2_id]].join(':')).sort().join(',');
assert.equal(signature(balanced), signature(unbalanced));
assert.throws(() => rotation.buildTwelvePlayerRotation(['duplicate'], 11));
console.log('Passed: 12 randomized full rotations, partial rounds, court fairness, dispatch, byes, and other formats.');
