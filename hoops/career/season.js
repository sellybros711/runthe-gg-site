// ─── draft night ────────────────────────────────────────────────────────────

/* Where the board has you, before anything you do this week. */
function draftStock(L) {
  const fx = L.flags.stock || 0;
  /* Scouts draft the ceiling, so a year older is a little less to dream on. */
  return ovrOf(L) * 0.75 + L.pot * 0.45 + L.m.fame * 0.06 + fx - (L.age - 20) * 1.2;
}
function projectedPick(L, extra) {
  const s = draftStock(L) + (extra || 0);
  /* A story career's board is spread the way a real one is: a quarter of a
     class in the lottery, the first round deeper, and a real undrafted tail. */
  /* A rec league player is on nobody's board until somebody films him. */
  if (s < 74.5 || (recall(L, 'route.rec') && !recall(L, 'rec.viral'))) return 61;
  return clamp(Math.round(60 / (1 + Math.exp((s - 81.7) / 4.6))) + 1, 1, 61);
}
/* The order is the worst club first, with the top four shuffled among the
   bottom fourteen the way a lottery shuffles them. */
function draftOrder(L) {
  const asc = CLUBS.slice().sort((a, b) => clubNet(L, a) - clubNet(L, b));
  const rng = rngAt(L, 'lottery');
  const lot = asc.slice(0, 14);
  const top = [];
  for (let i = 0; i < 4; i++) {
    const w = lot.map((c, j) => (14 - j) * (14 - j));
    const c = weighted(rng, lot, (x) => w[lot.indexOf(x)]);
    top.push(c);
    lot.splice(lot.indexOf(c), 1);
  }
  const first = top.concat(lot, asc.slice(14));
  return first.concat(first);
}

/* THE COMBINE (story careers). Testing, two interviews and a private
   workout, and none of them is a choice of where you go. A club you impress
   is more likely to take you if it picks near where the board has you, and a
   good week moves the board a little. Where you land is still the board's. */
const CLUB_STYLE = ['culture', 'swagger', 'grit'];
const styleOf = (L, c) => CLUB_STYLE[E.hashSeed(String(L.seed) + ':style:' + c) % 3];
function intrOf(L) { return L.flags.intr || (L.flags.intr = {}); }
/* The club that told you it loved you: an old promise, or the room you
   impressed most at the combine. */
function lovedBy(L) {
  if (L.flags.promise) return L.flags.promise.club;
  const I = L.flags.intr || {};
  let best = null;
  for (const c in I) if (I[c] >= 6 && (!best || I[c] > I[best])) best = c;
  return best;
}
/* Clubs that pick near where the board has you, so the rooms you are in are
   the rooms that could call your name. Seeded, never chosen. */
function combineClubs(L) {
  const order = draftOrder(L), proj = projectedPick(L);
  const rng = rngAt(L, 'cmb:clubs');
  const lo = clamp(proj - 8, 1, 52), hi = clamp(proj + 10, 9, 60);
  const out = [];
  for (let k = 0; k < 40 && out.length < 3; k++) {
    const c = order[lo - 1 + Math.floor(rng() * (hi - lo + 1))];
    if (c && out.indexOf(c) < 0) out.push(c);
  }
  return out;
}
/* Questions a front office asks, about you. A question the road gave you a
   reason to be asked comes first. */
const CMB_Q = [
  { id: 'weak', when: () => true, q: "What's the worst part of your game?",
    a: [["Name it, and how you're fixing it", { culture: 2, grit: 1 }, [0, 3], 'He nods. "Nobody ever says that." Then he writes for a while.', 'Honest, and it shows work'],
      ['Say defense, then talk effort', { grit: 2 }, [0, 1], "Safe. He's heard it a hundred times, but he likes the effort part.", 'The safe answer'],
      ["Tell him you don't have one", { swagger: 2, culture: -2 }, [3, -2], "He laughs. You honestly can't tell which way.", 'Confidence, or arrogance']] },
  { id: 'injury', when: (L) => !!(recall(L, 'inj.col') || recall(L, 'inj.hs')), q: 'Tell us about the injury.',
    a: [['Walk them through the rehab', { culture: 2, grit: 1 }, [0, 3], 'You know every week of it cold. Their team doctor smiles.', 'Show them the work'],
      ["Say it's all behind you", { swagger: 1 }, [1, 0], 'He wants more than that. He writes "medical" and underlines it.', 'Short and sweet'],
      ['Offer to run for them right now', { grit: 2 }, [1, 1], 'You run sprints in dress shoes. They believe you.', 'Prove it on the spot']] },
  { id: 'transfer', when: (L) => !!recall(L, 'route.portal'), q: "Why'd you transfer?",
    a: [['Minutes. You needed the ball', { swagger: 2 }, [1, -1], 'Honest, and a little sharp. He likes sharp.', 'Blunt and hungry'],
      ['The fit was wrong. Own it', { culture: 2 }, [0, 3], 'You blame nobody. He circles something on his pad.', 'Take the high road'],
      ['Your old coach left', { grit: 1 }, [0, 1], 'He knows the story already. It checks out.', 'Just the facts']] },
  { id: 'path', when: (L) => !!(recall(L, 'route.gl') || recall(L, 'route.intl') || recall(L, 'route.gap')), q: 'You skipped college. Why?',
    a: [['To get paid sooner', { swagger: 2, grit: 1 }, [2, 0], 'He likes the hunger. You can see it on his face.', "You're in a hurry"],
      ['Your family needed the money', { culture: 2 }, [1, 3], 'The room goes quiet. Then it goes warm.', 'Tell the real story'],
      ['To play against grown men', { grit: 2 }, [1, 1], "He asks about the grown men. You've got stories.", 'Tough enough already']] },
  { id: 'nobody', when: (L) => !!(recall(L, 'route.juco') || recall(L, 'route.walkon') || recall(L, 'route.rec')), q: 'Nobody recruited you. Why should we?',
    a: [['Because nobody recruited you', { grit: 3 }, [1, 2], 'He writes "chip" and underlines it twice.', 'Play the chip'],
      ['Show them your numbers', { culture: 1 }, [0, 1], 'The numbers are real, and he knows it.', 'Let the stats talk'],
      ['Say they missed, not you', { swagger: 2 }, [2, -1], 'Bold. He grins at the scout beside him.', 'Swing big']] },
  { id: 'bench', when: () => true, q: 'Would you come off the bench for us?',
    a: [['Whatever the team needs', { culture: 3 }, [0, 3], 'The right answer, and you actually meant it.', 'Team first'],
      ['For a year. Then you start', { swagger: 1, grit: 1 }, [1, 1], "He likes that there's a clock in your head.", 'Patient, with a deadline'],
      ["No. You're a starter", { swagger: 2, culture: -2 }, [3, -2], "He respects it. His coach won't.", 'Bet on yourself']] },
  { id: 'circle', when: () => true, q: "Who's in your circle?",
    a: [['Family. Same people as always', { culture: 2 }, [1, 2], 'He asks about your mom. You talk for ten minutes.', 'Keep it small'],
      ['Your trainer and your agent', { grit: 1 }, [0, 1], 'Professional. He nods and moves on.', 'All business'],
      ['A lot of people', { swagger: 1, culture: -1 }, [2, -1], 'He asks how many. You start counting. He stops you.', 'Big crew, big questions']] },
  { id: 'weird', when: () => true, q: 'If you were a shoe, which one?',
    a: [['A work boot', { grit: 3 }, [1, 1], 'He loves it. It goes straight on a sticky note.', 'Blue collar'],
      ['Your own signature shoe', { swagger: 3 }, [3, -1], 'He laughs. "Ambitious."', 'Dream out loud'],
      ['Ask why he wants to know', { culture: 1 }, [0, 1], '"Nobody asks that." He explains. It\'s a test of nothing.', 'Turn it around']] },
  { id: 'film', when: () => true, q: "Here's your worst game. Walk us through it.",
    a: [['Break down every mistake', { culture: 2, grit: 1 }, [0, 3], "You spot two mistakes they hadn't even noticed.", 'Own every rep'],
      ['Point out what the refs missed', { swagger: 1, culture: -2 }, [1, -3], 'He turns the screen off a little early.', 'Spread the blame'],
      ['Ask for your best game instead', { swagger: 2 }, [2, -1], 'He puts it on. You talk over all of it.', 'Change the channel']] },
];
function interviewCard(L, clubs, n) {
  const c = clubs[n];
  const used = L.flags.cmbQ || (L.flags.cmbQ = []);
  const rng = rngAt(L, 'cmb:q' + n);
  const open = CMB_Q.filter((x) => used.indexOf(x.id) < 0 && x.when(L));
  const told = open.filter((x) => x.id !== 'weak' && x.id !== 'bench' && x.id !== 'circle' && x.id !== 'weird' && x.id !== 'film');
  const q = told.length && rng() < 0.7 ? pick(rng, told) : pick(rng, open);
  used.push(q.id);
  const gm = personName(L, 'gm:' + c);
  return {
    id: 'interview', kind: 'event', key: 'interview:' + q.id, eyebrow: 'Combine interviews', scene: 'Interview room', title: 'Twenty minutes with the ' + nick(c),
    text: gm + ' shuts the door and leans in. "' + q.q + '"', ctx: { club: c, q: q.id, n, clubs },
    options: q.a.map((x) => ({ label: x[0], hint: x[4] })),
  };
}
/* The answers to a combine interview (choose() runs them). */
ANSWER.interview = function(L, card, i, opt, rng, beats, touch, touches) {
  let text = '', tone = '', made = null, won = null, shots = null, contest = null;
  ({ text, tone } = chooseInterview(L, card, i, rng));
  return { text, tone, made, won, shots, contest };
};
function pworkoutCard(L) {
  const I = intrOf(L);
  const clubs = (L.flags.cmbClubs || []).slice().sort((a, b) => (I[b] || 0) - (I[a] || 0));
  const c = clubs[0] || combineClubs(L)[0];
  return {
    id: 'pworkout', kind: 'event', key: 'pworkout', eyebrow: 'Private workout', scene: 'Team facility', title: 'The ' + nick(c) + ' fly you in. What do you show?',
    text: 'Their gym, their coaches, one afternoon. A trainer tosses you a ball: "Whenever you\'re ready."', ctx: { club: c },
    options: [
      { label: 'Go one on one with a prospect', hint: 'Win big or lose loud' },
      { label: 'Run their sets with the coaches', hint: 'Show you learn fast' },
      { label: 'Shoot until they say stop', hint: 'Let the jumper talk' },
    ],
  };
}
/* The answers to a private workout (choose() runs them). */
ANSWER.pworkout = function(L, card, i, opt, rng, beats, touch, touches) {
  let text = '', tone = '', made = null, won = null, shots = null, contest = null;
  ({ text, tone } = choosePworkout(L, card, i, rng));
  return { text, tone, made, won, shots, contest };
};
function combineCard(L) {
  return {
    id: 'combine', kind: 'event', key: 'combine', eyebrow: 'Draft combine', scene: 'Testing day', title: 'Every team is watching. How much do you show?',
    text: 'Thirty front offices, a wall of stopwatches. A scout clicks his pen: "Whenever you\'re ready."', ctx: { story: 1 },
    options: [
      { label: 'Test everything', hint: 'Your body on full display' },
      { label: 'Shoot and run the drills', hint: 'Skill over speed' },
      { label: 'Play in the scrimmages', hint: 'Anything goes, five on five' },
      { label: 'Sit out and let the tape talk', hint: 'Safe, but teams wonder why' },
    ],
  };
}
/* The answers to the combine (choose() runs them). */
ANSWER.combine = function(L, card, i, opt, rng, beats, touch, touches) {
  let text = '', tone = '', made = null, won = null, shots = null, contest = null;
  if (card.ctx && card.ctx.story) { ({ text, tone } = chooseCombine(L, i, rng)); return { text, tone, made, won, shots, contest }; }
  const r = rng();
  if (i === 0) {
    const fit = (L.rt.ath + L.rt.sho) / 2;
    if (r < clamp(0.3 + (fit - 55) * 0.012, 0.15, 0.85)) { L.flags.stock = (L.flags.stock || 0) + 3; text = 'You test off the charts. By dinner your agent\'s phone won\'t stop.'; tone = 'good'; }
    else { L.flags.stock = (L.flags.stock || 0) - 2.5; text = 'Nothing jumps off the sheet. A few teams cool on you.'; tone = 'bad'; }
  } else if (i === 1) {
    if (r < clamp(0.35 + (L.rt.sho - 55) * 0.015, 0.1, 0.9)) { L.flags.stock = (L.flags.stock || 0) + 1.8; text = 'Forty-one of fifty. The scouts stop talking.'; tone = 'good'; }
    else { L.flags.stock = (L.flags.stock || 0) - 1; text = 'Cold day. It happens, and somebody writes it down.'; tone = 'bad'; }
  } else { text = 'You stay home. Your stock doesn\'t move.'; }
  L.pending.unshift(workoutCard(L));
  queueEvents(L, 'predraft', 1 + (rng() < 0.4 ? 1 : 0));
  return { text, tone, made, won, shots, contest };
};
function workoutCard(L) {
  const order = draftOrder(L);
  const proj = projectedPick(L);
  const slot = (p) => order[clamp(p, 1, 60) - 1];
  const slots = [Math.max(1, proj - 9), Math.max(1, proj - 1), Math.min(60, proj + 7)];
  const seen = {};
  const picks = slots.map((p) => ({ club: slot(p), slot: p })).filter((x) => !seen[x.club] && (seen[x.club] = 1));
  const clubs = picks.map((x) => x.club);
  return {
    id: 'workout', kind: 'event', key: 'workout',
    eyebrow: 'Private workouts', scene: 'Your phone', title: 'Three teams want a workout. Who gets it?',
    text: "You've only got time for one. The board has you going around " + ordinal(proj) + '.',
    ctx: { clubs, proj },
    options: picks.map((x) => ({ label: 'The ' + nick(x.club),
      hint: 'They pick ' + ordinal(x.slot) + '. ' + clubTier(clubNet(L, x.club)) + '.', club: x.club, slot: x.slot })),
  };
}
/* The answers to a pre-draft workout (choose() runs them). */
ANSWER.workout = function(L, card, i, opt, rng, beats, touch, touches) {
  let text = '', tone = '', made = null, won = null, shots = null, contest = null;
  const c = opt.club;
  const theirs = opt.slot;
  const proj = projectedPick(L);
  if (theirs < proj - 4) {
    if (rng() < 0.45) { L.flags.stock = (L.flags.stock || 0) + 2; L.flags.promise = { club: c, slot: theirs }; text = 'You blow them away. They promise to take you at ' + ordinal(theirs) + '.'; tone = 'gold'; }
    else { text = 'Good workout, but they\'ve got somebody else in mind at ' + ordinal(theirs) + '.'; }
  } else {
    L.flags.promise = { club: c, slot: theirs }; text = 'They love you. If you\'re still there, you\'re theirs.'; tone = 'good';
  }
  L.pending.unshift(agentCard(L));
  return { text, tone, made, won, shots, contest };
};
const AGENT_HINT = { power: 'Biggest deals, biggest cut', boutique: 'Smaller cut, knows your family', cousin: "Free, and he's never done this" };
function agentCard(L) {
  return {
    id: 'agent', kind: 'event', key: 'agent',
    eyebrow: 'Representation', scene: 'Home', title: "Who's going to do your deals?",
    text: 'Three pitches in three days. Pick once: whoever you sign handles every contract from here.',
    options: Object.keys(AGENTS).map((k) => ({ label: 'Sign with ' + agentNameFor(L, k), hint: AGENT_HINT[k], agent: k })),
  };
}
/* The answers to picking an agent (choose() runs them). */
ANSWER.agent = function(L, card, i, opt, rng, beats, touch, touches) {
  let text = '', tone = '', made = null, won = null, shots = null, contest = null;
  L.agent = opt.agent;
  text = say(L, '{agent}') + ' it is.';
  if (L.agent === 'cousin') bump(L, { morale: 8 });
  L.phase = 'draft';
  return { text, tone, made, won, shots, contest };
};
/* A rookie deal, off the slot. Pick 1 is about seven percent of the cap and the
   scale falls to about one and a half by pick 30. Second rounders and the
   undrafted sign for the minimum. */
function rookieSalary(L, p) {
  const cap = capFor(L.year);
  if (p > 30) return round1(cap * MIN_PCT);
  return round1(cap * (0.072 * Math.pow(0.948, p - 1)));
}

