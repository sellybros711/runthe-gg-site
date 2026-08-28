/* A season you just played has to be in your stats.
 *
 *   psql -d cfbe2e -f cfb/build/test/stub_supabase.sql
 *   psql -d cfbe2e -f supabase/62_cfb_leaderboard.sql   (and 63, 64, 66, 67, 86)
 *   (nohup python3 -m http.server 8080 &)
 *   (nohup node cfb/build/test/postgrest_stub.mjs 5555 cfbe2e &)
 *   node cfb/build/test/test_career_cache.mjs [db]
 *
 * WHY THIS SUITE EXISTS. A signed-in player's career comes off the board, not out of
 * this browser, and it is fetched once per sign-in and held, because the profile is
 * opened far more often than it changes. That is right for a list that changes almost
 * never and wrong at the one moment it does: finishing a season. Nothing invalidated the
 * cache when a season was filed, so a player who had opened the profile at any point
 * earlier in the page's life finished a season and watched it not appear. Seasons
 * played did not move, best overall did not move, the trophy case did not light, and
 * nothing brought any of it back short of reloading the page. It reached us as a bug
 * report reading "I had a perfect 15-0 season just disappear off my stats."
 *
 * IT ONLY HAPPENS ON THE SECOND LOOK, which is why nobody caught it: on a page where the
 * profile has never been opened there is nothing cached and the season shows up
 * correctly. So the test below opens the profile FIRST and that ordering is the whole
 * point of it. Both orders are checked, because the one that always worked is the one a
 * fix could plausibly break.
 *
 * Supabase-js is stubbed the way test_board_e2e.mjs stubs it: the narrow surface auth.js
 * actually touches, always signed in. The board underneath is the real Postgres function.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';

const UID = '11111111-1111-1111-1111-111111111111';
const NAME = 'coachprime';
const DB = process.argv[2] || 'cfbe2e';
const psql = (sql) => execFileSync('psql', ['-X', '-A', '-t', '-d', DB, '-c', sql],
  { encoding: 'utf8', env: { ...process.env, PGHOST: process.env.PGHOST || '/tmp',
    PGPORT: process.env.PGPORT || '5433', PGUSER: process.env.PGUSER || 'postgres' } }).trim();

let bad = 0;
const ok = (name, pass, extra) => {
  if (!pass) bad++;
  console.log((pass ? '  ok   ' : ' FAIL  ') + name + (extra ? '   ' + extra : ''));
};

const supabaseStub = `
window.__authListeners = [];
window.supabase = {
  createClient(url, key) {
    const session = { access_token: '${UID}', user: { id: '${UID}', email: 'coach@example.com' } };
    return {
      auth: {
        onAuthStateChange(f) { window.__authListeners.push(f); return { data: {} }; },
        getSession: () => Promise.resolve({ data: { session } }),
        signInWithPassword: () => Promise.resolve({ error: null }),
        signUp: () => Promise.resolve({ error: null }),
        signInWithOAuth: () => Promise.resolve({ error: null }),
        signOut: () => Promise.resolve({}),
      },
      from() { return { select() { return { eq() { return {
        maybeSingle: () => Promise.resolve({ data: { username: '${NAME}' } }),
      }; } }; } }; },
      rpc: (fn) => Promise.resolve({ data: fn === 'username_available' ? true : null, error: null }),
    };
  },
};
window.PS_CFB_BOARD_URL = 'http://localhost:5555';
`;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});

async function newPage() {
  const page = await browser.newPage({ viewport: { width: 600, height: 900 } });
  page.on('pageerror', (e) => { console.log('  PAGE ERROR: ' + e.message); bad++; });
  await page.addInitScript(supabaseStub);
  await page.goto('http://localhost:8080/cfb/index.html',
    { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForTimeout(2600);
  return page;
}

/* THE SHEET IS CLOSED BY HAND ON THE WAY IN AS WELL AS OUT. The results screen can leave
   one open behind it, and openProfile paints into the same sheet, so a stale one would
   have this reading the panel it was already showing. */
