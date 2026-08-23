/* STAGE 0: THE WORLD, WITH NO GAME ON TOP OF IT.
 *
 *   node cfb/build/test/commish/test_ledger.mjs
 *
 * Everything above the ledger is presentation. If a ruling does not really change the
 * sport, no amount of UI makes the decision matter, and the mode is a quiz with nice art.
 * So this proves the parts that have to be true before a single screen is drawn:
 *
 *   a world starts as the sport really was, off the game's own team data
 *   an edit changes what it says it changes and nothing else
 *   an edit to a field that does not exist is LOUD, because the alternative is a ruling
 *     that silently does nothing and a player who never finds out
 *   the room's reactions are in character, without anybody authoring nine per item
 *   the same push costs more when a bloc has already been on the losing end
 *   you can be removed two ways, and one of them ignores every other number
 *   a whole five-season term runs headless, and the same seed replays identically
 *
 * The last one is the repo's own discipline applied here: every other mode in this game
 * replays from a seed, and a term has to as well or none of it can be tested twice.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(new URL('../../../..', import.meta.url).pathname);
const L = require(ROOT + '/cfb/commish/ledger.js');
const B = require(ROOT + '/cfb/commish/blocs.js');
const E = require(ROOT + '/cfb/engine.js');
const teams = JSON.parse(fs.readFileSync(ROOT + '/cfb/data/cfb_team_seasons.json', 'utf8'));

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };
const world0 = (year) => L.createWorld({ year, membership: L.membershipFrom(teams, year), seed: 7 });

console.log('\n=== the world starts as the sport really was ===');
{
  const w = world0(2025);
  const confs = L.conferencesIn(w);
  ok('membership comes off the game\'s own team data', Object.keys(w.membership).length > 60,
    Object.keys(w.membership).length + ' schools');
  ok('  and it is the real 2025 alignment', confs['Big Ten'] === 18 && confs.SEC === 16,
    Object.entries(confs).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(', '));
  /* THE HOOK IN THE PLAN, PROVEN RATHER THAN ASSERTED. Taking office in 2011 has to hand
     you a sport where the Pac-12 is twelve teams and Texas is in the Big 12, because
     stopping what happened next is the whole reason to start there. */
  const old = world0(2011);
  ok('a term can open in an earlier sport', old.membership.Texas === 'Big 12'
    && old.membership.Oregon === 'Pac-12' && old.membership.Maryland === 'ACC',
    'Texas ' + old.membership.Texas + ', Oregon ' + old.membership.Oregon
    + ', Maryland ' + old.membership.Maryland);
  ok('  with the Pac-12 still whole', L.membersOf(old, 'Pac-12').length === 12,
    L.membersOf(old, 'Pac-12').length + ' members');
  ok('  and it is defunct in the world we actually ship', L.isDefunct(w, 'Pac-12'),
    L.membersOf(w, 'Pac-12').join(', ') || 'nobody');
  /* Plain data, because the world IS the save file. */
  ok('a world is JSON and survives a round trip',
    JSON.stringify(JSON.parse(JSON.stringify(w))) === JSON.stringify(w));
}

console.log('\n=== an edit changes the sport, and only what it said ===');
{
  const w = world0(2025);
  const next = L.applyEdit(w, {
    id: 'playoff-16', label: 'Expand to sixteen',
    set: { 'playoff.teams': 16, 'playoff.autobids': 6 },
    effects: { access: 2, inventory: 2, money: 1, tradition: -2 },
  });
  ok('the field is sixteen now', next.playoff.teams === 16 && next.playoff.autobids === 6,
    next.playoff.teams + ' teams, ' + next.playoff.autobids + ' autobids');
  ok('  the byes were not touched', next.playoff.byes === w.playoff.byes);
  ok('  and neither was anything else',
    JSON.stringify(next.money) === JSON.stringify(w.money)
    && JSON.stringify(next.labour) === JSON.stringify(w.labour));
  ok('the ruling is on the record', next.history.length === 1 && next.history[0].id === 'playoff-16');
  /* PURE, which is what lets a policy be tested against the room before it is passed:
     the preview and the commit are the same call, so the preview cannot lie. */
  ok('and the world it was applied to is untouched', w.playoff.teams === 12 && !w.history.length);

  /* THE GUARD THIS FILE EXISTS FOR. */
  let threw = null;
  try { L.applyEdit(w, { set: { 'money.shair': 0.3 } }); } catch (e) { threw = e.message; }
  ok('a ruling that writes to a field nobody has is an error, not a shrug',
    !!threw && /no such field/.test(threw), threw || 'it was accepted');
  let threw2 = null;
  try { L.applyEdit(w, { move: { Wossamotta: 'SEC' } }); } catch (e) { threw2 = e.message; }
  ok('  and so is moving a school that does not exist', !!threw2 && /no such school/.test(threw2));
}

