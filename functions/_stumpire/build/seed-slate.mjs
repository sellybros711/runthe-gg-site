#!/usr/bin/env node
/* Seed the ten sample prompts and build, validate and freeze a test slate.
 *
 *   node functions/_stumpire/build/seed-slate.mjs                 check only, print the slate
 *   node functions/_stumpire/build/seed-slate.mjs --sql [--date YYYY-MM-DD] | psql "$SUPABASE_DB_URL"
 *
 * --sql emits the prompts (upserted) and one call to stumpire_publish_slate,
 * which refuses a date that already has a slate, so a re-run never moves a
 * published grade. The default date is today in Eastern time.
 *
 * The scores come from data/search_avg.json. If that file is the synthetic
 * fixture the script says so, loudly, because a slate graded on it is for
 * testers only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSlate, frozenRows } from '../publish.js';
import { slateDate, slateNumber } from '../slate.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SEED = JSON.parse(fs.readFileSync(path.join(HERE, '../prompts/seed.json'), 'utf8'));
export const SEARCH = JSON.parse(fs.readFileSync(path.join(HERE, '../data/search_avg.json'), 'utf8'));

export function testSlate() {
  const defs = SEED.test_slate.map(id => SEED.prompts.find(p => p.id === id));
  return { defs, built: buildSlate(defs, SEARCH.values) };
}

/* Into a db-memory instance, for the dev server and tests. */
export async function seedMemory(db, date) {
  for (const p of SEED.prompts) await db.savePrompt(p);
  const { defs, built } = testSlate();
  if (!built.ok) throw new Error(built.errors.join('\n'));
  const rows = [];
  built.prompts.forEach((p, i) => frozenRows(p).forEach(r => rows.push({ ...r, at_bat: i, prompt_id: p.def.id })));
  await db.publish(date, slateNumber(date), defs, rows);
  return built;
}

const lit = s => s == null ? 'null' : "'" + String(s).replace(/'/g, "''") + "'";
const arr = a => 'array[' + a.map(lit).join(',') + ']::text[]';

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const date = args.includes('--date') ? args[args.indexOf('--date') + 1] : slateDate();
  const { defs, built } = testSlate();
  if (SEARCH.synthetic) console.error('NOTE: search_avg is the SYNTHETIC fixture. This slate is for testers only.');
  if (!built.ok) { console.error('The test slate breaks the rules:\n  ' + built.errors.join('\n  ')); process.exit(1); }
  built.prompts.forEach((p, i) => {
    console.error('at-bat ' + (i + 1) + ': ' + p.def.text + ' | ' + p.graded.length + ' valid, called ' + p.called.ids.length +
      ' (' + Math.round(p.called.coverage * 100) + '%)' + (p.check.warnings.length ? ' | ' + p.check.warnings.join('; ') : ''));
  });
  if (args.includes('--sql')) {
    const out = ['begin;'];
    for (const p of SEED.prompts) {
      const query = JSON.stringify({ years: p.years, where: p.where, set: !!p.set });
      out.push('insert into stumpire_prompts (id, text, league, type, query, wildcard, arguable) values (' +
        [lit(p.id), lit(p.text), lit(p.league), lit(p.type), lit(query) + '::jsonb', lit(p.wildcard), arr(p.arguable || [])].join(', ') +
        ') on conflict (id) do update set text = excluded.text, query = excluded.query, wildcard = excluded.wildcard, arguable = excluded.arguable, updated_at = now();');
    }
    const rows = [];
    built.prompts.forEach((p, i) => frozenRows(p).forEach(r => rows.push({ ...r, at_bat: i, prompt_id: p.def.id })));
    out.push('select stumpire_publish_slate(' + [lit(date), slateNumber(date), arr(defs.map(d => d.id)), arr(defs.map(d => d.text)),
      arr(defs.map(d => d.league)), arr(defs.map(d => d.type)), lit(JSON.stringify(rows)) + '::jsonb'].join(', ') + ');');
    out.push('commit;');
    process.stdout.write(out.join('\n') + '\n');
  } else {
    console.error('slate #' + slateNumber(date) + ' for ' + date + ' is valid. Add --sql to emit it.');
  }
}
