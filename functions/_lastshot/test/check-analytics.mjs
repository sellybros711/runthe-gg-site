#!/usr/bin/env node
/* The tester round's events (analytics.js) in Chromium, on a phone (390x844,
 * touch). POST /last-shot/e is routed with page.route and every body kept;
 * the Daily runs against the Arcade Lab's real handler in memory
 * (test/fake-arcade.mjs) and the cloud saves are in memory, as in
 * check-daily.mjs and check-starters.mjs.
 *
 * Covers: open (first true, then false on a reload, the entry), a free Run
 * It (run n:1, then result with outcome, how and look), Share and Save, Plays,
 * a level (level_open, run and result with the level), the Daily (practice
 * runs, then the scored shot and daily_filed, its share), a Beat my play link
 * (beat_open, Watch their play sends no run, my run is mode beat, its share,
 * a bad link), the contract on every body (s, t, at most 40 events, p at
 * most 600 characters, only the ten names), a full queue of 20 sending by
 * itself, the 15 s timer, hiding the page sending by sendBeacon, garbage and
 * a throwing localStorage, inert under a driver unless asked, and the dev
 * server's 204 for a tester and 404 for anybody else.
 *
 *   node functions/_lastshot/test/check-analytics.mjs */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import './setup-playbook.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (_) { for (const p of ['/opt/node22/lib/node_modules/playwright', '/root/node-tools/node_modules/playwright']) { try { ({ chromium } = require(p)); break; } catch (e) {} } }
if (!chromium) { console.error('playwright is not installed'); process.exit(2); }
const EXE = process.env.CHROMIUM || ['/opt/pw-browsers/chromium'].find(f => fs.existsSync(f)) || undefined;
import { startDev } from '../build/dev-server.mjs';
import { fakeArcade } from './fake-arcade.mjs';
import { dailyConfig, dailyScenario } from '../daily.js';
import { encode, challengeScenario } from '../challenge.js';
import { NAMES, MAX_POST, MAX_P } from '../analytics.js';
import { dateKey, seedFor } from '../../_arcadelab/shared/seed.js';

const PORT = 8798, BASE = 'http://localhost:' + PORT;
const { server, events: devEvents } = await startDev(PORT);
const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
let fails = 0;
const ok = (c, m) => { console.log((c ? ' ok   ' : ' FAIL ') + m); if (!c) fails++; };

/* The day, and a play that is legal on its set (check-daily.mjs's). */
const TODAY = dateKey(Date.now()), SEED = seedFor(TODAY, 'last-shot'), CFG = dailyConfig(SEED), DSC = dailyScenario(CFG);
const P = (x, y) => ({ x, y });
function dayPlay(tx = 36, ty = 22) {
  const a = DSC.spots.O2, scr = P((a.x + tx) / 2, (a.y + ty) / 2);
  return { spots: DSC.spots, goAt: Math.min(DSC.clock, 5), steps: [{ kind: 'screen', who: 'O5', pts: [scr] }, { kind: 'move', who: 'O2', pts: [P(scr.x - 1, scr.y - 1), P(tx, ty)] },
    { kind: 'pass', from: 'O1', to: 'O2' }, { kind: 'shoot', who: 'O2' }] };
}
/* A challenge (check-beat.mjs's): 12.0, down 1, the box, they go under. */
const BASEC = { clock: 12, down: 1, set: 'box', scheme: 'under', seed: 987654 };
const BSC = challengeScenario(BASEC);
const mk = (tx, ty, g) => ({ spots: BSC.spots, goAt: g, steps: [{ kind: 'screen', who: 'O5', pts: [P(31, 12.3)] }, { kind: 'move', who: 'O2', pts: [P(40, 6), P(tx, ty)] },
  { kind: 'pass', from: 'O1', to: 'O2' }, { kind: 'shoot', who: 'O2' }] });
const CODE = encode({ ...BASEC, play: mk(22, 24, 6) });

const fake = fakeArcade({ uidOf: h => (/^Bearer tok-dev$/.test(h.authorization || '') ? 'dev' : null) });

