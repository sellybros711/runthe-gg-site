/* RunTheHouse, cast generation.
 *
 * Headless and dependency-free. Browser: window.RH_GEN. Node: require.
 *
 * GDD §5. Fifteen AI plus you. The AI are built by walking the same skill tree
 * the player spends in (tree.js), so "archetype" is never a label chosen from a
 * list: it is the name of a build, resolved by the same function that names
 * yours.
 *
 * Draws come from the `gen` stream ONLY, which never advances again after this
 * file is done. That is what makes a seed reproduce a house no matter what the
 * player does inside it.
 */

'use strict';

const T = (typeof require !== 'undefined') ? require('./tree.js') : window.RH_TREE;

// ─── name and place pools ────────────────────────────────────────────────────

/* Combinatorial, no licensed identities (GDD §14). 3 pools x 78 surnames is
   more than enough that a repeated full name inside one house is rare, and
   generateCast rejects the collisions that do happen. */
const FIRST_F = [
  'Adaeze', 'Alina', 'Amara', 'Andrea', 'Annika', 'Bexley', 'Bianca', 'Carlota', 'Cassidy', 'Celia',
  'Danae', 'Delphine', 'Devora', 'Eliza', 'Esme', 'Fern', 'Gaby', 'Halle', 'Imani', 'Ines',
  'Jolene', 'Juniper', 'Kenji', 'Kirra', 'Lark', 'Leona', 'Maeve', 'Marisol', 'Nadia', 'Noor',
  'Odette', 'Paloma', 'Priya', 'Quinn', 'Renata', 'Romy', 'Sable', 'Saoirse', 'Sunny', 'Tamsin',
  'Thandi', 'Ursula', 'Verity', 'Wren', 'Xiomara', 'Yara', 'Zadie', 'Zola',
];
const FIRST_M = [
  'Abel', 'Amos', 'Anton', 'Bandele', 'Beckett', 'Cai', 'Casimir', 'Cyrus', 'Dara', 'Dominic',
  'Eamon', 'Elias', 'Ezra', 'Felix', 'Gideon', 'Hakim', 'Hollis', 'Ignacio', 'Isaias', 'Jonas',
  'Kabir', 'Kwame', 'Lachlan', 'Leandro', 'Malik', 'Mateo', 'Nikolai', 'Obadiah', 'Osric', 'Pascal',
  'Rafferty', 'Remy', 'Rui', 'Santiago', 'Silas', 'Soren', 'Tobias', 'Ubaldo', 'Vidal', 'Wendell',
  'Xander', 'Yusuf', 'Zeke', 'Zephyr',
];
const FIRST_X = [
  'Ari', 'Ash', 'Bay', 'Blair', 'Cass', 'Devon', 'Ellis', 'Emery', 'Frankie', 'Harper',
  'Indigo', 'Jules', 'Kai', 'Lennox', 'Marlo', 'Nico', 'Oakley', 'Palmer', 'Reese', 'Rowan',
  'Sasha', 'Shiloh', 'Sky', 'Tatum', 'Vesper', 'West',
];
const LAST = [
  'Abara', 'Acosta', 'Adeyemi', 'Ainsworth', 'Alvarez', 'Ashby', 'Banerjee', 'Beaumont', 'Bhatt', 'Blackwood',
  'Boateng', 'Cardoso', 'Carbajal', 'Castellanos', 'Chandra', 'Chiang', 'Cortez', 'Crestwood', 'Dalisay', 'Dhillon',
  'Draeger', 'Duval', 'Eze', 'Fairbanks', 'Farouk', 'Fenwick', 'Ferreira', 'Fontaine', 'Gallardo', 'Ghorbani',
  'Halloran', 'Hargrave', 'Haruna', 'Ibarra', 'Ikeda', 'Jarnagin', 'Kaimana', 'Kanellis', 'Kowalczyk', 'Kruger',
  'Laurier', 'Lindqvist', 'Loredo', 'Mabuza', 'Macalister', 'Mahoney', 'Marchetti', 'Mbeki', 'Mercado', 'Nakashima',
  'Nwosu', 'Okonkwo', 'Oyelaran', 'Paltrow', 'Pemberton', 'Quintana', 'Radhakrishnan', 'Rasmussen', 'Reyes', 'Rutherford',
  'Salcedo', 'Sandoval', 'Sarkisian', 'Sheridan', 'Solberg', 'Stavros', 'Sultani', 'Tanaka', 'Thibodeaux', 'Underwood',
  'Vasquez', 'Villanueva', 'Wainwright', 'Whitlock', 'Xiong', 'Yamamoto', 'Zabala', 'Zielinski',
];

