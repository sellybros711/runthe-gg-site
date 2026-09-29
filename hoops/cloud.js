/*
 * cloud.js - Run The Floor's half of the shelf in supabase/103_cloud_saves.sql.
 *
 * /assets/cloudsave.js is the TRANSPORT and it is shared with the football and college games.
 * This file is the POLICY: which slots this game keeps, how far along a run is, and what
 * happens when two devices disagree. None of it belongs in the shared file, because only the
 * game knows what "further along" means, which is the argument 103's own header makes.
 *
 * ---------------------------------------------------------------------------------------
 * THREE SLOTS, AND THE THIRD ONE IS WHY THIS FILE IS NOT TEN LINES
 * ---------------------------------------------------------------------------------------
 *
 *   run     the run in progress. One at a time, so one slot.
 *   career  every finished run, which is what the badge cabinet and the bests are derived from
 *   daily   the day, the streak and the best daily
 *
 * One ps_save_all() answers all three in one round trip, which is what the front page wants.
 *
 * THE PREFERENCES STAY LOCAL, deliberately: the last club, the last era and whether the guide
 * has been seen. Each is worth one tap, none is worth a round trip, and the site's own rule is
 * that browser storage is for per-viewer conveniences. A remembered club following somebody to
 * a second device would also be slightly wrong: it is a fact about the browser they drafted in.
 *
 * ---------------------------------------------------------------------------------------
 * A RUN SYNCS ON PROGRESS. A CAREER MERGES. THEY ARE NOT THE SAME PROBLEM.
 * ---------------------------------------------------------------------------------------
 *
 * A football dynasty is ONE run that two devices are at different points of, so "more play
 * wins" is the whole answer and 103's refusal rule is the whole mechanism.
 *
 * A CAREER IS NOT THAT. Two devices can each hold runs the other has never seen: a laptop plays
 * five, a phone plays three, and neither is behind the other. Run the progress rule over that
 * and the phone's three runs are deleted by the laptop's next save, which is the exact thing
 * this whole feature exists to stop. Badges are DERIVED from the career, so what is lost is not
 * a number, it is a cabinet somebody filled.
 *
 * So the career and the daily are MERGED, and the merge has one property that everything else
 * here is built to protect:
 *
 *   A MERGE MAY NEVER TAKE A BADGE AWAY.
 *
 * Every badge in badges.js is either a `>=` over a counter, a count of distinct keys in a map,
 * or a question about the rows. So: scalars take the MAXIMUM, maps take the union with the
 * maximum per key, and rows take the union. All three only ever grow, so a cabinet can gain a
 * square on a merge and can never lose one. That is checked as a property rather than trusted,
 * in check-cloudsave.mjs, over the real catalog.
 *
 * WHAT IT COSTS IS THAT A COUNTER UNDER-COUNTS, and that is chosen rather than overlooked.
 * Five runs on a laptop and three on a phone merge to `runs: 5`, not 8, because a maximum is
 * not a sum and a sum would double every time the same two careers met again. Making it exact
 * would mean deriving the count from the rows, and the rows are capped at 250 while the count
 * is not. UNDER-COUNTING IS THE SAFE DIRECTION: it can delay a badge and can never hand one out
 * that was not earned. Anybody tempted to swap the maximum for a sum should read that sentence
 * and then the idempotence assertion in the guard.
 *
 * ---------------------------------------------------------------------------------------
 * A ROW NEEDS AN IDENTITY OR THE MERGE DOUBLES IT EVERY BOOT
 * ---------------------------------------------------------------------------------------
 *
 * The union is only idempotent if the same row is recognised as the same row, and a career row
 * carried no id at all: it is a compact line of numbers about a finished season. Merged without
 * one, every row on the device doubles on every single boot.
 *
 * New rows carry `id`, which is the run's own seed. Rows already on a device have none, so they
 * fall back to a key built from their contents. Two genuinely identical runs then collapse into
 * one row, which loses one line of evidence on a coincidence and is the same safe direction as
 * the paragraph above. Nothing regresses: `id` is a new field on an old shape, which is the rule
 * recordRun already documents, and badges.js reads a missing field as "not known".
 */
