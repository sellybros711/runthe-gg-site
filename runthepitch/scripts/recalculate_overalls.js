// RunThePitch: World Cup Edition — position-specific overall recalculation.
//
// Reads  data/world_cup_full_rosters_1966_2026_13.csv
// Writes data/world_cup_full_rosters_1966_2026_13.csv  (same data + position_overall)
//
// All rates are per-appearance, using career_caps_at_tournament as the
// appearances proxy (per the spec). Missing counting stats are treated as 0;
// missing percentage stats use the position-pool median. Percentile ranks use
// the "<= value" convention and are scaled to 40-99, then a non-linear top-end
// curve makes 95+ genuinely rare. 2026 players keep their wc_overall (no
// tournament stats exist yet).
//
// No npm packages — the CSV is parsed and re-serialized by hand.

const fs = require('fs');
const path = require('path');

const IN_PATH  = path.join(__dirname, 'data', 'world_cup_full_rosters_1966_2026_13.csv');
const OUT_PATH = path.join(__dirname, 'data', 'world_cup_full_rosters_1966_2026_13.csv');

// ─── CSV parsing (quoted fields + escaped "" quotes) ──────────────────────────
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\r') { /* ignore */ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// ─── CSV serialization ────────────────────────────────────────────────────────
function csvField(v) {
  const s = (v === undefined || v === null) ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function csvRow(arr) { return arr.map(csvField).join(','); }

// ─── numeric helpers ──────────────────────────────────────────────────────────
function numOrNull(v) {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Percentile ranker over a fixed pool of values.
// rank = (number of values <= v) / total ; scaled to 40-99.
function makePercentile(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.length || 1;
  return function (v) {
    // count of values <= v via rightmost binary search
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] <= v) lo = mid + 1; else hi = mid; }
    const rank = lo / total;
    return 40 + rank * 59;
  };
}

// Non-linear top-end curve so 95+ is rare; round + clamp 40-99.
function applyCurve(scaled) {
  let final;
  if (scaled <= 82) final = scaled;
  else final = 82 + Math.pow((scaled - 82) / 17, 1.8) * 17;
  return clamp(Math.round(final), 40, 99);
}

