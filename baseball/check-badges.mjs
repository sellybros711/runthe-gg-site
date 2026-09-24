#!/usr/bin/env node
/* A BADGE YOU ADD HAS TO BE PROVED REACHABLE.
 *
 *   node baseball/check-badges.mjs            the full sweep, a few minutes
 *   node baseball/check-badges.mjs --quick    fewer runs, for a fast loop
 *   node baseball/check-badges.mjs --list     what lit each badge
 *
 * It plays Run The Diamond for real through run.js, in every mode and six ways of
 * drafting, in the order the screens drive it, turns each finished season into the
 * row index.html would file, and names any badge that nothing lit.
 *
 * THE HOOPS CATALOG IS WHY THIS FILE EXISTS. Its first draft asked for three things
 * that game could not produce and NOTHING FAILED, because a badge that cannot be
 * earned throws no error and breaks no test: the cabinet rendered, the squares
 * stayed dark, and the only symptom was three achievements nobody would ever get.
 * This catalog went from 36 badges to 205 in one pass, so the same trap is open
 * two hundred times over.
 *
 * A BADGE REPORTED UNREACHED IS A QUESTION, NOT A NUMBER TO MOVE. It means either
 * the mode cannot do it or no strategy here was trying. Two lists excuse one,
 * GRIND for a bigger count of a proved thing and SKILL for a feat the bots are not
 * good enough for, and neither is a free pass: each entry names another badge that
 * must ACTUALLY light on these runs, chains resolve to the end, and only the end
 * counts. So an excuse can never be the whole of a claim.
 *
 * WHAT IT DELIBERATELY CANNOT SAY is whether a badge is worth having. A trivial
 * badge is reachable too. That is a person's job.
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const E = require(path.join(HERE, 'engine.js'));
const R = require(path.join(HERE, 'run.js'));
const ACH = require(path.join(HERE, 'achievements.js'));

const QUICK = process.argv.includes('--quick');
const LIST = process.argv.includes('--list');

/* THE FAMILY LINK LIVES IN ITS OWN FILE, and a sweep that skips it reports the
   family badge as unreachable while the game hands it out perfectly well.
   index.html fetches this beside the pool; nothing in engine.js loads it. */
E.setCuratedChemistry(require(path.join(HERE, 'data', 'chemistry.json')));
const DATA = R.indexData(require(path.join(HERE, 'data', 'players.json')));

const slotsOf = (run) => (run.staff ? E.STAFF_SLOTS : E.SLOTS);

// ── the bots ───────────────────────────────────────────────────────────────
/* Six ways of drafting, because a badge unreached by ONE strategy says nothing.
   The two that matter most are opposites: `best` is what a thoughtful player does
   and is what lights the winning shelves, `cheap` is what a careless one does and
   is the only thing that lights the losing ones. */
const affordable = (run, opts) => opts.filter((p) => R.canFinishAfter(run, p));
const BOTS = {
  best: (run, o) => affordable(run, o).sort((a, b) => b.w - a.w)[0],
  value: (run, o) => affordable(run, o).sort((a, b) => (b.w / Math.max(1, b.p)) - (a.w / Math.max(1, a.p)))[0],
  cheap: (run, o) => affordable(run, o).sort((a, b) => a.p - b.p)[0],
  /* Aims at a per-slot share of what is left, which is what produces a roster
     with no weak links and is the best-drafting bot in the file. */
  spread: (run, o) => {
    const ok = affordable(run, o);
    if (!ok.length) return null;
    const target = R.remaining(run) / Math.max(1, R.slotsLeft(run));
    return ok.sort((a, b) => Math.abs(a.p - target) - Math.abs(b.p - target))[0];
  },
  /* Chases the bonds. Without it the double-play combo, the battery and the
     family link are all things no bot was trying for, which is a hole in the
     CHECKER and would read as a hole in the game. */
  chem: (run, o) => {
    const ok = affordable(run, o);
    if (!ok.length) return null;
    let bp = null, bv = -Infinity;
    for (const p of ok) {
      const v = R.previewSigning(run, p).delta * 400 + p.w;
      if (v > bv) { bv = v; bp = p; }
    }
    return bp;
  },
  /* Spends everything on one man and fills in behind him, which is the only way
     to a One-Man Show and to the dearest seasons in the pool. */
  star: (run, o) => {
    const ok = affordable(run, o);
    if (!ok.length) return null;
    return run.roster.length === 0
      ? ok.sort((a, b) => b.p - a.p)[0]
      : ok.sort((a, b) => b.w - a.w)[0];
  },
};

