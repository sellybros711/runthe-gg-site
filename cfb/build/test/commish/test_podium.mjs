/* MEDIA DAYS, IN A BROWSER.
 *
 *   (nohup python3 -m http.server 8080 &)
 *   node cfb/build/test/commish/test_podium.mjs
 *
 * media.js is checked headlessly in test_media.mjs: the questions, the gates, the promises and
 * the rule that words move the room and nothing else. What cannot be checked there is the
 * screen, and the screen is where this feature can fail in the ways nobody notices:
 *
 *   the podium never appears, because the dock still says "See what is on the desk"
 *   it appears and never ends, because the third answer loops back to the first question
 *   it ends and the beat is stuck, because "Back to the office" goes nowhere
 *   it moves the meters, which is the one thing the design says it must not do
 *
 * All four are silent. The first three leave a playable mode with a missing feature; the
 * fourth leaves a mode where the fastest way to run the sport is to talk about it. So this
 * walks a whole July: from the office to the lectern, three answers, the room, and back out to
 * a desk that still has an item on it.
 *
 * IT ALSO READS THE NUMBERS ON THE WAY PAST. Revenue and health have to be untouched and
 * standing has to have moved, which is the design rule stated as an assertion rather than as a
 * comment in a file nobody opens.
 */
import { chromium } from 'playwright';
import path from 'path';
const ROOT = path.resolve(import.meta.dirname, '../../../..');
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

/* The calendar walks the days of a beat before anything lands. Tapping it skips to the end. */
async function skipSim() {
  for (let i = 0; i < 60; i++) {
    const up = await p.$eval('#off-monthcard', (e) => e.classList.contains('running')).catch(() => false);
    if (!up) return;
    await p.click('#off-monthcard', { timeout: 1500 }).catch(() => {});
    await p.waitForTimeout(110);
  }
}

/* PUT THE TERM ON MEDIA DAYS WITHOUT PLAYING THREE BEATS OF IT. The world is plain data and
   the page holds it in one variable, so the fastest honest way to stand at a lectern is to set
   the beat and repaint the office. Everything after this line is the real flow. */
async function toMediaDays(year) {
  const moved = await p.evaluate((y) => {
    const T = window.PS_CFB_COMMISH_TEST;
    if (!T) return false;
    T.jump(3, y || 0);
    return true;
  }, year || 0).catch(() => false);
  await p.waitForTimeout(600);
  return moved;
}

console.log('\n=== the dock becomes a lectern ===');
{
  ok('the office is up', await on('s-office'));
  const before = await p.textContent('#b-desk');
  await toMediaDays();
  const label = (await p.textContent('#b-desk')).trim();
  ok('at media days the way forward is the podium', /podium/i.test(label), label);
  ok('  ...and it is not what it says the rest of the year', label !== before.trim(), before.trim());
  await p.click('#b-desk');
  await p.waitForTimeout(800);
  ok('pressing it opens the podium and not the desk', await on('s-press'));
  ok('  ...and the desk did not open behind it', !(await on('s-desk')));
}