const stockUp = (L, d) => { L.flags.stock = (L.flags.stock || 0) + d; };
function chooseCombine(L, i, rng) {
  const r = rng();
  let text, tone = '';
  const ath = L.rt.ath + (Number.isFinite(L.ht) ? 0 : 0);
  if (i === 0) {
    if (r < clamp(0.25 + (ath - 55) * 0.014, 0.1, 0.85)) { stockUp(L, 2.4); text = "Top five in the vertical and the lane agility. Your agent's phone starts ringing."; tone = 'good'; }
    else if (r < 0.75) { stockUp(L, 0.3); text = "Solid numbers. Nothing anybody's talking about."; }
    else { stockUp(L, -2); text = "You're slow in the sprints. A few teams cool on you."; tone = 'bad'; }
  } else if (i === 1) {
    const sk = (L.rt.sho + L.rt.fin) / 2;
    if (r < clamp(0.3 + (sk - 55) * 0.014, 0.1, 0.85)) { stockUp(L, 1.6); text = 'Forty-one of fifty off the move. The room goes quiet.'; tone = 'good'; }
    else { stockUp(L, -0.8); text = 'A cold day in the drills. Somebody notices.'; tone = 'bad'; }
  } else if (i === 2) {
    const o = ovrOf(L) + (L.rt.iq - 60) * 0.2;
    if (r < clamp(0.2 + (o - 60) * 0.02, 0.08, 0.8)) { stockUp(L, 3); bump(L, { fame: 3 }); text = 'You own the scrimmage. Two GMs step out to call home.'; tone = 'gold'; }
    else if (r < 0.7) { stockUp(L, 0.4); text = 'A good game in a sloppy scrimmage. Nobody learns much.'; }
    else { stockUp(L, -2.6); text = "Four turnovers in the first half. It's on every highlight show."; tone = 'bad'; }
  } else {
    stockUp(L, L.m.fame >= 45 ? 0 : -0.6); text = L.m.fame >= 45 ? "You stay home. Your stock doesn't move." : "You stay home. A few teams wonder what you're hiding.";
  }
  L.flags.cmbTest = i;
  const clubs = combineClubs(L);
  L.flags.cmbClubs = clubs;
  L.pending.unshift(interviewCard(L, clubs, 0));
  queueEvents(L, 'predraft', 1 + (rng() < 0.4 ? 1 : 0));
  return { text, tone };
}
function chooseInterview(L, card, i, rng) {
  const q = CMB_Q.find((x) => x.id === card.ctx.q), a = q.a[i], c = card.ctx.club;
  const st = styleOf(L, c);
  const I = intrOf(L);
  const d = (a[1][st] || 0) + 1 + (rng() < 0.3 ? 1 : 0);
  I[c] = (I[c] || 0) + d;
  moveRep(L, a[2][0], a[2][1]);
  if (d >= 3) stockUp(L, 0.3);
  remember(L, 'cmb.' + q.id, i);
  const clubs = card.ctx.clubs;
  if (card.ctx.n + 1 < 2 && clubs[card.ctx.n + 1]) L.pending.unshift(interviewCard(L, clubs, card.ctx.n + 1));
  else L.pending.unshift(pworkoutCard(L));
  const how = d >= 3 ? ' They loved it.' : d <= 0 ? " It didn't land." : '';
  return { text: a[3] + how, tone: d >= 3 ? 'good' : d <= 0 ? 'bad' : '' };
}
function choosePworkout(L, card, i, rng) {
  const c = card.ctx.club, I = intrOf(L);
  const r = rng();
  let text, tone = '';
  if (i === 0) {
    if (r < clamp(0.25 + (ovrOf(L) - 60) * 0.02, 0.1, 0.8)) { I[c] = (I[c] || 0) + 4; stockUp(L, 1.2); text = 'You win the one on one, eleven to six. Their GM stops pretending to text.'; tone = 'good'; }
    else { I[c] = (I[c] || 0) - 1; stockUp(L, -0.6); text = "The other kid wins it. You're quiet the whole flight home."; tone = 'bad'; }
  } else if (i === 1) {
    if (r < clamp(0.35 + (L.rt.iq - 60) * 0.02, 0.15, 0.85)) { I[c] = (I[c] || 0) + 3; text = 'You know their whole playbook by sundown. Their coach asks for your number.'; tone = 'good'; }
    else { I[c] = (I[c] || 0) + 1; text = "You get lost in one set. They're patient about it."; }
  } else {
    if (r < clamp(0.3 + (L.rt.sho - 60) * 0.02, 0.1, 0.85)) { I[c] = (I[c] || 0) + 2; stockUp(L, 0.8); text = 'Eighty-two of a hundred. They stopped counting at sixty.'; tone = 'good'; }
    else { I[c] = (I[c] || 0) + 0; text = "A streaky day. They've seen better shooters this week."; }
  }
  L.pending.unshift(agentCard(L));
  return { text, tone };
}
/* THE CLASS. You are not the only prospect, so the top of the board is not
   yours by default. A class has its own best players, seeded per career, and
   you go first only when you are better than all of them on the night. */
function classTop(L) {
  const r = rngAt(L, 'class');
  const top = 95.5 + norm(r) * 2.2;
  const out = [top];
  for (let k = 1; k < 6; k++) out.push(out[k - 1] - 0.6 - r() * 1.6);
  return out;
}
function runDraft(L, beats) {
  const order = draftOrder(L);
  const rng = rngAt(L, 'draftnight');
  let p = projectedPick(L, norm(rng) * 2.2);
  const promised = L.flags.promise;
  let team = null;
  if (!promised && p > 60 && !(recall(L, 'route.rec') && !recall(L, 'rec.viral'))) {
    /* Just off the board, a club that liked you in the room can still spend a
       late second round pick on you. Only just off it: a player that far
       from the board makes a roster through Summer League or not at all. */
    const I = L.flags.intr || {};
    let best = null;
    for (const c of L.flags.cmbClubs || []) if (!best || (I[c] || 0) > (I[best] || 0)) best = c;
    if (best && (I[best] || 0) >= 1 && draftStock(L) >= 71 && rng() < 0.65 + (I[best] - 1) * 0.05) {
      /* Their own second round pick, the latest one they have. */
      for (let k = 60; k >= 31; k--) if (order[k - 1] === best) { team = best; p = k; L.flags.reach = best; break; }
    }
  }
  if (!promised && !team && p <= 60) {
    /* A club that loved you takes you a little early, if it picks within a
       few slots ahead of where you would go. Never more than that. */
    const s = draftStock(L) + norm(rng) * 1.5;
    p = Math.max(p, 1 + classTop(L).filter((x) => x > s).length);
    /* Second round means the second round, however good the road was. */
    if (L.challenge === 'ch_late') p = Math.max(p, 31);
    const I = L.flags.intr || {};
    for (let k = Math.max(L.challenge === 'ch_late' ? 31 : 1, p - 4); k < p; k++) {
      const c = order[k - 1];
      if ((I[c] || 0) >= 4 && rng() < 0.25 + (I[c] - 4) * 0.08) { team = c; p = k; L.flags.reach = c; break; }
    }
  }
  if (promised && promised.slot <= p + 6) { team = promised.club; p = promised.slot; }
  if (!team) {
    if (p > 60) team = null;
    else team = order[p - 1];
  }
  if (!team) {
    /* Undrafted: three clubs offer a two-way deal and you choose. */
    const pool = CLUBS.slice().sort((a, b) => clubNet(L, a) - clubNet(L, b));
    const three = [pool[2 + Math.floor(rng() * 6)], pool[11 + Math.floor(rng() * 6)], pool[20 + Math.floor(rng() * 6)]];
    L.draft = { pick: null, round: null, team: null };
    makeRival(L, null);
    beats.push({ kind: 'draft', text: 'Sixty names. Not yours.', tone: 'bad' });
    logIt(L, 'Went undrafted.', 'bad');
    /* A story career has to earn the deal: a Summer League invite is a
       tryout, and the money overseas is real. */
    remember(L, 'route.undrafted', true);
    L.pending.push({
      id: 'undrafted', kind: 'event', key: 'undrafted', eyebrow: 'After the draft',
      scene: 'Your phone', title: 'Sixty names, none yours. Now who calls?',
      text: 'Three clubs want you for Summer League. {agent:first} is blunt: "It\'s a tryout, not a deal."',
      ctx: { story: 1 },
      options: three.map((c) => ({ label: 'Play Summer League for the ' + nick(c), hint: clubTier(clubNet(L, c)) + ', two-way on the line', club: c }))
        .concat([{ label: 'Take the money overseas', hint: 'Real money now, NBA later' }]),
    });
    return;
  }
  const round = p > 30 ? 2 : 1;
  L.draft = { pick: p, round, team };
  L.draft.net = round1(clubNet(L, team));
  makeRival(L, p);
  const sal = rookieSalary(L, p);
  L.contract = { years: round === 1 ? 4 : 2, total: round === 1 ? 4 : 2, salary: sal, kind: round === 1 ? 'rookie' : 'min', start: L.year };
  joinTeam(L, team, false);
  const line = 'With the ' + ordinal(p) + ' pick, the ' + E.teamName(team) + ' select ' + L.name + '.';
  beats.push({ kind: 'draft', text: line, tone: p <= 5 ? 'gold' : 'good', pick: p, team });
  logIt(L, line, p <= 5 ? 'gold' : 'good');
  if (p === 1) bump(L, { fame: 18 });
  else if (p <= 5) bump(L, { fame: 10 });
  else if (p <= 14) bump(L, { fame: 5 });
  L.phase = 'drafted';
  /* Draft night itself, before the summer it opens. */
  queueEvents(L, 'dn', 1);
  openYear(L);
  /* A first-round pick walks across the stage to the podium. Ahead of
     whatever the summer has queued, because it happens tonight. */
  if (round === 1) L.pending.unshift(presserCard(L, 'draft'));
}
/* The answers to going undrafted (choose() runs them). */
ANSWER.undrafted = function(L, card, i, opt, rng, beats, touch, touches) {
  let text = '', tone = '', made = null, won = null, shots = null, contest = null;
  if (card.ctx && card.ctx.story) {
    if (!opt.club) {
      L.flags.overseas = (L.flags.overseas || 0) + 1;
      L.contract = { years: 1, total: 1, salary: 0.8, kind: 'overseas', start: L.year };
      L.phase = 'drafted';
      text = 'A one-year deal in Europe. Real money, real minutes.';
      logIt(L, 'Signed overseas after going undrafted.', '');
      return { text, tone, made, won, shots, contest };
    }
    /* The floor is 5%: a player too weak to be drafted almost never talks
       his way onto a roster from Summer League. At 10% the high school
       road reached the league 94.9% of the time over 3,000 careers, on
       the 95% ceiling, so CI's 1,000 flapped with any change to the
       seeds. At 5% it is 94.4 on CI's sample and 94.3 on 1,500 roads. */
    const pSL = clamp(0.04 + (ovrOf(L) - 58) * 0.033 + (L.m.fame - 20) * 0.003, 0.05, 0.85);
    if (rng() >= pSL) {
      L.flags.overseas = (L.flags.overseas || 0) + 1;
      L.contract = { years: 1, total: 1, salary: 0.6, kind: 'overseas', start: L.year };
      L.phase = 'drafted';
      text = 'Five games in Las Vegas. Good ones. The ' + nick(opt.club) + ' go another way. You sign overseas.';
      tone = 'bad';
      logIt(L, 'Cut after Summer League. Signed overseas.', 'bad');
      return { text, tone, made, won, shots, contest };
    }
    remember(L, 'sl.made', true);
  }
  L.contract = { years: 1, total: 1, salary: round1(capFor(L.year) * MIN_PCT), kind: 'min', start: L.year };
  /* A two-way deal is mostly G League nights, until the club converts it. */
  if (card.ctx && card.ctx.story) L.contract.tw = 1;
  joinTeam(L, opt.club, false);
  L.draft = { pick: null, round: null, team: opt.club };
  text = L.contract.tw ? 'Two-way deal with the ' + E.teamName(opt.club) + '. Most nights you\'ll be in the G League. Prove you belong.'
    : 'Two-way deal with the ' + E.teamName(opt.club) + '. Prove it.'; tone = 'good';
  logIt(L, text, 'good');
  L.phase = 'drafted';
  openYear(L);
  return { text, tone, made, won, shots, contest };
};

/* THE LAST TIME YOU WERE TRADED, for the scene that tells you. It lives
   outside the save on purpose: it is about this press of a button, and the
   step or the card that made the trade turns it into a beat and clears it. */
let TRADED = null;
function joinTeam(L, c, trade) {
  const from = L.team;
  /* Nobody is traded to the club he is already on. */
  if (trade && from && from === c) return false;
  if (trade && from) TRADED = { from, to: c, back: null };
  L.team = c;
  L.m.trust = 50;
  if (trade) L.flags.moved = (L.flags.moved || 0) + 1;
  const stars = L.year === L.league.latest + 1 ? (L.league.stars[c] || []) : [];
  const mates = stars.length ? ' You join ' + listNames(stars) + '.' : '';
  if (from && from !== c) logIt(L, (trade ? 'Traded to the ' : 'Signed with the ') + E.teamName(c) + '.' + mates, 'gold');
  else if (!from && mates) logIt(L, mates.trim(), '');
}
function listNames(a) {
  if (a.length <= 1) return a.join('');
  return a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
}

// ─── a season ───────────────────────────────────────────────────────────────

function newSeason(L) {
  L.season = {
    year: L.year, team: L.team, g: 0, w: 0, l: 0, gp: 0,
    tot: { min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fga: 0, fgm: 0, tpa: 0, tpm: 0, fta: 0, ftm: 0 },
    hi: { pts: 0, reb: 0, ast: 0 },
    out: 0, injury: null,
    mods: { min: 0, usage: 0, perf: 0, win: 0, risk: 0, rest: 0 },
    used: {}, acts: {}, allstar: false, awards: [], po: null, notes: [], role: null,
    startOvr: ovrOf(L), startTeam: L.team, asked: {},
  };
}

/* The overall you play at this season: the real number, plus how you feel. */
function effOvr(L) {
  const s = L.season;
  return ovrOf(L) + (L.m.morale - 55) * 0.04 + (s ? s.mods.perf : 0) - Math.max(0, 45 - L.m.health) * 0.08;
}
/* MINUTES ARE A PLACE ON YOUR CLUB (story careers in the league). You are
   ranked against your teammates' overalls: the best man on the club plays
   about thirty-four minutes, the fifth about twenty-six, the ninth about
   eleven, the way a real rotation is shaped. diff is your overall against
   the club's fifth best man, so nought is the edge of the starting five. */
const RANK_MIN = [34.5, 32.5, 30.5, 28.5, 26.5, 23, 19.5, 16, 12, 8, 5, 3, 2, 2, 2, 2];
function roleRank(L) {
  const mates = matesOf(L, L.team);
  if (!mates.length) return null;
  const me = effOvr(L);
  const above = mates.filter((m) => m.ovr > me).length;
  const fifth = (mates[4] || mates[mates.length - 1]).ovr;
  /* Between two ranks the gap decides: a man a point behind the one ahead
     of him plays close to his minutes. */
  const up = above > 0 ? mates.filter((m) => m.ovr > me).reduce((a, m) => Math.min(a, m.ovr), 99) : null;
  const lean = up != null ? clamp(1 - (up - me) / 4, 0, 1) * 0.5 : 0;
  const min = RANK_MIN[above] + lean * ((RANK_MIN[Math.max(0, above - 1)]) - RANK_MIN[above]);
  return { above, min, diff: me - fifth, best: above === 0, clear: clearlyAbove(mates, me) };
}
function clearlyAbove(mates, me) { return mates.filter((m) => m.ovr > me + CLEAR_GAP).length; }
/* The most a man with k clearly better teammates may play: a minute under
   what the kth of them is given. */
function clearCap(k) { return k > 0 ? RANK_MIN[Math.min(k, RANK_MIN.length) - 1] - 1 : Infinity;
}
function roleOf(L) {
  const net = clubNet(L, L.team);
  if (L.stage === 'nba' && L.team && rostOf(L)) {
    const rk = roleRank(L);
    if (rk) {
      let min = rk.min + (L.m.trust - 50) * 0.05 + (L.season ? L.season.mods.min : 0);
      if (L.contract && L.contract.kind === 'rookie' && L.draft && L.draft.pick <= 5 && net < 0) min += 3;
      min = clamp(depthCheck(L, min, rk.diff), 2, 38.5);
      min = Math.min(min, clearCap(rk.clear));
      if (L.contract && L.contract.tw) return { min: round1(Math.min(min, TW_MIN)), diff: rk.diff, label: 'Two-way', starter: false, rank: rk.above + 1, tw: 1 };
      /* The first man off the bench is a job of its own. The sixth man route
         and ending always asked for this label; nothing wrote it until now. */
      const label = rk.best && min >= 33 ? 'Franchise player' : min >= 24 ? 'Starter' : min >= 20 && rk.above <= 5 ? 'Sixth man' : min >= 15 ? 'Rotation' : 'End of bench';
      return { min: round1(min), diff: rk.diff, label, starter: min >= 24, rank: rk.above + 1 };
    }
  }
  const diff = effOvr(L) - rotationBar(net);
  let min = diff >= 14 ? 35.5 : diff >= 7 ? 32.5 : diff >= 0 ? 27.5 : diff >= -5 ? 20 : diff >= -10 ? 13 : 7;
  min += (L.m.trust - 50) * 0.05 + (L.season ? L.season.mods.min : 0);
  if (L.contract && L.contract.kind === 'rookie' && L.draft && L.draft.pick <= 5 && net < 0) min += 3;
  min = clamp(depthCheck(L, min, diff), 2, 38.5);
  const label = (diff >= 12 && min >= 33) ? 'Franchise player' : min >= 30 ? 'Starter' : min >= 24 ? 'Starter' : min >= 15 ? 'Rotation' : 'End of bench';
  return { min: round1(min), diff, label, starter: min >= 24 };
}
/* THE STARTING FIVE covers all five positions, always. A man counts at full
   value at his own position and at 0.85 at a position next to it (or a
   second one the data lists for him). Two away is 0.15 and further 0.03, so
   a center only ever plays the point when nobody else on the roster can. bestFive is exact: it tries every
   way of filling the five slots and keeps the best, with anyone marked
   `force` (you, when your minutes make you a starter) always in. */