/* Hometowns carry a region tag, and region is the only thing the engine reads.
   The city is flavour, the region is a small affinity term (GDD §7.1). */
const HOMETOWNS = [
  ['Portland, ME', 'northeast'], ['Boston, MA', 'northeast'], ['Providence, RI', 'northeast'],
  ['Buffalo, NY', 'northeast'], ['Newark, NJ', 'northeast'], ['Philadelphia, PA', 'northeast'],
  ['Pittsburgh, PA', 'northeast'], ['Hartford, CT', 'northeast'],
  ['Charleston, SC', 'south'], ['Savannah, GA', 'south'], ['Mobile, AL', 'south'],
  ['Baton Rouge, LA', 'south'], ['Nashville, TN', 'south'], ['Louisville, KY', 'south'],
  ['Raleigh, NC', 'south'], ['Jacksonville, FL', 'south'], ['Richmond, VA', 'south'],
  ['Milwaukee, WI', 'midwest'], ['Des Moines, IA', 'midwest'], ['Toledo, OH', 'midwest'],
  ['Fort Wayne, IN', 'midwest'], ['Wichita, KS', 'midwest'], ['Duluth, MN', 'midwest'],
  ['Omaha, NE', 'midwest'], ['Peoria, IL', 'midwest'], ['Grand Rapids, MI', 'midwest'],
  ['El Paso, TX', 'southwest'], ['Tucson, AZ', 'southwest'], ['Albuquerque, NM', 'southwest'],
  ['Amarillo, TX', 'southwest'], ['Las Vegas, NV', 'southwest'], ['Oklahoma City, OK', 'southwest'],
  ['Bozeman, MT', 'mountain'], ['Boise, ID', 'mountain'], ['Provo, UT', 'mountain'],
  ['Cheyenne, WY', 'mountain'], ['Pueblo, CO', 'mountain'],
  ['Bakersfield, CA', 'west'], ['Fresno, CA', 'west'], ['Long Beach, CA', 'west'],
  ['Eugene, OR', 'west'], ['Tacoma, WA', 'west'], ['Anchorage, AK', 'west'], ['Hilo, HI', 'west'],
];

const REGIONS = ['northeast', 'south', 'midwest', 'southwest', 'mountain', 'west'];

// ─── hidden goals ────────────────────────────────────────────────────────────

/*
 * GDD §5. Every AI carries one private goal that tilts their decision weights.
 * This is the source of behaviour the player cannot predict but CAN explain
 * afterwards, which is the design pillar, so every goal here has to be legible
 * in a recap sentence. If you cannot write "they did that because they were
 * trying to X", it does not belong in this list.
 */
const GOALS = [
  { id: 'reach_panel',   label: 'reach the Panel',            weights: { risk: -0.35, loyalty: 0.15 } },
  { id: 'win_comps',     label: 'win comps',                  weights: { throwAversion: 0.8, risk: 0.1 } },
  { id: 'hunt_operator', label: 'take out the biggest threat', weights: { threat: 0.35, risk: 0.2 } },
  { id: 'first_ally',    label: 'stay loyal to a first ally',  weights: { allyBond: 0.6, loyalty: 0.3 } },
  { id: 'never_at_risk', label: 'never sit At Risk',           weights: { risk: -0.5, throwAversion: 0.3 } },
  { id: 'run_it',        label: 'run the house outright',      weights: { threat: 0.15, risk: 0.35, allyBond: -0.2 } },
];

// ─── house scaling ───────────────────────────────────────────────────────────

/*
 * How strong a house you face. GDD §4: "the house scales to you".
 *
 * NOT a straight copy of the player's spend. At level 1 the player holds one
 * token, and a house of fifteen Newcomers is fifteen people with no shape, no
 * alliances worth forming and nothing to read. So the house has a FLOOR, and
 * the player's spend adds on top of it.
 *
 * HOUSE_SLOPE sits just under 1 and HOUSE_FLOOR well above 0, which means a
 * new account faces a house that outranks it and a maxed account faces one it
 * roughly matches. That is the intended shape: the tree buys you parity with a
 * house that was always better than you, and the rest is played.
 *
 * Both constants are swept in simulator.js against the level-parity target.
 */
const HOUSE_FLOOR = 46;
const HOUSE_SLOPE = 0.75;
const HOUSE_SPREAD = 0.30;

