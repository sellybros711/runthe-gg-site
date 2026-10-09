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

function loadCourt() {
  const src = fs.readFileSync(path.join(HERE, 'court.js'), 'utf8');
  const win = { RTF_BALLER: B, RTF_KIT: {}, matchMedia: () => ({ matches: false }), RTF_SOUND: { cue() {}, crowd() {} } };
  new Function('window', 'document', src)(win, { getElementById: () => null, createElement: () => ({ style: {} }), head: { appendChild() {} } });
  return win.RTF_COURT;
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
  const want = ['clutch', 'amclutch', 'buzzer', 'ft', 'poster', 'block', 'stop', 'post', 'lob', 'steal'];
  ok(want.every((w) => kinds[w]), `every playable card came up (${Object.keys(kinds).join(', ')})`);
}

section('2b. a green release goes in, and nothing short of one does');
{
  /* The court only says green for a touch of exactly 1 in a shot meter's gold
     core. The engine has to honour it as a make and ignore it for anything
     less, so a page that sends green with a lesser touch buys nothing. */
  let shots = 0, greenMade = 0, fake = 0, ftBoth = 0, fts = 0;
  for (let k = 0; k < 300 && shots < 160; k++) {
    const L = C.newLife({ seed: 'gr' + k, start: k % 3 === 0 ? 'hs' : 'draft' });
    let g = 0;
    while (!L.retired && g++ < 3000) {
      const c = L.pending[0];
      if (c && (c.id === 'clutch' || c.id === 'amclutch' || (c.id === 'moment' && c.ctx.plays[0]))) {
        if (c.id === 'moment' && c.ctx.m === 'ft') {
          const r = C.choose(clone(L), 0, { touch: 1, touches: [1, 1], greens: [true, true] });
          fts++; if (r.made === 2) ftBoth++;
        } else {
          const r = C.choose(clone(L), 0, { touch: 1, green: true });
          shots++; if (r.made) greenMade++;
          const a = C.choose(clone(L), 0, { touch: 0.6, green: true }), b = C.choose(clone(L), 0, { touch: 0.6 });
          if (JSON.stringify(a) !== JSON.stringify(b)) fake++;
        }
        C.choose(L, 0);
        continue;
      }
      if (c) C.choose(L, (L.steps + c.key.length) % c.options.length); else C.step(L);
    }
  }
  ok(shots >= 80 && greenMade === shots, `every green release is a make (${greenMade}/${shots})`);
  ok(fts === 0 || ftBoth === fts, `two greens at the line are two makes (${ftBoth}/${fts})`);
  ok(fake === 0, `green with a touch under 1 is ignored (${fake} cards moved)`);
}

