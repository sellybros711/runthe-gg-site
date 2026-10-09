#!/usr/bin/env node
/* Import search_avg: average monthly search interest over five years, for
 * every Stumpire entity. The source is pluggable, and the write is the same
 * whichever one ran.
 *
 *   node functions/_stumpire/build/import-search.mjs --source fixture
 *   node functions/_stumpire/build/import-search.mjs --source wikipedia [--league NBA] [--limit 500]
 *   node functions/_stumpire/build/import-search.mjs --source csv --file views.csv
 *   ... --spot google.csv      compare against hand-pulled Google volumes for top names
 *
 * Sources:
 *   fixture    OFFLINE AND SYNTHETIC. Derived from fame, awards and career
 *              stats with a seeded spread, so the game, the tests and the
 *              authoring tool run with no network. It is labelled as such in
 *              the output file and must never be published to real players.
 *   wikipedia  Wikimedia's per-article monthly pageviews (user agent only),
 *              averaged over the last 60 full months. The article title is
 *              tried as the name, then with the league's disambiguator.
 *   csv        id,search_avg rows from anywhere else.
 *
 * Output: functions/_stumpire/data/search_avg.json  { source, window, values }
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { store } from '../entities.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '../data/search_avg.json');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };

/* ---------- sources ---------- */
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

const AWARD_W = {
  'NBA MVP': 3, 'NFL MVP': 3, 'MLB MVP': 3, 'Hall of Fame': 2.5, 'Finals MVP': 2, 'Super Bowl MVP': 2,
  'World Series MVP': 1.5, 'Cy Young': 2, 'NBA All-Star': 1, 'MLB All-Star': 0.8, 'Pro Bowl': 0.6,
  'Rookie of the Year': 0.6, 'Offensive Player of the Year': 1, 'Defensive Player of the Year': 0.8
};
export const sources = {
  async fixture(list) {
    const out = {};
    for (const e of list) {
      let w;
      if (e.k === 't') w = 40000 * (1 + (e.ti || 0) * 0.15);
      else {
        const f = e.f || 1.5;
        const aw = (e.aw || []).reduce((s, a) => s + (AWARD_W[a] || 0.3), 0);
        const st = e.st ? Object.keys(e.st).length * 0.5 : 0;
        w = 300 * Math.pow(2.2, f) * (1 + aw * 1.6 + st) * (e.act ? 1.6 : 1);
      }
      const u = (hash(e.id) % 10000) / 10000;          // seeded spread, 0.35x to 2.85x
      out[e.id] = Math.round(w * (0.35 + 2.5 * u * u));
    }
    return out;
  },

  async wikipedia(list, opts) {
    const DIS = { NFL: ' (American football)', NBA: ' (basketball)', MLB: ' (baseball)' };
    const end = new Date(); end.setUTCDate(1);
    const start = new Date(end); start.setUTCFullYear(end.getUTCFullYear() - 5);
    const ym = d => d.toISOString().slice(0, 7).replace('-', '') + '0100';
    const cacheDir = path.join(HERE, '.cache'); fs.mkdirSync(cacheDir, { recursive: true });
    const out = {};
    async function views(title) {
      const f = path.join(cacheDir, 'wp-' + Buffer.from(title).toString('base64url') + '.json');
      if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
      const url = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/'
        + encodeURIComponent(title.replace(/ /g, '_')) + '/monthly/' + ym(start) + '/' + ym(end);
      const r = await fetch(url, { headers: { 'User-Agent': 'RunTheArcade/1.0 (https://runthe.gg; stumpire search_avg import)' } });
      const v = r.ok ? (await r.json()).items.map(i => i.views) : null;
      fs.writeFileSync(f, JSON.stringify(v));
      return v;
    }
    let done = 0;
    for (const e of list) {
      const titles = e.k === 't' ? [e.n] : [e.n + DIS[e.s], e.n];
      for (const t of titles) {
        const v = await views(t).catch(() => null);
        if (v && v.length) { out[e.id] = Math.round(v.reduce((s, x) => s + x, 0) / v.length); break; }
      }
      if (++done % 200 === 0) console.log('  ' + done + '/' + list.length);
      if (opts.delay) await new Promise(r => setTimeout(r, opts.delay));
    }
    return out;
  },

  async csv(list, opts) {
    const rows = fs.readFileSync(opts.file, 'utf8').trim().split(/\r?\n/).slice(1);
    const known = new Set(list.map(e => e.id)), out = {};
    for (const line of rows) {
      const [id, v] = line.split(',');
      if (known.has(id) && Number(v) >= 0) out[id] = Math.round(Number(v));
    }
    return out;
  }
};

function spotCheck(values, file, list) {
  const byName = {}; for (const e of list) byName[e.n + '|' + e.s] = e.id;
  const rows = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).slice(1).map(l => l.split(','));
  const pairs = rows.map(([n, lg, g]) => [values[byName[n + '|' + lg]], Number(g), n]).filter(p => p[0] && p[1]);
  const rank = a => { const s = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = []; s.forEach((p, i) => r[p[1]] = i); return r; };
  const a = rank(pairs.map(p => p[0])), b = rank(pairs.map(p => p[1]));
  const n = pairs.length, d2 = a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0);
  const rho = n > 1 ? 1 - 6 * d2 / (n * (n * n - 1)) : NaN;
  console.log('spot check against Google: ' + n + ' names, Spearman rho ' + rho.toFixed(3));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const src = arg('source', 'fixture');
  if (!sources[src]) { console.error('unknown source ' + src); process.exit(1); }
  let list = store().list;
  if (arg('league')) list = list.filter(e => e.s === arg('league'));
  if (arg('limit')) list = list.slice(0, Number(arg('limit')));
  const values = await sources[src](list, { file: arg('file'), delay: Number(arg('delay', 0)) });
  let prev = {};
  if (src !== 'fixture' && fs.existsSync(OUT)) { try { const p = JSON.parse(fs.readFileSync(OUT, 'utf8')); if (p.source === src) prev = p.values; } catch (e) {} }
  const merged = Object.assign({}, prev, values);
  const sorted = Object.fromEntries(Object.keys(merged).sort().map(k => [k, merged[k]]));
  fs.writeFileSync(OUT, JSON.stringify({ source: src, synthetic: src === 'fixture', window: '60 months', values: sorted }, null, 0));
  console.log('wrote ' + Object.keys(sorted).length + ' search_avg values from ' + src + (src === 'fixture' ? ' (SYNTHETIC, offline only)' : ''));
  if (arg('spot')) spotCheck(sorted, arg('spot'), store().list);
}
