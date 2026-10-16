// ─── the event schema ───────────────────────────────────────────────────────

/* AN EVENT IS DATA (NARRATIVE.md section 2). defineEvents() reads each entry
   once and fills in every field the picker asks about, so an event written
   with three fields and one written with twelve are read by the same code:

     phases    the slots it can be dealt in ('early', 'off', 'hs', 'col_pre')
     tags      what it is about, for arcs and the media layer
     req       prerequisites as data, read by reqOk(); `when` is the escape
               hatch for a rule that will not fit in a field
     weight    a number (times its rarity) or a function of the career
     rarity    common, uncommon or rare
     once      never again in this career
     cooldown  seasons before it may be dealt again (a story career only)
     cap       the most times in one career (a story career only)

   The version 1 rule is kept for every career: an event is dealt at most once
   a season. Cooldowns and caps are recorded only on a story career, because a
   migrated save has to play exactly as the old engine played it (check-saves). */
const RARITY = { common: 1, uncommon: 0.55, rare: 0.25 };
const EVENT_TAGS = {
  locker: ['vet_mentor', 'rookie_duty', 'teammate_touches', 'teammate_fight', 'mentor_rookie', 'young_star', 'film_session'],
  court: ['hot_streak', 'slump', 'buzzer', 'christmas', 'ref_heat', 'double_team', 'rival_school', 'rivalry_col'],
  coach: ['coach_bench', 'stuck', 'coach_fired', 'coach_son', 'coach_leaves', 'tank', 'load_mgmt'],
  front: ['trade_rumor', 'superteam', 'buyout', 'contract_year', 'hometown_call', 'agent_pitch'],
  money: ['shoe_deal', 'local_ad', 'family_money', 'investment', 'body_care', 'nil_deal', 'booster', 'street_agent', 'charity'],
  media: ['online_beef', 'podcast', 'docuseries', 'rap_album', 'media_day', 'playoff_guarantee', 'mixtape', 'heckler'],
  body: ['injury_tweak', 'rehab_summer', 'body_care', 'load_mgmt', 'freshman_wall', 'growth'],
  heart: ['meet_someone', 'propose', 'wedding', 'baby', 'breakup', 'homecoming', 'roommate'],
  rival: ['rival_trash', 'rival_tv', 'online_beef'],
  school: ['grades', 'class_skip', 'nba_scouts', 'camp_invite', 'prep_transfer', 'investigation', 'summer_league'],
};
function defineEvents(pool, kind) {
  const tagsOf = {};
  for (const t in EVENT_TAGS) for (const id of EVENT_TAGS[t]) (tagsOf[id] = tagsOf[id] || []).push(t);
  for (const id in pool) {
    const ev = pool[id];
    ev.id = id;
    ev.pool = kind;
    ev.tags = ev.tags || tagsOf[id] || [];
    ev.req = ev.req || null;
    ev.cooldown = ev.cooldown || 0;
    ev.cap = ev.cap || 0;
    if (!ev.rarity) {
      const w = typeof ev.weight === 'number' ? ev.weight : 0;
      ev.rarity = w >= 3 ? 'common' : 'uncommon';
    }
    if (!ev.when) ev.when = () => true;
    if (ev.weight == null) ev.weight = 1;
    if (typeof ev.weight === 'number') { const w = ev.weight * RARITY[ev.rarity]; ev.weight = () => w; }
  }
  return pool;
}
/* Prerequisites as data. Every key is optional and all of them must hold. A
   range is [min, max] with either end null. */
const inRange = (v, r) => (r[0] == null || v >= r[0]) && (r[1] == null || v <= r[1]);
const REQ = {
  seasons: (L, r) => inRange(L.seasonsDone, r),
  age: (L, r) => inRange(L.age, r),
  fame: (L, r) => inRange(L.m.fame, r),
  morale: (L, r) => inRange(L.m.morale, r),
  health: (L, r) => inRange(L.m.health, r),
  ovr: (L, r) => inRange(ovrOf(L), r),
  cash: (L, v) => L.cash >= v,
  minutes: (L, r) => !!(L.season && L.season.role) && inRange(L.season.role.min, r),
  starter: (L, v) => !!(L.season && L.season.role && L.season.role.starter) === v,
  team: (L, v) => !!L.team === v,
  contract: (L, r) => !!L.contract && inRange(L.contract.years, r),
  rel: (L, v) => [].concat(v).indexOf(lifeOf(L).rel) >= 0,
  flags: (L, a) => a.every((k) => !!L.flags[k]),
  notFlags: (L, a) => a.every((k) => !L.flags[k]),
  mem: (L, a) => a.every((k) => !!recall(L, k)),
  notMem: (L, a) => a.every((k) => !recall(L, k)),
  traits: (L, a) => a.every((k) => hasTrait(L, k)),
  rival: (L, v) => rivalOn(L) === v,
};
function reqOk(L, req) {
  if (!req) return true;
  for (const k in req) { if (!REQ[k]) throw new Error('unknown requirement ' + k); if (!REQ[k](L, req[k])) return false; }
  return true;
}
/* A story career keeps a ledger of what it was dealt and when, which is what
   cooldowns and caps are read off. A migrated save has none and needs none. */
function evSeen(L) { return L.evlog || (L.evlog = {}); }
function evOpen(L, ev) {

  const h = (L.evlog || {})[ev.id];
  if (!h || !h.length) return true;
  const r = STORY_RECURS[ev.id];
  const cap = ev.cap || (r ? r[1] : 1), cd = ev.cooldown || (r ? r[0] : 0);
  if (h.length >= cap) return false;
  if (cd && L.year - h[h.length - 1] < cd) return false;
  return true;
}
function eligible(L, ev, phase, used, once) {
  const ph = (STORY_PHASES[ev.id]) ? STORY_PHASES[ev.id] : ev.phases;
  if (ph.indexOf(phase) < 0) return false;
  if (used[ev.id]) return false;
  if (ev.legend && (!(L.opt && L.opt.legend) || !legendOpen(L))) return false;
  if (ev.once && once[ev.id]) return false;
  if (!evOpen(L, ev)) return false;
  if (!reqOk(L, ev.req)) return false;
  return !!ev.when(L);
}

/* THE CALENDAR. Every slot an event can be dealt in is a real moment in a
   real year, and the card says which. L.year is the year a season ENDS (2027
   is 2026-27), so camp and December belong to the year before it.
     pre    after the summer, before the opener        September
     early  after game 27                               December
     mid    after game 55, the All-Star break           February
     late   after game 82, before the playoffs          April
     off    after the playoffs                          the summer
   A story career keeps every in-game story out of `late`: by then the
   regular season is over and only the playoffs are left to change. */
const SLOT_MONTH = { pre: 'September', early: 'December', mid: 'February', late: 'April', hs: 'January', col: 'December', col_mar: 'March', col_pre: 'October' };
const SLOT_SUMMER = { off: 1, hs_sum: 1, hs_off: 1, col_off: 1 };
function calendar(L, slot) {
  if (slot === 'post') return 'Years later';
  if (slot === 'predraft') return 'Before the ' + (L.year - 1) + ' draft';
  if (slot === 'dn') return 'Draft night ' + (L.year - 1);
  if (slot === 'alt') return (ALT_NAME[(L.am || {}).route] || 'Away') + ' · January';
  const nba = !isAm(L);
  const y = nba && (slot === 'pre' || slot === 'early') ? L.year - 1 : L.year;
  const when = SLOT_SUMMER[slot] ? 'Summer' : (SLOT_MONTH[slot] || 'This season');
  if (nba) return when + ' ' + y;
  const a = L.am || {};
  const yr = a.level === 'col' ? CYEAR[a.cyear] : GRADE[a.grade];
  return yr ? yr[0].toUpperCase() + yr.slice(1) + ' year · ' + when : when;
}
/* Events that list `late` but are about the regular season, and college
   events that cannot happen in March, are dealt elsewhere on a story career. */
const STORY_PHASES = {
  night_out: ['early', 'mid'], hot_streak: ['early', 'mid'], slump: ['early', 'mid'], film_session: ['early', 'mid'],
  online_beef: ['early', 'mid'], ref_heat: ['early', 'mid'], buzzer: ['early', 'mid'], teammate_touches: ['mid'],
  heckler: ['mid'], tank: ['mid'], rival_tv: ['mid'],
  grades: ['hs', 'col', 'col_mar'], class_skip: ['col', 'col_mar'], nba_scouts: ['col', 'col_mar'], investigation: ['col', 'col_mar'],
  double_team: ['hs', 'col', 'col_mar'], freshman_wall: ['col_mar'], rivalry_col: ['col'],
};
/* ON A STORY CAREER AN EVENT HAPPENS ONCE unless it is written to recur. A
   recurring event waits `cooldown` seasons and stops at `cap`: a slump can
   come back, a cousin can call again, but not every year and not forever. */
const STORY_RECURS = {
  night_out: [2, 3], slump: [2, 3], hot_streak: [2, 3], film_session: [2, 2], buzzer: [2, 3], ref_heat: [3, 2],
  injury_tweak: [2, 3], trade_rumor: [2, 3], stuck: [2, 2], coach_bench: [3, 2], teammate_touches: [3, 2],
  media_day: [3, 3], load_mgmt: [2, 3], charity: [3, 3], family_money: [3, 3], local_ad: [3, 2], investment: [3, 3],
  heckler: [3, 2], online_beef: [3, 2], rival_trash: [3, 2], rival_tv: [3, 2], teammate_fight: [4, 2],
  contract_year: [2, 5], tank: [3, 2], coach_fired: [3, 2], rehab_summer: [2, 4], christmas: [2, 4],
  playoff_guarantee: [3, 2], playoff_eve: [3, 4], exit_interview: [3, 4], olympics: [4, 3], superteam: [4, 2],
  meet_someone: [2, 3], breakup: [3, 2], propose: [2, 2], wedding: [3, 2], baby: [1, 4],
  grades: [1, 3], rival_school: [1, 3], double_team: [1, 2], mixtape: [1, 2], class_skip: [1, 2], nba_scouts: [1, 3],
  rivalry_col: [1, 3], summer_league: [1, 2], camp_invite: [1, 2], nil_deal: [1, 4],
};
const recurs = (id) => !!STORY_RECURS[id];
let AM_ALL = null, NBA_ALL = null;
const SUMMERY = { off: 1, pre: 1, hs_sum: 1, hs_off: 1, col_pre: 1, col_off: 1 };
function dealCard(L, phase, ev) {
  if (ev.queue) ev.queue(L);
  const card = {
    id: ev.id, kind: 'event', key: phase + ':' + ev.id,
    eyebrow: (calendar(L, phase)),
    title: typeof ev.title === 'function' ? ev.title(L) : ev.title, text: ev.text(L),
    options: ev.options.map((o) => (o.hint ? { label: o.label, hint: o.hint } : { label: o.label })),
  };
  /* Where it happens (the locker room, the agent's office), said above the
     title the way a broadcast puts a place on screen. */
  if (ev.tag) card.scene = typeof ev.tag === 'function' ? ev.tag(L) : ev.tag;
  const tk = takeOf(L, ev);
  if (tk) {
    const t = ev.takes[tk - 1];
    card.take = tk;
    card.title = typeof t.title === 'function' ? t.title(L) : t.title;
    card.text = t.text(L);
    card.options = t.options.map((o) => ({ label: o.label, hint: o.hint }));
    if (t.tag) card.scene = t.tag;
  }
  if (ev.cb) { const c = callback(L, ev.cb); if (c) card.text = c + ' ' + card.text; }
  L.pending.push(card);
}
/* Which take of a card this is: nought is the card as written. A story
   career starts on a take of its own (seeded off the career, not the year)
   and steps on one each time the card comes back, so a repeat is never the
   same scene twice in a row. Off a story career there are no takes. */
