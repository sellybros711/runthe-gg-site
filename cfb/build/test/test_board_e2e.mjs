/* End to end: plays real seasons in a real browser and puts them on a real board.
 *
 *   psql -d cfbtest -f cfb/build/test/stub_supabase.sql
 *   psql -d cfbtest -f supabase/62_cfb_leaderboard.sql
 *   (nohup python3 -m http.server 8080 &)
 *   (nohup node cfb/build/test/postgrest_stub.mjs 5555 cfbtest &)
 *   node cfb/build/test/test_board_e2e.mjs
 *
 * The board the game talks to is PostgREST-shaped and backed by the real Postgres
 * function, so a season that reaches the table has passed the real validator. What
 * this proves that a unit test cannot: the URLs board.js builds parse, the payload
 * cfb_submit_run() receives is the one it expects, the Content-Range count comes
 * back as a number, and a board that is simply not there leaves the results screen
 * intact.
 *
 * SUPABASE-JS IS STUBBED, not loaded. The CDN is blocked in this environment, and
 * more to the point the thing worth testing here is the game's behaviour on either
 * side of a sign-in, not whether Supabase's own client works. The stub is the
 * narrow surface auth.js actually uses.
 */
import { chromium } from 'playwright';

const SS = '/tmp/claude-0/-home-user-runthe-gg-site/3b48ad95-6870-50f0-afce-ff2b1ab755e2/scratchpad/';
const UID = '11111111-1111-1111-1111-111111111111';
const NAME = 'coachprime';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
let bad = 0;
const ok = (name, pass, extra) => {
  if (!pass) bad++;
  console.log((pass ? '  ok   ' : ' FAIL  ') + name + (extra ? '   ' + extra : ''));
};

/* The slice of supabase-js auth.js touches, and nothing more. `signedIn` decides
   whether it hands back a session, so a test can run the same page signed out and
   signed in without an auth server. */
const supabaseStub = (signedIn) => `
window.__authListeners = [];
window.supabase = {
  createClient(url, key) {
    const session = ${signedIn} ? {
      access_token: '${UID}',
      user: { id: '${UID}', email: 'coach@example.com' },
    } : null;
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
        maybeSingle: () => Promise.resolve({ data: ${signedIn} ? { username: '${NAME}' } : null }),
      }; } }; } }; },
      rpc: (fn) => Promise.resolve({ data: fn === 'username_available' ? true : null, error: null }),
    };
  },
};
window.PS_CFB_BOARD_URL = 'http://localhost:5555';
`;