section('2c. the hold, the launch and the lane, as rules');
{
  const CT = loadCourt();
  const z = CT.zoneFor(74), c = CT.HOLD_C;
  ok(CT.holdTouch(c, z) === 1, 'letting go at the centre of the green is a green release');
  ok(CT.holdTouch(c + z, z) > 0.4 && CT.holdTouch(c - z, z) > 0.4, 'the edges of the green are good, not perfect');
  ok(CT.holdTouch(0.02, z) <= -0.9 && CT.holdTouch(1, z) === -1, 'letting go at once is short, holding to the end is a brick');
  const ramp = []; for (let p = 0; p <= c; p += 0.01) ramp.push(CT.holdTouch(p, z));
  ok(ramp.every((v, i) => i === 0 || v >= ramp[i - 1] - 1e-9), 'holding longer toward the green is never worse');
  const late = []; for (let p = c; p < 1; p += 0.01) late.push(CT.holdTouch(p, z));
  ok(late.every((v, i) => i === 0 || v <= late[i - 1] + 1e-9), 'holding past it is never better');
  ok(CT.zoneFor(90) > CT.zoneFor(74) && CT.zoneFor(74) > CT.zoneFor(50), 'a better shooter has a bigger green');
  const lo = CT.launchLines(55, 0, false), hi = CT.launchLines(90, 0, false), po = CT.launchLines(90, 0, true);
  ok(hi.R < lo.R && hi.H - hi.R > lo.H - lo.R, `more bounce: a lower rim line and a wider dunk window (${lo.R.toFixed(2)}..${lo.H.toFixed(2)} vs ${hi.R.toFixed(2)}..${hi.H.toFixed(2)})`);
  ok(po.H < hi.H, 'a big already at the rim takes time away');
  const L0 = hi;
  const soft = CT.launchTouch((0.18 + L0.R) / 2, L0.R, L0.H), dunk = CT.launchTouch(L0.R + 0.01, L0.R, L0.H), top = CT.launchTouch(L0.H - 0.01, L0.R, L0.H), met = CT.launchTouch(L0.H + 0.01, L0.R, L0.H);
  ok(soft > 0 && soft < dunk && dunk < top && top === 1, `a layup is safe, a dunk is better, waiting to the edge is best (${soft}, ${dunk}, ${top})`);
  ok(met < 0 && CT.launchTouch(0.05, L0.R, L0.H) < 0, `the help getting there first, or no lift at all, is bad (${met})`);
  const w = CT.laneWindow(60);
  ok(CT.laneTouch(1, 1, 'hands', -1, 0, 60) === 1, 'jumping the man who shows his hands is a pick');
  ok(CT.laneTouch(0, 1, 'read', 0, 0, 60) === -0.8 && CT.laneTouch(0, 1, 'hands', -1, 0, 60) < 0, 'biting on the look, or the wrong man, leaves your man open');
  ok(CT.laneTouch(1, 1, 'read', -1, 0, 60) < 0.5 && CT.laneTouch(1, 1, 'read', -1, 0, 60) > 0, 'a guess that happens to be right is a small reward, not a read');
  ok(CT.laneTouch(1, 1, 'thrown', -1, 120, 60) > CT.laneTouch(1, 1, 'thrown', -1, 520, 60), 'after the throw, sooner is better');
  ok(CT.laneWindow(90) > w && w > CT.laneWindow(40), 'a better defender sees the hands sooner');
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

section('3b. a duel career: the game is the team\'s, the moment is yours');
{
  ok(C.newLife({ seed: 'd0', start: 'draft' }).opt.duel === 1, 'a new story career is a duel career');
  ok(!C.newLife({ seed: 'd0', start: 'draft', story: false }).opt.duel, 'a story-off career is not (the replay of 1,000 careers stays byte identical)');
  let nights = 0, match = 0, g7 = { MW: 0, ML: 0, mW: 0, mL: 0 }, read = { best: 0, bestN: 0, worst: 0, worstN: 0 }, looks = 0;
  for (let k = 0; k < 500 && (nights < 120 || g7.ML + g7.mW < 20); k++) {
    const L = C.newLife({ seed: 'dl' + k, start: k % 4 ? 'draft' : 'hs' });
    let g = 0;
    while (!L.retired && g++ < 3000) {
      const c = L.pending[0];
      if (!c) { C.step(L); continue; }
      if (c.id === 'moment' && c.ctx.won != null) {
        nights++;
        const row = (L.season.box || []).find((r) => r[0] === c.ctx.g);
        if (row && row[1] === c.ctx.opp && (row[3] ? 1 : 0) === c.ctx.won) match++;
      }
      if ((c.id === 'clutch' || c.id === 'amclutch') && c.ctx.look) {
        looks++;
        /* the same card, answered with the read and against it, from clones */
        const LK = { drop: [0, 1], switch: [1, 2], chase: [2, 0], double: [3, 1] }[c.ctx.look];
        for (let r = 0; r < 6; r++) {
          const a = clone(L), b = clone(L);
          a.seed += ':r' + r; b.seed += ':r' + r;
          const ra = C.choose(a, LK[0]), rb = C.choose(b, LK[1]);
          read.bestN++; read.best += ra.made ? 1 : 0; read.worstN++; read.worst += rb.made ? 1 : 0;
        }
        const res = C.choose(L, (L.steps + k) % 4);
        g7[(res.made ? 'M' : 'm') + (res.won ? 'W' : 'L')]++;
        continue;
      }
      C.choose(L, (L.steps * 3 + k) % c.options.length);
    }
  }
  ok(nights >= 60 && match === nights, `a regular-season moment is a real game from the stretch, its opponent and result the box score's (${match}/${nights})`);
  ok(looks >= 30, `the defense shows a look on Game 7 and tournament clutch cards (${looks})`);
  ok(read.best / read.bestN > read.worst / read.worstN + 0.1, `reading the look pays: ${(read.best / read.bestN * 100).toFixed(0)}% against ${(read.worst / read.worstN * 100).toFixed(0)}% playing into it`);
  ok(g7.ML > 0 && g7.mW > 0 && g7.MW > g7.ML && g7.mL > g7.mW, `a made shot can still lose and a miss can still win, and the shot still matters (${JSON.stringify(g7)})`);
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
        /* 20 and not 22 since the 3D model: the golf game's paint step is five
           tones a material, so a bald man with no beard in his club's shoes
           really does wear fewer materials, at 20 or 21. Flat is a handful. */
        if (cols.size < 20) flat.add(pose);
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
    const kinds = ['three', 'mid', 'drive', 'pass', 'buzzer', 'ft', 'poster', 'stop', 'block', 'post', 'lob', 'steal', 'drive:euro', 'drive:reverse', 'post:hook', 'post:turn', 'post:dropstep'];
    const res = [];
    for (const [ki, kind] of kinds.entries()) {
      /* half the moments are played as a make and half as a miss, the other
         way round on the second screen, so both endings of each are drawn */
      const flip = (ki + (w > 400 ? 1 : 0)) % 2 === 1;
      const r = await page.evaluate(({ kind, ME, flip }) => new Promise((done) => {
        const host = document.getElementById('h');
        host.innerHTML = '';
        let asked = 0, t0 = performance.now();
        const [k0, variant] = kind.split(':');
        const m = window.RTF_COURT.moment(host, { kind: k0, variant, rating: 72, rateName: 'Shooting', room: 'nba', c1: ME.c1, c2: ME.c2, oc: '#C8102E', me: ME,
          bug: { home: 'MIL', away: 'CHI', clock: '0:07' }, intro: 'Here we go.', makeCall: 'Yes!', missCall: 'No.' },
          { resolve: (q) => { asked++; window.lastQ = typeof q === 'object' ? q.touch : q; return { made: kind === 'ft' ? 1 : flip ? false : asked % 2 === 1 }; }, done: () => { const ms = performance.now() - t0; clearInterval(window.__iv); m.stop(); done({ asked, ms, q: window.lastQ }); } });
        /* a moment can ask for more than one press (two free throws, the
           gather and the rise): press whenever the controls are armed */
        let box = null;
        const iv = setInterval(() => {
          const ctl = host.querySelector('.ct-ctl[data-armed]');
          if (!ctl) return;
          const go = ctl.querySelector('.ct-go'), rc = go.getBoundingClientRect();
          if (!box) box = window.goBox = { top: rc.top, bottom: rc.bottom, vis: !!go.offsetParent };
          if (!ctl.dataset.hit) { ctl.dataset.hit = '1'; setTimeout(() => { go.click(); delete ctl.dataset.hit; }, 450); }
        }, 120);
        window.__iv = iv;
      }), { kind, ME, flip });
      const box = await page.evaluate(() => window.goBox);
      res.push({ kind, ...r, box });
    }
    ok(res.every((r) => r.asked === 1), `${w}x${h}${reduced ? ' reduced' : ''}: every moment asks the engine exactly once (${res.map((r) => r.kind + ':' + r.asked).join(' ')})`);
    ok(res.every((r) => r.box.vis && r.box.top >= 0 && r.box.bottom <= h), `the meter's button is on the screen (${res.filter((r) => !(r.box.vis && r.box.bottom <= h)).map((r) => r.kind).join(', ') || 'all'})`);
    ok(res.every((r) => r.q >= -1 && r.q <= 1), 'the touch handed over is between -1 and 1');
    ok(res.every((r) => r.ms < (reduced ? 12000 : 16000)), `and each is over in a few seconds (${Math.max(...res.map((r) => Math.round(r.ms)))}ms at most)`);
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
    const r = await page.evaluate(() => { const RT = window.RTF_COURT.reactTouch, T = window.RTF_COURT.touchOf, Z = window.RTF_COURT.zoneFor(70);
      const ms = []; for (let m = 0; m <= 1200; m += 10) ms.push(RT(m, 70));
      return { bite: RT(-50, 99), fast: RT(150, 60), late: RT(900, 99), mono: ms.every((v, i) => i === 0 || v <= ms[i - 1] + 1e-9), better: RT(330, 90) > RT(330, 50), core: T(0.5 + Z * 0.29, Z), off: T(0.5 + Z + 0.03, Z) };
    });
    ok(r.bite < 0 && r.fast === 1 && r.late < 0, `a read: pressing before the move is a bite, a quick one perfect, a late one negative (${r.bite}, ${r.fast}, ${r.late})`);
    ok(r.mono && r.better, 'slower is never better, and a better rating buys a little time');
    ok(r.core === 1 && r.off < 0.5 && r.off > 0, `the gold core is perfect and a release just outside the green is worth little (${r.core}, ${r.off.toFixed(2)})`);
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
  section('10. hold to shoot, load to dunk, read the lane: the real presses');
  {
    const { ctx, page, boom } = await open(390, 700, false);
    /* run(kind, variant, how): start a moment, wait for its control, then press
       the way a player does, and hand back what reached the engine */
    const run = (kind, variant, how) => page.evaluate(({ kind, variant, how, ME }) => new Promise((done) => {
      const host = document.getElementById('h'); host.innerHTML = '';
      let got = null;
      const m = window.RTF_COURT.moment(host, { kind, variant, rating: 74, rateName: 'Shooting', c1: ME.c1, c2: ME.c2, oc: '#C8102E', me: ME, seed: 'press' },
        { resolve: (q) => { got = q; return { made: true }; }, done: () => { m.stop(); done({ got, fb: window.__fb || '' }); } });
      const watch = () => {
        const ctl = host.querySelector('.ct-ctl[data-armed]');
        if (!ctl) return setTimeout(watch, 50);
        const go = ctl.querySelector('.ct-go'), kindNow = ctl.dataset.armed;
        const fb = () => { const f = host.querySelector('.ct-fbk'); window.__fb = f ? f.textContent : ''; };
        if (how === 'green' || how === 'early' || how === 'blur' || how === 'key' || how === 'dunk' || how === 'layup') {
          const fill = ctl.querySelector('.ct-fill'), zone = ctl.querySelector('.ct-zone');
          if (how === 'key') document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
          else go.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
          const t0 = performance.now();
          const up = () => {
            if (how === 'blur') window.dispatchEvent(new Event('blur'));
            else if (how === 'key') document.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
            else window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
            setTimeout(fb, 30);
          };
          const loop = () => {
            const f = parseFloat(fill.style.width) || 0;
            if (kindNow === 'launch') {
              const bands = [...ctl.querySelectorAll('.ct-band')].map((b) => [parseFloat(b.style.left), parseFloat(b.style.left) + parseFloat(b.style.width)]);
              const tgt = how === 'layup' ? (bands[0][0] + bands[0][1]) / 2 : (bands[2][0] + bands[2][1]) / 2;
              if (f >= tgt) return up();
            } else {
              const zl = parseFloat(zone.style.left), zw = parseFloat(zone.style.width), c = zl + zw / 2;
              if (how === 'early' && performance.now() - t0 > 60) return up();
              if (how === 'blur' && performance.now() - t0 > 200) return up();
              if ((how === 'green' || how === 'key') && f >= c - zw * 0.08) return up();
            }
            requestAnimationFrame(loop);
          };
          requestAnimationFrame(loop);
        } else if (how === 'lane-hands' || how === 'lane-bite') {
          const lanes = [...ctl.querySelectorAll('.ct-lane')];
          const look = () => {
            const hands = lanes.findIndex((b) => b.classList.contains('hands')), eyes = lanes.findIndex((b) => b.classList.contains('eyes'));
            if (how === 'lane-hands' && hands >= 0) { document.dispatchEvent(new KeyboardEvent('keydown', { key: String(hands + 1), bubbles: true })); return setTimeout(fb, 30); }
            if (how === 'lane-bite' && eyes >= 0 && hands < 0) { lanes[eyes].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); return setTimeout(fb, 30); }
            setTimeout(look, 16);
          };
          look();
        }
      };
      watch();
    }), { kind, variant, how, ME });
    const g = await run('three', 'pullup', 'green');
    ok(g.got && g.got.touch === 1 && g.got.green === true, `held and let go in the gold: a green release (${JSON.stringify(g.got)}, "${g.fb}")`);
    const k = await run('three', 'catch', 'key');
    ok(k.got && k.got.touch >= 0.97 && k.got.green === true, `the same with Space held and let go (${JSON.stringify(k.got)})`);
    const e = await run('mid', 'pullup', 'early');
    ok(e.got && e.got.touch < 0 && !e.got.green, `let go at once: short, and no green (${JSON.stringify(e.got)}, "${e.fb}")`);
    const bl = await run('three', 'pullup', 'blur');
    ok(bl.got && Number.isFinite(bl.got.touch), `losing the window lets go rather than holding for ever (${JSON.stringify(bl.got)})`);
    const f2 = await run('ft', 'ft', 'green');
    ok(f2.got && f2.got.touches && f2.got.touches[0] === 1 && f2.got.greens && f2.got.greens[0] === true && f2.got.greens[1] === false, `free throws are two holds, each judged on its own (${JSON.stringify(f2.got)})`);
    const d = await run('drive', 'dunk', 'dunk');
    ok(d.got && d.got.touch === 1 && d.got.green === true && /down/i.test(d.fb), `a dunk loaded to the edge of the help is thrown down (${JSON.stringify(d.got)}, "${d.fb}")`);
    const l = await run('drive', 'dunk', 'layup');
    ok(l.got && l.got.touch > 0 && l.got.touch < 0.5 && /laid/i.test(l.fb), `let go early and it is laid in, safely (${JSON.stringify(l.got)}, "${l.fb}")`);
    const h = await run('steal', 'lane', 'lane-hands');
    ok(h.got && h.got.touch === 1, `jumping the man who shows his hands is a pick (${JSON.stringify(h.got)}, "${h.fb}")`);
    const bt = await run('steal', 'lane', 'lane-bite');
    ok(bt.got && bt.got.touch < 0.5, `jumping on his eyes alone is never a pick (${JSON.stringify(bt.got)}, "${bt.fb}")`);
    ok(boom.length === 0, `no page errors (${boom.join(' | ') || 'none'})`);
    await ctx.close();
  }
  await b.close();
}
if (!QUICK) await browser();

console.log(`\n${passed} passed${failures.length ? ', ' + failures.length + ' FAILED' : ''}`);
for (const f of failures) console.log('  FAIL: ' + f);
process.exit(failures.length ? 1 : 0);
