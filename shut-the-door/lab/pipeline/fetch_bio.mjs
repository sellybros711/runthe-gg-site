/* Every batter's height, weight and batting side, from MLB's own Stats API, for all the packs.
 *
 *   node shut-the-door/lab/pipeline/fetch_bio.mjs DOWNLOAD_DIR
 *
 * DOWNLOAD_DIR is a new, empty folder outside the repo: each answer is saved there as it came
 * (read as data, never run). Writes shut-the-door/3d/assets/bio.json:
 *   { batters: { "<pack batter id>": { name, mlbam, heightIn, weightLb, batSide, source } }, fetched }
 * A pack id that is numeric is the MLBAM id: https://statsapi.mlb.com/api/v1/people/<id>. A
 * Retrosheet id (retro:xxxxx001, the 1988 and 2001 packs) is found by name with
 * /api/v1/people/search and kept only when that person's own Retrosheet cross reference is the
 * same id (hydrate=xrefId). Nothing is guessed: a batter not found stays out, and the scene uses
 * the league average body for him and says so in bio.json's "missing".
 * The Stats API gives the height and weight on record now (a retired player's last listing).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKS = path.join(HERE, '..', '..', 'data', 'packs');
const OUT = path.join(HERE, '..', '..', '3d', 'assets', 'bio.json');
const DL = process.argv[2];
if (!DL) { console.error('usage: fetch_bio.mjs DOWNLOAD_DIR'); process.exit(2); }
fs.mkdirSync(DL, { recursive: true });

let n = 0;
function get(url) {
  const f = path.join(DL, `${String(++n).padStart(3, '0')}.json`);
  execFileSync('curl', ['-sS', '-m', '30', '--fail', '-o', f, url]);
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}
const API = 'https://statsapi.mlb.com/api/v1';
const inches = (h) => { const m = /(\d+)'\s*(\d+)"/.exec(h || ''); return m ? +m[1] * 12 + +m[2] : null; };

const batters = {}, missing = [];
for (const f of fs.readdirSync(PACKS).filter((x) => x.endsWith('.json')).sort()) {
  const sc = JSON.parse(fs.readFileSync(path.join(PACKS, f), 'utf8')).scenario;
  for (const b of sc.batters) {
    if (batters[b.id]) continue;
    let person = null, how = '';
    if (/^\d+$/.test(b.id)) {
      person = get(`${API}/people/${b.id}`).people?.[0] ?? null;
      how = `${API}/people/${b.id}`;
    } else if (b.id.startsWith('retro:')) {
      const retro = b.id.slice(6);
      const found = get(`${API}/people/search?names=${encodeURIComponent(b.name)}`).people || [];
      for (const c of found) {
        const x = get(`${API}/people/${c.id}?hydrate=xrefId`).people?.[0];
        if (x && (x.xrefIds || []).some((r) => r.xrefType === 'retrosheet' && r.xrefId === retro)) { person = x; how = `${API}/people/${c.id} (retrosheet ${retro})`; break; }
      }
    }
    if (!person || !inches(person.height) || !person.weight) { missing.push({ id: b.id, name: b.name, pack: f }); continue; }
    batters[b.id] = { name: person.fullName, mlbam: person.id, heightIn: inches(person.height), weightLb: person.weight, batSide: person.batSide?.code ?? null, source: how };
  }
}
fs.writeFileSync(OUT, JSON.stringify({ fetched: new Date().toISOString().slice(0, 10), source: 'MLB Stats API, statsapi.mlb.com', batters, missing }, null, 1) + '\n');
console.log(`bio: ${Object.keys(batters).length} batters, ${missing.length} missing`, missing.map((m) => m.name).join(', '));
