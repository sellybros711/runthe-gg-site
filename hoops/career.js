/* Run The Floor: Career, one NBA life from draft night to the Hall of Fame.
 *
 * Headless and dependency-free apart from engine.js, so every rule in here can
 * be driven from node. Browser: window.RTF_CAREER. Node: require.
 *
 * THE PLAYER IS INVENTED AND THE LEAGUE IS REAL. Thirty real clubs, their real
 * colours, and year one's real rosters as a fact about who you join. Nothing
 * in here writes a storyline about a real person: every rival, mentor, coach
 * and teammate an event talks about is a role ("your starting center"), never
 * a name. That is the wrestling game's rule arriving at a sport with real
 * people in it, and it is the line to hold when adding events.
 *
 * NOT A SECOND MODEL OF A ROSTER. The draft modes rate five real men through
 * the engine's pipeline; this file rates ONE invented man and a club's net
 * rating around him. Year one's club nets come off the real roster through
 * teamStrength, so the 2026-27 Thunder are as good as the data says, and every
 * year after drifts by a mean-reverting walk, because projecting a real
 * person's future is the line above.
 *
 * DETERMINISTIC PER STEP. Every draw is seeded off (seed, year, tag), so a
 * reload lands on the same card with the same outcomes behind it, and a career
 * replayed with the same choices is the same career. Nothing reads the clock.
 *
 * THE SHAPE OF A YEAR, which is the step machine's phases:
 *
 *   pre    the summer: a training card and something off the court
 *   early  games 1 to 27, then a card or two
 *   mid    games 28 to 55, the All-Star break and the trade deadline
 *   late   games 56 to 82, then the awards
 *   po     the playoffs, a round a step, and Game 7 is yours to take
 *   off    development, contracts, free agency, and the question of retiring
 *
 * A step never runs while a card is pending. `step()` moves one phase and
 * returns the beats it produced; `choose()` answers the card on top.
 */
'use strict';
(function() {

const E = (typeof require !== 'undefined')
  ? require('./engine.js')
  : window.RTF_ENGINE;

const CAREER_API_VERSION = 1;
const LIFE_VERSION = 1;

// ─── the league ─────────────────────────────────────────────────────────────

const CONF = {
  East: ['ATL', 'BOS', 'BRK', 'CHI', 'CHO', 'CLE', 'DET', 'IND', 'MIA', 'MIL',
    'NYK', 'ORL', 'PHI', 'TOR', 'WAS'],
  West: ['DAL', 'DEN', 'GSW', 'HOU', 'LAC', 'LAL', 'MEM', 'MIN', 'NOP', 'OKC',
    'PHO', 'POR', 'SAC', 'SAS', 'UTA'],
};
const CLUBS = CONF.East.concat(CONF.West);
const confOf = (c) => CONF.East.indexOf(c) >= 0 ? 'East' : 'West';
/* Where a shoe company wants you to live. A market multiplies endorsements and
   nothing else: it is not a better place to play basketball. */
const BIG_MARKET = { NYK: 1, LAL: 1, LAC: 1, GSW: 1, CHI: 1, BRK: 1, MIA: 1, BOS: 1 };

const GAMES = 82;
const CHUNKS = { early: [1, 27], mid: [28, 55], late: [56, 82] };
const ROUNDS = ['First Round', 'Conference Semifinals', 'Conference Finals', 'NBA Finals'];
const ROUND_SHORT = ['R1', 'R2', 'CF', 'Finals'];

/* The salary cap, in millions, for the season ending in a year. 2027 is the
   first season a career plays and the cap grows four percent a year after,
   which is the league's own average over the last decade. */
const CAP_2027 = 165;
const capFor = (year) => CAP_2027 * Math.pow(1.04, Math.max(0, year - 2027));
const MIN_PCT = 0.0085;

// ─── the player ─────────────────────────────────────────────────────────────

const POS = ['PG', 'SG', 'SF', 'PF', 'C'];
const POS_NAME = { PG: 'Point guard', SG: 'Shooting guard', SF: 'Small forward', PF: 'Power forward', C: 'Center' };
const RATINGS = ['sho', 'fin', 'pla', 'def', 'reb', 'ath', 'iq'];
const RATING_NAME = { sho: 'Shooting', fin: 'Finishing', pla: 'Playmaking', def: 'Defense',
  reb: 'Rebounding', ath: 'Athleticism', iq: 'Basketball IQ' };
const RATING_SHORT = { sho: 'SHO', fin: 'FIN', pla: 'PLAY', def: 'DEF', reb: 'REB', ath: 'ATH', iq: 'IQ' };

/* What a position is asked to do. Each row sums to one, so adding a point to
   every rating adds a point to the overall, which is what lets growth be
   spread evenly and still read as the number a player was promised. */
const WEIGHTS = {
  PG: { sho: 0.22, fin: 0.12, pla: 0.30, def: 0.12, reb: 0.04, ath: 0.10, iq: 0.10 },
  SG: { sho: 0.30, fin: 0.16, pla: 0.14, def: 0.14, reb: 0.04, ath: 0.12, iq: 0.10 },
  SF: { sho: 0.20, fin: 0.18, pla: 0.10, def: 0.18, reb: 0.10, ath: 0.14, iq: 0.10 },
  PF: { sho: 0.12, fin: 0.20, pla: 0.06, def: 0.20, reb: 0.20, ath: 0.12, iq: 0.10 },
  C: { sho: 0.06, fin: 0.22, pla: 0.04, def: 0.24, reb: 0.26, ath: 0.10, iq: 0.08 },
};
/* Where a position starts, around the background's base. */
const POS_PROFILE = {
  PG: { sho: 4, fin: -2, pla: 9, def: -1, reb: -12, ath: 2, iq: 2 },
  SG: { sho: 8, fin: 1, pla: 2, def: 0, reb: -10, ath: 2, iq: 0 },
  SF: { sho: 2, fin: 2, pla: -2, def: 2, reb: -3, ath: 3, iq: 0 },
  PF: { sho: -4, fin: 3, pla: -7, def: 3, reb: 7, ath: 0, iq: 0 },
  C: { sho: -10, fin: 4, pla: -11, def: 5, reb: 11, ath: -3, iq: -1 },
};

const ARCHES = {
  scorer: { name: 'Shot creator', blurb: 'Gets a bucket from anywhere.',
    tilt: { sho: 7, fin: 4, pla: -1, def: -5 }, usage: 0.03, three: 0.05 },
  floor: { name: 'Floor general', blurb: 'Sees the play before it happens.',
    tilt: { pla: 9, iq: 5, def: -2, reb: -4 }, usage: -0.01, three: 0.0 },
  twoway: { name: 'Two-way wing', blurb: 'Guards the best player. Hits the open three.',
    tilt: { def: 8, ath: 3, sho: 1, pla: -3 }, usage: -0.01, three: 0.04 },
  slasher: { name: 'Slasher', blurb: 'Lives at the rim. Lives at the line.',
    tilt: { fin: 8, ath: 6, sho: -5 }, usage: 0.01, three: -0.08 },
  stretch: { name: 'Stretch big', blurb: 'Pulls the center out to the arc.',
    tilt: { sho: 8, reb: 2, def: -2, ath: -2 }, usage: 0.0, three: 0.14 },
  anchor: { name: 'Rim protector', blurb: 'Nothing easy at the rim. Ever.',
    tilt: { def: 10, reb: 6, sho: -8, pla: -4 }, usage: -0.04, three: -0.12 },
};
const ARCH_KEYS = Object.keys(ARCHES);

/* How you got to draft night. This is where high school and college live in a
   career that starts in June: they decide your age, your polish and how high
   your ceiling is, and a later pass can play them out. */
const BACKGROUNDS = {
  oad: { name: 'One and done', blurb: 'One year at a blue blood. Raw, and the ceiling is the roof.',
    age: 19, base: 56, pot: [72, 97], fame: 34, tilt: { ath: 3 } },
  senior: { name: 'Four-year star', blurb: 'Conference Player of the Year. Polished. Ready now.',
    age: 22, base: 61, pot: [68, 88], fame: 24, tilt: { iq: 6, sho: 2 } },
  intl: { name: 'Overseas pro', blurb: 'Three seasons against grown men in Europe.',
    age: 20, base: 57, pot: [70, 95], fame: 12, tilt: { iq: 4, pla: 2 } },
  gl: { name: 'G League route', blurb: 'Skipped college. Got paid. Learned fast.',
    age: 19, base: 55, pot: [70, 96], fame: 26, tilt: { ath: 5, fin: 2 } },
};
const BG_KEYS = Object.keys(BACKGROUNDS);

const AGENTS = {
  power: { name: 'A power agency', blurb: 'Gets the biggest number. Takes four percent.',
    sal: 1.08, fee: 0.04, endorse: 1.25 },
  boutique: { name: 'A boutique agent', blurb: 'Knows your family. Takes three percent.',
    sal: 1.0, fee: 0.03, endorse: 1.0 },
  cousin: { name: 'Your cousin', blurb: 'Free. Has never done this before.',
    sal: 0.92, fee: 0, endorse: 0.8 },
};

const FIRST = ['Malik', 'Darius', 'Jalen', 'Marcus', 'Tyrese', 'Andre', 'Isaiah', 'Caleb',
  'Devin', 'Jordan', 'Cameron', 'Elijah', 'Trey', 'Xavier', 'Miles', 'Quentin', 'Rashad',
  'Dante', 'Luka', 'Mateo', 'Nikola', 'Theo', 'Amari', 'Kendrick', 'Omari', 'Silas'];
const LAST = ['Brooks', 'Whitfield', 'Okafor', 'Merritt', 'Calloway', 'Dunmore', 'Vance',
  'Ellison', 'Hargrove', 'Sutton', 'Rowe', 'Thibodeaux', 'Kessler', 'Abernathy', 'Langford',
  'Pruitt', 'Castellanos', 'Odum', 'Fairbanks', 'Greer', 'Montrose', 'Sallis', 'Wynn', 'Ashby'];

// ─── small things ───────────────────────────────────────────────────────────

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round1 = (v) => Math.round(v * 10) / 10;
const rngAt = (L, tag) => E.createSeededRNG(E.hashSeed(String(L.seed) + ':' + L.year + ':' + tag));
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const norm = (rng) => E.normal(rng);
/* The standard normal CDF, for the draft's board. */
function phi(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}
function weighted(rng, items, w) {
  let tot = 0;
  const ws = items.map((it) => { const x = Math.max(0, w(it)); tot += x; return x; });
  if (tot <= 0) return null;
  let r = rng() * tot;
  for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
}
const nick = (c) => (E.TEAM_NAMES && E.TEAM_NAMES[c]) || c;
const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
const money = (m) => !m ? '$0' : m >= 1 ? '$' + (Math.round(m * 10) / 10).toFixed(m >= 10 ? 0 : 1) + 'M'
  : '$' + Math.round(m * 1000) + 'K';

function overall(rt, pos) {
  const w = WEIGHTS[pos] || WEIGHTS.SF;
  let s = 0;
  for (const k of RATINGS) s += (rt[k] || 0) * w[k];
  return Math.round(s);
}
const ovrOf = (L) => overall(L.rt, L.pos);
const age = (L) => L.age;

/* Every change goes through here, so a card's outcome can be read back as a
   list of what moved. Ratings stay 25 to 99, meters 0 to 100. */
const METERS = ['health', 'morale', 'fame', 'trust'];
function bump(L, d) {
  for (const k in d) {
    const v = d[k];
    if (!v) continue;
    if (RATINGS.indexOf(k) >= 0) L.rt[k] = clamp(Math.round(L.rt[k] + v), 25, 99);
    else if (METERS.indexOf(k) >= 0) L.m[k] = clamp(Math.round(L.m[k] + v), 0, 100);
    else if (k === 'cash') L.cash = round1(L.cash + v);
    else if (k === 'eth') L.eth = clamp(L.eth + v, 0, 100);
    else if (k === 'dur') L.dur = clamp(L.dur + v, 0, 100);
    else if (k === 'pot') L.pot = clamp(L.pot + v, 40, 99);
    else if (L.season && L.season.mods && k in L.season.mods) L.season.mods[k] += v;
  }
}
/* What a card moved, for the screen. */
function snapshot(L) {
  return { rt: Object.assign({}, L.rt), m: Object.assign({}, L.m), cash: L.cash, ovr: ovrOf(L) };
}
function diffOf(a, b) {
  const out = [];
  for (const k of RATINGS) if (b.rt[k] !== a.rt[k]) out.push({ k, label: RATING_NAME[k], d: b.rt[k] - a.rt[k] });
  for (const k of METERS) if (b.m[k] !== a.m[k]) out.push({ k, label: k[0].toUpperCase() + k.slice(1), d: b.m[k] - a.m[k] });
  if (Math.abs(b.cash - a.cash) >= 0.05) out.push({ k: 'cash', label: 'Cash', d: round1(b.cash - a.cash), money: true });
  return out;
}

function logIt(L, text, tone) {
  L.log.push({ y: L.year, t: text, tone: tone || '' });
  if (L.log.length > 400) L.log.splice(0, L.log.length - 400);
}

// ─── the league's clubs ─────────────────────────────────────────────────────

/* Year one's club strength off the real rosters, then scaled to the league's
   real spread. `rows` is the data's player-seasons; only the newest season is
   read. A club with nobody in it reads as average rather than as nothing. */
function seedLeague(rows) {
  let latest = 0;
  for (const r of rows || []) if (r.s > latest) latest = r.s;
  const by = {};
  for (const r of rows || []) if (r.s === latest && CLUBS.indexOf(r.t) >= 0) (by[r.t] = by[r.t] || []).push(r);
  const net = {}, stars = {};
  for (const c of CLUBS) {
    const list = by[c] || [];
    if (list.length >= 5 && E.teamStrength) {
      const st = E.teamStrength(list);
      net[c] = st.ortg - st.drtg;
    } else net[c] = 0;
    stars[c] = list.slice().sort((a, b) => b.w - a.w).slice(0, 3).map((r) => r.n);
  }
  return { latest: latest || 2026, net: normaliseNets(net), stars };
}
/* Mean zero, a spread of 4.6 points, which is roughly the real league's. */
function normaliseNets(net) {
  const vals = CLUBS.map((c) => net[c] || 0);
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) * (v - mean), 0) / vals.length) || 1;
  const out = {};
  for (const c of CLUBS) out[c] = round1(((net[c] || 0) - mean) / sd * 4.6);
  return out;
}
/* A new season: every club regresses toward the middle and moves a little. */
function driftLeague(L) {
  const rng = rngAt(L, 'drift');
  const net = {};
  for (const c of CLUBS) net[c] = (L.league.net[c] || 0) * 0.62 + norm(rng) * 3.6;
  L.league.net = normaliseNets(net);
}
const clubNet = (L, c) => L.league.net[c] || 0;
function clubTier(net) {
  if (net >= 4) return 'Contender';
  if (net >= 0.5) return 'Playoff team';
  if (net >= -3) return 'In the middle';
  return 'Rebuilding';
}

/* What it takes to start for a club. A good club's rotation is better, so the
   bar to get on the floor there is higher. */
const rotationBar = (net) => 67 + net * 0.45;

// ─── a new life ─────────────────────────────────────────────────────────────

function randomName(seed) {
  const rng = E.createSeededRNG(E.hashSeed('name:' + seed));
  return pick(rng, FIRST) + ' ' + pick(rng, LAST);
}

function newLife(opts) {
  const o = opts || {};
  const seed = o.seed != null ? String(o.seed) : String(Math.floor(Math.random() * 1e9));
  const pos = POS.indexOf(o.pos) >= 0 ? o.pos : 'SF';
  const arch = ARCHES[o.arch] ? o.arch : 'twoway';
  const bgKey = BACKGROUNDS[o.bg] ? o.bg : 'oad';
  const bg = BACKGROUNDS[bgKey];
  /* `start: 'hs'` begins as a fifteen year old sophomore. Anything else is
     draft night, with the background standing in for the road. */
  const road = o.start === 'hs';
  const league = o.league || { latest: 2026, net: normaliseNets({}), stars: {} };
  const L = {
    v: LIFE_VERSION, seed,
    name: String(o.name || randomName(seed)).replace(/\s+/g, ' ').trim().slice(0, 28) || randomName(seed),
    pos, arch, bg: bgKey, agent: 'boutique',
    num: Number.isFinite(+o.num) ? clamp(Math.round(+o.num), 0, 99) : null,
    age: road ? AGE_HS : bg.age, year: (league.latest || 2026) + 1,
    rt: {}, pot: 80, eth: 60, dur: 60,
    m: { health: 92, morale: 70, fame: road ? 6 : bg.fame, trust: 50 },
    stage: road ? 'hs' : 'nba', am: null, amHist: [],
    cash: 0.2, earned: 0, endorse: 0,
    team: null, contract: null, draft: null,
    phase: 'combine', pending: [], log: [], history: [], flags: {},
    league: { latest: league.latest || 2026, net: Object.assign({}, league.net), stars: league.stars || {} },
    season: null, seasonsDone: 0, retired: false, final: null, steps: 0,
  };
  L.year = L.league.latest + 1;
  const rng = E.createSeededRNG(E.hashSeed(seed + ':create'));
  if (L.num == null) L.num = Math.floor(rng() * 100);
  const prof = POS_PROFILE[pos], tilt = ARCHES[arch].tilt, bt = road ? {} : (bg.tilt || {});
  const base = road ? ROAD_BASE : bg.base;
  for (const k of RATINGS) {
    L.rt[k] = clamp(Math.round(base + (prof[k] || 0) + (tilt[k] || 0) + (bt[k] || 0) + norm(rng) * 3), road ? 25 : 30, 88);
  }
  /* Skewed low: most ceilings are a starter's, and a few are the roof. */
  L.pot = road ? Math.round(ROAD_POT[0] + Math.pow(rng(), ROAD_POT[2]) * (ROAD_POT[1] - ROAD_POT[0]))
    : Math.round(bg.pot[0] + Math.pow(rng(), 1.7) * (bg.pot[1] - bg.pot[0]));
  L.eth = Math.round(45 + rng() * 40);
  L.dur = Math.round(45 + rng() * 45);
  if (road) {
    L.cash = 0;
    newRoad(L, rng);
    logIt(L, L.name + ', ' + POS_NAME[pos].toLowerCase() + '. A sophomore at ' + L.am.hs.name + '. Age ' + L.age + '.', 'gold');
    queueEvents(L, 'hs_sum', rngAt(L, 'n:sum')() < 0.5 ? 1 : 0, AM_EVENTS);
    return L;
  }
  logIt(L, L.name + ', ' + POS_NAME[pos].toLowerCase() + '. ' + bg.name + '. Age ' + L.age + '.', 'gold');
  L.pending.push(combineCard(L));
  return L;
}

// ─── draft night ────────────────────────────────────────────────────────────

/* Where the board has you, before anything you do this week. */
function draftStock(L) {
  const fx = L.flags.stock || 0;
  /* Scouts draft the ceiling, so a year older is a little less to dream on. */
  return ovrOf(L) * 0.75 + L.pot * 0.45 + L.m.fame * 0.06 + fx - (L.age - 20) * 1.2;
}
function projectedPick(L, extra) {
  const s = draftStock(L) + (extra || 0);
  const p = Math.round(60 / (1 + Math.exp((s - 83.5) / 2.4))) + 1;
  return clamp(p, 1, 61);
}
/* The order is the worst club first, with the top four shuffled among the
   bottom fourteen the way a lottery shuffles them. */
function draftOrder(L) {
  const asc = CLUBS.slice().sort((a, b) => clubNet(L, a) - clubNet(L, b));
  const rng = rngAt(L, 'lottery');
  const lot = asc.slice(0, 14);
  const top = [];
  for (let i = 0; i < 4; i++) {
    const w = lot.map((c, j) => (14 - j) * (14 - j));
    const c = weighted(rng, lot, (x) => w[lot.indexOf(x)]);
    top.push(c);
    lot.splice(lot.indexOf(c), 1);
  }
  const first = top.concat(lot, asc.slice(14));
  return first.concat(first);
}

function combineCard(L) {
  return {
    id: 'combine', kind: 'event', key: 'combine',
    eyebrow: 'Draft combine', title: 'The scouts are in the gym.',
    text: 'Every team is here. What do you show them?',
    options: [
      { label: 'Do everything', hint: 'Test, shoot and scrimmage. Risky if you are not ready.' },
      { label: 'Shoot only', hint: 'Show the one thing you do best.' },
      { label: 'Skip it', hint: 'Let the tape speak. Nobody learns anything new.' },
    ],
  };
}
function workoutCard(L) {
  const order = draftOrder(L);
  const proj = projectedPick(L);
  const slot = (p) => order[clamp(p, 1, 60) - 1];
  const slots = [Math.max(1, proj - 9), Math.max(1, proj - 1), Math.min(60, proj + 7)];
  const seen = {};
  const picks = slots.map((p) => ({ club: slot(p), slot: p })).filter((x) => !seen[x.club] && (seen[x.club] = 1));
  const clubs = picks.map((x) => x.club);
  return {
    id: 'workout', kind: 'event', key: 'workout',
    eyebrow: 'Private workouts', title: 'Three teams want you in.',
    text: 'You have time for one. The board has you going around ' + ordinal(proj) + '.',
    ctx: { clubs, proj },
    options: picks.map((x) => ({ label: 'The ' + nick(x.club),
      hint: 'They pick ' + ordinal(x.slot) + '. ' + clubTier(clubNet(L, x.club)) + '.', club: x.club, slot: x.slot })),
  };
}
function agentCard() {
  return {
    id: 'agent', kind: 'event', key: 'agent',
    eyebrow: 'Representation', title: 'Who negotiates for you?',
    text: 'Pick once. They do every deal you sign.',
    options: Object.keys(AGENTS).map((k) => ({ label: AGENTS[k].name, hint: AGENTS[k].blurb, agent: k })),
  };
}
/* A rookie deal, off the slot. Pick 1 is about seven percent of the cap and the
   scale falls to about one and a half by pick 30. Second rounders and the
   undrafted sign for the minimum. */
function rookieSalary(L, p) {
  const cap = capFor(L.year);
  if (p > 30) return round1(cap * MIN_PCT);
  return round1(cap * (0.072 * Math.pow(0.948, p - 1)));
}

function runDraft(L, beats) {
  const order = draftOrder(L);
  const rng = rngAt(L, 'draftnight');
  let p = projectedPick(L, norm(rng) * 2.2);
  const promised = L.flags.promise;
  let team = null;
  if (promised && promised.slot <= p + 6) { team = promised.club; p = promised.slot; }
  if (!team) {
    if (p > 60) team = null;
    else team = order[p - 1];
  }
  if (!team) {
    /* Undrafted: three clubs offer a two-way deal and you choose. */
    const pool = CLUBS.slice().sort((a, b) => clubNet(L, a) - clubNet(L, b));
    const three = [pool[2 + Math.floor(rng() * 6)], pool[11 + Math.floor(rng() * 6)], pool[20 + Math.floor(rng() * 6)]];
    L.draft = { pick: null, round: null, team: null };
    beats.push({ kind: 'draft', text: 'Sixty names. Not yours.', tone: 'bad' });
    logIt(L, 'Went undrafted.', 'bad');
    L.pending.push({
      id: 'undrafted', kind: 'event', key: 'undrafted', eyebrow: 'After the draft',
      title: 'Your phone is ringing.',
      text: 'Three clubs offer a two-way deal. Pick one.',
      options: three.map((c) => ({ label: 'The ' + nick(c), hint: clubTier(clubNet(L, c)) + '.', club: c })),
    });
    return;
  }
  const round = p > 30 ? 2 : 1;
  L.draft = { pick: p, round, team };
  const sal = rookieSalary(L, p);
  L.contract = { years: round === 1 ? 4 : 2, total: round === 1 ? 4 : 2, salary: sal, kind: round === 1 ? 'rookie' : 'min', start: L.year };
  joinTeam(L, team, false);
  const line = 'With the ' + ordinal(p) + ' pick, the ' + E.teamName(team) + ' select ' + L.name + '.';
  beats.push({ kind: 'draft', text: line, tone: p <= 5 ? 'gold' : 'good', pick: p, team });
  logIt(L, line, p <= 5 ? 'gold' : 'good');
  if (p === 1) bump(L, { fame: 18 });
  else if (p <= 5) bump(L, { fame: 10 });
  else if (p <= 14) bump(L, { fame: 5 });
  L.phase = 'drafted';
  openYear(L);
}

