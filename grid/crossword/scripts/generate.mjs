// RunTheGrid — Daily Crossword generation pipeline (baseball).
//
//   node scripts/generate.mjs [count]      # writes ../puzzles.js
//
// End-to-end proof of the GDD pipeline for one sport:
//   §5 extraction : baseball.json  ->  answer word-list (+ category, difficulty)
//   §4 templates  : per-category clue shells filled from the data row
//   §6 fill       : backtracking grid fill, baseball answers only, sportiest of N
//   §7 difficulty : fame/category signal per entry, averaged per puzzle
//
// Deterministic: each daily puzzle is seeded from its date, so a given day always
// regenerates the same grid + clues. Output matches the shape puzzles.js already
// feeds the UI, so nothing on the front end changes.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));

// Data source: the baseball hand data by default, or the SHARED-CORPUS superset
// (a strict extension of the baseball files) once scripts/build-from-corpus.mjs
// has produced it. Auto-detected; force baseball with DATASET=baseball.
const corpusJson = resolve(__dir, "../data/corpus.crossword.json");
const corpusCsv = resolve(__dir, "../data/corpus.crossword.csv");
const useCorpus = process.env.DATASET !== "baseball" && existsSync(corpusJson) && existsSync(corpusCsv);
const DATA_JSON = useCorpus ? corpusJson : resolve(__dir, "../data/baseball.json");
const DATA_CSV = useCorpus ? corpusCsv : resolve(__dir, "../data/baseball.csv");

// Data contract (see README): the large, growable PLAYER table is a CSV; the
// smaller structured lookups + common fill are one JSON. Both are drop-in — a
// bigger CSV/JSON from the data pipeline plugs in with no code changes.
const DATA = JSON.parse(readFileSync(DATA_JSON, "utf8")); // teams, stats, venues, glossary, fill

// Minimal RFC4180-ish CSV parser (handles quoted fields, embedded commas, "" escapes).
function parseCSV(text) {
  const rows = []; let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; if (field !== "" || row.length) { row.push(field); rows.push(row); row = []; field = ""; } }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift().map((h) => h.trim());
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}
const PLAYERS = parseCSV(readFileSync(DATA_CSV, "utf8"))
  .map((p) => ({ ...p, hof: p.hof === "1" || p.hof.toLowerCase() === "true" }));

// ---- seeded RNG (mulberry32) so generation is reproducible -----------------
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (arr, r) => arr[Math.floor(r() * arr.length)];

// ---- §5 extraction: build the answer bank ----------------------------------
// Each answer carries its category + the data needed to generate a clue, plus a
// 1-5 difficulty (lower = more famous / more basic). Answers are uppercased,
// stripped to A-Z, and filtered to grid-usable lengths (3-8).
const bank = new Map(); // ANSWER -> { answer, len, category, difficulty, make(r) }

function add(answer, category, difficulty, make) {
  const a = answer.toUpperCase().replace(/[^A-Z]/g, "");
  if (a.length < 3 || a.length > 8) return;
  if (bank.has(a)) return;          // first writer wins (baseball added before fill)
  bank.set(a, { answer: a, len: a.length, category, difficulty, make, theme: category !== "fill" });
}

const T = {
  player: [
    (p) => `Hall of Famer ${p.first} ___`,
    (p) => `${p.first} ___, ${p.note}`,
    (p) => `${p.team} great ${p.first} ___`,
  ],
  playerNonHof: [
    (p) => `${p.team} star ${p.first} ___`,
    (p) => `${p.first} ___, ${p.note}`,
  ],
  team: [
    (t) => `${t.city}'s ${t.league} team`,
    (t) => `MLB club that plays at ${t.venue}`,
    (t) => `${t.league} team from ${t.city}`,
  ],
  stat: [
    (s) => `Box-score abbr. for ${s.full}`,
    (s) => `Stat-line shorthand: ${s.full}`,
  ],
  venue: [
    (v) => `${v.team} ballpark, ${v.note}`,
    (v) => `${v.city} ballpark (${v.note})`,
  ],
};

PLAYERS.forEach((p) =>
  add(p.answer, "player", p.hof ? 3 : 4, (r) => pick(p.hof ? T.player : T.playerNonHof, r)(p)));
(DATA.teams || []).forEach((t) => add(t.answer, "team", 2, (r) => pick(T.team, r)(t)));
(DATA.stats || []).forEach((s) => add(s.answer, "stat", 2, (r) => pick(T.stat, r)(s)));
(DATA.venues || []).forEach((v) => add(v.answer, "venue", 3, (r) => pick(T.venue, r)(v)));
(DATA.glossary || []).forEach((g) => add(g.answer, "glossary", 2, () => g.clue));
// common fill words (added last so they never displace a baseball answer)
(DATA.fill || []).forEach((w) => add(w.answer, "fill", 3, () => w.clue));

