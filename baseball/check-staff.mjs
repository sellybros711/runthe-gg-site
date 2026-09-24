#!/usr/bin/env node
/*
 * The All-Time Staff draft assigns itself.
 * ========================================
 * Twelve arms into twelve arm-shaped slots was being asked of the player one
 * pick at a time, and the sim cannot hear most of the answer: `staffEra`
 * AVERAGES the five rotation slots and averages the seven relief slots, so the
 * difference between SP3 and SP4 is a question with no consequence.
 *
 * So the draft answers it. `slotForPlayer` decides rotation against bullpen (the
 * one part that IS real, because the two carry different ERA bases) and
 * `sortStaffSlots` re-ranks inside each group so SP1 is the ace.
 *
 * WHAT THIS FILE IS FOR is the half that would go wrong silently. A sort that
 * quietly moved a man from the bullpen into the rotation would be an optimiser
 * rather than a tidy-up: the staff would get better on its own, every win rate
 * the mode is balanced on would drift, and nothing would throw, because a
 * reordered roster is a perfectly legal roster. The ERA is asserted UNCHANGED by
 * the sort for exactly that reason.
 *
 *   node baseball/check-staff.mjs
 *   node baseball/check-staff.mjs 400      a bigger sample
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(import.meta.url);
const E = require_(path.join(DIR, 'engine.js'));
const R = require_(path.join(DIR, 'run.js'));
const DATA = R.indexData(require_(path.join(DIR, 'data/players.json')));

const RUNS = Number(process.argv[2] || 120);
let fails = 0, checks = 0;
const ok = (m) => { checks++; console.log('  ok    ' + m); };
const bad = (m, d) => { checks++; fails++; console.log('  FAIL  ' + m); if (d) console.log('        ' + d); };
const claim = (c, m, d) => (c ? ok(m) : bad(m, d));

const ROT = ['SP1', 'SP2', 'SP3', 'SP4', 'SP5'];
const PEN = ['RP1', 'RP2', 'RP3', 'RP4', 'RP5', 'SU'];

/* Three ways somebody drafts, because the defect this is written for depends on
   WHICH arms land where and a single strategy meets one shape of staff. */
const BOTS = {
  best: (o) => o.reduce((a, b) => (b.w > a.w ? b : a)),
  mid: (o) => o.slice().sort((a, b) => b.w - a.w)[Math.floor(o.length / 2)],
  cheap: (o) => o.reduce((a, b) => (b.p < a.p ? b : a)),
};

function draft(seed, bot) {
  const run = R.createRun({ seed, staff: true });
  let guard = 0;
  while (run.roster.length < 12) {
    if (++guard > 60) return null;
    let d;
    try { d = R.spin(run, DATA); } catch (_) { return null; }
    if (!d.options.length) {
      try { d = R.respin(run, DATA); } catch (_) { return null; }
      if (!d.options.length) continue;
    }
    try { R.sign(run, bot(d.options.map((k) => DATA.allPlayers[k]))); } catch (_) { return null; }
  }
  return run;
}
const tag = (run) => run.roster.map((p, k) => ({ ...p, _slot: R.slotsOf(run)[run.slotIndex[k]] }));
const at = (t, s) => t.find((p) => p._slot === s);

const runs = [];
for (const name of Object.keys(BOTS)) {
  for (let i = 0; i < RUNS; i++) {
    const r = draft(E.hashSeed(`staff-${name}-${i}`), BOTS[name]);
    if (r) runs.push({ name, run: r });
  }
}

console.log(`\n1. The twelve arms land in twelve slots (${runs.length} drafts)`);
{
  claim(runs.length >= RUNS * 2, 'enough drafts finished to mean something', `${runs.length}`);
  let wrong = 0, dup = 0;
  const illegal = [];
  for (const { name, run } of runs) {
    const names = run.slotIndex.map((i) => R.slotsOf(run)[i]);
    if (new Set(names).size !== 12) dup++;
    if (names.length !== 12) wrong++;
    /* THE ONE THAT MATTERS, and the first draft of this file did not ask it. A
       sort that reassigns by rating and forgets eligibility puts a reliever at
       SP1, which is an illegal roster the sim reads perfectly happily: he is
       simply rated on the starter's ERA curve from then on. */
    run.roster.forEach((p, k) => {
      const s = R.slotsOf(run)[run.slotIndex[k]];
      if (!E.canFillSlot(p, s, R.eligOf(run))) illegal.push(`${name}: ${p.n} (${p.pp}) at ${s}`);
    });
  }
  claim(!dup, 'no slot is filled twice', `${dup} drafts`);
  claim(!wrong, 'and every draft fills all twelve', `${wrong} drafts`);
  claim(!illegal.length, 'and every arm is eligible for the slot he holds',
    `${illegal.length}, e.g. ${illegal.slice(0, 3).join('; ')}`);
}

