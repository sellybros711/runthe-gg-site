// RunTheGrid — Daily Crossword: build answer data from the SHARED corpus.
//
//   node scripts/build-from-corpus.mjs
//
// Reads the shared content corpus (../../data/corpus.json) and emits crossword
// input data in EXACTLY the format generate.mjs already consumes (see
// data/DATA_CONTRACT.md): a players CSV (answer,first,team,note,hof) plus a
// structured JSON (teams/stats/venues/glossary/fill).
//
// NON-DESTRUCTIVE: the hand-made data/baseball.csv + data/baseball.json are read
// and kept intact — this writes a SUPERSET to new files:
//
//   data/corpus.crossword.csv    (baseball players first, then corpus players)
//   data/corpus.crossword.json   (baseball lookups + fill, plus corpus answers)
//
// so nothing hand-made is lost. generate.mjs auto-detects these files and builds
// puzzles.js from the richer corpus; delete them (or DATASET=baseball) to revert
// to the baseball-only pipeline.

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const p = (...s) => resolve(__dir, ...s);

// The crossword fill engine (generate.mjs) reshuffles every candidate list at
// every backtracking node, so its cost grows sharply with bank size — the full
// corpus (1200+ answers) makes a 5x5 take ~50s/puzzle. We therefore emit a
// star-weighted SUBSET: the biggest names first (this both keeps generation fast
// and biases daily grids toward famous answers). Raise the caps as the engine is
// optimised, or override at build time:  PLAYER_CAP=400 GLOSS_CAP=300 node ...
const PLAYER_CAP = parseInt(process.env.PLAYER_CAP || "180", 10);
const GLOSS_CAP = parseInt(process.env.GLOSS_CAP || "150", 10);

const CORPUS = JSON.parse(readFileSync(p("../../data/corpus.json"), "utf8"));
const BASE_JSON = JSON.parse(readFileSync(p("../data/baseball.json"), "utf8"));
const BASE_CSV = readFileSync(p("../data/baseball.csv"), "utf8");
// Sports-only fill: replaces the generic common-word fill so EVERY answer is
// sports-related. Edit data/sports-fill.json to add more short sports words.
const SPORTS_FILL = JSON.parse(readFileSync(p("../data/sports-fill.json"), "utf8")).fill;

// ---- helpers ---------------------------------------------------------------
const letters = (s) => (s || "").toUpperCase().replace(/[^A-Z]/g, "");
const usable = (s) => { const a = letters(s); return a.length >= 3 && a.length <= 8; };
const first = (arr) => (Array.isArray(arr) ? arr[0] : arr);
// Weight toward the big US leagues, biggest stars first (fame_tier).
const SPORT_RANK = { NFL: 0, NBA: 1, MLB: 2, NHL: 3, WNBA: 4, NCAA: 5, Soccer: 6 };
const sportRank = (s) => (s in SPORT_RANK ? SPORT_RANK[s] : 9);

