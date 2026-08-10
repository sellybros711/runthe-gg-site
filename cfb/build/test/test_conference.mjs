/* Conference Draft, end to end.
 *
 *   (nohup python3 -m http.server 8080 &)
 *   (nohup node cfb/build/test/postgrest_stub.mjs 5555 cfbtest &)
 *   node cfb/build/test/test_conference.mjs
 *
 * The thing that matters most here is the one a screenshot cannot show: a Pac-12
 * draft must never once offer a team that was not in the Pac-12 THAT SEASON. So
 * every school the wheel puts up is looked up in the team data and checked against
 * the conference it was in that year, not against where that school plays now.
 * Oregon in 2005 is Pac-12; Oregon in 2025 is not.
 *
 * Two of these are here because they were wrong the first time they ran: the run
 * has to record which competition it belongs to, and the place on the results
 * screen has to be counted inside that competition rather than against every
 * season ever played.
 */
import { chromium } from 'playwright';

const SS = '/tmp/claude-0/-home-user-runthe-gg-site/3b48ad95-6870-50f0-afce-ff2b1ab755e2/scratchpad/';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
let bad = 0;
const ok = (name, pass, extra) => {
  if (!pass) bad++;
  console.log((pass ? '  ok   ' : ' FAIL  ') + name + (extra ? '   ' + extra : ''));
};

