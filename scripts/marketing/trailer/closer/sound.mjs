#!/usr/bin/env node
/* The Shut The Door trailer's soundtrack, synthesized here and so ours to use anywhere.

   node scripts/marketing/trailer/closer/sound.mjs out.wav

   The sound of a postseason broadcast, not a game jingle (the owner, 2026-11-03: "should feel true to
   MLB baseball"): a stadium crowd under everything, the catcher's mitt popping on the strikes, and a
   broadcast score of low brass, timpani and a string pulse. Every cue sits on a cut in index.html (the
   scene table S): the chains over a heartbeat and low strings, a full brass and timpani hit as they snap,
   the crowd on every strikeout, strings under the ABS replay and a brass sting when it is overturned,
   and a held brass chord under the badge. D minor to F major, 112 BPM. */
import fs from 'node:fs';

const SR = 44100, LEN = 38.5, N = Math.round(LEN * SR);
const L = new Float32Array(N), R = new Float32Array(N);
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
let seed = 23; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x3fffffff - 1; };
// the cuts (index.html S) and where the strikes land inside their scenes
const T = { hook: 0, snap: 1.6, home: 4.0, pick: 7.0, aim: 9.2, meter: 11.2, k: 14.0, call: 16.4, abs: 19.0, k2: 23.0, last: 25.4, shut: 28.0, cards: 31.5, end: 34.5 };
const KAT = { k: 1.16, k2: 0.62, last: 1.0 }, ABS_OVER = T.abs + 1.3;
const BEAT = 60 / 112;

function add(i, v, pan = 0) { if (i < 0 || i >= N) return; L[i] += v * (1 - Math.max(0, pan)); R[i] += v * (1 + Math.min(0, pan)); }
const at = (t) => Math.round(t * SR);

/* BRASS: a stack of saws, the low pass opening on the attack (the "blat" of a horn section), a slow
   vibrato, a little detune between players */
function brass(t0, notes, len, vol, { attack = 0.06, bright = 0.22, swell = 0 } = {}) {
  for (const m of notes) for (const det of [-0.06, 0.05]) {
    let ph = Math.abs(rnd()), lp1 = 0, lp2 = 0;
    for (let i = 0; i < len * SR; i++) {
      const t = i / SR, f = hz(m + det) * (1 + 0.004 * Math.sin(2 * Math.PI * 5.2 * t) * Math.min(1, t / 0.4));
      ph = (ph + f / SR) % 1;
      const env = swell ? Math.min(1, t / swell) : Math.min(1, t / attack) * (t < 0.12 ? 1 + 0.4 * (1 - t / 0.12) : 1);
      const rel = Math.min(1, (len - t) / 0.25), cut = (0.02 + bright * Math.min(1, t / (attack * 2 + 0.02)) * (0.7 + 0.3 * env)) * (m < 50 ? 0.6 : 1);
      lp1 += ((2 * ph - 1) - lp1) * cut; lp2 += (lp1 - lp2) * cut;
      add(at(t0) + i, lp2 * env * rel * vol / notes.length, det * 3);
    }
  }
}
// STRINGS: detuned saws, soft attack, dark; a pulse when `pulse` is set (eighths)
function strings(t0, t1, m, vol, { pulse = 0, tremolo = 0 } = {}) {
  for (const [d, p] of [[-0.08, -0.4], [0.07, 0.4], [12.03, 0]]) {
    let ph = Math.abs(rnd()), lp = 0; const n = at(t1) - at(t0);
    for (let i = 0; i < n; i++) { const t = i / SR; ph = (ph + hz(m + d) / SR) % 1; lp += ((2 * ph - 1) - lp) * 0.035;
      let env = Math.min(1, t / 0.35) * Math.min(1, (n - i) / (SR * 0.3));
      if (pulse) { const u = (t % pulse) / pulse; env *= 0.35 + 0.65 * Math.exp(-u * 5); }
      if (tremolo) env *= 0.6 + 0.4 * Math.sin(2 * Math.PI * tremolo * t);
      add(at(t0) + i, lp * env * vol * (d > 11 ? 0.4 : 1), p); }
  }
}
// TIMPANI: a tuned drum, the head's pitch falling a little, a felt thump of noise
function timp(t0, m, vol = 0.5, len = 1.6) { let ph = 0, lp = 0; for (let i = 0; i < len * SR; i++) { const t = i / SR, f = hz(m) * (1 + 0.06 * Math.exp(-t * 18)); ph += f / SR; lp += (rnd() - lp) * 0.06;
  add(at(t0) + i, (Math.sin(2 * Math.PI * ph) * 0.9 + Math.sin(4 * Math.PI * ph * 1.5) * 0.15 + lp * 0.5 * Math.exp(-t * 30)) * Math.exp(-t * 2.4) * vol); } }
