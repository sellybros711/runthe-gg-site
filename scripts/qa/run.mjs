#!/usr/bin/env node
/* The QA agent's runner: every game's checks, one report.

   node scripts/qa/run.mjs                              smoke tier, every game
   node scripts/qa/run.mjs --game hoops,football        some games
   node scripts/qa/run.mjs --tier full                  every check the globs in suites.json find
   node scripts/qa/run.mjs --only fantasy               only commands containing a word
   node scripts/qa/run.mjs --list                       print what would run, run nothing
   node scripts/qa/run.mjs --jobs 3 --out report.md     parallel runs, report to a file

   It starts the static servers the browser checks expect (8080 and 8099 as python's http.server,
   8081 as cfb's gzip_server, which is what CI serves the college game with), runs each check with a
   timeout, and writes a markdown report: a table per game and the tail of every failure.

   It never fixes anything. A FAIL here is a claim to investigate, and the first question is
   whether main fails the same way (the QA agent's spec in the knowledge base says how). A check
   that needs a browser is SKIPPED, not failed, when Playwright cannot be loaded, and the report says
   so: install it with `npm install --no-save playwright` and run again. SQL suites need a Postgres
   server and are left to CI. */
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SUITES = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/qa/suites.json'), 'utf8'));
const args = process.argv.slice(2);
const opt = (f, d) => { const i = args.indexOf(f); return i < 0 ? d : args[i + 1]; };
const has = (f) => args.includes(f);
const tier = opt('--tier', 'smoke');
const jobs = Math.max(1, +opt('--jobs', 2));
const only = opt('--only', null);
const out = opt('--out', null);
const timeoutMin = +opt('--timeout', 20);
const games = (opt('--game', null) || Object.keys(SUITES.games).join(',')).split(',').map(s => s.trim()).filter(Boolean);
for (const g of games) if (!SUITES.games[g]) { console.error(`unknown game "${g}". Known: ${Object.keys(SUITES.games).join(', ')}`); process.exit(2); }

// --- what to run --------------------------------------------------------------------------------
function glob(pattern) {
  const dir = path.dirname(pattern), re = new RegExp('^' + path.basename(pattern).replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs).filter(f => re.test(f)).sort().map(f => `node ${dir}/${f}`);
}
const fileOf = (cmd) => (cmd.match(/node\s+(\S+\.m?js)/) || [])[1];
const excluded = (cmd) => SUITES.exclude.some(x => (fileOf(cmd) || '').includes(x));
const plan = [];
for (const g of games) {
  const G = SUITES.games[g], cmds = [...G.smoke];
  if (tier === 'full') for (const p of G.full) {
    // A file runs once. A command written out in `full` replaces smoke's (check-putt --quick becomes
    // the full run); a file a glob finds keeps smoke's arguments if smoke already runs it.
    if (p.startsWith('node ')) { const f = fileOf(p), i = cmds.findIndex(x => fileOf(x) === f); if (i >= 0) cmds[i] = p; else cmds.push(p); continue; }
    for (const c of glob(p)) if (!cmds.some(x => fileOf(x) === fileOf(c))) cmds.push(c);
  }
  for (const cmd of cmds) if (!excluded(cmd) && (!only || cmd.includes(only))) plan.push({ game: g, cmd });
}
if (has('--list')) { for (const p of plan) console.log(`${p.game.padEnd(10)} ${p.cmd}`); console.log(`\n${plan.length} checks`); process.exit(0); }

// --- what each check needs ----------------------------------------------------------------------
let playwright = true;
try { createRequire(path.join(ROOT, 'package.json'))('playwright'); } catch { playwright = false; }
const src = (cmd) => { const f = fileOf(cmd); try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { return ''; } };
for (const p of plan) {
  const s = src(p.cmd), f = fileOf(p.cmd);
  p.browser = /playwright/.test(s);
  p.ports = [...new Set([...s.matchAll(/(?:localhost|127\.0\.0\.1):(8080|8081|8099)\b/g)].map(m => m[1]))];
  if (!f || !fs.existsSync(path.join(ROOT, f))) p.skip = `missing file ${f}`;
  else if (p.browser && !playwright) p.skip = 'needs Playwright (npm install --no-save playwright)';
}

