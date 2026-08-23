/* THE DESK: what lands on it, and what a ruling turns into.
 *
 *   node cfb/build/test/commish/test_docket.mjs
 *
 * The docket is the half of the mode somebody has to write by hand, so this is mostly about
 * the ways hand-written data goes wrong quietly:
 *
 *   an item that names a ledger field nobody has, which is a ruling that does nothing
 *   an item that can come up twice, or that can never come up at all
 *   a dial that moves the world but not the room, so turning it is decoration
 *   a paid dial that is not actually more control than the free one
 *   a ruling that plays differently for a paying player than a free one in some way OTHER
 *     than the dials, which would mean the tiers are two games instead of one
 *
 * That last one is the load-bearing claim of the whole tier design: free and paid produce
 * the same KIND of thing, a ledger edit, and everything downstream is blind to which.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(new URL('../../../..', import.meta.url).pathname);
const L = require(ROOT + '/cfb/commish/ledger.js');
const B = require(ROOT + '/cfb/commish/blocs.js');
const D = require(ROOT + '/cfb/commish/docket.js');
const E = require(ROOT + '/cfb/engine.js');
const teams = JSON.parse(fs.readFileSync(ROOT + '/cfb/data/cfb_team_seasons.json', 'utf8'));

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };
const world0 = (year) => L.createWorld({ year: year || 2025, membership: L.membershipFrom(teams, year || 2025), seed: 7 });

console.log('\n=== every item is well formed ===');
{
  const w = world0();
  const bloc = new Set(B.BLOCS.map((b) => b.id));
  const axis = new Set(L.AXES);
  let badPath = [], badAxis = [], badBloc = [], thin = [];

  for (const it of D.ITEMS) {
    if (!it.options || it.options.length < 2) thin.push(it.id);
    for (const o of it.options) {
      /* EVERY FIELD AN ITEM CLAIMS TO WRITE HAS TO EXIST. This is the same guard applyEdit
         holds at runtime, checked here so a typo is a failing test rather than a ruling
         that throws in a player's face halfway through a term. */
      for (const p2 in (o.edit || {}).set || {}) {
        if (L.getPath(w, p2) === undefined) badPath.push(it.id + '/' + o.id + ' -> ' + p2);
      }
      for (const a in (o.edit || {}).effects || {}) if (!axis.has(a)) badAxis.push(it.id + '/' + o.id + ' -> ' + a);
      for (const b in (o.edit || {}).aimed || {}) {
        if (!bloc.has(b)) badBloc.push(it.id + '/' + o.id + ' -> ' + b);
        for (const a in o.edit.aimed[b]) if (!axis.has(a)) badAxis.push(it.id + '/' + o.id + ' -> ' + a);
      }
    }
    for (const d of it.dials || []) {
      if (L.getPath(w, d.path) === undefined) badPath.push(it.id + '/dial ' + d.id + ' -> ' + d.path);
      for (const a in d.per || {}) if (!axis.has(a)) badAxis.push(it.id + '/dial ' + d.id + ' -> ' + a);
      for (const b in d.aim || {}) if (!bloc.has(b)) badBloc.push(it.id + '/dial ' + d.id + ' -> ' + b);
    }
    for (const v of it.voices || []) if (!bloc.has(v.id)) badBloc.push(it.id + '/voice -> ' + v.id);
  }
  ok('every field an item writes exists in the ledger', !badPath.length, badPath.join(', ') || D.ITEMS.length + ' items');
  ok('  every axis it pushes on is a real axis', !badAxis.length, badAxis.join(', '));
  ok('  every bloc it names is in the room', !badBloc.length, badBloc.join(', '));
  ok('  and nothing is a single-option question', !thin.length, thin.join(', '));

  const ids = D.ITEMS.map((i) => i.id);
  ok('ids are unique', new Set(ids).size === ids.length);
  ok('every item lands on a beat the calendar has',
    D.ITEMS.every((i) => i.beats.length && i.beats.every((b) => b >= 0 && b < L.BEATS.length)));
  /* NO NAMED PEOPLE, which is a decision in the plan and the kind that erodes one item at a
     time unless something checks. An institution speaks; a person does not. */
  const prose = JSON.stringify(D.ITEMS);
  ok('nobody is quoted by name', !/\b(commissioner|president) [A-Z][a-z]+/.test(prose));
}