const SLOTS5 = ['PG', 'SG', 'SF', 'PF', 'C'];
function fitAt(pos, slot, ep) {
  if (pos === slot) return 1;
  if ((ep && ep.indexOf(slot) >= 0) || (NEXT_POS[pos] || []).indexOf(slot) >= 0) return 0.85;
  const d = Math.abs(SLOTS5.indexOf(pos) - SLOTS5.indexOf(slot));
  return d === 2 ? 0.15 : 0.03;
}
function bestFive(cands) {
  let states = { 0: { s: 0, a: [] } };
  cands.forEach((c, i) => {
    const next = {};
    const put = (m, st) => { if (!next[m] || next[m].s < st.s) next[m] = st; };
    for (const k in states) {
      const m = +k, st = states[k];
      if (!c.force) put(m, st);
      for (let j = 0; j < 5; j++) if (!(m & (1 << j))) put(m | (1 << j), { s: st.s + c.v * fitAt(c.pos, SLOTS5[j], c.ep), a: st.a.concat([[i, j]]) });
    }
    states = next;
  });
  const full = states[31];
  if (!full) return null;
  const out = [];
  for (const [i, j] of full.a) out[j] = i;
  return { slots: out, score: full.s };
}
/* THE ROTATION: your club in minutes order, with you placed by the minutes
   you are actually getting (this season's average once a game is played, the
   coach's plan before that). The starting five is bestFive; the rest come off
   the bench by value, and everyone shares 240 off a real rotation's shape.
   Display only: the season sim reads your minutes from roleOf, never this. */
const ROT_SHAPE = [35, 33, 31, 29, 27, 24, 20, 16, 12, 8, 5, 0, 0, 0, 0];
function rotationOf(L) {
  if (L.stage !== 'nba' || !L.team) return null;
  const s = L.season, role = roleOf(L);
  const played = s && s.gp > 0 && s.tot && s.tot.min > 0;
  const mine = round1(played ? s.tot.min / s.gp : role.min);
  const lines = L.league.lines || {};
  const mates = matesOf(L, L.team).slice(0, 14);
  let at = ROT_SHAPE.findIndex((m) => m <= mine);
  if (at < 0 || at > mates.length) at = mates.length;
  /* Never above a man clearly better than you, whatever the minutes say. */
  const meNow = effOvr(L), better = (m) => (m.ovr > meNow + CLEAR_GAP);
  at = Math.max(at, Math.min(mates.length, mates.filter(better).length));
  /* The label and the screen are one answer: a coach who calls you a
     starter puts you in the five, at whatever minutes he plays you. */
  if (role.starter && at > 4) at = 4;
  const youStart = at < 5;
  const me = { n: L.name, pos: L.pos, age: L.age, you: true, min: mine, pts: null, w: 0, ovr: ovrOf(L), pay: L.contract ? L.contract.salary : null, yrs: L.contract ? L.contract.years : null, pg: L.age <= 25 && L.pot ? potGrade(Math.max(L.pot, ovrOf(L))) : null };
  const epOf = (m) => { const ln = lines[m.n]; return ln && ln[5] ? String(ln[5]).split(';') : null; };
  const cands = mates.map((m) => ({ v: Math.max(0.1, (m.ovr || mateOvr(m.w)) - 55), pos: m.pos, ep: epOf(m), m }));
  if (youStart) cands.unshift({ v: 1000, pos: L.pos, ep: null, force: true, m: me });
  const five = bestFive(cands);
  const starters = five.slots.map((i, j) => ({ slot: SLOTS5[j], m: cands[i].m }));
  const bench = mates.filter((m) => !starters.some((x) => x.m === m)).sort((a, b) => b.ovr - a.ovr || b.w - a.w);
  /* Minutes: the rotation's shape without your slot. Starters take the top
     of it by value, the bench the rest, scaled so the club plays 240. */
  const shape = ROT_SHAPE.slice(0, mates.length + 1);
  shape.splice(at, 1);
  const tot = shape.reduce((a, x) => a + x, 0) || 1, left = Math.max(0, 240 - mine);
  const row = (m, k, slot) => {
    const min = round1(shape[k] * left / tot), ln = lines[m.n];
    /* Points: last season's rate for a man the data has, otherwise one off
       his value; at the minutes he is getting now. */
    const rate = ln && ln[0] > 0 ? ln[1] / ln[0] : 0.18 + Math.max(0, m.w) * 0.035;
    return { n: m.n, pos: m.pos, age: m.age, real: m.real, ovr: m.ovr, pay: m.pay, yrs: m.yrs, pg: m.pg, min, pts: min > 0 ? round1(rate * min) : 0, slot };
  };
  const rows = new Map();
  starters.filter((x) => x.m !== me).sort((a, b) => b.m.ovr - a.m.ovr || b.m.w - a.m.w).forEach((x, k, arr) => rows.set(x.m, row(x.m, k, x.slot)));
  const nS = starters.filter((x) => x.m !== me).length;
  bench.forEach((m, k) => rows.set(m, row(m, nS + k, null)));
  /* A season average can sit above the cap (minutes played before a star
     arrived, or before a promotion was taken back), so the screen still puts
     a clearly better man ahead of you: he plays at least half a minute more. */
  const top = Math.max(mine, role.min);
  rows.forEach((r, m) => {
    if (!better(m) || r.min > top) return;
    const ln = lines[m.n], rate = ln && ln[0] > 0 ? ln[1] / ln[0] : 0.18 + Math.max(0, m.w) * 0.035;
    r.min = round1(Math.min(40, top + 0.5)); r.pts = round1(rate * r.min);
  });
  me.slot = youStart ? starters.find((x) => x.m === me).slot : null;
  /* The five in position order, then the bench (you among it if you come
     off it) in minutes order. Rank is by minutes across the whole club. */
  const five5 = starters.map((x) => (x.m === me ? me : rows.get(x.m)));
  const rest = bench.map((m) => rows.get(m)).concat(youStart ? [] : [me]).sort((a, b) => b.min - a.min);
  const list = five5.concat(rest);
  list.slice().sort((a, b) => b.min - a.min).forEach((x, i) => { x.rank = i + 1; });
  rest.forEach((x, k) => { x.role = x.min <= 0 ? 'Out of the rotation' : k === 0 ? 'Sixth man' : x.min >= 10 ? 'Rotation' : 'Bench'; });
  five5.forEach((x) => { x.role = 'Starter'; });
  return { list, rank: me.rank, min: mine, played, role: me.role, slot: me.slot || null, plan: role.label, club: L.team, gp: s ? s.gp : 0 };
}
function usageOf(L, role) {
  const a = ARCHES[L.arch];
  /* On a story career the shots go down the club's pecking order: the best
     man is the first option, the fourth starter the fourth. */
  const f = role.rank ? clamp(0.8 - (role.rank - 1) * 0.12 + role.diff * 0.01, 0, 1.25) : clamp(role.diff / 22 + 0.35, 0, 1.25);
  const u = 0.13 + 0.17 * f + a.usage + (L.season ? L.season.mods.usage : 0);
  return clamp(u, 0.08, 0.37);
}
/* The man's per-game means at these minutes. */
function lineMeans(L, min, usage) {
  const r = L.rt, a = ARCHES[L.arch];
  const scoring = r.sho * 0.55 + r.fin * 0.45;
  const ts = clamp(0.47 + (scoring - 55) * 0.0032 + (r.iq - 60) * 0.0005, 0.44, 0.67);
  const tsa = min / 48 * 99 * usage * 0.86;
  const pts = 2 * ts * tsa;
  const fta = tsa * 0.26, fga = tsa - 0.44 * fta;
  const threeShare = clamp(0.15 + (r.sho - 55) * 0.008 + a.three, 0.02, 0.62);
  const tpa = fga * threeShare;
  const tpp = clamp(0.28 + (r.sho - 55) * 0.0032, 0.22, 0.44);
  const ftp = clamp(0.62 + (r.sho - 50) * 0.005, 0.5, 0.92);
  const posReb = { PG: 4, SG: 4.6, SF: 6, PF: 7.6, C: 8.6 }[L.pos] + (Number.isFinite(L.ht) ? sizeOf(L).dh * 0.25 : 0);
  const reb = Math.max(posReb * 0.55, posReb + (r.reb - 50) * 0.14) * min / 36;
  const ast = Math.max(0.3, (0.8 + (r.pla - 45) * 0.16) * (0.7 + usage) * min / 36);
  const stl = Math.max(0.1, (0.5 + (r.def - 55) * 0.02 + (r.ath - 55) * 0.008) * min / 36);
  const big = Math.max(0.1, { PG: 0.2, SG: 0.25, SF: 0.45, PF: 0.8, C: 1.2 }[L.pos] + (archBase(L) === 'anchor' ? 0.6 : 0) + (Number.isFinite(L.ht) ? sizeOf(L).dh * 0.07 : 0));
  const blk = Math.max(0.05, (big + (r.def - 55) * 0.02 * big) * min / 36);
  return { pts, fga, tpa, tpp, fta, ftp, reb, ast, stl, blk, ts };
}
/* What you add to the club when you play: points per hundred possessions. */
function impact(L, min) {
  return (effOvr(L) - 68 + lvl(L).edge * 4) * 0.32 * (min / 48);
}
/* A game's odds off a net rating. Clamped short of certainty, because the
   best real team ever lost nine and a career sim that hands out 81-1 has
   stopped describing basketball. */
const gameP = (net, home) => clamp(0.5 + net * 0.03 + (home ? 0.03 : -0.03), 0.1, 0.84);

function rollInjury(L, chunk, beats) {
  const s = L.season;
  if (!s || (s.injury && s.injury.until > CHUNKS[chunk][0])) return;
  const rng = rngAt(L, 'inj:' + chunk);
  const a = L.age;
  const p = 0.065 + (100 - L.dur) * 0.0011 + Math.max(0, a - 28) * 0.009
    + Math.max(0, 60 - L.m.health) * 0.0016 + s.mods.risk;
  if (rng() >= p * (trait(L, 'injuryProne') ? 1.3 : trait(L, 'ironMan') ? 0.65 : 1) * lvl(L).inj) return;
  if ((tw(L).inj = (tw(L).inj || 0) + 1) >= 3) reveal(L, 'injuryProne', 'Three injuries already. You know the training room by heart.', beats);
  const r = rng();
  const from = CHUNKS[chunk][0] + Math.floor(rng() * 20);
  if (r < 0.62) {
    const g = 2 + Math.floor(rng() * 7);
    s.injury = { from, until: from + g, kind: pick(rng, ['sprained ankle', 'tight hamstring', 'bruised knee', 'sore back', 'jammed finger']) };
    beats.push({ kind: 'injury', text: 'A ' + s.injury.kind + ' costs you ' + g + ' games.', tone: 'bad' });
    logIt(L, 'Missed ' + g + ' games with a ' + s.injury.kind + '.', 'bad');
    bump(L, { health: -6 });
    return;
  }
  const major = r > 0.9;
  const kind = major ? pick(rng, ['torn meniscus', 'broken wrist', 'torn ligament in the foot'])
    : pick(rng, ['high ankle sprain', 'strained calf', 'groin strain']);
  const g = major ? 30 + Math.floor(rng() * 26) : 10 + Math.floor(rng() * 12);
  s.injury = { from, until: from + g, kind, pendingDecision: true };
  /* Some major injuries end a career (endings.js), read on their own stream. */
  if (major && L.stage === 'nba' && L.seasonsDone >= 1 && rngAt(L, 'careerend:' + chunk)() < careerEndP(L)) { L.pending.push(careerInjuryCard(L, kind)); return; }
  L.pending.push({
    id: 'injury', kind: 'event', key: 'injury:' + chunk, eyebrow: 'Injury report', scene: "The trainer's room",
    title: "It's a " + kind + '. Now what?',
    text: 'Dr. {doctor:last} holds up the scan: "' + g + ' games, give or take. How we get there is your call."',
    ctx: { g, major },
    options: major ? [
      { label: 'Get the surgery now', hint: 'Out longer, back whole' },
      { label: 'Rehab it and rush back', hint: 'Sooner, but it might not hold' },
      { label: 'Fly to a specialist', hint: 'Pricey, but better odds' },
    ] : [
      { label: 'Play through it', hint: 'Half the time, real risk' },
      { label: 'Take the full time off', hint: 'Do it right' },
    ],
  });
}
/* The answers to an injury (choose() runs them). */
ANSWER.injury = function(L, card, i, opt, rng, beats, touch, touches) {
  let text = '', tone = '', made = null, won = null, shots = null, contest = null;
  const s = L.season, inj = s && s.injury;
  const g = card.ctx.g;
  if (inj) {
    if (card.ctx.major) { remember(L, 'inj.major', L.age); remember(L, 'inj.majors', ((L.mem['inj.majors'] && L.mem['inj.majors'].v) || 0) + 1); }
    if (card.ctx.major) {
      if (i === 0) { inj.until = inj.from + g; bump(L, { ath: -2, health: -8 }); text = 'The surgery goes well. Now comes the long part.'; }
      else if (i === 1) {
        if (rng() < 0.55) { inj.until = inj.from + Math.round(g * 0.6); bump(L, { health: -6 }); text = 'You\'re back early, and it holds.'; tone = 'good'; }
        else { inj.until = inj.from + Math.round(g * 1.3); bump(L, { ath: -4, health: -14, dur: -6 }); text = 'It doesn\'t hold. Now you need the surgery anyway.'; tone = 'bad'; }
      } else { bump(L, { cash: -Math.min(0.6, L.cash * 0.2) }); inj.until = inj.from + Math.round(g * 0.85); bump(L, { ath: -1 }); text = 'The specialist finds a better plan. You\'re back a little sooner.'; tone = 'good'; }
    } else if (i === 0) {
      if (rng() < 0.6) { inj.until = inj.from + Math.ceil(g / 2); bump(L, { trust: 4 }); text = 'Back in half the time. Your teammates notice.'; tone = 'good'; }
      else { inj.until = inj.from + g + 6; bump(L, { health: -8 }); text = 'You make it worse. Now you\'re out longer.'; tone = 'bad'; }
    } else { inj.until = inj.from + g; bump(L, { health: 6 }); text = varyRes(L, card, 'inj_rest', 'You give it time. It heals right.'); }
    inj.pendingDecision = false;
    const missed = inj.until - inj.from;
    logIt(L, 'Out ' + missed + ' games with a ' + inj.kind + '.', 'bad');
  }
  return { text, tone, made, won, shots, contest };
};

/* Games from..to. The club plays every one; you play the ones you are healthy
   for. Your line is drawn game by game, so a night of forty is a night of
   forty and the feed can say so. */
