// ─── the people you live with ───────────────────────────────────────────────

/* BONDS (the BitLife plan, phase 2, the owner's call of 2026-11-24). Every
   invented person in the ledger (story-engine.js) is somebody you can act on:
   spend time, send money, ask for money, have it out, cut them off, make
   peace. A partner is dated, proposed to, married, given a family or left.
   They remember: every act moves the person's meter and leaves a note on
   them, and the cards that read a meter (relOf) read these too.

   The page reads `peopleOpen(L)` and calls `personAct(L, personId, actId)`,
   the way it reads actsOpen and act. Nothing here is dealt: a career that
   never opens the People screen plays exactly as it did, and every draw is on
   its own stream (bond:person:act:year).

   Real people are never in the ledger, so none of this touches a real man. */

/* How much of a year goes to people: acts a season, and one a person. */
const BOND_MAX = 4;
const BOND_GROUP = {
  Partner: 'partner',
  Mom: 'family', Dad: 'family', Cousin: 'family',
  'Friend from home': 'friend', 'College roommate': 'friend', 'Old teammate': 'friend', 'High school coach': 'friend',
  'AAU coach': 'friend', 'Kid from your camp': 'friend', Superfan: 'friend', 'Streetball legend': 'friend', Trainer: 'friend',
  Teammate: 'mate', 'Co-star': 'mate',
  'Beat writer': 'press', 'TV critic': 'press',
  'Draft-class rival': 'foe', Nemesis: 'foe', 'Rival from camp': 'foe',
};
const BOND_ORDER = ['partner', 'family', 'friend', 'mate', 'press', 'foe'];
const bondMood = (p) => p.gone ? 'Cut off' : p.rel >= 40 ? 'Close' : p.rel >= 10 ? 'Good' : p.rel > -10 ? 'Neutral' : p.rel > -40 ? 'Strained' : 'Bad blood';
const isParent = (p) => p.role === 'Mom' || p.role === 'Dad';
const bondNote = (L, p, t) => { p.notes.push([L.year, t]); if (p.notes.length > 5) p.notes.shift(); };
const bondRel = (p, d) => { p.rel = clamp(p.rel + d, -100, 100); };
/* The person you are with now. An old partner stays in the ledger under the
   same role, and nothing here acts on them. */
const withNow = (L, p) => p.role === 'Partner' && lifeOf(L).rel !== 'single' && p.n === say(L, '{partner}');
const paired = (L, st) => (L, p) => withNow(L, p) && [].concat(st).indexOf(lifeOf(L).rel) >= 0;
/* It ends: the same bookkeeping the breakup card does. */
function partnerLeaves(L) { const f = lifeOf(L); if (f.rel === 'married') f.div = (f.div || 0) + 1; f.rel = 'single'; f.pn = (f.pn || 0) + 1; }

/* The three loud ones (freezing out the press, trash talk, a call out that
   goes badly) are public, so they move the reputation too: a man who wants
   to be the villain can be one on purpose (phase 7, the Villain ribbon). */
/* Each act: who it is for (`on`), what it costs, and what it does. `run`
   returns the line the screen shows; `tone` colors it. */
