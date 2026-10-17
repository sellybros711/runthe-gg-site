#!/usr/bin/env node
/* The Sky World is for testers only, and linked from nowhere. This proves it on every PR:
 *
 *   1. no file outside the world's own (and its workflow and agent definition) names or links it,
 *      so no nav entry, home page card, sitemap entry, newsletter listing or public page leads to it
 *   2. the sign in screen names no game, no agent and no world
 *   3. no secret is written into the world's files: the only key in them is Supabase's public anon key
 *   4. the refusal is Stumpire's own notFound(), byte for byte
 *
 *   node functions/_skyworld/check-posture.mjs */
import fs from 'node:fs';
import { execSync } from 'node:child_process';
const ROOT = new URL('../../', import.meta.url).pathname;
const OWN = [/^functions\/_skyworld\//, /^functions\/skyworld\//, /^\.github\/workflows\/sky-world-checks\.yml$/, /^\.claude\/agents\/sky-world\.md$/];
const NAMES = /sky[\s_-]*world/i;
const fail = []; let seen = 0; const ok = m => { if (fail.length === seen) console.log(' ok ' + m); seen = fail.length; };

// 1. linked from nowhere
const files = execSync('git ls-files', { cwd: ROOT }).toString().trim().split('\n');
for (const f of files) {
  if (OWN.some(re => re.test(f)) || !/\.(html?|js|mjs|json|xml|txt|md|yml|yaml|toml|css|webmanifest)$|^_redirects$|^_headers$/.test(f)) continue;
  let t; try { t = fs.readFileSync(ROOT + f, 'utf8'); } catch (e) { continue; }
  if (NAMES.test(t)) fail.push('names the world: ' + f);
}
ok('no other file names or links it (' + files.length + ' files read)');

// 2. the sign in screen names nothing
const shell = fs.readFileSync(ROOT + 'functions/_skyworld/web/shell.html', 'utf8');
const gj = JSON.parse(fs.readFileSync(ROOT + 'scripts/newsletter/games.json', 'utf8'));
const words = [/sky\s+world/i, /\bagents?\b/i, /island/i, ...gj.games.map(g => new RegExp(g.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')),
  ...files.filter(f => /^[^/]+\/CLAUDE\.md$/.test(f)).map(f => new RegExp('\\b' + f.split('/')[0] + '\\b', 'i'))];
for (const w of words) if (w.test(shell.replace(/\/skyworld\/[a-z/.]*/g, ''))) fail.push('the sign in screen names ' + w);
ok('the sign in screen names no game, agent or world');

// 3. no secrets
for (const f of files.filter(f => OWN.some(re => re.test(f)))) {
  const t = fs.readFileSync(ROOT + f, 'utf8');
  if (/gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk_(live|test)_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{10,}/.test(t)) fail.push('a token in ' + f);
  for (const m of t.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]+/g)) {
    let role = null; try { role = JSON.parse(Buffer.from(m[1], 'base64url').toString()).role; } catch (e) {}
    if (role !== 'anon') fail.push('a ' + (role || 'unknown') + ' key in ' + f);
  }
}
ok('no secret in its files');

// 4. the refusal
const fn = f => { const s = fs.readFileSync(ROOT + f, 'utf8'); const i = s.indexOf('async function notFound('); return i < 0 ? null : s.slice(i, s.indexOf('\n}\n', i) + 2); };
const mine = fn('functions/skyworld/[[path]].js'), theirs = fn('functions/arcade/stumpire/[[path]].js');
if (!mine || mine !== theirs) fail.push('notFound() differs from Stumpire\'s'); else ok('the refusal is Stumpire\'s, byte for byte');

if (fail.length) { for (const f of fail) console.log(' FAIL ' + f); process.exit(1); }
