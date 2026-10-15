// ─── before the league: high school and college ─────────────────────────────

/* A career can start on draft night, with a background standing in for how
 * you got there, or three years earlier as a fifteen year old high school
 * sophomore. The road is played on the league's own ratings scale, so a
 * sophomore is about a 40 and a one and done arrives near the 56 the
 * background would have handed him. The point of playing it is that the 56 is
 * yours, and so is everything the scouts saw on the way.
 *
 * THE SCHOOLS ARE REAL AND THE PEOPLE ARE GENERATED. A college is an
 * institution, the way an NBA club is, so Duke is Duke. Its coach, its
 * boosters and your roommate are generated names off the career's seed, the
 * same people every time the career loads.
 *
 * NOTHING HERE TOUCHES THE LEAGUE'S MODEL. The road ends at the same combine
 * card a draft-night career starts on, with ratings, a ceiling, fame and draft
 * stock, and from there the NBA half plays exactly as it always has.
 */
const AGE_HS = 15;
const HS_GAMES = 26;
const HS_ROUNDS = ['Sectional', 'Regional', 'State semifinal', 'State final'];
const NCAA_ROUNDS = ['First Round', 'Second Round', 'Sweet 16', 'Elite Eight', 'Final Four', 'National Championship'];
/* What a starter looks like at each level, on the league's scale. */
const HS_BAR = { 15: 32, 16: 34, 17: 36 };
const COL_BAR = 48;
const PRO_BAR = 52;
const GRADE = { 10: 'sophomore', 11: 'junior', 12: 'senior' };
const CYEAR = { 1: 'freshman', 2: 'sophomore', 3: 'junior', 4: 'senior' };
/* The amateur half of the growth curve. Slower per summer than the league's
   GROW, because there are more of them before anybody is paid. */
const GROW_AM = { 15: 0.12, 16: 0.12, 17: 0.12, 18: 0.12, 19: 0.11, 20: 0.1, 21: 0.09, 22: 0.08 };

const HOMETOWNS = ['Baltimore', 'Chicago', 'Houston', 'Atlanta', 'Oakland', 'Philadelphia', 'Dallas',
  'Indianapolis', 'Memphis', 'Seattle', 'Detroit', 'Brooklyn', 'Charlotte', 'Milwaukee', 'Phoenix',
  'New Orleans', 'Akron', 'Gary', 'Newark', 'Minneapolis', 'Raleigh', 'Las Vegas', 'Louisville', 'Compton'];
const HS_SUFFIX = ['Central', 'North', 'East', 'West', 'South', 'Tech', 'Catholic', 'Academy'];
const HS_COLORS = [['#7a1f2b', '#f2c14e'], ['#0b3d91', '#ffffff'], ['#1c5f3a', '#f5f5f5'], ['#4b2a83', '#f2c14e'],
  ['#1a1a1a', '#d64545'], ['#c8102e', '#ffffff'], ['#00577a', '#f7a800'], ['#5a2d0c', '#f0e6d2']];

/* Name, tier, conference, colours. */
const SCHOOLS = [
  ['Kentucky', 'blue', 'SEC', '#0033a0', '#ffffff'], ['Duke', 'blue', 'ACC', '#003087', '#ffffff'],
  ['Kansas', 'blue', 'Big 12', '#0051ba', '#e8000d'], ['North Carolina', 'blue', 'ACC', '#7bafd4', '#13294b'],
  ['UCLA', 'blue', 'Big Ten', '#2d68c4', '#f2a900'],
  ['UConn', 'power', 'Big East', '#000e2f', '#ffffff'], ['Gonzaga', 'power', 'WCC', '#002967', '#c8102e'],
  ['Arizona', 'power', 'Big 12', '#cc0033', '#ffffff'], ['Michigan State', 'power', 'Big Ten', '#18453b', '#ffffff'],
  ['Houston', 'power', 'Big 12', '#c8102e', '#ffffff'], ['Villanova', 'power', 'Big East', '#00205b', '#13b5ea'],
  ['Baylor', 'power', 'Big 12', '#154734', '#ffb81c'], ['Texas', 'power', 'SEC', '#bf5700', '#ffffff'],
  ['Indiana', 'power', 'Big Ten', '#990000', '#eeedeb'], ['Arkansas', 'power', 'SEC', '#9d2235', '#ffffff'],
  ['Auburn', 'power', 'SEC', '#0c2340', '#e87722'], ['Tennessee', 'power', 'SEC', '#ff8200', '#ffffff'],
  ['Purdue', 'power', 'Big Ten', '#000000', '#cfb991'], ['Alabama', 'power', 'SEC', '#9e1b32', '#ffffff'],
  ['Florida', 'power', 'SEC', '#0021a5', '#fa4616'], ['Michigan', 'power', 'Big Ten', '#00274c', '#ffcb05'],
  ['Louisville', 'power', 'ACC', '#ad0000', '#ffffff'], ['Syracuse', 'power', 'ACC', '#f76900', '#000e54'],
  ['Marquette', 'power', 'Big East', '#003366', '#ffcc00'], ['Creighton', 'power', 'Big East', '#005ca9', '#ffffff'],
  ['Virginia', 'power', 'ACC', '#232d4b', '#f84c1e'], ['Iowa State', 'power', 'Big 12', '#c8102e', '#f1be48'],
  ['Memphis', 'power', 'AAC', '#003087', '#898d8d'], ['Butler', 'power', 'Big East', '#13294b', '#ffffff'],
  ['Dayton', 'mid', 'A-10', '#ce1141', '#004b8d'], ["Saint Mary's", 'mid', 'WCC', '#06315b', '#d80024'],
  ['VCU', 'mid', 'A-10', '#000000', '#f8b800'], ['San Diego State', 'mid', 'Mountain West', '#a6192e', '#000000'],
  ['Davidson', 'mid', 'A-10', '#ac1a2f', '#ffffff'], ['Wichita State', 'mid', 'AAC', '#000000', '#ffcd00'],
  ['Loyola Chicago', 'mid', 'A-10', '#7a0019', '#ffc72c'], ['Drake', 'mid', 'MVC', '#004477', '#ffffff'],
  ['New Mexico', 'mid', 'Mountain West', '#ba0c2f', '#a7a8aa'], ['Utah State', 'mid', 'Mountain West', '#0f2439', '#ffffff'],
  ['Florida Atlantic', 'mid', 'AAC', '#003366', '#cc0000'], ['Belmont', 'mid', 'MVC', '#002469', '#c8102e'],
  ['Murray State', 'low', 'MVC', '#002144', '#ecac00'], ['Oral Roberts', 'low', 'Summit', '#002f6c', '#c5b783'],
  ['Weber State', 'low', 'Big Sky', '#492f92', '#ffffff'], ['Montana', 'low', 'Big Sky', '#70003c', '#999999'],
  ['Lehigh', 'low', 'Patriot', '#653600', '#ffffff'], ['Vermont', 'low', 'America East', '#154734', '#ffd100'],
  ['Furman', 'low', 'SoCon', '#582c83', '#ffffff'], ['Grand Canyon', 'low', 'WAC', '#522398', '#ffffff'],
  ['Yale', 'low', 'Ivy', '#00356b', '#ffffff'], ['Princeton', 'low', 'Ivy', '#e77500', '#000000'],
  ['Colgate', 'low', 'Patriot', '#821019', '#ffffff'],
].map(([name, tier, conf, c1, c2]) => ({ name, tier, conf, c1, c2 }));
const SCHOOL_BY = {};
for (const s of SCHOOLS) SCHOOL_BY[s.name] = s;
/* Points per hundred better than an average Division I team. */
const TIER_NET = { blue: 14, power: 9, mid: 3, low: -4 };
const TIER_NAME = { blue: 'Blue blood', power: 'Power conference', mid: 'Mid-major', low: 'Small conference' };
const TIER_RANK = { blue: 0, power: 1, mid: 2, low: 3 };
const CONF_NET = {};
{
  const sum = {}, n = {};
  for (const s of SCHOOLS) { sum[s.conf] = (sum[s.conf] || 0) + TIER_NET[s.tier]; n[s.conf] = (n[s.conf] || 0) + 1; }
  for (const c in sum) CONF_NET[c] = sum[c] / n[c] - 2;
}

const isAm = (L) => !!(L.am && L.stage !== 'nba');
/* This season's strength for a college, the same all year. */
function schoolNet(L, name) {
  const s = SCHOOL_BY[name];
  if (!s) return 0;
  return round1(TIER_NET[s.tier] + norm(rngAt(L, 'sch:' + name)) * 2.5);
}

// ── the recruiting class ──

/* Where the class has you. The score is read against your age, so a junior is
   ranked against juniors, and the curve is fitted so a future pro is most
   often a four-star and about one in eight is a five. */
function recruitScore(L) {
  return (ovrOf(L) - (L.age - AGE_HS) * 5.2) * 0.7 + L.pot * 0.55 + L.m.fame * 0.03 + ((L.am && L.am.rstock) || 0);
}
function nationalRank(L) {
  const s = recruitScore(L);
  return clamp(Math.round(900 / (1 + Math.exp((s - 63) / 5.6))), 1, 900);
}
const starsOf = (rank) => rank <= 25 ? 5 : rank <= 150 ? 4 : rank <= 350 ? 3 : 2;
function rankText(rank) {
  return rank > 600 ? 'Unranked' : '#' + rank + ' in the class · ' + starsOf(rank) + ' stars';
}

function collegeOffers(L, tag) {
  const rank = L.am.rank;
  const rng = rngAt(L, 'offers:' + (tag || ''));
  const W = rank <= 25 ? { blue: 6, power: 3, mid: 0.1, low: 0 }
    : rank <= 80 ? { blue: 1.4, power: 4, mid: 1, low: 0 }
      : rank <= 200 ? { blue: 0.12, power: 3, mid: 3, low: 0.5 }
        : rank <= 400 ? { blue: 0, power: 0.6, mid: 3, low: 3 }
          : { blue: 0, power: 0.05, mid: 1, low: 4 };
  const pool = SCHOOLS.filter((s) => s.name !== L.am.college);
  const out = [];
  while (out.length < 4 && pool.length) {
    const s = weighted(rng, pool, (x) => W[x.tier]);
    if (!s) break;
    pool.splice(pool.indexOf(s), 1);
    out.push(s.name);
  }
  return out.sort((a, b) => TIER_RANK[SCHOOL_BY[a].tier] - TIER_RANK[SCHOOL_BY[b].tier]);
}
function schoolHint(L, name) {
  const s = SCHOOL_BY[name];
  const bar = COL_BAR + (TIER_NET[s.tier] - 3) * 0.35;
  const d = ovrOf(L) + 4 - bar;
  const role = d >= 10 ? 'You start day one' : d >= 4 ? 'You fight for a starting spot' : d >= -2 ? 'You come off the bench' : 'You wait your turn';
  return TIER_NAME[s.tier] + ', ' + s.conf + '. Coach ' + colCoachName(L, name) + '. ' + role + '.';
}

// ── an amateur season ──

function newAmSeason(L, lvl) {
  const school = lvl === 'hs' ? L.am.hs.name : lvl === 'col' ? L.am.college : L.am.proTeam;
  L.season = {
    amateur: true, lvl, year: L.year, team: null, school, g: 0, w: 0, l: 0, gp: 0,
    tot: { min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fga: 0, fgm: 0, tpa: 0, tpm: 0, fta: 0, ftm: 0 },
    hi: { pts: 0, reb: 0, ast: 0 }, out: 0, injury: null,
    mods: { min: 0, usage: 0, perf: 0, win: 0, risk: 0, rest: 0 },
    used: {}, acts: {}, allstar: false, awards: [], po: null, notes: [], role: null,
    startOvr: ovrOf(L), startTeam: null, asked: {}, conf: { w: 0, l: 0 }, tourney: null, seed: null, qual: false, finish: '',
  };
}
const levelBar = (L) => {
  const s = L.season;
  if (!s || s.lvl === 'hs') return HS_BAR[L.age] || 36;
  return s.lvl === 'col' ? COL_BAR : PRO_BAR;
};
function teamNetAm(L) {
  const s = L.season;
  const base = s.lvl === 'hs' ? L.am.hs.net : s.lvl === 'col' ? schoolNet(L, L.am.college) : L.am.proNet || 0;
  return base + s.mods.win;
}
/* The bar to start, which is higher at a better school. */
function amBar(L) {
  const s = L.season;
  if (s.lvl === 'hs') return levelBar(L) + L.am.hs.net * 0.5;
  if (s.lvl === 'col') return COL_BAR + (schoolNet(L, L.am.college) - 3) * 0.35;
  return PRO_BAR + (L.am.proNet || 0) * 0.3;
}
function amRole(L) {
  const s = L.season;
  const diff = effOvr(L) - amBar(L);
  let min;
  if (s.lvl === 'hs') min = diff >= 8 ? 30 : diff >= 3 ? 25 : diff >= -2 ? 17 : 9;
  else min = diff >= 12 ? 34 : diff >= 7 ? 31 : diff >= 2 ? 27 : diff >= -3 ? 20 : diff >= -8 ? 12 : 6;
  min += (L.m.trust - 50) * 0.05 + s.mods.min;
  min = clamp(min, 3, s.lvl === 'hs' ? 32 : 37);
  const starter = min >= (s.lvl === 'hs' ? 22 : 24);
  const label = diff >= 10 && starter ? 'Go-to player' : starter ? 'Starter' : min >= 14 ? 'Sixth man' : 'Bench';
  return { min: round1(min), diff, label, starter };
}
function amImpact(L, min) {
  const s = L.season;
  const per = s.lvl === 'hs' ? 32 : 40;
  return (effOvr(L) - levelBar(L)) * (s.lvl === 'hs' ? 0.3 : 0.32) * (min / per);
}
const amP = (diff, home, lvl) => clamp(0.5 + diff * (lvl === 'hs' ? 0.035 : 0.028) + (home ? 0.04 : -0.04), 0.04, 0.96);

/* The man's per-game means at this level. Points come off how far above the
   level he is, less a little for a deep school, plus who he is as a player. */
