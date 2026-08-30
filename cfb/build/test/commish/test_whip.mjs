/* THE ONE THING THIS MODE CAN DO TO YOU, DRAWN.
 *
 *   (nohup python3 -m http.server 8080 &)
 *   node cfb/build/test/commish/test_whip.mjs
 *
 * A term ends two ways and both of them are arithmetic on vote weight: more than half the
 * room turns, or the two that hold the inventory both turn whatever the rest does. That was
 * nine rows of a name, a bar and a number, and the player was being asked to add 2 + 2 + 1.5
 * in their head and compare it to 4 every time they ruled on anything.
 *
 * THE STRIP IS ONLY WORTH ANYTHING IF IT AGREES WITH THE RULE. It is a second implementation
 * of removal(), in CSS, and the way that fails is quietly: the bar says Holding, the ledger
 * says removed, and the player finds out on the screen that ends their term. So every
 * assertion below is the strip against ledger.removal() on the same world, walked through
 * every state the rule has.
 *
 * AND ONE THING THE LEDGER CANNOT CHECK, which is that the segments are sorted by mood. That
 * is the whole reason it reads at a glance: red grows from the left, the gold line does not
 * move, and "am I still in this job" is whether one has reached the other. Sorted by name it
 * would be six correct numbers arranged so that nobody can add them up.
 */
import { chromium } from 'playwright';
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '../../../..');
const L = require(ROOT + '/cfb/commish/ledger.js');
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


/* A CUTSCENE CAN TAKE THE SCREEN THE MOMENT A TERM STARTS, and one that a walker does not
   know about is a walker that stalls on the one screen with no dock. Skip it: the scenes have
   their own suite in test_scene, and every other file here is testing something behind them.
   Called after anything that could arrive at the office. */
async function pastScene(pg) {
  for (let i = 0; i < 6; i++) {
    const up = await pg.$eval('#s-scene', (e) => e.classList.contains('on')).catch(() => false);
    if (!up) return;
    await pg.click('#b-scene-skip').catch(() => {});
    await pg.waitForTimeout(320);
  }
}

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.addInitScript(arm + stub);
await p.goto(PAGE, { waitUntil: 'domcontentloaded', timeout: 40000 });
await p.waitForTimeout(2400);
await p.click('#g-start').catch(() => {});
await p.waitForTimeout(1000);
await pastScene(p);

/* Set the room and read the strip back, as pixels rather than as the numbers that drew it:
   what is being checked is what a player sees. */
async function strip(moods) {
  return p.evaluate((m) => {
    const T = window.PS_CFB_COMMISH_TEST, LD = window.PS_CFB_LEDGER;
    const w = T.world();
    Object.keys(m || {}).forEach((k) => { w.blocs[k] = m[k]; });
    w.meters.standing = LD.standingFrom(w.blocs);
    T.repaint();
    const el = document.getElementById('off-whip');
    const segs = [...el.querySelectorAll('.seg')].map((s) => ({
      id: s.title.split(',')[0],
      against: s.classList.contains('against'),
      big: s.classList.contains('big'),
      w: s.getBoundingClientRect().width,
    }));
    const cut = el.querySelector('.cut').getBoundingClientRect();
    const track = el.querySelector('.track').getBoundingClientRect();
    return {
      cls: el.className,
      state: el.querySelector('.state').textContent.trim(),
      foot: el.querySelector('.foot').innerText.replace(/\s+/g, ' ').trim(),
      moved: (el.querySelector('.moved') || {}).textContent || null,
      segs: segs,
      /* Where the red run ends and where the line is, in the same coordinates. */
      redEnd: segs.filter((s) => s.against).reduce((t, s) => t + s.w, 0),
      cutAt: cut.left - track.left,
      trackW: track.width,
      /* And what the ledger says about the same world, so the two can be compared. */
      truth: LD.removal(w),
      hostile: LD.hostileWeight(w),
    };
  }, moods || {});
}

console.log('\n=== the strip is the rule, drawn ===');
{
  const safe = await strip({});
  ok('a room nobody has fallen out with reads as holding',
    /holding/i.test(safe.state) && safe.cls.indexOf('safe') >= 0, safe.state);
  ok('  nobody is against you', safe.segs.every((s) => !s.against), safe.foot);
  ok('  and only the blocs that hold a vote are on it',
    safe.segs.length === Object.keys(L.VOTE_WEIGHT).length,
    safe.segs.map((s) => s.id).join(' '));
  ok('  the two that can end you are marked',
    safe.segs.filter((s) => s.big).map((s) => s.id).sort().join(' ') === 'Big Ten SEC',
    safe.segs.filter((s) => s.big).map((s) => s.id).join(' '));
  /* THE LINE IS AT HALF AND DOES NOT MOVE. Everything else on the strip is read against it. */
  ok('the line sits at half the weight',
    Math.abs(safe.cutAt - safe.trackW / 2) < 2, safe.cutAt.toFixed(1) + ' of ' + safe.trackW.toFixed(1));
  /* AND THE WIDTHS ARE THE VOTE WEIGHTS. A strip whose segments are equal sized is six
     conferences with one vote each, which is not this sport. */
  const sec = safe.segs.find((s) => s.id === 'SEC');
  const g5 = safe.segs.find((s) => s.id === 'Group of Five');
  ok('  and a segment is as wide as its vote is worth',
    Math.abs(sec.w / g5.w - L.VOTE_WEIGHT.SEC / L.VOTE_WEIGHT['Group of Five']) < 0.25,
    (sec.w / g5.w).toFixed(2) + ' vs ' + (L.VOTE_WEIGHT.SEC / L.VOTE_WEIGHT['Group of Five']));
}