function playChunk(L, chunk, beats) {
  const s = L.season;
  const [from, to] = CHUNKS[chunk];
  const rng = rngAt(L, 'games:' + chunk);
  const net0 = clubNet(L, L.team) + s.mods.win;
  const role = roleOf(L);
  s.role = role;
  const usage = usageOf(L, role);
  const mean = lineMeans(L, role.min, usage);
  const opps = CLUBS.filter((c) => c !== L.team);
  /* The stretch, game by game, for the live ticker: who, where, the result
     and your line. Only the latest stretch is kept, and keeping it draws
     nothing from the rng, so a career plays exactly as it did without it. */
  const box = s.box = [];
  for (let g = from; g <= to; g++) {
    const home = g % 2 === 0;
    const hurt = s.injury && g >= s.injury.from && g < s.injury.until;
    const rest = !hurt && s.mods.rest > 0 && rng() < s.mods.rest;
    let net = net0;
    if (!hurt && !rest) {
      const mn = role.min * (0.88 + rng() * 0.24);
      const k = mn / role.min;
      const ptsMean = mean.pts * k;
      const pts = Math.max(0, Math.round(ptsMean + norm(rng) * ptsMean * 0.3));
      const reb = Math.max(0, Math.round(mean.reb * k + norm(rng) * mean.reb * 0.32));
      const ast = Math.max(0, Math.round(mean.ast * k + norm(rng) * mean.ast * 0.34));
      const stl = Math.max(0, Math.round(mean.stl * k + norm(rng) * 0.8));
      const blk = Math.max(0, Math.round(mean.blk * k + norm(rng) * 0.7));
      const tpa = Math.max(0, Math.round(mean.tpa * k + norm(rng) * 1.2));
      const tpm = Math.min(tpa, Math.max(0, Math.round(tpa * mean.tpp + norm(rng) * 0.9)));
      const fta = Math.max(0, Math.round(mean.fta * k + norm(rng) * 1.3));
      const ftm = Math.min(fta, Math.round(fta * mean.ftp));
      let twom = Math.max(0, Math.round((pts - ftm - 3 * tpm) / 2));
      const fga = Math.max(tpa + twom, Math.round(mean.fga * k + norm(rng) * 1.8));
      const T = s.tot;
      T.min += mn; T.pts += ftm + 3 * tpm + 2 * twom; T.reb += reb; T.ast += ast; T.stl += stl; T.blk += blk;
      T.fga += fga; T.fgm += tpm + twom; T.tpa += tpa; T.tpm += tpm; T.fta += fta; T.ftm += ftm;
      const p = ftm + 3 * tpm + 2 * twom;
      s.gp++;
      const opp = opps[(g * 7 + L.year) % opps.length];
      if (p > s.hi.pts) s.hi.pts = p;
      if (reb > s.hi.reb) s.hi.reb = reb;
      if (ast > s.hi.ast) s.hi.ast = ast;
      if (p > (L.flags.careerHigh || 0)) {
        L.flags.careerHigh = p;
        if (p >= 30) beats.push({ kind: 'game', text: 'Career high: ' + p + ' points against the ' + nick(opp) + '.', tone: 'gold' });
      } else if (p >= 45) beats.push({ kind: 'game', text: p + ' points against the ' + nick(opp) + '.', tone: 'gold' });
      if (p >= 10 && reb >= 10 && ast >= 10) {
        L.flags.tripleDoubles = (L.flags.tripleDoubles || 0) + 1;
        beats.push({ kind: 'game', text: 'Triple-double against the ' + nick(opp) + ': ' + p + ', ' + reb + ' and ' + ast + '.', tone: 'good' });
      }
      net = net0 + impact(L, mn);
      box.push([g, opps[(g * 7 + L.year) % opps.length], home ? 1 : 0, 0, p, reb, ast]);
    } else {
      s.out++;
      box.push([g, opps[(g * 7 + L.year) % opps.length], home ? 1 : 0, 0, -1, 0, 0]);
    }
    s.g = g;
    if (rng() < gameP(net, home)) { s.w++; box[box.length - 1][3] = 1; } else s.l++;
  }
  bump(L, { health: -Math.round(role.min * 0.1 * ((to - from + 1) / 27)) });
}

function perGame(s) {
  const g = Math.max(1, s.gp), T = s.tot;
  return {
    gp: s.gp, min: round1(T.min / g), pts: round1(T.pts / g), reb: round1(T.reb / g), ast: round1(T.ast / g),
    stl: round1(T.stl / g), blk: round1(T.blk / g),
    fgp: T.fga ? Math.round(T.fgm / T.fga * 1000) / 10 : 0,
    tpp: T.tpa ? Math.round(T.tpm / T.tpa * 1000) / 10 : 0,
    ftp: T.fta ? Math.round(T.ftm / T.fta * 1000) / 10 : 0,
  };
}

// ─── the league table and the awards ────────────────────────────────────────

function standings(L) {
  const s = L.season;
  const rng = rngAt(L, 'table');
  const recs = {};
  for (const c of CLUBS) {
    if (c === L.team) { recs[c] = { w: s.w, l: s.l }; continue; }
    const p = gameP(clubNet(L, c), true) - 0.03;
    let w = 0;
    for (let i = 0; i < GAMES; i++) if (rng() < p) w++;
    recs[c] = { w, l: GAMES - w };
  }
  const table = {};
  for (const cf of ['East', 'West']) {
    table[cf] = CONF[cf].slice().sort((a, b) => (recs[b].w - recs[a].w) || (clubNet(L, b) - clubNet(L, a)));
  }
  return { recs, table };
}

/* Each award is a question about your season against an abstract field. The
   field is not modelled player by player, because the league's real stars are
   real people and their futures are not ours to write. So the bar is a fact
   about how good a season has to be, and the draw is how crowded the year was. */
function awards(L, st) {
  const s = L.season, pg = perGame(s), o = effOvr(L);
  const rng = rngAt(L, 'awards');
  const seed = st.table[confOf(L.team)].indexOf(L.team) + 1;
  const w = s.w, out = [];
  const gpOk = s.gp >= 65;
  const lg = (x) => 1 / (1 + Math.exp(-x));
  const rookie = L.seasonsDone === 0;
  /* THE LEAGUE ALWAYS HAS OTHER MVP CANDIDATES, so even a perfect year is a
     little better than a coin flip. */
  /* A story career's MVP needs a 92, not a 91: a real deadline puts good
     players on good clubs and a top three seed with them, and at 91 MVPs ran
     3.5 in a hundred careers against a band of 1 to 3. Measured over 1,000:
     cutting the vote's odds instead barely moved it (3.3 at 0.42), because a
     man good enough to win one wins it in a season where the odds are high. */
  if (gpOk && o >= (92) && seed <= 3) {
    const sc = (o - 93) * 0.6 + (w - 55) * 0.1 + (pg.pts - 27) * 0.15 + (L.m.fame - 70) * 0.02;
    if (rng() < (0.52) * lg(sc - 0.4)) out.push('mvp');
  } else rng();
  if (gpOk) {
    const tier = o + (pg.pts - 22) * 0.12 + norm(rng) * 1.4;
    if (tier >= 93.5) out.push('an1');
    else if (tier >= 91) out.push('an2');
    else if (tier >= 88.5) out.push('an3');
  }
  if (gpOk && L.rt.def >= 90 && pg.min >= 28) {
    const sc = (L.rt.def - 95) * 0.5 + (pg.blk + pg.stl - 2.8) * 0.8;
    if (rng() < 0.6 * lg(sc)) out.push('dpoy');
  } else rng();
  if (gpOk && L.rt.def >= 84 && pg.min >= 26) {
    if (L.rt.def + norm(rng) * 2 >= 93) out.push('ad1');
    else if (L.rt.def + norm(rng) * 2 >= 89) out.push('ad2');
  }
  /* A floor, because the draw alone handed a 5.8 a night rookie the trophy. */
  if (rookie && s.gp >= 50 && pg.pts >= 11) {
    const sc = (pg.pts - 15) * 0.32 + (o - 68) * 0.18;
    if (rng() < lg(sc)) out.push('roy');
  }
  if (!rookie && s.role && !s.role.starter && s.gp >= 60 && pg.pts >= 13) {
    if (rng() < lg((pg.pts - 15) * 0.5)) out.push('6moy');
  }
  const last = L.history[L.history.length - 1];
  if (last && s.gp >= 60 && pg.pts - last.pts >= 5.5 && ovrOf(L) - last.ovr >= 4) {
    if (rng() < 0.55) out.push('mip');
  }
  if (gpOk && pg.pts >= 30.5 && rng() < 0.6 * lg((pg.pts - 32.5) * 0.9)) out.push('scor');
  return out;
}
const AWARD_NAME = {
  mvp: 'MVP', fmvp: 'Finals MVP', roy: 'Rookie of the Year', dpoy: 'Defensive Player of the Year',
  '6moy': 'Sixth Man of the Year', mip: 'Most Improved Player', an1: 'All-NBA First Team',
  an2: 'All-NBA Second Team', an3: 'All-NBA Third Team', ad1: 'All-Defensive First Team',
  ad2: 'All-Defensive Second Team', star: 'All-Star', scor: 'Scoring title', champ: 'NBA champion',
  olympic: 'Olympic gold',
  hs_allstate: 'All-State', hs_mrbb: 'Mr. Basketball', hs_aag: 'All-American Game', hs_state: 'State champion',
  c_allconf: 'All-Conference', c_cpoy: 'Conference Player of the Year', c_fr: 'National Freshman of the Year',
  c_aa1: 'First Team All-American', c_aa2: 'Second Team All-American', c_npoy: 'National Player of the Year',
  c_mop: 'Most Outstanding Player', c_f4: 'Final Four', c_champ: 'National champion',
};

function allStarCheck(L, beats) {
  const s = L.season, pg = perGame(s);
  if (s.gp < 25) return;
  const rng = rngAt(L, 'allstar');
  const st = effOvr(L) + L.m.fame * 0.07 + (pg.pts - 18) * 0.35 + (s.w - s.l) * 0.05 + norm(rng) * 1.5;
  if (st < 88.5 + BAL.star) return;
  s.allstar = true;
  const n = (L.flags.allstars || 0) + 1;
  L.flags.allstars = n;
  bump(L, { fame: 6, morale: 5 });
  const line = n === 1 ? 'You are an All-Star.' : ordinal(n) + ' All-Star selection.';
  beats.push({ kind: 'award', text: line, tone: 'gold', award: 'star', n });
  logIt(L, line, 'gold');
  L.pending.push({
    id: 'allstar', kind: 'event', key: 'allstar', eyebrow: 'All-Star Weekend', scene: 'Your phone', title: 'All-Star Saturday too. Are you in?',
    text: "The league wants you in a contest as well as Sunday's game. One event, or none.",
    options: [
      { label: 'Enter the dunk contest', hint: feel(L.rt.ath, 'Your bounce is real', 'You can get up', 'Not exactly your thing') },
      { label: 'Enter the three-point contest', hint: feel(L.rt.sho, 'Your stroke is pure', 'A streaky shooter', 'Not exactly your thing') },
      { label: 'Rest your legs', hint: "Sunday's plenty" },
    ],
  });
}
/* The answers to All-Star Saturday (choose() runs them). */
ANSWER.allstar = function(L, card, i, opt, rng, beats, touch, touches) {
  let text = '', tone = '', made = null, won = null, shots = null, contest = null;
  if (i === 0) {
    if (rng() < clamp((L.rt.ath - 60) * 0.025, 0.05, 0.85)) { L.flags.dunk = (L.flags.dunk || 0) + 1; bump(L, { fame: 10 }); text = 'You jump over a car. The building loses it. Dunk champ.'; tone = 'gold'; }
    else { bump(L, { fame: 2 }); text = 'You miss your best dunk twice. The judges are kind.'; }
    contest = contestField(L, 'dunk', tone === 'gold');
  } else if (i === 1) {
    if (rng() < clamp((L.rt.sho - 65) * 0.025, 0.05, 0.85)) { L.flags.threes = (L.flags.threes || 0) + 1; bump(L, { fame: 8 }); text = 'You drain the whole money-ball rack. Three-point champ.'; tone = 'gold'; }
    else { bump(L, { fame: 2 }); text = 'Out in the first round. You laugh it off with the guys.'; }
    contest = contestField(L, 'three', tone === 'gold');
  } else { bump(L, { health: 6 }); text = 'You skip Saturday. Fresh legs for the second half.'; }
  logIt(L, text, tone);
  // the field is display, so a career from before it keeps its log as it was
  if (contest) logIt(L, contestLine(contest), tone);
  return { text, tone, made, won, shots, contest };
};

/* The field and the scores of a Saturday contest you entered. The result is
   drawn before this runs; this only names who you were up against and writes
   the scores around it, on its own stream, so nothing else in the career
   moves. The field is real players off the league's rosters (a contest is
   basketball, where real people belong), then the league's invented stars,
   then generated names if a long career has run the real ones out. A dunk is judged out of 100 a round, a three-point round out
   of 40. Out in round one is a hyphen in the final column. */
const CONTEST = {
  dunk: { name: 'Dunk contest', n: 4, fin: 2, stars: 1, r1: [62, 96], f: [72, 100] },
  three: { name: 'Three-point contest', n: 6, fin: 3, stars: 2, r1: [13, 27], f: [17, 31] },
};
function contestField(L, kind, won) {
  const C = CONTEST[kind];
  const rng = rngAt(L, 'contest:' + kind);
  const span = (a) => a[0] + Math.floor(rng() * (a[1] - a[0] + 1));
  const distinct = (n, a) => { const out = []; while (out.length < n) { const v = span(a); if (!out.includes(v)) out.push(v); } return out.sort((x, y) => y - x); };
  const taken = new Set([L.name]), clubs = new Set([L.team]);
  const club = () => { for (let k = 0; k < 20; k++) { const c = pick(rng, CLUBS); if (!clubs.has(c)) { clubs.add(c); return c; } } return pick(rng, CLUBS); };
  const others = [];
  /* Real players first: a dunk contest is young wings and guards, a
     three-point contest is the men who take the most threes. */
  const lines = (L.league && L.league.lines) || {}, pool = [];
  for (const c of CLUBS) {
    if (c === L.team) continue;
    for (const m of matesOf(L, c)) {
      if (!m.real || taken.has(m.n)) continue;
      const ln = lines[m.n], tpa = ln ? ln[4] : 0;
      const w = kind === 'dunk' ? (m.pos !== 'C' && m.age <= 27 ? (m.age <= 24 ? 3 : 1.5) + (m.pos === 'SF' || m.pos === 'SG' ? 1 : 0) : 0)
        : (tpa >= 5 ? tpa : m.pos !== 'C' && m.pos !== 'PF' && m.age >= 22 ? 0.5 : 0);
      if (w > 0) pool.push({ n: m.n, club: c, w });
    }
  }
  while (others.length < C.n - 1 && pool.length) {
    let t = pool.reduce((a, x) => a + x.w, 0) * rng(), i = 0;
    while (i < pool.length - 1 && (t -= pool[i].w) > 0) i++;
    const p = pool.splice(i, 1)[0];
    if (taken.has(p.n) || clubs.has(p.club)) continue;
    taken.add(p.n); clubs.add(p.club); others.push({ n: p.n, club: p.club });
  }
  const stars = ((L.league && L.league.figs) || []).filter((f) => !f.gone && f.club !== L.team);
  for (let k = 0; k < C.stars && others.length < C.n - 1 && stars.length && rng() < 0.6; k++) {
    const f = stars.splice(Math.floor(rng() * stars.length), 1)[0];
    if (taken.has(f.n) || clubs.has(f.club)) continue;
    taken.add(f.n); clubs.add(f.club); others.push({ n: f.n, club: f.club });
  }
  while (others.length < C.n - 1) {
    const n = figName(L, rng);
    if (taken.has(n) || others.some((o) => lastOf(o.n) === lastOf(n))) continue;
    taken.add(n); others.push({ n, club: club() });
  }
  // where you finish round one: in the final if you won it, and for a dunk loss
  // sometimes in the final and beaten there; a three-point loss is round one
  const final = won || (kind === 'dunk' && rng() < 0.45);
  const rank = final ? Math.floor(rng() * C.fin) : C.fin + Math.floor(rng() * (C.n - C.fin));
  const r1 = distinct(C.n, C.r1);
  const order = others.slice();
  for (let k = order.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); const t = order[k]; order[k] = order[j]; order[j] = t; }
  const rows = [];
  for (let k = 0, o = 0; k < C.n; k++) {
    const p = k === rank ? { n: L.name, club: L.team, you: true } : order[o++];
    rows.push({ n: p.n, club: nick(p.club), you: !!p.you, r1: r1[k], f: null });
  }
  const fin = rows.slice(0, C.fin);
  const fs = distinct(C.fin, C.f);
  const me = fin.find((r) => r.you);
  const rest = fin.filter((r) => !r.you);
  for (let k = rest.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); const t = rest[k]; rest[k] = rest[j]; rest[j] = t; }
  const byF = me ? (won ? [me].concat(rest) : rest.concat([me])) : rest;
  byF.forEach((r, k) => { r.f = fs[k]; });
  // the headline for a dunk you lost in the final is two misses, so it scores like one
  if (me && !won && kind === 'dunk') me.f = Math.min(me.f, 64 + Math.floor(rng() * 19));
  const placed = byF.concat(rows.slice(C.fin));
  placed.forEach((r, k) => { r.place = k + 1; });
  return { kind, name: C.name, rows: placed, champ: placed[0].n, you: placed.findIndex((r) => r.you) + 1, final };
}
/* One short line for the log, after the headline. */
function contestLine(c) {
  const w = c.rows[0], mine = c.rows.find((r) => r.you), two = c.rows[1];
  if (mine.place === 1) return c.name + ': beat ' + two.n + ' in the final, ' + w.f + ' to ' + two.f + '.';
  if (mine.f != null) return c.name + ': ' + w.n + ' beat you in the final, ' + w.f + ' to ' + mine.f + '.';
  return c.name + ': out in round one with ' + mine.r1 + '. ' + w.n + ' won it.';
}

// ─── the playoffs ───────────────────────────────────────────────────────────

/* The bracket around you. The other series are simulated off club nets and
   exist so the round you are in is against the club that really came through. */
function startPlayoffs(L, st) {
  const s = L.season;
  const cf = confOf(L.team);
  const seed = st.table[cf].indexOf(L.team) + 1;
  s.seed = seed;
  s.recs = st.recs;
  s.table = st.table;
  if (seed > 10) { s.po = { out: true, path: 'Missed', results: [] }; return; }
  s.po = { cf, seed, round: seed > 6 ? -1 : 0, results: [], field: {}, out: false, champ: false };
}
function seriesP(L, mine, theirs, home) {
  const mn = clubNet(L, mine) + (mine === L.team ? playoffImpact(L) - BAL.poTax : 0);
  const tn = clubNet(L, theirs) + (theirs === L.team ? playoffImpact(L) - BAL.poTax : 0);
  return gameP(mn - tn, home);
}
function playoffImpact(L) {
  const s = L.season;
  const role = s.role || roleOf(L);
  const playMin = Math.min(40, role.min + (role.starter ? 3 : 1));
  if (s.injury && s.injury.until > GAMES + 4) return 0;
  return impact(L, playMin) + s.mods.win + (trait(L, 'bigStage') ? 0.8 : 0);
}
/* A series that does not involve you, in one go. The score comes back too,
   for the bracket; the draws are the same either way. */