function amMeans(L, min) {
  const s = L.season, r = L.rt, a = ARCHES[L.arch];
  const lvl = s.lvl;
  const per = lvl === 'hs' ? 30 : 33;
  const k = min / per;
  const rel = effOvr(L) - levelBar(L) - (lvl === 'hs' ? L.am.hs.net : lvl === 'col' ? schoolNet(L, L.am.college) - 3 : 0) * 0.25;
  const pts = clamp((lvl === 'hs' ? 3 : 4) + rel * (lvl === 'hs' ? 1.1 : 1.05) + a.usage * 60, 0.5, lvl === 'hs' ? 34 : 26) * k;
  const scoring = r.sho * 0.55 + r.fin * 0.45;
  const ts = clamp(0.48 + rel * 0.004 + (scoring - 55) * 0.002, 0.42, 0.66);
  const tsa = pts / (2 * ts);
  const fta = tsa * 0.28, fga = tsa - 0.44 * fta;
  const threeShare = clamp(0.18 + (r.sho - 50) * 0.008 + a.three, 0.02, 0.6);
  const tpa = fga * threeShare;
  const tpp = clamp(0.28 + (r.sho - 50) * 0.003, 0.2, 0.45);
  const ftp = clamp(0.6 + (r.sho - 45) * 0.005, 0.5, 0.9);
  const posReb = { PG: 3.6, SG: 4.2, SF: 5.6, PF: 7.2, C: 8.4 }[L.pos] + (Number.isFinite(L.ht) ? sizeOf(L).dh * 0.25 : 0);
  const reb = Math.max(1, posReb + (r.reb - 50) * 0.13 + rel * 0.1) * k;
  const ast = Math.max(0.7, 1.6 + (r.pla - 40) * 0.12 + rel * 0.04) * k;
  const stl = Math.max(0.1, 0.6 + (r.def - 50) * 0.02 + rel * 0.02) * k;
  const big = Math.max(0.1, { PG: 0.2, SG: 0.25, SF: 0.45, PF: 0.8, C: 1.2 }[L.pos] + (archBase(L) === 'anchor' ? 0.6 : 0) + (Number.isFinite(L.ht) ? sizeOf(L).dh * 0.07 : 0));
  const blk = Math.max(0.05, big + (r.def - 50) * 0.02 * big + rel * 0.02 * big) * k;
  return { pts, fga, tpa, tpp, fta, ftp, reb, ast, stl, blk };
}
/* One game's line, drawn and added to the season. Returns the points. */
function amLine(L, rng, mean, k) {
  const s = L.season, T = s.tot;
  const ptsMean = mean.pts * k;
  const pts0 = Math.max(0, Math.round(ptsMean + norm(rng) * ptsMean * 0.32));
  const reb = Math.max(0, Math.round(mean.reb * k + norm(rng) * mean.reb * 0.32));
  const ast = Math.max(0, Math.round(mean.ast * k + norm(rng) * mean.ast * 0.34));
  const stl = Math.max(0, Math.round(mean.stl * k + norm(rng) * 0.8));
  const blk = Math.max(0, Math.round(mean.blk * k + norm(rng) * 0.7));
  const tpa = Math.max(0, Math.round(mean.tpa * k + norm(rng) * 1.2));
  const tpm = Math.min(tpa, Math.max(0, Math.round(tpa * mean.tpp + norm(rng) * 0.9)));
  const fta = Math.max(0, Math.round(mean.fta * k + norm(rng) * 1.3));
  const ftm = Math.min(fta, Math.round(fta * mean.ftp));
  const twom = Math.max(0, Math.round((pts0 - ftm - 3 * tpm) / 2));
  const fga = Math.max(tpa + twom, Math.round(mean.fga * k + norm(rng) * 1.8));
  const pts = ftm + 3 * tpm + 2 * twom;
  T.pts += pts; T.reb += reb; T.ast += ast; T.stl += stl; T.blk += blk;
  T.fga += fga; T.fgm += tpm + twom; T.tpa += tpa; T.tpm += tpm; T.fta += fta; T.ftm += ftm;
  s.gp++;
  if (pts > s.hi.pts) s.hi.pts = pts;
  if (reb > s.hi.reb) s.hi.reb = reb;
  if (ast > s.hi.ast) s.hi.ast = ast;
  if (pts >= 10 && reb >= 10 && ast >= 10) L.am.tripleDoubles = (L.am.tripleDoubles || 0) + 1;
  return pts;
}
/* A stretch of games. `opp(rng, i)` is the other side's strength. */
function amGames(L, n, opp, tag, beats, conf) {
  const s = L.season;
  const rng = rngAt(L, 'am:' + tag);
  const role = amRole(L);
  s.role = role;
  const mean = amMeans(L, role.min);
  const us0 = teamNetAm(L);
  for (let i = 0; i < n; i++) {
    const g = s.g + 1;
    const hurt = s.injury && g >= s.injury.from && g < s.injury.until;
    const rest = !hurt && s.mods.rest > 0 && rng() < s.mods.rest;
    let us = us0;
    if (!hurt && !rest) {
      const mn = role.min * (0.86 + rng() * 0.28);
      s.tot.min += mn;
      const p = amLine(L, rng, mean, mn / role.min);
      if (p > (L.am.high || 0)) {
        L.am.high = p;
        if (p >= (s.lvl === 'hs' ? 40 : 32)) beats.push({ kind: 'game', text: 'A career high: ' + p + ' points.', tone: 'gold' });
      }
      us += amImpact(L, mn);
    } else s.out++;
    const o = opp(rng, i);
    const won = rng() < amP(us - o, i % 2 === 0, s.lvl);
    s.g = g;
    if (won) s.w++; else s.l++;
    if (conf) { if (won) s.conf.w++; else s.conf.l++; }
  }
  bump(L, { health: -Math.round(role.min * 0.08 * n / 15) });
}
function amInjury(L, tag, beats) {
  const s = L.season;
  if (s.injury && s.injury.until > s.g) return;
  const rng = rngAt(L, 'aminj:' + tag);
  const p = 0.05 + (100 - L.dur) * 0.0008 + Math.max(0, 60 - L.m.health) * 0.0015 + s.mods.risk;
  if (rng() >= p) return;
  const major = rng() < 0.12;
  const kind = major ? pick(rng, ['broken foot', 'torn ligament in the thumb', 'stress fracture']) : pick(rng, ['sprained ankle', 'jammed finger', 'bruised hip', 'tight hamstring']);
  const g = major ? 8 + Math.floor(rng() * 10) : 1 + Math.floor(rng() * 4);
  s.injury = { from: s.g + 1 + Math.floor(rng() * 4), until: 0, kind };
  s.injury.until = s.injury.from + g;
  bump(L, { health: major ? -14 : -5 });
  beats.push({ kind: 'injury', text: 'A ' + kind + ' costs you ' + g + (g === 1 ? ' game.' : ' games.'), tone: 'bad' });
  logIt(L, 'Missed ' + g + (g === 1 ? ' game' : ' games') + ' with a ' + kind + '.', 'bad');
}

// ── tournaments ──

const POD = [[1, 16, 8, 9], [5, 12, 4, 13], [6, 11, 3, 14], [7, 10, 2, 15]];
const seedNet = (s) => 17 - s * 1.25;
function ncaaOppSeed(rng, s, r) {
  if (r === 0) return 17 - s;
  const pod = POD.findIndex((p) => p.indexOf(s) >= 0);
  if (r === 1) {
    const p = POD[pod], i = p.indexOf(s);
    const other = i < 2 ? [p[2], p[3]] : [p[0], p[1]];
    other.sort((a, b) => a - b);
    return rng() < 0.68 ? other[0] : other[1];
  }
  if (r === 2) {
    const adj = POD[pod ^ 1].slice().sort((a, b) => a - b);
    return rng() < 0.62 ? adj[0] : adj[1 + Math.floor(rng() * 3)];
  }
  const pool = r === 3 ? POD[pod < 2 ? 2 : 0].concat(POD[pod < 2 ? 3 : 1]) : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  return weighted(rng, pool, (x) => 1 / Math.pow(x, r === 3 ? 1.3 : 2));
}
function oppSchool(L, rng, seed) {
  const want = seed <= 4 ? ['blue', 'power'] : seed <= 10 ? ['power', 'mid'] : ['mid', 'low'];
  const pool = SCHOOLS.filter((s) => s.name !== L.am.college && want.indexOf(s.tier) >= 0);
  return pick(rng, pool).name;
}
function hsOpp(L, rng) {
  return pick(rng, HOMETOWNS.filter((t) => t !== L.am.town)) + ' ' + pick(rng, HS_SUFFIX);
}
/* Single elimination, a round at a time up to `upto`. The first close game of a
   run, if you are on the floor for it, is a last possession and it is yours. */
function runTourney(L, beats) {
  const s = L.season, t = s.tourney;
  while (t.alive && !t.done && t.r < t.upto && !t.waiting) {
    const rng = rngAt(L, 'tg:' + t.kind + ':' + t.r);
    let opp, oNet, oSeed = null;
    if (t.kind === 'hs') { opp = hsOpp(L, rng); oNet = [-0.5, 1, 2.5, 3.5][t.r] + norm(rng) * 2; }
    else { oSeed = ncaaOppSeed(rng, t.seed, t.r); opp = oppSchool(L, rng, oSeed); oNet = seedNet(oSeed) + norm(rng) * 1.5; }
    const role = s.role || amRole(L);
    const playing = !(s.injury && s.injury.until > s.g + 1);
    const mn = Math.min(36, role.min + 2);
    let us = teamNetAm(L);
    let pts = null;
    if (playing) { pts = amLine(L, rng, amMeans(L, mn), 1); s.tot.min += mn; us += amImpact(L, mn); }
    const p = amP(us - oNet, t.kind === 'hs' && t.r < 2, s.lvl);
    const u = rng();
    s.g++;
    const g = { r: t.r, opp, seed: oSeed, net: oNet, pts };
    if (playing && role.starter && !t.clutched && Math.abs(u - p) < 0.07) {
      t.clutched = true;
      if (duelOn(L)) g.p = round1(p * 100) / 100;
      t.waiting = true;
      t.cur = g;
      L.pending.push(amClutchCard(L, t, g));
      return;
    }
    endTourneyGame(L, t, g, u < p, beats);
  }
}
function endTourneyGame(L, t, g, won, beats) {
  const s = L.season;
  const names = t.kind === 'hs' ? HS_ROUNDS : NCAA_ROUNDS;
  if (won) s.w++; else s.l++;
  t.games.push({ r: g.r, opp: g.opp, seed: g.seed, won, pts: g.pts });
  const who = (g.seed ? g.seed + ' seed ' : '') + g.opp;
  const yours = g.pts != null ? ' You score ' + g.pts + '.' : ' You watch from the bench.';
  const line = (won ? 'Beat ' : 'Lost to ') + who + ' in the ' + names[g.r] + '.' + yours;
  beats.push({ kind: 'po', text: line, tone: won ? 'good' : 'bad' });
  if (!won) { t.alive = false; t.done = true; logIt(L, (t.kind === 'hs' ? 'Out in the ' : 'Out of the tournament in the ') + names[g.r] + '.', 'bad'); return; }
  t.r++;
  if (t.r >= names.length) {
    t.done = true; t.champ = true;
    const txt = t.kind === 'hs' ? 'State champions.' : 'National champions.';
    beats.push({ kind: 'champ', text: txt, tone: 'gold', level: t.kind });
    logIt(L, (t.kind === 'hs' ? L.am.hs.name : L.am.college) + ': ' + txt, 'gold');
    bump(L, { fame: t.kind === 'hs' ? 6 : 12, morale: 12 });
    if (t.kind === 'ncaa') L.pending.push(presserCard(L, 'ncaa'));
  }
}
function amClutchCard(L, t, g) {
  const names = t.kind === 'hs' ? HS_ROUNDS : NCAA_ROUNDS;
  const key = 'amclutch:' + t.kind + ':' + g.r;
  const look = defenseLook(L, key + ':' + L.year);
  const opts = clutchOptions(L, look);
  const ctx = { r: g.r };
  if (look) { ctx.look = look; ctx.mate = duelMate(L, key); if (mateIsReal(L)) ctx.mateReal = 1; }
  return {
    id: 'amclutch', kind: 'clutch', key, scene: t.kind === 'hs' ? 'The home gym' : 'March Madness',
    eyebrow: names[g.r] + ' · ' + (g.seed ? g.seed + ' seed ' : '') + g.opp,
    title: 'Tied. Six seconds. Your ball.',
    text: (t.kind === 'hs' ? 'The whole town\'s packed into the gym.' : 'It\'s March, and every bracket in the country is watching.') + ' ' + (look ? LOOKS[look].t : 'What\'s the play?'),
    ctx,
    options: opts.map((o) => ({ label: o.label, hint: RATING_NAME[o.rate] + ' ' + ovT(L, L.rt[o.rate]) + '.' })),
  };
}

// ── the steps of a high school year ──

function hsRegular(L, beats) {
  const s = L.season;
  const role = amRole(L);
  s.role = role;
  beats.push({ kind: 'role', text: L.am.hs.name + ': ' + role.label + ', about ' + Math.round(role.min) + ' minutes a night.', tone: '' });
  amInjury(L, 'hs1', beats);
  amGames(L, 13, (r) => norm(r) * 3, 'hs1', beats, false);
  /* A story career stops at the halfway mark, so what happens in January is
     dealt in January and can still change February. */
  const pg = perGame(s);
  beats.push({ kind: 'record', text: 'Halfway: ' + s.w + '-' + s.l + '. You: ' + pg.pts + ' points, ' + pg.reb + ' rebounds.', tone: s.w >= s.l ? 'good' : '' });
  L.phase = 'hs_mid';
  queueEvents(L, 'hs', 1 + (rngAt(L, 'n:hs')() < 0.5 ? 1 : 0), AM_EVENTS);
  return;
}
function hsSecondHalf(L, beats) {
  const s = L.season;
  amInjury(L, 'hs2', beats);
  amGames(L, HS_GAMES - 13, (r) => norm(r) * 3 + 0.5, 'hs2', beats, false);
  s.qual = s.w >= 13;
  const pg = perGame(s);
  beats.unshift({ kind: 'record', text: s.w + '-' + s.l + (s.qual ? '. Into the state playoffs.' : '. No playoffs.'), tone: s.qual ? 'good' : 'bad' });
  beats.push({ kind: 'record', text: 'You: ' + pg.pts + ' points, ' + pg.reb + ' rebounds, ' + pg.ast + ' assists.', tone: '' });
  logIt(L, GRADE[L.am.grade][0].toUpperCase() + GRADE[L.am.grade].slice(1) + ' year: ' + s.w + '-' + s.l + ', ' + pg.pts + ' a night.', '');
  L.phase = 'hs_reg';

}
function hsPlayoffs(L, beats) {
  const s = L.season;
  L.phase = 'hs_po';
  if (!s.qual) { closeAm(L, beats); return; }
  s.tourney = { kind: 'hs', r: 0, upto: 4, alive: true, done: false, games: [], clutched: false, waiting: false };
  runTourney(L, beats);
  if (s.tourney.done) closeAm(L, beats);
}

// ── the steps of a college year ──

function colStart(L, beats) {
  const s = L.season;
  const role = amRole(L);
  s.role = role;
  beats.push({ kind: 'role', text: L.am.college + ': ' + role.label + ', about ' + Math.round(role.min) + ' minutes a night.', tone: '' });
  amInjury(L, 'c1', beats);
  amGames(L, 12, (r) => -3 + norm(r) * 6, 'c1', beats, false);
  const pg = perGame(s);
  beats.push({ kind: 'record', text: 'Non-conference: ' + s.w + '-' + s.l + '. You: ' + pg.pts + ' points, ' + pg.reb + ' rebounds.', tone: s.w >= s.l ? 'good' : '' });
  L.phase = 'col_early';
  queueEvents(L, 'col', 1 + (rngAt(L, 'n:c1')() < 0.5 ? 1 : 0), AM_EVENTS);
}
function colConf(L, beats) {
  const s = L.season;
  const cn = CONF_NET[SCHOOL_BY[L.am.college].conf] || 0;
  amInjury(L, 'c2', beats);
  amGames(L, 19, (r) => cn + norm(r) * 4, 'c2', beats, true);
  const pg = perGame(s);
  beats.push({ kind: 'record', text: SCHOOL_BY[L.am.college].conf + ' play: ' + s.conf.w + '-' + s.conf.l + '. ' + s.w + '-' + s.l + ' overall. You: ' + pg.pts + ' a night.', tone: s.conf.w >= s.conf.l ? 'good' : '' });
  L.phase = 'col_mid';
  queueEvents(L, ('col_mar'), 1, AM_EVENTS);
}
/* The conference tournament, then Selection Sunday, then the awards. */
function colMarch(L, beats) {
  const s = L.season;
  const sc = SCHOOL_BY[L.am.college];
  const cn = CONF_NET[sc.conf] || 0;
  const rng = rngAt(L, 'conft');
  const role = s.role || amRole(L);
  let wins = 0, auto = false;
  for (let i = 0; i < 4; i++) {
    const us = teamNetAm(L) + amImpact(L, role.min);
    s.g++;
    if (!(s.injury && s.injury.until > s.g)) { amLine(L, rng, amMeans(L, role.min), 1); s.tot.min += role.min; }
    if (rng() < amP(us - (cn + i * 1.2 + norm(rng) * 2), false, 'col')) { s.w++; wins++; } else { s.l++; break; }
  }
  if (wins === 4) { auto = true; beats.push({ kind: 'po', text: sc.conf + ' tournament champions.', tone: 'gold' }); logIt(L, sc.conf + ' tournament champions.', 'good'); }
  else beats.push({ kind: 'po', text: 'Out of the ' + sc.conf + ' tournament after ' + (wins === 0 ? 'one game.' : wins + (wins === 1 ? ' win.' : ' wins.')), tone: '' });
  /* Selection Sunday. */
  const us = teamNetAm(L) + amImpact(L, role.min);
  const score = us + (s.w - s.l) * 0.12;
  let seed = Math.round(18 - score * 0.8);
  let inn = seed <= 11 || auto;
  if (auto) seed = Math.max(seed, sc.tier === 'low' ? 13 : seed);
  seed = clamp(seed, 1, 16);
  s.seed = inn ? seed : null;
  if (inn) {
    s.tourney = { kind: 'ncaa', seed, r: 0, upto: 0, alive: true, done: false, games: [], clutched: false, waiting: false };
    beats.push({ kind: 'record', text: 'Selection Sunday: a ' + seed + ' seed. ' + s.w + '-' + s.l + '.', tone: 'good' });
    logIt(L, 'Into the NCAA Tournament as a ' + seed + ' seed.', 'good');
  } else {
    beats.push({ kind: 'record', text: 'Selection Sunday: your name is not called. ' + s.w + '-' + s.l + '.', tone: 'bad' });
    logIt(L, 'Missed the NCAA Tournament.', 'bad');
  }
  colAwards(L, beats);
  L.phase = 'col_late';
}
function colAwards(L, beats) {
  const s = L.season, pg = perGame(s);
  const rng = rngAt(L, 'colaw');
  const rel = effOvr(L) - COL_BAR;
  const lg = (x) => 1 / (1 + Math.exp(-x));
  const out = [];
  const gpOk = s.gp >= 20;
  const sc = rel + pg.pts * 0.45 + norm(rng) * 1.5;
  if (gpOk && sc >= 30.5) out.push('c_aa1');
  else if (gpOk && sc >= 28) out.push('c_aa2');
  if (gpOk && sc >= 31.5 && rng() < 0.45) out.push('c_npoy');
  if (gpOk && pg.pts >= 13.5 && sc >= 22) out.push('c_allconf');
  if (gpOk && sc >= 25 && s.conf.w - s.conf.l >= 6 && rng() < 0.55) out.push('c_cpoy');
  if (gpOk && L.am.cyear === 1 && pg.pts >= 13 && rng() < lg((pg.pts - 17) * 0.45 + (rel - 12) * 0.2)) out.push('c_fr');
  for (const a of out) {
    s.awards.push(a);
    beats.push({ kind: 'award', text: AWARD_NAME[a] + '.', tone: 'gold' });
    logIt(L, AWARD_NAME[a] + '.', 'gold');
  }
  bump(L, { fame: out.length * 3 });
}
function colTourney(L, beats, upto) {
  const s = L.season, t = s.tourney;
  L.phase = 'col_po';
  t.upto = upto;
  runTourney(L, beats);
  if (t.done) closeAm(L, beats);
}

