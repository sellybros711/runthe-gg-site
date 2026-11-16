#!/usr/bin/env node
// CI HEALTH: is every scheduled workflow still doing its job?
//
// The owner's rule (2026-11-16), after a data job failed silently for 13 days and another for 53:
// a scheduled workflow that goes red is flagged the same day, triaged, and handed to the agent
// that owns it. Nothing stays red for more than a day without somebody on it.
//
// This reads, through the GitHub API, the recent scheduled runs of every workflow under
// .github/workflows that has a `schedule:`, and reports four things:
//
//   red         the latest run that finished (cancelled runs aside) failed. With it: since when,
//               the last success, the failing job and step, the error lines from the log, and
//               the owner from .github/ci-owners.json.
//   stopped     no run at all for longer than the schedule allows (a schedule GitHub disabled,
//               a file that stopped parsing). Seasonal jobs are exempt.
//   disabled    the workflow is switched off in GitHub.
//   unowned     a scheduled workflow with no entry in .github/ci-owners.json.
//
// And one warning that does not fail the run: a job whose recent runs were all cancelled, so it
// has not finished one lately (the live scoring jobs queue behind each other on purpose).
//
// KNOWN NOISE IS RE-RUN ONCE. A failure in the runner's own setup (Set up job, an actions/* step,
// or no step ran at all) is not the job's fault. With --rerun, its failed jobs are re-run, on the
// first attempt only and only for a run under a day old. A second failure is real.
//
// Usage:
//   node scripts/qa/ci-health.mjs --out report.md --json report.json [--rerun]
//                                        needs GH_TOKEN (or GITHUB_TOKEN) and GITHUB_REPOSITORY
//   node scripts/qa/ci-health.mjs --check-owners   offline: every schedule has an owner
//   node scripts/qa/ci-health.mjs --self-test      offline: the rules, on made-up runs
//
// Exit 0: all clear. Exit 1: something is red, stopped, disabled or unowned. Exit 2: could not ask.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WF_DIR = path.join(ROOT, '.github/workflows');
const OWNERS = path.join(ROOT, '.github/ci-owners.json');
const DAY = 864e5;

// ── reading the repository ─────────────────────────────────────────────────────

export function scheduledWorkflows(dir = WF_DIR) {
  const out = [];
  for (const f of fs.readdirSync(dir).sort()) {
    if (!/\.ya?ml$/.test(f)) continue;
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    if (!/^\s*schedule:/m.test(text)) continue;
    const crons = [...text.matchAll(/^\s*-\s*cron:\s*['"]([^'"]+)['"]/gm)].map(m => m[1].trim());
    out.push({ file: f, crons });
  }
  return out;
}

export function readOwners(file = OWNERS) {
  return JSON.parse(fs.readFileSync(file, 'utf8')).workflows || {};
}

export function ownerProblems(scheduled, owners) {
  const files = new Set(scheduled.map(w => w.file));
  const missing = scheduled.filter(w => !owners[w.file]?.owner).map(w => w.file);
  // An entry for a file that no longer has a schedule is stale, and would hide a rename.
  const extra = Object.keys(owners).filter(f => !files.has(f));
  return { missing, extra };
}

// ── the rules ──────────────────────────────────────────────────────────────────

// How long a gap the schedule allows before "no run at all" means it stopped, from the cron
// fields alone: a fixed month is yearly, a fixed day of month is monthly, a day of week is weekly,
// anything else at least daily. One day of slack on top, because GitHub's cron is best effort.
export function allowedGapDays(crons) {
  let days = Infinity;
  for (const c of crons) {
    const [, , dom = '*', mon = '*', dow = '*'] = c.split(/\s+/);
    const d = mon !== '*' ? 370 : dom !== '*' ? 32 : dow !== '*' ? 8 : 2;
    days = Math.min(days, d);
  }
  return days === Infinity ? null : days;
}

const FAILED = new Set(['failure', 'timed_out', 'startup_failure']);
const NEUTRAL = new Set(['cancelled', 'skipped', 'neutral', 'stale']);

// runs: newest first, as the API lists them. Only completed runs decide the state.
export function classify(runs) {
  const done = runs.filter(r => r.status === 'completed');
  const decisive = done.filter(r => !NEUTRAL.has(r.conclusion));
  const lastSuccess = decisive.find(r => r.conclusion === 'success') || null;
  const res = { state: 'none', lastSuccess: lastSuccess?.created_at || null, run: null,
    redSince: null, streak: 0, atLeast: false, allCancelled: false };
  if (done.length >= 4 && decisive.length === 0) res.allCancelled = true;
  if (!decisive.length) return res;
  if (!FAILED.has(decisive[0].conclusion)) { res.state = 'green'; return res; }
  res.state = 'red';
  res.run = decisive[0];
  let i = 0;
  while (i < decisive.length && FAILED.has(decisive[i].conclusion)) i++;
  res.streak = i;
  res.redSince = decisive[i - 1].created_at;
  res.atLeast = i === decisive.length;   // every run we fetched failed: it began earlier still
  return res;
}

