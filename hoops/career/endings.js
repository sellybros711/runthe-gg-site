// ─── more ways out ──────────────────────────────────────────────────────────

/* ENDINGS, the owner's call of 2026-10-15 and 2026-10-16: a career is limitless
   in what it can be and still ends, at a retirement or when the league is done
   with you. Before this, nearly every career ended on the retirement card or a
   summer nobody called. These are the other ways real careers end:

     careerInjury  a major injury that ends it. Far likelier the worse your
                   health is (the owner's call), and likelier with age and an
                   injury prone body. Read on its own stream, so an injury that
                   does not end a career is the injury it always was.
     onTop         a ring or an MVP past thirty, and the question of whether
                   to walk away while you are the best version of yourself
     waived        the club cuts a man who has fallen out of its rotation, with
                   a contract still running; then free agency, and if nobody
                   calls, a last wait for a ten day contract
     finale        one last season in Europe, offered on the retirement card to
                   a man below FINALE_BELOW: stars do not finish abroad, and
                   offering it to them cut the greatest careers short */
const FINALE_BELOW = 74;

/* THE CAREER ENDING INJURY, per major injury, off how healthy the body is.
   The health meter refills every summer, so the body is read as durability
   and the meter together (bodyOf), less for every major injury already
   taken. A sound body (80 and up) almost never ends this way; a worn one
   (40) does about one major injury in four. Age adds to it. */
const bodyOf = (L) => 0.6 * L.dur + 0.4 * L.m.health - 8 * ((L.mem && L.mem['inj.majors'] && L.mem['inj.majors'].v) || 0);
function careerEndP(L) {
  return clamp(0.01 + Math.max(0, 80 - bodyOf(L)) * 0.006 + Math.max(0, L.age - 30) * 0.01
    + (trait(L, 'injuryProne') ? 0.03 : 0) - (trait(L, 'ironMan') ? 0.03 : 0), 0.005, 0.4);
}
function careerInjuryCard(L, kind) {
  return {
    id: 'careerinj', kind: 'event', key: 'careerinj', eyebrow: 'Injury report', scene: 'The surgeon\'s office',
    title: 'It\'s worse than a ' + kind + '.',
    text: 'Dr. {doctor:last} doesn\'t sit down. "You can walk normally again. Playing is a different question."',
    ctx: { kind },
    options: [
      { label: 'Retire', hint: 'Walk away with your body' },
      { label: 'Try to come back', hint: 'A year of rehab. No promises.' },
    ],
  };
}
ANSWER.careerinj = function(L, card, i, opt, rng, beats) {
  if (i === 0) {
    remember(L, 'end.injury', card.ctx.kind);
    retire(L, beats, 'An injury ended it at ' + L.age + '.');
    return said('You call {agent:first} from the parking lot. Then your mom.', 'gold');
  }
  remember(L, 'end.comeback', L.year);
  const s = L.season;
  if (s && s.injury) s.injury.until = GAMES + 1;
  bump(L, { ath: -6, dur: -12, health: -10, morale: -6 });
  logIt(L, 'Out for the season. A long road back.', 'bad');
  return said('The rest of the season is a rehab room. Your teammates send videos.', 'bad');
};

/* WALK AWAY ON TOP. Once, the summer after a ring or an MVP, for a man past
   his peak (32 or older, his overall below his best): the way real careers
   end on top. Asked of a man still climbing, it cut the greatest careers
   short in the sweep. */
function onTopCard(L) {
  if (L.age < 32 || L.flags.onTop) return;
  if (ovrOf(L) >= Math.max(...L.history.map((h) => h.ovr || 0))) return;
  const h = L.history[L.history.length - 1];
  if (!h || (h.po !== 'Champion' && (h.aw || []).indexOf('mvp') < 0)) return;
  if (rngAt(L, 'ontop')() >= 0.5) return;
  L.flags.onTop = L.year;
  const won = h.po === 'Champion' ? 'a ring' : 'the MVP';
  L.pending.unshift({
    id: 'ontop', kind: 'event', key: 'ontop', eyebrow: 'The summer', scene: 'Home',
    title: 'You just won ' + won + '. Walk away?', text: 'You\'re ' + L.age + '. Nobody would blame you. Nobody would forget it either.',
    ctx: { won },
    options: [{ label: 'Keep playing', hint: 'There\'s more in the tank' }, { label: 'Walk away on top', hint: 'Leave them wanting more' }],
  });
}
ANSWER.ontop = function(L, card, i, opt, rng, beats) {
  if (i === 1) {
    remember(L, 'end.top', card.ctx.won);
    retire(L, beats, 'Walked away on top at ' + L.age + ', fresh off ' + card.ctx.won + '.');
    return said('One press conference. No farewell tour. You leave while they still want more.', 'gold');
  }
  bump(L, { morale: 4 });
  return said('You tell {gm} you\'re not done. He was hoping you\'d say that.');
};

/* WAIVED. A man past twenty-nine, far out of his club's rotation, with a
   deal still running: some summers the club eats the money. */
function waiveCheck(L, beats) {
  const c = L.contract;
  if (!L.team || !c || c.years <= 0 || L.age < 29) return false;
  if (effOvr(L) > rotationBar(clubNet(L, L.team)) - 12) return false;
  if (rngAt(L, 'waive')() >= 0.5) return false;
  const t = 'The ' + E.teamName(L.team) + ' waive you. They\'ll pay out the deal. They just don\'t want you on the floor.';
  remember(L, 'end.waived', L.team);
  beats.push({ kind: 'cut', text: t, tone: 'bad' });
  logIt(L, 'Waived by the ' + E.teamName(L.team) + '.', 'bad');
  L.team = null;
  L.contract = null;
  bump(L, { morale: -10, fame: -3 });
  return true;
}
/* The ten day wait, from the summer nobody called. */
function tenDay(L, beats, rng) {
  const p = clamp(0.3 + (ovrOf(L) - 60) * 0.03, 0.05, 0.75);
  if (ok(rng, p)) {
    const to = CLUBS.slice().sort((a, b) => clubNet(L, a) - clubNet(L, b) || (a < b ? -1 : 1))[Math.floor(rng() * 8)];
    L.contract = { years: 1, total: 1, salary: round1(capFor(L.year) * MIN_PCT), kind: 'min', start: L.year + 1 };
    joinTeam(L, to, false);
    remember(L, 'end.tenday', to);
    logIt(L, 'A ten day contract with the ' + E.teamName(to) + ', then the rest of the season.', 'gold');
    return said('January. Your phone buzzes at six in the morning. A ten day with the ' + nick(to) + '. Then another. Then the rest of the season.', 'gold');
  }
  retire(L, beats, 'Cut, and never signed again. Retired at ' + L.age + '.');
  return said('You keep your bag packed until March. Nobody calls.', 'bad');
}
