// ─── the league's clubs ─────────────────────────────────────────────────────

/* Year one's club strength off the real rosters, then scaled to the league's
   real spread. `rows` is the data's player-seasons; only the newest season is
   read. A club with nobody in it reads as average rather than as nothing. */
function seedLeague(rows, rosters) {
  COMPS = buildComps(rows);
  let latest = 0;
  for (const r of rows || []) if (r.s > latest) latest = r.s;
  /* TODAY'S ROSTERS. A career joins the season after the data's newest, and
     hoops/data/rosters.json is that season's real clubs: the summer's trades,
     free agents and rookies, every man under contract. When it is for that
     season, the clubs are built from it, each man carrying what he did last
     season. Anything else (no file, a stale one) is the data's last season. */
  const today = rosters && rosters.clubs && +rosters.season === latest + 1 ? rosters : null;
  if (today) return seedToday(rows, latest, today);
  const by = {};
  for (const r of rows || []) if (r.s === latest && CLUBS.indexOf(r.t) >= 0) (by[r.t] = by[r.t] || []).push(r);
  const net = {}, stars = {};
  for (const c of CLUBS) {
    const list = by[c] || [];
    if (list.length >= 5 && E.teamStrength) {
      const st = E.teamStrength(list);
      net[c] = st.ortg - st.drtg;
    } else net[c] = 0;
    stars[c] = list.slice().sort((a, b) => b.w - a.w).slice(0, 3).map((r) => r.n);
  }
  /* What each man did in that season, for the rotation screen and the
     Saturday contests: minutes, points, rebounds, assists, threes taken. */
  const lines = {};
  for (const c in by) for (const r of by[c]) lines[r.n] = [round1(r.mp || 0), round1(r.pts || 0), round1(r.reb || 0), round1(r.ast || 0), round1(r.tpa || 0), String(r.ep || r.pp || '')];
  return { latest: latest || 2026, net: normaliseNets(net), stars, roster: rosterSeed(rows, latest), lines };
}
/* The clubs as rosters.json has them. The net comes off last season's rows of
   the men each club now holds, so a club that traded for a star plays like it.

   POSITION. The roster file writes a coarse G, F or C (Basketball-Reference's
   roster table), which read as SG and SF turned the league's best shooting
   point guard into a shooting guard and its best passing power forward into
   a small forward, and left his club with no point guard at all. A man's position is the one the data lists for his most
   recent season, when that agrees with the file's letter; the coarse letter is
   only the fallback for a man the data has never seen.

   WORTH. A season's win shares are a count, so a season lost to injury reads
   as a worse player: a star's 43 games one season read 4.1 against 7.9 the
   year before. A man's worth is his last three seasons, each as a rate per game
   over a full season, weighted toward the newest and toward the seasons he
   actually played. It is stamped with the season it was measured in (the
   fifth field), so the rosters age him from there and not from scratch. */
const POS_COARSE = { G: 'SG', F: 'SF', GF: 'SF', FC: 'PF' };
const POS_FAMILY = { G: ['PG', 'SG'], F: ['SF', 'PF'], C: ['C', 'PF'], GF: ['SG', 'SF'], FC: ['PF', 'C'] };
function posFromData(filePos, rowsNewestFirst) {
  const fam = POS_FAMILY[filePos];
  for (const r of rowsNewestFirst) {
    const pp = r && String(r.pp || '').split(';')[0];
    if (R_POS.indexOf(pp) < 0) continue;
    /* The data's spot when it is in the file's family or one step from it:
       a big the file calls F is often a center in the data, and the
       coarse letter is the rougher of the two. */
    const near = (f) => Math.abs(R_POS.indexOf(f) - R_POS.indexOf(pp)) <= 1;
    if (R_POS.indexOf(filePos) >= 0 || !fam || fam.some(near)) return pp;
  }
  if (R_POS.indexOf(filePos) >= 0) return filePos;
  return POS_COARSE[filePos] || 'SF';
}
function worthOf(bySeason, latest) {
  let num = 0, den = 0, gs = 0, gw = 0;
  [[latest, 0.6], [latest - 1, 0.3], [latest - 2, 0.1]].forEach(([y, wt]) => {
    const rs = bySeason[y];
    if (!rs || !rs.length) return;
    const w = rs.reduce((a, r) => a + (r.w || 0), 0), g = rs.reduce((a, r) => a + (r.g || 0), 0);
    if (g <= 0) return;
    const rel = wt * Math.min(1, g / 50);
    /* PERFORMANCE IS WIN SHARES AND PRODUCTION, half each. Win shares alone
       rate a high-usage guard on a bad club under a center on a good one;
       the box score alone ignores whether it won. Production is points,
       rebounds, assists, steals and blocks a game, read in win shares a game
       (twelve a night is replacement level). */
    const pr = rs.reduce((a, r) => a + (r.g || 0) * Math.max(0, (r.pts || 0) + 1.2 * (r.reb || 0) + 1.6 * (r.ast || 0) + 2 * ((r.stl || 0) + (r.blk || 0)) - 12) * 0.24 / 70, 0) / g;
    num += rel * (0.5 * w / Math.max(g, 25) + 0.5 * pr * Math.min(1, g / 25));
    den += rel;
    gs += wt * g; gw += wt;
  });
  /* A rate per game, times the games a man like him plays: a season lost to
     a knee costs a little, not most of what he is. */
  return den > 0 ? (num / den) * clamp(gs / gw, 45, 76) : null;
}
/* The rosters with the real ratings file riding on them, for a reader that
   loads the two separately. */
function withRatings(rosters, ratings) {
  if (!rosters || !ratings || !ratings.men) return rosters;
  return Object.assign({}, rosters, { ratings });
}
function seedToday(rows, latest, today) {
  const RT = (today.ratings && today.ratings.season === latest + 1 && today.ratings.men) || {};
  const RTN = Object.keys(RT).length > 0;
  const last = {}, by = {}, first = {};
  for (const r of rows || []) {
    if (!(first[r.i] <= r.s)) first[r.i] = r.s;
    if (r.s === latest) { (last[r.i] = last[r.i] || []).push(r); }
    if (r.s >= latest - 2) { const b = by[r.i] = by[r.i] || {}; (b[r.s] = b[r.s] || []).push(r); }
  }
  const net = {}, stars = {}, roster = {}, lines = {}, fa = [];
  for (const c of CLUBS) {
    const men = (today.clubs[c] || []).map((m) => {
      const mine = last[m.i] || [];
      const seasons = by[m.i] || {};
      const recent = [latest, latest - 1, latest - 2].map((y) => (seasons[y] || []).slice().sort((a, b) => (b.g || 0) - (a.g || 0))[0]).filter(Boolean);
      const v = worthOf(seasons, latest);
      /* THE REAL RATING WINS. A man the 2K ratings cover is worth exactly
         the rating fans know, read back onto our scale, for the season about
         to be played. A man they do not cover is rated under 75 by them, so
         his box score reading is held under that. */
      const rr = RT[m.i] || {};
      const w = rr.o ? wFromOvr(showInv(rr.o)) : RTN ? Math.min(v == null ? 1.2 : v, wFromOvr(showInv(74.4))) : v == null ? 1.2 : v;
      /* Last season's line, from whichever club he played most for. */
      const top = mine.slice().sort((a, b) => (b.g || 0) - (a.g || 0))[0];
      if (top) lines[m.n] = [round1(top.mp || 0), round1(top.pts || 0), round1(top.reb || 0), round1(top.ast || 0), round1(top.tpa || 0), String(top.ep || top.pp || '')];
      const pos = posFromData(m.pos, recent);
      const born = m.b || (top ? bornOf(top, first[m.i]) : latest - 21);
      return { m, w: round1(w), pos, born, rows: mine, o: rr.o || 0, p: rr.p || 0 };
    }).sort((a, b) => b.w - a.w);
    /* With the ratings file every man is read for the season about to be
       played (a 2K rating is that season's), so nobody is aged into it. */
    const ms = RTN ? latest + 1 : latest;
    /* The eighth field is the season he debuted, for "retires after 18 seasons". */
    const tup = (x) => [x.m.n, x.pos, x.born, x.w, ms, x.o || 0, x.p || 0, first[x.m.i] || 0];
    roster[c] = men.slice(0, 15).map(tup);
    for (const x of men.slice(15)) fa.push(tup(x));
    stars[c] = men.slice(0, 3).map((x) => x.m.n);
    /* Strength off last season's rows of the men he now has, the best one per
       man, so a traded player counts once and for his new club. */
    const list = men.map((x) => x.rows.slice().sort((a, b) => (b.w || 0) - (a.w || 0))[0]).filter(Boolean);
    net[c] = list.length >= 5 && E.teamStrength ? (() => { const st = E.teamStrength(list); return st.ortg - st.drtg; })() : 0;
  }
  const coach = {};
  for (const c of CLUBS) if (today.coaches && today.coaches[c]) coach[c] = String(today.coaches[c]).slice(0, 40);
  /* And the men who played last season and are on no roster today. */
  const on = new Set();
  for (const c of CLUBS) for (const m of today.clubs[c] || []) on.add(m.i);
  for (const i in last) {
    if (on.has(i)) continue;
    const top = last[i].slice().sort((a, b) => (b.g || 0) - (a.g || 0))[0];
    const born = bornOf(top, first[i]);
    if (latest + 1 - born > 33) continue;
    const v = worthOf(by[i] || {}, latest);
    fa.push([top.n, posFromData(String(top.pp || top.ep || 'SF').split(';')[0], [top]), born, round1(Math.max(0.2, v == null ? 0.5 : v)), latest]);
  }
  fa.sort((a, b) => b[3] - a[3]);
  return { latest: latest || 2026, rs: latest + 1, net: normaliseNets(net), stars, roster, lines, cn: coach, fa: fa.slice(0, 60) };
}
/* Mean zero, a spread of 4.6 points, which is roughly the real league's. */
function normaliseNets(net) {
  const vals = CLUBS.map((c) => net[c] || 0);
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) * (v - mean), 0) / vals.length) || 1;
  const out = {};
  for (const c of CLUBS) out[c] = round1(((net[c] || 0) - mean) / sd * 4.6);
  return out;
}
/* A new season: every club regresses toward the middle and moves a little. */
function driftLeague(L, beats) {
  /* Before the data's season is over nothing moves: those summers are the
     real past, and the league in the data is what it became. */
  if (L.opt && L.opt.cal && (L.year <= L.league.latest + 1 || L.stage !== 'nba')) return;
  coachCarousel(L, beats);
  const rng = rngAt(L, 'drift');
  const net = {};
  /* A STORY CLUB IS AS GOOD AS ITS PLAYERS. After the summer's moves every
     club is rated off its rotation's overalls, weighted the way the minutes
     go, with a little left to coaching and luck. Your own club is rated
     without you: what you add is your impact on the floor. */
  if (rostOf(L)) {
    leagueSummer(L);
    rosterSummer(L, beats);
    L.league.net = rosterNets(L, rng);
    return;
  }
  for (const c of CLUBS) net[c] = (L.league.net[c] || 0) * 0.62 + norm(rng) * 3.6;
  L.league.net = normaliseNets(net);
  leagueSummer(L);
  rosterSummer(L, beats);
}
const NET_WT = [0.15, 0.14, 0.13, 0.12, 0.11, 0.1, 0.08, 0.07, 0.06, 0.04];
function clubOvr(L, c) {
  const m = matesOf(L, c).filter((x) => !(c === L.team && x.n === L.name)).map((x) => x.ovr).sort((a, b) => b - a);
  let v = 0;
  NET_WT.forEach((w, k) => { v += w * (m[k] != null ? m[k] : 60); });
  return v;
}
function rosterNets(L, rng) {
  const net = {};
  for (const c of CLUBS) net[c] = clubOvr(L, c) + norm(rng) * 0.6;
  /* The scale the nets are drawn on is kept, so a deadline deal moves a
     club's net by what it gained and nothing else. */
  if (fo(L)) {
    const v = CLUBS.map((c) => net[c]), m = v.reduce((a, x) => a + x, 0) / v.length;
    fo(L).nz = { m: round1(m), sd: round1(Math.sqrt(v.reduce((a, x) => a + (x - m) * (x - m), 0) / v.length) || 1) };
  }
  return normaliseNets(net);
}
const clubNet = (L, c) => L.league.net[c] || 0;
function clubTier(net) {
  if (net >= 4) return 'Contender';
  if (net >= 0.5) return 'Playoff team';
  if (net >= -3) return 'In the middle';
  return 'Rebuilding';
}

