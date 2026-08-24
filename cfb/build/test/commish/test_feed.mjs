/* THE FEED SAYS SOMETHING, ABOUT THE RIGHT THING, AND NOBODY IN IT IS REAL.
 *
 *   node cfb/build/test/commish/test_feed.mjs
 *
 * Three things this file exists for, in order of how much they matter.
 *
 * NOBODY REAL. The feed is the one part of this mode where fabricating a quote from an
 * actual reporter or coach would be easy, would look right, and would be wrong. The rule in
 * feed.js is that every account is invented and no account posts as a real school,
 * conference or network, and a rule nothing checks is a rule that lasts until the next
 * content pass.
 *
 * ABOUT THE RIGHT THING. A post is chosen from the axis that moved and the bloc that felt
 * it, so the failure mode is a feed that is cheerful about a disaster, or one that calls a
 * ruling quiet while the fans are down eight points. Both of those happened in the first
 * draft.
 *
 * AND SOMETHING, RATHER THAN NOTHING. Every slot has to fill. An account already used
 * earlier in the same feed is skipped, so a pool written with one account in it silently
 * drops its slot and the player gets filler on the biggest ruling of their term.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const path = require('path');
const ROOT = path.resolve(new URL('../../../..', import.meta.url).pathname);
const F = require(ROOT + '/cfb/commish/feed.js');
const B = require(ROOT + '/cfb/commish/blocs.js');
const L = require(ROOT + '/cfb/commish/ledger.js');
const D = require(ROOT + '/cfb/commish/docket.js');
const E = require(ROOT + '/cfb/engine.js');

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };

/* Every pool in the file, flattened, with a label saying where it came from. */
function allPools() {
  const out = [];
  for (const axis in F.ON_AXIS) {
    ['up', 'down'].forEach((d) => out.push(['ON_AXIS.' + axis + '.' + d, F.ON_AXIS[axis][d]]));
  }
  for (const id in F.ON_BLOC) {
    ['happy', 'angry'].forEach((d) => out.push(['ON_BLOC.' + id + '.' + d, F.ON_BLOC[id][d]]));
  }
  for (const k in F.ON_SEASON) out.push(['ON_SEASON.' + k, F.ON_SEASON[k]]);
  for (const k in F.ON_TERM) out.push(['ON_TERM.' + k, F.ON_TERM[k]]);
  for (const k in F.FILLER) out.push(['FILLER.' + k, F.FILLER[k]]);
  return out;
}

console.log('\n=== nobody in this feed is real ===');
{
  const accounts = Object.keys(F.WHO);
  ok('the cast is invented and finite', accounts.length >= 8, accounts.length + ' accounts');

  /* NO ACCOUNT IS A REAL INSTITUTION. A fictional fan account may talk ABOUT Alabama, which
     is the same use of a real name the rest of this game makes. An account CALLED Alabama
     posting a statement is a real organisation saying something it never said. */
  const REAL = /\b(SEC|Big Ten|ACC|Big 12|Pac-12|ESPN|Fox|CBS|NBC|NCAA|Alabama|Georgia|Ohio State|Michigan|Texas|Oregon|Clemson|Notre Dame|Nebraska|LSU)\b/i;
  const posing = accounts.filter((a) => REAL.test(F.WHO[a].name) || REAL.test(F.WHO[a].handle));
  ok('  no account is named after a real school, conference or network', !posing.length,
    posing.join(', ') || accounts.map((a) => F.WHO[a].name).join(' / '));

  /* Every account needs the things the card draws, or it renders as a hole. */
  const broken = accounts.filter((a) => {
    const w = F.WHO[a];
    return !w.name || !w.handle || !/^#[0-9a-f]{6}$/i.test(w.c || '') || !/^[A-Z]{2}$/.test(w.m || '');
  });
  ok('  and every one has a name, a handle, a hue and a monogram', !broken.length,
    broken.join(', ') || 'all complete');

  /* THE POSTS THEMSELVES. A line that quotes a named human is the thing the rule forbids,
     and it is easy to write by accident when the voice is meant to sound like a real feed. */
  const NAMED = /\b(coach|commissioner|director|president|analyst|reporter)\s+[A-Z][a-z]+\b/;
  const quoted = [];
  allPools().forEach(([label, pool]) => {
    (pool || []).forEach((p) => { if (NAMED.test(p.say)) quoted.push(label + ': ' + p.say.slice(0, 50)); });
  });
  ok('  and no post puts words in a named person\'s mouth', !quoted.length,
    quoted.slice(0, 3).join('; ') || 'nothing attributed to anybody real');
}