async function hub(page) {
  await page.evaluate(() => { document.getElementById('sheet').classList.remove('on'); });
  await page.click('#b-profile');
  await page.waitForTimeout(2600);
  const out = {
    runs: (await page.textContent('#pf-runs')).trim(),
    best: (await page.textContent('#pf-best')).trim(),
  };
  await page.evaluate(() => { document.getElementById('sheet').classList.remove('on'); });
  return out;
}

/* The seasons list, as many rows as it drew. */
async function seasonRows(page) {
  await page.evaluate(() => { document.getElementById('sheet').classList.remove('on'); });
  await page.click('#b-profile');
  await page.waitForTimeout(1200);
  await page.click('#pf-go-seasons');
  await page.waitForTimeout(2600);
  const n = await page.$$eval('#pf-list .bestrow', (els) => els.length);
  await page.evaluate(() => { document.getElementById('sheet').classList.remove('on'); });
  return n;
}

async function playSeason(page) {
  await page.evaluate(() => {
    const b = document.getElementById('b-play-intro') || document.getElementById('b-again');
    b.click();
  });
  await page.waitForTimeout(1400);
  for (let i = 0; i < 20; i++) {
    const slot = await page.$('#sheet.on .slotopt');
    if (slot) { await slot.click(); await page.waitForTimeout(900); continue; }
    const t = await page.$('#opts .tile:not(.off)');
    if (!t) { await page.waitForTimeout(1300); continue; }
    await t.click();
    await page.waitForTimeout(2500);
    if (await page.$('#s-squad.on')) break;
  }
  await page.evaluate(() => { const b = document.getElementById('b-play'); if (b) b.click(); });
  await page.waitForTimeout(1100);
  for (let i = 0; i < 30; i++) {
    if (await page.$('#s-over.on')) break;
    await page.evaluate(() => {
      for (const id of ['b-sim', 'b-po-fast', 'b-po-skip', 'b-po', 'b-bowl-fast']) {
        const b = document.getElementById(id);
        if (b && !b.hidden && b.offsetParent !== null) { b.click(); return; }
      }
    });
    await page.waitForTimeout(1200);
  }
  await page.waitForTimeout(4000);
  return !!(await page.$('#s-over.on'));
}

const onBoard = () => Number(psql(
  `select count(*) from cfb_runs where user_id = '${UID}'`));

console.log('\n=== the profile was opened before the season was played ===');
{
  psql('truncate cfb_runs');
  const page = await newPage();
  const before = await hub(page);
  ok('an empty career reads as none', before.runs === '0', JSON.stringify(before));
  ok('reached the results screen', await playSeason(page));
  ok('the season reached the board', onBoard() === 1, 'rows: ' + onBoard());
  const after = await hub(page);
  /* THE ASSERTION THIS SUITE WAS WRITTEN FOR. Before the fix this read 0 with the row
     sitting in the table, which is a player being told the season they just finished
     never happened. */
  ok('and the profile counts it', after.runs === '1', JSON.stringify(after));
  ok('best overall is a number rather than a dash', /^\d/.test(after.best), after.best);
  ok('the seasons list has a row in it', (await seasonRows(page)) >= 1);
  await page.close();
}

console.log('\n=== a second season, with the first one already cached ===');
{
  psql('truncate cfb_runs');
  const page = await newPage();
  await hub(page);
  ok('reached the results screen', await playSeason(page));
  const one = await hub(page);
  ok('one season', one.runs === '1', JSON.stringify(one));
  ok('reached the results screen again', await playSeason(page));
  ok('two seasons on the board', onBoard() === 2, 'rows: ' + onBoard());
  const two = await hub(page);
  ok('and the profile counts both', two.runs === '2', JSON.stringify(two));
  ok('the seasons list has both', (await seasonRows(page)) >= 2);
  await page.close();
}

console.log('\n=== the profile was never opened, which always worked ===');
{
  psql('truncate cfb_runs');
  const page = await newPage();
  ok('reached the results screen', await playSeason(page));
  const after = await hub(page);
  ok('the first look at the profile has it', after.runs === '1', JSON.stringify(after));
  await page.close();
}

await browser.close();
console.log(bad ? '\n' + bad + ' FAILED\n' : '\nall good\n');
process.exit(bad ? 1 : 0);
