#!/usr/bin/env node
/* Records short gameplay videos of our games for social media (X, Instagram Reels, Facebook).

   node scripts/marketing/record.mjs --list                     the scenes
   node scripts/marketing/record.mjs football-draft             marketing/media/football-draft-<today>.mp4
   node scripts/marketing/record.mjs golf-tour --out marketing/media/golf.mp4
   node scripts/marketing/record.mjs football-draft --draft     720x1280 instead of 1080x1920, to iterate faster
   node scripts/marketing/record.mjs football-draft --seed 7    another roll of the dice
   node scripts/marketing/record.mjs football-draft --dry --seed 7   play it unfilmed, print the outcome
   node scripts/marketing/record.mjs golf-tour --line sas       golf: safe, aggressive, safe at the calls

   A scene is a scripted play-through of one moment of one game: one function in SCENES below. It
   taps, scrolls and waits like a person on a phone, and every tap draws a soft ripple where it
   lands. Nothing is typed into the video: no captions, no watermark.

   How it films. The page runs on a fake clock (Playwright's page.clock) and every CSS animation is
   paused and stepped by hand, so the page only moves when the recorder says so. Each frame advances
   the clock by 1/30 s, steps the animations by the same, and takes a full resolution screenshot.
   That is slower than real time but the result is smooth at any machine speed, sharp (a 405x720
   phone viewport at a device scale of 8/3 is exactly 1080x1920), and the same every run: Math.random
   is seeded and the date is pinned. A screencast was tried first; Chromium caps its frames at CSS
   pixel size, so it cannot give a 1080 wide video.

   The output is what X, Instagram Reels and Facebook all accept: MP4, H.264 High, yuv420p, 30 fps, a
   silent AAC track, faststart, 5 to 60 seconds and under 15 MB. A poster JPG is written next to it.

   It serves the repo itself (python3 -m http.server on 8080, as scripts/qa/run.mjs does) unless
   something already answers there. Every request off this machine is refused (the web fonts aside),
   so a video never depends on a live service. A game shows offline notices when its board or account
   calls fail; a scene hides those with its own CSS, here, never by editing the game.

   Each scene's seed was picked with --dry for a good outcome (a football title, a golf birdie). The
   outcome holds at full size only: --draft lays the page out at another scale, which can change
   what a seeded run draws. Re-pick a seed when a game's data or the pinned date changes.

   Needs Playwright (npm install --no-save playwright@1.56.1) and ffmpeg. */
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (f, d) => { const i = args.indexOf(f); return i < 0 ? d : args[i + 1]; };
const has = (f) => args.includes(f);

const FPS = 30;
const VIEW = { width: 405, height: 720 };       // 9:16, a phone's width
const SCALE = has('--draft') ? 720 / 405 : 1080 / 405;  // 720x1280 or 1080x1920
const DRY = has('--dry');                      // play the scene without filming (to try seeds)
const MAX_BYTES = 15 * 1024 * 1024;
const TODAY = new Date().toISOString().slice(0, 10);

/* ------------------------------------------------------------------------------------------------
   The scenes. Each one gets `rec` (below) and drives the page through it. `url` is opened first,
   `ready` is waited for (without filming), `css` is added to the page to hide offline notices,
   `poster` is the second of the finished video the poster JPG is cut from. */
