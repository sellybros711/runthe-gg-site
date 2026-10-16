// ─── your moves ─────────────────────────────────────────────────────────────

/* MOVES, the owner's call of 2026-10-16: things a player does on purpose, not
   things that happen to him, as many as the league's history and today's
   league offer. A move sits in ACTS beside the coach and the vacation, so the
   page reads it the same way (actsOpen, act). Each is open only when it is
   real for a man in your spot, and each one changes something that lasts: a
   contract, a club, a role, a body, a name, or a story that comes back.

   `group` is for the screen: team (where you play and for what), court (how
   you play), body, brand (money and a name off the court) and life.

   A move that needs an answer pushes a card, answered in ANSWER beside it, the
   way every system card is. A move that settles in the summer leaves a flag the
   offseason reads (L.flags.tradeAsk 'contender', L.flags.ringChase). */

const IN_SEASON = ['pre', 'early', 'mid'];
const lastAw = (L) => (L.history.length ? L.history[L.history.length - 1].aw || [] : []);
const allNBA = (L) => lastAw(L).some((a) => /^an[123]$/.test(a)) || lastAw(L).indexOf('mvp') >= 0;
/* The best clubs in the league tonight, best first. */
const contenders = (L, n) => CLUBS.filter((c) => c !== L.team).sort((a, b) => clubNet(L, b) - clubNet(L, a) || (a < b ? -1 : 1)).slice(0, n || 4);
const moveCard = (id, key, eyebrow, scene, title, text, options, ctx) => ({ id, kind: 'event', key, eyebrow, scene, title, text, ctx: ctx || {}, options });
const NO_RES = { made: null, won: null, shots: null, contest: null };
const said = (text, tone) => Object.assign({ text, tone: tone || '' }, NO_RES);

/* SIGNATURE SHOES. The brands are puns on real ones, goofy on purpose (the
   owner's call, 2026-10-16). Never a real brand's name. */
const SHOE_BRANDS = [
  { n: 'Nikey Mouse', pitch: 'A swoosh shaped like a smile. They promise the biggest campaign.', cash: 1.6, fame: 8 },
  { n: 'Adidon\'t', pitch: 'Three stripes and a lot of attitude. They want you as the face.', cash: 1.2, fame: 6 },
  { n: 'Under Armpit', pitch: 'They make the sweatiest gear in sports and they are proud of it.', cash: 1.0, fame: 4 },
  { n: 'New Ballance', pitch: 'Dad shoes, but fast. Your grandpa already owns six pairs.', cash: 0.8, fame: 3 },
  { n: 'Pooma', pitch: 'A cat logo that looks a little tired. Huge in Europe.', cash: 0.9, fame: 4 },
  { n: 'Reebonk', pitch: 'They put a pump in the tongue. It plays a sound when you dunk.', cash: 0.7, fame: 5 },
];
function shoeOffers(L) {
  const r = rngAt(L, 'shoe');
  const pool = SHOE_BRANDS.slice();
  const out = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
}