function takeOf(L, ev) {
  if (!ev.takes || !ev.takes.length) return 0;
  const k = ev.takes.length + 1;
  const base = Math.abs(E.hashSeed(String(L.seed) + ':take:' + ev.id)) % k;
  const n = ((L.evlog || {})[ev.id] || []).length;
  return (base + Math.max(0, n - 1)) % k;
}
function queueEvents(L, phase, n, pool) {
  pool = pool || EVENTS;
  /* A story career draws from the Phase D catalog as well. */
  pool = pool === AM_EVENTS ? (AM_ALL || (AM_ALL = Object.assign({}, AM_EVENTS, STORY_AM)))
    : pool === EVENTS ? (NBA_ALL || (NBA_ALL = Object.assign({}, EVENTS, STORY_NBA))) : pool;
  if (!L.flags.offUsed || L.flags.offUsed.y !== L.year) L.flags.offUsed = { y: L.year };
  const used = L.season ? L.season.used : L.flags.offUsed;
  const once = L.flags.once = L.flags.once || {};
  const rng = rngAt(L, 'ev:' + phase + ':' + L.pending.length);
  /* An arc that is due is dealt first, and takes one of the slot's places. */
  const due = dueArcs(L, phase);
  /* Two arcs can be due in one slot (an April with a farewell and a
     label to answer); both are dealt, each taking a place. */
  for (const id of due.slice(0, 2)) { dealCard(L, phase, ARC_EVENTS[id]); n = Math.max(0, n - 1); }
  /* Then whatever your club gave the career to answer (teamDue). */
  if (pool !== AM_ALL) {
    const tid = teamDue(L, phase);
    if (tid) { dealCard(L, phase, TEAM_EV[tid]); (evSeen(L)[tid] = evSeen(L)[tid] || []).push(L.year); n = Math.max(0, n - 1); }
  }
  for (let k = 0; k < n; k++) {
    const ids = Object.keys(pool).filter((id) => eligible(L, pool[id], phase, used, once));
    /* On a story career the old recurring cards (a slump, a night out) give
       way a little to the wider catalog, so two careers share less. */
    /* A life off the floor keeps its pace: meeting someone, a proposal, a
       wedding, a baby. Damping those left a sweep of 600 with eleven weddings,
       so on a story career they are dealt a little more often, not less. */
    const damp = ((x) => (LIFE_CYCLE[x] ? 1.8 : STORY_RECURS[x] && !STORY_EV[x] ? 0.2 : 1));
    const id = weighted(rng, ids, (x) => pool[x].weight(L) * damp(x));
    if (!id) return;
    used[id] = 1;
    if (pool[id].once) once[id] = 1;
    (evSeen(L)[id] = evSeen(L)[id] || []).push(L.year);
    dealCard(L, phase, pool[id]);
  }
}

// ─── the narrator ───────────────────────────────────────────────────────────

/* THE GAME TALKS TO YOU. A card on a story career can open with one line in
   the narrator's voice, read off where the life actually is at the moment
   the card comes up: your record, your age, your minutes, your city, your
   money, who is home waiting. It is said when the card reaches the top of
   the stack (sayAll), never when it is dealt, because a December card dealt
   behind two others should still know the December it lands in.
   Every line is a fact the career holds, so the narrator can only ever say
   true things. A line is said at most once a season and comes back no sooner
   than NARR_GAP seasons later, and not every card gets one, so the voice
   reads as a voice rather than as a caption on everything. It draws only
   from its own seeded stream and moves nothing the season reads. */
const NARR_SKIP = { retire: 1, nooffer: 1, moment: 1, clutch: 1, amclutch: 1, after: 1, combine: 1, interview: 1, pworkout: 1, workout: 1, agent: 1 };
const nbaSeasons = (L) => (L.history || []).length;
const clubRec = (L) => { const s = L.season; return s && !s.amateur && L.team && s.g >= 20 ? s : null; };
const ringCount = (L) => (L.history || []).filter((h) => (h.aw || []).indexOf('champ') >= 0).length;
/* [id, applies, line]. Lines are short and say one thing. A place name for a
   program takes a singular verb; a club's nickname is plural. */
const NARR_NBA = [
  ['rookie1', (L) => nbaSeasons(L) === 0 && L.phase !== 'off', () => 'Your first NBA season. You still check the schedule twice.'],
  ['rookie2', (L) => nbaSeasons(L) === 0 && L.phase !== 'off', () => 'Rookie year. You still get lost in the tunnels under the arena.'],
  ['rookie3', (L) => nbaSeasons(L) === 0 && L.phase !== 'off', () => 'A year ago you were a prospect. Now your name is on a locker.'],
  ['year2', (L) => nbaSeasons(L) === 1, () => 'Year two. The league has film on you now.'],
  ['cyear', (L) => L.contract && L.contract.years === 1 && !SUMMERY[L.phase], () => 'Contract year. Every box score is a job interview.'],
  ['hot', (L) => { const s = clubRec(L); return s && s.w - s.l >= 10; }, (L) => { const s = clubRec(L); return 'The ' + nick(L.team) + ' are ' + s.w + '-' + s.l + '. The city is starting to believe.'; }],
  ['hot2', (L) => { const s = clubRec(L); return s && s.w - s.l >= 16; }, (L) => { const s = clubRec(L); return s.w + '-' + s.l + '. People are printing playoff tickets in their heads.'; }],
  ['cold', (L) => { const s = clubRec(L); return s && s.l - s.w >= 10; }, (L) => { const s = clubRec(L); return 'The ' + nick(L.team) + ' are ' + s.w + '-' + s.l + '. The upper deck has plenty of room.'; }],
  ['cold2', (L) => { const s = clubRec(L); return s && s.l - s.w >= 16; }, (L) => { const s = clubRec(L); return s.w + '-' + s.l + '. The fans have started talking about the draft lottery.'; }],
  ['mid', (L) => { const s = clubRec(L); return s && Math.abs(s.w - s.l) <= 4; }, (L) => { const s = clubRec(L); return s.w + '-' + s.l + '. Stuck in the middle of the standings, like half the league.'; }],
  ['bench', (L) => L.season && L.season.role && L.season.role.min < 15 && !L.season.amateur, (L) => Math.round(L.season.role.min) + ' minutes a night. You know every seat on that bench.'],
  ['bench2', (L) => L.season && L.season.role && L.season.role.min < 15 && !L.season.amateur, () => 'You warm up like a starter and sit like a fan.'],
  ['six', (L) => L.season && L.season.role && L.season.role.label === 'Sixth man', () => 'First man off the bench. The building gets loud when you check in.'],
  ['starter', (L) => L.season && L.season.role && L.season.role.starter && nbaSeasons(L) <= 3, (L) => 'You start for the ' + nick(L.team) + '. Not long ago that was a dream.'],
  ['franchise', (L) => L.season && L.season.role && L.season.role.label === 'Franchise player', (L) => 'The ' + nick(L.team) + ' go as you go. Everybody in the building knows it.'],
  ['newclub', (L) => L.team && nbaSeasons(L) >= 1 && L.history[L.history.length - 1].t !== L.team && !SUMMERY[L.phase], () => 'New city, new locker, new parking spot. Same you.'],
  ['hurt', (L) => L.season && !L.season.amateur && L.season.out >= 8, (L) => 'You\'ve missed ' + L.season.out + ' games this year. The trainer knows your coffee order.'],
  ['star1', (L) => (L.flags.allstars || 0) === 1, () => 'You\'re an All-Star now. People expect things.'],
  ['starN', (L) => (L.flags.allstars || 0) >= 3, (L) => wordNum(L.flags.allstars) + ' All-Star games. Kids in the stands wear your number.'],
  ['ring', (L) => ringCount(L) === 1, () => 'You have a ring. Nobody can ever take that back.'],
  ['rings', (L) => ringCount(L) >= 2, (L) => wordNum(ringCount(L)) + ' rings. You wear none of them. You just know where they are.'],
  ['noring', (L) => nbaSeasons(L) >= 8 && !ringCount(L), (L) => wordNum(nbaSeasons(L)) + ' seasons and no ring. You think about it more than you say.'],
  ['thirty', (L) => L.age >= 30 && L.age <= 32, () => 'Thirty came faster than anybody warned you.'],
  ['old', (L) => L.age >= 33, (L) => 'You\'re ' + L.age + '. Mornings take a little longer than they used to.'],
  ['old2', (L) => L.age >= 34, () => 'The rookies call you sir. Some of them mean it.'],
  ['vet', (L) => nbaSeasons(L) >= 10 && !SUMMERY[L.phase], (L) => 'Season ' + (nbaSeasons(L) + 1) + '. You\'ve watched a lot of rookies come and go.'],
  ['famous', (L) => L.m.fame >= 70, () => 'Strangers say your name at the airport now.'],
  ['famous2', (L) => L.m.fame >= 85, () => 'Your face is on a billboard downtown. You drive the long way home.'],
  ['unknown', (L) => L.m.fame <= 15 && nbaSeasons(L) >= 2, () => 'Most fans still couldn\'t pick you out of a lineup.'],
  ['low', (L) => L.m.morale <= 35, () => 'Lately the game feels more like a job.'],
  ['high', (L) => L.m.morale >= 85, () => 'You love this game right now, and it shows.'],
  ['trusted', (L) => L.m.trust >= 80, () => 'The coaches trust you. It took a while.'],
  ['rich', (L) => L.cash >= 25, () => 'You\'ve made more money than your family ever saw. You still check prices.'],
  ['broke', (L) => L.cash < 1 && nbaSeasons(L) >= 3, () => 'The checks are smaller than people think, and they go fast.'],
  ['married', (L) => lifeOf(L).rel === 'married', () => '{partner:first} still asks how practice went, and still listens.'],
  ['kids', (L) => lifeOf(L).kids >= 1, (L) => lifeOf(L).kids === 1 ? 'There\'s a car seat in your back seat now.' : 'Your kids think you\'re famous for a different reason every week.'],
  ['single', (L) => lifeOf(L).rel === 'single' && L.age >= 27, () => 'Your mom still asks if you\'re seeing anybody.'],
  ['sep', (L) => L.phase === 'pre' || L.phase === 'off', () => 'Summer. The phone is quieter. The gym isn\'t.'],
  ['sep2', (L) => L.phase === 'pre' || L.phase === 'off', () => 'Everybody shows up to camp in the best shape of their life. Supposedly.'],
  ['dec', (L) => L.phase === 'early', () => 'December. The road trips get long and the nights get longer.'],
  ['feb', (L) => L.phase === 'mid', () => 'February. Half the league is counting days to the break.'],
  ['apr', (L) => L.phase === 'late', () => 'April. The regular season is in the books. Now it gets real.'],
  ['rival', (L) => rivalOn(L) && nbaSeasons(L) >= 2, () => 'Somewhere, {rival} is checking your box score too.'],
];
const NARR_AM = [
  ['hs1', (L) => L.am.level === 'hs', (L) => 'You\'re ' + L.age + '. On Friday nights, half of ' + L.am.town + ' comes out.'],
  ['hs2', (L) => L.am.level === 'hs', () => 'Homework, practice, film, sleep. Then do it again.'],
  ['hs3', (L) => L.am.level === 'hs', (L) => 'The ' + (L.am.hs && L.am.hs.name || 'school') + ' gym smells like popcorn and floor wax. It feels like home.'],
  ['hsrank', (L) => L.am.level === 'hs' && L.am.rank && L.am.rank <= 100, (L) => '#' + L.am.rank + ' in the class. College coaches sit in the bleachers now.'],
  ['hsnone', (L) => L.am.level === 'hs' && (!L.am.rank || L.am.rank > 300), () => 'Nobody is ranking you yet. That\'s fine. Nobody was watching them either.'],
  ['col1', (L) => L.am.level === 'col' && L.am.cyear === 1, (L) => 'Freshman year at ' + L.am.college + '. Six a.m. lifts and a sold-out building on game night.'],
  ['col2', (L) => L.am.level === 'col' && L.am.cyear >= 2, (L) => CYEAR[L.am.cyear][0].toUpperCase() + CYEAR[L.am.cyear].slice(1) + ' year at ' + L.am.college + '. You know every shortcut on campus now.'],
  ['colscout', (L) => L.am.level === 'col' && (L.am.stock || 0) >= 70, () => 'There are NBA scouts behind the bench now. You try not to look.'],
  ['colclass', (L) => L.am.level === 'col', () => 'You have an eight a.m. class and a road game on Thursday. Something has to give.'],
];
/* THE SAME PROMPT, TOLD MORE THAN ONE WAY. A story career meets the system
   cards over and over: a Game 7, an injury report, the summer you decide
   whether to keep playing. Their answers stay exactly what they are (the
   rules read them by position), and what changes is how the game puts the
   question to you. Every version keeps the facts the original states (the
   games out, your age, the money). Seeded per card off its own stream, so a
   reload shows the same words. */
const capFirst = (x) => x ? x[0].toUpperCase() + x.slice(1) : x;
/* A LINE NOBODY HAS READ YET. fresh() picks from a list and remembers what it
   picked for that key, so a card that comes back comes back with the next
   line rather than a random draw that may be last year's again. Once every
   line has been read it starts over, never on the one it used last. A story
   career only: the memory rides on the save as L.vu. */
