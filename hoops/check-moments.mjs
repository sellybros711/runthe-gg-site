/*
 * Run The Floor: the games feel alive (Career, phase B).
 *
 *   node hoops/check-moments.mjs            the engine, the frames, and the page
 *   node hoops/check-moments.mjs --quick    the engine and the frames only
 *
 * What phase B added is presentation over an engine that must not change:
 * moving frames drawn by the same rig, a court player, playable moments, the
 * ceremonies and the live ticker. So most of what is held here is a promise
 * that nothing UNDER the picture moved:
 *
 *   a touch of nought is the card the engine always had, byte for byte,
 *   a better release can only turn a miss into a make, never the reverse,
 *   moments are dealt to careers started since they existed and never to a
 *   migrated save (check-saves holds the old engine to its own fixtures),
 *   the ticker shows the games the engine played and nothing else.
 *
 * Then the page: every moment and every ceremony plays to the end on a phone
 * and a desktop, with and without motion, and the meter's button is on the
 * screen where the thumb is.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const require = createRequire(import.meta.url);
const C = require('./career.js');
const B = require('./baller.js');
const QUICK = process.argv.includes('--quick');

const failures = [];
let passed = 0;
function ok(cond, what) { if (cond) passed++; else failures.push(what); }
function section(t) { console.log(`\n${t}\n${'-'.repeat(t.length)}`); }
const clone = (x) => JSON.parse(JSON.stringify(x));
function play(L, n, extraFor) {
  let g = 0;
  while (!L.retired && g++ < n) {
    if (L.pending.length) {
      const c = L.pending[0];
      const i = (L.steps * 7 + c.key.length * 3 + L.age) % c.options.length;
      C.choose(L, i, extraFor ? extraFor(c) : undefined);
    } else C.step(L);
  }
  return L;
}

section('1. a touch of nought is the card the engine always had');
{
  let same = 0;
  for (let k = 0; k < 40; k++) {
    const a = play(C.newLife({ seed: 'tz' + k, start: k % 2 ? 'hs' : 'draft' }), 900);
    const b = play(C.newLife({ seed: 'tz' + k, start: k % 2 ? 'hs' : 'draft' }), 900, () => ({ touch: 0 }));
    if (JSON.stringify(a) === JSON.stringify(b)) same++;
  }
  ok(same === 40, `forty careers, every card answered with touch 0 and without: identical (${same}/40)`);
}

section('2. a better release only ever turns a miss into a make');
{
  /* Walk careers to a shot card, then answer the same card three ways from
     three clones. The draw is the card's own, so a higher touch can only
     widen what goes in. */
  const order = [];
  let cards = 0, kinds = {};
  for (let k = 0; k < 400 && cards < 260; k++) {
    const L = C.newLife({ seed: 'sh' + k, start: k % 3 === 0 ? 'hs' : 'draft' });
    let g = 0;
    while (!L.retired && g++ < 3000) {
      const c = L.pending[0];
      if (c && (c.id === 'clutch' || c.id === 'amclutch' || (c.id === 'moment' && c.ctx.plays[0]))) {
        const res = [-1, 0, 1].map((t) => C.choose(clone(L), 0, { touch: t }));
        const m = res.map((r) => (typeof r.made === 'number' ? r.made : r.made ? 1 : 0));
        order.push(m[0] <= m[1] && m[1] <= m[2]);
        ok(res.every((r) => r.made != null), `${c.id}: the result says whether it went in`);
        kinds[c.id === 'moment' ? c.ctx.m : c.id] = 1;
        cards++;
        C.choose(L, 0);
        continue;
      }
      if (c) C.choose(L, (L.steps + c.key.length) % c.options.length); else C.step(L);
    }
  }
  ok(cards >= 100, `enough shots to say so (${cards})`);
  ok(order.every(Boolean), `never a make at -1 that misses at +1 (${order.filter((x) => !x).length} out of order)`);
  const want = ['clutch', 'amclutch', 'buzzer', 'ft', 'poster', 'block', 'stop'];
  ok(want.every((w) => kinds[w]), `every playable card came up (${Object.keys(kinds).join(', ')})`);
}

