/* Drop Board in the browser: choosing the drop, drawing the board, and the
 * running tally. The rules are sim.js, which the server replays. Only the
 * aim line is previewed, never where the puck will land. */
import { CONFIG as C } from './config.js';
import * as S from './sim.js';
import { bootGame } from '../../shared/app.js';

function makeView(env) {
  const cv = env.canvas, cx = env.ctx;
  let W = 1, H = 1, st = null, aimX = 50, aiming = false, K = 1, OX = 0, OY = 0;
  const PEGS = S.pegs(), SW = C.WIDTH / C.SLOTS;
  const X = x => OX + x * K, Y = y => OY + y * K;
  const ready = () => env.playing() && st && st.phase === 'ready';
  const fromPx = px => Math.max(C.DROP_MIN, Math.min(C.DROP_MAX, (px - OX) / K));
  const tierCol = { high: '#22B07D', mid: '#d9a51c', low: '#5d5a54' };
  const now = () => performance.now(), T0 = now();
  let pegLit = new Map(), slotFx = null, trail = [], bumpT = -9999;
  /* A peg lights and chimes as the puck passes it; the chime climbs as it falls. */
  function touchPegs(x, y) {
    const t = now();
    PEGS.forEach((p, i) => {
      if (Math.hypot(p.x - x, p.y - y) < C.PEG_R + C.PUCK_R + 0.7 && t - (pegLit.get(i) || 0) > 140) {
        pegLit.set(i, t); env.sound.play('peg', { pitch: 0.8 + (p.y - C.PEG_TOP) / (C.PEG_DY * C.PEG_ROWS) * 0.9 });
      }
    });
  }

  function board() {
    const t = now();
    // the studio: a dark stage with two sweeping spotlights
    const bg = cx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#141c2a'); bg.addColorStop(1, '#070a12');
    cx.fillStyle = bg; cx.fillRect(0, 0, W, H);
    if (!env.RM) for (const k of [0, 1]) {
      const a = Math.sin((t - T0) / 2200 + k * 2.4) * 0.5, x0 = k ? W * 0.85 : W * 0.15;
      cx.save(); cx.translate(x0, -10); cx.rotate(a);
      const sg = cx.createLinearGradient(0, 0, 0, H);
      sg.addColorStop(0, 'rgba(255,240,190,.16)'); sg.addColorStop(1, 'rgba(255,240,190,0)');
      cx.fillStyle = sg; cx.beginPath(); cx.moveTo(-8, 0); cx.lineTo(8, 0); cx.lineTo(W * 0.22, H); cx.lineTo(-W * 0.22, H); cx.closePath(); cx.fill();
      cx.restore();
    }
    cx.fillStyle = '#1f2a36';
    cx.beginPath(); cx.roundRect(X(-3), Y(-2), C.WIDTH * K + 6 * K, (C.HEIGHT + 30) * K, 10); cx.fill();
    // chasing bulbs round the board
    const bw = C.WIDTH * K + 6 * K, bh = (C.HEIGHT + 30) * K, bx = X(-3), by = Y(-2), per = 2 * (bw + bh), gap = 14, n = Math.floor(per / gap);
    const step = ((t - T0) / (slotFx && t - slotFx.t < 1500 ? 50 : 140)) | 0;
    for (let i = 0; i < n; i++) {
      let d = i * gap, px, py;
      if (d < bw) { px = bx + d; py = by; } else if ((d -= bw) < bh) { px = bx + bw; py = by + d; } else if ((d -= bh) < bw) { px = bx + bw - d; py = by + bh; } else { d -= bw; px = bx; py = by + bh - d; }
      const on = env.RM || (i + step) % 4 === 0;
      cx.fillStyle = on ? '#fff3b0' : 'rgba(255,210,63,.22)';
      cx.beginPath(); cx.arc(px, py, on ? 2.4 : 1.8, 0, Math.PI * 2); cx.fill();
    }
    // pegs
    PEGS.forEach((p, i) => {
      const bump = i === st.L.bumper, lt = t - (pegLit.get(i) || -9999), glow = lt < 420 ? 1 - lt / 420 : 0;
      const bglow = bump && t - bumpT < 500 ? 1 - (t - bumpT) / 500 : 0;
      if (glow > 0 || bglow > 0) {
        cx.globalAlpha = Math.max(glow, bglow) * 0.6; cx.fillStyle = bump ? '#ff6b57' : '#ffe680';
        cx.beginPath(); cx.arc(X(p.x), Y(p.y), C.PEG_R * (bump ? 5 : 3.2) * K, 0, Math.PI * 2); cx.fill(); cx.globalAlpha = 1;
      }
      cx.fillStyle = bump ? '#E0533D' : glow > 0 ? '#fff7cc' : '#d8dde4';
      cx.beginPath(); cx.arc(X(p.x), Y(p.y), (bump ? C.PEG_R * 1.6 : C.PEG_R) * K, 0, Math.PI * 2); cx.fill();
      if (bump) { cx.strokeStyle = 'rgba(224,83,61,' + (0.4 + 0.3 * Math.sin(t / 200)) + ')'; cx.lineWidth = 2; cx.beginPath(); cx.arc(X(p.x), Y(p.y), C.PEG_R * 3 * K, 0, Math.PI * 2); cx.stroke(); }
    });
    // the slots, labelled with today's theme
    const vals = st.L.slots.map((sl, i) => sl.value * (i === st.L.double ? 2 : 1));
    const hi = Math.max(...vals), lo = Math.min(...vals);
    st.L.slots.forEach((sl, i) => {
      const x0 = X(i * SW), x1 = X((i + 1) * SW), dbl = i === st.L.double;
      const t = (vals[i] - lo) / Math.max(1, hi - lo);
      cx.fillStyle = dbl ? '#E0533D' : 'rgba(34,176,125,' + (0.25 + 0.6 * t).toFixed(2) + ')';
      cx.fillRect(x0 + 1, Y(C.DIVIDER_TOP), x1 - x0 - 2, (C.HEIGHT - C.DIVIDER_TOP + 28) * K);
      if (slotFx && slotFx.i === i) {
        const age = now() - slotFx.t, on = env.RM || ((age / 120) | 0) % 2 === 0;
        if (age < 2200) {
          cx.globalAlpha = (on ? 0.7 : 0.25) * (1 - age / 2200); cx.fillStyle = slotFx.col;
          cx.fillRect(x0 + 1, Y(C.DIVIDER_TOP - 14), x1 - x0 - 2, (C.HEIGHT - C.DIVIDER_TOP + 42) * K); cx.globalAlpha = 1;
        }
      }
      cx.fillStyle = '#fff'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
      const fs = Math.max(9, Math.min(15, SW * K * 0.27));
      cx.font = '800 ' + fs + 'px Outfit, sans-serif';
      cx.fillText(String(sl.value), (x0 + x1) / 2, Y(C.HEIGHT + 2));
      if (dbl) { cx.font = '800 ' + (fs * 0.7) + 'px Outfit, sans-serif'; cx.fillText('x2', (x0 + x1) / 2, Y(C.HEIGHT + 10)); }
      cx.save(); cx.translate((x0 + x1) / 2, Y(C.HEIGHT + 22)); cx.rotate(-Math.PI / 2);
      cx.font = '600 ' + Math.max(8, fs * 0.62) + 'px DM Sans, sans-serif'; cx.textAlign = 'left';
      cx.fillText(sl.label.length > 16 ? sl.label.slice(0, 15) + '.' : sl.label, 0, 0);
      cx.restore();
    });
    cx.fillStyle = '#d8dde4';
    for (let k = 1; k < C.SLOTS; k++) cx.fillRect(X(k * SW) - C.DIVIDER_R * K, Y(C.DIVIDER_TOP), C.DIVIDER_R * 2 * K, (C.HEIGHT - C.DIVIDER_TOP) * K);
  }
  function puck(x, y) {
    if (!env.RM) { cx.shadowColor = '#ffd23f'; cx.shadowBlur = 14; }
    const g = cx.createRadialGradient(X(x) - C.PUCK_R * K * 0.35, Y(y) - C.PUCK_R * K * 0.35, 1, X(x), Y(y), C.PUCK_R * K);
    g.addColorStop(0, '#fff6c4'); g.addColorStop(1, '#e8b416');
    cx.fillStyle = g; cx.strokeStyle = '#141414'; cx.lineWidth = 1.5;
    cx.beginPath(); cx.arc(X(x), Y(y), C.PUCK_R * K, 0, Math.PI * 2); cx.fill(); cx.shadowBlur = 0; cx.stroke();
    cx.fillStyle = '#141414'; cx.font = '800 ' + Math.max(8, C.PUCK_R * K * 0.9) + 'px Outfit, sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillText('★', X(x), Y(y) + 0.5);
  }

  const px = e => { const r = cv.getBoundingClientRect(); return e.clientX - r.left; };
  cv.addEventListener('pointerdown', e => { if (!ready()) return; cv.setPointerCapture(e.pointerId); aiming = true; aimX = fromPx(px(e)); e.preventDefault(); });
  cv.addEventListener('pointermove', e => { if (ready() && (aiming || e.pointerType === 'mouse')) aimX = fromPx(px(e)); });
  cv.addEventListener('pointerup', e => { if (!aiming) return; aiming = false; aimX = fromPx(px(e)); if (ready()) env.input({ x: Math.round(aimX * 100) / 100 }); });
  cv.addEventListener('pointercancel', () => { aiming = false; });
  addEventListener('keydown', e => {
    if (!ready()) return;
    if (e.key === 'ArrowLeft') { aimX = Math.max(C.DROP_MIN, aimX - 1.5); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { aimX = Math.min(C.DROP_MAX, aimX + 1.5); e.preventDefault(); }
    else if (e.key === ' ' || e.key === 'Enter') { env.input({ x: Math.round(aimX * 100) / 100 }); e.preventDefault(); }
  });

  return {
    resize(w, h) { W = w; H = h; K = Math.min((W - 24) / C.WIDTH, (H - 20) / (C.HEIGHT + 34)); OX = (W - C.WIDTH * K) / 2; OY = 12; },
    snap: s => ({ x: s.x, y: s.y, drop: s.drop }),
    onStart(s) { st = s; aimX = 50; pegLit = new Map(); slotFx = null; trail = []; env.hint(s.drop === 0 && s.phase === 'ready' ? 'Slide along the top, let go to drop' : ''); env.host.set('idle'); },
    onInput() { env.sound.play('whoosh'); env.haptics.buzz(10); env.hint(''); trail = []; env.host.set('nervous'); },
    onPause() { aiming = false; },
    onEvent(e) {
      if (e.type === 'bumper') {
        bumpT = now(); env.sound.play('bumper', { pitch: 1.3 }); env.host.set('hype'); env.fx.shake(5, 200);
        const p = PEGS[st.L.bumper]; env.fx.ring(X(p.x), Y(p.y), '#ff6b57', 40); env.fx.burst(X(p.x), Y(p.y), { n: 14, colors: ['#E0533D', '#ffd23f'], speed: 180, gravity: 0 });
      } else if (e.type === 'nudge') env.sound.play('rail');
      else if (e.type === 'result') {
        const t = S.tierOf(e.pts, st.best, st.worst), sx = X((e.slot + 0.5) * SW), sy = Y(C.SLOT_Y);
        slotFx = { i: e.slot, t: now(), col: e.dbl ? '#ff6b57' : t === 'high' ? '#5ff0b5' : t === 'mid' ? '#ffd23f' : '#a0a8b8' };
        env.pop(e.label + '  +' + e.pts + (e.dbl ? ' (x2)' : ''), tierCol[t]);
        env.fx.text(sx, sy - 30, '+' + e.pts, '#fff', 26);
        if (t === 'high') { env.sound.play('jackpot'); env.fx.confetti(90); env.fx.flash('#ffd23f', 260, 0.25); env.fx.shake(6, 320); env.host.say(e.dbl ? 'Double!' : 'Big money!'); }
        else if (t === 'mid') { env.sound.play('good'); env.host.say('Not bad!'); }
        else { env.sound.play('groan'); env.host.say('Ooh, so close.'); }
        env.fx.burst(sx, sy, { n: t === 'high' ? 40 : 16, speed: 240, angle: -Math.PI / 2, spread: 1.6, colors: t === 'high' ? ['#ffd23f', '#5ff0b5', '#fff'] : ['#ffd23f', '#fff'] });
        env.host.set(t === 'high' ? 'celebrate' : t === 'low' ? 'disappointed' : 'idle');
      } else if (e.type === 'next' && st.drop === C.DROPS - 1) { env.pop('FINAL DROP', '#ff4fa3'); env.host.say('Last one!'); }
    },
    onOver() {},
    hud(s) {
      return '<div class="stat"><b>' + s.score + '</b><span>Total</span></div>' +
        '<div class="stat"><b>' + Math.min(C.DROPS, s.drop + 1) + '/' + C.DROPS + '</b><span>Drop</span></div>' +
        '<div class="stat"><b>' + s.best + '</b><span>Best possible</span></div>';
    },
    render(alpha, s, prev) {
      if (!st) { cx.fillStyle = '#EFEDE8'; cx.fillRect(0, 0, W, H); return; }
      board();
      if (st.phase === 'ready') {
        cx.strokeStyle = 'rgba(255,210,63,.75)'; cx.setLineDash([3, 5]); cx.lineWidth = 1.5;
        cx.beginPath(); cx.moveTo(X(aimX), Y(C.DROP_Y)); cx.lineTo(X(aimX), Y(C.PEG_TOP - 4)); cx.stroke(); cx.setLineDash([]);
        puck(aimX, C.DROP_Y);
      } else if (st.phase === 'fall' || st.phase === 'settle') {
        const p = prev && prev.drop === st.drop ? prev : null;
        const x = p ? p.x + (st.x - p.x) * alpha : st.x, y = p ? p.y + (st.y - p.y) * alpha : st.y;
        if (st.phase === 'fall') touchPegs(x, y);
        if (!env.RM) {
          trail.push([x, y]); if (trail.length > 12) trail.shift();
          trail.forEach((q, i) => { cx.globalAlpha = 0.3 * i / trail.length; cx.fillStyle = '#ffd23f'; cx.beginPath(); cx.arc(X(q[0]), Y(q[1]), C.PUCK_R * K * (0.4 + 0.6 * i / trail.length), 0, Math.PI * 2); cx.fill(); });
          cx.globalAlpha = 1;
        }
        puck(x, y);
      }
      if (env.DEBUG) env.debug('drop ' + st.drop + ' phase ' + st.phase + ' bumper peg ' + st.L.bumper + ' double ' + st.L.double + '\nslow ' + st.slow + ' nudges ' + st.nudges);
    }
  };
}

bootGame({
  id: 'drop-board', name: 'Drop Board', version: 'drop-1', sim: S, unit: 'points', needsConfig: true, practiceAfterDaily: true,
  practiceCfg: today => today && today.practice,
  rule: 'Pick your drop. Hope it lands on the big one.',
  howto: 'Slide along the top to choose where the puck drops, then let go. Read the slots first: one is worth double, and the red peg kicks. Keyboard: arrows move, Space drops.',
  resultExtra: d => '<p class="mut">Best possible today: ' + d.best + '. Worst: ' + d.worst + '.</p>',
  makeView
});