const BONDS = {
  time: {
    name: 'Spend time together', blurb: 'A weekend. No cameras.', on: (L, p) => !p.gone && /^(family|friend)$/.test(BOND_GROUP[p.role]),
    run(L, p, r) {
      bondRel(p, 10); bump(L, { morale: 3 }); bondNote(L, p, 'You made the time.');
      return pick(r, ['A whole weekend with ' + p.n + '. The phone stays in the car.', p.n + ' cooks. You do the dishes. Nobody talks about basketball.', 'You and ' + p.n + ' talk until the sun comes up.']);
    },
  },
  gift: {
    name: 'Send something nice', blurb: 'They will know it is from you.', cost: () => 0.1,
    on: (L, p) => !p.gone && /^(family|friend)$/.test(BOND_GROUP[p.role]),
    run(L, p, r) {
      bondRel(p, 14); bondNote(L, p, 'You sent a gift.');
      return pick(r, [p.n + ' calls to say thank you. Twice.', 'It shows up with a bow on it. ' + p.n + ' sends a photo.', p.n + ' says it is too much. ' + p.n + ' keeps it.']);
    },
  },
  house: {
    name: 'Buy a house', blurb: 'The one promise every rookie makes.', cost: () => 1.2, tone: 'gold',
    /* Mom's house is one promise, kept here or as the move (turns.js). */
    on: (L, p) => !p.gone && isParent(p) && !p.house && !(p.role === 'Mom' && L.flags.momHouse),
    run(L, p) {
      p.house = L.year; if (p.role === 'Mom') L.flags.momHouse = true; bondRel(p, 40); bump(L, { morale: 6 }); bondNote(L, p, 'You bought the house.');
      logIt(L, 'Bought ' + p.n + ' a house.', 'gold');
      return p.n + ' walks every room twice. Then cries in the kitchen.';
    },
  },
  ask: {
    name: 'Ask for money', blurb: 'Pride is cheaper than rent.',
    on: (L, p) => !p.gone && /^(family|friend)$/.test(BOND_GROUP[p.role]) && L.cash < 0.5,
    run(L, p, r) {
      if (ok(r, 0.35 + p.rel / 120)) { bump(L, { cash: 0.2, morale: -2 }); bondRel(p, -6); bondNote(L, p, 'You asked for money. They gave it.'); return p.n + ' sends it the same day. No questions.'; }
      bump(L, { morale: -4 }); bondRel(p, -10); bondNote(L, p, 'You asked for money. They said no.');
      return p.n + ' says no. It is a short call.';
    },
  },
  argue: {
    name: 'Have it out', blurb: 'Say the thing you have been holding.', tone: 'bad',
    on: (L, p) => !p.gone && !withNow(L, p) && !!BOND_GROUP[p.role],
    run(L, p, r) {
      bondRel(p, -18); bump(L, { morale: -2 }); watchMark(L, 'hot', []); bondNote(L, p, 'You had it out.');
      return pick(r, ['It gets loud. ' + p.n + ' hangs up first.', 'You say all of it. ' + p.n + ' says some back.', p.n + ' walks out before you finish.']);
    },
  },
  cut: {
    name: 'Cut them off', blurb: 'No calls. No tickets. Done.', tone: 'bad',
    on: (L, p) => !p.gone && /^(family|friend)$/.test(BOND_GROUP[p.role]),
    run(L, p) {
      p.gone = L.year; p.rel = -100; bump(L, { morale: BOND_GROUP[p.role] === 'family' ? -8 : -3 }); bondNote(L, p, 'You cut them off.');
      logIt(L, 'Cut ' + p.n + ' off.', 'bad');
      return 'You block the number. ' + p.n + ' finds out from somebody else.';
    },
  },
  mend: {
    name: 'Reach out', blurb: 'It has been a while.',
    on: (L, p) => !!p.gone && L.year > p.gone,
    run(L, p, r) {
      if (ok(r, 0.5)) { delete p.gone; p.rel = -20; bump(L, { morale: 5 }); bondNote(L, p, 'You reached out. They answered.'); logIt(L, 'Made up with ' + p.n + '.', 'good'); return p.n + ' picks up on the second ring. It is a start.'; }
      bump(L, { morale: -3 }); bondNote(L, p, 'You reached out. Nothing.');
      return 'It rings out. ' + p.n + ' does not call back.';
    },
  },
  // ── teammates ──
  hang: {
    name: 'Take him to dinner', blurb: 'Your treat.', on: (L, p) => BOND_GROUP[p.role] === 'mate',
    run(L, p, r) {
      bondRel(p, 10); bump(L, { morale: 2 }); bondNote(L, p, 'Dinner was on you.');
      return pick(r, [p.n + ' orders for the table. You pay. Worth it.', 'Three hours at a steakhouse with ' + p.n + '. He is funnier than you knew.']);
    },
  },
  train: {
    name: 'Work out together', blurb: 'Six in the morning. Bring him.', on: (L, p) => BOND_GROUP[p.role] === 'mate',
    run(L, p) { bondRel(p, 8); bump(L, { trust: 1, eth: 1 }); bondNote(L, p, 'You put in the work together.'); return 'You and ' + p.n + ' are in the gym before the lights are on.'; },
  },
  callout: {
    name: 'Call him out', blurb: 'In front of the room.', tone: 'bad', on: (L, p) => BOND_GROUP[p.role] === 'mate',
    run(L, p, r) {
      if (ok(r, 0.45 + L.m.trust / 400)) { bondRel(p, 6); bump(L, { trust: 3 }); bondNote(L, p, 'You called him out. He heard it.'); return p.n + ' nods. He needed to hear it from you.'; }
      bondRel(p, -18); bump(L, { morale: -2, trust: -1 }); moveRep(L, -1, -3); bondNote(L, p, 'You called him out. It went badly.');
      return p.n + ' does not take it well. The room goes quiet.';
    },
  },
  // ── the press ──
  scoop: {
    name: 'Give an exclusive', blurb: 'One story. Your words.', on: (L, p) => BOND_GROUP[p.role] === 'press',
    run(L, p) { bondRel(p, 12); bump(L, { fame: 2 }); bondNote(L, p, 'You gave the exclusive.'); return p.n + ' gets the story first. It reads the way you told it.'; },
  },
  freeze: {
    name: 'Freeze them out', blurb: 'No quotes. No eye contact.', tone: 'bad', on: (L, p) => BOND_GROUP[p.role] === 'press',
    run(L, p) { bondRel(p, -15); bump(L, { fame: -1 }); moveRep(L, -3, -2); bondNote(L, p, 'You froze them out.'); return p.n + ' asks three questions. You answer none.'; },
  },
  // ── rivals ──
  trash: {
    name: 'Talk trash', blurb: 'Loud enough to get back to him.', tone: 'bad', on: (L, p) => BOND_GROUP[p.role] === 'foe',
    run(L, p) { bondRel(p, -12); bump(L, { fame: 3 }); moveRep(L, -3, -3); bondNote(L, p, 'You talked trash. It got back.'); return 'It is everywhere by lunch. ' + p.n + ' has seen it.'; },
  },
  peace: {
    name: 'Bury it', blurb: 'Life is long. The league is small.', on: (L, p) => BOND_GROUP[p.role] === 'foe' && p.rel < 20,
    run(L, p, r) {
      if (ok(r, 0.5)) { bondRel(p, 25); bump(L, { morale: 2 }); bondNote(L, p, 'You buried it.'); return 'You and ' + p.n + ' shake on it. Mostly meant.'; }
      bondRel(p, -5); bondNote(L, p, 'You tried to bury it. No.');
      return p.n + ' leaves you on read.';
    },
  },
  // ── your partner ──
  date: {
    name: 'Date night', blurb: 'Phones in the glove box.', cost: () => 0.05, on: paired(null, ['dating', 'engaged', 'married']),
    run(L, p, r) {
      bondRel(p, 10); bump(L, { morale: 4 }); bondNote(L, p, 'Date night.');
      return pick(r, ['Dinner, then a walk. ' + p.n + ' laughs at all of it.', 'You cook. It is bad. ' + p.n + ' eats it anyway.', 'Courtside is your office. Tonight you two sit in the cheap seats at a movie.']);
    },
  },
  propose: {
    name: 'Propose', blurb: 'There is a ring in your pocket.', tone: 'gold', on: (L, p) => withNow(L, p) && lifeOf(L).rel === 'dating' && L.year - lifeOf(L).since >= 1,
    run(L, p, r) {
      if (ok(r, 0.55 + p.rel / 250)) { lifeOf(L).rel = 'engaged'; bondRel(p, 25); bump(L, { morale: 10 }); bondNote(L, p, 'You proposed. Yes.'); logIt(L, 'Engaged to {partner}.', 'good'); return 'Yes, before you finish the question.'; }
      bondRel(p, -10); bump(L, { morale: -6 }); bondNote(L, p, 'You proposed. Not yet.');
      return '"Not yet," ' + p.n + ' says. The ring goes back in the drawer.';
    },
  },
  elope: {
    name: 'Elope', blurb: 'Just the two of you. This week.', cost: () => 0.1, tone: 'gold', on: paired(null, 'engaged'),
    run(L, p) { lifeOf(L).rel = 'married'; bondRel(p, 20); bump(L, { morale: 10 }); bondNote(L, p, 'You eloped.'); logIt(L, 'Married {partner}.', 'gold'); return 'A courthouse, two witnesses and a taco truck. Perfect.'; },
  },
  family: {
    name: 'Start a family', blurb: 'Grow the house.', on: (L, p) => withNow(L, p) && lifeOf(L).rel === 'married' && lifeOf(L).kids < 4 && L.age <= 38,
    run(L, p) { bondRel(p, 15); bondNote(L, p, 'You grew the family.'); return startFamily(L); },
  },
  fight: {
    name: 'Pick a fight', blurb: 'You know which button.', tone: 'bad', on: paired(null, ['dating', 'engaged', 'married']),
    run(L, p) {
      bondRel(p, -25); bump(L, { morale: -4 }); watchMark(L, 'hot', []); bondNote(L, p, 'A bad fight.');
      /* Enough of these and they go: said at once, not left for a card. */
      if (p.rel <= -40) {
        const wed = lifeOf(L).rel === 'married';
        if (wed) { const cost = round1(Math.max(0, L.cash) * 0.4); bump(L, { cash: -cost, morale: -8 }); logIt(L, 'Divorced {partner}. It cost ' + money(cost) + '.', 'bad'); }
        partnerLeaves(L);
        return wed ? p.n + ' packs a bag and calls a lawyer.' : p.n + ' packs a bag. That is that.';
      }
      return 'Doors slam. ' + p.n + ' sleeps in the other room.';
    },
  },
  leave: {
    name: (L) => lifeOf(L).rel === 'married' ? 'File for divorce' : 'End it', blurb: (L) => lifeOf(L).rel === 'married' ? 'It will cost you.' : 'Walk away clean.', tone: 'bad',
    on: paired(null, ['dating', 'engaged', 'married']),
    run(L, p) {
      if (lifeOf(L).rel === 'married') {
        const cost = round1(Math.max(0, L.cash) * 0.4);
        bump(L, { cash: -cost, morale: -12 }); p.rel = -40; bondNote(L, p, 'You filed for divorce.');
        logIt(L, 'Divorced {partner}. It cost ' + money(cost) + '.', 'bad');
        partnerLeaves(L);
        return 'The lawyers do the talking. ' + p.n + ' keeps the house.';
      }
      bump(L, { morale: -6 }); p.rel = -20; bondNote(L, p, 'You ended it.'); partnerLeaves(L);
      return 'You say it plainly. ' + p.n + ' already knew.';
    },
  },
};
const bondText = (L, v) => typeof v === 'function' ? v(L) : v;
const bondUsed = (L) => (L.flags.bonds && L.flags.bonds.y === L.year) ? L.flags.bonds : { y: L.year, n: 0, who: {} };

