/* Content hashes on every asset URL, and the preload lists in the pages that load the 3D scene.
 *
 *   node shut-the-door/lab/pipeline/stamp.mjs
 *
 * Run after any asset or module changes (pack.sh runs it last). It rewrites:
 *   3d/load.js   the ASSETS table: each file under 3d/assets/ and its hash (assetUrl adds ?h=)
 *   each page    between <!-- stamp:preload:begin --> and <!-- stamp:preload:end -->:
 *                <link rel=modulepreload> for every module the page's entry reaches (all fetched
 *                at once instead of one import level per round trip), <link rel=preload> for the
 *                downloads load.js starts; and its poster URLs. The pages: the lab (lab/index.html,
 *                entry lab/scene.js) and the game (index.html, entry 3d/stage.js).
 * A changed file gets a new URL, so the CDN can hold every one of them for a year (_headers).
 * load.js itself is versioned by hand (?v=) like every module, and scripts/check-cachebust.mjs
 * holds that: a new ASSETS table is a change to load.js, so its ?v= must move.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const STD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RT = path.join(STD, '3d');
const hash = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 10);
const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p, out) : out.push(p); } return out; };

const assets = {};
for (const f of walk(path.join(RT, 'assets')).sort()) assets[path.relative(path.join(RT, 'assets'), f).split(path.sep).join('/')] = hash(f);
let load = fs.readFileSync(path.join(RT, 'load.js'), 'utf8');
const table = 'export const ASSETS = ' + JSON.stringify(assets, null, 2).replace(/"([^"]+)":/g, "'$1':").replace(/"/g, "'") + ';';
load = load.replace(/(\/\* stamp:begin[^\n]*\n)[\s\S]*?(\/\* stamp:end \*\/)/, `$1${table}\n$2`);
fs.writeFileSync(path.join(RT, 'load.js'), load);

const VENDOR = ['three.module.min.js', 'addons/loaders/GLTFLoader.js', 'addons/loaders/RGBELoader.js', 'addons/libs/meshopt_decoder.module.js', 'addons/utils/BufferGeometryUtils.js'];
const PAGES = [
  { page: path.join(STD, 'lab', 'index.html'), entry: 'scene.js', entryDir: path.join(STD, 'lab'), rt: '../3d/' },
  { page: path.join(STD, 'index.html'), entry: '3d/stage.js', entryDir: STD, rt: '3d/' },
];
let nmods = 0;
for (const P of PAGES) {
  if (!fs.existsSync(P.page)) continue;
  let html = fs.readFileSync(P.page, 'utf8');
  if (!html.includes('<!-- stamp:preload:begin -->')) continue;
  const m0 = html.match(new RegExp(`<script type="module" src="(?:\\./)?${P.entry.replace(/[./]/g, (c) => '\\' + c)}\\?v=(\\d+)"`));
  if (!m0) continue;
  // every module the entry reaches, at the URL the page asks for it (relative to the page)
  const mods = new Set([`${P.entry.startsWith('3d/') ? '' : './'}${P.entry}?v=${m0[1]}`]);
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return; seen.add(file);
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/^\s*import[^;'"]*?from\s*'((?:\.\.\/3d\/|\.\/)[a-z0-9]+\.js\?v=\d+)'/gm)) {
      const abs = path.resolve(path.dirname(file), m[1].split('?')[0]);
      mods.add(path.relative(path.dirname(P.page), abs).split(path.sep).join('/').replace(/^(?!\.\.?\/)/, P.rt === '3d/' ? '' : './') + '?' + m[1].split('?')[1]);
      visit(abs);
    }
  };
  visit(path.join(P.entryDir, P.entry.replace(/^3d\//, '3d/')).replace(path.join(STD, '3d', '3d'), path.join(STD, '3d')));
  const url = (f) => `${P.rt}assets/${f}?h=${assets[f]}`;
  // the lab shows a full screen poster while it loads; the game's home screen shows the hero still
  const images = P.rt === '3d/'
    ? [`<link rel="preload" as="image" href="${url('hero.webp')}">`]
    : [`<link rel="preload" as="image" href="${url('poster-phone.webp')}" media="(orientation: portrait)" fetchpriority="high">`,
      `<link rel="preload" as="image" href="${url('poster-desktop.webp')}" media="(orientation: landscape)" fetchpriority="high">`];
  const lines = [
    ...images,
    ...[...mods, ...VENDOR.map((f) => `${P.rt}vendor/three-0.170.0/${f}`)].map((m) => `<link rel="modulepreload" href="${m}">`),
    ...['packs/std-2025-ws7-yamamoto.json', 'uniform.json', 'bio.json', 'env_256.hdr'].filter((f) => P.rt === '../3d/' ? f !== 'bio.json' : !f.startsWith('packs/')).map((f) => `<link rel="preload" as="fetch" crossorigin href="${url(f)}">`),
    ...['batter.glb', 'catcher.glb', 'umpire.glb'].map((f) => `<link rel="preload" as="fetch" crossorigin href="${url(f)}" fetchpriority="low">`),
  ];
  html = html.replace(/(<!-- stamp:preload:begin -->\n)[\s\S]*?(<!-- stamp:preload:end -->)/, `$1${lines.join('\n')}\n$2`);
  html = html.replace(/((?:\.\.\/)?(?:\.\/)?3d\/|\.\/)assets\/((?:poster-(?:phone|desktop)|hero)\.webp)(?:\?h=\w+)*/g, (_, pre, f) => url(f));
  fs.writeFileSync(P.page, html);
  nmods += mods.size;
}
console.log(`stamped ${Object.keys(assets).length} assets, ${nmods} modules`);