function simSeriesScore(L, a, b, rng, aHome) {
  let wa = 0, wb = 0, g = 0;
  const homes = [1, 1, 0, 0, 1, 0, 1];
  while (wa < 4 && wb < 4) {
    const h = aHome ? homes[g] : 1 - homes[g];
    if (rng() < seriesP(L, a, b, !!h)) wa++; else wb++;
    g++;
  }
  return { w: wa === 4 ? a : b, wa, wb };
}
function simSeries(L, a, b, rng, aHome) { return simSeriesScore(L, a, b, rng, aHome).w; }
/* One conference's bracket, given its eight seeds, with the player's own
   series left out (`skip` is the club whose series is played elsewhere). */
const PAIRS = [[0, 7], [3, 4], [2, 5], [1, 6]];

/* One conference's play-in: 7 v 8, 9 v 10, then the loser of the first
   against the winner of the second. Three draws, always in that order. */
function playInGames(L, cf, rng) {
  const tab = L.season.table[cf];
  const seven = tab[6], eight = tab[7], nine = tab[8], ten = tab[9];
  const game = (a, b) => rng() < seriesP(L, a, b, true) ? a : b;
  const w78 = game(seven, eight), l78 = w78 === seven ? eight : seven;
  const w910 = game(nine, ten);
  const last = game(l78, w910);
  return { w78, l78, w910, last, field: tab.slice(0, 6).concat([w78, last]),
    games: [{ a: seven, b: eight, w: w78, k: '7v8' }, { a: nine, b: ten, w: w910, k: '9v10' }, { a: l78, b: w910, w: last, k: 'last' }] };
}
function playPlayIn(L, beats) {
  const s = L.season, po = s.po;
  const tab = s.table[po.cf];
  const seven = tab[6], eight = tab[7], nine = tab[8], ten = tab[9];
  const P = playInGames(L, po.cf, rngAt(L, 'playin'));
  const { w78, l78, w910, last } = P;
  /* A story career keeps what happened, so the bracket can show it later
     against the same clubs, whatever has changed since. */
  po.pi = P.games; po.field[po.cf] = P.field;
  const into = L.team === w78 ? 7 : L.team === last ? 8 : 0;
  const lines = [];
  if (L.team === seven || L.team === eight) lines.push(L.team === w78 ? 'Won the 7 v 8 game.' : 'Lost the 7 v 8 game.');
  if (L.team === nine || L.team === ten) lines.push(L.team === w910 ? 'Survived the 9 v 10 game.' : 'Out in the 9 v 10 game.');
  if (L.team === l78 || L.team === w910) lines.push(L.team === last ? 'Won the last game in.' : 'Lost the last game in.');
  for (const t of lines) beats.push({ kind: 'po', text: t, tone: into ? 'good' : 'bad' });
  if (!into) {
    po.out = true; po.path = 'Play-in';
    logIt(L, 'Out in the play-in.', 'bad');
    return;
  }
  po.seed = into;
  /* The bracket's seeds 7 and 8 are whoever came through. */
  po.field[po.cf] = P.field;
  po.round = 0;
  logIt(L, 'Through the play-in as the ' + into + ' seed.', 'good');
}
function seedField(L, cf, rng) { return playInGames(L, cf, rng).field; }
/* Walk the bracket to the round you are in and return your opponent. */
function opponentFor(L) {
  const s = L.season, po = s.po;
  const rng = rngAt(L, 'bracket');
  for (const cf of ['East', 'West']) if (!po.field[cf]) po.field[cf] = seedField(L, cf, rng);
  /* Advance both conferences to the round being played, taking the player's
     real results wherever their club is. */
  const alive = {};
  for (const cf of ['East', 'West']) {
    let seats = PAIRS.map(([a, b]) => [po.field[cf][a], po.field[cf][b]]);
    for (let r = 0; r < Math.min(po.round, 2); r++) {
      const win = seats.map(([a, b]) => {
        if (a === L.team || b === L.team) return L.team;
        return simSeries(L, a, b, rngAt(L, 'srs:' + cf + ':' + r + ':' + a + b), true);
      });
      seats = [];
      for (let i = 0; i < win.length; i += 2) seats.push([win[i], win[i + 1]]);
    }
    alive[cf] = seats;
  }
  if (po.round < 3) {
    const mine = alive[po.cf].find(([a, b]) => a === L.team || b === L.team);
    return mine[0] === L.team ? mine[1] : mine[0];
  }
  const other = po.cf === 'East' ? 'West' : 'East';
  const [a, b] = alive[other][0];
  return simSeries(L, a, b, rngAt(L, 'srs:' + other + ':cf'), true);
}

/* The whole bracket, both conferences and the Finals, for the screen and for
   the champion. It decides nothing about your run: your series come off
   po.results and po.cur, and every other series is the one opponentFor
   already played (same seeded key, same order) or the one it would have
   played. Rounds after you go out are played with keys of their own.
   Draws nothing from any stream the career keeps. */
function bracketOf(L) {
  const s = L.season, po = s && s.po;
  if (!po || !s.table || !L.team) return null;
  /* Kept once the season is filed, because the summer moves club strength
     and a bracket worked out again in July would crown somebody else. */
  if (po.bk) return po.bk;
  /* The club you played the season for, which the summer can have changed. */
  const me = s.team || L.team, own = po.cf || confOf(me);
  const mine = (po.results || []).slice();
  if (po.cur) mine.push({ round: po.cur.round, opp: po.cur.opp, w: po.cur.w, l: po.cur.l, won: null, games: po.cur.games.slice(), live: true });
  const myAt = (r) => mine.find((x) => x.round === r);
  const pi = {}, field = {}, pf = po.field || {};
  const piWent = s.seed >= 7 && s.seed <= 10;
  const brng = rngAt(L, 'bracket');
  for (const cf of ['East', 'West']) {
    if (cf === own && piWent) {
      const P = po.pi ? { games: po.pi, field: pf[cf] } : playInGames(L, cf, rngAt(L, 'playin'));
      pi[cf] = P.games;
      field[cf] = pf[cf] || P.field;
    } else {
      const P = playInGames(L, cf, brng);
      pi[cf] = P.games;
      field[cf] = pf[cf] || P.field;
    }
  }
  const seedOf = {};
  for (const cf of ['East', 'West']) {
    const tab = s.table[cf];
    tab.forEach((c, i) => { seedOf[c] = i + 1; });
    field[cf].forEach((c, i) => { if (i >= 6) seedOf[c] = i + 1; });
  }
  const recs = s.recs || {};
  const conf = {}, champs = {};
  for (const cf of ['East', 'West']) {
    let seats = PAIRS.map(([a, b]) => [field[cf][a], field[cf][b]]);
    const rounds = [];
    for (let r = 0; r < 3; r++) {
      const row = seats.map(([a, b]) => {
        if (a == null || b == null) return { a, b, sa: 0, sb: 0, w: null };
        if (a === me || b === me) {
          const m = myAt(r);
          if (!m) return { a, b, sa: 0, sb: 0, w: null, you: true };
          const ma = a === me ? m.w : m.l, mb = a === me ? m.l : m.w;
          const w = m.live ? null : (m.won ? me : m.opp);
          return { a, b, sa: ma, sb: mb, w, you: true, live: !!m.live };
        }
        const key = r < 2 ? 'srs:' + cf + ':' + r + ':' + a + b : 'srs:' + cf + ':cf';
        const x = simSeriesScore(L, a, b, rngAt(L, key), true);
        return { a, b, sa: x.wa, sb: x.wb, w: x.w };
      });
      rounds.push(row);
      seats = [];
      for (let i = 0; i < row.length; i += 2) seats.push([row[i].w, row[i + 1] ? row[i + 1].w : null]);
      if (r === 2) champs[cf] = row[0].w;
    }
    conf[cf] = rounds;
  }
  const fa = champs.West, fb = champs.East;
  let finals = { a: fa, b: fb, sa: 0, sb: 0, w: null };
  if (fa != null && fb != null) {
    if (fa === me || fb === me) {
      const m = myAt(3);
      if (m) {
        const ma = fa === me ? m.w : m.l, mb = fa === me ? m.l : m.w;
        finals = { a: fa, b: fb, sa: ma, sb: mb, w: m.live ? null : (m.won ? me : m.opp), you: true, live: !!m.live };
      } else finals.you = true;
    } else {
      const aHome = ((recs[fa] || {}).w || 0) >= ((recs[fb] || {}).w || 0);
      const x = simSeriesScore(L, fa, fb, rngAt(L, 'srs:finals'), aHome);
      finals = { a: fa, b: fb, sa: x.wa, sb: x.wb, w: x.w };
    }
  }
  /* How far your run went: the last round you played, or -1 for none. */
  const last = mine.length ? mine[mine.length - 1].round : -1;
  return { year: s.year, team: me, cf: own, seed: s.seed, pi, piWent, field, seedOf, conf, finals, champ: finals.w, mine: last, out: !!po.out, missed: s.seed > 10 };
}

function playRound(L, beats) {
  const s = L.season, po = s.po;
  if (po.round === -1) { playPlayIn(L, beats); return; }
  if (po.cur && po.cur.waiting) return;
  const opp = opponentFor(L);
  const recs = s.recs;
  const myHome = po.round < 3
    ? (po.field[po.cf].indexOf(L.team) < po.field[po.cf].indexOf(opp))
    : (recs[L.team].w >= recs[opp].w);
  po.cur = { round: po.round, opp, w: 0, l: 0, home: myHome, games: [] };
  continueSeries(L, beats);
}
function continueSeries(L, beats) {
  const s = L.season, po = s.po, cur = po.cur;
  const rng = rngAt(L, 'series:' + cur.round + ':' + cur.games.length);
  const homes = [1, 1, 0, 0, 1, 0, 1];
  while (cur.w < 4 && cur.l < 4) {
    const gi = cur.w + cur.l;
    const h = cur.home ? homes[gi] : 1 - homes[gi];
    if (cur.w === 3 && cur.l === 3) {
      cur.waiting = true;
      L.pending.push(clutchCard(L, cur, !!h));
      return;
    }
    const won = rng() < seriesP(L, L.team, cur.opp, !!h);
    if (won) cur.w++; else cur.l++;
    cur.games.push(won ? 1 : 0);
  }
  endSeries(L, beats);
}
function endSeries(L, beats) {
  const s = L.season, po = s.po, cur = po.cur;
  const won = cur.w === 4;
  const name = ROUNDS[cur.round];
  po.results.push({ round: cur.round, opp: cur.opp, w: cur.w, l: cur.l, won, games: cur.games.slice() });
  const line = (won ? 'Beat the ' : 'Lost to the ') + nick(cur.opp) + ' ' + cur.w + '-' + cur.l + ' in the ' + name + '.';
  beats.push({ kind: 'po', text: line, tone: won ? 'good' : 'bad' });
  logIt(L, line, won ? 'good' : 'bad');
  po.cur = null;
  if (!won) {
    po.out = true; po.path = ROUND_SHORT[cur.round];
    if (cur.round === 3) { beats.push({ kind: 'finals_loss', text: 'The season ends in the Finals.', tone: 'bad', opp: cur.opp }); L.pending.push(presserCard(L, 'finals_loss')); }
    return;
  }
  if (cur.round === 3) {
    po.out = true; po.champ = true; po.path = 'Champion';
    L.flags.rings = (L.flags.rings || 0) + 1;
    s.awards.push('champ');
    bump(L, { fame: 14, morale: 20 });
    const role = s.role || roleOf(L);
    if (role.diff >= 6 || (role.starter && rngAt(L, 'fmvp')() < 0.25)) {
      s.awards.push('fmvp');
      beats.push({ kind: 'award', text: 'Finals MVP.', tone: 'gold' });
      logIt(L, 'Finals MVP.', 'gold');
      bump(L, { fame: 8 });
    }
    const n = L.flags.rings;
    const ring = n === 1 ? 'NBA champion.' : 'Ring number ' + n + '.';
    beats.push({ kind: 'champ', text: ring, tone: 'gold', ring: n, fmvp: s.awards.indexOf('fmvp') >= 0, opp: cur.opp });
    logIt(L, ring, 'gold');
    L.pending.push(presserCard(L, 'title'));
    return;
  }
  po.round++;
}

/* ─── playable moments ──────────────────────────────────────────────────
   A night inside a stretch that comes down to you: a shot at the horn, two
   free throws with the game on them, the last stop, a poster, a chase-down.
   Each is a card with the playable choice first (court.js plays it, and its
   release is the touch) and a safe one second. Nothing here moves the
   record: the stretch is already played, so a moment is how one night of it
   ended, and what it moves is fame, morale and the memory of it.

   Every career has them: newLife sets L.opt.moments, and migrate sets it on a
   save from before. How often: MOMENT_P (tuning). */
/* A rating read as a feeling, for a hint: the card tells you whether this is
   your shot without printing a number. */
const feel = (v, hi, mid, lo) => v >= 70 ? hi : v >= 55 ? mid : lo;
const MOMENTS = {
  buzzer: { w: () => 2, scene: 'Crunch time', title: 'Tied, four seconds left. Who takes it?',
    text: (L, o) => 'Tied with the ' + o + '. The play breaks down and the ball finds you.',
    opts: (L) => [
      { label: 'Take the shot yourself', hint: feel(L.rt.sho, 'Your stroke, your moment', 'Could go either way', 'Not really your shot'), p: clamp(0.3 + (L.rt.sho - 50) * 0.006, 0.15, 0.62), play: 'buzzer' },
      { label: 'Drive and kick it out', hint: 'Find the open man', p: 0.38 },
    ] },
  ft: { w: () => 2, scene: 'Free throw line', title: 'Down one, two free throws',
    text: (L, o) => 'Fouled with two seconds left against the ' + o + ". The whole building's trying to get in your head.",
    opts: (L) => [
      { label: 'Step right to the line', hint: feel(L.rt.sho, 'Your stroke is automatic', 'Breathe and shoot', 'Hope your form holds'), p: clamp(0.6 + (L.rt.sho - 50) * 0.006 + (L.rt.iq - 50) * 0.002, 0.42, 0.95), play: 'ft' },
      { label: 'Let them ice you', hint: 'Two timeouts, a long wait', p: clamp(0.56 + (L.rt.sho - 50) * 0.006 + (L.rt.iq - 50) * 0.004, 0.4, 0.93) },
    ] },
  poster: { w: (L) => L.rt.ath >= 68 ? 1.5 : 0, scene: 'Fast break', title: 'One man between you and the rim',
    text: (L, o) => 'A runout against the ' + o + ". Their big's planted in the lane, daring you.",
    opts: (L) => [
      { label: 'Rise up and dunk on him', hint: feel((L.rt.ath + L.rt.fin) / 2, "You've got the bounce", "It's a coin flip", 'Big ask for your legs'), p: clamp(0.34 + ((L.rt.ath + L.rt.fin) / 2 - 60) * 0.008, 0.2, 0.75), play: 'poster' },
      { label: 'Lay it in', hint: 'Two points is two points', p: 0.8 },
    ] },
  block: { w: (L) => L.rt.def >= 64 && L.rt.ath >= 60 ? 1.5 : 0, scene: 'Fast break', title: "He thinks he's gone. Chase him?",
    text: (L, o) => 'A steal at the other end and a ' + o + " guard's all alone. You're four steps behind.",
    opts: (L) => [
      { label: 'Chase him down', hint: feel((L.rt.def + L.rt.ath) / 2, 'Your legs say go', 'Worth a shot', "You probably won't catch him"), p: clamp(0.3 + ((L.rt.def + L.rt.ath) / 2 - 60) * 0.009, 0.15, 0.7), play: 'block' },
      { label: 'Let it go', hint: 'Save your legs', p: 0 },
    ] },
  stop: { w: (L) => L.rt.def >= 58 ? 1.5 : 0, scene: 'Crunch time', title: 'Up one, last possession. Who guards him?',
    text: (L, o) => 'The ' + o + ' clear out a side for their best scorer. You want the assignment.',
    opts: (L) => [
      { label: 'Guard him yourself', hint: feel(L.rt.def, 'Lock him up', 'Battle and pray', "It's a tough matchup"), p: clamp(0.36 + (L.rt.def - 55) * 0.008, 0.2, 0.75), play: 'stop' },
      { label: 'Send the double team', hint: 'Make someone else beat you', p: 0.5 },
    ] },
  /* Three more, for story careers only (see MOMENT_OLD below): the block, the
     lob and the passing lane, so a big man, a leaper and a defender each have
     nights that are theirs. */
  post: { w: (L) => L.pos === 'C' || L.pos === 'PF' ? 1.6 : L.pos === 'SF' ? 0.4 : 0, scene: 'The low block', title: 'Down one. You have him on the block.',
    text: (L, o) => 'They feed you on the left block against the ' + o + '. His back is to the rim and so is yours.',
    opts: (L) => [
      { label: 'Back him down and score', hint: feel((L.rt.fin + L.rt.iq) / 2, 'Your spot on the floor', 'Worth a try', 'Not your game'), p: clamp(0.34 + ((L.rt.fin + L.rt.iq) / 2 - 60) * 0.008, 0.18, 0.72), play: 'post' },
      { label: 'Kick it out to a shooter', hint: 'Make them pick', p: 0.4 },
    ] },
  lob: { w: (L) => L.rt.ath >= 66 ? 1.4 : 0, scene: 'Fast break', title: 'Two on one. He is looking up for you.',
    text: (L, o) => 'A runout against the ' + o + '. One defender back, and the rim is wide open above him.',
    opts: (L) => [
      { label: 'Call for the lob', hint: feel(L.rt.ath, 'You live up there', 'Time it right', 'Long way up'), p: clamp(0.36 + (L.rt.ath - 62) * 0.009, 0.2, 0.78), play: 'lob' },
      { label: 'Let him lay it in', hint: 'Two easy points', p: 0.82 },
    ] },
  steal: { w: (L) => L.rt.def >= 60 ? 1.2 : 0, scene: 'Defense', title: 'You know this play. Jump it?',
    text: (L, o) => 'The ' + o + ' run the same swing pass you watched on film all week.',
    opts: (L) => [
      { label: 'Jump the passing lane', hint: feel((L.rt.def + L.rt.iq) / 2, 'You have seen it coming', 'A gamble', 'Risky for you'), p: clamp(0.3 + ((L.rt.def + L.rt.iq) / 2 - 58) * 0.009, 0.15, 0.7), play: 'steal' },
      { label: 'Stay in your stance', hint: 'Play it straight', p: 0.5 },
    ] },
};
/* A DUEL CAREER separates the two things a moment used to fuse. THE GAME IS
   THE TEAM'S: a regular season night is a real game out of the stretch the
   engine already played, so its result is the box score's, and a Game 7 is
   decided by the two clubs' odds, moved by what you did with the last
   possession rather than settled by it. THE MOMENT IS YOURS: whether the shot
   went down, whether you read the defense, who you trusted with the ball, and
   that is what moves fame, morale, your coach and your teammates. So a made
   shot can still lose, a miss can still win, and the screen says both.

   Every career is a duel career: newLife sets L.opt.duel, and migrate sets
   it on a save from before. */
