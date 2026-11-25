// ─── what the money is for ──────────────────────────────────────────────────

/* WEALTH (the BitLife plan, phase 3, the owner's call of 2026-11-24). Money
   that buys things, and things that cost money to keep: homes, cars and toys,
   people on the payroll, and money put to work. A lifestyle feeds the meters
   every year, and a lifestyle past the paycheck ends in a fire sale.

   The page reads `wealthOpen(L)` and calls `wealthAct(L, verb, id, arg)`.
   Everything lives in `L.wealth` ({ own, staff, inv }), made the first time
   something is bought, so a career that buys nothing is the career it was:
   `wealthSeason` does nothing without it, and every draw is on its own stream
   (wealth:...). Money is in millions, like L.cash.

   Brands are never named: a car is a car. */

/* THINGS. `keep` is the yearly cost as a share of the price; `hold` is how the
   value moves a year (a home climbs, a car falls); `m` is what a year of
   owning it does. The best of each kind counts once, not every one owned. */
const THINGS = {
  condo:    { kind: 'home', n: 'A downtown condo', blurb: 'Glass walls. A doorman who knows your name.', price: 0.5, keep: 0.03, hold: 1.03, m: { morale: 1 } },
  house:    { kind: 'home', n: 'A house in the suburbs', blurb: 'A yard, a gate and a hoop in the driveway.', price: 1.8, keep: 0.03, hold: 1.04, m: { morale: 2 } },
  mansion:  { kind: 'home', n: 'A mansion', blurb: 'Nine bedrooms. You have seen five.', price: 7, keep: 0.04, hold: 1.04, m: { morale: 3, fame: 1 } },
  compound: { kind: 'home', n: 'A compound', blurb: 'A full court, a guest house and a wall.', price: 18, keep: 0.05, hold: 1.03, m: { morale: 4, fame: 2 } },
  sports:   { kind: 'car', n: 'A sports car', blurb: 'Loud on purpose.', price: 0.3, keep: 0.04, hold: 0.85, m: { morale: 1 } },
  supercar: { kind: 'car', n: 'A supercar', blurb: 'The doors open the wrong way. That is the point.', price: 1.4, keep: 0.05, hold: 0.85, m: { morale: 1, fame: 1 } },
  fleet:    { kind: 'car', n: 'A garage of ten', blurb: 'One for each day, and three for no reason.', price: 5, keep: 0.06, hold: 0.82, m: { morale: 2, fame: 2 } },
  chain:    { kind: 'toy', n: 'A chain with your number', blurb: 'Heavy. Worth it.', price: 0.25, keep: 0, hold: 0.9, m: { fame: 1 } },
  boat:     { kind: 'toy', n: 'A yacht', blurb: 'The crew outnumbers the guests.', price: 22, keep: 0.1, hold: 0.9, m: { morale: 3, fame: 2 } },
  jet:      { kind: 'toy', n: 'A private jet', blurb: 'No more middle seats. No more airports.', price: 45, keep: 0.08, hold: 0.92, m: { morale: 3, health: 2, fame: 2 } },
};
/* PEOPLE ON THE PAYROLL, paid every year until let go. */
const STAFF = {
  chef:     { n: 'A private chef', blurb: 'Every meal weighed and plated.', pay: 0.15, m: { health: 3 } },
  stylist:  { n: 'A stylist', blurb: 'Tunnel walks become a second job.', pay: 0.1, m: { fame: 2 } },
  security: { n: 'Security', blurb: 'Two large men and a plan.', pay: 0.2, m: {} },
  adviser:  { n: 'A financial adviser', blurb: 'Says no for a living. Halves what a bad year costs.', pay: 0.25, m: {} },
  crew:     { n: 'Your friends, on the payroll', blurb: 'Everybody eats. Not everybody works.', pay: 0.4, m: { morale: 4, trust: -1 } },
};
/* MONEY PUT TO WORK. `turn(r)` is what a year does to the value, as a
   multiplier; `pays` is cash paid out each year as a share of the value. */
