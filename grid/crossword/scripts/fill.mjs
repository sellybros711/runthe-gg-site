// Proof-of-concept crossword fill engine for RunTheGrid.
// Mirrors GDD §6 (backtracking word fill over a black-square template).
// Scoped to a 5x5 template so we can emit a *provably valid* sample puzzle
// for the design prototype instead of hand-faking one.
//
//   node scripts/fill.mjs
//
// It prefers sports terms for entries (SPORTS list, tried first) and falls
// back to a common-English dictionary only where a dense crossing forces it —
// exactly the shape the real pipeline has (sports word bank from GDD §5, with
// crossings resolved by the fill engine). Prints the grid + slot map + JSON we
// paste into index.html as the demo puzzle.

// ---- black-square templates (1 = black). First one that fills wins. --------
const TEMPLATES = [
  [ [0,0,0,1,1],[0,0,0,0,1],[0,0,0,0,0],[1,0,0,0,0],[1,1,0,0,0] ], // staircase
  [ [1,0,0,0,1],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[1,0,0,0,1] ], // notched corners
  [ [0,0,0,0,1],[0,0,0,0,0],[0,0,1,0,0],[0,0,0,0,0],[1,0,0,0,0] ], // center block
];

// ---- sports terms (preferred): the kind of list GDD §5 extraction emits -----
const SPORTS = `
ACE PAR RBI ERA REF LOB NET BAT RUN WIN PIN TIE LAP MAT OUT HIT JAB TEE RIM ROD
GYM MMA REP KO
DUNK GOAL PUCK RINK PUTT ACES PARS SETS RUNS HITS OUTS BATS REFS LAPS PINS MITT
KICK POST SAVE DIVE TEAM BALL PASS RACE SLAM PLAY GAME FANS FOUL RACK WINS LOSS
DRAW RING TEES LOBS JABS MATS PADS SPIN DECK EDGE IRON WOOD SHOT CHIP HOOK GRIP
LIES TOUR HOLE SLAP WING POLE DASH MILE HEAT BOUT BELT JUDO REPS GYMS LIFT PARK
HOME BASE WALK BUNT BIRD ICER NETS DUNK PUNT SACK YARD DOWN DEKE
ARENA MEDAL SKATE COACH SCORE FIELD COURT RALLY SERVE RELAY VAULT PITCH SWISH
GREEN EAGLE BASES RINGS GOALS SPORT TITLE DERBY DRAFT CLEAT SPARE SLICE DRIVE
PUTTS DUNKS SKIER RIDER RACER JUMPS PACER SPURS IRONS WOODS HOLES SHOTS CHIPS
DIVOT BOGEY CADDY LINKS APRON ROUGH RANGE SWING TEMPO WEDGE HOMER STEAL SLIDE
MOUND PLATE BUNTS WALKS SAVES BLOCK GUARD BENCH PAINT PRESS YARDS DOWNS PUNTS
KICKS BLITZ SNEAK SACKS ICING SLASH DEKES POWER FINAL MATCH BOUTS SKATE ROUND
`.trim().split(/\s+/);