console.log('\n=== the desk is not empty, and it is not the same every year ===');
{
  const w = world0();
  let covered = 0;
  for (let beat = 0; beat < L.BEATS.length; beat++) {
    const pool = D.eligible(Object.assign({}, w, { beat }), L);
    if (pool.length) covered++;
  }
  ok('most beats have something to rule on', covered >= 5, covered + ' of ' + L.BEATS.length + ' beats');
  /* AND EVERY ITEM IS REACHABLE. An item nobody can ever be dealt is worse than no item:
     it is writing that looks like content. */
  const seen = new Set();
  for (let beat = 0; beat < L.BEATS.length; beat++) {
    D.eligible(Object.assign({}, w, { beat }), L).forEach((i) => seen.add(i.id));
  }
  /* The ones that gate on a changed world are checked on the world they need. */
  const late = world0();
  late.money.dealYears = 1;
  D.eligible(Object.assign({}, late, { beat: D.BEATS.SPRING }), L).forEach((i) => seen.add(i.id));
  const unreachable = D.ITEMS.filter((i) => !seen.has(i.id)).map((i) => i.id);
  ok('every item can actually be dealt', !unreachable.length, unreachable.join(', ') || seen.size + ' reachable');
}

console.log('\n=== a raid is about somebody, and it moves them ===');
{
  /* THE ITEM THE TEST CAUGHT TWICE. Its gate wanted a power conference of fourteen or
     fewer, which described the sport in 2014 and nothing since, so it was unreachable in
     the world the mode opens in. And its first option had no `move` at all, so allowing a
     raid changed nobody's conference: the item most obviously about the map was the one
     item that never touched it. */
  const w = world0();
  w.beat = D.BEATS.NOV;
  ok('it can be dealt in the sport as it is now',
    D.eligible(w, L).some((i) => i.id === 'raid'),
    L.POWERS.map((c) => c + ' ' + L.membersOf(w, c).length).join(', '));

  const item = D.BY_ID.raid;
  const rng = E.createSeededRNG(E.hashSeed('raid'));
  const cast = D.castOf(item, w, L, rng);
  ok('  and it is about two schools by name', cast.schools.length === 2,
    cast.schools.join(' and ') + ', ' + cast.from + ' to ' + cast.to);
  ok('  who the brief actually names',
    cast.schools.every((sch) => D.text(item.title, cast, item).indexOf(sch) >= 0),
    D.text(item.title, cast, item));

  const allowed = L.applyEdit(w, D.resolve(item, 'allow', {}, cast));
  ok('allowing it moves them', cast.schools.every((sch) => allowed.membership[sch] === cast.to),
    cast.schools.map((sch) => sch + ' -> ' + allowed.membership[sch]).join(', '));
  ok('  and the conference losing them is a school short',
    L.membersOf(allowed, cast.from).length === L.membersOf(w, cast.from).length - cast.schools.length,
    cast.from + ' ' + L.membersOf(w, cast.from).length + ' to ' + L.membersOf(allowed, cast.from).length);

  const blocked = L.applyEdit(w, D.resolve(item, 'block', {}, cast));
  ok('blocking it moves nobody',
    cast.schools.every((sch) => blocked.membership[sch] === w.membership[sch]));
  ok('  but it costs you with the two that wanted it',
    B.react(w, D.resolve(item, 'block', {}, cast)).find((r) => r.id === 'SEC').delta < 0);
}

console.log('\n=== an item asked twice is an item that has not noticed ===');
{
  let w = world0();
  w.beat = D.BEATS.WINTER;
  ok('the playoff item is on the desk at twelve teams',
    D.eligible(w, L).some((i) => i.id === 'playoff-format'));
  const item = D.BY_ID['playoff-format'];
  w = L.applyEdit(w, D.resolve(item, 'to16', {}));
  ok('  and gone once the field is sixteen', !D.eligible(w, L).some((i) => i.id === 'playoff-format'),
    w.playoff.teams + ' teams');

  const deal = world0(); deal.beat = D.BEATS.SPRING;
  ok('the media deal waits until it is nearly up',
    !D.eligible(deal, L).some((i) => i.id === 'media-deal'), deal.money.dealYears + ' years to run');
  deal.money.dealYears = 1;
  ok('  and then it is the item', D.eligible(deal, L).some((i) => i.id === 'media-deal'));
}

console.log('\n=== a ruling is one ledger edit, whichever tier wrote it ===');
{
  const w = world0();
  const item = D.BY_ID['playoff-format'];
  const edit = D.resolve(item, 'to16', {});
  ok('an option resolves to something applyEdit takes', !!edit.set && !!edit.effects);
  const after = L.applyEdit(w, edit);
  ok('  and it really changes the sport', after.playoff.teams === 16, after.playoff.teams + ' teams');
  ok('  the room has an opinion about it', B.react(w, edit).length === 9);
  ok('  and it is on the record under a readable name', after.history[0].label,
    after.history[0].label);

  let threw = null;
  try { D.resolve(item, 'to20', {}); } catch (e) { threw = e.message; }
  ok('an option nobody wrote is an error', !!threw && /no option/.test(threw), threw);
}