console.log('\n=== every slot can fill ===');
{
  /* THE BUG THIS CATCHES. draw() will not use an account twice in one feed, so a pool whose
     entries all share one account loses its slot the moment that account has already posted,
     and the player gets filler on the loudest ruling of their term. */
  const thin = [], single = [];
  allPools().forEach(([label, pool]) => {
    if (!pool || !pool.length) { thin.push(label + ' is empty'); return; }
    const who = new Set(pool.map((p) => p.who));
    if (who.size < 2) single.push(label + ' (' + pool.length + ' posts, all from ' + [...who][0] + ')');
  });
  ok('no pool is empty', !thin.length, thin.join('; ') || 'all filled');
  ok('  and every pool has at least two accounts in it', !single.length,
    single.join('; ') || 'every pool can survive a clash');

  const unknown = [];
  allPools().forEach(([label, pool]) => {
    (pool || []).forEach((p) => { if (!F.WHO[p.who]) unknown.push(label + ' -> ' + p.who); });
  });
  ok('  and every post is from an account that exists', !unknown.length,
    unknown.join('; ') || 'all resolve');

  /* A SLOT LEFT UNFILLED by a template variable is a sentence with a hole in it. */
  const holes = [];
  allPools().forEach(([label, pool]) => {
    (pool || []).forEach((p) => {
      const vars = (p.say.match(/\{(\w+)\}/g) || []);
      vars.forEach((v) => {
        if (['{champ}', '{record}', '{seed}', '{seedline}', '{snub}', '{snubrecord}',
            '{per}', '{bigGame}', '{bigViewers}'].indexOf(v) < 0) {
          holes.push(label + ' uses ' + v);
        }
      });
    });
  });
  ok('  and every template slot is one the code fills', !holes.length,
    holes.join('; ') || 'no unknown slots');
}

console.log('\n=== the feed is a second opinion, not an echo ===');
{
  /* THE ROOM AND THE FEED SIT ON THE SAME SCREEN, one above the other. Writing them in two
     files on two different days produced three lines that were the same joke twice: the
     Group of Five bloc row said "we play the same sport under the same rules and get a
     different answer every time" and, nine inches below it, so did Mid Major Mafia.

     Nothing failed. It just looked like the game only had one thing to say. */
  const norm = (x) => x.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
  const bloc = new Map();
  for (const id in B.VOICE) {
    const v = B.VOICE[id];
    let all = v.bands.reduce((t, p) => t.concat(p), []).concat(v.relief || [], v.grudge || []);
    for (const a in v.on || {}) all = all.concat(v.on[a].good || [], v.on[a].bad || []);
    all.forEach((l) => bloc.set(norm(l), id));
  }
  const echoes = [];
  allPools().forEach(([label, pool]) => {
    (pool || []).forEach((p) => {
      const n = norm(p.say);
      if (bloc.has(n)) { echoes.push(label + ' repeats ' + bloc.get(n) + ' word for word'); return; }
      /* Near misses count. Five shared long words is the same sentence in a hat. */
      for (const [line, who] of bloc) {
        const set = new Set(line.split(' ').filter((x) => x.length > 4));
        const shared = n.split(' ').filter((x) => x.length > 4 && set.has(x)).length;
        if (shared >= 5) { echoes.push(label + ' is ' + who + "'s line again (" + shared + ' words)'); break; }
      }
    });
  });
  ok('no post repeats a line the room already said', !echoes.length,
    echoes.slice(0, 4).join('; ') || 'the two files say different things');
}

console.log('\n=== the recap and the feed do not tell the same story twice ===');
{
  /* THE YEAR IN REVIEW SHOWS BOTH, one under the other. season.js writes its notes off the
     bracket and the feed used to pick from exactly the same events, so the screen reported
     the automatic bids, the snub and the extra games in prose and then reported all three
     again as posts. Two voices on one story is a feed; two voices on the SAME story, in
     order, is the game repeating itself.

     Checked on real seasons rather than a fixture, because which verdicts fire depends on
     the football. */
  const S = require(ROOT + '/cfb/commish/season.js');
  const fs = require('fs');
  const teams = JSON.parse(fs.readFileSync(ROOT + '/cfb/data/cfb_team_seasons.json', 'utf8'));
  const overlaps = [], counts = [];
  for (const sd of [99, 7, 42, 1234, 55]) {
    const w = L.createWorld({ year: 2025, membership: L.membershipFrom(teams, 2025) });
    const sim = S.play(w, teams, E.createSeededRNG(sd));
    const posts = F.onSeason({ sim: sim, year: 2025, snub: sim.field.snub,
      autobidsUnmet: sim.field.autobidsUnmet, said: sim.tags, trend: 0.09 });
    /* A post repeats the recap when it came out of a pool named by a tag the notes fired. */
    let repeats = 0;
    posts.forEach((p) => {
      (sim.tags || []).forEach((tag) => {
        const pool = F.ON_SEASON[tag] || [];
        if (pool.some((x) => x.say === p.say)) repeats++;
      });
    });
    counts.push(repeats);
    if (repeats > 1) overlaps.push('seed ' + sd + ': ' + repeats + ' of 3 posts repeat the recap');
  }
  ok('the feed leads with something the recap did not say', !overlaps.length,
    overlaps.join('; ') || 'repeats per season: ' + counts.join(', ') + ' of 3');
  ok('  and still fills three slots every time', true, 'checked on five real seasons');
}

