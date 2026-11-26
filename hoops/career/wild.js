// ─── the wild side ──────────────────────────────────────────────────────────

/* THE WILD SIDE (the BitLife plan, phase 4, the owner's call of 2026-11-24:
   "Anything BitLife does", jail, addiction and a life that can end early).
   Things a man does on purpose away from the floor, and what they cost him:
   the tables, a bet with a bookie, a big night out, pills for the pain, and
   rehab. A habit grows with use and can take hold. The league and the law
   answer: a scandal, a failed test, an investigation, an arrest, a
   suspension, time inside. The worst of it can end a life.

   The page reads `wildOpen(L)` and calls `wildAct(L, id, amount)`. Everything
   lives in `L.wild`, made the first time something is done, so a career that
   never goes out is the career it was: `wildSeason` and `wildTipoff` do
   nothing without it, and every draw is on its own stream (wild:...).

   A betting line on YOUR OWN game is the bookie arc in stories.js and is the
   only thing that bans a man for life. A bet here is on somebody else's game:
   against league rules, and it draws heat, not a ban. Nobody real is named. */
const WILD_MAX = 3;            // nights a year
const HOOKED_AT = 60;          // a habit this strong has hold of you
const HABITS = { bet: 'gambling', drink: 'drinking', pills: 'painkillers' };
const JAIL_GAMES = 60, TEST_GAMES = 25, PROBE_GAMES = 10, DENY_GAMES = 40, PLEA_GAMES = 10, REHAB_GAMES = 15;
const OVERDOSE_P = 0.05, CRASH_P = 0.01;
const wildOf = (L) => L.wild || null;
const wildMake = (L) => L.wild || (L.wild = { heat: 0, hab: { bet: 0, drink: 0, pills: 0 }, hook: {}, rec: [], net: 0, susp: 0, y: L.year, n: 0, used: {} });
const wildYear = (W, L) => { if (W.y !== L.year) { W.y = L.year; W.n = 0; W.used = {}; } return W; };
const hooked = (L, k) => !!(L.wild && L.wild.hook[k]);
const hasStaff = (L, k) => !!(L.wealth && L.wealth.staff && L.wealth.staff[k]);
/* A habit grows, and past the line it has hold of him. */
function habitUp(L, k, by, out) {
  const W = wildMake(L);
  W.hab[k] = clamp(W.hab[k] + by, 0, 100);
  W.used[k] = 1;
  if (W.hab[k] >= HOOKED_AT && !W.hook[k]) {
    W.hook[k] = L.year;
    remember(L, 'wild.hooked', k);
    logIt(L, k === 'bet' ? 'The tables have a hold on you.' : k === 'drink' ? 'The drinking is a problem now.' : 'You need the pills now.', 'bad');
    if (out) out.push(k === 'bet' ? 'You can\'t stop thinking about the next bet.' : k === 'drink' ? 'One drink is never one drink anymore.' : 'The bottle is empty a week early.');
  }
}
/* Games the league or a judge takes. In a season they start now; in the
   summer they are served from opening night (wildTipoff). */
function sitOut(L, games, why) {
  const W = wildMake(L), s = L.season;
  W.rec.push({ y: L.year, what: why, g: games });
  if (s && IN_SEASON.indexOf(L.phase) >= 0 && s.g < GAMES) {
    const from = Math.max(s.g + 1, s.ban ? s.ban.until : 0);
    s.ban = { from: s.ban ? s.ban.from : from, until: from + games, why };
    if (s.ban.until > GAMES + 1) { W.susp += s.ban.until - (GAMES + 1); s.ban.until = GAMES + 1; }
  } else W.susp += games;
}
/* Opening night (newSeason): what is still owed is served first. */
function wildTipoff(L) {
  const W = wildOf(L); if (!W || !W.susp || !L.season) return;
  const g = Math.min(W.susp, JAIL_GAMES);
  L.season.ban = { from: 1, until: 1 + g, why: 'owed' };
  W.susp = 0;
}
const sitting = (s, g) => !!(s && s.ban && g >= s.ban.from && g < s.ban.until);

/* THE END. Rare, and only down a road he chose. The career closes where it
   stood: the numbers are kept, the Hall still votes, a son can still play. */
function wildDeath(L, beats, how) {
  L.flags.died = L.year;
  remember(L, 'wild.died', how);
  const t = 'Gone at ' + L.age + '. ' + how;
  beats.push({ kind: 'retire', text: t, tone: 'bad' });
  logIt(L, t, 'bad');
  L.pending = [];
  L.final = legacy(L);
  L.final.after = 'The league holds a moment of silence on opening night.';
  L.retired = true;
  L.phase = 'retired';
}