async function playSeason(page) {
  await page.evaluate(() => {
    const b = document.getElementById('b-play-intro') || document.getElementById('b-again');
    b.click();
  });
  await page.waitForTimeout(1400);
  for (let i = 0; i < 12; i++) {
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

async function newPage(signedIn) {
  const page = await browser.newPage({ viewport: { width: 600, height: 900 } });
  page.on('pageerror', (e) => { console.log('  PAGE ERROR: ' + e.message); bad++; });
  await page.addInitScript(supabaseStub(signedIn));
  await page.goto('http://localhost:8080/cfb/index.html', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForTimeout(2600);
  return page;
}

console.log('\n=== a guest finishes a season ===');
{
  const page = await newPage(false);
  ok('accounts report themselves offline, not broken',
    (await page.evaluate(() => !!window.PS_CFB_AUTH)) === true);
  ok('reached the results screen', await playSeason(page));
  const place = (await page.textContent('#o-place')).replace(/\s+/g, ' ').trim();
  ok('the results screen shows a place on the board', /of \d/.test(place), place.slice(0, 80));
  const row = await page.evaluate(() => fetch('http://localhost:5555/rest/v1/cfb_runs?select=id,display_name,user_id,wins,losses,national_rank,playoff_seed,made_playoffs,bowl,picks&order=id.desc&limit=1')
    .then(r => r.json()).then(a => a[0]));
  ok('the season reached the table', !!row, row ? JSON.stringify(row).slice(0, 130) : '');
  ok('a guest row has no owner and no name', !!row && row.user_id === null && row.display_name === null);
  ok('six picks stored as id:season', !!row && row.picks.length === 6 && /^[^:]+:\d{4}$/.test(row.picks[0]));
  await page.screenshot({ path: SS + 'e2e_guest_results.png', fullPage: true });

  console.log('\n=== the board screen ===');
  await page.click('#o-lb'); await page.waitForTimeout(2500);
  ok('the board opened', !!(await page.$('#s-board.on')));
  const rows = await page.$$eval('.lbr', (e) => e.length);
  ok('it lists the season just played', rows >= 1, rows + ' rows');
  ok('and marks it as yours', (await page.$$eval('.lbr.me', (e) => e.length)) === 1);
  ok('the count labels the board', /season/.test(await page.textContent('#lb-count')),
    await page.textContent('#lb-count'));
  await page.screenshot({ path: SS + 'e2e_board.png', fullPage: true });

  for (const sort of ['overall', 'rank', 'record']) {
    await page.click('#lb-sort button[data-sort="' + sort + '"]');
    await page.waitForTimeout(1600);
    const n = await page.$$eval('.lbr', (e) => e.length);
    ok('sorting by ' + sort + ' returns rows', n >= 1, n + ' rows');
  }
  for (const win of ['week', 'all', 'day']) {
    await page.click('#lb-tabs .tab[data-lb="' + win + '"]');
    await page.waitForTimeout(1500);
    ok('the ' + win + ' window loads', !/not reachable/.test(await page.textContent('#lb-note')));
  }
  await page.close();
}

console.log('\n=== a signed-in player finishes a season ===');
{
  const page = await newPage(true);
  const st = await page.evaluate(() => window.PS_CFB_AUTH.state());
  ok('the game sees the session', st.signedIn === true && st.name === NAME, JSON.stringify(st));
  ok('reached the results screen', await playSeason(page));
  const row = await page.evaluate(() => fetch('http://localhost:5555/rest/v1/cfb_runs?select=id,display_name,user_id&order=id.desc&limit=1')
    .then(r => r.json()).then(a => a[0]));
  ok('the season is attributed to the account', !!row && row.user_id === UID);
  ok('under the name from profiles, never the client', !!row && row.display_name === NAME,
    row ? String(row.display_name) : '');

  console.log('\n=== the trophy case comes off the board when signed in ===');
  await page.click('#b-profile'); await page.waitForTimeout(600);
  await page.click('.achtabs button[data-tab="case"]'); await page.waitForTimeout(2500);
  const caseText = (await page.textContent('#sheet-in')).replace(/\s+/g, ' ');
  ok('the case is populated', /Achievements \d+ of \d+/.test(caseText),
    (caseText.match(/Achievements \d+ of \d+/) || [''])[0]);
  ok('and says the seasons live on the account',
    /follows you to any device/.test(caseText));
  ok('badges were earned from the board rows',
    !/Achievements 0 of/.test(caseText));
  await page.screenshot({ path: SS + 'e2e_case_signedin.png', fullPage: true });
  await page.close();
}

console.log('\n=== a dead board must not break a finished season ===');
{
  const page = await browser.newPage({ viewport: { width: 600, height: 900 } });
  page.on('pageerror', (e) => { console.log('  PAGE ERROR: ' + e.message); bad++; });
  /* Point the board at a port with nothing on it. Every call fails; nothing else may. */
  await page.addInitScript(supabaseStub(false).replace('http://localhost:5555', 'http://localhost:5999'));
  await page.goto('http://localhost:8080/cfb/index.html', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForTimeout(2600);
  ok('reached the results screen with the board down', await playSeason(page));
  ok('the record is still on screen', /\d+-\d+/.test(await page.textContent('#o-rec')));
  ok('the roster is still on screen', (await page.$$eval('#o-rost .rrow', (e) => e.length)) === 6);
  const place = (await page.textContent('#o-place')).replace(/\s+/g, ' ').trim();
  ok('and it says so rather than inventing a rank', /not reachable/.test(place), place.slice(0, 70));
  /* Home first: #b-lb-intro lives on the front screen, and the results screen is
     what is showing. */
  await page.click('#b-home2'); await page.waitForTimeout(600);
  await page.click('#b-lb-intro'); await page.waitForTimeout(2500);
  ok('the board says it is not reachable', /not reachable/.test(await page.textContent('#lb-note')));
  ok('and the diagnostics name the reason', await (async () => {
    await page.click('#b-diag'); await page.waitForTimeout(2500);
    return /Could not reach|not there/.test(await page.textContent('#lb-note'));
  })(), await page.textContent('#lb-note'));
  await page.screenshot({ path: SS + 'e2e_board_down.png', fullPage: true });
  await page.close();
}

await browser.close();
console.log(bad ? '\nFAILURES: ' + bad : '\nall clear');
process.exit(bad ? 1 : 0);