/* What it takes to start for a club. A good club's rotation is better, so the
   bar to get on the floor there is higher. */
const rotationBar = (net) => 67 + net * 0.45;

// ─── the people ─────────────────────────────────────────────────────────────

/* EVERYBODY IN A STORY HAS A NAME. NBA players and NBA head coaches are real
 * people under their real names. Everybody else (a high school coach, a
 * college coach, an agent, a GM, your mom, a booster) is generated off the
 * career's seed, so they are the same people every time the career is loaded
 * and different people in the next career.
 *
 * The head coaches are the staff in place at the end of the data's last
 * season, which is the league the career opens on. They move after that the
 * way coaches do: a bad year gets a coach fired, an interim gets the job or
 * does not, and a fired coach can turn up somewhere else a year later. Once
 * the real names run out, the league promotes generated assistants. Change a
 * chair here and nowhere else.
 */
const COACHES_NOW = {
  ATL: ['Quin Snyder', 1966], BOS: ['Joe Mazzulla', 1988], BRK: ['Jordi Fernández', 1982],
  CHI: ['Billy Donovan', 1965], CHO: ['Charles Lee', 1984], CLE: ['Kenny Atkinson', 1967],
  DET: ['J.B. Bickerstaff', 1979], IND: ['Rick Carlisle', 1959], MIA: ['Erik Spoelstra', 1970],
  MIL: ['Doc Rivers', 1961], NYK: ['Mike Brown', 1970], ORL: ['Jamahl Mosley', 1978],
  PHI: ['Nick Nurse', 1967], TOR: ['Darko Rajaković', 1979], WAS: ['Brian Keefe', 1976],
  DAL: ['Jason Kidd', 1973], DEN: ['David Adelman', 1981], GSW: ['Steve Kerr', 1965],
  HOU: ['Ime Udoka', 1977], LAC: ['Tyronn Lue', 1977], LAL: ['JJ Redick', 1984],
  MEM: ['Tuomas Iisalo', 1982], MIN: ['Chris Finch', 1969], NOP: ['James Borrego', 1977],
  OKC: ['Mark Daigneault', 1985], PHO: ['Jordan Ott', 1985], POR: ['Tiago Splitter', 1985],
  SAC: ['Doug Christie', 1970], SAS: ['Mitch Johnson', 1986], UTA: ['Will Hardy', 1988],
};
/* Real coaches out of a chair when the data ends, and real assistants a club
   could hand one to. The third field is whether he has run a bench before:
   an interim comes from the assistants first, a big hire from the others. */
const COACH_POOL = [
  ['Mike Budenholzer', 1969, 1], ['Michael Malone', 1971, 1], ['Tom Thibodeau', 1958, 1],
  ['Taylor Jenkins', 1984, 1], ['Monty Williams', 1971, 1], ['Frank Vogel', 1973, 1],
  ['Willie Green', 1981, 1], ['Steve Clifford', 1961, 1], ['Nate McMillan', 1964, 1],
  ['Wes Unseld Jr.', 1975, 1], ['Jacque Vaughn', 1975, 1], ['Darvin Ham', 1973, 1],
  ['Dwane Casey', 1957, 1], ['Adrian Griffin', 1974, 1], ['Stephen Silas', 1973, 1],
  ['Luke Walton', 1980, 1], ['Igor Kokoškov', 1971, 1], ['Mark Jackson', 1965, 1],
  ['Jeff Van Gundy', 1962, 1], ['Sean Sweeney', 1984, 0], ['Johnnie Bryant', 1985, 0],
  ['Micah Nori', 1973, 0], ['Chris Quinn', 1983, 0], ['Sam Cassell', 1969, 0],
  ['Phil Handy', 1971, 0], ['Jarron Collins', 1978, 0], ['Dan Craig', 1980, 0],
  ['Rex Kalamian', 1965, 0],
];
const COACH_NAMES = Object.keys(COACHES_NOW).map((c) => COACHES_NOW[c][0]).concat(COACH_POOL.map((x) => x[0]));

/* Generated names. check-career holds every pairing these lists can make
   against every real player and coach, so a made-up person is never somebody
   real by accident. */
const PEOPLE_M = ['Ray', 'Curtis', 'Dwayne', 'Glenn', 'Leon', 'Vernon', 'Tom', 'Marty', 'Russ', 'Darnell',
  'Phil', 'Gene', 'Walt', 'Howard', 'Rodney', 'Earl', 'Lou', 'Frank', 'Cedric', 'Hank', 'Byron', 'Neil',
  'Reggie', 'Otis', 'Stan', 'Lyle', 'Clint', 'Duane', 'Felix', 'Arturo'];
const PEOPLE_F = ['Denise', 'Monique', 'Tanya', 'Rochelle', 'Angela', 'Carmen', 'Lorraine', 'Yvette',
  'Brenda', 'Gloria', 'Sheila', 'Renee', 'Valerie', 'Darlene', 'Paula', 'Marisol', 'Joyce', 'Lena',
  'Bernadette', 'Nadia'];
const PEOPLE_X = ['Simone', 'Maya', 'Jordan', 'Alexis', 'Avery', 'Kendall', 'Brielle', 'Imani', 'Sasha',
  'Noelle', 'Taylor', 'Camille', 'Jada', 'Reese', 'Tiana', 'Aaliyah', 'Morgan', 'Nia', 'Zora', 'Leila'];
const PEOPLE_LAST = ['Haddock', 'Prewitt', 'Coldwell', 'Ferraro', 'Ambrose', 'Kettering', 'Doucette',
  'Saltzman', 'Rourke', 'Batista', 'Whitcomb', 'Laughlin', 'Ostrander', 'Pettaway', 'Dabney', 'Hurlbut',
  'Mancuso', 'Galloway', 'Tisdell', 'Brannock', 'Esposito', 'Varnado', 'Crenshaw', 'Lomax', 'Szabo',
  'Okonjo', 'Pickard', 'Rayburn', 'Delgado', 'Fenwick', 'Quarles', 'Albrecht', 'Moncrief', 'Treadway',
  'Yancey', 'Bergstrom', 'Cavanaugh', 'Duplessis', 'Heflin', 'Nakamura'];

/* One person, off a key. The key is what makes him the same man next time. */
function personName(L, key, kind) {
  const r = E.createSeededRNG(E.hashSeed(String(L.seed) + ':who:' + key));
  const first = kind === 'f' ? PEOPLE_F : kind === 'x' ? PEOPLE_X : PEOPLE_M;
  return pick(r, first) + ' ' + pick(r, PEOPLE_LAST);
}
/* Family shares your last name. */
const surname = (L) => { const p = String(L.name || '').trim().split(/\s+/); return p[p.length - 1] || 'Smith'; };
function kinName(L, key, kind) {
  if (key === 'dad' && L.parent && L.parent.name) return L.parent.name;
  const r = E.createSeededRNG(E.hashSeed(String(L.seed) + ':kin:' + key));
  return pick(r, kind === 'f' ? PEOPLE_F : PEOPLE_M) + ' ' + surname(L);
}
const firstOf = (n) => String(n || '').split(' ')[0];
const lastOf = (n) => { const p = String(n || '').trim().split(/\s+/); if (p.length > 1 && /^(jr\.?|sr\.?|ii|iii|iv)$/i.test(p[p.length - 1])) return p[p.length - 2]; return p[p.length - 1] || n; };

// ─── the coaching carousel ──────────────────────────────────────────────────

/* The league's coaches ride on the life like its club nets do. An old save
   has no coaches yet, so they are read through here and built on first use. */
function coachState(L) {
  const lg = L.league;
  if (!lg.coach) {
    lg.coach = {};
    for (const c of CLUBS) {
      const x = COACHES_NOW[c];
      /* rosters.json names who coaches the club the season a career joins. A
         man the tables know keeps his birth year; a new one is given one. */
      const now = lg.cn && lg.cn[c];
      if (now && now !== x[0]) {
        const k = Object.values(COACHES_NOW).concat(COACH_POOL).find((y) => y[0] === now);
        lg.coach[c] = { n: now, b: k ? k[1] : 1978, since: lg.rs || (lg.latest || 2026), real: 1 };
        continue;
      }
      lg.coach[c] = { n: x[0], b: x[1], since: (lg.latest || 2026) - 1, real: 1 };
    }
    lg.free = [];
    lg.gone = [];
    lg.gen = 0;
  }
  return lg;
}
function coachOf(L, c) {
  const lg = coachState(L);
  return lg.coach[c] || null;
}
const coachName = (L, c) => { const x = coachOf(L, c); return x ? x.n : ''; };
/* Every real name the league has already used, so the pool is what is left. */
function coachUsed(L) {
  const lg = coachState(L), used = {};
  for (const c of CLUBS) if (lg.coach[c]) used[lg.coach[c].n] = 1;
  for (const f of lg.free) used[f.n] = 1;
  for (const g of lg.gone) used[g] = 1;
  return used;
}
/* Who a club can hire. Fired coaches who have sat a year, real names from
   the pool nobody has hired yet, and a generated assistant when those run
   short. `interim` wants an assistant who is already in the building. */
function coachCandidates(L, c, interim, rng) {
  const lg = coachState(L), used = coachUsed(L), out = [];
  if (!interim) {
    for (const f of lg.free) if (f.from !== c && L.year - f.out >= 1 && L.year - f.b < 70) out.push({ n: f.n, b: f.b, real: f.real, w: 3 + (f.good || 0) });
  }
  for (const x of COACH_POOL) {
    if (used[x[0]] || L.year - x[1] >= 70) continue;
    if (interim && x[2]) continue;
    out.push({ n: x[0], b: x[1], real: 1, w: x[2] ? 2.5 : 1.6 });
  }
  /* A first-time coach the league promotes. More of them as the real names
     retire, which is how a real league turns over. */
  let g = personName(L, 'coachgen:' + (lg.gen || 0), 'm');
  while (used[g]) { lg.gen = (lg.gen || 0) + 1; g = personName(L, 'coachgen:' + lg.gen, 'm'); }
  out.push({ n: g, b: L.year - 38 - Math.floor(rng() * 10), real: 0, gen: 1, w: interim ? 3 : 1.2 + Math.max(0, 6 - out.length) * 0.5 });
  return out;
}
function hire(L, c, cand, interim) {
  const lg = coachState(L);
  if (cand.gen) lg.gen = (lg.gen || 0) + 1;
  lg.free = lg.free.filter((f) => f.n !== cand.n);
  lg.coach[c] = { n: cand.n, b: cand.b, since: L.year, real: cand.real ? 1 : 0, interim: interim ? 1 : 0 };
  return lg.coach[c];
}
function fire(L, c, good) {
  const lg = coachState(L);
  const x = lg.coach[c];
  if (!x) return null;
  if (L.year - x.b < 66) lg.free.push({ n: x.n, b: x.b, real: x.real, out: L.year, from: c, good: good || 0 });
  else lg.gone.push(x.n);
  lg.coach[c] = null;
  return x;
}
/* How likely a club is to make a change, off how it played. */
function fireChance(L, c, net, champ) {
  const x = coachOf(L, c);
  if (!x) return 1;
  const ten = L.year - x.since;
  let p = 0.03;
  if (net < -4) p += 0.3; else if (net < -1.5) p += 0.15; else if (net < 1) p += 0.06; else p += 0.01;
  if (ten >= 5 && net < 2) p += 0.06;
  if (ten <= 1 && !x.interim) p -= 0.05;
  if (x.interim) p += 0.45;
  if (champ) p = 0;
  return clamp(p, 0, 0.9);
}
/* The summer. Runs once a year, before the nets move, so it reads the season
   just played. Your club's change is a beat; the rest is the league wire. */
