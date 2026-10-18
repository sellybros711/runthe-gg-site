// ─── the bench: your coach, your role and your minutes (story careers) ──────

/* EVERY COACH HAS A WAY OF DOING THINGS, seeded off his name so the same real
   coach is the same man in every career. It changes what he will hear in his
   office and what earns minutes in his rotation. */
const COACH_STYLES = {
  players: { name: "A players' coach", line: 'He talks things out. His door\'s always open.', ask: 0.1, cut: 0.7, young: 0, def: 0, fit: 0 },
  defense: { name: 'Defense first', line: 'You earn minutes on the defensive end.', ask: -0.05, cut: 1, young: 0, def: 1, fit: 0 },
  vets: { name: 'Trusts veterans', line: 'He trusts guys who\'ve shown up for years.', ask: 0, cut: 1, young: -0.12, def: 0, fit: 0 },
  youth: { name: 'Plays the kids', line: 'Young legs get his minutes.', ask: 0, cut: 1, young: 0.12, def: 0, fit: 0 },
  system: { name: 'A system coach', line: 'Everybody has a spot. Fit the system, you play.', ask: -0.05, cut: 1, young: 0, def: 0, fit: 0.15 },
};
const STYLE_KEYS = Object.keys(COACH_STYLES);
const styleKey = (L) => STYLE_KEYS[E.hashSeed('style:' + myCoach(L)) % STYLE_KEYS.length];
const coachStyle = (L) => COACH_STYLES[styleKey(L)];
/* What a coach sees: what you have done against what a man your size and
   skill should do in the minutes you have played. One is par. A coach who
   lives on defense counts your defense too. */
function perfOf(L) {
  const s = L.season;
  if (!s || s.gp < 6 || !s.tot.min) return 1;
  const role = roleOf(L), min = s.tot.min / s.gp;
  const m = lineMeans(L, min, usageOf(L, role));
  const pg = perGame(s);
  const want = m.pts + 0.5 * m.reb + 0.7 * m.ast;
  const got = pg.pts + 0.5 * pg.reb + 0.7 * pg.ast;
  /* The box score runs about four percent over the means it is drawn from
     (rounding, and no negative games), so par is centred on what the sim
     actually hands a man rather than on the formula. Over 1,100 stretches
     the middle eighty percent of players land between 0.95 and 1.15 of it. */
  let r = want > 0 ? got / want - 0.04 : 1;
  if (coachStyle(L).def) r += (L.rt.def - 62) / 120;
  return clamp(r, 0.4, 1.8);
}
const tsOf = (s) => { const t = s.tot; const d = 2 * (t.fga + 0.44 * t.fta); return d > 0 ? Math.round(t.pts / d * 1000) / 10 : 0; };
/* Where you could also play: the spot next to yours where the club is thin
   and your ratings travel. */
function otherSpot(L) {
  let best = null;
  for (const p of NEXT_POS[L.pos] || []) {
    const lose = ovrOf(L) - overall(L.rt, p);
    if (lose > 3) continue;
    const v = needAt(L, L.team, p) - needAt(L, L.team, L.pos) - lose * 0.03;
    if (!best || v > best.v) best = { p, v };
  }
  return best && best.v > 0.05 ? best.p : null;
}
/* The rating a coach tells you to work on: what your position asks for most
   that you have least of. */
function weakSpot(L) {
  const w = WEIGHTS[L.pos];
  return RATINGS.slice().sort((a, b) => (w[b] * (90 - L.rt[b])) - (w[a] * (90 - L.rt[a])))[0];
}
/* THE CONVERSATION. Not "ask for more" and a coin: the options are the ones
   your situation has, and each one tells you roughly what it will take. */
function coachTalkCard(L) {
  const s = L.season, role = roleOf(L), st = coachStyle(L), perf = perfOf(L);
  const pg = s && s.gp ? perGame(s) : null;
  const opener = pg
    ? 'You\'re at ' + pg.min + ' minutes and ' + pg.pts + ' points on ' + tsOf(s) + ' percent true shooting. The ' + nick(L.team) + ' are ' + s.w + '-' + s.l + '.'
    : 'Camp opens Tuesday. He\'s got you down for ' + Math.round(role.min) + ' minutes a night.';
  const read = perf >= 1.07 ? 'He likes what he\'s seeing.' : perf <= 0.95 ? 'He\'s seen the tape.' : 'He thinks you\'re about where you should be.';
  const opts = [];
  const odds = (p) => p >= 0.6 ? 'Good odds.' : p >= 0.4 ? 'Coin flip.' : p >= 0.2 ? 'Long shot.' : 'Not likely.';
  const pMore = coachP(L, 'more');
  if (role.min < 36) opts.push({ k: 'more', label: 'Ask for more minutes', hint: odds(pMore) + ' He\'ll go by the tape.' });
  if (!role.starter && role.min >= 12) opts.push({ k: 'start', label: 'Ask to start', hint: odds(coachP(L, 'start')) + ' Somebody loses his job.' });
  const spot = otherSpot(L);
  if (spot) opts.push({ k: 'pos', to: spot, label: 'Offer to play ' + POS_NAME[spot].toLowerCase(), hint: odds(coachP(L, 'pos')) + ' The ' + nick(L.team) + ' are thin there.' });
  if (role.starter && role.min >= 28) opts.push({ k: 'ball', label: 'Ask for the ball late', hint: odds(coachP(L, 'ball')) + ' More shots, more heat.' });
  if (role.starter && s && s.g && s.w < s.l) opts.push({ k: 'bench', label: 'Offer to come off the bench', hint: 'Team first. He won\'t forget.' });
  opts.push({ k: 'focus', label: 'Ask what to work on', hint: 'Free advice. He\'ll tell you straight.' });
  return {
    id: 'coach_talk', kind: 'event', key: 'coach_talk:' + L.year + ':' + (s ? s.g : 0), scene: 'Coach\'s office', eyebrow: st.name + ' · ' + myCoach(L),
    title: myCoach(L) + ' has ten minutes for you.', text: opener + ' ' + read + ' ' + st.line,
    ctx: { ks: opts.slice(0, 4).map((o) => o.k), to: spot },
    options: opts.slice(0, 4).map((o) => ({ label: o.label, hint: o.hint })),
  };
}
/* The answers to a talk with the coach (choose() runs them). */
ANSWER.coach_talk = function(L, card, i, opt, rng, beats, touch, touches) {
  let text = '', tone = '', made = null, won = null, shots = null, contest = null;
  text = chooseCoachTalk(L, card, i, rng);
  return { text, tone, made, won, shots, contest };
};
function coachP(L, k) {
  const role = roleOf(L), st = coachStyle(L), perf = perfOf(L);
  const ageAdj = L.age <= 24 ? st.young : L.age >= 30 ? -st.young : 0;
  const base = 0.2 + (L.m.trust - 50) * 0.008 + clamp(role.diff, -12, 12) * 0.012 + (perf - 1) * 0.9 + st.ask + ageAdj;
  if (k === 'more') return clamp(base + 0.1, 0.05, 0.88);
  if (k === 'start') return clamp(base - 0.08, 0.04, 0.8);
  if (k === 'pos') return clamp(0.35 + st.fit + needAt(L, L.team, (otherSpot(L) || L.pos)) * 0.4 + (L.m.trust - 50) * 0.005, 0.1, 0.9);
  if (k === 'ball') return clamp(base + (L.m.fame - 40) * 0.005, 0.05, 0.85);
  return 1;
}
function chooseCoachTalk(L, card, i, rng) {
  const k = card.ctx.ks[i], st = coachStyle(L), coach = myCoach(L);
  const p = coachP(L, k);
  const yes = rng() < p;
  L.flags.talks = (L.flags.talks || 0) + 1;
  if (k === 'focus') {
    const r = weakSpot(L);
    L.focus = { k: r, y: L.year };
    bump(L, { trust: 3 });
    return coach + ' doesn\'t hesitate: ' + RATING_NAME[r].toLowerCase() + '. Fix it and the minutes follow. That\'s your summer.';
  }
  if (k === 'bench') {
    bump(L, { min: -4, trust: 10, morale: -2, win: 0.4 });
    relate(L, 'tvet', 6, 'You gave up your starting spot.');
    remember(L, 'role.sacrifice', true);
    return coach + ' stares a second, then shakes your hand. You run the second unit. Everybody\'s better.';
  }
  if (k === 'more') {
    if (yes) { bump(L, { min: 4, trust: 2 }); return coach + ' gives you four more minutes a night. Now keep them.'; }
    bump(L, { trust: -4 * st.cut, morale: -2 });
    return 'He wants to see more first. It\'s a short meeting.';
  }
  if (k === 'start') {
    if (yes) { bump(L, { min: 8, trust: 2 }); remember(L, 'role.won', L.year); return coach + ' puts you with the first five Monday. You don\'t give it back.'; }
    bump(L, { trust: -5 * st.cut, morale: -3 });
    return 'Not yet. He shows you what the starter does that you don\'t. He\'s not wrong.';
  }
  if (k === 'pos') {
    const to = card.ctx.to;
    if (yes && to) { const was = L.pos; L.arch = archForPos(L, to); L.pos = to; bump(L, { min: 3, trust: 4 }); logIt(L, 'Moved from ' + POS_NAME[was].toLowerCase() + ' to ' + POS_NAME[to].toLowerCase() + '.', 'good'); return coach + ' draws it up on the whiteboard. You\'re a ' + POS_NAME[to].toLowerCase() + ' now, with minutes waiting.'; }
    bump(L, { trust: -2 });
    return 'He needs you right where you are. He means it as a compliment.';
  }
  if (k === 'ball') {
    if (yes) { bump(L, { usage: 0.025, trust: 2, fame: 2 }); remember(L, 'role.closer', L.year); return 'The last play of every close game is yours now. ' + coach + ' wants it made.'; }
    bump(L, { trust: -5 * st.cut });
    return 'He rides the hot hand. Lately, he points out, that isn\'t you.';
  }
  return '';
}
/* THE ROLE IS EARNED IN SEASON. After the first stretch and again at the
   break a coach looks at what you have done. Outplay your minutes and you get
   more of them; play under them for long enough and you lose some, and he
   tells you so to your face. It is the same par perfOf reads, so a hot start
   earns a role and a cold one costs one, the way it does in the league. */