console.log('\n=== somebody asks you something ===');
{
  const who = (await p.textContent('#p-who')).replace(/\s+/g, ' ').trim();
  const ask = (await p.textContent('#p-ask')).replace(/\s+/g, ' ').trim();
  ok('there is a person asking', who.length > 12, who.slice(0, 70));
  /* LENGTH AND A FULL STOP, not a question mark. Seven of the twenty eight are put as
     statements, which is how a reporter asks the hard ones: "I am not accusing you of
     anything, I am asking you to hear how it sounds" is a question and has no question mark
     in it. The shape of the whole set is checked in test_media instead. */
  ok('and a question long enough to be one', ask.length > 80 && /[.?]$/.test(ask), ask.slice(0, 80));
  ok('nothing rendered as source or as undefined',
    !/undefined|=>|\[object/.test(who + ask));
  const answers = await p.$$eval('#p-answers .opt', (e) => e.map((x) => ({
    label: (x.querySelector('b') || {}).textContent || '',
    body: (x.querySelector('.why') || {}).textContent || '',
    clipped: getComputedStyle(x.querySelector('.why')).webkitLineClamp,
  })));
  ok('three answers', answers.length === 3, answers.length);
  ok('every one of them is readable without opening anything',
    answers.every((a) => a.body.length > 40 && a.clipped !== '1'),
    JSON.stringify(answers.map((a) => a.clipped)));
  /* THE ABSENCE OF A FORECAST IS THE DESIGN, so the absence has to be said out loud. */
  const hint = (await p.textContent('#p-hint')).trim();
  ok('the screen says there is no forecast', /forecast/i.test(hint), hint);
  ok('and there is no forecast button on it', !(await p.$('#s-press #b-test')));
  ok('the dock will not fire until an answer is chosen',
    await p.$eval('#b-say', (e) => e.disabled) === true);
  /* Nothing runs off the side of a 390px phone. */
  const wide = await p.$$eval('#s-press *', (els) => els.filter((e) => e.scrollWidth > e.clientWidth + 2
    && getComputedStyle(e).overflowX !== 'auto').length);
  ok('nothing overflows the phone', wide === 0, wide);
}

console.log('\n=== three questions, and then it stops ===');
{
  const asked = [];
  const dots = [];
  for (let i = 0; i < 4; i++) {
    if (!(await on('s-press'))) break;
    asked.push((await p.textContent('#p-ask')).replace(/\s+/g, ' ').trim().slice(0, 60));
    dots.push((await p.textContent('#p-dots')).replace(/\s+/g, ' ').trim());
    await p.click('#p-answers .opt:nth-child(' + ((i % 3) + 1) + ')');
    await p.waitForTimeout(220);
    ok('  answer ' + (i + 1) + ' arms the dock',
      await p.$eval('#b-say', (e) => e.disabled) === false);
    await p.click('#b-say');
    await p.waitForTimeout(700);
  }
  ok('it asked three questions and stopped', asked.length === 3, asked.length);
  ok('and they were three different ones', new Set(asked).size === asked.length);
  ok('the counter counted', dots.join(' | '), dots.join(' | '));
  ok('the room answered', await on('s-room'));
  ok('the headline says what happened',
    /took questions/i.test(await p.textContent('#r-eyebrow')),
    (await p.textContent('#r-eyebrow')).trim());
  const rows = await p.$$eval('#r-room .brow, #r-room > *', (e) => e.length);
  ok('all nine blocs replied', rows >= 9, rows);
  const wire = await p.$$eval('#r-wire p', (e) => e.map((x) => x.textContent.trim()));
  ok('three lines got written', wire.length === 3, wire.length);
  ok('  ...and they read like a wire report',
    wire.every((t) => t.length > 25 && !/undefined/.test(t)), wire[0] || '');
  /* THE THINGS A RULING HAS AND A PRESS CONFERENCE DOES NOT. */
  for (const id of ['r-tail', 'r-split', 'r-changed', 'r-rebutcard', 'r-feed']) {
    ok('  ' + id + ' stays down', await p.$eval('#' + id, (e) => e.hidden) === true);
  }
}

console.log('\n=== words moved the room and nothing else ===');
{
  const m = await p.evaluate(() => {
    const w = window.PS_CFB_COMMISH_TEST.world();
    return {
      rev: w.meters.revenue, health: w.meters.health, standing: w.meters.standing,
      press: w.press ? w.press[String(w.year)] : null,
      ruled: w.history.filter((h) => window.PS_CFB_LEDGER.isRuling(h)).length,
      rows: w.history.length,
      threads: (w.threads || []).map((t) => t.id),
    };
  }).catch(() => null);
  ok('the world knows the conference happened',
    !!(m && m.press && (m.press.said || []).length === 3), m && m.press ? (m.press.said || []).length : 'no record');
  ok('a row went on the record', m.rows >= 1, m.rows);
  ok('and it does not count as a ruling', m.ruled === 0, m.ruled);
  /* Read from the page itself rather than recomputed, because the assertion is about what the
     player is looking at. */
  const shown = await p.$$eval('#r-meters .meter', (e) => e.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  ok('the meter row is drawn', shown.length >= 3, shown.length);
  ok('revenue did not move', Math.abs(m.rev - 55) < 0.001, m.rev);
  ok('health did not move', Math.abs(m.health - 62) < 0.001, m.health);
  ok('standing did', Math.abs(m.standing - 60) > 0.2, m.standing);
}

console.log('\n=== and the beat carries on ===');
{
  const label = (await p.textContent('#b-next')).trim();
  ok('the way out names where it goes', /office/i.test(label), label);
  await p.click('#b-next');
  await p.waitForTimeout(800);
  await pastScene(p);
  ok('the office is back', await on('s-office'));
  const said = await p.$$eval('#off-said div', (e) => e.map((x) => x.textContent.trim()));
  ok('the office remembers what you said', said.length === 3, said.length);
  ok('  ...and the card is visible', await p.$eval('#off-saidcard', (e) => e.hidden) === false);
  const dock = (await p.textContent('#b-desk')).trim();
  ok('the dock has gone back to the desk', !/podium/i.test(dock), dock);
  await p.click('#b-desk');
  await skipSim();
  await p.waitForTimeout(1200);
  ok('and there is still an item on it', await on('s-desk'));
}

console.log('\n=== next July is a different July ===');
{
  /* Straight to the following media days. The set is stored per year, so the second one has to
     build its own rather than resume the first, and it must not ask the same three. */
  const yearNow = () => p.evaluate(() => window.PS_CFB_COMMISH_TEST.world().year);
  const pressQs = () => p.evaluate(() => {
    const w = window.PS_CFB_COMMISH_TEST.world();
    return ((w.press || {})[String(w.year)] || {}).qs || [];
  });
  const first = await pressQs();
  await toMediaDays((await yearNow()) + 1);
  await p.click('#b-desk');
  await p.waitForTimeout(800);
  ok('the podium opens again a year later', await on('s-press'));
  const second = await pressQs();
  ok('with its own set of questions', second.length === 3, second.join(' '));
  const overlap = second.filter((id) => first.indexOf(id) >= 0);
  ok('and not last summer\'s', overlap.length === 0, overlap.join(' ') || 'none repeated');
}

console.log('\n=== a reload mid conference resumes it ===');
{
  /* THE WHOLE REASON THE SET IS STORED. Answer one, reload, and the second question has to be
     the one that was already chosen rather than a fresh draw. */
  const set = await p.evaluate(() => {
    const w = window.PS_CFB_COMMISH_TEST.world();
    return { year: w.year, qs: (((w.press || {})[String(w.year)] || {}).qs || []).slice() };
  });
  await p.click('#p-answers .opt:nth-child(1)');
  await p.waitForTimeout(200);
  await p.click('#b-say');
  await p.waitForTimeout(600);
  const wasSecond = (await p.textContent('#p-ask')).replace(/\s+/g, ' ').trim();
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2400);
  /* RESUME, NOT START. `#g-start` begins a new term and wipes the save, which is what the
     opening of this file does deliberately and is the exact opposite of what is being
     tested here. The gate offers the resume button only when there is something to go back
     to, so its presence is the first half of the assertion. */
  ok('the gate offers the term back', !!(await p.$('#g-resume')));
  await p.click('#g-resume');
  await p.waitForTimeout(900);
  const kept = await p.evaluate(() => {
    const w = window.PS_CFB_COMMISH_TEST.world();
    return (((w.press || {})[String(w.year)] || {}).qs || []).slice();
  });
  ok('the set survived the reload', kept.join(' ') === set.qs.join(' '), kept.join(' ') + ' vs ' + set.qs.join(' '));
  ok('and one answer is already given',
    await p.evaluate(() => {
      const w = window.PS_CFB_COMMISH_TEST.world();
      return (((w.press || {})[String(w.year)] || {}).said || []).length;
    }) === 1);
  await p.click('#b-desk');
  await p.waitForTimeout(800);
  const nowSecond = (await p.textContent('#p-ask')).replace(/\s+/g, ' ').trim();
  ok('and it picks up on the same second question', nowSecond === wasSecond, nowSecond.slice(0, 60));
}

console.log('\n=== a promise turns into an item ===');
{
  /* Every promise, planted and ripened at once, so the payoff items are reached through the
     real docket rather than through a unit test's idea of it. */
  const seen = await p.evaluate(() => {
    const M = window.PS_CFB_MEDIA, L = window.PS_CFB_LEDGER, D = window.PS_CFB_DOCKET;
    const T = window.PS_CFB_COMMISH_TEST;
    const ids = [];
    M.QUESTIONS.forEach((q) => q.answers.forEach((a) => {
      if (!a.promise) return;
      ids.push(typeof a.promise === 'function' ? a.promise({ conf: 'ACC', size: 5 }, q) : a.promise);
    }));
    ids.forEach((pr) => { T.plant(pr.id, Object.assign({}, pr, { wait: 0 })); });
    const w = T.world();
    const sit = window.PS_CFB_SITUATION.build(w, L, {});
    return {
      planted: ids.map((x) => x.id),
      payable: D.eligible(w, L, sit).filter((it) =>
        [].concat(it.pays || []).some((x) => ids.some((y) => y.id === x))).map((it) => it.id),
    };
  });
  ok('every promise is a live thread', seen.planted.length === 7, seen.planted.join(' '));
  ok('and every one of them has an item waiting',
    seen.payable.length === 7, seen.payable.join(' '));
  await p.evaluate(() => { window.PS_CFB_COMMISH_TEST.repaint(); });
  await p.waitForTimeout(500);
  const motion = await p.$$eval('#off-motion .mo b', (e) => e.map((x) => x.textContent.trim()));
  ok('the office lists them as things in motion', motion.length >= 7, motion.length);
  ok('  ...in words about what you said', motion.some((t) => /lectern|promised|said|July/i.test(t)),
    motion[0] || '');
}

ok('nothing threw', errs.length === 0, errs.slice(0, 2).join(' | '));
await b.close();
console.log(bad ? '\n' + bad + ' FAILED\n' : '\nall good\n');
process.exit(bad ? 1 : 0);
