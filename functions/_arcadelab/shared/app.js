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
const $ = id => document.getElementById(id);
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function bootGame(def) {
  const { sim } = def;
  const DEBUG = /[?&]debug=1/.test(location.search);
  const RM = reducedMotion();
  const sound = makeSound(), haptics = makeHaptics(), host = makeHost($('host'));
  const cv = $('c'), cx = cv.getContext('2d'), stage = $('stage');
  let today = null, mode = 'daily', cfg = null, seed = 0;
  let S = null, prev = null, log = [], queue = [];
  let running = false, paused = false, finishing = false, startedAt = 0, resumedMs = 0;
  let fps = 0, W = 0, H = 0, DPR = 1;
  const SAVE_KEY = 'arcade_lab_save_' + def.id;

  const env = {
    canvas: cv, ctx: cx, stage, sound, haptics, host, DEBUG, RM,
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
    view.render(running ? acc / DT : 1, S, prev);
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
    if (S.events && S.events.length) paintHud();
    if (mode === 'daily' && S.frame - saveAt >= 60) { saveAt = S.frame; save(); }
    if (S.over) finish();
  }
  function paintHud() { $('stats').innerHTML = view.hud(S); }

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
    sheet('<h2>' + esc(def.name) + ' <span class="mut">#' + today.dayNumber + '</span></h2>' +
      '<p class="rule">' + esc(def.rule) + '</p>' +
      (today.config && today.config.rule ? '<p class="today">Today: ' + esc(today.config.rule) + '</p>' : '') +
      (noDay ? '<p class="today">No board is published for today yet. Check back soon.</p>' : '') +
      '<p class="mut">' + esc(def.howto) + '</p>' +
      '<div class="row">' + (noDay ? '' : sv ? '<button class="btn go" id="bPlay">Resume today\'s run</button>' : '<button class="btn go" id="bPlay">Play today</button>') +
      (canPractice() ? '<button class="btn alt" id="bPrac">Practice</button>' : '') + '</div>' +
      (def.practiceAfterDaily && !canPractice() ? '<p class="mut">Practice opens after today\'s run.</p>' : '') +
      '<label class="toggle"><input type="checkbox" id="hap"' + (haptics.on ? ' checked' : '') + '> Vibrate</label>');
    if ($('bPlay')) $('bPlay').onclick = () => start('daily', sv);
    if ($('bPrac')) $('bPrac').onclick = () => start('practice');
    $('hap').onchange = () => haptics.toggle();
  }

  function start(m, sv) {
    sound.unlock();
    mode = m;
    if (m === 'daily') { seed = today.seed; cfg = today.config; }
    else { seed = crypto.getRandomValues(new Uint32Array(1))[0]; cfg = practiceCfg(); }
    if (sv) { S = runTo(sim, seed, cfg, sv.log, sv.frame); log = sv.log.slice(); resumedMs = sv.ms || 0; }
    else { S = sim.create(seed, cfg); log = []; resumedMs = 0; if (m === 'daily') api('POST', def.id + '/start', {}).catch(() => {}); }
    prev = null; queue = []; finishing = false; saveAt = S.frame;
    running = true; paused = false; acc = 0; last = 0; startedAt = performance.now();
    $('pchip').hidden = m !== 'practice';
    closeSheet(); view.onStart(S); paintHud(); stage.dataset.phase = S.phase || 'play';
    history.pushState({ lab: 1 }, '');
  }

  async function finish() {
    if (finishing) return; finishing = true; running = false;
    const durationMs = Math.round(resumedMs + performance.now() - startedAt);
    const d = sim.detail(S);
    const local = { score: S.score, scoreText: sim.scoreText(S.score, cfg), detail: d, squares: sim.squares(d, cfg), gems: 0,
      dayNumber: today ? today.dayNumber : dayNumber(dateKey(Date.now())) };
    if (view.onOver) view.onOver(S);
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
    sheet('<h2>' + (saved ? 'Today\'s run' : mode === 'practice' ? 'Practice' : 'Run over') + '</h2>' +
      '<div class="score">' + esc(st) + '</div><div class="mut">' + esc(def.unit || 'points') + '</div>' +
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
    if (saved) loadBoard();
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
    if (today.played) { mode = 'daily'; showResult(today.played, true, null, today.gems); return; }
    intro();
  }
  boot();
  return env;
}
