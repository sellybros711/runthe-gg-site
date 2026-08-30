/* THE CUTSCENES.
 *
 *   (nohup python3 -m http.server 8080 &)
 *   node cfb/build/test/commish/test_scene.mjs
 *
 * Two halves, and they fail in different ways.
 *
 * THE DATA fails the way every gated file in this mode fails, which is silently: a scene
 * whose `when` can never be true is a scene nobody sees, and it looks exactly like a scene
 * nobody happened to get. Every one is put in front of a world built to open its own gate.
 *
 * THE RUNNER fails loudly and in one specific way that would be very hard to get out of: a
 * cutscene takes the whole screen and hands it back through one callback, so a scene that
 * does not end is a mode with no way forward. It is checked here by playing every scene to
 * the last line and asserting the office comes back, and by skipping one from the first line
 * and asserting the same thing.
 *
 * AND ONE RULE THAT IS NOT ABOUT CODE AT ALL. No real person says anything in this mode. The
 * game this borrows its shape from puts a photograph of a broadcaster everybody knows over a
 * sentence they never said; the guard below walks every line of dialogue against the names
 * of the people most likely to end up in one by accident.
 */
import { chromium } from 'playwright';
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '../../../..');
const L = require(ROOT + '/cfb/commish/ledger.js');
const SCN = require(ROOT + '/cfb/commish/scene.js');
const SIT = require(ROOT + '/cfb/commish/situation.js');
const { leagueTeams } = await import('./league.mjs');
const teams = leagueTeams(ROOT);

const PAGE = 'http://localhost:8080/cfb/commish/index.html';
const UID = '11111111-1111-1111-1111-111111111111';
const TESTER = 'commish-test-account';
const stub = `
window.supabase={createClient(){
  const session={access_token:'x',user:{id:'${UID}',email:'c@e.com'}};
  return {auth:{onAuthStateChange(){return{data:{}}},
    getSession:()=>Promise.resolve({data:{session}}),
    signOut:()=>Promise.resolve({})},
    from(){return{select(){return{eq(){return{maybeSingle:()=>Promise.resolve(
      {data:{username:'${TESTER}'}})}}}}}},
    rpc:()=>Promise.resolve({data:true,error:null})}}};`;
const arm = `
(function(){ var v;
  Object.defineProperty(window,'PS_CFB_COMMISH_ACCESS',{configurable:true,
    get:function(){ return v; },
    set:function(a){ v=a; try{ a.TESTERS.push(${JSON.stringify(TESTER)}); }catch(e){} }});
})();`;

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };
const world = (over) => {
  const w = L.createWorld({ year: 2025, membership: L.membershipFrom(teams, 2025), seed: 5 });
  if (over) Object.assign(w, over);
  return w;
};

console.log('\n=== the shape of a scene ===');
{
  ok('there are scenes', SCN.SCENES.length >= 8, SCN.SCENES.length);
  ok('every id is unique',
    new Set(SCN.SCENES.map((s) => s.id)).size === SCN.SCENES.length);
  ok('every scene has lines', SCN.SCENES.every((s) => (s.lines || []).length >= 3),
    SCN.SCENES.filter((s) => (s.lines || []).length < 3).map((s) => s.id).join(' '));
  /* A LINE IS ONE BREATH. The form is a chyron under a picture, read at the speed somebody
     says it, so a paragraph in that slot is a paragraph nobody finishes. Measured rather
     than trusted, because the temptation while writing is always one more clause. */
  const long = [];
  SCN.SCENES.forEach((s) => SCN.saysOf(s).forEach((t) => {
    if (t.length > 130) long.push(s.id + ' ' + t.length);
    if (t.length < 20) long.push(s.id + ' only ' + t.length);
  }));
  ok('every line is one breath', !long.length, long.slice(0, 3).join(' | '));
  /* Everybody speaks from somewhere, and it has to be a room that exists. */
  const rooms = [];
  SCN.SCENES.forEach((s) => SCN.framesOf(s, {}).forEach((f) => {
    if (SCN.SETS.indexOf(f.set) < 0) rooms.push(s.id + ':' + f.set);
    if (!f.name || !f.role) rooms.push(s.id + ': a speaker with no name');
  }));
  ok('every line is somewhere that exists', !rooms.length, rooms.slice(0, 3).join(' '));
  ok('and every room gets used',
    SCN.SETS.every((set) => SCN.SCENES.some((s) =>
      SCN.framesOf(s, {}).some((f) => f.set === set))),
    SCN.SETS.filter((set) => !SCN.SCENES.some((s) =>
      SCN.framesOf(s, {}).some((f) => f.set === set))).join(' ') || 'all seven');
}

