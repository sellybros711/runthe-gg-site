// ─── who a line is about ────────────────────────────────────────────────────

/* A school keeps its coach until he leaves for the league. */
function colCoachName(L, school) {
  const v = L.am && L.am.college === school ? (L.am.cv || 0) : 0;
  return personName(L, 'colcoach:' + school + ':' + v);
}
/* The coach a line means, wherever the career is. */
function myCoach(L) {
  if (L.stage !== 'nba' && L.am) {
    if (L.am.level === 'col' && L.am.college) return colCoachName(L, L.am.college);
    if (L.am.level === 'pro') return personName(L, 'procoach:' + (L.am.route || 'gl'));
    return personName(L, 'hscoach:' + (L.am.hs ? L.am.hs.name : 'hs'));
  }
  if (L.team) return coachName(L, L.team) || personName(L, 'coach:' + L.team);
  return personName(L, 'eurocoach');
}
function mateBy(L, tag) {
  const list = myMates(L).slice(0, 9);
  if (!list.length) return personName(L, 'mate:' + tag);
  const r = rngAt(L, 'mate:' + tag);
  return list[Math.floor(r() * list.length)].n;
}
/* ─── the locker room ──────────────────────────────────────────────────────
   On a story career in the league, the locker room is the REAL one: {tvet} is
   the oldest man on your club, {trook} the youngest, {tco} the best of the rest,
   and {tm} and {tm2} two of those three. {topp} is a real player on another club
   and a feud's {foe} is one too. The owner's call (2026-10): invented names in
   a feud or a fight were too hard to follow. Who is in the room is read off
   today's rosters at the moment the card is drawn, so a traded or retired man
   is never named. Everywhere else (high school, college, overseas) there is
   no real roster to read, so every club
   carries three invented players, seeded per career, club and three-season era,
   who turn over the way a real bench does. */
const LOCKER_ROLES = [['vet', 31, 4], ['rook', 20, 2], ['co', 25, 3]];
function realLocker(L, club) {
  if (L.stage !== 'nba' || CLUBS.indexOf(club) < 0) return null;
  const m = matesOf(L, club).filter((x) => x.n);
  if (m.length < 3) return null;
  const left = m.slice();
  const take = (f) => { const i = left.indexOf(f(left)); return left.splice(i, 1)[0]; };
  const vet = take((a) => a.reduce((b, x) => x.age > b.age ? x : b));
  const rook = take((a) => a.reduce((b, x) => x.age < b.age ? x : b));
  const co = left[0];
  return [['vet', vet], ['rook', rook], ['co', co]].map((x) => ({ n: x[1].n, role: x[0], age: x[1].age, real: x[1].real ? 1 : 0 }));
}
function lockerOf(L, club) {
  club = club || L.team || (L.am && (L.am.college || (L.am.hs && L.am.hs.name))) || 'am';
  const real = realLocker(L, club);
  if (real) return real;
  return LOCKER_ROLES.map(function(x, i) {
    const era = Math.floor((L.year + i) / 3);
    const key = 'lk:' + club + ':' + x[0] + ':' + era;
    const r = rngAt({ seed: L.seed, year: 0 }, key);
    return { n: personName(L, key), role: x[0], age: x[1] + Math.floor(r() * x[2]) };
  });
}
/* A real player on another club, for a story card about somebody across the
   league: one of the top four on a club drawn off the key, the same
   conference twice as often, because that is who you see four times. */
function realOpp(L, key) {
  if (L.stage !== 'nba') return null;
  const r = rngAt(L, 'ropp:' + key);
  const conf = L.team ? confOf(L.team) : 'East';
  const pool = CLUBS.filter((c) => c !== L.team && (confOf(c) === conf || r() < 0.5));
  for (let i = 0; i < 4 && pool.length; i++) {
    const c = pool.splice(Math.floor(r() * pool.length), 1)[0];
    const m = matesOf(L, c).slice(0, 4).filter((x) => x.n);
    if (m.length) return m[Math.floor(r() * m.length)].n;
  }
  return null;
}
function lockerBy(L, tag) {
  const m = lockerOf(L);
  const r = rngAt(L, 'lkby:' + tag);
  return m[Math.floor(r() * m.length)].n;
}
/* The recurring cast: invented people with fixed names, the same in every
   career, so they become familiar. NARRATIVE.md section 9 is who they are. */
/* Which tokens resolve to a real person. An event that is not on the list
   below may not use one, and check-career holds that. The list is short and
   every entry says why it is basketball. */
const REAL_TOKENS = ['vet', 'star', 'blocker', 'rookie', 'mate', 'mate2', 'opp', 'opp2', 'coach', 'oldcoach', 'firedcoach', 'interim', 'bigname', 'rivalcoach'];
const INVENTED_TOKENS = ['tm', 'tm2', 'tvet', 'trook', 'tco', 'topp', 'rival', 'beat', 'critic', 'fan', 'shoeexec', 'aau', 'friend', 'trainer', 'press', 'pbp', 'ellis', 'lazlo', 'gm', 'owner', 'agent', 'foe', 'oldvet', 'campkid', 'bff',
  'sonny', 'maya', 'dre', 'father', 'rookie2', 'costar', 'exec', 'mascot'];
