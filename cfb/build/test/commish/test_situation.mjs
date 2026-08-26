/* WHAT IS GOING ON RIGHT NOW, AND WHAT HAPPENED NEXT.
 *
 *   node cfb/build/test/commish/test_situation.mjs
 *
 * Two modules, one test, because they fail the same way. Both of them are read by hand-written
 * data: a docket item asks the situation whether anybody is unbeaten, a fallout entry asks it
 * whether the room still likes you. When one of those questions has no answer the reader does
 * not crash, it goes quiet: `eligible` swallows the throw and returns false, `roll` swallows it
 * and drops the entry from the pool. An item that can never be dealt and a tail that can never
 * fire both look exactly like an item and a tail nobody happened to get.
 *
 * So the assertions here are mostly about reachability and about the null cases. February has
 * no football in it and year one has no history: an item reading `sit.unbeaten.length` in the
 * winter meetings has to get zero rather than an exception, and one reading `sit.trend` in the
 * first September has to get null rather than a fabricated number.
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
const F = require(ROOT + '/cfb/commish/fallout.js');
const E = require(ROOT + '/cfb/engine.js');
const teams = leagueTeams(ROOT);

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };
const world = (over) => {
  const w = L.createWorld({ year: 2025, membership: L.membershipFrom(teams, 2025), seed: 9 });
  if (over) Object.assign(w, over);
  return w;
};
const playTo = (w, beat, seed) => {
  const seg = S.segmentFor(beat);
  if (!seg) return null;
  return S.play(Object.assign({}, w, { beat }), teams, E.createSeededRNG(seed),
    { through: seg.through, titles: !!seg.titles, bracket: !!seg.bracket });
};

console.log('\n=== the situation says what is going on ===');
{
  const w = world({ beat: 6 });
  const sim = playTo(w, 6, 41);
  const s = SIT.build(w, L, { sim, calendar: CAL });
  ok('November knows what week it is', s.week === S.WEEKS, 'week ' + s.week);
  ok('  and the records match the games in the season',
    (function () {
      const c = {};
      sim.games.forEach((g) => { c[g.a.school] = (c[g.a.school] || 0) + 1; c[g.b.school] = (c[g.b.school] || 0) + 1; });
      return sim.teams.every((t) => (c[t.school] || 0) === t.wins + t.losses);
    })(), sim.teams.length + ' teams');
  ok('  it knows who is unbeaten', s.unbeatenCount > 0,
    s.unbeaten.slice(0, 3).map((t) => t.school + ' ' + t.wins + '-0').join(', '));
  ok('  and every one of them really is', s.unbeaten.every((t) => {
    const r = sim.teams.find((x) => x.school === t.school);
    return r && r.losses === 0;
  }));
  /* THE UPSET IS BY HOW FAR THE LOSER WAS AHEAD ON PAPER, not by margin: a good team beating
     a bad one by forty is a Saturday. */
  ok('  it finds an upset and the upset is one', !!s.upset && s.upset.gap > 0,
    s.upset ? s.upset.winner + ' over ' + s.upset.loser + ', gap ' + s.upset.gap : 'none');
  ok('  and the biggest game is the biggest game',
    !!s.biggest && Math.abs(s.biggest.viewers
      - Math.max(...sim.games.map((g) => g.viewers))) < 0.1,
    s.biggest ? s.biggest.viewers + 'M' : 'none');
  ok('  every conference in the sport is accounted for',
    Object.keys(s.confs).length >= 4 && Object.keys(s.confs).every((c) => s.confs[c].size > 0),
    Object.keys(s.confs).map((c) => c + ':' + s.confs[c].size).join(' '));
  ok('  and a conference too small to be one is called gone', s.gone.length > 0, s.gone.join(', '));
}

console.log('\n=== the null cases are real answers ===');
{
  /* FEBRUARY HAS NO FOOTBALL IN IT. An item reading the unbeaten list in the winter meetings
     has to get an empty list rather than an exception, or `eligible` swallows the throw and
     the item silently stops existing. */
  const w = world({ beat: 0 });
  const s = SIT.build(w, L, { calendar: CAL });
  ok('the winter meetings have no week', s.week === null && s.played === false);
  ok('  an empty unbeaten list rather than a missing one',
    Array.isArray(s.unbeaten) && s.unbeatenCount === 0);
  ok('  no upset, no leader, no audience', !s.upset && !s.leader && s.perGame === null);
  /* YEAR ONE HAS NOTHING TO COMPARE ITSELF TO, and inventing a trend would be inventing a
     fact about a sport that has played four games. */
  const y1 = SIT.build(world({ beat: 5 }), L, { sim: playTo(world(), 5, 3), calendar: CAL });
  ok('  and year one has no trend, rather than a trend of zero', y1.trend === null,
    String(y1.trend));
  ok('a blank situation builds at all', !!SIT.empty());
  /* EVERY FIELD THE DOCKET IS ALLOWED TO READ has to exist on the empty shape, or an item
     gating on it vanishes on the beats with no season behind them. */
  const missing = Object.keys(D.NOSIT).filter((k) => !(k in s));
  ok('  and carries every field the docket may read', !missing.length,
    missing.join(', ') || Object.keys(D.NOSIT).length + ' fields');
}