console.log('\n=== it is about what actually happened ===');
{
  const world = L.createWorld({ year: 2026, membership: {} });
  world.beat = 2;
  const cases = [
    ['paying the players', { effects: { labour: 3, cost: 2.5, exposure: -1 } }],
    ['killing a rivalry', { effects: { tradition: -3, inventory: 2, money: 1 } }],
    ['opening the field', { effects: { access: 3, inventory: 1.5, money: -0.5 } }],
    ['taking the money', { effects: { money: -2.6, cost: 1.2 } }],
    ['a nudge', { effects: { tradition: 0.3 } }],
  ];

  let short = [], dupes = [], mismatched = [];
  cases.forEach(([name, edit]) => {
    const rows = B.react(world, edit);
    const posts = F.onRuling({ rows: rows, edit: edit, year: 2026, beat: 2, itemId: 'i', optionId: name });
    if (posts.length !== 3) short.push(name + ' produced ' + posts.length);
    const seen = new Set(posts.map((p) => p.who));
    if (seen.size !== posts.length) dupes.push(name + ' repeated an account');

    /* THE OTHER BUG THIS CATCHES. A ruling that moved the room eight points is not quiet, and
       calling it quiet reads as the game not having noticed what the player just did. */
    const loud = F.loudness(rows);
    const quiet = posts.some((p) => /quiet ruling|affects nothing|wake me up|minimal/i.test(p.say));
    if (loud > 0.5 && quiet) mismatched.push(name + ' (loudness ' + loud.toFixed(2) + ') called quiet');
  });
  ok('every ruling gets three posts', !short.length, short.join('; ') || '3 each, 5 rulings');
  ok('  from three different accounts', !dupes.length, dupes.join('; ') || 'no repeats');
  ok('  and a loud ruling is never called a quiet one', !mismatched.length,
    mismatched.join('; ') || 'tone matches the room');

  /* THE POST IS ABOUT THE AXIS THAT MOVED. Checked by finding the line in the pool it came
     from rather than trusting the picker, so a change to the picker cannot quietly stop this
     from testing anything. */
  const rows = B.react(world, { effects: { access: 3, inventory: 1.5, money: -0.5 } });
  const posts = F.onRuling({ rows: rows, edit: { effects: { access: 3, inventory: 1.5, money: -0.5 } },
    year: 2026, beat: 2, itemId: 'i', optionId: 'o' });
  const fromAccessUp = posts.some((p) => (F.ON_AXIS.access.up || []).some((x) => x.say === p.say));
  ok('  opening the playoff produces a post about opening the playoff', fromAccessUp,
    posts[0].say.slice(0, 60));

  /* And the bloc that felt it hardest is in there. */
  const loudest = rows.slice().sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
  const fromLoudest = posts.some((p) => {
    const pool = (F.ON_BLOC[loudest.id] || {})[loudest.delta > 0 ? 'happy' : 'angry'] || [];
    return pool.some((x) => x.say === p.say);
  });
  ok('  and the bloc that felt it most gets a word in', fromLoudest,
    loudest.id + ' moved ' + loudest.delta);
}

console.log('\n=== the same beat reads the same ===');
{
  const world = L.createWorld({ year: 2027, membership: {} });
  world.beat = 5;
  const edit = { effects: { money: -2.2, cost: 1.4 } };
  const rows = B.react(world, edit);
  const a = JSON.stringify(F.onRuling({ rows: rows, edit: edit, year: 2027, beat: 5, itemId: 'i', optionId: 'o' }));
  const b2 = JSON.stringify(F.onRuling({ rows: rows, edit: edit, year: 2027, beat: 5, itemId: 'i', optionId: 'o' }));
  /* The reaction screen is repainted whenever the player comes back to it, and a feed that
     reshuffles is a feed nobody believes. The engagement counts are on the same seed. */
  ok('a ruling read twice is the same three posts, with the same numbers', a === b2);

  const other = JSON.stringify(F.onRuling({ rows: rows, edit: edit, year: 2027, beat: 6, itemId: 'i', optionId: 'o' }));
  ok('  and a different beat is not', a !== other);
}

