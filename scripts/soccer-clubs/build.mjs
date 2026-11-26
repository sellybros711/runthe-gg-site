#!/usr/bin/env node
// Run The Pitch club pool, step 2 of 3: turn the raw Wikidata pull into data/club_players.json.
//
//   node scripts/soccer-clubs/build.mjs [--cache .cache/soccer-clubs]
//
// The shape (agreed with the Run The Pitch Agent, 2026-11-26):
//   clubs:   { club_id: { league, names: { "2010s": "Liverpool", ... } } }
//   players: [ { id, name, nation, born, pos, overall, rated, wc_ids, spells: [ { club_id, from, to, loan? } ] } ]
// club_id is the slug players_all uses, so club rows and World Cup rows join. A man is in a club's
// decade if a spell overlaps it by a year; the game builds those units itself (soccer/club.js).
// No date or other run-to-run noise goes in the file, so an unchanged pull rebuilds it byte for byte.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/soccer-clubs/config.json'), 'utf8'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const CACHE = path.resolve(ROOT, arg('--cache', '.cache/soccer-clubs'));
const RAW = JSON.parse(fs.readFileSync(path.join(CACHE, 'raw.json'), 'utf8'));
const WC = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/players_all.json'), 'utf8'));
const NOW = +RAW.fetched.slice(0, 4);

// the same slug convertData.js gives club_id
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
const plain = (label) => label.replace(/^AFC /, '').replace(/ (A\.F\.C\.|F\.C\.|AFC|FC)$/, '').trim();
const decadeOf = (y) => Math.floor(y / 10) * 10;
const dlabel = (d) => `${d}s`;

const WC_COUNTRIES = new Set(WC.map((r) => r.country));
function nation(label) {
  if (!label || CFG.ignore_nations.includes(label)) return null;
  const n = CFG.nations[label] || label;
  return WC_COUNTRIES.has(n) || CFG.no_world_cup.includes(n) ? n : { unknown: label };
}

// clubs, and the years each was in its league (a season starting in y covers y and y + 1)
const CLUB = {};
for (const lg of CFG.leagues) {
  const L = RAW.leagues.find((x) => x.id === lg.id);
  for (const [y, teams] of Object.entries(L.seasons)) {
    for (const q of teams) {
      const c = (CLUB[q] ||= { league: lg.name, years: new Set(), id: CFG.club_ids[q] || slug(plain(RAW.clubs[q].label)) });
      c.years.add(+y).add(+y + 1);
    }
  }
}

// World Cup rows by name, for wc_ids and the World Cup rating
const byName = new Map();
const bySurname = new Map();
for (const r of WC) {
  const k = norm(r.name);
  (byName.get(k) || byName.set(k, []).get(k)).push(r);
  const s = k.split(' ').pop();
  (bySurname.get(s) || bySurname.set(s, []).get(s)).push(r);
}
const wcBorn = (r) => (r.age_at_tournament ? r.year - r.age_at_tournament : null);
function wcMatch(f, born, nations) {
  const fits = (r) => (wcBorn(r) == null || Math.abs(wcBorn(r) - born) <= 1) && (!nations.length || nations.includes(r.country));
  let m = (byName.get(norm(f.name)) || []).filter(fits);
  if (!m.length) {
    // "Alisson" in the World Cup file is "Alisson Becker" here: one surname, one birth year, one nation
    const toks = norm(f.name).split(' ');
    const cands = new Map();
    for (const t of toks) for (const r of bySurname.get(t) || []) if (wcBorn(r) != null && fits(r) && norm(r.name).split(' ').every((x) => toks.includes(x))) cands.set(r.player_id, r);
    const people = new Set([...cands.values()].map((r) => norm(r.name) + '|' + r.country));
    if (people.size === 1) m = [...cands.values()];
  }
  return m;
}

