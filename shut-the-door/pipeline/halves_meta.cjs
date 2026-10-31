/* Pack format 4 for a pack with one half: scenario.halves holds the spot as its one half, with the
   lineup in the order he would face it, and nothing else moves (the table, the pool, the library).
   Rules 8 plays such a pack exactly as rules 7 did.
     node shut-the-door/pipeline/halves_meta.cjs <pack.json> ...                                   */
'use strict';
const fs = require('fs');
for (const f of process.argv.slice(2)) {
  const pack = JSON.parse(fs.readFileSync(f, 'utf8'));
  const sc = pack.scenario, s = sc.situation;
  if (sc.halves && sc.halves.length > 1) { console.log('skip ' + f + ': it has ' + sc.halves.length + ' halves'); continue; }
  sc.halves = [{ inning: s.inning, half: s.half, outs: s.outs, bases: s.bases, walkOffLive: s.walkOffLive, lineup: sc.batters.map((_, i) => i), real: true }];
  sc.between = [];
  pack.v = 4;
  fs.writeFileSync(f, JSON.stringify(pack));
  console.log(sc.id + ': one half, ' + sc.batters.length + ' batters');
}