function roll(t0, t1, m, vol) { for (let t = t0, k = 0; t < t1; t += 0.055, k++) timp(t, m, vol * (0.4 + 0.6 * (t - t0) / (t1 - t0)) * (0.85 + 0.15 * Math.abs(rnd())), 0.4); }
// a low impact under the big moments
function boom(t0, vol = 1, len = 2.2, f0 = 90, f1 = 32) { let ph = 0, lp = 0;
  for (let i = 0; i < len * SR; i++) { const t = i / SR, f = f1 + (f0 - f1) * Math.exp(-t * 7); ph += f / SR; lp += (rnd() - lp) * 0.25;
    add(at(t0) + i, (Math.sin(2 * Math.PI * ph) * Math.exp(-t * 1.8) * 0.9 + lp * Math.exp(-t * 16) * 0.5) * vol); } }
function cymbal(t0, vol = 0.12, len = 3) { let prev = 0, lp = 0; for (let i = 0; i < len * SR; i++) { const t = i / SR, x = rnd(), h = x - prev; prev = x; lp += (h - lp) * 0.5;
  add(at(t0) + i, lp * Math.exp(-t * 1.2) * Math.min(1, t / 0.004) * vol, 0.2); } }
function swellCym(t0, t1, vol) { let prev = 0; const n = at(t1) - at(t0); for (let i = 0; i < n; i++) { const k = i / n, x = rnd(), h = x - prev; prev = x; add(at(t0) + i, h * k * k * vol, -0.2); } }
function kick(t0, vol = 0.6) { let ph = 0; for (let i = 0; i < 0.3 * SR; i++) { const t = i / SR, f = 46 + 90 * Math.exp(-t * 28); ph += f / SR; add(at(t0) + i, Math.sin(2 * Math.PI * ph) * Math.exp(-t * 10) * vol); } }
function heart(t0, vol = 0.8) { kick(t0, vol * 0.8); kick(t0 + 0.17, vol * 0.5); }
/* THE MITT: the pop of a fastball in the catcher's glove, a sharp leather crack and a low thump */
function mitt(t0, vol = 0.7) { let prev = 0, bp = 0, ph = 0;
  for (let i = 0; i < 0.16 * SR; i++) { const t = i / SR, x = rnd(), h = x - prev; prev = x; bp += (h - bp) * 0.35; ph += (150 + 120 * Math.exp(-t * 60)) / SR;
    add(at(t0) + i, (bp * 1.4 * Math.exp(-t * 70) + Math.sin(2 * Math.PI * ph) * 0.7 * Math.exp(-t * 30)) * vol, 0.1); } }
/* THE CROWD: a stadium, not a hiss: many voices as pink noise through two formant bands, swelling;
   `roar` is the crowd on its feet */
