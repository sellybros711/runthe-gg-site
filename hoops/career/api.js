// ─── public ─────────────────────────────────────────────────────────────────

/* The one copy of the Career board's name rule (130's p_player check): a
   letter, then letters, spaces, an apostrophe, a stop or a hyphen, 28 at most.
   The builder asks it while the name is typed, so a name the board will drop
   is said before the career starts rather than discovered at retirement.
   cleanName is what the builder offers instead: the same letters with
   everything the rule refuses taken out. */
const NAME_RULE = /^[\p{L}][\p{L} .'-]{0,27}$/u;
function boardName(n) { return NAME_RULE.test(String(n || '')); }
function cleanName(n) {
  return String(n || '').replace(/[^\p{L} .'-]/gu, '').replace(/^[^\p{L}]+/u, '').replace(/\s+/g, ' ').trim().slice(0, 28).trim();
}
function view(L) {
  const s = L.season;
  return {
    ovr: ovrOf(L), pot: L.pot, role: s && s.role ? s.role : (L.team ? roleOf(L) : null),
    line: s && s.gp ? perGame(s) : null, record: s ? { w: s.w, l: s.l } : null,
    next: nextLabel(L), totals: totals(L), cap: capFor(L.year),
    coach: myCoach(L), mates: myMates(L).slice(0, 4).map((m) => m.n), wire: (L.flags.wire || []).slice(),
  };
}

/* Whether high school and college were played rather than generated. */
function amPlayed(L) { return (L.amHist || []).length > 0 && !(L.opt && L.opt.gen); }

/* What a finished life adds up to, for badges.js' careerFeats and the board.
   Plain numbers and flags, so neither of those needs this file. */
function featSummary(L) {
  const f = L.final || legacy(L), T = f.totals;
  const teams = new Set(L.history.map((h) => h.t));
  return {
    seasons: T.seasons, pts: T.pts, rings: T.rings, mvp: T.mvp, fmvp: T.fmvp, star: T.star, dpoy: T.dpoy,
    score: f.score, pick: (L.draft && L.draft.pick) || 0, undrafted: !!(L.draft && !L.draft.pick),
    /* High school and college count only when they were PLAYED, which is Pro.
       A generated road is the backstory a free career starts from, so it earns
       nothing: Career is about the NBA. */
    road: amPlayed(L), ncaa: amPlayed(L) ? T.ncaa || 0 : 0, state: amPlayed(L) ? T.state || 0 : 0, npoy: amPlayed(L) ? T.npoy || 0 : 0,
    jersey: !!f.jersey, oneClub: teams.size === 1, g7: L.flags.g7 || 0,
    rivalBeat: !!(L.rival && T.seasons >= 5 && T.pts > L.rival.pts), married: lifeOf(L).rel === 'married', kids: lifeOf(L).kids,
    home: !!L.flags.home, headCoach: /head coach/.test(f.after || ''), olympic: T.olympic,
  };
}

/* The last college a road career played for, or null. */
function lastSchool(L) {
  let s = null;
  for (const h of L.amHist || []) if (h.lvl === 'NCAA' && h.school) s = h.school;
  return s;
}
/* WHAT THE CAREER BOARD IS SENT, and nothing it works out for itself. The
   score is not in here: rtf_submit_career derives it from these totals with
   legacyScore's own arithmetic, so a page cannot file a number its career
   did not earn. Only a career that reached the league is filed. */
function boardSummary(L) {
  if (!L || !L.history || !L.history.length) return null;
  /* A career banned for life is off the wall, and off the board with it: the
     board reads a verdict off the score, and would call it a Journeyman. */
  if (L.flags && L.flags.banned) return null;
  const f = L.final || legacy(L), T = f.totals;
  const clubs = [];
  for (const h of L.history) if (h.t && clubs.indexOf(h.t) < 0) clubs.push(h.t);
  let peak = 0;
  for (const h of L.history) if (h.gp >= 20 && h.pts > peak) peak = h.pts;
  return {
    id: String(L.seed),
    /* The board refuses a name that is not letters, spaces, an apostrophe, a
       stop or a hyphen, so one that is not goes as no name rather than taking
       the whole career off the board. */
    name: boardName(L.name) ? L.name : null,
    pos: L.pos, num: L.num,
    road: (L.amHist || []).length > 0, college: lastSchool(L),
    pick: (L.draft && L.draft.pick) || 0,
    from: L.history[0].y, to: L.history[L.history.length - 1].y,
    seasons: T.seasons, gp: T.gp, pts: T.pts, reb: T.reb, ast: T.ast,
    rings: T.rings, mvp: T.mvp, fmvp: T.fmvp, an: T.an, an1: T.an1, star: T.star,
    dpoy: T.dpoy, roy: T.roy, olympic: T.olympic, ncaa: T.ncaa || 0, npoy: T.npoy || 0, aa1: T.aa1 || 0,
    clubs, jersey: f.jersey || null, peak: Math.round(peak * 10) / 10,
  };
}

/* The colours you are wearing right now. */
function colorsOf(L) {
  if (isAm(L)) {
    if (L.am.level === 'hs') return { primary: L.am.hs.c1, secondary: L.am.hs.c2 };
    if (L.am.level === 'col' && SCHOOL_BY[L.am.college]) return { primary: SCHOOL_BY[L.am.college].c1, secondary: SCHOOL_BY[L.am.college].c2 };
    return { primary: '#2b3242', secondary: '#c9ccd6' };
  }
  if (L.team && E.clubSkin) { const k = E.clubSkin(L.team); return { primary: k.primary, secondary: k.secondary }; }
  return { primary: '#2b3242', secondary: '#c9ccd6' };
}
/* Where you are on the road, in two lines, for the identity card and the hero. */
function roadView(L) {
  if (!isAm(L)) return null;
  const a = L.am;
  if (a.level === 'hs') return { where: a.hs.name, level: 'High school', what: GRADE[a.grade][0].toUpperCase() + GRADE[a.grade].slice(1), sub: rankText(a.rank) };
  if (a.level === 'col') return { where: a.college, level: 'College', what: CYEAR[a.cyear][0].toUpperCase() + CYEAR[a.cyear].slice(1) + ' at ' + a.college,
    sub: draftTalk(projectedPick(L, a.stock || 0)) };
  return { where: a.route === 'intl' ? 'Overseas' : 'G League', level: 'Pro', what: a.route === 'intl' ? 'A year overseas' : 'A year in the G League', sub: 'The draft is next' };
}


/* CHALLENGE CAREERS (Phase E). A challenge is a goal laid over an ordinary
   career, and sometimes a start or a difficulty it fixes. `test` reads what
   the career has done and `out` says when it can no longer be met, so the
   screen can say so while the career plays on. Met or not is decided when the
   career ends, and a challenge met is kept in the Vault. */
const regGames = (L) => L.history.reduce((n, h) => n + (h.gp || 0), 0);
const clubsOf = (L) => new Set(L.history.map((h) => h.t)).size;
const CHALLENGES = {
  ch_city: { name: 'One city', blurb: 'Play twelve seasons and every one for the same team.',
    test: (L) => L.history.length >= 12 && clubsOf(L) === 1, out: (L) => clubsOf(L) > 1,
    prog: (L) => L.history.length + ' of 12 seasons' + (clubsOf(L) > 1 ? ', but not with one team' : '') },
  ch_rings: { name: 'Two rings', blurb: 'Win two championships.',
    test: (L) => totals(L).rings >= 2, prog: (L) => totals(L).rings + ' of 2 rings' },
  ch_30k: { name: 'The 30,000 club', blurb: 'Score 30,000 points in the regular season.',
    test: (L) => totals(L).pts >= 30000, prog: (L) => totals(L).pts.toLocaleString('en-US') + ' of 30,000 points' },
  ch_mvp: { name: 'Most valuable', blurb: 'Win an MVP.',
    test: (L) => totals(L).mvp >= 1, prog: (L) => totals(L).mvp ? 'Done' : 'No MVP yet' },
  ch_late: { name: 'Second round', blurb: 'Start low on the board. Drafted late or not at all, make an All-Star team.', stock: -9,
    test: (L) => !!L.draft && (!L.draft.pick || L.draft.pick > 30) && totals(L).star >= 1,
    out: (L) => !!(L.draft && L.draft.pick && L.draft.pick <= 30),
    prog: (L) => !L.draft ? 'Draft night is ahead' : L.draft.pick && L.draft.pick <= 30 ? 'Drafted too high' : totals(L).star ? 'Done' : 'No All-Star yet' },
  ch_lockdown: { name: 'Lockdown', blurb: 'Win Defensive Player of the Year twice.',
    test: (L) => totals(L).dpoy >= 2, prog: (L) => totals(L).dpoy + ' of 2' },
  ch_stars: { name: 'Ten All-Star games', blurb: 'Make ten All-Star teams.',
    test: (L) => totals(L).star >= 10, prog: (L) => totals(L).star + ' of 10' },
  ch_iron: { name: 'Iron man', blurb: 'Play 1,200 regular season games.',
    test: (L) => regGames(L) >= 1200, prog: (L) => regGames(L).toLocaleString('en-US') + ' of 1,200 games' },
  ch_hard: { name: 'The hard way', blurb: 'On Hard, make the Hall of Fame.', diff: 'hard',
    test: (L) => !!(L.final && L.final.ending && L.final.ending.hof), prog: (L) => L.retired ? (L.final && L.final.ending && L.final.ending.hof ? 'Done' : 'Not in') : 'The voters decide at the end' },
};
const CHALLENGE_KEYS = Object.keys(CHALLENGES);
/* A challenge that starts you low on the board does it once, at the combine. */
function chStock(L) {
  const c = L.challenge && CHALLENGES[L.challenge];
  if (!c || !c.stock || L.flags.chStock) return;
  L.flags.stock = (L.flags.stock || 0) + c.stock;
  L.flags.chStock = 1;
}
/* Where a career stands on its challenge, for the screen and the Vault. */
function challengeOf(L) {
  const c = L && L.challenge && CHALLENGES[L.challenge];
  if (!c) return null;
  const met = !!c.test(L);
  return { id: L.challenge, name: c.name, blurb: c.blurb, met, out: !met && !!(c.out && c.out(L)), prog: c.prog(L) };
}

// ─── the generated road (Phase E) ───────────────────────────────────────────

/* A GUEST OR A FREE ACCOUNT STARTS ON DRAFT NIGHT, AND THE ROAD THERE IS
   REAL. It is the high school start, played out by an automatic policy that
   answers every card off the career's own seed, and stopped at the combine.
   So no two launching points are the same, the memories, people and routes
   the road made carry on into the league, and the NBA outcomes sit inside the
   road's own measured bands (check-career section 8). Playing the road
   yourself is Run The Floor Pro. */
function generateRoad(opts) {
  const o = Object.assign({}, opts || {}, { start: 'hs' });
  const seed = o.seed != null ? String(o.seed) : String(Math.floor(Math.random() * 1e9));
  for (let k = 0; k < 4; k++) {
    o.seed = k ? seed + ':r' + k : seed;
    const L = newLife(o);
    L.opt.gen = 1;
    let g = 0;
    while (g++ < 1500 && !L.retired) {
      if (L.pending.length) {
        const c = L.pending[0];
        if (c.id === 'combine') return L;
        choose(L, Math.floor(rngAt(L, 'gen:' + L.steps + ':' + c.id)() * c.options.length));
      } else step(L);
    }
  }
  /* Never measured to happen; a draft night start is still a career. */
  return newLife(Object.assign({}, opts, { start: 'draft', seed }));
}
/* The road a generated career took, in a handful of short lines, for the
   screen that opens it and for the career story. Read off the seasons played,
   so it is the same on a reload and on another device. */
function roadStory(L) {
  const H = L.amHist || [];
  if (!H.length) return [];
  const out = [];
  const hs = H.filter((h) => h.lvl === 'HS');
  if (hs.length) {
    const school = hs[hs.length - 1].school;
    const best = Math.min(...hs.map((h) => h.rank || 999));
    out.push((hs.length === 1 ? 'One season' : numWord(hs.length) + ' seasons') + ' at ' + school + '.');
    out.push(best > 600 ? 'Nobody ranked you.' : 'A ' + starsOf(best) + '-star recruit. #' + best + ' in the class.');
    const st = hs.filter((h) => /State champion/.test(h.finish)).length;
    if (st) out.push(st === 1 ? 'A state title.' : numWord(st) + ' state titles.');
    if (hs.some((h) => (h.aw || []).indexOf('hs_mrbb') >= 0)) out.push('Mr. Basketball.');
  }
  if (recall(L, 'route.reclass')) out.push('You reclassified and skipped a year.');
  if (recall(L, 'route.prep')) out.push('A prep school year first.');
  if (recall(L, 'route.gap')) out.push('A gap year to train.');
  if (recall(L, 'route.juco') || H.some((h) => h.lvl === 'Junior college')) out.push('Junior college before the big stage.');
  if (recall(L, 'route.walkon')) out.push('A walk-on. Nobody promised you anything.');
  const col = H.filter((h) => h.lvl === 'NCAA');
  if (col.length) {
    const schools = [];
    col.forEach((h) => { if (schools.indexOf(h.school) < 0) schools.push(h.school); });
    out.push((col.length === 1 ? 'One season at ' : numWord(col.length) + ' seasons at ') + schools.join(', then ') + '.');
    const rank = (f) => f === 'National champion' ? 9 : Math.max(-1, NCAA_ROUNDS.findIndex((r) => f === 'Lost in the ' + r));
    const top = col.slice().sort((a, b) => rank(b.finish) - rank(a.finish))[0];
    if (top && top.finish === 'National champion') out.push('National champions.');
    else if (top && rank(top.finish) >= 4) out.push('A run to the ' + NCAA_ROUNDS[rank(top.finish)] + '.');
    else if (!col.some((h) => h.seed)) out.push('Never made the tournament.');
    if (col.some((h) => (h.aw || []).indexOf('c_npoy') >= 0)) out.push('National Player of the Year.');
    else if (col.some((h) => (h.aw || []).indexOf('c_aa1') >= 0)) out.push('First team All-American.');
  }
  H.forEach((h) => {
    if (h.lvl === 'Overseas') out.push('A season as a pro overseas.');
    else if (h.lvl === 'G League') out.push('A season as a pro in the G League.');
    else if (h.lvl === 'Rec league') out.push('A rec league season. Somebody filmed it.');
  });
  const p = projectedPick(L);
  out.push(p > 60 ? 'Now the combine. Nobody has you on the board.' : 'Now the combine. The board has you around ' + ordinal(p) + '.');
  return out;
}
const NUMWORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'];
/* A count as a word up to six and as a number after: eight rings is "8 rings". */
const numWord = (n) => NUMWORDS[n] || String(n);

/* THE WRITTEN CAREER STORY (Phase E), kept on the Hall card and read in the
   Vault. It is built from what the career recorded, never from a template
   that could say something the career did not do, and it is written to the
   player in short sentences. Called by the page when a career ends, so it
   moves nothing the season reads. */
function careerStory(L) {
  const f = L.final || legacy(L);
  const H = L.history, T = totals(L), d = L.draft || {};
  const out = [];
  const start = [];
  if (L.parent) start.push('Your father was ' + L.parent.name + '. ' + L.parent.verdict + '.');
  if (L.origin && ORIGINS[L.origin] && !L.parent) start.push(ORIGINS[L.origin].name + '.');
  const road = roadStory(L).slice(0, -1);
  if (road.length) start.push(road.join(' '));
  else if (BACKGROUNDS[L.bg] && !L.amHist.length) start.push(BACKGROUNDS[L.bg].name + '.');
  if (start.length) out.push({ h: 'Where it started', p: start.join(' ') });
  if (!H.length) {
    out.push({ h: 'The league', p: d.pick ? 'Drafted ' + ordinal(d.pick) + ' by the ' + nick(d.team) + '. You never played a game.' : 'The league never called.' });
  } else {
    const dr = d.pick ? 'The ' + nick(d.team) + ' took you ' + ordinal(d.pick) + ' in ' + (H[0].y - 1) + '.' : 'Undrafted in ' + (H[0].y - 1) + '. You signed anyway.';
    const clubs = [];
    H.forEach((h) => { if (h.t && clubs.indexOf(h.t) < 0) clubs.push(h.t); });
    const best = H.slice().sort((a, b) => b.pts - a.pts)[0];
    const lg = [dr, H.length + (H.length === 1 ? ' season' : ' seasons') + (clubs.length === 1 ? ', all with the ' + nick(clubs[0]) + '.' : ' with ' + clubs.length + ' teams.'),
      'Your best year was ' + (best.y - 1) + '-' + String(best.y).slice(2) + ': ' + best.pts + ' points a night for the ' + nick(best.t) + '.'];
    const aw = [];
    if (T.mvp) aw.push(T.mvp === 1 ? 'an MVP' : T.mvp + ' MVPs');
    if (T.star) aw.push(T.star + (T.star === 1 ? ' All-Star game' : ' All-Star games'));
    if (T.dpoy) aw.push(T.dpoy === 1 ? 'a Defensive Player of the Year' : T.dpoy + ' Defensive Player of the Year awards');
    if (aw.length) lg.push('You won ' + (aw.length > 1 ? aw.slice(0, -1).join(', ') + ' and ' + aw[aw.length - 1] : aw[0]) + '.');
    out.push({ h: 'The league', p: lg.join(' ') });
    const champs = H.filter((h) => h.po === 'Champion');
    const fin = H.filter((h) => h.po === 'Finals').length;
    if (champs.length) {
      const by = {};
      champs.forEach((h) => { (by[h.t] = by[h.t] || []).push(h.y); });
      const p = Object.keys(by).map((c) => (by[c].length === 1 ? 'A ring' : numWord(by[c].length) + ' rings') + ' with the ' + nick(c) + ' (' + by[c].join(', ') + ').');
      if (T.fmvp) p.push(T.fmvp === 1 ? 'Finals MVP once.' : 'Finals MVP ' + T.fmvp + ' times.');
      if (fin) p.push(fin === 1 ? 'One more Finals you lost.' : fin + ' more Finals you lost.');
      out.push({ h: 'The rings', p: p.join(' ') });
    } else if (fin) out.push({ h: 'The rings', p: fin === 1 ? 'You reached one Finals and lost it.' : 'You reached ' + fin + ' Finals and lost every one.' });
    else if (H.some((h) => h.po !== 'Missed' && h.po !== 'Play-in')) out.push({ h: 'The rings', p: 'No ring. You never reached the Finals.' });
    else out.push({ h: 'The rings', p: 'You never played a playoff series.' });
    const M = memories(L).slice(-3);
    if (M.length) out.push({ h: 'What people remember', p: M.map((m) => m.t).join(' ') });
    const last = H[H.length - 1];
    const end = ['You retired at ' + last.age + ', ' + T.pts.toLocaleString('en-US') + ' points in all.', f.verdict + '.'];
    if (f.ending) {
      end.push(f.ending.tierName + '.');
      if (f.ending.secretName) end.push(f.ending.secretName + '.');
    }
    if (L.parent) end.push(T.pts > L.parent.pts ? 'You passed your father\'s ' + L.parent.pts.toLocaleString('en-US') + ' points.' : 'Your father finished with more points: ' + L.parent.pts.toLocaleString('en-US') + '.');
    out.push({ h: 'The end', p: end.join(' ') });
  }
  if (f.epilogue) out.push({ h: 'Years later', p: f.epilogue });
  return out;
}

/* A LEGACY CAREER IS YOUR SON (Phase E, Run The Floor Pro). His father is a
   career this account finished, so `L.parent` is a short copy of that Hall
   card and the son is a story career with the Son of a former pro origin
   built on it: the father's real points are the mark to pass, his name is
   the {father} on every card, and the seasons he played are the ones the
   copy counts. A father is invented like his son, so the real-people rule
   is untouched. */
function cleanParent(p) {
  if (!p || typeof p !== 'object' || !p.name) return null;
  const n = (v, d) => Number.isFinite(+v) ? +v : d;
  return {
    id: String(p.id || ''), name: String(p.name).slice(0, 28), num: n(p.num, null), pos: POS.indexOf(p.pos) >= 0 ? p.pos : null,
    pts: Math.max(0, Math.round(n(p.pts, 0))), seasons: Math.max(0, Math.round(n(p.seasons, 0))), score: n(p.score, 0),
    verdict: String(p.verdict || 'A pro'), rings: n(p.rings, 0), star: n(p.star, 0), hof: !!p.hof,
    end: n(p.end, 0) || null, age: n(p.age, 0) || null,
    clubs: Array.isArray(p.clubs) ? p.clubs.filter((c) => CLUBS.indexOf(c) >= 0).slice(0, 12) : [],
    jersey: CLUBS.indexOf(p.jersey) >= 0 ? p.jersey : null, gen: Math.max(1, Math.round(n(p.gen, 1))),
  };
}
/* THE SON STARTS IN HIS OWN YEAR, in the league his father left. The father's
   card keeps the league as it stood when he retired (the coaches, the nets,
   the invented stars, the champions), and the years between his last season
   and his son's sophomore year are played forward a summer at a time, so a
   coach the father played for can still be on a bench and a star he played
   against is an old man. Without that copy (a card from before Phase E) the
   league is played forward from the data's own year. */
const LEGACY_LEAGUE = ['net', 'coach', 'free', 'gone', 'gen', 'figs', 'champs', 'dyn', 'news', 'my', 'cy'];
function legacyLeague(L, p, lg, age) {
  L.parent = p;
  L.opt.legacy = 1;
  const r = E.createSeededRNG(E.hashSeed(L.seed + ':born'));
  const fatherAt = 24 + Math.floor(r() * 10);
  const end = p.end || L.year;
  const start = Math.max(end + 1, end + fatherAt + age - (p.age || 34));
  let from = L.year;
  if (lg && typeof lg === 'object') {
    for (const k of LEGACY_LEAGUE) if (lg[k] != null) L.league[k] = JSON.parse(JSON.stringify(lg[k]));
    if (lg.y) from = lg.y;
  }
  for (let y = from + 1; y < start && y - from < 80; y++) { L.year = y; driftLeague(L, []); }
  L.year = start;
}
/* What a finished career leaves for a son: the league as it stood. */
function leagueEnd(L) {
  const out = { y: L.year };
  for (const k of LEGACY_LEAGUE) if (L.league[k] != null) out[k] = L.league[k];
  return out;
}
const fatherYears = (L) => L.parent ? L.parent.seasons : 9;
const yearsWord = (n) => n === 1 ? 'one season' : (NUMWORDS[n] ? NUMWORDS[n].toLowerCase() : n) + ' seasons';

const publicAPI = {
  generateRoad, tradeTo, roadStory, careerStory, cleanParent, leagueEnd, LEGACY_LEAGUE,
  DIFFS, DIFF_KEYS, CHALLENGES, CHALLENGE_KEYS, challengeOf,
  CAREER_API_VERSION, LIFE_VERSION,
  CONF, CLUBS, confOf, POS, POS_NAME, RATINGS, RATING_NAME, RATING_SHORT, WEIGHTS,
  ARCHES, ARCH_KEYS, POS_ARCHES, archesFor, archBase, POS_SIZE, wtFor, wtRange, sizeOf, sizeTilt, heightText, BACKGROUNDS, BG_KEYS, AGENTS, AWARD_NAME, ROUNDS, VERDICTS, EVENTS,
  perfOf, coachStyle, COACH_STYLES, needAt, coachTalkCard, tradeDeadline, youW, weakSpot,
  picksText, leagueTable, transactions, clubModes, TEAM_EV, TEAM_KINDS,
  seedLeague, normaliseNets, newLife, rotationOf, clubView, bestFive, fitAt, rostOf, rostNow, randomName, overall, ovrOf, step, choose, nextLabel,
  view, perGame, totals, legacy, legacyScore, clubNet, clubTier, rotationBar,
  roleOf, effOvr, CLEAR_GAP, lineMeans, capFor, marketSalary, projectedPick, draftOrder, money, ordinal,
  clutchOptions, offers, ACTS, actsOpen, act, retireNow, lifeOf, lifeLine, sonsOf, rivalOn, featSummary, boardSummary, boardName, cleanName, verdictOf,
  SCHOOLS, SCHOOL_BY, TIER_NAME, AM_EVENTS, HS_ROUNDS, NCAA_ROUNDS, GRADE, CYEAR, AGE_HS,
  isAm, colorsOf, bracketOf, roadView, nationalRank, rankText, starsOf, draftTalk, collegeOffers, schoolNet,
  LOOK_KEYS, cleanLook, setLook, TONES, PRESSERS, PERSONAS, EVENT_REP, repOf, personaOf, presserCard,
  COACHES_NOW, COACH_POOL, COACH_NAMES, PEOPLE_M, PEOPLE_F, PEOPLE_X, PEOPLE_LAST, FIRST, LAST, RIVAL_FIRST, RIVAL_LAST,
  coachState, coachOf, coachName, coachCarousel, myCoach, matesOf, mateOvr, show, showInv, marketPay, withRatings, clubOvr, myMates, personName, peopleKey, say, CLUBS,
  lockerOf, CAST, TRAITS, rollTraits, migrate, remember, recall, hasTrait, REAL_TOKENS, INVENTED_TOKENS, BASKETBALL_ONLY,
  STORY_VERSION, BAL, storyOn, recurs, figs, activeFigs, figOvr, mvpRace, legacyView, GOALS, OUTLETS, NICKS, feed, TRAIT_NAME, BADGES, badgeList, SIGS, archFit, trait, continuity, continuityLog, ARC_EVENTS, CALLBACKS, callback, memories, ago, relate, relOf, EVENT_REL, arcData, STORY_RECURS, STORY_PHASES, calendar, RARITY, EVENT_TAGS, REQ, reqOk, defineEvents,
  ORIGINS, ORIGIN_KEYS, ROUTES, routesOf, routeOn, HOF_TIERS, OUTCOMES, SECRETS, ENDING_COUNT, endingOf, STORY_EV, STORY_NBA, STORY_AM, evById, AFTER_PATHS, ALT_NAME,
};

if (typeof module !== 'undefined' && module.exports) module.exports = publicAPI;
if (typeof window !== 'undefined') window.RTF_CAREER = publicAPI;
