/* ============================================================================
   RunTheDrive — DAILY DRIVE GENERATOR
   ----------------------------------------------------------------------------
   Everything a drive needs before a snap is called:
     - a deterministic daily seed (same date -> same drive, every player)
     - starting field position + cosmetic weather
     - a HIDDEN defensive gameplan (tendencies for the day)
     - the defensive call for a given snap  (NEVER sees the offense's play)
     - a pre-allocated blitz budget          (a count, not a per-play coin flip)
     - a scouting report rendered live from the gameplan (never hand-written)

   Numbers are tuned to real football measurements, not invented:
     * average drive starts near a team's own 28
     * defenses put more hats in the box against heavy backfields and short
       yardage, and lighten up on 3rd-and-long
     * a defense blitzes on roughly a quarter to a third of snaps

   Browser + Node compatible. In Node: `require('./drive_generator.js')`.
   In the browser it attaches to `window.RTD_GEN`.
   ========================================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RTD_GEN = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- deterministic hashing + PRNG -------------------------------- */
  // FNV-1a 32-bit. Same string -> same 32-bit hash on every device.
  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }
  // mulberry32: tiny, fast, well-distributed PRNG seeded from a 32-bit int.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // pick a weighted entry: items = [[value, weight], ...]
  function weighted(rng, items) {
    let total = 0;
    for (const it of items) total += it[1];
    let r = rng() * total;
    for (const it of items) { if ((r -= it[1]) <= 0) return it[0]; }
    return items[items.length - 1][0];
  }

  /* ---------- 1. THE DAILY DRIVE ------------------------------------------
     Field position + weather + the hidden defensive gameplan for the day.   */

  // Cosmetic only — no measured weather effect exists in the data, so this
  // never touches the resolver. Kept for flavor and share-card texture.
  const WEATHER = [
    ['Sunny', 46], ['Clear', 14], ['Cloudy', 16],
    ['Windy', 9], ['Rain', 7], ['Cold', 5], ['Snow', 2], ['Dome', 1],
  ];

  // Coordinator archetypes: a defense has a personality for the day. Each biases
  // how heavy the box runs and how often pressure comes. The player never sees
  // this object — they infer it from the scouting report and what they've seen.
  const DEF_STYLES = [
    { key: 'BEND_DONT_BREAK', name: 'Bend-but-Dont-Break', boxBias: -0.4, blitzRate: 0.14, coverage: 'ZONE',
      note: 'Two-high shell, rallies to the ball, rarely gambles.' },
    { key: 'BALANCED',        name: 'Balanced',             boxBias:  0.0, blitzRate: 0.24, coverage: 'MIXED',
      note: 'Plays it down the middle. Reacts to your personnel.' },
    { key: 'STACK_THE_BOX',   name: 'Box-Stacker',          boxBias: +0.7, blitzRate: 0.22, coverage: 'MAN',
      note: 'Loads the box early, dares you to throw over the top.' },
    { key: 'PRESSURE',        name: 'Pressure',             boxBias: +0.2, blitzRate: 0.40, coverage: 'MAN',
      note: 'Sends heat. Brings extra rushers and lives with the risk.' },
    { key: 'ZERO_HESITATION', name: 'Gambler',              boxBias: +0.3, blitzRate: 0.50, coverage: 'MAN',
      note: 'Blitz-happy. Feast or famine — big TFLs or big plays given up.' },
  ];

  function generateDailyDrive(dateStr) {
    const rng = mulberry32(fnv1a(dateStr + '|day'));

    // Starting field position. Real drives cluster around the mid-20s (touchback
    // era), with a long tail either way. Own-yard basis: 100 = opponent goal.
    const ownYard = weighted(rng, [
      [10, 3], [15, 6], [20, 12], [22, 10], [25, 26], [28, 14],
      [30, 12], [35, 8], [40, 5], [45, 3], [50, 1],
    ]);

    const condition = weighted(rng, WEATHER);

    // The hidden gameplan.
    const style = DEF_STYLES[Math.floor(rng() * DEF_STYLES.length)];
    // Daily wobble on top of the archetype so no two "Balanced" days feel identical.
    const boxBias   = +(style.boxBias + (rng() - 0.5) * 0.6).toFixed(2);
    const blitzRate = Math.max(0.08, Math.min(0.55, style.blitzRate + (rng() - 0.5) * 0.14));
    // qualityModifier: the day's matchup edge for the offense, in EPA-ish units
    // (multiplied by 100 and added to success% inside the resolver). Small.
    const qualityModifier = +((rng() - 0.5) * 0.06).toFixed(3);

    const gp = {
      styleKey: style.key,
      styleName: style.name,
      styleNote: style.note,
      coverage: style.coverage,
      boxBias,
      blitzRate,
      blitzEarly: rng() < 0.45,        // do they tip pressure on the first series?
      qualityModifier,
      _seed: dateStr,
    };

    return {
      date: dateStr,
      field: { ownYard, toGo: 100 - ownYard },
      weather: { condition },
      _hiddenGameplan: gp,
    };
  }

  /* ---------- 2. BLITZ BUDGET ---------------------------------------------
     A drive is ~8 snaps. A flat per-play blitz % blitzes twice in eight snaps
     often enough that "rarely blitzes" becomes a lie. So we allocate a fixed
     COUNT for the day and pre-assign which snaps get pressure. The scouting
     report can then describe exactly what the player will see, and blitzes
     become countable ("they've used both of theirs").                        */

  function buildBlitzSlots(dateStr, gp) {
    const rng = mulberry32(fnv1a(dateStr + '|blitz'));
    const MAX_SNAPS = 14;
    // Expected blitzes over a full-length drive, from the day's rate. At least
    // 0, capped so even a Gambler doesn't blitz literally every down.
    let count = Math.round(gp.blitzRate * MAX_SNAPS);
    // add a little variance around the expectation
    count += (rng() < 0.5 ? -1 : 1) * (rng() < 0.35 ? 1 : 0);
    count = Math.max(0, Math.min(7, count));

    // Pre-assign distinct snap numbers. Weight early snaps if the coordinator
    // tips pressure early, otherwise spread across the drive.
    const pool = [];
    for (let s = 1; s <= MAX_SNAPS; s++) {
      const earlyW = gp.blitzEarly ? Math.max(1, 8 - s) : 4;
      pool.push([s, earlyW]);
    }
    const slots = [];
    for (let i = 0; i < count && pool.length; i++) {
      const idx = weightedIndex(rng, pool);
      slots.push(pool[idx][0]);
      pool.splice(idx, 1);
    }
    slots.sort((a, b) => a - b);
    return { count, slots };
  }
  function weightedIndex(rng, items) {
    let total = 0;
    for (const it of items) total += it[1];
    let r = rng() * total;
    for (let i = 0; i < items.length; i++) { if ((r -= items[i][1]) <= 0) return i; }
    return items.length - 1;
  }

  /* ---------- 3. THE DEFENSIVE CALL ---------------------------------------
     CONTRACT: there is no `play` parameter. The defense reacts to down,
     distance, and the PERSONNEL it can see line up (backfield count) — never
     to the play that's about to be run. Adding a play parameter here kills the
     entire premise of the game.

     Box count reacts realistically:
       - heavier backfield  -> more hats in the box
       - short yardage      -> more hats in the box
       - 3rd/4th-and-long   -> lighter box, extra defensive backs
     Blitz is decided purely by the pre-allocated budget for this snap.        */

  function defensiveCall(dateStr, gp, playNumber, down, distance, backfieldCount, blitzSlots, schemeBoxDraw) {
    const rng = mulberry32(fnv1a(`${dateStr}|def|${playNumber}`));

    // Base box grows with the backfield the defense sees.
    let box = 5.4 + (backfieldCount >= 2 ? 1.4 : 0.6);

    // The scheme's own tendency to draw hats: a smash-mouth, two-back look
    // invites a loaded box; a spread, empty look thins it out. Measured per
    // scheme as box_draw (league-ish baseline 6.2). This is what makes the run
    // game honest — heavy schemes earn their short-yardage edge against 8 in the
    // box, spread schemes run into lighter fronts.
    if (typeof schemeBoxDraw === 'number') box += (schemeBoxDraw - 6.2) * 0.7;

    // Situational adjustment.
    if (distance <= 2)       box += 0.9;              // short yardage: sell out vs the run
    else if (distance >= 10) box += (down >= 3 ? -0.9 : -0.3);   // obvious pass: drop a hat
    else if (distance >= 7 && down >= 3) box -= 0.4;

    box += gp.boxBias;                                 // the day's personality
    box += (rng() - 0.5) * 0.7;                        // snap-to-snap noise

    let boxCount = Math.max(5, Math.min(9, Math.round(box)));

    // Blitz strictly from the budget.
    const isBlitz = Array.isArray(blitzSlots) && blitzSlots.includes(playNumber);
    // A blitz brings an extra rusher, so it reads as one more hat near the line.
    if (isBlitz) boxCount = Math.min(9, boxCount + 1);

    // Map (box, blitz) -> the column the engine's modifier tables are keyed on.
    let column;
    if (isBlitz) column = boxCount <= 6 ? 'BLITZ_LIGHT_BOX' : 'HEAVY_BLITZ';
    else         column = boxCount >= 8 ? 'HEAVY_BOX' : boxCount <= 6 ? 'LIGHT_BOX' : 'BASE_7';

    return { column, boxCount, isBlitz, coverage: gp.coverage };
  }

  /* ---------- 4. SCOUTING REPORT ------------------------------------------
     Every line is generated from a live gameplan parameter, so it can never
     drift out of sync with what the defense actually does. Uncertainty is
     created by WITHHOLDING lines and by banded language — never by printing a
     statement that is false. Returns an array of {tag, text} intel cards.     */

  function scoutingReport(dateStr, day) {
    const gp = day._hiddenGameplan;
    const budget = buildBlitzSlots(dateStr, gp);
    const lines = [];

    // Pressure read — always truthful, banded by the real blitz count.
    if (budget.count === 0) {
      lines.push({ tag: 'PRESSURE', text: 'Film shows a patient front — they sit back and make you earn it. Don’t expect the blitz.' });
    } else if (budget.count <= 2) {
      lines.push({ tag: 'PRESSURE', text: `They pick their spots to bring pressure — look for about ${budget.count === 1 ? 'one blitz' : 'a couple of blitzes'} the whole drive.` });
    } else if (budget.count <= 4) {
      lines.push({ tag: 'PRESSURE', text: 'This front likes to send extra rushers. Expect heat on several snaps.' });
    } else {
      lines.push({ tag: 'PRESSURE', text: 'Blitz-happy. They’ll bring the house early and often — get the ball out or make them pay.' });
    }

    // Timing tell — only printed when it's actually true.
    if (gp.blitzEarly && budget.count > 0) {
      lines.push({ tag: 'TIMING', text: 'Tape says they tip their pressure on the opening series. Be ready first-down.' });
    } else if (!gp.blitzEarly && budget.count > 0) {
      lines.push({ tag: 'TIMING', text: 'They hold their blitzes back for obvious passing downs rather than showing them early.' });
    }

    // Box tendency — banded from boxBias.
    if (gp.boxBias >= 0.5) {
      lines.push({ tag: 'FRONT', text: 'Loads the box against a heavy backfield. Lining up under center invites bodies near the line.' });
    } else if (gp.boxBias <= -0.3) {
      lines.push({ tag: 'FRONT', text: 'Plays with a light box and a deep shell — the run lanes are there if you take them.' });
    } else {
      lines.push({ tag: 'FRONT', text: 'A by-the-numbers front. It reacts to your personnel more than it dictates.' });
    }

    // Coverage flavor (cosmetic — no coverage data in the resolver, so kept soft).
    if (gp.coverage === 'MAN') {
      lines.push({ tag: 'COVERAGE', text: 'Leans man coverage. Motion and rubs can spring a receiver free.' });
    } else if (gp.coverage === 'ZONE') {
      lines.push({ tag: 'COVERAGE', text: 'Zone-heavy secondary. Find the soft spot underneath and let it develop.' });
    }

    return { style: gp.styleName, note: gp.styleNote, blitzCount: budget.count, lines };
  }

  return {
    fnv1a, mulberry32, weighted,
    generateDailyDrive, buildBlitzSlots, defensiveCall, scoutingReport,
    DEF_STYLES, WEATHER,
  };
}));
