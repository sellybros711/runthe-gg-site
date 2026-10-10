/* Field Goal Flick in the browser: the flick, the view from behind the
 * kicker, and the call. The rules are sim.js, which the server replays. */
import { CONFIG as C } from './config.js';
import * as S from './sim.js';
import { bootGame } from '../../shared/app.js';

const CALL_COL = { GOOD: '#22B07D', DOINK: '#22B07D', 'WIDE LEFT': '#E0533D', 'WIDE RIGHT': '#E0533D', SHORT: '#E0533D' };

function makeView(env) {
  const cv = env.canvas, cx = env.ctx;
  let W = 1, H = 1, st = null, flick = null, trail = [];
  const keys = { left: false, right: false, charging: false, chargeT: 0, aim: 0 };
  let lastR = 0;
  /* A camera eight yards behind the tee, two yards up. */
  const CAM_BACK = 8, CAM_H = 2.2;
  let HOR = 0, F = 1;
  const PX = (x, y) => W / 2 + x / (y + CAM_BACK) * F;
  const PY = (y, z) => HOR + (CAM_H - z) / (y + CAM_BACK) * F;
  const kickNow = () => st && st.day.kicks[Math.min(st.kick, C.KICKS - 1)];

  function field() {
    const sky = cx.createLinearGradient(0, 0, 0, HOR);
    sky.addColorStop(0, '#bcd7ef'); sky.addColorStop(1, '#eaf2f8');
    cx.fillStyle = sky; cx.fillRect(0, 0, W, HOR);
    // stands
    cx.fillStyle = '#5a5f6a'; cx.fillRect(0, HOR - H * 0.06, W, H * 0.06);
    for (let i = 0; i < 80; i++) { cx.fillStyle = ['#E0533D', '#22B07D', '#f2f2f2', '#d9a51c'][i % 4]; cx.globalAlpha = 0.35; cx.fillRect((i * 37) % W, HOR - H * 0.055 + (i % 5) * 4, 3, 3); }
    cx.globalAlpha = 1;
    const g = cx.createLinearGradient(0, HOR, 0, H);
    g.addColorStop(0, '#3f8f4c'); g.addColorStop(1, '#2f7a3c');
    cx.fillStyle = g; cx.fillRect(0, HOR, W, H - HOR);
    const k = kickNow();
    // mowed stripes and the yard lines, every five yards from the tee to past the posts
    const far = (k ? k.yards : 40) + 12;
    for (let y = 0; y < far; y += 5) {
      const a = PY(y, 0), b = PY(y + 5, 0);
      if (Math.floor(y / 5) % 2) { cx.fillStyle = 'rgba(255,255,255,.04)'; cx.fillRect(0, b, W, a - b); }
      cx.strokeStyle = 'rgba(255,255,255,.55)'; cx.lineWidth = Math.max(1, 2 * F / (y + CAM_BACK) / 40);
      cx.beginPath(); cx.moveTo(PX(-30, y), a); cx.lineTo(PX(30, y), a); cx.stroke();
    }
  }

  function posts(D) {
    const lw = Math.max(2, 0.25 * F / (D + CAM_BACK));
    cx.strokeStyle = '#ffd23f'; cx.lineCap = 'round'; cx.lineWidth = lw * 1.4;
    cx.beginPath(); cx.moveTo(PX(0, D), PY(D, 0)); cx.lineTo(PX(0, D), PY(D, C.BAR)); cx.stroke();
    cx.lineWidth = lw;
    cx.beginPath(); cx.moveTo(PX(-C.HALF_WIDTH, D), PY(D, C.BAR)); cx.lineTo(PX(C.HALF_WIDTH, D), PY(D, C.BAR));
    cx.moveTo(PX(-C.HALF_WIDTH, D), PY(D, C.BAR)); cx.lineTo(PX(-C.HALF_WIDTH, D), PY(D, C.BAR + 10));
    cx.moveTo(PX(C.HALF_WIDTH, D), PY(D, C.BAR)); cx.lineTo(PX(C.HALF_WIDTH, D), PY(D, C.BAR + 10)); cx.stroke();
  }

  function ballAt(x, y, z, big) {
    const r = Math.max(2.5, 0.35 * F / (y + CAM_BACK)) * (big || 1);
    cx.fillStyle = 'rgba(0,0,0,.22)'; cx.beginPath(); cx.ellipse(PX(x, y), PY(y, 0), r, r * 0.35, 0, 0, Math.PI * 2); cx.fill();
    cx.save(); cx.translate(PX(x, y), PY(y, z)); cx.rotate(-0.4);
    cx.fillStyle = '#8a4b22'; cx.beginPath(); cx.ellipse(0, 0, r * 1.25, r * 0.8, 0, 0, Math.PI * 2); cx.fill();
    cx.strokeStyle = '#fff'; cx.lineWidth = Math.max(1, r * 0.12); cx.beginPath(); cx.moveTo(-r * 0.4, 0); cx.lineTo(r * 0.4, 0); cx.stroke();
    cx.restore();
  }

  /* Where the ball is at share u of its flight. */
  function flightPos(f, D, u) {
    const endY = f.t >= 1 ? f.range : D * 1.18;
    const y = endY * u, R = f.range;
    const h = Math.max(0, C.PEAK * 4 * (y / R) * (1 - y / R) * Math.min(1, R / 60));
    const x = y * Math.tan(f.aim) + f.drift * (y / D) * (y / D);
    return { x, y, z: h };
  }

  function wind(k) {
    const x0 = W - 92, y0 = 14;
    cx.fillStyle = 'rgba(255,255,255,.88)'; cx.strokeStyle = 'rgba(20,20,20,.15)';
    cx.beginPath(); cx.roundRect(x0, y0, 80, 62, 12); cx.fill(); cx.stroke();
    cx.fillStyle = '#141414'; cx.font = '700 11px DM Sans, sans-serif'; cx.textAlign = 'center';
    cx.fillText('WIND', x0 + 40, y0 + 15);
    const mph = Math.round(Math.hypot(k.cross, k.along));
    cx.font = '800 18px Outfit, sans-serif'; cx.fillText(mph + ' mph', x0 + 40, y0 + 52);
    // the arrow points where the wind blows: right is right, up the screen is a tailwind
    const ang = Math.atan2(-k.along, k.cross), L = 14 + Math.min(1, mph / 16) * 14;
    cx.save(); cx.translate(x0 + 40, y0 + 28); cx.rotate(ang);
    cx.strokeStyle = '#E0533D'; cx.fillStyle = '#E0533D'; cx.lineWidth = 3;
    cx.beginPath(); cx.moveTo(-L / 2, 0); cx.lineTo(L / 2, 0); cx.stroke();
    cx.beginPath(); cx.moveTo(L / 2 + 3, 0); cx.lineTo(L / 2 - 5, -5); cx.lineTo(L / 2 - 5, 5); cx.closePath(); cx.fill();
    cx.restore();
    // the flag atop the left post leans with it
    const D = k.yards, fx = PX(-C.HALF_WIDTH, D), fy = PY(D, C.BAR + 10), lean = Math.max(-1, Math.min(1, k.cross / 14));
    cx.fillStyle = '#E0533D'; cx.beginPath(); cx.moveTo(fx, fy); cx.lineTo(fx + lean * 14, fy + 3); cx.lineTo(fx, fy + 7); cx.closePath(); cx.fill();
  }

  /* ---- input: a flick up from the ball ---- */
  const pt = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() }; };
  const ready = () => env.playing() && st && st.phase === 'ready';
  cv.addEventListener('pointerdown', e => {
    if (!ready()) return;
    const p = pt(e);
    if (p.y < H * 0.45) return;
    cv.setPointerCapture(e.pointerId); flick = { pts: [p] }; trail = [p]; e.preventDefault();
  });
  cv.addEventListener('pointermove', e => { if (!flick) return; const p = pt(e); flick.pts.push(p); trail.push(p); if (trail.length > 24) trail.shift(); });
  cv.addEventListener('pointerup', e => {
    if (!flick) return;
    const pts = flick.pts.concat([pt(e)]); flick = null;
    const a = pts[0], b = pts[pts.length - 1];
    // speed over the last stretch of the swipe, which is what the release feels like
    let i = pts.length - 1; while (i > 0 && b.t - pts[i - 1].t < 90) i--;
    const s0 = pts[i] === b ? a : pts[i];
    const dy = a.y - b.y, dx = b.x - a.x;
    if (dy < 30 || !ready()) return;
    const speed = Math.hypot(b.x - s0.x, b.y - s0.y) / Math.max(16, b.t - s0.t);
    const p = Math.max(0, Math.min(1, (speed - 0.25) / (2.4 - 0.25)));
    const aim = Math.max(-C.MAX_AIM, Math.min(C.MAX_AIM, Math.atan2(dx, dy) * 0.55));
    env.input({ a: Math.round(aim * 10000) / 10000, p: Math.round(p * 10000) / 10000 });
  });
  cv.addEventListener('pointercancel', () => { flick = null; });
  addEventListener('keydown', e => {
    if (!ready()) return;
    if (e.key === 'ArrowLeft') { keys.left = true; e.preventDefault(); }
    else if (e.key === 'ArrowRight') { keys.right = true; e.preventDefault(); }
    else if (e.key === ' ' && !e.repeat) { keys.charging = true; keys.chargeT = 0; e.preventDefault(); }
  });
  addEventListener('keyup', e => {
    if (e.key === 'ArrowLeft') keys.left = false;
    else if (e.key === 'ArrowRight') keys.right = false;
    else if (e.key === ' ' && keys.charging) {
      keys.charging = false;
      if (ready() && keys.chargeT > 0.05) env.input({ a: Math.round(keys.aim * 10000) / 10000, p: Math.round(keys.chargeT * 10000) / 10000 });
      keys.chargeT = 0; e.preventDefault();
    }
  });

  return {
    resize(w, h) { W = w; H = h; HOR = H * 0.34; F = Math.min(W, H * 0.62) * 1.25; },
    snap: () => null,
    onStart(s) { st = s; trail = []; env.hint(s.kick === 0 && s.phase === 'ready' ? 'Flick up from the ball' : ''); env.host.set('idle'); },
    onInput() { env.sound.play('launch'); env.haptics.buzz(15); env.hint(''); trail = []; },
    onPause() { flick = null; keys.charging = false; },
    onEvent(e) {
      if (e.type === 'result') {
        env.pop(e.call === 'DOINK' ? 'DOINK... GOOD!' : e.call + (e.pts ? '  +' + e.pts : ''), CALL_COL[e.call]);
        if (e.call === 'GOOD' || e.call === 'DOINK') { env.sound.play(e.call === 'DOINK' ? 'big' : 'good'); env.host.set('celebrate'); env.haptics.buzz(30); }
        else { env.sound.play('foul'); env.host.set('disappointed'); }
      } else if (e.type === 'next') env.host.set(e.kick >= 3 ? 'nervous' : 'idle');
    },
    onOver(s) { env.host.set(s.score >= s.day.max * 0.7 ? 'celebrate' : 'idle'); },
    hud(s) {
      const k = kickNow();
      return '<div class="stat"><b>' + s.score + '</b><span>Points</span></div>' +
        '<div class="stat"><b>' + Math.min(C.KICKS, s.kick + 1) + '/' + C.KICKS + '</b><span>Kick</span></div>' +
        (k ? '<div class="stat"><b>' + k.yards + '</b><span>Yards</span></div>' : '');
    },
    render() {
      cx.fillStyle = '#EFEDE8'; cx.fillRect(0, 0, W, H);
      if (!st) return;
      const now = performance.now(), dt = lastR ? Math.min(0.05, (now - lastR) / 1000) : 0; lastR = now;
      if (ready()) {
        if (keys.left) keys.aim = Math.max(-C.MAX_AIM, keys.aim - 0.25 * dt);
        if (keys.right) keys.aim = Math.min(C.MAX_AIM, keys.aim + 0.25 * dt);
        if (keys.charging) keys.chargeT = Math.min(1, keys.chargeT + dt / 1.3);
      }
      const k = kickNow();
      field(); posts(k.yards);
      if (st.phase === 'ready' || st.phase === 'over') wind(k);
      if (st.flight) {
        const u = st.phase === 'flight' ? Math.min(1, st.phaseFrame / C.FLIGHT_FRAMES) : 1;
        const pos = flightPos(st.flight, k.yards, u);
        ballAt(pos.x, pos.y, pos.z);
      } else ballAt(0, 0, 0.1, 1.2);
      if (ready() && (keys.charging || keys.left || keys.right)) {
        cx.strokeStyle = 'rgba(255,255,255,.7)'; cx.setLineDash([4, 6]); cx.lineWidth = 2;
        cx.beginPath(); cx.moveTo(PX(0, 0), PY(0, 0)); cx.lineTo(PX(k.yards * Math.tan(keys.aim), k.yards), PY(k.yards, 0)); cx.stroke(); cx.setLineDash([]);
        const mh = H * 0.3, my = H - mh - 16;
        cx.fillStyle = 'rgba(20,20,20,.2)'; cx.fillRect(W - 22, my, 12, mh);
        cx.fillStyle = keys.chargeT > C.OVERHIT ? '#E0533D' : '#22B07D'; cx.fillRect(W - 22, my + mh * (1 - keys.chargeT), 12, mh * keys.chargeT);
      }
      if (flick && trail.length > 1) {
        cx.strokeStyle = 'rgba(255,255,255,.75)'; cx.lineWidth = 5; cx.lineCap = 'round';
        cx.beginPath(); trail.forEach((p, i) => i ? cx.lineTo(p.x, p.y) : cx.moveTo(p.x, p.y)); cx.stroke();
      }
      if (env.DEBUG) env.debug('kick ' + st.kick + ' ' + JSON.stringify(k) + '\nflight ' + (st.flight ? st.flight.call + ' x' + st.flight.x.toFixed(2) + ' h' + st.flight.h.toFixed(2) : '-'));
    }
  };
}

bootGame({
  id: 'field-goal-flick', name: 'Field Goal Flick', version: 'fgf-1', sim: S, unit: 'points',
  rule: 'Five kicks. Read the wind. Flick it through.',
  howto: 'Flick up from the ball. The angle of the flick aims it, the speed of the flick is the power. Read the wind flag first. Keyboard: arrows aim, hold Space to charge.',
  resultExtra: d => '<p class="mut">Best possible today: ' + d.max + '</p>',
  makeView
});