/* A year as a professional before the draft: overseas, or in the G League. */
const ALT_TEAM = { intl: 'Overseas', gl: 'G League', juco: 'Junior college', prep: 'Prep school', gap: 'Private runs', rec: 'Rec league' };
const ALT_NET = { intl: 0, gl: 0, juco: -6, prep: -3, gap: -2, rec: -9 };
function proYear(L, beats) {
  const route = L.am.route;
  /* The year plays in two halves, with a card between, so it can have a
     story. */
  if (!L.am.altHalf) {
    L.am.proTeam = ALT_TEAM[route] || 'G League';
    L.am.proNet = round1(norm(rngAt(L, 'pronet')) * 3 + (ALT_NET[route] || 0));
    newAmSeason(L, 'pro');
    const s = L.season;
    s.role = amRole(L);
    amInjury(L, 'pro', beats);
    amGames(L, 16, (r) => norm(r) * 3, 'pro', beats, false);
    L.am.altHalf = 1;
    queueEvents(L, 'alt', 1 + (rngAt(L, 'n:alt')() < 0.5 ? 1 : 0), AM_EVENTS);
    return;
  }
  L.am.altHalf = 0;
  amGames(L, 16, (r) => norm(r) * 3, 'pro2', beats, false);
  const s = L.season;
  const pg = perGame(s);
  const where = { intl: 'A season overseas against grown men', gl: 'A season in the G League', juco: 'A junior college season',
    prep: 'A prep school season', gap: 'A year of private runs', rec: 'A year of rec league and pro-ams' }[route] || 'A season';
  beats.push({ kind: 'record', text: where + ': ' + pg.pts + ' points, ' + pg.reb + ' rebounds, ' + pg.ast + ' assists.', tone: 'good' });
  bump(L, { cash: route === 'intl' ? 0.5 : route === 'gl' ? 0.6 : route === 'rec' ? 0.03 : 0, iq: 2 });
  L.am.stock = (L.am.stock || 0) + (route === 'rec' ? -1.5 : route === 'gap' ? 0.4 : 1) + Math.max(0, (pg.pts - 12) * 0.15);
  s.finish = ALT_TEAM[route] === 'Overseas' ? 'Pro' : ALT_TEAM[route] || 'G League';
  pushAmHist(L);
  developAm(L, beats);
  if (route === 'juco' || route === 'prep') {
    /* One year away, then the choice again, with whatever the year earned. */
    L.am.altDone = true;
    L.am.level = 'hs';
    L.am.grade = 12;
    if (route === 'juco') L.am.jucoYear = true;
    L.am.rstock = (L.am.rstock || 0) + clamp((pg.pts - 14) * 0.08, -0.5, 1.2) + (route === 'prep' ? 0.6 : 0.3);
    L.am.rank = nationalRank(L);
    L.stage = 'hs';
    L.phase = 'hs_off';
    beats.push({ kind: 'rank', text: 'New offers come in. ' + rankText(L.am.rank) + '.', tone: 'good' });
    queueEvents(L, 'hs_off', 0, AM_EVENTS);
    L.pending.push(commitCard(L));
    return;
  }
  L.age++;
  L.year++;
  driftLeague(L, beats);
  if (route === 'rec') L.flags.stock = (L.flags.stock || 0) - 6;
  toDraft(L, beats, route);
}

// ── the end of an amateur season ──

function pushAmHist(L) {
  const s = L.season, pg = perGame(s);
  const lvl = s.lvl === 'hs' ? 'HS' : s.lvl === 'col' ? 'NCAA' : L.am.route === 'intl' ? 'Overseas' : L.am.route === 'gl' ? 'G League' : ALT_TEAM[L.am.route] || 'G League';
  L.amHist.push(Object.assign({ y: s.year, age: L.age, lvl, school: s.school, ovr: ovrOf(L), w: s.w, l: s.l,
    finish: s.finish || '', seed: s.seed || null, rank: L.am.rank || null, aw: s.awards.slice() }, pg));
}
function developAm(L, beats) {
  const before = ovrOf(L);
  const rng = rngAt(L, 'develop');
  const gap = Math.max(0, L.pot - before);
  const eth = 0.65 + L.eth / 100 * 0.7;
  const grow = gap * (GROW_AM[L.age] || 0.08) * eth * lvl(L).grow;
  for (const k of RATINGS) L.rt[k] = clamp(Math.round(L.rt[k] + grow * (0.6 + rng() * 0.8)), 25, 99);
  const after = ovrOf(L);
  if (after !== before) {
    const sd = ovT(L, after) - ovT(L, before), sa = ovT(L, after);
    const t = (sd > 0) ? 'Up ' + sd + ' overall this summer, to ' + sa + '.' : 'Still ' + sa + ' overall.';
    beats.push({ kind: 'dev', text: t, tone: 'good' });
    logIt(L, t, 'good');
  }
  bump(L, { health: 30 });
}
function closeAm(L, beats) {
  const s = L.season, pg = perGame(s);
  const rng = rngAt(L, 'amclose');
  const t = s.tourney;
  if (s.lvl === 'hs') {
    s.finish = t ? (t.champ ? 'State champion' : 'Lost in the ' + HS_ROUNDS[t.r].toLowerCase()) : 'No playoffs';
    if (t && t.champ) s.awards.push('hs_state');
    const sc = pg.pts + norm(rng) * 2.5;
    if (s.gp >= 18 && sc >= 19) s.awards.push('hs_allstate');
    if (s.gp >= 18 && L.am.grade >= 11 && pg.pts >= 22 && s.w >= 17 && rng() < 0.45) s.awards.push('hs_mrbb');
  } else {
    s.finish = !t ? 'No tournament' : t.champ ? 'National champion' : 'Lost in the ' + NCAA_ROUNDS[t.r];
    if (t && t.r >= 4) s.awards.push(t.champ ? 'c_champ' : 'c_f4');
    if (t && t.champ && s.role && s.role.starter && (s.role.diff >= 6 || rng() < 0.3)) s.awards.push('c_mop');
  }
  /* What the year did to the board. */
  const before = L.am.rank;
  if (s.lvl === 'hs') {
    L.am.rstock = clamp((L.am.rstock || 0) * 0.7 + clamp((pg.pts - 18) * 0.05, -0.6, 0.8) + (t && t.champ ? 0.5 : 0) + s.awards.length * 0.25, -3, 3);
  } else {
    let st = clamp((pg.pts - 12) * 0.12, -1, 1.6) + (t ? Math.min(t.r, 5) * 0.25 : -0.3);
    for (const a of s.awards) st += { c_aa1: 2, c_aa2: 1.2, c_npoy: 2, c_allconf: 0.4, c_cpoy: 0.6, c_fr: 0.8, c_f4: 0.4, c_champ: 0.8, c_mop: 1 }[a] || 0;
    /* The board reads the last season hardest, so stock decays. */
    L.am.stock = clamp((L.am.stock || 0) * 0.5 + st * 0.6, -3, 3.5);
  }
  const target = clamp((s.lvl === 'hs' ? 8 : 14) + (pg.pts - 10) * (s.lvl === 'hs' ? 1.1 : 1.8) + (t && t.champ ? 8 : 0), 3, 80);
  L.m.fame = clamp(Math.round(L.m.fame * 0.7 + target * 0.3 + (s.awards.length ? 2 : 0)), 0, 100);
  for (const a of s.awards) if (a !== 'hs_state' && a !== 'c_champ') {
    if (s.lvl === 'hs' || a === 'c_f4' || a === 'c_mop') { beats.push({ kind: 'award', text: AWARD_NAME[a] + '.', tone: 'gold' }); logIt(L, AWARD_NAME[a] + '.', 'gold'); }
  }
  pushAmHist(L);
  developAm(L, beats);
  /* Senior year's honour comes after the season and the summer's growth, on the
     final ranking. */
  if (s.lvl === 'hs') {
    L.am.rank = nationalRank(L);
    const d = before - L.am.rank;
    beats.push({ kind: 'rank', text: 'New rankings: ' + rankText(L.am.rank) + '.' + (Math.abs(d) >= 15 ? (d > 0 ? ' Up ' + d + ' spots.' : ' Down ' + (-d) + ' spots.') : ''), tone: d > 0 ? 'good' : d < -15 ? 'bad' : '' });
    if (L.am.grade === 12 && L.am.rank <= 24) {
      L.amHist[L.amHist.length - 1].aw.push('hs_aag');
      beats.push({ kind: 'award', text: AWARD_NAME.hs_aag + '.', tone: 'gold' });
      logIt(L, AWARD_NAME.hs_aag + '.', 'gold');
      bump(L, { fame: 6 });
    }
    L.phase = 'hs_off';
    hsOffCards(L, beats);
  } else {
    const proj = projectedPick(L, L.am.stock || 0);
    beats.push({ kind: 'rank', text: draftTalk(proj) + '.', tone: proj <= 14 ? 'good' : proj > 50 ? 'bad' : '' });
    L.phase = 'col_off';
    colOffCards(L);
  }
  queueEvents(L, s.lvl === 'hs' ? 'hs_off' : 'col_off', rngAt(L, 'n:off')() < 0.55 ? 1 : 0, AM_EVENTS);
}
function draftTalk(p) {
  if (p <= 3) return 'Mock drafts have you in the top three';
  if (p <= 14) return 'Mock drafts have you in the lottery, around ' + ordinal(p);
  if (p <= 30) return 'Mock drafts have you in the first round, around ' + ordinal(p);
  if (p <= 50) return 'Mock drafts have you in the second round';
  return 'You\'re not on the mock drafts yet';
}

// ── recruiting and the decisions between years ──

function hsOffCards(L) {
  const g = L.am.grade;
  if (g === 11 && !L.am.college && !(L.am.rank > 150)) {
    const list = collegeOffers(L, 'jr');
    L.am.offers = list;
    L.pending.push({
      id: 'offers', kind: 'event', key: 'offers', scene: 'The kitchen table', eyebrow: 'Recruiting', title: 'Commit now, or wait?',
      text: rankText(L.am.rank) + '. The offers are on the table. Senior year could bring better ones, or worse.',
      ctx: { list },
      options: list.slice(0, 3).map((n) => ({ label: 'Commit to ' + n, hint: schoolHint(L, n), school: n }))
        .concat([{ label: 'Keep your options open', hint: 'Bet on your senior year' }]),
    });
  } else if (g === 12) {
    if (L.am.college) {
      L.pending.push({
        id: 'signing', kind: 'event', key: 'signing', scene: 'Signing day', eyebrow: 'Signing day', title: 'Sign it, or reopen?',
        text: 'The pen\'s on the table and your family\'s in the front row. You committed to ' + L.am.college + '.',
        options: [
          { label: 'Sign with ' + L.am.college, hint: 'You gave your word' },
          { label: 'Reopen your recruitment', hint: 'See who else is out there' },
        ],
      });
    } else L.pending.push(commitCard(L));
  }
}
function commitCard(L) {
  const list = collegeOffers(L, 'sr');
  L.am.offers = list;
  const opts = list.slice(0, 3).map((n) => ({ label: 'Commit to ' + n, hint: schoolHint(L, n), school: n }));
  const rk = L.am.rank, again = !!L.am.altDone;
  if (!again) {
    /* A story career sees every road its ranking really has. */
    if (rk >= 90 && rk <= 420) opts.push({ label: 'Do a prep school year', hint: 'One more year to grow', route: 'prep' });
    if (rk <= 80 && rngAt(L, 'gapoffer')() < 0.6) opts.push({ label: 'Take a gap year', hint: 'Train alone. No team, no games.', route: 'gap' });
  }
  if (!again && (rk <= 90 || (rk <= 110)) && ((rngAt(L, 'intloffer')() < 0.65))) opts.push({ label: 'Turn pro overseas', hint: 'Get paid to play grown men', route: 'intl' });
  if (!again && (rk <= 140 || (rk <= 165)) && ((rngAt(L, 'gloffer')() < 0.45))) opts.push({ label: 'Sign with the G League', hint: 'A paycheck and pro coaching', route: 'gl' });
  if (!again) {
    const power = SCHOOLS.filter((x) => x.tier === 'power');
    const walk = power[Math.floor(rngAt(L, 'walkon')() * power.length)].name;
    if (rk >= 265) opts.push({ label: 'Walk on at ' + walk, hint: 'No scholarship. Earn the jersey.', route: 'walkon', school: walk });
    if (rk >= 262) opts.push({ label: 'Go the junior college route', hint: 'Hot gym, maybe a D1 offer', route: 'juco' });
    if (rk >= 355) opts.push({ label: 'Get a job, play rec league', hint: 'No offer. Keep hooping anyway.', route: 'rec' });
  }
  return {
    id: 'commit', kind: 'event', key: 'commit', scene: 'The school gym', eyebrow: 'Decision day', title: 'Which hat are you putting on?',
    text: rankText(L.am.rank) + '. The hats are lined up on the table and the cameras are rolling.',
    ctx: { list }, options: opts,
  };
}
function colOffCards(L) {
  const cy = L.am.cyear;
  if (cy >= 4) { L.am.declared = true; return; }
  const proj = projectedPick(L, L.am.stock || 0);
  const next = CYEAR[cy + 1];
  L.pending.push({
    id: 'declare', kind: 'event', key: 'declare', scene: 'Coach\'s office', eyebrow: 'The draft deadline', title: 'Stay in school, or go pro?',
    text: draftTalk(proj) + '. You\'ve got until April to decide.',
    ctx: { proj },
    options: [
      { label: 'Declare for the draft', hint: proj <= 30 ? 'Get paid. Projected ' + ordinal(proj) + '.' : 'Second round or worse. A gamble.' },
      { label: 'Come back for your ' + next + ' year', hint: 'Grow up, chase another March' },
      { label: 'Enter the transfer portal', hint: 'A bigger role somewhere else' },
    ],
  });
}
function portalCard(L) {
  const proj = projectedPick(L, L.am.stock || 0);
  const saveRank = L.am.rank;
  /* The portal reads you off what you just did, not what you were at 17. */
  L.am.rank = clamp(Math.round(proj * 5), 1, 700);
  const list = collegeOffers(L, 'portal' + L.am.cyear).filter((n) => n !== L.am.college).slice(0, 3);
  L.am.rank = saveRank;
  return {
    id: 'portal', kind: 'event', key: 'portal', scene: 'Your phone', eyebrow: 'Transfer portal', title: 'Where do you transfer?',
    text: 'Your name hit the portal an hour ago. Your phone hasn\'t stopped buzzing since.',
    ctx: { list },
    options: list.map((n) => ({ label: 'Transfer to ' + n, hint: schoolHint(L, n), school: n }))
      .concat([{ label: 'Stay at ' + L.am.college, hint: 'Pull your name back out' }]),
  };
}

