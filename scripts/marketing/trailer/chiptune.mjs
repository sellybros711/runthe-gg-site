#!/usr/bin/env node
/* An original chiptune for the Putt Putt Tour trailer, written here and so free to use anywhere.

   node scripts/marketing/trailer/chiptune.mjs out.wav [seconds]

   120 BPM (a beat is 0.5 s, a bar 2 s), I V vi IV in C, the sound of the pixel art: a triangle bass,
   a 25% pulse arpeggio, a square lead, and noise drums. Its sections follow the trailer's scenes
   (putt-trailer.mjs cuts on the beat), so the drop lands as the devices slide in and the last chord
   lands under the end card. */
import fs from 'node:fs';

const SR = 44100, BPM = 120, BEAT = 60 / BPM, BAR = BEAT * 4;
const LEN = +(process.argv[3] || 38);
const N = Math.round(LEN * SR);
const mix = new Float32Array(N);
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// the scenes, in seconds (putt-trailer.mjs): intro 4, worlds 6, holes 9, puzzles 6, chests 5, end 6
/* The build from the reveal to the drop is BUILD seconds (the owner, 2026-10-19: the Putt Putt reveal went by
   too fast, so it is a bar longer than the first cut's 1.7 s). Everything from the drop on is the same music
   as before, moved later by SHIFT, so it reads its bars and chords on the old clock (tb below). */
const BUILD = 3.7, SHIFT = BUILD - 1.7;
const S = { flash: 2.3, drop: 2.3 + BUILD, hook: 10 + SHIFT, puzz: 19 + SHIFT, chest: 25 + SHIFT, end: 30 + SHIFT, hit: 30.6 + SHIFT };
const CHORDS = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]];   // C G Am F
const chordAt = (t) => CHORDS[Math.floor(t / BAR) % 4];
const HOOK = [[76, 79, 84, 83], [86, 83, 79, 74], [81, 84, 88, 86], [84, 81, 77, 79]];

let seed = 7; const noise = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x3fffffff - 1; };
function note(t0, dur, f, { shape = 'pulse', duty = 0.5, vol = 0.2, a = 0.004, r = 0.05, slide = 0 } = {}) {
  const i0 = Math.round(t0 * SR), n = Math.round((dur + r) * SR);
  let ph = 0;
  for (let i = 0; i < n && i0 + i < N; i++) {
    const t = i / SR, ff = f * (1 + slide * t);
    ph = (ph + ff / SR) % 1;
    let v = shape === 'tri' ? 1 - 4 * Math.abs(ph - 0.5) : shape === 'sine' ? Math.sin(2 * Math.PI * ph) : (ph < duty ? 1 : -1);
    const env = Math.min(1, t / a) * (t < dur ? 1 : Math.max(0, 1 - (t - dur) / r));
    if (i0 + i >= 0) mix[i0 + i] += v * env * vol;
  }
}
function kick(t0, vol = 0.55) { const i0 = Math.round(t0 * SR); let ph = 0;
  for (let i = 0; i < 0.22 * SR && i0 + i < N; i++) { const t = i / SR, f = 45 + 110 * Math.exp(-t * 28); ph += f / SR; mix[i0 + i] += Math.sin(2 * Math.PI * ph) * Math.exp(-t * 14) * vol; } }
function snare(t0, vol = 0.22) { const i0 = Math.round(t0 * SR); let ph = 0;
  for (let i = 0; i < 0.18 * SR && i0 + i < N; i++) { const t = i / SR; ph += 185 / SR; mix[i0 + i] += (noise() * 0.8 + Math.sin(2 * Math.PI * ph) * 0.4) * Math.exp(-t * 22) * vol; } }
function hat(t0, vol = 0.07, len = 0.035) { const i0 = Math.round(t0 * SR); let prev = 0;
  for (let i = 0; i < len * 3 * SR && i0 + i < N; i++) { const t = i / SR, x = noise(), hp = x - prev; prev = x; mix[i0 + i] += hp * Math.exp(-t / len) * vol; } }
function crash(t0, vol = 0.12) { const i0 = Math.round(t0 * SR); let prev = 0;
  for (let i = 0; i < 2.2 * SR && i0 + i < N; i++) { const t = i / SR, x = noise(), hp = x - prev; prev = x; mix[i0 + i] += hp * Math.exp(-t * 1.6) * vol; } }
function riser(t0, t1, vol = 0.08) { const i0 = Math.round(t0 * SR), n = Math.round((t1 - t0) * SR); let lp = 0;
  for (let i = 0; i < n; i++) { const k = i / n; lp += (noise() - lp) * (0.02 + 0.5 * k * k); mix[i0 + i] += lp * k * vol; } }