console.log('\n=== realignment is a fact, not a headline ===');
{
  let w = world0(2011);
  const before = L.membersOf(w, 'Pac-12').length;
  /* Ten of the twelve leave, which is roughly what really happened to it by 2024. */
  const move = {};
  L.membersOf(w, 'Pac-12').slice(0, 10).forEach((s, i) => { move[s] = i % 2 ? 'Big Ten' : 'SEC'; });
  w = L.applyEdit(w, { id: 'let-it-go', move, effects: { money: 2, tradition: -3, inventory: 1 } });
  ok('a conference can be taken apart', L.membersOf(w, 'Pac-12').length === before - 10,
    before + ' to ' + L.membersOf(w, 'Pac-12').length);
  ok('  and the sport knows it is gone', L.isDefunct(w, 'Pac-12'),
    L.membersOf(w, 'Pac-12').length + ' left, and it takes ' + L.MIN_CONFERENCE + ' to be a conference');
  ok('  because the schools are somewhere else now', w.membership[Object.keys(move)[0]] !== 'Pac-12',
    Object.keys(move)[0] + ' is now ' + w.membership[Object.keys(move)[0]]);
}

console.log('\n=== the share always adds to one ===');
{
  const w = world0(2025);
  const total = (s) => Math.round(Object.values(s).reduce((a, b) => a + b, 0) * 1000) / 1000;
  ok('it does to start with', Math.abs(total(w.money.share) - 1) < 0.002, total(w.money.share));
  const next = L.applyEdit(w, {
    id: 'g5-share', set: { 'money.share.Group of Five': 0.30 },
    effects: { access: 2, money: -1 }, aimed: { 'Group of Five': { money: 3 } },
  });
  ok('and after a ruling that only names one of them', Math.abs(total(next.money.share) - 1) < 0.002,
    total(next.money.share));
  ok('  with the named one actually up', next.money.share['Group of Five'] > w.money.share['Group of Five'],
    w.money.share['Group of Five'] + ' to ' + next.money.share['Group of Five']);
  ok('  and the rest diluted to pay for it', next.money.share.SEC < w.money.share.SEC,
    w.money.share.SEC + ' to ' + next.money.share.SEC);
}

console.log('\n=== the room is in character, and nobody wrote nine reactions ===');
{
  const w = world0(2025);
  const say = (rows, id) => rows.find((r) => r.id === id);

  /* Flatten the money: good for the have-nots, an insult to the two that hold the
     inventory. Nothing about this ruling was authored per bloc. */
  const flatten = { id: 'flatten', effects: { money: -2, access: 3, cost: 1 },
    aimed: { 'Group of Five': { money: 3 }, SEC: { money: -2 }, 'Big Ten': { money: -2 } } };
  const r1 = B.react(w, flatten);
  ok('the Group of Five likes being let in', say(r1, 'Group of Five').delta > 2, say(r1, 'Group of Five').delta);
  ok('  the SEC does not', say(r1, 'SEC').delta < -2, say(r1, 'SEC').delta);
  ok('  and the Big Ten goes with the SEC', say(r1, 'Big Ten').delta < -2, say(r1, 'Big Ten').delta);
  ok('  every bloc answered', r1.length === 9 && r1.every((x) => x.say && x.mood), r1.length + ' answers');

  /* Pay the players. The players and the presidents are on opposite sides of one ruling,
     and the split falls out of the weights rather than out of a script. */
  const pay = { id: 'pay', effects: { labour: 3, cost: 3, exposure: -2, money: -1 } };
  const r2 = B.react(w, pay);
  ok('paying the players pleases the players', say(r2, 'Players').delta > 3, say(r2, 'Players').delta);
  ok('  and frightens the presidents', say(r2, 'Presidents').delta < 0, say(r2, 'Presidents').delta);

  /* Move rivalry weekend to a Thursday for the networks. */
  const tv = { id: 'tv', effects: { tradition: -3, inventory: 3, money: 2 } };
  const r3 = B.react(w, tv);
  ok('the networks buy inventory', say(r3, 'Networks').delta > 3, say(r3, 'Networks').delta);
  ok('  and the fans do not forgive tradition', say(r3, 'Fans').delta < -3, say(r3, 'Fans').delta);
  ok('  each with its own words', say(r3, 'Networks').say !== say(r3, 'Fans').say,
    '"' + say(r3, 'Networks').say + '" vs "' + say(r3, 'Fans').say + '"');
}

