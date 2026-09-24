/* Two people can share a name, and the arcade corpus keys on name + sport.
 *
 * That key is not a person. data.js folds former.js and supplement.js onto the
 * curated corpus with it, so the Browns' Hall of Fame tackle and a linebacker
 * who played for four clubs in the 2010s were one record, and the tackle was
 * handed the linebacker's college. Alma Mater asked where Joe Thomas went and
 * marked Wisconsin wrong. A player wrote in with a screenshot.
 *
 * NOTHING FAILED, AND NOTHING COULD. The fold is a backfill of empty fields, so
 * it throws no error, breaks no test and leaves the pool exactly as healthy as
 * before. The only symptom was the game telling somebody a false thing about a
 * real person, in the one place a quiz is meant to be trusted.
 *
 * So this file asks the question no runtime code asks: after everything is
 * folded, does any entity hold a fact that belongs to somebody else? It reads
 * the merge the way a page does, then goes back to the raw sources to see which
 * of them could have supplied each value.
 *
 * Run: node scripts/check-namesakes.mjs      (no network, no data build)
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const box = { console };
box.self = box; box.window = box; box.globalThis = box;
createContext(box);
/* The order a game page loads them in. entities.js first, data.js last. */
for (const f of ['arcade/match/entities.js', 'arcade/former.js', 'arcade/stars.js',
                 'arcade/awards.js', 'arcade/supplement.js', 'arcade/primary.js', 'arcade/data.js', 'arcade/jerseys.js']) {
  runInContext(readFileSync(f, 'utf8'), box, { filename: f });
}
const ENT = box.GRID_ENTITIES || [];
const FORMER = (box.RTG_FORMER && box.RTG_FORMER.players) || [];
const SUP = (box.RTG_SUPPLEMENT && box.RTG_SUPPLEMENT.players) || [];

