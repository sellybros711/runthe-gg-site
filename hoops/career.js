/* Run The Floor: Career, one NBA life from draft night to the Hall of Fame.
 *
 * Headless and dependency-free apart from engine.js, so every rule in here can
 * be driven from node. Browser: window.RTF_CAREER. Node: require.
 *
 * THE PLAYER IS INVENTED AND THE LEAGUE IS REAL. Thirty real clubs, their real
 * colours, their real players and their real head coaches. Every person a
 * line talks about has a name: a teammate or an opponent is a real player off
 * the data, an NBA head coach is a real coach (and the carousel moves them),
 * and everybody else is generated off the career's seed. Write an event with
 * a {token} (see peopleKey) and never with a role like "your coach": the
 * token is what makes the line about a person rather than a job.
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
const LIFE_VERSION = 2;

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
  if (v <= 0 || !L.opt || !L.opt.story || !L.traits) return 1;
  if (k === 'trust' && L.traits.coachable && L.traits.coachable.has) return 1.3;
  if (k === 'fame' && L.traits.showman && L.traits.showman.has) return 1.2;
  return 1;
}
/* What a card moved, for the screen. */
function snapshot(L) {
  const o = { rt: Object.assign({}, L.rt), m: Object.assign({}, L.m), cash: L.cash, ovr: ovrOf(L) };
  /* A story career shows what a card did to your minutes and your spot,
     because that is most of what a coach or a trade changes. */
  if (storyOn(L) && L.stage === 'nba' && L.team && L.season) { o.min = roleOf(L).min; o.pos = L.pos; o.team = L.team; }
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

// ─── the league's clubs ─────────────────────────────────────────────────────

/* Year one's club strength off the real rosters, then scaled to the league's
   real spread. `rows` is the data's player-seasons; only the newest season is
   read. A club with nobody in it reads as average rather than as nothing. */
function seedLeague(rows, rosters) {
  let latest = 0;
  for (const r of rows || []) if (r.s > latest) latest = r.s;
  /* TODAY'S ROSTERS. A career joins the season after the data's newest, and
     hoops/data/rosters.json is that season's real clubs: the summer's trades,
     free agents and rookies, every man under contract. When it is for that
     season, the clubs are built from it, each man carrying what he did last
     season. Anything else (no file, a stale one) is the data's last season. */
  const today = rosters && rosters.clubs && +rosters.season === latest + 1 ? rosters : null;
  if (today) return seedToday(rows, latest, today);
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
  /* What each man did in that season, for the rotation screen and the
     Saturday contests: minutes, points, rebounds, assists, threes taken. */
  const lines = {};
  for (const c in by) for (const r of by[c]) lines[r.n] = [round1(r.mp || 0), round1(r.pts || 0), round1(r.reb || 0), round1(r.ast || 0), round1(r.tpa || 0), String(r.ep || r.pp || '')];
  return { latest: latest || 2026, net: normaliseNets(net), stars, roster: rosterSeed(rows, latest), lines };
}
/* The clubs as rosters.json has them. The net comes off last season's rows of
   the men each club now holds, so a club that traded for a star plays like it.

   POSITION. The roster file writes a coarse G, F or C (Basketball-Reference's
   roster table), which read as SG and SF turned the league's best shooting
   point guard into a shooting guard and its best passing power forward into
   a small forward, and left his club with no point guard at all. A man's position is the one the data lists for his most
   recent season, when that agrees with the file's letter; the coarse letter is
   only the fallback for a man the data has never seen.

   WORTH. A season's win shares are a count, so a season lost to injury reads
   as a worse player: a star's 43 games one season read 4.1 against 7.9 the
   year before. A man's worth is his last three seasons, each as a rate per game
   over a full season, weighted toward the newest and toward the seasons he
   actually played. It is stamped with the season it was measured in (the
   fifth field), so the rosters age him from there and not from scratch. */
const POS_COARSE = { G: 'SG', F: 'SF', GF: 'SF', FC: 'PF' };
const POS_FAMILY = { G: ['PG', 'SG'], F: ['SF', 'PF'], C: ['C', 'PF'], GF: ['SG', 'SF'], FC: ['PF', 'C'] };
function posFromData(filePos, rowsNewestFirst) {
  const fam = POS_FAMILY[filePos];
  for (const r of rowsNewestFirst) {
    const pp = r && String(r.pp || '').split(';')[0];
    if (R_POS.indexOf(pp) < 0) continue;
    /* The data's spot when it is in the file's family or one step from it:
       a big the file calls F is often a center in the data, and the
       coarse letter is the rougher of the two. */
    const near = (f) => Math.abs(R_POS.indexOf(f) - R_POS.indexOf(pp)) <= 1;
    if (R_POS.indexOf(filePos) >= 0 || !fam || fam.some(near)) return pp;
  }
  if (R_POS.indexOf(filePos) >= 0) return filePos;
  return POS_COARSE[filePos] || 'SF';
}
function worthOf(bySeason, latest) {
  let num = 0, den = 0, gs = 0, gw = 0;
  [[latest, 0.6], [latest - 1, 0.3], [latest - 2, 0.1]].forEach(([y, wt]) => {
    const rs = bySeason[y];
    if (!rs || !rs.length) return;
    const w = rs.reduce((a, r) => a + (r.w || 0), 0), g = rs.reduce((a, r) => a + (r.g || 0), 0);
    if (g <= 0) return;
    const rel = wt * Math.min(1, g / 50);
    /* PERFORMANCE IS WIN SHARES AND PRODUCTION, half each. Win shares alone
       rate a high-usage guard on a bad club under a center on a good one;
       the box score alone ignores whether it won. Production is points,
       rebounds, assists, steals and blocks a game, read in win shares a game
       (twelve a night is replacement level). */
    const pr = rs.reduce((a, r) => a + (r.g || 0) * Math.max(0, (r.pts || 0) + 1.2 * (r.reb || 0) + 1.6 * (r.ast || 0) + 2 * ((r.stl || 0) + (r.blk || 0)) - 12) * 0.24 / 70, 0) / g;
    num += rel * (0.5 * w / Math.max(g, 25) + 0.5 * pr * Math.min(1, g / 25));
    den += rel;
    gs += wt * g; gw += wt;
  });
  /* A rate per game, times the games a man like him plays: a season lost to
     a knee costs a little, not most of what he is. */
  return den > 0 ? (num / den) * clamp(gs / gw, 45, 76) : null;
}
/* The rosters with the real ratings file riding on them, for a reader that
   loads the two separately. */
function withRatings(rosters, ratings) {
  if (!rosters || !ratings || !ratings.men) return rosters;
  return Object.assign({}, rosters, { ratings });
}
function seedToday(rows, latest, today) {
  const RT = (today.ratings && today.ratings.season === latest + 1 && today.ratings.men) || {};
  const RTN = Object.keys(RT).length > 0;
  const last = {}, by = {}, first = {};
  for (const r of rows || []) {
    if (!(first[r.i] <= r.s)) first[r.i] = r.s;
    if (r.s === latest) { (last[r.i] = last[r.i] || []).push(r); }
    if (r.s >= latest - 2) { const b = by[r.i] = by[r.i] || {}; (b[r.s] = b[r.s] || []).push(r); }
  }
  const net = {}, stars = {}, roster = {}, lines = {}, fa = [];
  for (const c of CLUBS) {
    const men = (today.clubs[c] || []).map((m) => {
      const mine = last[m.i] || [];
      const seasons = by[m.i] || {};
      const recent = [latest, latest - 1, latest - 2].map((y) => (seasons[y] || []).slice().sort((a, b) => (b.g || 0) - (a.g || 0))[0]).filter(Boolean);
      const v = worthOf(seasons, latest);
      /* THE REAL RATING WINS. A man the 2K ratings cover is worth exactly
         the rating fans know, read back onto our scale, for the season about
         to be played. A man they do not cover is rated under 75 by them, so
         his box score reading is held under that. */
      const rr = RT[m.i] || {};
      const w = rr.o ? wFromOvr(showInv(rr.o)) : RTN ? Math.min(v == null ? 1.2 : v, wFromOvr(showInv(74.4))) : v == null ? 1.2 : v;
      /* Last season's line, from whichever club he played most for. */
      const top = mine.slice().sort((a, b) => (b.g || 0) - (a.g || 0))[0];
      if (top) lines[m.n] = [round1(top.mp || 0), round1(top.pts || 0), round1(top.reb || 0), round1(top.ast || 0), round1(top.tpa || 0), String(top.ep || top.pp || '')];
      const pos = posFromData(m.pos, recent);
      const born = m.b || (top ? bornOf(top, first[m.i]) : latest - 21);
      return { m, w: round1(w), pos, born, rows: mine, o: rr.o || 0, p: rr.p || 0 };
    }).sort((a, b) => b.w - a.w);
    /* With the ratings file every man is read for the season about to be
       played (a 2K rating is that season's), so nobody is aged into it. */
    const ms = RTN ? latest + 1 : latest;
    const tup = (x) => (x.o || x.p ? [x.m.n, x.pos, x.born, x.w, ms, x.o, x.p] : [x.m.n, x.pos, x.born, x.w, ms]);
    roster[c] = men.slice(0, 15).map(tup);
    for (const x of men.slice(15)) fa.push(tup(x));
    stars[c] = men.slice(0, 3).map((x) => x.m.n);
    /* Strength off last season's rows of the men he now has, the best one per
       man, so a traded player counts once and for his new club. */
    const list = men.map((x) => x.rows.slice().sort((a, b) => (b.w || 0) - (a.w || 0))[0]).filter(Boolean);
    net[c] = list.length >= 5 && E.teamStrength ? (() => { const st = E.teamStrength(list); return st.ortg - st.drtg; })() : 0;
  }
  const coach = {};
  for (const c of CLUBS) if (today.coaches && today.coaches[c]) coach[c] = String(today.coaches[c]).slice(0, 40);
  /* And the men who played last season and are on no roster today. */
  const on = new Set();
  for (const c of CLUBS) for (const m of today.clubs[c] || []) on.add(m.i);
  for (const i in last) {
    if (on.has(i)) continue;
    const top = last[i].slice().sort((a, b) => (b.g || 0) - (a.g || 0))[0];
    const born = bornOf(top, first[i]);
    if (latest + 1 - born > 33) continue;
    const v = worthOf(by[i] || {}, latest);
    fa.push([top.n, posFromData(String(top.pp || top.ep || 'SF').split(';')[0], [top]), born, round1(Math.max(0.2, v == null ? 0.5 : v)), latest]);
  }
  fa.sort((a, b) => b[3] - a[3]);
  return { latest: latest || 2026, rs: latest + 1, net: normaliseNets(net), stars, roster, lines, cn: coach, fa: fa.slice(0, 60) };
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
function driftLeague(L, beats) {
  /* Before the data's season is over nothing moves: those summers are the
     real past, and the league in the data is what it became. */
  if (L.opt && L.opt.cal && (L.year <= L.league.latest + 1 || L.stage !== 'nba')) return;
  coachCarousel(L, beats);
  const rng = rngAt(L, 'drift');
  const net = {};
  /* A STORY CLUB IS AS GOOD AS ITS PLAYERS. After the summer's moves every
     club is rated off its rotation's overalls, weighted the way the minutes
     go, with a little left to coaching and luck. Your own club is rated
     without you: what you add is your impact on the floor. */
  if (storyOn(L) && rostOf(L)) {
    leagueSummer(L);
    rosterSummer(L, beats);
    L.league.net = rosterNets(L, rng);
    return;
  }
  for (const c of CLUBS) net[c] = (L.league.net[c] || 0) * 0.62 + norm(rng) * 3.6;
  L.league.net = normaliseNets(net);
  leagueSummer(L);
  rosterSummer(L, beats);
}
const NET_WT = [0.15, 0.14, 0.13, 0.12, 0.11, 0.1, 0.08, 0.07, 0.06, 0.04];
function clubOvr(L, c) {
  const m = matesOf(L, c).filter((x) => !(c === L.team && x.n === L.name)).map((x) => x.ovr).sort((a, b) => b - a);
  let v = 0;
  NET_WT.forEach((w, k) => { v += w * (m[k] != null ? m[k] : 60); });
  return v;
}
function rosterNets(L, rng) {
  const net = {};
  for (const c of CLUBS) net[c] = clubOvr(L, c) + norm(rng) * 0.6;
  return normaliseNets(net);
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

// ─── the people ─────────────────────────────────────────────────────────────

/* EVERYBODY IN A STORY HAS A NAME. NBA players and NBA head coaches are real
 * people under their real names. Everybody else (a high school coach, a
 * college coach, an agent, a GM, your mom, a booster) is generated off the
 * career's seed, so they are the same people every time the career is loaded
 * and different people in the next career.
 *
 * The head coaches are the staff in place at the end of the data's last
 * season, which is the league the career opens on. They move after that the
 * way coaches do: a bad year gets a coach fired, an interim gets the job or
 * does not, and a fired coach can turn up somewhere else a year later. Once
 * the real names run out, the league promotes generated assistants. Change a
 * chair here and nowhere else.
 */
const COACHES_NOW = {
  ATL: ['Quin Snyder', 1966], BOS: ['Joe Mazzulla', 1988], BRK: ['Jordi Fernández', 1982],
  CHI: ['Billy Donovan', 1965], CHO: ['Charles Lee', 1984], CLE: ['Kenny Atkinson', 1967],
  DET: ['J.B. Bickerstaff', 1979], IND: ['Rick Carlisle', 1959], MIA: ['Erik Spoelstra', 1970],
  MIL: ['Doc Rivers', 1961], NYK: ['Mike Brown', 1970], ORL: ['Jamahl Mosley', 1978],
  PHI: ['Nick Nurse', 1967], TOR: ['Darko Rajaković', 1979], WAS: ['Brian Keefe', 1976],
  DAL: ['Jason Kidd', 1973], DEN: ['David Adelman', 1981], GSW: ['Steve Kerr', 1965],
  HOU: ['Ime Udoka', 1977], LAC: ['Tyronn Lue', 1977], LAL: ['JJ Redick', 1984],
  MEM: ['Tuomas Iisalo', 1982], MIN: ['Chris Finch', 1969], NOP: ['James Borrego', 1977],
  OKC: ['Mark Daigneault', 1985], PHO: ['Jordan Ott', 1985], POR: ['Tiago Splitter', 1985],
  SAC: ['Doug Christie', 1970], SAS: ['Mitch Johnson', 1986], UTA: ['Will Hardy', 1988],
};
/* Real coaches out of a chair when the data ends, and real assistants a club
   could hand one to. The third field is whether he has run a bench before:
   an interim comes from the assistants first, a big hire from the others. */
const COACH_POOL = [
  ['Mike Budenholzer', 1969, 1], ['Michael Malone', 1971, 1], ['Tom Thibodeau', 1958, 1],
  ['Taylor Jenkins', 1984, 1], ['Monty Williams', 1971, 1], ['Frank Vogel', 1973, 1],
  ['Willie Green', 1981, 1], ['Steve Clifford', 1961, 1], ['Nate McMillan', 1964, 1],
  ['Wes Unseld Jr.', 1975, 1], ['Jacque Vaughn', 1975, 1], ['Darvin Ham', 1973, 1],
  ['Dwane Casey', 1957, 1], ['Adrian Griffin', 1974, 1], ['Stephen Silas', 1973, 1],
  ['Luke Walton', 1980, 1], ['Igor Kokoškov', 1971, 1], ['Mark Jackson', 1965, 1],
  ['Jeff Van Gundy', 1962, 1], ['Sean Sweeney', 1984, 0], ['Johnnie Bryant', 1985, 0],
  ['Micah Nori', 1973, 0], ['Chris Quinn', 1983, 0], ['Sam Cassell', 1969, 0],
  ['Phil Handy', 1971, 0], ['Jarron Collins', 1978, 0], ['Dan Craig', 1980, 0],
  ['Rex Kalamian', 1965, 0],
];
const COACH_NAMES = Object.keys(COACHES_NOW).map((c) => COACHES_NOW[c][0]).concat(COACH_POOL.map((x) => x[0]));

/* Generated names. check-career holds every pairing these lists can make
   against every real player and coach, so a made-up person is never somebody
   real by accident. */
const PEOPLE_M = ['Ray', 'Curtis', 'Dwayne', 'Glenn', 'Leon', 'Vernon', 'Tom', 'Marty', 'Russ', 'Darnell',
  'Phil', 'Gene', 'Walt', 'Howard', 'Rodney', 'Earl', 'Lou', 'Frank', 'Cedric', 'Hank', 'Byron', 'Neil',
  'Reggie', 'Otis', 'Stan', 'Lyle', 'Clint', 'Duane', 'Felix', 'Arturo'];
const PEOPLE_F = ['Denise', 'Monique', 'Tanya', 'Rochelle', 'Angela', 'Carmen', 'Lorraine', 'Yvette',
  'Brenda', 'Gloria', 'Sheila', 'Renee', 'Valerie', 'Darlene', 'Paula', 'Marisol', 'Joyce', 'Lena',
  'Bernadette', 'Nadia'];
const PEOPLE_X = ['Simone', 'Maya', 'Jordan', 'Alexis', 'Avery', 'Kendall', 'Brielle', 'Imani', 'Sasha',
  'Noelle', 'Taylor', 'Camille', 'Jada', 'Reese', 'Tiana', 'Aaliyah', 'Morgan', 'Nia', 'Zora', 'Leila'];
const PEOPLE_LAST = ['Haddock', 'Prewitt', 'Coldwell', 'Ferraro', 'Ambrose', 'Kettering', 'Doucette',
  'Saltzman', 'Rourke', 'Batista', 'Whitcomb', 'Laughlin', 'Ostrander', 'Pettaway', 'Dabney', 'Hurlbut',
  'Mancuso', 'Galloway', 'Tisdell', 'Brannock', 'Esposito', 'Varnado', 'Crenshaw', 'Lomax', 'Szabo',
  'Okonjo', 'Pickard', 'Rayburn', 'Delgado', 'Fenwick', 'Quarles', 'Albrecht', 'Moncrief', 'Treadway',
  'Yancey', 'Bergstrom', 'Cavanaugh', 'Duplessis', 'Heflin', 'Nakamura'];

/* One person, off a key. The key is what makes him the same man next time. */
function personName(L, key, kind) {
  const r = E.createSeededRNG(E.hashSeed(String(L.seed) + ':who:' + key));
  const first = kind === 'f' ? PEOPLE_F : kind === 'x' ? PEOPLE_X : PEOPLE_M;
  return pick(r, first) + ' ' + pick(r, PEOPLE_LAST);
}
/* Family shares your last name. */
const surname = (L) => { const p = String(L.name || '').trim().split(/\s+/); return p[p.length - 1] || 'Smith'; };
function kinName(L, key, kind) {
  if (key === 'dad' && L.parent && L.parent.name) return L.parent.name;
  const r = E.createSeededRNG(E.hashSeed(String(L.seed) + ':kin:' + key));
  return pick(r, kind === 'f' ? PEOPLE_F : PEOPLE_M) + ' ' + surname(L);
}
const firstOf = (n) => String(n || '').split(' ')[0];
const lastOf = (n) => { const p = String(n || '').trim().split(/\s+/); if (p.length > 1 && /^(jr\.?|sr\.?|ii|iii|iv)$/i.test(p[p.length - 1])) return p[p.length - 2]; return p[p.length - 1] || n; };

// ─── the coaching carousel ──────────────────────────────────────────────────

/* The league's coaches ride on the life like its club nets do. An old save
   has no coaches yet, so they are read through here and built on first use. */
function coachState(L) {
  const lg = L.league;
  if (!lg.coach) {
    lg.coach = {};
    for (const c of CLUBS) {
      const x = COACHES_NOW[c];
      /* rosters.json names who coaches the club the season a career joins. A
         man the tables know keeps his birth year; a new one is given one. */
      const now = lg.cn && lg.cn[c];
      if (now && now !== x[0]) {
        const k = Object.values(COACHES_NOW).concat(COACH_POOL).find((y) => y[0] === now);
        lg.coach[c] = { n: now, b: k ? k[1] : 1978, since: lg.rs || (lg.latest || 2026), real: 1 };
        continue;
      }
      lg.coach[c] = { n: x[0], b: x[1], since: (lg.latest || 2026) - 1, real: 1 };
    }
    lg.free = [];
    lg.gone = [];
    lg.gen = 0;
  }
  return lg;
}
function coachOf(L, c) {
  const lg = coachState(L);
  return lg.coach[c] || null;
}
const coachName = (L, c) => { const x = coachOf(L, c); return x ? x.n : ''; };
/* Every real name the league has already used, so the pool is what is left. */
function coachUsed(L) {
  const lg = coachState(L), used = {};
  for (const c of CLUBS) if (lg.coach[c]) used[lg.coach[c].n] = 1;
  for (const f of lg.free) used[f.n] = 1;
  for (const g of lg.gone) used[g] = 1;
  return used;
}
/* Who a club can hire. Fired coaches who have sat a year, real names from
   the pool nobody has hired yet, and a generated assistant when those run
   short. `interim` wants an assistant who is already in the building. */
function coachCandidates(L, c, interim, rng) {
  const lg = coachState(L), used = coachUsed(L), out = [];
  if (!interim) {
    for (const f of lg.free) if (f.from !== c && L.year - f.out >= 1 && L.year - f.b < 70) out.push({ n: f.n, b: f.b, real: f.real, w: 3 + (f.good || 0) });
  }
  for (const x of COACH_POOL) {
    if (used[x[0]] || L.year - x[1] >= 70) continue;
    if (interim && x[2]) continue;
    out.push({ n: x[0], b: x[1], real: 1, w: x[2] ? 2.5 : 1.6 });
  }
  /* A first-time coach the league promotes. More of them as the real names
     retire, which is how a real league turns over. */
  let g = personName(L, 'coachgen:' + (lg.gen || 0), 'm');
  while (used[g]) { lg.gen = (lg.gen || 0) + 1; g = personName(L, 'coachgen:' + lg.gen, 'm'); }
  out.push({ n: g, b: L.year - 38 - Math.floor(rng() * 10), real: 0, gen: 1, w: interim ? 3 : 1.2 + Math.max(0, 6 - out.length) * 0.5 });
  return out;
}
function hire(L, c, cand, interim) {
  const lg = coachState(L);
  if (cand.gen) lg.gen = (lg.gen || 0) + 1;
  lg.free = lg.free.filter((f) => f.n !== cand.n);
  lg.coach[c] = { n: cand.n, b: cand.b, since: L.year, real: cand.real ? 1 : 0, interim: interim ? 1 : 0 };
  return lg.coach[c];
}
function fire(L, c, good) {
  const lg = coachState(L);
  const x = lg.coach[c];
  if (!x) return null;
  if (L.year - x.b < 66) lg.free.push({ n: x.n, b: x.b, real: x.real, out: L.year, from: c, good: good || 0 });
  else lg.gone.push(x.n);
  lg.coach[c] = null;
  return x;
}
/* How likely a club is to make a change, off how it played. */
function fireChance(L, c, net, champ) {
  const x = coachOf(L, c);
  if (!x) return 1;
  const ten = L.year - x.since;
  let p = 0.03;
  if (net < -4) p += 0.3; else if (net < -1.5) p += 0.15; else if (net < 1) p += 0.06; else p += 0.01;
  if (ten >= 5 && net < 2) p += 0.06;
  if (ten <= 1 && !x.interim) p -= 0.05;
  if (x.interim) p += 0.45;
  if (champ) p = 0;
  return clamp(p, 0, 0.9);
}
/* The summer. Runs once a year, before the nets move, so it reads the season
   just played. Your club's change is a beat; the rest is the league wire. */
function coachCarousel(L, beats) {
  const lg = coachState(L);
  if (lg.cy === L.year) return;
  lg.cy = L.year;
  const rng = rngAt(L, 'carousel');
  const moves = [];
  for (const c of CLUBS) {
    const x = lg.coach[c];
    if (x && L.year - x.b >= 71 && rng() < 0.6) { lg.gone.push(x.n); lg.coach[c] = null; moves.push({ c, out: x, why: 'retires' }); continue; }
    /* Your club is judged on the record you actually played. */
    let net = clubNet(L, c), champ = false;
    const last = L.history[L.history.length - 1];
    if (c === L.team && last && last.y === L.year - 1 && last.t === c) {
      net = (last.w / Math.max(1, last.w + last.l) - 0.5) / 0.03;
      champ = last.po === 'Champion';
    }
    if (rng() < fireChance(L, c, net, champ)) moves.push({ c, out: fire(L, c, net > 2 ? 1 : 0), why: 'fired' });
  }
  for (const m of moves) {
    const list = coachCandidates(L, m.c, false, rng);
    const got = hire(L, m.c, weighted(rng, list, (x) => x.w) || list[0], false);
    m.in = got;
  }
  /* Old coaches who never got another chair leave the list after four years. */
  lg.free = lg.free.filter((f) => { if (L.year - f.out > 4 || L.year - f.b >= 72) { lg.gone.push(f.n); return false; } return true; });
  if (lg.gone.length > 120) lg.gone = lg.gone.slice(-120);
  const line = (m) => (m.out ? (m.why === 'retires' ? dot(m.out.n + ' retires') : dot('The ' + nick(m.c) + ' fire ' + m.out.n)) + ' ' : '')
    + m.in.n + ' takes over.';
  for (const m of moves) {
    if (m.c === L.team && L.stage === 'nba') {
      const txt = line(m);
      beats && beats.push({ kind: 'coach', text: txt, tone: '' });
      logIt(L, txt, '');
      L.m.trust = 50;
    }
  }
  const wire = moves.filter((m) => m.c !== L.team);
  L.flags.wire = wire.slice(0, 3).map(line);
  if (beats && L.stage === 'nba' && L.team) for (const m of wire.slice(0, 2)) beats.push({ kind: 'news', text: 'Around the league: ' + line(m).replace(/^The /, 'the '), tone: '' });
}
/* A sentence that ends on a name like Wes Unseld Jr. gets one full stop. */
const dot = (t) => /\.$/.test(t) ? t : t + '.';
/* The All-Star break. A club that has fallen through the floor makes a
   change in February and hands it to an assistant. Your own club goes
   through the coach_fired card instead, so the front office can ask you. */
function midseasonFirings(L, beats) {
  const lg = coachState(L);
  if (lg.my === L.year) return;
  lg.my = L.year;
  const rng = rngAt(L, 'midfire');
  for (const c of CLUBS) {
    if (c === L.team) continue;
    const x = lg.coach[c];
    if (!x || x.interim || L.year - x.since < 1) continue;
    const net = clubNet(L, c);
    const p = net <= -4.5 ? 0.12 : net <= -3 ? 0.04 : 0;
    if (rng() >= p) continue;
    fire(L, c, 0);
    const got = hire(L, c, weighted(rng, coachCandidates(L, c, true, rng), (y) => y.w), true);
    if (beats && L.stage === 'nba' && L.team) beats.push({ kind: 'news', text: 'Around the league: ' + dot('the ' + nick(c) + ' fire ' + x.n) + ' ' + got.n + ' is the interim.', tone: '' });
  }
}

// ─── the rosters around you ─────────────────────────────────────────────────

/* REAL TEAMMATES. Every club opens with its real roster from the data's last
   season, and those men age a year at a time and retire when their careers
   would. Each draft class after that adds one generated rookie a club, who
   stays about ten years. On a story career the rosters also move (rostOf,
   below); a career without the story keeps this still picture. */
function bornOf(r, first) {
  if (r.dr) return r.dr - 20;
  return (first || r.s) - 23;
}
function rosterSeed(rows, latest) {
  const first = {};
  for (const r of rows || []) if (!(first[r.i] <= r.s)) first[r.i] = r.s;
  const by = {};
  for (const r of rows || []) {
    if (r.s !== latest || CLUBS.indexOf(r.t) < 0) continue;
    (by[r.t] = by[r.t] || []).push(r);
  }
  const out = {};
  for (const c of CLUBS) out[c] = (by[c] || []).slice().sort((a, b) => b.w - a.w).slice(0, 12)
    .map((r) => [r.n, String(r.pp || r.ep || 'SF').split(';')[0], bornOf(r, first[r.i]), round1(r.w)]);
  return out;
}
const R_POS = POS;
function retireAge(L, name, w) {
  const r = E.createSeededRNG(E.hashSeed(String(L.seed) + ':ret:' + name));
  return 33 + Math.floor(r() * 4) + (w >= 8 ? 3 : w >= 5 ? 2 : w >= 2 ? 1 : 0);
}
/* THE LEAGUE MOVES (story careers). The rosters start as the data's last
   season and then live: every summer the old retire, a rookie arrives on each
   club, a handful of players change clubs in trades, more in free agency, and
   now and then a star moves. A club that gets better gets a little better on
   the floor. A career saved before this builds its rosters the first time it
   reads them, from the same seed rosters, so nobody it knew disappears. */
/* A REAL MAN'S YEAR. A roster seeded from today's file stamps each man with
   the season his worth was measured in (e.s), and he is aged from there, not
   from scratch: what a 38 year old did last season already carries his age,
   so a second discount for it took a 39 year old star to a quarter of
   himself before he had played a game. From then on a young man grows, a man in his prime holds
   and a veteran declines a little faster each year, and each man has his own
   arc (seeded off his name) so not every 22 year old makes the same leap. */
const REAL_CURVE = { 19: 1.2, 20: 1.18, 21: 1.15, 22: 1.12, 23: 1.08, 24: 1.05, 25: 1.03, 26: 1.01, 27: 1, 28: 0.98, 29: 0.96, 30: 0.93, 31: 0.9, 32: 0.87, 33: 0.84, 34: 0.82, 35: 0.8 };
function realArc(e) { const r = E.createSeededRNG(E.hashSeed('arc:' + e.n)); return (r() + r() + r()) / 3 * 2 - 1; }
function realCurW(e, Y) {
  if (Y <= e.s) return round1(e.w);
  const arc = realArc(e);
  let v = e.w;
  for (let y = e.s + 1; y <= Y; y++) {
    const a = y - e.b;
    const f = REAL_CURVE[a] || (a < 19 ? 1.2 : 0.78);
    v *= f >= 1 ? 1 + (f - 1) * (1 + arc * 0.8) : f + arc * 0.025;
  }
  return round1(Math.max(0.1, Math.min(v, Math.max(e.w * 2.6, 6))));
}
function rostCurW(e, Y) {
  if (e.s && !e.g) return realCurW(e, Y);
  const age = Y - e.b;
  const grow = e.g ? Math.min(1, 0.35 + (Y - e.d) * 0.2) : 1;
  return round1(e.w * grow * (age <= 30 ? 1 : Math.max(0.1, 1 - (age - 30) * 0.08)));
}
function rostGone(L, e, Y) {
  const age = Y - e.b;
  if (e.g) return age > 34 || Y - e.d >= 11;
  /* On today's rosters nobody leaves before the season they are under contract
     for has been played. After it the simulation decides, and a veteran past
     the usual age still gets a season or two rather than the whole old guard
     walking out in one summer. */
  const rs = L.league && L.league.rs;
  if (rs && Y <= rs) return false;
  let lim = retireAge(L, e.n, e.w);
  if (rs) {
    const r = E.createSeededRNG(E.hashSeed(String(L.seed) + ':last:' + e.n));
    lim = Math.max(lim, rs - e.b + 1 + Math.floor(r() * 2));
  }
  return age > lim;
}
function rookieFor(L, c, d) {
  const r = E.createSeededRNG(E.hashSeed(String(L.seed) + ':rook:' + c + ':' + d));
  const n = pick(r, FIRST) + ' ' + pick(r, PEOPLE_LAST);
  const peak = r() < 0.08 ? 9 : 1.5 + r() * 4;
  return { n, pos: pick(r, R_POS), b: d - 20, w: round1(peak), g: 1, d };
}
/* The rosters as the data has them, aged to season Y: a rookie a club for
   every draft after the data's, and the men who have retired by then gone. */
/* A roster tuple: name, position, born, worth, the season the worth was
   measured in, and for a man the real ratings cover his 2K overall and his
   salary for that season. */
function fromTup(p) {
  const e = p[4] ? { n: p[0], pos: p[1], b: p[2], w: p[3], s: p[4] } : { n: p[0], pos: p[1], b: p[2], w: p[3] };
  if (p[5]) e.o = p[5];
  if (p[6]) e.pay = p[6];
  return e;
}
function rostBuild(L, Y) {
  const lg = L.league, R = {};
  for (const c of CLUBS) {
    R[c] = ((lg.roster && lg.roster[c]) || []).map(fromTup);
    /* Today's rosters already carry this season's real rookies, so invented
       ones start with the next draft. */
    for (let d = (lg.rs || lg.latest || 2026) + 1; d <= Y; d++) R[c].push(rookieFor(L, c, d));
    R[c] = R[c].filter((e) => !rostGone(L, e, Y));
  }
  /* The real men past a club's fifteen: today's free agents and two-way
     players. A short club signs one of them before anybody is invented. */
  lg.pool = (lg.fa || []).map(fromTup).filter((e) => !rostGone(L, e, Y));
  if (storyOn(L)) uniqueNames(L, R, Y);
  lg.rost = R; lg.rostY = Y;
  return R;
}
function rostOf(L) {
  if (!storyOn(L) || !L.league.roster) return null;
  if (L.league.rost) return L.league.rost;
  return rostBuild(L, L.year);
}
/* A reader that jumps years plays the summers it missed, quietly. */
function rostNow(L) {
  const R = rostOf(L);
  if (R) for (let k = 0; L.league.rostY < L.year && k < 60; k++) rosterSummer(L, null, L.league.rostY + 1);
  return R;
}
/* The position a club has fewest of, so a new man fills a hole. Ties keep
   the position he was drawn at. */
function thinPos(list, drawn) {
  const n = {}; for (const p of R_POS) n[p] = 0;
  for (const e of list) if (n[e.pos] != null) n[e.pos]++;
  const lo = Math.min(...R_POS.map((p) => n[p]));
  return n[drawn] === lo ? drawn : R_POS.find((p) => n[p] === lo);
}
const clubTalent = (R, c, Y) => R[c].map((e) => rostCurW(e, Y)).sort((a, b) => b - a).slice(0, 8).reduce((a, x) => a + x, 0);
function rosterSummer(L, beats, quietY) {
  const R = rostOf(L);
  const Y = quietY || L.year;
  if (!R || L.league.rostY >= Y) return;
  /* A career dated back (L.opt.cal) is in the real past until the season
     after the data's: no trades, no signings, nobody invented. The rosters
     are the data's, built fresh for that season. */
  if (L.opt && L.opt.cal && (Y <= L.league.latest + 1 || L.stage !== 'nba')) { rostBuild(L, Math.min(Y, L.league.latest + 1)); L.league.rostY = Y; return; }
  const rng = E.createSeededRNG(E.hashSeed(String(L.seed) + ':' + Y + ':moves')), lg = L.league;
  lg.rostY = Y;
  const before = {};
  for (const c of CLUBS) before[c] = clubTalent(R, c, Y - 1);
  const news = [];
  const mine = L.stage === 'nba' && L.team;
  const pool = (lg.pool || []).filter((e) => !rostGone(L, e, Y));
  for (const c of CLUBS) {
    for (const e of R[c]) if (rostGone(L, e, Y) && !e.g && rostCurW(e, Y - 1) >= 3) news.push({ w: rostCurW(e, Y - 1), t: e.n + ' retires.', c });
    R[c] = R[c].filter((e) => !rostGone(L, e, Y));
  }
  /* ONE MOVE A MAN A SUMMER. A man traded in July is not traded again, let go
     or signed somewhere else before camp, so the news never says he went to
     two clubs. */
  const moved = new Set();
  const other = (c) => { let o = c; while (o === c) o = pick(rng, CLUBS); return o; };
  const move = (from, i, to, how) => {
    const e = R[from].splice(i, 1)[0];
    R[to].push(e);
    moved.add(e);
    news.push({ w: rostCurW(e, Y), t: e.n + (how === 'trade' ? ' is traded to the ' : ' signs with the ') + nick(to) + '.', c: from, to });
    return e;
  };
  const sign = (e, to) => {
    R[to].push(e);
    moved.add(e);
    if (!e.g) news.push({ w: rostCurW(e, Y), t: e.n + ' signs with the ' + nick(to) + '.', c: null, to });
  };
  /* Trades: two clubs swap players of about the same value. */
  const trades = 5 + Math.floor(rng() * 5);
  for (let k = 0; k < trades; k++) {
    const a = pick(rng, CLUBS), b = other(a);
    const ia = R[a].map((e, x) => x).filter((x) => !moved.has(R[a][x]));
    if (!ia.length || !R[b].length) continue;
    const i = pick(rng, ia), wa = rostCurW(R[a][i], Y);
    let j = -1, best = 99;
    R[b].forEach((e, x) => { if (moved.has(e)) return; const d = Math.abs(rostCurW(e, Y) - wa); if (d < best) { best = d; j = x; } });
    if (j < 0 || best > 1.5 + wa * 0.25) continue;
    const eb = R[b][j];
    move(a, i, b, 'trade');
    move(b, R[b].indexOf(eb), a, 'trade');
  }
  /* Now and then a star asks out. */
  if (rng() < 0.35) {
    const stars = [];
    for (const c of CLUBS) R[c].forEach((e) => { const w = rostCurW(e, Y); if (w >= 7 && Y - e.b >= 25 && !moved.has(e)) stars.push([c, e, w]); });
    if (stars.length) { const [c, e] = pick(rng, stars); move(c, R[c].indexOf(e), other(c), 'trade'); }
  }
  /* Free agency: veterans change teams, mostly toward a thin roster. */
  const fa = 10 + Math.floor(rng() * 8);
  for (let k = 0; k < fa; k++) {
    const c = pick(rng, CLUBS);
    const vets = R[c].map((e, i) => [e, i]).filter(([e]) => Y - e.b >= 24 && !moved.has(e));
    if (!vets.length) continue;
    const [, i] = pick(rng, vets);
    const thin = CLUBS.slice().sort((x, y) => R[x].length - R[y].length).slice(0, 8);
    const to = rng() < 0.6 ? pick(rng, thin.filter((x) => x !== c).length ? thin.filter((x) => x !== c) : [other(c)]) : other(c);
    move(c, i, to, 'fa');
  }
  /* Every club carries thirteen to fifteen. A long one lets its last man go,
     and an invented man before a real one of about the same worth. Nobody
     who moved this summer is let go: he was just wanted. A real man let go
     joins the free agents and can sign anywhere, which is his one move. */
  for (const c of CLUBS) {
    if (R[c].length <= 15) continue;
    const keep = (e) => rostCurW(e, Y) + (e.g ? 0 : 0.6) + (moved.has(e) ? 99 : 0);
    R[c].sort((x, y) => keep(y) - keep(x));
    for (const e of R[c].splice(15)) if (!e.g) pool.push(e);
  }
  pool.sort((x, y) => rostCurW(y, Y) - rostCurW(x, Y));
  /* A short club signs a real free agent first. Only when there is none does
     it draft a rookie, and only then a journeyman nobody has heard of. */
  const short = () => CLUBS.slice().sort((x, y) => R[x].length - R[y].length);
  for (const c of short()) while (R[c].length < 14 && pool.length) sign(pool.shift(), c);
  for (const c of CLUBS) if (R[c].length < 14) { const rk = rookieFor(L, c, Y); rk.pos = thinPos(R[c], rk.pos); R[c].push(rk); }
  for (const c of CLUBS) {
    while (R[c].length < 13) { const r = E.createSeededRNG(E.hashSeed(String(L.seed) + ':vet:' + c + ':' + Y + ':' + R[c].length)); R[c].push({ n: pick(r, FIRST) + ' ' + pick(r, PEOPLE_LAST), pos: thinPos(R[c], pick(r, R_POS)), b: Y - 27 - Math.floor(r() * 6), w: round1(0.4 + r() * 1.6), g: 1, d: Y - 6 }); }
  }
  lg.pool = pool.slice(0, 60);
  uniqueNames(L, R, Y);
  /* A club that got better plays a little better: a share of the talent it
     gained, with the league kept centred. */
  const d = {};
  let sum = 0;
  for (const c of CLUBS) { d[c] = clamp((clubTalent(R, c, Y) - before[c]) * 0.15, -2, 2); sum += d[c]; }
  for (const c of CLUBS) lg.net[c] = round1((lg.net[c] || 0) + d[c] - sum / CLUBS.length);
  /* The news: the biggest names, and anything that touches your club. */
  news.sort((x, y) => y.w - x.w);
  const told = news.filter((x) => mine && (x.c === L.team || x.to === L.team)).slice(0, 3);
  for (const x of news.slice(0, 2)) if (told.indexOf(x) < 0) told.push(x);
  for (const x of quietY ? [] : told) {
    const ours = mine && (x.c === L.team || x.to === L.team);
    if (beats && L.stage === 'nba') beats.push({ kind: 'news', text: (ours ? 'Your club: ' : 'Around the league: ') + x.t, tone: '' });
    feed(L, 'move', x.t);
    if (ours) logIt(L, x.t, '');
  }
}
/* NO TWO MEN IN THE LEAGUE SHARE A NAME. Generated rookies are drawn from
   two short lists, so two clubs drew the same man in about one season in
   four, and the deadline then printed "Mateo Tisdell to the Heat, Mateo
   Tisdell to the Timberwolves". A clash is redrawn until it is gone. */
function uniqueNames(L, R, Y) {
  const seen = new Set();
  for (const c of CLUBS) for (const e of R[c]) {
    if (!seen.has(e.n)) { seen.add(e.n); continue; }
    if (!e.g) continue;
    for (let k = 1; k < 40 && seen.has(e.n); k++) {
      const r = E.createSeededRNG(E.hashSeed(String(L.seed) + ':rename:' + c + ':' + Y + ':' + e.n + ':' + k));
      e.n = pick(r, FIRST) + ' ' + pick(r, PEOPLE_LAST);
    }
    seen.add(e.n);
  }
}
/* Who is on club c in the current year, best first. */
/* EVERY PLAYER HAS AN OVERALL, ON YOUR SCALE. A man's worth is what he
   produces a season (win shares, measured off his real seasons and aged),
   and it is read onto the same 0 to 99 scale your own overall is on, fitted
   so a club's best man is about a 78, its fifth about a 69, its ninth about
   a 63, a star in the high 80s. The table was read off today's rosters by rank
   against where a career's overall sits: a typical rookie 62, a typical
   peak 75, a star's peak in the high 80s, so a rookie starts around the
   eighth man and a typical peak is a starter. Minutes, the starting five and
   a club's strength all compare these numbers, so a 77 in his second year
   plays behind the better players on his club. */
/* THE SCALE A PLAYER READS IS NBA 2K'S. Inside, every overall is the
   model's: a rookie about 62, a typical peak 75, an MVP 92, and every rule
   and balance band in this file is written on that. What is printed is
   that number on the 2K scale, which runs to 99 and is the one fans know:
   a rookie about a 75, a good starter in the mid 80s, the best men in the
   league 96 and 97. Fitted by putting today's league in order both ways
   (the model's reading of 450 men against their 2K27 ratings), so a man
   who ranks 30th reads what the 30th best 2K rating is. It is monotone, so
   nothing that compares two overalls can come out differently. */
const SHOW = [[0, 30], [30, 45], [45, 58], [55, 68], [60, 73], [62, 75], [65, 78], [68, 80], [72, 82], [75, 84], [78, 87], [81, 90], [84, 92], [87, 94], [90, 96], [93, 97.5], [96, 98.5], [99, 99]];
function lerpT(T, x, i, j) {
  if (x <= T[0][i]) return T[0][j];
  for (let k = 1; k < T.length; k++) if (x <= T[k][i]) { const a = T[k - 1], b = T[k]; return a[j] + (x - a[i]) / (b[i] - a[i]) * (b[j] - a[j]); }
  return T[T.length - 1][j];
}
/* Copy a story career prints is on the 2K scale; a save from before keeps
   the words it was written with. */
function ovT(L, o) { return storyOn(L) ? show(o) : o; }
function show(o) { return o == null || isNaN(o) ? o : Math.round(lerpT(SHOW, o, 0, 1)); }
function showInv(o) { return round1(lerpT(SHOW, o, 1, 0)); }
const W_OVR = [[0, 54], [1, 59], [2.2, 63], [3.7, 69], [5.1, 74], [6.6, 78], [9.7, 85], [13, 90], [16, 94]];
function mateOvrX(w) {
  const x = Math.max(0, w);
  for (let k = 1; k < W_OVR.length; k++) if (x <= W_OVR[k][0]) {
    const [a, oa] = W_OVR[k - 1], [b, ob] = W_OVR[k];
    return oa + (x - a) / (b - a) * (ob - oa);
  }
  return W_OVR[W_OVR.length - 1][1];
}
function mateOvr(w) { return Math.round(mateOvrX(w)); }
/* The worth a man of this overall carries: W_OVR read backwards. */
function wFromOvr(o) {
  if (o <= W_OVR[0][1]) return W_OVR[0][0];
  for (let k = 1; k < W_OVR.length; k++) if (o <= W_OVR[k][1]) {
    const [a, oa] = W_OVR[k - 1], [b, ob] = W_OVR[k];
    return round1(a + (o - oa) / (ob - oa) * (b - a));
  }
  return W_OVR[W_OVR.length - 1][0];
}
/* A man the real ratings cover keeps his exact rating, moved only by what the
   years have done to him since; anybody else is read off his worth. */
function ovrOfMan(e, w) {
  if (!e.o) return mateOvr(w);
  return round1(showInv(e.o) + mateOvrX(w) - mateOvrX(e.w));
}
/* What a man is paid. His real salary for the season it is for; after that a
   market figure off his overall, because nobody here knows his next deal. */
function payOf(L, e, Y, w) {
  if (e.pay && Y <= (e.s || 0)) return e.pay;
  if (e.pay && !e.o && Y <= ((L.league && L.league.rs) || 0)) return e.pay;
  return marketPay(L, show(ovrOfMan(e, w)), Y - e.b);
}
/* The 2026-27 market, read off the real salaries against the real ratings
   (the median pay at each overall): a minimum deal in the low 70s, about $11M
   at 79, about $32M at 84, a max from 90 up. A man past 35 takes less.
   Scaled with the cap after that season. */
const PAY_AT = [[60, 1.3], [70, 2.3], [74, 3.5], [76, 6], [79, 11], [81, 18], [84, 32], [87, 40], [90, 52], [93, 57], [99, 62]];
function marketPay(L, o, age) {
  let v = PAY_AT[PAY_AT.length - 1][1];
  for (let k = 1; k < PAY_AT.length; k++) if (o <= PAY_AT[k][0]) { const [a, va] = PAY_AT[k - 1], [b, vb] = PAY_AT[k]; v = va + (Math.max(o, a) - a) / (b - a) * (vb - va); break; }
  if (age >= 35) v = Math.min(v, 12);
  const y = L.year || 2027;
  return round1(v * (capFor(y) / capFor(2027)));
}
function matesOf(L, c) {
  const lg = L.league;
  const Y = L.year;
  const R = rostNow(L);
  if (R && R[c]) return R[c].filter((e) => !rostGone(L, e, Y)).map((e) => { const w = rostCurW(e, Y); return { n: e.n, pos: e.pos, age: Y - e.b, w, ovr: ovrOfMan(e, w), real: e.g ? 0 : 1, pay: payOf(L, e, Y, w) }; }).sort((a, b) => b.w - a.w);
  const out = [];
  const base = lg.roster && lg.roster[c];
  if (base) {
    for (const p of base) {
      const age = Y - p[2];
      if (!rostGone(L, { n: p[0], b: p[2], w: p[3] }, Y)) out.push({ n: p[0], pos: p[1], age, w: p[3] * (age <= 30 ? 1 : 1 - (age - 30) * 0.08), real: 1 });
    }
  } else {
    const age = 27 + Y - ((lg.latest || 2026) + 1);
    if (age <= 35) for (const n of (lg.stars && lg.stars[c]) || []) out.push({ n, pos: '', age, w: 6, real: 1 });
  }
  for (let d = (lg.rs || lg.latest || 2026) + 1; d <= Y; d++) {
    if (Y - d >= 10) continue;
    const r = E.createSeededRNG(E.hashSeed(String(L.seed) + ':rook:' + c + ':' + d));
    const n = pick(r, FIRST) + ' ' + pick(r, PEOPLE_LAST);
    const peak = r() < 0.08 ? 9 : 1.5 + r() * 4;
    const yrs = Y - d;
    out.push({ n, pos: pick(r, R_POS), age: 20 + yrs, w: round1(peak * Math.min(1, 0.35 + yrs * 0.2)), real: 0 });
  }
  for (const m of out) m.ovr = mateOvr(m.w);
  return out.sort((a, b) => b.w - a.w);
}
/* School teammates are generated, keyed on the school and the year. */
function amMates(L) {
  const school = L.am ? (L.am.college || (L.am.hs && L.am.hs.name) || 'school') : 'school';
  const out = [];
  for (let k = 0; k < 8; k++) {
    const r = E.createSeededRNG(E.hashSeed(String(L.seed) + ':ammate:' + school + ':' + (L.year - (k % 4)) + ':' + k));
    out.push({ n: pick(r, FIRST) + ' ' + pick(r, PEOPLE_LAST), pos: pick(r, R_POS), age: L.age + (k % 3) - 1, w: 5 - k * 0.4, real: 0 });
  }
  return out;
}
function myMates(L) {
  if (L.stage !== 'nba') return amMates(L);
  if (!L.team) return amMates(L);
  return matesOf(L, L.team);
}

// ─── who a line is about ────────────────────────────────────────────────────

/* A school keeps its coach until he leaves for the league. */
function colCoachName(L, school) {
  const v = L.am && L.am.college === school ? (L.am.cv || 0) : 0;
  return personName(L, 'colcoach:' + school + ':' + v);
}
/* The coach a line means, wherever the career is. */
function myCoach(L) {
  if (L.stage !== 'nba' && L.am) {
    if (L.am.level === 'col' && L.am.college) return colCoachName(L, L.am.college);
    if (L.am.level === 'pro') return personName(L, 'procoach:' + (L.am.route || 'gl'));
    return personName(L, 'hscoach:' + (L.am.hs ? L.am.hs.name : 'hs'));
  }
  if (L.team) return coachName(L, L.team) || personName(L, 'coach:' + L.team);
  return personName(L, 'eurocoach');
}
function mateBy(L, tag) {
  const list = myMates(L).slice(0, 9);
  if (!list.length) return personName(L, 'mate:' + tag);
  const r = rngAt(L, 'mate:' + tag);
  return list[Math.floor(r() * list.length)].n;
}
/* ─── the invented locker room ─────────────────────────────────────────────
   REAL PEOPLE STAY ON THE COURT. The players and coaches off the data appear in
   games, rosters, trades, awards, hirings and firings, and nowhere else: never
   in a quote, a feud, a night out or a podcast. The drama a locker room makes
   has to belong to somebody, so every club carries three invented players, seeded
   per career, club and three-season era, who turn over the way a real bench does.
   {tm} and {tm2} are two of them, {tvet} the veteran, {trook} the rookie and {tco}
   the other scorer. {topp} is an invented player on another club. check-career
   section 5c fails on a real token in any event that is not about basketball. */
const LOCKER_ROLES = [['vet', 31, 4], ['rook', 20, 2], ['co', 25, 3]];
function lockerOf(L, club) {
  club = club || L.team || (L.am && (L.am.college || (L.am.hs && L.am.hs.name))) || 'am';
  return LOCKER_ROLES.map(function(x, i) {
    const era = Math.floor((L.year + i) / 3);
    const key = 'lk:' + club + ':' + x[0] + ':' + era;
    const r = rngAt({ seed: L.seed, year: 0 }, key);
    return { n: personName(L, key), role: x[0], age: x[1] + Math.floor(r() * x[2]) };
  });
}
function lockerBy(L, tag) {
  const m = lockerOf(L);
  const r = rngAt(L, 'lkby:' + tag);
  return m[Math.floor(r() * m.length)].n;
}
/* The recurring cast: invented people with fixed names, the same in every
   career, so they become familiar. NARRATIVE.md section 9 is who they are. */
/* Which tokens resolve to a real person. An event that is not on the list
   below may not use one, and check-career holds that. The list is short and
   every entry says why it is basketball. */
const REAL_TOKENS = ['vet', 'star', 'blocker', 'rookie', 'mate', 'mate2', 'opp', 'opp2', 'coach', 'oldcoach', 'firedcoach', 'interim', 'bigname', 'rivalcoach'];
const INVENTED_TOKENS = ['tm', 'tm2', 'tvet', 'trook', 'tco', 'topp', 'rival', 'beat', 'critic', 'fan', 'shoeexec', 'aau', 'friend', 'trainer', 'press', 'pbp', 'ellis', 'lazlo', 'gm', 'owner', 'agent', 'foe', 'oldvet', 'campkid', 'bff',
  'sonny', 'maya', 'dre', 'father', 'rookie2', 'costar', 'exec', 'mascot'];
const BASKETBALL_ONLY = {
  slump: 'the coach shortens a rotation leash',
  coach_bench: 'the coach decides minutes',
  stuck: 'a real starter is ahead of you and the coach decides who plays',
  film_session: 'film, scheme and the coach running it',
  hot_streak: 'the coach runs more plays for you',
  coach_fired: 'a coaching change: hirings and firings',
  teammate_fight: 'the coach runs practice; the teammate is invented',
  playoff_eve: 'the coach hands out a defensive assignment',
};
const CAST = {
  beat: 'Kelvin Shaw', critic: 'Bram Talbot', fan: 'Big Lou Petrakis', trainer: 'Nadia Ferro',
  shoeexec: 'Grant Hollis', aau: 'Ed Vickers', friend: 'Tavian Price', press: 'June Kimura', pbp: 'Rocco Vance',
  shadyagent: 'Sonny Rial', straightagent: 'Maya Okonkwo', ellis: 'Old Man Ellis', lazlo: 'Victor Lazlo', dre: 'Dre Calloway',
};
function agentNameFor(L, k) {
  return k === 'cousin' ? kinName(L, 'cousin', 'm') : personName(L, 'agent:' + k, k === 'power' ? 'm' : 'f');
}
function peopleKey(L, k) {
  const ag = L.agent || 'boutique';
  switch (k) {
    case 'coach': return myCoach(L);
    case 'hscoach': return personName(L, 'hscoach:' + (L.am && L.am.hs ? L.am.hs.name : (L.flags.hsName || 'hs')));
    case 'gm': return personName(L, 'gm:' + (L.team || 'none'));
    case 'owner': return personName(L, 'owner:' + (L.team || 'none'));
    case 'agent': return agentNameFor(L, ag);
    case 'newagent': return agentNameFor(L, 'power');
    case 'cousin': return kinName(L, 'cousin', 'm');
    case 'mom': return firstOf(kinName(L, 'mom', 'f'));
    case 'dad': return firstOf(kinName(L, 'dad', 'm'));
    case 'partner': return firstOf(personName(L, 'partner:' + (lifeOf(L).pn || 0), 'x'));
    case 'trainer': return CAST.trainer;
    case 'doctor': return personName(L, 'doctor:' + (L.team || 'am'), 'x');
    case 'scout': return personName(L, 'scout:' + L.year);
    case 'booster': return personName(L, 'booster:' + (L.am && L.am.college || ''));
    case 'roommate': return personName(L, 'roommate:' + (L.am && L.am.college || ''));
    case 'friend': return CAST.friend;
    case 'reporter': return personName(L, 'reporter:' + L.year, 'x');
    case 'adviser': return personName(L, 'adviser:' + (L.am && L.am.college || ''), 'f');
    case 'commish': return personName(L, 'commish');
    case 'streetagent': return personName(L, 'street');
    case 'vet': { const m = myMates(L).slice().sort((a, b) => b.age - a.age); return m.length ? m[0].n : personName(L, 'vet'); }
    case 'star': { const m = myMates(L); return m.length ? m[0].n : personName(L, 'star'); }
    case 'blocker': { const m = myMates(L).filter((x) => x.pos === L.pos); return (m[0] || myMates(L)[0] || { n: personName(L, 'blocker') }).n; }
    case 'rookie': { const m = myMates(L).slice().sort((a, b) => a.age - b.age); return m.length ? m[0].n : personName(L, 'rookie'); }
    case 'mate': return mateBy(L, 'a:' + L.steps);
    case 'mate2': return mateBy(L, 'b:' + L.steps);
    case 'oldcoach': return (L.flags.leave && L.flags.leave.n) || myCoach(L);
    case 'leaveclub': return L.flags.leave ? nick(L.flags.leave.club) : 'Pistons';
    case 'tutor': return personName(L, 'tutor', 'f');
    case 'prof': return personName(L, 'prof:' + (L.am && L.am.college || ''), 'x');
    case 'prepstar': return personName(L, 'prepstar:' + (L.am ? L.am.town : ''));
    case 'coachson': return firstOf(personName(L, 'son')) + ' ' + lastOf(myCoach(L));
    case 'crush': return firstOf(personName(L, 'crush', 'x'));
    case 'colcoach2': return personName(L, 'campcoach:' + L.year);
    case 'firedcoach': return (L.flags.search && L.flags.search.out) || coachName(L, L.team);
    case 'interim': return (L.flags.search && L.flags.search.asst && L.flags.search.asst.n) || myCoach(L);
    case 'bigname': return (L.flags.search && L.flags.search.big && L.flags.search.big.n) || myCoach(L);
    case 'opp': case 'opp2': return oppStar(L, k);
    case 'tm': return lockerBy(L, 'a:' + L.steps);
    case 'tm2': { const m = lockerOf(L), x = lockerBy(L, 'a:' + L.steps); const o = m.filter((p) => p.n !== x); return (o[0] || m[0]).n; }
    case 'tvet': return lockerOf(L)[0].n;
    case 'trook': return lockerOf(L)[1].n;
    case 'tco': return lockerOf(L)[2].n;
    case 'topp': return personName(L, 'topp:' + L.steps);
    case 'rival': return L.rival ? L.rival.name : CAST.dre;
    case 'foe': return arcData(L, 'feud').n || personName(L, 'foe');
    case 'oldvet': return arcData(L, 'mentor').n || personName(L, 'oldvet');
    case 'campkid': return arcData(L, 'gym').kid || personName(L, 'campkid');
    case 'school2': return arcData(L, 'prep').school || 'State';
    case 'bff': { const b = bestMate(L); return b ? b.n : lockerOf(L)[0].n; }
    case 'beat': case 'critic': case 'fan': case 'shoeexec': case 'aau': case 'press': case 'pbp': case 'ellis': case 'lazlo': return CAST[k];
    case 'sonny': return CAST.shadyagent;
    case 'maya': return CAST.straightagent;
    case 'dre': return CAST.dre;
    case 'father': return kinName(L, 'dad', 'm');
    case 'town': return (L.am && L.am.town) || L.flags.town || 'home';
    case 'abroad': { const m = recall(L, 'origin.abroad'); return m ? m.v : 'home'; }
    case 'school': { if (L.am && L.am.college) return L.am.college; const h = (L.amHist || []).filter((x) => x.lvl === 'NCAA').pop(); return h ? h.school : 'your old school'; }
    case 'club': return L.team ? nick(L.team) : 'club';
    case 'rookie2': return personName(L, 'rookie2:' + (L.team || '') + ':' + Math.floor(L.year / 3));
    case 'costar': return arcData(L, 'costar').n || personName(L, 'costar');
    case 'exec': return personName(L, 'exec:' + L.year, 'x');
    case 'mascot': return 'Rumble';
    case 'ref': return personName(L, 'ref:' + L.steps);
    case 'guru': return personName(L, 'guru', 'x');
    case 'rivalcoach': { const r = rngAt(L, 'rc:' + L.steps); const cs = CLUBS.filter((c) => c !== L.team); return coachName(L, pick(r, cs)); }
    default: return null;
  }
}
/* A real star on another club, for a line about somebody across the league.
   The same conference first, because that is who you see four times. */
function oppStar(L, k) {
  const r = rngAt(L, 'opp:' + L.steps);
  const conf = L.team ? confOf(L.team) : 'East';
  const clubs = CLUBS.filter((c) => c !== L.team && confOf(c) === conf);
  const c1 = pick(r, clubs);
  let c2 = pick(r, clubs);
  if (c2 === c1) c2 = clubs[(clubs.indexOf(c1) + 1) % clubs.length];
  const m = matesOf(L, k === 'opp2' ? c2 : c1);
  return m.length ? m[0].n : personName(L, 'opp:' + k);
}
/* Fills {coach}, {mom}, {vet:last} and the rest. A token nobody knows is
   left as it is, so check-career can find it. */
const TOKEN = /\{([a-z0-9]+)(?::(last|first))?\}/gi;
function say(L, s) {
  if (typeof s !== 'string' || s.indexOf('{') < 0) return s;
  return s.replace(TOKEN, (m, k, part) => {
    const v = peopleKey(L, k.toLowerCase());
    if (v == null) return m;
    return part === 'last' ? lastOf(v) : part === 'first' ? firstOf(v) : v;
  }).replace(/\b(Jr|Sr)\.\./g, '$1.');
}
/* The card on top, every beat, and the last answer, said in names. Only the
   card on top: one waiting behind it is named when it gets there, so a coach
   fired by the card in front is not the coach the next card talks about. */
function sayAll(L, beats) {
  for (const c of L.pending.slice(0, 1)) {
    if (c.named) continue;
    c.named = 1;
    c.title = say(L, c.title); c.text = say(L, c.text); c.eyebrow = say(L, c.eyebrow);
    for (const o of c.options || []) { o.label = say(L, o.label); if (o.hint) o.hint = say(L, o.hint); }
  }
  for (const b of beats || []) if (b && b.text) b.text = say(L, b.text);
}

// ─── a new life ─────────────────────────────────────────────────────────────

function randomName(seed) {
  const rng = E.createSeededRNG(E.hashSeed('name:' + seed));
  return pick(rng, FIRST) + ' ' + pick(rng, LAST);
}

/* HOW HE LOOKS. Owned by the career so it rides in the life slot and follows
   the account, and drawn by hoops/baller.js, which is the only file that
   knows what any of these values means. So this keeps a whitelist of short
   plain values and nothing else: a look from another device, or one somebody
   edited by hand, can only ever be a look the drawing falls back on. */
const LOOK_KEYS = ['skin', 'hair', 'hc', 'bc', 'beard', 'band', 'sleeve', 'shoes', 'build'];
function cleanLook(o) {
  const out = {};
  if (!o || typeof o !== 'object') return out;
  for (const k of LOOK_KEYS) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = clamp(Math.round(v), 0, 99);
    else if (typeof v === 'string' && /^[a-z0-9]{1,12}$/.test(v)) out[k] = v;
  }
  return out;
}
function setLook(L, look) { L.look = cleanLook(look); return L.look; }

function newLife(opts) {
  const o = opts || {};
  const seed = o.seed != null ? String(o.seed) : String(Math.floor(Math.random() * 1e9));
  const pos = POS.indexOf(o.pos) >= 0 ? o.pos : 'SF';
  const arch = ARCHES[o.arch] && (!ARCHES[o.arch].pos || ARCHES[o.arch].pos === pos) ? o.arch : 'twoway';
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
    league: { latest: league.latest || 2026, net: Object.assign({}, league.net), stars: league.stars || {}, roster: league.roster || null },
    life: { rel: 'single', kids: 0, since: 0 }, rival: null,
    look: cleanLook(o.look), rep: { fans: 50, resp: 50 },
    season: null, seasonsDone: 0, retired: false, final: null, steps: 0,
    mem: {}, people: {}, traits: rollTraits(seed), opt: { legend: o.legend !== false, moments: o.moments !== false },
  };
  if (o.story !== false) L.opt.story = STORY_VERSION;
  /* Last season's lines, for the rotation screen and the Saturday contests. */
  if (L.opt.story && league.lines) L.league.lines = league.lines;
  /* The season the rosters are real for, and who coaches each club then. A
     league seeded without rosters.json carries neither, and is the same
     object it always was. */
  if (league.rs) L.league.rs = league.rs;
  if (league.cn && Object.keys(league.cn).length) L.league.cn = league.cn;
  /* Phase E: a difficulty and a challenge are story career settings. A
     challenge can fix the difficulty; Normal is never written, so a career
     without one is the same object it always was. */
  const ch = L.opt.story && CHALLENGES[o.challenge] ? o.challenge : null;
  const dk = ch && CHALLENGES[ch].diff ? CHALLENGES[ch].diff : o.diff;
  if (L.opt.story && dk && dk !== 'normal' && DIFFS[dk]) L.opt.diff = dk;
  if (ch) L.challenge = ch;
  L.year = L.league.latest + 1;
  /* THE ROAD ENDS IN TODAY'S LEAGUE. A sophomore who started in the data's
     newest season reached the draft four or more summers later, into a league
     that had drifted that long: clubs regressed to the middle, stars traded,
     benches turned over. The real league was gone before he got there. So a
     story career that starts in high school is dated ROAD_LEAD years back,
     which puts the usual draft (after a freshman year of college) on the real
     draft, and the league does not move until then (driftLeague). A longer
     road arrives in a league that has moved for the extra years, which is
     true to the road. A son keeps his father's calendar. */
  if (road && L.opt.story && !(L.opt.story && cleanParent(o.parent))) { L.year -= ROAD_LEAD; L.opt.cal = 1; }
  const parent = L.opt.story ? cleanParent(o.parent) : null;
  if (parent) legacyLeague(L, parent, o.parentLeague, road ? AGE_HS : bg.age);
  const rng = E.createSeededRNG(E.hashSeed(seed + ':create'));
  if (L.num == null) L.num = Math.floor(rng() * 100);
  /* A size is kept when the builder picked one, or on a story career, which
     stands at the middle of its position when nobody did, so a sweep that
     passes none makes the same player it always made. */
  const z = POS_SIZE[pos];
  if (Number.isFinite(+o.ht) || L.opt.story) {
    L.ht = Number.isFinite(+o.ht) ? clamp(Math.round(+o.ht), z.ht[0], z.ht[1]) : z.mid;
    const wr = wtRange(L.ht);
    L.wt = Number.isFinite(+o.wt) ? clamp(Math.round(+o.wt / 5) * 5, wr[0], wr[1]) : wtFor(L.ht);
  }
  const st = Number.isFinite(L.ht) ? sizeTilt(pos, L.ht, L.wt) : {};
  const prof = POS_PROFILE[pos], tilt = ARCHES[arch].tilt, bt = road ? {} : (bg.tilt || {});
  const base = road ? ROAD_BASE : bg.base;
  for (const k of RATINGS) {
    L.rt[k] = clamp(Math.round(base + (prof[k] || 0) + (tilt[k] || 0) + (bt[k] || 0) + (st[k] || 0) + norm(rng) * 3), road ? 25 : 30, 88);
  }
  /* NO TWO CAREERS START IN ONE PLACE (story careers). Two things you do
     better than your position and your build say, one thing you do worse,
     and how much the town is talking about you, off their own stream so no
     other draw moves. Two players with the same builder settings are two
     different kids. */
  if (L.opt.story) {
    const sr = E.createSeededRNG(E.hashSeed(seed + ':sig'));
    const ks = RATINGS.slice();
    for (let i = ks.length - 1; i > 0; i--) { const j = Math.floor(sr() * (i + 1)); const t = ks[i]; ks[i] = ks[j]; ks[j] = t; }
    const off = Math.round(norm(sr) * 1.5);
    for (const k of RATINGS) L.rt[k] += off;
    L.rt[ks[0]] += 4 + Math.floor(sr() * 4);
    L.rt[ks[1]] += 2 + Math.floor(sr() * 3);
    L.rt[ks[2]] -= 5 + Math.floor(sr() * 4);
    /* Zero sum: the rest give back what the two strengths took, so a
       signature is a shape, not a better player. */
    for (const k of ks.slice(3)) L.rt[k] -= 1;
    for (const k of RATINGS) L.rt[k] = clamp(L.rt[k], road ? 25 : 30, 88);
    L.flags.sig = { up: [ks[0], ks[1]], down: ks[2] };
    if (road) L.m.fame = clamp(2 + Math.floor(sr() * 12), 0, 100);
  }
  /* Skewed low: most ceilings are a starter's, and a few are the roof. */
  L.pot = road ? Math.round(ROAD_POT[0] + Math.pow(rng(), ROAD_POT[2]) * (ROAD_POT[1] - ROAD_POT[0]))
    : Math.round(bg.pot[0] + Math.pow(rng(), 1.7) * (bg.pot[1] - bg.pot[0]));
  L.eth = Math.round(45 + rng() * 40);
  L.dur = Math.round(45 + rng() * 45);
  /* Size has a price: a body that is tall or heavy for its spot breaks down
     sooner, and a light one holds up a little better. */
  if (Number.isFinite(L.ht)) { const sz = sizeOf(L); L.dur = clamp(Math.round(L.dur - Math.max(0, sz.dh) * 1.5 - Math.max(0, sz.dw) * 2.5 + Math.max(0, -sz.dw) * 1.5), 25, 95); }
  /* Where you are from, and on draft night the road you took to get here. */
  if (L.opt.story) {
    setOrigin(L, parent ? 'pro_son' : o.origin);
    if (parent) {
      /* The mark to pass is the real one, and a famous name is a little
         famous from the first day. */
      remember(L, 'origin.father', parent.pts);
      L.m.fame = clamp(L.m.fame + (parent.hof ? 6 : parent.star ? 3 : 0), 0, 100);
    }
    if (!road) L.flags.town = pick(E.createSeededRNG(E.hashSeed(seed + ':town')), HOMETOWNS);
    if (!road) remember(L, 'route.' + ({ oad: 'oad', senior: 'four', intl: 'intl', gl: 'gl' }[bgKey]), true);
  }
  if (road) {
    L.cash = 0;
    newRoad(L, rng);
    logIt(L, L.name + ', ' + POS_NAME[pos].toLowerCase() + '. A sophomore at ' + L.am.hs.name + '. Age ' + L.age + '.', 'gold');
    const rn = (k) => k === 'iq' ? 'basketball IQ' : RATING_NAME[k].toLowerCase();
    if (L.flags.sig) logIt(L, 'Your ' + rn(L.flags.sig.up[0]) + ' is ahead of your age. Your ' + rn(L.flags.sig.down) + ' is behind it.', '');
    queueEvents(L, 'hs_sum', L.opt.story || rngAt(L, 'n:sum')() < 0.5 ? 1 : 0, AM_EVENTS);
    sayAll(L);
    return L;
  }
  logIt(L, L.name + ', ' + POS_NAME[pos].toLowerCase() + '. ' + bg.name + '. Age ' + L.age + '.', 'gold');
  chStock(L);
  L.pending.push(combineCard(L));
  sayAll(L);
  return L;
}

// ─── the save, and how an old one is brought forward ────────────────────────

/* A SAVE IS A VERSIONED OBJECT AND EVERY READER MIGRATES IT. Version 1 was
   written as `v: 1` and never read, so there was no way to give an old career a
   field a new feature needs. migrate() is called by the page on every load and
   on every cloud adopt, before anything else touches the career. It is
   idempotent (a second call changes nothing) and it never moves a number the
   season sim reads, so an old career plays on exactly as it would have.

   v2 adds the story engine's containers:
     mem     { key: { y, v } }  what the career remembers, stamped with the year
     people  { id: { role, n, met, rel, notes } }  the invented people met
     traits  { name: { has, known } }  hidden traits, rolled off the seed
     opt     { legend }  per-career settings */
const TRAITS = ['clutch', 'coachable', 'injuryProne', 'lateBloomer', 'lockerVoice', 'gymRat', 'hothead', 'bigStage', 'ironMan', 'filmJunkie', 'spender', 'saver', 'showman', 'loyal', 'mercenary'];
/* A trait a career has, off its own stream so rolling it moves no other draw.
   Pairs that contradict each other are settled the same way every time. */
function rollTraits(seed) {
  const r = E.createSeededRNG(E.hashSeed(String(seed) + ':traits'));
  const t = {};
  for (const k of TRAITS) t[k] = { has: r() < 0.22, known: false };
  if (t.spender.has && t.saver.has) t.saver.has = false;
  if (t.loyal.has && t.mercenary.has) t.mercenary.has = false;
  if (t.injuryProne.has && t.ironMan.has) t.ironMan.has = false;
  return t;
}
function migrate(L) {
  if (!L || typeof L !== 'object') return L;
  const v = +L.v || 1;
  if (v < 2) {
    if (!L.mem || typeof L.mem !== 'object') L.mem = {};
    if (!L.people || typeof L.people !== 'object') L.people = {};
    if (!L.traits || typeof L.traits !== 'object') L.traits = rollTraits(L.seed);
    if (!L.opt || typeof L.opt !== 'object') L.opt = { legend: true };
    /* A version 1 career remembered a few things only as flags. Carry them
       into memory so a callback can find them. */
    const f = L.flags || {};
    if (f.home) remember(L, 'hometown.played', true);
    if (f.g7) remember(L, 'g7.made', f.g7);
    if (f.rivalWins) remember(L, 'rival.beat', f.rivalWins);
  }
  for (const k of TRAITS) if (!L.traits[k]) L.traits[k] = { has: false, known: false };
  L.v = LIFE_VERSION;
  return L;
}
/* Memory. `remember` stamps the year; `recall` answers the record or null. */
function remember(L, key, val) { if (!L.mem) L.mem = {}; L.mem[key] = { y: L.year, v: val === undefined ? true : val }; return L.mem[key]; }
function recall(L, key) { return L.mem && L.mem[key] ? L.mem[key] : null; }
function hasTrait(L, k) { return !!(L.traits && L.traits[k] && L.traits[k].has); }
/* A STORY CAREER is one started after Phase C. Everything that changes what a
   career is dealt is behind this, so a save from before plays on unchanged. */
const STORY_VERSION = 1;
const storyOn = (L) => !!(L && L.opt && L.opt.story);
/* A STORY CAREER IS TUNED TO NARRATIVE.md section 10, measured by
   sim-career.mjs over a thousand careers. The traits, arcs and the build all
   lean a career upward, so the bar is set where the whole of it lands in the
   bands. A migrated save keeps the old numbers, as it keeps everything. */
const BAL = { star: 5, dec: 1.4, poTax: 3.5, maxAge: 38, tired: 31 };
const bal = (L, k, old) => storyOn(L) ? BAL[k] : old;
/* DIFFICULTY (Phase E). Normal is every career before this, to the bit: each
   term is a multiply by one or an add of nought. Easy and Hard move how fast
   a player grows, how fast he declines, how often he is hurt and what he is
   worth to a team, and are measured by sim-career.mjs against Normal. An Easy
   career is for the story: it is not filed to the Career board and earns no
   badges (career-ui.js). */
const DIFFS = {
  easy: { name: 'Easy', blurb: 'More growth, fewer injuries. For the story. Not on the board.', grow: 1.3, dec: 0.8, inj: 0.65, edge: 1 },
  normal: { name: 'Normal', blurb: 'The game as it is balanced.', grow: 1, dec: 1, inj: 1, edge: 0 },
  hard: { name: 'Hard', blurb: 'Slower growth, harder knocks. Every ring is earned.', grow: 0.85, dec: 1.15, inj: 1.25, edge: -0.6 },
};
const DIFF_KEYS = Object.keys(DIFFS);
const lvl = (L) => DIFFS[L.opt && L.opt.diff] || DIFFS.normal;

// ─── draft night ────────────────────────────────────────────────────────────

/* Where the board has you, before anything you do this week. */
function draftStock(L) {
  const fx = L.flags.stock || 0;
  /* Scouts draft the ceiling, so a year older is a little less to dream on. */
  return ovrOf(L) * 0.75 + L.pot * 0.45 + L.m.fame * 0.06 + fx - (L.age - 20) * 1.2;
}
function projectedPick(L, extra) {
  const s = draftStock(L) + (extra || 0);
  /* A story career's board is spread the way a real one is: a quarter of a
     class in the lottery, the first round deeper, and a real undrafted tail. */
  if (storyOn(L)) {
    /* A rec league player is on nobody's board until somebody films him. */
    if (s < 74.5 || (recall(L, 'route.rec') && !recall(L, 'rec.viral'))) return 61;
    return clamp(Math.round(60 / (1 + Math.exp((s - 81.7) / 4.6))) + 1, 1, 61);
  }
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

/* THE COMBINE (story careers). Testing, two interviews and a private
   workout, and none of them is a choice of where you go. A club you impress
   is more likely to take you if it picks near where the board has you, and a
   good week moves the board a little. Where you land is still the board's. */
const CLUB_STYLE = ['culture', 'swagger', 'grit'];
const styleOf = (L, c) => CLUB_STYLE[E.hashSeed(String(L.seed) + ':style:' + c) % 3];
function intrOf(L) { return L.flags.intr || (L.flags.intr = {}); }
/* The club that told you it loved you: an old promise, or the room you
   impressed most at the combine. */
function lovedBy(L) {
  if (L.flags.promise) return L.flags.promise.club;
  const I = L.flags.intr || {};
  let best = null;
  for (const c in I) if (I[c] >= 6 && (!best || I[c] > I[best])) best = c;
  return best;
}
/* Clubs that pick near where the board has you, so the rooms you are in are
   the rooms that could call your name. Seeded, never chosen. */
function combineClubs(L) {
  const order = draftOrder(L), proj = projectedPick(L);
  const rng = rngAt(L, 'cmb:clubs');
  const lo = clamp(proj - 8, 1, 52), hi = clamp(proj + 10, 9, 60);
  const out = [];
  for (let k = 0; k < 40 && out.length < 3; k++) {
    const c = order[lo - 1 + Math.floor(rng() * (hi - lo + 1))];
    if (c && out.indexOf(c) < 0) out.push(c);
  }
  return out;
}
/* Questions a front office asks, about you. A question the road gave you a
   reason to be asked comes first. */
const CMB_Q = [
  { id: 'weak', when: () => true, q: 'What is the worst part of your game?',
    a: [['Name it, and how you are fixing it', { culture: 2, grit: 1 }, [0, 3], 'He nods. "Nobody says that." He writes for a while.'],
      ['Say defense, then talk about effort', { grit: 2 }, [0, 1], 'Safe. He has heard it before. He likes the effort part.'],
      ['Say you do not have one', { swagger: 2, culture: -2 }, [3, -2], 'He laughs. You cannot tell which way.']] },
  { id: 'injury', when: (L) => !!(recall(L, 'inj.col') || recall(L, 'inj.hs')), q: 'Tell us about the injury.',
    a: [['Walk them through the rehab', { culture: 2, grit: 1 }, [0, 3], 'You know every week of it. Their doctor smiles.'],
      ['Say it is behind you', { swagger: 1 }, [1, 0], 'He wants more than that. He writes "medical" and underlines it.'],
      ['Offer to run for them right now', { grit: 2 }, [1, 1], 'You do sprints in dress shoes. They believe you.']] },
  { id: 'transfer', when: (L) => !!recall(L, 'route.portal'), q: 'Why did you transfer?',
    a: [['Minutes. You needed the ball', { swagger: 2 }, [1, -1], 'Honest. A little sharp. He likes sharp.'],
      ['The fit was wrong. You own it', { culture: 2 }, [0, 3], 'No blame on anybody. He circles something.'],
      ['Your old coach left', { grit: 1 }, [0, 1], 'He knows the story. It checks out.']] },
  { id: 'path', when: (L) => !!(recall(L, 'route.gl') || recall(L, 'route.intl') || recall(L, 'route.gap')), q: 'You skipped college. Why?',
    a: [['To be a pro sooner', { swagger: 2, grit: 1 }, [2, 0], 'He likes the hunger.'],
      ['Family needed the money', { culture: 2 }, [1, 3], 'The room goes quiet. Then warm.'],
      ['To play against men', { grit: 2 }, [1, 1], 'He asks about the grown men. You have stories.']] },
  { id: 'nobody', when: (L) => !!(recall(L, 'route.juco') || recall(L, 'route.walkon') || recall(L, 'route.rec')), q: 'Nobody recruited you. Why should we?',
    a: [['Because nobody recruited you', { grit: 3 }, [1, 2], 'He writes "chip" and underlines it twice.'],
      ['Show them your numbers', { culture: 1 }, [0, 1], 'The numbers are real. He knows it.'],
      ['Say they missed, not you', { swagger: 2 }, [2, -1], 'Bold. He grins at the GM beside him.']] },
  { id: 'bench', when: () => true, q: 'Would you come off the bench for us?',
    a: [['Whatever the team needs', { culture: 3 }, [0, 3], 'The right answer. You meant it, too.'],
      ['For a year. Then you start', { swagger: 1, grit: 1 }, [1, 1], 'He likes the clock in your head.'],
      ['No. You are a starter', { swagger: 2, culture: -2 }, [3, -2], 'He respects it. His coach will not.']] },
  { id: 'circle', when: () => true, q: 'Who is in your circle?',
    a: [['Family. Same people as always', { culture: 2 }, [1, 2], 'He asks about your mom. You talk for ten minutes.'],
      ['Your trainer and your agent', { grit: 1 }, [0, 1], 'Professional. He nods.'],
      ['A lot of people', { swagger: 1, culture: -1 }, [2, -1], 'He asks how many. You count. He stops you.']] },
  { id: 'weird', when: () => true, q: 'If you were a shoe, which one?',
    a: [['A work boot', { grit: 3 }, [1, 1], 'He loves it. It goes on a sticky note.'],
      ['Your own signature shoe', { swagger: 3 }, [3, -1], 'He laughs. "Ambitious."'],
      ['Ask why he wants to know', { culture: 1 }, [0, 1], '"Nobody asks that." He tells you. It is a test of nothing.']] },
  { id: 'film', when: () => true, q: 'Here is your worst game. Walk us through it.',
    a: [['Break down every mistake', { culture: 2, grit: 1 }, [0, 3], 'You find two they had not noticed.'],
      ['Point out what the refs missed', { swagger: 1, culture: -2 }, [1, -3], 'He turns the screen off a little early.'],
      ['Ask for your best game instead', { swagger: 2 }, [2, -1], 'He puts it on. You talk over all of it.']] },
];
function interviewCard(L, clubs, n) {
  const c = clubs[n];
  const used = L.flags.cmbQ || (L.flags.cmbQ = []);
  const rng = rngAt(L, 'cmb:q' + n);
  const open = CMB_Q.filter((x) => used.indexOf(x.id) < 0 && x.when(L));
  const told = open.filter((x) => x.id !== 'weak' && x.id !== 'bench' && x.id !== 'circle' && x.id !== 'weird' && x.id !== 'film');
  const q = told.length && rng() < 0.7 ? pick(rng, told) : pick(rng, open);
  used.push(q.id);
  const gm = personName(L, 'gm:' + c);
  return {
    id: 'interview', kind: 'event', key: 'interview:' + q.id, eyebrow: 'Combine interviews', title: 'The ' + nick(c) + ' want twenty minutes.',
    text: gm + ' runs the room. "' + q.q + '"', ctx: { club: c, q: q.id, n, clubs },
    options: q.a.map((x) => ({ label: x[0] })),
  };
}
function pworkoutCard(L) {
  const I = intrOf(L);
  const clubs = (L.flags.cmbClubs || []).slice().sort((a, b) => (I[b] || 0) - (I[a] || 0));
  const c = clubs[0] || combineClubs(L)[0];
  return {
    id: 'pworkout', kind: 'event', key: 'pworkout', eyebrow: 'Private workout', title: 'The ' + nick(c) + ' fly you in.',
    text: 'Their coaches, their gym, one afternoon. What do you show them?', ctx: { club: c },
    options: [
      { label: 'Go one on one with another prospect', hint: 'Win and they remember it. Lose and they remember that.' },
      { label: 'Run their sets with the coaches', hint: 'Show them you learn fast.' },
      { label: 'Shoot until they say stop', hint: 'The jumper does the talking.' },
    ],
  };
}
function combineCard(L) {
  if (storyOn(L)) return {
    id: 'combine', kind: 'event', key: 'combine', eyebrow: 'Draft combine', title: 'Testing day.',
    text: 'Every team is in the gym. Scouts with stopwatches. How do you play it?', ctx: { story: 1 },
    options: [
      { label: 'Test everything', hint: 'Sprints, vertical, agility. Your body is on display.' },
      { label: 'Shoot and run the drills', hint: 'Show your skill, skip the sprints.' },
      { label: 'Play in the scrimmages', hint: 'Five on five against the class. Anything can happen.' },
      { label: 'Sit out. Let the tape talk', hint: 'Nothing gained. Some teams wonder why.' },
    ],
  };
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
      hint: 'They pick ' + ordinal(x.slot) + '. ' + clubTier(clubNet(L, x.club)) + '. Coach ' + coachName(L, x.club) + '.', club: x.club, slot: x.slot })),
  };
}
function agentCard(L) {
  return {
    id: 'agent', kind: 'event', key: 'agent',
    eyebrow: 'Representation', title: 'Who negotiates for you?',
    text: 'Pick once. They do every deal you sign.',
    options: Object.keys(AGENTS).map((k) => ({ label: agentNameFor(L, k), hint: AGENTS[k].name + '. ' + AGENTS[k].blurb, agent: k })),
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

const stockUp = (L, d) => { L.flags.stock = (L.flags.stock || 0) + d; };
function chooseCombine(L, i, rng) {
  const r = rng();
  let text, tone = '';
  const ath = L.rt.ath + (Number.isFinite(L.ht) ? 0 : 0);
  if (i === 0) {
    if (r < clamp(0.25 + (ath - 55) * 0.014, 0.1, 0.85)) { stockUp(L, 2.4); text = 'Top five in the vertical and the lane agility. The phone starts ringing.'; tone = 'good'; }
    else if (r < 0.75) { stockUp(L, 0.3); text = 'Solid numbers. Nothing anybody talks about.'; }
    else { stockUp(L, -2); text = 'Slow in the sprints. A few teams cool on you.'; tone = 'bad'; }
  } else if (i === 1) {
    const sk = (L.rt.sho + L.rt.fin) / 2;
    if (r < clamp(0.3 + (sk - 55) * 0.014, 0.1, 0.85)) { stockUp(L, 1.6); text = 'Forty-one of fifty off the move. The room goes quiet.'; tone = 'good'; }
    else { stockUp(L, -0.8); text = 'A cold day in the drills. It gets noticed.'; tone = 'bad'; }
  } else if (i === 2) {
    const o = ovrOf(L) + (L.rt.iq - 60) * 0.2;
    if (r < clamp(0.2 + (o - 60) * 0.02, 0.08, 0.8)) { stockUp(L, 3); bump(L, { fame: 3 }); text = 'You own the scrimmage. Two GMs leave their seats to call home.'; tone = 'gold'; }
    else if (r < 0.7) { stockUp(L, 0.4); text = 'A good game in a sloppy scrimmage. Nobody learns much.'; }
    else { stockUp(L, -2.6); text = 'Four turnovers in the first half. It is on every highlight show.'; tone = 'bad'; }
  } else {
    stockUp(L, L.m.fame >= 45 ? 0 : -0.6); text = L.m.fame >= 45 ? 'You stay home. Your stock does not move.' : 'You stay home. A few teams wonder what you are hiding.';
  }
  L.flags.cmbTest = i;
  const clubs = combineClubs(L);
  L.flags.cmbClubs = clubs;
  L.pending.unshift(interviewCard(L, clubs, 0));
  queueEvents(L, 'predraft', 1 + (rng() < 0.4 ? 1 : 0));
  return { text, tone };
}
function chooseInterview(L, card, i, rng) {
  const q = CMB_Q.find((x) => x.id === card.ctx.q), a = q.a[i], c = card.ctx.club;
  const st = styleOf(L, c);
  const I = intrOf(L);
  const d = (a[1][st] || 0) + 1 + (rng() < 0.3 ? 1 : 0);
  I[c] = (I[c] || 0) + d;
  moveRep(L, a[2][0], a[2][1]);
  if (d >= 3) stockUp(L, 0.3);
  remember(L, 'cmb.' + q.id, i);
  const clubs = card.ctx.clubs;
  if (card.ctx.n + 1 < 2 && clubs[card.ctx.n + 1]) L.pending.unshift(interviewCard(L, clubs, card.ctx.n + 1));
  else L.pending.unshift(pworkoutCard(L));
  const how = d >= 3 ? ' You can tell they loved it.' : d <= 0 ? ' You can tell it did not land.' : '';
  return { text: a[3] + how, tone: d >= 3 ? 'good' : d <= 0 ? 'bad' : '' };
}
function choosePworkout(L, card, i, rng) {
  const c = card.ctx.club, I = intrOf(L);
  const r = rng();
  let text, tone = '';
  if (i === 0) {
    if (r < clamp(0.25 + (ovrOf(L) - 60) * 0.02, 0.1, 0.8)) { I[c] = (I[c] || 0) + 4; stockUp(L, 1.2); text = 'You win the one on one, eleven to six. Their GM stops pretending to text.'; tone = 'good'; }
    else { I[c] = (I[c] || 0) - 1; stockUp(L, -0.6); text = 'The other kid wins it. You go home quiet.'; tone = 'bad'; }
  } else if (i === 1) {
    if (r < clamp(0.35 + (L.rt.iq - 60) * 0.02, 0.15, 0.85)) { I[c] = (I[c] || 0) + 3; text = 'You run their whole playbook by the end of the day. Their coach asks for your number.'; tone = 'good'; }
    else { I[c] = (I[c] || 0) + 1; text = 'You get lost in one set. They are patient about it.'; }
  } else {
    if (r < clamp(0.3 + (L.rt.sho - 60) * 0.02, 0.1, 0.85)) { I[c] = (I[c] || 0) + 2; stockUp(L, 0.8); text = 'Eighty-two of a hundred. They stop counting at sixty.'; tone = 'good'; }
    else { I[c] = (I[c] || 0) + 0; text = 'A streaky day. They have seen better shooters this week.'; }
  }
  L.pending.unshift(agentCard(L));
  return { text, tone };
}
/* THE CLASS. You are not the only prospect, so the top of the board is not
   yours by default. A class has its own best players, seeded per career, and
   you go first only when you are better than all of them on the night. */
function classTop(L) {
  const r = rngAt(L, 'class');
  const top = 95.5 + norm(r) * 2.2;
  const out = [top];
  for (let k = 1; k < 6; k++) out.push(out[k - 1] - 0.6 - r() * 1.6);
  return out;
}
function runDraft(L, beats) {
  const order = draftOrder(L);
  const rng = rngAt(L, 'draftnight');
  let p = projectedPick(L, norm(rng) * 2.2);
  const promised = L.flags.promise;
  let team = null;
  if (storyOn(L) && !promised && p > 60 && !(recall(L, 'route.rec') && !recall(L, 'rec.viral'))) {
    /* Just off the board, a club that liked you in the room can still spend a
       late second round pick on you. Only just off it: a player that far
       from the board makes a roster through Summer League or not at all. */
    const I = L.flags.intr || {};
    let best = null;
    for (const c of L.flags.cmbClubs || []) if (!best || (I[c] || 0) > (I[best] || 0)) best = c;
    if (best && (I[best] || 0) >= 1 && draftStock(L) >= 71 && rng() < 0.65 + (I[best] - 1) * 0.05) {
      /* Their own second round pick, the latest one they have. */
      for (let k = 60; k >= 31; k--) if (order[k - 1] === best) { team = best; p = k; L.flags.reach = best; break; }
    }
  }
  if (storyOn(L) && !promised && !team && p <= 60) {
    /* A club that loved you takes you a little early, if it picks within a
       few slots ahead of where you would go. Never more than that. */
    const s = draftStock(L) + norm(rng) * 1.5;
    p = Math.max(p, 1 + classTop(L).filter((x) => x > s).length);
    /* Second round means the second round, however good the road was. */
    if (L.challenge === 'ch_late') p = Math.max(p, 31);
    const I = L.flags.intr || {};
    for (let k = Math.max(L.challenge === 'ch_late' ? 31 : 1, p - 4); k < p; k++) {
      const c = order[k - 1];
      if ((I[c] || 0) >= 4 && rng() < 0.25 + (I[c] - 4) * 0.08) { team = c; p = k; L.flags.reach = c; break; }
    }
  }
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
    makeRival(L, null);
    beats.push({ kind: 'draft', text: 'Sixty names. Not yours.', tone: 'bad' });
    logIt(L, 'Went undrafted.', 'bad');
    if (storyOn(L)) {
      /* A story career has to earn the deal: a Summer League invite is a
         tryout, and the money overseas is real. */
      remember(L, 'route.undrafted', true);
      L.pending.push({
        id: 'undrafted', kind: 'event', key: 'undrafted', eyebrow: 'After the draft',
        title: 'Your phone is ringing.', text: 'Three clubs want you on their Summer League team. No promises.',
        ctx: { story: 1 },
        options: three.map((c) => ({ label: 'Summer League with the ' + nick(c), hint: clubTier(clubNet(L, c)) + '. Earn a two-way deal.', club: c }))
          .concat([{ label: 'Take the money overseas', hint: 'A real contract in Europe. Come back later.' }]),
      });
      return;
    }
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
  if (storyOn(L)) L.draft.net = round1(clubNet(L, team));
  makeRival(L, p);
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
  /* Draft night itself, before the summer it opens. */
  if (storyOn(L)) queueEvents(L, 'dn', 1);
  openYear(L);
  /* A first-round pick walks across the stage to the podium. Ahead of
     whatever the summer has queued, because it happens tonight. */
  if (round === 1) L.pending.unshift(presserCard(L, 'draft'));
}

/* THE LAST TIME YOU WERE TRADED, for the scene that tells you. It lives
   outside the save on purpose: it is about this press of a button, and the
   step or the card that made the trade turns it into a beat and clears it. */
let TRADED = null;
function joinTeam(L, c, trade) {
  const from = L.team;
  /* Nobody is traded to the club he is already on. */
  if (trade && from && from === c) return false;
  if (trade && from) TRADED = { from, to: c, back: null };
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
/* MINUTES ARE A PLACE ON YOUR CLUB (story careers in the league). You are
   ranked against your teammates' overalls: the best man on the club plays
   about thirty-four minutes, the fifth about twenty-six, the ninth about
   eleven, the way a real rotation is shaped. diff is your overall against
   the club's fifth best man, so nought is the edge of the starting five. */
const RANK_MIN = [34.5, 32.5, 30.5, 28.5, 26.5, 23, 19.5, 16, 12, 8, 5, 3, 2, 2, 2, 2];
function roleRank(L) {
  const mates = matesOf(L, L.team);
  if (!mates.length) return null;
  const me = effOvr(L);
  const above = mates.filter((m) => m.ovr > me).length;
  const fifth = (mates[4] || mates[mates.length - 1]).ovr;
  /* Between two ranks the gap decides: a man a point behind the one ahead
     of him plays close to his minutes. */
  const up = above > 0 ? mates.filter((m) => m.ovr > me).reduce((a, m) => Math.min(a, m.ovr), 99) : null;
  const lean = up != null ? clamp(1 - (up - me) / 4, 0, 1) * 0.5 : 0;
  const min = RANK_MIN[above] + lean * ((RANK_MIN[Math.max(0, above - 1)]) - RANK_MIN[above]);
  return { above, min, diff: me - fifth, best: above === 0 };
}
/* A two-way player's NBA minutes: the rest of his nights are in the G League. */
const TW_MIN = 7;
function roleOf(L) {
  const net = clubNet(L, L.team);
  if (storyOn(L) && L.stage === 'nba' && L.team && rostOf(L)) {
    const rk = roleRank(L);
    if (rk) {
      let min = rk.min + (L.m.trust - 50) * 0.05 + (L.season ? L.season.mods.min : 0);
      if (L.contract && L.contract.kind === 'rookie' && L.draft && L.draft.pick <= 5 && net < 0) min += 3;
      min = clamp(depthCheck(L, min, rk.diff), 2, 38.5);
      if (L.contract && L.contract.tw) return { min: round1(Math.min(min, TW_MIN)), diff: rk.diff, label: 'Two-way', starter: false, rank: rk.above + 1, tw: 1 };
      /* The first man off the bench is a job of its own. The sixth man route
         and ending always asked for this label; nothing wrote it until now. */
      const label = rk.best && min >= 33 ? 'Franchise player' : min >= 24 ? 'Starter' : min >= 20 && rk.above <= 5 ? 'Sixth man' : min >= 15 ? 'Rotation' : 'End of bench';
      return { min: round1(min), diff: rk.diff, label, starter: min >= 24, rank: rk.above + 1 };
    }
  }
  const diff = effOvr(L) - rotationBar(net);
  let min = diff >= 14 ? 35.5 : diff >= 7 ? 32.5 : diff >= 0 ? 27.5 : diff >= -5 ? 20 : diff >= -10 ? 13 : 7;
  min += (L.m.trust - 50) * 0.05 + (L.season ? L.season.mods.min : 0);
  if (L.contract && L.contract.kind === 'rookie' && L.draft && L.draft.pick <= 5 && net < 0) min += 3;
  min = clamp(depthCheck(L, min, diff), 2, 38.5);
  const label = (diff >= 12 && min >= 33) ? 'Franchise player' : min >= 30 ? 'Starter' : min >= 24 ? 'Starter' : min >= 15 ? 'Rotation' : 'End of bench';
  return { min: round1(min), diff, label, starter: min >= 24 };
}
/* THE STARTING FIVE covers all five positions, always. A man counts at full
   value at his own position and at 0.85 at a position next to it (or a
   second one the data lists for him). Two away is 0.15 and further 0.03, so
   a center only ever plays the point when nobody else on the roster can. bestFive is exact: it tries every
   way of filling the five slots and keeps the best, with anyone marked
   `force` (you, when your minutes make you a starter) always in. */
const SLOTS5 = ['PG', 'SG', 'SF', 'PF', 'C'];
function fitAt(pos, slot, ep) {
  if (pos === slot) return 1;
  if ((ep && ep.indexOf(slot) >= 0) || (NEXT_POS[pos] || []).indexOf(slot) >= 0) return 0.85;
  const d = Math.abs(SLOTS5.indexOf(pos) - SLOTS5.indexOf(slot));
  return d === 2 ? 0.15 : 0.03;
}
function bestFive(cands) {
  let states = { 0: { s: 0, a: [] } };
  cands.forEach((c, i) => {
    const next = {};
    const put = (m, st) => { if (!next[m] || next[m].s < st.s) next[m] = st; };
    for (const k in states) {
      const m = +k, st = states[k];
      if (!c.force) put(m, st);
      for (let j = 0; j < 5; j++) if (!(m & (1 << j))) put(m | (1 << j), { s: st.s + c.v * fitAt(c.pos, SLOTS5[j], c.ep), a: st.a.concat([[i, j]]) });
    }
    states = next;
  });
  const full = states[31];
  if (!full) return null;
  const out = [];
  for (const [i, j] of full.a) out[j] = i;
  return { slots: out, score: full.s };
}
/* THE ROTATION: your club in minutes order, with you placed by the minutes
   you are actually getting (this season's average once a game is played, the
   coach's plan before that). The starting five is bestFive; the rest come off
   the bench by value, and everyone shares 240 off a real rotation's shape.
   Display only: the season sim reads your minutes from roleOf, never this. */
const ROT_SHAPE = [35, 33, 31, 29, 27, 24, 20, 16, 12, 8, 5, 0, 0, 0, 0];
function rotationOf(L) {
  if (L.stage !== 'nba' || !L.team) return null;
  const s = L.season, role = roleOf(L);
  const played = s && s.gp > 0 && s.tot && s.tot.min > 0;
  const mine = round1(played ? s.tot.min / s.gp : role.min);
  const lines = L.league.lines || {};
  const mates = matesOf(L, L.team).slice(0, 14);
  let at = ROT_SHAPE.findIndex((m) => m <= mine);
  if (at < 0 || at > mates.length) at = mates.length;
  /* The label and the screen are one answer: a coach who calls you a
     starter puts you in the five, at whatever minutes he plays you. */
  if (role.starter && at > 4) at = 4;
  const youStart = at < 5;
  const me = { n: L.name, pos: L.pos, age: L.age, you: true, min: mine, pts: null, w: 0, ovr: ovrOf(L), pay: L.contract ? L.contract.salary : null };
  const epOf = (m) => { const ln = lines[m.n]; return ln && ln[5] ? String(ln[5]).split(';') : null; };
  const cands = mates.map((m) => ({ v: Math.max(0.1, (m.ovr || mateOvr(m.w)) - 55), pos: m.pos, ep: epOf(m), m }));
  if (youStart) cands.unshift({ v: 1000, pos: L.pos, ep: null, force: true, m: me });
  const five = bestFive(cands);
  const starters = five.slots.map((i, j) => ({ slot: SLOTS5[j], m: cands[i].m }));
  const bench = mates.filter((m) => !starters.some((x) => x.m === m)).sort((a, b) => b.ovr - a.ovr || b.w - a.w);
  /* Minutes: the rotation's shape without your slot. Starters take the top
     of it by value, the bench the rest, scaled so the club plays 240. */
  const shape = ROT_SHAPE.slice(0, mates.length + 1);
  shape.splice(at, 1);
  const tot = shape.reduce((a, x) => a + x, 0) || 1, left = Math.max(0, 240 - mine);
  const row = (m, k, slot) => {
    const min = round1(shape[k] * left / tot), ln = lines[m.n];
    /* Points: last season's rate for a man the data has, otherwise one off
       his value; at the minutes he is getting now. */
    const rate = ln && ln[0] > 0 ? ln[1] / ln[0] : 0.18 + Math.max(0, m.w) * 0.035;
    return { n: m.n, pos: m.pos, age: m.age, real: m.real, ovr: m.ovr, pay: m.pay, min, pts: min > 0 ? round1(rate * min) : 0, slot };
  };
  const rows = new Map();
  starters.filter((x) => x.m !== me).sort((a, b) => b.m.ovr - a.m.ovr || b.m.w - a.m.w).forEach((x, k, arr) => rows.set(x.m, row(x.m, k, x.slot)));
  const nS = starters.filter((x) => x.m !== me).length;
  bench.forEach((m, k) => rows.set(m, row(m, nS + k, null)));
  me.slot = youStart ? starters.find((x) => x.m === me).slot : null;
  /* The five in position order, then the bench (you among it if you come
     off it) in minutes order. Rank is by minutes across the whole club. */
  const five5 = starters.map((x) => (x.m === me ? me : rows.get(x.m)));
  const rest = bench.map((m) => rows.get(m)).concat(youStart ? [] : [me]).sort((a, b) => b.min - a.min);
  const list = five5.concat(rest);
  list.slice().sort((a, b) => b.min - a.min).forEach((x, i) => { x.rank = i + 1; });
  rest.forEach((x, k) => { x.role = x.min <= 0 ? 'Out of the rotation' : k === 0 ? 'Sixth man' : x.min >= 10 ? 'Rotation' : 'Bench'; });
  five5.forEach((x) => { x.role = 'Starter'; });
  return { list, rank: me.rank, min: mine, played, role: me.role, slot: me.slot || null, plan: role.label, club: L.team, gp: s ? s.gp : 0 };
}
function usageOf(L, role) {
  const a = ARCHES[L.arch];
  /* On a story career the shots go down the club's pecking order: the best
     man is the first option, the fourth starter the fourth. */
  const f = role.rank ? clamp(0.8 - (role.rank - 1) * 0.12 + role.diff * 0.01, 0, 1.25) : clamp(role.diff / 22 + 0.35, 0, 1.25);
  const u = 0.13 + 0.17 * f + a.usage + (L.season ? L.season.mods.usage : 0);
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
  const posReb = { PG: 4, SG: 4.6, SF: 6, PF: 7.6, C: 8.6 }[L.pos] + (Number.isFinite(L.ht) ? sizeOf(L).dh * 0.25 : 0);
  const reb = Math.max(posReb * 0.55, posReb + (r.reb - 50) * 0.14) * min / 36;
  const ast = Math.max(0.3, (0.8 + (r.pla - 45) * 0.16) * (0.7 + usage) * min / 36);
  const stl = Math.max(0.1, (0.5 + (r.def - 55) * 0.02 + (r.ath - 55) * 0.008) * min / 36);
  const big = Math.max(0.1, { PG: 0.2, SG: 0.25, SF: 0.45, PF: 0.8, C: 1.2 }[L.pos] + (archBase(L) === 'anchor' ? 0.6 : 0) + (Number.isFinite(L.ht) ? sizeOf(L).dh * 0.07 : 0));
  const blk = Math.max(0.05, (big + (r.def - 55) * 0.02 * big) * min / 36);
  return { pts, fga, tpa, tpp, fta, ftp, reb, ast, stl, blk, ts };
}
/* What you add to the club when you play: points per hundred possessions. */
function impact(L, min) {
  return (effOvr(L) - 68 + lvl(L).edge * 4) * 0.32 * (min / 48);
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
  if (rng() >= p * (trait(L, 'injuryProne') ? 1.3 : trait(L, 'ironMan') ? 0.65 : 1) * lvl(L).inj) return;
  if (storyOn(L) && (tw(L).inj = (tw(L).inj || 0) + 1) >= 3) reveal(L, 'injuryProne', 'Three injuries already. You know the training room by heart.', beats);
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
    text: 'Dr. {doctor:last} says ' + g + ' games. You have a say in how.',
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
  /* The stretch, game by game, for the live ticker: who, where, the result
     and your line. Only the latest stretch is kept, and keeping it draws
     nothing from the rng, so a career plays exactly as it did without it. */
  const box = s.box = [];
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
      box.push([g, opps[(g * 7 + L.year) % opps.length], home ? 1 : 0, 0, p, reb, ast]);
    } else {
      s.out++;
      box.push([g, opps[(g * 7 + L.year) % opps.length], home ? 1 : 0, 0, -1, 0, 0]);
    }
    s.g = g;
    if (rng() < gameP(net, home)) { s.w++; box[box.length - 1][3] = 1; } else s.l++;
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
  /* A story career's MVP needs a 92, not a 91: a real deadline puts good
     players on good clubs and a top three seed with them, and at 91 MVPs ran
     3.5 in a hundred careers against a band of 1 to 3. Measured over 1,000:
     cutting the vote's odds instead barely moved it (3.3 at 0.42), because a
     man good enough to win one wins it in a season where the odds are high. */
  if (gpOk && o >= (storyOn(L) ? 92 : 91) && seed <= 3) {
    const sc = (o - 93) * 0.6 + (w - 55) * 0.1 + (pg.pts - 27) * 0.15 + (L.m.fame - 70) * 0.02;
    if (rng() < (storyOn(L) ? 0.52 : 0.62) * lg(sc - 0.4)) out.push('mvp');
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
  if (st < 88.5 + bal(L, 'star', 0)) return;
  s.allstar = true;
  const n = (L.flags.allstars || 0) + 1;
  L.flags.allstars = n;
  bump(L, { fame: 6, morale: 5 });
  const line = n === 1 ? 'You are an All-Star.' : ordinal(n) + ' All-Star selection.';
  beats.push({ kind: 'award', text: line, tone: 'gold', award: 'star', n });
  logIt(L, line, 'gold');
  L.pending.push({
    id: 'allstar', kind: 'event', key: 'allstar', eyebrow: 'All-Star Weekend', title: 'They want you Saturday night too.',
    text: 'One event, or none. Your call.',
    options: [
      { label: 'Dunk contest', hint: 'Athleticism ' + ovT(L, L.rt.ath) + '.' },
      { label: 'Three-point contest', hint: 'Shooting ' + ovT(L, L.rt.sho) + '.' },
      { label: 'Rest your legs', hint: 'Sunday is enough.' },
    ],
  });
}

/* The field and the scores of a Saturday contest you entered. The result is
   drawn before this runs; this only names who you were up against and writes
   the scores around it, on its own stream, so nothing else in the career
   moves. The field is real players off the league's rosters (a contest is
   basketball, where real people belong), then the league's invented stars,
   then generated names if a long career has run the real ones out. A dunk is judged out of 100 a round, a three-point round out
   of 40. Out in round one is a hyphen in the final column. */
const CONTEST = {
  dunk: { name: 'Dunk contest', n: 4, fin: 2, stars: 1, r1: [62, 96], f: [72, 100] },
  three: { name: 'Three-point contest', n: 6, fin: 3, stars: 2, r1: [13, 27], f: [17, 31] },
};
function contestField(L, kind, won) {
  const C = CONTEST[kind];
  const rng = rngAt(L, 'contest:' + kind);
  const span = (a) => a[0] + Math.floor(rng() * (a[1] - a[0] + 1));
  const distinct = (n, a) => { const out = []; while (out.length < n) { const v = span(a); if (!out.includes(v)) out.push(v); } return out.sort((x, y) => y - x); };
  const taken = new Set([L.name]), clubs = new Set([L.team]);
  const club = () => { for (let k = 0; k < 20; k++) { const c = pick(rng, CLUBS); if (!clubs.has(c)) { clubs.add(c); return c; } } return pick(rng, CLUBS); };
  const others = [];
  /* Real players first: a dunk contest is young wings and guards, a
     three-point contest is the men who take the most threes. */
  const lines = (L.league && L.league.lines) || {}, pool = [];
  for (const c of CLUBS) {
    if (c === L.team) continue;
    for (const m of matesOf(L, c)) {
      if (!m.real || taken.has(m.n)) continue;
      const ln = lines[m.n], tpa = ln ? ln[4] : 0;
      const w = kind === 'dunk' ? (m.pos !== 'C' && m.age <= 27 ? (m.age <= 24 ? 3 : 1.5) + (m.pos === 'SF' || m.pos === 'SG' ? 1 : 0) : 0)
        : (tpa >= 5 ? tpa : m.pos !== 'C' && m.pos !== 'PF' && m.age >= 22 ? 0.5 : 0);
      if (w > 0) pool.push({ n: m.n, club: c, w });
    }
  }
  while (others.length < C.n - 1 && pool.length) {
    let t = pool.reduce((a, x) => a + x.w, 0) * rng(), i = 0;
    while (i < pool.length - 1 && (t -= pool[i].w) > 0) i++;
    const p = pool.splice(i, 1)[0];
    if (taken.has(p.n) || clubs.has(p.club)) continue;
    taken.add(p.n); clubs.add(p.club); others.push({ n: p.n, club: p.club });
  }
  const stars = ((L.league && L.league.figs) || []).filter((f) => !f.gone && f.club !== L.team);
  for (let k = 0; k < C.stars && others.length < C.n - 1 && stars.length && rng() < 0.6; k++) {
    const f = stars.splice(Math.floor(rng() * stars.length), 1)[0];
    if (taken.has(f.n) || clubs.has(f.club)) continue;
    taken.add(f.n); clubs.add(f.club); others.push({ n: f.n, club: f.club });
  }
  while (others.length < C.n - 1) {
    const n = figName(L, rng);
    if (taken.has(n) || others.some((o) => lastOf(o.n) === lastOf(n))) continue;
    taken.add(n); others.push({ n, club: club() });
  }
  // where you finish round one: in the final if you won it, and for a dunk loss
  // sometimes in the final and beaten there; a three-point loss is round one
  const final = won || (kind === 'dunk' && rng() < 0.45);
  const rank = final ? Math.floor(rng() * C.fin) : C.fin + Math.floor(rng() * (C.n - C.fin));
  const r1 = distinct(C.n, C.r1);
  const order = others.slice();
  for (let k = order.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); const t = order[k]; order[k] = order[j]; order[j] = t; }
  const rows = [];
  for (let k = 0, o = 0; k < C.n; k++) {
    const p = k === rank ? { n: L.name, club: L.team, you: true } : order[o++];
    rows.push({ n: p.n, club: nick(p.club), you: !!p.you, r1: r1[k], f: null });
  }
  const fin = rows.slice(0, C.fin);
  const fs = distinct(C.fin, C.f);
  const me = fin.find((r) => r.you);
  const rest = fin.filter((r) => !r.you);
  for (let k = rest.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); const t = rest[k]; rest[k] = rest[j]; rest[j] = t; }
  const byF = me ? (won ? [me].concat(rest) : rest.concat([me])) : rest;
  byF.forEach((r, k) => { r.f = fs[k]; });
  // the headline for a dunk you lost in the final is two misses, so it scores like one
  if (me && !won && kind === 'dunk') me.f = Math.min(me.f, 64 + Math.floor(rng() * 19));
  const placed = byF.concat(rows.slice(C.fin));
  placed.forEach((r, k) => { r.place = k + 1; });
  return { kind, name: C.name, rows: placed, champ: placed[0].n, you: placed.findIndex((r) => r.you) + 1, final };
}
/* One short line for the log, after the headline. */
function contestLine(c) {
  const w = c.rows[0], mine = c.rows.find((r) => r.you), two = c.rows[1];
  if (mine.place === 1) return c.name + ': beat ' + two.n + ' in the final, ' + w.f + ' to ' + two.f + '.';
  if (mine.f != null) return c.name + ': ' + w.n + ' beat you in the final, ' + w.f + ' to ' + mine.f + '.';
  return c.name + ': out in round one with ' + mine.r1 + '. ' + w.n + ' won it.';
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
  const mn = clubNet(L, mine) + (mine === L.team ? playoffImpact(L) - bal(L, 'poTax', 0) : 0);
  const tn = clubNet(L, theirs) + (theirs === L.team ? playoffImpact(L) - bal(L, 'poTax', 0) : 0);
  return gameP(mn - tn, home);
}
function playoffImpact(L) {
  const s = L.season;
  const role = s.role || roleOf(L);
  const playMin = Math.min(40, role.min + (role.starter ? 3 : 1));
  if (s.injury && s.injury.until > GAMES + 4) return 0;
  return impact(L, playMin) + s.mods.win + (trait(L, 'bigStage') ? 0.8 : 0);
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
  po.results.push({ round: cur.round, opp: cur.opp, w: cur.w, l: cur.l, won, games: cur.games.slice() });
  const line = (won ? 'Beat the ' : 'Lost to the ') + nick(cur.opp) + ' ' + cur.w + '-' + cur.l + ' in the ' + name + '.';
  beats.push({ kind: 'po', text: line, tone: won ? 'good' : 'bad' });
  logIt(L, line, won ? 'good' : 'bad');
  po.cur = null;
  if (!won) {
    po.out = true; po.path = ROUND_SHORT[cur.round];
    if (cur.round === 3) { beats.push({ kind: 'finals_loss', text: 'The season ends in the Finals.', tone: 'bad', opp: cur.opp }); L.pending.push(presserCard(L, 'finals_loss')); }
    return;
  }
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
    beats.push({ kind: 'champ', text: ring, tone: 'gold', ring: n, fmvp: s.awards.indexOf('fmvp') >= 0, opp: cur.opp });
    logIt(L, ring, 'gold');
    L.pending.push(presserCard(L, 'title'));
    return;
  }
  po.round++;
}

/* ─── playable moments ──────────────────────────────────────────────────
   A night inside a stretch that comes down to you: a shot at the horn, two
   free throws with the game on them, the last stop, a poster, a chase-down.
   Each is a card with the playable choice first (court.js plays it, and its
   release is the touch) and a safe one second. Nothing here moves the
   record: the stretch is already played, so a moment is how one night of it
   ended, and what it moves is fame, morale and the memory of it.

   ONLY FOR CAREERS STARTED SINCE THEY EXISTED. L.opt.moments is set by
   newLife and never by migrate, because an old save plays on exactly as the
   engine that wrote it would have (check-saves), and a new card is a press
   the old engine never asked for. */
const MOMENT_P = 0.16;
const MOMENTS = {
  buzzer: { w: () => 2, title: 'The ball, the clock, the horn.',
    text: (L, o) => 'Tied with the ' + o + '. Four seconds. It comes to you.',
    opts: (L) => [
      { label: 'Take the shot', hint: 'Shooting ' + ovT(L, L.rt.sho) + '.', p: clamp(0.3 + (L.rt.sho - 50) * 0.006, 0.15, 0.62), play: 'buzzer' },
      { label: 'Drive and kick', hint: 'Find somebody.', p: 0.38 },
    ] },
  ft: { w: () => 2, title: 'Two shots. Down one.',
    text: (L, o) => 'Fouled with two seconds left against the ' + o + '. The building is trying to get in your head.',
    opts: (L) => [
      { label: 'Step to the line', hint: 'Shooting ' + ovT(L, L.rt.sho) + '.', p: clamp(0.6 + (L.rt.sho - 50) * 0.006 + (L.rt.iq - 50) * 0.002, 0.42, 0.95), play: 'ft' },
      { label: 'Let them ice you', hint: 'Two timeouts. Long walk.', p: clamp(0.56 + (L.rt.sho - 50) * 0.006 + (L.rt.iq - 50) * 0.004, 0.4, 0.93) },
    ] },
  poster: { w: (L) => L.rt.ath >= 68 ? 1.5 : 0, title: 'One man between you and the rim.',
    text: (L, o) => 'A runout against the ' + o + '. Their big has planted himself in the lane.',
    opts: (L) => [
      { label: 'Rise up', hint: 'Athleticism ' + ovT(L, L.rt.ath) + '.', p: clamp(0.34 + ((L.rt.ath + L.rt.fin) / 2 - 60) * 0.008, 0.2, 0.75), play: 'poster' },
      { label: 'Lay it in', hint: 'Two points is two points.', p: 0.8 },
    ] },
  block: { w: (L) => L.rt.def >= 64 && L.rt.ath >= 60 ? 1.5 : 0, title: 'He thinks he is gone.',
    text: (L, o) => 'A steal at the other end and a ' + o + ' guard is all alone. You are four steps behind him.',
    opts: (L) => [
      { label: 'Chase him down', hint: 'Defense ' + ovT(L, L.rt.def) + '.', p: clamp(0.3 + ((L.rt.def + L.rt.ath) / 2 - 60) * 0.009, 0.15, 0.7), play: 'block' },
      { label: 'Let it go', hint: 'Save your legs.', p: 0 },
    ] },
  stop: { w: (L) => L.rt.def >= 58 ? 1.5 : 0, title: 'Up one. Last possession.',
    text: (L, o) => 'The ' + o + ' clear out a side for their best scorer. You ask for the assignment.',
    opts: (L) => [
      { label: 'Guard him', hint: 'Defense ' + ovT(L, L.rt.def) + '.', p: clamp(0.36 + (L.rt.def - 55) * 0.008, 0.2, 0.75), play: 'stop' },
      { label: 'Send the double', hint: 'Make somebody else beat you.', p: 0.5 },
    ] },
};
function queueMoment(L, chunk) {
  if (!L.opt || !L.opt.moments || !L.season || !L.team) return;
  const s = L.season, role = s.role || roleOf(L);
  if (role.min < 18) return;
  if (s.injury && s.g >= s.injury.from && s.g < s.injury.until) return;
  const rng = rngAt(L, 'moment:' + chunk);
  if (rng() >= MOMENT_P) return;
  const id = weighted(rng, Object.keys(MOMENTS), (k) => MOMENTS[k].w(L));
  if (!id) return;
  const m = MOMENTS[id], opp = CLUBS.filter((c) => c !== L.team)[Math.floor(rng() * (CLUBS.length - 1))];
  const opts = m.opts(L);
  L.pending.push({
    id: 'moment', kind: 'moment', key: 'moment:' + L.year + ':' + chunk,
    eyebrow: 'A night against the ' + nick(opp), title: m.title, text: m.text(L, nick(opp)),
    ctx: { m: id, opp, plays: opts.map((o) => o.play || null) },
    options: opts.map((o) => ({ label: o.label, hint: o.hint })),
  });
}
function momentResolve(L, card, i, rng, touch) {
  const m = MOMENTS[card.ctx.m], o = m.opts(L)[i], opp = nick(card.ctx.opp);
  const f = L.flags;
  if (card.ctx.m === 'ft') {
    const p = touched(o.p, touch);
    const n = (rng() < p ? 1 : 0) + (rng() < p ? 1 : 0);
    if (n === 2) { f.ftIce = (f.ftIce || 0) + 1; bump(L, { fame: 3, morale: 6 }); logIt(L, 'Two free throws to beat the ' + opp + '.', 'gold'); return { text: 'Two for two. Ice.', tone: 'gold', made: 2 }; }
    if (n === 1) { bump(L, { morale: -2 }); return { text: 'One of two. Overtime. You win it there, but you think about the miss all night.', tone: '', made: 1 }; }
    bump(L, { morale: -6 }); logIt(L, 'Missed two at the line against the ' + opp + '.', 'bad');
    return { text: 'Both off the rim. The other bench is loving it.', tone: 'bad', made: 0 };
  }
  if (!o.play) {
    if (card.ctx.m === 'block') return { text: 'Two points for them. Nobody notices.', tone: '', made: false };
    const ok = rng() < o.p;
    bump(L, ok ? { trust: 2 } : { morale: -1 });
    return { text: ok ? 'The right play. It works.' : 'The right play. It does not work.', tone: ok ? 'good' : '', made: ok };
  }
  const made = rng() < touched(o.p + (card.ctx.m === 'buzzer' ? clutchBonus(L) : 0), touch);
  const T = {
    buzzer: made ? ['At the horn! The bench empties onto the floor.', 'buzzer'] : ['Off the back iron. Overtime, and the night goes the other way.', null],
    poster: made ? ['Right on top of him. That one is going on a wall.', 'posters'] : ['He stands his ground. Offensive foul.', null],
    block: made ? ['Pinned to the glass. He never saw you coming.', 'chasedowns'] : ['A step late. And one.', null],
    stop: made ? ['You stay in front. A tough miss at the horn. Ballgame.', 'stops'] : ['He gets to his spot and buries it.', null],
  }[card.ctx.m];
  if (made) {
    f[T[1]] = (f[T[1]] || 0) + 1;
    if (card.ctx.m === 'buzzer') clutchHit(L);
    bump(L, { fame: card.ctx.m === 'buzzer' || card.ctx.m === 'poster' ? 4 : 3, morale: 5 });
    logIt(L, { buzzer: 'Hit a shot at the horn against the ' + opp + '.', poster: 'Dunked on a ' + opp + ' big.', block: 'A chase-down block against the ' + opp + '.', stop: 'Got the last stop against the ' + opp + '.' }[card.ctx.m], 'gold');
  } else bump(L, { morale: -3 });
  return { text: T[0], tone: made ? 'gold' : 'bad', made };
}

/* GAME 7 IS YOURS. Tied, the ball, the last shot. The odds of each choice come
   off the rating it asks for, so a shooter should shoot and a passer should
   find the open man, and the screen shows the rating rather than the odds. */
function clutchOptions(L) {
  const r = L.rt, net = clubNet(L, L.team), cb = clutchBonus(L);
  return [
    { label: 'Pull-up three', rate: 'sho', p: clamp(0.2 + (r.sho - 50) * 0.0065, 0.12, 0.55) + cb + sigBonus(L, 'sho') },
    { label: 'Drive to the rim', rate: 'fin', p: clamp(0.26 + ((r.fin + r.ath) / 2 - 50) * 0.0058, 0.15, 0.58) + cb + sigBonus(L, 'fin') },
    { label: 'Mid-range fadeaway', rate: 'iq', p: clamp(0.25 + ((r.sho + r.iq) / 2 - 50) * 0.0052, 0.15, 0.55) + cb + sigBonus(L, 'iq') },
    { label: 'Find the open man', rate: 'pla', p: clamp(0.27 + (r.pla - 50) * 0.0045 + net * 0.006, 0.15, 0.55) + cb + sigBonus(L, 'pla') },
  ];
}
function clutchCard(L, cur, home) {
  const opts = clutchOptions(L);
  return {
    id: 'clutch', kind: 'clutch', key: 'clutch:' + cur.round,
    eyebrow: 'Game 7 · ' + ROUNDS[cur.round], title: 'Tied. Nine seconds. Your ball.',
    text: (home ? 'Home crowd on its feet' : 'A road crowd trying to rattle you') + ' against the ' + nick(cur.opp) + '. What is the play?',
    ctx: { round: cur.round, opp: cur.opp, home },
    options: opts.map((o) => ({ label: o.label, hint: RATING_NAME[o.rate] + ' ' + ovT(L, L.rt[o.rate]) + '.' })),
  };
}

// ─── the offseason ──────────────────────────────────────────────────────────

/* How a year changes the body. Growth closes a share of the gap to potential,
   most of it at nineteen and none of it by twenty-eight. Decline starts at
   twenty-nine in the legs and reaches the jumper last. */
const GROW = { 19: 0.24, 20: 0.22, 21: 0.2, 22: 0.18, 23: 0.15, 24: 0.11, 25: 0.08, 26: 0.05, 27: 0.02 };
const DECLINE = { 29: 0.9, 30: 1.5, 31: 2.1, 32: 2.7, 33: 3.3, 34: 3.9, 35: 4.5, 36: 5.1, 37: 5.7 };
/* HOW A PLAYER CHANGES, on a story career. Every skill has its own clock:
   the bounce comes first and goes first, a jumper and a feel for the game
   keep getting better into a man's thirties, and the glass and the defense
   sit in between. Who plays grows, who sits grows slower. A summer can be a
   breakout or a stall, a coach's project gets extra work, and no summer moves
   a man more than nine points, because +12 in one offseason read as a cheat
   code rather than a kid getting better.

   The old curve (one rate for every rating, then legs and IQ weights on the
   way down) is kept exactly for a save from before story careers. */
const SKILL_GROW = {
  ath: [[21, 1.45], [23, 1.1], [25, 0.55], [99, 0.1]],
  fin: [[23, 1.1], [26, 0.95], [99, 0.6]],
  def: [[23, 0.95], [27, 1.05], [99, 0.7]],
  reb: [[24, 1.05], [27, 0.85], [99, 0.5]],
  sho: [[22, 0.8], [26, 1.1], [99, 1.3]],
  pla: [[22, 0.85], [27, 1.1], [99, 1.15]],
  iq: [[22, 0.75], [27, 1.15], [99, 1.3]],
};
const shapeAt = (rows, a) => { for (const [to, v] of rows) if (a <= to) return v; return rows[rows.length - 1][1]; };
/* On the way down: the legs go from 28, the touch and the brain much later. */
function skillDecline(k, a) {
  if (k === 'ath') return a >= 28 ? 1.55 : 0;
  if (k === 'fin' || k === 'def') return 1.15;
  if (k === 'reb') return 0.95;
  if (k === 'sho') return a >= 34 ? 0.7 : 0.35;
  if (k === 'pla') return a >= 34 ? 0.8 : 0.5;
  if (k === 'iq') return a >= 34 ? 0.5 : 0;
  return 0.9;
}
const SUMMER_CAP = 9;
function developStory(L, beats) {
  const before = ovrOf(L), was = Object.assign({}, L.rt);
  const rng = rngAt(L, 'develop');
  const a = L.age;
  const gap = Math.max(0, L.pot - before);
  const eth = 0.65 + L.eth / 100 * 0.7 + (trait(L, 'gymRat') ? 0.12 : 0);
  let grow = gap * (GROW[a] || 0) * eth;
  if (trait(L, 'lateBloomer')) grow = a <= 22 ? grow * 0.8 : a <= 27 ? grow + gap * 0.05 * eth : grow;
  grow *= lvl(L).grow;
  /* Minutes are where a young man learns. */
  const h = L.history[L.history.length - 1];
  const min = h && h.y === L.year && h.min != null ? h.min : (L.season && L.season.gp ? L.season.tot.min / L.season.gp : 20);
  if (a <= 25) grow *= 0.8 + 0.3 * clamp((min - 8) / 26, 0, 1);
  grow += L.flags.devCarry || 0;
  /* A breakout or a stall, mostly for the young. */
  let jump = '';
  const roll = rng();
  if (a <= 25 && gap >= 6 && roll < 0.11) { grow *= 1.5; jump = 'up'; }
  else if (a <= 26 && gap >= 4 && roll > 0.9) { grow *= 0.45; jump = 'flat'; }
  const dec = (DECLINE[a] || (a >= 38 ? 6.5 : 0)) * (1.2 - L.dur / 250) * (L.flags.longevity ? 0.75 : 1) * bal(L, 'dec', 1) * lvl(L).dec
    + Math.max(0, 50 - L.m.health) * 0.03;
  const early = a === 27 ? 0.5 : a === 28 ? 1 : 0;
  const focus = L.focus && L.focus.y === L.year ? L.focus.k : null;
  /* The clocks move growth and decline between skills, never in total: for
     every position and age the weighted sum is the old curve's, so a career
     is as long and as good as it was and only its shape changed. Measured
     without this, the jumper and the brain aging slower than the legs added
     two points to every man at 32 and doubled the MVPs. */
  const w = WEIGHTS[L.pos];
  let gS = 0, dS = 0, dOld = 0;
  for (const k of RATINGS) {
    gS += w[k] * shapeAt(SKILL_GROW[k], a);
    dS += w[k] * skillDecline(k, a);
    dOld += w[k] * (k === 'ath' ? 1.6 : k === 'fin' || k === 'def' ? 1.15 : k === 'sho' || k === 'iq' ? 0.45 : 0.9);
  }
  const gN = gS > 0 ? 1 / gS : 1, dN = dS > 0 ? dOld / dS : 1;
  const d = {};
  for (const k of RATINGS) {
    let x = grow * shapeAt(SKILL_GROW[k], a) * gN * (0.6 + rng() * 0.8);
    if (k === 'ath' && early) x -= early * (0.6 + rng() * 0.8);
    if (dec) x -= dec * skillDecline(k, a) * dN * (0.7 + rng() * 0.6) * (k === focus ? 0.5 : 1);
    if (k === 'iq' && a <= 33) x += 0.6;
    if (k === 'iq' && trait(L, 'filmJunkie')) x += 0.5;
    if (k === focus) x += 1.5 + Math.max(0, grow) * 0.4;
    d[k] = x;
  }
  /* The cap is on the overall, so a summer can still be all shooting. */
  let gain = 0;
  for (const k of RATINGS) gain += d[k] * w[k];
  /* What the cap holds back is not lost: it is next summer's head start, so
     a top prospect gets to the same place a year more slowly. */
  L.flags.devCarry = 0;
  if (gain > SUMMER_CAP) { L.flags.devCarry = round1(gain - SUMMER_CAP); for (const k of RATINGS) if (d[k] > 0) d[k] *= SUMMER_CAP / gain; }
  /* And no single skill jumps more than seven: a kid adds a step, not a new
     body. Measured, the bounce alone went +16 in one summer without it. */
  for (const k of RATINGS) d[k] = Math.min(d[k], 7);
  for (const k of RATINGS) L.rt[k] = clamp(Math.round(L.rt[k] + d[k]), 25, 99);
  if (jump === 'up') L.pot = clamp(L.pot + 2, 40, 99);
  if (jump === 'flat') L.pot = clamp(L.pot - 2, 40, 99);
  if (focus) L.focus = null;
  const after = ovrOf(L);
  const diff = after - before;
  const moved = RATINGS.map((k) => [k, ovT(L, L.rt[k]) - ovT(L, was[k])]).filter((x) => x[1]).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).slice(0, 2);
  const detail = moved.length ? ' ' + moved.map(([k, v]) => RATING_NAME[k] + ' ' + (v > 0 ? '+' : '') + v).join(', ') + '.' : '';
  const head = jump === 'up' && diff > 0 ? 'A breakout summer. ' : jump === 'flat' ? 'A quiet summer. The jump did not come. ' : '';
  if (diff || head) {
    const sd = ovT(L, after) - ovT(L, before), sa = ovT(L, after);
    const t = head + (sd > 0 ? 'Up ' + sd + ' overall, to ' + sa + '.' : sd < 0 ? 'Down ' + (-sd) + ' overall, to ' + sa + '.' : 'Still ' + sa + ' overall.') + detail;
    beats.push({ kind: 'dev', text: t, tone: diff > 0 ? 'good' : diff < 0 ? 'bad' : '' });
    logIt(L, t, diff > 0 ? 'good' : diff < 0 ? 'bad' : '');
  }
  if (focus && L.rt[focus] > was[focus]) beats.push({ kind: 'dev', text: 'Your summer project paid off: ' + RATING_NAME[focus].toLowerCase() + ' ' + ovT(L, was[focus]) + ' to ' + ovT(L, L.rt[focus]) + '.', tone: 'good' });
  if (a >= 29 && L.rt.ath < was.ath - 2 && !L.flags.stepGone) { L.flags.stepGone = L.year; beats.push({ kind: 'dev', text: 'The first step is going. You will have to win with your head.', tone: 'bad' }); }
  if (diff >= 1 && a >= 24) reveal(L, 'lateBloomer', 'Still getting better at ' + a + '.', beats);
  if (L.eth >= 85 && a >= 22) reveal(L, 'gymRat', 'First in the gym. Every day.', beats);
  bump(L, { health: 28 });
}
function develop(L, beats) {
  if (storyOn(L)) return developStory(L, beats);
  const before = ovrOf(L);
  const rng = rngAt(L, 'develop');
  const a = L.age;
  const gap = Math.max(0, L.pot - before);
  const eth = 0.65 + L.eth / 100 * 0.7;
  let grow = gap * (GROW[a] || 0) * (eth + (trait(L, 'gymRat') ? 0.12 : 0));
  if (trait(L, 'lateBloomer')) grow = a <= 22 ? grow * 0.8 : a <= 27 ? grow + gap * 0.05 * eth : grow;
  grow *= lvl(L).grow;
  const dec = (DECLINE[a] || (a >= 38 ? 6.5 : 0)) * (1.2 - L.dur / 250) * (L.flags.longevity ? 0.75 : 1) * bal(L, 'dec', 1) * lvl(L).dec
    + Math.max(0, 50 - L.m.health) * 0.03;
  for (const k of RATINGS) {
    let d = grow * (0.6 + rng() * 0.8);
    if (dec) {
      const legs = k === 'ath' ? 1.6 : k === 'fin' || k === 'def' ? 1.15 : k === 'sho' || k === 'iq' ? 0.45 : 0.9;
      d -= dec * legs * (0.7 + rng() * 0.6);
      if (k === 'iq' && a <= 33) d += 0.6;
      if (k === 'iq' && trait(L, 'filmJunkie')) d += 0.5;
    }
    L.rt[k] = clamp(Math.round(L.rt[k] + d), 25, 99);
  }
  const after = ovrOf(L);
  const diff = after - before;
  if (diff) {
    const sd = ovT(L, after) - ovT(L, before), sa = ovT(L, after);
    const t = sd > 0 ? 'Up ' + sd + ' overall this summer, to ' + sa + '.' : sd < 0 ? 'Down ' + (-sd) + ' overall, to ' + sa + '.' : 'Still ' + sa + ' overall.';
    beats.push({ kind: 'dev', text: t, tone: diff > 0 ? 'good' : 'bad' });
    logIt(L, t, diff > 0 ? 'good' : 'bad');
  }
  if (diff >= 1 && a >= 24) reveal(L, 'lateBloomer', 'Still getting better at ' + a + '.', beats);
  if (L.eth >= 85 && a >= 22) reveal(L, 'gymRat', 'First in the gym. Every day.', beats);
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
    text: 'You are ' + L.age + '. Your overall is ' + ovT(L, ovrOf(L)) + '. The body has an opinion.',
    options: [
      { label: 'One more season', hint: 'Find out what is left.' },
      { label: 'Retire', hint: 'Walk away on your own terms.' },
    ],
  };
}

function offseason(L, beats) {
  const s = L.season;
  develop(L, beats);
  buildCards(L);
  if (!L.pending.some((c) => /^build_/.test(c.id))) nicknameCard(L);
  /* Contracts. */
  const c = L.contract;
  if (c) c.years--;
  const o = ovrOf(L);
  if (L.flags.tradeAsk && c && c.years > 0) {
    const rng = rngAt(L, 'tradeask');
    const to = weighted(rng, CLUBS.filter((x) => x !== L.team), (x) => 2 + clubNet(L, x) + 6);
    L.flags.tradeAsk = false;
    joinTeam(L, to, true);
    beats.push(Object.assign({ kind: 'trade', text: 'Your request is granted. Traded to the ' + E.teamName(to) + '.', tone: 'gold', from: TRADED && TRADED.from, to, how: 'ask', when: 'summer' }, TRADED && TRADED.from ? tradePeople(L, TRADED.from) : {}));
    TRADED = null;
  }
  if (L.age >= bal(L, 'maxAge', 40)) { retire(L, beats, 'The body made the call at ' + L.age + '.'); return; }
  if (storyOn(L) && L.flags.farewell === L.year) { retire(L, beats, 'Retired at ' + L.age + ' after a farewell season.'); return; }
  const tired = L.age >= bal(L, 'tired', 34) || (L.age >= 31 && o < 70);
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
        text: 'Your overall is ' + ovT(L, o) + '. The league has moved on.',
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

/* Retiring is two moments: the press conference, which is here, and the
   rest of your life, which is the `after` card it leaves on the table. The
   career is only over once that card is answered. */
function retire(L, beats, why) {
  L.phase = 'after';
  L.pending = [];
  L.final = legacy(L);
  const t = why || 'Retired at ' + L.age + '.';
  beats.push({ kind: 'retire', text: t, tone: 'gold' });
  logIt(L, t + ' ' + L.final.verdict + '.', 'gold');
  L.pending.push(storyOn(L) ? storyAfterCard(L) : afterCard(L));
}
/* For the screen's own retire button, which can come at any point. */
function retireNow(L) {
  const beats = [];
  if (!L.history.length) { L.pending = []; L.retired = true; L.phase = 'retired'; L.final = legacy(L); return beats; }
  retire(L, beats, 'Retired at ' + L.age + '.');
  headlines(L, beats);
  sayAll(L, beats);
  return beats;
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
/* IN TEN THOUSANDTHS, ALL INTEGER, because the leaderboard works the same
   number out again in SQL (supabase/130_hoops_careers.sql). Written as
   `pts / 1000 * 1.4` it is a float, and a total landing exactly on a half
   can round down here and up there, so the board and the Hall card would
   disagree by one about the same career. Integers round the same way in
   both. check-career asserts the two agree over every career it plays. */
function legacyScore(T) {
  const x = T.pts * 14 + T.reb * 5 + T.ast * 7
    + (T.rings * 4 + T.mvp * 13 + T.fmvp * 6 + T.an1 * 5 + T.star * 2 + T.dpoy * 4 + T.roy * 2 + T.olympic * 2
      /* The Hall in Springfield counts college too, a little. */
      + (T.ncaa || 0) * 2 + (T.npoy || 0) * 3 + (T.aa1 || 0)) * 10000
    + (T.an - T.an1) * 25000;
  return Math.floor((x + 5000) / 10000);
}
function verdictOf(score) { return (VERDICTS.find((x) => score >= x[0]) || VERDICTS[VERDICTS.length - 1])[1]; }
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
  if (!L.history.length) {
    const nv = { totals: T, score: 0, verdict: 'Never made the league', blurb: 'The game gave you a lot. The league never called.' };
    if (storyOn(L)) { nv.origin = L.origin ? ORIGINS[L.origin].name : null; nv.ending = endingOf(L, T, 0, null); }
    return nv;
  }
  const score = legacyScore(T);
  const v = VERDICTS.find((x) => score >= x[0]);
  /* A club retires your number when you were great there for a long time. */
  const by = {};
  for (const h of L.history) if (h.t) by[h.t] = (by[h.t] || 0) + 1;
  let jersey = null;
  for (const c in by) if (by[c] >= 7 && score >= 36 && (!jersey || by[c] > by[jersey])) jersey = c;
  const r = L.rival;
  const rival = r ? { name: r.name, pts: r.pts, star: r.star, mvp: r.mvp, rings: r.rings, beat: L.flags.rivalWins || 0 } : null;
  const out = { totals: T, score, verdict: v[1], blurb: v[2], jersey, rival, life: lifeLine(L) };
  /* A story career is remembered for more than its numbers: what it was
     called, what the league learned about it, and the moments it kept. */
  if (storyOn(L)) {
    out.nick = L.nick || null;
    out.traits = TRAITS.filter((k) => L.traits[k] && L.traits[k].known).map((k) => TRAIT_NAME[k]);
    out.sig = L.sig ? L.sig.name : null;
    out.badges = badgeList(L).map((b) => b.name);
    out.moments = memories(L).slice(-5).map((m) => ({ y: m.y, t: m.t }));
    const G = L.goals || [];
    out.goals = { met: G.filter((g) => g.met).length, of: G.length };
    out.origin = L.origin ? ORIGINS[L.origin].name : null;
    out.ending = endingOf(L, T, score, jersey);
  }
  return out;
}

// ─── the events ─────────────────────────────────────────────────────────────

/* Every card the year can deal. `when` says whether it fits now, `weight` how
   often it comes up, and `options` are run off the card's own seeded draw.
   Each `run` returns the sentence the screen prints under the choice. Every
   person in here is a role, never a name. */
const ok = (rng, p) => rng() < clamp(p, 0.03, 0.97);

// ─── the press room ─────────────────────────────────────────────────────────

/* After the moments a career is remembered for, a microphone. It is Run The
 * Tour's press room arriving at a basketball career: every answer is a TONE,
 * because how you say it is what gets clipped, and the screen shows the tone
 * beside the words.
 *
 * Each tone moves a meter a little and moves the two axes your reputation is
 * read off: FANS (do people love watching you) and RESPECT (do the people
 * inside the game rate you). The persona on the identity card is read off
 * those two, never stored, so it cannot disagree with them.
 *
 * Small on purpose. A press conference is a story about the career and not a
 * lever on it: the biggest move is five points of fame, and check-career's
 * balance bands are measured with the press room in.
 */
const TONES = {
  humble: { name: 'Humble', d: { trust: 3, fame: 1 }, fans: 2, resp: 5 },
  team: { name: 'Team first', d: { trust: 4, morale: 2 }, fans: 2, resp: 5 },
  confident: { name: 'Confident', d: { fame: 3, morale: 2 }, fans: 4, resp: 1 },
  loyal: { name: 'Loyal', d: { trust: 2, morale: 2, fame: 1 }, fans: 5, resp: 2 },
  showman: { name: 'Showman', d: { fame: 4, morale: 2 }, fans: 6, resp: -3 },
  fiery: { name: 'Fiery', d: { morale: 4, fame: 2 }, fans: 4, resp: 0 },
  cold: { name: 'Ice cold', d: { trust: 2, fame: -1 }, fans: -5, resp: 4 },
  cocky: { name: 'Cocky', d: { fame: 5, trust: -3 }, fans: -6, resp: -6, risk: 0.45 },
};
/* What gets said about it afterwards. Two of each, picked by the card's own
   rng, so a reload reads the same line. */
const TONE_SAY = {
  humble: ['The clip goes around. People like you more for it.', 'Nobody writes a headline about it. The locker room notices.'],
  team: ['Your teammates repost it. The room is tight.', '{coach} plays it in the film session. Twice.'],
  confident: ['It plays well. You sound like somebody who belongs.', 'A good quote. It runs all day.'],
  loyal: ['The city puts it on a T-shirt by morning.', 'Season ticket renewals jump. Team owner {owner} sends flowers.'],
  showman: ['It is on every show by lunch. You are a lot of fun.', 'A meme by midnight. Your follower count doubles.'],
  fiery: ['The fans love the fire. The other team saves the clip.', 'It is the quote of the week. Everybody has a take.'],
  cold: ['Four words and you walk off. The league takes you seriously.', 'No smile. No soundbite. Scouts call it focus.'],
  cocky: ['Bold. It backs itself up, for now.', 'Half the league is angry. The other half is watching.'],
};
const TONE_BAD = ['It does not land. {topp} pins it to his locker.', 'It reads worse in print. {tvet} is quiet with you for a week.'];

/* The topics, with the question and the answers. An answer is the words you
   say and the tone they are said in. */
const PRESSERS = {
  draft: { title: 'The podium. A dozen microphones.', text: 'First question: what does this team get in you?',
    ans: [['humble', 'A worker. I will earn everything.'], ['showman', 'A show. Buy your tickets now.'],
      ['cocky', 'The best player in this draft.'], ['cold', 'Put me on the floor. That is my answer.']] },
  mvp: { title: 'The trophy is heavy. So is the room.', text: 'Why you, this year?',
    ans: [['team', 'My teammates made this easy.'], ['confident', 'I earned every vote.'],
      ['cocky', 'It was not close.'], ['showman', 'Wait until next year.']] },
  title: { title: 'Confetti in your hair. A podium on the floor.', text: 'What does this one mean?',
    ans: [['team', 'This is about every guy in that room.'], ['loyal', 'This city deserved it.'],
      ['cocky', 'Told you. Write it down.'], ['cold', 'We expected this. On to the next one.']] },
  finals_loss: { title: 'The locker room is quiet. The cameras are not.', text: 'What happened out there?',
    ans: [['humble', 'They were better. Credit them.'], ['fiery', 'We will be back. Mark it.'],
      ['team', 'On me. Not my teammates.'], ['cold', 'Next question.']] },
  ncaa: { title: 'One shining moment. Then the microphones.', text: 'What is next for you?',
    ans: [['team', 'Enjoying this with my guys.'], ['loyal', 'This school made me.'],
      ['confident', 'The league. I am ready.'], ['cocky', 'Best player in the country. Any questions?']] },
};
const PRESS_EYEBROW = { draft: 'Draft night', mvp: 'MVP press conference', title: 'Champions', finals_loss: 'After the Finals', ncaa: 'National champions' };

function repOf(L) { return L.rep || (L.rep = { fans: 50, resp: 50 }); }
function moveRep(L, fans, resp) {
  const r = repOf(L);
  r.fans = clamp(r.fans + fans, 0, 100);
  r.resp = clamp(r.resp + resp, 0, 100);
}
/* The everyday choices that are also a public statement, as [fans, respect]
   per option. A press conference is a few times a career at most, so without
   these most players would never be anybody in particular. Kept in a table
   rather than on each option, so the event text above stays a story and this
   stays one place to read the reputation off. */
const EVENT_REP = {
  hot_streak: [[-2, -3], [2, 4], [-2, 2]],
  stuck: [[0, 3], [2, -3], [0, 1]],
  film_session: [[0, 3], [0, -3], [1, 0]],
  online_beef: [[3, -4], [1, 1], [-2, 2]],
  ref_heat: [[2, -3], [0, 2]],
  heckler: [[-1, -4], [-1, 2], [4, 1]],
  charity: [[3, 2], [2, 2], [-2, -1]],
  podcast: [[3, -2], [-1, 1]],
  media_day: [[2, -2], [1, 3], [0, 1]],
  rap_album: [[3, -2], [-1, 0]],
  rival_trash: [[1, 3], [3, -3], [-2, 2]],
  docuseries: [[4, -2], [3, 0], [-3, 1]],
  teammate_fight: [[1, -4], [0, 3], [0, 2]],
  playoff_guarantee: [[3, -2], [-1, 2]],
  christmas: [[4, -2], [-1, 2]],
  superteam: [[-4, -2], [4, 2]],
  hometown_call: [[3, 1], [-1, 0]],
  local_ad: [[2, -1], [-1, 0]],
  mentor_rookie: [[1, 4], [0, -1]],
  young_star: [[1, 4], [0, 1], [-2, -2]],
};
/* Nine personas off a three by three of the two axes. */
const PERSONAS = [
  ['Villain', 'Low profile', 'Quiet assassin'],
  ['Loose cannon', 'Still writing it', "Pro's pro"],
  ['Showman', 'Fan favorite', 'Face of the league'],
];
function personaOf(L) {
  const r = repOf(L), band = (v) => v < 42 ? 0 : v > 58 ? 2 : 1;
  return PERSONAS[band(r.fans)][band(r.resp)];
}
function presserCard(L, topic) {
  const p = PRESSERS[topic];
  return {
    id: 'presser', kind: 'presser', key: 'presser:' + topic + ':' + L.year, topic,
    eyebrow: PRESS_EYEBROW[topic], title: p.title, text: p.text,
    options: p.ans.map((a) => ({ label: a[1], tone: a[0], hint: TONES[a[0]].name })),
  };
}
function choosePresser(L, card, opt, rng) {
  const t = TONES[opt.tone] || TONES.humble;
  bump(L, t.d);
  moveRep(L, t.fans, t.resp);
  L.flags.press = (L.flags.press || 0) + 1;
  if (t.risk && !ok(rng, 1 - t.risk)) {
    bump(L, { trust: -3, morale: -2 });
    moveRep(L, -2, -3);
    return { text: TONE_BAD[rng() < 0.5 ? 0 : 1], tone: 'bad' };
  }
  const lines = TONE_SAY[opt.tone] || TONE_SAY.humble;
  return { text: lines[rng() < 0.5 ? 0 : 1], tone: 'good' };
}
/* Text that states a fact reads the fact. A bench player's hot streak is not
   thirty a night, and a proposal says how long it has really been. */
const WORDNUM = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
const wordNum = (n) => WORDNUM[n] || String(n);
/* How many times this event has been dealt in this career, this one included.
   Only a story career counts; anything else reads as the first time. */
const times = (L, id) => Math.max(1, ((L.evlog || {})[id] || []).length);
function streakLine(L) {
  const ppg = L.season && L.season.gp ? perGame(L.season).pts : 10;
  const bar = Math.max(10, Math.round((ppg + 8) / 5) * 5);
  return bar + ' or more three straight nights.';
}
function yearsWith(L) {
  const n = Math.max(1, L.year - (lifeOf(L).since || L.year));
  return wordNum(n) + (n === 1 ? ' year' : ' years');
}
const EVENTS = {
  vet_mentor: {
    phases: ['early'], once: true, req: { seasons: [0, 0] }, weight: () => 4,
    title: '{tvet} pulls you aside.',
    text: () => 'The oldest man in the locker room. He offers to show you how he stayed in the league.',
    options: [
      { label: 'Shadow him every day', run: (L) => { bump(L, { iq: 2, eth: 6, trust: 4 }); arcStart(L, 'mentor', 'arc_mentor_2', 'off', 7, { n: say(L, '{tvet}') }); return 'Film at six. Lift at seven. You learn more than you expected.'; } },
      { label: 'Ask about money', run: (L) => { bump(L, { cash: 0.2, iq: 1 }); L.flags.savvy = true; return 'He tells you what nobody told him. You open a real savings account.'; } },
      { label: 'Do your own thing', run: (L) => { bump(L, { morale: 2 }); return 'He shrugs. There is always another rookie.'; } },
    ],
  },
  rookie_duty: {
    phases: ['early'], once: true, req: { seasons: [0, 0] }, weight: () => 3,
    title: 'Rookie duty.',
    text: () => '{tvet} hands you the order. Breakfast for the plane, every road trip. You are buying.',
    options: [
      { label: 'Go along with it', run: (L) => { bump(L, { trust: 6, cash: -0.05, morale: -2 }); return 'Forty breakfast sandwiches later, the locker room likes you.'; } },
      { label: 'Turn it into content', run: (L, r) => { if (ok(r, 0.6)) { bump(L, { fame: 6, trust: 2 }); return 'The video does numbers. Even {tvet} shares it.'; } bump(L, { fame: 3, trust: -6 }); return 'It does numbers. {tvet} is not laughing.'; } },
      { label: 'Refuse', run: (L) => { bump(L, { trust: -8, morale: 3 }); return 'Bold. Your sneakers are full of ice the next morning.'; } },
    ],
  },
  night_out: {
    phases: ['early', 'mid', 'late'], when: () => true, weight: () => 3,
    title: 'Back-to-back tomorrow. The group chat is going out.',
    text: () => '{tm} is organizing it. Everybody is going. You know how this ends.',
    options: [
      { label: 'Go out', run: (L, r) => { if (ok(r, 0.55)) { bump(L, { morale: 8, health: -4 }); return 'Great night. Rough morning. You get through it.'; } bump(L, { morale: 4, health: -6, trust: -7, fame: 3 }); return 'Photos surface. {gm} has seen them.'; } },
      { label: 'One drink, then home', run: (L) => { bump(L, { morale: 4, health: -1 }); return 'You show your face and leave early. Best of both.'; } },
      { label: 'Stay in', run: (L) => { bump(L, { iq: 1, health: 2, morale: -2 }); return 'Film and sleep. You play well tomorrow.'; } },
    ],
  },
  hot_streak: {
    phases: ['early', 'mid', 'late'], req: { minutes: [22, null] }, weight: () => 3,
    title: 'You are on fire.',
    text: (L) => streakLine(L) + ' The cameras find your locker.',
    options: [
      { label: 'Say you are the best here', run: (L, r) => { bump(L, { fame: 8, trust: -4 }); if (ok(r, 0.5)) { bump(L, { usage: 0.02 }); return '{coach} runs more plays for you. The bigs notice.'; } bump(L, { morale: -3 }); return 'It plays on every channel. {tm} and {tm2} stop passing.'; } },
      { label: 'Credit your teammates', run: (L) => { bump(L, { trust: 5, morale: 4, win: 0.4 }); return 'The locker room loves it. The ball moves a little faster.'; } },
      { label: 'Say nothing', run: (L) => { bump(L, { fame: 2 }); return 'Headphones on. The mystery helps.'; } },
    ],
  },
  slump: {
    phases: ['early', 'mid', 'late'], req: { minutes: [14, null] }, weight: () => 3,
    title: 'You cannot buy a bucket.',
    text: () => 'A month of bricks. The fans have opinions.',
    options: [
      { label: 'Midnight shooting', run: (L, r) => { bump(L, { health: -4 }); if (ok(r, 0.7)) { bump(L, { sho: 2, morale: 4 }); return 'Five hundred makes a night. It comes back.'; } bump(L, { morale: -4 }); return 'Tired legs, flat shots. It gets worse before it gets better.'; } },
      { label: 'Get to the rim instead', run: (L) => { bump(L, { fin: 1, usage: -0.01, perf: 0.4 }); return 'Layups and free throws until the jumper wakes up.'; } },
      { label: 'Keep shooting', run: (L, r) => { if (ok(r, 0.5)) { bump(L, { morale: 6, fame: 2 }); return 'Shooters shoot. It breaks open on the road.'; } bump(L, { morale: -6, trust: -3 }); return 'It does not break. {coach} shortens your leash.'; } },
    ],
  },
  coach_bench: {
    phases: ['early', 'mid'], when: (L) => L.season && L.season.role && L.season.role.starter && L.season.role.diff < 6, weight: () => 2,
    title: '{coach} wants you off the bench.',
    text: () => 'He says the second unit needs a scorer. You hear demotion.',
    options: [
      { label: 'Accept it', run: (L) => { bump(L, { trust: 10, min: -4, usage: 0.03 }); return 'You run the second unit. Sixth Man talk starts by March.'; } },
      { label: 'Push back', run: (L, r) => { if (ok(r, 0.4)) { bump(L, { trust: -3 }); return 'He relents. You keep the spot. For now.'; } bump(L, { trust: -12, min: -5, morale: -6 }); return 'He does it anyway. Now you are benched and annoyed.'; } },
      { label: 'Ask for a trade', run: (L) => { L.flags.tradeAsk = true; bump(L, { trust: -15, fame: 3 }); return '{agent}, your agent, makes the call. Word gets out by morning.'; } },
    ],
  },
  stuck: {
    phases: ['early', 'mid'], when: (L) => L.season && L.season.role && L.season.role.min < 18, weight: () => 4,
    title: 'You are stuck behind {blocker}.',
    text: () => 'Twelve minutes a night. Some nights, none.',
    options: [
      { label: 'Outwork him', run: (L, r) => { bump(L, { eth: 5, health: -3 }); if (ok(r, 0.55)) { bump(L, { trust: 10, min: 5 }); return '{coach} notices. Your minutes go up.'; } bump(L, { trust: 4 }); return 'He notices. Not enough yet.'; } },
      { label: 'Vent on a podcast', run: (L) => { bump(L, { fame: 6, trust: -12, morale: 3 }); return 'Clip goes everywhere. {tm} sends it to {gm}.'; } },
      { label: 'Ask to go to the G League', run: (L) => { bump(L, { fin: 1, sho: 1, iq: 1, min: -3, trust: 4 }); return 'Twenty games of thirty-five minutes. You come back sharper.'; } },
    ],
  },
  film_session: {
    phases: ['early', 'mid', 'late'], when: () => true, weight: () => 2,
    title: 'Film session. The clip is you.',
    text: () => 'You jog back on defense. {coach} plays it three times.',
    options: [
      { label: 'Own it', run: (L) => { bump(L, { def: 1, trust: 6 }); return 'You say it is on you. It does not happen again.'; } },
      { label: 'Argue', run: (L, r) => { if (ok(r, 0.3)) { bump(L, { trust: 2 }); return 'You had a point. {coach} admits the scheme was wrong.'; } bump(L, { trust: -9 }); return 'Bad look. The assistants exchange a glance.'; } },
      { label: 'Laugh it off', run: (L) => { bump(L, { morale: 2, trust: -3 }); return 'The room laughs too. {coach} does not.'; } },
    ],
  },
  teammate_touches: {
    phases: ['mid', 'late'], req: { starter: true }, weight: () => 2,
    title: '{tco} wants the ball.',
    text: () => 'He says he is open on every possession. He tells {beat} too.',
    options: [
      { label: 'Feed him', run: (L) => { bump(L, { pla: 1, usage: -0.02, win: 0.5, trust: 3 }); return 'He gets his. The team wins four straight.'; } },
      { label: 'Talk it out in private', run: (L, r) => { if (ok(r, 0.65)) { bump(L, { morale: 3, win: 0.3 }); return 'Dinner, honesty, a handshake. Fixed.'; } bump(L, { morale: -3 }); return 'He leaves dinner early. It lingers.'; } },
      { label: 'Ignore it', run: (L) => { bump(L, { win: -0.6, morale: -2 }); return 'It festers. You can feel it in the huddles.'; } },
    ],
  },
  trade_rumor: {
    phases: ['mid'], when: (L) => !L.flags.tradeAsk && L.contract && L.contract.years >= 1, weight: (L) => clubNet(L, L.team) < -2 ? 4 : 1.5,
    title: 'Your name is in trade talks.',
    /* On a story career the deadline is a real day that has already passed
       when this is dealt (tradeDeadline), so the talk is about the summer. */
    text: (L) => storyOn(L) ? 'The deadline came and went. The rumors did not. Every summer mock trade has your name in it.' : 'The deadline is Thursday. Your phone will not stop.',
    options: [
      { label: 'Tell them you want to stay', run: (L, r) => { if (storyOn(L)) { bump(L, { trust: 6 }); return '{gm} says he hears you. Summer will tell.'; } bump(L, { trust: 6 }); if (ok(r, 0.8)) return 'General manager {gm} hears you. You stay.'; tradeNow(L, r); return 'They trade you anyway. Business.'; } },
      { label: 'Ask to go to a contender', run: (L, r) => { if (storyOn(L)) { if (L.contract && L.contract.years >= 2) { L.flags.tradeAsk = true; bump(L, { trust: -6 }); return '{agent} makes the call. If it happens, it happens this summer.'; } bump(L, { trust: -4 }); return 'You are a free agent this summer anyway. The call does nothing but annoy {gm}.'; } if (ok(r, 0.55)) { tradeNow(L, r, true); return 'Done. You are headed to a winner.'; } bump(L, { trust: -8 }); return 'No deal. And now everybody knows you wanted out.'; } },
      { label: 'Say nothing', run: (L, r) => { if (storyOn(L)) return 'You let your game do the talking. The rumors fade by April.'; if (ok(r, 0.25)) { tradeNow(L, r); return 'A call at midnight. You have been traded.'; } return 'Thursday passes. You stay.'; } },
    ],
  },
  tank: {
    phases: ['late'], when: (L) => L.season && (L.season.l - L.season.w) >= 10, weight: () => 4,
    title: 'The front office is playing for the lottery.',
    text: () => 'General manager {gm} wants you on a minutes limit for the rest of the year.',
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
      { label: 'Get a second opinion', run: (L) => { bump(L, { cash: -0.1, health: 5 }); return 'Dr. {doctor:last} costs a fortune. Good advice.'; } },
    ],
  },
  shoe_deal: {
    phases: ['pre', 'mid', 'off'], once: true, req: { fame: [55, null] }, weight: () => 4,
    title: 'Two shoe companies want you.',
    text: () => 'One is the biggest brand in the world. One will give you your own shoe.',
    options: [
      { label: 'The biggest brand', run: (L) => { L.endorseBonus = (L.endorseBonus || 0) + 4; bump(L, { fame: 4 }); return 'Big money. One of forty faces on their wall.'; } },
      { label: 'Your own signature shoe', run: (L, r) => { L.endorseBonus = (L.endorseBonus || 0) + 2; bump(L, { fame: 9 }); if (ok(r, 0.5)) { L.endorseBonus += 3; return 'The first colorway sells out in an hour.'; } return 'Smaller check. Your name on a box. Sales are fine.'; } },
      { label: 'Stay a free agent', run: (L) => { bump(L, { morale: 2 }); return 'You wear whatever you want. Nobody pays you for it.'; } },
    ],
  },
  local_ad: {
    phases: ['pre', 'early', 'off'], req: { fame: [25, null] }, weight: () => 2,
    title: 'A car dealership wants a commercial.',
    text: () => 'Thirty seconds. You hold a key and point at the camera.',
    options: [
      { label: 'Do it', run: (L, r) => { bump(L, { cash: 0.25, fame: 2 }); if (ok(r, 0.35)) { bump(L, { fame: 4 }); return 'It is so bad it goes viral. Everybody quotes it.'; } return 'Easy money. Your mom, {mom}, loves it.'; } },
      { label: 'Pass', run: (L) => { bump(L, { morale: 1 }); return 'Your brand stays clean.'; } },
    ],
  },
  online_beef: {
    phases: ['early', 'mid', 'late'], req: { fame: [30, null] }, weight: () => 2,
    title: '{topp} called you overrated.',
    text: () => 'Online. In front of everybody. You play him Friday.',
    options: [
      { label: 'Clap back', run: (L, r) => { bump(L, { fame: 6 }); if (ok(r, 0.5)) { bump(L, { morale: 6 }); return 'Your reply is funnier. The internet picks a side. Yours.'; } bump(L, { morale: -5 }); return 'He wins the thread. It follows you for a week.'; } },
      { label: 'Answer Friday', run: (L, r) => { if (ok(r, 0.35 + (ovrOf(L) - 70) * 0.012)) { bump(L, { fame: 8, morale: 8, perf: 0.3 }); return 'You torch him. You never say a word.'; } bump(L, { morale: -6 }); return 'He gets the better of you. Now it is a thing.'; } },
      { label: 'Ignore it', run: (L) => { bump(L, { trust: 2 }); return '{tvet} respects it.'; } },
    ],
  },
  ref_heat: {
    phases: ['early', 'mid', 'late'], when: () => true, weight: () => 1.5,
    title: 'Third straight no-call on a drive.',
    text: () => 'Referee {ref} is right there. He looks away.',
    options: [
      { label: 'Let him have it', run: (L, r) => { bump(L, { fame: 3, cash: -0.04 }); if (ok(r, 0.5 + hotTax(L))) { bump(L, { trust: -5 }); return 'Ejected. Fined. The crowd loves you.'; } return 'A technical. Worth it, you decide.'; } },
      { label: 'Walk away', run: (L) => { bump(L, { iq: 1 }); return 'You get the next call. Funny how that works.'; } },
    ],
  },
  heckler: {
    phases: ['mid', 'late'], req: { fame: [20, null] }, weight: () => 1.2,
    title: 'A fan courtside is saying things about your family.',
    text: () => 'All night. Security is not doing anything.',
    options: [
      { label: 'Confront him', run: (L, r) => { if (ok(r, 0.4 - hotTax(L))) { bump(L, { fame: 5, trust: -3 }); return 'Words only. He is banned. You are a folk hero.'; } bump(L, { fame: 6, cash: -0.2, trust: -6, rest: 0.03 }); return 'It gets out of hand. Suspended two games.'; } },
      { label: 'Tell security', run: (L) => { bump(L, { trust: 3 }); return 'He is gone by the third quarter. The league backs you.'; } },
      { label: 'Wink and hit a three', run: (L, r) => { if (ok(r, L.rt.sho / 120)) { bump(L, { fame: 6, morale: 5 }); return 'Splash. You blow him a kiss. The clip is everywhere.'; } bump(L, { morale: -2 }); return 'Brick. He gets louder.'; } },
    ],
  },
  charity: {
    phases: ['pre', 'off', 'mid'], req: { cash: 0.5 }, weight: () => 2,
    title: (L) => L.flags.gym ? 'The rec center back home is falling apart.' : 'Your old high school gym is falling apart.',
    text: () => 'The roof leaks onto the court. They ask if you can help.',
    options: [
      { label: 'Pay for a new gym', run: (L) => { const c = Math.min(L.cash * 0.5, 2.5); bump(L, { cash: -c, fame: 6, morale: 8 }); L.flags.gym = true; return arcStart(L, 'gym', 'arc_gym_2', 'off', 0, { kid: personName(L, 'campkid:' + L.year) }) ? 'Construction starts Monday. It opens next summer.' : 'Your name on the wall. The kids lose their minds.'; } },
      { label: 'Run a free camp', run: (L) => { bump(L, { fame: 3, morale: 5, health: -2 }); return 'Three hundred kids. One of them can really play.'; } },
      { label: 'Not now', run: (L) => { bump(L, { morale: -2 }); return 'You tell yourself next year.'; } },
    ],
  },
  family_money: {
    phases: ['pre', 'off', 'early'], req: { cash: 1 }, weight: () => 2,
    title: 'Your cousin {cousin:first} needs money.',
    text: (L) => times(L, 'family_money') > 1 ? 'He is short again. It is a lot.' : 'He is in a jam. It is a lot.',
    options: [
      { label: 'Give it', run: (L) => { bump(L, { cash: -Math.min(0.5, L.cash * 0.2), morale: 3 }); return 'Family is family. You will hear from him again.'; } },
      { label: 'Set up a trust for the family', run: (L) => { bump(L, { cash: -Math.min(0.8, L.cash * 0.25), morale: 6 }); L.flags.savvy = true; return 'Structure. Rules. Fewer awkward calls.'; } },
      { label: 'Say no', run: (L) => { bump(L, { morale: -5 }); return 'Thanksgiving is quiet this year.'; } },
    ],
  },
  investment: {
    phases: ['pre', 'off'], req: { cash: 1.5 }, weight: () => 2,
    title: (L) => times(L, 'investment') > 1 ? '{friend} is back with a new idea.' : '{friend}, a friend from home, has a business idea.',
    text: () => 'Streetwear or burgers or an app. He needs a partner.',
    options: [
      { label: 'Go all in', run: (L, r) => { const st = Math.min(L.cash * 0.4, 4);
        if (storyOn(L) && !(L.arcs && L.arcs.venture)) {
          const good = ok(r, L.flags.savvy ? 0.6 : 0.5), boom = good && ok(r, 0.6);
          bump(L, { cash: -st });
          arcStart(L, 'venture', 'arc_venture_2', 'off', 1, { in: round1(st), more: round1(Math.max(0.2, st * 0.5)), good, boom });
          return 'You put in ' + money(round1(st)) + '. It opens in the spring.';
        }
        if (ok(r, L.flags.savvy ? 0.45 : 0.3)) { bump(L, { cash: st * 1.8, fame: 2 }); return 'It works. You are an owner now.'; } bump(L, { cash: -st, morale: -5 }); return 'It does not work. Neither does the friendship.'; } },
      { label: 'Put in a little', run: (L, r) => { const st = Math.min(L.cash * 0.1, 1); if (ok(r, 0.45)) { bump(L, { cash: st * 1.5 }); return 'A small win. A good story.'; } bump(L, { cash: -st }); return 'Gone. Cheap lesson.'; } },
      { label: 'Pass', run: () => 'You keep the money. You keep the friend.' },
    ],
  },
  podcast: {
    phases: ['off', 'pre'], once: true, req: { fame: [45, null], seasons: [2, null] }, weight: () => 1.5,
    title: 'A network wants you to host a podcast.',
    text: () => 'Weekly. Unfiltered. Good money.',
    options: [
      { label: 'Start it', run: (L, r) => { bump(L, { fame: 8, cash: 0.4 }); if (ok(r, 0.3)) { bump(L, { trust: -8 }); return 'Episode six says too much about the front office. {gm} calls.'; } return 'It is a hit. Players start calling in.'; } },
      { label: 'Not while you are playing', run: (L) => { bump(L, { trust: 3 }); return '{gm} appreciates the focus.'; } },
    ],
  },
  body_care: {
    phases: ['pre', 'off'], once: true, req: { age: [27, null], cash: 1 }, weight: () => 3,
    title: '{guru}, a longevity coach, pitches a full program.',
    text: () => 'Chef, sleep coach, cold tub, the works. It is not cheap.',
    options: [
      { label: 'Buy the whole program', run: (L) => { bump(L, { cash: -Math.min(1.2, L.cash * 0.3), dur: 10, health: 10 }); L.flags.longevity = true; return 'You feel twenty-five. Your decline will be slower.'; } },
      { label: 'Just the chef', run: (L) => { bump(L, { cash: -0.3, health: 6, dur: 4 }); return 'You eat better. It helps.'; } },
      { label: 'You are fine', run: (L) => { bump(L, { morale: 1 }); return 'You are fine. For now.'; } },
    ],
  },
  load_mgmt: {
    phases: ['early', 'mid'], when: (L) => L.age >= 30 && L.season && L.season.role && L.season.role.starter, weight: () => 3,
    title: 'Dr. {doctor:last} wants to rest you on back-to-backs.',
    text: () => 'Twelve games off. Fresher in April.',
    options: [
      { label: 'Agree', run: (L) => { bump(L, { rest: 0.15, health: 8 }); return 'You sit in a suit twelve times. Your knees thank you.'; } },
      { label: 'Refuse. You play every night.', run: (L) => { bump(L, { fame: 3, health: -6, risk: 0.03, trust: 2 }); return 'Old school. The fans love it. Your body has notes.'; } },
    ],
  },
  mentor_rookie: {
    phases: ['early'], req: { age: [29, null], seasons: [6, null] }, weight: () => 2,
    title: '{trook} follows you everywhere.',
    text: (L) => { const p = L.people && L.people['trook:' + peopleKey(L, 'trook')]; return p && p.met < L.year ? 'Second year. Same poster on his wall.' : 'The rookie grew up with your poster on his wall.'; },
    options: [
      { label: 'Take him under your wing', run: (L) => { bump(L, { trust: 6, morale: 6, win: 0.3 }); return 'He gets better fast. So does the team.'; } },
      { label: 'Let him learn the hard way', run: (L) => { bump(L, { morale: -1 }); return 'That is how you learned.'; } },
    ],
  },
  contract_year: {
    phases: ['early'], req: { contract: [1, 1] }, weight: () => 4,
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
      { label: 'Win games', run: (L) => { bump(L, { trust: 4 }); return '{gm} likes that answer.'; } },
      { label: 'Stay healthy', run: (L) => { bump(L, { health: 2 }); return 'Boring. True.'; } },
    ],
  },
  /* Your club's own firing. It is the real carousel: the coach really goes,
     the assistant really runs the bench, and the answer is who the club
     hires. The two names on the buttons are real candidates. */
  coach_fired: {
    phases: ['mid'], weight: () => 2.5,
    when: (L) => { if (!L.season || L.season.l - L.season.w < 8 || !L.team) return false; const x = coachOf(L, L.team); return !!x && !x.interim && L.year - x.since >= 1; },
    queue: (L) => {
      const rng = rngAt(L, 'cfire');
      const out = fire(L, L.team, 0);
      const asst = weighted(rng, coachCandidates(L, L.team, true, rng), (y) => y.w);
      const bigs = coachCandidates(L, L.team, false, rng).filter((y) => y.n !== asst.n && !y.gen);
      const big = weighted(rng, bigs, (y) => y.w) || asst;
      const other = weighted(rng, bigs.filter((y) => y.n !== big.n), (y) => y.w) || asst;
      L.flags.search = { out: out ? out.n : '', asst, big, other };
      hire(L, L.team, asst, true);
    },
    title: 'The club fires {firedcoach}.',
    text: () => '{interim} has the bench for now. General manager {gm} asks who you want next.',
    options: [
      { label: 'Back {interim}', run: (L) => { const x = coachOf(L, L.team); if (x) x.interim = 0; L.m.trust = 62; bump(L, { win: 0.4 }); return '{coach} gets the job. He remembers who backed him.'; } },
      { label: 'Ask for {bigname}', run: (L, r) => { const f = L.flags.search; if (ok(r, 0.5)) { hire(L, L.team, f.big, false); L.m.trust = 55; bump(L, { win: 1 }); return 'They land {coach}. Practices get serious.'; } hire(L, L.team, f.other, false); L.m.trust = 40; return 'They hire {coach} instead. He heard you asked for {bigname}.'; } },
      { label: 'Stay out of it', run: (L, r) => { const f = L.flags.search; if (r() < 0.5) { const x = coachOf(L, L.team); if (x) x.interim = 0; } else hire(L, L.team, f.other, false); L.m.trust = 50; return 'Not your job. Literally. {gm} hands it to {coach}.'; } },
    ],
  },
  buzzer: {
    phases: ['early', 'mid', 'late'], req: { minutes: [24, null] }, weight: () => 2.5,
    title: 'Down one. Four seconds. Your ball.',
    text: () => 'Regular season, but the building does not know that.',
    options: [
      { label: 'Step-back three', run: (L, r) => buzzer(L, r, 0.2 + (L.rt.sho - 50) * 0.0065) },
      { label: 'Attack the rim', run: (L, r) => buzzer(L, r, 0.24 + ((L.rt.fin + L.rt.ath) / 2 - 50) * 0.006) },
      { label: 'Draw a foul', run: (L, r) => buzzer(L, r, 0.22 + (L.rt.iq - 50) * 0.006) },
    ],
  },
  olympics: {
    phases: ['off'], when: (L) => (storyOn(L) ? L.year % 4 === 0 : (L.year + 1) % 4 === 0) && ovrOf(L) >= 82, weight: () => 9,
    title: 'Team USA calls.',
    text: () => 'Twelve spots. One is yours if you want it.',
    options: [
      { label: 'Go for gold', run: (L, r) => { bump(L, { health: -10, fame: 6 }); if (ok(r, 0.78)) { L.flags.olympic = (L.flags.olympic || 0) + 1; const h = L.history[L.history.length - 1]; if (h) h.aw.push('olympic'); logIt(L, 'Olympic gold.', 'gold'); return 'Gold. The anthem hits different.'; } return 'Silver. It stings for a long time.'; } },
      { label: 'Rest this summer', run: (L) => { bump(L, { health: 6 }); return 'The legs need it.'; } },
    ],
  },
  superteam: {
    phases: ['off'], when: (L) => ovrOf(L) >= (storyOn(L) ? 82 : 84) && L.contract && L.contract.years >= 1 && clubNet(L, L.team) < (storyOn(L) ? 3 : 2), weight: (L) => storyOn(L) ? 3 : 2,
    title: '{agent} has a contender on the line.',
    text: () => 'Two stars there want a third. They want you, and they want an answer this week.',
    options: [
      { label: 'Request the trade', run: (L, r) => { tradeNow(L, r, true); bump(L, { fame: 5, trust: 0 }); return 'It happens. The league calls it a superteam.'; } },
      { label: 'Stay loyal', run: (L) => { bump(L, { morale: 4, fame: 2, trust: 8 }); return 'You hang up. Your city notices.'; } },
    ],
  },
  rap_album: {
    phases: ['off'], once: true, req: { fame: [50, null] }, weight: () => 1,
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
    text: () => 'Dr. {doctor:last} wants a quiet summer. {trainer}, your trainer, wants work.',
    options: [
      { label: 'Rest', run: (L) => { bump(L, { health: 14 }); return 'Sleep, swim, repeat.'; } },
      { label: 'Work anyway', run: (L) => { bump(L, { health: -4, eth: 4, sho: 1 }); return 'You do it anyway. That is who you are.'; } },
    ],
  },  rival_trash: {
    phases: ['early', 'mid'], when: (L) => rivalOn(L) && L.m.fame >= 25, weight: () => 2.5,
    title: 'Your draft-class rival is talking.',
    text: (L) => L.rival.name + ' says you were the wrong pick. On a podcast. With video.',
    options: [
      { label: 'Answer on the court', run: (L, r) => { if (ok(r, 0.45 + (ovrOf(L) - L.rival.ovr) * 0.04)) { bump(L, { fame: 7, morale: 6 }); L.flags.rivalWins = (L.flags.rivalWins || 0) + 1; return 'You see him in March. You win and outscore him by fifteen.'; } bump(L, { morale: -6 }); return 'You see him in March. He wins it. He says so, loudly.'; } },
      { label: 'Answer online', run: (L, r) => { bump(L, { fame: 5, trust: -2 }); if (ok(r, 0.5)) return 'Your reply is better than his podcast. The internet agrees.'; bump(L, { morale: -3 }); return 'He has better writers. It goes on for a week.'; } },
      { label: 'Say nothing', run: (L) => { bump(L, { trust: 3 }); return '{tvet} tells you that was the right answer.'; } },
    ],
  },
  rival_tv: {
    phases: ['late'], when: (L) => rivalOn(L) && L.rival.ovr >= 74 && ovrOf(L) >= 74, weight: () => 2,
    title: 'You and your rival on national TV.',
    text: (L) => 'The whole broadcast is about you and ' + L.rival.name + '.',
    options: [
      { label: 'Guard him yourself', run: (L, r) => { if (ok(r, 0.35 + (L.rt.def - 70) * 0.02)) { bump(L, { fame: 6, def: 1 }); L.flags.rivalWins = (L.flags.rivalWins || 0) + 1; return 'He goes five for eighteen. You hear about it all week.'; } bump(L, { morale: -4 }); return 'He gets his. Thirty-two on you.'; } },
      { label: 'Outscore him', run: (L, r) => { if (ok(r, 0.4 + (ovrOf(L) - L.rival.ovr) * 0.04)) { bump(L, { fame: 8, morale: 6 }); L.flags.rivalWins = (L.flags.rivalWins || 0) + 1; return 'Forty to his twenty-six. The clip of you waving is everywhere.'; } bump(L, { morale: -5 }); return 'He wins the duel and the game.'; } },
      { label: 'Make it about the team', run: (L) => { bump(L, { trust: 4, win: 0.3 }); return 'A team win. The broadcast is disappointed.'; } },
    ],
  },
  meet_someone: {
    phases: ['off', 'pre'], req: { rel: 'single', age: [21, null] }, weight: () => 2.2,
    title: 'Somebody catches your eye.',
    text: () => 'Their name is {partner}. You meet at {friend:first}\'s birthday dinner. They have no idea who you are.',
    options: [
      { label: 'Ask them out', run: (L, r) => { if (ok(r, 0.7)) { const f = lifeOf(L); f.rel = 'dating'; f.since = L.year; bump(L, { morale: 8 }); logIt(L, 'Met {partner}.', 'good'); relate(L, 'partner', 30, 'You met at a birthday dinner.'); return 'Dinner turns into a whole weekend. You are smitten.'; } bump(L, { morale: -2 }); lifeOf(L).pn = (lifeOf(L).pn || 0) + 1; return 'They are not interested. That has not happened in years.'; } },
      { label: 'Focus on basketball', run: (L) => { bump(L, { eth: 2 }); return 'You go home early. You watch film.'; } },
    ],
  },
  propose: {
    phases: ['off', 'pre'], when: (L) => lifeOf(L).rel === 'dating' && L.year - lifeOf(L).since >= 1, weight: () => 3,
    title: 'You have a ring in your pocket.',
    text: (L) => yearsWith(L) + ' with {partner}. The jeweler says it is perfect.',
    options: [
      { label: 'Propose', run: (L, r) => { const f = lifeOf(L); if (ok(r, 0.85)) { f.rel = 'engaged'; bump(L, { morale: 10 }); logIt(L, 'Engaged to {partner}.', 'good'); relate(L, 'partner', 25, 'You proposed. Yes.'); return 'Yes. Before you even finish the question.'; } f.rel = 'single'; bump(L, { morale: -12 }); const nm = say(L, '{partner}'); f.pn = (f.pn || 0) + 1; return nm + ' says they need time. Then they need space.'; } },
      { label: 'Not yet', run: (L) => { bump(L, { morale: -1 }); return 'The ring goes back in the drawer.'; } },
    ],
  },
  wedding: {
    phases: ['off'], req: { rel: 'engaged' }, weight: () => 6,
    title: 'Wedding planning.',
    text: () => '{partner} has a list. {tm} has opinions.',
    options: [
      { label: 'Throw the party of the year', run: (L) => { lifeOf(L).rel = 'married'; bump(L, { cash: -Math.min(1.5, L.cash * 0.15), fame: 4, morale: 10 }); logIt(L, 'Married {partner}.', 'gold'); return 'Four hundred guests. The whole roster dances.'; } },
      { label: 'Something small', run: (L) => { lifeOf(L).rel = 'married'; bump(L, { morale: 10 }); logIt(L, 'Married {partner}.', 'gold'); return 'Family only, on a beach. Perfect.'; } },
    ],
  },
  baby: {
    phases: ['off', 'pre'], when: (L) => lifeOf(L).rel === 'married' && lifeOf(L).kids < 4 && L.age <= 38, weight: () => 2,
    title: '{partner} wants to talk about kids.',
    text: (L) => lifeOf(L).kids ? 'Another one?' : 'You always said you wanted a big family.',
    options: [
      { label: 'Start a family', run: (L) => {
        const f = lifeOf(L); f.kids++; bump(L, { morale: 10, health: -3 });
        /* A story career knows boy or girl, because only a son can be played next. */
        if (storyOn(L)) {
          const boy = kidIsSon(L, f.kids - 1); if (Number.isFinite(f.sons) && boy) f.sons++;
          logIt(L, (f.kids === 1 ? 'Became a parent. ' : 'Welcomed kid number ' + f.kids + '. ') + (boy ? 'A boy.' : 'A girl.'), 'good');
          return (f.kids === 1 ? 'A baby ' : 'Kid number ' + f.kids + ', a baby ') + (boy ? 'boy' : 'girl') + ' by next summer. ' + (f.kids === 1 ? 'You learn to sleep in two-hour pieces.' : 'The house is loud.');
        }
        logIt(L, f.kids === 1 ? 'Became a parent.' : 'Welcomed kid number ' + f.kids + '.', 'good'); return f.kids === 1 ? 'A baby by next summer. You learn to sleep in two-hour pieces.' : 'Kid number ' + f.kids + '. The house is loud.'; } },
      { label: 'After you retire', run: (L) => { bump(L, { morale: -2 }); return 'You agree to wait. Mostly.'; } },
    ],
  },
  breakup: {
    phases: ['off', 'mid'], when: (L) => lifeOf(L).rel === 'dating' && (L.m.morale < 45 || L.m.fame > 70), weight: () => 1.5,
    title: 'Things are not good at home.',
    text: () => 'Road trips, cameras, the group chat. {partner} says it is too much.',
    options: [
      { label: 'Fight for it', run: (L, r) => { if (ok(r, 0.55)) { bump(L, { morale: 4 }); return 'Counseling, a vacation, a long talk. You make it.'; } lifeOf(L).rel = 'single'; bump(L, { morale: -10 }); lifeOf(L).pn = (lifeOf(L).pn || 0) + 1; return 'It ends anyway. Quietly.'; } },
      { label: 'Let it go', run: (L) => { lifeOf(L).rel = 'single'; bump(L, { morale: -6 }); lifeOf(L).pn = (lifeOf(L).pn || 0) + 1; return 'You move out in the offseason.'; } },
    ],
  },
  hometown_call: {
    phases: ['off'], once: true, when: (L) => homeClub(L) && L.team && L.team !== homeClub(L) && ovrOf(L) >= 74 && L.contract && L.contract.years >= 1, weight: () => 3,
    title: 'Your hometown club calls.',
    text: (L) => 'The ' + E.teamName(homeClub(L)) + ' want you home. Your mom, {mom}, already said yes.',
    options: [
      { label: 'Go home', run: (L) => { joinTeam(L, homeClub(L), true); bump(L, { morale: 15, fame: 5 }); L.flags.home = true; return 'They trade for you. Your old coach {hscoach} is at the press conference.'; } },
      { label: 'Stay where you are', run: (L) => { bump(L, { trust: 6, morale: -2 }); return 'Not yet. Maybe at the end.'; } },
    ],
  },
  docuseries: {
    phases: ['pre', 'off'], once: true, req: { fame: [60, null] }, weight: () => 2,
    title: 'A streaming service wants a documentary.',
    text: () => 'Cameras everywhere for a season. Your house, your locker, your car.',
    options: [
      { label: 'Let them in', run: (L, r) => { bump(L, { fame: 10, cash: 0.8 }); if (ok(r, 0.6)) return 'It is a hit. Your mom, {mom}, becomes a star.'; bump(L, { trust: -8, morale: -3 }); return 'Episode four shows a locker room fight. Nobody forgets.'; } },
      { label: 'Produce it yourself', run: (L) => { bump(L, { fame: 7, cash: 0.4 }); return 'You control the edit. It is a little flattering.'; } },
      { label: 'No cameras', run: (L) => { bump(L, { trust: 3 }); return 'Your teammates appreciate it.'; } },
    ],
  },
  teammate_fight: {
    phases: ['early', 'mid'], req: { minutes: [18, null] }, weight: () => 1.6,
    title: '{tm} shoves you in practice.',
    text: () => 'Hard foul, harder words. Everybody stops.',
    options: [
      { label: 'Shove him back', run: (L, r) => { if (ok(r, 0.4 - hotTax(L))) { bump(L, { trust: 2, morale: 3 }); return '{coach} steps in. You two are fine by dinner.'; } bump(L, { rest: 0.04, trust: -8, fame: 3 }); return 'It leaks. You both get suspended a game.'; } },
      { label: 'Walk away', run: (L) => { bump(L, { trust: 4, morale: -2 }); return 'You go to the other end and shoot. The room respects it.'; } },
      { label: 'Settle it in a scrimmage', run: (L, r) => { if (ok(r, 0.5 + (ovrOf(L) - 72) * 0.02)) { bump(L, { trust: 6, morale: 5 }); return 'You cook him for twenty minutes. Nobody shoves you again.'; } bump(L, { morale: -4 }); return 'He cooks you. The practice video gets passed around.'; } },
    ],
  },
  young_star: {
    phases: ['pre'], once: true, when: (L) => L.age >= 31 && L.season && L.seasonsDone >= 8, weight: () => 3,
    title: 'The club drafted {trook}.',
    text: () => 'A teenager at your position. Number two pick. {gm} says he needs minutes.',
    options: [
      { label: 'Mentor him', run: (L) => { bump(L, { trust: 8, min: -2, morale: 4, win: 0.3 }); return 'He listens. He takes your minutes and thanks you for them.'; } },
      { label: 'Make him earn it', run: (L, r) => { if (ok(r, 0.5 + (ovrOf(L) - 76) * 0.03)) { bump(L, { min: 2, fame: 3 }); return 'You keep the job another year.'; } bump(L, { min: -5, morale: -6 }); return 'He wins the job by January.'; } },
      { label: 'Ask to be moved', run: (L) => { L.flags.tradeAsk = true; bump(L, { trust: -8 }); return 'You want to start somewhere. You say so.'; } },
    ],
  },
  buyout: {
    phases: ['mid'], once: true, when: (L) => L.age >= 33 && L.team && clubNet(L, L.team) < 0 && L.contract && L.contract.years >= 1, weight: () => 3,
    title: 'Your club offers a buyout.',
    text: () => 'Give back some money, become a free agent, and chase a ring this spring.',
    options: [
      { label: 'Take it and join a contender', run: (L, r) => { bump(L, { cash: -Math.min(1.5, L.cash * 0.1) }); tradeNow(L, r, true); L.contract = { years: 1, total: 1, salary: round1(capFor(L.year) * MIN_PCT), kind: 'min', start: L.year }; return 'You sign with a contender the next day.'; } },
      { label: 'Finish it out', run: (L) => { bump(L, { trust: 5, morale: -2 }); return 'Loyal to the end. The young guys watch how you work.'; } },
    ],
  },
  christmas: {
    phases: ['early'], req: { fame: [45, null], starter: true }, weight: () => 2,
    title: 'You are on the Christmas Day schedule.',
    text: () => 'The biggest regular season stage there is. Every family in the country has it on.',
    options: [
      { label: 'Wear custom shoes and take over', run: (L, r) => { if (ok(r, 0.35 + (ovrOf(L) - 75) * 0.025)) { bump(L, { fame: 8, morale: 6 }); return 'Thirty-eight points and the shoes sell out by New Year.'; } bump(L, { fame: 2, morale: -4 }); return 'Cold night. The shoes were nice.'; } },
      { label: 'Play your game', run: (L) => { bump(L, { trust: 3, win: 0.2 }); return 'A win in front of everybody. That is the gift.'; } },
    ],
  },
  agent_pitch: {
    phases: ['off'], once: true, when: (L) => L.seasonsDone >= 3 && L.agent !== 'power', weight: () => 2,
    title: '{newagent} from a power agency wants you.',
    text: () => 'They promise bigger deals and bigger shoe money. They take four percent.',
    options: [
      { label: 'Switch agents', run: (L) => { const old = say(L, '{agent}'); L.agent = 'power'; bump(L, { morale: 2 }); logIt(L, 'Signed with {agent} of a power agency.', ''); return old + ' takes it personally.'; } },
      { label: 'Stay loyal', run: (L) => { bump(L, { morale: 3 }); return '{agent} cries on the phone. Good tears.'; } },
    ],
  },
  playoff_guarantee: {
    phases: ['late'], when: (L) => L.season && L.season.seed && L.season.seed <= 8 && L.m.fame >= 35, weight: () => 2.5,
    title: 'Reporters ask about the first round.',
    text: () => '{reporter} asks if you can win the series. The cameras lean in.',
    options: [
      { label: 'Guarantee it', run: (L, r) => { bump(L, { fame: 6 }); if (ok(r, 0.55)) { bump(L, { win: 0.5, morale: 4 }); return 'The room goes quiet. Your teammates love it.'; } bump(L, { morale: -3, trust: -3 }); return 'The other team pins the quote on their wall.'; } },
      { label: 'One game at a time', run: (L) => { bump(L, { trust: 3 }); return 'Boring. Correct.'; } },
    ],
  },
  /* THE RELATIONSHIP WEB. Each of these is dealt off a meter in the person
     ledger, so it only comes to a career that earned it. */
  agent_rift: {
    phases: ['off'], req: { story: true }, when: (L) => relOf(L, 'agent') <= -20, weight: 4,
    title: '{agent} wants a word.',
    text: () => 'He says you stopped listening. He has other clients.',
    options: [
      { label: 'Make it right', run: (L) => { relate(L, 'agent', 35, 'You patched it up over dinner.'); bump(L, { morale: 2 }); return 'Dinner. An apology. He picks up on the first ring again.'; } },
      { label: 'Fire him', run: (L) => { const old = say(L, '{agent}'); L.agent = L.agent === 'power' ? 'boutique' : 'power'; relate(L, 'agent', 10, 'He took you on after the split.'); logIt(L, 'Fired ' + old + '. Signed with {agent}.', ''); return old + ' is out. {agent} starts Monday.'; } },
    ],
  },
  mom_game: {
    phases: ['early', 'mid'], once: true, req: { story: true, team: true }, when: (L) => relOf(L, 'mom') >= 25, weight: 2.5,
    title: '{mom} wants to see you play.',
    text: () => 'Live, from the front row. She has never seen a game in your building.',
    options: [
      { label: 'Fly her out this week', run: (L) => { bump(L, { cash: -0.05, morale: 8 }); relate(L, 'mom', 20, 'She saw you play from the front row.'); return 'Front row. She cheers every free throw. Even theirs.'; } },
      { label: 'After the season', run: (L) => { relate(L, 'mom', -5); return 'She says that is fine. It is mostly fine.'; } },
    ],
  },
  beat_feature: {
    phases: ['pre'], once: true, req: { story: true, team: true }, when: (L) => relOf(L, 'beat') >= 15, weight: 3,
    title: '{beat} wants a long feature.',
    text: () => 'Three days with you. Your family, your town, your work.',
    options: [
      { label: 'Open up', run: (L) => { bump(L, { fame: 6 }); relate(L, 'beat', 20, 'He wrote your long feature.'); return 'It runs Sunday. Your mom reads it twice.'; } },
      { label: 'Keep it to basketball', run: (L) => { bump(L, { fame: 2 }); relate(L, 'beat', 5); return 'A good story. Not the one he wanted.'; } },
    ],
  },
  critic_segment: {
    phases: ['mid'], req: { story: true, fame: [35, null] }, when: (L) => relOf(L, 'critic') <= -10, weight: 3,
    title: '{critic} spends a whole segment on you.',
    text: () => 'Eleven minutes. A graphic with your face on it. The word is fraud.',
    options: [
      { label: 'Go on his show', run: (L, r) => { if (ok(r, 0.5)) { relate(L, 'critic', 30, 'You went on his show and won the room.'); bump(L, { fame: 6 }); return 'You are funny and calm. He admits you have a point.'; } relate(L, 'critic', -15, 'You went on his show. It went badly.'); bump(L, { fame: 3, morale: -5 }); return 'He talks over you for ten minutes. It goes viral for him.'; } },
      { label: 'Answer with a win', run: (L) => { bump(L, { win: 0.3, trust: 2 }); return 'Thirty and a win the next night. He moves on to somebody else.'; } },
    ],
  },
  bff_call: {
    phases: ['off'], req: { story: true }, when: (L) => { const b = bestMate(L); return !!(b && L.year - b.met >= 2); }, weight: 3, rarity: 'uncommon',
    title: '{bff} calls.',
    text: () => 'Your closest teammate. He just wants to talk. It is late.',
    options: [
      { label: 'Stay up and talk', run: (L) => { relate(L, 'bff', 15, 'You talked until three in the morning.'); bump(L, { morale: 6, health: -2 }); return 'Two hours. About everything except basketball.'; } },
      { label: 'Call him tomorrow', run: (L) => { relate(L, 'bff', -5); return 'You forget. He does not mention it.'; } },
    ],
  },
  /* The setup of the feud arc. An invented player, named once and kept. */
  feud_start: {
    phases: ['early', 'mid'], req: { story: true, seasons: [1, null], fame: [25, null], minutes: [18, null] }, weight: 1.2, rarity: 'uncommon',
    queue: (L) => arcStart(L, 'feud', null, 'early', 1, { n: personName(L, 'foe:' + L.year) }),
    title: '{foe} calls you soft.',
    text: () => 'On his podcast, by name. The clip is in your phone forty times.',
    options: [
      { label: 'Answer on the floor', run: (L) => { arcGo(L, 'feud', 'arc_feud_2', 'early', 1); relate(L, 'foe', -15, 'He called you soft.'); return 'You find his team on next season\'s schedule. December.'; } },
      { label: 'Answer online', run: (L) => { arcGo(L, 'feud', 'arc_feud_2', 'early', 1); relate(L, 'foe', -25, 'You went at him online.'); bump(L, { fame: 4 }); return 'Your reply does numbers. He answers in an hour.'; } },
      { label: 'Let it go', run: (L) => { arcEnd(L, 'feud', 'ignored'); bump(L, { trust: 2 }); return 'He tries twice more. Then he finds somebody else.'; } },
    ],
  },
  /* The two April cards of a story career. The regular season is over, so
     these are about what is left: the playoffs, or the summer. */
  playoff_eve: {
    phases: ['late'], req: { story: true }, when: (L) => !!(L.season && L.season.po && !L.season.po.out), weight: 3,
    title: 'The playoffs start Saturday.',
    text: () => '{coach} wants you on their best player.',
    options: [
      { label: 'Take the assignment', run: (L) => { bump(L, { def: 1, win: 0.3, health: -2 }); remember(L, 'po.stopper', L.year); return 'You fall asleep to their film.'; } },
      { label: 'Save your legs for scoring', run: (L) => { bump(L, { perf: 0.3, trust: -3 }); return 'He gives the job to {tvet}. He notes who asked.'; } },
    ],
  },
  exit_interview: {
    phases: ['late'], req: { story: true }, when: (L) => !!(L.season && L.season.po && L.season.po.out), weight: 3,
    title: 'Exit interview.',
    text: () => '{gm} has your season on one page. He wants to hear next year.',
    options: [
      { label: 'Promise a big summer', run: (L) => { bump(L, { eth: 4, trust: 4 }); arcStart(L, 'promise', 'arc_promise_2', 'pre', 1, { ovr: ovrOf(L) }); return 'He writes it down. So do you.'; } },
      { label: 'Ask for help on the roster', run: (L) => { bump(L, { trust: -2 }); const again = !!recall(L, 'asked.help'); remember(L, 'asked.help', L.year); return again ? 'He says he is working on it. He said that last time too.' : 'He says he is working on it.'; } },
      { label: 'Blame the system', run: (L) => { bump(L, { trust: -8, fame: 2 }); remember(L, 'blamed.system', L.year); return '{beat} has it on the site by lunch.'; } },
    ],
  },
};

// ─── the people around you ──────────────────────────────────────────────────

/* A RIVAL FROM YOUR DRAFT CLASS. He is invented, like you, and he is drafted
   near you, so every season there is somebody your career is measured
   against. His seasons are drawn off a curve rather than played, because he
   exists to be compared with and nothing in the league runs through him. */
const RIVAL_FIRST = ['Terrence', 'Damon', 'Kobi', 'Jaylen', 'Desmond', 'Rico', 'Lamar', 'Tariq', 'Bryce', 'Keon',
  'Moses', 'Isaac', 'Dorian', 'Aaron', 'Javon', 'Corey', 'Emeka', 'Andrei', 'Felix', 'Royce'];
const RIVAL_LAST = ['Holloway', 'Stanfield', 'Mbeki', 'Carraway', 'Lindqvist', 'Prescott', 'Obiora', 'Brannigan',
  'Delacroix', 'Ruffin', 'Tillman', 'Varga', 'Kincaid', 'Osei', 'Pemberton', 'Lockhart', 'Winslow', 'Achebe'];

function makeRival(L, myPick) {
  const rng = rngAt(L, 'rival');
  let name = pick(rng, RIVAL_FIRST) + ' ' + pick(rng, RIVAL_LAST);
  if (name === L.name) name = pick(rng, RIVAL_FIRST) + ' Okafor-' + pick(rng, RIVAL_LAST);
  /* The kid from camp is the rival on draft night too. */
  if (storyOn(L) && recall(L, 'camp.met') && L.name !== CAST.dre) name = CAST.dre;
  const p = myPick ? clamp(myPick + (rng() < 0.5 ? -1 : 1) * (1 + Math.floor(rng() * 3)), 1, 60) : 1 + Math.floor(rng() * 14);
  const o = ovrOf(L);
  L.rival = {
    name, pos: pick(rng, POS), team: pick(rng, CLUBS.filter((c) => c !== L.team)), pick: p,
    age: L.age + (rng() < 0.5 ? 0 : 1), ovr: clamp(Math.round(o + norm(rng) * 2.5), 45, 80),
    pot: clamp(Math.round(L.pot + norm(rng) * 5), 60, 97), seasons: [], retired: false,
    star: 0, mvp: 0, rings: 0, pts: 0, gp: 0,
  };
  /* On a story career two men are never taken with one pick, and the rival
     goes to the club that really picks there. */
  if (storyOn(L)) {
    const R = L.rival;
    if (myPick && R.pick === myPick) R.pick = myPick === 1 ? 2 : myPick - 1;
    const c = draftOrder(L)[R.pick - 1];
    if (c && c !== L.team) R.team = c;
  }
}
function rivalSeason(L, beats) {
  const r = L.rival;
  if (!r || r.retired) return;
  const rng = rngAt(L, 'rivalyr');
  const gap = Math.max(0, r.pot - r.ovr);
  r.ovr = clamp(Math.round(r.ovr + gap * (GROW[r.age] || 0) * (0.8 + rng() * 0.6) - (DECLINE[r.age] || (r.age >= 38 ? 6 : 0)) * (0.7 + rng() * 0.6)), 40, 98);
  const pts = round1(clamp((r.ovr - 58) * 0.85 + norm(rng) * 2, 2, 34));
  const gp = Math.round(clamp(76 - Math.max(0, r.age - 30) * 3 + norm(rng) * 6, 30, 82));
  const aw = [];
  if (r.ovr + norm(rng) * 2 >= 87) { aw.push('star'); r.star++; }
  if (r.ovr >= 92 && rng() < 0.12) { aw.push('mvp'); r.mvp++; }
  if (rng() < clamp(0.03 + (r.ovr - 75) * 0.004, 0.01, 0.12)) { aw.push('champ'); r.rings++; }
  if (rng() < 0.12) r.team = pick(rng, CLUBS.filter((c) => c !== r.team));
  r.seasons.push({ y: L.year, age: r.age, team: r.team, ovr: r.ovr, pts, gp, aw });
  r.pts += Math.round(pts * gp); r.gp += gp;
  const first = r.name.split(' ')[0];
  if (aw.indexOf('mvp') >= 0) beats.push({ kind: 'rival', text: 'Your draft-class rival, ' + r.name + ', wins MVP.', tone: '' });
  else if (aw.indexOf('champ') >= 0) beats.push({ kind: 'rival', text: r.name + ' wins a ring with the ' + nick(r.team) + '.', tone: '' });
  else if (aw.indexOf('star') >= 0 && r.star === 1) beats.push({ kind: 'rival', text: first + ' makes his first All-Star team.', tone: '' });
  r.age++;
  if ((r.age >= 34 && (r.ovr < 68 || rng() < 0.25)) || r.age >= 39) {
    r.retired = true;
    beats.push({ kind: 'rival', text: r.name + ' retires. ' + r.pts.toLocaleString('en-US') + ' points.', tone: '' });
    logIt(L, 'Your draft-class rival ' + r.name + ' retired.', '');
  }
}
const rivalOn = (L) => !!(L.rival && !L.rival.retired);

/* A LIFE OFF THE FLOOR. The person you meet, the wedding, the kids. Each of
   them has a generated name ({partner}, keyed on `pn`, so a new relationship
   is a new person), and every one moves morale
   more than it moves anything about basketball, which is the BitLife half. */
function lifeOf(L) { return L.life || (L.life = { rel: 'single', kids: 0, since: 0 }); }
function lifeLine(L) {
  const f = lifeOf(L);
  const who = say(L, '{partner}');
  const rel = f.rel === 'married' ? 'Married to ' + who : f.rel === 'engaged' ? 'Engaged to ' + who : f.rel === 'dating' ? 'Dating ' + who : 'Single';
  if (f.kids && storyOn(L)) {
    const b = sonsOf(L), g = f.kids - b, parts = [];
    if (b) parts.push(b + (b === 1 ? ' son' : ' sons'));
    if (g) parts.push(g + (g === 1 ? ' daughter' : ' daughters'));
    return rel + ', ' + parts.join(' and ');
  }
  return rel + (f.kids ? ', ' + f.kids + (f.kids === 1 ? ' kid' : ' kids') : '');
}
/* Boy or girl, off the seed and the birth order, so it is never stored and
   never moves another draw. A save can carry a count instead (sons), which
   wins: it is what the page and the checker set. */
function kidIsSon(L, i) { return (E.hashSeed(String(L.seed) + ':kid:' + i) & 1) === 1; }
function sonsOf(L) {
  const f = lifeOf(L);
  if (Number.isFinite(f.sons)) return Math.max(0, Math.min(f.sons, f.kids || 0));
  let n = 0; for (let i = 0; i < (f.kids || 0); i++) if (kidIsSon(L, i)) n++;
  return n;
}

/* A hometown for the NBA's own clubs, so a road career can be called home. */
const HOME_CLUB = { Baltimore: 'WAS', Chicago: 'CHI', Houston: 'HOU', Atlanta: 'ATL', Oakland: 'GSW', Philadelphia: 'PHI',
  Dallas: 'DAL', Indianapolis: 'IND', Memphis: 'MEM', Detroit: 'DET', Brooklyn: 'BRK', Charlotte: 'CHO', Milwaukee: 'MIL',
  Phoenix: 'PHO', 'New Orleans': 'NOP', Akron: 'CLE', Gary: 'CHI', Newark: 'BRK', Minneapolis: 'MIN', Raleigh: 'CHO',
  Louisville: 'IND', Compton: 'LAL' };
const homeClub = (L) => (L.am && HOME_CLUB[L.am.town]) || null;

// ─── milestones ─────────────────────────────────────────────────────────────

const MILESTONES = [['pts', [10000, 20000, 25000, 30000, 35000, 40000], 'points'], ['reb', [10000, 15000], 'rebounds'],
  ['ast', [5000, 10000], 'assists'], ['gp', [1000, 1300], 'games']];
function milestones(L, before, beats) {
  const now = totals(L);
  for (const [k, steps, word] of MILESTONES) {
    for (const m of steps) {
      if (before[k] < m && now[k] >= m) {
        const t = m.toLocaleString('en-US') + ' career ' + word + '.';
        beats.push({ kind: 'milestone', text: t, tone: 'gold' });
        logIt(L, t, 'gold');
        bump(L, { fame: 3 });
      }
    }
  }
}

// ─── after basketball ───────────────────────────────────────────────────────

/* The last card of a life, and the one line the Hall of Fame card ends on. */
function afterCard(L) {
  return {
    id: 'after', kind: 'event', key: 'after', scene: 'The last locker', eyebrow: 'After basketball', title: 'So what\'s next?',
    text: 'You\'re ' + L.age + ', with ' + money(L.cash) + ' in the bank. The jersey\'s in a box now.',
    options: [
      { label: 'Get into coaching', hint: 'Basketball IQ ' + ovT(L, L.rt.iq) + '. Start on somebody\'s bench.' },
      { label: 'Go into television', hint: 'Fame ' + L.m.fame + '. A desk and a good suit.' },
      { label: 'Run a front office', hint: 'Build the team you wanted.' },
      { label: 'Go into business', hint: 'Money ' + money(L.cash) + '. Make it work.' },
      { label: 'Go home', hint: 'Family, your town, no cameras.' },
    ],
  };
}
function chooseAfter(L, i, rng) {
  const T = totals(L);
  const big = T.star >= 3 || T.mvp || T.rings >= 2;
  let t = '';
  if (i === 0) t = L.rt.iq >= 72 && rng() < 0.6 ? (rng() < 0.4 ? 'You became a head coach and won a title from the sideline.' : 'You became a head coach.') : 'You became an assistant coach. The players swear by you.';
  else if (i === 1) t = L.m.fame >= 55 || big ? 'You became the voice of a national broadcast.' : 'You called games for your old club on local TV. Every night.';
  else if (i === 2) t = rng() < 0.45 + (L.rt.iq - 60) * 0.01 ? 'You became a general manager and built a contender.' : 'You ran scouting for a decade. Two of your picks made All-Star teams.';
  else if (i === 3) t = L.cash >= 20 && rng() < 0.5 ? 'You bought a piece of an NBA team.' : L.cash >= 3 ? 'You built a business. Restaurants first, then real estate.' : 'You opened a gym in your hometown.';
  else t = 'You went home. Now you coach your kids.';
  return t;
}

function buzzer(L, r, p) {
  if (ok(r, p + clutchBonus(L))) {
    if (L.season && L.season.l > 0) { L.season.w++; L.season.l--; }
    bump(L, { fame: 5, morale: 8, trust: 3 });
    L.flags.winners = (L.flags.winners || 0) + 1;
    clutchHit(L);
    return 'Splash. Ballgame. You\'re leading every highlight show tonight.';
  }
  bump(L, { morale: -4 });
  return 'Back iron. You\'ll see that one in your sleep.';
}
/* A trade forced by a card, mid-season or in a summer. On a story career the
   club that takes you is one with a use for you: a hole at your position
   counts as much as how good they are, and a real man goes back the other
   way, because nobody in this league is traded for nothing. */
function tradeNow(L, rng, contender) {
  const pool = CLUBS.filter((x) => x !== L.team);
  const to = storyOn(L) && rostOf(L)
    ? weighted(rng, pool, (x) => (contender ? Math.max(0.2, clubNet(L, x) + 4) : 1) * (0.5 + needAt(L, x, L.pos)))
    : weighted(rng, pool, (x) => contender ? Math.max(0.2, clubNet(L, x) + 4) : 1);
  tradeTo(L, to, rng);
}
function tradeTo(L, to, rng) {
  const from = L.team;
  if (!to || to === from) return;
  joinTeam(L, to, true);
  if (storyOn(L) && from) { const b = swapBack(L, from, to, rng); if (b && TRADED) TRADED.back = b.n; }
  const s = L.season;
  if (s && s.g > 0 && s.g < GAMES) {
    /* The record follows the club, not the man: the new club's games so far. */
    const p = gameP(clubNet(L, to), true) - 0.03;
    s.w = clamp(Math.round(s.g * p + norm(rng) * 2), 0, s.g);
    s.l = s.g - s.w;
    s.team = to;
  }
}

// ─── the bench: your coach, your role and your minutes (story careers) ──────

/* EVERY COACH HAS A WAY OF DOING THINGS, seeded off his name so the same real
   coach is the same man in every career. It changes what he will hear in his
   office and what earns minutes in his rotation. */
const COACH_STYLES = {
  players: { name: "A players' coach", line: 'He talks things out. His door\'s always open.', ask: 0.1, cut: 0.7, young: 0, def: 0, fit: 0 },
  defense: { name: 'Defense first', line: 'You earn minutes on the defensive end.', ask: -0.05, cut: 1, young: 0, def: 1, fit: 0 },
  vets: { name: 'Trusts veterans', line: 'He trusts guys who\'ve shown up for years.', ask: 0, cut: 1, young: -0.12, def: 0, fit: 0 },
  youth: { name: 'Plays the kids', line: 'Young legs get his minutes.', ask: 0, cut: 1, young: 0.12, def: 0, fit: 0 },
  system: { name: 'A system coach', line: 'Everybody has a spot. Fit the system, you play.', ask: -0.05, cut: 1, young: 0, def: 0, fit: 0.15 },
};
const STYLE_KEYS = Object.keys(COACH_STYLES);
const styleKey = (L) => STYLE_KEYS[E.hashSeed('style:' + myCoach(L)) % STYLE_KEYS.length];
const coachStyle = (L) => COACH_STYLES[styleKey(L)];
/* What a coach sees: what you have done against what a man your size and
   skill should do in the minutes you have played. One is par. A coach who
   lives on defense counts your defense too. */
function perfOf(L) {
  const s = L.season;
  if (!s || s.gp < 6 || !s.tot.min) return 1;
  const role = roleOf(L), min = s.tot.min / s.gp;
  const m = lineMeans(L, min, usageOf(L, role));
  const pg = perGame(s);
  const want = m.pts + 0.5 * m.reb + 0.7 * m.ast;
  const got = pg.pts + 0.5 * pg.reb + 0.7 * pg.ast;
  /* The box score runs about four percent over the means it is drawn from
     (rounding, and no negative games), so par is centred on what the sim
     actually hands a man rather than on the formula. Over 1,100 stretches
     the middle eighty percent of players land between 0.95 and 1.15 of it. */
  let r = want > 0 ? got / want - 0.04 : 1;
  if (coachStyle(L).def) r += (L.rt.def - 62) / 120;
  return clamp(r, 0.4, 1.8);
}
const tsOf = (s) => { const t = s.tot; const d = 2 * (t.fga + 0.44 * t.fta); return d > 0 ? Math.round(t.pts / d * 1000) / 10 : 0; };
/* Where you could also play: the spot next to yours where the club is thin
   and your ratings travel. */
function otherSpot(L) {
  let best = null;
  for (const p of NEXT_POS[L.pos] || []) {
    const lose = ovrOf(L) - overall(L.rt, p);
    if (lose > 3) continue;
    const v = needAt(L, L.team, p) - needAt(L, L.team, L.pos) - lose * 0.03;
    if (!best || v > best.v) best = { p, v };
  }
  return best && best.v > 0.05 ? best.p : null;
}
/* The rating a coach tells you to work on: what your position asks for most
   that you have least of. */
function weakSpot(L) {
  const w = WEIGHTS[L.pos];
  return RATINGS.slice().sort((a, b) => (w[b] * (90 - L.rt[b])) - (w[a] * (90 - L.rt[a])))[0];
}
/* THE CONVERSATION. Not "ask for more" and a coin: the options are the ones
   your situation has, and each one tells you roughly what it will take. */
function coachTalkCard(L) {
  const s = L.season, role = roleOf(L), st = coachStyle(L), perf = perfOf(L);
  const pg = s && s.gp ? perGame(s) : null;
  const opener = pg
    ? 'You\'re at ' + pg.min + ' minutes and ' + pg.pts + ' points on ' + tsOf(s) + ' percent true shooting. The ' + nick(L.team) + ' are ' + s.w + '-' + s.l + '.'
    : 'Camp opens Tuesday. He\'s got you down for ' + Math.round(role.min) + ' minutes a night.';
  const read = perf >= 1.07 ? 'He likes what he\'s seeing.' : perf <= 0.95 ? 'He\'s seen the tape.' : 'He thinks you\'re about where you should be.';
  const opts = [];
  const odds = (p) => p >= 0.6 ? 'Good odds.' : p >= 0.4 ? 'Coin flip.' : p >= 0.2 ? 'Long shot.' : 'Not likely.';
  const pMore = coachP(L, 'more');
  if (role.min < 36) opts.push({ k: 'more', label: 'Ask for more minutes', hint: odds(pMore) + ' He\'ll go by the tape.' });
  if (!role.starter && role.min >= 12) opts.push({ k: 'start', label: 'Ask to start', hint: odds(coachP(L, 'start')) + ' Somebody loses his job.' });
  const spot = otherSpot(L);
  if (spot) opts.push({ k: 'pos', to: spot, label: 'Offer to play ' + POS_NAME[spot].toLowerCase(), hint: odds(coachP(L, 'pos')) + ' The ' + nick(L.team) + ' are thin there.' });
  if (role.starter && role.min >= 28) opts.push({ k: 'ball', label: 'Ask for the ball late', hint: odds(coachP(L, 'ball')) + ' More shots, more heat.' });
  if (role.starter && s && s.g && s.w < s.l) opts.push({ k: 'bench', label: 'Offer to come off the bench', hint: 'Team first. He won\'t forget.' });
  opts.push({ k: 'focus', label: 'Ask what to work on', hint: 'Free advice. He\'ll tell you straight.' });
  return {
    id: 'coach_talk', kind: 'event', key: 'coach_talk:' + L.year + ':' + (s ? s.g : 0), scene: 'Coach\'s office', eyebrow: st.name + ' · ' + myCoach(L),
    title: myCoach(L) + ' has ten minutes for you.', text: opener + ' ' + read + ' ' + st.line,
    ctx: { ks: opts.slice(0, 4).map((o) => o.k), to: spot },
    options: opts.slice(0, 4).map((o) => ({ label: o.label, hint: o.hint })),
  };
}
function coachP(L, k) {
  const role = roleOf(L), st = coachStyle(L), perf = perfOf(L);
  const ageAdj = L.age <= 24 ? st.young : L.age >= 30 ? -st.young : 0;
  const base = 0.2 + (L.m.trust - 50) * 0.008 + clamp(role.diff, -12, 12) * 0.012 + (perf - 1) * 0.9 + st.ask + ageAdj;
  if (k === 'more') return clamp(base + 0.1, 0.05, 0.88);
  if (k === 'start') return clamp(base - 0.08, 0.04, 0.8);
  if (k === 'pos') return clamp(0.35 + st.fit + needAt(L, L.team, (otherSpot(L) || L.pos)) * 0.4 + (L.m.trust - 50) * 0.005, 0.1, 0.9);
  if (k === 'ball') return clamp(base + (L.m.fame - 40) * 0.005, 0.05, 0.85);
  return 1;
}
function chooseCoachTalk(L, card, i, rng) {
  const k = card.ctx.ks[i], st = coachStyle(L), coach = myCoach(L);
  const p = coachP(L, k);
  const yes = rng() < p;
  L.flags.talks = (L.flags.talks || 0) + 1;
  if (k === 'focus') {
    const r = weakSpot(L);
    L.focus = { k: r, y: L.year };
    bump(L, { trust: 3 });
    return coach + ' doesn\'t hesitate: ' + RATING_NAME[r].toLowerCase() + '. Fix it and the minutes follow. That\'s your summer.';
  }
  if (k === 'bench') {
    bump(L, { min: -4, trust: 10, morale: -2, win: 0.4 });
    relate(L, 'tvet', 6, 'You gave up your starting spot.');
    remember(L, 'role.sacrifice', true);
    return coach + ' stares a second, then shakes your hand. You run the second unit. Everybody\'s better.';
  }
  if (k === 'more') {
    if (yes) { bump(L, { min: 4, trust: 2 }); return coach + ' gives you four more minutes a night. Now keep them.'; }
    bump(L, { trust: -4 * st.cut, morale: -2 });
    return 'He wants to see more first. It\'s a short meeting.';
  }
  if (k === 'start') {
    if (yes) { bump(L, { min: 8, trust: 2 }); remember(L, 'role.won', L.year); return coach + ' puts you with the first five Monday. You don\'t give it back.'; }
    bump(L, { trust: -5 * st.cut, morale: -3 });
    return 'Not yet. He shows you what the starter does that you don\'t. He\'s not wrong.';
  }
  if (k === 'pos') {
    const to = card.ctx.to;
    if (yes && to) { const was = L.pos; L.arch = archForPos(L, to); L.pos = to; bump(L, { min: 3, trust: 4 }); logIt(L, 'Moved from ' + POS_NAME[was].toLowerCase() + ' to ' + POS_NAME[to].toLowerCase() + '.', 'good'); return coach + ' draws it up on the whiteboard. You\'re a ' + POS_NAME[to].toLowerCase() + ' now, with minutes waiting.'; }
    bump(L, { trust: -2 });
    return 'He needs you right where you are. He means it as a compliment.';
  }
  if (k === 'ball') {
    if (yes) { bump(L, { usage: 0.025, trust: 2, fame: 2 }); remember(L, 'role.closer', L.year); return 'The last play of every close game is yours now. ' + coach + ' wants it made.'; }
    bump(L, { trust: -5 * st.cut });
    return 'He rides the hot hand. Lately, he points out, that isn\'t you.';
  }
  return '';
}
/* THE ROLE IS EARNED IN SEASON. After the first stretch and again at the
   break a coach looks at what you have done. Outplay your minutes and you get
   more of them; play under them for long enough and you lose some, and he
   tells you so to your face. It is the same par perfOf reads, so a hot start
   earns a role and a cold one costs one, the way it does in the league. */
function roleReview(L, beats, when) {
  if (!storyOn(L) || L.stage !== 'nba' || !L.team || !L.season || L.season.gp < 12) return;
  const s = L.season, role = roleOf(L), perf = perfOf(L), st = coachStyle(L);
  const rng = rngAt(L, 'review:' + when);
  const coach = myCoach(L);
  /* A two-way deal is converted once you belong in the rotation, or once you
     outplay the minutes it gives you. Until then nothing else here applies. */
  if (L.contract && L.contract.tw) {
    if ((role.diff >= -4 || perf >= 1.1) && rng() < 0.55) {
      delete L.contract.tw;
      L.contract.years = Math.max(L.contract.years, 2); L.contract.total = Math.max(L.contract.total, 2);
      bump(L, { trust: 4, morale: 6 });
      const t = say(L, '{gm}') + ' converts your two-way deal. A standard contract. No more G League.';
      beats.push({ kind: 'role', text: t, tone: 'good' });
      logIt(L, t, 'good');
    }
    return;
  }
  if (perf >= 1.09 && role.min < 34 && rng() < 0.6) {
    const up = role.starter ? 2 : role.min >= 19 ? Math.max(3, 25 - role.min) : 4;
    bump(L, { min: up, trust: 3 });
    const now = roleOf(L);
    const t = role.starter ? coach + ' gives you more of the fourth quarter.'
      : now.starter ? coach + ' moves you into the starting five.' : coach + ' gives you a real spot in the rotation.';
    beats.push({ kind: 'role', text: t, tone: 'good' });
    logIt(L, t, 'good');
    return;
  }
  if (perf <= 0.96 && role.min >= 18 && rng() < 0.6 * st.cut) {
    bump(L, { min: -4, morale: -3 });
    const t = coach + ' cuts your minutes.';
    beats.push({ kind: 'role', text: t, tone: 'bad' });
    logIt(L, t, 'bad');
    if (rng() < 0.6) L.pending.push({
      id: 'coach_review', kind: 'event', key: 'coach_review:' + L.year + ':' + when, scene: 'After practice', eyebrow: 'After practice · ' + coach,
      title: 'Why\'d you cut my minutes?', text: coach + ' doesn\'t sugarcoat it. ' + perGame(s).pts + ' points on ' + tsOf(s) + ' percent won\'t cut it. He wants the minutes earned.',
      options: [
        { label: 'Take it and go to work', hint: 'Play your way back' },
        { label: 'Ask what he needs to see', hint: 'Make it a project' },
        { label: 'Go over his head to {gm}', hint: 'Stars win this. Role players don\'t.' },
        { label: 'Vent to the reporters', hint: 'Feels great for a day' },
      ],
    });
  }
}
function chooseCoachReview(L, i, rng) {
  if (i === 0) { bump(L, { trust: 5, eth: 3 }); return 'Extra film, extra shots. He catches you in the gym at seven a.m.'; }
  if (i === 1) { const r = weakSpot(L); L.focus = { k: r, y: L.year }; bump(L, { trust: 4 }); return 'He names it: ' + RATING_NAME[r].toLowerCase() + '. He pulls up the clips. That\'s your project now.'; }
  if (i === 2) {
    if (rng() < clamp(0.1 + (L.m.fame - 40) * 0.01, 0.05, 0.75)) { bump(L, { min: 4, trust: -8 }); relate(L, 'gm', 4); return '{gm} makes a call. Your minutes are back. ' + myCoach(L) + ' won\'t look at you.'; }
    bump(L, { trust: -12, morale: -3 }); relate(L, 'gm', -8, 'You went over the coach to him.');
    return '{gm} sends you back to ' + myCoach(L) + ', who already knows you went upstairs.';
  }
  bump(L, { fame: 3, morale: 2, trust: -9 });
  relate(L, 'beat', 4);
  return 'It leads the late show. It\'s the first thing at practice, too.';
}
/* YOUR SPOT IN THE ROTATION IS A POSITION. Two men cannot both start at
   point guard, so if the man ahead of you at your spot is better and there
   is no room next to it, you come off the bench whatever your overall says,
   and if the five is better with you in it, you start. bestFive is the same
   rule the rotation screen draws. */
/* roleOf is asked on every card (the receipt shows minutes), so whether you
   are in the five is remembered until something it reads changes. Kept off
   the save: it is a cache, not a fact about the career. */
const FIVE_CACHE = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
function inFive(L) {
  /* The key is everything the answer reads, exactly: a rounded overall let a
     cached answer outlive a change a reload would have seen, which a real
     rating carried to one decimal made happen. */
  const key = [L.year, L.team, L.pos, effOvr(L).toFixed(4), L.league.rostY, L.season && L.season.deadline ? 1 : 0, L.league.rost && L.league.rost[L.team] ? L.league.rost[L.team].map((e) => e.n).join(',') : 0].join(':');
  const hit = FIVE_CACHE && FIVE_CACHE.get(L);
  if (hit && hit.key === key) return hit.v;
  const mates = matesOf(L, L.team).slice(0, 13);
  const lines = L.league.lines || {};
  const epOf = (m) => { const ln = lines[m.n]; return ln && ln[5] ? String(ln[5]).split(';') : null; };
  const me = { v: Math.max(0.1, effOvr(L) - 55), pos: L.pos, ep: null, me: 1 };
  const five = bestFive([me].concat(mates.map((m) => ({ v: Math.max(0.1, m.ovr - 55), pos: m.pos, ep: epOf(m) }))));
  const v = !!(five && five.slots.indexOf(0) >= 0);
  if (FIVE_CACHE) FIVE_CACHE.set(L, { key, v });
  return v;
}
function depthCheck(L, min, diff) {
  if (!storyOn(L) || L.stage !== 'nba' || !L.team || !rostOf(L)) return min;
  const starts = inFive(L);
  if (starts && min < 24) return Math.min(min + 2, 26);
  if (!starts && min >= 24) return Math.max(19, Math.min(min, 23.5) - (diff < 6 ? 2 : 0));
  return min;
}

// ─── the trade deadline (story careers) ─────────────────────────────────────

/* THE DEADLINE IS A REAL DAY. Every February the league's contenders buy and
   its losing clubs sell, and real men change clubs: a veteran on a bad team
   goes to a good one for a young piece and a pick. Your club is one of them.
   It buys, sells or stands pat by its record, and if your name is on the
   phone, {gm} calls you before it is done.

   It happens at the All-Star break, after game 55, which is where the old
   trade_rumor card already sat. The record follows the club, as it always
   has. */

/* What a man of this overall is worth, in the win shares the rosters keep. */
const youW = (L) => Math.max(0.3, (effOvr(L) - 58) * 0.42);
/* How badly club c needs a man at pos: one when nobody there can play, about
   nought when an All-Star has the spot. */
function needAt(L, c, pos) {
  const mates = matesOf(L, c);
  let best = 0;
  for (const m of mates) {
    const f = m.pos === pos ? 1 : (NEXT_POS[pos] || []).indexOf(m.pos) >= 0 ? 0.6 : 0;
    best = Math.max(best, m.w * f);
  }
  return clamp(1 - best / 8, 0, 1);
}
/* How a club is doing: your own record when it is yours, otherwise its net. */
function winPct(L, c) {
  const s = L.season;
  if (c === L.team && s && s.g) return s.w / s.g;
  return clamp(0.5 + clubNet(L, c) * 0.03, 0.15, 0.85);
}
const recText = (L, c) => {
  const s = L.season, g = s && s.g ? s.g : 55;
  const w = c === L.team && s && s.g ? s.w : Math.round(g * winPct(L, c));
  return w + '-' + (g - w);
};
/* A real man moves from one club to another. Returns him. */
function moveMan(R, from, e, to) {
  const i = R[from].indexOf(e);
  if (i < 0) return null;
  R[from].splice(i, 1);
  R[to].push(e);
  return e;
}
/* When you are traded, somebody comes back: the man on the club taking you
   whose worth is nearest yours, from anywhere but the top of their roster. */
function swapBack(L, from, to, rng) {
  const R = rostNow(L);
  if (!R || !R[to] || !R[to].length) return null;
  const Y = L.year, mine = youW(L);
  const keep = R[to].slice().sort((a, b) => rostCurW(b, Y) - rostCurW(a, Y))[0];
  let best = null, d = 1e9;
  for (const e of R[to]) {
    if (e === keep && R[to].length > 1) continue;
    const x = Math.abs(rostCurW(e, Y) - mine * 0.8) + rng() * 0.3;
    if (x < d) { d = x; best = e; }
  }
  if (!best) return null;
  moveMan(R, to, best, from);
  const t = L.name + ' is traded to the ' + nick(to) + '. ' + best.n + ' goes to the ' + nick(from) + '.';
  feed(L, 'move', t);
  L.season && (L.season.dlBack = best.n);
  return best;
}
/* WHO IS ON THE MARKET. A deadline deal is a veteran role player, not a
   franchise: a club does not sell its best man in February, and nobody worth
   more than an All-Star's season changes clubs at the deadline. The first
   cut of this sent two of the league's five best young stars to new clubs in
   two Februaries out of five, which is a league nobody would recognize. */
function forSale(R, c, Y, moved) {
  const best = R[c].slice().sort((a, b) => rostCurW(b, Y) - rostCurW(a, Y))[0];
  return R[c].filter((e) => e !== best && !(moved && moved.has(e)) && Y - e.b >= 27 && rostCurW(e, Y) >= 2 && rostCurW(e, Y) <= 7)
    .sort((a, b) => rostCurW(b, Y) - rostCurW(a, Y));
}
/* The league's own deadline: sellers send a veteran to a buyer for youth. */
function deadlineLeague(L, beats, rng) {
  const R = rostNow(L);
  if (!R) return;
  const Y = L.year;
  const ranked = CLUBS.slice().sort((a, b) => winPct(L, b) - winPct(L, a));
  const buyers = ranked.slice(0, 9).filter((c) => c !== L.team);
  const sellers = ranked.slice(-11).filter((c) => c !== L.team);
  const moved = new Set(), news = [];
  const n = 2 + Math.floor(rng() * 3);
  for (let k = 0; k < n && buyers.length && sellers.length; k++) {
    const sc = pick(rng, sellers), bc = pick(rng, buyers);
    const vet = pick(rng, forSale(R, sc, Y, moved).slice(0, 3));
    if (!vet) continue;
    const vw = rostCurW(vet, Y);
    const back = R[bc].filter((e) => !moved.has(e) && Y - e.b <= 26 && rostCurW(e, Y) <= vw * 0.75)
      .sort((a, b) => rostCurW(b, Y) - rostCurW(a, Y))[0]
      || R[bc].filter((e) => !moved.has(e)).sort((a, b) => rostCurW(a, Y) - rostCurW(b, Y))[0];
    if (!back) continue;
    moveMan(R, sc, vet, bc); moveMan(R, bc, back, sc);
    moved.add(vet); moved.add(back);
    const gain = clamp((vw - rostCurW(back, Y)) * 0.1, 0, 0.6);
    L.league.net[bc] = round1(clubNet(L, bc) + gain);
    L.league.net[sc] = round1(clubNet(L, sc) - gain * 0.5);
    news.push({ w: vw, t: 'Deadline: ' + vet.n + ' to the ' + nick(bc) + ', ' + back.n + ' to the ' + nick(sc) + '.' });
  }
  news.sort((a, b) => b.w - a.w);
  news.forEach((x, i) => { feed(L, 'move', x.t); if (i < 2) beats.push({ kind: 'news', text: x.t, tone: '' }); });
}
/* Your club at the deadline: a contender adds a veteran where it is thin, a
   losing club sells its best one. Either way it is a man you know by name. */
function deadlineClub(L, beats, rng) {
  const R = rostNow(L), s = L.season;
  if (!R || !s) return null;
  const Y = L.year, c = L.team, pct = winPct(L, c), net = clubNet(L, c);
  const mode = (pct >= 0.6 || (pct >= 0.54 && net >= 2)) ? 'buy' : pct <= 0.42 ? 'sell' : 'hold';
  s.deadline = { mode };
  /* A buyer's gain is somebody's loss, and the other contenders buy too
     (deadlineLeague), so your club is no likelier to land a man than they
     are and gains no more than he is worth. */
  if (mode === 'buy' && rng() < 0.35) {
    const pos = R_POS.slice().sort((a, b) => needAt(L, c, b) - needAt(L, c, a))[0];
    const from = CLUBS.filter((x) => x !== c).sort((a, b) => winPct(L, a) - winPct(L, b)).slice(0, 10);
    let get = null, src = null;
    for (const x of from) for (const e of forSale(R, x, Y)) {
      const v = rostCurW(e, Y) * (e.pos === pos ? 1.4 : 1) + rng() * 0.5;
      if (!get || v > get.v) { get = { e, v }; src = x; }
    }
    if (!get) return mode;
    const back = R[c].filter((e) => Y - e.b <= 25).sort((a, b) => rostCurW(a, Y) - rostCurW(b, Y))[0]
      || R[c].slice().sort((a, b) => rostCurW(a, Y) - rostCurW(b, Y))[0];
    moveMan(R, src, get.e, c);
    if (back) moveMan(R, c, back, src);
    const gain = clamp((rostCurW(get.e, Y) - (back ? rostCurW(back, Y) : 0)) * 0.1, 0.1, 0.6);
    L.league.net[c] = round1(net + gain);
    L.league.net[src] = round1(clubNet(L, src) - gain * 0.5);
    s.deadline.got = get.e.n;
    const t = 'Deadline: the ' + nick(c) + ' get ' + get.e.n + ' from the ' + nick(src) + (back ? ' for ' + back.n : '') + '.';
    feed(L, 'move', t); logIt(L, t, 'good');
    beats.push({ kind: 'club_trade', text: t, tone: 'good' });
    if (get.e.pos === L.pos && rostCurW(get.e, Y) > youW(L)) {
      bump(L, { min: -3, morale: -2 });
      beats.push({ kind: 'role', text: 'He plays your position, and plays it well. Your minutes take a hit.', tone: 'bad' });
    } else bump(L, { morale: 3 });
  } else if (mode === 'sell' && rng() < 0.55) {
    const vet = forSale(R, c, Y)[0];
    if (!vet) return mode;
    const to = CLUBS.filter((x) => x !== c).sort((a, b) => winPct(L, b) - winPct(L, a))[Math.floor(rng() * 6)];
    const back = R[to].filter((e) => Y - e.b <= 25).sort((a, b) => rostCurW(a, Y) - rostCurW(b, Y))[0];
    moveMan(R, c, vet, to);
    if (back) moveMan(R, to, back, c);
    L.league.net[c] = round1(net - clamp(rostCurW(vet, Y) * 0.08, 0.2, 1));
    s.deadline.lost = vet.n;
    const t = 'Deadline: the ' + nick(c) + ' send ' + vet.n + ' to the ' + nick(to) + (back ? ' for ' + back.n : '') + '.';
    feed(L, 'move', t); logIt(L, t, '');
    beats.push({ kind: 'club_trade', text: t, tone: '' });
    if (vet.pos === L.pos || (NEXT_POS[L.pos] || []).indexOf(vet.pos) >= 0) {
      bump(L, { min: 3 });
      beats.push({ kind: 'role', text: 'His minutes are yours now.', tone: 'good' });
    }
  }
  return mode;
}
/* The clubs that would take you: a contender with a hole at your position,
   and a club where you would start. */
function deadlineDests(L, rng) {
  const c = L.team, pos = L.pos;
  const others = CLUBS.filter((x) => x !== c);
  /* The best three clubs in the league are not calling: they have no room
     under the tax and no hole at your spot. A contender here is a good club
     a piece away. */
  const ranked = others.slice().sort((a, b) => winPct(L, b) - winPct(L, a));
  const band = ranked.slice(3, 14);
  const contend = band.slice().sort((a, b) => (needAt(L, b, pos) + rng() * 0.3) - (needAt(L, a, pos) + rng() * 0.3))[0];
  const start = others.filter((x) => x !== contend).sort((a, b) => (needAt(L, b, pos) + rng() * 0.15) - (needAt(L, a, pos) + rng() * 0.15))[0];
  return [contend, start];
}
function roleThere(L, c) {
  const diff = effOvr(L) - rotationBar(clubNet(L, c));
  const need = needAt(L, c, L.pos);
  return diff >= 10 ? 'You\'d be the man' : (diff >= 0 || need >= 0.6) ? 'You\'d start' : diff >= -6 ? 'You\'d be in the rotation' : 'You\'d ride the bench';
}
function deadlineCard(L, why, dests) {
  const s = L.season, c = L.team;
  const [a, b] = dests;
  const lead = why === 'ask' ? 'You asked out. {gm} says he\'s got two real offers.'
    : why === 'sell' ? 'The ' + nick(c) + ' are ' + recText(L, c) + '. {gm} is selling, and you\'re the one they want.'
      : 'Your minutes dried up. {gm} thinks a fresh start helps everybody.';
  return {
    id: 'deadline', kind: 'event', key: 'deadline:' + L.year, scene: 'Deadline day', eyebrow: 'Trade deadline · 3pm Eastern',
    title: why === 'ask' ? 'You asked out. Where to?' : '{gm} is taking calls on you.',
    text: lead + ' The ' + nick(a) + ' and the ' + nick(b) + ' are both on the line.',
    ctx: { why, dests: [a, b], from: c },
    options: [
      { label: 'Push for the ' + nick(a), hint: recText(L, a) + '. ' + roleThere(L, a) + '.' },
      { label: 'Push for the ' + nick(b), hint: recText(L, b) + '. ' + roleThere(L, b) + '.' },
      { label: 'Tell {gm} you want to stay', hint: why === 'ask' ? 'Take the request back' : 'Loyalty, maybe not enough' },
      { label: 'Let {agent} handle it', hint: 'Best fit, his call' },
    ],
  };
}
/* Seasons in a row with the club you are on now. */
function tenure(L) {
  let n = 0;
  for (let i = L.history.length - 1; i >= 0 && L.history[i].t === L.team; i--) n++;
  return n;
}
function tradeDeadline(L, beats) {
  if (!storyOn(L) || L.stage !== 'nba' || !L.team || !L.season || !rostOf(L)) return;
  const rng = rngAt(L, 'deadline');
  deadlineLeague(L, beats, rng);
  const mode = deadlineClub(L, beats, rng);
  const s = L.season, o = ovrOf(L), role = roleOf(L);
  const c = L.contract;
  let why = null;
  if (L.flags.tradeAsk) why = 'ask';
  else if (mode === 'sell' && L.age >= 27 && o >= 68 && c && c.kind !== 'rookie' && rng() < 0.45) why = 'sell';
  else if (role.min < 16 && L.age >= 23 && s.g > 0 && rng() < 0.3) why = 'minutes';
  if (!why) { if (mode !== 'hold') beats.push({ kind: 'news', text: 'The deadline passes. You are still a ' + nick(L.team).replace(/s$/, '') + '.', tone: '' }); return; }
  L.pending.push(deadlineCard(L, why, deadlineDests(L, rng)));
}
function chooseDeadline(L, card, i, rng) {
  const { why, dests } = card.ctx;
  const fame = L.m.fame, gmRel = relOf(L, 'gm');
  /* Names first: once the trade is made, {gm} is somebody else's. */
  const gm = say(L, '{gm}');
  const swing = (fame - 40) * 0.004 + gmRel / 250;
  const go = (to, t) => { const from = L.team; tradeTo(L, to, rng); L.flags.tradeAsk = false; remember(L, 'deadline.traded', from); return t; };
  if (i === 0 || i === 1) {
    const want = dests[i], other = dests[1 - i];
    const p = clamp((why === 'ask' ? 0.55 : why === 'sell' ? 0.5 : 0.45) + swing, 0.15, 0.85);
    if (rng() < p) { bump(L, { morale: 6 }); relate(L, 'gm', 6, 'He got you where you wanted to go.', gm); return go(want, 'Done. ' + gm + ' closes it with the ' + nick(want) + '. You fly out tonight.'); }
    if (rng() < 0.5) { bump(L, { morale: -3 }); return go(other, 'The ' + nick(want) + ' wouldn\'t pay. You\'re a ' + nick(other).replace(/s$/, '') + ' now.'); }
    bump(L, { trust: -6, morale: -4 }); relate(L, 'gm', -8, 'You pushed to leave at the deadline.');
    L.flags.tradeAsk = why === 'ask';
    return 'Three o\'clock comes and goes. You\'re still here, and everybody knows you wanted out.';
  }
  if (i === 2) {
    if (why === 'ask') { L.flags.tradeAsk = false; bump(L, { trust: 8, morale: 2 }); relate(L, 'gm', 8, 'You took your trade request back.'); return gm + ' pulls you off the market. The locker room notices.'; }
    const p = clamp(0.45 + L.m.trust * 0.004 + Math.min(tenure(L), 6) * 0.04 + swing, 0.15, 0.9);
    if (rng() < p) { bump(L, { trust: 6, morale: 4 }); relate(L, 'gm', 8, 'He kept you at the deadline.'); return gm + ' hangs up on both of them. You\'re staying put.'; }
    bump(L, { morale: -6 }); relate(L, 'gm', -6, 'He traded you after you asked to stay.', gm);
    return go(dests[0], gm + ' listens, then trades you anyway. It\'s business. You\'re headed to the ' + nick(dests[0]) + '.');
  }
  const pick2 = needAt(L, dests[0], L.pos) + winPct(L, dests[0]) >= needAt(L, dests[1], L.pos) + winPct(L, dests[1]) ? 0 : 1;
  if (why === 'ask' || rng() < 0.75) { relate(L, 'agent', 4); return go(dests[pick2], '{agent} lands you the better fit: the ' + nick(dests[pick2]) + '.'); }
  return '{agent} calls back at 3:05. Nothing got done. You stay put.';
}

/* The year's training card, which is the one card every summer deals. */
function trainingCard(L) {
  if (storyOn(L)) return summerCard(L);
  return {
    id: 'training', kind: 'event', key: 'training', scene: 'The off-season',
    eyebrow: 'Summer of ' + (L.year - 1), title: 'Where are you spending the summer?',
    text: 'You\'re ' + L.age + '. Overall ' + ovT(L, ovrOf(L)) + '. Health ' + L.m.health + '.',
    options: [
      { label: 'Live in the shooting gym', hint: 'Shooting, plus some IQ' },
      { label: 'Hit the weight room', hint: 'Athleticism, finishing, rebounding' },
      { label: 'Go to point guard school', hint: 'Playmaking, plus some IQ' },
      { label: 'Go to defensive camp', hint: 'Defense, plus some athleticism' },
      { label: 'Rest and recover', hint: 'Health. Slows the decline.' },
    ],
  };
}
/* A summer moves two or three ratings by a point or two. It is a direction,
   not a shortcut: the growth that matters is the age curve in develop(). */
const TRAIN = [
  { sho: 2, iq: 1 }, { ath: 1, fin: 1, reb: 1 }, { pla: 2, iq: 1 }, { def: 2, ath: 1 }, null,
];

/* THE SUMMER, on a story career. The old card asked the same question with
   the same five answers every year, and a fifteen year career read it fifteen
   times. Now the card opens on what last season actually was (a title, a
   first round exit, a new city, a contract year), and offers four programs
   out of sixteen. Some only come to a career they fit: post work for a big,
   national team camp for a star, rehab after a season of missed games.
   A program offered last summer is less likely to come round again.

   Every program is worth about what one of the old five was (three rating
   points before the age and luck scaling), so the balance bands do not move.
   Picking the same program three summers running pays less, and says so. */
const BIGS = { PF: 1, C: 1 };
const SUMMER = {
  shoot: { l: 'Live in the shooting gym', h: 'Shooting, plus some IQ', fx: { sho: 2, iq: 1 },
    s: ['Five hundred makes a day. The form\'s yours now.', 'A shooting coach rebuilds your release. Weird at first, then right.', 'You chart every shot all summer. The numbers climb.'] },
  strength: { l: 'Hit the weight room', h: 'Athleticism, finishing, rebounding', fx: { ath: 1, fin: 1, reb: 1 },
    s: ['Twelve pounds, and every one of them useful.', 'Sled pushes at dawn. Now you finish through contact.', 'A track coach fixes your first step.'] },
  pg: { l: 'Go to point guard school', h: 'Playmaking, plus some IQ', fx: { pla: 2, iq: 1 },
    s: ['Two-hand passes off the dribble until you dream about them.', 'You learn to see the weak side before it opens.', 'Fifty pick and rolls a day. Now you read them all.'] },
  defense: { l: 'Go to defensive camp', h: 'Defense, plus some athleticism', fx: { def: 2, ath: 1 },
    s: ['Slides until your legs shake. Now you stay in front.', 'They teach you to guard without fouling. Mostly.', 'You come back a step quicker and a lot meaner.'] },
  rest: { l: 'Rest and recover', h: 'Health. Slows the decline.', rest: 1,
    s: ['Fully rested. You feel twenty-two again.', 'Two months of sleep and fishing. The knees say thanks.', 'No basketball until August. Your body forgives you.'] },
  post: { l: 'Post work with a retired big', h: 'Finishing, plus some rebounding', fx: { fin: 2, reb: 1 }, when: (L) => !!BIGS[L.pos] || L.pos === 'SF',
    s: ['Drop step, up and under, repeat. He\'s sixty and still beats you.', 'He teaches you to seal early. The paint feels smaller.', 'Old man moves. They work on young men.'] },
  film: { l: 'Live in the film room', h: 'IQ, plus some playmaking', fx: { iq: 2, pla: 1 },
    s: ['Three hundred hours of tape. You see plays before they happen.', 'You learn every coverage in the league by name.', 'Film every morning. The game slows way down.'] },
  boxing: { l: 'Box for your footwork', h: 'Athleticism, defense, finishing', fx: { ath: 1, def: 1, fin: 1 },
    s: ['Your feet were lazy. They aren\'t anymore.', 'An hour of jump rope a day. Your balance is brand new.', 'A real fighter trains you. Basketball feels gentle after that.'] },
  yoga: { l: 'Do yoga and mobility work', h: 'Health, and a body that lasts', fx: { ath: 1 }, m: { health: 8 }, dur: 3, when: (L) => L.age >= 26,
    s: ['Your hips move like they did at twenty.', 'The guys laugh at the mat. Then two of them join.', 'Hot room, five days a week. Nothing hurts in September.'] },
  altitude: { l: 'Train at altitude', h: 'Athleticism and boards. Costs health.', fx: { ath: 2, reb: 1 }, m: { health: -4 }, when: (L) => L.age <= 30,
    s: ['Two months at eight thousand feet. Sea level feels like cheating.', 'You throw up on day three. By week six you fly.', 'Thin air, long runs. Your lungs feel bigger.'] },
  pickup: { l: 'Run pickup with pros', h: 'A little of everything. Fun.', fx: { sho: 1, fin: 1, iq: 1 }, m: { morale: 3 },
    s: ['Invite-only runs in a closed gym. You hold your own.', 'Five games a day. Somebody films one and it\'s everywhere.', 'You steal a move from a guy who never made the league.'] },
  national: { l: 'Go to national team camp', h: 'Defense, shooting, and a spotlight', fx: { def: 1, sho: 1, iq: 1 }, m: { fame: 3 }, when: (L) => ovrOf(L) >= 78,
    s: ['Three weeks with the best in the world. You fit right in.', 'You guard stars every day. It shows.', 'The camp\'s a tryout. You make the cut.'] },
  summer_lg: { l: 'Play Summer League again', h: 'Reps, and the staff notices', fx: { pla: 1, sho: 1, fin: 1 }, m: { trust: 4 }, when: (L) => L.seasonsDone <= 2,
    s: ['Thirty a night in Vegas. The front office sees every game.', 'You run the team. Nobody else touches it late.', 'MVP in an empty gym. It still counts.'] },
  home: { l: 'Train back home', h: 'Good for the soul. Some shooting.', fx: { sho: 1, ath: 1 }, m: { morale: 6 }, who: 'mom',
    s: ['Your old gym, your old hoop. {mom} brings lunch.', 'You run hills behind your high school. Kids watch from the fence.', 'Home cooking and an empty gym. Best summer in years.'] },
  private: { l: 'Hire a private skills coach', h: 'Shooting, playmaking, defense. Pricey.', fx: { sho: 1, pla: 1, def: 1 }, cash: 0.2, when: (L) => L.cash >= 0.6,
    s: ['Expensive. Worth every dollar.', 'He films everything and fixes one thing a day.', 'He\'s worked with three All-Stars. Now he\'s got four.'] },
  rehab: { l: 'Do the rehab right', h: 'Health, and a body that lasts', m: { health: 14 }, dur: 4,
    s: ['Boring work, done right. It feels solid.', 'Pool workouts all July. The leg\'s stronger than before.', 'You do every exercise twice. Dr. {doctor:last} is impressed.'] },
};
const SUMMER_FRAME = {
  first: ['Your first summer as a pro', 'Camp opens in eight weeks. Nobody knows your name yet.'],
  champ: ['A short summer, and a ring', 'You won it in June. Camp\'s in ten weeks. The ring fits.'],
  finals: ['Two wins short', 'The Finals loss is still on every highlight show.'],
  deep: ['A long run, a short summer', 'Your legs are tired. Your name\'s louder.'],
  out: ['Out in the first round', 'Everybody saw the series. Everybody has advice.'],
  missed: ['A long summer', 'No playoffs. The phone\'s been quiet since April.'],
  moved: ['New city, new gym', 'Nobody here has seen you practice yet.'],
  hurt: ['The summer after the injury', 'You missed too many games. Everybody\'s watching the leg.'],
  contract: ['Your contract year starts now', 'Play well and you write the next deal.'],
  old: ['Another summer, and your body has opinions', 'Mornings take longer to get going. The game still feels good.'],
  plain: [['Where are you spending the summer?', 'Camp\'s two months away.'], ['Eight weeks until camp', 'The gym\'s empty in July. You could be in it.'],
    ['It\'s the off-season', 'Everybody else is on a boat. What are you doing?']],
};
function summerFrame(L) {
  const H = L.history, h = H[H.length - 1], c = L.contract;
  if (!h) return SUMMER_FRAME.first;
  if (h.t && L.team && h.t !== L.team) return SUMMER_FRAME.moved;
  if (h.gp < 55) return SUMMER_FRAME.hurt;
  if (h.po === 'Champion') return SUMMER_FRAME.champ;
  if (h.po === 'Finals') return SUMMER_FRAME.finals;
  if (h.po === 'CF') return SUMMER_FRAME.deep;
  if (c && c.years === 1 && c.kind !== 'rookie' && L.age <= 32) return SUMMER_FRAME.contract;
  if (L.age >= 33) return SUMMER_FRAME.old;
  if (h.po === 'R1') return SUMMER_FRAME.out;
  if (h.po === 'Missed' || h.po === 'Play-in') return SUMMER_FRAME.missed;
  return pick(figRng(L, 'sframe:' + L.year), SUMMER_FRAME.plain);
}
function summerKeys(L) {
  const H = L.history, h = H[H.length - 1];
  const r = figRng(L, 'summer:' + L.year);
  const out = [];
  if (h && h.gp < 55) out.push('rehab');
  if (L.m.health < 70 || L.age >= 31) out.push('rest');
  const last = (L.flags.summerOff || []);
  const rest = Object.keys(SUMMER).filter((k) => k !== 'rehab' && out.indexOf(k) < 0 && (!SUMMER[k].when || SUMMER[k].when(L)));
  while (out.length < 4 && rest.length) {
    const k = weighted(r, rest, (x) => (last.indexOf(x) >= 0 ? 0.35 : 1) * (x === 'rest' ? 0.6 : 1));
    out.push(k); rest.splice(rest.indexOf(k), 1);
  }
  return out;
}
function summerCard(L) {
  const ks = summerKeys(L), f = summerFrame(L);
  L.flags.summerOff = ks;
  return {
    id: 'training', kind: 'event', key: 'training', scene: 'The off-season',
    eyebrow: 'Summer of ' + (L.year - 1), title: f[0],
    text: f[1] + ' Overall ' + ovT(L, ovrOf(L)) + '. Health ' + L.m.health + '.',
    ctx: { ks },
    options: ks.map((k) => ({ label: SUMMER[k].l, hint: SUMMER[k].h })),
  };
}
function summerChoose(L, k, rng) {
  const P = SUMMER[k];
  const young = L.age <= 24 ? 1 : L.age <= 28 ? 0.8 : 0.6;
  const runs = L.flags.summerRun && L.flags.summerRun.k === k ? L.flags.summerRun.n + 1 : 1;
  L.flags.summerRun = { k, n: runs };
  const stale = runs >= 3 ? 0.6 : 1;
  const d = {};
  if (P.fx) for (const x in P.fx) d[x] = Math.round(P.fx[x] * young * stale * (0.7 + rng() * 0.6));
  Object.assign(d, P.m || {});
  if (P.dur) d.dur = P.dur;
  if (P.cash) d.cash = -P.cash;
  if (P.rest) { d.health = 18; L.flags.restYears = (L.flags.restYears || 0) + 1; }
  /* One summer in ten, something clicks. */
  const top = P.fx ? Object.keys(P.fx).sort((a, b) => P.fx[b] - P.fx[a])[0] : null;
  const click = top && runs < 3 && rng() < 0.1;
  if (click) d[top] = (d[top] || 0) + 1;
  bump(L, d);
  if (P.who) relate(L, P.who, 6, 'You spent a summer at home.');
  if (storyOn(L)) remember(L, 'summer.' + k, true);
  let t = pick(rng, P.s);
  if (runs >= 3) t = 'Same summer, third year running. Your body knows the drills. It learns less.';
  else if (click) t += ' Then something clicks in July.';
  return t;
}

// ─── the event schema ───────────────────────────────────────────────────────

/* AN EVENT IS DATA (NARRATIVE.md section 2). defineEvents() reads each entry
   once and fills in every field the picker asks about, so an event written
   with three fields and one written with twelve are read by the same code:

     phases    the slots it can be dealt in ('early', 'off', 'hs', 'col_pre')
     tags      what it is about, for arcs and the media layer
     req       prerequisites as data, read by reqOk(); `when` is the escape
               hatch for a rule that will not fit in a field
     weight    a number (times its rarity) or a function of the career
     rarity    common, uncommon or rare
     once      never again in this career
     cooldown  seasons before it may be dealt again (a story career only)
     cap       the most times in one career (a story career only)

   The version 1 rule is kept for every career: an event is dealt at most once
   a season. Cooldowns and caps are recorded only on a story career, because a
   migrated save has to play exactly as the old engine played it (check-saves). */
const RARITY = { common: 1, uncommon: 0.55, rare: 0.25 };
const EVENT_TAGS = {
  locker: ['vet_mentor', 'rookie_duty', 'teammate_touches', 'teammate_fight', 'mentor_rookie', 'young_star', 'film_session'],
  court: ['hot_streak', 'slump', 'buzzer', 'christmas', 'ref_heat', 'double_team', 'rival_school', 'rivalry_col'],
  coach: ['coach_bench', 'stuck', 'coach_fired', 'coach_son', 'coach_leaves', 'tank', 'load_mgmt'],
  front: ['trade_rumor', 'superteam', 'buyout', 'contract_year', 'hometown_call', 'agent_pitch'],
  money: ['shoe_deal', 'local_ad', 'family_money', 'investment', 'body_care', 'nil_deal', 'booster', 'street_agent', 'charity'],
  media: ['online_beef', 'podcast', 'docuseries', 'rap_album', 'media_day', 'playoff_guarantee', 'mixtape', 'heckler'],
  body: ['injury_tweak', 'rehab_summer', 'body_care', 'load_mgmt', 'freshman_wall', 'growth'],
  heart: ['meet_someone', 'propose', 'wedding', 'baby', 'breakup', 'homecoming', 'roommate'],
  rival: ['rival_trash', 'rival_tv', 'online_beef'],
  school: ['grades', 'class_skip', 'nba_scouts', 'camp_invite', 'prep_transfer', 'investigation', 'summer_league'],
};
function defineEvents(pool, kind) {
  const tagsOf = {};
  for (const t in EVENT_TAGS) for (const id of EVENT_TAGS[t]) (tagsOf[id] = tagsOf[id] || []).push(t);
  for (const id in pool) {
    const ev = pool[id];
    ev.id = id;
    ev.pool = kind;
    ev.tags = ev.tags || tagsOf[id] || [];
    ev.req = ev.req || null;
    ev.cooldown = ev.cooldown || 0;
    ev.cap = ev.cap || 0;
    if (!ev.rarity) {
      const w = typeof ev.weight === 'number' ? ev.weight : 0;
      ev.rarity = w >= 3 ? 'common' : 'uncommon';
    }
    if (!ev.when) ev.when = () => true;
    if (ev.weight == null) ev.weight = 1;
    if (typeof ev.weight === 'number') { const w = ev.weight * RARITY[ev.rarity]; ev.weight = () => w; }
  }
  return pool;
}
/* Prerequisites as data. Every key is optional and all of them must hold. A
   range is [min, max] with either end null. */
const inRange = (v, r) => (r[0] == null || v >= r[0]) && (r[1] == null || v <= r[1]);
const REQ = {
  seasons: (L, r) => inRange(L.seasonsDone, r),
  age: (L, r) => inRange(L.age, r),
  fame: (L, r) => inRange(L.m.fame, r),
  morale: (L, r) => inRange(L.m.morale, r),
  health: (L, r) => inRange(L.m.health, r),
  ovr: (L, r) => inRange(ovrOf(L), r),
  cash: (L, v) => L.cash >= v,
  minutes: (L, r) => !!(L.season && L.season.role) && inRange(L.season.role.min, r),
  starter: (L, v) => !!(L.season && L.season.role && L.season.role.starter) === v,
  team: (L, v) => !!L.team === v,
  contract: (L, r) => !!L.contract && inRange(L.contract.years, r),
  rel: (L, v) => [].concat(v).indexOf(lifeOf(L).rel) >= 0,
  flags: (L, a) => a.every((k) => !!L.flags[k]),
  notFlags: (L, a) => a.every((k) => !L.flags[k]),
  mem: (L, a) => a.every((k) => !!recall(L, k)),
  notMem: (L, a) => a.every((k) => !recall(L, k)),
  traits: (L, a) => a.every((k) => hasTrait(L, k)),
  rival: (L, v) => rivalOn(L) === v,
  story: (L, v) => storyOn(L) === v,
};
function reqOk(L, req) {
  if (!req) return true;
  for (const k in req) { if (!REQ[k]) throw new Error('unknown requirement ' + k); if (!REQ[k](L, req[k])) return false; }
  return true;
}
/* A story career keeps a ledger of what it was dealt and when, which is what
   cooldowns and caps are read off. A migrated save has none and needs none. */
function evSeen(L) { return L.evlog || (L.evlog = {}); }
function evOpen(L, ev) {
  if (!storyOn(L)) return true;
  const h = (L.evlog || {})[ev.id];
  if (!h || !h.length) return true;
  const r = STORY_RECURS[ev.id];
  const cap = ev.cap || (r ? r[1] : 1), cd = ev.cooldown || (r ? r[0] : 0);
  if (h.length >= cap) return false;
  if (cd && L.year - h[h.length - 1] < cd) return false;
  return true;
}
function eligible(L, ev, phase, used, once) {
  const ph = storyOn(L) && STORY_PHASES[ev.id] ? STORY_PHASES[ev.id] : ev.phases;
  if (ph.indexOf(phase) < 0) return false;
  if (used[ev.id]) return false;
  if (ev.legend && (!(L.opt && L.opt.legend) || !legendOpen(L))) return false;
  if (ev.once && once[ev.id]) return false;
  if (!evOpen(L, ev)) return false;
  if (!reqOk(L, ev.req)) return false;
  return !!ev.when(L);
}

/* THE CALENDAR. Every slot an event can be dealt in is a real moment in a
   real year, and the card says which. L.year is the year a season ENDS (2027
   is 2026-27), so camp and December belong to the year before it.
     pre    after the summer, before the opener        September
     early  after game 27                               December
     mid    after game 55, the All-Star break           February
     late   after game 82, before the playoffs          April
     off    after the playoffs                          the summer
   A story career keeps every in-game story out of `late`: by then the
   regular season is over and only the playoffs are left to change. */
const SLOT_MONTH = { pre: 'September', early: 'December', mid: 'February', late: 'April', hs: 'January', col: 'December', col_mar: 'March', col_pre: 'October' };
const SLOT_SUMMER = { off: 1, hs_sum: 1, hs_off: 1, col_off: 1 };
function calendar(L, slot) {
  if (slot === 'post') return 'Years later';
  if (slot === 'predraft') return 'Before the ' + (L.year - 1) + ' draft';
  if (slot === 'dn') return 'Draft night ' + (L.year - 1);
  if (slot === 'alt') return (ALT_NAME[(L.am || {}).route] || 'Away') + ' · January';
  const nba = !isAm(L);
  const y = nba && (slot === 'pre' || slot === 'early') ? L.year - 1 : L.year;
  const when = SLOT_SUMMER[slot] ? 'Summer' : (SLOT_MONTH[slot] || 'This season');
  if (nba) return when + ' ' + y;
  const a = L.am || {};
  const yr = a.level === 'col' ? CYEAR[a.cyear] : GRADE[a.grade];
  return yr ? yr[0].toUpperCase() + yr.slice(1) + ' year · ' + when : when;
}
/* Events that list `late` but are about the regular season, and college
   events that cannot happen in March, are dealt elsewhere on a story career. */
const STORY_PHASES = {
  night_out: ['early', 'mid'], hot_streak: ['early', 'mid'], slump: ['early', 'mid'], film_session: ['early', 'mid'],
  online_beef: ['early', 'mid'], ref_heat: ['early', 'mid'], buzzer: ['early', 'mid'], teammate_touches: ['mid'],
  heckler: ['mid'], tank: ['mid'], rival_tv: ['mid'],
  grades: ['hs', 'col', 'col_mar'], class_skip: ['col', 'col_mar'], nba_scouts: ['col', 'col_mar'], investigation: ['col', 'col_mar'],
  double_team: ['hs', 'col', 'col_mar'], freshman_wall: ['col_mar'], rivalry_col: ['col'],
};
/* ON A STORY CAREER AN EVENT HAPPENS ONCE unless it is written to recur. A
   recurring event waits `cooldown` seasons and stops at `cap`: a slump can
   come back, a cousin can call again, but not every year and not forever. */
const STORY_RECURS = {
  night_out: [2, 3], slump: [2, 3], hot_streak: [2, 3], film_session: [2, 2], buzzer: [2, 3], ref_heat: [3, 2],
  injury_tweak: [2, 3], trade_rumor: [2, 3], stuck: [2, 2], coach_bench: [3, 2], teammate_touches: [3, 2],
  media_day: [3, 3], load_mgmt: [2, 3], charity: [3, 3], family_money: [3, 3], local_ad: [3, 2], investment: [3, 3],
  heckler: [3, 2], online_beef: [3, 2], rival_trash: [3, 2], rival_tv: [3, 2], teammate_fight: [4, 2],
  contract_year: [2, 5], tank: [3, 2], coach_fired: [3, 2], rehab_summer: [2, 4], christmas: [2, 4],
  playoff_guarantee: [3, 2], playoff_eve: [3, 4], exit_interview: [3, 4], olympics: [4, 3], superteam: [4, 2],
  meet_someone: [2, 3], breakup: [3, 2], propose: [2, 2], wedding: [3, 2], baby: [1, 4],
  grades: [1, 3], rival_school: [1, 3], double_team: [1, 2], mixtape: [1, 2], class_skip: [1, 2], nba_scouts: [1, 3],
  rivalry_col: [1, 3], summer_league: [1, 2], camp_invite: [1, 2], nil_deal: [1, 4],
};
const recurs = (id) => !!STORY_RECURS[id];
let AM_ALL = null, NBA_ALL = null;
const SUMMERY = { off: 1, pre: 1, hs_sum: 1, hs_off: 1, col_pre: 1, col_off: 1 };
function dealCard(L, phase, ev) {
  if (ev.queue) ev.queue(L);
  const card = {
    id: ev.id, kind: 'event', key: phase + ':' + ev.id,
    eyebrow: storyOn(L) ? calendar(L, phase) : SUMMERY[phase] ? 'The summer' : 'This season',
    title: typeof ev.title === 'function' ? ev.title(L) : ev.title, text: ev.text(L),
    options: ev.options.map((o) => ({ label: o.label })),
  };
  if (storyOn(L) && ev.cb) { const c = callback(L, ev.cb); if (c) card.text = c + ' ' + card.text; }
  L.pending.push(card);
}
function queueEvents(L, phase, n, pool) {
  pool = pool || EVENTS;
  /* A story career draws from the Phase D catalog as well. */
  if (storyOn(L)) pool = pool === AM_EVENTS ? (AM_ALL || (AM_ALL = Object.assign({}, AM_EVENTS, STORY_AM)))
    : pool === EVENTS ? (NBA_ALL || (NBA_ALL = Object.assign({}, EVENTS, STORY_NBA))) : pool;
  if (!L.flags.offUsed || L.flags.offUsed.y !== L.year) L.flags.offUsed = { y: L.year };
  const used = L.season ? L.season.used : L.flags.offUsed;
  const once = L.flags.once = L.flags.once || {};
  const rng = rngAt(L, 'ev:' + phase + ':' + L.pending.length);
  /* An arc that is due is dealt first, and takes one of the slot's places. */
  if (storyOn(L)) {
    const due = dueArcs(L, phase);
    /* Two arcs can be due in one slot (an April with a farewell and a
       label to answer); both are dealt, each taking a place. */
    for (const id of due.slice(0, 2)) { dealCard(L, phase, ARC_EVENTS[id]); n = Math.max(0, n - 1); }
  }
  for (let k = 0; k < n; k++) {
    const ids = Object.keys(pool).filter((id) => eligible(L, pool[id], phase, used, once));
    /* On a story career the old recurring cards (a slump, a night out) give
       way a little to the wider catalog, so two careers share less. */
    /* A life off the floor keeps its pace: meeting someone, a proposal, a
       wedding, a baby. Damping those left a sweep of 600 with eleven weddings,
       so on a story career they are dealt a little more often, not less. */
    const damp = storyOn(L) ? (x) => (LIFE_CYCLE[x] ? 1.8 : STORY_RECURS[x] && !STORY_EV[x] ? 0.2 : 1) : () => 1;
    const id = weighted(rng, ids, (x) => pool[x].weight(L) * damp(x));
    if (!id) return;
    used[id] = 1;
    if (pool[id].once) once[id] = 1;
    if (storyOn(L)) (evSeen(L)[id] = evSeen(L)[id] || []).push(L.year);
    dealCard(L, phase, pool[id]);
  }
}

// ─── continuity ─────────────────────────────────────────────────────────────

/* THE STORY HAS TO HAPPEN IN ORDER. These are the rules a reader would notice
   broken: a card about a game after the season ended, a partner named while
   you are single, an Olympics in a year with none, a wedding before an
   engagement. The simulator runs them over every card of every career and
   fails on any hit (NARRATIVE.md: continuity scan failures, 0). They read
   state only and change nothing. */
const IN_GAME = { court: 1, locker: 1 };
const PARTNER_EVENTS = { propose: 1, wedding: 1, baby: 1, breakup: 1 };
const LIFE_CYCLE = { meet_someone: 1, propose: 1, wedding: 1, baby: 1 };
function continuity(L, card) {
  const out = [];
  const ev = card && evById(card.id);
  if (!ev || card.kind !== 'event' || ev.pool === 'post') return out;
  if (ev.pool === 'arc') {
    if (ev.stage === 'nba' && isAm(L)) out.push(card.id + ' is an NBA arc dealt before the NBA');
    if (ev.stage === 'am' && !isAm(L)) out.push(card.id + ' is a school arc dealt in the NBA');
    return out;
  }
  const slot = String(card.key || '').split(':')[0];
  const story = storyOn(L);
  if (story && (slot === 'late' || slot === 'off' || slot === 'pre') && ev.tags.some((t) => IN_GAME[t]) && card.id !== 'young_star' && card.id !== 'playoff_eve')
    out.push(card.id + ' is about the regular season and was dealt in ' + slot);
  if (PARTNER_EVENTS[card.id] && lifeOf(L).rel === 'single') out.push(card.id + ' names a partner while single');
  if (story && card.id === 'olympics' && L.year % 4 !== 0) out.push('olympics in ' + L.year);
  if (ev.pool === 'nba' && isAm(L)) out.push(card.id + ' is an NBA card dealt before the NBA');
  if (ev.pool === 'am' && !isAm(L)) out.push(card.id + ' is a school card dealt in the NBA');
  if (ev.pool === 'am' && /^col/.test(slot) && L.am && L.am.level !== 'col') out.push(card.id + ' is a college card dealt in high school');
  if (ev.pool === 'nba' && !L.team && ev.tags.some((t) => IN_GAME[t] || t === 'coach')) out.push(card.id + ' needs a club and there is none');
  return out;
}
/* The order a life is logged in: met, then engaged, then married, and a
   child only once married. A new person starts the chain again. */
function continuityLog(L) {
  const out = [];
  let y = -Infinity, met = false, engaged = false, married = false;
  for (const e of L.log) {
    if (e.y < y) out.push('the log goes back in time at ' + e.y);
    y = Math.max(y, e.y);
    if (/^Met /.test(e.t)) { met = true; engaged = false; }
    else if (/^Engaged to /.test(e.t)) { if (!met) out.push('engaged before meeting anybody'); engaged = true; met = false; }
    else if (/^Married /.test(e.t)) { if (!engaged) out.push('married without an engagement'); married = true; engaged = false; }
    else if (/^Became a parent|^Welcomed kid/.test(e.t) && !married) out.push('a child before a wedding');
  }
  for (const k in L.mem || {}) if (L.mem[k].y > L.year) out.push('memory ' + k + ' is from the future');
  return out;
}

// ─── the story engine: people, memory, callbacks, arcs ───────────────────────

/* THE PERSON LEDGER. Every invented person a story career deals with is kept:
   who they are to you, the year you met, a meter from -100 to 100 and the
   last few things that happened between you. Real people are never in it:
   a real coach is the trust meter and nothing else. */
const ROLE_OF = {
  agent: 'Agent', newagent: 'Agent', gm: 'General manager', owner: 'Owner', tm: 'Teammate', tm2: 'Teammate', tvet: 'Teammate',
  trook: 'Teammate', tco: 'Teammate', rival: 'Draft-class rival', partner: 'Partner', mom: 'Mom', dad: 'Dad', cousin: 'Cousin',
  friend: 'Friend from home', beat: 'Beat writer', critic: 'TV critic', trainer: 'Trainer', hscoach: 'High school coach',
  roommate: 'College roommate', foe: 'Nemesis', oldvet: 'Old teammate', campkid: 'Kid from your camp', shoeexec: 'Shoe executive', fan: 'Superfan',
  sonny: 'Agent', maya: 'Agent', dre: 'Rival from camp', aau: 'AAU coach', ellis: 'Streetball legend', lazlo: 'Owner', father: 'Dad',
  rookie2: 'Teammate', costar: 'Co-star',
};
function meet(L, tok, name) {
  const n = name || peopleKey(L, tok);
  if (!n || !ROLE_OF[tok]) return null;
  const id = tok + ':' + n;
  const P = L.people || (L.people = {});
  if (!P[id]) P[id] = { role: ROLE_OF[tok], n, met: L.year, rel: 0, notes: [] };
  return P[id];
}
function relate(L, tok, d, note, name) {
  if (!storyOn(L)) return null;
  const p = meet(L, tok, name);
  if (!p) return null;
  p.rel = clamp(p.rel + d, -100, 100);
  if (note) { p.notes.push([L.year, say(L, note)]); if (p.notes.length > 5) p.notes.shift(); }
  return p;
}
/* Your closest teammate, past or present: the invented teammate you have the
   most with, if it is anything at all. */
function bestMate(L) {
  let b = null;
  for (const id in L.people || {}) { const p = L.people[id]; if (p.role === 'Teammate' && p.rel >= 40 && (!b || p.rel > b.rel)) b = p; }
  return b;
}
const relOf = (L, tok) => { const n = peopleKey(L, tok); const p = L.people && L.people[tok + ':' + n]; return p ? p.rel : 0; };
/* What each answer does to the people in it, as data: [token, change, note]. */
const EVENT_REL = {
  vet_mentor: [[['tvet', 25, 'He showed you the ropes.']], [['tvet', 10]], [['tvet', -10]]],
  rookie_duty: [[['tvet', 15, 'You bought the breakfasts.']], [['tvet', -5]], [['tvet', -20, 'You refused rookie duty.']]],
  night_out: [[['tm', 12]], [['tm', 4]], [['tm', -4]]],
  teammate_touches: [[['tco', 20, 'You fed him.']], [['tco', 10]], [['tco', -20, 'You froze him out.']]],
  teammate_fight: [[['tm', -15, 'You shoved back.']], [['tm', 5]], [['tm', 10]]],
  online_beef: [[['critic', -10]], [], [['beat', 5]]],
  family_money: [[['cousin', 15]], [['cousin', 5], ['mom', 10]], [['cousin', -25, 'You said no.']]],
  investment: [[['friend', 15, 'You went all in on his idea.']], [['friend', 5]], [['friend', -5]]],
  coach_bench: [[], [], [['agent', 5], ['gm', -15, 'You asked for a trade.']]],
  stuck: [[], [['gm', -10], ['beat', 10]], []],
  tank: [[['gm', 10]], [['gm', -10]], [['gm', -20, 'You asked out of the tank.']]],
  trade_rumor: [[['gm', 10]], [['gm', -10]], []],
  contract_year: [[['agent', 10]], [['gm', 10]], []],
  podcast: [[['beat', -5], ['critic', 10]], [['gm', 5], ['agent', -8]]],
  shoe_deal: [[['agent', 10]], [['agent', 15], ['shoeexec', 20, 'You signed for your own shoe.']], [['agent', -25, 'You turned down two shoe deals.']]],
  local_ad: [[['agent', 5]], [['agent', -10, 'You passed on his commercial.']]],
  docuseries: [[['mom', 10], ['agent', 5]], [['agent', 5]], [['tm', 5], ['agent', -12, 'You turned down the documentary.']]],
  agent_pitch: [[['agent', -40, 'You left for a power agency.']], [['agent', 30, 'You stayed loyal.']]],
  propose: [[], [['partner', -10]]],
  wedding: [[['partner', 20, 'The wedding of the year.']], [['partner', 25, 'A small wedding on a beach.']]],
  baby: [[['partner', 15], ['mom', 15]], [['partner', -5]]],
  hometown_call: [[['mom', 20, 'You came home.'], ['hscoach', 20]], []],
  mentor_rookie: [[['trook', 25, 'You took him under your wing.']], [['trook', -5]]],
  young_star: [[['trook', 25, 'You mentored him.']], [['trook', -10]], [['gm', -10]]],
  rehab_summer: [[], [['trainer', 10]]],
  charity: [[['hscoach', 20, 'You paid for the new gym.']], [['hscoach', 10]], []],
  roommate: [[['roommate', 20]], [['roommate', 30, 'Best friends by October.']], [['roommate', -15]]],
  grades: [[['mom', 5]], [], []],
  coach_son: [[], [], [['dad', 10], ['hscoach', -20, 'Your dad yelled in the parking lot.']]],
  playoff_eve: [[], []],
  exit_interview: [[['gm', 10]], [['gm', -5]], [['gm', -15], ['beat', 5]]],
};
/* The names are read BEFORE the answer runs, because the answer can change
   who a token means (a new agent, a new club), and the card was about the
   people on it when it was dealt. */
function relNames(L, id, i) {
  const t = EVENT_REL[id] && EVENT_REL[id][i];
  if (!t || !storyOn(L)) return null;
  return t.map(([tok, d, note]) => [tok, d, note, peopleKey(L, tok)]);
}
function applyRel(L, names) {
  if (names) for (const [tok, d, note, n] of names) relate(L, tok, d, note, n);
}

/* MEMORY and CALLBACKS. remember() stamps the year; a callback is a short
   line keyed by what is remembered, and it says how long ago in words, so a
   story can point back at itself ("Two seasons ago you beat {foe}"). A
   callback is never said about the year it happened in: it is a memory only
   once it is behind you. */
function ago(L, y) {
  const d = L.year - y;
  if (d <= 0) return 'this season';
  if (d === 1) return 'last season';
  if (d <= 4) return wordNum(d).toLowerCase() + ' seasons ago';
  return 'back in ' + (y - 1) + '-' + String(y).slice(2);
}
const sw = (a) => a ? ', ' + a : '';
const CALLBACKS = {
  'arc.feud.won': (a) => 'You beat {foe} when it counted' + sw(a) + '.',
  'arc.feud.lost': (a) => '{foe} got the better of you' + sw(a) + '.',
  'arc.feud.peace': (a) => 'You and {foe} buried it' + sw(a) + '.',
  'arc.feud.respect': (a) => 'You won the game {foe} made personal' + sw(a) + '.',
  'arc.gym.mentor': () => 'A kid from your gym plays college ball. You still call him.',
  'arc.gym.fan': () => 'A kid from your gym plays college ball in your shoes.',
  'arc.venture.won': (a) => 'The business you backed paid off' + sw(a) + '.',
  'arc.venture.lost': (a) => 'The business you backed closed' + sw(a) + '.',
  'arc.venture.out': (a) => 'You pulled out of a friend\'s business' + sw(a) + '.',
  'arc.promise.kept': (a) => 'You promised a big summer' + sw(a) + '. You delivered.',
  'arc.promise.broken': (a) => 'You promised a big summer' + sw(a) + '. It never came.',
  'arc.prep.won': () => 'You beat {prepstar} again in college.',
  'arc.prep.peace': () => 'You and {prepstar} shook hands in college.',
  'arc.prep.lost': () => '{prepstar} got you back in college.',
  'arc.mentor.video': () => '{oldvet} plays your video before his games.',
  'arc.mentor.visit': () => '{oldvet} still has the photo from his gym.',
  'po.stopper': (a) => 'You took the toughest playoff assignment' + sw(a) + '.',
  'blamed.system': (a) => 'You blamed the system in an exit interview' + sw(a) + '.',
  'g7.made': () => 'You hit a Game 7 winner.',
  'hometown.played': () => 'You came home to play.',
};
function callback(L, key) {
  const m = recall(L, key), f = CALLBACKS[key];
  if (!m || !f || m.y >= L.year) return '';
  return say(L, f(ago(L, m.y)));
}
/* Memories worth printing, oldest first, each with its year. */
function memories(L) {
  const out = [];
  for (const k in L.mem || {}) if (CALLBACKS[k]) out.push({ k, y: L.mem[k].y, t: say(L, CALLBACKS[k]('')) });
  return out.sort((a, b) => a.y - b.y);
}

/* ARCS. An arc is a run of cards with a setup, an escalation and a payoff,
   and it ends in one of at least two resolutions. A node is dealt in a named
   slot no earlier than a named year, ahead of anything random, and an arc
   left unfinished for four years (an overseas year, a retirement) is let go.
   The resolution is remembered as `arc.<id>.<how>`, which is what the
   callbacks read. */
function arcData(L, id) { return (L.arcs && L.arcs[id] && L.arcs[id].d) || {}; }
/* An arc happens once in a career. Starting one that already ran answers
   false, and the caller tells the plain version of its story instead. */
function arcStart(L, id, node, slot, dy, d) {
  if (!storyOn(L)) return false;
  const A = L.arcs || (L.arcs = {});
  if (A[id]) return false;
  A[id] = { node, slot, y: L.year + dy, d: d || {}, at: L.year };
  return true;
}
function arcGo(L, id, node, slot, dy) {
  const a = L.arcs && L.arcs[id];
  if (!a) return;
  a.node = node; a.slot = slot; a.y = L.year + dy;
}
function arcEnd(L, id, how) {
  const a = L.arcs && L.arcs[id];
  if (!a) return;
  a.done = how; a.node = null;
  remember(L, 'arc.' + id + '.' + how, true);
}
function dueArcs(L, slot) {
  const out = [];
  for (const id in L.arcs || {}) {
    const a = L.arcs[id];
    if (a.done || !a.node) continue;
    if (L.year - a.y > 4) { a.done = 'faded'; a.node = null; continue; }
    if (a.slot !== slot || L.year < a.y) continue;
    const ev = ARC_EVENTS[a.node];
    if (ev && reqOk(L, ev.req) && ev.when(L)) out.push(a.node);
  }
  return out;
}

// ─── character: hidden traits, the build, the people around you ──────────────

/* HIDDEN TRAITS (NARRATIVE.md section 2) are rolled at birth and do their work
   on a story career whether or not you know them. A trait is REVEALED when
   play touches it, and only then does the card show it, with the reason in
   one line. A migrated save rolls traits too, and they do nothing there,
   because acting on them would replay its career differently. */
const trait = (L, k) => storyOn(L) && hasTrait(L, k);
const TRAIT_NAME = {
  clutch: 'Clutch', coachable: 'Coachable', injuryProne: 'Injury prone', lateBloomer: 'Late bloomer', lockerVoice: 'Locker room voice',
  gymRat: 'Gym rat', hothead: 'Hothead', bigStage: 'Big stage', ironMan: 'Iron man', filmJunkie: 'Film junkie',
  spender: 'Big spender', saver: 'Saver', showman: 'Showman', loyal: 'Loyal', mercenary: 'Mercenary',
};
function reveal(L, k, why, beats) {
  const t = L.traits && L.traits[k];
  if (!storyOn(L) || !t || !t.has || t.known) return false;
  t.known = L.year; t.why = why;
  const line = 'Revealed: ' + TRAIT_NAME[k] + '. ' + why;
  logIt(L, line, 'gold');
  if (beats) beats.push({ kind: 'trait', text: line, tone: 'gold', trait: k });
  return true;
}
const tw = (L) => L.tw || (L.tw = {});
const clutchBonus = (L) => trait(L, 'clutch') ? 0.05 : 0;
const hotTax = (L) => trait(L, 'hothead') ? 0.15 : 0;
/* A shot that won a game, from any door: the regular season, a moment, a
   Game 7, a tournament. Two of them and a clutch player knows it. */
function clutchHit(L, beats) {
  if (!storyOn(L)) return;
  const n = tw(L).winners = (tw(L).winners || 0) + 1;
  if (n >= 2) reveal(L, 'clutch', 'Two game winners already.', beats);
}
/* The answers that go looking for a fight. */
const HOT_PICKS = { ref_heat: 0, heckler: 0, teammate_fight: 0, arc_feud_2: 0, online_beef: 0 };
const SPEND_PICKS = { wedding: 0, body_care: 0, charity: 0, investment: 0, family_money: 0 };
function watchPick(L, id, i, beats) {
  if (!storyOn(L)) return;
  if (SPEND_PICKS[id] === i) tw(L).spent = (tw(L).spent || 0) + 1;
  if (HOT_PICKS[id] === i) { const n = tw(L).hot = (tw(L).hot || 0) + 1; if (n >= 2) reveal(L, 'hothead', 'Two blowups. People have noticed.', beats); }
}
/* Season-level reveals, read when a season closes. */
function traitSeason(L, beats) {
  if (!storyOn(L)) return;
  const s = L.season, T = tw(L);
  if (!s) return;
  if (s.out <= 2 && s.gp >= 60) T.iron = (T.iron || 0) + 1;
  if (T.iron >= 3) reveal(L, 'ironMan', 'Three seasons without missing real time.', beats);
  if (s.po && (s.po.champ || (s.po.results || []).length >= 3)) reveal(L, 'bigStage', 'You play bigger in May.', beats);
  if (L.m.trust >= 75) reveal(L, 'coachable', 'Every staff you\'ve had trusts you.', beats);
  if (L.m.fame >= 70) reveal(L, 'showman', 'The cameras find you. You find them back.', beats);
  if (L.rt.iq >= 78) reveal(L, 'filmJunkie', 'You know every play before the call.', beats);
  if (L.cash >= 25) reveal(L, 'saver', 'You still have most of what you made.', beats);
  if ((T.spent || 0) >= 3) reveal(L, 'spender', 'The money comes in. The money goes out.', beats);
  const clubs = new Set(L.history.map((h) => h.t)).size;
  if (L.history.length >= 6 && clubs === 1) reveal(L, 'loyal', 'Six seasons, one jersey.', beats);
  if (clubs >= 3) reveal(L, 'mercenary', 'Three jerseys. You go where it pays.', beats);
  const mates = Object.values(L.people || {}).filter((p) => p.role === 'Teammate' && p.rel >= 20).length;
  if (mates >= 3) reveal(L, 'lockerVoice', 'Three teammates would run through a wall for you.', beats);
}

/* SKILL BADGES are read off what you are, at the end of each season, and
   kept once earned. Each needs a rating, and some need the season to show it. */
const BADGES = [
  ['deadeye', 'Deadeye', (L) => L.rt.sho >= 85],
  ['floorgen', 'Floor general', (L) => L.rt.pla >= 85],
  ['lockdown', 'Lockdown', (L) => L.rt.def >= 85],
  ['glass', 'Glass cleaner', (L) => L.rt.reb >= 85],
  ['finisher', 'Finisher', (L) => L.rt.fin >= 85],
  ['flight', 'Highlight factory', (L) => L.rt.ath >= 88],
  ['brain', 'Coach on the floor', (L) => L.rt.iq >= 85],
  ['bucket', 'Walking bucket', (L, pg) => pg && pg.pts >= 25],
  ['dimes', 'Dime dropper', (L, pg) => pg && pg.ast >= 9],
  ['boards', 'Board man', (L, pg) => pg && pg.reb >= 11],
];
function badgeSeason(L, beats) {
  if (!storyOn(L)) return;
  const pg = L.season && L.season.gp >= 40 ? perGame(L.season) : null;
  const B = L.badges || (L.badges = {});
  for (const [k, name, test] of BADGES) if (!B[k] && test(L, pg)) {
    B[k] = L.year;
    logIt(L, 'Earned a badge: ' + name + '.', 'good');
    if (beats) beats.push({ kind: 'badge', text: 'New badge: ' + name + '.', tone: 'good' });
  }
}
const badgeList = (L) => BADGES.filter(([k]) => L.badges && L.badges[k]).map(([k, n]) => ({ k, name: n, y: L.badges[k] }));

/* THE BUILD CHANGES. Three summer cards, each at most once in a while: the
   game you play has become another archetype, your coach wants you at the
   next position over, and you pick a signature move. None is forced. */
const SIGS = {
  sho: ['Step-back three', 'The step-back. Nobody\'s found a counter.'],
  fin: ['Euro step', 'Two steps, two directions. Defenders guess wrong every time.'],
  pla: ['No-look pass', 'You look one way. The ball goes the other.'],
  def: ['Chase-down block', 'From behind, pinned on the glass. It\'s your best highlight.'],
  reb: ['Putback slam', 'Every miss is a chance. You live on the glass.'],
  ath: ['Baseline reverse', 'Under the rim and up the other side. Crowd loses it.'],
  iq: ['Pump fake', 'One fake. They bite every time.'],
};
function archFit(L, k) {
  const r = L.rt, mean = RATINGS.reduce((a, x) => a + r[x], 0) / RATINGS.length, t = ARCHES[k].tilt;
  let f = 0;
  for (const x in t) f += t[x] * (r[x] - mean);
  return f;
}
const NEXT_POS = { PG: ['SG'], SG: ['PG', 'SF'], SF: ['SG', 'PF'], PF: ['SF', 'C'], C: ['PF'] };
function buildCards(L) {
  if (!storyOn(L) || !L.team || L.retired) return;
  const F = L.flags, top = RATINGS.slice().sort((a, b) => L.rt[b] - L.rt[a]);
  if (!L.sig && L.age >= 23 && ovrOf(L) >= 74) {
    const ks = top.slice(0, 3);
    L.pending.push({ id: 'build_sig', kind: 'event', key: 'sig:' + L.year, scene: 'The practice gym', eyebrow: calendar(L, 'off'), title: 'What\'s your signature move?',
      text: 'Every great one has a move the whole league knows. Time to pick yours.', ctx: { ks }, options: ks.map((k) => ({ label: SIGS[k][0], hint: RATING_NAME[k] + ' ' + ovT(L, L.rt[k]) + '.' })) });
    return;
  }
  const pool = ARCHES[L.arch].pos ? archesFor(L.pos) : ARCH_KEYS;
  const best = pool.slice().sort((a, b) => archFit(L, b) - archFit(L, a))[0];
  if (best !== L.arch && L.age >= 24 && archFit(L, best) - archFit(L, L.arch) >= 45 && L.year - (F.archAsk || 0) >= 4) {
    F.archAsk = L.year;
    L.pending.push({ id: 'build_arch', kind: 'event', key: 'arch:' + L.year, scene: 'The film room', eyebrow: calendar(L, 'off'), title: 'Is your game changing?',
      text: 'The scouting reports have started calling you a ' + ARCHES[best].name.toLowerCase() + '. Do you agree?', ctx: { to: best },
      options: [{ label: 'Lean into it', hint: ARCHES[best].blurb }, { label: 'Stay a ' + ARCHES[L.arch].name.toLowerCase(), hint: ARCHES[L.arch].blurb }] });
    return;
  }
  const alt = NEXT_POS[L.pos].map((p) => [p, overall(L.rt, p) - ovrOf(L)]).sort((a, b) => b[1] - a[1])[0];
  if (alt && alt[1] >= 2 && L.age >= 24 && L.year - (F.posAsk || 0) >= 4) {
    F.posAsk = L.year;
    L.pending.push({ id: 'build_pos', kind: 'event', key: 'pos:' + L.year, scene: 'The film room', eyebrow: calendar(L, 'off'), title: '{coach} wants to try you at ' + POS_NAME[alt[0]].toLowerCase() + '.',
      text: 'On paper you\'re ' + alt[1] + ' better there. It\'s a new spot on the floor.', ctx: { to: alt[0] },
      options: [{ label: 'Move to ' + alt[0], hint: 'Overall ' + ovT(L, overall(L.rt, alt[0])) + ' there' }, { label: 'Stay at ' + L.pos, hint: 'It\'s your position' }] });
  }
}
function chooseBuild(L, card, i) {
  if (card.id === 'build_sig') { const k = card.ctx.ks[i]; L.sig = { k, name: SIGS[k][0], y: L.year }; logIt(L, 'Signature move: ' + SIGS[k][0] + '.', 'gold'); bump(L, { fame: 3 }); return SIGS[k][1]; }
  if (card.id === 'build_arch') { if (i === 0) { const was = ARCHES[L.arch].name; L.arch = card.ctx.to; logIt(L, 'From ' + was.toLowerCase() + ' to ' + ARCHES[L.arch].name.toLowerCase() + '.', 'good'); return 'New reports, new role. You\'re a ' + ARCHES[L.arch].name.toLowerCase() + ' now.'; } bump(L, { morale: 2 }); return 'You know who you are. Let them write what they want.'; }
  if (card.id === 'build_pos') { if (i === 0) { L.arch = archForPos(L, card.ctx.to); L.pos = card.ctx.to; logIt(L, 'Moved to ' + POS_NAME[L.pos].toLowerCase() + '.', 'good'); bump(L, { trust: 4 }); return 'New spot on the floor. It fits better than you thought.'; } bump(L, { trust: -2 }); return 'He lets it go. For now.'; }
  return null;
}
/* A signature move pays on the shot it is. */
const sigBonus = (L, k) => L.sig && L.sig.k === k ? 0.03 : 0;

// ─── the world: a living league, goals, legacy and the media ─────────────────

/* THE LIVING LEAGUE. A story career shares the league with a handful of
   invented stars who rise, peak, win things and retire on their own clocks.
   They are who wins the MVP when you do not, who beats you to the ring, and
   who the debate shows argue about. Invented on purpose: a real player's
   future is not ours to write. Real clubs, real coaches and real rosters
   stay exactly as they are. */
const ORD_WORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];
const OUTLETS = ['Hardwood Wire', 'The Daily Dribble', 'Baseline Radio', 'Court Report', 'The Arena Sheet'];
function figRng(L, tag) { return E.createSeededRNG(E.hashSeed(String(L.seed) + ':fig:' + tag)); }
function figOvr(f, year) {
  const a = year - f.b;
  const up = a <= 27 ? f.peak - (27 - a) * 2.4 : a <= 30 ? f.peak : f.peak - (a - 30) * 1.9;
  return Math.round(clamp(up, 60, 99));
}
function figName(L, rng) {
  for (let i = 0; i < 30; i++) {
    const n = pick(rng, RIVAL_FIRST) + ' ' + pick(rng, PEOPLE_LAST);
    if ((!L.rival || L.rival.name !== n) && !(L.league.figs || []).some((f) => f.n === n) && n !== L.name) return n;
  }
  return 'Jalen Starling';
}
function figs(L) {
  if (!storyOn(L)) return [];
  const G = L.league;
  if (!G.figs) {
    G.figs = [];
    const rng = figRng(L, 'seed');
    for (let i = 0; i < 9; i++) {
      const age = 20 + Math.floor(rng() * 12);
      G.figs.push({ n: figName(L, rng), b: L.year - age, peak: Math.round(86 + rng() * 10), pos: pick(rng, POS), club: pick(rng, CLUBS), mvp: 0, rings: 0, gone: 0 });
    }
  }
  return G.figs;
}
const activeFigs = (L) => figs(L).filter((f) => !f.gone);
/* A summer in the league: the stars age, some move, the old ones retire and a
   rookie arrives on the worst club. Read in the summer the age changes. */
function figYear(L) {
  const rng = figRng(L, 'y' + L.year);
  for (const f of activeFigs(L)) {
    const a = L.year - f.b;
    if (a >= 34 + Math.floor(rng() * 4) || (a >= 29 && figOvr(f, L.year) < 74)) { f.gone = L.year; feed(L, 'retire', f.n + ' retires after ' + (a - 19) + ' seasons.', null, L.year - 1); continue; }
    if (rng() < 0.12 && figOvr(f, L.year) >= 84) { const to = pick(rng, CLUBS.filter((c) => c !== f.club && c !== L.team)); feed(L, 'move', f.n + ' signs with the ' + E.teamName(to) + '.', null, L.year - 1); f.club = to; }
  }
  const worst = CLUBS.slice().sort((a, b) => clubNet(L, a) - clubNet(L, b))[0];
  const kid = { n: figName(L, rng), b: L.year - 19, peak: Math.round(84 + rng() * 12), pos: pick(rng, POS), club: worst, mvp: 0, rings: 0, gone: 0 };
  figs(L).push(kid);
  feed(L, 'draft', 'The ' + nick(worst) + ' draft ' + kid.n + ' with a top pick.', null, L.year - 1);
}
/* The MVP race, as it stands at the All-Star break. You are in it when your
   season says so. */
function mvpRace(L) {
  const rng = figRng(L, 'race' + L.year);
  /* Voters tire of the same winner, so a run of MVPs is hard to keep. */
  const out = activeFigs(L).map((f) => ({ n: f.n, club: f.club, sc: figOvr(f, L.year) + clubNet(L, f.club) * 0.5 + norm(rng) * 2.6
    - (f.won || []).filter((y) => L.year - y <= 4).length * 2.4 }));
  const s = L.season;
  if (s && s.gp >= 20 && !isAm(L)) {
    const pg = perGame(s);
    out.push({ n: L.name, club: L.team, you: true, sc: effOvr(L) + (pg.pts - 24) * 0.35 + (s.w - s.l) * 0.06 });
  }
  return out.sort((a, b) => b.sc - a.sc).slice(0, 5).map((x, i) => Object.assign(x, { rank: i + 1 }));
}
/* Who won what when you did not. Called once, as the regular season ends. */
function leagueAwards(L, mine) {
  if (!storyOn(L)) return;
  const race = mvpRace(L).filter((x) => !x.you);
  if (mine.indexOf('mvp') < 0 && race.length) {
    const f = activeFigs(L).find((x) => x.n === race[0].n);
    if (f) { f.mvp++; (f.won = f.won || []).push(L.year); feed(L, 'award', f.n + ' wins the MVP.' + (f.mvp > 1 ? ' His ' + (ORD_WORD[f.mvp] || ordinal(f.mvp)) + '.' : '')); }
  }
  if (L.season) L.season.mvp = mine.indexOf('mvp') >= 0 ? L.name : race.length ? race[0].n : '';
}
/* The champion, every season, and the dynasties they become. */
function leagueChamp(L, beats) {
  if (!storyOn(L) || !L.season || !L.team) return;
  const s = L.season, po = s.po || {};
  let club;
  if (po.champ) club = L.team;
  else {
    const fin = (po.results || []).find((r) => r.round === 3);
    if (fin) club = fin.opp;
    else {
      const rng = figRng(L, 'champ' + L.year);
      club = weighted(rng, CLUBS.filter((c) => c !== L.team), (c) => Math.exp(clubNet(L, c) * 0.45));
    }
  }
  const G = L.league, C2 = G.champs || (G.champs = {});
  C2[s.year] = club;
  for (const f of activeFigs(L)) if (f.club === club) f.rings++;
  if (club !== L.team) feed(L, 'champ', 'The ' + E.teamName(club) + ' win the title.');
  const last = [0, 1, 2, 3].map((d) => C2[s.year - d]);
  const run = last.filter((c) => c === club).length;
  if ((last[1] === club && run >= 2) || run >= 3) {
    const dyn = G.dyn || (G.dyn = {});
    if (!dyn[club] || s.year - dyn[club] > 3) {
      dyn[club] = s.year;
      const span = last.lastIndexOf(club) + 1;
      const line = run === 2 && span === 2 ? (club === L.team ? 'Back to back. ' : 'The ' + nick(club) + ' go back to back. ') + 'Dynasty talk starts.'
        : (club === L.team ? 'Your ' : 'The ') + nick(club) + ': ' + wordNum(run).toLowerCase() + ' titles in ' + wordNum(span).toLowerCase() + ' years. A dynasty.';
      feed(L, 'dynasty', line);
      if (club === L.team) { logIt(L, line, 'gold'); if (beats) beats.push({ kind: 'dynasty', text: line, tone: 'gold' }); }
    }
  }
}
/* League news, now and then, each at most once. A thing announced for a
   later year arrives in that year. */
const LEAGUE_NEWS = [
  ['cup', () => 'The league adds a midseason cup. Prize money for every player on the winner.'],
  ['line', () => 'The league votes to move the three-point line back a foot.'],
  ['commish', (L) => 'A new commissioner takes over: ' + peopleKey(L, 'commish') + '.'],
  ['expand', (L) => 'Two expansion clubs are coming in ' + (L.year + 3) + '.', 3, 'The two expansion clubs play their first games.'],
  ['tv', () => 'A new TV deal. Every club is richer by the fall.'],
  ['ban', () => 'A betting scandal on another club. Two players are banned for life.'],
];
function leagueNews(L) {
  const G = L.league, done = G.news || (G.news = {});
  for (const [id, , dy, later] of LEAGUE_NEWS) if (done[id] && dy && done[id] + dy === L.year) feed(L, 'league', later, null, L.year - 1);
  const rng = figRng(L, 'news' + L.year);
  if (rng() > 0.25) return;
  const open = LEAGUE_NEWS.filter((x) => !done[x[0]]);
  if (!open.length) return;
  const x = pick(rng, open);
  done[x[0]] = L.year;
  feed(L, 'league', x[1](L), null, L.year - 1);
}
function leagueSummer(L) {
  if (!storyOn(L)) return;
  figYear(L);
  leagueNews(L);
}

/* THE FEED: what the outlets say about you and the league, newest last. One
   headline a step at most from the beats, so it reads like a front page and
   not a transcript. */
function feed(L, kind, t, src, y) {
  if (!storyOn(L)) return;
  const F = L.feed || (L.feed = []);
  F.push({ y: y || L.year, k: kind, t: say(L, t), s: src || OUTLETS[(F.length * 7 + L.year) % OUTLETS.length] });
  if (F.length > 80) F.shift();
}
const HEAD = {
  award: (b) => b.award === 'mvp' ? '{name} is your MVP.' : b.award === 'star' ? null : '{name}: ' + b.text.replace(/\.$/, '') + '.',
  champ: (b) => '{name} and the {club} win it all.',
  trade: (b) => { if (b.back) return null; const m = /Traded to the (.+?)\./.exec(b.text); return m ? '{name} is traded to the ' + m[1] + '.' : null; },
  trait: (b) => b.trait ? '{name} has a reputation now: ' + TRAIT_NAME[b.trait].toLowerCase() + '.' : null,
  badge: () => null,
  milestone: (b) => '{name} reaches ' + b.text.replace(/^([0-9,]+) career/, '$1 career').toLowerCase(),
  dynasty: (b) => b.text,
  finals_loss: () => '{name} comes up short in the Finals.',
  retire: () => '{name} retires.',
};
/* A trade made by a card or a step becomes one beat, with where you came
   from, where you are going, who went the other way and when it happened,
   so the scene can tell you the way it would really reach you. */
function tradeBeat(L, beats, how) {
  const t = TRADED;
  TRADED = null;
  if (!t || !beats || beats.some((b) => b.kind === 'trade')) return;
  const ph = L.phase;
  const when = ph === 'off' || ph === 'pre' || ph === 'drafted' ? 'summer' : ph === 'mid' || ph === 'early' ? 'deadline' : 'season';
  beats.push(Object.assign({ kind: 'trade', text: 'Traded to the ' + E.teamName(t.to) + '.', tone: 'gold', from: t.from, to: t.to, back: t.back, how: how || '', when }, tradePeople(L, t.from)));
}
/* Who tells you, for the scene: the general manager who traded you, the one
   who traded for you, your agent, whoever is home with you, and the oldest
   head in the locker room you are leaving. All of them invented. */
function tradePeople(L, from) {
  const f = L.life || {}, paired = f.rel && f.rel !== 'single';
  return {
    oldgm: personName(L, 'gm:' + from), newgm: say(L, '{gm}'), agent: say(L, '{agent}'),
    fam: paired ? say(L, '{partner}') : say(L, '{mom}'), famRole: paired ? (f.rel === 'married' ? 'family' : 'partner') : 'mom',
    kids: f.kids || 0, oldmate: from ? lockerOf(L, from)[0].n : '',
  };
}
function headlines(L, beats) {
  if (!storyOn(L) || !beats || !beats.length) return;
  for (const b of beats) {
    const f = HEAD[b.kind];
    const t = f && f(b);
    if (t) { feed(L, b.kind, t.replace(/\{name\}/g, L.name).replace(/\{club\}/g, L.team ? nick(L.team) : '')); return; }
  }
}
/* The debate show at the All-Star break: two invented hosts, one question
   about you, and they never agree. */
function debate(L) {
  if (!storyOn(L) || isAm(L) || L.m.fame < 40 || !L.season) return;
  const o = ovrOf(L), s = L.season, pg = perGame(s), rng = figRng(L, 'debate' + L.year);
  /* Every other season at most, unless something big happened. */
  if (L.flags.debated === L.year - 1 && !s.allstar) return;
  L.flags.debated = L.year;
  const race = s.race || [], me = race.find((x) => x.you);
  const q = me && me.rank <= 2 ? 'Is ' + L.name + ' the MVP?' : o >= 85 ? 'Is ' + L.name + ' a top ten player?'
    : s.allstar ? 'Did ' + L.name + ' deserve the All-Star nod?' : L.contract && L.contract.salary > capFor(L.year) * 0.2 ? 'Is ' + L.name + ' worth the money?' : 'Is ' + L.name + ' for real?';
  const hot = pick(rng, [pg.pts >= 20 ? pg.pts + ' a night. Yes.' : 'Watch the film. Yes.', 'He wins games. Yes.', 'I have seen enough. Yes.']);
  const cold = pick(rng, [s.w < s.l ? 'His team is ' + s.w + '-' + s.l + '. No.' : 'Ask me in May. No.', 'Show me a playoff run. No.', 'Not yet. No.']);
  feed(L, 'debate', q + ' ' + CAST.ellis + ': "' + hot + '" ' + CAST.critic + ': "' + cold + '"', 'Hot Take Hour');
}
/* NICKNAMES come from the broadcast, off something you have shown. */
const NICKS = { clutch: 'Iceman', ironMan: 'Ironman', showman: 'Showtime', hothead: 'The Fuse', deadeye: 'Splash', lockdown: 'The Wall', glass: 'Glass', flight: 'Skywalker', brain: 'The Professor', floorgen: 'The Conductor', bigStage: 'Mr. May' };
function nicknameCard(L) {
  if (!storyOn(L) || L.nick || L.m.fame < 45 || L.year - (L.flags.nickAsk || -9) < 3 || isAm(L)) return;
  const known = TRAITS.filter((k) => L.traits[k] && L.traits[k].known && NICKS[k]).concat(Object.keys(L.badges || {}).filter((k) => NICKS[k]));
  if (!known.length) return;
  const nm = NICKS[known[0]];
  L.flags.nickAsk = L.year;
  L.pending.push({ id: 'nickname', kind: 'event', key: 'nick:' + L.year, scene: 'The broadcast', eyebrow: calendar(L, 'off'), title: 'They\'re calling you "' + nm + '" now',
    text: '{pbp} said it once on a late call. Now the whole arena says it.', ctx: { nm },
    options: [{ label: 'Own it', hint: 'Stitch it on your shoes' }, { label: 'Ask them to drop it', hint: 'You\'ve got a name already' }] });
}

/* GOALS. Before each season a story career picks one thing to chase, from
   three that fit where it is. Met or missed, it is said at the end. */
const lastH = (L) => L.history[L.history.length - 1];
const wonSeries = (s) => !!(s.po && (s.po.results || []).some((r) => r.won));
const GOALS = {
  playoffs: ['Make the playoffs', (L, s) => !!(s.po && (s.po.results || []).length), (L) => clubNet(L, L.team) < 2],
  star: ['Make the All-Star team', (L, s) => !!s.allstar, (L) => ovrOf(L) >= 78],
  twenty: ['Average 20 a night', (L, s) => perGame(s).pts >= 20, (L) => { const h = lastH(L); return !!h && h.pts >= 14 && h.pts < 20; }],
  thirty: ['Average 30 a night', (L, s) => perGame(s).pts >= 30, (L) => { const h = lastH(L); return !!h && h.pts >= 24; }],
  healthy: ['Stay healthy for 75 games', (L, s) => s.gp >= 75, (L) => L.age >= 28],
  ring: ['Win the title', (L, s) => !!(s.po && s.po.champ), (L) => clubNet(L, L.team) >= 2],
  start: ['Win a starting job', (L, s) => !!(s.role && s.role.starter), (L) => { const h = lastH(L); return !!h && (h.role === 'Rotation' || h.role === 'End of bench' || h.role === 'Sixth man'); }],
  mvp: ['Win the MVP', (L, s) => s.awards.indexOf('mvp') >= 0, (L) => ovrOf(L) >= 89],
  defense: ['Make an All-Defense team', (L, s) => s.awards.some((a) => a === 'ad1' || a === 'ad2' || a === 'dpoy'), (L) => L.rt.def >= 84],
  boards: ['Average 10 rebounds', (L, s) => perGame(s).reb >= 10, (L) => { const h = lastH(L); return !!h && h.reb >= 7 && h.reb < 10; }],
  dimes: ['Average 8 assists', (L, s) => perGame(s).ast >= 8, (L) => { const h = lastH(L); return !!h && h.ast >= 5.5 && h.ast < 8; }],
  blocks: ['Average two blocks a night', (L, s) => perGame(s).blk >= 2, (L) => { const h = lastH(L); return !!h && h.blk >= 1.2 && h.blk < 2; }],
  fifty: ['Shoot 50 percent from the field', (L, s) => perGame(s).fgp >= 50 && s.gp >= 40, (L) => { const h = lastH(L); return !!h && h.fgp >= 45 && h.fgp < 50; }],
  wins50: ['Win 50 games', (L, s) => s.w >= 50, (L) => { const n = clubNet(L, L.team); return n >= -1 && n < 5; }],
  series: ['Win a playoff series', (L, s) => wonSeries(s), (L) => { const h = lastH(L); return !!h && (h.po === 'R1' || h.po === 'Play-in') && clubNet(L, L.team) >= -1; }],
  allnba: ['Make an All-NBA team', (L, s) => s.awards.some((a) => a === 'an1' || a === 'an2' || a === 'an3'), (L) => ovrOf(L) >= 84 && ovrOf(L) < 92],
  sixth: ['Win Sixth Man of the Year', (L, s) => s.awards.indexOf('6moy') >= 0, (L) => { const h = lastH(L); return !!h && (h.role === 'Sixth man' || h.role === 'Rotation') && h.pts >= 11 && ovrOf(L) < 84; }],
  mip: ['Win Most Improved', (L, s) => s.awards.indexOf('mip') >= 0, (L) => { const h = lastH(L); return L.age <= 25 && !!h && h.pts <= 16 && h.gp >= 50; }],
};
/* The second line under each goal: what chasing it really means. */
const GOAL_HINT = {
  playoffs: 'Drag this team to April', star: 'Get the league to notice', twenty: 'Become a real scorer',
  thirty: 'Go get buckets, every night', healthy: 'Take care of your body', ring: 'Nothing else counts',
  start: 'Take somebody\'s job', mvp: 'Best player in the world', defense: 'Make them hate you',
  boards: 'Own the glass', dimes: 'Make everybody better', blocks: 'Close the paint',
  fifty: 'Only good shots', wins50: 'Team first', series: 'Get past round one',
  allnba: 'Join the elite', sixth: 'Own the second unit', mip: 'Show the jump',
};
/* Who asks. The question was the same voice every September; now it comes
   from whoever would be asking that year, and they remember in April. A
   person is not asked two Septembers running. */
const GOAL_ASK = {
  gm: ['What\'s the goal this year?', '{gm} leans back: "Give me one thing. I\'m holding you to it in April."', (L) => !!L.team],
  agent: ['A bonus clause needs filling in', '{agent} slides the contract over: "Hit this and the next deal gets easier."', (L) => !!L.contract && L.contract.years <= 2],
  beat: ['Going on the record?', '{beat} has the recorder out: "One goal. It runs in Sunday\'s paper."', (L) => L.m.fame >= 30],
  trainer: ['WHY?', '{trainer} writes one word on the whiteboard and waits for your answer.', () => true],
  mom: ['What\'s this year about, baby?', 'Your mom asks over Sunday dinner. She\'ll ask again in April.', () => true],
  self: ['One goal on the mirror', 'Nobody else will see it. You will, every single morning.', () => true],
};
function goalCard(L) {
  if (!storyOn(L) || !L.team || !L.season || L.season.goal) return;
  const fit = Object.keys(GOALS).filter((k) => GOALS[k][2](L));
  if (fit.length < 2) return;
  const rng = figRng(L, 'goal' + L.year);
  const ks = fit.sort(() => rng() - 0.5).slice(0, 3);
  const prev = (L.goals || []).length ? L.goals[L.goals.length - 1] : null;
  const whos = Object.keys(GOAL_ASK).filter((w) => GOAL_ASK[w][2](L) && !(prev && prev.who === w));
  const who = pick(figRng(L, 'goalwho' + L.year), whos);
  const A = GOAL_ASK[who];
  /* Last April is part of the question. */
  const back = prev && prev.y === L.year - 1 ? (prev.met ? ' Last year you hit yours.' : ' Last year you missed yours.') : '';
  L.pending.push({ id: 'goal', kind: 'event', key: 'goal:' + L.year, scene: who === 'self' ? 'Home' : who === 'gm' ? 'GM\'s office' : who === 'agent' ? 'Agent\'s office' : who === 'beat' ? 'Media day' : who === 'trainer' ? 'The weight room' : 'Sunday dinner', eyebrow: calendar(L, 'pre'), title: A[0],
    text: A[1] + back, ctx: { ks, who }, options: ks.map((k) => ({ label: GOALS[k][0], hint: GOAL_HINT[k] })) });
}
const GOAL_SAID = {
  gm: ['{gm} brings it up at the exit meeting, grinning.', '{gm} brings it up at the exit meeting. He isn\'t grinning.'],
  agent: ['{agent} cashes the bonus clause that same week.', '{agent} says the bonus can wait a year.'],
  beat: ['{beat} runs a follow-up: he said it, he did it.', '{beat} runs a follow-up. It isn\'t kind.'],
  trainer: ['{trainer} erases WHY and writes NEXT.', '{trainer} leaves WHY on the board all summer.'],
  mom: ['Your mom clipped the newspaper.', 'Your mom says there\'s always next year.'],
  self: ['You leave it on the mirror one more week.', 'You wipe the mirror clean.'],
};
function goalSeason(L, beats) {
  const s = L.season;
  if (!storyOn(L) || !s || !s.goal) return;
  const g = GOALS[s.goal], met = g[1](L, s);
  const G = L.goals || (L.goals = []);
  const who = s.goalWho || null;
  G.push({ y: s.year, k: s.goal, met, who });
  const said = who && GOAL_SAID[who] ? ' ' + GOAL_SAID[who][met ? 0 : 1] : '';
  const t = (met ? 'Goal met: ' : 'Goal missed: ') + g[0][0].toLowerCase() + g[0].slice(1) + '.' + said;
  logIt(L, t, met ? 'good' : 'bad');
  beats.push({ kind: 'goal', text: t, tone: met ? 'good' : 'bad' });
  bump(L, met ? { morale: 6, fame: 2 } : { morale: -3 });
  if (who && who !== 'self') relate(L, who, met ? 6 : -3, met ? 'You hit the goal you told them.' : null);
}

/* LEGACY, read live: the rung you are on, the next one and how far, a Hall of
   Fame chance and the records coming up. */
function legacyView(L) {
  const T = totals(L), sc = legacyScore(T);
  const i = VERDICTS.findIndex((v) => sc >= v[0]);
  const next = i > 0 ? VERDICTS[i - 1] : null;
  const hof = Math.round(100 / (1 + Math.exp(-(sc - 55) / 8)));
  const watch = [];
  for (const [k, steps, word] of MILESTONES) { const m = steps.find((x) => T[k] < x); if (m && T[k] >= m * 0.6) watch.push({ k, m, left: m - T[k], word }); }
  return { score: Math.round(sc), rung: VERDICTS[i][1], next: next ? { name: next[1], need: Math.ceil(next[0] - sc) } : null, hof, watch };
}

// ─── before the league: high school and college ─────────────────────────────

/* A career can start on draft night, with a background standing in for how
 * you got there, or three years earlier as a fifteen year old high school
 * sophomore. The road is played on the league's own ratings scale, so a
 * sophomore is about a 40 and a one and done arrives near the 56 the
 * background would have handed him. The point of playing it is that the 56 is
 * yours, and so is everything the scouts saw on the way.
 *
 * THE SCHOOLS ARE REAL AND THE PEOPLE ARE GENERATED. A college is an
 * institution, the way an NBA club is, so Duke is Duke. Its coach, its
 * boosters and your roommate are generated names off the career's seed, the
 * same people every time the career loads.
 *
 * NOTHING HERE TOUCHES THE LEAGUE'S MODEL. The road ends at the same combine
 * card a draft-night career starts on, with ratings, a ceiling, fame and draft
 * stock, and from there the NBA half plays exactly as it always has.
 */
const AGE_HS = 15;
/* How many seasons before the data's newest one a high school career starts:
   sophomore, junior, senior and a college freshman year, then the draft. */
const ROAD_LEAD = 4;
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
  const role = d >= 10 ? 'You start day one' : d >= 4 ? 'You fight for a starting spot' : d >= -2 ? 'You come off the bench' : 'You wait your turn';
  return TIER_NAME[s.tier] + ', ' + s.conf + '. Coach ' + colCoachName(L, name) + '. ' + role + '.';
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
  const posReb = { PG: 3.6, SG: 4.2, SF: 5.6, PF: 7.2, C: 8.4 }[L.pos] + (Number.isFinite(L.ht) ? sizeOf(L).dh * 0.25 : 0);
  const reb = Math.max(1, posReb + (r.reb - 50) * 0.13 + rel * 0.1) * k;
  const ast = Math.max(0.7, 1.6 + (r.pla - 40) * 0.12 + rel * 0.04) * k;
  const stl = Math.max(0.1, 0.6 + (r.def - 50) * 0.02 + rel * 0.02) * k;
  const big = Math.max(0.1, { PG: 0.2, SG: 0.25, SF: 0.45, PF: 0.8, C: 1.2 }[L.pos] + (archBase(L) === 'anchor' ? 0.6 : 0) + (Number.isFinite(L.ht) ? sizeOf(L).dh * 0.07 : 0));
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
    beats.push({ kind: 'champ', text: txt, tone: 'gold', level: t.kind });
    logIt(L, (t.kind === 'hs' ? L.am.hs.name : L.am.college) + ': ' + txt, 'gold');
    bump(L, { fame: t.kind === 'hs' ? 6 : 12, morale: 12 });
    if (t.kind === 'ncaa') L.pending.push(presserCard(L, 'ncaa'));
  }
}
function amClutchCard(L, t, g) {
  const names = t.kind === 'hs' ? HS_ROUNDS : NCAA_ROUNDS;
  const opts = clutchOptions(L);
  return {
    id: 'amclutch', kind: 'clutch', key: 'amclutch:' + t.kind + ':' + g.r, scene: t.kind === 'hs' ? 'The home gym' : 'March Madness',
    eyebrow: names[g.r] + ' · ' + (g.seed ? g.seed + ' seed ' : '') + g.opp,
    title: 'Tied. Six seconds. Your ball.',
    text: (t.kind === 'hs' ? 'The whole town\'s packed into the gym.' : 'It\'s March, and every bracket in the country is watching.') + ' What\'s the play?',
    ctx: { r: g.r },
    options: opts.map((o) => ({ label: o.label, hint: RATING_NAME[o.rate] + ' ' + ovT(L, L.rt[o.rate]) + '.' })),
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
  /* A story career stops at the halfway mark, so what happens in January is
     dealt in January and can still change February. */
  if (storyOn(L)) {
    const pg = perGame(s);
    beats.push({ kind: 'record', text: 'Halfway: ' + s.w + '-' + s.l + '. You: ' + pg.pts + ' points, ' + pg.reb + ' rebounds.', tone: s.w >= s.l ? 'good' : '' });
    L.phase = 'hs_mid';
    queueEvents(L, 'hs', 1 + (rngAt(L, 'n:hs')() < 0.5 ? 1 : 0), AM_EVENTS);
    return;
  }
  hsSecondHalf(L, beats);
}
function hsSecondHalf(L, beats) {
  const s = L.season;
  amInjury(L, 'hs2', beats);
  amGames(L, HS_GAMES - 13, (r) => norm(r) * 3 + 0.5, 'hs2', beats, false);
  s.qual = s.w >= 13;
  const pg = perGame(s);
  beats.unshift({ kind: 'record', text: s.w + '-' + s.l + (s.qual ? '. Into the state playoffs.' : '. No playoffs.'), tone: s.qual ? 'good' : 'bad' });
  beats.push({ kind: 'record', text: 'You: ' + pg.pts + ' points, ' + pg.reb + ' rebounds, ' + pg.ast + ' assists.', tone: '' });
  logIt(L, GRADE[L.am.grade][0].toUpperCase() + GRADE[L.am.grade].slice(1) + ' year: ' + s.w + '-' + s.l + ', ' + pg.pts + ' a night.', '');
  L.phase = 'hs_reg';
  if (!storyOn(L)) queueEvents(L, 'hs', 1 + (rngAt(L, 'n:hs')() < 0.5 ? 1 : 0), AM_EVENTS);
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
  queueEvents(L, storyOn(L) ? 'col_mar' : 'col', 1, AM_EVENTS);
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
const ALT_TEAM = { intl: 'Overseas', gl: 'G League', juco: 'Junior college', prep: 'Prep school', gap: 'Private runs', rec: 'Rec league' };
const ALT_NET = { intl: 0, gl: 0, juco: -6, prep: -3, gap: -2, rec: -9 };
function proYear(L, beats) {
  const route = L.am.route;
  /* A story career plays the year in two halves, with a card between, so the
     year can have a story. A save from before plays it in one step. */
  const story = storyOn(L), half = story ? 16 : 32;
  if (!story || !L.am.altHalf) {
    L.am.proTeam = ALT_TEAM[route] || 'G League';
    L.am.proNet = round1(norm(rngAt(L, 'pronet')) * 3 + (story ? ALT_NET[route] || 0 : 0));
    newAmSeason(L, 'pro');
    const s = L.season;
    s.role = amRole(L);
    amInjury(L, 'pro', beats);
    amGames(L, half, (r) => norm(r) * 3, 'pro', beats, false);
    if (story) {
      L.am.altHalf = 1;
      queueEvents(L, 'alt', 1 + (rngAt(L, 'n:alt')() < 0.5 ? 1 : 0), AM_EVENTS);
      return;
    }
  } else {
    L.am.altHalf = 0;
    amGames(L, half, (r) => norm(r) * 3, 'pro2', beats, false);
  }
  const s = L.season;
  const pg = perGame(s);
  const where = { intl: 'A season overseas against grown men', gl: 'A season in the G League', juco: 'A junior college season',
    prep: 'A prep school season', gap: 'A year of private runs', rec: 'A year of rec league and pro-ams' }[route] || 'A season';
  beats.push({ kind: 'record', text: where + ': ' + pg.pts + ' points, ' + pg.reb + ' rebounds, ' + pg.ast + ' assists.', tone: 'good' });
  bump(L, { cash: route === 'intl' ? 0.5 : route === 'gl' ? 0.6 : route === 'rec' ? 0.03 : 0, iq: 2 });
  L.am.stock = (L.am.stock || 0) + (route === 'rec' ? -1.5 : route === 'gap' ? 0.4 : 1) + Math.max(0, (pg.pts - 12) * 0.15);
  s.finish = ALT_TEAM[route] === 'Overseas' ? 'Pro' : ALT_TEAM[route] || 'G League';
  pushAmHist(L);
  developAm(L, beats);
  if (route === 'juco' || route === 'prep') {
    /* One year away, then the choice again, with whatever the year earned. */
    L.am.altDone = true;
    L.am.level = 'hs';
    L.am.grade = 12;
    if (route === 'juco') L.am.jucoYear = true;
    L.am.rstock = (L.am.rstock || 0) + clamp((pg.pts - 14) * 0.08, -0.5, 1.2) + (route === 'prep' ? 0.6 : 0.3);
    L.am.rank = nationalRank(L);
    L.stage = 'hs';
    L.phase = 'hs_off';
    beats.push({ kind: 'rank', text: 'New offers come in. ' + rankText(L.am.rank) + '.', tone: 'good' });
    queueEvents(L, 'hs_off', 0, AM_EVENTS);
    L.pending.push(commitCard(L));
    return;
  }
  L.age++;
  L.year++;
  driftLeague(L, beats);
  if (route === 'rec') L.flags.stock = (L.flags.stock || 0) - 6;
  toDraft(L, beats, route);
}

// ── the end of an amateur season ──

function pushAmHist(L) {
  const s = L.season, pg = perGame(s);
  const lvl = s.lvl === 'hs' ? 'HS' : s.lvl === 'col' ? 'NCAA' : L.am.route === 'intl' ? 'Overseas' : L.am.route === 'gl' ? 'G League' : ALT_TEAM[L.am.route] || 'G League';
  L.amHist.push(Object.assign({ y: s.year, age: L.age, lvl, school: s.school, ovr: ovrOf(L), w: s.w, l: s.l,
    finish: s.finish || '', seed: s.seed || null, rank: L.am.rank || null, aw: s.awards.slice() }, pg));
}
function developAm(L, beats) {
  const before = ovrOf(L);
  const rng = rngAt(L, 'develop');
  const gap = Math.max(0, L.pot - before);
  const eth = 0.65 + L.eth / 100 * 0.7;
  const grow = gap * (GROW_AM[L.age] || 0.08) * eth * lvl(L).grow;
  for (const k of RATINGS) L.rt[k] = clamp(Math.round(L.rt[k] + grow * (0.6 + rng() * 0.8)), 25, 99);
  const after = ovrOf(L);
  if (after !== before) {
    const sd = ovT(L, after) - ovT(L, before), sa = ovT(L, after);
    const t = sd > 0 || !storyOn(L) ? 'Up ' + sd + ' overall this summer, to ' + sa + '.' : 'Still ' + sa + ' overall.';
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
  return 'You\'re not on the mock drafts yet';
}

// ── recruiting and the decisions between years ──

function hsOffCards(L) {
  const g = L.am.grade;
  if (g === 11 && !L.am.college && !(storyOn(L) && L.am.rank > 150)) {
    const list = collegeOffers(L, 'jr');
    L.am.offers = list;
    L.pending.push({
      id: 'offers', kind: 'event', key: 'offers', scene: 'The kitchen table', eyebrow: 'Recruiting', title: 'Commit now, or wait?',
      text: rankText(L.am.rank) + '. The offers are on the table. Senior year could bring better ones, or worse.',
      ctx: { list },
      options: list.slice(0, 3).map((n) => ({ label: 'Commit to ' + n, hint: schoolHint(L, n), school: n }))
        .concat([{ label: 'Keep your options open', hint: 'Bet on your senior year' }]),
    });
  } else if (g === 12) {
    if (L.am.college) {
      L.pending.push({
        id: 'signing', kind: 'event', key: 'signing', scene: 'Signing day', eyebrow: 'Signing day', title: 'Sign it, or reopen?',
        text: 'The pen\'s on the table and your family\'s in the front row. You committed to ' + L.am.college + '.',
        options: [
          { label: 'Sign with ' + L.am.college, hint: 'You gave your word' },
          { label: 'Reopen your recruitment', hint: 'See who else is out there' },
        ],
      });
    } else L.pending.push(commitCard(L));
  }
}
function commitCard(L) {
  const list = collegeOffers(L, 'sr');
  L.am.offers = list;
  const opts = list.slice(0, 3).map((n) => ({ label: 'Commit to ' + n, hint: schoolHint(L, n), school: n }));
  const rk = L.am.rank, again = !!L.am.altDone;
  if (storyOn(L) && !again) {
    /* A story career sees every road its ranking really has. */
    if (rk >= 90 && rk <= 420) opts.push({ label: 'Do a prep school year', hint: 'One more year to grow', route: 'prep' });
    if (rk <= 80 && rngAt(L, 'gapoffer')() < 0.6) opts.push({ label: 'Take a gap year', hint: 'Train alone. No team, no games.', route: 'gap' });
  }
  if (!again && (rk <= 90 || (storyOn(L) && rk <= 110)) && (!storyOn(L) || rngAt(L, 'intloffer')() < 0.65)) opts.push({ label: 'Turn pro overseas', hint: 'Get paid to play grown men', route: 'intl' });
  if (!again && (rk <= 140 || (storyOn(L) && rk <= 165)) && (!storyOn(L) || rngAt(L, 'gloffer')() < 0.45)) opts.push({ label: 'Sign with the G League', hint: 'A paycheck and pro coaching', route: 'gl' });
  if (storyOn(L) && !again) {
    const power = SCHOOLS.filter((x) => x.tier === 'power');
    const walk = power[Math.floor(rngAt(L, 'walkon')() * power.length)].name;
    if (rk >= 265) opts.push({ label: 'Walk on at ' + walk, hint: 'No scholarship. Earn the jersey.', route: 'walkon', school: walk });
    if (rk >= 262) opts.push({ label: 'Go the junior college route', hint: 'Hot gym, maybe a D1 offer', route: 'juco' });
    if (rk >= 355) opts.push({ label: 'Get a job, play rec league', hint: 'No offer. Keep hooping anyway.', route: 'rec' });
  }
  return {
    id: 'commit', kind: 'event', key: 'commit', scene: 'The school gym', eyebrow: 'Decision day', title: 'Which hat are you putting on?',
    text: rankText(L.am.rank) + '. The hats are lined up on the table and the cameras are rolling.',
    ctx: { list }, options: opts,
  };
}
function colOffCards(L) {
  const cy = L.am.cyear;
  if (cy >= 4) { L.am.declared = true; return; }
  const proj = projectedPick(L, L.am.stock || 0);
  const next = CYEAR[cy + 1];
  L.pending.push({
    id: 'declare', kind: 'event', key: 'declare', scene: 'Coach\'s office', eyebrow: 'The draft deadline', title: 'Stay in school, or go pro?',
    text: draftTalk(proj) + '. You\'ve got until April to decide.',
    ctx: { proj },
    options: [
      { label: 'Declare for the draft', hint: proj <= 30 ? 'Get paid. Projected ' + ordinal(proj) + '.' : 'Second round or worse. A gamble.' },
      { label: 'Come back for your ' + next + ' year', hint: 'Grow up, chase another March' },
      { label: 'Enter the transfer portal', hint: 'A bigger role somewhere else' },
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
    id: 'portal', kind: 'event', key: 'portal', scene: 'Your phone', eyebrow: 'Transfer portal', title: 'Where do you transfer?',
    text: 'Your name hit the portal an hour ago. Your phone hasn\'t stopped buzzing since.',
    ctx: { list },
    options: list.map((n) => ({ label: 'Transfer to ' + n, hint: schoolHint(L, n), school: n }))
      .concat([{ label: 'Stay at ' + L.am.college, hint: 'Pull your name back out' }]),
  };
}

/* The summer between, which is where an amateur year begins. */
function amNewYear(L, beats) {
  L.age++;
  L.year++;
  driftLeague(L, beats);
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
    if (L.am.route === 'intl' || L.am.route === 'gl' || (!L.am.college && ALT_DONE[L.am.route])) {
      L.am.level = 'pro';
      L.stage = 'pro';
      L.phase = 'pro_year';
      const r = L.am.route;
      beats.push({ kind: 'year', text: (r === 'intl' ? 'You sign overseas.' : r === 'gl' ? 'You sign with a G League team.' : ALT_NAME[r] + '.') + ' You are ' + L.age + '.', tone: 'gold' });
      return;
    }
    L.am.level = 'col';
    L.stage = 'col';
    L.am.cyear = L.am.jucoYear ? 2 : 1;
    beats.push({ kind: 'year', text: CYEAR[L.am.cyear][0].toUpperCase() + CYEAR[L.am.cyear].slice(1) + ' year at ' + L.am.college + '. You are ' + L.age + '.', tone: 'gold' });
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

/* EVERY ROAD ENDS ON TODAY'S DRAFT. A road is three to seven years long and
   the player decides how long, so no start date can promise where it ends.
   The road is played on a floating calendar instead: the league does not
   move while you are an amateur (driftLeague, rosterSummer), and at the
   combine every year the career has written is moved so the rookie season is
   the one the roster file is for. You are drafted into today's league, with
   today's rosters and today's coaches, whatever road got you there. */
function landOnToday(L) {
  const lg = L.league, target = lg.rs || (lg.latest || 2026) + 1;
  const d = target - L.year;
  delete lg.rost; delete lg.rostY; delete lg.pool;
  if (!d) return;
  const sh = (v) => (Number.isFinite(v) && v > 1900 ? v + d : v);
  L.year += d;
  for (const h of L.amHist || []) h.y = sh(h.y);
  for (const x of L.log || []) x.y = sh(x.y);
  for (const x of L.feed || []) x.y = sh(x.y);
  for (const k in L.mem || {}) L.mem[k].y = sh(L.mem[k].y);
  for (const k in L.arcs || {}) { const a = L.arcs[k]; a.y = sh(a.y); a.at = sh(a.at); }
  for (const k in L.evlog || {}) L.evlog[k] = L.evlog[k].map(sh);
  for (const k in L.people || {}) { const p = L.people[k]; p.met = sh(p.met); for (const n of p.notes || []) n[0] = sh(n[0]); }
  for (const k in L.traits || {}) L.traits[k].known = sh(L.traits[k].known);
  if (L.flags.offUsed) L.flags.offUsed.y = sh(L.flags.offUsed.y);
  if (L.life) L.life.since = sh(L.life.since);
  for (const f of lg.figs || []) { f.b = sh(f.b); f.gone = sh(f.gone); if (f.won) f.won = f.won.map(sh); }
  for (const k in lg.news || {}) lg.news[k] = sh(lg.news[k]);
  /* A college coach who took an NBA job on the road (coach_leaves) keeps it,
     dated on the same calendar. The coaches the league opened with keep the
     dates they came with. */
  for (const c in lg.coach || {}) { const x = lg.coach[c]; if (x && x.n !== COACHES_NOW[c][0] && x.n !== (lg.cn && lg.cn[c])) x.since = Math.min(target, sh(x.since)); }
  for (const f of lg.free || []) f.out = Math.min(target - 1, sh(f.out));
}
/* The road ends at the combine card a draft-night career starts on. */
function toDraft(L, beats, route) {
  if (storyOn(L) && L.am && L.am.college) remember(L, 'route.' + (L.am.cyear >= 4 ? 'four' : L.am.cyear === 1 ? 'oad' : 'college'), true);
  L.stage = 'nba';
  L.bg = route === 'senior' ? 'senior' : route === 'intl' ? 'intl' : route === 'gl' ? 'gl' : 'oad';
  L.season = null;
  L.team = null;
  L.flags.stock = (L.flags.stock || 0) + (L.am.stock || 0);
  chStock(L);
  if (L.opt && L.opt.cal) landOnToday(L);
  L.phase = 'combine';
  L.pending.push(combineCard(L));
  const t = 'You declare for the ' + (L.year - 1) + ' NBA Draft.';
  beats.push({ kind: 'year', text: t, tone: 'gold' });
  logIt(L, t, 'gold');
}

function hsSummerCard(L) {
  return {
    id: 'hs_summer', kind: 'event', key: 'hs_summer', scene: 'Summer break', eyebrow: 'Summer before ' + GRADE[L.am.grade] + ' year',
    title: 'Where are you spending the summer?',
    text: 'You\'re ' + L.age + '. Overall ' + ovT(L, ovrOf(L)) + '. ' + rankText(L.am.rank) + '.',
    options: [
      { label: 'Play the shoe circuit', hint: 'Every scout. Hard on the body.' },
      { label: 'See a skills trainer daily', hint: 'Sharpen what you\'ve got' },
      { label: 'Run with your high school team', hint: 'Chemistry, and {coach} notices.' },
      { label: 'Rest and grow', hint: 'Sleep, eat, stretch' },
    ],
  };
}

// ── the amateur cards ──

const AM_EVENTS = {
  grades: {
    phases: ['hs', 'col'], when: () => true, weight: () => 3,
    title: 'Your grades are slipping.',
    text: (L) => L.season && L.season.lvl === 'col' ? '{adviser}, your academic adviser, says one more bad test and you sit.' : '{coach} says no grades, no games.',
    options: [
      { label: 'Study every night', run: (L) => { bump(L, { iq: 1, morale: -2, eth: 3 }); return 'You pass. Barely. Your mom, {mom}, frames the report card.'; } },
      { label: 'Get a tutor', run: (L) => { bump(L, { trust: 3, morale: 1 }); return '{tutor} comes two nights a week. It works.'; } },
      { label: 'Wing it', run: (L, r) => { if (ok(r, 0.5)) { bump(L, { morale: 2 }); return 'You wing it. It works. This time.'; } bump(L, { rest: 0.12, trust: -6 }); return 'Academically ineligible. You sit three games.'; } },
    ],
  },
  mixtape: {
    phases: ['hs', 'hs_sum'], when: (L) => L.am && L.am.level === 'hs', weight: () => 3,
    title: 'Your mixtape hits a million views.',
    text: () => 'Somebody put your dunks to music. Your phone has not stopped since.',
    options: [
      { label: 'Post more', run: (L) => { bump(L, { fame: 8, trust: -3 }); L.am.rstock = (L.am.rstock || 0) + 0.5; return 'Every scout in the country has seen your left hand now.'; } },
      { label: 'Stay quiet', run: (L) => { bump(L, { trust: 4, iq: 1 }); return '{coach} likes that you did not change.'; } },
      { label: 'Call out {prepstar}', run: (L, r) => { bump(L, { fame: 10 }); if (ok(r, 0.4 + (ovrOf(L) - 45) * 0.03)) { L.am.rstock = (L.am.rstock || 0) + 1; return 'He accepts. You cook him at a summer event. On camera.'; } L.am.rstock = (L.am.rstock || 0) - 0.8; bump(L, { morale: -6 }); return 'He accepts. He cooks you. Also on camera.'; } },
    ],
  },
  coach_son: {
    phases: ['hs'], when: (L) => L.am && L.am.grade <= 11 && L.season && L.season.role && L.season.role.diff < 9, weight: () => 3,
    title: "{coach}'s son plays your position.",
    text: () => 'His name is {coachson}. He gets the last shot every time. Everybody knows why.',
    options: [
      { label: 'Outwork him', run: (L, r) => { bump(L, { eth: 5 }); if (ok(r, 0.55)) { bump(L, { min: 6, trust: 6 }); return 'By February you are starting. Nobody says a word.'; } return 'You get better. He still starts.'; } },
      { label: 'Talk to {coach}', run: (L, r) => { if (ok(r, 0.4)) { bump(L, { min: 5 }); return 'He hears you. More minutes.'; } bump(L, { trust: -8 }); return 'He does not like being asked.'; } },
      { label: 'Let your dad handle it', run: (L) => { bump(L, { trust: -10, morale: 2 }); return 'Your dad, {dad}, handles it. Loudly. In the parking lot.'; } },
    ],
  },
  rival_school: {
    phases: ['hs'], when: () => true, weight: () => 2.5,
    queue: (L) => { const r = rngAt(L, 'prep2'); const pool = SCHOOLS.filter((x) => x.tier === 'blue' || x.tier === 'power'); arcStart(L, 'prep', 'arc_prep_2', 'col', 1, { school: pick(r, pool).name }); },
    title: (L) => times(L, 'rival_school') > 1 ? 'The crosstown rival, again.' : 'Friday night. The crosstown rival.',
    text: () => 'Sold out by Tuesday. Their star is {prepstar}. Every scout in the state is there.',
    options: [
      { label: 'Guarantee a win', run: (L, r) => { bump(L, { fame: 5 }); if (ok(r, 0.35 + (ovrOf(L) - 40) * 0.02)) { bump(L, { morale: 8, win: 0.5 }); L.am.rstock = (L.am.rstock || 0) + 0.5; return 'You back it up. Thirty-four and the student section storms the court.'; } bump(L, { morale: -7 }); return 'They win. They play your quote over the speakers.'; } },
      { label: 'Let your game talk', run: (L, r) => { if (ok(r, 0.55)) { bump(L, { morale: 5, win: 0.3 }); return 'A quiet twenty-six. A win.'; } bump(L, { morale: -3 }); return 'Close loss. Next year.'; } },
      { label: 'Lock up their star', run: (L) => { bump(L, { def: 1, trust: 4, win: 0.3 }); return '{prepstar} goes four for nineteen. The scouts noticed who guarded him.'; } },
    ],
  },
  double_team: {
    phases: ['hs', 'col'], when: (L) => L.season && L.season.role && L.season.role.label === 'Go-to player', weight: () => 3,
    title: 'Every team sends two at you now.',
    text: () => 'Box-and-one. Triangle-and-two. Some coaches just foul you.',
    options: [
      { label: 'Find the open man', run: (L) => { bump(L, { pla: 2, win: 0.4, usage: -0.01 }); return 'Your teammates start hitting shots. The defenses stop.'; } },
      { label: 'Score through it', run: (L, r) => { if (ok(r, 0.5)) { bump(L, { fin: 1, fame: 4 }); return 'Forty against a box-and-one. They stop trying it.'; } bump(L, { morale: -4, health: -3 }); return 'You force it. A lot of bad shots.'; } },
      { label: 'Ask {coach} for new sets', run: (L) => { bump(L, { iq: 2, trust: 3 }); return 'You run off screens now. It is harder to double a moving target.'; } },
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
      { label: 'Compete with everyone', run: (L, r) => { bump(L, { health: -4 }); if (ok(r, 0.35 + (ovrOf(L) - 42) * 0.025)) { L.am.rstock = (L.am.rstock || 0) + 1.2; bump(L, { fame: 5 }); return 'Camp MVP. Your ranking jumps.'; } L.am.rstock = (L.am.rstock || 0) - 0.4; return 'A rough week. {colcoach2}, who was recruiting you, saw all of it.'; } },
      { label: 'Go to learn', run: (L) => { bump(L, { iq: 2, def: 1 }); return 'You leave with a notebook full of things to fix.'; } },
      { label: 'Skip it and rest', run: (L) => { bump(L, { health: 6 }); return 'Fresh legs for the season.'; } },
    ],
  },
  street_agent: {
    phases: ['hs_off', 'hs_sum'], once: true, when: (L) => L.am && L.am.rank <= 100, weight: () => 2.5,
    title: 'A man in a nice car wants to help.',
    text: () => 'He says his name is {streetagent}. A friend of a friend. He has an envelope.',
    options: [
      { label: 'Tell him no', run: (L) => { bump(L, { morale: 2, trust: 2 }); return 'He leaves a card. You throw it out.'; } },
      { label: 'Take the envelope', run: (L) => { bump(L, { cash: 0.02, morale: 3 }); L.am.envelope = true; return 'Your family needs it. Nobody needs to know.'; } },
      { label: 'Tell {coach}', run: (L) => { bump(L, { trust: 6 }); return '{coach} makes a call. The car never comes back.'; } },
    ],
  },
  homecoming: {
    phases: ['hs'], when: () => true, weight: () => 1.5,
    title: 'Winter formal is the night before the rivalry game.',
    text: () => 'Your friends are going. So is {crush}.',
    options: [
      { label: 'Go', run: (L, r) => { bump(L, { morale: 8 }); if (ok(r, 0.6)) return 'Best night of the year. You still play well.'; bump(L, { health: -4, perf: -0.3 }); return 'Great night. Slow legs the next day.'; } },
      { label: 'Stay home and rest', run: (L) => { bump(L, { morale: -3, health: 3 }); return 'You hear about it all week.'; } },
    ],
  },
  class_skip: {
    phases: ['col'], when: () => true, weight: () => 2,
    title: 'You have missed three straight classes.',
    text: () => 'Professor {prof:last} emailed the athletic department.',
    options: [
      { label: 'Go to office hours', run: (L) => { bump(L, { iq: 1, trust: 2 }); return 'She is a big fan. You are fine.'; } },
      { label: 'Get notes from {mate}', run: (L) => { bump(L, { morale: 1 }); return '{mate} has perfect notes. You owe him.'; } },
      { label: 'Ignore it', run: (L, r) => { if (ok(r, 0.55)) return 'Nothing happens. You forget about it.'; bump(L, { rest: 0.1, trust: -6 }); return 'You are held out of two games.'; } },
    ],
  },
  freshman_wall: {
    phases: ['col'], when: (L) => L.am && L.am.cyear === 1, weight: () => 3,
    title: 'You hit the freshman wall.',
    text: (L) => (L.season ? L.season.g : 30) + ' games in. Your legs are gone. College practice is harder than high school games.',
    options: [
      { label: 'Extra lifting', run: (L) => { bump(L, { ath: 1, reb: 1, health: -4 }); return 'Sore for a week. Stronger for March.'; } },
      { label: 'Sleep and eat', run: (L) => { bump(L, { health: 8, perf: 0.3 }); return 'Nine hours a night. You feel human again.'; } },
      { label: 'Push through it', run: (L, r) => { if (ok(r, 0.5)) { bump(L, { eth: 4 }); return 'You find a second wind.'; } bump(L, { health: -6, perf: -0.4 }); return 'It catches up with you in February.'; } },
    ],
  },
  nba_scouts: {
    phases: ['col'], when: (L) => L.am && L.am.stock > -2, weight: () => 2.5,
    title: 'Twelve NBA scouts at practice. One is {scout}.',
    text: () => 'They sit in the corner with notebooks. Everybody knows who they came to see.',
    options: [
      { label: 'Show them everything', run: (L, r) => { if (ok(r, 0.5)) { L.am.stock = (L.am.stock || 0) + 0.8; return 'Your best practice of the year. Phones come out in the corner.'; } L.am.stock = (L.am.stock || 0) - 0.4; bump(L, { trust: -3 }); return 'You force it. {coach} yells. The scouts write that down too.'; } },
      { label: 'Play your role', run: (L) => { bump(L, { trust: 4 }); L.am.stock = (L.am.stock || 0) + 0.3; return 'Scouts like a guy who fits. They note it.'; } },
    ],
  },
  rivalry_col: {
    phases: ['col'], when: () => true, weight: () => 2,
    title: 'Rivalry week. National TV.',
    text: () => 'The student section has been camping out since Monday.',
    options: [
      { label: 'Take over the game', run: (L, r) => { if (ok(r, 0.3 + (ovrOf(L) - 50) * 0.025)) { bump(L, { fame: 8, win: 0.3 }); L.am.stock = (L.am.stock || 0) + 0.6; return 'Thirty-one on national TV. The student section chants your name.'; } bump(L, { morale: -5 }); return 'They key on you. A loss.'; } },
      { label: 'Run the offense', run: (L) => { bump(L, { win: 0.4, trust: 3 }); return 'A team win. {coach} mentions you first.'; } },
      { label: 'Talk trash before it', run: (L, r) => { bump(L, { fame: 5 }); if (ok(r, 0.5)) return 'You back it up. The clip runs all week.'; bump(L, { morale: -4, trust: -3 }); return 'They bring it up every time you touch the ball.'; } },
    ],
  },
  booster: {
    phases: ['col', 'col_pre'], once: true, when: (L) => L.am && L.am.level === 'col', weight: () => 1.8,
    title: 'A booster wants to give you a car.',
    text: () => 'His name is {booster}. Off the books. He says everybody does it.',
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
      { label: 'Focus on basketball', run: (L) => { bump(L, { trust: 4, iq: 1 }); return 'You leave the money. {coach} notices.'; } },
    ],
  },
  roommate: {
    phases: ['col_pre'], once: true, when: (L) => L.am && L.am.cyear === 1, weight: () => 4,
    title: 'Your roommate, {roommate}, is a walk-on from a farm town.',
    text: () => 'He has never been on a plane. He wakes up at five.',
    options: [
      { label: 'Start waking up at five too', run: (L) => { bump(L, { eth: 6, health: -2 }); return 'He becomes your rebounder at six every morning.'; } },
      { label: 'Show him the city', run: (L) => { bump(L, { morale: 6, trust: 2 }); return 'Best friends by October. He is in your corner for good.'; } },
      { label: 'Ask for a single', run: (L) => { bump(L, { morale: 1, trust: -2 }); return 'Quiet. Lonely.'; } },
    ],
  },
  /* He really goes: the worst club in the league fires its coach and hires
     him, so he is on an NBA bench for as long as the carousel keeps him. */
  coach_leaves: {
    phases: ['col_off'], once: true, when: (L) => L.am && L.am.cyear <= 3 && !!L.am.college, weight: () => 2,
    queue: (L) => {
      const club = CLUBS.slice().sort((a, b) => clubNet(L, a) - clubNet(L, b))[0];
      const name = myCoach(L);
      fire(L, club, 0);
      hire(L, club, { n: name, b: L.year - 48, real: 0 }, false).since = L.year + 1;
      L.flags.leave = { club, n: name };
      L.am.cv = (L.am.cv || 0) + 1;
    },
    title: '{oldcoach} takes the {leaveclub} job.',
    text: () => 'He calls before the news breaks. He wants you to know first.',
    options: [
      { label: 'Wish him well', run: (L) => { L.m.trust = 50; bump(L, { morale: -3 }); return '{coach} replaces him. He has a different system. You start over.'; } },
      { label: 'Ask for a word with the {leaveclub}', run: (L) => { L.m.trust = 50; L.am.stock = (L.am.stock || 0) + 0.6; return 'He says you are the best player he has coached. He means it.'; } },
    ],
  },
  investigation: {
    phases: ['col'], once: true, when: (L) => !!(L.am && L.am.envelope), weight: () => 8,
    title: '{reporter} is asking about an envelope.',
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
      { label: 'Play', run: (L, r) => { bump(L, { health: -3 }); if (ok(r, 0.5)) { bump(L, { fame: 6, iq: 1 }); return 'You drop forty in front of the whole fence. The video is everywhere.'; } bump(L, { iq: 1 }); return 'The pros teach you a lesson. A useful one.'; } },
      { label: 'Rest', run: (L) => { bump(L, { health: 5 }); return 'You watch from the fence.'; } },
    ],
  },
};
defineEvents(EVENTS, 'nba');
defineEvents(AM_EVENTS, 'am');

/* THE ARCS. Each node is dealt by dueArcs() in its own slot, never at random,
   and each run() moves the arc on (arcGo) or settles it (arcEnd). Setups live
   in EVENTS and AM_EVENTS; only what follows a setup is here. */
const ARC_EVENTS = {
  /* The feud: a podcast insult, a bump at the scorer's table, a rematch. */
  arc_feud_2: {
    phases: ['early'], stage: 'nba', req: { team: true },
    title: 'Round two with {foe}.',
    text: () => 'December, his building. He bumps you at the scorer\'s table before tip.',
    options: [
      { label: 'Bump him back', run: (L, r) => { arcGo(L, 'feud', 'arc_feud_3', 'mid', 0); if (ok(r, 0.5)) { bump(L, { fame: 4, morale: 3 }); return 'Double technical. The crowd loves it. So do you.'; } bump(L, { fame: 3, cash: -0.05, trust: -3 }); return 'Only you get the technical. He waves goodbye.'; } },
      { label: 'Smile and guard him', run: (L) => { arcGo(L, 'feud', 'arc_feud_3', 'mid', 0); bump(L, { def: 1, trust: 3 }); return 'He takes nine shots in the first half. He makes two.'; } },
      { label: 'Offer a handshake', run: (L) => { arcEnd(L, 'feud', 'peace'); relate(L, 'foe', 40, 'You shook hands before tip.'); bump(L, { trust: 2 }); return 'He looks at it for a long second. Then he takes it.'; } },
    ],
  },
  arc_feud_3: {
    phases: ['mid'], stage: 'nba', req: { team: true },
    title: 'You and {foe}, the national game.',
    text: () => 'February. A sold-out building. {beat} calls it the game of the month.',
    options: [
      { label: 'Take him yourself', run: (L, r) => { if (ok(r, 0.4 + (ovrOf(L) - 72) * 0.03)) { arcEnd(L, 'feud', 'won'); relate(L, 'foe', -10, 'You beat him in the national game.'); bump(L, { fame: 8, morale: 6 }); return 'You win the duel and the game. He leaves without talking.'; } arcEnd(L, 'feud', 'lost'); relate(L, 'foe', -10, 'He beat you in the national game.'); bump(L, { morale: -6 }); return 'He gets you. He talks about it for a week.'; } },
      { label: 'Win the game, not the duel', run: (L) => { arcEnd(L, 'feud', 'respect'); relate(L, 'foe', 20, 'You won the game he made personal.'); bump(L, { win: 0.4, trust: 4 }); return 'A team win. He says something kind after. Nobody expected that.'; } },
    ],
  },
  /* The gym: the gym you paid for opens, and years later a kid from it signs
     with a college. */
  arc_gym_2: {
    phases: ['off'], stage: 'nba',
    title: 'Your gym opens.',
    text: () => 'Your old high school paints your number at center court. Kids from your camp are there.',
    options: [
      { label: 'Cut the ribbon', run: (L) => { arcGo(L, 'gym', 'arc_gym_3', 'off', 5); bump(L, { fame: 3, morale: 6 }); return 'Photos, a speech, a lot of hugs.'; } },
      { label: 'Run the first practice', run: (L) => { arcGo(L, 'gym', 'arc_gym_3', 'off', 5); arcData(L, 'gym').coached = true; bump(L, { morale: 8 }); return 'Two hours of drills. One twelve-year-old does not miss.'; } },
    ],
  },
  arc_gym_3: {
    phases: ['off'], stage: 'nba',
    title: '{campkid} signs with a college.',
    text: (L) => 'He was twelve at your gym opening.' + (arcData(L, 'gym').coached ? ' He made every drill.' : '') + ' He tags you in the post.',
    options: [
      { label: 'Call him', run: (L) => { arcEnd(L, 'gym', 'mentor'); relate(L, 'campkid', 40, 'You called the day he signed.'); bump(L, { morale: 8 }); return 'He cannot talk. He just laughs. You know the feeling.'; } },
      { label: 'Send him a box of your shoes', run: (L) => { arcEnd(L, 'gym', 'fan'); relate(L, 'campkid', 20, 'You sent him shoes.'); bump(L, { fame: 2, morale: 3 }); return 'He wears them in his first game. Size fourteen.'; } },
    ],
  },
  /* The venture: the money went in last summer; now the business has a year
     of numbers. Whether it works was settled when it opened. */
  arc_venture_2: {
    phases: ['off'], stage: 'nba',
    title: '{friend}\'s business has a year of numbers.',
    text: (L) => arcData(L, 'venture').good ? 'It is making money. Lines on weekends. He wants to grow.' : 'It is losing money. He needs ' + money(arcData(L, 'venture').more) + ' to keep going.',
    options: [
      { label: 'Put in more', run: (L, r) => { const d = arcData(L, 'venture'); bump(L, { cash: -Math.min(d.more, L.cash) }); arcGo(L, 'venture', 'arc_venture_3', 'off', 1); d.in += d.more; return d.good ? 'A second location by spring.' : 'You write the check. He promises it turns.'; } },
      { label: 'Take your money out', run: (L) => { const d = arcData(L, 'venture'); const back = round1(d.in * (d.good ? 1.6 : 0.4)); bump(L, { cash: back }); arcEnd(L, 'venture', d.good ? 'won' : 'out'); relate(L, 'friend', d.good ? 5 : -20, d.good ? 'You cashed out of his business.' : 'You pulled out when it was losing.'); return 'You get ' + money(back) + ' back.' + (d.good ? ' A clean win.' : ' He takes it hard.'); } },
    ],
  },
  arc_venture_3: {
    phases: ['off'], stage: 'nba',
    title: 'Two years in, the books are final.',
    text: (L) => arcData(L, 'venture').boom ? '{friend} has an offer to buy the whole thing.' : '{friend} calls. It did not make it.',
    options: [
      { label: 'Hear it out', run: (L) => { const d = arcData(L, 'venture'); if (d.boom) { const back = round1(d.in * 2.6); bump(L, { cash: back, fame: 2 }); arcEnd(L, 'venture', 'won'); relate(L, 'friend', 25, 'The business sold.'); return 'They sell. Your share is ' + money(back) + '.'; } arcEnd(L, 'venture', 'lost'); relate(L, 'friend', -10, 'The business closed.'); bump(L, { morale: -6 }); return 'It closes in May. The sign stays up a while.'; } },
      { label: 'Tell him you are proud of him', run: (L) => { const d = arcData(L, 'venture'); relate(L, 'friend', 20, 'You stood by him.'); if (d.boom) { const back = round1(d.in * 2.2); bump(L, { cash: back, morale: 4 }); arcEnd(L, 'venture', 'won'); return 'He sells. He cries on the phone. You get ' + money(back) + '.'; } arcEnd(L, 'venture', 'lost'); bump(L, { morale: -2 }); return 'It closes. The friendship does not.'; } },
    ],
  },
  /* The promise: what you told the GM in April, checked at camp. */
  arc_promise_2: {
    phases: ['pre'], stage: 'nba', req: { team: true },
    title: '{gm} remembers April.',
    text: (L) => { const d = ovT(L, ovrOf(L)) - ovT(L, arcData(L, 'promise').ovr || ovrOf(L)); return d > 0 ? 'You came back ' + d + ' better. He says so in front of the staff.' : 'You promised a big summer. You came back the same player.'; },
    options: [
      { label: 'Point at the work', run: (L) => { const up = ovrOf(L) > (arcData(L, 'promise').ovr || 99); arcEnd(L, 'promise', up ? 'kept' : 'broken'); relate(L, 'gm', up ? 15 : -10, up ? 'You kept your April promise.' : 'You broke your April promise.'); bump(L, up ? { min: 3, trust: 4 } : { trust: -4 }); return up ? 'More minutes. Earned.' : 'He nods. He has heard it before.'; } },
      { label: 'Keep your head down', run: (L) => { const up = ovrOf(L) > (arcData(L, 'promise').ovr || 99); arcEnd(L, 'promise', up ? 'kept' : 'broken'); bump(L, { trust: up ? 6 : 1, eth: 3 }); return 'You go to work. That is the answer either way.'; } },
    ],
  },
  /* The mentor: the veteran who looked after you, years later. */
  arc_mentor_2: {
    phases: ['off'], stage: 'nba',
    title: '{oldvet} coaches high school now.',
    text: () => 'He calls. He wants you at his gym for a day.',
    options: [
      { label: 'Go for the whole day', run: (L) => { arcEnd(L, 'mentor', 'visit'); relate(L, 'oldvet', 30, 'You spent a day at his gym.'); bump(L, { morale: 8, fame: 1 }); return 'His kids lose their minds. He stands in the back and grins.'; } },
      { label: 'Send a video', run: (L) => { arcEnd(L, 'mentor', 'video'); relate(L, 'oldvet', 5); bump(L, { morale: 2 }); return 'Two minutes, recorded in a hotel. He plays it before every game.'; } },
    ],
  },
  /* The crosstown rival from high school, on the other bench in college. */
  arc_prep_2: {
    phases: ['col', 'col_mar'], stage: 'am', when: (L) => !!(L.am && L.am.level === 'col' && L.am.college !== arcData(L, 'prep').school),
    title: '{prepstar} is on the other bench.',
    text: () => 'Your old crosstown rival plays for {school2} now. National TV.',
    options: [
      { label: 'Make it personal', run: (L, r) => { if (ok(r, 0.4 + (ovrOf(L) - 50) * 0.03)) { arcEnd(L, 'prep', 'won'); bump(L, { fame: 6, morale: 6 }); if (L.am) L.am.stock = (L.am.stock || 0) + 0.4; return 'You win again. Some things never change.'; } arcEnd(L, 'prep', 'lost'); bump(L, { morale: -5 }); return 'He wins this one. He reminds you about high school anyway.'; } },
      { label: 'Shake his hand first', run: (L) => { arcEnd(L, 'prep', 'peace'); bump(L, { trust: 3, morale: 3 }); return 'You catch up at midcourt. Then you play hard.'; } },
    ],
  },
};
defineEvents(ARC_EVENTS, 'arc');

// ─── Phase D: routes, storylines, outcomes ──────────────────────────────────

/* EVERYTHING BELOW IS FOR A STORY CAREER and nothing in it is dealt to a
   migrated save: the pools are only merged in when storyOn(L), the new slots
   are only opened then, and every engine hook checks it first. So a career
   started before Phase D (or with the story off) plays on byte for byte,
   which `hoops/build/replay-careers.mjs --story off` proves.

   An event here is written as data and compiled into the same shape as the
   rest of the catalog. An option is
     { l: label, fx: bump, s: what the screen says, set: memory key(s),
       rel: [[token, change, note]], start/go/end: arc moves, p: odds,
       no: the branch when the odds miss, do: anything else, log: a log line }
   `rel` is read into EVENT_REL, so the people on a card are named before the
   answer runs, the same as every other card. */
/* How often the legend layer comes up, tuned so about a third of careers meet
   it at least once (NARRATIVE.md section 10). A legend card can only be dealt
   in a year the gate is open, seeded off the career and the year, so the
   layer arrives as a rare season rather than as a slow drip. */
/* 1.4 since the September, April and summer cards: thirty five more cards in
   the same slots took the share from 34% to 30%, and this puts it back. */
const LEGEND_W = 1.4;
const LEGEND_P = 0.09;
const legendOpen = (L) => rngAt(L, 'legend')() < LEGEND_P;
const O = (l, fx, s, more) => Object.assign({ l, fx, s }, more || {});
const STORY_EV = {}, STORY_NBA = {}, STORY_AM = {};
const ALT_NAME = { intl: 'Overseas year', gl: 'G League year', juco: 'Junior college', prep: 'Prep school year', gap: 'Gap year', rec: 'Rec league year' };
const AM_SLOTS = { hs: 1, hs_sum: 1, hs_off: 1, col: 1, col_pre: 1, col_mar: 1, col_off: 1, alt: 1 };
function runOpt(L, r, o) {
  let b = o;
  if (o.p != null && !ok(r, typeof o.p === 'function' ? o.p(L) : o.p)) {
    b = o.no || {};
    if (b.rel) for (const x of b.rel) relate(L, x[0], x[1], x[2]);
  }
  if (b.fx) bump(L, typeof b.fx === 'function' ? b.fx(L) : b.fx);
  for (const k of [].concat(b.set || [])) remember(L, k, true);
  if (b.start) arcStart.apply(null, [L].concat(b.start));
  if (b.go) arcGo.apply(null, [L].concat(b.go));
  if (b.end) arcEnd.apply(null, [L].concat(b.end));
  const t = b.do ? b.do(L, r) : null;
  if (b.log) logIt(L, typeof b.log === 'function' ? b.log(L) : b.log, b.tone || 'good');
  return t || (typeof b.s === 'function' ? b.s(L) : b.s) || '';
}
function compileStory(id, sp, kind) {
  const phases = String(sp.at).split(' ');
  const am = phases.every((p) => AM_SLOTS[p]);
  const ev = {
    phases, req: Object.assign({ story: true }, sp.req || {}), when: sp.when, weight: (sp.w == null ? 2 : sp.w) * (sp.legend ? LEGEND_W : 1),
    rarity: sp.rar || 'common', once: true, legend: !!sp.legend, tags: sp.tags ? sp.tags.split(' ') : [],
    stage: am ? 'am' : phases[0] === 'post' ? 'post' : 'nba', cb: sp.cb, authored: true,
    title: sp.t, text: typeof sp.x === 'function' ? sp.x : () => sp.x,
    options: sp.o.map((o) => ({ label: o.l, run: (L, r) => runOpt(L, r, o) })),
  };
  EVENT_REL[id] = sp.o.map((o) => o.rel || []);
  return ev;
}
/* Random pool: dealt in its slots like any other card. */
function story(specs) {
  const pool = {};
  for (const id in specs) pool[id] = compileStory(id, specs[id]);
  defineEvents(pool, 'story');
  for (const id in pool) {
    const ev = pool[id];
    ev.pool = ev.stage === 'am' ? 'am' : 'nba';
    STORY_EV[id] = ev;
    if (ev.stage === 'am') STORY_AM[id] = ev; else if (ev.stage === 'nba') STORY_NBA[id] = ev;
  }
}
/* Arc nodes: dealt only when their arc is due, ahead of anything random. */
function storyArcs(specs) {
  const pool = {};
  for (const id in specs) { pool[id] = compileStory(id, specs[id]); pool[id].req = specs[id].req || null; }
  defineEvents(pool, 'arc');
  for (const id in pool) ARC_EVENTS[id] = pool[id];
}
/* Fixed cards: dealt by name at one moment (an epilogue, the halftime shot). */
function storyFixed(specs) {
  const pool = {};
  for (const id in specs) pool[id] = compileStory(id, specs[id]);
  defineEvents(pool, 'story');
  for (const id in pool) { pool[id].pool = 'post'; STORY_EV[id] = pool[id]; }
}
const evById = (id) => EVENTS[id] || AM_EVENTS[id] || ARC_EVENTS[id] || STORY_EV[id];
/* Deal one named card now, if it is open. */
function dealNamed(L, slot, id) {
  const ev = evById(id);
  if (!ev) return false;
  dealCard(L, slot, ev);
  if (storyOn(L)) (evSeen(L)[id] = evSeen(L)[id] || []).push(L.year);
  return true;
}

/* The new prerequisites a route, an origin or a career shape is read off. */
const amOf = (L) => L.am || {};
Object.assign(REQ, {
  origin: (L, v) => [].concat(v).indexOf(L.origin) >= 0,
  route: (L, v) => [].concat(v).some((k) => !!recall(L, 'route.' + k)),
  notRoute: (L, v) => [].concat(v).every((k) => !recall(L, 'route.' + k)),
  level: (L, v) => isAm(L) && [].concat(v).indexOf(amOf(L).level) >= 0,
  grade: (L, r) => !!L.am && inRange(L.am.grade || 0, r),
  cyear: (L, r) => !!L.am && inRange(L.am.cyear || 0, r),
  rank: (L, r) => !!L.am && !!L.am.rank && inRange(L.am.rank, r),
  tier: (L, v) => !!(L.am && L.am.college && SCHOOL_BY[L.am.college]) && [].concat(v).indexOf(SCHOOL_BY[L.am.college].tier) >= 0,
  pick: (L, r) => inRange(L.draft ? (L.draft.pick || 61) : 61, r),
  rings: (L, r) => inRange(totals(L).rings, r),
  stars: (L, r) => inRange(totals(L).star, r),
  clubs: (L, r) => inRange(new Set(L.history.map((h) => h.t)).size, r),
  yearsHere: (L, r) => inRange(L.history.filter((h) => h.t === L.team).length, r),
  pro: (L, v) => [].concat(v).every((k) => routeOn(L, k)),
  persona: (L, v) => [].concat(v).indexOf(personaOf(L)) >= 0,
  kids: (L, r) => inRange(lifeOf(L).kids || 0, r),
  known: (L, a) => a.every((k) => !!(L.traits && L.traits[k] && L.traits[k].known)),
  big: (L, v) => !!BIG_MARKET[L.team] === v,
  net: (L, r) => !!L.team && inRange(clubNet(L, L.team), r),
  legendOn: (L, v) => !!(L.opt && L.opt.legend) === v,
  drafted: (L, v) => !!(L.draft && L.draft.pick) === v,
  arc: (L, a) => a.every((k) => !!(L.arcs && L.arcs[k])),
  notArc: (L, a) => a.every((k) => !(L.arcs && L.arcs[k])),
  arcDone: (L, a) => a.every((k) => !!(L.arcs && L.arcs[k] && L.arcs[k].done)),
});

// ─── origins ────────────────────────────────────────────────────────────────

/* WHERE YOU ARE FROM (NARRATIVE.md section 4). Chosen at creation, or rolled
   off the seed. It tilts the ratings a little, gives the career a trait it
   always has, and opens three or four cards no other origin sees. */
const ORIGINS = {
  small_town: { name: 'Small-town unknown', blurb: 'One stoplight. One gym. Nobody is watching yet.', tilt: { iq: 2 }, fame: -3, trait: 'loyal' },
  big_city: { name: 'Big-city prodigy', blurb: 'Famous at fourteen. Every park knows your name.', tilt: { fin: 2 }, fame: 6, trait: 'showman' },
  pro_son: { name: 'Son of a former pro', blurb: 'Your father played nine seasons. You hear about it.', tilt: { iq: 3 }, fame: 4, trait: 'filmJunkie' },
  growth: { name: 'Late growth spurt', blurb: 'A guard until last summer. Then six inches.', tilt: { pla: 2, reb: 2 } },
  intl: { name: 'International prospect', blurb: 'Grew up abroad. Came over at fifteen.', tilt: { iq: 2, pla: 2 } },
  prep: { name: 'Prep school transfer', blurb: 'Left home for a boarding school with a real gym.', tilt: { iq: 1, sho: 1 } },
  multi: { name: 'Multi-sport athlete', blurb: 'Quarterback in the fall. Shortstop in the spring.', tilt: { ath: 3 } },
  walkon: { name: 'Overlooked', blurb: 'Cut from varsity once. Still in the gym every night.', tilt: { def: 2 }, fame: -3, trait: 'gymRat' },
};
const ORIGIN_KEYS = Object.keys(ORIGINS);
const ABROAD = ['Kaunas', 'Belgrade', 'Lyon', 'Lagos', 'Melbourne', 'Ljubljana', 'Valencia', 'Istanbul'];
function setOrigin(L, key) {
  const k = ORIGINS[key] ? key : pick(E.createSeededRNG(E.hashSeed(L.seed + ':origin')), ORIGIN_KEYS);
  const o = ORIGINS[k];
  L.origin = k;
  for (const r in o.tilt) L.rt[r] = clamp(L.rt[r] + o.tilt[r], 25, 88);
  if (o.fame) L.m.fame = clamp(L.m.fame + o.fame, 0, 100);
  if (o.trait && L.traits[o.trait]) L.traits[o.trait].has = true;
  const rng = E.createSeededRNG(E.hashSeed(L.seed + ':originx'));
  if (k === 'pro_son') remember(L, 'origin.father', 6000 + Math.round(rng() * 9000));
  if (k === 'intl') remember(L, 'origin.abroad', pick(rng, ABROAD));
}

// ─── routes ─────────────────────────────────────────────────────────────────

/* A ROUTE IS RECOGNIZED, not chosen from a list (NARRATIVE.md section 5). The
   roads to the pros are remembered as `route.<id>` at the moment they are
   taken; the roads through the pros are read off what the career did. Each
   one opens its own cards. */
const ROUTES = {
  oad: ['One and done', 'pre'], four: ['Four-year college star', 'pre'], midmajor: ['Mid-major', 'pre'],
  portal: ['Transfer portal', 'pre'], juco: ['Junior college', 'pre'], walkon: ['Walk-on', 'pre'],
  gl: ['G League pathway', 'pre'], intl: ['Overseas pro at 18', 'pre'], gap: ['Gap year', 'pre'],
  prep: ['Prep school year', 'pre'], reclass: ['Reclassified', 'pre'], rec: ['Rec league discovery', 'pre'],
  undrafted: ['Undrafted free agent', 'pre'], stash: ['Draft and stash', 'pre'],
  savior: ['Lottery savior', 'pro'], bust: ['Bust who rebuilds', 'pro'], rise: ['Role player to star', 'pro'],
  sixth: ['Sixth man', 'pro'], stopper: ['Defensive stopper', 'pro'], journey: ['Journeyman', 'pro'],
  detour: ['Overseas detour and return', 'pro'], lifer: ['Franchise lifer', 'pro'], ringchase: ['Ring chaser', 'pro'],
  small: ['Small-market hero', 'pro'], big: ['Big-market celebrity', 'pro'], vet: ['Player-coach veteran', 'pro'],
  superteam: ['Superteam builder', 'pro'],
};
function routeOn(L, id) {
  if (recall(L, 'route.' + id)) return true;
  const H = L.history, d = L.draft || {};
  switch (id) {
    case 'savior': return !!d.pick && d.pick <= 5 && (d.net == null ? false : d.net <= -2) && H.length >= 3;
    case 'bust': return !!d.pick && d.pick <= 14 && H.length >= 3 && H[2].ovr < 67;
    case 'rise': return (!d.pick || d.pick >= 21) && H.some((h) => (h.aw || []).indexOf('star') >= 0);
    case 'sixth': return H.some((h) => (h.aw || []).indexOf('6moy') >= 0) || H.filter((h) => h.role === 'Sixth man').length >= 3;
    case 'stopper': return H.filter((h) => (h.aw || []).some((a) => a === 'dpoy' || a === 'ad1' || a === 'ad2')).length >= 2;
    case 'journey': return new Set(H.map((h) => h.t)).size >= 5;
    case 'detour': return !!recall(L, 'route.detour.left') && H.some((h) => h.y > recall(L, 'route.detour.left').y);
    case 'lifer': return H.length >= 10 && new Set(H.map((h) => h.t)).size === 1;
    case 'small': { const n = H.filter((h) => !BIG_MARKET[h.t]).length; return n >= 8 && n >= H.length * 0.8; }
    case 'big': return H.filter((h) => BIG_MARKET[h.t]).length >= 5;
    case 'vet': return !!recall(L, 'route.vet') || (L.age >= 34 && !!(L.traits.lockerVoice && L.traits.lockerVoice.known));
    case 'superteam': return !!recall(L, 'arc.costar.landed');
    default: return false;
  }
}
const routesOf = (L) => Object.keys(ROUTES).filter((k) => routeOn(L, k));

// ─── endings ────────────────────────────────────────────────────────────────

/* AN ENDING IS A HALL TIER, WHAT THE CAREER WAS, AND SOMETIMES A SECRET
   (NARRATIVE.md section 8). The tier comes off the legacy score and a vote
   seeded off the career, so a reload never changes it. */
const HOF_TIERS = {
  hof_first: 'First ballot Hall of Famer', hof_eventual: 'Hall of Famer, in time', hof_debate: 'Voted in after a debate',
  hof_snub: 'Snubbed by the Hall', hof_committee: 'In through the veterans committee', hof_none: 'Not a Hall of Famer',
};
const OUTCOMES = {
  lo_goat: 'In the GOAT debate', lo_statue: 'One-team legend, statue outside', lo_jersey: 'Number in the rafters',
  lo_ringless: 'The ringless great', lo_playoff_hero: 'Playoff hero', lo_cult_hero: 'Journeyman cult hero',
  lo_cut_short: 'What could have been', lo_bust: 'The bust', lo_redemption: 'The redemption story',
  lo_villain: 'The villain who was right', lo_elder: 'Beloved elder statesman', lo_sixth: 'The great sixth man',
  lo_stopper: 'The stopper', lo_overseas: 'A cup of coffee, then a legend abroad', lo_never: 'Never made the league',
  lo_glue: 'The glue guy with the rings', lo_hometown: 'Hometown hero', lo_superteam: 'The one who built it',
};
const SECRETS = {
  sx_full_circle: 'Full circle', sx_father_son: 'Passed the old man', sx_curse: 'The curse breaker',
  sx_dre: 'Two kids from camp', sx_ellis: 'The student', sx_apex: 'The one who came back',
  sx_town: 'The gym has your name', sx_mascot: 'The mascot\'s best friend', sx_comeback: 'Fifty and still splashing',
  sx_undrafted: 'Sixty names, not his',
};
const ENDING_COUNT = () => Object.keys(HOF_TIERS).length + Object.keys(OUTCOMES).length + Object.keys(SECRETS).length;
function hofTier(L, score, T) {
  const r = E.createSeededRNG(E.hashSeed(L.seed + ':hof'));
  const vote = r(), later = r();
  if (score >= HOF_AT[0]) return 'hof_first';
  if (score >= HOF_AT[1]) return 'hof_eventual';
  if (score >= HOF_AT[2]) {
    if (vote < 0.5) return 'hof_debate';
    return (T.rings || recall(L, 'record.broken')) && later < 0.45 ? 'hof_committee' : 'hof_snub';
  }
  return 'hof_none';
}
const HOF_AT = [95, 60, 44];
const GOAT_AT = 158;
const hofIn = (tier) => tier === 'hof_first' || tier === 'hof_eventual' || tier === 'hof_debate' || tier === 'hof_committee';
function outcomesOf(L, T, score, tier, jersey) {
  const H = L.history, out = [];
  if (!H.length) {
    out.push((L.flags.overseasYears || 0) >= 2 ? 'lo_overseas' : 'lo_never');
    return out;
  }
  const clubs = new Set(H.map((h) => h.t)).size;
  const peak = Math.max.apply(null, H.map((h) => h.ovr));
  const d = L.draft || {};
  const inj = recall(L, 'inj.major');
  const p = personaOf(L);
  if (score >= GOAT_AT || (T.mvp >= 3 && T.rings >= 4)) out.push('lo_goat');
  if (routeOn(L, 'lifer') && hofIn(tier)) out.push('lo_statue');
  else if (jersey) out.push('lo_jersey');
  if (hofIn(tier) && !T.rings) out.push('lo_ringless');
  if (T.fmvp && (L.flags.g7 || 0) + (L.flags.buzzer || 0) + (L.flags.stops || 0) + (L.flags.ftIce || 0) >= 2) out.push('lo_playoff_hero');
  if (clubs >= 5 && (L.m.fame >= 40 || repOf(L).fans >= 60)) out.push('lo_cult_hero');
  if (inj && L.age <= 31 && peak >= 74 && !hofIn(tier)) out.push('lo_cut_short');
  if (d.pick && d.pick <= 14 && peak < 74) out.push('lo_bust');
  if (routeOn(L, 'bust') && (T.star || T.rings)) out.push('lo_redemption');
  if ((p === 'Villain' || p === 'Loose cannon' || p === 'Showman') && T.rings >= 1) out.push('lo_villain');
  if (routeOn(L, 'vet') && (p === "Pro's pro" || p === 'Face of the league' || p === 'Quiet assassin')) out.push('lo_elder');
  if (H.some((h) => (h.aw || []).indexOf('6moy') >= 0) || H.filter((h) => h.role === 'Sixth man').length >= 3) out.push('lo_sixth');
  if (T.dpoy >= 2) out.push('lo_stopper');
  if ((L.flags.overseasYears || 0) >= 2 && H.length <= 4) out.push('lo_overseas');
  if (T.rings >= 3 && !T.star) out.push('lo_glue');
  const home = homeClub(L);
  if (home && H.filter((h) => h.t === home).length >= Math.max(5, H.length / 2)) out.push('lo_hometown');
  if (routeOn(L, 'superteam') && T.rings) out.push('lo_superteam');
  return out;
}
function secretOf(L, T, tier, jersey) {
  const H = L.history, d = L.draft || {};
  const fam = (k) => !!recall(L, k);
  if (fam('legend.halftime.made') && hofIn(tier)) return 'sx_comeback';
  if (fam('arc.curse.broken')) return 'sx_curse';
  if ((fam('arc.apex.won') || fam('arc.apex.villain')) && T.rings) return 'sx_apex';
  if ((fam('arc.ellis.move') || fam('arc.ellis.hello')) && T.fmvp) return 'sx_ellis';
  if (L.origin === 'walkon' && tier === 'hof_first' && jersey) return 'sx_full_circle';
  if (L.origin === 'pro_son' && fam('origin.passed') && tier === 'hof_first') return 'sx_father_son';
  if (L.origin === 'small_town' && fam('town.stayed') && hofIn(tier)) return 'sx_town';
  if (fam('arc.camp.friends') && hofIn(tier) && L.rival && (L.rival.star >= 3 || L.rival.mvp)) return 'sx_dre';
  if (fam('arc.mascot.friends') && jersey && tier === 'hof_first') return 'sx_mascot';
  if (!d.pick && H.length && T.star) return 'sx_undrafted';
  return null;
}
function endingOf(L, T, score, jersey) {
  const tier = H_TIER(L, score, T);
  const outs = outcomesOf(L, T, score, tier, jersey);
  const sx = secretOf(L, T, tier, jersey);
  return {
    tier, tierName: HOF_TIERS[tier], hof: hofIn(tier), outcomes: outs, names: outs.map((k) => OUTCOMES[k]),
    secret: sx, secretName: sx ? SECRETS[sx] : null, routes: routesOf(L).map((k) => ROUTES[k][0]),
  };
}
const H_TIER = (L, score, T) => L.history.length ? hofTier(L, score, T) : 'hof_none';

// ─── after basketball ───────────────────────────────────────────────────────

/* THE EPILOGUE (NARRATIVE.md section 8.4). The after card offers the paths
   this career has earned, then a short chapter is played and the career is
   over only once that is answered. */
const AFTER_PATHS = [
  ['head_coach', 'Head coach', 'A bench of your own.', (L) => L.rt.iq >= 70 || trait(L, 'coachable') || !!recall(L, 'v.coachy')],
  ['assistant', 'Assistant coach', 'Start in the film room. Work up.', () => true],
  ['gm', 'Front office', 'Build a team the way you wanted one.', (L) => L.rt.iq >= 66 || !!recall(L, 'arc.venture.won')],
  ['owner', 'Buy into a team', 'An ownership group wants your name and money.', (L) => L.cash >= 25],
  ['broadcast', 'Television', 'A desk, a suit, a microphone.', (L) => L.m.fame >= 45 || !!recall(L, 'media.pod')],
  ['league', 'League office', 'Rules, schedules, the players\' side.', (L) => !!recall(L, 'union.role')],
  ['college', 'Coach your old school', 'The campus never forgot you.', (L) => !!(L.amHist && L.amHist.some((h) => h.lvl === 'NCAA'))],
  ['hs', 'Coach high school at home', 'The gym where it started.', (L) => !!L.am || L.origin === 'small_town' || trait(L, 'loyal')],
  ['business', 'Business', 'Make the money work for you.', (L) => L.cash >= 6],
  ['actor', 'Hollywood', 'Your agent has a script.', (L) => !!recall(L, 'ent.movie') || L.m.fame >= 70],
  ['politics', 'Run for office', 'The city council seat at home is open.', (L) => L.m.fame >= 55 && !!recall(L, 'foundation')],
  ['podcast', 'The podcast', 'Three microphones and no filter.', (L) => !!recall(L, 'media.pod') || L.m.fame >= 50],
  ['comeback', 'One more comeback', 'You are not done. Probably.', (L) => L.age <= 37 && ovrOf(L) >= 64],
  ['family', 'Go home', 'Your family. Your town. Nothing to prove.', () => true],
];
function storyAfterCard(L) {
  const rng = E.createSeededRNG(E.hashSeed(L.seed + ':after'));
  const open = AFTER_PATHS.filter((p) => p[0] !== 'family' && p[3](L)).sort(() => rng() - 0.5).slice(0, 4);
  open.push(AFTER_PATHS[AFTER_PATHS.length - 1]);
  return {
    id: 'after', kind: 'event', key: 'after', eyebrow: 'After basketball', title: 'What comes next?',
    text: 'You are ' + L.age + '. You have ' + money(L.cash) + ' in the bank and the rest of your life.',
    ctx: { paths: open.map((p) => p[0]) },
    options: open.map((p) => ({ label: p[1], hint: p[2] })),
  };
}
/* The career ends here, after the epilogue and, rarely, one last shot. */
function finishLife(L, text) {
  if (L.final && text) { L.final.epilogue = say(L, text); L.final.after = L.final.epilogue; }
  if (storyOn(L) && L.opt.legend && !recall(L, 'legend.halftime') && L.history.length >= 6
    && rngAt(L, 'halftime')() < 0.04 && dealNamed(L, 'post', 'lg_one_more_shot')) return;
  L.retired = true;
  L.phase = 'retired';
  if (L.final) {
    const T = totals(L);
    L.final.ending = endingOf(L, T, L.final.score, L.final.jersey);
  }
}

// ── origins (NARRATIVE.md 7.1) ──

story({
  /* Small-town unknown */
  ori_town_paper: { at: 'hs_sum hs', req: { origin: 'small_town', grade: [10, 11] }, w: 4,
    t: 'The town paper wants a story.', x: 'The {town} weekly has never covered a sophomore. They want a photo at the county gym.',
    o: [O('Give the interview', { fame: 4, morale: 3 }, 'Front page, above the fold. Your mom buys twenty copies.', { set: 'town.paper', rel: [['hscoach', 10, 'You made the paper.']] }),
      O('Let the season talk', { eth: 3 }, 'They run a box score instead. You like it better.')] },
  ori_county_gym: { at: 'hs', req: { origin: 'small_town' }, w: 3,
    t: 'The janitor gives you a key.', x: 'The county gym opens at five if you have the key. Now you do.',
    o: [O('Be there at five', { sho: 2, def: 1, health: -4 }, 'Three hundred shots before school. Every day. It shows by March.'),
      O('Sleep until seven', { health: 4, morale: 3 }, 'You keep the key on your ring anyway.')] },
  ori_scout_lost: { at: 'hs_sum', req: { origin: 'small_town', mem: ['town.paper'] }, w: 4,
    t: 'A showcase two states away.', x: 'Every scout who matters will be there. The town game is the same weekend.',
    o: [O('Drive to the showcase', { fame: 6, cash: -0.02 }, 'Nine hours each way. A scout writes your name down twice.', { do: (L) => { if (L.am) L.am.rstock = (L.am.rstock || 0) + 0.7; } }),
      O('Stay for the town game', { morale: 6 }, 'The whole town comes. You score 31. Nobody here forgets it.', { set: 'town.stayed' })] },
  ori_town_return: { at: 'off', req: { origin: 'small_town', seasons: [3, null] }, w: 3, rar: 'uncommon',
    t: 'The town wants you back for a day.', x: 'They are naming the county gym for somebody. They hope it is you.',
    o: [O('Go home for it', { morale: 8, fame: 2 }, 'Your name goes up over the door. The key still works.', { set: 'town.gym', rel: [['hscoach', 20, 'The gym has your name now.']] }),
      O('Send a check and a video', { cash: -0.3, morale: 2 }, 'They name it anyway. You watch the video of it twice.')] },

  /* Big-city prodigy */
  ori_mixtape_famous: { at: 'hs_sum hs', req: { origin: 'big_city', grade: [10, 10] }, w: 5,
    t: 'Your mixtape has a million views.', x: 'You are fifteen. Strangers at the park call your name.',
    o: [O('Post another one', { fame: 8, morale: 4 }, 'Two million. Grown men want to guard you at the park.', { set: 'city.mixtape' }),
      O('Go quiet until the season', { trust: 4, eth: 3 }, 'The views keep climbing anyway. You stay in the gym.')] },
  ori_city_rivalry: { at: 'hs', req: { origin: 'big_city' }, w: 3,
    t: 'The crosstown school calls.', x: 'Their coach wants you to transfer. Better gym, better schedule, a television game.',
    o: [O('Transfer', { fame: 5, trust: -4 }, 'Half your neighborhood stops talking to you. The other half buys tickets.', { set: 'city.switched', rel: [['hscoach', -25, 'You left for the crosstown school.']] }),
      O('Stay with your guys', { morale: 6, trust: 6 }, 'You beat them twice that season. It feels better than a TV game.', { rel: [['hscoach', 15, 'You stayed.']] })] },
  ori_runner_offer: { at: 'hs_off', req: { origin: 'big_city', mem: ['city.mixtape'], grade: [11, 12] }, w: 4, rar: 'uncommon',
    t: 'A man in a nice car wants to help.', x: 'He calls himself an uncle. He has an envelope and a school in mind.',
    o: [O('Take the envelope', { cash: 0.05, morale: -2 }, 'It feels like a loan you never agreed to.', { set: 'city.runner', p: 0.7, no: { fx: { fame: -6, trust: -6 }, s: 'Somebody saw. A booster investigation follows your name for a year.', set: 'city.runner' } }),
      O('Hand it back', { morale: 4 }, 'He smiles like he has heard no before. He does not call again.', { rel: [['mom', 15, 'You turned down the envelope.']] })] },
  ori_city_mural: { at: 'off', req: { origin: 'big_city', stars: [1, null] }, w: 4,
    t: 'The city wants to paint you.', x: 'A mural on the side of the corner store where you grew up. Forty feet tall.',
    o: [O('Pose for it', { fame: 5, morale: 6 }, 'Forty feet of you, ball on your hip. Kids take pictures with it every day.', { set: 'city.mural' }),
      O('Ask them to paint the park instead', { morale: 4, trust: 2 }, 'New rims and new paint. The park is full every night.')] },

  /* Son of a former pro */
  ori_fathers_number: { at: 'hs_sum', req: { origin: 'pro_son', grade: [10, 10] }, w: 6,
    t: 'Wear his number?', x: (L) => '{father} wore ' + (L.parent && L.parent.num != null ? '#' + L.parent.num : 'it') + ' for ' + yearsWord(fatherYears(L)) + '. Everybody in the gym knows that.',
    o: [O('Wear his number', { fame: 5, morale: -2 }, 'Every coach in the stands says his name before yours.', { set: 'son.number', do: (L) => { if (L.parent && L.parent.num != null) L.num = L.parent.num; } }),
      O('Pick your own', { morale: 5 }, 'He laughs and says he would have done the same.', { rel: [['dad', 10, 'You picked your own number.']] })] },
  ori_fathers_coach: { at: 'hs_off', req: { origin: 'pro_son', grade: [11, 12] }, w: 4,
    t: 'Your father\'s old coach calls.', x: 'He coaches a college now. He says he owes your father one.',
    o: [O('Hear him out', { trust: 4, morale: 2 }, 'He talks about your father for an hour. Then about you for ten minutes.'),
      O('Tell him you want your own road', { morale: 5, eth: 2 }, 'Your father hears about it. He is quiet for a day. Then proud.', { set: 'son.ownway', rel: [['dad', -5]] })] },
  ori_father_courtside: { at: 'pre', req: { origin: 'pro_son', seasons: [1, 2] }, w: 5,
    t: '{father} wants a seat behind the bench.', x: (L) => 'Opening night. He played in this league for ' + yearsWord(fatherYears(L)) + '. He has never sat behind your bench.',
    o: [O('Get him the seat', { morale: 6, fame: 2 }, 'The broadcast finds him twice. He cries both times.', { rel: [['dad', 20, 'He sat behind your bench on opening night.']] }),
      O('Ask him to watch at home', { morale: 2, trust: 2 }, 'He understands. He texts you after every quarter.')] },
  ori_passed_father: { at: 'off', when: (L) => L.origin === 'pro_son' && !recall(L, 'origin.passed') && totals(L).pts > ((recall(L, 'origin.father') || {}).v || 9e9), w: 9,
    t: 'You passed your father.', x: (L) => 'Career points: ' + totals(L).pts + '. {father} finished with ' + recall(L, 'origin.father').v + '.',
    o: [O('Call him first', { morale: 10 }, 'He answers on the first ring. He already knew. He had been counting.', { set: 'origin.passed', rel: [['dad', 25, 'You passed his career points and called him first.']] }),
      O('Say nothing', { fame: 3 }, '{beat} writes it up anyway. Your father frames the column.', { set: 'origin.passed' })] },

  /* A legacy career (Phase E): the father is a career this account played. */
  leg_rafters: { at: 'pre', req: { seasons: [1, 3] }, when: (L) => !!(L.parent && L.parent.jersey && L.team === L.parent.jersey), w: 9,
    t: 'His number is in the rafters.', x: (L) => '{father}\'s #' + L.parent.num + ' hangs over the floor you play on now.',
    o: [O('Look up at it every night', { morale: 5, fame: 2 }, 'Before every tip. Nobody on the team says a word about it.', { set: 'son.rafters' }),
      O('Never look up', { eth: 3, trust: 2 }, 'Eyes on the rim. You can feel it up there anyway.', { set: 'son.rafters' })] },
  leg_old_club: { at: 'pre', req: { seasons: [1, 2] }, when: (L) => !!(L.parent && L.team && L.parent.jersey !== L.team && L.parent.clubs.indexOf(L.team) >= 0), w: 8,
    t: 'Your father played here.', x: '{tvet} shows you a team photo in the hallway. Your father is in the second row.',
    o: [O('Send him a picture of it', { morale: 4 }, 'He sends back nine exclamation points.', { rel: [['dad', 10, 'You sent him the old team photo.']] }),
      O('Keep walking', { trust: 2 }, 'Nobody here needs a reminder. You make your own photo.')] },
  leg_compared: { at: 'off', req: { seasons: [1, 3] }, when: (L) => !!L.parent, w: 7,
    t: 'Everybody compares you to him.', x: '{critic} puts your numbers next to {father}\'s at the same age.',
    o: [O('Say you will pass him', { fame: 4, morale: -2 }, 'The clip goes everywhere. So does the pressure.', { set: 'son.vow' }),
      O('Say there is only one of him', { trust: 3, morale: 3 }, 'Your father calls that night. He liked that answer.', { rel: [['dad', 12, 'You said there is only one of him.']] })] },
  leg_hall_night: { at: 'off', req: { seasons: [2, 12] }, when: (L) => !!(L.parent && L.parent.hof), w: 4,
    t: 'They want you at his Hall night.', x: 'The Hall is showing a film about {father}. They ask you to speak.',
    o: [O('Speak', { fame: 5, morale: 6 }, 'You keep it short. The room stands anyway.', { rel: [['dad', 15, 'You spoke at his Hall night.']] }),
      O('Sit with him and listen', { morale: 4 }, 'He holds your hand the whole film. He has never done that.')] },

  /* Late growth spurt */
  ori_six_inches: { at: 'hs_sum', req: { origin: 'growth', grade: [10, 11] }, w: 6,
    t: 'You grew six inches.', x: 'Nothing fits. You get moved under the basket. You still think like a guard.',
    o: [O('Keep playing guard', { pla: 2, sho: 1 }, 'A guard who can see over everybody. Scouts start asking questions.', { set: 'growth.guard' }),
      O('Move inside', { reb: 3, def: 2, pla: -1 }, 'You learn the post in a month. You miss the ball in your hands.', { set: 'growth.big' })] },
  ori_clumsy_year: { at: 'hs', req: { origin: 'growth' }, w: 4,
    t: 'Your body does not know itself.', x: 'You trip over the baseline in warmups. Twice.',
    o: [O('Yoga and footwork, every day', { ath: 2, health: 2 }, 'By spring you move like you were always this tall.'),
      O('Play through it', { health: -5, morale: -2 }, 'Your knees ache all season. It passes. Mostly.')] },
  ori_new_position: { at: 'col col_pre', req: { origin: 'growth' }, w: 3,
    t: 'The coaches want to move you.', x: 'One more position over. They say your height is wasted where you are.',
    o: [O('Embrace it', { reb: 2, def: 1, trust: 6 }, 'It takes a month. Then it takes over the conference.'),
      O('Fight to stay', { morale: 3, trust: -5 }, 'You keep the spot. The coaches keep asking.')] },
  ori_old_jersey: { at: 'off', req: { origin: 'growth', seasons: [4, null] }, w: 2,
    t: 'Your mom finds your eighth grade jersey.', x: 'It would not fit your arm now.',
    o: [O('Frame it', { morale: 5 }, 'It goes up in the hallway. Guests do not believe it is yours.'),
      O('Give it to a kid at camp', { morale: 4, fame: 1 }, 'He wears it to every practice. It fits him fine.')] },

  /* International prospect */
  ori_u17: { at: 'hs_sum', req: { origin: 'intl', grade: [10, 11] }, w: 5,
    t: 'The under-17 national team calls.', x: 'A summer tournament for the country you grew up in. {abroad} would watch on TV.',
    o: [O('Play for them', { fame: 5, health: -4, iq: 2 }, 'You lead the tournament in assists. Home watches every game.', { set: 'intl.u17' }),
      O('Stay and train', { sho: 2, def: 1 }, 'You watch on a laptop. It is harder than you thought.')] },
  ori_language: { at: 'hs col', req: { origin: 'intl' }, w: 3,
    t: 'The playbook is a second language.', x: 'You know every play. In a timeout, the English comes too fast to follow.',
    o: [O('A tutor every night', { iq: 2, morale: -2 }, 'By February you joke with your teammates. In English.'),
      O('Let the game talk', { morale: 3 }, 'You learn the word for every action anyway. It is enough.')] },
  ori_homesick: { at: 'early', req: { origin: 'intl', seasons: [0, 0] }, w: 4,
    t: 'December is long this far from home.', x: 'The food is wrong. The time difference means calls at midnight.',
    o: [O('Fly your family over', { cash: -0.1, morale: 8 }, 'Your mother cooks for the whole team. The vets adopt you.', { rel: [['mom', 15, 'She flew over in your rookie December.']] }),
      O('Tough it out', { morale: -4, eth: 3 }, 'You find a restaurant that gets it almost right. You go every Sunday.')] },
  ori_federation: { at: 'off', req: { origin: 'intl', seasons: [3, null] }, w: 3, rar: 'uncommon',
    t: 'The national federation wants your summer.', x: 'A qualifying window. They say the country needs you.',
    o: [O('Play every summer', { fame: 5, health: -6 }, '{abroad} throws you a parade. Your knees file a complaint.', { set: 'intl.flag' }),
      O('Skip this window', { health: 6 }, 'The federation president says something sharp to the papers. It blows over.', { set: 'intl.fedfeud' })] },

  /* Prep school transfer */
  ori_prep_dorm: { at: 'hs_sum', req: { origin: 'prep', grade: [10, 10] }, w: 6,
    t: 'Your roommate has a trust fund.', x: 'His father owns buildings. You own two pairs of shoes.',
    o: [O('Get to know him', { morale: 3, iq: 1 }, 'He is better company than you expected. His father asks about you.', { set: 'prep.roommate' }),
      O('Ask for a single', { iq: 2, morale: -2 }, 'A room the size of a closet. You study a lot.')] },
  ori_prep_investor: { at: 'off', req: { origin: 'prep', mem: ['prep.roommate'], seasons: [2, null] }, w: 4, rar: 'uncommon',
    t: 'Your old roommate\'s father calls.', x: 'He wants to put money behind something with your name on it.',
    o: [O('Take the meeting', { cash: 0.4, morale: 3 }, 'A clean deal with a lawyer in the room. It grows every year.', { set: 'arc.venture.won' }),
      O('Keep it friendly', { morale: 2 }, 'He sends a fruit basket every Christmas anyway.')] },
  ori_hometown_resent: { at: 'off', req: { origin: 'prep', seasons: [1, null] }, w: 3,
    t: 'Home says you forgot it.', x: 'A radio host back home calls you the one who left at fourteen.',
    o: [O('Run a camp back home', { morale: 6, cash: -0.1 }, 'Three hundred kids. The radio host brings his son.', { set: 'prep.home' }),
      O('Let it go', { morale: -3 }, 'It stings more than you say.')] },

  /* Multi-sport athlete */
  ori_two_sport: { at: 'hs_sum', req: { origin: 'multi', grade: [10, 11] }, w: 6,
    t: 'Football or basketball?', x: 'The football coach says you could start at quarterback. The basketball coach says nothing. He just looks at you.',
    o: [O('Basketball only', { sho: 2, pla: 1 }, 'The football coach does not talk to you in the hallway for a month.'),
      O('Both', { ath: 2, health: -6, fame: 3 }, 'Friday nights and Saturday mornings. You are tired and very good at two things.', { set: 'multi.both' })] },
  ori_draft_mlb: { at: 'predraft', req: { origin: 'multi' }, w: 6,
    t: 'A baseball team drafts you anyway.', x: 'Twentieth round. A scout says the offer stands if basketball does not work.',
    o: [O('Tell them no, for good', { morale: 4, trust: 2 }, 'You hang the jersey they sent in your closet. It stays there.'),
      O('Keep the door open', { morale: 2 }, '{agent} files the letter. Just in case.', { set: 'multi.mlb' })] },
  ori_football_coach: { at: 'off', req: { origin: 'multi', seasons: [2, null] }, w: 3, rar: 'uncommon',
    t: 'A football coach wants a tryout.', x: 'He has seen your high school film. He thinks you are wasting a gift.',
    o: [O('Laugh and decline', { morale: 3 }, 'You send him a signed ball. A basketball.'),
      O('Throw for him once', { fame: 6, health: -3 }, 'Sixty yards on a line. The clip runs for a week.', { set: 'multi.throw' })] },

  /* Overlooked walk-on type */
  ori_cut_varsity: { at: 'hs_sum', req: { origin: 'walkon', grade: [10, 10] }, w: 6,
    t: 'Cut from varsity.', x: 'Freshman year. Your name was not on the list taped to the door.',
    o: [O('Ask {hscoach:last} why', { iq: 2, trust: 6 }, 'He tells you. You fix every word of it by the next tryout.', { set: 'walkon.asked', rel: [['hscoach', 15, 'You asked him why he cut you.']] }),
      O('Just outwork everybody', { def: 2, eth: 4 }, 'You make the team the next year. Nobody outworks you.')] },
  ori_managers_job: { at: 'col_pre', req: { origin: 'walkon', cyear: [1, 1] }, w: 5,
    t: 'They need a manager.', x: 'Towels, water, rebounding for the starters. It gets you in the gym every day.',
    o: [O('Take it', { def: 2, iq: 2, morale: -2 }, 'You rebound for the stars all fall. You guard them in pickup.', { set: 'walkon.mgr' }),
      O('Keep your pride', { morale: 3 }, 'You find another gym. It is a worse gym.')] },
  ori_jersey_99: { at: 'off', req: { origin: 'walkon', seasons: [5, null] }, w: 3,
    t: 'Number ninety-nine.', x: 'The number nobody wanted when you arrived. Kids in the stands wear it now.',
    o: [O('Keep wearing it', { morale: 6, fame: 2 }, 'It sells more than any number on the roster.', { set: 'walkon.99' }),
      O('Give it to a rookie', { morale: 4, trust: 3 }, 'He asks why. You tell him the whole story.')] },
});

// ── high school and the summer circuit (NARRATIVE.md 7.2) ──

story({
  rv_meet: { at: 'hs_sum', req: { grade: [10, 11], rank: [1, 400] }, w: 5,
    t: 'A kid at camp will not stop talking.', x: '{dre}. Your age, your size, louder than both of you put together.',
    o: [O('Shake his hand', { morale: 3 }, 'He talks the whole handshake. You end up laughing.', { set: 'camp.met', start: ['camp', 'arc_camp_2', 'hs_sum', 1, { tone: 'friendly' }], rel: [['dre', 15, 'You met at camp and shook hands.']] }),
      O('Talk back', { fame: 2, morale: 2 }, 'The whole camp stops to watch. Neither of you backs down.', { set: 'camp.met', start: ['camp', 'arc_camp_2', 'hs_sum', 1, { tone: 'hot' }], rel: [['dre', -15, 'You traded trash talk at camp.']] })] },
  aau_two_brands: { at: 'hs_sum', req: { grade: [10, 11], rank: [1, 250] }, w: 4,
    t: 'Two shoe circuits want you.', x: '{aau} runs a team on one of them. The other team flies you to tournaments.',
    o: [O('Play for {aau}', { morale: 4, trust: 3 }, 'His gym smells like old sneakers. He knows every scout by name.', { set: 'aau.vickers', start: ['aau', 'arc_aau_2', 'hs_sum', 1], rel: [['aau', 20, 'You chose his team.']] }),
      O('Take the flights', { fame: 4 }, 'Hotels, team gear, a bigger stage. {aau} wishes you luck.', { set: 'aau.other', rel: [['aau', -5]] })] },
  nil_first_check: { at: 'hs_off', req: { rank: [1, 150], grade: [11, 12] }, w: 4,
    t: 'A car dealer wants you in an ad.', x: 'The biggest dealership in {town}. Thirty seconds and a check.',
    o: [O('Film it', { cash: 0.03, fame: 3 }, 'You point at a truck and smile. The whole school quotes it.', { set: 'nil.hs' }),
      O('Wait for college', { eth: 2 }, 'He says the offer stands. It does not, but that is fine.')] },
  visit_host: { at: 'hs_off', req: { grade: [11, 11], rank: [1, 300] }, w: 3, rar: 'uncommon',
    t: 'Your official visit host has plans.', x: 'A party off campus. He says every recruit goes.',
    o: [O('Go for an hour', { morale: 4 }, 'Somebody takes a photo. You do not think about it again.', { start: ['visit', 'arc_visit_2', 'hs_sum', 0] }),
      O('Back to the hotel', { trust: 3 }, 'You watch film with the coaches instead. They notice.')] },
  hs_dad_coach: { at: 'hs', req: { grade: [10, 12] }, w: 2,
    t: 'Your dad is coaching from the stands.', x: 'Every possession. The whole gym can hear him.',
    o: [O('Talk to him after', { morale: 3 }, 'He promises to sit quieter. He makes it a week.', { rel: [['dad', 5]] }),
      O('Tune it out', { iq: 1 }, 'You learn to hear only {hscoach:last}. It is a useful skill.')] },
  hs_ranking_drop: { at: 'hs_off', when: (L) => L.am && L.am.rank > 200 && L.am.grade >= 11, w: 3,
    t: 'You fell in the rankings.', x: 'A website moved you down. The comments are not kind.',
    o: [O('Read every comment', { morale: -5, eth: 4 }, 'You screenshot the worst one. It is your phone background now.'),
      O('Delete the app', { morale: 3 }, 'You go to the gym instead. It does more for you.')] },
  hs_first_dunk: { at: 'hs', when: (L) => L.rt.ath >= 55 && L.am && L.am.grade <= 11, w: 3,
    t: 'A breakaway with nobody back.', x: 'You have never dunked in a game. The student section knows it.',
    o: [O('Go up with two hands', { fame: 4, morale: 6 }, 'Rim rattling. Your phone has nine hundred notifications by morning.', { p: (L) => clamp(0.35 + (L.rt.ath - 55) * 0.03, 0.2, 0.9), no: { fx: { morale: -3 }, s: 'Off the back iron. The whole bench covers their faces. You laugh too.' } }),
      O('Lay it in', { trust: 2 }, 'Two points. {hscoach:last} nods. The students boo, a little.')] },
  hs_all_american: { at: 'hs_off', req: { grade: [12, 12], rank: [1, 30] }, w: 6,
    t: 'The Crown Classic.', x: 'The all-star game for the best seniors in the country. Every phone in America watches.',
    o: [O('Shoot your shot', { fame: 6 }, 'Twenty-two points and a crossover that goes around the internet.', { p: 0.55, no: { fx: { fame: 2 }, s: 'Four of fifteen. Somebody else wins MVP. It is still a great week.' } }),
      O('Make the right pass', { trust: 4, iq: 1 }, 'Eleven assists. The college coaches in the stands like that more.')] },
  hs_injury_senior: { at: 'hs', req: { grade: [12, 12] }, w: 2, rar: 'uncommon',
    t: 'Your ankle rolls in January.', x: 'Senior year. The trainer says two weeks if you rest it.',
    o: [O('Rest it', { health: 6 }, 'Two weeks on the bench. It hurts more than the ankle.', { set: 'inj.hs' }),
      O('Tape it and play', { health: -8, fame: 2 }, 'You play the rivalry game on one leg and win it.', { set: 'inj.hs' })] },
  hs_state_parade: { at: 'hs_off', when: (L) => L.season && L.season.tourney && L.season.tourney.champ, w: 9,
    t: 'The town throws a parade.', x: 'State champions. A fire truck, a marching band and every kid in {town}.',
    o: [O('Ride on the fire truck', { morale: 8, fame: 3 }, 'You throw candy for two miles. Your arm is sore for a week.', { set: 'hs.parade' }),
      O('Walk with the band', { morale: 6 }, 'You walk next to the drummers. It is the loudest day of your life.', { set: 'hs.parade' })] },
  hs_reclass_offer: { at: 'hs_off', when: (L) => L.am && L.am.grade === 11 && L.am.rank <= 45 && L.age <= 17, w: 5, rar: 'uncommon',
    t: 'You could skip senior year.', x: 'Your credits are done. Reclassify, and you are in college this fall. A year younger in the draft.',
    o: [O('Reclassify', { fame: 4 }, 'Paperwork, a summer course and a lot of goodbyes. You are a freshman in August.', { do: (L) => { remember(L, 'route.reclass', true); L.am.grade = 12; if (!L.am.college) L.pending.push(commitCard(L)); logIt(L, 'Reclassified to graduate a year early.', 'gold'); } }),
      O('Stay with your class', { morale: 4 }, 'One more year at home. Senior night with the guys you grew up with.')] },
  hs_grades_warning: { at: 'hs', when: (L) => L.am && L.am.grade >= 11 && L.rt.iq < 55, w: 3,
    t: 'One more bad test and you sit.', x: 'Chemistry. The eligibility letter is on {hscoach:last}\'s desk.',
    o: [O('Get a tutor', { iq: 2, morale: -2 }, 'Four nights a week with {tutor}. A B minus. You frame it.', { rel: [['mom', 10]] }),
      O('Cram the night before', { morale: 2 }, 'A C. Eligible. Barely.', { p: 0.6, no: { fx: { trust: -6, morale: -6 }, s: 'A D. You sit two games. The team loses both.' } })] },
  hs_coach_son2: { at: 'hs', when: (L) => L.am && L.am.grade === 10, w: 2,
    t: 'A senior wants your minutes.', x: 'He has waited three years. You are fifteen and starting.',
    o: [O('Earn them every day', { def: 1, eth: 3 }, 'He makes you better in practice. By February you are friends.'),
      O('Let {hscoach:last} sort it out', { morale: 2 }, 'He starts you. The senior does not talk to you until graduation.')] },

  // ── college (7.3) ──
  col_captain: { at: 'col_pre', req: { cyear: [3, 4] }, w: 4,
    t: 'The team votes you captain.', x: 'Fourteen votes. The fifteenth was yours, for somebody else.',
    o: [O('Lead out loud', { trust: 6, morale: 4 }, 'You run the huddles. The freshmen follow you everywhere.', { set: 'col.captain' }),
      O('Lead by example', { eth: 4, trust: 4 }, 'First in, last out. It works the same.', { set: 'col.captain' })] },
  col_senior_night: { at: 'col_mar', req: { cyear: [4, 4] }, w: 8,
    t: 'Senior night.', x: 'Four years at {school}. Your family walks you to center court.',
    o: [O('Give a speech', { morale: 8, fame: 3 }, 'You thank the managers by name. The arena loses it.', { set: 'col.senior' }),
      O('Just play', { morale: 6 }, 'Twenty-eight points. You leave the floor to a standing ovation.', { set: 'col.senior' })] },
  col_coach_yells: { at: 'col', w: 3,
    t: 'Film session. The clip is you.', x: 'The head coach runs it back five times. The room is silent.',
    o: [O('Take it', { trust: 6, def: 1 }, 'You never make that mistake again. He notices.'),
      O('Fire back', { trust: -8, morale: 3 }, 'Your teammates look at the floor. You sit the first half Saturday.')] },
  col_return_senior: { at: 'col_off', when: (L) => L.am && L.am.cyear === 3 && projectedPick(L, L.am.stock || 0) > 25, w: 4,
    t: 'The mocks have you in the second round.', x: 'One more year could change that. Or nothing could.',
    o: [O('Ask the staff what they hear', { iq: 1 }, 'They say come back. They would say that.'),
      O('Ask an agent, unofficially', { fame: 1 }, 'You are not supposed to talk to agents yet. You learn a lot anyway.')] },
  col_portal_new_coach: { at: 'col_pre', req: { route: 'portal' }, w: 6,
    t: 'A new coach, a new system.', x: 'Everything you knew is wrong here. Different sets, different words.',
    o: [O('Learn it all', { iq: 3, trust: 6 }, 'By November you are the one teaching it to freshmen.'),
      O('Play your way', { fame: 2, trust: -5 }, 'You score. He lets you. For now.')] },
  col_portal_old_team: { at: 'col', req: { route: 'portal' }, w: 6,
    t: 'Your old school is on the schedule.', x: 'Their fans have a sign with your face on it. It is not kind.',
    o: [O('Make them regret it', { fame: 4 }, 'Thirty points in their building. Their coach shakes your hand anyway.', { p: (L) => clamp(0.4 + (ovrOf(L) - 55) * 0.03, 0.2, 0.85), set: 'col.portalrevenge', no: { fx: { morale: -5 }, s: 'Five for nineteen. Their student section chants your name. Not nicely.' } }),
      O('Play it like any game', { trust: 4 }, 'A quiet sixteen points and a win. Better that way.')] },
  col_injury: { at: 'col', w: 2, rar: 'uncommon',
    t: 'Something pops in practice.', x: 'The trainer calls it a stress fracture. Six weeks, or a medical redshirt.',
    o: [O('Rehab and come back', { health: -6 }, 'Back for March. Not all the way.', { set: 'inj.col' }),
      O('Take the redshirt', { health: 15, iq: 2 }, 'A year to heal and learn. You come back stronger.', { set: ['inj.col', 'col.redshirt'] })] },
  walkon_practice_squad: { at: 'col_pre col', req: { route: 'walkon' }, w: 8,
    t: 'You guard the starters every day.', x: 'Scout team. You learn every opponent\'s plays and run them against your own team.',
    o: [O('Make every practice a game', { def: 3, eth: 3, health: -4 }, 'A starter shoves you after a charge. The staff smiles.', { start: ['walkon', 'arc_walkon_2', 'col_off', 0] }),
      O('Learn the system', { iq: 3 }, 'You know the playbook better than the point guard.', { start: ['walkon', 'arc_walkon_2', 'col_off', 0] })] },
  nil_bidding: { at: 'col_off', req: { cyear: [1, 3] }, when: (L) => L.am && ovrOf(L) >= 56, w: 3, rar: 'uncommon',
    t: 'A collective doubles your NIL money.', x: 'If you transfer. They put the number in writing.',
    o: [O('Stay loyal', { trust: 6, morale: 2 }, 'Your own collective matches half. The fans love you for it.', { start: ['nil', 'arc_nil_2', 'col_pre', 1] }),
      O('Ask your school to match', { cash: 0.08 }, 'They match. Now everybody knows you asked.', { start: ['nil', 'arc_nil_2', 'col_pre', 1] })] },
  coach_rumor: { at: 'hs_off', when: (L) => L.am && L.am.college && L.am.grade === 12, w: 3, rar: 'uncommon',
    t: 'Your coach is a candidate somewhere else.', x: 'The pro rumor sites have the man who recruited you interviewing for an NBA job.',
    o: [O('Call him', { trust: 3 }, 'He says he is not going anywhere. He says it fast.', { start: ['coachleft', 'arc_coachleft_2', 'col_pre', 1] }),
      O('Wait and see', {}, 'You hear nothing for a month. Then you hear everything.', { start: ['coachleft', 'arc_coachleft_2', 'col_pre', 1] })] },

  // ── the other roads (alt slot: overseas, G League, juco, prep, gap, rec) ──
  abr_first_practice: { at: 'alt', req: { route: 'intl' }, w: 8,
    t: 'Grown men test you on day one.', x: 'A thirty-three year old forward elbows you on every screen.',
    o: [O('Elbow him back', { fame: 2, def: 1 }, 'He grins. By the next week he picks you first in drills.'),
      O('Laugh it off', { morale: 3 }, 'He keeps doing it. You learn to set your feet.')] },
  abr_derby: { at: 'alt', req: { route: 'intl' }, w: 6,
    t: 'The derby.', x: 'Drums, flares and fourteen thousand people who hate the other team more than they love you.',
    o: [O('Take the last shot', { fame: 5 }, 'It goes in. They carry you off the floor.', { p: (L) => clamp(0.45 + clutchBonus(L), 0.2, 0.8), set: 'abr.derby', no: { fx: { morale: -4 }, s: 'It rims out. The other side sets off a flare in your honor.' } }),
      O('Feed the old pro', { trust: 5 }, 'He hits it. The bench mobs you.')] },
  abr_coach: { at: 'alt', req: { route: 'intl' }, w: 4,
    t: 'Your new coach trusts veterans.', x: 'Twelve minutes a night. He says you have to earn it here.',
    o: [O('Earn it', { def: 2, eth: 3 }, 'Twenty minutes by February.'),
      O('Have your agent call', { trust: -6, fame: 1 }, 'He plays you more. He does not talk to you more.')] },
  glid_paycheck: { at: 'alt', req: { route: 'gl' }, w: 8,
    t: 'Your first paycheck.', x: 'You are eighteen. It is more money than your parents make in a year.',
    o: [O('Save most of it', { cash: 0.3 }, 'A boring account with a good number in it.', { set: 'money.saved' }),
      O('Buy your mom a car', { cash: -0.05, morale: 8 }, 'She cries in the dealership parking lot.', { rel: [['mom', 25, 'You bought her a car with your first check.']] })] },
  glid_vet: { at: 'alt', req: { route: 'gl' }, w: 6,
    t: 'A thirty-one year old takes you in.', x: '{tvet} has played on four continents. He says you remind him of himself.',
    o: [O('Listen to everything', { iq: 3 }, 'He teaches you how to rest on the road. And how to read a scouting report.', { rel: [['tvet', 25, 'He looked after you in the G League.']] }),
      O('Keep your distance', { morale: 1 }, 'He shrugs. There is always another kid.')] },
  juco_gym: { at: 'alt', req: { route: 'juco' }, w: 8,
    t: 'Two-a-days in a gym with no air.', x: 'The juco coach runs practice like it is 1985. Nobody here was recruited.',
    o: [O('Outwork the gym', { ath: 2, def: 2, health: -5 }, 'You lose eight pounds in a month. D1 coaches start calling.', { start: ['juco', 'arc_juco_2', 'hs_off', 0] }),
      O('Do enough', { morale: 2 }, 'You lead the team in scoring. Nobody calls yet.', { start: ['juco', 'arc_juco_2', 'hs_off', 0] })] },
  juco_bus: { at: 'alt', req: { route: 'juco' }, w: 5,
    t: 'A nine-hour bus ride.', x: 'A Tuesday game in a town with one hotel. The heat is broken.',
    o: [O('Watch film on your phone', { iq: 2 }, 'You learn their whole offense by the state line.'),
      O('Sleep', { health: 4 }, 'You wake up with a sore neck and thirty points in you.')] },
  prep_new_coach: { at: 'alt', req: { route: 'prep' }, w: 8,
    t: 'A coach who has sent forty players to college.', x: 'He says he can fix your jumper in a year.',
    o: [O('Let him rebuild it', { sho: 3, morale: -2 }, 'Ugly for two months. Then pure.'),
      O('Work on your body', { ath: 2, health: 4 }, 'Twelve pounds of muscle. Scouts notice before you score.')] },
  gap_alone: { at: 'alt', req: { route: 'gap' }, w: 8,
    t: 'Just you and a trainer.', x: 'No team, no schedule. Mock drafts start to forget your name.',
    o: [O('Post your workouts', { fame: 6 }, 'A million views a week. Scouts watch too.', { set: 'gap.brand' }),
      O('Stay quiet and work', { sho: 2, iq: 2 }, 'Nobody knows what you are doing. You like it that way.', { set: 'gap.quiet' })] },
  gap_forgotten: { at: 'alt', req: { route: 'gap' }, w: 6,
    t: 'You dropped off a mock draft.', x: 'Out of the first round on the biggest site.',
    o: [O('Call a trainer you trust', {}, 'He gets you a workout with an NBA team. Then two.', { do: (L) => { L.am.stock = (L.am.stock || 0) + 0.5; } }),
      O('Ignore it', { morale: 2 }, 'You are in the gym when it updates. You do not check.')] },
  rec_day_job: { at: 'alt', req: { route: 'rec' }, w: 8,
    t: 'The warehouse wants you on nights.', x: 'Overtime pay. It would mean no rec league.',
    o: [O('Take the shifts', { cash: 0.02, morale: -4 }, 'Good money. Your jumper gets rusty.'),
      O('Keep your nights', { sho: 2, morale: 3 }, 'You are broke and in the best shape of your life.')] },
  rec_proam: { at: 'alt', req: { route: 'rec' }, w: 6,
    t: 'A pro-am at the big park downtown.', x: 'Real pros play here in the summer. A scout sits on the top row.',
    o: [O('Go at the pros', { fame: 8 }, 'Fifty-four points. The clip is everywhere by morning.', { p: (L) => clamp(0.3 + (ovrOf(L) - 50) * 0.03, 0.15, 0.7), set: 'rec.viral', do: (L) => { if (recall(L, 'rec.viral')) L.flags.stock = (L.flags.stock || 0) + 3; },
      no: { fx: { morale: -3 }, s: 'A good night, not a great one. The scout leaves at halftime.' } }),
      O('Play your game', { iq: 1 }, 'Twenty-two and nine. A coach asks for your number.')] },
});

storyArcs({
  arc_camp_2: { at: 'hs_sum', stage: 'am',
    t: 'Same camp. Same kid.', x: (L) => '{dre} is back.' + (arcData(L, 'camp').tone === 'hot' ? ' He has not forgotten what you said.' : ' He waves from across the gym.') + ' The scouts put you on each other.',
    o: [O('Guard him every possession', { def: 2, fame: 3 }, 'He gets his. You get more. The scouts write both names down.', { go: ['camp', 'arc_camp_3', 'dn', 2] }),
      O('Room with him', { morale: 4 }, 'He talks until three in the morning. He is funny. You did not expect that.', { go: ['camp', 'arc_camp_3', 'dn', 2], rel: [['dre', 20, 'You roomed together at camp.']] })] },
  arc_camp_3: { at: 'dn', stage: 'nba', when: (L) => !!L.rival && L.rival.name === CAST.dre,
    t: '{dre} hears his name too.', x: (L) => 'Draft night. He goes ' + (L.rival.pick < (L.draft.pick || 61) ? 'before' : 'after') + ' you. He finds you backstage.',
    o: [O('Hug him', { morale: 5 }, 'Two kids from camp. Both in the league.', { go: ['camp', 'arc_camp_4', 'early', 1], rel: [['dre', 20, 'You hugged on draft night.']] }),
      O('Tell him you will see him soon', { fame: 2 }, 'He laughs. He knows what you mean.', { go: ['camp', 'arc_camp_4', 'early', 1], rel: [['dre', -5]] })] },
  arc_camp_4: { at: 'early', stage: 'nba', req: { team: true, rival: true },
    t: 'You and {dre}, on national TV.', x: 'The first time the two kids from camp share an NBA floor in a big game.',
    o: [O('Win the matchup', { fame: 5 }, 'You outscore him. He hugs you anyway.', { p: (L) => clamp(0.4 + (ovrOf(L) - L.rival.ovr) * 0.05, 0.1, 0.9), end: ['camp', 'won'], no: { fx: { morale: -4 }, s: 'He gets you. He brings it up at every All-Star weekend.', end: ['camp', 'lost'] } }),
      O('Trade jerseys after', { morale: 6 }, 'Framed in both your houses by Christmas.', { end: ['camp', 'friends'], rel: [['dre', 25, 'You traded jerseys after your first NBA matchup.']] })] },
  arc_aau_2: { at: 'hs_sum', stage: 'am',
    t: '{aau} got paid for you.', x: 'A shoe company gave him a bonus for signing you. He tells you himself.',
    o: [O('Thank him for telling you', { trust: 4 }, 'He says the money keeps the gym open. You believe him.', { end: ['aau', 'loyal'], rel: [['aau', 20, 'You stayed when you found out about the money.']] }),
      O('Ask for a cut', { cash: 0.01 }, 'He gives you one, quietly. Neither of you mentions it again.', { end: ['aau', 'cut'], rel: [['aau', -10]] }),
      O('Switch teams', { fame: 3 }, 'He does not try to stop you.', { end: ['aau', 'left'], rel: [['aau', -30, 'You left his team.']] })] },
  arc_visit_2: { at: 'hs_sum', stage: 'am',
    t: 'The photo from the party.', x: 'It is on a message board. Nothing in it is bad. It looks bad.',
    o: [O('Call the staff and explain', { trust: 4 }, 'He laughs. He has seen worse. The offer stands.', { end: ['visit', 'fine'] }),
      O('Say nothing', { morale: -2 }, 'One school drops you quietly. You never find out why.', { end: ['visit', 'cost'], do: (L) => { if (L.am) L.am.rstock = (L.am.rstock || 0) - 0.4; } })] },
  arc_nil_2: { at: 'col_pre', stage: 'am', when: (L) => !!(L.am && L.am.level === 'col'),
    t: 'The collective wants appearances.', x: 'Car washes, autograph tables and a gala. Every weekend in October.',
    o: [O('Do them all', { fame: 4, health: -4 }, 'You sign four thousand things. Your hand cramps in practice.', { end: ['nil', 'paid'] }),
      O('Do half', { trust: 2 }, 'They grumble. They pay anyway.', { end: ['nil', 'half'] })] },
  arc_coachleft_2: { at: 'col_pre', stage: 'am', when: (L) => !!(L.am && L.am.level === 'col' && L.am.cyear <= 2),
    t: 'The man who recruited you is gone.', x: 'He took the NBA job. The new staff did not recruit you.',
    o: [O('Win over the new staff', { trust: 6, eth: 3 }, 'You are the first one in on their first day.', { end: ['coachleft', 'stayed'] }),
      O('Ask for your release', { morale: 2 }, 'They grant it. You are in the portal before practice starts.', { end: ['coachleft', 'left'], do: (L) => { L.pending.unshift(portalCard(L)); } })] },
  arc_walkon_2: { at: 'col_off', stage: 'am',
    t: 'Practice ends early. Everybody sits.', x: 'The head coach has an envelope. He says your name.',
    o: [O('Open it in front of everybody', { morale: 10, fame: 3 }, 'A scholarship. The whole team piles on you.', { end: ['walkon', 'schol'], set: 'walkon.schol', log: 'Earned a scholarship.' }),
      O('Ask to open it alone', { morale: 8 }, 'A scholarship. You call home from the parking lot.', { end: ['walkon', 'private'], set: 'walkon.schol', log: 'Earned a scholarship.' })] },
  arc_juco_2: { at: 'hs_off', stage: 'am',
    t: 'A D1 coach drives nine hours to see you.', x: 'He watches one practice and asks for your mom\'s number.',
    o: [O('Tell him you are ready', { morale: 6 }, 'He offers before he leaves the parking lot.', { end: ['juco', 'offer'], do: (L) => { L.am.rstock = (L.am.rstock || 0) + 0.6; L.am.rank = nationalRank(L); L.pending = L.pending.filter((c) => c.id !== 'commit'); L.pending.push(commitCard(L)); } }),
      O('Ask about playing time first', { iq: 1 }, 'He promises nothing. You like that he does not lie.', { end: ['juco', 'honest'] })] },
});

// ── pre-draft and draft night (NARRATIVE.md 7.4) ──

story({
  pre_interview_trap: { at: 'predraft', w: 5,
    t: 'An executive asks the question.', x: '{exec} leans back in the interview room. "Who is the best player in this draft, and why is it not you?"',
    o: [O('Say it is you, and mean it', { fame: 2 }, 'He writes something down. You hope it was a compliment.', { p: 0.6, set: 'pre.interview', no: { fx: { morale: -2 }, s: 'He writes something down and frowns. Word gets around that you are arrogant.' } }),
      O('Name somebody else and explain', { iq: 1, trust: 4 }, 'He likes the scouting report. He asks you to stay for lunch.', { set: 'pre.interview' }),
      O('Make a joke', { morale: 3 }, 'He laughs. The room relaxes. Half the teams love it.')] },
  pre_medical: { at: 'predraft', when: (L) => !!(recall(L, 'inj.hs') || recall(L, 'inj.col') || L.dur < 52), w: 5,
    t: 'A medical flag leaks.', x: 'A team doctor found something in your knee scan. Now every team knows.',
    o: [O('Release your full records', { trust: 4 }, 'Doctors agree it is nothing. Most teams relax.', { do: (L) => { L.flags.stock = (L.flags.stock || 0) - 0.5; } }),
      O('Say nothing', { morale: -2 }, 'Two teams take you off their boards. You never know which two.', { do: (L) => { L.flags.stock = (L.flags.stock || 0) - 1.5; } })] },
  pre_shooting_coach: { at: 'predraft', when: (L) => L.rt.sho < 58, w: 4,
    t: 'Six weeks to fix your jumper.', x: 'A shooting coach says he can rebuild it before the draft. Or break it.',
    o: [O('Rebuild it', { sho: 3 }, 'A new release. It looks better. It feels strange.', { p: 0.6, no: { fx: { sho: -1, morale: -4 }, s: 'It is worse at workouts. You go back to the old one.' } }),
      O('Keep your shot', { morale: 2 }, 'You make it work in workouts. Teams see what you are.')] },
  pre_green_room: { at: 'predraft', when: (L) => projectedPick(L) <= 22, w: 5,
    t: 'The league invites you to the green room.', x: 'A table near the stage. Cameras on you until your name is called.',
    o: [O('Accept', { fame: 3 }, 'You get a suit fitted. Your mom buys a dress.', { set: 'dn.greenroom' }),
      O('Watch from home', { morale: 3 }, 'A cookout in the backyard. If the call comes, it comes there.', { set: 'dn.home' })] },
  pre_workout_heat: { at: 'predraft', w: 3,
    t: 'Six workouts in eight days.', x: 'Six cities. Your legs are gone by Thursday.',
    o: [O('Push through', { fame: 2, health: -6 }, 'Your last workout is your best. Somebody notices.', { do: (L) => { L.flags.stock = (L.flags.stock || 0) + 0.6; } }),
      O('Cancel two', { health: 6 }, 'Those two teams are offended. Your legs are not.')] },
  dn_mom_hug: { at: 'dn', req: { drafted: true }, w: 5,
    t: 'The camera finds your mom.', x: 'She has not stopped crying since {commish} said your name.',
    o: [O('Hug her for a long time', { morale: 8, fame: 2 }, 'The clip runs on every highlight show. You do not care.', { rel: [['mom', 20, 'The hug on draft night.']] }),
      O('Make her laugh', { morale: 6 }, 'She swats your arm on live TV. Everybody watching laughs too.', { rel: [['mom', 15]] })] },
  dn_hometown: { at: 'dn', when: (L) => !!(L.draft && L.draft.team && homeClub(L) === L.draft.team), w: 9,
    t: 'Your hometown team picked you.', x: 'The arena where you watched games as a kid is screaming your name.',
    o: [O('Wave to the section you sat in', { fame: 4, morale: 8 }, 'Section 112, upper row. They are all on their feet.', { set: 'dn.home.pick' }),
      O('Call your old coach', { morale: 6 }, 'He picks up before it rings.', { rel: [['hscoach', 25, 'You called him on draft night.']] })] },
  dn_stash: { at: 'dn', req: { pick: [36, 60] }, w: 4,
    t: 'They want to stash you.', x: 'Second round. The {club} want you to play a year in Europe while they hold your rights.',
    o: [O('Go to Europe for a year', { iq: 2 }, 'A one-year deal abroad. They will call next summer.', { do: (L) => {
        L.flags.rights = L.team; remember(L, 'route.stash', true); L.flags.overseas = (L.flags.overseas || 0) + 1;
        L.team = null; L.season = null; L.contract = { years: 1, total: 1, salary: 0.8, kind: 'overseas', start: L.year };
        L.pending = L.pending.filter((c) => c.id !== 'goal' && c.id !== 'training');
        logIt(L, 'Stashed overseas for a season.', ''); } }),
      O('Ask to come over now', { trust: 2 }, 'They agree. Fifteenth man, but in the league.')] },
  dn_slide: { at: 'dn', when: (L) => !!(recall(L, 'dn.greenroom') && L.draft && (L.draft.pick || 61) >= 18), w: 9,
    t: 'The green room empties around you.', x: (L) => 'You were projected in the lottery. Pick ' + (L.draft.pick || 'sixty') + '. The camera never left your face.',
    o: [O('Smile through it', { morale: -4, trust: 4 }, 'People notice the grace. Your old teammates send long texts.', { set: 'dn.slide' }),
      O('Write the picks down', { eth: 6, fame: 2 }, 'Every team that passed. You keep the paper in your locker.', { set: ['dn.slide', 'dn.list'] })] },

  // ── rookie and early career (7.5) ──
  money_first_buy: { at: 'pre early', req: { seasons: [0, 1] }, when: (L) => L.contract && L.contract.salary >= 2, w: 5,
    t: 'Your first real money.', x: 'The first paycheck clears. Everybody has advice.',
    o: [O('A car you always wanted', { cash: -0.3, morale: 6 }, 'It is ridiculous. You love it.', { start: ['money', 'arc_money_2', 'off', 1, { kind: 'car' }] }),
      O('A house for your mom', { cash: -0.8, morale: 8 }, 'Four bedrooms and a porch. She cannot stop touching the walls.', { set: 'family.house', start: ['money', 'arc_money_2', 'off', 1, { kind: 'house' }], rel: [['mom', 30, 'You bought her a house.']] }),
      O('Hire a financial adviser', { cash: 0.1 }, 'Index funds and a budget. Very boring. Very smart.', { start: ['money', 'arc_money_2', 'off', 1, { kind: 'adviser' }] })] },
  r_card_game: { at: 'early', req: { seasons: [0, 1] }, tags: 'locker', w: 3,
    t: 'The back of the plane has a card game.', x: '{tm} deals you in. The stakes are not small.',
    o: [O('Play a few hands', { morale: 4, cash: -0.02 }, 'You lose a little. You learn a lot about everybody.', { rel: [['tm', 15, 'You played cards on the plane.']] }),
      O('Sleep', { health: 3 }, 'You land fresh. {tm} calls you boring.', { rel: [['tm', -3]] })] },
  r_jersey_number: { at: 'pre', req: { seasons: [1, 2] }, w: 2,
    t: 'A veteran has your number.', x: '{tvet} wore it first. He might sell it.',
    o: [O('Buy it from him', { cash: -0.05, morale: 5 }, 'A watch and a dinner. He tells the story at every stop.', { rel: [['tvet', 15, 'You bought his number off him.']] }),
      O('Pick a new number', { morale: 2 }, 'A new number, a new start.')] },
  r_wall: { at: 'mid', req: { seasons: [0, 0], minutes: [16, null] }, tags: 'court', w: 4,
    t: 'The rookie wall.', x: 'Game fifty-five. Your legs feel like somebody else\'s.',
    o: [O('Rest and sleep more', { health: 6, min: -1 }, 'You come out of it in two weeks.', { start: ['wall', 'arc_wall_2', 'off', 0] }),
      O('Grind through it', { health: -6, eth: 3 }, 'You play through. Your shot does not.', { start: ['wall', 'arc_wall_2', 'off', 0] })] },
  r_vet_tests: { at: 'early', req: { seasons: [0, 0] }, tags: 'locker', w: 3,
    t: 'The veterans test you on the road.', x: '{tvet} sends you for coffee at five in the morning. In Denver. In January.',
    o: [O('Get the coffee', { trust: 3, morale: -1 }, 'Eight orders, all correct. They start calling you by name.', { start: ['room', 'arc_room_2', 'mid', 0], rel: [['tvet', 10]] }),
      O('Send it back with a joke', { morale: 2 }, 'Half of them laugh. The other half remember.', { start: ['room', 'arc_room_2', 'mid', 0, { joke: 1 }] })] },
  sl_first_game: { at: 'dn', req: { seasons: [0, 0] }, w: 3,
    t: 'Summer League starts in a week.', x: 'Las Vegas in July. Your first game in the colors.',
    o: [O('Hunt your shot', { fame: 4 }, 'Twenty-six points in your first game. The clip makes the rounds.', { p: (L) => clamp(0.35 + (ovrOf(L) - 60) * 0.04, 0.15, 0.85), set: 'sl.good', no: { fx: { morale: -3 }, s: 'Five for eighteen. You learn that Vegas gyms are hot.' } }),
      O('Run the team', { trust: 5, iq: 1 }, 'You run the plays they asked you to. The coaches love the tape.')] },
  sig_game: { at: 'mid', req: { seasons: [0, 4], minutes: [24, null] }, when: (L) => !!(L.season && L.season.hi && L.season.hi.pts >= 32), tags: 'court', w: 6,
    t: 'Your first signature game.', x: (L) => L.season.hi.pts + ' points. Your phone does not stop for two days.',
    o: [O('Do every interview', { fame: 8, morale: 3 }, 'A morning show, a podcast and a magazine shoot.', { start: ['sig', 'arc_sig_2', 'late', 0, { loud: 1 }] }),
      O('One interview, then the gym', { trust: 4, eth: 3 }, 'You tell {beat} it was one night. Then you go shoot.', { start: ['sig', 'arc_sig_2', 'late', 0] })] },
  r_road_roommate: { at: 'early mid', req: { seasons: [0, 2] }, tags: 'locker', w: 1, rar: 'uncommon',
    t: 'Your road roommate snores.', x: '{trook} sleeps like a chainsaw. Every hotel, every night.',
    o: [O('Buy him a mouthguard', { cash: -0.01, morale: 3 }, 'It works. He says you saved his career.', { rel: [['trook', 15, 'You fixed his snoring.']] }),
      O('Ask for your own room', { health: 3 }, 'You sleep well. He is a little hurt.', { rel: [['trook', -5]] })] },
  r_rookie_month: { at: 'early', req: { seasons: [0, 0] }, when: (L) => !!(L.season && perGame(L.season).pts >= 14), tags: 'court', w: 5,
    t: 'Rookie of the Month.', x: 'November is yours. The league sends a plaque.',
    o: [O('Give it to your mom', { morale: 6 }, 'It goes on her mantel, next to your fourth grade spelling bee trophy.', { rel: [['mom', 10]] }),
      O('Put it in your locker', { fame: 2, eth: 2 }, 'A reminder. Eleven more months to win.')] },
  promise_broken: { at: 'dn', when: (L) => !!(lovedBy(L) && L.draft && L.draft.team && lovedBy(L) !== L.draft.team), w: 7,
    t: 'They loved you. They passed.', x: (L) => 'The ' + nick(lovedBy(L)) + ' told your agent you were their guy. They took somebody else.',
    o: [O('Remember it', { eth: 4 }, 'You write the date on a piece of tape inside your shoe.', { start: ['promise2', 'arc_promise2_2', 'early', 1, { club: 0 }], do: (L) => { arcData(L, 'promise2').club = lovedBy(L); } }),
      O('Let it go', { morale: 3 }, 'Business. You meant it. Mostly.', { set: 'promise.forgiven' })] },
});

storyArcs({
  arc_money_2: { at: 'off', stage: 'nba',
    t: 'A year after the first big buy.', x: (L) => ({ car: 'The car has eleven thousand miles. Your cousins want to borrow it.', house: 'Your mom planted a garden. Your cousins want rooms.', adviser: 'Your adviser sends the year-end statement. It is up.' }[arcData(L, 'money').kind] || 'A year later.'),
    o: [O('Set some rules', { trust: 2, cash: 0.1 }, 'A family meeting. A budget. Some hurt feelings. Better money.', { end: ['money', 'rules'], rel: [['cousin', -10]] }),
      O('Say yes to everybody', { cash: -0.4, morale: 4 }, 'Everybody is happy. The account is less happy.', { end: ['money', 'yes'], rel: [['cousin', 15]] })] },
  arc_wall_2: { at: 'off', stage: 'nba',
    t: '{trainer} has a plan.', x: 'She watched your second half. She says your body needs a different summer.',
    o: [O('Follow it to the letter', { ath: 2, health: 10, dur: 4 }, 'Sleep tracking, a new diet, no pickup. You come back a different player.', { end: ['wall', 'broke'], rel: [['trainer', 25, 'You followed her plan after the rookie wall.']] }),
      O('Do your own summer', { sho: 1 }, 'You work hard. Just not the way she said.', { end: ['wall', 'own'], rel: [['trainer', -5]] })] },
  arc_room_2: { at: 'mid', stage: 'nba', req: { team: true },
    t: 'The veterans make a decision about you.', x: (L) => arcData(L, 'room').joke ? 'They have not forgotten the coffee joke.' : 'February. A team dinner. They save you a seat.',
    o: [O('Sit with them', { trust: 5, morale: 6 }, '{tvet} gives a toast. You are one of them now.', { end: ['room', 'accepted'], rel: [['tvet', 20, 'The room accepted you.']] }),
      O('Sit with the young guys', { morale: 3 }, 'They nod. The room never fully opens up to you.', { end: ['room', 'outside'] })] },
  arc_sig_2: { at: 'late', stage: 'nba',
    t: 'Teams have your film now.', x: (L) => arcData(L, 'sig').loud ? 'April. Everybody saw the interviews. Defenses saw them too.' : 'April. Defenses spent two months on your big night.',
    o: [O('Look at what they took away', { iq: 2 }, 'They sit on your right hand. You spend the summer on your left.', { end: ['sig', 'sustained'] }),
      O('Keep doing what worked', { fame: 2 }, 'It still works. Sometimes.', { end: ['sig', 'onenight'] })] },
  arc_promise2_2: { at: 'early', stage: 'nba', req: { team: true }, when: (L) => !!arcData(L, 'promise2').club && L.team !== arcData(L, 'promise2').club,
    t: 'The team that broke its promise.', x: (L) => 'The ' + nick(arcData(L, 'promise2').club) + ' on national TV. You still have the tape in your shoe.',
    o: [O('Make them pay', { fame: 5 }, 'Thirty-one points. You stare at their bench the whole fourth quarter.', { p: (L) => clamp(0.35 + (ovrOf(L) - 66) * 0.04, 0.15, 0.85), end: ['promise2', 'revenge'], no: { fx: { morale: -4 }, s: 'Seven points. They win by twenty. The tape stays in the shoe.', end: ['promise2', 'grudge'] } }),
      O('Shake their GM\'s hand', { trust: 4, morale: 3 }, 'He says they made a mistake. You knew that.', { end: ['promise2', 'forgiven'] })] },
});

// ── the prime (NARRATIVE.md 7.6) ──

const meRank = (L) => { const r = L.season && L.season.race; const m = r && r.find((x) => x.you); return m ? m.rank : 99; };
story({
  td_unhappy: { at: 'mid', req: { seasons: [2, null], team: true }, when: (L) => L.m.morale < 55 && L.season && L.season.w < L.season.l && L.contract && L.contract.years >= 1, w: 4,
    t: 'You want out.', x: 'Losing, again. You have said nothing in public. Yet.',
    o: [O('Tell {gm} privately', { trust: -4 }, 'He listens. He says he will try. It goes quiet.', { start: ['trade', 'arc_trade_2', 'late', 0, { loud: 0 }], rel: [['gm', -10, 'You asked him for a trade.']] }),
      O('Say it on the record', { fame: 5, trust: -12 }, '{beat} has it by the end of the night.', { start: ['trade', 'arc_trade_2', 'late', 0, { loud: 1 }], rel: [['gm', -25, 'You asked out in public.']] }),
      O('Keep quiet and play', { morale: -2, trust: 4 }, 'You say the right things. You mean about half of them.')] },
  bb_rumor: { at: 'early', req: { seasons: [3, null], fame: [45, null], team: true }, w: 2, rar: 'uncommon',
    t: 'You are in blockbuster talks.', x: 'Three teams, nine players. Your name is the biggest one.',
    o: [O('Call {gm}', { trust: 3 }, 'He says there is nothing to it. He has said that before.', { start: ['bb', 'arc_bb_2', 'mid', 0] }),
      O('Act like you did not hear', { morale: -2 }, 'Every reporter in the building asks. You say nothing seven times.', { start: ['bb', 'arc_bb_2', 'mid', 0] })] },
  max_eligible: { at: 'mid', req: { seasons: [3, null], ovr: [80, null], team: true }, when: (L) => !!(L.contract && L.contract.years <= 2), w: 4,
    t: 'You are eligible for the max.', x: 'Your next deal could be the biggest in franchise history. The talks start in July.',
    o: [O('Tell {agent:first} you want every dollar', { fame: 3 }, 'He smiles. He already has the spreadsheet.', { start: ['max', 'arc_max_2', 'off', 0, { ask: 'max' }] }),
      O('Say you will take less to win', { trust: 6, morale: 2 }, 'The front office loves it. {agent:first} does not.', { start: ['max', 'arc_max_2', 'off', 0, { ask: 'less' }], rel: [['agent', -10]] }),
      O('Say you will look around', { fame: 4, trust: -6 }, 'Every team with space starts clearing it.', { start: ['max', 'arc_max_2', 'off', 0, { ask: 'walk' }] })] },
  cs_target: { at: 'mid', req: { seasons: [4, null], ovr: [80, null], team: true }, when: (L) => clubNet(L, L.team) > -2 && !recall(L, 'arc.costar.landed'), w: 3, rar: 'uncommon',
    t: 'A star is a free agent this summer.', x: (L) => personName(L, 'costar') + ' wants a winner. You could recruit him yourself.',
    o: [O('Start recruiting now', { fame: 3 }, 'Dinner in his city on the off day. It goes well.', { start: ['costar', 'arc_costar_2', 'off', 0, { n: 0, warm: 1 }], do: (L) => { arcData(L, 'costar').n = personName(L, 'costar'); } }),
      O('Let the front office handle it', { trust: 3 }, 'They make the pitch. You stay out of it.', { start: ['costar', 'arc_costar_2', 'off', 0, { n: 0 }], do: (L) => { arcData(L, 'costar').n = personName(L, 'costar'); } })] },
  touch_tension: { at: 'early', req: { seasons: [3, null], starter: true, ovr: [72, null] }, tags: 'locker', w: 2, rar: 'uncommon',
    t: '{tco} is counting shots.', x: 'Yours and his. He says the gap is getting bigger.',
    o: [O('Talk to him', { trust: 3 }, 'It goes fine. You think.', { start: ['touch', 'arc_touch_2', 'mid', 0] }),
      O('Take more shots', { fame: 3, usage: 0.02 }, 'You score more. He talks less.', { start: ['touch', 'arc_touch_2', 'mid', 0, { more: 1 }], rel: [['tco', -15, 'You kept shooting.']] }),
      O('Feed him for a week', { win: 0.3 }, 'He scores thirty twice. Then he wants more.', { start: ['touch', 'arc_touch_2', 'mid', 0], rel: [['tco', 10]] })] },
  lm_rest: { at: 'early', req: { age: [29, null], team: true, starter: true }, w: 2, rar: 'uncommon',
    t: 'The staff wants you to sit a national TV game.', x: 'Back-to-back. The science says rest. The ticket buyers say otherwise.',
    o: [O('Sit', { health: 8 }, 'You watch in a suit. The crowd boos the announcement.', { start: ['lm', 'arc_lm_2', 'mid', 0, { sat: 1 }] }),
      O('Play', { health: -6, fame: 2 }, 'You play forty minutes. Your hamstring files a complaint.', { start: ['lm', 'arc_lm_2', 'mid', 0] })] },
  snub: { at: 'mid', req: { seasons: [2, null], ovr: [79, null], team: true }, when: (L) => !!(L.season && !L.season.allstar && perGame(L.season).pts >= 21), w: 6,
    t: 'Snubbed.', x: (L) => perGame(L.season).pts + ' a night. Not an All-Star. The internet is angrier than you are.',
    o: [O('Post a workout clip at midnight', { fame: 4, morale: 2 }, 'No caption. Two million views.', { start: ['snub', 'arc_snub_2', 'mid', 1] }),
      O('Say nothing', { eth: 3, trust: 3 }, 'You take the long weekend to work.', { start: ['snub', 'arc_snub_2', 'mid', 1] })] },
  shoe_meeting: { at: 'off', req: { seasons: [4, null], fame: [62, null], ovr: [80, null] }, w: 4,
    t: '{shoeexec} wants to talk about a signature line.', x: 'Stride Athletics. Your name on a box. Your story on the tongue.',
    o: [O('Tell them your origin story', { morale: 4 }, 'He records every word. The designers start sketching.', { start: ['shoe', 'arc_shoe_2', 'pre', 1, { story: 1 }], rel: [['shoeexec', 20, 'You told him your story for the shoe.']] }),
      O('Ask for the biggest check', { cash: 0.5 }, 'He pays it. The shoe will be whatever they want.', { start: ['shoe', 'arc_shoe_2', 'pre', 1] })] },
  mvp_ladder: { at: 'mid', req: { team: true }, when: (L) => meRank(L) <= 3, w: 7,
    t: 'You are on the MVP ladder.', x: (L) => 'Third, second, first, depending on the morning show. ' + (meRank(L) === 1 ? 'Today you are first.' : 'Today you are ' + ordinal(meRank(L)) + '.'),
    o: [O('Chase the stat line', { usage: 0.03, fame: 4 }, 'You average thirty-two in March.', { start: ['mvp', 'arc_mvp_2', 'late', 0, { how: 'stats' }] }),
      O('Make it about winning', { win: 0.5, trust: 4 }, 'Eleven wins in twelve games.', { start: ['mvp', 'arc_mvp_2', 'late', 0, { how: 'wins' }] }),
      O('Ignore it and stay healthy', { health: 6 }, 'You sit two back-to-backs. Voters notice.', { start: ['mvp', 'arc_mvp_2', 'late', 0, { how: 'rest' }] })] },
  pf_label: { at: 'off', when: (L) => { const h = L.history[L.history.length - 1]; return !!h && h.seed && h.seed <= 2 && /R1|R2|First Round|Conference Semifinals/.test(h.po || '') && h.y === L.year; }, w: 6,
    t: 'Out early as a top seed.', x: '{critic} says you are a regular season player. It is going on the shows all summer.',
    o: [O('Answer it in May', { eth: 4 }, 'You say nothing. You go to work.', { start: ['pf', 'arc_pf_2', 'late', 1] }),
      O('Answer it now', { fame: 3, morale: -2 }, 'A long post. It makes things louder.', { start: ['pf', 'arc_pf_2', 'late', 1] })] },
  dy_ego: { at: 'pre', when: (L) => { const H = L.history; return H.length >= 2 && H.slice(-2).every((h) => (h.aw || []).indexOf('champ') >= 0); }, w: 9,
    t: 'Two in a row.', x: 'Every interview asks about three. {tco} wants more of the credit.',
    o: [O('Give him the credit', { trust: 6, morale: 3 }, 'He softens. The room holds together.', { start: ['dynasty', 'arc_dynasty_2', 'off', 0, { kept: 1 }], rel: [['tco', 20, 'You gave him the credit during the dynasty.']] }),
      O('Remind everybody whose team it is', { fame: 4 }, 'True. Unhelpful.', { start: ['dynasty', 'arc_dynasty_2', 'off', 0], rel: [['tco', -20, 'You reminded him whose team it was.']] })] },
  cy_pressure: { at: 'mid', req: { team: true }, when: (L) => !!(L.contract && L.contract.years === 1 && L.age <= 30 && L.contract.kind !== 'rookie'), w: 3,
    t: 'Contract year.', x: 'Every box score is a negotiation now. {agent:first} texts after every game.',
    o: [O('Block it out', { eth: 3 }, 'You turn the phone off on game days.'),
      O('Hunt numbers', { usage: 0.02, trust: -3 }, 'Your stats go up. The ball moves less.')] },
  bad_contract: { at: 'off', req: { seasons: [5, null] }, when: (L) => !!(L.contract && L.contract.salary >= capFor(L.year) * 0.1 && ovrOf(L) < 80), w: 6,
    t: 'Worst contract in the league?', x: '{critic} has a list. You are on it. Third.',
    o: [O('Laugh it off on air', { fame: 3, morale: 2 }, 'You read the list out loud on a podcast. It helps.'),
      O('Get in the gym', { eth: 5, health: -2 }, 'You spend the summer proving a list wrong.')] },
  cameo_movie: { at: 'off', req: { fame: [60, null] }, w: 3,
    t: 'A director wants you in a movie.', x: 'Two lines. A comedy. You play a basketball player.',
    o: [O('Do it', { fame: 5, cash: 0.1 }, 'You are not good. You are very funny.', { set: 'ent.movie' }),
      O('Pass', { trust: 2 }, 'You watch the movie on a plane. It is fine without you.')] },
  fashion_week: { at: 'off', req: { fame: [68, null], big: true }, w: 3,
    t: 'Front row at fashion week.', x: 'A designer wants you in the front row. And maybe a line of your own.',
    o: [O('Go', { fame: 5, morale: 4 }, 'Photos everywhere. A capsule collection by spring.', { set: 'ent.fashion' }),
      O('Train instead', { eth: 3 }, 'You send the rookie instead. He has never been happier.')] },
  game_cover: { at: 'off', req: { fame: [78, null], stars: [2, null] }, w: 4,
    t: 'The cover of a video game.', x: 'Court Kings, the biggest basketball game there is. Your face on the box.',
    o: [O('Say yes', { fame: 6, cash: 0.3 }, 'Kids play as you in every living room. You lose with yourself online.', { set: 'ent.cover' }),
      O('Ask for your mom on the back', { fame: 4, morale: 6 }, 'They agree. She shows everybody at church.', { set: 'ent.cover' })] },
  union_voice: { at: 'off', req: { seasons: [5, null], team: true }, when: (L) => trait(L, 'lockerVoice') || repOf(L).resp >= 60, w: 3,
    t: 'The players want you in the union.', x: 'Vice president. Meetings in the summer. A seat at the table.',
    o: [O('Run for it', { trust: 4, fame: 2 }, 'You win by twelve votes. Your summers get shorter.', { set: 'union.role' }),
      O('Back somebody else', { morale: 2 }, 'You campaign for {tvet}. He wins.')] },
  foundation: { at: 'off', req: { seasons: [3, null], cash: 3 }, w: 2, rar: 'uncommon',
    t: 'Start a foundation?', x: 'Your accountant says it is time. Your mom says it is past time.',
    o: [O('Schools back home', { cash: -0.6, morale: 6 }, 'Two hundred laptops in September.', { set: 'foundation', rel: [['mom', 15]] }),
      O('Courts in every park', { cash: -0.5, fame: 3 }, 'New rims and new lights in twelve parks.', { set: 'foundation' }),
      O('Scholarships', { cash: -0.7, morale: 5 }, 'Ten kids a year. The first class writes you letters.', { set: 'foundation' })] },
  social_mistake: { at: 'early mid off', req: { fame: [50, null] }, w: 2, rar: 'uncommon',
    t: 'A late night post.', x: 'You were angry. You were tired. You hit send.',
    o: [O('Delete it and apologize', { trust: 2, fame: -2 }, 'Gone in ten minutes. Screenshots are forever. It fades.'),
      O('Double down', { fame: 5, trust: -8 }, 'It trends for two days. {gm} calls.')] },
  social_win: { at: 'off', req: { fame: [35, null] }, w: 1, rar: 'uncommon',
    t: 'A kid in a hospital wears your jersey.', x: 'His nurse posted it. He is nine. He says you are his favorite player.',
    o: [O('Visit him', { morale: 8, fame: 4 }, 'Two hours. Video games. You lose on purpose. He knows.'),
      O('Send a video and some gear', { morale: 4, fame: 2 }, 'He watches it eleven times. His nurse counts.')] },
  family_courtside: { at: 'early', req: { kids: [1, null], team: true }, w: 3,
    t: 'Your kid comes to a game.', x: 'Front row. Noise-canceling headphones. Your jersey, down to the knees.',
    o: [O('Wave every timeout', { morale: 8 }, 'The broadcast finds it. Kids wave back from every seat.'),
      O('Lock in', { fame: 2 }, 'A big night. You point at the front row after the last bucket.')] },
});

storyArcs({
  arc_trade_2: { at: 'late', stage: 'nba', req: { team: true },
    t: 'It leaked.', x: (L) => arcData(L, 'trade').loud ? 'It was never private. {beat} has the list of teams you would accept.' : '{beat} has it now. Somebody in the building talked.',
    o: [O('Confirm it', { fame: 4, trust: -6 }, 'No going back. The summer will decide.', { go: ['trade', 'arc_trade_3', 'off', 0] }),
      O('Walk it back', { trust: 3, morale: -4 }, 'You say you are happy here. Nobody believes it.', { go: ['trade', 'arc_trade_3', 'off', 0], do: (L) => { arcData(L, 'trade').back = 1; } })] },
  arc_trade_3: { at: 'off', stage: 'nba', req: { team: true },
    t: 'The trade request, settled.', x: 'Draft week. {gm} calls you in.',
    o: [O('Hear him out', {}, '', { do: (L, r) => {
        const d = arcData(L, 'trade');
        if (!d.back && ok(r, 0.6)) { tradeNow(L, r, true); arcEnd(L, 'trade', 'traded'); bump(L, { morale: 8 }); return 'Done. The ' + nick(L.team) + ' want you. You fly out tomorrow.'; }
        arcEnd(L, 'trade', 'stayed'); bump(L, { morale: -4, trust: 4 }); return 'No deal. He asks you to give it one more year.'; } }),
      O('Tell him you have changed your mind', { trust: 8, morale: 2 }, 'He shakes your hand. A fresh start, in the same building.', { end: ['trade', 'reconciled'], rel: [['gm', 20, 'You took back the trade request.']] })] },
  arc_bb_2: { at: 'mid', stage: 'nba', req: { team: true },
    t: 'The deadline.', x: 'Thursday at noon. Your phone is face down on the table.',
    o: [O('Pick it up', {}, '', { do: (L, r) => {
        if (ok(r, 0.45)) { const from = L.team; tradeNow(L, r); arcData(L, 'bb').from = from; arcGo(L, 'bb', 'arc_bb_3', 'early', 1); return 'You have been traded to the ' + nick(L.team) + '. You learn it from the screen.'; }
        arcEnd(L, 'bb', 'stayed'); bump(L, { morale: 3 }); return 'Noon passes. Nobody called. You exhale.'; } }),
      O('Go to practice', { trust: 3 }, '', { do: (L, r) => {
        if (ok(r, 0.35)) { const from = L.team; tradeNow(L, r); arcData(L, 'bb').from = from; arcGo(L, 'bb', 'arc_bb_3', 'early', 1); return 'Practice stops. Somebody calls your name. You are on the ' + nick(L.team) + ' now.'; }
        arcEnd(L, 'bb', 'stayed'); return 'Nobody pulls you out of anything. You stay.'; } })] },
  arc_bb_3: { at: 'early', stage: 'nba', req: { team: true }, when: (L) => !!arcData(L, 'bb').from && L.team !== arcData(L, 'bb').from,
    t: 'Back in your old building.', x: (L) => 'The ' + nick(arcData(L, 'bb').from) + ' play a video for you in the first timeout.',
    o: [O('Tap your chest', { morale: 6, fame: 2 }, 'A standing ovation. Then you score thirty against them.', { end: ['bb', 'thrived'] }),
      O('Stay locked in', { trust: 3 }, 'You barely look up. You win by twelve.', { end: ['bb', 'thrived'] })] },
  arc_max_2: { at: 'off', stage: 'nba',
    t: 'The money talks are done.', x: (L) => { const a = arcData(L, 'max').ask; return a === 'less' ? 'You took less. The front office spent the difference on a shooter.' : a === 'walk' ? 'You looked around. Four teams flew in for meetings.' : 'Every dollar. The biggest deal in franchise history.'; },
    o: [O('Buy dinner for the whole staff', { trust: 4, cash: -0.05 }, 'Equipment managers, video guys, the chef. Everybody.', { end: ['max', 'generous'], do: (L) => { if (arcData(L, 'max').ask === 'less' && L.team) L.league.net[L.team] = (L.league.net[L.team] || 0) + 1; } }),
      O('Get back in the gym', { eth: 3 }, 'The deal is done. Earning it starts tomorrow.', { end: ['max', 'signed'] })] },
  arc_costar_2: { at: 'off', stage: 'nba', req: { team: true },
    t: 'The meeting.', x: (L) => '{costar} comes to your house.' + (arcData(L, 'costar').warm ? ' He remembers the dinner.' : ' He has never been here before.'),
    o: [O('Pitch him a ring', {}, '', { do: (L, r) => {
        const d = arcData(L, 'costar');
        if (ok(r, d.warm ? 0.55 : 0.4)) { arcEnd(L, 'costar', 'landed'); remember(L, 'arc.costar.landed', true); L.league.net[L.team] = (L.league.net[L.team] || 0) + 2.5; relate(L, 'costar', 30, 'He signed after the meeting at your house.'); bump(L, { morale: 8, fame: 4 }); logIt(L, 'Recruited ' + d.n + ' to the ' + nick(L.team) + '.', 'gold'); return 'He signs the next morning. Now you have help.'; }
        arcEnd(L, 'costar', 'spurned'); bump(L, { morale: -5 }); return 'He goes somewhere else. He calls to tell you himself.'; } }),
      O('Let him decide in peace', { trust: 3 }, '', { do: (L, r) => {
        if (ok(r, 0.3)) { arcEnd(L, 'costar', 'landed'); remember(L, 'arc.costar.landed', true); L.league.net[L.team] = (L.league.net[L.team] || 0) + 2.5; bump(L, { morale: 8 }); return 'He signs. He says you were the only one who did not pressure him.'; }
        arcEnd(L, 'costar', 'spurned'); return 'He signs elsewhere. He says you were the only one who did not pressure him.'; } })] },
  arc_touch_2: { at: 'mid', stage: 'nba', req: { team: true },
    t: 'It is on TV now.', x: (L) => arcData(L, 'touch').more ? 'A camera caught {tco} yelling at you in a timeout.' : '{critic} spent ten minutes on you and {tco}.',
    o: [O('Own it', { trust: 4 }, 'You say it is on you. He hears about it.', { go: ['touch', 'arc_touch_3', 'off', 0], rel: [['tco', 10]] }),
      O('Deny everything', { fame: 2 }, 'Nobody believes either of you.', { go: ['touch', 'arc_touch_3', 'off', 0] })] },
  arc_touch_3: { at: 'off', stage: 'nba',
    t: 'You and {tco}, settled.', x: 'The season is over. One of you could be moved this summer.',
    o: [O('Take him to dinner', { morale: 4 }, 'Three hours. You leave as friends. Real ones.', { end: ['touch', 'friends'], rel: [['tco', 30, 'You settled it over dinner.']] }),
      O('Tell the front office to choose', { trust: -4 }, 'They choose you. He is traded at the draft.', { end: ['touch', 'traded'], rel: [['tco', -20, 'The front office chose you over him.']] })] },
  arc_lm_2: { at: 'mid', stage: 'nba',
    t: '{critic} calls you soft.', x: (L) => arcData(L, 'lm').sat ? 'Ten minutes on the rest night. He used the word "soft" nine times.' : 'He says you will be broken by May.',
    o: [O('Say nothing', { eth: 2 }, 'The clip goes around. You let May answer it.', { go: ['lm', 'arc_lm_3', 'late', 0] }),
      O('Call into his show', { fame: 4 }, 'You are calm and funny. He has nothing.', { go: ['lm', 'arc_lm_3', 'late', 0], rel: [['critic', -10, 'You called into his show.']] })] },
  arc_lm_3: { at: 'late', stage: 'nba',
    t: 'April. The legs question.', x: 'The playoffs start Saturday. Everybody wants to know how you feel.',
    o: [O('Tell the truth', {}, '', { do: (L) => { const fresh = L.m.health >= 60; arcEnd(L, 'lm', fresh ? 'fresh' : 'tired'); bump(L, fresh ? { morale: 5 } : { morale: -3 }); return fresh ? 'Fresh. You say so. You mean it.' : 'Honestly? Tired. {critic} plays the clip twice.'; } }),
      O('Say you feel great', { fame: 1 }, 'Everybody says that in April.', { end: ['lm', 'fine'] })] },
  arc_snub_2: { at: 'mid', stage: 'nba', req: { team: true },
    t: 'One year after the snub.', x: (L) => L.season && L.season.allstar ? 'The All-Star votes are in. You are in.' : 'The All-Star votes are in. Again, no.',
    o: [O('Read the list', {}, '', { do: (L) => { const inN = !!(L.season && L.season.allstar); arcEnd(L, 'snub', inN ? 'answered' : 'chip'); bump(L, inN ? { morale: 8 } : { eth: 4 }); return inN ? 'You screenshot it. Then you delete the screenshot. No need.' : 'The chip on your shoulder gets heavier. You like the weight.'; } }),
      O('Do not look', { eth: 2 }, '', { do: (L) => { arcEnd(L, 'snub', L.season && L.season.allstar ? 'answered' : 'chip'); return 'Your mom texts you either way.'; } })] },
  arc_shoe_2: { at: 'pre', stage: 'nba',
    t: 'The first sample shoe.', x: (L) => arcData(L, 'shoe').story ? 'The tongue has a map of {town} on it.' : 'It is very shiny. You are not sure it is you.',
    o: [O('Wear it on opening night', { fame: 4 }, 'The cameras find your feet all night.', { go: ['shoe', 'arc_shoe_3', 'mid', 0] }),
      O('Ask for one more round of changes', { morale: 2 }, '{shoeexec} sighs. The new version is better.', { go: ['shoe', 'arc_shoe_3', 'mid', 0], do: (L) => { arcData(L, 'shoe').better = 1; } })] },
  arc_shoe_3: { at: 'mid', stage: 'nba',
    t: 'Launch day.', x: 'All-Star weekend. Stores open at midnight.',
    o: [O('Go to the flagship store', { fame: 3 }, '', { do: shoeLaunch }),
      O('Watch the numbers from home', { health: 2 }, '', { do: shoeLaunch })] },
  arc_mvp_2: { at: 'late', stage: 'nba',
    t: 'The MVP debate.', x: (L) => 'April. {critic} and two former players argue about you for an hour. They focus on the ' + ({ stats: 'numbers', wins: 'wins', rest: 'games you missed' }[arcData(L, 'mvp').how] || 'numbers') + '.',
    o: [O('Watch it', { morale: -1 }, 'You turn it off at the half hour mark.', { end: ['mvp', 'watched'] }),
      O('Go to sleep', { health: 2 }, 'The voters will do what they do.', { end: ['mvp', 'slept'] })] },
  arc_pf_2: { at: 'late', stage: 'nba',
    t: 'May is coming.', x: 'The label from last spring is still there. The playoffs start Saturday.',
    o: [O('Embrace it', { morale: 3 }, 'You tell the room this is the year. You mean it.', { end: ['pf', 'embraced'] }),
      O('Tune it out', { eth: 2 }, 'Headphones on. Same routine.', { end: ['pf', 'tuned'] })] },
  arc_dynasty_2: { at: 'off', stage: 'nba',
    t: 'The summer after the dynasty question.', x: (L) => arcData(L, 'dynasty').kept ? 'The core is together. {tco} is still here.' : 'The front office has calls about {tco}.',
    o: [O('Fight to keep the group', { trust: 4 }, 'They keep it. One more run.', { end: ['dynasty', 'kept'] }),
      O('Let the business happen', { morale: -2 }, 'They move him for younger legs. It is the right call. It still hurts.', { end: ['dynasty', 'broke'] })] },
});

// ── adversity (NARRATIVE.md 7.7) ──

story({
  inj_comeback: { at: 'off', when: (L) => { const m = recall(L, 'inj.major'); return !!m && m.y === L.year; }, w: 9,
    t: 'The long way back.', x: 'Surgery is behind you. {trainer} lays out three ways to spend the summer.',
    o: [O('The slow road', { health: 14, ath: -1 }, 'Nine months, no shortcuts. Opening night is the goal.', { start: ['comeback', 'arc_comeback_2', 'early', 1, { path: 'slow' }], rel: [['trainer', 15, 'You took the slow road back.']] }),
      O('Push to be ready early', { health: 4 }, 'Ahead of schedule. Everybody says so. You hope so.', { start: ['comeback', 'arc_comeback_2', 'early', 1, { path: 'fast' }] }),
      O('An experimental treatment', { cash: -0.4, health: 8 }, 'A clinic overseas. Expensive. Promising.', { start: ['comeback', 'arc_comeback_2', 'early', 1, { path: 'new' }] })] },
  md_sore: { at: 'mid', req: { seasons: [2, null], team: true }, when: (L) => L.m.health < 85, w: 2, rar: 'uncommon',
    t: 'The soreness will not go away.', x: 'Your hip, for six weeks. The team doctor says it is tightness.',
    o: [O('Trust the team doctor', { health: -3 }, 'Ice and stretching. It gets a little better.', { start: ['md', 'arc_md_2', 'off', 0, { second: 0 }] }),
      O('Get a second opinion', { cash: -0.05, trust: -3 }, 'A specialist you pay for yourself. The team is not thrilled.', { start: ['md', 'arc_md_2', 'off', 0, { second: 1 }] })] },
  cc_counsel: { at: 'mid off', req: { seasons: [2, null] }, when: (L) => (L.evlog && (L.evlog.slump || []).length >= 2 && L.m.morale < 55) || L.m.morale < 30, w: 3,
    t: 'Something is off, and it is not your jumper.', x: 'You are not sleeping. Games feel like tests you did not study for.',
    o: [O('Talk to someone', { morale: 10 }, 'Once a week, all season. It is the best decision of your career.', { set: 'cc.help', start: ['cc', 'arc_cc_2', 'pre', 1] }),
      O('Work through it alone', { eth: 3, morale: -2 }, 'Longer hours. It helps a little.', { start: ['cc', 'arc_cc_2', 'pre', 1, { alone: 1 }] })] },
  lr_split: { at: 'early', req: { seasons: [2, null], team: true }, when: (L) => L.season && L.season.w < L.season.l, tags: 'locker', w: 2, rar: 'uncommon',
    t: 'The locker room has split.', x: 'The vets on one side. The young players on the other. {tvet} and {trook} have stopped talking.',
    o: [O('Call a players-only meeting', { trust: 3 }, 'You book a room for after practice.', { start: ['rift', 'arc_rift_2', 'mid', 0, { led: 1 }] }),
      O('Stay out of it', { morale: -2 }, 'It does not go away on its own.', { start: ['rift', 'arc_rift_2', 'mid', 0] })] },
  susp_flagrant: { at: 'early mid', req: { team: true }, when: (L) => trait(L, 'hothead') || L.m.morale < 30, tags: 'court', w: 3,
    t: 'Flagrant two.', x: 'He undercut you on a layup. You got up swinging. Ejected.',
    o: [O('Apologize after the game', { trust: 4, cash: -0.05 }, 'One game suspension. The league notes the apology.', { set: 'susp.games' }),
      O('Defend it', { fame: 3, trust: -6, cash: -0.1 }, 'Two games. {critic} has a field day.', { set: 'susp.games', rel: [['critic', -5]] })] },
  susp_curfew: { at: 'mid', req: { team: true }, when: (L) => !!(L.evlog && L.evlog.night_out), w: 1, rar: 'uncommon',
    t: 'You missed curfew.', x: 'Three in the morning on a road trip. Security has the time stamp.',
    o: [O('Own it to the team', { trust: 2, min: -2 }, 'One game. You tell the room before the coaches can.', { set: 'susp.curfew' }),
      O('Blame the hotel', { trust: -8, min: -3 }, 'Nobody buys it. Two games.', { set: 'susp.curfew' })] },
  boo_night: { at: 'mid', req: { team: true, seasons: [2, null] }, when: (L) => !!(L.season && L.season.w < L.season.l - 6), w: 3,
    t: 'Booed at home.', x: 'Your own building. Your own fans. Every missed shot.',
    o: [O('Cup your ear', { fame: 4, trust: -4 }, 'They boo louder. You score on the next three trips.', { start: ['boo', 'arc_boo_2', 'off', 0, { loud: 1 }] }),
      O('Clap with them', { morale: -2, trust: 3 }, 'You agree with them. It disarms the place.', { start: ['boo', 'arc_boo_2', 'off', 0] }),
      O('Ignore it', { eth: 2 }, 'Headphones on in your head. It is still loud.', { start: ['boo', 'arc_boo_2', 'off', 0] })] },
  tv_take: { at: 'early', req: { fame: [55, null], seasons: [1, null] }, w: 3,
    t: '{critic} says you are overrated.', x: 'Hot Take Hour. A graphic with your face and the word "overrated" in red.',
    o: [O('Respond online', { fame: 4 }, 'Three words. It gets more views than his show.', { start: ['tv', 'arc_tv_2', 'off', 0, { clap: 1 }], rel: [['critic', -15, 'You clapped back online.']] }),
      O('Ignore him', { eth: 2 }, 'He keeps talking. That is his job.', { start: ['tv', 'arc_tv_2', 'off', 0] })] },
  sonny_pitch: { at: 'off', req: { seasons: [1, 6] }, when: (L) => L.agent !== 'power', w: 3,
    t: '{sonny} wants to represent you.', x: 'Two phones, a nice watch, a lot of promises. He says your endorsements are worth double.',
    o: [O('Let him run your endorsements', { morale: 3, fame: 2 }, 'He has you on a magazine cover by September.', { start: ['sonny', 'arc_sonny_2', 'off', 1], set: 'agent.sonny', rel: [['sonny', 25, 'He took over your endorsements.']] }),
      O('Ask {maya} about him', { iq: 1 }, 'She says nothing bad. She says it carefully.', { rel: [['maya', 15, 'You asked her about Sonny.']] }),
      O('Say no', { trust: 1 }, 'He leaves his card. Two cards, actually.')] },
  hf_drives_you: { at: 'hs_sum', req: { grade: [10, 11] }, w: 4,
    t: '{friend} has a car now.', x: 'It has one working door. He drives you to every AAU game anyway.',
    o: [O('Pay him back in gas money', { cash: -0.01, morale: 4 }, 'He refuses. You leave it in the cupholder anyway.', { set: 'friend.tavi', start: ['tavi', 'arc_tavi_2', 'off', 3], rel: [['friend', 25, 'He drove you to every AAU game.']] }),
      O('Promise him something bigger', { morale: 5 }, '"When you make it," he says. He means it as a joke.', { set: ['friend.tavi', 'friend.promise'], start: ['tavi', 'arc_tavi_2', 'off', 3], rel: [['friend', 30, 'You promised him something when you made it.']] })] },
  money_broke: { at: 'off', req: { seasons: [3, null] }, when: (L) => L.earned > 5 && L.cash < L.earned * 0.3, w: 6,
    t: 'Your adviser asks for a meeting.', x: 'The numbers are bad. You have earned a lot. You have kept very little.',
    o: [O('Listen and cut back', { cash: 0.6, morale: -4 }, 'A smaller house. Fewer cars. A real plan.', { set: 'money.warned' }),
      O('Ignore it', { morale: 2 }, 'You will figure it out next season. Probably.', { set: 'money.warned', do: (L) => { L.cash = round1(Math.max(0, L.cash - 0.4)); } })] },
  money_generational: { at: 'off', req: { seasons: [8, null], cash: 30 }, w: 5,
    t: 'Generational money.', x: 'Your accountant says your great-grandchildren will never need to work.',
    o: [O('Set up a trust', { morale: 6 }, 'Lawyers, signatures, peace of mind.', { set: 'money.gen' }),
      O('Buy something ridiculous', { cash: -2, fame: 3 }, 'A vineyard. You do not drink wine.', { set: 'money.gen' })] },
  hs_jersey_return: { at: 'off', req: { seasons: [7, null], stars: [1, null] }, w: 4,
    t: 'Your high school retires your number.', x: 'A Friday night in {town}. Your old coach is holding the frame.',
    o: [O('Fly home for it', { morale: 10, fame: 2 }, 'The gym is sold out. Your coach cries before you do.', { set: 'hs.numret', rel: [['hscoach', 30, 'He held the frame when they retired your number.']] }),
      O('Send your family', { morale: 4 }, 'Your mom gives the speech. It is better than yours would have been.', { set: 'hs.numret' })] },
  mom_house: { at: 'off', req: { seasons: [1, 4] }, when: (L) => !recall(L, 'family.house') && L.cash >= 2, w: 4,
    t: 'Your mom still lives in the old place.', x: 'Two bedrooms. The heat does not always work.',
    o: [O('Buy her a house', { cash: -1.2, morale: 10 }, 'She picks a yellow one with a porch. She cries on the porch.', { set: 'family.house', rel: [['mom', 30, 'You bought her a house.']] }),
      O('Fix up the old one', { cash: -0.3, morale: 6 }, 'New heat, new roof. She refuses to move anyway.', { rel: [['mom', 15]] })] },
  heckler_lou: { at: 'mid', req: { team: true, seasons: [1, null] }, tags: 'court', w: 2, rar: 'uncommon',
    t: 'Front row, every game.', x: '{fan}. He has heckled you since your first game here. Today it is about your free throws.',
    o: [O('Make both and wink', { fame: 2 }, 'He laughs. Then he heckles somebody else.', { start: ['lou', 'arc_lou_2', 'off', 4], rel: [['fan', 10, 'You winked at him after two free throws.']] }),
      O('Give him a look', { trust: -1 }, 'He loves it. Now he has material.', { start: ['lou', 'arc_lou_2', 'off', 4], rel: [['fan', -5]] })] },
});

storyArcs({
  arc_comeback_2: { at: 'early', stage: 'nba', req: { team: true },
    t: 'The comeback game.', x: (L) => ({ slow: 'Nine months to the day.', fast: 'Ahead of schedule, everybody says.', new: 'The treatment worked. You think.' }[arcData(L, 'comeback').path] || '') + ' The building stands when you check in.',
    o: [O('Attack the rim', {}, '', { do: (L, r) => {
        const d = arcData(L, 'comeback'); const p = d.path === 'slow' ? 0.75 : d.path === 'new' ? 0.6 : 0.5;
        if (ok(r, p)) { arcEnd(L, 'comeback', 'full'); bump(L, { morale: 10, fame: 4 }); return 'The first dunk in a year. The bench empties.'; }
        arcEnd(L, 'comeback', 'reinvent'); bump(L, { ath: -2, iq: 2, morale: -2 }); return 'The burst is not all the way back. You will have to play smarter now.'; } }),
      O('Ease in', { trust: 3 }, 'Fourteen minutes. Smart. You are back.', { end: ['comeback', 'eased'] })] },
  arc_md_2: { at: 'off', stage: 'nba',
    t: 'The scan comes back.', x: (L) => arcData(L, 'md').second ? 'The specialist was right. It was never tightness.' : 'A new scan at the end of the season. It was never tightness.',
    o: [O('Fix it now', {}, '', { do: (L) => { const early = arcData(L, 'md').second; arcEnd(L, 'md', early ? 'early' : 'late'); bump(L, early ? { health: 10 } : { health: 4, ath: -2 }); return early ? 'Caught early. A small procedure and a full summer.' : 'A bigger fix than it needed to be. You lose some burst.'; } }),
      O('Talk to the team about it', { trust: -3 }, 'A long meeting. Everybody is sorry. Nobody says it.', { end: ['md', 'talked'], rel: [['gm', -10, 'The misdiagnosed hip.']] })] },
  arc_cc_2: { at: 'pre', stage: 'nba',
    t: 'Camp opens. You feel different.', x: (L) => arcData(L, 'cc').alone ? 'The summer of long hours helped. Some.' : 'A summer of honest conversations. Lighter.',
    o: [O('Tell your teammates about it', { trust: 6, morale: 6 }, 'Two of them come to you that week with their own stuff.', { end: ['cc', 'growth'] }),
      O('Keep it to yourself', { morale: 4 }, 'You feel better. That is enough.', { end: ['cc', 'quiet'] })] },
  arc_rift_2: { at: 'mid', stage: 'nba', req: { team: true },
    t: 'The players-only meeting.', x: (L) => arcData(L, 'rift').led ? 'Your meeting. Forty minutes. Raised voices, then quiet ones.' : 'Somebody else called it. Everybody looks at you anyway.',
    o: [O('Say the hard thing', { trust: 4 }, '', { do: (L, r) => { if (ok(r, arcData(L, 'rift').led ? 0.65 : 0.45)) { arcEnd(L, 'rift', 'leader'); bump(L, { win: 0.6, morale: 6 }); return 'They win six of the next seven. The room is yours now.'; } arcEnd(L, 'rift', 'scapegoat'); bump(L, { trust: -6, morale: -4 }); return 'It leaks. You become the story.'; } }),
      O('Listen', { iq: 1 }, 'You hear things you did not know. Some of them about you.', { end: ['rift', 'listened'] })] },
  arc_boo_2: { at: 'off', stage: 'nba',
    t: 'The summer after the boos.', x: (L) => arcData(L, 'boo').loud ? 'The ear cup is a meme. Half the city loves it.' : 'The city wants to know if you want to be here.',
    o: [O('Do a free camp in the city', { morale: 6, cash: -0.05 }, 'A thousand kids. Their parents cheer the loudest.', { end: ['boo', 'won'] }),
      O('Say nothing until opening night', { eth: 3 }, 'The first home game is the answer, either way.', { end: ['boo', 'waited'] })] },
  arc_tv_2: { at: 'off', stage: 'nba',
    t: '{critic} wants you on his show.', x: 'Hot Take Hour, in studio. He promises to be fair. He has never been fair.',
    o: [O('Go on', {}, '', { do: (L, r) => { if (ok(r, 0.55 + (L.m.fame - 50) * 0.005)) { arcEnd(L, 'tv', 'truce'); relate(L, 'critic', 25, 'You went on his show and won.'); bump(L, { fame: 5, morale: 4 }); return 'You are funny and calm. By the end he is laughing. A truce, on air.'; } arcEnd(L, 'tv', 'feud'); relate(L, 'critic', -20, 'You went on his show and it went badly.'); bump(L, { fame: 3, morale: -4 }); return 'He ambushes you with a clip. The feud lives forever.'; } }),
      O('Decline', { trust: 2 }, 'He calls you scared on air. You are on vacation.', { end: ['tv', 'declined'] })] },
  arc_sonny_2: { at: 'off', stage: 'nba',
    t: '{sonny} made a side deal.', x: 'A shoe company paid him to steer you their way. It is in a court filing.',
    o: [O('Fire him', { trust: 4 }, 'You hire {maya} the same week. She hates surprises. You love that.', { end: ['sonny', 'fired'], rel: [['sonny', -40, 'You fired him over the side deal.'], ['maya', 25, 'You hired her after Sonny.']] }),
      O('Hear his side', { morale: -2 }, '', { do: (L, r) => { if (ok(r, 0.5)) { arcEnd(L, 'sonny', 'saved'); bump(L, { cash: 0.6 }); return 'He turns the mess into a better deal. You do not ask how.'; } arcEnd(L, 'sonny', 'sunk'); bump(L, { cash: -0.8, fame: -3 }); return 'It gets worse. A settlement and a lot of headlines.'; } })] },
  arc_tavi_2: { at: 'off', stage: 'nba',
    t: '{friend} wants a job.', x: (L) => (recall(L, 'friend.promise') ? 'You promised him something when you made it. ' : '') + 'He wants to be on the payroll. Driver, assistant, anything.',
    o: [O('Hire him', { cash: -0.1, morale: 4 }, 'He is late twice in the first week. He is also the only one who tells you the truth.', { go: ['tavi', 'arc_tavi_3', 'off', 3], do: (L) => { arcData(L, 'tavi').job = 1; } }),
      O('Help him start a business', { cash: -0.4 }, 'A barbershop near your old court. He cuts your hair before every playoff run.', { go: ['tavi', 'arc_tavi_3', 'off', 3], do: (L) => { arcData(L, 'tavi').biz = 1; } }),
      O('Say no', { morale: -4 }, 'He says he understands. He calls less.', { end: ['tavi', 'cut'], rel: [['friend', -30, 'You said no when he asked for a job.']] })] },
  arc_tavi_3: { at: 'off', stage: 'nba',
    t: '{friend} has news.', x: (L) => arcData(L, 'tavi').biz ? 'The barbershop opened a second location.' : 'He wants to know if he can be more than a driver.',
    o: [O('Make him a partner', { cash: -0.2, morale: 8 }, 'Your name and his on the paperwork. He frames the first page.', { end: ['tavi', 'partner'], rel: [['friend', 30, 'He became your business partner.']] }),
      O('Ask him to be your best man', { morale: 10 }, 'He laughs, then he cries, then he says yes.', { end: ['tavi', 'bestman'], rel: [['friend', 40, 'You asked him to be your best man.']] })] },
  arc_lou_2: { at: 'off', stage: 'nba', when: (L) => !!L.team,
    t: '{fan} writes you a letter.', x: 'He has heckled you for years. He says it is because he loves you. He has a ticket stub for every game.',
    o: [O('Invite him to practice', { morale: 6, fame: 2 }, 'He cannot talk the whole time. First time ever.', { end: ['lou', 'friends'], rel: [['fan', 30, 'You invited him to practice.']] }),
      O('Write back', { morale: 4 }, 'Two lines. He laminates it.', { end: ['lou', 'letter'], rel: [['fan', 20]] })] },
});

// ── late career (NARRATIVE.md 7.9) ──

story({
  v_smaller_role: { at: 'pre', req: { age: [32, null], team: true }, when: (L) => { const h = L.history[L.history.length - 1]; return !!h && ovrOf(L) < h.ovr; }, w: 4,
    t: 'They want you off the bench this year.', x: 'Training camp. The depth chart has your name lower than last year.',
    o: [O('Accept it', { trust: 8, morale: -2, min: -3 }, 'You run the second unit like a coach.', { set: 'v.role' }),
      O('Fight for minutes', { eth: 4, health: -3 }, 'You win the job back for a month. Then the young legs win it.', { set: 'v.role' }),
      O('Ask to be moved', { trust: -6 }, '{gm} says he will see. He means no.', { set: 'v.role', rel: [['gm', -10]] })] },
  v_ring_chase: { at: 'off', req: { age: [33, null], rings: [0, 0], team: true }, when: (L) => !!(L.contract && L.contract.years >= 1) && clubNet(L, L.team) < 2, w: 4,
    t: 'No ring. Time is short.', x: 'A contender would take you for the minimum. You would have to give up money to go.',
    o: [O('Take the buyout and chase it', { morale: 6 }, '', { do: (L, r) => { tradeNow(L, r, true); L.contract = { years: 1, total: 1, salary: round1(capFor(L.year) * MIN_PCT), kind: 'min', start: L.year + 1 }; remember(L, 'route.ringchase', true); logIt(L, 'Took the minimum to chase a ring with the ' + nick(L.team) + '.', 'gold'); return 'You sign with the ' + nick(L.team) + ' for the minimum. They have a real shot.'; } }),
      O('Stay where you are', { trust: 6, morale: -2 }, 'Loyalty. It might be the right call. It might not.', { set: 'v.stayed' })] },
  mr_rookie: { at: 'pre', req: { age: [31, null], team: true, seasons: [7, null] }, w: 4,
    t: 'The team drafted your replacement.', x: '{rookie2} is twenty and plays your position. Your old poster is his lock screen.',
    o: [O('Take him under your wing', { trust: 6, morale: 3 }, 'You show him how to rest, how to read a scout report, how to talk to {beat}.', { start: ['mentor2', 'arc_mentor2_2', 'mid', 0, { teach: 1 }], rel: [['rookie2', 25, 'You took him under your wing.']], set: 'route.vet' }),
      O('Make him earn it', { eth: 3 }, 'You guard him every practice. He gets better fast.', { start: ['mentor2', 'arc_mentor2_2', 'mid', 0], rel: [['rookie2', 5]] })] },
  v_milestone: { at: 'mid', req: { team: true, age: [30, null] }, when: (L) => { const T = totals(L); return [10000, 15000, 20000, 25000, 30000].some((m) => T.pts < m && T.pts >= m - 900); }, w: 5,
    t: 'A milestone is close.', x: (L) => { const T = totals(L); const m = [10000, 15000, 20000, 25000, 30000].find((x) => T.pts < x && T.pts >= x - 900); return (m - T.pts) + ' points to ' + m.toLocaleString('en-US') + '. Everybody is counting.'; },
    o: [O('Chase it', { usage: 0.02, fame: 2 }, 'You get it in March, on a pull-up. They stop the game.', { set: 'v.chase' }),
      O('Let it come', { trust: 4 }, 'It comes on a free throw in a blowout. Perfect.', { set: 'v.chase' })] },
  v_rival_last: { at: 'mid', req: { rival: true, age: [33, null], team: true }, w: 6,
    t: 'Probably the last time.', x: '{rival} and you, one more time. The arena knows it.',
    o: [O('Trade jerseys after', { morale: 8 }, 'You both hold the other\'s jersey up for the cameras.', { set: 'rival.last', rel: [['rival', 20, 'You swapped jerseys the last time you played.']] }),
      O('Beat him one last time', { fame: 3 }, 'You hit the dagger. He laughs about it in the handshake.', { set: 'rival.last' })] },
  v_hair_grey: { at: 'pre', req: { age: [33, 34] }, w: 3,
    t: 'A grey hair.', x: '{trook} finds it on picture day. The whole locker room knows by lunch.',
    o: [O('Leave it', { morale: 3 }, 'You call it experience. They call you Unc.', { rel: [['trook', 10]] }),
      O('Dye it', { fame: 1 }, 'They find the box in the trash. Worse.')] },
  v_bench_coach: { at: 'mid', req: { age: [33, null], team: true }, when: (L) => trait(L, 'lockerVoice') || L.rt.iq >= 72, tags: 'court', w: 4,
    t: 'You get the clipboard.', x: 'A timeout in a blowout. You are told to draw something up.',
    o: [O('Draw a play for the rookie', { trust: 6, morale: 4 }, 'He scores. The bench loses it. So does the whole staff.', { set: ['v.coachy', 'route.vet'] }),
      O('Hand it back with a smile', { morale: 2 }, 'He laughs. He asks again in March.', { set: 'v.coachy' })] },
  fw_announce: { at: 'pre', req: { age: [35, null], team: true }, w: 5,
    t: 'This could be the last one.', x: 'Training camp. Your body says so. You have not said it out loud.',
    o: [O('Announce it', { fame: 6, morale: 6 }, 'A press conference. A farewell season. Every road arena has a gift waiting.', { start: ['farewell', 'arc_farewell_2', 'mid', 0], do: (L) => { L.flags.farewell = L.year; remember(L, 'fw.announced', true); } }),
      O('Keep it quiet', { eth: 2 }, 'You will decide in the summer. Like always.')] },

  // ── playoffs and the league (7.10, 7.11) ──
  po_road: { at: 'late', when: (L) => !!(L.season && L.season.seed >= 6 && L.season.seed <= 8), w: 1, rar: 'uncommon',
    t: 'You open on the road.', x: 'Lower seed. A hostile building on Saturday. The team plane leaves Thursday.',
    o: [O('Say it is the same game', { trust: 4, win: 0.2 }, 'They believe it. Mostly.'),
      O('Embrace being the villain', { fame: 2, morale: 3 }, 'You walk in waving. Their fans hate it. You love it.')] },
  po_hurt: { at: 'late', when: (L) => L.m.health < 72 && !!(L.season && L.season.seed && L.season.seed <= 10), w: 4,
    t: 'You are not healthy for the playoffs.', x: 'Something in your ankle. The team doctor says you could make it worse.',
    o: [O('Play through it', { health: -6, fame: 3, win: 0.2 }, 'You tape it twice and play. It hurts for a month after.'),
      O('Sit the first game', { health: 8, win: -0.2 }, 'You watch in a suit. It is the hardest game of your career.')] },
  po_elim_presser: { at: 'off', when: (L) => { const h = L.history[L.history.length - 1]; return !!h && h.y === L.year && /R1|R2|CF|Finals/.test(h.po || ''); }, w: 2,
    t: 'Cleaning out your locker.', x: 'The season ended a week ago. {press} has the last questions.',
    o: [O('Take the blame', { trust: 6, fame: -1 }, 'The room respects it. {beat} writes it up kindly.'),
      O('Look ahead', { morale: 3 }, 'You talk about the summer. Nobody quotes it.')] },
  lg_cup: { at: 'early', req: { team: true }, when: (L) => clubNet(L, L.team) > 2, w: 2, rar: 'uncommon',
    t: 'The in-season tournament final.', x: 'December in Las Vegas. A cup, prize money and a court painted gold.',
    o: [O('Take it seriously', { fame: 3, health: -3 }, '', { do: (L, r) => { if (ok(r, 0.5)) { bump(L, { cash: 0.3, morale: 6 }); remember(L, 'lg.cup', true); return 'You win the cup. The prize money buys the whole staff a vacation.'; } bump(L, { morale: -3 }); return 'You lose the final by two. A strange December hurt.'; } }),
      O('Treat it like any game', { health: 2 }, 'You lose the final. You are fresh in April.')] },
  lg_deadline_day: { at: 'mid', req: { team: true, seasons: [1, null] }, when: (L) => clubNet(L, L.team) > 3 && (!L.season || !L.season.deadline || (L.season.deadline.mode === 'buy' && !L.season.deadline.got)), w: 1, rar: 'uncommon',
    t: 'The buyout market. The front office is still buying.', x: 'The deadline passed with no deal. Now they want a veteran off the buyout market. They ask what the team needs.',
    o: [O('A shooter', { win: 0.4 }, 'They get one. Your driving lanes open up.'),
      O('A defender', { win: 0.4, def: 1 }, 'They get one. You finally get a night off from the best scorer.')] },
  lg_lockout: { at: 'off', req: { seasons: [2, null] }, when: (L) => !recall(L, 'lg.lockout') && L.year % 11 === 3, w: 4, rar: 'rare',
    t: 'A lockout.', x: 'The owners and the players cannot agree. The gyms are closed.',
    o: [O('Join the bargaining table', { trust: 3, fame: 2 }, 'You sit in on the meetings. It is boring and important.', { set: ['lg.lockout', 'union.role'] }),
      O('Play overseas for a month', { cash: 0.2, iq: 1 }, 'A month in a league you have never heard of. Then it ends.', { set: 'lg.lockout' })] },
  lg_expansion: { at: 'off', req: { seasons: [3, null], team: true }, when: (L) => !recall(L, 'lg.expansion') && L.year % 13 === 5, w: 4, rar: 'rare',
    t: 'Two expansion teams.', x: 'Each club can protect eight players. You are waiting to see the list.',
    o: [O('Call {gm}', { trust: 2 }, 'He says you are protected. He says it before you finish the question.', { set: 'lg.expansion' }),
      O('Wait for the list', { morale: -2 }, 'You are protected. You read it four times anyway.', { set: 'lg.expansion' })] },
  lg_rule_change: { at: 'off', req: { seasons: [2, null] }, when: (L) => !recall(L, 'lg.rule') && L.year % 7 === 2, w: 3, rar: 'uncommon',
    t: 'The league changes a rule.', x: 'No more hand checking on the perimeter. Officials will call it tight.',
    o: [O('Learn to defend without your hands', { def: 1, iq: 1 }, 'A summer of slides and angles.', { set: 'lg.rule' }),
      O('Attack it on offense', { fin: 1 }, 'Free throws for everybody. You plan to take most of them.', { set: 'lg.rule' })] },
  lg_new_arena: { at: 'off', req: { team: true, seasons: [3, null] }, when: (L) => !recall(L, 'lg.arena') && L.year % 9 === 4, w: 3, rar: 'rare',
    t: 'A new arena.', x: 'The club moves downtown next season. Your face is on the construction fence.',
    o: [O('Help design the locker room', { morale: 4 }, 'A barber chair, a cold tub and a lot of space.', { set: 'lg.arena' }),
      O('Keep one thing from the old place', { morale: 6 }, 'They give you the scorer\'s table chair. It goes in your garage.', { set: 'lg.arena' })] },
  lg_lottery_show: { at: 'off', req: { team: true }, when: (L) => clubNet(L, L.team) < -4 && L.history.length >= 1 && L.history[L.history.length - 1].seed > 10, w: 3,
    t: 'The lottery show.', x: 'Your team has the third-best odds. Ping pong balls decide your next teammate.',
    o: [O('Watch with the staff', { trust: 3 }, '', { do: (L, r) => { if (ok(r, 0.3)) { L.league.net[L.team] = (L.league.net[L.team] || 0) + 1.5; bump(L, { morale: 6 }); return 'Number one. The room erupts. A future star is coming.'; } return 'Fifth. Fine. Somebody good is still there.'; } }),
      O('Watch from the golf course', { morale: 2 }, 'You find out from forty texts at once.')] },
});

storyArcs({
  arc_mentor2_2: { at: 'mid', stage: 'nba', req: { team: true },
    t: '{rookie2} is taking your minutes.', x: (L) => arcData(L, 'mentor2').teach ? 'The things you taught him are working. Against you.' : 'He plays like he has something to prove. To you.',
    o: [O('Keep teaching him', { trust: 6, min: -2 }, 'He thanks you on the broadcast. By name.', { go: ['mentor2', 'arc_mentor2_3', 'off', 0], do: (L) => { arcData(L, 'mentor2').kind = 'mentor'; } }),
      O('Compete for every minute', { eth: 4, health: -3 }, 'Practices turn into wars. Both of you get better.', { go: ['mentor2', 'arc_mentor2_3', 'off', 0], do: (L) => { arcData(L, 'mentor2').kind = 'rival'; } })] },
  arc_mentor2_3: { at: 'off', stage: 'nba',
    t: 'The handoff.', x: '{rookie2} made his first All-Star ballot. He calls you before anyone else.',
    o: [O('Tell him he earned it', { morale: 8 }, 'He says you earned half of it.', { end: ['mentor2', 'mentor'], rel: [['rookie2', 25, 'He called you first.']] }),
      O('Tell him you are not done yet', { fame: 2, eth: 3 }, 'He laughs. He knows you mean it.', { end: ['mentor2', 'both'] })] },
  arc_farewell_2: { at: 'mid', stage: 'nba',
    t: 'The farewell tour.', x: 'Every road arena plays a video. The gifts pile up in the equipment room.',
    o: [O('Stop and thank every crowd', { fame: 5, morale: 8 }, 'A rocking chair, a surfboard, a painting of you as a kid.', { go: ['farewell', 'arc_farewell_3', 'late', 0] }),
      O('Keep your head down and win', { win: 0.4 }, 'You wave once a night. Then you go to work.', { go: ['farewell', 'arc_farewell_3', 'late', 0] })] },
  arc_farewell_3: { at: 'late', stage: 'nba',
    t: 'The last home game.', x: 'April. Your number is painted on the floor. Your family is in the front row.',
    o: [O('Speak to the crowd', { morale: 10, fame: 4 }, 'Four minutes. You thank the ushers by name.', { end: ['farewell', 'speech'], log: 'Played the last home game of a farewell season.' }),
      O('Just walk off slowly', { morale: 8 }, 'You touch the floor on the way out. They do not stop cheering.', { end: ['farewell', 'quiet'], log: 'Played the last home game of a farewell season.' })] },
});

/* Arc nodes whose answer is decided by what happened, not by the button: two
   ways to meet it, one result. Declared so the arc tables can name them. */
function shoeLaunch(L, r) {
  const d = arcData(L, 'shoe'); const p = 0.35 + (d.story ? 0.15 : 0) + (d.better ? 0.1 : 0) + (L.m.fame - 60) * 0.01;
  if (ok(r, p)) { arcEnd(L, 'shoe', 'soldout'); L.endorseBonus = (L.endorseBonus || 0) + 4; bump(L, { fame: 5 }); return 'Sold out in nine minutes. A line around the block.'; }
  if (ok(r, 0.5)) { arcEnd(L, 'shoe', 'cult'); L.endorseBonus = (L.endorseBonus || 0) + 1.5; return 'Slow sales. Then collectors find it. It becomes a cult shoe.'; }
  arcEnd(L, 'shoe', 'flop'); return 'It sits on the shelf. You wear it anyway.'; }
function cursePlay(L) { arcGo(L, 'curse', 'arc_curse_3', 'off', 0); return 'Whatever happens, the city will say it was the curse.'; }
function curseVerdict(L) { const h = L.history[L.history.length - 1]; if (h && h.po === 'Champion') { arcEnd(L, 'curse', 'broken'); remember(L, 'legend.cursebroken', true); bump(L, { fame: 8, morale: 10 }); return 'They rename a street. The curse is over.'; } arcEnd(L, 'curse', 'held'); bump(L, { morale: -3 }); return 'The curse wins this one. The city says next year.'; }

// ── the legend layer (NARRATIVE.md 7.12) ──

/* A SPORTS MOVIE, NOT A FANTASY NOVEL. Rare, a little heightened, every person
   in it invented, and all of it gone when the legend switch is off. */
story({
  lg_ellis_summer: { at: 'hs_sum col_off', legend: true, w: 3, rar: 'rare',
    t: 'An old man at the park.', x: '{ellis}. Nobody knows how old he is. He watches you for an hour, then says one word: "Again."',
    o: [O('Do it again', { iq: 2, fin: 2 }, 'He teaches you a move that is not on any tape. A hesitation that should not work.', { set: 'legend.ellis', start: ['ellis', 'arc_ellis_2', 'late', 3] }),
      O('Ask who he is', { morale: 2 }, 'He laughs and walks away. The next day he is back on the same bench.', { set: 'legend.ellis', start: ['ellis', 'arc_ellis_2', 'late', 3] })] },
  lg_lucky: { at: 'early mid', legend: true, req: { team: true }, w: 2, rar: 'rare',
    t: 'A lucky pair of socks.', x: 'You wore them in the best game of your life. You have worn them every game since.',
    o: [O('Believe in them', { morale: 6 }, 'You win nine straight. You do not wash them. The training room is concerned.', { set: 'legend.lucky', start: ['lucky', 'arc_lucky_2', 'late', 0] }),
      O('Laugh at yourself', { morale: 2 }, 'You wear them anyway. Just in case.', { set: 'legend.lucky', start: ['lucky', 'arc_lucky_2', 'late', 0] })] },
  lg_curse: { at: 'pre', legend: true, req: { team: true, seasons: [3, null] }, when: (L) => clubNet(L, L.team) > 1 && !L.history.some((h) => h.t === L.team && (h.aw || []).indexOf('champ') >= 0), w: 2, rar: 'rare',
    t: 'The curse.', x: (L) => 'The city believes the ' + nick(L.team) + ' are cursed. An old radio host has a theory about a traded goat.',
    o: [O('Say curses are not real', { trust: 2 }, 'The city laughs. Nervously.', { set: 'legend.curse', start: ['curse', 'arc_curse_2', 'late', 0] }),
      O('Visit the old radio host', { fame: 3 }, 'He gives you a list of rituals. You do two of them.', { set: 'legend.curse', start: ['curse', 'arc_curse_2', 'late', 0, { ritual: 1 }] })] },
  lg_cult_movie: { at: 'off', legend: true, req: { mem: ['ent.movie'] }, w: 4, rar: 'uncommon',
    t: 'Your movie is a cult classic.', x: 'The bad comedy with your two lines. College kids quote it at midnight screenings.',
    o: [O('Show up at a screening', { fame: 6, morale: 6 }, 'You do your line live. The theater shakes.', { set: 'legend.cult' }),
      O('Pretend it never happened', { morale: 2 }, 'It keeps happening without you.', { set: 'legend.cult' })] },
  lg_dre9: { at: 'off', legend: true, req: { rival: true, seasons: [4, null] }, when: (L) => !!L.rival && L.rival.name === CAST.dre, w: 4, rar: 'rare',
    t: 'An old team photo.', x: 'Your mom finds a photo of you at nine, third row. The kid beside you is {dre}.',
    o: [O('Send it to him', { morale: 8 }, 'He calls at midnight. Neither of you remembered. Neither of you can stop laughing.', { set: 'legend.dre9', rel: [['dre', 25, 'You found the team photo from when you were nine.']] }),
      O('Keep it for the speech', { morale: 4 }, 'You put it in a drawer marked "someday."', { set: 'legend.dre9' })] },
  lg_lazlo: { at: 'off', legend: true, req: { team: true, seasons: [3, null] }, w: 2, rar: 'rare',
    t: 'A billionaire buys the team.', x: (L) => '{lazlo} now owns the ' + nick(L.team) + '. He wears a cape to his first press conference.',
    o: [O('Take his call', { fame: 2 }, 'He wants you in the new uniform he designed. It has tassels.', { set: 'legend.lazlo', start: ['lazlo', 'arc_lazlo_2', 'mid', 1] }),
      O('Let {agent:first} take it', { trust: 1 }, 'He sends a gift basket shaped like you.', { set: 'legend.lazlo', start: ['lazlo', 'arc_lazlo_2', 'mid', 1] })] },
  lg_midnight: { at: 'off', legend: true, req: { seasons: [1, null] }, w: 2, rar: 'rare',
    t: 'A midnight run.', x: 'You cannot sleep. There is a game under the lights at the park near the hotel.',
    o: [O('Play in a hoodie', { morale: 8, fame: 5 }, 'Nobody recognizes you for six games. Then somebody films it.', { set: 'legend.midnight' }),
      O('Just watch', { morale: 4 }, 'An old man on the bench says you look like a pro. You say thanks.', { set: 'legend.midnight' })] },
  lg_mascot: { at: 'mid', legend: true, req: { team: true }, w: 2, rar: 'rare',
    t: 'The mascot started it.', x: '{mascot}, the other team\'s mascot, mocks your free throw routine. Every time.',
    o: [O('Mock him back', { fame: 4 }, 'You do his dance after a three. The crowd adores it.', { set: 'legend.mascot', start: ['mascot', 'arc_mascot_2', 'off', 1, { war: 1 }] }),
      O('Give him a high five', { morale: 4 }, 'He freezes. Then he hugs you. A legend begins.', { set: 'legend.mascot', start: ['mascot', 'arc_mascot_2', 'off', 1] })] },
  lg_apex: { at: 'off', legend: true, req: { ovr: [76, null], seasons: [3, null], age: [25, 32] }, w: 5, rar: 'rare',
    t: 'A rival league offers double.', x: 'The Apex League. New teams, new money, one season. They want a face.',
    o: [O('Jump for a season', { cash: 6, fame: 6, trust: -20 }, 'You sign. The league office is furious. Your phone is on fire.', { set: 'legend.apex', start: ['apex', 'arc_apex_2', 'early', 1] }),
      O('Stay', { trust: 8, morale: 2 }, 'You say no on a podcast. The number leaks anyway.')] },
  lg_dream: { at: 'off', legend: true, when: (L) => { const h = L.history[L.history.length - 1]; return !!h && h.y === L.year && /R2|CF|Finals/.test(h.po || ''); }, w: 8, rar: 'rare',
    t: 'The dream.', x: 'Every night since the loss. The same shot. The same rim.',
    o: [O('In the dream, shoot it again', { morale: 6 }, 'It goes in. You wake up smiling. You go to the gym at five.', { set: 'legend.dream' }),
      O('In the dream, pass it', { iq: 2, morale: 4 }, 'Your teammate hits it. You wake up and call him.', { set: 'legend.dream' })] },
  lg_fortune: { at: 'early', legend: true, req: { seasons: [0, 2], team: true }, w: 2, rar: 'rare',
    t: 'A fortune teller on a road trip.', x: 'A storefront near the hotel in New Orleans. She looks at your hand and says one number.',
    o: [O('Ask what it means', { morale: 3 }, '"You will know." You do not know. Yet.', { set: 'legend.fortune' }),
      O('Laugh and leave a tip', { morale: 2 }, 'She calls after you: "Wear it."', { set: 'legend.fortune' })] },
  lg_mask: { at: 'off', legend: true, req: { seasons: [2, null], fame: [40, null] }, w: 2, rar: 'rare',
    t: 'A streetball tour, in a mask.', x: 'A summer tour of city parks. A masked player nobody can identify. If you want.',
    o: [O('Put on the mask', { fame: 6, morale: 8, health: -3 }, 'Twelve cities. The internet has theories. None of them are you. Until one is.', { set: 'legend.mask' }),
      O('Leave it to somebody else', { health: 3 }, 'You watch the clips. You are fairly sure you know who it is.')] },
  lg_comet: { at: 'pre', legend: true, req: { seasons: [2, null], team: true }, w: 1, rar: 'rare',
    t: 'Everything is going in.', x: 'Training camp. You have not missed in four days. The coaches stop counting.',
    o: [O('Ride it', { sho: 4, fin: 2, fame: 4 }, 'A season where the rim looks like an ocean.', { set: 'legend.comet', start: ['comet', 'arc_comet_2', 'off', 0] }),
      O('Do not talk about it', { sho: 3, fin: 2 }, 'You tell nobody. You keep shooting.', { set: 'legend.comet', start: ['comet', 'arc_comet_2', 'off', 0] })] },
  lg_ghost: { at: 'mid', legend: true, req: { age: [33, null], team: true }, w: 2, rar: 'rare',
    t: 'A stranger in your jersey.', x: 'Every home game for ten years. Same seat, same faded jersey, your rookie number. Nobody knows his name.',
    o: [O('Send him a signed ball', { morale: 6 }, 'He is gone before the usher gets there. The seat is empty.', { set: 'legend.ghost' }),
      O('Find him after the game', { morale: 4 }, 'He shakes your hand and says, "Thank you for all of it." Then he is gone.', { set: 'legend.ghost' })] },
  lg_exhibition: { at: 'off', legend: true, req: { age: [30, null], stars: [1, null] }, w: 6, rar: 'rare',
    t: 'A game against legends.', x: 'A TV network invents a one-night game. Today\'s stars against a team of old greats.',
    o: [O('Play it like Game 7', { fame: 6, health: -4 }, 'You win by one. The old guys argue about the last call for a year.', { set: 'legend.exhibition' }),
      O('Enjoy it', { morale: 8 }, 'You trade stories on the bench. You lose. You do not care.', { set: 'legend.exhibition' })] },
  lg_four_point: { at: 'off', legend: true, req: { seasons: [3, null] }, when: (L) => L.rt.sho >= 70 && !recall(L, 'legend.four'), w: 2, rar: 'rare',
    t: 'The league tries a four-point line.', x: 'Thirty-two feet. One season, as an experiment.',
    o: [O('Practice it all summer', { sho: 2, fame: 4 }, 'You hit nine in the first month. The experiment is extended.', { set: 'legend.four' }),
      O('Ignore it', { iq: 1 }, 'You keep taking good shots. Others do not.', { set: 'legend.four' })] },
  lg_relocation: { at: 'off', legend: true, req: { team: true, seasons: [5, null] }, when: (L) => clubNet(L, L.team) < -3, w: 2, rar: 'rare',
    t: 'They might move the team.', x: '{lazlo} has a stadium plan in another city. The fans are marching downtown.',
    o: [O('March with them', { fame: 6, morale: 6, trust: -4 }, 'Ten thousand people and you at the front. The plan dies in a month.', { set: 'legend.relocation' }),
      O('Stay out of it', { trust: 2 }, 'The plan dies anyway. Some fans remember you stayed quiet.', { set: 'legend.relocation' })] },
});

storyArcs({
  arc_ellis_2: { at: 'late', stage: 'nba', legend: true, req: { team: true },
    t: '{ellis} is in the building.', x: 'Courtside, in a tracksuit, years after the park. The night before the playoffs.',
    o: [O('Use his move tonight', { fin: 2, fame: 3 }, 'The hesitation. It works. He nods once and leaves at halftime.', { end: ['ellis', 'move'] }),
      O('Go say hello', { morale: 8 }, 'He says, "Again." You laugh until your teammates stare.', { end: ['ellis', 'hello'] })] },
  arc_lucky_2: { at: 'late', stage: 'nba', legend: true,
    t: 'The socks are gone.', x: 'The night before the playoffs. The laundry service washed them. They shrank.',
    o: [O('Panic', { morale: -4 }, 'You make the equipment manager drive to three stores.', { end: ['lucky', 'lost'] }),
      O('It was always you', { morale: 6, iq: 1 }, 'You play in new socks. You play great.', { end: ['lucky', 'you'] })] },
  arc_curse_2: { at: 'late', stage: 'nba', legend: true,
    t: 'The playoffs, and the curse.', x: (L) => (arcData(L, 'curse').ritual ? 'You did the rituals. ' : '') + 'The city holds its breath.',
    o: [O('Play anyway', {}, '', { do: cursePlay }),
      O('Wear the old jersey to warmups', { fame: 2 }, '', { do: cursePlay })] },
  arc_curse_3: { at: 'off', stage: 'nba', legend: true,
    t: 'The curse, one more summer.', x: (L) => { const h = L.history[L.history.length - 1]; return h && h.po === 'Champion' ? 'You won it. The radio host cries on air.' : 'Not this year. The radio host has a new theory.'; },
    o: [O('Read what the city says', {}, '', { do: curseVerdict }),
      O('Turn off the radio', { morale: 1 }, '', { do: curseVerdict })] },
  arc_lazlo_2: { at: 'mid', stage: 'nba', legend: true, req: { team: true },
    t: '{lazlo} has a demand.', x: 'He wants you to sing the anthem before the rivalry game. He says it is in your contract. It is not.',
    o: [O('Sing it', { fame: 6, morale: 4 }, 'You are not good. The building sings with you. It is beautiful.', { end: ['lazlo', 'sang'], rel: [['lazlo', 25, 'You sang the anthem.']] }),
      O('Politely refuse', { trust: 3 }, 'He sends a gold-plated basketball and a note that says "Next time."', { end: ['lazlo', 'refused'], rel: [['lazlo', -10]] })] },
  arc_mascot_2: { at: 'off', stage: 'nba', legend: true,
    t: '{mascot} writes you a letter.', x: (L) => arcData(L, 'mascot').war ? 'He says the feud was the best year of his life. He wants a rematch.' : 'He says you were the only player who ever high fived him.',
    o: [O('Make peace on camera', { fame: 4, morale: 6 }, 'A truce at midcourt. He gives you his tail. You keep it forever.', { end: ['mascot', 'friends'] }),
      O('Rematch', { fame: 5 }, 'The dance-off goes viral. You lose. On purpose.', { end: ['mascot', 'rivals'] })] },
  arc_apex_2: { at: 'early', stage: 'nba', legend: true, req: { team: true },
    t: 'Back in the NBA.', x: 'The Apex League folded after one season. Every arena boos you this December.',
    o: [O('Win them back slowly', { trust: 6, eth: 4 }, 'By March they mostly stop.', { end: ['apex', 'won'] }),
      O('Embrace the villain role', { fame: 6, morale: 2 }, 'You cup your ear in every road building. It becomes your thing.', { end: ['apex', 'villain'] })] },
  arc_comet_2: { at: 'off', stage: 'nba', legend: true,
    t: 'The comet passes.', x: 'The summer after the season where nothing missed. Your shot feels normal again.',
    o: [O('Chase it back', { sho: -2, eth: 4 }, 'It never fully comes back. You become a better player chasing it.', { end: ['comet', 'chased'] }),
      O('Be grateful for it', { sho: -2, morale: 6 }, 'One season like that is more than most get.', { end: ['comet', 'grateful'] })] },
});

/* APRIL, SEPTEMBER AND THE SUMMER. A sweep of sixty careers found the same
   four cards winning every April (the playoff assignment, the exit interview,
   a hamstring, a guarantee), because almost nothing else could be dealt
   between the last regular season game and the first playoff game, and every
   September offered nothing but the training card and the goal. These are
   the moments those weeks actually hold, each read off where the season
   stands, and each dealt once a career. */
const inPO = (L) => !!(L.season && L.season.po && !L.season.po.out);
const missedPO = (L) => !!(L.season && L.season.po && L.season.po.out && !(L.season.po.results || []).length);
const firstPO = (L) => inPO(L) && !L.history.some((h) => h.po && h.po !== 'Missed' && h.po !== 'Play-in');
const newHere = (L) => { const h = lastH(L); return !!(h && L.team && h.t !== L.team); };
story({
  apr_top_seed: { at: 'late', req: { team: true }, when: (L) => inPO(L) && L.season.seed === 1, w: 3,
    t: 'The top seed. Home court all the way.', x: '{gm} says every home game sold out in under an hour.',
    o: [O('Tell the city to get loud', { fame: 3, morale: 3 }, 'The clip runs all week. Nobody sits down in Game 1.'),
      O('Say nothing about it', { trust: 3 }, '{beat} calls you boring. You are fine with boring.')] },
  apr_underdog: { at: 'late', req: { team: true }, when: (L) => inPO(L) && L.season.seed >= 6, w: 3,
    t: 'Nobody picks you.', x: 'Every panel on TV has you out in five. {tm} printed the predictions and taped them up.',
    o: [O('Leave them on the wall', { morale: 5, win: 0.2 }, 'You walk past them twice a day. So does everybody.'),
      O('Tear them down', { trust: 2 }, 'Worry about yourselves, you say. The room nods.')] },
  apr_playin: { at: 'late', req: { team: true }, when: (L) => inPO(L) && L.season.seed >= 7, w: 3,
    t: 'One game to get in.', x: 'The play-in is Tuesday. Lose it and the season ends that night.',
    o: [O('Treat it like Game 7', { win: 0.2, health: -2 }, 'You sleep badly and play well. Mostly.'),
      O('Keep it loose', { morale: 4 }, 'Music on in the locker room. Nobody looks tight.')] },
  apr_first_po: { at: 'late', req: { team: true }, when: (L) => firstPO(L), w: 4, rar: 'common',
    t: 'Your first playoffs.', x: '{tvet} has played forty playoff games. He pulls you aside after practice.',
    o: [O('Ask him what changes', { iq: 1, trust: 2 }, 'Everything slows down, he says. Then it speeds up.', { rel: [['tvet', 10, 'He walked you through your first playoffs.']] }),
      O('Tell him you are ready', { fame: 1, morale: 2 }, 'He laughs. You will find out Saturday.')] },
  apr_rematch: { at: 'late', req: { team: true }, when: (L) => { const h = lastH(L); return inPO(L) && !!h && h.t === L.team && h.po && ['R1', 'R2', 'CF', 'Finals'].indexOf(h.po) >= 0; }, w: 2,
    t: 'Last year still stings.', x: 'You kept the elimination game on your phone. You have not watched it.',
    o: [O('Watch it tonight', { def: 1, morale: -2 }, 'Every mistake, twice. You are angry in a useful way.'),
      O('Delete it', { morale: 4 }, 'New year. New bracket.')] },
  apr_tickets: { at: 'late', req: { team: true }, when: (L) => inPO(L), w: 2,
    t: 'Everybody wants playoff tickets.', x: 'Forty texts from people you have not heard from since high school.',
    o: [O('Buy them a whole section', { cash: -0.05, morale: 3 }, 'Two hundred seats in your colors. {mom} runs the group chat.'),
      O('Turn your phone off', { health: 2, morale: 1 }, 'Silence. You sleep nine hours.')] },
  apr_speech: { at: 'late', req: { team: true, yearsHere: [2, null] }, when: (L) => inPO(L) && L.m.trust >= 50, w: 2,
    t: '{tm} asks you to talk before Game 1.', x: 'First time anybody has asked. The room will be quiet.',
    o: [O('Keep it to twelve words', { trust: 3, win: 0.2 }, 'The room is up before you finish.', { rel: [['tm', 8]] }),
      O('Let the play talk', { morale: 1 }, 'You nod at him. He gets it.')] },
  apr_family: { at: 'late', req: { team: true }, when: (L) => inPO(L), w: 1.5,
    t: 'Your family wants to come to Game 1.', x: '{mom} has already booked the flight. Nobody asked you.',
    o: [O('Get them good seats', { morale: 4 }, 'Front row. She made a sign. It is enormous.', { rel: [['mom', 8]] }),
      O('Ask them to watch at home', { health: 1 }, 'She watches with the sound all the way up.', { rel: [['mom', -4]] })] },
  apr_contract: { at: 'late', req: { team: true }, when: (L) => inPO(L) && !!L.contract && L.contract.years === 1 && L.contract.kind !== 'rookie', w: 2,
    t: 'Your contract runs out in June.', x: '{agent} says every playoff game is worth money now.',
    o: [O('Block it out', { trust: 2 }, 'Basketball now. Money in July.'),
      O('Go over the numbers', { morale: -2, fame: 1 }, 'He walks you through it. You sleep worse.')] },
  apr_rest_up: { at: 'late', req: { team: true }, when: (L) => inPO(L) && L.season.seed <= 6 && L.m.health < 70, w: 3,
    t: 'Rest before Game 1.', x: '{gm} wants you off the court until Saturday. No practice at all.',
    o: [O('Take the days', { health: 10 }, 'Three days in the cold tub. You feel new.'),
      O('Practice anyway', { health: -4, eth: 2, trust: -2 }, 'You shoot alone at night. Nothing happens. This time.')] },
  apr_season_over: { at: 'late', req: { team: true }, when: (L) => missedPO(L), w: 3,
    t: 'The season is over.', x: 'No playoffs. {owner} came down to the locker room after the last game.',
    o: [O('Thank him for coming', { trust: 3 }, 'He asks what you need. You tell him.'),
      O('Go and sign for the fans', { fame: 3, morale: 2 }, 'You sign until they turn the lights off.')] },
  apr_lottery: { at: 'late', req: { team: true }, when: (L) => missedPO(L) && L.season.l > L.season.w + 10, w: 2,
    t: 'Ping pong balls.', x: 'The draft lottery is next month. {gm} wants you there on TV, for luck.',
    o: [O('Go and wear the suit', { fame: 3 }, 'The camera finds you twice. You look nervous both times.'),
      O('Watch at home', { morale: 2 }, 'You watch with {mom}. She yells at a ping pong ball.')] },
  apr_last_home: { at: 'late', req: { team: true, age: [33, null] }, w: 3,
    t: 'Maybe that was the last home game.', x: 'Nobody said it. The crowd stood for a full minute when you checked out.',
    o: [O('Watch the clip again', { morale: 6 }, 'Twelve times. You do not cry until the ninth.'),
      O('Do not think about it', { morale: 2 }, 'You think about it all week anyway.')] },
  apr_awards: { at: 'late', req: { team: true, ovr: [84, null] }, when: (L) => !!L.season && L.season.w > L.season.l, w: 2,
    t: '{agent} wants to run an awards campaign.', x: 'Billboards near the voters. A website. He says everybody does it.',
    o: [O('Run it', { cash: -0.1, fame: 4 }, 'The billboards go up. Some voters roll their eyes.'),
      O('Let the season talk', { trust: 2 }, 'He sighs. Fine.')] },

  sep_conditioning: { at: 'pre', req: { team: true }, w: 3,
    t: 'The conditioning test is Monday.', x: 'Seventeen sideline sprints, under a minute each. {trainer} holds the stopwatch.',
    o: [O('Show up in shape', { trust: 3 }, 'You win it. {tm} throws up in a trash can.', { p: (L) => clamp(L.eth / 100 + 0.2, 0.3, 0.95), no: { fx: { trust: -3 }, s: 'You finish last. The whole gym hears about it.' } }),
      O('Ask to skip it', { trust: -2, health: 2 }, '{trainer} writes your name down. In red.')] },
  sep_number: { at: 'pre', req: { team: true }, when: (L) => newHere(L), w: 3,
    t: 'Your old number is taken.', x: '{tvet} has worn it here for six years.',
    o: [O('Pick a new number', { morale: 1 }, 'Fresh start, fresh number. The jersey looks right by October.'),
      O('Offer to buy it', { cash: -0.05, fame: 1 }, 'He takes the money and a watch. Smart man.', { rel: [['tvet', 6]] }),
      O('Ask him nicely', {}, 'He says no. Nicely.', { rel: [['tvet', 3]] })] },
  sep_new_home: { at: 'pre', req: { team: true }, when: (L) => newHere(L), w: 3,
    t: 'Finding a place to live.', x: 'A loft downtown or a house out by the practice gym.',
    o: [O('The loft downtown', { fame: 2, morale: 2 }, 'Restaurants downstairs. Fans outside. You learn the side door.'),
      O('The house by the gym', { health: 3, eth: 2 }, 'Quiet. Twelve minutes to practice. You get there first.')] },
  sep_captain: { at: 'pre', req: { team: true, yearsHere: [3, null], age: [25, null] }, when: (L) => L.m.trust >= 55, w: 3,
    t: 'They want you as a captain.', x: '{gm} says the room voted. It was not close.',
    o: [O('Accept it', { trust: 4, morale: 3 }, 'The C goes on the jersey. The room listens a little harder.'),
      O('Hand it to {tvet}', { trust: 2 }, 'He is surprised. He does not forget it.', { rel: [['tvet', 12, 'You gave him the captaincy.']] })] },
  sep_rookies: { at: 'pre', req: { team: true, seasons: [4, null] }, w: 2,
    t: 'The rookies carry the bags.', x: '{trook} asks you if he really has to.',
    o: [O('Tell him yes', { trust: 1 }, 'He carries them all year. He complains the whole time.', { rel: [['trook', -3]] }),
      O('Carry your own', { morale: 2 }, 'The rookies notice. So does {tvet}.', { rel: [['trook', 8]] })] },
  sep_trip: { at: 'pre', req: { team: true }, w: 2,
    t: 'Preseason games overseas.', x: 'Two games abroad. Long flights, packed arenas, a clinic every morning.',
    o: [O('Run the clinics', { fame: 3, health: -2 }, 'Two hundred kids a day. One of them crosses you over.'),
      O('Sleep on the plane', { health: 3 }, 'You land fresh. Everybody else lands wrecked.')] },
  sep_rankings: { at: 'pre', req: { team: true, seasons: [1, null] }, w: 2,
    t: 'The player rankings are out.', x: (L) => 'One outlet ranks you ' + ordinal(clamp(Math.round((97 - ovrOf(L)) * 5), 1, 150)) + ' in the league.',
    o: [O('Screenshot it', { morale: 2, eth: 2 }, 'It is your phone wallpaper by lunch.'),
      O('Do not look', { morale: 1 }, '{tm} reads it to you anyway.')] },
  sep_holdout: { at: 'pre', req: { team: true, fame: [55, null], ovr: [80, null] }, when: (L) => !!L.contract && L.contract.years >= 2, w: 2,
    t: '{agent} says you are underpaid.', x: 'He wants you to skip the first week of camp.',
    o: [O('Report on time', { trust: 4 }, 'You walk in first. {gm} notices.', { rel: [['gm', 6]] }),
      O('Hold out a week', { trust: -8, fame: 3 }, 'A week of headlines. You report anyway. Nothing changes.', { rel: [['gm', -10, 'You held out of camp.']] })] },
  sep_jersey: { at: 'pre', req: { team: true, fame: [62, null] }, w: 2,
    t: 'Your jersey is top five in sales.', x: 'The team store cannot keep it on the shelf.',
    o: [O('Sign a hundred for charity', { fame: 2, morale: 3 }, 'They sell in nine minutes.'),
      O('Buy one for {mom}', { morale: 2 }, 'She wears it to church.')] },
  sep_bet: { at: 'pre', req: { team: true }, w: 1.5,
    t: '{tm} bets you on three-point contests.', x: 'Loser buys dinner for the whole team, every week of camp.',
    o: [O('Take the bet', { sho: 1, cash: -0.02 }, 'You win four weeks. You lose one. He orders lobster.'),
      O('Raise it', { morale: 3, cash: -0.05 }, 'Now it is the whole staff too. You lose twice.', { rel: [['tm', 6]] })] },

  jun_parade: { at: 'off', req: { team: true }, when: (L) => !!(L.season && L.season.po && L.season.po.champ), w: 5, rar: 'common',
    t: 'The parade is Monday.', x: 'Two million people downtown. {tm} has the trophy and will not give it back.',
    o: [O('Grab the microphone', { fame: 6 }, 'You say four sentences. The city chants them all summer.'),
      O('Ride on top of the bus', { morale: 6 }, 'You wave until your arm stops working.')] },
  jun_finals_loss: { at: 'off', req: { team: true }, when: (L) => { const h = lastH(L); return !!h && h.po === 'Finals'; }, w: 4,
    t: 'The other parade.', x: 'Two wins short. Their parade is on every channel.',
    o: [O('Watch the whole thing', { eth: 4, morale: -2 }, 'Every float. You remember every face.'),
      O('Go somewhere with no TV', { morale: 4, health: 3 }, 'A cabin. A lake. No signal.')] },
  jun_draft_room: { at: 'off', req: { team: true, yearsHere: [2, null] }, w: 2,
    t: 'The draft is Thursday.', x: '{gm} invites you to the war room.',
    o: [O('Go to the war room', { trust: 3 }, 'You meet the pick first. The kid is shaking.'),
      O('Watch from home', { morale: 2 }, 'You text the kid. He screenshots it.')] },
  jun_recruit: { at: 'off', req: { team: true, fame: [55, null] }, w: 2,
    t: '{gm} wants help recruiting a free agent.', x: 'One call from you might decide it. It is midnight.',
    o: [O('Make the call', { trust: 4 }, 'He signs on the third day. He says you were the reason.', { p: 0.6, no: { fx: { morale: -2 }, s: 'He signs somewhere else. He was nice about it.' } }),
      O('Stay out of it', {}, 'The front office handles it. Quietly.')] },
  jun_proam: { at: 'off', req: { team: true }, w: 2,
    t: 'A pro-am league wants you for one night.', x: 'A hot gym, no air conditioning, a crowd on the baseline.',
    o: [O('Go and drop fifty', { fame: 4, health: -3 }, 'Fifty-one. The video has more views than your season.'),
      O('Pass this year', { health: 2 }, 'They ask again in August.')] },
  jun_trip: { at: 'off', req: { seasons: [1, null] }, w: 2,
    t: 'Where does the summer go?', x: 'Your group chat has been fighting about it for a week.',
    o: [O('The beach', { morale: 5, health: 2 }, 'Two weeks. You only check the trade rumors twice a day.'),
      O('Back home', { morale: 3 }, '{mom} cooks every night. You gain four pounds.', { rel: [['mom', 6]] }),
      O('Straight back to the gym', { eth: 3 }, 'The gym is empty in June. You like it that way.')] },
  jun_hscoach: { at: 'off', req: { seasons: [3, null] }, w: 2,
    t: '{hscoach} is retiring.', x: 'Thirty years at your old high school. They want you at the dinner.',
    o: [O('Fly in and speak', { morale: 5, fame: 1 }, 'You get through it. Barely. He hugs you for a long time.', { rel: [['hscoach', 15, 'You spoke at his retirement dinner.']] }),
      O('Send a video', { morale: 1 }, 'They play it on a big screen. He watches it twice.', { rel: [['hscoach', 4]] })] },
  jun_scan: { at: 'off', req: { age: [28, null] }, w: 2,
    t: 'Dr. {doctor:last} wants a summer scan.', x: 'Knees, back, ankles. A full day in the tube.',
    o: [O('Get it done', { health: 4, cash: -0.02 }, 'Clean. Mostly. You get a list of stretches.'),
      O('Skip it', { morale: 1 }, 'You feel fine. You hope that is the same thing.')] },
  jun_awards: { at: 'off', req: { team: true }, when: (L) => !!(L.season && L.season.awards.some((a) => a !== 'star' && a !== 'champ')), w: 3,
    t: 'The awards show is in Los Angeles.', x: 'You are on the list. Somebody has to wear a suit.',
    o: [O('Go and dress up', { fame: 4 }, 'The suit trends for a day. Nobody mentions the speech.'),
      O('Watch it from the couch', { morale: 2 }, 'You accept on video, in a hoodie.')] },
  jun_camp: { at: 'off', req: { seasons: [2, null] }, w: 2,
    t: 'Your own youth camp.', x: 'Three hundred kids signed up in a day. They want you there every morning.',
    o: [O('Be there every morning', { fame: 3, morale: 4, health: -2 }, 'Three hundred kids. One of them can really play.'),
      O('Show up on the last day', { fame: 1 }, 'You hand out trophies. They scream anyway.')] },
  jun_film_crew: { at: 'off', req: { fame: [45, null] }, w: 1.5,
    t: 'A trainer wants to film your workouts.', x: 'Five clips a week. His last client went viral twice.',
    o: [O('Let him film', { fame: 4 }, 'The clips do numbers. Other players start asking for him.'),
      O('Keep the gym private', { eth: 2 }, 'Nobody sees the work. It shows up in November.')] },
});

storyFixed({
  lg_one_more_shot: { at: 'post', legend: true,
    t: 'Fifty years old, one shot at halftime.', x: 'A charity night at your old arena. They hand you a ball at half court.',
    o: [O('Shoot it', {}, '', { do: (L, r) => { remember(L, 'legend.halftime', true); const made = ok(r, 0.22 + (L.rt.sho - 60) * 0.006); if (made) remember(L, 'legend.halftime.made', true); finishLife(L, made ? 'At fifty you hit it from half court. The arena loses its mind.' : 'At fifty you hit the front of the rim. They cheer anyway.'); return made ? 'Nothing but net. At fifty.' : 'Front rim. They cheer anyway.'; } }),
      O('Hand it to a kid courtside', {}, '', { do: (L) => { remember(L, 'legend.halftime', true); finishLife(L, 'You handed the ball to a kid at halftime. He made it.'); return 'He makes it. You jump higher than he does.'; } })] },
});

// ── epilogues (NARRATIVE.md 8.4) ──

/* One card each, after the after card. Each answer is the last line of the
   career and finishes it. */
const EP = (t, x, a, b) => ({ at: 'post', t, x, o: [
  O(a[0], a[1] || {}, a[2], { do: (L) => { finishLife(L, a[3]); return null; } }),
  O(b[0], b[1] || {}, b[2], { do: (L) => { finishLife(L, b[3]); return null; } })] });
storyFixed({
  ep_head_coach: EP('Your own bench.', 'Three years as an assistant. Now a team wants you in the big chair.',
    ['Take the rebuilding job', {}, 'Young players and patience. Year four, they make the playoffs.', 'You took a rebuilding team to the playoffs as a head coach.'],
    ['Take the contender', {}, 'Pressure from day one. You win a title in year two.', 'You won a title as a head coach.']),
  ep_assistant: EP('The film room.', 'You start as the fourth assistant. You break down tape at two in the morning.',
    ['Stay patient', {}, 'Nine years. Then the front of the bench. Then the big chair.', 'You worked your way from the film room to a head coaching job.'],
    ['Become the player development guy', {}, 'Every young star in the league wants your summer workouts.', 'Every young star in the league calls you in the summer.']),
  ep_gm: EP('The front office.', 'An ownership group gives you the keys. They want a winner in five years.',
    ['Draft and develop', {}, 'Year five, a sixty-win team. Every starter drafted by you.', 'You built a contender through the draft.'],
    ['Trade for stars', {}, 'Two blockbusters in a summer. A title the next June.', 'You traded for stars and won a title as a general manager.']),
  ep_owner: EP('A seat in the owners\' meeting.', 'You buy a piece of a team. A big enough piece to have a vote.',
    ['Fight for the players', {}, 'The other owners do not love you. The players do.', 'The players trusted you as an owner.'],
    ['Learn the business first', {}, 'Ten quiet years. Then you own the controlling share.', 'You became the first former player to own a controlling share of a team.']),
  ep_broadcast: EP('The desk.', 'A national studio show. A suit, a monitor and three other loud people.',
    ['Be honest', {}, 'Your takes are fair and unpopular. Players text you thanks.', 'You became the honest voice on national television.'],
    ['Be loud', { fame: 4 }, 'Ratings go up. {critic} calls you his rival.', 'You became the loudest voice in basketball television.']),
  ep_league: EP('The league office.', 'Rules, schedules and the players\' side of every table.',
    ['Fix the schedule', {}, 'Fewer back-to-backs. Every trainer sends you flowers.', 'You fixed the schedule at the league office.'],
    ['Run for union president', {}, 'You win in a landslide. Two labor deals and no lockouts.', 'You led the players\' union through two labor deals.']),
  ep_college: EP('Your old school calls.', '{school} needs a head coach. The students already have the signs.',
    ['Take it', {}, 'You sleep in the office the first year. By year three, March is yours again.', 'You came back to coach your old school.'],
    ['Take it, and recruit your old neighborhood', {}, 'Every kid from home wants to play for you.', 'You coached your old school with a roster from your old neighborhood.']),
  ep_hs: EP('The gym where it started.', 'Your old high school needs a coach. The gym still smells the same.',
    ['Coach the varsity', {}, 'State champions in year four. A fire truck parade, again.', 'You went home and won a state title as a coach.'],
    ['Run the youth program', {}, 'Every kid in {town} learns the game from you.', 'You taught every kid in your hometown to play.']),
  ep_business: EP('Business.', 'A boardroom with your name on the glass door.',
    ['Build something slow', {}, 'Real estate and patience. A quiet empire.', 'You built a quiet empire after basketball.'],
    ['Bet big on one idea', {}, 'A sports drink with your face on it. It is everywhere in three years.', 'You bet everything on one idea after basketball, and it worked.']),
  ep_actor: EP('Hollywood.', 'Your agent has a script. You would play a retired player. Easy, he says.',
    ['Take the lead role', {}, 'You are better than anyone expected. Including you.', 'You became a real actor after basketball.'],
    ['Produce instead', {}, 'A documentary about your hometown. It wins awards.', 'You produced a documentary about your hometown.']),
  ep_politics: EP('The city council seat.', 'The seat back home is open. People keep asking you to run.',
    ['Run', {}, 'You win by a lot. New courts in every ward.', 'You won a seat on the city council back home.'],
    ['Back someone better', {}, 'You campaign for a teacher. She wins.', 'You helped a teacher win the city council seat back home.']),
  ep_podcast: EP('The podcast.', 'Three microphones in your basement. Your first guest is a former teammate.',
    ['Tell the real stories', {}, 'The locker room stories nobody has heard. It is number one in a month.', 'Your podcast became the most popular show in basketball.'],
    ['Keep it about the game', {}, 'Film breakdowns and long interviews. Coaches listen.', 'Coaches built practices around your podcast.']),
  ep_comeback: EP('One more comeback.', 'A year off. Your knees feel good. A team calls about a camp invite.',
    ['Go to camp', {}, 'You make the team. Eleven games. A standing ovation on the road.', 'You came back for one more short season after retiring.'],
    ['Say no and smile', {}, 'You keep the voicemail. You play it at dinner parties.', 'You turned down one last comeback and kept the voicemail.']),
  ep_family: EP('Home.', 'Your family. Your town. Nothing to prove.',
    ['Coach your kids\' teams', {}, 'Saturday mornings in a cold gym. The best seat you ever had.', 'You went home and coached your kids on Saturday mornings.'],
    ['Disappear for a while', {}, 'A lake, a boat and no phone. You come back when you are ready.', 'You went home and found a quiet life.']),
});

/* The roads a story career can take out of high school besides college or a
   paycheck: each is a year away, then the draft or a second choice. */
const ALT_DONE = { juco: 'Enrolled at a junior college.', prep: 'Took a prep school year.', gap: 'Took a gap year to train for the draft.', rec: 'Stayed home to play rec league and work.' };
const ALT_SAY = { juco: 'A junior college two hours from home. Nobody here is famous.', prep: 'A boarding school with a coach who wins. One more year.',
  gap: 'No team. A trainer, a gym and a year.', rec: 'Days at the warehouse. Nights at the rec center. You keep playing.' };

/* Answers to the road's own cards. Null means the card is not one of these. */
function chooseAm(L, card, i, opt, rng, beats, touch) {
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
      if (opt.route === 'walkon') {
        L.am.college = opt.school;
        L.am.route = 'college';
        L.am.walkon = true;
        remember(L, 'route.walkon', true);
        logIt(L, 'Walked on at ' + opt.school + '.', 'gold');
        return { text: 'No scholarship. A locker in the corner. You are in.', tone: 'good' };
      }
      if (opt.route && ALT_DONE[opt.route]) {
        L.am.route = opt.route;
        L.am.college = null;
        remember(L, 'route.' + opt.route, true);
        logIt(L, ALT_DONE[opt.route], 'gold');
        return { text: ALT_SAY[opt.route], tone: 'good' };
      }
      if (opt.route) {
        if (storyOn(L)) remember(L, 'route.' + opt.route, true);
        L.am.route = opt.route;
        L.am.college = null;
        logIt(L, opt.route === 'intl' ? 'Turned pro overseas out of high school.' : 'Signed with the G League out of high school.', 'gold');
        return { text: opt.route === 'intl' ? 'You sign a one-year deal overseas.' : 'You sign with the G League.', tone: 'gold' };
      }
      L.am.college = opt.school;
      L.am.route = 'college';
      if (storyOn(L) && SCHOOL_BY[opt.school] && (SCHOOL_BY[opt.school].tier === 'mid' || SCHOOL_BY[opt.school].tier === 'low')) remember(L, 'route.midmajor', true);
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
        if (storyOn(L)) remember(L, 'route.portal', true);
        logIt(L, 'Transferred from ' + from + ' to ' + opt.school + '.', 'gold');
        return { text: 'You transfer to ' + opt.school + '.', tone: 'gold' };
      }
      return { text: 'You pull your name out. You stay.', tone: '' };
    }
    case 'amclutch': {
      const o = clutchOptions(L)[i];
      const s = L.season, t = s.tourney;
      const made = rng() < touched(o.p, touch);
      t.waiting = false;
      if (made) { L.am.winners = (L.am.winners || 0) + 1; bump(L, { fame: 6, morale: 8 }); clutchHit(L, beats); }
      else bump(L, { morale: -8 });
      const tx = made ? 'Good! You are going to remember that one for the rest of your life.' : 'No good. You sit on the floor for a long time.';
      logIt(L, (t.kind === 'hs' ? HS_ROUNDS : NCAA_ROUNDS)[t.cur.r] + ': ' + (made ? 'hit the winner.' : 'missed the last shot.'), made ? 'gold' : 'bad');
      endTourneyGame(L, t, t.cur, made, beats);
      t.cur = null;
      runTourney(L, beats);
      if (t.done) closeAm(L, beats);
      return { text: tx, tone: made ? 'gold' : 'bad', made };
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

/* extra.touch is the playable moment's release, from -1 to 1 (see
   hoops/court.js). It moves a shot's odds by at most TOUCH and nothing else,
   and the shot is still the engine's own seeded draw. A career played with the
   scenes off passes no touch, which is a touch of nought: the odds the card
   always had. */
const TOUCH = 0.12;
function touched(p, touch) { return touch ? clamp(p + touch * TOUCH, 0.05, 0.9) : p; }
function choose(L, i, extra) {
  const card = L.pending[0];
  if (!card) return null;
  const opt = card.options[i];
  if (!opt) return null;
  const touch = extra && Number.isFinite(+extra.touch) ? clamp(+extra.touch, -1, 1) : 0;
  const rng = rngAt(L, 'pick:' + card.key + ':' + i);
  TRADED = null;
  const before = snapshot(L);
  let text = '', tone = '', beats = [], made = null, contest = null;
  L.pending.shift();
  const road = card.id === 'presser' ? choosePresser(L, card, opt, rng) : chooseAm(L, card, i, opt, rng, beats, touch);
  if (road) { text = road.text; tone = road.tone; if (road.made != null) made = road.made; } else switch (card.id) {
    case 'combine': {
      if (card.ctx && card.ctx.story) { ({ text, tone } = chooseCombine(L, i, rng)); break; }
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
      if (storyOn(L)) queueEvents(L, 'predraft', 1 + (rng() < 0.4 ? 1 : 0));
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
      L.pending.unshift(agentCard(L));
      break;
    }
    case 'interview': { ({ text, tone } = chooseInterview(L, card, i, rng)); break; }
    case 'pworkout': { ({ text, tone } = choosePworkout(L, card, i, rng)); break; }
    case 'agent': {
      L.agent = opt.agent;
      text = say(L, '{agent}') + ' it is.';
      if (L.agent === 'cousin') bump(L, { morale: 8 });
      L.phase = 'draft';
      break;
    }
    case 'undrafted': {
      if (card.ctx && card.ctx.story) {
        if (!opt.club) {
          L.flags.overseas = (L.flags.overseas || 0) + 1;
          L.contract = { years: 1, total: 1, salary: 0.8, kind: 'overseas', start: L.year };
          L.phase = 'drafted';
          text = 'A one-year deal in Europe. Real money. Real minutes.';
          logIt(L, 'Signed overseas after going undrafted.', '');
          break;
        }
        /* The floor is 5%: a player too weak to be drafted almost never talks
           his way onto a roster from Summer League. At 10% the high school
           road reached the league 94.9% of the time over 3,000 careers, on
           the 95% ceiling, so CI's 1,000 flapped with any change to the
           seeds. At 5% it is 94.4 on CI's sample and 94.3 on 1,500 roads. */
        const pSL = clamp(0.04 + (ovrOf(L) - 58) * 0.033 + (L.m.fame - 20) * 0.003, 0.05, 0.85);
        if (rng() >= pSL) {
          L.flags.overseas = (L.flags.overseas || 0) + 1;
          L.contract = { years: 1, total: 1, salary: 0.6, kind: 'overseas', start: L.year };
          L.phase = 'drafted';
          text = 'Five games in Las Vegas. Good ones. The ' + nick(opt.club) + ' go another way. You sign overseas.';
          tone = 'bad';
          logIt(L, 'Cut after Summer League. Signed overseas.', 'bad');
          break;
        }
        remember(L, 'sl.made', true);
      }
      L.contract = { years: 1, total: 1, salary: round1(capFor(L.year) * MIN_PCT), kind: 'min', start: L.year };
      /* A two-way deal is mostly G League nights, until the club converts it. */
      if (card.ctx && card.ctx.story) L.contract.tw = 1;
      joinTeam(L, opt.club, false);
      L.draft = { pick: null, round: null, team: opt.club };
      text = L.contract.tw ? 'Two-way deal with the ' + E.teamName(opt.club) + '. Most nights you are in the G League. Prove it.'
        : 'Two-way deal with the ' + E.teamName(opt.club) + '. Prove it.'; tone = 'good';
      logIt(L, text, 'good');
      L.phase = 'drafted';
      openYear(L);
      break;
    }
    case 'training': {
      if (card.ctx && card.ctx.ks) { text = summerChoose(L, card.ctx.ks[i], rng); tone = 'good'; break; }
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
        if (card.ctx.major && storyOn(L)) remember(L, 'inj.major', L.age);
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
        contest = contestField(L, 'dunk', tone === 'gold');
      } else if (i === 1) {
        if (rng() < clamp((L.rt.sho - 65) * 0.025, 0.05, 0.85)) { L.flags.threes = (L.flags.threes || 0) + 1; bump(L, { fame: 8 }); text = 'The money ball rack. Three-point champion.'; tone = 'gold'; }
        else { bump(L, { fame: 2 }); text = 'Out in the first round. You laugh it off.'; }
        contest = contestField(L, 'three', tone === 'gold');
      } else { bump(L, { health: 6 }); text = 'Sunday only. Fresh for the second half.'; }
      logIt(L, text, tone);
      // the field is display, so a career from before it keeps its log as it was
      if (contest && storyOn(L)) logIt(L, contestLine(contest), tone);
      break;
    }
    case 'clutch': {
      const o = clutchOptions(L)[i];
      const cur = L.season.po.cur;
      made = rng() < touched(o.p, touch);
      cur.waiting = false;
      cur.games.push(made ? 1 : 0);
      if (made) { cur.w = 4; L.flags.g7 = (L.flags.g7 || 0) + 1; clutchHit(L, beats); if (storyOn(L)) remember(L, 'g7.made', true); bump(L, { fame: 10, morale: 10 }); text = 'Good! Series over. You will be watching that one for the rest of your life.'; tone = 'gold'; }
      else { cur.l = 4; bump(L, { morale: -10 }); text = 'No good. The building goes silent.'; tone = 'bad'; }
      logIt(L, 'Game 7 against the ' + nick(cur.opp) + ': ' + (made ? 'hit the winner.' : 'missed the last shot.'), made ? 'gold' : 'bad');
      endSeries(L, beats);
      break;
    }
    case 'moment': {
      const r = momentResolve(L, card, i, rng, touch);
      text = r.text; tone = r.tone; made = r.made;
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
    case 'after': {
      if (storyOn(L) && card.ctx && card.ctx.paths) {
        const path = card.ctx.paths[i];
        L.final = legacy(L);
        L.final.path = path;
        L.final.after = AFTER_PATHS.find((p) => p[0] === path)[1] + '.';
        text = 'A new chapter.'; tone = 'gold';
        if (!dealNamed(L, 'post', 'ep_' + path)) finishLife(L, '');
        break;
      }
      L.retired = true;
      L.phase = 'retired';
      L.final = legacy(L);
      L.final.after = chooseAfter(L, i, rng);
      text = L.final.after; tone = 'gold';
      logIt(L, text, 'gold');
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
        if (storyOn(L) && L.history.length && !recall(L, 'route.detour.left')) remember(L, 'route.detour.left', true);
        L.team = null;
        L.contract = { years: 1, total: 1, salary: 0.8, kind: 'overseas', start: L.year + 1 };
        text = 'A year in Europe. Big minutes. A second chance.';
        logIt(L, 'Signed overseas for a year.', '');
      }
      break;
    }
    case 'goal': L.season.goal = card.ctx.ks[i]; L.season.goalWho = card.ctx.who || null; text = pick(rng, ['Locked in. April will tell.', 'Said out loud. No taking it back.', 'Written down. Now go get it.']); break;
    case 'deadline': text = chooseDeadline(L, card, i, rng); tone = L.team !== card.ctx.from ? 'gold' : ''; break;
    case 'coach_talk': text = chooseCoachTalk(L, card, i, rng); break;
    case 'coach_review': text = chooseCoachReview(L, i, rng); break;
    case 'nickname':
      if (i === 0) { L.nick = card.ctx.nm; logIt(L, 'They call you ' + L.nick + '.', 'gold'); feed(L, 'nick', L.name + ' has a name now: ' + L.nick + '.'); text = 'It sticks. Kids at camp call you it.'; tone = 'gold'; }
      else { text = 'They mostly drop it.'; }
      break;
    case 'build_sig': case 'build_arch': case 'build_pos':
      text = chooseBuild(L, card, i) || ''; tone = 'good';
      break;
    default: {
      const ev = evById(card.id);
      watchPick(L, card.id, i, beats);
      if (ev) {
        const o = ev.options[i];
        const names = relNames(L, card.id, i);
        text = o.run(L, rng) || '';
        applyRel(L, names);
        const rp = EVENTS[card.id] && EVENT_REP[card.id] && EVENT_REP[card.id][i];
        if (rp) moveRep(L, rp[0], rp[1]);
      }
    }
  }
  text = say(L, text);
  tradeBeat(L, beats, card.id === 'deadline' ? 'deadline' : card.id);
  headlines(L, beats);
  sayAll(L, beats);
  const after = snapshot(L);
  const res = { card, picked: i, label: opt.label, text, tone, diff: diffOf(before, after), beats };
  if (contest) res.contest = contest;
  if (made != null) res.made = made;
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
    case 'hs_mid': return 'Play the second half';
    case 'hs_reg': return L.season && L.season.qual ? 'Play the state playoffs' : 'Go to the summer';
    case 'hs_po': return 'Keep playing';
    case 'hs_off': return L.am.grade < 12 ? 'Next season' : L.am.route === 'intl' || L.am.route === 'gl' ? 'Turn pro' : 'Go to college';
    case 'col_pre': return 'Tip off the season';
    case 'col_early': return 'Play the conference season';
    case 'col_mid': return 'Conference tournament';
    case 'col_late': return L.season && L.season.tourney ? 'Play the first weekend' : 'Go to the summer';
    case 'col_po': return L.season.tourney.upto <= 2 ? 'Play the second weekend' : 'Go to the Final Four';
    case 'col_off': return L.am.declared ? 'Go to the draft combine' : 'Next season';
    case 'pro_year': return (L.am.altHalf ? 'Finish the ' : 'Play the ') + ({ intl: 'season overseas', gl: 'G League season', juco: 'junior college season',
      prep: 'prep school season', gap: 'gap year', rec: 'rec league year' }[L.am.route] || 'season');
    default: return 'Continue';
  }
}

function step(L) {
  if (L.retired) return { beats: [] };
  if (L.pending.length) return { beats: [], blocked: true };
  TRADED = null;
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
      queueMoment(L, 'early');
      beats.push(recordBeat(L, 'After 27'));
      roleReview(L, beats, 'early');
      rollInjury(L, 'mid', beats);
      L.phase = 'early';
      queueEvents(L, 'early', 1 + (rngAt(L, 'n:early')() < (storyOn(L) ? 0.35 : 0.6) ? 1 : 0));
      break;
    }
    case 'early':
      playChunk(L, 'mid', beats);
      queueMoment(L, 'mid');
      beats.push(recordBeat(L, 'At the break'));
      rollInjury(L, 'late', beats);
      allStarCheck(L, beats);
      midseasonFirings(L, beats);
      roleReview(L, beats, 'break');
      tradeDeadline(L, beats);
      if (storyOn(L)) { L.season.race = mvpRace(L); debate(L); }
      L.phase = 'mid';
      queueEvents(L, 'mid', 1 + (rngAt(L, 'n:mid')() < (storyOn(L) ? 0.3 : 0.5) ? 1 : 0));
      break;
    case 'mid': {
      playChunk(L, 'late', beats);
      queueMoment(L, 'late');
      const s = L.season;
      const st = standings(L);
      startPlayoffs(L, st);
      const aw = awards(L, st);
      leagueAwards(L, aw);
      for (const a of aw) {
        s.awards.push(a);
        beats.push({ kind: 'award', text: AWARD_NAME[a] + '.', tone: 'gold', award: a });
        logIt(L, AWARD_NAME[a] + '.', 'gold');
        bump(L, { fame: a === 'mvp' ? 12 : 4 });
      }
      if (aw.indexOf('mvp') >= 0) L.pending.push(presserCard(L, 'mvp'));
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
    case 'hs_mid': hsSecondHalf(L, beats); break;
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
  tradeBeat(L, beats);
  headlines(L, beats);
  sayAll(L, beats);
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
  const habit = trait(L, 'spender') ? 0.05 : trait(L, 'saver') ? -0.03 : 0;
  L.cash = round1(L.cash + sal * (0.5 - AGENTS[L.agent].fee - habit) + endorse * 0.55 - Math.min(L.cash * (0.08 + habit), 3));
  if (L.season) L.season.salary = sal;
}
function closeSeason(L, beats) {
  const s = L.season;
  if (!s) return;
  const pg = perGame(s);
  const po = s.po || { path: 'Missed' };
  const path = po.champ ? 'Champion' : po.path || 'Missed';
  /* Olympic gold is won in the summer AFTER a season is filed, so the card
     writes it onto the season just closed. Waiting for the next close to
     add it compared the summer's year with the next season's and never
     matched, so no career ever recorded a medal. */
  const before = totals(L);
  L.history.push(Object.assign({ y: s.year, age: L.age, t: s.team, ovr: ovrOf(L), w: s.w, l: s.l, seed: s.seed || null,
    po: path, aw: s.awards.slice(), sal: s.salary || 0, role: s.role ? s.role.label : '' }, pg, storyOn(L) ? { mvpBy: s.mvp || '' } : {}));
  L.seasonsDone++;
  /* A reputation is what you have done lately. It drifts back toward the
     middle every season, so a career of quotes is a persona and one quote
     from eight years ago is not. */
  const rp = repOf(L);
  rp.fans = Math.round(50 + (rp.fans - 50) * 0.8);
  rp.resp = Math.round(50 + (rp.resp - 50) * 0.8);
  milestones(L, before, beats);
  rivalSeason(L, beats);
  traitSeason(L, beats);
  badgeSeason(L, beats);
  goalSeason(L, beats);
  leagueChamp(L, beats);
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
  if (storyOn(L)) L.flags.overseasYears = (L.flags.overseasYears || 0) + 1;
  /* A story career grows less overseas past twenty-five: Europe makes a man
     a pro, and a rec league player does not play his way to the league
     through it at twenty-nine. */
  const up = storyOn(L) && L.age > 25 ? Math.max(0, d - 2) : d;
  for (const k of RATINGS) L.rt[k] = clamp(L.rt[k] + (L.age <= 28 ? up : -1), 25, 99);
  L.earned = round1(L.earned + 0.8);
  L.cash = round1(L.cash + 0.4);
  beats.push({ kind: 'overseas', text: 'A year in Europe. Twenty a night and a lot of pasta.', tone: '' });
  logIt(L, 'Played a season overseas.', '');
  L.season = null;
  L.contract = null;
  L.phase = 'off';
  /* A stashed pick comes back to the club that holds his rights. */
  if (L.flags.rights) {
    const c = L.flags.rights;
    L.flags.rights = null;
    L.contract = { years: 2, total: 2, salary: round1(capFor(L.year) * MIN_PCT * 1.3), kind: 'min', start: L.year + 1 };
    joinTeam(L, c, false);
    const t = 'The ' + E.teamName(c) + ' bring you over. Two years.';
    beats.push({ kind: 'sign', text: t, tone: 'gold' });
    logIt(L, t, 'gold');
    return;
  }
  /* Back on the market. A story career that has never played in the league
     needs to be good enough to be noticed from across an ocean. */
  const list = storyOn(L) && !L.history.length && ovrOf(L) < 70 ? [] : offers(L);
  if (!list.length || L.age >= 34) {
    L.pending.push({
      id: 'nooffer', kind: 'event', key: 'nooffer2', eyebrow: 'Free agency', title: 'The NBA still is not calling.',
      text: 'Overall ' + ovT(L, ovrOf(L)) + '. One more year away, or call it?',
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
  beats.push({ kind: 'year', text: 'The ' + (L.year - 1) + '-' + String(L.year).slice(2) + ' season. You are ' + L.age + '.', tone: '' });
  driftLeague(L, beats);
  L.phase = 'pre';
  openYear(L);
}
/* A summer with a club: the season is opened now, so whatever happens before
   it (the training card, a summer event, a camp injury) lands on it. */
function openYear(L) {
  if (!L.team) return;
  newSeason(L);
  L.pending.push(trainingCard(L));
  goalCard(L);
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
    name: 'Talk to {coach}', blurb: 'Your role, your minutes, your position.', cost: () => 0,
    when: (L) => inSeason(L),
    run(L, r) {
      if (storyOn(L)) { L.pending.push(coachTalkCard(L)); return myCoach(L) + ' waves you in and shuts the door.'; }
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
    run(L) { L.flags.tradeAsk = true; bump(L, { trust: -14, fame: 2 }); return '{agent}, your agent, makes the call. {gm} says the club will look at it.'; },
  },
  trainer: {
    name: 'Hire a personal trainer', blurb: 'Work ethic and durability.', cost: (L) => round1(0.25 + capFor(L.year) * 0.002),
    when: () => true,
    run(L) { bump(L, { eth: 5, dur: 2, health: 3 }); return '{trainer} has you up at six every day. You hate him. It works.'; },
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
      bump(L, { morale: 4, fame: 4, trust: -6 }); return 'It ends up online. {gm} has questions.';
    },
  },
  house: {
    name: 'Buy your mom a house', blurb: 'For {mom}. Once. You have been waiting to do this.', cost: (L) => round1(1.2 + capFor(L.year) * 0.004),
    when: (L) => !L.flags.momHouse,
    run(L) { L.flags.momHouse = true; bump(L, { morale: 15, fame: 3 }); return '{mom} cries. You cry. Worth every dollar.'; },
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
    return { id, name: say(L, a.name), blurb: say(L, a.blurb), cost, used: !!used[id], ok: a.when(L) && !used[id] && L.cash >= cost };
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
  if (open.cost >= 0.5 && storyOn(L)) tw(L).spent = (tw(L).spent || 0) + 1;
  const text = say(L, a.run(L, rngAt(L, 'act:' + id)));
  const nm = say(L, a.name);
  sayAll(L);
  const res = { title: nm, label: nm, text, tone: '', diff: diffOf(before, snapshot(L)) };
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
    coach: myCoach(L), mates: myMates(L).slice(0, 4).map((m) => m.n), wire: (L.flags.wire || []).slice(),
  };
}

/* Whether high school and college were played rather than generated. */
function amPlayed(L) { return (L.amHist || []).length > 0 && !(L.opt && L.opt.gen); }

/* What a finished life adds up to, for badges.js' careerFeats and the board.
   Plain numbers and flags, so neither of those needs this file. */
function featSummary(L) {
  const f = L.final || legacy(L), T = f.totals;
  const teams = new Set(L.history.map((h) => h.t));
  return {
    seasons: T.seasons, pts: T.pts, rings: T.rings, mvp: T.mvp, fmvp: T.fmvp, star: T.star, dpoy: T.dpoy,
    score: f.score, pick: (L.draft && L.draft.pick) || 0, undrafted: !!(L.draft && !L.draft.pick),
    /* High school and college count only when they were PLAYED, which is Pro.
       A generated road is the backstory a free career starts from, so it earns
       nothing: Career is about the NBA. */
    road: amPlayed(L), ncaa: amPlayed(L) ? T.ncaa || 0 : 0, state: amPlayed(L) ? T.state || 0 : 0, npoy: amPlayed(L) ? T.npoy || 0 : 0,
    jersey: !!f.jersey, oneClub: teams.size === 1, g7: L.flags.g7 || 0,
    rivalBeat: !!(L.rival && T.seasons >= 5 && T.pts > L.rival.pts), married: lifeOf(L).rel === 'married', kids: lifeOf(L).kids,
    home: !!L.flags.home, headCoach: /head coach/.test(f.after || ''), olympic: T.olympic,
  };
}

/* The last college a road career played for, or null. */
function lastSchool(L) {
  let s = null;
  for (const h of L.amHist || []) if (h.lvl === 'NCAA' && h.school) s = h.school;
  return s;
}
/* WHAT THE CAREER BOARD IS SENT, and nothing it works out for itself. The
   score is not in here: rtf_submit_career derives it from these totals with
   legacyScore's own arithmetic, so a page cannot file a number its career
   did not earn. Only a career that reached the league is filed. */
function boardSummary(L) {
  if (!L || !L.history || !L.history.length) return null;
  const f = L.final || legacy(L), T = f.totals;
  const clubs = [];
  for (const h of L.history) if (h.t && clubs.indexOf(h.t) < 0) clubs.push(h.t);
  let peak = 0;
  for (const h of L.history) if (h.gp >= 20 && h.pts > peak) peak = h.pts;
  return {
    id: String(L.seed),
    /* The board refuses a name that is not letters, spaces, an apostrophe, a
       stop or a hyphen, so one that is not goes as no name rather than taking
       the whole career off the board. */
    name: /^[\p{L}][\p{L} .'-]{0,27}$/u.test(L.name || '') ? L.name : null,
    pos: L.pos, num: L.num,
    road: (L.amHist || []).length > 0, college: lastSchool(L),
    pick: (L.draft && L.draft.pick) || 0,
    from: L.history[0].y, to: L.history[L.history.length - 1].y,
    seasons: T.seasons, gp: T.gp, pts: T.pts, reb: T.reb, ast: T.ast,
    rings: T.rings, mvp: T.mvp, fmvp: T.fmvp, an: T.an, an1: T.an1, star: T.star,
    dpoy: T.dpoy, roy: T.roy, olympic: T.olympic, ncaa: T.ncaa || 0, npoy: T.npoy || 0, aa1: T.aa1 || 0,
    clubs, jersey: f.jersey || null, peak: Math.round(peak * 10) / 10,
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


/* CHALLENGE CAREERS (Phase E). A challenge is a goal laid over an ordinary
   career, and sometimes a start or a difficulty it fixes. `test` reads what
   the career has done and `out` says when it can no longer be met, so the
   screen can say so while the career plays on. Met or not is decided when the
   career ends, and a challenge met is kept in the Vault. */
const regGames = (L) => L.history.reduce((n, h) => n + (h.gp || 0), 0);
const clubsOf = (L) => new Set(L.history.map((h) => h.t)).size;
const CHALLENGES = {
  ch_city: { name: 'One city', blurb: 'Play twelve seasons and every one for the same team.',
    test: (L) => L.history.length >= 12 && clubsOf(L) === 1, out: (L) => clubsOf(L) > 1,
    prog: (L) => L.history.length + ' of 12 seasons' + (clubsOf(L) > 1 ? ', but not with one team' : '') },
  ch_rings: { name: 'Two rings', blurb: 'Win two championships.',
    test: (L) => totals(L).rings >= 2, prog: (L) => totals(L).rings + ' of 2 rings' },
  ch_30k: { name: 'The 30,000 club', blurb: 'Score 30,000 points in the regular season.',
    test: (L) => totals(L).pts >= 30000, prog: (L) => totals(L).pts.toLocaleString('en-US') + ' of 30,000 points' },
  ch_mvp: { name: 'Most valuable', blurb: 'Win an MVP.',
    test: (L) => totals(L).mvp >= 1, prog: (L) => totals(L).mvp ? 'Done' : 'No MVP yet' },
  ch_late: { name: 'Second round', blurb: 'Start low on the board. Drafted late or not at all, make an All-Star team.', stock: -9,
    test: (L) => !!L.draft && (!L.draft.pick || L.draft.pick > 30) && totals(L).star >= 1,
    out: (L) => !!(L.draft && L.draft.pick && L.draft.pick <= 30),
    prog: (L) => !L.draft ? 'Draft night is ahead' : L.draft.pick && L.draft.pick <= 30 ? 'Drafted too high' : totals(L).star ? 'Done' : 'No All-Star yet' },
  ch_lockdown: { name: 'Lockdown', blurb: 'Win Defensive Player of the Year twice.',
    test: (L) => totals(L).dpoy >= 2, prog: (L) => totals(L).dpoy + ' of 2' },
  ch_stars: { name: 'Ten All-Star games', blurb: 'Make ten All-Star teams.',
    test: (L) => totals(L).star >= 10, prog: (L) => totals(L).star + ' of 10' },
  ch_iron: { name: 'Iron man', blurb: 'Play 1,200 regular season games.',
    test: (L) => regGames(L) >= 1200, prog: (L) => regGames(L).toLocaleString('en-US') + ' of 1,200 games' },
  ch_hard: { name: 'The hard way', blurb: 'On Hard, make the Hall of Fame.', diff: 'hard',
    test: (L) => !!(L.final && L.final.ending && L.final.ending.hof), prog: (L) => L.retired ? (L.final && L.final.ending && L.final.ending.hof ? 'Done' : 'Not in') : 'The voters decide at the end' },
};
const CHALLENGE_KEYS = Object.keys(CHALLENGES);
/* A challenge that starts you low on the board does it once, at the combine. */
function chStock(L) {
  const c = L.challenge && CHALLENGES[L.challenge];
  if (!c || !c.stock || L.flags.chStock) return;
  L.flags.stock = (L.flags.stock || 0) + c.stock;
  L.flags.chStock = 1;
}
/* Where a career stands on its challenge, for the screen and the Vault. */
function challengeOf(L) {
  const c = L && L.challenge && CHALLENGES[L.challenge];
  if (!c) return null;
  const met = !!c.test(L);
  return { id: L.challenge, name: c.name, blurb: c.blurb, met, out: !met && !!(c.out && c.out(L)), prog: c.prog(L) };
}

// ─── the generated road (Phase E) ───────────────────────────────────────────

/* A GUEST OR A FREE ACCOUNT STARTS ON DRAFT NIGHT, AND THE ROAD THERE IS
   REAL. It is the high school start, played out by an automatic policy that
   answers every card off the career's own seed, and stopped at the combine.
   So no two launching points are the same, the memories, people and routes
   the road made carry on into the league, and the NBA outcomes sit inside the
   road's own measured bands (check-career section 8). Playing the road
   yourself is Run The Floor Pro. */
function generateRoad(opts) {
  const o = Object.assign({}, opts || {}, { start: 'hs' });
  const seed = o.seed != null ? String(o.seed) : String(Math.floor(Math.random() * 1e9));
  for (let k = 0; k < 4; k++) {
    o.seed = k ? seed + ':r' + k : seed;
    const L = newLife(o);
    L.opt.gen = 1;
    let g = 0;
    while (g++ < 1500 && !L.retired) {
      if (L.pending.length) {
        const c = L.pending[0];
        if (c.id === 'combine') return L;
        choose(L, Math.floor(rngAt(L, 'gen:' + L.steps + ':' + c.id)() * c.options.length));
      } else step(L);
    }
  }
  /* Never measured to happen; a draft night start is still a career. */
  return newLife(Object.assign({}, opts, { start: 'draft', seed }));
}
/* The road a generated career took, in a handful of short lines, for the
   screen that opens it and for the career story. Read off the seasons played,
   so it is the same on a reload and on another device. */
function roadStory(L) {
  const H = L.amHist || [];
  if (!H.length) return [];
  const out = [];
  const hs = H.filter((h) => h.lvl === 'HS');
  if (hs.length) {
    const school = hs[hs.length - 1].school;
    const best = Math.min(...hs.map((h) => h.rank || 999));
    out.push((hs.length === 1 ? 'One season' : numWord(hs.length) + ' seasons') + ' at ' + school + '.');
    out.push(best > 600 ? 'Nobody ranked you.' : 'A ' + starsOf(best) + '-star recruit. #' + best + ' in the class.');
    const st = hs.filter((h) => /State champion/.test(h.finish)).length;
    if (st) out.push(st === 1 ? 'A state title.' : numWord(st) + ' state titles.');
    if (hs.some((h) => (h.aw || []).indexOf('hs_mrbb') >= 0)) out.push('Mr. Basketball.');
  }
  if (recall(L, 'route.reclass')) out.push('You reclassified and skipped a year.');
  if (recall(L, 'route.prep')) out.push('A prep school year first.');
  if (recall(L, 'route.gap')) out.push('A gap year to train.');
  if (recall(L, 'route.juco') || H.some((h) => h.lvl === 'Junior college')) out.push('Junior college before the big stage.');
  if (recall(L, 'route.walkon')) out.push('A walk-on. Nobody promised you anything.');
  const col = H.filter((h) => h.lvl === 'NCAA');
  if (col.length) {
    const schools = [];
    col.forEach((h) => { if (schools.indexOf(h.school) < 0) schools.push(h.school); });
    out.push((col.length === 1 ? 'One season at ' : numWord(col.length) + ' seasons at ') + schools.join(', then ') + '.');
    const rank = (f) => f === 'National champion' ? 9 : Math.max(-1, NCAA_ROUNDS.findIndex((r) => f === 'Lost in the ' + r));
    const top = col.slice().sort((a, b) => rank(b.finish) - rank(a.finish))[0];
    if (top && top.finish === 'National champion') out.push('National champions.');
    else if (top && rank(top.finish) >= 4) out.push('A run to the ' + NCAA_ROUNDS[rank(top.finish)] + '.');
    else if (!col.some((h) => h.seed)) out.push('Never made the tournament.');
    if (col.some((h) => (h.aw || []).indexOf('c_npoy') >= 0)) out.push('National Player of the Year.');
    else if (col.some((h) => (h.aw || []).indexOf('c_aa1') >= 0)) out.push('First team All-American.');
  }
  H.forEach((h) => {
    if (h.lvl === 'Overseas') out.push('A season as a pro overseas.');
    else if (h.lvl === 'G League') out.push('A season as a pro in the G League.');
    else if (h.lvl === 'Rec league') out.push('A rec league season. Somebody filmed it.');
  });
  const p = projectedPick(L);
  out.push(p > 60 ? 'Now the combine. Nobody has you on the board.' : 'Now the combine. The board has you around ' + ordinal(p) + '.');
  return out;
}
const NUMWORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'];
/* A count as a word up to six and as a number after: eight rings is "8 rings". */
const numWord = (n) => NUMWORDS[n] || String(n);

/* THE WRITTEN CAREER STORY (Phase E), kept on the Hall card and read in the
   Vault. It is built from what the career recorded, never from a template
   that could say something the career did not do, and it is written to the
   player in short sentences. Called by the page when a career ends, so it
   moves nothing the season reads. */
function careerStory(L) {
  const f = L.final || legacy(L);
  const H = L.history, T = totals(L), d = L.draft || {};
  const out = [];
  const start = [];
  if (L.parent) start.push('Your father was ' + L.parent.name + '. ' + L.parent.verdict + '.');
  if (L.origin && ORIGINS[L.origin] && !L.parent) start.push(ORIGINS[L.origin].name + '.');
  const road = roadStory(L).slice(0, -1);
  if (road.length) start.push(road.join(' '));
  else if (BACKGROUNDS[L.bg] && !L.amHist.length) start.push(BACKGROUNDS[L.bg].name + '.');
  if (start.length) out.push({ h: 'Where it started', p: start.join(' ') });
  if (!H.length) {
    out.push({ h: 'The league', p: d.pick ? 'Drafted ' + ordinal(d.pick) + ' by the ' + nick(d.team) + '. You never played a game.' : 'The league never called.' });
  } else {
    const dr = d.pick ? 'The ' + nick(d.team) + ' took you ' + ordinal(d.pick) + ' in ' + (H[0].y - 1) + '.' : 'Undrafted in ' + (H[0].y - 1) + '. You signed anyway.';
    const clubs = [];
    H.forEach((h) => { if (h.t && clubs.indexOf(h.t) < 0) clubs.push(h.t); });
    const best = H.slice().sort((a, b) => b.pts - a.pts)[0];
    const lg = [dr, H.length + (H.length === 1 ? ' season' : ' seasons') + (clubs.length === 1 ? ', all with the ' + nick(clubs[0]) + '.' : ' with ' + clubs.length + ' teams.'),
      'Your best year was ' + (best.y - 1) + '-' + String(best.y).slice(2) + ': ' + best.pts + ' points a night for the ' + nick(best.t) + '.'];
    const aw = [];
    if (T.mvp) aw.push(T.mvp === 1 ? 'an MVP' : T.mvp + ' MVPs');
    if (T.star) aw.push(T.star + (T.star === 1 ? ' All-Star game' : ' All-Star games'));
    if (T.dpoy) aw.push(T.dpoy === 1 ? 'a Defensive Player of the Year' : T.dpoy + ' Defensive Player of the Year awards');
    if (aw.length) lg.push('You won ' + (aw.length > 1 ? aw.slice(0, -1).join(', ') + ' and ' + aw[aw.length - 1] : aw[0]) + '.');
    out.push({ h: 'The league', p: lg.join(' ') });
    const champs = H.filter((h) => h.po === 'Champion');
    const fin = H.filter((h) => h.po === 'Finals').length;
    if (champs.length) {
      const by = {};
      champs.forEach((h) => { (by[h.t] = by[h.t] || []).push(h.y); });
      const p = Object.keys(by).map((c) => (by[c].length === 1 ? 'A ring' : numWord(by[c].length) + ' rings') + ' with the ' + nick(c) + ' (' + by[c].join(', ') + ').');
      if (T.fmvp) p.push(T.fmvp === 1 ? 'Finals MVP once.' : 'Finals MVP ' + T.fmvp + ' times.');
      if (fin) p.push(fin === 1 ? 'One more Finals you lost.' : fin + ' more Finals you lost.');
      out.push({ h: 'The rings', p: p.join(' ') });
    } else if (fin) out.push({ h: 'The rings', p: fin === 1 ? 'You reached one Finals and lost it.' : 'You reached ' + fin + ' Finals and lost every one.' });
    else if (H.some((h) => h.po !== 'Missed' && h.po !== 'Play-in')) out.push({ h: 'The rings', p: 'No ring. You never reached the Finals.' });
    else out.push({ h: 'The rings', p: 'You never played a playoff series.' });
    const M = memories(L).slice(-3);
    if (M.length) out.push({ h: 'What people remember', p: M.map((m) => m.t).join(' ') });
    const last = H[H.length - 1];
    const end = ['You retired at ' + last.age + ', ' + T.pts.toLocaleString('en-US') + ' points in all.', f.verdict + '.'];
    if (f.ending) {
      end.push(f.ending.tierName + '.');
      if (f.ending.secretName) end.push(f.ending.secretName + '.');
    }
    if (L.parent) end.push(T.pts > L.parent.pts ? 'You passed your father\'s ' + L.parent.pts.toLocaleString('en-US') + ' points.' : 'Your father finished with more points: ' + L.parent.pts.toLocaleString('en-US') + '.');
    out.push({ h: 'The end', p: end.join(' ') });
  }
  if (f.epilogue) out.push({ h: 'Years later', p: f.epilogue });
  return out;
}

/* A LEGACY CAREER IS YOUR SON (Phase E, Run The Floor Pro). His father is a
   career this account finished, so `L.parent` is a short copy of that Hall
   card and the son is a story career with the Son of a former pro origin
   built on it: the father's real points are the mark to pass, his name is
   the {father} on every card, and the seasons he played are the ones the
   copy counts. A father is invented like his son, so the real-people rule
   is untouched. */
function cleanParent(p) {
  if (!p || typeof p !== 'object' || !p.name) return null;
  const n = (v, d) => Number.isFinite(+v) ? +v : d;
  return {
    id: String(p.id || ''), name: String(p.name).slice(0, 28), num: n(p.num, null), pos: POS.indexOf(p.pos) >= 0 ? p.pos : null,
    pts: Math.max(0, Math.round(n(p.pts, 0))), seasons: Math.max(0, Math.round(n(p.seasons, 0))), score: n(p.score, 0),
    verdict: String(p.verdict || 'A pro'), rings: n(p.rings, 0), star: n(p.star, 0), hof: !!p.hof,
    end: n(p.end, 0) || null, age: n(p.age, 0) || null,
    clubs: Array.isArray(p.clubs) ? p.clubs.filter((c) => CLUBS.indexOf(c) >= 0).slice(0, 12) : [],
    jersey: CLUBS.indexOf(p.jersey) >= 0 ? p.jersey : null, gen: Math.max(1, Math.round(n(p.gen, 1))),
  };
}
/* THE SON STARTS IN HIS OWN YEAR, in the league his father left. The father's
   card keeps the league as it stood when he retired (the coaches, the nets,
   the invented stars, the champions), and the years between his last season
   and his son's sophomore year are played forward a summer at a time, so a
   coach the father played for can still be on a bench and a star he played
   against is an old man. Without that copy (a card from before Phase E) the
   league is played forward from the data's own year. */
const LEGACY_LEAGUE = ['net', 'coach', 'free', 'gone', 'gen', 'figs', 'champs', 'dyn', 'news', 'my', 'cy'];
function legacyLeague(L, p, lg, age) {
  L.parent = p;
  L.opt.legacy = 1;
  const r = E.createSeededRNG(E.hashSeed(L.seed + ':born'));
  const fatherAt = 24 + Math.floor(r() * 10);
  const end = p.end || L.year;
  const start = Math.max(end + 1, end + fatherAt + age - (p.age || 34));
  let from = L.year;
  if (lg && typeof lg === 'object') {
    for (const k of LEGACY_LEAGUE) if (lg[k] != null) L.league[k] = JSON.parse(JSON.stringify(lg[k]));
    if (lg.y) from = lg.y;
  }
  for (let y = from + 1; y < start && y - from < 80; y++) { L.year = y; driftLeague(L, []); }
  L.year = start;
}
/* What a finished career leaves for a son: the league as it stood. */
function leagueEnd(L) {
  const out = { y: L.year };
  for (const k of LEGACY_LEAGUE) if (L.league[k] != null) out[k] = L.league[k];
  return out;
}
const fatherYears = (L) => L.parent ? L.parent.seasons : 9;
const yearsWord = (n) => n === 1 ? 'one season' : (NUMWORDS[n] ? NUMWORDS[n].toLowerCase() : n) + ' seasons';

const publicAPI = {
  generateRoad, tradeTo, roadStory, careerStory, cleanParent, leagueEnd, LEGACY_LEAGUE,
  DIFFS, DIFF_KEYS, CHALLENGES, CHALLENGE_KEYS, challengeOf,
  CAREER_API_VERSION, LIFE_VERSION,
  CONF, CLUBS, confOf, POS, POS_NAME, RATINGS, RATING_NAME, RATING_SHORT, WEIGHTS,
  ARCHES, ARCH_KEYS, POS_ARCHES, archesFor, archBase, POS_SIZE, wtFor, wtRange, sizeOf, sizeTilt, heightText, BACKGROUNDS, BG_KEYS, AGENTS, AWARD_NAME, ROUNDS, VERDICTS, EVENTS,
  perfOf, coachStyle, COACH_STYLES, needAt, coachTalkCard, tradeDeadline, youW, weakSpot,
  seedLeague, normaliseNets, newLife, rotationOf, bestFive, fitAt, rostOf, rostNow, randomName, overall, ovrOf, step, choose, nextLabel,
  view, perGame, totals, legacy, legacyScore, clubNet, clubTier, rotationBar,
  roleOf, lineMeans, capFor, marketSalary, projectedPick, draftOrder, money, ordinal,
  clutchOptions, offers, ACTS, actsOpen, act, retireNow, lifeOf, lifeLine, sonsOf, rivalOn, featSummary, boardSummary, verdictOf,
  SCHOOLS, SCHOOL_BY, TIER_NAME, AM_EVENTS, HS_ROUNDS, NCAA_ROUNDS, GRADE, CYEAR, AGE_HS,
  isAm, colorsOf, roadView, nationalRank, rankText, starsOf, draftTalk, collegeOffers, schoolNet,
  LOOK_KEYS, cleanLook, setLook, TONES, PRESSERS, PERSONAS, EVENT_REP, repOf, personaOf, presserCard,
  COACHES_NOW, COACH_POOL, COACH_NAMES, PEOPLE_M, PEOPLE_F, PEOPLE_X, PEOPLE_LAST, FIRST, LAST, RIVAL_FIRST, RIVAL_LAST,
  coachState, coachOf, coachName, coachCarousel, myCoach, matesOf, mateOvr, show, showInv, marketPay, withRatings, clubOvr, myMates, personName, peopleKey, say, CLUBS,
  lockerOf, CAST, TRAITS, rollTraits, migrate, remember, recall, hasTrait, REAL_TOKENS, INVENTED_TOKENS, BASKETBALL_ONLY,
  STORY_VERSION, BAL, storyOn, recurs, figs, activeFigs, figOvr, mvpRace, legacyView, GOALS, OUTLETS, NICKS, feed, TRAIT_NAME, BADGES, badgeList, SIGS, archFit, trait, continuity, continuityLog, ARC_EVENTS, CALLBACKS, callback, memories, ago, relate, relOf, EVENT_REL, arcData, STORY_RECURS, STORY_PHASES, calendar, RARITY, EVENT_TAGS, REQ, reqOk, defineEvents,
  ORIGINS, ORIGIN_KEYS, ROUTES, routesOf, routeOn, HOF_TIERS, OUTCOMES, SECRETS, ENDING_COUNT, endingOf, STORY_EV, STORY_NBA, STORY_AM, evById, AFTER_PATHS, ALT_NAME,
};

if (typeof module !== 'undefined' && module.exports) module.exports = publicAPI;
if (typeof window !== 'undefined') window.RTF_CAREER = publicAPI;
})();
