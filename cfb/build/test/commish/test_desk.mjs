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
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
/* `import.meta.dirname` rather than `new URL(...)`: this file declares its own `const URL`
   for the page under test, which shadows the global constructor and puts it in the temporal
   dead zone above that line. */
const ROOT = path.resolve(import.meta.dirname, '../../../..');
/* HOW BIG THE DOCKET IS, read rather than assumed, so a walk budget cannot silently become
   too small the next time somebody adds thirty items. */
const DOCKET_ITEMS = require(ROOT + '/cfb/commish/docket.js').ITEMS.length;
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


/* THE SIMULATION SITS BETWEEN THE OFFICE AND THE DESK NOW. Pressing on walks the days of the
   beat before anything lands, which is the point of it and which every walker in these tests
   would otherwise sit through or, worse, time out on. Tapping it skips to the end. */
async function skipSim(pg) {
  for (let i = 0; i < 60; i++) {
    const up = await pg.$eval('#s-sim', (e) => e.classList.contains('on')).catch(() => false);
    if (!up) return;
    await pg.click('#s-sim', { timeout: 1500 }).catch(() => {});
    await pg.waitForTimeout(110);
  }
}

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
  if (await on('s-office')) { await tap('#b-desk'); await skipSim(p); await p.waitForTimeout(400); continue; }
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
    if (await on('s-office')) { await tap('#b-desk'); await skipSim(p); await p.waitForTimeout(380); continue; }
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
    if (await on('s-office')) { await tap('#b-desk'); await skipSim(p); await p.waitForTimeout(380); continue; }
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

  /* AND SO DOES EVERY OTHER VOICE IN THE DOCKET, not merely the three this walk happened to
     land on. Two hundred and twenty-five lines are written and a walk sees three of them, so
     a line that wraps can sit there for weeks and then fail somebody else's afternoon at
     random. Every one of them is drawn into the real container at phone width and measured.

     THIS REPLACES A CHARACTER COUNT THAT COULD NOT HAVE CAUGHT IT. test_docket used to assert
     the quote was under eighty-five characters, which missed two things. The desk renders the
     SPEAKER'S NAME in the same flow, so the line that overflowed was eighty-three characters
     of quote behind a twelve character name. And length is the wrong unit anyway: the name is
     bold and the font is proportional, so "The presidents" plus eighty-one characters fits in
     two lines while "The networks" plus eighty-three does not, at the same ninety-five. Only
     the browser knows, so ask the browser. */
  const wide = await p.evaluate(() => {
    const D = window.PS_CFB_DOCKET, B = window.PS_CFB_BLOCS;
    const box = document.getElementById('d-voices');
    if (!D || !B || !box) return { err: 'a module or the container is missing' };
    const held = box.innerHTML;
    const out = [];
    let seen = 0;
    D.ITEMS.forEach((it) => {
      (it.voices || []).forEach((v) => {
        const bl = B.BY_ID[v.id];
        const name = bl ? bl.name : v.id;
        box.innerHTML = '<div class="voice"><span class="vs"><b>' + name + '</b>'
          + String(v.say).replace(/[&<>]/g, '') + '</span></div>';
        const el = box.querySelector('.voice');
        if (el.clientHeight > 46) out.push(it.id + '/' + v.id + ' ' + el.clientHeight + 'px');
        seen++;
      });
    });
    box.innerHTML = held;
    return { out, seen };
  });
  ok('  and so does every other line in the docket', !wide.err && !wide.out.length,
    wide.err || wide.out.slice(0, 4).join(', ') || 'all ' + wide.seen + ' fit');
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
  /* AND THE BUDGET IS SIZED AGAINST THE DOCKET, not against the docket as it was. Thirty
     turns reached about ten items, which was most of a twenty-four item docket and is a fifth
     of a fifty-five item one, so this started failing outright on a sport that had simply got
     bigger. Scaled off ITEMS so it cannot rot the same way twice. */
  let promised = null, dialMoved = null, beats = 0;
  const budget = Math.max(30, DOCKET_ITEMS * 2);
  for (let i = 0; i < budget && !promised; i++) {
    if (await on('s-office')) { await tap('#b-desk'); await skipSim(p); await p.waitForTimeout(380); continue; }
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
    promised ? 'after ' + beats + ' beats: ' + promised.join(' / ') : 'none in ' + beats + ' beats');
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
await p.close();

