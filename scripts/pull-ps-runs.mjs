/*
 * pull-ps-runs.mjs -- export finished Perfect Season runs from Supabase.
 *
 * Written because the balance work on the final-game curve was tuned against a MODEL of
 * where players land (rosters drafted through the real wheel in a simulator), not against
 * where they actually land. The model says the median run finishes around 88.8 overall with
 * a third of good runs between 90 and 95; this tells you whether that is true.
 *
 *   node scripts/pull-ps-runs.mjs                        free play, newest 50k runs
 *   node scripts/pull-ps-runs.mjs --max=200000           more of them
 *   node scripts/pull-ps-runs.mjs --all-modes            include daily runs too
 *   node scripts/pull-ps-runs.mjs --since=2026-06-01     only runs after a date
 *   node scripts/pull-ps-runs.mjs --out=runs.csv         where the CSV goes
 *
 * Reads with the public anon key that already ships in football/auth.js, so it sees exactly
 * what the in-game leaderboard sees and needs no secret. If your RLS blocks anon on ps_runs,
 * put a service key in SUPABASE_KEY and it will use that instead.
 *
 * Prints a summary in the same bands the simulator reports, so the two can be laid side by
 * side directly. The interesting column is the LAST one: measured title rate by overall.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const flag = (name) => process.argv.includes(`--${name}`);

const URL_BASE = process.env.SUPABASE_URL || 'https://jcrrxqfpdelrmvjuihnm.supabase.co';
const OUT = arg('out', path.join(ROOT, 'ps_runs_export.csv'));
const MAX = Number(arg('max', 50000));
const SINCE = arg('since', null);
const PAGE = Number(arg('page', 1000));
const ALL_MODES = flag('all-modes');

/* The anon key is public -- it is served to every browser that loads the game -- so reading
   it out of the client source is not a secret leak, it is just avoiding a copy-paste. */
function anonKey() {
  if (process.env.SUPABASE_KEY) return process.env.SUPABASE_KEY;
  const src = fs.readFileSync(path.join(ROOT, 'football/auth.js'), 'utf8');
  const m = src.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  if (!m) throw new Error('could not find the anon key in football/auth.js; set SUPABASE_KEY');
  return m[0];
}

const COLS = [
  'id', 'created_at', 'team_rating', 'squad_fppg', 'chemistry_pct', 'structure_mult',
  'spend_musd', 'respins', 'regular_wins', 'wins', 'losses',
  'title_won', 'made_playoffs', 'perfect', 'seed_label', 'daily', 'franchise',
];