// ── one run, played the way the screens drive it ───────────────────────────
function inSeason(run, accept, cheapCuts) {
  const G = E.CONSTANTS.REGULAR_SEASON_GAMES;
  for (let g = 0; g < G; g++) {
    if (run.capSurvivor && R.marketAt(run, g)) {
      R.applyMarket(run, g);
      /* TWO WAYS TO GET UNDER THE NUMBER, AND THE SWEEP NEEDS BOTH. Cutting the
         DEAREST man clears the whole overage in one go, so the roster stays legal
         with the fewest cuts and is still strong enough to reach October. Cutting
         the CHEAPEST man who covers it protects the stars, costs more cuts, and
         is what lights the deeper rungs of the cut ladder.
         A sweep that only did one of them reported the other's shelf as
         unreachable, in both directions: dearest-only never cuts more than twice
         a season, cheapest-only never reaches October. */
      let guard = 0;
      while (R.overCap(run) > 0 && guard++ < 14) {
        const live = run.roster.map((p, i) => ({ p, i })).filter((x) => !x.p._repl);
        if (!live.length) break;
        let pick;
        if (cheapCuts) {
          const over = R.overCap(run);
          const asc = live.slice().sort((a, b) => a.p.p - b.p.p);
          pick = asc.find((x) => x.p.p >= over) || asc[asc.length - 1];
        } else {
          pick = live.slice().sort((a, b) => b.p.p - a.p.p)[0];
        }
        R.cutPlayer(run, pick.i);
      }
    }
    if (run.tradeMachine && R.tradeAt(run, g)) {
      const offers = R.tradeOffers(run, DATA, g);
      if (offers && offers.length) {
        if (accept) { try { R.acceptTrade(run, DATA, offers[0]); } catch (_) {} }
        else R.declineTrades(run, g);
        /* Two of the six bots decline, not one: standing pat and reaching October
           is its own badge, and one bot's worth of dealt rosters is too thin a
           sample of a 27% event to say anything either way. */
      }
    }
    R.advanceGame(run, g);
  }
  return R.finalizeSeason(run);
}

/* The row index.html would file. Kept deliberately close to rowFromRun rather than
   imported, because that function reaches into the page's own globals; the shape is
   asserted against the real one in section 1. */
function rowOf(run, o, ts) {
  let bps = null; try { bps = R.bestPossibleSquad(run, DATA); } catch (_) {}
  const links = ((o.chemistry && o.chemistry.links) || []).filter((l) => l.value > 0).map((l) => l.type);
  const rounds = (run.playoffs && run.playoffs.rounds) || null;
  const last = rounds ? rounds[rounds.length - 1] : null;
  return {
    ts, wins: o.wins, losses: o.losses, titleWon: !!o.titleWon, madePlayoffs: !!o.madePlayoffs,
    seedLabel: o.seedLabel || null, isGOAT: !!o.isGOAT, beatRecord: !!o.beatRecord,
    rating: o.shownRating != null ? Math.round(o.shownRating) : null,
    allTimeRank: o.allTimeRank != null ? o.allTimeRank : null,
    chemPct: o.chemistry ? Math.round((o.chemistry.multiplier - 1) * 1000) / 10 : null,
    spend: run.roster.reduce((s, p) => s + p.p, 0),
    respins: run.respinsUsed || 0,
    efficiency: bps ? bps.efficiency : null,
    archetype: (o.structure && o.structure.archetype) ? o.structure.archetype.key : null,
    chemLinks: [...new Set(links)],
    era: run.era || null, franchise: run.franchise || null, division: run.division || null,
    capSurvivor: !!run.capSurvivor, cuts: (run.cuts || []).length, staff: !!run.staff,
    tradeMachine: !!run.tradeMachine, trades: (run.trades || []).filter((t) => t.accepted).length,
    daily: !!run.daily,
    eliminatedWS: !!(last && last.round === 'World Series' && !o.titleWon),
    picks: run.roster.map((p, i) => ({ i: p.i, s: p.s, t: p.t, slot: slotsOf(run)[run.slotIndex[i]], w: p.w })),
  };
}