function position(labels, wcRows) {
  if (wcRows.length) {
    const c = {};
    for (const r of wcRows) c[r.position] = (c[r.position] || 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
  }
  const got = new Set();
  for (const l of labels.map((x) => x.toLowerCase())) {
    if (/goal ?keeper|goaltender/.test(l)) got.add('GK');
    else if (/back|defender|sweeper|libero|stopper/.test(l)) got.add('DEF');
    else if (/midfield|playmaker|wing half/.test(l)) got.add('MID');
    else if (/forward|striker|winger|attacker|wing$/.test(l)) got.add('FWD');
  }
  // two listed: the more specific role wins over a plain midfielder
  for (const p of ['GK', 'DEF', 'FWD', 'MID']) if (got.has(p)) return p;
  return null;
}

const players = [];
const dropped = { not_a_man: 0, too_old: 0, no_position: 0, no_name: 0, no_spell: 0 };
const unknownNations = {};
for (const [id, f] of Object.entries(RAW.people)) {
  if (f.sex !== 'Q6581097') { dropped.not_a_man++; continue; }
  const born = f.dob ? +f.dob.slice(0, 4) : null;
  if (!born || born < CFG.born_from) { dropped.too_old++; continue; }
  if (!f.name || /^Q\d+$/.test(f.name)) { dropped.no_name++; continue; }
  const spells = [];
  for (const [q, c] of Object.entries(RAW.clubs)) {
    if (!CLUB[q]) continue;
    for (const s of c.spells) {
      if (s.p !== id) continue;
      const from = +s.from.slice(0, 4);
      if (!s.to && from < NOW - CFG.open_spell_years) continue; // an old spell nobody closed
      const to = s.to ? +s.to.slice(0, 4) : null;
      const last = to ?? NOW;
      let inLeague = false;
      for (let y = from; y <= last; y++) if (CLUB[q].years.has(y)) inLeague = true;
      if (!inLeague || last < CFG.decades[0]) continue;
      spells.push({ club_id: CLUB[q].id, from, to, ...(s.loan ? { loan: true } : {}) });
    }
  }
  if (!spells.length) { dropped.no_spell++; continue; }
  const nats = [...f.sport, ...f.cit].map(nation).filter((n) => typeof n === 'string');
  for (const n of [...f.sport, ...f.cit].map(nation)) if (n && typeof n === 'object') unknownNations[n.unknown] = (unknownNations[n.unknown] || 0) + 1;
  const wc = wcMatch(f, born, nats);
  const pos = position(f.pos, wc);
  if (!pos) { dropped.no_position++; continue; }
  const sportNat = f.sport.map(nation).find((n) => typeof n === 'string');
  const nat = wc.length ? wc[0].country : sportNat || nats[0] || null;
  spells.sort((a, b) => a.from - b.from || (a.to ?? 9999) - (b.to ?? 9999) || a.club_id.localeCompare(b.club_id));
  players.push({
    // the World Cup file's name where he is in it ("John Obi Mikel", not Wikidata's "Mikel John Obi"), so both sides agree
    id, name: wc.length ? [...wc].sort((a, b) => b.year - a.year)[0].name : f.name, nation: nat, born, pos,
    overall: wc.length ? Math.max(...wc.map((r) => r.wc_overall)) : null,
    rated: wc.length ? 'wc' : 'rule',
    links: f.links,
    wc_ids: [...new Set(wc.map((r) => r.player_id))].sort(),
    spells,
  });
}

// The rule: a man with no World Cup is rated from his fame (how many Wikipedias carry him),
// read against the World Cup ratings of men at these clubs with the same fame, minus a step for
// never having been picked, then held between the floor and the ceiling. The ceiling keeps a
// formula man below the greats.
const rated = players.filter((p) => p.rated === 'wc').sort((a, b) => a.links - b.links);
const BINS = 10;
const pts = [];
for (let i = 0; i < BINS; i++) {
  const b = rated.slice(Math.floor((i * rated.length) / BINS), Math.floor(((i + 1) * rated.length) / BINS));
  if (!b.length) continue;
  const o = b.map((p) => p.overall).sort((x, y) => x - y);
  pts.push([Math.log1p(b[b.length >> 1].links), o[o.length >> 1]]);
}
function rule(links) {
  const x = Math.log1p(links);
  let v;
  if (x <= pts[0][0]) v = pts[0][1] - (pts[0][0] - x) * 4;
  else if (x >= pts[pts.length - 1][0]) v = pts[pts.length - 1][1];
  else for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; v = y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); break; }
  return Math.max(CFG.rule_floor, Math.min(CFG.rule_ceiling, Math.round(v - 3)));
}
for (const p of players) { if (p.rated === 'rule') p.overall = rule(p.links); delete p.links; }
players.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

