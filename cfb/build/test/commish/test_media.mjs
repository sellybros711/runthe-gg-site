/* THE QUESTIONS YOU TAKE STANDING UP.
 *
 *   node cfb/build/test/commish/test_media.mjs
 *
 * media.js fails the way docket.js fails, which is silently. Every question is gated on the
 * ledger, `eligible` swallows a throw and drops the question, and a question that can never be
 * asked looks exactly like a question nobody happened to get. Twenty one of them and a term
 * asks fifteen, so one that is unreachable is one a player would never find out about.
 *
 * SO REACHABILITY IS MOST OF THIS FILE. Every question is put in front of a world built to
 * make it eligible and asked to render; every answer is resolved; every promise is checked
 * against a docket item that can actually pay it, because a promise nothing collects on plants
 * a thread that sits in the office's in-motion panel for the rest of the term.
 *
 * AND THE RULE OF THE SCREEN IS ASSERTED RATHER THAN TRUSTED. Words move the room and nothing
 * else: a combined press conference must carry no `set` and no `move`, or a lectern is a place
 * a commissioner can edit the sport from and the whole mode has a dominant strategy in it.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const path = require('path');
const ROOT = path.resolve(new URL('../../../..', import.meta.url).pathname);
import { leagueTeams } from './league.mjs';
const L = require(ROOT + '/cfb/commish/ledger.js');
const B = require(ROOT + '/cfb/commish/blocs.js');
const D = require(ROOT + '/cfb/commish/docket.js');
const M = require(ROOT + '/cfb/commish/media.js');
const SIT = require(ROOT + '/cfb/commish/situation.js');
const teams = leagueTeams(ROOT);

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };
const world = (over) => {
  const w = L.createWorld({ year: 2025, membership: L.membershipFrom(teams, 2025), seed: 9 });
  w.beat = 3;
  if (over) Object.assign(w, over);
  return w;
};
const sitOf = (w) => SIT.build(w, L, {});

console.log('\n=== the shape of it ===');
{
  ok('twenty eight questions or more', M.QUESTIONS.length >= 28, M.QUESTIONS.length);
  ok('every question has three answers',
    M.QUESTIONS.every((q) => (q.answers || []).length === 3));
  ok('every question has a known asker',
    M.QUESTIONS.every((q) => !!M.ASKERS[q.who]),
    M.QUESTIONS.filter((q) => !M.ASKERS[q.who]).map((q) => q.id).join(' ') || 'all known');
  ok('every id is unique',
    new Set(M.QUESTIONS.map((q) => q.id)).size === M.QUESTIONS.length);
  ok('every answer id is unique inside its question',
    M.QUESTIONS.every((q) => new Set(q.answers.map((a) => a.id)).size === q.answers.length));
  /* AN ANSWER NOBODY FEELS IS A BUTTON THAT DOES NOTHING. The room is the only thing this
     screen moves, so an answer with no push on any axis is the whole of a wasted decision. */
  ok('every answer pushes something',
    M.QUESTIONS.every((q) => q.answers.every((a) =>
      Object.keys(a.effects || {}).length || Object.keys(a.aimed || {}).length)));
  ok('every answer files a line for the wire',
    M.QUESTIONS.every((q) => q.answers.every((a) => !!a.wrote)));
  /* A QUESTION HAS TO LAND AS ONE. Most carry a question mark; the rest are put as
     statements, which is how a reporter asks the hard ones and is deliberate. What is not
     deliberate is a question that trails off, so every one of them has to finish a sentence,
     and the statements have to stay the minority or the screen stops reading as a room. */
  const asks = M.QUESTIONS.map((q) => M.saysOf(q)[0] || '');
  ok('every question finishes its sentence',
    asks.every((t) => /[.?]$/.test(t)),
    asks.filter((t) => !/[.?]$/.test(t)).length + ' trail off');
  const marked = asks.filter((t) => /\?/.test(t)).length;
  ok('and most of them are literally questions',
    marked >= Math.ceil(asks.length * 0.65), marked + ' of ' + asks.length);
  /* Every axis an answer names has to be one the blocs actually weight, or the push is
     arithmetic against a key nobody reads. */
  const known = new Set(L.AXES);
  const strays = [];
  M.QUESTIONS.forEach((q) => q.answers.forEach((a) => {
    Object.keys(a.effects || {}).forEach((k) => { if (!known.has(k)) strays.push(q.id + ':' + k); });
    Object.keys(a.aimed || {}).forEach((b) => {
      if (!B.BY_ID[b]) strays.push(q.id + ' aims at ' + b);
      Object.keys(a.aimed[b]).forEach((k) => { if (!known.has(k)) strays.push(q.id + ':' + b + ':' + k); });
    });
  }));
  ok('no answer names an axis or a bloc that does not exist', !strays.length, strays.slice(0, 4).join(', '));
}

