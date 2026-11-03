#!/usr/bin/env node
/* The Shut The Door trailer's soundtrack, synthesized here and so ours to use anywhere.

   node scripts/marketing/trailer/closer/sound.mjs out.wav

   Every cue sits on a cut in closer/index.html (the scene table S): chains rattling over a heartbeat, the
   snap and the crowd, a ballpark organ riff of our own over a drum groove, a hit and a roar on every
   strikeout, a replay sweep under the ABS challenge, the biggest hit on the last strike, and the riff
   again under the badge. C major, 120 BPM. */
import fs from 'node:fs';

const SR = 44100, LEN = 38.5, N = Math.round(LEN * SR);
const L = new Float32Array(N), R = new Float32Array(N);
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
let seed = 11; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x3fffffff - 1; };
const T = { hook: 0, snap: 1.6, home: 4.0, pick: 7.0, aim: 9.2, meter: 11.2, k: 14.0, call: 16.4, abs: 19.0, k2: 23.0, last: 25.4, shut: 28.0, cards: 31.5, end: 34.5 };
// where the strikes land inside their scenes (index.html): the first and second K, the last strike
const KAT = { k: 1.16, k2: 0.62, last: 1.0 };
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

// a cymbal: bright noise, a long tail
function crash(t0, vol = 0.12) { let prev = 0; for (let i = 0; i < 2.2 * SR; i++) { const t = i / SR, x = rnd(), h = x - prev; prev = x; add(Math.round(t0 * SR) + i, h * Math.exp(-t * 1.6) * vol); } }
// a chain: small bright metal ticks, many and quick, ringing a little
function rattle(t0, t1, vol) { let prev = 0; for (let t = t0; t < t1; t += 0.018 + Math.abs(rnd()) * 0.03) { const f = 2400 + Math.abs(rnd()) * 2600;
  for (let i = 0; i < 0.05 * SR; i++) { const tt = i / SR, x = rnd(), h = x - prev; prev = x; add(Math.round(t * SR) + i, (h * 0.6 + Math.sin(2 * Math.PI * f * tt) * 0.4) * Math.exp(-tt * 90) * vol, rnd() * 0.5); } } }
// metal giving way: a bright crack, inharmonic ringing, and the boom under it
function snap(t0, vol) { let prev = 0; for (let i = 0; i < 0.12 * SR; i++) { const t = i / SR, x = rnd(), h = x - prev; prev = x; add(Math.round(t0 * SR) + i, h * Math.exp(-t * 30) * vol); }
  for (const f of [523, 1187, 1913, 2741]) { let ph = 0; for (let i = 0; i < 1.2 * SR; i++) { const t = i / SR; ph += f / SR; add(Math.round(t0 * SR) + i, Math.sin(2 * Math.PI * ph) * Math.exp(-t * 4) * vol * 0.08); } } }
// a ballpark organ: drawbar sines on a note, a little percussion click
function organ(t0, m, len, vol) { const f = hz(m); for (const [k, a] of [[0.5, 0.5], [1, 1], [2, 0.6], [3, 0.3], [4, 0.2]]) { let ph = 0; for (let i = 0; i < len * SR; i++) { const t = i / SR; ph += f * k / SR;
  add(Math.round(t0 * SR) + i, Math.sin(2 * Math.PI * ph) * a * vol * Math.min(1, t / 0.006) * Math.min(1, (len - t) / 0.02) * (1 + 0.15 * Math.sin(t * 38)), k > 2 ? 0.2 : -0.1); } } }
// a crowd: two bands of noise, swelling in and out
function crowd(t0, t1, vol) { let a = 0, b = 0; const n = Math.round((t1 - t0) * SR); for (let i = 0; i < n; i++) { const t = i / SR, x = rnd(); a += (x - a) * 0.05; b += (x - b) * 0.3;
  const sw = Math.min(1, t / 0.2) * Math.min(1, (n - i) / (SR * 0.7)) * (0.85 + 0.15 * Math.sin(t * 2.7));
  add(Math.round(t0 * SR) + i, (a * 1.6 + (b - a) * 0.5) * sw * vol, Math.sin(t * 0.7) * 0.3); } }