console.log('\n=== nobody real says anything ===');
{
  /* THE ONE RULE THAT IS NOT ABOUT CODE. Not an exhaustive list and it cannot be: it is the
     names most likely to end up in a line by accident, because they are the ones somebody
     writing college football dialogue reaches for. A broader guard would be a guard on the
     word "the". */
  const REAL = ['cowherd', 'herbstreit', 'mcafee', 'finebaum', 'saban', 'kirby', 'dabo',
    'sankey', 'petitti', 'phillips', 'yormark', 'baker', 'espn', 'fox sports', 'cbs sports',
    'the athletic', 'sportscenter', 'gameday'];
  const hits = [];
  SCN.SCENES.forEach((s) => SCN.saysOf(s).forEach((t) => {
    REAL.forEach((n) => { if (t.toLowerCase().indexOf(n) >= 0) hits.push(s.id + ': ' + n); });
  }));
  Object.keys(SCN.CAST).forEach((k) => {
    const c = SCN.CAST[k];
    REAL.forEach((n) => {
      if ((c.name + ' ' + c.role).toLowerCase().indexOf(n) >= 0) hits.push(k + ': ' + n);
    });
  });
  ok('no line names a real broadcaster, coach or commissioner', !hits.length, hits.join(' '));
  /* And the two exceptions are the ones the header says they are: your own staff, invented,
     who recur and therefore need something to be called. */
  /* A PERSON'S NAME, not merely two capitalised words: the first version of this counted
     "The Saturday panel" as somebody called Saturday. An archetype opens with an article. */
  const named = Object.keys(SCN.CAST).filter((k) =>
    /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(SCN.CAST[k].name));
  ok('  the only named people work for you', named.length === 2, named.join(' '));
  ok('  and they say so on the chyron',
    named.every((k) => /your|office/i.test(SCN.CAST[k].role)),
    named.map((k) => SCN.CAST[k].role).join(' | '));
}

