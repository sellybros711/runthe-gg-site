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
    champion: (w) => { w.year = 2026; w.champions = { 2025: { school: 'Texas' } }; },
    'first-share': (w) => { w.labour.revShare = 0.15; },
    'two-am': (w) => { w.beat = 5; w.rules.overtime = 'sudden'; },
    'left-out': (w) => { w.beat = 6; },
    'sold-it': (w) => { w.brand.playoff = 'bank'; w.brand.patch = 'phone'; w.brand.trophy = 'airline'; },
    /* The strike and the verdict fire off a ripened thread, the same gate their payoff items
       read, so the setup is the mechanic: plant the thread due now. */
    'strike-morning': (w) => { w.threads = L.plant(w, 'the-stoppage', { wait: 0 }).threads; },
    'verdict-day': (w) => { w.threads = L.plant(w, 'fought-it', { wait: 0 }).threads; },
    /* February, and not the first one: year one already opens on take-office. */
    'signing-day': (w) => { w.beat = 1; w.year = 2026; },
  };
  /* `left-out` needs an unbeaten team from outside the four, which is a fact about a season
     rather than about the ledger, so the situation is handed one rather than the world being
     bent into producing one. */
  const SEASON = { unbeaten: [{ school: 'Boise State', conference: 'Mountain West', wins: 10 }],
    through: 11, teams: [{ school: 'Boise State', conference: 'Mountain West', wins: 10, losses: 0 }],
    games: [], polls: [] };
  /* MANUAL MEANS SOMETHING ELSE PLAYS IT. Two of them are the last morning of a term, which
     the ending screen fires because there is no beat to gate on; the rest are named by a
     docket option and play between the ruling and the room. Neither kind may gate on the
     world, or a raid cutscene turns up on a beat where nothing was raided. */
  const w0 = world();
  const manual = SCN.SCENES.filter((s) => s.manual).map((s) => s.id);
  ok('the endings and the rulings are manual', manual.length >= 8, manual.length + ': ' + manual.join(' '));
  ok('  and the two last mornings are among them',
    manual.indexOf('served') >= 0 && manual.indexOf('removed') >= 0);
  const dead = [];
  const blank = [];
  SCN.SCENES.forEach((sc) => {
    if (sc.manual) {
      /* They never gate; the term ending is the gate. They still have to render. */
      SCN.framesOf(sc, null, w0).forEach((f) => {
        if (/undefined|NaN|\[object|=>/.test(f.say)) blank.push(sc.id + ': ' + f.say.slice(0, 40));
      });
      return;
    }
    if (!setups[sc.id]) { dead.push(sc.id + ' has no setup in this test'); return; }
    const w = world();
    setups[sc.id](w);
    const sit = SIT.build(w, L, sc.id === 'left-out' ? { sim: SEASON } : {});
    if (SCN.eligible(w, L, sit).indexOf(sc) < 0) { dead.push(sc.id + ' never fires'); return; }
    const cast = SCN.castOf(sc, w, L, sit);
    SCN.framesOf(sc, cast, w).forEach((f) => {
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
  /* AND IT OPENS ON THE RIGHT STORY. The first version had the office being invented on the
     morning you took it, which is the wrong premise twice: it makes the sport's problems
     start when you arrive, and it leaves nobody to have failed at them first. Every other
     screen in this mode assumes an office that was already running and a room that is
     already angry, so the intro has to hand over a job rather than create one. Asserted on
     the two things the premise turns on: somebody held it before you, and they did not
     finish. Not on the wording, which is free to change. */
  {
    const said = SCN.saysOf(SCN.BY_ID['take-office']).join(' ').toLowerCase();
    ok('  and somebody held the job before you', /the last one|before you|predecessor/.test(said));
    ok('  and did not finish the term', /did not finish|pushed out|removed/.test(said));
    ok('  rather than the job being invented this morning',
      !/did not exist|nobody has ever held/.test(said));
  }
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

console.log('\n=== a ruling can play out ===');
{
  const D = require(ROOT + '/cfb/commish/docket.js');
  const attached = [];
  D.ITEMS.forEach((it) => (it.options || []).forEach((o) => {
    if (o.scene) attached.push({ item: it.id, opt: o.id, scene: o.scene });
  }));
  ok('rulings that play out', attached.length >= 6, attached.length + ' of them');
  const missing = attached.filter((a) => !SCN.BY_ID[a.scene]);
  ok('  every one names a scene that exists', !missing.length,
    missing.map((a) => a.item + ':' + a.scene).join(' '));
  /* A RULING'S SCENE MUST NOT ALSO FIRE ON ITS OWN, or a player gets the raid cutscene on a
     beat where nothing was raided. */
  const loose = attached.filter((a) => !SCN.BY_ID[a.scene].manual);
  ok('  and none of them gate on the world as well', !loose.length,
    loose.map((a) => a.scene).join(' '));
  /* THE CAST IS THE DOCKET ITEM'S, so every line has to render against the shape that item
     actually produces rather than against the shape the scene hoped for. */
  const E = require(ROOT + '/cfb/engine.js');
  const w = world();
  const sit = SIT.build(w, L, {});
  const holes = [];
  attached.forEach((a) => {
    const it = D.BY_ID[a.item];
    const cast = D.castOf(it, w, L, E.createSeededRNG(3), sit);
    SCN.framesOf(SCN.BY_ID[a.scene], cast, w).forEach((f) => {
      if (/undefined|NaN|\[object|=>/.test(f.say)) holes.push(a.item + ': ' + f.say.slice(0, 46));
    });
  });
  ok('  every line renders against the ruling that plays it', !holes.length,
    holes.slice(0, 3).join(' | '));
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
  /* AND THE SCENE IS ACTUALLY GONE, which is not the same assertion as the office being up.
     `.screen{display:none}` is one class and `#s-scene` is an id, so the scene's own layout
     rule outranked it and the cutscene stayed laid out at the bottom of every other screen
     in the mode. Nothing failed: every walker here checks `.on`, which was correctly off,
     and the only symptom was a chief of staff sitting under the charts in the data center.
     Measured as pixels rather than as a class, because a class was what missed it. */
  ok('  and the scene is not laid out underneath it', await p.evaluate(() => {
    const r = document.getElementById('s-scene').getBoundingClientRect();
    return r.width === 0 && r.height === 0;
  }));
  ok('  on every other screen too', await p.evaluate(async () => {
    const b = document.getElementById('b-data');
    if (b) b.click();
    await new Promise((r) => setTimeout(r, 500));
    const r = document.getElementById('s-scene').getBoundingClientRect();
    const back = document.getElementById('b-dcback');
    if (back) back.click();
    await new Promise((r) => setTimeout(r, 400));
    return r.width === 0 && r.height === 0;
  }));
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

/* THE OPENING HANDS YOU THE PHONE.
   The chief's last lines are "your first call is already holding" and "fair warning, it is a
   lawsuit", and the way out of that used to be a briefing screen with nine cards on it. The
   intro ends on the call now, and the call is the one place this mode explains itself.

   SKIP IS THE OTHER PATH AND IT HAS TO STAY THE OTHER PATH. Somebody pressing Skip on an
   intro has played this before and wants the office; dropping them into a tutorial lawsuit
   would make the button a trap for the only person it is for. Both ways out are walked, on a
   fresh term each time, because "once" means the intro cannot be replayed in this one. */
console.log('\n=== the intro ends on the first case ===');
{
  const fresh = async () => {
    await p.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2200);
    await p.click('#g-start').catch(() => {});
    await p.waitForTimeout(900);
  };

  await fresh();
  ok('a new term opens on the cutscene', await on('s-scene'));
  /* Tap to the last line rather than skipping. */
  await p.evaluate(async () => {
    let taps = 0;
    while (document.getElementById('s-scene').classList.contains('on') && taps < 60) {
      document.getElementById('sc-card').click();
      taps++;
      await new Promise((r) => setTimeout(r, 70));
    }
  });
  await p.waitForTimeout(700);
  ok('watching it out lands on the desk rather than the office', await on('s-desk'));
  ok('  and the case is the first call', /first call/i.test(await p.textContent('#d-eyebrow')),
    (await p.textContent('#d-eyebrow')).trim());
  ok('  which is a lawsuit, as the chief said it would be',
    /suing|lawsuit|filed/i.test(await p.textContent('#d-brief')));
  /* AND THE FOUR THINGS THE SCREEN ASKS OF YOU, which is the whole tutorial: no tour, no
     modal, no flag on the player. It is a property of this one case. */
  const steps = await p.$$eval('#d-teach li', (e) => e.map((x) => x.textContent.trim()));
  ok('the desk says how a decision works', steps.length === 4, steps.length + ' steps');
  ok('  numbered, and each one a sentence',
    steps.every((s, i) => s.indexOf(String(i + 1)) === 0 && s.length > 30),
    (steps[0] || '').slice(0, 50));
  ok('  and it can be ruled on like any other case',
    !!(await p.$('#d-options .opt')) && (await p.$$('#d-options .opt')).length >= 3);
  /* AND IT DOES NOT FOLLOW YOU. The panel belongs to the item, so the next case has none. */
  await p.evaluate(() => window.PS_CFB_COMMISH_TEST.deskItem('gameday-sign'));
  await p.waitForTimeout(500);
  ok('  and no other case is taught', await p.$eval('#d-teach', (e) => e.hidden) === true);

  await fresh();
  ok('a second new term opens on the cutscene again', await on('s-scene'));
  await p.click('#b-scene-skip');
  await p.waitForTimeout(800);
  ok('but skipping it goes to the office, not the lawsuit', await on('s-office'));
  ok('  and the desk did not open behind it', !(await on('s-desk')));
}

console.log('\n=== a ruling plays out and then hands over to the room ===');
{
  /* THE WHOLE POINT OF ATTACHING A SCENE TO A RULING. The room is painted before the scene
     starts and simply not shown, so what has to be true is that the scene comes up, that the
     room is waiting behind it, and that the ruling actually landed on the ledger while
     nobody was looking. A scene that ate the ruling would be the worst bug in the mode. */
  const before = await p.evaluate(() => {
    const T = window.PS_CFB_COMMISH_TEST;
    T.deskItem('playoff-format');
    return T.world().playoff.teams;
  });
  await p.waitForTimeout(600);
  ok('a ruling that plays out is on the desk', await on('s-desk'), 'field was ' + before);
  const picked = await p.evaluate(() => {
    const el = document.querySelector('#d-options .opt[data-o="to16"]');
    if (!el) return false;
    el.click();
    return true;
  });
  ok('  and the option that carries the scene can be taken', picked);
  await p.waitForTimeout(250);
  await p.click('#b-rule');
  await p.waitForTimeout(900);
  ok('ruling opens the scene rather than the room', await on('s-scene'));
  ok('  and the room is not up yet', !(await on('s-room')));
  /* THE LEDGER MOVED BEFORE A WORD WAS SPOKEN. */
  const now = await p.evaluate(() => window.PS_CFB_COMMISH_TEST.world().playoff.teams);
  ok('  but the ruling already landed', now === 16, before + ' to ' + now);
  const line = await p.evaluate(() => document.getElementById('sc-say').textContent);
  /* THE SCENE PLAYS AFTER THE EDIT, so it can read the field it is about rather than being
     handed it. The first version said "The field is bigger teams", because playoff-format has
     no cast and the fallback was a word. */
  ok('  and the scene names the field it just made', /\b16\b/.test(line), line.slice(0, 56));
  const out = await p.evaluate(async () => {
    let taps = 0;
    while (document.getElementById('s-scene').classList.contains('on') && taps < 40) {
      document.getElementById('sc-card').click();
      taps++;
      await new Promise((r) => setTimeout(r, 80));
    }
    return { room: document.getElementById('s-room').classList.contains('on'), taps: taps };
  });
  ok('and when it finishes the room is there', out.room, out.taps + ' taps');
  ok('  with the ruling on it',
    /ruled/i.test(await p.textContent('#r-eyebrow')), (await p.textContent('#r-eyebrow')).trim());
}

ok('nothing threw', errs.length === 0, errs.slice(0, 2).join(' | '));
await b.close();
console.log(bad ? '\n' + bad + ' FAILED\n' : '\nall good\n');
process.exit(bad ? 1 : 0);
