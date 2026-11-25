// ─── the ribbon and the life card ───────────────────────────────────────────

/* REPLAY (the BitLife plan, phase 7, the owner's call of 2026-11-24). Every
   life ends with ONE ribbon: the thing it will be remembered for. They are
   tried in this order and the first that fits is the ribbon, so the rare and
   the strange outrank the merely good, and the last one fits everybody.

   A ribbon is read off the finished life and never stored: `ribbonOf(L)` is
   the same answer every time, a save is the save it was, and a career from
   before this has a ribbon too. `X` is what every test reads (ribbonFacts).

   `lifeCard(L)` is the whole life on one card, for the end screen and for
   sharing: the ribbon, the verdict, the numbers and up to five lines that
   were true of this career. Every figure on it is the engine's. */
const RIBBONS = {
  banned:   { n: 'Banned', line: 'The league took your name off the wall.', test: (L) => !!L.flags.banned },
  never:    { n: 'Almost', line: 'The league never called. You were this close.', test: (L, X) => X.seasons === 0 },
  goat:     { n: 'The GOAT debate', line: 'They argue about you in barbershops. They always will.', test: (L, X) => X.score >= 120 },
  broke:    { n: 'Riches to rags', line: 'You made a fortune. You spent a bigger one.', test: (L) => !!L.flags.broke },
  dynasty:  { n: 'Dynasty', line: 'One ring is a great year. You built an era.', test: (L, X) => X.T.rings >= 3 },
  mogul:    { n: 'Mogul', line: 'The game paid you. Then the money did.', test: (L, X) => X.worth >= 400 },
  heart:    { n: 'Heartbreaker', line: 'The lawyers knew you by first name.', test: (L, X) => X.div >= 2 },
  family:   { n: 'Family man', line: 'A full house, and you were home for it.', test: (L, X) => X.rel === 'married' && X.kids >= 3 && !X.div },
  whatif:   { n: 'What if', line: 'The talent was never the question. The body was.', test: (L, X) => !X.hof && (X.majors >= 2 || X.hurtOut) },
  onecity:  { n: 'One city', line: 'One jersey, start to finish. They don\'t make them like you.', test: (L, X) => X.seasons >= 10 && X.clubs === 1 },
  suitcase: { n: 'Suitcase', line: 'You knew every equipment manager in the league.', test: (L, X) => X.clubs >= 5 },
  legend:   { n: 'Legend', line: 'Springfield has your jacket size.', test: (L, X) => X.hof },
  villain:  { n: 'Villain', line: 'They booed you in thirty arenas. You loved every one.', test: (L, X) => X.persona === 'Villain' || X.persona === 'Loose cannon' },
  face:     { n: 'Face of the league', line: 'Your jersey was in every gym in the country.', test: (L, X) => X.persona === 'Face of the league' },
  champ:    { n: 'Champion', line: 'You have a ring. Nobody can take that back.', test: (L, X) => X.T.rings >= 1 },
  iron:     { n: 'Iron man', line: 'You showed up. Every night, for years.', test: (L, X) => X.T.gp >= 1150 },
  star:     { n: 'All-Star', line: 'For a while you were one of the best alive.', test: (L, X) => X.T.star >= 1 },
  coffee:   { n: 'Cup of coffee', line: 'You made the league. It didn\'t last long.', test: (L, X) => X.seasons <= 4 },
  fan:      { n: 'Fan favorite', line: 'Not the best player. The one they loved.', test: (L, X) => X.persona === 'Fan favorite' || X.persona === 'Showman' },
  paid:     { n: 'Got paid', line: 'No rings, no trophies. A very nice house.', test: (L, X) => X.T.earned >= 150 },
  pro:      { n: 'Pro\'s pro', line: 'Coaches wanted twelve of you.', test: (L, X) => X.persona === 'Pro\'s pro' || X.persona === 'Quiet assassin' },
  role:     { n: 'Role player', line: 'You did your job. That is rarer than it sounds.', test: () => true },
};
const RIBBON_KEYS = Object.keys(RIBBONS);
/* What a ribbon reads. The Hall verdict is the one the career ended on when
   it has ended, so the ribbon and the Hall card never disagree. */
