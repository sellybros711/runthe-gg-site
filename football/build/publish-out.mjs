/*
 * THE SERVER'S HALF OF A SWAP: who is out this week, and when every man plays.
 *
 *   node football/build/publish-out.mjs                       the live week
 *   node football/build/publish-out.mjs --season 2026 --week 3
 *   node football/build/publish-out.mjs | psql "$SUPABASE_DB_URL"
 *
 * `supabase/119_fantasy_swap.sql` lets an entrant replace a man who is ruled out, before
 * his game starts, and it answers both halves of that from rows: `fantasy_out` for "ruled
 * out" and `fantasy_prices.kick` for "before his game". This prints the SQL that fills both,
 * read off the two files the page already reads, so the page offering a swap and the server
 * accepting it are asking the same question of the same data.
 *
 * ─── IT NEVER TOUCHES A PRICE ─────────────────────────────────────────────────────────
 *
 * A price may never move once anybody has drafted against it, and `publish-week.mjs`
 * refuses to republish a week with entries for exactly that reason. This writes `team` and
 * `kick` beside the price and nothing else, so it is safe on a week that is being played.
 *
 * ─── THE OUT LIST IS REPLACED WHOLE ───────────────────────────────────────────────────
 *
 * Deleted and rewritten for the week on every run, so a man a later report clears comes off
 * it. A swap already made stands: it was legal when it was made.
 *
 * WHICH STATUSES: injured reserve and friends (`off`), Out and Doubtful. The same three the
 * page takes off the wheel in `applyInjuries`, and a site ruling is an Out like any other.
 * Questionable is a decision and stays in the lineup.
 *
 * ─── A WEEK WITH NO ROW WRITES NOTHING, AND DOES NOT FAIL ──────────────────────────────
 *
 * `fantasy_out` references the week, so an insert for a week nobody published would raise.
 * The insert selects from the week row instead, which writes nothing when it is missing.
 * The injury workflow runs this on every firing, including for a week the Tuesday build has
 * not published yet, and a red run there would teach everybody to ignore that workflow.
 */
import fs from 'fs';
import path from 'path';
import { DATA_DIR } from './lib.mjs';

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** The three statuses that make a man swappable. One list, read by the page's copy too. */
export const OUT_STATUSES = ['off', 'out', 'doubtful'];

export function outSQL(pool, inj) {
  const { season, week } = pool;
  if (!Number.isFinite(season) || !Number.isFinite(week)) {
    throw new Error('the pool file has no season or week');
  }
  if (!Array.isArray(pool.pool) || !pool.pool.length) {
    throw new Error('the pool file has no players in it');
  }
  /* AN INJURY FILE FOR ANOTHER WEEK IS REFUSED, never applied. Last week's Out applied to
     this week would let somebody swap a man who is playing. */
  if (inj && (inj.season !== season || inj.week !== week)) {
    throw new Error(`the injury file is ${inj.season} week ${inj.week}, not ${season} week ${week}`);
  }

  const out = [];
  out.push('begin;');
  out.push('');

  const kicks = pool.pool.filter((m) => m.player_id && m.kick && !Number.isNaN(Date.parse(m.kick)));
  out.push(`-- ${season} week ${week}: kickoffs for ${kicks.length} of ${pool.pool.length} men`);
  if (kicks.length) {
    out.push('update public.fantasy_prices p');
    out.push('   set team = v.team, kick = v.kick::timestamptz');
    out.push('  from (values');
    out.push(kicks.map((m) => `    (${q(m.player_id)}, ${m.team ? q(m.team) : 'null'}, ${q(m.kick)})`)
      .join(',\n'));
    out.push('  ) v(player_id, team, kick)');
    out.push(` where p.season = ${season} and p.week = ${week} and p.player_id = v.player_id`);
    out.push('   and (p.team is distinct from v.team or p.kick is distinct from v.kick::timestamptz);');
  }
  out.push('');

  const men = (inj && inj.men) || {};
  const gone = Object.keys(men).filter((id) => OUT_STATUSES.includes(men[id] && men[id].st));
  out.push(`-- ${gone.length} men ruled out`);
  out.push(`delete from public.fantasy_out where season = ${season} and week = ${week};`);
  if (gone.length) {
    out.push('insert into public.fantasy_out (season, week, player_id, status, by_site)');
    out.push(`select ${season}, ${week}, v.player_id, v.status, v.by_site`);
    out.push('  from (values');
    out.push(gone.map((id) => `    (${q(id)}, ${q(men[id].st)}, ${men[id].by === 'site' ? 'true' : 'false'})`)
      .join(',\n'));
    out.push('  ) v(player_id, status, by_site)');
    out.push(` where exists (select 1 from public.fantasy_weeks w`);
    out.push(`                where w.season = ${season} and w.week = ${week});`);
  }
  out.push('');
  out.push('commit;');
  return out.join('\n') + '\n';
}

function arg(name, dflt) {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}

if (process.argv[1] && process.argv[1].endsWith('publish-out.mjs')) {
  const now = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'fantasy_now.json'), 'utf8'));
  const season = Number(arg('--season', now.season));
  const week = Number(arg('--week', now.week));
  const pf = path.join(DATA_DIR, `weekly_${season}_w${week}.json`);
  if (!fs.existsSync(pf)) {
    console.error(`weekly_${season}_w${week}.json does not exist. Build it first.`);
    process.exit(1);
  }
  const jf = path.join(DATA_DIR, `injuries_${season}_w${week}.json`);
  /* NO INJURY FILE IS AN EMPTY OUT LIST, not an error: it is the ordinary state of a week on
     its Tuesday, and the kickoffs are still worth writing. */
  const inj = fs.existsSync(jf) ? JSON.parse(fs.readFileSync(jf, 'utf8')) : null;
  process.stdout.write(outSQL(JSON.parse(fs.readFileSync(pf, 'utf8')), inj));
}
