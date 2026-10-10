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
   that is remembered. */
export function makeSound() {
  let ctx = null, unlocked = false, muted = lsGet('arcade_lab_mute', '0') === '1';
  function unlock() {
    if (unlocked) return; unlocked = true;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; }
  }
  function tone(f, dur, type, vol, slide) {
    if (!ctx || muted) return;
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(vol || 0.15, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol) {
    if (!ctx || muted) return;
    const n = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = ctx.createBufferSource(), g = ctx.createGain(); g.gain.value = vol || 0.08;
    s.buffer = b; s.connect(g).connect(ctx.destination); s.start();
  }
  return {
    unlock, get muted() { return muted; },
    toggle() { muted = !muted; lsSet('arcade_lab_mute', muted ? '1' : '0'); return muted; },
    play(name) {
      if (name === 'roll') noise(0.35, 0.05);
      else if (name === 'launch') tone(300, 0.18, 'triangle', 0.08, 520);
      else if (name === 'land') tone(140, 0.12, 'square', 0.08, 90);
      else if (name === 'rail') tone(220, 0.06, 'square', 0.05);
      else if (name === 'good') { tone(523, 0.12, 'triangle', 0.12); setTimeout(() => tone(784, 0.18, 'triangle', 0.12), 90); }
      else if (name === 'big') { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'square', 0.08), i * 80)); }
      else if (name === 'foul') tone(160, 0.3, 'sawtooth', 0.07, 80);
    }
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
  return { set, get: () => ({ ...st }) };
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
