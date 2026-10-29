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

  function board() {
    cx.fillStyle = '#EFEDE8'; cx.fillRect(0, 0, W, H);
    cx.fillStyle = '#1f2a36';
    cx.beginPath(); cx.roundRect(X(-3), Y(-2), C.WIDTH * K + 6 * K, (C.HEIGHT + 30) * K, 10); cx.fill();
    // pegs
    PEGS.forEach((p, i) => {
      const bump = i === st.L.bumper;
      cx.fillStyle = bump ? '#E0533D' : '#d8dde4';
      cx.beginPath(); cx.arc(X(p.x), Y(p.y), (bump ? C.PEG_R * 1.6 : C.PEG_R) * K, 0, Math.PI * 2); cx.fill();
      if (bump) { cx.strokeStyle = 'rgba(224,83,61,.4)'; cx.lineWidth = 2; cx.beginPath(); cx.arc(X(p.x), Y(p.y), C.PEG_R * 3 * K, 0, Math.PI * 2); cx.stroke(); }
    });
    // the slots, labelled with today's theme
    const vals = st.L.slots.map((sl, i) => sl.value * (i === st.L.double ? 2 : 1));
    const hi = Math.max(...vals), lo = Math.min(...vals);
    st.L.slots.forEach((sl, i) => {
      const x0 = X(i * SW), x1 = X((i + 1) * SW), dbl = i === st.L.double;
      const t = (vals[i] - lo) / Math.max(1, hi - lo);
      cx.fillStyle = dbl ? '#E0533D' : 'rgba(34,176,125,' + (0.25 + 0.6 * t).toFixed(2) + ')';
      cx.fillRect(x0 + 1, Y(C.DIVIDER_TOP), x1 - x0 - 2, (C.HEIGHT - C.DIVIDER_TOP + 28) * K);
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
    cx.fillStyle = '#ffd23f'; cx.strokeStyle = '#141414'; cx.lineWidth = 1.5;
    cx.beginPath(); cx.arc(X(x), Y(y), C.PUCK_R * K, 0, Math.PI * 2); cx.fill(); cx.stroke();
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
    onStart(s) { st = s; aimX = 50; env.hint(''); env.host.set('idle'); },
    onInput() { env.sound.play('roll'); env.haptics.buzz(10); },
    onPause() { aiming = false; },
    onEvent(e) {
      if (e.type === 'bumper') { env.sound.play('rail'); env.host.set('hype'); }
      else if (e.type === 'result') {
        const t = S.tierOf(e.pts, st.best, st.worst);
        env.pop(e.label + '  +' + e.pts + (e.dbl ? ' (x2)' : ''), tierCol[t]);
        env.sound.play(t === 'high' ? 'big' : t === 'mid' ? 'good' : 'foul');
        env.host.set(t === 'high' ? 'celebrate' : t === 'low' ? 'disappointed' : 'idle');
      }
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
        cx.strokeStyle = 'rgba(255,210,63,.6)'; cx.setLineDash([3, 5]); cx.lineWidth = 1.5;
        cx.beginPath(); cx.moveTo(X(aimX), Y(C.DROP_Y)); cx.lineTo(X(aimX), Y(C.PEG_TOP - 4)); cx.stroke(); cx.setLineDash([]);
        puck(aimX, C.DROP_Y);
      } else if (st.phase === 'fall' || st.phase === 'settle') {
        const p = prev && prev.drop === st.drop ? prev : null;
        puck(p ? p.x + (st.x - p.x) * alpha : st.x, p ? p.y + (st.y - p.y) * alpha : st.y);
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