function joinTeam(L, c, trade) {
  const from = L.team;
  L.team = c;
  L.m.trust = 50;
  if (trade) L.flags.moved = (L.flags.moved || 0) + 1;
  const stars = L.year === L.league.latest + 1 ? (L.league.stars[c] || []) : [];
  const mates = stars.length ? ' You join ' + listNames(stars) + '.' : '';
  if (from && from !== c) logIt(L, (trade ? 'Traded to the ' : 'Signed with the ') + E.teamName(c) + '.' + mates, 'gold');
  else if (!from && mates) logIt(L, mates.trim(), '');
}
function listNames(a) {
  if (a.length <= 1) return a.join('');
  return a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
}

// ─── a season ───────────────────────────────────────────────────────────────

function newSeason(L) {
  L.season = {
    year: L.year, team: L.team, g: 0, w: 0, l: 0, gp: 0,
    tot: { min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fga: 0, fgm: 0, tpa: 0, tpm: 0, fta: 0, ftm: 0 },
    hi: { pts: 0, reb: 0, ast: 0 },
    out: 0, injury: null,
    mods: { min: 0, usage: 0, perf: 0, win: 0, risk: 0, rest: 0 },
    used: {}, acts: {}, allstar: false, awards: [], po: null, notes: [], role: null,
    startOvr: ovrOf(L), startTeam: L.team, asked: {},
  };
}

/* The overall you play at this season: the real number, plus how you feel. */
function effOvr(L) {
  const s = L.season;
  return ovrOf(L) + (L.m.morale - 55) * 0.04 + (s ? s.mods.perf : 0) - Math.max(0, 45 - L.m.health) * 0.08;
}
function roleOf(L) {
  const net = clubNet(L, L.team);
  const diff = effOvr(L) - rotationBar(net);
  let min = diff >= 14 ? 35.5 : diff >= 7 ? 32.5 : diff >= 0 ? 27.5 : diff >= -5 ? 20 : diff >= -10 ? 13 : 7;
  min += (L.m.trust - 50) * 0.05 + (L.season ? L.season.mods.min : 0);
  if (L.contract && L.contract.kind === 'rookie' && L.draft && L.draft.pick <= 5 && net < 0) min += 3;
  min = clamp(min, 2, 38.5);
  const label = (diff >= 12 && min >= 33) ? 'Franchise player' : min >= 30 ? 'Starter' : min >= 24 ? 'Starter' : min >= 15 ? 'Rotation' : 'End of bench';
  return { min: round1(min), diff, label, starter: min >= 24 };
}
function usageOf(L, role) {
  const a = ARCHES[L.arch];
  const u = 0.13 + 0.17 * clamp(role.diff / 22 + 0.35, 0, 1.25) + a.usage + (L.season ? L.season.mods.usage : 0);
  return clamp(u, 0.08, 0.37);
}
/* The man's per-game means at these minutes. */
function lineMeans(L, min, usage) {
  const r = L.rt, a = ARCHES[L.arch];
  const scoring = r.sho * 0.55 + r.fin * 0.45;
  const ts = clamp(0.47 + (scoring - 55) * 0.0032 + (r.iq - 60) * 0.0005, 0.44, 0.67);
  const tsa = min / 48 * 99 * usage * 0.86;
  const pts = 2 * ts * tsa;
  const fta = tsa * 0.26, fga = tsa - 0.44 * fta;
  const threeShare = clamp(0.15 + (r.sho - 55) * 0.008 + a.three, 0.02, 0.62);
  const tpa = fga * threeShare;
  const tpp = clamp(0.28 + (r.sho - 55) * 0.0032, 0.22, 0.44);
  const ftp = clamp(0.62 + (r.sho - 50) * 0.005, 0.5, 0.92);
  const posReb = { PG: 4, SG: 4.6, SF: 6, PF: 7.6, C: 8.6 }[L.pos];
  const reb = Math.max(posReb * 0.55, posReb + (r.reb - 50) * 0.14) * min / 36;
  const ast = Math.max(0.3, (0.8 + (r.pla - 45) * 0.16) * (0.7 + usage) * min / 36);
  const stl = Math.max(0.1, (0.5 + (r.def - 55) * 0.02 + (r.ath - 55) * 0.008) * min / 36);
  const big = { PG: 0.2, SG: 0.25, SF: 0.45, PF: 0.8, C: 1.2 }[L.pos] + (L.arch === 'anchor' ? 0.6 : 0);
  const blk = Math.max(0.05, (big + (r.def - 55) * 0.02 * big) * min / 36);
  return { pts, fga, tpa, tpp, fta, ftp, reb, ast, stl, blk, ts };
}
/* What you add to the club when you play: points per hundred possessions. */
function impact(L, min) {
  return (effOvr(L) - 68) * 0.32 * (min / 48);
}
/* A game's odds off a net rating. Clamped short of certainty, because the
   best real team ever lost nine and a career sim that hands out 81-1 has
   stopped describing basketball. */
const gameP = (net, home) => clamp(0.5 + net * 0.03 + (home ? 0.03 : -0.03), 0.1, 0.84);

function rollInjury(L, chunk, beats) {
  const s = L.season;
  if (!s || (s.injury && s.injury.until > CHUNKS[chunk][0])) return;
  const rng = rngAt(L, 'inj:' + chunk);
  const a = L.age;
  const p = 0.065 + (100 - L.dur) * 0.0011 + Math.max(0, a - 28) * 0.009
    + Math.max(0, 60 - L.m.health) * 0.0016 + s.mods.risk;
  if (rng() >= p) return;
  const r = rng();
  const from = CHUNKS[chunk][0] + Math.floor(rng() * 20);
  if (r < 0.62) {
    const g = 2 + Math.floor(rng() * 7);
    s.injury = { from, until: from + g, kind: pick(rng, ['sprained ankle', 'tight hamstring', 'bruised knee', 'sore back', 'jammed finger']) };
    beats.push({ kind: 'injury', text: 'A ' + s.injury.kind + ' costs you ' + g + ' games.', tone: 'bad' });
    logIt(L, 'Missed ' + g + ' games with a ' + s.injury.kind + '.', 'bad');
    bump(L, { health: -6 });
    return;
  }
  const major = r > 0.9;
  const kind = major ? pick(rng, ['torn meniscus', 'broken wrist', 'torn ligament in the foot'])
    : pick(rng, ['high ankle sprain', 'strained calf', 'groin strain']);
  const g = major ? 30 + Math.floor(rng() * 26) : 10 + Math.floor(rng() * 12);
  s.injury = { from, until: from + g, kind, pendingDecision: true };
  L.pending.push({
    id: 'injury', kind: 'event', key: 'injury:' + chunk, eyebrow: 'Injury report',
    title: 'It is a ' + kind + '.',
    text: 'The doctors say ' + g + ' games. You have a say in how.',
    ctx: { g, major },
    options: major ? [
      { label: 'Surgery now', hint: 'Out the full stretch. Come back whole.' },
      { label: 'Rehab and rush back', hint: 'Back sooner. It may not hold.' },
      { label: 'Fly to a specialist', hint: 'Costs money. Better odds either way.' },
    ] : [
      { label: 'Play through it', hint: 'Back in half the time. Risky.' },
      { label: 'Take the full time', hint: 'Rest it right.' },
    ],
  });
}

/* Games from..to. The club plays every one; you play the ones you are healthy
   for. Your line is drawn game by game, so a night of forty is a night of
   forty and the feed can say so. */
function playChunk(L, chunk, beats) {
  const s = L.season;
  const [from, to] = CHUNKS[chunk];
  const rng = rngAt(L, 'games:' + chunk);
  const net0 = clubNet(L, L.team) + s.mods.win;
  const role = roleOf(L);
  s.role = role;
  const usage = usageOf(L, role);
  const mean = lineMeans(L, role.min, usage);
  const opps = CLUBS.filter((c) => c !== L.team);
  for (let g = from; g <= to; g++) {
    const home = g % 2 === 0;
    const hurt = s.injury && g >= s.injury.from && g < s.injury.until;
    const rest = !hurt && s.mods.rest > 0 && rng() < s.mods.rest;
    let net = net0;
    if (!hurt && !rest) {
      const mn = role.min * (0.88 + rng() * 0.24);
      const k = mn / role.min;
      const ptsMean = mean.pts * k;
      const pts = Math.max(0, Math.round(ptsMean + norm(rng) * ptsMean * 0.3));
      const reb = Math.max(0, Math.round(mean.reb * k + norm(rng) * mean.reb * 0.32));
      const ast = Math.max(0, Math.round(mean.ast * k + norm(rng) * mean.ast * 0.34));
      const stl = Math.max(0, Math.round(mean.stl * k + norm(rng) * 0.8));
      const blk = Math.max(0, Math.round(mean.blk * k + norm(rng) * 0.7));
      const tpa = Math.max(0, Math.round(mean.tpa * k + norm(rng) * 1.2));
      const tpm = Math.min(tpa, Math.max(0, Math.round(tpa * mean.tpp + norm(rng) * 0.9)));
      const fta = Math.max(0, Math.round(mean.fta * k + norm(rng) * 1.3));
      const ftm = Math.min(fta, Math.round(fta * mean.ftp));
      let twom = Math.max(0, Math.round((pts - ftm - 3 * tpm) / 2));
      const fga = Math.max(tpa + twom, Math.round(mean.fga * k + norm(rng) * 1.8));
      const T = s.tot;
      T.min += mn; T.pts += ftm + 3 * tpm + 2 * twom; T.reb += reb; T.ast += ast; T.stl += stl; T.blk += blk;
      T.fga += fga; T.fgm += tpm + twom; T.tpa += tpa; T.tpm += tpm; T.fta += fta; T.ftm += ftm;
      const p = ftm + 3 * tpm + 2 * twom;
      s.gp++;
      const opp = opps[(g * 7 + L.year) % opps.length];
      if (p > s.hi.pts) s.hi.pts = p;
      if (reb > s.hi.reb) s.hi.reb = reb;
      if (ast > s.hi.ast) s.hi.ast = ast;
      if (p > (L.flags.careerHigh || 0)) {
        L.flags.careerHigh = p;
        if (p >= 30) beats.push({ kind: 'game', text: 'Career high: ' + p + ' points against the ' + nick(opp) + '.', tone: 'gold' });
      } else if (p >= 45) beats.push({ kind: 'game', text: p + ' points against the ' + nick(opp) + '.', tone: 'gold' });
      if (p >= 10 && reb >= 10 && ast >= 10) {
        L.flags.tripleDoubles = (L.flags.tripleDoubles || 0) + 1;
        beats.push({ kind: 'game', text: 'Triple-double against the ' + nick(opp) + ': ' + p + ', ' + reb + ' and ' + ast + '.', tone: 'good' });
      }
      net = net0 + impact(L, mn);
    } else {
      s.out++;
    }
    s.g = g;
    if (rng() < gameP(net, home)) s.w++; else s.l++;
  }
  bump(L, { health: -Math.round(role.min * 0.1 * ((to - from + 1) / 27)) });
}

function perGame(s) {
  const g = Math.max(1, s.gp), T = s.tot;
  return {
    gp: s.gp, min: round1(T.min / g), pts: round1(T.pts / g), reb: round1(T.reb / g), ast: round1(T.ast / g),
    stl: round1(T.stl / g), blk: round1(T.blk / g),
    fgp: T.fga ? Math.round(T.fgm / T.fga * 1000) / 10 : 0,
    tpp: T.tpa ? Math.round(T.tpm / T.tpa * 1000) / 10 : 0,
    ftp: T.fta ? Math.round(T.ftm / T.fta * 1000) / 10 : 0,
  };
}

// ─── the league table and the awards ────────────────────────────────────────

function standings(L) {
  const s = L.season;
  const rng = rngAt(L, 'table');
  const recs = {};
  for (const c of CLUBS) {
    if (c === L.team) { recs[c] = { w: s.w, l: s.l }; continue; }
    const p = gameP(clubNet(L, c), true) - 0.03;
    let w = 0;
    for (let i = 0; i < GAMES; i++) if (rng() < p) w++;
    recs[c] = { w, l: GAMES - w };
  }
  const table = {};
  for (const cf of ['East', 'West']) {
    table[cf] = CONF[cf].slice().sort((a, b) => (recs[b].w - recs[a].w) || (clubNet(L, b) - clubNet(L, a)));
  }
  return { recs, table };
}

/* Each award is a question about your season against an abstract field. The
   field is not modelled player by player, because the league's real stars are
   real people and their futures are not ours to write. So the bar is a fact
   about how good a season has to be, and the draw is how crowded the year was. */
function awards(L, st) {
  const s = L.season, pg = perGame(s), o = effOvr(L);
  const rng = rngAt(L, 'awards');
  const seed = st.table[confOf(L.team)].indexOf(L.team) + 1;
  const w = s.w, out = [];
  const gpOk = s.gp >= 65;
  const lg = (x) => 1 / (1 + Math.exp(-x));
  const rookie = L.seasonsDone === 0;
  /* THE LEAGUE ALWAYS HAS OTHER MVP CANDIDATES, so even a perfect year is a
     little better than a coin flip. */
  if (gpOk && o >= 91 && seed <= 3) {
    const sc = (o - 93) * 0.6 + (w - 55) * 0.1 + (pg.pts - 27) * 0.15 + (L.m.fame - 70) * 0.02;
    if (rng() < 0.62 * lg(sc - 0.4)) out.push('mvp');
  } else rng();
  if (gpOk) {
    const tier = o + (pg.pts - 22) * 0.12 + norm(rng) * 1.4;
    if (tier >= 93.5) out.push('an1');
    else if (tier >= 91) out.push('an2');
    else if (tier >= 88.5) out.push('an3');
  }
  if (gpOk && L.rt.def >= 90 && pg.min >= 28) {
    const sc = (L.rt.def - 95) * 0.5 + (pg.blk + pg.stl - 2.8) * 0.8;
    if (rng() < 0.6 * lg(sc)) out.push('dpoy');
  } else rng();
  if (gpOk && L.rt.def >= 84 && pg.min >= 26) {
    if (L.rt.def + norm(rng) * 2 >= 93) out.push('ad1');
    else if (L.rt.def + norm(rng) * 2 >= 89) out.push('ad2');
  }
  /* A floor, because the draw alone handed a 5.8 a night rookie the trophy. */
  if (rookie && s.gp >= 50 && pg.pts >= 11) {
    const sc = (pg.pts - 15) * 0.32 + (o - 68) * 0.18;
    if (rng() < lg(sc)) out.push('roy');
  }
  if (!rookie && s.role && !s.role.starter && s.gp >= 60 && pg.pts >= 13) {
    if (rng() < lg((pg.pts - 15) * 0.5)) out.push('6moy');
  }
  const last = L.history[L.history.length - 1];
  if (last && s.gp >= 60 && pg.pts - last.pts >= 5.5 && ovrOf(L) - last.ovr >= 4) {
    if (rng() < 0.55) out.push('mip');
  }
  if (gpOk && pg.pts >= 30.5 && rng() < 0.6 * lg((pg.pts - 32.5) * 0.9)) out.push('scor');
  return out;
}
const AWARD_NAME = {
  mvp: 'MVP', fmvp: 'Finals MVP', roy: 'Rookie of the Year', dpoy: 'Defensive Player of the Year',
  '6moy': 'Sixth Man of the Year', mip: 'Most Improved Player', an1: 'All-NBA First Team',
  an2: 'All-NBA Second Team', an3: 'All-NBA Third Team', ad1: 'All-Defensive First Team',
  ad2: 'All-Defensive Second Team', star: 'All-Star', scor: 'Scoring title', champ: 'NBA champion',
  olympic: 'Olympic gold',
  hs_allstate: 'All-State', hs_mrbb: 'Mr. Basketball', hs_aag: 'All-American Game', hs_state: 'State champion',
  c_allconf: 'All-Conference', c_cpoy: 'Conference Player of the Year', c_fr: 'National Freshman of the Year',
  c_aa1: 'First Team All-American', c_aa2: 'Second Team All-American', c_npoy: 'National Player of the Year',
  c_mop: 'Most Outstanding Player', c_f4: 'Final Four', c_champ: 'National champion',
};

function allStarCheck(L, beats) {
  const s = L.season, pg = perGame(s);
  if (s.gp < 25) return;
  const rng = rngAt(L, 'allstar');
  const st = effOvr(L) + L.m.fame * 0.07 + (pg.pts - 18) * 0.35 + (s.w - s.l) * 0.05 + norm(rng) * 1.5;
  if (st < 88.5) return;
  s.allstar = true;
  const n = (L.flags.allstars || 0) + 1;
  L.flags.allstars = n;
  bump(L, { fame: 6, morale: 5 });
  const line = n === 1 ? 'You are an All-Star.' : ordinal(n) + ' All-Star selection.';
  beats.push({ kind: 'award', text: line, tone: 'gold' });
  logIt(L, line, 'gold');
  L.pending.push({
    id: 'allstar', kind: 'event', key: 'allstar', eyebrow: 'All-Star Weekend', title: 'They want you Saturday night too.',
    text: 'One event, or none. Your call.',
    options: [
      { label: 'Dunk contest', hint: 'Athleticism ' + L.rt.ath + '.' },
      { label: 'Three-point contest', hint: 'Shooting ' + L.rt.sho + '.' },
      { label: 'Rest your legs', hint: 'Sunday is enough.' },
    ],
  });
}

// ─── the playoffs ───────────────────────────────────────────────────────────

/* The bracket around you. The other series are simulated off club nets and
   exist so the round you are in is against the club that really came through. */
function startPlayoffs(L, st) {
  const s = L.season;
  const cf = confOf(L.team);
  const seed = st.table[cf].indexOf(L.team) + 1;
  s.seed = seed;
  s.recs = st.recs;
  s.table = st.table;
  if (seed > 10) { s.po = { out: true, path: 'Missed', results: [] }; return; }
  s.po = { cf, seed, round: seed > 6 ? -1 : 0, results: [], field: {}, out: false, champ: false };
}
function seriesP(L, mine, theirs, home) {
  const mn = clubNet(L, mine) + (mine === L.team ? playoffImpact(L) : 0);
  const tn = clubNet(L, theirs) + (theirs === L.team ? playoffImpact(L) : 0);
  return gameP(mn - tn, home);
}
function playoffImpact(L) {
  const s = L.season;
  const role = s.role || roleOf(L);
  const playMin = Math.min(40, role.min + (role.starter ? 3 : 1));
  if (s.injury && s.injury.until > GAMES + 4) return 0;
  return impact(L, playMin) + s.mods.win;
}
/* A series that does not involve you, in one go. */
function simSeries(L, a, b, rng, aHome) {
  let wa = 0, wb = 0, g = 0;
  const homes = [1, 1, 0, 0, 1, 0, 1];
  while (wa < 4 && wb < 4) {
    const h = aHome ? homes[g] : 1 - homes[g];
    if (rng() < seriesP(L, a, b, !!h)) wa++; else wb++;
    g++;
  }
  return wa === 4 ? a : b;
}
/* One conference's bracket, given its eight seeds, with the player's own
   series left out (`skip` is the club whose series is played elsewhere). */
const PAIRS = [[0, 7], [3, 4], [2, 5], [1, 6]];

function playPlayIn(L, beats) {
  const s = L.season, po = s.po;
  const rng = rngAt(L, 'playin');
  const tab = s.table[po.cf];
  const seven = tab[6], eight = tab[7], nine = tab[8], ten = tab[9];
  const game = (a, b) => rng() < seriesP(L, a, b, true) ? a : b;
  const w78 = game(seven, eight), l78 = w78 === seven ? eight : seven;
  const w910 = game(nine, ten);
  const last = game(l78, w910);
  const into = L.team === w78 ? 7 : L.team === last ? 8 : 0;
  const lines = [];
  if (L.team === seven || L.team === eight) lines.push(L.team === w78 ? 'Won the 7 v 8 game.' : 'Lost the 7 v 8 game.');
  if (L.team === nine || L.team === ten) lines.push(L.team === w910 ? 'Survived the 9 v 10 game.' : 'Out in the 9 v 10 game.');
  if (L.team === l78 || L.team === w910) lines.push(L.team === last ? 'Won the last game in.' : 'Lost the last game in.');
  for (const t of lines) beats.push({ kind: 'po', text: t, tone: into ? 'good' : 'bad' });
  if (!into) {
    po.out = true; po.path = 'Play-in';
    logIt(L, 'Out in the play-in.', 'bad');
    return;
  }
  po.seed = into;
  /* The bracket's seeds 7 and 8 are whoever came through. */
  const field = tab.slice(0, 6).concat([w78, last]);
  po.field[po.cf] = field;
  po.round = 0;
  logIt(L, 'Through the play-in as the ' + into + ' seed.', 'good');
}
function seedField(L, cf, rng) {
  const tab = L.season.table[cf];
  const seven = tab[6], eight = tab[7], nine = tab[8], ten = tab[9];
  const game = (a, b) => rng() < seriesP(L, a, b, true) ? a : b;
  const w78 = game(seven, eight), l78 = w78 === seven ? eight : seven;
  return tab.slice(0, 6).concat([w78, game(l78, game(nine, ten))]);
}
/* Walk the bracket to the round you are in and return your opponent. */
function opponentFor(L) {
  const s = L.season, po = s.po;
  const rng = rngAt(L, 'bracket');
  for (const cf of ['East', 'West']) if (!po.field[cf]) po.field[cf] = seedField(L, cf, rng);
  /* Advance both conferences to the round being played, taking the player's
     real results wherever their club is. */
  const alive = {};
  for (const cf of ['East', 'West']) {
    let seats = PAIRS.map(([a, b]) => [po.field[cf][a], po.field[cf][b]]);
    for (let r = 0; r < Math.min(po.round, 2); r++) {
      const win = seats.map(([a, b]) => {
        if (a === L.team || b === L.team) return L.team;
        return simSeries(L, a, b, rngAt(L, 'srs:' + cf + ':' + r + ':' + a + b), true);
      });
      seats = [];
      for (let i = 0; i < win.length; i += 2) seats.push([win[i], win[i + 1]]);
    }
    alive[cf] = seats;
  }
  if (po.round < 3) {
    const mine = alive[po.cf].find(([a, b]) => a === L.team || b === L.team);
    return mine[0] === L.team ? mine[1] : mine[0];
  }
  const other = po.cf === 'East' ? 'West' : 'East';
  const [a, b] = alive[other][0];
  return simSeries(L, a, b, rngAt(L, 'srs:' + other + ':cf'), true);
}