function roleReview(L, beats, when) {
  if (L.stage !== 'nba' || !L.team || !L.season || L.season.gp < 12) return;
  const s = L.season, role = roleOf(L), perf = perfOf(L), st = coachStyle(L);
  const rng = rngAt(L, 'review:' + when);
  const coach = myCoach(L);
  /* A two-way deal is converted once you belong in the rotation, or once you
     outplay the minutes it gives you. Until then nothing else here applies. */
  if (L.contract && L.contract.tw) {
    if ((role.diff >= -4 || perf >= 1.1) && rng() < 0.55) {
      delete L.contract.tw;
      L.contract.years = Math.max(L.contract.years, 2); L.contract.total = Math.max(L.contract.total, 2);
      bump(L, { trust: 4, morale: 6 });
      const t = say(L, '{gm}') + ' converts your two-way deal. A standard contract. No more G League.';
      beats.push({ kind: 'role', text: t, tone: 'good' });
      logIt(L, t, 'good');
    }
    return;
  }
  if (perf >= 1.09 && role.min < 34 && rng() < 0.6) {
    const up = role.starter ? 2 : role.min >= 19 ? Math.max(3, 25 - role.min) : 4;
    bump(L, { min: up, trust: 3 });
    const now = roleOf(L);
    const t = role.starter ? coach + ' gives you more of the fourth quarter.'
      : now.starter ? coach + ' moves you into the starting five.' : coach + ' gives you a real spot in the rotation.';
    beats.push({ kind: 'role', text: t, tone: 'good' });
    logIt(L, t, 'good');
    return;
  }
  if (perf <= 0.96 && role.min >= 18 && rng() < 0.6 * st.cut) {
    bump(L, { min: -4, morale: -3 });
    const t = coach + ' cuts your minutes.';
    beats.push({ kind: 'role', text: t, tone: 'bad' });
    logIt(L, t, 'bad');
    if (rng() < 0.6) L.pending.push({
      id: 'coach_review', kind: 'event', key: 'coach_review:' + L.year + ':' + when, scene: 'After practice', eyebrow: 'After practice · ' + coach,
      title: 'Why\'d you cut my minutes?', text: coach + ' doesn\'t sugarcoat it. ' + perGame(s).pts + ' points on ' + tsOf(s) + ' percent won\'t cut it. He wants the minutes earned.',
      options: [
        { label: 'Take it and go to work', hint: 'Play your way back' },
        { label: 'Ask what he needs to see', hint: 'Make it a project' },
        { label: 'Go over his head to {gm}', hint: 'Stars win this. Role players don\'t.' },
        { label: 'Vent to the reporters', hint: 'Feels great for a day' },
      ],
    });
  }
}
/* The answers to the coach's review (choose() runs them). */
ANSWER.coach_review = function(L, card, i, opt, rng, beats, touch, touches) {
  let text = '', tone = '', made = null, won = null, shots = null, contest = null;
  text = chooseCoachReview(L, i, rng);
  return { text, tone, made, won, shots, contest };
};
function chooseCoachReview(L, i, rng) {
  if (i === 0) { bump(L, { trust: 5, eth: 3 }); return 'Extra film, extra shots. He catches you in the gym at seven a.m.'; }
  if (i === 1) { const r = weakSpot(L); L.focus = { k: r, y: L.year }; bump(L, { trust: 4 }); return 'He names it: ' + RATING_NAME[r].toLowerCase() + '. He pulls up the clips. That\'s your project now.'; }
  if (i === 2) {
    if (rng() < clamp(0.1 + (L.m.fame - 40) * 0.01, 0.05, 0.75)) { bump(L, { min: 4, trust: -8 }); relate(L, 'gm', 4); return '{gm} makes a call. Your minutes are back. ' + myCoach(L) + ' won\'t look at you.'; }
    bump(L, { trust: -12, morale: -3 }); relate(L, 'gm', -8, 'You went over the coach to him.');
    return '{gm} sends you back to ' + myCoach(L) + ', who already knows you went upstairs.';
  }
  bump(L, { fame: 3, morale: 2, trust: -9 });
  relate(L, 'beat', 4);
  return 'It leads the late show. It\'s the first thing at practice, too.';
}
/* YOUR SPOT IN THE ROTATION IS A POSITION. Two men cannot both start at
   point guard, so if the man ahead of you at your spot is better and there
   is no room next to it, you come off the bench whatever your overall says,
   and if the five is better with you in it, you start. bestFive is the same
   rule the rotation screen draws. */
/* roleOf is asked on every card (the receipt shows minutes), so whether you
   are in the five is remembered until something it reads changes. Kept off
   the save: it is a cache, not a fact about the career. */
const FIVE_CACHE = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
function inFive(L) {
  /* The key is everything the answer reads, exactly: a rounded overall let a
     cached answer outlive a change a reload would have seen, which a real
     rating carried to one decimal made happen. */
  const key = [L.year, L.team, L.pos, effOvr(L).toFixed(4), L.league.rostY, L.season && L.season.deadline ? 1 : 0, L.league.rost && L.league.rost[L.team] ? L.league.rost[L.team].map((e) => e.n).join(',') : 0].join(':');
  const hit = FIVE_CACHE && FIVE_CACHE.get(L);
  if (hit && hit.key === key) return hit.v;
  const mates = matesOf(L, L.team).slice(0, 13);
  const lines = L.league.lines || {};
  const epOf = (m) => { const ln = lines[m.n]; return ln && ln[5] ? String(ln[5]).split(';') : null; };
  const me = { v: Math.max(0.1, effOvr(L) - 55), pos: L.pos, ep: null, me: 1 };
  const five = bestFive([me].concat(mates.map((m) => ({ v: Math.max(0.1, m.ovr - 55), pos: m.pos, ep: epOf(m) }))));
  const v = !!(five && five.slots.indexOf(0) >= 0);
  if (FIVE_CACHE) FIVE_CACHE.set(L, { key, v });
  return v;
}
function depthCheck(L, min, diff) {
  if (L.stage !== 'nba' || !L.team || !rostOf(L)) return min;
  const starts = inFive(L);
  if (starts && min < 24) return Math.min(min + 2, 26);
  if (!starts && min >= 24) return Math.max(19, Math.min(min, 23.5) - (diff < 6 ? 2 : 0));
  return min;
}