const SCENES = {
  'football-draft': {
    game: 'The Perfect Season',
    url: '/football/',
    seed: 108,
    ready: () => !!document.querySelector('#b-start'),
    // The leaderboard and account notices that only appear because the board cannot be reached.
    css: `#o-gate,#o-splits{display:none!important}`,
    poster: 3.2,
    async play(rec) {
      const { page } = rec;
      await rec.wait(900);
      await rec.tap('#b-start');
      const board = () => [...document.querySelectorAll('.tile')].filter(t => t.offsetParent).map(t => t.querySelector('.nm')?.textContent).join('|');
      let last = '';
      for (let k = 0; k < 6; k++) {
        // The reels spin. Fast forward the wait so six spins fit. A spin is over when its own
        // board is up: the counter reads this spin and the names are not the last board's.
        await rec.ff(3.2, () => rec.until(`(() => { const b = (${board})(); return b && b !== ${JSON.stringify(last)} && new RegExp('SPIN ${k + 1} OF', 'i').test(document.body.innerText) && [...document.querySelectorAll('.tile:not(.off)')].some(t => t.offsetParent); })()`, 12000));
        last = await page.evaluate(board);
        await rec.wait(k < 2 ? 450 : 250);
        // Best points a game the money allows, keeping enough for the spots still open.
        const pick = await page.evaluate((k) => {
          const money = parseFloat((document.querySelector('.amt')?.textContent || '0').replace(/[^0-9.]/g, ''));
          const open = 6 - k;
          const tiles = [...document.querySelectorAll('.tile:not(.off)')].filter(t => t.offsetParent);
          let best = null, bi = -1, cheap = Infinity, ci = -1;
          tiles.forEach((t, i) => {
            const pr = parseFloat((t.querySelector('.pr')?.textContent || '').replace(/[^0-9.]/g, ''));
            const pts = parseFloat(t.querySelector('.pts b')?.textContent || '0');
            if (pr < cheap) { cheap = pr; ci = i; }
            if (!(pr <= money - 3.5 * (open - 1))) return;
            if (best === null || pts > best) { best = pts; bi = i; }
          });
          if (bi < 0) bi = ci;
          tiles.forEach(t => t.removeAttribute('data-rec-pick'));
          if (bi < 0) return -1;
          tiles[bi].setAttribute('data-rec-pick', '1');
          return bi;
        }, k);
        // Nobody here fits: buy a new team, the way a player would.
        if (pick < 0) { await rec.tap('.respin >> nth=1'); k--; continue; }
        await rec.tap('[data-rec-pick="1"]', { pre: k < 2 ? 350 : 220, post: 250 });
        if (await rec.visible('.slotopt')) { await rec.wait(500); await rec.tap('.slotopt'); }
        await rec.wait(250);
      }
      // The finished roster, then play the season.
      await rec.wait(700);
      await rec.tap('#b-play', { pre: 300 });
      await rec.ff(2.6, () => rec.until(() => /SEASON OVER|REGULAR SEASON COMPLETE/i.test(document.body.innerText), 30000));
      await rec.wait(1000);
      if (/REGULAR SEASON COMPLETE/i.test(await page.evaluate(() => document.body.innerText))) {
        await rec.wait(300);
        await rec.tap('text=Simulate the postseason', { pre: 300 });
      }
      await rec.ff(2.6, () => rec.until(() => !!document.querySelector('#b-same') && !!document.querySelector('#b-same').offsetParent, 30000));
      await rec.wait(2800);
      return page.evaluate(() => document.body.innerText.match(/FINAL RECORD\s+(\S+)\s+(.*)/i)?.slice(1).join(' '));
    },
  },
  'golf-tour': {
    game: 'Run The Tour',
    url: '/golf/',
    seed: 3,
    line: 'sa',    // the call at each decision: a for the aggressive line, s for safe
    ready: () => !!document.querySelector('.gcard.heroc'),
    poster: 9,
    async play(rec) {
      const { page } = rec;
      // The way in (the daily card, today's course, the how-it-works card) is not filmed.
      await rec.offscreen(async () => {
        await rec.tap('.gcard.heroc'); await rec.wait(1500);
        await rec.tap('.btn.goldfill'); await rec.wait(1500);
        await rec.tap('text=DRAFT YOUR GOLFER'); await rec.wait(1200);
        if (await rec.visible('text=GOT IT')) { await rec.tap('text=GOT IT'); await rec.wait(600); }
        await rec.scrollTo(0, 100);
        await rec.wait(400);
      });
      // Eight spins, eight skills: each time the golfer's best open skill goes in. The first three
      // are filmed; the other five happen off camera and the film cuts to the finished golfer.
      for (let k = 0; k < 8; k++) {
        if (k === 3) rec.filming = false;
        await rec.until(() => !!document.querySelector('.osreel') || document.querySelectorAll('.dtile.open').length > 0, 8000);
        if (await rec.visible('.osreel')) {
          await rec.tap('.osreel', { pre: k ? 150 : 400, post: 100 });
          await rec.ff(4, () => rec.until(() => document.querySelectorAll('.dtile.open').length > 0, 10000));
        }
        await rec.wait(k < 2 ? 400 : 150);
        await page.evaluate(() => {
          const t = [...document.querySelectorAll('.dtile.open')];
          let b = null, bv = -1;
          for (const e of t) { const v = parseInt(e.innerText.match(/(\d+)\s*$/)?.[1] || '0'); if (v > bv) { bv = v; b = e; } }
          t.forEach(e => e.removeAttribute('data-rec-pick')); b.setAttribute('data-rec-pick', '1');
        });
        await rec.tap('[data-rec-pick="1"]', { pre: k < 2 ? 260 : 140, post: 220 });
      }
      rec.filming = true;
      // Tee off, then play the key holes: take the aggressive line every time it is offered.
      await rec.until(() => /TEE OFF AT/i.test(document.body.innerText), 8000);
      await rec.scrollTo(0, 10);
      await rec.wait(1000);
      await rec.tap('text=TEE OFF AT', { pre: 300 });
      // The result pill over a holed-out hole: Birdie, Eagle and better.
      await page.evaluate(() => { window.__res = []; new MutationObserver(() => { const r = document.querySelector('.hvresult .rn'); const t = r && r.textContent.trim(); if (t && window.__res[window.__res.length - 1] !== t) window.__res.push(t); }).observe(document.body, { subtree: true, childList: true, characterData: true }); });
      const birdie = () => !!document.querySelector('.hvresult .rn') && /^(birdie|eagle|albatross|ace)/i.test(document.querySelector('.hvresult .rn').textContent.trim());
      const start = rec.frames;
      for (let d = 0; d < 8; d++) {
        await rec.ff(2.6, () => rec.until(`!!document.querySelector('.dkc.agg') || (${birdie})()`, 60000));
        if (await page.evaluate(birdie)) { await rec.wait(2400); break; }
        await rec.wait(800);
        const line = (opt('--line', this.line) || 'a')[d] || 'a';
        await rec.tap(line === 's' ? '.dkc.safe' : '.dkc.agg', { pre: 250, post: 300 });
      }
      return `${Math.round((rec.frames - start) / 30)}s of round, ${Math.round(rec.frames / 30)}s in all, results: ${await page.evaluate(() => window.__res.join(' '))}`;
    },
  },
  'arcade-crossword': {
    game: 'Run The Arcade: Daily Crossword',
    url: '/arcade/crossword/',
    seed: 1,
    ready: () => !!document.querySelector('#board .sel') && document.querySelectorAll('button.key').length > 20,
    poster: 6,
    async play(rec) {
      const { page } = rec;
      // Today's puzzle, rebuilt from the page's own generators exactly as the page picks it.
      const entries = await page.evaluate(() => {
        const d = new Date().toISOString().slice(0, 10);
        let P = null;
        try { if (window.RTG_CWMINI && window.RTGFlags && RTGFlags.on('densecw', d)) P = RTG_CWMINI.forDate(d); } catch (e) {}
        if (!P && window.RTG_CWGEN) P = RTG_CWGEN.forDate(d);
        if (!P && window.RTG_PUZZLES) P = RTG_PUZZLES.forDate(d);
        // The order the page's own next-clue arrow walks: across, then down, by number.
        return P.entries.slice().sort((a, b) => a.dir === b.dir ? a.num - b.num : (a.dir < b.dir ? -1 : 1)).map(e => String(e.answer).toUpperCase());
      });
      await rec.wait(1100);
      for (let i = 0; i < entries.length; i++) {
        // The board opens on the first clue; after that the arrow moves to the next one.
        // A beat to read the clue. The game's own timer runs through it at a person's pace (about
        // seven seconds a clue) while the film shows half a second, so the solve time on the result
        // screen is one a human could post, not the ten seconds the taps alone would take.
        await rec.ff(14, () => rec.wait(500));
        if (i) await rec.tap('#nextClue', { pre: 180, post: 220, press: 80, scroll: false });
        for (const ch of entries[i]) {
          await rec.tap(page.locator('button.key', { hasText: new RegExp(`^${ch}$`) }), { pre: 40, press: 50, post: 70, scroll: false });
        }
        await rec.wait(i < 2 ? 350 : 150);
      }
      // Solved: hold on whatever the page celebrates with.
      await rec.wait(3200);
      return page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 200));
    },
  },
};

