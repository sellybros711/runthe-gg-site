/* The Arcade Lab game shell: everything a game's page does that is not the
 * game. The fixed-step loop, input recording, pause, the exit guard, resume,
 * the intro, the result, the board, the share sheet and the countdown.
 *
 * A game hands in its sim (the same module the server replays) and a view:
 *   makeView(env) -> { resize(W, H, DPR), render(alpha, s, prev), snap(s),
 *                      onStart(s), onEvent(e, s), hud(s) }
 * The view never touches the log. It calls env.input({...}) and the shell
 * applies it at the start of the next step, records { f, ... } if the sim
 * took it, and that is exactly what the server will replay.
 */
import { api, session, makeSound, makeHaptics, makeHost, share, countdown, reducedMotion, lsGet, lsSet } from './kit.js';
import { shareText } from './share.js';
import { runTo } from './replay.js';
import { dateKey, dayNumber } from './seed.js';

const DT = 1 / 60;

/* The juice: shake, flash, particles, floating text and shockwave rings,
 * drawn by the shell over whatever the view painted, on the wall clock. None
 * of it can reach the sim: it is handed screen points and paints them. Under
 * reduced motion there is no shake and no flash, and a burst is a few
 * sparks that fade where they are. */
function makeFx(RM) {
  let parts = [], texts = [], rings = [], W = 1, H = 1;
  let shk = 0, shkEnd = 0, shkDur = 1, fl = null, flEnd = 0, flDur = 1, flA = 0.5;
  const now = () => performance.now();
  const PAL = ['#ffd23f', '#ff4fa3', '#50e6ff', '#22B07D', '#E0533D', '#ffffff'];
  return {
    size(w, h) { W = w; H = h; },
    shake(mag, ms) { if (RM) return; const t = now(); if (mag >= shk * Math.max(0, (shkEnd - t) / shkDur)) { shk = mag; shkDur = ms || 300; shkEnd = t + shkDur; } },
    flash(col, ms, a) { if (RM) return; fl = col || '#fff'; flDur = ms || 220; flEnd = now() + flDur; flA = a == null ? 0.45 : a; },
    burst(x, y, o) {
      o = o || {}; const n = Math.round((o.n || 18) * (RM ? 0.35 : 1)), t = now(), cols = o.colors || PAL;
      for (let i = 0; i < n && parts.length < 500; i++) {
        const a = (o.angle != null ? o.angle + (Math.random() - 0.5) * (o.spread || 1.2) : Math.random() * Math.PI * 2);
        const v = RM ? 0 : (o.speed || 220) * (0.35 + Math.random() * 0.75);
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: o.gravity == null ? 380 : o.gravity, born: t,
          life: (o.life || 700) * (0.6 + Math.random() * 0.6), size: (o.size || 3.2) * (0.6 + Math.random() * 0.8),
          col: cols[i % cols.length], shape: o.shape || 'dot', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14 });
      }
    },
    confetti(n) {
      const t = now(); n = Math.round((n || 90) * (RM ? 0.3 : 1));
      for (let i = 0; i < n && parts.length < 500; i++) parts.push({ x: Math.random() * W, y: -10 - Math.random() * H * 0.4,
        vx: (Math.random() - 0.5) * 60, vy: RM ? 0 : 60 + Math.random() * 120, g: RM ? 0 : 40, born: t, life: RM ? 900 : 2600 + Math.random() * 1200,
        size: 3 + Math.random() * 4, col: PAL[i % PAL.length], shape: 'sq', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10, flut: Math.random() * 6 });
    },
    text(x, y, str, col, size) { texts.push({ x, y, str, col: col || '#fff', size: size || 22, born: now() }); if (texts.length > 24) texts.shift(); },
    ring(x, y, col, r) { rings.push({ x, y, col: col || '#fff', r: r || 60, born: now() }); if (rings.length > 24) rings.shift(); },
    offset() {
      const t = now(); if (t >= shkEnd) return { x: 0, y: 0 };
      const k = shk * ((shkEnd - t) / shkDur);
      return { x: (Math.random() * 2 - 1) * k, y: (Math.random() * 2 - 1) * k };
    },
    draw(cx) {
      const t = now();
      if (rings.length) {
        rings = rings.filter(r => t - r.born < 520);
        for (const r of rings) { const u = (t - r.born) / 520; cx.globalAlpha = (1 - u) * 0.9; cx.strokeStyle = r.col; cx.lineWidth = 4 * (1 - u) + 1; cx.beginPath(); cx.arc(r.x, r.y, 6 + r.r * (RM ? 0.6 : Math.sqrt(u)), 0, Math.PI * 2); cx.stroke(); }
      }
      if (parts.length) {
        parts = parts.filter(p => t - p.born < p.life);
        for (const p of parts) {
          const age = (t - p.born) / 1000, u = (t - p.born) / p.life;
          let x = p.x + p.vx * age, y = p.y + p.vy * age + 0.5 * p.g * age * age;
          if (p.flut) x += Math.sin(age * 4 + p.flut) * 14;
          cx.globalAlpha = Math.min(1, (1 - u) * 1.6);
          cx.fillStyle = p.col;
          if (p.shape === 'sq') { cx.save(); cx.translate(x, y); cx.rotate(p.rot + p.vr * age); cx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); cx.restore(); }
          else if (p.shape === 'spark') { cx.strokeStyle = p.col; cx.lineWidth = p.size * 0.6; cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x - p.vx * 0.03, y - (p.vy + p.g * age) * 0.03); cx.stroke(); }
          else { cx.beginPath(); cx.arc(x, y, p.size * (1 - u * 0.5), 0, Math.PI * 2); cx.fill(); }
        }
      }
      if (texts.length) {
        texts = texts.filter(x => t - x.born < 900);
        cx.textAlign = 'center'; cx.textBaseline = 'middle';
        for (const x of texts) {
          const u = (t - x.born) / 900, s = u < 0.15 ? 0.6 + u / 0.15 * 0.55 : 1.15 - Math.min(0.15, (u - 0.15));
          cx.globalAlpha = Math.min(1, (1 - u) * 2);
          cx.font = '800 ' + Math.round(x.size * (RM ? 1 : s)) + 'px Outfit, sans-serif';
          const y = x.y - (RM ? 0 : u * 46);
          cx.lineWidth = 4; cx.strokeStyle = 'rgba(0,0,0,.55)'; cx.strokeText(x.str, x.x, y);
          cx.fillStyle = x.col; cx.fillText(x.str, x.x, y);
        }
      }
      cx.globalAlpha = 1;
      if (fl && t < flEnd) { cx.globalAlpha = flA * ((flEnd - t) / flDur); cx.fillStyle = fl; cx.fillRect(-20, -20, W + 40, H + 40); cx.globalAlpha = 1; }
    },
    clear() { parts = []; texts = []; rings = []; shkEnd = 0; flEnd = 0; }
  };
}
const $ = id => document.getElementById(id);
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function bootGame(def) {
  const { sim } = def;
  const DEBUG = /[?&]debug=1/.test(location.search);
  const RM = reducedMotion();
  const sound = makeSound(), haptics = makeHaptics(), host = makeHost($('host')), fx = makeFx(RM);
  const cv = $('c'), cx = cv.getContext('2d'), stage = $('stage');
  let today = null, mode = 'daily', cfg = null, seed = 0;
  let S = null, prev = null, log = [], queue = [];
  let running = false, paused = false, finishing = false, startedAt = 0, resumedMs = 0;
  let fps = 0, W = 0, H = 0, DPR = 1, counting = false, cdTimer = 0, beatShown = false;
  const SAVE_KEY = 'arcade_lab_save_' + def.id, BEST_KEY = 'arcade_lab_best_' + def.id;
  /* A personal best on this device, the HI on the cabinet. */
  const best = () => { const v = +lsGet(BEST_KEY, '0'); return isFinite(v) ? v : 0; };

  const env = {
    canvas: cv, ctx: cx, stage, sound, haptics, host, fx, DEBUG, RM,
    input(obj) { if (running && !paused && S && !S.over && queue.length < 8) queue.push(obj); },
    playing() { return running && !paused && !!S && !S.over; },
    state() { return S; },
    size() { return { W, H, DPR }; },
    fps() { return fps; },
    pop(text, bg) {
      const p = $('pop'); p.textContent = text; p.style.background = bg || '#141414';
      p.classList.remove('on'); void p.offsetWidth; p.classList.add('on');
    },
    hint(t) { $('hint').textContent = t || ''; },
    debug(text) {
      if (!DEBUG) return;
      let d = $('dbg'); if (!d) { d = document.createElement('div'); d.id = 'dbg'; d.className = 'dbg'; stage.appendChild(d); }
      d.textContent = 'fps ' + fps.toFixed(0) + '  seed ' + seed + '  frame ' + (S ? S.frame : 0) + '\n' + text;
    }
  };
  const view = def.makeView(env);

  function resize() {
    const r = stage.getBoundingClientRect();
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    cv.width = W * DPR; cv.height = H * DPR;
    fx.size(W, H);
    view.resize(W, H, DPR);
  }

  /* ---- the loop ---- */
  let last = 0, acc = 0, fpsT = 0, fpsN = 0, saveAt = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!last) last = ts;
    const dt = Math.min(0.25, (ts - last) / 1000); last = ts;
    fpsN++; fpsT += dt; if (fpsT >= 0.5) { fps = fpsN / fpsT; fpsN = 0; fpsT = 0; }
    if (running && !paused && S && !S.over) {
      acc += dt;
      while (acc >= DT && running) { tick(); acc -= DT; }
    }
    cx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const o = fx.offset();
    if (o.x || o.y) { cx.fillStyle = '#07050d'; cx.fillRect(0, 0, W, H); cx.setTransform(DPR, 0, 0, DPR, o.x * DPR, o.y * DPR); }
    view.render(running ? acc / DT : 1, S, prev);
    fx.draw(cx);
  }
  function tick() {
    while (queue.length) {
      const q = queue.shift(), inp = { f: S.frame, ...q };
      if (sim.applyInput(S, inp)) { log.push(inp); if (view.onInput) view.onInput(inp, S); }
    }
    prev = view.snap(S);
    sim.step(S);
    if (S.phase !== undefined && stage.dataset.phase !== S.phase) stage.dataset.phase = S.phase;   // for the browser checks
    for (const e of S.events || []) view.onEvent(e, S);
    if (S.events && S.events.length) {
      paintHud();
      const b = best();
      if (!beatShown && b > 0 && S.score > b) {
        beatShown = true; sound.play('best'); env.pop('NEW HIGH SCORE', '#ff4fa3'); host.say('New high score!'); fx.confetti(60);
      }
    }
    if (mode === 'daily' && S.frame - saveAt >= 60) { saveAt = S.frame; save(); }
    if (S.over) finish();
  }
  /* A counter that changed this paint bumps, the way a lit digit rolls. */
  function paintHud() {
    const el = $('stats'), old = [...el.querySelectorAll('.stat b')].map(b => b.textContent);
    const b = best();
    el.innerHTML = view.hud(S) + (b > 0 ? '<div class="stat hi"><b>' + esc(sim.scoreText(b, cfg)) + '</b><span>Your best</span></div>' : '');
    if (!RM && old.length) el.querySelectorAll('.stat').forEach((d, i) => { const v = d.querySelector('b'); if (v && old[i] != null && old[i] !== v.textContent) d.classList.add('bump'); });
  }

  /* ---- a daily left mid-way comes back where it was ---- */
  function save() {
    if (!today) return;
    lsSet(SAVE_KEY, JSON.stringify({ date: today.dateKey, seed, log, frame: S.frame, ms: resumedMs + (performance.now() - startedAt) }));
  }
  function loadSave() {
    try { const v = JSON.parse(lsGet(SAVE_KEY, 'null')); return v && today && v.date === today.dateKey && v.seed === today.seed ? v : null; } catch (e) { return null; }
  }
  function clearSave() { lsSet(SAVE_KEY, 'null'); }

  /* ---- pause, and never lose a run to a back swipe ---- */
  function pause() { if (running && S && !S.over) { paused = true; queue = []; if (view.onPause) view.onPause(); $('pause').classList.add('on'); if (mode === 'daily') save(); } }
  function resume() { paused = false; last = 0; $('pause').classList.remove('on'); }
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  addEventListener('blur', pause);
  addEventListener('pagehide', () => { if (running && mode === 'daily' && S && !S.over) save(); });
  $('pause').addEventListener('click', resume);
  $('pause').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') resume(); });
  const midRun = () => running && S && !S.over && log.length > 0;
  const LEAVE = 'Leave this run? A daily picks up where you left it.';
  addEventListener('beforeunload', e => { if (midRun()) { if (mode === 'daily') save(); e.preventDefault(); e.returnValue = ''; } });
  addEventListener('popstate', () => {
    if (midRun() && !confirm(LEAVE)) { history.pushState({ lab: 1 }, ''); return; }
    location.href = '/arcade/';
  });
  $('back').addEventListener('click', e => { if (midRun() && !confirm(LEAVE)) e.preventDefault(); });
  $('mute').setAttribute('aria-pressed', String(sound.muted));
  $('mute').addEventListener('click', () => { sound.unlock(); $('mute').setAttribute('aria-pressed', String(sound.toggle())); });
  addEventListener('pointerdown', () => sound.unlock(), { capture: true });
  addEventListener('keydown', () => sound.unlock(), { capture: true });

  /* ---- screens ---- */
  const sheet = html => { $('card').innerHTML = html; $('sheet').classList.add('on'); };
  const closeSheet = () => $('sheet').classList.remove('on');
  const practiceCfg = () => def.practiceCfg ? def.practiceCfg(today) : cfg;
  /* Practice: a random seed, never scored. A game whose day is content (a
     prompt, a theme) practises on a past board, and only after today's run. */
  const canPractice = () => (!def.practiceAfterDaily || !!(today && today.played)) && (!def.practiceCfg || !!def.practiceCfg(today));

  function intro() {
    host.set('idle');
    const sv = loadSave();
    const noDay = def.needsConfig && !today.config;
    const b = best();
    sheet('<div class="marq">' + esc(def.name) + '</div>' +
      '<div class="hiline"><span>Daily <b>#' + today.dayNumber + '</b></span>' + (b > 0 ? '<span>Your best <b>' + esc(sim.scoreText(b, cfg)) + '</b></span>' : '<span>1 credit</span>') + '</div>' +
      '<p class="rule">' + esc(def.rule) + '</p>' +
      (today.config && today.config.rule ? '<p class="today">Today: ' + esc(today.config.rule) + '</p>' : '') +
      (noDay ? '<p class="today">No board is published for today yet. Check back soon.</p>' : '') +
      '<p class="mut">' + esc(def.howto) + '</p>' +
      '<div class="row">' + (noDay ? '' : sv ? '<button class="btn go" id="bPlay">Resume today\'s run</button>' : '<button class="btn go" id="bPlay">Play today</button>') +
      (canPractice() ? '<button class="btn alt" id="bPrac">Practice</button>' : '') + '</div>' +
      (def.practiceAfterDaily && !canPractice() ? '<p class="mut">Practice opens after today\'s run.</p>' : '') +
      (noDay ? '' : '<p class="press" aria-hidden="true">PRESS START</p>') +
      '<label class="toggle"><input type="checkbox" id="hap"' + (haptics.on ? ' checked' : '') + '> Vibrate</label>');
    if ($('bPlay')) { $('bPlay').classList.add('pulse'); $('bPlay').onclick = () => { sound.unlock(); sound.play('coin'); start('daily', sv); }; }
    if ($('bPrac')) $('bPrac').onclick = () => { sound.unlock(); sound.play('coin'); start('practice'); };
    $('hap').onchange = () => haptics.toggle();
  }

  function start(m, sv) {
    sound.unlock();
    mode = m;
    if (m === 'daily') { seed = today.seed; cfg = today.config; }
    else { seed = crypto.getRandomValues(new Uint32Array(1))[0]; cfg = practiceCfg(); }
    if (sv) { S = runTo(sim, seed, cfg, sv.log, sv.frame); log = sv.log.slice(); resumedMs = sv.ms || 0; }
    else { S = sim.create(seed, cfg); log = []; resumedMs = 0; if (m === 'daily') api('POST', def.id + '/start', {}).catch(() => {}); }
    prev = null; queue = []; finishing = false; saveAt = S.frame; beatShown = false;
    running = false; paused = false; acc = 0; last = 0;
    $('pchip').hidden = m !== 'practice';
    fx.clear(); closeSheet(); view.onStart(S); paintHud();
    history.pushState({ lab: 1 }, '');
    /* A daily opens on 3, 2, 1, GO, the way a cabinet counts you in. Nothing
       is running yet, so no input lands and the clock has not started.
       Practice is free play and starts on the tap. */
    if (m === 'daily') countIn(go); else go();
  }
  function go() {
    running = true; paused = false; acc = 0; last = 0; startedAt = performance.now();
    stage.dataset.phase = S.phase || 'play';
    if (document.hidden) pause();
  }
  function countIn(done) {
    const el = $('cd3'); clearTimeout(cdTimer); counting = true; host.set('nervous');
    const steps = ['3', '2', '1', 'GO!'], gap = RM ? 380 : 520;
    let i = 0;
    const next = () => {
      if (i >= steps.length) { el.classList.remove('on'); el.innerHTML = ''; counting = false; host.set('idle'); done(); return; }
      el.innerHTML = '<b>' + steps[i] + '</b>'; el.classList.add('on');
      sound.play(i === steps.length - 1 ? 'go' : 'count');
      if (i === steps.length - 1) haptics.buzz(20);
      i++; cdTimer = setTimeout(next, i === steps.length ? gap * 0.7 : gap);
    };
    next();
  }

  async function finish() {
    if (finishing) return; finishing = true; running = false;
    const durationMs = Math.round(resumedMs + performance.now() - startedAt);
    const d = sim.detail(S);
    const local = { score: S.score, scoreText: sim.scoreText(S.score, cfg), detail: d, squares: sim.squares(d, cfg), gems: 0,
      dayNumber: today ? today.dayNumber : dayNumber(dateKey(Date.now())) };
    if (view.onOver) view.onOver(S);
    fx.text(W / 2, H * 0.42, 'GAME OVER', '#ffffff', 40);
    await new Promise(r => setTimeout(r, RM ? 200 : 750));
    if (mode !== 'daily') return showResult(local, false, 'Practice run. Not scored and no gems.');
    sheet('<h2>Checking the board...</h2>');
    const r = await api('POST', def.id + '/run', { mode: 'daily', dateKey: today.dateKey, seed: today.seed, inputs: log,
      score: S.score, durationMs, clientVersion: def.version }).catch(() => ({ status: 0 }));
    if (r.status === 200) { clearSave(); today.played = r.data.result; showResult(r.data.result, true, null, r.data.gems); }
    else {
      if (r.status === 409) clearSave();
      showResult(local, false, r.status === 409 ? 'You already played today.' :
        'This run did not save (' + ((r.data && r.data.error) || 'network') + '). Nothing was scored.', null, r.status === 0);
    }
  }

  function showResult(res, saved, note, total, retry) {
    running = false;
    const d = res.detail || {};
    const sq = res.squares || sim.squares(d, cfg);
    const st = res.scoreText || sim.scoreText(res.score, cfg);
    const text = shareText(def.name, res.dayNumber, st, sq);
    const prevBest = best(), fresh = !shown.has(res);
    shown.add(res);
    const isBest = fresh && res.score > prevBest && res.score > 0;
    if (res.score > prevBest) lsSet(BEST_KEY, String(res.score));
    sheet('<h2>' + (saved ? 'Today\'s run' : mode === 'practice' ? 'Practice' : 'Run over') + '</h2>' +
      (isBest ? '<div class="newbest">NEW HIGH SCORE</div>' : '') +
      '<div class="score" id="fscore">' + esc(st) + '</div><div class="mut">' + esc(def.unit || 'points') + '</div>' +
      '<div class="strip" aria-label="How it went">' + sq.join('') + '</div>' +
      (def.resultExtra ? def.resultExtra(d) : '') +
      (saved ? '<p class="gems">+' + res.gems + ' gems' + (total != null ? ' <span class="mut">(' + total + ' total)</span>' : '') + '</p>' +
        '<p class="mut">Gems are just for fun. They have no cash value.</p>' : '') +
      (note ? '<p class="mut">' + esc(note) + '</p>' : '') +
      '<div class="row">' + (saved ? '<button class="btn go" id="bShare">Share</button>' : '') +
      (retry ? '<button class="btn" id="bRetry">Try saving again</button>' : '') +
      (canPractice() ? '<button class="btn alt" id="bPrac">Practice</button>' : '') + '</div>' +
      (def.report && saved ? '<p class="mut"><button class="link" id="bReport">Something here was wrong</button></p>' : '') +
      '<p class="mut">Next daily in <b id="cd"></b></p><div class="board" id="lb"></div>');
    if ($('bShare')) $('bShare').onclick = async () => { const s = await share(text); $('bShare').textContent = s === 'copied' ? 'Copied' : 'Share'; };
    if ($('bRetry')) $('bRetry').onclick = () => { finishing = false; finish(); };
    if ($('bPrac')) $('bPrac').onclick = () => start('practice');
    if ($('bReport')) $('bReport').onclick = () => def.report(d, { api, sheet, esc, back: () => showResult(res, saved, note, total, retry) });
    countdown($('cd'));
    if (fresh && !RM && typeof res.score === 'number' && res.score > 0) rollUp($('fscore'), res.score, st);
    if (fresh) {
      if (isBest) { sound.play('best'); fx.confetti(120); host.set('celebrate'); host.say('New high score!'); }
      else sound.play(saved ? 'coin' : 'over');
    }
    if (S) paintHud();
    if (saved) loadBoard();
  }

  /* The final score rolls up like a ticket counter. */
  const shown = new WeakSet();
  function rollUp(el, to, final) {
    const t0 = performance.now(), dur = Math.min(1400, 500 + to * 4);
    let lastV = -1;
    const step = t => {
      if (!el.isConnected) return;
      const u = Math.min(1, (t - t0) / dur), v = Math.round(to * (1 - Math.pow(1 - u, 3)));
      if (v !== lastV) { el.textContent = sim.scoreText(v, cfg); if (v % 3 === 0) sound.play('tick'); lastV = v; }
      if (u < 1) requestAnimationFrame(step); else el.textContent = final;
    };
    requestAnimationFrame(step);
  }

  async function loadBoard() {
    const r = await api('GET', def.id + '/leaderboard').catch(() => null);
    if (!r || r.status !== 200 || !$('lb')) return;
    const b = r.data;
    $('lb').innerHTML = '<b>Today\'s board</b> <span class="mut">(' + b.total + ' played)</span>' +
      (b.top.length ? '<ol>' + b.top.slice(0, 10).map(x => '<li' + (x.me ? ' class="me"' : '') + '>' + esc(x.name) + ' <span class="mut">' + esc(sim.scoreText(x.score, cfg)) + '</span></li>').join('') + '</ol>'
        : '<p class="mut">Sign in to put your name on the board.</p>') +
      (b.me && b.me.rank ? '<p class="mut">You are #' + b.me.rank + '.</p>' : '') +
      (b.me && b.me.restarted ? '<p class="mut">This run was restarted, so it is off the board.</p>' : '');
  }

  async function boot() {
    resize(); addEventListener('resize', resize);
    requestAnimationFrame(frame);
    sheet('<h2>' + esc(def.name) + '</h2><p class="mut">Loading today...</p>');
    await session();
    const r = await api('GET', def.id + '/today').catch(() => ({ status: 0 }));
    if (r.status !== 200) { sheet('<h2>' + esc(def.name) + '</h2><p>Could not load today. <a href="/arcade/">Back to the Arcade</a></p>'); return; }
    today = r.data; cfg = today.config; seed = today.seed;
    if (cfg || !def.needsConfig) { S = sim.create(seed, cfg); view.onStart(S); paintHud(); }
    if (today.played) {
      // a run already filed today is shown as it stands, without the fanfare
      shown.add(today.played); if (today.played.score > best()) lsSet(BEST_KEY, String(today.played.score));
      mode = 'daily'; showResult(today.played, true, null, today.gems); return;
    }
    intro();
  }
  boot();
  return env;
}
