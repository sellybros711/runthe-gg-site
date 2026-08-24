/* NOBODY IN THE ROOM SAYS THE OPPOSITE OF THEIR OWN NUMBER.
 *
 *   node cfb/build/test/commish/test_voice.mjs
 *
 * The reactions are generated: nine blocs, five moods, and a themed pool chosen from
 * whichever axis actually drove the reaction. That is what makes a hundred and twentieth
 * docket item cost the same to write as the first, and it is also what makes this file
 * necessary, because a generated line has one catastrophic failure mode and it is silent.
 *
 * A bloc showing a red minus seven beside "more primetime, our partners will be delighted"
 * is not a typo the player forgives. It is the moment they stop believing the room. And it
 * happened: opening the playoff pushes the Big Ten's inventory harder than any other single
 * axis, so inventory was the driver and the driver was positive, while access and money
 * outweighed it and the net was a loss.
 *
 * So this fires several hundred real rulings at the real blocs and checks that what is said
 * and what is shown never disagree, plus the things a content pass breaks by accident: a
 * pool that is empty, a line that repeats forever, a mood nobody can reach.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const path = require('path');
const ROOT = path.resolve(new URL('../../../..', import.meta.url).pathname);
const B = require(ROOT + '/cfb/commish/blocs.js');
const L = require(ROOT + '/cfb/commish/ledger.js');
const D = require(ROOT + '/cfb/commish/docket.js');

/* Enough of a sport for castOf to have schools and conferences to choose between. */
const SEED_TEAMS = [];
[['SEC', ['Alabama', 'Georgia', 'Texas', 'LSU', 'Tennessee', 'Florida']],
  ['Big Ten', ['Ohio State', 'Michigan', 'Oregon', 'Penn State', 'USC', 'Wisconsin']],
  ['ACC', ['Clemson', 'Miami', 'Florida State', 'Louisville', 'Pittsburgh', 'Virginia']],
  ['Big 12', ['Utah', 'Kansas', 'Baylor', 'Iowa State', 'TCU', 'Arizona']],
  ['Pac-12', ['Washington State', 'Oregon State']],
  ['American', ['Memphis', 'Tulane', 'UTSA', 'Navy']],
  ['Mountain West', ['Boise State', 'UNLV', 'San Diego State']]].forEach(([conf, schools]) => {
  schools.forEach((school) => SEED_TEAMS.push({ school: school, conference: conf, season: 2025 }));
});
const hashOf = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
const dialBase = (item) => {
  const d = {};
  (item.dials || []).forEach((x) => { d[x.id] = x.base; });
  return d;
};

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };

const AXES = L.AXES;

console.log('\n=== every pool is a pool ===');
{
  const empty = [], thin = [];
  for (const id in B.VOICE) {
    const v = B.VOICE[id];
    v.bands.forEach((pool, i) => {
      if (!pool || !pool.length) empty.push(id + ' band ' + i);
      else if (pool.length < 2) thin.push(id + ' band ' + i);
    });
    ['relief', 'grudge', 'streak'].forEach((k) => {
      if (!v[k] || !v[k].length) empty.push(id + ' ' + k);
      else if (v[k].length < 2) thin.push(id + ' ' + k);
    });
    for (const axis in v.on || {}) {
      ['good', 'bad'].forEach((side) => {
        const pool = v.on[axis][side];
        if (pool && !pool.length) empty.push(id + ' ' + axis + '.' + side);
      });
    }
  }
  ok('no mood or axis has an empty pool', !empty.length, empty.join('; ') || 'all filled');
  /* A POOL OF ONE IS THE THING THIS REPLACED. Forty-five fixed lines is what made the SEC a
     vending machine, so a single-line pool is a regression to that in miniature. */
  ok('  and none of them is a single line', !thin.length, thin.join('; ') || 'every mood has options');
  ok('  nine blocs have a voice', Object.keys(B.VOICE).length === B.BLOCS.length
    && B.BLOCS.every((b) => B.VOICE[b.id]), Object.keys(B.VOICE).length + ' voices');
  ok('  every one with five moods', B.BLOCS.every((b) => B.VOICE[b.id].bands.length === 5));

  /* AN AXIS NOBODY WEIGHS is a themed line that can never be chosen, because the driver is
     the biggest term of the dot product and a zero weight makes every term zero. */
  const dead = [];
  B.BLOCS.forEach((b) => {
    for (const axis in B.VOICE[b.id].on || {}) {
      if (AXES.indexOf(axis) < 0) dead.push(b.id + ' has lines for "' + axis + '", which is not an axis');
      else if (Math.abs(b.w[axis] || 0) < 0.3) dead.push(b.id + ' has ' + axis + ' lines but weighs it ' + b.w[axis]);
    }
  });
  ok('  and no themed line is unreachable', !dead.length, dead.join('; ') || 'all reachable');
}