export function stopped(runs, crons, seasonal, now = Date.now()) {
  if (seasonal) return null;
  const gap = allowedGapDays(crons);
  if (gap == null) return null;
  const newest = runs[0]?.created_at ? Date.parse(runs[0].created_at) : null;
  if (newest == null) return { days: null, gap };
  const days = (now - newest) / DAY;
  return days > gap ? { days: Math.floor(days), gap } : null;
}

// A failure that happened before the job's own work began: the runner, or a stock action.
export function infraFailure(job) {
  if (!job) return false;
  if (job.conclusion === 'startup_failure') return true;
  const steps = job.steps || [];
  if (!steps.length) return true;
  const bad = steps.find(s => FAILED.has(s.conclusion));
  if (!bad) return false;
  return /^(Set up job|Run actions\/|Post Run actions\/|Complete job)/i.test(bad.name);
}

export function shouldRerun(run, job, now = Date.now()) {
  return infraFailure(job) && (run.run_attempt || 1) === 1 && now - Date.parse(run.created_at) < DAY;
}

// The lines worth reading in a job log. In order of preference:
//   1. what the job itself said failed: an ::error annotation, or a line saying FAIL, not ok,
//      Error: or failing (how this repo's checks report a broken rule),
//   2. failing that, the tail of the job's own output, before the runner's cleanup.
// Never the runner's boilerplate: "Process completed with exit code 1" says only that it failed,
// and the Node 20 deprecation warning is on every job.
const NOISE = /Process completed with exit code|Node\.js \d+ is deprecated|DeprecationWarning|trace-deprecation/;
const SAYS_FAIL = /##\[error\]|::error|^\s*(FAIL|not ok|Error:|error:|AssertionError)|\bFAIL\b|\bfailing\b|\bfailed:/;
export function errorLines(log, max = 10) {
  let lines = String(log || '').split(/\r?\n/)
    .map(l => l.replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z\s?/, '').replace(/\x1b\[[0-9;]*m/g, ''));
  const cleanup = lines.findIndex(l => /^Post job cleanup\.|^##\[group\]Run actions\/(upload|cache)/.test(l));
  const own = cleanup > 0 ? lines.slice(0, cleanup) : lines;
  const clean = l => l.replace(/^##\[(error|notice|warning)\]/, '').replace(/^::(error|warning|notice)[^:]*::/, '').trim();
  const said = lines.filter(l => SAYS_FAIL.test(l) && !NOISE.test(l)).map(clean).filter(Boolean);
  const pick = said.length ? said
    : own.filter(l => l.trim() && !/^##\[(group|endgroup)\]/.test(l) && !NOISE.test(l)).map(clean).slice(-max);
  return [...new Set(pick)].slice(-max).map(l => l.slice(0, 300));
}

// ── asking GitHub ──────────────────────────────────────────────────────────────

function client() {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) throw new Error('needs GH_TOKEN (or GITHUB_TOKEN) and GITHUB_REPOSITORY');
  // GITHUB_API_URL is set by Actions (and lets a test point this at a local stand in).
  const base = `${process.env.GITHUB_API_URL || 'https://api.github.com'}/repos/${repo}`;
  const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28', 'user-agent': 'runthe-gg-ci-health' };
  async function call(p, opts = {}) {
    const r = await fetch(base + p, { headers, ...opts });
    if (!r.ok) throw new Error(`${opts.method || 'GET'} ${p}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    return r;
  }
  return {
    repo,
    json: async p => (await call(p)).json(),
    text: async p => (await call(p)).text(),
    post: async p => call(p, { method: 'POST' }),
  };
}

async function inspect(gh, wf, owners, rerun) {
  const own = owners[wf.file] || {};
  const item = { file: wf.file, owner: own.owner || null, seasonal: !!own.seasonal };
  const meta = await gh.json(`/actions/workflows/${wf.file}`);
  item.name = meta.name;
  item.disabled = meta.state && meta.state !== 'active' ? meta.state : null;
  const { workflow_runs: runs = [] } = await gh.json(`/actions/workflows/${wf.file}/runs?event=schedule&per_page=100`);
  item.fetched = runs.length;
  Object.assign(item, classify(runs));
  item.stopped = stopped(runs, wf.crons, item.seasonal);
  if (item.state === 'red') {
    const run = item.run;
    item.runUrl = run.html_url;
    item.attempt = run.run_attempt || 1;
    const { jobs = [] } = await gh.json(`/actions/runs/${run.id}/jobs?filter=latest&per_page=50`);
    // Every failed job, not just the first: a nightly with eleven jobs can fail in three.
    const failed = jobs.filter(j => FAILED.has(j.conclusion));
    const list = failed.length ? failed : jobs.slice(0, 1);
    item.failed = [];
    for (const job of list) {
      const f = { job: job.name, step: (job.steps || []).find(s => FAILED.has(s.conclusion))?.name || null, infra: infraFailure(job) };
      if (item.failed.length < 3) {
        try { f.errors = errorLines(await gh.text(`/actions/jobs/${job.id}/logs`), 6); }
        catch (e) { f.errors = [`(the log could not be read: ${e.message.slice(0, 120)})`]; }
      }
      item.failed.push(f);
    }
    item.infra = list.length > 0 && item.failed.every(f => f.infra);
    const job = list[0] || null;
    if (rerun && item.infra && shouldRerun(run, job)) {
      try { await gh.post(`/actions/runs/${run.id}/rerun-failed-jobs`); item.rerun = true; }
      catch (e) { item.rerun = `failed: ${e.message.slice(0, 120)}`; }
    }
  }
  delete item.run;
  return item;
}

// ── the report ─────────────────────────────────────────────────────────────────

const day = iso => (iso ? iso.slice(0, 10) : 'never');

export function report(items, unowned, repo) {
  const red = items.filter(i => i.state === 'red');
  const stop = items.filter(i => i.stopped);
  const off = items.filter(i => i.disabled);
  const cancelled = items.filter(i => i.allCancelled);
  const out = [];
  const bad = red.length + stop.length + off.length + unowned.missing.length;
  out.push(bad ? `**${red.length} red, ${stop.length} stopped, ${off.length} disabled, ${unowned.missing.length} unowned** of ${items.length} scheduled workflows.`
    : `All ${items.length} scheduled workflows are green.`);
  // One machine-readable line, so the workflow can tell a newly red job from one already reported.
  out.push(`<!-- ci-health red: ${red.map(i => i.file).join(',')} -->`, '');
  if (red.length) {
    out.push('## Red', '', '| workflow | owner | red since | last success | failing step | run |', '|---|---|---|---|---|---|');
    for (const i of red) {
      const since = `${i.atLeast ? 'before ' : ''}${day(i.redSince)} (${i.streak}${i.atLeast ? '+' : ''} runs)`;
      const step = (i.failed || []).map(f => [f.job, f.step].filter(Boolean).join(' · ')).join('; ') || '-';
      const runCol = `[attempt ${i.attempt}](${i.runUrl})${i.rerun === true ? ' · re-run started' : ''}`;
      const ok = i.lastSuccess ? day(i.lastSuccess) : `none in the last ${i.fetched ?? i.streak} runs`;
      out.push(`| \`${i.file}\` | ${i.owner || '**nobody**'} | ${since} | ${ok} | ${step} | ${runCol} |`);
    }
    for (const i of red) {
      out.push('', `### \`${i.file}\` (${i.owner || 'no owner'})`, '');
      if (i.infra) out.push(`The runner failed before the job's own work began.${i.rerun === true ? ' It was re-run once. A second failure is real.' : ''}`, '');
      if (typeof i.rerun === 'string') out.push(`The re-run could not be started (${i.rerun}).`, '');
      for (const f of i.failed || []) {
        if (!f.errors) { out.push(`Job \`${f.job}\` also failed (log not read).`); continue; }
        out.push(`Job \`${f.job}\`, step "${f.step || '?'}":`, '', '```', ...(f.errors.length ? f.errors : ['(no error lines found)']), '```', '');
      }
    }
  }
  if (stop.length) {
    out.push('', '## Stopped firing', '');
    for (const i of stop) out.push(`- \`${i.file}\` (${i.owner || 'no owner'}): ${i.stopped.days == null ? 'no scheduled run on record' : `no scheduled run for ${i.stopped.days} days`}, and its schedule allows ${i.stopped.gap}.`);
  }
  if (off.length) {
    out.push('', '## Disabled', '');
    for (const i of off) out.push(`- \`${i.file}\` (${i.owner || 'no owner'}): ${i.disabled}.`);
  }
  if (unowned.missing.length || unowned.extra.length) {
    out.push('', '## Owners map', '');
    for (const f of unowned.missing) out.push(`- \`${f}\` runs on a schedule and has no owner in \`.github/ci-owners.json\`.`);
    for (const f of unowned.extra) out.push(`- \`${f}\` is in \`.github/ci-owners.json\` but has no schedule (renamed or removed?).`);
  }
  if (cancelled.length) {
    out.push('', '## Only cancelled lately (a warning, not a failure)', '');
    for (const i of cancelled) out.push(`- \`${i.file}\` (${i.owner}): its recent runs were all cancelled. Last success ${day(i.lastSuccess)}.`);
  }
  const green = items.filter(i => i.state === 'green' && !i.stopped && !i.disabled).map(i => `\`${i.file}\``);
  if (green.length) out.push('', `Green: ${green.join(', ')}.`);
  const none = items.filter(i => i.state === 'none' && !i.allCancelled).map(i => `\`${i.file}\``);
  if (none.length) out.push('', `No finished scheduled run on record: ${none.join(', ')}.`);
  if (repo) out.push('', `Owners: \`.github/ci-owners.json\`. Script: \`scripts/qa/ci-health.mjs\` in ${repo}.`);
  return { md: out.join('\n') + '\n', bad };
}

// ── self-test ──────────────────────────────────────────────────────────────────

function selfTest() {
  let n = 0;
  const eq = (a, b, what) => {
    n++;
    if (JSON.stringify(a) !== JSON.stringify(b)) { console.error(`FAIL ${what}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); process.exit(1); }
  };
  const R = (conclusion, created_at, status = 'completed') => ({ conclusion, created_at, status });
  eq(allowedGapDays(['17 9 * * *']), 2, 'daily');
  eq(allowedGapDays(['0 10 * * 1']), 8, 'weekly');
  eq(allowedGapDays(['0 11 1 * *']), 32, 'monthly');
  eq(allowedGapDays(['0 9 5 7 *']), 370, 'yearly');
  eq(allowedGapDays(['0 9 5 7 *', '23 * * * *']), 2, 'tightest wins');
  eq(allowedGapDays([]), null, 'no cron');

  const red = classify([R('failure', '2026-11-15'), R('cancelled', '2026-11-14'), R('failure', '2026-11-13'),
    R('success', '2026-11-12'), R('failure', '2026-11-11')]);
  eq([red.state, red.streak, red.redSince, red.lastSuccess, red.atLeast], ['red', 2, '2026-11-13', '2026-11-12', false], 'red streak skips cancelled');
  const allRed = classify([R('failure', '2026-11-15'), R('failure', '2026-11-14')]);
  eq([allRed.streak, allRed.atLeast, allRed.lastSuccess], [2, true, null], 'red past the page');
  eq(classify([R(null, '2026-11-16', 'in_progress'), R('success', '2026-11-15'), R('failure', '2026-11-14')]).state, 'green', 'in progress ignored');
  const canc = classify([R('cancelled', 'd'), R('cancelled', 'c'), R('cancelled', 'b'), R('cancelled', 'a')]);
  eq([canc.state, canc.allCancelled], ['none', true], 'all cancelled warns');
  eq(classify([R('cancelled', 'b'), R('success', 'a')]).allCancelled, false, 'a success is not all cancelled');
  eq(classify([R('timed_out', 'b')]).state, 'red', 'timed out is red');

  const now = Date.parse('2026-11-16T12:00:00Z');
  eq(stopped([R('success', '2026-11-15T09:00:00Z')], ['17 9 * * *'], false, now), null, 'daily, ran yesterday');
  eq(stopped([R('success', '2026-11-10T09:00:00Z')], ['17 9 * * *'], false, now), { days: 6, gap: 2 }, 'daily, six days silent');
  eq(stopped([R('success', '2026-11-01T09:00:00Z')], ['17 9 * * *'], true, now), null, 'seasonal exempt');
  eq(stopped([], ['17 9 * * *'], false, now), { days: null, gap: 2 }, 'never ran');

  const job = (name, conclusion = 'failure') => ({ conclusion: 'failure', steps: [{ name: 'Set up job', conclusion: 'success' }, { name, conclusion }] });
  eq(infraFailure(job('Run actions/checkout@v4')), true, 'checkout is infra');
  eq(infraFailure({ conclusion: 'failure', steps: [{ name: 'Set up job', conclusion: 'failure' }] }), true, 'set up job is infra');
  eq(infraFailure({ conclusion: 'failure', steps: [] }), true, 'no steps is infra');
  eq(infraFailure(job('Rebuild the corpus')), false, 'a real step is not');
  eq(infraFailure(job('Install', 'failure')), false, 'an install of ours is not');
  const fresh = { created_at: new Date(Date.now() - 3600e3).toISOString(), run_attempt: 1 };
  eq(shouldRerun(fresh, job('Run actions/checkout@v4')), true, 'rerun fresh infra');
  eq(shouldRerun({ ...fresh, run_attempt: 2 }, job('Run actions/checkout@v4')), false, 'never twice');
  eq(shouldRerun({ ...fresh, created_at: '2026-01-01T00:00:00Z' }, job('Run actions/checkout@v4')), false, 'never an old run');
  eq(shouldRerun(fresh, job('Rebuild the corpus')), false, 'never a real failure');

  const log = ['2026-11-15T19:01:02.1234567Z ##[group]Run node x.mjs', '2026-11-15T19:01:03.1Z doing things',
    '2026-11-15T19:01:04.1Z ::error::fantasy-pipeline is not on \'main\'.', '2026-11-15T19:01:04.2Z ##[error]Process completed with exit code 1.'].join('\n');
  eq(errorLines(log), ["fantasy-pipeline is not on 'main'."], 'error annotations, not the exit code');
  const sport = ['2026-11-15T19:02:08.69Z   ok   154 men held as several records',
    '2026-11-15T19:02:08.78Z   FAIL 1 related names nobody has decided: NFL Mike Jordan / Michael Jordan',
    '2026-11-15T19:02:09.00Z 1 problem', '2026-11-15T19:02:09.01Z ##[error]Process completed with exit code 1.',
    '2026-11-15T19:02:09.03Z Post job cleanup.', '2026-11-15T19:02:09.3Z ##[warning]Node.js 20 is deprecated.'].join('\n');
  eq(errorLines(sport), ['FAIL 1 related names nobody has decided: NFL Mike Jordan / Michael Jordan'], 'a FAIL line from a check');
  eq(errorLines('x\n1 problem\n##[error]Process completed with exit code 2.\nPost job cleanup.\ngit version'), ['x', '1 problem'], 'tail stops at cleanup');
  eq(errorLines('a\nb\n\nc', 2), ['b', 'c'], 'tail when nothing says FAIL');

  const rep = report([{ file: 'a.yml', owner: 'QA Agent', state: 'red', streak: 3, atLeast: false, redSince: '2026-11-13T01:00:00Z',
    lastSuccess: '2026-11-12T01:00:00Z', failed: [{ job: 'build', step: 'Rebuild', errors: ['boom'] }], attempt: 1, runUrl: 'u' },
  { file: 'b.yml', owner: 'QA Agent', state: 'green' }], { missing: ['c.yml'], extra: [] });
  eq(rep.bad, 2, 'report counts red and unowned');
  eq(/<!-- ci-health red: a\.yml -->/.test(rep.md), true, 'report marks the red list');
  const dashes = new RegExp('[' + String.fromCharCode(0x2014, 0x2013) + ']');
  eq(dashes.test(rep.md), false, 'no long dashes in the report');

  const p = ownerProblems([{ file: 'a.yml' }, { file: 'b.yml' }], { 'a.yml': { owner: 'x' }, 'z.yml': { owner: 'y' } });
  eq(p, { missing: ['b.yml'], extra: ['z.yml'] }, 'owner problems');
  console.log(`ci-health self-test: ${n} checks pass`);
}

// ── main ───────────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  const flag = f => argv.includes(f);
  const opt = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
  if (flag('--self-test')) return selfTest();

  const scheduled = scheduledWorkflows();
  const owners = readOwners();
  const unowned = ownerProblems(scheduled, owners);
  if (flag('--check-owners')) {
    for (const f of unowned.missing) console.error(`::error::${f} runs on a schedule and has no owner in .github/ci-owners.json`);
    for (const f of unowned.extra) console.error(`::error::${f} is in .github/ci-owners.json but has no schedule`);
    if (unowned.missing.length || unowned.extra.length) process.exit(1);
    console.log(`ci owners ok: ${scheduled.length} scheduled workflows, each with an owner`);
    return;
  }

  let gh;
  try { gh = client(); } catch (e) { console.error(e.message); process.exit(2); }
  const items = [];
  for (const wf of scheduled) {
    try { items.push(await inspect(gh, wf, owners, flag('--rerun'))); }
    catch (e) { console.error(`${wf.file}: ${e.message}`); process.exit(2); }
  }
  const { md, bad } = report(items, unowned, gh.repo);
  if (opt('--out')) fs.writeFileSync(opt('--out'), md);
  if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify({ items, unowned }, null, 2));
  process.stdout.write(md);
  process.exit(bad ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