// ─── the trade deadline (story careers) ─────────────────────────────────────

/* THE DEADLINE IS A REAL DAY. Every February the league's contenders buy and
   its losing clubs sell, and real men change clubs: a veteran on a bad team
   goes to a good one for a young piece and a pick. Your club is one of them.
   It buys, sells or stands pat by its record, and if your name is on the
   phone, {gm} calls you before it is done.

   It happens at the All-Star break, after game 55, which is where the old
   trade_rumor card already sat. The record follows the club, as it always
   has. */

/* What a man of this overall is worth, in the win shares the rosters keep. */
const youW = (L) => Math.max(0.3, (effOvr(L) - 58) * 0.42);
/* How badly club c needs a man at pos: one when nobody there can play, about
   nought when an All-Star has the spot. */
function needAt(L, c, pos) {
  const mates = matesOf(L, c);
  let best = 0;
  for (const m of mates) {
    const f = m.pos === pos ? 1 : (NEXT_POS[pos] || []).indexOf(m.pos) >= 0 ? 0.6 : 0;
    best = Math.max(best, m.w * f);
  }
  return clamp(1 - best / 8, 0, 1);
}
/* How a club is doing: your own record when it is yours, otherwise its net. */
function winPct(L, c) {
  const s = L.season;
  if (c === L.team && s && s.g) return s.w / s.g;
  return clamp(0.5 + clubNet(L, c) * 0.03, 0.15, 0.85);
}
const recText = (L, c) => {
  const s = L.season, g = s && s.g ? s.g : 55;
  const w = c === L.team && s && s.g ? s.w : Math.round(g * winPct(L, c));
  return w + '-' + (g - w);
};
/* A real man moves from one club to another. Returns him. */
function moveMan(R, from, e, to) {
  const i = R[from].indexOf(e);
  if (i < 0) return null;
  R[from].splice(i, 1);
  R[to].push(e);
  return e;
}
/* When you are traded, somebody comes back: the man on the club taking you
   whose worth is nearest yours, from anywhere but the top of their roster. */
function swapBack(L, from, to, rng) {
  if (fo(L)) { const b = swapBackFO(L, from, to, rng); if (b) return b; }
  const R = rostNow(L);
  if (!R || !R[to] || !R[to].length) return null;
  const Y = L.year, mine = youW(L);
  const keep = R[to].slice().sort((a, b) => rostCurW(b, Y) - rostCurW(a, Y))[0];
  let best = null, d = 1e9;
  for (const e of R[to]) {
    if (e === keep && R[to].length > 1) continue;
    const x = Math.abs(rostCurW(e, Y) - mine * 0.8) + rng() * 0.3;
    if (x < d) { d = x; best = e; }
  }
  if (!best) return null;
  moveMan(R, to, best, from);
  const t = L.name + ' is traded to the ' + nick(to) + '. ' + best.n + ' goes to the ' + nick(from) + '.';
  feed(L, 'move', t);
  L.season && (L.season.dlBack = best.n);
  return best;
}
/* WHO IS ON THE MARKET. A deadline deal is a veteran role player, not a
   franchise: a club does not sell its best man in February, and nobody worth
   more than an All-Star's season changes clubs at the deadline. The first
   cut of this sent two of the league's five best young stars to new clubs in
   two Februaries out of five, which is a league nobody would recognize. */
function forSale(R, c, Y, moved) {
  const best = R[c].slice().sort((a, b) => rostCurW(b, Y) - rostCurW(a, Y))[0];
  return R[c].filter((e) => e !== best && !(moved && moved.has(e)) && Y - e.b >= 27 && rostCurW(e, Y) >= 2 && rostCurW(e, Y) <= 7)
    .sort((a, b) => rostCurW(b, Y) - rostCurW(a, Y));
}
/* The league's own deadline: sellers send a veteran to a buyer for youth. */
function deadlineLeague(L, beats, rng) {
  const R = rostNow(L);
  if (!R) return;
  if (fo(L)) { officeDeadline(L, beats, rng); return; }
  const Y = L.year;
  const ranked = CLUBS.slice().sort((a, b) => winPct(L, b) - winPct(L, a));
  const buyers = ranked.slice(0, 9).filter((c) => c !== L.team);
  const sellers = ranked.slice(-11).filter((c) => c !== L.team);
  const moved = new Set(), news = [];
  const n = 2 + Math.floor(rng() * 3);
  for (let k = 0; k < n && buyers.length && sellers.length; k++) {
    const sc = pick(rng, sellers), bc = pick(rng, buyers);
    const vet = pick(rng, forSale(R, sc, Y, moved).slice(0, 3));
    if (!vet) continue;
    const vw = rostCurW(vet, Y);
    const back = R[bc].filter((e) => !moved.has(e) && Y - e.b <= 26 && rostCurW(e, Y) <= vw * 0.75)
      .sort((a, b) => rostCurW(b, Y) - rostCurW(a, Y))[0]
      || R[bc].filter((e) => !moved.has(e)).sort((a, b) => rostCurW(a, Y) - rostCurW(b, Y))[0];
    if (!back) continue;
    moveMan(R, sc, vet, bc); moveMan(R, bc, back, sc);
    moved.add(vet); moved.add(back);
    const gain = clamp((vw - rostCurW(back, Y)) * 0.1, 0, 0.6);
    L.league.net[bc] = round1(clubNet(L, bc) + gain);
    L.league.net[sc] = round1(clubNet(L, sc) - gain * 0.5);
    news.push({ w: vw, t: 'Deadline: ' + vet.n + ' to the ' + nick(bc) + ', ' + back.n + ' to the ' + nick(sc) + '.' });
  }
  news.sort((a, b) => b.w - a.w);
  news.forEach((x, i) => { feed(L, 'move', x.t); if (i < 2) beats.push({ kind: 'news', text: x.t, tone: '' }); });
}
/* Your club at the deadline: a contender adds a veteran where it is thin, a
   losing club sells its best one. Either way it is a man you know by name. */