function playRound(L, beats) {
  const s = L.season, po = s.po;
  if (po.round === -1) { playPlayIn(L, beats); return; }
  if (po.cur && po.cur.waiting) return;
  const opp = opponentFor(L);
  const recs = s.recs;
  const myHome = po.round < 3
    ? (po.field[po.cf].indexOf(L.team) < po.field[po.cf].indexOf(opp))
    : (recs[L.team].w >= recs[opp].w);
  po.cur = { round: po.round, opp, w: 0, l: 0, home: myHome, games: [] };
  continueSeries(L, beats);
}
function continueSeries(L, beats) {
  const s = L.season, po = s.po, cur = po.cur;
  const rng = rngAt(L, 'series:' + cur.round + ':' + cur.games.length);
  const homes = [1, 1, 0, 0, 1, 0, 1];
  while (cur.w < 4 && cur.l < 4) {
    const gi = cur.w + cur.l;
    const h = cur.home ? homes[gi] : 1 - homes[gi];
    if (cur.w === 3 && cur.l === 3) {
      cur.waiting = true;
      L.pending.push(clutchCard(L, cur, !!h));
      return;
    }
    const won = rng() < seriesP(L, L.team, cur.opp, !!h);
    if (won) cur.w++; else cur.l++;
    cur.games.push(won ? 1 : 0);
  }
  endSeries(L, beats);
}
function endSeries(L, beats) {
  const s = L.season, po = s.po, cur = po.cur;
  const won = cur.w === 4;
  const name = ROUNDS[cur.round];
  po.results.push({ round: cur.round, opp: cur.opp, w: cur.w, l: cur.l, won });
  const line = (won ? 'Beat the ' : 'Lost to the ') + nick(cur.opp) + ' ' + cur.w + '-' + cur.l + ' in the ' + name + '.';
  beats.push({ kind: 'po', text: line, tone: won ? 'good' : 'bad' });
  logIt(L, line, won ? 'good' : 'bad');
  po.cur = null;
  if (!won) { po.out = true; po.path = ROUND_SHORT[cur.round]; return; }
  if (cur.round === 3) {
    po.out = true; po.champ = true; po.path = 'Champion';
    L.flags.rings = (L.flags.rings || 0) + 1;
    s.awards.push('champ');
    bump(L, { fame: 14, morale: 20 });
    const role = s.role || roleOf(L);
    if (role.diff >= 6 || (role.starter && rngAt(L, 'fmvp')() < 0.25)) {
      s.awards.push('fmvp');
      beats.push({ kind: 'award', text: 'Finals MVP.', tone: 'gold' });
      logIt(L, 'Finals MVP.', 'gold');
      bump(L, { fame: 8 });
    }
    const n = L.flags.rings;
    const ring = n === 1 ? 'NBA champion.' : 'Ring number ' + n + '.';
    beats.push({ kind: 'champ', text: ring, tone: 'gold' });
    logIt(L, ring, 'gold');
    return;
  }
  po.round++;
}

/* GAME 7 IS YOURS. Tied, the ball, the last shot. The odds of each choice come
   off the rating it asks for, so a shooter should shoot and a passer should
   find the open man, and the screen shows the rating rather than the odds. */
function clutchOptions(L) {
  const r = L.rt, net = clubNet(L, L.team);
  return [
    { label: 'Pull-up three', rate: 'sho', p: clamp(0.2 + (r.sho - 50) * 0.0065, 0.12, 0.55) },
    { label: 'Drive to the rim', rate: 'fin', p: clamp(0.26 + ((r.fin + r.ath) / 2 - 50) * 0.0058, 0.15, 0.58) },
    { label: 'Mid-range fadeaway', rate: 'iq', p: clamp(0.25 + ((r.sho + r.iq) / 2 - 50) * 0.0052, 0.15, 0.55) },
    { label: 'Find the open man', rate: 'pla', p: clamp(0.27 + (r.pla - 50) * 0.0045 + net * 0.006, 0.15, 0.55) },
  ];
}
function clutchCard(L, cur, home) {
  const opts = clutchOptions(L);
  return {
    id: 'clutch', kind: 'clutch', key: 'clutch:' + cur.round,
    eyebrow: 'Game 7 · ' + ROUNDS[cur.round], title: 'Tied. Nine seconds. Your ball.',
    text: (home ? 'Home crowd on its feet' : 'A road crowd trying to rattle you') + ' against the ' + nick(cur.opp) + '. What is the play?',
    ctx: { round: cur.round, opp: cur.opp, home },
    options: opts.map((o) => ({ label: o.label, hint: RATING_NAME[o.rate] + ' ' + L.rt[o.rate] + '.' })),
  };
}

// ─── the offseason ──────────────────────────────────────────────────────────

/* How a year changes the body. Growth closes a share of the gap to potential,
   most of it at nineteen and none of it by twenty-eight. Decline starts at
   twenty-nine in the legs and reaches the jumper last. */
const GROW = { 19: 0.24, 20: 0.22, 21: 0.2, 22: 0.18, 23: 0.15, 24: 0.11, 25: 0.08, 26: 0.05, 27: 0.02 };
const DECLINE = { 29: 0.9, 30: 1.5, 31: 2.1, 32: 2.7, 33: 3.3, 34: 3.9, 35: 4.5, 36: 5.1, 37: 5.7 };
function develop(L, beats) {
  const before = ovrOf(L);
  const rng = rngAt(L, 'develop');
  const a = L.age;
  const gap = Math.max(0, L.pot - before);
  const eth = 0.65 + L.eth / 100 * 0.7;
  const grow = gap * (GROW[a] || 0) * eth;
  const dec = (DECLINE[a] || (a >= 38 ? 6.5 : 0)) * (1.2 - L.dur / 250) * (L.flags.longevity ? 0.75 : 1)
    + Math.max(0, 50 - L.m.health) * 0.03;
  for (const k of RATINGS) {
    let d = grow * (0.6 + rng() * 0.8);
    if (dec) {
      const legs = k === 'ath' ? 1.6 : k === 'fin' || k === 'def' ? 1.15 : k === 'sho' || k === 'iq' ? 0.45 : 0.9;
      d -= dec * legs * (0.7 + rng() * 0.6);
      if (k === 'iq' && a <= 33) d += 0.6;
    }
    L.rt[k] = clamp(Math.round(L.rt[k] + d), 25, 99);
  }
  const after = ovrOf(L);
  const diff = after - before;
  if (diff) {
    const t = diff > 0 ? 'Up ' + diff + ' overall this summer, to ' + after + '.' : 'Down ' + (-diff) + ' overall, to ' + after + '.';
    beats.push({ kind: 'dev', text: t, tone: diff > 0 ? 'good' : 'bad' });
    logIt(L, t, diff > 0 ? 'good' : 'bad');
  }
  bump(L, { health: 28 });
}

/* What the market pays a man of this overall: a share of the cap, capped by
   how long he has been in the league, the way the max is. */
function marketPct(o) {
  return Math.max(MIN_PCT, Math.pow(clamp((o - 58) / 37, 0, 1.1), 2.2) * 0.35);
}
function maxPct(L) {
  const yrs = L.seasonsDone;
  return yrs >= 10 ? 0.35 : yrs >= 7 ? 0.30 : 0.25;
}
function marketSalary(L, o) {
  const pct = Math.min(maxPct(L), marketPct(o));
  return round1(capFor(L.year) * pct * AGENTS[L.agent].sal);
}

/* What a front office sees: the overall, less what the next two years will
   take off a man past thirty. */
const marketOvr = (L) => ovrOf(L) - Math.max(0, L.age - 30) * 1.6
  + (L.age <= 24 ? Math.max(0, L.pot - ovrOf(L)) * 0.25 : 0);
function offers(L) {
  const o = marketOvr(L);
  const rng = rngAt(L, 'offers');
  /* The bottom of the league is a coin toss every summer: a minimum deal for
     a 64 is likely and for a 60 is not, and that is where careers end. */
  const n = o >= 85 ? 5 : o >= 76 ? 4 : o >= 70 ? 3 : o >= 66 ? 2 : rng() < (o - 57) / 9 ? 1 : 0;
  const a = L.age;
  const yrsFor = () => a <= 27 ? 4 + (rng() < 0.4 ? 1 : 0) : a <= 30 ? 3 + (rng() < 0.4 ? 1 : 0) : a <= 33 ? 2 + (rng() < 0.4 ? 1 : 0) : 1 + (rng() < 0.3 ? 1 : 0);
  const out = [];
  const used = {};
  const base = marketSalary(L, o + 1);
  const minSal = round1(capFor(L.year) * MIN_PCT);
  /* Your own club first, if they want you back: one more year than anybody,
     because they hold your rights. */
  if (L.team && n > 0 && o >= rotationBar(clubNet(L, L.team)) - 8) {
    out.push(offerFor(L, L.team, Math.min(5, yrsFor() + 1), Math.max(minSal, round1(base * (1.02 + rng() * 0.05))), true));
    used[L.team] = 1;
  }
  const pool = CLUBS.filter((c) => !used[c]);
  while (out.length < n && pool.length) {
    const c = weighted(rng, pool, (x) => 1 + Math.abs(clubNet(L, x)) * 0.15);
    pool.splice(pool.indexOf(c), 1);
    const net = clubNet(L, c);
    const mult = net >= 4 ? 0.9 : net <= -3 ? 1.06 : 1;
    out.push(offerFor(L, c, yrsFor(), Math.max(minSal, round1(base * mult * (0.94 + rng() * 0.1))), false));
  }
  return out;
}
function offerFor(L, c, years, salary, own) {
  const net = clubNet(L, c);
  const diff = effOvr(L) - rotationBar(net);
  const role = diff >= 12 ? 'Franchise player' : diff >= 0 ? 'Starter' : diff >= -6 ? 'Rotation' : 'End of bench';
  const capSal = round1(capFor(L.year) * maxPct(L) * AGENTS[L.agent].sal);
  return { club: c, years, salary: Math.min(salary, capSal), own: !!own, role, tier: clubTier(net) };
}
function faCard(L, list, why) {
  return {
    id: 'fa', kind: 'fa', key: 'fa:' + (why || ''),
    eyebrow: why === 'rfa' ? 'Restricted free agency' : 'Free agency',
    title: list.length === 1 ? 'One offer on the table.' : list.length + ' offers on the table.',
    text: 'Money, minutes or a ring. Rarely all three.',
    ctx: { offers: list },
    options: list.map((f) => ({
      label: 'The ' + nick(f.club) + (f.own ? ' (re-sign)' : ''),
      hint: f.years + ' yrs · ' + money(f.salary) + ' a year · ' + f.role + ' · ' + f.tier + '.',
      club: f.club,
    })),
  };
}
function retireCard(L) {
  return {
    id: 'retire', kind: 'event', key: 'retire',
    eyebrow: 'The summer', title: 'Is it time?',
    text: 'You are ' + L.age + '. Your overall is ' + ovrOf(L) + '. The body has an opinion.',
    options: [
      { label: 'One more season', hint: 'Find out what is left.' },
      { label: 'Retire', hint: 'Walk away on your own terms.' },
    ],
  };
}

function offseason(L, beats) {
  const s = L.season;
  develop(L, beats);
  /* Contracts. */
  const c = L.contract;
  if (c) c.years--;
  const o = ovrOf(L);
  if (L.flags.tradeAsk && c && c.years > 0) {
    const rng = rngAt(L, 'tradeask');
    const to = weighted(rng, CLUBS.filter((x) => x !== L.team), (x) => 2 + clubNet(L, x) + 6);
    L.flags.tradeAsk = false;
    joinTeam(L, to, true);
    beats.push({ kind: 'trade', text: 'Your request is granted. Traded to the ' + E.teamName(to) + '.', tone: 'gold' });
  }
  if (L.age >= 40) { retire(L, beats, 'The body made the call at ' + L.age + '.'); return; }
  const tired = L.age >= 34 || (L.age >= 31 && o < 70);
  if (c && c.years === 1 && c.kind === 'rookie' && o >= 66) {
    const sal = round1(marketSalary(L, o + 2) * 0.97);
    L.pending.push({
      id: 'extension', kind: 'event', key: 'ext', eyebrow: 'Rookie extension',
      title: 'The ' + nick(L.team) + ' want to lock you up.',
      text: 'Five years at ' + money(sal) + ' a year, starting next season.',
      ctx: { sal },
      options: [
        { label: 'Sign it', hint: 'Security. Five years.' },
        { label: 'Bet on yourself', hint: 'Play it out. Restricted free agency next summer.' },
      ],
    });
  } else if (c && c.years === 1 && c.kind !== 'rookie' && o >= 72 && L.age <= 31 && !L.flags.extAsked) {
    const sal = round1(marketSalary(L, o + 1));
    L.flags.extAsked = true;
    L.pending.push({
      id: 'extension', kind: 'event', key: 'vext', eyebrow: 'Extension offer',
      title: 'The ' + nick(L.team) + ' offer an extension.',
      text: 'Four years at ' + money(sal) + ' a year. Or test the market next summer.',
      ctx: { sal, years: 4 },
      options: [
        { label: 'Sign it', hint: 'Stay put. Get paid.' },
        { label: 'Test the market', hint: 'Free agency next summer.' },
      ],
    });
  }
  if (!c || c.years <= 0) {
    L.flags.extAsked = false;
    if (tired) L.pending.push(retireCard(L));
    const list = offers(L);
    if (!list.length) {
      L.pending.push({
        id: 'nooffer', kind: 'event', key: 'nooffer', eyebrow: 'Free agency',
        title: 'Nobody called.',
        text: 'Your overall is ' + o + '. The league has moved on.',
        options: [
          { label: 'Retire', hint: 'It was a career.' },
          { label: 'Play overseas', hint: 'A year away, then try again.' },
        ],
      });
    } else {
      L.pending.push(faCard(L, list, c && c.kind === 'rookie' ? 'rfa' : ''));
    }
  } else if (tired) {
    L.pending.push(retireCard(L));
  }
  /* Something off the court, most summers. */
  queueEvents(L, 'off', 1);
}

function retire(L, beats, why) {
  L.retired = true;
  L.phase = 'retired';
  L.pending = [];
  L.final = legacy(L);
  const t = why || 'Retired at ' + L.age + '.';
  beats.push({ kind: 'retire', text: t, tone: 'gold' });
  logIt(L, t + ' ' + L.final.verdict + '.', 'gold');
}

// ─── the legacy ─────────────────────────────────────────────────────────────

function totals(L) {
  const T = { gp: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, min: 0, seasons: L.history.length,
    rings: 0, mvp: 0, fmvp: 0, star: 0, an: 0, an1: 0, dpoy: 0, roy: 0, earned: L.earned, olympic: 0,
    ncaa: 0, npoy: 0, aa1: 0, state: 0 };
  for (const h of L.history) {
    T.gp += h.gp; T.pts += Math.round(h.pts * h.gp); T.reb += Math.round(h.reb * h.gp); T.ast += Math.round(h.ast * h.gp);
    T.stl += Math.round(h.stl * h.gp); T.blk += Math.round(h.blk * h.gp); T.min += Math.round(h.min * h.gp);
    for (const a of h.aw || []) {
      if (a === 'champ') T.rings++;
      else if (a === 'mvp') T.mvp++;
      else if (a === 'fmvp') T.fmvp++;
      else if (a === 'star') T.star++;
      else if (a === 'an1') { T.an++; T.an1++; }
      else if (a === 'an2' || a === 'an3') T.an++;
      else if (a === 'dpoy') T.dpoy++;
      else if (a === 'roy') T.roy++;
      else if (a === 'olympic') T.olympic++;
    }
  }
  for (const h of L.amHist || []) {
    for (const a of h.aw || []) {
      if (a === 'c_champ') T.ncaa++;
      else if (a === 'c_npoy') T.npoy++;
      else if (a === 'c_aa1') T.aa1++;
      else if (a === 'hs_state') T.state++;
    }
  }
  return T;
}
/* A Hall of Fame case, as one number. The weights are what a voter weighs: a
   ring, an MVP and a first team are each worth a great deal more than a long
   career of good seasons, but a long career of good seasons is worth a lot. */
function legacyScore(T) {
  return Math.round(T.pts / 1000 * 1.4 + T.reb / 1000 * 0.5 + T.ast / 1000 * 0.7 + T.rings * 4 + T.mvp * 13 + T.fmvp * 6
    + T.an1 * 5 + (T.an - T.an1) * 2.5 + T.star * 2 + T.dpoy * 4 + T.roy * 2 + T.olympic * 2
    /* The Hall in Springfield counts college too, a little. */
    + (T.ncaa || 0) * 2 + (T.npoy || 0) * 3 + (T.aa1 || 0));
}
const VERDICTS = [
  [120, 'Inner circle', 'One of the greatest to ever play.'],
  [85, 'First ballot', 'The Hall calls the first year you are eligible.'],
  [55, 'Hall of Famer', 'Springfield, eventually. Bring a suit.'],
  [36, 'On the ballot', 'A real case. The voters will argue about you.'],
  [18, 'A good career', 'Paid, respected, remembered in your city.'],
  [0, 'Journeyman', 'You made it. Most never do.'],
];
function legacy(L) {
  const T = totals(L);
  if (!L.history.length) return { totals: T, score: 0, verdict: 'Never made the league', blurb: 'The game gave you a lot. The league never called.' };
  const score = legacyScore(T);
  const v = VERDICTS.find((x) => score >= x[0]);
  return { totals: T, score, verdict: v[1], blurb: v[2] };
}

// ─── the events ─────────────────────────────────────────────────────────────

/* Every card the year can deal. `when` says whether it fits now, `weight` how
   often it comes up, and `options` are run off the card's own seeded draw.
   Each `run` returns the sentence the screen prints under the choice. Every
   person in here is a role, never a name. */