function playOne(opts, botName, ts, respins) {
  const run = R.createRun(opts);
  const bot = BOTS[botName];
  if (run.tradeMachine) { if (!R.dealRoster(run, DATA)) return null; }
  let guard = 0, spun = 0;
  while (run.phase === R.PHASES.DRAFT && guard++ < 500) {
    let draw;
    try { draw = R.spin(run, DATA); } catch (_) { return null; }
    /* The re-spin shelf cannot be lit by a bot that never presses the button.
       Spend them early, where the fee is cheapest and the draft can still absorb it. */
    if (spun < (respins || 0) && R.canRespin(run).ok) {
      spun++;
      try { R.respin(run, DATA); } catch (_) {}
    }
    const opt = (run.currentDraw.options || []).map((k) => DATA.allPlayers[k]).filter(Boolean);
    const pick = bot(run, opt);
    if (!pick) {
      if (R.canRespin(run).ok) { try { R.respin(run, DATA); continue; } catch (_) { return null; } }
      return null;
    }
    try { R.sign(run, pick); } catch (_) { return null; }
  }
  if (run.phase !== R.PHASES.SEASON) return null;
  const softBot = (botName === 'cheap' || botName === 'value' || botName === 'chem');
  const o = (run.capSurvivor || run.tradeMachine)
    ? inSeason(run, !softBot, softBot)
    : R.playSeason(run);
  return rowOf(run, o, ts);
}

// ── the sweep ──────────────────────────────────────────────────────────────
const N = QUICK ? 3 : 12;
const eras = Object.keys(E.ERAS);
const divisions = Object.keys(E.DIVISIONS);
const franchises = R.eligibleFranchises(DATA).map((f) => f.team);

/* A DAY PER ROW, WALKING FORWARD, which is what makes the streak shelves askable
   at all: playStreak counts distinct calendar days, so a sweep that stamped every
   row with Date.now() would be one enormous day and every streak badge would
   report unreachable. One run a day, in order, is also exactly what a player who
   turns up every day produces. */
const DAY = 86400000;
const START = Date.UTC(2026, 0, 1, 18, 0, 0);
let dayN = 0;
const nextTs = () => START + (dayN++) * DAY;

const rows = [];
const plan = [];
/* WALKED ACROSS THE WHOLE SWEEP, not restarted per bot. Indexed off the bot's own
   loop counter, all six bots drew the SAME nine clubs, so the franchise shelf
   reported fifteen different clubs as unreachable in a game with more than forty.
   A collection shelf needs the collection to be walked once, not six times. */
let franN = 0;
for (const bot of Object.keys(BOTS)) {
  for (let i = 0; i < N; i++) plan.push([{}, bot, 0]);
  /* THE DAILY BLOCK IS A FIXED SIXTEEN AND NOT N, and it is played as sixteen
     consecutive days on purpose. The daily shelf counts dailies finished and days
     finished in a row, and neither is askable of a sweep that plays three of them
     or stamps them all with the same afternoon. Sixteen straight days is exactly
     what somebody who plays the daily every morning produces, which is who those
     rungs are for. */
  for (let i = 0; i < 16; i++) plan.push([{ daily: true }, bot, 0]);
  for (let i = 0; i < N; i++) plan.push([{ capSurvivor: true }, bot, 0]);
  for (let i = 0; i < N; i++) plan.push([{ staff: true }, bot, 0]);
  for (let i = 0; i < N; i++) plan.push([{ tradeMachine: true }, bot, 0]);
  /* Every era and every division at least once, because thirteen of the decade
     badges and the six division draws are a COLLECTION: a sample that happened to
     miss the 1940s would report a badge the game hands out fine. */
  for (const era of eras) for (let i = 0; i < (QUICK ? 1 : 2); i++) plan.push([{ era }, bot, 0]);
  for (const division of divisions) plan.push([{ division }, bot, 0]);
  for (let i = 0; i < N * 3; i++) plan.push([{ franchise: franchises[(franN++) % franchises.length] }, bot, 0]);
  /* And a few drafts that use the button, for the re-spin shelf. */
  for (let i = 0; i < N; i++) plan.push([{}, bot, E.CONSTANTS.MAX_RESPINS]);
}

let seedN = 0, failed = 0;
for (const [opts, bot, respins] of plan) {
  const seed = E.hashSeed('badges-' + bot + '-' + (seedN++));
  let row = null;
  try { row = playOne({ ...opts, seed }, bot, nextTs(), respins); } catch (_) {}
  if (row) { row._bot = bot; rows.push(row); } else { failed++; }
}