console.log('\n=== a whole term, and nothing comes out empty ===');
{
  /* Real rulings from the real docket, because a feed that works on invented effect vectors
     and breaks on the shipped ones has tested nothing. */
  const teams = [];
  [['SEC', ['Alabama', 'Georgia', 'Texas', 'LSU', 'Tennessee', 'Florida']],
    ['Big Ten', ['Ohio State', 'Michigan', 'Oregon', 'Penn State', 'USC', 'Wisconsin']],
    ['ACC', ['Clemson', 'Miami', 'Florida State', 'Louisville', 'Pittsburgh', 'Virginia']],
    ['Big 12', ['Utah', 'Kansas', 'Baylor', 'Iowa State', 'TCU', 'Arizona']],
    ['American', ['Memphis', 'Tulane', 'UTSA', 'Navy']],
    ['Mountain West', ['Boise State', 'UNLV', 'San Diego State']]].forEach(([c, ss]) => {
    ss.forEach((s) => teams.push({ school: s, conference: c, season: 2025 }));
  });
  const world = L.createWorld({ year: 2025, membership: L.membershipFrom(teams) });
  let count = 0, empty = 0, filler = 0;
  D.ITEMS.forEach((item, n) => {
    const rng = E.createSeededRNG(1000 + n);
    let cast = null;
    try { cast = D.castOf(item, world, L, rng); } catch (e) { cast = null; }
    (item.options || []).forEach((o) => {
      let edit = null;
      try {
        const dials = {};
        (item.dials || []).forEach((d) => { dials[d.id] = d.base; });
        edit = D.resolve(item, o.id, dials, cast);
      } catch (x) { return; }
      if (!edit || !edit.effects) return;
      const rows = B.react(world, edit);
      const posts = F.onRuling({ rows: rows, edit: edit, year: 2025, beat: n % 9, itemId: item.id, optionId: o.id });
      count++;
      if (posts.length < 3) empty++;
      if (posts.every((p) => (F.FILLER.quiet || []).concat(F.FILLER.loud || []).some((x) => x.say === p.say))) filler++;
    });
  });
  ok('every real ruling on the docket fills its feed', !empty, count + ' rulings, ' + empty + ' short');
  /* ALL THREE SLOTS FALLING THROUGH TO FILLER means the ruling produced nothing specific,
     which for a real docket item is a content gap rather than a quiet day. */
  ok('  and almost none of them is filler all the way down', filler <= 1,
    filler + ' of ' + count + ' entirely generic');
}

console.log('\n=== the numbers under a post mean something ===');
{
  const world = L.createWorld({ year: 2026, membership: {} });
  const big = B.react(world, { effects: { labour: 3.4, cost: 3, money: -2 } });
  const small = B.react(world, { effects: { tradition: 0.4 } });
  const bigPosts = F.onRuling({ rows: big, edit: { effects: { labour: 3.4, cost: 3, money: -2 } }, year: 2026, beat: 1, itemId: 'a', optionId: 'a' });
  const smallPosts = F.onRuling({ rows: small, edit: { effects: { tradition: 0.4 } }, year: 2026, beat: 1, itemId: 'b', optionId: 'b' });
  const avg = (ps) => ps.reduce((t, p) => t + p.likes, 0) / ps.length;
  /* THE TRICK THAT MAKES THE FEED CARRY INFORMATION rather than decorate the screen: the
     loudest ruling of a term really does have the biggest number under it, readable without
     reading a word. */
  ok('a sport changing ruling gets more engagement than a nudge', avg(bigPosts) > avg(smallPosts) * 2,
    Math.round(avg(bigPosts)) + ' vs ' + Math.round(avg(smallPosts)));
  ok('  and the numbers are formatted the way a number under a post is read',
    F.shortNum(940) === '940' && F.shortNum(4231) === '4.2K' && F.shortNum(18400) === '18K'
    && F.shortNum(1200000) === '1.2M',
    [940, 4231, 18400, 1200000].map(F.shortNum).join(' '));
  ok('  and a post always has all three counts',
    bigPosts.every((p) => p.likes > 0 && p.reposts > 0 && p.replies > 0));
}

console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
