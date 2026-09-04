/*
 * achievements.js - the badge cabinet for The Perfect Season.
 *
 * DERIVED, NEVER STORED. Every achievement here is computed from the run rows the
 * leaderboard already keeps (created_at, title_won, run_mode, franchise, picks, slots,
 * seed_label, respins, chemistry_pct, spend_musd, team_rating, perfect_pct). Nothing new is
 * written to the database and no migration is needed, which buys three things worth having:
 *
 *   - it is RETROACTIVE. A player who has been here for months opens the profile and finds
 *     the cabinet already filled in, rather than starting from zero on the day this shipped.
 *   - it follows the account, not the browser. Clearing storage or switching phones cannot
 *     lose a badge, because the badge was never a stored fact in the first place.
 *   - it cannot drift out of step with the leaderboard, because it reads the same rows.
 *
 * The one thing kept locally is the set of ids already SEEN, so a newly earned badge can be
 * announced once. Losing that file costs a toast, never a badge.
 *
 * WHY THERE ARE THIS MANY. A player who turns up for months needs something still left to
 * chase in month four, and a cabinet of fifty is finished long before then. Most of the count
 * comes from COLLECTIONS rather than from inventing three hundred one-off rules: the 27
 * seasons the game covers, the 32 clubs, the college programs, the calendar. Each one of
 * those is a small ask on its own and a long, pleasant grind taken together, which is exactly
 * the shape a collection should have. The hand-written badges are the ones with a joke or a
 * piece of football history in them.
 *
 * OLD ROWS HAVE HOLES. Columns were added over time, so any test that reads a field has to
 * treat null as "not known" rather than as zero: `has()` below is the guard, and a test that
 * cannot know its answer must return false rather than guess. That is why almost every test
 * is written against a filtered list rather than a raw count.
 *
 * Headless and dependency-free, so the catalog can be tested in node against real rows.
 * Browser: window.PS_ACH. Node: require('./achievements.js').
 */