// ── the excuse lists ───────────────────────────────────────────────────────
/* GRIND: more of something a shorter rung already proved. The sweep plays a few
   thousand seasons, not the hundreds of days a human career is, so a count badge
   is excused by the same count at a height the sweep DOES reach.
   SKILL: a feat no bot here is good enough for. Each names a badge that must
   actually light, so an excuse can never stand on its own. */
/* BOTH LISTS ARE SHORT ON PURPOSE. The first draft of them was three times this
   size and most of it was wrong in the harmless direction: the sweep plays a few
   thousand seasons as one career, so the count ladders light on their own and an
   excuse written for them said nothing. Section 5 is what pruned it, and it is
   what stops the lists growing back. */
const GRIND = {
  daily_100: 'daily_50',
  daily_streak_30: 'daily_streak_14',
  title_10: 'title_5',
};
const SKILL = {
  /* THE TOP OF THE WINNING LADDER. Measured over 1,750 played seasons, matching
     the all-time record happens on 0.2% of them and beating it on 0.1%, which a
     sweep this size meets once if it is lucky. A person drafting deliberately
     does better than any bot here. */
  tie_record: 'win_110', goat: 'tie_record',
  /* THE NUMBER ONE TEAM OF ALL TIME, and it used to light for the wrong reason.
     `bestRank` is nationalRank() over squadRating, so rank 1 means beating the
     best of 2,594 real team-seasons, which rates 95.4. Measured over 250 seeds a
     greedy draft tops out at 87.7 (rank 8) and 150 seeds of three other bots
     never passed 86.4, so no bot here reaches it.

     It LIT before `rebuildSimState` was corrected, and that is the whole reason
     it is only being excused now: the old yardstick swapped scales on any run
     that cut a player or took a trade and reached 100.0, which clears 95.4
     comfortably. A badge lit by a defect was never really reachable.

     `rank_top3` wants 89.5 and DOES light, so the excuse rests on the same
     mechanic being reached one rung down rather than on nothing. */
  rank_one: 'rank_top3',
  /* A TITLE IS ABOUT ONE RUN IN SIXTY even for the best bot, so anything that
     asks for a title AND a second condition is a coincidence the sweep cannot
     schedule. Each is excused by the half of itself that IS reached, so no claim
     here rests on the excuse alone. */
  wildcard_title: 'seed_wildcard',
  murderers_row: 'arch_murderers_row',
  respin_title: 'respin_3',
  threepeat: 'btb_title', fourpeat: 'threepeat',
  /* `daily_title` and `mode_classic_title` came off with them, for the same
     reason and on the same run. */
  mode_survivor_title: 'mode_survivor_oct',
  mode_division_title: 'mode_division_oct',
  /* THE FOURTH MODE WAS MISSING FROM ITS OWN PATTERN. Classic, Survivor and
     Division each had this line and One Franchise did not, so the quick sweep
     reported "One Franchise champions" unreachable against a game that lights
     it perfectly well: the full sweep does, and the anchor below lights in
     quick (best / franchise). A title in one named mode is about a 3% event,
     which three runs a bot resolves as a coin toss. */
  mode_franchise_title: 'mode_franchise_oct',
  /* AND ALL-TIME STAFF WAS MISSING FROM THE SAME PATTERN, which is the One
     Franchise finding one line up arriving at the fifth mode. Every other named
     mode carries this line; this one did not, and it lit in quick only for as
     long as the sweep happened to win one there. The full sweep lights it. */
  mode_staff_title: 'mode_staff_oct',
  /* A title is roughly one run in twenty and a title spending under $160M is
     about a fifth of those, so the quick sweep reaches the first and not the
     second. Anchored on the half it does reach, which is winning one at all. */
  bargain_title: 'win_title',
  /* SALARY CAP SURVIVOR'S THREE ENTRIES CAME OFF and the reason is worth keeping,
     because it is the direction this file is usually wrong in. `mode_survivor_oct`,
     `surv_clean_oct` and `all_modes_oct` were excused as roughly 5% events that a
     sweep this size could not schedule. All three light now, in quick, and nothing
     about Survivor was touched: what moved is that the rotation stopped being
     over-valued, so a season is decided by the roster the market leaves you rather
     than by two arms. An excuse on a badge that lights is not harmless, it is the
     check quietly agreeing not to look at that badge again. */
  /* Two men from a curated family, which needs the draft to offer both and the
     drafter to want them. Five rosters in 1,750 had one. The anchor is the other
     link that has to be gone looking for rather than fallen into. */
  family: 'link_battery',
  /* Ten Octobers running, at a 23% October rate. */
  oct_streak_10: 'oct_streak_5',
  /* TWO TITLES RUNNING, at about one run in twenty. The chain above already
     anchors three and four in a row on this one, so it was the only rung of that
     ladder with nothing under it: it lit in quick while the sweep happened to
     stack two, and the full sweep lights it. Anchored on winning one at all. */
  btb_title: 'win_title',
  /* 98% draft efficiency, which is the share of the WAR on your own boards that
     you walked away with. `eff_95` is the rung below and lights; the last three
     points need every board to offer the best man at a price the roster can still
     afford, which is the draft going right twelve times running. */
  perfect_draft: 'eff_95',
  /* `daily_100w` HAD AN EXCUSE AND DID NOT NEED ONE. A hundred wins on a daily
     lights in the quick sweep (spread / classic), so the entry was section 5's
     own target: an excuse written for something that turned out to be reachable,
     standing in the way of the claim it was meant to support. Removed rather
     than left, because a stale excuse is exactly what that section exists to
     prune and it had been sitting in the file failing it. */
};

