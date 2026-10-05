/* Do the run games deal players a younger fan knows?
 *
 * The owner played four games in a row and wrote in about each one. Alma
 * Mater's second card was Chet Walker. Career Path opened on a 1960s Yankee
 * outfielder. Guess the Player gave eight tries to find one man in the whole
 * history of baseball. Nothing was broken: every one of those is a correct
 * deal under the old rules, which is why only a person could report it.
 *
 * Two flags (arcade/flags.js), both on from 2026-10-06 so the board in play
 * the day they shipped did not move under anybody:
 *
 *   eras     Career Path. The first eight cards are careers that reached the
 *            1990s, the next eight the 1970s, anyone after (fame.js).
 *   current  Guess the Player, Alma Mater, Number Game. Today's players only,
 *            read off rosters.js, which is the authority on who is on a club.
 *
 * Each game is driven in a real browser with the flag previewed on, and
 * again with it off, and the deal is read through the page's own read-only
 * hook. With a flag off the deal has to be what it was: check-content holds
 * that against a recording.
 *
 *   node scripts/check-current.mjs
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require_ = createRequire(import.meta.url);
let chromium = null;
try { ({ chromium } = require_('playwright')); }
catch (_) { try { ({ chromium } = require_('/opt/node22/lib/node_modules/playwright')); } catch (e) { chromium = null; } }
if (!chromium) { console.error('playwright is not installed'); process.exit(2); }
const EXE = ['/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
             '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((f) => existsSync(f));

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const PORT = 8898;
let bad = 0;
const fail = (m) => { console.error('  FAIL ' + m); bad++; };
const ok = (m) => console.log('  ok   ' + m);

/* ---- 0. the flags switch on the day after, not the day they shipped ------ */
console.log('0. the switch date');
{
  const box = { localStorage: null };
  new Function('self', 'module', readFileSync(path.join(ROOT, 'arcade/flags.js'), 'utf8'))(box, {});
  const F = box.RTGFlags;
  for (const n of ['eras', 'current']) {
    if (!F.FLAGS[n]) { fail('flag ' + n + ' is gone'); continue; }
    if (F.on(n, '2026-10-05')) fail(n + ' is on for 2026-10-05, the board that was in play when it shipped');
    else if (!F.on(n, '2026-10-06')) fail(n + ' is not on for 2026-10-06');
    else ok(n + ' is off for an archived day before the switch and on from 2026-10-06');
  }
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
                '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = await new Promise((res) => {
  const s = createServer((req, rep) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p.replace(/^\/+/, ''));
    if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) { rep.writeHead(404).end(); return; }
    rep.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
  });
  s.listen(PORT, () => res(s));
});
const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});

async function open(game, flags, at) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  // A card holder, signed in, past the first-visit cards: the shape
  // scripts/lib/arcade-harness.mjs gives its 'card' tier. Roll Call is a card
  // game, and a guest meets the sign-in sheet over the start button.
  await ctx.addInitScript((g) => { try {
    localStorage.setItem('runthegrid_pro', '1');
    localStorage.setItem('sb-jcrrxqfpdelrmvjuihnm-auth-token', JSON.stringify({ access_token: 'harness', user: { id: '00000000-0000-4000-8000-000000000001' } }));
    localStorage.setItem('rtg:howto:' + g, '1'); localStorage.setItem('rtg:howto2:' + g, '1');
  } catch (e) {} }, game);
  const page = await ctx.newPage();
  // A fixed day, when the claim is about one board. Timers still run.
  if (at) await page.clock.setFixedTime(new Date(at + 'T12:00:00'));
  for (const pat of ['**cdn.jsdelivr.net**', '**supabase.co**', '**googlesyndication.com**', '**googletagmanager.com**',
                     '**google-analytics.com**', '**doubleclick.net**', '**fonts.googleapis.com**', '**fonts.gstatic.com**']) {
    await page.route(pat, (r) => r.abort());
  }
  await page.goto('http://localhost:' + PORT + '/arcade/' + game + '/?flags=' + flags, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(1500);
  return { page, close: () => ctx.close() };
}
// who is on a club today, by name, the same way every page reads it
const onRoster = () => {
  const on = {};
  ((window.RTG_ROSTERS && window.RTG_ROSTERS.players) || []).forEach((p) => { if (p && p.n) on[p.s + '|' + p.n] = 1; });
  return on;
};
const last = (d) => (d && d.length ? Math.max(...d) : 0);