console.log('\n=== a gated item is an item somebody can be dealt ===');
{
  /* THE FAILURE THIS CATCHES IS SILENT. An item whose `when` throws is dropped by `eligible`
     with no message, so a gate that reads a field the situation does not have produces an
     argument the sport never has. */
  let threw = 0;
  const shapes = [SIT.empty(), SIT.build(world({ beat: 0 }), L, { calendar: CAL })];
  for (let beat = 4; beat <= 8; beat++) {
    shapes.push(SIT.build(world({ beat }), L, { sim: playTo(world(), beat, 60 + beat), calendar: CAL }));
  }
  D.ITEMS.forEach((it) => {
    shapes.forEach((sh) => {
      try { it.when(world({ beat: it.beats[0] }), L, sh); } catch (e) { threw++; }
    });
  });
  ok('no gate throws on any shape the situation takes', threw === 0, threw + ' throws');

  /* AND NO CAST THROWS EITHER, which is the same failure one screen later: castOf is called
     after the item is already chosen, so a cast that throws takes the desk down. */
  let castThrew = 0;
  const rng = E.createSeededRNG(7);
  D.ITEMS.forEach((it) => {
    shapes.forEach((sh) => {
      try { D.castOf(it, world({ beat: it.beats[0] }), L, rng, sh); } catch (e) { castThrew++; }
    });
  });
  ok('  and no cast does either', castThrew === 0, castThrew + ' throws');

  /* THE PROSE TOO. A brief is a function of the cast and the situation on half the docket
     now, and one that throws is a blank desk. */
  let proseThrew = 0, blank = [];
  D.ITEMS.forEach((it) => {
    shapes.forEach((sh) => {
      const w2 = world({ beat: it.beats[0] });
      try {
        const c = D.castOf(it, w2, L, rng, sh);
        const t = D.text(it.title, c, it, sh);
        const b = D.text(it.brief, c, it, sh);
        if (!t || !b) blank.push(it.id);
        if (/undefined|null|NaN/.test(String(t) + String(b))) blank.push(it.id + ' (undefined)');
      } catch (e) { proseThrew++; }
    });
  });
  ok('  and every title and brief renders on every one of them', proseThrew === 0,
    proseThrew + ' throws');
  ok('  with nothing printing undefined at a reader', !blank.length,
    [...new Set(blank)].slice(0, 4).join(', ') || D.ITEMS.length + ' items on ' + shapes.length + ' shapes');
}