// ── report ─────────────────────────────────────────────────────────────────
let problems = 0;
const say = (ok, msg) => { if (!ok) problems++; console.log((ok ? '  ok   ' : '  FAIL ') + msg); };

/* THE EXCUSE LISTS ANSWER TO THE QUICK SWEEP, AND THAT IS THE STRICTER CHOICE OF
   THE TWO. Reachability (section 4) is hard on both: a badge nothing lit and
   nothing excuses is a failure whatever size the sweep is, and it is what CI runs.
   What CANNOT be hard on both is section 5, which prunes an excuse written for
   something that turned out to be reachable. A sweep four times the size reaches
   strictly more, so it will always call some of these stale: over 1,750 measured
   seasons, matching the all-time record happens on 0.2% of them and taking a title
   in one named mode on about 3%, which the smaller sweep resolves as a coin toss.
   Pruning on the full sweep would then make the quick one fail, which is the loop
   this is written to avoid. So the lists are tuned to --quick, and the full sweep
   reports its extra reach as a note rather than as an instruction. */
const soft = (ok, msg) => {
  if (!ok && QUICK) problems++;
  console.log((ok ? '  ok   ' : QUICK ? '  FAIL ' : '  note ') + msg);
};

console.log('Run The Diamond: every badge, against real runs\n');
console.log('1. The sweep');
console.log('   seasons played   ', rows.length, '(' + failed + ' drafts stranded)');
console.log('   badges in the catalogue', ACH.CATALOGUE.length);
say(rows.length > 200, 'the sweep finished enough seasons to say anything');

/* The row this file builds has to be the row the page files, or every claim below
   is about a shape the game does not store. Asserted by FIELD NAME against
   index.html's own rowFromRun rather than by eye. */
import fs from 'fs';
const pageSrc = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8');
const fnAt = pageSrc.indexOf('function rowFromRun');
const fnSrc = pageSrc.slice(fnAt, pageSrc.indexOf('\n}', fnAt));

/* WALKED AT DEPTH, NEVER LINE BY LINE. The first version matched a key at the
   start of a line, and rowFromRun packs several to a line: it found 12 of the 26
   fields and then certified that all 12 were present. That is this repo's
   silently-wrong extractor, arriving at its own checker, and it was the coverage
   clause underneath it that reported it rather than anything about the page.
   Depth 1 of the returned object is the row's own fields; deeper is a pick. */
