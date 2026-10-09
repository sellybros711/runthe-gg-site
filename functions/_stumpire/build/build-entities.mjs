#!/usr/bin/env node
/* Build functions/_stumpire/data/entities.json: every NFL, NBA and MLB player
 * and team Stumpire can be asked about, with a stable id and the aliases the
 * matcher accepts.
 *
 *   node functions/_stumpire/build/build-entities.mjs
 *
 * Sources, all already in this repo:
 *   arcade/sportegories-data.js   the player index (positions, clubs, awards,
 *                                 decades, career stats, fame)
 *   arcade/data/corpus.json       teams (former names, titles, conference) and
 *                                 the curated players' nicknames
 *   functions/_stumpire/data/aliases.json   the hand alias and merge table
 *
 * IDS ARE STABLE ACROSS REBUILDS by construction: league, slug of the name,
 * first decade. Only two people with the same name, league AND first decade
 * pick up a club slug too. The build reports any id the previous file had and
 * this one does not, because a published slate stores ids. (It also stores the
 * display name, so a lost id never breaks a result, only a future prompt.)
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { key, slug, fold, sortedKey, tokens } from '../normalize.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT = path.join(HERE, '../data/entities.json');
const LEAGUES = ['NFL', 'NBA', 'MLB'];

function loadSportegories() {
  const src = fs.readFileSync(path.join(ROOT, 'arcade/sportegories-data.js'), 'utf8');
  const ctx = { window: {} };
  vm.runInNewContext(src, ctx);
  return ctx.window.RTG_SPORTEGORIES_DATA;
}

const D = loadSportegories();
const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, 'arcade/data/corpus.json'), 'utf8'));
const hand = JSON.parse(fs.readFileSync(path.join(HERE, '../data/aliases.json'), 'utf8'));
const fixes = JSON.parse(fs.readFileSync(path.join(HERE, '../data/fixes.json'), 'utf8'));

/* ---------- teams ---------- */
const teams = [];
const teamByKey = {};          // league|key(name) -> team id, for mapping player clubs
function teamKey(league, s) { return league + '|' + key(s); }
for (const t of corpus) {
  if (t.entity_type !== 'team' || !LEAGUES.includes(t.sport) || !t.active) continue;
  const a = t.attributes || {};
  const one = v => (Array.isArray(v) ? v[0] : v);
  const id = 'team-' + t.id.replace(/_/g, '-');
  const nick = one(a.nickname) || t.display_name.split(' ').slice(-1)[0];
  const former = a.former_names || [];
  const ent = {
    id, n: t.display_name, s: t.sport, k: 't', f: t.fame_tier || 3,
    city: one(a.city) || null, nick, ti: one(a.championships_count) || 0,
    cf: one(a.conference) || null, dv: one(a.division) || null,
    fy: one(a.founded_year) || null, former,
    a: [nick, ...former]
  };
  teams.push(ent);
  teamByKey[teamKey(t.sport, t.display_name)] = id;
}
/* Nicknames and former names map a club string onto a franchise, current
   names first so "Baltimore Orioles" is the Orioles and not the 1902 Yankees. */
for (const t of teams) {
  const nk = teamKey(t.s, t.nick);
  if (!teamByKey[nk]) teamByKey[nk] = t.id;
}
for (const t of teams) for (const fn of t.former) {
  const fk = teamKey(t.s, fn);
  if (!teamByKey[fk]) teamByKey[fk] = t.id;
}
/* Old names the corpus does not list. Negro League clubs stay their own
   ('club:' ids): they are not the franchise of any team playing today. */
const CLUB_MAP = {
  'NBA|NO/Oklahoma City Hornets': 'team-nba-pelicans',
  'MLB|Cincinnati Redlegs': 'team-mlb-reds',
  'MLB|Brooklyn Robins': 'team-mlb-dodgers',
  'MLB|Boston Bees': 'team-mlb-braves'
};
const unmappedClubs = new Set();
function clubToTeam(league, s) {
  let id = CLUB_MAP[league + '|' + s] || teamByKey[teamKey(league, s)];
  if (!id && D.alias && D.alias[s]) id = teamByKey[teamKey(league, D.alias[s])];
  if (!id) unmappedClubs.add(league + ': ' + s);
  return id || ('club:' + slug(s));
}