function coachCarousel(L, beats) {
  const lg = coachState(L);
  if (lg.cy === L.year) return;
  lg.cy = L.year;
  const rng = rngAt(L, 'carousel');
  const moves = [];
  for (const c of CLUBS) {
    const x = lg.coach[c];
    if (x && L.year - x.b >= 71 && rng() < 0.6) { lg.gone.push(x.n); lg.coach[c] = null; moves.push({ c, out: x, why: 'retires' }); continue; }
    /* Your club is judged on the record you actually played. */
    let net = clubNet(L, c), champ = false;
    const last = L.history[L.history.length - 1];
    if (c === L.team && last && last.y === L.year - 1 && last.t === c) {
      net = (last.w / Math.max(1, last.w + last.l) - 0.5) / 0.03;
      champ = last.po === 'Champion';
    }
    if (rng() < fireChance(L, c, net, champ)) moves.push({ c, out: fire(L, c, net > 2 ? 1 : 0), why: 'fired' });
  }
  for (const m of moves) {
    const list = coachCandidates(L, m.c, false, rng);
    const got = hire(L, m.c, weighted(rng, list, (x) => x.w) || list[0], false);
    m.in = got;
  }
  /* Old coaches who never got another chair leave the list after four years. */
  lg.free = lg.free.filter((f) => { if (L.year - f.out > 4 || L.year - f.b >= 72) { lg.gone.push(f.n); return false; } return true; });
  if (lg.gone.length > 120) lg.gone = lg.gone.slice(-120);
  const line = (m) => (m.out ? (m.why === 'retires' ? dot(m.out.n + ' retires') : dot('The ' + nick(m.c) + ' fire ' + m.out.n)) + ' ' : '')
    + m.in.n + ' takes over.';
  for (const m of moves) {
    if (m.c === L.team && L.stage === 'nba') {
      const txt = line(m);
      beats && beats.push({ kind: 'coach', text: txt, tone: '' });
      logIt(L, txt, '');
      L.m.trust = 50;
    }
  }
  const wire = moves.filter((m) => m.c !== L.team);
  L.flags.wire = wire.slice(0, 3).map(line);
  if (beats && L.stage === 'nba' && L.team) for (const m of wire.slice(0, 2)) beats.push({ kind: 'news', text: 'Around the league: ' + line(m).replace(/^The /, 'the '), tone: '' });
}
/* A sentence that ends on a name like Wes Unseld Jr. gets one full stop. */
const dot = (t) => /\.$/.test(t) ? t : t + '.';
/* The All-Star break. A club that has fallen through the floor makes a
   change in February and hands it to an assistant. Your own club goes
   through the coach_fired card instead, so the front office can ask you. */
function midseasonFirings(L, beats) {
  const lg = coachState(L);
  if (lg.my === L.year) return;
  lg.my = L.year;
  const rng = rngAt(L, 'midfire');
  for (const c of CLUBS) {
    if (c === L.team) continue;
    const x = lg.coach[c];
    if (!x || x.interim || L.year - x.since < 1) continue;
    const net = clubNet(L, c);
    const p = net <= -4.5 ? 0.12 : net <= -3 ? 0.04 : 0;
    if (rng() >= p) continue;
    fire(L, c, 0);
    const got = hire(L, c, weighted(rng, coachCandidates(L, c, true, rng), (y) => y.w), true);
    if (beats && L.stage === 'nba' && L.team) beats.push({ kind: 'news', text: 'Around the league: ' + dot('the ' + nick(c) + ' fire ' + x.n) + ' ' + got.n + ' is the interim.', tone: '' });
  }
}

// ─── the rosters around you ─────────────────────────────────────────────────

/* REAL TEAMMATES. Every club opens with its real roster from the data's last
   season, and those men age a year at a time and retire when their careers
   would. Each draft class after that adds one generated rookie a club, who
   stays about ten years. On a story career the rosters also move (rostOf,
   below); a career without the story keeps this still picture. */
function bornOf(r, first) {
  if (r.dr) return r.dr - 20;
  return (first || r.s) - 23;
}
function rosterSeed(rows, latest) {
  const first = {};
  for (const r of rows || []) if (!(first[r.i] <= r.s)) first[r.i] = r.s;
  const by = {};
  for (const r of rows || []) {
    if (r.s !== latest || CLUBS.indexOf(r.t) < 0) continue;
    (by[r.t] = by[r.t] || []).push(r);
  }
  const out = {};
  for (const c of CLUBS) out[c] = (by[c] || []).slice().sort((a, b) => b.w - a.w).slice(0, 12)
    .map((r) => [r.n, String(r.pp || r.ep || 'SF').split(';')[0], bornOf(r, first[r.i]), round1(r.w)]);
  return out;
}
const R_POS = POS;
function retireAge(L, name, w) {
  const r = E.createSeededRNG(E.hashSeed(String(L.seed) + ':ret:' + name));
  return 33 + Math.floor(r() * 4) + (w >= 8 ? 3 : w >= 5 ? 2 : w >= 2 ? 1 : 0);
}
/* THE LEAGUE MOVES (story careers). The rosters start as the data's last
   season and then live: every summer the old retire, a rookie arrives on each
   club, a handful of players change clubs in trades, more in free agency, and
   now and then a star moves. A club that gets better gets a little better on
   the floor. A career saved before this builds its rosters the first time it
   reads them, from the same seed rosters, so nobody it knew disappears. */
/* A REAL MAN'S YEAR. A roster seeded from today's file stamps each man with
   the season his worth was measured in (e.s), and he is aged from there, not
   from scratch: what a 38 year old did last season already carries his age,
   so a second discount for it took a 39 year old star to a quarter of
   himself before he had played a game. From then on a young man grows, a man in his prime holds
   and a veteran declines a little faster each year, and each man has his own
   arc (seeded off his name) so not every 22 year old makes the same leap. */
const REAL_CURVE = { 19: 1.2, 20: 1.18, 21: 1.15, 22: 1.12, 23: 1.08, 24: 1.05, 25: 1.03, 26: 1.01, 27: 1, 28: 0.98, 29: 0.96, 30: 0.93, 31: 0.9, 32: 0.87, 33: 0.84, 34: 0.82, 35: 0.8 };
function realArc(e) { const r = E.createSeededRNG(E.hashSeed('arc:' + e.n)); return (r() + r() + r()) / 3 * 2 - 1; }
function realCurW(e, Y) {
  if (Y <= e.s) return round1(e.w);
  const arc = realArc(e);
  let v = e.w;
  for (let y = e.s + 1; y <= Y; y++) {
    const a = y - e.b;
    const f = REAL_CURVE[a] || (a < 19 ? 1.2 : 0.78);
    v *= f >= 1 ? 1 + (f - 1) * (1 + arc * 0.8) : f + arc * 0.025;
  }
  return round1(Math.max(0.1, Math.min(v, Math.max(e.w * 2.6, 6))));
}
function rostCurW(e, Y) {
  if (e.cy != null) return wFromOvr(manOvr(e, Y));
  return oldCurW(e, Y);
}
/* What the model before the league office said a man was worth: a closed
   curve of his age. Read once, when a man is first put on the new model. */
function oldCurW(e, Y) {
  if (e.s && !e.g) return realCurW(e, Y);
  const age = Y - e.b;
  const grow = e.g ? Math.min(1, 0.35 + (Y - e.d) * 0.2) : 1;
  return round1(e.w * grow * (age <= 30 ? 1 : Math.max(0.1, 1 - (age - 30) * 0.08)));
}
function rostGone(L, e, Y) {
  /* On the league office's model a man leaves when he retires or nobody
     signs him, and he is taken off the roster then. */
  if (e.cy != null) return false;
  const age = Y - e.b;
  if (e.g) return age > 34 || Y - e.d >= 11;
  /* On today's rosters nobody leaves before the season they are under contract
     for has been played. After it the simulation decides, and a veteran past
     the usual age still gets a season or two rather than the whole old guard
     walking out in one summer. */
  const rs = L.league && L.league.rs;
  if (rs && Y <= rs) return false;
  let lim = retireAge(L, e.n, e.w);
  if (rs) {
    const r = E.createSeededRNG(E.hashSeed(String(L.seed) + ':last:' + e.n));
    lim = Math.max(lim, rs - e.b + 1 + Math.floor(r() * 2));
  }
  return age > lim;
}
function rookieFor(L, c, d) {
  const r = E.createSeededRNG(E.hashSeed(String(L.seed) + ':rook:' + c + ':' + d));
  const n = pick(r, FIRST) + ' ' + pick(r, PEOPLE_LAST);
  const peak = r() < 0.08 ? 9 : 1.5 + r() * 4;
  return { n, pos: pick(r, R_POS), b: d - 20, w: round1(peak), g: 1, d };
}
/* The rosters as the data has them, aged to season Y: a rookie a club for
   every draft after the data's, and the men who have retired by then gone. */
/* A roster tuple: name, position, born, worth, the season the worth was
   measured in, and for a man the real ratings cover his 2K overall and his
   salary for that season. */
function fromTup(p) {
  const e = p[4] ? { n: p[0], pos: p[1], b: p[2], w: p[3], s: p[4] } : { n: p[0], pos: p[1], b: p[2], w: p[3] };
  if (p[5]) e.o = p[5];
  if (p[6]) e.pay = p[6];
  if (p[7]) e.dy = p[7];
  return e;
}
function rostBuild(L, Y) {
  const lg = L.league, R = {};
  for (const c of CLUBS) {
    R[c] = ((lg.roster && lg.roster[c]) || []).map(fromTup);
    /* Today's rosters already carry this season's real rookies, so invented
       ones start with the next draft. */
    for (let d = (lg.rs || lg.latest || 2026) + 1; d <= Y; d++) R[c].push(rookieFor(L, c, d));
    R[c] = R[c].filter((e) => !rostGone(L, e, Y));
  }
  /* The real men past a club's fifteen: today's free agents and two-way
     players. A short club signs one of them before anybody is invented. */
  lg.pool = (lg.fa || []).map(fromTup).filter((e) => !rostGone(L, e, Y));
  uniqueNames(L, R, Y);
  lg.rost = R; lg.rostY = Y;
  /* A fresh league starts the front office fresh: every man on the new
     model, every club holding its own picks. */
  for (const c of CLUBS) for (const e of R[c]) initMan(L, e, Y);
  for (const e of lg.pool) initMan(L, e, Y);
  lg.fo = { picks: {}, rec: {}, tx: [] };
  return R;
}
function rostOf(L) {
  if (!L.league.roster) return null;
  const lg = L.league;
  if (lg.rost) {
    /* A league saved before the front office: put every man on the new
       model from what he was worth that season, so nobody jumps. */
    if (!lg.fo) {
      for (const c of CLUBS) for (const e of lg.rost[c]) initMan(L, e, lg.rostY);
      for (const e of lg.pool || []) initMan(L, e, lg.rostY);
      lg.fo = { picks: {}, rec: {}, tx: [] };
    }
    return lg.rost;
  }
  return rostBuild(L, L.year);
}
/* A reader that jumps years plays the summers it missed, quietly. */
function rostNow(L) {
  const R = rostOf(L);
  if (R) for (let k = 0; L.league.rostY < L.year && k < 60; k++) rosterSummer(L, null, L.league.rostY + 1);
  return R;
}
/* The position a club has fewest of, so a new man fills a hole. Ties keep
   the position he was drawn at. */