function crowd(t0, t1, vol, roar = 0) { let a = 0, b = 0, c = 0; const n = at(t1) - at(t0);
  for (let i = 0; i < n; i++) { const t = i / SR, x = rnd(); a += (x - a) * 0.02; b += (x - b) * 0.12; c += (x - c) * 0.4;
    const voice = (b - a) * 1.2 + (c - b) * 0.35 + a * 0.6;
    const sw = Math.min(1, t / (roar ? 0.12 : 0.8)) * Math.min(1, (n - i) / (SR * (roar ? 1.6 : 0.8)));
    const shape = roar ? (1 + 0.6 * Math.exp(-t * 1.5)) : (0.85 + 0.15 * Math.sin(t * 1.9) + 0.08 * Math.sin(t * 5.3));
    add(at(t0) + i, voice * sw * shape * vol, Math.sin(t * 0.6) * 0.35); } }
// THE CHAIN: steel links shaking, bright ticks that ring
function rattle(t0, t1, vol) { let prev = 0; for (let t = t0; t < t1; t += 0.02 + Math.abs(rnd()) * 0.035) { const f = 2600 + Math.abs(rnd()) * 2400;
  for (let i = 0; i < 0.06 * SR; i++) { const tt = i / SR, x = rnd(), h = x - prev; prev = x; add(at(t) + i, (h * 0.5 + Math.sin(2 * Math.PI * f * tt) * 0.5) * Math.exp(-tt * 80) * vol, rnd() * 0.5); } } }
function snap(t0, vol) { let prev = 0; for (let i = 0; i < 0.1 * SR; i++) { const t = i / SR, x = rnd(), h = x - prev; prev = x; add(at(t0) + i, h * Math.exp(-t * 34) * vol); }
  for (const f of [611, 1373, 2207]) { let ph = 0; for (let i = 0; i < 0.9 * SR; i++) { const t = i / SR; ph += f / SR; add(at(t0) + i, Math.sin(2 * Math.PI * ph) * Math.exp(-t * 5) * vol * 0.06); } } }

/* THE SCORE, in D minor: Dm, Bb, F, C under a horn line; the strings pulse in eighths */
const BARS = [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]];
function score(t0, t1, vol) {
  const bar = BEAT * 4;
  for (let t = t0, k = 0; t < t1 - 0.05; t += bar, k++) {
    const ch = BARS[k % 4], e = Math.min(t + bar, t1);
    strings(t, e + 0.05, ch[0] - 12, 0.05 * vol, { pulse: BEAT / 2 });
    strings(t, e + 0.05, ch[1], 0.025 * vol, { pulse: BEAT / 2 });
    brass(t, [ch[0] - 12, ch[0]], Math.min(bar, t1 - t), 0.07 * vol, { swell: 0.4, bright: 0.1 });
    timp(t, ch[0] - 24, 0.32 * vol); timp(t + BEAT * 2, ch[0] - 24, 0.2 * vol);
    kick(t, 0.25 * vol); kick(t + BEAT * 2, 0.18 * vol);
  }
}

