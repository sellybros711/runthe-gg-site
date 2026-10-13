/* THE ROOMS.
 *
 * Every room Segue's show can be played in, and what it takes to earn one. A room changes how the
 * night looks and feels. It never changes a score: nothing in here is read by scoring.js, and the
 * stage only draws.
 *
 * NO ROOM HAS A NAME A PLAYER CAN SEE. They are pixel replicas of rooms the band has played, and a fan
 * knowing one from its picture is the whole reward. So nothing below is ever rendered except `clue`,
 * `lore` and the zone words, and those are written as clues. `archive` is the venue exactly as
 * setlist/data/goose_shows.csv spells it, so a room can be earned by drafting songs from nights played
 * there; it exists to join on and must never reach the screen. scripts/setlist/check_venues.mjs fails
 * on any csv venue name that turns up in the page's copy.
 *
 * UNLOCKS ARE DERIVED, NEVER STORED. A room is open when the account's own filed shows say so, worked
 * out every time from the rows segue_runs already keeps (the picks, the seed, the time it was filed and
 * how it scored). Nothing records "unlocked", so nothing can drift from the shows that earned it, and a
 * new rule here opens rooms for every show already played. The one stored thing is which room a player
 * chose, and that falls back to the lawn the moment it is not backed by the rows.
 *
 * A RULE IS A LIST OF REQUIREMENTS AND ALL OF THEM HAVE TO HOLD. A requirement may carry an `or`, a
 * second way to the same thing, which is how a seasonal room stays reachable the rest of the year.
 *   picks    n songs drafted from nights at this room's `archive` venues
 *   shows    n shows filed
 *   days     n different days played, Eastern
 *   dailies  n daily challenges played
 *   pct      one show at n% of the best you could have built
 *   bustouts one show with n bustouts in it
 *   segues   one show with n segues in it
 *   month    a show filed in one of `months` (1 to 12), Eastern
 *   late     a show filed between midnight and 4am, Eastern
 *
 * A `picks` rule can only name a venue with a night a draft can actually draw. check_venues.mjs holds
 * that, because a room asking for songs from shows that are never dealt is a room nobody can earn.
 */

export const TIERS = [
  { id: 'home',  label: 'Where it starts' },
  { id: 'bars',  label: 'The bar years' },
  { id: 'halls', label: 'Theatres and halls' },
  { id: 'sky',   label: 'Under the sky' },
  { id: 'big',   label: 'The big rooms' },
  { id: 'away',  label: 'Far from home' },
];

/* `zones` are the crowd card's words for this floor: `floor` names the middle and back of the crowd,
   `worst` is the last row. Generic on purpose, so the words never name the room. */
export const VENUE_LIST = [
  { id: 'lawn', tier: 'home', free: true, archive: [],
    lore: 'A lawn, a stage and the sun going down.',
    clue: '', zones: { floor: 'lawn', worst: 'Out by the merch tent' } },

  // ── the bar years ──
  { id: 'pub', tier: 'bars', archive: ["O'Neill's Irish Pub & Restaurant"],
    rule: [{ k: 'shows', n: 3 }],
    lore: 'Eighteen nights in a pub in Norwalk.',
    clue: 'Build 3 shows. It started in one bar, over and over.',
    zones: { floor: 'room', worst: 'Back by the bar' } },
  { id: 'studio', tier: 'bars', archive: ['Factory Underground Studio'],
    rule: [{ k: 'month', months: [12], or: { k: 'days', n: 20 } }],
    lore: 'Where Goosemas began.',
    clue: 'Where Goosemas began. File a show in December, or play on 20 different days.',
    zones: { floor: 'room', worst: 'Back on the couch' } },

  // ── theatres and halls ──
  { id: 'cap', tier: 'halls', archive: ['The Capitol Theatre', "Garcia's at The Capitol Theatre"],
    rule: [{ k: 'shows', n: 8 }, { k: 'picks', n: 3 }],
    lore: 'Nineteen nights in Port Chester.',
    clue: 'Build 8 shows and draft 3 songs from nights in Port Chester.',
    zones: { floor: 'floor', worst: 'Up in the balcony' } },
  { id: 'ryman', tier: 'halls', archive: ['Ryman Auditorium'],
    rule: [{ k: 'shows', n: 15 }, { k: 'picks', n: 2 }],
    lore: 'Three spring nights in Nashville, 2023.',
    clue: 'Build 15 shows and draft 2 songs from Nashville, spring 2023.',
    zones: { floor: 'pews', worst: 'In the last pew' } },
  { id: 'radio', tier: 'halls', archive: ['Radio City Music Hall'],
    rule: [{ k: 'shows', n: 20 }, { k: 'pct', n: 70 }, { k: 'picks', n: 1 }],
    lore: 'Two June nights in Midtown, 2022.',
    clue: 'Build 20 shows, one at 70% or better, and draft a song from Midtown, June 2022.',
    zones: { floor: 'orchestra', worst: 'At the back of the orchestra' } },

  // ── under the sky ──
  { id: 'rocks', tier: 'sky', archive: ['Red Rocks Park and Amphitheater'],
    rule: [{ k: 'shows', n: 25 }, { k: 'picks', n: 3 }],
    lore: 'Two rocks, a canyon and Denver down below.',
    clue: 'Build 25 shows and draft 3 songs from the nights under the rocks.',
    zones: { floor: 'rows', worst: 'Top row of the rocks' } },

  // ── the big rooms ──
  { id: 'garden', tier: 'big', archive: ['Madison Square Garden'],
    rule: [{ k: 'shows', n: 40 }, { k: 'pct', n: 85 }, { k: 'picks', n: 2 }],
    lore: 'The room above Penn Station.',
    clue: 'Build 40 shows, one at 85% or better, and draft 2 songs from above Penn Station.',
    zones: { floor: 'floor', worst: 'Up in the rafters' } },

  // ── far from home ──
  { id: 'cabo', tier: 'away', archive: ['El Ganzo Oasis', 'Hotel El Ganzo'],
    rule: [{ k: 'month', months: [12, 1, 2, 3], or: { k: 'picks', n: 2 } }, { k: 'shows', n: 5 }],
    lore: 'Sand, a sunset and a run of May nights by the sea.',
    clue: 'Build 5 shows, then play one in winter or draft 2 songs from the nights by the sea in Mexico.',
    zones: { floor: 'sand', worst: 'Back by the pool' } },
];