const duelOn = (L) => !!(L.opt && L.opt.duel);
/* The night's teammate: invented, named when the card is dealt, so the man
   who saves you is the man the card promised. */
function duelMate(L, tag) { const m = lockerOf(L); return m[Math.floor(rngAt(L, 'mate:' + tag)() * m.length)].n; }
/* A real teammate is drawn faceless on the court, like every real man there. */
function mateIsReal(L) { return lockerOf(L)[0].real != null; }
function queueMoment(L, chunk) {
  if (!L.opt || !L.opt.moments || !L.season || !L.team) return;
  const s = L.season, role = s.role || roleOf(L);
  if (role.min < 18) return;
  if (s.injury && s.g >= s.injury.from && s.g < s.injury.until) return;
  const rng = rngAt(L, 'moment:' + chunk);
  if (rng() >= MOMENT_P) return;
  const id = weighted(rng, (Object.keys(MOMENTS)), (k) => MOMENTS[k].w(L));
  if (!id) return;
  const m = MOMENTS[id];
  let opp = CLUBS.filter((c) => c !== L.team)[Math.floor(rng() * (CLUBS.length - 1))];
  const opts = m.opts(L);
  const ctx = { m: id, opp, plays: opts.map((o) => o.play || null) };
  /* A duel night is one of the games you played in this stretch, so the
     opponent and the result are that game's. Drawn on its own stream: the
     card's own draws are untouched. */
  if (duelOn(L) && s.box && s.box.length) {
    const mine = s.box.filter((r) => r[4] >= 0);
    if (mine.length) {
      const row = mine[Math.floor(rngAt(L, 'momgame:' + chunk)() * mine.length)];
      opp = ctx.opp = row[1]; ctx.won = row[3] ? 1 : 0; ctx.g = row[0]; ctx.home = row[2];
      ctx.mate = duelMate(L, 'mom:' + chunk); if (mateIsReal(L)) ctx.mateReal = 1;
    }
  }
  L.pending.push({
    id: 'moment', kind: 'moment', key: 'moment:' + L.year + ':' + chunk,
    eyebrow: (ctx.g ? 'Game ' + ctx.g + ' · ' : 'A night against the ') + (ctx.g ? (ctx.home ? 'vs ' : 'at ') : '') + nick(opp), scene: m.scene, title: m.title, text: m.text(L, nick(opp)),
    ctx,
    options: opts.map((o) => ({ label: o.label, hint: o.hint })),
  });
}
/* The answers to a playable moment (choose() runs them). */
ANSWER.moment = function(L, card, i, opt, rng, beats, touch, touches) {
  let text = '', tone = '', made = null, won = null, shots = null, contest = null;
  const r = momentResolve(L, card, i, rng, touch, touches);
  text = r.text; tone = r.tone; made = r.made;
  if (r.won != null) won = r.won;
  if (r.shots) shots = r.shots;
  return { text, tone, made, won, shots, contest };
};
/* What a duel night says, by what you did and how the game went. The made
   key is the shot (or the stop) and W or L is the box score. */
const DUEL_TEXT = {
  buzzer: { MW: 'At the horn! The bench empties onto the floor.', ML: 'You hit it to force overtime. They pull away in the extra five.',
    mW: 'Off the back iron. {dmate} carries you in overtime.', mL: 'Off the back iron. That\'s the ballgame.' },
  kick: { MW: 'You draw two and find {dmate}. Splash. Ballgame.', ML: 'You find {dmate}. He buries it. They still win in overtime.',
    mW: 'The kick-out sails. You win it in overtime anyway.', mL: 'The kick-out sails. Ballgame for them.' },
  ft: { 2: { W: 'Two for two. Ice.', L: 'Two for two. Then they score at the horn.' },
    1: { W: 'One of two. You win it in overtime. The miss nags all night.', L: 'One of two. They win it in overtime.' },
    0: { W: 'Both off the rim. {dmate} tips the second one in at the horn.', L: 'Both clank off the rim. The other bench loves it.' } },
  poster: { MW: 'Right on top of him. That one goes on a wall. A win.', ML: 'Right on top of him. Best moment of a bad night.',
    mW: 'He holds his ground. Offensive foul. You win anyway.', mL: 'He holds his ground. Offensive foul. A long night.' },
  layup: { MW: 'Two points. Nobody posts it. A win.', ML: 'Two points. Nobody posts it. A loss.', mW: 'It rolls off. You win anyway.', mL: 'It rolls off. A loss.' },
  block: { MW: 'Pinned to the glass. He never saw you. A win.', ML: 'Pinned to the glass. It\'s the clip of a loss.',
    mW: 'A step late. And one. You win anyway.', mL: 'A step late. And one. A loss.' },
  letgo: { W: 'Two points for them. Nobody notices. A win.', L: 'Two points for them. Nobody notices. A loss.' },
  post: { MW: 'Drop step, two hands, and one. A win.', ML: 'You bully him for two. They answer at the horn.',
    mW: 'He holds his ground and it rolls off. {dmate} cleans it up. A win.', mL: 'He holds his ground and it rolls off. A loss.' },
  kickout: { MW: 'Kick out to {dmate}. Splash. A win.', ML: 'Kick out to {dmate}. He hits. A loss anyway.',
    mW: 'The kick-out clanks. You win it later.', mL: 'The kick-out clanks. A loss.' },
  lob: { MW: 'Caught it at the top of the square. A win.', ML: 'Caught it at the top of the square. Best play of a loss.',
    mW: 'Mistimed. It sails out of bounds. A win anyway.', mL: 'Mistimed. It sails out of bounds. A loss.' },
  layin: { MW: '{dmate} lays it in. Easy two. A win.', ML: '{dmate} lays it in. Easy two. A loss.', mW: 'He misses the layup. You win anyway.', mL: 'He misses the layup. A loss.' },
  steal: { MW: 'Picked off. Coast to coast. A win.', ML: 'Picked off and slammed home. They still win it.',
    mW: 'You bite. Backdoor layup for them. You win anyway.', mL: 'You bite. Backdoor layup for them. A loss.' },
  stance: { MW: 'You stay home. They miss. A win.', ML: 'You stay home. They score anyway. A loss.', mW: 'They score over you. You win anyway.', mL: 'They score over you. A loss.' },
  stop: { MW: 'You stay in front. He misses at the horn. Ballgame.', ML: 'You force the miss. They tip it in at the horn.',
    mW: 'He gets to his spot and scores. {dmate} answers at the other end. A win.', mL: 'He gets to his spot and buries it.' },
  double: { MW: 'The double forces it out. They miss. Ballgame.', ML: 'The double forces it out. The open man hits.',
    mW: 'They find the open man. {dmate} answers at the other end.', mL: 'They find the open man. He hits.' },
};
function duelLine(L, card, key, made, won) {
  const t = DUEL_TEXT[key];
  const raw = typeof made === 'number' ? t[made][won ? 'W' : 'L'] : made == null ? t[won ? 'W' : 'L'] : t[(made ? 'M' : 'm') + (won ? 'W' : 'L')];
  return raw.replace(/\{dmate\}/g, (card.ctx && card.ctx.mate) || 'A teammate');
}
function momentResolve(L, card, i, rng, touch, touches) {
  const m = MOMENTS[card.ctx.m], o = m.opts(L)[i], opp = nick(card.ctx.opp);
  const f = L.flags, duel = duelOn(L) && card.ctx.won != null, won = !!card.ctx.won;
  const mate = card.ctx.mate;
  if (card.ctx.m === 'ft') {
    const p1 = touched(o.p, touches ? touches[0] : touch, L, touches ? 0 : null), p2 = touched(o.p, touches ? touches[1] : touch, L, touches ? 1 : null);
    const s1 = rng() < p1, s2 = rng() < p2, n = (s1 ? 1 : 0) + (s2 ? 1 : 0);
    if (duel) {
      if (n === 2) { f.ftIce = (f.ftIce || 0) + 1; bump(L, { fame: 3, morale: 6 }); logIt(L, 'Two free throws with the game on them against the ' + opp + '.', 'gold'); }
      else if (n === 1) bump(L, { morale: -2 });
      else { bump(L, { morale: -6 }); logIt(L, 'Missed two at the line against the ' + opp + '.', 'bad'); if (won && mate) relate(L, 'tm', 10, 'He bailed you out at the line.', mate); }
      return { text: duelLine(L, card, 'ft', n, won), tone: n === 2 ? 'gold' : n === 0 ? 'bad' : '', made: n, won, shots: [s1, s2] };
    }
    if (n === 2) { f.ftIce = (f.ftIce || 0) + 1; bump(L, { fame: 3, morale: 6 }); logIt(L, 'Two free throws to beat the ' + opp + '.', 'gold'); return { text: 'Two for two. Ice.', tone: 'gold', made: 2 }; }
    if (n === 1) { bump(L, { morale: -2 }); return { text: 'One of two. You win it in overtime, but the miss nags all night.', tone: '', made: 1 }; }
    bump(L, { morale: -6 }); logIt(L, 'Missed two at the line against the ' + opp + '.', 'bad');
    return { text: 'Both clank off the rim. The other bench is loving it.', tone: 'bad', made: 0 };
  }
  if (!o.play) {
    if (card.ctx.m === 'block') return duel ? { text: duelLine(L, card, 'letgo', null, won), tone: '', made: false, won } : { text: 'Two points for them. Nobody notices.', tone: '', made: false };
    const ok = rng() < o.p;
    if (duel) {
      const key = { buzzer: 'kick', poster: 'layup', stop: 'double', post: 'kickout', lob: 'layin', steal: 'stance' }[card.ctx.m];
      bump(L, ok ? { trust: 2 } : { morale: -1 });
      if (card.ctx.m === 'buzzer' && mate) relate(L, 'tm', ok ? 10 : 4, ok ? 'You gave him the last shot and he hit it.' : 'You gave him the last shot.', mate);
      return { text: duelLine(L, card, key, ok, won), tone: ok ? 'good' : '', made: ok, won };
    }
    bump(L, ok ? { trust: 2 } : { morale: -1 });
    return { text: ok ? 'The right play, and it works.' : "The right play. It just doesn't work.", tone: ok ? 'good' : '', made: ok };
  }
  const made = rng() < touched(o.p + (card.ctx.m === 'buzzer' ? clutchBonus(L) : 0), touch, L);
  const T = {
    buzzer: made ? ['At the horn! The bench empties onto the floor.', 'buzzer'] : ['Off the back iron. Overtime, and the night slips away.', null],
    poster: made ? ["Right on top of him. That one's going on a wall.", 'posters'] : ['He holds his ground. Offensive foul.', null],
    block: made ? ['Pinned to the glass. He never saw you coming.', 'chasedowns'] : ['A step late. And one.', null],
    stop: made ? ['You stay in front. He misses at the horn. Ballgame.', 'stops'] : ['He gets to his spot and buries it.', null],
    post: made ? ['Drop step, two hands. He never had a chance.', 'posts'] : ['He holds his ground and it rolls off.', null],
    lob: made ? ['Caught it at the top of the square. The bench loses it.', 'lobs'] : ['Mistimed. It sails out of bounds.', null],
    steal: made ? ['Picked off. Coast to coast for the slam.', 'steals'] : ['You bite. Backdoor layup for them.', null],
  }[card.ctx.m];
  if (made) {
    /* A shot at the horn only counts as a winner when the game was won. */
    if (!duel || won || card.ctx.m !== 'buzzer') f[T[1]] = (f[T[1]] || 0) + 1;
    if (card.ctx.m === 'buzzer' && (!duel || won)) clutchHit(L);
    if (card.ctx.m === 'lob' && mate) relate(L, 'tm', 6, 'He threw you the lob.', mate);
    bump(L, { fame: card.ctx.m === 'buzzer' || card.ctx.m === 'poster' || card.ctx.m === 'lob' ? 4 : 3, morale: 5 });
    logIt(L, { buzzer: duel && !won ? 'Forced overtime at the horn against the ' + opp + '.' : 'Hit a shot at the horn against the ' + opp + '.', poster: 'Dunked on a ' + opp + ' big.', block: 'A chase-down block against the ' + opp + '.', stop: 'Got the last stop against the ' + opp + '.',
      post: 'Scored on the block against the ' + opp + '.', lob: 'Threw down a lob against the ' + opp + '.', steal: 'Jumped the lane and took it the distance against the ' + opp + '.' }[card.ctx.m], 'gold');
  } else {
    bump(L, { morale: -3 });
    if (duel && won && mate && (card.ctx.m === 'buzzer' || card.ctx.m === 'stop' || card.ctx.m === 'post')) relate(L, 'tm', 8, 'He saved the night you missed.', mate);
  }
  if (duel) return { text: duelLine(L, card, card.ctx.m, made, won), tone: made ? 'gold' : 'bad', made, won };
  return { text: T[0], tone: made ? 'gold' : 'bad', made };
}

/* GAME 7 IS YOURS. Tied, the ball, the last shot. The odds of each choice come
   off the rating it asks for, so a shooter should shoot and a passer should
   find the open man, and the screen reads the rating in words (feel())
   rather than printing the odds.

   ON A DUEL CAREER THE DEFENSE SHOWS YOU SOMETHING, and reading it is the
   decision. The look is said in the card's text and drawn on the court, one
   choice beats it and one plays into it. The ratings still matter, so a
   shooter facing a double team has to decide whether he trusts his stroke
   more than the read. */