/* A context: signed in (the arcade's sign in stood in), the cloud in memory,
   the arcade routed to the fake, /last-shot/e routed into posts.
   on: set window.__lastShotAnalytics. throwing: a localStorage that throws. */
async function context({ on = true, throwing = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await ctx.addInitScript(({ on, throwing }) => {
    if (on) window.__lastShotAnalytics = true;
    /* the share sheet would wait on a person: copy instead */
    try { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); } catch (e) {}
    window.__beacons = [];
    const send = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (u, d) => { window.__beacons.push({ u: String(u), type: d && d.type }); return send(u, d); };
    if (throwing) {
      const no = () => { throw new Error('storage off'); };
      Storage.prototype.getItem = no; Storage.prototype.setItem = no; Storage.prototype.removeItem = no;
    }
    const mem = {};
    window.RTG_SAVE = { API_VERSION: 1, idle: () => true, signedIn: () => true,
      all: g => Promise.resolve(Object.keys(mem).filter(k => k.startsWith(g + '/')).map(k => ({ slot: k.split('/')[1], progress: mem[k].progress, payload: JSON.parse(JSON.stringify(mem[k].payload)) }))),
      queue: (g, sl, fn) => { const m = fn(); const k = g + '/' + sl; if (!m) return Promise.resolve(null);
        if (mem[k] && mem[k].progress > m.progress) return Promise.resolve({ ok: false, payload: mem[k].payload, progress: mem[k].progress });
        mem[k] = { progress: m.progress, payload: JSON.parse(JSON.stringify(m.payload)) }; return Promise.resolve({ ok: true }); },
      drop: (g, sl) => { delete mem[g + '/' + sl]; return Promise.resolve(null); } };
  }, { on, throwing });
  await ctx.route(/\/arcade\/auth\.js/, r => r.fulfill({ contentType: 'text/javascript', body:
    'window.RTG_AUTH={API_VERSION:1,boot:function(){return true},state:function(){return{ready:true,resolved:true,signedIn:true,userId:"dev"}},onChange:function(f){f(this.state());return function(){}},token:function(){return "tok-dev"}};' }));
  await ctx.route(/\/api\/arcade\//, async r => {
    const q = r.request(), u = new URL(q.url());
    const out = await fake.answer({ method: q.method(), path: u.pathname.slice('/api/arcade/'.length), query: Object.fromEntries(u.searchParams),
      body: q.method() === 'GET' ? null : JSON.parse(q.postData() || '{}'), headers: q.headers() });
    return r.fulfill({ status: out.status, contentType: 'application/json', body: JSON.stringify(out.body) });
  });
  const posts = [];
  await ctx.route(/\/last-shot\/e$/, r => {
    const q = r.request();
    let body = null; try { body = JSON.parse(q.postData() || ''); } catch (e) {}
    posts.push({ method: q.method(), type: q.headers()['content-type'] || '', raw: q.postData() || '', body });
    return r.fulfill({ status: 204, body: '' });
  });
  await ctx.route(/cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com|supabase\.co/, r => r.abort());
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|ERR_BLOCKED|net::/.test(m.text())) errs.push(m.text()); });
  const L = (fn, a) => page.evaluate(fn, a);
  const ready = () => page.waitForFunction(() => window.__lastShot && window.__lastShot.view);
  /* every event so far, in order, with its session */
  const evs = () => posts.flatMap(p => (p.body && Array.isArray(p.body.ev) ? p.body.ev.map(e => ({ ...e, s: p.body.s })) : []));
  /* send the queue, and wait for it to land */
  const flush = async () => { const n = posts.length; await L(() => window.__lastShot.flushEvents()); await page.waitForFunction(() => true); for (let i = 0; i < 40 && posts.length === n; i++) await page.waitForTimeout(50); };
  const runTo = async sel => { await L(id => document.getElementById(id).click(), sel || 'bRun');  /* Run It pulses, so a DOM click */
    await page.waitForSelector('#sheet.on', { timeout: 60000 }); };
  return { ctx, page, posts, errs, L, ready, evs, flush, runTo };
}
const last = (list, n) => list.filter(e => e.n === n).pop();
const fresh = (list, from) => list.slice(from);

