/* The two things an account now buys, and what a guest is told about them.
 *
 *   (nohup node cfb/build/test/gzip_server.mjs &)
 *   node cfb/build/test/test_gate_modes.mjs
 *
 * Conference Draft is a signed-in mode, and a guest who finishes a draft is asked once,
 * on the one screen where the ask is worth anything.
 *
 * THE THREE AUTH STATES ARE THE WHOLE TEST, because the interesting failures all live in
 * the two that are not "signed out":
 *
 *   signed out, accounts working   locked, and the ask appears
 *   signed in                      open, no padlock anywhere, and no ask
 *   accounts offline               locked and SAYS WHY, and no ask at all
 *
 * The last one is the one worth being careful about: the sign-in script is blocked by
 * plenty of ad blockers, and a modal telling somebody to sign in when their browser will
 * not let them is worse than saying nothing. The page in this sandbox is in exactly that
 * state by default, because the Supabase CDN is unreachable from here, so the stub below
 * is what produces a working signed-out session rather than the other way round.
 *
 * That last case takes fifteen seconds on purpose. auth.js polls for the library and only
 * calls it blocked at a deadline, because a slow connection and a blocked CDN are the same
 * thing for the first fourteen seconds, so the test waits the deadline out rather than
 * reading the spinner and calling it an answer.
 */
import { chromium } from 'playwright';
const SS = process.env.SS || '/tmp/';
const HOST = process.env.HOST || 'http://localhost:8081';

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };

/* Accounts reachable and nobody signed in. */
const OUT = `window.supabase={createClient(){return{
  auth:{onAuthStateChange(){return{data:{}}},
    getSession:()=>Promise.resolve({data:{session:null}}),
    signOut:()=>Promise.resolve({})},
  from(){return{select(){return{eq(){return{maybeSingle:()=>Promise.resolve({data:null})}}}}}},
  rpc:()=>Promise.resolve({data:null,error:null})}}};`;

/* Signed in, with a name, which is the state that must see none of this. */
const IN = `window.supabase={createClient(){return{
  auth:{onAuthStateChange(cb){setTimeout(()=>cb('SIGNED_IN',{user:{id:'u1',email:'a@b.c'}}),0);return{data:{}}},
    getSession:()=>Promise.resolve({data:{session:{user:{id:'u1',email:'a@b.c'}}}}),
    signOut:()=>Promise.resolve({})},
  from(){return{select(){return{eq(){return{maybeSingle:()=>Promise.resolve({data:{username:'tester'}})}}}}}},
  rpc:()=>Promise.resolve({data:null,error:null})}}};`;

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

async function open(stub, label) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  if (stub) await p.addInitScript(stub);
  await p.goto(HOST + '/cfb/index.html', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await p.waitForTimeout(3000);
  console.log('\n=== ' + label + ' ===');
  return p;
}

const authOf = (p) => p.evaluate(() => {
  const b = document.getElementById('b-modes');
  return { padlock: !!b.querySelector('svg'), label: (b.textContent || '').trim() };
});

/* Six spins of best-available, which is all this needs: the draft finishing is the event. */
async function draftSix(p) {
  await p.evaluate(() => document.getElementById('b-play-intro').click());
  await p.waitForTimeout(2500);
  for (let g = 0; g < 6; g++) {
    for (let t = 0; t < 30; t++) {
      const slot = await p.$('#sheet.on .slotopt[data-i]');
      if (slot) { await slot.click(); await p.waitForTimeout(700); continue; }
      const took = await p.evaluate(() => {
        const tiles = [...document.querySelectorAll('#opts .tile:not(.off)')];
        if (!tiles.length) return false;
        tiles[0].click(); return true;
      });
      if (took) { await p.waitForTimeout(1500); break; }
      await p.waitForTimeout(500);
    }
    const after = await p.$('#sheet.on .slotopt[data-i]');
    if (after) { await after.click(); await p.waitForTimeout(1200); }
  }
  await p.waitForTimeout(900);
  return !!(await p.$('#s-squad.on'));
}

