/* Hoop Shoot in the browser: the swipe, the court from behind the shooter,
 * the clock and the streaks. The rules are sim.js, which the server replays. */
import { CONFIG as C } from './config.js';
import * as S from './sim.js';
import { bootGame } from '../../shared/app.js';

function makeView(env) {
  const cv = env.canvas, cx = env.ctx;
  let W = 1, H = 1, st = null, sw = null, trail = [], lastR = 0;
  const keys = { left: false, right: false, charging: false, chargeT: 0, aim: 0 };
  /* A camera behind and above the shooter. */
  const CAM_Y = -5, CAM_Z = 6.3;
  let F = 1, HOR = 0;
  const PX = (x, y) => W / 2 + x / (y - CAM_Y) * F;
  const PY = (y, z) => HOR + (CAM_Z - z) / (y - CAM_Y) * F;
  const ellipse = (x, y, z, r, stroke, w) => {
    cx.beginPath();
    for (let i = 0; i <= 32; i++) { const t = i / 32 * Math.PI * 2, X = x + r * Math.cos(t), Y = y + r * Math.sin(t); i ? cx.lineTo(PX(X, Y), PY(Y, z)) : cx.moveTo(PX(X, Y), PY(Y, z)); }
    cx.strokeStyle = stroke; cx.lineWidth = w; cx.stroke();
  };

  function court(hx) {
    cx.fillStyle = '#1d2129'; cx.fillRect(0, 0, W, H);
    // the floor, wood toward the camera
    const g = cx.createLinearGradient(0, PY(20, 0), 0, H);
    g.addColorStop(0, '#9c6a3c'); g.addColorStop(1, '#c58f58');
    cx.fillStyle = g;
    cx.beginPath(); cx.moveTo(PX(-14, 22), PY(22, 0)); cx.lineTo(PX(14, 22), PY(22, 0)); cx.lineTo(PX(14, -4.5), PY(-4.5, 0)); cx.lineTo(PX(-14, -4.5), PY(-4.5, 0)); cx.closePath(); cx.fill();
    // the lane
    cx.fillStyle = 'rgba(34,176,125,.35)';
    cx.beginPath(); cx.moveTo(PX(-4, 16.3), PY(16.3, 0)); cx.lineTo(PX(4, 16.3), PY(16.3, 0)); cx.lineTo(PX(4, 3), PY(3, 0)); cx.lineTo(PX(-4, 3), PY(3, 0)); cx.closePath(); cx.fill();
    // the backboard and its support
    const by = C.HOOP_Y + C.RIM_R + C.BOARD_GAP;
    cx.strokeStyle = '#555'; cx.lineWidth = 4; cx.beginPath(); cx.moveTo(PX(hx, by + 2), PY(by + 2, 0)); cx.lineTo(PX(hx, by + 2), PY(by + 2, C.BOARD_HI + 1)); cx.stroke();
    cx.fillStyle = 'rgba(235,245,255,.85)'; cx.strokeStyle = '#fff'; cx.lineWidth = 2;
    const bx0 = PX(hx - C.BOARD_HALF, by), bx1 = PX(hx + C.BOARD_HALF, by), byt = PY(by, C.BOARD_HI), byb = PY(by, C.BOARD_LO);
    cx.fillRect(bx0, byt, bx1 - bx0, byb - byt); cx.strokeRect(bx0, byt, bx1 - bx0, byb - byt);
    cx.strokeStyle = '#E0533D'; cx.lineWidth = 2;
    const sx0 = PX(hx - 1, by), sx1 = PX(hx + 1, by), sy0 = PY(by, C.RIM_Z + 1.5), sy1 = PY(by, C.RIM_Z);
    cx.strokeRect(sx0, sy0, sx1 - sx0, sy1 - sy0);
  }
  function rimBack(hx) { ellipse(hx, C.HOOP_Y, C.RIM_Z, C.RIM_R, '#c4421f', 3); }
  function net(hx) {
    cx.strokeStyle = 'rgba(255,255,255,.75)'; cx.lineWidth = 1.2;
    for (let i = 0; i < 12; i++) {
      const t = i / 12 * Math.PI * 2, x = hx + C.RIM_R * Math.cos(t), y = C.HOOP_Y + C.RIM_R * Math.sin(t);
      const x2 = hx + C.RIM_R * 0.55 * Math.cos(t), y2 = C.HOOP_Y + C.RIM_R * 0.55 * Math.sin(t);
      cx.beginPath(); cx.moveTo(PX(x, y), PY(y, C.RIM_Z)); cx.lineTo(PX(x2, y2), PY(y2, C.RIM_Z - 1.4)); cx.stroke();
    }
  }
  function rimFront(hx) {
    cx.beginPath();
    for (let i = 0; i <= 16; i++) { const t = Math.PI * (i / 16), X = hx + C.RIM_R * Math.cos(t), Y = C.HOOP_Y - C.RIM_R * Math.sin(t); i ? cx.lineTo(PX(X, Y), PY(Y, C.RIM_Z)) : cx.moveTo(PX(X, Y), PY(Y, C.RIM_Z)); }
    cx.strokeStyle = '#E0533D'; cx.lineWidth = 4; cx.stroke();
  }
  function ball(b, x, y, z) {
    const r = C.BALL_R / (y - CAM_Y) * F;
    cx.fillStyle = 'rgba(0,0,0,.25)'; cx.beginPath(); cx.ellipse(PX(x, y), PY(y, 0), r, r * 0.35, 0, 0, Math.PI * 2); cx.fill();
    const X = PX(x, y), Y = PY(y, z);
    if (b && b.fire) { cx.fillStyle = 'rgba(255,140,0,.35)'; cx.beginPath(); cx.arc(X, Y, r * 1.8, 0, Math.PI * 2); cx.fill(); }
    cx.fillStyle = b && b.money ? '#E0533D' : '#e8812e';
    cx.beginPath(); cx.arc(X, Y, r, 0, Math.PI * 2); cx.fill();
    cx.strokeStyle = b && b.money ? '#fff' : '#3a1d06'; cx.lineWidth = Math.max(1, r * 0.12);
    cx.beginPath(); cx.arc(X, Y, r, 0, Math.PI * 2); cx.moveTo(X - r, Y); cx.lineTo(X + r, Y); cx.moveTo(X, Y - r); cx.lineTo(X, Y + r); cx.stroke();
  }

  /* ---- input: a swipe up from the rack ---- */
  const pt = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() }; };
  const ready = () => env.playing() && st && st.reload === 0 && st.frame < C.CLOCK_FRAMES;
  cv.addEventListener('pointerdown', e => {
    if (!env.playing()) return;
    const p = pt(e); if (p.y < H * 0.5) return;
    cv.setPointerCapture(e.pointerId); sw = { pts: [p] }; trail = [p]; e.preventDefault();
  });
  cv.addEventListener('pointermove', e => { if (!sw) return; const p = pt(e); sw.pts.push(p); trail.push(p); if (trail.length > 20) trail.shift(); });
  cv.addEventListener('pointerup', e => {
    if (!sw) return;
    const pts = sw.pts.concat([pt(e)]); sw = null;
    const a = pts[0], b = pts[pts.length - 1];
    let i = pts.length - 1; while (i > 0 && b.t - pts[i - 1].t < 90) i--;
    const s0 = pts[i] === b ? a : pts[i];
    const dy = a.y - b.y, dx = b.x - a.x;
    if (dy < 24 || !ready()) return;
    const speed = Math.hypot(b.x - s0.x, b.y - s0.y) / Math.max(16, b.t - s0.t);
    const p = Math.max(0, Math.min(1, (speed - 0.3) / (2.3 - 0.3)));
    const aim = Math.max(-C.MAX_AIM, Math.min(C.MAX_AIM, Math.atan2(dx, dy) * 0.5));
    env.input({ a: Math.round(aim * 10000) / 10000, p: Math.round(p * 10000) / 10000 });
  });
  cv.addEventListener('pointercancel', () => { sw = null; });
  addEventListener('keydown', e => {
    if (!env.playing()) return;
    if (e.key === 'ArrowLeft') { keys.left = true; e.preventDefault(); }
    else if (e.key === 'ArrowRight') { keys.right = true; e.preventDefault(); }
    else if (e.key === ' ' && !e.repeat) { keys.charging = true; keys.chargeT = 0; e.preventDefault(); }
  });
  addEventListener('keyup', e => {
    if (e.key === 'ArrowLeft') keys.left = false;
    else if (e.key === 'ArrowRight') keys.right = false;
    else if (e.key === ' ' && keys.charging) { keys.charging = false; if (ready()) env.input({ a: Math.round(keys.aim * 10000) / 10000, p: Math.round(keys.chargeT * 10000) / 10000 }); keys.chargeT = 0; e.preventDefault(); }
  });

  const clock = s => Math.max(0, Math.ceil((C.CLOCK_FRAMES - s.frame) / 60));
  return {
    resize(w, h) { W = w; H = h; HOR = H * 0.3; F = Math.min(W, H * 0.62) * 1.55; },
    snap(s) { const o = {}; for (const b of s.balls) o[b.id] = { x: b.x, y: b.y, z: b.z }; return { balls: o, hx: s.hx }; },
    onStart(s) { st = s; env.hint(s.shots === 0 ? 'Swipe up to shoot' : ''); env.host.set('idle'); },
    onInput() { env.hint(''); env.haptics.buzz(8); env.sound.play('launch'); },
    onPause() { sw = null; keys.charging = false; },
    onEvent(e) {
      if (e.type === 'rim') env.sound.play('rail');
      else if (e.type === 'glass') env.sound.play('land');
      else if (e.type === 'make') {
        env.sound.play(e.kind === 'swish' ? 'big' : 'good'); env.haptics.buzz(18);
        env.pop((e.kind === 'swish' ? 'SWISH' : e.kind === 'glass' ? 'OFF GLASS' : 'IN') + ' +' + e.pts, e.money ? '#E0533D' : '#22B07D');
      } else if (e.type === 'miss') { if (st.streak === 0) env.host.set('idle'); }
      else if (e.type === 'fire') { env.pop('ON FIRE', '#e8812e'); env.host.set('hype'); env.sound.play('big'); }
      else if (e.type === 'horn') { env.pop('BUZZER', '#141414'); env.sound.play('foul'); }
    },
    onOver(s) { env.host.set(s.made >= 22 ? 'celebrate' : 'idle'); },
    hud(s) {
      return '<div class="stat"><b>' + s.score + '</b><span>Points</span></div>' +
        '<div class="stat"><b>' + clock(s) + '</b><span>Seconds</span></div>' +
        '<div class="stat"><b>' + s.streak + (s.fireLeft ? '<span style="color:#e8812e"> F</span>' : '') + '</b><span>In a row</span></div>';
    },
    render(alpha, s, prev) {
      if (!st) { cx.fillStyle = '#1d2129'; cx.fillRect(0, 0, W, H); return; }
      const now = performance.now(), dt = lastR ? Math.min(0.05, (now - lastR) / 1000) : 0; lastR = now;
      if (env.playing()) {
        if (keys.left) keys.aim = Math.max(-C.MAX_AIM, keys.aim - 0.3 * dt);
        if (keys.right) keys.aim = Math.min(C.MAX_AIM, keys.aim + 0.3 * dt);
        if (keys.charging) keys.chargeT = Math.min(1, keys.chargeT + dt / 1.1);
      }
      const hx = prev ? prev.hx + (st.hx - prev.hx) * alpha : st.hx;
      court(hx); rimBack(hx); net(hx);
      // balls behind the rim plane first, then the front of the rim, then the rest
      const live = st.balls.filter(b => !b.done).map(b => {
        const p = prev && prev.balls[b.id];
        return { b, x: p ? p.x + (b.x - p.x) * alpha : b.x, y: p ? p.y + (b.y - p.y) * alpha : b.y, z: p ? p.z + (b.z - p.z) * alpha : b.z };
      }).sort((a, b) => b.y - a.y);
      for (const o of live) if (o.y > C.HOOP_Y - C.RIM_R && o.z < C.RIM_Z + 0.5) ball(o.b, o.x, o.y, o.z);
      rimFront(hx);
      for (const o of live) if (!(o.y > C.HOOP_Y - C.RIM_R && o.z < C.RIM_Z + 0.5)) ball(o.b, o.x, o.y, o.z);
      // the next ball in the rack
      if (st.frame < C.CLOCK_FRAMES && st.reload === 0) ball({ money: st.shots % C.MONEY_EVERY === C.MONEY_EVERY - 1, fire: st.fireLeft > 0 }, 0, 0, C.RELEASE_Z - 4.2);
      if (keys.charging || keys.left || keys.right) {
        const mh = H * 0.28, my = H - mh - 16;
        cx.fillStyle = 'rgba(255,255,255,.25)'; cx.fillRect(W - 22, my, 12, mh);
        cx.fillStyle = '#22B07D'; cx.fillRect(W - 22, my + mh * (1 - keys.chargeT), 12, mh * keys.chargeT);
        cx.strokeStyle = 'rgba(255,255,255,.6)'; cx.setLineDash([4, 6]); cx.lineWidth = 2;
        cx.beginPath(); cx.moveTo(PX(0, 0), PY(0, 2)); cx.lineTo(PX(C.HOOP_Y * Math.tan(keys.aim), C.HOOP_Y), PY(C.HOOP_Y, 0)); cx.stroke(); cx.setLineDash([]);
      }
      if (sw && trail.length > 1) {
        cx.strokeStyle = 'rgba(255,255,255,.7)'; cx.lineWidth = 5; cx.lineCap = 'round';
        cx.beginPath(); trail.forEach((p, i) => i ? cx.lineTo(p.x, p.y) : cx.moveTo(p.x, p.y)); cx.stroke();
      }
      if (st.frame < C.CLOCK_FRAMES && st.frame > C.STILL_FRAMES - 180 && st.frame < C.STILL_FRAMES) {
        cx.fillStyle = 'rgba(255,255,255,.9)'; cx.font = '700 14px DM Sans, sans-serif'; cx.textAlign = 'center';
        cx.fillText('The hoop starts moving in ' + Math.ceil((C.STILL_FRAMES - st.frame) / 60), W / 2, H * 0.12);
      }
      if (env.DEBUG) env.debug('balls ' + st.balls.length + ' shots ' + st.shots + ' made ' + st.made + ' hx ' + st.hx.toFixed(2) + '\nmove ' + JSON.stringify(st.day.move));
    }
  };
}

bootGame({
  id: 'hoop-shoot', name: 'Hoop Shoot', version: 'hoop-1', sim: S, unit: 'points',
  rule: '60 seconds. Swipe to shoot. Hit the money ball.',
  howto: 'Swipe up from the ball. The angle of the swipe aims, its speed is the power. Every fifth ball is the money ball, worth double. Four in a row puts you on fire. Keyboard: arrows aim, hold Space to charge.',
  resultExtra: d => '<p class="mut">' + d.made + ' of ' + d.shots + ' shots. ' + d.kinds.swish + ' swishes.</p>',
  makeView
});