function fresh(L, key, n, rng) {
  const V = L.vu || (L.vu = {});
  let used = V[key] || [];
  if (used.length >= n) used = used.slice(-1);
  const open = [];
  for (let i = 0; i < n; i++) if (used.indexOf(i) < 0) open.push(i);
  const i = open.length ? open[Math.floor(rng() * open.length)] : 0;
  V[key] = used.concat(i);
  return i;
}
function freshPick(L, key, list, rng) { return list[fresh(L, key, list.length, rng)]; }
const VARY = {
  clutch: (L, c, r) => {
    const x = c.ctx || {};
    const n = nick(x.opp);
    const crowd = x.home ? freshPick(L, 'v:clutch:home', ['The home crowd\'s on its feet against the ' + n + '.', 'Your building is shaking. The ' + n + ' look rattled.', 'Twenty thousand of your fans, and the ' + n + ' in the way.', 'Towels spinning everywhere. The ' + n + ' call timeout.', 'Your arena hasn\'t sat down in ten minutes.'], r)
      : freshPick(L, 'v:clutch:road', ['A road crowd\'s trying to rattle you against the ' + n + '.', 'The ' + n + ' fans boo every touch you take.', 'Their building is so loud you can\'t hear the huddle.', 'Somebody behind the bench yells your mom\'s name.', 'Twenty thousand ' + n + ' fans want you to miss.'], r);
    const ex = (L.flags.clutchSeen || 0);
    L.flags.clutchSeen = ex + 1;
    const memo = ex === 0 ? 'Your first one of these.' : (tw(L).winners || 0) > 0 ? 'You\'ve hit one of these before.' : 'You haven\'t hit one of these yet.';
    c.title = freshPick(L, 'v:clutch:t', ['Tied, nine seconds, your ball. What\'s the play?', 'Game 7. Tie game. The ball is yours.', 'Tie game, season on the line. Your call.', 'Nine seconds. Tied. Everybody knows who gets it.', 'The season comes down to one possession', 'Timeout. Tied. The whole bench looks at you.'], r);
    c.text = crowd + ' ' + (x.look ? LOOKS[x.look].t : freshPick(L, 'v:clutch:x', ['Everybody knows who gets it.', 'The whole season comes down to this.', 'The bench is already on its feet.', memo], r));
  },
  amclutch: (L, c, r) => {
    const x = c.ctx || {}, hs = /home gym/.test(c.scene || '');
    c.title = freshPick(L, 'v:am:t', ['Tied. Six seconds. Your ball.', 'Six seconds and the ball is yours', 'Tie game. Everybody looks at you.', 'One possession for the whole season'], r);
    const crowd = hs ? freshPick(L, 'v:am:hs', ['The whole town\'s packed into the gym.', 'Your old elementary teachers are in the bleachers.', 'The student section is chanting your name.'], r)
      : freshPick(L, 'v:am:col', ['It\'s March, and every bracket in the country is watching.', 'CBS has the camera right in your face.', 'Your college band is losing its mind.'], r);
    c.text = crowd + ' ' + (x.look ? LOOKS[x.look].t : freshPick(L, 'v:am:x', ['What\'s the play?', 'The play is drawn up for you.', 'Nobody on the bench is sitting.'], r));
  },
  injury: (L, c, r) => {
    const m = /^It's a (.+)\. Now what\?$/.exec(c.title);
    if (!m) return;
    const kind = m[1], g = c.ctx.g;
    const when = L.season && L.season.w + L.season.l > 0 ? ' The ' + nick(L.team) + ' are ' + L.season.w + '-' + L.season.l + '.' : '';
    c.title = freshPick(L, 'v:inj:t', ['It\'s a ' + kind + '. Now what?', 'The scan says ' + kind + '.', capFirst(kind) + '. How do you handle it?', 'You felt it go. It\'s a ' + kind + '.', 'Bad news from the MRI'], r);
    c.text = freshPick(L, 'v:inj:x', [
      'Dr. {doctor:last} holds up the scan: "' + g + ' games, give or take. How we get there is your call."',
      '{trainer} reads you the report. About ' + g + ' games. Your body, your call.',
      'Dr. {doctor:last} says about ' + g + ' games. "Less if you\'re lucky. More if you\'re not."',
      'A ' + kind + '. ' + g + ' games, maybe.' + when,
    ], r);
  },
  retire: (L, c, r) => {
    const o = ovT(L, ovrOf(L)), T = totals(L);
    const rings = T.rings ? (T.rings === 1 ? 'One ring.' : T.rings + ' rings.') : 'No ring yet.';
    c.title = freshPick(L, 'v:ret:t', ['Is it time to hang them up?', 'One more year, or the last one?', 'Your body has been talking. Do you listen?', 'Quiet summer. Time to decide.', 'Year ' + (T.seasons + 1) + ', or the end?'], r);
    c.text = freshPick(L, 'v:ret:x', [
      'You\'re ' + L.age + '. Your overall is ' + o + '. Your knees have an opinion, and it isn\'t quiet.',
      'You\'re ' + L.age + ' and still rated ' + o + '. The game is slower. So are you, a little.',
      L.age + ' years old. Overall ' + o + '. You catch yourself thinking about mornings with no alarm.',
      T.seasons + ' seasons. ' + Math.round(T.pts).toLocaleString('en-US') + ' points. ' + rings,
    ], r);
  },
  allstar: (L, c, r) => {
    const n = L.flags.allstars || 1;
    c.title = freshPick(L, 'v:as:t', ['All-Star Saturday too. Are you in?', 'The league wants you on Saturday night too', 'Dunk contest, three-point contest or a nap?', n > 1 ? 'All-Star number ' + n + '. Saturday too?' : 'Your first All-Star weekend'], r);
    c.text = freshPick(L, 'v:as:x', ['The league wants you in a contest as well as Sunday\'s game. One event, or none.',
      'Sunday is the game. Saturday is the show. They want you in one contest, or none.',
      'Your phone has the invitation. One contest on Saturday, or a quiet night before Sunday.',
      'The ' + nick(L.team) + ' would love the publicity. Your legs would love a night off.'], r);
  },
  extension: (L, c, r) => {
    const sal = money(c.ctx.sal);
    if (c.key === 'ext') c.text = freshPick(L, 'v:ext:r', ['{gm} slides the paper across the desk: "Five years, ' + sal + ' a year. Starts next season."',
      '"Five years at ' + sal + ' a year," {gm} says. "Starts next season. I\'d like it signed today."',
      '{agent:first} calls first: "Five years at ' + sal + ' a year. We could wait for more. Or not."'], r);
    else c.text = freshPick(L, 'v:ext:v', ['{gm} wants a deal before the market opens. Four years at ' + sal + ' a year.',
      'Four years, ' + sal + ' a year, before anybody else can call. {gm} wants an answer this week.',
      '{agent:first} says the offer is fair. Four years at ' + sal + ' a year. The market might be fairer.'], r);
  },
  coach_review: (L, c, r) => {
    const m = /^(.+?) doesn't sugarcoat it\. (.+? won't cut it)\. He wants the minutes earned\.$/.exec(c.text);
    if (!m) return;
    c.title = freshPick(L, 'v:cr:t', ['Why\'d you cut my minutes?', 'Your minutes are down. You want to know why.', 'You ask the question every bench player asks', 'A closed door, and a hard question'], r);
    c.text = freshPick(L, 'v:cr:x', [c.text, m[1] + ' keeps it short. ' + m[2] + '. Earn them back.', m[2] + '. That\'s the whole explanation from ' + m[1] + '.'], r);
  },
  hs_summer: (L, c, r) => { c.title = freshPick(L, 'v:hss:t', ['Where are you spending the summer?', 'School\'s out. Where do you get better?', 'Three months off. How do you spend them?', 'The summer before ' + (GRADE[L.am && L.am.grade] || 'next') + ' year'], r); },
  declare: (L, c, r) => { c.title = freshPick(L, 'v:dec:t', ['Stay in school, or go pro?', 'The NBA, or one more year?', 'Your name, or your college\'s?', 'Draft night is calling'], r); },
  nickname: (L, c, r) => {
    const nm = c.ctx.nm;
    c.text = freshPick(L, 'v:nick:x', ['{pbp} said it once on a late call. Now the whole arena says it.', 'A fan holds up a sign that says ' + nm + '. Then a hundred do.', 'It started on a podcast. Now it\'s on T-shirts.'], r);
  },
};
/* And how a few of them end. */
const VARY_RES = {
  retire_more: ['One more year. Let\'s go.', 'One more. You start running hills on Monday.', 'You tell your family one more. Nobody is surprised.', 'One more. You book the trainer for June.'],
  inj_rest: ['You give it time. It heals right.', 'You do every boring rehab drill. It heals clean.', 'Two weeks of ice and patience. It holds.', 'Pool work and sleep. It comes back strong.'],
};
function varyRes(L, card, k, text) {
  if (!VARY_RES[k]) return text;
  return freshPick(L, 'vr:' + k, VARY_RES[k], rngAt(L, 'vres:' + card.key + ':' + (L.steps || 0)));
}
/* THE SAME QUESTION IS NOT ASKED IN THE SAME WORDS. A card that comes back
   every season (the summer, the goal, Game 7, an injury) keeps what each
   answer DOES, because the rules read the answer by its place on the card,
   and changes how it is put. The canonical label is the key; fresh() deals
   the next wording this career has not read. A story career only. */
const OPT_ALT = {
  clutch: {
    'Pull up for three': ['Pull up from deep', 'Step back for three', 'Let it fly from the wing'],
    'Drive to the rim': ['Attack the basket', 'Get downhill', 'Take it to the cup'],
    'Hit the mid-range fadeaway': ['Fade from the elbow', 'Go to your mid-range spot', 'Turn and fade baseline'],
    'Find the open man': ['Draw two and kick it', 'Find {tm:first} open', 'Trust the extra pass'],
  },
  amclutch: {
    'Pull up for three': ['Pull up from deep', 'Step back for three'],
    'Drive to the rim': ['Attack the basket', 'Get downhill'],
    'Hit the mid-range fadeaway': ['Fade from the elbow', 'Turn and fade baseline'],
    'Find the open man': ['Draw two and kick it', 'Trust the extra pass'],
  },
  allstar: {
    'Enter the dunk contest': ['Sign up for the dunk contest', 'Go for the dunk title', 'Jump over something'],
    'Enter the three-point contest': ['Shoot in the three-point contest', 'Take the money-ball racks', 'Enter the shootout'],
    'Rest your legs': ['Sit out Saturday', 'Save it for Sunday', 'Watch from courtside'],
  },
  retire: {
    'Play one more season': ['Run it back one more year', 'Give it one more go', 'Not yet. One more.'],
    Retire: ['Hang them up', 'Walk away now', 'Call it a career'],
  },
  injury: {
    'Play through it': ['Tape it and play', 'Gut it out', 'Get back out there'],
    'Take the full time off': ['Rest it properly', 'Give it the full time', 'Sit until it heals'],
    'Get the surgery now': ['Have the surgery', 'Fix it right now'],
    'Rehab it and rush back': ['Rehab and hurry back', 'Push the timeline'],
    'Fly to a specialist': ['See the best doctor alive', 'Get a second opinion'],
  },
  nickname: { 'Own it': ['Wear it proudly', 'Put it on a shirt'], 'Ask them to drop it': ['Shut it down', 'Tell them no thanks'] },
  extension: {
    'Sign the extension': ['Sign it today', 'Put pen to paper', 'Take the security'],
    'Bet on yourself': ['Wait and bet on you', 'Go for more next year'],
    'Test the market': ['See what\'s out there', 'Hit free agency'],
  },
  hs_summer: {
    'Play the shoe circuit': ['Hit the travel circuit', 'Chase the big events'],
    'See a skills trainer daily': ['Work with a skills coach', 'Daily skill sessions'],
    'Run with your high school team': ['Open gym with your guys', 'Stay and run with the team'],
    'Rest and grow': ['Rest and let your body grow', 'Sleep, eat, stretch, repeat'],
  },
  training: {
    'Live in the shooting gym': ['Shoot until your arms quit', 'Rebuild your jumper'],
    'Hit the weight room': ['Add real muscle', 'Live under a squat rack'],
    'Go to point guard school': ['Learn to run an offense', 'Study the pick and roll'],
    'Go to defensive camp': ['Learn to lock people up', 'Slide drills all summer'],
    'Rest and recover': ['Shut it down until August', 'Sleep, fish, recover'],
    'Post work with a retired big': ['Learn old man post moves', 'Footwork with an old center'],
    'Live in the film room': ['Watch three hundred hours of tape', 'Study every coverage'],
    'Box for your footwork': ['Train with a boxer', 'Jump rope and footwork'],
    'Do yoga and mobility work': ['Hot yoga, five days a week', 'Mobility and stretching'],
    'Train at altitude': ['Go up into the mountains', 'Thin air, long runs'],
    'Run pickup with pros': ['Invite-only pickup runs', 'Hoop with other pros'],
    'Go to national team camp': ['Try out for the national team', 'Camp with the best'],
    'Play Summer League again': ['Run Summer League again', 'Go to Vegas again'],
    'Train back home': ['Go home and work', 'Your old gym, your old hoop'],
    'Hire a private skills coach': ['Pay for a private coach', 'Hire an All-Star\'s trainer'],
    'Do the rehab right': ['Rehab it the boring way', 'Every rehab drill, twice'],
  },
  goal: {
    'Make the playoffs': ['Get to April', 'Play in the postseason'],
    'Make the All-Star team': ['Be an All-Star', 'Play in February\'s big game'],
    'Average 20 a night': ['Score 20 a game', 'Be a 20-point scorer'],
    'Average 30 a night': ['Score 30 a game', 'Lead the league in points'],
    'Stay healthy for 75 games': ['Play 75 games', 'Never miss a game'],
    'Win the title': ['Win the ring', 'Bring home the trophy'],
    'Win a starting job': ['Start every night', 'Be in the starting five'],
    'Win the MVP': ['Be the league\'s MVP', 'Win the big one'],
    'Win 50 games': ['Fifty wins', 'Win half a hundred'],
    'Win a playoff series': ['Get out of round one', 'Win a round in May'],
  },
  moment: {
    'Take the shot yourself': ['Take it yourself', 'Call your own number'],
    'Drive and kick it out': ['Drive and dish', 'Collapse it and kick'],
    'Step right to the line': ['Walk straight to the line', 'Shoot them right away'],
    'Let them ice you': ['Let them call timeout', 'Sit through the freeze'],
    'Rise up and dunk on him': ['Put him on a poster', 'Take off and finish'],
    'Lay it in': ['Just lay it up', 'Take the easy two'],
    'Chase him down': ['Run him down', 'Go for the chase-down'],
    'Let it go': ['Let him have it', 'Save your legs'],
  },
  tm_lost_media: {
    'Back the front office': ['Trust the front office', 'Give the company answer'],
    'Admit it hurts': ['Say you\'ll miss him', 'Be honest about it'],
    'Talk about this season': ['Change the subject', 'Talk about your team'],
  },
  tm_lost_camp: { 'Fill the hole yourself': ['Step into his role', 'Take his shots'], 'Let it sting': ['Feel it, then work', 'Carry it quietly'] },
  tm_top_seed: { 'Keep the foot down': ['Keep pushing every night', 'Chase every win'], 'Save the legs': ['Rest for April', 'Pick your nights'], 'Stay humble': ['Say nothing is won', 'Keep it quiet'] },
  tm_dl_buy: { 'Give him your shots': ['Make room for him', 'Hand him some touches'], 'Keep doing your thing': ['Change nothing', 'Stay the course'] },
  tm_race_film: { 'Take it': ['Put it on your shoulders', 'Take the ball late'] },
  tm_hot_target: { 'Love the target': ['Welcome every big night', 'Want their best shot'] },
  rival_trash: { 'Answer on the court': ['Let the scoreboard talk', 'Answer him next game'], 'Say nothing': ['Ignore him', 'Stay above it'] },
};
/* A title that comes back twice in one career is put another way. Each entry
   is the other ways to say the card's own title; a function reads the card. */