console.log('\n=== what they say never contradicts what they show ===');
{
  /* REAL RULINGS, off the real docket, rather than effect vectors invented here: the point is
     that the shipped content cannot produce a contradiction, and an effect vector nobody
     writes proves nothing about the ones somebody did. */
  const E = require(ROOT + '/cfb/engine.js');
  const world = L.createWorld({ year: 2025, membership: L.membershipFrom(SEED_TEAMS) });
  const rulings = [];
  /* RESOLVED THE WAY THE PAGE RESOLVES THEM. Half the options are functions of a cast (which
     school is being poached, which conference is short of members), so calling them with an
     empty object throws or, worse, yields an edit no real ruling could produce. */
  D.ITEMS.forEach((item) => {
    const rng = E.createSeededRNG(hashOf(item.id));
    let cast = null;
    try { cast = D.castOf(item, world, L, rng); } catch (e) { cast = null; }
    (item.options || []).forEach((o) => {
      let e = null;
      try { e = D.resolve(item, o.id, dialBase(item), cast); } catch (x) { e = null; }
      if (e && e.effects) rulings.push({ item: item.id, option: o.id, edit: e });
    });
  });
  /* THE DOCKET IS SMALL AND THAT IS A SEPARATE PROBLEM. Eight items is enough to prove the
     reactions cannot contradict themselves, which is what this file is for, and it is not
     enough content for a five year term: the same argument comes back around. Asserted at
     the size it actually is so that shrinking it fails here rather than going unnoticed. */
  ok('the docket has rulings to check', rulings.length >= 20, rulings.length + ' options across '
    + D.ITEMS.length + ' items');

  /* Run each of them from several starting moods, because the band is chosen from where a
     bloc already sits and a contradiction can hide in one band and not another. */
  const MOODS = [8, 25, 45, 60, 85];
  const contradictions = [], missing = [];
  let checked = 0;
  MOODS.forEach((start) => {
    const w = JSON.parse(JSON.stringify(world));
    B.BLOCS.forEach((b) => { w.blocs[b.id] = start; });
    rulings.forEach((r) => {
      B.react(w, r.edit).forEach((row) => {
        checked++;
        if (!row.say) { missing.push(r.item + '/' + r.option + ' ' + row.id); return; }
        /* The claim: a line drawn from a themed GOOD pool never appears beside a fall, and a
           BAD one never beside a rise. Checked by finding the line rather than by trusting
           the picker, so the picker changing does not quietly stop this from testing. */
        const v = B.VOICE[row.id];
        for (const axis in v.on || {}) {
          if ((v.on[axis].good || []).indexOf(row.say) >= 0 && row.delta < 0) {
            contradictions.push(row.id + ' says "' + row.say + '" at ' + row.delta
              + ' (' + r.item + '/' + r.option + ', from ' + start + ')');
          }
          if ((v.on[axis].bad || []).indexOf(row.say) >= 0 && row.delta > 0) {
            contradictions.push(row.id + ' says "' + row.say + '" at ' + row.delta
              + ' (' + r.item + '/' + r.option + ', from ' + start + ')');
          }
        }
      });
    });
  });
  ok('every bloc answered every ruling', !missing.length, missing.slice(0, 3).join('; ')
    || checked + ' reactions');
  ok('  and none of them said the opposite of its own number',
    !contradictions.length, contradictions.slice(0, 4).join('   |   ')
    || 'no contradictions in ' + checked);
}

