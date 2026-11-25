#!/usr/bin/env node
// A SAVE SENDS ONLY WHAT CHANGED, AND THE SERVER SKIPS A WRITE THAT CHANGES NOTHING.
//
// On 2026-11-12 the database ran out of its Disk IO budget and the site went down. The causes were
// saves that sent a whole record every time and a server that rewrote the row even when nothing in
// it had changed. The rule is in the knowledge base, platform/platform-database-saves.md.
//
// What this checks is the server half, because it is the half a file can prove. Every database
// function (the latest definition in supabase/*.sql) that rewrites a jsonb column, by an upsert or
// an update, must be declared in scripts/save-writes.json as one of:
//
//   event   one write per thing the player did (a draft submitted, an outing posted), so an
//           unchanged rewrite cannot repeat. A note says why.
//   save    called again and again with the same record (a cloud save, a career merge). It must
//           skip an unchanged write: the statement carries `is distinct from`, or the function
//           returns before it on `is not distinct from`.
//
// A save that is not guarded yet stays listed with "status": "open", an owner and a note, and is
// printed on every run as tracked work. It fails when:
//   - a function rewrites a jsonb column and is not in the ledger (classify it),
//   - a "save" is unguarded and not marked open (a regression, or a new one),
//   - an open save is now guarded (close it in the ledger, so the list stays true).
// A ledger entry whose function no longer writes jsonb only warns.
//
// The client half (send only on a real change, never on a timer, a redraw or a hidden tab) is not
// something a file proves. The rule note holds it, and each game's checks hold their own callers.
//
//   node scripts/check-saves.mjs              the check
//   node scripts/check-saves.mjs --list       every jsonb writer and how it is classified
//   node scripts/check-saves.mjs --self-test  the parser, on made-up SQL

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SQL_DIR = path.join(ROOT, 'supabase');
const LEDGER = path.join(ROOT, 'scripts/save-writes.json');

