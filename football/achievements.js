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

  /* ---------------- small helpers ---------------- */

  const has = (v) => v !== null && v !== undefined;
  const num = (v) => (has(v) ? Number(v) : null);
  const isTrue = (v) => v === true || v === 1 || v === 't' || v === 'true';

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

  /* ---------------- the context every test reads ---------------- */

  /*
   * Built once and handed to every test, because forty tests each walking the row list is
   * forty walks. `resolve` turns a stored pick ("00-0019596:2007") into that player, so a
   * roster test can ask about positions, clubs, seasons and hardware; when the caller has no
   * player data the roster-shaped fields come back empty and the tests that need them
   * answer false rather than throwing.
   */
  function buildContext(rows, resolve, nowIso) {
    const asc = rows.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const todayKey = dayKey(nowIso || new Date().toISOString()) || '1970-01-01';
    const dayKeys = [];
    const seenDays = Object.create(null);
    for (const r of asc) {
      const k = r.created_at ? dayKey(r.created_at) : null;
      if (k && !seenDays[k]) { seenDays[k] = 1; dayKeys.push(k); }
    }

    /* Each run's roster, resolved once. A run whose picks cannot be resolved (older data, or
       no player table handed in) gets an empty roster and is skipped by roster tests. */
    const runs = asc.map((r) => {
      let roster = [];
      if (resolve && Array.isArray(r.picks)) {
        roster = r.picks.map((k) => resolve(k)).filter(Boolean);
        if (roster.length !== r.picks.length) roster = [];
      }
      return { row: r, roster, slots: Array.isArray(r.slots) ? r.slots : [] };
    });

    const titles = asc.filter((r) => isTrue(r.title_won));
    const modeOf = (r) => r.run_mode || null;
    const clubsPlayed = new Set(asc.map((r) => r.franchise).filter(Boolean));
    const clubTitles = new Set(titles.map((r) => r.franchise).filter(Boolean));
    const modesPlayed = new Set(asc.map(modeOf).filter(Boolean));
    const modeTitles = new Set(titles.map(modeOf).filter(Boolean));

    return {
      rows: asc,
      runs,
      total: rows.length,
      titles,
      dayKeys,
      todayKey,
      play: playStreak(dayKeys, todayKey),
      title: titleStreak(asc),
      clubsPlayed, clubTitles, modesPlayed, modeTitles,
      // convenience: rows where a numeric column is actually present
      withNum: (col) => asc.filter((r) => has(r[col])).map((r) => ({ r, v: Number(r[col]) })),
      best: (col) => {
        const vals = asc.map((r) => num(r[col])).filter((v) => v !== null);
        return vals.length ? Math.max.apply(null, vals) : null;
      },
      // any run satisfying a predicate
      any: (fn) => asc.some(fn),
      count: (fn) => asc.filter(fn).length,
      anyRoster: (fn) => runs.some((x) => x.roster.length > 0 && fn(x.roster, x.row, x.slots)),
      countRoster: (fn) => runs.filter((x) => x.roster.length > 0 && fn(x.roster, x.row, x.slots)).length,
      awardsOf: (p) => (Array.isArray(p.awards) ? p.awards : []),
    };
  }

  /* ---------------- the catalogue ----------------
     tier drives the colour only: bronze, silver, gold, legend.
     group drives which shelf it sits on in the profile. */
  const A = (id, name, desc, tier, group, test) => ({ id, name, desc, tier, group, test });

  const CATALOGUE = [
    /* --- getting started --- */
    A('first_run', 'Welcome to the league', 'Finish your first season.', 'bronze', 'Milestones',
      (c) => c.total >= 1),
    A('runs_10', 'Regular', 'Finish 10 seasons.', 'bronze', 'Milestones', (c) => c.total >= 10),
    A('runs_50', 'Front office fixture', 'Finish 50 seasons.', 'silver', 'Milestones', (c) => c.total >= 50),
    A('runs_100', 'Century of seasons', 'Finish 100 seasons.', 'gold', 'Milestones', (c) => c.total >= 100),
    A('runs_250', 'Lifer', 'Finish 250 seasons.', 'legend', 'Milestones', (c) => c.total >= 250),

    /* --- winning --- */
    A('playoffs_first', 'Tickets punched', 'Reach the playoffs.', 'bronze', 'Winning',
      (c) => c.any((r) => isTrue(r.made_playoffs))),
    A('title_first', 'Champion', 'Win a title.', 'silver', 'Winning', (c) => c.titles.length >= 1),
    A('title_5', 'Dynasty building', 'Win 5 titles.', 'gold', 'Winning', (c) => c.titles.length >= 5),
    A('title_25', 'Hall of fame GM', 'Win 25 titles.', 'legend', 'Winning', (c) => c.titles.length >= 25),
    A('perfect', 'Perfect season', 'Go unbeaten and win it all.', 'legend', 'Winning',
      (c) => c.any((r) => isTrue(r.perfect))),
    A('perfect_2', 'Twice untouchable', 'Put together two perfect seasons.', 'legend', 'Winning',
      (c) => c.count((r) => isTrue(r.perfect)) >= 2),
    A('undefeated_no_ring', 'The 2007 Patriots', 'Go unbeaten in the regular season and still not win it all.',
      'gold', 'Winning',
      (c) => c.any((r) => has(r.wins) && has(r.losses) && Number(r.wins) >= 17
        && Number(r.losses) === 0 && !isTrue(r.perfect))),
    A('wildcard_ring', 'Wild card run', 'Win the title from a wild card seed.', 'gold', 'Winning',
      (c) => c.any((r) => isTrue(r.title_won) && /wild/i.test(String(r.seed_label || '')))),
    /* The engine writes exactly three seed labels: 'Top seed', 'Wild card', 'Missed the
       playoffs'. Matching anything else here silently never fires. */
    A('bye_ring', 'Home all the way', 'Win the title as the top seed, with a first-round bye.',
      'silver', 'Winning',
      (c) => c.any((r) => isTrue(r.title_won) && /top seed/i.test(String(r.seed_label || '')))),
    /* Which round a run died in is not stored, only the seed it earned, so "lost the final"
       cannot be asked. The nearest honest question is a great team that still came away with
       nothing. */
    A('heartbreak', 'Nothing to show for it', 'Win 15 or more and still finish without a title.',
      'silver', 'Winning',
      (c) => c.any((r) => has(r.wins) && Number(r.wins) >= 15 && !isTrue(r.title_won))),

    /* --- roster craft --- */
    A('rating_90', 'Loaded', 'Build a team rated 90 or better.', 'silver', 'Roster craft',
      (c) => (c.best('team_rating') || 0) >= 90),
    A('rating_100', 'Video game numbers', 'Build a team rated 100 or better.', 'legend', 'Roster craft',
      (c) => (c.best('team_rating') || 0) >= 100),
    A('chem_10', 'They just click', 'Finish a season with +10% chemistry or better.', 'gold', 'Roster craft',
      (c) => (c.best('chemistry_pct') || 0) >= 10),
    A('chem_negative_ring', 'Strangers with rings', 'Win a title with negative chemistry.', 'gold', 'Roster craft',
      (c) => c.any((r) => isTrue(r.title_won) && has(r.chemistry_pct) && Number(r.chemistry_pct) < 0)),
    A('perfect_draft', 'Nothing left on the board', 'Draft the best possible team from your six spins.',
      'legend', 'Roster craft', (c) => (c.best('perfect_pct') || 0) >= 100),
    A('bargain_ring', 'Moneyball', 'Win a title spending under $110M.', 'gold', 'Roster craft',
      (c) => c.any((r) => isTrue(r.title_won) && has(r.spend_musd) && Number(r.spend_musd) < 110)),
    A('shoestring', 'Shoestring budget', 'Finish a season having spent under $80M.', 'silver', 'Roster craft',
      (c) => c.any((r) => has(r.spend_musd) && Number(r.spend_musd) < 80)),
    A('no_respin_ring', 'Took what it gave', 'Win a title without a single re-spin.', 'gold', 'Roster craft',
      (c) => c.any((r) => isTrue(r.title_won) && has(r.respins) && Number(r.respins) === 0)),
    A('all_respin_ring', 'Worth every penny', 'Win a title after using every re-spin.', 'gold', 'Roster craft',
      (c) => c.any((r) => isTrue(r.title_won) && has(r.respins) && Number(r.respins) >= 3)),

    /* --- historical, read off the actual six players --- */
    A('y2k', 'Y2K', 'Draft a player from the 1999 season.', 'bronze', 'History',
      (c) => c.anyRoster((ros) => ros.some((p) => Number(p.season) === 1999))),
    A('one_decade', 'Period piece', 'Field a team whose six players all come from one decade.',
      'silver', 'History',
      (c) => c.anyRoster((ros) => new Set(ros.map((p) => decadeOf(p.season))).size === 1)),
    A('three_decades', 'Across the ages', 'Field a team drawing on three different decades.',
      'silver', 'History',
      (c) => c.anyRoster((ros) => new Set(ros.map((p) => decadeOf(p.season))).size >= 3)),
    A('six_clubs', 'Six different jerseys', 'Field a team of six players from six different clubs.',
      'silver', 'History',
      (c) => c.anyRoster((ros) => new Set(ros.map((p) => p.franchise)).size === 6)),
    A('one_club', 'Company men', 'Field a team whose six players all come from one club.',
      'gold', 'History',
      (c) => c.anyRoster((ros) => new Set(ros.map((p) => p.franchise)).size === 1)),
    A('same_team_season', 'Reunion tour', 'Field two players from the very same team and season.',
      'silver', 'History',
      (c) => c.anyRoster((ros) => {
        const seen = Object.create(null);
        for (const p of ros) {
          const k = p.franchise + '|' + p.season;
          if (seen[k]) return true;
          seen[k] = 1;
        }
        return false;
      })),
    A('award_winner', 'Hardware', 'Draft a player who won an award that season.', 'bronze', 'History',
      (c) => c.anyRoster((ros) => ros.some((p) => (p.awards || []).length > 0))),
    A('award_three', 'Trophy cabinet', 'Field three award winners at once.', 'gold', 'History',
      (c) => c.anyRoster((ros) => ros.filter((p) => (p.awards || []).length > 0).length >= 3)),
    A('mvp', 'Most Valuable Pickup', 'Draft a league MVP.', 'gold', 'History',
      (c) => c.anyRoster((ros) => ros.some((p) => (p.awards || []).some((a) => /^MVP$|Most Valuable/i.test(a))))),
    A('sb_mvp', 'Big game hunter', 'Draft a Super Bowl MVP.', 'gold', 'History',
      (c) => c.anyRoster((ros) => ros.some((p) => (p.awards || []).some((a) => /Super Bowl MVP/i.test(a))))),
    A('rookie', 'Rookie sensation', 'Draft a player in his draft year.', 'silver', 'History',
      (c) => c.anyRoster((ros) => ros.some((p) => has(p.draft_year) && Number(p.draft_year) === Number(p.season)))),
    /* Deliberately NOT an "undrafted player" badge: draft_round is null on every row in the
       shipped data, so that test would fire for every roster ever built. draft_year is there
       for about four players in five, so seniority is a question the data can answer. */
    A('veteran', 'Old reliable', 'Draft a player ten or more seasons into his career.',
      'silver', 'History',
      (c) => c.anyRoster((ros) => ros.some((p) => has(p.draft_year)
        && Number(p.season) - Number(p.draft_year) >= 10))),
    A('same_college', 'Old school ties', 'Field two players from the same college.', 'silver', 'History',
      (c) => c.anyRoster((ros) => {
        const seen = Object.create(null);
        for (const p of ros) {
          if (!p.college) continue;
          if (seen[p.college]) return true;
          seen[p.college] = 1;
        }
        return false;
      })),
    A('millennium_ring', 'Turn of the century', 'Win a title with a team built only from before 2010.',
      'gold', 'History',
      (c) => c.anyRoster((ros, row) => isTrue(row.title_won) && ros.every((p) => Number(p.season) < 2010))),
    A('modern_ring', 'Modern era', 'Win a title with a team built only from 2020 onwards.', 'gold', 'History',
      (c) => c.anyRoster((ros, row) => isTrue(row.title_won) && ros.every((p) => Number(p.season) >= 2020))),

    /* --- shapes --- */
    A('three_rb', 'Ground and pound', 'Field three running backs at once.', 'silver', 'Shapes',
      (c) => c.anyRoster((ros) => ros.filter((p) => p.position === 'RB').length >= 3)),
    A('three_wr', 'Air raid', 'Field three receivers at once.', 'silver', 'Shapes',
      (c) => c.anyRoster((ros) => ros.filter((p) => p.position === 'WR').length >= 3)),
    A('three_te', 'Heavy package', 'Field three tight ends at once.', 'gold', 'Shapes',
      (c) => c.anyRoster((ros) => ros.filter((p) => p.position === 'TE').length >= 3)),

    /* --- modes --- */
    A('mode_club', 'One Franchise', 'Finish a One Franchise season.', 'bronze', 'Modes',
      (c) => c.modesPlayed.has('club')),
    A('mode_era', 'Eras Draft', 'Finish an Eras Draft season.', 'bronze', 'Modes',
      (c) => c.modesPlayed.has('era')),
    A('mode_trade', 'Take the wheel', 'Finish a Trade Machine season.', 'bronze', 'Modes',
      (c) => c.modesPlayed.has('trade')),
    A('mode_all', 'Tried everything', 'Finish a season in every mode.', 'gold', 'Modes',
      (c) => ['free', 'club', 'era', 'trade'].every((m) => c.modesPlayed.has(m))),
    A('ring_every_mode', 'Wins anywhere', 'Win a title in every mode.', 'legend', 'Modes',
      (c) => ['free', 'club', 'era', 'trade'].every((m) => c.modeTitles.has(m))),
    A('clubs_10', 'Ten cities', 'Play One Franchise with 10 different clubs.', 'silver', 'Modes',
      (c) => c.clubsPlayed.size >= 10),
    A('clubs_32', 'Toured the league', 'Play One Franchise with all 32 clubs.', 'legend', 'Modes',
      (c) => c.clubsPlayed.size >= 32),
    A('club_rings_5', 'Five banners', 'Win a title with 5 different clubs.', 'gold', 'Modes',
      (c) => c.clubTitles.size >= 5),
    A('trade_ring', 'Deadline genius', 'Win a title in the Trade Machine.', 'gold', 'Modes',
      (c) => c.modeTitles.has('trade')),

    /* --- streaks --- */
    A('streak_3', 'Getting into it', 'Play on 3 days in a row.', 'bronze', 'Streaks',
      (c) => c.play.best >= 3),
    A('streak_7', 'Every day this week', 'Play on 7 days in a row.', 'silver', 'Streaks',
      (c) => c.play.best >= 7),
    A('streak_30', 'A month straight', 'Play on 30 days in a row.', 'legend', 'Streaks',
      (c) => c.play.best >= 30),
    A('btb', 'Back to back', 'Win titles in two straight seasons.', 'gold', 'Streaks',
      (c) => c.title.best >= 2),
    A('three_peat', 'Three-peat', 'Win titles in three straight seasons.', 'legend', 'Streaks',
      (c) => c.title.best >= 3),
  ];

  const TIER_ORDER = { bronze: 0, silver: 1, gold: 2, legend: 3 };
  const GROUPS = ['Milestones', 'Winning', 'Roster craft', 'History', 'Shapes', 'Modes', 'Streaks'];

  /*
   * Evaluate the whole catalogue. A test that throws is treated as not earned rather than
   * taking the profile down with it: a badge is decoration and a broken one must not cost
   * somebody their career panel.
   */
  function evaluate(rows, resolve, nowIso) {
    const list = Array.isArray(rows) ? rows : [];
    const ctx = buildContext(list, resolve, nowIso);
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
      },
    };
  }

  const api = { CATALOGUE, GROUPS, TIER_ORDER, evaluate, playStreak, titleStreak, dayKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.PS_ACH = api;
})();
