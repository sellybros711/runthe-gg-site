/* THE WHOLE MODE, IN A BROWSER, FROM THE DOOR TO THE FIFTIETH SEASON.
 *
 *   (nohup python3 -m http.server 8080 &)
 *   node cfb/build/test/commish/test_longterm.mjs
 *   node cfb/build/test/commish/test_longterm.mjs --seasons 12
 *
 * Every other suite here asks whether one screen is right. This one asks whether the mode
 * RUNS: a term played end to end through the real page, then a second and a third, then the
 * frontier ladder walked rung by rung through the real desk, with every page error caught.
 *
 * IT EXISTS BECAUSE THE LADDER SHIPPED WITHOUT IT. frontier.js was proved headlessly, against
 * modules required into node, and the page was proved to LOAD it. Those are two different
 * claims and neither is "a player can cross one". A crossing runs through openCase, the
 * option list, resolve, applyEdit, the room, the reaction screen and the save, and the first
 * of those that throws takes the mode to a blank screen with nothing in the console a player
 * can report. The headless suites cannot see any of it.
 *
 * WHAT A PAGE ERROR MEANS HERE. Nothing in this mode catches at the top level, so an
 * exception mid-beat leaves whatever was on screen and stops responding. Every section below
 * collects `pageerror` and asserts zero, because "the screen stopped doing anything" is the
 * only symptom a player ever gets and it is the same symptom for twenty different causes.
 */
import { chromium } from 'playwright';
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '../../../..');
const FR = require(ROOT + '/cfb/commish/frontier.js');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? Number(process.argv[i + 1]) : d; };
const SEASONS = arg('seasons', 10);
const URL = 'http://localhost:8080/cfb/commish/index.html';
const UID = '11111111-1111-1111-1111-111111111111';

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };

const TESTER = 'longterm-test';
const arm = `
(function(){ var v;
  Object.defineProperty(window,'PS_CFB_COMMISH_ACCESS',{configurable:true,
    get:function(){ return v; },
    set:function(a){ v=a; try{ a.TESTERS.push(${JSON.stringify(TESTER)}); }catch(e){} }});
})();`;
/* THE CLOCK IS STUBBED OPEN, not bypassed. A free account plays one season a day, so a walk
   of fifty would take fifty days; what this file is testing is the mode rather than the
   meter, and the meter has test_clock. The RPC answers the way a paying account's server
   answers, which is the same shape the page reads either way. */
const stub = (products) => `
window.supabase={createClient(){
  const session={access_token:'x',user:{id:'${UID}',email:'c@e.com'}};
  return {auth:{onAuthStateChange(cb){ setTimeout(function(){cb('SIGNED_IN',session);},0); return {data:{}}; },
    getSession:()=>Promise.resolve({data:{session}}),
    signOut:()=>Promise.resolve({})},
    from(){return{select(){return{eq(){return{maybeSingle:()=>Promise.resolve(
      {data:{username:'${TESTER}'}})}}}}}},
    rpc:(fn)=>Promise.resolve(fn==='premium_products'
      ? {data:${JSON.stringify(products)},error:null}
      : {data:null,error:null})}}};`;

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

