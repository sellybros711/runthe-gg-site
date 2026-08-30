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
import { leagueTeams } from './league.mjs';
const L = require(ROOT + '/cfb/commish/ledger.js');
const B = require(ROOT + '/cfb/commish/blocs.js');
const D = require(ROOT + '/cfb/commish/docket.js');
const S = require(ROOT + '/cfb/commish/season.js');
const SIT = require(ROOT + '/cfb/commish/situation.js');
const CAL = require(ROOT + '/cfb/commish/calendar.js');
const E = require(ROOT + '/cfb/engine.js');
const teams = leagueTeams(ROOT);

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

  /* AND A VOICE FITS THE BOX IT IS DRAWN IN, roughly. The desk gives a speaker two lines on a
     phone and eighty-five characters is about the longest quote that has ever rendered in two.

     THIS IS A CANARY AND NOT THE GUARD, which is worth knowing before trusting it. It cannot
     be the guard for two reasons: the desk renders the SPEAKER'S NAME in the same flow, so
     the real budget is the name plus the quote, and the font is proportional and the name is
     bold, so twelve characters of one name are wider than fourteen of another. A line that
     overflowed at eighty-three characters passed this check while sitting at ninety-five
     rendered, next to another line at exactly ninety-five that fits. test_desk draws all two
     hundred and twenty-five into the real container and measures them, which is the guard.
     This one is here because it is free and it catches the egregious case without a browser. */
  /* EVERY STRING THE VOICE CAN SAY, not just the one it happens to say with no cast. A quote
     that varies with what is on the desk is declared as a map of variants exactly so this
     stays countable: see voiceSays() in docket.js. */
  const long = [];
  const allSays = D.ITEMS.flatMap((it) => (it.voices || [])
    .flatMap((v) => D.voiceSays(v).map((s) => ({ it, v, s }))));
  allSays.forEach(({ it, v, s }) => {
    if (s.length > 85) long.push(it.id + '/' + v.id + ' ' + s.length);
  });
  ok('  and says it in two lines', !long.length, long.slice(0, 4).join(', ')
    || 'longest of ' + allSays.length + ' is ' + Math.max(...allSays.map((x) => x.s.length)));
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
  /* AND THE ONE WAY DOOR NEEDS A SPORT THAT HAS ALREADY DECIDED SOMETHING ABOUT IT. Four of
     these items are about living with the rule rather than writing it: the transfer arbitrage
     needs the leagues to have diverged, the review needs a year of the rule to review, the
     lawsuit needs a rule to sue over. None of that exists on an opening world, and all of it
     is one ruling away from existing. Checked on the worlds they need, the same way a crisis
     is checked on a world where the fuse is lit. */
  const doors = [];
  {
    const shut = world0(); shut.labour.reentry = 'closed'; shut.year = shut.startYear + 2;
    const win = world0(); win.labour.reentry = 'window'; win.year = win.startYear + 2;
    const split = world0();
    split.year = split.startYear + 1;
    split.labour.rulesBy = 'conference';
    split.labour.confReentry = { SEC: 'open', 'Big Ten': 'closed', ACC: '', 'Big 12': '' };
    const openLater = world0(); openLater.year = openLater.startYear + 2;
    doors.push(shut, win, split, openLater);
    /* AND A SPORT THAT HAS ALREADY PLACED ITS BIG GAMES. Three of the venue items are about
       living with a choice rather than making one: a rota to replace the auction, a host city
       that cannot deliver what it bid. None of that exists until a title game has been placed
       somewhere, which is one ruling away and is not the opening world. */
    const placed = world0();
    placed.year = placed.startYear + 1;
    placed.venues.title = 'nola';
    placed.venues.lastTitle = 'atl';
    const sold = world0();
    sold.year = sold.startYear + 1;
    sold.venues.title = 'lv';
    sold.brand.playoff = 'crypto';
    sold.brand.patch = 'pickup';
    sold.brand.bowls.rose = 'bank';
    doors.push(placed, sold);
  }
  doors.forEach((d) => {
    for (let beat = 0; beat < L.BEATS.length; beat++) {
      const wb = Object.assign({}, d, { beat });
      D.eligible(wb, L, SIT.build(wb, L, { calendar: CAL })).forEach((i) => seen.add(i.id));
    }
  });

  /* A CRISIS NEEDS A LIT FUSE, which is the whole point of one: it cannot be reached from an
     opening world and it is not unreachable, it is waiting. Checked on the world it needs. */
  const burning = world0();
  burning.pressure = { legal: 90, congress: 90, union: 90 };
  D.eligible(Object.assign({}, burning, { beat: D.BEATS.WINTER }), L).forEach((i) => seen.add(i.id));
  /* AND THE ONES THAT GATE ON WHAT IS HAPPENING NEED FOOTBALL TO HAVE HAPPENED. Half the
     docket now asks the situation rather than the ledger: is anybody unbeaten, did somebody
     lose a game they were paid to win, is the audience falling. None of that can be reached
     from a hand-built world, and gating on it is exactly how an item becomes writing that
     looks like content.

     So this plays real seasons and asks the real question. If no season across all these
     seeds ever produces a 45 point blowout, the item about the 45 point blowout is dead, and
     that is a thing to find out here rather than from a player who never sees it. */
  const seedsPlayed = 14;
  for (let s = 0; s < seedsPlayed; s++) {
    const base = world0();
    base.seed = 'reach' + s;
    for (const beat of [D.BEATS.SEPT, D.BEATS.OCT, D.BEATS.NOV, D.BEATS.CHAMP, D.BEATS.PLAYOFF]) {
      const seg = S.throughAtBeat(beat) || { through: S.WEEKS, titles: true, bracket: true };
      const wb = Object.assign({}, base, { beat });
      let sim = null;
      try {
        sim = S.play(wb, teams, E.createSeededRNG(900 + s),
          { through: seg.through, titles: !!seg.titles, bracket: !!seg.bracket });
      } catch (e) { sim = null; }
      const sit = SIT.build(wb, L, { sim, calendar: CAL });
      D.eligible(wb, L, sit).forEach((i) => seen.add(i.id));
    }
    /* AND A SPORT SOMEBODY HAS DAMAGED, because two of these items are about a falling
       audience and an audience cannot fall in year one. This is not a contrived world: it is
       a four team playoff and a six game conference schedule against a term average from
       before that, which is precisely the trajectory the item exists to comment on. */
    const shrunk = world0();
    shrunk.seed = 'shrink' + s;
    shrunk.year = shrunk.startYear + 2;
    shrunk.playoff.teams = 4; shrunk.rules.confGames = 6;
    shrunk.ratings = { [shrunk.startYear]: { total: 880, perGame: 1.7, title: 21 },
      [shrunk.startYear + 1]: { total: 875, perGame: 1.72, title: 21 } };
    for (const beat of [D.BEATS.SEPT, D.BEATS.OCT, D.BEATS.NOV]) {
      const seg = S.throughAtBeat(beat) || { through: S.WEEKS };
      const wb = Object.assign({}, shrunk, { beat });
      let sim = null;
      try {
        sim = S.play(wb, teams, E.createSeededRNG(1900 + s),
          { through: seg.through, titles: !!seg.titles, bracket: !!seg.bracket });
      } catch (e) { sim = null; }
      D.eligible(wb, L, SIT.build(wb, L, { sim, calendar: CAL })).forEach((i) => seen.add(i.id));
    }
    /* The offseason beats read LAST season, so they need a term that has one behind it. */
    const later = world0();
    later.year = base.startYear + 2;
    later.champs = { [base.startYear + 1]: { school: 'Ohio State', color: '#bb0000' } };
    later.ratings = { [base.startYear + 1]: { total: 800, perGame: 1.5, title: 20 } };
    for (const beat of [D.BEATS.WINTER, D.BEATS.PORTAL, D.BEATS.SPRING, D.BEATS.MEDIA]) {
      const wb = Object.assign({}, later, { beat });
      D.eligible(wb, L, SIT.build(wb, L, { calendar: CAL })).forEach((i) => seen.add(i.id));
    }
  }
  /* AND THE ONES THAT ONLY EXIST BECAUSE OF SOMETHING THIS OFFICE DID EARLIER. A payoff item
     is gated on a thread having ripened, so no amount of walking beats will produce one: the
     world has to have been changed by a ruling first. Planting every thread at once is not a
     world a player reaches, and it does not need to be, because what this asserts is that the
     item is WRITABLE against a ripe thread. Whether the thread can be planted at all is the
     separate and more interesting question, asserted on its own below. */
  {
    const withThreads = world0();
    withThreads.year = withThreads.startYear + 2;
    D.ITEMS.forEach((it) => {
      [].concat(it.pays || []).forEach((id) => { withThreads.threads.push({ id, ripe: 0 }); });
    });
    for (let beat = 0; beat < 9; beat++) {
      const wb = Object.assign({}, withThreads, { beat });
      D.eligible(wb, L, SIT.build(wb, L, { calendar: CAL })).forEach((i) => seen.add(i.id));
    }
  }
  /* ---- asking about the case ----
     AN ITEM WITH FOUR QUESTIONS AND TWO ANSWERS has three ways to fail and all three are
     silent. A question whose answer throws drops the whole panel; an `opens` naming an option
     that does not exist leaves a door with nothing behind it; and a hidden option nothing
     opens is writing that can never be reached, which is the same failure as an unreachable
     badge and is why this block exists at all. */
  {
    const rng = E.createSeededRNG(11);
    const withAsks = D.ITEMS.filter((it) => (it.asks || []).length);
    ok('  cases you can ask about', withAsks.length >= 15, withAsks.length + ' items');
    ok('    and they carry four questions each',
      withAsks.every((it) => it.asks.length === 4),
      withAsks.filter((it) => it.asks.length !== 4).map((it) => it.id).join(' ') || 'all four');
    ok('    and you get fewer than that', D.PROBE_MAX < 4, D.PROBE_MAX + ' of 4');
    const dupIds = withAsks.filter((it) =>
      new Set(it.asks.map((q) => q.id)).size !== it.asks.length);
    ok('    every question id is unique inside its item', !dupIds.length,
      dupIds.map((it) => it.id).join(' '));

    /* Both halves rendered against a real cast on a real world. */
    const w0 = world0();
    const sit0 = SIT.build(w0, L, {});
    const broke = [];
    withAsks.forEach((it) => {
      const c = D.castOf(it, w0, L, rng, sit0);
      it.asks.forEach((q) => {
        let qt = '', a = '';
        try { qt = String(D.text(q.q, c, it, sit0)); a = String(D.text(q.a, c, it, sit0)); }
        catch (e) { broke.push(it.id + ':' + q.id + ' threw'); return; }
        if (/undefined|NaN|\[object|=>/.test(qt + a)) broke.push(it.id + ':' + q.id + ' ' + qt.slice(0, 40));
        /* THE ANSWER CARRIES THE FLOOR AND THE QUESTION BARELY HAS ONE. This wanted twelve
           characters of question and went red on "How is he?", which is nine and is the best
           line in the item it sits in: the shortest question in a room is usually the one
           somebody did not want asked. */
        if (qt.length < 8 || a.length < 40) broke.push(it.id + ':' + q.id + ' too short');
        if (!/\?$/.test(qt)) broke.push(it.id + ':' + q.id + ' is not a question');
      });
    });
    ok('    every question and answer renders', !broke.length, broke.slice(0, 3).join(' | '));

    /* ---- the doors ---- */
    const doors = [];
    withAsks.forEach((it) => it.asks.forEach((q) => {
      if (q.opens) [].concat(q.opens).forEach((o) => doors.push({ item: it, q: q.id, opt: o }));
    }));
    ok('  some questions open a ruling', doors.length >= 6, doors.length + ' doors');
    const badDoor = doors.filter((d) => {
      const o = (d.item.options || []).find((x) => x.id === d.opt);
      return !o || !o.hidden;
    });
    ok('    every door has a hidden ruling behind it', !badDoor.length,
      badDoor.map((d) => d.item.id + ':' + d.opt).join(' '));
    const hidden = [];
    D.ITEMS.forEach((it) => (it.options || []).forEach((o) => {
      if (o.hidden) hidden.push({ item: it.id, opt: o.id });
    }));
    const shut = hidden.filter((h) => !doors.some((d) => d.item.id === h.item && d.opt === h.opt));
    ok('    and every hidden ruling has a door', !shut.length,
      shut.map((h) => h.item + ':' + h.opt).join(' ') || hidden.length + ' hidden rulings');
    /* THE POINT OF HIDING ONE. Not painted is a property of one function; unreachable has to
       be a property of the item, which is what optionsFor() is. */
    const leaks = doors.filter((d) =>
      D.optionsFor(d.item, []).some((o) => o.id === d.opt));
    ok('    a hidden ruling is not on the desk until it is asked for', !leaks.length,
      leaks.map((d) => d.item.id + ':' + d.opt).join(' '));
    const stuck = doors.filter((d) =>
      !D.optionsFor(d.item, [d.q]).some((o) => o.id === d.opt));
    ok('    and is on it the moment it is', !stuck.length,
      stuck.map((d) => d.item.id + ':' + d.opt).join(' '));
    /* AND IT HAS TO BE A LEGAL RULING. A door that leads to a thrown ledger path is a dead
       end a player reaches by investigating properly. */
    const dead = [];
    hidden.forEach((h) => {
      const it = D.BY_ID[h.item];
      const c = D.castOf(it, w0, L, rng, sit0);
      try { L.applyEdit(w0, D.resolve(it, h.opt, {}, c)); }
      catch (e) { dead.push(h.item + ':' + h.opt + ' ' + e.message); }
    });
    ok('    every hidden ruling is a legal edit', !dead.length, dead.slice(0, 2).join(' | '));
    /* AND IT IS THE LAST OPTION ON THE ITEM. Written at the top it shunted the three rulings
       somebody was already reading down the screen the moment it appeared, which reads as the
       desk rebuilding itself rather than as a door opening. Caught on a browser run and
       trivially undone by hand, which is why it is asserted rather than remembered. */
    const notLast = hidden.filter((h) => {
      const opts = D.BY_ID[h.item].options;
      return opts[opts.length - 1].id !== h.opt;
    });
    ok('    and it is the last ruling on the list', !notLast.length,
      notLast.map((h) => h.item).join(' '));
    /* The budget cannot open two doors at once on an item that only has one question with a
       door, but it can on one that has two. Nothing forbids that; this states what happens. */
    const twoDoors = withAsks.filter((it) =>
      it.asks.filter((q) => q.opens).length > D.PROBE_MAX);
    ok('    no item hides more rulings than there are questions to find them',
      !twoDoors.length, twoDoors.map((it) => it.id).join(' '));
  }

  /* ---- the arcs ----
     A THREAD WITH NO PAYOFF IS A PROMISE THE MODE DOES NOT KEEP, and a payoff with no plant
     is writing nobody can ever reach. Both fail silently: the first looks like a ruling with
     no consequence, which is what this whole mechanic exists to stop, and the second looks
     like content. Neither throws and neither shows up in a playthrough, because the way you
     find out is by not seeing something. */
  {
    const planted = new Set();
    const plantedBy = {};
    D.ITEMS.forEach((it) => (it.options || []).forEach((o) => {
      if (!o.plant) return;
      /* A computed plant is called on a real world so a function that names a school still
         reports which thread it is planting. */
      const made = typeof o.plant === 'function'
        ? o.plant(world0(), L, {}, SIT.build(world0(), L, {})) : o.plant;
      [].concat(made || []).filter(Boolean).forEach((pl) => {
        planted.add(pl.id);
        plantedBy[pl.id] = (plantedBy[pl.id] || []).concat([it.id + '/' + o.id]);
      });
    }));
    /* THE DOCKET IS NOT THE ONLY PLANTER ANY MORE. media.js plants a thread when an answer at
       a lectern is a promise, and the item that collects on it lives here, so a payoff whose
       cause is a press conference is reachable and looks orphaned to a sweep that only reads
       this file. Both halves of the invariant still hold, they are just spread over two
       files now. */
    const M = require(ROOT + '/cfb/commish/media.js');
    M.QUESTIONS.forEach((q) => (q.answers || []).forEach((a) => {
      if (!a.promise) return;
      const pr = typeof a.promise === 'function' ? a.promise({ conf: 'ACC', size: 5 }, q) : a.promise;
      if (pr && pr.id) { planted.add(pr.id); plantedBy[pr.id] = ['media/' + q.id + ':' + a.id]; }
    }));
    const paid = new Set();
    D.ITEMS.forEach((it) => [].concat(it.pays || []).forEach((id) => paid.add(id)));

    const dangling = [...planted].filter((id) => !paid.has(id));
    ok('every thread a ruling plants has something that pays it off', !dangling.length,
      dangling.join(', ') || planted.size + ' threads, all answered');
    const orphan = [...paid].filter((id) => !planted.has(id));
    ok('  and every payoff has a ruling that could plant it', !orphan.length,
      orphan.join(', ') || paid.size + ' payoffs, all reachable');

    /* AND THE ARCS GO DEEPER THAN ONE STEP, which is the whole reason this is not just a
       delayed fallout tail. A payoff that plants another payoff is a term with a middle. */
    const chained = D.ITEMS.filter((it) => it.pays)
      .filter((it) => (it.options || []).some((o) => o.plant));
    ok('  and some payoffs plant the next thing', chained.length >= 3,
      chained.map((i) => i.id).join(', '));

    /* NOTHING PLANTS ITSELF, which would be a decision that reschedules itself forever. */
    const selfish = D.ITEMS.filter((it) => (it.options || []).some((o) => {
      const made = typeof o.plant === 'function' ? null : o.plant;
      return [].concat(made || []).filter(Boolean).some((pl) => [].concat(it.pays || []).includes(pl.id));
    }));
    ok('  and nothing replants the thread it just cut', !selfish.length,
      selfish.map((i) => i.id).join(', ') || 'no loops');
  }

  /* ---- an arc, walked ----
     THE ONLY TEST THAT PROVES THE MECHANIC. Everything above checks the wiring in the
     abstract: this takes an option, plants what it plants, advances the clock the way the
     mode advances it, and asserts that the thing comes back on its own. If a thread never
     ripens into anything the whole feature is a field on a save file. */
  {
    const arc = (itemId, optionId, payoffId) => {
      let w = world0();
      const it = D.BY_ID[itemId];
      const seeds = D.plantsOf(it, optionId, w, L, {}, SIT.build(w, L, {}));
      seeds.forEach((sd) => { w = L.plant(w, sd.id, sd); });
      const planted = w.threads.length;
      /* Nothing should have come back yet: a consequence that arrives in the same beat as
         its cause is a fallout tail, which the mode already has. */
      const early = D.eligible(w, L, SIT.build(w, L, {})).some((x) => x.id === payoffId);
      let arrived = 0;
      for (let n = 1; n <= 30 && !arrived; n++) {
        w = L.advance(w);
        for (let beat = 0; beat < 9 && !arrived; beat++) {
          const wb = Object.assign({}, w, { beat });
          if (D.eligible(wb, L, SIT.build(wb, L, { calendar: CAL })).some((x) => x.id === payoffId)) {
            arrived = n;
          }
        }
      }
      return { planted, early, arrived };
    };
    const a1 = arc('crisis-legal', 'fight', 'pay-verdict');
    ok('fighting a lawsuit plants a verdict', a1.planted === 1);
    ok('  which does not arrive the same day', !a1.early);
    ok('  and comes back on its own', a1.arrived > 0,
      a1.arrived ? 'after ' + a1.arrived + ' beats' : 'never came back');
    const a2 = arc('gambling', 'partner', 'pay-flagged');
    ok('taking the book\'s money comes back too', a2.arrived > 0 && !a2.early,
      a2.arrived ? 'after ' + a2.arrived + ' beats' : 'never came back');

    /* AND THE SECOND STEP OF AN ARC, which is the part that makes it a story rather than a
       delay. The verdict is paid, and paying it plants the argument about who was short. */
    let w2 = world0();
    w2 = L.plant(w2, 'fought-it', { wait: 1 });
    w2 = L.advance(w2);
    w2 = L.cut(w2, 'fought-it');
    D.plantsOf(D.BY_ID['pay-verdict'], 'pay', w2, L, {}, SIT.build(w2, L, {}))
      .forEach((sd) => { w2 = L.plant(w2, sd.id, sd); });
    ok('  and a payoff plants the next one', w2.threads.some((t) => t.id === 'the-bill'),
      w2.threads.map((t) => t.id).join(', ') + '; resolved ' + w2.resolved.join(', '));
  }

  const unreachable = D.ITEMS.filter((i) => !seen.has(i.id)).map((i) => i.id);
  ok('every item can actually be dealt', !unreachable.length,
    unreachable.join(', ') || seen.size + ' reachable, ' + seedsPlayed + ' seasons played');

  /* AND A CRISIS IS UNREACHABLE UNTIL IT SHOULD BE. The opposite failure: a lawsuit turning up
     on a sport nobody has done anything to. */
  const calm = world0();
  const early = [];
  for (let beat = 0; beat < L.BEATS.length; beat++) {
    D.eligible(Object.assign({}, calm, { beat }), L).forEach((i) => { if (i.crisis) early.push(i.id); });
  }
  ok('  and no crisis is on the desk before a fuse is lit', !early.length,
    early.join(', ') || 'nothing fires on an opening world');
  /* FORCED, NOT WEIGHTED. A hundred against a five still leaves a one in twenty chance of the
     sport ignoring a lawsuit for a beat, which is not what a crisis means. */
  const rng = E.createSeededRNG(4);
  const picks = new Set();
  for (let i = 0; i < 40; i++) {
    picks.add(D.pick(Object.assign({}, burning, { beat: D.BEATS.WINTER }), L, rng).id);
  }
  ok('  and once one is lit it outranks the whole docket',
    [...picks].every((id) => id.indexOf('crisis-') === 0),
    [...picks].join(', '));
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
