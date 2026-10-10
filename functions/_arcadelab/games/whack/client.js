/* Whack the Right Player in the browser: the grid, the cards, the prompt,
 * and the report sheet. The rules are sim.js, which the server replays with
 * the same published slate. A tap counts on the frame it lands: the whole
 * cell is the target, not just the card. */
import { CONFIG as C } from './config.js';
import * as S from './sim.js';
import { bootGame } from '../../shared/app.js';

const COLS = 3, ROWS = 3;

function makeView(env) {
  const cv = env.canvas, cx = env.ctx;
  let W = 1, H = 1, st = null, grid = null, banner = '', bannerAt = -999, fx = [], mallets = [], stamps = [];
  const now = () => performance.now(), T0 = now();
  /* The mallet comes down on every tap, hit or not: the booth answers the hand. */
  let hover = null;
  cv.addEventListener('pointermove', e => { const rc = cv.getBoundingClientRect(); hover = { x: e.clientX - rc.left, y: e.clientY - rc.top }; });
  cv.addEventListener('pointerleave', () => { if (!matchMedia('(pointer: coarse)').matches) hover = null; });
  const swing = h => { if (h >= 0) { mallets.push({ hole: h, at: now() }); if (mallets.length > 6) mallets.shift(); env.sound.play('thud'); } };

  function layout() {
    const top = 74, pad = 10;
    const cw = Math.min((W - pad * 2) / COLS, 200);
    const ch = Math.max(90, Math.min((H - top - pad - 30) / ROWS, cw * 1.05));
    const gx = (W - cw * COLS) / 2, gy = top + 14;
    grid = { cw, ch, gx, gy };
  }
  const cell = h => ({ x: grid.gx + (h % COLS) * grid.cw, y: grid.gy + Math.floor(h / COLS) * grid.ch });
  /* The nearest cell to a point anywhere on the grid: a forgiving target. */
  function holeAt(px, py) {
    if (px < grid.gx - 12 || px > grid.gx + grid.cw * COLS + 12 || py < grid.gy - 12 || py > grid.gy + grid.ch * ROWS + 12) return -1;
    const c = Math.max(0, Math.min(COLS - 1, Math.floor((px - grid.gx) / grid.cw)));
    const r = Math.max(0, Math.min(ROWS - 1, Math.floor((py - grid.gy) / grid.ch)));
    return r * COLS + c;
  }
  cv.addEventListener('pointerdown', e => {
    if (!env.playing()) return;
    e.preventDefault();
    const rc = cv.getBoundingClientRect(), h = holeAt(e.clientX - rc.left, e.clientY - rc.top);
    hover = { x: e.clientX - rc.left, y: e.clientY - rc.top };
    if (h >= 0) { swing(h); env.input({ h }); }
  });
  /* Keyboard: the number pad, or Q W E / A S D / Z X C. */
  const KEY = { Numpad7: 0, Numpad8: 1, Numpad9: 2, Numpad4: 3, Numpad5: 4, Numpad6: 5, Numpad1: 6, Numpad2: 7, Numpad3: 8,
    KeyQ: 0, KeyW: 1, KeyE: 2, KeyA: 3, KeyS: 4, KeyD: 5, KeyZ: 6, KeyX: 7, KeyC: 8 };
  addEventListener('keydown', e => { if (env.playing() && e.code in KEY && !e.repeat) { e.preventDefault(); swing(KEY[e.code]); env.input({ h: KEY[e.code] }); } });

  function initials(n) { const p = String(n).split(' ').filter(Boolean); return ((p[0] || '')[0] || '') + ((p[p.length - 1] || '')[0] || ''); }
  function fit(text, max, size, weight) {
    let s = size; cx.font = weight + ' ' + s + 'px Outfit, sans-serif';
    while (cx.measureText(text).width > max && s > 9) { s -= 1; cx.font = weight + ' ' + s + 'px Outfit, sans-serif'; }
    return s;
  }
  function card(c, f) {
    const { x, y } = cell(c.hole), { cw, ch } = grid;
    const r0 = Math.min(1, (f - c.at) / C.RISE), rise = env.RM ? r0 : 1 + 2.2 * Math.pow(r0 - 1, 3) + 1.2 * Math.pow(r0 - 1, 2), fall = f > c.downAt ? Math.max(0, 1 - (f - c.downAt) / C.GRACE) : 1;
    const k = env.RM ? (f <= c.downAt ? 1 : 0) : Math.min(rise, fall);
    if (k <= 0) return;
    const shakeX = c.hit && !c.ok && !env.RM ? Math.sin(f * 1.7) * 3 : 0;
    const w = cw - 12, hgt = (ch - 14) * k, cx0 = x + 6 + shakeX, cy0 = y + ch - 8 - hgt;
    cx.save(); cx.beginPath(); cx.rect(x, y, cw, ch - 8); cx.clip();
    cx.fillStyle = c.hit ? (c.ok ? '#22B07D' : '#E0533D') : '#fff8ec';
    cx.strokeStyle = '#141414'; cx.lineWidth = 2;
    cx.beginPath(); cx.roundRect(cx0, cy0, w, ch - 14, 10); cx.fill(); cx.stroke();
    if (!c.hit) { cx.fillStyle = '#ffd23f'; cx.beginPath(); cx.roundRect(cx0 + 2, cy0 + 2, w - 4, 6, 4); cx.fill(); }
    const ink = c.hit ? '#fff' : '#141414';
    const av = Math.min(34, (ch - 14) * 0.34);
    cx.fillStyle = c.hit ? 'rgba(255,255,255,.25)' : '#EFEDE8';
    cx.beginPath(); cx.arc(cx0 + w / 2, cy0 + 8 + av / 2, av / 2, 0, Math.PI * 2); cx.fill();
    cx.fillStyle = ink; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.font = '800 ' + (av * 0.42) + 'px Outfit, sans-serif'; cx.fillText(initials(c.card.n), cx0 + w / 2, cy0 + 8 + av / 2);
    fit(c.card.n, w - 8, Math.min(16, cw * 0.13), '800');
    cx.fillText(c.card.n, cx0 + w / 2, cy0 + 14 + av + 10);
    if (c.card.pos) { cx.font = '600 ' + Math.min(12, cw * 0.1) + 'px DM Sans, sans-serif'; cx.fillStyle = c.hit ? '#fff' : '#5d5a54'; cx.fillText(c.card.pos, cx0 + w / 2, cy0 + 14 + av + 28); }
    cx.restore();
  }

  /* The booth: a striped carnival awning colour, a wood counter, bulbs on the sign. */
  function booth() {
    const g = cx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#3a0d18'); g.addColorStop(1, '#16060c');
    cx.fillStyle = g; cx.fillRect(0, 0, W, H);
    cx.fillStyle = 'rgba(255,255,255,.035)';
    for (let x = 0; x < W; x += 36) cx.fillRect(x, 0, 18, H);
    const gy = grid.gy + grid.ch * ROWS;
    const wd = cx.createLinearGradient(0, gy - 4, 0, H);
    wd.addColorStop(0, '#8a4b22'); wd.addColorStop(1, '#4a250f');
    cx.fillStyle = wd; cx.fillRect(0, gy - 2, W, H - gy + 2);
    cx.fillStyle = '#d9a51c'; cx.fillRect(0, gy - 4, W, 3);
  }
  function sign(t) {
    const x = 8, y = 6, w = W - 16, h = 54;
    cx.fillStyle = '#0d1a2e'; cx.strokeStyle = '#d9a51c'; cx.lineWidth = 2;
    cx.beginPath(); cx.roundRect(x, y, w, h, 12); cx.fill(); cx.stroke();
    const n = Math.max(8, Math.floor(w / 18)), step = ((t - T0) / 160) | 0;
    for (let i = 0; i < n; i++) {
      const bx = x + 9 + i * (w - 18) / (n - 1);
      for (const by of [y + 5, y + h - 5]) {
        const on = env.RM || (i + step) % 3 === 0;
        cx.fillStyle = on ? '#fff3b0' : 'rgba(255,210,63,.25)'; cx.beginPath(); cx.arc(bx, by, 2, 0, Math.PI * 2); cx.fill();
      }
    }
  }
  function timerBar(f) {
    const into = f - st.round * S.ROUND_LEN - C.INTRO_FRAMES;
    if (into < 0 || st.over) return;
    const left = Math.max(0, 1 - into / C.ROUND_FRAMES), x = 14, y = 64, w = W - 28;
    cx.fillStyle = 'rgba(255,255,255,.12)'; cx.beginPath(); cx.roundRect(x, y, w, 6, 3); cx.fill();
    cx.fillStyle = left < 0.2 ? '#E0533D' : left < 0.5 ? '#ffd23f' : '#22B07D';
    cx.beginPath(); cx.roundRect(x, y, Math.max(6, w * left), 6, 3); cx.fill();
  }
  function malletsAndStamps() {
    const t = now();
    mallets = mallets.filter(m => t - m.at < 260);
    for (const m of mallets) {
      const { x, y } = cell(m.hole), u = (t - m.at) / 260, ang = env.RM ? 0 : (u < 0.35 ? -0.9 + u / 0.35 * 1.1 : 0.2);
      cx.save(); cx.globalAlpha = u > 0.6 ? (1 - u) / 0.4 : 1;
      cx.translate(x + grid.cw * 0.78, y + grid.ch * 0.18); cx.rotate(ang);
      cx.fillStyle = '#8a4b22'; cx.fillRect(-4, 0, 8, grid.ch * 0.55);
      cx.fillStyle = '#E0533D'; cx.strokeStyle = '#141414'; cx.lineWidth = 2;
      cx.beginPath(); cx.roundRect(-grid.cw * 0.22, -16, grid.cw * 0.44, 22, 6); cx.fill(); cx.stroke();
      cx.restore();
    }
    stamps = stamps.filter(m => t - m.at < 700);
    for (const m of stamps) {
      const { x, y } = cell(m.hole), u = (t - m.at) / 700, sc = env.RM ? 1 : (u < 0.15 ? 2 - u / 0.15 : 1);
      cx.save(); cx.globalAlpha = Math.min(1, (1 - u) * 2.5); cx.translate(x + grid.cw / 2, y + grid.ch / 2); cx.scale(sc, sc); cx.rotate(-0.15);
      cx.strokeStyle = '#ff2a2a'; cx.lineWidth = 7; cx.lineCap = 'round';
      const r = Math.min(grid.cw, grid.ch) * 0.28;
      cx.beginPath(); cx.moveTo(-r, -r); cx.lineTo(r, r); cx.moveTo(r, -r); cx.lineTo(-r, r); cx.stroke();
      cx.restore();
    }
  }
  /* The mallet is in your hand between swings, cocked over where you point. */
  function heldMallet() {
    if (!hover || mallets.length || env.RM) return;
    const bob = Math.sin(now() / 260) * 0.05;
    cx.save(); cx.globalAlpha = 0.9; cx.translate(hover.x + grid.cw * 0.28, hover.y - grid.ch * 0.1); cx.rotate(-0.75 + bob);
    cx.fillStyle = '#8a4b22'; cx.fillRect(-4, 0, 8, grid.ch * 0.55);
    cx.fillStyle = '#E0533D'; cx.strokeStyle = '#141414'; cx.lineWidth = 2;
    cx.beginPath(); cx.roundRect(-grid.cw * 0.22, -16, grid.cw * 0.44, 22, 6); cx.fill(); cx.stroke();
    cx.restore();
  }
  const center = h => { const { x, y } = cell(h); return [x + grid.cw / 2, y + grid.ch / 2]; };

  return {
    resize(w, h) { W = w; H = h; layout(); },
    snap: () => null,
    onStart(s) { st = s; fx = []; mallets = []; stamps = []; banner = s.slate.rounds[0].title; bannerAt = 0; env.host.set('idle'); env.hint(''); },
    onInput() {},
    onEvent(e, s) {
      if (e.type === 'roundStart') { banner = s.slate.rounds[e.round].title; bannerAt = s.frame; env.host.set('idle'); env.sound.play('coin'); }
      else if (e.type === 'up') { if (!env.RM) env.sound.play('peg', { pitch: 0.7 + (e.hole % 3) * 0.1 }); }
      else if (e.type === 'hit') {
        const [X, Y] = center(e.hole);
        fx.push({ hole: e.hole, txt: '+' + e.pts, col: '#5ff0b5', at: s.frame });
        env.sound.play('whack', { pitch: 1.2 }); env.sound.play('combo', { pitch: 1 + Math.min(1, e.combo * 0.07) });
        env.haptics.buzz(10); env.fx.shake(3, 110); env.sound.swell(1.2);
        env.fx.burst(X, Y, { n: 12 + Math.min(20, e.combo * 2), colors: ['#ffd23f', '#fff', '#5ff0b5'], speed: 230, gravity: 300, shape: e.combo >= 6 ? 'spark' : 'dot' });
        env.fx.ring(X, Y, '#ffd23f', 40);
        if (e.combo > 1 && e.combo % C.COMBO_STEP === 0) { env.pop('COMBO x' + e.mult, '#22B07D'); env.fx.flash('#22B07D', 160, 0.18); }
        if (e.combo >= 5) env.host.set('hype');
        if (e.combo === 6) env.host.say('Hot hands!'); else if (e.combo === 10) env.host.say('Untouchable!');
      }
      else if (e.type === 'strike') {
        const [X, Y] = center(e.hole);
        fx.push({ hole: e.hole, txt: 'STRIKE', col: '#ff6b57', at: s.frame }); stamps.push({ hole: e.hole, at: now() });
        env.sound.play('buzzer'); env.haptics.buzz([40, 30, 40]); env.host.set('nervous'); env.pop('Strike ' + e.strikes + ' of ' + C.STRIKES, '#E0533D');
        env.fx.shake(8, 300); env.fx.flash('#E0533D', 240, 0.32); env.fx.burst(X, Y, { n: 10, colors: ['#E0533D', '#141414'], speed: 160 });
        env.host.say(e.strikes >= C.STRIKES - 1 ? 'One more and you are out!' : 'Not that one!');
      }
      else if (e.type === 'miss') { fx.push({ hole: e.hole, txt: 'missed', col: '#5d5a54', at: s.frame }); }
      else if (e.type === 'roundEnd') { const r = s.rounds[e.round]; if (r && r.wrong === 0 && r.misses === 0 && r.hits > 0 && s.strikes < C.STRIKES) { env.pop('PERFECT ROUND', '#ffd23f'); env.sound.play('jackpot'); env.fx.confetti(60); env.host.say('Perfect!'); } }
      else if (e.type === 'over') { env.host.set(e.out ? 'disappointed' : 'celebrate'); if (e.out) env.sound.play('drain'); }
    },
    onOver() {},
    /* The combo is drawn under the grid, where the eyes already are. */
    hud(s) {
      return '<div class="stat"><b>' + s.score + '</b><span>Score</span></div>' +
        '<div class="stat"><b>' + Math.min(C.ROUNDS, s.round + 1) + '/' + C.ROUNDS + '</b><span>Round</span></div>' +
        '<div class="stat"><b>' + '●'.repeat(s.strikes) + '○'.repeat(Math.max(0, C.STRIKES - s.strikes)) + '</b><span>Strikes</span></div>';
    },
    render() {
      if (!st) { cx.fillStyle = '#16060c'; cx.fillRect(0, 0, W, H); return; }
      booth();
      const f = st.frame, t = now();
      // the prompt: big during the intro, a lit sign during play
      const inIntro = f - st.round * S.ROUND_LEN < C.INTRO_FRAMES && !st.over;
      sign(t);
      cx.fillStyle = '#ffd23f'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
      fit(banner, W - 48, 18, '800'); cx.fillText(banner, W / 2, 33);
      timerBar(f);
      // holes: a dark pipe with a lip
      for (let h = 0; h < C.HOLES; h++) {
        const { x, y } = cell(h);
        cx.fillStyle = '#050206'; cx.beginPath(); cx.ellipse(x + grid.cw / 2, y + grid.ch - 8, grid.cw / 2 - 6, 8, 0, 0, Math.PI * 2); cx.fill();
        cx.strokeStyle = '#d9a51c'; cx.lineWidth = 2; cx.stroke();
      }
      for (const c of st.live) card(c, f);
      malletsAndStamps();
      heldMallet();
      if (st.combo >= C.COMBO_STEP) {
        const y = grid.gy + grid.ch * ROWS + 22, txt = 'COMBO x' + S.mult(st.combo) + '  ·  ' + st.combo + ' in a row';
        cx.font = '800 20px Outfit, sans-serif';
        const w = cx.measureText(txt).width + 28, pulse = env.RM ? 0 : Math.sin(t / 120) * 2;
        cx.fillStyle = '#0d3a2a'; cx.strokeStyle = '#5ff0b5'; cx.lineWidth = 2;
        if (!env.RM) { cx.shadowColor = '#22B07D'; cx.shadowBlur = 14 + pulse * 3; }
        cx.beginPath(); cx.roundRect(W / 2 - w / 2, y - 16, w, 32, 16); cx.fill(); cx.stroke(); cx.shadowBlur = 0;
        cx.fillStyle = '#5ff0b5'; cx.textAlign = 'center'; cx.fillText(txt, W / 2, y + 1);
      }
      // hit and strike labels rise from the hole
      fx = fx.filter(x => f - x.at < 40);
      for (const x of fx) {
        const { x: X, y: Y } = cell(x.hole), t = (f - x.at) / 40;
        cx.globalAlpha = 1 - t; cx.fillStyle = x.col; cx.font = '800 20px Outfit, sans-serif'; cx.textAlign = 'center';
        cx.lineWidth = 4; cx.strokeStyle = 'rgba(0,0,0,.6)'; cx.strokeText(x.txt, X + grid.cw / 2, Y + grid.ch / 2 - (env.RM ? 0 : t * 24));
        cx.fillText(x.txt, X + grid.cw / 2, Y + grid.ch / 2 - (env.RM ? 0 : t * 24)); cx.globalAlpha = 1;
      }
      if (inIntro) {
        cx.fillStyle = 'rgba(10,4,8,.88)'; cx.fillRect(0, 62, W, H - 62);
        cx.textAlign = 'center';
        const into = f - st.round * S.ROUND_LEN, pk = env.RM ? 1 : Math.min(1, into / 14);
        cx.save(); cx.translate(W / 2, H * 0.4); cx.scale(0.6 + 0.4 * pk, 0.6 + 0.4 * pk);
        cx.fillStyle = '#ffd23f'; cx.font = '400 34px "Lilita One", Outfit, sans-serif'; cx.fillText('ROUND ' + (st.round + 1), 0, -8);
        cx.restore();
        cx.fillStyle = '#fff'; fit(banner, W - 40, 26, '800'); cx.fillText(banner, W / 2, H * 0.4 + 34);
        cx.font = '600 13px DM Sans, sans-serif'; cx.fillStyle = '#d9b8c0'; cx.fillText('Hit every one who fits. Leave the rest alone.', W / 2, H * 0.4 + 64);
        const left = Math.ceil((C.INTRO_FRAMES - into) / 60);
        if (left <= 2) { cx.fillStyle = '#5ff0b5'; cx.font = '800 22px Outfit, sans-serif'; cx.fillText(left <= 1 ? 'GO!' : 'READY...', W / 2, H * 0.4 + 104); }
      }
      if (env.DEBUG) env.debug('round ' + st.round + ' combo ' + st.combo + ' live ' + st.live.length + ' next ' + st.next + '/' + st.spawns.length);
    }
  };
}

