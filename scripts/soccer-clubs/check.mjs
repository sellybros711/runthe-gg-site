#!/usr/bin/env node
// Run The Pitch club pool, step 3 of 3: the gate. Runs in CI on every change to the file, and
// inside the refresh workflow before anything is pushed. A refresh that fails it never ships.
//
//   node scripts/soccer-clubs/check.mjs [--against <git ref>]   (default HEAD, for the shrink guard)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/soccer-clubs/config.json'), 'utf8'));
const FILE = 'data/club_players.json';
const text = fs.readFileSync(path.join(ROOT, FILE), 'utf8');
const D = JSON.parse(text);
const WC = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/players_all.json'), 'utf8'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const bad = [];
const fail = (m) => bad.length < 60 && bad.push(m);

const WCROW = new Map(WC.map((r) => [r.player_id, r]));
const COUNTRIES = new Set(WC.map((r) => r.country));
const WC_CLUB_IDS = new Set(WC.map((r) => r.club_id).filter(Boolean));
const DECADES = new Set(CFG.decades.map((d) => `${d}s`));
const POS = new Set(['GK', 'DEF', 'MID', 'FWD']);
const year = new Date().getUTCFullYear();

if (D.rule_ceiling !== CFG.rule_ceiling) fail(`rule_ceiling ${D.rule_ceiling} is not config's ${CFG.rule_ceiling}`);
const leagues = new Set(CFG.leagues.map((l) => l.name));
for (const [id, c] of Object.entries(D.clubs)) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) fail(`club id ${id} is not a slug`);
  if (!leagues.has(c.league)) fail(`${id}: league ${c.league} is not in config`);
  if (!/^Q\d+$/.test(c.wikidata || '')) fail(`${id}: no Wikidata id`);
  const ds = Object.keys(c.names);
  if (!ds.length) fail(`${id}: ships no decade`);
  for (const d of ds) if (!DECADES.has(d) || typeof c.names[d] !== 'string' || !c.names[d].trim()) fail(`${id}: bad name for ${d}`);
}
// a club the World Cup file knows must carry the same id: guards a slug drifting from convertData's
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
for (const [id, c] of Object.entries(D.clubs)) for (const n of Object.values(c.names)) {
  const wcRow = WC.find((r) => r.club_at_tournament === n);
  if (wcRow && wcRow.club_id !== id) fail(`${id}: the World Cup file calls "${n}" ${wcRow.club_id}`);
}

const ids = new Set();
const claimed = new Map();
for (const p of D.players) {
  const who = `${p.name} (${p.id})`;
  if (!/^Q\d+$/.test(p.id) || ids.has(p.id)) fail(`${who}: id missing or repeated`);
  ids.add(p.id);
  if (typeof p.name !== 'string' || !p.name.trim() || /^Q\d+$/.test(p.name)) fail(`${who}: no name`);
  if (p.nation !== null && !COUNTRIES.has(p.nation) && !CFG.no_world_cup.includes(p.nation)) fail(`${who}: nation "${p.nation}" is not spelled as players_all spells it`);
  if (!Number.isInteger(p.born) || p.born < CFG.born_from || p.born > year - 14) fail(`${who}: born ${p.born}`);
  if (!POS.has(p.pos)) fail(`${who}: position ${p.pos}`);
  if (!Number.isInteger(p.overall) || p.overall < 1 || p.overall > 99) fail(`${who}: overall ${p.overall}`);
  if (p.rated === 'rule') {
    if (p.overall > CFG.rule_ceiling || p.overall < CFG.rule_floor) fail(`${who}: rule rating ${p.overall} outside ${CFG.rule_floor}-${CFG.rule_ceiling}`);
    if (p.wc_ids.length) fail(`${who}: rated by the rule but has World Cup ids`);
  } else if (p.rated === 'wc') {
    const rows = p.wc_ids.map((w) => WCROW.get(w));
    if (!rows.length || rows.some((r) => !r)) fail(`${who}: wc_ids missing from players_all`);
    else if (p.overall !== Math.max(...rows.map((r) => r.wc_overall))) fail(`${who}: overall ${p.overall} is not his best World Cup rating`);
    for (const w of p.wc_ids) { if (claimed.has(w)) fail(`${w} is claimed by ${claimed.get(w)} and ${who}`); claimed.set(w, who); }
  } else fail(`${who}: rated "${p.rated}"`);
  if (!Array.isArray(p.spells) || !p.spells.length) fail(`${who}: no spells`);
  for (const s of p.spells || []) {
    if (!D.clubs[s.club_id]) fail(`${who}: spell at unknown club ${s.club_id}`);
    if (!Number.isInteger(s.from) || (s.to !== null && (!Number.isInteger(s.to) || s.to < s.from))) fail(`${who}: spell ${s.from}-${s.to}`);
    if ('loan' in s && s.loan !== true) fail(`${who}: loan must be true or absent`);
  }
}

// every shipped club decade is a full squad without loans
const units = new Map();
for (const p of D.players) for (const s of p.spells) {
  if (s.loan) continue;
  for (const d of Object.keys(D.clubs[s.club_id]?.names || {})) {
    const lo = +d.slice(0, 4);
    if (s.from <= lo + 9 && (s.to ?? year) >= lo) {
      const k = `${s.club_id} ${d}`;
      const u = units.get(k) || units.set(k, new Map()).get(k);
      u.set(p.id, p.pos);
    }
  }
}
for (const [id, c] of Object.entries(D.clubs)) for (const d of Object.keys(c.names)) {
  const u = units.get(`${id} ${d}`) || new Map();
  const n = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const pos of u.values()) n[pos]++;
  for (const [k, v] of Object.entries(CFG.squad)) if (n[k] < v) fail(`${id} ${d}: ${n[k]} ${k}, needs ${v}`);
}

// the shrink guard: an automatic refresh may grow the pool, never quietly lose it
const ref = arg('--against', 'HEAD');
let prev = null;
try { prev = JSON.parse(execFileSync('git', ['show', `${ref}:${FILE}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] })); } catch { /* first file */ }
if (prev && prev !== D) {
  if (D.players.length < prev.players.length * CFG.max_shrink) fail(`men ${prev.players.length} -> ${D.players.length}, below ${CFG.max_shrink * 100}%`);
  for (const [id, c] of Object.entries(prev.clubs)) for (const d of Object.keys(c.names)) if (!D.clubs[id]?.names[d]) fail(`club decade ${id} ${d} was shipped and is gone`);
}

const gz = zlib.gzipSync(text).length;
if (text.length > 3e6) fail(`${FILE} is ${text.length} bytes, over 3 MB`);
const wcN = D.players.filter((p) => p.rated === 'wc').length;
console.log(`${FILE}: ${Object.keys(D.clubs).length} clubs, ${units.size} club decades, ${D.players.length} men (${wcN} World Cup rated), ${Math.round(gz / 1024)} KB gzipped`);
if (bad.length) { console.log('\nFAIL'); for (const b of bad) console.log('  ' + b); process.exit(1); }
console.log('club pool ok');