const byLen = {};
for (const e of bank.values()) (byLen[e.len] ||= []).push(e);
// stable order; the seeded shuffle happens in the fill so daily grids differ
for (const k in byLen) byLen[k].sort((a, b) => a.answer < b.answer ? -1 : 1);

// ---- §6 fill: black-square templates + backtracking ------------------------
const TEMPLATES = [
  { size: 5, black: [[0,3],[0,4],[1,4],[3,0],[4,0],[4,1]] },  // staircase
  { size: 5, black: [[0,0],[0,4],[2,2],[4,0],[4,4]] },        // notched + center
  { size: 5, black: [[0,4],[1,4],[2,2],[3,0],[4,0]] },        // diagonal-ish
];

function slotsFor(size, blackSet) {
  const N = size, slots = [];
  const isB = (r, c) => blackSet.has(r + "," + c);
  for (let r = 0; r < N; r++) { let c = 0; while (c < N) { if (isB(r, c)) { c++; continue; } const s = c; while (c < N && !isB(r, c)) c++; if (c - s >= 2) slots.push({ dir: "A", r, c: s, len: c - s }); } }
  for (let c = 0; c < N; c++) { let r = 0; while (r < N) { if (isB(r, c)) { r++; continue; } const s = r; while (r < N && !isB(r, c)) r++; if (r - s >= 2) slots.push({ dir: "D", r: s, c, len: r - s }); } }
  return slots;
}
const cellsOf = (s) => { const o = []; for (let i = 0; i < s.len; i++) o.push(s.dir === "A" ? [s.r, s.c + i] : [s.r + i, s.c]); return o; };

// Fill with baseball answers only. MRV selection + seeded candidate shuffle so
// each day's grid differs; returns the grid + which bank entry filled each slot.
const slotKey = (s) => s.dir + s.r + s.c;
function fill(size, black, r, preseed = []) {
  const N = size, blackSet = new Set(black.map((b) => b.join(",")));
  const slots = slotsFor(size, blackSet);
  const grid = Array.from({ length: N }, () => Array(N).fill(null));
  const used = new Set();
  const assigned = new Set();        // slot keys explicitly placed (pins + rec placements)
  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const filled = (s) => cellsOf(s).every(([y, x]) => grid[y][x]);
  // valid candidates, baseball answers first (shuffled within group) so grids
  // are theme-heavy; common fill only fills what the theme bank can't reach.
  const matches = (s) => {
    const ok = (byLen[s.len] || []).filter((e) => !used.has(e.answer) && cellsOf(s).every(([y, x], i) => !grid[y][x] || grid[y][x] === e.answer[i]));
    return shuffle(ok.filter((e) => e.theme)).concat(shuffle(ok.filter((e) => !e.theme)));
  };
  const wordAt = (s) => cellsOf(s).map(([y, x]) => grid[y][x]).join("");

  // pin the seed words first (a themed anchor or two → varied, baseball-heavy grids)
  for (const ps of preseed) {
    const s = slots.find((x) => slotKey(x) === ps.key);
    if (!s || s.len !== ps.answer.length) return null;
    cellsOf(s).forEach(([y, x], i) => (grid[y][x] = ps.answer[i]));
    used.add(ps.answer); assigned.add(ps.key);
  }

  function rec() {
    let best = null, bestC = null;
    for (const s of slots) {
      if (filled(s)) {
        // a slot completed by crossings (not explicitly assigned) must spell a
        // real bank word, and not duplicate one already placed — else dead branch
        if (!assigned.has(slotKey(s))) { const w = wordAt(s); if (!bank.has(w) || used.has(w)) return false; }
        continue;
      }
      const cs = matches(s); if (!cs.length) return false;
      if (!best || cs.length < bestC.length) { best = s; bestC = cs; }
    }
    if (!best) return true;
    const cells = cellsOf(best), bk = slotKey(best);
    for (const e of bestC) {
      const before = cells.map(([y, x]) => grid[y][x]);
      cells.forEach(([y, x], i) => (grid[y][x] = e.answer[i]));
      used.add(e.answer); assigned.add(bk);
      if (rec()) return true;
      used.delete(e.answer); assigned.delete(bk);
      cells.forEach(([y, x], i) => (grid[y][x] = before[i]));
    }
    return false;
  }
  if (!rec()) return null;
  return { N, blackSet, slots, grid };  // every slot's word is a valid bank entry
}

// ---- assemble one dated puzzle --------------------------------------------
function numbering(N, blackSet) {
  const isB = (r, c) => blackSet.has(r + "," + c);
  let n = 0; const numAt = {};
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (isB(r, c)) continue;
    const a = (c === 0 || isB(r, c - 1)) && c + 1 < N && !isB(r, c + 1);
    const d = (r === 0 || isB(r - 1, c)) && r + 1 < N && !isB(r + 1, c);
    if (a || d) numAt[r + "," + c] = ++n;
  }
  return numAt;
}