/* The summer between, which is where an amateur year begins. */
function amNewYear(L, beats) {
  L.age++;
  L.year++;
  driftLeague(L, beats);
  L.season = null;
  if (L.am.level === 'hs' && L.am.grade < 12) {
    L.am.grade++;
    beats.push({ kind: 'year', text: GRADE[L.am.grade][0].toUpperCase() + GRADE[L.am.grade].slice(1) + ' year. You are ' + L.age + '.', tone: '' });
    newAmSeason(L, 'hs');
    L.phase = 'hs_pre';
    L.pending.push(hsSummerCard(L));
    queueEvents(L, 'hs_sum', rngAt(L, 'n:sum')() < 0.55 ? 1 : 0, AM_EVENTS);
    return;
  }
  if (L.am.level === 'hs') {
    /* Out of high school. */
    if (L.am.route === 'intl' || L.am.route === 'gl' || (!L.am.college && ALT_DONE[L.am.route])) {
      L.am.level = 'pro';
      L.stage = 'pro';
      L.phase = 'pro_year';
      const r = L.am.route;
      beats.push({ kind: 'year', text: (r === 'intl' ? 'You sign overseas.' : r === 'gl' ? 'You sign with a G League team.' : ALT_NAME[r] + '.') + ' You are ' + L.age + '.', tone: 'gold' });
      return;
    }
    L.am.level = 'col';
    L.stage = 'col';
    L.am.cyear = L.am.jucoYear ? 2 : 1;
    beats.push({ kind: 'year', text: CYEAR[L.am.cyear][0].toUpperCase() + CYEAR[L.am.cyear].slice(1) + ' year at ' + L.am.college + '. You are ' + L.age + '.', tone: 'gold' });
    logIt(L, 'Enrolled at ' + L.am.college + '.', 'gold');
    colYear(L);
    return;
  }
  if (L.am.declared) { toDraft(L, beats, L.am.cyear === 1 ? 'oad' : 'senior'); return; }
  L.am.cyear++;
  beats.push({ kind: 'year', text: CYEAR[L.am.cyear][0].toUpperCase() + CYEAR[L.am.cyear].slice(1) + ' year at ' + L.am.college + '. You are ' + L.age + '.', tone: '' });
  colYear(L);
}
function colYear(L) {
  newAmSeason(L, 'col');
  L.phase = 'col_pre';
  L.pending.push(summerCard(L));
  queueEvents(L, 'col_pre', rngAt(L, 'n:cpre')() < 0.65 ? 1 : 0, AM_EVENTS);
}

/* EVERY ROAD ENDS ON TODAY'S DRAFT. A road is three to seven years long and
   the player decides how long, so no start date can promise where it ends.
   The road is played on a floating calendar instead: the league does not
   move while you are an amateur (driftLeague, rosterSummer), and at the
   combine every year the career has written is moved so the rookie season is
   the one the roster file is for. You are drafted into today's league, with
   today's rosters and today's coaches, whatever road got you there. */
function landOnToday(L) {
  const lg = L.league, target = lg.rs || (lg.latest || 2026) + 1;
  const d = target - L.year;
  delete lg.rost; delete lg.rostY; delete lg.pool; delete lg.fo;
  if (!d) return;
  const sh = (v) => (Number.isFinite(v) && v > 1900 ? v + d : v);
  L.year += d;
  for (const h of L.amHist || []) h.y = sh(h.y);
  for (const x of L.log || []) x.y = sh(x.y);
  for (const x of L.feed || []) x.y = sh(x.y);
  for (const k in L.mem || {}) L.mem[k].y = sh(L.mem[k].y);
  for (const k in L.arcs || {}) { const a = L.arcs[k]; a.y = sh(a.y); a.at = sh(a.at); }
  for (const k in L.evlog || {}) L.evlog[k] = L.evlog[k].map(sh);
  /* The narrator's own calendar (which line was said which season). */
  if (L.narr) { L.narr.y = sh(L.narr.y); for (const k in L.narr.u) L.narr.u[k] = sh(L.narr.u[k]); }
  for (const k in L.people || {}) { const p = L.people[k]; p.met = sh(p.met); for (const n of p.notes || []) n[0] = sh(n[0]); }
  for (const k in L.traits || {}) L.traits[k].known = sh(L.traits[k].known);
  if (L.flags.offUsed) L.flags.offUsed.y = sh(L.flags.offUsed.y);
  if (L.life) L.life.since = sh(L.life.since);
  for (const f of lg.figs || []) { f.b = sh(f.b); f.gone = sh(f.gone); if (f.won) f.won = f.won.map(sh); }
  for (const k in lg.news || {}) lg.news[k] = sh(lg.news[k]);
  /* A college coach who took an NBA job on the road (coach_leaves) keeps it,
     dated on the same calendar. The coaches the league opened with keep the
     dates they came with. */
  for (const c in lg.coach || {}) { const x = lg.coach[c]; if (x && x.n !== COACHES_NOW[c][0] && x.n !== (lg.cn && lg.cn[c])) x.since = Math.min(target, sh(x.since)); }
  for (const f of lg.free || []) f.out = Math.min(target - 1, sh(f.out));
}
/* The road ends at the combine card a draft-night career starts on. */
function toDraft(L, beats, route) {
  if (L.am && L.am.college) remember(L, 'route.' + (L.am.cyear >= 4 ? 'four' : L.am.cyear === 1 ? 'oad' : 'college'), true);
  L.stage = 'nba';
  L.bg = route === 'senior' ? 'senior' : route === 'intl' ? 'intl' : route === 'gl' ? 'gl' : 'oad';
  L.season = null;
  L.team = null;
  L.flags.stock = (L.flags.stock || 0) + (L.am.stock || 0);
  chStock(L);
  if (L.opt && L.opt.cal) landOnToday(L);
  L.phase = 'combine';
  L.pending.push(combineCard(L));
  const t = 'You declare for the ' + (L.year - 1) + ' NBA Draft.';
  beats.push({ kind: 'year', text: t, tone: 'gold' });
  logIt(L, t, 'gold');
}

function hsSummerCard(L) {
  return {
    id: 'hs_summer', kind: 'event', key: 'hs_summer', scene: 'Summer break', eyebrow: 'Summer before ' + GRADE[L.am.grade] + ' year',
    title: 'Where are you spending the summer?',
    text: 'You\'re ' + L.age + '. Overall ' + ovT(L, ovrOf(L)) + '. ' + rankText(L.am.rank) + '.',
    options: [
      { label: 'Play the shoe circuit', hint: 'Every scout. Hard on the body.' },
      { label: 'See a skills trainer daily', hint: 'Sharpen what you\'ve got' },
      { label: 'Run with your high school team', hint: 'Chemistry, and {coach} notices.' },
      { label: 'Rest and grow', hint: 'Sleep, eat, stretch' },
    ],
  };
}

// ── the amateur cards ──

