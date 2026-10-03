/* Browser harness for the arcade's regression checks.
 *
 * Arcade pages load their scripts from absolute paths (/arcade/tokens.js), so a
 * file:// URL cannot open them. This serves the repo root on a free port and
 * hands back a Playwright page that is quiet and offline:
 *
 *   - the first-visit how-to and tour are marked seen, so nothing covers the
 *     board on load (a test that has to click past a modal tests the modal);
 *   - Supabase, analytics and ad requests are refused, so no check can ever
 *     write a row to the live leaderboard or count as a visit;
 *   - a tier can be set before any script runs: 'guest', 'free' (a fake
 *     signed-in session) or 'card' (the same plus the Arcade Card mirror).
 *
 * The fake session only satisfies tokens.js signedIn(), which reads the token
 * blob's presence. It cannot authenticate against anything, and every request
 * it might make is blocked above.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const GAMES = ['match','crossword','highlow','oddone','sportegories','career','guess','rankit','almamater','table','rollcall','chain'];
export const FREE = ['crossword','sportegories','almamater','career'];

const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css',
  '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml', '.webp':'image/webp', '.ico':'image/x-icon',
  '.woff2':'font/woff2', '.txt':'text/plain' };

export function serve(){
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      let f = path.join(ROOT, p);
      if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      try { if (fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); } catch (e) {}
      fs.readFile(f, (err, buf) => {
        if (err) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control':'no-store' });
        res.end(buf);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, base: 'http://127.0.0.1:' + srv.address().port }));
  });
}

export function today(d){
  d = d || new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

const SESSION = 'sb-jcrrxqfpdelrmvjuihnm-auth-token';

export async function launch(){ return chromium.launch(); }

/* opts: { tier:'guest'|'free'|'card', mobile:bool, vp:{width,height}, popups:bool, time:Date } */
export async function page(browser, base, opts = {}){
  const mobile = opts.mobile !== false && !(opts.vp && opts.vp.width > 600);
  const ctx = await browser.newContext({
    viewport: opts.vp || (mobile ? { width:375, height:740 } : { width:1280, height:900 }),
    isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1,
  });
  await ctx.route(/supabase\.co|googletagmanager|google-analytics|googlesyndication|doubleclick|jsdelivr|fonts\.g|gstatic/, r => r.abort());
  if (opts.time) await ctx.clock.install({ time: opts.time });
  await ctx.addInitScript(({ games, tier, popups, session }) => {
    try {
      if (sessionStorage.getItem('__harness')) return;
      sessionStorage.setItem('__harness', '1');
      if (!popups) {
        games.forEach(g => { localStorage.setItem('rtg:howto:'+g, '1'); localStorage.setItem('rtg:howto2:'+g, '1'); });
        ['hub','arcade','home'].forEach(k => localStorage.setItem('rtg:tour:'+k, '1'));
      }
      if (tier === 'free' || tier === 'card') localStorage.setItem(session, JSON.stringify({ access_token:'harness', user:{ id:'00000000-0000-4000-8000-000000000001' } }));
      if (tier === 'card') localStorage.setItem('runthegrid_pro', '1');
    } catch (e) {}
  }, { games: GAMES, tier: opts.tier || 'guest', popups: !!opts.popups, session: SESSION });
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', e => p.errs.push(e.message));
  return { ctx, p };
}

export function reporter(){
  let fails = 0;
  const ok = (cond, what, detail) => {
    if (cond) { console.log('  ok   ' + what); return; }
    fails++; console.log('  FAIL ' + what + (detail ? '\n       ' + detail : ''));
  };
  return { ok, fails: () => fails, section: (t) => console.log('\n' + t) };
}
