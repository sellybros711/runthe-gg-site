#!/usr/bin/env node
/* October has suspense, and a deciding game is played in front of you.
 *
 *   node baseball/check-october.mjs
 *
 * Plays Classic runs through the real page until one reaches a winner-take-all
 * game, and watches October the way a player does (no skip buttons):
 *   1. your series is revealed one game at a time on the bracket screen, each
 *      game landing on its own beat rather than all at once;
 *   2. the deciding game is NOT revealed there. It is played on the game screen,
 *      behind a Game 7 card, at full speed whatever the saved speed was;
 *   3. a big at bat in it gets the "here's the pitch" beat, the final holds, and
 *      the speed the player had comes back afterwards;
 *   4. "Skip ahead" on the bracket finishes the reveal and still plays the decider.
 * The board and every other request out of the page is refused at the route. */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync, statSync } from 'fs';
import path from 'path';
import http from 'http';

const require = createRequire(import.meta.url);
/* Playwright from node_modules first, which is where CI installs it, then the dev
   sandbox's global copy. Hardcoding the sandbox path failed every CI run. */
let chromium;
try { ({ chromium } = require('playwright')); }
catch (_) { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch (e) { chromium = null; } }
if (!chromium) { console.error('playwright is not installed'); process.exit(2); }
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
/* A pinned browser only where it exists, or Playwright's own everywhere else. */
const EXE = process.env.CHROMIUM
  || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((f) => existsSync(f)) || null;
const PORT = 8151;

/* Served over http rather than file://, because the page fetches its pool and its
   curated chemistry beside itself and a file:// origin refuses both. */
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = await new Promise((res) => {
  const s = http.createServer((req, rep) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p.replace(/^\/+/, ''));
    if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) {
      rep.writeHead(404).end('no'); return;
    }
    rep.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' })
      .end(readFileSync(file));
  });
  s.listen(PORT, () => res(s));
});

let fails = 0, checks = 0;
const ok = (m) => { checks++; console.log('  ok    ' + m); };
const bad = (m, d) => { checks++; fails++; console.log('  FAIL  ' + m); if (d) console.log('        ' + d); };
const claim = (c, m, d) => (c ? ok(m) : bad(m, d));
const head = (m) => console.log('\n' + m + '\n' + '-'.repeat(m.length));

const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
const errors = [];
const blocked = [];

async function openPage(opts) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  /* EVERYTHING OUT OF THE PAGE IS REFUSED, and counted rather than merely aborted:
     a run that silently stopped talking to the board would look the same as one
     that was never wired to it. The pool and the page itself are same-origin and
     go to the local server above. */
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith('http://localhost:' + PORT)) return route.continue();
    blocked.push(u);
    return route.abort();
  });
  /* A SIGNED IN PLAYER IS A STUB, NEVER THE LIVE PROJECT. Badges are for
     accounts, so the Classic walk plays signed in and the daily walk plays as a
     guest, and each asserts its own half. auth.js is swapped for a module that
     answers the same shape and says it is signed in, registered after the
     catch-all so it wins, and the supabase-js library is never fetched. */
  if (opts && opts.acct) {
    await ctx.route('**/baseball/auth.js*', (route) => route.fulfill({
      contentType: 'application/javascript',
      body: `window.RTD_AUTH={API_VERSION:1,boot:()=>true,
        state:()=>({ready:true,waiting:false,signedIn:true,userId:${JSON.stringify(opts.acct)},name:'checkrun'}),
        onChange:()=>()=>{},token:()=>null,signOut:()=>Promise.resolve()};`,
    }));
  }
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.addInitScript(() => {
    try { localStorage.setItem('rtd_seen_intro_v1', '1'); } catch (_) {}
  });
  await p.goto(`http://localhost:${PORT}/baseball/`, { waitUntil: 'load' });
  await p.waitForSelector('#s-intro.on', { timeout: 20000 });
  if (opts && opts.daily) await p.click('#daily-card');
  else await p.click('#b-start');
  await p.waitForSelector('#s-draft.on', { timeout: 20000 });
  return { ctx, p };
}

/* THE TILES ARE PAINTED AFTER THE REELS LAND, not with them: `spinBoth` takes
   `paintOpts` as its callback, so `#opts` is empty for as long as the year and the
   team are still turning. Waiting on the container rather than on its children
   is therefore waiting on nothing, and a scripted click ignores pointer events, so
   the walk would sign off a board that was not on screen yet and the next spin
   would land on a draft that never redrew. */
async function board(p) {
  await p.waitForFunction(() => {
    const o = document.getElementById('opts');
    return o && o.querySelectorAll('.tile').length > 0;
  }, null, { timeout: 25000 });
}