/* ---------------- the main play ---------------- */
console.log('\nopen, a free run, share, save, Plays');
const A = await context();
{
  const { page, L, ready, evs, flush, runTo, posts } = A;
  await page.goto(BASE + '/last-shot');
  await ready();
  await L(() => localStorage.setItem('last_shot_speed', '2'));
  await flush();
  let o = last(evs(), 'open');
  ok(!!o && o.p.first === true && o.p.entry === 'home', 'the first boot sends open, first: true, entry home: ' + JSON.stringify(o && o.p));
  ok((await L(() => localStorage.getItem('last_shot_seen'))) != null, 'last_shot_seen is set after it');
  const s1 = o && o.s;
  await page.reload(); await ready();
  await flush();
  o = last(evs(), 'open');
  ok(!!o && o.p.first === false && o.s !== s1, 'a reload sends open, first: false, in a new session');
  ok(/^[A-Za-z0-9-]{8,40}$/.test(o.s), 'the session id: ' + o.s);
  const s2 = o.s;

  // a free Run It: run n:1, then result
  await page.click('#hPlay');
  let from = evs().length;
  await runTo();
  await flush();
  let got = fresh(evs(), from);
  const r1 = last(got, 'run'), res1 = last(got, 'result');
  ok(!!r1 && r1.p.mode === 'free' && r1.p.n === 1 && r1.s === s2 && !('level' in r1.p), 'a free Run It sends run, mode free, n: 1');
  const lr = await L(() => { const r = window.__lastShot.result; return { outcome: r.outcome, how: r.how, p: r.shot ? r.shot.p : null }; });
  ok(!!res1 && res1.p.mode === 'free' && res1.p.outcome === (lr.outcome === 'win' ? 'win' : 'lose') && res1.p.how === lr.how, 'then result, outcome ' + (res1 && res1.p.outcome) + ', how ' + (res1 && res1.p.how));
  ok(!!res1 && (lr.p == null ? res1.p.look === null : res1.p.look === Math.round(lr.p * 100) / 100), 'with the look: ' + (res1 && res1.p.look));
  ok(!!r1 && !!res1 && got.indexOf(r1) < got.indexOf(res1) && Number.isInteger(r1.t) && res1.t > r1.t, 'run before result, t in whole ms (' + (r1 && r1.t) + ', ' + (res1 && res1.t) + ')');

  // Share and Save on the free card
  from = evs().length;
  await page.click('#bShare');
  await page.click('#bSavePlay');
  await page.waitForFunction(() => document.getElementById('bSavePlay').textContent === 'Saved · Open', null, { timeout: 8000 });
  await flush();
  got = fresh(evs(), from);
  ok(got.some(e => e.n === 'share' && e.p.kind === 'result'), 'Share sends share, kind result');
  ok(got.some(e => e.n === 'save' && e.p.mode === 'free'), 'Save this play sends save, mode free');

  // Plays
  await page.click('#bBack');
  from = evs().length;
  await page.click('#bPlays');
  await page.click('[data-starter=spain]');
  if (await page.isVisible('#playsReplace')) await page.click('#playsReplace');
  await flush();
  got = fresh(evs(), from);
  ok(got.some(e => e.n === 'plays_load' && e.p.starter === 'spain'), 'Plays sends plays_load, starter spain');

  // a level: level_open, then run and result with the level
  console.log('\na level');
  from = evs().length;
  await L(() => window.__lastShot.openLadder());
  await page.click('[data-level="1-1"]');
  await L(() => window.__lastShot.loadStarter('pin-down'));
  await runTo();
  await flush();
  got = fresh(evs(), from);
  const lo = got.find(e => e.n === 'level_open'), r2 = last(got, 'run'), res2 = last(got, 'result');
  ok(!!lo && lo.p.level === '1-1', 'level_open, level 1-1');
  ok(!!r2 && r2.p.mode === 'level' && r2.p.level === '1-1' && r2.p.n === 2, 'run, mode level, level 1-1, n: 2');
  const stars = await L(() => Number(document.getElementById('card').dataset.stars));
  ok(!!res2 && res2.p.mode === 'level' && res2.p.level === '1-1' && res2.p.stars === stars, 'result, mode level, level 1-1, stars ' + (res2 && res2.p.stars));
  ok(got.indexOf(lo) < got.indexOf(r2), 'level_open comes first');

  // the Daily: practice, then the scored shot
  console.log('\nthe Daily');
  await page.waitForFunction(() => window.__lastShot.dayState === 'ok', null, { timeout: 10000 });
  from = evs().length;
  await L(() => window.__lastShot.openDaily());
  await L(p => window.__lastShot.setPlay(p), dayPlay());
  await L(() => window.__lastShot.board.draw());
  for (let i = 0; i < 2; i++) { await runTo(); await page.click('#bBack'); }
  await flush();
  got = fresh(evs(), from);
  const dopen = got.find(e => e.n === 'daily_open');
  ok(!!dopen && dopen.p.played === false, 'daily_open, played: false');
  const pr = got.filter(e => e.n === 'run'), pres = got.filter(e => e.n === 'result');
  ok(pr.length === 2 && pr.every(e => e.p.mode === 'practice') && pr[0].p.n === 3 && pr[1].p.n === 4, 'two practice runs, mode practice, n 3 and 4');
  ok(pres.length === 2 && pres.every(e => e.p.mode === 'practice' && !('stars' in e.p)), 'their results are mode practice');
  ok(!got.some(e => e.n === 'daily_filed'), 'practice files nothing');
  from = evs().length;
  await page.click('#bShot');
  await page.click('#bShotYes');
  await page.waitForSelector('#card.daily', { timeout: 60000 });
  await page.click('#bDayShare');
  await flush();
  got = fresh(evs(), from);
  const dr = last(got, 'run'), df = got.find(e => e.n === 'daily_filed'), dres = last(got, 'result');
  const filed = fake.posts[fake.posts.length - 1];
  ok(!!dr && dr.p.mode === 'daily' && dr.p.n === 5, 'the scored shot: run, mode daily, n: 5');
  ok(!!df && Number.isInteger(df.p.score) && filed && df.p.score === filed.score, 'daily_filed with the score filed: ' + (df && df.p.score));
  const dstars = await L(() => Number(document.getElementById('card').dataset.stars));
  ok(!!dres && dres.p.mode === 'daily' && dres.p.stars === dstars, 'result, mode daily, stars ' + (dres && dres.p.stars));
  ok(got.some(e => e.n === 'share' && e.p.kind === 'daily'), 'the daily Share sends share, kind daily');
  from = evs().length;
  await L(() => window.__lastShot.openDaily());
  await flush();
  const dopen2 = fresh(evs(), from).find(e => e.n === 'daily_open');
  ok(!!dopen2 && dopen2.p.played === true, 'opened again: daily_open, played: true');

  // a full queue sends by itself
  from = posts.length;
  await L(() => { for (let i = 0; i < 20; i++) window.__lastShot.loadStarter(i % 2 ? 'floppy' : 'spain'); });
  for (let i = 0; i < 40 && posts.length === from; i++) await page.waitForTimeout(50);
  const full = posts.slice(from).find(p => p.body && p.body.ev.length >= 20);
  ok(!!full && full.body.ev.filter(e => e.n === 'plays_load').length >= 19, 'twenty queued events send without a flush');

  // hiding the page sends by sendBeacon
  console.log('\nhiding the page');
  await L(() => window.__lastShot.openLadder());
  const b0 = await L(() => window.__beacons.length), p0 = posts.length;
  await page.click('[data-level="1-1"]');
  await L(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.visibilityState;
  });
  for (let i = 0; i < 40 && posts.length === p0; i++) await page.waitForTimeout(50);
  const beacons = await L(() => window.__beacons.slice());
  const bp = posts.slice(p0).find(p => p.body && p.body.ev.some(e => e.n === 'level_open'));
  ok(beacons.length === b0 + 1 && /\/last-shot\/e$/.test(beacons[beacons.length - 1].u) && /^text\/plain/.test(beacons[beacons.length - 1].type || ''), 'visibilitychange to hidden calls sendBeacon with a text/plain Blob');
  ok(!!bp && /^text\/plain/.test(bp.type), 'the beacon lands with the queued level_open (' + (bp && bp.type) + ')');
  await page.click('#back');
  const b1 = await L(() => window.__beacons.length);
  await L(() => window.__lastShot.loadStarter('spain'));
  await L(() => window.dispatchEvent(new Event('pagehide')));
  ok((await L(() => window.__beacons.length)) === b1 + 1, 'pagehide sends by sendBeacon too');
  await L(() => { const n = window.__beacons.length; window.dispatchEvent(new Event('pagehide')); window.__emptyHide = window.__beacons.length === n; });
  ok(await L(() => window.__emptyHide), 'an empty queue sends nothing');

  // a Beat my play link: beat_open, Watch is no run, my run is mode beat
  console.log('\nBeat my play');
  await page.goto('about:blank');   // a new page load, not a hash change
  await page.goto(BASE + '/last-shot#beat=' + CODE);
  await ready();
  await page.waitForSelector('#vBeat:not([hidden])');
  await flush();
  got = evs();
  const bo = last(got, 'open'), bb = last(got, 'beat_open');
  ok(!!bo && bo.p.entry === 'beat' && bo.p.first === false, 'open, entry beat');
  ok(!!bb && bb.p.ok === true && bb.s === bo.s && got.indexOf(bo) < got.indexOf(bb), 'then beat_open, ok: true');
  const s3 = bo.s;
  await page.click('#bWatch');
  await page.waitForSelector('#sheet.on', { timeout: 60000 });
  await flush();
  ok(!evs().some(e => e.s === s3 && (e.n === 'run' || e.n === 'result')), 'Watch their play sends no run and no result');
  await page.click('#bDraw2');
  await L(p => window.__lastShot.setPlay(p), mk(14, 16, 6));
  await runTo();
  await page.click('#bBeat');
  await flush();
  got = evs().filter(e => e.s === s3);
  const br = got.filter(e => e.n === 'run');
  ok(br.length === 1 && br[0].p.mode === 'beat' && br[0].p.n === 1, 'my run: run, mode beat, n: 1');
  ok(got.some(e => e.n === 'result' && e.p.mode === 'beat'), 'and its result, mode beat');
  ok(got.some(e => e.n === 'share' && e.p.kind === 'beat'), 'Beat my play sends share, kind beat');
  await page.click('#bWatchAgain');
  await page.waitForSelector('#sheet.on', { timeout: 60000 });
  await flush();
  ok(evs().filter(e => e.s === s3 && e.n === 'run').length === 1, 'Watch theirs from my card is no run either');
  await page.goto(BASE + '/last-shot#beat=nope!!');
  await page.waitForSelector('#beatBad');
  await flush();
  const bad = last(evs(), 'beat_open');
  ok(!!bad && bad.p.ok === false && bad.s === s3, 'a bad link: beat_open, ok: false');

  // the contract, on every body sent
  const bodies = posts.map(p => p.body);
  ok(posts.length > 5 && posts.every(p => p.method === 'POST'), posts.length + ' posts, all POST');
  ok(bodies.every(b => b && /^[A-Za-z0-9-]{8,40}$/.test(b.s) && Array.isArray(b.ev) && b.ev.length >= 1 && b.ev.length <= MAX_POST), 'every body: s, and 1 to ' + MAX_POST + ' events');
  ok(evs().every(e => NAMES.includes(e.n) && Number.isInteger(e.t) && e.t >= 0 && e.p && typeof e.p === 'object' && JSON.stringify(e.p).length <= MAX_P), 'every event: a known name, a whole t, p within ' + MAX_P + ' characters');
  ok(posts.filter(p => !/^text\/plain/.test(p.type)).every(p => /^application\/json/.test(p.type)), 'fetch posts are application/json');
  const names = [...new Set(evs().map(e => e.n))].sort();
  ok(NAMES.every(n => names.includes(n)), 'all ten names were sent: ' + names.join(' '));
  ok(A.errs.length === 0, 'no console errors' + (A.errs.length ? ': ' + A.errs.join(' | ') : ''));
  await A.ctx.close();
}