const AM_EVENTS = {
  grades: {
    phases: ['hs', 'col'], when: () => true, weight: () => 3,
    tag: 'Study hall',
    title: 'Your grades are slipping',
    text: (L) => L.season && L.season.lvl === 'col' ? '{adviser}, your academic adviser, pulls you aside: "One more bad test and you sit."' : '{coach} keeps it simple: "No grades, no games."',
    options: [
      { label: 'Study every night', hint: 'Boring, but it works', run: (L) => { bump(L, { iq: 1, morale: -2, eth: 3 }); return 'You pass. Barely. Your mom, {mom}, frames the report card anyway.'; } },
      { label: 'Get a tutor', hint: 'Ask for help', run: (L) => { bump(L, { trust: 3, morale: 1 }); return '{tutor} comes by two nights a week. It actually works.'; } },
      { label: 'Wing it', hint: 'Roll the dice', run: (L, r) => { if (ok(r, 0.5)) { bump(L, { morale: 2 }); return 'You wing it and it works. This time.'; } bump(L, { rest: 0.12, trust: -6 }); return 'Academically ineligible. You sit three games and hear about it all week.'; } },
    ],
  },
  mixtape: {
    phases: ['hs', 'hs_sum'], when: (L) => L.am && L.am.level === 'hs', weight: () => 3,
    tag: 'Your phone',
    title: 'Your mixtape just hit a million views',
    text: () => "Somebody set your dunks to music. Your phone hasn't stopped buzzing since.",
    options: [
      { label: 'Post more clips', hint: 'Feed the hype', run: (L) => { bump(L, { fame: 8, trust: -3 }); L.am.rstock = (L.am.rstock || 0) + 0.5; return 'Every scout in the country has seen your left hand now.'; } },
      { label: 'Stay quiet', hint: 'Let it blow over', run: (L) => { bump(L, { trust: 4, iq: 1 }); return "{coach} likes that you didn't change one bit."; } },
      { label: 'Call out {prepstar}', hint: 'Big talk, big risk', run: (L, r) => { bump(L, { fame: 10 }); if (ok(r, 0.4 + (ovrOf(L) - 45) * 0.03)) { L.am.rstock = (L.am.rstock || 0) + 1; return 'He accepts. You cook him at a summer event, on camera.'; } L.am.rstock = (L.am.rstock || 0) - 0.8; bump(L, { morale: -6 }); return 'He accepts. He cooks you. Also on camera.'; } },
    ],
  },
  coach_son: {
    phases: ['hs'], when: (L) => L.am && L.am.grade <= 11 && L.season && L.season.role && L.season.role.diff < 9, weight: () => 3,
    tag: 'Practice',
    title: "{coach}'s son plays your position",
    text: () => "His name's {coachson}. He gets the last shot every time, and everybody knows why.",
    options: [
      { label: 'Outwork him', hint: 'Make it obvious', run: (L, r) => { bump(L, { eth: 5 }); if (ok(r, 0.55)) { bump(L, { min: 6, trust: 6 }); return "By February you're starting. Nobody says a word."; } return "You get better. He still starts. Some things aren't fair."; } },
      { label: 'Talk to {coach}', hint: 'Speak up', run: (L, r) => { if (ok(r, 0.4)) { bump(L, { min: 5 }); return 'He hears you out. More minutes.'; } bump(L, { trust: -8 }); return "He doesn't like being asked. Practice gets colder."; } },
      { label: 'Let your dad handle it', hint: 'Messy, and loud', run: (L) => { bump(L, { trust: -10, morale: 2 }); return 'Your dad, {dad}, handles it. Loudly. In the parking lot.'; } },
    ],
  },
  rival_school: {
    phases: ['hs'], when: () => true, weight: () => 2.5,
    queue: (L) => { const r = rngAt(L, 'prep2'); const pool = SCHOOLS.filter((x) => x.tier === 'blue' || x.tier === 'power'); arcStart(L, 'prep', 'arc_prep_2', 'col', 1, { school: pick(r, pool).name }); },
    tag: 'Friday night',
    title: (L) => times(L, 'rival_school') > 1 ? 'The crosstown rival, again' : 'Friday night against the crosstown rival',
    text: () => 'Sold out by Tuesday. Their star is {prepstar}, and every scout in the state is coming.',
    options: [
      { label: 'Guarantee a win', hint: 'Put it on record', run: (L, r) => { bump(L, { fame: 5 }); if (ok(r, 0.35 + (ovrOf(L) - 40) * 0.02)) { bump(L, { morale: 8, win: 0.5 }); L.am.rstock = (L.am.rstock || 0) + 0.5; return 'You back it up. Thirty-four, and the student section storms the court.'; } bump(L, { morale: -7 }); return 'They win. They play your quote over the speakers on the way out.'; } },
      { label: 'Let your game talk', hint: 'No headlines', run: (L, r) => { if (ok(r, 0.55)) { bump(L, { morale: 5, win: 0.3 }); return "A quiet twenty-six and a win. That's how you like it."; } bump(L, { morale: -3 }); return "A close loss. There's always next year."; } },
      { label: 'Lock up their star', hint: 'Do the dirty work', run: (L) => { bump(L, { def: 1, trust: 4, win: 0.3 }); return '{prepstar} goes four for nineteen. The scouts noticed who was guarding him.'; } },
    ],
  },
  double_team: {
    phases: ['hs', 'col'], when: (L) => L.season && L.season.role && L.season.role.label === 'Go-to player', weight: () => 3,
    tag: 'The film room',
    title: 'Every team sends two at you now',
    text: () => 'Box-and-one, triangle-and-two. Some teams just foul you. {coach} asks how you want to handle it.',
    options: [
      { label: 'Find the open man', hint: 'Trust your teammates', run: (L) => { bump(L, { pla: 2, win: 0.4, usage: -0.01 }); return 'Your teammates start hitting shots. The double teams stop coming.'; } },
      { label: 'Score through it', hint: 'Prove a point', run: (L, r) => { if (ok(r, 0.5)) { bump(L, { fin: 1, fame: 4 }); return 'Forty against a box-and-one. They stop trying it.'; } bump(L, { morale: -4, health: -3 }); return 'You force it. A lot of bad shots, and your legs feel every one.'; } },
      { label: 'Ask {coach} for new sets', hint: 'Keep moving', run: (L) => { bump(L, { iq: 2, trust: 3 }); return "You run off screens now. It's harder to double a moving target."; } },
    ],
  },
  prep_transfer: {
    phases: ['hs_sum'], once: true, when: (L) => L.am && L.am.grade <= 11 && L.am.rank <= 220, weight: () => 4,
    tag: 'Kitchen table',
    title: 'A national prep academy wants you',
    text: () => "Better players, a national schedule, every game streamed. You'd have to leave home.",
    options: [
      { label: 'Transfer to the academy', hint: 'Chase the spotlight', run: (L) => { L.am.hs = { name: L.am.town + ' Prep Academy', net: 4.5, c1: '#111111', c2: '#f2c14e' }; if (L.season) L.season.school = L.am.hs.name; logIt(L, 'Transferred to ' + L.am.hs.name + '.', 'gold'); bump(L, { fame: 6, morale: -6, trust: -10 }); L.am.rstock = (L.am.rstock || 0) + 0.6; return 'New school, new teammates, and scouts from every corner of the country.'; } },
      { label: 'Stay home', hint: 'Your town, your team', run: (L) => { bump(L, { morale: 6, trust: 6 }); return 'You stay. They paint your number on the gym wall.'; } },
    ],
  },
  growth: {
    phases: ['hs_sum'], once: true, when: (L) => L.am && L.age <= 16, weight: () => 2.5,
    tag: 'Summer',
    title: "You've grown two inches since spring",
    text: () => "None of your shoes fit, and your coordination's a week behind your body. How do you play now?",
    options: [
      { label: 'Learn to play bigger', hint: 'New tools inside', run: (L) => { bump(L, { reb: 3, fin: 2, def: 1, pot: 1 }); return 'Post moves and boxing out. A whole new game opens up.'; } },
      { label: 'Keep your guard skills', hint: 'Be a mismatch', run: (L) => { bump(L, { pla: 2, sho: 1, ath: 1, pot: 1 }); return 'A big who can handle it. Scouts love a mismatch.'; } },
    ],
  },
  camp_invite: {
    phases: ['hs_sum'], when: (L) => L.am && L.am.rank <= 120, weight: () => 3,
    tag: 'Elite camp',
    title: "You're invited to the top-hundred camp",
    text: () => 'Four days, and every college coach in the country in the bleachers. How do you play it?',
    options: [
      { label: 'Compete with everyone', hint: 'Go win the week', run: (L, r) => { bump(L, { health: -4 }); if (ok(r, 0.35 + (ovrOf(L) - 42) * 0.025)) { L.am.rstock = (L.am.rstock || 0) + 1.2; bump(L, { fame: 5 }); return 'Camp MVP. Your ranking jumps by the weekend.'; } L.am.rstock = (L.am.rstock || 0) - 0.4; return 'A rough week. {colcoach2}, who was recruiting you, saw every minute.'; } },
      { label: 'Go to learn', hint: 'Notebook in hand', run: (L) => { bump(L, { iq: 2, def: 1 }); return 'You leave with a notebook full of things to fix.'; } },
      { label: 'Skip it and rest', hint: 'Save your legs', run: (L) => { bump(L, { health: 6 }); return 'Fresh legs for the season. Camp goes on without you.'; } },
    ],
  },
  street_agent: {
    phases: ['hs_off', 'hs_sum'], once: true, when: (L) => L.am && L.am.rank <= 100, weight: () => 2.5,
    tag: 'The parking lot',
    title: 'A man in a nice car wants to help',
    text: () => "He says his name's {streetagent}, a friend of a friend. He's holding an envelope.",
    options: [
      { label: 'Tell him no', hint: 'Keep it clean', run: (L) => { bump(L, { morale: 2, trust: 2 }); return 'He leaves a card. You throw it out.'; } },
      { label: 'Take the envelope', hint: 'Your family needs it', run: (L) => { bump(L, { cash: 0.02, morale: 3 }); L.am.envelope = true; return 'Your family needs it. Nobody has to know. Right?'; } },
      { label: 'Tell {coach}', hint: 'Let him handle it', run: (L) => { bump(L, { trust: 6 }); return '{coach} makes a call. The car never comes back.'; } },
    ],
  },
  homecoming: {
    phases: ['hs'], when: () => true, weight: () => 1.5,
    tag: 'The hallway',
    title: 'Winter formal, the night before the rivalry game',
    text: () => 'Your friends are going. So is {crush}. Tip-off comes less than a day after the last song.',
    options: [
      { label: 'Go to the dance', hint: 'You only get one', run: (L, r) => { bump(L, { morale: 8 }); if (ok(r, 0.6)) return 'Best night of the year, and you still play well.'; bump(L, { health: -4, perf: -0.3 }); return 'Great night. Slow legs the next day.'; } },
      { label: 'Stay home and rest', hint: 'Business first', run: (L) => { bump(L, { morale: -3, health: 3 }); return 'You rest up. You hear about the dance all week.'; } },
    ],
  },
  class_skip: {
    phases: ['col'], when: () => true, weight: () => 2,
    tag: 'Campus',
    title: "You've missed three straight classes",
    text: () => 'Professor {prof:last} just emailed the athletic department about it.',
    options: [
      { label: 'Go to office hours', hint: 'Face it', run: (L) => { bump(L, { iq: 1, trust: 2 }); return "Turns out she's a big fan. You're fine."; } },
      { label: 'Get notes from {mate}', hint: 'Call in a favor', run: (L) => { bump(L, { morale: 1 }); return '{mate} has perfect notes. You owe him one.'; } },
      { label: 'Ignore it', hint: 'Hope it passes', run: (L, r) => { if (ok(r, 0.55)) return 'Nothing happens. You forget all about it.'; bump(L, { rest: 0.1, trust: -6 }); return "You're held out of two games. That one stings."; } },
    ],
  },
  freshman_wall: {
    phases: ['col'], when: (L) => L.am && L.am.cyear === 1, weight: () => 3,
    tag: 'Practice',
    title: 'You hit the freshman wall',
    text: (L) => (L.season ? L.season.g : 30) + ' games in, your legs are gone. College practice is harder than high school games ever were.',
    options: [
      { label: 'Add extra lifting', hint: 'Hurt now, help later', run: (L) => { bump(L, { ath: 1, reb: 1, health: -4 }); return 'Sore for a week. Stronger by March.'; } },
      { label: 'Sleep and eat more', hint: 'Rest is training', run: (L) => { bump(L, { health: 8, perf: 0.3 }); return 'Nine hours a night. You feel human again.'; } },
      { label: 'Push through it', hint: 'Grit it out', run: (L, r) => { if (ok(r, 0.5)) { bump(L, { eth: 4 }); return 'You find a second wind somewhere.'; } bump(L, { health: -6, perf: -0.4 }); return 'It catches up with you in February.'; } },
    ],
  },
  nba_scouts: {
    phases: ['col'], when: (L) => L.am && L.am.stock > -2, weight: () => 2.5,
    tag: 'Practice',
    title: 'NBA scouts at practice, {scout} among them',
    text: () => 'Twelve of them, in the corner with notebooks. Everybody knows who they came to see.',
    options: [
      { label: 'Show them everything', hint: 'Steal the show', run: (L, r) => { if (ok(r, 0.5)) { L.am.stock = (L.am.stock || 0) + 0.8; return 'Your best practice of the year. Phones come out in the corner.'; } L.am.stock = (L.am.stock || 0) - 0.4; bump(L, { trust: -3 }); return 'You force it and {coach} yells. The scouts write that down too.'; } },
      { label: 'Play your role', hint: "Fit, don't flash", run: (L) => { bump(L, { trust: 4 }); L.am.stock = (L.am.stock || 0) + 0.3; return 'Scouts like a guy who fits. They make a note.'; } },
    ],
  },
  rivalry_col: {
    phases: ['col'], when: () => true, weight: () => 2,
    tag: 'Rivalry week',
    title: 'Rivalry week, on national TV',
    text: () => "The student section's been camping out since Monday. How are you playing this one?",
    options: [
      { label: 'Take over the game', hint: 'Your stage', run: (L, r) => { if (ok(r, 0.3 + (ovrOf(L) - 50) * 0.025)) { bump(L, { fame: 8, win: 0.3 }); L.am.stock = (L.am.stock || 0) + 0.6; return 'Thirty-one on national TV. The student section chants your name.'; } bump(L, { morale: -5 }); return 'They key on you all night. A loss.'; } },
      { label: 'Run the offense', hint: 'Team first', run: (L) => { bump(L, { win: 0.4, trust: 3 }); return 'A team win. {coach} mentions you first afterward.'; } },
      { label: 'Talk trash before it', hint: 'Then back it up', run: (L, r) => { bump(L, { fame: 5 }); if (ok(r, 0.5)) return 'You back it up. The clip runs all week.'; bump(L, { morale: -4, trust: -3 }); return 'They bring it up every time you touch the ball.'; } },
    ],
  },
  booster: {
    phases: ['col', 'col_pre'], once: true, when: (L) => L.am && L.am.level === 'col', weight: () => 1.8,
    tag: 'The parking lot',
    title: 'A booster wants to give you a car',
    text: () => "His name's {booster}. It's off the books, and he swears everybody does it.",
    options: [
      { label: 'Take the keys', hint: 'Hope nobody asks', run: (L, r) => { if (ok(r, 0.6)) { bump(L, { morale: 6 }); return 'Nice car. Nobody asks.'; } bump(L, { rest: 0.25, fame: 3, trust: -8 }); L.am.stock = (L.am.stock || 0) - 0.6; return 'Somebody asks. You sit out a third of the season.'; } },
      { label: 'Ask for a legal NIL deal', hint: 'Same money, clean', run: (L) => { bump(L, { cash: 0.08, morale: 2 }); return 'He sets one up. Same money, no problems.'; } },
      { label: 'Turn it down', hint: 'Ride the bus', run: (L) => { bump(L, { trust: 3 }); return "You keep riding the bus. It's fine."; } },
    ],
  },
  nil_deal: {
    phases: ['col_pre'], when: (L) => L.am && L.am.level === 'col' && L.m.fame >= 15, weight: () => 4,
    tag: 'The athletic office',
    title: 'An NIL collective wants a word',
    text: (L) => "They'll pay " + money(round1(0.05 + Math.pow(L.m.fame, 1.4) * 0.002)) + ' for the season. Appearances, posts and a billboard.',
    options: [
      { label: 'Sign the deal', hint: 'Big money, big face', run: (L) => { const c = round1(0.05 + Math.pow(L.m.fame, 1.4) * 0.002); bump(L, { cash: c, fame: 3, trust: -2 }); L.earned = round1(L.earned + c); return 'Your face is on a billboard by the highway.'; } },
      { label: 'Local businesses only', hint: 'Keep it hometown', run: (L) => { const c = round1(0.02 + L.m.fame * 0.0008); bump(L, { cash: c, morale: 3 }); L.earned = round1(L.earned + c); return 'A pizza place and a car wash. The town loves it.'; } },
      { label: 'Focus on basketball', hint: 'Leave the money', run: (L) => { bump(L, { trust: 4, iq: 1 }); return 'You leave the money on the table. {coach} notices.'; } },
    ],
  },
  roommate: {
    phases: ['col_pre'], once: true, when: (L) => L.am && L.am.cyear === 1, weight: () => 4,
    tag: 'The dorm',
    title: 'Meet your roommate, {roommate}',
    text: () => "He's a walk-on from a farm town. He's never been on a plane, and he wakes up at five.",
    options: [
      { label: 'Start waking up at five too', hint: 'Match his work', run: (L) => { bump(L, { eth: 6, health: -2 }); return 'He becomes your rebounder at six every morning.'; } },
      { label: 'Show him the city', hint: 'Make a friend', run: (L) => { bump(L, { morale: 6, trust: 2 }); return "Best friends by October. He's in your corner for good."; } },
      { label: 'Ask for a single room', hint: 'Keep to yourself', run: (L) => { bump(L, { morale: 1, trust: -2 }); return "It's quiet. It's lonely."; } },
    ],
  },
  /* He really goes: the worst club in the league fires its coach and hires
     him, so he is on an NBA bench for as long as the carousel keeps him. */
  coach_leaves: {
    phases: ['col_off'], once: true, when: (L) => L.am && L.am.cyear <= 3 && !!L.am.college, weight: () => 2,
    queue: (L) => {
      const club = CLUBS.slice().sort((a, b) => clubNet(L, a) - clubNet(L, b))[0];
      const name = myCoach(L);
      fire(L, club, 0);
      hire(L, club, { n: name, b: L.year - 48, real: 0 }, false).since = L.year + 1;
      L.flags.leave = { club, n: name };
      L.am.cv = (L.am.cv || 0) + 1;
    },
    tag: 'Your phone',
    title: '{oldcoach} takes the {leaveclub} job',
    text: () => 'He calls before the news breaks. He wants you to hear it from him first.',
    options: [
      { label: 'Wish him well', hint: 'Start over', run: (L) => { L.m.trust = 50; bump(L, { morale: -3 }); return '{coach} replaces him with a different system. You start from scratch.'; } },
      { label: 'Ask him to vouch for you', hint: 'With his new NBA team', run: (L) => { L.m.trust = 50; L.am.stock = (L.am.stock || 0) + 0.6; return "He says you're the best player he's coached. He means it."; } },
    ],
  },
  investigation: {
    phases: ['col'], once: true, when: (L) => !!(L.am && L.am.envelope), weight: () => 8,
    tag: "The AD's office",
    title: '{reporter} is asking about an envelope',
    text: () => 'Somebody talked. The school wants to hear it from you before the NCAA does.',
    options: [
      { label: 'Tell the truth', hint: 'Take your medicine', run: (L) => { L.am.envelope = false; bump(L, { rest: 0.2, trust: 4 }); return "You sit nine games. The story's gone in a week."; } },
      { label: 'Deny everything', hint: 'And hope', run: (L, r) => { L.am.envelope = false; if (ok(r, 0.6)) return 'It goes away. You never talk about it again.'; bump(L, { rest: 0.35, fame: 4, trust: -10 }); L.am.stock = (L.am.stock || 0) - 1; return "It doesn't go away. Half a season, and the whole country knows why."; } },
    ],
  },
  summer_league: {
    phases: ['col_off', 'hs_off'], when: () => true, weight: () => 1.5,
    tag: 'The park',
    title: 'A pro-am league wants you this summer',
    text: () => 'Outdoor court, real pros, and a thousand people hanging on the fence.',
    options: [
      { label: 'Play in it', hint: 'Test yourself', run: (L, r) => { bump(L, { health: -3 }); if (ok(r, 0.5)) { bump(L, { fame: 6, iq: 1 }); return "You drop forty in front of the whole fence. The video's everywhere."; } bump(L, { iq: 1 }); return 'The pros teach you a lesson. A useful one.'; } },
      { label: 'Rest instead', hint: 'Save your legs', run: (L) => { bump(L, { health: 5 }); return 'You watch from the fence and keep your legs fresh.'; } },
    ],
  },
};
defineEvents(EVENTS, 'nba');
defineEvents(AM_EVENTS, 'am');

/* SECOND AND THIRD TAKES. The everyday cards come back on a story career (a
   slump, a night out, a hamstring), and a card that comes back word for
   word with the same three answers reads as the game running out of things
   to say. So each one carries other takes: the same moment in the season, a
   different situation and different choices. Which take a career sees is
   seeded per career and steps on each time the card comes back, so the
   second slump is never the first slump again, and two careers start on
   different takes. A take's answer carries its own reputation (`rep`, as
   [fans, respect]) because EVENT_REP is indexed by the base card's answers. */
