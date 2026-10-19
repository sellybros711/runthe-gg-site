#!/usr/bin/env node
/* The Putt Putt Tour launch trailer: the game on a laptop and a phone, scene by scene.

   node scripts/marketing/trailer/putt-trailer.mjs --foot <dir> --out <dir> [--music track.mp3] [--only x]

   --foot is the footage, recorded with record.mjs as <clip>-laptop.mp4 (--viewport 1440x900 --scale 1)
   and <clip>-phone.mp4 (--viewport 390x844 --scale 2). The clips and how to record them are listed in
   CLIPS below. The output is putt-trailer-x.mp4 (5:4, 1350x1080) and putt-trailer-reels.mp4 (9:16).

   THE WORDS. Every line is something the game does today: worlds walked hole to hole, a twist on every
   hole (an obstacle, a puzzle or a moving part, which check-putt asserts), the trail gyms and their
   vaults, chests off the path. Never "every world" or "all the worlds" (the owner, 2026-10-15): the tour
   keeps growing. No counts, so nothing goes stale when a world is added. Rivals are not in it: they are
   decided (the vault, 2026-10-16) but not yet in the game. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { draw } from './assets.mjs';
import { compose } from './compose.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const args = process.argv.slice(2), opt = (f, d) => { const i = args.indexOf(f); return i < 0 ? d : args[i + 1]; };

/* What to record (record.mjs <shot> --arg <arg>), on both devices. */
export const CLIPS = {
  map: ['putt-map'], 'w-candy': ['putt-world', 45], 'w-neon': ['putt-world', 60], 'w-pirate': ['putt-world', 80], 'w-sky': ['putt-world', 150],
  'w-dino': ['putt-world', 171], 'w-ice': ['putt-world', 183], 'a-neon': ['putt-ace', 60], 'a-sky': ['putt-ace', 145], 'a-dino': ['putt-ace', 177],
  'a-temple': ['putt-ace', '104:3'], 'a-pirate': ['putt-ace', '81:3'], 'a-candy': ['putt-ace', 47], chest: ['putt-chest', 79], gym: ['putt-gym', 'pirate'],
};

const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'golf/logo.png')).toString('base64');
export const cards = {
  // the owner's opening (2026-10-19): "New in Run The Tour" over the game people know, then the name on green
  newin: { img: logo, imgH: 150, big: 'New in<br><em>Run The Tour</em>', rule: false, size: 120 },
  // in the lobby's own type, over the lobby's sky (the owner, 2026-10-19)
  intro: { style: 'lobby', kick: 'Introducing', big: 'Putt Putt Tour', rule: false, size: 108 },
  // one plain line each, in the lobby's type over its sky (the owner, 2026-10-19: the kicker over the
  // title read oddly, and the green did not feel like the game)
  worlds: { style: 'lobby', big: 'Explore <em>worlds</em>', rule: false },
  holes: { style: 'lobby', big: 'Special <em>holes</em>', rule: false },
  puzzles: { style: 'lobby', big: 'Solve <em>puzzles</em>', rule: false },
  chests: { style: 'lobby', big: 'Hidden <em>chests</em>', rule: false },
  end: { img: logo, imgH: 120, big: 'Play for free<br><em>Run The Tour</em>', sub: 'No download required', url: 'runthe.gg/golf', size: 104 },
};

/* The scenes. Each screen plays clips back to back; `to` (negative: from the clip's end) sets the speed. */
// Cut on the beat of the 120 BPM track (chiptune.mjs): a beat is 0.5 s, a bar 2 s.
// The opening is 6 s: 2.3 on the Pro Tour, 3.7 on the Putt Putt reveal (a bar longer than the first cut's 1.7).
const I = 6.0, WD = 6.0, HD = 9.0, PZ = 6.0, CH = 5.0, EN = 6.0;
/* Where the Pro Tour round (rtt-x.mp4, rtt-reels.mp4, the rtt-round shot) is picked up for the intro: each
   cut's own take, so each has its own moment. */
