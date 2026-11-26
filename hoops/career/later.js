// ─── after the whistle: the rest of a life ──────────────────────────────────

/* LIFE AFTER BASKETBALL (the BitLife plan, phase 6, the owner's call of
   2026-11-24: "The pro version can include childhood and after basketball
   life"). The career ends as it always did: the after card, the epilogue,
   `L.retired`, the Hall card, the board. Nothing here touches any of that.

   This is what can be played AFTER: `laterStart(L)` opens the rest of the
   life on a retired man, in the job his after card chose. `laterAge(L)` is
   one press, four years: the job pays, the lifestyle is paid for and the
   money moves (wealth.js, a year at a time, so a fortune can still be
   lost), the body ages, and one card is dealt, from the job or from life.
   It ends when he does. `laterOf(L)` is the screen and the last page.

   Everything lives in `L.later`. A life that never starts it is the save it
   was. Every draw is on its own stream (later:...). */
const LATER_STEP = 4;
/* Three rungs a job: what he is called, and what a year pays (millions). */
const LATER_JOBS = {
  head_coach: { n: ['Head coach', 'Playoff coach', 'Championship coach'], pay: [4, 7, 10], skill: (L) => L.rt.iq },
  assistant: { n: ['Assistant coach', 'Lead assistant', 'Head coach'], pay: [0.5, 1, 4], skill: (L) => L.rt.iq },
  gm: { n: ['Scout', 'General manager', 'Executive of the Year'], pay: [0.3, 3, 6], skill: (L) => L.rt.iq },
  owner: { n: ['Minority owner', 'Team governor', 'Owner of a champion'], pay: [2, 6, 12], skill: (L) => 40 + Math.min(40, L.cash) },
  broadcast: { n: ['Studio analyst', 'Lead analyst', 'The voice of the Finals'], pay: [1, 4, 8], skill: (L) => L.m.fame },
  league: { n: ['League office', 'Vice president', 'Deputy commissioner'], pay: [0.6, 1.5, 4], skill: (L) => L.m.trust },
  college: { n: ['College coach', 'Tournament coach', 'National champion coach'], pay: [1, 3, 6], skill: (L) => L.rt.iq },
  hs: { n: ['High school coach', 'State champion coach', 'The gym has your name'], pay: [0.06, 0.08, 0.1], skill: (L) => L.eth },
  business: { n: ['Businessman', 'Chief executive', 'Tycoon'], pay: [1, 5, 15], skill: (L) => L.rt.iq },
  actor: { n: ['Bit parts', 'Leading man', 'Award winner'], pay: [0.5, 4, 10], skill: (L) => L.m.fame },
  politics: { n: ['City council', 'Mayor', 'Congressman'], pay: [0.1, 0.2, 0.2], skill: (L) => repOf(L).resp },
  podcast: { n: ['Podcaster', 'A top ten show', 'A media company'], pay: [0.5, 3, 8], skill: (L) => L.m.fame },
  family: { n: ['At home', 'Coach of the kids\' team', 'Grandfather'], pay: [0, 0, 0], skill: (L) => L.m.morale },
};
const LATER_JOB_KEYS = Object.keys(LATER_JOBS);
const laterJob = (L) => LATER_JOBS[L.later.job];
const laterTitle = (L) => laterJob(L).n[L.later.rung];
const lo = (label, hint, run) => ({ label, hint, run });
const up = (L) => { const P = L.later; if (P.rung < 2) { P.rung++; P.peak = Math.max(P.peak, P.rung); logIt(L, 'Now: ' + laterTitle(L) + '.', 'gold'); return true; } return false; };
/* LIFE'S CARDS. One a press at most, each once, in the order they are due. */
const LATER_EV = {
  climb: { when: (L) => L.later.rung < 2 && L.later.job !== 'family', again: true, tag: 'The next job',
    t: (L) => 'A bigger chair is open.', x: (L) => 'They want ' + laterJob(L).n[L.later.rung + 1].toLowerCase().replace(/^a /, '') + '. It is yours to chase.',
    o: [lo('Go for it', 'Bet on yourself', (L, r) => { if (ok(r, 0.35 + (laterJob(L).skill(L) - 50) / 120)) { up(L); bump(L, { morale: 6 }); return 'You get it. The first call is to {mom}.'; } bump(L, { morale: -5 }); return 'They go another way. You find out from a reporter.'; }),
      lo('Stay where you are', 'You like this chair', (L) => { bump(L, { morale: 2, health: 2 }); return 'You stay. You sleep fine.'; }),
      lo('Walk away from all of it', 'Go home', (L) => { L.later.job = 'family'; L.later.rung = 0; logIt(L, 'Walked away and went home.', ''); bump(L, { morale: 4, health: 3 }); return 'You clean out the office in one box.'; })] },
  hall: { when: (L) => !!(L.final && L.final.ending && L.final.ending.hof) && L.later.n >= 1, tag: 'Springfield',
    t: () => 'The Hall of Fame calls.', x: () => 'You have five minutes at the podium and thirty years to cover.',
    o: [lo('Thank everybody', 'Names, all of them', (L) => { bump(L, { morale: 8 }); moveRep(L, 2, 4); return 'You go eleven minutes over. Nobody minds.'; }),
      lo('Settle some scores', 'You kept a list', (L) => { bump(L, { fame: 5, morale: 4 }); moveRep(L, -2, -4); return 'Three names. The clip runs for a week.'; })] },
  scare: { when: (L) => L.age >= 48, tag: 'The doctor', t: () => 'The doctor wants to talk.', x: () => 'Your heart, your knees and thirty years of airplane food.',
    o: [lo('Change how you live', 'Walks. Vegetables. Sleep.', (L) => { bump(L, { health: 12, morale: -2 }); return 'You hate every salad. Your numbers look ten years younger.'; }),
      lo('Keep living', 'You only get one', (L) => { bump(L, { health: -8, morale: 4 }); return 'You nod, take the pamphlet and order the steak.'; })] },
  loan: { when: (L) => L.cash >= 1, tag: 'An old teammate', t: () => 'An old teammate needs money.', x: () => 'He was a starter once. He is asking quietly.',
    o: [lo('Write the check', 'No questions', (L) => { const c = round1(Math.min(L.cash * 0.1, 2)); bump(L, { cash: -c, morale: 5 }); moveRep(L, 0, 3); return 'You send ' + money(c) + '. He cries on the phone.'; }),
      lo('Give him a job', 'Something to do', (L) => { bump(L, { morale: 4, trust: 2 }); return 'He runs your camps now. He is good at it.'; }),
      lo('Say no', 'It never ends with one', (L) => { bump(L, { morale: -3 }); return 'He says he understands. He doesn\'t call again.'; })] },
  book: { when: (L) => L.m.fame >= 35, tag: 'A publisher', t: () => 'They want your story.', x: () => 'A book. Your name on the cover. How honest do you want to be?',
    o: [lo('Tell all of it', 'Every locker room', (L) => { bump(L, { cash: 2, fame: 6 }); moveRep(L, 2, -4); return 'A bestseller. Four old teammates stop returning calls.'; }),
      lo('Keep it clean', 'A nice book', (L) => { bump(L, { cash: 0.5, fame: 2 }); return 'It sells fine at airports.'; }),
      lo('Pass', 'Some things stay in the room', (L) => { moveRep(L, 0, 3); return 'You keep the stories. They keep their value.'; })] },
  kid: { when: (L) => sonsOf(L) >= 1 && L.later.n >= 1, tag: 'Your son', t: () => 'Your son wants to play.', x: () => 'He has your shoulders and your stubbornness. He wants you to train him.',
    o: [lo('Train him yourself', 'Every morning', (L) => { bump(L, { morale: 8 }); L.later.heir = 2; return 'Six a.m., the same gym. He complains exactly like you did.'; }),
      lo('Let him find his own way', 'No shadow', (L) => { bump(L, { morale: 3 }); L.later.heir = 1; return 'You watch from the top row and say nothing. It is the hardest thing you have done.'; })] },
  statue: { when: (L) => !!(L.final && L.final.jersey) && L.later.n >= 2, tag: 'Your old club', t: () => 'They want to build a statue.', x: () => 'Bronze, outside the arena. They ask which pose.',
    o: [lo('The jumper', 'The one everybody remembers', (L) => { bump(L, { fame: 6, morale: 10 }); return 'Kids touch its shoe for luck on the way in.'; }),
      lo('Say no to a statue', 'Name a court for kids', (L) => { bump(L, { morale: 8 }); moveRep(L, 3, 5); return 'Twelve courts in twelve neighborhoods. Your name is on all of them.'; })] },
  mentor: { when: (L) => L.later.n >= 1, tag: 'A phone call', t: () => 'A young star wants advice.', x: () => 'He is twenty-two and everybody tells him yes. He asks you what you would do over.',
    o: [lo('Tell him the truth', 'All of it', (L) => { bump(L, { morale: 5 }); moveRep(L, 1, 4); return 'You talk for three hours. He writes things down.'; }),
      lo('Tell him to enjoy it', 'It goes fast', (L) => { bump(L, { morale: 3 }); return 'You tell him it goes fast. He doesn\'t believe you. Nobody does.'; })] },
  reunion: { when: (L) => L.age >= 50 && L.history.length >= 6, tag: 'The reunion', t: () => 'Your old team is getting together.', x: () => 'Twenty years since that season. Somebody rented a gym.',
    o: [lo('Go, and play', 'One more run', (L, r) => { if (ok(r, 0.6)) { bump(L, { morale: 10, health: -3 }); return 'You hit the first shot. You need ice for a week.'; } bump(L, { morale: 4, health: -10 }); return 'A hamstring, on the second possession. Everybody laughs. You don\'t.'; }),
      lo('Go, and watch', 'Bring the photos', (L) => { bump(L, { morale: 7 }); return 'The stories get better every year. So do the stats.'; })] },
  give: { when: (L) => L.cash >= 20, tag: 'What it is all for', t: () => 'What do you do with the money?', x: (L) => 'You have ' + money(L.cash) + ' and more years behind you than ahead.',
    o: [lo('Give most of it away', 'Schools, gyms, the old neighborhood', (L) => { const c = round1(L.cash * 0.6); bump(L, { cash: -c, morale: 12 }); moveRep(L, 5, 8); L.later.gave = round1((L.later.gave || 0) + c); logIt(L, 'Gave away ' + money(c) + '.', 'gold'); return money(c) + ' to the places that made you. A school is named for {mom}.'; }),
      lo('Leave it to the family', 'They will be fine forever', (L) => { bump(L, { morale: 5 }); return 'The lawyers draw it up. Thanksgiving gets tense.'; }),
      lo('Spend it', 'You earned it', (L) => { const c = round1(L.cash * 0.3); bump(L, { cash: -c, morale: 8, health: -2 }); return 'A boat, a vineyard and a year you barely remember. ' + money(c) + ' well spent.'; })] },
  grand: { when: (L) => lifeOf(L).kids >= 1 && L.age >= 55, tag: 'The hospital', t: () => 'You are a grandfather.', x: () => 'Seven pounds, and already long fingers. Everybody looks at you.',
    o: [lo('Put a ball in the crib', 'Family tradition', (L) => { bump(L, { morale: 10 }); return 'Your kid rolls their eyes. The ball stays.'; }),
      lo('Just hold the baby', 'Nothing else matters', (L) => { bump(L, { morale: 9, health: 2 }); return 'You hold on for an hour. Nobody asks for a turn.'; })] },
  film: { when: (L) => L.history.length >= 8 && L.later.n >= 2, tag: 'A film crew', t: () => 'They want to make a documentary.', x: () => 'Ten hours on your career. They want the old footage and the old arguments.',
    o: [lo('Give them everything', 'The good and the bad', (L) => { bump(L, { fame: 8, cash: 1 }); moveRep(L, 3, 2); return 'A new generation finds your highlights. Your jersey sells again.'; }),
      lo('Only on your terms', 'You get final cut', (L) => { bump(L, { fame: 4, cash: 1.5 }); moveRep(L, 0, -3); return 'It makes you look great. The reviews notice.'; }),
      lo('Turn it down', 'Let the games speak', (L) => { bump(L, { morale: 3 }); return 'They make it anyway, with people who barely knew you.'; })] },
  kidsteam: { when: (L) => L.later.job === 'family' && L.later.rung < 2, again: true, tag: 'The rec center', t: (L) => L.later.rung ? 'The family needs you around more.' : 'The kids\' team needs a coach.', x: (L) => L.later.rung ? 'Birthdays, recitals, a lot of driving. They want you at all of it.' : 'Nine year olds. No defense. A parent asks if you know anything about basketball.',
    o: [lo('Say yes', 'All in', (L) => { up(L); bump(L, { morale: 8 }); return 'You draw up one play. They run it wrong. You have never been happier.'; }),
      lo('Not this year', 'You like your quiet', (L) => { bump(L, { morale: 1, health: 2 }); return 'You watch from a lawn chair instead.'; })] },
  truce: { when: (L) => !!L.rival && L.age >= 45, tag: 'An old rival', t: () => '{rival} calls.', x: () => 'Twenty years of not speaking. He is in town and wants dinner.',
    o: [lo('Go to dinner', 'Life is short', (L) => { bump(L, { morale: 8 }); moveRep(L, 2, 3); return 'By dessert you are arguing about one play from one game. Laughing, this time.'; }),
      lo('Let it ring', 'Some things stay', (L) => { bump(L, { morale: -2, fame: 1 }); return 'You let it ring. You think about it for a month.'; })] },
  street: { when: (L) => L.m.fame >= 30 && L.later.n >= 3, tag: 'City hall', t: () => '{town} wants to name a street for you.', x: () => 'The block you grew up on. There is a ceremony and a very large pair of scissors.',
    o: [lo('Show up and cut the ribbon', 'Bring the whole family', (L) => { bump(L, { morale: 9, fame: 2 }); return 'Your name on a green sign. {mom} would have taken a hundred photos.'; }),
      lo('Ask them to name it for your mother', 'She did the driving', (L) => { bump(L, { morale: 10 }); moveRep(L, 2, 5); return 'Her name goes up instead. That is the one you visit.'; })] },
  venture: { when: (L) => L.cash >= 2, tag: 'A pitch', t: () => 'A friend has a business idea.', x: (L) => 'He needs ' + money(round1(Math.min(5, L.cash * 0.2))) + '. He has a slideshow.',
    o: [lo('Put the money in', 'He is good for it. Probably.', (L, r) => { const c = round1(Math.min(5, L.cash * 0.2)); if (ok(r, 0.4)) { bump(L, { cash: c * 2, morale: 5 }); return 'It works. You triple your money and never hear the end of it.'; } bump(L, { cash: -c, morale: -4 }); return 'It closes in a year. ' + money(c) + ' gone, and one friendship with it.'; }),
      lo('Pass', 'You have seen this movie', (L) => { bump(L, { morale: 1 }); return 'You pass. He finds the money somewhere else.'; })] },
};
const LATER_EV_KEYS = Object.keys(LATER_EV);
function laterCard(L, id) {
  const e = LATER_EV[id];
  return { id: 'later', kind: 'event', key: 'later:' + id + ':' + L.later.n, eyebrow: 'Age ' + L.age + ' · ' + e.tag, scene: e.tag, title: e.t(L), text: e.x(L), ctx: { ev: id }, options: e.o.map((o) => ({ label: o.label, hint: o.hint })) };
}
ANSWER.later = function(L, card, i, opt, rng) {
  return said(LATER_EV[card.ctx.ev].o[i].run(L, rng) || '', '');
};
/* Can the rest of the life be opened? A man who died young has none. */
const laterCan = (L) => !!(L.retired && L.final && !L.flags.died && !L.later);
function laterStart(L) {
  if (!laterCan(L)) return null;
  const path = L.final.path && LATER_JOBS[L.final.path] ? L.final.path : 'family';
  L.later = { job: path, rung: 0, peak: 0, n: 0, from: L.age, seen: {}, over: false };
  /* The playing is over and the body gets some of itself back. */
  bump(L, { health: 15 });
  logIt(L, 'After basketball: ' + laterTitle(L).toLowerCase() + '.', '');
  return laterOf(L);
}
/* How likely the next four years are his last. */
const LATER_OLD = 50, LATER_LAST = 96;
const laterEndP = (L) => L.age >= LATER_LAST ? 1 : L.age < LATER_OLD ? 0 : clamp((L.age - 58) / 90 + Math.max(0, 50 - L.m.health) / 120, 0, 0.9);
/* One press: four years. */
function laterAge(L) {
  const P = L.later;
  if (!P || P.over) return null;
  if (L.pending.length) return { beats: [], blocked: true };
  const beats = [], r = (k) => rngAt(L, 'later:' + k + ':' + P.n);
  const cash0 = L.cash;
  for (let y = 0; y < LATER_STEP; y++) {
    L.age++; L.year++;
    L.cash = round1(L.cash + laterJob(L).pay[P.rung]);
    wealthSeason(L, beats);
  }
  P.n++;
  bump(L, { health: -(3 + Math.floor(r('body')() * 4)) - (L.age >= 70 ? 3 : 0) });
  beats.unshift({ kind: 'year', text: 'You are ' + L.age + '. ' + laterTitle(L) + '.', tone: '' });
  if (Math.abs(L.cash - cash0) >= 0.1) beats.push({ kind: 'money', text: (L.cash >= cash0 ? 'Up ' : 'Down ') + money(Math.abs(L.cash - cash0)) + ' over four years.', tone: L.cash >= cash0 ? 'good' : 'bad' });
  /* A job does its own climbing some years, without being asked. */
  if (P.job !== 'family' && P.rung < 2 && ok(r('rise'), 0.12 + (laterJob(L).skill(L) - 50) / 300) && up(L)) beats.push({ kind: 'job', text: 'A promotion: ' + laterTitle(L).toLowerCase() + '.', tone: 'gold' });
  /* Drawn bare: `ok` never lets a chance be nought, and a young man's is. */
  if (r('end')() < laterEndP(L)) {
    P.over = true; P.died = L.age;
    const t = 'Died at ' + L.age + '. ' + (lifeOf(L).kids ? 'The family was there.' : 'The old gym flew its flag low.');
    beats.push({ kind: 'retire', text: t, tone: 'gold' });
    logIt(L, t, 'gold');
  } else {
    const due = LATER_EV_KEYS.filter((k) => (LATER_EV[k].again ? P.seen[k] !== P.n - 1 : !P.seen[k]) && LATER_EV[k].when(L));
    if (due.length) { const k = due[Math.floor(r('card')() * due.length)]; P.seen[k] = P.n; L.pending.push(laterCard(L, k)); }
  }
  sayAll(L, beats);
  return { beats, over: P.over, blocked: L.pending.length > 0 };
}
/* The screen, and the last page. */
function laterOf(L) {
  const P = L.later;
  if (!P) return { can: laterCan(L), on: false };
  return {
    can: false, on: true, over: P.over, age: L.age, died: P.died || null, job: P.job, title: laterTitle(L), best: laterJob(L).n[P.peak], peak: P.peak,
    pay: laterJob(L).pay[P.rung], cash: L.cash, worth: netWorth(L), health: L.m.health, years: L.age - P.from, gave: P.gave || 0,
    line: P.over ? laterLine(L) : null,
  };
}
/* What the stone says. */
function laterLine(L) {
  const P = L.later, parts = [L.name + ', ' + P.died + '.'];
  parts.push(P.job === 'family' && !P.peak ? 'Went home and stayed.' : 'After the game: ' + laterJob(L).n[P.peak].toLowerCase() + '.');
  if (P.gave) parts.push('Gave away ' + money(P.gave) + '.');
  if (lifeOf(L).kids) parts.push(lifeLine(L) + '.');
  return parts.join(' ');
}