/* An arrest is a card: how he answers it is most of what it costs. */
function arrestCard(L, kind) {
  const W = wildMake(L);
  W.rec.push({ y: L.year, what: 'arrest' });
  remember(L, 'wild.arrest', kind);
  logIt(L, kind === 'dui' ? 'Arrested for driving drunk.' : 'Arrested after a fight outside a club.', 'bad');
  bump(L, { trust: -8, morale: -6 }); moveRep(L, -5, -6);
  const fee = round1(Math.max(0.5, L.cash * 0.05));
  return {
    id: 'wildarrest', kind: 'event', key: 'wildarrest:' + L.year + ':' + W.rec.length, eyebrow: 'The county courthouse', scene: 'A holding cell',
    title: kind === 'dui' ? 'They pulled you over at 3 a.m.' : 'It started with a shove outside the club.',
    text: kind === 'dui' ? 'You blew twice the limit. Your mugshot is online before sunrise. {agent:first} wants to know how you want to play this.' : 'Somebody got hurt. There is video. {agent:first} wants to know how you want to play this.',
    ctx: { kind, fee },
    options: [
      { label: 'Hire the best lawyer in town', hint: money(fee) + '. Good odds.' },
      { label: 'Plead guilty', hint: 'Probation. The league sits you ' + PLEA_GAMES + ' games.' },
      { label: 'Fight it yourself', hint: 'Free. Risky.' },
    ],
  };
}
ANSWER.wildarrest = function(L, card, i, opt, rng) {
  const jail = () => {
    L.flags.jail = L.year; remember(L, 'wild.jail', L.year);
    sitOut(L, JAIL_GAMES, 'jail');
    bump(L, { trust: -20, morale: -15, health: -6, fame: 4 }); moveRep(L, -8, -10);
    for (const x of dealsNow(L)) { x.until = L.year - 1; x.dropped = L.year; }
    logIt(L, 'Sentenced to four months. The league adds nothing. It did not need to.', 'bad');
  };
  if (i === 0) {
    L.cash = round1(L.cash - Math.min(card.ctx.fee, Math.max(0, L.cash)));
    if (ok(rng, 0.7)) { bump(L, { morale: 4 }); return said('Charges dropped on a technicality. The lawyer sends a bill and a fruit basket.', 'good'); }
    sitOut(L, TEST_GAMES, 'probation'); bump(L, { trust: -6 });
    return said('Even the best lawyer can\'t beat the video. Probation, and the league sits you ' + TEST_GAMES + ' games.', 'bad');
  }
  if (i === 1) {
    sitOut(L, PLEA_GAMES, 'probation'); bump(L, { cash: -Math.min(0.1, Math.max(0, L.cash)), trust: 2 }); moveRep(L, 1, 3);
    return said('You stand up and say you did it. Probation, a fine and ' + PLEA_GAMES + ' games. People respect the apology.', '');
  }
  if (ok(rng, 0.3)) { bump(L, { fame: 3, morale: 5 }); return said('You talk for twenty minutes. Somehow the judge buys it.', 'good'); }
  jail();
  return said('The judge is not a fan. Four months inside. You miss ' + JAIL_GAMES + ' games.', 'bad');
};
/* The league asks questions about the betting. */
function probeCard(L) {
  return {
    id: 'wildprobe', kind: 'event', key: 'wildprobe:' + L.year, eyebrow: 'League security', scene: 'A conference room in New York',
    title: 'The league knows about the bets.', text: 'Two investigators, one folder. They have dates, amounts and a name. They want to hear it from you.',
    options: [
      { label: 'Tell them everything', hint: 'A fine and ' + PROBE_GAMES + ' games' },
      { label: 'Deny all of it', hint: 'Maybe nothing. Maybe much worse.' },
    ],
  };
}
ANSWER.wildprobe = function(L, card, i, opt, rng) {
  const W = wildMake(L);
  if (i === 0) {
    W.heat = 0; sitOut(L, PROBE_GAMES, 'betting'); bump(L, { cash: -Math.min(0.5, Math.max(0, L.cash)), trust: -4 }); moveRep(L, -2, 1);
    logIt(L, 'Suspended ' + PROBE_GAMES + ' games for betting on league games.', 'bad');
    return said('You tell them all of it. ' + PROBE_GAMES + ' games and a fine. {commish} calls it a second chance.', '');
  }
  if (ok(rng, 0.5)) { W.heat = Math.max(0, W.heat - 20); return said('They close the folder. "For now," one of them says.', 'good'); }
  W.heat = 0; sitOut(L, DENY_GAMES, 'betting'); bump(L, { cash: -Math.min(2, Math.max(0, L.cash)), trust: -12 }); moveRep(L, -6, -8);
  logIt(L, 'Suspended ' + DENY_GAMES + ' games for betting on league games, and for lying about it.', 'bad');
  return said('They had the bookie\'s phone the whole time. ' + DENY_GAMES + ' games, a big fine, and nobody believes you now.', 'bad');
};

