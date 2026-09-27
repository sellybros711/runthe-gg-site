/* THE COLLEGE FANTASY PAGE, IN A REAL BROWSER, AGAINST A STUBBED SERVER.
 *
 *   node cfb/build/test/test_fantasy.mjs          runs this after the engine sections
 *
 * `cfb/fantasy/index.html` is a port of the NFL page, and the two ways a port goes wrong are
 * both silent: it keeps a piece of the thing it was ported from (a request to the NFL
 * tables, a key in the NFL's localStorage, a link back to The Perfect Season), or it drops a
 * rule the new mode added (the swap band, the college injury words). So what is asserted is
 * mostly WHICH COMPETITION every write reaches, and the swap offering only what the server
 * would take.
 *
 * NOT ONE REQUEST REACHES THE LIVE PROJECT. Every rpc and the one table read are answered
 * here, and the catch-all aborts anything else, so a name this stub has never heard of dies
 * rather than going out. The live project holds real competitions with a prize on them.
 */
import fs from 'node:fs';
import path from 'node:path';

const CHROME = process.env.PS_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PW = process.env.PS_PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright/index.js';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

export async function run(ROOT, POOL) {
  let passes = 0, fails = 0;
  const ok = (label, cond, extra) => {
    if (cond) passes++; else fails++;
    console.log('  ' + (cond ? 'ok  ' : 'FAIL') + '  ' + label + (extra ? '   ' + extra : ''));
  };
  console.log('\n9. the page, in a browser');
  let pw;
  try { pw = (await import(PW)).default; } catch (e) {
    ok('playwright is available', false, String(e).slice(0, 120));
    return { passes, fails };
  }
  const browser = await pw.chromium.launch({ executablePath: CHROME });
  const FILE = `pool_${POOL.season}_w${POOL.week}.json`;
  const LOCK = Date.parse(POOL.locks_at);
  const LAST_KICK = Math.max(...POOL.games.map((g) => Date.parse(g.kick)));
  const USER = { name: 'tester', userId: '11111111-1111-1111-1111-111111111111' };

  const authStub = (who) => `(function(){
    var s = ${JSON.stringify(who)}, ls = [];
    function state(){ return { ready:true, signedIn:!!s, userId:s&&s.userId, name:s&&s.name }; }
    window.PS_CFB_AUTH = { API_VERSION: 2,
      boot: function(){ setTimeout(function(){ ls.forEach(function(f){ f(state()); }); }, 30); },
      state: state, onChange: function(f){ ls.push(f); return function(){}; },
      token: function(){ return s ? 'tok' : null; } };
  })();`;

  async function openPage(url, { who = USER, at = null, server = {}, injuries = null,
    storage = null, viewport = { width: 390, height: 844 } } = {}) {
    const page = await browser.newPage({ viewport });
    const boom = [], posted = [], strays = [];
    page.on('pageerror', (e) => boom.push(String(e).slice(0, 200)));
    if (at != null) {
      await page.addInitScript(`(function(){ var real = Date.now, off = ${at} - real();
        Date.now = function(){ return real() + off; }; })();`);
    }
    if (storage) {
      await page.addInitScript(`try{ localStorage.setItem(${JSON.stringify(storage.key)},
        ${JSON.stringify(storage.value)}); }catch(e){}`);
    }
    let entry = server.mine || null;
    await page.route('**/*', async (r) => {
      const u = new URL(r.request().url());
      const call = u.pathname.match(/\/rest\/v1\/rpc\/(\w+)$/);
      const json = (status, body) => r.fulfill({ status, contentType: 'application/json',
        body: body == null ? '' : JSON.stringify(body) });
      if (call) {
        let body = {};
        try { body = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
        posted.push({ fn: call[1], body });
        switch (call[1]) {
          case 'cfb_fantasy_submit':
            entry = { picks: body.p_picks, spend: 0, projected: 0, score: 0, scored: false };
            return json(204, null);
          case 'cfb_fantasy_my_entry': return json(200, entry ? [entry] : []);
          case 'cfb_fantasy_swap':
            if (server.swap) return json(400, { code: 'P0001', message: server.swap });
            if (entry) entry.picks = entry.picks.map((id) => (id === body.p_out ? body.p_in : id));
            return json(204, null);
          case 'cfb_fantasy_board': return json(200, server.board || {
            week: { locks_at: POOL.locks_at, scored_at: null, checked_at: null,
              results_at: null, games_final: 0, games_total: POOL.games.length,
              open: Date.now() >= LOCK, entries: entry ? 1 : 0 },
            rows: [], me: null, games: [], entrants: entry ? [{ entry_no: 1,
              display_name: 'tester', is_me: true }] : [] });
          case 'cfb_fantasy_my_result': return json(200, []);
          case 'cfb_fantasy_ack_result': return json(200, true);
          case 'cfb_fantasy_entry_count': return json(200, entry ? 1 : 0);
          /* Recorded above and refused here, so a call to a table this competition does
             not own is a named failure rather than a request that got out. */
          default: return json(404, { message: 'not stubbed' });
        }
      }
      if (/\/rest\/v1\/cfb_fantasy_results$/.test(u.pathname)) {
        posted.push({ fn: 'cfb_fantasy_results' });
        return json(200, server.results || []);
      }
      if (u.hostname !== 'local.test') { strays.push(u.hostname + u.pathname); return r.abort(); }
      let rel = decodeURIComponent(u.pathname);
      if (rel.endsWith('/')) rel += 'index.html';
      if (rel === '/cfb/auth.js') {
        return r.fulfill({ status: 200, contentType: 'text/javascript', body: authStub(who) });
      }
      if (rel === '/cfb/data/fantasy/now.json') {
        return json(200, { season: POOL.season, week: POOL.week, file: FILE });
      }
      if (rel === '/cfb/data/fantasy/' + FILE) return json(200, POOL);
      if (/^\/cfb\/data\/fantasy\/injuries_/.test(rel)) {
        return injuries ? json(200, injuries) : r.fulfill({ status: 404, body: 'no' });
      }
      if (/^\/cfb\/data\/fantasy\/pool_/.test(rel)) return r.fulfill({ status: 404, body: 'no' });
      const f = path.join(ROOT, rel);
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.abort();
      return r.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream',
        body: fs.readFileSync(f) });
    });
    await page.goto('http://local.test' + url, { waitUntil: 'domcontentloaded' });
    return { page, boom, posted, strays };
  }
  const screenOn = (page) => page.evaluate(() =>
    [...document.querySelectorAll('.screen.on')].map((s) => s.id).join(','));
  const waitScreen = (page, id) => page.waitForSelector('#' + id + '.on', { timeout: 15000 });

  async function signOne(page) {
    const before = await page.locator('#d-slots .slot.done').count();
    await page.locator('#d-men .man').first().waitFor({ timeout: 10000 });
    const men = page.locator('#d-men .man:not([disabled]):not(.hurt)');
    if (!(await men.count())) throw new Error('every man on the board is out of reach');
    await men.first().click({ force: true });
    await page.waitForSelector('#cf-sheet:not([hidden])', { timeout: 10000 });
    await page.locator('#cf-go').click({ force: true });
    await page.waitForFunction((n) => document.querySelectorAll('#d-slots .slot.done').length > n
      || document.querySelector('#s-review.on'), before, { timeout: 10000 });
  }

  try {
    /* ---- a guest is told before drafting, and pointed at the COLLEGE sign in ---- */
    {
      const { page, boom } = await openPage('/cfb/fantasy/', { who: null, at: LOCK - 36 * 3600e3 });
      await waitScreen(page, 's-shut');
      const href = await page.getAttribute('#shut-go', 'href');
      ok('a guest meets the sign in screen, not the draft', (await screenOn(page)) === 's-shut');
      ok('  and its button signs in on the college game', href === '/cfb/#signin', href);
      const back = await page.$$eval('a', (as) => as.map((a) => a.getAttribute('href')));
      ok('no link on the page goes to the NFL game', !back.some((h) => /^\/football\//.test(h || '')),
        back.filter((h) => /football/.test(h || '')).join(' '));
      ok('  and nothing threw', !boom.length, boom.join(' | '));
      await page.close();
    }

    /* ---- a whole entry, and which competition it reaches ---- */
    let entryIds = null, entryKeyValue = null;
    {
      const inj = { season: POOL.season, week: POOL.week, counts: {}, men: {} };
      const qb = POOL.pool.filter((m) => m.position === 'QB');
      inj.men[qb[0].player_id] = { st: 'suspended' };
      inj.men[qb[1].player_id] = { st: 'missed' };
      const { page, boom, posted, strays } = await openPage('/cfb/fantasy/',
        { at: LOCK - 36 * 3600e3, injuries: inj });
      await waitScreen(page, 's-home');
      const week = await page.textContent('#home-week');
      ok('the home screen names the week and its games',
        /week 5/.test(week) && new RegExp(POOL.games.length + ' games').test(week), week);
      ok('  and the cap is the week\'s own', (await page.textContent('#home-cap')) === '$' + POOL.cap_musd + 'M',
        await page.textContent('#home-cap'));
      await page.click('#b-draft');
      await waitScreen(page, 's-draft');
      const seen = new Set();
      const colours = [];
      for (let i = 0; i < 6; i++) {
        const ids = await page.$$eval('#d-men .man', (b) => b.map((x) => x.dataset.id));
        ids.forEach((x) => seen.add(x));
        colours.push(...await page.$$eval('#d-men .club', (e) => e.map((x) => x.style.color)));
        await signOne(page);
      }
      ok('a suspended man is never on the board', !seen.has(qb[0].player_id));
      ok('the team codes wear a colour', colours.length > 0 && colours.every(Boolean),
        `${colours.filter(Boolean).length} of ${colours.length}`);
      await waitScreen(page, 's-review');
      await page.locator('#r-five .lineup').first().click();
      await page.click('#b-submit');
      /* ALLOWED TO LAPSE, so a submit that went to the wrong table is named by the claims
         below rather than reported as a timeout on a line number. */
      await page.waitForFunction(() => /s-live|s-in/.test(
        [...document.querySelectorAll('.screen.on')].map((s) => s.id).join()), null,
        { timeout: 15000 }).catch(() => {});
      const fns = posted.map((p) => p.fn);
      ok('the lineup is sent to the college table', fns.includes('cfb_fantasy_submit'), fns.join(','));
      ok('  and not one call reaches an NFL table', !fns.some((f) => !/^cfb_fantasy_/.test(f)),
        fns.filter((f) => !/^cfb_fantasy_/.test(f)).join(','));
      const sub = posted.find((p) => p.fn === 'cfb_fantasy_submit');
      entryIds = sub && sub.body.p_picks;
      ok('  six players, for this week', entryIds && entryIds.length === 6
        && sub.body.p_season === POOL.season && sub.body.p_week === POOL.week);
      const keys = await page.evaluate(() => Object.keys(localStorage));
      ok('the lineup is kept under the college key', keys.includes('cfb_fantasy_2026_w5'), keys.join(','));
      ok('  and never under the NFL one', !keys.some((k) => /^ps_fantasy_/.test(k)));
      entryKeyValue = await page.evaluate(() => localStorage.getItem('cfb_fantasy_2026_w5'));
      /* The font and the supabase library ask a CDN and are refused like everything else;
         what must never happen is a request for the project itself. */
      const live = strays.filter((h) => /supabase\.co/.test(h));
      ok('no request reached the live project', !live.length, live.slice(0, 3).join(' '));
      ok('  and nothing threw', !boom.length, boom.join(' | '));
      await page.close();
    }

    /* ---- the swap: any man before his game, at his price or a little below ---- */
    {
      const byId = Object.fromEntries(POOL.pool.map((m) => [m.player_id, m]));
      /* After the lock, with the first slate window under way and the rest to come. */
      const at = LOCK + 30 * 60e3;
      const { page, boom, posted } = await openPage('/cfb/fantasy/', { at,
        server: { mine: { picks: entryIds, spend: 0, projected: 0, score: 0, scored: false } },
        storage: { key: 'cfb_fantasy_2026_w5', value: entryKeyValue } });
      await waitScreen(page, 's-in');
      await page.waitForSelector('#in-swap:not([hidden])', { timeout: 10000 });
      const offered = await page.$$eval('#in-swap [data-swap]', (b) => b.map((x) => x.dataset.swap));
      const later = entryIds.filter((id) => Date.parse(byId[id].kick) > at);
      ok('every man whose game has not started can be swapped',
        offered.length === later.length && later.every((id) => offered.includes(id)),
        `${offered.length} offered, ${later.length} still to play`);
      ok('  and no man whose game has started', offered.every((id) => Date.parse(byId[id].kick) > at));
      const out = byId[offered[0]];
      await page.click(`#in-swap [data-swap="${out.player_id}"]`);
      await page.waitForSelector('#sw-sheet:not([hidden])');
      const choices = await page.$$eval('#sw-list [data-in]', (b) => b.map((x) => x.dataset.in));
      const drop = Math.max(out.price_musd * POOL.swap.pct, POOL.swap.floor_musd);
      const lo = out.price_musd - drop - 1e-6, hi = out.price_musd + 1e-6;
      ok('the swap offers somebody', choices.length > 0, out.name + ' at ' + out.price_musd);
      ok('  only at his position', choices.every((id) => byId[id].position === out.position));
      ok('  only at his price or a little below', choices.every((id) =>
        byId[id].price_musd <= hi && byId[id].price_musd >= lo),
        choices.map((id) => byId[id].price_musd).join(','));
      ok('  never a man already in the lineup', choices.every((id) => !entryIds.includes(id)));
      ok('  never a man whose game has started', choices.every((id) => Date.parse(byId[id].kick) > at));
      await page.click(`#sw-list [data-in="${choices[0]}"]`);
      await page.click('#sw-go');
      await page.waitForSelector('#sw-sheet[hidden]', { state: 'attached', timeout: 10000 });
      const sw = posted.find((p) => p.fn === 'cfb_fantasy_swap');
      ok('the swap is sent to the college function', !!sw && sw.body.p_out === out.player_id
        && sw.body.p_in === choices[0]);
      const now = await page.$$eval('#in-roster .rrow', (r) => r.length);
      ok('  and the lineup on screen has six men after it', now === 6, String(now));
      ok('  and nothing threw', !boom.length, boom.join(' | '));
      await page.close();
    }

    /* ---- the scoreboard is the week's own twenty games, ranks and all ---- */
    {
      const at = LOCK + 30 * 60e3;
      const { page, boom } = await openPage('/cfb/fantasy/', { at,
        server: { mine: { picks: entryIds, spend: 0, projected: 0, score: 0, scored: false } },
        storage: { key: 'cfb_fantasy_2026_w5', value: entryKeyValue } });
      await waitScreen(page, 's-in');
      await page.evaluate(() => document.getElementById('b-live').click());
      await waitScreen(page, 's-live');
      const n = await page.$$eval('#lv-games .gm', (g) => g.length);
      ok('the scoreboard draws every slate game', n === POOL.games.length, `${n} of ${POOL.games.length}`);
      ok('  and nothing threw', !boom.length, boom.join(' | '));
      await page.close();
    }

    /* ---- the front page's door ---- */
    {
      const { page, boom } = await openPage('/cfb/', { at: LOCK - 36 * 3600e3 });
      let drawn = true;
      try { await page.waitForSelector('#b-hp-fantasy', { timeout: 30000 }); } catch (e) { drawn = false; }
      ok('the college front page draws the Fantasy door', drawn);
      if (drawn) {
        ok('  and it goes to the college mode', (await page.getAttribute('#b-hp-fantasy', 'href')) === '/cfb/fantasy/');
        ok('  red until a lineup is in', !(await page.$eval('#b-hp-fantasy', (e) => e.classList.contains('in'))));
      }
      ok('  and the front page threw nothing', !boom.length, boom.join(' | '));
      await page.close();
    }
    {
      const { page } = await openPage('/cfb/', { at: LOCK - 36 * 3600e3,
        storage: { key: 'cfb_fantasy_2026_w5', value: entryKeyValue } });
      let lit = false;
      try {
        await page.waitForSelector('#b-hp-fantasy.in', { timeout: 30000 });
        lit = true;
      } catch (e) {}
      ok('  green once one is', lit);
      await page.close();
    }
  } catch (e) {
    ok('the walk finished', false, String(e && e.stack || e).slice(0, 400));
  } finally {
    await browser.close();
  }
  return { passes, fails };
}
