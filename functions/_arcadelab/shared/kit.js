/* The browser half every Arcade Lab game shares: the API, the guest id, the
 * session, sound, haptics, the share sheet, the countdown and the host
 * character hook. Nothing here decides a score. */
import { msToNextDay } from './seed.js';

const LS = (() => { try { return window.localStorage; } catch (e) { return null; } })();
export function lsGet(k, d) { try { const v = LS && LS.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
export function lsSet(k, v) { try { LS && LS.setItem(k, v); } catch (e) {} }

const GUEST_KEY = 'arcade_lab_guest_v1';
export function guestId() {
  let g = lsGet(GUEST_KEY, null);
  if (!g) {
    const b = new Uint8Array(16); crypto.getRandomValues(b);
    g = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    lsSet(GUEST_KEY, g);
  }
  return g;
}

/* The session: resolves once auth.js has said who this is (or that it cannot). */
export function session() {
  const A = window.RTG_AUTH;
  return new Promise(res => {
    if (!A || !A.boot || !A.boot()) return res({ signedIn: false });
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; res({ signedIn: false }); } }, 4000);
    A.onChange(s => { if (done || !s || !s.resolved) return; done = true; clearTimeout(t); res(s); });
  });
}

export async function api(method, path, body) {
  const h = { 'Content-Type': 'application/json', 'X-Arcade-Guest': guestId() };
  const A = window.RTG_AUTH, t = A && A.token && A.token();
  if (t) h.Authorization = 'Bearer ' + t;
  const r = await fetch('/api/arcade/' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  let data = null; try { data = await r.json(); } catch (e) {}
  return { status: r.status, data };
}

/* Sound: effects only, synthesized, silent until the first tap, and a toggle
   that is remembered. Everything runs through one bus with a compressor, so a
   bumper rattle and a fanfare on top of it never clip. play(name, { pitch })
   takes a pitch multiplier, which is how a combo climbs. */
export function makeSound() {
  let ctx = null, bus = null, unlocked = false, muted = lsGet('arcade_lab_mute', '0') === '1', noiseBuf = null;
  function unlock() {
    if (unlocked) { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
    unlocked = true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 6;
      bus = ctx.createGain(); bus.gain.value = 0.9;
      bus.connect(comp).connect(ctx.destination);
      const n = ctx.sampleRate; noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ctx = null; }
  }
  const ok = () => ctx && bus && !muted;
  function tone(f, dur, type, vol, slide, at) {
    if (!ok()) return;
    const t = ctx.currentTime + (at || 0), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus); o.start(t); o.stop(t + dur + 0.03);
  }
  /* Filtered noise: a whoosh, a crowd, a swish, a thud. */
  function noise(dur, vol, filt, f0, f1, at, attack) {
    if (!ok()) return;
    const t = ctx.currentTime + (at || 0), s = ctx.createBufferSource(), g = ctx.createGain(), bq = ctx.createBiquadFilter();
    s.buffer = noiseBuf; s.loop = true;
    bq.type = filt || 'lowpass'; bq.frequency.setValueAtTime(f0 || 2000, t);
    if (f1) bq.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.08, t + (attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bq).connect(g).connect(bus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  const arp = (notes, step, dur, type, vol) => notes.forEach((f, i) => tone(f, dur, type, vol, 0, i * step));
  const SFX = {
    roll: () => noise(0.5, 0.06, 'lowpass', 500, 180, 0, 0.05),
    launch: p => { tone(300 * p, 0.18, 'triangle', 0.08, 560 * p); noise(0.2, 0.04, 'bandpass', 900, 2600); },
    land: () => { tone(140, 0.12, 'square', 0.07, 80); noise(0.08, 0.05, 'lowpass', 900); },
    rail: p => tone(220 * p, 0.06, 'square', 0.05),
    good: p => { tone(523 * p, 0.12, 'triangle', 0.12); tone(784 * p, 0.18, 'triangle', 0.12, 0, 0.09); },
    big: p => arp([523, 659, 784, 1047].map(f => f * p), 0.08, 0.16, 'square', 0.07),
    foul: () => tone(160, 0.3, 'sawtooth', 0.07, 80),
    coin: () => { tone(988, 0.07, 'square', 0.07); tone(1319, 0.32, 'square', 0.07, 0, 0.07); },
    count: () => tone(440, 0.12, 'square', 0.07),
    go: () => { tone(880, 0.32, 'square', 0.08); tone(1320, 0.32, 'triangle', 0.05); },
    tick: () => tone(1500, 0.03, 'square', 0.04),
    buzzer: () => { tone(110, 0.9, 'sawtooth', 0.09); tone(116, 0.9, 'square', 0.05); },
    cheer: () => { noise(1.4, 0.07, 'bandpass', 1400, 900, 0, 0.25); noise(1.1, 0.04, 'highpass', 3000, 2000, 0.05, 0.2); },
    groan: () => { noise(0.9, 0.06, 'lowpass', 600, 250, 0, 0.12); tone(220, 0.7, 'sine', 0.03, 140); },
    swish: () => noise(0.32, 0.09, 'highpass', 2500, 7000, 0, 0.02),
    whoosh: () => noise(0.35, 0.07, 'bandpass', 400, 2200, 0, 0.04),
    doink: () => { tone(1240, 0.5, 'square', 0.06, 1180); tone(1760, 0.4, 'triangle', 0.05); tone(620, 0.3, 'sine', 0.05); },
    thud: () => { tone(90, 0.16, 'sine', 0.2, 50); noise(0.06, 0.08, 'lowpass', 700); },
    whack: p => { tone(180 * p, 0.09, 'square', 0.1, 70); noise(0.05, 0.1, 'highpass', 2500); },
    peg: p => tone(660 * p, 0.05, 'triangle', 0.05),
    combo: p => { tone(660 * p, 0.08, 'square', 0.06); tone(990 * p, 0.1, 'triangle', 0.05, 0, 0.05); },
    bumper: p => { tone(392 * p, 0.09, 'square', 0.07, 784 * p); noise(0.04, 0.05, 'highpass', 3000); },
    flip: () => { tone(160, 0.05, 'square', 0.05, 110); noise(0.03, 0.04, 'lowpass', 1500); },
    drain: () => { tone(330, 0.6, 'sawtooth', 0.07, 70); },
    ding: p => { tone(1568 * p, 0.6, 'sine', 0.07); tone(2349 * p, 0.4, 'sine', 0.03); },
    over: () => arp([784, 659, 523, 392], 0.14, 0.22, 'square', 0.06),
    best: () => { arp([523, 659, 784, 1047, 1319], 0.09, 0.2, 'square', 0.06); tone(1568, 0.7, 'triangle', 0.07, 0, 0.5); },
    jackpot: () => { arp([784, 988, 1175, 1568, 1175, 1568, 2093], 0.06, 0.12, 'square', 0.05); noise(1.2, 0.05, 'bandpass', 1500, 900, 0.1, 0.2); }
  };
  /* THE ROOM. A bed of sound under the game, so the world is there between
     the moments: a crowd that murmurs and swells, a carnival organ, a studio
     audience, the other machines in an arcade. One at a time; it fades out on
     pause, mute and the result, and a swell() lifts it for a big moment. */
  let amb = null;
  function stopAmbient() {
    if (!amb) return;
    const a = amb; amb = null; clearInterval(a.timer);
    try { const t = ctx.currentTime; a.gain.gain.cancelScheduledValues(t); a.gain.gain.setTargetAtTime(0.0001, t, 0.25); setTimeout(() => a.nodes.forEach(n => { try { n.stop(); } catch (e) {} }), 1200); } catch (e) {}
  }
  function ambient(kind) {
    if (amb && amb.kind === kind) return; stopAmbient();
    if (!ctx || !bus || muted || !kind) { pendingAmb = kind; return; }
    pendingAmb = null;
    const gain = ctx.createGain(), nodes = [], t = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t); gain.gain.setTargetAtTime(1, t, 0.6); gain.connect(bus);
    const bed = (filt, f, q, vol, lfo) => {
      const s = ctx.createBufferSource(), bq = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf; s.loop = true; bq.type = filt; bq.frequency.value = f; bq.Q.value = q || 0.7; g.gain.value = vol;
      if (lfo) { const o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.value = lfo; og.gain.value = vol * 0.45; o.connect(og).connect(g.gain); o.start(); nodes.push(o); }
      s.connect(bq).connect(g).connect(gain); s.start(t, Math.random()); nodes.push(s);
    };
    const hum = (f, vol) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.value = vol; o.connect(g).connect(gain); o.start(); nodes.push(o); };
    let timer = 0;
    if (kind === 'crowd') {
      bed('bandpass', 700, 0.6, 0.035, 0.13); bed('bandpass', 1900, 0.9, 0.012, 0.21);
      timer = setInterval(() => { if (Math.random() < 0.35) noise(0.9 + Math.random(), 0.018, 'bandpass', 900 + Math.random() * 600, 700, 0, 0.3); if (Math.random() < 0.12) [0, 0.18].forEach(d => noise(0.08, 0.025, 'bandpass', 2400, 0, d)); }, 1400);
    } else if (kind === 'carnival') {
      bed('bandpass', 900, 0.5, 0.016, 0.1);
      const tune = [392, 523, 659, 523, 587, 494, 392, 440, 523, 494, 440, 392];
      let i = 0;
      timer = setInterval(() => { tone(tune[i % tune.length], 0.28, 'triangle', 0.02); if (i % 3 === 0) tone(tune[i % tune.length] / 2, 0.4, 'sine', 0.018); i++; }, 330);
    } else if (kind === 'studio') {
      hum(55, 0.012); bed('bandpass', 600, 0.5, 0.02, 0.08);
      timer = setInterval(() => { if (Math.random() < 0.3) noise(1.2, 0.012, 'bandpass', 800, 600, 0, 0.4); }, 1800);
    } else if (kind === 'arcade') {
      hum(60, 0.01); bed('lowpass', 400, 0.5, 0.015, 0.05);
      timer = setInterval(() => {
        const r = Math.random();
        if (r < 0.25) arp([660, 880, 1320].map(f => f * (0.7 + Math.random() * 0.6)), 0.06, 0.08, 'square', 0.008);
        else if (r < 0.4) tone(200 + Math.random() * 400, 0.18, 'square', 0.006, 80);
        else if (r < 0.5) noise(0.4, 0.01, 'lowpass', 500, 200, 0, 0.05);
      }, 900);
    }
    amb = { kind, gain, nodes, timer };
  }
  let pendingAmb = null;
  function swell(k) { if (!amb || !ctx) return; const t = ctx.currentTime, g = amb.gain.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(1 + (k || 1.5), t + 0.15); g.setTargetAtTime(1, t + 0.6, 0.8); }
  return {
    unlock() { const was = !!ctx; unlock(); if (!was && ctx && pendingAmb) ambient(pendingAmb); },
    get muted() { return muted; },
    toggle() { muted = !muted; lsSet('arcade_lab_mute', muted ? '1' : '0'); if (muted) { const k = amb && amb.kind; stopAmbient(); pendingAmb = k; } else if (pendingAmb) ambient(pendingAmb); return muted; },
    play(name, opt) { const f = SFX[name]; if (f && ok()) { try { f((opt && opt.pitch) || 1); } catch (e) {} } },
    ambient(kind) { try { ambient(kind); } catch (e) {} },
    stopAmbient() { pendingAmb = null; try { stopAmbient(); } catch (e) {} },
    swell(k) { try { swell(k); } catch (e) {} }
  };
}