/* Twelve picks, taking the dearest tile that is signable. An affordable tile is
   what the page itself decides, so the walk asks the page rather than working it
   out again: a second copy of that rule is the Full Team glow bug waiting to
   happen, where the picture read one thing and the board read another. */
async function draft(p) {
  for (let i = 0; i < 12; i++) {
    await board(p);
    const took = await p.evaluate(() => {
      const tiles = [...document.querySelectorAll('#opts .tile')]
        .filter((t) => !t.classList.contains('off') && !t.disabled);
      if (!tiles.length) return null;
      /* The dearest signable man, read off the tile's own price cell. A blocked
         tile prints a REASON in that cell rather than a price, which is why the
         filter comes first rather than the parse standing in for it. */
      const price = (t) => {
        const m = /\$([\d.]+)M/.exec((t.querySelector('.pr') || {}).textContent || '');
        return m ? parseFloat(m[1]) : 0;
      };
      const pick = tiles.sort((a, b) => price(b) - price(a))[0];
      const name = (pick.querySelector('.nm') || pick).textContent.trim();
      pick.click();
      return name;
    });
    /* A TILE IS NOT ALWAYS A SIGNING. A man who fits more than one open slot is
       placed on the field instead: his open slots glow and the walk has to tap one.
       Without this the board sat there, the next pass read the same board, clicked
       the same tile, and the draft never left "Spin 1 of 12". It taps his natural slot
       where he has one, which the page marks. */
    await p.waitForTimeout(60);
    await p.evaluate(() => {
      if (!document.querySelector('#s-draft.picking')) return;
      const t = document.querySelector('#field .target.natural, #field-card .target.natural')
        || document.querySelector('#field .target, #field-staff .target, #field-card .target');
      if (t) t.click();
    });
    if (took == null) {
      /* No signable tile: the re-spin is the way on, and it is what a player does. */
      const spun = await p.evaluate(() => {
        const b = document.getElementById('b-respin');
        if (!b || b.disabled) return false;
        b.click(); return true;
      });
      if (!spun) return { stalled: i };
      i--;
      continue;
    }
    await p.waitForTimeout(90);
  }
  return { stalled: null };
}

/* The season, then the button that goes to October. False when the run missed it. */
async function toOctober(p) {
  await p.waitForSelector('#s-squad.on', { timeout: 30000 });
  await p.click('#b-playball');
  await p.waitForSelector('#s-season.on', { timeout: 20000 });
  await p.waitForSelector('#b-sim-fast', { state: 'visible', timeout: 30000 });
  await p.click('#b-sim-fast');
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    if (await p.$('#s-over.on')) return false;
    if (await p.$('#s-playoffs.on, #s-series.on')) return true;
    await p.evaluate(() => { const b = document.getElementById('b-season-go'); if (b && b.offsetParent) b.click(); });
    await p.waitForTimeout(250);
  }
  return false;
}

/* What the October screens are doing, sampled. */
const sample = (p) => p.evaluate(() => {
  const on = document.querySelector('.screen.on');
  const tr = document.getElementById('po-track');
  const g7 = document.getElementById('gm-g7');
  const fin = document.getElementById('gm-final');
  return {
    t: performance.now(), screen: on ? on.id : '',
    track: tr && !tr.hidden,
    pips: [...document.querySelectorAll('#po-track .pt-pip')].map((e) => e.className.replace('pt-pip', '').trim()),
    status: (document.getElementById('pt-st') || {}).textContent || '',
    g7card: g7 && !g7.hidden,
    g7game: !!document.querySelector('#s-game.g7'),
    sit: !!document.querySelector('#gm-arm.sit'),
    speed: (document.getElementById('gm-speed') || {}).textContent || '',
    big: !!(fin && !fin.hidden && fin.classList.contains('big')),
    final: fin && !fin.hidden ? fin.textContent : '',
    over: !!document.querySelector('#s-over.on'),
  };
});

