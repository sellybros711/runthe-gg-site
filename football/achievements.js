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
 * Headless and dependency-free, so the catalogue can be tested in node against real rows.
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
  function analyseLinks(roster, pairLinks, sameClub) {
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
        ? analyseLinks(roster, pairLinks, r.run_mode === 'club')
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

    const titles = asc.filter((r) => isTrue(r.title_won));
    const modeOf = (r) => r.run_mode || null;
    const clubsPlayed = new Set(asc.map((r) => r.franchise).filter(Boolean));
    /* A banner belongs to a club only when the run was actually locked to that club. A free
       run carrying somebody's favourite team in the franchise column is not a One Franchise
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

  /* ---------------- the catalogue ----------------
     tier drives the colour only: bronze, silver, gold, legend.
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

  const CATALOGUE = [];
  const add = (a) => { CATALOGUE.push(a); return a; };

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
  add(A('greybeard', 'Fifteen years in',
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
  add(A('asked_for_the_best', 'Priced out of a favourite',
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

  const TIER_ORDER = { bronze: 0, silver: 1, gold: 2, legend: 3 };
  const GROUPS = ['Milestones', 'Winning', 'Roster craft', 'Chemistry', 'Shapes', 'History',
    'The vintages', 'The 32', 'Banners', 'Recruiting', 'Hardware', 'Modes', 'Front office',
    'Calendar', 'Streaks'];

  /*
   * Evaluate the whole catalogue. A test that throws is treated as not earned rather than
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
    for (const a of CATALOGUE) {
      let ok = false;
      try { ok = !!a.test(ctx); } catch (e) { ok = false; }
      (ok ? earned : locked).push(a);
    }
    return {
      earned, locked, total: CATALOGUE.length,
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
      },
    };
  }

  const api = {
    CATALOGUE, GROUPS, TIER_ORDER, CLUBS, SEASONS, COLLEGES, CAP, TRADE_DEADLINE_WEEK,
    evaluate, playStreak, titleStreak, dayKey, analyseLinks,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.PS_ACH = api;
})();
