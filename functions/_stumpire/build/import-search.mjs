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
    /* 1. Resolve every candidate title in batches of 50: redirects followed
          (a redirect's own pageviews are near zero, so "Michael Jordan
          (basketball)" must count as the real article), and disambiguation
          pages skipped.
       2. Average the canonical article's monthly views over 60 months.
       3. Somebody with no article gets the 1st percentile of everyone who has
          one: obscure, but read off the data rather than typed. */
    const DIS = { NFL: ' (American football)', NBA: ' (basketball)', MLB: ' (baseball)' };
    const UA = { 'User-Agent': 'RunTheArcade/1.0 (https://runthe.gg; stumpire search_avg import)' };
    const end = new Date(); end.setUTCDate(1);
    const start = new Date(end); start.setUTCFullYear(end.getUTCFullYear() - 5);
    const ym = d => d.toISOString().slice(0, 7).replace('-', '') + '0100';
    const month = end.toISOString().slice(0, 7);
    const cacheDir = opts.cacheDir || path.join(HERE, '.cache'); fs.mkdirSync(cacheDir, { recursive: true });
    const cached = async (name, fn) => {
      const f = path.join(cacheDir, name);
      if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
      const v = await fn(); fs.writeFileSync(f, JSON.stringify(v)); return v;
    };
    const get = async (url, tries = 4) => {
      for (let i = 0; ; i++) {
        try { const r = await fetch(url, { headers: UA }); if (r.status === 404) return null; if (r.ok) return r.json(); if (i >= tries) return null; }
        catch (e) { if (i >= tries) return null; }
        await new Promise(r => setTimeout(r, 500 * 2 ** i));
      }
    };
    const cands = new Map();
    for (const e of list) cands.set(e.id, e.k === 't' ? [e.n] : [e.n + DIS[e.s], e.n]);
    const titles = [...new Set([...cands.values()].flat())];
    const info = {};   // asked title -> { title, missing, dis }
    for (let i = 0; i < titles.length; i += 50) {
      const batch = titles.slice(i, i + 50);
      const key = 'q-' + Buffer.from(batch.join('|')).toString('base64url').slice(0, 80) + '-' + batch.length + '.json';
      const j = await cached(key, () => get('https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageprops&ppprop=disambiguation&titles=' + encodeURIComponent(batch.join('|'))));
      if (!j || !j.query) continue;
      const map = {};
      for (const n of j.query.normalized || []) map[n.from] = n.to;
      const redir = {};
      for (const r of j.query.redirects || []) redir[r.from] = r.to;
      const pages = {};
      for (const pg of Object.values(j.query.pages || {})) pages[pg.title] = pg;
      for (const t of batch) {
        let f = map[t] || t; f = redir[f] || f;
        const pg = pages[f];
        info[t] = { title: f, missing: !pg || 'missing' in pg || 'invalid' in pg, dis: !!(pg && pg.pageprops && 'disambiguation' in pg.pageprops) };
      }
      if ((i / 50) % 20 === 0) console.log('  titles ' + Math.min(i + 50, titles.length) + '/' + titles.length);
    }
    const chosen = new Map();
    for (const [id, cs] of cands) {
      const c = cs.map(t => info[t]).find(x => x && !x.missing && !x.dis);
      if (c) chosen.set(id, c.title);
    }
    const views = {};
    const uniq = [...new Set(chosen.values())];
    let next = 0, done = 0;
    async function worker() {
      while (next < uniq.length) {
        const t = uniq[next++];
        const v = await cached('v-' + month + '-' + Buffer.from(t).toString('base64url') + '.json', async () => {
          const j = await get('https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/'
            + encodeURIComponent(t.replace(/ /g, '_')) + '/monthly/' + ym(start) + '/' + ym(end));
          return j && j.items ? j.items.map(x => x.views) : null;
        });
        if (v && v.length) views[t] = v.reduce((a, b) => a + b, 0) / v.length;
        if (++done % 500 === 0) console.log('  pageviews ' + done + '/' + uniq.length);
      }
    }
    await Promise.all(Array.from({ length: opts.concurrency || 8 }, worker));
    const out = {};
    const found = [];
    for (const [id, t] of chosen) if (views[t] > 0) { out[id] = Math.round(views[t]); found.push(views[t]); }
    found.sort((a, b) => a - b);
    const floor = Math.max(1, Math.round(found[Math.floor(found.length * 0.01)] || 1));
    const missing = list.filter(e => !(e.id in out));
    for (const e of missing) out[e.id] = floor;
    console.log('  ' + found.length + ' with an article, ' + missing.length + ' at the floor of ' + floor);
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
  const values = await sources[src](list, { file: arg('file'), concurrency: Number(arg('concurrency', 8)) });
  let prev = {};
  if (src !== 'fixture' && arg('league') && fs.existsSync(OUT)) { try { const p = JSON.parse(fs.readFileSync(OUT, 'utf8')); if (p.source === src) prev = p.values; } catch (e) {} }
  const merged = Object.assign({}, prev, values);
  const sorted = Object.fromEntries(Object.keys(merged).sort().map(k => [k, merged[k]]));
  fs.writeFileSync(OUT, JSON.stringify({ source: src, synthetic: src === 'fixture', window: '60 months', values: sorted }, null, 0));
  console.log('wrote ' + Object.keys(sorted).length + ' search_avg values from ' + src + (src === 'fixture' ? ' (SYNTHETIC, offline only)' : ''));
  if (arg('spot')) spotCheck(sorted, arg('spot'), store().list);
}