async function open(products, label) {
  const p = await b.newPage({ viewport: { width: 390, height: 900 } });
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  /* A CONSOLE ERROR IS NOT A PAGE ERROR AND BOTH ARE WORTH HAVING. A caught exception that
     is logged rather than thrown leaves the mode running and the screen wrong, which is the
     harder bug and the one this mode has shipped before. */
  p.logs = [];
  p.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    /* THE SANDBOX'S OWN TLS, not the page's. Everything outbound here goes through an agent
       proxy whose certificate the browser does not trust, so the Supabase bundle and the web
       font both log a failure that says nothing about this mode. Filtered by name rather than
       by ignoring console errors wholesale, because a caught-and-logged exception leaves the
       mode running with the screen wrong, which is the harder bug and one this page has
       shipped before. */
    if (/ERR_CERT_AUTHORITY_INVALID|ERR_PROXY|net::ERR_/.test(t)) return;
    p.logs.push(t.slice(0, 160));
  });
  await p.addInitScript(arm + stub(products));
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await p.waitForTimeout(2600);
  console.log('\n=== ' + label + ' ===');
  return p;
}
const on = (p, id) => p.$eval('#' + id, (e) => e.classList.contains('on')).catch(() => false);
const tap = async (p, s) => { try { await p.click(s, { timeout: 2200 }); return true; } catch (e) { return false; } };
const wstate = (p) => p.evaluate(() => {
  const w = window.PS_CFB_COMMISH_TEST.world();
  return { year: w.year, beat: w.beat, startYear: w.startYear,
    standing: Math.round(w.meters.standing), out: !!(w.outcome && w.outcome.removed),
    frontier: Object.keys(w.frontier || {}), rulings: (w.history || []).length };
});

/* Past the cutscene, the simulation and the lectern, which are the three screens a walker
   that only knows about the desk stalls on. */
async function clear(p) {
  for (let i = 0; i < 20; i++) {
    if (await on(p, 's-scene')) { await tap(p, '#b-scene-skip'); await p.waitForTimeout(280); continue; }
    /* MEDIA DAYS IS A LECTERN AND IT ANSWERS LIKE THE DESK: pick an `.opt`, then press the
       one button. The answers are not <button>s, so a walker looking for one finds nothing,
       sits at the podium and reports every beat after the third as an empty desk. */
    if (await on(p, 's-press')) {
      const a = await p.$$('#p-answers .opt');
      if (a.length) { await a[0].click().catch(() => {}); await p.waitForTimeout(220); }
      await tap(p, '#b-say');
      await p.waitForTimeout(420);
      continue;
    }
    /* THE SKIP IS #b-desk, NOT THE CALENDAR. While the month walks, that one button relabels
       itself "Tap to skip" and takes the press; the calendar card it is walking is not a
       control. Tapping the card did nothing, so this loop fell through with the simulation
       still running and the next thing the walk did was read a desk that was not up. */
    const running = await p.$eval('#off-monthcard', (e) => e.classList.contains('running')).catch(() => false);
    if (running) { await tap(p, '#b-desk'); await p.waitForTimeout(220); continue; }
    /* THE ROOM ANSWERS MORE THAN RULINGS. Media days ends on this same screen ("You took
       questions"), and a walker that only dismissed it after a DESK ruling sat there from the
       first July onward, reporting every later beat as an empty desk. One button, one job:
       carry on. */
    if (await on(p, 's-room')) { await tap(p, '#b-next'); await p.waitForTimeout(420); continue; }
    /* THE YEAR IN REVIEW, which is a screen between seasons rather than an ending. Carry on
       through it, unless it is carrying the share card, which is the one structural mark of a
       term that is really over (see test_ending for why the button's WORDS are no use). */
    if (await on(p, 's-year')) {
      if (await ended(p)) return;
      await tap(p, '#b-year-next');
      await p.waitForTimeout(500);
      continue;
    }
    return;
  }
}

