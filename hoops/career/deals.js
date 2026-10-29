// ─── endorsement deals ──────────────────────────────────────────────────────

/* DEALS, the owner's call of 2026-10-16: offers built from who you are, from
   brands that are goofy puns on real ones (never a real brand's name). Some
   summers, when you are famous enough to sell something, the brands whose
   pitch fits your career line up: the clutch shot sells a sports drink, the
   iron man sells a mattress, a third club sells a travel app. Each card shows
   three, with why they want you.

   A deal pays every season it runs (pay() adds it to the endorsements), and a
   brand walks away when the locker room and the league stop trusting you.
   `L.deals` holds them: { id, n, pay, until }. Nothing is dealt on the old
   saves' random streams: the card draws on its own (rngAt 'deals'). */

const T_ = (L) => totals(L);

const DEALS = [
  { id: 'gator', n: 'Gatorgaid', what: 'sports drink', fit: (L) => (recall(L, 'g7.made') ? 3 : 0) + (trait(L, 'clutch') ? 3 : 0) + (T_(L).star ? 1 : 0), why: 'They want the sweat dripping in slow motion.' },
  { id: 'farmer', n: 'State Farmer', what: 'insurance', fit: (L) => (L.age >= 30 ? 2 : 0) + (repOf(L).resp > 58 ? 2 : 0) + (trait(L, 'loyal') ? 2 : 0), why: 'Like a good neighbor, you\'re always there. The khakis are non-negotiable.' },
  { id: 'firmly', n: 'Mattress Firmly', what: 'mattresses', fit: (L) => (trait(L, 'ironMan') ? 3 : 0) + (recall(L, 'move.rest') ? 3 : 0) + (L.dur >= 70 ? 1 : 0), why: '"Rest like a pro." They saw how much you sit back to backs.' },
  { id: 'bellow', n: 'Taco Bellow', what: 'fast food', fit: (L) => (personaOf(L) === 'Fan favorite' ? 3 : 0) + (personaOf(L) === 'Showman' ? 2 : 0) + (L.age <= 25 ? 1 : 0), why: 'You yell the slogan into a canyon. That\'s the whole ad.' },
  { id: 'chunky', n: 'Chunky Soup Mom', what: 'soup', fit: (L) => (L.flags.momHouse ? 4 : 0) + (recall(L, 'family.house') ? 2 : 0), why: 'Your mom is in it. Your mom is better at it than you.' },
  { id: 'spicy', n: 'Old Spicy', what: 'body wash', fit: (L) => (L.age >= 31 ? 3 : 0) + (L.history.length >= 9 ? 2 : 0), why: 'Look at your game. Now back to them. Now back to your game.' },
  { id: 'wheat', n: 'Wheatlies', what: 'cereal box', fit: (L) => T_(L).mvp * 3 + T_(L).rings * 2 + T_(L).fmvp, why: 'Your face on the box. Breakfast of people who win things.' },
  { id: 'shoulder', n: 'Head & Shoulder Pads', what: 'shampoo', fit: (L) => (L.pos === 'C' || L.pos === 'PF' ? 2 : 0) + (L.rt.reb >= 75 ? 2 : 0) + (recall(L, 'move.body') ? 1 : 0), why: 'No flakes, no fouls. You flip your hair after a rebound.' },
  { id: 'gecko', n: 'Geck-O Insurance', what: 'car insurance', fit: (L) => (L.pos === 'PG' ? 2 : 0) + (L.rt.pla >= 75 ? 2 : 0) + (repOf(L).fans > 50 ? 1 : 0), why: 'A lizard with an accent asks you for a lob. You throw it.' },
  { id: 'kiya', n: 'Kiya Motors', what: 'cars', fit: (L) => (T_(L).star >= 2 ? 3 : 0) + (L.rt.ath >= 78 ? 2 : 0), why: 'You jump over the car. They insist the car is not a metaphor.' },
  { id: 'airbee', n: 'AirBnBee', what: 'a travel app', fit: (L) => (clubsOf(L) >= 3 ? 4 : clubsOf(L) === 2 ? 1 : 0) + (recall(L, 'route.detour.left') ? 2 : 0), why: 'You\'ve lived in a lot of cities. They want you to rate them.' },
  { id: 'peloathon', n: 'Peloathon', what: 'exercise bikes', fit: (L) => (recall(L, 'move.body') ? 3 : 0) + (trait(L, 'gymRat') ? 3 : 0) + (L.eth >= 75 ? 1 : 0), why: 'An instructor screams your name at five in the morning. On purpose.' },
  { id: 'crox', n: 'Crox', what: 'rubber clogs', fit: (L) => (trait(L, 'showman') ? 3 : 0) + (personaOf(L) === 'Loose cannon' ? 2 : 0) + (L.flags.pod ? 1 : 0), why: 'A clog with your number on the strap. You wear them to the arena.' },
  { id: 'subwaye', n: 'Subwaye', what: 'sandwiches', fit: (L) => (L.stage === 'nba' && L.history.length <= 3 ? 3 : 0) + (recall(L, 'move.body') === 'bulk' ? 2 : 0), why: 'Eat fresh. Eat a lot. Rookies are their whole thing.' },
  { id: 'dish', n: 'DoorDish', what: 'food delivery', fit: (L) => (L.team && !BIG_MARKET[L.team] ? 2 : 0) + (repOf(L).fans > 55 ? 2 : 0), why: 'You deliver a pizza to a fan in your city. He doesn\'t believe it\'s you.' },
  { id: 'boze', n: 'Boze', what: 'headphones', fit: (L) => (personaOf(L) === 'Quiet assassin' ? 4 : 0) + (personaOf(L) === 'Low profile' ? 2 : 0) + (recall(L, 'arc.pf.tuned') ? 2 : 0), why: 'You walk into the arena and hear nothing. That\'s the ad.' },
];
const DEAL_BY = Object.fromEntries(DEALS.map((d) => [d.id, d]));
/* What a brand pays a year, off your fame and your market. */
function brandPay(L, d) {
  const base = 0.25 + Math.max(0, L.m.fame - 45) * 0.03;
  return round1(base * (BIG_MARKET[L.team] ? 1.25 : 1) * AGENTS[L.agent].endorse * (d.fit(L) >= 4 ? 1.3 : 1));
}
const dealsNow = (L) => (L.deals || []).filter((x) => x.until >= L.year);
/* The money the running deals pay this season (pay() reads it). */
const dealIncome = (L) => round1(dealsNow(L).reduce((a, x) => a + x.pay, 0));