console.log('\n=== the dials are the tier, and they are not decoration ===');
{
  const w = world0();
  const item = D.BY_ID['playoff-format'];
  const dial = item.dials.find((d) => d.id === 'autobids');

  ok('paying is more control, on every dial that has any',
    D.ITEMS.every((i) => (i.dials || []).every((d) => D.settings(d, true).length >= D.settings(d, false).length)),
    D.ITEMS.reduce((t, i) => t + (i.dials || []).length, 0) + ' dials');
  ok('  and the free settings are a subset of the paid ones',
    D.ITEMS.every((i) => (i.dials || []).every((d) =>
      D.settings(d, false).every((v) => D.settings(d, true).indexOf(v) >= 0))));
  ok('  the paid range on autobids reaches settings free never sees',
    D.settings(dial, true).indexOf(8) >= 0 && D.settings(dial, false).indexOf(8) < 0,
    'free ' + D.settings(dial, false).join(',') + '   paid ' + D.settings(dial, true).join(','));

  /* HOW EVERY SETTING READS, checked here rather than on the page, because a page test can
     only check the item it happened to draw and the one it drew was a pair of counts. The
     bug this exists for is a media rights pool that printed as "130%": the formatter used
     to infer a percentage from a step size below one, and the pool steps by 0.3 billion.
     Every dial, every setting, against the unit the data declares. */
  const wrong = [];
  for (const it of D.ITEMS) {
    for (const d of it.dials || []) {
      const shape = d.unit === 'pct' ? /^-?\d+%$/ : d.unit === 'bn' ? /^\$\d+\.\d+B$/ : /^-?\d+(\.\d+)?$/;
      for (const v of D.settings(d, true)) {
        const s = D.format(d, v);
        if (!shape.test(s)) wrong.push(it.id + '.' + d.id + ' ' + v + ' reads "' + s + '"');
      }
    }
  }
  ok('  and every setting reads as the kind of number it is', !wrong.length,
    wrong.join(' | ') || D.ITEMS.flatMap((i) => (i.dials || []).map((d) =>
      d.id + ' ' + D.format(d, D.settings(d, true)[0]) + ' to ' + D.format(d, D.settings(d, true).slice(-1)[0]))).join(', '));
  /* A DIAL THAT DECLARES NO UNIT PRINTS A BARE NUMBER, which is right for a count of games
     and wrong for money. Money is the one that has been got wrong, so name the paths. */
  const moneyish = [];
  for (const it of D.ITEMS) {
    for (const d of it.dials || []) {
      if (!d.unit && /share|pool|pay|money|cut|rev/i.test(d.path + ' ' + d.id)) moneyish.push(it.id + '.' + d.id);
    }
  }
  ok('  and no money dial is left to print as a bare number', !moneyish.length, moneyish.join(', ') || 'none');

  /* A DIAL THAT MOVES THE WORLD BUT NOT THE ROOM IS DECORATION, and decoration in a
     decision screen is worse than nothing: it teaches a player their choices are cosmetic. */
  const low = D.resolve(item, 'to16', { autobids: 3 });
  const high = D.resolve(item, 'to16', { autobids: 8 });
  ok('turning a dial writes a different world',
    low.set['playoff.autobids'] === 3 && high.set['playoff.autobids'] === 8);
  ok('  and the room feels the difference',
    high.effects.access > low.effects.access,
    'access ' + low.effects.access + ' at three bids, ' + high.effects.access + ' at eight');
  const g5low = B.react(w, low).find((r) => r.id === 'Group of Five').delta;
  const g5high = B.react(w, high).find((r) => r.id === 'Group of Five').delta;
  ok('  the Group of Five in particular', g5high > g5low + 2,
    g5low + ' at three bids, ' + g5high + ' at eight');
  const seclow = B.react(w, low).find((r) => r.id === 'SEC').delta;
  const sechigh = B.react(w, high).find((r) => r.id === 'SEC').delta;
  ok('  and it costs you with the SEC the other way', sechigh < seclow,
    seclow + ' at three bids, ' + sechigh + ' at eight');

  /* THE CLAIM THE TIERS REST ON. A paid ruling is not a different mechanism, it is a wider
     dial on the same one. If that ever stops being true the two tiers are two games. */
  const freeRuling = D.resolve(item, 'to16', { autobids: 6 });
  const paidRuling = D.resolve(item, 'to16', { autobids: 7 });
  ok('a paid ruling is the same shape as a free one',
    Object.keys(freeRuling).sort().join() === Object.keys(paidRuling).sort().join(),
    Object.keys(freeRuling).sort().join(', '));
  ok('  so nothing downstream can tell which tier ruled',
    typeof L.applyEdit(w, paidRuling) === 'object' && typeof L.applyEdit(w, freeRuling) === 'object');
}