/*
 * Temperament. Applied to the AI ONLY, on top of what their tree bought.
 *
 * Measured before this existed: a first playtest produced a house where every
 * single person sat between 33 and 47 on every attribute and volatility was
 * exactly 50 for all fifteen of them, because nothing in the tree moves
 * volatility upward. A house with no top and no bottom makes threat scores
 * cluster, makes comps coin flips, and makes Wildcard and Loudmouth
 * unreachable, so two archetypes simply did not exist.
 *
 * The spread is deliberately widest on the personality attributes and narrowest
 * on the comp ones. AI are people who came in with a temperament. The PLAYER's
 * attributes stay exactly what their tree bought, with no roll on top, because
 * a player who cannot predict their own character has nothing to plan with.
 */
const TEMPERAMENT = {
  volatility: 17, paranoia: 15, loyalty: 14, ambition: 13,
  charisma: 8, deception: 9, perception: 8,
  luck: 13, physical: 5, mental: 5, precision: 5,
};

function applyTemperament(attrs, rng) {
  const out = Object.assign({}, attrs);
  for (const k of Object.keys(TEMPERAMENT)) {
    if (out[k] == null) continue;
    out[k] = Math.max(1, Math.min(100, Math.round(out[k] + rng.normal(0, TEMPERAMENT[k]))));
  }
  return out;
}

function houseBudget(playerSpend) {
  return HOUSE_FLOOR + Math.max(0, playerSpend) * HOUSE_SLOPE;
}

// ─── baseline affinity ───────────────────────────────────────────────────────

/*
 * How two people would feel about each other with no history (GDD §7.1).
 *
 * Version 0.1 never specified starting trust. Everyone at zero against an
 * alliance threshold of 55 means no alliance ever forms and the game does not
 * start. So: small, signed, and built from things the house can actually see on
 * day one.
 *
 * The trunk term is a bilinear form over spending shares rather than a lookup
 * over archetype names, so it keeps working when the tree changes and it does
 * something sensible for hybrids. Read TRUNK_AFFINITY as: two Floor Game
 * players find each other immediately, two Comp Game players size each other
 * up as rivals, and two Operators can smell each other coming.
 */
const TRUNK_AFFINITY = {
  comp:  { comp: -5, floor: 1,  long: -1 },
  floor: { comp: 1,  floor: 6,  long: 2 },
  long:  { comp: -1, floor: 2,  long: -4 },
};

const AFFINITY = {
  SAME_REGION: 6,
  SAME_TOWN: 4,        // on top of SAME_REGION
  SAME_GENDER: 3,
  CHARISMA: 0.12,      // per point of their charisma above 50
  JITTER: 4,
  MIN: -15,
  MAX: 20,
};

/**
 * Baseline for i's feeling about j. Asymmetric, because the charisma term reads
 * j and the region term is the only symmetric part.
 *
 * HARD CONSTRAINT, GDD §4: gender and region feed this function and nothing
 * else in the codebase. They never reach an attribute, a comp, or a capability.
 * If you are about to pass `gender` to anything outside this file, do not.
 */
function baselineAffinity(i, j, rng) {
  let v = 0;

  const si = i.build.shares, sj = j.build.shares;
  for (const a of ['comp', 'floor', 'long']) {
    for (const b of ['comp', 'floor', 'long']) {
      v += si[a] * sj[b] * TRUNK_AFFINITY[a][b];
    }
  }

  if (i.region === j.region) {
    v += AFFINITY.SAME_REGION;
    if (i.hometown === j.hometown) v += AFFINITY.SAME_TOWN;
  }
  if (i.gender === j.gender) v += AFFINITY.SAME_GENDER;

  v += (j.social.charisma - 50) * AFFINITY.CHARISMA;
  v += rng.normal(0, AFFINITY.JITTER / 2);

  return Math.max(AFFINITY.MIN, Math.min(AFFINITY.MAX, v));
}

// ─── people ──────────────────────────────────────────────────────────────────

function makePlayer(id, opts) {
  const attrs = opts.attrs;
  const split = T.splitAttributes(attrs);
  return {
    id,
    name: opts.name,
    first: opts.first,
    gender: opts.gender,
    hometown: opts.hometown,
    region: opts.region,
    avatarSeed: opts.avatarSeed,
    isHuman: !!opts.isHuman,

    owned: Array.from(opts.owned),
    build: opts.build,
    archetype: opts.build.name,

    comp: split.comp,
    social: split.social,

    hiddenGoal: opts.goal,

    status: 'active',
    compWins: [],
    compsThrown: [],
    namedBy: [],
    throwStreak: 0,
    timesAtRisk: 0,
    weeksAsCaptain: 0,
    onRations: false,
    evictedWeek: null,
    place: null,
    bitterness: 0,
    returned: false,
  };
}

