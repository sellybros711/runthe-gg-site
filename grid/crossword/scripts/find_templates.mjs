// One-off helper: search 5x5 black-square patterns and report which ones the
// current answer bank (baseball + fill) can actually fill, using the SAME
// validated fill logic as generate.mjs. Prints template black-lists + theme
// potential so we can hardcode a rotation of distinct daily grids.
//
//   node scripts/find_templates.mjs
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
const __dir = dirname(fileURLToPath(import.meta.url));
const D = JSON.parse(readFileSync(resolve(__dir, "../data/baseball.json"), "utf8"));
function parseCSV(text) {
  const rows = []; let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (inQ) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += c; }
    else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; if (field !== "" || row.length) { row.push(field); rows.push(row); row = []; field = ""; } }
    else field += c; }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const h = rows.shift().map((x) => x.trim());
  return rows.map((r) => Object.fromEntries(h.map((x, i) => [x, (r[i] ?? "").trim()])));
}
const PLAYERS = parseCSV(readFileSync(resolve(__dir, "../data/baseball.csv"), "utf8"));

const bank = new Map();
const addW = (a, theme) => { a = a.toUpperCase().replace(/[^A-Z]/g, ""); if (a.length < 3 || a.length > 8 || bank.has(a)) return; bank.set(a, { answer: a, len: a.length, theme }); };
[...PLAYERS, ...(D.teams || []), ...(D.stats || []), ...(D.venues || []), ...(D.glossary || [])].forEach((x) => addW(x.answer, true));
(D.fill || []).forEach((w) => addW(w.answer, false));
const byLen = {}; for (const e of bank.values()) (byLen[e.len] ||= []).push(e);

const N = 5;
const cellsOf = (s) => { const o = []; for (let i = 0; i < s.len; i++) o.push(s.dir === "A" ? [s.r, s.c + i] : [s.r + i, s.c]); return o; };
function slotsFor(bs) { const slots = []; const isB = (r, c) => bs.has(r + "," + c);
  for (let r = 0; r < N; r++) { let c = 0; while (c < N) { if (isB(r, c)) { c++; continue; } const s = c; while (c < N && !isB(r, c)) c++; if (c - s > 0) slots.push({ dir: "A", r, c: s, len: c - s }); } }
  for (let c = 0; c < N; c++) { let r = 0; while (r < N) { if (isB(r, c)) { r++; continue; } const s = r; while (r < N && !isB(r, c)) r++; if (r - s > 0) slots.push({ dir: "D", r: s, c, len: r - s }); } }
  return slots; }
const key = (s) => s.dir + s.r + s.c;
const noSingles = (slots) => slots.every((s) => s.len >= 3);
function connected(bs) { const w = []; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!bs.has(r + "," + c)) w.push(r + "," + c); if (!w.length) return false; const seen = new Set([w[0]]), st = [w[0]]; while (st.length) { const [r, c] = st.pop().split(",").map(Number); for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) { if (r + dr < 0 || c + dc < 0 || r + dr >= N || c + dc >= N) continue; const k = (r + dr) + "," + (c + dc); if (bs.has(k) || seen.has(k)) continue; seen.add(k); st.push(k); } } return seen.size === w.length; }
function allChecked(bs, slots) { const A = new Set(), Dn = new Set(); for (const s of slots) for (const [y, x] of cellsOf(s)) (s.dir === "A" ? A : Dn).add(y + "," + x); for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const k = r + "," + c; if (bs.has(k)) continue; if (!A.has(k) || !Dn.has(k)) return false; } return true; }
const wordAt = (s, g) => cellsOf(s).map(([y, x]) => g[y][x]).join("");

// exact validated fill (mirrors generate.mjs)
function fillGrid(bs) {
  const slots = slotsFor(bs), grid = Array.from({ length: N }, () => Array(N).fill(null)), used = new Set(), assigned = new Set();
  const filled = (s) => cellsOf(s).every(([y, x]) => grid[y][x]);
  const matches = (s) => (byLen[s.len] || []).filter((e) => !used.has(e.answer) && cellsOf(s).every(([y, x], i) => !grid[y][x] || grid[y][x] === e.answer[i]));
  let calls = 0;
  function rec() {
    if (++calls > 400000) return false;
    let best = null, bc = null;
    for (const s of slots) { if (filled(s)) { if (!assigned.has(key(s))) { const w = wordAt(s, grid); if (!bank.has(w) || used.has(w)) return false; } continue; } const cs = matches(s); if (!cs.length) return false; if (!best || cs.length < bc.length) { best = s; bc = cs; } }
    if (!best) return true;
    const cells = cellsOf(best), bk = key(best);
    for (const e of bc) { const b = cells.map(([y, x]) => grid[y][x]); cells.forEach(([y, x], i) => (grid[y][x] = e.answer[i])); used.add(e.answer); assigned.add(bk); if (rec()) return true; used.delete(e.answer); assigned.delete(bk); cells.forEach(([y, x], i) => (grid[y][x] = b[i])); }
    return false;
  }
  return rec() ? { grid, slots } : null;
}

function combos(a, k, s = 0, cur = [], out = []) { if (cur.length === k) { out.push(cur.slice()); return out; } for (let i = s; i < a.length; i++) { cur.push(a[i]); combos(a, k, i + 1, cur, out); cur.pop(); } return out; }
const pos = []; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) pos.push([r, c]);

// Relaxed search: sparser grids (more blacks) of short answers can be almost
// entirely baseball. We keep no 1/2-letter runs + connected, but allow a cell
// to be checked in only one direction (common in themed dailies). Maximize the
// count of DISTINCT high-theme grids for a varied daily rotation.
const found = []; const seen = new Set(); const gridsSeen = new Set();
outer:
for (const k of [3, 4, 5]) {
  for (const seed of combos(pos, k)) {
    const set = new Set(); seed.forEach(([r, c]) => { set.add(r + "," + c); set.add((N - 1 - r) + "," + (N - 1 - c)); });
    if (set.size < 6 || set.size > 11) continue;
    const slots = slotsFor(set);
    if (!noSingles(slots) || !connected(set) || slots.length < 6) continue;
    const kk = [...set].sort().join("|"); if (seen.has(kk)) continue; seen.add(kk);
    const res = fillGrid(set);
    if (!res) continue;
    const theme = res.slots.filter((s) => bank.get(wordAt(s, res.grid)).theme).length;
    if (theme / res.slots.length < 0.5) continue;                    // want theme-heavy
    const gk = res.grid.map((r) => r.join("")).join("|"); if (gridsSeen.has(gk)) continue; gridsSeen.add(gk);
    found.push({ black: [...set].map((s) => s.split(",").map(Number)), theme, slots: res.slots.length, checked: allChecked(set, slots), grid: res.grid.map((row) => row.join("")) });
    if (found.length >= 60) break outer;
  }
}
found.sort((a, b) => (b.theme / b.slots) - (a.theme / a.slots) || b.slots - a.slots);
console.log("fillable theme-heavy templates:", found.length, "\n");
for (const f of found.slice(0, 12)) {
  console.log("black", JSON.stringify(f.black), "| theme", f.theme + "/" + f.slots, "| fully-checked:", f.checked);
  console.log(f.grid.join("\n"), "\n");
}