(function () {
  'use strict';

  var GAME = 'rtf';
  var SLOT_RUN = 'run', SLOT_CAREER = 'career', SLOT_DAILY = 'daily';

  /* ---------------------------------------------------------------------------------------
   * HOW FAR ALONG A RUN IS
   *
   * The phase dominates and the within-phase count breaks the tie, so this reads the way a
   * player would describe it: a bracket beats a draft, and a fuller draft beats an emptier one.
   *
   * A TIE IS NOT A REFUSAL. The server refuses only a write that is strictly behind, so two
   * devices at the same point both land and the later one wins, which is right: they are the
   * same distance into the run and the newer answer is the one somebody is looking at.
   *
   * THE SEASON HAS NO WITHIN-PHASE COUNT AND THAT IS NOT AN OVERSIGHT. The reveal lives in
   * `run._simState`, which holds the rng as a function and therefore does not survive JSON at
   * all: a restored season restarts its own reveal. There is nothing stored to measure, so
   * every mid-season run is the same distance in, which is exactly true of what is saved.
   */
  var PHASE_RANK = { draft: 0, season: 1, seeding: 2, playoffs: 3, over: 4 };

  function runProgress(run) {
    if (!run || !run.phase) return 0;
    var rank = PHASE_RANK[run.phase];
    if (rank == null) rank = 0;
    var within = 0;
    if (run.phase === 'draft') within = (run.roster && run.roster.length) || 0;
    else if (run.phase === 'playoffs') {
      within = (run.po && run.po.results && run.po.results.length) || 0;
    }
    return rank * 1000 + Math.min(999, within);
  }

  function careerProgress(c) { return num(c && c.runs); }
  function dailyProgress(d) { return num(d && d.played); }

  /* ---------------------------------------------------------------------------------------
   * the merges
   * --------------------------------------------------------------------------------------- */

  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : 0; }
  function obj(v) { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; }
  function arr(v) { return Array.isArray(v) ? v : []; }

  /* A stable key for a row, so the union can tell one finished season from another. The sorted
     JSON is what makes the fallback stable: two copies of one legacy row parse their fields in
     whatever order they were written and must still answer the same string.
     AN UNDEFINED VALUE IS NOT A FIELD, and skipping it is load-bearing rather than tidy. A row
     built with `id: undefined` carries the key in memory and loses it the moment it goes
     through JSON, so counting it would give one row two different keys either side of a save
     and the union would hold both. */
  function rowKey(r) {
    if (!r || typeof r !== 'object') return 'x' + String(r);
    if (r.id != null) return 'i' + r.id;
    var keys = Object.keys(r).sort(), out = [], i;
    for (i = 0; i < keys.length; i++) {
      if (r[keys[i]] === undefined) continue;
      out.push(keys[i] + '=' + JSON.stringify(r[keys[i]]));
    }
    return 'c' + out.join('\u0001');
  }

  /* Every distinct row, remote first so that a career over the cap keeps THIS device's most
     recent evidence rather than a stranger's. Which 250 of more than 250 survive is a storage
     question and not a correctness one: the cap is already a documented trade in recordRun. */
  var ROW_CAP = 250;

  function mergeRows(mine, theirs) {
    var seen = {}, out = [], all = arr(theirs).concat(arr(mine)), i, k;
    for (i = 0; i < all.length; i++) {
      k = rowKey(all[i]);
      if (seen[k]) continue;
      seen[k] = 1;
      out.push(all[i]);
    }
    return out.length > ROW_CAP ? out.slice(-ROW_CAP) : out;
  }

  /* A map of key to count, or of key to a small record. Both only ever grow. */
  function mergeCounts(mine, theirs) {
    var a = obj(mine), b = obj(theirs), out = {}, k;
    for (k in a) if (Object.prototype.hasOwnProperty.call(a, k)) out[k] = num(a[k]);
    for (k in b) {
      if (!Object.prototype.hasOwnProperty.call(b, k)) continue;
      out[k] = Math.max(num(out[k]), num(b[k]));
    }
    return out;
  }

  /* THE CLUB AND DECADE SHELVES, where the value is a record rather than a count. bestLabel has
     to follow bestWins rather than being maxed on its own, or a shelf ends up reporting one
     club's win total under another's scoreline. bestWins starts at -1 on a fresh shelf, which
     is why the comparison is on the number and never on the presence of the label. */
  function mergeShelves(mine, theirs) {
    var a = obj(mine), b = obj(theirs), out = {}, k;
    function pick(x, y) {
      x = obj(x); y = obj(y);
      var xb = (typeof x.bestWins === 'number') ? x.bestWins : -1;
      var yb = (typeof y.bestWins === 'number') ? y.bestWins : -1;
      var best = xb >= yb ? x : y;
      return {
        runs: Math.max(num(x.runs), num(y.runs)),
        rings: Math.max(num(x.rings), num(y.rings)),
        bestWins: Math.max(xb, yb),
        bestLabel: best.bestLabel || '',
      };
    }
    for (k in a) if (Object.prototype.hasOwnProperty.call(a, k)) out[k] = pick(a[k], b[k]);
    for (k in b) if (Object.prototype.hasOwnProperty.call(b, k) && !out[k]) out[k] = pick(b[k], a[k]);
    return out;
  }

  var CAREER_MAX = ['runs', 'rings', 'playoffs', 'bestWins', 'bestRating',
    'totalWins', 'totalLosses', 'beat72'];
  /* `feats` is badges.js' map of things a run or a mode proved (a Game 7 won, a
     reunion, a Conquest streak). Every value is a count or a high-water mark,
     so a maximum per key is right for both and never takes a badge away. It is
     on this list because a key missing from all three lists is DROPPED on
     merge, silently: the badge lights on the device that earned it and goes
     dark the first time another device syncs. That is why API_VERSION moved
     to 2 with it, so a page cached from before this cannot run this merge.
     `days` (the days played on, which the arena ladder counts) is the same case
     and moved it to 4. */
  var CAREER_COUNTS = ['clubs', 'shapes', 'seasons', 'colleges', 'feats', 'days'];
  var CAREER_SHELVES = ['byClub', 'byEra'];

  /*
   * MERGE TWO CAREERS. Commutative on everything a badge reads, and idempotent, which is the
   * property that stops a boot from doubling anything.
   *
   * `version` is pinned at 1 and never taken from either side. loadCareer accepts nothing else,
   * so a merged career carrying anything but 1 is a career the page throws away on the next
   * read, silently, leaving somebody with an empty cabinet and no error anywhere.
   */
  function mergeCareer(mine, theirs) {
    var a = obj(mine), b = obj(theirs), out = { version: 1 }, i, k;
    for (i = 0; i < CAREER_MAX.length; i++) {
      k = CAREER_MAX[i];
      out[k] = Math.max(num(a[k]), num(b[k]));
    }
    /* bestLabel follows bestWins for the same reason a shelf's does. */
    out.bestLabel = (num(a.bestWins) >= num(b.bestWins) ? a.bestLabel : b.bestLabel) || '';
    for (i = 0; i < CAREER_COUNTS.length; i++) {
      k = CAREER_COUNTS[i];
      out[k] = mergeCounts(a[k], b[k]);
    }
    for (i = 0; i < CAREER_SHELVES.length; i++) {
      k = CAREER_SHELVES[i];
      if (a[k] || b[k]) out[k] = mergeShelves(a[k], b[k]);
    }
    out.rows = mergeRows(a.rows, b.rows);
    /* `last` is the one field here that is not cumulative: it is a sentence on the front page
       about the run somebody just played. There is no maximum of two of those, so it goes with
       whichever career has played more, and a tie keeps the local one because that is the run
       this device actually watched finish. */
    var pick = num(a.runs) >= num(b.runs) ? a : b;
    if (pick.last) out.last = pick.last;
    return out;
  }

  /*
   * MERGE TWO DAILY RECORDS.
   *
   * The counters max like a career's. What cannot max is the DAY: `done` and `day` together are
   * what refuse a second attempt at today's puzzle, and `streak` is a statement about the most
   * recent day played rather than a high-water mark. All of those come from whichever side has
   * the later day, as one group, or a record ends up claiming today's streak under yesterday's
   * scoreline.
   *
   * `bestStreak` and `best` are high-water marks and do max, which is what keeps a streak the
   * phone set from being lost when the laptop plays today.
   */
  var DAY_FIELDS = ['day', 'iso', 'done', 'streak', 'wins', 'losses', 'label',
    'headline', 'rating', 'ring'];

  function mergeDaily(mine, theirs) {
    var a = obj(mine), b = obj(theirs);
    if (!a.v && !b.v) return null;
    var out = { v: 1 };
    out.played = Math.max(num(a.played), num(b.played));
    out.bestStreak = Math.max(num(a.bestStreak), num(b.bestStreak));
    out.lastDone = Math.max(num(a.lastDone), num(b.lastDone));
    out.best = Math.max(a.best == null ? -1 : num(a.best), b.best == null ? -1 : num(b.best));
    var late = num(a.day) >= num(b.day) ? a : b;
    for (var i = 0; i < DAY_FIELDS.length; i++) {
      if (late[DAY_FIELDS[i]] !== undefined) out[DAY_FIELDS[i]] = late[DAY_FIELDS[i]];
    }
    /* A merged record has played at least as many days as either side, so bestStreak has to
       cover the streak it is carrying or a later max could read as a drop. */
    out.bestStreak = Math.max(out.bestStreak, num(out.streak));
    return out;
  }

  /* ── THE MODES, AND EVERY ONE OF THEM IS ON THE ACCOUNT ─────────────────
   *
   * Conquest, Fix History and Six Passes each keep their own record in the
   * browser (modes-ui.js), and the owner's rule is that nothing a player plays
   * lives on the device alone. So each of those keys is a slot of its own on
   * the same shelf, under the same game, and the browser copy is a cache.
   *
   * TWO KINDS OF SLOT, for the two kinds of record.
   *
   *   merge   a set of finished things (Fix History's days, Six Passes' days,
   *           the Conquest bests). Two devices each hold days the other never
   *           saw, so the answer is the union, and the progress is a measure
   *           that only grows under that union.
   *   clock   a thing in progress (the Conquest run, today's Fix History
   *           season, the endless puzzles). There is one of it, the last one
   *           played is the one that counts, and a device that played it
   *           later has to win. The progress is a counter every write moves on
   *           by one, kept per slot in the browser (`rtf.rev.v1`) and taken
   *           from the shelf on every pull, so it is a clock shared across the
   *           account rather than a device's wall clock.
   *
   * Every payload is { rev, v }, where v is exactly what the browser keeps
   * under the key and null means the record was cleared: a clearing is a
   * write like any other, or a stale device would put the old run back. */
  var MODE_KEYS = {
    'rtf.conquest.v1': 'cq', 'rtf.conquest.best.v1': 'cqbest',
    'rtf.fix.v1': 'fix', 'rtf.fix.run.v2': 'fixrun', 'rtf.fix.endless.v1': 'fixend',
    'rtf.passes.v1': 'passes', 'rtf.passes.endless.v1': 'psend'
  };
  var DAYS_KEPT = 30;

  /* A day store: { days: { dayNumber: record } }, the newest thirty kept. */
  function daysProgress(v) {
    var d = Object.keys(obj(obj(v).days)).map(Number).filter(isFinite);
    if (!d.length) return 0;
    return Math.max.apply(null, d) * 64 + Math.min(63, d.length);
  }
  function capDays(days) {
    var keys = Object.keys(days).map(Number).filter(isFinite).sort(function (a, b) { return a - b; });
    while (keys.length > DAYS_KEPT) delete days[keys.shift()];
    return days;
  }
  /* A Fix History day is a FINISHED result and the board keeps the first one
     filed, so a day both devices hold keeps the shelf's. */
  function mergeFix(mine, theirs) {
    var a = obj(obj(mine).days), b = obj(obj(theirs).days), out = {}, k;
    for (k in a) out[k] = a[k];
    for (k in b) out[k] = b[k];
    var r = Object.assign({}, obj(mine), obj(theirs));
    r.days = capDays(out);
    return r;
  }
  /* A Six Passes day can be half played. Finished beats unfinished, the shelf
     wins between two finished chains, and between two unfinished ones the
     longer chain is the further along. */
  function mergePasses(mine, theirs) {
    var a = obj(obj(mine).days), b = obj(obj(theirs).days), out = {}, k;
    for (k in a) out[k] = a[k];
    for (k in b) {
      var x = obj(out[k]), y = obj(b[k]);
      if (!out[k] || y.done || (!x.done && arr(y.chain).length >= arr(x.chain).length)) out[k] = b[k];
    }
    var r = Object.assign({}, obj(mine), obj(theirs));
    r.days = capDays(out);
    return r;
  }
  function mergeCqBest(mine, theirs) {
    var a = obj(mine), b = obj(theirs);
    return { best: Math.max(num(a.best), num(b.best)), runs: Math.max(num(a.runs), num(b.runs)),
      cleared: Math.max(num(a.cleared), num(b.cleared)) };
  }
  function cqBestProgress(v) { v = obj(v); return num(v.runs) * 1000 + Math.min(999, num(v.best)); }

  var MODE_MERGE = {
    fix: { merge: mergeFix, progress: daysProgress },
    passes: { merge: mergePasses, progress: daysProgress },
    cqbest: { merge: mergeCqBest, progress: cqBestProgress },
  };
  function modeKind(slot) { return MODE_MERGE[slot] ? 'merge' : 'clock'; }
  /* The progress a payload is filed at. */
  function modeProgress(slot, payload) {
    var p = obj(payload);
    if (MODE_MERGE[slot]) return p.v == null ? 0 : MODE_MERGE[slot].progress(p.v);
    return num(p.rev);
  }
  /* What two copies of a merge slot come to. Null and null is null. */
  function modeMerge(slot, mine, theirs) {
    if (!MODE_MERGE[slot]) return null;
    if (mine == null) return theirs == null ? null : theirs;
    if (theirs == null) return mine;
    return MODE_MERGE[slot].merge(mine, theirs);
  }

  var publicAPI = {
    API_VERSION: 4,
    MODE_KEYS: MODE_KEYS, modeKind: modeKind, modeProgress: modeProgress, modeMerge: modeMerge,
    GAME: GAME,
    SLOT_RUN: SLOT_RUN, SLOT_CAREER: SLOT_CAREER, SLOT_DAILY: SLOT_DAILY,
    ROW_CAP: ROW_CAP,
    runProgress: runProgress, careerProgress: careerProgress, dailyProgress: dailyProgress,
    mergeCareer: mergeCareer, mergeDaily: mergeDaily, mergeRows: mergeRows, rowKey: rowKey,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = publicAPI;
  if (typeof window !== 'undefined') window.RTF_CLOUD = publicAPI;
})();
