/* Shut The Door: the lesson from your worst pitch (CONTRACT.md section 15).
 *
 * Headless. Browser: window.STD_LESSON (after contract.js, rng.js, grade.js and
 * BEFORE engine.js, which reads it). Node: require('./lesson.js').
 *
 *   lessonFor(outing) -> Lesson | null
 *
 * THE PITCH: the one with the most hold% lost. None when every pitch was green.
 *
 * THE PRINCIPLE, FROM THE GRADE. In the state before that pitch, the best
 * call's value minus yours splits exactly over the outcome keys:
 *   gap = sum over keys of (p_best - p_call) x (value after that key - value of your call)
 * where p is each call's outcome mix through the miss table (the same one the
 * grade priced). The keys group into walk risk (the takes: ball, hit by
 * pitch, called strike), whiffs (swinging strike, foul), damage (hits, errors)
 * and outs in play. The group
 * that explains the most of the gap says what kind of mistake it was, and the
 * count, the bases, the platoon and the two calls pick the principle within
 * it. Every principle is checked against its own numbers before it is used
 * (`shows` below): no principle that the numbers do not show.
 *
 * THE COPY: templates here, lowercase, short sentences, every number from the
 * pack or the grade.
 *
 * THE PRO: a real pitch from the pack's `pros` (built from the library at build
 * time: closer pool pitchers, this principle, this count bucket and platoon,
 * the best call's pitch family, in its cell or a neighbour, with a good result;
 * postseason first, then the highest leverage). null when none matches. Never
 * invented.
 */
