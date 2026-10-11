/* Plays whole games of the 3D prototype headless, both halves driven by the
   page's own autoplay bot, and fails on a page error, a play that never
   resolves, a game that never ends, or a game with no ball in play.

   (nohup python3 -m http.server 8099 &) ; node mythiball/proto3d/check-game.mjs [games] [innings]

   It steps the game clock directly (PROTO.tick) rather than waiting on the
   frame loop, because WebGL in a headless browser is software and a real
   time game would take an hour. */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const [,, games = '3', inn = '3'] = process.argv;
const URL = process.env.PROTO_URL || 'http://localhost:8099/mythiball/proto3d/';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 480, height: 320 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(URL); await p.waitForFunction(() => window.PROTO);
let bad = 0;
for (let g = 0; g < +games; g++) {
  const r = await p.evaluate(([inn, home]) => {
    const P = window.PROTO, G = P.G; P.pause(true); P.menu.innings = inn; P.menu.home = home; P.startGame(); P.auto = true;
    let sig = '', still = 0, inplay = 0, prev = '';
    for (let n = 0; n < 60 * 60 * 40 && !G.over; n++) {
      P.tick(1 / 60);
      if (G.state === 'inplay' && prev !== 'inplay') inplay++; prev = G.state;
      const s = [G.inning, G.half, G.outs, G.b, G.s, G.state].join(',');
      if (s !== sig) { sig = s; still = 0; } else if (++still > 60 * 30) return { stuck: s };
    }
    return { over: G.over, inplay, score: G.teams.map((t) => t.runs.reduce((a, b) => a + (b || 0), 0)), hits: G.teams.map((t) => t.hits) };
  }, [+inn, g % 2 === 0]);
  const ok = r.over && r.inplay > 0;
  if (!ok) bad++;
  console.log((ok ? 'ok   ' : 'FAIL ') + JSON.stringify(r));
}
if (errs.length) { bad++; console.log('FAIL page errors:\n' + [...new Set(errs)].join('\n')); }
await b.close();
process.exit(bad ? 1 : 0);