/* ---------------- garbage, a throwing localStorage, the timer ---------------- */
console.log('\ngarbage and the timer');
{
  const G = await context();
  const { page, L, ready, evs, flush, posts, errs } = G;
  await page.goto(BASE + '/last-shot');
  await ready();
  await L(() => { for (const k of ['last_shot_ladder', 'last_shot_play_v1', 'last_shot_daily', 'last_shot_beat', 'last_shot_speed']) localStorage.setItem(k, '{{not json'); localStorage.removeItem('last_shot_seen'); });
  await page.reload(); await ready();
  await flush();
  ok(last(evs(), 'open') && last(evs(), 'open').p.first === true, 'garbage in the other keys: open still says first: true');
  await L(() => localStorage.setItem('last_shot_seen', '\u0000{[garbage'));
  await page.reload(); await ready();
  // the 15 s timer: nothing flushed by hand this time
  const n0 = posts.length;
  const t0 = Date.now();
  await page.waitForFunction(() => true);
  for (let i = 0; i < 200 && !posts.slice(n0).some(p => p.body && p.body.ev.some(e => e.n === 'open')); i++) await page.waitForTimeout(100);
  const waited = Date.now() - t0;
  const timed = posts.slice(n0).find(p => p.body && p.body.ev.some(e => e.n === 'open'));
  ok(!!timed && timed.body.ev.find(e => e.n === 'open').p.first === false, 'a garbage last_shot_seen: open, first: false');
  ok(!!timed && waited > 12000 && waited < 19000 && /^application\/json/.test(timed.type), 'the 15 s timer sent it by itself (' + waited + ' ms)');
  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await G.ctx.close();

  const T = await context({ throwing: true });
  await T.page.goto(BASE + '/last-shot');
  await T.ready();
  await T.flush();
  const to = last(T.evs(), 'open');
  ok(!!to && to.p.first === false && to.p.entry === 'home', 'a localStorage that throws: open, first: false');
  ok(!T.errs.some(e => /analytics/.test(e)), 'and nothing thrown from analytics');
  await T.ctx.close();
}