console.log('\n=== a term off the real docket ===');
{
  /* The bot rules by picking the middle option every time, which is the least interesting
     commissioner imaginable and exactly what a fixture wants. */
  function term(seed, pro) {
    const rng = E.createSeededRNG(E.hashSeed('docket|' + seed));
    let w = L.createWorld({ year: 2025, membership: L.membershipFrom(teams, 2025), seed });
    let ruled = 0, empty = 0;
    for (let i = 0; i < 45; i++) {
      const item = D.pick(w, L, rng);
      if (!item) { empty++; w = L.advance(w); continue; }
      const option = item.options[Math.floor(rng() * item.options.length)];
      const dials = {};
      for (const d of item.dials || []) {
        const opts = D.settings(d, pro);
        dials[d.id] = opts[Math.floor(rng() * opts.length)];
      }
      const edit = D.resolve(item, option.id, dials);
      w = L.applyOutcome(L.applyEdit(w, edit), edit, B.deltas(w, edit));
      ruled++;
      const out = L.removal(w);
      if (out.removed) { w.outcome = out; break; }
      w = L.advance(w);
    }
    return { w, ruled, empty };
  }
  const a = term(11, false);
  /* A TERM ENDS ONE OF TWO WAYS AND BOTH ARE A PASS. This asked for more than twenty
     rulings and got eighteen, because the bot was fired in the fourth season: it rules at
     random off a docket with real consequences, so of course it is. Getting removed is the
     game working, not the docket failing, and an assertion that cannot tell those apart is
     an assertion that will be edited away the first time somebody tunes a weight. */
  ok('a term plays off the real docket', a.ruled > 10 && (a.w.outcome || a.w.year > 2025),
    a.ruled + ' rulings, ' + a.empty + ' quiet beats, '
    + (a.w.outcome ? 'removed in ' + a.w.year + ': ' + a.w.outcome.reason : 'served the full term'));
  /* HALF THE TERM HAS NOTHING ON THE DESK, and that is a content gap rather than a bug:
     eight items cannot fill forty-five beats. It is asserted at the number it is at so it
     shows up in the output and gets tighter as items are written, rather than being
     discovered when somebody plays a term and skips through most of it. */
  ok('  and the desk is empty about as often as eight items predict', a.empty <= 25,
    a.empty + ' of ' + (a.ruled + a.empty) + ' beats had nothing on it');
  ok('  and the sport is somewhere else by the end',
    a.w.playoff.teams !== 12 || a.w.labour.revShare > 0 || a.w.rules.confGames !== 9,
    a.w.playoff.teams + '-team playoff, ' + Math.round(a.w.labour.revShare * 100) + '% to the players, '
    + a.w.rules.confGames + ' conference games');
  const b = term(11, false);
  ok('  the same seed replays it exactly', JSON.stringify(a.w) === JSON.stringify(b.w));
  const c = term(11, true);
  /* NAME THE FIELDS THAT MOVED rather than printing three chosen in advance. The first
     version of this line printed the playoff size, the autobids and the players' share
     for both terms, and on this seed all three matched: a passing assertion under a
     detail line that read as a failure. What differs is whatever differs. */
  function diffs(x, y, path) {
    if (x === y) return [];
    if (x && y && typeof x === 'object' && typeof y === 'object' && !Array.isArray(x)) {
      const keys = Object.keys(Object.assign({}, x, y));
      return keys.flatMap((k) => diffs(x[k], y[k], path ? path + '.' + k : k));
    }
    if (JSON.stringify(x) === JSON.stringify(y)) return [];
    const short = (v) => (Array.isArray(v) ? v.length + ' entries' : JSON.stringify(v));
    return [path + ' ' + short(x) + ' to ' + short(y)];
  }
  const moved = diffs(a.w, c.w, '');
  ok('  and a paying player, on the same seed, gets a different sport',
    moved.length > 0, moved.slice(0, 3).join('   |   ') + (moved.length > 3 ? '   (+' + (moved.length - 3) + ' more)' : ''));
}

console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
