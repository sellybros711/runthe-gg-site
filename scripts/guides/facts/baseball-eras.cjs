/* Facts the Run The Diamond eras guide states that come from the player data rather than
 * from one line of code: per decade, over every team-season the wheel can draw, using the
 * engine's own workloadWar and canFillSlot. check-guides recomputes these on every run, so
 * a data refresh that moves a figure fails the guide instead of leaving it stale.
 * Percentages are whole numbers, WAR to two places, as the guide was checked against. */
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const E = require(path.join(ROOT, 'baseball/engine.js'));
const rows = require(path.join(ROOT, 'baseball/data/players.json'));

module.exports = function facts() {
  const idx = E.indexData(rows);
  const out = {};
  for (const [era, [a, b]] of Object.entries(E.ERAS)) {
    const T = idx.teamSeasons.filter((t) => t.season >= a && t.season <= b);
    if (!T.length) continue;
    let sp = 0, heavy = 0;
    const cl = [], sp1 = [], c = [], best = [];
    for (const t of T) {
      const P = idx.byTeamSeason[t.team_season_id] || [];
      for (const p of P) if (p.r === 'p' && p.pp === 'SP') { sp++; if (p.ip > 210) heavy++; }
      const mx = (f) => Math.max(0, ...P.filter(f).map((p) => E.workloadWar(p)));
      cl.push(mx((p) => E.canFillSlot(p, 'CL')));
      sp1.push(mx((p) => E.canFillSlot(p, 'SP1')));
      c.push(mx((p) => E.canFillSlot(p, 'C')));
      best.push(mx(() => true));
    }
    const avg = (x) => Math.round(100 * x.reduce((s, v) => s + v, 0) / x.length) / 100;
    const pct = (x, v) => Math.round(100 * x.filter((y) => y >= v).length / x.length);
    out[era] = {
      seasons: T.length, clubs: new Set(T.map((t) => E.franchiseOf(t.team, t.season))).size,
      heavyPct: Math.round(100 * heavy / sp), clBest: avg(cl), cl3Pct: pct(cl, 3),
      spBest: avg(sp1), sp3Pct: pct(sp1, 3), c3Pct: pct(c, 3), best: avg(best), best6Pct: pct(best, 6),
    };
  }
  const ruth = rows.find((r) => r.i === 'ruthba01' && r.s === 1923);
  const walsh = rows.find((r) => r.i === 'walshed01' && r.s === 1908);
  const johnson = rows.find((r) => r.i === 'johnswa01' && r.s === 1913);
  const one = (x) => Math.round(x * 10) / 10;
  out.players = {
    ruthPrice: ruth.p, walshWar: one(walsh.w), walshCounts: one(E.workloadWar(walsh)), walshPrice: walsh.p,
    johnsonWar: one(johnson.w), johnsonCounts: one(E.workloadWar(johnson)),
  };
  const all = Object.keys(E.ERAS).filter((k) => out[k] && k !== '2020s').map((k) => out[k].best);
  out.othersBestMin = Math.min(...all); out.othersBestMax = Math.max(...all);
  return out;
};