export const VENUE_BY_ID = Object.fromEntries(VENUE_LIST.map(v => [v.id, v]));

/* The words the crowd card uses, in rank order: the rail is the best night drafted and the last row
   is the worst. The same six steps on every floor; only the floor's own words change. */
export function crowdZones(id){
  const z = (VENUE_BY_ID[id] || VENUE_BY_ID.lawn).zones;
  return [
    [0.01, 'On the rail'],
    [0.10, 'In the pit'],
    [0.25, 'Up front'],
    [0.50, `Middle of the ${z.floor}`],
    [0.75, `Back of the ${z.floor}`],
    [1.01, z.worst],
  ];
}

// ── reading the rows ───────────────────────────────────────────────────────
const ZONE = 'America/New_York';
function eastern(iso){
  const d = new Date(iso);
  if (isNaN(d)) return null;
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: ZONE, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' }).formatToParts(d).map(x => [x.type, x.value]));
    return { day: `${p.year}-${p.month}-${p.day}`, month: Number(p.month), hour: Number(p.hour) % 24 };
  } catch (e) {
    return { day: d.toISOString().slice(0, 10), month: d.getUTCMonth() + 1, hour: d.getUTCHours() };
  }
}

/* Everything a rule can ask, worked out once from the rows. `venueOf` maps a show id to the venue
   the archive files it under. A row is one filed show: created_at, rng_seed, picks
   ("<show_id>:<song_id>"), pct_of_best, bustouts, segues. */
export function tally(rows, venueOf){
  const t = { shows: 0, days: new Set(), dailies: new Set(), pct: 0, bustouts: 0, segues: 0,
    months: new Set(), late: false, picks: new Map() };
  for (const r of rows || []){
    if (!r || (r.band && r.band !== 'goose')) continue;
    t.shows++;
    const e = r.created_at ? eastern(r.created_at) : null;
    if (e){
      t.days.add(e.day); t.months.add(e.month);
      if (e.hour < 4) t.late = true;
    }
    const seed = String(r.rng_seed || '');
    if (seed.startsWith('daily:')) t.dailies.add(seed.slice(6));
    t.pct = Math.max(t.pct, Number(r.pct_of_best) || 0);
    t.bustouts = Math.max(t.bustouts, Number(r.bustouts) || 0);
    t.segues = Math.max(t.segues, Number(r.segues) || 0);
    for (const k of r.picks || []){
      const v = venueOf ? venueOf(String(k).split(':')[0]) : null;
      if (v) t.picks.set(v, (t.picks.get(v) || 0) + 1);
    }
  }
  return t;
}

function one(req, t, venue){
  switch (req.k){
    case 'shows':    return { have: t.shows, need: req.n };
    case 'days':     return { have: t.days.size, need: req.n };
    case 'dailies':  return { have: t.dailies.size, need: req.n };
    case 'pct':      return { have: Math.floor(t.pct), need: req.n };
    case 'bustouts': return { have: t.bustouts, need: req.n };
    case 'segues':   return { have: t.segues, need: req.n };
    case 'picks':    return { have: venue.archive.reduce((s, a) => s + (t.picks.get(a) || 0), 0), need: req.n };
    case 'month':    return { have: req.months.some(m => t.months.has(m)) ? 1 : 0, need: 1 };
    case 'late':     return { have: t.late ? 1 : 0, need: 1 };
    default: throw new Error(`venues.js: unknown rule "${req.k}"`);
  }
}
/* A requirement and its `or`: met if either is, and as far along as the further of the two. */
function evalReq(req, t, venue){
  const a = one(req, t, venue);
  if (!req.or) return a;
  const b = one(req.or, t, venue);
  const fa = Math.min(1, a.have / a.need), fb = Math.min(1, b.have / b.need);
  return fa >= fb ? a : b;
}

/* Where every room stands for these rows. `open` is the whole answer; `frac` is how far along the
   requirements are on average, which is what the progress bar draws. An average rather than the
   least finished one, or a bar sits empty for weeks while two of its three parts fill up. */
export function venueProgress(rows, venueOf){
  const t = tally(rows, venueOf);
  return VENUE_LIST.map(v => {
    if (v.free) return { id: v.id, open: true, frac: 1, reqs: [] };
    const reqs = v.rule.map(r => evalReq(r, t, v));
    const frac = reqs.reduce((t, r) => t + Math.min(1, r.have / r.need), 0) / reqs.length;
    return { id: v.id, open: reqs.every(r => r.have >= r.need), frac, reqs };
  });
}

/* The rooms this show opened: open after it and not before. */
export function newlyOpen(before, after){
  const was = new Set(before.filter(p => p.open).map(p => p.id));
  return after.filter(p => p.open && !was.has(p.id)).map(p => p.id);
}