/* BEST BY WHAT THE STAFF IS RATED ON, which is E.workloadWar and not the season
   line. `staffEra` reads a starter over 210 innings, so a 300 inning arm's season
   WAR is not what he is worth to this rotation, and a suite that ranked on `.w`
   while the sort ranked on the engine's own valuation is the second copy of a
   rule this file already warns about twice. Asked THROUGH the engine so the two
   cannot drift: if the valuation changes, the sort and this both follow it. */
const val = (p) => E.workloadWar(p);

console.log('\n2. The rotation and the bullpen are sorted, best first');
{
  const off = [];
  for (const { name, run } of runs) {
    const t = tag(run);
    for (const group of [ROT, PEN]) {
      const w = group.map((s) => at(t, s)).filter(Boolean).map(val);
      for (let i = 1; i < w.length; i++) {
        if (w[i] > w[i - 1] + 1e-9) { off.push(`${name}: ${group[i - 1]} ${w[i - 1]} then ${group[i]} ${w[i]}`); break; }
      }
    }
  }
  claim(!off.length, 'no slot holds a better arm than the slot above it', off.slice(0, 4).join('; '));
  /* Coverage: a pool where every staff happened to be drafted in order already
     would pass this having exercised nothing. */
  const moved = runs.filter(({ run }) => {
    const t = tag(run);
    return (at(t, 'SP1') || {}).i !== (run.roster[0] || {}).i;
  }).length;
  claim(moved > runs.length * 0.3, 'and the sort really did move most of them',
    `${moved} of ${runs.length} have an SP1 who was not the first pick`);
}

console.log('\n3. The best relief arm closes');
{
  const off = [];
  for (const { name, run } of runs) {
    const t = tag(run);
    const cl = at(t, 'CL');
    if (!cl) { off.push(`${name}: nobody closing`); continue; }
    /* Only against arms that COULD close. A starter who overflowed into the
       bullpen is not closer-eligible, so he is allowed to out-rank the closer. */
    const better = PEN.map((s) => at(t, s)).filter(Boolean)
      .filter((p) => E.canFillSlot(p, 'CL', R.eligOf(run)) && val(p) > val(cl) + 1e-9);
    if (better.length) off.push(`${name}: ${better[0].n} ${val(better[0]).toFixed(2)} in the pen, ${cl.n} ${val(cl).toFixed(2)} closing`);
  }
  claim(!off.length, 'no closer-eligible arm in the pen out-rates the closer', off.slice(0, 4).join('; '));
}

