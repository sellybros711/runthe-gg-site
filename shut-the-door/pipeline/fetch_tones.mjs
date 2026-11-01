/* Each hitter's skin tone, sampled from his MLB headshot, for every hitter in 3d/looks-data.js.
 * Writes the players' tone and toneSrc there and nothing else; a tone set by hand (toneSrc
 * "set by hand from MLB headshot") is kept on a re-run, as fetch_looks.mjs keeps its hand-set fields.
 *
 *   node shut-the-door/pipeline/fetch_tones.mjs DOWNLOAD_DIR
 *
 * DOWNLOAD_DIR is a new, empty folder outside the repo. Each headshot is saved there as it came
 * (untrusted: read as pixels by sample_tones.py with python -I, never run, never committed).
 *
 * The photo: img.mlbstatic.com, people/<mlbam>/headshot/67/current at 213 px wide, with MLB's own
 * default image for a player who has none. That default is the generic silhouette: it is fetched once
 * (DEFAULT_ID, an id with no photo), and a headshot that matches it leaves the tone null (no guess:
 * the hash in looks.js stands in).
 *
 * The tone: sample_tones.py gives the lit skin of the face (cheeks, nose, the forehead under the
 * brim) as an sRGB colour. The scene mixes the batter's own skin map toward skin_dark.webp in linear
 * colour (materials.js: mix(map, dark, uTone)), so the tone is where his colour's luminance falls on
 * that line: t = (Y_light - Y_photo) / (Y_light - Y_dark), clamped to 0..1, with Y the linear
 * luminance and the two maps' colours their own face (cheeks and forehead of each texture, below).
 * The studio light is not normalised away (the backdrops are not one grey); the contact sheet is
 * checked by eye and a photo the sampler misreads (an old action shot, a dim or tinted print) is set
 * by hand, with its own source note.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', '3d', 'looks-data.js');
const DL = process.argv[2];
if (!DL) { console.error('usage: fetch_tones.mjs DOWNLOAD_DIR'); process.exit(2); }
fs.mkdirSync(DL, { recursive: true });

const URL = (id) => `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current`;
const DEFAULT_ID = 111867;   // Miguel Cairo: MLB has no headshot for him, so this is the silhouette
const DATE = new Date().toISOString().slice(0, 10);
const SAMPLED = `MLB headshot (img.mlbstatic.com), sampled ${DATE}`;
const HAND = 'set by hand from MLB headshot';

// the two skin maps' face, sRGB: the median of five 12 px patches on the cheeks and the forehead of
// the batter.glb skin texture (young_caucasian_male2) and of tex/skin_dark.webp (young_african_male)
const LIGHT = [218.2, 168.2, 135.7], DARK = [86.8, 54.8, 38.0];
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
export const toneOf = (rgb) => { const t = (lum(LIGHT) - lum(rgb)) / (lum(LIGHT) - lum(DARK)); return +Math.min(1, Math.max(0, t)).toFixed(3); };

const src = fs.readFileSync(OUT, 'utf8');
// the head comment is fetch_looks.mjs's (it writes the file): kept as it stands
const at = src.indexOf('export const LOOKS = ');
const HEAD = src.slice(0, at);
const LOOKS = JSON.parse(src.slice(at + 'export const LOOKS = '.length).replace(/;\s*$/, ''));

const get = (id, name) => { const f = path.join(DL, name); if (!fs.existsSync(f)) execFileSync('curl', ['-sS', '-m', '30', '--retry', '3', '--fail', '-o', f, URL(id)]); return f; };
const generic = get(DEFAULT_ID, 'generic.img');
const mlbams = [...new Set(Object.values(LOOKS.players).map((p) => p.mlbam).filter(Boolean))];
for (const m of mlbams) get(m, `${m}.jpg`);
const samples = path.join(DL, 'samples.json');
execFileSync('python3', ['-I', path.join(HERE, 'sample_tones.py'), DL, generic, samples], { stdio: 'inherit' });
const S = JSON.parse(fs.readFileSync(samples, 'utf8'));

let set = 0, hand = 0, sil = 0, none = 0;
for (const p of Object.values(LOOKS.players)) {
  if (p.toneSrc && p.toneSrc.startsWith(HAND)) { hand++; continue; }
  const s = p.mlbam && S[String(p.mlbam)];
  if (s && s.silhouette) sil++;
  if (!s || !s.rgb) { p.tone = null; p.toneSrc = null; if (!s || !s.silhouette) none++; continue; }
  p.tone = toneOf(s.rgb); p.toneSrc = SAMPLED; set++;
}
fs.writeFileSync(OUT, HEAD + 'export const LOOKS = ' + JSON.stringify(LOOKS, null, 1) + ';\n');
console.log(`tones: ${set} sampled, ${hand} kept as set by hand, ${sil} silhouettes left null, ${none} with no sample`);