console.log('\n=== a mood never fights its own number ===');
{
  /* THE OTHER CONTRADICTION, AND THE COMMONER ONE. A mood band is chosen from where a bloc
     STANDS, and standing moves slowly while a delta does not, so a bloc sitting at forty that
     has just been helped printed a displeased sentence beside a green plus one: "you have
     handed the schools with exit lawyers a reason to call them", at plus one point one.

     relief and grudge are the two things a band cannot say. This is the check that they are
     actually reached, and that the angriest and happiest pools stay off the wrong number. */
  const world = L.createWorld({ year: 2025, membership: {} });
  const wrong = [], reliefSeen = new Set(), grudgeSeen = new Set();
  const STARTS = [5, 20, 38, 45, 55, 62, 78, 92];
  const PUSH = [-3.2, -2, -1.2, -0.4, 0.4, 1.2, 2, 3.2];
  STARTS.forEach((start) => {
    PUSH.forEach((p) => {
      const w = JSON.parse(JSON.stringify(world));
      B.BLOCS.forEach((b) => { w.blocs[b.id] = start; });
      /* One axis at a time, so a bloc's own weight decides the sign for it. */
      AXES.forEach((axis) => {
        const edit = { effects: {} };
        edit.effects[axis] = p;
        B.react(w, edit).forEach((row) => {
          const v = B.VOICE[row.id];
          if ((v.relief || []).indexOf(row.say) >= 0) reliefSeen.add(row.id);
          if ((v.grudge || []).indexOf(row.say) >= 0) grudgeSeen.add(row.id);
          /* The two pools nobody should ever hear on the wrong side of zero. */
          if (row.delta >= 1.0 && (v.bands[4] || []).indexOf(row.say) >= 0) {
            wrong.push(row.id + ' at +' + row.delta + ' said its angriest line: "' + row.say + '"');
          }
          if (row.delta <= -1.0 && (v.bands[0] || []).indexOf(row.say) >= 0) {
            wrong.push(row.id + ' at ' + row.delta + ' said its happiest line: "' + row.say + '"');
          }
        });
      });
    });
  });
  ok('nobody delivers their worst line about something that helped them', !wrong.length,
    wrong.slice(0, 3).join('   |   ') || 'no reversals');
  ok('  and every bloc has a way to say "that helped, I am still angry"',
    reliefSeen.size === B.BLOCS.length, reliefSeen.size + ' of ' + B.BLOCS.length + ' reached relief');
  ok('  and a way to say "I was with you until that"',
    grudgeSeen.size === B.BLOCS.length, grudgeSeen.size + ' of ' + B.BLOCS.length + ' reached grudge');

  /* THE THIRD LOSS RUNNING. grudge() has counted a streak since the file was written and all
     it ever did was make the number bigger: a bloc on the wrong end of four rulings in a row
     reacted harder and never once said so. Reached by actually losing three in a row rather
     than by calling line() with a number, so the path from the ledger to the sentence is
     what is being checked. */
  const streakSeen = new Set();
  const hurt = { effects: { money: -2.4, cost: 1.6, labour: -2, access: -2, tradition: -2 } };
  let w2 = L.createWorld({ year: 2026, membership: {} });
  for (let i = 0; i < 3; i++) {
    w2 = L.applyOutcome(L.applyEdit(w2, Object.assign({ id: 'x:' + i }, hurt)), hurt, B.deltas(w2, hurt));
  }
  B.react(w2, hurt).forEach((r) => {
    if ((B.VOICE[r.id].streak || []).indexOf(r.say) >= 0) streakSeen.add(r.id);
  });
  ok('  and a way to say "that is three in a row"',
    streakSeen.size === B.BLOCS.length,
    streakSeen.size + ' of ' + B.BLOCS.length + ' reached streak after three straight losses');

  /* AND ONLY WHEN IT IS TRUE. A streak line beside a win is the loudest possible version of
     the contradiction this file exists to prevent. */
  const wrongStreak = [];
  [0, 1, 2].forEach((n) => {
    let w3 = L.createWorld({ year: 2026, membership: {} });
    for (let i = 0; i < n; i++) {
      w3 = L.applyOutcome(L.applyEdit(w3, Object.assign({ id: 'y:' + i }, hurt)), hurt, B.deltas(w3, hurt));
    }
    const good = { effects: { money: 2.4, access: 2, labour: 2, tradition: 2, inventory: 2 } };
    B.react(w3, good).forEach((r) => {
      if ((B.VOICE[r.id].streak || []).indexOf(r.say) >= 0) {
        wrongStreak.push(r.id + ' claimed a streak at ' + r.delta + ' after ' + n + ' losses');
      }
    });
  });
  ok('  and never says it about something that helped them', !wrongStreak.length,
    wrongStreak.slice(0, 3).join('; ') || 'no false streaks');
}