function ribbonFacts(L) {
  const T = totals(L), score = L.history.length ? legacyScore(T) : 0, f = lifeOf(L);
  const fin = L.final && L.final.ending;
  return {
    T, score, seasons: L.history.length, clubs: clubsOf(L), persona: personaOf(L), worth: netWorth(L),
    rel: f.rel, kids: f.kids || 0, div: f.div || 0,
    majors: (L.mem && L.mem['inj.majors'] && L.mem['inj.majors'].v) || 0, hurtOut: !!(L.mem && L.mem['end.injury']),
    hof: !L.flags.banned && (fin ? !!fin.hof : score >= 55),
  };
}
function ribbonOf(L) {
  const X = ribbonFacts(L);
  const id = RIBBON_KEYS.find((k) => RIBBONS[k].test(L, X));
  return { id, name: RIBBONS[id].n, line: RIBBONS[id].line };
}

/* THE LIFE CARD. `facts` are tried in order and the first five that are true
   are kept, so a card leads with what was rare about this life. */
const commaNum = (n) => Math.round(n).toLocaleString('en-US');
const countWord = (n, one, many) => n === 1 ? one : NUMWORDS[n] ? NUMWORDS[n] + ' ' + many : n + ' ' + many;
function lifeFacts(L, X) {
  const T = X.T, H = L.history, out = [], f = lifeOf(L);
  const add = (on, t) => { if (on) out.push(t); };
  add(L.flags.banned, 'Banned from the league for life.');
  add(T.mvp, countWord(T.mvp, 'An MVP.', 'MVPs.'));
  add(T.rings, countWord(T.rings, 'A championship.', 'championships.'));
  add(T.fmvp, countWord(T.fmvp, 'A Finals MVP.', 'Finals MVPs.'));
  add(L.flags.broke, 'Went broke in ' + L.flags.broke + '.');
  add(X.div, countWord(X.div, 'One divorce.', 'divorces.'));
  add(T.star, countWord(T.star, 'An All-Star.', 'All-Star teams.'));
  add(T.dpoy, countWord(T.dpoy, 'Defensive Player of the Year.', 'Defensive Player of the Year awards.'));
  add(T.roy, 'Rookie of the Year.');
  add(L.draft && L.draft.pick, L.draft && L.draft.pick ? 'The ' + ordinal(L.draft.pick) + ' pick in the draft.' : '');
  add(H.length && L.draft && !L.draft.pick, 'Went undrafted. Made it anyway.');
  add(X.seasons >= 10 && X.clubs === 1, 'One team for ' + X.seasons + ' seasons.');
  add(X.clubs >= 4, 'Played for ' + X.clubs + ' teams.');
  add(X.majors >= 2, X.majors + ' major injuries.');
  add(X.worth >= 100, 'Worth ' + money(X.worth) + ' at the end.');
  add(f.kids, lifeLine(L) + '.');
  add(H.length, H.length ? 'Best season: ' + Math.max(...H.map((h) => h.pts || 0)).toFixed(1) + ' points a game.' : '');
  add(T.earned >= 1, 'Earned ' + money(T.earned) + ' on the floor.');
  add(!H.length, 'Never played an NBA game.');
  return out.slice(0, 5);
}
function lifeCard(L) {
  const X = ribbonFacts(L), T = X.T, H = L.history, rb = ribbonOf(L);
  const fin = L.final || legacy(L);
  const teams = []; for (const h of H) if (h.t && teams.indexOf(h.t) < 0) teams.push(h.t);
  const from = H.length ? H[0].y : null, to = H.length ? H[H.length - 1].y : null;
  const stats = H.length ? [
    { k: 'Seasons', v: String(H.length) }, { k: 'Games', v: commaNum(T.gp) }, { k: 'Points', v: commaNum(T.pts) },
    { k: 'Rings', v: String(T.rings) }, { k: 'All-Star', v: String(T.star) }, { k: 'Worth', v: money(X.worth) },
  ] : [];
  const facts = lifeFacts(L, X);
  const head = L.name + (from ? ' · ' + (from === to ? from : from + '-' + to) : '');
  const text = [head, rb.name + ': ' + rb.line, fin.verdict + (H.length ? ' · ' + commaNum(T.pts) + ' points · ' + T.rings + (T.rings === 1 ? ' ring' : ' rings') : '')]
    .concat(facts.slice(0, 3)).join('\n');
  return {
    name: L.name, num: L.num, pos: L.pos, nick: L.nick || null, from, to, teams, last: teams.length ? teams[teams.length - 1] : null,
    ribbon: rb, verdict: fin.verdict, blurb: fin.blurb, score: fin.score || 0, persona: personaOf(L),
    stats, facts, life: lifeLine(L), ending: fin.ending ? fin.ending.names.slice(0, 3) : [], over: !!L.retired, text,
  };
}
