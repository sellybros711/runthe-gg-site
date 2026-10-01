/* THE SERVER'S COPY OF A COLLEGE WEEK, AS SQL ON STDOUT.
 *
 *   node cfb/build/fantasy/publish.mjs                 the live week's board
 *   node cfb/build/fantasy/publish.mjs --week 5        a given week
 *   node cfb/build/fantasy/publish.mjs | psql "$SUPABASE_DB_URL"
 *
 * `football/build/publish-week.mjs` with the college tables in it, and every rule that file
 * argues for held the same way: one transaction, upserts only, prices never deleted, and a
 * week anybody has entered REFUSES to be repriced, in the SQL, because the SQL is what runs.
 *
 * WHAT IS ADDED is what the college swap needs: each man's team and kickoff (a swap is only
 * taken before HIS game), and the week's swap band, which is read off the same pool file
 * the page reads so the page and `cfb_fantasy_swap` can never disagree about who is in range.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DATA } from './season.mjs';
import { DRAFT } from './cap.mjs';

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const n2 = (v, what) => {
  const x = Number(v);
  if (!Number.isFinite(x)) throw new Error(`${what} is not a number: ${v}`);
  return x.toFixed(2);
};

export function poolSQL(pool) {
  const { season, week } = pool;
  const slots = DRAFT.SLOTS;
  if (!Number.isFinite(season) || !Number.isFinite(week)) throw new Error('no season or week');
  if (!pool.locks_at || Number.isNaN(Date.parse(pool.locks_at))) throw new Error('no lock time');
  if (!Array.isArray(pool.pool) || !pool.pool.length) throw new Error('no players');
  if (!Number.isFinite(Number(pool.cap_musd))) throw new Error('the pool carries no cap');
  for (const pos of new Set(slots)) {
    const have = pool.pool.filter((m) => m.position === pos).length;
    const want = slots.filter((s) => s === pos).length;
    if (have < want) throw new Error(`the board has ${have} ${pos} and a lineup needs ${want}`);
  }
  const swap = pool.swap || {};
  const out = [];
  out.push('begin;');
  out.push(`-- college ${season} week ${week}: ${pool.pool.length} men, `
    + `cap ${pool.cap_musd}, locks ${pool.locks_at}`);
  out.push('do $$');
  out.push('begin');
  out.push(`  if exists (select 1 from public.cfb_fantasy_entries`);
  out.push(`              where season = ${season} and week = ${week}) then`);
  out.push(`    raise exception 'college week ${week} of ${season} already has entries, `
    + `so its prices and cap must not move.';`);
  out.push('  end if;');
  out.push('end $$;');
  out.push('insert into public.cfb_fantasy_weeks '
    + '(season, week, locks_at, cap_musd, slots, swap_pct, swap_floor_musd)');
  out.push(`  values (${season}, ${week}, ${q(pool.locks_at)}::timestamptz, `
    + `${n2(pool.cap_musd, 'the cap')}, array[${slots.map(q).join(',')}]::text[], `
    + `${n2(swap.pct == null ? 0.25 : swap.pct, 'swap_pct')}, `
    + `${n2(swap.floor_musd == null ? 5 : swap.floor_musd, 'swap_floor')})`);
  out.push('  on conflict (season, week) do update set');
  out.push('    locks_at = excluded.locks_at, cap_musd = excluded.cap_musd,');
  out.push('    slots = excluded.slots, swap_pct = excluded.swap_pct,');
  out.push('    swap_floor_musd = excluded.swap_floor_musd, built_at = now();');
  const vals = pool.pool.map((m) => {
    if (!m.player_id || !m.position) throw new Error(`a row has no id or position: ${m.name}`);
    return `  (${season},${week},${q(m.player_id)},${q(m.position)},`
      + `${n2(m.price_musd, m.name + "'s price")},${n2(m.proj, m.name + "'s projection")},`
      + `${q(m.team || '')},${m.kick ? q(m.kick) + '::timestamptz' : 'null'})`;
  });
  out.push('insert into public.cfb_fantasy_prices '
    + '(season, week, player_id, pos, price_musd, proj, team, kick) values');
  out.push(vals.join(',\n'));
  out.push('  on conflict (season, week, player_id) do update set');
  out.push('    pos = excluded.pos, price_musd = excluded.price_musd, proj = excluded.proj,');
  out.push('    team = excluded.team, kick = excluded.kick;');
  out.push('commit;');
  return out.join('\n') + '\n';
}

/*
 * A KICKOFF CAN MOVE AFTER THE BOARD IS OUT (a television slot is set a week or two ahead),
 * and a swap is only taken before a man's game, so the kickoffs are restated on their own
 * without touching a price. Safe on a week with entries, which is the point of it.
 */
export function kickoffsSQL(pool, games) {
  const byTeam = new Map();
  for (const g of games) {
    if (!g.kick) continue;
    byTeam.set(g.home.abbr, g.kick);
    byTeam.set(g.away.abbr, g.kick);
  }
  const rows = pool.pool.filter((m) => byTeam.has(m.team) && byTeam.get(m.team) !== m.kick);
  if (!rows.length) return '';
  return 'update public.cfb_fantasy_prices p set kick = v.kick from (values\n'
    + rows.map((m) => `  (${q(m.player_id)}, ${q(byTeam.get(m.team))}::timestamptz)`).join(',\n')
    + `\n) as v(player_id, kick) where p.season = ${pool.season} and p.week = ${pool.week}`
    + ' and p.player_id = v.player_id;\n';
}

/* The scoreboard and the points, one tick's worth. `live.mjs` builds `res`. */
export function resultsSQL(res) {
  const { season, week } = res;
  const ids = Object.keys(res.scores || {});
  const out = ['begin;'];
  out.push(`-- college ${season} week ${week}: ${ids.length} men with a row, `
    + `${res.played} of ${res.games} games` + (res.final ? ', FINAL' : ''));
  if (res.board && res.board.length) {
    out.push(`select public.cfb_fantasy_put_games(${season}, ${week}, `
      + `${q(JSON.stringify(res.board))}::jsonb);`);
  }
  if (ids.length) {
    out.push('insert into public.cfb_fantasy_results (season, week, player_id, half_ppr, line) values');
    out.push(ids.map((id) => `  (${season},${week},${q(id)},`
      + `${n2(res.scores[id][0], id + "'s points")},`
      + `${res.scores[id][1] ? q(res.scores[id][1]) : 'null'})`).join(',\n'));
    out.push('  on conflict (season, week, player_id) do update set');
    out.push('    half_ppr = excluded.half_ppr, line = excluded.line;');
  }
  out.push(`select * from public.cfb_fantasy_mark_results(${season}, ${week}, `
    + `${Number(res.played)}, ${Number(res.games)}, ${res.final ? 'true' : 'false'});`);
  out.push('commit;');
  return out.join('\n') + '\n';
}

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

if (process.argv[1] && process.argv[1].endsWith('publish.mjs')) {
  const now = JSON.parse(fs.readFileSync(path.join(DATA, 'now.json'), 'utf8'));
  const season = Number(arg('--season', now.season));
  const week = Number(arg('--week', now.week));
  const f = path.join(DATA, `pool_${season}_w${week}.json`);
  if (!fs.existsSync(f)) {
    console.error(`${path.basename(f)} does not exist. Build it first.`);
    process.exit(1);
  }
  process.stdout.write(poolSQL(JSON.parse(fs.readFileSync(f, 'utf8'))));
}