const TITLE_ALT = {
  tm_lost_media: [() => 'Cameras want your take', () => 'Media day, and one question', (L) => 'The move, on the record'],
  tm_lost_camp: [() => 'An empty locker at camp', () => 'One fewer voice in the room'],
  tm_race_film: [() => 'The stretch run starts now', () => 'The staff wants more from you'],
  tm_hot_target: [() => 'Every crowd sold out', () => 'You\'re the game everybody circles'],
  tm_top_seed: [(L) => 'The best record in the ' + confOf(L.team), () => 'Top of the standings at the break'],
  tm_dl_sell_room: [() => 'Selling at the deadline', () => 'Another teammate traded'],
  tm_dl_buy: [() => 'A deadline reinforcement', () => 'New guy at shootaround'],
  rival_trash: [() => 'Your rival has a podcast take', () => 'He\'s talking about you again', () => 'Rival, microphone, trouble'],
  nickname: [(L, c) => 'The arena chants "' + c.ctx.nm + '"', (L, c) => '"' + c.ctx.nm + '" is catching on'],
  fa: [() => 'Free agency is open', () => 'Your phone is ringing. Pick one.', () => 'Who gets your next contract?'],
  portal: [() => 'The portal is calling', () => 'Pick a new school'],
  summer_league: [() => 'A summer run in the city', () => 'Pro-am, or a quiet summer?'],
  mixtape: [() => 'You went viral', () => 'Your highlights are everywhere'],
  build_arch: [() => 'The scouting reports changed', () => 'A new kind of player?'],
  coach_talk: [() => 'A minute with the coach', () => 'Your turn in the coach\'s office'],
};
const MOMENT_SAY = {
  buzzer: [['Tied, four seconds left. Who takes it?', 'Four seconds. Tied. Your ball.', 'The play broke. The ball found you.'],
    [(o) => 'Tied with the ' + o + '. The play breaks down and the ball finds you.', (o) => 'The ' + o + ' switch everything. Four seconds, and you have it.', (o) => 'Tie game against the ' + o + '. Your number gets called.']],
  ft: [['Down one, two free throws', 'Two shots to win it', 'The line, down one'],
    [(o) => 'Fouled with two seconds left against the ' + o + '. The whole building\'s trying to get in your head.', (o) => 'Down one to the ' + o + '. Two free throws. Make both.', (o) => 'The ' + o + ' fans are waving everything they own behind the basket.']],
  poster: [['One man between you and the rim', 'A runout, and one big in the way', 'He\'s daring you'],
    [(o) => 'A runout against the ' + o + '. Their big\'s planted in the lane, daring you.', (o) => 'You beat everybody down the floor. One ' + o + ' big is waiting.', (o) => 'Open floor against the ' + o + '. Their center wants the charge.']],
  block: [['He thinks he\'s gone. Chase him?', 'A breakaway the other way', 'Four steps behind'],
    [(o) => 'A steal at the other end and a ' + o + ' guard\'s all alone. You\'re four steps behind.', (o) => 'Turnover. A ' + o + ' guard is gone. Can you catch him?', (o) => 'The ' + o + ' bench stands up for the easy two. You\'re still running.']],
  stop: [['Up one, last possession. Who guards him?', 'One stop to win it', 'Their best scorer, last possession'],
    [(o) => 'The ' + o + ' clear out a side for their best scorer. You want the assignment.', (o) => 'One stop beats the ' + o + '. Their star is calling for it.', (o) => 'The ' + o + ' run it through their best man. Who takes him?']],
  post: [['Down one. You have him on the block.', 'Last shot from the block', 'A mismatch inside'],
    [(o) => 'They feed you on the left block against the ' + o + '. His back is to the rim and so is yours.', (o) => 'You sealed a smaller ' + o + ' defender. The ball is coming.', (o) => 'The ' + o + ' switched. You have a guard on your back.']],
  lob: [['Two on one. He is looking up for you.', 'The rim is open above him', 'A lob is there'],
    [(o) => 'A runout against the ' + o + '. One defender back, and the rim is wide open above him.', (o) => 'Two on one against the ' + o + '. Your guard looks up at you.', (o) => 'The ' + o + ' defender turns his head. The lob is open.']],
  steal: [['You know this play. Jump it?', 'You saw this on film', 'The same swing pass again'],
    [(o) => 'The ' + o + ' run the same swing pass you watched on film all week.', (o) => 'You know the ' + o + ' play before they run it.', (o) => 'The ' + o + ' point guard stares down his man. Again.']],
};
VARY.moment = (L, c, r) => {
  const P = MOMENT_SAY[c.ctx && c.ctx.m];
  if (!P) return;
  const o = nick(c.ctx.opp);
  c.title = freshPick(L, 'v:mo:t:' + c.ctx.m, P[0], r);
  c.text = freshPick(L, 'v:mo:x:' + c.ctx.m, P[1], r)(o);
};
VARY.fa = (L, c, r) => {
  if (!/^Money, minutes or a ring/.test(c.text || '')) return;
  c.text = freshPick(L, 'v:fa:x', [c.text, '{agent:first} lays the offers out: money, minutes, a ring. Pick two.', 'Every offer says it wants you. Only one means it.', 'You\'re ' + L.age + '. {agent:first} says this deal decides a lot.'], r);
};
function varyTitle(L, card, r) {
  const A = TITLE_ALT[card.id];
  if (!A) return;
  const list = [() => card.title].concat(A);
  card.title = freshPick(L, 't:' + card.id, list, r)(L, card);
}
function varyOpts(L, card, r) {
  const T = OPT_ALT[card.id];
  if (!T) return;
  for (const o of card.options || []) {
    const alts = T[o.label];
    if (!alts) continue;
    /* {tm} is a real teammate: only on a story career in the league. */
    const list = [o.label].concat(alts.filter((a) => a.indexOf('{tm') < 0 || (!!L.team && !isAm(L))));
    o.label = freshPick(L, 'o:' + card.id + ':' + o.label, list, r);
  }
}
function varyCard(L, card) {
  if (card.varied) return;
  card.varied = 1;
  const r = rngAt(L, 'vary:' + card.key + ':' + (L.steps || 0));
  if (VARY[card.id]) VARY[card.id](L, card, r);
  else varyTitle(L, card, rngAt(L, 'vtit:' + card.key + ':' + (L.steps || 0)));
  varyOpts(L, card, rngAt(L, 'vopt:' + card.key + ':' + (L.steps || 0)));
}
function narrate(L, card) {
  if (!card || card.lead != null || NARR_SKIP[card.id] || NARR_SKIP[card.kind]) return;
  const n = L.narr || (L.narr = { y: 0, k: 0, u: {} });
  if (n.y !== L.year) { n.y = L.year; n.k = 0; }
  const rng = rngAt(L, 'narr:' + card.key + ':' + (L.steps || 0));
  /* The first card of a moment gets the voice more often than the ones
     stacked behind it, and a season hears it about a dozen times at most. */
  if (n.k >= 12 || rng() > (L.pending[0] === card && L.pending.length === 1 ? 0.75 : 0.45)) { card.lead = ''; return; }
  const list = isAm(L) ? (L.am ? NARR_AM : []) : NARR_NBA;
  const open = list.filter(([id, ok]) => { const u = n.u[id]; if (u != null && L.year - u < NARR_GAP) return false; try { return !!ok(L); } catch (e) { return false; } });
  if (!open.length) { card.lead = ''; return; }
  const [id, , line] = open[Math.floor(rng() * open.length)];
  n.u[id] = L.year; n.k++;
  card.lead = line(L);
}

// ─── continuity ─────────────────────────────────────────────────────────────

/* THE STORY HAS TO HAPPEN IN ORDER. These are the rules a reader would notice
   broken: a card about a game after the season ended, a partner named while
   you are single, an Olympics in a year with none, a wedding before an
   engagement. The simulator runs them over every card of every career and
   fails on any hit (NARRATIVE.md: continuity scan failures, 0). They read
   state only and change nothing. */
const IN_GAME = { court: 1, locker: 1 };
const PARTNER_EVENTS = { propose: 1, wedding: 1, baby: 1, breakup: 1 };
const LIFE_CYCLE = { meet_someone: 1, propose: 1, wedding: 1, baby: 1 };
function continuity(L, card) {
  const out = [];
  const ev = card && evById(card.id);
  if (!ev || card.kind !== 'event' || ev.pool === 'post') return out;
  if (ev.pool === 'arc') {
    if (ev.stage === 'nba' && isAm(L)) out.push(card.id + ' is an NBA arc dealt before the NBA');
    if (ev.stage === 'am' && !isAm(L)) out.push(card.id + ' is a school arc dealt in the NBA');
    return out;
  }
  const slot = String(card.key || '').split(':')[0];
  if ((slot === 'late' || slot === 'off' || slot === 'pre') && ev.tags.some((t) => IN_GAME[t]) && card.id !== 'young_star' && card.id !== 'playoff_eve')
    out.push(card.id + ' is about the regular season and was dealt in ' + slot);
  if (PARTNER_EVENTS[card.id] && lifeOf(L).rel === 'single') out.push(card.id + ' names a partner while single');
  if (card.id === 'olympics' && L.year % 4 !== 0) out.push('olympics in ' + L.year);
  if (ev.pool === 'nba' && isAm(L)) out.push(card.id + ' is an NBA card dealt before the NBA');
  if (ev.pool === 'am' && !isAm(L)) out.push(card.id + ' is a school card dealt in the NBA');
  if (ev.pool === 'am' && /^col/.test(slot) && L.am && L.am.level !== 'col') out.push(card.id + ' is a college card dealt in high school');
  if (ev.pool === 'nba' && !L.team && ev.tags.some((t) => IN_GAME[t] || t === 'coach')) out.push(card.id + ' needs a club and there is none');
  return out;
}
/* The order a life is logged in: met, then engaged, then married, and a
   child only once married. A new person starts the chain again. */