const ok = (rng, p) => rng() < clamp(p, 0.03, 0.97);
const EVENTS = {
  vet_mentor: {
    phases: ['early'], once: true, when: (L) => L.seasonsDone === 0, weight: () => 4,
    title: 'The oldest man in the locker room pulls you aside.',
    text: () => 'Fourteen years in the league. He offers to show you how he stayed.',
    options: [
      { label: 'Shadow him every day', run: (L) => { bump(L, { iq: 2, eth: 6, trust: 4 }); return 'Film at six. Lift at seven. You learn more than you expected.'; } },
      { label: 'Ask about money', run: (L) => { bump(L, { cash: 0.2, iq: 1 }); L.flags.savvy = true; return 'He tells you what nobody told him. You open a real savings account.'; } },
      { label: 'Do your own thing', run: (L) => { bump(L, { morale: 2 }); return 'He shrugs. There is always another rookie.'; } },
    ],
  },
  rookie_duty: {
    phases: ['early'], once: true, when: (L) => L.seasonsDone === 0, weight: () => 3,
    title: 'Rookie duty.',
    text: () => 'The vets want breakfast on the plane. Every road trip. You are buying.',
    options: [
      { label: 'Go along with it', run: (L) => { bump(L, { trust: 6, cash: -0.05, morale: -2 }); return 'Forty breakfast sandwiches later, the locker room likes you.'; } },
      { label: 'Turn it into content', run: (L, r) => { if (ok(r, 0.6)) { bump(L, { fame: 6, trust: 2 }); return 'The video does numbers. Even the vets share it.'; } bump(L, { fame: 3, trust: -6 }); return 'It does numbers. The vets are not laughing.'; } },
      { label: 'Refuse', run: (L) => { bump(L, { trust: -8, morale: 3 }); return 'Bold. Your sneakers are full of ice the next morning.'; } },
    ],
  },
  night_out: {
    phases: ['early', 'mid', 'late'], when: () => true, weight: () => 3,
    title: 'Back-to-back tomorrow. The group chat is going out.',
    text: () => 'Everybody is going. You know how this ends.',
    options: [
      { label: 'Go out', run: (L, r) => { if (ok(r, 0.55)) { bump(L, { morale: 8, health: -4 }); return 'Great night. Rough morning. You get through it.'; } bump(L, { morale: 4, health: -6, trust: -7, fame: 3 }); return 'Photos surface. The coach has seen them.'; } },
      { label: 'One drink, then home', run: (L) => { bump(L, { morale: 4, health: -1 }); return 'You show your face and leave early. Best of both.'; } },
      { label: 'Stay in', run: (L) => { bump(L, { iq: 1, health: 2, morale: -2 }); return 'Film and sleep. You play well tomorrow.'; } },
    ],
  },
  hot_streak: {
    phases: ['early', 'mid', 'late'], when: (L) => L.season && L.season.role && L.season.role.min >= 22, weight: () => 3,
    title: 'You are on fire.',
    text: () => 'Thirty points three straight nights. The cameras find your locker.',
    options: [
      { label: 'Tell them you are the best player here', run: (L, r) => { bump(L, { fame: 8, trust: -4 }); if (ok(r, 0.5)) { bump(L, { usage: 0.02 }); return 'The coach runs more plays for you. The bigs notice.'; } bump(L, { morale: -3 }); return 'It plays on every channel. Two teammates stop passing.'; } },
      { label: 'Credit your teammates', run: (L) => { bump(L, { trust: 5, morale: 4, win: 0.4 }); return 'The locker room loves it. The ball moves a little faster.'; } },
      { label: 'Say nothing', run: (L) => { bump(L, { fame: 2 }); return 'Headphones on. The mystery helps.'; } },
    ],
  },
  slump: {
    phases: ['early', 'mid', 'late'], when: (L) => L.season && L.season.role && L.season.role.min >= 14, weight: () => 3,
    title: 'You cannot buy a bucket.',
    text: () => 'Twenty-six percent from three for a month. The fans have opinions.',
    options: [
      { label: 'Midnight shooting', run: (L, r) => { bump(L, { health: -4 }); if (ok(r, 0.7)) { bump(L, { sho: 2, morale: 4 }); return 'Five hundred makes a night. It comes back.'; } bump(L, { morale: -4 }); return 'Tired legs, flat shots. It gets worse before it gets better.'; } },
      { label: 'Get to the rim instead', run: (L) => { bump(L, { fin: 1, usage: -0.01, perf: 0.4 }); return 'Layups and free throws until the jumper wakes up.'; } },
      { label: 'Keep shooting', run: (L, r) => { if (ok(r, 0.5)) { bump(L, { morale: 6, fame: 2 }); return 'Shooters shoot. It breaks open in Denver.'; } bump(L, { morale: -6, trust: -3 }); return 'It does not break. The coach shortens your leash.'; } },
    ],
  },
  coach_bench: {
    phases: ['early', 'mid'], when: (L) => L.season && L.season.role && L.season.role.starter && L.season.role.diff < 6, weight: () => 2,
    title: 'The coach wants you off the bench.',
    text: () => 'He says the second unit needs a scorer. You hear demotion.',
    options: [
      { label: 'Accept it', run: (L) => { bump(L, { trust: 10, min: -4, usage: 0.03 }); return 'You run the second unit. Sixth Man talk starts by March.'; } },
      { label: 'Push back', run: (L, r) => { if (ok(r, 0.4)) { bump(L, { trust: -3 }); return 'He relents. You keep the spot. For now.'; } bump(L, { trust: -12, min: -5, morale: -6 }); return 'He does it anyway. Now you are benched and annoyed.'; } },
      { label: 'Ask for a trade', run: (L) => { L.flags.tradeAsk = true; bump(L, { trust: -15, fame: 3 }); return 'Your agent makes the call. Word gets out by morning.'; } },
    ],
  },
  stuck: {
    phases: ['early', 'mid'], when: (L) => L.season && L.season.role && L.season.role.min < 18, weight: () => 4,
    title: 'You are stuck behind a veteran.',
    text: () => 'Twelve minutes a night. Some nights, none.',
    options: [
      { label: 'Outwork him', run: (L, r) => { bump(L, { eth: 5, health: -3 }); if (ok(r, 0.55)) { bump(L, { trust: 10, min: 5 }); return 'The coach notices. Your minutes go up.'; } bump(L, { trust: 4 }); return 'He notices. Not enough yet.'; } },
      { label: 'Vent on a podcast', run: (L) => { bump(L, { fame: 6, trust: -12, morale: 3 }); return 'Clip goes everywhere. The coach does not listen to podcasts. Someone sends it to him.'; } },
      { label: 'Ask to go to the G League', run: (L) => { bump(L, { fin: 1, sho: 1, iq: 1, min: -3, trust: 4 }); return 'Twenty games of thirty-five minutes. You come back sharper.'; } },
    ],
  },
  film_session: {
    phases: ['early', 'mid', 'late'], when: () => true, weight: () => 2,
    title: 'Film session. The clip is you.',
    text: () => 'You jog back on defense. The coach plays it three times.',
    options: [
      { label: 'Own it', run: (L) => { bump(L, { def: 1, trust: 6 }); return 'You say it is on you. It does not happen again.'; } },
      { label: 'Argue', run: (L, r) => { if (ok(r, 0.3)) { bump(L, { trust: 2 }); return 'You had a point. The coach admits the scheme was wrong.'; } bump(L, { trust: -9 }); return 'Bad look. The assistants exchange a glance.'; } },
      { label: 'Laugh it off', run: (L) => { bump(L, { morale: 2, trust: -3 }); return 'The room laughs too. The coach does not.'; } },
    ],
  },
  teammate_touches: {
    phases: ['mid', 'late'], when: (L) => L.season && L.season.role && L.season.role.starter, weight: () => 2,
    title: 'Your starting center wants the ball.',
    text: () => 'He says he is open on every possession. He tells the press too.',
    options: [
      { label: 'Feed him', run: (L) => { bump(L, { pla: 1, usage: -0.02, win: 0.5, trust: 3 }); return 'He gets his. The team wins four straight.'; } },
      { label: 'Talk it out in private', run: (L, r) => { if (ok(r, 0.65)) { bump(L, { morale: 3, win: 0.3 }); return 'Dinner, honesty, a handshake. Fixed.'; } bump(L, { morale: -3 }); return 'He leaves dinner early. It lingers.'; } },
      { label: 'Ignore it', run: (L) => { bump(L, { win: -0.6, morale: -2 }); return 'It festers. You can feel it in the huddles.'; } },
    ],
  },
  trade_rumor: {
    phases: ['mid'], when: (L) => !L.flags.tradeAsk && L.contract && L.contract.years >= 1, weight: (L) => clubNet(L, L.team) < -2 ? 4 : 1.5,
    title: 'Your name is in trade talks.',
    text: () => 'The deadline is Thursday. Your phone will not stop.',
    options: [
      { label: 'Tell them you want to stay', run: (L, r) => { bump(L, { trust: 6 }); if (ok(r, 0.8)) return 'The front office hears you. You stay.'; tradeNow(L, r); return 'They trade you anyway. Business.'; } },
      { label: 'Ask to go to a contender', run: (L, r) => { if (ok(r, 0.55)) { tradeNow(L, r, true); return 'Done. You are headed to a winner.'; } bump(L, { trust: -8 }); return 'No deal. And now everybody knows you wanted out.'; } },
      { label: 'Say nothing', run: (L, r) => { if (ok(r, 0.25)) { tradeNow(L, r); return 'A call at midnight. You have been traded.'; } return 'Thursday passes. You stay.'; } },
    ],
  },
  tank: {
    phases: ['late'], when: (L) => L.season && (L.season.l - L.season.w) >= 10, weight: () => 4,
    title: 'The front office is playing for the lottery.',
    text: () => 'They want you on a minutes limit for the rest of the year.',
    options: [
      { label: 'Go along', run: (L) => { bump(L, { min: -6, health: 6, trust: 4 }); return 'Fewer minutes. Fresher legs. Lower numbers.'; } },
      { label: 'Refuse', run: (L) => { bump(L, { trust: -8, fame: 3, win: 0.4 }); return 'You play it out. You also win them two games they did not want.'; } },
      { label: 'Ask for a trade', run: (L) => { L.flags.tradeAsk = true; bump(L, { trust: -10 }); return 'You want to win now. They hear it.'; } },
    ],
  },
  injury_tweak: {
    phases: ['mid', 'late'], when: () => true, weight: (L) => L.m.health < 55 ? 4 : 1.5,
    title: 'Something pulls in your hamstring.',
    text: () => 'It is not bad. Yet.',
    options: [
      { label: 'Play through it', run: (L, r) => { if (ok(r, 0.6)) { bump(L, { trust: 4, health: -4 }); return 'Taped up. It holds.'; } bump(L, { health: -10, risk: 0.05, perf: -0.5 }); return 'It gets worse. You are a step slow for weeks.'; } },
      { label: 'Sit a week', run: (L) => { bump(L, { health: 8, rest: 0.05 }); return 'A week off. Back to normal.'; } },
      { label: 'Get a second opinion', run: (L) => { bump(L, { cash: -0.1, health: 5 }); return 'Expensive specialist. Good advice.'; } },
    ],
  },
  shoe_deal: {
    phases: ['pre', 'mid', 'off'], once: true, when: (L) => L.m.fame >= 55, weight: () => 4,
    title: 'Two shoe companies want you.',
    text: () => 'One is the biggest brand in the world. One will give you your own shoe.',
    options: [
      { label: 'The biggest brand', run: (L) => { L.endorseBonus = (L.endorseBonus || 0) + 4; bump(L, { fame: 4 }); return 'Big money. One of forty faces on their wall.'; } },
      { label: 'Your own signature shoe', run: (L, r) => { L.endorseBonus = (L.endorseBonus || 0) + 2; bump(L, { fame: 9 }); if (ok(r, 0.5)) { L.endorseBonus += 3; return 'The first colorway sells out in an hour.'; } return 'Smaller check. Your name on a box. Sales are fine.'; } },
      { label: 'Stay a free agent', run: (L) => { bump(L, { morale: 2 }); return 'You wear whatever you want. Nobody pays you for it.'; } },
    ],
  },
  local_ad: {
    phases: ['pre', 'early', 'off'], when: (L) => L.m.fame >= 25, weight: () => 2,
    title: 'A car dealership wants a commercial.',
    text: () => 'Thirty seconds. You hold a key and point at the camera.',
    options: [
      { label: 'Do it', run: (L, r) => { bump(L, { cash: 0.25, fame: 2 }); if (ok(r, 0.35)) { bump(L, { fame: 4 }); return 'It is so bad it goes viral. Everybody quotes it.'; } return 'Easy money. Your mom loves it.'; } },
      { label: 'Pass', run: (L) => { bump(L, { morale: 1 }); return 'Your brand stays clean.'; } },
    ],
  },
  online_beef: {
    phases: ['early', 'mid', 'late'], when: (L) => L.m.fame >= 30, weight: () => 2,
    title: 'A guard in your conference called you overrated.',
    text: () => 'Online. In front of everybody. You play him Friday.',
    options: [
      { label: 'Clap back', run: (L, r) => { bump(L, { fame: 6 }); if (ok(r, 0.5)) { bump(L, { morale: 6 }); return 'Your reply is funnier. The internet picks a side. Yours.'; } bump(L, { morale: -5 }); return 'He wins the thread. It follows you for a week.'; } },
      { label: 'Answer Friday', run: (L, r) => { if (ok(r, 0.35 + (ovrOf(L) - 70) * 0.012)) { bump(L, { fame: 8, morale: 8, perf: 0.3 }); return 'Thirty-eight on him. You never say a word.'; } bump(L, { morale: -6 }); return 'He gets the better of you. Now it is a thing.'; } },
      { label: 'Ignore it', run: (L) => { bump(L, { trust: 2 }); return 'The coach respects it.'; } },
    ],
  },
  ref_heat: {
    phases: ['early', 'mid', 'late'], when: () => true, weight: () => 1.5,
    title: 'Third straight no-call on a drive.',
    text: () => 'The ref is right there. He looks away.',
    options: [
      { label: 'Let him have it', run: (L, r) => { bump(L, { fame: 3, cash: -0.04 }); if (ok(r, 0.5)) { bump(L, { trust: -5 }); return 'Ejected. Fined. The crowd loves you.'; } return 'A technical. Worth it, you decide.'; } },
      { label: 'Walk away', run: (L) => { bump(L, { iq: 1 }); return 'You get the next call. Funny how that works.'; } },
    ],
  },
  heckler: {
    phases: ['mid', 'late'], when: (L) => L.m.fame >= 20, weight: () => 1.2,
    title: 'A fan courtside is saying things about your family.',
    text: () => 'All night. Security is not doing anything.',
    options: [
      { label: 'Confront him', run: (L, r) => { if (ok(r, 0.4)) { bump(L, { fame: 5, trust: -3 }); return 'Words only. He is banned. You are a folk hero.'; } bump(L, { fame: 6, cash: -0.2, trust: -6, rest: 0.03 }); return 'It gets out of hand. Suspended two games.'; } },
      { label: 'Tell security', run: (L) => { bump(L, { trust: 3 }); return 'He is gone by the third quarter. The league backs you.'; } },
      { label: 'Wink and hit a three', run: (L, r) => { if (ok(r, L.rt.sho / 120)) { bump(L, { fame: 6, morale: 5 }); return 'Splash. You blow him a kiss. The clip is everywhere.'; } bump(L, { morale: -2 }); return 'Brick. He gets louder.'; } },
    ],
  },
  charity: {
    phases: ['pre', 'off', 'mid'], when: (L) => L.cash >= 0.5, weight: () => 2,
    title: 'Your old high school gym is falling apart.',
    text: () => 'The roof leaks onto the court. They ask if you can help.',
    options: [
      { label: 'Pay for a new gym', run: (L) => { const c = Math.min(L.cash * 0.5, 2.5); bump(L, { cash: -c, fame: 6, morale: 8 }); L.flags.gym = true; return 'Your name on the wall. The kids lose their minds.'; } },
      { label: 'Run a free camp', run: (L) => { bump(L, { fame: 3, morale: 5, health: -2 }); return 'Three hundred kids. One of them can really play.'; } },
      { label: 'Not now', run: (L) => { bump(L, { morale: -2 }); return 'You tell yourself next year.'; } },
    ],
  },
  family_money: {
    phases: ['pre', 'off', 'early'], when: (L) => L.cash >= 1, weight: () => 2,
    title: 'A cousin needs money.',
    text: () => 'It is the third time this year. It is a lot.',
    options: [
      { label: 'Give it', run: (L) => { bump(L, { cash: -Math.min(0.5, L.cash * 0.2), morale: 3 }); return 'Family is family. You will hear from him again.'; } },
      { label: 'Set up a trust for the family', run: (L) => { bump(L, { cash: -Math.min(0.8, L.cash * 0.25), morale: 6 }); L.flags.savvy = true; return 'Structure. Rules. Fewer awkward calls.'; } },
      { label: 'Say no', run: (L) => { bump(L, { morale: -5 }); return 'Thanksgiving is quiet this year.'; } },
    ],
  },
  investment: {
    phases: ['pre', 'off'], when: (L) => L.cash >= 1.5, weight: () => 2,
    title: 'A friend has a business idea.',
    text: () => 'Streetwear. Or a burger chain. Or an app. He needs a partner.',
    options: [
      { label: 'Go all in', run: (L, r) => { const st = Math.min(L.cash * 0.4, 4); if (ok(r, L.flags.savvy ? 0.45 : 0.3)) { bump(L, { cash: st * 1.8, fame: 2 }); return 'It works. You are an owner now.'; } bump(L, { cash: -st, morale: -5 }); return 'It does not work. Neither does the friendship.'; } },
      { label: 'Put in a little', run: (L, r) => { const st = Math.min(L.cash * 0.1, 1); if (ok(r, 0.45)) { bump(L, { cash: st * 1.5 }); return 'A small win. A good story.'; } bump(L, { cash: -st }); return 'Gone. Cheap lesson.'; } },
      { label: 'Pass', run: () => 'You keep the money. You keep the friend.' },
    ],
  },
  podcast: {
    phases: ['off', 'pre'], once: true, when: (L) => L.m.fame >= 45 && L.seasonsDone >= 2, weight: () => 1.5,
    title: 'A network wants you to host a podcast.',
    text: () => 'Weekly. Unfiltered. Good money.',
    options: [
      { label: 'Start it', run: (L, r) => { bump(L, { fame: 8, cash: 0.4 }); if (ok(r, 0.3)) { bump(L, { trust: -8 }); return 'Episode six says too much about your coach.'; } return 'It is a hit. Players start calling in.'; } },
      { label: 'Not while you are playing', run: (L) => { bump(L, { trust: 3 }); return 'The coach appreciates the focus.'; } },
    ],
  },
  body_care: {
    phases: ['pre', 'off'], once: true, when: (L) => L.age >= 27 && L.cash >= 1, weight: () => 3,
    title: 'A longevity coach pitches a full program.',
    text: () => 'Chef, sleep coach, cold tub, the works. It is not cheap.',
    options: [
      { label: 'Buy the whole program', run: (L) => { bump(L, { cash: -Math.min(1.2, L.cash * 0.3), dur: 10, health: 10 }); L.flags.longevity = true; return 'You feel twenty-five. Your decline will be slower.'; } },
      { label: 'Just the chef', run: (L) => { bump(L, { cash: -0.3, health: 6, dur: 4 }); return 'You eat better. It helps.'; } },
      { label: 'You are fine', run: (L) => { bump(L, { morale: 1 }); return 'You are fine. For now.'; } },
    ],
  },
  load_mgmt: {
    phases: ['early', 'mid'], when: (L) => L.age >= 30 && L.season && L.season.role && L.season.role.starter, weight: () => 3,
    title: 'The training staff wants to rest you on back-to-backs.',
    text: () => 'Twelve games off. Fresher in April.',
    options: [
      { label: 'Agree', run: (L) => { bump(L, { rest: 0.15, health: 8 }); return 'You sit in a suit twelve times. Your knees thank you.'; } },
      { label: 'Refuse. You play every night.', run: (L) => { bump(L, { fame: 3, health: -6, risk: 0.03, trust: 2 }); return 'Old school. The fans love it. Your body has notes.'; } },
    ],
  },
  mentor_rookie: {
    phases: ['early'], when: (L) => L.age >= 29 && L.seasonsDone >= 6, weight: () => 2,
    title: 'The new rookie follows you everywhere.',
    text: () => 'He grew up with your poster on his wall.',
    options: [
      { label: 'Take him under your wing', run: (L) => { bump(L, { trust: 6, morale: 6, win: 0.3 }); return 'He gets better fast. So does the team.'; } },
      { label: 'Let him learn the hard way', run: (L) => { bump(L, { morale: -1 }); return 'That is how you learned.'; } },
    ],
  },
  contract_year: {
    phases: ['early'], when: (L) => L.contract && L.contract.years === 1, weight: () => 4,
    title: 'Contract year.',
    text: () => 'Everybody knows. Every shot is a negotiation.',
    options: [
      { label: 'Get your numbers', run: (L) => { bump(L, { usage: 0.03, win: -0.4, trust: -3 }); return 'You hunt shots. The stats look great.'; } },
      { label: 'Play winning basketball', run: (L) => { bump(L, { win: 0.5, trust: 5 }); return 'You do the little things. Front offices notice that too.'; } },
      { label: 'Protect your body', run: (L) => { bump(L, { min: -3, health: 8, risk: -0.03 }); return 'Healthy in July is the whole point.'; } },
    ],
  },
  media_day: {
    phases: ['pre'], when: () => true, weight: () => 2,
    title: 'Media day. What are your goals this year?',
    text: () => 'Twenty microphones. One question.',
    options: [
      { label: 'MVP', run: (L, r) => { bump(L, { fame: 6 }); if (ovrOf(L) >= 85) { bump(L, { morale: 4 }); return 'Nobody laughs. That is the point.'; } bump(L, { morale: -3 }); return 'A few people laugh. You remember who.'; } },
      { label: 'Win games', run: (L) => { bump(L, { trust: 4 }); return 'The coach likes that answer.'; } },
      { label: 'Stay healthy', run: (L) => { bump(L, { health: 2 }); return 'Boring. True.'; } },
    ],
  },
  coach_fired: {
    phases: ['mid'], when: (L) => L.season && (L.season.l - L.season.w) >= 8, weight: () => 2.5,
    title: 'The coach is fired.',
    text: () => 'The front office asks who you want next.',
    options: [
      { label: 'Back the assistant', run: (L) => { L.m.trust = 62; bump(L, { win: 0.4 }); return 'He gets the job. He remembers who backed him.'; } },
      { label: 'Ask for a big name', run: (L, r) => { if (ok(r, 0.5)) { L.m.trust = 55; bump(L, { win: 1 }); return 'They land him. Practices get serious.'; } L.m.trust = 40; return 'They hire someone else. He heard you asked.'; } },
      { label: 'Stay out of it', run: (L) => { L.m.trust = 50; return 'Not your job. Literally.'; } },
    ],
  },
  buzzer: {
    phases: ['early', 'mid', 'late'], when: (L) => L.season && L.season.role && L.season.role.min >= 24, weight: () => 2.5,
    title: 'Down one. Four seconds. Your ball.',
    text: () => 'Regular season, but the building does not know that.',
    options: [
      { label: 'Step-back three', run: (L, r) => buzzer(L, r, 0.2 + (L.rt.sho - 50) * 0.0065) },
      { label: 'Attack the rim', run: (L, r) => buzzer(L, r, 0.24 + ((L.rt.fin + L.rt.ath) / 2 - 50) * 0.006) },
      { label: 'Draw a foul', run: (L, r) => buzzer(L, r, 0.22 + (L.rt.iq - 50) * 0.006) },
    ],
  },
  olympics: {
    phases: ['off'], when: (L) => (L.year + 1) % 4 === 0 && ovrOf(L) >= 82, weight: () => 9,
    title: 'Team USA calls.',
    text: () => 'Twelve spots. One is yours if you want it.',
    options: [
      { label: 'Go for gold', run: (L, r) => { bump(L, { health: -10, fame: 6 }); if (ok(r, 0.78)) { L.flags.olympic = (L.flags.olympic || 0) + 1; L.flags.goldYear = L.year; return 'Gold. The anthem hits different.'; } return 'Silver. It stings for a long time.'; } },
      { label: 'Rest this summer', run: (L) => { bump(L, { health: 6 }); return 'The legs need it.'; } },
    ],
  },
  superteam: {
    phases: ['off'], when: (L) => ovrOf(L) >= 84 && L.contract && L.contract.years >= 1 && clubNet(L, L.team) < 2, weight: () => 2,
    title: 'Two stars call you the same night.',
    text: () => 'They want to team up. They have a team in mind.',
    options: [
      { label: 'Request the trade', run: (L, r) => { tradeNow(L, r, true); bump(L, { fame: 5, trust: 0 }); return 'It happens. The league calls it a superteam.'; } },
      { label: 'Stay loyal', run: (L) => { bump(L, { morale: 4, fame: 2, trust: 8 }); return 'You hang up. Your city notices.'; } },
    ],
  },
  rap_album: {
    phases: ['off'], once: true, when: (L) => L.m.fame >= 50, weight: () => 1,
    title: 'You have been making music.',
    text: () => 'A label heard the demos. They want an album.',
    options: [
      { label: 'Drop it', run: (L, r) => { if (ok(r, 0.3)) { bump(L, { fame: 10, cash: 0.6 }); return 'It charts. Nobody saw that coming.'; } bump(L, { fame: 4, morale: -3 }); return 'The reviews are brutal. The fans are kind.'; } },
      { label: 'Keep it for yourself', run: (L) => { bump(L, { morale: 3 }); return 'Some things are just for the car.'; } },
    ],
  },
  rehab_summer: {
    /* Asked after develop() has already given the summer's health back, so it
       keys on the season that took it rather than on the meter. */
    phases: ['off'], when: (L) => !!(L.season && (L.season.out >= 12 || L.age >= 31)), weight: () => 3,
    title: 'The body is tired.',
    text: () => 'The trainers want a quiet summer. Your trainer wants work.',
    options: [
      { label: 'Rest', run: (L) => { bump(L, { health: 14 }); return 'Sleep, swim, repeat.'; } },
      { label: 'Work anyway', run: (L) => { bump(L, { health: -4, eth: 4, sho: 1 }); return 'You do it anyway. That is who you are.'; } },
    ],
  },
};

function buzzer(L, r, p) {
  if (ok(r, p)) {
    if (L.season && L.season.l > 0) { L.season.w++; L.season.l--; }
    bump(L, { fame: 5, morale: 8, trust: 3 });
    L.flags.winners = (L.flags.winners || 0) + 1;
    return 'Good. Game over. You are on every highlight show tonight.';
  }
  bump(L, { morale: -4 });
  return 'Off the back iron. You will see it in your sleep.';
}
/* A trade forced by a card, mid-season or in a summer. */
function tradeNow(L, rng, contender) {
  const pool = CLUBS.filter((x) => x !== L.team);
  const to = weighted(rng, pool, (x) => contender ? Math.max(0.2, clubNet(L, x) + 4) : 1);
  joinTeam(L, to, true);
  const s = L.season;
  if (s && s.g > 0 && s.g < GAMES) {
    /* The record follows the club, not the man: the new club's games so far. */
    const p = gameP(clubNet(L, to), true) - 0.03;
    s.w = clamp(Math.round(s.g * p + norm(rng) * 2), 0, s.g);
    s.l = s.g - s.w;
    s.team = to;
  }
}

/* The year's training card, which is the one card every summer deals. */
function trainingCard(L) {
  return {
    id: 'training', kind: 'event', key: 'training',
    eyebrow: 'Summer of ' + (L.year - 1), title: 'How do you spend the summer?',
    text: 'You are ' + L.age + '. Overall ' + ovrOf(L) + '. Health ' + L.m.health + '.',
    options: [
      { label: 'Shooting gym', hint: 'Shooting and IQ.' },
      { label: 'Strength and speed', hint: 'Athleticism, finishing, rebounding.' },
      { label: 'Point guard school', hint: 'Playmaking and IQ.' },
      { label: 'Defensive camp', hint: 'Defense and athleticism.' },
      { label: 'Rest and recover', hint: 'Health. Slower decline.' },
    ],
  };
}
/* A summer moves two or three ratings by a point or two. It is a direction,
   not a shortcut: the growth that matters is the age curve in develop(). */
const TRAIN = [
  { sho: 2, iq: 1 }, { ath: 1, fin: 1, reb: 1 }, { pla: 2, iq: 1 }, { def: 2, ath: 1 }, null,
];

const SUMMERY = { off: 1, pre: 1, hs_sum: 1, hs_off: 1, col_pre: 1, col_off: 1 };
function queueEvents(L, phase, n, pool) {
  pool = pool || EVENTS;
  if (!L.flags.offUsed || L.flags.offUsed.y !== L.year) L.flags.offUsed = { y: L.year };
  const used = L.season ? L.season.used : L.flags.offUsed;
  const once = L.flags.once = L.flags.once || {};
  const rng = rngAt(L, 'ev:' + phase + ':' + L.pending.length);
  for (let k = 0; k < n; k++) {
    const ids = Object.keys(pool).filter((id) => {
      const ev = pool[id];
      if (ev.phases.indexOf(phase) < 0) return false;
      if (used[id]) return false;
      if (ev.once && once[id]) return false;
      return ev.when(L);
    });
    const id = weighted(rng, ids, (x) => pool[x].weight(L));
    if (!id) return;
    used[id] = 1;
    if (pool[id].once) once[id] = 1;
    const ev = pool[id];
    L.pending.push({
      id, kind: 'event', key: phase + ':' + id,
      eyebrow: SUMMERY[phase] ? 'The summer' : 'This season',
      title: ev.title, text: ev.text(L),
      options: ev.options.map((o) => ({ label: o.label })),
    });
  }
}

// ─── before the league: high school and college ─────────────────────────────

/* A career can start on draft night, with a background standing in for how
 * you got there, or three years earlier as a fifteen year old high school
 * sophomore. The road is played on the league's own ratings scale, so a
 * sophomore is about a 40 and a one and done arrives near the 56 the
 * background would have handed him. The point of playing it is that the 56 is
 * yours, and so is everything the scouts saw on the way.
 *
 * THE SCHOOLS ARE REAL AND THE PEOPLE ARE NOT. A college is an institution, the
 * way an NBA club is, so Duke is Duke. Every coach, booster, rival and roommate
 * a card talks about is a role, never a name: the line career.js already holds.
 *
 * NOTHING HERE TOUCHES THE LEAGUE'S MODEL. The road ends at the same combine
 * card a draft-night career starts on, with ratings, a ceiling, fame and draft
 * stock, and from there the NBA half plays exactly as it always has.
 */
const AGE_HS = 15;
/* A sophomore's ratings sit around this, and his ceiling is drawn from this
   range, skewed low by the exponent. Fitted so the road arrives at draft night
   where the backgrounds do. See check-career section 8. */
