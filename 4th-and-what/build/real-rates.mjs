#!/usr/bin/env node
/* The real numbers the tuner aims at, measured from nflverse play-by-play
 * (github.com/nflverse/nflverse-data, the pbp release, CC-BY 4.0).
 *
 *   node 4th-and-what/build/real-rates.mjs [cache dir] [--from 2021] [--to 2024]
 *
 * Prints, over the regular seasons asked for:
 *   4th down conversion by yards to go (every run and pass nflverse marks
 *   converted or failed), the TARGET in build/tune.mjs and the engine test;
 *   4th down passes by distance: sacked, complete, intercepted, converted;
 *   completion and interception by air yards (every pass, every down);
 *   the carry spread (every designed run, every down).
 * Measured 2026-11-26 over 2021 to 2024. Re-run after a season if the
 * targets should move with the league.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const CACHE = args[0] && !args[0].startsWith('--') ? args[0] : '/tmp/nflverse-pbp';
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? +args[i + 1] : d; };
const FROM = arg('--from', 2021), TO = arg('--to', 2024);
fs.mkdirSync(CACHE, { recursive: true });

function parseCSV(text, onRow) {
  let i = 0, field = '', row = [], q = false;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } q = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { q = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = ''; onRow(row); row = []; i++; continue;
    }
    field += c; i++;
  }
  if (field || row.length) { row.push(field); onRow(row); }
}
function season(y) {
  const f = path.join(CACHE, 'play_by_play_' + y + '.csv.gz');
  if (!fs.existsSync(f)) execFileSync('curl', ['-sSL', '--retry', '4', '-o', f, 'https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_' + y + '.csv.gz']);
  return zlib.gunzipSync(fs.readFileSync(f)).toString('utf8');
}

const yes = (v) => v === '1' || v === '1.0';
const conv = {}, pass = {}, air = {}, carries = [];
const AIR = [[-10, 0], [0, 5], [5, 10], [10, 15], [15, 20], [20, 30], [30, 60]];
const PASSD = (d) => d === 1 ? 1 : d >= 4 && d <= 6 ? 5 : d >= 9 && d <= 11 ? 10 : d >= 13 && d <= 17 ? 15 : null;
for (let y = FROM; y <= TO; y++) {
  let head = null;
  parseCSV(season(y), (row) => {
    if (!head) { head = {}; row.forEach((h, k) => { head[h] = k; }); return; }
    const g = (k) => row[head[k]];
    if (g('season_type') !== 'REG') return;
    const type = g('play_type');
    /* the carry spread: designed runs, no kneels or scrambles */
    if (type === 'run' && !yes(g('qb_kneel')) && !yes(g('qb_scramble'))) { const v = parseFloat(g('yards_gained')); if (!isNaN(v)) carries.push(v); }
    /* completion by air yards: every pass that was thrown */
    if (yes(g('pass_attempt')) && !yes(g('sack'))) {
      const a = parseFloat(g('air_yards')), b = AIR.find((r) => a >= r[0] && a < r[1]);
      if (b) { const o = air[b] = air[b] || { n: 0, c: 0, i: 0 }; o.n++; o.c += yes(g('complete_pass')); o.i += yes(g('interception')); }
    }
    if (g('down') !== '4' || (type !== 'pass' && type !== 'run')) return;
    const won = yes(g('fourth_down_converted')), lost = yes(g('fourth_down_failed'));
    if (!won && !lost) return;
    const d = Math.round(parseFloat(g('ydstogo')));
    const c = conv[d] = conv[d] || { n: 0, w: 0 }; c.n++; c.w += won;
    const pd = type === 'pass' ? PASSD(d) : null;
    if (pd) { const p = pass[pd] = pass[pd] || { n: 0, sack: 0, comp: 0, int: 0, w: 0 }; p.n++; p.sack += yes(g('sack')); p.comp += yes(g('complete_pass')); p.int += yes(g('interception')); p.w += won; }
  });
}
const pct = (a, b) => (b ? Math.round(100 * a / b) : 0) + '%';
const band = (ds) => ds.reduce((o, d) => { const c = conv[d] || { n: 0, w: 0 }; o.n += c.n; o.w += c.w; return o; }, { n: 0, w: 0 });
console.log('4th down conversion, ' + FROM + ' to ' + TO + ' regular seasons');
for (const [lab, ds] of [['1', [1]], ['3', [3]], ['5', [5]], ['7', [7]], ['10', [10]], ['14 to 16', [14, 15, 16]], ['15', [15]]]) { const b = band(ds); console.log('  4th and ' + lab.padEnd(9) + pct(b.w, b.n).padStart(4) + '  (' + b.n + ')'); }
console.log('4th down passes: sacked, complete, intercepted, converted');
for (const d of [1, 5, 10, 15]) { const p = pass[d]; if (p) console.log('  4th and about ' + String(d).padEnd(3) + [p.sack, p.comp, p.int, p.w].map((v) => pct(v, p.n).padStart(5)).join('') + '  (' + p.n + ')'); }
console.log('passes by air yards: complete, intercepted');
for (const b of AIR) { const o = air[b]; if (o) console.log('  ' + String(b[0]).padStart(3) + ' to ' + String(b[1]).padEnd(3) + pct(o.c, o.n).padStart(5) + pct(o.i, o.n).padStart(5) + '  (' + o.n + ')'); }
const n = carries.length, sh = (k) => pct(carries.filter((v) => v >= k).length, n);
console.log('the carry spread (' + n + ' designed runs): no gain or worse ' + pct(carries.filter((v) => v <= 0).length, n) + ', 3+ ' + sh(3) + ', 5+ ' + sh(5) + ', 10+ ' + sh(10) + ', 20+ ' + sh(20) + ', ' + (carries.reduce((a, b) => a + b, 0) / n).toFixed(1) + ' a carry');
