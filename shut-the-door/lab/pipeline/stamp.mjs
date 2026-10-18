/* Content hashes on every asset URL, and the preload list in index.html.
 *
 *   node shut-the-door/lab/pipeline/stamp.mjs
 *
 * Run after any asset or module changes (pack.sh runs it last). It rewrites:
 *   load.js      the ASSETS table: each file under assets/ and its hash (assetUrl adds ?h=)
 *   index.html   the poster URLs, and <link rel=modulepreload> for every module (all fetched at
 *                once instead of one import level per round trip) plus <link rel=preload> for
 *                the downloads load.js starts, so they leave before any script has run
 * A changed file gets a new URL, so the CDN can hold every one of them for a year (_headers).
 * load.js itself is versioned by hand (?v=) like every module, and scripts/check-cachebust.mjs
 * holds that: a new ASSETS table is a change to load.js, so its ?v= must move.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const LAB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 10);
const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p, out) : out.push(p); } return out; };

const assets = {};
for (const f of walk(path.join(LAB, 'assets')).sort()) assets[path.relative(path.join(LAB, 'assets'), f).split(path.sep).join('/')] = hash(f);

let load = fs.readFileSync(path.join(LAB, 'load.js'), 'utf8');
const table = 'export const ASSETS = ' + JSON.stringify(assets, null, 2).replace(/"([^"]+)":/g, "'$1':").replace(/"/g, "'") + ';';
load = load.replace(/(\/\* stamp:begin[^\n]*\n)[\s\S]*?(\/\* stamp:end \*\/)/, `$1${table}\n$2`);
fs.writeFileSync(path.join(LAB, 'load.js'), load);

// every module, at the URL it is imported by (with its ?v=)
const mods = new Set();
const seen = new Set();
const visit = (file) => {
  if (seen.has(file)) return; seen.add(file);
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/^\s*import[^;'"]*?from\s*'(\.\/[a-z0-9]+\.js\?v=\d+)'/gm)) { mods.add(m[1]); visit(path.join(LAB, m[1].split('?')[0])); }
};
mods.add('./scene.js?v=' + fs.readFileSync(path.join(LAB, 'index.html'), 'utf8').match(/<script type="module" src="\.\/scene\.js\?v=(\d+)"/)[1]);
visit(path.join(LAB, 'scene.js'));
const vendor = ['three.module.min.js', 'addons/loaders/GLTFLoader.js', 'addons/loaders/RGBELoader.js', 'addons/libs/meshopt_decoder.module.js', 'addons/utils/BufferGeometryUtils.js']
  .map((f) => './vendor/three-0.170.0/' + f);
const url = (f) => `./assets/${f}?h=${assets[f]}`;
// order: the poster first (the first thing on screen), then the code and the small files, then the
// people at low priority. Asked for here, they start with the page instead of a round trip later
// when load.js runs, and the low priority keeps the code ahead of them in the queue
const lines = [
  `<link rel="preload" as="image" href="${url('poster-phone.webp')}" media="(orientation: portrait)" fetchpriority="high">`,
  `<link rel="preload" as="image" href="${url('poster-desktop.webp')}" media="(orientation: landscape)" fetchpriority="high">`,
  ...[...mods, ...vendor].map((m) => `<link rel="modulepreload" href="${m}">`),
  ...['pitch.json', 'env_256.hdr'].map((f) => `<link rel="preload" as="fetch" crossorigin href="${url(f)}">`),
  ...['batter.glb', 'catcher.glb', 'umpire.glb'].map((f) => `<link rel="preload" as="fetch" crossorigin href="${url(f)}" fetchpriority="low">`),
];
let html = fs.readFileSync(path.join(LAB, 'index.html'), 'utf8');
html = html.replace(/(<!-- stamp:preload:begin -->\n)[\s\S]*?(<!-- stamp:preload:end -->)/, `$1${lines.join('\n')}\n$2`);
html = html.replace(/\.\/assets\/(poster-(?:phone|desktop)\.webp)(?:\?h=\w+)*/g, (_, f) => url(f));
fs.writeFileSync(path.join(LAB, 'index.html'), html);
console.log(`stamped ${Object.keys(assets).length} assets, ${mods.size} modules`);