console.log('\n=== against you on the left, and it grows toward the line ===');
{
  const some = await strip({ 'Big 12': 18, 'Group of Five': 12 });
  const ids = some.segs.map((s) => s.against);
  /* Sorted by mood: every hostile segment before every friendly one. */
  ok('the hostile ones are all to the left of the friendly ones',
    ids.indexOf(false) < 0 || ids.lastIndexOf(true) < ids.indexOf(false),
    some.segs.map((s) => (s.against ? '-' : '+') + s.id).join(' '));
  ok('  and the red has not reached the line',
    some.redEnd < some.cutAt, some.redEnd.toFixed(0) + ' vs ' + some.cutAt.toFixed(0));
  ok('  the count matches the ledger',
    some.foot.indexOf(some.hostile.toFixed(1)) === 0, some.foot);
  ok('  and it still says you have the job', !some.truth.removed && /holding/i.test(some.state),
    some.state);
}

console.log('\n=== every state the rule has, and the strip agrees with it ===');
{
  const cases = [
    { name: 'half the room, which survives', moods: { 'Big 12': 18, 'Group of Five': 12,
      Presidents: 15, ACC: 20 } },
    { name: 'past half, which does not', moods: { 'Big 12': 18, 'Group of Five': 12,
      Presidents: 15, ACC: 20, 'Big Ten': 16 } },
    { name: 'the two on their own', moods: { SEC: 14, 'Big Ten': 16, 'Big 12': 60,
      'Group of Five': 60, Presidents: 60, ACC: 60 } },
    { name: 'everybody back over the line', moods: { SEC: 55, 'Big Ten': 55, 'Big 12': 55,
      'Group of Five': 55, Presidents: 55, ACC: 55 } },
  ];
  for (const c of cases) {
    const r = await strip(c.moods);
    const saysGone = /removed/i.test(r.state);
    ok('  ' + c.name, saysGone === !!r.truth.removed,
      r.state + ' vs ledger ' + (r.truth.removed ? r.truth.reason : 'safe'));
    /* AND THE RED CROSSES THE LINE EXACTLY WHEN THE COUNT DOES. The one case where it must
       not is the two on their own: they are removed on a different rule and the count is
       low, so the bar is honest about being short and the words carry the reason. */
    if (r.truth.removed && r.truth.reason === 'vote') {
      ok('    the red is past the line', r.redEnd > r.cutAt,
        r.redEnd.toFixed(0) + ' vs ' + r.cutAt.toFixed(0));
    }
    if (r.truth.removed && r.truth.reason === 'coalition') {
      ok('    and the second rule is said in words rather than drawn',
        /both of the two/i.test(r.foot), r.foot);
    }
  }
}

console.log('\n=== a bloc crossing the line is the news ===');
{
  /* The strip on the reaction screen takes the world one ruling ago, so somebody going under
     twenty five can be named. It is the failure condition arriving one step closer and it
     used to be a number changing colour in a list of nine. */
  const said = await p.evaluate(() => {
    const T = window.PS_CFB_COMMISH_TEST, LD = window.PS_CFB_LEDGER;
    const w = T.world();
    Object.keys(w.blocs).forEach((k) => { w.blocs[k] = 55; });
    const before = JSON.parse(JSON.stringify(w));
    w.blocs.ACC = 18;
    w.meters.standing = LD.standingFrom(w.blocs);
    const el = document.getElementById('off-whip');
    window.PS_CFB_COMMISH_TEST.whip(el, w, before);
    return {
      out: (el.querySelector('.moved') || {}).textContent || '',
      none: (function () {
        window.PS_CFB_COMMISH_TEST.whip(el, w, w);
        return (el.querySelector('.moved') || {}).textContent || '';
      })(),
    };
  });
  ok('it names who crossed', /ACC/.test(said.out) && /against you/i.test(said.out), said.out);
  ok('  and says nothing when nobody did', said.none === '', said.none);
}

ok('nothing threw', errs.length === 0, errs.slice(0, 2).join(' | '));
await b.close();
console.log(bad ? '\n' + bad + ' FAILED\n' : '\nall good\n');
process.exit(bad ? 1 : 0);