console.log('\n=== every question can actually be asked ===');
{
  /* One world per question, built to open its own gate. The generic pair need nothing; the
     rest need a sport that has been changed in a particular way, which is the point of them. */
  const setups = {
    'q-share-cut': (w) => { w.money.share['Group of Five'] = 0.06; L.normalizeShare(w.money.share); },
    'q-share-gain': (w) => { w.money.share.SEC = 0.4; w.money.share.ACC = 0.05; L.normalizeShare(w.money.share); },
    'q-nopay': () => {},
    'q-pay': (w) => { w.labour.revShare = 0.22; },
    'q-employment': (w) => { w.labour.employment = 'employee'; },
    'q-reentry': () => {},
    'q-split-rules': (w) => { w.labour.rulesBy = 'conference'; w.labour.confReentry['Big Ten'] = 'closed'; },
    'q-portal': () => {},
    'q-field': (w) => { w.playoff.teams = 16; },
    'q-autobids': (w) => { w.playoff.autobids = 3; },
    'q-sold': (w) => { w.brand.playoff = 'bank'; w.brand.patch = 'phone'; w.brand.trophy = 'airline'; },
    'q-gambling': (w) => { w.posture.gambling = 'partnered'; },
    'q-defunct': (w) => { Object.keys(w.membership).forEach((s) => { if (w.membership[s] === 'ACC') delete w.membership[s]; });
      w.membership['Duke'] = 'ACC'; },
    'q-endangered': (w) => {
      const keep = Object.keys(w.membership).filter((s) => w.membership[s] === 'Big 12').slice(0, 5);
      Object.keys(w.membership).forEach((s) => {
        if (w.membership[s] === 'Big 12' && keep.indexOf(s) < 0) w.membership[s] = 'SEC';
      });
    },
    'q-rules': (w) => { w.rules.overtime = 'sudden'; },
    'q-nonrev': (w) => { w.posture.nonRevGuarantee = false; },
    'q-shaky': (w) => { w.year = 2027; Object.keys(w.blocs).forEach((b) => { w.blocs[b] = 20; });
      w.meters.standing = L.standingFrom(w.blocs); },
    'q-first': () => {},
    'q-last': (w) => { w.year = 2029; },
    'q-for': () => {},
    'q-pool': (w) => { w.money.dealYears = 2; },
    'q-field-small': () => {},
    'q-unsold': () => {},
    'q-gambling-permitted': () => {},
    'q-deal': () => {},
    'q-champion': (w) => { w.year = 2026; w.champs = { 2025: { school: 'Ohio State', color: '#bb0000' } }; },
    'q-coaches': () => {},
    'q-schedule': () => {},
  };
  const missing = M.QUESTIONS.filter((q) => !setups[q.id]).map((q) => q.id);
  ok('every question has a setup in this test', !missing.length, missing.join(' '));

  const unreachable = [];
  const broken = [];
  M.QUESTIONS.forEach((q) => {
    const w = world();
    if (setups[q.id]) setups[q.id](w);
    const sit = sitOf(w);
    if (M.eligible(w, L, sit).indexOf(q) < 0) { unreachable.push(q.id); return; }
    const cast = M.castOf(q, w, L, sit);
    const ask = String(M.askText(q, cast, sit, w));
    const desk = String(M.text(q.desk, cast, q, sit, w) || '');
    const strs = [ask, desk].concat(q.answers.map((a) => a.label + a.body + a.wrote));
    strs.forEach((t) => {
      if (/undefined|NaN|\[object|=>/.test(t)) broken.push(q.id + ': ' + t.slice(0, 60));
    });
    if (ask.length < 40) broken.push(q.id + ': question is ' + ask.length + ' characters');
    q.answers.forEach((a) => {
      const r = M.resolve(q, a.id, cast);
      if (!r || !r.id) broken.push(q.id + ':' + a.id + ' did not resolve');
    });
  });
  ok('every question is reachable', !unreachable.length, unreachable.join(' '));
  ok('every question and answer renders', !broken.length, broken.slice(0, 3).join(' | '));
}

console.log('\n=== a press conference edits nobody ===');
{
  const w = world();
  const sit = sitOf(w);
  const ids = M.pickSet(w, L, () => 0.4, sit, 3);
  ok('three questions come back', ids.length === 3, ids.join(' '));
  ok('and they are three different ones', new Set(ids).size === ids.length);
  const rows = ids.map((id) => M.resolve(M.BY_ID[id], M.BY_ID[id].answers[0].id,
    M.castOf(M.BY_ID[id], w, L, sit)));
  const edit = M.combine(w, rows);
  /* THE RULE OF THE SCREEN. */
  ok('the combined push writes no ledger field', !edit.set, JSON.stringify(edit.set || null));
  ok('and moves no school', !edit.move);
  ok('it carries an id the ledger will not count as a ruling', !L.isRuling(edit), edit.id);
  ok('and it does push the room', Object.keys(edit.effects).length > 0,
    Object.keys(edit.effects).join(' '));
  const after = L.applyEdit(w, edit);
  ok('applying it leaves the sport identical',
    JSON.stringify(Object.assign({}, after, { history: 0 }))
    === JSON.stringify(Object.assign({}, w, { history: 0 })));
  ok('  ...and still leaves a row on the record', after.history.length === w.history.length + 1);
  ok('which the ruling count does not include',
    SIT.build(after, L, {}).ruled === SIT.build(w, L, {}).ruled,
    SIT.build(after, L, {}).ruled + ' vs ' + SIT.build(w, L, {}).ruled);
  const rowsOut = B.react(w, edit);
  ok('the room answers all nine', rowsOut.length === 9);
  ok('and somebody actually moved', rowsOut.some((r) => Math.abs(r.delta) >= 0.5),
    rowsOut.map((r) => r.delta).join(' '));
}

console.log('\n=== every promise has somebody to collect on it ===');
{
  const promises = [];
  M.QUESTIONS.forEach((q) => q.answers.forEach((a) => {
    if (!a.promise) return;
    const p = typeof a.promise === 'function'
      ? a.promise({ conf: 'ACC', size: 5 }, q) : a.promise;
    promises.push({ q: q.id, a: a.id, p });
  }));
  ok('there are promises to make', promises.length >= 6, promises.length);
  ok('every promise has an id and a note',
    promises.every((r) => r.p && r.p.id && r.p.note));
  /* A THREAD NOTHING PAYS SITS IN THE OFFICE FOR THE REST OF THE TERM. See paintMotion(). */
  const orphan = promises.filter((r) => !D.ITEMS.some((it) =>
    [].concat(it.pays || []).indexOf(r.p.id) >= 0));
  ok('and a docket item that collects on it', !orphan.length,
    orphan.map((r) => r.p.id).join(' '));

  /* And the item it plants into has to be able to fire, and every option on it has to be a
     legal edit: a payoff whose ruling throws on a path the ledger does not have is a dead end
     the player reaches by keeping their word. */
  const dead = [];
  promises.forEach((r) => {
    let w = world({ year: 2027 });
    w.membership['Duke'] = 'ACC';
    /* RIPE NOW. Planting with the promise's own wait dates it seven to sixteen beats into
       the future, so `sit.ripe` is empty and every payoff below reads as never firing. That is
       what this said the first time it ran, and the bug was in the test. */
    w = L.plant(w, r.p.id, Object.assign({}, r.p, { wait: 0 }));
    const sit = sitOf(w);
    const it = D.ITEMS.find((x) => [].concat(x.pays || []).indexOf(r.p.id) >= 0);
    if (D.eligible(w, L, sit).indexOf(it) < 0) { dead.push(r.p.id + ' never fires'); return; }
    const cast = D.castOf(it, w, L, () => 0.5, sit);
    const title = String(D.text(it.title, cast, it, sit));
    const brief = String(D.text(it.brief, cast, it, sit));
    if (/undefined|NaN|\[object|=>/.test(title + brief)) dead.push(r.p.id + ': ' + title);
    it.options.forEach((o) => {
      try { L.applyEdit(w, D.resolve(it, o.id, {}, cast)); }
      catch (e) { dead.push(r.p.id + ':' + o.id + ' ' + e.message); }
    });
  });
  ok('every payoff fires and every ruling on it is legal', !dead.length, dead.slice(0, 3).join(' | '));
}

console.log('\n=== a whole term at the lectern ===');
{
  /* Five Julys, fifteen questions, and the thing worth checking is that they are fifteen
     DIFFERENT ones: a room that asks the same thing two summers running is a room that has
     stopped listening, and `since` is the only thing standing between this and that. */
  /* A REAL GENERATOR, because a constant one is not a test of the weighting, it is a test of
     which index a constant lands on: the first version of this used `() => k` and reported ten
     repeats out of fifteen, which said nothing about the code.

     AND A RATE RATHER THAN A BAN. `since` collapses a repeat's weight rather than removing it,
     so that a world with four eligible questions can still fill a press conference, which
     means back to back is rare and not impossible. Asserting never would be asserting a thing
     the code does not do and would go red on a seed nobody chose.

     THE WORLD HERE NEVER CHANGES, which is the worst case and the reason to use it: the pool
     is thirteen all five years. A commissioner who actually rules on anything opens more of
     them, so a real term sees more than this. Measured over three hundred terms: 0.75% back to
     back, and eleven different questions out of fifteen at the median. */
  let seed = 12345;
  const rng = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const RUNS = 300;
  const dist = [];
  let repeats = 0, transitions = 0, twiceInOneJuly = 0;
  for (let run = 0; run < RUNS; run++) {
    const w = world();
    const asked = [];
    for (let y = 0; y < 5; y++) {
      w.year = 2025 + y;
      const ids = M.pickSet(w, L, rng, sitOf(w), 3);
      if (ids.length !== 3) twiceInOneJuly++;
      if (new Set(ids).size !== ids.length) twiceInOneJuly++;
      w.press = w.press || {};
      if (y > 0) {
        const prev = w.press[String(w.year - 1)].qs;
        ids.forEach((id) => { transitions++; if (prev.indexOf(id) >= 0) repeats++; });
      }
      w.press[String(w.year)] = { qs: ids, said: ids.map((id) => ({ q: id, a: M.BY_ID[id].answers[0].id })) };
      asked.push.apply(asked, ids);
    }
    dist.push(new Set(asked).size);
  }
  dist.sort((a, b) => a - b);
  ok('every July asks three different questions', !twiceInOneJuly, twiceInOneJuly);
  ok('the same question two Julys running is under one in fifty',
    repeats / transitions < 0.02, (100 * repeats / transitions).toFixed(2) + '%');
  ok('the median term hears eleven different questions of fifteen',
    dist[Math.floor(RUNS / 2)] >= 11, dist[Math.floor(RUNS / 2)]);
  ok('and the thinnest one still hears nine', dist[0] >= 9, dist[0]);
}

console.log('\n=== the width of it on a phone ===');
{
  /* SAME GUARD THE DESK RUNS. A question is set larger than a brief and it is the whole top of
     the screen, so a long one pushes the answers below the fold on a 360px phone before
     anybody has read them. Measured in characters here and in pixels in test_desk. */
  const long = [];
  M.QUESTIONS.forEach((q) => {
    const cast = q.cast ? null : null;
    M.saysOf(q).forEach((t) => { if (t.length > 340) long.push(q.id + ' ' + t.length); });
    (q.answers || []).forEach((a) => {
      if (String(a.label).length > 44) long.push(q.id + ':' + a.id + ' label ' + a.label.length);
    });
  });
  ok('nothing runs past what a card can hold', !long.length, long.slice(0, 4).join(' '));
}

console.log(bad ? '\n' + bad + ' FAILED\n' : '\nall good\n');
process.exit(bad ? 1 : 0);