/* ---- 1. Career Path: old careers come late ------------------------------ */
console.log('\n1. Career Path, flag eras');
{
  for (const sp of ['all']) {
    const { page, close } = await open('career', 'eras');
    const deal = await page.evaluate(() => window.__rtgDeal(30).map((r) => ({ n: r.target.name, d: r.target.decade || [] })));
    const steps = await page.evaluate(() => window.RTGFame.ERA_STEPS);
    const early = deal.filter((r, k) => {
      const floor = (steps.find((s) => k < s[0]) || [0, 0])[1];
      return floor && last(r.d) && last(r.d) < floor;
    });
    if (deal.length < 20) fail('only ' + deal.length + ' cards dealt');
    else if (early.length) fail('too early for their era: ' + early.map((r) => r.n + ' (' + last(r.d) + 's)').join(', '));
    else ok('the first ' + steps[0][0] + ' cards reached the ' + steps[0][1] + 's, the next to ' + steps[1][0] + ' the ' + steps[1][1] + 's: ' + deal.slice(0, 4).map((r) => r.n).join(', ') + ' ...');
    await close();
    // and the gate is what did it: with the flag off the opening is not held
    const off = await open('career', '-eras');
    const offDeal = await off.page.evaluate(() => window.__rtgDeal(30).map((r) => r.target.name));
    if (JSON.stringify(offDeal) === JSON.stringify(deal.map((r) => r.n))) fail('the deal is the same with the flag off: the gate does nothing');
    else ok('with the flag off the day deals as it did');
    await off.close();
  }
}

/* ---- 1b. Career Path: careers that reached the 2020s --------------------- */
console.log('\n1b. Career Path, flag current');
{
  /* The eras gate let the 1970s in by the seventeenth card, and the owner's
     answer was that nobody wants those at all. Every answer has to have
     played into the 2020s, and every wrong name beside it into the 2010s. */
  const { page, close } = await open('career', 'current,eras');
  const deal = await page.evaluate(() => window.__rtgDeal(60).map((r) => ({
    n: r.target.name, act: !!r.target.act, d: r.target.decade || [],
    o: r.opts.filter((o) => o.id !== r.target.id).map((o) => ({ n: o.name, act: !!o.act, d: o.decade || [] })) })));
  const old = deal.filter((r) => !r.act && last(r.d) < 2020);
  const oldOpt = deal.flatMap((r) => r.o).filter((o) => !o.act && last(o.d) < 2010);
  if (deal.length < 40) fail('only ' + deal.length + ' cards dealt');
  else if (old.length) fail(old.length + ' answers did not play into the 2020s: ' + old.slice(0, 6).map((r) => r.n + ' (' + last(r.d) + 's)').join(', '));
  else ok(deal.length + ' cards, every answer played into the 2020s: ' + deal.slice(0, 4).map((r) => r.n).join(', ') + ' ...');
  if (oldOpt.length) fail(oldOpt.length + ' wrong names are older than the 2010s: ' + oldOpt.slice(0, 6).map((o) => o.n).join(', '));
  else ok('and so did every wrong name beside them');
  await close();
  // the gate is what did it: with the flag off the older careers are dealt
  const off = await open('career', '-current,-eras');
  const offOld = await off.page.evaluate(() => window.__rtgDeal(60).filter((r) => !r.target.act && window.RTGFame.lastDecade(r.target) < 2020).length);
  if (!offOld) fail('with the flag off no older career is dealt either, so this proves nothing');
  else ok('with the flag off ' + offOld + ' of 60 answers are older careers');
  await off.close();
}

/* ---- 2. Alma Mater: current players only -------------------------------- */
console.log('\n2. Alma Mater, flag current');
{
  const { page, close } = await open('almamater', 'current');
  const r = await page.evaluate((onR) => {
    const on = (new Function('return (' + onR + ')'))()();
    const deal = window.__rtgDeal(40);
    return { n: deal.length, gone: deal.filter((x) => !on[x.target.sport + '|' + x.target.name]).map((x) => x.target.name), first: deal.slice(0, 4).map((x) => x.target.name) };
  }, onRoster.toString());
  if (r.n < 30) fail('only ' + r.n + ' cards dealt');
  else if (r.gone.length) fail(r.gone.length + ' not on a roster today: ' + r.gone.slice(0, 6).join(', '));
  else ok(r.n + ' cards, every one on a roster today: ' + r.first.join(', ') + ' ...');
  await close();
}