// ─── main ─────────────────────────────────────────────────────────────────────
function main() {
  const text = fs.readFileSync(IN_PATH, 'utf8');
  const rows = parseCSV(text);
  const header = rows[0].map(h => h.trim());
  const col = {};
  header.forEach((h, i) => { col[h] = i; });

  // Build a lightweight record per data row (keeping the original row index).
  const recs = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || (row.length === 1 && String(row[0]).trim() === '')) continue;
    const g = name => row[col[name]];
    const rec = {
      rowIndex:   r,
      name:       (g('player_name') || '').trim(),
      country:    (g('country') || '').trim(),
      year:       numOrNull(g('wc_year')),
      position:   (g('position') || '').trim(), // GK / DF / MF / FW
      apps:       numOrNull(g('career_caps_at_tournament')),
      tgoals:     numOrNull(g('tournament_goals')),
      assists:    numOrNull(g('assists')),
      passComp:   numOrNull(g('mf_pass_completion_pct')),
      keyPasses:  numOrNull(g('mf_key_passes')),
      tackles:    numOrNull(g('df_tackles')),
      intercepts: numOrNull(g('df_interceptions')),
      clearances: numOrNull(g('df_clearances')),
      cleanSheet: numOrNull(g('gk_clean_sheets')),
      wcOverall:  numOrNull(g('wc_overall')),
    };
    recs.push(rec);
  }

  // counting stat with null → 0
  const z = v => (v == null ? 0 : v);

  // Pools used for percentiles/median/max are HISTORICAL performers only:
  // a valid tournament appearance (apps > 0) and not a 2026 (future) squad.
  const inPool = rec => rec.year !== 2026 && rec.apps != null && rec.apps > 0;

  const byPos = { GK: [], DF: [], MF: [], FW: [] };
  recs.forEach(rec => { if (inPool(rec) && byPos[rec.position]) byPos[rec.position].push(rec); });

  // max apps per position pool (availability denominator)
  const maxApps = {};
  for (const P of ['GK', 'DF', 'MF', 'FW']) {
    maxApps[P] = byPos[P].reduce((m, r) => Math.max(m, r.apps), 0) || 1;
  }

  // rate helpers (per appearance)
  const rateGoalContrib = r => (z(r.tgoals) + z(r.assists)) / r.apps; // DEF/MID/FWD
  const rateDefActions  = r => (z(r.tackles) + z(r.intercepts) + z(r.clearances)) / r.apps;
  const rateKeyPasses   = r => z(r.keyPasses) / r.apps;
  const rateGoals       = r => z(r.tgoals) / r.apps;

  // Percentile rankers per position/metric.
  const pct = {
    DF_def:  makePercentile(byPos.DF.map(rateDefActions)),
    DF_gc:   makePercentile(byPos.DF.map(rateGoalContrib)),
    MF_gc:   makePercentile(byPos.MF.map(rateGoalContrib)),
    MF_kp:   makePercentile(byPos.MF.map(rateKeyPasses)),
    FW_gr:   makePercentile(byPos.FW.map(rateGoals)),
    FW_tc:   makePercentile(byPos.FW.map(rateGoalContrib)),
  };

  // Median pass completion for MID (fallback 75 when no data exists at all,
  // a neutral real-world pass% — it shifts all MIDs equally so intra-MID
  // ranking is unaffected).
  const passVals = byPos.MF.map(r => r.passComp).filter(v => v != null);
  const passMedian = passVals.length ? median(passVals) : 75;

  // ─── compute position_overall, capturing components for sanity output ───────
  function computeOverall(rec) {
    // 2026: no tournament stats — use wc_overall directly.
    if (rec.year === 2026) {
      const v = rec.wcOverall != null ? clamp(Math.round(rec.wcOverall), 40, 99) : 40;
      return { overall: v, src: '2026:wc_overall' };
    }
    // no appearances → floor 40
    if (rec.apps == null || rec.apps === 0) {
      return { overall: 40, src: 'apps0' };
    }

    const avail = clamp(rec.apps / maxApps[rec.position] * 100, 0, 100);
    let scaled, parts = {};

    if (rec.position === 'GK') {
      const csRate  = clamp(z(rec.cleanSheet) / rec.apps * 100, 0, 100); // 45%
      const gcPerApp = z(rec.tgoals) / rec.apps;
      const gcScore = clamp((1 - gcPerApp) * 100, 0, 100);               // 35%
      scaled = 0.45 * csRate + 0.35 * gcScore + 0.20 * avail;
      parts = { csRate, gcScore, avail };

    } else if (rec.position === 'DF') {
      const def = pct.DF_def(rateDefActions(rec)); // 45%
      const gc  = pct.DF_gc(rateGoalContrib(rec)); // 30%
      scaled = 0.45 * def + 0.30 * gc + 0.25 * avail;
      parts = { def, gc, avail };

    } else if (rec.position === 'MF') {
      const gc   = pct.MF_gc(rateGoalContrib(rec)); // 40%
      const crea = pct.MF_kp(rateKeyPasses(rec));   // 35%
      const passQ = (rec.passComp != null ? rec.passComp : passMedian) / 100 * 100; // 10%
      scaled = 0.40 * gc + 0.35 * crea + 0.10 * passQ + 0.15 * avail;
      parts = { gc, crea, passQ, avail };

    } else if (rec.position === 'FW') {
      const gr = pct.FW_gr(rateGoals(rec));        // 55%
      const tc = pct.FW_tc(rateGoalContrib(rec));  // 30%
      scaled = 0.55 * gr + 0.30 * tc + 0.15 * avail;
      parts = { gr, tc, avail };

    } else {
      // unknown position — neutral
      scaled = avail;
      parts = { avail };
    }

    return { overall: applyCurve(scaled), src: rec.position, scaled, parts };
  }

  recs.forEach(rec => { const c = computeOverall(rec); rec.position_overall = c.overall; rec._c = c; });

  // ─── write the augmented CSV ────────────────────────────────────────────────
  const outLines = [];
  outLines.push(csvRow([...header, 'position_overall']));
  const byRowIndex = new Map(recs.map(r => [r.rowIndex, r]));
  for (let r = 1; r < rows.length; r++) {
    const rec = byRowIndex.get(r);
    if (!rec) continue; // skipped blank line
    outLines.push(csvRow([...rows[r], rec.position_overall]));
  }
  fs.writeFileSync(OUT_PATH, outLines.join('\n') + '\n');

  // ─── sanity checks ──────────────────────────────────────────────────────────
  console.log('=== recalculate_overalls.js ===');
  console.log('Players processed:', recs.length);
  console.log('Wrote', OUT_PATH, '\n');

  const find = (nm, yr, pos) => recs.find(r =>
    r.name.includes(nm) && r.year === yr && (!pos || r.position === pos));
  const show = (label, rec) => {
    if (!rec) { console.log(`  ${label}: NOT FOUND`); return; }
    const c = rec._c;
    const partsStr = c.parts ? Object.entries(c.parts).map(([k, v]) => `${k}=${(+v).toFixed(1)}`).join(' ') : '';
    console.log(`  ${label}: ${rec.position_overall}  (${rec.name}, ${rec.country} ${rec.year} ${rec.position}` +
      `, apps=${rec.apps}, tg=${rec.tgoals == null ? '—' : rec.tgoals}` +
      (c.scaled != null ? `, scaled=${c.scaled.toFixed(1)}` : '') +
      (partsStr ? `, ${partsStr}` : '') + `)`);
  };

  console.log('Sanity checks:');
  show('Lionel Messi 2022 FW', find('Lionel Messi', 2022, 'FW'));
  show('Diego Maradona 1986 MF', find('Diego Maradona', 1986, 'MF'));
  show('Pelé 1970 FW',           find('Pelé', 1970, 'FW'));
  show('Ronaldo 2002 FW',        recs.find(r => r.name === 'Ronaldo' && r.year === 2002 && r.country === 'Brazil'));
  show('Zinedine Zidane 2006 MF', find('Zinedine Zidane', 2006, 'MF'));
  show('Diego Maradona 1982 MF', find('Diego Maradona', 1982, 'MF'));

  console.log('\nDistribution (position_overall) by position:');
  for (const P of ['GK', 'DF', 'MF', 'FW']) {
    const vals = recs.filter(r => r.position === P).map(r => r.position_overall);
    if (!vals.length) continue;
    const min = Math.min(...vals), max = Math.max(...vals);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    console.log(`  ${P}: n=${vals.length}  min=${min}  max=${max}  mean=${mean.toFixed(1)}`);
  }

  console.log('\nTop 15 players overall:');
  [...recs].sort((a, b) => b.position_overall - a.position_overall).slice(0, 15)
    .forEach((r, i) => console.log(
      `  ${String(i + 1).padStart(2)}. ${r.position_overall}  ${r.name} (${r.country} ${r.year} ${r.position})`));
}

main();