function deadlineClub(L, beats, rng) {
  const R = rostNow(L), s = L.season;
  if (!R || !s) return null;
  if (fo(L)) return deadlineClubFO(L, beats, rng);
  const Y = L.year, c = L.team, pct = winPct(L, c), net = clubNet(L, c);
  const mode = (pct >= 0.6 || (pct >= 0.54 && net >= 2)) ? 'buy' : pct <= 0.42 ? 'sell' : 'hold';
  s.deadline = { mode };
  /* A buyer's gain is somebody's loss, and the other contenders buy too
     (deadlineLeague), so your club is no likelier to land a man than they
     are and gains no more than he is worth. */
  if (mode === 'buy' && rng() < 0.35) {
    const pos = R_POS.slice().sort((a, b) => needAt(L, c, b) - needAt(L, c, a))[0];
    const from = CLUBS.filter((x) => x !== c).sort((a, b) => winPct(L, a) - winPct(L, b)).slice(0, 10);
    let get = null, src = null;
    for (const x of from) for (const e of forSale(R, x, Y)) {
      const v = rostCurW(e, Y) * (e.pos === pos ? 1.4 : 1) + rng() * 0.5;
      if (!get || v > get.v) { get = { e, v }; src = x; }
    }
    if (!get) return mode;
    const back = R[c].filter((e) => Y - e.b <= 25).sort((a, b) => rostCurW(a, Y) - rostCurW(b, Y))[0]
      || R[c].slice().sort((a, b) => rostCurW(a, Y) - rostCurW(b, Y))[0];
    moveMan(R, src, get.e, c);
    if (back) moveMan(R, c, back, src);
    const gain = clamp((rostCurW(get.e, Y) - (back ? rostCurW(back, Y) : 0)) * 0.1, 0.1, 0.6);
    L.league.net[c] = round1(net + gain);
    L.league.net[src] = round1(clubNet(L, src) - gain * 0.5);
    s.deadline.got = get.e.n;
    const t = 'Deadline: the ' + nick(c) + ' get ' + get.e.n + ' from the ' + nick(src) + (back ? ' for ' + back.n : '') + '.';
    feed(L, 'move', t); logIt(L, t, 'good');
    beats.push({ kind: 'club_trade', text: t, tone: 'good' });
    if (get.e.pos === L.pos && rostCurW(get.e, Y) > youW(L)) {
      bump(L, { min: -3, morale: -2 });
      beats.push({ kind: 'role', text: 'He plays your position, and plays it well. Your minutes take a hit.', tone: 'bad' });
    } else bump(L, { morale: 3 });
  } else if (mode === 'sell' && rng() < 0.55) {
    const vet = forSale(R, c, Y)[0];
    if (!vet) return mode;
    const to = CLUBS.filter((x) => x !== c).sort((a, b) => winPct(L, b) - winPct(L, a))[Math.floor(rng() * 6)];
    const back = R[to].filter((e) => Y - e.b <= 25).sort((a, b) => rostCurW(a, Y) - rostCurW(b, Y))[0];
    moveMan(R, c, vet, to);
    if (back) moveMan(R, to, back, c);
    L.league.net[c] = round1(net - clamp(rostCurW(vet, Y) * 0.08, 0.2, 1));
    s.deadline.lost = vet.n;
    const t = 'Deadline: the ' + nick(c) + ' send ' + vet.n + ' to the ' + nick(to) + (back ? ' for ' + back.n : '') + '.';
    feed(L, 'move', t); logIt(L, t, '');
    beats.push({ kind: 'club_trade', text: t, tone: '' });
    if (vet.pos === L.pos || (NEXT_POS[L.pos] || []).indexOf(vet.pos) >= 0) {
      bump(L, { min: 3 });
      beats.push({ kind: 'role', text: 'His minutes are yours now.', tone: 'good' });
    }
  }
  return mode;
}
/* YOUR CLUB AT THE DEADLINE, on the front office's model. A contender buys a
   veteran from a club that is selling, and pays in young players and picks;
   a losing club sells its veteran to a contender for the same. Either way it
   is a man you know by name, and the headline says what went each way. */
function deadlineClubFO(L, beats, rng) {
  const R = rostNow(L), s = L.season, Y = L.year, c = L.team, pct = winPct(L, c), net = clubNet(L, c);
  const mode = (pct >= 0.6 || (pct >= 0.54 && net >= 2)) ? 'buy' : pct <= 0.42 ? 'sell' : 'hold';
  s.deadline = { mode };
  const modes = clubModes(L), moved = new Set(), before = {};
  for (const x of CLUBS) before[x] = rawOvr(R, x, Y);
  const bestOf = (x) => R[x].slice().sort((a, b) => b.c - a.c)[0];
  let done = null;
  if (mode === 'buy' && rng() < 0.35) {
    modes[c] = 'win';
    const pos = R_POS.slice().sort((a, b) => needAt(L, c, b) - needAt(L, c, a))[0];
    const cands = [];
    for (const x of CLUBS) if (x !== c && modes[x] !== 'win') for (const e of R[x]) if (Y - e.b >= 26 && show(e.c) >= 77 && show(e.c) <= 86 && e !== bestOf(x)) cands.push([x, e, e.c * (e.pos === pos ? 1.15 : 1) + rng() * 3]);
    cands.sort((a, b) => b[2] - a[2]);
    for (const [x, e] of cands.slice(0, 6)) {
      const pkg = buildPackage(L, R, Y, c, x, e, modes, moved);
      if (!pkg) continue;
      const t = tradeText(L, x, [e], [], c, pkg.men, pkg.picks);
      doTrade(L, R, Y, x, [e], [], c, pkg.men, pkg.picks, moved);
      done = { t, got: e, tone: 'good', men: [e.n].concat(pkg.men.map((x) => x.n)) };
      s.deadline.got = e.n;
      break;
    }
  } else if (mode === 'sell' && rng() < 0.55) {
    modes[c] = 'rebuild';
    const vets = R[c].filter((e) => Y - e.b >= 27 && show(e.c) >= 77 && show(e.c) <= 87 && e !== bestOf(c)).sort((a, b) => b.c - a.c);
    const buyers = CLUBS.filter((x) => x !== c && modes[x] === 'win').sort(() => rng() - 0.5);
    for (const T of vets.slice(0, 2)) {
      for (const b of buyers) {
        const pkg = buildPackage(L, R, Y, b, c, T, modes, moved);
        if (!pkg) continue;
        const t = tradeText(L, c, [T], [], b, pkg.men, pkg.picks);
        doTrade(L, R, Y, c, [T], [], b, pkg.men, pkg.picks, moved);
        done = { t, lost: T, to: b, tone: '', men: [T.n].concat(pkg.men.map((x) => x.n)) };
        s.deadline.lost = T.n;
        break;
      }
      if (done) break;
    }
  }
  renet(L, R, Y, before);
  if (!done) return mode;
  feed(L, 'trade', done.t);
  logTx(L, Y, 'trade', done.t, [c], { win: 'deadline', m: done.men });
  logIt(L, done.t, done.tone);
  beats.push({ kind: 'club_trade', text: 'Deadline: ' + lowFirst(done.t), tone: done.tone });
  if (done.got) teamNote(L, { y: Y, ph: 'mid', t: c, k: 'dl_buy', n: done.got.n, p: 6 });
  else teamNote(L, { y: Y, ph: 'mid', t: c, k: 'dl_sell', n: done.lost.n, to: done.to, p: 6 });
  if (done.got) {
    if (done.got.pos === L.pos && rostCurW(done.got, Y) > youW(L)) {
      bump(L, { min: -3, morale: -2 });
      beats.push({ kind: 'role', text: 'He plays your position, and plays it well. Your minutes take a hit.', tone: 'bad' });
    } else bump(L, { morale: 3 });
  } else if (done.lost.pos === L.pos || (NEXT_POS[L.pos] || []).indexOf(done.lost.pos) >= 0) {
    bump(L, { min: 3 });
    beats.push({ kind: 'role', text: 'His minutes are yours now.', tone: 'good' });
  }
  return mode;
}
/* WHEN YOU ARE TRADED, the club taking you pays for you the way it would pay
   for anybody: a package it thinks is fair, young players and picks to a
   club that is rebuilding, salary that matches. The headline names it all. */
