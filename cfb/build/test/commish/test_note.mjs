/* THE ROOM READS WHAT YOU WROTE, AND ONLY IN ONE DIRECTION.
 *
 *   (nohup python3 -m http.server 8080 &)
 *   node cfb/build/test/commish/test_note.mjs
 *
 * The note graduated from record to power: a group whose grievance the paid tier answers
 * in writing takes the ruling better. The ways this can quietly go wrong are all worse
 * than not having the feature:
 *
 *   a note could DELIGHT instead of soften, and the best strategy becomes flattery
 *   a magic word could work every time, and the box becomes a cheat code with a hint text
 *   the forecast could read the note differently than the ruling, and the preview lies,
 *     which is the one thing the mode has promised it can never do
 *   the free tier could be read too, and the paid feature is a label
 *
 * So the headless half pins the reading rules and the arithmetic, and the browser half
 * pins the page's one shared path plus the tier gate, against the same hooks the other
 * guards use.
 */
import { createRequire } from 'module';
import path from 'path';
import { chromium } from 'playwright';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '../../../..');
const L = require(ROOT + '/cfb/commish/ledger.js');
const B = require(ROOT + '/cfb/commish/blocs.js');
const N = require(ROOT + '/cfb/commish/note.js');

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };

const world = () => L.createWorld({ year: 2025 });
/* A ruling that tramples tradition, pleases the networks, and aims an extra shove at the
   fans: enough shape to exercise aimed grievances and both signs at once. */
const EDIT = { effects: { tradition: -3, money: 2, inventory: 2 }, aimed: { Fans: { tradition: -1.5 } } };

console.log('\n=== reading: what a note is about ===');
{
  const r = N.read('The rivalries and the bowls are protected by name in the annex.');
  ok('plain words find their force', r.forces.length === 1 && r.forces[0] === 'tradition',
    r.forces.join(' '));
  ok('  and a careful note is not diffuse', !r.diffuse && !r.short);
  ok('naming a group is heard', N.read('The fans keep their Saturday and I will say so on camera.')
    .groups.indexOf('Fans') >= 0);
  /* WORD BOUNDARIES, because "according" contains "acc" and a note about accordance is not
     a note about the coast. */
  ok('a word inside a word is not a match', N.read('According to the accord, nothing changes for anybody here.')
    .groups.indexOf('ACC') < 0);
  ok('a note under twenty characters is not read', N.read('tradition').short);
  ok('three concerns at once is diffuse', N.read('The money, the schedule and the players all point one way.')
    .diffuse);
  /* THE PASTE TEST. Somebody will put the whole vocabulary in the box, and the answer has
     to be nothing. */
  const paste = Object.keys(N.VOCAB).map((f) => N.VOCAB[f][0]).join(' ');
  ok('  pasting the whole vocabulary answers nobody', N.read(paste).diffuse);
}

console.log('\n=== the grievance is the room\'s own arithmetic, read backwards ===');
{
  ok('the fans\' grievance with this ruling is tradition',
    N.grievanceOf('Fans', EDIT) === 'tradition', N.grievanceOf('Fans', EDIT));
  ok('  found through the aimed shove too',
    N.grievanceOf('Fans', { effects: {}, aimed: { Fans: { tradition: -2 } } }) === 'tradition');
  /* A NET-PLEASED GROUP CAN STILL HAVE A SORE POINT: the networks take this deal for the
     inventory and grumble about the tradition, which is true of rooms. What has to be null
     is the grievance of a group nothing pushed against at all. */
  ok('  a group with a sore point has it even inside a win',
    N.grievanceOf('Networks', EDIT) === 'tradition', String(N.grievanceOf('Networks', EDIT)));
  ok('  and a group nothing pushed against has none',
    N.grievanceOf('SEC', { effects: { money: 2 } }) === null,
    String(N.grievanceOf('SEC', { effects: { money: 2 } })));
}

console.log('\n=== softened, never delighted, and capped ===');
{
  const w = world();
  const rows = B.react(w, EDIT);
  const fansRaw = rows.find((r) => r.id === 'Fans').delta;
  const t = N.temper('The rivalries and the bowls are protected by name in the annex.', rows, EDIT);
  ok('the note answers the group whose grievance it speaks to',
    t.any && t.read.indexOf('Fans') >= 0, t.read.join(' '));
  ok('  by at most the cap', t.soften.Fans <= N.SOFTEN_MAX + 1e-9, t.soften.Fans);
  ok('  and at most a fraction of the anger',
    t.soften.Fans <= Math.abs(fansRaw) * N.SOFTEN_FRAC + 0.05, t.soften.Fans + ' of ' + fansRaw);
  const after = B.react(w, EDIT, t.soften);
  const fans = after.find((r) => r.id === 'Fans');
  ok('the softened reaction is smaller and still a loss',
    fans.delta > fansRaw && fans.delta < 0, fansRaw + ' to ' + fans.delta);
  ok('  and the row says it read the note', fans.read === true);
  const nets = after.find((r) => r.id === 'Networks');
  ok('a pleased group is untouched', nets.delta === rows.find((r) => r.id === 'Networks').delta
    && !nets.read);
  /* ONE-DIRECTIONAL AT BOTH LAYERS. Even a soften map aimed at a positive delta, which
     note.js never builds, does nothing in blocs.js: flattery is structurally impossible
     rather than merely unimplemented. */
  const forced = B.react(w, EDIT, { Networks: 5 });
  ok('  even a hand-built soften map cannot delight anybody',
    forced.find((r) => r.id === 'Networks').delta === nets.delta);
  /* AND NEVER PAST ZERO: a huge soften on a small anger stops at nothing-happened. */
  const over = B.react(w, EDIT, { Fans: 99 });
  ok('  and a soften never flips a loss into a win',
    over.find((r) => r.id === 'Fans').delta === 0, String(over.find((r) => r.id === 'Fans').delta));
  /* A shrug is not answered. Below the floor there is nothing to soften. */
  const mild = B.react(w, { effects: { tradition: -0.1 } });
  const t2 = N.temper('The rivalries and the bowls are protected by name in the annex.', mild,
    { effects: { tradition: -0.1 } });
  ok('a group that barely moved is not on the read list', t2.read.indexOf('Fans') < 0,
    JSON.stringify(t2.soften));
}

