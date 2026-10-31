/* Each hitter's real jersey number in that game, and his listed height and weight, from MLB's own
 * Stats API, for every pack. Writes shut-the-door/3d/looks-data.js and keeps the hand-set fields
 * already in it (tone, beard and their source notes), so a re-run never drops what was set by hand.
 *
 *   node shut-the-door/pipeline/fetch_looks.mjs DOWNLOAD_DIR
 *
 * DOWNLOAD_DIR is a new, empty folder outside the repo: each answer is saved there as it came (read
 * as data, never run).
 *
 * The number: the game's boxscore (/api/v1/game/<gamePk>/boxscore), `jerseyNumber` on the player's
 * entry for his team. If the boxscore has no number for him, the team's roster on the game date
 * (/api/v1/teams/<id>/roster?rosterType=fullRoster&date=<date>). Nothing else: a hitter with neither
 * is null and the scene falls back to the hash (looks.js), and the run prints him.
 * The game: the gamePk in the pack's sources (the live feed it was built from), or for the four packs
 * built from Retrosheet (1988, 2001, 2005, 2007) the one postseason game on the schedule that day
 * between the two clubs (GAMES below, each checked against the pack's title).
 * A Retrosheet id is matched to an MLBAM id only through that person's own Retrosheet cross reference
 * (hydrate=xrefId), among the players in that game's boxscore.
 * The build: /api/v1/people/<id>, height and weight as listed now (a retired player's last listing).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKS = path.join(HERE, '..', 'data', 'packs');
const OUT = path.join(HERE, '..', '3d', 'looks-data.js');
const DL = process.argv[2];
if (!DL) { console.error('usage: fetch_looks.mjs DOWNLOAD_DIR'); process.exit(2); }
fs.mkdirSync(DL, { recursive: true });

const API = 'https://statsapi.mlb.com/api/v1';
// the Retrosheet packs' games: MLB Stats API schedule for that date, the one game of that series
const GAMES = {
  'std-1988-ws1-eckersley': { gamePk: 67910, date: '1988-10-15' },
  'std-2001-ws7-rivera': { gamePk: 9101, date: '2001-11-04' },
  'std-2005-nlcs5-lidge': { gamePk: 39809, date: '2005-10-17' },
  'std-2007-ws4-papelbon': { gamePk: 224026, date: '2007-10-28' },
};

let n = 0;
const cache = new Map();
function get(url) {
  if (cache.has(url)) return cache.get(url);
  const f = path.join(DL, `${String(++n).padStart(4, '0')}.json`);
  execFileSync('curl', ['-sS', '-m', '30', '--retry', '3', '--fail', '-o', f, url]);
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  cache.set(url, j);
  return j;
}
const inches = (h) => { const m = /(\d+)'\s*(\d+)"/.exec(h || ''); return m ? +m[1] * 12 + +m[2] : null; };

export const HEAD = '/* GENERATED numbers and builds by pipeline/fetch_looks.mjs (MLB Stats API); tone and beard set by hand.\n'
  + ' * Re-run the script to refresh the fetched fields: it keeps every hand-set field. See looks.js for how\n'
  + ' * each field is used, and the vault decision 2026-10-31 for why.\n'
  + ' *\n'
  + ' * players: by pack batter id. tone 0 the light skin map .. 1 the dark one, toneSrc where it was set\n'
  + ' *   from; heightIn and weightLb as MLB lists him (people/<mlbam>). null: not known, the hash stands in.\n'
  + ' * games: by pack, then batter id. number the jersey number he wore in that game (boxscore, or the\n'
  + ' *   roster on that date), beard none, stubble or full as he wore it that season, beardSrc its source.\n'
  + ' */\n';

const old = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8').replace(/^[\s\S]*?export const LOOKS = /, '').replace(/;\s*$/, '')) : { players: {}, games: {} };
const players = {}, games = {}, noNumber = [], noBuild = [];

