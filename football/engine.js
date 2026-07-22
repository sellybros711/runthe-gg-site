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

  /* ---------- 2. SITUATIONAL MODIFIERS -------------------------------------
     Measured success rate by down x distance, expressed as a delta from that
     archetype's overall average. Source: 262,841 scrimmage plays.           */
  function situationalMod(archetype, down, distance) {
    const isRun = archetype === 'RUN' || archetype === 'QB_SNEAK';
    const short = distance <= 2, med = distance <= 6, long = distance >= 10;
    let m = 0;
    if (down >= 3) {
      if (short)      m += isRun ? +27.7 : +7.7;    // 3rd-and-short belongs to the run
      else if (med)   m += isRun ? +9.5  : -0.6;
      else if (long)  m += isRun ? -19.6 : -16.4;   // nobody escapes 3rd-and-long
      else            m += isRun ? -6.0  : -9.7;
    } else if (down === 2) {
      if (short)      m += isRun ? +14.2 : +7.5;
      else if (med)   m += isRun ? +7.5  : +5.5;
      else if (long)  m += isRun ? -12.4 : -3.4;
    } else {
      if (short)      m += isRun ? +9.6  : +1.0;
      else if (long)  m += isRun ? -5.4  : +2.8;
    }
    return m;
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
    let sr = play.success_pct
           + (DEF_MOD[a]?.[def.column] ?? 0)
           + situationalMod(a, sit.down, sit.distance)
           + (qualityMod || 0) * 100 + DIFFICULTY;
    let ex = play.explosive_pct;
    let ds = play.disaster_pct + (DEF_DISASTER[def.column] ?? 0);

    sr = Math.max(3, Math.min(94, sr));
    ex = Math.max(0.5, Math.min(sr - 1, ex));
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
    return { bucket, yards, turnover, sack, effectiveSuccessPct: +sr.toFixed(1) };
  }

  /* ---------- 5. GRADE THE CALL, NOT THE OUTCOME ---------------------------
     Compare the expected value of the play you chose against the best play
     available in your call sheet, using ONLY what the player could see (box
     count is visible; the blitz is not). A great call that gets unlucky still
     grades well. That is the whole point. EV is DRIVE-aware, not play-aware:
     it rewards moving the chains plus yardage, penalises turnover risk.       */
  function bucketProbs(play, def, sit, qualityMod) {
    const a = play.archetype;
    let sr = Math.max(3, Math.min(94,
        play.success_pct + (DEF_MOD[a]?.[def.column] ?? 0)
        + situationalMod(a, sit.down, sit.distance) + (qualityMod||0)*100 + DIFFICULTY));
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
  const RULES = { downs:4, timeouts:2, gameClockSec:300, playClockSec:40,
                  fgMaxYards:58, secPerPlay:{run:38, pass:32} };

  /* RunTheDrive has no punt — every 4th down is a conversion attempt or a kick,
     where real offenses punt on 42.6% of drives. That alone inflates scoring
     well above the real 23.5% TD rate. This single constant scales success
     rates so a SKILLED player lands on the target TD rate. Solved by
     simulation (see simulator.js), not guessed. Raise it to make it easier. */
  let DIFFICULTY = Number((typeof process !== 'undefined' && process.env && process.env.RTD_DIFFICULTY) ?? -24.0);
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
    const run  = pickBest(P, p => p.archetype === 'RUN');
    const shortP = pickBest(P, p => p.archetype === 'QUICK') || pickBest(P, p => p.archetype === 'SCREEN');
    const deep = pickBest(P, p => p.archetype === 'DEEP') || pickBest(P, p => p.archetype === 'INTERMEDIATE');
    const pa   = pickBest(P, p => p.archetype === 'PLAY_ACTION') || pickBest(P, p => p.archetype === 'INTERMEDIATE' && p !== deep);
    const sneak = pickBest(P, p => p.archetype === 'QB_SNEAK') || SNEAK_PLAY;
    const tiles = [
      { id: 'RUN',   title: 'RUN',         emoji: '🏃', play: run },
      { id: 'SHORT', title: 'SHORT PASS',  emoji: '🎯', play: shortP },
      { id: 'DEEP',  title: 'DEEP SHOT',   emoji: '🏈', play: deep },
      { id: 'PA',    title: 'PLAY ACTION', emoji: '🎭', play: pa },
      { id: 'SNEAK', title: 'QB SNEAK',    emoji: '💪', play: sneak },
    ].filter(t => t.play);
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
    const callSheet = buildCallSheet(schemeKey);
    const gradePlaybook = callSheet.map(t => t.play);
    const rng = mulberry32(fnv1a(`${dateStr}|drive|${opts.salt||0}`));

    let yardline = day.field.ownYard, down = 1, distance = 10;
    let clock = RULES.gameClockSec, playNo = 1;
    let over = false, result = null, toType = null;
    const log = [], grades = [];

    // Deterministic pre-snap defensive read for the CURRENT down (no play seen).
    function currentDefense() {
      return defensiveCall(dateStr, gp, playNo, down, distance, 1, budget.slots);
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
      }, extra || {});
    }
    function finish(res, to) {
      over = true; result = res; toType = to || null;
      return snapshot({ justFinished: true });
    }

    function snap(tileId) {
      if (over) return snapshot();
      if (clock <= 0 || playNo > 14) return finish('CLOCK');
      const tile = callSheet.find(t => t.id === tileId) || callSheet[0];
      const chosen = tile.play;
      const def = currentDefense();
      const sit = { down, distance, yardline, clock };
      const isRun = ['RUN','QB_SNEAK'].includes(chosen.archetype);

      // Grade against only what the player could see (box count, not the blitz).
      const visible = { column: def.boxCount >= 8 ? 'HEAVY_BOX'
                              : def.boxCount <= 6 ? 'LIGHT_BOX' : 'BASE_7' };
      const grade = gradeCall(chosen, gradePlaybook, visible, sit, gp.qualityModifier);
      grades.push(grade);

      const out = resolvePlay(chosen, def, sit, rng, gp.qualityModifier);
      clock -= RULES.secPerPlay[isRun ? 'run' : 'pass'];

      const wasDown = down, wasDist = distance, wasYard = yardline;
      const entry = { playNo, down: wasDown, distance: wasDist, yardline: wasYard,
                      play: chosen.name, title: tile.title, archetype: chosen.archetype,
                      box: def.boxCount, blitz: def.isBlitz, grade, ...out };
      log.push(entry);

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
      startYard: day.field.ownYard,
    };
  }

  /* ---------- 9. BOT-PLAYED DRIVE (validation harness) -------------------- */
  function runDrive(dateStr, schemeKey, policy, opts = {}) {
    const d = createDrive(dateStr, schemeKey, opts);
    let s = d.state();
    while (!s.over) {
      // policy sees the situation, the visible defense, and the call sheet.
      const def = d.currentDefense();
      const visibleBox = def.boxCount;
      const action = policy(s, d.callSheet, visibleBox, d.gp);
      if (action === 'KICK') { s = d.kickFG(); break; }
      s = d.snap(action);
    }
    return s;
  }

  /* ---------- 10. SHARE CARD ---------------------------------------------- */
  const CARDS = {
    TOUCHDOWN:        d => `🏈 TOUCHDOWN — a ${d.yardsGained}-yard drive`,
    FIELD_GOAL:       () => `🦵 I kicked a field goal today`,
    MISSED_FG:        () => `😬 Doinked it — no points`,
    TURNOVER_ON_DOWNS:() => `🛑 Got stuffed on 4th down`,
    CLOCK:            () => `⏱️ Ran out of clock`,
    SAFETY:           () => `🙈 I took a safety today`,
  };
  const TO_CARDS = { INTERCEPTION:'🎯 I threw a pick today',
                     FUMBLE:'🤲 I put it on the ground today',
                     ABORTED_SNAP:'💀 Botched the snap today' };

  function shareCard(state, streakDays) {
    const yardsGained = state.yardline - state.startYard;
    const head = state.toType ? TO_CARDS[state.toType]
               : (CARDS[state.result] || (() => state.result))({ ...state, yardsGained });
    const bar = state.grades.map(g =>
        g.letter.startsWith('A') ? '🟩' : g.letter === 'B' ? '🟨'
      : g.letter === 'C' ? '🟧' : '🟥').join('');
    const flex = state.result === 'TOUCHDOWN' && state.startYard <= 25
               ? '  ← from deep in his own end' : '';
    return `RunTheDrive ${state.date}\n${head}${flex}\n${bar}\n`
         + `${state.log.length} plays · ${yardsGained} yds · call grade ${state.callGrade}\n`
         + `Day streak: ${streakDays}`;
  }

  return { createDrive, runDrive, resolvePlay, gradeCall, expectedValue, shareCard,
           buildCallSheet, situationalMod, fgMakeProb, setDifficulty, getDifficulty,
           DEF_MOD, RULES, SNEAK_PLAY };
}));
