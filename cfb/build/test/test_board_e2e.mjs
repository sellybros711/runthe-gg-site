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
import { execFileSync } from 'node:child_process';

const SS = '/tmp/claude-0/-home-user-runthe-gg-site/3b48ad95-6870-50f0-afce-ff2b1ab755e2/scratchpad/';
const UID = '11111111-1111-1111-1111-111111111111';
const NAME = 'coachprime';

/* THE SAME DATABASE THE POSTGREST STUB IS SERVING, or the guest-visibility checks
   below are meaningless: they count what is on the board against what is in the
   table, and those have to be one table. Defaults match the stub's own. */
const DB = process.argv[2] || 'cfbe2e';
const psql = (sql) => execFileSync('psql', ['-X', '-A', '-t', '-d', DB, '-c', sql],
  { encoding: 'utf8', env: { ...process.env, PGHOST: process.env.PGHOST || '/tmp',
    PGPORT: process.env.PGPORT || '5433', PGUSER: process.env.PGUSER || 'postgres' } }).trim();

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
  for (let i = 0; i < 20; i++) {
    /* Taking a dual-position player opens the slot sheet over the wheel, and the
       sheet swallows every click until it is answered. A loop that only knows
       about tiles retries until the suite times out, and whether it happens at
       all depends on what the wheel offered, which makes it read like a flake.
       Answer it with the first slot and carry on. */
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
  /* EMPTY FIRST, because this block asserts that a guest season is recorded and NOT
     listed, and "not listed" cannot be told apart from "listed among other rows"
     unless the board starts empty. Left over rows from an earlier run of this suite
     would make the guest-is-invisible check pass for the wrong reason. */
  psql('truncate cfb_runs');
  const page = await newPage(false);
  ok('accounts report themselves offline, not broken',
    (await page.evaluate(() => !!window.PS_CFB_AUTH)) === true);
  /* What the day window held BEFORE this season, so every count below is a delta. */
  const [beforeTotal, beforeNamed] = await page.evaluate(async () => {
    const cut = new Date(Date.now() - 36e5 * 12).toISOString();
    const n = async (extra) => {
      const r = await fetch('http://localhost:5555/rest/v1/cfb_runs?select=id&run_mode=eq.free'
        + '&created_at=gte.' + encodeURIComponent(cut) + extra);
      return (await r.json()).length;
    };
    return [await n(''), await n('&display_name=not.is.null')];
  });
  ok('reached the results screen', await playSeason(page));
  /* NOT "1ST OF 0". The board counts named seasons, this one is the only season on an
     empty board and it carries no name, so there is no field to place it in. The old
     assertion here wanted /of \d/ and would have passed on the nonsense the arithmetic
     produces. It asks for the invitation instead. */
  const place = (await page.textContent('#o-place')).replace(/\s+/g, ' ').trim();
  ok('an empty board offers a place rather than claiming one',
    /No named season/.test(place) && /Yours would be the first/.test(place), place.slice(0, 90));
  /* AND THE OFFER IS A BUTTON, not a sentence telling them to go and find one. This
     used to read "Sign in to put your name on it" with nothing to press, on the one
     screen where signing in is worth something. */
  const gate = await page.$('#o-place [data-gate="guest"]');
  ok('a guest is given something to press', !!gate,
    gate ? (await gate.textContent()) : 'no button');
  const row = await page.evaluate(() => fetch('http://localhost:5555/rest/v1/cfb_runs?select=id,display_name,user_id,wins,losses,national_rank,playoff_seed,made_playoffs,bowl,picks&order=id.desc&limit=1')
    .then(r => r.json()).then(a => a[0]));
  ok('the season reached the table', !!row, row ? JSON.stringify(row).slice(0, 130) : '');
  ok('a guest row has no owner and no name', !!row && row.user_id === null && row.display_name === null);
  ok('six picks stored as id:season', !!row && row.picks.length === 6 && /^[^:]+:\d{4}$/.test(row.picks[0]));
  await page.screenshot({ path: SS + 'e2e_guest_results.png', fullPage: true });

  console.log('\n=== a guest season is recorded but not listed ===');
  /* THE WHOLE POINT OF THE NAMED BOARD. The season above is in the table, and this
     asserts it is not on the list: a row reading "Anonymous" is exactly what the
     football board has always refused to show and what this one used to. */
  await page.click('#o-lb'); await page.waitForTimeout(2500);
  ok('the board opened', !!(await page.$('#s-board.on')));
  ok('one season is in the table', psql('select count(*) from cfb_runs') === '1');
  ok('and none of it is on the board', (await page.$$eval('.lbr', (e) => e.length)) === 0);
  ok('so the board says it is empty rather than showing Anonymous',
    /No seasons/.test(await page.textContent('#lb-rows')),
    (await page.textContent('#lb-rows')).replace(/\s+/g, ' ').trim().slice(0, 70));
  /* Both numbers, which is the line that keeps a guest season visible as ACTIVITY
     even though it is not on the list. */
  const cnt = (await page.textContent('#lb-count')).replace(/\s+/g, ' ').trim();
  ok('the count still credits the season played', /1 season/.test(cnt), cnt);
  ok('  ...and says none of them are on the board', /0 on the board/.test(cnt), cnt);
  await page.screenshot({ path: SS + 'e2e_board_guest.png', fullPage: true });
  /* THE PINNED PREVIEW ONLY EXISTS OVER A LIST. There is nothing on this board to
     preview a place among, and "where this season would sit: 1st" on top of "no seasons
     yet" contradicts itself -- so the invitation is the whole answer and the pin stays
     down, which is what the NFL game does with the same case. */
  ok('and no place is pinned over an empty board',
    (await page.$('#lb-mine:not([hidden])')) === null);
  /* Every axis and every direction must ANSWER: a note that does not say unreachable,
     and either rows or the panel that says there are none. Those are different facts
     from a board that did not reply, and only one of them can be true at a time. */
  for (const sort of ['overall', 'rank', 'record']) {
    await page.click('#lb-sort button[data-sort="' + sort + '"]');
    await page.waitForTimeout(1600);
    ok('sorting by ' + sort + ' keeps the guest off',
      (await page.$$eval('#lb-rows .lbr, #lb-podium .pod', (e) => e.length)) === 0);  }
  await page.click('#b-lb-dir'); await page.waitForTimeout(1600);
  ok('reversing answers too', /Worst first/.test(await page.textContent('#lb-dir-label')),
    await page.textContent('#lb-dir-label'));
  await page.click('#b-lb-dir'); await page.waitForTimeout(1600);
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

  /* THE OTHER HALF OF THE CONTRACT the guest block above only proves one side of: a
     named season IS on the board, under its name, marked as yours, and openable. */
  console.log('\n=== a named season is on the board ===');
  await page.click('#o-lb'); await page.waitForTimeout(2600);
  ok('the board opened', !!(await page.$('#s-board.on')));
  const n = await page.$$eval('#lb-rows .lbr, #lb-podium .pod', (e) => e.length);
  /* Exactly one: the table was truncated at the top of this suite and holds a guest
     season and this one, and only this one is named. */
  ok('it lists the season just played, and only it', n === 1, n + ' entries');
  const mine = await page.$$eval('#lb-rows .lbr.mine, #lb-podium .pod.mine', (e) => e.length);
  ok('and marks it as yours', mine === 1, mine + ' marked');
  const just = await page.$$eval('#lb-rows .lbr.just, #lb-podium .pod.just', (e) => e.length);
  ok('exactly one is the one just posted', just === 1, just + ' just');
  const shown = (await page.textContent('#lb-podium')) + (await page.textContent('#lb-rows'));
  ok('your own rows say You rather than your name',
    /You/.test(shown) && !new RegExp(NAME).test(shown), shown.replace(/\s+/g, ' ').slice(0, 80));
  /* Tapping it opens the season behind it, which is new and is the whole reason the
     rows carry a chevron. */
  /* .just, not .mine. On a database this suite has run against before, this account
     owns several seasons and some were seeded straight into the table with synthetic
     picks that do not resolve to six players -- so clicking "the first row of mine"
     opens whichever of them sorted highest and counts its roster. .just is the season
     THIS run played, and there is exactly one of it. */
  await page.click('#lb-podium .pod.just, #lb-rows .lbr.just');
  await page.waitForTimeout(900);
  const sheet = (await page.textContent('#sheet-in')).replace(/\s+/g, ' ');
  ok('tapping it opens the season', /Your season/.test(sheet), sheet.slice(0, 60));
  ok('with the six who played it', (await page.$$eval('#sheet-in .rrow', (e) => e.length)) === 6);
  await page.click('#sp-x'); await page.waitForTimeout(600);
  ok('and closing comes back to the board', !!(await page.$('#s-board.on')));  await page.screenshot({ path: SS + 'e2e_board_named.png', fullPage: true });

  console.log('\n=== the trophy case comes off the board when signed in ===');
  await page.click('#b-board-back'); await page.waitForTimeout(700);
  /* THE PROFILE IS A HUB AND FIVE PAGES NOW, not one sheet with a tab strip across
     the top. The route is the avatar, then the Trophy case row on the hub. The old
     `.achtabs button[data-tab="case"]` no longer exists, and a click on a selector
     that is not there is a thirty-second timeout that kills the run rather than a
     failed assertion, which is why this suite looked broken instead of red. */
  await page.click('#b-profile'); await page.waitForTimeout(900);
  await page.click('#pf-go-case'); await page.waitForTimeout(2500);
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
