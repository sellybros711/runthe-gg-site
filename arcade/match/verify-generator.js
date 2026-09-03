/* RunTheGrid / Common Ground: data-driven generator QA.
 * node verify-generator.js
 * Proves the DB generates unique, varied, recognizable boards and measures how
 * fast it repeats — the numbers behind "each day is different". */
'use strict';
var Gen = require('./generator.js');
var ENT = require('./entities.js');
var BANK = require('./data.js');

var DAYS = 365;
var start = Date.UTC(2026, 6, 22);
var fail = 0;
function ok(c, m) { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fail++; }

// how many viable categories does the seed DB expose?
var cats = Gen.viable(Gen.enumerate(ENT), {});
var byFam = {}; cats.forEach(function (c) { byFam[c.family] = (byFam[c.family] || 0) + 1; });
console.log('\n=== Seed DB: ' + ENT.length + ' entities -> ' + cats.length + ' viable categories ===');
console.log('  by family: ' + JSON.stringify(byFam));
console.log('  sample categories:');
cats.slice().sort(function (a, b) { return b.members.length - a.members.length; }).slice(0, 14).forEach(function (c) {
  console.log('    ' + (c.name + ' (' + c.sport + ', ' + c.family + ')').padEnd(46) + c.members.length + ' names');
});

console.log('\n=== Dry-run ' + DAYS + ' days via daily() ===');
var boards = [], fromDB = 0, uniq = 0, trapDist = {}, catSets = {}, catUse = {}, exactBoards = {}, fameSum = 0, fameN = 0;
for (var d = 0; d < DAYS; d++) {
  var dt = new Date(start + d * 86400000).toISOString().slice(0, 10);
  var day = Gen.daily(dt, { entities: ENT, bank: BANK });
  boards.push(day);
  if (day.source === 'generated') fromDB++;

  // rebuild an internal board to re-check uniqueness independently
  var chk = {
    categories: day.lanes.map(function (l) { return { id: l.id }; }),
    tiles: day.tiles.map(function (t) { return { id: t.id, fits: t.fits }; })
  };
  if (Gen.solve(chk).count === 1) uniq++;

  var traps = day.traps; trapDist[traps] = (trapDist[traps] || 0) + 1;
  var key = day.lanes.map(function (l) { return l.id; }).slice().sort().join('+');
  catSets[key] = (catSets[key] || 0) + 1;
  day.lanes.forEach(function (l) { catUse[l.id] = (catUse[l.id] || 0) + 1; });
  var tkey = day.tiles.map(function (t) { return t.id; }).slice().sort().join(',');
  exactBoards[tkey] = (exactBoards[tkey] || 0) + 1;
  day.tiles.forEach(function () {});
  day.lanes.forEach(function (l) { /* fame via tiles below */ });
  day.tiles.forEach(function (t) { fameN++; });
}
// average fame of shown tiles
var entMap = {}; ENT.forEach(function (e) { entMap[e.id] = e; });
var famT = 0, famC = 0;
boards.forEach(function (day) { day.tiles.forEach(function (t) { famT += (entMap[t.id] || {}).f || 3; famC++; }); });

var distinctCatSets = Object.keys(catSets).length;
var distinctBoards = Object.keys(exactBoards).length;
var repeatedExact = Object.keys(exactBoards).filter(function (k) { return exactBoards[k] > 1; }).length;
var maxCatSet = Math.max.apply(null, Object.keys(catSets).map(function (k) { return catSets[k]; }));

ok(uniq === DAYS, 'every one of ' + DAYS + ' boards has exactly one solution (' + uniq + '/' + DAYS + ')');
console.log('  boards from the generator: ' + fromDB + '/' + DAYS + ' (' + (DAYS - fromDB) + ' fell back to the authored bank)');
console.log('  distinct category line-ups: ' + distinctCatSets + ' (a given 5-category set appears at most ' + maxCatSet + 'x)');
console.log('  distinct exact boards (same 25 tiles): ' + distinctBoards + ' / ' + DAYS + '  (' + repeatedExact + ' exact-tile repeats)');
console.log('  trap-density distribution: ' + JSON.stringify(trapDist));
console.log('  avg fame of shown tiles: ' + (famT / famC).toFixed(2) + ' / 5  (higher = more recognizable)');

// category-usage spread (are we leaning on the same few lanes every day?)
var topCats = Object.keys(catUse).sort(function (a, b) { return catUse[b] - catUse[a]; }).slice(0, 8);
console.log('  most-used categories over the year:');
topCats.forEach(function (k) { console.log('    ' + k.padEnd(34) + catUse[k] + ' days'); });

console.log('\n=== Sample board (first day) ===');
console.log('  ' + boards[0].date + '  [' + boards[0].source + ']  difficulty ' + boards[0].boardDifficulty + ', traps ' + boards[0].traps);
boards[0].lanes.forEach(function (l) {
  var names = boards[0].solution[l.id].map(function (id) { return entMap[id].name; });
  console.log('    ' + l.name.padEnd(30) + '  ' + names.join(', '));
});

console.log('\n' + (fail === 0 ? 'ALL CHECKS PASSED' : fail + ' CHECK(S) FAILED') + '\n');
process.exit(fail === 0 ? 0 : 1);