function continuityLog(L) {
  const out = [];
  let y = -Infinity, met = false, engaged = false, married = false;
  for (const e of L.log) {
    if (e.y < y) out.push('the log goes back in time at ' + e.y);
    y = Math.max(y, e.y);
    if (/^Met /.test(e.t)) { met = true; engaged = false; }
    else if (/^Engaged to /.test(e.t)) { if (!met) out.push('engaged before meeting anybody'); engaged = true; met = false; }
    else if (/^Married /.test(e.t)) { if (!engaged) out.push('married without an engagement'); married = true; engaged = false; }
    else if (/^Became a parent|^Welcomed kid/.test(e.t) && !married) out.push('a child before a wedding');
  }
  for (const k in L.mem || {}) if (L.mem[k].y > L.year) out.push('memory ' + k + ' is from the future');
  return out;
}

// ─── the story engine: people, memory, callbacks, arcs ───────────────────────

/* THE PERSON LEDGER. Every invented person a story career deals with is kept:
   who they are to you, the year you met, a meter from -100 to 100 and the
   last few things that happened between you. Real people are never in it:
   a real coach is the trust meter and nothing else. */
const ROLE_OF = {
  agent: 'Agent', newagent: 'Agent', gm: 'General manager', owner: 'Owner', tm: 'Teammate', tm2: 'Teammate', tvet: 'Teammate',
  trook: 'Teammate', tco: 'Teammate', rival: 'Draft-class rival', partner: 'Partner', mom: 'Mom', dad: 'Dad', cousin: 'Cousin',
  friend: 'Friend from home', beat: 'Beat writer', critic: 'TV critic', trainer: 'Trainer', hscoach: 'High school coach',
  roommate: 'College roommate', foe: 'Nemesis', oldvet: 'Old teammate', campkid: 'Kid from your camp', shoeexec: 'Shoe executive', fan: 'Superfan',
  sonny: 'Agent', maya: 'Agent', dre: 'Rival from camp', aau: 'AAU coach', ellis: 'Streetball legend', lazlo: 'Owner', father: 'Dad',
  rookie2: 'Teammate', costar: 'Co-star', bookie: 'Bookie',
};
function meet(L, tok, name) {
  const n = name || peopleKey(L, tok);
  if (!n || !ROLE_OF[tok]) return null;
  const id = tok + ':' + n;
  const P = L.people || (L.people = {});
  if (!P[id]) P[id] = { role: ROLE_OF[tok], n, met: L.year, rel: 0, notes: [] };
  return P[id];
}
function relate(L, tok, d, note, name) {

  const p = meet(L, tok, name);
  if (!p) return null;
  p.rel = clamp(p.rel + d, -100, 100);
  if (note) { p.notes.push([L.year, say(L, note)]); if (p.notes.length > 5) p.notes.shift(); }
  return p;
}
/* Your closest teammate, past or present: the invented teammate you have the
   most with, if it is anything at all. */
function bestMate(L) {
  let b = null;
  for (const id in L.people || {}) { const p = L.people[id]; if (p.role === 'Teammate' && p.rel >= 40 && (!b || p.rel > b.rel)) b = p; }
  return b;
}
const relOf = (L, tok) => { const n = peopleKey(L, tok); const p = L.people && L.people[tok + ':' + n]; return p ? p.rel : 0; };
/* What each answer does to the people in it, as data: [token, change, note]. */
const EVENT_REL = {
  vet_mentor: [[['tvet', 25, 'He showed you the ropes.']], [['tvet', 10]], [['tvet', -10]]],
  rookie_duty: [[['tvet', 15, 'You bought the breakfasts.']], [['tvet', -5]], [['tvet', -20, 'You refused rookie duty.']]],
  night_out: [[['tm', 12]], [['tm', 4]], [['tm', -4]]],
  teammate_touches: [[['tco', 20, 'You fed him.']], [['tco', 10]], [['tco', -20, 'You froze him out.']]],
  teammate_fight: [[['tm', -15, 'You shoved back.']], [['tm', 5]], [['tm', 10]]],
  online_beef: [[['critic', -10]], [], [['beat', 5]]],
  family_money: [[['cousin', 15]], [['cousin', 5], ['mom', 10]], [['cousin', -25, 'You said no.']]],
  investment: [[['friend', 15, 'You went all in on his idea.']], [['friend', 5]], [['friend', -5]]],
  coach_bench: [[], [], [['agent', 5], ['gm', -15, 'You asked for a trade.']]],
  stuck: [[], [['gm', -10], ['beat', 10]], []],
  tank: [[['gm', 10]], [['gm', -10]], [['gm', -20, 'You asked out of the tank.']]],
  trade_rumor: [[['gm', 10]], [['gm', -10]], []],
  contract_year: [[['agent', 10]], [['gm', 10]], []],
  podcast: [[['beat', -5], ['critic', 10]], [['gm', 5], ['agent', -8]]],
  shoe_deal: [[['agent', 10]], [['agent', 15], ['shoeexec', 20, 'You signed for your own shoe.']], [['agent', -25, 'You turned down two shoe deals.']]],
  local_ad: [[['agent', 5]], [['agent', -10, 'You passed on his commercial.']]],
  docuseries: [[['mom', 10], ['agent', 5]], [['agent', 5]], [['tm', 5], ['agent', -12, 'You turned down the documentary.']]],
  agent_pitch: [[['agent', -40, 'You left for a power agency.']], [['agent', 30, 'You stayed loyal.']]],
  propose: [[], [['partner', -10]]],
  wedding: [[['partner', 20, 'The wedding of the year.']], [['partner', 25, 'A small wedding on a beach.']]],
  baby: [[['partner', 15], ['mom', 15]], [['partner', -5]]],
  hometown_call: [[['mom', 20, 'You came home.'], ['hscoach', 20]], []],
  mentor_rookie: [[['trook', 25, 'You took him under your wing.']], [['trook', -5]]],
  young_star: [[['trook', 25, 'You mentored him.']], [['trook', -10]], [['gm', -10]]],
  rehab_summer: [[], [['trainer', 10]]],
  charity: [[['hscoach', 20, 'You paid for the new gym.']], [['hscoach', 10]], []],
  roommate: [[['roommate', 20]], [['roommate', 30, 'Best friends by October.']], [['roommate', -15]]],
  grades: [[['mom', 5]], [], []],
  coach_son: [[], [], [['dad', 10], ['hscoach', -20, 'Your dad yelled in the parking lot.']]],
  playoff_eve: [[], []],
  exit_interview: [[['gm', 10]], [['gm', -5]], [['gm', -15], ['beat', 5]]],
};
/* The names are read BEFORE the answer runs, because the answer can change
   who a token means (a new agent, a new club), and the card was about the
   people on it when it was dealt. */
function relNames(L, id, i) {
  const t = EVENT_REL[id] && EVENT_REL[id][i];
  if (!t) return null;
  return t.map(([tok, d, note]) => [tok, d, note, peopleKey(L, tok)]);
}
function applyRel(L, names) {
  if (names) for (const [tok, d, note, n] of names) relate(L, tok, d, note, n);
}

/* MEMORY and CALLBACKS. remember() stamps the year; a callback is a short
   line keyed by what is remembered, and it says how long ago in words, so a
   story can point back at itself ("Two seasons ago you beat {foe}"). A
   callback is never said about the year it happened in: it is a memory only
   once it is behind you. */
function ago(L, y) {
  const d = L.year - y;
  if (d <= 0) return 'this season';
  if (d === 1) return 'last season';
  if (d <= 4) return wordNum(d).toLowerCase() + ' seasons ago';
  return 'back in ' + (y - 1) + '-' + String(y).slice(2);
}
const sw = (a) => a ? ', ' + a : '';
const CALLBACKS = {
  'arc.feud.won': (a) => 'You beat {foe} when it counted' + sw(a) + '.',
  'arc.feud.lost': (a) => '{foe} got the better of you' + sw(a) + '.',
  'arc.feud.peace': (a) => 'You and {foe} buried it' + sw(a) + '.',
  'arc.feud.respect': (a) => 'You won the game {foe} made personal' + sw(a) + '.',
  'arc.gym.mentor': () => 'A kid from your gym plays college ball. You still call him.',
  'arc.gym.fan': () => 'A kid from your gym plays college ball in your shoes.',
  'arc.venture.won': (a) => 'The business you backed paid off' + sw(a) + '.',
  'arc.venture.lost': (a) => 'The business you backed closed' + sw(a) + '.',
  'arc.venture.out': (a) => 'You pulled out of a friend\'s business' + sw(a) + '.',
  'arc.promise.kept': (a) => 'You promised a big summer' + sw(a) + '. You delivered.',
  'arc.promise.broken': (a) => 'You promised a big summer' + sw(a) + '. It never came.',
  'arc.prep.won': () => 'You beat {prepstar} again in college.',
  'arc.prep.peace': () => 'You and {prepstar} shook hands in college.',
  'arc.prep.lost': () => '{prepstar} got you back in college.',
  'arc.mentor.video': () => '{oldvet} plays your video before his games.',
  'arc.mentor.visit': () => '{oldvet} still has the photo from his gym.',
  'po.stopper': (a) => 'You took the toughest playoff assignment' + sw(a) + '.',
  'blamed.system': (a) => 'You blamed the system in an exit interview' + sw(a) + '.',
  'g7.made': () => 'You hit a Game 7 winner.',
  'hometown.played': () => 'You came home to play.',
};
function callback(L, key) {
  const m = recall(L, key), f = CALLBACKS[key];
  if (!m || !f || m.y >= L.year) return '';
  return say(L, f(ago(L, m.y)));
}
/* Memories worth printing, oldest first, each with its year. */
function memories(L) {
  const out = [];
  for (const k in L.mem || {}) if (CALLBACKS[k]) out.push({ k, y: L.mem[k].y, t: say(L, CALLBACKS[k]('')) });
  return out.sort((a, b) => a.y - b.y);
}

/* ARCS. An arc is a run of cards with a setup, an escalation and a payoff,
   and it ends in one of at least two resolutions. A node is dealt in a named
   slot no earlier than a named year, ahead of anything random, and an arc
   left unfinished for four years (an overseas year, a retirement) is let go.
   The resolution is remembered as `arc.<id>.<how>`, which is what the
   callbacks read. */
function arcData(L, id) { return (L.arcs && L.arcs[id] && L.arcs[id].d) || {}; }
/* An arc happens once in a career. Starting one that already ran answers
   false, and the caller tells the plain version of its story instead. */
function arcStart(L, id, node, slot, dy, d) {

  const A = L.arcs || (L.arcs = {});
  if (A[id]) return false;
  A[id] = { node, slot, y: L.year + dy, d: d || {}, at: L.year };
  return true;
}
function arcGo(L, id, node, slot, dy) {
  const a = L.arcs && L.arcs[id];
  if (!a) return;
  a.node = node; a.slot = slot; a.y = L.year + dy;
}
function arcEnd(L, id, how) {
  const a = L.arcs && L.arcs[id];
  if (!a) return;
  a.done = how; a.node = null;
  remember(L, 'arc.' + id + '.' + how, true);
}
function dueArcs(L, slot) {
  const out = [];
  for (const id in L.arcs || {}) {
    const a = L.arcs[id];
    if (a.done || !a.node) continue;
    if (L.year - a.y > 4) { a.done = 'faded'; a.node = null; continue; }
    if (a.slot !== slot || L.year < a.y) continue;
    const ev = ARC_EVENTS[a.node];
    if (ev && reqOk(L, ev.req) && ev.when(L)) out.push(a.node);
  }
  return out;
}

// ─── character: hidden traits, the build, the people around you ──────────────

/* HIDDEN TRAITS (NARRATIVE.md section 2) are rolled at birth and do their work
   on a story career whether or not you know them. A trait is REVEALED when
   play touches it, and only then does the card show it, with the reason in
   one line. A migrated save rolls traits too, and they do nothing there,
   because acting on them would replay its career differently. */
const trait = (L, k) => (hasTrait(L, k));
const TRAIT_NAME = {
  clutch: 'Clutch', coachable: 'Coachable', injuryProne: 'Injury prone', lateBloomer: 'Late bloomer', lockerVoice: 'Locker room voice',
  gymRat: 'Gym rat', hothead: 'Hothead', bigStage: 'Big stage', ironMan: 'Iron man', filmJunkie: 'Film junkie',
  spender: 'Big spender', saver: 'Saver', showman: 'Showman', loyal: 'Loyal', mercenary: 'Mercenary',
};
function reveal(L, k, why, beats) {
  const t = L.traits && L.traits[k];
  if (!t || !t.has || t.known) return false;
  t.known = L.year; t.why = why;
  const line = 'Revealed: ' + TRAIT_NAME[k] + '. ' + why;
  logIt(L, line, 'gold');
  if (beats) beats.push({ kind: 'trait', text: line, tone: 'gold', trait: k });
  return true;
}
const tw = (L) => L.tw || (L.tw = {});
const clutchBonus = (L) => trait(L, 'clutch') ? 0.05 : 0;
const hotTax = (L) => trait(L, 'hothead') ? 0.15 : 0;
/* A shot that won a game, from any door: the regular season, a moment, a
   Game 7, a tournament. Two of them and a clutch player knows it. */
