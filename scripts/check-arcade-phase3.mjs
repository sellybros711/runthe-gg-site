/* Phase 3 of the arcade brief: getting into a game, and what happens after it.
 *
 *   node scripts/check-arcade-phase3.mjs            everything (a few minutes)
 *   node scripts/check-arcade-phase3.mjs first fit  only the named sections
 *
 * Sections:
 *   first    A first visit goes straight into a playable game. Nothing opens by
 *            itself: no how-to, no rules screen, no hub tour. A free account
 *            opening a card game it has not tried gets one line above the
 *            board, not a screen in front of it. The "?" button is there.
 *   fit      On a 375x667 phone the game header is one row, the stats sit in
 *            one slim strip, and the thing you play is on screen without
 *            scrolling. On a desktop none of that moves.
 *   rankit   Rank It on a phone: the arrows are gone, so the strip says how
 *            to reorder, and a drag moves exactly one row per row height.
 *   hub      A tile says today's state: not played, in progress (RESUME), or
 *            the result.
 *   guest    A guest's finished run reaches the daily board under a generated
 *            name, through its own anonymous session and never the page's;
 *            with the flag off nothing is posted. Either way the end screen
 *            places them against today's field and offers to save the streak.
 *            Signing in afterwards hands the guest runs to the account.
 *   share    Every game shares text: name, day number, a row of squares, the
 *            link. The image is the second option.
 *
 * Offline. Supabase is stubbed where a section needs it (guest); every other
 * request is refused by the harness, so nothing here can touch the live board.
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import path from 'node:path';
import { serve, launch, page, reporter, GAMES, ROOT } from './lib/arcade-harness.mjs';

const R = reporter();
const want = process.argv.slice(2);
const run = s => !want.length || want.includes(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TIME = new Date('2026-10-02T12:00:00');
const CARD_GAMES = ['match', 'guess', 'table', 'oddone', 'rankit', 'highlow', 'rollcall', 'chain'];
const NAME = { match: 'Common Ground', crossword: 'Daily Crossword', guess: 'Guess the Player', table: 'Number Game',
  oddone: 'Odd One Out', career: 'Career Path', rankit: 'Rank It', almamater: 'Alma Mater', highlow: 'High Low',
  sportegories: 'Sportegories', rollcall: 'Roll Call', chain: 'Chain' };

/* ------------------------------------------------------------- share, node */
if (run('share')) {
  R.section('share: every game shares text, with the day number, squares and the link');
  const box = { console, Date, Math, JSON, String, Promise }; box.self = box; box.window = box; box.globalThis = box;
  box.document = { addEventListener() {}, readyState: 'complete' };
  createContext(box);
  runInContext(readFileSync(path.join(ROOT, 'arcade/share.js'), 'utf8'), box);
  const S = box.RTGShare;
  for (const g of GAMES) {
    const t = S.card(g, '2026-10-02', { grid: '\u{1F7E9}\u{2B1C}', stat: '3 points' });
    const lines = t.split('\n');
    const numbered = g === 'highlow' ? !/#\d/.test(lines[0]) : /#73$/.test(lines[0]);
    R.ok(lines[0].startsWith('Run The Arcade · ' + NAME[g]) && numbered
      && lines[1] === '\u{1F7E9}\u{2B1C}' && lines[lines.length - 1] === 'https://runthe.gg/arcade/' + g + '/',
      `${g}: "${lines[0]}", squares, link`, t);
    // the game hands a real grid, not an empty one
    const src = readFileSync(path.join(ROOT, 'arcade', g, 'index.html'), 'utf8');
    const m = /function cardSpec\(\)\s*\{([\s\S]*?)\n\s{2,4}\}/.exec(src);
    const body = m ? m[1] : '';
    R.ok(/grid\s*:/.test(body) && !/grid\s*:\s*(''|"")/.test(body), `${g}: its share card carries a row of squares`);
  }
  R.ok(typeof S.sendImage === 'function', 'the image card is still there, as sendImage');
  const srcShare = readFileSync(path.join(ROOT, 'arcade/share.js'), 'utf8');
  const sendBody = /function send\(spec\)\s*\{([\s\S]*?)\n  \}/.exec(srcShare);
  R.ok(sendBody && /fire\(card\(/.test(sendBody[1]) && !/draw\(/.test(sendBody[1]), 'Share sends the text, not the picture');
  const art = readFileSync(path.join(ROOT, 'arcade/resultart.js'), 'utf8');
  R.ok(/data-rtgart-image/.test(art) && /RTGShare\.sendImage/.test(art), 'the end screen card offers the image as a second option');
}

const { srv, base } = await serve();
const br = await launch();

/* ------------------------------------------------------------------ first */
if (run('first')) {
  R.section('first: a first visit goes straight into the game');
  const hub = await page(br, base, { tier: 'guest', mobile: true, popups: true, time: TIME });
  await hub.p.goto(base + '/arcade/', { waitUntil: 'load' }); await sleep(2500);
  const h = await hub.p.evaluate(() => ({
    tour: !!document.querySelector('.rtgtour-scrim, [class*="rtgtour"]'),
    hint: (document.querySelector('.zone-head .zhint') || {}).textContent || '',
    tourJs: [...document.scripts].some(s => /tour(data)?\.js/.test(s.src))
  }));
  R.ok(!h.tour && !h.tourJs, 'the hub runs no tour');
  R.ok(/Tap a game/.test(h.hint), 'the hub says what to do in one line', h.hint);
  await hub.ctx.close();

  const vis = () => [...document.querySelectorAll('.rtgpg-scrim, .rtgHowto-scrim.on, .rtgHowto.on, details#howto[open]')]
    .filter(el => { const s = getComputedStyle(el), r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0; })
    .map(el => el.className || el.id);
  for (const tier of ['guest', 'free']) {
    for (const g of GAMES) {
      if (tier === 'guest' && CARD_GAMES.includes(g)) continue;   // a guest meets the account wall there, by design
      const { ctx, p } = await page(br, base, { tier, mobile: true, popups: true, time: TIME });
      await p.goto(base + '/arcade/' + g + '/', { waitUntil: 'load' }); await sleep(2200);
      const st = await p.evaluate(vis);
      const q = await p.$('#rtgHowtoBtn');
      R.ok(!st.length && q, `${tier} ${g}: nothing covers the board, and "?" is there`, st.join(', ') + p.errs.slice(0, 1).join(''));
      if (tier === 'free' && CARD_GAMES.includes(g)) {
        const line = await p.evaluate(() => { const n = document.getElementById('rtgpgTrial'); return n ? n.textContent.trim() : ''; });
        R.ok(/one free play/i.test(line), `free ${g}: the free try is one line above the board`, line);
      }
      await ctx.close();
    }
  }
}

/* -------------------------------------------------------------------- fit */
if (run('fit')) {
  R.section('fit: one header row on a phone, the game on screen');
  const TARGET = { career: '#answerIn', almamater: '#answerIn', oddone: '#choices', table: '#versus', rankit: '#checkBtn',
    guess: '#q', crossword: '#board', match: '#pool', sportegories: '#startBtn', rollcall: '#startBtn', chain: '#startBtn' };
  for (const g of GAMES) {
    const { ctx, p } = await page(br, base, { tier: 'card', mobile: true, vp: { width: 375, height: 667 }, time: TIME });
    await p.goto(base + '/arcade/' + g + '/', { waitUntil: 'load' }); await sleep(2500);
    const r = await p.evaluate((sel) => {
      document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0);
      const tb = document.querySelector('.topbar'), strip = document.querySelector('.rtggh-strip');
      const banner = document.querySelector('.rtg-topbanner');
      const kids = tb ? [...tb.children].filter(c => { const s = getComputedStyle(c); return s.display !== 'none' && c.getBoundingClientRect().width > 0; }) : [];
      // one row: every visible child crosses the bar's middle line
      const tr = tb ? tb.getBoundingClientRect() : null, mid = tr ? tr.top + tr.height / 2 : 0;
      const oneRow = kids.every(c => { const r = c.getBoundingClientRect(); return r.top <= mid && r.bottom >= mid; });
      const el = sel && document.querySelector(sel);
      return { rows: oneRow ? 1 : 2, stripH: strip ? Math.round(strip.getBoundingClientRect().height) : 0,
               banner: banner ? getComputedStyle(banner).display : 'none',
               bottom: el ? Math.round(el.getBoundingClientRect().bottom) : null,
               wide: document.documentElement.scrollWidth > window.innerWidth + 1 };
    }, TARGET[g] || null);
    R.ok(r.rows === 1 && r.stripH > 0 && r.stripH <= 36 && r.banner === 'none' && !r.wide,
      `${g}: one header row, one slim strip (${r.stripH}px), no sideways scroll`, JSON.stringify(r));
    if (TARGET[g]) R.ok(r.bottom != null && r.bottom <= 667, `${g}: the board is on screen at 375x667 (bottom ${r.bottom})`);
    await ctx.close();
    // desktop: unchanged, the banner is back and there is no strip
    const d = await page(br, base, { tier: 'card', mobile: false, vp: { width: 1280, height: 900 }, time: TIME });
    await d.p.goto(base + '/arcade/' + g + '/', { waitUntil: 'load' }); await sleep(1800);
    const dk = await d.p.evaluate(() => ({ strip: !!document.querySelector('.rtggh-strip'), cls: document.body.classList.contains('rtggh'),
      banner: getComputedStyle(document.querySelector('.rtg-topbanner') || document.body).display }));
    R.ok(!dk.strip && !dk.cls && dk.banner !== 'none', `${g}: a desktop keeps its own header`, JSON.stringify(dk));
    await d.ctx.close();
  }
}

/* ----------------------------------------------------------------- rankit */
if (run('rankit')) {
  R.section('rankit: reordering on a phone');
  const { ctx, p } = await page(br, base, { tier: 'card', mobile: true, vp: { width: 375, height: 667 }, time: TIME });
  await p.goto(base + '/arcade/rankit/', { waitUntil: 'load' }); await sleep(2500);
  const s = await p.evaluate(() => {
    const vis = el => el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
    const it = [...document.querySelectorAll('#rows .ritem')];
    return { arrows: it.some(i => vis(i.querySelector('.ctrl'))), mid: vis(document.querySelector('.axis .axmid')),
             names: it.map(i => { const n = i.querySelector('.nm'); return n.scrollWidth <= n.clientWidth + 1; }),
             step: it.length > 1 ? it[1].getBoundingClientRect().top - it[0].getBoundingClientRect().top : 0,
             order: it.map(i => i.querySelector('.nm').textContent) };
  });
  R.ok(!s.arrows && s.mid, 'the arrows are gone and the strip says "Tap two to swap"');
  R.ok(s.names.length === 5 && s.names.every(Boolean), 'all five names fit on one line', JSON.stringify(s.order));
  // drag the top row down by exactly one measured step
  const b0 = await p.$eval('#rows .ritem:nth-child(1) .rord', e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await p.mouse.move(b0.x, b0.y); await p.mouse.down();
  for (let i = 1; i <= 8; i++) { await p.mouse.move(b0.x, b0.y + s.step * i / 8); await sleep(20); }
  await p.mouse.up(); await sleep(400);
  const after = await p.evaluate(() => [...document.querySelectorAll('#rows .ritem .nm')].map(n => n.textContent));
  R.ok(after[1] === s.order[0] && after[0] === s.order[1], 'a one-row drag moves the name exactly one place', JSON.stringify(after));
  await ctx.close();
}

/* -------------------------------------------------------------------- hub */
if (run('hub')) {
  R.section('hub: today\'s state on every tile');
  for (const tier of ['guest', 'free', 'card']) {
    const { ctx, p } = await page(br, base, { tier, mobile: true, vp: { width: 375, height: 800 }, time: TIME });
    await p.goto(base + '/arcade/career/', { waitUntil: 'load' }); await sleep(1200);
    await p.evaluate(() => { RTGTokens.startAttempt('career'); if (RTGTokens.trialOpen('oddone') || RTGTokens.hasCard()) RTGTokens.startAttempt('oddone'); });
    await p.goto(base + '/arcade/', { waitUntil: 'load' }); await sleep(1800);
    const t = await p.evaluate(() => Object.fromEntries(['cardCareer', 'cardOdd', 'cardAlma'].map(id => {
      const e = document.getElementById(id);
      return [id, { prog: e.classList.contains('inprog'), locked: e.classList.contains('locked'),
        st: e.querySelector('.status').textContent.trim(), play: e.querySelector('.play').textContent.trim() }];
    })));
    R.ok(t.cardCareer.prog && t.cardCareer.st === 'In progress' && /^RESUME/.test(t.cardCareer.play), `${tier}: a started game reads In progress, RESUME`, JSON.stringify(t.cardCareer));
    R.ok(!t.cardAlma.prog && /^PLAY/.test(t.cardAlma.play), `${tier}: an unstarted game reads PLAY`, JSON.stringify(t.cardAlma));
    if (tier !== 'guest') R.ok(t.cardOdd.prog && !t.cardOdd.locked, `${tier}: a card game's started free try is not drawn locked`, JSON.stringify(t.cardOdd));
    await ctx.close();
  }
  // the result state: a finished day still reads PLAYED, View result
  const src = readFileSync(path.join(ROOT, 'arcade/index.html'), 'utf8');
  R.ok(/<b class="pd">PLAYED<\/b><span class="vr">View result<\/span>/.test(src), 'a finished tile still reads PLAYED, View result');
}

/* ------------------------------------------------------------------ guest */
async function stubbed(ctx, seen, routes) {
  await ctx.addInitScript(() => {
    function client(url, key, opts) {
      const sk = (opts && opts.auth && opts.auth.storageKey) || 'sb-jcrrxqfpdelrmvjuihnm-auth-token';
      const auth = new Proxy({
        getSession: async () => ({ data: { session: JSON.parse(localStorage.getItem(sk) || 'null') } }),
        signInAnonymously: async () => {
          const s = { access_token: 'guest-token', user: { id: 'eeeeeeee-9999-4999-8999-999999999999', is_anonymous: true } };
          localStorage.setItem(sk, JSON.stringify(s)); window.__anon = (window.__anon || 0) + 1; return { data: { session: s }, error: null };
        },
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: async () => { localStorage.removeItem(sk); return {}; },
      }, { get: (t, k) => t[k] || (async () => ({ data: null, error: null })) });
      const q = new Proxy({}, { get: (t, k) => k === 'then' ? undefined : () => q });
      return { auth, rpc: async () => ({ data: null, error: { message: 'stub' } }), from: () => q, __rtgUrl: url };
    }
    window.supabase = { createClient: client };
  });
  await ctx.route(/supabase\.co/, async r => {
    const u = r.request().url(), h = r.request().headers();
    const H = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', 'content-type': 'application/json' };
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 200, headers: { ...H, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    seen.push({ u: u.replace(/^.*\/rest\/v1\//, ''), auth: (h.authorization || '').slice(7), body: r.request().postData() });
    for (const [re, body, status] of routes) if (re.test(u)) return r.fulfill({ status: status || 200, headers: { ...H, ...(status === 206 ? { 'content-range': body } : {}) }, body: status === 206 ? '[]' : JSON.stringify(body) });
    return r.fulfill({ status: 200, headers: H, body: '[]' });
  });
}
async function finishAlma(p) {
  for (let i = 0; i < 6; i++) {
    if (await p.evaluate(() => { const s = document.getElementById('scrim'); return s && !s.classList.contains('hidden'); })) break;
    if (await p.$('#bailBtn:visible')) { await p.click('#bailBtn'); await sleep(300); }
    await p.evaluate((first) => {
      const d = window.__rtgDeal ? window.__rtgDeal(30) : [], right = ((d[0] && d[0].col) || '').toLowerCase();
      const bs = [...document.querySelectorAll('#choices button:not([disabled])')];
      const hit = bs.find(b => (b.textContent.trim().toLowerCase() === right) === first); if (hit) hit.click();
    }, i === 0);
    await sleep(2800);
  }
  await sleep(4500);
}
if (run('guest')) {
  R.section('guest: on the daily board, placed against the field, offered to save the streak');
  const ROUTES = [
    [/rpc\/arcade_guest_ticket/, 's3cr3t-0123456789abcdef0123456789abcdef'],
    [/rpc\/grid_submit_run/, { id: 9, streak: 1, best_streak: 1 }],
    [/grid_runs\?.*score=lt/, '0-0/7', 206],
    [/grid_runs\?.*select=id$/, '0-0/40', 206],
  ];
  for (const flag of ['guestboard', '-guestboard']) {
    const seen = [];
    const { ctx, p } = await page(br, base, { tier: 'guest', mobile: true, vp: { width: 375, height: 740 }, time: TIME });
    await stubbed(ctx, seen, ROUTES);
    await ctx.addInitScript(() => { navigator.share = async (d) => { window.__shared = d; }; });
    await p.goto(base + '/arcade/almamater/?flags=' + flag, { waitUntil: 'load' }); await sleep(2000);
    await finishAlma(p);
    const o = await p.evaluate(() => {
      const sh = document.querySelector('#scrim .sheet, #scrim .modal');
      return { rank: ((sh && sh.querySelector('.rtgres .c.rank')) || {}).textContent || '',
               note: (document.getElementById('funGuest') || {}).textContent || '',
               again: [...document.querySelectorAll('#scrim button')].map(b => b.textContent.trim()).filter(t => /streak|account/i.test(t)),
               rec: JSON.parse(localStorage.getItem('rtg:guest:v1') || 'null'), anon: window.__anon || 0 };
    });
    const submits = seen.filter(s => /grid_submit_run/.test(s.u));
    if (flag === 'guestboard') {
      R.ok(o.anon === 1 && submits.length === 1 && submits[0].auth === 'guest-token', 'flag on: one post, with the guest\'s own token', JSON.stringify(submits.map(s => s.auth)));
      R.ok(o.rec && o.rec.uid && o.rec.secret, 'flag on: the browser keeps the guest id and its ticket');
      R.ok(/Top 20%/.test(o.rank), 'flag on: placed against the field, counted in once (8th of 40)', o.rank);
      R.ok(/You.re on today.s board as [A-Z][a-z]+ [A-Z][a-z ]+ \d{3}\./.test(o.note) && /free account/.test(o.note), 'flag on: says which name they are on the board as, and offers to keep it', o.note);
    } else {
      R.ok(o.anon === 0 && submits.length === 0 && !o.rec, 'flag off: no anonymous session, nothing posted');
      R.ok(/Top 20%/.test(o.rank), 'flag off: still placed against the field, counted in as one more (8th of 41)', o.rank);
      R.ok(/on this device only/.test(o.note) && /not on the leaderboard/.test(o.note), 'flag off: says the streak is on this device only', o.note);
      R.ok(o.again.includes('Save my streak'), 'the account offer is framed as saving the streak', JSON.stringify(o.again));
      // text share, captured
      await p.evaluate(() => { const b = document.querySelector('[data-rtgart-share]') || document.getElementById('mShare'); b && b.click(); });
      await sleep(500);
      const sh = await p.evaluate(() => window.__shared || null);
      const ans = await p.evaluate(() => { const d = window.__rtgDeal ? window.__rtgDeal(30) : []; return d.slice(0, 2).map(r => r.col); });
      R.ok(sh && !sh.files && /^Run The Arcade · Alma Mater #\d+\n/.test(sh.text) && /[\u{1F7E9}\u{1F7E5}]/u.test(sh.text) && /https:\/\/runthe\.gg\/arcade\/almamater\//.test(sh.text),
        'Share sends text: name, day number, squares, link', sh && sh.text);
      R.ok(sh && ans.every(a => a && sh.text.indexOf(a) < 0), 'and no answer is in it', JSON.stringify(ans));
    }
    if (p.errs.length) R.ok(false, `no page errors (${flag})`, p.errs.join(' | '));
    await ctx.close();
  }

  // signing in afterwards: the account claims the guest's runs with the secret
  const seen = [];
  const { ctx, p } = await page(br, base, { tier: 'guest', mobile: true, time: TIME });
  await stubbed(ctx, seen, [[/rpc\/arcade_claim_guest/, { moved: 2, claimed: true }]]);
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('__claimset')) return; sessionStorage.setItem('__claimset', '1');
    localStorage.setItem('rtg:guest:v1', JSON.stringify({ uid: 'eeeeeeee-9999-4999-8999-999999999999', secret: 's3cr3t' }));
    localStorage.setItem('rtg-guest-auth', JSON.stringify({ access_token: 'guest-token' }));
    localStorage.setItem('sb-jcrrxqfpdelrmvjuihnm-auth-token', JSON.stringify({ access_token: 'acct-token', user: { id: 'aaaaaaaa-1111-4111-8111-111111111111' } }));
  });
  await p.goto(base + '/arcade/', { waitUntil: 'load' }); await sleep(2500);
  const claim = seen.find(s => /arcade_claim_guest/.test(s.u));
  const left = await p.evaluate(() => ({ rec: localStorage.getItem('rtg:guest:v1'), auth: localStorage.getItem('rtg-guest-auth') }));
  R.ok(claim && claim.auth === 'acct-token' && /"p_secret":"s3cr3t"/.test(claim.body), 'signing in hands the guest runs to the account, with the account\'s own token', claim && claim.body);
  R.ok(!left.rec && !left.auth, 'and the browser forgets the guest');
  await ctx.close();
}

await br.close(); srv.close();
console.log(R.fails() ? `\n${R.fails()} problem(s)` : '\nphase 3 holds');
process.exit(R.fails() ? 1 : 0);
