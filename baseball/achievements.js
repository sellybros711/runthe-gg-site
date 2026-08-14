/* Run The Diamond — achievements & streaks.
 *
 * Derive-everything design: the game persists only compact per-season rows;
 * every badge, streak, and career stat is recomputed from those rows on
 * demand. A newly-added badge lights up retroactively, and no badge can drift
 * out of sync with the history it describes.
 *
 * Browser: window.RTD_ACH. Node: require('./achievements.js').
 * A run row (written by index.html recordRun) looks like:
 *   { ts, wins, losses, titleWon, madePlayoffs, seedLabel, isGOAT, beatRecord,
 *     rating, allTimeRank, chemPct, spend, respins, efficiency, archetype,
 *     era, picks:[{ i, s, t, slot, w }] }
 * Rows have holes — fields added over time — so tests treat missing as
 * "unknown", never as a hard zero.
 */
'use strict';
(function () {

const TIERS = { bronze: 'bronze', silver: 'silver', gold: 'gold', legend: 'legend' };

/* An achievement: id, name, description, tier (color), group (shelf), test. */
function A(id, name, desc, tier, group, test) {
  return { id, name, desc, tier, group, test };
}

const GROUPS = ['Milestones', 'Winning', 'The all-time list', 'Roster craft', 'The roster', 'Streaks'];

// Helpers over a single row -----------------------------------------------
const decadeOf = (s) => Math.floor(s / 10) * 10;
const uniq = (arr) => [...new Set(arr)];
function picks(row) { return Array.isArray(row.picks) ? row.picks : []; }

const CATALOGUE = [
  // ── Milestones ──
  A('first_run', 'Play ball', 'Finish your first season.', 'bronze', 'Milestones',
    (c) => c.rows.length >= 1),
  A('runs_10', 'Regular', 'Finish 10 seasons.', 'bronze', 'Milestones',
    (c) => c.rows.length >= 10),
  A('runs_50', 'Skipper', 'Finish 50 seasons.', 'silver', 'Milestones',
    (c) => c.rows.length >= 50),
  A('runs_150', 'Lifer', 'Finish 150 seasons.', 'legend', 'Milestones',
    (c) => c.rows.length >= 150),
  A('made_playoffs', 'October baseball', 'Reach the playoffs.', 'bronze', 'Milestones',
    (c) => c.rows.some((r) => r.madePlayoffs)),

  // ── Winning ──
  A('win_title', 'World Series Champions', 'Win the World Series.', 'gold', 'Winning',
    (c) => c.rows.some((r) => r.titleWon)),
  A('win_90', '90 wins', 'Win 90 games in a season.', 'bronze', 'Winning',
    (c) => c.best.wins >= 90),
  A('win_100', 'Hundred-win club', 'Win 100 games in a season.', 'silver', 'Winning',
    (c) => c.best.wins >= 100),
  A('win_110', 'Juggernaut', 'Win 110 games in a season.', 'gold', 'Winning',
    (c) => c.best.wins >= 110),
  A('tie_record', 'Immortal', 'Match the all-time record (116 wins).', 'legend', 'Winning',
    (c) => c.rows.some((r) => r.beatRecord)),
  A('goat', 'Greatest of all time', 'Win 117+ games — the best ever.', 'legend', 'Winning',
    (c) => c.rows.some((r) => r.isGOAT)),
  A('wildcard_title', 'Cinderella', 'Win it all as a wild card.', 'gold', 'Winning',
    (c) => c.rows.some((r) => r.titleWon && r.seedLabel === 'Wild card')),
  A('runner_up', 'So close', 'Lose in the World Series.', 'silver', 'Winning',
    (c) => c.rows.some((r) => !r.titleWon && r.seedLabel && r.eliminatedWS)),
  A('title_2', 'Dynasty', 'Win the title in two different seasons.', 'gold', 'Winning',
    (c) => c.rows.filter((r) => r.titleWon).length >= 2),

  // ── The all-time list (ranking) ──
  A('rank_top100', 'Top 100', 'Build a top-100 team of all time.', 'bronze', 'The all-time list',
    (c) => c.bestRank != null && c.bestRank <= 100),
  A('rank_top10', 'Top 10', 'Build a top-10 team of all time.', 'silver', 'The all-time list',
    (c) => c.bestRank != null && c.bestRank <= 10),
  A('rank_one', 'Greatest ever assembled', 'Build the #1 team of all time.', 'legend', 'The all-time list',
    (c) => c.bestRank != null && c.bestRank <= 1),
  A('rating_90', 'Loaded', 'Field a team rated 90+.', 'silver', 'The all-time list',
    (c) => c.best.rating >= 90),
  A('rating_100', 'Perfect on paper', 'Field a team rated 100.', 'legend', 'The all-time list',
    (c) => c.best.rating >= 100),

  // ── Roster craft ──
  A('efficient', 'Sharp scout', 'Draft at 90%+ efficiency.', 'silver', 'Roster craft',
    (c) => c.best.efficiency >= 90),
  A('perfect_draft', 'Nothing left on the board', 'Draft at 98%+ efficiency.', 'legend', 'Roster craft',
    (c) => c.best.efficiency >= 98),
  A('chem_10', 'Clubhouse magic', 'Reach +10% chemistry.', 'gold', 'Roster craft',
    (c) => c.best.chemPct >= 10),
  A('bargain_title', 'Moneyball', 'Win the title spending under $210M.', 'gold', 'Roster craft',
    (c) => c.rows.some((r) => r.titleWon && r.spend != null && r.spend < 210)),
  A('no_respin_title', 'No do-overs', 'Win the title using no re-spins.', 'gold', 'Roster craft',
    (c) => c.rows.some((r) => r.titleWon && (r.respins || 0) === 0)),
  A('murderers_row', "Murderers' Row", 'Win the title with a Murderers’ Row roster.', 'gold', 'Roster craft',
    (c) => c.rows.some((r) => r.titleWon && r.archetype === 'murderers_row')),

  // ── The roster ──
  A('family', 'Keeping it in the family', 'Draft two players from the same family.', 'gold', 'The roster',
    (c) => c.rows.some((r) => (r.chemLinks || []).some((l) => l === 'family'))),
  A('one_franchise', 'Company men', 'Field six players from one franchise.', 'gold', 'The roster',
    (c) => c.rows.some((r) => {
      const t = {}; picks(r).forEach((p) => { t[p.t] = (t[p.t] || 0) + 1; });
      return Object.values(t).some((n) => n >= 6);
    })),
  A('one_season', 'Time capsule', 'Field three players from one exact season.', 'silver', 'The roster',
    (c) => c.rows.some((r) => {
      const s = {}; picks(r).forEach((p) => { s[p.s] = (s[p.s] || 0) + 1; });
      return Object.values(s).some((n) => n >= 3);
    })),
  A('century', 'A century of the game', 'Field players from six different decades.', 'gold', 'The roster',
    (c) => c.rows.some((r) => uniq(picks(r).map((p) => decadeOf(p.s))).length >= 6)),
  A('deadball', 'Dead-ball era', 'Draft a player from before 1920.', 'bronze', 'The roster',
    (c) => c.rows.some((r) => picks(r).some((p) => p.s < 1920))),
  A('legend_pick', 'Inner circle', 'Draft a 10+ WAR season.', 'silver', 'The roster',
    (c) => c.rows.some((r) => picks(r).some((p) => (p.w || 0) >= 10))),

  // ── Streaks ──
  A('streak_3', 'On a roll', 'Play three days in a row.', 'bronze', 'Streaks',
    (c) => c.play.best >= 3),
  A('streak_7', 'Week straight', 'Play seven days in a row.', 'silver', 'Streaks',
    (c) => c.play.best >= 7),
  A('streak_30', 'A month straight', 'Play 30 days in a row.', 'legend', 'Streaks',
    (c) => c.play.best >= 30),
  A('btb_title', 'Back-to-back', 'Win the title two seasons running.', 'gold', 'Streaks',
    (c) => c.title.best >= 2),
  A('threepeat', 'Three-peat', 'Win the title three seasons running.', 'legend', 'Streaks',
    (c) => c.title.best >= 3),
];

// Streak engines ----------------------------------------------------------
function dayKey(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

/* Daily-play streak counted in distinct local calendar days on which at least
 * one season finished (five runs one evening = one day, can't be farmed).
 * Alive if the last-played day was today or yesterday. */
function playStreak(rows, nowTs) {
  const days = uniq(rows.map((r) => dayKey(r.ts))).sort();
  if (!days.length) return { current: 0, best: 0, playedToday: false };
  let best = 1, cur = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1]), d = new Date(days[i]);
    const gap = Math.round((d - prev) / 86400000);
    if (gap === 1) cur++; else cur = 1;
    if (cur > best) best = cur;
  }
  const today = dayKey(nowTs || Date.now());
  const yest = dayKey((nowTs || Date.now()) - 86400000);
  const last = days[days.length - 1];
  const current = (last === today || last === yest) ? cur : 0;
  return { current, best, playedToday: last === today };
}