function clutchHit(L, beats) {

  const n = tw(L).winners = (tw(L).winners || 0) + 1;
  if (n >= 2) reveal(L, 'clutch', 'Two game winners already.', beats);
}
/* The answers that go looking for a fight. */
const HOT_PICKS = { ref_heat: 0, heckler: 0, teammate_fight: 0, arc_feud_2: 0, online_beef: 0 };
const SPEND_PICKS = { wedding: 0, body_care: 0, charity: 0, investment: 0, family_money: 0 };
function watchPick(L, id, i, beats) {

  if (SPEND_PICKS[id] === i) watchMark(L, 'spend', beats);
  if (HOT_PICKS[id] === i) watchMark(L, 'hot', beats);
}
/* A second take names what its answer says about you on the answer itself
   (`watch`), because the tables above are indexed by the card as written. */
function watchMark(L, kind, beats) {
  if (kind === 'spend') tw(L).spent = (tw(L).spent || 0) + 1;
  if (kind === 'hot') { const n = tw(L).hot = (tw(L).hot || 0) + 1; if (n >= 2) reveal(L, 'hothead', 'Two blowups. People have noticed.', beats); }
}
/* Season-level reveals, read when a season closes. */
function traitSeason(L, beats) {

  const s = L.season, T = tw(L);
  if (!s) return;
  if (s.out <= 2 && s.gp >= 60) T.iron = (T.iron || 0) + 1;
  if (T.iron >= 3) reveal(L, 'ironMan', 'Three seasons without missing real time.', beats);
  if (s.po && (s.po.champ || (s.po.results || []).length >= 3)) reveal(L, 'bigStage', 'You play bigger in May.', beats);
  if (L.m.trust >= 75) reveal(L, 'coachable', 'Every staff you\'ve had trusts you.', beats);
  if (L.m.fame >= 70) reveal(L, 'showman', 'The cameras find you. You find them back.', beats);
  if (L.rt.iq >= 78) reveal(L, 'filmJunkie', 'You know every play before the call.', beats);
  if (L.cash >= 25) reveal(L, 'saver', 'You still have most of what you made.', beats);
  if ((T.spent || 0) >= 3) reveal(L, 'spender', 'The money comes in. The money goes out.', beats);
  const clubs = new Set(L.history.map((h) => h.t)).size;
  if (L.history.length >= 6 && clubs === 1) reveal(L, 'loyal', 'Six seasons, one jersey.', beats);
  if (clubs >= 3) reveal(L, 'mercenary', 'Three jerseys. You go where it pays.', beats);
  const mates = Object.values(L.people || {}).filter((p) => p.role === 'Teammate' && p.rel >= 20).length;
  if (mates >= 3) reveal(L, 'lockerVoice', 'Three teammates would run through a wall for you.', beats);
}

/* SKILL BADGES are read off what you are, at the end of each season, and
   kept once earned. Each needs a rating, and some need the season to show it. */
const BADGES = [
  ['deadeye', 'Deadeye', (L) => L.rt.sho >= 85],
  ['floorgen', 'Floor general', (L) => L.rt.pla >= 85],
  ['lockdown', 'Lockdown', (L) => L.rt.def >= 85],
  ['glass', 'Glass cleaner', (L) => L.rt.reb >= 85],
  ['finisher', 'Finisher', (L) => L.rt.fin >= 85],
  ['flight', 'Highlight factory', (L) => L.rt.ath >= 88],
  ['brain', 'Coach on the floor', (L) => L.rt.iq >= 85],
  ['bucket', 'Walking bucket', (L, pg) => pg && pg.pts >= 25],
  ['dimes', 'Dime dropper', (L, pg) => pg && pg.ast >= 9],
  ['boards', 'Board man', (L, pg) => pg && pg.reb >= 11],
];
function badgeSeason(L, beats) {

  const pg = L.season && L.season.gp >= 40 ? perGame(L.season) : null;
  const B = L.badges || (L.badges = {});
  for (const [k, name, test] of BADGES) if (!B[k] && test(L, pg)) {
    B[k] = L.year;
    logIt(L, 'Earned a badge: ' + name + '.', 'good');
    if (beats) beats.push({ kind: 'badge', text: 'New badge: ' + name + '.', tone: 'good' });
  }
}
const badgeList = (L) => BADGES.filter(([k]) => L.badges && L.badges[k]).map(([k, n]) => ({ k, name: n, y: L.badges[k] }));

/* THE BUILD CHANGES. Three summer cards, each at most once in a while: the
   game you play has become another archetype, your coach wants you at the
   next position over, and you pick a signature move. None is forced. */
const SIGS = {
  sho: ['Step-back three', 'The step-back. Nobody\'s found a counter.'],
  fin: ['Euro step', 'Two steps, two directions. Defenders guess wrong every time.'],
  pla: ['No-look pass', 'You look one way. The ball goes the other.'],
  def: ['Chase-down block', 'From behind, pinned on the glass. It\'s your best highlight.'],
  reb: ['Putback slam', 'Every miss is a chance. You live on the glass.'],
  ath: ['Baseline reverse', 'Under the rim and up the other side. Crowd loses it.'],
  iq: ['Pump fake', 'One fake. They bite every time.'],
};
function archFit(L, k) {
  const r = L.rt, mean = RATINGS.reduce((a, x) => a + r[x], 0) / RATINGS.length, t = ARCHES[k].tilt;
  let f = 0;
  for (const x in t) f += t[x] * (r[x] - mean);
  return f;
}
const NEXT_POS = { PG: ['SG'], SG: ['PG', 'SF'], SF: ['SG', 'PF'], PF: ['SF', 'C'], C: ['PF'] };
function buildCards(L) {
  if (!L.team || L.retired) return;
  const F = L.flags, top = RATINGS.slice().sort((a, b) => L.rt[b] - L.rt[a]);
  if (!L.sig && L.age >= 23 && ovrOf(L) >= 74) {
    const ks = top.slice(0, 3);
    L.pending.push({ id: 'build_sig', kind: 'event', key: 'sig:' + L.year, scene: 'The practice gym', eyebrow: calendar(L, 'off'), title: 'What\'s your signature move?',
      text: 'Every great one has a move the whole league knows. Time to pick yours.', ctx: { ks }, options: ks.map((k) => ({ label: SIGS[k][0], hint: RATING_NAME[k] + ' ' + ovT(L, L.rt[k]) + '.' })) });
    return;
  }
  const pool = ARCHES[L.arch].pos ? archesFor(L.pos) : ARCH_KEYS;
  const best = pool.slice().sort((a, b) => archFit(L, b) - archFit(L, a))[0];
  if (best !== L.arch && L.age >= 24 && archFit(L, best) - archFit(L, L.arch) >= 45 && L.year - (F.archAsk || 0) >= 4) {
    F.archAsk = L.year;
    L.pending.push({ id: 'build_arch', kind: 'event', key: 'arch:' + L.year, scene: 'The film room', eyebrow: calendar(L, 'off'), title: 'Is your game changing?',
      text: 'The scouting reports have started calling you a ' + ARCHES[best].name.toLowerCase() + '. Do you agree?', ctx: { to: best },
      options: [{ label: 'Lean into it', hint: ARCHES[best].blurb }, { label: 'Stay a ' + ARCHES[L.arch].name.toLowerCase(), hint: ARCHES[L.arch].blurb }] });
    return;
  }
  const alt = NEXT_POS[L.pos].map((p) => [p, overall(L.rt, p) - ovrOf(L)]).sort((a, b) => b[1] - a[1])[0];
  if (alt && alt[1] >= 2 && L.age >= 24 && L.year - (F.posAsk || 0) >= 4) {
    F.posAsk = L.year;
    L.pending.push({ id: 'build_pos', kind: 'event', key: 'pos:' + L.year, scene: 'The film room', eyebrow: calendar(L, 'off'), title: '{coach} wants to try you at ' + POS_NAME[alt[0]].toLowerCase() + '.',
      text: 'On paper you\'re ' + alt[1] + ' better there. It\'s a new spot on the floor.', ctx: { to: alt[0] },
      options: [{ label: 'Move to ' + alt[0], hint: 'Overall ' + ovT(L, overall(L.rt, alt[0])) + ' there' }, { label: 'Stay at ' + L.pos, hint: 'It\'s your position' }] });
  }
}
/* The answers to the build cards (choose() runs them). */
ANSWER.build_sig = ANSWER.build_arch = ANSWER.build_pos = function(L, card, i, opt, rng, beats, touch, touches) {
  let text = '', tone = '', made = null, won = null, shots = null, contest = null;
  text = chooseBuild(L, card, i) || ''; tone = 'good';
  return { text, tone, made, won, shots, contest };
};
function chooseBuild(L, card, i) {
  if (card.id === 'build_sig') { const k = card.ctx.ks[i]; L.sig = { k, name: SIGS[k][0], y: L.year }; logIt(L, 'Signature move: ' + SIGS[k][0] + '.', 'gold'); bump(L, { fame: 3 }); return SIGS[k][1]; }
  if (card.id === 'build_arch') { if (i === 0) { const was = ARCHES[L.arch].name; L.arch = card.ctx.to; logIt(L, 'From ' + was.toLowerCase() + ' to ' + ARCHES[L.arch].name.toLowerCase() + '.', 'good'); return 'New reports, new role. You\'re a ' + ARCHES[L.arch].name.toLowerCase() + ' now.'; } bump(L, { morale: 2 }); return 'You know who you are. Let them write what they want.'; }
  if (card.id === 'build_pos') { if (i === 0) { L.arch = archForPos(L, card.ctx.to); L.pos = card.ctx.to; logIt(L, 'Moved to ' + POS_NAME[L.pos].toLowerCase() + '.', 'good'); bump(L, { trust: 4 }); return 'New spot on the floor. It fits better than you thought.'; } bump(L, { trust: -2 }); return 'He lets it go. For now.'; }
  return null;
}
/* A signature move pays on the shot it is. */
const sigBonus = (L, k) => L.sig && L.sig.k === k ? 0.03 : 0;

// ─── the world: a living league, goals, legacy and the media ─────────────────

/* THE LIVING LEAGUE. A story career shares the league with a handful of
   invented stars who rise, peak, win things and retire on their own clocks.
   They are who wins the MVP when you do not, who beats you to the ring, and
   who the debate shows argue about. Invented on purpose: a real player's
   future is not ours to write. Real clubs, real coaches and real rosters
   stay exactly as they are. */
const ORD_WORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];
const OUTLETS = ['Hardwood Wire', 'The Daily Dribble', 'Baseline Radio', 'Court Report', 'The Arena Sheet'];
function figRng(L, tag) { return E.createSeededRNG(E.hashSeed(String(L.seed) + ':fig:' + tag)); }
function figOvr(f, year) {
  const a = year - f.b;
  const up = a <= 27 ? f.peak - (27 - a) * 2.4 : a <= 30 ? f.peak : f.peak - (a - 30) * 1.9;
  return Math.round(clamp(up, 60, 99));
}
function figName(L, rng) {
  for (let i = 0; i < 30; i++) {
    const n = pick(rng, RIVAL_FIRST) + ' ' + pick(rng, PEOPLE_LAST);
    if ((!L.rival || L.rival.name !== n) && !(L.league.figs || []).some((f) => f.n === n) && n !== L.name) return n;
  }
  return 'Jalen Starling';
}
function figs(L) {

  const G = L.league;
  if (!G.figs) {
    G.figs = [];
    const rng = figRng(L, 'seed');
    for (let i = 0; i < 9; i++) {
      const age = 20 + Math.floor(rng() * 12);
      G.figs.push({ n: figName(L, rng), b: L.year - age, peak: Math.round(86 + rng() * 10), pos: pick(rng, POS), club: pick(rng, CLUBS), mvp: 0, rings: 0, gone: 0 });
    }
  }
  return G.figs;
}
const activeFigs = (L) => figs(L).filter((f) => !f.gone);
/* A summer in the league: the stars age, some move, the old ones retire and a
   rookie arrives on the worst club. Read in the summer the age changes. */