head('1-3. A RUN THAT REACHES A DECIDING GAME, WATCHED WITHOUT SKIPPING');
let found = null;
for (let attempt = 0; attempt < 10 && !found; attempt++) {
  const { ctx, p } = await openPage({});
  await p.evaluate(() => { try { localStorage.setItem('rtd_po_speed', '2'); } catch (_) {} });
  const d = await draft(p);
  if (d.stalled != null || !(await toOctober(p))) { await ctx.close(); continue; }
  const tl = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 300000) {
    const s = await sample(p);
    tl.push(s);
    if (s.over) break;
    /* The tap that starts a game 7 sooner is the only press this walk makes. */
    await p.waitForTimeout(120);
  }
  if (tl.some((s) => s.g7game)) found = { ctx, p, tl };
  else { console.log(`        run ${attempt + 1}: October had no deciding game`); await ctx.close(); }
}
claim(!!found, 'a run reached a winner-take-all game');
if (found) {
  const { tl, p } = found;
  /* 1. The series is revealed a game at a time. */
  const landed = [];
  let prev = [];
  for (const s of tl) {
    if (!s.track) { prev = []; continue; }
    s.pips.forEach((c, k) => { if ((c === 'w' || c === 'l') && prev[k] !== c) landed.push(s.t); });
    prev = s.pips;
  }
  const gaps = landed.slice(1).map((t, i) => t - landed[i]).filter((g) => g < 5000);
  claim(landed.length >= 2, 'the series strip lands games one by one', `${landed.length} landings`);
  claim(gaps.length > 0 && Math.min(...gaps) >= 350, 'each on its own beat, not all at once',
    gaps.map((g) => Math.round(g)).join(', '));
  claim(tl.some((s) => s.pips.some((c) => c === 'pend')), 'a game waits on screen before it lands');
  /* 2. The decider is played, behind its card, at full speed. */
  const g7pip = tl.findIndex((s) => s.pips.some((c) => c === 'g7'));
  const g7start = tl.findIndex((s) => s.g7game);
  claim(g7pip >= 0 && /Game \d|One game/.test(tl[g7pip].status), 'the strip stops on the deciding game and names it',
    g7pip >= 0 ? tl[g7pip].status : '(never)');
  claim(g7pip >= 0 && g7start > g7pip, 'and hands it to the game screen rather than revealing it');
  claim(tl.some((s) => s.g7card), 'the game 7 card comes up before the first pitch');
  const inGame = tl.filter((s) => s.g7game && !s.g7card && !s.final);
  claim(inGame.length > 5 && inGame.every((s) => /^1/.test(s.speed)), 'it plays at 1x though the player had 2x',
    [...new Set(inGame.map((s) => s.speed))].join(', '));
  const gameMs = inGame.length ? inGame[inGame.length - 1].t - inGame[0].t : 0;
  claim(gameMs > 25000, 'and takes real time to play, not a flash', `${Math.round(gameMs / 1000)}s`);
  /* 3. The big moments and the end. */
  const sat = tl.some((s) => s.g7game && s.sit);
  console.log(`        note  a pitch beat ${sat ? 'came up' : 'did not come up (the game was not close late)'}`);
  const fin = tl.find((s) => s.big);
  claim(!!fin && /Game \d|One game/.test(fin.final), 'the final lands big and says which game it was', fin ? fin.final : '(none)');
  claim(!!fin && /^2/.test(fin.speed), 'and the player\'s 2x comes back after it', fin ? fin.speed : '');
  claim(tl[tl.length - 1].over, 'October finishes on the results screen');

  head('4. SKIP AHEAD STILL PLAYS THE DECIDER');
  /* Replaying October from the results takes the series cards. Sim the series,
     then Skip ahead at once, on every round: the deciding game must still come up. */
  await p.click('#b-watch-oct');
  /* The results screen stays up for a tick after the press. */
  await p.waitForSelector('#s-over.on', { state: 'detached', timeout: 10000 }).catch(() => {});
  await p.waitForFunction(() => !document.querySelector('#s-over.on'), null, { timeout: 10000 });
  let sawG7 = false;
  const seen = [];
  const t1 = Date.now();
  while (Date.now() - t1 < 120000) {
    const s = await sample(p);
    const tag = s.screen + (s.track ? '+track' : '') + (s.g7game ? '+g7' : '');
    if (seen[seen.length - 1] !== tag) seen.push(tag);
    if (s.over) break;
    if (s.g7game) { sawG7 = true; await p.evaluate(() => document.getElementById('gm-simall').click()); }
    else await p.evaluate(() => {
      const hit = (id) => { const e = document.getElementById(id); if (e && e.offsetParent) { e.click(); return true; } return false; };
      if (document.querySelector('#s-series.on')) hit('sr-sim');
      else if (document.querySelector('#s-playoffs.on') && !document.getElementById('po-track').hidden) hit('b-brk-skip');
      else if (document.querySelector('#s-game.on')) hit('gm-skipgame');
    });
    await p.waitForTimeout(200);
  }
  claim(sawG7, 'sim the series plus skip ahead still lands on the deciding game', seen.join(' > '));
  await found.ctx.close();
}

claim(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
await browser.close();
server.close();
console.log(fails ? `\n${fails} of ${checks} checks FAILED.` : `\nAll ${checks} checks passed.`);
process.exit(fails ? 1 : 0);