console.log('\n=== every scene can actually fire ===');
{
  const setups = {
    'take-office': () => {},
    'first-filing': (w) => { w.pressure.legal = 60; },
    /* THE LEAGUE HAS TO HAVE BEEN ALIVE WHEN THE TERM STARTED, which is what `start.live`
       records and what stops the Pac-12 being eulogised on day one of every term. The page
       writes it in openingSnapshot(); a world built straight from the ledger has to say so
       itself. */
    'league-gone': (w) => {
      w.start = { live: ['SEC', 'Big Ten', 'ACC', 'Big 12'] };
      Object.keys(w.membership).forEach((s) => { if (w.membership[s] === 'ACC') delete w.membership[s]; });
      w.membership.Duke = 'ACC';
    },
    'they-turned': (w) => { w.blocs.ACC = 10; w.blocs['Big 12'] = 12; },
    champion: (w) => { w.year = 2026; w.champs = { 2025: { school: 'Texas' } }; },
    'first-share': (w) => { w.labour.revShare = 0.15; },
  };
  const manual = SCN.SCENES.filter((s) => s.manual).map((s) => s.id);
  ok('the two endings are manual', manual.length === 2, manual.join(' '));
  const dead = [];
  const blank = [];
  SCN.SCENES.forEach((sc) => {
    if (sc.manual) {
      /* They never gate; the term ending is the gate. They still have to render. */
      SCN.framesOf(sc, null).forEach((f) => {
        if (/undefined|NaN|\[object|=>/.test(f.say)) blank.push(sc.id + ': ' + f.say.slice(0, 40));
      });
      return;
    }
    if (!setups[sc.id]) { dead.push(sc.id + ' has no setup in this test'); return; }
    const w = world();
    setups[sc.id](w);
    const sit = SIT.build(w, L, {});
    if (SCN.eligible(w, L, sit).indexOf(sc) < 0) { dead.push(sc.id + ' never fires'); return; }
    const cast = SCN.castOf(sc, w, L, sit);
    SCN.framesOf(sc, cast).forEach((f) => {
      if (/undefined|NaN|\[object|=>/.test(f.say)) blank.push(sc.id + ': ' + f.say.slice(0, 40));
    });
  });
  ok('every scene is reachable', !dead.length, dead.slice(0, 3).join(' | '));
  ok('  and every line renders', !blank.length, blank.slice(0, 3).join(' | '));

  /* SEEN MEANS SEEN. A `once` scene that can fire twice is the intro playing on the second
     year of a term, which is the single most annoying thing a cutscene can do. */
  const w = world();
  const sit = SIT.build(w, L, {});
  const first = SCN.next(w, L, sit);
  ok('the first beat of a term opens on one', !!first && first.id === 'take-office',
    first && first.id);
  w.scenes = {}; w.scenes[first.id] = L.beatOf(w);
  ok('  and it does not come back', SCN.next(w, L, SIT.build(w, L, {})) !== first);
  /* A REPEATABLE ONE COMES BACK, BUT NOT IMMEDIATELY. "A league has folded" stays true for
     the rest of the term, and nobody wants that cutscene nine times. */
  const w2 = world();
  setups['league-gone'](w2);
  const gone = SCN.BY_ID['league-gone'];
  w2.scenes = { 'league-gone': L.beatOf(w2) };
  ok('a repeatable scene waits its cooldown out',
    SCN.eligible(w2, L, SIT.build(w2, L, {})).indexOf(gone) < 0);
  w2.year += 3;
  ok('  and comes back after it',
    SCN.eligible(w2, L, SIT.build(w2, L, {})).indexOf(gone) >= 0);
}

console.log('\n=== and it plays, and it ends ===');
const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.addInitScript(arm + stub);
await p.goto(PAGE, { waitUntil: 'domcontentloaded', timeout: 40000 });
await p.waitForTimeout(2400);

const on = (id) => p.$eval('#' + id, (e) => e.classList.contains('on')).catch(() => false);

{
  await p.click('#g-start');
  await p.waitForTimeout(1400);
  ok('taking the job opens on a scene', await on('s-scene'));
  ok('  and not on the office', !(await on('s-office')));
  const f = await p.evaluate(() => ({
    name: document.getElementById('sc-name').textContent.trim(),
    role: document.getElementById('sc-role').textContent.trim(),
    say: document.getElementById('sc-say').textContent.trim(),
    art: document.querySelectorAll('#sc-art svg').length,
    dots: document.querySelectorAll('#sc-dots i').length,
    lit: document.querySelectorAll('#sc-dots i.on').length,
  }));
  ok('somebody is speaking', f.name.length > 3 && f.role.length > 3, f.name + ' / ' + f.role);
  ok('  from a room', f.art === 1, f.art + ' sets drawn');
  ok('  and the line is still arriving', f.say.length > 0, f.say.slice(0, 40));
  ok('the counter counts the scene', f.dots >= 5 && f.lit === 1, f.lit + ' of ' + f.dots);
  /* ONE TAP FINISHES THE LINE AND THE NEXT ONE MOVES ON. Anything else and somebody who
     taps twice quickly loses a line they never read. */
  const before = f.say;
  await p.click('#sc-card');
  await p.waitForTimeout(140);
  const done = await p.evaluate(() => ({
    say: document.getElementById('sc-say').textContent.trim(),
    lit: document.querySelectorAll('#sc-dots i.on').length,
    adv: document.getElementById('sc-adv').classList.contains('on'),
  }));
  ok('one tap finishes the line rather than skipping it',
    done.say.length >= before.length && done.lit === 1, done.lit + ', ' + done.say.length + ' chars');
  ok('  and then offers the next one', done.adv);
  await p.click('#sc-card');
  await p.waitForTimeout(200);
  ok('the second tap moves on',
    (await p.$$eval('#sc-dots i.on', (e) => e.length)) === 2);
}

console.log('\n=== the way out ===');
{
  /* A cutscene takes the whole screen and hands it back through one callback. A scene that
     does not end is a mode with no way forward, so both ways out are walked. */
  await p.click('#b-scene-skip');
  await p.waitForTimeout(700);
  ok('skip hands the screen back', await on('s-office'));
  ok('  and the office is drawn behind it',
    (await p.$eval('#off-whip', (e) => e.textContent.trim().length)) > 10);
  /* AND NOTHING ELSE IS WAITING BEHIND IT on the first beat of a term. This caught a real
     one: the 2025 data has the Pac-12 below the conference floor already, so a scene gated
     on "a league has folded" fired on day one about something that folded before the player
     arrived, immediately after the intro. */
  ok('  and nothing else is queued behind it', await p.evaluate(async () => {
    window.PS_CFB_COMMISH_TEST.repaint();
    await new Promise((r) => setTimeout(r, 400));
    return document.getElementById('s-office').classList.contains('on');
  }));

  /* And to the last line, which is the other way a scene can fail to end. */
  const played = await p.evaluate(async () => {
    const T = window.PS_CFB_COMMISH_TEST;
    T.play('served');
    await new Promise((r) => setTimeout(r, 400));
    let taps = 0;
    while (document.getElementById('s-scene').classList.contains('on') && taps < 40) {
      document.getElementById('sc-card').click();
      taps++;
      await new Promise((r) => setTimeout(r, 90));
    }
    return { taps: taps, out: !document.getElementById('s-scene').classList.contains('on') };
  });
  ok('tapping to the last line ends it', played.out, played.taps + ' taps');
}

ok('nothing threw', errs.length === 0, errs.slice(0, 2).join(' | '));
await b.close();
console.log(bad ? '\n' + bad + ' FAILED\n' : '\nall good\n');
process.exit(bad ? 1 : 0);
