/*
 * test_doctrine.mjs - what a commissioner turned out to believe.
 *
 * report.js grades a term and this one classifies it, and the two fail in opposite ways. A
 * wrong grade is an argument. A wrong doctrine is the game telling somebody they believe
 * something they do not, on a card built to be screenshotted, which is a worse thing to be
 * wrong about.
 *
 * The failure modes worth guarding:
 *
 *   A SIGN FLIP        `throne` is the negative of the autonomy axis, because a ruling that
 *                      GIVES autonomy is the office keeping less. Get that backwards and
 *                      every federalist is told they were a centraliser, and nothing about
 *                      the output looks wrong.
 *
 *   A LABEL NOBODY     an archetype no play can reach is a name that never appears, and the
 *   CAN REACH          only symptom is a card that is always one of six things.
 *
 *   CONFIDENT NOISE    a term of two rulings must not be handed a doctrine, and a term that
 *                      genuinely wandered must be told it wandered rather than rounded up to
 *                      the nearest opinion.
 *
 *   THE SPORT'S OWN    the season writes edits through the same door a commissioner does. If
 *   DRIFT             those are counted, the game reads its own drift back as your beliefs.
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { leagueTeams } from './league.mjs';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..', '..', '..');
const P = (f) => require(path.join(ROOT, 'cfb', 'commish', f));
const DOC = P('doctrine.js'), L = P('ledger.js'), D = P('docket.js'), B = P('blocs.js'),
  S = P('season.js'), SIT = P('situation.js'), CAL = P('calendar.js'), F = P('fallout.js');
const E = require(path.join(ROOT, 'cfb', 'engine.js'));

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };
const head = (s) => console.log('\n=== ' + s + ' ===');

/* A world with nothing in it but the rulings named, which is all profile() reads. */
const termOf = (...effects) => ({
  history: effects.map((e, i) => ({ year: 2025, beat: i % 9, id: 'x' + i, label: 'A ruling', effects: e })),
  labour: {}, playoff: {}, posture: {},
});
/* n copies of one effect vector, for "a commissioner who kept voting the same way". */
const repeat = (e, n) => termOf(...Array.from({ length: n }, () => e));

head('nothing to read is not a doctrine');
{
  ok('a term with no rulings has none', DOC.profile({ history: [] }) === null);
  ok('  and neither does a missing world', DOC.profile(null) === null);
  /* RULINGS WITH NO EFFECT ON ANY OF THE FOUR are not a doctrine either. A term of pure
     money-and-cost decisions has taken no side of any argument this card is about. */
  ok('  nor a term of rulings that touched none of the four spectra',
    DOC.profile(repeat({ money: 3, cost: -2 }, 20)) === null);
}

head('the sport drifting is not you believing something');
{
  /* The engine writes the season's own edit through applyEdit, so it lands on history
     exactly like a ruling. Counting those would read the sport's drift back as your values,
     and a player who ruled twice in five years would come out with strong opinions. */
  const w = {
    history: [
      { id: 'season:2025', label: 'The season', effects: { labour: 40, autonomy: 40 } },
      { id: 'season:2026', label: 'The season', effects: { labour: 40, autonomy: 40 } },
      { id: 'real-one', label: 'A ruling', effects: { access: -12 } },
    ],
    labour: {}, playoff: {}, posture: {},
  };
  ok('a season is not counted', DOC.rulingsOf(w).length === 1, DOC.rulingsOf(w).length + ' of 3');
  const p = DOC.profile(w);
  ok('  so the eighty points of labour it wrote do not show up', p.axes.purse === 0,
    'purse ' + p.axes.purse);
  ok('  and the one real ruling is what names the term', p.axes.gate < 0, 'gate ' + p.axes.gate);
}

