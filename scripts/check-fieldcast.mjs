/* THE BROADCAST FIELD, AND THE RULES THAT MAKE IT HONEST.
 *
 *   node scripts/check-fieldcast.mjs
 *
 * /assets/fieldcast.js draws every game in both football games. Every way it goes wrong
 * renders a perfectly good looking picture, so this drives the real file in a browser with
 * drives written here and asks the properties rather than looking:
 *
 *   - a moment fires when the clock CROSSES the end of a scoring drive, once, and never on a
 *     jump (Sim to the end, the final repaint), which crosses too much to be a moment
 *   - rewinding the clock is a new game and forgets what fired
 *   - two teams whose colours are within reach of each other are split, or the players,
 *     lanes and end zones of both sides are one colour
 *   - downs:false (the boss board) never shows an invented down, and a real one (sit) is
 *     shown exactly as the page gave it
 *   - both pages load the file and hand drawDriveChart to it, with the old chart kept as the
 *     fallback for a blocked copy
 *
 * Nothing leaves the machine: the page is set from a string and the file is read off disk.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PW = process.env.PS_PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright/index.js';
let pw;
try { pw = (await import(PW)).default; } catch (e) {
  console.log('Playwright is not available here, so this check cannot run.');
  process.exit(0);
}
const CHROME = process.env.PS_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let bad = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${label}${detail ? '   ' + detail : ''}`);
  if (!pass) bad++;
};

/* The pages, read as text. */
console.log('BOTH GAMES DRAW ON IT');
for (const [page, style] of [['football/index.html', 'nfl'], ['cfb/index.html', 'college']]) {
  const s = fs.readFileSync(path.join(ROOT, page), 'utf8');
  ok(page + ' loads /assets/fieldcast.js', /<script src="\/assets\/fieldcast\.js\?v=\d+"><\/script>/.test(s));
  const i = s.indexOf('function drawDriveChart(');
  const head = i >= 0 ? s.slice(i, i + 1400) : '';
  ok('  and drawDriveChart hands its drives to it, as ' + style,
    /RTG_FIELD\.paint\(/.test(head) && head.includes("style:'" + style + "'"));
  ok('  and keeps the old chart under it as the fallback', /return;\s*\n\s*\}[\s\S]{0,400}ctx\.save\(\)/.test(head));
  ok('  and initFieldCanvas lets it size the canvas', /RTG_FIELD\.prepare\(cv\)/.test(s));
}
const fb = fs.readFileSync(path.join(ROOT, 'football/index.html'), 'utf8');
const bd = fb.slice(fb.indexOf('function bossDraw('), fb.indexOf('function bossDraw(') + 1600);
ok('the boss board turns the invented downs off and passes the real one',
  /downs:false/.test(bd) && /sit:\{down:c\.down/.test(bd));

const src = fs.readFileSync(path.join(ROOT, 'assets/fieldcast.js'), 'utf8');
const browser = await pw.chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 390, height: 500 }, deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.route('**/*', (r) => r.abort());
await page.setContent('<!doctype html><body style="margin:0;background:#000"><div id="w" style="width:358px">'
  + '<canvas id="c"></canvas></div></body>');
await page.addScriptTag({ content: src });