/* ------------------------------------------------------------------------------------------------
   The page side of the recorder: a seeded Math.random, the tap ripple, and the animation stepper.
   Runs before any of the page's own scripts. */
function pageSide({ seed, css }) {
  let s = seed >>> 0 || 1;
  // Reseeded when filming starts, so however long the boot took, the scene draws the same numbers.
  window.__recSeed = (n) => { s = n >>> 0 || 1; };
  Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const known = new WeakSet();
  const R = window.__rec = {
    step(dt) {
      for (const a of document.getAnimations()) {
        if (a.__recOwn === false) continue;
        if (!known.has(a)) { known.add(a); try { a.pause(); a.currentTime = 0; } catch (e) {} }
        if (a.playState !== 'paused') continue;
        const t = (a.currentTime || 0) + dt;
        let end = Infinity;
        try { end = a.effect.getComputedTiming().endTime; } catch (e) {}
        try { if (Number.isFinite(end) && t >= end) a.finish(); else a.currentTime = t; } catch (e) {}
      }
    },
    layer() {
      let l = document.getElementById('__rec-layer');
      if (!l) {
        l = document.createElement('div');
        l.id = '__rec-layer';
        l.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;overflow:hidden';
        document.documentElement.appendChild(l);
      }
      return l;
    },
    dot(x, y, kind) {
      const d = document.createElement('div');
      const size = kind === 'ring' ? 64 : 44;
      d.style.cssText = `position:absolute;left:${x - size / 2}px;top:${y - size / 2}px;width:${size}px;height:${size}px;border-radius:50%;` +
        (kind === 'ring'
          ? 'border:3px solid rgba(255,255,255,.85);background:rgba(255,255,255,.18);box-shadow:0 0 18px rgba(255,255,255,.35)'
          : 'background:radial-gradient(circle,rgba(255,255,255,.75) 0%,rgba(255,255,255,.35) 55%,rgba(255,255,255,0) 72%)');
      R.layer().appendChild(d);
      const frames = kind === 'ring'
        ? [{ transform: 'scale(.35)', opacity: .95 }, { transform: 'scale(1.5)', opacity: 0 }]
        : [{ transform: 'scale(.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1, offset: .6 }, { transform: 'scale(.9)', opacity: 0 }];
      const a = d.animate(frames, { duration: kind === 'ring' ? 560 : 420, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' });
      a.finished.then(() => d.remove(), () => d.remove());
    },
  };
  addEventListener('pointerdown', (e) => R.dot(e.clientX, e.clientY, 'ring'), true);
  const st = document.createElement('style');
  st.textContent = `html,body,*{scroll-behavior:auto!important}::-webkit-scrollbar{display:none}${css || ''}`;
  const put = () => (document.head || document.documentElement).appendChild(st);
  if (document.head) put(); else addEventListener('DOMContentLoaded', put);
}

/* ------------------------------------------------------------------------------------------------
   The film side. One frame: advance the clock, step the animations, screenshot, hand to ffmpeg. */
const ease = (t) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

class Rec {
  constructor(page, enc) { this.page = page; this.enc = enc; this.speed = 1; this.frames = 0; this.jit = 1; this.filming = true; }
  async tick() {
    const dt = 1000 / FPS * this.speed;
    await this.page.clock.runFor(dt);
    await this.page.evaluate((d) => window.__rec && window.__rec.step(d), dt);
  }
  async frame() {
    await this.tick();
    if (!this.filming) return;
    if (DRY) { this.frames++; return; }
    const buf = await this.page.screenshot({ type: 'jpeg', quality: 93, caret: 'initial' });
    await this.enc.write(buf);
    this.frames++;
  }
  /* Film `ms` of video. */
  async wait(ms) { const n = Math.max(1, Math.round(ms / 1000 * FPS)); for (let i = 0; i < n; i++) await this.frame(); }
  /* Film until a condition in the page holds. Throws past `max` ms of page time. */
  async until(fn, max = 10000) {
    let spent = 0;
    while (!(await this.page.evaluate(fn))) {
      if (spent > max) throw new Error(`timed out waiting for: ${String(fn).slice(0, 120)}`);
      await this.frame(); spent += 1000 / FPS * this.speed;
    }
  }
  /* Play part of the scene without filming it: the way in, before the moment worth watching. */
  async offscreen(fn) { const f = this.filming; this.filming = false; try { return await fn(); } finally { this.filming = f; } }
  /* Fast forward: the page runs `factor` times faster for whatever `fn` films. */
  async ff(factor, fn) { const s = this.speed; this.speed = factor; try { return await fn(); } finally { this.speed = s; } }
  async visible(sel) {
    return this.page.locator(sel).first().isVisible().catch(() => false);
  }
  async box(target) {
    const el = typeof target === 'string' ? this.page.locator(target).first() : target;
    const b = await el.boundingBox();
    if (!b) throw new Error(`nothing to tap: ${target}`);
    return b;
  }
  /* The element scrolled to sit comfortably in view, with an eased scroll a thumb would make. */
  async bringIntoView(target, ms = 650) {
    const b = await this.box(target);
    const top = 56, bottom = VIEW.height - 90;
    if (b.y >= top && b.y + b.height <= bottom) return;
    const dy = b.y + b.height / 2 - VIEW.height * 0.55;
    await this.scrollBy(dy, ms);
  }
  /* An eased scroll of the page (or of `container`, a selector) by dy CSS px. */
  async scrollBy(dy, ms = 700, container = null) {
    const from = await this.page.evaluate((c) => (c ? document.querySelector(c) : document.scrollingElement).scrollTop, container);
    const n = Math.max(2, Math.round(ms / 1000 * FPS));
    for (let i = 1; i <= n; i++) {
      const y = from + dy * ease(i / n);
      await this.page.evaluate(([c, y]) => { (c ? document.querySelector(c) : document.scrollingElement).scrollTop = y; }, [container, y]);
      await this.frame();
    }
  }
  async scrollTo(y, ms = 700, container = null) {
    const from = await this.page.evaluate((c) => (c ? document.querySelector(c) : document.scrollingElement).scrollTop, container);
    await this.scrollBy(y - from, ms, container);
  }
  /* A tap: scroll it into view if it is not, a beat to aim, the press, a beat to let go. A small,
     fixed offset from dead centre each time, because a thumb never lands in the middle. */
  async tap(target, { pre = 260, post = 380, at = null, press = 110, scroll = true } = {}) {
    if (scroll) await this.bringIntoView(target);
    this.jit = (this.jit * 7 + 3) % 11;
    let x, y;
    for (let tries = 0; ; tries++) {
      const b = await this.box(target);
      x = at ? b.x + at[0] : b.x + b.width / 2 + (this.jit - 5) * Math.min(1.2, b.width / 60);
      y = at ? b.y + at[1] : b.y + b.height / 2 + ((this.jit % 5) - 2) * Math.min(1, b.height / 40);
      // Would the tap land on it, or on a sticky bar over it? If a bar, scroll it to mid screen.
      const el = typeof target === 'string' ? this.page.locator(target).first() : target;
      const hits = await el.evaluate((e, [x, y]) => { const h = document.elementFromPoint(x, y); return !!h && (e === h || e.contains(h) || h.contains(e)); }, [x, y]);
      if (hits || tries >= 2 || !scroll) break;
      await this.scrollBy(y - VIEW.height * 0.6, 450);
    }
    await this.wait(pre);
    await this.page.evaluate(([x, y]) => window.__rec.dot(x, y, 'press'), [x, y]);
    await this.wait(press);
    await this.page.mouse.click(x, y);
    // No hover state left behind: a finger lifts off the glass.
    await this.page.mouse.move(2, VIEW.height - 2);
    await this.wait(post);
  }
  async key(k, { post = 120 } = {}) { await this.page.keyboard.press(k); await this.wait(post); }
  async type(text, { each = 110 } = {}) { for (const ch of text) { await this.page.keyboard.type(ch); await this.wait(each); } }
}

/* ------------------------------------------------------------------------------------------------
   Servers, the browser, the encoder. */
const free = (port) => new Promise(r => { const s = net.createServer().once('error', () => r(false)).once('listening', () => s.close(() => r(true))).listen(port, '127.0.0.1'); });
const servers = [];
async function serve(port) {
  if (!(await free(port))) return;
  const [cmd, a] = port === 8081 ? ['node', ['cfb/build/test/gzip_server.mjs']] : ['python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1']];
  servers.push(spawn(cmd, a, { cwd: ROOT, stdio: 'ignore' }));
  for (let i = 0; i < 50 && (await free(port)); i++) await new Promise(r => setTimeout(r, 200));
}
const stop = () => servers.forEach(s => { try { s.kill(); } catch {} });
process.on('exit', stop);

function encoder(out) {
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-map', '0:v', '-map', '1:a', '-shortest', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.1', '-preset', 'slow', '-crf', '23',
    '-maxrate', '3500k', '-bufsize', '7M', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-g', String(FPS * 2),
    '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`))));
  return {
    write: (buf) => new Promise((res) => { if (ff.stdin.write(buf)) res(); else ff.stdin.once('drain', res); }),
    end: () => { ff.stdin.end(); return done; },
  };
}

function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_name,profile,width,height,pix_fmt,r_frame_rate', '-of', 'json', file], { encoding: 'utf8' });
  return JSON.parse(r.stdout);
}

// --- main ---------------------------------------------------------------------------------------
if (has('--list') || !args[0] || args[0].startsWith('--')) {
  for (const [k, s] of Object.entries(SCENES)) console.log(`${k.padEnd(18)} ${s.game}`);
  process.exit(has('--list') ? 0 : 2);
}
const name = args[0];
const scene = SCENES[name];
if (!scene) { console.error(`unknown scene "${name}". Known: ${Object.keys(SCENES).join(', ')}`); process.exit(2); }
const out = path.resolve(ROOT, opt('--out', `marketing/media/${name}-${TODAY}.mp4`));
fs.mkdirSync(path.dirname(out), { recursive: true });

let chromium;
try { ({ chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright')); }
catch { console.error('needs Playwright: npm install --no-save playwright@1.56.1'); process.exit(2); }

const port = scene.port || 8080;
await serve(port);
const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: SCALE, isMobile: true, hasTouch: true,
  locale: 'en-US', timezoneId: 'America/New_York', colorScheme: 'dark', reducedMotion: 'no-preference' });
// Local files and the web fonts the live pages load; nothing else leaves the machine.
const ALLOW = new Set(['127.0.0.1', 'localhost', 'fonts.googleapis.com', 'fonts.gstatic.com']);
await ctx.route('**/*', (r) => ALLOW.has(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
const page = await ctx.newPage();
const errors = [], inflight = new Set();
let lastNet = Date.now();
page.on('request', (r) => { inflight.add(r); lastNet = Date.now(); });
for (const ev of ['requestfinished', 'requestfailed']) page.on(ev, (r) => { inflight.delete(r); lastNet = Date.now(); });
page.on('pageerror', (e) => errors.push(String(e.message || e).slice(0, 160)));
await page.addInitScript(pageSide, { seed: +opt('--seed', scene.seed || 1), css: scene.css || '' });
// An installed clock still flows in real time until it is paused. Paused, it moves only by runFor.
const T0 = new Date(scene.date || `${TODAY}T15:00:00-04:00`).getTime();
await page.clock.install({ time: T0 });
await page.clock.pauseAt(T0 + 1000);
await page.goto(base + scene.url, { waitUntil: 'load' });

// Boot without filming: let the clock run while the page fetches its data, until it is ready and
// nothing has been in flight for a while. Data landing mid-scene would change what the page draws
// from Math.random, and with it the whole run.
{
  const t0 = Date.now();
  while (!(await page.evaluate(scene.ready).catch(() => false)) || inflight.size || Date.now() - lastNet < 800) {
    if (Date.now() - t0 > 30000) { console.error('the page never became ready'); process.exit(1); }
    await page.clock.runFor(100);
    await new Promise(r => setTimeout(r, 50));
  }
  for (let i = 0; i < 20; i++) { await page.clock.runFor(100); await page.evaluate(() => window.__rec.step(100)); await new Promise(r => setTimeout(r, 30)); }
  if (scene.setup) await scene.setup(page);
}

const SEED = +opt('--seed', scene.seed || 1);
await page.evaluate((n) => window.__recSeed(n), SEED);
const enc = DRY ? { write: async () => {}, end: async () => {} } : encoder(out);
const rec = new Rec(page, enc);
const t0 = Date.now();
let outcome;
try { outcome = await scene.play(rec); }
catch (e) {
  const shot = out.replace(/\.mp4$/, '-failed.png');
  await page.screenshot({ path: shot }).catch(() => {});
  console.error(`scene failed after ${(rec.frames / FPS).toFixed(1)}s of video: ${e.message}\n  the page at that moment: ${path.relative(ROOT, shot)}`);
  await enc.end().catch(() => {}); await browser.close(); process.exit(1);
}
await enc.end();
await browser.close();
if (outcome) console.log(`outcome: ${outcome}`);
if (DRY) process.exit(0);

const secs = rec.frames / FPS;
const posterAt = Math.min(scene.poster ?? 1, Math.max(0, secs - 0.5));
const poster = out.replace(/\.mp4$/, '.jpg');
spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(posterAt), '-i', out, '-frames:v', '1', '-q:v', '3', poster]);

const p = probe(out), bytes = fs.statSync(out).size, dur = +p.format.duration;
const v = p.streams.find(s => s.width), a = p.streams.find(s => !s.width);
console.log(`${path.relative(ROOT, out)}  ${v.codec_name} ${v.profile} ${v.width}x${v.height} ${v.pix_fmt} ${v.r_frame_rate} fps, ${a ? a.codec_name : 'NO AUDIO'}, ${dur.toFixed(2)}s, ${(bytes / 1048576).toFixed(2)} MB  (filmed in ${Math.round((Date.now() - t0) / 1000)}s)`);
console.log(`${path.relative(ROOT, poster)}  poster at ${posterAt}s`);
if (errors.length) console.log(`page errors (not fatal): ${[...new Set(errors)].slice(0, 3).join(' | ')}`);
const bad = [];
if (bytes > MAX_BYTES) bad.push(`over 15 MB (${bytes} bytes)`);
if (dur < 5 || dur > 60) bad.push(`duration ${dur.toFixed(1)}s is outside 5 to 60 seconds`);
if (bad.length) { console.error(`NOT POSTABLE: ${bad.join('; ')}`); process.exit(1); }