section('3. moments are for careers started since they existed');
{
  const FX = JSON.parse(fs.readFileSync(path.join(HERE, 'build/fixtures/career-v1-saves.json'), 'utf8'));
  let dealt = 0;
  for (const k in FX.saves) {
    const L = play(C.migrate(clone(FX.saves[k])), 600);
    ok(!L.opt.moments, `${k}: a migrated save is not given moments`);
    dealt += (L.log || []).filter((e) => /at the horn|Dunked on|chase-down|last stop|free throws to beat/.test(e.t)).length;
  }
  ok(dealt === 0, `and none is ever dealt to one (${dealt})`);
  const off = play(C.newLife({ seed: 'nomo', start: 'draft', moments: false }), 1500);
  ok(off.opt.moments === false, 'a career can be started without them');
  let n = 0, two = 0;
  for (let k = 0; k < 60; k++) {
    const L = C.newLife({ seed: 'mo' + k, start: 'draft' });
    let g = 0;
    while (!L.retired && g++ < 2000) {
      const c = L.pending[0];
      if (c && c.id === 'moment') { n++; if (c.options.length >= 2) two++; }
      if (c) C.choose(L, 1 % c.options.length); else C.step(L);
    }
  }
  ok(n > 60 && two === n, `moments come up (${n} in 60 careers) and every one offers a real choice (${two})`);
}

section('4. the ticker is the games the engine played');
{
  const L = C.newLife({ seed: 'tick', start: 'draft' });
  let g = 0, chunks = 0, good = 0;
  while (!L.retired && g++ < 600 && chunks < 30) {
    if (L.pending.length) { C.choose(L, 0); continue; }
    const before = L.season ? { w: L.season.w, l: L.season.l, phase: L.phase } : null;
    C.step(L);
    const s = L.season;
    if (before && s && s.box && before.phase !== L.phase && ['early', 'mid', 'late'].includes(L.phase)) {
      chunks++;
      const w = s.box.filter((x) => x[3]).length, l = s.box.length - w;
      if (s.w - before.w === w && s.l - before.l === l) good++;
    }
  }
  ok(chunks >= 10 && good === chunks, `every stretch's games add up to the record it moved (${good}/${chunks})`);
}

section('5. every moving frame is the rig, inside the grid');
{
  const edge = new Set(), missing = new Set(), flat = new Set();
  for (let i = 0; i < 30; i++) {
    const lk = B.lookFor('fr' + i);
    for (const build of ['lean', 'standard', 'strong']) {
      lk.build = build;
      for (const set in B.SETS) for (let f = 0; f < B.SETS[set]; f++) for (const dress of ['', 'suit', 'cap']) {
        const pose = set + f, parts = B.paint(lk, { pose, parts: true, dress });
        const names = new Set();
        for (let y = 0; y < B.H; y++) for (let x = 0; x < B.W; x++) {
          const n = parts[y][x];
          if (!n) continue;
          names.add(n.replace(/-?1$/, ''));
          if (x === 0 || x === B.W - 1 || y === 0 || y === B.H - 1) edge.add(pose + ' ' + build + ' ' + n);
        }
        for (const [need, re] of [['head', /^head$/], ['hand', /hand$/], ['shoe', /^shoe$/]]) if (![...names].some((n) => re.test(n))) missing.add(pose + ' ' + need);
        const cols = new Set(); B.paint(lk, { pose, dress, c1: '#552583', c2: '#FDB927', num: 23 }).forEach((r) => r.forEach((c) => { if (c) cols.add(c); }));
        if (cols.size < 22) flat.add(pose);
      }
    }
  }
  ok(edge.size === 0, `no frame touches the grid's edge (${[...edge].slice(0, 3).join('; ') || 'none'})`);
  ok(missing.size === 0, `every frame has a head, hands and shoes (${[...missing].slice(0, 3).join('; ') || 'all'})`);
  ok(flat.size === 0, `every frame is shaded, not flat (${[...flat].slice(0, 3).join(', ') || 'all'})`);
  const sets = Object.keys(B.SETS);
  ok(['walk', 'dribble', 'shot', 'dunk', 'block', 'cheer', 'sad', 'shake', 'wave'].every((s) => sets.includes(s)), `the nine sets of DESIGN.md section 11 (${sets.join(', ')})`);
  /* A frame differs from its neighbours: a set that repeats itself is not motion. */
  const dull = [];
  const lk = B.lookFor('motion');
  for (const set in B.SETS) for (let f = 1; f < B.SETS[set]; f++) {
    if (JSON.stringify(B.paint(lk, { pose: set + f })) === JSON.stringify(B.paint(lk, { pose: set + (f - 1) }))) dull.push(set + f);
  }
  ok(dull.length === 0, `every frame moves from the one before it (${dull.join(', ') || 'all'})`);
  ok(B.handAt('shot2', 1)[1] < 10 && B.handAt('dribble0', 1)[1] > 34, 'the hand is over the head at the release and low on the dribble');
}