const ROAD_BASE = 38;
const ROAD_POT = [66, 95, 1.6];
const HS_GAMES = 26;
const HS_ROUNDS = ['Sectional', 'Regional', 'State semifinal', 'State final'];
const NCAA_ROUNDS = ['First Round', 'Second Round', 'Sweet 16', 'Elite Eight', 'Final Four', 'National Championship'];
const NCAA_SHORT = ['R64', 'R32', 'Sweet 16', 'Elite Eight', 'Final Four', 'Title game'];
/* What a starter looks like at each level, on the league's scale. */
const HS_BAR = { 15: 32, 16: 34, 17: 36 };
const COL_BAR = 48;
const PRO_BAR = 52;
const GRADE = { 10: 'sophomore', 11: 'junior', 12: 'senior' };
const CYEAR = { 1: 'freshman', 2: 'sophomore', 3: 'junior', 4: 'senior' };
/* The amateur half of the growth curve. Slower per summer than the league's
   GROW, because there are more of them before anybody is paid. */
const GROW_AM = { 15: 0.12, 16: 0.12, 17: 0.12, 18: 0.12, 19: 0.11, 20: 0.1, 21: 0.09, 22: 0.08 };

const HOMETOWNS = ['Baltimore', 'Chicago', 'Houston', 'Atlanta', 'Oakland', 'Philadelphia', 'Dallas',
  'Indianapolis', 'Memphis', 'Seattle', 'Detroit', 'Brooklyn', 'Charlotte', 'Milwaukee', 'Phoenix',
  'New Orleans', 'Akron', 'Gary', 'Newark', 'Minneapolis', 'Raleigh', 'Las Vegas', 'Louisville', 'Compton'];
const HS_SUFFIX = ['Central', 'North', 'East', 'West', 'South', 'Tech', 'Catholic', 'Academy'];
const HS_COLORS = [['#7a1f2b', '#f2c14e'], ['#0b3d91', '#ffffff'], ['#1c5f3a', '#f5f5f5'], ['#4b2a83', '#f2c14e'],
  ['#1a1a1a', '#d64545'], ['#c8102e', '#ffffff'], ['#00577a', '#f7a800'], ['#5a2d0c', '#f0e6d2']];

/* Name, tier, conference, colours. */
const SCHOOLS = [
  ['Kentucky', 'blue', 'SEC', '#0033a0', '#ffffff'], ['Duke', 'blue', 'ACC', '#003087', '#ffffff'],
  ['Kansas', 'blue', 'Big 12', '#0051ba', '#e8000d'], ['North Carolina', 'blue', 'ACC', '#7bafd4', '#13294b'],
  ['UCLA', 'blue', 'Big Ten', '#2d68c4', '#f2a900'],
  ['UConn', 'power', 'Big East', '#000e2f', '#ffffff'], ['Gonzaga', 'power', 'WCC', '#002967', '#c8102e'],
  ['Arizona', 'power', 'Big 12', '#cc0033', '#ffffff'], ['Michigan State', 'power', 'Big Ten', '#18453b', '#ffffff'],
  ['Houston', 'power', 'Big 12', '#c8102e', '#ffffff'], ['Villanova', 'power', 'Big East', '#00205b', '#13b5ea'],
  ['Baylor', 'power', 'Big 12', '#154734', '#ffb81c'], ['Texas', 'power', 'SEC', '#bf5700', '#ffffff'],
  ['Indiana', 'power', 'Big Ten', '#990000', '#eeedeb'], ['Arkansas', 'power', 'SEC', '#9d2235', '#ffffff'],
  ['Auburn', 'power', 'SEC', '#0c2340', '#e87722'], ['Tennessee', 'power', 'SEC', '#ff8200', '#ffffff'],
  ['Purdue', 'power', 'Big Ten', '#000000', '#cfb991'], ['Alabama', 'power', 'SEC', '#9e1b32', '#ffffff'],
  ['Florida', 'power', 'SEC', '#0021a5', '#fa4616'], ['Michigan', 'power', 'Big Ten', '#00274c', '#ffcb05'],
  ['Louisville', 'power', 'ACC', '#ad0000', '#ffffff'], ['Syracuse', 'power', 'ACC', '#f76900', '#000e54'],
  ['Marquette', 'power', 'Big East', '#003366', '#ffcc00'], ['Creighton', 'power', 'Big East', '#005ca9', '#ffffff'],
  ['Virginia', 'power', 'ACC', '#232d4b', '#f84c1e'], ['Iowa State', 'power', 'Big 12', '#c8102e', '#f1be48'],
  ['Memphis', 'power', 'AAC', '#003087', '#898d8d'], ['Butler', 'power', 'Big East', '#13294b', '#ffffff'],
  ['Dayton', 'mid', 'A-10', '#ce1141', '#004b8d'], ["Saint Mary's", 'mid', 'WCC', '#06315b', '#d80024'],
  ['VCU', 'mid', 'A-10', '#000000', '#f8b800'], ['San Diego State', 'mid', 'Mountain West', '#a6192e', '#000000'],
  ['Davidson', 'mid', 'A-10', '#ac1a2f', '#ffffff'], ['Wichita State', 'mid', 'AAC', '#000000', '#ffcd00'],
  ['Loyola Chicago', 'mid', 'A-10', '#7a0019', '#ffc72c'], ['Drake', 'mid', 'MVC', '#004477', '#ffffff'],
  ['New Mexico', 'mid', 'Mountain West', '#ba0c2f', '#a7a8aa'], ['Utah State', 'mid', 'Mountain West', '#0f2439', '#ffffff'],
  ['Florida Atlantic', 'mid', 'AAC', '#003366', '#cc0000'], ['Belmont', 'mid', 'MVC', '#002469', '#c8102e'],
  ['Murray State', 'low', 'MVC', '#002144', '#ecac00'], ['Oral Roberts', 'low', 'Summit', '#002f6c', '#c5b783'],
  ['Weber State', 'low', 'Big Sky', '#492f92', '#ffffff'], ['Montana', 'low', 'Big Sky', '#70003c', '#999999'],
  ['Lehigh', 'low', 'Patriot', '#653600', '#ffffff'], ['Vermont', 'low', 'America East', '#154734', '#ffd100'],
  ['Furman', 'low', 'SoCon', '#582c83', '#ffffff'], ['Grand Canyon', 'low', 'WAC', '#522398', '#ffffff'],
  ['Yale', 'low', 'Ivy', '#00356b', '#ffffff'], ['Princeton', 'low', 'Ivy', '#e77500', '#000000'],
  ['Colgate', 'low', 'Patriot', '#821019', '#ffffff'],
].map(([name, tier, conf, c1, c2]) => ({ name, tier, conf, c1, c2 }));
const SCHOOL_BY = {};
for (const s of SCHOOLS) SCHOOL_BY[s.name] = s;
/* Points per hundred better than an average Division I team. */
const TIER_NET = { blue: 14, power: 9, mid: 3, low: -4 };
const TIER_NAME = { blue: 'Blue blood', power: 'Power conference', mid: 'Mid-major', low: 'Small conference' };
const TIER_RANK = { blue: 0, power: 1, mid: 2, low: 3 };
const CONF_NET = {};
{
  const sum = {}, n = {};
  for (const s of SCHOOLS) { sum[s.conf] = (sum[s.conf] || 0) + TIER_NET[s.tier]; n[s.conf] = (n[s.conf] || 0) + 1; }
  for (const c in sum) CONF_NET[c] = sum[c] / n[c] - 2;
}

const isAm = (L) => !!(L.am && L.stage !== 'nba');
/* This season's strength for a college, the same all year. */
function schoolNet(L, name) {
  const s = SCHOOL_BY[name];
  if (!s) return 0;
  return round1(TIER_NET[s.tier] + norm(rngAt(L, 'sch:' + name)) * 2.5);
}

// ── the recruiting class ──

/* Where the class has you. The score is read against your age, so a junior is
   ranked against juniors, and the curve is fitted so a future pro is most
   often a four-star and about one in eight is a five. */
function recruitScore(L) {
  return (ovrOf(L) - (L.age - AGE_HS) * 5.2) * 0.7 + L.pot * 0.55 + L.m.fame * 0.03 + ((L.am && L.am.rstock) || 0);
}
function nationalRank(L) {
  const s = recruitScore(L);
  return clamp(Math.round(900 / (1 + Math.exp((s - 63) / 5.6))), 1, 900);
}
const starsOf = (rank) => rank <= 25 ? 5 : rank <= 150 ? 4 : rank <= 350 ? 3 : 2;
function rankText(rank) {
  return rank > 600 ? 'Unranked' : '#' + rank + ' in the class · ' + starsOf(rank) + ' stars';
}

function collegeOffers(L, tag) {
  const rank = L.am.rank;
  const rng = rngAt(L, 'offers:' + (tag || ''));
  const W = rank <= 25 ? { blue: 6, power: 3, mid: 0.1, low: 0 }
    : rank <= 80 ? { blue: 1.4, power: 4, mid: 1, low: 0 }
      : rank <= 200 ? { blue: 0.12, power: 3, mid: 3, low: 0.5 }
        : rank <= 400 ? { blue: 0, power: 0.6, mid: 3, low: 3 }
          : { blue: 0, power: 0.05, mid: 1, low: 4 };
  const pool = SCHOOLS.filter((s) => s.name !== L.am.college);
  const out = [];
  while (out.length < 4 && pool.length) {
    const s = weighted(rng, pool, (x) => W[x.tier]);
    if (!s) break;
    pool.splice(pool.indexOf(s), 1);
    out.push(s.name);
  }
  return out.sort((a, b) => TIER_RANK[SCHOOL_BY[a].tier] - TIER_RANK[SCHOOL_BY[b].tier]);
}
function schoolHint(L, name) {
  const s = SCHOOL_BY[name];
  const bar = COL_BAR + (TIER_NET[s.tier] - 3) * 0.35;
  const d = ovrOf(L) + 4 - bar;
  const role = d >= 10 ? 'Starts from day one' : d >= 4 ? 'Fights for a starting spot' : d >= -2 ? 'Comes off the bench' : 'Waits his turn';
  return TIER_NAME[s.tier] + ', ' + s.conf + '. ' + role + '.';
}

// ── an amateur season ──

function newAmSeason(L, lvl) {
  const school = lvl === 'hs' ? L.am.hs.name : lvl === 'col' ? L.am.college : L.am.proTeam;
  L.season = {
    amateur: true, lvl, year: L.year, team: null, school, g: 0, w: 0, l: 0, gp: 0,
    tot: { min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fga: 0, fgm: 0, tpa: 0, tpm: 0, fta: 0, ftm: 0 },
    hi: { pts: 0, reb: 0, ast: 0 }, out: 0, injury: null,
    mods: { min: 0, usage: 0, perf: 0, win: 0, risk: 0, rest: 0 },
    used: {}, acts: {}, allstar: false, awards: [], po: null, notes: [], role: null,
    startOvr: ovrOf(L), startTeam: null, asked: {}, conf: { w: 0, l: 0 }, tourney: null, seed: null, qual: false, finish: '',
  };
}
const levelBar = (L) => {
  const s = L.season;
  if (!s || s.lvl === 'hs') return HS_BAR[L.age] || 36;
  return s.lvl === 'col' ? COL_BAR : PRO_BAR;
};
function teamNetAm(L) {
  const s = L.season;
  const base = s.lvl === 'hs' ? L.am.hs.net : s.lvl === 'col' ? schoolNet(L, L.am.college) : L.am.proNet || 0;
  return base + s.mods.win;
}
/* The bar to start, which is higher at a better school. */
function amBar(L) {
  const s = L.season;
  if (s.lvl === 'hs') return levelBar(L) + L.am.hs.net * 0.5;
  if (s.lvl === 'col') return COL_BAR + (schoolNet(L, L.am.college) - 3) * 0.35;
  return PRO_BAR + (L.am.proNet || 0) * 0.3;
}
function amRole(L) {
  const s = L.season;
  const diff = effOvr(L) - amBar(L);
  let min;
  if (s.lvl === 'hs') min = diff >= 8 ? 30 : diff >= 3 ? 25 : diff >= -2 ? 17 : 9;
  else min = diff >= 12 ? 34 : diff >= 7 ? 31 : diff >= 2 ? 27 : diff >= -3 ? 20 : diff >= -8 ? 12 : 6;
  min += (L.m.trust - 50) * 0.05 + s.mods.min;
  min = clamp(min, 3, s.lvl === 'hs' ? 32 : 37);
  const starter = min >= (s.lvl === 'hs' ? 22 : 24);
  const label = diff >= 10 && starter ? 'Go-to player' : starter ? 'Starter' : min >= 14 ? 'Sixth man' : 'Bench';
  return { min: round1(min), diff, label, starter };
}
function amImpact(L, min) {
  const s = L.season;
  const per = s.lvl === 'hs' ? 32 : 40;
  return (effOvr(L) - levelBar(L)) * (s.lvl === 'hs' ? 0.3 : 0.32) * (min / per);
}
const amP = (diff, home, lvl) => clamp(0.5 + diff * (lvl === 'hs' ? 0.035 : 0.028) + (home ? 0.04 : -0.04), 0.04, 0.96);

/* The man's per-game means at this level. Points come off how far above the
   level he is, less a little for a deep school, plus who he is as a player. */
function amMeans(L, min) {
  const s = L.season, r = L.rt, a = ARCHES[L.arch];
  const lvl = s.lvl;
  const per = lvl === 'hs' ? 30 : 33;
  const k = min / per;
  const rel = effOvr(L) - levelBar(L) - (lvl === 'hs' ? L.am.hs.net : lvl === 'col' ? schoolNet(L, L.am.college) - 3 : 0) * 0.25;
  const pts = clamp((lvl === 'hs' ? 3 : 4) + rel * (lvl === 'hs' ? 1.1 : 1.05) + a.usage * 60, 0.5, lvl === 'hs' ? 34 : 26) * k;
  const scoring = r.sho * 0.55 + r.fin * 0.45;
  const ts = clamp(0.48 + rel * 0.004 + (scoring - 55) * 0.002, 0.42, 0.66);
  const tsa = pts / (2 * ts);
  const fta = tsa * 0.28, fga = tsa - 0.44 * fta;
  const threeShare = clamp(0.18 + (r.sho - 50) * 0.008 + a.three, 0.02, 0.6);
  const tpa = fga * threeShare;
  const tpp = clamp(0.28 + (r.sho - 50) * 0.003, 0.2, 0.45);
  const ftp = clamp(0.6 + (r.sho - 45) * 0.005, 0.5, 0.9);
  const posReb = { PG: 3.6, SG: 4.2, SF: 5.6, PF: 7.2, C: 8.4 }[L.pos];
  const reb = Math.max(1, posReb + (r.reb - 50) * 0.13 + rel * 0.1) * k;
  const ast = Math.max(0.7, 1.6 + (r.pla - 40) * 0.12 + rel * 0.04) * k;
  const stl = Math.max(0.1, 0.6 + (r.def - 50) * 0.02 + rel * 0.02) * k;
  const big = { PG: 0.2, SG: 0.25, SF: 0.45, PF: 0.8, C: 1.2 }[L.pos] + (L.arch === 'anchor' ? 0.6 : 0);
  const blk = Math.max(0.05, big + (r.def - 50) * 0.02 * big + rel * 0.02 * big) * k;
  return { pts, fga, tpa, tpp, fta, ftp, reb, ast, stl, blk };
}
/* One game's line, drawn and added to the season. Returns the points. */
function amLine(L, rng, mean, k) {
  const s = L.season, T = s.tot;
  const ptsMean = mean.pts * k;
  const pts0 = Math.max(0, Math.round(ptsMean + norm(rng) * ptsMean * 0.32));
  const reb = Math.max(0, Math.round(mean.reb * k + norm(rng) * mean.reb * 0.32));
  const ast = Math.max(0, Math.round(mean.ast * k + norm(rng) * mean.ast * 0.34));
  const stl = Math.max(0, Math.round(mean.stl * k + norm(rng) * 0.8));
  const blk = Math.max(0, Math.round(mean.blk * k + norm(rng) * 0.7));
  const tpa = Math.max(0, Math.round(mean.tpa * k + norm(rng) * 1.2));
  const tpm = Math.min(tpa, Math.max(0, Math.round(tpa * mean.tpp + norm(rng) * 0.9)));
  const fta = Math.max(0, Math.round(mean.fta * k + norm(rng) * 1.3));
  const ftm = Math.min(fta, Math.round(fta * mean.ftp));
  const twom = Math.max(0, Math.round((pts0 - ftm - 3 * tpm) / 2));
  const fga = Math.max(tpa + twom, Math.round(mean.fga * k + norm(rng) * 1.8));
  const pts = ftm + 3 * tpm + 2 * twom;
  T.pts += pts; T.reb += reb; T.ast += ast; T.stl += stl; T.blk += blk;
  T.fga += fga; T.fgm += tpm + twom; T.tpa += tpa; T.tpm += tpm; T.fta += fta; T.ftm += ftm;
  s.gp++;
  if (pts > s.hi.pts) s.hi.pts = pts;
  if (reb > s.hi.reb) s.hi.reb = reb;
  if (ast > s.hi.ast) s.hi.ast = ast;
  if (pts >= 10 && reb >= 10 && ast >= 10) L.am.tripleDoubles = (L.am.tripleDoubles || 0) + 1;
  return pts;
}
/* A stretch of games. `opp(rng, i)` is the other side's strength. */
function amGames(L, n, opp, tag, beats, conf) {
  const s = L.season;
  const rng = rngAt(L, 'am:' + tag);
  const role = amRole(L);
  s.role = role;
  const mean = amMeans(L, role.min);
  const us0 = teamNetAm(L);
  for (let i = 0; i < n; i++) {
    const g = s.g + 1;
    const hurt = s.injury && g >= s.injury.from && g < s.injury.until;
    const rest = !hurt && s.mods.rest > 0 && rng() < s.mods.rest;
    let us = us0;
    if (!hurt && !rest) {
      const mn = role.min * (0.86 + rng() * 0.28);
      s.tot.min += mn;
      const p = amLine(L, rng, mean, mn / role.min);
      if (p > (L.am.high || 0)) {
        L.am.high = p;
        if (p >= (s.lvl === 'hs' ? 40 : 32)) beats.push({ kind: 'game', text: 'A career high: ' + p + ' points.', tone: 'gold' });
      }
      us += amImpact(L, mn);
    } else s.out++;
    const o = opp(rng, i);
    const won = rng() < amP(us - o, i % 2 === 0, s.lvl);
    s.g = g;
    if (won) s.w++; else s.l++;
    if (conf) { if (won) s.conf.w++; else s.conf.l++; }
  }
  bump(L, { health: -Math.round(role.min * 0.08 * n / 15) });
}
function amInjury(L, tag, beats) {
  const s = L.season;
  if (s.injury && s.injury.until > s.g) return;
  const rng = rngAt(L, 'aminj:' + tag);
  const p = 0.05 + (100 - L.dur) * 0.0008 + Math.max(0, 60 - L.m.health) * 0.0015 + s.mods.risk;
  if (rng() >= p) return;
  const major = rng() < 0.12;
  const kind = major ? pick(rng, ['broken foot', 'torn ligament in the thumb', 'stress fracture']) : pick(rng, ['sprained ankle', 'jammed finger', 'bruised hip', 'tight hamstring']);
  const g = major ? 8 + Math.floor(rng() * 10) : 1 + Math.floor(rng() * 4);
  s.injury = { from: s.g + 1 + Math.floor(rng() * 4), until: 0, kind };
  s.injury.until = s.injury.from + g;
  bump(L, { health: major ? -14 : -5 });
  beats.push({ kind: 'injury', text: 'A ' + kind + ' costs you ' + g + (g === 1 ? ' game.' : ' games.'), tone: 'bad' });
  logIt(L, 'Missed ' + g + (g === 1 ? ' game' : ' games') + ' with a ' + kind + '.', 'bad');
}

// ── tournaments ──

const POD = [[1, 16, 8, 9], [5, 12, 4, 13], [6, 11, 3, 14], [7, 10, 2, 15]];
const seedNet = (s) => 17 - s * 1.25;
function ncaaOppSeed(rng, s, r) {
  if (r === 0) return 17 - s;
  const pod = POD.findIndex((p) => p.indexOf(s) >= 0);
  if (r === 1) {
    const p = POD[pod], i = p.indexOf(s);
    const other = i < 2 ? [p[2], p[3]] : [p[0], p[1]];
    other.sort((a, b) => a - b);
    return rng() < 0.68 ? other[0] : other[1];
  }
  if (r === 2) {
    const adj = POD[pod ^ 1].slice().sort((a, b) => a - b);
    return rng() < 0.62 ? adj[0] : adj[1 + Math.floor(rng() * 3)];
  }
  const pool = r === 3 ? POD[pod < 2 ? 2 : 0].concat(POD[pod < 2 ? 3 : 1]) : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  return weighted(rng, pool, (x) => 1 / Math.pow(x, r === 3 ? 1.3 : 2));
}
function oppSchool(L, rng, seed) {
  const want = seed <= 4 ? ['blue', 'power'] : seed <= 10 ? ['power', 'mid'] : ['mid', 'low'];
  const pool = SCHOOLS.filter((s) => s.name !== L.am.college && want.indexOf(s.tier) >= 0);
  return pick(rng, pool).name;
}
function hsOpp(L, rng) {
  return pick(rng, HOMETOWNS.filter((t) => t !== L.am.town)) + ' ' + pick(rng, HS_SUFFIX);
}
/* Single elimination, a round at a time up to `upto`. The first close game of a
   run, if you are on the floor for it, is a last possession and it is yours. */
function runTourney(L, beats) {
  const s = L.season, t = s.tourney;
  while (t.alive && !t.done && t.r < t.upto && !t.waiting) {
    const rng = rngAt(L, 'tg:' + t.kind + ':' + t.r);
    let opp, oNet, oSeed = null;
    if (t.kind === 'hs') { opp = hsOpp(L, rng); oNet = [-0.5, 1, 2.5, 3.5][t.r] + norm(rng) * 2; }
    else { oSeed = ncaaOppSeed(rng, t.seed, t.r); opp = oppSchool(L, rng, oSeed); oNet = seedNet(oSeed) + norm(rng) * 1.5; }
    const role = s.role || amRole(L);
    const playing = !(s.injury && s.injury.until > s.g + 1);
    const mn = Math.min(36, role.min + 2);
    let us = teamNetAm(L);
    let pts = null;
    if (playing) { pts = amLine(L, rng, amMeans(L, mn), 1); s.tot.min += mn; us += amImpact(L, mn); }
    const p = amP(us - oNet, t.kind === 'hs' && t.r < 2, s.lvl);
    const u = rng();
    s.g++;
    const g = { r: t.r, opp, seed: oSeed, net: oNet, pts };
    if (playing && role.starter && !t.clutched && Math.abs(u - p) < 0.07) {
      t.clutched = true;
      t.waiting = true;
      t.cur = g;
      L.pending.push(amClutchCard(L, t, g));
      return;
    }
    endTourneyGame(L, t, g, u < p, beats);
  }
}
function endTourneyGame(L, t, g, won, beats) {
  const s = L.season;
  const names = t.kind === 'hs' ? HS_ROUNDS : NCAA_ROUNDS;
  if (won) s.w++; else s.l++;
  t.games.push({ r: g.r, opp: g.opp, seed: g.seed, won, pts: g.pts });
  const who = (g.seed ? g.seed + ' seed ' : '') + g.opp;
  const yours = g.pts != null ? ' You score ' + g.pts + '.' : ' You watch from the bench.';
  const line = (won ? 'Beat ' : 'Lost to ') + who + ' in the ' + names[g.r] + '.' + yours;
  beats.push({ kind: 'po', text: line, tone: won ? 'good' : 'bad' });
  if (!won) { t.alive = false; t.done = true; logIt(L, (t.kind === 'hs' ? 'Out in the ' : 'Out of the tournament in the ') + names[g.r] + '.', 'bad'); return; }
  t.r++;
  if (t.r >= names.length) {
    t.done = true; t.champ = true;
    const txt = t.kind === 'hs' ? 'State champions.' : 'National champions.';
    beats.push({ kind: 'champ', text: txt, tone: 'gold' });
    logIt(L, (t.kind === 'hs' ? L.am.hs.name : L.am.college) + ': ' + txt, 'gold');
    bump(L, { fame: t.kind === 'hs' ? 6 : 12, morale: 12 });
  }
}
function amClutchCard(L, t, g) {
  const names = t.kind === 'hs' ? HS_ROUNDS : NCAA_ROUNDS;
  const opts = clutchOptions(L);
  return {
    id: 'amclutch', kind: 'clutch', key: 'amclutch:' + t.kind + ':' + g.r,
    eyebrow: names[g.r] + ' · ' + (g.seed ? g.seed + ' seed ' : '') + g.opp,
    title: 'Tied. Six seconds. Your ball.',
    text: (t.kind === 'hs' ? 'The whole town is in the gym.' : 'March. Every bracket in the country is watching.') + ' What is the play?',
    ctx: { r: g.r },
    options: opts.map((o) => ({ label: o.label, hint: RATING_NAME[o.rate] + ' ' + L.rt[o.rate] + '.' })),
  };
}