function thinPos(list, drawn) {
  const n = {}; for (const p of R_POS) n[p] = 0;
  for (const e of list) if (n[e.pos] != null) n[e.pos]++;
  const lo = Math.min(...R_POS.map((p) => n[p]));
  return n[drawn] === lo ? drawn : R_POS.find((p) => n[p] === lo);
}
const clubTalent = (R, c, Y) => R[c].map((e) => rostCurW(e, Y)).sort((a, b) => b - a).slice(0, 8).reduce((a, x) => a + x, 0);
function rosterSummer(L, beats, quietY) {
  const R = rostOf(L);
  const Y = quietY || L.year;
  if (!R || L.league.rostY >= Y) return;
  /* A career dated back (L.opt.cal) is in the real past until the season
     after the data's: no trades, no signings, nobody invented. The rosters
     are the data's, built fresh for that season. */
  if (L.opt && L.opt.cal && (Y <= L.league.latest + 1 || L.stage !== 'nba')) { rostBuild(L, Math.min(Y, L.league.latest + 1)); L.league.rostY = Y; return; }
  const lg = L.league;
  if (fo(L)) {
    /* The front office runs every summer in order, quietly through any it
       missed, so a summer is never skipped and never played twice. */
    while (lg.rostY < Y - 1) { lg.rostY++; officeSummer(L, R, lg.rostY, null, true); }
    lg.rostY = Y;
    officeSummer(L, R, Y, beats, !!quietY);
    uniqueNames(L, R, Y);
    return;
  }
  const rng = E.createSeededRNG(E.hashSeed(String(L.seed) + ':' + Y + ':moves'));
  lg.rostY = Y;
  const before = {};
  for (const c of CLUBS) before[c] = clubTalent(R, c, Y - 1);
  const news = [];
  const mine = L.stage === 'nba' && L.team;
  const pool = (lg.pool || []).filter((e) => !rostGone(L, e, Y));
  for (const c of CLUBS) {
    for (const e of R[c]) if (rostGone(L, e, Y) && !e.g && rostCurW(e, Y - 1) >= 3) news.push({ w: rostCurW(e, Y - 1), t: e.n + ' retires.', c });
    R[c] = R[c].filter((e) => !rostGone(L, e, Y));
  }
  /* ONE MOVE A MAN A SUMMER. A man traded in July is not traded again, let go
     or signed somewhere else before camp, so the news never says he went to
     two clubs. */
  const moved = new Set();
  const other = (c) => { let o = c; while (o === c) o = pick(rng, CLUBS); return o; };
  const move = (from, i, to, how) => {
    const e = R[from].splice(i, 1)[0];
    R[to].push(e);
    moved.add(e);
    news.push({ w: rostCurW(e, Y), t: e.n + (how === 'trade' ? ' is traded to the ' : ' signs with the ') + nick(to) + '.', c: from, to });
    return e;
  };
  const sign = (e, to) => {
    R[to].push(e);
    moved.add(e);
    if (!e.g) news.push({ w: rostCurW(e, Y), t: e.n + ' signs with the ' + nick(to) + '.', c: null, to });
  };
  /* Trades: two clubs swap players of about the same value. */
  const trades = 5 + Math.floor(rng() * 5);
  for (let k = 0; k < trades; k++) {
    const a = pick(rng, CLUBS), b = other(a);
    const ia = R[a].map((e, x) => x).filter((x) => !moved.has(R[a][x]));
    if (!ia.length || !R[b].length) continue;
    const i = pick(rng, ia), wa = rostCurW(R[a][i], Y);
    let j = -1, best = 99;
    R[b].forEach((e, x) => { if (moved.has(e)) return; const d = Math.abs(rostCurW(e, Y) - wa); if (d < best) { best = d; j = x; } });
    if (j < 0 || best > 1.5 + wa * 0.25) continue;
    const eb = R[b][j];
    move(a, i, b, 'trade');
    move(b, R[b].indexOf(eb), a, 'trade');
  }
  /* Now and then a star asks out. */
  if (rng() < 0.35) {
    const stars = [];
    for (const c of CLUBS) R[c].forEach((e) => { const w = rostCurW(e, Y); if (w >= 7 && Y - e.b >= 25 && !moved.has(e)) stars.push([c, e, w]); });
    if (stars.length) { const [c, e] = pick(rng, stars); move(c, R[c].indexOf(e), other(c), 'trade'); }
  }
  /* Free agency: veterans change teams, mostly toward a thin roster. */
  const fa = 10 + Math.floor(rng() * 8);
  for (let k = 0; k < fa; k++) {
    const c = pick(rng, CLUBS);
    const vets = R[c].map((e, i) => [e, i]).filter(([e]) => Y - e.b >= 24 && !moved.has(e));
    if (!vets.length) continue;
    const [, i] = pick(rng, vets);
    const thin = CLUBS.slice().sort((x, y) => R[x].length - R[y].length).slice(0, 8);
    const to = rng() < 0.6 ? pick(rng, thin.filter((x) => x !== c).length ? thin.filter((x) => x !== c) : [other(c)]) : other(c);
    move(c, i, to, 'fa');
  }
  /* Every club carries thirteen to fifteen. A long one lets its last man go,
     and an invented man before a real one of about the same worth. Nobody
     who moved this summer is let go: he was just wanted. A real man let go
     joins the free agents and can sign anywhere, which is his one move. */
  for (const c of CLUBS) {
    if (R[c].length <= 15) continue;
    const keep = (e) => rostCurW(e, Y) + (e.g ? 0 : 0.6) + (moved.has(e) ? 99 : 0);
    R[c].sort((x, y) => keep(y) - keep(x));
    for (const e of R[c].splice(15)) if (!e.g) pool.push(e);
  }
  pool.sort((x, y) => rostCurW(y, Y) - rostCurW(x, Y));
  /* A short club signs a real free agent first. Only when there is none does
     it draft a rookie, and only then a journeyman nobody has heard of. */
  const short = () => CLUBS.slice().sort((x, y) => R[x].length - R[y].length);
  for (const c of short()) while (R[c].length < 14 && pool.length) sign(pool.shift(), c);
  for (const c of CLUBS) if (R[c].length < 14) { const rk = rookieFor(L, c, Y); rk.pos = thinPos(R[c], rk.pos); R[c].push(rk); }
  for (const c of CLUBS) {
    while (R[c].length < 13) { const r = E.createSeededRNG(E.hashSeed(String(L.seed) + ':vet:' + c + ':' + Y + ':' + R[c].length)); R[c].push({ n: pick(r, FIRST) + ' ' + pick(r, PEOPLE_LAST), pos: thinPos(R[c], pick(r, R_POS)), b: Y - 27 - Math.floor(r() * 6), w: round1(0.4 + r() * 1.6), g: 1, d: Y - 6 }); }
  }
  lg.pool = pool.slice(0, 60);
  uniqueNames(L, R, Y);
  /* A club that got better plays a little better: a share of the talent it
     gained, with the league kept centred. */
  const d = {};
  let sum = 0;
  for (const c of CLUBS) { d[c] = clamp((clubTalent(R, c, Y) - before[c]) * 0.15, -2, 2); sum += d[c]; }
  for (const c of CLUBS) lg.net[c] = round1((lg.net[c] || 0) + d[c] - sum / CLUBS.length);
  /* The news: the biggest names, and anything that touches your club. */
  news.sort((x, y) => y.w - x.w);
  const told = news.filter((x) => mine && (x.c === L.team || x.to === L.team)).slice(0, 3);
  for (const x of news.slice(0, 2)) if (told.indexOf(x) < 0) told.push(x);
  for (const x of quietY ? [] : told) {
    const ours = mine && (x.c === L.team || x.to === L.team);
    if (beats && L.stage === 'nba') beats.push({ kind: 'news', text: (ours ? 'Your club: ' : 'Around the league: ') + x.t, tone: '' });
    feed(L, 'move', x.t);
    if (ours) logIt(L, x.t, '');
  }
}
/* NO TWO MEN IN THE LEAGUE SHARE A NAME. Generated rookies are drawn from
   two short lists, so two clubs drew the same man in about one season in
   four, and the deadline then printed "Mateo Tisdell to the Heat, Mateo
   Tisdell to the Timberwolves". A clash is redrawn until it is gone. */
function uniqueNames(L, R, Y) {
  const seen = new Set();
  for (const c of CLUBS) for (const e of R[c]) {
    if (!seen.has(e.n)) { seen.add(e.n); continue; }
    if (!e.g) continue;
    for (let k = 1; k < 40 && seen.has(e.n); k++) {
      const r = E.createSeededRNG(E.hashSeed(String(L.seed) + ':rename:' + c + ':' + Y + ':' + e.n + ':' + k));
      e.n = pick(r, FIRST) + ' ' + pick(r, PEOPLE_LAST);
    }
    seen.add(e.n);
  }
}
// ─── the front office: a league that runs itself (story careers) ────────────

/* THE LEAGUE OFFICE. Reported by the owner: players did not grow or decline
 * at a natural rate, role players hung around to 37 doing nothing, trades were
 * one man for one man with no picks in them, and the headlines read "X to the
 * Pacers". This is the league NBA 2K's franchise mode runs, in miniature:
 *
 *   every man has an overall that moves a year at a time: the young grow
 *   toward a ceiling of their own, a man holds through his late twenties, and
 *   the decline speeds up after thirty, faster for a role player than a star;
 *
 *   retirement is a decision, not an age: a star plays to 38, a 70 is gone at
 *   32, and a man nobody signs for a summer or two walks away;
 *
 *   contracts run out, clubs re-sign who they want and the rest are free
 *   agents, who sign where there is money, minutes and a reason;
 *
 *   a real draft every June: the standings, a lottery, two rounds, rookie
 *   deals, and picks a club can trade for four drafts out;
 *
 *   trades are packages valued by what each club wants: a contender pays for
 *   now with youth and picks, a rebuilding club sells for the future, a club
 *   over the tax pays somebody to take a contract, and now and then a star
 *   gets moved for a haul.
 *
 * The state lives on each man (c: his overall this season, on the model's
 * scale; pot: the ceiling he grows toward; k: the last season of his deal;
 * sal: what it pays) and in L.league.fo (pick ownership, standings, the
 * transaction log). A career saved before this upgrades the first time it
 * reads its rosters, from the numbers it had, so nobody jumps. */
function potFor(c, a, r) {
  if (a >= 28) return c;
  const room = LG_ROOM[a] != null ? LG_ROOM[a] : 15, peer = LG_PEER[a] != null ? LG_PEER[a] : 62;
  const head = Math.max(0, room + 0.2 * (c - peer) + norm(r) * (LG_SPREAD[a] || 4.5));
  /* devMan closes most of the gap, not all of it, so the ceiling sits a
     little past where the mean career ends up. */
  return round1(Math.min(99, c + head / 0.88));
}
/* The grade a scout gives that ceiling, on the 2K scale a player reads. */
function potGrade(pot) {
  const v = show(pot);
  return v >= 96 ? 'A+' : v >= 93 ? 'A' : v >= 90 ? 'A-' : v >= 87 ? 'B+' : v >= 84 ? 'B' : v >= 81 ? 'B-' : v >= 78 ? 'C+' : v >= 75 ? 'C' : v >= 72 ? 'C-' : 'D';
}
const NUMW = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];
const fo = (L) => (L.league && L.league.fo) || null;
const manRng = (L, e, tag, Y) => E.createSeededRNG(E.hashSeed(String(L.seed) + ':' + tag + ':' + e.n + ':' + Y));
/* A man's overall in season Y: this season's, or last season's for a reader
   looking back across the summer. */
function manOvr(e, Y) { return Y < e.cy && e.cp != null ? e.cp : e.c; }
const dealPay = (L, o, age, Y) => {
  const y0 = L.year;
  L.year = Y;
  const v = marketPay(L, show(o), age);
  L.year = y0;
  return v;
};
function payY(L, e, Y) {
  if (e.you) return e.sal;
  return payOf(L, e, Y, rostCurW(e, Y));
}
function payroll(L, R, c, Y) {
  if (MEMO && MEMO.pay[c] != null) return MEMO.pay[c];
  let p = 0;
  for (const e of R[c]) p += payY(L, e, Y);
  if (c === L.team && L.contract && L.stage === 'nba') p += L.contract.salary || 0;
  if (MEMO) MEMO.pay[c] = p;
  return p;
}
/* What he signs for and for how long. */
function dealYears(r, a, s) {
  if (a >= 34) return 1;
  if (a >= 31) return 1 + Math.floor(r() * 2) + (s >= 86 ? 1 : 0);
  if (a >= 28) return 2 + Math.floor(r() * 2) + (s >= 86 ? 1 : 0);
  return Math.min(5, 2 + Math.floor(r() * 3) + (s >= 84 ? 1 : 0));
}
/* The first time a man is read on the new model: his overall from what the
   old model said he was worth, a ceiling to grow toward, and a contract. */
function initMan(L, e, B) {
  if (e.cy != null) return e;
  e.c = round1(ovrOfMan(e, oldCurW(e, B)));
  e.cy = B; e.cp = e.c;
  const r = manRng(L, e, 'pot', 0), a = B - e.b;
  if (e.pot == null) e.pot = Math.max(e.c, potFor(e.c, a, r));
  if (e.k == null) {
    const u = r(), s = show(e.c);
    let yrs = a <= 22 ? 1 + Math.floor(u * 3) : u < 0.28 ? 0 : u < 0.58 ? 1 : u < 0.82 ? 2 : 3;
    if (s >= 88 && yrs < 3) yrs++;
    e.k = B + yrs;
    e.sal = e.pay || dealPay(L, e.c, a, B);
  }
  return e;
}
/* A YEAR OF A MAN'S CAREER. Young, he grows a share of the gap to his
   ceiling each year, more at nineteen than at twenty-six, with real variance:
   a stall, a breakout summer that raises the ceiling too. From twenty-eight he
   declines, a little at first and a lot by thirty-five, and a star holds on
   better than a role player. Each man ages his own way (realArc, off his
   name), and any year can cost him a few points to an injury. Seeded per man
   and season, so a reload sees the same league. */