/* ---------------- inert under a driver ---------------- */
console.log('\ninert');
{
  const I = await context({ on: false });
  const { page, L, ready, posts, runTo } = I;
  await page.goto(BASE + '/last-shot');
  await ready();
  await L(() => localStorage.setItem('last_shot_speed', '2'));
  await page.click('#hPlay');
  await runTo();
  await L(() => { window.__lastShot.flushEvents(); window.dispatchEvent(new Event('pagehide')); });
  await page.reload(); await ready();
  await page.waitForTimeout(400);
  ok(posts.length === 0 && (await L(() => window.__beacons.length)) === 0, 'navigator.webdriver without __lastShotAnalytics: nothing sent');
  ok(await L(() => localStorage.getItem('last_shot_seen') == null), 'and last_shot_seen is not touched');
  await I.ctx.close();
}

/* ---------------- the dev server's endpoint ---------------- */
console.log('\nthe dev endpoint');
{
  const body = JSON.stringify({ s: 'abcdefgh', ev: [{ n: 'open', t: 1, p: { first: false, entry: 'home' } }] });
  const n0 = devEvents.length;
  const a = await fetch(BASE + '/last-shot/e?as=dev', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body });
  ok(a.status === 204 && devEvents.length === n0 + 1 && devEvents[n0].body.s === 'abcdefgh', 'a tester: 204, and the body kept');
  const b = await fetch(BASE + '/last-shot/e?as=nobody', { method: 'POST', body });
  ok(b.status === 404 && devEvents.length === n0 + 1, 'anybody else: the 404, nothing kept');
  await fetch(BASE + '/last-shot?as=dev');
}

await browser.close();
server.close();
console.log(fails ? '\n' + fails + ' failed' : '\nall ok');
process.exit(fails ? 1 : 0);
