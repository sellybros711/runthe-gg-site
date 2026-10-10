/* Roll-Ball in the browser: aiming, drawing, and what a result looks like.
 * The rules are sim.js, the same file the server replays; the shell
 * (shared/app.js) runs the loop and records the throws. */
import { CONFIG as C } from './config.js';
import * as S from './sim.js';
import { bootGame } from '../../shared/app.js';

const ZONE_NAME = { '1B': 'SINGLE', '2B': 'DOUBLE', '3B': 'TRIPLE', HR: 'HOME RUN', F: 'FOUL' };
const ZONE_COL = { '1B': '#22B07D', '2B': '#d9a51c', '3B': '#e07a2a', HR: '#E0533D', F: '#141414' };

function makeView(env) {
  const cv = env.canvas, cx = env.ctx;
  let W = 1, H = 1, DPR = 1, KX = 1, KY = 1, BOTTOM = 0, boardImg = null, st = null;
  let aim = null, keyAngle = 0;
  const keys = { left: false, right: false, charging: false, chargeT: 0 };
  const FAR = 345;
  const sOf = y => 1 - 0.36 * Math.max(0, Math.min(1, y / FAR));
  /* The lane is foreshortened harder than the board, so the board (where the
     scoring happens) gets most of the screen. */
  const proj = y => y < C.LIP_Y ? y * 0.62 : C.LIP_Y * 0.62 + (y - C.LIP_Y) * 1.02;
  const SX = (x, y) => W / 2 + x * KX * sOf(y);
  const SY = y => BOTTOM - proj(y) * KY;

  function circlePts(x0, y0, r, n = 56) {
    const pts = [];
    for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2, x = x0 + r * Math.cos(t), y = y0 + r * Math.sin(t); pts.push([SX(x, y), SY(y)]); }
    return pts;
  }
  const quad = (g, pts) => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); };
  const rect = (x0, y0, x1, y1) => [[SX(x0, y0), SY(y0)], [SX(x1, y0), SY(y0)], [SX(x1, y1), SY(y1)], [SX(x0, y1), SY(y1)]];

  function drawBoard() {
    const off = document.createElement('canvas'); off.width = W * DPR; off.height = H * DPR;
    const g = off.getContext('2d'); g.scale(DPR, DPR);
    const L = st.layout;
    g.fillStyle = '#d9d5cc'; quad(g, rect(-C.BOARD_HALF - 8, C.BOARD_FRONT - 8, C.BOARD_HALF + 8, C.BOARD_BACK + 6)); g.fill();
    g.fillStyle = '#20231f'; quad(g, rect(-C.BOARD_HALF, C.BOARD_FRONT, C.BOARD_HALF, C.BOARD_BACK)); g.fill();
    const lane = g.createLinearGradient(0, SY(0), 0, SY(C.LIP_Y));
    lane.addColorStop(0, '#c99a62'); lane.addColorStop(1, '#a87a46');
    g.fillStyle = lane; quad(g, rect(-C.LANE_HALF - 3, -14, C.LANE_HALF + 3, C.LIP_Y)); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.08)'; g.lineWidth = 1;
    for (let x = -C.LANE_HALF + 7; x < C.LANE_HALF; x += 7) { g.beginPath(); g.moveTo(SX(x, -14), SY(-14)); g.lineTo(SX(x, C.LIP_Y), SY(C.LIP_Y)); g.stroke(); }
    g.fillStyle = '#141414';
    quad(g, rect(-C.LANE_HALF - 7, -14, -C.LANE_HALF - 3, C.LIP_Y)); g.fill();
    quad(g, rect(C.LANE_HALF + 3, -14, C.LANE_HALF + 7, C.LIP_Y)); g.fill();
    g.fillStyle = '#3a3a36';
    quad(g, [[SX(-C.LANE_HALF - 7, C.LIP_Y), SY(C.LIP_Y)], [SX(C.LANE_HALF + 7, C.LIP_Y), SY(C.LIP_Y)],
      [SX(C.BOARD_HALF, C.BOARD_FRONT), SY(C.BOARD_FRONT)], [SX(-C.BOARD_HALF, C.BOARD_FRONT), SY(C.BOARD_FRONT)]]); g.fill();
    g.fillStyle = '#E0533D'; quad(g, rect(-C.LANE_HALF - 7, C.LIP_Y, C.LANE_HALF + 7, C.LIP_Y + 4)); g.fill();
    const fills = { '1B': '#1d7f5c', '2B': '#a77d12', '3B': '#b45a19' }, zones = ['1B', '2B', '3B'];
    L.ring.r.forEach((r, i) => {
      const z = zones[i];
      quad(g, circlePts(L.ring.x, L.ring.y, r)); g.fillStyle = fills[z]; g.fill();
      g.lineWidth = z === st.day.hot ? 3.5 : 2; g.strokeStyle = z === st.day.hot ? '#ffe680' : 'rgba(255,255,255,.75)'; g.stroke();
    });
    g.fillStyle = 'rgba(255,255,255,.92)'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const lbl = (t, x, y, sz) => { g.font = '800 ' + Math.round(sz * sOf(y)) + 'px Outfit, sans-serif'; g.fillText(t, SX(x, y), SY(y)); };
    const [r1, r2, r3] = L.ring.r;
    lbl('1B', L.ring.x, L.ring.y - (r1 + r2) / 2, 13); lbl('2B', L.ring.x, L.ring.y - (r2 + r3) / 2, 12); lbl('3B', L.ring.x, L.ring.y, 10);
    const hy = st.day.hot === '1B' ? L.ring.y + (r1 + r2) / 2 : st.day.hot === '2B' ? L.ring.y + (r2 + r3) / 2 : L.ring.y + r3 + 4;
    g.fillStyle = '#ffe680'; lbl('HOT +1', L.ring.x, Math.min(hy, L.ring.y + r1 - 4), 10);
    boardImg = off;
  }

  function drawPockets(frame) {
    for (const p of st.layout.pockets) {
      const c = S.pocketAt(p, frame);
      quad(cx, circlePts(c.x, c.y, C.POCKET_R + 2.5, 32)); cx.fillStyle = '#E0533D'; cx.fill();
      quad(cx, circlePts(c.x, c.y, C.POCKET_R, 32)); cx.fillStyle = '#0b0b0b'; cx.fill();
      cx.fillStyle = '#fff'; cx.font = '800 ' + Math.round(10 * sOf(c.y)) + 'px Outfit, sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.fillText('HR', SX(c.x, c.y + C.POCKET_R + 7), SY(c.y + C.POCKET_R + 7));
      if (p.slide && !env.RM) {
        cx.strokeStyle = 'rgba(224,83,61,.35)'; cx.lineWidth = 1.5; cx.setLineDash([3, 4]);
        cx.beginPath(); cx.moveTo(SX(p.x - p.slide.amp, p.y), SY(p.y)); cx.lineTo(SX(p.x + p.slide.amp, p.y), SY(p.y)); cx.stroke(); cx.setLineDash([]);
      }
    }
  }

  function drawBall(x, y, z) {
    const s = sOf(y), r = 3.6 * KX * s;
    cx.fillStyle = 'rgba(0,0,0,.25)';
    cx.beginPath(); cx.ellipse(SX(x, y), SY(y) + r * 0.4, r * 1.05, r * 0.45, 0, 0, Math.PI * 2); cx.fill();
    const bx = SX(x, y), by = SY(y) - z * KY * 0.9 * s;
    const gr = cx.createRadialGradient(bx - r * 0.35, by - r * 0.4, r * 0.2, bx, by, r);
    gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#c9c5bb');
    cx.fillStyle = gr; cx.beginPath(); cx.arc(bx, by, r, 0, Math.PI * 2); cx.fill();
    cx.strokeStyle = '#141414'; cx.lineWidth = 1.2; cx.stroke();
  }

  function drawAim() {
    const a = aim ? aim.a : keyAngle, p = aim ? aim.p : keys.chargeT;
    if (!aim && !keys.charging && !keys.left && !keys.right) return;
    const len = 40 + p * (C.LIP_Y - 30);
    cx.fillStyle = 'rgba(20,20,20,.55)';
    for (let d = 10; d < len; d += 9) {
      const x = d * Math.sin(a), y = d * Math.cos(a);
      if (Math.abs(x) > C.LANE_HALF) break;
      cx.beginPath(); cx.arc(SX(x, y), SY(y), 2.1 * sOf(y), 0, Math.PI * 2); cx.fill();
    }
    const mx = W - 22, mh = H * 0.3, my = H - mh - 16;
    cx.fillStyle = 'rgba(20,20,20,.12)'; cx.fillRect(mx, my, 12, mh);
    cx.fillStyle = p > 0.85 ? '#E0533D' : '#22B07D'; cx.fillRect(mx, my + mh * (1 - p), 12, mh * p);
    cx.strokeStyle = '#141414'; cx.lineWidth = 1.5; cx.strokeRect(mx, my, 12, mh);
  }

  function drawDebug() {
    const L = st.layout;
    cx.strokeStyle = '#0f0'; cx.lineWidth = 1;
    for (const r of L.ring.r) { quad(cx, circlePts(L.ring.x, L.ring.y, r)); cx.stroke(); }
    for (const p of L.pockets) { const c = S.pocketAt(p, st.frame); quad(cx, circlePts(c.x, c.y, C.POCKET_R, 24)); cx.stroke(); }
    env.debug('layout ' + L.id + '  hot ' + st.day.hot + '  phase ' + st.phase + '\nV ' + C.V_MIN + '..' + C.V_MAX +
      '  carry ' + C.CARRY_S + '  jitter ' + C.CARRY_JITTER + '\nball ' + st.x.toFixed(1) + ',' + st.y.toFixed(1) + ' z' + st.z.toFixed(1));
  }

  /* ---- input ---- */
  const PULL_FULL = () => Math.max(120, Math.min(H * 0.26, H - SY(C.LIP_Y) - 20));
  const stagePt = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const ready = () => env.playing() && st && st.phase === 'ready';
  cv.addEventListener('pointerdown', e => {
    if (!ready()) return;
    const p = stagePt(e);
    // a drag can start anywhere on the lane, so a thumb has room to pull back
    if (p.y < SY(C.LIP_Y) - 30) return;
    cv.setPointerCapture(e.pointerId);
    aim = { from: p, a: 0, p: 0 };
    e.preventDefault();
  });
  cv.addEventListener('pointermove', e => {
    if (!aim) return;
    const p = stagePt(e), dx = p.x - aim.from.x, pull = Math.max(0, p.y - aim.from.y);
    aim.p = Math.max(0, Math.min(1, pull / PULL_FULL()));
    // a slingshot: pull back and to the left to roll right
    aim.a = Math.max(-C.MAX_ANGLE, Math.min(C.MAX_ANGLE, Math.atan2(-dx, Math.max(30, pull)) * 0.9));
  });
  const r4 = v => Math.round(v * 10000) / 10000;
  const fire = (a, p) => env.input({ a: r4(Math.max(-C.MAX_ANGLE, Math.min(C.MAX_ANGLE, a))), p: r4(Math.max(0, Math.min(1, p))) });
  cv.addEventListener('pointerup', () => { if (!aim) return; const a = aim; aim = null; if (a.p >= 0.04 && ready()) fire(a.a, a.p); });
  cv.addEventListener('pointercancel', () => { aim = null; });
  addEventListener('keydown', e => {
    if (!ready()) return;
    if (e.key === 'ArrowLeft') { keys.left = true; e.preventDefault(); }
    else if (e.key === 'ArrowRight') { keys.right = true; e.preventDefault(); }
    else if (e.key === ' ' && !e.repeat) { keys.charging = true; keys.chargeT = 0; e.preventDefault(); }
  });
  addEventListener('keyup', e => {
    if (e.key === 'ArrowLeft') keys.left = false;
    else if (e.key === 'ArrowRight') keys.right = false;
    else if (e.key === ' ' && keys.charging) { keys.charging = false; if (keys.chargeT >= 0.04 && ready()) fire(keyAngle, keys.chargeT); keys.chargeT = 0; e.preventDefault(); }
  });

  function diamond() {
    const last = st.results[st.results.length - 1], reached = last ? last.bases : 0;
    const pts = [[26, 46], [46, 26], [26, 6], [6, 26]];
    let s = '<svg class="diamond" viewBox="0 0 52 52" aria-hidden="true"><path d="M26 46 L46 26 L26 6 L6 26 Z" fill="none" stroke="#141414" stroke-width="2"/>';
    pts.forEach((p, i) => {
      const lit = i === 0 ? reached >= 4 : reached >= i;
      s += '<rect x="' + (p[0] - 5) + '" y="' + (p[1] - 5) + '" width="10" height="10" transform="rotate(45 ' + p[0] + ' ' + p[1] + ')" fill="' +
        (lit ? (reached >= 4 ? '#E0533D' : '#22B07D') : '#fff') + '" stroke="#141414" stroke-width="1.5"/>';
    });
    return s + '</svg>';
  }

  let lastR = 0;
  return {
    resize(w, h, dpr) {
      W = w; H = h; DPR = dpr;
      KX = (Math.min(W, H * 0.7) * 0.47) / ((C.BOARD_HALF + 8) * sOf(C.BOARD_FRONT));
      BOTTOM = H * 0.9; KY = (H * 0.84) / proj(FAR); boardImg = null;
    },
    snap: s => ({ x: s.x, y: s.y, z: s.z, ball: s.ball }),
    onStart(s) { st = s; boardImg = null; aim = null; keyAngle = 0; env.hint(s.ball === 0 && s.phase === 'ready' ? 'Touch the lane, pull back, let go' : ''); env.host.set('idle'); },
    onInput() { env.sound.play('roll'); env.haptics.buzz(12); env.hint(''); env.host.set(st.ball >= 7 ? 'nervous' : 'idle', 'watching'); },
    onPause() { aim = null; keys.charging = false; },
    onEvent(e) {
      if (e.type === 'launch') env.sound.play('launch');
      else if (e.type === 'land') { env.sound.play('land'); env.haptics.buzz(20); }
      else if (e.type === 'rail') env.sound.play('rail');
      else if (e.type === 'result') {
        env.pop(ZONE_NAME[e.zone] + (e.hot ? ' +1' : ''), ZONE_COL[e.zone]);
        if (e.zone === 'HR') { env.sound.play('big'); env.haptics.buzz([30, 40, 60]); env.host.set('hype', 'homer'); }
        else if (e.zone === 'F') { env.sound.play('foul'); env.host.set('disappointed', 'foul'); }
        else { env.sound.play('good'); env.host.set(e.zone === '3B' ? 'celebrate' : 'idle', 'hit'); }
      } else if (e.type === 'next') env.host.set(e.ball >= 7 ? 'nervous' : 'idle', 'ready');
    },
    onOver(s) { env.host.set(s.score >= 24 ? 'celebrate' : s.score <= 11 ? 'disappointed' : 'idle', 'over'); },
    hud(s) {
      return '<div class="stat"><b>' + s.score + '</b><span>Bases</span></div>' +
        '<div class="stat"><b id="hBall">' + Math.min(C.BALLS, s.ball + 1) + '/' + C.BALLS + '</b><span>Ball</span></div>' + diamond();
    },
    render(alpha, s, prev) {
      cx.fillStyle = '#EFEDE8'; cx.fillRect(0, 0, W, H);
      if (!st) return;
      // the keyboard aims and charges on the wall clock; only the final angle and power are an input
      const now = performance.now(), dt = lastR ? Math.min(0.05, (now - lastR) / 1000) : 0; lastR = now;
      if (keys.charging && ready()) keys.chargeT = Math.min(1, keys.chargeT + dt / 1.3);
      if (ready()) { if (keys.left) keyAngle = Math.max(-C.MAX_ANGLE, keyAngle - 0.36 * dt); if (keys.right) keyAngle = Math.min(C.MAX_ANGLE, keyAngle + 0.36 * dt); }
      if (!boardImg) drawBoard();
      cx.drawImage(boardImg, 0, 0, W, H);
      drawPockets(st.frame);
      const p = prev && prev.ball === st.ball ? prev : null;
      const ix = p ? p.x + (st.x - p.x) * alpha : st.x, iy = p ? p.y + (st.y - p.y) * alpha : st.y, iz = p ? p.z + (st.z - p.z) * alpha : st.z;
      if (st.phase !== 'over') drawBall(ix, iy, iz);
      if (st.phase === 'ready') drawAim();
      if (env.DEBUG) drawDebug();
    }
  };
}

bootGame({
  id: 'roll-ball', name: 'Roll-Ball', version: 'rollball-2', sim: S, unit: 'bases out of 36',
  rule: 'Roll nine balls. Land them in the rings. Rack up bases.',
  howto: 'Touch the lane, pull back and let go. Pull further for more power, sideways to aim. Keyboard: arrows aim, hold Space to charge.',
  resultExtra: d => d.cycle ? '<p>Hit for the cycle<span class="badge">CYCLE</span></p>' : '',
  makeView
});
