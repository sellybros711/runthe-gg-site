#!/usr/bin/env node
/* Replay logged Sportegories answers through Stumpire's matcher and report
 * the resolution rate and every failure, so the alias table can grow toward
 * the launch target (CONFIG.RESOLUTION_TARGET, 99%).
 *
 *   node functions/_stumpire/build/replay-sportegories.mjs --file answers.csv
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE=... node .../replay-sportegories.mjs --live
 *   node functions/_stumpire/build/replay-sportegories.mjs --fixture     (offline, see below)
 *
 * WHAT SPORTEGORIES ACTUALLY LOGS. Sportegories does not keep every answer on
 * the server. The one table of typed answers is answer_gaps (supabase/78), and
 * it holds only the answers Sportegories could NOT settle, which is the
 * hardest slice there is. So:
 *   --live     reads answer_gaps with the service role (needs a network that
 *              reaches the project; the dev sandbox does not)
 *   --file     a CSV export with an `answer` column (and optionally `sport`),
 *              e.g. `\copy (select answer, category from answer_gaps) to 'answers.csv' csv header`
 *   --fixture  SYNTHETIC: every NFL, NBA and MLB name in the Sportegories index,
 *              typed the ways people type (lower case, no accents, no
 *              punctuation, no suffix, one slip of a finger), plus the curated
 *              nicknames. It measures the matcher against names it was built
 *              from, so read it as a floor on regressions, NOT as the launch
 *              number. That number needs --live or --file.
 *
 * A row counts as resolved when the matcher returns a player (or a picker
 * holding him, when the expected player is known). No expected player: a
 * match or a picker is resolved, a NO PITCH is a failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { resolve } from '../matcher.js';
import { CONFIG } from '../config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const args = process.argv.slice(2);
const has = k => args.includes('--' + k);
const arg = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };

function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift().map(h => h.trim().toLowerCase());
  return rows.filter(r => r.some(Boolean)).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

const LEAGUE_OF = cat => { const m = String(cat || '').match(/\b(NFL|NBA|MLB)\b/); return m ? m[1] : null; };

async function fromLive() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error('--live needs SUPABASE_URL and SUPABASE_SERVICE_ROLE');
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(url + '/rest/v1/answer_gaps?select=answer,category&order=id.asc', { headers: { apikey: key, Authorization: 'Bearer ' + key, Range: from + '-' + (from + 999) } });
    if (!r.ok) throw new Error('answer_gaps: ' + r.status);
    const rows = await r.json();
    out.push(...rows.map(x => ({ text: x.answer, league: LEAGUE_OF(x.category) })));
    if (rows.length < 1000) break;
  }
  return out;
}

/* ---------- the synthetic fixture ---------- */
function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const KEYS = 'qwertyuiopasdfghjklzxcvbnm';
const NEAR = {};
['qwertyuiop', 'asdfghjkl', 'zxcvbnm'].forEach(r => { for (let i = 0; i < r.length; i++) NEAR[r[i]] = (r[i - 1] || '') + (r[i + 1] || ''); });
function slip(s, R) {
  const idx = [...s].map((c, i) => (/[a-z]/.test(c) ? i : -1)).filter(i => i > 0);
  if (!idx.length) return s;
  const i = idx[Math.floor(R() * idx.length)], kind = R();
  if (kind < 0.4) { const n = NEAR[s[i]] || KEYS; return s.slice(0, i) + n[Math.floor(R() * n.length)] + s.slice(i + 1); }
  if (kind < 0.7 && i + 1 < s.length) return s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2);
  return s.slice(0, i) + s.slice(i + 1);
}
function fixture() {
  const src = fs.readFileSync(path.join(ROOT, 'arcade/sportegories-data.js'), 'utf8');
  const ctx = { window: {} }; vm.runInNewContext(src, ctx);
  const D = ctx.window.RTG_SPORTEGORIES_DATA;
  const R = rng(20261009);
  const rows = [];
  for (const r of D.players) {
    const league = D.sports[r[1]];
    if (!['NFL', 'NBA', 'MLB'].includes(league)) continue;
    const name = r[0];
    const plain = name.normalize('NFD').replace(/[̀-ͯ]/g, '');
    const forms = [name, name.toLowerCase(), plain.replace(/[.']/g, ''), plain.replace(/\s+(Jr|Sr|II|III|IV)\.?$/i, ''), slip(plain.toLowerCase(), R)];
    for (const f of forms) rows.push({ text: f, league, expectName: name });
  }
  const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, 'arcade/data/corpus.json'), 'utf8'));
  for (const p of corpus) {
    if (p.entity_type !== 'player' || !['NFL', 'NBA', 'MLB'].includes(p.sport)) continue;
    for (const n of (p.attributes && p.attributes.nicknames) || []) rows.push({ text: n, league: p.sport, expectName: p.display_name });
  }
  return rows;
}

/* ---------- replay ---------- */
import { get } from '../entities.js';
export function replay(rows) {
  let resolved = 0;
  const fails = new Map();
  const vias = {};
  for (const row of rows) {
    const r = resolve({ text: row.text }, { league: row.league || undefined });
    let ok;
    if (row.expectName) {
      const named = id => { const e = get(id) || {}; return e.n === row.expectName || (e.a || []).includes(row.expectName); };
      ok = (r.status === 'match' && named(r.id)) || (r.status === 'picker' && r.options.some(o => named(o.id)));
    } else ok = r.status === 'match' || r.status === 'picker';
    if (ok) { resolved++; vias[r.via || r.status] = (vias[r.via || r.status] || 0) + 1; }
    else {
      const k = row.text + (row.league ? ' [' + row.league + ']' : '') + ' -> ' + (r.status === 'match' ? 'matched ' + (get(r.id) || {}).n : r.status + (r.reason ? ' ' + r.reason : ''));
      fails.set(k, (fails.get(k) || 0) + 1);
    }
  }
  return { total: rows.length, resolved, rate: rows.length ? resolved / rows.length : 0, vias, fails };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  let rows, label;
  if (has('live')) { rows = await fromLive(); label = 'answer_gaps (live)'; }
  else if (arg('file')) {
    rows = parseCsv(fs.readFileSync(arg('file'), 'utf8')).map(x => ({ text: x.answer || x.raw || x.text, league: x.sport || LEAGUE_OF(x.category) }));
    label = arg('file');
  } else if (has('fixture')) { rows = fixture(); label = 'SYNTHETIC fixture (not real play logs)'; }
  else { console.error('pass --file answers.csv, --live, or --fixture'); process.exit(1); }
  const t0 = Date.now();
  const r = replay(rows);
  const pct = x => (100 * x).toFixed(2) + '%';
  console.log('source: ' + label);
  console.log('answers replayed: ' + r.total + '  resolved: ' + r.resolved + '  rate: ' + pct(r.rate) + '  (target ' + pct(CONFIG.RESOLUTION_TARGET) + ')  ' + (Date.now() - t0) + 'ms');
  console.log('resolved by: ' + JSON.stringify(r.vias));
  const list = [...r.fails.entries()].sort((a, b) => b[1] - a[1]);
  console.log('failures (' + list.length + ' distinct):');
  for (const [k, n] of list.slice(0, Number(arg('show') || 200))) console.log('  ' + (n > 1 ? n + 'x ' : '') + k);
  if (has('strict') && r.rate < CONFIG.RESOLUTION_TARGET) process.exit(2);
}
