/* Hoop Shoot in the browser: the swipe, the court from behind the shooter,
 * the clock and the streaks. The rules are sim.js, which the server replays. */
import { CONFIG as C } from './config.js';
import * as S from './sim.js';
import { bootGame } from '../../shared/app.js';

function makeView(env) {
  const cv = env.canvas, cx = env.ctx;
  let W = 1, H = 1, st = null, sw = null, trail = [], lastR = 0;
  let crowd = [], rimT = -9999, netT = -9999, lastClock = -1, emberAt = 0, hornT = -9999;
  const now = () => performance.now();
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

  /* The arena: a dark bowl of fans with flashbulbs, two spotlights on the hoop. */
  function arena() {
    const g = cx.createLinearGradient(0, 0, 0, H * 0.6);
    g.addColorStop(0, '#0b0d14'); g.addColorStop(1, '#1d2129');
    cx.fillStyle = g; cx.fillRect(0, 0, W, H);
    const t = now();
    for (const c of crowd) {
      cx.fillStyle = c.col; cx.globalAlpha = 0.55;
      cx.beginPath(); cx.arc(c.x, c.y + Math.sin(t / 380 + c.ph) * (st && st.fireLeft ? 2.5 : 0.8), c.r, 0, Math.PI * 2); cx.fill();
      if (!env.RM && ((t / 70 + c.ph * 50) | 0) % 997 === 0) { cx.globalAlpha = 0.9; cx.fillStyle = '#fff'; cx.beginPath(); cx.arc(c.x, c.y, c.r * 1.6, 0, Math.PI * 2); cx.fill(); }
    }
    cx.globalAlpha = 1;
    for (const sx of [0.08, 0.92]) {
      const sg = cx.createLinearGradient(W * sx, 0, W / 2, H * 0.35);
      sg.addColorStop(0, 'rgba(255,240,200,.16)'); sg.addColorStop(1, 'rgba(255,240,200,0)');
      cx.fillStyle = sg; cx.beginPath(); cx.moveTo(W * sx - 10, 0); cx.lineTo(W * sx + 10, 0); cx.lineTo(W / 2 + W * 0.18, H * 0.42); cx.lineTo(W / 2 - W * 0.18, H * 0.42); cx.closePath(); cx.fill();
    }
  }
  /* Two lit panels in the top corners, clear of the glass: the score and the clock. */
  function scoreboard() {
    const cl = clock(st), low = cl <= 10 && st.frame < C.CLOCK_FRAMES, blink = low && !env.RM && ((now() / 250) | 0) % 2;
    const w = Math.min(92, W * 0.24), h = 50, y = 8;
    const panel = (x, txt, col, cap) => {
      cx.fillStyle = '#050608'; cx.strokeStyle = '#3a3f4b'; cx.lineWidth = 2;
      cx.beginPath(); cx.roundRect(x, y, w, h, 8); cx.fill(); cx.stroke();
      cx.textBaseline = 'middle'; cx.textAlign = 'center';
      cx.font = '28px "Russo One", Outfit, sans-serif';
      cx.fillStyle = 'rgba(255,255,255,.06)'; cx.fillText('88', x + w / 2, y + 22);
      cx.fillStyle = col; cx.shadowColor = col; cx.shadowBlur = env.RM ? 0 : 10; cx.fillText(txt, x + w / 2, y + 22); cx.shadowBlur = 0;
      cx.font = '700 9px DM Sans, sans-serif'; cx.fillStyle = '#8a90a0'; cx.fillText(cap, x + w / 2, y + h - 8);
    };
    panel(8, String(st.score), st.fireLeft ? '#ff5a1f' : '#ff8a2a', st.fireLeft ? 'ON FIRE' : 'SCORE');
    panel(W - w - 8, String(cl).padStart(2, '0'), blink ? '#ff2a2a' : low ? '#ff5a4a' : '#ffd23f', 'TIME');
  }
  function court(hx) {
    arena();
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
    cx.fillStyle = 'rgba(235,245,255,.85)'; cx.strokeStyle = st && st.fireLeft ? '#ff8a2a' : '#fff'; cx.lineWidth = st && st.fireLeft ? 4 : 2;
    if (st && st.fireLeft && !env.RM) { cx.shadowColor = '#ff6a00'; cx.shadowBlur = 22 + 8 * Math.sin(now() / 90); }
    const bx0 = PX(hx - C.BOARD_HALF, by), bx1 = PX(hx + C.BOARD_HALF, by), byt = PY(by, C.BOARD_HI), byb = PY(by, C.BOARD_LO);
    cx.fillRect(bx0, byt, bx1 - bx0, byb - byt); cx.strokeRect(bx0, byt, bx1 - bx0, byb - byt); cx.shadowBlur = 0;
    cx.strokeStyle = '#E0533D'; cx.lineWidth = 2;
    const sx0 = PX(hx - 1, by), sx1 = PX(hx + 1, by), sy0 = PY(by, C.RIM_Z + 1.5), sy1 = PY(by, C.RIM_Z);
    cx.strokeRect(sx0, sy0, sx1 - sx0, sy1 - sy0);
  }
  function rimBack(hx) { ellipse(hx, C.HOOP_Y, C.RIM_Z, C.RIM_R, '#c4421f', 3); }
  /* The net, which stretches and sways when a ball goes through. */
  function net(hx) {
    const age = (now() - netT) / 1000, k = env.RM || age > 0.7 ? 0 : Math.exp(-age * 5) * Math.sin(age * 22);
    const drop = 1.4 + (env.RM ? 0 : Math.max(0, k) * 0.9), sway = k * 0.12;
    cx.strokeStyle = 'rgba(255,255,255,.8)'; cx.lineWidth = 1.2;
    const bot = [];
    for (let i = 0; i < 12; i++) {
      const t = i / 12 * Math.PI * 2, x = hx + C.RIM_R * Math.cos(t), y = C.HOOP_Y + C.RIM_R * Math.sin(t);
      const x2 = hx + sway + C.RIM_R * 0.5 * Math.cos(t), y2 = C.HOOP_Y + C.RIM_R * 0.5 * Math.sin(t);
      bot.push([PX(x2, y2), PY(y2, C.RIM_Z - drop)]);
      cx.beginPath(); cx.moveTo(PX(x, y), PY(y, C.RIM_Z)); cx.lineTo(bot[i][0], bot[i][1]); cx.stroke();
      const t2 = (i + 1) / 12 * Math.PI * 2, x3 = hx + C.RIM_R * Math.cos(t2), y3 = C.HOOP_Y + C.RIM_R * Math.sin(t2);
      cx.globalAlpha = 0.45; cx.beginPath(); cx.moveTo(PX(x, y), PY(y, C.RIM_Z)); cx.lineTo(PX((x3 + x2) / 2, (y3 + y2) / 2), PY((y3 + y2) / 2, C.RIM_Z - drop * 0.55)); cx.stroke(); cx.globalAlpha = 1;
    }
    cx.beginPath(); bot.forEach((p, i) => i ? cx.lineTo(p[0], p[1]) : cx.moveTo(p[0], p[1])); cx.closePath(); cx.stroke();
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
    // a highlight, then the seams, turning with the backspin
    const hl = cx.createRadialGradient(X - r * 0.4, Y - r * 0.4, r * 0.1, X, Y, r);
    hl.addColorStop(0, 'rgba(255,255,255,.35)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = hl; cx.beginPath(); cx.arc(X, Y, r, 0, Math.PI * 2); cx.fill();
    const rot = b && b.at != null && !env.RM ? -(now() / 140) : 0;
    cx.strokeStyle = b && b.money ? '#fff' : '#3a1d06'; cx.lineWidth = Math.max(1, r * 0.12);
    cx.save(); cx.translate(X, Y); cx.rotate(rot);
    cx.beginPath(); cx.arc(0, 0, r, 0, Math.PI * 2); cx.moveTo(-r, 0); cx.lineTo(r, 0); cx.moveTo(0, -r); cx.lineTo(0, r);
    cx.moveTo(-r * 0.7, -r * 0.7); cx.quadraticCurveTo(0, -r * 0.2, r * 0.7, -r * 0.7); cx.moveTo(-r * 0.7, r * 0.7); cx.quadraticCurveTo(0, r * 0.2, r * 0.7, r * 0.7);
    cx.stroke(); cx.restore();
    if (b && b.fire && b.at != null && !env.RM && now() - emberAt > 30) { emberAt = now(); env.fx.burst(X, Y, { n: 3, colors: ['#ff8a2a', '#ffd23f', '#E0533D'], speed: 60, gravity: -120, life: 420, size: r * 0.35 }); }
  }

  /* Your hands, either side of the ball, so you are the one shooting. */
  function hands(x, y, r, up) {
    for (const side of [-1, 1]) {
      cx.save(); cx.translate(x + side * r * 0.95, y + r * (up ? 0.35 : 0.55)); cx.rotate(side * (up ? 0.25 : 0.5));
      cx.fillStyle = '#c98b5a'; cx.strokeStyle = '#3a1d06'; cx.lineWidth = 2;
      cx.beginPath(); cx.roundRect(-r * 0.32, -r * 0.55, r * 0.64, r * 1.6, r * 0.3); cx.fill(); cx.stroke();
      cx.fillStyle = '#E0533D'; cx.fillRect(-r * 0.36, r * 0.7, r * 0.72, r * 0.25);
      cx.restore();
    }
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
    resize(w, h) {
      W = w; H = h; HOR = H * 0.3; F = Math.min(W, H * 0.62) * 1.55;
      const cols = ['#E0533D', '#ffd23f', '#4a6fd8', '#22B07D', '#d8dde4', '#ff8a2a'];
      crowd = []; for (let i = 0; i < 160; i++) { const u = (i * 0.618034) % 1, v = ((i * 0.41421) % 1); crowd.push({ x: u * W, y: H * 0.05 + v * H * 0.24, r: 2 + v * 2.4, col: cols[i % cols.length], ph: u * 20 }); }
    },
    snap(s) { const o = {}; for (const b of s.balls) o[b.id] = { x: b.x, y: b.y, z: b.z }; return { balls: o, hx: s.hx }; },
    onStart(s) { st = s; lastClock = -1; netT = rimT = hornT = -9999; env.hint(''); env.host.set('idle'); },
    onInput() { env.hint(''); env.haptics.buzz(8); env.sound.play('launch'); },
    onPause() { sw = null; keys.charging = false; },
    onEvent(e) {
      const RX = PX(st.hx, C.HOOP_Y), RY = PY(C.HOOP_Y, C.RIM_Z);
      if (e.type === 'rim') { env.sound.play('rail', { pitch: 0.8 }); rimT = now(); env.fx.burst(RX, RY, { n: 5, colors: ['#ff8a2a', '#fff'], speed: 90, life: 260, size: 2, gravity: 200 }); }
      else if (e.type === 'glass') { env.sound.play('land'); env.fx.shake(2, 100); }
      else if (e.type === 'shot') env.sound.play('whoosh');
      else if (e.type === 'make') {
        netT = now();
        env.sound.play(e.kind === 'swish' ? 'swish' : 'good', { pitch: 1 + Math.min(0.5, st.streak * 0.06) });
        if (e.kind === 'swish' || e.money) env.sound.play('cheer');
        env.sound.swell(e.money || e.kind === 'swish' ? 2.2 : 1);
        env.haptics.buzz(18);
        env.pop((e.kind === 'swish' ? 'SWISH' : e.kind === 'glass' ? 'OFF GLASS' : 'IN') + ' +' + e.pts, e.money ? '#E0533D' : e.fire ? '#e8812e' : '#22B07D');
        env.fx.text(RX, RY - 10, '+' + e.pts, e.money ? '#ffd23f' : '#fff', e.money ? 30 : 24);
        env.fx.burst(RX, RY + 12, { n: e.money ? 30 : 14, colors: e.money ? ['#ffd23f', '#fff6c4', '#E0533D'] : e.fire ? ['#ff8a2a', '#ffd23f'] : ['#ffffff', '#ff8a2a'], speed: 180, angle: Math.PI / 2, spread: 2.2 });
        if (e.money) { env.fx.flash('#ffd23f', 200, 0.22); env.fx.shake(4, 200); env.host.say('Money!'); }
        else if (st.streak === 2) env.host.say('Heating up!');
        else if (st.streak === 3) env.host.say('One more...');
        else if (e.kind === 'swish' && st.streak > 4) env.host.say('Nothing but net!');
      } else if (e.type === 'miss') { if (st.streak === 0) env.host.set('idle'); }
      else if (e.type === 'fire') { env.pop('ON FIRE', '#e8812e'); env.host.set('hype'); env.host.say('On fire!'); env.sound.play('jackpot'); env.fx.flash('#ff6a00', 300, 0.3); env.fx.shake(6, 300); }
      else if (e.type === 'horn') { hornT = now(); env.pop('BUZZER', '#E0533D'); env.sound.play('buzzer'); env.fx.flash('#E0533D', 400, 0.35); env.fx.shake(5, 300); }
    },
    onOver(s) { env.host.set(s.made >= 22 ? 'celebrate' : 'idle'); },
    coach(s) {
      if (s.reload || s.frame >= C.CLOCK_FRAMES || sw) return null;
      const x = PX(0, 0), y = PY(0, C.RELEASE_Z - 4.2);
      return { x0: x, y0: y, x1: x + 4, y1: y - H * 0.38 };
    },
    hud(s) {
      return '<div class="stat"><b>' + s.score + '</b><span>Points</span></div>' +
        '<div class="stat"><b>' + clock(s) + '</b><span>Seconds</span></div>' +
        '<div class="stat"><b>' + s.streak + (s.fireLeft ? '<span style="color:#e8812e"> F</span>' : '') + '</b><span>In a row</span></div>';
    },
    render(alpha, s, prev) {
      if (!st) { cx.fillStyle = '#1d2129'; cx.fillRect(0, 0, W, H); return; }
      const tw = performance.now(), dt = lastR ? Math.min(0.05, (tw - lastR) / 1000) : 0; lastR = tw;
      if (env.playing()) {
        if (keys.left) keys.aim = Math.max(-C.MAX_AIM, keys.aim - 0.3 * dt);
        if (keys.right) keys.aim = Math.min(C.MAX_AIM, keys.aim + 0.3 * dt);
        if (keys.charging) keys.chargeT = Math.min(1, keys.chargeT + dt / 1.1);
      }
      const hx = prev ? prev.hx + (st.hx - prev.hx) * alpha : st.hx;
      // the rim rattles after a ball catches it
      const ra = (now() - rimT) / 1000, jig = env.RM || ra > 0.4 ? 0 : Math.exp(-ra * 10) * Math.sin(ra * 70) * 0.18;
      court(hx); rimBack(hx + jig); net(hx + jig);
      // the last ten seconds tick
      const cl = clock(st);
      if (env.playing() && cl !== lastClock) { if (lastClock > 0 && cl <= 10 && cl > 0) env.sound.play(cl <= 3 ? 'count' : 'tick'); if (cl === 10 && lastClock === 11) env.host.say('Ten seconds!'); lastClock = cl; }
      // balls behind the rim plane first, then the front of the rim, then the rest
      const live = st.balls.filter(b => !b.done).map(b => {
        const p = prev && prev.balls[b.id];
        return { b, x: p ? p.x + (b.x - p.x) * alpha : b.x, y: p ? p.y + (b.y - p.y) * alpha : b.y, z: p ? p.z + (b.z - p.z) * alpha : b.z };
      }).sort((a, b) => b.y - a.y);
      for (const o of live) if (o.y > C.HOOP_Y - C.RIM_R && o.z < C.RIM_Z + 0.5) ball(o.b, o.x, o.y, o.z);
      rimFront(hx + jig);
      for (const o of live) if (!(o.y > C.HOOP_Y - C.RIM_R && o.z < C.RIM_Z + 0.5)) ball(o.b, o.x, o.y, o.z);
      // the next ball in the rack
      if (st.frame < C.CLOCK_FRAMES && st.reload === 0) {
        const money = st.shots % C.MONEY_EVERY === C.MONEY_EVERY - 1;
        const rx = PX(0, 0), ry = PY(0, C.RELEASE_Z - 4.2), rr = C.BALL_R / (0 - CAM_Y) * F;
        if (sw && trail.length && !env.RM) {
          // the ball is in your hand: it goes where the finger goes
          const p = trail[trail.length - 1], dx = Math.max(-W * 0.3, Math.min(W * 0.3, p.x - sw.pts[0].x)), dy = Math.max(-H * 0.3, Math.min(0, p.y - sw.pts[0].y));
          cx.save(); cx.translate(dx, dy); hands(rx, ry, rr, true); ball({ money, fire: st.fireLeft > 0 }, 0, 0, C.RELEASE_Z - 4.2); cx.restore();
        } else { hands(rx, ry, rr, false); ball({ money, fire: st.fireLeft > 0 }, 0, 0, C.RELEASE_Z - 4.2); }
        if (money) { cx.fillStyle = '#ffd23f'; cx.font = '800 13px Outfit, sans-serif'; cx.textAlign = 'center'; cx.fillText('MONEY BALL x' + C.MONEY_MULT, PX(0, 0), PY(0, C.RELEASE_Z - 4.2) - C.BALL_R / (0 - CAM_Y) * F - 10); }
      }
      scoreboard();
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
        cx.fillText('The hoop starts moving in ' + Math.ceil((C.STILL_FRAMES - st.frame) / 60), W / 2, H * 0.62);
      }
      if (env.DEBUG) env.debug('balls ' + st.balls.length + ' shots ' + st.shots + ' made ' + st.made + ' hx ' + st.hx.toFixed(2) + '\nmove ' + JSON.stringify(st.day.move));
    }
  };
}

bootGame({
  id: 'hoop-shoot', name: 'Hoop Shoot', version: 'hoop-1', sim: S, unit: 'points', ambient: 'crowd',
  rule: '60 seconds. Swipe to shoot. Hit the money ball.',
  howto: 'Swipe up from the ball. The angle of the swipe aims, its speed is the power. Every fifth ball is the money ball, worth double. Four in a row puts you on fire. Keyboard: arrows aim, hold Space to charge.',
  resultExtra: d => '<p class="mut">' + d.made + ' of ' + d.shots + ' shots. ' + d.kinds.swish + ' swishes.</p>',
  makeView
});