// --- servers ------------------------------------------------------------------------------------
const free = (port) => new Promise(r => { const s = net.createServer().once('error', () => r(false)).once('listening', () => s.close(() => r(true))).listen(port, '127.0.0.1'); });
const up = async (port) => { for (let i = 0; i < 50; i++) { if (!(await free(port))) return true; await new Promise(r => setTimeout(r, 200)); } return false; };
const servers = [];
async function serve(port) {
  if (!(await free(port))) return; // something already serves it; use that
  const [cmd, a] = port === 8081 ? ['node', ['cfb/build/test/gzip_server.mjs']] : ['python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1']];
  const ch = spawn(cmd, a, { cwd: ROOT, stdio: 'ignore' });
  servers.push(ch);
  if (!(await up(port))) console.error(`could not start a server on ${port}`);
}
const needPorts = [...new Set(plan.filter(p => !p.skip).flatMap(p => p.ports))];
for (const port of needPorts) await serve(port);
const stop = () => servers.forEach(s => { try { s.kill(); } catch {} });
process.on('exit', stop);
process.on('SIGINT', () => { stop(); process.exit(130); });

// --- run ----------------------------------------------------------------------------------------
function run(p) {
  return new Promise((resolve) => {
    if (p.skip) return resolve({ ...p, result: 'SKIP', secs: 0, tail: p.skip });
    const t0 = Date.now();
    const ch = spawn('bash', ['-c', p.cmd], { cwd: ROOT, env: { ...process.env, CI: '1' } });
    let buf = '';
    const keep = (d) => { buf += d; if (buf.length > 200000) buf = buf.slice(-100000); };
    ch.stdout.on('data', keep); ch.stderr.on('data', keep);
    const timer = setTimeout(() => { ch.kill('SIGKILL'); }, timeoutMin * 60000);
    ch.on('close', (code, sig) => {
      clearTimeout(timer);
      const secs = Math.round((Date.now() - t0) / 1000);
      const result = sig === 'SIGKILL' ? 'TIMEOUT' : code === 0 ? 'PASS' : 'FAIL';
      const lines = buf.trimEnd().split('\n');
      resolve({ ...p, result, secs, tail: lines.slice(result === 'PASS' ? -1 : -30).join('\n') });
    });
  });
}
const results = [];
const queue = [...plan];
const started = Date.now();
await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => {
  while (queue.length) {
    const r = await run(queue.shift());
    results.push(r);
    console.error(`${r.result.padEnd(7)} ${String(r.secs).padStart(4)}s  ${r.game.padEnd(10)} ${r.cmd}`);
  }
}));
stop();

// --- report -------------------------------------------------------------------------------------
const order = new Map(plan.map((p, i) => [p.cmd + p.game, i]));
results.sort((a, b) => order.get(a.cmd + a.game) - order.get(b.cmd + b.game));
const count = (rs, k) => rs.filter(r => r.result === k).length;
const L = [];
L.push(`# QA run: ${tier} tier`, '');
L.push(`${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC, ${Math.round((Date.now() - started) / 60000)} min, ${results.length} checks.`);
if (!playwright) L.push('', '**Playwright was not available, so every browser check was skipped.** Install it with `npm install --no-save playwright` and run again.');
L.push('', '| game | pass | fail | timeout | skip | CI runs it |', '|---|---|---|---|---|---|');
for (const g of games) {
  const rs = results.filter(r => r.game === g);
  L.push(`| ${SUITES.games[g].name} | ${count(rs, 'PASS')} | ${count(rs, 'FAIL')} | ${count(rs, 'TIMEOUT')} | ${count(rs, 'SKIP')} | ${SUITES.games[g].ci === false ? '**no**' : 'yes'} |`);
}
const bad = results.filter(r => r.result === 'FAIL' || r.result === 'TIMEOUT');
L.push('', bad.length ? `## ${bad.length} not passing` : '## Everything ran passed');
for (const r of bad) L.push('', `### ${r.result}: \`${r.cmd}\``, '', `${SUITES.games[r.game].name}, ${r.secs}s.`, '', '```', r.tail.replace(/```/g, "'''"), '```');
const skipped = results.filter(r => r.result === 'SKIP');
if (skipped.length) { L.push('', '## Skipped', ''); for (const r of skipped) L.push(`- \`${r.cmd}\`: ${r.tail}`); }
L.push('', '## Every check', '', '| result | secs | game | command |', '|---|---|---|---|');
for (const r of results) L.push(`| ${r.result} | ${r.secs} | ${r.game} | \`${r.cmd}\` |`);
const report = L.join('\n') + '\n';
if (out) { fs.writeFileSync(out, report); console.error(`\nreport written to ${out}`); } else process.stdout.write(report);
process.exit(bad.length ? 1 : 0);