/* Consecutive seasons (in play order) that won the title. */
function titleStreak(rows) {
  let best = 0, cur = 0;
  for (const r of rows) {
    if (r.titleWon) { cur++; if (cur > best) best = cur; } else cur = 0;
  }
  return { current: cur, best };
}

// Evaluation --------------------------------------------------------------
function buildCtx(rows, nowTs) {
  const best = { wins: 0, rating: 0, efficiency: 0, chemPct: -100 };
  let bestRank = null;
  for (const r of rows) {
    if ((r.wins || 0) > best.wins) best.wins = r.wins;
    if ((r.rating || 0) > best.rating) best.rating = r.rating;
    if ((r.efficiency || 0) > best.efficiency) best.efficiency = r.efficiency;
    if ((r.chemPct != null ? r.chemPct : -100) > best.chemPct) best.chemPct = r.chemPct;
    if (r.allTimeRank != null && (bestRank == null || r.allTimeRank < bestRank)) bestRank = r.allTimeRank;
  }
  return {
    rows, best, bestRank,
    play: playStreak(rows, nowTs),
    title: titleStreak(rows),
  };
}

function evaluate(rows, nowTs) {
  rows = Array.isArray(rows) ? rows : [];
  const ctx = buildCtx(rows, nowTs);
  const earned = [], locked = [];
  for (const a of CATALOGUE) {
    let got = false;
    try { got = !!a.test(ctx); } catch (_) { got = false; }
    (got ? earned : locked).push(a);
  }
  return {
    earned, locked, total: CATALOGUE.length,
    play: ctx.play, title: ctx.title,
    stats: {
      runs: rows.length,
      titles: rows.filter((r) => r.titleWon).length,
      playoffs: rows.filter((r) => r.madePlayoffs).length,
      bestWins: ctx.best.wins,
      bestRank: ctx.bestRank,
      bestRating: Math.round(ctx.best.rating),
    },
  };
}

/* Which badge ids are newly earned by adding newRow to prevRows. */
function newlyEarned(prevRows, newRow, nowTs) {
  const before = new Set(evaluate(prevRows, nowTs).earned.map((a) => a.id));
  const after = evaluate(prevRows.concat([newRow]), nowTs).earned;
  return after.filter((a) => !before.has(a.id));
}

const api = {
  CATALOGUE, GROUPS, TIERS,
  evaluate, newlyEarned, playStreak, titleStreak,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.RTD_ACH = api;
})();
