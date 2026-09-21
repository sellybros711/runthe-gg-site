/* What a polling schedule costs, before it is switched on.
 *
 *   node fantasy/plan-budget.mjs
 *   node fantasy/plan-budget.mjs --games 9 --markets 3
 *
 * It prices the ladders in fantasy/lib/schedule.mjs, which is the same file the
 * Worker reads, so this is a projection of what will actually be spent rather
 * than a parallel estimate that can drift from it.
 *
 *
 * THE THING THIS EXISTS TO PREVENT
 * ---------------------------------------------------------------------------
 * Not overspending. The hard cap in 111_fantasy_model.sql handles that, and it
 * refuses a sweep rather than trusting anybody's arithmetic.
 *
 * This prevents the quieter failure: picking a schedule the allowance cannot
 * carry, running it until the cap bites mid-week, and then showing whatever
 * was collected before the money ran out as though it were current. The brief
 * names that one specifically. A schedule that cannot be afforded has to be a
 * decision made in advance, with the screen told about it, and that means
 * somebody has to be able to see the cost before it is spent.
 *
 *
 * TRAFFIC IS NOT IN ANY OF THIS, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------
 * Credits are spent by the POLLER, on a clock. The browser reads the database.
 * So two readers and two thousand readers cost exactly the same, and there is
 * no number of users at which this gets more expensive. What costs money is
 * how often we look and how many games and markets we look at.
 */
import {
  MARKETS, REGIONS, LADDER_FULL, LADDER_LEAN,
  pollsPerEvent, creditsPerSweep, creditsPerEvent,
  creditsPerWeek, creditsPerMonth, weeksOfRunway,
} from './lib/schedule.mjs';

const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? Number(process.argv[i + 1]) : dflt;
};
const GAMES = arg('games', 16);
const MK = arg('markets', MARKETS.length);

/* PRICES ARE FROM THE BRIEF AND ARE NOT VERIFIED. The provider is blocked from
 * this sandbox, so nothing here has been confirmed against their site. The
 * free allowance is the one that matters today and it is the one to re-check
 * first. */
const PLANS = [
  { name: 'free', credits: 500, price: '$0' },
  { name: 'cheapest paid', credits: 20000, price: '~$30/mo' },
  { name: 'middle', credits: 100000, price: '~$59/mo' },
  { name: 'top', credits: 5000000, price: '~$119/mo' },
];

const n = (x) => x.toLocaleString('en-US');
const runway = (w) => {
  if (w >= 4.345) return `${(w / 4.345).toFixed(1)} months`;
  if (w >= 1) return `${w.toFixed(1)} weeks`;
  const d = w * 7;
  if (d >= 1) return `${d.toFixed(1)} days`;
  return `${(d * 24).toFixed(1)} hours`;
};

console.log(`\nRun The Fantasy League: what the poller costs\n${'='.repeat(60)}`);
console.log(`\n  ${MK} markets x ${REGIONS.length} region = ${creditsPerSweep(MK)} credits `
  + `to sweep ONE game once.`);
console.log(`  A ${GAMES} game slate is ${n(creditsPerSweep(MK) * GAMES)} credits a full sweep.\n`);

for (const [label, ladder] of [['FULL (the brief\'s ladder)', LADDER_FULL], ['LEAN', LADDER_LEAN]]) {
  console.log(`${label}`);
  for (const b of ladder) {
    const every = b.everyMin >= 60 ? `${b.everyMin / 60}h` : `${b.everyMin}min`;
    const polls = Math.floor(((b.fromH - b.untilH) * 60) / b.everyMin);
    console.log(`    ${String(b.fromH).padStart(3)}h to ${String(b.untilH).padStart(2)}h out, `
      + `every ${every.padEnd(5)} ${String(polls).padStart(4)} looks`);
  }
  console.log(`    ${'-'.repeat(46)}`);
  console.log(`    ${String(pollsPerEvent(ladder)).padStart(4)} looks per game per week`);
  console.log(`    ${n(creditsPerEvent(ladder, MK)).padStart(4)} credits per game per week`);
  console.log(`    ${n(creditsPerWeek(ladder, MK, GAMES))} credits a week, `
    + `${n(creditsPerMonth(ladder, MK, GAMES))} a month\n`);
}

console.log(`How long each plan lasts\n${'-'.repeat(60)}`);
console.log(`  ${'plan'.padEnd(24)}${'credits/mo'.padStart(11)}  ${'FULL'.padStart(12)}  ${'LEAN'.padStart(12)}`);
for (const p of PLANS) {
  console.log(`  ${(p.name + ' ' + p.price).padEnd(24)}${n(p.credits).padStart(11)}  `
    + `${runway(weeksOfRunway(p.credits, LADDER_FULL, MK, GAMES)).padStart(12)}  `
    + `${runway(weeksOfRunway(p.credits, LADDER_LEAN, MK, GAMES)).padStart(12)}`);
}

/* The free allowance, said in the way that actually lands. A monthly figure
 * invites the reading "so it lasts most of a month"; these do not. */
const oneGameFull = creditsPerEvent(LADDER_FULL, MK);
console.log(`\nWhat 500 free credits really buys\n${'-'.repeat(60)}`);
console.log(`  one game, full ladder, one week        ${n(oneGameFull)} credits`);
console.log(`     so 500 does not cover a single game: ${(500 / oneGameFull).toFixed(2)} of one.`);
console.log(`  one full sweep of ${GAMES} games            ${n(creditsPerSweep(MK) * GAMES)} credits`);
console.log(`     so 500 is ${(500 / (creditsPerSweep(MK) * GAMES)).toFixed(1)} full sweeps. Per month.`);
console.log(`  one game, every minute, for one hour   ${n(60 * creditsPerSweep(MK))} credits`);
console.log(`     so 500 is ${(500 / (60 * creditsPerSweep(MK))).toFixed(1)} hours of watching one game.`);

/* The most this allowance can honestly support, solved rather than guessed, so
 * the answer moves when the inputs do. Sunday morning only, the early games
 * only, and the question is how often we may look. */
console.log(`\nThe most 500 credits a month can honestly do\n${'-'.repeat(60)}`);
const SUNDAYS = 4.345, WINDOW_H = 4, EARLY = 9;
let best = null;
for (const mk of [6, 4, 3, 2, 1]) {
  for (const every of [10, 15, 20, 30, 45, 60, 90, 120]) {
    const perSunday = Math.floor((WINDOW_H * 60) / every) * EARLY * mk;
    const perMonth = Math.round(perSunday * SUNDAYS);
    if (perMonth <= 450 && (!best || every < best.every || (every === best.every && mk > best.mk))) {
      best = { mk, every, perMonth };
    }
  }
}
if (best) {
  console.log(`  ${EARLY} early games, a ${WINDOW_H} hour Sunday window, ${best.mk} market(s),`);
  console.log(`  a look every ${best.every} minutes: ${n(best.perMonth)} credits a month.`);
  console.log(`\n  And that is the ceiling, with nothing left for Thursday, Saturday,`);
  console.log(`  the late games, or any line movement history worth drawing.`);
} else {
  console.log('  Nothing fits. Not a figure of speech.');
}
console.log('');