function swapBackFO(L, from, to, rng) {
  const R = rostNow(L), Y = L.year;
  if (!R || !R[to] || !R[from]) return null;
  const ct = L.contract;
  const T = { n: L.name, you: 1, c: effOvr(L), b: Y - L.age, pot: Math.max(effOvr(L), L.pot || 0), pos: L.pos,
    k: Y + Math.max(0, (ct ? ct.years : 1) - 1), sal: ct ? ct.salary : round1(capFor(Y) * MIN_PCT) };
  const modes = clubModes(L), moved = new Set(), before = {};
  for (const x of CLUBS) before[x] = rawOvr(R, x, Y);
  let pkg = buildPackage(L, R, Y, to, from, T, modes, moved);
  if (!pkg) return null;
  /* Nobody here is traded for picks alone: a man comes back. */
  if (!pkg.men.length) {
    const best = R[to].slice().sort((a, b) => b.c - a.c)[0];
    const one = R[to].filter((e) => e !== best).sort((a, b) => vMan(L, a, Y, modes[to]) - vMan(L, b, Y, modes[to]))[0];
    if (!one) return null;
    pkg = { men: [one], picks: pkg.picks.slice(0, 1) };
  }
  const t = tradeText(L, from, [T], [], to, pkg.men, pkg.picks);
  doTrade(L, R, Y, from, [T], [], to, pkg.men, pkg.picks, moved);
  renet(L, R, Y, before);
  feed(L, 'trade', t);
  logTx(L, Y, 'trade', t, [from, to], { m: pkg.men.map((e) => e.n), win: 'you' });
  const words = assetWords(pkg.men, pkg.picks, to);
  if (L.season) L.season.dlBack = words;
  return { n: words, men: pkg.men.map((e) => e.n) };
}
/* The clubs that would take you: a contender with a hole at your position,
   and a club where you would start. */
function deadlineDests(L, rng) {
  const c = L.team, pos = L.pos;
  const others = CLUBS.filter((x) => x !== c);
  /* The best three clubs in the league are not calling: they have no room
     under the tax and no hole at your spot. A contender here is a good club
     a piece away. */
  const ranked = others.slice().sort((a, b) => winPct(L, b) - winPct(L, a));
  const band = ranked.slice(3, 14);
  const contend = band.slice().sort((a, b) => (needAt(L, b, pos) + rng() * 0.3) - (needAt(L, a, pos) + rng() * 0.3))[0];
  const start = others.filter((x) => x !== contend).sort((a, b) => (needAt(L, b, pos) + rng() * 0.15) - (needAt(L, a, pos) + rng() * 0.15))[0];
  return [contend, start];
}
function roleThere(L, c) {
  const diff = effOvr(L) - rotationBar(clubNet(L, c));
  const need = needAt(L, c, L.pos);
  return diff >= 10 ? 'You\'d be the man' : (diff >= 0 || need >= 0.6) ? 'You\'d start' : diff >= -6 ? 'You\'d be in the rotation' : 'You\'d ride the bench';
}
function deadlineCard(L, why, dests) {
  const s = L.season, c = L.team;
  const [a, b] = dests;
  const lead = why === 'ask' ? 'You asked out. {gm} says he\'s got two real offers.'
    : why === 'sell' ? 'The ' + nick(c) + ' are ' + recText(L, c) + '. {gm} is selling, and you\'re the one they want.'
      : 'Your minutes dried up. {gm} thinks a fresh start helps everybody.';
  return {
    id: 'deadline', kind: 'event', key: 'deadline:' + L.year, scene: 'Deadline day', eyebrow: 'Trade deadline · 3pm Eastern',
    title: why === 'ask' ? 'You asked out. Where to?' : '{gm} is taking calls on you.',
    text: lead + ' The ' + nick(a) + ' and the ' + nick(b) + ' are both on the line.',
    ctx: { why, dests: [a, b], from: c },
    options: [
      { label: 'Push for the ' + nick(a), hint: recText(L, a) + '. ' + roleThere(L, a) + '.' },
      { label: 'Push for the ' + nick(b), hint: recText(L, b) + '. ' + roleThere(L, b) + '.' },
      { label: 'Tell {gm} you want to stay', hint: why === 'ask' ? 'Take the request back' : 'Loyalty, maybe not enough' },
      { label: 'Let {agent} handle it', hint: 'Best fit, his call' },
    ],
  };
}
/* The answers to the trade deadline (choose() runs them). */
ANSWER.deadline = function(L, card, i, opt, rng, beats, touch, touches) {
  let text = '', tone = '', made = null, won = null, shots = null, contest = null;
  text = chooseDeadline(L, card, i, rng); tone = L.team !== card.ctx.from ? 'gold' : '';
  return { text, tone, made, won, shots, contest };
};
/* Seasons in a row with the club you are on now. */
function tenure(L) {
  let n = 0;
  for (let i = L.history.length - 1; i >= 0 && L.history[i].t === L.team; i--) n++;
  return n;
}
function tradeDeadline(L, beats) {
  if (L.stage !== 'nba' || !L.team || !L.season || !rostOf(L)) return;
  const rng = rngAt(L, 'deadline');
  deadlineLeague(L, beats, rng);
  const mode = deadlineClub(L, beats, rng);
  const s = L.season, o = ovrOf(L), role = roleOf(L);
  const c = L.contract;
  let why = null;
  if (L.flags.tradeAsk) why = 'ask';
  else if (mode === 'sell' && L.age >= 27 && o >= 68 && c && c.kind !== 'rookie' && rng() < 0.45) why = 'sell';
  else if (role.min < 16 && L.age >= 23 && s.g > 0 && rng() < 0.3) why = 'minutes';
  if (!why) { if (mode !== 'hold') beats.push({ kind: 'news', text: 'The deadline passes. You are still a ' + nick(L.team).replace(/s$/, '') + '.', tone: '' }); return; }
  L.pending.push(deadlineCard(L, why, deadlineDests(L, rng)));
}
function chooseDeadline(L, card, i, rng) {
  const { why, dests } = card.ctx;
  const fame = L.m.fame, gmRel = relOf(L, 'gm');
  /* Names first: once the trade is made, {gm} is somebody else's. */
  const gm = say(L, '{gm}');
  const swing = (fame - 40) * 0.004 + gmRel / 250;
  const go = (to, t) => { const from = L.team; tradeTo(L, to, rng); L.flags.tradeAsk = false; remember(L, 'deadline.traded', from); return t; };
  if (i === 0 || i === 1) {
    const want = dests[i], other = dests[1 - i];
    const p = clamp((why === 'ask' ? 0.55 : why === 'sell' ? 0.5 : 0.45) + swing, 0.15, 0.85);
    if (rng() < p) { bump(L, { morale: 6 }); relate(L, 'gm', 6, 'He got you where you wanted to go.', gm); return go(want, 'Done. ' + gm + ' closes it with the ' + nick(want) + '. You fly out tonight.'); }
    if (rng() < 0.5) { bump(L, { morale: -3 }); return go(other, 'The ' + nick(want) + ' wouldn\'t pay. You\'re a ' + nick(other).replace(/s$/, '') + ' now.'); }
    bump(L, { trust: -6, morale: -4 }); relate(L, 'gm', -8, 'You pushed to leave at the deadline.');
    L.flags.tradeAsk = why === 'ask';
    return 'Three o\'clock comes and goes. You\'re still here, and everybody knows you wanted out.';
  }
  if (i === 2) {
    if (why === 'ask') { L.flags.tradeAsk = false; bump(L, { trust: 8, morale: 2 }); relate(L, 'gm', 8, 'You took your trade request back.'); return gm + ' pulls you off the market. The locker room notices.'; }
    const p = clamp(0.45 + L.m.trust * 0.004 + Math.min(tenure(L), 6) * 0.04 + swing, 0.15, 0.9);
    if (rng() < p) { bump(L, { trust: 6, morale: 4 }); relate(L, 'gm', 8, 'He kept you at the deadline.'); return gm + ' hangs up on both of them. You\'re staying put.'; }
    bump(L, { morale: -6 }); relate(L, 'gm', -6, 'He traded you after you asked to stay.', gm);
    return go(dests[0], gm + ' listens, then trades you anyway. It\'s business. You\'re headed to the ' + nick(dests[0]) + '.');
  }
  const pick2 = needAt(L, dests[0], L.pos) + winPct(L, dests[0]) >= needAt(L, dests[1], L.pos) + winPct(L, dests[1]) ? 0 : 1;
  if (why === 'ask' || rng() < 0.75) { relate(L, 'agent', 4); return go(dests[pick2], '{agent} lands you the better fit: the ' + nick(dests[pick2]) + '.'); }
  return '{agent} calls back at 3:05. Nothing got done. You stay put.';
}