// ---- common-English fill dictionary (only used where crossings force it) ----
const COMMON = `
ARE EAR ONE OAR RAN RAT TAR SEA SET ETA ORE ROE EON NAP TAN ANT ART OAT ODE AIR
AID ADO ERR EAT TEN TON TOE TOT DOE DON DOT NOD NOR NOT OAK OWE OWN RED REV ROT
SAD SAG SAT SAW SIR SIT SOD SON SUN TAB TAD TIN TIP TOP URN USE VAN VAT VET VIA
AREA IDEA OPEN EASE RATE TIDE NEAR LANE LINE LOSE NOSE ROSE ROAD READ DEAL DEAR
DENS ONES ORAL ETAS SEAT SEAR STAR STIR SORE SODA SITE SIRE ERAS ANTE TENS TEND
TEAR TOES TORE DOTS DOSE DONE OARS OATS ODES NEST NETS NOTE ACRE ACID AIDE AIDS
AIMS AIRS ALSO ALTO AMID ANEW ANTS APES ARCS ARID ARKS ATOM AVID AWES AXIS BEAD
DALE DARE DART DATE DAWN DEAN DENT DIAL DINE DIRT DOER DOOR DOSE DOTE DRAT DUES
EARN EASE EAST EDIT ENDS EONS ETAS EVEN EVER EYED IDEA IDES IRES IRON ISLE ITEM
NADA NAME NEAT NEED NERD NEWT NICE NINE NODE NONE NOON NORM NOSE NOTE OATH OBOE
ODOR OGRE OILS OMEN ONTO OPAL ORAL ORCA ORES OVAL OVEN RAIL RAIN RANT RASP RATS
READ REAL REAP REAR REDS REED REEL REIN RELY REND RENT REST RICE RIDE RILE RIND
RIOT RISE RITE ROAD ROAM ROAR ROBE RODE ROLE ROOD ROOM ROOT ROPE ROSE ROTE RUDE
RUIN RUSE RUST SAND SANE SASS SATE SAVE SCAN SEAL SEAM SEAR SEAS SEAT SECT SEED
SEEK SEEN SEER SEND SENT SERF SETS SIDE SIRE SITE SIZE SLED SLID SLIT SLOT SNAP
SODA SOLD SOLE SOLO SONS SOON SOOT SORE SORT SPAN SPAR SPED SPUN STAB STAR STEM
STEP STIR STOP TALE TAME TAPE TARE TART TEAL TEAM TEAR TEAS TEED TEEN TEND TENS
TENT TERN TIDE TIED TIER TILE TIME TINE TINS TINT TIRE TOAD TOED TOES TOGA TOIL
TOLD TOLL TONE TONS TOOL TORE TORN TOSS TOTE TREE TRIM TROD TRODE TRUE TSAR TUBE
ADORE AISLE ALONE ALONG ALTAR ANGER ANODE ANTES ARENA ARISE ARSON ASIDE ASSET
ASTER ATONE DANCE DARTS DATES DEALS DEANS DENSE DINER DINES DIRTS DOTES DRAKE
DRANK DREAD DRONE EAGER EARED EARNS EASED EASEL EATEN EDITS ELATE ENDER ENTER
ERASE ESTER IRATE IRONS ISLES NADIR NAMES NEARS NEEDS NERVE NESTS NOOSE NORSE
NOSES NOTES OASES OASIS OATEN ODDER OILED OLDEN ONSET OPENS ORATE ORDER ORNATE
OSIER OTTER RADAR RADIO RAILS RAINS RAISE RANGE RATES RATIO REACT READS REALM
REEDS REINS RENTS RESIN RIDES RINSE RISEN RIVER ROADS ROAST ROOST ROSES ROTOR
ROUSE ROUTE ROVER SANER SATES SATIN SEDAN SEDER SENOR SETAE SIREN SNARE SNORE
SOARS SOLAR SONAR SORES SPEAR STAIR STARE STEED STONE STORE TASTE TEASE TENOR
TENSE TENTS TERSE TIDES TIRES TONER TONES TORSO TRACE TRADE TREAD TREAT TREES
TREND TRIAD TRIED TRITE TRODE
`.trim().split(/\s+/);

const N = 5;
const rank = new Map();          // sports words rank ahead of common ones
SPORTS.forEach((w) => rank.set(w, 0));
COMMON.forEach((w) => { if (!rank.has(w)) rank.set(w, 1); });
const ALL = [...rank.keys()];

// One pool per length, sports terms ordered first. The solver tries candidates
// in order, so the first valid fill it finds is naturally sports-heavy while the
// full dictionary is still available to resolve tight crossings.
const byLen = {};
for (const w of ALL) (byLen[w.length] ||= []).push(w);
for (const k in byLen) byLen[k].sort((a, b) => rank.get(a) - rank.get(b));
const poolFor = (s) => byLen[s.len] || [];

let TEMPLATE;
function buildSlots() {
  const slots = [];
  for (let r = 0; r < N; r++) {
    let c = 0;
    while (c < N) {
      if (TEMPLATE[r][c] === 1) { c++; continue; }
      const s = c; while (c < N && TEMPLATE[r][c] === 0) c++;
      if (c - s >= 2) slots.push({ dir: "A", r, c: s, len: c - s });
    }
  }
  for (let c = 0; c < N; c++) {
    let r = 0;
    while (r < N) {
      if (TEMPLATE[r][c] === 1) { r++; continue; }
      const s = r; while (r < N && TEMPLATE[r][c] === 0) r++;
      if (r - s >= 2) slots.push({ dir: "D", r: s, c, len: r - s });
    }
  }
  return slots;
}
const cellsOf = (s) => {
  const o = [];
  for (let i = 0; i < s.len; i++) o.push(s.dir === "A" ? [s.r, s.c + i] : [s.r + i, s.c]);
  return o;
};

