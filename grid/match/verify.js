/* RunTheGrid — QA harness (design doc §11).
 * node verify.js
 * Asserts every authored board has exactly one solution, trap density lands in
 * 3–6, and family/sport spread holds; then dry-runs a year of daily generation. */
'use strict';
var Gen = require('./generator.js');
var BANK = require('./data.js');

var fail = 0;
function ok(cond, msg) { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fail++; }

console.log('\n=== Board bank (' + BANK.length + ' boards) ===');
BANK.forEach(function (board) {
  console.log('\n' + board.id);
  var res = Gen.solve(board);
  ok(res.count === 1, 'exactly one valid assignment (found ' + res.count + ')');

  // the authored solution must equal the solver's solution
  if (res.solution) {
    var mismatch = board.tiles.some(function (tl) {
      var solvedCat = res.solution[tl.id];
      var authoredCat = Object.keys(board.solution).filter(function (c) {
        return board.solution[c].indexOf(tl.id) !== -1;
      })[0];
      return solvedCat !== authoredCat;
    });
    ok(!mismatch, 'authored solution matches the unique solution');
  }

  var traps = Gen.trapEdges(board);
  ok(traps >= 3 && traps <= 6, 'trap density in 3–6 (got ' + traps + ')');

  var fams = {}; board.categories.forEach(function (c) { fams[c.family] = (fams[c.family] || 0) + 1; });
  var famCount = Object.keys(fams).length;
  var maxFam = Math.max.apply(null, Object.keys(fams).map(function (k) { return fams[k]; }));
  ok(famCount >= 3, 'family spread >= 3 (got ' + famCount + ': ' + Object.keys(fams).join(', ') + ')');
  ok(maxFam <= 2, 'no family supplies > 2 categories (max ' + maxFam + ')');

  var sports = {};
  board.categories.forEach(function (c) { sports[c.sport] = 1; });
  board.tiles.forEach(function (tl) { sports[tl.sport] = 1; });
  ok(Object.keys(sports).length >= 3, 'sport spread >= 3 (' + Object.keys(sports).join(', ') + ')');

  // every category has exactly 5 tiles in the solution, all 25 accounted for
  var total = 0;
  board.categories.forEach(function (c) { total += (board.solution[c.id] || []).length; });
  ok(total === 25, 'all 25 tiles assigned (got ' + total + ')');
});

console.log('\n=== Dry-run 365 consecutive days ===');
var start = Date.UTC(2026, 6, 22);
var genFail = 0, seen = {};
for (var d = 0; d < 365; d++) {
  var dt = new Date(start + d * 86400000).toISOString().slice(0, 10);
  try {
    var day = Gen.generateDaily(dt, BANK);
    if (!day || day.lanes.length !== 5 || day.tiles.length !== 25) genFail++;
    seen[day.boardId] = (seen[day.boardId] || 0) + 1;
  } catch (e) { genFail++; }
}
ok(genFail === 0, '365 days generated without failure (' + genFail + ' failures)');
console.log('  board usage over the year: ' + JSON.stringify(seen));

// determinism: same date -> identical tile order
var g1 = Gen.generateDaily('2026-07-22', BANK);
var g2 = Gen.generateDaily('2026-07-22', BANK);
ok(JSON.stringify(g1.tiles) === JSON.stringify(g2.tiles), 'generation is deterministic per date');

console.log('\n' + (fail === 0 ? 'ALL CHECKS PASSED' : fail + ' CHECK(S) FAILED') + '\n');
process.exit(fail === 0 ? 0 : 1);