console.log('\n=== deterministic, so the forecast is the ruling ===');
{
  const w = world();
  const rows = B.react(w, EDIT);
  const note = 'The fans keep their rivalries. The networks keep their windows.';
  const a = N.temper(note, rows, EDIT);
  const b = N.temper(note, rows, EDIT);
  ok('the same words read the same twice', JSON.stringify(a) === JSON.stringify(b));
  const r1 = B.react(w, EDIT, a.soften);
  const r2 = B.react(w, EDIT, b.soften);
  ok('  and the same soften reacts the same twice', JSON.stringify(r1) === JSON.stringify(r2));
}

console.log('\n=== the page: one path, and the tier gate ===');
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
async function pastScene(pg) {
  for (let i = 0; i < 6; i++) {
    const up = await pg.$eval('#s-scene', (e) => e.classList.contains('on')).catch(() => false);
    if (!up) return;
    await pg.click('#b-scene-skip').catch(() => {});
    await pg.waitForTimeout(320);
  }
}
const bro = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const URL = 'http://localhost:8080/cfb/commish/index.html';
{
  const p = await bro.newPage({ viewport: { width: 390, height: 900 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(arm + stub);
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await p.waitForTimeout(2600);
  await p.click('#g-start'); await p.waitForTimeout(700);
  await pastScene(p);
  /* THE PAGE'S OWN PATH, against the same synthetic ruling the headless half used, so what
     is asserted here is the wiring rather than the arithmetic twice. */
  const got = await p.evaluate((EDIT) => {
    const T = window.PS_CFB_COMMISH_TEST;
    T.setNote('The rivalries and the bowls are protected by name in the annex.');
    const ans = T.roomAnswer(EDIT);
    T.setNote('');
    const bare = T.roomAnswer(EDIT);
    return {
      read: ans.read && ans.read.read,
      fans: ans.rows.find((r) => r.id === 'Fans').delta,
      fansBare: bare.rows.find((r) => r.id === 'Fans').delta,
      deltasMatchRows: ans.rows.every((r) => ans.deltas[r.id] === r.delta),
    };
  }, EDIT);
  ok('the page reads the note on the shared path', (got.read || []).indexOf('Fans') >= 0,
    JSON.stringify(got.read));
  ok('  and the fans take it better than without it', got.fans > got.fansBare,
    got.fansBare + ' to ' + got.fans);
  ok('  and the deltas the ledger gets are the rows the screen draws', got.deltasMatchRows);

  /* THE WHOLE SCREEN, ONCE: a real case, a note, a ruling, and the room saying what it did
     with the words. Which groups soften depends on the case, so the assertion is that the
     screen SPEAKS, not who it names. */
  await p.evaluate(() => {
    const T = window.PS_CFB_COMMISH_TEST;
    T.repaint();
    T.deskItem('playoff-format');
    T.setNote('The rivalries and the bowls are protected by name in the annex.');
  });
  await p.waitForTimeout(600);
  /* forceChoice's return is read before a ruling scene finishes, and to16 carries one, so
     the arrival is asserted after the skip rather than off the return value. */
  await p.evaluate(() => { window.PS_CFB_COMMISH_TEST.forceChoice('to16'); });
  await p.waitForTimeout(900);
  await pastScene(p);
  const room = await p.evaluate(() => ({
    up: document.getElementById('s-room').classList.contains('on'),
    note: { hidden: document.getElementById('r-note').hidden,
      text: document.getElementById('r-note').textContent },
    marks: document.querySelectorAll('#r-room .noted').length,
  }));
  ok('a ruling with a note reaches the room', room.up);
  ok('  and the screen says what the room did with the words',
    room.note.hidden === false && /note/i.test(room.note.text), room.note.text.slice(0, 90));
  console.log('  errors:', errs.length ? errs : 'none');
  if (errs.length) bad++;
  await p.close();
}
{
  /* THE TIER GATE. The free desk has no box, and even a note smuggled in through the hook
     is not read: the gate is in the path, not in the textarea. */
  const p = await bro.newPage({ viewport: { width: 390, height: 900 } });
  await p.addInitScript(arm + stub);
  await p.goto(URL + '?tier=free', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await p.waitForTimeout(2600);
  await p.click('#g-start'); await p.waitForTimeout(700);
  await pastScene(p);
  const free = await p.evaluate((EDIT) => {
    const T = window.PS_CFB_COMMISH_TEST;
    T.setNote('The rivalries and the bowls are protected by name in the annex.');
    const ans = T.roomAnswer(EDIT);
    return { read: ans.read, fans: ans.rows.find((r) => r.id === 'Fans').delta };
  }, EDIT);
  ok('the free tier\'s words are not read', free.read === null, JSON.stringify(free.read));
  await p.close();
}
await bro.close();

console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