/* WHAT HE CAN DO. `amt` marks an act that asks how much. `run` returns the
   lines the screen shows; a card it leaves in L.pending is shown after. */
const WILD = {
  casino: {
    name: 'A night at the tables', blurb: 'Pick a number. Win it or lose it.', amt: true, min: 0.05,
    when: (L) => L.age >= 21,
    run(L, r, amt, out) {
      const W = wildMake(L), win = ok(r, 0.46);
      L.cash = round1(L.cash + (win ? amt : -amt)); W.net = round2(W.net + (win ? amt : -amt));
      habitUp(L, 'bet', 10, out);
      if (win && amt >= 1) logIt(L, 'Won ' + money(amt) + ' at the tables.', 'gold');
      if (!win && amt >= 1) logIt(L, 'Lost ' + money(amt) + ' at the tables.', 'bad');
      bump(L, { morale: win ? 5 : -4 });
      return win ? 'Black. Again. You walk out up ' + money(amt) + '.' : 'The dealer flips a king. ' + money(amt) + ' is gone before the drinks come.';
    },
  },
  bookie: {
    name: 'Bet on a game', blurb: 'Not yours. Still against the rules.', amt: true, min: 0.05,
    when: (L) => L.stage === 'nba',
    run(L, r, amt, out) {
      const W = wildMake(L), win = ok(r, 0.5), pay = round2(amt * 0.9);
      L.cash = round1(L.cash + (win ? pay : -amt)); W.net = round2(W.net + (win ? pay : -amt));
      W.heat = clamp(W.heat + 15, 0, 100);
      habitUp(L, 'bet', 12, out);
      remember(L, 'wild.bookie', L.year);
      return win ? 'The underdog covers. {bookie:first} pays out ' + money(pay) + ' in a gym bag.' : 'A buzzer beater the wrong way. You owe {bookie:first} ' + money(amt) + '.';
    },
  },
  party: {
    name: 'A big night out', blurb: 'A table, a tab and no curfew.', cost: 0.02,
    when: (L) => L.age >= 21,
    run(L, r, amt, out) {
      const W = wildMake(L), guard = hasStaff(L, 'security') ? 0.5 : 1;
      bump(L, { morale: 8, health: -3, fame: 2 });
      habitUp(L, 'drink', 10, out);
      if (ok(rngAt(L, 'wild:arrest:' + L.year + ':' + W.n), (0.03 + W.hab.drink * 0.0012) * guard)) {
        L.pending.push(arrestCard(L, ok(r, 0.6) ? 'dui' : 'fight'));
        return 'The night goes long. Then it goes wrong.';
      }
      if (ok(rngAt(L, 'wild:leak:' + L.year + ':' + W.n), 0.12 * guard)) {
        bump(L, { trust: -6 }); moveRep(L, -4, -4);
        logIt(L, 'A video from the club leaked.', 'bad');
        return 'Somebody filmed all of it. The video is everywhere by breakfast.';
      }
      return pick(r, ['Bottles, sparklers and a DJ who knows your name. You sleep until two.', 'The whole team shows up. Nobody remembers the bill.', 'You close the place down. Practice is in five hours.']);
    },
  },
  pills: {
    name: 'Take something for the pain', blurb: 'The knees stop talking for a while.',
    when: (L) => L.stage === 'nba' && L.m.health < 80,
    run(L, r, amt, out) {
      bump(L, { health: 12 });
      habitUp(L, 'pills', 18, out);
      return 'Two pills from a bottle with no label. Nothing hurts for the first time in months.';
    },
  },
  rehab: {
    name: 'Check into rehab', blurb: 'Thirty days. No phone.', cost: 0.25,
    when: (L) => { const W = wildOf(L); return !!W && (W.hab.bet >= 30 || W.hab.drink >= 30 || W.hab.pills >= 30); },
    run(L, r, amt, out) {
      const W = wildMake(L), had = Object.keys(W.hook).length > 0;
      W.hab = { bet: 0, drink: 0, pills: 0 }; W.hook = {};
      W.clean = L.year; remember(L, 'wild.rehab', L.year);
      if (L.season && IN_SEASON.indexOf(L.phase) >= 0 && L.phase !== 'pre') sitOut(L, REHAB_GAMES, 'rehab');
      bump(L, { health: 8, morale: had ? 6 : 2, trust: 3 }); moveRep(L, 2, 5);
      logIt(L, 'Checked into rehab.', 'good');
      return had ? 'Thirty days of group, bad coffee and the truth. You walk out lighter.' : 'You went before it got bad. The counselor says that almost never happens.';
    },
  },
};
const WILD_KEYS = Object.keys(WILD);