head('which way is which');
{
  /* THE SIGN FLIP. A ruling with a POSITIVE autonomy effect hands power to the conferences,
     so it has to read as the office keeping LESS. Backwards, and every federalist in the
     game is told they centralised, with nothing about the card looking wrong. */
  const gaveAway = DOC.profile(repeat({ autonomy: 4 }, 12));
  ok('giving the conferences autonomy reads as devolving', gaveAway.axes.throne < 0,
    'throne ' + gaveAway.axes.throne);
  ok('  and is named for it', gaveAway.name === 'The Federalist', gaveAway.name);
  const tookBack = DOC.profile(repeat({ autonomy: -4 }, 12));
  ok('taking it back reads as centralising', tookBack.axes.throne > 0, 'throne ' + tookBack.axes.throne);
  ok('  and is named for that', tookBack.name === 'The Sovereign', tookBack.name);

  ok('money toward the players is a reformer',
    DOC.profile(repeat({ labour: 6 }, 12)).name === 'The Reformer');
  ok('money away from them is a landlord',
    DOC.profile(repeat({ labour: -6 }, 12)).name === 'The Landlord');
  ok('opening the doors is a populist',
    DOC.profile(repeat({ access: 4 }, 12)).name === 'The Populist');
  ok('closing them is a gatekeeper',
    DOC.profile(repeat({ access: -4 }, 12)).name === 'The Gatekeeper');

  /* `stage` is a blend of three axes and the only one where a sign could go astray inside
     the sum rather than at the end of it. */
  ok('selling the inventory is a showman',
    DOC.profile(repeat({ inventory: 8 }, 12)).name === 'The Showman');
  ok('  and so is spending its tradition', DOC.profile(repeat({ tradition: -8 }, 12)).name === 'The Showman');
  ok('protecting tradition is a keeper',
    DOC.profile(repeat({ tradition: 8 }, 12)).name === 'The Keeper');
  ok('  and so is refusing the exposure', DOC.profile(repeat({ exposure: -8 }, 12)).name === 'The Keeper');
}

head('a term that believed nothing is told so');
{
  /* NOT ROUNDED UP TO THE NEAREST OPINION. A commissioner who took each thing as it came
     has a real result, and it is not "you were mildly a gatekeeper". */
  const drifty = DOC.profile(termOf(
    { labour: 3 }, { labour: -3 }, { access: 2 }, { access: -2 },
    { inventory: 4 }, { tradition: 4 }, { autonomy: 1 }, { autonomy: -1 }));
  ok('a term that cancelled itself out is a caretaker', drifty.name === 'The Caretaker',
    drifty.name + ' ' + JSON.stringify(drifty.axes));
  ok('  and is flagged as uncommitted', drifty.committed === false);

  /* The threshold is a threshold and not a vibe. */
  const scale = DOC.BY_ID.gate.scale;
  const just = DOC.profile(repeat({ access: (scale * (DOC.COMMITTED - 1) / 100) / 12 }, 12));
  const over = DOC.profile(repeat({ access: (scale * (DOC.COMMITTED + 1) / 100) / 12 }, 12));
  ok('under the line is a caretaker, over it is a gatekeeper or a populist',
    just.name === 'The Caretaker' && over.name !== 'The Caretaker',
    just.axes.gate + ' vs ' + over.axes.gate + ' (line at ' + DOC.COMMITTED + ')');
}

head('the second axis writes the second sentence');
{
  const both = DOC.profile(repeat({ labour: 6, access: 4 }, 12));
  ok('a term with two strong axes says both', /Mostly/.test(both.line), both.line);
  const one = DOC.profile(repeat({ labour: 6 }, 12));
  ok('  and one with a single axis does not', !/Mostly/.test(one.line), one.line);
  ok('  the name coming from the loudest of the two',
    Math.abs(both.axes[both.top]) >= Math.abs(both.axes[both.second]),
    both.top + ' over ' + both.second);
}

head('the same term is the same doctrine every time');
{
  /* A TIE MUST NOT BE A COIN FLIP. Two axes at exactly the same strength would otherwise
     sort differently depending on the engine, and the same saved term would come back with
     two different names on two machines, which is the one thing a card like this cannot do. */
  const tied = repeat({ labour: DOC.BY_ID.purse.scale / 12, access: DOC.BY_ID.gate.scale / 12 }, 12);
  const names = [];
  for (let i = 0; i < 6; i++) names.push(DOC.profile(tied).name);
  ok('a dead tie resolves the same way six times', new Set(names).size === 1, names[0]);
  ok('  and both axes really were tied',
    Math.abs(DOC.profile(tied).axes.purse) === Math.abs(DOC.profile(tied).axes.gate),
    JSON.stringify(DOC.profile(tied).axes));
}