async function open() {
  const page = await browser.newPage({ viewport: { width: 600, height: 1000 } });
  page.on('pageerror', (e) => { console.log('  PAGE ERROR: ' + e.message); bad++; });
  await page.addInitScript("window.PS_CFB_BOARD_URL='http://localhost:5555';");
  await page.goto('http://localhost:8080/cfb/index.html', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForTimeout(2800);
  await page.evaluate(async () => {
    window.__teams = await fetch('data/cfb_team_seasons.json?v=1').then((r) => r.json());
  });
  return page;
}

const pickConference = async (page, conf) => {
  await page.click('#b-modes'); await page.waitForTimeout(450);
  await page.click('#b-mc-conf'); await page.waitForTimeout(450);
  await page.click('.confbtn[data-conf="' + conf + '"]'); await page.waitForTimeout(2600);
};

const whoIsUp = (page) => page.evaluate(() => {
  const sn = document.querySelector('#opts .tile:not(.off) .sn');
  return sn ? sn.textContent.trim() : null;
});

/* Signs six players, returning the "<year> <school>" of each team the wheel gave. */
async function draftSix(page) {
  const seen = [];
  for (let i = 0; i < 20; i++) {
    /* Taking a dual-position player opens the slot sheet over the wheel, and the
       sheet swallows every click until it is answered. See test_ranks_tab. */
    const slot = await page.$('#sheet.on .slotopt');
    if (slot) { await slot.click(); await page.waitForTimeout(900); continue; }
    const t = await page.$('#opts .tile:not(.off)');
    if (!t) { await page.waitForTimeout(1200); continue; }
    const who = await whoIsUp(page);
    if (who) seen.push(who);
    await t.click(); await page.waitForTimeout(2400);
    if (await page.$('#s-squad.on')) break;
  }
  return seen;
}

async function playOut(page) {
  await page.evaluate(() => { const x = document.getElementById('b-play'); if (x) x.click(); });
  await page.waitForTimeout(1100);
  for (let i = 0; i < 30; i++) {
    if (await page.$('#s-over.on')) break;
    await page.evaluate(() => {
      for (const id of ['b-sim', 'b-po-fast', 'b-po-skip', 'b-po', 'b-bowl-fast']) {
        const x = document.getElementById(id);
        if (x && !x.hidden && x.offsetParent !== null) { x.click(); return; }
      }
    });
    await page.waitForTimeout(1200);
  }
  await page.waitForTimeout(4000);
  return !!(await page.$('#s-over.on'));
}

/* Every school, against the conference it was in that season. */
const leaksIn = (page, seen, conf) => page.evaluate(([seen, conf]) => {
  const LINE = { 'Pac-10': 'Pac-12' };
  return seen.map((s) => {
    const m = /^(\d{4})\s+(.+)$/.exec(s);
    if (!m) return null;
    const t = window.__teams.find((x) => x.school === m[2] && x.season === +m[1]);
    const c = t ? (LINE[t.conference] || t.conference) : 'unknown';
    return c === conf ? null : (s + ' was ' + c);
  }).filter(Boolean);
}, [seen, conf]);

console.log('\n=== the wheel never leaves the conference ===');
{
  /* All five, because a leak would be specific to a conference whose name changed
     or whose members moved, which is most of them over twenty seasons. */
  const page = await open();
  for (const conf of ['SEC', 'Big Ten', 'Big 12', 'ACC', 'Pac-12']) {
    await page.evaluate(() => document.getElementById('b-home').click());
    await page.waitForTimeout(500);
    await pickConference(page, conf);
    const seen = [];
    const first = await whoIsUp(page);
    if (first) seen.push(first);
    /* Re-spun rather than signed, so this samples the wheel rather than one draft. */
    for (let i = 0; i < 3; i++) {
      const spun = await page.evaluate(() => {
        const b = document.querySelector('button.respin[data-kind="team"]');
        if (b) { b.click(); return true; }
        return false;
      });
      if (!spun) break;
      await page.waitForTimeout(2600);
      const who = await whoIsUp(page);
      if (who) seen.push(who);
    }
    const leaks = await leaksIn(page, seen, conf);
    ok(conf + ' offered only ' + conf + ' teams', leaks.length === 0 && seen.length > 0,
      seen.join(', ') + (leaks.length ? '   LEAKS: ' + leaks.join('; ') : ''));
  }
  await page.close();
}

console.log('\n=== a conference season, all the way through ===');
{
  const page = await open();
  await pickConference(page, 'Pac-12');
  ok('the draft screen says which competition', /Pac-12 draft/.test(await page.textContent('#d-mode')));
  const seen = await draftSix(page);
  ok('six were drafted', seen.length === 6, seen.join(' | '));
  ok('all six from the Pac-12 of their season', (await leaksIn(page, seen, 'Pac-12')).length === 0);
  ok('reached the results screen', await playOut(page));
  ok('the results screen says which competition', /Pac-12 draft/.test(await page.textContent('#o-mode')));
  await page.screenshot({ path: SS + 'conf_results.png', fullPage: true });

  const row = await page.evaluate(() => fetch('http://localhost:5555/rest/v1/cfb_runs?select=id,run_mode&order=id.desc&limit=1')
    .then((r) => r.json()).then((a) => a[0]));
  ok('the run recorded its competition', !!row && row.run_mode === 'conf:Pac-12',
    row ? row.run_mode : 'no row');

  const place = (await page.textContent('#o-place')).replace(/\s+/g, ' ');
  ok('the place is counted inside that competition', /Pac-12 draft seasons/.test(place),
    place.slice(0, 70));

  console.log('\n=== the boards stay apart ===');
  await page.click('#o-lb'); await page.waitForTimeout(2600);
  ok('the board opens on the competition just played',
    (await page.$eval('#lb-comp', (e) => e.value)) === 'conf:Pac-12');
  ok('and the season is on it', (await page.$$eval('.lbr', (e) => e.length)) >= 1);
  ok('the blurb says why it is its own board',
    /not the same competition/.test(await page.textContent('#lb-blurb')));
  await page.screenshot({ path: SS + 'conf_board.png', fullPage: true });
  await page.selectOption('#lb-comp', 'free'); await page.waitForTimeout(2200);
  /* Asked as "this row is not there", not as "nothing is there". The free-play
     board legitimately holds every free-play season anyone has finished, so an
     empty-board assertion only passed while the table happened to be empty and
     went red the moment another test left a free-play row behind. */
  const onFree = await page.evaluate((id) => fetch('http://localhost:5555/rest/v1/cfb_runs?select=id&run_mode=eq.free&id=eq.' + id)
    .then((r) => r.json()).then((a) => a.length), row.id);
  ok('and it is not on the free-play board', onFree === 0 &&
    (await page.$$eval('.lbr.me', (e) => e.length)) === 0);
  ok('every competition is selectable',
    (await page.$$eval('#lb-comp option', (e) => e.length)) === 6);
  await page.close();
}

console.log('\n=== the competition sticks, and clears where it should ===');
{
  const page = await open();
  await pickConference(page, 'SEC');
  ok('picking SEC starts an SEC draft', /SEC draft/.test(await page.textContent('#d-mode')));

  await page.evaluate(() => document.getElementById('b-home').click());
  await page.waitForTimeout(600);
  await page.evaluate(() => document.getElementById('b-play-intro').click());
  await page.waitForTimeout(2600);
  ok('going home and drafting again is free play',
    (await page.textContent('#d-mode')).trim() === '');

  await page.evaluate(() => document.getElementById('b-home').click());
  await page.waitForTimeout(500);
  await pickConference(page, 'Big Ten');
  await draftSix(page);
  await playOut(page);
  await page.click('#b-again'); await page.waitForTimeout(2600);
  ok('but Draft again keeps you in the conference',
    /Big Ten draft/.test(await page.textContent('#d-mode')),
    (await page.textContent('#d-mode')).trim());
  await page.close();
}

console.log('\n=== the way through to the other game ===');
{
  const page = await open();
  await page.click('#b-modes'); await page.waitForTimeout(500);
  ok('the cross-promo points at the NFL game',
    (await page.$eval('#b-mc-nfl', (e) => e.getAttribute('href'))) === '/football/');
  ok('under its own heading', /Love pro football/.test(await page.textContent('.xp-h')));
  await page.screenshot({ path: SS + 'modes_menu.png' });
  await page.close();
}

await browser.close();
console.log(bad ? '\nFAILURES: ' + bad : '\nall clear');
process.exit(bad ? 1 : 0);