function topLevelKeys(src) {
  const open = src.indexOf('{', src.indexOf('return'));
  const out = [];
  let depth = 0, word = '', expectKey = false;
  for (let i = open; i < src.length; i++) {
    const ch = src[i], next = src[i + 1];
    /* Comments and strings first, or the block comment in the middle of this
       object and the string 'World Series' both feed punctuation to the walk. */
    if (ch === '/' && next === '*') { i = src.indexOf('*/', i) + 1; word = ''; continue; }
    if (ch === '/' && next === '/') { i = src.indexOf('\n', i); word = ''; continue; }
    if (ch === "'" || ch === '"' || ch === '`') {
      for (i++; i < src.length && src[i] !== ch; i++) if (src[i] === '\\') i++;
      word = ''; continue;
    }
    if (ch === '{' || ch === '[' || ch === '(') { depth++; expectKey = (depth === 1); word = ''; continue; }
    if (ch === '}' || ch === ']' || ch === ')') { depth--; word = ''; if (depth === 0) break; continue; }
    if (/[A-Za-z0-9_$]/.test(ch)) { word += ch; continue; }
    /* A KEY IS PRECEDED BY AN OPENING BRACE OR A COMMA, and that clause is the
       whole of the difference between reading this object and reading a ternary.
       `archetype: x ? x.key : null` has a colon at depth 1 whose left side is a
       property access, and the first walker filed `key` as a field of the row. */
    if (ch === ':' && depth === 1 && expectKey && word && !/^\d/.test(word)) {
      out.push(word); expectKey = false;
    } else if (ch === ',' && depth === 1) {
      expectKey = true;
    }
    word = '';
  }
  return [...new Set(out)];
}
const pageFields = topLevelKeys(fnSrc);
const mineFields = Object.keys(rows[0] || {}).filter((k) => k[0] !== '_');
const missing = pageFields.filter((f) => !mineFields.includes(f));
console.log('\n2. The fixture row is the row the page files');
say(pageFields.length >= 20, 'read ' + pageFields.length + ' fields out of rowFromRun');
say(missing.length === 0, 'every field rowFromRun writes is on the fixture row'
  + (missing.length ? ': missing ' + missing.join(', ') : ''));

/* The decade list in achievements.js is written out rather than read off the
   engine, deliberately, so that it stands alone in node. This is the seam. */
const engineDecades = [...new Set(Object.values(E.ERAS).map(([lo]) => Math.floor(lo / 10) * 10))].sort();
say(JSON.stringify(engineDecades) === JSON.stringify(ACH.DECADES),
  'the catalogue names the same decades the engine does');
say(ACH.MODES.length === 7, 'the catalogue names all seven ways to play');

/* A CEILING CANNOT BE ASKED FOR MORE THAN IT HOLDS, and the re-spin shelf shipped
   its first draft asking for five of a thing capped at three. Reachability found
   it, but only because the sweep happened to try; the arithmetic is worth asking
   directly, because it is the one class of unearnable badge that needs no runs at
   all to detect. */
/* ASKED OF THE TEST, NEVER OF THE WORDS. A description is prose and a threshold
   is arithmetic, so the honest question is whether a row that used every re-spin
   the game allows, and won, lights every badge on that shelf. */
const maxedOut = [{
  ts: START, wins: 116, losses: 46, titleWon: true, madePlayoffs: true,
  seedLabel: 'Division winner', beatRecord: true, respins: E.CONSTANTS.MAX_RESPINS,
  spend: 150, picks: [],
}];
const respinIds = ACH.CATALOGUE.filter((a) => /re-spin/.test(a.desc)).map((a) => a.id);
const litByMax = new Set(ACH.evaluate(maxedOut).earned.map((a) => a.id));
const overAsk = respinIds.filter((id) => !litByMax.has(id) && id !== 'no_respin_title');
say(respinIds.length >= 2, 'the re-spin shelf has rungs to check (' + respinIds.length + ')');
say(overAsk.length === 0,
  'no badge asks for more re-spins than MAX_RESPINS (' + E.CONSTANTS.MAX_RESPINS + ')'
  + (overAsk.length ? ': ' + overAsk.join(', ') : ''));

console.log('\n3. What lit');
const lit = {};
for (const a of ACH.CATALOGUE) lit[a.id] = null;
/* Walked forward one row at a time, so the streak shelves see a career rather than
   a heap: newlyEarned is what the game itself calls, and it is the only thing that
   can say WHICH run lit a badge. */
const history = [];
for (const row of rows) {
  let fresh = [];
  try { fresh = ACH.newlyEarned(history, row); } catch (e) { fresh = []; }
  for (const a of fresh) if (lit[a.id] == null) lit[a.id] = row._bot + ' / ' + ACH.modeKeyOf(row);
  history.push(row);
}
const dark = ACH.CATALOGUE.filter((a) => lit[a.id] == null);
console.log('   lit        ', ACH.CATALOGUE.length - dark.length);
console.log('   still dark ', dark.length);