head('the scale holds at the ends');
{
  const huge = DOC.profile(repeat({ labour: 500 }, 40));
  ok('an absurd term is clamped rather than running off the scale', huge.axes.purse === 100,
    String(huge.axes.purse));
  ok('  and the other way', DOC.profile(repeat({ labour: -500 }, 40)).axes.purse === -100);
  /* EACH AXIS HAS ITS OWN DIVISOR, measured from what a term chasing it actually reaches.
     One shared divisor would tell every open-the-doors commissioner they had barely
     bothered, because gate reaches about 30 where stage reaches 88. */
  const scales = DOC.SPECTRA.map((s) => s.scale);
  ok('the four axes do not share a divisor', new Set(scales).size > 1, scales.join(', '));
  ok('  and every one of them is positive', scales.every((s) => s > 0));
}

head('the four numbers survive a round trip');
{
  /* They go into a database column and come back out, and the order IS the schema. */
  const p = DOC.profile(repeat({ labour: 6, access: -2, inventory: 3, autonomy: -1 }, 12));
  const packed = DOC.pack(p);
  ok('packing gives one number an axis', packed.length === DOC.SPECTRA.length, JSON.stringify(packed));
  const back = DOC.unpack(packed);
  ok('  and unpacking gives them back', DOC.SPECTRA.every((s) => back.axes[s.id] === p.axes[s.id]),
    JSON.stringify(back.axes));
  ok('  in the same order they went in', packed[0] === p.axes.purse && packed[3] === p.axes.throne);
  ok('rubbish unpacks to nothing rather than to zeros',
    DOC.unpack([1, 2]) === null && DOC.unpack(null) === null);
  ok('nothing packs to nothing', DOC.pack(null) === null);
}

head('how far apart two commissioners are');
{
  const a = DOC.profile(repeat({ labour: 6 }, 12));
  const b = DOC.profile(repeat({ labour: -6 }, 12));
  ok('a term is no distance from itself', DOC.distance(a, a) === 0);
  /* IT IS A MEAN ACROSS FOUR AXES, so a hundred means opposite on ALL FOUR and two
     commissioners who disagree completely about the money and about nothing else are a
     quarter apart. That is the honest reading and it is worth pinning down, because the
     tempting misreading is that any strong disagreement should score near a hundred. */
  ok('  opposite on one axis of four is a quarter of the way', DOC.distance(a, b) === 25,
    String(DOC.distance(a, b)));
  const every = DOC.profile(repeat({ labour: 6, access: 4, inventory: 9, autonomy: -4 }, 14));
  const anti = DOC.profile(repeat({ labour: -6, access: -4, inventory: -9, autonomy: 4 }, 14));
  ok('  and opposite on all four is the whole way', DOC.distance(every, anti) === 100,
    String(DOC.distance(every, anti)));
  ok('  measured the same in both directions', DOC.distance(a, b) === DOC.distance(b, a));
  ok('  and it works on unpacked rows as well as on profiles',
    DOC.distance(a, DOC.unpack(DOC.pack(b))) === DOC.distance(a, b));
  ok('nothing to compare against is null, not zero', DOC.distance(a, null) === null);
}

head('the evidence does not guess');
{
  /* A TERM SAVED BEFORE A FIELD EXISTED must not produce a confident sentence about that
     field. Silence is the only safe answer. */
  ok('a bare world offers no evidence', DOC.evidence({}).length === 0);
  ok('  and neither does no world at all', DOC.evidence(null).length === 0);
  const w = L.createWorld({ year: 2025, seed: 1 });
  const ev = DOC.evidence(w);
  ok('a real world offers a fact per spectrum', ev.length === 4, ev.length + ' facts');
  ok('  each tied to the axis it is evidence for',
    ev.every((e) => DOC.BY_ID[e.id]), ev.map((e) => e.id).join(', '));
  ok('  and each one a sentence', ev.every((e) => /\.$/.test(e.say)),
    JSON.stringify(ev.map((e) => e.say)));
}

