/* Pinball in the browser: the two flipper halves, the plunger, the nudge, and
 * drawing the table. The rules and the physics are sim.js, which the server
 * replays. Every flip is an input on the frame it lands, so a slow phone and
 * a fast laptop play the same game. */
import { CONFIG as C } from './config.js';
import * as S from './sim.js';
import { bootGame } from '../../shared/app.js';

const TABLE_H = 192;

function makeView(env) {
  const cv = env.canvas, cx = env.ctx;
  let W = 1, H = 1, K = 1, OX = 0, OY = 0, st = null;
  let charge = -1, chargeAt = 0, flash = [], tiltShown = false;
  const touches = new Map();          // pointer id -> 'L' | 'R' | 'P'
  const keysDown = new Set();         // 'L' | 'R' held on the keyboard
  const holding = side => keysDown.has(side) || [...touches.values()].includes(side);
  const X = x => OX + x * K, Y = y => OY + y * K;
  const live = () => env.playing() && st && !st.over;
  const NUDGE = { x: 70, y: -0, w: 26, h: 8 };   // the chip at the top right, in table units

  function press(side, down) { if (live()) env.input({ k: side + (down ? '1' : '0') }); }
  function plungeStart() { if (live() && S.waiting(st) && charge < 0) { charge = 0; chargeAt = performance.now(); } }
  function plungeEnd() {
    if (charge < 0) return;
    const p = Math.round(chargePower() * 100) / 100; charge = -1;
    if (live()) env.input({ k: 'P', p });
  }
  /* The pull rises over a second and holds at full, the way a spring does. */
  function chargePower() { return charge < 0 ? 0 : Math.min(1, (performance.now() - chargeAt) / 1000); }

  const toTable = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left - OX) / K, y: (e.clientY - r.top - OY) / K }; };
  cv.addEventListener('pointerdown', e => {
    if (!live()) return;
    e.preventDefault(); cv.setPointerCapture(e.pointerId);
    const t = toTable(e);
    if (t.x >= NUDGE.x && t.y <= NUDGE.y + NUDGE.h && !S.waiting(st)) { env.input({ k: 'N' }); return; }
    if (S.waiting(st)) { touches.set(e.pointerId, 'P'); plungeStart(); return; }
    const side = t.x < 50 ? 'L' : 'R';
    touches.set(e.pointerId, side);
    press(side, true);
  });
  const lift = e => {
    const what = touches.get(e.pointerId); if (!what) return;
    touches.delete(e.pointerId);
    if (what === 'P') plungeEnd();
    else if (!holding(what)) press(what, false);
  };
  cv.addEventListener('pointerup', lift);
  cv.addEventListener('pointercancel', lift);

  const KEYS = { ArrowLeft: 'L', KeyZ: 'L', ShiftLeft: 'L', ArrowRight: 'R', Slash: 'R', KeyM: 'R', ShiftRight: 'R' };
  addEventListener('keydown', e => {
    if (!live()) return;
    if (KEYS[e.code]) { e.preventDefault(); keysDown.add(KEYS[e.code]); if (!e.repeat) press(KEYS[e.code], true); }
    else if (e.code === 'Space' || e.code === 'ArrowDown' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) plungeStart(); }
    else if ((e.code === 'KeyN' || e.code === 'ArrowUp') && !e.repeat) { e.preventDefault(); env.input({ k: 'N' }); }
  });
  addEventListener('keyup', e => {
    if (KEYS[e.code]) { keysDown.delete(KEYS[e.code]); if (!holding(KEYS[e.code])) press(KEYS[e.code], false); }
    else if (e.code === 'Space' || e.code === 'ArrowDown' || e.code === 'Enter') plungeEnd();
  });

  function seg(ax, ay, bx, by, w, col) { cx.strokeStyle = col; cx.lineWidth = w * K; cx.lineCap = 'round'; cx.beginPath(); cx.moveTo(X(ax), Y(ay)); cx.lineTo(X(bx), Y(by)); cx.stroke(); }
  function label(t, x, y, size, col) { cx.fillStyle = col; cx.font = '800 ' + Math.max(8, size * K) + 'px Outfit, sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(t, X(x), Y(y)); }

  function table(s) {
    cx.fillStyle = '#EFEDE8'; cx.fillRect(0, 0, W, H);
    // the playfield: a ballpark at night
    const g = cx.createLinearGradient(0, Y(0), 0, Y(186));
    g.addColorStop(0, '#163a2c'); g.addColorStop(1, '#0d241b');
    cx.fillStyle = g; cx.beginPath(); cx.roundRect(X(2), Y(0), 97 * K, 188 * K, 14); cx.fill();
    // the diamond painted under the bumpers
    cx.strokeStyle = 'rgba(239,237,232,.12)'; cx.lineWidth = 1.5;
    cx.beginPath(); cx.moveTo(X(49), Y(42)); cx.lineTo(X(70), Y(66)); cx.lineTo(X(49), Y(92)); cx.lineTo(X(28), Y(66)); cx.closePath(); cx.stroke();
    // the base lanes
    ['1B', '2B', '3B'].forEach((t, i) => {
      const lit = s.lanes[i], x = C.LANES[i];
      cx.fillStyle = lit ? '#22B07D' : 'rgba(239,237,232,.14)';
      cx.beginPath(); cx.roundRect(X(x - 3.4), Y(C.LANE_Y[0]), 6.8 * K, (C.LANE_Y[1] - C.LANE_Y[0]) * K, 4); cx.fill();
      label(t, x, (C.LANE_Y[0] + C.LANE_Y[1]) / 2, 3.6, lit ? '#141414' : 'rgba(239,237,232,.7)');
    });
    // the Home Run ramp mouth
    const R = C.RAMP_IN, all = s.lanes.every(Boolean);
    cx.fillStyle = all ? 'rgba(224,83,61,.85)' : 'rgba(224,83,61,.35)';
    cx.beginPath(); cx.roundRect(X(R.x0), Y(R.y0 - 6), (R.x1 - R.x0) * K, (R.y1 - R.y0 + 6) * K, 5); cx.fill();
    cx.save(); cx.translate(X((R.x0 + R.x1) / 2), Y(R.y0 - 1)); cx.rotate(-Math.PI / 2);
    cx.fillStyle = '#fff'; cx.font = '800 ' + Math.max(7, 3.2 * K) + 'px Outfit, sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillText(all ? 'HOME RUN' : 'RAMP', 0, 0); cx.restore();
    // walls
    for (const w of S.WALLS) {
      const sling = w.tag === 'slingL' || w.tag === 'slingR', hot = sling && flash.some(f => f.what === w.tag);
      seg(w.ax, w.ay, w.bx, w.by, C.WALL_R * 2, w.tag === 'gate' ? 'rgba(239,237,232,.35)' : hot ? '#ffd23f' : sling ? '#E0533D' : '#cfd6cf');
    }
    // bumpers, each a hitter
    C.BUMPERS.forEach((p, i) => {
      const hot = i === s.day.hot, lit = flash.some(f => f.what === 'b' + i);
      cx.fillStyle = lit ? '#ffd23f' : hot ? '#E0533D' : '#22B07D';
      cx.beginPath(); cx.arc(X(p[0]), Y(p[1]), C.BUMPER_R * K, 0, Math.PI * 2); cx.fill();
      cx.strokeStyle = '#EFEDE8'; cx.lineWidth = 2; cx.stroke();
      const n = s.day.bumpers[i];
      label(n.length > 8 ? n.slice(0, 7) + '.' : n, p[0], p[1] - (hot ? 0.9 : 0), Math.min(3.1, 18 / n.length), '#fff');
      if (hot) label('x5', p[0], p[1] + 2.6, 2.6, '#fff');
    });
    // drop targets, each an arm
    C.TARGETS.forEach((y, i) => {
      if (s.targets[i]) seg(C.TARGETS_X, y[0], C.TARGETS_X, y[1], 1.8, '#ffd23f');
      else seg(C.TARGETS_X, y[0], C.TARGETS_X, y[1], 0.6, 'rgba(255,210,63,.3)');
      cx.save(); cx.translate(X(C.TARGETS_X - 3), Y((y[0] + y[1]) / 2)); cx.rotate(-Math.PI / 2);
      cx.fillStyle = s.targets[i] ? 'rgba(239,237,232,.8)' : 'rgba(239,237,232,.25)';
      cx.font = '700 ' + Math.max(7, 2.4 * K) + 'px DM Sans, sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.fillText(s.day.arms[i], 0, 0); cx.restore();
    });
    // the multiplier and the ball save light
    label('x' + s.mult, 49, 118, 7, s.mult > 1 ? '#ffd23f' : 'rgba(239,237,232,.25)');
    if (s.frame <= s.saveUntil) label('BALL SAVE', 49, 176, 3.2, (s.frame >> 4) & 1 ? '#22B07D' : 'rgba(34,176,125,.4)');
    if (s.tilt) label('TILT', 49, 100, 12, '#E0533D');
    // the nudge chip
    cx.fillStyle = S.waiting(s) ? 'rgba(239,237,232,.08)' : 'rgba(239,237,232,.18)';
    cx.beginPath(); cx.roundRect(X(NUDGE.x), Y(NUDGE.y) + 2, NUDGE.w * K - 4, NUDGE.h * K - 2, 6); cx.fill();
    label('NUDGE ' + Math.max(0, C.NUDGES_PER_BALL - s.nudges), NUDGE.x + NUDGE.w / 2, NUDGE.y + NUDGE.h / 2 + 0.5, 2.8, 'rgba(239,237,232,.8)');
  }
  function flipper(f, ang) {
    const t = S.flipperTip(f, ang);
    seg(f.px, f.py, t.x, t.y, C.FLIP_R * 2, '#EFEDE8');
    cx.fillStyle = '#E0533D'; cx.beginPath(); cx.arc(X(f.px), Y(f.py), C.FLIP_R * 0.7 * K, 0, Math.PI * 2); cx.fill();
  }
  function ball(x, y) {
    cx.fillStyle = '#ffffff'; cx.strokeStyle = '#141414'; cx.lineWidth = 1;
    cx.beginPath(); cx.arc(X(x), Y(y), C.BALL_R * K, 0, Math.PI * 2); cx.fill(); cx.stroke();
    cx.strokeStyle = '#E0533D'; cx.lineWidth = 1;
    cx.beginPath(); cx.arc(X(x - C.BALL_R * 0.9), Y(y), C.BALL_R * 0.7 * K, -0.9, 0.9); cx.stroke();
    cx.beginPath(); cx.arc(X(x + C.BALL_R * 0.9), Y(y), C.BALL_R * 0.7 * K, Math.PI - 0.9, Math.PI + 0.9); cx.stroke();
  }

  return {
    resize(w, h) { W = w; H = h; K = Math.min((W - 16) / 100, (H - 12) / TABLE_H); OX = (W - 100 * K) / 2 - K; OY = 6; },
    snap: s => ({ x: s.b.x, y: s.b.y, ball: s.ball, ramp: s.b.ramp, a: s.flippers.map(f => f.ang) }),
    onStart(s) { st = s; charge = -1; touches.clear(); flash = []; tiltShown = false; env.host.set('idle'); env.hint(S.waiting(s) ? 'Hold to pull the plunger, then let go' : ''); },
    onInput(inp) { if (inp.k === 'P') { env.sound.play('launch'); env.hint(''); } else if (inp.k[1] === '1') env.haptics.buzz(8); },
    onPause() { charge = -1; touches.clear(); keysDown.clear(); },
    onEvent(e, s) {
      const now = s.frame;
      flash = flash.filter(f => f.until > now);
      if (e.type === 'bumper') { flash.push({ what: 'b' + e.i, until: now + 6 }); env.sound.play('rail'); if (e.hot) env.pop(s.day.bumpers[e.i] + ' x5', '#E0533D'); }
      else if (e.type === 'sling') { flash.push({ what: e.side, until: now + 5 }); env.sound.play('rail'); }
      else if (e.type === 'flip') env.sound.play('land');
      else if (e.type === 'lane') { env.sound.play('good'); if (e.all) { env.pop('Bases loaded. Hit the ramp', '#22B07D'); env.host.set('hype'); } }
      else if (e.type === 'ramp') { env.pop('Ramp +' + C.PTS.ramp * s.mult, '#22B07D'); env.sound.play('good'); }
      else if (e.type === 'homer') { env.pop('HOME RUN +' + C.PTS.allBases * s.mult, '#E0533D'); env.sound.play('big'); env.host.set('celebrate'); env.haptics.buzz([20, 40, 20]); }
      else if (e.type === 'bank') { env.pop('Side retired. x' + e.mult, '#ffd23f'); env.sound.play('big'); env.host.set('hype'); }
      else if (e.type === 'target') env.sound.play('land');
      else if (e.type === 'nudge') env.haptics.buzz(30);
      else if (e.type === 'tilt') { env.pop('TILT', '#E0533D'); env.sound.play('foul'); env.host.set('disappointed'); env.haptics.buzz([60, 30, 60]); }
      else if (e.type === 'saved') { env.pop('Ball save', '#22B07D'); env.hint('Hold to pull the plunger, then let go'); }
      else if (e.type === 'search') env.hint('');
      else if (e.type === 'drain') { env.sound.play('foul'); env.host.set(e.score > 5000 ? 'idle' : 'disappointed'); if (!s.over) env.hint('Hold to pull the plunger, then let go'); }
    },
    onOver() { charge = -1; },
    hud(s) {
      return '<div class="stat"><b>' + S.scoreText(s.score) + '</b><span>Score</span></div>' +
        '<div class="stat"><b>' + Math.min(C.BALLS, s.ball + 1) + '/' + C.BALLS + '</b><span>Ball</span></div>' +
        '<div class="stat"><b>x' + s.mult + '</b><span>Multiplier</span></div>';
    },
    render(alpha, s, prev) {
      if (!st) { cx.fillStyle = '#EFEDE8'; cx.fillRect(0, 0, W, H); return; }
      flash = flash.filter(f => f.until > st.frame);
      // a flipper still up after a pause or a lost pointer comes down
      if (env.playing()) st.flippers.forEach(f => { if (f.held && !holding(f.side)) press(f.side, false); });
      table(st);
      st.flippers.forEach((f, i) => flipper(f, prev ? prev.a[i] + (f.ang - prev.a[i]) * alpha : f.ang));
      // the plunger, pulled back while it charges
      const pull = chargePower();
      seg(C.LANE_X, 178 + pull * 7, C.LANE_X, 186, 3, '#9aa39a');
      if (charge >= 0) { cx.fillStyle = '#ffd23f'; cx.fillRect(X(C.LANE_X + 4.6), Y(186 - pull * 40), 1.2 * K, pull * 40 * K); }
      const b = st.b;
      if (!b.ramp) {
        const p = prev && prev.ball === st.ball && !prev.ramp ? prev : null;
        const x = p ? p.x + (b.x - p.x) * alpha : b.x, y = p ? p.y + (b.y - p.y) * alpha : b.y;
        ball(x, b.rest ? y + pull * 7 : y);
      }
      if (env.DEBUG) env.debug('frame ' + st.frame + ' ball ' + st.ball + ' v ' + Math.hypot(b.vx, b.vy).toFixed(0) + ' slow ' + st.slow + '\nsave ' + Math.max(0, st.saveUntil - st.frame) + ' nudges ' + st.nudges + ' tilt ' + st.tilt + ' fps ' + env.fps().toFixed(0));
    }
  };
}

bootGame({
  id: 'pinball', name: 'Pinball', version: 'pin-1', sim: S, unit: 'points',
  rule: 'Three balls. Light the bases, hit the ramp.',
  howto: 'Tap the left or right half of the table to flip. Hold to pull the plunger, then let go. Light 1B, 2B and 3B, then hit the ramp for a Home Run. Knock down all three arms to raise the multiplier. Nudge twice a ball; the third is a tilt. Keyboard: Z and / (or the arrows) flip, Space plunges, N nudges.',
  resultExtra: d => d && d.hot ? '<p class="mut">Hot Athlete today: ' + d.hot + '. Top multiplier: x' + d.mult + '.</p>' : '',
  makeView
});