let bad = 0;
const fail = (m) => { bad++; console.log('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);

/* The same test data.js applies, restated here rather than imported, because a
   guard that asks the code under test whether the code under test is right can
   only ever agree with it. */
const shares = (a, b) => (a || []).some((x) => (b || []).indexOf(x) !== -1);
const pos = (x) => String((x && x.pos) || '').trim().toLowerCase();
function samePerson(a, b) {
  if (!a || !b) return false;
  if (shares(a.t, b.t)) return true;
  if (shares(a.j, b.j)) return true;
  const ap = pos(a), bp = pos(b);
  if (!ap || !bp) return true;
  return ap === bp;
}

const key = (x) => (x.name || x.n) + '|' + x.sport;
const byKey = {};
ENT.forEach((e) => { if (e && e.name && e.sport) byKey[key(e)] = e; });

console.log('1) deleting every namesake from the sources changes nothing');
{
  /* Two weaker versions of this check came first and both were wrong, in
     opposite directions, and the reason is worth keeping.

     Asking whether the entity HOLDS the namesake's value reported nine
     problems that were not: two men who played the same years share a decade,
     and hp=0 only means neither was a high pick. Coincidence is not provenance.

     Asking whether the fold MOVED the field then reported eighteen, because
     supplement.js legitimately fills Joe Thomas in with Wisconsin. The field
     moving is not the fault; the field moving BECAUSE OF HIM is.

     Attribution by value cannot settle it, since two sources are allowed to
     agree. So do the thing the claim actually says: build the corpus twice,
     once as the site does and once with every namesake row deleted before the
     fold runs, and require the two to be identical. That is immune to
     coincidence and to which other source supplied a value. */
  const stack = ['arcade/match/entities.js', 'arcade/former.js', 'arcade/stars.js',
                 'arcade/awards.js', 'arcade/supplement.js'];
  const rest = ['arcade/primary.js', 'arcade/data.js'];

  function build(dropNamesakes) {
    const b = { console };
    b.self = b; b.window = b; b.globalThis = b;
    createContext(b);
    for (const f of stack) runInContext(readFileSync(f, 'utf8'), b, { filename: f });
    let dropped = 0;
    if (dropNamesakes) {
      /* Who counts as a namesake is decided against the CURATED corpus as it
         stands before any fold, which is the same comparison data.js makes. */
      const cur = {};
      (b.GRID_ENTITIES || []).forEach((e) => { if (e && e.name && e.sport) cur[key(e)] = e; });
      for (const box2 of [b.RTG_FORMER, b.RTG_SUPPLEMENT]) {
        if (!box2 || !Array.isArray(box2.players)) continue;
        box2.players = box2.players.filter((p) => {
          if (!p || !p.name || !p.sport) return true;
          const e = cur[key(p)];
          if (!e || samePerson(e, p)) return true;
          dropped++; return false;
        });
      }
    }
    for (const f of rest) runInContext(readFileSync(f, 'utf8'), b, { filename: f });
    return { ents: b.GRID_ENTITIES || [], dropped };
  }

  const withAll = build(false), without = build(true);
  if (withAll.ents.length !== without.ents.length) {
    fail('the corpus is ' + withAll.ents.length + ' rows with the namesakes and ' + without.ents.length + ' without');
  } else {
    const idx = (list) => { const m = {}; list.forEach((e) => { if (e && e.name && e.sport) m[key(e)] = e; }); return m; };
    const A = idx(withAll.ents), B = idx(without.ents);
    const caught = [];
    for (const k of Object.keys(A)) {
      const a = JSON.stringify(A[k]), b2 = JSON.stringify(B[k]);
      if (a !== b2) caught.push(k + '\n         with: ' + a + '\n         without: ' + b2);
    }
    if (caught.length) caught.slice(0, 8).forEach(fail);
    else ok(without.dropped + ' namesake rows deleted, and all ' + withAll.ents.length + ' entities came out byte for byte the same');
  }
}

console.log('\n2) the namesakes the corpus actually holds');
{
  const pairs = [];
  for (const src of [...FORMER, ...SUP]) {
    if (!src || !src.name || !src.sport) continue;
    const cur = byKey[key(src)];
    if (!cur || cur === src || samePerson(cur, src)) continue;
    pairs.push(cur.name + ' (' + cur.sport + '): ' + (cur.pos || '?') + ' vs ' + (src.pos || '?'));
  }
  /* Printed, not failed. A new namesake is the corpus growing, not a fault, and
     the count moving is how somebody notices the merge rule needs looking at. */
  pairs.forEach((p) => console.log('       ' + p));
  ok(pairs.length + ' refused, which is the number that should go UP as the corpus grows');
}

console.log('\n3) the five the guard stranded are back, and right');
{
  /* Refusing the fold left these with no college at all and dropped them out of
     Alma Mater, which is honest and is not the finished job. supplement.js
     carries the real ones. They are here by name because they are the exact
     records a player complained about, and a silent regression would put the
     other man's school back. */
  const WANT = {
    'Joe Thomas|NFL': 'Wisconsin', 'Josh Allen|NFL': 'Wyoming',
    'Lamar Jackson|NFL': 'Louisville', 'Michael Thomas|NFL': 'Ohio State',
    'Chris Jones|NFL': 'Mississippi State', 'Dee Brown|NBA': 'Jacksonville',
  };
  let n = 0;
  for (const [k, want] of Object.entries(WANT)) {
    const e = byKey[k];
    if (!e) fail(k + ' has fallen out of the corpus');
    else if (e.col !== want) fail(k + ' reads ' + JSON.stringify(e.col) + ', should be ' + JSON.stringify(want));
    else n++;
  }
  if (n === Object.keys(WANT).length) ok('all ' + n + ' carry their own school');
}

console.log('\n4) the club printed under a name is one that name played for');
{
  /* `pt` is the club a player is OF, and it is printed on the Alma Mater card
     and in fact.js as "Longest stay". primary.js is addressed by name, so it
     inherits every namesake; it is counted off jersey stints that begin in
     1990, so an older career comes back truncated. Both end the same way, as a
     club this player never had.
     The record already knows his clubs, so a pt outside them is not an answer
     about him whatever went wrong upstream. data.js drops it, and the
     documented fallback (the first club) is always a true thing to say. */
  const off = ENT.filter((e) => e && e.pt && Array.isArray(e.t) && e.t.length && e.t.indexOf(e.pt) === -1);
  if (off.length) off.slice(0, 8).forEach((e) => fail(e.name + ' (' + e.sport + ') is captioned ' + e.pt + ', which is not among ' + JSON.stringify(e.t)));
  else ok(ENT.filter((e) => e && e.pt).length + ' captions, every one a club that player has');

  /* The three names the fix was measured on. Randy Johnson is the example
     build-primary.mjs's own header uses for what its floor cut prevents, and
     the floor never saw him: his Seattle decade is not truncated in the stints,
     it is absent, so he looked like a man who debuted in Arizona in 1999. */
  for (const [n, s, wrong] of [['Randy Johnson', 'MLB', 'Arizona Diamondbacks'],
                               ['Rickey Henderson', 'MLB', 'New York Mets'],
                               ['Roger Clemens', 'MLB', 'New York Yankees']]) {
    const e = byKey[n + '|' + s];
    if (!e) { fail(n + ' has fallen out of the corpus'); continue; }
    const cap = e.pt || (Array.isArray(e.t) && e.t.length ? e.t[0] : null);
    if (cap === wrong) fail(n + ' is captioned ' + wrong + ' again');
    else ok(n + ': ' + cap);
  }
}

console.log('\n5) the Number Game never asks about a season the player was not alive for');
{
  /* A round there is one jersey stint joined to a curated entity by name, so a
     father's stint arrives under his son's card and the question has a false
     premise. The page filters on the player's own decades; this asserts the
     filter is still in it and still bites. */
  /* The CALL, not the declaration. The first version of this asked whether the
     file still contained the function, which is true of a file that defines it
     and never runs it: deleting the one line that matters left this green. */
  const page = readFileSync('arcade/table/index.html', 'utf8');
  if (!/if\s*\(\s*!\s*_ownStint\s*\(/.test(page)) fail('the Number Game pool no longer refuses a stint that is not the player\'s');
  else ok('the pool build still asks whether the stint is his, before pushing it');

  const nk = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  const byN = {};
  for (const s of (box.RTG_JERSEYS && box.RTG_JERSEYS.stints) || []) {
    const k = s.sport + '|' + nk(s.name); (byN[k] = byN[k] || []).push(s);
  }
  let rows = 0, imp = 0; const eg = [];
  for (const e of ENT) {
    if (!e || !e.star || !Array.isArray(e.decade) || !e.decade.length) continue;
    const ss = byN[e.sport + '|' + nk(e.name)] || [];
    const lo = Math.min.apply(null, e.decade) - 1, hi = Math.max.apply(null, e.decade) + 10;
    for (const s of ss) {
      if (!s.y0) continue;
      rows++;
      if (s.y1 < lo || s.y0 > hi) { imp++; if (eg.length < 6) eg.push(e.name + ' / ' + s.team + ' ' + s.y0); }
    }
  }
  /* Printed rather than failed: these rows still EXIST in jerseys.js and always
     will, because that file is keyed by name too. What matters is that the page
     refuses them, which the check above asserts. The count moving is worth a
     look, not a red build. */
  console.log('       ' + imp + ' of ' + rows + ' name-joined stints are outside the player\'s own decades');
  eg.forEach((x) => console.log('         ' + x));
  ok('and the page drops every one of them before a round is built');
}

if (bad) { console.error('\n' + bad + ' problem' + (bad === 1 ? '' : 's')); process.exit(1); }
console.log('\nnamesakes ok');