console.log('\n4. THE ROTATION TAKES THE BEST ARMS, whoever was drafted when');
{
  /* The claim the mode now rests on, and it REPLACED THE OPPOSITE ONE. The first
     version of this file asserted that the sort never moves a man across the
     rotation line, on the argument that a sort free to do so is an optimiser. The
     line is real (a rotation slot is 14.0% of the innings and a relief slot 4.3%)
     and refusing to cross it is what put a 9.1 WAR arm at RP1 above a 4.7 WAR SP1,
     because the rotation had filled in draft order.

     That old assertion ALSO had no teeth, which is the half worth remembering. It
     read the ERA, called the sort again and read it again, so it compared an
     already sorted staff with itself: the sort is idempotent, a sort that crossed
     the line crossed it identically both times, and the delta was zero. Pointed at
     exactly that defect it passed green. */
  const off = [];
  for (const { name, run } of runs) {
    const t = tag(run);
    const startable = run.roster.filter((p) => E.canFillSlot(p, 'SP1', R.eligOf(run)))
      .slice().sort((a, b) => val(b) - val(a));
    const inRot = ROT.map((s) => at(t, s)).filter(Boolean);
    if (inRot.length !== Math.min(5, startable.length)) {
      off.push(`${name}: ${inRot.length} starting, ${startable.length} could`); continue;
    }
    /* Every arm in the pen who COULD start has to be worse than every arm that is
       starting. That is the whole claim, and it does not care how they got there. */
    const benched = PEN.concat(['CL']).map((s) => at(t, s)).filter(Boolean)
      .filter((p) => E.canFillSlot(p, 'SP1', R.eligOf(run)));
    const worstStarter = Math.min(...inRot.map(val));
    const better = benched.filter((p) => val(p) > worstStarter + 1e-9);
    if (better.length) off.push(`${name}: ${better[0].n} ${val(better[0]).toFixed(2)} relieving, ${worstStarter.toFixed(2)} starting`);
  }
  claim(!off.length, 'no arm in the pen could have started ahead of a man who is',
    off.slice(0, 4).join('; '));

  /* And the part that IS free, measured rather than assumed, because it is what
     makes sorting for display safe: a legal reshuffle INSIDE a group leaves the
     ERA exactly where it was. Shuffled rather than re-sorted, so it cannot answer
     itself the way the old claim did. */
  let drift = 0, worst = 0, shuffled = 0;
  for (const { run } of runs) {
    const before = E.staffEra(tag(run));
    const keep = run.slotIndex.slice();
    /* Rotate each group by one: a permutation, always legal inside a group, never
       the identity at two or more. CL is left alone, because not every arm in the
       pen may hold it. */
    const spin = (slotNames) => {
      const mine = run.roster.map((p, k) => k)
        .filter((k) => slotNames.includes(R.slotsOf(run)[run.slotIndex[k]]));
      if (mine.length < 2) return;
      const slotsHeld = mine.map((k) => run.slotIndex[k]);
      mine.forEach((k, n) => { run.slotIndex[k] = slotsHeld[(n + 1) % slotsHeld.length]; });
      shuffled++;
    };
    spin(ROT); spin(PEN);
    const d = Math.abs(E.staffEra(tag(run)) - before);
    if (d > 1e-9) { drift++; worst = Math.max(worst, d); }
    run.slotIndex = keep;
  }
  claim(!drift, 'and a legal reshuffle inside a group leaves the ERA untouched',
    `${drift} drafts, worst ${worst.toFixed(4)}`);
  claim(shuffled > runs.length, 'and it really did reshuffle them', `${shuffled} groups moved`);
}

console.log('\n5. The sort is stable, so a redraw never reshuffles the card');
{
  let moved = 0;
  for (const { run } of runs.slice(0, 60)) {
    const a = run.slotIndex.join(',');
    R.sortStaffSlots(run); R.sortStaffSlots(run);
    if (run.slotIndex.join(',') !== a) moved++;
  }
  claim(!moved, 'sorting an already sorted staff changes nothing', `${moved} drafts`);
}

console.log('\n6. Nothing here reaches the other modes');
{
  /* sortStaffSlots returns on !run.staff, and the ordinary game's chooser is
     about real positions rather than one job with twelve names. */
  const run = R.createRun({ seed: E.hashSeed('plain') });
  let guard = 0;
  while (run.roster.length < 12 && guard++ < 60) {
    let d;
    try { d = R.spin(run, DATA); } catch (_) { break; }
    if (!d.options.length) { try { d = R.respin(run, DATA); } catch (_) { break; } continue; }
    try { R.sign(run, BOTS.best(d.options.map((k) => DATA.allPlayers[k]))); } catch (_) { break; }
  }
  claim(run.roster.length === 12, 'an ordinary draft still fills twelve slots', `${run.roster.length}`);
  /* THE FIXTURE HAS TO BE ONE THE SORT WOULD CHANGE, which the first version was
     not: it signed a roster, called the sort and asked whether anything moved. If
     the guard is gone the sort has ALREADY run inside sign(), so the fixture was
     the sorted answer and the second call agreed with it. Pointed at a sort with
     no mode guard at all, it passed.

     So the fixture is deliberately out of order: the slots are reversed, which is
     legal here only because the check never plays it. A sort that reached this
     mode would put it back in some WAR order and the comparison would move. */
  const scrambled = run.slotIndex.slice().reverse();
  run.slotIndex = scrambled.slice();
  const wars = run.slotIndex.map((si, k) => [si, val(run.roster[k])]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const alreadySorted = wars.every((w, i) => i === 0 || wars[i - 1] >= w - 1e-9);
  claim(!alreadySorted, 'and the fixture is one a sort would visibly change', 'it was already in order');
  R.sortStaffSlots(run);
  claim(run.slotIndex.join(',') === scrambled.join(','),
    'and the sort leaves it exactly as it found it', 'the sort touched a mode that is not its own');
}

console.log(`\n${fails ? fails + ' of ' + checks + ' checks FAILED' : 'All ' + checks + ' checks passed.'}`);
process.exit(fails ? 1 : 0);
