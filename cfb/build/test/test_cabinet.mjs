/* The trophy case on a phone, drawn rather than counted.
 *
 *   (nohup node cfb/build/test/gzip_server.mjs &)
 *   node cfb/build/test/test_cabinet.mjs
 *
 * test_achievements.mjs proves the catalog is right. This proves it arrives on a
 * screen, which is a different claim and the one this game has got wrong before:
 * twice this month something measured clean and looked wrong anyway, once because
 * a sticker was anchored to the wrong element and once because receivers were
 * standing in the end zone. So this opens the case at 360px, adds up what the
 * shelves say, opens the biggest one, and checks nothing hangs off the side.
 *
 * The sign-in is stubbed because the full shelves are a signed-in feature, and the
 * board URL points at a dead port on purpose: the case has a documented fallback to
 * this browser's own seasons when the account's cannot be fetched, and that is the
 * path with the most rows behind it.
 */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
/* THE ARCADE AD IS TURNED OFF FOR THIS SUITE, the same way a player turns it off: it
   writes localStorage on the way in, exactly as ticking the box does. It opens 1.4s after
   the front page settles and covers the screen, so a suite that idles on the intro and
   then clicks would be clicking a backdrop. test_arcade_ad.mjs is where the ad itself is
   checked; everything here is about something else. */
const NO_ARCADE_AD = () => { try { localStorage.setItem('cfb_arcade_ad_off', '1'); } catch (e) {} };

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };

const UID='11111111-1111-1111-1111-111111111111';
const stub=`
window.supabase={createClient(){const session={access_token:'${UID}',user:{id:'${UID}',email:'coach@example.com'}};
return {auth:{onAuthStateChange(){return{data:{}}},getSession:()=>Promise.resolve({data:{session}}),
signOut:()=>Promise.resolve({})},
from(){return{select(){return{eq(){return{maybeSingle:()=>Promise.resolve({data:{username:'coachprime'}})}}}}}},
rpc:()=>Promise.resolve({data:true,error:null})}}};
window.PS_CFB_BOARD_URL='http://127.0.0.1:9';`;
const ctx = await b.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
await p.addInitScript(NO_ARCADE_AD);
await p.addInitScript(stub);
p.on('pageerror', (e) => { bad++; console.log(' FAIL  page error   ' + e.message); });

/* A career shaped like somebody who has been at it a while: fifty seasons, a few rings,
   a couple of bowls, so the cabinet has both halves to draw. */
await p.addInitScript(() => {
  const rows = [];
  for (let i = 0; i < 50; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString();
    rows.push({ created_at: d, wins: i % 5 === 0 ? 16 : 10, losses: i % 5 === 0 ? 0 : 3,
      reg_wins: i % 5 === 0 ? 12 : 9, reg_losses: i % 5 === 0 ? 0 : 3,
      title_won: i % 5 === 0, perfect: i % 5 === 0, made_playoffs: i % 3 === 0,
      seed: 1, national_rank: i % 5 === 0 ? 1 : 9, eliminated_in: null,
      bowl: i % 4 === 0, bowl_won: i % 4 === 0, bowl_tier: 'minor', bowl_key: 'spud_bowl',
      run_mode: 'free', chemistry_pct: 3.2, spend_musd: 8.4, overall: 92,
      perfect_pct: 88, respins: 1, sig_wins: 2, best_win_rank: 4, picks: [] });
  }
  localStorage.setItem('cfb_history', JSON.stringify(rows));
});
await p.goto('http://localhost:8081/cfb/index.html', { waitUntil: 'domcontentloaded', timeout: 40000 });
await p.waitForTimeout(3000);
await p.evaluate(() => document.getElementById('b-profile').click());
await p.waitForTimeout(900);
/* Straight to the trophy case rather than through the hub, which is a menu whose
   wording is not what this check is about. */
const hit = await p.evaluate(() => {
  const rows = [...document.querySelectorAll('#sheet-in button, #sheet-in .pfrow, #sheet-in a')];
  const t = rows.find((e) => /trophy case/i.test(e.textContent || ''));
  if (t) { t.click(); return true; }
  return false;
});
if (!hit) { console.log(' FAIL  the profile offers a way into the trophy case'); process.exit(1); }
await p.waitForTimeout(4000);

const head = await p.$$eval('.achgrp-h .achgrp-c', (els) => els.map((e) => e.textContent));
ok('every shelf has a heading with a count', head.length === 8, head.join('  '));
const totals = head.map((t) => Number(String(t).split('/')[1]));
const sum = totals.reduce((a, c) => a + c, 0);
ok('the shelves account for the whole catalog', sum > 0, String(sum));
const bannerTotal = await p.evaluate(() => window.PS_CFB_ACH.CATALOG.length);
ok('the module and the page agree on the count', bannerTotal === sum, bannerTotal + ' vs ' + sum);

/* Open the biggest shelf and look at it, because "the numbers add up" was true the last
   time something in this game was drawn in the wrong place. */
const which = totals.indexOf(Math.max.apply(null, totals));
await p.$$eval('.achgrp-h', (els, i) => els[i].click(), which);
await p.waitForTimeout(700);
const cards = await p.$$eval('.achgrp.open .ach', (els) => els.length);
ok('the biggest shelf opens and draws every card in it', cards === Math.max.apply(null, totals),
  cards + ' of ' + Math.max.apply(null, totals));

const overflow = await p.evaluate(() => {
  const doc = document.documentElement;
  const wide = [...document.querySelectorAll('.ach, .achgrp, .achgrp-h')]
    .filter((e) => e.getBoundingClientRect().right > doc.clientWidth + 1).length;
  return { wide, scrollW: doc.scrollWidth, clientW: doc.clientWidth };
});
ok('nothing in the cabinet runs off the side of the phone', overflow.wide === 0, JSON.stringify(overflow));
ok('the page itself does not scroll sideways', overflow.scrollW <= overflow.clientW + 1,
  overflow.scrollW + ' vs ' + overflow.clientW);

/* A card whose description wraps to nothing readable is a card nobody can use. */
const tiny = await p.$$eval('.achgrp.open .ach-d', (els) =>
  els.filter((e) => e.getBoundingClientRect().height < 8).length);
ok('every description on the open shelf has room to read', tiny === 0, String(tiny));

await p.screenshot({ path: process.env.SS ? process.env.SS + 'cabinet.png' : '/tmp/cfb_cabinet.png' });
await b.close();
console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
