/* Shut The Door: the vote for tomorrow's daily and Survivor's sequence. Pure.
 * Browser: window.STD_MODES, after contract.js and rng.js. Node: require('./modes.js').
 *
 * Both answer from the day alone, so every device and the server agree without asking anyone.
 *
 * THE VOTE (CONTRACT.md section 16). From VOTE.EPOCH on, each day's daily is one of two
 * candidates, chosen the day before by a vote of signed-in players who finished that day's daily.
 * The candidates for day D are the packs nobody was offered (or given, before the vote began)
 * on any of the VOTE.WINDOW days before D, ordered by the site's hashSeed of
 * 'shut-the-door-vote-' + D + '-' + id, the first two. The first is A. A pack that was played was
 * offered, so nothing played in the last WINDOW days comes back. With 30 packs and two offered a
 * day, at least 30 - 2 x 13 = 4 are eligible each day, so the pairs vary.
 *
 * The server (supabase/160_shut_the_door_vote_survivor.sql, shutdoor_vote_candidates) runs the
 * same rule over the same list, and locks the winner once the day begins: more votes wins, and
 * no votes or a tie is A. A page that cannot reach the server plays A, the default. test/modes.mjs
 * holds the two to the same answers (fixtures/vote-candidates.json).
 *
 * SURVIVOR (CONTRACT.md section 17). Run r of day D plays the packs in the order of a
 * Fisher-Yates shuffle of the rotation, from mulberry32(hashSeed('shut-the-door-survivor-' + D +
 * '-' + r + '-' + cycle)), one cycle of every pack before the next shuffle. Situation i of the run
 * is played on seed hashSeed('shut-the-door-survivor-' + D + '-' + r + '-' + i). Run 0 is the
 * day's run, the same for everyone; a Pro player's further runs are 1, 2, ... A door shut is a
 * save and goes on; anything else (a held tie too, as in the daily's streak) ends the run.
 */
(function () {
  'use strict';
  const NODE = typeof module !== 'undefined' && module.exports;
  const C = NODE ? require('./contract.js') : window.STD_CONTRACT;
  const R = NODE ? require('./rng.js') : window.STD_RNG;

  /* EPOCH: the first day picked by a vote (votes for it are cast the day before). The same date is
     in shutdoor_vote_epoch() in the SQL; test/modes.mjs reads both. Move them together, and only
     to a day after the SQL has run and the page has shipped. */
  const VOTE = Object.freeze({ EPOCH: '2026-11-16', WINDOW: 13, PREFIX: 'shut-the-door-vote-' });
  const SURVIVOR = Object.freeze({ PREFIX: 'shut-the-door-survivor-', CONTINUES: 'door_shut' });

  const addDays = (day, n) => new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) + n * 86400000)
    .toISOString().slice(0, 10);

  /* The day's pack before the vote: the schedule's own entry, else the rotation from the epoch
     (the days before it, the previews, walk the rotation they were served from). */
  function fixedPack(sch, day) {
    if (sch.days && sch.days[day]) return sch.days[day].pack;
    const off = C.dayOffsetOf(day);
    const rot = off < 0 && sch.previewRotation ? sch.previewRotation : sch.rotation;
    const L = rot.length;
    return rot[((off % L) + L) % L];
  }

  function voteOpen(day) { return day >= VOTE.EPOCH; }

  /* candidates(sch, day) -> [A, B], for a day on or after VOTE.EPOCH (null before). Memoised per
     schedule object, since each day reads the WINDOW days before it. */
  const memo = new WeakMap();
  function candidates(sch, day) {
    if (!voteOpen(day)) return null;
    let m = memo.get(sch);
    if (!m) { m = new Map(); memo.set(sch, m); }
    if (m.has(day)) return m.get(day).slice();
    // fill forward from the epoch (or the last day known), so no recursion runs deep
    let d = VOTE.EPOCH;
    while (m.has(d) && d < day) d = addDays(d, 1);
    for (; d <= day; d = addDays(d, 1)) {
      const seen = new Set();
      for (let k = 1; k <= VOTE.WINDOW; k++) {
        const p = addDays(d, -k);
        if (voteOpen(p)) m.get(p).forEach(x => seen.add(x));
        else seen.add(fixedPack(sch, p));
      }
      const eligible = sch.rotation.map((id, i) => ({ id, i, h: R.hashSeed(VOTE.PREFIX + d + '-' + id) }))
        .filter(x => !seen.has(x.id))
        .sort((a, b) => a.h - b.h || a.i - b.i);
      m.set(d, [eligible[0].id, eligible[1].id]);
    }
    return m.get(day).slice();
  }

  /* The day's daily with no word from the server: the fixed pack, or candidate A. */
  function defaultPack(sch, day) { return voteOpen(day) ? candidates(sch, day)[0] : fixedPack(sch, day); }

  /* Survivor: the pack and the seed of situation i of run r on day D. */
  function survivorOrder(sch, day, run, cycle) {
    const rnd = R.mulberry32(R.hashSeed(SURVIVOR.PREFIX + day + '-' + run + '-' + cycle));
    const a = sch.rotation.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function survivorAt(sch, day, run, i) {
    const L = sch.rotation.length;
    return {
      pack: survivorOrder(sch, day, run, Math.floor(i / L))[i % L],
      seed: R.hashSeed(SURVIVOR.PREFIX + day + '-' + run + '-' + i),
    };
  }

  const api = { VOTE, SURVIVOR, addDays, fixedPack, voteOpen, candidates, defaultPack, survivorAt };
  if (NODE) module.exports = api;
  if (typeof window !== 'undefined') window.STD_MODES = api;
})();