function devMan(L, e, Y) {
  while (e.cy < Y) {
    const y = e.cy + 1, a = y - e.b, r = manRng(L, e, 'dev', y), c = e.c;
    let d = 0;
    if (a <= 29) {
      const rate = LG_GROW[a] != null ? LG_GROW[a] : a < 19 ? 0.26 : 0;
      let g = Math.max(0, (e.pot || c) - c) * rate;
      if (r() < 0.07) g *= 0.3;
      d = g + norm(r) * (a <= 24 ? 1.5 : 1);
      if (a <= 25 && r() < 0.04) { const j = 2 + r() * 3; d += j; e.pot = round1(Math.min(99, (e.pot || c) + j)); }
    }
    if (a >= 30) {
      const dec = (LG_DECLINE[a] != null ? LG_DECLINE[a] : 4.5) * (1 - 0.35 * realArc(e)) * (c >= 80 ? 0.8 : 1);
      d = -dec + norm(r) * 1.1;
    }
    if (r() < (a >= 30 ? 0.04 + (a - 30) * 0.01 : 0.025)) d -= 2 + r() * 4;
    e.cp = c;
    e.c = round1(clamp(c + clamp(d, -9, 9), 40, 99));
    e.cy = y;
  }
}
/* RETIREMENT IS A DECISION. The chance rises with age and falls with how good
   he still is: a 90 at 37 plays on, a 72 at 32 is done. A man on a deal he
   is still worth plays it out a little more often. Unsigned, he goes sooner. */
function retireP(e, Y, unsigned) {
  const a = Y - e.b, s = show(e.c);
  if (unsigned) return a >= 33 ? 0.85 : a >= 29 ? 0.45 : (e.fa || 0) >= 2 ? 0.6 : 0.12;
  /* Nobody in his twenties walks away from a roster spot. */
  if (a <= 29) return 0;
  let p = a <= 30 ? 0.003 : LG_RETIRE[a] != null ? LG_RETIRE[a] : 0.85;
  p *= s >= 90 ? 0.3 : s >= 85 ? 0.45 : s >= 80 ? 0.75 : s >= 76 ? 1.1 : s >= 73 ? 2 : 3.5;
  /* Past 34, a man who has fallen off the rotation is done. */
  if (a >= 35 && s < 75) p = Math.max(p, 0.7);
  if (e.k != null && e.k >= Y && s >= 78) p *= 0.6;
  return Math.min(0.97, p);
}

/* ── standings, picks and the draft ── */

/* Every club's wins in season Y. Your club's are the season you played; the
   rest are drawn off how good each club was, once, and kept. */
function seasonWins(L, Y) {
  const F = fo(L);
  F.rec = F.rec || {};
  if (F.rec[Y]) return F.rec[Y];
  const rng = E.createSeededRNG(E.hashSeed(String(L.seed) + ':' + Y + ':standings'));
  const w = {};
  for (const c of CLUBS) w[c] = Math.round(82 * clamp(0.5 + clubNet(L, c) * 0.031 + norm(rng) * 0.045, 0.16, 0.84));
  const h = (L.history || []).find((x) => x.y === Y && x.t);
  if (h && h.w != null) w[h.t] = h.w;
  F.rec[Y] = w;
  for (const k in F.rec) if (+k < Y - 3) delete F.rec[k];
  return w;
}
const pickKey = (d, r, c) => d + ':' + r + ':' + c;
const pickOwner = (F, d, r, c) => (F.picks && F.picks[pickKey(d, r, c)]) || c;
/* The picks club c holds in drafts d0 to d0 + 3, its own and anybody else's. */
const PICK_IDX = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
function picksOf(L, c, d0) {
  const F = fo(L);
  if (!F) return [];
  /* Every club's picks at once, kept until a pick changes hands (F.pv). */
  const key = d0 + ':' + (F.pv || 0);
  let ix = PICK_IDX && PICK_IDX.get(F);
  if (!ix || ix.key !== key) {
    const by = {};
    for (const x of CLUBS) by[x] = [];
    for (let d = d0; d <= d0 + 3; d++) for (const r of [1, 2]) for (const o of CLUBS) by[pickOwner(F, d, r, o)].push({ d, r, o });
    ix = { key, by };
    if (PICK_IDX) PICK_IDX.set(F, ix);
  }
  return ix.by[c].slice();
}
/* A window of trades or a free agency reads the same payrolls, values and
   depth over and over; this memo holds them for the window and forgets a
   club the moment its roster changes. */
let MEMO = null;
const memoOpen = () => { MEMO = { pay: {}, v: new Map(), bap: {} }; };
const memoClose = () => { MEMO = null; };
const memoDrop = (c) => { if (!MEMO) return; delete MEMO.pay[c]; delete MEMO.bap[c]; };
/* Where a pick is likely to land: off the owner's strength now, regressed
   toward the middle for a draft further out. */
function pickSlot(L, pk, Y) {
  const n = Math.max(1, pk.d - Y + 1);
  return clamp(Math.round(15.5 + clubNet(L, pk.o) * 2.6 * Math.pow(0.6, n - 1)), 1, 30);
}
/* The ceiling a pick at this slot usually brings, on the model's scale: the
   first pick about an 82 (a 90 on the 2K scale), the tenth about a 70, the
   thirtieth about a 59. Read off the class below, which is drawn to match. */
const potAt = (slot) => 55 + 28 * Math.pow(Math.max(0, 1 - slot / 65), 3);
/* A rookie deal, off the slot: Pick 1 about seven percent of the cap, the
   scale falling to about one and a half by pick 30, the minimum after. */
const rookieScale = (p, Y) => round1(p > 30 ? capFor(Y) * MIN_PCT : capFor(Y) * 0.072 * Math.pow(0.948, p - 1));
/* A DRAFT CLASS. Sixty-four prospects, invented, drawn so the class has a
   real shape: a top pick who becomes a star most years, a lottery of future
   starters, and a second round of long shots. A class can be deep or thin, and
   one in twenty-five carries a generational talent. Scouts draft the ceiling,
   and they get it wrong: the board is the ceiling plus what he is now, plus
   their error, so there are busts and steals. */
function draftClass(L, D, taken) {
  const rng = E.createSeededRNG(E.hashSeed(String(L.seed) + ':class:' + D));
  const depth = 0.85 + rng() * 0.3, out = [];
  const AGES = [19, 19, 19, 19, 20, 20, 20, 21, 21, 22, 22];
  for (let k = 0; k < 64; k++) {
    const age = pick(rng, AGES);
    let pot = 55.5 + 29 * depth * Math.pow(rng(), 3.4);
    const c = pot - Math.max(3, (27 - age) * 1.95 + norm(rng) * 1.5);
    out.push({ age, pot, c, pos: pick(rng, R_POS) });
  }
  out.sort((a, b) => b.pot - a.pot);
  if (rng() < 0.03) { out[0].pot = Math.min(97, out[0].pot + 6); out[0].c += 3; }
  for (const p of out) {
    p.grade = p.pot * 0.75 + p.c * 0.25 + norm(rng) * 3.5;
    p.n = freshName(L, 'prospect:' + D + ':' + p.grade.toFixed(3), taken);
  }
  return out.sort((a, b) => b.grade - a.grade);
}
/* A name nobody in the league has. */
function freshName(L, key, taken) {
  for (let k = 0; k < 60; k++) {
    const r = E.createSeededRNG(E.hashSeed(String(L.seed) + ':name:' + key + ':' + k));
    const n = pick(r, FIRST) + ' ' + pick(r, PEOPLE_LAST);
    if (!taken.has(n)) { taken.add(n); return n; }
  }
  const n = 'Prospect ' + taken.size;
  taken.add(n);
  return n;
}
/* The order for draft D: the fourteen clubs that missed the playoffs in the
   lottery, the NBA's odds for the first four picks, then everybody by
   record, worst first. The second round is straight reverse standings. */
function draftOrderFor(L, D) {
  const W = seasonWins(L, D);
  const tie = (c) => E.hashSeed(c + ':' + D) % 997;
  const asc = CLUBS.slice().sort((a, b) => W[a] - W[b] || tie(a) - tie(b));
  const rng = E.createSeededRNG(E.hashSeed(String(L.seed) + ':' + D + ':lotto'));
  const lot = asc.slice(0, 14), top = [];
  for (let i = 0; i < 4; i++) {
    const c = weighted(rng, lot, (x) => LOTTO[asc.indexOf(x)]);
    top.push(c);
    lot.splice(lot.indexOf(c), 1);
  }
  return { r1: top.concat(lot, asc.slice(14)), r2: asc.slice(), worst: asc[0] };
}
/* THE DRAFT, run in the summer before season Y (so it is the Y - 1 draft).
   Every first-round pick signs a four-year rookie deal; a second-round pick
   makes the roster only if he is better than the last man on it, and is
   otherwise stashed overseas and gone. */
function leagueDraft(L, R, Y, news, taken) {
  const F = fo(L), D = Y - 1;
  const ord = draftOrderFor(L, D), board = draftClass(L, D, taken);
  const slots = ord.r1.map((o) => ({ o, r: 1 })).concat(ord.r2.map((o) => ({ o, r: 2 })));
  const picked = [];
  slots.forEach((sl, i) => {
    const p = i + 1, club = pickOwner(F, D, sl.r, sl.o), pr = board.shift();
    if (!pr) return;
    const e = { n: pr.n, pos: pr.pos, b: Y - pr.age, w: 0, g: 1, d: Y, c: round1(pr.c), cy: Y, cp: round1(pr.c), pot: round1(pr.pot), pk: D + ' #' + p };
    e.k = Y + (sl.r === 1 ? 3 : 1);
    e.sal = rookieScale(p, Y);
    e.nt = Y;
    if (sl.r === 2) {
      const worst = R[club].slice().sort((a, b) => a.c - b.c)[0];
      if (R[club].length >= 15 && !(worst && e.c > worst.c + 1)) return;
    }
    R[club].push(e);
    picked.push({ p, club, e, from: sl.o });
  });
  if (F.picks) for (const k in F.picks) if (+k.split(':')[0] <= D) delete F.picks[k];
  F.pv = (F.pv || 0) + 1;
  /* The night's headlines: the lottery, the top three, and your club. */
  const top = picked.slice(0, 3);
  if (ord.r1[0] !== ord.worst) news.push({ w: 9, k: 'draft', c: ord.r1[0], t: 'The ' + nick(pickOwner(F, D, 1, ord.r1[0])) + ' win the lottery and the first pick.' });
  if (top.length === 3) news.push({ w: 9.5, k: 'draft', c: top[0].club, t: D + ' draft: the ' + nick(top[0].club) + ' take ' + top[0].e.n + ' first overall. ' + top[1].e.n + ' goes second to the ' + nick(top[1].club) + ', ' + top[2].e.n + ' third to the ' + nick(top[2].club) + '.' });
  if (L.team && L.stage === 'nba') for (const x of picked) if (x.club === L.team && x.p > 3) news.push({ w: 2, k: 'draft', c: L.team, t: 'The ' + nick(L.team) + ' draft ' + x.e.n + ' with the ' + ordinal(x.p) + ' pick.' });
  return picked;
}

/* ── contracts and free agency ── */

/* Deals that end this summer: a club keeps the men it wants, and the rest are
   free agents. A star is nearly always kept, a fading veteran rarely. */