/* THE CARD. Some summers (DEAL_P), when you are well known, have at most two
   deals running and a brand fits who you are. */
const DEAL_P = 0.4;
function brandCard(L) {
  if (L.stage !== 'nba' || !L.team || L.m.fame < 50 || dealsNow(L).length >= 2) return;
  const r = rngAt(L, 'deals');
  if (r() >= DEAL_P) return;
  const have = new Set((L.deals || []).map((x) => x.id));
  const fits = DEALS.filter((d) => !have.has(d.id)).map((d) => ({ d, v: d.fit(L) + r() * 1.5 })).filter((x) => x.v >= 2)
    .sort((a, b) => b.v - a.v).slice(0, 3);
  if (!fits.length) return;
  const list = fits.map((x) => ({ id: x.d.id, pay: brandPay(L, x.d), years: 2 + Math.floor(r() * 2) }));
  L.pending.push({
    id: 'deal', kind: 'event', key: 'deal:' + L.year, eyebrow: 'Endorsements', scene: 'Your agent\'s office',
    title: list.length === 1 ? 'A brand wants you.' : wordNum(list.length) + ' brands want you.',
    text: '{agent:first} has the decks printed out. "Pick one. Or don\'t. Your face, your call."',
    ctx: { list },
    options: list.map((x) => ({ label: 'Sign with ' + DEAL_BY[x.id].n, hint: DEAL_BY[x.id].what + ' · ' + money(x.pay) + ' a year · ' + x.years + ' years' }))
      .concat([{ label: 'Turn them all down', hint: 'Keep your face your own' }]),
  });
}
ANSWER.deal = function(L, card, i) {
  const x = card.ctx.list[i];
  if (!x) { bump(L, { trust: 2 }); return said('You pass on all of them. {agent:first} sighs and files the decks.'); }
  const d = DEAL_BY[x.id];
  (L.deals = L.deals || []).push({ id: x.id, n: d.n, pay: x.pay, until: L.year + x.years });
  bump(L, { fame: 3 });
  logIt(L, 'Signed with ' + d.n + ': ' + money(x.pay) + ' a year for ' + x.years + ' years.', 'gold');
  return said('You sign with ' + d.n + '. The ' + d.what + ' commercial shoots in a week. ' + d.why, 'gold');
};
/* A brand walks when nobody trusts you anymore, or you are banned. Read at
   the close of a season. */
function dealsSeason(L, beats) {
  for (const x of dealsNow(L)) {
    if (L.flags.banned || L.m.trust < 20) {
      x.until = L.year - 1;
      x.dropped = L.year;
      const t = DEAL_BY[x.id].n + ' drops you. Their statement is two sentences long.';
      logIt(L, t, 'bad');
      beats.push({ kind: 'deal', text: t, tone: 'bad' });
    }
  }
}
/* For the Hall card: the brands that sold your face. */
const dealNames = (L) => (L.deals || []).filter((x) => !x.dropped).map((x) => x.n);