/* Everybody you can act on now, each with the acts open on them. An act is
   listed when it fits the person; `ok` says whether it can be taken (the
   year's time, one act a person, the cash). */
function peopleOpen(L) {
  if (L.retired || L.pending.length || isAm(L)) return [];
  const used = bondUsed(L), out = [];
  for (const id in L.people || {}) {
    const p = L.people[id], g = BOND_GROUP[p.role];
    if (!g) continue;
    const acts = Object.keys(BONDS).filter((k) => BONDS[k].on(L, p)).map((k) => {
      const a = BONDS[k], cost = a.cost ? a.cost(L, p) : 0;
      return { id: k, name: bondText(L, a.name), blurb: bondText(L, a.blurb), cost, tone: a.tone || '', ok: used.n < BOND_MAX && !used.who[id] && L.cash >= cost };
    });
    if (!acts.length) continue;
    out.push({ id, group: g, role: p.role, n: p.n, rel: p.rel, mood: bondMood(p), met: p.met, notes: p.notes.slice(), used: !!used.who[id], acts });
  }
  return out.sort((a, b) => BOND_ORDER.indexOf(a.group) - BOND_ORDER.indexOf(b.group) || b.rel - a.rel || (a.id < b.id ? -1 : 1));
}
/* How much of the year is left for people. */
const bondsLeft = (L) => Math.max(0, BOND_MAX - bondUsed(L).n);
function personAct(L, pid, aid) {
  const who = peopleOpen(L).find((x) => x.id === pid), open = who && who.acts.find((x) => x.id === aid);
  if (!open || !open.ok) return null;
  const p = L.people[pid], a = BONDS[aid];
  const used = L.flags.bonds = bondUsed(L);
  used.n++; used.who[pid] = 1;
  const before = snapshot(L);
  if (open.cost) { L.cash = round1(L.cash - open.cost); if (open.cost >= 0.5) tw(L).spent = (tw(L).spent || 0) + 1; }
  const text = say(L, a.run(L, p, rngAt(L, 'bond:' + pid + ':' + aid)));
  sayAll(L);
  const res = { title: open.name, label: open.name, who: p.n, text, tone: open.tone, diff: diffOf(before, snapshot(L)) };
  L.last = res;
  return res;
}

/* Going out on purpose, for a single man: the one bond with nobody in it yet. */
ACTS.mingle = {
  group: 'life', name: 'Put yourself out there', blurb: 'A night out. Maybe you meet someone.', cost: () => 0.05,
  when: (L) => lifeOf(L).rel === 'single' && L.age >= 21,
  run(L, r) {
    if (ok(r, 0.6)) { const f = lifeOf(L); f.rel = 'dating'; f.since = L.year; bump(L, { morale: 8 }); logIt(L, 'Met {partner}.', 'good'); relate(L, 'partner', 30, 'You met on a night out.'); return '{partner} beats you at pool. You ask for a rematch. And a number.'; }
    return 'Good music. Nobody you want to call tomorrow.';
  },
};