// ── the steps of a high school year ──

function hsRegular(L, beats) {
  const s = L.season;
  const role = amRole(L);
  s.role = role;
  beats.push({ kind: 'role', text: L.am.hs.name + ': ' + role.label + ', about ' + Math.round(role.min) + ' minutes a night.', tone: '' });
  amInjury(L, 'hs1', beats);
  amGames(L, 13, (r) => norm(r) * 3, 'hs1', beats, false);
  amInjury(L, 'hs2', beats);
  amGames(L, HS_GAMES - 13, (r) => norm(r) * 3 + 0.5, 'hs2', beats, false);
  s.qual = s.w >= 13;
  const pg = perGame(s);
  beats.unshift({ kind: 'record', text: s.w + '-' + s.l + (s.qual ? '. Into the state playoffs.' : '. No playoffs.'), tone: s.qual ? 'good' : 'bad' });
  beats.push({ kind: 'record', text: 'You: ' + pg.pts + ' points, ' + pg.reb + ' rebounds, ' + pg.ast + ' assists.', tone: '' });
  logIt(L, GRADE[L.am.grade][0].toUpperCase() + GRADE[L.am.grade].slice(1) + ' year: ' + s.w + '-' + s.l + ', ' + pg.pts + ' a night.', '');
  L.phase = 'hs_reg';
  queueEvents(L, 'hs', 1 + (rngAt(L, 'n:hs')() < 0.5 ? 1 : 0), AM_EVENTS);
}
function hsPlayoffs(L, beats) {
  const s = L.season;
  L.phase = 'hs_po';
  if (!s.qual) { closeAm(L, beats); return; }
  s.tourney = { kind: 'hs', r: 0, upto: 4, alive: true, done: false, games: [], clutched: false, waiting: false };
  runTourney(L, beats);
  if (s.tourney.done) closeAm(L, beats);
}

// ── the steps of a college year ──

function colStart(L, beats) {
  const s = L.season;
  const role = amRole(L);
  s.role = role;
  beats.push({ kind: 'role', text: L.am.college + ': ' + role.label + ', about ' + Math.round(role.min) + ' minutes a night.', tone: '' });
  amInjury(L, 'c1', beats);
  amGames(L, 12, (r) => -3 + norm(r) * 6, 'c1', beats, false);
  const pg = perGame(s);
  beats.push({ kind: 'record', text: 'Non-conference: ' + s.w + '-' + s.l + '. You: ' + pg.pts + ' points, ' + pg.reb + ' rebounds.', tone: s.w >= s.l ? 'good' : '' });
  L.phase = 'col_early';
  queueEvents(L, 'col', 1 + (rngAt(L, 'n:c1')() < 0.5 ? 1 : 0), AM_EVENTS);
}
function colConf(L, beats) {
  const s = L.season;
  const cn = CONF_NET[SCHOOL_BY[L.am.college].conf] || 0;
  amInjury(L, 'c2', beats);
  amGames(L, 19, (r) => cn + norm(r) * 4, 'c2', beats, true);
  const pg = perGame(s);
  beats.push({ kind: 'record', text: SCHOOL_BY[L.am.college].conf + ' play: ' + s.conf.w + '-' + s.conf.l + '. ' + s.w + '-' + s.l + ' overall. You: ' + pg.pts + ' a night.', tone: s.conf.w >= s.conf.l ? 'good' : '' });
  L.phase = 'col_mid';
  queueEvents(L, 'col', 1, AM_EVENTS);
}
/* The conference tournament, then Selection Sunday, then the awards. */
function colMarch(L, beats) {
  const s = L.season;
  const sc = SCHOOL_BY[L.am.college];
  const cn = CONF_NET[sc.conf] || 0;
  const rng = rngAt(L, 'conft');
  const role = s.role || amRole(L);
  let wins = 0, auto = false;
  for (let i = 0; i < 4; i++) {
    const us = teamNetAm(L) + amImpact(L, role.min);
    s.g++;
    if (!(s.injury && s.injury.until > s.g)) { amLine(L, rng, amMeans(L, role.min), 1); s.tot.min += role.min; }
    if (rng() < amP(us - (cn + i * 1.2 + norm(rng) * 2), false, 'col')) { s.w++; wins++; } else { s.l++; break; }
  }
  if (wins === 4) { auto = true; beats.push({ kind: 'po', text: sc.conf + ' tournament champions.', tone: 'gold' }); logIt(L, sc.conf + ' tournament champions.', 'good'); }
  else beats.push({ kind: 'po', text: 'Out of the ' + sc.conf + ' tournament after ' + (wins === 0 ? 'one game.' : wins + (wins === 1 ? ' win.' : ' wins.')), tone: '' });
  /* Selection Sunday. */
  const us = teamNetAm(L) + amImpact(L, role.min);
  const score = us + (s.w - s.l) * 0.12;
  let seed = Math.round(18 - score * 0.8);
  let inn = seed <= 11 || auto;
  if (auto) seed = Math.max(seed, sc.tier === 'low' ? 13 : seed);
  seed = clamp(seed, 1, 16);
  s.seed = inn ? seed : null;
  if (inn) {
    s.tourney = { kind: 'ncaa', seed, r: 0, upto: 0, alive: true, done: false, games: [], clutched: false, waiting: false };
    beats.push({ kind: 'record', text: 'Selection Sunday: a ' + seed + ' seed. ' + s.w + '-' + s.l + '.', tone: 'good' });
    logIt(L, 'Into the NCAA Tournament as a ' + seed + ' seed.', 'good');
  } else {
    beats.push({ kind: 'record', text: 'Selection Sunday: your name is not called. ' + s.w + '-' + s.l + '.', tone: 'bad' });
    logIt(L, 'Missed the NCAA Tournament.', 'bad');
  }
  colAwards(L, beats);
  L.phase = 'col_late';
}
function colAwards(L, beats) {
  const s = L.season, pg = perGame(s);
  const rng = rngAt(L, 'colaw');
  const rel = effOvr(L) - COL_BAR;
  const lg = (x) => 1 / (1 + Math.exp(-x));
  const out = [];
  const gpOk = s.gp >= 20;
  const sc = rel + pg.pts * 0.45 + norm(rng) * 1.5;
  if (gpOk && sc >= 30.5) out.push('c_aa1');
  else if (gpOk && sc >= 28) out.push('c_aa2');
  if (gpOk && sc >= 31.5 && rng() < 0.45) out.push('c_npoy');
  if (gpOk && pg.pts >= 13.5 && sc >= 22) out.push('c_allconf');
  if (gpOk && sc >= 25 && s.conf.w - s.conf.l >= 6 && rng() < 0.55) out.push('c_cpoy');
  if (gpOk && L.am.cyear === 1 && pg.pts >= 13 && rng() < lg((pg.pts - 17) * 0.45 + (rel - 12) * 0.2)) out.push('c_fr');
  for (const a of out) {
    s.awards.push(a);
    beats.push({ kind: 'award', text: AWARD_NAME[a] + '.', tone: 'gold' });
    logIt(L, AWARD_NAME[a] + '.', 'gold');
  }
  bump(L, { fame: out.length * 3 });
}
function colTourney(L, beats, upto) {
  const s = L.season, t = s.tourney;
  L.phase = 'col_po';
  t.upto = upto;
  runTourney(L, beats);
  if (t.done) closeAm(L, beats);
}

/* A year as a professional before the draft: overseas, or in the G League. */
function proYear(L, beats) {
  const route = L.am.route;
  L.am.proTeam = route === 'intl' ? 'Overseas' : 'G League';
  L.am.proNet = round1(norm(rngAt(L, 'pronet')) * 3);
  newAmSeason(L, 'pro');
  const s = L.season;
  const role = amRole(L);
  s.role = role;
  amInjury(L, 'pro', beats);
  amGames(L, 32, (r) => norm(r) * 3, 'pro', beats, false);
  const pg = perGame(s);
  const where = route === 'intl' ? 'A season overseas against grown men' : 'A season in the G League';
  beats.push({ kind: 'record', text: where + ': ' + pg.pts + ' points, ' + pg.reb + ' rebounds, ' + pg.ast + ' assists.', tone: 'good' });
  bump(L, { cash: route === 'intl' ? 0.5 : 0.6, iq: 2 });
  L.am.stock = (L.am.stock || 0) + 1 + Math.max(0, (pg.pts - 12) * 0.15);
  s.finish = route === 'intl' ? 'Pro' : 'G League';
  pushAmHist(L);
  developAm(L, beats);
  L.age++;
  L.year++;
  driftLeague(L);
  toDraft(L, beats, route);
}

// ── the end of an amateur season ──

function pushAmHist(L) {
  const s = L.season, pg = perGame(s);
  const lvl = s.lvl === 'hs' ? 'HS' : s.lvl === 'col' ? 'NCAA' : L.am.route === 'intl' ? 'Overseas' : 'G League';
  L.amHist.push(Object.assign({ y: s.year, age: L.age, lvl, school: s.school, ovr: ovrOf(L), w: s.w, l: s.l,
    finish: s.finish || '', seed: s.seed || null, rank: L.am.rank || null, aw: s.awards.slice() }, pg));
}
function developAm(L, beats) {
  const before = ovrOf(L);
  const rng = rngAt(L, 'develop');
  const gap = Math.max(0, L.pot - before);
  const eth = 0.65 + L.eth / 100 * 0.7;
  const grow = gap * (GROW_AM[L.age] || 0.08) * eth;
  for (const k of RATINGS) L.rt[k] = clamp(Math.round(L.rt[k] + grow * (0.6 + rng() * 0.8)), 25, 99);
  const after = ovrOf(L);
  if (after !== before) {
    const t = 'Up ' + (after - before) + ' overall this summer, to ' + after + '.';
    beats.push({ kind: 'dev', text: t, tone: 'good' });
    logIt(L, t, 'good');
  }
  bump(L, { health: 30 });
}
function closeAm(L, beats) {
  const s = L.season, pg = perGame(s);
  const rng = rngAt(L, 'amclose');
  const t = s.tourney;
  if (s.lvl === 'hs') {
    s.finish = t ? (t.champ ? 'State champion' : 'Lost in the ' + HS_ROUNDS[t.r].toLowerCase()) : 'No playoffs';
    if (t && t.champ) s.awards.push('hs_state');
    const sc = pg.pts + norm(rng) * 2.5;
    if (s.gp >= 18 && sc >= 19) s.awards.push('hs_allstate');
    if (s.gp >= 18 && L.am.grade >= 11 && pg.pts >= 22 && s.w >= 17 && rng() < 0.45) s.awards.push('hs_mrbb');
  } else {
    s.finish = !t ? 'No tournament' : t.champ ? 'National champion' : 'Lost in the ' + NCAA_ROUNDS[t.r];
    if (t && t.r >= 4) s.awards.push(t.champ ? 'c_champ' : 'c_f4');
    if (t && t.champ && s.role && s.role.starter && (s.role.diff >= 6 || rng() < 0.3)) s.awards.push('c_mop');
  }
  /* What the year did to the board. */
  const before = L.am.rank;
  if (s.lvl === 'hs') {
    L.am.rstock = clamp((L.am.rstock || 0) * 0.7 + clamp((pg.pts - 18) * 0.05, -0.6, 0.8) + (t && t.champ ? 0.5 : 0) + s.awards.length * 0.25, -3, 3);
  } else {
    let st = clamp((pg.pts - 12) * 0.12, -1, 1.6) + (t ? Math.min(t.r, 5) * 0.25 : -0.3);
    for (const a of s.awards) st += { c_aa1: 2, c_aa2: 1.2, c_npoy: 2, c_allconf: 0.4, c_cpoy: 0.6, c_fr: 0.8, c_f4: 0.4, c_champ: 0.8, c_mop: 1 }[a] || 0;
    /* The board reads the last season hardest, so stock decays. */
    L.am.stock = clamp((L.am.stock || 0) * 0.5 + st * 0.6, -3, 3.5);
  }
  const target = clamp((s.lvl === 'hs' ? 8 : 14) + (pg.pts - 10) * (s.lvl === 'hs' ? 1.1 : 1.8) + (t && t.champ ? 8 : 0), 3, 80);
  L.m.fame = clamp(Math.round(L.m.fame * 0.7 + target * 0.3 + (s.awards.length ? 2 : 0)), 0, 100);
  for (const a of s.awards) if (a !== 'hs_state' && a !== 'c_champ') {
    if (s.lvl === 'hs' || a === 'c_f4' || a === 'c_mop') { beats.push({ kind: 'award', text: AWARD_NAME[a] + '.', tone: 'gold' }); logIt(L, AWARD_NAME[a] + '.', 'gold'); }
  }
  pushAmHist(L);
  developAm(L, beats);
  /* Senior year's honour comes after the season and the summer's growth, on the
     final ranking. */
  if (s.lvl === 'hs') {
    L.am.rank = nationalRank(L);
    const d = before - L.am.rank;
    beats.push({ kind: 'rank', text: 'New rankings: ' + rankText(L.am.rank) + '.' + (Math.abs(d) >= 15 ? (d > 0 ? ' Up ' + d + ' spots.' : ' Down ' + (-d) + ' spots.') : ''), tone: d > 0 ? 'good' : d < -15 ? 'bad' : '' });
    if (L.am.grade === 12 && L.am.rank <= 24) {
      L.amHist[L.amHist.length - 1].aw.push('hs_aag');
      beats.push({ kind: 'award', text: AWARD_NAME.hs_aag + '.', tone: 'gold' });
      logIt(L, AWARD_NAME.hs_aag + '.', 'gold');
      bump(L, { fame: 6 });
    }
    L.phase = 'hs_off';
    hsOffCards(L, beats);
  } else {
    const proj = projectedPick(L, L.am.stock || 0);
    beats.push({ kind: 'rank', text: draftTalk(proj) + '.', tone: proj <= 14 ? 'good' : proj > 50 ? 'bad' : '' });
    L.phase = 'col_off';
    colOffCards(L);
  }
  queueEvents(L, s.lvl === 'hs' ? 'hs_off' : 'col_off', rngAt(L, 'n:off')() < 0.55 ? 1 : 0, AM_EVENTS);
}
function draftTalk(p) {
  if (p <= 3) return 'Mock drafts have you in the top three';
  if (p <= 14) return 'Mock drafts have you in the lottery, around ' + ordinal(p);
  if (p <= 30) return 'Mock drafts have you in the first round, around ' + ordinal(p);
  if (p <= 50) return 'Mock drafts have you in the second round';
  return 'You are not on the mock drafts yet';
}

// ── recruiting and the decisions between years ──

function hsOffCards(L) {
  const g = L.am.grade;
  if (g === 11 && !L.am.college) {
    const list = collegeOffers(L, 'jr');
    L.am.offers = list;
    L.pending.push({
      id: 'offers', kind: 'event', key: 'offers', eyebrow: 'Recruiting', title: 'The offers are in.',
      text: rankText(L.am.rank) + '. Commit now, or wait for senior year and hope the board moves your way.',
      ctx: { list },
      options: list.slice(0, 3).map((n) => ({ label: 'Commit to ' + n, hint: schoolHint(L, n), school: n }))
        .concat([{ label: 'Keep your options open', hint: 'Better offers if you play well. Worse if you do not.' }]),
    });
  } else if (g === 12) {
    if (L.am.college) {
      L.pending.push({
        id: 'signing', kind: 'event', key: 'signing', eyebrow: 'Signing day', title: 'The pen is on the table.',
        text: 'You committed to ' + L.am.college + '. ' + rankText(L.am.rank) + '.',
        options: [
          { label: 'Sign with ' + L.am.college, hint: 'You gave your word.' },
          { label: 'Reopen your recruitment', hint: 'See who else is out there.' },
        ],
      });
    } else L.pending.push(commitCard(L));
  }
}
function commitCard(L) {
  const list = collegeOffers(L, 'sr');
  L.am.offers = list;
  const opts = list.slice(0, 3).map((n) => ({ label: n, hint: schoolHint(L, n), school: n }));
  if (L.am.rank <= 90) opts.push({ label: 'Turn pro overseas', hint: 'Paid to play against men for a year. Then the draft.', route: 'intl' });
  if (L.am.rank <= 140) opts.push({ label: 'Sign with the G League', hint: 'A paycheck and NBA coaching. Then the draft.', route: 'gl' });
  return {
    id: 'commit', kind: 'event', key: 'commit', eyebrow: 'Decision day', title: 'Where are you going?',
    text: rankText(L.am.rank) + '. Hats on the table. The cameras are on.',
    ctx: { list }, options: opts,
  };
}
function colOffCards(L) {
  const cy = L.am.cyear;
  if (cy >= 4) { L.am.declared = true; return; }
  const proj = projectedPick(L, L.am.stock || 0);
  const next = CYEAR[cy + 1];
  L.pending.push({
    id: 'declare', kind: 'event', key: 'declare', eyebrow: 'The draft deadline', title: 'Stay or go?',
    text: draftTalk(proj) + '. You have until April to decide.',
    ctx: { proj },
    options: [
      { label: 'Declare for the draft', hint: proj <= 30 ? 'Get paid. Projected ' + ordinal(proj) + '.' : 'The second round, or worse. A gamble.' },
      { label: 'Come back for your ' + next + ' year', hint: 'Another year of growth and another March.' },
      { label: 'Enter the transfer portal', hint: 'A bigger role somewhere else.' },
    ],
  });
}
function portalCard(L) {
  const proj = projectedPick(L, L.am.stock || 0);
  const saveRank = L.am.rank;
  /* The portal reads you off what you just did, not what you were at 17. */
  L.am.rank = clamp(Math.round(proj * 5), 1, 700);
  const list = collegeOffers(L, 'portal' + L.am.cyear).filter((n) => n !== L.am.college).slice(0, 3);
  L.am.rank = saveRank;
  return {
    id: 'portal', kind: 'event', key: 'portal', eyebrow: 'Transfer portal', title: 'Your phone does not stop.',
    text: 'Three programs want you for next season.',
    ctx: { list },
    options: list.map((n) => ({ label: n, hint: schoolHint(L, n), school: n }))
      .concat([{ label: 'Stay at ' + L.am.college, hint: 'Pull your name out.' }]),
  };
}

/* The summer between, which is where an amateur year begins. */
function amNewYear(L, beats) {
  L.age++;
  L.year++;
  driftLeague(L);
  L.season = null;
  if (L.am.level === 'hs' && L.am.grade < 12) {
    L.am.grade++;
    beats.push({ kind: 'year', text: GRADE[L.am.grade][0].toUpperCase() + GRADE[L.am.grade].slice(1) + ' year. You are ' + L.age + '.', tone: '' });
    newAmSeason(L, 'hs');
    L.phase = 'hs_pre';
    L.pending.push(hsSummerCard(L));
    queueEvents(L, 'hs_sum', rngAt(L, 'n:sum')() < 0.55 ? 1 : 0, AM_EVENTS);
    return;
  }
  if (L.am.level === 'hs') {
    /* Out of high school. */
    if (L.am.route === 'intl' || L.am.route === 'gl') {
      L.am.level = 'pro';
      L.stage = 'pro';
      L.phase = 'pro_year';
      beats.push({ kind: 'year', text: L.am.route === 'intl' ? 'You sign overseas. You are ' + L.age + '.' : 'You sign with a G League team. You are ' + L.age + '.', tone: 'gold' });
      return;
    }
    L.am.level = 'col';
    L.stage = 'col';
    L.am.cyear = 1;
    beats.push({ kind: 'year', text: 'Freshman year at ' + L.am.college + '. You are ' + L.age + '.', tone: 'gold' });
    logIt(L, 'Enrolled at ' + L.am.college + '.', 'gold');
    colYear(L);
    return;
  }
  if (L.am.declared) { toDraft(L, beats, L.am.cyear === 1 ? 'oad' : 'senior'); return; }
  L.am.cyear++;
  beats.push({ kind: 'year', text: CYEAR[L.am.cyear][0].toUpperCase() + CYEAR[L.am.cyear].slice(1) + ' year at ' + L.am.college + '. You are ' + L.age + '.', tone: '' });
  colYear(L);
}
function colYear(L) {
  newAmSeason(L, 'col');
  L.phase = 'col_pre';
  L.pending.push(trainingCard(L));
  queueEvents(L, 'col_pre', rngAt(L, 'n:cpre')() < 0.65 ? 1 : 0, AM_EVENTS);
}

/* The road ends at the combine card a draft-night career starts on. */
function toDraft(L, beats, route) {
  L.stage = 'nba';
  L.bg = route === 'senior' ? 'senior' : route === 'intl' ? 'intl' : route === 'gl' ? 'gl' : 'oad';
  L.season = null;
  L.team = null;
  L.flags.stock = (L.flags.stock || 0) + (L.am.stock || 0);
  L.phase = 'combine';
  L.pending.push(combineCard(L));
  const t = 'You declare for the ' + (L.year - 1) + ' NBA Draft.';
  beats.push({ kind: 'year', text: t, tone: 'gold' });
  logIt(L, t, 'gold');
}

function hsSummerCard(L) {
  return {
    id: 'hs_summer', kind: 'event', key: 'hs_summer', eyebrow: 'Summer before ' + GRADE[L.am.grade] + ' year',
    title: 'How do you spend the summer?',
    text: 'You are ' + L.age + '. Overall ' + ovrOf(L) + '. ' + rankText(L.am.rank) + '.',
    options: [
      { label: 'The shoe circuit', hint: 'Travel team, big gyms, every scout. Hard on the body.' },
      { label: 'Skills trainer every day', hint: 'Get better at what you do.' },
      { label: 'Run with your high school team', hint: 'Chemistry, and the coach notices.' },
      { label: 'Rest and grow', hint: 'Sleep, eat, stretch.' },
    ],
  };
}

// ── the amateur cards ──