console.log('\n=== the room remembers ===');
{
  /* THE SAME PUSH, TO A BLOC YOU HAVE ALREADY TAKEN APART TWICE. It has to cost more, or a
     player can hurt the same bloc forever at the same price and the room is a calculator. */
  const hit = { id: 'hit', effects: { money: -2, autonomy: -2 } };
  let fresh = world0(2025);
  const first = B.react(fresh, hit).find((r) => r.id === 'SEC').delta;
  let sore = fresh;
  for (let i = 0; i < 3; i++) sore = L.applyEdit(sore, hit);
  const fourth = B.react(sore, hit).find((r) => r.id === 'SEC').delta;
  ok('a bloc on a losing run takes the next one harder', fourth < first,
    'first ' + first + ', fourth ' + fourth);
  ok('  and the memory is read off the record rather than stored',
    B.grudge(sore, 'SEC') > 0 && !('grudge' in sore), 'grudge ' + B.grudge(sore, 'SEC'));
  ok('  a bloc that has not been touched has none', B.grudge(fresh, 'SEC') === 0);
}

console.log('\n=== two ways to lose the job ===');
{
  let w = world0(2025);
  /* THE COALITION, WHICH IGNORES EVERY OTHER NUMBER. Football President's rule, and the
     reason a player counts votes rather than points. */
  w.blocs.SEC = 10; w.blocs['Big Ten'] = 12;
  w.meters.revenue = 95; w.meters.health = 90;
  w.meters.standing = L.standingFrom(w.blocs);
  const gone = L.removal(w);
  ok('lose the two that hold the inventory and you are out', gone.removed && gone.reason === 'coalition',
    gone.say);
  ok('  with the money at 95 and the sport in good health', w.meters.revenue === 95);

  /* THE VOTE, which is survivable if the right blocs turned up. */
  let v = world0(2025);
  /* Everybody who holds a vote has turned EXCEPT the SEC, so the coalition rule does not
     fire and this can only be the count. */
  Object.keys(v.blocs).forEach((b) => { v.blocs[b] = 14; });
  v.blocs.SEC = 60;
  v.meters.standing = L.standingFrom(v.blocs);
  const voted = L.removal(v);
  ok('or enough of the rest of the room turns', voted.removed && voted.reason === 'vote', voted.say);
  ok('  and it is a count of votes, not an average of feelings',
    L.hostileWeight(v) > L.totalWeight() / 2,
    L.hostileWeight(v) + ' of ' + L.totalWeight() + ' hostile');

  let safe = world0(2025);
  safe.blocs.SEC = 12; safe.blocs['Big Ten'] = 70;
  safe.meters.standing = L.standingFrom(safe.blocs);
  ok('one of the two alone is survivable', !L.removal(safe).removed,
    L.hostileWeight(safe) + ' of ' + L.totalWeight() + ' hostile');
  ok('  and it names who is angry', L.removal(safe).angry.join(', ') === 'SEC',
    L.removal(safe).angry.join(', '));
}