/* ── signed out, accounts working ───────────────────────────────────────────── */
{
  const p = await open(OUT, 'a guest, with accounts working');
  const a = await authOf(p);
  ok('the home button wears a padlock', a.padlock, JSON.stringify(a));

  await p.evaluate(() => document.getElementById('b-modes').click());
  await p.waitForTimeout(700);
  const sheet = await p.evaluate(() => {
    const s = document.getElementById('sheet-in');
    const conf = s.querySelector('.mc-conf');
    return {
      open: document.getElementById('sheet').classList.contains('on'),
      kind: s.dataset.kind,
      confLocked: !!(conf && conf.classList.contains('locked')),
      confTag: conf ? conf.tagName : null,
      gate: !!s.querySelector('#gate-in'),
      gateText: (s.querySelector('.gate') || {}).textContent || '',
      nfl: !!s.querySelector('#b-mc-nfl'),
      alma: !!s.querySelector('#b-mc-alma'),
      text: (s.textContent || '').replace(/\s+/g, ' '),
    };
  });
  ok('the sheet still opens', sheet.open && sheet.kind === 'modes');
  ok('Conference Draft is locked and not a button',
    sheet.confLocked && sheet.confTag === 'DIV', sheet.confTag + ' locked=' + sheet.confLocked);
  ok('and it says what an account buys', sheet.gate && /comes with an account/.test(sheet.gateText),
    sheet.gateText.replace(/\s+/g, ' ').slice(0, 80));
  ok('the mode is still described rather than hidden',
    /Power 5/.test(sheet.text) && /own leaderboard/.test(sheet.text));
  /* THE CROSS-PROMOS ARE NOT PART OF THE LOCK. They go to other games on other pages and
     gating them would spend this game's traffic to make a point about this game's modes. */
  ok('the other games are still reachable', sheet.nfl && sheet.alma,
    'nfl=' + sheet.nfl + ' alma=' + sheet.alma);
  await p.screenshot({ path: SS + 'gate_modes_locked.png' });
  await p.evaluate(() => document.getElementById('mm-x').click());
  await p.waitForTimeout(400);

  ok('the draft finishes', await draftSix(p));
  const pitch = await p.evaluate(() => {
    const s = document.getElementById('sheet-in');
    return {
      open: document.getElementById('sheet').classList.contains('on'),
      kind: s.dataset.kind,
      perks: [...s.querySelectorAll('.perk b')].map((e) => e.textContent),
      cta: (document.getElementById('gp-in') || {}).textContent || null,
      out: (document.getElementById('gp-x') || {}).textContent || null,
      text: (s.textContent || '').replace(/\s+/g, ' '),
    };
  });
  ok('the ask comes up on the squad screen', pitch.open && pitch.kind === 'pitch', pitch.kind);
  ok('it lists what an account gets you', pitch.perks.length === 4, pitch.perks.join(' | '));
  ok('and the Conference Draft is one of them', pitch.perks.some((t) => /Conference Draft/.test(t)));
  ok('it says the season is ranked either way', /ranked/.test(pitch.text),
    pitch.text.slice(0, 120));
  ok('there is a way in and a way past', !!pitch.cta && /guest/.test(pitch.out || ''),
    pitch.cta + ' / ' + pitch.out);
  /* Nothing has been played yet, so the button must not promise to keep a season. */
  ok('the button does not promise to keep a season that has not happened',
    !/keep this season/i.test(pitch.cta || ''), pitch.cta);
  await p.screenshot({ path: SS + 'gate_pitch.png' });

  /* IT HAS TO FIT THE SMALLEST PHONE. Four rows and two buttons is a tall sheet, and a
     call to action below the fold is a call to action nobody makes. */
  await p.setViewportSize({ width: 320, height: 568 });
  await p.waitForTimeout(400);
  const fit = await p.evaluate(() => {
    const doc = document.documentElement;
    const cta = document.getElementById('gp-in');
    /* LINE BOXES, NOT HEIGHTS. Measuring scrollHeight against line-height counts the
       button's own padding as a second line and reports every button as wrapped. A Range
       over the text hands back one rect per line, which is the actual question. */
    const lines = (el) => { const r = document.createRange(); r.selectNodeContents(el);
      return r.getClientRects().length; };
    const box = cta ? cta.getBoundingClientRect() : null;
    return {
      over: [...document.querySelectorAll('#sheet-in *')]
        .filter((e) => e.getBoundingClientRect().right > doc.clientWidth + 1).length,
      wrapped: [...document.querySelectorAll('#sheet-in .btn')].filter((e) => lines(e) > 1).length,
      /* Without scrolling: the sticky action row must already be on screen. */
      onScreen: !!box && box.bottom <= doc.clientHeight + 1 && box.top >= 0,
    };
  });
  ok('nothing in the ask runs off a 320px screen', fit.over === 0, JSON.stringify(fit));
  ok('neither button wraps to two lines', fit.wrapped === 0, String(fit.wrapped));
  ok('the way in is on screen without scrolling for it', fit.onScreen, JSON.stringify(fit));
  await p.screenshot({ path: SS + 'gate_pitch_320.png' });
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(300);

  /* AND IT NEVER BLOCKS THE GAME. */
  await p.evaluate(() => document.getElementById('gp-x').click());
  await p.waitForTimeout(500);
  ok('dismissing it leaves the squad screen playable',
    !(await p.evaluate(() => document.getElementById('sheet').classList.contains('on')))
    && !!(await p.$('#s-squad.on')) && !!(await p.$('#b-play')));

  /* ONCE A DRAFT. Coming back to the squad screen must not ask again. */
  const again = await p.evaluate(() => {
    if (typeof paintSquad === 'function') paintSquad();
    return document.getElementById('sheet').classList.contains('on');
  }).catch(() => false);
  ok('and it does not ask twice in one draft', !again, String(again));

  ok('nothing logged', p.errs.length === 0, p.errs.join(' | ') || 'none');
  await p.close();
}