Object.assign(ACTS, {
  // ── team: where you play, and for what ──
  contender: {
    group: 'team', name: 'Ask to go to a contender', blurb: 'A trade to a winner, this summer.', cost: () => 0,
    when: (L) => !!(L.team && L.contract && L.contract.years >= 2 && !L.flags.tradeAsk && IN_SEASON.indexOf(L.phase) >= 0 && L.age >= 27 && clubNet(L, L.team) < 2),
    run(L) { L.flags.tradeAsk = 'contender'; remember(L, 'move.contender', true); bump(L, { trust: -12, fame: 2 }); relate(L, 'gm', -10, 'You asked out to a contender.'); return '{agent:first} tells {gm} you want a ring before you want anything else. It leaks by lunch.'; },
  },
  recruit: {
    group: 'team', name: 'Recruit a star', blurb: 'Call a star and sell him your city.', cost: () => 0,
    when: (L) => !!(L.team && L.phase === 'off' && L.m.fame >= 60 && ovrOf(L) >= 78 && !(L.flags.recruit && L.flags.recruit >= L.year - 2)),
    run(L, r) {
      L.flags.recruit = L.year;
      const pitch = 0.25 + (L.m.fame - 60) * 0.008 + (ovrOf(L) - 78) * 0.012 + (clubNet(L, L.team) >= 0 ? 0.1 : 0);
      if (ok(r, pitch)) {
        L.league.net[L.team] = round1(clubNet(L, L.team) + 2.5);
        remember(L, 'move.recruit', true);
        bump(L, { morale: 6, fame: 3, trust: 4 });
        logIt(L, 'Recruited a star to the ' + nick(L.team) + '.', 'gold');
        return 'Three dinners and a lot of texts. He signs. The ' + nick(L.team) + ' are a different team now.';
      }
      remember(L, 'move.recruit.missed', true);
      bump(L, { morale: -3, trust: -2 });
      return 'He listens. He signs somewhere else. The texts you sent leak anyway.';
    },
  },
  holdout: {
    group: 'team', name: 'Hold out for a new deal', blurb: 'Skip camp until they pay you.', cost: () => 0,
    when: (L) => !!(L.team && L.phase === 'off' && L.contract && L.contract.years >= 2 && L.contract.kind !== 'rookie' && ovrOf(L) >= 78
      && L.contract.salary < marketSalary(L, ovrOf(L)) * 0.8 && !recall(L, 'move.holdout')),
    run(L) {
      remember(L, 'move.holdout', true);
      const sal = round1(Math.min(marketSalary(L, ovrOf(L)), capFor(L.year) * maxPct(L)));
      L.pending.push(moveCard('holdout', 'holdout', 'Training camp', 'Your house', 'Camp opens without you.',
        '{gm} calls on day three. "We can talk. We can\'t do what you\'re asking." You\'re worth ' + money(sal) + '.',
        [{ label: 'Stay out until they pay', hint: 'All or nothing' }, { label: 'Report and play it out', hint: 'Take the fine, keep the peace' }], { sal }));
      bump(L, { trust: -10, fame: 3 });
      return 'You don\'t report. Your locker sits empty on media day.';
    },
  },
  supermax: {
    group: 'team', name: 'Ask for the supermax', blurb: 'All-NBA earns you the biggest deal there is.', cost: () => 0,
    when: (L) => !!(L.team && L.phase === 'off' && L.contract && L.contract.years >= 1 && L.contract.years <= 2 && allNBA(L) && L.age <= 31 && !L.flags.smax),
    run(L) {
      L.flags.smax = L.year;
      const sal = round1(capFor(L.year) * 0.35);
      L.pending.push({
        id: 'extension', kind: 'event', key: 'smax', eyebrow: 'The supermax', scene: "GM's office",
        title: 'Five years. The most they can pay you.',
        text: '{gm} has the paper ready. Five years at ' + money(sal) + ' a year. "This is what All-NBA buys."',
        ctx: { sal, years: 5 },
        options: [{ label: 'Sign the supermax', hint: 'Set for life' }, { label: 'Not yet', hint: 'Keep your options open' }],
      });
      return '{agent:first} makes one phone call. That\'s all it takes.';
    },
  },
  discount: {
    group: 'team', name: 'Take less to stay', blurb: 'A hometown discount, so they can add help.', cost: () => 0,
    when: (L) => !!(L.team && L.phase === 'off' && L.contract && L.contract.years === 1 && L.contract.kind !== 'rookie' && ovrOf(L) >= 74 && !recall(L, 'move.discount')),
    run(L) {
      remember(L, 'move.discount', true);
      const sal = round1(Math.max(capFor(L.year) * MIN_PCT, L.contract.salary * 0.8));
      L.contract = { years: 4, total: 3, salary: L.contract.salary, next: sal, kind: 'vet', start: L.year };
      L.league.net[L.team] = round1(clubNet(L, L.team) + 1.2);
      bump(L, { trust: 12, morale: 4, fame: 2 });
      relate(L, 'gm', 15, 'You took less to stay.');
      logIt(L, 'Took a discount to stay: three more years at ' + money(sal) + ' a year.', 'gold');
      return 'Three more years at ' + money(sal) + '. {gm} uses the room on a real piece. The fans notice.';
    },
  },
  buyout: {
    group: 'team', name: 'Ask for a buyout', blurb: 'Give back money, join a contender now.', cost: () => 0,
    when: (L) => !!(L.team && L.phase === 'mid' && L.age >= 31 && L.contract && L.contract.years >= 1 && clubNet(L, L.team) <= -2 && !recall(L, 'move.buyout')),
    run(L, r) {
      remember(L, 'move.buyout', true);
      const to = contenders(L, 3)[Math.floor(r() * 3)];
      const give = round1(L.contract.salary * 0.12);
      L.cash = round1(L.cash - give);
      tradeTo(L, to, r);
      TRADED = null;
      L.contract = { years: 1, total: 1, salary: round1(capFor(L.year) * MIN_PCT), kind: 'min', start: L.year };
      bump(L, { morale: 6, trust: -4 });
      logIt(L, 'Bought out. Signed with the ' + E.teamName(to) + ' for the stretch run.', 'gold');
      return 'You give back ' + money(give) + '. Two days later you\'re in a ' + nick(to) + ' uniform for the stretch run.';
    },
  },
  ringchase: {
    group: 'team', name: 'Chase a ring', blurb: 'Next summer, take the minimum from a contender.', cost: () => 0,
    when: (L) => !!(L.team && L.age >= 31 && L.contract && L.contract.years === 1 && IN_SEASON.indexOf(L.phase) >= 0 && !L.flags.ringChase && totals(L).rings === 0),
    run(L) { L.flags.ringChase = L.year; remember(L, 'move.ringchase', true); bump(L, { morale: 3 }); return 'You tell {agent:first} the money doesn\'t matter anymore. He doesn\'t believe you. Then he does.'; },
  },
  agent: {
    group: 'team', name: 'Fire your agent', blurb: 'Change agencies. It costs you a friend.', cost: () => 0,
    when: (L) => !!(L.phase === 'off' && L.agent && L.seasonsDone >= 2 && !(L.flags.firedAgent && L.flags.firedAgent >= L.year - 3)),
    run(L) {
      const next = L.agent === 'power' ? 'boutique' : 'power';
      const was = AGENTS[L.agent].name.toLowerCase();
      L.agent = next;
      L.flags.firedAgent = L.year;
      remember(L, 'move.agent', true);
      relate(L, 'agent', -30, 'You fired him.');
      bump(L, { morale: -2, fame: 1 });
      return 'You leave ' + was + ' for ' + AGENTS[next].name.toLowerCase() + '. The goodbye call is short.';
    },
  },
  // ── court: how you play ──
  rest: {
    group: 'court', name: 'Ask for load management', blurb: 'Sit back to backs. Fresh legs for April.', cost: () => 0,
    when: (L) => !!(L.team && (L.phase === 'early' || L.phase === 'mid') && L.age >= 29 && !(L.flags.lm && L.flags.lm === L.year)),
    run(L) { L.flags.lm = L.year; remember(L, 'move.rest', true); bump(L, { health: 10, min: -2, fame: -2, trust: -2 }); return 'You sit the second night of every back to back. The fans who bought tickets are loud about it.'; },
  },
  position: {
    group: 'court', name: 'Change your position', blurb: 'Slide over a spot. Your ratings follow.', cost: () => 0,
    when: (L) => !!(L.phase === 'off' && L.seasonsDone >= 2 && !recall(L, 'move.position')),
    run(L) {
      const i = POS.indexOf(L.pos), opts = [i - 1, i + 1].filter((k) => k >= 0 && k < POS.length).map((k) => POS[k]);
      L.pending.push(moveCard('posmove', 'posmove', 'The summer', 'The gym', 'Where do you want to play?', 'The coaches are open to it. "Show me in camp," they say.',
        opts.map((p) => ({ label: 'Move to ' + POS_NAME[p].toLowerCase(), hint: p === 'C' || p === 'PF' ? 'Bigger, closer to the rim' : 'Smaller, more ball in your hands' })).concat([{ label: 'Stay where you are', hint: 'It\'s your spot' }]), { opts }));
      return 'You spend a week watching film of yourself at a new spot.';
    },
  },
  mentor: {
    group: 'court', name: 'Mentor a rookie', blurb: 'Teach the kid what nobody taught you.', cost: () => 0,
    when: (L) => !!(L.team && IN_SEASON.indexOf(L.phase) >= 0 && L.seasonsDone >= 6 && !recall(L, 'mentored.rookie')),
    run(L) { remember(L, 'mentored.rookie', true); bump(L, { trust: 8, morale: 3, eth: 2 }); return 'Film at seven. Treatment at eight. He shows up at 6:45 the second week.'; },
  },
  // ── body ──
  legend: {
    group: 'body', name: 'Train with a legend', blurb: 'A Hall of Famer, one summer, one skill.', cost: (L) => round1(0.4 + capFor(L.year) * 0.002),
    when: (L) => !!(L.phase === 'off' && L.seasonsDone >= 1 && !(L.flags.legendY && L.flags.legendY >= L.year - 2)),
    run(L) {
      L.flags.legendY = L.year;
      L.pending.push(moveCard('legendcamp', 'legendcamp', 'The summer', 'A private gym', 'What does he teach you?', 'He played eighteen seasons and has two rings. He gives you one summer.',
        [{ label: 'The footwork in the post', hint: 'Finishing' }, { label: 'How to read a defense', hint: 'Playmaking and IQ' }, { label: 'His shooting routine', hint: 'Shooting' }, { label: 'How to guard anybody', hint: 'Defense' }]));
      return 'He picks you up at five in the morning. He drives.';
    },
  },
  body: {
    group: 'body', name: 'Remake your body', blurb: 'Bulk up or slim down for next season.', cost: (L) => round1(0.2 + capFor(L.year) * 0.001),
    when: (L) => !!(L.phase === 'off' && L.seasonsDone >= 1 && !(L.flags.bodyY && L.flags.bodyY >= L.year - 2)),
    run(L) {
      L.flags.bodyY = L.year;
      L.pending.push(moveCard('bodymove', 'bodymove', 'The summer', 'The weight room', 'Twelve weeks. Which way?', '{trainer} has two plans on the whiteboard. "Pick one. You can\'t do both."',
        [{ label: 'Add fifteen pounds', hint: 'Rebounding and defense, a step slower' }, { label: 'Cut fifteen pounds', hint: 'Quicker, easier on the knees' }]));
      return '{trainer} takes your measurements and doesn\'t say anything.';
    },
  },
  proam: {
    group: 'body', name: 'Play in a pro-am', blurb: 'Summer runs in the city. The crowd is right there.', cost: () => 0,
    when: (L) => !!(L.phase === 'off' && L.stage === 'nba' && !(L.flags.proam && L.flags.proam === L.year)),
    run(L, r) {
      L.flags.proam = L.year;
      remember(L, 'move.proam', true);
      if (ok(r, 0.1)) { bump(L, { health: -8, fame: 3 }); return 'Fifty-one points in a gym with no air. You tweak an ankle in the last minute.'; }
      bump(L, { fame: 5, morale: 5, ath: 1 }); return 'Fifty-one points in a gym with no air. The clip runs all summer.';
    },
  },
  // ── brand: money and a name off the court ──
  shoe: {
    group: 'brand', name: 'Take a shoe meeting', blurb: 'Your own signature shoe.', cost: () => 0,
    when: (L) => !!(L.phase === 'off' && L.m.fame >= 65 && !L.flags.shoe),
    run(L) {
      const list = shoeOffers(L);
      L.pending.push(moveCard('shoemove', 'shoemove', 'The summer', 'A conference room', 'Three brands want your name on a shoe.', 'Each one brought a mockup. One of them squeaks.',
        list.map((b) => ({ label: 'Sign with ' + b.n, hint: b.pitch })), { list }));
      return '{agent:first} books three meetings in one day.';
    },
  },
  podcast: {
    group: 'brand', name: 'Start a podcast', blurb: 'Your voice, every week. People will clip it.', cost: () => 0.05,
    when: (L) => !!(L.m.fame >= 50 && L.seasonsDone >= 2 && !L.flags.pod),
    run(L) {
      L.flags.pod = L.year;
      remember(L, 'move.podcast', true);
      bump(L, { fame: 6, trust: -3, cash: 0.3 });
      relate(L, 'critic', -10, 'You started a podcast and named him.');
      return 'Episode one is two hours long. Episode two has a sponsor. {critic} hates it.';
    },
  },
  stake: {
    group: 'brand', name: 'Buy into a business', blurb: 'A minority stake. It could be nothing.', cost: (L) => round1(Math.max(2, L.cash * 0.2)),
    when: (L) => !!(L.cash >= 10 && L.age >= 27 && !L.flags.stake),
    run(L, r) {
      L.flags.stake = L.year;
      if (ok(r, 0.55)) { remember(L, 'move.stake.won', true); bump(L, { cash: round1(Math.max(2, L.cash * 0.2) * 2.5), fame: 2 }); return 'A sparkling water nobody had heard of. Then everybody had. Your share is worth two and a half times what you paid.'; }
      remember(L, 'move.stake.lost', true); bump(L, { morale: -3 }); return 'A sneaker resale app. It was everywhere for a year. Now it\'s nowhere.';
    },
  },
  // ── life ──
  union: {
    group: 'life', name: 'Run for the union board', blurb: 'Speak for the players. The owners will remember.', cost: () => 0,
    when: (L) => !!(L.team && L.seasonsDone >= 5 && !recall(L, 'union.role')),
    run(L) { remember(L, 'union.role', true); bump(L, { trust: -2, fame: 3, morale: 3 }); return 'Elected on the first ballot. Your first meeting runs four hours.'; },
  },
  speak: {
    group: 'life', name: 'Speak out', blurb: 'Use your platform for something bigger.', cost: () => 0,
    when: (L) => !!(L.m.fame >= 55 && !recall(L, 'move.speak')),
    run(L) { remember(L, 'move.speak', true); bump(L, { fame: 5, morale: 6, trust: -3 }); relate(L, 'owner', -8, 'You spoke out.'); return 'A long post, then a long interview. Your owner calls. You let it ring.'; },
  },
});