function figYear(L) {
  /* The league office runs the real league; the invented stars stand still. */
  if (fo(L)) return;
  const rng = figRng(L, 'y' + L.year);
  for (const f of activeFigs(L)) {
    const a = L.year - f.b;
    if (a >= 34 + Math.floor(rng() * 4) || (a >= 29 && figOvr(f, L.year) < 74)) { f.gone = L.year; feed(L, 'retire', f.n + ' retires after ' + (a - 19) + ' seasons.', null, L.year - 1); continue; }
    if (rng() < 0.12 && figOvr(f, L.year) >= 84) { const to = pick(rng, CLUBS.filter((c) => c !== f.club && c !== L.team)); feed(L, 'move', f.n + ' signs with the ' + E.teamName(to) + '.', null, L.year - 1); f.club = to; }
  }
  const worst = CLUBS.slice().sort((a, b) => clubNet(L, a) - clubNet(L, b))[0];
  const kid = { n: figName(L, rng), b: L.year - 19, peak: Math.round(84 + rng() * 12), pos: pick(rng, POS), club: worst, mvp: 0, rings: 0, gone: 0 };
  figs(L).push(kid);
  feed(L, 'draft', 'The ' + nick(worst) + ' draft ' + kid.n + ' with a top pick.', null, L.year - 1);
}
/* The MVP race, as it stands at the All-Star break. You are in it when your
   season says so. */
function mvpRace(L) {
  const rng = figRng(L, 'race' + L.year);
  /* Voters tire of the same winner, so a run of MVPs is hard to keep. */
  let out = activeFigs(L).map((f) => ({ n: f.n, club: f.club, sc: figOvr(f, L.year) + clubNet(L, f.club) * 0.5 + norm(rng) * 2.6
    - (f.won || []).filter((y) => L.year - y <= 4).length * 2.4 }));
  /* With the league office the race is the league's real best players, on
     the rosters as they stand, and the invented stars sit it out. */
  const R = fo(L) && rostNow(L);
  if (R) {
    const won = fo(L).mvps || {};
    out = [];
    for (const c of CLUBS) for (const e of R[c]) if (e.c >= 78) out.push({ n: e.n, club: c, sc: e.c + clubNet(L, c) * 0.5 + norm(rng) * 2.6 - (won[e.n] || []).filter((y) => L.year - y <= 4).length * 2.4 });
  }
  const s = L.season;
  if (s && s.gp >= 20 && !isAm(L)) {
    const pg = perGame(s);
    out.push({ n: L.name, club: L.team, you: true, sc: effOvr(L) + (pg.pts - 24) * 0.35 + (s.w - s.l) * 0.06 });
  }
  return out.sort((a, b) => b.sc - a.sc).slice(0, 5).map((x, i) => Object.assign(x, { rank: i + 1 }));
}
/* Who won what when you did not. Called once, as the regular season ends. */
function leagueAwards(L, mine) {

  const race = mvpRace(L).filter((x) => !x.you);
  if (mine.indexOf('mvp') < 0 && race.length && fo(L) && rostOf(L)) {
    const M = fo(L).mvps || (fo(L).mvps = {}), w = M[race[0].n] || (M[race[0].n] = []);
    w.push(L.year);
    feed(L, 'award', race[0].n + ' wins the MVP.' + (w.length > 1 ? ' His ' + (ORD_WORD[w.length] || ordinal(w.length)) + '.' : ''));
  } else if (mine.indexOf('mvp') < 0 && race.length) {
    const f = activeFigs(L).find((x) => x.n === race[0].n);
    if (f) { f.mvp++; (f.won = f.won || []).push(L.year); feed(L, 'award', f.n + ' wins the MVP.' + (f.mvp > 1 ? ' His ' + (ORD_WORD[f.mvp] || ordinal(f.mvp)) + '.' : '')); }
  }
  if (L.season) L.season.mvp = mine.indexOf('mvp') >= 0 ? L.name : race.length ? race[0].n : '';
}
/* The champion, every season, and the dynasties they become. */
function leagueChamp(L, beats) {
  if (!L.season || !L.team) return;
  const s = L.season, po = s.po || {};
  let club;
  const bk = bracketOf(L);
  if (bk) po.bk = bk;
  if (po.champ) club = L.team;
  else {
    const fin = (po.results || []).find((r) => r.round === 3);
    if (fin) club = fin.opp;
    else if (bk && bk.champ) club = bk.champ;
    else {
      const rng = figRng(L, 'champ' + L.year);
      club = weighted(rng, CLUBS.filter((c) => c !== L.team), (c) => Math.exp(clubNet(L, c) * 0.45));
    }
  }
  const G = L.league, C2 = G.champs || (G.champs = {});
  C2[s.year] = club;
  for (const f of activeFigs(L)) if (f.club === club) f.rings++;
  if (club !== L.team) feed(L, 'champ', 'The ' + E.teamName(club) + ' win the title.');
  const last = [0, 1, 2, 3].map((d) => C2[s.year - d]);
  const run = last.filter((c) => c === club).length;
  if ((last[1] === club && run >= 2) || run >= 3) {
    const dyn = G.dyn || (G.dyn = {});
    if (!dyn[club] || s.year - dyn[club] > 3) {
      dyn[club] = s.year;
      const span = last.lastIndexOf(club) + 1;
      const line = run === 2 && span === 2 ? (club === L.team ? 'Back to back. ' : 'The ' + nick(club) + ' go back to back. ') + 'Dynasty talk starts.'
        : (club === L.team ? 'Your ' : 'The ') + nick(club) + ': ' + wordNum(run).toLowerCase() + ' titles in ' + wordNum(span).toLowerCase() + ' years. A dynasty.';
      feed(L, 'dynasty', line);
      if (club === L.team) { logIt(L, line, 'gold'); if (beats) beats.push({ kind: 'dynasty', text: line, tone: 'gold' }); }
    }
  }
}
/* League news, now and then, each at most once. A thing announced for a
   later year arrives in that year. */
const LEAGUE_NEWS = [
  ['cup', () => 'The league adds a midseason cup. Prize money for every player on the winner.'],
  ['line', () => 'The league votes to move the three-point line back a foot.'],
  ['commish', (L) => 'A new commissioner takes over: ' + peopleKey(L, 'commish') + '.'],
  ['expand', (L) => 'Two expansion clubs are coming in ' + (L.year + 3) + '.', 3, 'The two expansion clubs play their first games.'],
  ['tv', () => 'A new TV deal. Every club is richer by the fall.'],
  ['ban', () => 'A betting scandal on another club. Two players are banned for life.'],
];
function leagueNews(L) {
  const G = L.league, done = G.news || (G.news = {});
  for (const [id, , dy, later] of LEAGUE_NEWS) if (done[id] && dy && done[id] + dy === L.year) feed(L, 'league', later, null, L.year - 1);
  const rng = figRng(L, 'news' + L.year);
  if (rng() > 0.25) return;
  const open = LEAGUE_NEWS.filter((x) => !done[x[0]]);
  if (!open.length) return;
  const x = pick(rng, open);
  done[x[0]] = L.year;
  feed(L, 'league', x[1](L), null, L.year - 1);
}
function leagueSummer(L) {

  figYear(L);
  leagueNews(L);
}

/* THE FEED: what the outlets say about you and the league, newest last. One
   headline a step at most from the beats, so it reads like a front page and
   not a transcript. */
function feed(L, kind, t, src, y) {

  const F = L.feed || (L.feed = []);
  F.push({ y: y || L.year, k: kind, t: say(L, t), s: src || OUTLETS[(F.length * 7 + L.year) % OUTLETS.length] });
  if (F.length > 80) F.shift();
}
const HEAD = {
  award: (b) => b.award === 'mvp' ? '{name} is your MVP.' : b.award === 'star' ? null : '{name}: ' + b.text.replace(/\.$/, '') + '.',
  champ: (b) => '{name} and the {club} win it all.',
  trade: (b) => { if (b.back) return null; const m = /Traded to the (.+?)\./.exec(b.text); return m ? '{name} is traded to the ' + m[1] + '.' : null; },
  trait: (b) => b.trait ? '{name} has a reputation now: ' + TRAIT_NAME[b.trait].toLowerCase() + '.' : null,
  badge: () => null,
  milestone: (b) => '{name} reaches ' + b.text.replace(/^([0-9,]+) career/, '$1 career').toLowerCase(),
  dynasty: (b) => b.text,
  finals_loss: () => '{name} comes up short in the Finals.',
  retire: () => '{name} retires.',
};
/* A trade made by a card or a step becomes one beat, with where you came
   from, where you are going, who went the other way and when it happened,
   so the scene can tell you the way it would really reach you. */
function tradeBeat(L, beats, how) {
  const t = TRADED;
  TRADED = null;
  if (!t || !beats || beats.some((b) => b.kind === 'trade')) return;
  const ph = L.phase;
  const when = ph === 'off' || ph === 'pre' || ph === 'drafted' ? 'summer' : ph === 'mid' || ph === 'early' ? 'deadline' : 'season';
  beats.push(Object.assign({ kind: 'trade', text: 'Traded to the ' + E.teamName(t.to) + '.', tone: 'gold', from: t.from, to: t.to, back: t.back, how: how || '', when }, tradePeople(L, t.from)));
}
/* Who tells you, for the scene: the general manager who traded you, the one
   who traded for you, your agent, whoever is home with you, and the oldest
   head in the locker room you are leaving. All of them invented. */
function tradePeople(L, from) {
  const f = L.life || {}, paired = f.rel && f.rel !== 'single';
  return {
    oldgm: personName(L, 'gm:' + from), newgm: say(L, '{gm}'), agent: say(L, '{agent}'),
    fam: paired ? say(L, '{partner}') : say(L, '{mom}'), famRole: paired ? (f.rel === 'married' ? 'family' : 'partner') : 'mom',
    kids: f.kids || 0, oldmate: from ? lockerOf(L, from)[0].n : '',
  };
}
function headlines(L, beats) {
  if (!beats || !beats.length) return;
  for (const b of beats) {
    const f = HEAD[b.kind];
    const t = f && f(b);
    if (t) { feed(L, b.kind, t.replace(/\{name\}/g, L.name).replace(/\{club\}/g, L.team ? nick(L.team) : '')); return; }
  }
}
/* The debate show at the All-Star break: two invented hosts, one question
   about you, and they never agree. */
function debate(L) {
  if (isAm(L) || L.m.fame < 40 || !L.season) return;
  const o = ovrOf(L), s = L.season, pg = perGame(s), rng = figRng(L, 'debate' + L.year);
  /* Every other season at most, unless something big happened. */
  if (L.flags.debated === L.year - 1 && !s.allstar) return;
  L.flags.debated = L.year;
  const race = s.race || [], me = race.find((x) => x.you);
  const q = me && me.rank <= 2 ? 'Is ' + L.name + ' the MVP?' : o >= 85 ? 'Is ' + L.name + ' a top ten player?'
    : s.allstar ? 'Did ' + L.name + ' deserve the All-Star nod?' : L.contract && L.contract.salary > capFor(L.year) * 0.2 ? 'Is ' + L.name + ' worth the money?' : 'Is ' + L.name + ' for real?';
  const hot = pick(rng, [pg.pts >= 20 ? pg.pts + ' a night. Yes.' : 'Watch the film. Yes.', 'He wins games. Yes.', 'I have seen enough. Yes.']);
  const cold = pick(rng, [s.w < s.l ? 'His team is ' + s.w + '-' + s.l + '. No.' : 'Ask me in May. No.', 'Show me a playoff run. No.', 'Not yet. No.']);
  feed(L, 'debate', q + ' ' + CAST.ellis + ': "' + hot + '" ' + CAST.critic + ': "' + cold + '"', 'Hot Take Hour');
}
/* NICKNAMES come from the broadcast, off something you have shown. */
const NICKS = { clutch: 'Iceman', ironMan: 'Ironman', showman: 'Showtime', hothead: 'The Fuse', deadeye: 'Splash', lockdown: 'The Wall', glass: 'Glass', flight: 'Skywalker', brain: 'The Professor', floorgen: 'The Conductor', bigStage: 'Mr. May' };
function nicknameCard(L) {
  if (L.nick || L.m.fame < 45 || L.year - (L.flags.nickAsk || -9) < 3 || isAm(L)) return;
  const known = TRAITS.filter((k) => L.traits[k] && L.traits[k].known && NICKS[k]).concat(Object.keys(L.badges || {}).filter((k) => NICKS[k]));
  if (!known.length) return;
  const nm = NICKS[known[0]];
  L.flags.nickAsk = L.year;
  L.pending.push({ id: 'nickname', kind: 'event', key: 'nick:' + L.year, scene: 'The broadcast', eyebrow: calendar(L, 'off'), title: 'They\'re calling you "' + nm + '" now',
    text: '{pbp} said it once on a late call. Now the whole arena says it.', ctx: { nm },
    options: [{ label: 'Own it', hint: 'Stitch it on your shoes' }, { label: 'Ask them to drop it', hint: 'You\'ve got a name already' }] });
}
/* The answers to a nickname (choose() runs them). */
ANSWER.nickname = function(L, card, i, opt, rng, beats, touch, touches) {
  let text = '', tone = '', made = null, won = null, shots = null, contest = null;
  if (i === 0) { L.nick = card.ctx.nm; logIt(L, 'They call you ' + L.nick + '.', 'gold'); feed(L, 'nick', L.name + ' has a name now: ' + L.nick + '.'); text = 'It sticks. By summer, kids at camp are calling you it.'; tone = 'gold'; }
  else { text = 'They mostly drop it.'; }
  return { text, tone, made, won, shots, contest };
};

