#!/usr/bin/env node
/* The Commish Simulator trailer's soundtrack, synthesized here and so ours to use anywhere.

   node scripts/marketing/trailer/commish/sound.mjs out.wav

   Every cue sits on a cut in index.html (the scene table S): a news stinger and camera shutters under
   BREAKING, a tape rewind, a quiet first day, a drum groove under the office, a heartbeat under the
   vote, one big hit on REMOVED and a last chord under the title. D minor, 120 BPM. */
import fs from 'node:fs';

const SR = 44100, LEN = 24.0, N = Math.round(LEN * SR);
const L = new Float32Array(N), R = new Float32Array(N);
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
let seed = 11; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x3fffffff - 1; };
const T = { hook: 0, rew: 1.6, day: 2.4, office: 4.6, desk: 7.0, room: 10.2, press: 12.8, vote: 15.2, removed: 18.8, end: 20.2 };
const BEAT = 0.5;

function add(i, v, pan = 0) { if (i < 0 || i >= N) return; L[i] += v * (1 - Math.max(0, pan)); R[i] += v * (1 + Math.min(0, pan)); }
function env(t, a, d) { return t < a ? t / a : Math.exp(-(t - a) / d); }

// a low impact: a sine dropping in pitch, a noise crack on top
function boom(t0, vol = 1, len = 2.2, f0 = 90, f1 = 32) {
  let ph = 0, lp = 0;
  for (let i = 0; i < len * SR; i++) { const t = i / SR, f = f1 + (f0 - f1) * Math.exp(-t * 7); ph += f / SR;
    lp += (rnd() - lp) * 0.25;
    const v = Math.sin(2 * Math.PI * ph) * Math.exp(-t * 1.8) * 0.9 + lp * Math.exp(-t * 16) * 0.7;
    add(Math.round(t0 * SR) + i, v * vol); }
}
// a stab: detuned saws through a falling low pass, the sound of a news open
function stab(t0, notes, vol = 0.18, len = 0.9, bright = 0.35) {
  for (const m of notes) for (const det of [-0.08, 0, 0.08]) {
    let ph = rnd() * 1, lp = 0;
    for (let i = 0; i < len * SR; i++) { const t = i / SR; ph = (ph + hz(m + det) / SR) % 1;
      const k = bright * Math.exp(-t * 3) + 0.02; lp += ((2 * ph - 1) - lp) * k;
      add(Math.round(t0 * SR) + i, lp * env(t, 0.004, len / 3) * vol / notes.length, det * 4); }
  }
}
function shutter(t0, vol = 0.35) {
  let prev = 0;
  for (const [o, d] of [[0, 0.012], [0.045, 0.02]]) for (let i = 0; i < 0.05 * SR; i++) { const t = i / SR, x = rnd(), h = x - prev; prev = x;
    add(Math.round((t0 + o) * SR) + i, h * Math.exp(-t / d) * vol, 0.3); }
}
function kick(t0, vol = 0.8) { let ph = 0; for (let i = 0; i < 0.35 * SR; i++) { const t = i / SR, f = 48 + 120 * Math.exp(-t * 30); ph += f / SR; add(Math.round(t0 * SR) + i, Math.sin(2 * Math.PI * ph) * Math.exp(-t * 9) * vol); } }
// a marching snare: noise and a tone, tight
function snare(t0, vol = 0.32, tight = 26) { let ph = 0, prev = 0; for (let i = 0; i < 0.25 * SR; i++) { const t = i / SR, x = rnd(), h = x - prev * 0.6; prev = x; ph += 210 / SR;
  add(Math.round(t0 * SR) + i, (h * 0.9 + Math.sin(2 * Math.PI * ph) * 0.35) * Math.exp(-t * tight) * vol, -0.1); } }
function hat(t0, vol = 0.07) { let prev = 0; for (let i = 0; i < 0.06 * SR; i++) { const t = i / SR, x = rnd(), h = x - prev; prev = x; add(Math.round(t0 * SR) + i, h * Math.exp(-t * 70) * vol, 0.25); } }
function tone(t0, m, len, vol, shape = 'saw', cut = 0.08, pan = 0) {
  let ph = 0, lp = 0;
  for (let i = 0; i < len * SR; i++) { const t = i / SR; ph = (ph + hz(m) / SR) % 1;
    const x = shape === 'saw' ? 2 * ph - 1 : shape === 'sq' ? (ph < .5 ? 1 : -1) : Math.sin(2 * Math.PI * ph);
    lp += (x - lp) * cut; add(Math.round(t0 * SR) + i, lp * Math.min(1, t / 0.005) * Math.min(1, (len - t) / 0.03) * vol, pan); }
}
// a bell: a sine and a quiet octave, long decay (the first day's one note)
function bell(t0, m, vol = 0.2, len = 2.2) { for (const [k, a] of [[1, 1], [2.01, 0.35], [3.0, 0.12]]) { let ph = 0; for (let i = 0; i < len * SR; i++) { const t = i / SR; ph += hz(m) * k / SR; add(Math.round(t0 * SR) + i, Math.sin(2 * Math.PI * ph) * Math.exp(-t * (1.6 + k)) * vol * a); } } }
// a riser: noise through an opening filter, louder to the end
function riser(t0, t1, vol = 0.18) { let lp = 0; const n = Math.round((t1 - t0) * SR); for (let i = 0; i < n; i++) { const k = i / n; lp += (rnd() - lp) * (0.01 + 0.4 * k * k); add(Math.round(t0 * SR) + i, lp * k * k * vol); } }
// the tape running back: band noise falling, a warble, a thunk where it stops
function rewind(t0, t1) {
  let lp = 0, ph = 0; const n = Math.round((t1 - t0) * SR);
  for (let i = 0; i < n; i++) { const t = i / SR, k = i / n; lp += (rnd() - lp) * (0.6 - 0.5 * k);
    ph += (1400 - 1100 * k + 300 * Math.sin(t * 40)) / SR;
    add(Math.round(t0 * SR) + i, (lp * 0.22 + Math.sin(2 * Math.PI * ph) * 0.05) * Math.min(1, t / 0.05)); }
  kick(t1 - 0.02, 0.5);
}
function drone(t0, t1, m, vol) { for (const [d, p] of [[0, -0.3], [0.07, 0.3], [-7, 0]]) tone(t0, m + d, t1 - t0, vol, 'saw', 0.02, p); }
function heart(t0, vol = 0.9) { kick(t0, vol * 0.8); kick(t0 + 0.16, vol * 0.5); }

