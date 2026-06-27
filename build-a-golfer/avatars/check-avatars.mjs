#!/usr/bin/env node
// Avatar asset checklist for RunTheTour.
// Lists which of the 420 capped golfer portraits are present / still missing in
// public/avatars/golfers/, using the canonical filename tokens (see that
// folder's README.md).
//
// Usage (from anywhere):
//   node build-a-golfer/avatars/check-avatars.mjs            # summary
//   node build-a-golfer/avatars/check-avatars.mjs --list     # + every missing file
//   node build-a-golfer/avatars/check-avatars.mjs --out missing.txt   # write missing list
//   node build-a-golfer/avatars/check-avatars.mjs --dir path/to/golfers
//
// Exit code: 0 if all 420 present, 1 if any missing (handy for CI/art drops).

import { readdirSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const GENDERS = ['male', 'female'];
const SKINS   = ['skin-01-fair','skin-02-light','skin-03-tan','skin-04-medium','skin-05-deep'];
const HAIRS   = ['hair-01-black','hair-02-dark-brown','hair-03-brown','hair-04-blonde','hair-05-auburn','hair-06-gray'];
const SHIRTS  = ['shirt-01-teal','shirt-02-blue','shirt-03-red','shirt-04-gold','shirt-05-cream','shirt-06-purple','shirt-07-charcoal'];

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt  = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };

const here = dirname(fileURLToPath(import.meta.url));
const dir  = opt('--dir') || join(here, '..', 'public', 'avatars', 'golfers');

// Every expected filename (420 total).
const expected = [];
for (const g of GENDERS)
  for (const sk of SKINS)
    for (const hr of HAIRS)
      for (const sh of SHIRTS)
        expected.push(`${g}_${sk}_${hr}_${sh}.png`);

const present = new Set(
  existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.png') && !f.startsWith('_')) : []
);

const missing = expected.filter(f => !present.has(f));
const have    = expected.length - missing.length;
const pct     = ((have / expected.length) * 100).toFixed(1);

// Per-gender breakdown so the art drop can be tracked in halves.
const byGender = (g) => {
  const total = expected.filter(f => f.startsWith(g + '_')).length;
  const miss  = missing.filter(f => f.startsWith(g + '_')).length;
  return `${g.padEnd(6)} ${total - miss}/${total}`;
};

console.log(`\nRunTheTour avatar assets  —  ${dir}`);
console.log('─'.repeat(46));
console.log(`present : ${have} / ${expected.length}  (${pct}%)`);
console.log(`missing : ${missing.length}`);
console.log(`  ${byGender('male')}    ${byGender('female')}`);

// Note any stray files that don't match the expected naming (typos, wrong tokens).
const expectedSet = new Set(expected);
const stray = [...present].filter(f => !expectedSet.has(f));
if (stray.length) {
  console.log(`\n⚠ ${stray.length} file(s) present but NOT matching the 420 naming pattern:`);
  stray.forEach(f => console.log(`    ${f}`));
}

if (flag('--list') && missing.length) {
  console.log(`\nMissing (${missing.length}):`);
  missing.forEach(f => console.log(`  ${f}`));
}

const out = opt('--out');
if (out) {
  writeFileSync(out, missing.join('\n') + (missing.length ? '\n' : ''));
  console.log(`\nWrote ${missing.length} missing filename(s) → ${out}`);
}

if (missing.length && !flag('--list') && !out) {
  console.log(`\nRun with --list to print all missing, or --out missing.txt to save them.`);
}

console.log(missing.length ? `\n${missing.length} still to deliver.\n` : `\n✓ All 420 capped avatars present.\n`);
process.exit(missing.length ? 1 : 0);