const INVEST = {
  fund:    { n: 'An index fund', blurb: 'Boring. That is the feature.', min: 0.2, turn: (r) => 1.02 + r() * 0.08 },
  rental:  { n: 'Rental property', blurb: 'Buildings you will never visit.', min: 1, turn: (r) => 0.97 + r() * 0.13, pays: 0.03 },
  eatery:  { n: 'A restaurant with your name on it', blurb: 'Your wings. Your face on the menu.', min: 0.5, turn: (r) => r() < 0.55 ? 1.05 : 0.75, pays: 0.08 },
  startup: { n: 'A friend\'s startup', blurb: 'An app. He swears it is different.', min: 0.3, turn: (r) => { const x = r(); return x < 0.08 ? 4 : x < 0.3 ? 1.5 : x < 0.6 ? 1 : 0.45; } },
  coins:   { n: 'Crypto', blurb: 'A coin with a dog on it.', min: 0.1, turn: (r) => { const x = r(); return x < 0.15 ? 3 : x < 0.4 ? 1.4 : x < 0.65 ? 0.8 : 0.35; } },
};
/* What a fire sale gets, and what selling on purpose costs. */
const FIRE_SALE = 0.6, SELL_FEE = 0.06;
/* Values keep cents of a million: at one decimal a condo never climbed. */
const round2 = (x) => Math.round(x * 100) / 100;
const wealthOf = (L) => L.wealth || null;
const wealthMake = (L) => L.wealth || (L.wealth = { own: [], staff: {}, inv: {} });
/* To the thousand: at one decimal of a million a condo cost nothing to keep. */
const round3 = (x) => Math.round(x * 1000) / 1000;
const thingKeep = (o) => round3(THINGS[o.id].price * THINGS[o.id].keep);
const sellFor = (o) => round2(o.val * (1 - SELL_FEE));
/* What a year of this life costs before a paycheck. */
function upkeepOf(L) {
  const W = wealthOf(L); if (!W) return 0;
  let t = 0;
  for (const o of W.own) t += thingKeep(o);
  for (const k in W.staff) t += STAFF[k].pay;
  return round3(t);
}
/* Cash, plus what is owned and invested at today's value. */
function netWorth(L) {
  const W = wealthOf(L); let t = L.cash;
  if (W) { for (const o of W.own) t += o.val; for (const k in W.inv) t += W.inv[k].val; }
  return round2(t);
}

/* The year settles (newYear): the lifestyle is paid for and does its work,
   the money at work moves, and a man who cannot cover it sells in a hurry. */
function wealthSeason(L, beats) {
  const W = wealthOf(L); if (!W) return;
  const cost = upkeepOf(L);
  if (cost) L.cash = round2(L.cash - cost);
  /* the best home, the best car and every toy do their work; staff too */
  const best = {}, lift = {};
  for (const o of W.own) { const T = THINGS[o.id]; if (T.kind === 'toy') { for (const k in T.m) lift[k] = (lift[k] || 0) + T.m[k]; } else if (!best[T.kind] || T.price > THINGS[best[T.kind]].price) best[T.kind] = o.id; }
  for (const kd in best) { const m = THINGS[best[kd]].m; for (const k in m) lift[k] = (lift[k] || 0) + m[k]; }
  for (const s in W.staff) { const m = STAFF[s].m; for (const k in m) lift[k] = (lift[k] || 0) + m[k]; }
  bump(L, lift);
  for (const o of W.own) o.val = round2(Math.max(0.01, o.val * THINGS[o.id].hold));
  /* money at work */
  let paid = 0;
  for (const k of Object.keys(W.inv)) {
    const v = W.inv[k], I = INVEST[k];
    let x = I.turn(rngAt(L, 'wealth:inv:' + k));
    if (x < 1 && W.staff.adviser) x = 1 - (1 - x) / 2;
    const was = v.val;
    v.val = round2(v.val * x);
    if (I.pays && x >= 1) paid += v.val * I.pays;
    if (v.val < 0.05) { delete W.inv[k]; beats.push({ kind: 'money', text: I.n + ' went to nothing.', tone: 'bad' }); logIt(L, I.n + ' went to nothing.', 'bad'); }
    else if (x >= 2) { beats.push({ kind: 'money', text: I.n + ' took off. ' + money(was) + ' is now ' + money(v.val) + '.', tone: 'gold' }); logIt(L, I.n + ' took off.', 'gold'); }
    else if (x <= 0.5) beats.push({ kind: 'money', text: I.n + ' had a bad year. ' + money(was) + ' is now ' + money(v.val) + '.', tone: 'bad' });
  }
  if (paid) L.cash = round1(L.cash + paid);
  if (L.cash < 0) wealthCrash(L, beats);
}
/* Out of cash: the money at work comes out first, then things go at fire
   sale prices, dearest first. If that is still not enough, he is broke: the
   payroll walks and the papers find out. */
function wealthCrash(L, beats) {
  const W = wealthOf(L), sold = [];
  for (const k of Object.keys(W.inv)) { if (L.cash >= 0) break; L.cash = round1(L.cash + W.inv[k].val * (1 - SELL_FEE)); sold.push(INVEST[k].n); delete W.inv[k]; }
  W.own.sort((a, b) => b.val - a.val);
  while (L.cash < 0 && W.own.length) { const o = W.own.shift(); L.cash = round1(L.cash + o.val * FIRE_SALE); sold.push(THINGS[o.id].n); }
  if (sold.length) { beats.push({ kind: 'money', text: 'The bills came due. Sold in a hurry: ' + sold.length + (sold.length === 1 ? ' thing.' : ' things.'), tone: 'bad' }); bump(L, { morale: -5 }); }
  if (L.cash < 0) {
    L.cash = 0; W.staff = {};
    L.flags.broke = L.year; tw(L).spent = (tw(L).spent || 0) + 2;
    bump(L, { morale: -12, fame: 2 });
    beats.push({ kind: 'money', text: 'Broke. Everything is gone, and everybody knows.', tone: 'bad' });
    logIt(L, 'Went broke.', 'bad');
  }
}

