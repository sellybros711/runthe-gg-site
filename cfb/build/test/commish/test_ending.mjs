/* THE DOCTRINE CARD, ON THE SCREEN THAT ENDS A TERM.
 *
 *   (nohup python3 -m http.server 8080 &)
 *   node cfb/build/test/commish/test_ending.mjs
 *
 * test_doctrine.mjs checks the classifier with no browser in the room. What it cannot check
 * is whether a whole term played end to end reaches this screen with a doctrine on it, and
 * that is the failure worth guarding: every piece can be right and the card still never
 * appear, because a term ends in one place and the card is drawn in another.
 *
 * Four things:
 *
 *   IT ARRIVES        a term played to its end draws a name, four axes and the evidence
 *   IT IS SIGNED      a bar drawn from the left would make "against" and "no opinion" the
 *                     same picture; each one runs from the center and picks a side
 *   IT SURVIVES       the backend is not applied to the live project, so the comparison has
 *                     to be absent rather than broken
 *   IT SENDS ONCE     a term is recorded when it ends, with the numbers the card shows
 */
import { chromium } from 'playwright';
import path from 'path';
const URL = 'http://localhost:8080/cfb/commish/index.html';
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


/* MEDIA DAYS SITS BETWEEN THE OFFICE AND THE DESK, one beat a year. Pressing on at that beat
   opens a lectern rather than a folder, and a walker that only knows about the desk stalls
   there with nothing it recognises on screen. Three answers and it is a desk again. */
async function podium(pg) {
  for (let i = 0; i < 6; i++) {
    const up = await pg.$eval('#s-press', (e) => e.classList.contains('on')).catch(() => false);
    if (!up) return;
    await pg.click('#p-answers .opt').catch(() => {});
    await pg.waitForTimeout(160);
    await pg.click('#b-say').catch(() => {});
    await pg.waitForTimeout(520);
  }
}

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

