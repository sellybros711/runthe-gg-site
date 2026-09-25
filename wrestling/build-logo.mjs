/* Renders every Run The Ropes logo file from wrestling/logo-source.html, and wrestling/og.png from
 * wrestling/og-source.html.
 *
 *   (nohup python3 -m http.server 8080 &)      # any static server at the repo root
 *   node wrestling/build-logo.mjs
 *
 * The logo is pixel art, so every file is one of the kit's grids at a WHOLE scale. A cell drawn at 1.5x is
 * two pixels of one width and one of another, which is the mush this avoids. The icon plates are the only
 * thing drawn smooth, because they're a background and not part of the art. Golf's golf/build-logo.mjs is
 * the model.
 *
 * THE CHAMPION ON THE LINK CARD IS THE GAME'S. This opens the real page first, draws the look below with
 * wrestlerSVGRetro(), reads the three stat names out of ATTRS and works the OVR out with ovr(), and hands
 * all of it to the card. So the figure is one the game draws, the stat names are the game's, and the
 * rating is one the game would give those numbers. Rename a stat in the game and the card follows.
 *
 * AND IT REFUSES TO WRITE A CARD THAT DOESN'T FIT. Every block on the link card reports its box, and a
 * block over the frame or on top of another one stops the build, because a picture can't be fixed after
 * somebody has shared it.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
let chromium;
try { ({ chromium } = await import('playwright')); }
catch (_) { ({ chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright')); }
const HOST = process.env.HOST || 'http://localhost:8080';
const OUT = new URL('.', import.meta.url).pathname;
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe, args: ['--no-sandbox'] } : {});

/* the champion: built by hand in the game's own look fields, both arms up, the belt buckled on */
const HERO_LOOK = { skin: '#c98f63', hair: '#1f1512', gear: '#C6392C', trim: '#F4E8DB', hairStyle: 'slick',
  face: 'fullbeard', mask: 'none', attire: 'trunks', boots: 'tall', acc: 'wrist', pattern: 'stripe',
  build: 'heavy', tattoo: 'none', aura: 'none' };
const SHOWN = { po: 94, ch: 97, ae: 88 };            // the three the card prints
const OTHER = { te: 95, ps: 96, to: 93, st: 92 };    // the four it doesn't, so ovr() has a whole wrestler
const problems = [];
try {
  // 1. ask the game
  const game = await b.newPage();
  await game.goto(HOST + '/wrestling/', { waitUntil: 'domcontentloaded' });
  await game.waitForFunction(() => typeof wrestlerSVGRetro === 'function' && typeof ovr === 'function');
  const hero = await game.evaluate(({ look, shown, other }) => {
    const svg = wrestlerSVGRetro(Object.assign({}, DEFLOOK, look), { frame: 'full', pose: 'taunt', belt: { art: beltArtFor(null), carry: 'waist' } });
    const vb = svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
    const names = Object.fromEntries(ATTRS);
    const keys = ATTRS.map(a => a[0]);
    return { svg: svg.includes('xmlns=') ? svg : svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'),
      vb, rows: Object.entries(shown).map(([k, v]) => [String(names[k] || '').toUpperCase(), v]),
      missing: keys.filter(k => !(k in shown) && !(k in other)), unknown: Object.keys(shown).filter(k => !names[k]),
      ovr: ovr({ attrs: Object.assign({}, other, shown) }) };
  }, { look: HERO_LOOK, shown: SHOWN, other: OTHER });
  await game.close();
  if (hero.unknown.length) problems.push('the card prints stats the game does not have: ' + hero.unknown.join(', '));
  if (hero.missing.length) problems.push('the OVR has no value for: ' + hero.missing.join(', '));
  if (hero.vb[2] !== Math.round(hero.vb[2]) || hero.vb[3] !== Math.round(hero.vb[3])) problems.push('the figure is not on whole units');
  console.log('  the game rates the card ' + hero.ovr + ' OVR');

  // 2. the logo files
  const page = await b.newPage();
  await page.goto(HOST + '/wrestling/logo-source.html');
  await page.waitForFunction('window.__markReady === true');
  const files = await page.evaluate(() => {
    const L = window.RPK, out = {};
    const png = c => c.toDataURL('image/png');
    const art = (g, s) => L.toCanvas(g, s);
    const plated = (g, s, size) => {
      const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
      const r = x.createRadialGradient(size / 2, size * 0.36, 0, size / 2, size * 0.36, size * 0.78);
      r.addColorStop(0, '#8a2a21'); r.addColorStop(0.55, '#4f1512'); r.addColorStop(1, '#210807');
      x.fillStyle = r; x.fillRect(0, 0, size, size);
      const a = L.toCanvas(g, s); x.imageSmoothingEnabled = false;
      x.drawImage(a, Math.round((size - a.width) / 2), Math.round((size - a.height) / 2));
      return c;
    };
    const lock = L.lockup(), i32 = L.icon(32), i16 = L.icon(16);
    out['logo.png'] = png(art(lock, 4));
    out['lockup.png'] = png(art(lock, 1));
    out['icon-512.png'] = png(plated(i32, 14, 512));
    out['icon-192.png'] = png(plated(i32, 5, 192));
    out['icon-180.png'] = png(plated(i32, 5, 180));
    // Android crops a maskable icon to any shape and only promises the middle 80%, so the art comes in
    out['icon-maskable-512.png'] = png(plated(i32, 10, 512));
    out['favicon-32.png'] = png(art(i32, 1));
    out['favicon-16.png'] = png(art(i16, 1));
    out['favicon-48.png'] = png(art(i16, 3));
    return out;
  });
  await page.close();

  // 3. the link preview
  const og = await b.newPage();
  await og.goto(HOST + '/wrestling/og-source.html');
  await og.evaluate(h => { window.__HERO = h; }, hero);
  await og.waitForFunction('window.__ogReady === true');
  const box = await og.evaluate(() => window.BOX);
  const IN = [5, 5, 395, 205];
  for (const [k, r] of Object.entries(box)) {
    if (r[0] < IN[0] || r[1] < IN[1] || r[2] > IN[2] || r[3] > IN[3]) problems.push(`the ${k} runs into the frame (${r.join(', ')})`);
  }
  const keys = Object.keys(box);
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const A = box[keys[i]], B = box[keys[j]];
    if (A[0] < B[2] && B[0] < A[2] && A[1] < B[3] && B[1] < A[3]) problems.push(`the ${keys[i]} sits on the ${keys[j]}`);
  }
  files['og.png'] = await og.evaluate(() => window.OG.toDataURL('image/png'));
  await og.close();

  /* PREVIEW=path writes the card there whatever the checks say, for looking at a failure */
  if (process.env.PREVIEW) fs.writeFileSync(process.env.PREVIEW, Buffer.from(files['og.png'].split(',')[1], 'base64'));
  if (problems.length) { console.log('REFUSING TO WRITE:'); problems.forEach(p => console.log('  ' + p)); process.exitCode = 1; }
  else for (const [name, url] of Object.entries(files)) {
    fs.writeFileSync(OUT + name, Buffer.from(url.split(',')[1], 'base64'));
    console.log('  wrote', name);
  }
} finally { await b.close(); }