for (const f of fs.readdirSync(PACKS).filter((x) => x.endsWith('.json')).sort()) {
  const sc = JSON.parse(fs.readFileSync(path.join(PACKS, f), 'utf8')).scenario;
  const fromSrc = /game\/(\d+)\/feed/.exec(sc.sources.join(' '));
  const gamePk = fromSrc ? +fromSrc[1] : GAMES[sc.id]?.gamePk;
  if (!gamePk) throw new Error(`${sc.id}: no gamePk`);
  const box = get(`${API}/game/${gamePk}/boxscore`);
  const feedDate = GAMES[sc.id]?.date ?? get(`${API}/schedule?sportId=1&gamePk=${gamePk}`).dates?.[0]?.date;
  // every player in the game: MLBAM id -> { side, jerseyNumber }
  const inGame = new Map();
  for (const side of ['away', 'home']) {
    for (const p of Object.values(box.teams[side].players)) inGame.set(p.person.id, { side, teamId: box.teams[side].team.id, number: p.jerseyNumber || null, name: p.person.fullName });
  }
  // a Retrosheet id to its MLBAM id, through the person's own cross reference
  let xref = null;
  const mlbamOf = (id) => {
    if (/^\d+$/.test(id)) return +id;
    if (!xref) {
      xref = new Map();
      const ids = [...inGame.keys()];
      const people = get(`${API}/people?personIds=${ids.join(',')}&hydrate=xrefId`).people || [];
      for (const p of people) for (const r of p.xrefIds || []) if (r.xrefType === 'retrosheet') xref.set(r.xrefId, p.id);
    }
    return xref.get(id.slice(6)) ?? null;
  };
  const hitters = {};
  const oldGame = old.games?.[sc.id]?.hitters || {};
  for (const b of sc.batters) {
    const mlbam = mlbamOf(b.id);
    let number = null, numberSrc = null;
    const g = mlbam && inGame.get(mlbam);
    if (g && g.number) { number = String(g.number); numberSrc = 'box'; }
    else if (g) {
      const r = get(`${API}/teams/${g.teamId}/roster?rosterType=fullRoster&date=${feedDate}`).roster || [];
      const e = r.find((x) => x.person.id === mlbam);
      if (e && e.jerseyNumber) { number = String(e.jerseyNumber); numberSrc = 'roster'; }
    }
    if (number === null) noNumber.push(`${sc.id} ${b.name} (${b.id})`);
    const kept = oldGame[b.id] || {};
    hitters[b.id] = { name: b.name, number, numberSrc, beard: kept.beard ?? null, beardSrc: kept.beardSrc ?? null };
    if (!players[b.id]) {
      const person = mlbam ? get(`${API}/people/${mlbam}`).people?.[0] : null;
      const keptP = old.players?.[b.id] || {};
      const heightIn = person ? inches(person.height) : null, weightLb = person?.weight ?? null;
      if (!heightIn || !weightLb) noBuild.push(`${b.name} (${b.id})`);
      players[b.id] = { name: b.name, mlbam, heightIn: heightIn || null, weightLb: weightLb || null, tone: keptP.tone ?? null, toneSrc: keptP.toneSrc ?? null };
    }
  }
  games[sc.id] = { gamePk, date: feedDate, src: `${API}/game/${gamePk}/boxscore (jerseyNumber); roster ${feedDate} where the box has none`, hitters };
}

const LOOKS = { fetched: new Date().toISOString().slice(0, 10), source: 'MLB Stats API, statsapi.mlb.com', players, games };
fs.writeFileSync(OUT, HEAD + 'export const LOOKS = ' + JSON.stringify(LOOKS, null, 1) + ';\n');
const nh = Object.values(games).reduce((s, g) => s + Object.keys(g.hitters).length, 0);
console.log(`looks: ${Object.keys(players).length} hitters, ${nh} hitter games, ${nh - noNumber.length} with a real number`);
if (noNumber.length) console.log('no number:\n  ' + noNumber.join('\n  '));
if (noBuild.length) console.log('no build:\n  ' + noBuild.join('\n  '));