const BASKETBALL_ONLY = {
  slump: 'the coach shortens a rotation leash',
  coach_bench: 'the coach decides minutes',
  stuck: 'a real starter is ahead of you and the coach decides who plays',
  film_session: 'film, scheme and the coach running it',
  hot_streak: 'the coach runs more plays for you',
  coach_fired: 'a coaching change: hirings and firings',
  teammate_fight: 'the coach runs practice; the teammate is invented',
  playoff_eve: 'the coach hands out a defensive assignment',
};
const CAST = {
  beat: 'Kelvin Shaw', critic: 'Bram Talbot', fan: 'Big Lou Petrakis', trainer: 'Nadia Ferro',
  shoeexec: 'Grant Hollis', aau: 'Ed Vickers', friend: 'Tavian Price', press: 'June Kimura', pbp: 'Rocco Vance',
  shadyagent: 'Sonny Rial', straightagent: 'Maya Okonkwo', ellis: 'Old Man Ellis', lazlo: 'Victor Lazlo', dre: 'Dre Calloway', bookie: 'Nicky Two Phones',
};
function agentNameFor(L, k) {
  return k === 'cousin' ? kinName(L, 'cousin', 'm') : personName(L, 'agent:' + k, k === 'power' ? 'm' : 'f');
}
function peopleKey(L, k) {
  const ag = L.agent || 'boutique';
  switch (k) {
    case 'coach': return myCoach(L);
    case 'hscoach': return personName(L, 'hscoach:' + (L.am && L.am.hs ? L.am.hs.name : (L.flags.hsName || 'hs')));
    case 'gm': return personName(L, 'gm:' + (L.team || 'none'));
    case 'owner': return personName(L, 'owner:' + (L.team || 'none'));
    case 'agent': return agentNameFor(L, ag);
    case 'newagent': return agentNameFor(L, 'power');
    case 'cousin': return kinName(L, 'cousin', 'm');
    case 'mom': return firstOf(kinName(L, 'mom', 'f'));
    case 'dad': return firstOf(kinName(L, 'dad', 'm'));
    case 'partner': return firstOf(personName(L, 'partner:' + (lifeOf(L).pn || 0), 'x'));
    case 'trainer': return CAST.trainer;
    case 'doctor': return personName(L, 'doctor:' + (L.team || 'am'), 'x');
    case 'scout': return personName(L, 'scout:' + L.year);
    case 'booster': return personName(L, 'booster:' + (L.am && L.am.college || ''));
    case 'roommate': return personName(L, 'roommate:' + (L.am && L.am.college || ''));
    case 'friend': return CAST.friend;
    case 'reporter': return personName(L, 'reporter:' + L.year, 'x');
    case 'adviser': return personName(L, 'adviser:' + (L.am && L.am.college || ''), 'f');
    case 'commish': return personName(L, 'commish');
    case 'streetagent': return personName(L, 'street');
    case 'vet': { const m = myMates(L).slice().sort((a, b) => b.age - a.age); return m.length ? m[0].n : personName(L, 'vet'); }
    case 'star': { const m = myMates(L); return m.length ? m[0].n : personName(L, 'star'); }
    case 'blocker': { const m = myMates(L).filter((x) => x.pos === L.pos); return (m[0] || myMates(L)[0] || { n: personName(L, 'blocker') }).n; }
    case 'rookie': { const m = myMates(L).slice().sort((a, b) => a.age - b.age); return m.length ? m[0].n : personName(L, 'rookie'); }
    case 'mate': return mateBy(L, 'a:' + L.steps);
    case 'mate2': return mateBy(L, 'b:' + L.steps);
    case 'oldcoach': return (L.flags.leave && L.flags.leave.n) || myCoach(L);
    case 'leaveclub': return L.flags.leave ? nick(L.flags.leave.club) : 'Pistons';
    case 'tutor': return personName(L, 'tutor', 'f');
    case 'prof': return personName(L, 'prof:' + (L.am && L.am.college || ''), 'x');
    case 'prepstar': return personName(L, 'prepstar:' + (L.am ? L.am.town : ''));
    case 'coachson': return firstOf(personName(L, 'son')) + ' ' + lastOf(myCoach(L));
    case 'crush': return firstOf(personName(L, 'crush', 'x'));
    case 'colcoach2': return personName(L, 'campcoach:' + L.year);
    case 'firedcoach': return (L.flags.search && L.flags.search.out) || coachName(L, L.team);
    case 'interim': return (L.flags.search && L.flags.search.asst && L.flags.search.asst.n) || myCoach(L);
    case 'bigname': return (L.flags.search && L.flags.search.big && L.flags.search.big.n) || myCoach(L);
    case 'opp': case 'opp2': return oppStar(L, k);
    case 'tm': return lockerBy(L, 'a:' + L.steps);
    case 'tm2': { const m = lockerOf(L), x = lockerBy(L, 'a:' + L.steps); const o = m.filter((p) => p.n !== x); return (o[0] || m[0]).n; }
    case 'tvet': return lockerOf(L)[0].n;
    case 'trook': return lockerOf(L)[1].n;
    case 'tco': return lockerOf(L)[2].n;
    case 'topp': return realOpp(L, 'topp:' + L.steps) || personName(L, 'topp:' + L.steps);
    case 'rival': return L.rival ? L.rival.name : CAST.dre;
    case 'foe': return arcData(L, 'feud').n || personName(L, 'foe');
    case 'oldvet': return arcData(L, 'mentor').n || personName(L, 'oldvet');
    case 'campkid': return arcData(L, 'gym').kid || personName(L, 'campkid');
    case 'school2': return arcData(L, 'prep').school || 'State';
    case 'bff': { const b = bestMate(L); return b ? b.n : lockerOf(L)[0].n; }
    case 'beat': case 'critic': case 'fan': case 'shoeexec': case 'aau': case 'press': case 'pbp': case 'ellis': case 'lazlo': case 'bookie': return CAST[k];
    case 'sonny': return CAST.shadyagent;
    case 'maya': return CAST.straightagent;
    case 'dre': return CAST.dre;
    case 'father': return kinName(L, 'dad', 'm');
    case 'town': return (L.am && L.am.town) || L.flags.town || 'home';
    case 'abroad': { const m = recall(L, 'origin.abroad'); return m ? m.v : 'home'; }
    case 'school': { if (L.am && L.am.college) return L.am.college; const h = (L.amHist || []).filter((x) => x.lvl === 'NCAA').pop(); return h ? h.school : 'your old school'; }
    case 'club': return L.team ? nick(L.team) : 'club';
    case 'rookie2': return personName(L, 'rookie2:' + (L.team || '') + ':' + Math.floor(L.year / 3));
    case 'costar': return arcData(L, 'costar').n || personName(L, 'costar');
    case 'exec': return personName(L, 'exec:' + L.year, 'x');
    case 'mascot': return 'Rumble';
    case 'ref': return personName(L, 'ref:' + L.steps);
    case 'guru': return personName(L, 'guru', 'x');
    case 'rivalcoach': { const r = rngAt(L, 'rc:' + L.steps); const cs = CLUBS.filter((c) => c !== L.team); return coachName(L, pick(r, cs)); }
    default: return null;
  }
}
/* A real star on another club, for a line about somebody across the league.
   The same conference first, because that is who you see four times. */