// Score a filled grid by how many entries are baseball answers.
function themeScore(slots, grid) {
  return slots.reduce((n, s) => n + (bank.get(cellsOf(s).map(([y, x]) => grid[y][x]).join("")).theme ? 1 : 0), 0);
}

function buildPuzzle(dateISO) {
  const r = rng(hash(dateISO));
  const order = Array.from({ length: TEMPLATES.length }, (_, i) => i).sort(() => r() - 0.5);
  let best = null, bestScore = -1;

  for (const idx of order) {
    const t = TEMPLATES[idx];
    const blackSet = new Set(t.black.map((b) => b.join(",")));
    const tSlots = slotsFor(t.size, blackSet);
    // Short slots (3-4) make good themed anchors: pinning one forces a baseball
    // entry and varies the grid day to day, without over-constraining the thin
    // demo bank the way a pinned 5-letter word (crossing every down) would.
    const anchors = tSlots.filter((s) => s.len <= 4);

    for (let attempt = 0; attempt < 160; attempt++) {
      const preseed = [];
      if (anchors.length) {
        const s = anchors[Math.floor(r() * anchors.length)];
        const themed = (byLen[s.len] || []).filter((e) => e.theme);
        if (themed.length) preseed.push({ key: slotKey(s), answer: themed[Math.floor(r() * themed.length)].answer });
      }
      const res = fill(t.size, t.black, r, preseed) || fill(t.size, t.black, r, []); // fall back to unseeded
      if (!res) continue;
      const score = themeScore(res.slots, res.grid);
      if (score > bestScore) { bestScore = score; best = res; }
      if (bestScore >= Math.min(5, res.slots.length)) break;   // good enough
    }
    if (best) break;   // first template that yields any valid grid wins the day
  }
  if (!best) return null;

  const { N, blackSet, slots, grid } = best;
  const numAt = numbering(N, blackSet);
  const rows = grid.map((row, y) => row.map((ch, x) => (blackSet.has(y + "," + x) ? "#" : ch)).join(""));
  const wordAt = (s) => cellsOf(s).map(([y, x]) => grid[y][x]).join("");
  const entries = slots
    .map((s) => { const e = bank.get(wordAt(s)); return { num: numAt[s.r + "," + s.c], dir: s.dir, r: s.r, c: s.c, answer: e.answer, clue: e.make(r), category: e.category, difficulty: e.difficulty }; })
    .sort((a, b) => a.num - b.num || (a.dir < b.dir ? -1 : 1));
  const diff = +(entries.reduce((n, e) => n + e.difficulty, 0) / entries.length).toFixed(2);
  return { id: dateISO, date: dateISO, size: N, rows, theme: bestScore,
    entries: entries.map(({ category, difficulty, ...e }) => e), difficulty: diff, sport: "baseball" };
}

// ---- run: generate `count` consecutive daily puzzles from a start date -----
const count = Math.max(1, parseInt(process.argv[2] || "6", 10));
const START = "2026-07-22";
function shiftDay(iso, d) { const dt = new Date(iso + "T00:00:00Z"); dt.setUTCDate(dt.getUTCDate() + d); return dt.toISOString().slice(0, 10); }

const puzzles = [];
for (let i = 0; i < count; i++) {
  const date = shiftDay(START, i);
  const p = buildPuzzle(date);
  if (p) puzzles.push(p);
  else console.error("!! could not generate", date);
}
if (!puzzles.length) { console.error("No puzzles generated — widen the bank or templates."); process.exit(1); }

const out =
`/* RunTheGrid — Daily Crossword puzzles.
 * GENERATED by scripts/generate.mjs from data/baseball.json — do not hand-edit.
 * Pipeline: extraction (GDD §5) -> template clues (§4) -> fill (§6) -> difficulty (§7).
 * Every entry is a baseball answer whose clue is generated from the dataset row.
 * ${puzzles.length} daily puzzles; the UI serves today's by date (falls back to the first).
 */
window.RTG_PUZZLES = {
  version: 2,
  sport: "baseball",
  puzzles: ${JSON.stringify(puzzles, null, 2)},
  get daily() {
    var today = new Date().toISOString().slice(0, 10);
    return this.puzzles.find(function (p) { return p.id === today; }) || this.puzzles[0];
  },
};
`;
writeFileSync(resolve(__dir, "../puzzles.js"), out);

// console summary
console.log(`Generated ${puzzles.length} puzzle(s) -> puzzles.js`);
for (const p of puzzles) {
  console.log(`\n${p.date}  ${p.size}x${p.size}  difficulty ${p.difficulty}`);
  console.log(p.rows.join("\n").replace(/#/g, "■"));
  console.log(p.entries.map((e) => `  ${e.num}${e.dir} ${e.answer} — ${e.clue}`).join("\n"));
}