function resignings(L, R, Y, news) {
  const fas = [];
  for (const c of CLUBS) {
    const order = R[c].slice().sort((a, b) => b.c - a.c);
    const tax = payroll(L, R, c, Y) > capFor(Y) * 1.22;
    for (const e of R[c].slice()) {
      if (e.k == null || e.k >= Y) continue;
      const a = Y - e.b, s = show(e.c), rank = order.indexOf(e), r = manRng(L, e, 'resign', Y);
      let p = 0.45 + (s >= 86 ? 0.4 : s >= 82 ? 0.25 : s >= 78 ? 0.1 : -0.12) + (rank < 5 ? 0.1 : 0) - (a >= 33 ? 0.2 : 0) - (tax && s < 82 ? 0.25 : 0) + (e.pk && a <= 25 ? 0.15 : 0);
      if (r() < p) {
        const yrs = dealYears(r, a, s);
        e.k = Y + yrs - 1;
        e.sal = round1(Math.min(dealPay(L, e.c, a, Y) * (0.92 + r() * 0.16), capFor(Y) * 0.35));
        delete e.pay;
        if (s >= 84) news.push({ w: s - 80, k: 'deal', c, t: e.n + ' re-signs with the ' + nick(c) + ': ' + (yrs === 1 ? 'one year' : NUMW[yrs] + ' years') + ', ' + moneyWords(e.sal * yrs) + '.' });
      } else {
        R[c].splice(R[c].indexOf(e), 1);
        e.from = c;
        fas.push(e);
      }
    }
  }
  return fas;
}
const moneyWords = (m) => '$' + (m >= 10 ? Math.round(m) : round1(m)) + ' million';
/* The best man a club has at a position, counting the spots next door. */
function bestAtPos(R, c, pos) {
  const mb = MEMO && (MEMO.bap[c] || (MEMO.bap[c] = {}));
  if (mb && mb[pos] != null) return mb[pos];
  let b = 0;
  for (const e of R[c]) { const f = e.pos === pos ? 1 : (NEXT_POS[pos] || []).indexOf(e.pos) >= 0 ? 0.92 : 0.75; b = Math.max(b, e.c * f); }
  if (mb) mb[pos] = b;
  return b;
}
/* FREE AGENCY. The best man on the market goes first, to the club where he
   is worth the most to both sides: a spot he would start at, money it can
   pay him, a contender for a veteran, home for a man who wants it. A club
   with no money pays the minimum and gets a man who will take it. Who nobody
   signs waits in the pool; a man in it too long retires. */
function freeAgency(L, R, Y, fas, moved, news) {
  const pool = (L.league.pool || []).concat(fas).sort((a, b) => b.c - a.c);
  const cap = capFor(Y), apron = cap * 1.36, minDeal = cap * MIN_PCT;
  const pay = {};
  for (const c of CLUBS) pay[c] = payroll(L, R, c, Y);
  const left = [];
  for (const e of pool) {
    const a = Y - e.b, s = show(e.c), r = manRng(L, e, 'fa', Y);
    const ask = round1(Math.min(dealPay(L, e.c, a, Y) * (0.9 + r() * 0.2), cap * 0.35));
    let best = null, bs = 0.2;
    for (const c of CLUBS) {
      if (R[c].length >= 15) continue;
      const room = apron - pay[c] - ask;
      const cheap = ask <= minDeal * 1.6;
      if (room < 0 && !cheap) continue;
      const better = R[c].filter((x) => x.c > e.c).length;
      if (better >= 12) continue;
      /* Nobody hands a roster spot to a man past 34 who can no longer play. */
      if (a >= 34 && s < 76) continue;
      let sc = clamp((e.c - bestAtPos(R, c, e.pos) + 6) / 12, 0, 1.2) + (better < 8 ? 0.4 : 0) + (better < 5 ? 0.3 : 0);
      if (a >= 29) sc += (clubNet(L, c) + 5) * 0.05;
      if (e.from === c) sc += 0.25;
      sc += r() * 0.35;
      if (sc > bs) { bs = sc; best = c; }
    }
    if (!best) { left.push(e); continue; }
    const yrs = dealYears(r, a, s);
    const sal = apron - pay[best] - ask < 0 ? round1(minDeal) : ask;
    e.k = Y + yrs - 1; e.sal = sal; delete e.pay; delete e.fa;
    R[best].push(e);
    pay[best] += sal;
    memoDrop(best);
    moved.add(e);
    news.push({ w: s - 78, k: 'fa', c: best, from: e.from, m: [e.n], win: 'summer', quiet: !(s >= 81 || best === L.team), t: e.n + ' signs a ' + NUMW[yrs] + '-year, ' + moneyWords(sal * yrs) + ' deal with the ' + nick(best) + '.' });
    delete e.from;
  }
  /* Who is left waits a summer, if he is real. An invented man nobody signs
     goes overseas and is gone. */
  L.league.pool = left.filter((e) => !e.g).map((e) => { e.fa = (e.fa || 0) + 1; delete e.from; return e; }).slice(0, 60);
}

/* ── trades ── */

/* What a club is doing: the best eight are trying to win now, the worst nine
   are building for later, the middle is a bit of both. */
function clubModes(L) {
  const by = CLUBS.slice().sort((a, b) => clubNet(L, b) - clubNet(L, a)), m = {};
  by.forEach((c, i) => { m[c] = i < 8 ? 'win' : i >= 21 ? 'rebuild' : 'mid'; });
  return m;
}
const vBase = (o) => Math.pow(Math.max(0, o - 58), 1.7) / 10;
/* Where he will be in two years, on the same curves devMan uses. */
function futOvr(e, Y) {
  const a = Y - e.b;
  let o = e.c;
  for (let k = 1; k <= 2; k++) { const x = a + k; o += x <= 29 ? Math.max(0, (e.pot || o) - o) * (LG_GROW[x] || 0) : -(LG_DECLINE[x] != null ? LG_DECLINE[x] : 4.5); }
  return o;
}
/* WHAT A MAN IS WORTH TO A CLUB. Now against later, weighted by what the club
   is doing, less what he is overpaid for the years left on his deal. So a
   contender pays for a veteran a rebuilding club would give away, and a
   rookie on a cheap deal is worth more than his overall says. */
function vMan(L, e, Y, mode) {
  if (MEMO) { const m = MEMO.v.get(e); if (m && m[mode] != null) return m[mode]; }
  const v = vManRaw(L, e, Y, mode);
  if (MEMO) { const m = MEMO.v.get(e) || {}; m[mode] = v; MEMO.v.set(e, m); }
  return v;
}
function vManRaw(L, e, Y, mode) {
  const a = Y - e.b, now = vBase(e.c), fut = vBase(futOvr(e, Y));
  const w = mode === 'win' ? 0.8 : mode === 'rebuild' ? 0.2 : 0.55;
  let v = now * w + fut * (1 - w);
  if (mode === 'rebuild' && a >= 29) v *= 0.6;
  if (mode === 'win' && a <= 21) v *= 0.85;
  const left = Math.max(1, (e.k || Y) - Y + 1);
  v -= (payY(L, e, Y) - dealPay(L, e.c, a, Y)) * left * 0.09;
  return v;
}
/* What a pick is worth: the ceiling its likely slot brings, less for a draft
   further out, more to a club that is rebuilding. */
function vPick(L, pk, Y, mode) {
  const n = Math.max(1, pk.d - Y + 1);
  let v = pk.r === 2 ? 0.35 : Math.max(1, vBase(potAt(pickSlot(L, pk, Y)) + 1) * 0.75);
  v *= Math.pow(0.9, n - 1);
  return v * (mode === 'rebuild' ? 1.35 : mode === 'win' ? 0.75 : 1);
}
const nickPoss = (c) => { const n = nick(c); return /s$/.test(n) ? n + '\'' : n + '\'s'; };
/* "a 2029 first-round pick", "the Kings' 2028 second-round pick", or for three
   or more, "three first-round picks and a second-round pick". */
function pickWords(picks, sender) {
  if (!picks.length) return [];
  const rd = (pk) => (pk.r === 1 ? 'first' : 'second') + '-round pick';
  if (picks.length >= 3) {
    const f = picks.filter((p) => p.r === 1).length, s = picks.length - f;
    const part = (n, w) => (n === 1 ? 'a ' + w + '-round pick' : NUMW[n] + ' ' + w + '-round picks');
    return [f ? part(f, 'first') : null, s ? part(s, 'second') : null].filter(Boolean);
  }
  return picks.slice().sort((a, b) => a.r - b.r || a.d - b.d).map((pk) => (pk.o === sender ? 'a ' + pk.d + ' ' : 'the ' + nickPoss(pk.o) + ' ' + pk.d + ' ') + rd(pk));
}
function assetWords(men, picks, sender) {
  const m = men.slice().sort((a, b) => b.c - a.c).map((e) => e.n);
  return listNames(m.concat(pickWords(picks, sender)));
}
/* The headline the way a newsroom writes it. */
function tradeText(L, s, sMen, sPicks, b, bMen, bPicks, how) {
  const got = bMen.length || bPicks.length ? ' for ' + assetWords(bMen, bPicks, b) : how === 'dump' ? ' to clear cap space' : ' for cash considerations';
  return 'The ' + nick(s) + ' have traded ' + assetWords(sMen, sPicks, s) + ' to the ' + nick(b) + got + '.';
}
/* A PACKAGE for T, from club b to club s. b's best man is never in it. The
   salaries match the way the league's rules make them: a club over the cap
   takes back no more than 125 percent of what it sends, plus a little. b adds
   what s values most for what it costs b, until s says yes, and b only does
   the deal if it thinks it won it too. */
function buildPackage(L, R, Y, b, s, T, modes, moved, lim) {
  lim = lim || {};
  const ms = modes[s], mb = modes[b], cap = capFor(Y);
  const want = vMan(L, T, Y, ms) * 1.06 + 0.3;
  const tSal = payY(L, T, Y);
  const payB = payroll(L, R, b, Y), payS = payroll(L, R, s, Y);
  const best = R[b].slice().sort((x, y) => y.c - x.c)[0];
  const men = R[b].filter((e) => e !== best && e !== T && !moved.has(e) && e.nt !== Y);
  const picks = picksOf(L, b, Y);
  const give = [], gp = [];
  let outSal = 0;
  const needOut = payB + tSal > cap ? (tSal - 0.25) / 1.25 : 0;
  const maxIn = (sal) => payS - tSal + sal <= cap || sal <= 1.25 * tSal + 0.25;
  const vs = () => give.reduce((a, e) => a + vMan(L, e, Y, ms), 0) + gp.reduce((a, p) => a + vPick(L, p, Y, ms), 0);
  const vb = () => give.reduce((a, e) => a + vMan(L, e, Y, mb), 0) + gp.reduce((a, p) => a + vPick(L, p, Y, mb), 0);
  const maxMen = lim.men || 2, maxPicks = lim.picks != null ? lim.picks : 3;
  /* The salary first, in as few bodies as it takes: the biggest salaries b
     can spare, a man it values at less than half of what it is getting. */
  const tv = vMan(L, T, Y, mb);
  const filler = men.filter((e) => vMan(L, e, Y, mb) < tv * 0.5).sort((x, y) => payY(L, y, Y) - payY(L, x, Y));
  for (const e of filler) {
    if (outSal >= needOut || give.length >= maxMen) break;
    if (!maxIn(outSal + payY(L, e, Y))) continue;
    give.push(e); outSal += payY(L, e, Y);
  }
  if (outSal < needOut) return null;
  /* Then the value, the best trade of value for cost first. */
  for (let k = 0; k < 9 && vs() < want; k++) {
    let pickA = null, pv = 0;
    for (const e of men) {
      if (give.indexOf(e) >= 0 || give.length >= maxMen || !maxIn(outSal + payY(L, e, Y))) continue;
      const a = vMan(L, e, Y, ms);
      if (a < 0.3) continue;
      const v = a / Math.max(0.2, vMan(L, e, Y, mb)) + Math.min(a, want - vs()) * 0.05;
      if (v > pv) { pv = v; pickA = { e }; }
    }
    for (const p of picks) {
      if (gp.indexOf(p) >= 0 || gp.length >= maxPicks) continue;
      const a = vPick(L, p, Y, ms);
      const v = a / Math.max(0.2, vPick(L, p, Y, mb)) + Math.min(a, want - vs()) * 0.05;
      if (v > pv) { pv = v; pickA = { p }; }
    }
    if (!pickA) break;
    if (pickA.e) { give.push(pickA.e); outSal += payY(L, pickA.e, Y); } else gp.push(pickA.p);
  }
  if (vs() < want) return null;
  /* b only says yes to a deal it thinks it won. */
  const tToB = T.you ? vMan(L, T, Y, mb) : vMan(L, T, Y, mb);
  if (tToB < vb() * 0.92) return null;
  /* Nobody sends away a man he just took, and a club still fields thirteen. */
  if (R[b].length - give.length + 1 < 12) return null;
  return { men: give, picks: gp };
}
/* Do the deal: men and picks change hands, and both clubs go on the log. */
function doTrade(L, R, Y, s, sMen, sPicks, b, bMen, bPicks, moved) {
  const F = fo(L);
  F.picks = F.picks || {};
  for (const e of sMen) { if (!e.you) moveMan(R, s, e, b); moved.add(e); }
  for (const e of bMen) { moveMan(R, b, e, s); moved.add(e); }
  for (const p of sPicks) F.picks[pickKey(p.d, p.r, p.o)] = b;
  for (const p of bPicks) F.picks[pickKey(p.d, p.r, p.o)] = s;
  if (sPicks.length || bPicks.length) F.pv = (F.pv || 0) + 1;
  memoDrop(s); memoDrop(b);
  /* A club past fifteen waives its last man. */
  for (const c of [s, b]) {
    while (R[c].length > 15) {
      const w = R[c].filter((e) => !moved.has(e)).sort((x, y) => x.c - y.c)[0] || R[c].slice().sort((x, y) => x.c - y.c)[0];
      R[c].splice(R[c].indexOf(w), 1);
      if (!w.g) (L.league.pool = L.league.pool || []).push(w);
    }
  }
}
function logTx(L, Y, kind, t, clubs, x) {
  const F = fo(L);
  F.tx = F.tx || [];
  const r = { y: Y, k: kind, t, c: clubs };
  /* Who moved, and when in the year, for the checks that hold a man to one
     move a window. */
  if (x && x.m) r.m = x.m;
  if (x && x.win) r.w = x.win;
  F.tx.push(r);
  if (F.tx.length > 160) F.tx.splice(0, F.tx.length - 160);
}
/* THE LEAGUE'S TRADES, a summer's or a deadline's. Each one is a story the
   real league tells every year:
     a contender buys a veteran from a club that is selling;
     a club over the tax pays somebody with picks to take a contract;
     two clubs swap players who fit the other better;
     and now and then a star on a losing club is moved for a haul.
   `skip` keeps a club out (yours, at the deadline, which has its own). */