/* A summer moves two or three ratings by a point or two. It is a direction,
   not a shortcut: the growth that matters is the age curve in developStory(). */
const TRAIN = [
  { sho: 2, iq: 1 }, { ath: 1, fin: 1, reb: 1 }, { pla: 2, iq: 1 }, { def: 2, ath: 1 }, null,
];

/* THE SUMMER, on a story career. The old card asked the same question with
   the same five answers every year, and a fifteen year career read it fifteen
   times. Now the card opens on what last season actually was (a title, a
   first round exit, a new city, a contract year), and offers four programs
   out of sixteen. Some only come to a career they fit: post work for a big,
   national team camp for a star, rehab after a season of missed games.
   A program offered last summer is less likely to come round again.

   Every program is worth about what one of the old five was (three rating
   points before the age and luck scaling), so the balance bands do not move.
   Picking the same program three summers running pays less, and says so. */
const BIGS = { PF: 1, C: 1 };
/* How the body feels, said rather than printed: the meter is on the card. */
const bodyFeel = (L) => L.m.health >= 85 ? 'your body feels great' : L.m.health >= 60 ? 'your body feels fine' : L.m.health >= 35 ? 'your body is still sore' : 'your body needs a real break';
const SUMMER = {
  shoot: { l: 'Live in the shooting gym', h: 'Shooting, plus some IQ', fx: { sho: 2, iq: 1 },
    s: ['Five hundred makes a day. The form\'s yours now.', 'A shooting coach rebuilds your release. Weird at first, then right.', 'You chart every shot all summer. The numbers climb.'] },
  strength: { l: 'Hit the weight room', h: 'Athleticism, finishing, rebounding', fx: { ath: 1, fin: 1, reb: 1 },
    s: ['Twelve pounds, and every one of them useful.', 'Sled pushes at dawn. Now you finish through contact.', 'A track coach fixes your first step.'] },
  pg: { l: 'Go to point guard school', h: 'Playmaking, plus some IQ', fx: { pla: 2, iq: 1 },
    s: ['Two-hand passes off the dribble until you dream about them.', 'You learn to see the weak side before it opens.', 'Fifty pick and rolls a day. Now you read them all.'] },
  defense: { l: 'Go to defensive camp', h: 'Defense, plus some athleticism', fx: { def: 2, ath: 1 },
    s: ['Slides until your legs shake. Now you stay in front.', 'They teach you to guard without fouling. Mostly.', 'You come back a step quicker and a lot meaner.'] },
  rest: { l: 'Rest and recover', h: 'Health. Slows the decline.', rest: 1, hy: 'Health, and fresh legs in the fall',
    s: ['Fully rested. You feel twenty-two again.', 'Two months of sleep and fishing. The knees say thanks.', 'No basketball until August. Your body forgives you.'],
    sy: ['Two months off your feet. You come back bouncy.', 'Sleep, home cooking, no gym. Your legs feel brand new.', 'No basketball until August. You miss it, which is the point.'] },
  post: { l: 'Post work with a retired big', h: 'Finishing, plus some rebounding', fx: { fin: 2, reb: 1 }, when: (L) => !!BIGS[L.pos] || L.pos === 'SF',
    s: ['Drop step, up and under, repeat. He\'s sixty and still beats you.', 'He teaches you to seal early. The paint feels smaller.', 'Old man moves. They work on young men.'] },
  film: { l: 'Live in the film room', h: 'IQ, plus some playmaking', fx: { iq: 2, pla: 1 },
    s: ['Three hundred hours of tape. You see plays before they happen.', 'You learn every coverage in the league by name.', 'Film every morning. The game slows way down.'] },
  boxing: { l: 'Box for your footwork', h: 'Athleticism, defense, finishing', fx: { ath: 1, def: 1, fin: 1 },
    s: ['Your feet were lazy. They aren\'t anymore.', 'An hour of jump rope a day. Your balance is brand new.', 'A real fighter trains you. Basketball feels gentle after that.'] },
  yoga: { l: 'Do yoga and mobility work', h: 'Health, and a body that lasts', fx: { ath: 1 }, m: { health: 8 }, dur: 3, when: (L) => L.age >= 26,
    s: ['Your hips move like they did at twenty.', 'The guys laugh at the mat. Then two of them join.', 'Hot room, five days a week. Nothing hurts in September.'] },
  altitude: { l: 'Train at altitude', h: 'Athleticism and boards. Costs health.', fx: { ath: 2, reb: 1 }, m: { health: -4 }, when: (L) => L.age <= 30,
    s: ['Two months at eight thousand feet. Sea level feels like cheating.', 'You throw up on day three. By week six you fly.', 'Thin air, long runs. Your lungs feel bigger.'] },
  pickup: { l: 'Run pickup with pros', h: 'A little of everything. Fun.', fx: { sho: 1, fin: 1, iq: 1 }, m: { morale: 3 },
    s: ['Invite-only runs in a closed gym. You hold your own.', 'Five games a day. Somebody films one and it\'s everywhere.', 'You steal a move from a guy who never made the league.'] },
  national: { l: 'Go to national team camp', h: 'Defense, shooting, and a spotlight', fx: { def: 1, sho: 1, iq: 1 }, m: { fame: 3 }, when: (L) => ovrOf(L) >= 78,
    s: ['Three weeks with the best in the world. You fit right in.', 'You guard stars every day. It shows.', 'The camp\'s a tryout. You make the cut.'] },
  /* A rookie has not played Summer League yet unless this summer already
     sent him (the tryout after an undrafted night, or the Vegas card dealt on
     draft night), so "again" is only offered from his second summer, and his
     first offers it plain. */
  summer_lg: { l: 'Play Summer League again', l0: 'Play Summer League', h0: 'Vegas in July. The staff notices', h: 'Reps, and the staff notices', fx: { pla: 1, sho: 1, fin: 1 }, m: { trust: 4 },
    when: (L) => L.seasonsDone <= 2 && !(L.seasonsDone === 0 && (recall(L, 'route.undrafted') || ((L.evlog || {}).sl_first_game || []).length)),
    s: ['Thirty a night in Vegas. The front office sees every game.', 'You run the team. Nobody else touches it late.', 'MVP in an empty gym. It still counts.'] },
  home: { l: 'Train back home', h: 'Good for the soul. Some shooting.', fx: { sho: 1, ath: 1 }, m: { morale: 6 }, who: 'mom',
    s: ['Your old gym, your old hoop. {mom} brings lunch.', 'You run hills behind your high school. Kids watch from the fence.', 'Home cooking and an empty gym. Best summer in years.'] },
  private: { l: 'Hire a private skills coach', h: 'Shooting, playmaking, defense. Pricey.', fx: { sho: 1, pla: 1, def: 1 }, cash: 0.2, when: (L) => L.cash >= 0.6,
    s: ['Expensive. Worth every dollar.', 'He films everything and fixes one thing a day.', 'He\'s worked with three All-Stars. Now he\'s got four.'] },
  rehab: { l: 'Do the rehab right', h: 'Health, and a body that lasts', m: { health: 14 }, dur: 4,
    s: ['Boring work, done right. It feels solid.', 'Pool workouts all July. The leg\'s stronger than before.', 'You do every exercise twice. Dr. {doctor:last} is impressed.'] },
};
const SUMMER_FRAME = {
  first: ['Your first summer as a pro', 'Camp opens in eight weeks. Nobody knows your name yet.'],
  champ: ['A short summer, and a ring', 'You won it in June. Camp\'s in ten weeks. The ring fits.'],
  finals: ['Two wins short', 'The Finals loss is still on every highlight show.'],
  deep: ['A long run, a short summer', 'Your legs are tired. Your name\'s louder.'],
  out: ['Out in the first round', 'Everybody saw the series. Everybody has advice.'],
  missed: ['A long summer', 'No playoffs. The phone\'s been quiet since April.'],
  moved: ['New city, new gym', 'Nobody here has seen you practice yet.'],
  hurt: ['The summer after the injury', 'You missed too many games. Everybody\'s watching the leg.'],
  contract: ['Your contract year starts now', 'Play well and you write the next deal.'],
  old: ['Another summer, and your body has opinions', 'Mornings take longer to get going. The game still feels good.'],
  plain: [['Where are you spending the summer?', 'Camp\'s two months away.'], ['Eight weeks until camp', 'The gym\'s empty in July. You could be in it.'],
    ['It\'s the off-season', 'Everybody else is on a boat. What are you doing?']],
  col1: ['Your first summer on campus', 'Summer classes and open gym. Nobody on the roster has seen you play yet.'],
  colNew: ['New school, new gym', 'Nobody here has seen you practice yet.'],
  colBack: [['Back on campus for the summer', 'Last season is on film. The staff wants more.'], ['Summer on campus', 'Classes in the morning. The gym is open all afternoon.']],
};
/* COLLEGE GETS ITS OWN SUMMER. The card below was written for the league, and
   a college year deals it too (colYear), so a freshman was told it was his
   first summer as a pro and offered Summer League. A player read it at 18. */