const res = await page.evaluate(() => {
  const F = window.RTG_FIELD, cv = document.getElementById('c');
  const out = { api: F && F.API_VERSION };
  F.prepare(cv);
  out.h = cv.height; out.cssH = parseInt(cv.style.height, 10);
  const drives = [
    { team: 'you', startYard: 25, endYard: 100, result: 'touchdown', tStart: 0, tEnd: 300 },
    { team: 'them', startYard: 75, endYard: 30, result: 'field goal', tStart: 300, tEnd: 600 },
    { team: 'you', startYard: 22, endYard: 48, result: 'punt', tStart: 600, tEnd: 900 },
    { team: 'them', startYard: 80, endYard: 55, result: 'turnover', takeaway: 'INTERCEPTION', tStart: 900, tEnd: 1100 },
    { team: 'you', startYard: 55, endYard: 100, result: 'touchdown', tStart: 1100, tEnd: 1300 },
  ];
  const frame = (up, extra) => Object.assign({ drives, upTo: up, style: 'nfl',
    you: { color: '#1d4ed8', name: 'YOU' }, them: { color: '#dc2626', name: 'SD' } }, extra || {});
  const st = () => cv.__rtgField;
  const labels = () => st().fx.map((f) => f.label).join(',');
  F.paint(cv, frame(0));
  out.firstFx = st().fx.length;
  for (let t = 10; t <= 300; t += 10) F.paint(cv, frame(t));
  out.afterTd = labels();
  F.paint(cv, frame(300)); F.paint(cv, frame(301));
  out.afterRepeat = st().fx.length;
  for (let t = 310; t <= 600; t += 10) F.paint(cv, frame(t));
  out.afterFg = labels();
  for (let t = 610; t <= 1100; t += 10) F.paint(cv, frame(t));
  out.afterInt = labels();
  /* The jump: rewind to a new game, then straight to the final whistle. */
  F.paint(cv, frame(0));
  out.rewound = st().fx.length;
  F.paint(cv, frame(3600));
  out.jump = st().fx.length;
  /* Downs: an invented one on the broadcast, none on the boss board, the real one when given. */
  const probe = (extra, up, list) => {
    let seen = null;
    const orig = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(txt){ if (/^(1ST|2ND|3RD|4TH) & /.test(txt)) seen = txt; return orig.apply(this, arguments); };
    F.paint(cv, Object.assign(frame(up, extra), list ? { drives: list } : {}));
    CanvasRenderingContext2D.prototype.fillText = orig;
    return seen;
  };
  F.paint(cv, frame(0));
  let inv = null;
  for (let t = 1; t < 300 && !inv; t += 3) inv = probe({}, t);
  out.invented = inv;
  F.paint(cv, frame(0, { downs: false }));
  let off = null;
  for (let t = 1; t < 300 && !off; t += 3) off = probe({ downs: false }, t);
  out.bossInvented = off;
  const live = [{ team: 'you', startYard: 30, endYard: 83, result: 'live', tStart: 0, tEnd: 400, plays: 7, sit: { down: 4, toGo: 1 } }];
  F.paint(cv, frame(0, { downs: false, drives: live }));
  out.real = probe({ downs: false }, 400, live);
  /* Two blues. */
  F.paint(cv, Object.assign(frame(0), { you: { color: '#1d4ed8', name: 'YOU' }, them: { color: '#1e40af', name: 'SEA' } }));
  out.split = st().them.color;
  /* The picture: dark stands over green turf. */
  const g = cv.getContext('2d');
  const px = (x, y) => Array.from(g.getImageData(Math.round(x * cv.width), Math.round(y * cv.height), 1, 1).data);
  out.stands = px(0.5, 0.08); out.turf = px(0.5, 0.8);
  return out;
});
console.log('\nTHE RENDERER');
ok('it publishes API 1', res.api === 1);
ok('it sizes the canvas taller than the old chart, for the stadium', res.cssH >= 190, res.cssH + 'px');
ok('the kickoff fires nothing', res.firstFx === 0);
ok('crossing the end of a touchdown drive fires TOUCHDOWN', /TOUCHDOWN/.test(res.afterTd), res.afterTd);
ok('  once', res.afterRepeat === 1, res.afterRepeat + ' moments');
ok('a field goal fires FIELD GOAL', /FIELD GOAL$/.test(res.afterFg), res.afterFg);
ok('a turnover with a takeaway names it', /INTERCEPTED$/.test(res.afterInt), res.afterInt);
ok('rewinding the clock is a new game and forgets the moments', res.rewound === 0);
ok('a jump to the final whistle fires nothing', res.jump === 0, res.jump + ' moments');
ok('the broadcast shows a down and distance', !!res.invented, res.invented || 'none seen');
ok('downs:false never shows an invented one', res.bossInvented === null, res.bossInvented || 'none');
ok('  and the real one is shown as the page gave it', res.real === '4TH & 1', res.real || 'none');
ok('two blues are split', res.split !== '#1e40af', res.split);
ok('the stands are dark', res.stands[0] + res.stands[1] + res.stands[2] < 180, res.stands.slice(0, 3).join(','));
ok('the turf is green', res.turf[1] > res.turf[0] && res.turf[1] > res.turf[2], res.turf.slice(0, 3).join(','));
ok('nothing threw', errs.length === 0, errs.slice(0, 2).join(' | ') || 'clean');
await browser.close();
console.log(bad ? `\n${bad} failed` : '\nall good');
process.exit(bad ? 1 : 0);