/* ── signed in ──────────────────────────────────────────────────────────────── */
{
  const p = await open(IN, 'a signed-in member');
  const a = await authOf(p);
  ok('no padlock on the home button', !a.padlock, JSON.stringify(a));

  await p.evaluate(() => document.getElementById('b-modes').click());
  await p.waitForTimeout(700);
  const sheet = await p.evaluate(() => {
    const s = document.getElementById('sheet-in');
    const conf = s.querySelector('.mc-conf');
    return { locked: !!(conf && conf.classList.contains('locked')),
      tag: conf ? conf.tagName : null, gate: !!s.querySelector('#gate-in'),
      id: conf ? conf.id : null };
  });
  ok('Conference Draft is a live button', !sheet.locked && sheet.tag === 'BUTTON'
    && sheet.id === 'b-mc-conf', JSON.stringify(sheet));
  ok('and nothing is being sold', !sheet.gate);
  /* It has to actually open, not merely look open. */
  await p.evaluate(() => document.getElementById('b-mc-conf').click());
  await p.waitForTimeout(500);
  ok('tapping it reaches the conference picker',
    (await p.$$eval('#sheet-in .confbtn', (e) => e.length)) === 5);
  await p.screenshot({ path: SS + 'gate_modes_open.png' });
  await p.evaluate(() => document.getElementById('cm-x').click());
  await p.waitForTimeout(400);

  ok('the draft finishes', await draftSix(p));
  ok('a member is not asked to sign in',
    !(await p.evaluate(() => document.getElementById('sheet').classList.contains('on'))));
  ok('nothing logged', p.errs.length === 0, p.errs.join(' | ') || 'none');
  await p.close();
}

/* ── accounts offline ───────────────────────────────────────────────────────── */
{
  const p = await open(null, 'accounts offline, which is an ad blocker');
  const gate = async () => {
    await p.evaluate(() => document.getElementById('b-modes').click());
    await p.waitForTimeout(700);
    const out = await p.evaluate(() => {
      const s = document.getElementById('sheet-in');
      const conf = s.querySelector('.mc-conf');
      return { locked: !!(conf && conf.classList.contains('locked')),
        padlock: !!document.getElementById('b-modes').querySelector('svg'),
        gate: (s.querySelector('.gate') || {}).textContent || '' };
    });
    await p.evaluate(() => document.getElementById('mm-x').click());
    await p.waitForTimeout(300);
    return out;
  };

  /* BEFORE THE DEADLINE it is a spinner, not an answer, and that is right: auth.js polls
     for the library for fifteen seconds before calling it blocked, because a slow
     connection and a blocked CDN look identical for the first fourteen of them. Saying
     "accounts are offline" at three seconds would be wrong most of the time it fired. */
  const early = await gate();
  ok('while the library might still land, it says it is checking',
    early.locked && /Checking your account/i.test(early.gate),
    early.gate.replace(/\s+/g, ' ').slice(0, 60));
  ok('and no padlock has appeared on the button yet', !early.padlock);

  /* AFTER IT, the answer names the cause. auth.js gives up at 15s. */
  await p.waitForTimeout(15000);
  const late = await gate();
  ok('once it gives up, the mode is locked', late.locked && late.padlock);
  ok('and it names the reason rather than saying "sign in"',
    /offline/i.test(late.gate) && /blocker/i.test(late.gate),
    late.gate.replace(/\s+/g, ' ').slice(0, 110));

  ok('the draft finishes', await draftSix(p));
  /* The one that would be actively rude: telling somebody to sign in when their browser
     is refusing to load the thing that would let them. */
  ok('and nobody is asked to do something they cannot do',
    !(await p.evaluate(() => document.getElementById('sheet').classList.contains('on'))));
  ok('nothing logged', p.errs.length === 0, p.errs.join(' | ') || 'none');
  await p.close();
}

await b.close();
console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