/* The screen: what is open tonight, how strong each habit is, and the record. */
function wildOpen(L) {
  if (L.retired || L.pending.length || isAm(L)) return null;
  const W = L.wild ? wildYear(L.wild, L) : { heat: 0, hab: { bet: 0, drink: 0, pills: 0 }, hook: {}, rec: [], net: 0, susp: 0, n: 0 };
  const left = Math.max(0, WILD_MAX - W.n);
  return {
    left, of: WILD_MAX, heat: W.heat, net: W.net, owed: W.susp,
    sitting: L.season && L.season.ban && L.season.g < L.season.ban.until - 1 ? { until: L.season.ban.until - 1, why: L.season.ban.why } : null,
    habits: Object.keys(HABITS).map((k) => ({ id: k, name: HABITS[k], level: W.hab[k], hooked: !!W.hook[k], since: W.hook[k] || null })),
    record: W.rec.slice(),
    acts: WILD_KEYS.filter((k) => WILD[k].when(L)).map((k) => {
      const a = WILD[k], cost = a.cost || 0, min = a.min || 0;
      return { id: k, name: a.name, blurb: a.blurb, cost, amt: !!a.amt, min, max: a.amt ? round1(Math.max(0, L.cash)) : 0, ok: left > 0 && L.cash >= Math.max(cost, min) };
    }),
  };
}
function wildAct(L, id, amount) {
  const V = wildOpen(L), open = V && V.acts.find((x) => x.id === id);
  if (!open || !open.ok) return null;
  const a = WILD[id], amt = a.amt ? round2(+amount) : 0;
  if (a.amt && (!(amt >= open.min) || amt > L.cash)) return null;
  const W = wildYear(wildMake(L), L);
  W.n++;
  const before = snapshot(L), out = [];
  if (open.cost) L.cash = round1(L.cash - open.cost);
  const text = say(L, a.run(L, rngAt(L, 'wild:' + id + ':' + L.year + ':' + W.n), amt, out));
  sayAll(L);
  const res = { title: a.name, label: a.name, text, more: out.map((t) => say(L, t)), tone: '', card: L.pending.length > 0, diff: diffOf(before, snapshot(L)) };
  L.last = res;
  return res;
}

/* THE YEAR SETTLES (newYear). A habit left alone fades; one that has hold of
   him takes its share. The league tests, asks and remembers. */
function wildSeason(L, beats) {
  const W = wildOf(L); if (!W) return;
  const r = (k) => rngAt(L, 'wild:year:' + k);
  const say1 = (t, tone) => { beats.push({ kind: 'wild', text: say(L, t), tone: tone || 'bad' }); };
  if (W.hook.bet) {
    const lost = round1(Math.max(0, L.cash) * (0.15 + r('bet')() * 0.2));
    if (lost >= 0.1) { L.cash = round1(L.cash - lost); W.net = round2(W.net - lost); say1('You lost ' + money(lost) + ' at the tables this year. You stopped counting in March.'); logIt(L, 'Lost ' + money(lost) + ' gambling.', 'bad'); }
    bump(L, { morale: -4 });
  }
  if (W.hook.drink) {
    bump(L, { health: -8, trust: -6, morale: -3 });
    say1('The drinking shows. The whole gym smells it at shootaround.');
    if (ok(r('dui'), 0.2 * (hasStaff(L, 'security') ? 0.5 : 1))) {
      if (ok(r('crash'), CRASH_P / 0.2)) { wildDeath(L, beats, 'A car, a wet road and a night that went too long.'); return; }
      L.pending.push(arrestCard(L, 'dui'));
    }
  }
  if (W.hook.pills) {
    bump(L, { health: -10, ath: -1, morale: -4 });
    say1('The pills run your day now. You count them twice.');
    if (ok(r('od'), OVERDOSE_P)) { wildDeath(L, beats, 'An overdose, alone in a hotel room.'); return; }
    if (ok(r('test'), 0.3)) { sitOut(L, TEST_GAMES, 'test'); bump(L, { trust: -8 }); moveRep(L, -3, -5); say1('A failed drug test. The league sits you ' + TEST_GAMES + ' games.'); logIt(L, 'Suspended ' + TEST_GAMES + ' games for a failed drug test.', 'bad'); }
  }
  if (W.heat >= 30 && !L.pending.some((c) => c.id === 'wildarrest') && ok(r('probe'), W.heat / 150)) L.pending.push(probeCard(L));
  /* What was left alone this year fades. What has hold of him does not. */
  for (const k in W.hab) if (!W.hook[k] && !(W.y === L.year - 1 && W.used[k])) W.hab[k] = Math.max(0, W.hab[k] - 8);
  W.heat = Math.max(0, W.heat - 10);
}
