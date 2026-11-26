#!/usr/bin/env node
// Run The Pitch club pool, step 1 of 3: pull the raw facts from Wikidata (CC0, no key).
//
//   node scripts/soccer-clubs/fetch.mjs [--cache .cache/soccer-clubs] [--fresh]
//
// For each league in config.json: its seasons from `from_season` (each season's 20 clubs, from
// the season item's "participating team"; a season Wikidata leaves empty takes its clubs from
// config `season_teams`), then every "member of sports team" spell at those clubs, then the
// facts of every man in them (born, positions, sport nation, citizenship, Wikipedia count).
// Raw answers go to the cache, never to the repo. build.mjs turns them into the shipped file.
// In the sandbox, run with NODE_USE_ENV_PROXY=1. GitHub's runners reach Wikidata directly.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/soccer-clubs/config.json'), 'utf8'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const CACHE = path.resolve(ROOT, arg('--cache', '.cache/soccer-clubs'));
const FRESH = process.argv.includes('--fresh');
const UA = 'RunTheGG-club-data/1.0 (runthe.gg; club pool from Wikidata)';
fs.mkdirSync(CACHE, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function sparql(q) {
  for (let a = 0; a < 5; a++) {
    try {
      const r = await fetch('https://query.wikidata.org/sparql', {
        method: 'POST',
        headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ query: q }),
      });
      if (r.status === 429 || r.status >= 500) throw new Error('HTTP ' + r.status);
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
      return (await r.json()).results.bindings;
    } catch (e) {
      console.error(`  retry ${a + 1}: ${e.message}`);
      await sleep(5000 * (a + 1));
    }
  }
  throw new Error('Wikidata query failed five times');
}
const val = (b, k) => (b[k] ? b[k].value : null);
const qid = (u) => (u ? u.slice(u.lastIndexOf('/') + 1) : null);
// "unknown value" comes back as a blank node URI; treat it as no date
const date = (u) => (u && /^\d/.test(u) ? u.slice(0, 10) : null);
async function cached(name, fn) {
  const f = path.join(CACHE, name);
  if (!FRESH && fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  const v = await fn();
  fs.writeFileSync(f, JSON.stringify(v));
  return v;
}

const today = new Date().toISOString().slice(0, 10);
const out = { fetched: today, leagues: [] };
const allClubs = new Set();
for (const lg of CFG.leagues) {
  const rows = await cached(`seasons-${lg.id}.json`, () => sparql(`
    SELECT ?season ?start ?team WHERE {
      ?season wdt:P3450 wd:${lg.qid}; wdt:P580 ?start.
      FILTER(?start >= "${lg.from_season}-07-01"^^xsd:dateTime)
      OPTIONAL { ?season wdt:P1923 ?team } }`));
  const seasons = {};
  for (const b of rows) {
    const start = date(val(b, 'start'));
    if (!start || start > today) continue;
    const y = +start.slice(0, 4);
    (seasons[y] ||= new Set());
    if (b.team) seasons[y].add(qid(val(b, 'team')));
  }
  for (const [y, teams] of Object.entries(lg.season_teams || {})) {
    if (seasons[y] && seasons[y].size) continue; // Wikidata has it now: theirs wins
    seasons[y] = new Set(teams);
  }
  const list = Object.keys(seasons).map(Number).sort();
  out.leagues.push({ id: lg.id, seasons: Object.fromEntries(list.map((y) => [y, [...seasons[y]].sort()])) });
  for (const y of list) for (const t of seasons[y]) allClubs.add(t);
}

const FROM = Math.min(...CFG.leagues.map((l) => l.from_season));
const clubs = {};
const people = new Set();
for (const t of [...allClubs].sort()) {
  const rows = await cached(`club-${t}.json`, async () => {
    const r = await sparql(`
      SELECT ?clubLabel ?p ?s ?e ?how WHERE {
        BIND(wd:${t} AS ?club)
        OPTIONAL { ?club rdfs:label ?clubLabel FILTER(lang(?clubLabel) = "en") }
        ?p p:P54 ?st. ?st ps:P54 ?club. ?p wdt:P31 wd:Q5.
        OPTIONAL { ?st pq:P580 ?s } OPTIONAL { ?st pq:P582 ?e } OPTIONAL { ?st pq:P1642 ?how } }`);
    await sleep(1000);
    return r;
  });
  const spells = new Map();
  for (const b of rows) {
    const p = qid(val(b, 'p'));
    const k = [p, date(val(b, 's')), date(val(b, 'e'))].join('|');
    const sp = spells.get(k) || { p, from: date(val(b, 's')), to: date(val(b, 'e')), loan: false };
    if (qid(val(b, 'how')) === CFG.loan_qid) sp.loan = true;
    spells.set(k, sp);
  }
  // only spells a decade can place: a start date, and not over before the league window
  for (const sp of spells.values()) {
    if (!sp.from || (sp.to && +sp.to.slice(0, 4) < FROM)) spells.delete([sp.p, sp.from, sp.to].join('|'));
    else people.add(sp.p);
  }
  clubs[t] = { label: rows.length ? val(rows[0], 'clubLabel') : t, spells: [...spells.values()] };
  console.log(`${clubs[t].label}: ${spells.size} spells`);
}
out.clubs = clubs;

// The men's facts, 250 at a time. Sitelinks (how many Wikipedias have an article) is the
// fame signal the rating rule uses for a man who never went to a World Cup.
const ids = [...people].sort();
const facts = {};
for (let i = 0; i < ids.length; i += 250) {
  const chunk = ids.slice(i, i + 250);
  const rows = await cached(`people-${i / 250}-${chunk[0]}.json`, async () => {
    const r = await sparql(`
      SELECT ?p ?name ?dob ?sex ?pos ?posLabel ?sport ?sportLabel ?cit ?citLabel ?links WHERE {
        VALUES ?p { ${chunk.map((x) => 'wd:' + x).join(' ')} }
        OPTIONAL { ?p rdfs:label ?name FILTER(lang(?name) = "en") }
        OPTIONAL { ?p wdt:P569 ?dob } OPTIONAL { ?p wdt:P21 ?sex } OPTIONAL { ?p wdt:P413 ?pos }
        OPTIONAL { ?p wdt:P1532 ?sport } OPTIONAL { ?p wdt:P27 ?cit }
        OPTIONAL { ?p wikibase:sitelinks ?links }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". ?pos rdfs:label ?posLabel. ?sport rdfs:label ?sportLabel. ?cit rdfs:label ?citLabel. } }`);
    await sleep(1000);
    return r;
  });
  for (const b of rows) {
    const p = qid(val(b, 'p'));
    const f = (facts[p] ||= { name: null, dob: null, sex: null, pos: [], sport: [], cit: [], links: 0 });
    f.name ||= val(b, 'name');
    f.dob ||= date(val(b, 'dob'));
    f.sex ||= qid(val(b, 'sex'));
    f.links = Math.max(f.links, +(val(b, 'links') || 0));
    for (const [k, l] of [['pos', 'posLabel'], ['sport', 'sportLabel'], ['cit', 'citLabel']]) {
      const x = val(b, l);
      if (x && !f[k].includes(x)) f[k].push(x);
    }
  }
  console.log(`people ${Math.min(i + 250, ids.length)}/${ids.length}`);
}
out.people = facts;
fs.writeFileSync(path.join(CACHE, 'raw.json'), JSON.stringify(out));
console.log(`wrote ${path.relative(ROOT, path.join(CACHE, 'raw.json'))}: ${Object.keys(clubs).length} clubs, ${ids.length} men`);