console.log('\n=== a whole term, headless ===');
{
  /* Nine beats a season, five seasons, no UI. A deterministic bot so the run is a fixture
     rather than a story: it alternates between feeding the room and cutting its own path. */
  const DOCKET = [
    { id: 'expand', set: { 'playoff.teams': 16 }, effects: { access: 2, inventory: 2, tradition: -1 } },
    { id: 'squeeze', effects: { money: 2, access: -2, cost: -1 }, aimed: { SEC: { money: 2 }, 'Big Ten': { money: 2 } } },
    { id: 'pay', set: { 'labour.revShare': 0.2 }, effects: { labour: 3, cost: 2, exposure: -1 } },
    { id: 'windows', set: { 'posture.tvWindows': 7 }, effects: { inventory: 2, tradition: -2, money: 1 } },
    { id: 'guarantee', set: { 'playoff.autobids': 7 }, effects: { access: 2, money: -1 }, aimed: { 'Group of Five': { access: 3 } } },
  ];
  function term(seed) {
    let w = L.createWorld({ year: 2025, membership: L.membershipFrom(teams, 2025), seed });
    const log = [];
    for (let i = 0; i < 45; i++) {
      const item = DOCKET[(seed + i * 7) % DOCKET.length];
      /* set the same field twice across a term is fine, and the ledger takes it. */
      const edit = Object.assign({}, item);
      const rows = B.react(w, edit);
      const d = {};
      rows.forEach((r) => { d[r.id] = r.delta; });
      w = L.applyOutcome(L.applyEdit(w, edit), edit, d);
      const out = L.removal(w);
      log.push(w.year + '.' + w.beat + ' ' + item.id + ' standing ' + Math.round(w.meters.standing));
      if (out.removed) { w.outcome = out; break; }
      w = L.advance(w);
    }
    return { w, log };
  }
  const a = term(3);
  ok('a five-season term runs with no UI at all', a.log.length > 0, a.log.length + ' beats played');
  ok('  the clock moved through the seasons', a.w.year > 2025 || !!a.w.outcome,
    a.w.year + ', beat ' + a.w.beat + (a.w.outcome ? ', removed: ' + a.w.outcome.reason : ''));
  ok('  the sport is not what it was', a.w.playoff.teams !== 12 || a.w.labour.revShare !== 0,
    a.w.playoff.teams + '-team playoff, ' + Math.round(a.w.labour.revShare * 100) + '% to the players');
  ok('  and every ruling is on the record', a.w.history.length === a.log.length,
    a.w.history.length + ' rulings');

  /* THE REPO'S OWN DISCIPLINE. Every other mode replays from a seed; a term has to too, or
     nothing above it can be tested twice. */
  const b = term(3);
  ok('the same seed replays identically', JSON.stringify(a.w) === JSON.stringify(b.w));
  const c = term(4);
  ok('  and a different one does not', JSON.stringify(a.w) !== JSON.stringify(c.w));
}

console.log('\n=== the fuses go off, they do not tick down ===');
{
  let w = world0(2025);
  const reckless = { id: 'reckless', effects: { exposure: 3, labour: -3, access: -2 } };
  for (let i = 0; i < 4; i++) {
    const d = B.deltas(w, reckless);
    w = L.applyOutcome(L.applyEdit(w, reckless), reckless, d);
  }
  ok('legal exposure builds where nobody in the room is paid to look', w.pressure.legal > 10,
    Math.round(w.pressure.legal));
  ok('  and taking from the players lights the union', w.pressure.union > 10,
    Math.round(w.pressure.union));
  ok('  and shutting people out reaches Washington', w.pressure.congress > 5,
    Math.round(w.pressure.congress));
}

console.log('\n=== the seam to the football ===');
{
  /* NOT THE FEATURE YET, and this is the assertion that says so honestly. Stage 3 feeds the
     ledger's playoff into the engine. What can be checked today is that the two agree about
     what the fields MEAN, so the wiring is a wiring job and not a redesign. */
  const w = world0(2025);
  ok('the ledger opens on the format the engine ships',
    w.playoff.teams === E.CONSTANTS.PLAYOFF_TEAMS && w.playoff.byes === E.CONSTANTS.PLAYOFF_BYES,
    w.playoff.teams + '/' + w.playoff.byes + ' against the engine\'s '
    + E.CONSTANTS.PLAYOFF_TEAMS + '/' + E.CONSTANTS.PLAYOFF_BYES);
  /* Every conference the ledger can name is one the draft game already knows, or Conference
     Draft in a commissioner's world would offer a conference that does not exist. */
  const known = new Set(teams.map((t) => t.conference));
  const named = Object.keys(L.conferencesIn(w));
  ok('  and every conference it names is one the game knows',
    named.every((c) => known.has(c)), named.length + ' conferences');
}

console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