const RTT_FROM = { x: 10.2, reels: 25.4 };
export const scenes = [
  // the intro is two beats inside the same 4 s, so everything after 0:04 stays where it was
  { dur: 2.3, card: 'newin', cardIn: 0.35, cardOut: 0.05, cine: true, backdrop: { clip: 'rtt', from: RTT_FROM, dim: 0.42, push: 0.07, vignette: true } },
  { dur: I - 2.3, card: 'intro', cardIn: 0, flash: true, cine: true, backdrop: { clip: 'lobby', from: 0.3, dim: 1, push: 0.05, vignette: true } },
  { dur: WD, card: 'worlds',
    laptop: [{ clip: 'map', from: 0.6, speed: 1 }],   // real speed, on a 10 s scroll (the owner, 2026-10-19: slower)
    phone: [{ clip: 'w-candy', from: 0.9, speed: 1.15, dur: 1.5 }, { clip: 'w-neon', from: 0.9, speed: 1.15, dur: 1.5 }, { clip: 'w-sky', from: 0.9, speed: 1.15, dur: 1.5 }, { clip: 'w-ice', from: 0.9, speed: 1.15 }] },
  { dur: HD, card: 'holes',
    // two aces a screen, each from the end of the hold to just after the card lands
    laptop: [{ clip: 'a-sky', from: 1.3, to: -0.5, dur: 4.5 }, { clip: 'a-temple', from: 1.3, to: -0.5 }],
    phone: [{ clip: 'a-neon', from: 1.3, to: -0.5, dur: 4.5 }, { clip: 'a-dino', from: 1.3, to: -0.5 }] },
  { dur: PZ, card: 'puzzles',
    laptop: [{ clip: 'gym', from: 0.4, to: -0.3 }],
    phone: [{ clip: 'gym', from: 0.4, to: -0.3 }] },
  { dur: CH, card: 'chests',
    laptop: [{ clip: 'chest', from: 0.3, to: -0.2 }],
    phone: [{ clip: 'chest', from: 0.3, to: -0.2 }] },
  { dur: EN, card: 'end', cardIn: 0.6, cine: true,
    laptop: [{ clip: 'w-pirate', from: 0.4, speed: 1 }],
    phone: [{ clip: 'a-candy', from: 0.7, to: -0.4 }] },
];
/* THE SKY (the owner, 2026-10-19: "match the feel of the game"): from the devices on, the lobby's own dusk
   sky plays behind everything instead of the green. It is one take (sky-x.mp4, sky-reels.mp4: the
   putt-lobby shot with --arg sky, LOBBY_MS=33500), picked up where the last scene left it, so its clouds
   drift on across the cuts. */
{ let at = 0; for (const s of scenes.slice(2)) { s.backdrop = { clip: 'sky', from: at, dim: 1 }; at += s.dur; } }
const T = scenes.reduce((a, s) => a + s.dur, 0), END = T - EN;
/* CINEMATIC (the owner, 2026-10-19: "a cinematic movie trailer"): the opening and the close are framed
   like a film, letterboxed, with slow push ins and titles that settle. The bars leave as the devices
   arrive at 0:04 and come back as they go, so 0:04 to 0:30 is exactly the cut the owner approved. */
export const letterbox = [[-1, I + 0.35], [END - 0.2, T + 1]];

/* Where things sit. Devices come in after the title, hold, and leave for the end card. */
/* Where things sit, by SCREEN: a laptop's screen width, a phone's screen height, each screen's centre line
   and top edge, over time [t, centre x, top]. The devices come in after the title, hold, and leave for
   the end card. */
const off = (keys, x) => keys.map(([t, cx, y], i) => [t, (i < 2 || i > 3) ? x : cx, y]);
export const formats = {
  x: { W: 1350, H: 1080, textScale: 0.82, cardY: 34, bar: 96, cardAt: { newin: 'mid', intro: 150, end: 'mid' },
    laptop: { screenW: 800, keys: off([[0, 0, 352], [I - 0.2, 0, 352], [I + 0.6, 440, 352], [END, 440, 352], [END + 0.6, 0, 352], [T, 0, 352]], -700) },
    phone: { screenH: 690, keys: off([[0, 0, 336], [I, 0, 336], [I + 0.75, 1080, 336], [END, 1080, 336], [END + 0.55, 0, 336], [T, 0, 336]], 1700) } },
  reels: { W: 1080, H: 1920, textScale: 1.22, cardY: 70, bar: 170, cardAt: { newin: 'mid', intro: 300, end: 'mid' },
    laptop: { screenW: 820, keys: off([[0, 0, 400], [I - 0.2, 0, 400], [I + 0.6, 540, 400], [END, 540, 400], [END + 0.6, 0, 400], [T, 0, 400]], -700) },
    phone: { screenH: 820, keys: (([a, b]) => [[0, 540, 2000], [I, 540, 2000], [I + 0.75, 540, 1035], [END, 540, 1035], [END + 0.55, 540, 2000], [T, 540, 2000]])([0, 0]) } },
};

if (process.argv[1] && process.argv[1].endsWith('putt-trailer.mjs')) {
  const foot = path.resolve(opt('--foot', '.')), out = path.resolve(opt('--out', '.')), only = opt('--only', null);
  const missing = Object.keys(CLIPS).flatMap((c) => ['laptop', 'phone'].map((d) => `${c}-${d}.mp4`)).filter((f) => !fs.existsSync(path.join(foot, f)))
    .filter((f) => scenes.some((s) => ['laptop', 'phone'].some((d) => (s[d] || []).some((g) => `${g.clip}-${d}.mp4` === f))));
  if (missing.length) { console.error('missing footage:\n  ' + missing.join('\n  ')); process.exit(2); }
  fs.mkdirSync(out, { recursive: true });
  const art = await draw(path.join(out, 'art'), { formats, cards });
  for (const f of Object.keys(formats)) {
    if (only && only !== f) continue;
    const r = compose({ spec: { formats, scenes, letterbox }, art, format: f, foot, out: path.join(out, `putt-trailer-${f}.mp4`), music: opt('--music', null) });
    console.log(`${path.relative(process.cwd(), r.out)}: ${r.T.toFixed(1)}s`);
  }
}