/* ---- 3. Guess the Player: the answer and the guesses are today's -------- */
console.log('\n3. Guess the Player, flag current');
{
  const on = await open('guess', 'current'), off = await open('guess', '-current');
  const a = await on.page.evaluate((onR) => {
    const R = (new Function('return (' + onR + ')'))()();
    const g = window.__rtgGuess();
    const lead = (document.querySelector('.lead .v') || {}).textContent || '';
    return { g: { current: g.current, target: g.target, pool: g.pool, sport: g.sport, guessable: g.guessable }, gone: g.targets.filter((k) => !R[k]).length, total: g.targets.length, lead };
  }, onRoster.toString());
  const b = await off.page.evaluate(() => window.__rtgGuess());
  if (!a.g.current) fail('the flag did not reach the page');
  else if (a.gone) fail(a.gone + ' of ' + a.total + ' possible answers are not on a roster today');
  else {
    /* A count is the wrong claim: the current list adds every rostered
       player the corpus never had, so for the NBA it can land on the same
       size as the all-time one by coincidence (581 and 581). What the flag
       promises is that a retired name is not offered as a guess. */
    const RETIRED = ['Michael Jordan', 'Larry Bird', 'Tom Brady', 'Peyton Manning', 'Derek Jeter', 'Babe Ruth'];
    const hasOn = await on.page.evaluate((n) => window.__rtgGuessHas(n), RETIRED);
    const hasOff = await off.page.evaluate((n) => window.__rtgGuessHas(n), RETIRED);
    // and the all-time list really does offer them, or this proves nothing
    if (hasOff.length < 4) fail('the all-time guess list offers only ' + hasOff.length + ' of the retired names this asks about');
    else if (hasOn.length) fail('the current guess list still offers retired players: ' + hasOn.join(', '));
    else ok('answer ' + a.g.target + '; ' + a.total + ' possible answers, all on a roster; guessable ' + JSON.stringify(a.g.guessable) + ' against ' + JSON.stringify(b.guessable) + ' any era');
  }
  if (!/^A current /.test(a.lead.trim())) fail('the lead still reads ' + JSON.stringify(a.lead.trim().slice(0, 60)));
  else ok('and it says so: ' + JSON.stringify(a.lead.trim().slice(0, 40)));
  if (b.current) fail('the flag is on with it turned off');
  /* A rostered player the corpus holds no career for can be guessed, and
     his row draws: the columns read a career, and his is built from the
     roster row. Submitted through the real input. */
  const errs = [];
  on.page.on('pageerror', (e) => errs.push(String(e)));
  const name = await on.page.evaluate(() => window.__rtgGuess().rosterOnly);
  if (!name) fail('no roster-only player in the guess pool');
  else {
    await on.page.fill('#q', name);
    await on.page.waitForTimeout(300);
    await on.page.press('#q', 'Enter');
    await on.page.waitForTimeout(500);
    const row = await on.page.evaluate((n) => [...document.querySelectorAll('.nm')].some((x) => x.textContent.trim() === n), name);
    if (!row) fail(name + ' was typed and no row was drawn for him');
    else if (errs.length) fail('guessing ' + name + ' threw: ' + errs[0]);
    else ok(name + ', on a roster and not in the corpus, is guessed and his row draws');
  }
  await on.close(); await off.close();
}

/* ---- 4. Number Game: the number they wear now ---------------------------- */
console.log('\n4. Number Game, flag current');
{
  const { page, close } = await open('table', 'current');
  const r = await page.evaluate((onR) => {
    const on = (new Function('return (' + onR + ')'))()();
    const deal = window.__rtgDeal(40);
    const years = deal.map((x) => +((x.extra.match(/(\d{4})-(\d{4})/) || [])[2] || 0));
    return { n: deal.length, gone: deal.filter((x) => !on[x.target.sport + '|' + x.target.name]).map((x) => x.target.name),
             oldest: Math.min(...years), newest: Math.max(...years), first: deal.slice(0, 3).map((x) => x.target.name + ' ' + x.extra) };
  }, onRoster.toString());
  if (r.n < 30) fail('only ' + r.n + ' cards dealt');
  else if (r.gone.length) fail(r.gone.length + ' not on a roster today: ' + r.gone.slice(0, 6).join(', '));
  else if (r.newest - r.oldest > 1) fail('a stint that ended in ' + r.oldest + ' is asked beside one that runs to ' + r.newest);
  else ok(r.n + ' cards, every one a current player on a current number: ' + r.first.join(' | '));
  await close();
}

