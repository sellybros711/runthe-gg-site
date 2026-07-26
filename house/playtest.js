/* RunTheHouse, play one full run as readable text.
 *
 *   node house/playtest.js
 *   RH_SEED=8842 node house/playtest.js
 *   RH_SEED=8842 RH_QUIET=1 node house/playtest.js     result only
 *
 * A stand-in for the UI, and the primary design instrument. Most tuning in this
 * project happens by reading these, not by looking at aggregate charts: the
 * harness tells you a distribution is wrong, a playtest tells you WHY it feels
 * wrong. GDD §15 Stage 3.
 *
 * The human seat is played by the AI stand-in, so what prints here is the house
 * running itself with nobody at the keyboard.
 */

'use strict';

const T = require('./tree.js');
const E = require('./engine.js');
const R = require('./run.js');

const SEED = process.env.RH_SEED || '8842';
const QUIET = !!process.env.RH_QUIET;

const s = R.createRun({ seed: SEED, autoPlayer: true });
const nm = (id) => s.cast[id].first;
const full = (id) => s.cast[id].name;

function line(x) { if (!QUIET) console.log(x); }

line(`\n=== RUNTHEHOUSE, seed ${s.seed} ===\n`);
line('THE CAST');
for (const p of s.cast) {
  const a = p.comp, so = p.social;
  line(`  ${String(p.id).padStart(2)}  ${p.name.padEnd(24)} ${p.archetype.padEnd(13)} ${p.hometown.padEnd(18)}`
    + ` phy ${String(a.physical).padStart(3)} men ${String(a.mental).padStart(3)} pre ${String(a.precision).padStart(3)}`
    + ` | cha ${String(so.charisma).padStart(3)} dec ${String(so.deception).padStart(3)} per ${String(so.perception).padStart(3)}`
    + ` loy ${String(so.loyalty).padStart(3)} vol ${String(so.volatility).padStart(3)}`
    + (p.hiddenGoal ? `  wants to ${p.hiddenGoal.label}` : '  (you)'));
}

const tw = [];
tw.push(`double eviction wk ${s.twists.double}`);
if (s.twists.bounce) tw.push(`bounce back wk ${s.twists.bounce}`);
if (s.twists.flavour) tw.push(`${s.twists.flavour} wk ${s.twists.flavourWeek}`);
line(`\nTWISTS: ${tw.join(', ')}\n`);

let lastWeek = 0;
let guard = 6000;
while (s.phase !== R.PHASES.OVER && guard-- > 0) {
  const before = s.phase;
  R.step(s, null);

  if (before === R.PHASES.CAPTAIN_COMP && s.captainResult) {
    if (s.week !== lastWeek) {
      lastWeek = s.week;
      line(`\n─── WEEK ${s.week}, ${R.activeCount(s)} left ${'─'.repeat(30)}`);
    }
    const r = s.captainResult;
    const threw = r.thrown.length ? `  (threw: ${r.thrown.map(nm).join(', ')})` : '';
    line(`  captain comp [${r.name}] -> ${nm(r.winner)}${threw}`);
    line(`  rations: ${s.rations.map(nm).join(', ')}`);
    s.captainResult = null;
  }
  if (before === R.PHASES.NAMING) {
    line(`  ${nm(s.captain)} names ${s.atRisk.map(nm).join(' and ')} At Risk`);
  }
  if (before === R.PHASES.VETO_COMP && s.vetoResult) {
    const r = s.vetoResult;
    line(`  veto comp [${r.name}] -> ${nm(r.winner)}`);
    s.vetoResult = null;
  }
  if (before === R.PHASES.VETO_CEREMONY && s.phase !== R.PHASES.VETO_CEREMONY) {
    if (s.vetoUsed) line(`  veto USED on ${nm(s.saved)}, replacement ${s.replacement != null ? nm(s.replacement) : 'none'}`);
    else line('  veto not used');
  }
  if (before === R.PHASES.FALLOUT) {
    const w = s.weeks[s.weeks.length - 1];
    if (w && !w.final3) {
      const tally = Object.keys(w.tally).map((k) => `${nm(Number(k))} ${w.tally[k]}`).join(' / ');
      const liars = w.votes.filter((v) => v.promisedTarget != null && v.promisedTarget !== v.target).length;
      line(`  VOTE ${tally}${w.tieBreak != null ? `  (tie broken by ${nm(w.tieBreak)})` : ''}`
        + `${w.soleVote != null ? `  (sole vote: ${nm(w.soleVote)})` : ''}`);
      line(`  EVICTED: ${full(w.evicted)}, place ${s.cast[w.evicted].place}`
        + `${liars ? `, ${liars} broke a promise` : ''}`
        + `${w.blame.length ? `, ${w.blame.length} blamed someone (${w.blame.filter((b) => b.correct).length} correctly)` : ''}`);
    }
  }
  if (before === R.PHASES.FINAL3 && s.phase === R.PHASES.PANEL) {
    const w = s.weeks[s.weeks.length - 1];
    line(`\n─── FINAL 3 ${'─'.repeat(34)}`);
    line(`  three part comp -> ${nm(w.winner)}`);
    line(`  takes ${nm(w.kept)}, cuts ${full(w.evicted)}`);
  }
}

const res = s.result;
line(`\n─── THE PANEL ${'─'.repeat(33)}`);
for (const id of s.panel) {
  line(`  ${full(id).padEnd(24)} out wk ${String(s.cast[id].evictedWeek).padStart(2)}  bitterness ${Math.round(s.cast[id].bitterness)}`);
}
line('');
for (const d of res.detail) line(`  ${nm(d.juror).padEnd(12)} votes ${nm(d.voted)}`);
const tallyStr = Object.keys(res.tally).map((k) => `${nm(Number(k))} ${res.tally[k]}`).join(' / ');
line(`\n  PANEL VOTE: ${tallyStr}`);
line(`  WINNER: ${full(res.winner)} (${s.cast[res.winner].archetype})`);
line(`  runner up: ${full(res.runnerUp)}`);

console.log(`\n  you finished ${res.playerPlace} of ${s.cast.length}, ${res.xp} xp`);

// ─── the chain, which is the whole design pillar ─────────────────────────────

if (!QUIET) {
  console.log(`\n─── WHY, for the winner ${'─'.repeat(28)}`);
  const w = res.winner;
  console.log(`  archetype ${s.cast[w].archetype}, comp wins ${s.cast[w].compWins.length},`
    + ` weeks as captain ${s.cast[w].weeksAsCaptain}, times at risk ${s.cast[w].timesAtRisk}`);
  const allies = s.alliances.filter((a) => a.members.indexOf(w) !== -1);
  console.log(`  alliances: ${allies.length ? allies.map((a) => `#${a.id} [${a.members.map(nm).join(', ')}] str ${Math.round(a.strength)}${a.alive ? '' : ' DEAD'}`).join('; ') : 'none'}`);
  const finalTrust = s.panel.map((p) => `${nm(p)} ${E.band(s.rel.trust[p][w]).label}`).join(', ');
  console.log(`  panel felt: ${finalTrust}`);
}