const strip = s => s.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
const tname = t => t.replace(/^public\./, '').replace(/"/g, '');

// sources: [[name, text]] in migration order. Returns every write of a jsonb column, per function.
export function jsonWriters(sources) {
  const jsonCols = new Map();
  const fns = new Map();
  const addCol = (t, c) => { t = tname(t); if (!jsonCols.has(t)) jsonCols.set(t, new Set()); jsonCols.get(t).add(c); };
  for (const [file, text] of sources) {
    const s = strip(text);
    for (const m of s.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z0-9_."]+)\s*\(([\s\S]*?)\n\s*\)\s*;/gi))
      for (const c of m[2].matchAll(/^\s*([a-z_]+)\s+jsonb\b/gim)) addCol(m[1], c[1]);
    for (const m of s.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?([a-z0-9_."]+)[^;]*?add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_]+)\s+jsonb/gi))
      addCol(m[1], m[2]);
    for (const m of s.matchAll(/create\s+or\s+replace\s+function\s+(?:public\.)?([a-z0-9_]+)\s*\(([\s\S]*?)\)\s*returns[\s\S]*?as\s+(\$[a-z_]*\$)([\s\S]*?)\3/gi))
      fns.set(m[1], { file, body: m[4] });
  }
  const out = [];
  for (const [fn, { file, body }] of [...fns].sort()) {
    const re = /insert\s+into\s+([a-z0-9_."]+)(?:\s+as\s+\w+)?[\s\S]*?on\s+conflict[\s\S]*?do\s+update\s+set([\s\S]*?);|update\s+([a-z0-9_."]+)(?:\s+\w+)?\s+set([\s\S]*?);/gi;
    for (const w of body.matchAll(re)) {
      const table = tname(w[1] || w[3]);
      const cols = jsonCols.get(table);
      if (!cols) continue;
      const set = w[2] || w[4];
      const hit = [...set.matchAll(/(?:^|,)\s*([a-z_]+)\s*=/gi)].map(x => x[1]).filter(c => cols.has(c));
      if (!hit.length) continue;
      const guarded = /is\s+distinct\s+from/i.test(w[0]) || /is\s+not\s+distinct\s+from/i.test(body.slice(0, w.index));
      out.push({ fn, file, table, cols: hit, guarded });
    }
  }
  return out;
}

export function judge(writes, ledger) {
  const errors = [], warnings = [], open = [];
  const byFn = new Map();
  for (const w of writes) {
    if (!byFn.has(w.fn)) byFn.set(w.fn, []);
    byFn.get(w.fn).push(w);
  }
  for (const [fn, ws] of byFn) {
    const e = ledger[fn];
    const where = `${fn} (${ws[0].file}: ${[...new Set(ws.map(w => `${w.table}.${w.cols.join(',')}`))].join('; ')})`;
    const guarded = ws.every(w => w.guarded);
    if (!e) { errors.push(`${where} rewrites a jsonb column and is not in scripts/save-writes.json: classify it as "event" or "save"`); continue; }
    if (e.kind === 'event') continue;
    if (e.kind !== 'save') { errors.push(`${fn}: kind must be "event" or "save", not ${JSON.stringify(e.kind)}`); continue; }
    if (guarded && e.status === 'open') errors.push(`${fn} now skips an unchanged write: remove "status": "open" from its ledger entry`);
    else if (!guarded && e.status !== 'open') errors.push(`${where} is a save and rewrites an unchanged row: guard it with "is distinct from", or mark it open with an owner`);
    else if (!guarded) open.push({ fn, owner: e.owner || 'nobody', note: e.note || '', where });
  }
  for (const fn of Object.keys(ledger)) if (!fn.startsWith('_') && !byFn.has(fn)) warnings.push(`${fn} is in scripts/save-writes.json but no longer writes a jsonb column (remove the entry)`);
  return { errors, warnings, open };
}

function selfTest() {
  let n = 0;
  const eq = (a, b, what) => { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { console.error(`FAIL ${what}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); process.exit(1); } };
  const table = ['1_t.sql', 'create table public.saves (\n  id int primary key,\n  payload jsonb not null,\n  n int\n);\nalter table public.saves add column extra jsonb;\n'];
  const fn = (name, body) => `create or replace function public.${name}(p jsonb) returns void language plpgsql as $$ begin ${body} end $$;`;
  const w = jsonWriters([table, ['2_f.sql', [
    fn('bare_upsert', 'insert into public.saves as s (id, payload) values (1, p) on conflict (id) do update set payload = excluded.payload;'),
    fn('guarded_upsert', 'insert into public.saves as s (id, payload) values (1, p) on conflict (id) do update set payload = excluded.payload where s.payload is distinct from excluded.payload;'),
    fn('early_return', 'if (select payload from saves where id = 1) is not distinct from p then return; end if; update saves set payload = p where id = 1;'),
    fn('scalar_only', 'update saves set n = n + 1 where id = 1;'),
    fn('added_col', 'update public.saves set extra = p where id = 1;'),
    '-- update saves set payload = p;  (a comment is not a write)',
  ].join('\n')]]);
  eq(w.map(x => [x.fn, x.guarded]), [['added_col', false], ['bare_upsert', false], ['early_return', true], ['guarded_upsert', true]], 'finds jsonb writes and their guards');
  eq(w.find(x => x.fn === 'added_col').cols, ['extra'], 'a column added later counts');
  const later = jsonWriters([table, ['2_f.sql', fn('bare_upsert', 'insert into saves (id, payload) values (1, p) on conflict (id) do update set payload = excluded.payload;')],
    ['3_fix.sql', fn('bare_upsert', 'insert into saves as s (id, payload) values (1, p) on conflict (id) do update set payload = excluded.payload where s.payload is distinct from excluded.payload;')]]);
  eq(later.map(x => x.guarded), [true], 'the latest definition wins');
  const j = judge(w, { bare_upsert: { kind: 'save', status: 'open', owner: 'x' }, guarded_upsert: { kind: 'save', status: 'open' }, early_return: { kind: 'save' }, gone: { kind: 'event' } });
  eq(j.errors.length, 2, 'unlisted added_col, and a guarded save still marked open');
  eq(j.open.map(o => o.fn), ['bare_upsert'], 'an open save is tracked, not failed');
  eq(j.warnings.length, 1, 'a ledger entry with no writer warns');
  eq(judge(w, { added_col: { kind: 'event' }, bare_upsert: { kind: 'save' }, guarded_upsert: { kind: 'save' }, early_return: { kind: 'save' } }).errors.length, 1, 'an unguarded save not marked open fails');
  console.log(`check-saves self-test: ${n} checks pass`);
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--self-test')) return selfTest();
  const files = fs.readdirSync(SQL_DIR).filter(f => /^\d+.*\.sql$/.test(f))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10) || a.localeCompare(b));
  const writes = jsonWriters(files.map(f => [f, fs.readFileSync(path.join(SQL_DIR, f), 'utf8')]));
  const ledger = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
  if (argv.includes('--list')) {
    for (const w of writes) console.log(`${w.guarded ? 'guarded  ' : 'unguarded'} ${(ledger[w.fn]?.kind || '?').padEnd(5)} ${w.fn.padEnd(30)} ${w.table}.${w.cols.join(',')}  (${w.file})`);
    return;
  }
  const { errors, warnings, open } = judge(writes, ledger);
  for (const o of open) console.log(`open   ${o.fn} (${o.owner}): ${o.note}`);
  for (const w of warnings) console.log(`::warning::${w}`);
  for (const e of errors) console.log(`::error::${e}`);
  const fns = new Set(writes.map(w => w.fn)).size;
  if (errors.length) { console.log(`\n${errors.length} problem${errors.length === 1 ? '' : 's'}`); process.exit(1); }
  console.log(`saves ok: ${fns} functions rewrite a jsonb column, each classified; ${open.length} save${open.length === 1 ? '' : 's'} still open`);
}

main();