(function () {
  'use strict';
  const NODE = typeof module !== 'undefined' && module.exports;
  const K = NODE ? require('./contract.js') : window.STD_CONTRACT;
  const G = NODE ? require('./grade.js') : window.STD_GRADE;

  const PRINCIPLES = Object.freeze(['chase_when_ahead', 'strike_when_behind', 'first_pitch_strike', 'avoid_his_damage',
    'attack_his_hole', 'same_side_breaker_away', 'change_eye_level', 'double_play_ball',
    'strikeout_with_runner_on_third', 'dont_walk_the_tying_run', 'use_your_best_pitch']);

  /* one line each, for "pitching 101" (CONTRACT.md section 15: how to play) */
  const ONE_LINE = Object.freeze({
    chase_when_ahead: 'ahead in the count, throw it where he has to chase it.',
    strike_when_behind: 'behind in the count, throw a strike he cannot do much with.',
    first_pitch_strike: 'strike one changes the whole at bat.',
    avoid_his_damage: 'every hitter has a zone he punishes. stay out of it.',
    attack_his_hole: 'every hitter has a pitch he misses. throw it.',
    same_side_breaker_away: 'righty on righty or lefty on lefty, the breaking ball away is the toughest pitch to hit.',
    change_eye_level: 'up, then down. a hitter cannot cover both.',
    double_play_ball: 'a man on first and less than two out: get it on the ground.',
    strikeout_with_runner_on_third: 'a man on third and less than two out: a ball in play can score him. get the strikeout.',
    dont_walk_the_tying_run: 'a walk that brings up or puts on the tying run is the worst ball you can throw.',
    use_your_best_pitch: 'in the big spot, go to your best pitch.',
  });

  const GROUP = Object.freeze({
    // the takes: a pitch he lets go is a ball or a strike, so ball and called
    // strike are one decision (walk risk); the swings that miss or foul are the other
    ball: 'walk', hit_by_pitch: 'walk', called_strike: 'walk',
    swinging_strike: 'strike', foul: 'strike',
    single: 'damage', double: 'damage', triple: 'damage', home_run: 'damage', error: 'damage',
    out_ground: 'outs', out_line: 'outs', out_fly: 'outs', out_popup: 'outs',
  });
  const KI = Object.fromEntries(G.KEYS.map((k, i) => [k, i]));

  /* ---- the numbers ------------------------------------------------------- */

  /* P(key | target): the pack's rows through the miss table. */
  function keyMix(model, bi, type, target, bucket, st, hctx, at) {
    if (hctx) return Array.from(model.keyMixCtx(st, type, target, hctx, at));   // rules 2: what he had seen, and the arm; at: the exact spot
    const ker = model.kernel[type];
    const e = model.entry(bi, type);
    const out = new Array(G.KEYS.length).fill(0);
    for (let a = 0; a < 25; a++) {
      const w = ker[target * 25 + a];
      if (w < 1e-9) continue;
      const row = e.p[a][bucket];
      for (let k = 0; k < row.length; k++) out[k] += w * row[k] / 1000;
    }
    return out;
  }

  /* The value after each key, from this state: hold% with the lead, the
     tie's goal once it is tied (grade.js THE GOAL; model.after scores a tie
     from a lead as 0, as the grade does). */
  function keyValues(model, st, hctx) {
    const here = model.bestCtx(st, hctx).hold;
    return G.KEYS.map((key, k) => {
      let v = 0;
      for (const [q, t] of model.transitions(st, G.CLASS[k])) v += q * (t.self ? here : model.after(st, t));
      return v;
    });
  }

  function sumKeys(mix, keys) { return keys.reduce((a, k) => a + mix[KI[k]], 0); }
  const HITS = ['single', 'double', 'triple', 'home_run'];
  const IN_PLAY = G.IN_PLAY;
  const pct = x => Math.round(x * 100);
  const fmt1 = x => (Math.round(x * 10) / 10).toFixed(1);
  const fmt3 = x => x.toFixed(3).replace(/^0/, '');

  function features(mix) {
    const inPlay = sumKeys(mix, IN_PLAY);
    return {
      ball: mix[KI.ball] + mix[KI.hit_by_pitch],
      strike: sumKeys(mix, ['called_strike', 'swinging_strike', 'foul']),
      whiff: mix[KI.swinging_strike],
      hit: sumKeys(mix, HITS),
      xbh: sumKeys(mix, ['double', 'triple', 'home_run']),
      inPlay,
      ground: inPlay > 0 ? mix[KI.out_ground] / inPlay : 0,
      outsInPlay: sumKeys(mix, ['out_ground', 'out_line', 'out_fly', 'out_popup']),
    };
  }

  /* ---- words -------------------------------------------------------------- */

  function nameOf(model, type) { const a = model.arsenal.find(x => x.type === type); return a ? a.name : type; }
  const rel = (cell, bats) => (bats === 'L' ? K.rowOf(cell) * 5 + (4 - K.colOf(cell)) : cell);   // col 0 = inside
  function isAway(cell, bats) { return K.colOf(rel(cell, bats)) >= 3; }
  function countWords(b, s) {
    if (b === 0 && s === 0) return 'on the first pitch';
    if (b === 3 && s === 2) return 'full count';
    if (s === 2 && b < 3) return `ahead ${b}-${s}`;
    if (b > s) return `behind ${b}-${s}`;
    if (s > b) return `ahead ${b}-${s}`;
    return `at ${b}-${s}`;
  }
  function runnersAfterWalk(bases) { return Math.min(3, [1, 2, 4].filter(m => bases & m).length + 1); }
  /* The run that matters: the tying run with the lead, the go-ahead run once
     it is tied. need = how many runs it takes to score it. */
  function keyRun(st) { return st.margin >= 1 ? { need: st.margin, word: 'tying' } : { need: 1, word: 'go-ahead' }; }

  /* ---- the principle ------------------------------------------------------- */

  function choose(ctx) {
    const { st, call, best, fc, fb, contrib, model, batter, pitcherHand } = ctx;
    const ahead = st.s > st.b || st.s === 2;
    const behind = st.b > st.s;
    const bestFam = K.FAMILY_OF[best.type];
    const sameSide = batter.bats === pitcherHand;
    const topType = model.arsenal.slice().sort((a, b) => b.usage - a.usage)[0].type;
    const rowGap = Math.abs(K.rowOf(best.cell) - K.rowOf(call.cell));
    const colGap = Math.abs(K.colOf(best.cell) - K.colOf(call.cell));
    const heat = batter.profile && batter.profile.heat;
    const heatAvg = heat ? heat.reduce((a, b) => a + b, 0) / heat.length : 0;
    const order = Object.entries(contrib).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([g]) => g);
    const cands = [];
    for (const g of order) {
      if (g === 'walk') {
        if (st.b === 3 || (runnersAfterWalk(st.bases) + 1 >= keyRun(st).need && st.b >= 2)) cands.push('dont_walk_the_tying_run');
        if (st.b === 0 && st.s === 0) cands.push('first_pitch_strike');
        if (behind || st.b === st.s) cands.push('strike_when_behind');
      } else if (g === 'strike') {
        if (st.b === 0 && st.s === 0) cands.push('first_pitch_strike');
        if (behind) cands.push('strike_when_behind');
        if ((st.bases & 4) && st.outs < 2) cands.push('strikeout_with_runner_on_third');
        if (ahead && !K.inZone(best.cell)) cands.push('chase_when_ahead');
        if (sameSide && bestFam === 'breaking' && isAway(best.cell, batter.bats)) cands.push('same_side_breaker_away');
        if (best.type !== call.type) cands.push('attack_his_hole');
        if (best.type === call.type && rowGap >= 2 && colGap <= 1) cands.push('change_eye_level');
        if (best.type === topType && call.type !== topType) cands.push('use_your_best_pitch');
      } else if (g === 'damage') {
        if (sameSide && bestFam === 'breaking' && isAway(best.cell, batter.bats)) cands.push('same_side_breaker_away');
        if (heat && heat[call.cell] >= heatAvg + 0.03) cands.push('avoid_his_damage');
        if (rowGap >= 2 && colGap <= 1) cands.push('change_eye_level');
        if (best.type === topType && call.type !== topType) cands.push('use_your_best_pitch');
        cands.push('avoid_his_damage');
      } else if (g === 'outs') {
        if ((st.bases & 1) && st.outs < 2 && fb.ground > fc.ground) cands.push('double_play_ball');
        if (best.type === topType && call.type !== topType) cands.push('use_your_best_pitch');
      }
    }
    for (const p of cands) if (SHOWS[p](ctx)) return p;
    // the situational picks did not hold up: the first principle whose own
    // numbers show it, in a fixed order (still never one the numbers do not show)
    for (const p of FALLBACK) if (SITUATION[p](ctx) && SHOWS[p](ctx)) return p;
    return null;
  }

  const FALLBACK = ['avoid_his_damage', 'strike_when_behind', 'attack_his_hole', 'use_your_best_pitch', 'change_eye_level'];
  /* where a principle can be said at all */
  const SITUATION = {
    avoid_his_damage: () => true,
    strike_when_behind: c => c.st.b >= c.st.s,
    attack_his_hole: c => c.best.type !== c.call.type,
    use_your_best_pitch: c => c.call.type !== c.best.type,
    change_eye_level: c => Math.abs(K.rowOf(c.best.cell) - K.rowOf(c.call.cell)) >= 2,
  };

  /* Each principle's own numbers, which must show it before it is used. */
  const SHOWS = {
    chase_when_ahead: c => !K.inZone(c.best.cell) && c.fb.whiff > c.fc.whiff,
    strike_when_behind: c => c.fb.ball < c.fc.ball,
    first_pitch_strike: c => c.st.b === 0 && c.st.s === 0 && c.fb.strike > c.fc.strike,
    avoid_his_damage: c => c.fb.hit < c.fc.hit,
    attack_his_hole: c => c.fb.whiff > c.fc.whiff,
    same_side_breaker_away: c => c.fb.whiff + c.fb.outsInPlay > c.fc.whiff + c.fc.outsInPlay || c.fb.hit < c.fc.hit,
    change_eye_level: c => c.fb.whiff > c.fc.whiff || c.fb.hit < c.fc.hit,
    double_play_ball: c => c.fb.ground > c.fc.ground,
    strikeout_with_runner_on_third: c => c.fb.whiff > c.fc.whiff,
    dont_walk_the_tying_run: c => c.fb.ball < c.fc.ball,
    use_your_best_pitch: c => c.fb.whiff > c.fc.whiff || c.fb.hit < c.fc.hit,
  };

  /* ---- the copy ------------------------------------------------------------- */

  function copy(p, c) {
    const { st, call, best, fc, fb, model, batter, grade, pitcherHand } = c;
    const bn = nameOf(model, best.type), cn = nameOf(model, call.type);
    const bp = G.placeOf(best.cell, batter.bats), cp = G.placeOf(call.cell, batter.bats);
    const last = batter.name.split(' ').slice(1).filter(w => !/^(Jr\.|Sr\.|II|III)$/.test(w)).join(' ') || batter.name;
    const pr = batter.profile || {};
    const cw = countWords(st.b, st.s);
    const hand = pitcherHand === 'R' ? 'righty' : 'lefty';
    let headline, why = [], next;
    switch (p) {
      case 'chase_when_ahead':
        headline = `${cw}. make him chase.`;
        why.push(`${last} swings at ${pct(pr.chase || 0)}% of pitches out of the zone.`);
        why.push(`the ${bn} ${bp} gets a whiff ${pct(fb.whiff)}% of the time. your ${cn} ${cp}: ${pct(fc.whiff)}%.`);
        next = `next time ${cw}, throw the ${bn} ${bp}.`;
        break;
      case 'strike_when_behind':
        headline = `${cw}. throw a strike.`;
        why.push(`your ${cn} ${cp} is a ball ${pct(fc.ball)}% of the time. the ${bn} ${bp}: ${pct(fb.ball)}%.`);
        why.push(`a hit off the ${bn} there comes ${pct(fb.hit)}% of the time. the ball you might throw costs more.`);
        next = `next time ${cw}, throw the ${bn} ${bp}.`;
        break;
      case 'first_pitch_strike':
        headline = 'get strike one.';
        why.push(`the ${bn} ${bp} is a strike ${pct(fb.strike)}% of the time. your ${cn} ${cp}: ${pct(fc.strike)}%.`);
        why.push('0-1 and 1-0 are different at bats.');
        next = `next time on the first pitch, start with the ${bn} ${bp}.`;
        break;
      case 'avoid_his_damage': {
        const h = pr.heat && pr.heat[call.cell];
        headline = 'stay out of his damage.';
        if (h != null) why.push(`${cp} is where ${last} hits: ${fmt3(h)} xwoba on contact.`);
        why.push(`your ${cn} there gives up a hit ${pct(fc.hit)}% of the time. the ${bn} ${bp}: ${pct(fb.hit)}%.`);
        next = `next time ${cw}, keep it ${bp}.`;
        break;
      }
      case 'attack_his_hole': {
        const w = pr.whiff && pr.whiff[best.type];
        headline = `attack his hole: the ${bn}.`;
        if (w != null) why.push(`${last} misses ${pct(w)}% of his swings at the ${bn}.`);
        why.push(`the ${bn} ${bp} gets a whiff ${pct(fb.whiff)}% of the time. your ${cn} ${cp}: ${pct(fc.whiff)}%.`);
        next = `next time ${cw}, go to the ${bn}.`;
        break;
      }
      case 'same_side_breaker_away':
        headline = `${hand} on ${hand}: the ${bn} away.`;
        why.push(`a breaking ball away from a same side hitter is the hardest pitch to square up.`);
        why.push(`here it gives up a hit ${pct(fb.hit)}% of the time and gets a whiff ${pct(fb.whiff)}%. your ${cn} ${cp}: ${pct(fc.hit)}% and ${pct(fc.whiff)}%.`);
        next = `next time ${hand} on ${hand} ${cw}, throw the ${bn} ${bp}.`;
        break;
      case 'change_eye_level':
        headline = 'change his eye level.';
        why.push(`you went ${cp}. ${bp} was the other half of the plan.`);
        why.push(`the ${bn} ${bp} gets a whiff ${pct(fb.whiff)}% and gives up a hit ${pct(fb.hit)}%. yours: ${pct(fc.whiff)}% and ${pct(fc.hit)}%.`);
        next = `next time ${cw}, move it ${bp}.`;
        break;
      case 'double_play_ball':
        headline = 'get the ground ball.';
        why.push(`a man on first and ${st.outs === 0 ? 'nobody' : 'one'} out. a grounder can end two.`);
        why.push(`the ${bn} ${bp} is on the ground ${pct(fb.ground)}% of the times it is put in play. your ${cn} ${cp}: ${pct(fc.ground)}%.`);
        next = `next time with a man on first, throw the ${bn} ${bp}.`;
        break;
      case 'strikeout_with_runner_on_third':
        headline = 'man on third. get the strikeout.';
        why.push(`with ${st.outs === 0 ? 'nobody' : 'one'} out, a ball in play can score him.`);
        why.push(`the ${bn} ${bp} gets a whiff ${pct(fb.whiff)}% of the time. your ${cn} ${cp}: ${pct(fc.whiff)}%.`);
        next = `next time with a man on third, go for the whiff: the ${bn} ${bp}.`;
        break;
      case 'dont_walk_the_tying_run': {
        // the principle's id stays; once it is tied, the run is the go-ahead run
        const kr = keyRun(st);
        headline = `don't walk the ${kr.word} run.`;
        why.push(st.bases === 7 && kr.need === 1 ? `${cw} with the bases loaded, a walk forces in the ${kr.word} run.`
          : `${cw}, a walk puts the ${kr.word} run ${kr.need <= runnersAfterWalk(st.bases) ? 'on base' : 'at the plate'}.`);
        why.push(`your ${cn} ${cp} is a ball ${pct(fc.ball)}% of the time. the ${bn} ${bp}: ${pct(fb.ball)}%.`);
        next = `next time ${cw}, make him hit the ${bn} ${bp}.`;
        break;
      }
      case 'use_your_best_pitch': {
        const top = model.arsenal.find(a => a.type === best.type);
        headline = `go to your best pitch: the ${bn}.`;
        why.push(`the ${bn} is ${pct(top.usage)}% of what he threw that year.`);
        why.push(`here it gets a whiff ${pct(fb.whiff)}% and gives up a hit ${pct(fb.hit)}%. your ${cn}: ${pct(fc.whiff)}% and ${pct(fc.hit)}%.`);
        next = `next time ${cw}, trust the ${bn}.`;
        break;
      }
    }
    why.push(st.margin >= 1 ? `your call held ${fmt1(grade.value)}%. the best held ${fmt1(grade.best)}%.`
      : `your call kept it tied ${fmt1(grade.value)}%. the best kept it tied ${fmt1(grade.best)}%.`);
    return { headline, why: why.slice(0, 3), nextTime: next };
  }

  /* ---- one note on the whole outing, when one is true ------------------------- */

  function patternOf(o, model) {
    const calls = o.calls, n = calls.length;
    if (n < 6) return undefined;
    const hard = calls.filter(c => K.FAMILY_OF[c.type] === 'hard').length;
    const out = calls.filter(c => !K.inZone(c.cell)).length;
    const walks = o.log.filter(p => p.paOver && (p.result === 'ball' || p.result === 'hit_by_pitch')).length;
    const brk = model.arsenal.filter(a => K.FAMILY_OF[a.type] !== 'hard').sort((a, b) => b.usage - a.usage)[0];
    const faced = new Set(o.before.map(s => model.who(s)));
    if (hard / n >= 0.75 && brk) {
      const bs = [...faced].map(i => o.pack.scenario.batters[i].profile.whiff[brk.type]).filter(x => x != null);
      const avg = bs.reduce((a, b) => a + b, 0) / (bs.length || 1);
      return `you threw ${hard} of ${n} fastballs. the hitters you faced miss ${pct(avg)}% of their swings at the ${brk.name}.`;
    }
    if (out / n >= 0.6 && walks >= 2) return `you threw ${out} of ${n} out of the zone and walked ${walks}.`;
    if ((n - out) / n >= 0.8) {
      const ch = [...faced].map(i => o.pack.scenario.batters[i].profile.chase);
      const avg = ch.reduce((a, b) => a + b, 0) / (ch.length || 1);
      return `you threw ${n - out} of ${n} in the zone. the hitters you faced chase ${pct(avg)}% out of it.`;
    }
    return undefined;
  }

  /* ---- the pro --------------------------------------------------------------- */

  function proFor(pack, principle, st, best, batter, pitcherHand) {
    const P = pack.pros;
    if (!P || !P.rows) return null;
    const bucket = G.BUCKETS[G.bucketOf(st.b, st.s)];
    const platoon = batter.bats === pitcherHand ? 'same' : 'opp';
    const fam = K.FAMILY_OF[best.type];
    const list = P.rows[`${principle}|${bucket}|${platoon}|${fam}`];
    if (!list || !list.length) return null;
    const want = rel(best.cell, batter.bats);
    const dist = r => Math.max(Math.abs(K.rowOf(r) - K.rowOf(want)), Math.abs(K.colOf(r) - K.colOf(want)));
    // rows: [pitcher, batter, date, game, b, s, outs, bases, type, cell, stand, result, id]
    let hit = list.find(r => dist(rel(r[9], r[10])) === 0) || list.find(r => dist(rel(r[9], r[10])) === 1);
    if (!hit) return null;
    return {
      pitcher: P.pitchers[hit[0]], batter: P.batters[hit[1]], date: hit[2], game: hit[3],
      count: { b: hit[4], s: hit[5] }, outs: hit[6], bases: hit[7], type: hit[8], cell: hit[9], bats: hit[10],
      result: hit[11], id: hit[12],
    };
  }

  /* ---- the lesson -------------------------------------------------------------- */

  function lessonFor(o) {
    if (!o.grades.length) return null;
    let n = 0;
    o.grades.forEach((g, i) => { if (g.lost > o.grades[n].lost) n = i; });
    const grade = o.grades[n];
    if (grade.band === 'green') return null;
    const model = o.model, pack = o.pack;
    const st = o.before[n];
    const call = o.calls[n];
    const best = grade.bestCall;
    const batter = pack.scenario.batters[model.who(st)];
    const bucket = G.bucketOf(st.b, st.s);
    const hctx = (o.ctxs && o.ctxs[n]) || null;
    const mc = keyMix(model, model.who(st), call.type, call.cell, bucket, st, hctx, call.at);
    const mb = keyMix(model, model.who(st), best.type, best.cell, bucket, st, hctx);
    const vals = keyValues(model, st, hctx);
    const vc = mc.reduce((a, p, k) => a + p * vals[k], 0);
    const contrib = { walk: 0, strike: 0, damage: 0, outs: 0 };
    G.KEYS.forEach((key, k) => { contrib[GROUP[key]] += (mb[k] - mc[k]) * (vals[k] - vc); });
    const ctx = { st, call, best, fc: features(mc), fb: features(mb), contrib, model, batter, grade,
      pitcherHand: pack.scenario.pitcher.throws };
    const principle = choose(ctx);
    if (!principle) return null;
    const words = copy(principle, ctx);
    const lesson = {
      pitchN: n + 1, call: { type: call.type, cell: call.cell }, bestCall: { type: best.type, cell: best.cell },
      count: { b: st.b, s: st.s }, outs: st.outs, bases: st.bases, tied: st.margin === 0, batter: batter.name, principle,
      headline: words.headline, why: words.why, nextTime: words.nextTime,
      numbers: { lostPts: grade.lost, callValue: grade.value, bestValue: grade.best },
      pro: proFor(pack, principle, st, best, batter, pack.scenario.pitcher.throws),
      contrib: Object.fromEntries(Object.entries(contrib).map(([k, v]) => [k, Math.round(v * 10000) / 100])),
    };
    const pat = patternOf(o, model);
    if (pat) lesson.pattern = pat;
    return lesson;
  }

  const api = Object.freeze({ PRINCIPLES, ONE_LINE, lessonFor, keyMix, keyValues, features, choose, proFor });
  if (NODE) module.exports = api;
  if (typeof window !== 'undefined') window.STD_LESSON = api;
})();