/* ── the page ─────────────────────────────────────────────────────────── */
async function browser() {
  const pw = createRequire('/opt/node22/lib/node_modules/')('playwright');
  const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const SHELL = '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000"><div id=h style="position:relative;width:100vw;height:100vh"></div></body>';
  async function open(w, h, reduced) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
    const page = await ctx.newPage();
    const boom = [];
    page.on('pageerror', (e) => boom.push(String(e).slice(0, 160)));
    await page.route('http://local.test/**', (r) => {
      const f = path.join(ROOT, new URL(r.request().url()).pathname);
      if (f.endsWith('.js') && fs.existsSync(f)) return r.fulfill({ body: fs.readFileSync(f), contentType: 'text/javascript; charset=utf-8' });
      return r.fulfill({ body: SHELL, contentType: 'text/html; charset=utf-8' });
    });
    await page.goto('http://local.test/shell.html');
    for (const s of ['hoops/career-kit.js', 'hoops/baller.js', 'hoops/sound.js', 'hoops/court.js', 'hoops/ticker.js']) await page.addScriptTag({ url: 'http://local.test/' + s });
    return { ctx, page, boom };
  }
  const ME = { look: { skin: 5, hair: 'braids', hc: 0, build: 'strong', shoes: 'club' }, c1: '#00471B', c2: '#EEE1C6', num: 34, age: 26 };

  section('6. every moment plays to the end, on a phone and a desktop');
  for (const [w, h, reduced] of [[390, 640, false], [1280, 720, false], [390, 640, true]]) {
    const { ctx, page, boom } = await open(w, h, reduced);
    const kinds = ['three', 'mid', 'drive', 'pass', 'buzzer', 'ft', 'poster', 'stop', 'block'];
    const res = [];
    for (const kind of kinds) {
      const r = await page.evaluate(({ kind, ME }) => new Promise((done) => {
        const host = document.getElementById('h');
        host.innerHTML = '';
        let asked = 0, t0 = performance.now();
        const m = window.RTF_COURT.moment(host, { kind, rating: 72, rateName: 'Shooting', room: 'nba', c1: ME.c1, c2: ME.c2, oc: '#C8102E', me: ME,
          bug: { home: 'MIL', away: 'CHI', clock: '0:07' }, intro: 'Here we go.', makeCall: 'Yes!', missCall: 'No.' },
          { resolve: (q) => { asked++; window.lastQ = q; return { made: kind === 'ft' ? 1 : asked % 2 === 1 }; }, done: () => { const ms = performance.now() - t0; m.stop(); done({ asked, ms, q: window.lastQ }); } });
        const go = host.querySelector('.ct-go'), rc = go.getBoundingClientRect();
        window.goBox = { top: rc.top, bottom: rc.bottom, vis: !!go.offsetParent };
        setTimeout(() => go.click(), 350);
      }), { kind, ME });
      const box = await page.evaluate(() => window.goBox);
      res.push({ kind, ...r, box });
    }
    ok(res.every((r) => r.asked === 1), `${w}x${h}${reduced ? ' reduced' : ''}: every moment asks the engine exactly once (${res.map((r) => r.kind + ':' + r.asked).join(' ')})`);
    ok(res.every((r) => r.box.vis && r.box.top >= 0 && r.box.bottom <= h), `the meter's button is on the screen (${res.filter((r) => !(r.box.vis && r.box.bottom <= h)).map((r) => r.kind).join(', ') || 'all'})`);
    ok(res.every((r) => r.q >= -1 && r.q <= 1), 'the touch handed over is between -1 and 1');
    ok(res.every((r) => r.ms < (reduced ? 9000 : 14000)), `and each is over in a few seconds (${Math.max(...res.map((r) => Math.round(r.ms)))}ms at most)`);
    ok(boom.length === 0, `no page errors (${boom.join(' | ') || 'none'})`);
    await ctx.close();
  }

  section('7. the meter: the green is the best release, and a steady rating widens it');
  {
    const { ctx, page } = await open(390, 640, false);
    const t = await page.evaluate(() => {
      const T = window.RTF_COURT.touchOf, Z = window.RTF_COURT.zoneFor;
      const z = Z(70);
      const pts = []; for (let p = 0; p <= 1.0001; p += 0.01) pts.push(T(p, z));
      const half = pts.slice(0, 51);
      return { mid: T(0.5, z), edge: T(0.5 + z, z), far: T(0, z), mono: half.every((v, i) => i === 0 || v >= half[i - 1] - 1e-9), wide: Z(95) > Z(70) && Z(70) > Z(40), min: Math.min(...pts), max: Math.max(...pts) };
    });
    ok(t.mid === 1 && Math.abs(t.edge - 0.5) < 1e-9 && t.far === -1, `the middle is 1, the edge of the green a half, the end of the bar -1 (${t.mid}, ${t.edge}, ${t.far})`);
    ok(t.mono, 'closer to the middle is never worse');
    ok(t.wide, 'a better rating is a wider green');
    ok(t.min >= -1 && t.max <= 1, 'the touch never leaves -1 to 1');
    await ctx.close();
  }

  section('8. the ceremonies and the ticker play to the end');
  for (const reduced of [false, true]) {
    const { ctx, page, boom } = await open(390, 700, reduced);
    const names = await page.evaluate(() => Object.keys(window.RTF_COURT.CEREMONY));
    const out = [];
    for (const name of names) {
      const r = await page.evaluate(({ name, ME }) => new Promise((done) => {
        const host = document.getElementById('h'); host.innerHTML = '';
        const t0 = performance.now();
        const room = { jersey: 'draft', hall: 'hall', award: 'draft' }[name] || 'nba';
        const live = window.RTF_COURT.ceremony(host, name, { name: 'Test Name', num: 34, pick: 7, teamName: 'Milwaukee Bucks', nick: 'Bucks', year: 2030, c1: ME.c1, c2: ME.c2, commish: 'Invented Person', from: 2025, to: 2040 },
          { room, me: ME, done: () => { const l3 = host.querySelector('.ct-l3 b'); live.stop(); done({ ms: performance.now() - t0, l3: l3 ? l3.textContent : '' }); } });
        if (!live) done({ ms: -1 });
      }), { name, ME });
      out.push({ name, ...r });
    }
    ok(names.length >= 8, `the ceremonies are there (${names.join(', ')})`);
    ok(out.every((r) => r.ms > 0 && r.ms < 9000), `${reduced ? 'reduced motion' : 'with motion'}: every ceremony ends (${out.map((r) => r.name + ' ' + Math.round(r.ms)).join(', ')})`);
    ok(out.every((r) => r.l3 === 'Test Name'), 'and names the player on the lower third');
    const tk = await page.evaluate(() => new Promise((done) => {
      const games = []; for (let g = 1; g <= 27; g++) games.push({ n: g, opp: 'BOS', home: g % 2 === 0, won: g % 3 !== 0, pts: g === 9 ? 41 : 18, reb: 6, ast: 4, out: g === 14, key: g === 9 });
      const d = { kind: 'rs', label: 'Games 1 to 27', team: 'MIL', c1: '#00471B', c2: '#EEE1C6', w0: 0, l0: 0, games, news: ['the Lakers fire their coach.'] };
      const t0 = performance.now();
      window.RTF_TICKER.play(d, { done: () => done({ ms: performance.now() - t0, rec }) });
      let rec = '';
      const finish = () => { const g = document.querySelector('#tk-go'); if (g && g.textContent === 'Continue') { rec = document.querySelector('#tk-rec').textContent; g.click(); } else setTimeout(finish, 100); };
      document.querySelector('[data-sp="4"]').click();
      setTimeout(finish, 100);
    }));
    ok(tk.rec === '18-9', `the ticker ends on the stretch's own record (${tk.rec})`);
    ok(boom.length === 0, `no page errors (${boom.join(' | ') || 'none'})`);
    await ctx.close();
  }

  section('9. sound is off until it is switched on');
  {
    const { ctx, page } = await open(390, 640, false);
    const s = await page.evaluate(() => ({ on: window.RTF_SOUND.on(), cue: window.RTF_SOUND.cue('swish'), n: window.RTF_SOUND.CUES.length }));
    ok(!s.on && s.cue === false, 'off by default, and a cue does nothing while it is off');
    ok(s.n >= 9, `the cues the design names (${s.n})`);
    await ctx.close();
  }
  await b.close();
}
if (!QUICK) await browser();

console.log(`\n${passed} passed${failures.length ? ', ' + failures.length + ' FAILED' : ''}`);
for (const f of failures) console.log('  FAIL: ' + f);
process.exit(failures.length ? 1 : 0);
