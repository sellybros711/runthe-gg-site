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
  intro: { img: logo, imgH: 150, kick: 'New in Run The Tour', big: 'Putt Putt <em>Tour</em>', sub: 'Mini golf you actually play.', size: 120 },
  worlds: { kick: 'Explore', big: 'Worlds to <em>walk</em>', sub: 'Walk the trail from hole to hole.' },
  holes: { kick: 'Play', big: 'Special <em>holes</em>', sub: 'Every hole has a twist.' },
  puzzles: { kick: 'Solve', big: 'Puzzle <em>gyms</em>', sub: 'Crack the room. Open the vault.' },
  chests: { kick: 'Find', big: 'Hidden <em>chests</em>', sub: 'Treasure off the path.' },
  end: { img: logo, imgH: 120, big: 'Free to play<br><em>in your browser</em>', sub: 'No download. On your phone or your laptop.', url: 'runthe.gg/golf', size: 104 },
};

/* The scenes. Each screen plays clips back to back; `to` (negative: from the clip's end) sets the speed. */
// Cut on the beat of the 120 BPM track (chiptune.mjs): a beat is 0.5 s, a bar 2 s.
const I = 4.0, WD = 6.0, HD = 9.0, PZ = 6.0, CH = 5.0, EN = 6.0;
export const scenes = [
  { dur: I, card: 'intro', cardIn: 0.35 },
  { dur: WD, card: 'worlds',
    laptop: [{ clip: 'map', from: 0.6, to: 7.3 }],
    phone: [{ clip: 'w-candy', from: 0.9, speed: 1.15, dur: 1.5 }, { clip: 'w-neon', from: 0.9, speed: 1.15, dur: 1.5 }, { clip: 'w-sky', from: 0.9, speed: 1.15, dur: 1.5 }, { clip: 'w-ice', from: 0.9, speed: 1.15 }] },
  { dur: HD, card: 'holes',
    laptop: [{ clip: 'a-sky', from: 0.7, to: -0.4 }],
    phone: [{ clip: 'a-neon', from: 0.7, to: -0.4 }] },
  { dur: PZ, card: 'puzzles',
    laptop: [{ clip: 'gym', from: 0.4, to: -0.3 }],
    phone: [{ clip: 'gym', from: 0.4, to: -0.3 }] },
  { dur: CH, card: 'chests',
    laptop: [{ clip: 'chest', from: 0.3, to: -0.2 }],
    phone: [{ clip: 'chest', from: 0.3, to: -0.2 }] },
  { dur: EN, card: 'end', cardIn: 0.6,
    laptop: [{ clip: 'w-pirate', from: 0.4, speed: 1 }],
    phone: [{ clip: 'a-candy', from: 0.7, to: -0.4 }] },
];
const T = scenes.reduce((a, s) => a + s.dur, 0), END = T - EN;

/* Where things sit. Devices come in after the title, hold, and leave for the end card. */
/* Where things sit, by SCREEN: a laptop's screen width, a phone's screen height, each screen's centre line
   and top edge, over time [t, centre x, top]. The devices come in after the title, hold, and leave for
   the end card. */
const off = (keys, x) => keys.map(([t, cx, y], i) => [t, (i < 2 || i > 3) ? x : cx, y]);
export const formats = {
  x: { W: 1350, H: 1080, textScale: 0.82, cardY: 34, cardAt: { intro: 'mid', end: 'mid' },
    laptop: { screenW: 800, keys: off([[0, 0, 352], [I - 0.2, 0, 352], [I + 0.6, 440, 352], [END, 440, 352], [END + 0.6, 0, 352], [T, 0, 352]], -700) },
    phone: { screenH: 690, keys: off([[0, 0, 336], [I, 0, 336], [I + 0.75, 1080, 336], [END, 1080, 336], [END + 0.55, 0, 336], [T, 0, 336]], 1700) } },
  reels: { W: 1080, H: 1920, textScale: 1.22, cardY: 70, cardAt: { intro: 'mid', end: 'mid' },
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
    const r = compose({ spec: { formats, scenes }, art, format: f, foot, out: path.join(out, `putt-trailer-${f}.mp4`), music: opt('--music', null) });
    console.log(`${path.relative(process.cwd(), r.out)}: ${r.T.toFixed(1)}s`);
  }
}