// 0 HOOK: the news open
boom(0, 1.0, 2.0);
stab(0, [62, 65, 69, 74], 0.30, 1.1, 0.45);
for (const at of [0.42, 0.7, 1.12]) shutter(at);
for (let t = 0.25; t < T.rew; t += BEAT / 4) { tone(t, 38, 0.09, 0.16, 'saw', 0.12); if (Math.round(t / (BEAT / 4)) % 2 === 0) hat(t, 0.05); }
stab(0.75, [62, 69], 0.12, 0.5, 0.3);
// 1.6 REWIND
rewind(T.rew, T.day);
// 2.4 DAY ONE: one note in a quiet room, then a lift into the office
drone(T.day, T.office + 0.2, 38, 0.045);
bell(T.day + 0.05, 74, 0.22);
bell(T.day + 1.05, 69, 0.13);
riser(T.office - 1.2, T.office, 0.22);
// 4.6 to 15.2 THE GROOVE: kick and marching snare, a string ostinato in D minor, a hit on every cut
const ROOT = [38, 38, 34, 36];   // D D Bb C, a bar each
for (let t = T.office; t < T.vote - 0.01; t += BEAT / 4) {
  const n = Math.round((t - T.office) / (BEAT / 4)), beat = Math.floor(n / 4) % 4, sub = n % 4, bar = Math.floor(n / 16);
  if (sub === 0 && (beat === 0 || beat === 2)) kick(t);
  if (sub === 2 && beat === 3) kick(t, 0.5);
  if (sub === 0 && (beat === 1 || beat === 3)) snare(t);
  if (sub === 3 && beat === 3 && bar % 2 === 1) { snare(t - 0.06, 0.12, 40); snare(t, 0.16, 40); }   // a ruff into the bar
  if (sub % 2 === 0) hat(t, 0.05);
  const r = ROOT[bar % 4], pat = [0, 12, 7, 12];
  tone(t, r + pat[sub], BEAT / 4 * 0.8, 0.09, 'saw', 0.09, sub % 2 ? 0.2 : -0.2);
  if (sub === 0 && beat === 0) drone(t, t + 2, r + 12, 0.025);
}
for (const c of [T.office, T.desk, T.room, T.press]) { boom(c, 0.45, 1.0, 70, 40); stab(c, [62, 65, 69], 0.1, 0.4, 0.25); }
// 15.2 THE VOTE: the band drops out, a heartbeat speeds up, a ping as each group turns
drone(T.vote, T.removed, 38, 0.05);
for (let t = T.vote + 0.15, gap = 0.82; t < T.removed - 0.25; t += gap, gap = Math.max(0.42, gap * 0.9)) heart(t, 0.85);
for (let i = 0; i < 4; i++) bell(T.vote + 0.62 + i * 0.32, 81 - i, 0.09, 0.8);
riser(T.removed - 1.6, T.removed, 0.3);
// 18.8 REMOVED: the biggest hit, and the room going cold
boom(T.removed, 1.15, 2.6, 110, 28);
stab(T.removed, [50, 53, 57, 62], 0.32, 1.4, 0.5);
drone(T.removed, T.end, 38, 0.04);
// 20.2 THE TITLE: a cadence and the last chord, held
for (let i = 0; i < 6; i++) snare(T.end - 0.38 + i * 0.065, 0.1 + i * 0.03, 34);
boom(T.end, 0.8, 2.5, 80, 36);
kick(T.end, 0.9);
stab(T.end, [50, 57, 62, 65, 69, 74], 0.30, 3.4, 0.28);
drone(T.end, LEN - 0.3, 38, 0.05);
bell(T.end + 0.02, 74, 0.12, 3);

// a small room: two short echoes, then level on everything after the hook and clip softly
const out = [new Float32Array(N), new Float32Array(N)];
for (const [src, dst, o] of [[L, out[0], 0], [R, out[1], 1]]) for (let i = 0; i < N; i++) {
  const a = i - Math.round(0.071 * SR) - o * 97, b = i - Math.round(0.113 * SR) + o * 61;
  dst[i] = src[i] + (a >= 0 ? src[a] * 0.22 : 0) + (b >= 0 ? src[b] * 0.14 : 0);
}
let peak = 0; for (const c of out) for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(c[i]));
const g = 0.95 / peak, soft = (x) => Math.tanh(x * 1.1) / Math.tanh(1.1);
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12); buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { const f = Math.min(1, (N - i) / (SR * 0.8)); for (let c = 0; c < 2; c++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, soft(out[c][i] * g) * f)) * 32767), 44 + i * 4 + c * 2); }
fs.writeFileSync(process.argv[2] || 'commish.wav', buf);
console.log(`${process.argv[2] || 'commish.wav'}: ${LEN}s`);
