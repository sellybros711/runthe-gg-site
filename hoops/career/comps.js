// ─── comparisons to real players ────────────────────────────────────────────

/* WHO YOU PLAY LIKE, the owner's call (2026-10-16): as many ways as can be
   found to set the invented player beside real ones. Four of them live here.

     shadesOf     after the build, the three real players his game has shades
                  of, the way NBA 2K says it: the nearest, then the nearest from
                  other eras
     seasonComp   at the end of a season, the real season it most resembles, in
                  the same year of a career
     passedMen    on the way up the career lists, the real men he passes
     careerComps  on the Hall card, the real careers his most resembles

   A COMPARISON NAMES A REAL PLAYER AND A REAL STAT LINE, NEVER A STORY ABOUT
   HIM. Every number in a line is the data's own (hoops/data/players.json).

   BUILT ONCE FROM THE DATA AND NEVER SAVED. seedLeague hands the rows here;
   the table lives in this closure for the page's life, so a save carries only
   the names it showed. With no data (a check that seeds no league) every
   reader answers nothing and the career is the same career.

   NOTHING HERE DRAWS. No random stream is read or moved, so a comparison can
   never change what a career does. */
let COMPS = null;
const COMP_FAMILY = { PG: ['PG', 'SG'], SG: ['SG', 'PG', 'SF'], SF: ['SF', 'SG', 'PF'], PF: ['PF', 'SF', 'C'], C: ['C', 'PF'] };
const COMP_KEYS = ['pts', 'three', 'ast', 'reb', 'stk', 'blk'];
/* A career is whole in the data only if it began after its first season (1974):
   a man already playing then carries a total that starts part way through. */
const COMP_FROM = 1974;
const SHADE_NEAR = 0.04;
const SHADE_SAME = 0.06; // his own position over a neighbour's
const PASS_TOP = 100;
/* A man's era is the middle of his career, so a long career sits where it peaked. */
const compEra = (p) => { const y = (p.first + p.last) / 2; return y < 1998 ? 0 : y < 2012 ? 1 : 2; };

function buildComps(rows) {
  if (!rows || !rows.length) return null;
  const by = new Map();
  for (const r of rows) {
    if (!r || !r.i || !(r.g > 0) || !(r.mp > 0)) continue;
    let p = by.get(r.i);
    if (!p) by.set(r.i, p = { i: r.i, n: r.n, rows: [] });
    p.rows.push(r);
  }
  const players = [], seasons = [];
  for (const p of by.values()) {
    const S = p.rows.sort((a, b) => a.s - b.s);
    const first = S[0].s, last = S[S.length - 1].s;
    const pc = {};
    let g = 0, pts = 0, reb = 0, ast = 0, star = 0, mvp = 0, ring = 0;
    for (const r of S) {
      g += r.g; pts += r.pts * r.g; reb += r.reb * r.g; ast += r.ast * r.g;
      pc[r.pp] = (pc[r.pp] || 0) + r.g;
      for (const a of r.aw || []) { if (a === 'star') star++; else if (a === 'mvp') mvp++; else if (a === 'ring') ring++; }
    }
    const pos = Object.keys(pc).sort((a, b) => pc[b] - pc[a])[0];
    /* His game is his three best seasons by the data's value score, per 36. */
    const best = S.slice().sort((a, b) => b.p - a.p || a.s - b.s).slice(0, 3);
    let w = 0;
    const st = { pts: 0, three: 0, ast: 0, reb: 0, stk: 0, blk: 0 };
    for (const r of best) {
      const k = 36 / r.mp, wt = r.g;
      st.pts += r.pts * k * wt; st.ast += r.ast * k * wt; st.reb += r.reb * k * wt;
      st.stk += r.stl * k * wt; st.blk += r.blk * k * wt;
      st.three += (r.fga ? r.tpa / r.fga : 0) * wt;
      w += wt;
    }
    for (const k of COMP_KEYS) st[k] /= Math.max(1, w);
    players.push({ n: p.n, pos, first, last, g, pts: Math.round(pts), reb: Math.round(reb), ast: Math.round(ast),
      star, mvp, ring, whole: first > COMP_FROM, style: st,
      ppg: g ? pts / g : 0, rpg: g ? reb / g : 0, apg: g ? ast / g : 0, yrs: S.length });
    S.forEach((r, k) => { if (r.g >= 40 && r.mp >= 20) seasons.push({ n: r.n, s: r.s, pos: r.pp, yr: k + 1, pts: r.pts, reb: r.reb, ast: r.ast, stl: r.stl, blk: r.blk }); });
  }
  /* A name a player knows: an All-Star, or a long career. */
  const known = players.filter((p) => p.star >= 1 || p.g >= 700);
  /* Each man is read against his own position, so a center is not like every
     other center for rebounding: what sets him apart from the centers is his
     shape. The career's ratings are read the same way (gameShape). */
  for (const pos of POS) {
    const at = known.filter((p) => p.pos === pos);
    if (!at.length) continue;
    const mean = {}, sd = {};
    for (const k of COMP_KEYS) {
      mean[k] = at.reduce((a, p) => a + p.style[k], 0) / at.length;
      sd[k] = Math.sqrt(at.reduce((a, p) => a + (p.style[k] - mean[k]) ** 2, 0) / at.length) || 1;
    }
    for (const p of at) p.z = COMP_KEYS.map((k) => (p.style[k] - mean[k]) / sd[k]);
  }
  /* The career lists hold finished careers only: a man still playing in the
     data's last season has a total the real world is still adding to. */
  const latest = Math.max(...players.map((p) => p.last));
  const lists = {};
  for (const k of ['pts', 'reb', 'ast']) lists[k] = players.filter((p) => p.whole && p.last < latest).sort((a, b) => b[k] - a[k] || (a.n < b.n ? -1 : 1)).slice(0, PASS_TOP);
  return { known, seasons, lists };
}