console.log('\n=== the room does not repeat itself ===');
{
  /* THE FAILURE THIS REPLACED. One fixed line per mood meant the SEC said the same sentence
     every time it was annoyed, all term. The seed is the world's own clock, so this walks a
     clock rather than calling the same beat over and over. */
  const said = {};
  B.BLOCS.forEach((b) => { said[b.id] = new Set(); });
  const edit = { effects: { money: -2.2, cost: 1.4 } };
  for (let beat = 0; beat < 9; beat++) {
    for (let year = 2025; year < 2030; year++) {
      const w = L.createWorld({ year: year, membership: {} });
      w.beat = beat;
      w.history = new Array((year - 2025) * 9 + beat).fill({ effects: {} });
      B.react(w, edit).forEach((r) => said[r.id].add(r.say));
    }
  }
  const stuck = B.BLOCS.filter((b) => said[b.id].size < 2).map((b) => b.id);
  ok('one ruling across a term does not produce one sentence', !stuck.length,
    stuck.join(', ') || B.BLOCS.map((b) => b.id + ':' + said[b.id].size).join(' '));

  /* AND THE SAME BEAT SAYS THE SAME THING. The preview and the ruling that follows it run
     this twice on the same world, and a resampled line would make the forecast a liar about
     something that costs nothing to get right. */
  const w = L.createWorld({ year: 2027, membership: {} });
  w.beat = 4;
  const a = B.react(w, edit).map((r) => r.say).join('|');
  const b2 = B.react(w, edit).map((r) => r.say).join('|');
  ok('  and the same beat, ruled twice, says it the same way', a === b2);
}

console.log('\n=== it sounds like college football ===');
{
  /* NOT A STYLE OPINION, A COVERAGE CHECK. The brief was to stop this reading like a press
     release, and the way that regresses is one bloc getting rewritten in corporate English
     while the rest keep their voice. These are words that only turn up if somebody wrote
     about the actual sport. */
  /* THE LANGUAGE OF COLLEGE ATHLETICS, not only of football, because two of these blocs are
     characterised by NOT talking about the game. The presidents' whole voice is that they
     sound like university administrators, and forcing the word "cupcake" into their mouths
     to satisfy a regex would break the one bloc it was meant to improve. Trustees, faculty
     senates and a swimming programme being cut are exactly as specific to this sport. */
  const SPORT = /portal|cupcake|rivalr|kickoff|noon|band|stadium|scholarship|recruit|helmet|locker|november|september|january|saturday|tailgat|boise|ames|tuscaloosa|walk-on|bowl|marching|season ticket|concourse|primetime|undefeated|coordinator|weight room|high school|jersey|athletic department|faculty|trustee|campus|deposition|swimming|conference title|non-revenue|championship weekend/i;
  const flat = [];
  for (const id in B.VOICE) {
    const v = B.VOICE[id];
    let all = v.bands.reduce((t, p) => t.concat(p), []).concat(v.relief || [], v.grudge || [], v.streak || []);
    for (const axis in v.on || {}) {
      all = all.concat(v.on[axis].good || [], v.on[axis].bad || []);
    }
    const hits = all.filter((l) => SPORT.test(l)).length;
    if (hits < 2) flat.push(id + ' (' + hits + ' of ' + all.length + ')');
  }
  ok('every bloc talks about the sport, not just about policy', !flat.length,
    flat.join('; ') || 'all nine');

  /* Length is the other way it drifts back: a reaction is a line somebody says in a room,
     not a paragraph from a memo. */
  const longest = [];
  for (const id in B.VOICE) {
    const v = B.VOICE[id];
    let all = v.bands.reduce((t, p) => t.concat(p), []).concat(v.relief || [], v.grudge || [], v.streak || []);
    for (const axis in v.on || {}) all = all.concat(v.on[axis].good || [], v.on[axis].bad || []);
    all.forEach((l) => { if (l.length > 105) longest.push(id + ': ' + l.slice(0, 40) + '...'); });
  }
  ok('  and says it in one breath', !longest.length, longest.slice(0, 3).join('; ')
    || 'nothing over 105 characters');
}

console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
