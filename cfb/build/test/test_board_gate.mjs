/* The board behind glass, and the offer standing on it.
 *
 *   (nohup python3 -m http.server 8080 &)
 *   (nohup node cfb/build/test/postgrest_stub.mjs 5555 cfbe2e &)
 *   node cfb/build/test/test_board_gate.mjs [db]
 *
 * A guest could read the whole leaderboard and never be on it. Blurred now, with the ask
 * on top of it. Four things have to hold, and only the first is obvious:
 *
 *   a guest             sees the shape and cannot read the names
 *   a member            sees the board, clean, with nothing sold on it
 *   accounts offline    sees the board, clean, because a wall with no door is just a wall
 *   an empty board      is not blurred at all, because there is nothing to promise
 *
 * The third is the one that would ship broken and never be noticed by anybody testing on a
 * machine where the sign-in script loads. The fourth is the one that reads as a bug to the
 * player: a card promising a leaderboard, over a panel that says nobody has played yet.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'child_process';
const SS = process.env.SS || '/tmp/';
const DB = process.argv[2] || 'cfbe2e';
const HOST = process.env.HOST || 'http://localhost:8080';

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };
const psql = (sql) => execFileSync('psql', ['-d', DB, '-tAq', '-c', sql], { encoding: 'utf8' }).trim();

/* Enough named seasons for a podium and a list under it. Seeded rather than played,
   because what is under test is the glass and not the game. */
psql("delete from cfb_runs where display_name like 'glass%'");
for (let i = 0; i < 8; i++) {
  psql(`insert into cfb_runs (user_id, display_name, run_mode, regular_wins, playoff_wins,
    wins, losses, games, national_rank, playoff_seed, made_playoffs, title_won, perfect,
    bowl, bowl_won, seed_label, point_diff, chemistry_pct, spend_musd, respins, sig_wins,
    overall, picks, slots)
    values (null, 'glass${i}', 'free', ${12 - i}, 2, ${14 - i}, ${i}, ${16},
    ${i + 1}, ${i + 1}, true, ${i === 0}, false, false, false, 'No. ${i + 1} seed',
    ${(30 - i * 2).toFixed(1)}, 3.0, 8.5, 0, 4, ${(102 - i).toFixed(2)},
    array['1|2019','2|2019','3|2019','4|2019','5|2019','6|2019'],
    array['QB','RB','WR','WR','FLEX','FLEX'])`);
}

const OUT = `window.supabase={createClient(){return{
  auth:{onAuthStateChange(){return{data:{}}},
    getSession:()=>Promise.resolve({data:{session:null}}),
    signOut:()=>Promise.resolve({})},
  from(){return{select(){return{eq(){return{maybeSingle:()=>Promise.resolve({data:null})}}}}}},
  rpc:()=>Promise.resolve({data:null,error:null})}}};`;
const IN = `window.supabase={createClient(){return{
  auth:{onAuthStateChange(cb){setTimeout(()=>cb('SIGNED_IN',{user:{id:'u1',email:'a@b.c'}}),0);return{data:{}}},
    getSession:()=>Promise.resolve({data:{session:{user:{id:'u1',email:'a@b.c'}}}}),
    signOut:()=>Promise.resolve({})},
  from(){return{select(){return{eq(){return{maybeSingle:()=>Promise.resolve({data:{username:'tester'}})}}}}}},
  rpc:()=>Promise.resolve({data:null,error:null})}}};`;

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