/* The groups of the moves that were there before them. */
Object.assign(ACTS.coach, { group: 'court' });
Object.assign(ACTS.trade, { group: 'team' });
Object.assign(ACTS.trainer, { group: 'body' });
Object.assign(ACTS.vacation, { group: 'life' });
Object.assign(ACTS.party, { group: 'life' });
Object.assign(ACTS.house, { group: 'life' });
Object.assign(ACTS.foundation, { group: 'life' });

ANSWER.holdout = function(L, card, i, opt, rng) {
  if (i === 0) {
    if (ok(rng, 0.45 + (ovrOf(L) - 78) * 0.03)) {
      const sal = card.ctx.sal;
      L.contract = { years: L.contract.years, total: L.contract.total, salary: sal, kind: 'vet', start: L.contract.start };
      bump(L, { morale: 6, trust: -6 });
      logIt(L, 'Held out and got paid: ' + money(sal) + ' a year.', 'gold');
      return said('Day nineteen. They fold. ' + money(sal) + ' a year. Some of your teammates text. Some don\'t.', 'gold');
    }
    bump(L, { cash: -0.6, trust: -12, morale: -6, min: -1 });
    relate(L, 'gm', -20, 'You held out and lost.');
    return said('Day thirty. They don\'t blink. You report, fined and out of shape.', 'bad');
  }
  bump(L, { cash: -0.1, trust: 4 });
  return said('You report on day four. You pay the fine. Nobody brings it up again.');
};
ANSWER.posmove = function(L, card, i) {
  const to = card.ctx.opts[i];
  if (!to) return said('You stay put. Your spot, your game.');
  const from = L.pos;
  const bigger = POS.indexOf(to) > POS.indexOf(from);
  L.pos = to;
  remember(L, 'move.position', from);
  bump(L, bigger ? { reb: 3, def: 2, pla: -2, ath: -1 } : { pla: 3, sho: 1, reb: -3 });
  logIt(L, 'Moved from ' + POS_NAME[from].toLowerCase() + ' to ' + POS_NAME[to].toLowerCase() + '.', '');
  return said(bigger ? 'You bang bodies all summer. You\'re a ' + POS_NAME[to].toLowerCase() + ' now.' : 'You run pick and roll all summer. You\'re a ' + POS_NAME[to].toLowerCase() + ' now.');
};
ANSWER.legendcamp = function(L, card, i) {
  const fx = [{ fin: 3, iq: 1 }, { pla: 2, iq: 2 }, { sho: 3 }, { def: 3, iq: 1 }][i] || {};
  remember(L, 'move.legend', ['post', 'read', 'shot', 'defense'][i] || 'post');
  bump(L, fx);
  return said(['He moves your feet with his hands until you stop thinking about them.', 'He pauses the film every two seconds. By August you see it before it happens.', 'Five hundred shots a day, same routine, same breath. It sticks.', 'He guards you every day. By August you guard him back.'][i] || 'A summer well spent.');
};
ANSWER.bodymove = function(L, card, i) {
  remember(L, 'move.body', i === 0 ? 'bulk' : 'lean');
  if (i === 0) { bump(L, { reb: 3, def: 2, ath: -2 }); return said('Fifteen pounds, most of it in your shoulders. You move people now.'); }
  bump(L, { ath: 3, health: 6, dur: 2, reb: -2 }); return said('Fifteen pounds gone. You feel twenty-three again.');
};
ANSWER.shoemove = function(L, card, i) {
  const b = card.ctx.list[i];
  L.flags.shoe = b.n;
  remember(L, 'move.shoe', b.n);
  bump(L, { cash: round1(b.cash * AGENTS[L.agent].endorse), fame: b.fame });
  logIt(L, 'Signed a signature shoe deal with ' + b.n + '.', 'gold');
  return said('You sign with ' + b.n + '. The first colorway sells out in nine minutes.', 'gold');
};