function groove(t0, t1, vol) { for (let t = t0; t < t1 - 0.01; t += BEAT / 4) { const n = Math.round((t - t0) / (BEAT / 4)), beat = Math.floor(n / 4) % 4, sub = n % 4;
  if (sub === 0 && (beat === 0 || beat === 2)) kick(t, 0.7 * vol); if (sub === 2 && beat === 3) kick(t, 0.4 * vol);
  if (sub === 0 && (beat === 1 || beat === 3)) snare(t, 0.3 * vol); if (sub % 2 === 0) hat(t, 0.05 * vol); } }
// the riff: eight notes in C, the organ's call (ours)
const RIFF = [[0, 60], [0.25, 64], [0.5, 67], [1.0, 72], [1.5, 67], [1.75, 72], [2.0, 76], [2.5, 74]];
function riff(t0, vol, up = 0) { for (const [o, m] of RIFF) organ(t0 + o, m + up, 0.22, vol); }
// 0 THE LOCK: a low room, the chains rattling, a heartbeat; the snap at SNAP
drone(0, T.snap + 0.1, 36, 0.05);
rattle(0.05, T.snap - 0.05, 0.07);
heart(0.15, 0.7); heart(0.8, 0.75); heart(1.3, 0.8);
snap(T.snap, 0.6); boom(T.snap, 1.1, 2.2, 100, 30); crash(T.snap, 0.14);
crowd(T.snap, T.home + 1.2, 0.3);
// 2.9 THE GAME: the organ riff over a drum groove, a hit on every cut
riff(T.home, 0.05); riff(T.home + 3, 0.05, 5); riff(T.home + 6, 0.05);
groove(T.home, T.call, 0.9);
for (const c of [T.home, T.pick, T.aim, T.meter, T.k]) boom(c, 0.35, 0.8, 70, 40);
crowd(T.home + 1.0, T.call, 0.08);
// the strikeout: a hit and the crowd
boom(T.k + KAT.k, 0.8, 1.8, 100, 32); crash(T.k + KAT.k, 0.1); crowd(T.k + KAT.k, T.call + 0.6, 0.3);
// 10.9 THE CALL: the band drops to the hats, a question; 12.6 the challenge: a replay sweep, beeps, the stinger
for (let t = T.call; t < T.abs; t += BEAT / 2) hat(t, 0.06);
drone(T.call, T.k2, 38, 0.04);
riser(T.abs - 0.6, T.abs + 0.9, 0.16);
for (let i = 0; i < 4; i++) tone(T.abs + 0.3 + i * 0.16, 88 + (i % 2) * 7, 0.07, 0.06, 'sq', 0.5, 0.2);
stab(T.abs + 1.3, [60, 64, 67, 72], 0.2, 0.8, 0.45); boom(T.abs + 1.3, 0.6, 1.2, 90, 40); crowd(T.abs + 1.3, T.k2, 0.2);
groove(T.abs + 1.3, T.shut, 0.9);
// 15.6 ANOTHER: the second strikeout
boom(T.k2 + KAT.k2, 0.75, 1.6, 100, 32); crowd(T.k2 + KAT.k2, T.last, 0.26);
// 17.0 THE LAST PITCH: a snare roll in, strike three looking, the biggest hit and the crowd
for (let t = T.last, g = 0.12; t < T.last + KAT.last - 0.02; t += g, g = Math.max(0.04, g * 0.9)) snare(t, 0.08 + (t - T.last) * 0.15, 34);
boom(T.last + KAT.last, 1.15, 2.6, 110, 28); crash(T.last + KAT.last, 0.16); crowd(T.last + KAT.last, T.cards + 0.5, 0.36);
organ(T.shut, 60, 1.6, 0.05); organ(T.shut, 64, 1.6, 0.04); organ(T.shut, 67, 1.6, 0.04);
// 21.0 THE CARDS: a hit on each
for (let i = 0; i < 3; i++) { boom(T.cards + i * 1.0, 0.45, 0.8, 80, 40); stab(T.cards + i * 1.0, [60 + i * 2, 67 + i * 2], 0.1, 0.4, 0.3); }
// 23.4 THE BADGE: the riff once more, and the last chord held
riff(T.end, 0.055);
boom(T.end, 0.8, 2.5, 80, 36); kick(T.end, 0.9);
stab(T.end + 2.6, [48, 55, 60, 64, 67, 72], 0.24, 1.4, 0.28);
crowd(T.end, LEN - 0.3, 0.1);

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
fs.writeFileSync(process.argv[2] || 'closer.wav', buf);
console.log(`${process.argv[2] || 'closer.wav'}: ${LEN}s`);