/* Play a whole term and stop on the ending. `mode` says what the term backend does. */
async function runTerm(mode) {
  const p = await b.newPage({ viewport: { width: 390, height: 900 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(arm + stub);
  await p.addInitScript(`window.__SENT=[];window.__MODE=${JSON.stringify(mode)};
    document.addEventListener('DOMContentLoaded',function(){
      var S=window.PS_CFB_SPLITS; if(!S) return;
      S.finishTerm=function(t){
        window.__SENT.push(t);
        if(window.__MODE==='down') return Promise.resolve(null);
        if(window.__MODE==='thin') return Promise.resolve({recorded:true,total:3,
          counts:{'purse+':2,'gate+':1},place:1,terms:1,doctrine:t.doctrine});
        var c={}; c[t.doctrine]=41;
        c['gate-']=33; c['stage+']=29; c['none']=22; c['throne+']=25;
        return Promise.resolve({recorded:true,counts:c,place:7,terms:41,doctrine:t.doctrine});
      };
    });`);
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await p.waitForTimeout(2400);
  await p.click('#g-start').catch(() => {});
  await p.waitForTimeout(900);
  const on = (id) => p.$eval('#' + id, (e) => e.classList.contains('on')).catch(() => false);
  const skip = async () => {
    for (let j = 0; j < 80; j++) {
      const up = await p.$eval('#off-monthcard', (e) => e.classList.contains('running')).catch(() => false);
      if (!up) return;
      await p.click('#off-monthcard', { timeout: 1500 }).catch(() => {});
      await p.waitForTimeout(90);
    }
  };
  /* THE TERM HAS TO ACTUALLY END. A year in review and an ending are the same screen, and
     the button's own text is what tells them apart: mid-term it carries on, at the end it
     offers the job again. Walking off the ending would test the wrong screen. */
  let ended = false;
  for (let i = 0; i < 460; i++) {
    if (await on('s-year')) {
      const t = await p.$eval('#b-year-next', (e) => e.textContent).catch(() => '');
      if (/take the job again/i.test(t)) { ended = true; break; }
      await p.click('#b-year-next').catch(() => {}); await p.waitForTimeout(220); continue;
    }
    if (await on('s-office')) { await p.click('#b-desk').catch(() => {}); await skip(); await p.waitForTimeout(180); continue; }
    if (await on('s-desk')) {
      const o = await p.$('#d-options .opt');
      if (o) { await o.click(); await p.waitForTimeout(90); }
      await p.click('#b-rule').catch(() => {}); await p.waitForTimeout(240); continue;
    }
    if (await on('s-room')) { await p.click('#b-next').catch(() => {}); await p.waitForTimeout(210); continue; }
    if (await on('s-press')) { await podium(p); continue; }
    break;
  }
  await p.waitForTimeout(900);
  return { p, errs, ended };
}

console.log('\n=== a term played to its end has a doctrine on it ===');
const up = await runTerm('up');
{
  ok('the term reaches an ending', up.ended);
  const card = await up.p.evaluate(() => {
    const e = document.getElementById('y-doctrine');
    if (!e) return { missing: true };
    return {
      hidden: e.hidden,
      name: (e.querySelector('.docname') || {}).textContent || '',
      line: (e.querySelector('.docline') || {}).textContent || '',
      rows: [].slice.call(e.querySelectorAll('.docrow')).map((r) => ({
        q: (r.querySelector('.docq') || {}).textContent,
        style: (r.querySelector('.docfill') || {}).getAttribute('style') || '',
        bold: (r.querySelector('.docends b') || {}).textContent || '',
      })),
      ev: [].slice.call(e.querySelectorAll('.docev span')).map((s) => s.textContent),
    };
  });
  ok('the card is drawn', !card.missing && !card.hidden);
  /* NINE ARCHETYPES AND THE CARD HAS TO SHOW ONE OF THEM, not a slug and not a blank. */
  ok('  with a name', /^The [A-Z]/.test(card.name), card.name);
  ok('  and a sentence about what that means', card.line.length > 30, card.line.slice(0, 60));
  ok('  four axes, each a named question', card.rows.length === 4,
    card.rows.map((r) => r.q).join(' | '));
  /* A BAR GROWING FROM THE LEFT WOULD MAKE -100 AND 0 THE SAME PICTURE. Every fill has to be
     anchored to the center, on one side or the other, or the card cannot say which way a
     term went. */
  ok('  every axis drawn from the center out',
    card.rows.every((r) => /(^|;)\s*(left|right):50%/.test(r.style)),
    JSON.stringify(card.rows.map((r) => r.style.split(';')[0])));
  ok('  and the end it landed on is the one set in ink',
    card.rows.every((r) => r.bold.length > 2),
    card.rows.map((r) => r.bold).join(' | '));
  ok('  with what the sport looks like now underneath', card.ev.length === 4,
    JSON.stringify(card.ev));

  /* IT MUST AGREE WITH THE MODULE. The page could draw a perfectly plausible card off the
     wrong world, and nothing about it would look wrong. */
  const agrees = await up.p.evaluate(() => {
    const DOC = window.PS_CFB_DOCTRINE;
    const w = JSON.parse(localStorage.getItem('cfb_commish_term')).world;
    const p = DOC.profile(w);
    return { want: p.name, got: document.querySelector('.docname').textContent };
  });
  ok('  and the name is the one the module computes', agrees.want === agrees.got,
    agrees.got + ' vs ' + agrees.want);
}

console.log('\n=== it is above the grade, not below it ===');
{
  /* A SCORE AT THE TOP MAKES EVERYTHING UNDER IT READ AS A JUSTIFICATION FOR THE SCORE. The
     doctrine is the more interesting half of the screen and it goes first. */
  const order = await up.p.evaluate(() => {
    const d = document.getElementById('y-doctrine');
    const r = document.getElementById('y-report');
    return d.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING ? 'doctrine first' : 'report first';
  });
  ok('the doctrine comes before the report card', order === 'doctrine first', order);
}

console.log('\n=== the term is recorded, once, with what the card shows ===');
{
  const sent = await up.p.evaluate(() => window.__SENT.slice());
  ok('exactly one term is sent', sent.length === 1, sent.length + ' sent');
  const t = sent[0] || {};
  ok('  with a doctrine id, not a display name', /^(purse|gate|stage|throne)[+-]$|^none$/.test(t.doctrine),
    String(t.doctrine));
  ok('  and four axes', Array.isArray(t.axes) && t.axes.length === 4, JSON.stringify(t.axes));
  ok('  every one of them inside the scale the table allows',
    (t.axes || []).every((v) => v >= -100 && v <= 100), JSON.stringify(t.axes));
  ok('  the rulings counted, and the seasons not', t.rulings > 0 && t.rulings <= 60,
    t.rulings + ' rulings');
  /* The table's own bounds, checked here so a term is never refused by a constraint the
     player cannot see. */
  ok('  years inside what the table accepts', t.years >= 0 && t.years <= 40, String(t.years));
  ok('  champions too', t.champions >= 0 && t.champions <= 40, String(t.champions));
  ok('  and a score that is either a grade or nothing',
    t.score === null || (t.score >= 0 && t.score <= 100), String(t.score));

  const split = await up.p.evaluate(() => {
    const e = document.getElementById('y-docsplit');
    return { hidden: e.hidden, text: e.textContent };
  });
  ok('the comparison is drawn', !split.hidden, split.text);
  ok('  saying how many came out the same way', /%/.test(split.text), split.text);
  /* "among The Reformers" reads as a typo, so the article comes off before pluralising. */
  ok('  and where the term stands among its own kind, named readably',
    /\d+ of \d+ among [A-Z]/.test(split.text) && !/among The /.test(split.text), split.text);
  ok('no page errors', !up.errs.length, up.errs.join(' | ') || 'none');
}
await up.p.close();

console.log('\n=== a thin sample says so instead of inventing a percentage ===');
{
  const thin = await runTerm('thin');
  const split = await thin.p.evaluate(() => {
    const e = document.getElementById('y-docsplit');
    return { hidden: e.hidden, text: e.textContent };
  });
  /* THE SAME FLOOR THE ITEM SPLITS USE. "100% of commissioners agreed with you" off a
     sample of three is worse than silence, because silence is not a claim. */
  ok('three commissioners produce no percentage', !/%/.test(split.text), split.text);
  ok('  and the other true thing instead', /first/i.test(split.text) || split.hidden, split.text);
  ok('no page errors', !thin.errs.length, thin.errs.join(' | ') || 'none');
  await thin.p.close();
}

console.log('\n=== the state the live project is in until the migration is run ===');
{
  const down = await runTerm('down');
  const card = await down.p.evaluate(() => {
    const e = document.getElementById('y-doctrine');
    const s = document.getElementById('y-docsplit');
    return { card: !e.hidden, name: (e.querySelector('.docname') || {}).textContent,
      split: s ? s.hidden : null };
  });
  /* THE DOCTRINE IS LOCAL AND THE COMPARISON IS NOT. One of those must survive the backend
     being absent, and it is the one that matters. */
  ok('the doctrine is drawn with no backend at all', card.card, card.name);
  ok('  and the comparison is simply absent', card.split === true);
  ok('no page errors', !down.errs.length, down.errs.join(' | ') || 'none');
  await down.p.close();
}

await b.close();
console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