export function makeHaptics() {
  let on = lsGet('arcade_lab_haptics', '1') === '1';
  return {
    get on() { return on; },
    toggle() { on = !on; lsSet('arcade_lab_haptics', on ? '1' : '0'); return on; },
    buzz(p) { if (on && navigator.vibrate) { try { navigator.vibrate(p); } catch (e) {} } }
  };
}

/* The host character hook. The art comes later; anything that wants to draw
   the host reads window.ARCADE_HOST or the element's data attributes. */
export function makeHost(el) {
  const st = { mood: 'idle', state: 'idle' };
  window.ARCADE_HOST = st;
  function set(mood, state) {
    st.mood = mood; st.state = state || mood;
    if (el) { el.dataset.mood = st.mood; el.dataset.state = st.state; }
  }
  set('idle');
  /* A callout bubble beside the host, the way a cabinet's announcer talks. */
  let bt = 0;
  function say(text) {
    const b = document.getElementById('say'); if (!b) return;
    b.textContent = text; b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
    clearTimeout(bt); bt = setTimeout(() => b.classList.remove('on'), 1600);
  }
  return { set, say, get: () => ({ ...st }) };
}

export async function share(text) {
  if (navigator.share) { try { await navigator.share({ text }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; } }
  try { await navigator.clipboard.writeText(text); return 'copied'; } catch (e) { return 'failed'; }
}

export function countdown(el) {
  function tick() {
    const ms = msToNextDay(Date.now()), s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60;
    el.textContent = h + ':' + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0');
  }
  tick(); return setInterval(tick, 1000);
}

export const reducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