// CSV field serialiser (RFC4180: quote if it contains comma/quote/newline).
const csvField = (v) => {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const csvRow = (cols) => cols.map(csvField).join(",");

// team id ("nba_bulls") -> proper nickname, from the corpus first, else derived.
const teamNick = new Map();
for (const e of CORPUS) {
  if (e.entity_type === "team") {
    const nick = first(e.attributes.nickname) || e.display_name;
    if (nick) teamNick.set(e.id, nick);
  }
}
const nickFor = (id) => {
  if (teamNick.has(id)) return teamNick.get(id);
  const tail = String(id || "").split("_").slice(1).join(" ");
  const nice = tail.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
  return nice.length <= 3 ? nice.toUpperCase() : nice;   // LSU, UCLA-style initialisms
};

// first name = display_name with the surname stripped off the end.
const firstName = (display, surname) => {
  const d = (display || "").trim();
  if (surname && d.toLowerCase().endsWith(surname.toLowerCase()))
    return d.slice(0, d.length - surname.length).trim() || d;
  return d.split(/\s+/)[0] || d;
};

// short, accurate signature that completes "{first} ___, {note}".
const playerNote = (a) => {
  const nick = first(a.nicknames);
  if (nick) return `nicknamed "${nick}"`;
  // use the CAREER-DEFINING decade (middle of the span), not the debut decade:
  // Michael Irvin debuted in 1988 but was a 1990s star, not "a 1980s star".
  const decs = (a.decades_active || []).filter((x) => typeof x === "number").sort((x, y) => x - y);
  const dec = decs[Math.floor(decs.length / 2)];
  return dec ? `a ${dec}s star` : "a star of the sport";
};

// ---- extract corpus players -> CSV rows ------------------------------------
const seenCsv = new Set();
// keep existing baseball surnames from winning-collision awareness (dedupe only
// within the corpus block; the baseball block is written first regardless).
const corpusPlayers = CORPUS
  .filter((e) => e.entity_type === "player")
  .sort((x, y) => sportRank(x.sport) - sportRank(y.sport) || (y.fame_tier || 0) - (x.fame_tier || 0));

const playerRows = [];
for (const e of corpusPlayers) {
  if (playerRows.length >= PLAYER_CAP) break;   // biggest stars first (sorted above)
  const surname = first(e.attributes.surname);
  if (!surname || !usable(surname)) continue;
  const key = letters(surname);
  if (seenCsv.has(key)) continue;
  seenCsv.add(key);
  const fn = firstName(e.display_name, surname);
  if (!fn) continue;
  const team = nickFor(first(e.attributes.teams)) || `${e.sport} club`;
  const hof = first(e.attributes.hall_of_fame) === true ? "1" : "0";
  playerRows.push(csvRow([surname, fn, team, playerNote(e.attributes), hof]));
}

// ---- extract non-player answers -> glossary rows (verbatim clues) ----------
// Everything else is routed through `glossary` (theme, clue used verbatim) so we
// never hit the baseball-specific team/stat/venue templates in generate.mjs; the
// clues we compose here are sport-correct on their own.
// Collect non-player answers as glossary candidates (theme; clue used verbatim,
// so we never hit the baseball-specific team/stat/venue templates). Composed
// clues are sport-correct on their own. Candidates carry entity_type + fame so
// we can keep the most famous ones under GLOSS_CAP.
const TERM_CLUE = {
  position: (e) => `${e.sport} position`,
  award:    (e) => `${e.sport} honor`,
  trophy:   (e) => `${e.sport} trophy`,
  venue:    (e) => `${e.sport} venue`,
  stat:     (e) => `${e.sport} stat`,
  event:    (e) => `${e.sport} event`,
};

const cand = [];
const pushCand = (answer, clue, type, fame) => {
  if (clue && usable(answer)) cand.push({ answer: letters(answer), clue, type, fame: fame || 0 });
};
for (const e of CORPUS) {
  const t = e.entity_type, A = e.attributes || {};
  if (t === "team") {
    const nick = first(A.nickname) || e.display_name;
    const city = first(A.city), league = first(A.league) || e.sport;
    if (nick) pushCand(nick, city ? `${city}'s ${league} team` : `${league} team`, "team", e.fame_tier);
  } else if (t === "term") {
    const make = TERM_CLUE[first(A.term_kind)];
    if (make) pushCand(e.display_name, make(e), "term", e.fame_tier);
  } else if (t === "college") {
    const nick = first(A.nickname), conf = first(A.conference);
    const clue = nick && conf ? `${conf} school, the ${nick}` : conf ? `${conf} school` : `College team`;
    pushCand(e.display_name, clue, "college", e.fame_tier);
  } else if (t === "coach") {
    const surname = first(A.surname);
    // baseball has managers, not coaches; name the team when we know it so
    // clues can't fit two people (e.g. NBA coaches Steve Kerr AND Steve Nash)
    const role = e.sport === "MLB" ? "manager" : "coach";
    const cteam = nickFor(first(A.teams));
    if (surname) pushCand(surname, `${cteam ? cteam + " " : e.sport + " "}${role} ${firstName(e.display_name, surname)} ___`, "coach", e.fame_tier);
  } else if (t === "owner") {
    const surname = first(A.surname);
    if (surname) { const team = nickFor(first(A.teams)); pushCand(surname, team ? `${team} owner ${firstName(e.display_name, surname)} ___` : `Sports owner ${firstName(e.display_name, surname)} ___`, "owner", e.fame_tier); }
  }
}

// Group by type, most-famous first within each; then round-robin across types up
// to GLOSS_CAP so teams, terms, colleges, coaches and owners are all represented
// (a pure fame sort otherwise floods the list with fame-5 teams/colleges and
// starves the short sports terms that do the real crossing work).
const glossary = [];
const seenGloss = new Set(seenCsv);         // avoid duplicating a player surname
let counts = { player: playerRows.length, team: 0, term: 0, college: 0, coach: 0, owner: 0 };
const groups = {};
for (const c of cand) (groups[c.type] ||= []).push(c);
for (const k in groups) groups[k].sort((a, b) => b.fame - a.fame);
const order = ["team", "term", "college", "coach", "owner"];
let progressed = true;
while (glossary.length < GLOSS_CAP && progressed) {
  progressed = false;
  for (const type of order) {
    const g = groups[type];
    if (!g || !g.length) continue;
    const c = g.shift();
    progressed = true;
    if (seenGloss.has(c.answer)) continue;
    seenGloss.add(c.answer);
    glossary.push({ answer: c.answer, clue: c.clue });
    counts[type]++;
    if (glossary.length >= GLOSS_CAP) break;
  }
}

// ---- write the SUPERSET csv (baseball rows first, then corpus rows) ---------
// baseball.csv already carries its header; append corpus player rows after it.
const baseTrim = BASE_CSV.replace(/\s+$/, "");
const outCsv = baseTrim + "\n" + playerRows.join("\n") + "\n";
writeFileSync(p("../data/corpus.crossword.csv"), outCsv);

// ---- write the SUPERSET json (baseball lookups + fill, plus corpus glossary) -
const outJson = {
  _meta: {
    sport: "multi",
    note: "GENERATED by scripts/build-from-corpus.mjs — superset of hand-made baseball.json plus answers derived from ../../data/corpus.json. Do not hand-edit; re-run the builder.",
  },
  teams: BASE_JSON.teams || [],
  stats: BASE_JSON.stats || [],
  venues: BASE_JSON.venues || [],
  glossary: [...(BASE_JSON.glossary || []), ...glossary],
  fill: SPORTS_FILL,   // sports-only fill (no generic common words)
};
writeFileSync(p("../data/corpus.crossword.json"), JSON.stringify(outJson, null, 2) + "\n");

// ---- report ----------------------------------------------------------------
const totalCorpus = counts.player + counts.team + counts.term + counts.college + counts.coach + counts.owner;
console.log("Built crossword data from the shared corpus:");
console.log(`  players (CSV surnames) : ${counts.player}`);
console.log(`  teams   (glossary)     : ${counts.team}`);
console.log(`  terms   (glossary)     : ${counts.term}`);
console.log(`  colleges(glossary)     : ${counts.college}`);
console.log(`  coaches (glossary)     : ${counts.coach}`);
console.log(`  owners  (glossary)     : ${counts.owner}`);
console.log(`  ---------------------------------`);
console.log(`  corpus answers total   : ${totalCorpus}`);
console.log(`  + kept baseball players: ${BASE_CSV.trim().split(/\n/).length - 1}`);
console.log(`  + kept baseball fill   : ${(BASE_JSON.fill || []).length}`);
console.log(`Wrote data/corpus.crossword.csv and data/corpus.crossword.json`);
console.log(`Now run:  node scripts/generate.mjs 7   (auto-uses the corpus superset)`);
