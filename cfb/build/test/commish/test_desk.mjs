/* THE PREVIEW ON THE DESK CANNOT DISAGREE WITH THE RULING.
 *
 *   (nohup python3 -m http.server 8080 &)
 *   node cfb/build/test/commish/test_desk.mjs
 *
 * The desk now shows what a ruling would leave behind: the four headline numbers recomputed,
 * plus every other ledger field the ruling writes. It is drawn from applyEdit on a world
 * that is thrown away, which is what makes it incapable of lying, and it is exactly that
 * "incapable" that wants a check on it. A preview that quietly diverges from the ruling is
 * the worst thing this mode could ship: the player chooses on the strength of it.
 *
 * So this rules for real, on the same seed, and compares the four numbers the desk promised
 * against the four the office ends up with.
 *
 * It also checks the reading. The screen was a hundred and ten words of prose before the
 * first decision, and the three things that fixed it all have the same failure mode: they
 * fold something away and forget to give it back. The setup clamps to three lines and has to
 * open. An option's paragraph is one line and has to open when it is the one being
 * considered. Neither can be a trapdoor.
 */
import { chromium } from 'playwright';
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

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 390, height: 900 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.addInitScript(arm + stub);
await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 40000 });
await p.waitForTimeout(2400);
await p.click('#g-start').catch(() => {});
await p.waitForTimeout(900);

const on = (id) => p.$eval('#' + id, (e) => e.classList.contains('on')).catch(() => false);
const tap = async (s) => { try { await p.click(s, { timeout: 2000 }); return true; } catch (e) { return false; } };
/* The four headline numbers as the page draws them, wherever they are drawn. */
const facts = (sel) => p.$$eval(sel + ' .fact b', (e) => e.map((x) => x.textContent.trim()));

/* Walk to a desk. */
for (let i = 0; i < 12; i++) {
  if (await on('s-desk')) break;
  if (await on('s-office')) { await tap('#b-desk'); await p.waitForTimeout(500); continue; }
  if (await on('s-room')) { await tap('#b-next'); await p.waitForTimeout(500); continue; }
  if (await on('s-year')) { await tap('#b-year-next'); await p.waitForTimeout(500); continue; }
  break;
}

console.log('\n=== the desk is shorter than it was ===');
{
  ok('an item is on the desk', await on('s-desk'));

  /* THE SETUP IS FOLDED, NOT GONE, and the check for that cannot depend on which item the
     seed happened to deal. Plenty of briefs are three lines and are correctly left whole, so
     asserting on whichever one turned up first would pass without opening anything. This
     rules through beats until a clamped one appears and tests THAT.

     The two states are one invariant: the class is on exactly when the button is there. A
     clamp with no way past it is text nobody can read, and a button over a whole paragraph
     promises something that is not behind it. */
  let opened = null, looked = 0;
  for (let i = 0; i < 14 && opened === null; i++) {
    if (await on('s-office')) { await tap('#b-desk'); await p.waitForTimeout(450); continue; }
    if (await on('s-room')) { await tap('#b-next'); await p.waitForTimeout(450); continue; }
    if (await on('s-year')) { await tap('#b-year-next'); await p.waitForTimeout(450); continue; }
    if (!(await on('s-desk'))) break;
    looked++;
    const clamped = await p.$eval('#d-brief', (e) => e.classList.contains('clamp'));
    const more = await p.$('#d-brief button');
    if (clamped !== !!more) { opened = { agree: false }; break; }
    if (more) {
      const before = await p.$eval('#d-brief p', (e) => e.clientHeight);
      await more.click(); await p.waitForTimeout(250);
      opened = { agree: true,
        before, after: await p.$eval('#d-brief p', (e) => e.clientHeight),
        gone: !(await p.$('#d-brief button')) };
      break;
    }
    /* Short brief, nothing folded. Rule on anything and look at the next item. */
    const o = await p.$('#d-options .opt'); if (o) { await o.click(); await p.waitForTimeout(250); }
    if (!(await tap('#b-rule'))) break;
    await p.waitForTimeout(700);
  }
  ok('a setup long enough to be folded turns up', !!opened && opened.agree !== false,
    opened ? 'after ' + looked + ' items' : 'none in ' + looked + ' items');
  if (opened && opened.agree) {
    ok('  and opening it really shows more', opened.after > opened.before,
      opened.before + 'px to ' + opened.after + 'px');
    ok('  with nothing left to press', opened.gone);
  }
  /* Back to a desk for the rest of this block, wherever ruling left us. */
  for (let i = 0; i < 8 && !(await on('s-desk')); i++) {
    if (await on('s-office')) { await tap('#b-desk'); await p.waitForTimeout(450); continue; }
    if (await on('s-room')) { await tap('#b-next'); await p.waitForTimeout(450); continue; }
    if (await on('s-year')) { await tap('#b-year-next'); await p.waitForTimeout(450); continue; }
    break;
  }
  ok('  and there is still an item on the desk after all that', await on('s-desk'));

  /* ONE LINE PER SPEAKER. The header row above each quote was a third of the room's height
     and said what the chip beside it already says. */
  const voices = await p.$$eval('#d-voices .voice', (e) => e.map((v) => ({
    lines: Math.round(v.clientHeight / 20), chip: !!v.querySelector('.chip'),
  })));
  ok('the room argues in two lines a speaker, not three',
    voices.length > 0 && voices.every((v) => v.lines <= 2),
    voices.map((v) => v.lines).join(', ') + ' lines');
  ok('  and every quote still names who said it',
    voices.every((v) => v.chip)
    && (await p.$$eval('#d-voices .voice b', (e) => e.length)) === voices.length);

  /* THE CHIP ROW IS THE COMPARISON and it only works on one line. */
  const rows = await p.$$eval('#d-options .sig', (e) => e.map((s) => {
    const t = s.getBoundingClientRect().top;
    return s.querySelectorAll('i').length && [...s.querySelectorAll('i')]
      .every((i) => Math.abs(i.getBoundingClientRect().top - t) < 6);
  }));
  ok('every option signature fits on one row', rows.length > 0 && rows.every(Boolean),
    rows.length + ' options');
  ok('  and each chip still says the whole phrase somewhere',
    (await p.$$eval('#d-options .sig i', (e) => e.every((i) => (i.title || '').length > 4))));
}

