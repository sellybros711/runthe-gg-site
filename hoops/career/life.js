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
    mem: {}, people: {}, traits: rollTraits(seed), opt: { legend: o.legend !== false, moments: true },
  };
  /* EVERY CAREER IS A STORY CAREER, and a duel career: the game is the
     team's and the moment is yours (see duelOn). The original engine retired
     on 2026-10-15 (the owner's call); an old save is brought over by
     migrate. */
  L.opt.story = STORY_VERSION;
  L.opt.duel = 1;
  /* Last season's lines, for the rotation screen and the Saturday contests. */
  if (league.lines) L.league.lines = league.lines;
  /* The season the rosters are real for, and who coaches each club then. A
     league seeded without rosters.json carries neither, and is the same
     object it always was. */
  if (league.rs) L.league.rs = league.rs;
  if (league.cn && Object.keys(league.cn).length) L.league.cn = league.cn;
  /* Phase E: a difficulty and a challenge are story career settings. A
     challenge can fix the difficulty; Normal is never written, so a career
     without one is the same object it always was. */
  const ch = CHALLENGES[o.challenge] ? o.challenge : null;
  const dk = ch && CHALLENGES[ch].diff ? CHALLENGES[ch].diff : o.diff;
  if (dk && dk !== 'normal' && DIFFS[dk]) L.opt.diff = dk;
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
  if (road && !cleanParent(o.parent)) { L.year -= ROAD_LEAD; L.opt.cal = 1; }
  const parent = (cleanParent(o.parent));
  if (parent) legacyLeague(L, parent, o.parentLeague, road ? AGE_HS : bg.age);
  const rng = E.createSeededRNG(E.hashSeed(seed + ':create'));
  if (L.num == null) L.num = Math.floor(rng() * 100);
  /* A size is the builder's, or the middle of the position when nobody
     picked one. */
  const z = POS_SIZE[pos];
  L.ht = Number.isFinite(+o.ht) ? clamp(Math.round(+o.ht), z.ht[0], z.ht[1]) : z.mid;
  const wr = wtRange(L.ht);
  L.wt = Number.isFinite(+o.wt) ? clamp(Math.round(+o.wt / 5) * 5, wr[0], wr[1]) : wtFor(L.ht);
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
  /* Skewed low: most ceilings are a starter's, and a few are the roof. */
  L.pot = road ? Math.round(ROAD_POT[0] + Math.pow(rng(), ROAD_POT[2]) * (ROAD_POT[1] - ROAD_POT[0]))
    : Math.round(bg.pot[0] + Math.pow(rng(), 1.7) * (bg.pot[1] - bg.pot[0]));
  L.eth = Math.round(45 + rng() * 40);
  L.dur = Math.round(45 + rng() * 45);
  /* Size has a price: a body that is tall or heavy for its spot breaks down
     sooner, and a light one holds up a little better. */
  if (Number.isFinite(L.ht)) { const sz = sizeOf(L); L.dur = clamp(Math.round(L.dur - Math.max(0, sz.dh) * 1.5 - Math.max(0, sz.dw) * 2.5 + Math.max(0, -sz.dw) * 1.5), 25, 95); }
  /* Where you are from, and on draft night the road you took to get here. */
  setOrigin(L, parent ? 'pro_son' : o.origin);
  if (parent) {
    /* The mark to pass is the real one, and a famous name is a little
       famous from the first day. */
    remember(L, 'origin.father', parent.pts);
    L.m.fame = clamp(L.m.fame + (parent.hof ? 6 : parent.star ? 3 : 0), 0, 100);
  }
  if (!road) L.flags.town = pick(E.createSeededRNG(E.hashSeed(seed + ':town')), HOMETOWNS);
  if (!road) remember(L, 'route.' + ({ oad: 'oad', senior: 'four', intl: 'intl', gl: 'gl' }[bgKey]), true);
  if (road) {
    L.cash = 0;
    newRoad(L, rng);
    logIt(L, L.name + ', ' + POS_NAME[pos].toLowerCase() + '. A sophomore at ' + L.am.hs.name + '. Age ' + L.age + '.', 'gold');
    const rn = (k) => k === 'iq' ? 'basketball IQ' : RATING_NAME[k].toLowerCase();
    if (L.flags.sig) logIt(L, 'Your ' + rn(L.flags.sig.up[0]) + ' is ahead of your age. Your ' + rn(L.flags.sig.down) + ' is behind it.', '');
    queueEvents(L, 'hs_sum', 1, AM_EVENTS);
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
   idempotent (a second call changes nothing). Up to version 2 it never moved
   a number the season sim reads; version 3 does on purpose: it makes an old
   career a story career (the original engine retired, 2026-10-15), so it
   plays on as the story engine plays it.

   v2 adds the story engine's containers:
     mem     { key: { y, v } }  what the career remembers, stamped with the year
     people  { id: { role, n, met, rel, notes } }  the invented people met
     traits  { name: { has, known } }  hidden traits, rolled off the seed
     opt     { legend }  per-career settings
   v3 sets opt.story, opt.duel and opt.moments on every career. */
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
  /* Version 3: the original engine retired (2026-10-15, the owner's call).
     A career from before the story engine becomes a story career, a duel
     career and a career with moments, and plays on from here as one. Its numbers from now on are the
     story engine's, not the ones the old engine would have dealt. */
  if (v < 3) { L.opt.story = STORY_VERSION; L.opt.duel = 1; L.opt.moments = true; }
  L.v = LIFE_VERSION;
  return L;
}
/* Memory. `remember` stamps the year; `recall` answers the record or null. */
function remember(L, key, val) { if (!L.mem) L.mem = {}; L.mem[key] = { y: L.year, v: val === undefined ? true : val }; return L.mem[key]; }
function recall(L, key) { return L.mem && L.mem[key] ? L.mem[key] : null; }
function hasTrait(L, k) { return !!(L.traits && L.traits[k] && L.traits[k].has); }
/* Every career is a story career (the original engine retired, 2026-10-15).
   storyOn stays as a reader for the checks; nothing in the engine branches on
   it. */
const STORY_VERSION = 1;
const storyOn = (L) => !!(L && L.opt && L.opt.story);
const lvl = (L) => DIFFS[L.opt && L.opt.diff] || DIFFS.normal;