// 0 THE LOCK: low strings, the chains, a heartbeat, the crowd far off and hushed; the snap at SNAP
crowd(0, T.snap + 0.2, 0.05);
strings(0, T.snap + 0.3, 38, 0.12); strings(0, T.snap + 0.3, 45, 0.06);
rattle(0.05, T.snap - 0.05, 0.06);
heart(0.15, 0.7); heart(0.85, 0.75); heart(1.35, 0.8);
swellCym(T.snap - 1.0, T.snap, 0.08); roll(T.snap - 0.8, T.snap, 38, 0.35);
snap(T.snap, 0.55); boom(T.snap, 1.0, 2.4, 100, 30); cymbal(T.snap, 0.16);
brass(T.snap, [38, 50, 57, 62, 65], 2.2, 0.32, { attack: 0.03, bright: 0.32 }); timp(T.snap, 38, 0.7);
crowd(T.snap, T.home + 0.8, 0.26, 1);
// 4.0 THE GAME: the stadium settles to a murmur; the score comes in under the walkthrough
crowd(T.home, T.end + 4, 0.13);
score(T.home, T.call, 1.9);
for (const c of [T.pick, T.aim, T.meter]) { timp(c, 38, 0.35); }
// the first strikeout: the pop, the crowd up, a horn hit
mitt(T.k + KAT.k, 0.8); crowd(T.k + KAT.k, T.call + 0.8, 0.26, 1); brass(T.k + KAT.k, [50, 57, 62], 0.9, 0.18, { attack: 0.03, bright: 0.3 }); timp(T.k + KAT.k, 38, 0.5);
// 16.4 THE CALL: the score drops away, the strings hold a question
strings(T.call, ABS_OVER + 0.1, 45, 0.11, { tremolo: 7 }); strings(T.call, ABS_OVER + 0.1, 52, 0.07, { tremolo: 7 }); strings(T.call, ABS_OVER + 0.1, 38, 0.08);
mitt(T.call + 0.1, 0.45);
// 19.0 THE CHALLENGE: a roll under the replay, then the sting when it is overturned and the crowd's cheer
roll(T.abs + 0.3, ABS_OVER, 45, 0.45); swellCym(T.abs + 0.3, ABS_OVER, 0.07);
brass(ABS_OVER, [41, 53, 57, 60, 65], 1.4, 0.26, { attack: 0.03, bright: 0.3 }); timp(ABS_OVER, 41, 0.6); cymbal(ABS_OVER, 0.1);
crowd(ABS_OVER, T.k2 + 0.5, 0.22, 1);
score(ABS_OVER + 0.4, T.last, 1.9);
// 23.0 THE SECOND STRIKEOUT
mitt(T.k2 + KAT.k2, 0.8); crowd(T.k2 + KAT.k2, T.last + 0.4, 0.26, 1); brass(T.k2 + KAT.k2, [53, 57, 60], 0.9, 0.16, { attack: 0.03, bright: 0.3 });
// 25.4 THE LAST PITCH: a timpani roll in, strike three looking: the pop, the biggest hit, the crowd on its feet
roll(T.last, T.last + KAT.last - 0.02, 38, 0.4); swellCym(T.last, T.last + KAT.last, 0.09);
mitt(T.last + KAT.last, 0.9); boom(T.last + KAT.last, 1.1, 2.6, 110, 28); cymbal(T.last + KAT.last, 0.18);
brass(T.last + KAT.last, [41, 53, 57, 60, 65, 69], 3.0, 0.34, { attack: 0.03, bright: 0.3 }); timp(T.last + KAT.last, 41, 0.75);
crowd(T.last + KAT.last, T.cards + 1.0, 0.27, 1);
// 31.5 THE CARDS: a timpani and horn on each
for (let i = 0; i < 3; i++) { timp(T.cards + i, [38, 41, 45][i], 0.5); brass(T.cards + i, [[50, 57], [53, 60], [57, 65]][i], 0.7, 0.14, { attack: 0.03, bright: 0.25 }); }
// 34.5 THE BADGE: the full section on F major, held, the crowd behind it
roll(T.end - 0.5, T.end, 41, 0.35);
boom(T.end, 0.8, 2.5, 80, 36); cymbal(T.end, 0.14); timp(T.end, 41, 0.7);
brass(T.end, [41, 53, 57, 60, 65, 69, 72], LEN - T.end - 0.4, 0.32, { attack: 0.04, bright: 0.24 });
strings(T.end, LEN - 0.3, 53, 0.04); strings(T.end, LEN - 0.3, 60, 0.03);
crowd(T.end, LEN - 0.2, 0.16, 1);

// a stadium's room: two longer echoes, then level and clip softly
const out = [new Float32Array(N), new Float32Array(N)];
for (const [src, dst, o] of [[L, out[0], 0], [R, out[1], 1]]) for (let i = 0; i < N; i++) {
  const a = i - at(0.083) - o * 131, b = i - at(0.149) + o * 73, c = i - at(0.231) - o * 47;
  dst[i] = src[i] + (a >= 0 ? src[a] * 0.2 : 0) + (b >= 0 ? src[b] * 0.13 : 0) + (c >= 0 ? src[c] * 0.08 : 0);
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
