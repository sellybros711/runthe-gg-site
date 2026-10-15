const E = (typeof require !== 'undefined')
  ? require('./engine.js')
  : window.RTF_ENGINE;

const CAREER_API_VERSION = 1;
const LIFE_VERSION = 3;

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
/* The six above are the BASE kinds the sim knows (usage, three-point share,
   the rim protector's blocks), and the only keys a career saved before this
   carries. Every position now has six of its own, each built on one of them,
   so a point guard picks among point guards and a center among centers. */
const POS_ARCHES = {
  PG: [
    ['pg_floor', 'floor', 'Floor general', 'Sees the play before it happens.', { pla: 10, iq: 6, def: -2, reb: -4 }],
    ['pg_score', 'scorer', 'Scoring guard', 'Shoots first. Asks later.', { sho: 7, fin: 4, pla: 1, def: -5 }],
    ['pg_pnr', 'floor', 'Pick-and-roll maestro', 'Lives off the screen. Reads every coverage.', { pla: 8, iq: 4, sho: 3, ath: -2, def: -4 }],
    ['pg_pest', 'twoway', 'Defensive pest', 'Picks you up full court. Every trip.', { def: 9, ath: 4, pla: 1, sho: -3 }],
    ['pg_speed', 'slasher', 'Speed demon', 'A first step nobody stays in front of.', { ath: 8, fin: 5, sho: -3, iq: -2 }],
    ['pg_deep', 'scorer', 'Deep threat', 'Logo threes off the dribble.', { sho: 10, pla: 1, fin: -3, def: -3 }, { three: 0.12 }],
  ],
  SG: [
    ['sg_three', 'scorer', 'Three-level scorer', 'The rim, the elbow, the arc. Pick one.', { sho: 6, fin: 5, pla: -1, def: -5 }],
    ['sg_sniper', 'scorer', 'Sharpshooter', 'Catch, set, splash.', { sho: 11, fin: -2, pla: -3, ath: -2 }, { three: 0.14, usage: 0 }],
    ['sg_3d', 'twoway', 'Three-and-D', 'Guards the best wing. Hits the corner three.', { def: 8, sho: 3, ath: 1, pla: -3 }, { three: 0.08 }],
    ['sg_slash', 'slasher', 'Slasher', 'Lives at the rim. Lives at the line.', { fin: 8, ath: 6, sho: -5 }],
    ['sg_combo', 'floor', 'Combo guard', 'Runs the point when the point sits.', { pla: 6, sho: 4, iq: 2, reb: -4 }],
    ['sg_heat', 'scorer', 'Microwave', 'Heats up fast. Shoots like it.', { sho: 6, fin: 5, def: -6, iq: -1 }, { usage: 0.05 }],
  ],
  SF: [
    ['sf_wing', 'twoway', 'Two-way wing', 'Guards the best player. Hits the open three.', { def: 8, ath: 3, sho: 1, pla: -3 }],
    ['sf_create', 'scorer', 'Shot creator', 'Gets a bucket from anywhere.', { sho: 7, fin: 4, pla: -1, def: -5 }],
    ['sf_point', 'floor', 'Point forward', 'The ball runs through him at six-eight.', { pla: 8, iq: 4, reb: 2, sho: -2, def: -4 }],
    ['sf_flyer', 'slasher', 'High flyer', 'Above the rim. Every night.', { ath: 9, fin: 6, sho: -5, iq: -3 }],
    ['sf_move', 'stretch', 'Movement shooter', 'Never stops running. Never misses open.', { sho: 9, iq: 3, def: -3, reb: -3 }, { three: 0.1 }],
    ['sf_glue', 'twoway', 'Glue guy', 'Does the small things. Wins games.', { iq: 6, def: 4, reb: 3, sho: 1, fin: -4, ath: -3 }, { usage: -0.04 }],
  ],
  PF: [
    ['pf_stretch', 'stretch', 'Stretch four', 'Pulls the big out to the arc.', { sho: 8, reb: 2, def: -2, ath: -2 }],
    ['pf_bully', 'slasher', 'Bruiser', 'Bully ball in the paint.', { fin: 8, reb: 6, sho: -6, ath: -2 }, { three: -0.1 }],
    ['pf_run', 'slasher', 'Athletic four', 'Runs the floor. Finishes every lob.', { ath: 8, fin: 6, reb: 2, sho: -6, pla: -3 }],
    ['pf_face', 'scorer', 'Face-up four', 'Jab step, rip through, score.', { sho: 5, fin: 5, pla: 1, def: -4, reb: -2 }],
    ['pf_switch', 'twoway', 'Switch defender', 'Guards one through five.', { def: 9, ath: 3, reb: 2, sho: -2, pla: -3 }],
    ['pf_hub', 'floor', 'Playmaking four', 'Short roll, hand off, finds the cutter.', { pla: 8, iq: 5, sho: -2, ath: -3, def: -2 }],
  ],
  C: [
    ['c_rim', 'anchor', 'Rim protector', 'Nothing easy at the rim. Ever.', { def: 10, reb: 6, sho: -8, pla: -4 }],
    ['c_stretch', 'stretch', 'Stretch five', 'A center who lives at the arc.', { sho: 8, reb: 2, def: -2, ath: -2 }],
    ['c_post', 'scorer', 'Post scorer', 'Back to the basket. Drop step. Hook. Done.', { fin: 9, iq: 3, sho: -4, ath: -4, pla: -2 }, { three: -0.14 }],
    ['c_lob', 'slasher', 'Lob threat', 'Rolls hard. Catches everything.', { ath: 8, fin: 7, sho: -8, pla: -4 }, { three: -0.14 }],
    ['c_glass', 'anchor', 'Glass cleaner', 'Every rebound is his.', { reb: 11, def: 4, sho: -7, pla: -4 }],
    ['c_hub', 'floor', 'Playmaking big', 'Runs the offense from the elbow.', { pla: 9, iq: 5, sho: 2, ath: -5, def: -3 }],
  ],
};
for (const p in POS_ARCHES) for (const [key, base, name, blurb, tilt, more] of POS_ARCHES[p]) {
  const b = ARCHES[base];
  ARCHES[key] = Object.assign({ name, blurb, tilt, usage: b.usage, three: b.three, base, pos: p }, more || {});
}
const ARCH_KEYS = ['scorer', 'floor', 'twoway', 'slasher', 'stretch', 'anchor'];
const archesFor = (pos) => (POS_ARCHES[pos] || []).map((x) => x[0]);
const archBase = (L) => (ARCHES[L.arch] && ARCHES[L.arch].base) || L.arch;
/* Moving position keeps the kind of player you are: the new position's
   archetype on the same base, or the one your ratings fit best. */