/* "This was wrong": the cards that cost this player, for an editor to check. */
function report(d, ui) {
  const items = [...(d.struck || []).map(x => ({ ...x, why: 'struck me, but fits' })), ...(d.missed || []).map(x => ({ ...x, why: 'counted as fitting, but does not' }))];
  const round = i => (d.rounds || [])[i] || {};
  ui.sheet('<h2>Which card was wrong?</h2><p class="mut">Pick the card. An editor checks every report.</p>' +
    (items.length ? '<div class="chips">' + items.map((x, i) => '<button class="chip" data-i="' + i + '">' + ui.esc(x.n || x.id) +
      ' <span class="mut">(' + ui.esc(round(x.round).title || '') + ': ' + x.why + ')</span></button>').join('') + '</div>'
      : '<p>No card cost you anything today.</p>') +
    '<p><button class="btn alt" id="bBack">Back</button></p>');
  document.getElementById('bBack').onclick = ui.back;
  document.querySelectorAll('.chip[data-i]').forEach(b => b.onclick = async () => {
    const x = items[+b.dataset.i];
    const r = await ui.api('POST', 'whack/report', { promptId: round(x.round).promptId, athleteId: x.id, note: x.why }).catch(() => null);
    b.disabled = true; b.textContent = r && r.status === 200 ? 'Reported. Thank you.' : 'Could not send. Try again later.';
  });
}

bootGame({
  id: 'whack', name: 'Whack the Right Player', version: 'whack-1', sim: S, unit: 'points', ambient: 'carnival', needsConfig: true, practiceAfterDaily: true,
  practiceCfg: today => today && today.practice,
  rule: 'Hit every player who fits. Leave the rest alone.',
  howto: 'Three rounds of 20 seconds, each with its own prompt. Tap a card that fits. Hitting one that does not is a strike, and three strikes end the run. Hits in a row build a combo. Keyboard: Q W E, A S D, Z X C.',
  resultExtra: d => '<p class="mut">' + (d.rounds || []).map((r, i) => 'Round ' + (i + 1) + ': ' + r.score + (r.perfect ? ' (perfect)' : '')).join(' · ') + '</p>',
  report,
  makeView
});
