/* Facts the Run The Pitch World Cup XI guide states that come from the squad data
 * (data/players_all.json) rather than from one line of code: field sizes, what each era's
 * squads hold at each position, how ratings move between tournaments, ages, captains and
 * awards. check-guides recomputes these on every run, so a data change that moves a figure
 * fails the guide. Percentages are whole numbers, averages to one place. */
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const rows = require(path.join(ROOT, 'data/players_all.json'));

module.exports = function facts() {
  const years = [...new Set(rows.map((r) => r.year))].sort();
  const squads = new Map();
  for (const r of rows) {
    const k = r.year + '|' + r.country;
    if (!squads.has(k)) squads.set(k, []);
    squads.get(k).push(r);
  }
  const teamsIn = (y) => new Set(rows.filter((r) => r.year === y).map((r) => r.country)).size;
  const eraOf = (y) => (y <= 1978 ? 'e66' : y <= 1994 ? 'e82' : y <= 2022 ? 'e98' : 'e26');
  const era = {};
  for (const [k, P] of squads) {
    const e = eraOf(+k.split('|')[0]);
    const best = (pos) => Math.max(0, ...P.filter((p) => !pos || p.position === pos).map((p) => p.wc_overall));
    const s = (era[e] = era[e] || { n: 0, gk85: 0, none80: 0, any88: 0, fwd85: 0, gk85b: 0, def90: 0 });
    s.n++;
    if (best('GK') >= 85) s.gk85++;
    if (best() < 80) s.none80++;
    if (best() >= 88) s.any88++;
    if (best('FWD') >= 85) s.fwd85++;
    s.def90 += P.filter((p) => p.position === 'DEF' && p.wc_overall >= 90).length;
  }
  const pct = (a, b) => Math.round(100 * a / b);
  const out = { fields: {} };
  for (const y of years) out.fields[y] = teamsIn(y);
  out.tournaments = years.length;
  for (const [e, s] of Object.entries(era)) {
    out[e] = { gk85Pct: pct(s.gk85, s.n), none80Pct: pct(s.none80, s.n), any88Pct: pct(s.any88, s.n), fwd85Pct: pct(s.fwd85, s.n), def90: s.def90 };
  }
  // the same player (name and nation) at two or more tournaments
  const by = new Map();
  for (const r of rows) { const k = r.name + '|' + r.country; if (!by.has(k)) by.set(k, []); by.get(k).push(r); }
  let multi = 0, gap10 = 0, peakLast = 0, peakFirst = 0;
  for (const L of by.values()) {
    const yrs = new Set(L.map((x) => x.year));
    if (yrs.size < 2) continue;
    multi++;
    const o = L.map((x) => x.wc_overall);
    if (Math.max(...o) - Math.min(...o) >= 10) gap10++;
    const s = L.slice().sort((a, b) => a.year - b.year), top = Math.max(...o);
    if (s[s.length - 1].wc_overall === top) peakLast++;
    if (s[0].wc_overall === top) peakFirst++;
  }
  out.gapThirdPlus = gap10 * 3 > multi;
  out.peakLastMoreThanFirst = peakLast > peakFirst;
  const nn = rows.filter((r) => r.wc_overall === 99);
  out.ninetyNines2026Fwd = nn.filter((r) => r.year === 2026 && r.position === 'FWD').length;
  const meanAge = (f) => { const a = rows.filter((r) => f(r.age_at_tournament)); return Math.round(10 * a.reduce((s, r) => s + r.wc_overall, 0) / a.length) / 10; };
  out.age28to33 = Math.round(meanAge((x) => x >= 28 && x <= 33));
  out.age21under = Math.round(meanAge((x) => x <= 21));
  const caps = new Set(rows.filter((r) => r.is_captain).map((r) => r.year + '|' + r.country));
  out.squadsWithoutCaptain = squads.size - caps.size;
  out.awardWinners = rows.filter((r) => r.award).length;
  return out;
};