/* ── one beat, the way a player takes one ─────────────────────────────────────────────── */
async function beat(p) {
  await clear(p);
  /* A TERM THAT HAS ENDED IS NOT A STALL. The year screen carries the removal and the end of
     a contract, and it has no desk behind it: a walker that only knows office and desk read
     "REMOVED 2025" as the mode having seized up. Getting sacked is the game working. */
  if (await ended(p)) return 'ended';
  /* ONE BUTTON DOES TWO JOBS, which is the thing a walker gets wrong here. `#b-desk` reads
     "Next stage: September" and starts the simulation; while that runs it reads "Tap to
     skip"; only when the walk has finished does pressing it open the desk. A walker that
     taps once and asks whether the desk is up reports an empty desk on every beat with a
     month to play, which is most of them. */
  let opened = false;
  for (let i = 0; i < 8 && !opened; i++) {
    if (!(await on(p, 's-office'))) { await clear(p); await p.waitForTimeout(200); continue; }
    if (!(await tap(p, '#b-desk'))) break;
    await p.waitForTimeout(450);
    await clear(p);
    opened = await on(p, 's-desk');
  }
  if (!opened) {
    /* WHAT IS ACTUALLY ON SCREEN, reported rather than guessed at. A walk that can only say
       "no desk" sends whoever reads it hunting through the page for a selector, and the
       answer has twice now been a screen the walker did not know about. */
    beat.why = beat.why || await snapshot(p);
    return 'nodesk';
  }
  /* READ ONLY WHEN THE DESK IS ACTUALLY UP. The options of the last case stay in the DOM
     behind the office, so a walker that reads them while the month is still walking gets a
     list, clicks into nothing and reports a mode that refuses to rule. */
  const opts = await p.$$eval('#d-options .opt', (e) => e.map((x) => x.dataset.o)).catch(() => []);
  if (!opts.length) return 'noopts';
  /* THE MIDDLE OPTION, which is the least interesting commissioner imaginable and exactly
     what a fixture wants (see the term bot in test_docket). Always taking the first one is
     usually the most extreme door on the item, and it got this walk voted out in its first
     autumn, which tests the removal screen rather than the mode. */
  const pick = opts[Math.floor(opts.length / 2)];
  await p.click('#d-options .opt[data-o="' + pick + '"]').catch(() => {});
  await p.waitForTimeout(220);
  if (!(await tap(p, '#b-rule'))) return 'norule';
  await p.waitForTimeout(700);
  await clear(p);
  /* The reaction screen, then back to the office. Both buttons are tried because which one
     is drawn depends on whether the ruling had a scene behind it. */
  for (let i = 0; i < 8; i++) {
    if (await on(p, 's-room')) {
      await tap(p, '#b-next');
      await p.waitForTimeout(500); await clear(p); continue;
    }
    if (await on(p, 's-office')) return 'ok';
    await clear(p);
    await p.waitForTimeout(250);
  }
  if (await on(p, 's-office')) return 'ok';
  if (await ended(p)) return 'ended';
  beat.why = beat.why || await snapshot(p);
  return 'stuck';
}
/* WHAT IS ON SCREEN WHEN THE WALK GIVES UP. Reported rather than guessed at: three separate
   times the answer has been a screen this file did not know about (the lectern, the room
   after media days, the year in review), and each one cost a round of hunting for a
   selector. */
/* THE TERM IS OVER, structurally rather than by reading a button's words. test_ending records
   why: that label says four different things now, and a check on the string silently stopped
   recognising the ending, clicked past it and started a fresh term. */
const ended = (p) => p.evaluate(() => {
  /* THE SHARE BUTTON AND NOTHING ELSE. `s-year` is drawn at the end of EVERY season, so
     treating it as the ending stops a five season term after the first autumn and reports a
     mode that seized up. Only a term that is actually over offers the card. */
  const share = document.getElementById('b-term-share');
  if (share && !share.hidden && share.offsetParent) return true;
  try { const w = window.PS_CFB_COMMISH_TEST.world(); return !!(w.outcome && w.outcome.removed); }
  catch (e) { return false; }
}).catch(() => false);
const snapshot = (p) => p.evaluate(() => {
  const up = [...document.querySelectorAll('.screen')].filter((s) => s.classList.contains('on'));
  return { on: up.map((s) => s.id).join('+') || 'none',
    text: (up[0] ? (up[0].innerText || '') : '').replace(/\s+/g, ' ').trim().slice(0, 200),
    buttons: [...document.querySelectorAll('.screen.on button')]
      .filter((x) => x.offsetParent).map((x) => x.id || x.className).slice(0, 6).join(', ') };
}).catch(() => null);