for (let t = 0; t < S.end; t += BEAT / 4) {
  const tb = t >= S.drop ? t - SHIFT : t;   // the old clock, so the body is note for note the first cut's
  const bar = Math.floor(tb / BAR), inBar = tb - bar * BAR, beat = Math.floor(inBar / BEAT + 1e-6), sub = Math.round((inBar % BEAT) / (BEAT / 4));
  const ch = chordAt(tb), on16 = Math.round(tb / (BEAT / 4));
  // the intro: a quiet arpeggio and hats, rising into the drop
  if (t < S.drop) {
    // before the flash only the swell (below); after it the arpeggio climbs into the drop
    if (t >= S.flash) {
      note(t, BEAT / 4 * 0.8, hz(ch[on16 % 3] + 12), { duty: 0.25, vol: 0.04 + 0.05 * ((t - S.flash) / (S.drop - S.flash)), r: 0.03 });
      if (sub % 2 === 0) hat(t, 0.04);
    }
    continue;
  }
  const quiet = t >= S.puzz && t < S.chest;   // the puzzle scene thins out, to let the thinking show
  // drums
  if (sub === 0 && (beat === 0 || beat === 2)) kick(t);
  if (sub === 0 && (beat === 1 || beat === 3) && !quiet) snare(t);
  if (sub % 2 === 0) hat(t, quiet ? 0.045 : 0.07);
  if (quiet && sub === 2 && beat === 3) kick(t, 0.35);
  // bass: root and octave on the eighths
  if (sub % 2 === 0) note(t, BEAT / 2 * 0.85, hz(ch[0] - 24 + (sub === 2 ? 12 : 0)), { shape: 'tri', vol: 0.28, r: 0.02 });
  // arpeggio on the sixteenths
  const arp = [ch[0], ch[1], ch[2], ch[0] + 12];
  note(t, BEAT / 4 * 0.7, hz(arp[on16 % 4] + 12), { duty: 0.25, vol: quiet ? 0.05 : 0.065, r: 0.02 });
  // the hook, in the holes and the chests
  if ((t >= S.hook && t < S.puzz) || t >= S.chest) {
    if (sub === 0) note(t, BEAT * 0.8, hz(HOOK[bar % 4][beat]), { duty: 0.5, vol: 0.075, r: 0.06 });
  }
  // a coin glint every bar in the chest scene
  if (t >= S.chest && beat === 3 && sub === 2) { note(t, 0.06, hz(95), { duty: 0.5, vol: 0.05 }); note(t + 0.07, 0.18, hz(100), { duty: 0.5, vol: 0.05, r: 0.15 }); }
}
/* THE TRAILER OPENING (the owner, 2026-10-19: "a cinematic movie trailer"): a low drone swells under
   "New in Run The Tour", a reversed rush pulls into the flash, and the reveal lands on a boom. */
function drone(t0, t1, vol) { const i0 = Math.round(t0 * SR), n = Math.round((t1 - t0) * SR); let p1 = 0, p2 = 0, p3 = 0;
  for (let i = 0; i < n; i++) { const t = i / SR, k = i / n, env = Math.min(1, k * 1.4) * (0.6 + 0.4 * k);
    p1 += 41.2 / SR; p2 += 61.7 / SR; p3 += 82.4 * (1 + 0.003 * Math.sin(t * 5)) / SR;
    mix[i0 + i] += (Math.sin(2 * Math.PI * p1) * 0.6 + Math.sin(2 * Math.PI * p2) * 0.3 + (p3 % 1 < 0.5 ? 0.12 : -0.12)) * env * vol; } }
function boom(t0, vol = 0.9) { const i0 = Math.round(t0 * SR); let ph = 0, lp = 0;
  for (let i = 0; i < 2.4 * SR && i0 + i < N; i++) { const t = i / SR, f = 32 + 90 * Math.exp(-t * 9); ph += f / SR; lp += (noise() - lp) * 0.08;
    mix[i0 + i] += (Math.sin(2 * Math.PI * ph) * Math.exp(-t * 1.6) + lp * 0.5 * Math.exp(-t * 4)) * vol; } }
drone(0, S.flash + 0.05, 0.22);
riser(S.flash - 1.2, S.flash, 0.16);
boom(S.flash, 0.85); crash(S.flash, 0.14);
riser(S.drop - 1.5, S.drop, 0.12);
crash(S.drop, 0.1);
crash(S.hook, 0.07);
crash(S.chest, 0.07);
// the end: the music pulls back as the devices leave, then one big C under the card, held
riser(S.end, S.hit, 0.1);
kick(S.hit, 0.6); crash(S.hit, 0.16);
for (const m of [48, 60, 64, 67, 72, 76]) note(S.hit, LEN - S.hit - 0.8, hz(m), { shape: m < 55 ? 'tri' : 'pulse', duty: 0.5, vol: m < 55 ? 0.25 : 0.045, a: 0.01, r: 0.6 });
for (let k = 0; k < 8; k++) note(S.hit + 0.5 + k * 0.125, 0.1, hz([72, 76, 79, 84][k % 4] + 12), { duty: 0.25, vol: 0.03 * (1 - k / 8) });

// a gentle low pass to round off the square edges, then normalise to -1 dBFS
// The level is set by the body of the track (from the drop on), so the opening's boom never turns the
// rest down; anything louder than that (the boom) is rounded off by a soft clip instead.
let lp = 0, peak = 0; for (let i = 0; i < N; i++) { lp += (mix[i] - lp) * 0.55; mix[i] = lp; if (i >= S.drop * SR) peak = Math.max(peak, Math.abs(lp)); }
const g = 0.89 / (peak || 1);
const soft = (x) => Math.abs(x) <= 0.89 ? x : Math.sign(x) * (0.89 + 0.1 * Math.tanh((Math.abs(x) - 0.89) / 0.1));
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12); buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { const v = Math.max(-32767, Math.min(32767, Math.round(soft(mix[i] * g) * 32767))); buf.writeInt16LE(v, 44 + i * 4); buf.writeInt16LE(v, 46 + i * 4); }
fs.writeFileSync(process.argv[2] || 'chiptune.wav', buf);
console.log(`${process.argv[2] || 'chiptune.wav'}: ${LEN}s at ${BPM} BPM`);