console.log('\n=== the preview is the ruling ===');
{
  const opts = await p.$$('#d-options .opt');
  ok('there is more than one way to rule', opts.length >= 2, opts.length + ' options');

  /* NOTHING IS SHOWN BEFORE A CHOICE IS MADE, because there is nothing to show: the panel
     is about a ruling and there is not one yet. */
  ok('nothing is previewed until something is picked',
    (await p.$eval('#d-effect', (e) => e.textContent.trim())) === '');

  await opts[opts.length - 1].click();
  await p.waitForTimeout(400);
  ok('picking an option opens its reasoning',
    (await p.$eval('#d-options .opt.on .why', (e) => getComputedStyle(e).webkitLineClamp)) !== '1');
  ok('  and the two you did not pick stay a line',
    (await p.$$eval('#d-options .opt:not(.on) .why',
      (e) => e.every((x) => getComputedStyle(x).webkitLineClamp === '1'))));

  const shown = await p.$eval('#d-effect', (e) => e.textContent.length > 0);
  ok('  and says what the ruling would do', shown);
}

console.log('\n=== what the desk promised is what the office got ===');
{
  /* THE ASSERTION THIS FILE EXISTS FOR, AND IT MUST NOT SKIP ITSELF. Plenty of rulings move
     none of the four headline numbers, and the first item drawn was one of them: every check
     below passed by having nothing to check, which is the same as not running. So this rules
     through beats until it finds an option that genuinely moves a tile, and says at the end
     how long that took, so a run where it never found one reads as a failure rather than as
     a pass. */
  let promised = null, dialMoved = null, beats = 0;
  for (let i = 0; i < 30 && !promised; i++) {
    if (await on('s-office')) { await tap('#b-desk'); await p.waitForTimeout(450); continue; }
    if (await on('s-room')) { await tap('#b-next'); await p.waitForTimeout(450); continue; }
    if (await on('s-year')) { await tap('#b-year-next'); await p.waitForTimeout(450); continue; }
    if (!(await on('s-desk'))) break;
    beats++;
    const n = (await p.$$('#d-options .opt')).length;
    for (let k = 0; k < n; k++) {
      /* RE-QUERIED EVERY TIME, because choosing an option repaints all three of them and a
         handle taken before the repaint points at a button that is no longer in the page. */
      await (await p.$$('#d-options .opt'))[k].click();
      await p.waitForTimeout(300);

      /* THE DIAL MOVES THE PREVIEW. A control whose effect you cannot see until two screens
         later is a control nobody uses. Checked on the first dial this walk finds. */
      if (dialMoved === null) {
        const steps = await p.$$('#d-dials .steps button:not([disabled])');
        if (steps.length > 1) {
          const was = await p.$eval('#d-effect', (e) => e.textContent);
          await steps[steps.length - 1].click();
          await p.waitForTimeout(300);
          dialMoved = was !== (await p.$eval('#d-effect', (e) => e.textContent));
        }
      }
      const f = await facts('#d-effect');
      if (f.length) { promised = f; break; }
    }
    if (promised) break;
    if (!(await tap('#b-rule'))) break;
    await p.waitForTimeout(700);
  }

  ok('a ruling that moves the headline numbers turns up', !!promised,
    promised ? 'after ' + beats + ' beats: ' + promised.join(' / ') : 'none in 30 beats');
  ok('  and the dial moved the preview when there was one to move',
    dialMoved !== false, dialMoved === null ? 'no dial appeared on this walk' : 'yes');

  if (promised) {
    await tap('#b-rule');
    await p.waitForTimeout(900);
    ok('  the ruling lands on the reaction screen', await on('s-room'));
    await tap('#b-next');
    await p.waitForTimeout(900);
    /* Carrying on can roll into a year in review; either screen draws the same four facts. */
    const where = (await on('s-office')) ? '#off-sport' : (await on('s-year')) ? '#y-sport' : null;
    ok('  and the sport is on screen afterwards', !!where, where || 'neither screen');
    if (where) {
      const real = await facts(where);
      ok('  the four numbers are what the desk promised',
        JSON.stringify(promised) === JSON.stringify(real),
        'promised ' + promised.join(' / ') + '   got ' + real.join(' / '));
    }
  }
}

ok('no page errors', !errs.length, errs.join(' | ') || 'none');
await b.close();
console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