/* His game as a shape: what his ratings lean toward once his position's own
   lean (POS_PROFILE) is taken out, against his own average, in the same six
   directions a real player's best seasons are read in. */
function gameShape(L) {
  const pf = POS_PROFILE[L.pos] || {}, r = {};
  for (const k of RATINGS) r[k] = L.rt[k] - (pf[k] || 0);
  const m = RATINGS.reduce((a, k) => a + r[k], 0) / RATINGS.length;
  return [
    (r.sho + r.fin) / 2 - m,
    r.sho - r.fin,
    r.pla - m,
    r.reb - m,
    r.def - m + (r.ath - m) * 0.3,
    (r.def + r.reb) / 2 - m + (r.ath - m) * 0.5 - (r.sho - m) * 0.5,
  ];
}
function cosine(a, b) {
  let d = 0, x = 0, y = 0;
  for (let k = 0; k < a.length; k++) { d += a[k] * b[k]; x += a[k] * a[k]; y += b[k] * b[k]; }
  return x && y ? d / Math.sqrt(x * y) : 0;
}

/* THE THREE SHADES. The nearest real player in his position family, then the
   nearest from each of the other eras (before 2000, 2000 to 2014, since), so
   the three read as a legend, a star of the last generation and a man playing
   now, in whatever order his game puts them. Only a man who made two All-Star
   games is a shade, and a bigger name wins a near tie: the line is there to
   be recognised. */
function shadesOf(L) {
  if (!COMPS || !L || !L.rt) return [];
  const fam = COMP_FAMILY[L.pos] || [L.pos];
  const me = gameShape(L);
  const scored = COMPS.known.filter((p) => p.z && p.star >= 2 && fam.indexOf(p.pos) >= 0)
    .map((p) => ({ p, v: cosine(me, p.z) + Math.min(0.12, p.star * 0.01 + p.mvp * 0.02) + (p.pos === L.pos ? SHADE_SAME : 0) }))
    .sort((a, b) => b.v - a.v || (a.p.n < b.p.n ? -1 : 1));
  if (!scored.length) return [];
  /* Near the top, any of the close matches is as true as the closest, so the
     career's own seed picks among them (a hash, not a draw from its stream).
     Without it a few men whose game sits in the middle of everything would be
     every player's shade. */
  const near = (list, k) => {
    const close = list.filter((s) => s.v >= list[0].v - SHADE_NEAR).slice(0, 4);
    return close[E.hashSeed(String(L.seed) + ':shade:' + k) % close.length].p;
  };
  const out = [near(scored, 0)];
  const eras = new Set([compEra(out[0])]);
  for (let k = 1; k < 3; k++) {
    const rest = scored.filter((s) => out.indexOf(s.p) < 0 && (eras.size >= 3 || !eras.has(compEra(s.p))));
    if (!rest.length) break;
    const p = near(rest, k);
    out.push(p);
    eras.add(compEra(p));
  }
  return out.map((p) => p.n);
}
const listWords = (a) => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
/* Said once, after the build, and kept on the career for the screens. */
function sayShades(L) {
  const sh = shadesOf(L);
  if (!sh.length) return;
  L.shades = sh;
  logIt(L, 'Scouts see shades of ' + listWords(sh) + '.', 'gold');
}