/* GOALS. Before each season a story career picks one thing to chase, from
   three that fit where it is. Met or missed, it is said at the end. */
const lastH = (L) => L.history[L.history.length - 1];
const wonSeries = (s) => !!(s.po && (s.po.results || []).some((r) => r.won));
const GOALS = {
  playoffs: ['Make the playoffs', (L, s) => !!(s.po && (s.po.results || []).length), (L) => clubNet(L, L.team) < 2],
  star: ['Make the All-Star team', (L, s) => !!s.allstar, (L) => ovrOf(L) >= 78],
  twenty: ['Average 20 a night', (L, s) => perGame(s).pts >= 20, (L) => { const h = lastH(L); return !!h && h.pts >= 14 && h.pts < 20; }],
  thirty: ['Average 30 a night', (L, s) => perGame(s).pts >= 30, (L) => { const h = lastH(L); return !!h && h.pts >= 24; }],
  healthy: ['Stay healthy for 75 games', (L, s) => s.gp >= 75, (L) => L.age >= 28],
  ring: ['Win the title', (L, s) => !!(s.po && s.po.champ), (L) => clubNet(L, L.team) >= 2],
  start: ['Win a starting job', (L, s) => !!(s.role && s.role.starter), (L) => { const h = lastH(L); return !!h && (h.role === 'Rotation' || h.role === 'End of bench' || h.role === 'Sixth man'); }],
  mvp: ['Win the MVP', (L, s) => s.awards.indexOf('mvp') >= 0, (L) => ovrOf(L) >= 89],
  defense: ['Make an All-Defense team', (L, s) => s.awards.some((a) => a === 'ad1' || a === 'ad2' || a === 'dpoy'), (L) => L.rt.def >= 84],
  boards: ['Average 10 rebounds', (L, s) => perGame(s).reb >= 10, (L) => { const h = lastH(L); return !!h && h.reb >= 7 && h.reb < 10; }],
  dimes: ['Average 8 assists', (L, s) => perGame(s).ast >= 8, (L) => { const h = lastH(L); return !!h && h.ast >= 5.5 && h.ast < 8; }],
  blocks: ['Average two blocks a night', (L, s) => perGame(s).blk >= 2, (L) => { const h = lastH(L); return !!h && h.blk >= 1.2 && h.blk < 2; }],
  fifty: ['Shoot 50 percent from the field', (L, s) => perGame(s).fgp >= 50 && s.gp >= 40, (L) => { const h = lastH(L); return !!h && h.fgp >= 45 && h.fgp < 50; }],
  wins50: ['Win 50 games', (L, s) => s.w >= 50, (L) => { const n = clubNet(L, L.team); return n >= -1 && n < 5; }],
  series: ['Win a playoff series', (L, s) => wonSeries(s), (L) => { const h = lastH(L); return !!h && (h.po === 'R1' || h.po === 'Play-in') && clubNet(L, L.team) >= -1; }],
  allnba: ['Make an All-NBA team', (L, s) => s.awards.some((a) => a === 'an1' || a === 'an2' || a === 'an3'), (L) => ovrOf(L) >= 84 && ovrOf(L) < 92],
  sixth: ['Win Sixth Man of the Year', (L, s) => s.awards.indexOf('6moy') >= 0, (L) => { const h = lastH(L); return !!h && (h.role === 'Sixth man' || h.role === 'Rotation') && h.pts >= 11 && ovrOf(L) < 84; }],
  mip: ['Win Most Improved', (L, s) => s.awards.indexOf('mip') >= 0, (L) => { const h = lastH(L); return L.age <= 25 && !!h && h.pts <= 16 && h.gp >= 50; }],
};
/* The second line under each goal: what chasing it really means. */
const GOAL_HINT = {
  playoffs: 'Drag this team to April', star: 'Get the league to notice', twenty: 'Become a real scorer',
  thirty: 'Go get buckets, every night', healthy: 'Take care of your body', ring: 'Nothing else counts',
  start: 'Take somebody\'s job', mvp: 'Best player in the world', defense: 'Make them hate you',
  boards: 'Own the glass', dimes: 'Make everybody better', blocks: 'Close the paint',
  fifty: 'Only good shots', wins50: 'Team first', series: 'Get past round one',
  allnba: 'Join the elite', sixth: 'Own the second unit', mip: 'Show the jump',
};
/* Who asks. The question was the same voice every September; now it comes
   from whoever would be asking that year, and they remember in April. A
   person is not asked two Septembers running. */
const GOAL_ASK = {
  gm: [['What\'s the goal this year?', '{gm} wants one number from you', 'Your GM wants a promise', 'One goal, on {gm}\'s desk'],
    ['{gm} leans back: "Give me one thing. I\'m holding you to it in April."', '{gm} has a legal pad out. "One goal. Write it down."', '"Tell me what this year is," {gm} says. "Then go do it."', '{gm} taps the whiteboard: "Your name goes up there. With a goal."'], (L) => !!L.team],
  agent: [['A bonus clause needs filling in', '{agent:first} has a bonus clause', 'The bonus is yours to name', 'What\'s the incentive this year?'],
    ['{agent} slides the contract over: "Hit this and the next deal gets easier."', '"Pick the clause," {agent:first} says. "I\'ll sell it to them."', '{agent:first} calls from an airport: "One incentive. Make it one you hit."'], (L) => !!L.contract && L.contract.years <= 2],
  beat: [['Going on the record?', '{beat} wants a quote for Sunday', 'A goal, in print', 'The preseason interview'],
    ['{beat} has the recorder out: "One goal. It runs in Sunday\'s paper."', '{beat} asks the question every reader wants answered.', '"What would make this year a success?" {beat} asks. The recorder blinks.'], (L) => L.m.fame >= 30],
  trainer: [['WHY?', 'The whiteboard question', '{trainer:first} wants a reason', 'One word on the board'],
    ['{trainer} writes one word on the whiteboard and waits for your answer.', '{trainer} won\'t start the workout until you say it.', 'Six in the morning. {trainer:first} asks what all this is for.'], () => true],
  mom: [['What\'s this year about, baby?', 'Your mom has a question', 'Sunday dinner, and a question', 'Mom wants to know the plan'],
    ['Your mom asks over Sunday dinner. She\'ll ask again in April.', 'Your mom puts the fork down. "So what\'s this year for?"', 'Your mom calls, like every Sunday. This time she wants a goal.'], () => true],
  self: [['One goal on the mirror', 'A note to yourself', 'Nobody has to know', 'Your phone\'s lock screen'],
    ['Nobody else will see it. You will, every single morning.', 'You write it on tape and stick it on the mirror.', 'You set it as your lock screen. You\'ll see it fifty times a day.'], () => true],
};
const BACK_SAY = {
  met: ['Last year you said {g}. You did.', 'Last year: {g}. Done.', 'You hit last year\'s: {g}.'],
  miss: ['Last year you said {g}. You didn\'t.', 'Last year: {g}. Not even close.', 'Last year\'s goal is still on the wall: {g}.'],
};
function goalCard(L) {
  if (!L.team || !L.season || L.season.goal) return;
  const fit = Object.keys(GOALS).filter((k) => GOALS[k][2](L));
  if (fit.length < 2) return;
  const rng = figRng(L, 'goal' + L.year);
  const prev = (L.goals || []).length ? L.goals[L.goals.length - 1] : null;
  /* Last year's goal is offered again only if it was missed: a goal you hit
     is a goal you have outgrown. */
  const ks = fit.filter((k) => !(prev && prev.met && prev.k === k)).sort(() => rng() - 0.5).slice(0, 3);
  if (ks.length < 2) return;
  const whos = Object.keys(GOAL_ASK).filter((w) => GOAL_ASK[w][2](L) && !(prev && prev.who === w));
  const who = pick(figRng(L, 'goalwho' + L.year), whos);
  const A = GOAL_ASK[who], r = rngAt(L, 'gsay:' + L.year);
  /* Last April is part of the question, and it is named. */
  let back = '';
  if (prev && prev.y === L.year - 1 && GOALS[prev.k]) {
    const g = GOALS[prev.k][0][0].toLowerCase() + GOALS[prev.k][0].slice(1);
    back = ' ' + freshPick(L, 'gb:' + (prev.met ? 'met' : 'miss'), BACK_SAY[prev.met ? 'met' : 'miss'], r).replace('{g}', g);
  }
  let text = freshPick(L, 'gx:' + who, A[1], r);
  if (words(text) + words(back) > 22) back = prev.met ? ' You hit last year\'s.' : ' You missed last year\'s.';
  L.pending.push({ id: 'goal', kind: 'event', key: 'goal:' + L.year, scene: who === 'self' ? 'Home' : who === 'gm' ? 'GM\'s office' : who === 'agent' ? 'Agent\'s office' : who === 'beat' ? 'Media day' : who === 'trainer' ? 'The weight room' : 'Sunday dinner', eyebrow: calendar(L, 'pre'), title: freshPick(L, 'gt:' + who, A[0], r),
    text: text + back, ctx: { ks, who }, options: ks.map((k) => ({ label: GOALS[k][0], hint: GOAL_HINT[k] })) });
}
/* The answers to the season's goal (choose() runs them). */
ANSWER.goal = function(L, card, i, opt, rng, beats, touch, touches) {
  let text = '', tone = '', made = null, won = null, shots = null, contest = null;
  L.season.goal = card.ctx.ks[i]; L.season.goalWho = card.ctx.who || null; text = pick(rng, ['Locked in. April will tell.', 'You said it out loud. No taking it back.', 'It\'s written down. Now go get it.']);
  return { text, tone, made, won, shots, contest };
};
const GOAL_SAID = {
  gm: ['{gm} brings it up at the exit meeting, grinning.', '{gm} brings it up at the exit meeting. He isn\'t grinning.'],
  agent: ['{agent} cashes the bonus clause that same week.', '{agent} says the bonus can wait a year.'],
  beat: ['{beat} runs a follow-up: he said it, he did it.', '{beat} runs a follow-up. It isn\'t kind.'],
  trainer: ['{trainer} erases WHY and writes NEXT.', '{trainer} leaves WHY on the board all summer.'],
  mom: ['Your mom clipped the newspaper.', 'Your mom says there\'s always next year.'],
  self: ['You leave it on the mirror one more week.', 'You wipe the mirror clean.'],
};
function goalSeason(L, beats) {
  const s = L.season;
  if (!s || !s.goal) return;
  const g = GOALS[s.goal], met = g[1](L, s);
  const G = L.goals || (L.goals = []);
  const who = s.goalWho || null;
  G.push({ y: s.year, k: s.goal, met, who });
  const said = who && GOAL_SAID[who] ? ' ' + GOAL_SAID[who][met ? 0 : 1] : '';
  const t = (met ? 'Goal met: ' : 'Goal missed: ') + g[0][0].toLowerCase() + g[0].slice(1) + '.' + said;
  logIt(L, t, met ? 'good' : 'bad');
  beats.push({ kind: 'goal', text: t, tone: met ? 'good' : 'bad' });
  bump(L, met ? { morale: 6, fame: 2 } : { morale: -3 });
  if (who && who !== 'self') relate(L, who, met ? 6 : -3, met ? 'You hit the goal you told them.' : null);
}

/* LEGACY, read live: the rung you are on, the next one and how far, a Hall of
   Fame chance and the records coming up. */
function legacyView(L) {
  const T = totals(L), sc = legacyScore(T);
  const i = VERDICTS.findIndex((v) => sc >= v[0]);
  const next = i > 0 ? VERDICTS[i - 1] : null;
  const hof = Math.round(100 / (1 + Math.exp(-(sc - 55) / 8)));
  const watch = [];
  for (const [k, steps, word] of MILESTONES) { const m = steps.find((x) => T[k] < x); if (m && T[k] >= m * 0.6) watch.push({ k, m, left: m - T[k], word }); }
  return { score: Math.round(sc), rung: VERDICTS[i][1], next: next ? { name: next[1], need: Math.ceil(next[0] - sc) } : null, hof, watch };
}
