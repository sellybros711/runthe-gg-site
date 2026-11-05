/* Shut The Door: the outing after it is over, window.STD_POSTGAME. Node: require('./postgame.js').
 *
 * Pure. Everything here is read off the engine's own log (engine.js throwPitch's records) and its
 * result (finishOuting). Nothing is drawn, nothing is graded here: the bands are the strip's.
 *
 *   atBats(log, scenario, strip)  one entry per plate appearance, in order, each with its hitter
 *                                 (the engine's own Model.who: the half's lineup at bi) and its
 *                                 pitches, each plotted where it CROSSED (log[i].actual, the aim
 *                                 after the release's miss), never where it was aimed
 *   box(log, result)              the outing's box line: pitches, strikes, balls, K, BB, H, R, HBP,
 *                                 plate appearances and first-pitch strikes
 *   summary(log, result)          the box line as the board keeps it (supabase/166): {v, p, s, b, k,
 *                                 bb, h, r, hbp, pa, fps}, small whole numbers only
 *   valid(stats)                  the shape and ranges 166 holds a summary to, the same rules
 *   point(actual)                 a crossing point on the 5x5 picture, PITCHER'S VIEW: [sx, sy] as
 *                                 fractions of the box, mirrored like aim.js's dots and screenCol()
 *
 * THE GRID. Data is the catcher's view (x toward the catcher's right); the picture is the pitcher's,
 * so x flips. The zone is the middle three columns and rows of the five. Copy says inside and away.
 */