async function main() {
  const key = anonKey();
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  const rows = [];
  let afterId = 0;
  process.stderr.write(`pulling from ${URL_BASE} ...\n`);

  while (rows.length < MAX) {
    const want = Math.min(PAGE, MAX - rows.length);
    const q = new URLSearchParams();
    q.set('select', COLS.join(','));
    // Keyset paging on the primary key: stable, and it does not slow down at depth the way
    // offset does on a table this size.
    q.set('id', `gt.${afterId}`);
    q.set('team_rating', 'not.is.null');
    if (!ALL_MODES) q.set('daily', 'is.false');
    if (SINCE) q.set('created_at', `gte.${SINCE}`);
    q.set('order', 'id.asc');
    q.set('limit', String(want));

    const url = `${URL_BASE}/rest/v1/ps_runs?${q}`;
    let res;
    try {
      res = await fetch(url, { headers });
    } catch (e) {
      throw new Error(`network error talking to Supabase: ${e.message}`);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      if (res.status === 401 || res.status === 403) {
        /* A 403 here has two very different causes and they need different fixes, so read
           the body rather than assuming: a corporate/sandbox egress proxy sitting in front
           of you looks identical to Supabase refusing the key until you look at what it
           actually said. */
        if (/allowlist|egress|proxy|not in allow/i.test(body)) {
          throw new Error(`${res.status} from a NETWORK PROXY, not from Supabase -- the host `
            + `is being blocked before the request leaves this machine. Run this from a `
            + `machine with plain internet access, or allow ${new URL(URL_BASE).host}. `
            + `Proxy said: ${body.slice(0, 160)}`);
        }
        throw new Error(`${res.status} from Supabase -- anon cannot read ps_runs under your `
          + `RLS. Re-run with SUPABASE_KEY=<service key>. Server said: ${body.slice(0, 200)}`);
      }
      throw new Error(`${res.status} from Supabase: ${body.slice(0, 300)}`);
    }
    const batch = await res.json();
    if (!batch.length) break;
    rows.push(...batch);
    afterId = batch[batch.length - 1].id;
    process.stderr.write(`\r  ${rows.length} runs`);
  }
  process.stderr.write(`\r  ${rows.length} runs\n`);
  if (!rows.length) {
    console.log('No rows came back. If this is unexpected, check the filters -- '
      + '--all-modes and a wider --since are the usual reasons.');
    return;
  }

  // ── CSV ────────────────────────────────────────────────────────────────────
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  fs.writeFileSync(OUT, COLS.join(',') + '\n'
    + rows.map((r) => COLS.map((c) => esc(r[c])).join(',')).join('\n') + '\n');
  console.log(`\nwrote ${rows.length} runs to ${OUT}`);

  // ── summary ────────────────────────────────────────────────────────────────
  const ovr = rows.map((r) => Number(r.team_rating)).filter((x) => x > 0).sort((a, b) => a - b);
  const q = (p) => ovr[Math.floor(p * (ovr.length - 1))].toFixed(1);
  console.log(`\nOVERALL (team_rating), n=${ovr.length}`);
  console.log(`  min ${q(0)}   p10 ${q(.1)}   p25 ${q(.25)}   median ${q(.5)}`
    + `   p75 ${q(.75)}   p90 ${q(.9)}   p99 ${q(.99)}   max ${q(1)}`);

  const share = (lo, hi) => {
    const n = ovr.filter((x) => x >= lo && x < hi).length;
    return `${(n / ovr.length * 100).toFixed(1)}%`.padStart(7);
  };
  console.log(`\n  <86 ${share(0, 86)}   86-90 ${share(86, 90)}   90-95 ${share(90, 95)}`
    + `   95-100 ${share(95, 100)}   100-105 ${share(100, 105)}   105+ ${share(105, 999)}`);

  // What the curve is tuned around, checked against reality.
  const BANDS = [[0, 84], [84, 88], [88, 90], [90, 92], [92, 94], [94, 96],
    [96, 100], [100, 105], [105, 999]];
  console.log('\nMEASURED OUTCOMES BY BAND -- compare against the simulator\'s columns\n');
  console.log('  band        runs   share |  playoff%   title%  perfect% | avg wins');
  console.log('  ' + '-'.repeat(68));
  for (const [lo, hi] of BANDS) {
    const g = rows.filter((r) => Number(r.team_rating) >= lo && Number(r.team_rating) < hi);
    if (!g.length) continue;
    const pc = (f) => (g.filter(f).length / g.length * 100);
    const label = hi === 999 ? `${lo}+` : `${lo}-${hi}`;
    console.log(`  ${label.padEnd(9)} ${String(g.length).padStart(7)} `
      + `${(g.length / rows.length * 100).toFixed(1).padStart(6)}% |`
      + `${pc((r) => r.made_playoffs).toFixed(2).padStart(9)}`
      + `${pc((r) => r.title_won).toFixed(3).padStart(9)}`
      + `${pc((r) => r.perfect).toFixed(4).padStart(10)} |`
      + `${(g.reduce((s, r) => s + Number(r.regular_wins || 0), 0) / g.length).toFixed(2).padStart(9)}`);
  }

  const all = (f) => (rows.filter(f).length / rows.length * 100);
  console.log(`\n  ALL RUNS: playoffs ${all((r) => r.made_playoffs).toFixed(2)}%   `
    + `titles ${all((r) => r.title_won).toFixed(3)}%   perfect ${all((r) => r.perfect).toFixed(4)}%`);
  const rs = rows.filter((r) => r.respins != null);
  if (rs.length) {
    console.log(`  re-spins used: mean ${(rs.reduce((s, r) => s + Number(r.respins), 0) / rs.length).toFixed(2)}`
      + `, none in ${(rs.filter((r) => Number(r.respins) === 0).length / rs.length * 100).toFixed(1)}% of runs`);
  }
  console.log('\nThe share row and the title% column are the two that matter: they say whether');
  console.log('the curve\'s pivot is sitting where players actually are, and whether the');
  console.log('simulated title rates match the real ones.');
}

main().catch((e) => { console.error('\n' + e.message); process.exit(1); });
