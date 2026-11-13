/* THE SOUND. Every sound is made on the spot with WebAudio: no files. The
 * AudioContext is made on the first user gesture (unlock(), called from a
 * pointerdown), never on boot, so no browser blocks it and nothing plays
 * before the player has touched the page. Muted is remembered (localStorage,
 * wrapped, as everything on this page is); sound is on by default.
 *
 *   tick    a dribble, during the hold
 *   swish   a make through the net
 *   rim     a miss off the iron
 *   buzzer  the horn
 *   crowd   a swell on a win
 *   groan   a soft groan on a loss
 *   star    a bright ding as a ladder star lands (n 1 to 3, higher each time)
 *   fanfare three rising notes for three stars
 */
const KEY = 'last_shot_mute';
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

export function createSound() {
  let ctx = null, out = null, noise = null, muted = lsGet(KEY) === '1';

  function unlock() {
    if (muted) return;
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        out = ctx.createGain(); out.gain.value = 0.55; out.connect(ctx.destination);
        noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = noise.getChannelData(0);
        let s = 7;
        for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = s / 1073741823.5 - 1; }
      }
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { ctx = null; }
  }
  const live = () => !muted && ctx && ctx.state === 'running';

  /* an envelope on a gain: up in a, down to nothing by d */
  function env(t0, peak, a, d) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
    g.connect(out);
    return g;
  }
  function osc(type, f0, f1, t0, dur, gain) {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    o.connect(gain); o.start(t0); o.stop(t0 + dur + 0.05);
    return o;
  }
  function hiss(type, f, q, t0, dur, gain, f1) {
    const n = ctx.createBufferSource(); n.buffer = noise; n.loop = true;
    const b = ctx.createBiquadFilter(); b.type = type; b.frequency.setValueAtTime(f, t0); b.Q.value = q;
    if (f1) b.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    n.connect(b); b.connect(gain); n.start(t0, Math.random() * 0.5); n.stop(t0 + dur + 0.05);
  }

  const play = {
    tick() {
      if (!live()) return;
      const t = ctx.currentTime;
      osc('sine', 150, 55, t, 0.09, env(t, 0.5, 0.004, 0.09));
      hiss('lowpass', 900, 0.7, t, 0.04, env(t, 0.12, 0.002, 0.04));
    },
    swish() {
      if (!live()) return;
      const t = ctx.currentTime;
      hiss('bandpass', 5200, 0.9, t, 0.42, env(t, 0.45, 0.03, 0.4), 2600);
    },
    rim() {
      if (!live()) return;
      const t = ctx.currentTime;
      const g = env(t, 0.22, 0.003, 0.45);
      osc('triangle', 540, 520, t, 0.45, g); osc('square', 812, 790, t, 0.3, env(t, 0.06, 0.003, 0.3));
      hiss('lowpass', 500, 1, t, 0.08, env(t, 0.3, 0.002, 0.08));
    },
    buzzer() {
      if (!live()) return;
      const t = ctx.currentTime, g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      g.gain.setValueAtTime(0.16, t + 0.62); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.connect(out); g.connect(lp);
      osc('sawtooth', 196, 196, t, 0.75, g); osc('sawtooth', 207, 207, t, 0.75, g);
    },
    crowd() {
      if (!live()) return;
      const t = ctx.currentTime, g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4); g.connect(out);
      hiss('bandpass', 700, 0.6, t, 2.4, g, 1300);
      hiss('bandpass', 2400, 1.2, t + 0.1, 2.2, env(t + 0.1, 0.12, 0.4, 1.7));
    },
    groan() {
      if (!live()) return;
      const t = ctx.currentTime;
      hiss('lowpass', 520, 1.4, t, 1.1, env(t, 0.32, 0.18, 0.9), 200);
      osc('sine', 190, 120, t, 1.0, env(t, 0.05, 0.2, 0.8));
    },
    star(n) {
      if (!live()) return;
      const t = ctx.currentTime, f = [880, 1109, 1319][Math.max(0, Math.min(2, (n || 1) - 1))];
      osc('triangle', f, f, t, 0.35, env(t, 0.22, 0.005, 0.33));
      osc('sine', f * 2, f * 2, t, 0.2, env(t, 0.06, 0.005, 0.18));
    },
    fanfare() {
      if (!live()) return;
      const t = ctx.currentTime;
      [523, 659, 784, 1047].forEach((f, i) => osc('square', f, f, t + i * 0.11, i === 3 ? 0.5 : 0.12, env(t + i * 0.11, 0.07, 0.005, i === 3 ? 0.48 : 0.11)));
    }
  };

  /* (getters defined in place: Object.assign would read them once and freeze them) */
  return Object.defineProperties(play, {
    unlock: { value: unlock },
    muted: { get: () => muted },
    state: { get: () => (ctx ? ctx.state : 'none') },
    setMuted: { value(m) {
      muted = !!m; lsSet(KEY, muted ? '1' : '0');
      try { if (ctx) { if (muted) ctx.suspend(); else ctx.resume(); } } catch (e) {}
      if (!muted) unlock();
    } }
  });
}