function archForPos(L, pos) {
  const keys = archesFor(pos);
  if (!keys.length || ARCHES[L.arch].pos == null) return L.arch;
  const same = keys.find((k) => ARCHES[k].base === archBase(L));
  return same || keys.slice().sort((a, b) => archFit(L, b) - archFit(L, a))[0];
}

/* HEIGHT AND WEIGHT. Inches and pounds, picked in the builder inside a range
   for the position. Being tall for your spot buys glass, rim defense and
   finishing and costs a step and a handle; heavy for your frame buys strength
   at the cost of the bounce. Zero at the position's middle, so a career saved
   before this, which has neither, plays exactly as it did. */
const POS_SIZE = { PG: { ht: [72, 78], mid: 75 }, SG: { ht: [74, 80], mid: 77 }, SF: { ht: [77, 82], mid: 79 }, PF: { ht: [79, 84], mid: 81 }, C: { ht: [81, 88], mid: 84 } };
const wtFor = (ht) => Math.round((195 + (ht - 75) * 8) / 5) * 5;
const wtRange = (ht) => [Math.max(160, wtFor(ht) - 30), Math.min(320, wtFor(ht) + 40)];
function sizeOf(L) {
  const z = POS_SIZE[L.pos] || POS_SIZE.SF;
  const ht = Number.isFinite(L.ht) ? L.ht : z.mid;
  return { ht, wt: Number.isFinite(L.wt) ? L.wt : wtFor(ht), dh: ht - z.mid, dw: ((Number.isFinite(L.wt) ? L.wt : wtFor(ht)) - wtFor(ht)) / 10 };
}
function sizeTilt(pos, ht, wt) {
  const z = POS_SIZE[pos] || POS_SIZE.SF, dh = ht - z.mid, dw = (wt - wtFor(ht)) / 10;
  return { reb: 1.6 * dh + 1.2 * dw, def: 0.8 * dh + 0.3 * dw, fin: 0.5 * dh + 1.0 * dw, ath: -1.1 * dh - 1.4 * dw, pla: -0.8 * dh - 0.2 * dw, sho: -0.4 * dh - 0.4 * dw };
}
const heightText = (ht) => Math.floor(ht / 12) + '\'' + (ht % 12) + '"';

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
    else if (METERS.indexOf(k) >= 0) L.m[k] = clamp(Math.round(L.m[k] + v * traitMult(L, k, v)), 0, 100);
    else if (k === 'cash') L.cash = round1(L.cash + v);
    else if (k === 'eth') L.eth = clamp(L.eth + v, 0, 100);
    else if (k === 'dur') L.dur = clamp(L.dur + v, 0, 100);
    else if (k === 'pot') L.pot = clamp(L.pot + v, 40, 99);
    else if (L.season && L.season.mods && k in L.season.mods) L.season.mods[k] += v;
  }
}
/* Traits lean on the meters: a coachable player banks more trust from the
   same moment, a showman more fame. Only on a story career. */
function traitMult(L, k, v) {
  if (v <= 0 || !L.opt || !L.traits) return 1;
  if (k === 'trust' && L.traits.coachable && L.traits.coachable.has) return 1.3;
  if (k === 'fame' && L.traits.showman && L.traits.showman.has) return 1.2;
  return 1;
}
/* What a card moved, for the screen. */
function snapshot(L) {
  const o = { rt: Object.assign({}, L.rt), m: Object.assign({}, L.m), cash: L.cash, ovr: ovrOf(L) };
  /* A story career shows what a card did to your minutes and your spot,
     because that is most of what a coach or a trade changes. */
  if (L.stage === 'nba' && L.team && L.season) { o.min = roleOf(L).min; o.pos = L.pos; o.team = L.team; }
  return o;
}
function diffOf(a, b) {
  const out = [];
  for (const k of RATINGS) if (b.rt[k] !== a.rt[k]) out.push({ k, label: RATING_NAME[k], d: b.rt[k] - a.rt[k] });
  for (const k of METERS) if (b.m[k] !== a.m[k]) out.push({ k, label: k[0].toUpperCase() + k.slice(1), d: b.m[k] - a.m[k] });
  if (Math.abs(b.cash - a.cash) >= 0.05) out.push({ k: 'cash', label: 'Cash', d: round1(b.cash - a.cash), money: true });
  if (a.min != null && b.min != null && a.team === b.team && Math.abs(b.min - a.min) >= 1) out.push({ k: 'min', label: 'Minutes', d: Math.round(b.min - a.min) });
  return out;
}

function logIt(L, text, tone) {
  L.log.push({ y: L.year, t: say(L, text), tone: tone || '' });
  if (L.log.length > 400) L.log.splice(0, L.log.length - 400);
}