const AM_EVENTS = {
  grades: {
    phases: ['hs', 'col'], when: () => true, weight: () => 3,
    title: 'Your grades are slipping.',
    text: (L) => L.season && L.season.lvl === 'col' ? 'The academic advisor says one more bad test and you sit.' : 'Your coach says no grades, no games.',
    options: [
      { label: 'Study every night', run: (L) => { bump(L, { iq: 1, morale: -2, eth: 3 }); return 'You pass. Barely. Your mom frames the report card.'; } },
      { label: 'Get a tutor', run: (L) => { bump(L, { trust: 3, morale: 1 }); return 'Two nights a week. It works.'; } },
      { label: 'Wing it', run: (L, r) => { if (ok(r, 0.5)) { bump(L, { morale: 2 }); return 'You wing it. It works. This time.'; } bump(L, { rest: 0.12, trust: -6 }); return 'Academically ineligible. You sit three games.'; } },
    ],
  },
  mixtape: {
    phases: ['hs', 'hs_sum'], when: (L) => L.am && L.am.level === 'hs', weight: () => 3,
    title: 'Your mixtape hits a million views.',
    text: () => 'Somebody put your dunks to music. Your phone has not stopped since.',
    options: [
      { label: 'Post more', run: (L) => { bump(L, { fame: 8, trust: -3 }); L.am.rstock = (L.am.rstock || 0) + 0.5; return 'Every scout in the country has seen your left hand now.'; } },
      { label: 'Stay quiet', run: (L) => { bump(L, { trust: 4, iq: 1 }); return 'Your coach likes that you did not change.'; } },
      { label: 'Call out the top player in your class', run: (L, r) => { bump(L, { fame: 10 }); if (ok(r, 0.4 + (ovrOf(L) - 45) * 0.03)) { L.am.rstock = (L.am.rstock || 0) + 1; return 'He accepts. You cook him at a summer event. On camera.'; } L.am.rstock = (L.am.rstock || 0) - 0.8; bump(L, { morale: -6 }); return 'He accepts. He cooks you. Also on camera.'; } },
    ],
  },
  coach_son: {
    phases: ['hs'], when: (L) => L.am && L.am.grade <= 11 && L.season && L.season.role && L.season.role.diff < 9, weight: () => 3,
    title: "The coach's son plays your position.",
    text: () => 'He gets the last shot every time. Everybody knows why.',
    options: [
      { label: 'Outwork him', run: (L, r) => { bump(L, { eth: 5 }); if (ok(r, 0.55)) { bump(L, { min: 6, trust: 6 }); return 'By February you are starting. Nobody says a word.'; } return 'You get better. He still starts.'; } },
      { label: 'Talk to the coach', run: (L, r) => { if (ok(r, 0.4)) { bump(L, { min: 5 }); return 'He hears you. More minutes.'; } bump(L, { trust: -8 }); return 'He does not like being asked.'; } },
      { label: 'Let your dad handle it', run: (L) => { bump(L, { trust: -10, morale: 2 }); return 'Your dad handles it. Loudly. In the parking lot.'; } },
    ],
  },
  rival_school: {
    phases: ['hs'], when: () => true, weight: () => 2.5,
    title: 'Friday night. The crosstown rival.',
    text: () => 'Sold out by Tuesday. They have a kid ranked higher than you.',
    options: [
      { label: 'Guarantee a win', run: (L, r) => { bump(L, { fame: 5 }); if (ok(r, 0.35 + (ovrOf(L) - 40) * 0.02)) { bump(L, { morale: 8, win: 0.5 }); L.am.rstock = (L.am.rstock || 0) + 0.5; return 'You back it up. Thirty-four and the student section storms the court.'; } bump(L, { morale: -7 }); return 'They win. They play your quote over the speakers.'; } },
      { label: 'Let your game talk', run: (L, r) => { if (ok(r, 0.55)) { bump(L, { morale: 5, win: 0.3 }); return 'A quiet twenty-six. A win.'; } bump(L, { morale: -3 }); return 'Close loss. Next year.'; } },
      { label: 'Lock up their star', run: (L) => { bump(L, { def: 1, trust: 4, win: 0.3 }); return 'He goes four for nineteen. The scouts noticed who guarded him.'; } },
    ],
  },
  double_team: {
    phases: ['hs', 'col'], when: (L) => L.season && L.season.role && L.season.role.label === 'Go-to player', weight: () => 3,
    title: 'Every team sends two at you now.',
    text: () => 'Box-and-one. Triangle-and-two. Some coaches just foul you.',
    options: [
      { label: 'Find the open man', run: (L) => { bump(L, { pla: 2, win: 0.4, usage: -0.01 }); return 'Your teammates start hitting shots. The defenses stop.'; } },
      { label: 'Score through it', run: (L, r) => { if (ok(r, 0.5)) { bump(L, { fin: 1, fame: 4 }); return 'Forty against a box-and-one. They stop trying it.'; } bump(L, { morale: -4, health: -3 }); return 'You force it. A lot of bad shots.'; } },
      { label: 'Ask the coach for new sets', run: (L) => { bump(L, { iq: 2, trust: 3 }); return 'You run off screens now. It is harder to double a moving target.'; } },
    ],
  },
  prep_transfer: {
    phases: ['hs_sum'], once: true, when: (L) => L.am && L.am.grade <= 11 && L.am.rank <= 220, weight: () => 4,
    title: 'A national prep academy wants you.',
    text: () => 'Better players, a national schedule, every game on a stream. You would leave home.',
    options: [
      { label: 'Transfer', run: (L) => { L.am.hs = { name: L.am.town + ' Prep Academy', net: 4.5, c1: '#111111', c2: '#f2c14e' }; if (L.season) L.season.school = L.am.hs.name; logIt(L, 'Transferred to ' + L.am.hs.name + '.', 'gold'); bump(L, { fame: 6, morale: -6, trust: -10 }); L.am.rstock = (L.am.rstock || 0) + 0.6; return 'New school, new teammates, new country of scouts.'; } },
      { label: 'Stay home', run: (L) => { bump(L, { morale: 6, trust: 6 }); return 'Your town, your team. They paint your number on the gym wall.'; } },
    ],
  },
  growth: {
    phases: ['hs_sum'], once: true, when: (L) => L.am && L.age <= 16, weight: () => 2.5,
    title: 'You grew two inches since spring.',
    text: () => 'None of your shoes fit. Your coordination is a week behind your body.',
    options: [
      { label: 'Learn to play bigger', run: (L) => { bump(L, { reb: 3, fin: 2, def: 1, pot: 1 }); return 'Post moves, boxing out. A new game opens up.'; } },
      { label: 'Keep your guard skills', run: (L) => { bump(L, { pla: 2, sho: 1, ath: 1, pot: 1 }); return 'A big who can handle. Scouts love a mismatch.'; } },
    ],
  },
  camp_invite: {
    phases: ['hs_sum'], when: (L) => L.am && L.am.rank <= 120, weight: () => 3,
    title: 'The top hundred are invited to an elite camp.',
    text: () => 'Four days. Every college coach in the country in the bleachers.',
    options: [
      { label: 'Compete with everyone', run: (L, r) => { bump(L, { health: -4 }); if (ok(r, 0.35 + (ovrOf(L) - 42) * 0.025)) { L.am.rstock = (L.am.rstock || 0) + 1.2; bump(L, { fame: 5 }); return 'Camp MVP. Your ranking jumps.'; } L.am.rstock = (L.am.rstock || 0) - 0.4; return 'A rough week. The coaches saw it.'; } },
      { label: 'Go to learn', run: (L) => { bump(L, { iq: 2, def: 1 }); return 'You leave with a notebook full of things to fix.'; } },
      { label: 'Skip it and rest', run: (L) => { bump(L, { health: 6 }); return 'Fresh legs for the season.'; } },
    ],
  },
  street_agent: {
    phases: ['hs_off', 'hs_sum'], once: true, when: (L) => L.am && L.am.rank <= 100, weight: () => 2.5,
    title: 'A man in a nice car wants to help your family.',
    text: () => 'He says he is a friend of a friend. He has an envelope.',
    options: [
      { label: 'Tell him no', run: (L) => { bump(L, { morale: 2, trust: 2 }); return 'He leaves a card. You throw it out.'; } },
      { label: 'Take the envelope', run: (L) => { bump(L, { cash: 0.02, morale: 3 }); L.am.envelope = true; return 'Your family needs it. Nobody needs to know.'; } },
      { label: 'Tell your coach', run: (L) => { bump(L, { trust: 6 }); return 'Your coach makes a call. The car never comes back.'; } },
    ],
  },
  homecoming: {
    phases: ['hs'], when: () => true, weight: () => 1.5,
    title: 'Homecoming is the night before the big game.',
    text: () => 'Your friends are going. So is somebody you like.',
    options: [
      { label: 'Go', run: (L, r) => { bump(L, { morale: 8 }); if (ok(r, 0.6)) return 'Best night of the year. You still play well.'; bump(L, { health: -4, perf: -0.3 }); return 'Great night. Slow legs the next day.'; } },
      { label: 'Stay home and rest', run: (L) => { bump(L, { morale: -3, health: 3 }); return 'You hear about it all week.'; } },
    ],
  },
  class_skip: {
    phases: ['col'], when: () => true, weight: () => 2,
    title: 'You have missed three straight classes.',
    text: () => 'The professor emailed the athletic department.',
    options: [
      { label: 'Go to office hours', run: (L) => { bump(L, { iq: 1, trust: 2 }); return 'She is a big fan. You are fine.'; } },
      { label: 'Get notes from a teammate', run: (L) => { bump(L, { morale: 1 }); return 'The walk-on has perfect notes. You owe him.'; } },
      { label: 'Ignore it', run: (L, r) => { if (ok(r, 0.55)) return 'Nothing happens. You forget about it.'; bump(L, { rest: 0.1, trust: -6 }); return 'You are held out of two games.'; } },
    ],
  },
  freshman_wall: {
    phases: ['col'], when: (L) => L.am && L.am.cyear === 1, weight: () => 3,
    title: 'You hit the freshman wall.',
    text: () => 'Thirty games in. Your legs are gone. Practice is harder than high school games were.',
    options: [
      { label: 'Extra lifting', run: (L) => { bump(L, { ath: 1, reb: 1, health: -4 }); return 'Sore for a week. Stronger for March.'; } },
      { label: 'Sleep and eat', run: (L) => { bump(L, { health: 8, perf: 0.3 }); return 'Nine hours a night. You feel human again.'; } },
      { label: 'Push through it', run: (L, r) => { if (ok(r, 0.5)) { bump(L, { eth: 4 }); return 'You find a second wind.'; } bump(L, { health: -6, perf: -0.4 }); return 'It catches up with you in February.'; } },
    ],
  },
  nba_scouts: {
    phases: ['col'], when: (L) => L.am && L.am.stock > -2, weight: () => 2.5,
    title: 'Twelve NBA scouts at practice.',
    text: () => 'They sit in the corner with notebooks. Everybody knows who they came to see.',
    options: [
      { label: 'Show them everything', run: (L, r) => { if (ok(r, 0.5)) { L.am.stock = (L.am.stock || 0) + 0.8; return 'Your best practice of the year. Phones come out in the corner.'; } L.am.stock = (L.am.stock || 0) - 0.4; bump(L, { trust: -3 }); return 'You force it. The coach yells. The scouts write that down too.'; } },
      { label: 'Play your role', run: (L) => { bump(L, { trust: 4 }); L.am.stock = (L.am.stock || 0) + 0.3; return 'Scouts like a guy who fits. They note it.'; } },
    ],
  },
  rivalry_col: {
    phases: ['col'], when: () => true, weight: () => 2,
    title: 'Rivalry week. National TV.',
    text: () => 'The student section has been camping out since Monday.',
    options: [
      { label: 'Take over the game', run: (L, r) => { if (ok(r, 0.3 + (ovrOf(L) - 50) * 0.025)) { bump(L, { fame: 8, win: 0.3 }); L.am.stock = (L.am.stock || 0) + 0.6; return 'Thirty-one on national TV. The student section chants your name.'; } bump(L, { morale: -5 }); return 'They key on you. A loss.'; } },
      { label: 'Run the offense', run: (L) => { bump(L, { win: 0.4, trust: 3 }); return 'A team win. The coach mentions you first.'; } },
      { label: 'Talk trash before it', run: (L, r) => { bump(L, { fame: 5 }); if (ok(r, 0.5)) return 'You back it up. The clip runs all week.'; bump(L, { morale: -4, trust: -3 }); return 'They bring it up every time you touch the ball.'; } },
    ],
  },
  booster: {
    phases: ['col', 'col_pre'], once: true, when: (L) => L.am && L.am.level === 'col', weight: () => 1.8,
    title: 'A booster wants to give you a car.',
    text: () => 'Off the books. He says everybody does it.',
    options: [
      { label: 'Take the keys', run: (L, r) => { if (ok(r, 0.6)) { bump(L, { morale: 6 }); return 'Nice car. Nobody asks.'; } bump(L, { rest: 0.25, fame: 3, trust: -8 }); L.am.stock = (L.am.stock || 0) - 0.6; return 'Somebody asks. You sit for a third of the season.'; } },
      { label: 'Ask for a legal NIL deal instead', run: (L) => { bump(L, { cash: 0.08, morale: 2 }); return 'He sets one up. Same money, no problems.'; } },
      { label: 'Turn it down', run: (L) => { bump(L, { trust: 3 }); return 'You keep riding the bus.'; } },
    ],
  },
  nil_deal: {
    phases: ['col_pre'], when: (L) => L.am && L.am.level === 'col' && L.m.fame >= 15, weight: () => 4,
    title: 'An NIL collective wants a word.',
    text: (L) => 'They will pay ' + money(round1(0.05 + Math.pow(L.m.fame, 1.4) * 0.002)) + ' for the season. Appearances, posts, a billboard.',
    options: [
      { label: 'Sign it', run: (L) => { const c = round1(0.05 + Math.pow(L.m.fame, 1.4) * 0.002); bump(L, { cash: c, fame: 3, trust: -2 }); L.earned = round1(L.earned + c); return 'Your face is on a billboard by the highway.'; } },
      { label: 'Local businesses only', run: (L) => { const c = round1(0.02 + L.m.fame * 0.0008); bump(L, { cash: c, morale: 3 }); L.earned = round1(L.earned + c); return 'A pizza place and a car wash. The town loves it.'; } },
      { label: 'Focus on basketball', run: (L) => { bump(L, { trust: 4, iq: 1 }); return 'You leave the money. The coach notices.'; } },
    ],
  },
  roommate: {
    phases: ['col_pre'], once: true, when: (L) => L.am && L.am.cyear === 1, weight: () => 4,
    title: 'Your roommate is a walk-on from a farm town.',
    text: () => 'He has never been on a plane. He wakes up at five.',
    options: [
      { label: 'Start waking up at five too', run: (L) => { bump(L, { eth: 6, health: -2 }); return 'He becomes your rebounder at six every morning.'; } },
      { label: 'Show him the city', run: (L) => { bump(L, { morale: 6, trust: 2 }); return 'Best friends by October. He gives your speech at your wedding.'; } },
      { label: 'Ask for a single', run: (L) => { bump(L, { morale: 1, trust: -2 }); return 'Quiet. Lonely.'; } },
    ],
  },
  coach_leaves: {
    phases: ['col_off'], once: true, when: (L) => L.am && L.am.cyear <= 3, weight: () => 2,
    title: 'Your coach takes an NBA job.',
    text: () => 'He calls before the news breaks. He wants you to know first.',
    options: [
      { label: 'Wish him well', run: (L) => { L.m.trust = 50; bump(L, { morale: -3 }); return 'The new coach has a different system. You start over.'; } },
      { label: 'Ask him to put in a word with his new club', run: (L) => { L.m.trust = 50; L.am.stock = (L.am.stock || 0) + 0.6; return 'He says you are the best player he has coached. He means it.'; } },
    ],
  },
  investigation: {
    phases: ['col'], once: true, when: (L) => !!(L.am && L.am.envelope), weight: () => 8,
    title: 'A reporter is asking about an envelope.',
    text: () => 'Somebody talked. The school wants to hear it from you before the NCAA does.',
    options: [
      { label: 'Tell the truth', run: (L) => { L.am.envelope = false; bump(L, { rest: 0.2, trust: 4 }); return 'You sit nine games. The story is gone in a week.'; } },
      { label: 'Deny everything', run: (L, r) => { L.am.envelope = false; if (ok(r, 0.6)) return 'It goes away. You never talk about it again.'; bump(L, { rest: 0.35, fame: 4, trust: -10 }); L.am.stock = (L.am.stock || 0) - 1; return 'It does not go away. Half a season, and the whole country knows why.'; } },
    ],
  },
  summer_league: {
    phases: ['col_off', 'hs_off'], when: () => true, weight: () => 1.5,
    title: 'A pro-am league wants you this summer.',
    text: () => 'Outdoor court, real pros, a thousand people on the fence.',
    options: [
      { label: 'Play', run: (L, r) => { bump(L, { health: -3 }); if (ok(r, 0.5)) { bump(L, { fame: 6, iq: 1 }); return 'You drop forty on a guy with a ring. The video is everywhere.'; } bump(L, { iq: 1 }); return 'The pros teach you a lesson. A useful one.'; } },
      { label: 'Rest', run: (L) => { bump(L, { health: 5 }); return 'You watch from the fence.'; } },
    ],
  },
};

/* Answers to the road's own cards. Null means the card is not one of these. */
function chooseAm(L, card, i, opt, rng, beats) {
  switch (card.id) {
    case 'hs_summer': {
      if (i === 0) { bump(L, { fame: 5, health: -6, ath: 1 }); L.am.rstock = (L.am.rstock || 0) + 0.8; return { text: 'Twelve tournaments, four states, every scout. Your name is on the lists.', tone: 'good' }; }
      if (i === 1) {
        const focus = ARCHES[L.arch].tilt;
        const keys = Object.keys(focus).filter((k) => focus[k] > 0).slice(0, 2);
        const d = {};
        for (const k of keys) d[k] = 2 + Math.round(rng());
        d.eth = 3;
        bump(L, d);
        return { text: 'Five hundred shots a day. It shows in the first week.', tone: 'good' };
      }
      if (i === 2) { bump(L, { trust: 8, iq: 1, win: 0.6 }); return { text: 'Open gym every night. Your team is ready.', tone: 'good' }; }
      bump(L, { health: 12, dur: 2 }); return { text: 'You sleep ten hours a night and grow half an inch.', tone: '' };
    }
    case 'offers': {
      if (opt.school) {
        L.am.college = opt.school;
        bump(L, { morale: 6 });
        logIt(L, 'Committed to ' + opt.school + '.', 'gold');
        return { text: 'You pull on the hat. ' + opt.school + ' it is.', tone: 'gold' };
      }
      bump(L, { fame: 2 });
      return { text: 'You keep everybody waiting. Senior year decides it.', tone: '' };
    }
    case 'signing': {
      if (i === 0) { logIt(L, 'Signed with ' + L.am.college + '.', 'good'); return { text: 'Signed. ' + L.am.college + ' gets its ' + POS_NAME[L.pos].toLowerCase() + '.', tone: 'good' }; }
      L.am.college = null;
      L.pending.unshift(commitCard(L));
      bump(L, { fame: 3 });
      return { text: 'You decommit. Every coach who lost out calls back.', tone: '' };
    }
    case 'commit': {
      if (opt.route) {
        L.am.route = opt.route;
        L.am.college = null;
        logIt(L, opt.route === 'intl' ? 'Turned pro overseas out of high school.' : 'Signed with the G League out of high school.', 'gold');
        return { text: opt.route === 'intl' ? 'You sign a one-year deal overseas.' : 'You sign with the G League.', tone: 'gold' };
      }
      L.am.college = opt.school;
      L.am.route = 'college';
      logIt(L, 'Committed to ' + opt.school + '.', 'gold');
      bump(L, { morale: 6 });
      return { text: 'You pull on the hat. ' + opt.school + ' it is.', tone: 'gold' };
    }
    case 'declare': {
      if (i === 0) { L.am.declared = true; logIt(L, 'Declared for the draft.', 'gold'); return { text: 'You thank the fans. You hire an agent next week.', tone: 'gold' }; }
      if (i === 1) { bump(L, { trust: 6, morale: 2 }); return { text: 'One more year. The campus loses its mind.', tone: 'good' }; }
      L.pending.unshift(portalCard(L));
      return { text: 'Your name is in the portal by lunch.', tone: '' };
    }
    case 'portal': {
      if (opt.school) {
        const from = L.am.college;
        L.am.college = opt.school;
        L.m.trust = 50;
        logIt(L, 'Transferred from ' + from + ' to ' + opt.school + '.', 'gold');
        return { text: 'You transfer to ' + opt.school + '.', tone: 'gold' };
      }
      return { text: 'You pull your name out. You stay.', tone: '' };
    }
    case 'amclutch': {
      const o = clutchOptions(L)[i];
      const s = L.season, t = s.tourney;
      const made = rng() < o.p;
      t.waiting = false;
      if (made) { L.am.winners = (L.am.winners || 0) + 1; bump(L, { fame: 6, morale: 8 }); }
      else bump(L, { morale: -8 });
      const tx = made ? 'Good! You are going to remember that one for the rest of your life.' : 'No good. You sit on the floor for a long time.';
      logIt(L, (t.kind === 'hs' ? HS_ROUNDS : NCAA_ROUNDS)[t.cur.r] + ': ' + (made ? 'hit the winner.' : 'missed the last shot.'), made ? 'gold' : 'bad');
      endTourneyGame(L, t, t.cur, made, beats);
      t.cur = null;
      runTourney(L, beats);
      if (t.done) closeAm(L, beats);
      return { text: tx, tone: made ? 'gold' : 'bad' };
    }
  }
  return null;
}

function newRoad(L, rng) {
  const town = pick(rng, HOMETOWNS);
  const [c1, c2] = pick(rng, HS_COLORS);
  L.stage = 'hs';
  L.am = { level: 'hs', grade: 10, cyear: 0, town, hs: { name: town + ' ' + pick(rng, HS_SUFFIX), net: round1(norm(rng) * 2.5), c1, c2 },
    rank: 0, rstock: 0, stock: 0, college: null, route: null, declared: false, offers: [] };
  L.amHist = [];
  L.am.rank = nationalRank(L);
  L.phase = 'hs_pre';
  newAmSeason(L, 'hs');
  L.pending.push(hsSummerCard(L));
}

// ─── answering a card ───────────────────────────────────────────────────────