const TAKES = {
  night_out: [
    { tag: 'Hotel lobby', title: 'A road trip. A rapper wants you at his show.',
      text: () => 'He follows you online and sent four tickets to the hotel. Shootaround is at nine.',
      options: [
        { label: 'Go, and bring {tm}', hint: 'Make a memory', rep: [2, -1], run: (L, r) => { if (ok(r, 0.6)) { bump(L, { morale: 8, fame: 4, health: -2 }); return 'You end up on stage for one song. Shootaround hurts. Worth it.'; } bump(L, { morale: 5, fame: 3, health: -4, trust: -5 }); return 'You make shootaround with four minutes to spare. The staff noticed.'; } },
        { label: 'Give the tickets to the staff', hint: 'Buy some goodwill', rep: [0, 2], run: (L) => { bump(L, { trust: 4, morale: 1 }); return 'The equipment guys go. They talk about it for a month.'; } },
        { label: 'Room service and film', hint: 'Boring wins', rep: [0, 1], run: (L) => { bump(L, { iq: 1, health: 2 }); return 'You watch their pick and roll until midnight. You eat it alive.'; } },
      ] },
    { tag: 'Your phone', title: 'Your old friends are in town for the weekend',
      text: () => 'They drove six hours to see you play. Now they want to see the city with you.',
      options: [
        { label: 'Show them the whole city', hint: 'They came for you', rep: [2, 0], run: (L, r) => { if (ok(r, 0.6)) { bump(L, { morale: 9, health: -3 }); return 'Like high school again. You play tired and happy.'; } bump(L, { morale: 5, health: -5, trust: -4 }); return 'Too much, too late. You play like it, and it shows.'; } },
        { label: 'Dinner at your place', hint: 'Home by eleven', rep: [1, 1], run: (L) => { bump(L, { morale: 6 }); return 'You cook. It\'s terrible. Nobody cares.'; } },
        { label: 'Tickets, then bed', hint: 'Game day comes first', rep: [-1, 1], run: (L) => { bump(L, { morale: -1, health: 2 }); return 'They get great seats and a quick hug. They get it. Mostly.'; } },
      ] },
  ],
  slump: [
    { tag: 'Shooting gym', title: 'A shooting coach says he can fix you',
      text: () => 'He\'s worked with three All-Stars and wants to rebuild your release. Midseason.',
      options: [
        { label: 'Rebuild the jumper now', hint: 'Short pain, long gain', rep: [0, 1], run: (L, r) => { bump(L, { perf: -0.4 }); if (ok(r, 0.6)) { bump(L, { sho: 3 }); return 'Ugly for three weeks. Then it\'s the prettiest shot you\'ve had.'; } bump(L, { morale: -4 }); return 'Two releases now, and neither one goes in.'; } },
        { label: 'Small tweaks only', hint: 'Don\'t break it', rep: [0, 1], run: (L) => { bump(L, { sho: 1, morale: 2 }); return 'He moves your guide hand an inch. It helps more than it should.'; } },
        { label: 'Thanks, but no', hint: 'It\'ll come back', rep: [0, 0], run: (L, r) => { if (ok(r, 0.5)) { bump(L, { morale: 4 }); return 'It comes back on its own, like they always say.'; } bump(L, { morale: -5 }); return 'It doesn\'t come back. Not this season.'; } },
      ] },
    { tag: 'Barbershop', title: 'Everybody has advice about your slump',
      text: () => 'Your barber, your uncle and a guy at the gas station. They all say it\'s your legs.',
      options: [
        { label: 'Take a full day off', hint: 'Rest the legs', rep: [0, 0], run: (L) => { bump(L, { health: 5, morale: 3, perf: 0.2 }); return 'No ball for a day. Your legs come back first. The shot follows.'; } },
        { label: 'Watch every miss on film', hint: 'Find the real reason', rep: [0, 2], run: (L) => { bump(L, { iq: 2, perf: 0.3 }); return 'Your elbow is drifting. Your barber was wrong. Fixed.'; } },
        { label: 'Change your shoes', hint: 'Superstition counts', rep: [1, -1], run: (L, r) => { if (ok(r, 0.5)) { bump(L, { morale: 6, fame: 2 }); return 'Old pair from college. You go off for 30. They stay.'; } bump(L, { morale: -2 }); return 'Same bricks, different shoes.'; } },
      ] },
  ],
  hot_streak: [
    { tag: 'Locker room', title: 'You\'re cooking. {tm} wants the ball too.',
      text: (L) => streakLine(L) + ' In the huddle, {tm} says he\'s open every trip.',
      options: [
        { label: 'Keep shooting. It\'s your night.', hint: 'Ride the heat', rep: [1, -1], run: (L, r) => { if (ok(r, 0.55)) { bump(L, { fame: 6, morale: 4 }); return 'You keep shooting and they keep falling. {tm} gets over it.'; } bump(L, { trust: -4, win: -0.2 }); return 'You force two and miss both. {tm} stops talking to you.'; } },
        { label: 'Use the heat to find him', hint: 'They\'re all watching you', rep: [1, 3], run: (L) => { bump(L, { pla: 1, trust: 5, win: 0.3 }); return 'Two defenders jump at you. {tm} gets a layup and a hug.'; } },
        { label: 'Ask {coach} to draw one up', hint: 'His call, not yours', rep: [0, 2], run: (L) => { bump(L, { trust: 6 }); return '{coach} draws two plays. One for you, one for {tm}. Both work.'; } },
      ] },
    { tag: 'Postgame', title: 'Hot streak. A sneaker company calls.',
      text: (L) => streakLine(L) + ' Now a shoe company wants a signature colorway, starting tomorrow.',
      options: [
        { label: 'Wear them right away', hint: 'Strike while it\'s hot', rep: [3, -1], run: (L, r) => { if (ok(r, 0.5)) { bump(L, { fame: 7, cash: 0.3 }); return 'New shoes, same shot. The pair sells out in a day.'; } bump(L, { fame: 3, morale: -3, cash: 0.3 }); return 'New shoes, new blisters. The streak ends on the road.'; } },
        { label: 'After the season', hint: 'Don\'t touch the feet', rep: [0, 2], run: (L) => { bump(L, { morale: 2, cash: 0.1 }); return 'They wait. You keep the old pair and the streak.'; } },
        { label: 'Put your mom in the ad', hint: 'Family first', rep: [3, 1], run: (L) => { bump(L, { fame: 4, morale: 5, cash: 0.2 }); return 'Your mom steals the whole commercial. Nobody is surprised.'; } },
      ] },
  ],
  film_session: [
    { tag: 'Film room', title: 'The film says you take bad shots',
      text: () => '{coach} pulls up every contested twenty footer you took this month. There are a lot of them.',
      options: [
        { label: 'Promise better shots', hint: 'Fix the diet', rep: [0, 2], run: (L) => { bump(L, { iq: 1, perf: 0.3, trust: 4 }); return 'Fewer shots, better ones. Your efficiency jumps.'; } },
        { label: 'Say the offense stalls', hint: 'Somebody has to shoot', rep: [0, -1], run: (L, r) => { if (ok(r, 0.45)) { bump(L, { trust: 2 }); return 'He watches it again. He adds a set for the end of the clock.'; } bump(L, { trust: -7 }); return 'He doesn\'t buy it. The room gets quiet.'; } },
        { label: 'Ask for the clips', hint: 'Study it alone', rep: [0, 2], run: (L) => { bump(L, { iq: 2, eth: 3 }); return 'You watch all forty clips at home. Twice.'; } },
      ] },
    { tag: 'Film room', title: 'Film session, and you look great',
      text: () => '{coach} runs your defense on {topp} back as the example. The young guys are taking notes.',
      options: [
        { label: 'Walk them through it', hint: 'Teach the room', rep: [0, 3], run: (L) => { bump(L, { trust: 5, def: 1 }); return 'You explain every step. {trook} asks for more after practice.'; } },
        { label: 'Crack a joke and move on', hint: 'Stay humble', rep: [1, 1], run: (L) => { bump(L, { morale: 3 }); return 'The room laughs. You get praised and nobody hates you for it.'; } },
        { label: 'Ask what you did wrong', hint: 'Never satisfied', rep: [0, 2], run: (L) => { bump(L, { iq: 1, eth: 2 }); return '{coach} finds one thing. You fix it by Friday.'; } },
      ] },
  ],
  buzzer: [
    { tag: 'Last possession', title: 'Tie game. Three seconds. Inbounds play.',
      text: () => 'You\'re taking the ball out. The play is drawn up for {tco}. He\'s covered.',
      options: [
        { label: 'Throw the lob anyway', hint: 'Trust the play', rep: [0, 2], run: (L, r) => { if (ok(r, 0.45)) { bump(L, { pla: 1, trust: 4, win: 0.2 }); return 'He goes up over two. Lob, dunk, horn. Pandemonium.'; } bump(L, { win: -0.2 }); return 'Tipped away. Overtime, and you lose it.'; } },
        { label: 'Hit {tm} and get it back', hint: 'Make it yourself', rep: [1, 0], run: (L, r) => { if (ok(r, 0.45)) { bump(L, { fame: 5, morale: 5, win: 0.2 }); return 'Give and go, falling jumper, good. You end up under the pile.'; } bump(L, { morale: -3 }); return 'Your shot hits the back iron. On to overtime, and a loss.'; } },
        { label: 'Call timeout', hint: 'Reset it', rep: [0, 1], run: (L, r) => { if (ok(r, 0.5)) { bump(L, { iq: 1, trust: 3, win: 0.2 }); return 'New play. Wide open corner three. Win.'; } return 'New play, same coverage. Overtime. You lose by two.'; } },
      ] },
    { tag: 'Last possession', title: 'Down two, five seconds. You have the ball.',
      text: () => 'Their best defender is on you. The bench is already standing up.',
      options: [
        { label: 'Go for three and the win', hint: 'All or nothing', rep: [2, 0], run: (L, r) => { if (ok(r, 0.38)) { bump(L, { fame: 7, morale: 7, win: 0.3 }); return 'Off the dribble, over the top, good. You run straight to the tunnel.'; } bump(L, { morale: -4 }); return 'Short. Front rim. A long flight home.'; } },
        { label: 'Drive for the tie', hint: 'Play for overtime', rep: [0, 2], run: (L, r) => { if (ok(r, 0.55)) { bump(L, { morale: 4, win: 0.15 }); return 'Layup off the glass. You win it in overtime.'; } bump(L, { morale: -2 }); return 'Blocked at the rim. No call. No time.'; } },
        { label: 'Hunt the foul', hint: 'Make them decide', rep: [-1, 1], run: (L, r) => { if (ok(r, 0.5)) { bump(L, { iq: 1, win: 0.15 }); return 'Two shots, no time. Both good. You win in overtime.'; } bump(L, { morale: -3 }); return 'No whistle. The crowd boos you all the way to the bench.'; } },
      ] },
  ],
  injury_tweak: [
    { tag: 'Training room', title: 'Your back locks up on the team bus',
      text: () => '{trainer} gets you off the bus first and onto the table. Tip-off is in three hours.',
      options: [
        { label: 'Get loose and play', hint: 'It always loosens up', rep: [1, 1], run: (L, r) => { if (ok(r, 0.6)) { bump(L, { trust: 3 }); return 'Heat, stretching and a lot of tape. You play 30 minutes.'; } bump(L, { health: -9 }); return 'It tightens up in the second quarter. You miss two weeks.'; } },
        { label: 'Sit tonight only', hint: 'One game, not ten', rep: [0, 1], run: (L) => { bump(L, { health: 3, rest: 1 }); return 'One night in street clothes. You\'re fine by Friday.'; } },
        { label: 'Try the acupuncture guy', hint: 'Something new', rep: [1, 0], run: (L, r) => { if (ok(r, 0.6)) { bump(L, { health: 6 }); return 'Forty needles. You get off the table like a new person.'; } bump(L, { health: 1, morale: -2 }); return 'Forty needles, same back.'; } },
      ] },
    { tag: 'Training room', title: 'You rolled your ankle in the third quarter',
      text: () => 'You finished the game on it. Now it\'s the size of a softball.',
      options: [
        { label: 'Ice, tape, play tomorrow', hint: 'Tough it out', rep: [2, 1], run: (L, r) => { if (ok(r, 0.5)) { bump(L, { trust: 4 }); return 'You limp in warmups and score 18. {trainer} can\'t believe it.'; } bump(L, { health: -8 }); return 'It turns in the first half. Now it\'s three weeks.'; } },
        { label: 'Brace it for a week', hint: 'Play smart', rep: [0, 1], run: (L) => { bump(L, { health: 3, perf: -0.1 }); return 'Slower for a week, then all the way back.'; } },
        { label: 'Sit until it\'s right', hint: 'Long view', rep: [-1, 1], run: (L) => { bump(L, { health: 6, rest: 2, morale: -2 }); return 'Two weeks on the bench. It never bothers you again.'; } },
      ] },
  ],
  ref_heat: [
    { tag: 'Free throw line', title: '{ref} just gave you a technical',
      text: () => 'You said one word, quietly, walking away. The crowd heard the whistle. Next one, you\'re gone.',
      options: [
        { label: 'Ask him what you said', hint: 'Politely. Really politely.', rep: [0, 1], run: (L, r) => { if (ok(r, 0.5)) { bump(L, { trust: 2 }); return 'He tells you. It was a bad word. You both nod.'; } bump(L, { morale: -2 }); return 'He walks away. You keep your mouth shut.'; } },
        { label: 'Use it as fuel', hint: 'Channel it', rep: [2, 0], run: (L, r) => { if (ok(r, 0.55)) { bump(L, { fame: 3, morale: 4, win: 0.2 }); return 'Twelve straight points. You stare at nobody in particular.'; } bump(L, { trust: -4 }); return 'Too much fuel. You force everything and sit the fourth.'; } },
        { label: 'Let {tvet} talk to him', hint: 'Let the vet handle it', rep: [0, 2], run: (L) => { bump(L, { trust: 3 }); return '{tvet} and {ref} go back years. Somehow, the calls even out.'; } },
      ] },
    { tag: 'Locker room', title: 'The league fined you for criticizing refs',
      text: () => 'Twenty-five thousand dollars for one honest sentence after the game. The league office wants to talk.',
      options: [
        { label: 'Pay it and apologize', hint: 'Keep the peace', rep: [-1, 2], run: (L) => { bump(L, { cash: -0.03, trust: 2 }); return 'Check, statement, done. It\'s gone by tomorrow.'; } },
        { label: 'Say it again', hint: 'Double down', rep: [3, -2], watch: 'hot', run: (L) => { bump(L, { cash: -0.05, fame: 5, trust: -4 }); return 'Fifty thousand this time. Every player in the league likes your post.'; } },
        { label: 'Donate the same amount', hint: 'Make it a story', rep: [3, 2], run: (L) => { bump(L, { cash: -0.06, fame: 4, morale: 3 }); return 'You match the fine for a youth league. The story flips.'; } },
      ] },
  ],
  playoff_eve: [
    { tag: 'Practice', title: 'The playoffs start Saturday. {coach} has a plan.',
      text: () => 'He wants to shrink the rotation to eight. You\'re one of the eight. {tm2} isn\'t.',
      options: [
        { label: 'Back {coach}', hint: 'Win now', rep: [0, 2], run: (L) => { bump(L, { min: 2, trust: 5 }); return 'More minutes for you. {tm2} takes it like a pro.'; } },
        { label: 'Speak up for {tm2}', hint: 'Loyalty', rep: [1, 2], run: (L, r) => { if (ok(r, 0.4)) { bump(L, { trust: 2, win: 0.2 }); return '{coach} keeps him in. He hits a big shot in Game 2.'; } bump(L, { trust: -3 }); return '{coach} thanks you and doesn\'t change a thing.'; } },
        { label: 'Just get your legs ready', hint: 'Not your call', rep: [0, 1], run: (L) => { bump(L, { health: 4 }); return 'Ice baths and sleep. You feel twenty again.'; } },
      ] },
    { tag: 'Your home', title: 'Playoff tickets. Everybody wants them.',
      text: () => 'Forty texts by noon. Your family, friends from home and people you haven\'t heard from in years.',
      options: [
        { label: 'Buy a whole section', hint: 'Everybody comes', rep: [3, 0], watch: 'spend', run: (L) => { bump(L, { cash: -0.1, morale: 6 }); return 'Thirty people in your colors behind the bench. Worth it.'; } },
        { label: 'Family only', hint: 'Keep it tight', rep: [0, 1], run: (L) => { bump(L, { morale: 3 }); return 'Six seats. You see your mom before every free throw.'; } },
        { label: 'Turn the phone off', hint: 'Lock in', rep: [-1, 2], run: (L) => { bump(L, { morale: -1, perf: 0.2 }); return 'Phone in a drawer until the series is done.'; } },
      ] },
  ],
  exit_interview: [
    { tag: 'GM\'s office', title: 'Exit interview. {gm} has a question.',
      text: () => '"If you could change one thing about this roster," he says, "what is it?" He waits.',
      options: [
        { label: 'Get me a real point guard', hint: 'Name the need', rep: [0, 2], run: (L) => { bump(L, { trust: 2 }); return 'He writes it down. You see a point guard rumor by June.'; } },
        { label: 'Nothing. We\'re close.', hint: 'Keep the group', rep: [1, 1], run: (L) => { bump(L, { morale: 3 }); return 'He smiles. You both know close isn\'t a plan.'; } },
        { label: 'Ask what he\'d change', hint: 'Turn it around', rep: [0, 1], run: (L) => { bump(L, { iq: 1 }); return 'He says your defense. That\'s your summer.'; } },
      ] },
    { tag: 'Practice gym', title: 'Last day of the season. Clean out your locker.',
      text: () => 'Cameras by the door, a trash bag for your stuff, and the coaching staff wants five minutes.',
      options: [
        { label: 'Ask for a summer plan', hint: 'Give me homework', rep: [0, 2], run: (L) => { bump(L, { eth: 4, trust: 4 }); return 'They give you a list. You start it Monday.'; } },
        { label: 'Talk to the cameras', hint: 'Say goodbye to the fans', rep: [3, 0], run: (L) => { bump(L, { fame: 4 }); return 'Two minutes about next year. The city liked it.'; } },
        { label: 'Out the back door', hint: 'Season\'s over', rep: [-1, 0], run: (L) => { bump(L, { morale: 2 }); return 'You\'re on a beach by Thursday.'; } },
      ] },
  ],
  meet_someone: [
    { tag: 'Coffee shop', title: 'The barista wrote something on your cup',
      text: () => 'It\'s not your name. It\'s a phone number and "nice game last season." {partner:first}, it says.',
      options: [
        { label: 'Text them tonight', hint: 'Why not', rep: [0, 0], run: (L, r) => { if (ok(r, 0.7)) { const f = lifeOf(L); f.rel = 'dating'; f.since = L.year; bump(L, { morale: 8 }); logIt(L, 'Met {partner}.', 'good'); relate(L, 'partner', 30, 'A number on a coffee cup.'); return 'Dinner Friday. Then dinner Sunday. You\'re seeing somebody.'; } bump(L, { morale: -2 }); lifeOf(L).pn = (lifeOf(L).pn || 0) + 1; return 'Two texts, then nothing. It happens.'; } },
        { label: 'Leave a big tip', hint: 'Stay mysterious', rep: [0, 0], run: (L) => { bump(L, { morale: 2 }); return 'You leave fifty dollars and a smile. Maybe next time.'; } },
      ] },
    { tag: 'Charity event', title: 'You get seated next to somebody funny',
      text: () => '{partner:first} runs the youth program you\'re here for. They roast your free throws all night.',
      options: [
        { label: 'Ask them to dinner', hint: 'Take your shot', rep: [0, 0], run: (L, r) => { if (ok(r, 0.7)) { const f = lifeOf(L); f.rel = 'dating'; f.since = L.year; bump(L, { morale: 8 }); logIt(L, 'Met {partner}.', 'good'); relate(L, 'partner', 30, 'Roasted your free throws.'); return 'They say yes, then roast your restaurant choice. You\'re in trouble.'; } bump(L, { morale: -2 }); lifeOf(L).pn = (lifeOf(L).pn || 0) + 1; return 'They\'re seeing somebody. They still roast you on the way out.'; } },
        { label: 'Volunteer at the program', hint: 'Show up first', rep: [2, 2], run: (L) => { bump(L, { morale: 4, fame: 1 }); return 'You run a Saturday clinic. You see them there. Slow and steady.'; } },
      ] },
  ],
  family_money: [
    { tag: 'Your phone', title: 'Your uncle wants you to co-sign a loan',
      text: () => 'A food truck. He has a menu, a truck picked out and your signature on a line.',
      options: [
        { label: 'Sign it', hint: 'Family is family', rep: [1, 0], run: (L, r) => { if (ok(r, 0.5)) { bump(L, { morale: 5 }); return 'The truck does fine. The brisket is great.'; } bump(L, { cash: -0.3, morale: -4 }); return 'The truck closes in eight months. You pay the loan.'; } },
        { label: 'Buy him the truck outright', hint: 'No strings', rep: [2, 0], watch: 'spend', run: (L) => { bump(L, { cash: -0.15, morale: 4 }); return 'He names a sandwich after you. It\'s too spicy.'; } },
        { label: 'Send him to your money guy', hint: 'Make it business', rep: [0, 2], run: (L) => { bump(L, { cash: 0.02 }); L.flags.savvy = true; return 'Your advisor finds him a small business loan. No signature needed.'; } },
      ] },
    { tag: 'Mom\'s house', title: '{mom:first} wants to retire. Can you help?',
      text: () => 'She\'s worked the same job for twenty-two years. She\'d never ask. Your aunt told you.',
      options: [
        { label: 'Retire her this week', hint: 'You promised once', rep: [3, 2], watch: 'spend', run: (L) => { bump(L, { cash: -0.4, morale: 10 }); logIt(L, 'Retired your mom.', 'good'); return 'You tell her at dinner. She cries. You cry. Your aunt films it.'; } },
        { label: 'Set up a monthly check', hint: 'Steady, not sudden', rep: [1, 2], run: (L) => { bump(L, { cash: -0.2, morale: 6 }); return 'She keeps working two days a week. She says it\'s for the gossip.'; } },
        { label: 'After the next contract', hint: 'Not yet', rep: [-1, 0], run: (L) => { bump(L, { morale: -3 }); return 'She says it\'s fine. You hear that it isn\'t.'; } },
      ] },
  ],
  teammate_touches: [
    { tag: 'Team bus', title: '{tco} is unhappy, and it\'s getting loud',
      text: () => 'He told {beat} the offense runs through one guy. That guy is you.',
      options: [
        { label: 'Call him out in the room', hint: 'Settle it now', rep: [-1, 1], watch: 'hot', run: (L, r) => { if (ok(r, 0.45)) { bump(L, { trust: 4, win: 0.3 }); return 'Loud meeting. Better practice. You both play harder.'; } bump(L, { morale: -5, win: -0.4 }); return 'It gets worse. The room splits down the middle.'; } },
        { label: 'Set him up early tonight', hint: 'Get him going', rep: [1, 2], run: (L) => { bump(L, { pla: 1, win: 0.4, usage: -0.01 }); return 'Three straight looks in the first quarter. He\'s smiling by halftime.'; } },
        { label: 'Let the staff handle it', hint: 'Above your pay grade', rep: [0, 0], run: (L) => { bump(L, { trust: 2, morale: -1 }); return 'The staff handles it. Mostly.'; } },
      ] },
  ],
  stuck: [
    { tag: 'Agent\'s office', title: 'You\'re buried on the bench. {agent} has ideas.',
      text: () => 'Ten minutes a night. {agent} says he can make some calls, or you can wait it out.',
      options: [
        { label: 'Make the calls', hint: 'Find minutes elsewhere', rep: [0, -1], run: (L) => { L.flags.tradeAsk = true; bump(L, { trust: -8, morale: 3 }); return 'Your name is in trade talks by Friday. On purpose this time.'; } },
        { label: 'Stay and win practice', hint: 'Earn it here', rep: [0, 3], run: (L, r) => { bump(L, { eth: 4 }); if (ok(r, 0.5)) { bump(L, { min: 5, trust: 8 }); return 'You win every drill for three weeks. {coach} puts you in.'; } bump(L, { trust: 3 }); return 'Still waiting. But the coaches see you.'; } },
        { label: 'Become the best teammate', hint: 'Be the guy everybody likes', rep: [1, 2], run: (L) => { bump(L, { trust: 6, morale: 2 }); return 'You run the bench celebrations. You play when it counts.'; } },
      ] },
  ],
  trade_rumor: [
    { tag: 'Your phone', title: 'A reporter says you\'re available',
      text: () => 'One tweet, and now every mock trade has your name in it. {gm} hasn\'t called.',
      options: [
        { label: 'Call {gm} yourself', hint: 'Get the truth', rep: [0, 2], run: (L) => { bump(L, { trust: 4 }); return 'He says it\'s noise. He sounds like he means it.'; } },
        { label: 'Post your gym session', hint: 'Business as usual', rep: [2, 0], run: (L) => { bump(L, { fame: 3, morale: 2 }); return 'Five a.m. lift. Ten thousand likes. You never mention it.'; } },
        { label: 'Like the tweet', hint: 'Chaos', rep: [3, -3], watch: 'hot', run: (L) => { bump(L, { fame: 6, trust: -8 }); return 'You unlike it in two minutes. The screenshot lives forever.'; } },
      ] },
  ],
  coach_bench: [
    { tag: 'Coach\'s office', title: '{coach} wants to start {trook} over you',
      text: () => 'The rookie needs reps, the club needs to see him, and you\'re the one he\'d replace.',
      options: [
        { label: 'Mentor the kid', hint: 'Be the vet', rep: [1, 3], run: (L) => { bump(L, { trust: 9, min: -3 }); return 'You teach {trook} your tricks. He says thank you in every interview.'; } },
        { label: 'Win the job in practice', hint: 'Make it hard', rep: [0, 1], run: (L, r) => { if (ok(r, 0.45)) { bump(L, { trust: 2 }); return 'You go at him all week. You keep the job, for now.'; } bump(L, { min: -4, morale: -4 }); return 'He goes at you right back. He starts.'; } },
        { label: 'Ask about a trade', hint: 'See what\'s out there', rep: [0, -2], run: (L) => { L.flags.tradeAsk = true; bump(L, { trust: -10 }); return '{agent} starts dialing. {coach} looks hurt.'; } },
      ] },
  ],
  teammate_fight: [
    { tag: 'Practice', title: 'Two teammates are fighting. You\'re closest.',
      text: () => '{tm} and {tm2} are on the floor. The assistants are across the gym.',
      options: [
        { label: 'Pull them apart', hint: 'Step in', rep: [1, 3], run: (L, r) => { if (ok(r, 0.7)) { bump(L, { trust: 6 }); return 'You end it. Both of them thank you later, separately.'; } bump(L, { health: -4, trust: 4 }); return 'You end it and catch an elbow. Worth it.'; } },
        { label: 'Get {coach}', hint: 'Not your fight', rep: [0, 1], run: (L) => { bump(L, { trust: 1 }); return 'He breaks it up and runs everybody for an hour. Including you.'; } },
        { label: 'Talk to both after', hint: 'Fix the real problem', rep: [0, 2], run: (L) => { bump(L, { trust: 4, win: 0.3 }); return 'It was about a parking spot. You solve it with a calendar.'; } },
      ] },
  ],
  online_beef: [
    { tag: 'Your phone', title: 'A TV analyst says you\'re a bad defender',
      text: () => 'He made a whole segment about it, with slow-motion clips. Your mom texts: "He\'s wrong."',
      options: [
        { label: 'Invite him to practice', hint: 'Come see for yourself', rep: [2, 2], run: (L) => { bump(L, { fame: 4, def: 1 }); return 'He shows up. You lock him up in a pickup game. Great TV.'; } },
        { label: 'Lock up somebody Friday', hint: 'Show him', rep: [1, 2], run: (L, r) => { if (ok(r, 0.5)) { bump(L, { def: 1, fame: 3 }); return 'You hold {topp} to nine. The analyst gives you credit. Barely.'; } bump(L, { morale: -3 }); return '{topp} scores 31. The analyst runs it back.'; } },
        { label: 'Post a meme', hint: 'Keep it light', rep: [2, -1], run: (L) => { bump(L, { fame: 3 }); return 'The meme gets more views than his segment.'; } },
      ] },
  ],
  local_ad: [
    { tag: 'Your phone', title: 'A local pizza chain wants you in an ad',
      text: () => 'Ninety seconds, a fake mustache and a slice named after you. Real money, real embarrassing.',
      options: [
        { label: 'Wear the mustache', hint: 'Commit to the bit', rep: [3, -1], run: (L) => { bump(L, { cash: 0.12, fame: 4 }); return 'The ad runs every timeout. Kids yell your slice at you.'; } },
        { label: 'No mustache', hint: 'A little dignity', rep: [1, 0], run: (L) => { bump(L, { cash: 0.08, fame: 1 }); return 'Normal ad, normal money. Nobody remembers it.'; } },
        { label: 'Donate the fee', hint: 'Give it away', rep: [2, 1], run: (L) => { bump(L, { fame: 2, morale: 3 }); return 'Your fee pays for a youth league season. Good press too.'; } },
      ] },
  ],
  playoff_guarantee: [
    { tag: 'Locker room', title: 'Their star said they\'ll beat you in five',
      text: () => 'He said it calmly, on camera. Every reporter in your locker wants an answer.',
      options: [
        { label: 'Say it\'ll go seven', hint: 'Respectful, and sharp', rep: [1, 2], run: (L) => { bump(L, { trust: 2, morale: 2 }); return 'Nice line. It\'s on every bulletin board in the building.'; } },
        { label: 'Say four', hint: 'Sweep talk', rep: [3, -2], run: (L, r) => { if (ok(r, 0.4)) { bump(L, { fame: 6, morale: 6 }); return 'Bold. Your teammates are fired up.'; } bump(L, { fame: 4, morale: -4 }); return 'Bold. He reads it before Game 1 and smiles.'; } },
        { label: 'Laugh and walk out', hint: 'Not worth it', rep: [0, 1], run: (L) => { bump(L, { morale: 1 }); return 'The laugh becomes a gif. That works too.'; } },
      ] },
  ],
  media_day: [
    { tag: 'Media day', title: 'Media day photos. They want a pose.',
      text: () => 'The photographer has a smoke machine and a lot of ideas. You get one shot.',
      options: [
        { label: 'Arms crossed, no smile', hint: 'Classic', rep: [0, 2], run: (L) => { bump(L, { fame: 2 }); return 'You look like a superhero. Or a bouncer.'; } },
        { label: 'Something ridiculous', hint: 'Give them a moment', rep: [3, -1], run: (L) => { bump(L, { fame: 5, morale: 3 }); return 'It becomes the photo of media day. You regret nothing.'; } },
        { label: 'Pose with {trook}', hint: 'Make the rookie famous', rep: [2, 2], run: (L) => { bump(L, { trust: 3, fame: 2 }); return 'The rookie looks terrified. The internet loves it.'; } },
      ] },
  ],
  load_mgmt: [
    { tag: 'Training room', title: 'The sports science staff has your numbers',
      text: () => 'Your sprint speed is down five percent. They want to cut practice in half.',
      options: [
        { label: 'Follow the numbers', hint: 'Trust the data', rep: [-1, 1], run: (L) => { bump(L, { health: 6, rest: 2, trust: 2 }); return 'Shorter practices. You feel faster by March.'; } },
        { label: 'Practice full anyway', hint: 'Sweat is sweat', rep: [1, 0], run: (L, r) => { if (ok(r, 0.5)) { bump(L, { eth: 3 }); return 'You feel fine. The numbers even out.'; } bump(L, { health: -6 }); return 'Your legs are gone by February. The numbers were right.'; } },
        { label: 'Hire your own trainer', hint: 'Second opinion', rep: [0, 1], run: (L) => { bump(L, { cash: -0.05, health: 4 }); return 'Different plan, same answer: rest more. You listen this time.'; } },
      ] },
  ],
  charity: [
    { tag: 'Community center', title: 'A kid\'s letter reaches your locker',
      text: () => 'He\'s ten. He says he watches you every night, and his team doesn\'t have uniforms.',
      options: [
        { label: 'Buy the whole team gear', hint: 'Easy yes', rep: [2, 1], watch: 'spend', run: (L) => { bump(L, { cash: -0.02, morale: 5, fame: 2 }); return 'Twelve kids in matching shoes. They send a team photo.'; } },
        { label: 'Show up at their game', hint: 'Be there', rep: [3, 2], run: (L) => { bump(L, { morale: 7, fame: 3 }); return 'They lose by twenty. They don\'t care. You were there.'; } },
        { label: 'Write him back', hint: 'Something personal', rep: [1, 1], run: (L) => { bump(L, { morale: 3 }); return 'One page, handwritten. His mom says it\'s framed.'; } },
      ] },
  ],
  investment: [
    { tag: 'Agent\'s office', title: '{agent} found an investment for you',
      text: () => 'A stake in a minor league soccer team. "Boring," he says. "That\'s the point."',
      options: [
        { label: 'Buy in', hint: 'Slow money', rep: [0, 1], watch: 'spend', run: (L, r) => { bump(L, { cash: -0.3 }); if (ok(r, 0.7)) { bump(L, { cash: 0.5 }); return 'The team gets a new stadium. Your stake doubles.'; } return 'It stays boring. The money just sits there.'; } },
        { label: 'Buy a restaurant instead', hint: 'Something you like', rep: [2, 0], watch: 'spend', run: (L, r) => { bump(L, { cash: -0.3, fame: 2 }); if (ok(r, 0.4)) { bump(L, { cash: 0.4 }); return 'The wings are famous. You eat for free forever.'; } return 'Great food, bad lease. It closes in a year.'; } },
        { label: 'Index funds', hint: 'Set it and forget it', rep: [0, 1], run: (L) => { bump(L, { cash: 0.05 }); L.flags.savvy = true; return 'You never think about it. It grows anyway.'; } },
      ] },
  ],
  heckler: [
    { tag: 'Courtside', title: 'A fan has a sign about you',
      text: () => 'It\'s a cardboard cutout of your worst airball, life size. It\'s honestly well made.',
      options: [
        { label: 'Sign it after the game', hint: 'Win them over', rep: [3, 2], run: (L) => { bump(L, { fame: 4, morale: 3 }); return 'You sign it, "Still got paid." The fan frames it.'; } },
        { label: 'Score 30 in front of it', hint: 'Answer with buckets', rep: [2, 1], run: (L, r) => { if (ok(r, 0.5)) { bump(L, { fame: 4, morale: 4 }); return 'You point at it after every make. The fan leaves early.'; } bump(L, { morale: -3 }); return 'Two more airballs. The fan has new material.'; } },
        { label: 'Ignore it', hint: 'Eyes on the rim', rep: [0, 1], run: (L) => { bump(L, { morale: 1 }); return 'You never look. The sign gets less funny every quarter.'; } },
      ] },
  ],
  christmas: [
    { tag: 'Christmas morning', title: 'Christmas Day game. Who flies in?',
      text: () => 'You play at noon. The whole family wants to come, and you have one hotel room left.',
      options: [
        { label: 'Fly in everybody', hint: 'Book the floor', rep: [2, 0], run: (L) => { bump(L, { cash: -0.05, morale: 8 }); return 'Twelve people, one giant breakfast. You play your best game of the year.'; } },
        { label: 'Just your parents', hint: 'Keep it calm', rep: [0, 1], run: (L) => { bump(L, { morale: 5 }); return 'Quiet morning, loud afternoon. Your dad cheers like it\'s Game 7.'; } },
        { label: 'Video call after', hint: 'Focus first', rep: [-1, 1], run: (L) => { bump(L, { perf: 0.2, morale: -2 }); return 'You play well. Opening presents on a laptop is not the same.'; } },
      ] },
  ],
  contract_year: [
    { tag: 'Agent\'s office', title: 'Contract year. {agent} has a number.',
      text: () => 'He thinks a great season is worth twice what you make. A bad one is worth half.',
      options: [
        { label: 'Don\'t tell me numbers', hint: 'Just play', rep: [0, 2], run: (L) => { bump(L, { morale: 4 }); return 'He stops talking money. You start sleeping better.'; } },
        { label: 'Put it on my mirror', hint: 'Daily motivation', rep: [1, -1], run: (L) => { bump(L, { eth: 4, usage: 0.02, morale: -2 }); return 'You see the number every morning. You shoot more. You stress more.'; } },
        { label: 'Talk extension now', hint: 'Lock in security', rep: [0, 1], run: (L, r) => { if (ok(r, 0.4)) { bump(L, { morale: 5 }); return 'The front office is interested. They\'ll talk in the summer.'; } bump(L, { morale: -3 }); return 'They\'d rather wait. So now you wait too.'; } },
      ] },
  ],
  grades: [
    { tag: 'Library', title: 'A big exam lands on tournament week',
      text: () => 'Chemistry final Thursday. Road game Friday. {coach} says grades come first, and means it.',
      options: [
        { label: 'Study on the bus', hint: 'Do both', rep: [0, 2], run: (L, r) => { if (ok(r, 0.6)) { bump(L, { iq: 1, eth: 2 }); return 'B-plus and twenty points. Same week.'; } bump(L, { morale: -3 }); return 'C-minus. You\'re still eligible. Barely.'; } },
        { label: 'Ask for a makeup exam', hint: 'Work the system', rep: [0, 0], run: (L, r) => { if (ok(r, 0.5)) { bump(L, { morale: 2 }); return 'The professor says yes. You take it Monday.'; } bump(L, { trust: -3 }); return 'The professor says no, and tells the athletic department.'; } },
        { label: 'Skip the game to study', hint: 'Grades first', rep: [0, 2], run: (L) => { bump(L, { iq: 1, trust: 3, morale: -2 }); return 'You miss the game. You ace the test. Your mom is thrilled.'; } },
      ] },
  ],
  rival_school: [
    { tag: 'The gym', title: 'Rivalry night. Their fans made shirts about you.',
      text: () => 'Your face, a crown and the word "overrated." Half their student section is wearing one.',
      options: [
        { label: 'Wear one in warmups', hint: 'Steal the joke', rep: [3, 0], run: (L) => { bump(L, { fame: 4, morale: 4 }); return 'Even their students laugh. Then you drop 28.'; } },
        { label: 'Play angry', hint: 'Make them pay', rep: [1, 1], run: (L, r) => { if (ok(r, 0.55)) { bump(L, { fame: 3, morale: 5 }); return 'Thirty points and a quiet student section.'; } bump(L, { morale: -4 }); return 'You press. Six for twenty. The shirts were right tonight.'; } },
        { label: 'Lock up {prepstar}', hint: 'Win the matchup', rep: [0, 2], run: (L) => { bump(L, { def: 1, trust: 3 }); return 'Nine points on fifteen shots. The scouts write that down.'; } },
      ] },
  ],
  nba_scouts: [
    { tag: 'Practice gym', title: 'An NBA scout wants five minutes',
      text: () => '{scout} catches you after practice. "Off the record. Tell me what you\'re working on."',
      options: [
        { label: 'Tell him the truth', hint: 'Show self-awareness', rep: [0, 2], run: (L) => { bump(L, { iq: 1, trust: 3 }); return 'He nods and writes "coachable." That word matters.'; } },
        { label: 'Say you have no weaknesses', hint: 'Confidence', rep: [2, -1], run: (L, r) => { if (ok(r, 0.4)) { bump(L, { fame: 3 }); return 'He laughs. He likes the confidence.'; } bump(L, { trust: -2 }); return 'He writes something down and doesn\'t say what.'; } },
        { label: 'Ask what they need', hint: 'Interview him back', rep: [0, 2], run: (L) => { bump(L, { iq: 2 }); return 'He says shooting. You know what you\'re doing this summer.'; } },
      ] },
  ],
  nil_deal: [
    { tag: 'Your phone', title: 'A car company wants you in an NIL ad',
      text: () => 'A free car for a year and two posts a month. Your teammates walk to class.',
      options: [
        { label: 'Take it, drive the guys', hint: 'Share the ride', rep: [2, 1], run: (L) => { bump(L, { cash: 0.05, trust: 3, fame: 2 }); return 'You become the team taxi. Everybody likes you more.'; } },
        { label: 'Take the cash instead', hint: 'Money, not a car', rep: [0, 0], run: (L) => { bump(L, { cash: 0.08 }); return 'They pay you instead. You buy your mom a dishwasher.'; } },
        { label: 'Pass on it', hint: 'Keep it simple', rep: [0, 1], run: (L) => { bump(L, { morale: 1 }); return 'You keep walking. It\'s good for your legs anyway.'; } },
      ] },
  ],
};