/* ---- 5. Roll Call: the whole NBA roster is the board --------------------- */
/* The report: the 2009-10 Mavericks board printed eight famous names, and
   DeShawn Stevenson, who started for that team, could only be a deep cut.
   The day that board is dealt is looked up in the deck, so this does not
   depend on today's date, and the clock is fixed to it. */
console.log('\n5. Roll Call, flag fullroster');
{
  const T = {}; new Function('window', readFileSync(path.join(ROOT, 'arcade/teammates.js'), 'utf8'))(T);
  const D = T.RTG_TEAMMATES, ti = D.teams.indexOf('Dallas Mavericks');
  const at = D.roll.findIndex((r) => r[0] === ti && r[1] === 2010);
  if (at < 0) fail('the 2009-10 Mavericks are no longer in the Roll Call deck; pick another NBA board for this check');
  else {
    const day = new Date(Date.parse('2026-07-22T00:00:00Z') + at * 864e5).toISOString().slice(0, 10);
    const R = {}; new Function('window', readFileSync(path.join(ROOT, 'arcade/rosters/nba-2010.js'), 'utf8'))(R);
    const P = R.RTG_ROSTERS_NBA_2010, roster = P.r[P.teams.indexOf('Dallas Mavericks')][2010].map((x) => P.names[x[0]]);
    for (const [flags, full] of [['fullroster', true], ['-fullroster', false]]) {
      const { page, close } = await open('rollcall', flags, day);
      await page.waitForFunction(() => /\d+ names to find/.test((document.getElementById('setupBlurb') || {}).textContent || ''));
      await page.waitForTimeout(600);
      // the first-visit rules card sits over the page until it is dismissed
      if (await page.$('#rtgpgGo')) { await page.click('#rtgpgGo'); await page.waitForTimeout(500); }
      if (await page.$eval('#panelPlay', (el) => !el.classList.contains('on')).catch(() => true)) await page.click('#startBtn');
      await page.waitForSelector('#slots .slot');
      const slots = await page.$$eval('#slots .slot', (els) => els.length);
      await page.fill('#ask', 'DeShawn Stevenson');
      await page.press('#ask', 'Enter');
      await page.waitForTimeout(300);
      const got = await page.$$eval('#slots .slot.got', (els) => els.map((e) => ({ n: e.querySelector('.nm').textContent, deep: e.classList.contains('deep'), no: e.querySelector('.no').textContent })));
      const st = got.find((g) => g.n === 'DeShawn Stevenson');
      if (full) {
        if (slots !== roster.length) fail('the board has ' + slots + ' blanks and the roster ' + roster.length + ' names');
        else if (!st || st.deep) fail('DeShawn Stevenson is ' + (st ? 'a deep cut' : 'refused') + ' on a full-roster board');
        else ok(day + ' Mavericks 2009-10: all ' + slots + ' men on the roster are blanks, and Stevenson fills his (' + st.no + ')');
        // and the end of the board names every man missed, roster rows too
        const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
        await page.click('#doneBtn');
        await page.waitForTimeout(400);
        const end = await page.evaluate(() => ({ of: document.getElementById('mOf').textContent,
          blank: [...document.querySelectorAll('#slots .slot.missed .nm')].filter((n) => !n.textContent.trim() || /·/.test(n.textContent)).length,
          missed: document.querySelectorAll('#slots .slot.missed').length }));
        if (+end.of !== roster.length) fail('the result says ' + end.of + ' on the board, not ' + roster.length);
        else if (end.blank || end.missed !== roster.length - 1) fail('the reveal left ' + end.blank + ' blanks unnamed (' + end.missed + ' missed)');
        else if (errs.length) fail('the end of the board threw: ' + errs[0]);
        else ok('the end of the board names all ' + end.missed + ' men missed, and the result is out of ' + end.of);
      } else {
        if (slots >= roster.length) fail('with the flag off the board is still the whole roster');
        else if (!st || !st.deep) fail('with the flag off Stevenson is no longer the deep cut he was');
        else ok('with the flag off the board is the ' + slots + ' it was and Stevenson is a deep cut');
      }
      await close();
    }
  }
}

await browser.close();
server.close();
if (bad) { console.error('\n' + bad + ' problem' + (bad === 1 ? '' : 's')); process.exit(1); }
console.log('\ncurrent players ok');