/** Build the human's Player from their saved account. */
function playerFromAccount(account, rng) {
  const owned = new Set(account.owned || []);
  const attrs = T.deriveAttributes(owned);
  const build = T.resolveArchetype(owned, attrs);
  const town = HOMETOWNS.find((h) => h[0] === account.hometown) || null;
  return makePlayer(0, {
    name: account.name || 'You',
    first: (account.name || 'You').split(' ')[0],
    gender: account.gender || 'x',
    hometown: account.hometown || (town ? town[0] : 'Unlisted'),
    region: account.region || (town ? town[1] : 'northeast'),
    avatarSeed: account.avatarSeed || 1,
    isHuman: true,
    owned, build, attrs,
    goal: null,
  });
}

/**
 * The whole cast. Player at index 0, fifteen AI after.
 *
 * The AI budget is drawn per person, not shared, so a house has a top and a
 * bottom. A uniform house makes threat scores cluster and every eviction turn
 * into a coin flip.
 */
function generateCast(rng, human, opts) {
  const o = opts || {};
  const size = o.size || 16;
  const budgetCentre = houseBudget(T.spend(new Set(human.owned)));

  const usedNames = new Set([human.name]);
  const usedTowns = new Set();
  const cast = [human];

  for (let id = 1; id < size; id++) {
    const gender = rng.weighted(['f', 'm', 'x'], [46, 46, 8]);
    const pool = gender === 'f' ? FIRST_F : gender === 'm' ? FIRST_M : FIRST_X;

    let name, first, last, guard = 40;
    do {
      first = rng.pick(pool);
      last = rng.pick(LAST);
      name = `${first} ${last}`;
    } while (usedNames.has(name) && guard-- > 0);
    usedNames.add(name);

    let town, tguard = 30;
    do { town = rng.pick(HOMETOWNS); } while (usedTowns.has(town[0]) && tguard-- > 0);
    usedTowns.add(town[0]);

    const budget = Math.max(6, Math.round(rng.normal(budgetCentre, budgetCentre * HOUSE_SPREAD)));
    const intent = T.randomIntent(rng);
    const owned = T.randomBuild(rng, budget, intent);
    const attrs = applyTemperament(T.deriveAttributes(owned), rng);
    /* Archetype is resolved against the TEMPERED attributes, so a build that
       came out volatile is read by the house as a Wildcard whatever the
       spending said it was going to be. tree.js resolveArchetype puts
       temperament above structure for exactly this. */
    const build = T.resolveArchetype(owned, attrs);

    cast.push(makePlayer(id, {
      name, first, gender,
      hometown: town[0], region: town[1],
      avatarSeed: rng.int(1, 1e9),
      owned, build, attrs,
      goal: rng.pick(GOALS),
    }));
  }

  /* Disambiguate first names, because the whole UI addresses people by first
     name and two Wrens in one house makes every vote line unreadable. */
  const byFirst = {};
  for (const p of cast) (byFirst[p.first] = byFirst[p.first] || []).push(p);
  for (const k of Object.keys(byFirst)) {
    if (byFirst[k].length < 2) continue;
    for (const p of byFirst[k]) p.first = `${p.first} ${p.name.split(' ')[1][0]}.`;
  }

  return cast;
}

/** Everyone's baseline feeling about everyone. n x n, diagonal unused. */
function generateBaselines(rng, cast) {
  const n = cast.length;
  const m = [];
  for (let i = 0; i < n; i++) {
    m.push(new Array(n).fill(0));
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      m[i][j] = baselineAffinity(cast[i], cast[j], rng);
    }
  }
  return m;
}

const api = {
  FIRST_F, FIRST_M, FIRST_X, LAST, HOMETOWNS, REGIONS, GOALS,
  HOUSE_FLOOR, HOUSE_SLOPE, HOUSE_SPREAD, houseBudget,
  TRUNK_AFFINITY, AFFINITY, baselineAffinity,
  makePlayer, playerFromAccount, generateCast, generateBaselines, TEMPERAMENT, applyTemperament,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.RH_GEN = api;
