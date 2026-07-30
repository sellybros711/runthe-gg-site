/* CFB Perfect Season, game engine.
 *
 * Headless, dependency-free. Works in Node (module.exports) and in the browser
 * (window.PS_CFB_ENGINE). All game logic lives here: roster evaluation,
 * chemistry, scheduling, game resolution, display score mapping.
 *
 * Mirrors football/engine.js in architecture but tuned for college football:
 *   - NIL budget ($14M cap vs NFL $140M)
 *   - 12-game regular season
 *   - 12-team CFP (bye for 12-0, first round for 11-1)
 *   - Bowl games for non-playoff teams, themed by roster identity
 *   - CFB-specific chemistry (program, home state, conference, coach)
 *   - CFB-specific offensive schemes (Spread, Air Raid, RPO, etc.)
 */

'use strict';
(function(){

const ENGINE_API_VERSION = 1;

// ─── constants ──────────────────────────────────────────────────────────────

const CONSTANTS = {
  SCALE: 2.2,
  CAP_MUSD: 14,
  RESPIN_LADDER_MUSD: [0.5, 1.0, 1.5],
  MAX_RESPINS: 3,
  MIN_RESERVE_PER_SLOT_MUSD: 0.3,
  REGULAR_SEASON_GAMES: 12,
  BYE_WINS: 12,
  PLAYOFF_WINS: 11,
  PLAYOFF_ROUNDS_WITH_BYE: 2,
  PLAYOFF_ROUNDS_NO_BYE: 3,
  NY6_MAX_LOSSES: 3,
  BOWL_MAX_LOSSES: 5,
  MINOR_BOWL_MAX_LOSSES: 6,
  // How much each side's score is pulled toward its true mean each game. Higher
  // means less week-to-week noise, so roster strength wins out and better teams go
  // farther. The opponent used to be fully random (OPP_CONSISTENCY effectively 0),
  // which let weak opponents get hot and upset strong rosters regardless of talent;
  // damping both sides makes the playoff and a title track real quality.
  CONSISTENCY: 0.40,
  OPP_CONSISTENCY: 0.40,
  PLAYOFF_HOME_FIELD: 0.35,
};

// ─── respin ─────────────────────────────────────────────────────────────────

function respinCost(used) {
  const L = CONSTANTS.RESPIN_LADDER_MUSD;
  return L[Math.min(used, L.length - 1)];
}

function respinFees(used) {
  let total = 0;
  for (let i = 0; i < used; i++) total += respinCost(i);
  return total;
}

// ─── scoring decomposition ──────────────────────────────────────────────────

const SCORE_KINDS = [
  { pts: 7, label: 'touchdown' },
  { pts: 3, label: 'field goal' },
  { pts: 6, label: 'TD (missed PAT)' },
  { pts: 2, label: 'safety' },
  { pts: 8, label: 'two-point conversion' },
];

function compositionsFor(n) {
  if (n <= 0) return [[0, 0, 0, 0, 0]];
  const results = [];
  const maxTds = Math.floor(n / 7);
  for (let td = maxTds; td >= 0; td--) {
    const r1 = n - td * 7;
    const maxFg = Math.floor(r1 / 3);
    for (let fg = maxFg; fg >= 0; fg--) {
      const r2 = r1 - fg * 3;
      if (r2 === 0) { results.push([td, fg, 0, 0, 0]); continue; }
      const maxMissed = Math.floor(r2 / 6);
      for (let missed = maxMissed; missed >= 0; missed--) {
        const r3 = r2 - missed * 6;
        const maxSafety = Math.floor(r3 / 2);
        for (let safety = maxSafety; safety >= 0; safety--) {
          const r4 = r3 - safety * 2;
          if (r4 === 0) results.push([td, fg, missed, safety, 0]);
          if (r4 === 8) results.push([td, fg, missed, safety, 1]);
        }
      }
    }
    if (results.length > 40) break;
  }
  return results.length ? results : [[0, 0, 0, 0, 0]];
}

function scoreParts(total, rng) {
  let left = Math.max(0, Math.round(total));
  if (left === 1) left = 2;
  if (left === 0) return [];
  const comps = compositionsFor(left);
  if (!comps.length) return [{ points: 7, kind: 'TOUCHDOWN' }];
  // A real game is touchdowns and field goals, the odd missed PAT or two-point
  // try, and safeties almost never. Picking a composition uniformly buried the
  // realistic ones under a pile of all-safety decompositions, so a box score
  // read as ten safeties. Weight the draw the way points are actually scored.
  const weight = (c) => Math.pow(1.95, c[0]) * Math.pow(0.05, c[3]) * Math.pow(0.4, c[2]) * Math.pow(0.5, c[4]);
  let totalW = 0; for (const cc of comps) totalW += weight(cc);
  let pick = rng() * totalW, c = comps[comps.length - 1];
  for (const cc of comps) { pick -= weight(cc); if (pick <= 0) { c = cc; break; } }
  const out = [];
  for (let i = 0; i < c[0]; i++) out.push({ points: 7, kind: 'TOUCHDOWN' });
  for (let i = 0; i < c[1]; i++) out.push({ points: 3, kind: 'FIELD GOAL' });
  for (let i = 0; i < c[2]; i++) out.push({ points: 6, kind: 'TOUCHDOWN', note: 'missed PAT' });
  for (let i = 0; i < c[3]; i++) out.push({ points: 2, kind: 'SAFETY' });
  for (let i = 0; i < c[4]; i++) out.push({ points: 8, kind: 'TOUCHDOWN', note: 'two-point conversion' });
  return out;
}

function scoringScript(you, them, won, rng) {
  const QUARTERS = 4, QSEC = 15 * 60, GAME = QUARTERS * QSEC;
  const yParts = scoreParts(you, rng).map((k) => ({ ...k, team: 'you' }));
  const tParts = scoreParts(them, rng).map((k) => ({ ...k, team: 'them' }));
  if (!yParts.length && !tParts.length) return [];

  const margin = you - them;
  const winner = margin >= 0 ? 'you' : 'them';
  let clincher = null;
  if (margin !== 0 && Math.abs(margin) <= 8) {
    clincher = (winner === 'you' ? yParts : tParts).pop();
  }

  const y = yParts.slice(), t = tParts.slice(), order = [];
  while (y.length || t.length) {
    const a = order.length;
    const twoSame = a >= 2 && order[a - 1].team === order[a - 2].team ? order[a - 1].team : null;
    let takeYou;
    if (!t.length) takeYou = true;
    else if (!y.length) takeYou = false;
    else if (twoSame === 'you') takeYou = false;
    else if (twoSame === 'them') takeYou = true;
    else takeYou = y.length >= t.length;
    order.push((takeYou ? y : t).shift());
  }
  if (clincher) order.push(clincher);

  const n = order.length;
  const el = [];
  for (let i = 0; i < n; i++) {
    if (clincher && i === n - 1) { el.push(GAME - (25 + Math.floor(rng() * (5 * 60)))); continue; }
    const lo = (i / n) * GAME, span = GAME / n;
    el.push(lo + span * (0.15 + rng() * 0.7));
  }

  const quarterOf = (t0) => Math.min(QUARTERS - 1, Math.floor(t0 / QSEC));
  const badLateFG = () => {
    const idx = order.map((e, i) => i).sort((a, b) => el[a] - el[b]);
    let ry = 0, rt = 0;
    for (const i of idx) {
      const e = order[i];
      const behind = e.team === 'you' ? rt - ry : ry - rt;
      if (e.kind === 'FIELD GOAL' && quarterOf(el[i]) === QUARTERS - 1 && behind > 3) return i;
      if (e.team === 'you') ry += e.points; else rt += e.points;
    }
    return -1;
  };
  for (let guard = 0; guard < n + 4; guard++) {
    const bad = badLateFG();
    if (bad < 0) break;
    el[bad] = Math.floor(rng() * (3 * QSEC));
  }

  const idx = order.map((e, i) => i).sort((a, b) => el[a] - el[b]);
  const secs = idx.map((i) => Math.max(1, Math.min(GAME - 1, Math.floor(el[i]))));
  for (let i = 1; i < secs.length; i++) if (secs[i] <= secs[i - 1]) secs[i] = Math.min(GAME - 1, secs[i - 1] + 1);

  let ry = 0, rt = 0;
  return idx.map((i, k) => {
    const e = order[i];
    const t0 = secs[k];
    const q = quarterOf(t0);
    const sec = Math.max(1, Math.min(QSEC - 1, QSEC - (t0 - q * QSEC)));
    if (e.team === 'you') ry += e.points; else rt += e.points;
    return {
      q: q + 1, sec,
      clock: Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'),
      team: e.team, kind: e.kind, note: e.note || null, points: e.points,
      you: ry, them: rt,
    };
  });
}

// ─── playoff / bowl structure ───────────────────────────────────────────────

const PLAYOFF_ROUND_NAMES_BYE = ['CFP Semifinal', 'CFP Championship'];
const PLAYOFF_ROUND_NAMES_NO_BYE = ['CFP First Round', 'CFP Semifinal', 'CFP Championship'];

function playoffRoundNames(rounds) {
  return rounds === 2 ? PLAYOFF_ROUND_NAMES_BYE : PLAYOFF_ROUND_NAMES_NO_BYE;
}

function seedFromRecord(wins) {
  if (wins >= CONSTANTS.BYE_WINS) {
    return { made: true, bye: true, rounds: CONSTANTS.PLAYOFF_ROUNDS_WITH_BYE,
      label: 'CFP top seed (bye)' };
  }
  if (wins >= CONSTANTS.PLAYOFF_WINS) {
    return { made: true, bye: false, rounds: CONSTANTS.PLAYOFF_ROUNDS_NO_BYE,
      label: 'CFP qualifier' };
  }
  const losses = CONSTANTS.REGULAR_SEASON_GAMES - wins;
  if (losses <= CONSTANTS.NY6_MAX_LOSSES) {
    return { made: false, bowl: 'ny6', rounds: 1, label: 'New Year\'s Six Bowl' };
  }
  if (losses <= CONSTANTS.BOWL_MAX_LOSSES) {
    return { made: false, bowl: 'bowl', rounds: 1, label: 'Bowl Game' };
  }
  if (losses <= CONSTANTS.MINOR_BOWL_MAX_LOSSES) {
    return { made: false, bowl: 'minor', rounds: 1, label: 'Minor Bowl' };
  }
  return { made: false, bowl: null, rounds: 0, label: 'Season over' };
}

// ─── bowl theming ───────────────────────────────────────────────────────────

const BOWL_ARCHETYPES = [
  {
    key: 'air_raid',
    name: 'Air Raid Bowl',
    detect(roster) {
      const qb = roster.find(p => p.position === 'QB');
      if (!qb || (qb.pass_ppg || 0) < 14) return -1;
      const wrs = roster.filter(p => p.position === 'WR');
      const totalRec = wrs.reduce((s, p) => s + (p.rec_ppg || 0), 0);
      if (totalRec < 12) return -1;
      return clamp(((qb.pass_ppg || 0) - 14) / 10 + (totalRec - 12) / 10, 0, 1);
    },
    tagline: 'The passing game was the whole show.',
  },
  {
    key: 'ground_pound',
    name: 'Ground & Pound Bowl',
    detect(roster) {
      const rbs = roster.filter(p => p.position === 'RB');
      const totalRush = rbs.reduce((s, p) => s + (p.rush_ppg || 0), 0);
      if (totalRush < 10) return -1;
      return clamp((totalRush - 10) / 8, 0, 1);
    },
    tagline: 'They never stopped running.',
  },
  {
    key: 'brotherhood',
    name: 'Brotherhood Bowl',
    detect(roster, chemResult) {
      if (!chemResult || chemResult.net < 0.08) return -1;
      return clamp((chemResult.net - 0.08) / 0.07, 0, 1);
    },
    tagline: 'These players knew each other, and it showed.',
  },
  {
    key: 'one_man_army',
    name: 'One Man Army Bowl',
    detect(roster) {
      const total = roster.reduce((s, p) => s + p.ppr_ppg_mean, 0);
      if (!total) return -1;
      const topShare = Math.max(...roster.map(p => p.ppr_ppg_mean)) / total;
      if (topShare < 0.35) return -1;
      return clamp((topShare - 0.35) / 0.15, 0, 1);
    },
    tagline: 'One player carried this team on his back.',
  },
  {
    key: 'cinderella',
    name: 'Cinderella Bowl',
    detect(roster) {
      const spend = roster.reduce((s, p) => s + p.price_musd, 0);
      if (spend > CONSTANTS.CAP_MUSD * 0.6) return -1;
      return clamp((CONSTANTS.CAP_MUSD * 0.6 - spend) / (CONSTANTS.CAP_MUSD * 0.3), 0, 1);
    },
    tagline: 'Nobody expected this team to be here.',
  },
  {
    key: 'home_state',
    name: 'Home State Bowl',
    detect(roster) {
      const states = roster.map(p => p.home_state).filter(Boolean);
      if (states.length < 3) return -1;
      const counts = {};
      for (const s of states) counts[s] = (counts[s] || 0) + 1;
      const max = Math.max(...Object.values(counts));
      if (max < 3) return -1;
      return clamp((max - 3) / 2, 0, 1);
    },
    tagline: 'They all grew up in the same backyard.',
  },
];

const GENERIC_BOWL_NAMES = [
  'Independence Bowl', 'Sun Bowl', 'Liberty Bowl', 'Music City Bowl',
  'Gator Bowl', 'Citrus Bowl', 'Alamo Bowl', 'Holiday Bowl',
  'Las Vegas Bowl', 'Texas Bowl', 'Duke\'s Mayo Bowl', 'Pinstripe Bowl',
];

function selectBowl(roster, chemResult, rng) {
  let best = null, bestFit = -1;
  for (const arch of BOWL_ARCHETYPES) {
    const fit = arch.detect(roster, chemResult);
    if (fit > bestFit) { bestFit = fit; best = arch; }
  }
  if (best && bestFit >= 0) {
    return { key: best.key, name: best.name, tagline: best.tagline, fit: bestFit };
  }
  const name = GENERIC_BOWL_NAMES[Math.floor(rng() * GENERIC_BOWL_NAMES.length)];
  return { key: 'generic', name, tagline: 'A solid season deserves one more game.', fit: 0 };
}

// ─── chemistry ──────────────────────────────────────────────────────────────

const CHEMISTRY = {
  VALUES: {
    battery: 0.10,
    teammates: 0.05,
    program: 0.03,
    family: 0.03,
    home_state: 0.02,
    conference: 0.02,
    coach: 0.02,
  },
  MIN: -0.10,
  MAX: 0.15,
};

// ─── color utilities ────────────────────────────────────────────────────────

function relativeLuminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const f = (c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(hex1, hex2) {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2), darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function hexToHsl(hex) {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h * 360, s * 100, l * 100];
}

function hslToHex(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (c) => Math.round(c * 255).toString(16).padStart(2, '0');
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

function washColor(hex, targetL) {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, Math.min(s, 40), targetL);
}

function washColors(color, altColor) {
  const bg = washColor(color || '#333333', 15);
  const accent = washColor(altColor || color || '#666666', 30);
  return { bg, accent };
}

// The wheel wants the team's real colors, not paint-on-grass. Boost dull colors
// up to a saturation floor (already-vivid ones keep their own), and set a lightness
// that stays dark enough for the white landed text while reading as the true hue.
function wheelColor(hex, minS, targetL) {
  const [h, s] = hexToHsl(hex);
  return hslToHex(h, Math.min(100, Math.max(s, minS)), targetL);
}

function wheelColors(color, altColor) {
  const bg = wheelColor(color || '#334155', 55, 26);
  const accent = wheelColor(altColor || color || '#94a3b8', 70, 55);
  return { bg, accent };
}

function teamColors(team) {
  return {
    color: team.color || '#333333',
    alt_color: team.alt_color || '#ffffff',
    abbreviation: team.abbreviation || team.school.slice(0, 4).toUpperCase(),
  };
}

function teamButton(team) {
  const c = teamColors(team);
  const bg = c.color;
  const onWhite = contrast(bg, '#ffffff');
  const onBlack = contrast(bg, '#000000');
  const ink = onWhite >= onBlack ? '#ffffff' : '#000000';
  return { bg, ink };
}

function teamInk(team) {
  const c = teamColors(team);
  const onWhite = contrast(c.color, '#ffffff');
  return onWhite >= 4.5 ? c.color : c.alt_color;
}

// ─── link tiers ─────────────────────────────────────────────────────────────

const LINK_TIERS = [
  { min: 0.08, label: 'strong' },
  { min: 0.04, label: 'good' },
  { min: 0.01, label: 'weak' },
];

function linkTier(value) {
  for (const t of LINK_TIERS) if (value >= t.min) return t.label;
  return 'none';
}

// ─── roster structure ───────────────────────────────────────────────────────

const STRUCTURE = {
  QB_BASELINE_PASS_PPG: 12.1,
  QB_SUPPORT_FLOOR: 0.62,
  QB_SUPPORT_CEIL: 1.18,
  IDEAL_RUSH_SHARE: 0.34,
  RUSH_SHARE_TOLERANCE: 0.12,
  BALANCE_WEIGHT: 1.05,
  IDEAL_TOP_SHARE: 0.24,
  CONCENTRATION_WEIGHT: 0.70,
  IDEAL_FLOOR_SHARE: 0.64,
  FLOOR_TOLERANCE: 0.14,
  FLOOR_WEIGHT: 1.30,
  SHAPE_STRENGTH: 0.5,
  MIN: 0.50,
  MAX: 1.18,
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const over = (v, min, span) => clamp(((v || 0) - min) / span, 0, 1);
const fitAvg = (...xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

const SCHEMES = [
  {
    key: 'spread',
    name: 'Spread Offense',
    detect(roster) {
      const qb = roster.find(p => p.position === 'QB');
      if (!qb || (qb.pass_ppg || 0) < 13 || (qb.rush_ppg || 0) < 3) return -1;
      const wrs = roster.filter(p => p.position === 'WR' && (p.rec_ppg || 0) >= 6);
      if (wrs.length < 2) return -1;
      return fitAvg(over(qb.pass_ppg, 13, 7), over(qb.rush_ppg, 3, 5),
        over(wrs[0].rec_ppg, 6, 7), over(wrs[1].rec_ppg, 6, 7));
    },
    strength: 'Spread Offense. A mobile QB and receivers who stretch the field.',
  },
  {
    key: 'air_raid',
    name: 'Air Raid',
    detect(roster) {
      const qb = roster.find(p => p.position === 'QB');
      if (!qb || (qb.pass_ppg || 0) < 16) return -1;
      const wrs = roster.filter(p => p.position === 'WR' && (p.rec_ppg || 0) >= 8)
        .sort((a, b) => (b.rec_ppg || 0) - (a.rec_ppg || 0));
      if (wrs.length < 2) return -1;
      return fitAvg(over(qb.pass_ppg, 16, 7), over(wrs[0].rec_ppg, 8, 7), over(wrs[1].rec_ppg, 8, 7));
    },
    strength: 'Air Raid. The passing game can carry this team.',
  },
  {
    key: 'pro_style',
    name: 'Pro Style',
    detect(roster) {
      const qb = roster.find(p => p.position === 'QB');
      if (!qb || (qb.pass_ppg || 0) < 12) return -1;
      const te = roster.filter(p => p.position === 'TE').sort((a, b) => (b.rec_ppg || 0) - (a.rec_ppg || 0))[0];
      if (!te || (te.rec_ppg || 0) < 5) return -1;
      const rb = roster.filter(p => p.position === 'RB').sort((a, b) => (b.rush_ppg || 0) - (a.rush_ppg || 0))[0];
      if (!rb || (rb.rush_ppg || 0) < 6) return -1;
      return fitAvg(over(qb.pass_ppg, 12, 8), over(te.rec_ppg, 5, 5), over(rb.rush_ppg, 6, 6));
    },
    strength: 'Pro Style. Balanced and disciplined at every position.',
  },
  {
    key: 'power_run',
    name: 'Power Run',
    detect(roster) {
      const rb = roster.filter(p => p.position === 'RB').sort((a, b) => (b.rush_ppg || 0) - (a.rush_ppg || 0))[0];
      if (!rb || (rb.rush_ppg || 0) < 10) return -1;
      const te = roster.filter(p => p.position === 'TE').sort((a, b) => b.ppr_ppg_mean - a.ppr_ppg_mean)[0];
      if (!te || te.ppr_ppg_mean < 5) return -1;
      return fitAvg(over(rb.rush_ppg, 10, 7), over(te.ppr_ppg_mean, 5, 8));
    },
    strength: 'Power Run. The ground game controls the clock.',
  },
  {
    key: 'rpo',
    name: 'RPO',
    detect(roster) {
      const qb = roster.find(p => p.position === 'QB');
      if (!qb || (qb.rush_ppg || 0) < 4 || (qb.pass_ppg || 0) < 10) return -1;
      const rb = roster.filter(p => p.position === 'RB').sort((a, b) => (b.rush_ppg || 0) - (a.rush_ppg || 0))[0];
      if (!rb || (rb.rush_ppg || 0) < 7) return -1;
      return fitAvg(over(qb.rush_ppg, 4, 5), over(qb.pass_ppg, 10, 8), over(rb.rush_ppg, 7, 7));
    },
    strength: 'RPO. The defense never knows if it\'s a run or a pass.',
  },
  {
    key: 'dual_threat',
    name: 'Dual Threat',
    detect(roster) {
      const qb = roster.find(p => p.position === 'QB');
      if (!qb || (qb.rush_ppg || 0) < 4) return -1;
      return over(qb.rush_ppg, 4, 6);
    },
    strength: 'Dual Threat quarterback. Defenses cannot key on one thing.',
  },
];

function detectScheme(roster) {
  for (const s of SCHEMES) {
    const fit = s.detect(roster);
    if (fit >= 0) return { key: s.key, name: s.name, fit: clamp(fit, 0, 1) };
  }
  return null;
}

function rosterStructure(roster) {
  const S = STRUCTURE;
  const sum = (f) => roster.reduce((t, p) => t + (f(p) || 0), 0);
  const total = sum(p => p.ppr_ppg_mean);
  if (!total) {
    return { multiplier: 1, qbSupport: 1, balance: 1, concentration: 1,
      rushShare: 0, topShare: 0, qbPass: 0 };
  }

  const qb = roster.find(p => p.position === 'QB');
  const qbPass = qb ? (qb.pass_ppg || 0) : 0;
  const qbSupport = clamp(
    0.55 + 0.45 * (qbPass / S.QB_BASELINE_PASS_PPG),
    S.QB_SUPPORT_FLOOR, S.QB_SUPPORT_CEIL,
  );

  const rush = sum(p => p.rush_ppg);
  const rec = sum(p => p.rec_ppg);
  const ground = rush + rec;
  const rushShare = ground > 0 ? rush / ground : 0;
  const balance = 1 - S.BALANCE_WEIGHT
    * Math.max(0, Math.abs(rushShare - S.IDEAL_RUSH_SHARE) - S.RUSH_SHARE_TOLERANCE);

  const topShare = Math.max(...roster.map(p => p.ppr_ppg_mean)) / total;
  const concentration = 1 - S.CONCENTRATION_WEIGHT * Math.max(0, topShare - S.IDEAL_TOP_SHARE);

  const ppg = roster.map(p => p.ppr_ppg_mean).sort((x, y) => x - y);
  const avg = total / roster.length;
  const floorShare = roster.length >= 2 && avg > 0 ? ((ppg[0] + ppg[1]) / 2) / avg : 1;
  const floor = 1 - S.FLOOR_WEIGHT
    * Math.max(0, S.IDEAL_FLOOR_SHARE - floorShare - S.FLOOR_TOLERANCE);

  const scheme = detectScheme(roster);

  const effective = sum(p => p.pass_ppg) + rush + rec * qbSupport;
  const SCHEME_MIN_BONUS = 0.01, SCHEME_MAX_BONUS = 0.03;
  const schemeBonus = scheme
    ? SCHEME_MIN_BONUS + (SCHEME_MAX_BONUS - SCHEME_MIN_BONUS) * scheme.fit : 0;

  const shape = (effective / total) * balance * concentration * Math.max(0.3, floor);
  const shapeDamped = 1 + (shape - 1) * S.SHAPE_STRENGTH;
  const multiplier = clamp(shapeDamped + schemeBonus, S.MIN, S.MAX);

  return { multiplier, qbSupport, balance, concentration, floor, floorShare,
    rushShare, topShare, qbPass, total, scheme: scheme ? scheme.key : null,
    schemeBonus, shape, shapeDamped };
}

// ─── coach report ───────────────────────────────────────────────────────────

function coachReport(roster, chemResult) {
  const st = rosterStructure(roster);
  const spend = roster.reduce((s, p) => s + p.price_musd, 0);
  const total = st.total;
  const strengths = [];
  const weaknesses = [];

  if (st.qbPass >= 18) strengths.push('Elite arm. This quarterback can carry a game.');
  else if (st.qbPass < 6) weaknesses.push('No real passer. The receivers are stranded.');

  if (st.scheme) {
    const s = SCHEMES.find(x => x.key === st.scheme);
    if (s) strengths.push(s.strength);
  }

  if (st.balance >= 0.98) strengths.push('Good balance between run and pass.');
  else if (st.balance < 0.90) weaknesses.push('One-dimensional. Defenses will adjust.');

  if (st.concentration >= 0.98) strengths.push('Points spread across the roster.');
  else if (st.concentration < 0.90) weaknesses.push('Too reliant on one player.');

  if (st.floor >= 0.95) strengths.push('No weak links.');
  else if (st.floor < 0.80) weaknesses.push('The bottom of this roster is a liability.');

  const chem = chemResult ? chemResult.net : 0;
  if (chem >= 0.08) strengths.push('These players know each other, and it shows.');
  else if (chem < 0.01) weaknesses.push('No chemistry. Six strangers.');

  const unspent = CONSTANTS.CAP_MUSD - spend;
  if (unspent >= 3) weaknesses.push(`$${unspent.toFixed(1)}M unspent. That was a better player.`);
  else if (unspent <= 0.5) strengths.push('Used the whole NIL budget.');

  const swing = roster.reduce((t, p) => t + p.ppr_ppg_sd, 0) / Math.max(1, total);
  if (swing > 0.22) weaknesses.push('Boom-or-bust. Big upside but inconsistent.');
  else if (swing < 0.12) strengths.push('Consistent week to week.');

  let verdict;
  if (total >= 70 && st.multiplier >= 1.05 && chem >= 0.06) verdict = 'National championship contender.';
  else if (total >= 55 && st.multiplier >= 0.95) verdict = 'Playoff-caliber roster.';
  else if (total >= 40) verdict = 'Bowl-eligible. Maybe more with some luck.';
  else verdict = 'This team needs more talent.';

  return { structure: st, strengths, weaknesses, verdict, totalFppg: total, swing };
}

// ─── slots ──────────────────────────────────────────────────────────────────

const SLOTS = ['QB', 'RB', 'WR', 'WR', 'TE', 'FLEX'];
const SLOT_ELIGIBILITY = {
  QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], FLEX: ['RB', 'WR', 'TE'],
};

// ─── randomness ─────────────────────────────────────────────────────────────

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  return Math.abs(h);
}

function createSeededRNG(seed) {
  let s = seed >>> 0;
  return function () {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rng) {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

function gammaShape(k, rng) {
  if (k < 1) return gammaShape(1 + k, rng) * Math.pow(rng(), 1 / k);
  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do { x = normal(rng); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function sampleGamma(mean, sd, rng) {
  if (!(mean > 0)) return 0;
  if (!(sd > 0)) return mean;
  const shape = (mean / sd) ** 2;
  const scale = (sd * sd) / mean;
  return gammaShape(shape, rng) * scale;
}

// ─── chemistry resolution ───────────────────────────────────────────────────

const pkey = (p) => `${p.player_id}|${p.season}`;

function pairLinks(a, b, ctx) {
  const out = [];
  const V = CHEMISTRY.VALUES;

  const bat = ctx.battery || {};
  for (const [qb, rec] of [[a, b], [b, a]]) {
    const list = bat[pkey(qb)];
    if (list) {
      const hit = list.find(l => l.receiver === pkey(rec));
      if (hit) out.push({ type: 'battery', value: V.battery, label: hit.label, short: 'Threw to him' });
    }
  }

  if (a.team_season_id && a.team_season_id === b.team_season_id) {
    out.push({
      type: 'teammates', value: V.teammates,
      label: `Teammates on the ${a.season} ${a.school}`,
      short: 'Teammates',
    });
  } else if (a.school && a.school === b.school) {
    out.push({
      type: 'program', value: V.program,
      label: `Both played at ${a.school}`,
      short: `Both ${a.school}`,
    });
  }

  const fam = (ctx.curated?.family || []).find(
    f => (f.a === a.name && f.b === b.name) || (f.a === b.name && f.b === a.name),
  );
  if (fam) {
    out.push({
      type: 'family', value: V.family,
      label: fam.kind === 'brothers' ? 'Brothers' : fam.label,
      short: 'Family',
    });
  }

  if (a.home_state && b.home_state && a.home_state === b.home_state) {
    out.push({
      type: 'home_state', value: V.home_state,
      label: `Both from ${a.home_state}`,
      short: `Both ${a.home_state}`,
    });
  }

  if (a.conference && b.conference && a.conference === b.conference) {
    out.push({
      type: 'conference', value: V.conference,
      label: `Both in the ${a.conference}`,
      short: a.conference,
    });
  }

  const coaches = ctx.coaches || {};
  const ca = coaches[a.team_season_id]?.hc;
  const cb = coaches[b.team_season_id]?.hc;
  if (ca && cb && ca === cb) {
    out.push({
      type: 'coach', value: V.coach,
      label: `Both coached by ${ca}`,
      short: ca.split(' ').slice(-1)[0] + ' coached both',
    });
  }

  out.sort((x, y) => y.value - x.value);
  return out;
}

function resolveChemistry(roster, ctx) {
  const links = [];
  for (let i = 0; i < roster.length; i++) {
    for (let j = i + 1; j < roster.length; j++) {
      const best = pairLinks(roster[i], roster[j], ctx)[0];
      if (best) links.push({ ...best, a: roster[i].name, b: roster[j].name });
    }
  }
  const positives = links.filter(l => l.value > 0).sort((a, b) => b.value - a.value);
  const negatives = links.filter(l => l.value < 0);

  const raw = positives.reduce((s, l) => s + l.value, 0);
  const saturated = CHEMISTRY.MAX * (1 - Math.exp(-raw / CHEMISTRY.MAX));
  const penalties = negatives.reduce((s, l) => s + l.value, 0);
  const net = Math.max(CHEMISTRY.MIN, Math.min(CHEMISTRY.MAX, saturated + penalties));

  return {
    multiplier: 1 + net,
    raw,
    saturated,
    net,
    links: positives.concat(negatives),
  };
}

// ─── schedule ───────────────────────────────────────────────────────────────

function orderSchedule(games, rng) {
  const sorted = [...games].sort((a, b) => a.strength_z - b.strength_z);
  const ordered = new Array(games.length);
  const mid = Math.floor(games.length / 2);
  let lo = 0, hi = games.length - 1;
  for (let i = 0; i < games.length; i++) {
    if (i % 2 === 0) ordered[mid + Math.floor(i / 2)] = sorted[hi--];
    else ordered[mid - Math.ceil(i / 2)] = sorted[lo++];
  }
  for (let i = ordered.length - 1; i > 0; i--) {
    const window = Math.min(3, i);
    const j = i - Math.floor(rng() * window);
    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
  }
  return ordered;
}

function generateSchedule(data, rng, opts = {}) {
  const tolerance = opts.tolerance ?? 0.05;
  const maxElite = opts.maxElite ?? 3;
  const maxAttempts = opts.maxAttempts ?? 400;
  const count = opts.games ?? CONSTANTS.REGULAR_SEASON_GAMES;

  const { byProgram, eliteThreshold, meanScheduleStrength } = data;
  const programs = Object.keys(byProgram);

  let best = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const used = new Set();
    const unordered = [];
    let guard = 0;
    while (unordered.length < count && guard++ < 500) {
      const p = programs[Math.floor(rng() * programs.length)];
      if (used.has(p)) continue;
      used.add(p);
      const pool = byProgram[p];
      unordered.push(pool[Math.floor(rng() * pool.length)]);
    }
    if (unordered.length < count) continue;
    const ordered = orderSchedule(unordered, rng);
    const total = ordered.reduce((sum, g) => sum + g.strength_z, 0);
    const elite = ordered.filter(g => g.strength_z >= eliteThreshold).length;
    const drift = Math.abs(total - meanScheduleStrength);
    const ok = drift <= Math.abs(meanScheduleStrength * tolerance) + tolerance * count
      && elite <= maxElite;
    if (ok) return { games: ordered, total, elite, attempts: attempt + 1 };
    if (!best || drift < best.drift) best = { games: ordered, total, elite, drift, attempts: attempt + 1 };
  }
  return { games: best.games, total: best.total, elite: best.elite,
    attempts: maxAttempts, relaxed: true };
}

// ─── playoff & bowl opponents ───────────────────────────────────────────────

function pickFrom(pool, rng) {
  return pool[Math.floor(rng() * pool.length)];
}

function generatePlayoffs(data, rng, opts = {}) {
  const count = opts.count ?? CONSTANTS.PLAYOFF_ROUNDS_NO_BYE;
  const { goodPool, greatPool, elitePool } = data;

  const ladder = [];
  if (count >= 3) ladder.push(pickFrom(goodPool, rng));
  ladder.push(pickFrom(greatPool, rng));
  ladder.push(pickFrom(elitePool.length ? elitePool : greatPool, rng));

  return ladder.slice(ladder.length - Math.min(count, ladder.length));
}

function playoffOpponent(playoffs, rounds, roundIdx) {
  return playoffs[Math.min(roundIdx, playoffs.length - 1)];
}

function generateBowlOpponent(data, rng, tier) {
  if (tier === 'ny6') return pickFrom(data.greatPool.length ? data.greatPool : data.goodPool, rng);
  if (tier === 'bowl') return pickFrom(data.goodPool.length ? data.goodPool : data.bowlPool, rng);
  return pickFrom(data.bowlPool.length ? data.bowlPool : data.goodPool, rng);
}

// ─── game resolution ────────────────────────────────────────────────────────

function resolveGame(roster, chemistryMultiplier, opponent, leagueAvgAllowed, rng, constants = CONSTANTS, advantage = 1) {
  let raw = 0;
  for (const p of roster) raw += sampleGamma(p.ppr_ppg_mean, p.ppr_ppg_sd, rng);

  const C = constants.CONSISTENCY || 0;
  if (C > 0) {
    const expected = roster.reduce((s, p) => s + p.ppr_ppg_mean, 0);
    raw = raw * (1 - C) + expected * C;
  }

  const structure = rosterStructure(roster).multiplier;
  const defenseModifier = opponent.pts_allowed_mean / leagueAvgAllowed;
  const yourScore = raw * chemistryMultiplier * structure * defenseModifier;

  let oppRaw = sampleGamma(opponent.pts_scored_mean, opponent.pts_scored_sd, rng);
  const OC = constants.OPP_CONSISTENCY || 0;
  if (OC > 0) oppRaw = oppRaw * (1 - OC) + opponent.pts_scored_mean * OC;
  const oppScore = oppRaw * constants.SCALE / advantage;

  let won;
  if (yourScore > oppScore) won = true;
  else if (yourScore < oppScore) won = false;
  else won = rng() < 0.5;

  return { won, yourScore, oppScore, defenseModifier };
}

// ─── display scores ─────────────────────────────────────────────────────────

function percentileIn(table, v) {
  let lo = 0, hi = table.length - 1;
  if (v <= table[0]) return 0;
  if (v >= table[hi]) return 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (table[mid] <= v) lo = mid; else hi = mid;
  }
  const span = table[hi] - table[lo];
  const frac = span > 0 ? (v - table[lo]) / span : 0;
  return (lo + frac) / (table.length - 1);
}

function valueAt(table, p) {
  const x = Math.min(1, Math.max(0, p)) * (table.length - 1);
  const i = Math.floor(x);
  const j = Math.min(table.length - 1, i + 1);
  return table[i] + (table[j] - table[i]) * (x - i);
}

const SCORELINE_TOLERANCE = { margin: 5.0, points: 6.0 };

function toFootballScore(yourScore, oppScore, won, rng, cal) {
  const internalMargin = Math.abs(yourScore - oppScore);
  const marginTarget = Math.max(1, valueAt(cal.real_margin_q,
    percentileIn(cal.internal_margin_q, internalMargin)));

  if (!cal.real_pairs || !cal.internal_offence_q) {
    return legacyFootballScore(marginTarget, won, rng, cal);
  }

  const pointsTarget = valueAt(cal.real_team_pts_q,
    percentileIn(cal.internal_offence_q, yourScore));

  const TM = SCORELINE_TOLERANCE.margin, TP = SCORELINE_TOLERANCE.points;
  const pairs = cal.real_pairs;
  let sum = 0;
  const w = new Array(pairs.length);
  for (let i = 0; i < pairs.length; i++) {
    const hi = pairs[i][0], lo = pairs[i][1], n = pairs[i][2];
    const mine = won ? hi : lo;
    const dm = (hi - lo - marginTarget) / TM;
    const dp = (mine - pointsTarget) / TP;
    const v = n * Math.exp(-0.5 * (dm * dm + dp * dp));
    w[i] = v;
    sum += v;
  }
  if (!(sum > 0)) return legacyFootballScore(marginTarget, won, rng, cal);

  let r = rng() * sum;
  let k = pairs.length - 1;
  for (let i = 0; i < pairs.length; i++) { r -= w[i]; if (r <= 0) { k = i; break; } }
  const hi = pairs[k][0], lo = pairs[k][1];
  return won ? { you: hi, them: lo } : { you: lo, them: hi };
}

function legacyFootballScore(marginTarget, won, rng, cal) {
  const bucket = cal.margin_buckets.findIndex((lo, i) =>
    marginTarget >= lo && marginTarget < (cal.margin_buckets[i + 1] ?? 1000));
  const totalQ = cal.totals_by_bucket_q[Math.max(0, bucket)] || cal.totals_by_bucket_q[0];
  const total = Math.round(valueAt(totalQ, rng()));
  const margin = Math.max(1, Math.round(marginTarget));
  const winnerPts = Math.round((total + margin) / 2);
  const loserPts = winnerPts - margin;
  return won ? { you: winnerPts, them: Math.max(0, loserPts) }
    : { you: Math.max(0, loserPts), them: winnerPts };
}

// ─── play a run ─────────────────────────────────────────────────────────────

function playRun(roster, chemistryMultiplier, schedule, playoffs, leagueContext, rng, constants = CONSTANTS) {
  const results = [];
  let wins = 0, losses = 0;

  const play = (opp, meta) => {
    const leagueAvg = leagueContext[opp.season] ?? 25;
    const r = resolveGame(roster, chemistryMultiplier, opp, leagueAvg, rng, constants);
    results.push({ opponent: opp.display, opponent_id: opp.team_season_id, ...meta, ...r });
    if (r.won) wins++; else losses++;
    return r.won;
  };

  for (let i = 0; i < schedule.length; i++) {
    play(schedule[i], { week: i + 1, playoff: false, bowl: false, round: null });
  }

  const regularWins = wins;
  const regularLosses = losses;
  const seed = seedFromRecord(regularWins);

  let titleWon = false;
  let exitRound = null;
  let bowlResult = null;

  if (seed.made) {
    const advantage = 1 + (constants.PLAYOFF_HOME_FIELD || 0)
      * Math.max(0, regularWins - constants.PLAYOFF_WINS)
      / (constants.REGULAR_SEASON_GAMES - constants.PLAYOFF_WINS);

    const names = playoffRoundNames(seed.rounds);
    for (let i = 0; i < seed.rounds; i++) {
      const opp = playoffOpponent(playoffs, seed.rounds, i);
      const leagueAvg = leagueContext[opp.season] ?? 25;
      const isFinal = i === seed.rounds - 1;
      const r = resolveGame(roster, chemistryMultiplier, opp, leagueAvg, rng, constants,
        isFinal ? 1 : advantage);
      results.push({ opponent: opp.display, opponent_id: opp.team_season_id,
        week: schedule.length + i + 1, playoff: true, bowl: false, round: names[i], ...r });
      if (r.won) wins++; else { losses++; exitRound = names[i]; break; }
      if (i === seed.rounds - 1) titleWon = true;
    }
  } else if (seed.bowl) {
    bowlResult = { tier: seed.bowl, label: seed.label };
  }

  return {
    results,
    wins,
    losses,
    regularWins,
    regularLosses,
    regularRecord: `${regularWins}-${regularLosses}`,
    record: `${wins}-${losses}`,
    seed,
    titleWon,
    exitRound,
    bowlResult,
    perfect: losses === 0 && titleWon,
    undefeatedRegular: regularLosses === 0,
  };
}

function playBowlGame(roster, chemistryMultiplier, bowlOpp, leagueContext, rng, bowlInfo, constants = CONSTANTS) {
  const leagueAvg = leagueContext[bowlOpp.season] ?? 25;
  const r = resolveGame(roster, chemistryMultiplier, bowlOpp, leagueAvg, rng, constants);
  return {
    opponent: bowlOpp.display,
    opponent_id: bowlOpp.team_season_id,
    bowl: true,
    round: bowlInfo.name,
    bowlKey: bowlInfo.key,
    bowlTagline: bowlInfo.tagline,
    ...r,
  };
}

// ─── prepare data ───────────────────────────────────────────────────────────

function prepareData(teamSeasons) {
  const byProgram = {};
  for (const t of teamSeasons) (byProgram[t.school] ??= []).push(t);

  const zs = teamSeasons.map(t => t.strength_z).sort((a, b) => a - b);
  const q = (p) => zs[Math.min(zs.length - 1, Math.max(0, Math.round(p * (zs.length - 1))))];
  const eliteThreshold = q(0.90);

  const winsOf = (t) => Number(String(t.record).split('-')[0]) || 0;

  const goodPool = teamSeasons.filter(t => winsOf(t) >= 9 && winsOf(t) <= 10);
  const greatPool = teamSeasons.filter(t => winsOf(t) >= 11);
  const elitePool = teamSeasons.filter(t => winsOf(t) >= 12 || (winsOf(t) >= 11 && t.strength_z >= q(0.95)));
  const bowlPool = teamSeasons.filter(t => winsOf(t) >= 7 && winsOf(t) <= 9);

  const index = {};
  for (const t of teamSeasons) index[t.team_season_id] = t;

  const meanZ = zs.reduce((a, b) => a + b, 0) / zs.length;
  return {
    byProgram,
    eliteThreshold,
    goodPool,
    greatPool,
    elitePool,
    bowlPool,
    byId: (id) => index[id],
    meanScheduleStrength: meanZ * CONSTANTS.REGULAR_SEASON_GAMES,
  };
}

// ─── public API ─────────────────────────────────────────────────────────────

const publicAPI = {
  API_VERSION: ENGINE_API_VERSION,
  CONSTANTS, CHEMISTRY, SLOTS, SLOT_ELIGIBILITY,
  hashSeed, createSeededRNG, sampleGamma,
  pairLinks, resolveChemistry,
  generateSchedule, generatePlayoffs, generateBowlOpponent,
  resolveGame, playRun, playBowlGame, prepareData, toFootballScore,
  playoffOpponent, playoffRoundNames,
  seedFromRecord,
  respinCost, respinFees,
  scoringScript, scoreParts, SCORE_KINDS,
  contrast, teamColors, washColors, wheelColors, teamButton, teamInk,
  LINK_TIERS, linkTier,
  rosterStructure, STRUCTURE, coachReport,
  selectBowl, BOWL_ARCHETYPES, GENERIC_BOWL_NAMES,
  SCHEME_NAMES: Object.fromEntries(SCHEMES.map(s => [s.key, s.name])),
  SCHEME_TAGLINES: Object.fromEntries(SCHEMES.map(s => {
    const cut = s.strength.indexOf('. ');
    return [s.key, cut >= 0 ? s.strength.slice(cut + 2) : s.strength];
  })),
};

if (typeof module !== 'undefined' && module.exports) module.exports = publicAPI;
if (typeof window !== 'undefined') window.PS_CFB_ENGINE = publicAPI;
})();