function oppStar(L, k) {
  const r = rngAt(L, 'opp:' + L.steps);
  const conf = L.team ? confOf(L.team) : 'East';
  const clubs = CLUBS.filter((c) => c !== L.team && confOf(c) === conf);
  const c1 = pick(r, clubs);
  let c2 = pick(r, clubs);
  if (c2 === c1) c2 = clubs[(clubs.indexOf(c1) + 1) % clubs.length];
  const m = matesOf(L, k === 'opp2' ? c2 : c1);
  return m.length ? m[0].n : personName(L, 'opp:' + k);
}
/* Fills {coach}, {mom}, {vet:last} and the rest. A token nobody knows is
   left as it is, so check-career can find it. */
const TOKEN = /\{([a-z0-9]+)(?::(last|first))?\}/gi;
function say(L, s) {
  if (typeof s !== 'string' || s.indexOf('{') < 0) return s;
  return s.replace(TOKEN, (m, k, part) => {
    const v = peopleKey(L, k.toLowerCase());
    if (v == null) return m;
    return part === 'last' ? lastOf(v) : part === 'first' ? firstOf(v) : v;
  }).replace(/\b(Jr|Sr)\.\./g, '$1.');
}
/* The card on top, every beat, and the last answer, said in names. Only the
   card on top: one waiting behind it is named when it gets there, so a coach
   fired by the card in front is not the coach the next card talks about. */
function sayAll(L, beats) {
  for (const c of L.pending.slice(0, 1)) {
    if (c.named) continue;
    c.named = 1;
    varyCard(L, c);
    narrate(L, c);
    if (c.lead) c.lead = say(L, c.lead);
    c.title = say(L, c.title); c.text = say(L, c.text); c.eyebrow = say(L, c.eyebrow); if (c.scene) c.scene = say(L, c.scene);
    for (const o of c.options || []) { o.label = say(L, o.label); if (o.hint) o.hint = say(L, o.hint); }
  }
  for (const b of beats || []) if (b && b.text) b.text = say(L, b.text);
}