function leagueTrades(L, R, Y, kind, rng, moved, news, skip) {
  const modes = clubModes(L), cap = capFor(Y);
  const target = kind === 'summer' ? 4 + Math.floor(rng() * 5) : 3 + Math.floor(rng() * 4);
  const ok = (c) => c !== skip;
  const can = (e) => !moved.has(e) && e.nt !== Y;
  const bestOf = (c) => R[c].slice().sort((x, y) => y.c - x.c)[0];
  let done = 0;
  const deal = (s, T, b, how, lim) => {
    if (!T || !b || s === b || !ok(s) || !ok(b)) return false;
    let pkg, sMen = [T], sPicks = [];
    if (how === 'dump') {
      /* The taker sends a cheap body or nothing; the dumping club adds picks
         until the taker thinks it is worth the money. */
      const tb = vMan(L, T, Y, modes[b]);
      const mine = picksOf(L, s, Y).sort((x, y) => vPick(L, y, Y, modes[b]) - vPick(L, x, Y, modes[b]));
      let v = tb;
      for (const p of mine) { if (v >= 0.4 || sPicks.length >= 2) break; sPicks.push(p); v += vPick(L, p, Y, modes[b]); }
      if (v < 0.4) return false;
      if (payroll(L, R, b, Y) + payY(L, T, Y) > cap * 1.05) return false;
      pkg = { men: [], picks: [] };
    } else {
      pkg = buildPackage(L, R, Y, b, s, T, modes, moved, lim);
      if (!pkg) return false;
    }
    const t = tradeText(L, s, sMen, sPicks, b, pkg.men, pkg.picks, how);
    doTrade(L, R, Y, s, sMen, sPicks, b, pkg.men, pkg.picks, moved);
    const w = Math.max(show(T.c), ...pkg.men.map((e) => show(e.c))) - 76 + pkg.picks.length * 0.6 + (how === 'star' ? 6 : 0);
    news.push({ w, k: 'trade', c: s, to: b, t, how, m: sMen.concat(pkg.men).map((e) => e.n), win: kind });
    done++;
    return true;
  };
  /* The star, once at most, and not every year. A man rated 86 or more, in his
     prime, on a club going nowhere, to whoever can pay. Never a kid. */
  if (rng() < (kind === 'summer' ? 0.4 : 0.05)) {
    const stars = [];
    const young = kind === 'summer' ? 25 : 27;
    for (const c of CLUBS) if (ok(c) && modes[c] !== 'win') for (const e of R[c]) if (can(e) && show(e.c) >= 86 && Y - e.b >= young && Y - e.b <= 31) stars.push([c, e]);
    if (stars.length) {
      const [s, T] = pick(rng, stars);
      const buyers = CLUBS.filter((c) => c !== s && ok(c)).sort(() => rng() - 0.5).slice(0, 12);
      for (const b of buyers) if (deal(s, T, b, 'star', { men: 3, picks: 4 })) break;
    }
  }
  for (let t = 0; t < 45 && done < target; t++) {
    const u = rng();
    const how = kind === 'summer' ? (u < 0.35 ? 'vet' : u < 0.55 ? 'dump' : 'swap') : (u < 0.55 ? 'vet' : u < 0.7 ? 'dump' : 'swap');
    if (how === 'vet') {
      const sellers = CLUBS.filter((c) => ok(c) && (modes[c] === 'rebuild' || (modes[c] === 'mid' && rng() < 0.4)));
      const s = pick(rng, sellers);
      if (!s) continue;
      /* A veteran, not a franchise: the stars move in the star story above. */
      const vets = R[s].filter((e) => can(e) && Y - e.b >= 27 && show(e.c) >= 77 && show(e.c) <= (kind === 'summer' ? 87 : 85) && (modes[s] === 'rebuild' || e !== bestOf(s)));
      const T = vets.length ? weighted(rng, vets, (e) => e.c - 60) : null;
      if (!T) continue;
      const buyers = CLUBS.filter((c) => c !== s && ok(c) && modes[c] !== 'rebuild' && R[c].filter((x) => x.c > T.c).length < 7)
        .sort((a, b) => (bestAtPos(R, a, T.pos) - bestAtPos(R, b, T.pos)) + (rng() - 0.5) * 6);
      for (const b of buyers.slice(0, 4)) if (deal(s, T, b, 'vet')) break;
    } else if (how === 'dump') {
      const over = CLUBS.filter((c) => ok(c) && payroll(L, R, c, Y) > cap * 1.2);
      const s = pick(rng, over);
      if (!s) continue;
      const bad = R[s].filter((e) => can(e) && (e.k || 0) > Y && payY(L, e, Y) - dealPay(L, e.c, Y - e.b, Y) >= 4 && e !== bestOf(s));
      const T = pick(rng, bad);
      if (!T) continue;
      const takers = CLUBS.filter((c) => c !== s && ok(c) && R[c].length < 15 && payroll(L, R, c, Y) + payY(L, T, Y) <= cap * 1.05);
      const b = pick(rng, takers);
      if (b) deal(s, T, b, 'dump');
    } else {
      const s = pick(rng, CLUBS.filter(ok));
      const pool = R[s].filter((e) => can(e) && show(e.c) >= 74 && show(e.c) <= 84 && Y - e.b <= 31 && e !== bestOf(s));
      const T = pick(rng, pool);
      if (!T) continue;
      const b = pick(rng, CLUBS.filter((c) => c !== s && ok(c) && bestAtPos(R, c, T.pos) < T.c));
      if (b) deal(s, T, b, 'swap', { men: 2, picks: 1 });
    }
  }
  return done;
}

/* ── the summer ── */

/* THE SUMMER, in the order the league runs it: everybody a year older, the
   retirements, the draft, the deals that end, free agency, the trades, and
   then every club trims or fills to thirteen to fifteen. */
function officeSummer(L, R, Y, beats, quiet) {
  const lg = L.league, F = fo(L), mine = L.stage === 'nba' && L.team;
  const rng = E.createSeededRNG(E.hashSeed(String(L.seed) + ':' + Y + ':office'));
  const news = [], moved = new Set();
  seasonWins(L, Y - 1);
  const pool = (lg.pool || []);
  for (const c of CLUBS) for (const e of R[c]) { initMan(L, e, Y - 1); devMan(L, e, Y); }
  for (const e of pool) { initMan(L, e, Y - 1); devMan(L, e, Y); }
  /* Your club as it was, so the career can answer what the summer did to it. */
  const was = (mine && !quiet && R[mine]) ? R[mine].map((e) => ({ n: e.n, c: e.c, pos: e.pos })) : null;
  const rs = lg.rs || 0;
  /* Retirements. Nobody leaves before the season he was signed for. */
  if (!rs || Y > rs) {
    for (const c of CLUBS) for (const e of R[c].slice()) {
      if (manRng(L, e, 'retire', Y)() >= retireP(e, Y, false)) continue;
      R[c].splice(R[c].indexOf(e), 1);
      const s = show(e.cp != null ? e.cp : e.c), yrs = e.dy ? Y - e.dy : null;
      if (s >= 80 || (yrs && yrs >= 14)) news.push({ w: s - 76 + (yrs ? yrs * 0.2 : 0), k: 'retire', c, t: e.n + ' retires' + (yrs && yrs >= 6 ? ' after ' + yrs + ' seasons' : ' at ' + (Y - 1 - e.b)) + '.' });
    }
    lg.pool = pool.filter((e) => manRng(L, e, 'retire', Y)() >= retireP(e, Y, true));
  }
  const taken = new Set();
  for (const c of CLUBS) for (const e of R[c]) taken.add(e.n);
  for (const e of lg.pool || []) taken.add(e.n);
  if (rs && Y - 1 >= rs) leagueDraft(L, R, Y, news, taken);
  const fas = (!rs || Y > rs) ? resignings(L, R, Y, news) : [];
  memoOpen();
  try {
    freeAgency(L, R, Y, fas, moved, news);
    leagueTrades(L, R, Y, 'summer', rng, moved, news, null);
  } finally { memoClose(); }
  /* Every club carries thirteen to fifteen. Past fifteen it waives its worst
     man it did not just add; short, it signs the best man left, and only
     invents a journeyman when nobody real is out there. */
  for (const c of CLUBS) {
    while (R[c].length > 15) {
      const w = R[c].filter((e) => !moved.has(e) && e.nt !== Y).sort((x, y) => x.c - y.c)[0] || R[c].slice().sort((x, y) => x.c - y.c)[0];
      R[c].splice(R[c].indexOf(w), 1);
      if (!w.g) lg.pool.push(w);
    }
  }
  lg.pool.sort((x, y) => y.c - x.c);
  for (const c of CLUBS.slice().sort((x, y) => R[x].length - R[y].length)) {
    while (R[c].length < 14 && lg.pool.length && show(lg.pool[0].c) >= 70) {
      const e = lg.pool.shift();
      e.k = Y; e.sal = round1(capFor(Y) * MIN_PCT); delete e.pay; delete e.fa;
      R[c].push(e); moved.add(e);
    }
    while (R[c].length < 13) {
      const r = E.createSeededRNG(E.hashSeed(String(L.seed) + ':vet:' + c + ':' + Y + ':' + R[c].length));
      const n = freshName(L, 'vet:' + c + ':' + Y + ':' + R[c].length, taken);
      const age = 25 + Math.floor(r() * 7), o = round1(56 + r() * 6);
      R[c].push({ n, pos: thinPos(R[c], pick(r, R_POS)), b: Y - age, w: 0, g: 1, d: Y - 3, c: o, cy: Y, cp: o, pot: o, k: Y, sal: round1(capFor(Y) * MIN_PCT) });
    }
  }
  lg.pool = lg.pool.slice(0, 60);
  for (const c of CLUBS) for (const e of R[c]) delete e.nt;
  if (was) teamSummerWatch(L, R, Y, was, news);
  /* The news: the biggest stories, and anything that touches your club. */
  news.sort((x, y) => y.w - x.w);
  const ours = (x) => mine && (x.c === L.team || x.to === L.team || x.from === L.team);
  const told = news.filter((x) => ours(x) && !x.quiet).slice(0, 3);
  for (const x of news.filter((y) => !y.quiet).slice(0, 2)) if (told.indexOf(x) < 0) told.push(x);
  /* Every move goes on the transaction log; the biggest and yours make the
     front page. */
  if (!quiet) for (const x of news) if (!x.quiet) logTx(L, Y, x.k, x.t, [x.c, x.to].filter(Boolean), x);
  const loud = news.filter((x) => !x.quiet);
  for (const x of quiet ? [] : loud.slice(0, 8).concat(loud.filter(ours))) {
    if (x.done) continue;
    x.done = 1;
    feed(L, x.k === 'trade' ? 'trade' : x.k === 'fa' ? 'fa' : x.k === 'draft' ? 'draft' : x.k === 'retire' ? 'retire' : 'move', x.t);
  }
  if (!quiet && beats && L.stage === 'nba') for (const x of told) {
    const o = ours(x);
    beats.push({ kind: 'news', text: (o ? 'Your club: ' : 'Around the league: ') + lowFirst(x.t), tone: '' });
    if (o) logIt(L, x.t, '');
  }
}
const lowFirst = (t) => (/^The /.test(t) ? 't' + t.slice(1) : t);