/* ---------- players ---------- */
const nicknames = {};
for (const p of corpus) {
  if (p.entity_type !== 'player' || !LEAGUES.includes(p.sport)) continue;
  const nk = (p.attributes && p.attributes.nicknames) || [];
  if (nk.length) (nicknames[p.display_name + '|' + p.sport] = nicknames[p.display_name + '|' + p.sport] || [])
    .push({ nk, dc: (p.attributes && p.attributes.decades_active) || [] });
}
const dropped = new Set((hand.merge || []).map(m => m.drop));
const decadesOf = bits => {
  const out = [];
  for (let i = 0; i < 16; i++) if (bits & (1 << i)) out.push(D.dec0 + i * 10);
  return out;
};

const players = [];
for (const r of D.players) {
  const league = D.sports[r[1]];
  if (!LEAGUES.includes(league)) continue;
  const name = r[0];
  if (dropped.has(name + '|' + league)) continue;
  const dc = decadesOf(r[6]);
  players.push({
    n: name, s: league, k: 'p',
    pos: r[2] >= 0 ? D.pos[r[2]] : null,
    rp: (r[10] != null && r[10] >= 0) ? D.pos[r[10]] : null,
    tm: [...new Set(r[3].map(x => clubToTeam(league, D.teams[x])))],
    aw: r[5].map(x => D.awards[x]),
    dc, act: !!(r[7] & 1), d1: !!(r[7] & 2),
    st: r[9] || null, f: r[8] || 0,
    col: r[4] >= 0 ? D.cols[r[4]] : null,
    a: []
  });
}

/* ONE PERSON, ONE RECORD. The index carries some players twice: a curated row
   and a scraped row of the same man (Michael Jordan is a Shooting Guard in one
   and a Guard in the other). Two records would be two answers to one prompt,
   each holding half his share. Same rule as arcade/data.js samePerson: a
   shared club proves sameness; failing that, overlapping decades and a
   position that is the same or sits under the other. */
const posParent = D.posParent || {};
const posOk = (a, b) => !a || !b || a === b || posParent[a] === b || posParent[b] === a;
const overlaps = (a, b) => a.some(x => b.includes(x));
function samePerson(a, b) {
  if (a.tm.some(t => b.tm.includes(t))) return true;
  return overlaps(a.dc, b.dc) && posOk(a.pos, b.pos);
}
function absorb(keep, other) {
  keep.tm = [...new Set([...keep.tm, ...other.tm])];
  keep.aw = [...new Set([...keep.aw, ...other.aw])];
  keep.dc = [...new Set([...keep.dc, ...other.dc])].sort();
  if (!keep.pos || posParent[keep.pos] === other.pos) keep.pos = keep.pos || other.pos;
  if (other.pos && posParent[other.pos] === keep.pos) keep.pos = other.pos;
  keep.rp = keep.rp || other.rp;
  keep.col = keep.col || other.col;
  keep.act = keep.act || other.act;
  keep.d1 = keep.d1 || other.d1;
  keep.f = Math.max(keep.f, other.f);
  if (other.st) keep.st = Object.assign({}, other.st, keep.st || {});
}
let merged = 0;
{
  const byNL = {};
  for (const p of players) (byNL[p.n + '|' + p.s] = byNL[p.n + '|' + p.s] || []).push(p);
  const gone = new Set();
  for (const list of Object.values(byNL)) {
    if (list.length < 2) continue;
    list.sort((a, b) => b.f - a.f);
    for (let i = 0; i < list.length; i++) {
      if (gone.has(list[i])) continue;
      for (let j = i + 1; j < list.length; j++) {
        if (gone.has(list[j]) || !samePerson(list[i], list[j])) continue;
        absorb(list[i], list[j]); gone.add(list[j]); merged++;
      }
    }
  }
  for (let i = players.length - 1; i >= 0; i--) if (gone.has(players[i])) players.splice(i, 1);
}

/* Stable ids. */
const base = p => p.s.toLowerCase() + '-' + slug(p.n) + '-' + (p.dc[0] || 'na');
const groups = {};
for (const p of players) (groups[base(p)] = groups[base(p)] || []).push(p);
for (const [b, list] of Object.entries(groups)) {
  if (list.length === 1) { list[0].id = b; continue; }
  const seen = {};
  for (const p of list) {
    let id = b + '-' + slug(String(p.tm[0] || 'x').replace(/^(team-|club:)/, ''));
    while (seen[id]) id += 'x';
    seen[id] = 1; p.id = id;
  }
}