(function () {
  'use strict';

  /* engine.js is a plain script loaded BEFORE this one, so its constants and its club names
     are here to be read. Optional all the same, because the point of a headless module is
     that node can require it with no engine at all; every read falls back. */
  const ENG = (typeof window !== 'undefined' && window.PS_ENGINE) || null;
  const CAP = (ENG && ENG.CONSTANTS && ENG.CONSTANTS.CAP_MUSD) || 140;
  const nick = (id) => (ENG && ENG.NICKNAMES && ENG.NICKNAMES[id]) || id;

  /* ---------------- badges for a mode that has not launched ----------------
   *
   * Dynasty and Full Team are both finished and both hidden: dynasty-access.js and
   * fullteam-access.js each carry a LIVE flag, false today, and a tester list that opens the
   * mode to a handful of accounts. Their badges are in the catalog only when the MODE'S OWN
   * FLAG says the mode is live, and the two access files load before this one, so flipping
   * either flag brings its shelf with it in the same edit.
   *
   * ON THE FLAG AND NOT ON THE TESTER LIST, which is the part worth being deliberate about.
   * A tester can play Dynasty today and will not see its badges until launch, and that is the
   * cheaper of the two mistakes available here. CATALOG.length is what crest.js divides by:
   * it is the "of 387" in "212 of 387 badges", and it is what GOAT means. A catalog whose
   * size depended on who was looking would give two players with identical cabinets two
   * different ranks, and would hand a tester a GOAT nobody else could reach. One number for
   * everybody, and it changes on the day the mode does.
   *
   * A rank is derived from the catalog rather than stored, so the day the flag flips every
   * cabinet is recomputed against the bigger total and the seasons a tester already played
   * are already in it. Nobody has to replay anything.
   */
  const ROOT = (typeof globalThis !== 'undefined' && globalThis)
    || (typeof window !== 'undefined' && window) || {};
  const liveFlag = (name) => {
    const m = ROOT[name];
    return !!(m && m.LIVE);
  };
  const DYNASTY_LIVE = liveFlag('PS_DYNASTY_ACCESS');
  const FULLTEAM_LIVE = liveFlag('PS_FULLTEAM_ACCESS');

  /* ---------------- small helpers ---------------- */

  const has = (v) => v !== null && v !== undefined;
  const num = (v) => (has(v) ? Number(v) : null);
  const isTrue = (v) => v === true || v === 1 || v === 't' || v === 'true';
  const uniq = (a) => Array.from(new Set(a));

  /* A local calendar day for a timestamp, as YYYY-MM-DD. Local and not UTC on purpose: a
     streak is a human habit, so "today" has to mean the player's today, not Greenwich's. */
  function dayKey(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const p = (n) => (n < 10 ? '0' + n : String(n));
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  const dayNumber = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  };
  const decadeOf = (season) => Math.floor(Number(season) / 10) * 10;
  /* The player ids on a row, with each man's season stripped off. His season is exactly what
     moves when he ages, so anything comparing one winter's roster to the next has to match on
     the id or it reports six strangers every year. */
  const idsOfRow = (r) => (Array.isArray(r.picks) ? r.picks : [])
    .map((k) => String(k).slice(0, String(k).lastIndexOf(':'))).filter(Boolean);
  /* The win the job starts out needing, read off the engine so this file and the mode cannot
     disagree about it. Falls back for the headless case with no engine loaded. */
  const DYN_BASE_WINS = (ENG && ENG.DYNASTY_BASE_WINS) || 8;

  /* ---------------- streaks ---------------- */

  /*
   * DAILY PLAY STREAK. Counted in days on which at least one run was finished, not in runs,
   * so five runs in one evening is one day and cannot be farmed.
   *
   * A streak stays ALIVE THROUGH TODAY UNTIL A WHOLE DAY IS MISSED. If the last day played
   * was yesterday the streak still stands and today is the day to keep it: that is the state
   * the profile wants to nag about. Counting only from today would mean every player's streak
   * read zero every morning until they played, which teaches them the number is noise.
   */
  function playStreak(dayKeys, todayKey) {
    if (!dayKeys.length) return { current: 0, best: 0, lastPlayed: null, playedToday: false };
    const days = dayKeys.slice().sort();
    const nums = days.map(dayNumber);
    let best = 1, run = 1;
    for (let i = 1; i < nums.length; i++) {
      run = nums[i] === nums[i - 1] + 1 ? run + 1 : 1;
      if (run > best) best = run;
    }
    const today = dayNumber(todayKey);
    const last = nums[nums.length - 1];
    let current = 0;
    if (last === today || last === today - 1) {
      current = 1;
      for (let i = nums.length - 1; i > 0; i--) {
        if (nums[i - 1] === nums[i] - 1) current++; else break;
      }
    }
    return { current, best, lastPlayed: days[days.length - 1], playedToday: last === today };
  }

  /*
   * CHAMPIONSHIP STREAK, in consecutive runs rather than in days: titles back to back, where
   * a run that ends without one breaks it. Runs are read oldest first so "current" means the
   * tail of the list.
   */
  function titleStreak(rowsAsc) {
    let best = 0, run = 0;
    for (const r of rowsAsc) {
      if (isTrue(r.title_won)) { run++; if (run > best) best = run; } else run = 0;
    }
    return { current: run, best };
  }

  /* ---------------- chemistry, per roster ----------------
   *
   * The board row stores the chemistry PERCENTAGE but not the links behind it, so anything
   * about who is connected to whom has to be recomputed from the six resolved players. The
   * caller passes engine's pairLinks; with no such function these tests answer false rather
   * than pretending. Indices, not names, because two different seasons of the same man share
   * a name and would collapse into one node.
   */
  function analyzeLinks(roster, pairLinks, sameClub) {
    const n = roster.length;
    const out = { types: new Set(), pairs: 0, connected: false, allPairs: false, biggest: 0,
      qbBothWrs: false, qbRbAndTe: false };
    if (!pairLinks || n < 2) return out;
    const parent = roster.map((_, i) => i);
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    /* WHO THE QUARTERBACK IS CONNECTED TO, for the hub shapes below. Derived here rather than
       read off the engine because the engine adds that bonus in resolveChemistry, which works
       from a live roster, and this file only ever has a finished row to work from. Same rule
       either way: any positive link counts, and positions are read off the player. */
    const qbIdx = roster.findIndex((p) => p && p.position === 'QB');
    const qbLinked = new Set();
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let links = [];
        try { links = pairLinks(roster[i], roster[j], sameClub) || []; } catch (e) { links = []; }
        const pos = links.filter((l) => l && l.value > 0);
        for (const l of links) if (l && l.type) out.types.add(l.type);
        if (!pos.length) continue;
        if (i === qbIdx) qbLinked.add(j);
        else if (j === qbIdx) qbLinked.add(i);
        out.pairs++;
        const a = find(i), b = find(j);
        if (a !== b) parent[a] = b;
      }
    }
    if (qbIdx !== -1) {
      const at = (want) => [...qbLinked].filter((k) => roster[k] && roster[k].position === want).length;
      out.qbBothWrs = at('WR') >= 2;
      out.qbRbAndTe = at('RB') >= 1 && at('TE') >= 1;
    }
    const sizes = Object.create(null);
    let big = 0;
    for (let i = 0; i < n; i++) {
      const r = find(i);
      sizes[r] = (sizes[r] || 0) + 1;
      if (sizes[r] > big) big = sizes[r];
    }
    out.biggest = big;
    out.connected = big === n;
    out.allPairs = out.pairs === (n * (n - 1)) / 2;
    return out;
  }

  /* ---------------- the context every test reads ---------------- */

  /*
   * Built once and handed to every test, because three hundred tests each walking the row
   * list is three hundred walks. Everything a COLLECTION family needs is reduced to a Set
   * here, so each of the 32 club badges is a single Set lookup rather than another pass over
   * every roster the player has ever built.
   */
  function buildContext(rows, resolve, opts) {
    const o = typeof opts === 'string' ? { nowIso: opts } : (opts || {});
    const pairLinks = o.pairLinks || null;
    const asc = rows.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const todayKey = dayKey(o.nowIso || new Date().toISOString()) || '1970-01-01';
    const dayKeys = [];
    const seenDays = Object.create(null);

    /* Calendar sets. Local time throughout, same reason as the streak: the player's clock is
       the one that decides whether this counted as a Sunday. */
    const months = new Set(), weekdays = new Set(), monthDays = new Set(), hours = new Set();

    for (const r of asc) {
      if (!r.created_at) continue;
      const k = dayKey(r.created_at);
      if (k && !seenDays[k]) { seenDays[k] = 1; dayKeys.push(k); }
      const d = new Date(r.created_at);
      if (isNaN(d.getTime())) continue;
      months.add(d.getMonth() + 1);
      weekdays.add(d.getDay());
      monthDays.add((d.getMonth() + 1) + '-' + d.getDate());
      hours.add(d.getHours());
      /* Thanksgiving: the fourth Thursday in November, worked out rather than hard-coded per
         year, because the table will outlive any list of dates written today. */
      if (d.getMonth() === 10 && d.getDay() === 4 && d.getDate() >= 22 && d.getDate() <= 28) {
        monthDays.add('thanksgiving');
      }
      if (d.getDay() === 5 && d.getDate() === 13) monthDays.add('fri13');
    }

    /* Each run's roster, resolved once. A run whose picks cannot be resolved (older data, or
       no player table handed in) gets an empty roster and is skipped by roster tests. */
    const runs = asc.map((r) => {
      let roster = [];
      if (resolve && Array.isArray(r.picks)) {
        roster = r.picks.map((k) => resolve(k)).filter(Boolean);
        if (roster.length !== r.picks.length) roster = [];
      }
      const links = roster.length
        ? analyzeLinks(roster, pairLinks, r.run_mode === 'club')
        : { types: new Set(), pairs: 0, connected: false, allPairs: false, biggest: 0 };
      /* The largest group of men off one single team-season, which is what a stack is. */
      let stack = 0;
      if (roster.length) {
        const bySide = Object.create(null);
        for (const p of roster) {
          const k = p.franchise + '|' + p.season;
          bySide[k] = (bySide[k] || 0) + 1;
          if (bySide[k] > stack) stack = bySide[k];
        }
      }
      return { row: r, roster, slots: Array.isArray(r.slots) ? r.slots : [], links, stack };
    });

    /* Row to its resolved roster, so a later pass can ask about the six men of one season
       without paying for the resolve a second time. */
    const byRow = new Map(runs.map((x) => [x.row, x]));
    const EMPTY = { roster: [] };

    /* COLLECTION SETS: everything a family badge asks about, gathered in one pass. */
    const seasonsDrafted = new Set(), clubsDrafted = new Set(), collegesDrafted = new Set();
    const awardsDrafted = new Set(), linkTypesEver = new Set();
    for (const x of runs) {
      for (const t of x.links.types) linkTypesEver.add(t);
      for (const p of x.roster) {
        seasonsDrafted.add(Number(p.season));
        if (p.franchise) clubsDrafted.add(p.franchise);
        if (p.college) collegesDrafted.add(p.college);
        for (const a of (p.awards || [])) awardsDrafted.add(a);
      }
    }

    /* ---- THE TRADE MACHINE, off the two columns 61 adds ----
       Resolved once here, same as the rosters above, because a dozen badges ask about the
       same handful of facts. A trade run recorded before those columns existed has null in
       both and contributes nothing rather than counting as a season with no trades: absent
       is not zero, which is the rule the whole of this file follows. */
    const moveRuns = [];
    const moveTypes = new Set();
    const dealtOut = [], dealtIn = [], cutPlayers = [], askedPlayers = [];
    let bestGm = null, totalTrades = 0;
    for (const r of asc) {
      if (r.run_mode !== 'trade') continue;
      if (has(r.gm_rating)) {
        const g = Number(r.gm_rating);
        if (bestGm === null || g > bestGm) bestGm = g;
      }
      if (!Array.isArray(r.trade_moves)) continue;
      const res = (k) => (resolve ? resolve(k) : null);
      const priced = (list) => list.reduce((t, p) => t + Number((p && p.price_musd) || 0), 0);
      const moves = [], windows = new Set(), outKeys = new Set();
      let trades = 0, fa = 0, cuts = 0, askedFor = 0;
      let cashDeals = 0, cashSpent = 0, biggestCash = 0;
      for (const mv of r.trade_moves) {
        if (!mv || typeof mv !== 'object') continue;
        const outK = Array.isArray(mv.out) ? mv.out : [];
        const inK = Array.isArray(mv.in) ? mv.in : [];
        const outP = outK.map(res).filter(Boolean);
        const inP = inK.map(res).filter(Boolean);
        const w = Number(mv.w) || 0;
        trades++;
        windows.add(w);
        outK.forEach((k) => outKeys.add(k));
        if (mv.fa) fa++;
        if (mv.t) moveTypes.add(String(mv.t));
        /* A RELEASED PLAYER IS IN `out` AS WELL, because he did leave in this move, so the
           two lists overlap by design: "traded away a 20-point man" and "released a 20-point
           man" are different badges and `cut` is what tells them apart. */
        /* `cuts` is the full list when a deal released more than one man; `cut` is the first
           of them and the only key rows written before three-for-ones existed carry. Reading
           the list when it is there and falling back to the single key otherwise keeps every
           older row counting exactly as it did. */
        const cutKeys = Array.isArray(mv.cuts) && mv.cuts.length ? mv.cuts
          : (mv.cut ? [mv.cut] : []);
        for (const ck of cutKeys) {
          cuts++;
          const cp = res(ck);
          if (cp) cutPlayers.push(cp);
        }
        if (mv.ask) {
          askedFor++;
          const ap = res(mv.ask);
          if (ap) askedPlayers.push(ap);
        }
        /* Cash paid on top of a deal, which comes off the cap ceiling and never comes back.
           Absent on every row written before the mechanic existed, so it reads as zero. */
        const cashM = Number(mv.cash) || 0;
        if (cashM > 0) { cashDeals++; cashSpent += cashM; biggestCash = Math.max(biggestCash, cashM); }
        outP.forEach((p) => dealtOut.push(p));
        inP.forEach((p) => dealtIn.push(p));
        moves.push({ w, t: mv.t, outPlayers: outP, inPlayers: inP,
          outMusd: priced(outP), inMusd: priced(inP),
          cutCount: cutKeys.length, asked: mv.ask || null, cash: cashM });
      }
      totalTrades += trades;
      moveRuns.push({ row: r, moves, windows, outKeys, trades, fa, cuts, askedFor,
        cashDeals, cashSpent: Math.round(cashSpent * 10) / 10, biggestCash,
        outPlayers: moves.reduce((a, m) => a.concat(m.outPlayers), []),
        inPlayers: moves.reduce((a, m) => a.concat(m.inPlayers), []) });
    }

    /* ---- DYNASTY, WHICH IS THE ONE MODE WHERE A ROW IS NOT A RUN ----
       Every other mode on this site plays one season and files one row, so "a run" and "a
       row" are the same thing and every test above can be written against the flat list.
       Dynasty files a row PER SEASON, tagged with the id of the run it belongs to, and
       almost everything worth asking about it is a question about the run rather than the
       season: how far it got, how many rings it collected on the way, whether the same man
       was still there five winters later. So the seasons are gathered back into runs once,
       here, and the badges below ask about these rather than about rows.

       A row with no dynasty_id contributes nothing. That covers three real cases and they
       all want the same answer: a season from another mode, a dynasty season played before
       98 added the columns, and a database that has 98 but whose client could not ask for
       them. None of those is "a dynasty of length zero", so none of them makes one. */
    const dynMap = new Map();
    for (const r of asc) {
      if (r.run_mode !== 'dynasty' || !r.dynasty_id) continue;
      let d = dynMap.get(r.dynasty_id);
      if (!d) { d = { id: r.dynasty_id, seasons: [] }; dynMap.set(r.dynasty_id, d); }
      d.seasons.push(r);
    }
    const dynasties = [];
    for (const d of dynMap.values()) {
      /* BY THE SEASON NUMBER THE RUN ITSELF KEPT, not by when the row was written. They
         usually agree and they are not the same thing: a run picked up again the next
         morning writes season 7 a day after season 6, and a resumed save can write two
         seasons out of clock order if a submit was retried. The run's own count is the only
         ordering that is true by construction. */
      const seasons = d.seasons.slice().sort((a, b) => Number(a.dynasty_season) - Number(b.dynasty_season));
      const reached = seasons.reduce((m, r) => Math.max(m, Number(r.dynasty_season) || 0), 0);
      const score = seasons.reduce((m, r) => Math.max(m, Number(r.dynasty_score) || 0), 0);
      const wins = seasons.map((r) => num(r.wins)).filter((v) => v !== null);
      /* Rings in a row INSIDE ONE RUN, which is a different question from the career streak
         above: that one counts across every mode and every run, this one is a story about
         one team. Counted over consecutive seasons of this dynasty only. */
      let ringRun = 0, bestRing = 0, poRun = 0, bestPo = 0;
      for (const r of seasons) {
        if (isTrue(r.title_won)) { ringRun++; if (ringRun > bestRing) bestRing = ringRun; } else ringRun = 0;
        if (isTrue(r.made_playoffs)) { poRun++; if (poRun > bestPo) bestPo = poRun; } else poRun = 0;
      }
      /* THE CAST OF THE WHOLE RUN, and the continuity inside it. A dynasty's picks are the
         same six men walking forward a year at a time, so the interesting question is not
         who was drafted but who was KEPT: the same player_id turning up in consecutive
         seasons is a man who survived a winter. `held` is the longest anybody lasted.

         Keyed on player_id and NOT on the pick key, because the key carries his season and
         his season is exactly what changes when he ages. Matching on the key would report
         every roster as six strangers every year, which is the opposite of the truth. */
      const idsOf = idsOfRow;
      const cast = new Set();
      const tenure = Object.create(null);
      let held = 0, prev = null, prevN = null;
      for (const r of seasons) {
        const ids = idsOf(r);
        const n = Number(r.dynasty_season);
        for (const id of ids) cast.add(id);
        /* Only a season that directly follows the one before it can extend a tenure. A gap
           in the numbering means a season nobody has a row for, and a man on both sides of
           it was not necessarily there through it. */
        const consecutive = prev && prevN != null && n === prevN + 1;
        for (const id of ids) {
          tenure[id] = (consecutive && prev.has(id)) ? tenure[id] + 1 : 1;
          if (tenure[id] > held) held = tenure[id];
        }
        prev = new Set(ids); prevN = n;
      }
      dynasties.push({
        id: d.id, seasons, reached, score, cast, held,
        club: seasons[0] ? (seasons[0].franchise || null) : null,
        titles: seasons.filter((r) => isTrue(r.title_won)).length,
        playoffs: seasons.filter((r) => isTrue(r.made_playoffs)).length,
        perfect: seasons.filter((r) => isTrue(r.perfect)).length,
        ringStreak: bestRing, poStreak: bestPo,
        bestWins: wins.length ? Math.max.apply(null, wins) : null,
        worstWins: wins.length ? Math.min.apply(null, wins) : null,
        /* The last season anybody has a row for. Whether it ENDED there is not knowable: a
           firing is not written down, and a run still going looks exactly the same. So no
           badge below says "your dynasty ended", only how far it got. */
        last: seasons[seasons.length - 1] || null,
      });
    }
    const clubDynasties = new Set(dynasties.filter((d) => d.club).map((d) => d.club));
    const bestDynasty = dynasties.reduce((m, d) => Math.max(m, d.reached), 0);
    const bestDynastyScore = dynasties.reduce((m, d) => Math.max(m, d.score), 0);

    /* ---- FULL TEAM's coach and plan, from 94 ---- */
    const fullRuns = asc.filter((r) => r.run_mode === 'fullteam');
    const coaches = new Set(fullRuns.map((r) => r.coach).filter(Boolean));
    const coachRings = new Set(fullRuns.filter((r) => isTrue(r.title_won)).map((r) => r.coach).filter(Boolean));
    /* Every plan actually played, as "tempo,fourth,pressure". A plan is three axes at -1, 0
       or 1, so there are 27 of them and the set is what "tried them all" counts. */
    const planKey = (p) => (p && typeof p === 'object'
      ? [p.tempo, p.fourth, p.pressure].map((v) => (v == null ? 0 : Number(v))).join(',')
      : null);
    const plans = new Set(fullRuns.map((r) => planKey(r.plan)).filter(Boolean));

    const titles = asc.filter((r) => isTrue(r.title_won));
    const modeOf = (r) => r.run_mode || null;
    const clubsPlayed = new Set(asc.map((r) => r.franchise).filter(Boolean));
    /* A banner belongs to a club only when the run was actually locked to that club. A free
       run carrying somebody's favorite team in the franchise column is not a One Franchise
       title, which is the same distinction runKindOf() makes on the results screen. */
    const clubBanners = new Set(titles.filter((r) => r.run_mode === 'club' && r.franchise)
      .map((r) => r.franchise));
    const clubTitles = new Set(titles.map((r) => r.franchise).filter(Boolean));
    const modesPlayed = new Set(asc.map(modeOf).filter(Boolean));
    const modeTitles = new Set(titles.map(modeOf).filter(Boolean));

    return {
      rows: asc, runs, total: rows.length, titles, dayKeys, todayKey,
      play: playStreak(dayKeys, todayKey),
      title: titleStreak(asc),
      clubsPlayed, clubTitles, clubBanners, modesPlayed, modeTitles,
      dynasties, clubDynasties, bestDynasty, bestDynastyScore,
      anyDynasty: (fn) => dynasties.some(fn),
      countDynasty: (fn) => dynasties.filter(fn).length,
      /* THE SIX MEN OF A GIVEN SEASON, ALREADY RESOLVED. `runs` above resolves every row's
         picks exactly once, so a dynasty badge asking who was on the roster reads that work
         rather than resolving the same keys again per badge: there are two dozen of them and
         a long career is five hundred rows. Empty for a row whose picks could not all be
         resolved, which is the same "absent is not zero" rule the rest of this file follows,
         so a roster test on an unresolvable row is false rather than a guess. */
      rosterOf: (row) => (byRow.get(row) || EMPTY).roster,
      fullRuns, coaches, coachRings, plans,
      seasonsDrafted, clubsDrafted, collegesDrafted, awardsDrafted, linkTypesEver,
      months, weekdays, monthDays, hours,
      moveRuns, moveTypes, dealtOut, dealtIn, cutPlayers, askedPlayers, bestGm, totalTrades,
      hasLinks: !!pairLinks,
      best: (col) => {
        const vals = asc.map((r) => num(r[col])).filter((v) => v !== null);
        return vals.length ? Math.max.apply(null, vals) : null;
      },
      least: (col) => {
        const vals = asc.map((r) => num(r[col])).filter((v) => v !== null);
        return vals.length ? Math.min.apply(null, vals) : null;
      },
      any: (fn) => asc.some(fn),
      count: (fn) => asc.filter(fn).length,
      anyRun: (fn) => runs.some(fn),
      anyRoster: (fn) => runs.some((x) => x.roster.length > 0 && fn(x.roster, x.row, x.slots, x)),
      countRoster: (fn) => runs.filter((x) => x.roster.length > 0 && fn(x.roster, x.row, x.slots, x)).length,
    };
  }

  /* ---------------- the catalog ----------------
     tier drives the color only: bronze, silver, gold, legend.
     group drives which shelf it sits on. `compact` marks a collection badge, which the
     profile draws as a small tile because its name IS its description. */
  const A = (id, name, desc, tier, group, test) => ({ id, name, desc, tier, group, test });
  const T = (id, name, desc, tier, group, test) =>
    ({ id, name, desc, tier, group, test, compact: true });

  const SEASONS = [];
  for (let y = 1999; y <= 2025; y++) SEASONS.push(y);

  const CLUBS = ['ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET',
    'GB', 'HOU', 'IND', 'JAX', 'KC', 'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
    'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS'];

  /* The programs with the deepest presence in the data, so each of these is findable rather
     than a badge nobody can earn. Spelled as the data spells them: "Mississippi", not
     "Ole Miss", or the string compare never matches. */
  const COLLEGES = ['Miami', 'Ohio State', 'LSU', 'Notre Dame', 'Florida', 'Michigan', 'USC',
    'Alabama', 'Georgia', 'Tennessee', 'Penn State', 'Stanford', 'North Carolina', 'Wisconsin',
    'California', 'Texas', 'Florida State', 'Clemson', 'Oklahoma', 'Oregon', 'Michigan State',
    'Washington', 'Mississippi', 'Auburn'];

  const AWARDS = [
    ['mvp', 'MVP', 'Most Valuable Pickup', /^MVP$/i, 'gold'],
    ['opoy', 'Offensive Player of the Year', 'Best in the game', /Offensive Player of the Year/i, 'gold'],
    ['oroy', 'Offensive Rookie of the Year', 'Straight off the bus', /Offensive Rookie of the Year/i, 'silver'],
    ['cpoy', 'Comeback Player of the Year', 'All the way back', /Comeback Player of the Year/i, 'silver'],
    ['sbmvp', 'Super Bowl MVP', 'Big game hunter', /Super Bowl MVP/i, 'gold'],
    ['allpro', 'First Team All-Pro', 'First team', /First Team All-Pro/i, 'bronze'],
    ['payton', 'Walter Payton Man of the Year', 'Good man', /Walter Payton Man of the Year/i, 'gold'],
  ];

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December'];
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  /* The modes "tried everything" and "wins anywhere" have to agree with. Salary Cap Survivor
     is deliberately absent: the mode is not launching, and leaving it in this list would make
     both of those badges impossible to earn rather than merely hard. The engine still writes
     'capsurvivor' as a run_mode, so an old row from testing stays on the leaderboard and is
     simply not counted toward either. */
  const MODES = ['free', 'club', 'era', 'trade'];

  /* The last trade window of a season, which must match run.js TRADE_DEADLINE_WEEK: a
     "deadline deal" badge that names a different week than the game's deadline would never
     fire. Week 0 is the window before kickoff. */
  const TRADE_DEADLINE_WEEK = 9;

  /* Positions counted on a roster, and the price/production readings the shape badges use. */
  const posCount = (ros, pos) => ros.filter((p) => p.position === pos).length;
  const rosterSpend = (ros) => ros.reduce((t, p) => t + Number(p.price_musd || 0), 0);

  const CATALOG = [];
  const add = (a) => { CATALOG.push(a); return a; };

  /* ===================== MILESTONES ===================== */
  [[1, 'Welcome to the league', 'bronze'], [5, 'Getting the hang of it', 'bronze'],
   [10, 'Regular', 'bronze'], [25, 'Season ticket holder', 'silver'],
   [50, 'Front office fixture', 'silver'], [100, 'Century of seasons', 'gold'],
   [250, 'Lifer', 'legend'], [500, 'Five hundred springs', 'legend'],
   [1000, 'A thousand seasons', 'legend']].forEach(([n, name, tier]) => {
    add(A('runs_' + n, name, n === 1 ? 'Finish your first season.' : 'Finish ' + n + ' seasons.',
      tier, 'Milestones', (c) => c.total >= n));
  });

  /* ===================== WINNING ===================== */
  [[1, 'Tickets punched', 'bronze'], [5, 'Perennial contender', 'bronze'],
   [10, 'January regular', 'silver'], [25, 'Always in the hunt', 'silver'],
   [50, 'Never a losing year', 'gold'], [100, 'A hundred Januaries', 'legend']]
    .forEach(([n, name, tier]) => {
      add(A('playoffs_' + n, name, n === 1 ? 'Reach the playoffs.' : 'Reach the playoffs ' + n + ' times.',
        tier, 'Winning', (c) => c.count((r) => isTrue(r.made_playoffs)) >= n));
    });
  [[1, 'Champion', 'silver'], [3, 'Ring collector', 'silver'], [5, 'Dynasty building', 'gold'],
   [10, 'Double figures', 'gold'], [25, 'Hall of fame GM', 'legend'],
   [50, 'Mount Rushmore', 'legend'], [100, 'A hundred rings', 'legend']]
    .forEach(([n, name, tier]) => {
      add(A('title_' + n, name, n === 1 ? 'Win a title.' : 'Win ' + n + ' titles.', tier, 'Winning',
        (c) => c.titles.length >= n));
    });
  [[1, 'Perfect season', 'legend'], [2, 'Twice untouchable', 'legend'],
   [3, 'Nobody does this', 'legend'], [5, 'Five times flawless', 'legend'],
   [10, 'Ten out of ten', 'legend']].forEach(([n, name, tier]) => {
    add(A('perfect_' + n, name, n === 1 ? 'Go unbeaten and win it all.'
      : 'Put together ' + n + ' perfect seasons.', tier, 'Winning',
      (c) => c.count((r) => isTrue(r.perfect)) >= n));
  });
  /* THE QUARTERBACK AS A HUB. Measured before the bonus existed, these shapes turn up in
     about 1% of rosters drafted normally and 3-4% when somebody goes looking, which is why
     they are rated where they are: rarer than most golds and genuinely hard to build, because
     the draw rules never allow a passer and two of his targets out of one team-season. */
  add(A('qb_both_wrs', 'On the same page',
    'Draft a quarterback with a connection to both of your wide receivers.',
    'legend', 'Chemistry', (c) => c.anyRun((x) => x.links.qbBothWrs)));
  add(A('qb_rb_and_te', 'Spread it around',
    'Draft a quarterback with a connection to both your running back and your tight end.',
    'gold', 'Chemistry', (c) => c.anyRun((x) => x.links.qbRbAndTe)));
  add(A('qb_hub_ring', 'His guys',
    'Win a title with a quarterback connected to two of his own targets.',
    'legend', 'Chemistry',
    (c) => c.anyRun((x) => isTrue(x.row.title_won) && (x.links.qbBothWrs || x.links.qbRbAndTe))));

  add(A('wildcard_ring', 'Wild card run', 'Win the title from a wild card seed.', 'gold', 'Winning',
    (c) => c.any((r) => isTrue(r.title_won) && /wild/i.test(String(r.seed_label || '')))));
  /* The engine writes exactly three seed labels: 'Top seed', 'Wild card', 'Missed the
     playoffs'. Matching anything else here silently never fires. */
  add(A('bye_ring', 'Home all the way', 'Win the title as the top seed, with a first-round bye.',
    'silver', 'Winning',
    (c) => c.any((r) => isTrue(r.title_won) && /top seed/i.test(String(r.seed_label || '')))));
  add(A('undefeated_no_ring', 'The 2007 Patriots',
    'Go unbeaten in the regular season and still not win it all.', 'gold', 'Winning',
    (c) => c.any((r) => has(r.wins) && has(r.losses) && Number(r.wins) >= 17
      && Number(r.losses) === 0 && !isTrue(r.perfect))));
  /* Which round a run died in is not stored, only the seed it earned, so "lost the final"
     cannot be asked. The nearest honest question is a great team that came away with nothing. */
  add(A('heartbreak', 'Nothing to show for it', 'Win 15 or more and still finish without a title.',
    'silver', 'Winning',
    (c) => c.any((r) => has(r.wins) && Number(r.wins) >= 15 && !isTrue(r.title_won))));
  add(A('win_13', 'Thirteen and four', 'Win 13 games in a season.', 'bronze', 'Winning',
    (c) => (c.best('wins') || 0) >= 13));
  add(A('win_15', 'Fifteen win team', 'Win 15 games in a season.', 'silver', 'Winning',
    (c) => (c.best('wins') || 0) >= 15));
  add(A('win_17', 'Ran the table', 'Win all 17 regular season games.', 'gold', 'Winning',
    (c) => (c.best('wins') || 0) >= 17));
  add(A('winless', 'The 2008 Lions', 'Lose every game in a season.', 'gold', 'Winning',
    (c) => c.any((r) => has(r.wins) && has(r.games) && Number(r.wins) === 0
      && Number(r.games) >= 17)));
  add(A('one_win', 'It counts as one', 'Finish a season with exactly one win.', 'silver', 'Winning',
    (c) => c.any((r) => has(r.wins) && Number(r.wins) === 1)));
    /* Measured on a 110-rated roster over 60 simulated seasons: median margin 12.2, ninetieth
     percentile 16.5, best seen 18.9. So 10 is a good year, 14 is a great one and 17 is near
     the edge of what the sim will give you. */
  add(A('margin_10', 'Comfortable', 'Average a winning margin of 10 points or more.',
    'silver', 'Winning', (c) => (c.best('point_diff') || 0) >= 10));
  add(A('blowout_year', 'Nobody close', 'Average a winning margin of 14 points or more.',
    'gold', 'Winning', (c) => (c.best('point_diff') || 0) >= 14));
  add(A('margin_17', 'Running up the score', 'Average a winning margin of 17 points or more.',
    'legend', 'Winning', (c) => (c.best('point_diff') || 0) >= 17));
  add(A('grind_ring', 'Won ugly', 'Win the title with a scoring margin under 3 points a game.',
    'gold', 'Winning',
    (c) => c.any((r) => isTrue(r.title_won) && has(r.point_diff) && Number(r.point_diff) < 3)));
  add(A('negative_diff_playoffs', 'Somehow in', 'Reach the playoffs while being outscored.',
    'silver', 'Winning',
    (c) => c.any((r) => isTrue(r.made_playoffs) && has(r.point_diff) && Number(r.point_diff) < 0)));
  add(A('title_after_miss', 'Worth the wait', 'Win a title in the run straight after missing the playoffs.',
    'silver', 'Winning', (c) => {
      for (let i = 1; i < c.rows.length; i++) {
        if (isTrue(c.rows[i].title_won) && !isTrue(c.rows[i - 1].made_playoffs)) return true;
      }
      return false;
    }));

  /* ===================== ROSTER CRAFT ===================== */
  /* CALIBRATED, NOT GUESSED. A bot drafting for rating over 400 runs cleared 80 half the
     time, 90 once in eleven, 95 once in two hundred and 100 once in three hundred; the best
     roster the cap allows AT ALL, found by hill-climbing with a free choice of all six, rates
     110.0. So 100 is the top of the ladder: a rung above it would be a badge for owning the
     one perfect roster, which is a lottery ticket rather than an achievement. */
  [[80, 'Playoff outfit', 'bronze'], [85, 'Real contender', 'bronze'], [90, 'Loaded', 'silver'],
   [95, 'All time roster', 'gold'], [100, 'Video game numbers', 'legend']]
    .forEach(([n, name, tier]) => {
      add(A('rating_' + n, name, 'Build a team rated ' + n + ' or better.', tier, 'Roster craft',
        (c) => (c.best('team_rating') || 0) >= n));
    });
  /* THE CEILING IS NOT THE CONSTANT. Chemistry saturates toward +15%, but no draft can reach
     that: a team-season may be drawn at most twice, so the +5% teammate link can appear once
     or twice and never six times over. Measured over 1,200 drafts by a bot doing nothing but
     chase links, the best roster reached +11.3%, so this ladder stops at 10. */
  [[3, 'Something in the room', 'bronze'], [5, 'Good room', 'silver'],
   [8, 'Real connection', 'gold'], [10, 'They just click', 'legend']].forEach(([n, name, tier]) => {
    add(A('chem_' + n, name, 'Finish a season with +' + n + '% chemistry or better.', tier,
      'Roster craft', (c) => (c.best('chemistry_pct') || 0) >= n));
  });
  add(A('chem_negative_ring', 'Strangers with rings', 'Win a title with negative chemistry.',
    'gold', 'Roster craft',
    (c) => c.any((r) => isTrue(r.title_won) && has(r.chemistry_pct) && Number(r.chemistry_pct) < 0)));
  add(A('perfect_draft', 'Nothing left on the board',
    'Draft the best possible team from your six spins.', 'legend', 'Roster craft',
    (c) => (c.best('perfect_pct') || 0) >= 100));
  add(A('near_perfect_draft', 'Read the board right',
    'Draft within 5% of the best possible team from your six spins.', 'gold', 'Roster craft',
    (c) => (c.best('perfect_pct') || 0) >= 95));
  /* THE CAP IS THE POINT OF THE GAME, so spending it is worth several badges. Prices carry
     one decimal and re-spin fees are whole millions, so a roster can land arbitrarily close
     to the ceiling; "every dollar" is the last half-million, and it must NOT count a run that
     went over, which the Trade Machine allows. */
  add(A('cap_maxed', 'Used every dollar', 'Finish a season with less than $0.5M of cap space left.',
    'gold', 'Roster craft',
    (c) => c.any((r) => has(r.spend_musd) && Number(r.spend_musd) >= CAP - 0.5
      && Number(r.spend_musd) <= CAP + 0.001)));
  add(A('cap_exact', 'To the last dime', 'Finish a season with less than $0.1M of cap space left.',
    'legend', 'Roster craft',
    (c) => c.any((r) => has(r.spend_musd) && Number(r.spend_musd) >= CAP - 0.1
      && Number(r.spend_musd) <= CAP + 0.001)));
  add(A('cap_maxed_ring', 'All in', 'Win a title having spent the cap to the last half-million.',
    'legend', 'Roster craft',
    (c) => c.any((r) => isTrue(r.title_won) && has(r.spend_musd)
      && Number(r.spend_musd) >= CAP - 0.5 && Number(r.spend_musd) <= CAP + 0.001)));
  [[120, 'Money in the bank', 'bronze'], [110, 'Moneyball', 'silver'], [100, 'Bargain hunter', 'gold'],
   [90, 'Shoestring budget', 'gold'], [80, 'Petty cash', 'legend']].forEach(([n, name, tier]) => {
    add(A('ring_under_' + n, name, 'Win a title spending under $' + n + 'M.', tier, 'Roster craft',
      (c) => c.any((r) => isTrue(r.title_won) && has(r.spend_musd) && Number(r.spend_musd) < n)));
  });
  add(A('no_respin', 'Took what it gave', 'Finish a season without a single re-spin.',
    'bronze', 'Roster craft',
    (c) => c.any((r) => has(r.respins) && Number(r.respins) === 0)));
  add(A('no_respin_ring', 'Faith in the board', 'Win a title without a single re-spin.',
    'gold', 'Roster craft',
    (c) => c.any((r) => isTrue(r.title_won) && has(r.respins) && Number(r.respins) === 0)));
  add(A('all_respin_ring', 'Worth every penny', 'Win a title after using every re-spin.',
    'gold', 'Roster craft',
    (c) => c.any((r) => isTrue(r.title_won) && has(r.respins) && Number(r.respins) >= 3)));
  add(A('perfect_no_respin', 'Handed to you',
    'Go perfect without re-spinning once.', 'legend', 'Roster craft',
    (c) => c.any((r) => isTrue(r.perfect) && has(r.respins) && Number(r.respins) === 0)));

  /* ===================== CHEMISTRY, off the actual six ===================== */
  add(A('link_any', 'Something in common', 'Field two players with a connection between them.',
    'bronze', 'Chemistry', (c) => c.anyRun((x) => x.links.pairs >= 1)));
  add(A('link_all_connected', 'One locker room',
    'Field six players where every man is connected to the group.', 'gold', 'Chemistry',
    (c) => c.anyRun((x) => x.roster.length >= 6 && x.links.connected)));
  add(A('link_all_connected_ring', 'Built as one',
    'Win a title with all six players connected to the group.', 'legend', 'Chemistry',
    (c) => c.anyRun((x) => x.roster.length >= 6 && x.links.connected && isTrue(x.row.title_won))));
    /* Fifteen pairs exist and seven is the most any bot could connect, for the same draw-limit
     reason as the chemistry ceiling above. */
  add(A('link_5', 'Well connected', 'Field a team with 5 or more connections between its players.',
    'gold', 'Chemistry', (c) => c.anyRun((x) => x.links.pairs >= 5)));
  add(A('link_7', 'Tight room', 'Field a team with 7 or more connections between its players.',
    'legend', 'Chemistry', (c) => c.anyRun((x) => x.links.pairs >= 7)));
  /* Both of these need the SAME team-season twice, which the wheel allows at most twice in a
     draft and offers rarely: each turned up about once in a hundred runs under test, so
     neither is the bronze freebie it reads as. */
  add(A('link_battery', 'Pitch and catch', 'Field a quarterback and one of his own receivers.',
    'gold', 'Chemistry', (c) => c.linkTypesEver.has('battery')));
  add(A('link_teammates', 'Old teammates', 'Field two players from the very same team and season.',
    'gold', 'Chemistry', (c) => c.linkTypesEver.has('teammates')));
  add(A('link_franchise', 'Same crest', 'Field two players from the same club in different years.',
    'bronze', 'Chemistry', (c) => c.linkTypesEver.has('franchise')));
    add(A('link_college', 'Old school ties', 'Field two players from the same college.',
    'bronze', 'Chemistry', (c) => c.linkTypesEver.has('college')));
  add(A('link_draft_class', 'Class reunion', 'Field two players from the same draft class.',
    'silver', 'Chemistry', (c) => c.linkTypesEver.has('draft_class')));
  add(A('link_system', 'Same playbook', 'Field two players who had the same head coach.',
    'silver', 'Chemistry', (c) => c.linkTypesEver.has('system')));
          
  /* ===================== SHAPES ===================== */
  add(A('three_rb', 'Ground and pound', 'Field three running backs at once.', 'gold', 'Shapes',
    (c) => c.anyRoster((ros) => posCount(ros, 'RB') >= 3)));
  add(A('three_wr', 'Air raid', 'Field three receivers at once.', 'silver', 'Shapes',
    (c) => c.anyRoster((ros) => posCount(ros, 'WR') >= 3)));
  add(A('three_te', 'Heavy package', 'Field three tight ends at once.', 'gold', 'Shapes',
    (c) => c.anyRoster((ros) => posCount(ros, 'TE') >= 3)));
  add(A('two_te', 'Twelve personnel', 'Field two tight ends at once.', 'bronze', 'Shapes',
    (c) => c.anyRoster((ros) => posCount(ros, 'TE') >= 2)));
  add(A('two_rb', 'Split backfield', 'Field two running backs at once.', 'bronze', 'Shapes',
    (c) => c.anyRoster((ros) => posCount(ros, 'RB') >= 2)));
    add(A('star_45', 'Franchise player', 'Draft a player priced at $45M or more.', 'silver', 'Shapes',
    (c) => c.anyRoster((ros) => ros.some((p) => Number(p.price_musd) >= 45))));
  add(A('two_stars', 'Two max deals', 'Field two players priced at $40M or more.', 'gold', 'Shapes',
    (c) => c.anyRoster((ros) => ros.filter((p) => Number(p.price_musd) >= 40).length >= 2)));
  add(A('all_20', 'No cheap seats', 'Field six players each priced at $20M or more.', 'gold', 'Shapes',
    (c) => c.anyRoster((ros) => ros.length >= 6 && ros.every((p) => Number(p.price_musd) >= 20))));
  add(A('all_cheap', 'Bargain bin', 'Field six players each priced under $12M.', 'silver', 'Shapes',
    (c) => c.anyRoster((ros) => ros.length >= 6 && ros.every((p) => Number(p.price_musd) < 12))));
    add(A('monster', 'Cheat code', 'Draft a player averaging 30 points a game or more.', 'gold', 'Shapes',
    (c) => c.anyRoster((ros) => ros.some((p) => Number(p.ppr_ppg_mean) >= 30))));
  /* Fifteen was the first draft of this and it is not reachable: the cheapest six men in the
     game at 15+ come to $139.1M of a $140M cap, so it would need that exact six. Twelve costs
     $97.6M at the floor and a bot chasing it landed it twice in 220 runs. */
  add(A('all_12ppg', 'Six real starters',
    'Field six players each averaging 12 points a game or more.', 'legend', 'Shapes',
    (c) => c.anyRoster((ros) => ros.length >= 6 && ros.every((p) => Number(p.ppr_ppg_mean) >= 12))));
  add(A('iron_men', 'Iron men', 'Field six players who each played 16 games or more.', 'silver', 'Shapes',
    (c) => c.anyRoster((ros) => ros.length >= 6 && ros.every((p) => Number(p.games_played) >= 16))));
  add(A('glass', 'Held together with tape',
    'Win a title with a player who managed fewer than 10 games.', 'gold', 'Shapes',
    (c) => c.anyRoster((ros, row) => isTrue(row.title_won)
      && ros.some((p) => Number(p.games_played) < 10))));
  add(A('top_percentile', 'Best at his job',
    'Draft the top-rated player at his position in a season.', 'silver', 'Shapes',
    (c) => c.anyRoster((ros) => ros.some((p) => Number(p.position_percentile) >= 0.99))));
  add(A('spent_it_all_on_one', 'One big swing',
    'Spend a third of your cap on a single player.', 'silver', 'Shapes',
    (c) => c.anyRoster((ros) => ros.some((p) => Number(p.price_musd) >= CAP / 3))));

  /* ===================== HISTORY ===================== */
  add(A('one_decade', 'Period piece', 'Field a team whose six players all come from one decade.',
    'silver', 'History',
    (c) => c.anyRoster((ros) => new Set(ros.map((p) => decadeOf(p.season))).size === 1)));
  add(A('three_decades', 'Across the ages', 'Field a team drawing on three different decades.',
    'silver', 'History',
    (c) => c.anyRoster((ros) => new Set(ros.map((p) => decadeOf(p.season))).size >= 3)));
    add(A('same_year_3', 'Vintage year', 'Field three players from the same season.',
    'gold', 'History', (c) => c.anyRoster((ros) => {
      const c2 = Object.create(null);
      for (const p of ros) { const k = Number(p.season); c2[k] = (c2[k] || 0) + 1; if (c2[k] >= 3) return true; }
      return false;
    })));
  add(A('wide_span', 'Twenty year gap',
    'Field two players whose seasons are 20 or more years apart.', 'silver', 'History',
    (c) => c.anyRoster((ros) => {
      const ys = ros.map((p) => Number(p.season));
      return Math.max.apply(null, ys) - Math.min.apply(null, ys) >= 20;
    })));
  add(A('six_clubs', 'Six different jerseys',
    'Field a team of six players from six different clubs.', 'silver', 'History',
    (c) => c.anyRoster((ros) => new Set(ros.map((p) => p.franchise)).size === 6)));
  /* Bronze rather than gold: in One Franchise mode every wheel is locked to the club, so this
     is a description of that mode rather than something you had to build toward. */
  add(A('one_club', 'Company men', 'Field a team whose six players all come from one club.',
    'bronze', 'History',
    (c) => c.anyRoster((ros) => new Set(ros.map((p) => p.franchise)).size === 1)));
  add(A('millennium_ring', 'Turn of the century',
    'Win a title with a team built only from before 2010.', 'gold', 'History',
    (c) => c.anyRoster((ros, row) => isTrue(row.title_won) && ros.every((p) => Number(p.season) < 2010))));
  add(A('modern_ring', 'Modern era', 'Win a title with a team built only from 2020 onwards.',
    'gold', 'History',
    (c) => c.anyRoster((ros, row) => isTrue(row.title_won) && ros.every((p) => Number(p.season) >= 2020))));
  add(A('ring_2000s', 'Shoulder pads and shotguns',
    'Win a title with a team built only from the 2000s.', 'gold', 'History',
    (c) => c.anyRoster((ros, row) => isTrue(row.title_won)
      && ros.every((p) => Number(p.season) >= 1999 && Number(p.season) <= 2009))));
  add(A('ring_2010s', 'The passing decade',
    'Win a title with a team built only from the 2010s.', 'gold', 'History',
    (c) => c.anyRoster((ros, row) => isTrue(row.title_won)
      && ros.every((p) => Number(p.season) >= 2010 && Number(p.season) <= 2019))));
  add(A('rookie', 'Rookie sensation', 'Draft a player in his draft year.', 'silver', 'History',
    (c) => c.anyRoster((ros) => ros.some((p) => has(p.draft_year)
      && Number(p.draft_year) === Number(p.season)))));
  add(A('two_rookies', 'Best draft class ever', 'Field two players in their draft year.',
    'gold', 'History',
    (c) => c.anyRoster((ros) => ros.filter((p) => has(p.draft_year)
      && Number(p.draft_year) === Number(p.season)).length >= 2)));
  /* Deliberately NOT an "undrafted player" badge: draft_round is null on every row in the
     shipped data, so that test would fire for every roster ever built. draft_year is there
     for about four players in five, so seniority is a question the data can answer. */
  add(A('veteran', 'Old reliable', 'Draft a player ten or more seasons into his career.',
    'silver', 'History',
    (c) => c.anyRoster((ros) => ros.some((p) => has(p.draft_year)
      && Number(p.season) - Number(p.draft_year) >= 10))));
  add(A('graybeard', 'Fifteen years in',
    'Draft a player fifteen or more seasons into his career.', 'gold', 'History',
    (c) => c.anyRoster((ros) => ros.some((p) => has(p.draft_year)
      && Number(p.season) - Number(p.draft_year) >= 15))));
  add(A('same_college_ring', 'Alumni night',
    'Win a title with two players from the same college.', 'gold', 'History',
    (c) => c.anyRun((x) => isTrue(x.row.title_won) && x.links.types.has('college'))));
  add(A('badge_reader', 'Led the league',
    'Draft a player who led the NFL in something that season.', 'silver', 'History',
    (c) => c.anyRoster((ros) => ros.some((p) => (p.badges || [])
      .some((b) => /led the (nfl|league)/i.test(String(b)))))));
  add(A('award_three', 'Trophy cabinet', 'Field three award winners at once.', 'gold', 'History',
    (c) => c.anyRoster((ros) => ros.filter((p) => (p.awards || []).length > 0).length >= 3)));
  
  /* ===================== THE VINTAGES (27) ===================== */
  SEASONS.forEach((y) => {
    add(T('season_' + y, String(y), 'Draft a player from the ' + y + ' season.',
      y === 1999 ? 'silver' : 'bronze', 'The vintages', (c) => c.seasonsDrafted.has(y)));
  });
  add(A('vintages_all', 'Every year on file',
    'Draft a player from all 27 seasons the game covers.', 'legend', 'The vintages',
    (c) => SEASONS.every((y) => c.seasonsDrafted.has(y))));
  add(A('vintages_half', 'Half the archive', 'Draft a player from 14 different seasons.',
    'silver', 'The vintages', (c) => c.seasonsDrafted.size >= 14));

  /* ===================== THE 32 (32) ===================== */
  CLUBS.forEach((id) => {
    add(T('drafted_' + id, nick(id), 'Draft a ' + nick(id) + ' player.', 'bronze', 'The 32',
      (c) => c.clubsDrafted.has(id)));
  });
  add(A('drafted_all_32', 'Scouted the whole league',
    'Draft a player from all 32 clubs.', 'legend', 'The 32',
    (c) => CLUBS.every((id) => c.clubsDrafted.has(id))));
  add(A('drafted_16', 'Half the league', 'Draft a player from 16 different clubs.',
    'silver', 'The 32', (c) => c.clubsDrafted.size >= 16));

  /* ===================== BANNERS (32) =====================
     A banner is a One Franchise title, which is the hardest long-term collection in the game:
     you have to win it with a club rather than merely borrow one of its players. */
  CLUBS.forEach((id) => {
    add(T('banner_' + id, nick(id), 'Win a One Franchise title with the ' + nick(id) + '.',
      'silver', 'Banners', (c) => c.clubBanners.has(id)));
  });
  add(A('banners_all', 'Thirty two banners',
    'Win a One Franchise title with every club in the league.', 'legend', 'Banners',
    (c) => CLUBS.every((id) => c.clubBanners.has(id))));
  add(A('banners_8', 'Eight banners', 'Win a One Franchise title with 8 different clubs.',
    'gold', 'Banners', (c) => c.clubBanners.size >= 8));
  add(A('banners_16', 'Sixteen banners', 'Win a One Franchise title with 16 different clubs.',
    'legend', 'Banners', (c) => c.clubBanners.size >= 16));

  /* ===================== RECRUITING (24) ===================== */
  COLLEGES.forEach((col) => {
    add(T('college_' + col.replace(/[^a-z0-9]+/gi, '_').toLowerCase(), col,
      'Draft a player who went to ' + col + '.', 'bronze', 'Recruiting',
      (c) => c.collegesDrafted.has(col)));
  });
  add(A('colleges_all', 'National recruiter',
    'Draft a player from each of the 24 listed programs.', 'legend', 'Recruiting',
    (c) => COLLEGES.every((x) => c.collegesDrafted.has(x))));
  add(A('colleges_50', 'Wide net', 'Draft players from 50 different colleges.', 'gold', 'Recruiting',
    (c) => c.collegesDrafted.size >= 50));
  add(A('colleges_100', 'Every corner of the country',
    'Draft players from 100 different colleges.', 'legend', 'Recruiting',
    (c) => c.collegesDrafted.size >= 100));

  /* ===================== HARDWARE (7) ===================== */
  AWARDS.forEach(([key, award, name, re, tier]) => {
    add(A('award_' + key, name, 'Draft a player who won ' + award + '.', tier, 'Hardware',
      (c) => Array.from(c.awardsDrafted).some((a) => re.test(a))));
  });
  add(A('award_all', 'Filled the cabinet',
    'Draft a winner of every award in the game.', 'legend', 'Hardware',
    (c) => AWARDS.every(([, , , re]) => Array.from(c.awardsDrafted).some((a) => re.test(a)))));
  add(A('mvp_ring', 'MVP season', 'Win a title with a league MVP on the roster.', 'legend', 'Hardware',
    (c) => c.anyRoster((ros, row) => isTrue(row.title_won)
      && ros.some((p) => (p.awards || []).some((a) => /^MVP$/i.test(a))))));

  /* ===================== MODES ===================== */
  add(A('mode_free', 'Classic', 'Finish a Classic season.', 'bronze', 'Modes',
    (c) => c.modesPlayed.has('free')));
  add(A('mode_club', 'One Franchise', 'Finish a One Franchise season.', 'bronze', 'Modes',
    (c) => c.modesPlayed.has('club')));
  add(A('mode_era', 'Eras Draft', 'Finish an Eras Draft season.', 'bronze', 'Modes',
    (c) => c.modesPlayed.has('era')));
  add(A('mode_trade', 'Take the wheel', 'Finish a Trade Machine season.', 'bronze', 'Modes',
    (c) => c.modesPlayed.has('trade')));
  add(A('mode_all', 'Tried everything', 'Finish a season in every mode.', 'gold', 'Modes',
    (c) => MODES.every((m) => c.modesPlayed.has(m))));
  add(A('ring_every_mode', 'Wins anywhere', 'Win a title in every mode.', 'legend', 'Modes',
    (c) => MODES.every((m) => c.modeTitles.has(m))));
  add(A('clubs_5', 'Five cities', 'Play One Franchise with 5 different clubs.', 'bronze', 'Modes',
    (c) => c.clubsPlayed.size >= 5));
  add(A('clubs_10', 'Ten cities', 'Play One Franchise with 10 different clubs.', 'silver', 'Modes',
    (c) => c.clubsPlayed.size >= 10));
  add(A('clubs_32', 'Toured the league', 'Play One Franchise with all 32 clubs.', 'legend', 'Modes',
    (c) => c.clubsPlayed.size >= 32));
  add(A('club_rings_5', 'Five banners', 'Win a title with 5 different clubs.', 'gold', 'Modes',
    (c) => c.clubTitles.size >= 5));
  add(A('era_all', 'Every era', 'Finish an Eras Draft season in each era.', 'gold', 'Modes',
    (c) => new Set(c.rows.filter((r) => r.run_mode === 'era' && r.era).map((r) => r.era)).size >= 3));
  /* THE TRADE MACHINE, asked entirely through columns the row already carries. Which players
     were dealt is not stored, so these are about what the finished team looked like. */
  add(A('trade_ring', 'Deadline genius', 'Win a title in the Trade Machine.', 'gold', 'Modes',
    (c) => c.modeTitles.has('trade')));
  add(A('trade_5', 'Working the phones', 'Finish 5 Trade Machine seasons.', 'bronze', 'Modes',
    (c) => c.count((r) => r.run_mode === 'trade') >= 5));
  add(A('trade_25', 'Career front office', 'Finish 25 Trade Machine seasons.', 'gold', 'Modes',
    (c) => c.count((r) => r.run_mode === 'trade') >= 25));
  add(A('trade_over_cap_ring', 'Whatever it costs',
    'Win a Trade Machine title with a payroll over the cap.', 'gold', 'Modes',
    (c) => c.any((r) => r.run_mode === 'trade' && isTrue(r.title_won) && has(r.spend_musd)
      && Number(r.spend_musd) > CAP)));
  add(A('trade_rebuild', 'Turned it around',
    'Reach 90 team rating in the Trade Machine.', 'gold', 'Modes',
    (c) => c.any((r) => r.run_mode === 'trade' && has(r.team_rating)
      && Number(r.team_rating) >= 90)));
  add(A('trade_perfect', 'Immaculate front office',
    'Go perfect in the Trade Machine.', 'legend', 'Modes',
    (c) => c.any((r) => r.run_mode === 'trade' && isTrue(r.perfect))));

  /* ===================== THE DEFENSE =====================
   *
   * ITS OWN SHELF, NOT FIVE MORE ENTRIES IN Modes, and not a fifth member of MODES either.
   * "Tried everything" and "Wins anywhere" ask for a season and a title in every mode in
   * that list; adding defense to it would take both badges away from everybody who has them
   * and hand them back only after a mode that did not exist when they earned them. A new
   * mode should be able to arrive without un-earning anything, so the list is left alone and
   * the mode gets a shelf.
   *
   * WHAT THESE CAN ASK ABOUT is the roster and the row, which is the same constraint the
   * whole file works under: picks and slots resolve to six defenders, and the row carries
   * the record, the seed, the title, the differential, the spend, the chemistry and the team
   * rating. Points allowed and takeaways are NOT on the row: they are derived at display
   * time from the game's own seed, so a badge asking for them would be asking a question the
   * leaderboard cannot answer. Hence a shelf that is mostly about the draft, which is the
   * part of this mode a player actually controls.
   *
   * The defenders' own badge strings come from build/01-defenders.mjs and are spelled as
   * that script spells them, the same way the award regexes above are.
   */
  const DEF = (r) => r.run_mode === 'defense';
  const defBadge = (ros, re) => ros.some((p) => (p.badges || []).some((x) => re.test(x)));
  const posOf = (p) => String(p.position || '').toUpperCase();
  const realPos = (p) => String(p.real_position || '').toUpperCase();
  const countPos = (ros, pos) => ros.filter((p) => posOf(p) === pos).length;

  add(A('mode_defense', 'The other side of the ball', 'Finish a Defense season.', 'bronze', 'Defense',
    (c) => c.modesPlayed.has('defense')));
  add(A('def_5', 'Coordinator', 'Finish 5 Defense seasons.', 'bronze', 'Defense',
    (c) => c.count(DEF) >= 5));
  add(A('def_25', 'Career on that side', 'Finish 25 Defense seasons.', 'silver', 'Defense',
    (c) => c.count(DEF) >= 25));
  add(A('def_ring', 'Defense wins championships',
    'Win a title with a drafted defense.', 'gold', 'Defense',
    (c) => c.modeTitles.has('defense')));
  add(A('def_perfect', 'Nobody scored enough', 'Go perfect with a defense.', 'legend', 'Defense',
    (c) => c.any((r) => DEF(r) && isTrue(r.perfect))));
  add(A('def_top_seed', 'Best in the league',
    'Take the top seed with a defense.', 'silver', 'Defense',
    (c) => c.any((r) => DEF(r) && /top seed/i.test(String(r.seed_label || '')))));
  add(A('def_17', 'Unbeaten front', 'Win 17 regular season games with a defense.',
    'legend', 'Defense',
    (c) => c.any((r) => DEF(r) && has(r.wins) && Number(r.wins) >= 17)));
  /* WHERE THESE NUMBERS COME FROM, and a warning about where they do not.
   *
   * They are calibrated against REAL defense runs on the live leaderboard: ratings of 90.5,
   * 91.4, 92.2, 94.6 and 95.0, a best-possible figure of 96, and records up to 19-2. So 90
   * is a good draft, 95 is a very good one, and 95% of the best six the wheel offered is the
   * kind of thing a careful player hits and a hurried one does not.
   *
   * They are NOT calibrated against a bot, and an earlier version of this comment was. A
   * defender's production column is idp_ppg_mean, and the page copies it onto ppr_ppg_mean
   * when it loads the pool; a harness that skips that step drafts on undefined and plays a
   * season with six men who produce nothing. Every "measured" figure in the first draft of
   * this file came from exactly that mistake, which is why it claimed a 92.5 ceiling for a
   * mode whose players had already beaten it five times. If a threshold here ever needs
   * re-tuning, tune it against the board, not against a simulator nobody has checked. */
  add(A('def_diff', 'Nothing got through',
    'Outscore the league by 8 a game with a defense.', 'silver', 'Defense',
    (c) => c.any((r) => DEF(r) && has(r.point_diff) && Number(r.point_diff) >= 8)));
  add(A('def_elite', 'Elite unit', 'Draft a defense rated 90 or better.', 'silver', 'Defense',
    (c) => c.any((r) => DEF(r) && has(r.team_rating) && Number(r.team_rating) >= 90)));
  add(A('def_overwhelming', 'Overwhelming', 'Draft a defense rated 95 or better.',
    'gold', 'Defense',
    (c) => c.any((r) => DEF(r) && has(r.team_rating) && Number(r.team_rating) >= 95)));
  add(A('def_best_six', 'The best six on the board',
    'Draft within 5% of the strongest defense your spins allowed.', 'gold', 'Defense',
    (c) => c.any((r) => DEF(r) && has(r.perfect_pct) && Number(r.perfect_pct) >= 95)));

  /* ---- THE FRONT, which is the one shape decision this draft actually makes ---- */
  add(A('def_heavy', 'Heavy front', 'Draft a defense with three linemen.', 'bronze', 'Defense',
    (c) => c.anyRoster((ros, row) => DEF(row) && countPos(ros, 'DL') >= 3)));
  add(A('def_nickel', 'Nickel', 'Draft a defense with three defensive backs.', 'bronze', 'Defense',
    (c) => c.anyRoster((ros, row) => DEF(row) && countPos(ros, 'DB') >= 3)));
  add(A('def_base', 'Base defense', 'Draft a defense with two of each.', 'bronze', 'Defense',
    (c) => c.anyRoster((ros, row) => DEF(row) && countPos(ros, 'DL') === 2
      && countPos(ros, 'LB') === 2 && countPos(ros, 'DB') === 2)));
  add(A('def_all_fronts', 'Every look', 'Draft all three fronts across your seasons.',
    'gold', 'Defense',
    (c) => ['heavy', 'nickel', 'base'].every((want) => c.anyRoster((ros, row) => {
      if (!DEF(row)) return false;
      const dl = countPos(ros, 'DL'), lb = countPos(ros, 'LB'), db = countPos(ros, 'DB');
      if (want === 'heavy') return dl >= 3;
      if (want === 'nickel') return db >= 3;
      return dl === 2 && lb === 2 && db === 2;
    }))));
  /* The interior is where a run is stopped and where the cheap end of the pool lives, so a
     roster built around it is a real choice rather than a spin nobody could avoid. */
  add(A('def_interior', 'Clog the middle', 'Draft two interior linemen in one defense.',
    'silver', 'Defense',
    (c) => c.anyRoster((ros, row) => DEF(row)
      && ros.filter((p) => /^(DT|NT)$/.test(realPos(p))).length >= 2)));
  add(A('def_secondary', 'Cover men', 'Draft two corners and a safety.', 'silver', 'Defense',
    (c) => c.anyRoster((ros, row) => DEF(row)
      && ros.filter((p) => realPos(p) === 'CB').length >= 2
      && ros.some((p) => /^(S|FS|SAF)$/.test(realPos(p))))));

  /* ---- WHO YOU SIGNED. The defenders carry their own honours, so these ask for them. ---- */
  add(A('def_sacks', 'Sack artist', 'Draft a man who led the NFL in sacks.', 'bronze', 'Defense',
    (c) => c.anyRoster((ros, row) => DEF(row) && defBadge(ros, /led the nfl in sacks/i))));
  add(A('def_picks', 'Ballhawk', 'Draft a man who led the NFL in interceptions.',
    'bronze', 'Defense',
    (c) => c.anyRoster((ros, row) => DEF(row) && defBadge(ros, /led the nfl in interceptions/i))));
  add(A('def_tackles', 'Tackling machine', 'Draft a man who led the NFL in tackles.',
    'bronze', 'Defense',
    (c) => c.anyRoster((ros, row) => DEF(row) && defBadge(ros, /led the nfl in tackles/i))));
  add(A('def_strips', 'Punch it out', 'Draft a man who led the NFL in forced fumbles.',
    'silver', 'Defense',
    (c) => c.anyRoster((ros, row) => DEF(row) && defBadge(ros, /led the nfl in forced fumbles/i))));
  add(A('def_twenty', 'Twenty sacks', 'Draft a twenty sack season.', 'silver', 'Defense',
    (c) => c.anyRoster((ros, row) => DEF(row) && defBadge(ros, /20 sack season/i))));
  add(A('def_leaders', 'Led the league at everything',
    'Draft league leaders in sacks, tackles, interceptions and forced fumbles.',
    'legend', 'Defense',
    (c) => [/led the nfl in sacks/i, /led the nfl in tackles/i, /led the nfl in interceptions/i,
      /led the nfl in forced fumbles/i].every((re) =>
      c.anyRoster((ros, row) => DEF(row) && defBadge(ros, re)))));
  add(A('def_all_stars', 'Three of a kind',
    'Draft a defense where three of the six led the league in something.', 'gold', 'Defense',
    (c) => c.anyRoster((ros, row) => DEF(row)
      && ros.filter((p) => (p.badges || []).some((x) => /^led the nfl/i.test(x))).length >= 3)));

  /* ---- WHAT IT COST ---- */
  add(A('def_max', 'Everybody paid', 'Draft a defense with five men at $20M or more.',
    'gold', 'Defense',
    (c) => c.anyRoster((ros, row) => DEF(row)
      && ros.filter((p) => Number(p.price_musd || 0) >= 20).length >= 5)));
  add(A('def_bargain', 'Built cheap',
    'Win a title with a defense costing under $110M.', 'legend', 'Defense',
    (c) => c.any((r) => DEF(r) && isTrue(r.title_won) && has(r.spend_musd)
      && Number(r.spend_musd) < 110)));
  add(A('def_spread', 'Six clubs', 'Draft a defense with six men from six different clubs.',
    'bronze', 'Defense',
    (c) => c.anyRoster((ros, row) => DEF(row) && ros.length === 6
      && new Set(ros.map((p) => p.franchise)).size === 6)));
  add(A('def_one_year', 'One season of football',
    'Draft a defense with three men from the same year.', 'bronze', 'Defense',
    (c) => c.anyRoster((ros, row) => {
      if (!DEF(row)) return false;
      const by = {};
      for (const p of ros) { by[p.season] = (by[p.season] || 0) + 1;
        if (by[p.season] >= 3) return true; }
      return false;
    })));

  /* ===================== THE FRONT OFFICE =====================
   *
   * THE ONE GROUP THAT IS NOT RETROACTIVE, and it is worth being plain about why. Every
   * other badge is derived from columns that already existed, so a returning player finds
   * them already earned. These read ps_runs.gm_rating and ps_runs.trade_moves, which
   * 61_football_trade_machine.sql adds, because nothing in the old row can answer them:
   * `picks` is the roster a run FINISHED with, so it cannot say who was dealt, when, or
   * what came back, and the GM rating was shown to the player and then thrown away.
   *
   * So these start locked for everybody, including runs played yesterday, and are earned
   * from here forward. That is the honest price of the column and it is the reason the rest
   * of the cabinet was built the other way.
   *
   * THE GM LADDER IS MEASURED, TOP TO BOTTOM. Over machine-played seasons a bot taking the
   * best rating-positive offer in every window scores a median of 67, a p90 of 77 and a best
   * of 83 -- all with NO title, and winning is 35% of the rating. Never trading scores about
   * 19 and trading at random about 29.
   *
   * A championship maxes the winning component outright: the bonus is 5 for getting in, 5 a
   * playoff win and 5 more for the ring, so 14 wins and a title score (28+30)/52 which clamps
   * at 100. Run through the shipped formula, a title plus the +25 rating gain good trading
   * normally produces, plus $8M of added salary and a payroll inside the cap, comes to 95.0.
   * So every rung here is one I can show is reachable, and there is no rung above 95 because
   * that would need all five marks at once.
   *
   * Re-measured after cap management became its own 15% component. The rungs did not need to
   * move: 40 and 55 are what trading at all gets you, 70 and 80 are a well-run season, and 90
   * and 95 now need a clean payroll as well as a ring.
   */
  [[40, 'Front office job', 'bronze'], [55, 'Competent GM', 'silver'],
   [70, 'Executive of the year', 'gold'], [80, 'Best in the business', 'gold'],
   [90, 'Rebuilt the franchise', 'legend'],
   [95, 'Executive of the decade', 'legend']].forEach(([n, name, tier]) => {
    add(A('gm_' + n, name, 'Finish a Trade Machine season with a GM rating of ' + n + ' or better.',
      tier, 'Front office', (c) => (c.bestGm || 0) >= n));
  });

  add(A('deal_first', 'First deal', 'Make a trade.', 'bronze', 'Front office',
    (c) => c.moveRuns.some((m) => m.trades >= 1)));
  add(A('deal_25', 'Wheeler dealer', 'Make 25 trades across your career.', 'silver', 'Front office',
    (c) => c.totalTrades >= 25));
  add(A('deal_100', 'Never off the phone', 'Make 100 trades across your career.', 'gold', 'Front office',
    (c) => c.totalTrades >= 100));
  /* Four windows exist: before kickoff and weeks 3, 6 and 9. */
  add(A('deal_every_window', 'Active all year', 'Trade in all four windows of one season.',
    'gold', 'Front office', (c) => c.moveRuns.some((m) => m.windows.size >= 4)));
  add(A('deal_preseason', 'Before kickoff', 'Make a trade in the window before week 1.',
    'bronze', 'Front office', (c) => c.moveRuns.some((m) => m.windows.has(0))));
  add(A('deal_deadline', 'Deadline deal', 'Make a trade in the final window of a season.',
    'silver', 'Front office',
    (c) => c.moveRuns.some((m) => m.windows.has(TRADE_DEADLINE_WEEK))));
  add(A('stood_pat', 'Stood pat', 'Win a Trade Machine title without making a single trade.',
    'gold', 'Front office',
    (c) => c.moveRuns.some((m) => m.trades === 0 && isTrue(m.row.title_won))));

  add(A('deal_1for1', 'Straight swap', 'Make a one-for-one trade.', 'bronze', 'Front office',
    (c) => c.moveTypes.has('1for1')));
  add(A('deal_2for2', 'Blockbuster', 'Make a two-for-two trade.', 'silver', 'Front office',
    (c) => c.moveTypes.has('2for2')));
  add(A('deal_1for2', 'Two for one', 'Trade one player for two, and cut somebody to fit them in.',
    'silver', 'Front office', (c) => c.moveTypes.has('1for2')));
  add(A('cut_someone', 'Hard part of the job', 'Release a player to get back to six.',
    'bronze', 'Front office', (c) => c.moveRuns.some((m) => m.cuts >= 1)));
  add(A('cut_a_starter', 'Nobody is safe',
    'Release a player averaging 10 points a game or more.', 'gold', 'Front office',
    (c) => c.cutPlayers.some((p) => Number(p.ppr_ppg_mean) >= 10)));
  add(A('deal_2for1', 'Consolidation', 'Package two players for one.', 'silver', 'Front office',
    (c) => c.moveTypes.has('2for1')));
  add(A('deal_fa', 'Filled the hole', 'Fill a roster hole from free agency.', 'bronze', 'Front office',
    (c) => c.moveRuns.some((m) => m.fa >= 1)));
  add(A('deal_all_types', 'Every kind of deal',
    'Make all four shapes of trade: one-for-one, one-for-two, two-for-one and two-for-two.',
    'gold', 'Front office',
    (c) => ['1for1', '1for2', '2for1', '2for2'].every((t) => c.moveTypes.has(t))));
  /* The shapes the rebuilt market added: three men back, and the deal where the league asks
     for somebody you never put up. */
  add(A('deal_1for3', 'Fire sale', 'Trade one player for three, and release two to fit them in.',
    'gold', 'Front office', (c) => c.moveTypes.has('1for3')));
  add(A('deal_2for3', 'Restocked', 'Send two players out and bring three back.',
    'silver', 'Front office', (c) => c.moveTypes.has('2for3')));
  add(A('deal_all_shapes', 'Every shape there is',
    'Make all six shapes of trade, up to a three-for-one and a two-for-three.',
    'legend', 'Front office',
    (c) => ['1for1', '1for2', '1for3', '2for1', '2for2', '2for3']
      .every((t) => c.moveTypes.has(t))));
  add(A('gave_them_more', 'They asked, you paid',
    'Take a deal where the other GM wanted a second player you had not offered.',
    'silver', 'Front office', (c) => c.moveRuns.some((m) => m.askedFor >= 1)));
  add(A('asked_for_the_best', 'Priced out of a favorite',
    'Give up a 15-point-a-game player the other GM asked for on top of the deal.',
    'gold', 'Front office',
    (c) => c.askedPlayers.some((p) => Number(p.ppr_ppg_mean) >= 15)));
  add(A('held_the_line', 'Held the line',
    'Win a Trade Machine title in a season where you never gave up a player you had not offered.',
    'gold', 'Front office',
    (c) => c.moveRuns.some((m) => m.askedFor === 0 && m.trades >= 2
      && isTrue(m.row.title_won))));
  add(A('double_release', 'Two off the books',
    'Release two players in a single trade.', 'silver', 'Front office',
    (c) => c.moveRuns.some((m) => m.moves.some((v) => v.cutCount >= 2))));
  /* CASH CONSIDERATION. Nobody hands over a better player for free, and what you pay comes
     off the cap ceiling for the rest of the season. */
  add(A('paid_cash', 'Cash considerations',
    'Pay money on top of a trade to get the better player.', 'bronze', 'Front office',
    (c) => c.moveRuns.some((m) => m.cashDeals >= 1)));
  add(A('paid_big', 'Wrote the cheque',
    'Give up $7M or more of cap ceiling in a single deal.', 'silver', 'Front office',
    (c) => c.moveRuns.some((m) => m.biggestCash >= 7)));
  add(A('spent_the_ceiling', 'Mortgaged the season',
    'Pay $20M of cap ceiling in cash across one season.', 'gold', 'Front office',
    (c) => c.moveRuns.some((m) => m.cashSpent >= 20)));
  add(A('no_cash_ring', 'Not a penny more',
    'Win a Trade Machine title without paying a cent of cash in any deal.',
    'gold', 'Front office',
    (c) => c.moveRuns.some((m) => m.cashDeals === 0 && m.trades >= 2
      && isTrue(m.row.title_won))));
  add(A('cash_ring', 'Bought a ring',
    'Win a Trade Machine title in a season where you paid cash for an upgrade.',
    'silver', 'Front office',
    (c) => c.moveRuns.some((m) => m.cashDeals >= 1 && isTrue(m.row.title_won))));

  /* WHAT WAS ACTUALLY DEALT. These are the questions the column was added for: they need
     the players who LEFT, and no other column has ever kept them. */
  add(A('sold_the_star', 'Sold the star',
    'Trade away a player averaging 20 points a game or more.', 'silver', 'Front office',
    (c) => c.dealtOut.some((p) => Number(p.ppr_ppg_mean) >= 20)));
  add(A('sold_the_star_ring', 'Nobody was untouchable',
    'Win a title in a season where you traded away a 20-point-a-game player.',
    'legend', 'Front office',
    (c) => c.moveRuns.some((m) => isTrue(m.row.title_won)
      && m.outPlayers.some((p) => Number(p.ppr_ppg_mean) >= 20))));
  add(A('bought_a_star', 'Big splash',
    'Trade FOR a player averaging 20 points a game or more.', 'silver', 'Front office',
    (c) => c.dealtIn.some((p) => Number(p.ppr_ppg_mean) >= 20)));
  add(A('bought_hardware', 'Deadline splash',
    'Trade for a player who won an award that season.', 'gold', 'Front office',
    (c) => c.dealtIn.some((p) => (p.awards || []).length > 0)));
  add(A('bought_mvp', 'Got the MVP', 'Trade for a league MVP.', 'legend', 'Front office',
    (c) => c.dealtIn.some((p) => (p.awards || []).some((a) => /^MVP$/i.test(a)))));
  add(A('salary_dump', 'Salary dump',
    'Make a trade that sheds money, sending out more salary than comes back.',
    'silver', 'Front office',
    (c) => c.moveRuns.some((m) => m.moves.some((mv) => mv.outMusd - mv.inMusd >= 5))));
  add(A('took_on_salary', 'Whatever it takes',
    'Take on $15M or more of salary in a single trade.', 'gold', 'Front office',
    (c) => c.moveRuns.some((m) => m.moves.some((mv) => mv.inMusd - mv.outMusd >= 15))));
  add(A('turnover_4', 'New look',
    'Trade away four different players in one season.', 'gold', 'Front office',
    (c) => c.moveRuns.some((m) => m.outKeys.size >= 4)));
  add(A('turnover_6', 'Blew it up',
    'Trade away six different players in one season.', 'legend', 'Front office',
    (c) => c.moveRuns.some((m) => m.outKeys.size >= 6)));

  /* ===================== CALENDAR ===================== */
  MONTHS.forEach((m, i) => {
    add(T('month_' + (i + 1), m, 'Play in ' + m + '.', 'bronze', 'Calendar',
      (c) => c.months.has(i + 1)));
  });
  add(A('months_all', 'All year round', 'Play in all twelve months.', 'legend', 'Calendar',
    (c) => c.months.size >= 12));
  WEEKDAYS.forEach((d, i) => {
    add(T('weekday_' + i, d, 'Play on a ' + d + '.', 'bronze', 'Calendar',
      (c) => c.weekdays.has(i)));
  });
  add(A('weekdays_all', 'Seven day week', 'Play on every day of the week.', 'silver', 'Calendar',
    (c) => c.weekdays.size >= 7));
  add(A('newyear', 'New year, new roster', 'Play on New Year\'s Day.', 'silver', 'Calendar',
    (c) => c.monthDays.has('1-1')));
  add(A('thanksgiving', 'Thanksgiving football', 'Play on Thanksgiving.', 'gold', 'Calendar',
    (c) => c.monthDays.has('thanksgiving')));
  add(A('christmas', 'Christmas Day game', 'Play on Christmas Day.', 'gold', 'Calendar',
    (c) => c.monthDays.has('12-25')));
  add(A('july4', 'Fourth of July', 'Play on the Fourth of July.', 'silver', 'Calendar',
    (c) => c.monthDays.has('7-4')));
  add(A('halloween', 'Trick or treat', 'Play on Halloween.', 'silver', 'Calendar',
    (c) => c.monthDays.has('10-31')));
  add(A('leapday', 'Once every four years', 'Play on the 29th of February.', 'legend', 'Calendar',
    (c) => c.monthDays.has('2-29')));
  add(A('fri13', 'Friday the 13th', 'Play on a Friday the 13th.', 'gold', 'Calendar',
    (c) => c.monthDays.has('fri13')));
  add(A('late_night', 'One more run', 'Finish a season between midnight and 4am.', 'silver', 'Calendar',
    (c) => [0, 1, 2, 3].some((h) => c.hours.has(h))));
  add(A('early_bird', 'Before the alarm', 'Finish a season between 4am and 7am.', 'silver', 'Calendar',
    (c) => [4, 5, 6].some((h) => c.hours.has(h))));
  add(A('all_hours', 'Around the clock', 'Finish a season in 12 different hours of the day.',
    'gold', 'Calendar', (c) => c.hours.size >= 12));
  add(A('sunday_double', 'Sunday double header',
    'Finish two seasons on the same Sunday.', 'silver', 'Calendar', (c) => {
      const perDay = Object.create(null);
      for (const r of c.rows) {
        if (!r.created_at) continue;
        const d = new Date(r.created_at);
        if (isNaN(d.getTime()) || d.getDay() !== 0) continue;
        const k = dayKey(r.created_at);
        perDay[k] = (perDay[k] || 0) + 1;
        if (perDay[k] >= 2) return true;
      }
      return false;
    }));
  add(A('ten_in_a_day', 'Marathon', 'Finish 10 seasons in one day.', 'gold', 'Calendar', (c) => {
    const perDay = Object.create(null);
    for (const r of c.rows) {
      const k = r.created_at ? dayKey(r.created_at) : null;
      if (!k) continue;
      perDay[k] = (perDay[k] || 0) + 1;
      if (perDay[k] >= 10) return true;
    }
    return false;
  }));

  /* ===================== STREAKS ===================== */
  [[3, 'Getting into it', 'bronze'], [5, 'Working week', 'bronze'],
   [7, 'Every day this week', 'silver'], [10, 'Ten in a row', 'silver'],
   [14, 'A fortnight', 'silver'], [21, 'Three weeks running', 'gold'],
   [30, 'A month straight', 'gold'], [45, 'Six weeks running', 'gold'],
   [60, 'Two months straight', 'gold'], [90, 'A quarter of a year', 'legend'],
   [120, 'Four months straight', 'legend'], [180, 'Half a year, every day', 'legend'],
   [270, 'Nine months straight', 'legend'], [365, 'A full year, every day', 'legend']]
    .forEach(([n, name, tier]) => {
      add(A('streak_' + n, name, 'Play on ' + n + ' days in a row.', tier, 'Streaks',
        (c) => c.play.best >= n));
    });
  [[2, 'Back to back', 'gold'], [3, 'Three-peat', 'legend'], [4, 'Four in a row', 'legend'],
   [5, 'Five straight', 'legend'], [7, 'Seven straight', 'legend'],
   [10, 'Ten straight', 'legend']].forEach(([n, name, tier]) => {
    add(A('title_streak_' + n, name, 'Win titles in ' + n + ' straight seasons.', tier, 'Streaks',
      (c) => c.title.best >= n));
  });
  add(A('playoff_streak_10', 'Never missed', 'Reach the playoffs in 10 straight seasons.',
    'gold', 'Streaks', (c) => {
      let run = 0;
      for (const r of c.rows) {
        if (isTrue(r.made_playoffs)) { run++; if (run >= 10) return true; } else run = 0;
      }
      return false;
    }));

  /* ===================== DYNASTY =====================
   *
   * ONLY WHEN THE MODE IS LIVE. See the note on DYNASTY_LIVE at the top of this file.
   *
   * WHAT THIS SHELF CAN AND CANNOT ASK, because the difference decides every badge on it.
   * A dynasty season files an ordinary run row plus the three columns 98 adds, so what
   * survives to be asked about is: how far the run got, what it scored, and the twenty-odd
   * facts every other mode records about each season along the way. What does NOT survive is
   * everything the run knew and did not write down: whether a boss game was won, whether a
   * mandate was met, how much dead cap was being carried, who was frozen. Those live in the
   * save file and die with it.
   *
   * So nothing here says "beat the Legion of Boom", which would be a badge that never fires.
   * The nearest honest question is how far the run got, and reaching season 11 at all means
   * the season 10 game was played and survived. That is a weaker claim and it is a true one.
   *
   * AND NOTHING NAMES A BOSS OR A MANDATE PAST THE SECOND. Bosses come every ten seasons and
   * mandates every ten offset by five, out of lists of six and four, and the mode is built to
   * run 25 seasons (E.DYNASTY_MAX_SEASONS). Inside 25 that is exactly two bosses and three
   * mandates: seasons 30 and up, where the other four bosses and the fourth mandate live, are
   * past the end of the design. A badge asking for the third boss would sit dark forever and
   * nothing would fail, which is the way this class of mistake always arrives.
   */
  if (DYNASTY_LIVE) {
    /* ---- how far you got, which is the number the mode is ranked on ---- */
    [[1, 'Hired', 'Finish your first Dynasty season.', 'bronze'],
     [3, 'Three winters', 'Reach season 3 of a dynasty.', 'bronze'],
     [5, 'Still in the building', 'Reach season 5 of a dynasty.', 'bronze'],
     [6, 'Mandate survivor', 'Reach season 6, the far side of the owner\'s first demand.', 'silver'],
     [8, 'Long haul', 'Reach season 8 of a dynasty.', 'silver'],
     [10, 'A decade in charge', 'Reach season 10 of a dynasty.', 'silver'],
     [11, 'Past the Legion', 'Reach season 11, the far side of the first marquee game.', 'gold'],
     [13, 'Thirteen winters', 'Reach season 13 of a dynasty.', 'gold'],
     [15, 'Institution', 'Reach season 15 of a dynasty.', 'gold'],
     [18, 'Eighteen deep', 'Reach season 18 of a dynasty.', 'legend'],
     [20, 'Two decades', 'Reach season 20 of a dynasty.', 'legend'],
     [21, 'Past them both', 'Reach season 21, having survived both marquee games.', 'legend'],
     [25, 'A quarter of a century', 'Reach season 25 of a dynasty.', 'legend']]
      .forEach(([n, name, desc, tier]) => {
        add(A('dyn_reach_' + n, name, desc, tier, 'Dynasty', (c) => c.bestDynasty >= n));
      });

    /* ---- the score ----
       Cumulative, and every season is multiplied by its own number, so the ladder climbs
       much faster than the seasons do.

       WHERE THE TOP OF IT COMES FROM, because the first draft of this ladder went to two
       million and five hundred simulated dynasties peaked at 198,000. That is not the ceiling
       though, and the reason is worth writing down: those runs almost never won anything, and
       a title is 10,000 points times the season number. One ring in season 20 is 200,000 on
       its own, more than the entire best run the bots managed. So the ladder is anchored at
       the quarter million a grinder reaches without a trophy, and the rungs above it are
       priced as one and two good Januaries on top of that. Anything past a million was
       guesswork and is gone. */
    [[25000, 'On the board', 'bronze'], [100000, 'Six figures', 'bronze'],
     [250000, 'Quarter of a million', 'silver'], [500000, 'Half a million', 'gold'],
     [1000000, 'The million', 'legend']]
      .forEach(([n, name, tier]) => {
        add(A('dyn_score_' + n, name, 'Score ' + n.toLocaleString() + ' in a single dynasty.',
          tier, 'Dynasty', (c) => c.bestDynastyScore >= n));
      });

    /* ---- rings, counted inside ONE run ----
       Different from the career title badges above, which count every ring in every mode.
       These are a story about one team over one stretch of years. */
    [[1, 'Banner year', 'Win a title inside a dynasty.', 'silver'],
     [2, 'Two for the wall', 'Win 2 titles inside one dynasty.', 'gold'],
     [3, 'Era defining', 'Win 3 titles inside one dynasty.', 'legend']]
      .forEach(([n, name, desc, tier]) => {
        add(A('dyn_titles_' + n, name, desc, tier, 'Dynasty', (c) => c.anyDynasty((d) => d.titles >= n)));
      });
    add(A('dyn_ring_streak_2', 'Back to back, same job',
      'Win titles in two straight seasons of one dynasty.', 'gold', 'Dynasty',
      (c) => c.anyDynasty((d) => d.ringStreak >= 2)));
    add(A('dyn_ring_streak_3', 'Three-peat in the chair',
      'Win titles in three straight seasons of one dynasty.', 'legend', 'Dynasty',
      (c) => c.anyDynasty((d) => d.ringStreak >= 3)));

    /* ---- January, every year ---- */
    add(A('dyn_po_streak_5', 'Regulars', 'Reach the playoffs in 5 straight seasons of one dynasty.',
      'silver', 'Dynasty', (c) => c.anyDynasty((d) => d.poStreak >= 5)));
    add(A('dyn_po_streak_10', 'Nobody has a bad year here',
      'Reach the playoffs in 10 straight seasons of one dynasty.', 'legend', 'Dynasty',
      (c) => c.anyDynasty((d) => d.poStreak >= 10)));
    add(A('dyn_never_missed_8', 'Not one lean year',
      'Run a dynasty 8 seasons deep without missing the playoffs once.', 'legend', 'Dynasty',
      (c) => c.anyDynasty((d) => d.reached >= 8 && d.playoffs === d.seasons.length
        && d.seasons.length >= 8)));

    /* ---- CONTINUITY, which is the whole point of the mode ----
       Everybody ages a year every winter and his deal never gets cheaper, so a man who is
       still on the roster five seasons later has been paid for five times over. Nothing else
       on this site can ask this, because nothing else keeps a player past a single season.

       Read off the picks: the same player_id in consecutive seasons of the same run. His
       season number moves every winter, which is why the id is what is matched. */
    [[3, 'Three years of him', 'bronze'], [5, 'Franchise cornerstone', 'silver'],
     [8, 'One club man', 'gold'], [12, 'His whole career, yours', 'legend']]
      .forEach(([n, name, tier]) => {
        add(A('dyn_held_' + n, name,
          'Keep the same player on your roster for ' + n + ' straight seasons.', tier, 'Dynasty',
          (c) => c.anyDynasty((d) => d.held >= n)));
      });
    add(A('dyn_loyal', 'The band stayed together',
      'Run a dynasty 8 seasons deep having used 12 or fewer different players.',
      'legend', 'Dynasty',
      (c) => c.anyDynasty((d) => d.seasons.length >= 8 && d.cast.size > 0 && d.cast.size <= 12)));
    add(A('dyn_churn', 'Revolving door',
      'Use 30 or more different players inside one dynasty.', 'gold', 'Dynasty',
      (c) => c.anyDynasty((d) => d.cast.size >= 30)));

    /* ---- seasons inside a dynasty, which the ordinary win badges do not single out ---- */
    const dynSeason = (fn) => (c) => c.dynasties.some((d) => d.seasons.some(fn));
    add(A('dyn_win_14', 'Fourteen and three', 'Win 14 games in a dynasty season.',
      'silver', 'Dynasty', dynSeason((r) => has(r.wins) && Number(r.wins) >= 14)));
    add(A('dyn_win_17', 'Perfect regular season, one club',
      'Win all 17 in a dynasty season.', 'legend', 'Dynasty',
      dynSeason((r) => has(r.wins) && Number(r.wins) >= 17)));
    add(A('dyn_perfect', 'Untouchable, and staying',
      'Go unbeaten and win it all in a dynasty season.', 'legend', 'Dynasty',
      dynSeason((r) => isTrue(r.perfect))));
    add(A('dyn_rating_100', 'Loaded', 'Field a dynasty roster rated 100 or better.',
      'gold', 'Dynasty', dynSeason((r) => has(r.team_rating) && Number(r.team_rating) >= 100)));
    add(A('dyn_first_ring', 'Hit the ground running',
      'Win the title in the first season of a dynasty.', 'gold', 'Dynasty',
      (c) => c.anyDynasty((d) => d.seasons.some((r) => Number(r.dynasty_season) === 1
        && isTrue(r.title_won)))));
    add(A('dyn_late_ring', 'Worth waiting a decade for',
      'Win the title in season 10 or later of a dynasty.', 'gold', 'Dynasty',
      (c) => c.anyDynasty((d) => d.seasons.some((r) => Number(r.dynasty_season) >= 10
        && isTrue(r.title_won)))));
    /* THE REBUILD, and it has to be read off two consecutive rows rather than one. A miss
       followed by a ring the very next winter is the shape of a team that fixed itself. */
    add(A('dyn_bounce_back', 'Fixed it in one winter',
      'Miss the playoffs and win the title the very next season of the same dynasty.',
      'legend', 'Dynasty', (c) => c.anyDynasty((d) => d.seasons.some((r, i) => i > 0
        && isTrue(r.title_won) && !isTrue(d.seasons[i - 1].made_playoffs)
        && Number(r.dynasty_season) === Number(d.seasons[i - 1].dynasty_season) + 1))));
    /* THE OTHER WAY ROUND, which is the season that actually gets people fired. */
    add(A('dyn_hangover', 'Champagne to cardboard',
      'Win the title and miss the playoffs the very next season of the same dynasty.',
      'silver', 'Dynasty', (c) => c.anyDynasty((d) => d.seasons.some((r, i) => i > 0
        && !isTrue(r.made_playoffs) && isTrue(d.seasons[i - 1].title_won)
        && Number(r.dynasty_season) === Number(d.seasons[i - 1].dynasty_season) + 1))));

    /* ---- the cap, which is the pressure the mode runs on ----
       spend_musd on a dynasty row is the cap LESS what was left, so it counts salaries,
       re-spin fees and dead money together: what the season actually committed. */
    add(A('dyn_thrifty', 'Doing it on the cheap',
      'Play a dynasty season having committed under $100M.', 'silver', 'Dynasty',
      dynSeason((r) => has(r.spend_musd) && Number(r.spend_musd) < 100)));
    add(A('dyn_shoestring', 'Half a payroll',
      'Play a dynasty season having committed under $75M.', 'gold', 'Dynasty',
      dynSeason((r) => has(r.spend_musd) && Number(r.spend_musd) < 75)));
    add(A('dyn_thrifty_ring', 'Value in the front office',
      'Win a dynasty title with under $110M committed.', 'legend', 'Dynasty',
      dynSeason((r) => isTrue(r.title_won) && has(r.spend_musd) && Number(r.spend_musd) < 110)));
    add(A('dyn_all_in', 'Every penny',
      'Commit $138M or more in a dynasty season.', 'silver', 'Dynasty',
      dynSeason((r) => has(r.spend_musd) && Number(r.spend_musd) >= 138)));

    /* ---- chemistry, and the cast a long run assembles ---- */
    add(A('dyn_chem_8', 'They know each other',
      'Field a dynasty roster with 8% chemistry or better.', 'gold', 'Dynasty',
      dynSeason((r) => has(r.chemistry_pct) && Number(r.chemistry_pct) >= 8)));
    add(A('dyn_decades', 'Four decades on one payroll',
      'Use players from four different decades inside one dynasty.', 'gold', 'Dynasty',
      (c) => c.anyDynasty((d) => {
        const dec = new Set();
        for (const r of d.seasons) {
          for (const k of (Array.isArray(r.picks) ? r.picks : [])) {
            const s = Number(String(k).slice(String(k).lastIndexOf(':') + 1));
            if (s) dec.add(decadeOf(s));
          }
        }
        return dec.size >= 4;
      })));

    /* ---- THE NICHE SHELF ----
       The rosters are on the rows, so a dynasty season can be asked the same questions a
       single draft can, plus the one nothing else on this site can ask: what changed between
       this winter and the last one. */
    const dynRoster = (fn) => (c) => c.dynasties.some((d) => d.seasons.some((r) => {
      const men = c.rosterOf(r);
      return men.length > 0 && fn(men, r);
    }));
    add(A('dyn_same_six', 'If it is not broken',
      'Field the exact same six men two seasons running.', 'gold', 'Dynasty',
      (c) => c.anyDynasty((d) => d.seasons.some((r, i) => {
        if (!i) return false;
        const prev = d.seasons[i - 1];
        if (Number(r.dynasty_season) !== Number(prev.dynasty_season) + 1) return false;
        const a = idsOfRow(r), b = idsOfRow(prev);
        return a.length === 6 && b.length === 6 && a.every((x) => b.indexOf(x) >= 0);
      }))));
    add(A('dyn_six_clubs', 'Six badges, six cities',
      'Field a dynasty roster of six men from six different clubs.', 'silver', 'Dynasty',
      dynRoster((men) => men.length === 6 && new Set(men.map((p) => p.franchise)).size === 6)));
    add(A('dyn_one_decade', 'All out of one decade',
      'Field a dynasty roster whose six men all come from the same decade.', 'gold', 'Dynasty',
      dynRoster((men) => men.length === 6
        && new Set(men.map((p) => decadeOf(p.season))).size === 1)));
    add(A('dyn_four_decades', 'Four decades in one huddle',
      'Field a dynasty roster spanning four different decades.', 'legend', 'Dynasty',
      dynRoster((men) => new Set(men.map((p) => decadeOf(p.season))).size >= 4)));
    add(A('dyn_alumni', 'Old school ties',
      'Field a dynasty roster with three men out of the same college.', 'gold', 'Dynasty',
      dynRoster((men) => {
        const by = Object.create(null);
        for (const p of men) if (p.college) by[p.college] = (by[p.college] || 0) + 1;
        return Object.values(by).some((n) => n >= 3);
      })));
    add(A('dyn_mvp', 'An MVP in the building',
      'Field a dynasty roster with a league MVP on it.', 'gold', 'Dynasty',
      dynRoster((men) => men.some((p) => (p.awards || []).some((a) => /^MVP$/i.test(a))))));
    add(A('dyn_hardware_5', 'A trophy cabinet of a roster',
      'Collect five different awards across the men of one dynasty.', 'legend', 'Dynasty',
      (c) => c.anyDynasty((d) => {
        const aw = new Set();
        for (const r of d.seasons) {
          for (const p of c.rosterOf(r)) for (const a of (p.awards || [])) aw.add(a);
        }
        return aw.size >= 5;
      })));
    add(A('dyn_improving', 'Better every year',
      'Win more games than the season before, four seasons running.', 'gold', 'Dynasty',
      (c) => c.anyDynasty((d) => {
        let run = 1;
        for (let i = 1; i < d.seasons.length; i++) {
          const a = d.seasons[i], b = d.seasons[i - 1];
          const step = Number(a.dynasty_season) === Number(b.dynasty_season) + 1
            && has(a.wins) && has(b.wins) && Number(a.wins) > Number(b.wins);
          run = step ? run + 1 : 1;
          if (run >= 4) return true;
        }
        return false;
      })));
    add(A('dyn_on_the_brink', 'One game from the sack',
      'Finish a dynasty season on exactly the eight wins the job starts out needing.',
      'silver', 'Dynasty',
      dynSeason((r) => has(r.wins) && Number(r.wins) === DYN_BASE_WINS)));
    /* JANUARY, NOT THE TROPHY, and for the same reason full_plan_ring gives up the trophy:
       a title is rare on its own and a title with a WEAK roster stacks a second rare thing on
       it. Six hundred simulated dynasties won titles and every one of them was carrying a
       roster over 90, which is what you would expect and is not evidence that the other thing
       is possible. Reaching the playoffs underrated is the same story and it happens. */
    add(A('dyn_underdog', 'Not on paper',
      'Reach the playoffs in a dynasty season with a roster rated under 90.',
      'silver', 'Dynasty',
      dynSeason((r) => isTrue(r.made_playoffs) && has(r.team_rating)
        && Number(r.team_rating) < 90)));

    /* ---- how many you have started, which is its own kind of stubbornness ---- */
    [[3, 'Three goes at it', 'bronze'], [10, 'Serial rebuilder', 'silver'],
     [25, 'Always another job', 'gold']].forEach(([n, name, tier]) => {
      add(A('dyn_runs_' + n, name, 'Start ' + n + ' different dynasties.', tier, 'Dynasty',
        (c) => c.dynasties.length >= n));
    });
    add(A('dyn_seasons_50', 'Fifty winters',
      'Play 50 dynasty seasons in total, across however many runs it takes.', 'gold', 'Dynasty',
      (c) => c.count((r) => r.run_mode === 'dynasty') >= 50));
    add(A('dyn_seasons_150', 'A career in the chair',
      'Play 150 dynasty seasons in total.', 'legend', 'Dynasty',
      (c) => c.count((r) => r.run_mode === 'dynasty') >= 150));

    /* ---- ONE FRANCHISE DYNASTY ----
       A dynasty locked to a club: run_mode is still dynasty and the franchise column carries
       the club, which is the only thing that tells the two apart.

       COUNTED, NOT TILED. "The 32" above gives every club its own tile because each one costs
       a single draft. A club dynasty costs a run of years, so 32 tiles would be 32 badges
       nobody finishes and a shelf that reads as a wall of grey. The same collection as a
       count says the same thing in four badges. */
    const clubDyn = (d) => !!d.club;
    add(A('dyn_club_1', 'Your club, your rules', 'Finish a season of a One Franchise Dynasty.',
      'silver', 'Dynasty', (c) => c.anyDynasty(clubDyn)));
    add(A('dyn_club_5', 'Settling in', 'Reach season 5 of a One Franchise Dynasty.',
      'silver', 'Dynasty', (c) => c.anyDynasty((d) => clubDyn(d) && d.reached >= 5)));
    add(A('dyn_club_10', 'A decade at one club', 'Reach season 10 of a One Franchise Dynasty.',
      'gold', 'Dynasty', (c) => c.anyDynasty((d) => clubDyn(d) && d.reached >= 10)));
    add(A('dyn_club_15', 'They will name something after you',
      'Reach season 15 of a One Franchise Dynasty.', 'legend', 'Dynasty',
      (c) => c.anyDynasty((d) => clubDyn(d) && d.reached >= 15)));
    add(A('dyn_club_ring', 'A banner for your own club',
      'Win a title in a One Franchise Dynasty.', 'gold', 'Dynasty',
      (c) => c.anyDynasty((d) => clubDyn(d) && d.titles >= 1)));
    add(A('dyn_club_ring_3', 'Three banners, one club',
      'Win 3 titles inside one One Franchise Dynasty.', 'legend', 'Dynasty',
      (c) => c.anyDynasty((d) => clubDyn(d) && d.titles >= 3)));
    [[3, 'Three towns', 'bronze'], [8, 'Around the league', 'silver'],
     [16, 'Half the league', 'gold'], [32, 'Every club, every winter', 'legend']]
      .forEach(([n, name, tier]) => {
        add(A('dyn_clubs_' + n, name,
          'Run a One Franchise Dynasty with ' + n + ' different clubs.', tier, 'Dynasty',
          (c) => c.clubDynasties.size >= n));
      });
  }

  /* ===================== FULL TEAM =====================
   * Twelve men, both sides of the ball, a coach and a three axis game plan. The coach and the
   * plan are 94's two columns and they belong to this mode alone, so everything below that
   * reads them is asking about a season nothing else on this site plays.
   */
  if (FULLTEAM_LIVE) {
    add(A('mode_fullteam', 'Both sides of the ball', 'Finish a Full Team season.',
      'bronze', 'Full Team', (c) => c.fullRuns.length >= 1));
    [[5, 'Running the whole roster', 'bronze'], [25, 'Career in the big chair', 'silver'],
     [100, 'A hundred full squads', 'gold']].forEach(([n, name, tier]) => {
      add(A('full_' + n, name, 'Finish ' + n + ' Full Team seasons.', tier, 'Full Team',
        (c) => c.fullRuns.length >= n));
    });
    add(A('full_ring', 'Complete team', 'Win a title with a full squad.', 'gold', 'Full Team',
      (c) => c.fullRuns.some((r) => isTrue(r.title_won))));
    add(A('full_15', 'Fifteen with a full squad', 'Win 15 games with a full squad.',
      'silver', 'Full Team',
      (c) => c.fullRuns.some((r) => has(r.wins) && Number(r.wins) >= 15)));
    add(A('full_17', 'Twelve men, seventeen wins',
      'Win all 17 with a full squad.', 'legend', 'Full Team',
      (c) => c.fullRuns.some((r) => has(r.wins) && Number(r.wins) >= 17)));
    /* FIFTY, NOT NINETY, and the number is measured rather than borrowed. A Full Team rating
       is not on the same scale as every other mode's: fullSideRatings averages the two units
       and CLAMPS the result to 100, where a six man offense is unclamped and a good one is
       already past 110. Ninety was written by reading the offense's ladder and assuming it
       carried over. Three hundred and fifty simulated full squads peaked at 54.9, so ninety
       was a badge nobody could ever have earned and nothing would have said so. */
    add(A('full_elite', 'Stacked both ways',
      'Field a full squad rated 50 or better.', 'gold', 'Full Team',
      (c) => c.fullRuns.some((r) => has(r.team_rating) && Number(r.team_rating) >= 50)));
    add(A('full_chem', 'One locker room',
      'Field a full squad with 6% chemistry or better.', 'gold', 'Full Team',
      (c) => c.fullRuns.some((r) => has(r.chemistry_pct) && Number(r.chemistry_pct) >= 6)));

    /* ---- the coach ---- */
    [[3, 'Building a staff', 'bronze'], [10, 'Ten hires', 'silver'],
     [25, 'Hire and fire', 'gold']].forEach(([n, name, tier]) => {
      add(A('full_coach_' + n, name, 'Hire ' + n + ' different head coaches.', tier, 'Full Team',
        (c) => c.coaches.size >= n));
    });
    add(A('full_coach_ring', 'The right man for it',
      'Win a title with a coach on the sideline.', 'gold', 'Full Team',
      (c) => c.coachRings.size >= 1));
    add(A('full_coach_ring_3', 'It was never the coach',
      'Win a title with 3 different head coaches.', 'legend', 'Full Team',
      (c) => c.coachRings.size >= 3));

    /* ---- the game plan: three axes at -1, 0 or 1, so 27 of them ----
       A collection of exactly the right shape: each one is a single choice on a screen you
       are already on, and all 27 is a season's worth of deliberately playing differently. */
    [[5, 'Trying things', 'bronze'], [12, 'Half the playbook', 'silver'],
     [27, 'The whole playbook', 'legend']].forEach(([n, name, tier]) => {
      add(A('full_plan_' + n, name, 'Play ' + n + ' different game plans.', tier, 'Full Team',
        (c) => c.plans.size >= n));
    });
    const axis = (k, v) => (c) => c.fullRuns.some((r) => r.plan && typeof r.plan === 'object'
      && Number(r.plan[k]) === v);
    add(A('full_hurry', 'No huddle', 'Play a season at the fastest tempo.', 'bronze', 'Full Team',
      axis('tempo', 1)));
    add(A('full_grind', 'Bleed the clock', 'Play a season at the slowest tempo.', 'bronze', 'Full Team',
      axis('tempo', -1)));
    add(A('full_gambler', 'Leave the punter at home',
      'Play a season going for it on fourth.', 'bronze', 'Full Team', axis('fourth', 1)));
    add(A('full_blitz', 'Send everybody', 'Play a season bringing pressure.', 'bronze', 'Full Team',
      axis('pressure', 1)));
    add(A('full_maximal', 'Everything turned up',
      'Play a season fast, aggressive on fourth and blitzing.', 'silver', 'Full Team',
      (c) => c.fullRuns.some((r) => r.plan && Number(r.plan.tempo) === 1
        && Number(r.plan.fourth) === 1 && Number(r.plan.pressure) === 1)));
    add(A('full_conservative', 'By the book',
      'Play a season slow, punting on fourth and sitting back.', 'silver', 'Full Team',
      (c) => c.fullRuns.some((r) => r.plan && Number(r.plan.tempo) === -1
        && Number(r.plan.fourth) === -1 && Number(r.plan.pressure) === -1)));
    /* JANUARY, NOT THE TROPHY. Written as a title first, which stacked two rare things on
       each other: a Full Team title is about one season in a hundred on its own, and the
       plan is only yours at all when you decline a coach, which costs you his boost. The
       playoffs are the honest version of the same claim. */
    add(A('full_plan_ring', 'The plan worked',
      'Reach the playoffs with every axis of the plan turned up, and no coach.',
      'gold', 'Full Team',
      (c) => c.fullRuns.some((r) => isTrue(r.made_playoffs) && r.plan
        && Number(r.plan.tempo) === 1 && Number(r.plan.fourth) === 1
        && Number(r.plan.pressure) === 1)));
  }

  const TIER_ORDER = { bronze: 0, silver: 1, gold: 2, legend: 3 };
  /* Shelf order in the profile. A group with nothing in it draws nothing, so the two hidden
     modes can sit in this list before their badges exist. Dynasty goes near the front because
     it is the mode with the most to chase. */
  const GROUPS = ['Milestones', 'Winning', 'Dynasty', 'Roster craft', 'Chemistry', 'Shapes',
    'History', 'The vintages', 'The 32', 'Banners', 'Recruiting', 'Hardware', 'Modes',
    'Defense', 'Full Team', 'Front office', 'Calendar', 'Streaks'];

  /*
   * Evaluate the whole catalog. A test that throws is treated as not earned rather than
   * taking the profile down with it: a badge is decoration and a broken one must not cost
   * somebody their career panel.
   *
   * `opts` is { nowIso, pairLinks }. A bare string is accepted as nowIso, which is what the
   * first version of this function took.
   */
  function evaluate(rows, resolve, opts) {
    const list = Array.isArray(rows) ? rows : [];
    const ctx = buildContext(list, resolve, opts);
    const earned = [], locked = [];
    for (const a of CATALOG) {
      let ok = false;
      try { ok = !!a.test(ctx); } catch (e) { ok = false; }
      (ok ? earned : locked).push(a);
    }
    return {
      earned, locked, total: CATALOG.length,
      play: ctx.play, title: ctx.title,
      stats: {
        runs: ctx.total,
        titles: ctx.titles.length,
        clubsPlayed: ctx.clubsPlayed.size,
        modesPlayed: ctx.modesPlayed.size,
        seasonsDrafted: ctx.seasonsDrafted.size,
        clubsDrafted: ctx.clubsDrafted.size,
        collegesDrafted: ctx.collegesDrafted.size,
        banners: ctx.clubBanners.size,
        bestGm: ctx.bestGm,
        trades: ctx.totalTrades,
        dynasties: ctx.dynasties.length,
        bestDynasty: ctx.bestDynasty,
        bestDynastyScore: ctx.bestDynastyScore,
      },
    };
  }

  const api = {
    CATALOG, GROUPS, TIER_ORDER, CLUBS, SEASONS, COLLEGES, CAP, TRADE_DEADLINE_WEEK,
    evaluate, playStreak, titleStreak, dayKey, analyzeLinks,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.PS_ACH = api;
})();