console.log('\n=== the forecast is only as good as your council ===');
{
  /* THE PREVIEW WITHHOLDS, AND WITHHOLDING IS EASY TO DO BADLY. Three ways to leak the six
     blocs a small council cannot read, none of which throws:

       the quote          the line a bloc says is generated from its own delta
       the move bar       its width IS the delta
       the standing meter standing is the vote-weighted average of the room, and every bloc
                          that holds a vote is dark at a small council, so one number hands
                          back the exact aggregate of everything being hidden

     The last one shipped for about an hour and was invisible: six padlocks and, above them,
     "your standing, minus 7.9".

     `?rulings=N` is the tester switch that makes this checkable without playing two terms. */
  const look = async (rulings) => {
    const q = await b.newPage({ viewport: { width: 390, height: 900 } });
    const e2 = []; q.on('pageerror', (x) => e2.push(x.message));
    await q.addInitScript(arm + stub);
    await q.goto(URL + '?rulings=' + rulings, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await q.waitForTimeout(2400);
    await q.click('#g-start').catch(() => {});
    await q.waitForTimeout(900);
    const at = (id) => q.$eval('#' + id, (x) => x.classList.contains('on')).catch(() => false);
    for (let i = 0; i < 10 && !(await at('s-desk')); i++) {
      if (await at('s-office')) { await q.click('#b-desk', { timeout: 2000 }).catch(() => {}); await skipSim(q); await q.waitForTimeout(380); continue; }
      if (await at('s-room')) { await q.click('#b-next', { timeout: 2000 }).catch(() => {}); await q.waitForTimeout(450); continue; }
      break;
    }
    const o = await q.$('#d-options .opt'); if (o) { await o.click(); await q.waitForTimeout(300); }
    const note = await q.$eval('#d-council', (x) => x.textContent.trim()).catch(() => '');
    await q.click('#b-test', { timeout: 2000 }).catch(() => {});
    await q.waitForTimeout(900);
    const rows = await q.$$eval('#r-room .bl', (els) => els.map((x) => ({
      who: x.querySelector('.nm').textContent,
      dark: x.classList.contains('blind'),
      say: !!x.querySelector('.say'),
      bar: !!x.querySelector('.mv'),
      delta: (x.querySelector('.dl') || {}).textContent || '',
      level: (x.querySelector('.lv') || {}).textContent || '',
    })));
    const standing = await q.$$eval('#r-meters .meter', (els) => {
      const m = els[els.length - 1];
      return { dark: m.classList.contains('blind'), d: (m.querySelector('.d') || {}).textContent || '' };
    });
    await q.close();
    return { rows, standing, note, errs: e2 };
  };

  const nw = await look(0);
  ok('a new commissioner reads three of the nine',
    nw.rows.length === 9 && nw.rows.filter((r) => !r.dark).length === 3,
    nw.rows.filter((r) => !r.dark).map((r) => r.who).join(', '));
  /* THE ROW STAYS. Dropping it would show three rows and let the player think that is the
     room; the padlock is what says there are six more and you are blind to them. */
  ok('  the six they cannot read are still in the room', nw.rows.filter((r) => r.dark).length === 6);
  ok('  and none of them leaks a quote or a move bar',
    nw.rows.filter((r) => r.dark).every((r) => !r.say && !r.bar));
  ok('  nor a number where the read would be',
    nw.rows.filter((r) => r.dark).every((r) => !/[0-9]/.test(r.delta)),
    'deltas: ' + JSON.stringify(nw.rows.filter((r) => r.dark).map((r) => r.delta)));
  /* WHERE THEY STAND IS PUBLIC and the office prints it, so it stays. */
  ok('  but where they stand is still shown, because that is public',
    nw.rows.filter((r) => r.dark).every((r) => /^[0-9]+$/.test(r.level)));
  ok('  and standing is locked, because it IS the room', nw.standing.dark === true
    && !/[0-9]/.test(nw.standing.d), JSON.stringify(nw.standing));
  ok('  with the desk having said so before they pressed it',
    /council/i.test(nw.note) && /3 of 9/.test(nw.note), nw.note.slice(0, 60));

  const old = await look(60);
  ok('a commissioner of sixty rulings reads the whole room',
    old.rows.length === 9 && old.rows.every((r) => !r.dark));
  ok('  and gets their standing back', old.standing.dark === false
    && /[0-9]/.test(old.standing.d), JSON.stringify(old.standing));

  ok('no page errors in either', !nw.errs.length && !old.errs.length,
    nw.errs.concat(old.errs).join(' | ') || 'none');
}

await b.close();
console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