// Backtracking with MRV slot selection (fill the unassigned slot with the fewest
// candidates; a zero-candidate slot fails the branch immediately — built-in forward
// checking). Instead of stopping at the first fill, it enumerates up to CAP valid
// fills (candidates tried sports-first) and keeps the one with the most sports
// entries — so the demo grid reads like a sports puzzle, not incidental fill.
const CAP = 20000;
function solve() {
  const slots = buildSlots();
  const grid = Array.from({ length: N }, () => Array(N).fill(null));
  const used = new Set();
  const isSport = (s) => rank.get(cellsOf(s).map(([r, c]) => grid[r][c]).join("")) === 0;
  const filled = (s) => cellsOf(s).every(([r, c]) => grid[r][c]);
  const matches = (s) =>
    poolFor(s).filter(
      (w) => !used.has(w) && cellsOf(s).every(([r, c], i) => !grid[r][c] || grid[r][c] === w[i])
    );

  let seen = 0, bestScore = -1, bestGrid = null;
  function record() {
    const score = slots.reduce((n, s) => n + (isSport(s) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; bestGrid = grid.map((row) => row.slice()); }
  }
  function recurse() {
    if (seen >= CAP) return;
    let best = null, bestCands = null;
    for (const s of slots) {
      if (filled(s)) continue;
      const cs = matches(s);
      if (cs.length === 0) return;                        // dead end
      if (!best || cs.length < bestCands.length) { best = s; bestCands = cs; }
    }
    if (!best) { seen++; record(); return; }              // complete fill
    const cells = cellsOf(best);
    for (const w of bestCands) {
      const before = cells.map(([r, c]) => grid[r][c]);
      cells.forEach(([r, c], i) => (grid[r][c] = w[i]));
      used.add(w);
      recurse();
      used.delete(w);
      cells.forEach(([r, c], i) => (grid[r][c] = before[i]));
      if (seen >= CAP) return;
    }
  }
  recurse();
  return bestGrid ? { grid: bestGrid, slots, score: bestScore, seen } : null;
}

let res = null;
for (const t of TEMPLATES) {
  TEMPLATE = t;
  const r = solve();
  if (r && (!res || r.score > res.score)) { res = r; res.template = t; }
}
if (!res) { console.error("No fill found — widen the dictionary or templates."); process.exit(1); }
TEMPLATE = res.template;
const { grid, slots } = res;
console.log(`(best of templates — ${res.score} sports entries)`);

let num = 0;
const numAt = {};
for (let r = 0; r < N; r++)
  for (let c = 0; c < N; c++) {
    if (TEMPLATE[r][c] === 1) continue;
    const startsA = (c === 0 || TEMPLATE[r][c - 1] === 1) && c + 1 < N && TEMPLATE[r][c + 1] === 0;
    const startsD = (r === 0 || TEMPLATE[r - 1][c] === 1) && r + 1 < N && TEMPLATE[r + 1][c] === 0;
    if (startsA || startsD) numAt[`${r},${c}`] = ++num;
  }

console.log("\nFilled grid:");
console.log(grid.map((row, r) => row.map((ch, c) => (TEMPLATE[r][c] ? "#" : ch)).join(" ")).join("\n"));

const entries = slots
  .slice()
  .sort((a, b) => (numAt[`${a.r},${a.c}`] - numAt[`${b.r},${b.c}`]) || (a.dir < b.dir ? -1 : 1))
  .map((s) => ({
    num: numAt[`${s.r},${s.c}`], dir: s.dir, r: s.r, c: s.c, len: s.len,
    answer: cellsOf(s).map(([r, c]) => grid[r][c]).join(""),
    sport: rank.get(cellsOf(s).map(([r, c]) => grid[r][c]).join("")) === 0,
  }));

console.log("\nEntries (★ = sports term):");
for (const e of entries) console.log(`${e.num}${e.dir}  len${e.len}  ${e.answer} ${e.sport ? "★" : ""}`);

console.log("\nJSON:");
console.log(JSON.stringify({
  size: N,
  black: [].concat(...TEMPLATE.map((row, r) => row.map((v, c) => (v ? [r, c] : null)).filter(Boolean))),
  solution: grid.map((row, r) => row.map((ch, c) => (TEMPLATE[r][c] ? null : ch)).join("")),
  entries: entries.map(({ num, dir, r, c, len, answer }) => ({ num, dir, r, c, len, answer })),
}));