/* Hang each take on its card. A take for a card that does not exist is a
   typo, and it throws here rather than going quiet. */
for (const id in TAKES) { const ev = EVENTS[id] || AM_EVENTS[id]; if (!ev) throw new Error('take for unknown event ' + id); ev.takes = TAKES[id]; }

/* THE ARCS. Each node is dealt by dueArcs() in its own slot, never at random,
   and each run() moves the arc on (arcGo) or settles it (arcEnd). Setups live
   in EVENTS and AM_EVENTS; only what follows a setup is here. */
const ARC_EVENTS = {
  /* The feud: a podcast insult, a bump at the scorer's table, a rematch. */
  arc_feud_2: {
    phases: ['early'], stage: 'nba', req: { team: true },
    tag: 'Tip-off',
    title: 'Round two with {foe}',
    text: () => "December, his building. He bumps you at the scorer's table before tip. What's the move?",
    options: [
      { label: 'Bump him back', hint: 'Give it right back', run: (L, r) => { arcGo(L, 'feud', 'arc_feud_3', 'mid', 0); if (ok(r, 0.5)) { bump(L, { fame: 4, morale: 3 }); return 'Double technical. The crowd loves it, and so do you.'; } bump(L, { fame: 3, cash: -0.05, trust: -3 }); return 'Only you get the technical. He waves goodbye.'; } },
      { label: 'Smile and guard him', hint: 'Let defense talk', run: (L) => { arcGo(L, 'feud', 'arc_feud_3', 'mid', 0); bump(L, { def: 1, trust: 3 }); return 'He takes nine shots in the first half. He makes two.'; } },
      { label: 'Offer a handshake', hint: 'Bury it', run: (L) => { arcEnd(L, 'feud', 'peace'); relate(L, 'foe', 40, 'You shook hands before tip.'); bump(L, { trust: 2 }); return 'He looks at it for a long second. Then he takes it.'; } },
    ],
  },
  arc_feud_3: {
    phases: ['mid'], stage: 'nba', req: { team: true },
    tag: 'National TV',
    title: 'You and {foe}, on national TV',
    text: () => 'February, a sold-out building. {beat} is calling it the game of the month.',
    options: [
      { label: 'Take him yourself', hint: 'Make it personal', run: (L, r) => { if (ok(r, 0.4 + (ovrOf(L) - 72) * 0.03)) { arcEnd(L, 'feud', 'won'); relate(L, 'foe', -10, 'You beat him in the national game.'); bump(L, { fame: 8, morale: 6 }); return 'You win the duel and the game. He leaves without talking.'; } arcEnd(L, 'feud', 'lost'); relate(L, 'foe', -10, 'He beat you in the national game.'); bump(L, { morale: -6 }); return 'He gets you. He talks about it for a week.'; } },
      { label: 'Win the game, not the duel', hint: 'Bigger picture', run: (L) => { arcEnd(L, 'feud', 'respect'); relate(L, 'foe', 20, 'You won the game he made personal.'); bump(L, { win: 0.4, trust: 4 }); return 'A team win. He says something kind after. Nobody expected that.'; } },
    ],
  },
  /* The gym: the gym you paid for opens, and years later a kid from it signs
     with a college. */
  arc_gym_2: {
    phases: ['off'], stage: 'nba',
    tag: 'Your old gym',
    title: "Your gym's ready to open",
    text: () => 'Your old high school paints your number at center court. Kids from your camp are already there.',
    options: [
      { label: 'Cut the ribbon', hint: 'Soak it in', run: (L) => { arcGo(L, 'gym', 'arc_gym_3', 'off', 5); bump(L, { fame: 3, morale: 6 }); return 'Photos, a speech and a lot of hugs.'; } },
      { label: 'Run the first practice', hint: 'Get your hands dirty', run: (L) => { arcGo(L, 'gym', 'arc_gym_3', 'off', 5); arcData(L, 'gym').coached = true; bump(L, { morale: 8 }); return "Two hours of drills. One twelve-year-old doesn't miss."; } },
    ],
  },
  arc_gym_3: {
    phases: ['off'], stage: 'nba',
    tag: 'Your phone',
    title: '{campkid} signs with a college',
    text: (L) => 'He was twelve at your gym opening.' + (arcData(L, 'gym').coached ? ' He made every drill.' : '') + " Now he's tagged you in the post.",
    options: [
      { label: 'Call him', hint: 'Make his day', run: (L) => { arcEnd(L, 'gym', 'mentor'); relate(L, 'campkid', 40, 'You called the day he signed.'); bump(L, { morale: 8 }); return "He can't talk. He just laughs. You know the feeling."; } },
      { label: 'Send him a box of shoes', hint: 'A little gift', run: (L) => { arcEnd(L, 'gym', 'fan'); relate(L, 'campkid', 20, 'You sent him shoes.'); bump(L, { fame: 2, morale: 3 }); return 'He wears them in his first game. Size fourteen.'; } },
    ],
  },
  /* The venture: the money went in last summer; now the business has a year
     of numbers. Whether it works was settled when it opened. */
  arc_venture_2: {
    phases: ['off'], stage: 'nba',
    tag: 'The books',
    title: "A year of numbers on {friend}'s business",
    text: (L) => arcData(L, 'venture').good ? "It's making money, with lines on weekends. He wants to grow." : "It's losing money. He needs " + money(arcData(L, 'venture').more) + ' to keep the doors open.',
    options: [
      { label: 'Put in more money', hint: 'Double down', run: (L, r) => { const d = arcData(L, 'venture'); bump(L, { cash: -Math.min(d.more, L.cash) }); arcGo(L, 'venture', 'arc_venture_3', 'off', 1); d.in += d.more; return d.good ? 'A second location by spring.' : 'You write the check. He promises it turns around.'; } },
      { label: 'Take your money out', hint: 'Walk away', run: (L) => { const d = arcData(L, 'venture'); const back = round1(d.in * (d.good ? 1.6 : 0.4)); bump(L, { cash: back }); arcEnd(L, 'venture', d.good ? 'won' : 'out'); relate(L, 'friend', d.good ? 5 : -20, d.good ? 'You cashed out of his business.' : 'You pulled out when it was losing.'); return 'You get ' + money(back) + ' back.' + (d.good ? ' A clean win.' : ' He takes it hard.'); } },
    ],
  },
  arc_venture_3: {
    phases: ['off'], stage: 'nba',
    tag: 'Your phone',
    title: 'Two years in, the books are final',
    text: (L) => arcData(L, 'venture').boom ? '{friend} has an offer to buy the whole thing.' : "{friend} calls. It didn't make it.",
    options: [
      { label: 'Hear it out', hint: 'Let him talk', run: (L) => { const d = arcData(L, 'venture'); if (d.boom) { const back = round1(d.in * 2.6); bump(L, { cash: back, fame: 2 }); arcEnd(L, 'venture', 'won'); relate(L, 'friend', 25, 'The business sold.'); return 'They sell. Your share is ' + money(back) + '.'; } arcEnd(L, 'venture', 'lost'); relate(L, 'friend', -10, 'The business closed.'); bump(L, { morale: -6 }); return 'It closes in May. The sign stays up a while.'; } },
      { label: "Tell him you're proud of him", hint: 'Win or lose', run: (L) => { const d = arcData(L, 'venture'); relate(L, 'friend', 20, 'You stood by him.'); if (d.boom) { const back = round1(d.in * 2.2); bump(L, { cash: back, morale: 4 }); arcEnd(L, 'venture', 'won'); return 'He sells, and he cries on the phone. You get ' + money(back) + '.'; } arcEnd(L, 'venture', 'lost'); bump(L, { morale: -2 }); return "It closes. The friendship doesn't."; } },
    ],
  },
  /* The promise: what you told the GM in April, checked at camp. */
  arc_promise_2: {
    phases: ['pre'], stage: 'nba', req: { team: true },
    tag: 'Training camp',
    title: '{gm} remembers April',
    text: (L) => { const d = ovT(L, ovrOf(L)) - ovT(L, arcData(L, 'promise').ovr || ovrOf(L)); return d > 0 ? 'You came back ' + d + ' better. He says so in front of the whole staff.' : 'You promised a big summer. You came back the same player.'; },
    options: [
      { label: 'Point at the work', hint: 'Show your receipts', run: (L) => { const up = ovrOf(L) > (arcData(L, 'promise').ovr || 99); arcEnd(L, 'promise', up ? 'kept' : 'broken'); relate(L, 'gm', up ? 15 : -10, up ? 'You kept your April promise.' : 'You broke your April promise.'); bump(L, up ? { min: 3, trust: 4 } : { trust: -4 }); return up ? 'More minutes. Earned.' : "He nods. He's heard it before."; } },
      { label: 'Keep your head down', hint: 'Let the work talk', run: (L) => { const up = ovrOf(L) > (arcData(L, 'promise').ovr || 99); arcEnd(L, 'promise', up ? 'kept' : 'broken'); bump(L, { trust: up ? 6 : 1, eth: 3 }); return "You go to work. That's the answer either way."; } },
    ],
  },
  /* The mentor: the veteran who looked after you, years later. */
  arc_mentor_2: {
    phases: ['off'], stage: 'nba',
    tag: 'Your phone',
    title: '{oldvet} coaches high school now',
    text: () => 'He calls with a favor: one day at his gym, with his kids.',
    options: [
      { label: 'Go for the whole day', hint: 'Show up', run: (L) => { arcEnd(L, 'mentor', 'visit'); relate(L, 'oldvet', 30, 'You spent a day at his gym.'); bump(L, { morale: 8, fame: 1 }); return 'His kids lose their minds. He stands in the back and grins.'; } },
      { label: 'Send a video', hint: 'From the road', run: (L) => { arcEnd(L, 'mentor', 'video'); relate(L, 'oldvet', 5); bump(L, { morale: 2 }); return 'Two minutes, recorded in a hotel. He plays it before every game.'; } },
    ],
  },
  /* The crosstown rival from high school, on the other bench in college. */
  arc_prep_2: {
    phases: ['col', 'col_mar'], stage: 'am', when: (L) => !!(L.am && L.am.level === 'col' && L.am.college !== arcData(L, 'prep').school),
    tag: 'National TV',
    title: '{prepstar} is on the other bench',
    text: () => 'Your old crosstown rival plays for {school2} now. National TV, and the old feelings are back.',
    options: [
      { label: 'Make it personal', hint: 'Like old times', run: (L, r) => { if (ok(r, 0.4 + (ovrOf(L) - 50) * 0.03)) { arcEnd(L, 'prep', 'won'); bump(L, { fame: 6, morale: 6 }); if (L.am) L.am.stock = (L.am.stock || 0) + 0.4; return 'You win again. Some things never change.'; } arcEnd(L, 'prep', 'lost'); bump(L, { morale: -5 }); return 'He wins this one. He brings up high school anyway.'; } },
      { label: 'Shake his hand first', hint: 'Grown-up move', run: (L) => { arcEnd(L, 'prep', 'peace'); bump(L, { trust: 3, morale: 3 }); return 'You catch up at midcourt. Then you play hard.'; } },
    ],
  },
};
defineEvents(ARC_EVENTS, 'arc');
