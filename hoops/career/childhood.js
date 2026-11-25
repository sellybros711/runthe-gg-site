// ─── before the league: a childhood ─────────────────────────────────────────

/* CHILDHOOD (the BitLife plan, phase 5, the owner's call of 2026-11-24: "The
   pro version can include childhood"). `start: 'kid'` is the high school
   start with nine cards in front of it, birth to fourteen: where he is from,
   the first ball, who taught him, the first team, the other sport, school,
   the travel team, the wrong crowd, the last summer. A year or two a card,
   so a childhood is a minute.

   The sophomore he becomes is the one `start: 'hs'` would have made off the
   same seed, SHAPED and not strengthened: every answer gives two points to
   one rating and takes one from each of two others, so the ratings add up to
   what they did. What else an answer moves (work ethic, a body that lasts,
   the people at home) is small, and it is remembered (`kid.*`) for the cards
   that come later.

   While it plays, `L.stage` is 'kid', one card is always waiting, and the
   high school year is held in `L.kid` until the last card is answered. */
const KID_AGES = [0, 3, 5, 7, 8, 10, 12, 13, 14];
const kidO = (label, hint, up, down, more, text, mem) => ({ label, hint, up, down, more: more || {}, text, mem: mem || null });
const KID = [
  { tag: 'Day one', t: (L) => 'Born in {town}.', x: () => '{mom} says you came out reaching for something. {dad} put a ball in the crib that night.',
    o: [kidO('Grow up', 'A few years go by', null, null, {}, 'You learn to walk by chasing things that roll.')] },
  { tag: 'The living room', t: () => 'A ball rolls across the floor.', x: () => 'It\'s bigger than your head. Everybody is watching what you do with it.',
    o: [kidO('Bounce it', 'Again. And again.', 'pla', ['reb', 'def'], {}, 'You bounce it until the neighbors knock. Then some more.', ['ball', 'bounced it']),
      kidO('Throw it at the lamp', 'You have a target', 'sho', ['pla', 'def'], {}, 'The lamp doesn\'t make it. {mom} is more impressed than angry.', ['ball', 'threw it']),
      kidO('Run off with it', 'Catch me', 'ath', ['iq', 'sho'], {}, 'Nobody in the house can catch you. Nobody ever will.', ['ball', 'ran'])] },
  { tag: 'The driveway', t: () => 'Who teaches you the game?', x: () => 'There\'s a hoop, a cracked driveway and a lot of daylight.',
    o: [kidO('{dad}, every evening', 'Form first. Fun later.', 'sho', ['ath', 'fin'], { eth: 3, rel: ['dad', 12, 'Taught you to shoot in the driveway.'] }, 'Elbow in. Follow through. One hundred makes before dinner.', ['teacher', 'dad']),
      kidO('The big kids at the park', 'Nobody calls fouls', 'def', ['sho', 'pla'], { dur: 2 }, 'You lose every game for a year. Then you stop losing.', ['teacher', 'park']),
      kidO('Nobody. Just you.', 'Hours alone with a ball', 'pla', ['iq', 'reb'], { eth: 2, morale: -2 }, 'You invent moves nobody taught you. Some of them even work.', ['teacher', 'self'])] },
  { tag: 'The rec league', t: () => 'Your first real team.', x: () => 'The jerseys hang to your knees. The coach asks what you want to play.',
    o: [kidO('Bring the ball up', 'Run the show', 'pla', ['reb', 'fin'], {}, 'You point where people should go. They go.', ['first', 'guard']),
      kidO('Stand under the basket', 'Get every rebound', 'reb', ['pla', 'sho'], {}, 'Nine rebounds a game. Half of them off your own misses.', ['first', 'big']),
      kidO('Shoot every time', 'Somebody has to score', 'fin', ['pla', 'def'], { fame: 1 }, 'Twenty of your team\'s twenty-four. The other parents have opinions.', ['first', 'scorer'])] },
  { tag: 'Sign-up day', t: () => 'One more sport?', x: () => '{mom} has the forms on the kitchen table. Pick one or none.',
    o: [kidO('Soccer', 'Run all day', 'ath', ['reb', 'sho'], { dur: 3 }, 'You never stop running. Your lungs remember it for twenty years.', ['sport', 'soccer']),
      kidO('Football', 'Hit somebody', 'def', ['pla', 'sho'], { dur: -3 }, 'You learn you like contact. Your knees learn something too.', ['sport', 'football']),
      kidO('Chess club', 'Think three moves ahead', 'iq', ['ath', 'reb'], {}, 'You see the board. Later you\'ll see the floor the same way.', ['sport', 'chess']),
      kidO('Only basketball', 'Why would I do anything else?', 'sho', ['ath', 'iq'], { eth: 2 }, 'Same gym, same ball, every day of the year.', ['sport', 'hoops'])] },
  { tag: 'Fifth grade', t: () => 'Homework or the park?', x: () => 'The streetlights come on at seven. The math is due tomorrow.',
    o: [kidO('Homework first', 'Then the park', 'iq', ['fin', 'pla'], { eth: 3, rel: ['mom', 8, 'You did the homework first.'] }, '{mom} checks it. Then she rebounds for you until dark.', ['school', 'books']),
      kidO('The park. Always the park.', 'Math can wait', 'fin', ['iq', 'def'], { eth: -2, rel: ['mom', -6, 'You skipped the homework.'] }, 'You\'re the best ten year old at the park. Your teacher writes a note home.', ['school', 'park'])] },
  { tag: 'A phone call', t: () => 'A travel team wants you.', x: () => 'Tournaments in four states. It costs more than the rent. {mom} says she\'ll find a way.',
    o: [kidO('Go', 'Play the best kids in the country', 'fin', ['reb', 'def'], { fame: 3, rel: ['mom', 10, 'She worked doubles for your travel team.'] }, '{mom} picks up a second job. You don\'t find out for years.', ['aau', 'went']),
      kidO('Stay with your friends', 'Your team, your town', 'pla', ['fin', 'ath'], { morale: 4, rel: ['friend', 15, 'You stayed on the town team with him.'] }, 'You win the town league by forty. {friend} never forgets you stayed.', ['aau', 'stayed'])] },
  { tag: 'Behind the corner store', t: () => 'Your friends have a plan.', x: () => 'It involves the corner store and nobody paying. They look at you.',
    o: [kidO('Go along', 'Everybody else is', 'ath', ['iq', 'pla'], { eth: -3, rel: ['friend', 8, 'You went along with it.'] }, 'You run faster than the owner. You don\'t feel fast.', ['crowd', 'along']),
      kidO('Walk away', 'Not today', 'iq', ['ath', 'fin'], { eth: 2 }, 'You go shoot instead. They call you soft for a week.', ['crowd', 'walked']),
      kidO('Talk them out of it', 'You are the loud one', 'pla', ['def', 'reb'], { eth: 1, rel: ['friend', 4, 'You talked him out of it.'] }, 'It takes ten minutes and one good joke. Nobody goes in.', ['crowd', 'talked'])] },
  { tag: 'The last summer', t: () => 'High school starts in the fall.', x: () => 'One summer left to be a kid. What do you do with it?',
    o: [kidO('Live in the gym', 'Six hours a day', 'sho', ['pla', 'reb'], { eth: 3, health: -3 }, 'The janitor gives you a key. You stop needing daylight.', ['summer', 'gym']),
      kidO('Grow into your body', 'Eat, sleep, lift', 'reb', ['pla', 'fin'], { dur: 3 }, 'Two inches and fifteen pounds. Your shoes stop fitting in July.', ['summer', 'body']),
      kidO('Be a kid', 'Pool, bikes, nothing', 'ath', ['sho', 'iq'], { morale: 6 }, 'The best summer of your life. You\'ll think about it in hotel rooms.', ['summer', 'kid'])] },
];
function kidCard(L, i) {
  const k = KID[i];
  return {
    id: 'kid', kind: 'event', key: 'kid:' + i, eyebrow: 'Age ' + KID_AGES[i] + ' · ' + k.tag, scene: k.tag,
    title: k.t(L), text: k.x(L), ctx: { i },
    options: k.o.map((o) => ({ label: o.label, hint: o.hint })),
  };
}
/* Put the nine cards in front of a made sophomore (newLife). */
function startChildhood(L) {
  L.kid = { i: 0, age: L.age, year: L.year, stage: L.stage, pending: L.pending, log: L.log, picks: [] };
  L.stage = 'kid';
  L.age = KID_AGES[0];
  L.year = L.kid.year - (L.kid.age - L.age);
  L.log = [];
  L.pending = [kidCard(L, 0)];
  logIt(L, 'Born in {town}.', '');
}
ANSWER.kid = function(L, card, i) {
  const K = L.kid, idx = card.ctx.i, o = KID[idx].o[i];
  K.picks.push(i);
  /* A point moves only when both ends can take it, so the ratings add up to what they did. */
  if (o.up) for (const d of o.down) if (L.rt[d] > 25 && L.rt[o.up] < 88) { L.rt[d]--; L.rt[o.up]++; }
  const m = Object.assign({}, o.more), rel = m.rel; delete m.rel;
  bump(L, m);
  if (rel) relate(L, rel[0], rel[1], rel[2]);
  if (o.mem) remember(L, 'kid.' + o.mem[0], o.mem[1]);
  if (idx + 1 < KID.length) {
    K.i = idx + 1;
    L.age = KID_AGES[K.i];
    L.year = K.year - (K.age - L.age);
    L.pending.push(kidCard(L, K.i));
  } else {
    /* Fifteen: the sophomore the road made, with a childhood behind him. */
    L.age = K.age; L.year = K.year; L.stage = K.stage;
    L.log = L.log.concat(K.log);
    L.pending = L.pending.concat(K.pending);
    L.kid = { done: 1, picks: K.picks };
  }
  return said(o.text, '');
};
/* Where a childhood stands, for the screen. */
function kidOf(L) {
  if (!L.kid) return null;
  if (L.kid.done) return { done: true, picks: L.kid.picks.slice() };
  return { done: false, i: L.kid.i, of: KID.length, age: L.age, picks: L.kid.picks.slice() };
}
