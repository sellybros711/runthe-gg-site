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
  return {
    unlock, get muted() { return muted; },
    toggle() { muted = !muted; lsSet('arcade_lab_mute', muted ? '1' : '0'); return muted; },
    play(name, opt) { const f = SFX[name]; if (f && ok()) { try { f((opt && opt.pitch) || 1); } catch (e) {} } }
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
