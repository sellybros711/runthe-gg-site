#!/usr/bin/env node
/* Publish Stumpire slates from the prompt pool.
 *
 *   node functions/_stumpire/build/seed-slate.mjs                       check today's slate, print it
 *   node functions/_stumpire/build/seed-slate.mjs --sql [--date D] [--days N] [--recent used.json] [--extra prompts.json] | psql "$SUPABASE_DB_URL"
 *
 * --sql emits the pool prompts (upserted) and one publish per day. A date that
 * already has a slate is skipped inside the SQL, so a re-run, or the daily
 * workflow firing twice, is a no-op and never moves a published grade.
 * --recent is a JSON array of prompt ids used lately (the workflow reads it
 * out of stumpire_slates); --extra adds prompts authored in the admin tool.
 * Days published in one run count as recent for the days after them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { frozenRows } from '../publish.js';
import { chooseSlate } from '../daily.js';
import { slateDate, slateNumber } from '../slate.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SEED = JSON.parse(fs.readFileSync(path.join(HERE, '../prompts/seed.json'), 'utf8'));
export const SEARCH = JSON.parse(fs.readFileSync(path.join(HERE, '../data/search_avg.json'), 'utf8'));

/* The pool: prompts in the database (authored in the admin tool, or seeded
   earlier and maybe edited there) win over the file's copy of the same id. */
export function poolOf(extra = []) {
  const ids = new Set(extra.map(p => p.id));
  return [...extra, ...SEED.prompts.filter(p => !ids.has(p.id))];
}
export function slateFor(date, opts = {}) {
  const pool = poolOf(opts.extra || []);
  return chooseSlate(pool, opts.searchAvg || SEARCH.values, date, opts.recent || new Set());
}

/* Into a db-memory instance, for the dev server and tests. */
export async function seedMemory(db, date) {
  for (const p of SEED.prompts) await db.savePrompt(p);
  const built = slateFor(date);
  if (!built.ok) throw new Error(built.errors.join('\n'));
  await db.publish(date, slateNumber(date), built.defs, rowsOf(built));
  return built;
}

export function rowsOf(built) {
  const rows = [];
  built.prompts.forEach((p, i) => frozenRows(p).forEach(r => rows.push({ ...r, at_bat: i, prompt_id: p.def.id })));
  return rows;
}

const lit = s => s == null ? 'null' : "'" + String(s).replace(/'/g, "''") + "'";
const arr = a => 'array[' + a.map(lit).join(',') + ']::text[]';
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const arg = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
  const start = arg('date') || slateDate();
  const days = Math.max(1, Number(arg('days') || 1));
  const recent = new Set(arg('recent') ? JSON.parse(fs.readFileSync(arg('recent'), 'utf8')) : []);
  const extra = arg('extra') ? JSON.parse(fs.readFileSync(arg('extra'), 'utf8')) : [];
  if (SEARCH.synthetic) console.error('NOTE: search_avg is the SYNTHETIC fixture. These slates are for testers only.');
  const out = ['begin;'];
  for (const p of SEED.prompts) {
    if (extra.some(e => e.id === p.id)) continue;   // already in the table, perhaps edited there: the table wins
    const query = JSON.stringify({ years: p.years, where: p.where, set: !!p.set });
    out.push('insert into stumpire_prompts (id, text, league, type, query, wildcard, arguable) values (' +
      [lit(p.id), lit(p.text), lit(p.league), lit(p.type), lit(query) + '::jsonb', lit(p.wildcard), arr(p.arguable || [])].join(', ') +
      ') on conflict (id) do nothing;');
  }
  let failed = false;
  for (let k = 0; k < days; k++) {
    const date = addDays(start, k);
    const built = slateFor(date, { recent, extra });
    if (!built.ok) { console.error(date + ': ' + built.errors.join('; ')); failed = true; continue; }
    built.defs.forEach(d => recent.add(d.id));
    console.error(date + ' #' + slateNumber(date) + ': ' + built.prompts.map(p => p.def.text + ' [' + p.graded.length + ', called ' + Math.round(p.called.coverage * 100) + '%]').join(' | '));
    out.push('select stumpire_publish_slate(' + [lit(date), slateNumber(date), arr(built.defs.map(d => d.id)), arr(built.defs.map(d => d.text)),
      arr(built.defs.map(d => d.league)), arr(built.defs.map(d => d.type)), lit(JSON.stringify(rowsOf(built))) + '::jsonb'].join(', ') +
      ') where not exists (select 1 from stumpire_slates where slate_date = ' + lit(date) + ');');
  }
  out.push('commit;');
  if (args.includes('--sql')) process.stdout.write(out.join('\n') + '\n');
  if (failed) process.exit(1);
}
