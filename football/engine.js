/* ============================================================================
   RunTheDrive — RESOLUTION ENGINE
   ----------------------------------------------------------------------------
   Turns (play call + defensive call + situation) into an outcome, grades the
   CALL rather than the OUTCOME, runs the drive, and emits the share card.

   All constants measured from real football play-by-play + charting, 2016-2025.
   Deterministic: same date + same player decisions -> same result, every user.

   Two ways to drive it:
     runDrive(date, scheme, policy)      -> a full bot-played drive (validation)
     createDrive(date, schemeKey)        -> an interactive, player-called drive

   Browser + Node compatible. Node: require('./engine.js'). Browser: RTD_ENGINE.
   ========================================================================== */
(function (root, factory) {
  let GEN, PLAYBOOK;
  if (typeof module === 'object' && module.exports) {
    GEN = require('./drive_generator.js');
    PLAYBOOK = require('./playbook.js');
    module.exports = factory(GEN, PLAYBOOK);
  } else {
    GEN = root.RTD_GEN; PLAYBOOK = root.RTD_PLAYBOOK;
    root.RTD_ENGINE = factory(GEN, PLAYBOOK);
  }
}(typeof self !== 'undefined' ? self : this, function (GEN, PLAYBOOK) {
  'use strict';
  const { fnv1a, mulberry32, generateDailyDrive, defensiveCall, buildBlitzSlots } = GEN;
  // Read a numeric tuning knob from the environment when running under Node (sims/tests);
  // fall back to the default in the browser. NOTE: `&&`-chained env reads return `false` in
  // the browser (process is undefined), and `false ?? d` is `false` → Number(false) = 0 — a
  // silent zeroing bug. This helper defaults correctly whenever the var isn't a real value.
  function envNum(key, dflt){
    if (typeof process !== 'undefined' && process.env && process.env[key] != null && process.env[key] !== '')
      return Number(process.env[key]);
    return dflt;
  }

  /* ---------- 1. DEFENSIVE COLUMN MODIFIERS -------------------------------
     Measured success-rate deltas vs the BASE_7 column, by offensive archetype.
     Source: 108,114 charted plays.                                          */
  const DEF_MOD = {
    //                 BASE_7  LIGHT_BOX  HEAVY_BOX  BLITZ_LIGHT  HEAVY_BLITZ
    RUN:          { BASE_7:0.0, LIGHT_BOX:+1.4, HEAVY_BOX:+1.1, BLITZ_LIGHT_BOX:-3.0, HEAVY_BLITZ:-5.0 },
    QB_SNEAK:     { BASE_7:0.0, LIGHT_BOX:-4.3, HEAVY_BOX:+5.7, BLITZ_LIGHT_BOX:-2.0, HEAVY_BLITZ:-2.0 },
    SCREEN:       { BASE_7:0.0, LIGHT_BOX:-9.3, HEAVY_BOX: 0.0, BLITZ_LIGHT_BOX:-7.2, HEAVY_BLITZ:+3.8 },
    QUICK:        { BASE_7:0.0, LIGHT_BOX:-3.7, HEAVY_BOX:-2.3, BLITZ_LIGHT_BOX:-1.6, HEAVY_BLITZ:-2.4 },
    INTERMEDIATE: { BASE_7:0.0, LIGHT_BOX:-1.0, HEAVY_BOX:-1.4, BLITZ_LIGHT_BOX:-3.3, HEAVY_BLITZ:-5.9 },
    PLAY_ACTION:  { BASE_7:0.0, LIGHT_BOX:-0.7, HEAVY_BOX:+2.2, BLITZ_LIGHT_BOX:-4.1, HEAVY_BLITZ:-4.4 },
    DEEP:         { BASE_7:0.0, LIGHT_BOX:-5.7, HEAVY_BOX:-5.3, BLITZ_LIGHT_BOX:-10.4, HEAVY_BLITZ:-10.8 },
  };
  // Disaster-rate deltas (blitz creates sacks; heavy boxes create TFLs)
  const DEF_DISASTER = {
    BASE_7: 0.0, LIGHT_BOX: +0.6, HEAVY_BOX: +1.8, BLITZ_LIGHT_BOX: +5.2, HEAVY_BLITZ: +8.4,
  };

  /* ---------- CONCEPT vs COVERAGE ------------------------------------------
     Every pass play is a real CONCEPT, and each concept beats some coverage
     shells and dies to others — the football rock-paper-scissors that makes
     reading the defense matter. The defense shows a shell per snap (PRESS/OFF
     man, ONE_HIGH/TWO_HIGH/SOFT zone, or a BLITZ); calling the concept that
     beats today's shell is where a skilled player separates from a guesser.   */
  const CONCEPT = {
    'Four Verts':'VERTS','Switch Verts':'VERTS','Go Ball':'VERTS','Max Protect Shot':'VERTS',
    'Double Post':'POSTS','Shot Post':'POSTS','Play Pass Post':'POSTS','PA Deep Shot':'POSTS','Yankee':'POSTS',
    'Y-Cross':'CROSS','Deep Cross':'CROSS','Deep Over':'CROSS',
    'Mesh':'MESH','Shallow Cross':'MESH','Drive':'MESH','Drift':'MESH',
    'Stick':'STICK','Snag':'SNAG','Curl-Flat':'HILO',
    'Flat-Corner':'SMASH','Sail':'FLOOD','Boot Flood':'FLOOD','Naked Flood':'FLOOD',
    'Dagger':'DAGGER','Dig':'DAGGER','Post-Dig':'DAGGER',
    'Slant-Flat':'SLANT','Quick Slant':'SLANT','Glance RPO':'SLANT','PA Glance':'SLANT',
    'Pop Pass':'SEAM','Hitch-Seam':'SEAM','PA Seam':'SEAM',
    'Hitch':'HITCH','Deep Comeback':'COMEBACK','Back Shoulder':'FADE','Texas (RB Angle)':'ANGLE',
    'Six (Post-Wheel)':'WHEEL','Y-Leak':'LEAK',
    'Waggle':'BOOT','Naked Boot':'BOOT','Boot Over':'BOOT',
    'Bubble Screen':'SCREEN','Bubble RPO':'SCREEN','Tunnel Screen':'SCREEN','Jet Screen':'SCREEN',
    'Halfback Screen':'SCREEN','Slide Screen':'SCREEN',
  };
  // success delta by shell (+ beats it). dp = a big-play concept (explosive scales up on a good matchup).
  const COVER_MOD = {
    VERTS:   {ONE_HIGH:+12, TWO_HIGH:-11, PRESS:+4,  OFF:-3,  SOFT:-5,  BLITZ:-8,  dp:1},
    POSTS:   {ONE_HIGH:+11, TWO_HIGH:-9,  PRESS:+3,  OFF:-1,  SOFT:-4,  BLITZ:-9,  dp:1},
    CROSS:   {ONE_HIGH:+5,  TWO_HIGH:+8,  PRESS:+7,  OFF:+2,  SOFT:+2,  BLITZ:-3,  dp:1},
    MESH:    {ONE_HIGH:0,   TWO_HIGH:-2,  PRESS:+12, OFF:+8,  SOFT:-2,  BLITZ:+3},
    STICK:   {ONE_HIGH:+6,  TWO_HIGH:+2,  PRESS:-4,  OFF:+2,  SOFT:+8,  BLITZ:+2},
    SNAG:    {ONE_HIGH:+4,  TWO_HIGH:+5,  PRESS:-3,  OFF:+3,  SOFT:+9,  BLITZ:+2},
    HILO:    {ONE_HIGH:+5,  TWO_HIGH:+2,  PRESS:-4,  OFF:+3,  SOFT:+8,  BLITZ:0},
    SMASH:   {ONE_HIGH:-6,  TWO_HIGH:+12, PRESS:+2,  OFF:+4,  SOFT:+3,  BLITZ:-4,  dp:1},
    FLOOD:   {ONE_HIGH:+4,  TWO_HIGH:+8,  PRESS:-6,  OFF:-2,  SOFT:+9,  BLITZ:-4,  dp:1},
    DAGGER:  {ONE_HIGH:+5,  TWO_HIGH:+7,  PRESS:-2,  OFF:+4,  SOFT:+6,  BLITZ:-4,  dp:1},
    SLANT:   {ONE_HIGH:+3,  TWO_HIGH:+3,  PRESS:+10, OFF:-4,  SOFT:-2,  BLITZ:+12},
    SEAM:    {ONE_HIGH:+8,  TWO_HIGH:-4,  PRESS:+4,  OFF:+2,  SOFT:+2,  BLITZ:+2,  dp:1},
    HITCH:   {ONE_HIGH:+2,  TWO_HIGH:+4,  PRESS:-8,  OFF:+10, SOFT:+8,  BLITZ:+2},
    COMEBACK:{ONE_HIGH:+2,  TWO_HIGH:+5,  PRESS:-6,  OFF:+9,  SOFT:+6,  BLITZ:-6},
    FADE:    {ONE_HIGH:+2,  TWO_HIGH:+3,  PRESS:+8,  OFF:-2,  SOFT:-2,  BLITZ:-4,  dp:1},
    ANGLE:   {ONE_HIGH:0,   TWO_HIGH:0,   PRESS:+8,  OFF:+2,  SOFT:+1,  BLITZ:+4},
    WHEEL:   {ONE_HIGH:+3,  TWO_HIGH:+3,  PRESS:+8,  OFF:0,   SOFT:0,   BLITZ:-4,  dp:1},
    LEAK:    {ONE_HIGH:+3,  TWO_HIGH:+6,  PRESS:+2,  OFF:+3,  SOFT:+4,  BLITZ:-2},
    BOOT:    {ONE_HIGH:+6,  TWO_HIGH:-2,  PRESS:+8,  OFF:+5,  SOFT:-3,  BLITZ:-10},
    SCREEN:  {ONE_HIGH:-3,  TWO_HIGH:-6,  PRESS:-3,  OFF:+2,  SOFT:-4,  BLITZ:+15},
  };
  // Per-scheme parity edge (success delta). Football reality: scheme is a STYLE, not a
  // difficulty setting — West Coast, Air Raid, the Coryell vertical game and the wide-zone
  // run game have all won at the highest level. So these edges compress every playbook to a
  // similar SCORING mean for a skilled reader (~40% TD, ~2pt spread in sim), while the plays'
  // own explosive/turnover rates keep each scheme's VARIANCE identity: the vertical and
  // air-raid books boom-and-bust (more explosives, more empty drives), West Coast and the
  // RPO spread grind steadier. Tuned against a coverage-reading bot at DIFFICULTY -9.
  let SCHEME_EDGE = { WEST_COAST:+3, SMASH_MOUTH:+4, WIDE_ZONE:-6, AIR_RAID:+5, SPREAD_OPTION:+3, VERTICAL:-6 };
  try { if (typeof process !== 'undefined' && process.env && process.env.RTD_EDGE) SCHEME_EDGE = JSON.parse(process.env.RTD_EDGE); } catch (_) {}
  function conceptOf(play){ return CONCEPT[play.name] || null; }
  const COVER_SCALE = envNum('RTD_COVER', 1.5);   // how hard the concept↔coverage matchup swings the play
  // Which route concepts each pass archetype tends to carry — lets the scouting
  // rating account for the concept↔coverage matchup (not just the box), so the
  // matchup screen's advice matches what the resolver actually does at the snap.
  const ARCH_CONCEPTS = {
    QUICK:        ['SLANT','STICK','SNAG','HITCH','MESH','HILO'],
    INTERMEDIATE: ['CROSS','DAGGER','SMASH','FLOOD','COMEBACK','LEAK','SEAM'],
    PLAY_ACTION:  ['POSTS','BOOT','SEAM','SLANT'],
    DEEP:         ['VERTS','POSTS','FADE','WHEEL'],
    SCREEN:       ['SCREEN'],
  };
  // Expected mix of coverage shells for the day (mirrors drive_generator.coverageShell,
  // averaged over the down/distance the drive will actually see).
  function shellMix(gp){
    const blitz = Math.max(0, Math.min(0.6, gp.blitzRate != null ? gp.blitzRate : 0.24));
    const cov = gp.coverage;
    let base;
    if (cov === 'MAN')       base = { PRESS:0.55, OFF:0.45 };
    else if (cov === 'ZONE') base = { ONE_HIGH:0.34, TWO_HIGH:0.42, SOFT:0.24 };
    else                     base = { ONE_HIGH:0.18, PRESS:0.22, TWO_HIGH:0.24, OFF:0.18, SOFT:0.18 };
    const mix = {}; for (const k in base) mix[k] = base[k] * (1 - blitz);
    mix.BLITZ = (mix.BLITZ || 0) + blitz;
    return mix;
  }
  function archCoverageMod(arch, gp){
    const cs = ARCH_CONCEPTS[arch]; if (!cs) return 0;        // runs/sneak: box handles it, no shell term
    const mix = shellMix(gp); let total = 0, n = 0;
    for (const c of cs){ const m = COVER_MOD[c]; if (!m) continue;
      let v = 0; for (const sh in mix) v += (m[sh] || 0) * mix[sh]; total += v; n++; }
    return n ? (total / n) * COVER_SCALE : 0;
  }
  function coverageMod(play, def){
    const c = conceptOf(play); if (!c) return 0;              // runs: shell doesn't apply (box handles it)
    const m = COVER_MOD[c]; if (!m) return 0;
    const key = def.isBlitz ? 'BLITZ' : (def.shell || 'ONE_HIGH');
    return (m[key] || 0) * COVER_SCALE;
  }

  /* ---------- 2. SITUATIONAL MODEL -----------------------------------------
     Each play carries its own measured success-by-distance curve, so a play's
     situational strength is DATA, not an archetype guess. Outside Zone converts
     64.3% at 1-2 yards but 41.0% at 10+; a QB Sneak is elite at the sticks and
     hopeless on 3rd-and-10 — and the numbers say exactly that per play. We use
     that curve directly, then layer a small residual DOWN term for the extra
     squeeze of a later down that pure distance doesn't capture (the defense
     knows you have to throw, the pocket shrinks). Source: 262,841 plays.      */
  function distBucket(d){ return d <= 2 ? '1-2' : d <= 6 ? '3-6' : d <= 9 ? '7-9' : '10+'; }

  // How much better/worse this play is at THIS distance vs its own across-distance
  // average — i.e. the SHAPE of its distance curve only. (The absolute level lives in
  // play.success_pct; success_by_distance is keyed to the pass air-band, not the play,
  // so subtracting success_pct here would double-count the level and gut high-success
  // plays. Centering on the curve's own mean keeps only the distance dependence.)
  function specialization(play, distance) {
    const sbd = play.success_by_distance;
    if (!sbd) return 0;
    const v = sbd[distBucket(distance)];
    if (v == null) return 0;
    const vals = Object.keys(sbd).map(k => sbd[k]);
    const mean = vals.reduce((s, x) => s + x, 0) / vals.length;
    return v - mean;
  }
  // Residual down pressure NOT already living in the distance curve.
  function downPressureMod(archetype, down, distance) {
    const isRun = archetype === 'RUN' || archetype === 'QB_SNEAK';
    let m = 0;
    if (down >= 3) {
      if (distance >= 10)      m += isRun ? -6.5 : -8.5;   // desperate down & long
      else if (distance >= 7)  m += isRun ? -3.5 : -4.5;
      // 3rd/4th & short is already rewarded by the play's own distance curve
    } else if (down === 2) {
      if (distance >= 10)      m += -2.5;
    }
    return m;
  }
  // Kept as a thin compatibility shim (archetype-level, used nowhere critical).
  function situationalMod(archetype, down, distance) {
    return downPressureMod(archetype, down, distance);
  }

  /* Predictability. Lean on one kind of call and the defense keys on it — they
     jump the route, fit the run, tee off. Real football, and the reason a good
     drive mixes looks. `sit.tendency[archetype]` is a negative success delta the
     drive computes from your recent calls; the grader sees the same map, so it
     rewards the call the defense ISN'T sitting on. This is what keeps spamming
     one button measurably worse than reading the game. */
  const TENDENCY_PENALTY = -8;   // per repeat of an archetype within the last 3 calls
  function tendencyMap(recentArchetypes) {
    const last = recentArchetypes.slice(-3);
    const counts = {};
    for (const a of last) counts[a] = (counts[a] || 0) + 1;
    const out = {};
    for (const a in counts) out[a] = TENDENCY_PENALTY * counts[a];
    return out;
  }

  // The single source of truth for a play's effective success%, shared by the
  // resolver AND the grader so a call can never be graded on different math than
  // it's resolved on. Box lives in def.column; qualityMod is the day's matchup
  // edge; sit.tendency is the defense keying on what you keep calling.
  function successRate(play, def, sit, qualityMod) {
    const a = play.archetype;
    return play.success_pct
         + (DEF_MOD[a]?.[def.column] ?? 0)
         + coverageMod(play, def)                      // did the concept beat today's coverage shell?
         + (sit.scheme ? (SCHEME_EDGE[sit.scheme] || 0) : 0)   // per-scheme parity edge
         + specialization(play, sit.distance)
         + downPressureMod(a, sit.down, sit.distance)
         + (sit.tendency ? (sit.tendency[a] || 0) : 0)
         + (qualityMod || 0) * 100 + DIFFICULTY;
  }

  /* ---------- 3. YARDAGE DISTRIBUTIONS ------------------------------------- */
  const YARDS = {
    RUN:          {EXPLOSIVE:[2,6,12,19,29,66], SUCCESS:[2,4,6,8,11,16],  FAILURE:[0,1,2,3,4,7],  DISASTER:[-4,-3,-1,0,1,7]},
    QB_SNEAK:     {EXPLOSIVE:[1,2,3,5,9,20],    SUCCESS:[1,1,2,2,3,5],    FAILURE:[0,0,0,1,1,2],  DISASTER:[-3,-2,-1,0,0,1]},
    SCREEN:       {EXPLOSIVE:[5,9,14,20,28,55], SUCCESS:[5,6,7,9,12,17],  FAILURE:[0,0,0,3,5,10], DISASTER:[-4,-2,0,0,2,7]},
    QUICK:        {EXPLOSIVE:[7,11,16,23,34,62],SUCCESS:[5,6,8,11,14,19], FAILURE:[0,0,0,1,5,10], DISASTER:[-9,-5,0,0,0,8]},
    INTERMEDIATE: {EXPLOSIVE:[8,13,18,25,36,64],SUCCESS:[7,9,11,14,17,22],FAILURE:[0,0,0,0,2,8],  DISASTER:[-10,-7,0,0,0,6]},
    PLAY_ACTION:  {EXPLOSIVE:[9,14,19,27,38,68],SUCCESS:[6,8,10,13,16,21],FAILURE:[0,0,0,1,4,9],  DISASTER:[-10,-6,0,0,0,7]},
    DEEP:         {EXPLOSIVE:[16,22,30,40,52,79],SUCCESS:[12,15,18,21,24,30],FAILURE:[0,0,0,0,0,4],DISASTER:[-12,-8,0,0,0,5]},
  };
  const PCTS = [0.10,0.25,0.50,0.75,0.90,0.99];

  function sampleYards(archetype, bucket, r) {
    const band = (YARDS[archetype] || YARDS.RUN)[bucket];
    for (let i = 0; i < PCTS.length; i++) if (r <= PCTS[i]) {
      if (i === 0) return band[0];
      const lo = band[i-1], hi = band[i];
      const t = (r - PCTS[i-1]) / (PCTS[i] - PCTS[i-1]);
      return Math.round(lo + t * (hi - lo));
    }
    return band[band.length - 1];
  }

  /* ---------- 4. RESOLVE ONE PLAY ------------------------------------------ */
  function resolvePlay(play, def, sit, rng, qualityMod) {
    const a = play.archetype;
    let sr = successRate(play, def, sit, qualityMod);
    let ex = play.explosive_pct;
    let ds = play.disaster_pct + (DEF_DISASTER[def.column] ?? 0);

    sr = Math.max(3, Math.min(94, sr));
    // Explosive is a SUBSET of success — scale it with the effective success rate so a
    // matchup that lowers success also lowers the big-play chance (instead of the old
    // min(sr-1) clamp, which let explosive cannibalize the whole success band).
    // Gentler than a raw proportion: explosive tracks success but doesn't run away when
    // success is high (which was over-rewarding the all-deep schemes).
    ex = play.explosive_pct * (0.45 + 0.55 * (sr / Math.max(1, play.success_pct)));
    // A big-play concept that wins its coverage matchup breaks more explosives (verticals
    // vs single-high, smash vs two-high, screens vs the blitz).
    const cc = COVER_MOD[conceptOf(play)];
    if (cc && cc.dp) { const cm = coverageMod(play, def); if (cm > 0) ex *= 1 + Math.min(0.3, cm / 80); }
    ex = Math.max(0.5, Math.min(sr * 0.62, ex));
    ds = Math.max(0.5, Math.min(60, ds));
    const succ = Math.max(0.5, sr - ex);
    const fail = Math.max(0.5, 100 - ex - succ - ds);
    const total = ex + succ + fail + ds;

    const roll = rng() * total;
    let bucket;
    if (roll < ex) bucket = 'EXPLOSIVE';
    else if (roll < ex + succ) bucket = 'SUCCESS';
    else if (roll < ex + succ + fail) bucket = 'FAILURE';
    else bucket = 'DISASTER';

    let yards = sampleYards(a, bucket, rng());
    let turnover = null;

    if (bucket === 'DISASTER') {
      const isPass = !['RUN','QB_SNEAK'].includes(a);
      const toChance = (play.turnover_pct / 100) / Math.max(0.05, ds / 100);
      if (rng() < Math.min(0.55, toChance)) {
        turnover = isPass ? 'INTERCEPTION' : 'FUMBLE';
        yards = 0;
      }
    }
    // measured: 0.8% of designed runs are aborted snaps, ~100% of them fumbles
    if (!turnover && ['RUN','QB_SNEAK'].includes(a) && rng() < 0.008) {
      turnover = 'ABORTED_SNAP'; yards = 0;
    }
    const isPass = !['RUN','QB_SNEAK'].includes(a);
    const sack = bucket === 'DISASTER' && isPass && yards < 0 && !turnover;
    // A pass that falls incomplete (no gain, not a sack) stops the game clock.
    const incomplete = isPass && bucket === 'FAILURE' && yards <= 0 && !turnover && !sack;
    return { bucket, yards, turnover, sack, incomplete, effectiveSuccessPct: +sr.toFixed(1) };
  }

  /* ---------- 5. GRADE THE CALL, NOT THE OUTCOME ---------------------------
     Compare the expected value of the play you chose against the best play
     available in your call sheet, using ONLY what the player could see (box
     count is visible; the blitz is not). A great call that gets unlucky still
     grades well. That is the whole point. EV is DRIVE-aware, not play-aware:
     it rewards moving the chains plus yardage, penalises turnover risk.       */
  function bucketProbs(play, def, sit, qualityMod) {
    let sr = Math.max(3, Math.min(94, successRate(play, def, sit, qualityMod)));
    let ex = Math.max(0.5, Math.min(sr - 1, play.explosive_pct));
    let ds = Math.max(0.5, Math.min(60, play.disaster_pct + (DEF_DISASTER[def.column] ?? 0)));
    const succ = Math.max(0.5, sr - ex);
    const fail = Math.max(0.5, 100 - ex - succ - ds);
    const t = ex + succ + fail + ds;
    return { EXPLOSIVE: ex/t, SUCCESS: succ/t, FAILURE: fail/t, DISASTER: ds/t };
  }
  function pGain(archetype, bucket, need) {
    const band = (YARDS[archetype] || YARDS.RUN)[bucket];
    let hits = 0;
    for (let i = 0; i < band.length; i++) if (band[i] >= need) hits++;
    return hits / band.length;
  }
  function expectedValue(play, def, sit, qualityMod) {
    const a = play.archetype;
    const P = bucketProbs(play, def, sit, qualityMod);
    const need = sit.distance;
    let pFirst = 0, expYds = 0;
    for (const b of ['EXPLOSIVE','SUCCESS','FAILURE','DISASTER']) {
      pFirst += P[b] * pGain(a, b, need);
      const band = (YARDS[a] || YARDS.RUN)[b];
      expYds += P[b] * (band[2]);              // median of the band
    }
    const toRisk = play.turnover_pct / 100;
    const downPressure = sit.down >= 3 ? 1.9 : sit.down === 2 ? 1.15 : 1.0;
    return 100 * pFirst * downPressure + 3.2 * expYds - 55 * toRisk;
  }
  function gradeCall(chosen, playbook, visibleDef, sit, qualityMod) {
    const evs = playbook.map(p => expectedValue(p, visibleDef, sit, qualityMod));
    const best = Math.max(...evs), worst = Math.min(...evs);
    const mine = expectedValue(chosen, visibleDef, sit, qualityMod);
    const pct = best === worst ? 1 : (mine - worst) / (best - worst);
    let letter = 'F';
    if (pct >= 0.95) letter = 'A+'; else if (pct >= 0.85) letter = 'A';
    else if (pct >= 0.72) letter = 'B'; else if (pct >= 0.55) letter = 'C';
    else if (pct >= 0.35) letter = 'D';
    return { letter, percentile: +(pct*100).toFixed(1), ev: +mine.toFixed(1), bestEv: +best.toFixed(1) };
  }

  /* ---------- 6. RULES + GLOBAL DIFFICULTY --------------------------------- */
  // A 2:00 drive clock (a two-minute-drill feel). secPerPlay is scaled to match so the same
  // ~8 plays still fit before time expires (a 2:00 clock at the old ~35s/play would cut the
  // drive to ~3 snaps). Incompletions still stop the clock (see resolvePlay).
  const RULES = { downs:4, timeouts:2, gameClockSec:120, playClockSec:40,
                  fgMaxYards:58, secPerPlay:{run:15, pass:13} };

  /* RunTheDrive has no punt — every 4th down is a conversion attempt or a kick,
     where real offenses punt on 42.6% of drives. That alone inflates scoring
     well above the real 23.5% TD rate. This single constant scales success
     rates so a SKILLED player lands on the target TD rate. Solved by
     simulation (see simulator.js), not guessed. Raise it to make it easier. */
  let DIFFICULTY = envNum('RTD_DIFFICULTY', -9.0);   // tuned so a skilled coverage-reader tops out ~40% TD (challenging), careless play is punished hard
  function setDifficulty(v){ DIFFICULTY = v; }
  function getDifficulty(){ return DIFFICULTY; }

  function fgMakeProb(fgDist) {
    return Math.max(0.35, Math.min(0.98, 1.62 - 0.0155 * fgDist));
  }

  /* ---------- 7. CALL SHEET ------------------------------------------------
     Turn a 12-play scheme into the compact set of calls the player taps. Each
     tile is a REAL play carrying its own measured numbers; the button title is
     the archetype, the subtitle is the actual play name (as in the mockup).   */
  const SNEAK_PLAY = {
    name: 'QB Sneak', archetype: 'QB_SNEAK', signature: 'SNEAK', formation: 'Under Center',
    tags: [], success_pct: 74.0, explosive_pct: 20.0, disaster_pct: 13.0, avg_yards: 1.7,
    epa: 0.3, turnover_pct: 0.6, turnover_type: 'fumble',
    success_by_distance: { '1-2':78.0, '3-6':45.0, '7-9':20.0, '10+':15.0 },
  };

  function pickBest(plays, pred) {
    const c = plays.filter(pred);
    if (!c.length) return null;
    return c.slice().sort((a,b) => b.epa - a.epa)[0];
  }
  function buildCallSheet(schemeKey) {
    const scheme = PLAYBOOK.schemes[schemeKey];
    const P = scheme.plays;
    // Surface the FULL 12-play scheme as the call sheet — every play is a real,
    // tappable option. Group by play type (run → short → intermediate → shots) and
    // lead each group with its best-EPA option so the sheet reads left-to-right.
    const ORDER = { RUN:0, QB_SNEAK:1, QUICK:2, SCREEN:3, INTERMEDIATE:4, PLAY_ACTION:5, DEEP:6 };
    // Usage caps: a premium call loses its edge if you lean on it every snap —
    // defenses adjust, and you can't run play-action without ever running. Caps are
    // per drive and per TILE; RUN / quick / intermediate are unlimited (you can always
    // do the ordinary thing). Anti-spam still bites across same-type plays via the
    // tendency penalty, so multiple deep tiles don't become a deep-ball loophole.
    const CAP = { DEEP:3, PLAY_ACTION:3, SCREEN:3, QB_SNEAK:2 };
    const tiles = P.slice()
      .sort((a,b) => ((ORDER[a.archetype]!=null?ORDER[a.archetype]:9) - (ORDER[b.archetype]!=null?ORDER[b.archetype]:9)) || b.epa - a.epa)
      .map((play, i) => ({ id: 'p'+i, play, cap: CAP[play.archetype] || Infinity }));
    // Title each tile by the play's REAL archetype so the label never lies about
    // what it does (e.g. a scheme with no true deep ball shows MID PASS, not DEEP).
    const TITLE = { RUN:'RUN', QB_SNEAK:'QB SNEAK', QUICK:'QUICK PASS', SCREEN:'SCREEN',
                    INTERMEDIATE:'MID PASS', DEEP:'DEEP SHOT', PLAY_ACTION:'PLAY ACTION' };
    tiles.forEach(t => { t.title = TITLE[t.play.archetype] || t.play.archetype; });
    // de-dupe: if two tiles resolved to the same play, keep the first
    const seen = new Set(); const out = [];
    for (const t of tiles) { const k = t.play.name + '|' + t.play.signature;
      if (seen.has(k)) continue; seen.add(k); out.push(t); }
    return out;
  }

  /* ---------- 8. INTERACTIVE, PLAYER-CALLED DRIVE -------------------------- */
  function createDrive(dateStr, schemeKey, opts = {}) {
    const day = generateDailyDrive(dateStr);
    const gp  = day._hiddenGameplan;
    const budget = buildBlitzSlots(dateStr, gp);
    const scheme = PLAYBOOK.schemes[schemeKey];
    const schemeBoxDraw = scheme.box_draw;
    const callSheet = buildCallSheet(schemeKey);
    const used = {};                                  // tileId -> times called
    callSheet.forEach(t => { used[t.id] = 0; });
    const rng = mulberry32(fnv1a(`${dateStr}|drive|${opts.salt||0}`));

    let yardline = day.field.ownYard, down = 1, distance = 10;
    let clock = RULES.gameClockSec, playNo = 1;
    let over = false, result = null, toType = null;
    const log = [], grades = [], recent = [];   // recent[] = archetypes called

    const remaining = (t) => t.cap === Infinity ? Infinity : Math.max(0, t.cap - used[t.id]);
    const availableTiles = () => callSheet.filter(t => remaining(t) > 0);

    // Deterministic pre-snap defensive read for the CURRENT down (no play seen).
    // The defense knows what scheme it's facing, so scheme box-draw feeds in.
    function currentDefense() {
      return defensiveCall(dateStr, gp, playNo, down, distance, 1, budget.slots, schemeBoxDraw);
    }
    function fgInfo() {
      const dist = (100 - yardline) + 17;
      return { dist, inRange: dist <= RULES.fgMaxYards, makePct: Math.round(fgMakeProb(dist) * 100) };
    }
    function snapshot(extra) {
      return Object.assign({
        date: dateStr, scheme: schemeKey, yardline, down, distance, clock, playNo,
        toGoal: 100 - yardline, over, result, toType,
        startYard: day.field.ownYard, plays: log.length,
        weather: day.weather.condition, field: day.field,
        grades: grades.slice(), log: log.slice(),
        callGrade: grades.length ? +(grades.reduce((s,g)=>s+g.percentile,0)/grades.length).toFixed(1) : 0,
        fg: fgInfo(),
        calls: callSheet.map(t => ({ id: t.id, remaining: remaining(t), cap: t.cap })),
        tendency: tendencyMap(recent),
      }, extra || {});
    }
    function finish(res, to) {
      over = true; result = res; toType = to || null;
      return snapshot({ justFinished: true });
    }

    function snap(tileId) {
      if (over) return snapshot();
      if (clock <= 0 || playNo > 14) return finish('CLOCK');
      let tile = callSheet.find(t => t.id === tileId) || callSheet[0];
      if (remaining(tile) <= 0) {                 // exhausted call: ignore, don't burn a down
        return snapshot({ denied: tile.id });
      }
      used[tile.id]++;
      const chosen = tile.play;
      const def = currentDefense();
      const sit = { down, distance, yardline, clock, tendency: tendencyMap(recent), scheme: schemeKey };
      const isRun = ['RUN','QB_SNEAK'].includes(chosen.archetype);

      // Grade against only what the player could see (box count, not the blitz)
      // and only the calls still AVAILABLE this snap — grading you against a play
      // you'd used up would be dishonest.
      const visible = { column: def.boxCount >= 8 ? 'HEAVY_BOX'
                              : def.boxCount <= 6 ? 'LIGHT_BOX' : 'BASE_7' };
      const optionPlays = availableTiles().map(t => t.play);
      if (!optionPlays.some(p => p === chosen)) optionPlays.push(chosen);
      const grade = gradeCall(chosen, optionPlays, visible, sit, gp.qualityModifier);
      grades.push(grade);

      const out = resolvePlay(chosen, def, sit, rng, gp.qualityModifier);
      if(!out.incomplete) clock -= RULES.secPerPlay[isRun ? 'run' : 'pass'];   // incompletions stop the clock

      const wasDown = down, wasDist = distance, wasYard = yardline;
      const entry = { playNo, down: wasDown, distance: wasDist, yardline: wasYard,
                      play: chosen.name, title: tile.title, archetype: chosen.archetype,
                      box: def.boxCount, blitz: def.isBlitz, grade, ...out };
      log.push(entry);
      recent.push(chosen.archetype);

      const res = { lastPlay: entry, lastDef: def };

      if (out.turnover) return Object.assign(finish('TURNOVER', out.turnover), res);

      yardline += out.yards;
      if (yardline >= 100) return Object.assign(finish('TOUCHDOWN'), res);
      if (yardline < 1)   return Object.assign(finish('SAFETY'), res);

      distance -= out.yards;
      if (distance <= 0) {                       // moved the chains
        down = 1; distance = Math.min(10, 100 - yardline); playNo++;
      } else if (down >= 4) {                    // failed on 4th
        return Object.assign(finish('TURNOVER_ON_DOWNS'), res);
      } else {
        down++; playNo++;
      }
      return Object.assign(snapshot(), res);
    }

    function kickFG() {
      if (over) return snapshot();
      const info = fgInfo();
      const made = rng() < fgMakeProb(info.dist);
      return finish(made ? 'FIELD_GOAL' : 'MISSED_FG', null);
    }

    return {
      snap, kickFG,
      state: () => snapshot(),
      currentDefense, callSheet, day, gp,
      remaining, availableTiles,
      startYard: day.field.ownYard,
    };
  }

  /* ---------- 9. BOT-PLAYED DRIVE (validation harness) -------------------- */
  function runDrive(dateStr, schemeKey, policy, opts = {}) {
    const d = createDrive(dateStr, schemeKey, opts);
    let s = d.state();
    let guard = 0;
    while (!s.over && guard++ < 40) {
      // policy sees the situation, the visible defense, and only the calls still
      // available (usage caps applied), so it never picks an exhausted play.
      const def = d.currentDefense();
      const visibleBox = def.boxCount;
      const avail = d.callSheet.filter(t => {
        const c = s.calls.find(x => x.id === t.id); return !c || c.remaining > 0;
      });
      const action = policy(s, avail, visibleBox, d.gp);
      if (action === 'KICK') { s = d.kickFG(); break; }
      const next = d.snap(action);
      if (next.denied) { s = d.snap((avail[0] || d.callSheet[0]).id); } // fallback, never stall
      else s = next;
    }
    return s;
  }

  /* ---------- 10. SHARE CARD ---------------------------------------------- */
  const CARDS = {
    TOUCHDOWN:        d => `TOUCHDOWN — a ${d.yardsGained}-yard drive`,
    FIELD_GOAL:       () => `Kicked a field goal today`,
    MISSED_FG:        () => `Doinked it — no points`,
    TURNOVER_ON_DOWNS:() => `Got stuffed on 4th down`,
    CLOCK:            () => `Ran out of clock`,
    SAFETY:           () => `Took a safety today`,
  };
  const TO_CARDS = { INTERCEPTION:'Threw a pick today',
                     FUMBLE:'Put it on the ground today',
                     ABORTED_SNAP:'Botched the snap today' };

  function shareCard(state, streakDays) {
    const yardsGained = state.yardline - state.startYard;
    const head = state.toType ? TO_CARDS[state.toType]
               : (CARDS[state.result] || (() => state.result))({ ...state, yardsGained });
    const bar = state.grades.map(g => g.letter.replace('+','').replace('-','')).join(' ');
    const flex = state.result === 'TOUCHDOWN' && state.startYard <= 25
               ? '  ← from deep in his own end' : '';
    return `RunTheDrive ${state.date}\n${head}${flex}\n${bar}\n`
         + `${state.log.length} plays · ${yardsGained} yds · call grade ${state.callGrade}\n`
         + `Day streak: ${streakDays}`;
  }

  /* ---------- SCOUTING: what works / what doesn't vs today's defense ---------
     Weight the measured DEF_MOD matchup table by how often the day's defense
     shows each look (blitz rate + box tendency). The result is a per-play-type
     rating: positive = this call is favored today, negative = the defense takes
     it away. This is what turns the hidden gameplan into real advice.          */
  function columnProbs(gp) {
    const blitz = Math.max(0, Math.min(0.6, gp.blitzRate != null ? gp.blitzRate : 0.24));
    const bb = gp.boxBias || 0;
    let light = 0.30 - bb * 0.22, heavy = 0.24 + bb * 0.28;
    light = Math.max(0.05, Math.min(0.6, light));
    heavy = Math.max(0.05, Math.min(0.6, heavy));
    let base = Math.max(0.1, 1 - light - heavy);
    const s = light + heavy + base; light /= s; heavy /= s; base /= s;
    const nb = 1 - blitz;
    const hbShare = Math.max(0.2, Math.min(0.8, 0.45 + bb * 0.3));
    return { LIGHT_BOX: nb*light, BASE_7: nb*base, HEAVY_BOX: nb*heavy,
             BLITZ_LIGHT_BOX: blitz*(1-hbShare), HEAVY_BLITZ: blitz*hbShare };
  }
  function matchupRatings(gp) {
    const P = columnProbs(gp); const out = {};
    for (const arch in DEF_MOD) { let e = 0;
      for (const col in P) e += P[col] * (DEF_MOD[arch][col] || 0);
      e += archCoverageMod(arch, gp);        // account for the concept↔coverage matchup, like the resolver does
      out[arch] = +e.toFixed(2); }
    return out;
  }

  return { createDrive, runDrive, resolvePlay, gradeCall, expectedValue, shareCard,
           buildCallSheet, situationalMod, fgMakeProb, setDifficulty, getDifficulty,
           matchupRatings, DEF_MOD, RULES, SNEAK_PLAY, CONCEPT, COVER_MOD, shellMix };
}));