// each club's name in each decade: the World Cup file's name of the time where it has the club, else Wikidata's
const clubs = {};
for (const [q, c] of Object.entries(CLUB)) {
  const names = {};
  for (const d of CFG.decades) {
    if (![...c.years].some((y) => decadeOf(y) === d)) continue;
    const seen = {};
    for (const r of WC) if (r.club_id === c.id && decadeOf(r.year) === d) seen[r.club_at_tournament] = (seen[r.club_at_tournament] || 0) + 1;
    const top = Object.entries(seen).sort((a, b) => b[1] - a[1])[0];
    names[dlabel(d)] = top ? top[0] : plain(RAW.clubs[q].label);
  }
  clubs[c.id] = { league: c.league, wikidata: q, names };
}
// A club's decade ships only if its non-loan men make a full squad (the gate's 2 GK, 6 DEF,
// 6 MID, 4 FWD). A club in the league for one season of a decade, or this decade where Wikidata
// lags, can fall short: that decade is left out of names, and the game builds no side for it.
const NEED = CFG.squad;
const inDecade = (s, d) => s.from <= d + 9 && (s.to ?? NOW) >= d;
const short = [];
for (const [id, c] of Object.entries(clubs)) {
  for (const dl of Object.keys(c.names)) {
    const d = +dl.slice(0, 4);
    const n = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const p of players) if (p.spells.some((s) => s.club_id === id && !s.loan && inDecade(s, d))) n[p.pos]++;
    if (!Object.entries(NEED).every(([k, v]) => n[k] >= v)) { delete c.names[dl]; short.push(`${id} ${dl} (${Object.entries(n).map(([k, v]) => v + ' ' + k).join(', ')})`); }
  }
}
for (const [id, c] of Object.entries(clubs)) if (!Object.keys(c.names).length) delete clubs[id];
const ships = (s) => clubs[s.club_id] && Object.keys(clubs[s.club_id].names).some((dl) => inDecade(s, +dl.slice(0, 4)));
for (const p of players) p.spells = p.spells.filter((s) => clubs[s.club_id]);
const kept = players.filter((p) => p.spells.some(ships));

const out = {
  about: 'Run The Pitch club pool. Facts from Wikidata (CC0). overall: the best World Cup rating where rated is "wc", else the fame rule (scripts/soccer-clubs/build.mjs), never above the ceiling.',
  rule_ceiling: CFG.rule_ceiling,
  clubs: Object.fromEntries(Object.entries(clubs).sort()),
  players: kept,
};
fs.writeFileSync(path.join(ROOT, 'data/club_players.json'), JSON.stringify(out) + '\n');
const wcN = kept.filter((p) => p.rated === 'wc').length;
console.log(`data/club_players.json: ${Object.keys(clubs).length} clubs, ${kept.length} men (${wcN} rated from the World Cup, ${kept.length - wcN} by the rule)`);
console.log('left out:', JSON.stringify(dropped));
console.log('rule points (log fame, overall):', pts.map(([x, y]) => `${Math.round(Math.expm1(x))}:${y}`).join(' '));
console.log(`club decades left out, short of a squad: ${short.length}`);
for (const x of short) console.log('  ' + x);
if (Object.keys(unknownNations).length) console.log('nations not mapped:', JSON.stringify(unknownNations));