(function () {
  'use strict';
  const NODE = typeof module !== 'undefined' && module.exports;
  const C = NODE ? require('./contract.js') : window.STD_CONTRACT;

  const V = 1;
  /* a pitch's result as the plot marks it */
  const KIND = { called_strike: 'called', ball: 'ball', swinging_strike: 'swing', foul_tip: 'swing', foul: 'foul', in_play: 'inplay', hit_by_pitch: 'hbp' };
  const KIND_WORD = { called: 'Called strike', ball: 'Ball', swing: 'Swinging strike', foul: 'Foul', inplay: 'In play', hbp: 'Hit by pitch' };
  const HITS = { single: '1B', double: '2B', triple: '3B', home_run: 'HR' };
  const PLAY = {
    single: ['1B', 'Single'], double: ['2B', 'Double'], triple: ['3B', 'Triple'], home_run: ['HR', 'Home run'],
    error: ['E', 'Reached on error'], double_play: ['DP', 'Double play'], sac_fly: ['SF', 'Sac fly'],
    fielders_choice: ['FC', 'Fielder\'s choice'],
  };
  const OUT_KIND = { ground: 'Groundout', line: 'Lineout', fly: 'Flyout', popup: 'Pop out' };

  function isStrike(res) { return res !== 'ball' && res !== 'hit_by_pitch'; }

  /* the crossing point on the picture: the same arithmetic as aim.js setPitches, as fractions */
  function point(a) {
    if (!a || !isFinite(a.x) || !isFinite(a.zn)) return null;
    const cx = Math.max(0, Math.min(5, a.x / C.GRID.COL_FT + 2.5));
    const ry = Math.max(0, Math.min(5, (1 - a.zn) / C.GRID.ROW_ZN + 1));
    return [(5 - cx) / 5, ry / 5];
  }

  /* how a plate appearance ended, from the pitch that ended it: a short code and its words */
  function endOf(p) {
    if (!p) return { code: '', word: '' };
    if (p.paOver) {
      if (p.result === 'in_play' && p.inPlay) {
        const r = p.inPlay.result;
        if (PLAY[r]) return { code: PLAY[r][0], word: PLAY[r][1], hit: !!HITS[r] };
        return { code: 'Out', word: OUT_KIND[p.inPlay.bb] || 'Out' };
      }
      if (p.result === 'hit_by_pitch') return { code: 'HBP', word: 'Hit by pitch' };
      if (p.result === 'ball') return { code: 'BB', word: 'Walk' };
      if (p.result === 'called_strike') return { code: 'K', word: 'Strikeout looking', k: true };
      return { code: 'K', word: 'Strikeout swinging', k: true };
    }
    if (p.steal && p.steal.result === 'out') return { code: 'CS', word: 'Caught stealing' };
    if (pickedOff(p)) return { code: 'PO', word: 'Picked off' };
    return { code: '', word: 'Still batting' };
  }
  /* a pickoff after this pitch that ended the half (engine.js pickoff: pr.pickoffs) */
  function pickedOff(p) { return !!(p.pickoffs && p.pickoffs.some(function (e) { return e.halfOver; })); }
  function halfEnds(p) { return !!p.halfOver || pickedOff(p); }
  /* runs on the pitch, and on a balk after it */
  function runsOn(p) { return (p.runs || 0) + (p.pickoffs || []).reduce(function (a, e) { return a + (e.runs || 0); }, 0); }

  /* the hitter at the plate, as the engine's Model.who reads it: the half's lineup at bi */
  function lineupOf(sc) {
    const halves = sc && sc.halves && sc.halves.length > 1 ? sc.halves : null;
    const n = halves ? halves[0].lineup.length : (sc && sc.batters ? sc.batters.length : 1);
    return { halves, n };
  }
  function whoAt(sc, L, h, bi) {
    const i = bi % L.n;
    return L.halves ? L.halves[Math.min(h, L.halves.length - 1)].lineup[i] : i;
  }

  function atBats(log, sc, strip) {
    const out = [], L = lineupOf(sc);
    let cur = null, h = 0, bi = 0;
    (log || []).forEach(function (p, i) {
      if (!cur) {
        const who = whoAt(sc, L, h, bi), b = sc && sc.batters ? sc.batters[who] : null;
        cur = { index: out.length, half: h, batter: who, name: b ? b.name : '', bats: b ? b.bats : null, from: i, pitches: [], runs: 0 };
        out.push(cur);
      }
      const k = KIND[p.result] || 'inplay';
      cur.pitches.push({
        n: i + 1, k: cur.pitches.length + 1, type: p.call && p.call.type, velo: p.velo, count: p.countBefore,
        result: p.result, kind: k, word: KIND_WORD[k], actual: p.actual || null, at: point(p.actual),
        aimed: p.call ? p.call.cell : null, cell: p.actualCell, band: strip ? strip[i] || null : null,
        challenged: !!(p.challenge), inPlay: p.inPlay ? p.inPlay.result : null,
      });
      cur.runs += runsOn(p);
      const end = p.paOver || halfEnds(p) || i === log.length - 1;
      if (!end) return;
      cur.to = i + 1;
      const e = endOf(p);
      cur.code = e.code; cur.word = e.word;
      if (p.paOver) bi++;
      if (halfEnds(p)) h++;
      cur = null;
    });
    return out;
  }

  /* the box line. R is the engine's (result.runs: the score's change, a balk or a steal of home
     included); without a result, the runs on the log */
  function box(log, result) {
    const b = { p: 0, s: 0, b: 0, k: 0, bb: 0, h: 0, r: 0, hbp: 0, pa: 0, fps: 0 };
    let first = true;
    (log || []).forEach(function (p) {
      b.p++;
      if (isStrike(p.result)) b.s++; else b.b++;
      if (first) { b.pa++; if (isStrike(p.result)) b.fps++; }
      first = false;
      if (p.result === 'hit_by_pitch') b.hbp++;
      b.r += runsOn(p);
      if (p.paOver) {
        const e = endOf(p);
        if (e.k) b.k++;
        if (e.code === 'BB') b.bb++;
        if (e.hit) b.h++;
      }
      if (p.paOver || halfEnds(p)) first = true;
    });
    if (result && typeof result.runs === 'number' && result.runs >= 0) b.r = result.runs;
    b.strikePct = b.p ? Math.round(100 * b.s / b.p) : null;
    b.fpsPct = b.pa ? Math.round(100 * b.fps / b.pa) : null;
    return b;
  }

  const KEYS = ['p', 's', 'b', 'k', 'bb', 'h', 'r', 'hbp', 'pa', 'fps'];
  function summary(log, result) {
    const b = box(log, result), o = { v: V };
    KEYS.forEach(function (k) { o[k] = b[k]; });
    return o;
  }
  /* the rules supabase/166 holds a summary to (shutdoor_stats_ok), the same ones */
  function shapeOk(s) {
    if (!s || typeof s !== 'object' || Array.isArray(s) || s.v !== V) return false;
    for (const k of Object.keys(s)) if (k !== 'v' && KEYS.indexOf(k) < 0) return false;
    for (const k of KEYS) if (!Number.isInteger(s[k]) || s[k] < 0) return false;
    if (s.p < 1 || s.s + s.b !== s.p || s.pa < 1 || s.pa > s.p || s.fps > s.pa) return false;
    if (s.k + s.bb + s.hbp + s.h > s.pa || s.hbp > s.b || s.bb > s.b || s.k > s.s) return false;
    return true;
  }
  function valid(s, pitches) {
    if (!shapeOk(s) || s.p > 150 || s.r > 99) return false;
    return pitches == null || s.p === pitches;
  }

  /* the board's stat line: five of the box's numbers, the owner's ask (2026-11-05) */
  function line(s) {
    if (!shapeOk(s)) return '';
    return s.p + ' P · ' + s.s + ' S · ' + s.k + ' K · ' + s.h + ' H · ' + s.r + ' R';
  }
  /* several summaries added up (Survivor's run): null unless every one is there and valid */
  function sum(list) {
    if (!Array.isArray(list) || !list.length) return null;
    const o = { v: V };
    KEYS.forEach(function (k) { o[k] = 0; });
    for (const s of list) {
      if (!valid(s)) return null;
      KEYS.forEach(function (k) { o[k] += s[k]; });
    }
    return o;
  }

  const api = { API_VERSION: 1, V, KIND, KIND_WORD, KEYS, point, atBats, box, summary, valid, shapeOk, line, sum, endOf };
  if (NODE) module.exports = api;
  else window.STD_POSTGAME = api;
})();