const inCollege = (L) => !L.team && typeof L.phase === 'string' && L.phase.indexOf('col') === 0;
const COL_SKIP = { summer_lg: 1, national: 1, private: 1 };
function colFrame(L) {
  const prev = (L.amHist || []).filter((x) => x.lvl === 'NCAA').pop();
  if (!prev) return SUMMER_FRAME.col1;
  if (L.am && L.am.college && prev.school && prev.school !== L.am.college) return SUMMER_FRAME.colNew;
  return pick(figRng(L, 'sframe:' + L.year), SUMMER_FRAME.colBack);
}
function summerFrame(L) {
  if (inCollege(L)) return colFrame(L);
  const H = L.history, h = H[H.length - 1], c = L.contract;
  if (!h) return SUMMER_FRAME.first;
  if (h.t && L.team && h.t !== L.team) return SUMMER_FRAME.moved;
  if (h.gp < 55) return SUMMER_FRAME.hurt;
  if (h.po === 'Champion') return SUMMER_FRAME.champ;
  if (h.po === 'Finals') return SUMMER_FRAME.finals;
  if (h.po === 'CF') return SUMMER_FRAME.deep;
  if (c && c.years === 1 && c.kind !== 'rookie' && L.age <= 32) return SUMMER_FRAME.contract;
  if (L.age >= 33) return SUMMER_FRAME.old;
  if (h.po === 'R1') return SUMMER_FRAME.out;
  if (h.po === 'Missed' || h.po === 'Play-in') return SUMMER_FRAME.missed;
  return pick(figRng(L, 'sframe:' + L.year), SUMMER_FRAME.plain);
}
/* An eventful year: a new club, half a season lost, a ring or an MVP. */
function eventful(L) {
  const H = L.history, h = H[H.length - 1], p = H[H.length - 2];
  if (!h) return true;
  return h.gp < 55 || h.po === 'Champion' || (h.aw || []).indexOf('mvp') >= 0 || !!(p && p.t !== h.t) || h.t !== L.team;
}
/* The goal is asked some years (the owner's call, 2026-10-16): always the
   first two seasons, after an eventful year, otherwise about half the time.
   The summer was made occasional too and went back to every year: a summer
   not asked cost the sweep's ring share (19.5% to 17.3%) however the quiet
   summer was chosen, so the owner's fallback stands. */
const ASK_P = 0.5;
const askGoal = (L) => L.seasonsDone < 2 || eventful(L) || rngAt(L, 'ask:goal')() < ASK_P;
function summerKeys(L) {
  const H = L.history, h = H[H.length - 1];
  const r = figRng(L, 'summer:' + L.year);
  const out = [];
  if (h && h.gp < 55 && !inCollege(L)) out.push('rehab');
  if (L.m.health < 70 || L.age >= 31) out.push('rest');
  const last = (L.flags.summerOff || []);
  const col = inCollege(L);
  const rest = Object.keys(SUMMER).filter((k) => k !== 'rehab' && out.indexOf(k) < 0 && !(col && COL_SKIP[k]) && (!SUMMER[k].when || SUMMER[k].when(L)));
  while (out.length < 4 && rest.length) {
    const k = weighted(r, rest, (x) => (last.indexOf(x) >= 0 ? 0.35 : 1) * (x === 'rest' ? 0.6 : 1));
    out.push(k); rest.splice(rest.indexOf(k), 1);
  }
  return out;
}
/* THE SUMMER IS READ OFF THE SEASON THAT JUST ENDED. Every situation has a
   pool of openings, a fact about your own year is added when one fits, and the
   line about your body reads your health and your age. fresh() deals the next
   line nobody has read, so the same kind of summer never reads the same way
   twice. The situation is summerFrame's; this only says it. */