console.log('\n=== what happened next ===');
{
  const w = world({ beat: 5 });
  const sim = playTo(w, 5, 12);
  const s = SIT.build(w, L, { sim, calendar: CAL });
  const item = D.BY_ID['officiating'];
  const edit = D.resolve(item, item.options[0].id, {}, null);

  /* DETERMINISTIC, because a consequence that reshuffles on reload is not a consequence.
     ON A SEED THAT ACTUALLY FIRES, or the assertion compares null to null and passes without
     having checked anything, which is the first version of this and is worse than no test. */
  let seed = null, first = null;
  for (let i = 1; i < 60 && !first; i++) {
    const t = F.roll(w, { itemId: item.id, optionId: item.options[0].id, sit: s, edit },
      E.createSeededRNG(i));
    if (t) { seed = i; first = t; }
  }
  ok('a ruling can grow a tail at all', !!first, first ? first.id + ' on seed ' + seed : 'none in 60 seeds');
  const again = first ? F.roll(w, { itemId: item.id, optionId: item.options[0].id, sit: s, edit },
    E.createSeededRNG(seed)) : null;
  ok('  and the same ruling on the same seed grows the same one',
    !!first && !!again && first.id === again.id && first.body === again.body,
    first ? first.id : 'nothing to compare');

  /* IT HAS TO COST OR PAY SOMETHING, or it is a joke pinned to the screen. */
  const inert = F.TAILS.filter((t) => !Object.keys(t.effects || {}).length
    && !Object.keys(t.aimed || {}).length);
  ok('  every tail moves the ledger', !inert.length, inert.map((t) => t.id).join(', ')
    || F.TAILS.length + ' tails');
  const axes = new Set(L.AXES), blocs = new Set(B.BLOCS.map((x) => x.id));
  const wrong = [];
  F.TAILS.forEach((t) => {
    Object.keys(t.effects || {}).forEach((x) => { if (!axes.has(x)) wrong.push(t.id + ':' + x); });
    Object.keys(t.aimed || {}).forEach((bl) => {
      if (!blocs.has(bl)) wrong.push(t.id + ':' + bl);
      Object.keys(t.aimed[bl]).forEach((x) => { if (!axes.has(x)) wrong.push(t.id + ':' + bl + '.' + x); });
    });
  });
  ok('  and moves a real axis on a real bloc', !wrong.length, wrong.join(', ') || 'all of them');

  /* MERGED, NOT APPLIED SEPARATELY. Two edits for one press of a button would deal the room
     two answers and print two sets of numbers. */
  const tail = { id: 't', head: 'h', body: 'b', effects: { money: 1 }, aimed: { SEC: { money: 2 } } };
  const base = { id: 'x', label: 'l', set: { 'playoff.teams': 16 }, move: {},
    effects: { money: 2, access: 1 }, aimed: { SEC: { money: 1 } } };
  const m = F.merge(base, tail);
  ok('  a tail folds into the ruling rather than following it',
    m.effects.money === 3 && m.effects.access === 1 && m.aimed.SEC.money === 3
    && m.set['playoff.teams'] === 16,
    'money ' + m.effects.money + ', SEC ' + m.aimed.SEC.money);
  ok('  and does not mutate the ruling it was folded into',
    base.effects.money === 2 && base.aimed.SEC.money === 1);
  ok('  the merged edit is still one applyEdit takes',
    typeof L.applyEdit(world(), m) === 'object');

  /* EVERY BODY RENDERS, on an item with a cast and on one without, because half of them name
     a school and the fallback is where "a member school" came from. */
  let tailThrew = 0, tailBlank = [];
  F.TAILS.forEach((t) => {
    [{ cast: { school: 'Ohio State', conf: 'Big Ten' }, sit: s, edit, anySchool: 'Utah' },
      { sit: SIT.empty(), edit, anySchool: 'Utah' },
      { sit: s, edit }].forEach((ctx) => {
      try {
        const body = t.body(ctx);
        if (!body || /undefined|null|NaN/.test(body)) tailBlank.push(t.id);
      } catch (e) { tailThrew++; }
    });
  });
  ok('  every tail writes a sentence whatever it is handed', tailThrew === 0, tailThrew + ' throws');
  ok('  with nothing printing undefined at a reader', !tailBlank.length,
    [...new Set(tailBlank)].join(', ') || F.TAILS.length + ' tails');
}