function choose(L, i) {
  const card = L.pending[0];
  if (!card) return null;
  const opt = card.options[i];
  if (!opt) return null;
  const rng = rngAt(L, 'pick:' + card.key + ':' + i);
  const before = snapshot(L);
  let text = '', tone = '', beats = [];
  L.pending.shift();
  const road = chooseAm(L, card, i, opt, rng, beats);
  if (road) { text = road.text; tone = road.tone; } else switch (card.id) {
    case 'combine': {
      const r = rng();
      if (i === 0) {
        const fit = (L.rt.ath + L.rt.sho) / 2;
        if (r < clamp(0.3 + (fit - 55) * 0.012, 0.15, 0.85)) { L.flags.stock = (L.flags.stock || 0) + 3; text = 'You test off the charts. Your phone blows up.'; tone = 'good'; }
        else { L.flags.stock = (L.flags.stock || 0) - 2.5; text = 'Average numbers. A few teams cool on you.'; tone = 'bad'; }
      } else if (i === 1) {
        if (r < clamp(0.35 + (L.rt.sho - 55) * 0.015, 0.1, 0.9)) { L.flags.stock = (L.flags.stock || 0) + 1.8; text = 'Forty-one of fifty. The room goes quiet.'; tone = 'good'; }
        else { L.flags.stock = (L.flags.stock || 0) - 1; text = 'Cold day. It happens. It gets noticed.'; tone = 'bad'; }
      } else { text = 'You stay home. Your stock does not move.'; }
      L.pending.unshift(workoutCard(L));
      break;
    }
    case 'workout': {
      const c = opt.club;
      const theirs = opt.slot;
      const proj = projectedPick(L);
      if (theirs < proj - 4) {
        if (rng() < 0.45) { L.flags.stock = (L.flags.stock || 0) + 2; L.flags.promise = { club: c, slot: theirs }; text = 'You blow them away. They promise to take you at ' + ordinal(theirs) + '.'; tone = 'gold'; }
        else { text = 'Good workout. They want somebody else at ' + ordinal(theirs) + '.'; }
      } else {
        L.flags.promise = { club: c, slot: theirs }; text = 'They love you. Promise made: if you are there, you are theirs.'; tone = 'good';
      }
      L.pending.unshift(agentCard());
      break;
    }
    case 'agent': {
      L.agent = opt.agent;
      text = AGENTS[L.agent].name + ' it is.';
      if (L.agent === 'cousin') bump(L, { morale: 8 });
      L.phase = 'draft';
      break;
    }
    case 'undrafted': {
      L.contract = { years: 1, total: 1, salary: round1(capFor(L.year) * MIN_PCT), kind: 'min', start: L.year };
      joinTeam(L, opt.club, false);
      L.draft = { pick: null, round: null, team: opt.club };
      text = 'Two-way deal with the ' + E.teamName(opt.club) + '. Prove it.'; tone = 'good';
      logIt(L, text, 'good');
      L.phase = 'drafted';
      openYear(L);
      break;
    }
    case 'training': {
      const t = TRAIN[i];
      const young = L.age <= 24 ? 1 : L.age <= 28 ? 0.8 : 0.6;
      if (t) {
        const d = {};
        for (const k in t) d[k] = Math.round(t[k] * young * (0.7 + rng() * 0.6));
        bump(L, d);
        text = 'A good summer. It shows in the first week of camp.'; tone = 'good';
      } else { bump(L, { health: 18 }); L.flags.restYears = (L.flags.restYears || 0) + 1; text = 'Fully rested. You feel twenty-two.'; tone = 'good'; }
      break;
    }
    case 'injury': {
      const s = L.season, inj = s && s.injury;
      const g = card.ctx.g;
      if (inj) {
        if (card.ctx.major) {
          if (i === 0) { inj.until = inj.from + g; bump(L, { ath: -2, health: -8 }); text = 'Surgery goes well. The rehab is long.'; }
          else if (i === 1) {
            if (rng() < 0.55) { inj.until = inj.from + Math.round(g * 0.6); bump(L, { health: -6 }); text = 'Back early. It holds.'; tone = 'good'; }
            else { inj.until = inj.from + Math.round(g * 1.3); bump(L, { ath: -4, health: -14, dur: -6 }); text = 'It does not hold. Now you need the surgery anyway.'; tone = 'bad'; }
          } else { bump(L, { cash: -Math.min(0.6, L.cash * 0.2) }); inj.until = inj.from + Math.round(g * 0.85); bump(L, { ath: -1 }); text = 'The specialist finds a better way. Out a little less.'; tone = 'good'; }
        } else if (i === 0) {
          if (rng() < 0.6) { inj.until = inj.from + Math.ceil(g / 2); bump(L, { trust: 4 }); text = 'Back in half the time. Tough.'; tone = 'good'; }
          else { inj.until = inj.from + g + 6; bump(L, { health: -8 }); text = 'Aggravated it. Out longer.'; tone = 'bad'; }
        } else { inj.until = inj.from + g; bump(L, { health: 6 }); text = 'You rest it. It heals right.'; }
        inj.pendingDecision = false;
        const missed = inj.until - inj.from;
        logIt(L, 'Out ' + missed + ' games with a ' + inj.kind + '.', 'bad');
      }
      break;
    }
    case 'allstar': {
      if (i === 0) {
        if (rng() < clamp((L.rt.ath - 60) * 0.025, 0.05, 0.85)) { L.flags.dunk = (L.flags.dunk || 0) + 1; bump(L, { fame: 10 }); text = 'You jump over a car. Dunk contest champion.'; tone = 'gold'; }
        else { bump(L, { fame: 2 }); text = 'Two misses on your best dunk. The judges are kind.'; }
      } else if (i === 1) {
        if (rng() < clamp((L.rt.sho - 65) * 0.025, 0.05, 0.85)) { L.flags.threes = (L.flags.threes || 0) + 1; bump(L, { fame: 8 }); text = 'The money ball rack. Three-point champion.'; tone = 'gold'; }
        else { bump(L, { fame: 2 }); text = 'Out in the first round. You laugh it off.'; }
      } else { bump(L, { health: 6 }); text = 'Sunday only. Fresh for the second half.'; }
      logIt(L, text, tone);
      break;
    }
    case 'clutch': {
      const o = clutchOptions(L)[i];
      const cur = L.season.po.cur;
      const made = rng() < o.p;
      cur.waiting = false;
      cur.games.push(made ? 1 : 0);
      if (made) { cur.w = 4; L.flags.g7 = (L.flags.g7 || 0) + 1; bump(L, { fame: 10, morale: 10 }); text = 'Good! Series over. You will be watching that one for the rest of your life.'; tone = 'gold'; }
      else { cur.l = 4; bump(L, { morale: -10 }); text = 'No good. The building goes silent.'; tone = 'bad'; }
      logIt(L, 'Game 7 against the ' + nick(cur.opp) + ': ' + (made ? 'hit the winner.' : 'missed the last shot.'), made ? 'gold' : 'bad');
      endSeries(L, beats);
      break;
    }
    case 'extension': {
      if (i === 0) {
        const yrs = card.ctx.years || 5;
        L.contract = { years: yrs + 1, total: yrs, salary: L.contract.salary, next: card.ctx.sal, kind: 'vet', start: L.year };
        text = 'Signed. ' + yrs + ' years, ' + money(card.ctx.sal) + ' a year.'; tone = 'gold';
        logIt(L, 'Signed an extension: ' + yrs + ' years, ' + money(card.ctx.sal) + ' a year.', 'gold');
        bump(L, { morale: 6, trust: 6 });
      } else { text = 'You bet on yourself.'; bump(L, { fame: 2 }); }
      break;
    }
    case 'fa': {
      const f = card.ctx.offers[i];
      const old = L.team;
      L.contract = { years: f.years, total: f.years, salary: f.salary, kind: 'vet', start: L.year + 1 };
      if (f.club !== old) joinTeam(L, f.club, false);
      text = (f.club === old ? 'Re-signed with the ' : 'Signed with the ') + E.teamName(f.club) + '. ' + f.years + ' years, ' + money(f.salary) + ' a year.';
      tone = 'gold';
      if (f.club === old) logIt(L, text, 'gold');
      bump(L, { morale: 5 });
      break;
    }
    case 'retire': {
      if (i === 1) { L.pending = []; retire(L, beats); text = 'You walk away.'; tone = 'gold'; }
      else { text = 'One more.'; bump(L, { morale: 3 }); }
      break;
    }
    case 'nooffer': {
      if (i === 0) { L.pending = []; retire(L, beats); text = 'You walk away.'; tone = 'gold'; }
      else {
        L.flags.overseas = (L.flags.overseas || 0) + 1;
        L.team = null;
        L.contract = { years: 1, total: 1, salary: 0.8, kind: 'overseas', start: L.year + 1 };
        text = 'A year in Europe. Big minutes. A second chance.';
        logIt(L, 'Signed overseas for a year.', '');
      }
      break;
    }
    default: {
      const ev = EVENTS[card.id] || AM_EVENTS[card.id];
      if (ev) {
        const o = ev.options[i];
        text = o.run(L, rng) || '';
      }
    }
  }
  const after = snapshot(L);
  const res = { card, picked: i, label: opt.label, text, tone, diff: diffOf(before, after), beats };
  L.last = { title: card.title, label: opt.label, text, tone, diff: res.diff };
  return res;
}

// ─── the step machine ───────────────────────────────────────────────────────

/* Where the career is, in words, for the button that moves it. */
function nextLabel(L) {
  if (L.retired) return null;
  if (L.pending.length) return null;
  switch (L.phase) {
    case 'draft': return 'Draft night';
    case 'drafted': case 'pre': return 'Tip off the season';
    case 'early': return 'Play to the All-Star break';
    case 'mid': return 'Play the stretch run';
    case 'late': return L.season && L.season.po && !L.season.po.out ? 'Start the playoffs' : 'Go to the summer';
    case 'po': return L.season.po.out ? 'Go to the summer' : 'Play the ' + (L.season.po.round === -1 ? 'play-in' : ROUNDS[L.season.po.round]);
    case 'off': return 'Next season';
    case 'hs_pre': return 'Play your ' + GRADE[L.am.grade] + ' season';
    case 'hs_reg': return L.season && L.season.qual ? 'Play the state playoffs' : 'Go to the summer';
    case 'hs_po': return 'Keep playing';
    case 'hs_off': return L.am.grade < 12 ? 'Next season' : L.am.route === 'intl' || L.am.route === 'gl' ? 'Turn pro' : 'Go to college';
    case 'col_pre': return 'Tip off the season';
    case 'col_early': return 'Play the conference season';
    case 'col_mid': return 'Conference tournament';
    case 'col_late': return L.season && L.season.tourney ? 'Play the first weekend' : 'Go to the summer';
    case 'col_po': return L.season.tourney.upto <= 2 ? 'Play the second weekend' : 'Go to the Final Four';
    case 'col_off': return L.am.declared ? 'Go to the draft combine' : 'Next season';
    case 'pro_year': return L.am.route === 'intl' ? 'Play the season overseas' : 'Play the G League season';
    default: return 'Continue';
  }
}

function step(L) {
  if (L.retired) return { beats: [] };
  if (L.pending.length) return { beats: [], blocked: true };
  const beats = [];
  L.steps++;
  switch (L.phase) {
    case 'combine':
      break;
    case 'draft':
      runDraft(L, beats);
      break;
    case 'drafted':
    case 'pre': {
      if (!L.team) {
        /* A year overseas: no NBA season. Straight to the summer. */
        overseasYear(L, beats);
        break;
      }
      if (!L.season) newSeason(L);
      const role = roleOf(L);
      L.season.role = role;
      beats.push({ kind: 'role', text: E.teamName(L.team) + ': ' + role.label + ', about ' + Math.round(role.min) + ' minutes a night.', tone: '' });
      playChunk(L, 'early', beats);
      beats.push(recordBeat(L, 'After 27'));
      rollInjury(L, 'mid', beats);
      L.phase = 'early';
      queueEvents(L, 'early', 1 + (rngAt(L, 'n:early')() < 0.6 ? 1 : 0));
      break;
    }
    case 'early':
      playChunk(L, 'mid', beats);
      beats.push(recordBeat(L, 'At the break'));
      rollInjury(L, 'late', beats);
      allStarCheck(L, beats);
      L.phase = 'mid';
      queueEvents(L, 'mid', 1 + (rngAt(L, 'n:mid')() < 0.5 ? 1 : 0));
      break;
    case 'mid': {
      playChunk(L, 'late', beats);
      const s = L.season;
      const st = standings(L);
      startPlayoffs(L, st);
      const aw = awards(L, st);
      for (const a of aw) {
        s.awards.push(a);
        beats.push({ kind: 'award', text: AWARD_NAME[a] + '.', tone: 'gold' });
        logIt(L, AWARD_NAME[a] + '.', 'gold');
        bump(L, { fame: a === 'mvp' ? 12 : 4 });
      }
      if (s.allstar) s.awards.push('star');
      const seedTxt = s.seed <= 6 ? ordinal(s.seed) + ' in the ' + confOf(L.team) + '.'
        : s.seed <= 10 ? ordinal(s.seed) + ' in the ' + confOf(L.team) + '. Play-in.' : ordinal(s.seed) + ' in the ' + confOf(L.team) + '. No playoffs.';
      beats.unshift({ kind: 'record', text: 'Final record ' + s.w + '-' + s.l + '. ' + seedTxt, tone: s.seed <= 6 ? 'good' : s.seed <= 10 ? '' : 'bad' });
      logIt(L, s.w + '-' + s.l + '. ' + seedTxt, s.seed <= 6 ? 'good' : '');
      pay(L, beats);
      L.phase = 'late';
      queueEvents(L, 'late', 1);
      break;
    }
    case 'late':
      L.phase = 'po';
      if (L.season.po.out) return step(L);
      playRound(L, beats);
      break;
    case 'po': {
      const po = L.season.po;
      if (po.out) { closeSeason(L, beats); L.phase = 'off'; offseason(L, beats); break; }
      playRound(L, beats);
      break;
    }
    case 'off':
      newYear(L, beats);
      break;
    case 'hs_pre': hsRegular(L, beats); break;
    case 'hs_reg': hsPlayoffs(L, beats); break;
    case 'hs_po': runTourney(L, beats); if (L.season.tourney.done) closeAm(L, beats); break;
    case 'hs_off': amNewYear(L, beats); break;
    case 'col_pre': colStart(L, beats); break;
    case 'col_early': colConf(L, beats); break;
    case 'col_mid': colMarch(L, beats); break;
    case 'col_late':
      if (L.season.tourney) colTourney(L, beats, 2);
      else closeAm(L, beats);
      break;
    case 'col_po': colTourney(L, beats, L.season.tourney.upto + 2); break;
    case 'col_off': amNewYear(L, beats); break;
    case 'pro_year': proYear(L, beats); break;
  }
  return { beats };
}
function recordBeat(L, when) {
  const s = L.season, pg = perGame(s);
  return { kind: 'record', text: when + ': ' + s.w + '-' + s.l + '. You: ' + pg.pts + ' points, ' + pg.reb + ' rebounds, ' + pg.ast + ' assists.', tone: s.w >= s.l ? 'good' : '' };
}
function pay(L, beats) {
  const c = L.contract;
  if (!c) return;
  const sal = c.salary;
  const fame = L.m.fame;
  const endorse = round1((fame > 45 ? Math.pow(fame - 45, 1.6) * 0.035 : 0) * AGENTS[L.agent].endorse
    * (BIG_MARKET[L.team] ? 1.3 : 1) + (L.endorseBonus || 0));
  L.endorse = endorse;
  L.earned = round1(L.earned + sal + endorse);
  L.cash = round1(L.cash + sal * (0.5 - AGENTS[L.agent].fee) + endorse * 0.55 - Math.min(L.cash * 0.08, 3));
  if (L.season) L.season.salary = sal;
}
function closeSeason(L, beats) {
  const s = L.season;
  if (!s) return;
  const pg = perGame(s);
  const po = s.po || { path: 'Missed' };
  const path = po.champ ? 'Champion' : po.path || 'Missed';
  if (L.flags.goldYear === L.year) s.awards.push('olympic');
  L.history.push(Object.assign({ y: s.year, age: L.age, t: s.team, ovr: ovrOf(L), w: s.w, l: s.l, seed: s.seed || null,
    po: path, aw: s.awards.slice(), sal: s.salary || 0, role: s.role ? s.role.label : '' }, pg));
  L.seasonsDone++;
  /* Fame settles toward what the season said. */
  const target = clamp(15 + (pg.pts - 8) * 2.2 + (s.allstar ? 12 : 0) + (po.champ ? 8 : 0), 5, 99);
  L.m.fame = clamp(Math.round(L.m.fame * 0.7 + target * 0.3 + (s.awards.length ? 3 : 0)), 0, 100);
  if (po.champ) bump(L, { morale: 10 });
  else if (s.w < s.l) bump(L, { morale: -6 });
  const bar = rotationBar(clubNet(L, L.team || s.team));
  L.m.trust = clamp(Math.round(L.m.trust * 0.7 + (55 + (effOvr(L) - bar) * 1.2) * 0.3), 0, 100);
}
function overseasYear(L, beats) {
  if (L.age >= 37) { retire(L, beats, 'Retired overseas at ' + L.age + '.'); return; }
  const rng = rngAt(L, 'overseas');
  const d = Math.round(1 + rng() * 2);
  for (const k of RATINGS) L.rt[k] = clamp(L.rt[k] + (L.age <= 28 ? d : -1), 25, 99);
  L.earned = round1(L.earned + 0.8);
  L.cash = round1(L.cash + 0.4);
  beats.push({ kind: 'overseas', text: 'A year in Europe. Twenty a night and a lot of pasta.', tone: '' });
  logIt(L, 'Played a season overseas.', '');
  L.season = null;
  L.contract = null;
  L.phase = 'off';
  /* Back on the market. */
  const list = offers(L);
  if (!list.length || L.age >= 34) {
    L.pending.push({
      id: 'nooffer', kind: 'event', key: 'nooffer2', eyebrow: 'Free agency', title: 'The NBA still is not calling.',
      text: 'Overall ' + ovrOf(L) + '. One more year away, or call it?',
      options: [{ label: 'Retire', hint: 'It was a career.' }, { label: 'Another year overseas', hint: 'Keep the dream alive.' }],
    });
  } else L.pending.push(faCard(L, list, 'back'));
}
function newYear(L, beats) {
  L.age++;
  L.year++;
  if (L.season) L.season = null;
  if (L.contract && L.contract.next && L.contract.years <= L.contract.total) {
    L.contract.salary = L.contract.next;
    delete L.contract.next;
  }
  if (L.contract && L.contract.years <= 0) L.contract = null;
  driftLeague(L);
  L.phase = 'pre';
  beats.push({ kind: 'year', text: 'The ' + (L.year - 1) + '-' + String(L.year).slice(2) + ' season. You are ' + L.age + '.', tone: '' });
  openYear(L);
}
/* A summer with a club: the season is opened now, so whatever happens before
   it (the training card, a summer event, a camp injury) lands on it. */
function openYear(L) {
  if (!L.team) return;
  newSeason(L);
  L.pending.push(trainingCard(L));
  if (L.seasonsDone > 0) queueEvents(L, 'pre', rngAt(L, 'n:pre')() < 0.6 ? 1 : 0);
  rollInjury(L, 'early', []);
}

// ─── things you can do between cards ────────────────────────────────────────

/* The BitLife half: what you do with a season that is not a card. Each is open
   once a season, costs what it says, and answers in one sentence. The coach and
   the trade are about basketball; the rest is what the money is for. */
const inSeason = (L) => !!(L.season && L.team && ['drafted', 'pre', 'early', 'mid'].indexOf(L.phase) >= 0);
const ACTS = {
  coach: {
    name: 'Talk to the coach', blurb: 'Ask for a bigger role.', cost: () => 0,
    when: (L) => inSeason(L),
    run(L, r) {
      const role = roleOf(L);
      const p = 0.25 + (L.m.trust - 50) * 0.012 + role.diff * 0.02;
      if (r() < clamp(p, 0.08, 0.85)) { bump(L, { min: 4, usage: 0.01, trust: 2 }); return 'He agrees. More minutes, more touches. Now earn them.'; }
      bump(L, { trust: -6, morale: -3 });
      return 'He says the role is the role. The meeting is short.';
    },
  },
  trade: {
    name: 'Request a trade', blurb: 'Ask out. It happens this summer.', cost: () => 0,
    when: (L) => !!(L.team && L.contract && L.contract.years >= 2 && !L.flags.tradeAsk && L.phase !== 'off'),
    run(L) { L.flags.tradeAsk = true; bump(L, { trust: -14, fame: 2 }); return 'Your agent makes the call. The front office says they will look at it.'; },
  },
  trainer: {
    name: 'Hire a personal trainer', blurb: 'Work ethic and durability.', cost: (L) => round1(0.25 + capFor(L.year) * 0.002),
    when: () => true,
    run(L) { bump(L, { eth: 5, dur: 2, health: 3 }); return 'Six a.m. every day. You hate him. It works.'; },
  },
  vacation: {
    name: 'Take a real vacation', blurb: 'Health and morale.', cost: (L) => round1(0.15 + capFor(L.year) * 0.001),
    when: (L) => L.phase === 'off' || L.phase === 'pre' || L.phase === 'drafted',
    run(L) { bump(L, { health: 8, morale: 8 }); return 'A week with no phone. You come back lighter.'; },
  },
  party: {
    name: 'Throw a party', blurb: 'Morale. Risky.', cost: () => 0.15,
    when: () => true,
    run(L, r) {
      if (r() < 0.7) { bump(L, { morale: 8, trust: 2 }); return 'The whole team comes. Good night, good vibes.'; }
      bump(L, { morale: 4, fame: 4, trust: -6 }); return 'It ends up online. The coach has questions.';
    },
  },
  house: {
    name: 'Buy your mom a house', blurb: 'Once. You have been waiting to do this.', cost: (L) => round1(1.2 + capFor(L.year) * 0.004),
    when: (L) => !L.flags.momHouse,
    run(L) { L.flags.momHouse = true; bump(L, { morale: 15, fame: 3 }); return 'She cries. You cry. Worth every dollar.'; },
  },
  foundation: {
    name: 'Start a foundation', blurb: 'Fame and morale. Costs real money.', cost: (L) => round1(1.5 + capFor(L.year) * 0.006),
    when: (L) => !L.flags.foundation,
    run(L) { L.flags.foundation = true; bump(L, { fame: 8, morale: 8 }); return 'Courts, scholarships, summer camps. Your name means something now.'; },
  },
};
function actsOpen(L) {
  if (L.retired || L.pending.length || isAm(L)) return [];
  const used = (L.flags.acts && L.flags.acts.y === L.year) ? L.flags.acts : {};
  return Object.keys(ACTS).map((id) => {
    const a = ACTS[id], cost = a.cost(L);
    return { id, name: a.name, blurb: a.blurb, cost, used: !!used[id], ok: a.when(L) && !used[id] && L.cash >= cost };
  }).filter((a) => ACTS[a.id].when(L));
}
function act(L, id) {
  const a = ACTS[id];
  if (!a) return null;
  const open = actsOpen(L).find((x) => x.id === id);
  if (!open || !open.ok) return null;
  if (!L.flags.acts || L.flags.acts.y !== L.year) L.flags.acts = { y: L.year };
  L.flags.acts[id] = 1;
  const before = snapshot(L);
  if (open.cost) L.cash = round1(L.cash - open.cost);
  const text = a.run(L, rngAt(L, 'act:' + id));
  const res = { title: a.name, label: a.name, text, tone: '', diff: diffOf(before, snapshot(L)) };
  L.last = res;
  return res;
}

// ─── public ─────────────────────────────────────────────────────────────────

function view(L) {
  const s = L.season;
  return {
    ovr: ovrOf(L), pot: L.pot, role: s && s.role ? s.role : (L.team ? roleOf(L) : null),
    line: s && s.gp ? perGame(s) : null, record: s ? { w: s.w, l: s.l } : null,
    next: nextLabel(L), totals: totals(L), cap: capFor(L.year),
  };
}

/* The colours you are wearing right now. */
function colorsOf(L) {
  if (isAm(L)) {
    if (L.am.level === 'hs') return { primary: L.am.hs.c1, secondary: L.am.hs.c2 };
    if (L.am.level === 'col' && SCHOOL_BY[L.am.college]) return { primary: SCHOOL_BY[L.am.college].c1, secondary: SCHOOL_BY[L.am.college].c2 };
    return { primary: '#2b3242', secondary: '#c9ccd6' };
  }
  if (L.team && E.clubSkin) { const k = E.clubSkin(L.team); return { primary: k.primary, secondary: k.secondary }; }
  return { primary: '#2b3242', secondary: '#c9ccd6' };
}
/* Where you are on the road, in two lines, for the identity card and the hero. */
function roadView(L) {
  if (!isAm(L)) return null;
  const a = L.am;
  if (a.level === 'hs') return { where: a.hs.name, level: 'High school', what: GRADE[a.grade][0].toUpperCase() + GRADE[a.grade].slice(1), sub: rankText(a.rank) };
  if (a.level === 'col') return { where: a.college, level: 'College', what: CYEAR[a.cyear][0].toUpperCase() + CYEAR[a.cyear].slice(1) + ' at ' + a.college,
    sub: draftTalk(projectedPick(L, a.stock || 0)) };
  return { where: a.route === 'intl' ? 'Overseas' : 'G League', level: 'Pro', what: a.route === 'intl' ? 'A year overseas' : 'A year in the G League', sub: 'The draft is next' };
}

const publicAPI = {
  CAREER_API_VERSION, LIFE_VERSION,
  CONF, CLUBS, confOf, POS, POS_NAME, RATINGS, RATING_NAME, RATING_SHORT, WEIGHTS,
  ARCHES, ARCH_KEYS, BACKGROUNDS, BG_KEYS, AGENTS, AWARD_NAME, ROUNDS, VERDICTS, EVENTS,
  seedLeague, normaliseNets, newLife, randomName, overall, ovrOf, step, choose, nextLabel,
  view, perGame, totals, legacy, legacyScore, clubNet, clubTier, rotationBar,
  roleOf, lineMeans, capFor, marketSalary, projectedPick, draftOrder, money, ordinal,
  clutchOptions, offers, ACTS, actsOpen, act,
  SCHOOLS, SCHOOL_BY, TIER_NAME, AM_EVENTS, HS_ROUNDS, NCAA_ROUNDS, GRADE, CYEAR, AGE_HS,
  isAm, colorsOf, roadView, nationalRank, rankText, starsOf, draftTalk, collegeOffers, schoolNet,
};

if (typeof module !== 'undefined' && module.exports) module.exports = publicAPI;
if (typeof window !== 'undefined') window.RTF_CAREER = publicAPI;
})();