head('every archetype is reachable, and a played term gets one');
{
  /* THE FAILURE THIS CATCHES IS A NAME NOBODY EVER SEES. A card that is always one of six
     things looks like a card with nine things on it. */
  const reached = new Set();
  const push = (e) => { const p = DOC.profile(repeat(e, 14)); if (p) reached.add(p.name); };
  [{ labour: 6 }, { labour: -6 }, { access: 4 }, { access: -4 },
    { inventory: 9 }, { tradition: 9 }, { autonomy: -4 }, { autonomy: 4 },
    { labour: 0.1 }].forEach(push);
  const all = Object.keys(DOC.NAMES).map((k) => DOC.NAMES[k].name);
  const missing = all.filter((n) => !reached.has(n));
  ok('every one of the nine can be reached', !missing.length,
    missing.join(', ') || reached.size + ' of ' + all.length);
  ok('  and each has a line of its own',
    new Set(all).size === all.length
    && Object.keys(DOC.NAMES).every((k) => DOC.NAMES[k].line.length > 25));

  /* And a term played by a bot that never thought about any of this still gets read. */
  const teams = leagueTeams(ROOT);
  let w = L.createWorld({ year: 2025, membership: L.membershipFrom(teams, 2025), seed: 'd1' });
  const rng = E.createSeededRNG(E.hashSeed('doctrine|1'));
  w.ratings = {}; w.tails = [];
  for (let y = 0; y < 5; y++) {
    for (let b = 0; b < 9; b++) {
      const seg = S.segmentFor(w.beat);
      let sim = null;
      if (seg) {
        try {
          sim = S.play(w, teams, E.createSeededRNG(E.hashSeed('d|' + w.year)),
            { through: seg.through, titles: !!seg.titles, bracket: !!seg.bracket });
        } catch (e) { sim = null; }
      }
      const sit = SIT.build(w, L, { sim, calendar: CAL });
      const item = D.pick(w, L, rng, sit);
      if (item) {
        const o = item.options[Math.floor(rng() * item.options.length) % item.options.length];
        try {
          let e3 = D.resolve(item, o.id, {}, D.castOf(item, w, L, rng, sit));
          const t = F.roll(w, { itemId: item.id, optionId: o.id, sit, edit: e3 }, rng);
          if (t) { w.tails = w.tails.concat([t.id]).slice(-24); e3 = F.merge(e3, t); }
          w = L.applyOutcome(L.applyEdit(w, e3), e3, B.deltas(w, e3));
        } catch (e) { /* nothing to apply */ }
      }
      /* THE SEASON RULES TOO, and the harness has to do what the page does or the filter
         this file cares most about is never exercised on a real term. playSeason() applies
         the verdict edit through applyEdit exactly like a ruling, and it carries an id of
         "season:YYYY", which is the only thing separating the sport's own drift from the
         player's beliefs. */
      if (w.beat === 8) {
        try {
          const full = S.play(w, teams, E.createSeededRNG(E.hashSeed('d|' + w.year)),
            { through: S.WEEKS, titles: true, bracket: true });
          if (full && full.edit) {
            w = L.applyOutcome(L.applyEdit(w, full.edit), full.edit, B.deltas(w, full.edit));
          }
        } catch (e) { /* no season to record */ }
      }
      w = L.advance(w);
    }
  }
  const played = DOC.profile(w);
  ok('a whole term played blind comes back with a doctrine', !!played,
    played ? played.name + ' ' + JSON.stringify(played.axes) : 'none');
  ok('  every axis inside the scale',
    DOC.SPECTRA.every((s) => played.axes[s.id] >= -100 && played.axes[s.id] <= 100));
  ok('  counting only the rulings, not the seasons',
    played.rulings === DOC.rulingsOf(w).length && played.rulings < w.history.length,
    played.rulings + ' rulings of ' + w.history.length + ' history rows');
  ok('  and it says something in English', played.line.length > 30, played.line);
  ok('  with four facts about the sport it left behind', DOC.evidence(w).length === 4);
}

console.log('');
if (bad) { console.log(bad + ' FAILED'); process.exit(1); }
console.log('all clear');