/* ── a term, start to finish ──────────────────────────────────────────────────────────── */
{
  const p = await open(['cfb_premium'], 'a pro term played beat by beat through the real page');
  ok('the door opens for a tester who owns it', await on(p, 's-gate'), 'gate up');
  await tap(p, '#g-start');
  await p.waitForTimeout(900);
  await clear(p);
  ok('  taking the job reaches the office', await on(p, 's-office'));

  const counts = { ok: 0, ended: 0, nodesk: 0, noopts: 0, norule: 0, stuck: 0 };
  let ended = false, endedAt = null;
  const BEATS = SEASONS * 9;
  for (let i = 0; i < BEATS; i++) {
    /* THE ENDING IS A LEGAL STOP AND SO IS A SACKING. Both end the walk rather than failing
       it: this is asking whether the mode runs, not whether a bot survives it. */
    if (await p.$eval('#b-term-share', (e) => !e.hidden).catch(() => false)) {
      ended = true; endedAt = (await wstate(p)).year; break;
    }
    const r = await beat(p);
    counts[r] = (counts[r] || 0) + 1;
    if (r === 'stuck') break;
    if (r === 'ended') { ended = true; endedAt = (await wstate(p)).year; break; }
    const st = await wstate(p);
    if (st.out) { ended = true; endedAt = st.year; break; }
  }
  const st = await wstate(p);
  ok('every beat resolved back to the office', !counts.stuck,
    JSON.stringify(counts) + (beat.why ? '   [' + beat.why.on + '] ' + beat.why.text
      + '  buttons: ' + beat.why.buttons : ''));
  ok('  and the desk was never empty', !counts.nodesk && !counts.noopts,
    counts.nodesk + ' no desk, ' + counts.noopts + ' no options'
      + (beat.why ? '   [' + beat.why.on + '] ' + beat.why.text : ''));
  ok('  rulings actually reached the ledger', st.rulings >= counts.ok * 0.9,
    st.rulings + ' on the record over ' + counts.ok + ' beats');
  ok('  and the clock moved', st.year > st.startYear || ended,
    'year ' + st.year + (ended ? ', ended in ' + endedAt : ''));
  ok('nothing threw across the whole walk', p.errs.length === 0, p.errs.slice(0, 3).join(' | '));
  ok('  and nothing was logged as an error either', p.logs.length === 0, p.logs.slice(0, 3).join(' | '));
  await p.close();
}