const SUMMER_SAY = {
  first: [['Your first summer as a pro', 'Rookie summer', 'Eight weeks to your first camp', 'You made it. Now what?'],
    ['Camp opens in eight weeks. Nobody knows your name yet.', 'The vets are on vacation. You have a gym key.', 'Your first check cleared. The work starts now.', 'Nobody in the league has seen you play for real.']],
  champ: [['A short summer, and a ring', 'Champions. Now do it again.', 'The parade was last week', 'Everybody wants a piece of you'],
    ['You won it in June. Camp\'s in ten weeks.', 'The ring fits. The target on your back is new.', 'Every team in the league is coming for you now.', 'Three talk shows this week. Zero workouts.']],
  finals: [['Two wins short', 'So close it hurts', 'The Finals loss won\'t leave', 'You can still see Game 6'],
    ['The Finals loss is still on every highlight show.', 'You watched the other team hold the trophy.', 'Two more wins. You think about it daily.', 'You lost the last game of the season. Everybody else stopped earlier.']],
  deep: [['A long run, a short summer', 'Conference finals hangover', 'One round from the Finals', 'You played into late May'],
    ['Your legs are tired. Your name\'s louder.', 'You got close enough to smell it.', 'Ten weeks off. Your body wants twenty.', 'The run made you famous. It also made you sore.']],
  out: [['Out in the first round', 'One round and done', 'Bounced early', 'A first round exit'],
    ['Everybody saw the series. Everybody has advice.', 'Four losses in a week. You watched the rest from home.', 'The series is still on loop in your head.', 'You made the playoffs. You did not stay long.']],
  missed: [['A long summer', 'No playoffs this year', 'April came and went', 'You watched the playoffs from home'],
    ['No playoffs. The phone\'s been quiet since April.', 'Your season ended with the regular season.', 'The lottery is the only thing your club made.', 'Four months until anything counts again.']],
  moved: [['New city, new gym', 'A new locker, a new name on it', 'Your first summer in new colors', 'Starting over somewhere new'],
    ['Nobody here has seen you practice yet.', 'You don\'t know where anything is yet.', 'New coach, new playbook, new teammates.', 'The fans here only know your highlights.']],
  hurt: [['The summer after the injury', 'Back from the injury?', 'Everybody\'s watching the leg', 'A summer about your body'],
    ['You missed too many games. Everybody\'s watching the leg.', 'You got cleared to play. The doubters didn\'t clear you.', 'You spent the spring in the training room.', 'Half a season lost. The other half was rusty.']],
  contract: [['Your contract year starts now', 'Last year of the deal', 'Play well, get paid', 'The money year'],
    ['Play well and you write the next deal.', 'Every game this year is an audition.', '{agent:first} already has a spreadsheet.', 'This season sets your next five years.']],
  old: [['Another summer, and your body has opinions', 'Summer at ' + 'your age', 'The young guys call you sir', 'How much is left?'],
    ['Mornings take longer to get going. The game still feels good.', 'Recovery takes two days now. It used to take one.', 'You still love it. Your knees love it less.', 'Half your draft class is coaching now.']],
  plain: [['Where are you spending the summer?', 'Eight weeks until camp', 'It\'s the off-season', 'A quiet summer'],
    ['Camp\'s two months away.', 'The gym\'s empty in July. You could be in it.', 'Everybody else is on a boat. What are you doing?', 'Nobody is watching. That is the point.']],
};
function summerSit(L) {
  if (inCollege(L)) return null;
  const H = L.history, h = H[H.length - 1], c = L.contract;
  if (!h) return 'first';
  if (h.t && L.team && h.t !== L.team) return 'moved';
  if (h.gp < 55) return 'hurt';
  if (h.po === 'Champion') return 'champ';
  if (h.po === 'Finals') return 'finals';
  if (h.po === 'CF') return 'deep';
  if (c && c.years === 1 && c.kind !== 'rookie' && L.age <= 32) return 'contract';
  if (L.age >= 33) return 'old';
  if (h.po === 'R1') return 'out';
  if (h.po === 'Missed' || h.po === 'Play-in') return 'missed';
  return 'plain';
}
/* One true thing about the year you just had. */
const SUMMER_FACTS = [
  ['up', (L, h, p) => p && h.pts - p.pts >= 2.5, (L, h, p) => 'You went from ' + p.pts + ' to ' + h.pts + ' a night.'],
  ['down', (L, h, p) => p && p.pts - h.pts >= 2.5, (L, h) => 'Your scoring slipped to ' + h.pts + ' a night.'],
  ['rec', (L, h) => !!h.t && h.w + h.l > 0, (L, h) => 'The ' + nick(h.t) + ' went ' + h.w + '-' + h.l + '.'],
  ['star', (L, h) => (h.aw || []).indexOf('allstar') >= 0 || (h.aw || []).indexOf('star') >= 0, () => 'You were an All-Star.'],
  ['line', (L, h) => h.pts >= 8, (L, h) => per(h.pts, 'points') + ', ' + per(h.reb, 'boards') + ', ' + per(h.ast, 'assists') + '.'],
  ['yrs', (L) => seasonsWithClub(L) >= 3, (L) => 'That was year ' + seasonsWithClub(L) + ' with this club.'],
  ['bench', (L, h) => h.role === 'End of bench' || h.role === 'Rotation', (L, h) => 'You were ' + (h.role === 'Rotation' ? 'a rotation player' : 'at the end of the bench') + '.'],
  ['rings', (L, h) => totals(L).rings >= 1 && h.po !== 'Champion', (L) => { const n = totals(L).rings; return n === 1 ? 'You have one ring. One is not enough.' : 'You have ' + n + ' rings. You want another.'; }],
];
/* Seasons in a row with the club you finished the last one on. */
function seasonsWithClub(L) { let n = 0; for (let i = L.history.length - 1; i >= 0 && L.history[i].t === L.history[L.history.length - 1].t; i--) n++; return n; }
const BODY_SAY = [
  [(L) => L.m.health >= 85 && L.age >= 31, ['Nothing hurts, which is new.', 'Your knees are quiet for once.', 'You feel younger than your birthday.']],
  [(L) => L.m.health >= 85, ['Your body feels great.', 'You feel bouncy.', 'Nothing hurts. Enjoy it.', 'Your legs feel brand new.']],
  [(L) => L.m.health >= 60, ['Your body feels fine.', 'A few aches. Nothing a summer can\'t fix.', 'Mostly healthy. Mostly.', 'Sore, but the good kind.']],
  [(L) => L.m.health >= 35, ['Your body is still sore.', 'You\'re still icing twice a day.', 'Something still twinges on the stairs.']],
  [() => true, ['Your body needs a real break.', 'Everything hurts.', 'The trainer says rest, and says it loudly.']],
];
const words = (t) => String(t).split(/\s+/).filter(Boolean).length;
function summerSay(L) {
  const sit = summerSit(L);
  if (!sit) { const f = summerFrame(L); return [f[0], f[1] + ' ' + bodyFeel(L)[0].toUpperCase() + bodyFeel(L).slice(1) + '.']; }
  const r = rngAt(L, 'ssay:' + L.year), P = SUMMER_SAY[sit];
  const title = sit === 'old' ? freshPick(L, 'st:old', P[0], r).replace('your age', String(L.age)) : freshPick(L, 'st:' + sit, P[0], r);
  let text = freshPick(L, 'sx:' + sit, P[1], r);
  const H = L.history, h = H[H.length - 1], p = H[H.length - 2];
  if (h) {
    const open = SUMMER_FACTS.filter((f) => { try { return f[1](L, h, p); } catch (e) { return false; } });
    if (open.length) {
      const f = open[fresh(L, 'sf', open.length, r)];
      const line = f[2](L, h, p);
      if (words(text) + words(line) <= 14) text += ' ' + line;
    }
  }
  const B = BODY_SAY.find((b) => b[0](L))[1];
  return [title, text + ' ' + freshPick(L, 'sb:' + B[0], B, r)];
}
function summerCard(L) {
  const ks = summerKeys(L), f = summerSay(L);
  L.flags.summerOff = ks;
  return {
    id: 'training', kind: 'event', key: 'training', scene: 'The off-season',
    eyebrow: 'Summer of ' + (L.year - 1), title: f[0],
    text: f[1],
    ctx: { ks },
    options: ks.map((k) => { const P = SUMMER[k], rook = P.l0 && L.seasonsDone === 0; return { label: rook ? P.l0 : P.l, hint: rook ? P.h0 : P.hy && L.age <= 24 ? P.hy : P.h }; }),
  };
}
/* The answers to the summer (choose() runs them). */
ANSWER.training = function(L, card, i, opt, rng, beats, touch, touches) {
  let text = '', tone = '', made = null, won = null, shots = null, contest = null;
  if (card.ctx && card.ctx.ks) { text = summerChoose(L, card.ctx.ks[i], rng); tone = 'good'; return { text, tone, made, won, shots, contest }; }
  const t = TRAIN[i];
  const young = L.age <= 24 ? 1 : L.age <= 28 ? 0.8 : 0.6;
  if (t) {
    const d = {};
    for (const k in t) d[k] = Math.round(t[k] * young * (0.7 + rng() * 0.6));
    bump(L, d);
    text = 'A good summer. It shows the first week of camp.'; tone = 'good';
  } else { bump(L, { health: 18 }); L.flags.restYears = (L.flags.restYears || 0) + 1; text = 'You actually rest. You feel twenty-two again.'; tone = 'good'; }
  return { text, tone, made, won, shots, contest };
};
function summerChoose(L, k, rng) {
  const P = SUMMER[k];
  const young = L.age <= 24 ? 1 : L.age <= 28 ? 0.8 : 0.6;
  const runs = L.flags.summerRun && L.flags.summerRun.k === k ? L.flags.summerRun.n + 1 : 1;
  L.flags.summerRun = { k, n: runs };
  const stale = runs >= 3 ? 0.6 : 1;
  const d = {};
  if (P.fx) for (const x in P.fx) d[x] = Math.round(P.fx[x] * young * stale * (0.7 + rng() * 0.6));
  Object.assign(d, P.m || {});
  if (P.dur) d.dur = P.dur;
  if (P.cash) d.cash = -P.cash;
  if (P.rest) { d.health = 18; L.flags.restYears = (L.flags.restYears || 0) + 1; }
  /* One summer in ten, something clicks. */
  const top = P.fx ? Object.keys(P.fx).sort((a, b) => P.fx[b] - P.fx[a])[0] : null;
  const click = top && runs < 3 && rng() < 0.1;
  if (click) d[top] = (d[top] || 0) + 1;
  bump(L, d);
  if (P.who) relate(L, P.who, 6, 'You spent a summer at home.');
  remember(L, 'summer.' + k, true);
  let t = pick(rng, P.sy && L.age <= 24 ? P.sy : P.s);
  if (runs >= 3) t = 'Same summer, third year running. Your body knows the drills. It learns less.';
  else if (click) t += ' Then something clicks in July.';
  return t;
}