/* THE SEASON IT LOOKS LIKE: the real season nearest his per game line, in the
   same year of a career give or take two, among his position family. Never
   the same real season two years running. */
function seasonComp(L, h, n, not) {
  if (!COMPS || !h || !(h.gp >= 20)) return null;
  const fam = COMP_FAMILY[L.pos] || [L.pos];
  let best = null, bd = Infinity;
  for (const s of COMPS.seasons) {
    if (Math.abs(s.yr - n) > 2 || fam.indexOf(s.pos) < 0 || s.n + s.s === not) continue;
    const d = (s.pts - h.pts) ** 2 + 1.2 * (s.reb - h.reb) ** 2 + 1.4 * (s.ast - h.ast) ** 2 + 3 * (s.stl - h.stl) ** 2 + 3 * (s.blk - h.blk) ** 2;
    if (d < bd || (d === bd && best && s.n < best.n)) { bd = d; best = s; }
  }
  return best;
}
const seasonName = (y) => (y - 1) + '-' + String(y).slice(2);
function saySeasonComp(L, beats) {
  const h = L.history[L.history.length - 1];
  const c = seasonComp(L, h, L.history.length, L.flags.compLast);
  if (!c) return;
  L.flags.compLast = c.n + c.s;
  const t = 'Your season looked like ' + c.n + '\'s ' + seasonName(c.s) + ': ' + per(c.pts, 'points') + ', ' + per(c.reb, 'rebounds') + ', ' + per(c.ast, 'assists') + '.';
  logIt(L, t, '');
  if (h.pts >= 18 || (h.aw || []).indexOf('star') >= 0) beats.push({ kind: 'comp', text: t, tone: '' });
}

/* THE MEN HE PASSES. A list is the top PASS_TOP finished careers in points,
   rebounds or assists, so a name is only passed once he is climbing a real
   list. One line a season: the highest place he took, points first on a tie.
   It never says the place: careers begun before 1974 are not in the data, so
   a rank would be wrong. */
const PASS_WORD = { pts: 'points', reb: 'rebounds', ast: 'assists' };
function sayPassed(L, before, beats) {
  if (!COMPS) return;
  const now = totals(L);
  let best = null;
  for (const k of ['pts', 'reb', 'ast']) {
    const list = COMPS.lists[k];
    const at = list.findIndex((p) => p[k] > before[k] && p[k] <= now[k]);
    if (at >= 0 && (!best || at < best.at)) best = { k, at, p: list[at] };
  }
  if (!best) return;
  const t = 'You passed ' + best.p.n + '\'s ' + best.p[best.k].toLocaleString('en-US') + ' career ' + PASS_WORD[best.k] + '.';
  logIt(L, t, 'gold');
  beats.push({ kind: 'comp', text: t, tone: 'gold' });
}

/* WHO HE PLAYED LIKE, as the shades drift. When his game has moved far enough
   that a new name leads the shades, the career says so, at most every third
   season. */
function sayShadeShift(L) {
  if (!L.shades || !L.shades.length || L.seasonsDone < 3) return;
  if (L.flags.shadeAt && L.seasonsDone - L.flags.shadeAt < 3) return;
  const sh = shadesOf(L);
  if (!sh.length || sh[0] === L.shades[0]) return;
  L.shades = sh;
  L.flags.shadeAt = L.seasonsDone;
  logIt(L, 'Your game looks more like ' + sh[0] + '\'s now.', '');
}

/* THE CAREERS HIS RESEMBLES, for the Hall card: the nearest known careers by
   points, rebounds and assists a night, seasons played and All-Star games. */
function careerComps(L) {
  if (!COMPS || !L.history.length) return [];
  const T = totals(L), g = Math.max(1, T.gp || L.history.reduce((a, h) => a + (h.gp || 0), 0));
  const me = { ppg: T.pts / g, rpg: T.reb / g, apg: T.ast / g, yrs: L.history.length, star: T.star || 0 };
  const fam = COMP_FAMILY[L.pos] || [L.pos];
  return COMPS.known.filter((p) => p.whole && fam.indexOf(p.pos) >= 0)
    .map((p) => ({ p, d: (p.ppg - me.ppg) ** 2 + 1.5 * (p.rpg - me.rpg) ** 2 + 1.5 * (p.apg - me.apg) ** 2 + 0.5 * (p.yrs - me.yrs) ** 2 + 0.8 * (p.star - me.star) ** 2 }))
    .sort((a, b) => a.d - b.d || (a.p.n < b.p.n ? -1 : 1)).slice(0, 3).map((x) => x.p.n);
}