/* ── the ladder, walked rung by rung through the real desk ────────────────────────────────
   THE PART THAT SHIPPED UNPROVEN. Every rung is put on the desk by name, its opening option
   is taken through the page's own buttons, and the world is read back. What this catches
   that nothing headless can: the option rendering, the room reacting to a bloc that did not
   exist a moment ago, the save round-tripping a world with new fields on it, and the desk
   naming a path no PATH_NAME entry had. */
{
  const p = await open(['cfb_premium'], 'the frontier ladder, crossed through the page');
  await tap(p, '#g-start');
  await p.waitForTimeout(900);
  await clear(p);

  const ITEM = {
    union: 'fr-union', capital: 'fr-capital', franchise: 'fr-franchise',
    congress: 'fr-congress', antitrust: 'fr-antitrust', whitehouse: 'fr-whitehouse',
    abroad: 'fr-abroad', global: 'fr-global', orbital: 'fr-orbital', colony: 'fr-colony',
  };
  const OPT = {
    union: 'recognise', capital: 'sell', franchise: 'admit', congress: 'appear',
    antitrust: 'accept', whitehouse: 'take', abroad: 'go', global: 'admit',
    orbital: 'sanction', colony: 'admit',
  };
  const crossed = [];
  const failed = [];
  for (const f of FR.FRONTIERS) {
    /* The fuses lit and the books open, because several rungs carry a second gate. Set on
       the world directly: what is being tested is the CROSSING, and whether the sport ever
       reaches those states is probe_longrun's question. */
    await p.evaluate(() => {
      const w = window.PS_CFB_COMMISH_TEST.world();
      w.pressure.legal = 55; w.pressure.congress = 55; w.pressure.union = 55;
      w.meters.revenue = 40;
      w.beat = 2;
    });
    const opened = await p.evaluate((id) => {
      try { return !!window.PS_CFB_COMMISH_TEST.deskItem(id); } catch (e) { return 'threw: ' + e.message; }
    }, ITEM[f.id]);
    if (opened !== true) { failed.push(f.id + ' (desk: ' + opened + ')'); continue; }
    await p.waitForTimeout(350);
    const took = await p.evaluate((o) => {
      try { return window.PS_CFB_COMMISH_TEST.forceChoice(o); } catch (e) { return 'threw: ' + e.message; }
    }, OPT[f.id]);
    if (took !== true) { failed.push(f.id + ' (rule: ' + took + ')'); continue; }
    await p.waitForTimeout(600);
    const st = await wstate(p);
    if (st.frontier.indexOf(f.id) >= 0) crossed.push(f.id);
    else failed.push(f.id + ' (ruled, not crossed)');
    /* Back to the office for the next one. */
    for (let i = 0; i < 6 && !(await on(p, 's-office')); i++) {
      if (await on(p, 's-room')) await tap(p, '#b-next');
      await p.waitForTimeout(400); await clear(p);
    }
  }
  ok('every rung of the ladder crosses through the real page', !failed.length,
    failed.join(', ') || crossed.length + ' of ' + FR.FRONTIERS.length);
  const st = await wstate(p);
  ok('  and the sport ends up off the planet', st.frontier.indexOf('colony') >= 0,
    st.frontier.join(', '));
  /* THE ROOM GREW AND THE PAGE HAS TO DRAW IT. Six blocs were seated during that walk and
     every one of them answers every ruling from here on. */
  const room = await p.evaluate(() => {
    const w = window.PS_CFB_COMMISH_TEST.world();
    return window.PS_CFB_BLOCS.roomOf(w).length;
  });
  ok('  with everybody who joined still in the room', room === 15, room + ' blocs');
  const said = await p.evaluate(() => {
    const w = window.PS_CFB_COMMISH_TEST.world();
    return window.PS_CFB_BLOCS.react(w, { effects: { money: 2, labour: -2, exposure: 2 } })
      .map((r) => ({ id: r.id, say: r.say, n: r.delta }));
  });
  ok('  and every one of them answers with a real line',
    said.length === 15 && said.every((r) => r.say && r.say.length > 8 && Number.isFinite(r.n)),
    said.filter((r) => !r.say || !Number.isFinite(r.n)).map((r) => r.id).join(', ') || said.length + ' answers');
  /* A SAVE HAS TO SURVIVE THE NEW FIELDS. The world now carries a `frontier` key and a dozen
     grafted paths, and the save is JSON in localStorage plus a cloud row. A reload is the
     only thing that proves the round trip. */
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2600);
  await clear(p);
  const after = await wstate(p).catch(() => null);
  ok('  and the sport survives a reload', !!after && after.frontier.length === crossed.length,
    after ? after.frontier.length + ' of ' + crossed.length + ' kept' : 'no world');
  ok('nothing threw across the ladder', p.errs.length === 0, p.errs.slice(0, 3).join(' | '));
  ok('  and nothing was logged as an error', p.logs.length === 0, p.logs.slice(0, 3).join(' | '));
  await p.close();
}

/* ── the free tier reaches the same mode ──────────────────────────────────────────────── */
{
  const p = await open([], 'a free account plays the same game');
  ok('the door opens without the row', await on(p, 's-gate'));
  await tap(p, '#g-start');
  await p.waitForTimeout(900);
  await clear(p);
  ok('  and a free account reaches the office', await on(p, 's-office'));
  const r = await beat(p);
  ok('  and can rule on the first case', r === 'ok', r);
  ok('nothing threw', p.errs.length === 0, p.errs.slice(0, 3).join(' | '));
  await p.close();
}

await b.close();
console.log(bad ? '\n' + bad + ' FAILURES' : '\nall clear');
process.exit(bad ? 1 : 0);