console.log('\n=== both ends of the range reach the whole thing ===');
{
  /* THE WHOLE POINT OF GATING is that a careful commissioner and a reckless one get different
     sports. That only works if BOTH of them can reach everything meant for them, and the way
     it breaks is a gate nobody ever satisfies, which is invisible from inside one playthrough.
     So this plays both and asserts the union. */
  function playTerm(seed, mode) {
    let w = L.createWorld({ year: 2025, membership: L.membershipFrom(teams, 2025), seed: 'q' + seed });
    const rng = E.createSeededRNG(E.hashSeed('q|' + mode + '|' + seed));
    w.ratings = {}; w.champs = {}; w.tails = [];
    const items = new Set(), tails = new Set();
    for (let y = 0; y < 5; y++) {
      for (let b = 0; b < 9; b++) {
        const seg = S.segmentFor(w.beat);
        let sim = null;
        if (seg) {
          try {
            sim = S.play(w, teams, E.createSeededRNG(E.hashSeed('r|' + seed + '|' + w.year)),
              { through: seg.through, titles: !!seg.titles, bracket: !!seg.bracket });
          } catch (e) { sim = null; }
        }
        const sit = SIT.build(w, L, { sim, calendar: CAL });
        const item = D.pick(w, L, rng, sit);
        if (item) {
          items.add(item.id);
          let pickOpt = item.options[0], score = mode === 'careful' ? -1e9 : 1e9;
          for (const o of item.options) {
            try {
              const e2 = D.resolve(item, o.id, {}, D.castOf(item, w, L, rng, sit));
              const after = L.applyOutcome(L.applyEdit(w, e2), e2, B.deltas(w, e2));
              const sc = after.meters.standing;
              if (mode === 'careful' ? sc > score : sc < score) { score = sc; pickOpt = o; }
            } catch (e) { /* an option that will not resolve is not a candidate */ }
          }
          try {
            let e3 = D.resolve(item, pickOpt.id, {}, D.castOf(item, w, L, rng, sit));
            const t = F.roll(w, { itemId: item.id, optionId: pickOpt.id, sit, edit: e3 }, rng);
            if (t) { tails.add(t.id); w.tails = w.tails.concat([t.id]).slice(-24); e3 = F.merge(e3, t); }
            w = L.applyOutcome(L.applyEdit(w, e3), e3, B.deltas(w, e3));
          } catch (e) { /* nothing to apply */ }
        }
        if (b === 8) {
          try {
            const full = S.play(w, teams, E.createSeededRNG(E.hashSeed('r|' + seed + '|' + w.year)),
              { through: S.WEEKS, titles: true, bracket: true });
            w.ratings[w.year] = { total: Math.round(full.viewers), perGame: full.perGame, title: 20 };
            const ch = full.bracket && full.bracket.champion;
            if (ch) w.champs[w.year] = { school: ch.team.school, color: ch.team.color };
          } catch (e) { /* no season to record */ }
        }
        w = L.advance(w);
      }
    }
    return { items, tails };
  }
  const items = new Set(), tails = new Set();
  for (let s = 0; s < 8; s++) {
    for (const mode of ['careful', 'reckless']) {
      const r = playTerm(s, mode);
      r.items.forEach((x) => items.add(x));
      r.tails.forEach((x) => tails.add(x));
    }
  }
  /* THE CRISES ARE THE EXCEPTION AND THEY ARE CHECKED IN test_docket, on a world with the
     fuses already lit, which is the only state they are meant to be reachable from. */
  /* THE SAME TREATMENT THE TAILS GET BELOW, and for the same reason. Sixteen played terms is
     a sample, not a proof: as the docket grows each item is a smaller share of it, and an item
     gated on a state a term has to reach BEFORE it can come up (the leagues having diverged,
     a title game already placed somewhere, an audience that has fallen) can miss the sample
     without being unreachable. Asserting it from play alone makes this fail on a shuffle.

     So the ones the terms missed are checked against the worlds they are written for. That an
     item is reachable AT ALL is test_docket's job; what this adds is how much of the docket a
     player actually meets, which is the number worth watching as it grows. */
  const reached = items.size;
  const gatedStates = [];
  {
    const mk = (f) => {
      const x = L.createWorld({ year: 2027, membership: L.membershipFrom(teams, 2025), seed: 'gs' });
      x.startYear = 2025;
      f(x);
      return x;
    };
    gatedStates.push(
      mk((x) => { x.labour.reentry = 'closed'; }),
      mk((x) => {
        x.labour.rulesBy = 'conference';
        x.labour.confReentry = { SEC: 'open', 'Big Ten': 'closed', ACC: '', 'Big 12': '' };
      }),
      mk((x) => { x.venues.title = 'nola'; x.brand.playoff = 'crypto'; }),
      mk((x) => { x.money.dealYears = 1; }),
      mk((x) => { x.ratings = { 2025: { total: 900, perGame: 1.9, title: 21 },
        2026: { total: 890, perGame: 1.88, title: 21 } };
        x.playoff.teams = 4; x.rules.confGames = 6; }),
      /* A SPORT THAT IS STILL LIVING WITH SOMETHING IT DID. Twelve items exist only once a
         thread this office planted has ripened, so no walk of beats can reach one: the world
         has to carry the consequence. Every thread ripe at once is not a world a player
         reaches, and it is the right world to ask "is this item writable" in. Whether the
         thread can be planted at all is asserted properly in test_docket. */
      mk((x) => {
        D.ITEMS.forEach((it) => {
          [].concat(it.pays || []).forEach((id) => { x.threads.push({ id, ripe: 0 }); });
        });
      })
    );
  }
  const stillMissingItems = [];
  D.ITEMS.filter((i) => !i.crisis && !items.has(i.id)).forEach((it) => {
    let can = false;
    gatedStates.forEach((x) => {
      for (let beat = 0; beat < 9; beat++) {
        const wb = Object.assign({}, x, { beat });
        let sim = null;
        const seg = S.segmentFor(beat);
        if (seg) {
          try {
            sim = S.play(wb, teams, E.createSeededRNG(77),
              { through: seg.through, titles: !!seg.titles, bracket: !!seg.bracket });
          } catch (e) { sim = null; }
        }
        if (D.eligible(wb, L, SIT.build(wb, L, { sim, calendar: CAL })).some((i) => i.id === it.id)) {
          can = true;
        }
      }
    });
    if (!can) stillMissingItems.push(it.id);
  });
  ok('every item turns up in a term or in a world the game can reach', !stillMissingItems.length,
    stillMissingItems.join(', ') || reached + ' of ' + D.ITEMS.length + ' met in sixteen terms');
  /* AND MOST OF THE DOCKET IS MET IN PLAY, which is the number that says whether writing more
     of it is still reaching anybody.

     MEASURED OVER THE ORDINARY DOCKET ONLY, and the split is the point rather than a way of
     making the number look better. A payoff item is written to be UNREACHABLE unless the
     player took one specific option one or two years earlier: that is what a consequence is.
     Counting the two kinds together made the headline number fall from ninety-five per cent
     to eighty-two the moment the arcs were added, which reads as coverage getting worse when
     what actually happened is that the docket grew a second kind of item.

     So the ordinary items keep the old bar, and the payoffs are reported beside it as what
     they are: how much of the consequence writing a term full of blind first-option rulings
     happens to trip. That second number being LOW is correct. It being zero would mean the
     arcs are unreachable in play, which is the thing worth catching. */
  const ordinary = D.ITEMS.filter((i) => !i.pays);
  const payoffs = D.ITEMS.filter((i) => i.pays);
  const gotOrdinary = ordinary.filter((i) => items.has(i.id)).length;
  const gotPayoff = payoffs.filter((i) => items.has(i.id)).length;
  ok('  and most of the ordinary docket is met in play',
    gotOrdinary >= ordinary.length * 0.85,
    gotOrdinary + ' of ' + ordinary.length + ' ('
    + Math.round(gotOrdinary / ordinary.length * 100) + '%)');
  console.log('  note: ' + gotPayoff + ' of ' + payoffs.length + ' payoff items were tripped by '
    + 'sixteen terms of blind play, which is a consequence being rare rather than missing.');
  /* THE TAILS NEED THE SAME TREATMENT THE CRISES GET. A tail gated on the leagues having
     stopped agreeing about eligibility can only fire in a term where somebody devolved the
     rule AND a conference wrote its own AND another ruling happened afterwards, which sixteen
     played terms may simply not produce. That is not the same as unreachable, and asserting
     it from play alone would make this test fail on a shuffle rather than on a fault.

     So the ones the terms missed are checked against the world they are written for, built
     out of states the game can actually reach: a sport that shut its door, one where the
     leagues diverged, one where the room has turned, one where the fuses are burning. If a
     tail cannot fire in any of those either, it is dead. */
  const states = [];
  {
    const base = () => {
      const x = L.createWorld({ year: 2027, membership: L.membershipFrom(teams, 2025), seed: 'st' });
      x.startYear = 2025; x.tails = [];
      return x;
    };
    const shut = base(); shut.labour.reentry = 'closed';
    const split = base();
    split.labour.rulesBy = 'conference';
    split.labour.confReentry = { SEC: 'open', 'Big Ten': 'closed', ACC: '', 'Big 12': '' };
    const burning = base(); burning.pressure = { legal: 40, congress: 40, union: 40 };
    const loved = base(); loved.meters.standing = 80;
    const hated = base(); hated.meters.standing = 25;
    states.push(base(), shut, split, burning, loved, hated);
  }
  const sits = states.map((x) => SIT.build(x, L, { calendar: CAL }));
  const edits = [
    { effects: { money: 2, autonomy: -3, labour: 2, exposure: -2, inventory: 2, access: 2 } },
    { effects: { money: -2, autonomy: 3, labour: -2, exposure: 2, inventory: -2, tradition: -2 } },
  ];
  const stillMissing = [];
  F.TAILS.filter((t) => !tails.has(t.id)).forEach((t) => {
    let fires = false;
    states.forEach((x, i) => {
      edits.forEach((e) => {
        try { if (t.when(x, sits[i], { edit: e, sit: sits[i] })) fires = true; } catch (err) { /* no */ }
      });
    });
    if (!fires) stillMissing.push(t.id);
  });
  ok('  and every tail fires in a term or in a world the game can reach', !stillMissing.length,
    stillMissing.join(', ') || tails.size + ' in play, the rest gated on a state that exists');
}

console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