/* ── the deadline ── */

/* THE LEAGUE'S DEADLINE. Contenders buy, sellers sell, and a club over the
   tax pays somebody to take a contract. Your club has its own (deadlineClub).
   A club that got better plays better the rest of the way. */
function officeDeadline(L, beats, rng) {
  const R = rostNow(L), Y = L.year, F = fo(L);
  if (!R || !F) return;
  const before = {};
  for (const c of CLUBS) before[c] = rawOvr(R, c, Y);
  const news = [], moved = new Set();
  memoOpen();
  try { leagueTrades(L, R, Y, 'deadline', rng, moved, news, L.team); } finally { memoClose(); }
  renet(L, R, Y, before);
  news.sort((a, b) => b.w - a.w);
  news.forEach((x, i) => {
    feed(L, 'trade', x.t);
    logTx(L, Y, 'trade', x.t, [x.c, x.to], x);
    if (i < 2) beats.push({ kind: 'news', text: 'Deadline deal: ' + lowFirst(x.t), tone: '' });
  });
}
/* A club's strength off its rotation, the way rosterNets reads it. */
function rawOvr(R, c, Y) {
  const m = R[c].map((e) => manOvr(e, Y)).sort((a, b) => b - a);
  let v = 0;
  NET_WT.forEach((w, k) => { v += w * (m[k] != null ? m[k] : 60); });
  return v;
}
/* After a deadline, a club's net moves by what its roster gained, on the
   scale the summer's nets were drawn on. */
function renet(L, R, Y, before) {
  const sd = (fo(L).nz && fo(L).nz.sd) || 2;
  for (const c of CLUBS) {
    const d = rawOvr(R, c, Y) - before[c];
    if (Math.abs(d) > 0.01) L.league.net[c] = round1(clubNet(L, c) + d / sd * 4.6);
  }
}
/* Last season's standings, by conference, best first, for the News tab. */
function leagueTable(L) {
  const F = fo(L);
  if (!F || !F.rec) return null;
  const ys = Object.keys(F.rec).map(Number).sort((a, b) => b - a);
  const y = ys.find((x) => x < L.year || (L.phase === 'off' && x === L.year));
  if (y == null) return null;
  const W = F.rec[y], out = { y, E: [], W: [] };
  for (const c of CLUBS) out[confOf(c) === 'East' ? 'E' : 'W'].push([c, W[c], 82 - W[c]]);
  out.E.sort((a, b) => b[1] - a[1]); out.W.sort((a, b) => b[1] - a[1]);
  return out;
}
/* The transaction log, newest first. */
const transactions = (L) => ((fo(L) && fo(L).tx) || []).slice().reverse();
/* Club c's picks, said the way a GM would. */
function picksText(L, c) {
  const F = fo(L);
  if (!F) return '';
  const d0 = L.year;
  const P = picksOf(L, c, d0).sort((a, b) => a.d - b.d || a.r - b.r);
  const out = P.map((p) => p.d + ' ' + (p.r === 1 ? '1st' : '2nd') + (p.o !== c ? ' (' + p.o + ')' : ''));
  const gone = [];
  for (let d = d0; d <= d0 + 3; d++) for (const r of [1]) if (pickOwner(F, d, r, c) !== c) gone.push(d + ' 1st to ' + pickOwner(F, d, r, c));
  return { have: out, owe: gone };
}
/* Who is on club c in the current year, best first. */
/* EVERY PLAYER HAS AN OVERALL, ON YOUR SCALE. A man's worth is what he
   produces a season (win shares, measured off his real seasons and aged),
   and it is read onto the same 0 to 99 scale your own overall is on, fitted
   so a club's best man is about a 78, its fifth about a 69, its ninth about
   a 63, a star in the high 80s. The table was read off today's rosters by rank
   against where a career's overall sits: a typical rookie 62, a typical
   peak 75, a star's peak in the high 80s, so a rookie starts around the
   eighth man and a typical peak is a starter. Minutes, the starting five and
   a club's strength all compare these numbers, so a 77 in his second year
   plays behind the better players on his club. */
/* THE SCALE A PLAYER READS IS NBA 2K'S. Inside, every overall is the
   model's: a rookie about 62, a typical peak 75, an MVP 92, and every rule
   and balance band in this file is written on that. What is printed is
   that number on the 2K scale, which runs to 99 and is the one fans know:
   a rookie about a 75, a good starter in the mid 80s, the best men in the
   league 96 and 97. Fitted by putting today's league in order both ways
   (the model's reading of 450 men against their 2K27 ratings), so a man
   who ranks 30th reads what the 30th best 2K rating is. It is monotone, so
   nothing that compares two overalls can come out differently. */
const SHOW = [[0, 30], [30, 45], [45, 58], [55, 68], [60, 73], [62, 75], [65, 78], [68, 80], [72, 82], [75, 84], [78, 87], [81, 90], [84, 92], [87, 94], [90, 96], [93, 97.5], [96, 98.5], [99, 99]];
function lerpT(T, x, i, j) {
  if (x <= T[0][i]) return T[0][j];
  for (let k = 1; k < T.length; k++) if (x <= T[k][i]) { const a = T[k - 1], b = T[k]; return a[j] + (x - a[i]) / (b[i] - a[i]) * (b[j] - a[j]); }
  return T[T.length - 1][j];
}
/* Copy prints an overall on the 2K scale. */
function ovT(L, o) { return show(o); }
function show(o) { return o == null || isNaN(o) ? o : Math.round(lerpT(SHOW, o, 0, 1)); }
function showInv(o) { return round1(lerpT(SHOW, o, 1, 0)); }
const W_OVR = [[0, 54], [1, 59], [2.2, 63], [3.7, 69], [5.1, 74], [6.6, 78], [9.7, 85], [13, 90], [16, 94]];
function mateOvrX(w) {
  const x = Math.max(0, w);
  for (let k = 1; k < W_OVR.length; k++) if (x <= W_OVR[k][0]) {
    const [a, oa] = W_OVR[k - 1], [b, ob] = W_OVR[k];
    return oa + (x - a) / (b - a) * (ob - oa);
  }
  return W_OVR[W_OVR.length - 1][1];
}
function mateOvr(w) { return Math.round(mateOvrX(w)); }
/* The worth a man of this overall carries: W_OVR read backwards. */
function wFromOvr(o) {
  if (o <= W_OVR[0][1]) return W_OVR[0][0];
  for (let k = 1; k < W_OVR.length; k++) if (o <= W_OVR[k][1]) {
    const [a, oa] = W_OVR[k - 1], [b, ob] = W_OVR[k];
    return round1(a + (o - oa) / (ob - oa) * (b - a));
  }
  return W_OVR[W_OVR.length - 1][0];
}
/* A man the real ratings cover keeps his exact rating, moved only by what the
   years have done to him since; anybody else is read off his worth. */
function ovrOfMan(e, w) {
  if (!e.o) return mateOvr(w);
  return round1(showInv(e.o) + mateOvrX(w) - mateOvrX(e.w));
}
/* What a man is paid. His real salary for the season it is for; after that a
   market figure off his overall, because nobody here knows his next deal. */
function payOf(L, e, Y, w) {
  if (e.pay && Y <= (e.s || 0)) return e.pay;
  if (e.pay && !e.o && Y <= ((L.league && L.league.rs) || 0)) return e.pay;
  /* A deal he signed pays what it says until it ends. */
  if (e.sal != null && e.k != null && Y <= e.k) return e.sal;
  return marketPay(L, show(e.cy != null ? manOvr(e, Y) : ovrOfMan(e, w)), Y - e.b);
}
/* The 2026-27 market, read off the real salaries against the real ratings
   (the median pay at each overall): a minimum deal in the low 70s, about $11M
   at 79, about $32M at 84, a max from 90 up. A man past 35 takes less.
   Scaled with the cap after that season. */
const PAY_AT = [[60, 1.3], [70, 2.3], [74, 3.5], [76, 6], [79, 11], [81, 18], [84, 32], [87, 40], [90, 52], [93, 57], [99, 62]];
function marketPay(L, o, age) {
  let v = PAY_AT[PAY_AT.length - 1][1];
  for (let k = 1; k < PAY_AT.length; k++) if (o <= PAY_AT[k][0]) { const [a, va] = PAY_AT[k - 1], [b, vb] = PAY_AT[k]; v = va + (Math.max(o, a) - a) / (b - a) * (vb - va); break; }
  if (age >= 35) v = Math.min(v, 12);
  const y = L.year || 2027;
  /* Nobody is paid more than the max: 35 percent of the cap. */
  return round1(Math.min(v * (capFor(y) / capFor(2027)), capFor(y) * 0.35));
}
function matesOf(L, c) {
  const lg = L.league;
  const Y = L.year;
  const R = rostNow(L);
  if (R && R[c]) return R[c].filter((e) => !rostGone(L, e, Y)).map((e) => {
    const w = rostCurW(e, Y);
    const m = { n: e.n, pos: e.pos, age: Y - e.b, w, ovr: e.cy != null ? round1(manOvr(e, Y)) : ovrOfMan(e, w), real: e.g ? 0 : 1, pay: payOf(L, e, Y, w) };
    if (e.k != null) m.yrs = Math.max(0, e.k - Y + 1);
    if (e.pk) m.pk = e.pk;
    /* A young man's ceiling, as a grade (potGrade). Past 25 it is who he is. */
    if (e.pot != null && Y - e.b <= 25) m.pg = potGrade(Math.max(e.pot, m.ovr));
    return m;
  }).sort((a, b) => b.ovr - a.ovr || b.w - a.w);
  const out = [];
  const base = lg.roster && lg.roster[c];
  if (base) {
    for (const p of base) {
      const age = Y - p[2];
      if (!rostGone(L, { n: p[0], b: p[2], w: p[3] }, Y)) out.push({ n: p[0], pos: p[1], age, w: p[3] * (age <= 30 ? 1 : 1 - (age - 30) * 0.08), real: 1 });
    }
  } else {
    const age = 27 + Y - ((lg.latest || 2026) + 1);
    if (age <= 35) for (const n of (lg.stars && lg.stars[c]) || []) out.push({ n, pos: '', age, w: 6, real: 1 });
  }
  for (let d = (lg.rs || lg.latest || 2026) + 1; d <= Y; d++) {
    if (Y - d >= 10) continue;
    const r = E.createSeededRNG(E.hashSeed(String(L.seed) + ':rook:' + c + ':' + d));
    const n = pick(r, FIRST) + ' ' + pick(r, PEOPLE_LAST);
    const peak = r() < 0.08 ? 9 : 1.5 + r() * 4;
    const yrs = Y - d;
    out.push({ n, pos: pick(r, R_POS), age: 20 + yrs, w: round1(peak * Math.min(1, 0.35 + yrs * 0.2)), real: 0 });
  }
  for (const m of out) m.ovr = mateOvr(m.w);
  return out.sort((a, b) => b.w - a.w);
}
/* School teammates are generated, keyed on the school and the year. */
function amMates(L) {
  const school = L.am ? (L.am.college || (L.am.hs && L.am.hs.name) || 'school') : 'school';
  const out = [];
  for (let k = 0; k < 8; k++) {
    const r = E.createSeededRNG(E.hashSeed(String(L.seed) + ':ammate:' + school + ':' + (L.year - (k % 4)) + ':' + k));
    out.push({ n: pick(r, FIRST) + ' ' + pick(r, PEOPLE_LAST), pos: pick(r, R_POS), age: L.age + (k % 3) - 1, w: 5 - k * 0.4, real: 0 });
  }
  return out;
}
function myMates(L) {
  if (L.stage !== 'nba') return amMates(L);
  if (!L.team) return amMates(L);
  return matesOf(L, L.team);
}