const LOOKS = {
  drop: { best: 0, worst: 1, t: 'Their big drops back into the paint and waits.' },
  switch: { best: 1, worst: 2, t: 'They switch their center onto you.' },
  chase: { best: 2, worst: 0, t: 'Their best defender is glued to you behind the arc.' },
  double: { best: 3, worst: 1, t: 'They send two at you the moment you catch it.' },
};
const LOOK_IDS = Object.keys(LOOKS);
const READ_GOOD = 0.12, READ_BAD = 0.08;
function readBonus(look, i) { const k = LOOKS[look]; return !k ? 0 : i === k.best ? READ_GOOD : i === k.worst ? -READ_BAD : 0; }
function clutchOptions(L, look) {
  const r = L.rt, net = clubNet(L, L.team), cb = clutchBonus(L);
  return [
    { label: 'Pull up for three', rate: 'sho', p: clamp(0.2 + (r.sho - 50) * 0.0065, 0.12, 0.55) + cb + sigBonus(L, 'sho') + readBonus(look, 0) },
    { label: 'Drive to the rim', rate: 'fin', p: clamp(0.26 + ((r.fin + r.ath) / 2 - 50) * 0.0058, 0.15, 0.58) + cb + sigBonus(L, 'fin') + readBonus(look, 1) },
    { label: 'Hit the mid-range fadeaway', rate: 'iq', p: clamp(0.25 + ((r.sho + r.iq) / 2 - 50) * 0.0052, 0.15, 0.55) + cb + sigBonus(L, 'iq') + readBonus(look, 2) },
    { label: 'Find the open man', rate: 'pla', p: clamp(0.27 + (r.pla - 50) * 0.0045 + net * 0.006, 0.15, 0.55) + cb + sigBonus(L, 'pla') + readBonus(look, 3) },
  ];
}
function defenseLook(L, key) { return duelOn(L) ? LOOK_IDS[Math.floor(rngAt(L, 'look:' + key)() * LOOK_IDS.length)] : null; }
function clutchCard(L, cur, home) {
  const key = 'clutch:' + cur.round;
  const look = defenseLook(L, key + ':' + L.year);
  const opts = clutchOptions(L, look);
  const ctx = { round: cur.round, opp: cur.opp, home };
  if (look) { ctx.look = look; ctx.mate = duelMate(L, key); if (mateIsReal(L)) ctx.mateReal = 1; }
  return {
    id: 'clutch', kind: 'clutch', key,
    eyebrow: 'Game 7 · ' + ROUNDS[cur.round], scene: 'Game 7', title: "Tied, nine seconds, your ball. What's the play?",
    text: (home ? "The home crowd's on its feet" : "A road crowd's trying to rattle you") + ' against the ' + nick(cur.opp) + '. ' + (look ? LOOKS[look].t : 'Everybody knows who gets it.'),
    ctx,
    options: opts.map((o) => ({ label: o.label, hint: feel(L.rt[o.rate], "That's your shot", 'A fair look', 'Not your strength') })),
  };
}
/* The answers to Game 7's last shot (choose() runs them). */
ANSWER.clutch = function(L, card, i, opt, rng, beats, touch, touches) {
  let text = '', tone = '', made = null, won = null, shots = null, contest = null;
  const o = clutchOptions(L, card.ctx && card.ctx.look)[i];
  const cur = L.season.po.cur;
  made = rng() < touched(o.p, touch, L);
  cur.waiting = false;
  if (duelOn(L) && card.ctx && card.ctx.look) {
    const d = duelGame(L, seriesP(L, L.team, cur.opp, !!card.ctx.home), made, rng, card, i, beats, 'Game 7');
    won = d.won;
    cur.games.push(won ? 1 : 0);
    if (won) cur.w = 4; else cur.l = 4;
    if (made) { bump(L, { fame: 6 }); remember(L, 'g7.made', true); if (won) { L.flags.g7 = (L.flags.g7 || 0) + 1; clutchHit(L, beats); } }
    bump(L, { fame: won ? 4 : 0, morale: (won ? 8 : -8) + (made ? 3 : -3) });
    text = d.text; tone = made ? 'gold' : 'bad';
    logIt(L, 'Game 7 against the ' + nick(cur.opp) + ': ' + (made ? (won ? 'hit the winner.' : 'hit the shot. They answered.') : won ? 'missed it. ' + ((card.ctx && card.ctx.mate) || 'The bench') + ' saved it.' : 'missed the last shot.'), won ? 'gold' : 'bad');
    endSeries(L, beats);
    return { text, tone, made, won, shots, contest };
  }
  cur.games.push(made ? 1 : 0);
  if (made) { cur.w = 4; L.flags.g7 = (L.flags.g7 || 0) + 1; clutchHit(L, beats); remember(L, 'g7.made', true); bump(L, { fame: 10, morale: 10 }); text = 'Good! Series over. You\'ll be watching that one for the rest of your life.'; tone = 'gold'; }
  else { cur.l = 4; bump(L, { morale: -10 }); text = 'No good. The whole building goes quiet.'; tone = 'bad'; }
  logIt(L, 'Game 7 against the ' + nick(cur.opp) + ': ' + (made ? 'hit the winner.' : 'missed the last shot.'), made ? 'gold' : 'bad');
  endSeries(L, beats);
  return { text, tone, made, won, shots, contest };
};
/* The last possession of a duel game, told by what you did and how it went. */
const G7_TEXT = {
  shot: { MW: 'Good! Series over. You\'ll watch that one for the rest of your life.', ML: 'Good! Then they go the length of the floor in 1.4 seconds. Series over the wrong way.',
    mW: 'No good. {dmate} flies in and tips it home at the horn. Series!', mL: 'No good. The whole building goes quiet.' },
  pass: { MW: 'You draw two and find {dmate}. Splash. Series!', ML: 'You find {dmate}. He buries it. They answer at the horn.',
    mW: 'The pass is late. {dmate} forces it up and it rolls in. Series!', mL: 'The pass is late. The shot clock beats him. Series over.' },
};
/* The same, for a single game: a tournament has no series to win. */
const AM_TEXT = {
  shot: { MW: 'Good! You\'ll remember that one for the rest of your life.', ML: 'Good! Then they go the length of the floor and score at the horn.',
    mW: 'No good. {dmate} flies in and tips it home at the horn.', mL: 'No good. You sit on the floor for a long time.' },
  pass: { MW: 'You draw two and find {dmate}. Splash. Ballgame.', ML: 'You find {dmate}. He buries it. They answer at the horn.',
    mW: 'The pass is late. {dmate} forces it up and it rolls in.', mL: 'The pass is late. The horn beats him.' },
};
/* Your possession moves the game's odds, it does not set them. */
function duelGame(L, base, made, rng, card, i, beats, label) {
  const won = rng() < clamp(base + (made ? DUEL_SWING : -DUEL_SWING), 0.06, 0.94);
  const look = card.ctx.look, mate = card.ctx.mate;
  if (look) {
    if (i === LOOKS[look].best) { bump(L, { trust: 3 }); remember(L, 'read.' + look, true); }
    else if (i === LOOKS[look].worst) bump(L, { trust: -2 });
  }
  if (i === 3 && mate) relate(L, 'tm', made ? 16 : 8, 'You trusted him with the last possession of ' + label + '.', mate);
  else if (!made && won && mate) relate(L, 'tm', 10, 'He saved you in ' + label + '.', mate);
  const text = (label === 'Game 7' ? G7_TEXT : AM_TEXT)[i === 3 ? 'pass' : 'shot'][(made ? 'M' : 'm') + (won ? 'W' : 'L')].replace(/\{dmate\}/g, mate || 'A teammate');
  return { won, text };
}
// ─── the offseason ──────────────────────────────────────────────────────────

/* HOW A PLAYER CHANGES, on a story career. Every skill has its own clock:
   the bounce comes first and goes first, a jumper and a feel for the game
   keep getting better into a man's thirties, and the glass and the defense
   sit in between. Who plays grows, who sits grows slower. A summer can be a
   breakout or a stall, a coach's project gets extra work, and no summer moves
   a man more than nine points, because +12 in one offseason read as a cheat
   code rather than a kid getting better. */
const SKILL_GROW = {
  ath: [[21, 1.45], [23, 1.1], [25, 0.55], [99, 0.1]],
  fin: [[23, 1.1], [26, 0.95], [99, 0.6]],
  def: [[23, 0.95], [27, 1.05], [99, 0.7]],
  reb: [[24, 1.05], [27, 0.85], [99, 0.5]],
  sho: [[22, 0.8], [26, 1.1], [99, 1.3]],
  pla: [[22, 0.85], [27, 1.1], [99, 1.15]],
  iq: [[22, 0.75], [27, 1.15], [99, 1.3]],
};
const shapeAt = (rows, a) => { for (const [to, v] of rows) if (a <= to) return v; return rows[rows.length - 1][1]; };
/* On the way down: the legs go from 28, the touch and the brain much later. */
function skillDecline(k, a) {
  if (k === 'ath') return a >= 28 ? 1.55 : 0;
  if (k === 'fin' || k === 'def') return 1.15;
  if (k === 'reb') return 0.95;
  if (k === 'sho') return a >= 34 ? 0.7 : 0.35;
  if (k === 'pla') return a >= 34 ? 0.8 : 0.5;
  if (k === 'iq') return a >= 34 ? 0.5 : 0;
  return 0.9;
}
function developStory(L, beats) {
  const before = ovrOf(L), was = Object.assign({}, L.rt);
  const rng = rngAt(L, 'develop');
  const a = L.age;
  const gap = Math.max(0, L.pot - before);
  const eth = 0.65 + L.eth / 100 * 0.7 + (trait(L, 'gymRat') ? 0.12 : 0);
  let grow = gap * (GROW[a] || 0) * eth;
  if (trait(L, 'lateBloomer')) grow = a <= 22 ? grow * 0.8 : a <= 27 ? grow + gap * 0.05 * eth : grow;
  grow *= lvl(L).grow;
  /* Minutes are where a young man learns. */
  const h = L.history[L.history.length - 1];
  const min = h && h.y === L.year && h.min != null ? h.min : (L.season && L.season.gp ? L.season.tot.min / L.season.gp : 20);
  if (a <= 25) grow *= 0.8 + 0.3 * clamp((min - 8) / 26, 0, 1);
  grow += L.flags.devCarry || 0;
  /* A breakout or a stall, mostly for the young. */
  let jump = '';
  const roll = rng();
  if (a <= 25 && gap >= 6 && roll < 0.11) { grow *= 1.5; jump = 'up'; }
  else if (a <= 26 && gap >= 4 && roll > 0.9) { grow *= 0.45; jump = 'flat'; }
  const dec = (DECLINE[a] || (a >= 38 ? 6.5 : 0)) * (1.2 - L.dur / 250) * (L.flags.longevity ? 0.75 : 1) * BAL.dec * lvl(L).dec
    + Math.max(0, 50 - L.m.health) * 0.03;
  const early = a === 27 ? 0.5 : a === 28 ? 1 : 0;
  const focus = L.focus && L.focus.y === L.year ? L.focus.k : null;
  /* The clocks move growth and decline between skills, never in total: for
     every position and age the weighted sum is the old curve's, so a career
     is as long and as good as it was and only its shape changed. Measured
     without this, the jumper and the brain aging slower than the legs added
     two points to every man at 32 and doubled the MVPs. */
  const w = WEIGHTS[L.pos];
  let gS = 0, dS = 0, dOld = 0;
  for (const k of RATINGS) {
    gS += w[k] * shapeAt(SKILL_GROW[k], a);
    dS += w[k] * skillDecline(k, a);
    dOld += w[k] * (k === 'ath' ? 1.6 : k === 'fin' || k === 'def' ? 1.15 : k === 'sho' || k === 'iq' ? 0.45 : 0.9);
  }
  const gN = gS > 0 ? 1 / gS : 1, dN = dS > 0 ? dOld / dS : 1;
  const d = {};
  for (const k of RATINGS) {
    let x = grow * shapeAt(SKILL_GROW[k], a) * gN * (0.6 + rng() * 0.8);
    if (k === 'ath' && early) x -= early * (0.6 + rng() * 0.8);
    if (dec) x -= dec * skillDecline(k, a) * dN * (0.7 + rng() * 0.6) * (k === focus ? 0.5 : 1);
    if (k === 'iq' && a <= 33) x += 0.6;
    if (k === 'iq' && trait(L, 'filmJunkie')) x += 0.5;
    if (k === focus) x += 1.5 + Math.max(0, grow) * 0.4;
    d[k] = x;
  }
  /* The cap is on the overall, so a summer can still be all shooting. */
  let gain = 0;
  for (const k of RATINGS) gain += d[k] * w[k];
  /* What the cap holds back is not lost: it is next summer's head start, so
     a top prospect gets to the same place a year more slowly. */
  L.flags.devCarry = 0;
  if (gain > SUMMER_CAP) { L.flags.devCarry = round1(gain - SUMMER_CAP); for (const k of RATINGS) if (d[k] > 0) d[k] *= SUMMER_CAP / gain; }
  /* And no single skill jumps more than seven: a kid adds a step, not a new
     body. Measured, the bounce alone went +16 in one summer without it. */
  for (const k of RATINGS) d[k] = Math.min(d[k], 7);
  for (const k of RATINGS) L.rt[k] = clamp(Math.round(L.rt[k] + d[k]), 25, 99);
  if (jump === 'up') L.pot = clamp(L.pot + 2, 40, 99);
  if (jump === 'flat') L.pot = clamp(L.pot - 2, 40, 99);
  if (focus) L.focus = null;
  const after = ovrOf(L);
  const diff = after - before;
  const moved = RATINGS.map((k) => [k, ovT(L, L.rt[k]) - ovT(L, was[k])]).filter((x) => x[1]).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).slice(0, 2);
  const detail = moved.length ? ' ' + moved.map(([k, v]) => RATING_NAME[k] + ' ' + (v > 0 ? '+' : '') + v).join(', ') + '.' : '';
  const head = jump === 'up' && diff > 0 ? 'A breakout summer. ' : jump === 'flat' ? 'A quiet summer. The jump did not come. ' : '';
  if (diff || head) {
    const sd = ovT(L, after) - ovT(L, before), sa = ovT(L, after);
    const t = head + (sd > 0 ? 'Up ' + sd + ' overall, to ' + sa + '.' : sd < 0 ? 'Down ' + (-sd) + ' overall, to ' + sa + '.' : 'Still ' + sa + ' overall.') + detail;
    beats.push({ kind: 'dev', text: t, tone: diff > 0 ? 'good' : diff < 0 ? 'bad' : '' });
    logIt(L, t, diff > 0 ? 'good' : diff < 0 ? 'bad' : '');
  }
  if (focus && L.rt[focus] > was[focus]) beats.push({ kind: 'dev', text: 'Your summer project paid off: ' + RATING_NAME[focus].toLowerCase() + ' ' + ovT(L, was[focus]) + ' to ' + ovT(L, L.rt[focus]) + '.', tone: 'good' });
  if (a >= 29 && L.rt.ath < was.ath - 2 && !L.flags.stepGone) { L.flags.stepGone = L.year; beats.push({ kind: 'dev', text: 'The first step is going. You will have to win with your head.', tone: 'bad' }); }
  if (diff >= 1 && a >= 24) reveal(L, 'lateBloomer', 'Still getting better at ' + a + '.', beats);
  if (L.eth >= 85 && a >= 22) reveal(L, 'gymRat', 'First in the gym. Every day.', beats);
  bump(L, { health: 28 });
}

/* What the market pays a man of this overall: a share of the cap, capped by
   how long he has been in the league, the way the max is. */
function marketPct(o) {
  return Math.max(MIN_PCT, Math.pow(clamp((o - 58) / 37, 0, 1.1), 2.2) * 0.35);
}
function maxPct(L) {
  const yrs = L.seasonsDone;
  return yrs >= 10 ? 0.35 : yrs >= 7 ? 0.30 : 0.25;
}
function marketSalary(L, o) {
  const pct = Math.min(maxPct(L), marketPct(o));
  return round1(capFor(L.year) * pct * AGENTS[L.agent].sal);
}

/* What a front office sees: the overall, less what the next two years will
   take off a man past thirty. */
const marketOvr = (L) => ovrOf(L) - Math.max(0, L.age - 30) * 1.6
  + (L.age <= 24 ? Math.max(0, L.pot - ovrOf(L)) * 0.25 : 0);
function offers(L) {
  const o = marketOvr(L);
  const rng = rngAt(L, 'offers');
  /* The bottom of the league is a coin toss every summer: a minimum deal for
     a 64 is likely and for a 60 is not, and that is where careers end. */
  const n = o >= 85 ? 5 : o >= 76 ? 4 : o >= 70 ? 3 : o >= 66 ? 2 : rng() < (o - 57) / 9 ? 1 : 0;
  const a = L.age;
  const yrsFor = () => a <= 27 ? 4 + (rng() < 0.4 ? 1 : 0) : a <= 30 ? 3 + (rng() < 0.4 ? 1 : 0) : a <= 33 ? 2 + (rng() < 0.4 ? 1 : 0) : 1 + (rng() < 0.3 ? 1 : 0);
  const out = [];
  const used = {};
  const base = marketSalary(L, o + 1);
  const minSal = round1(capFor(L.year) * MIN_PCT);
  /* Your own club first, if they want you back: one more year than anybody,
     because they hold your rights. */
  if (L.team && n > 0 && o >= rotationBar(clubNet(L, L.team)) - 8) {
    out.push(offerFor(L, L.team, Math.min(5, yrsFor() + 1), Math.max(minSal, round1(base * (1.02 + rng() * 0.05))), true));
    used[L.team] = 1;
  }
  /* Chasing a ring (a move): the best contender that will have you calls
     first, at the minimum, on top of the offers a summer brings. */
  if (L.flags.ringChase && L.flags.ringChase >= L.year - 1) {
    const c = contenders(L, 3).find((x) => !used[x]);
    if (c) { out.unshift(Object.assign(offerFor(L, c, 1, minSal, false), { chase: true })); used[c] = 1; }
  }
  const pool = CLUBS.filter((c) => !used[c]);
  while (out.length < n + (out.some((f) => f.chase) ? 1 : 0) && pool.length) {
    const c = weighted(rng, pool, (x) => 1 + Math.abs(clubNet(L, x)) * 0.15);
    pool.splice(pool.indexOf(c), 1);
    const net = clubNet(L, c);
    const mult = net >= 4 ? 0.9 : net <= -3 ? 1.06 : 1;
    out.push(offerFor(L, c, yrsFor(), Math.max(minSal, round1(base * mult * (0.94 + rng() * 0.1))), false));
  }
  return out;
}
function offerFor(L, c, years, salary, own) {
  const net = clubNet(L, c);
  const diff = effOvr(L) - rotationBar(net);
  const role = diff >= 12 ? 'Franchise player' : diff >= 0 ? 'Starter' : diff >= -6 ? 'Rotation' : 'End of bench';
  const capSal = round1(capFor(L.year) * maxPct(L) * AGENTS[L.agent].sal);
  return { club: c, years, salary: Math.min(salary, capSal), own: !!own, role, tier: clubTier(net) };
}
/* A CLUB, AS A MAN WEIGHING AN OFFER SEES IT: who is on it, best first, and
   where he would land among them. Read off matesOf, the same roster the Team
   tab shows, so the sheet and the season you then play are one answer. Draws
   nothing from a career's random streams. */
