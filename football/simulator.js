/* RunTheDrive validation harness. Run: `node simulator.js` (optionally with
   RTD_DIFFICULTY=-30 to sweep). Plays thousands of deterministic daily drives
   under fixed policies and prints the outcome distribution, so any change to
   the engine or generator can be re-checked in seconds. */
const ENGINE = require('./engine.js');
const PLAYBOOK = require('./playbook.js');

const SCHEMES = Object.keys(PLAYBOOK.schemes);

function fromEpoch(i) {           // deterministic date strings, no Date.now()
  const d = new Date(Date.UTC(2025, 0, 1) + i * 86400000);
  return d.toISOString().slice(0, 10);
}

// ---- Policies (bots) ----------------------------------------------------
// SKILLED: best drive-EV call vs the visible box; kick when 4th & out of a
// sensible go range, or when a makeable FG is the value play.
function skilled(s, sheet, box, gp) {
  const visible = { column: box >= 8 ? 'HEAVY_BOX' : box <= 6 ? 'LIGHT_BOX' : 'BASE_7' };
  // 4th-down / FG logic
  if (s.down === 4) {
    const goForItRange = s.distance <= 2 || s.toGoal <= 2;
    if (!goForItRange) {
      if (s.fg.inRange && s.toGoal > 3) return 'KICK';
      // out of FG range on 4th & long -> go for it (nothing to lose)
    }
  }
  // pick best EV tile
  let best = sheet[0], bestEv = -1e9;
  for (const t of sheet) {
    const ev = ENGINE.expectedValue(t.play, visible, { down:s.down, distance:s.distance, yardline:s.yardline }, gp.qualityModifier);
    if (ev > bestEv) { bestEv = ev; best = t; }
  }
  return best.id;
}
// SPAMMER: quick pass every down, never runs, never reads the box.
function spammer(s, sheet) {
  const q = sheet.find(t => t.id === 'SHORT') || sheet[0];
  if (s.down === 4 && s.fg.inRange && s.distance > 3 && s.toGoal > 3) return 'KICK';
  return q.id;
}
// AVERAGE: ignores down & distance entirely, random-ish call.
function average(s, sheet) {
  if (s.down === 4 && s.fg.inRange && s.distance > 4 && s.toGoal > 4) return 'KICK';
  const idx = (s.playNo * 2654435761) % sheet.length;
  return sheet[idx].id;
}

function simulate(policy, N) {
  const tally = { TOUCHDOWN:0, FIELD_GOAL:0, MISSED_FG:0, TURNOVER:0, TURNOVER_ON_DOWNS:0, CLOCK:0, SAFETY:0 };
  let plays = 0, yards = 0, grade = 0;
  for (let i = 0; i < N; i++) {
    const date = fromEpoch(i);
    const scheme = SCHEMES[i % SCHEMES.length];
    const s = ENGINE.runDrive(date, scheme, policy);
    tally[s.result] = (tally[s.result] || 0) + 1;
    plays += s.log.length; yards += (s.yardline - s.startYard); grade += s.callGrade;
  }
  const pct = k => (100 * (tally[k]||0) / N).toFixed(1);
  const fgOrBetter = (100 * ((tally.TOUCHDOWN + tally.FIELD_GOAL) / N)).toFixed(1);
  return { pct, tally, fgOrBetter, avgPlays: (plays/N).toFixed(1),
           avgYards:(yards/N).toFixed(1), avgGrade:(grade/N).toFixed(1) };
}

const N = Number(process.env.N || 6000);
console.log(`DIFFICULTY=${ENGINE.getDifficulty()}  N=${N} drives/policy  (schemes rotated)\n`);
console.log('policy     TD%   FG%  FG+  TO%  DOWNS%  CLOCK%  SAFE%  plays  yds  grade');
for (const [name, pol] of [['skilled',skilled],['spammer',spammer],['average',average]]) {
  const r = simulate(pol, N);
  console.log(
    name.padEnd(9),
    r.pct('TOUCHDOWN').padStart(5), r.pct('FIELD_GOAL').padStart(5),
    r.fgOrBetter.padStart(5),
    r.pct('TURNOVER').padStart(5), r.pct('TURNOVER_ON_DOWNS').padStart(6),
    r.pct('CLOCK').padStart(6), r.pct('SAFETY').padStart(6),
    r.avgPlays.padStart(6), r.avgYards.padStart(5), r.avgGrade.padStart(6));
}