async function board(stub, label, waitMs) {
  const p = await b.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  await p.addInitScript(`window.PS_CFB_BOARD_URL='http://localhost:5555';
    window.PS_CFB_RANKS_LIVE=true; ${stub || ''}`);
  await p.goto(HOST + '/cfb/index.html', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await p.waitForTimeout(waitMs || 2600);
  await p.click('#b-lb-intro');
  await p.waitForTimeout(2400);
  console.log('\n=== ' + label + ' ===');
  return p;
}

const state = (p) => p.evaluate(() => {
  const wrap = document.getElementById('lb-lock');
  const gate = document.getElementById('lb-gate');
  const inner = wrap.querySelector('.lblock-in');
  return {
    locked: wrap.classList.contains('locked'),
    blur: getComputedStyle(inner).filter,
    gateShown: !gate.hidden && gate.getBoundingClientRect().height > 0,
    gateText: (gate.textContent || '').replace(/\s+/g, ' ').trim(),
    perks: [...gate.querySelectorAll('.perk b')].map((e) => e.textContent),
    rows: document.querySelectorAll('#lb-rows .lbr').length,
    /* The two things that must stay readable either way: how big the field is, and how
       many of it are on the board. That count is the whole reason to want in. */
    countBlurred: getComputedStyle(document.getElementById('lb-count')).filter !== 'none',
    count: (document.getElementById('lb-count').textContent || '').replace(/\s+/g, ' ').trim(),
    capped: wrap.getBoundingClientRect().height < 620,
    /* THE ASK HAS TO BE ON SCREEN WITHOUT HUNTING FOR IT. The board screen has a sticky
       footer pinned over the bottom of the page, so "in the viewport" is not enough: the
       button has to clear that dock too, or it is a call to action sitting behind two
       other buttons. Measured at the moment the board opens, unscrolled. */
    cta: (() => {
      const btn = document.getElementById('lb-gate-in');
      if (!btn) return null;
      const r = btn.getBoundingClientRect();
      const dock = document.querySelector('.lbfoot');
      const top = dock ? dock.getBoundingClientRect().top : window.innerHeight;
      return { top: Math.round(r.top), bottom: Math.round(r.bottom),
        dockTop: Math.round(top), clear: r.bottom <= top + 1 && r.top >= 0 };
    })(),
  };
});

/* ── a guest ────────────────────────────────────────────────────────────────── */
{
  const p = await board(OUT, 'a guest');
  const s = await state(p);
  ok('the board is behind glass', s.locked && /blur/.test(s.blur), s.blur);
  ok('the rows are still under it', s.rows > 0, String(s.rows));
  ok('and the slab is capped rather than five hundred blurred rows', s.capped);
  ok('the ask is on top of it', s.gateShown && !!s.cta);
  ok('and its button is on screen without scrolling for it', s.cta && s.cta.clear,
    JSON.stringify(s.cta));
  ok('it lists what the board gives you', s.perks.length === 3, s.perks.join(' | '));
  ok('and every one of them is about this screen',
    s.perks.every((t) => /board|place|season/i.test(t)), s.perks.join(' | '));
  /* THE REASSURANCE HAS TO SURVIVE THE TRIM. A card that only lists what is missing reads
     as "you have been playing for nothing", so somewhere on it, it still has to say the
     season counts. It moved from the paragraph into the first bullet rather than being
     said twice; what this pins is that it is said at all. */
  ok('it says a guest season is ranked anyway', /ranked but never listed/i.test(s.gateText),
    s.gateText.slice(0, 120));
  /* THE COUNT IS THE ARGUMENT. "2,719 on the board" over a blurred list is the reason
     anybody presses the button, so it must not be behind the glass with the names. */
  ok('the count above it stays readable', !s.countBlurred && /season/i.test(s.count), s.count);
  await p.screenshot({ path: SS + 'board_gate_guest.png' });

  /* AND ON THE SMALLEST PHONE, where it cannot fit above the fold and does not have to.
     What it must not do is sit permanently behind the sticky dock, which is a button you
     can never reach however far you scroll. */
  await p.setViewportSize({ width: 320, height: 568 });
  await p.waitForTimeout(500);
  await p.evaluate(() => {
    const s = document.getElementById('s-board');
    (s.scrollHeight > s.clientHeight ? s : document.scrollingElement).scrollTop = 99999;
  });
  await p.waitForTimeout(500);
  const small = await state(p);
  ok('at 320px the button is reachable by scrolling', small.cta && small.cta.clear,
    JSON.stringify(small.cta));
  ok('and nothing runs off the side', await p.evaluate(() => {
    const doc = document.documentElement;
    return [...document.querySelectorAll('#lb-gate *')]
      .every((e) => e.getBoundingClientRect().right <= doc.clientWidth + 1);
  }));
  await p.screenshot({ path: SS + 'board_gate_guest_320.png' });
  ok('nothing logged', p.errs.length === 0, p.errs.join(' | ') || 'none');
  await p.close();
}

/* ── a member ───────────────────────────────────────────────────────────────── */
{
  const p = await board(IN, 'a signed-in member');
  const s = await state(p);
  ok('the board is clear', !s.locked && s.blur === 'none', s.blur);
  ok('and nothing is being sold on it', !s.gateShown);
  ok('the rows are readable', s.rows > 0, String(s.rows));
  await p.screenshot({ path: SS + 'board_gate_member.png' });
  ok('nothing logged', p.errs.length === 0, p.errs.join(' | ') || 'none');
  await p.close();
}

/* ── accounts offline ───────────────────────────────────────────────────────── */
{
  /* No stub at all, and waited past auth.js's fifteen second deadline, which is the state
     of anybody whose ad blocker eats the sign-in script. Charging them for the board would
     be a wall with no door in it. */
  const p = await board(null, 'accounts offline, which is an ad blocker', 17000);
  const s = await state(p);
  ok('the board is clear', !s.locked && s.blur === 'none', s.blur);
  ok('and nobody is asked to do something they cannot do', !s.gateShown);
  ok('nothing logged', p.errs.length === 0, p.errs.join(' | ') || 'none');
  await p.close();
}

/* ── an empty board ─────────────────────────────────────────────────────────── */
{
  psql("delete from cfb_runs where display_name like 'glass%'");
  const p = await board(OUT, 'a guest, with nobody on the board yet');
  const s = await state(p);
  ok('an empty board is not blurred', !s.locked, s.blur);
  ok('and nothing is promised over it', !s.gateShown, s.gateText.slice(0, 60));
  ok('nothing logged', p.errs.length === 0, p.errs.join(' | ') || 'none');
  await p.close();
}

await b.close();
console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