/* The money screen: what he has, what it costs to keep, and what is for sale. */
function wealthOpen(L) {
  if (L.retired || L.pending.length || isAm(L)) return null;
  const W = wealthOf(L) || { own: [], staff: {}, inv: {} };
  const has = {}; for (const o of W.own) has[o.id] = 1;
  return {
    cash: L.cash, worth: netWorth(L), upkeep: upkeepOf(L),
    /* `broke` is the year while he still has next to nothing; `wasBroke` is the year for good. */
    broke: L.flags.broke && netWorth(L) < 1 ? L.flags.broke : null, wasBroke: L.flags.broke || null,
    own: W.own.map((o, i) => ({ i, id: o.id, kind: THINGS[o.id].kind, name: THINGS[o.id].n, y: o.y, paid: o.paid, val: o.val, keep: thingKeep(o), sell: sellFor(o) })),
    staff: Object.keys(W.staff).map((k) => ({ id: k, name: STAFF[k].n, pay: STAFF[k].pay, since: W.staff[k] })),
    inv: Object.keys(W.inv).map((k) => ({ id: k, name: INVEST[k].n, put: W.inv[k].put, val: W.inv[k].val, y: W.inv[k].y, out: round2(W.inv[k].val * (1 - SELL_FEE)) })),
    shop: Object.keys(THINGS).filter((k) => !has[k]).map((k) => ({ id: k, kind: THINGS[k].kind, name: THINGS[k].n, blurb: THINGS[k].blurb, cost: THINGS[k].price, keep: round3(THINGS[k].price * THINGS[k].keep), ok: L.cash >= THINGS[k].price })),
    hire: Object.keys(STAFF).filter((k) => !W.staff[k]).map((k) => ({ id: k, name: STAFF[k].n, blurb: STAFF[k].blurb, pay: STAFF[k].pay, ok: L.cash >= STAFF[k].pay })),
    /* an amount is asked for; these are the least and the most */
    invest: Object.keys(INVEST).map((k) => ({ id: k, name: INVEST[k].n, blurb: INVEST[k].blurb, min: INVEST[k].min, max: round1(Math.max(0, L.cash)), ok: L.cash >= INVEST[k].min })),
  };
}
/* buy a thing, sell one (by its place in `own`), hire, fire, invest an
   amount, cash an investment out. */
function wealthAct(L, verb, id, arg) {
  const V = wealthOpen(L); if (!V) return null;
  const before = snapshot(L), W = wealthMake(L);
  let title = '', text = '', tone = '';
  if (verb === 'buy') {
    const s = V.shop.find((x) => x.id === id); if (!s || !s.ok) return null;
    L.cash = round1(L.cash - s.cost); W.own.push({ id, y: L.year, paid: s.cost, val: s.cost });
    if (s.cost >= 0.5) tw(L).spent = (tw(L).spent || 0) + 1;
    title = s.name; text = s.blurb; tone = 'gold';
    if (s.cost >= 5) logIt(L, 'Bought ' + s.name.replace(/^A /, 'a ') + '.', 'gold');
  } else if (verb === 'sell') {
    const o = V.own.find((x) => x.i === +id); if (!o) return null;
    W.own.splice(o.i, 1); L.cash = round1(L.cash + o.sell);
    title = 'Sold'; text = o.name + ' goes for ' + money(o.sell) + '.';
  } else if (verb === 'hire') {
    const s = V.hire.find((x) => x.id === id); if (!s || !s.ok) return null;
    L.cash = round1(L.cash - s.pay); W.staff[id] = L.year;
    title = s.name; text = s.blurb;
  } else if (verb === 'fire') {
    if (!W.staff[id]) return null;
    delete W.staff[id]; title = 'Let go'; text = STAFF[id].n + ' is off the payroll.';
    if (id === 'crew') bump(L, { morale: -3 });
  } else if (verb === 'invest') {
    const s = V.invest.find((x) => x.id === id), amt = round1(+arg);
    if (!s || !s.ok || !(amt >= s.min) || amt > L.cash) return null;
    L.cash = round1(L.cash - amt);
    const v = W.inv[id] || (W.inv[id] = { put: 0, val: 0, y: L.year });
    v.put = round1(v.put + amt); v.val = round1(v.val + amt);
    title = s.name; text = money(amt) + ' in. ' + s.blurb;
  } else if (verb === 'cashout') {
    const v = V.inv.find((x) => x.id === id); if (!v) return null;
    delete W.inv[id]; L.cash = round1(L.cash + v.out);
    title = 'Cashed out'; text = v.name + ' pays out ' + money(v.out) + '.'; tone = v.out >= v.put ? 'good' : 'bad';
  } else return null;
  const res = { title, label: title, text, tone, diff: diffOf(before, snapshot(L)) };
  L.last = res;
  return res;
}