/* Aliases: curated nicknames, then the hand table. */
const byNameLeague = {};
for (const p of players) (byNameLeague[p.n + '|' + p.s] = byNameLeague[p.n + '|' + p.s] || []).push(p);
/* A namesake takes the nickname only if the curated record's decades pick
   him out (Frank Thomas the 1990s first baseman is The Big Hurt). */
for (const [k, recs] of Object.entries(nicknames)) {
  const ps = byNameLeague[k] || [];
  for (const rec of recs) {
    let hit = ps;
    if (hit.length > 1) hit = ps.filter(p => rec.dc.length && p.dc.some(d => rec.dc.includes(d)));
    if (hit.length > 1) hit = hit.filter(p => rec.dc.includes(p.dc[0]));
    if (hit.length === 1) hit[0].a.push(...rec.nk);
  }
}
const missingHand = [];
for (const [k, list] of Object.entries(hand.aliases || {})) {
  const [nm, lg, dec] = k.split('|');
  let ps = byNameLeague[nm + '|' + lg] || [];
  if (dec) ps = ps.filter(p => String(p.dc[0]) === dec);
  if (ps.length !== 1) { missingHand.push(k + (ps.length ? ' (ambiguous)' : '')); continue; }
  ps[0].a.push(...list);
}
const missingFix = [];
for (const [k, aw] of Object.entries(fixes.awards || {})) {
  const ps = byNameLeague[k] || [];
  if (ps.length !== 1) { missingFix.push(k); continue; }
  ps[0].aw = [...new Set([...ps[0].aw, ...aw])];
}
for (const p of players) p.a = [...new Set(p.a)].filter(x => key(x) && key(x) !== key(p.n));

/* The matcher's keys, computed here so a cold Worker does not spend a tenth
   of a second normalizing nine thousand names. x: [folded name, key, sorted
   key, surname]. xa: [folded alias, alias key] per alias. xt: a team's city
   plus nickname key. test/entities.test.mjs holds these to normalize.js. */
function precompute(e) {
  const t = tokens(e.n);
  e.x = [fold(e.n), key(e.n), sortedKey(e.n), e.k === 'p' && t.length > 1 ? t[t.length - 1] : ''];
  e.xa = (e.a || []).map(a => [fold(a), key(a)]);
  if (e.k === 't' && e.city && e.nick) e.xt = key(e.city + ' ' + e.nick);
}
const all = [...players, ...teams].sort((a, b) => a.id < b.id ? -1 : 1);
all.forEach(precompute);
const ids = new Set();
for (const e of all) { if (ids.has(e.id)) throw new Error('duplicate id ' + e.id); ids.add(e.id); }

/* What did the previous build have that this one lost? */
let lost = [];
if (fs.existsSync(OUT)) {
  try {
    const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    lost = prev.entities.map(e => e.id).filter(id => !ids.has(id));
  } catch (e) {}
}

const out = {
  source: 'arcade/sportegories-data.js ' + D.updated + ' + arcade/data/corpus.json',
  posParent: D.posParent || {},
  entities: all.map(e => {
    const o = {};
    for (const [k, v] of Object.entries(e)) {
      if (v == null || v === false || (Array.isArray(v) && !v.length)) continue;
      o[k] = v;
    }
    return o;
  })
};
fs.writeFileSync(OUT, JSON.stringify(out));
const c = {}; for (const e of all) c[e.s + ' ' + e.k] = (c[e.s + ' ' + e.k] || 0) + 1;
console.log('wrote', path.relative(ROOT, OUT), all.length, 'entities', c);
console.log('duplicate records merged:', merged);
console.log('player clubs mapped to no franchise:', unmappedClubs.size, [...unmappedClubs].join('; '));
if (missingHand.length) console.log('hand aliases with no unique target:', missingHand.join('; '));
if (missingFix.length) console.log('fixes with no unique target:', missingFix.join('; '));
if (lost.length) console.log('IDS LOST since the last build (' + lost.length + '):', lost.slice(0, 20).join(', '));
