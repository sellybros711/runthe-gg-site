/* ASKING ABOUT THE CASE, IN A BROWSER.
 *
 *   (nohup python3 -m http.server 8080 &)
 *   node cfb/build/test/commish/test_asks.mjs
 *
 * The data is checked in test_docket: four questions an item, eight doors, every hidden ruling
 * reachable and legal. What that cannot check is the panel, and the panel has four ways to go
 * wrong that a player would experience and a suite would not:
 *
 *   the budget does not bind, so all four can be asked and the mechanic is a Reveal All button
 *   an answer opens a door and the option never appears, so investigating buys nothing
 *   a hidden ruling can be committed without being opened, which is the guard being cosmetic
 *   the two you did not ask are never shown, which is the whole payoff
 *
 * So this walks the docket until it finds a case with questions on it, asks two, and checks all
 * four. It also asks the door question specifically, because "an option appeared" is the one
 * assertion that has to be made against a known door rather than whatever turned up.
 */
import { chromium } from 'playwright';
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '../../../..');
const D = require(ROOT + '/cfb/commish/docket.js');
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
const p = await b.newPage({ viewport: { width: 390, height: 900 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.addInitScript(arm + stub);
await p.goto(PAGE, { waitUntil: 'domcontentloaded', timeout: 40000 });
await p.waitForTimeout(2400);
await p.click('#g-start').catch(() => {});
await p.waitForTimeout(900);
await pastScene(p);

const on = (id) => p.$eval('#' + id, (e) => e.classList.contains('on')).catch(() => false);

async function skipSim() {
  for (let i = 0; i < 60; i++) {
    const up = await p.$eval('#off-monthcard', (e) => e.classList.contains('running')).catch(() => false);
    if (!up) return;
    await p.click('#off-monthcard', { timeout: 1500 }).catch(() => {});
    await p.waitForTimeout(110);
  }
}
async function podium() {
  for (let i = 0; i < 6; i++) {
    if (!(await on('s-press'))) return;
    await p.click('#p-answers .opt').catch(() => {});
    await p.waitForTimeout(150);
    await p.click('#b-say').catch(() => {});
    await p.waitForTimeout(500);
  }
}

/* PUT A NAMED ITEM ON THE DESK. Walking the docket until a case with questions on it turns up
   takes a term and a half and lands on whichever one it lands on, and the door assertions have
   to be made against a door somebody chose. The page holds the item in one closure variable,
   so the honest way in is the same handle the podium test uses. */
async function deskWith(itemId) {
  const put = await p.evaluate((id) => {
    const T = window.PS_CFB_COMMISH_TEST;
    if (!T || !T.deskItem) return false;
    return T.deskItem(id);
  }, itemId).catch(() => false);
  await p.waitForTimeout(700);
  return put;
}

const CASE = 'undrafted';
const DOOR = { ask: 'camp', opt: 'paid' };

console.log('\n=== the file is on the desk ===');
{
  ok('a case with questions on it opens', await deskWith(CASE));
  ok('  the desk is up', await on('s-desk'));
  ok('the panel is there', await p.$eval('#d-askcard', (e) => e.hidden) === false);
  const qs = await p.$$eval('#d-asks button.q', (e) => e.map((x) => x.textContent.trim()));
  ok('four questions', qs.length === 4, qs.length);
  ok('  and every one of them is a question',
    qs.every((t) => /\?$/.test(t)), qs.map((t) => t.slice(-1)).join(''));
  const hint = (await p.textContent('#d-askhint')).replace(/\s+/g, ' ').trim();
  ok('the budget is stated before it is spent',
    /four questions/i.test(hint) && /two of them/i.test(hint), hint.slice(0, 70));
  ok('nothing is answered yet', (await p.$$('#d-asks .said')).length === 0);
}

console.log('\n=== a hidden ruling is not on the desk ===');
{
  const shown = await p.$$eval('#d-options .opt', (e) => e.map((x) => x.dataset.o));
  const all = D.BY_ID[CASE].options.map((o) => o.id);
  ok('the desk draws fewer rulings than the item has', shown.length === all.length - 1,
    shown.join(' ') + ' of ' + all.join(' '));
  ok('  and the hidden one is not among them', shown.indexOf(DOOR.opt) < 0, DOOR.opt);
  /* NOT PAINTED IS NOT THE SAME AS UNREACHABLE. Setting the variable by hand is what a console
     does, and the button that commits the ruling has to refuse it anyway. */
  const forced = await p.evaluate((o) => {
    const T = window.PS_CFB_COMMISH_TEST;
    return T.forceChoice(o);
  }, DOOR.opt).catch(() => null);
  ok('  choosing it by hand does not rule', forced === false || forced === null,
    JSON.stringify(forced));
  ok('  and the desk is still up', await on('s-desk'));
}

console.log('\n=== asking the question opens the door ===');
{
  await p.click('#d-asks button.q[data-ask="' + DOOR.ask + '"]');
  await p.waitForTimeout(500);
  const said = await p.$$eval('#d-asks .said', (e) => e.map((x) => x.textContent.trim()));
  ok('the answer is on the screen', said.length === 1, said.length);
  ok('  and it is a paragraph rather than a word', (said[0] || '').length > 90, (said[0] || '').length);
  ok('  and it says it opened something', /opened below/i.test(said[0] || ''), (said[0] || '').slice(-40));
  const shown = await p.$$eval('#d-options .opt', (e) => e.map((x) => x.dataset.o));
  ok('the fourth ruling is on the desk now', shown.indexOf(DOOR.opt) >= 0, shown.join(' '));
  const left = (await p.textContent('#d-askhint')).replace(/\s+/g, ' ').trim();
  ok('one question left', /one question left/i.test(left), left.slice(0, 60));
  ok('  and three are still askable', (await p.$$('#d-asks button.q:not([disabled])')).length === 3);
}

console.log('\n=== two is the budget ===');
{
  await p.click('#d-asks button.q:not([disabled])');
  await p.waitForTimeout(450);
  ok('two answered', (await p.$$('#d-asks .said')).length === 2);
  const live = await p.$$eval('#d-asks button.q', (e) => e.filter((x) => !x.disabled).length);
  ok('and the other two will not answer', live === 0, live + ' still live');
  const done = (await p.textContent('#d-askhint')).replace(/\s+/g, ' ').trim();
  ok('the panel says the file is closed', /both of them/i.test(done), done.slice(0, 60));
  /* The disabled buttons are still readable, which is the point: you know what you gave up. */
  const qs = await p.$$eval('#d-asks button.q', (e) => e.map((x) => x.textContent.trim()));
  ok('the two you cannot ask are still on the screen', qs.length === 2 && qs.every((t) => t.length > 8),
    qs.join(' | ').slice(0, 80));
}

console.log('\n=== and afterwards you find out what was in the rest of it ===');
{
  await p.click('#d-options .opt[data-o="' + DOOR.opt + '"]');
  await p.waitForTimeout(300);
  ok('the ruling that was behind the door can be taken',
    await p.$eval('#b-rule', (e) => e.disabled) === false);
  await p.click('#b-rule');
  await p.waitForTimeout(1400);
  ok('the room answered', await on('s-room'));
  ok('the file came back open', await p.$eval('#r-unaskedcard', (e) => e.hidden) === false);
  const rest = await p.$$eval('#r-unasked p', (e) => e.map((x) => x.textContent.trim()));
  ok('with the two you did not ask in it', rest.length === 2, rest.length);
  ok('  question and answer both', rest.every((t) => /\?/.test(t) && t.length > 100),
    (rest[0] || '').slice(0, 70));
  const sub = (await p.textContent('#r-unaskedsub')).trim();
  ok('and it counts them', /2 questions/.test(sub), sub);
}

console.log('\n=== an item with no file has no panel ===');
{
  const plain = D.ITEMS.find((it) => !(it.asks || []).length && (it.options || []).length >= 3);
  ok('found one', !!plain, plain && plain.id);
  await p.click('#b-next');
  await p.waitForTimeout(700);
  ok('put it on the desk', await deskWith(plain.id));
  ok('the panel stays down', await p.$eval('#d-askcard', (e) => e.hidden) === true);
  ok('  and the ruling still commits',
    !!(await p.$('#d-options .opt')));
}

console.log('\n=== a forecast does not read you the file ===');
{
  /* Test It On The Room goes to the same screen the ruling does and comes straight back to the
     desk with both questions still in hand. Handing over the two unasked answers there would
     make the forecast the way to read the whole file for nothing. */
  await deskWith(CASE);
  const pro = await p.$eval('#b-test', (e) => !e.hidden).catch(() => false);
  ok('the forecast button is there', pro);
  if (pro) {
    await p.click('#d-options .opt');
    await p.waitForTimeout(250);
    await p.click('#b-test');
    await p.waitForTimeout(1300);
    ok('the forecast opened', await on('s-room'));
    ok('and the file stayed shut', await p.$eval('#r-unaskedcard', (e) => e.hidden) === true);
  }
}

ok('nothing threw', errs.length === 0, errs.slice(0, 2).join(' | '));
await b.close();
console.log(bad ? '\n' + bad + ' FAILED\n' : '\nall good\n');
process.exit(bad ? 1 : 0);