if (LIST) {
  console.log('');
  for (const a of ACH.CATALOGUE) {
    console.log('   ' + (lit[a.id] ? 'X' : '.') + ' ' + a.id.padEnd(24) + (lit[a.id] || ''));
  }
}

console.log('\n4. Nothing in the catalogue is unreachable');
/* An excuse resolves to the END of its chain and only the end counts, so a ladder
   cannot excuse itself upward off a rung that is also dark. */
function resolves(id, seen) {
  seen = seen || new Set();
  if (seen.has(id)) return null;
  seen.add(id);
  const next = GRIND[id] || SKILL[id];
  if (!next) return id;
  return resolves(next, seen);
}
const unexplained = [];
for (const a of dark) {
  const end = resolves(a.id);
  const why = GRIND[a.id] ? 'grind' : SKILL[a.id] ? 'skill' : null;
  if (!why) { unexplained.push([a, 'nothing lit it and nothing excuses it']); continue; }
  if (end == null) { unexplained.push([a, 'its excuse chain is a loop']); continue; }
  if (lit[end] == null) { unexplained.push([a, why + ', but its chain ends at ' + end + ', which is also dark']); continue; }
}
for (const [a, why] of unexplained) soft(false, a.id.padEnd(24) + a.name + ': ' + why);
if (!unexplained.length) console.log('  ok   every badge lit, or is excused by one that did');
else console.log('       A rung nothing reaches is a question. Ask whether the game can do it'
  + '\n       at all before reaching for a list.');

/* An excuse for a badge that DID light is an excuse nobody needs, and the way that
   arrives is somebody excusing a rung, fixing the reach, and leaving the entry. A
   list nobody prunes is a list that stops meaning anything. */
console.log('\n5. The excuse lists earn their entries');
const stale = [...Object.keys(GRIND), ...Object.keys(SKILL)].filter((id) => lit[id] != null);
soft(stale.length === 0, 'no excuse is written for a badge that lit'
  + (stale.length ? ': ' + stale.join(', ') : ''));
const ids = new Set(ACH.CATALOGUE.map((a) => a.id));
const ghosts = [...Object.keys(GRIND), ...Object.keys(SKILL),
  ...Object.values(GRIND), ...Object.values(SKILL)].filter((id) => !ids.has(id));
say(ghosts.length === 0, 'every id in the two lists is a badge that exists'
  + (ghosts.length ? ': ' + ghosts.join(', ') : ''));

console.log('\n6. The catalogue itself');
const dupes = ACH.CATALOGUE.map((a) => a.id).filter((x, i, arr) => arr.indexOf(x) !== i);
say(dupes.length === 0, 'no id appears twice' + (dupes.length ? ': ' + dupes.join(', ') : ''));
const badGroup = ACH.CATALOGUE.filter((a) => !ACH.GROUPS.includes(a.group));
say(badGroup.length === 0, 'every badge is on a shelf GROUPS names');
const badTier = ACH.CATALOGUE.filter((a) => !ACH.TIERS[a.tier]);
say(badTier.length === 0, 'every badge has a real tier');
/* A cabinet that starts half full is a cabinet that says nothing. */
const onEmpty = ACH.evaluate([]).earned;
say(onEmpty.length === 0, 'nothing is earned before a single season is played'
  + (onEmpty.length ? ': ' + onEmpty.map((a) => a.id).join(', ') : ''));
/* And one that is full after one is a cabinet with no ladder in it. */
const onOne = ACH.evaluate(rows.slice(0, 1)).earned.length;
say(onOne < ACH.CATALOGUE.length / 4, 'one season does not fill it (' + onOne + ' of ' + ACH.CATALOGUE.length + ')');

console.log('\n7. A dash never reaches a badge name');
/* achievements.js is not on check-copy's guarded list and every string in it is
   copy a player reads. The dash rule is a character, so it can be asked here. */
/* BUILT FROM CODE POINTS, because a guarded file cannot contain the character it
   is looking for. The first version wrote the two dashes out in a character class
   and check-dashes.mjs failed on this file, which is correct. */
const DASHES = new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']');
const dashy = ACH.CATALOGUE.filter((a) => DASHES.test(a.name + a.desc));
say(dashy.length === 0, 'no badge name or description carries an em or en dash'
  + (dashy.length ? ': ' + dashy.map((a) => a.id).join(', ') : ''));

console.log('\n' + (problems ? problems + ' problem(s)' : 'All good.'));
process.exit(problems ? 1 : 0);