function clubView(L, c) {
  if (!c || !L.league || !L.league.net) return null;
  const list = matesOf(L, c).filter((m) => m.n !== L.name).slice(0, 15);
  const me = L.stage === 'nba' ? effOvr(L) : ovrOf(L);
  const ahead = list.filter((m) => m.ovr > me).length;
  return { club: c, name: nick(c), tier: clubTier(clubNet(L, c)), coach: L.stage === 'nba' ? coachName(L, c) : '', list, at: ahead + 1, me };
}
function faCard(L, list, why) {
  return {
    id: 'fa', kind: 'fa', key: 'fa:' + (why || ''),
    eyebrow: why === 'rfa' ? 'Restricted free agency' : 'Free agency',
    scene: "Agent's office", title: list.length === 1 ? 'One team called. One offer.' : wordNum(list.length) + ' offers. Where do you sign?',
    text: 'Money, minutes or a ring. {agent:first} slides the list over: "You rarely get all three."',
    ctx: { offers: list },
    options: list.map((f) => ({
      label: (f.own ? 'Re-sign with the ' : 'Sign with the ') + nick(f.club),
      hint: (f.chase ? 'The ring chase · ' : '') + f.years + (f.years === 1 ? ' year, ' : ' years, ') + money(f.salary) + ' a year · ' + f.role + ' · ' + f.tier,
      club: f.club,
    })),
  };
}
/* The answers to free agency (choose() runs them). */
ANSWER.fa = function(L, card, i, opt, rng, beats, touch, touches) {
  let text = '', tone = '', made = null, won = null, shots = null, contest = null;
  const f = card.ctx.offers[i];
  const old = L.team;
  L.contract = { years: f.years, total: f.years, salary: f.salary, kind: 'vet', start: L.year + 1 };
  if (f.club !== old) joinTeam(L, f.club, false);
  text = (f.club === old ? 'Re-signed with the ' : 'Signed with the ') + E.teamName(f.club) + '. ' + f.years + ' years, ' + money(f.salary) + ' a year.';
  tone = 'gold';
  if (f.club === old) logIt(L, text, 'gold');
  bump(L, { morale: 5 });
  return { text, tone, made, won, shots, contest };
};
function retireCard(L) {
  return {
    id: 'retire', kind: 'event', key: 'retire',
    eyebrow: 'The summer', scene: 'Home', title: 'Is it time to hang them up?',
    text: "You're " + L.age + '. Your overall is ' + ovT(L, ovrOf(L)) + ". Your knees have an opinion, and it isn't quiet.",
    /* Each answer names what it does (`act`), so the overseas finale can sit
       between playing on and retiring without moving either. */
    options: [{ label: 'Play one more season', hint: "See what's left", act: 'more' }]
      .concat(L.age >= 32 && !L.flags.finale ? [{ label: 'One last year in Europe', hint: 'Finish somewhere new', act: 'finale' }] : [])
      .concat([{ label: 'Retire', hint: 'Go out on your own terms', act: 'retire' }]),
  };
}
/* The answers to the retirement question (choose() runs them). */
ANSWER.retire = function(L, card, i, opt, rng, beats, touch, touches) {
  let text = '', tone = '', made = null, won = null, shots = null, contest = null;
  const act = (opt && opt.act) || (i === 1 ? 'retire' : 'more');
  if (act === 'retire') { L.pending = []; retire(L, beats); text = 'You walk away.'; tone = 'gold'; }
  else if (act === 'finale') {
    /* The overseas finale (endings.js): a year abroad, then the end. */
    L.flags.finale = L.year;
    remember(L, 'end.finale', true);
    L.pending = L.pending.filter((c) => c.id !== 'fa' && c.id !== 'nooffer' && c.id !== 'extension');
    L.team = null;
    L.contract = { years: 1, total: 1, salary: 1.2, kind: 'overseas', start: L.year + 1 };
    text = 'A club in Europe offers a year and a big apartment. You say yes before the call ends.'; tone = 'gold';
    logIt(L, 'Signed overseas for one last season.', '');
  }
  else { text = varyRes(L, card, 'retire_more', 'One more year. Let\'s go.'); bump(L, { morale: 3 }); }
  return { text, tone, made, won, shots, contest };
};

function offseason(L, beats) {
  const s = L.season;
  developStory(L, beats);
  buildCards(L);
  if (!L.pending.some((c) => /^build_/.test(c.id))) nicknameCard(L);
  /* Contracts. */
  let c = L.contract;
  if (c) c.years--;
  const o = ovrOf(L);
  if (L.flags.tradeAsk && c && c.years > 0) {
    const rng = rngAt(L, 'tradeask');
    /* Asked out to a contender (a move): only the league's best four. */
    const to = L.flags.tradeAsk === 'contender' ? weighted(rng, contenders(L, 4), (x) => 2 + clubNet(L, x))
      : weighted(rng, CLUBS.filter((x) => x !== L.team), (x) => 2 + clubNet(L, x) + 6);
    L.flags.tradeAsk = false;
    joinTeam(L, to, true);
    beats.push(Object.assign({ kind: 'trade', text: 'Your request is granted. Traded to the ' + E.teamName(to) + '.', tone: 'gold', from: TRADED && TRADED.from, to, how: 'ask', when: 'summer' }, TRADED && TRADED.from ? tradePeople(L, TRADED.from) : {}));
    TRADED = null;
  }
  if (L.age >= BAL.maxAge) { retire(L, beats, 'The body made the call at ' + L.age + '.'); return; }
  if (L.flags.farewell === L.year) { retire(L, beats, 'Retired at ' + L.age + ' after a farewell season.'); return; }
  /* The other ways out (endings.js): cut with a deal still running, or the
     question of walking away on top. */
  if (waiveCheck(L, beats)) c = null;
  onTopCard(L);
  const tired = L.age >= BAL.tired || (L.age >= 31 && o < 70);
  if (c && c.years === 1 && c.kind === 'rookie' && o >= 66) {
    const sal = round1(marketSalary(L, o + 2) * 0.97);
    L.pending.push({
      id: 'extension', kind: 'event', key: 'ext', eyebrow: 'Rookie extension', scene: "GM's office",
      title: 'The ' + nick(L.team) + ' want to lock you up. Sign?',
      text: '{gm} slides the paper across the desk: "Five years, ' + money(sal) + ' a year. Starts next season."',
      ctx: { sal },
      options: [
        { label: 'Sign the extension', hint: 'Security for five years' },
        { label: 'Bet on yourself', hint: 'Restricted free agency next summer' },
      ],
    });
  } else if (c && c.years === 1 && c.kind !== 'rookie' && o >= 72 && L.age <= 31 && !L.flags.extAsked) {
    const sal = round1(marketSalary(L, o + 1));
    L.flags.extAsked = true;
    L.pending.push({
      id: 'extension', kind: 'event', key: 'vext', eyebrow: 'Extension offer', scene: "GM's office",
      title: 'The ' + nick(L.team) + ' want four more years. Sign?',
      text: '{gm} wants a deal before the market opens. Four years at ' + money(sal) + ' a year.',
      ctx: { sal, years: 4 },
      options: [
        { label: 'Sign the extension', hint: 'Stay put, get paid' },
        { label: 'Test the market', hint: 'Free agency next summer' },
      ],
    });
  }
  if (!c || c.years <= 0) {
    L.flags.extAsked = false;
    if (tired) L.pending.push(retireCard(L));
    const list = offers(L);
    if (!list.length) {
      L.pending.push({
        id: 'nooffer', kind: 'event', key: 'nooffer', eyebrow: 'Free agency',
        scene: 'Your phone', title: 'Free agency opens. Nobody calls.',
        text: 'Your overall is ' + ovT(L, o) + ". {agent:first} has tried every team. The league's moved on.",
        options: [
          { label: 'Retire', hint: 'It was a real career', act: 'retire' },
          { label: 'Wait for a ten day', hint: 'One more phone call', act: 'tenday' },
          { label: 'Play overseas', hint: 'A year away, then try again', act: 'overseas' },
        ],
      });
    } else {
      L.pending.push(faCard(L, list, c && c.kind === 'rookie' ? 'rfa' : ''));
    }
  } else if (tired) {
    L.pending.push(retireCard(L));
  }
  /* Something off the court, most summers, and now and then the brands. */
  brandCard(L);
  queueEvents(L, 'off', 1);
}
/* The answers to no offer this summer (choose() runs them). */
ANSWER.nooffer = function(L, card, i, opt, rng, beats, touch, touches) {
  let text = '', tone = '', made = null, won = null, shots = null, contest = null;
  const act = (opt && opt.act) || (i === 0 ? 'retire' : 'overseas');
  if (act === 'retire') { L.pending = []; retire(L, beats); text = 'You walk away.'; tone = 'gold'; }
  else if (act === 'tenday') return tenDay(L, beats, rng);
  else {
    L.flags.overseas = (L.flags.overseas || 0) + 1;
    if (L.history.length && !recall(L, 'route.detour.left')) remember(L, 'route.detour.left', true);
    L.team = null;
    L.contract = { years: 1, total: 1, salary: 0.8, kind: 'overseas', start: L.year + 1 };
    text = 'A year in Europe. Big minutes and a second chance.';
    logIt(L, 'Signed overseas for a year.', '');
  }
  return { text, tone, made, won, shots, contest };
};
/* The answers to an extension offer (choose() runs them). */
ANSWER.extension = function(L, card, i, opt, rng, beats, touch, touches) {
  let text = '', tone = '', made = null, won = null, shots = null, contest = null;
  if (i === 0) {
    const yrs = card.ctx.years || 5;
    L.contract = { years: yrs + 1, total: yrs, salary: L.contract.salary, next: card.ctx.sal, kind: 'vet', start: L.year };
    text = 'Signed. ' + yrs + ' years, ' + money(card.ctx.sal) + ' a year.'; tone = 'gold';
    logIt(L, 'Signed an extension: ' + yrs + ' years, ' + money(card.ctx.sal) + ' a year.', 'gold');
    bump(L, { morale: 6, trust: 6 });
  } else { text = 'You bet on yourself. Next summer, the price goes up.'; bump(L, { fame: 2 }); }
  return { text, tone, made, won, shots, contest };
};

/* Retiring is two moments: the press conference, which is here, and the
   rest of your life, which is the `after` card it leaves on the table. The
   career is only over once that card is answered. */
function retire(L, beats, why) {
  L.phase = 'after';
  L.pending = [];
  L.final = legacy(L);
  const t = why || 'Retired at ' + L.age + '.';
  beats.push({ kind: 'retire', text: t, tone: 'gold' });
  logIt(L, t + ' ' + L.final.verdict + '.', 'gold');
  L.pending.push((storyAfterCard(L)));
}
/* For the screen's own retire button, which can come at any point. */
function retireNow(L) {
  const beats = [];
  if (!L.history.length) { L.pending = []; L.retired = true; L.phase = 'retired'; L.final = legacy(L); return beats; }
  retire(L, beats, 'Retired at ' + L.age + '.');
  headlines(L, beats);
  sayAll(L, beats);
  return beats;
}

// ─── the legacy ─────────────────────────────────────────────────────────────

function totals(L) {
  const T = { gp: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, min: 0, seasons: L.history.length,
    rings: 0, mvp: 0, fmvp: 0, star: 0, an: 0, an1: 0, dpoy: 0, roy: 0, earned: L.earned, olympic: 0,
    ncaa: 0, npoy: 0, aa1: 0, state: 0 };
  for (const h of L.history) {
    T.gp += h.gp; T.pts += Math.round(h.pts * h.gp); T.reb += Math.round(h.reb * h.gp); T.ast += Math.round(h.ast * h.gp);
    T.stl += Math.round(h.stl * h.gp); T.blk += Math.round(h.blk * h.gp); T.min += Math.round(h.min * h.gp);
    for (const a of h.aw || []) {
      if (a === 'champ') T.rings++;
      else if (a === 'mvp') T.mvp++;
      else if (a === 'fmvp') T.fmvp++;
      else if (a === 'star') T.star++;
      else if (a === 'an1') { T.an++; T.an1++; }
      else if (a === 'an2' || a === 'an3') T.an++;
      else if (a === 'dpoy') T.dpoy++;
      else if (a === 'roy') T.roy++;
      else if (a === 'olympic') T.olympic++;
    }
  }
  for (const h of L.amHist || []) {
    for (const a of h.aw || []) {
      if (a === 'c_champ') T.ncaa++;
      else if (a === 'c_npoy') T.npoy++;
      else if (a === 'c_aa1') T.aa1++;
      else if (a === 'hs_state') T.state++;
    }
  }
  return T;
}
/* A Hall of Fame case, as one number. The weights are what a voter weighs: a
   ring, an MVP and a first team are each worth a great deal more than a long
   career of good seasons, but a long career of good seasons is worth a lot. */
/* IN TEN THOUSANDTHS, ALL INTEGER, because the leaderboard works the same
   number out again in SQL (supabase/130_hoops_careers.sql). Written as
   `pts / 1000 * 1.4` it is a float, and a total landing exactly on a half
   can round down here and up there, so the board and the Hall card would
   disagree by one about the same career. Integers round the same way in
   both. check-career asserts the two agree over every career it plays. */
function legacyScore(T) {
  const x = T.pts * 14 + T.reb * 5 + T.ast * 7
    + (T.rings * 4 + T.mvp * 13 + T.fmvp * 6 + T.an1 * 5 + T.star * 2 + T.dpoy * 4 + T.roy * 2 + T.olympic * 2
      /* The Hall in Springfield counts college too, a little. */
      + (T.ncaa || 0) * 2 + (T.npoy || 0) * 3 + (T.aa1 || 0)) * 10000
    + (T.an - T.an1) * 25000;
  return Math.floor((x + 5000) / 10000);
}
function verdictOf(score) { return (VERDICTS.find((x) => score >= x[0]) || VERDICTS[VERDICTS.length - 1])[1]; }
const VERDICTS = [
  [120, 'Inner circle', 'One of the greatest to ever play.'],
  [85, 'First ballot', 'The Hall calls the first year you are eligible.'],
  [55, 'Hall of Famer', 'Springfield, eventually. Bring a suit.'],
  [36, 'On the ballot', 'A real case. The voters will argue about you.'],
  [18, 'A good career', 'Paid, respected, remembered in your city.'],
  [0, 'Journeyman', 'You made it. Most never do.'],
];
function legacy(L) {
  const T = totals(L);
  if (!L.history.length) {
    const nv = { totals: T, score: 0, verdict: 'Never made the league', blurb: 'The game gave you a lot. The league never called.' };
    nv.origin = L.origin ? ORIGINS[L.origin].name : null; nv.ending = endingOf(L, T, 0, null);
    return nv;
  }
  const score = legacyScore(T);
  const v = VERDICTS.find((x) => score >= x[0]);
  /* A club retires your number when you were great there for a long time. */
  const by = {};
  for (const h of L.history) if (h.t) by[h.t] = (by[h.t] || 0) + 1;
  let jersey = null;
  for (const c in by) if (by[c] >= 7 && score >= 36 && (!jersey || by[c] > by[jersey])) jersey = c;
  const r = L.rival;
  const rival = r ? { name: r.name, pts: r.pts, star: r.star, mvp: r.mvp, rings: r.rings, beat: L.flags.rivalWins || 0 } : null;
  if (L.flags.banned) jersey = null;
  const out = { totals: T, score, verdict: v[1], blurb: v[2], jersey, rival, life: lifeLine(L) };
  if (L.flags.banned) { out.verdict = 'Banned for life'; out.blurb = 'The numbers are real. The league took them off the wall.'; }
  /* A story career is remembered for more than its numbers: what it was
     called, what the league learned about it, and the moments it kept. */
  out.nick = L.nick || null;
  out.traits = TRAITS.filter((k) => L.traits[k] && L.traits[k].known).map((k) => TRAIT_NAME[k]);
  out.sig = L.sig ? L.sig.name : null;
  out.badges = badgeList(L).map((b) => b.name);
  out.moments = memories(L).slice(-5).map((m) => ({ y: m.y, t: m.t }));
  const G = L.goals || [];
  out.goals = { met: G.filter((g) => g.met).length, of: G.length };
  out.origin = L.origin ? ORIGINS[L.origin].name : null;
  out.ending = endingOf(L, T, score, jersey);
  return out;
}
