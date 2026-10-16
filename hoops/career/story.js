// ─── Phase D: routes, storylines, outcomes ──────────────────────────────────

/* An event here is written as data and compiled into the same shape as the
   rest of the catalog. An option is
     { l: label, fx: bump, s: what the screen says, set: memory key(s),
       rel: [[token, change, note]], start/go/end: arc moves, p: odds,
       no: the branch when the odds miss, do: anything else, log: a log line }
   `rel` is read into EVENT_REL, so the people on a card are named before the
   answer runs, the same as every other card. */
const legendOpen = (L) => rngAt(L, 'legend')() < LEGEND_P;
const O = (l, fx, s, more) => Object.assign({ l, fx, s }, more || {});
const STORY_EV = {}, STORY_NBA = {}, STORY_AM = {};
const ALT_NAME = { intl: 'Overseas year', gl: 'G League year', juco: 'Junior college', prep: 'Prep school year', gap: 'Gap year', rec: 'Rec league year' };
const AM_SLOTS = { hs: 1, hs_sum: 1, hs_off: 1, col: 1, col_pre: 1, col_mar: 1, col_off: 1, alt: 1 };
function runOpt(L, r, o) {
  let b = o;
  if (o.p != null && !ok(r, typeof o.p === 'function' ? o.p(L) : o.p)) {
    b = o.no || {};
    if (b.rel) for (const x of b.rel) relate(L, x[0], x[1], x[2]);
  }
  if (b.fx) bump(L, typeof b.fx === 'function' ? b.fx(L) : b.fx);
  for (const k of [].concat(b.set || [])) remember(L, k, true);
  if (b.start) arcStart.apply(null, [L].concat(b.start));
  if (b.go) arcGo.apply(null, [L].concat(b.go));
  if (b.end) arcEnd.apply(null, [L].concat(b.end));
  const t = b.do ? b.do(L, r) : null;
  if (b.log) logIt(L, typeof b.log === 'function' ? b.log(L) : b.log, b.tone || 'good');
  return t || (typeof b.s === 'function' ? b.s(L) : b.s) || '';
}
function compileStory(id, sp, kind) {
  const phases = String(sp.at).split(' ');
  const am = phases.every((p) => AM_SLOTS[p]);
  const ev = {
    phases, req: sp.req || {}, when: sp.when, weight: (sp.w == null ? 2 : sp.w) * (sp.legend ? LEGEND_W : 1),
    rarity: sp.rar || 'common', once: true, legend: !!sp.legend, tags: sp.tags ? sp.tags.split(' ') : [],
    stage: am ? 'am' : phases[0] === 'post' ? 'post' : 'nba', cb: sp.cb, authored: true,
    title: sp.t, text: typeof sp.x === 'function' ? sp.x : () => sp.x, tag: sp.tag,
    options: sp.o.map((o) => ({ label: o.l, hint: o.sub, run: (L, r) => runOpt(L, r, o) })),
  };
  EVENT_REL[id] = sp.o.map((o) => o.rel || []);
  return ev;
}
/* Random pool: dealt in its slots like any other card. */
function story(specs) {
  const pool = {};
  for (const id in specs) pool[id] = compileStory(id, specs[id]);
  defineEvents(pool, 'story');
  for (const id in pool) {
    const ev = pool[id];
    ev.pool = ev.stage === 'am' ? 'am' : 'nba';
    STORY_EV[id] = ev;
    if (ev.stage === 'am') STORY_AM[id] = ev; else if (ev.stage === 'nba') STORY_NBA[id] = ev;
  }
}
/* Arc nodes: dealt only when their arc is due, ahead of anything random. */
function storyArcs(specs) {
  const pool = {};
  for (const id in specs) { pool[id] = compileStory(id, specs[id]); pool[id].req = specs[id].req || null; }
  defineEvents(pool, 'arc');
  for (const id in pool) ARC_EVENTS[id] = pool[id];
}
/* Fixed cards: dealt by name at one moment (an epilogue, the halftime shot). */
function storyFixed(specs) {
  const pool = {};
  for (const id in specs) pool[id] = compileStory(id, specs[id]);
  defineEvents(pool, 'story');
  for (const id in pool) { pool[id].pool = 'post'; STORY_EV[id] = pool[id]; }
}
const evById = (id) => EVENTS[id] || AM_EVENTS[id] || ARC_EVENTS[id] || STORY_EV[id] || TEAM_EV[id];
/* Deal one named card now, if it is open. */
function dealNamed(L, slot, id) {
  const ev = evById(id);
  if (!ev) return false;
  dealCard(L, slot, ev);
  (evSeen(L)[id] = evSeen(L)[id] || []).push(L.year);
  return true;
}

// ─── your club, and how the career answers it ───────────────────────────────

/* THE CAREER ANSWERS WHAT YOUR CLUB DOES. The league office moves men every
   summer and every February, and until now a teammate could be traded away,
   a star could arrive at your position and a club could start a rebuild
   without the career noticing. So the office writes down what happened to
   your club (teamNote), and the next card slot deals one card about it,
   ahead of anything random, the way a due arc is.
   What it can write down:
     summer (dealt at camp)  a teammate gone, a star arrived, a lottery pick at
                             your spot, the club turning to a rebuild or going all in
     deadline (February)     your club bought, or sold
     the season itself       a hot or cold December, a play-in race or the top
                             seed at the break
   The real names in these cards are the trade, the signing and the draft, which
   is basketball. Everybody who talks is invented: {gm}, {tvet}, {beat}.
   Each situation has two or three cards and the one dealt is the one this
   career has seen least, so a second rebuild does not read like the first.
   A story career only: nothing here is written or dealt on a migrated save. */
function teamNote(L, it) {

  const q = L.flags.tw = (L.flags.tw || []).filter((x) => x.y >= L.year - 1);
  q.push(it);
}
/* After the summer: compare your club with the club you had. */
function teamSummerWatch(L, R, Y, was, news) {
  const t = L.team, h = L.history[L.history.length - 1], now = R[t] || [];
  const here = new Set(now.map((e) => e.n)), had = new Set(was.map((e) => e.n));
  const whereIs = (n) => { for (const c of CLUBS) if (R[c].some((e) => e.n === n)) return c; return null; };
  /* A teammate gone. Only if he was one: a club you just joined lost nobody of yours. */
  if (h && h.t === t) {
    const gone = was.filter((e) => !here.has(e.n) && show(e.c) >= 80).sort((a, b) => b.c - a.c)[0];
    if (gone) {
      const to = whereIs(gone.n);
      const tr = news.find((x) => x.k === 'trade' && x.m && x.m.indexOf(gone.n) >= 0);
      teamNote(L, { y: Y, ph: 'pre', t, k: to ? 'lost' : 'lost_retire', how: to ? (tr ? 'trade' : 'fa') : 'retire', n: gone.n, to, pos: gone.pos, p: show(gone.c) - 70 });
    }
  }
  const news1 = now.filter((e) => !had.has(e.n));
  const star = news1.filter((e) => !e.pk && show(e.c) >= 83).sort((a, b) => b.c - a.c)[0];
  if (star) {
    const tr = news.find((x) => x.m && x.m.indexOf(star.n) >= 0);
    teamNote(L, { y: Y, ph: 'pre', t, k: 'star', n: star.n, c: star.c, pos: star.pos, how: tr && tr.k === 'trade' ? 'trade' : 'fa', p: show(star.c) - 66 });
  }
  const near = [L.pos].concat(NEXT_POS[L.pos] || []);
  const rook = news1.filter((e) => e.pk && e.d === Y && near.indexOf(e.pos) >= 0)
    .map((e) => ({ e, p: +String(e.pk).split('#')[1] || 99 })).filter((x) => x.p <= 12).sort((a, b) => a.p - b.p)[0];
  if (rook) teamNote(L, { y: Y, ph: 'pre', t, k: 'rook', n: rook.e.n, pk: rook.p, same: rook.e.pos === L.pos, p: 14 - rook.p * 0.5 });
}
/* What the club is doing, read at camp against last camp. */
function teamModeWatch(L) {
  const t = L.team, m = clubModes(L)[t], prev = L.flags.twMode;
  L.flags.twMode = { y: L.year, t, m };
  if (!prev || prev.t !== t || prev.y !== L.year - 1 || prev.m === m) return null;
  if (m === 'rebuild' && L.age >= 25) return { y: L.year, ph: 'pre', t, k: 'rebuild', p: 4 };
  if (m === 'win' && prev.m !== 'win') return { y: L.year, ph: 'pre', t, k: 'allin', p: 3 };
  return null;
}
/* Where the club stands in its conference right now, best first. */
function confRank(L) {
  const t = L.team, conf = CONF[confOf(t)];
  return conf.slice().sort((a, b) => winPct(L, b) - winPct(L, a)).indexOf(t) + 1;
}
/* What the season itself says, when the office said nothing. Each of these
   comes round at most every other year, so it reads as a moment. */
function teamSeasonWatch(L, phase) {
  const s = L.season, t = L.team;
  if (!s || !s.g || rngAt(L, 'twsea:' + phase)() >= 0.65) return null;
  const seen = (k) => TEAM_KINDS[k].some((id) => { const h = (L.evlog || {})[id]; return h && h.length && L.year - h[h.length - 1] < 2; });
  const pct = s.w / s.g;
  if (phase === 'early') {
    if (pct >= 0.68 && !seen('hot')) return { k: 'hot' };
    if (pct <= 0.33 && !seen('cold')) return { k: 'cold' };
  }
  if (phase === 'mid') {
    const r = confRank(L);
    if (r === 1 && !seen('top')) return { k: 'top', rank: r };
    if (r >= 7 && r <= 11 && !seen('race')) return { k: 'race', rank: r };
  }
  return null;
}
/* The card for this slot, if your club gave the career something to answer. */
function teamDue(L, phase) {
  if (L.stage !== 'nba' || !L.team) return null;
  const t = L.team;
  const q = (L.flags.tw || []).filter((x) => x.y === L.year && x.ph === phase && x.t === t).sort((a, b) => b.p - a.p);
  let it = q[0] || null;
  if (phase === 'pre') { const m = teamModeWatch(L); if (!it && m) it = m; }
  if (!it) it = teamSeasonWatch(L, phase);
  L.flags.tw = (L.flags.tw || []).filter((x) => !(x.y === L.year && x.ph === phase));
  if (!it) return null;
  const ids = TEAM_KINDS[it.k];
  const r = rngAt(L, 'tw:' + phase);
  const n = (id) => ((L.evlog || {})[id] || []).length;
  const low = Math.min.apply(null, ids.map(n));
  const pickIds = ids.filter((id) => n(id) === low);
  L.flags.twNow = Object.assign({ y: L.year }, it);
  return pickIds[Math.floor(r() * pickIds.length)];
}
const twNow = (L) => L.flags.twNow || {};
const twClub = (L) => nick(L.team);
const twRec = (L) => L.season ? L.season.w + '-' + L.season.l : '';
const TEAM_EV = {};
const TEAM_KINDS = {
  lost: ['tm_lost_camp', 'tm_lost_media'],
  lost_retire: ['tm_retire_locker'],
  star: ['tm_star_practice', 'tm_star_presser'],
  rook: ['tm_rook_camp', 'tm_rook_drill'],
  rebuild: ['tm_rebuild_office', 'tm_rebuild_media'],
  allin: ['tm_allin_office'],
  dl_buy: ['tm_dl_buy'],
  dl_sell: ['tm_dl_sell_room', 'tm_dl_sell_phone'],
  hot: ['tm_hot_start', 'tm_hot_target'],
  cold: ['tm_cold_room', 'tm_cold_meeting'],
  top: ['tm_top_seed'],
  race: ['tm_race_meeting', 'tm_race_film'],
};
const lostHow = (L) => { const x = twNow(L); return x.how === 'trade' ? 'was traded to the ' + nick(x.to) : 'signed with the ' + nick(x.to); };
const starClash = (L) => twNow(L).pos === L.pos;
(function () {
  const pool = {
    /* A teammate gone. */
    tm_lost_camp: { at: 'pre', tag: 'Training camp',
      t: (L) => twNow(L).n + ' is gone',
      x: (L) => twNow(L).n + ' ' + lostHow(L) + ' this summer. His locker is empty at camp.',
      o: [O('Ask {gm} what the plan is', null, '', { sub: 'Get an answer', rel: [['gm', 3, 'You asked about the summer.']],
        do: (L) => { bump(L, { trust: 2 }); return clubModes(L)[L.team] === 'rebuild' ? 'He says the future matters more. You hear what he means.' : 'He says the pieces fit better now. You believe about half of it.'; } }),
      O('Fill the hole yourself', { usage: 0.02, morale: 2, trust: 2 }, "You tell the room you've got it. The ball finds you more.", { sub: 'More on your plate' }),
      O('Let it sting', { morale: -3, eth: 3 }, 'You were close. You go to work instead.', { sub: 'Say nothing' })] },
    tm_lost_media: { at: 'pre', tag: 'Media day',
      t: () => 'Asked about the move',
      x: (L) => '{beat} wants your reaction. ' + twNow(L).n + ' ' + lostHow(L) + '. The cameras are rolling.',
      o: [O('Back the front office', { trust: 4 }, '{gm} watches the clip twice. He likes it.', { sub: 'Company line', rel: [['gm', 6, 'You backed the summer on camera.']] }),
        O('Admit it hurts', { fame: 2, morale: -1 }, 'Honest answer. It runs on every show that night.', { sub: 'Say the true thing', rel: [['beat', 5, 'You gave him a real answer.']] }),
        O('Talk about this season', { eth: 2 }, 'You steer it back to basketball. {beat} gets nothing.', { sub: 'Move on', rel: [['beat', -3]] })] },
    tm_retire_locker: { at: 'pre', tag: 'The locker room',
      t: (L) => 'Camp without ' + twNow(L).n,
      x: (L) => twNow(L).n + ' retired this summer. The room needs a new voice.',
      o: [O('Be that voice', { trust: 5, eth: 2, morale: -1 }, 'You talk first at the first meeting. Nobody laughs.', { sub: 'Lead', p: (L) => 0.35 + L.m.trust / 200,
        no: { fx: { trust: -2 }, s: 'You try. It comes out stiff. {tvet} picks it up.' } }),
        O('Let {tvet} lead', { morale: 2 }, '{tvet} has done this before. You learn how.', { sub: 'Watch and learn', rel: [['tvet', 6, 'You let him run the room.']] }),
        O('Lead with your play', { usage: 0.01, eth: 2 }, 'You say nothing and score twenty in the scrimmage.', { sub: 'No speeches' })] },
    /* A star arrives. */
    tm_star_practice: { at: 'pre', tag: 'First practice',
      t: (L) => twNow(L).n + ' is your teammate',
      x: (L) => 'The ' + twClub(L) + ' ' + (twNow(L).how === 'trade' ? 'traded for ' : 'signed ') + twNow(L).n + '. ' + (starClash(L) ? 'He plays your spot.' : 'Two stars. One ball.'),
      o: [O('Hand him the keys', { usage: -0.03, win: 0.6, trust: 3 }, 'You let him run it. The offense hums. Your shots dip.', { sub: 'Defer' }),
        O('Make it your team', null, '', { sub: 'Claim the ball',
          do: (L) => { if (ovrOf(L) >= (twNow(L).c || 0) - 1) { bump(L, { usage: 0.02, fame: 2 }); return 'You take the last shot in every drill. He gets the message.'; } bump(L, { morale: -4, win: -0.3, min: -1 }); return "It gets awkward by October. {tvet} has to step in."; } }),
        O('Work out together', { win: 0.4, morale: 2 }, 'Three weeks in the gym. You already know where he wants it.', { sub: 'Build it early' })] },
    tm_star_presser: { at: 'pre', tag: 'The introduction',
      t: () => 'Whose team is it?',
      x: (L) => twNow(L).n + ' is introduced in a ' + twClub(L) + ' jersey. The first question is about you.',
      o: [O('Say it is his team', { fame: -1, win: 0.4, trust: 3 }, 'Humble. The fans eat it up. So does the locker room.', { sub: 'Make him welcome' }),
        O('Say it is ours', { win: 0.3, trust: 2, morale: 1 }, 'The right answer. {beat} still writes "two alphas."', { sub: 'Split it' }),
        O('Say nothing changes', { fame: 2, usage: 0.01 }, 'It reads as a shot across the bow. Talk radio loves it.', { sub: 'Hold your ground', rel: [['beat', 3]] })] },
    /* A lottery pick at your position. He is invented: the draft after today's is ours. */
    tm_rook_camp: { at: 'pre', tag: 'Training camp',
      t: (L) => 'The kid is here',
      x: (L) => 'The ' + twClub(L) + ' took ' + twNow(L).n + ' ' + ordinal(twNow(L).pk) + ' overall. ' + (twNow(L).same ? 'He plays your position.' : 'He plays next to you, or instead of you.'),
      o: [O('Take him under your wing', { trust: 4, morale: 2 }, "He follows you to every workout. He's good. Really good.", { sub: 'Mentor him', set: 'mentored.rookie' }),
        O('Make him earn it', { eth: 3, min: 1 }, 'You win every drill at camp. He notices. So does the staff.', { sub: 'Raise the bar' }),
        O('Ask {gm} about your role', null, '', { sub: 'Straight question', rel: [['gm', -3, 'You asked if the kid has your job.']],
          do: (L) => { bump(L, { trust: -2 }); return L.contract && L.contract.years <= 1 ? 'He says the kid is the future. You hear the rest.' : 'He says you start. For now.'; } })] },
    tm_rook_drill: { at: 'pre', tag: 'One on one',
      t: (L) => twNow(L).n + ' wants you',
      x: (L) => 'The ' + ordinal(twNow(L).pk) + ' pick asks to guard you in the last drill of camp. Everybody stops to watch.',
      o: [O('Cook him', null, '', { sub: 'Welcome to the league', p: (L) => 0.55 + (ovrOf(L) - 70) * 0.02,
        fx: { fame: 1, morale: 3, trust: 2 }, s: 'Three straight buckets. The bench loses it. He asks for more.',
        no: { fx: { morale: -4, fame: 1 }, s: 'He gets two stops. The clip is on his agent\'s page by dinner.' } }),
        O('Teach him something', { trust: 3, eth: 2 }, 'You stop the drill and show him the footwork. The coaches love it.', { sub: 'Slow it down', set: 'mentored.rookie' }),
        O('Pass', { morale: -1 }, "You say you're saving it for the season. The room hears something else.", { sub: 'Not today' })] },
    /* The club turns. */
    tm_rebuild_office: { at: 'pre', tag: "{gm}'s office",
      t: () => 'The rebuild is official',
      x: (L) => 'The ' + twClub(L) + ' are going young. {gm} wants to know if you are in.',
      o: [O('Commit to the build', { trust: 6, morale: -2, eth: 2 }, 'He shakes your hand. The kids are yours to raise.', { sub: 'Be the culture', set: 'rebuild.stayed', rel: [['gm', 8, 'You stayed for the rebuild.']] }),
        O('Ask to be moved', null, '', { sub: 'Win somewhere else', rel: [['gm', -10, 'You asked out of the rebuild.']],
          do: (L) => { L.flags.tradeAsk = true; bump(L, { trust: -8, fame: 2 }); return 'He nods slowly. Word leaks by the weekend.'; } }),
        O('Ask for a timeline', { trust: 1 }, "He says two years. You've heard that before.", { sub: 'Hear him out' })] },
    tm_rebuild_media: { at: 'pre', tag: 'Media day',
      t: () => 'Are you part of the future?',
      x: (L) => 'The ' + twClub(L) + ' sold off this summer. {beat} asks if you are next.',
      o: [O('I want to be here', { trust: 4, fame: 1 }, 'The fans love it. {gm} sends a text: appreciate that.', { sub: 'Loyal', rel: [['gm', 5, 'You said you wanted to stay.']] }),
        O("That's above my pay grade", { eth: 1 }, 'A shrug. It reads like a man keeping his options open.', { sub: 'Shrug' }),
        O('I want to win', null, '', { sub: 'Say it out loud', rel: [['gm', -6, 'You said you want to win, on camera.']],
          do: (L) => { bump(L, { fame: 3, trust: -4 }); if (L.contract && L.contract.years >= 2) L.flags.tradeAsk = true; return 'Every outlet runs it. Your phone does not stop.'; } })] },
    tm_allin_office: { at: 'pre', tag: "{gm}'s office",
      t: () => 'The front office goes all in',
      x: (L) => '{gm} says this is a title team. Anything less than a deep run is a failure.',
      o: [O('Embrace it', { fame: 2, win: 0.3, morale: -1 }, 'You say it out loud at media day. The bar is set.', { sub: 'Want the pressure' }),
        O('Ask for a bigger role', null, '', { sub: 'Push for minutes', p: (L) => 0.3 + L.m.trust / 150,
          fx: { min: 2, usage: 0.01 }, s: 'He agrees. Contenders play their best players.',
          no: { fx: { trust: -3 }, s: 'He says the role is the role. Win and it grows.' } }),
        O('Stay in your lane', { trust: 3, win: 0.2 }, 'Do your job. That is what a title team needs.', { sub: 'Do your job' })] },
    /* The deadline. */
    tm_dl_buy: { at: 'mid', tag: 'Deadline day',
      t: (L) => twNow(L).n + ' joins the push',
      x: (L) => 'The ' + twClub(L) + ' bought at the deadline. ' + twNow(L).n + ' shows up for shootaround.',
      o: [O('Walk him through the playbook', { win: 0.5, trust: 2 }, 'You sit with him on the plane. He knows every set by Friday.', { sub: 'Speed it up' }),
        O('Give him your shots', { usage: -0.02, win: 0.6 }, 'He hits his first four. The math works.', { sub: 'Make room' }),
        O('Keep doing your thing', { morale: 1 }, 'Nothing changes for you. That is the point.', { sub: 'Stay steady' })] },
    tm_dl_sell_room: { at: 'mid', tag: 'The locker room',
      t: () => 'The sell-off',
      x: (L) => twNow(L).n + ' was traded to the ' + nick(twNow(L).to) + '. The ' + twClub(L) + ' are selling.',
      o: [O('Rally who is left', { win: 0.4, trust: 3, morale: -1 }, 'You tell the room the season is not over. They believe you, for a week.', { sub: 'Lead' }),
        O('Ask {gm} if you are next', null, '', { sub: 'Know where you stand', rel: [['gm', -2, 'You asked if you were next.']],
          do: (L) => { bump(L, { trust: -1 }); return L.age >= 28 ? 'He does not say no. That is an answer.' : 'He says no. You are the one they are building around.'; } }),
        O('Get your minutes', { min: 2, usage: 0.01 }, 'Somebody has to take those shots. It is you.', { sub: 'Opportunity' })] },
    tm_dl_sell_phone: { at: 'mid', tag: 'Your phone',
      t: () => '{agent} has a question',
      x: (L) => twNow(L).n + ' is gone and the ' + twClub(L) + ' are selling. {agent} asks if you want out this summer.',
      o: [O('Yes, find me a winner', null, '', { sub: 'Start the process', rel: [['agent', 4, 'You told him to find you a winner.']],
        do: (L) => { if (L.contract && L.contract.years >= 2) { L.flags.tradeAsk = true; bump(L, { trust: -5 }); return 'He makes calls. Quietly, for now.'; } bump(L, { morale: 2 }); return "You're a free agent anyway. He starts a list."; } }),
        O('No, I finish what I started', { trust: 4, eth: 2 }, 'He says okay. He also says think about it.', { sub: 'Stay' }),
        O('Ask what he hears', { morale: -1 }, 'Two contenders called about you. Nobody hung up.', { sub: 'Information' })] },
    /* The season talks back. */
    tm_hot_start: { at: 'early', tag: 'National TV',
      t: (L) => twRec(L) + ' and rolling',
      x: (L) => 'The ' + twClub(L) + ' are the story of the first month. National TV adds two of your games.',
      o: [O('Enjoy it', { morale: 4, fame: 2 }, 'You let yourself smile. Winning is fun.', { sub: 'Soak it in' }),
        O('Say it means nothing yet', { trust: 3, eth: 2 }, '{beat} calls it boring. The coaches call it right.', { sub: 'Stay hungry' }),
        O('Talk about a title', { fame: 3, win: 0.2, morale: -1 }, 'The headline writes itself. So does the pressure.', { sub: 'Go big', rel: [['beat', 4]] })] },
    tm_hot_target: { at: 'early', tag: 'The road',
      t: () => 'Everybody wants you now',
      x: (L) => twRec(L) + '. Every road crowd is sold out. Every opponent saves its best for you.',
      o: [O('Love the target', { fame: 2, morale: 2, health: -2 }, 'Big games every night. Your legs feel it.', { sub: 'Bring it' }),
        O('Rest when you can', { health: 4, win: -0.2 }, 'You sit a back to back. The crowd boos. Your knees thank you.', { sub: 'Long season' }),
        O('Keep the room locked in', { win: 0.3, trust: 2 }, 'No newspapers in the locker room. It works.', { sub: 'Focus' })] },
    tm_cold_room: { at: 'early', tag: 'The locker room',
      t: (L) => twRec(L) + ' in December',
      x: (L) => 'The building is quiet. {beat} asks if this group can turn it around.',
      o: [O('Take the blame', { trust: 5, fame: 1, morale: -2 }, 'You put it on yourself. The room respects it.', { sub: 'On me' }),
        O('Call out the effort', null, '', { sub: 'Say it plainly', p: (L) => 0.3 + L.m.trust / 160,
          fx: { win: 0.6, fame: 2 }, s: 'It stings. They play harder the next night, and the night after.',
          no: { fx: { trust: -6, morale: -3 }, s: '{tvet} takes it personally. The room splits.', rel: [['tvet', -10, 'You called out the room.']] } }),
        O('Ask {gm} about changes', null, '', { sub: 'What is the plan', rel: [['gm', -2]],
          do: (L) => { bump(L, { trust: -2 }); return 'He says nothing is off the table. That includes you.'; } })] },
    tm_cold_meeting: { at: 'early', tag: 'Players only',
      t: () => '{tvet} calls a meeting',
      x: (L) => 'No coaches. Just the players, at ' + twRec(L) + '. Everybody looks at you.',
      o: [O('Speak first', null, '', { sub: 'Say what everyone is thinking', p: (L) => 0.4 + (L.m.trust - 50) / 150,
        fx: { win: 0.7, trust: 4 }, s: 'You say it straight. They win five of the next seven.',
        no: { fx: { morale: -3 }, s: 'It comes out wrong. Two guys leave early.' } }),
        O('Back {tvet}', { win: 0.3, trust: 2 }, 'He runs it. You nod at the right times. It helps.', { sub: 'Support him', rel: [['tvet', 6, 'You backed his meeting.']] }),
        O('Skip it', { morale: -2 }, 'You say you have treatment. Nobody believes you.', { sub: 'Not your style', rel: [['tvet', -8, 'You skipped the players-only meeting.']] })] },
    tm_top_seed: { at: 'mid', tag: 'The All-Star break',
      t: (L) => 'First in the ' + confOf(L.team),
      x: (L) => 'The ' + twClub(L) + ' have the best record in the ' + confOf(L.team) + '. Every night is somebody\'s playoff game now.',
      o: [O('Keep the foot down', { win: 0.3, health: -3 }, 'You play every minute like it is May. It costs you something.', { sub: 'Win them all' }),
        O('Save the legs', { health: 5, win: -0.2 }, 'You sit two back to backs. The seed holds anyway.', { sub: 'It is about April' }),
        O('Stay humble', { trust: 3, morale: 1 }, 'Nobody hangs a banner in February. You say that a lot.', { sub: 'Nothing won yet' })] },
    tm_race_meeting: { at: 'mid', tag: 'Team meeting',
      t: (L) => ordinal(twNow(L).rank) + ' in the ' + confOf(L.team),
      x: (L) => 'The play-in line is right there. {tvet} wants the room together after practice.',
      o: [O('Speak first', null, '', { sub: 'Set the tone', p: (L) => 0.45 + (L.m.trust - 50) / 140,
        fx: { win: 0.8, morale: 3, trust: 2 }, s: 'Short and loud. They go on a run.',
        no: { fx: { win: -0.2, morale: -2 }, s: 'It falls flat. You lose the next two.' } }),
        O('Let {tvet} run it', { win: 0.4 }, 'He has been here before. The room listens.', { sub: 'Trust the vet', rel: [['tvet', 8, 'You let him run the meeting.']] }),
        O('Just go to work', { eth: 3, win: 0.2 }, 'Extra film, every night. You lead by showing up early.', { sub: 'No speeches' })] },
    tm_race_film: { at: 'mid', tag: 'The film room',
      t: () => 'Every game is a playoff game',
      x: (L) => 'The ' + twClub(L) + ' sit ' + ordinal(twNow(L).rank) + '. The staff wants you on the ball more down the stretch.',
      o: [O('Take it', { usage: 0.03, win: 0.4, health: -2 }, 'The ball is yours late in games. So is the blame.', { sub: 'Put it on you' }),
        O('Spread it around', { win: 0.3, trust: 2 }, 'Five guys touch it every trip. It is ugly. It works.', { sub: 'Share it' }),
        O('Ask for rest days', { health: 4, trust: -3 }, 'They say no. Not now. The race is the season.', { sub: 'Long view' })] },
  };
  for (const id in pool) TEAM_EV[id] = compileStory(id, pool[id]);
  defineEvents(TEAM_EV, 'team');
  for (const id in TEAM_EV) TEAM_EV[id].pool = 'team';
})();

/* The new prerequisites a route, an origin or a career shape is read off. */
const amOf = (L) => L.am || {};
Object.assign(REQ, {
  origin: (L, v) => [].concat(v).indexOf(L.origin) >= 0,
  route: (L, v) => [].concat(v).some((k) => !!recall(L, 'route.' + k)),
  notRoute: (L, v) => [].concat(v).every((k) => !recall(L, 'route.' + k)),
  level: (L, v) => isAm(L) && [].concat(v).indexOf(amOf(L).level) >= 0,
  grade: (L, r) => !!L.am && inRange(L.am.grade || 0, r),
  cyear: (L, r) => !!L.am && inRange(L.am.cyear || 0, r),
  rank: (L, r) => !!L.am && !!L.am.rank && inRange(L.am.rank, r),
  tier: (L, v) => !!(L.am && L.am.college && SCHOOL_BY[L.am.college]) && [].concat(v).indexOf(SCHOOL_BY[L.am.college].tier) >= 0,
  pick: (L, r) => inRange(L.draft ? (L.draft.pick || 61) : 61, r),
  rings: (L, r) => inRange(totals(L).rings, r),
  stars: (L, r) => inRange(totals(L).star, r),
  clubs: (L, r) => inRange(new Set(L.history.map((h) => h.t)).size, r),
  yearsHere: (L, r) => inRange(L.history.filter((h) => h.t === L.team).length, r),
  pro: (L, v) => [].concat(v).every((k) => routeOn(L, k)),
  persona: (L, v) => [].concat(v).indexOf(personaOf(L)) >= 0,
  kids: (L, r) => inRange(lifeOf(L).kids || 0, r),
  known: (L, a) => a.every((k) => !!(L.traits && L.traits[k] && L.traits[k].known)),
  big: (L, v) => !!BIG_MARKET[L.team] === v,
  net: (L, r) => !!L.team && inRange(clubNet(L, L.team), r),
  legendOn: (L, v) => !!(L.opt && L.opt.legend) === v,
  drafted: (L, v) => !!(L.draft && L.draft.pick) === v,
  arc: (L, a) => a.every((k) => !!(L.arcs && L.arcs[k])),
  notArc: (L, a) => a.every((k) => !(L.arcs && L.arcs[k])),
  arcDone: (L, a) => a.every((k) => !!(L.arcs && L.arcs[k] && L.arcs[k].done)),
});

// ─── origins ────────────────────────────────────────────────────────────────

/* WHERE YOU ARE FROM (NARRATIVE.md section 4). Chosen at creation, or rolled
   off the seed. It tilts the ratings a little, gives the career a trait it
   always has, and opens three or four cards no other origin sees. */
const ORIGINS = {
  small_town: { name: 'Small-town unknown', blurb: 'One stoplight. One gym. Nobody is watching yet.', tilt: { iq: 2 }, fame: -3, trait: 'loyal' },
  big_city: { name: 'Big-city prodigy', blurb: 'Famous at fourteen. Every park knows your name.', tilt: { fin: 2 }, fame: 6, trait: 'showman' },
  pro_son: { name: 'Son of a former pro', blurb: 'Your father played nine seasons. You hear about it.', tilt: { iq: 3 }, fame: 4, trait: 'filmJunkie' },
  growth: { name: 'Late growth spurt', blurb: 'A guard until last summer. Then six inches.', tilt: { pla: 2, reb: 2 } },
  intl: { name: 'International prospect', blurb: 'Grew up abroad. Came over at fifteen.', tilt: { iq: 2, pla: 2 } },
  prep: { name: 'Prep school transfer', blurb: 'Left home for a boarding school with a real gym.', tilt: { iq: 1, sho: 1 } },
  multi: { name: 'Multi-sport athlete', blurb: 'Quarterback in the fall. Shortstop in the spring.', tilt: { ath: 3 } },
  walkon: { name: 'Overlooked', blurb: 'Cut from varsity once. Still in the gym every night.', tilt: { def: 2 }, fame: -3, trait: 'gymRat' },
};
const ORIGIN_KEYS = Object.keys(ORIGINS);
const ABROAD = ['Kaunas', 'Belgrade', 'Lyon', 'Lagos', 'Melbourne', 'Ljubljana', 'Valencia', 'Istanbul'];
function setOrigin(L, key) {
  const k = ORIGINS[key] ? key : pick(E.createSeededRNG(E.hashSeed(L.seed + ':origin')), ORIGIN_KEYS);
  const o = ORIGINS[k];
  L.origin = k;
  for (const r in o.tilt) L.rt[r] = clamp(L.rt[r] + o.tilt[r], 25, 88);
  if (o.fame) L.m.fame = clamp(L.m.fame + o.fame, 0, 100);
  if (o.trait && L.traits[o.trait]) L.traits[o.trait].has = true;
  const rng = E.createSeededRNG(E.hashSeed(L.seed + ':originx'));
  if (k === 'pro_son') remember(L, 'origin.father', 6000 + Math.round(rng() * 9000));
  if (k === 'intl') remember(L, 'origin.abroad', pick(rng, ABROAD));
}

// ─── routes ─────────────────────────────────────────────────────────────────

/* A ROUTE IS RECOGNIZED, not chosen from a list (NARRATIVE.md section 5). The
   roads to the pros are remembered as `route.<id>` at the moment they are
   taken; the roads through the pros are read off what the career did. Each
   one opens its own cards. */
const ROUTES = {
  oad: ['One and done', 'pre'], four: ['Four-year college star', 'pre'], midmajor: ['Mid-major', 'pre'],
  portal: ['Transfer portal', 'pre'], juco: ['Junior college', 'pre'], walkon: ['Walk-on', 'pre'],
  gl: ['G League pathway', 'pre'], intl: ['Overseas pro at 18', 'pre'], gap: ['Gap year', 'pre'],
  prep: ['Prep school year', 'pre'], reclass: ['Reclassified', 'pre'], rec: ['Rec league discovery', 'pre'],
  undrafted: ['Undrafted free agent', 'pre'], stash: ['Draft and stash', 'pre'],
  savior: ['Lottery savior', 'pro'], bust: ['Bust who rebuilds', 'pro'], rise: ['Role player to star', 'pro'],
  sixth: ['Sixth man', 'pro'], stopper: ['Defensive stopper', 'pro'], journey: ['Journeyman', 'pro'],
  detour: ['Overseas detour and return', 'pro'], lifer: ['Franchise lifer', 'pro'], ringchase: ['Ring chaser', 'pro'],
  small: ['Small-market hero', 'pro'], big: ['Big-market celebrity', 'pro'], vet: ['Player-coach veteran', 'pro'],
  superteam: ['Superteam builder', 'pro'],
};
function routeOn(L, id) {
  if (recall(L, 'route.' + id)) return true;
  const H = L.history, d = L.draft || {};
  switch (id) {
    case 'savior': return !!d.pick && d.pick <= 5 && (d.net == null ? false : d.net <= -2) && H.length >= 3;
    case 'bust': return !!d.pick && d.pick <= 14 && H.length >= 3 && H[2].ovr < 67;
    case 'rise': return (!d.pick || d.pick >= 21) && H.some((h) => (h.aw || []).indexOf('star') >= 0);
    case 'sixth': return H.some((h) => (h.aw || []).indexOf('6moy') >= 0) || H.filter((h) => h.role === 'Sixth man').length >= 3;
    case 'stopper': return H.filter((h) => (h.aw || []).some((a) => a === 'dpoy' || a === 'ad1' || a === 'ad2')).length >= 2;
    case 'journey': return new Set(H.map((h) => h.t)).size >= 5;
    case 'detour': return !!recall(L, 'route.detour.left') && H.some((h) => h.y > recall(L, 'route.detour.left').y);
    case 'lifer': return H.length >= 10 && new Set(H.map((h) => h.t)).size === 1;
    case 'small': { const n = H.filter((h) => !BIG_MARKET[h.t]).length; return n >= 8 && n >= H.length * 0.8; }
    case 'big': return H.filter((h) => BIG_MARKET[h.t]).length >= 5;
    case 'vet': return !!recall(L, 'route.vet') || (L.age >= 34 && !!(L.traits.lockerVoice && L.traits.lockerVoice.known));
    case 'superteam': return !!recall(L, 'arc.costar.landed');
    default: return false;
  }
}
const routesOf = (L) => Object.keys(ROUTES).filter((k) => routeOn(L, k));

// ─── endings ────────────────────────────────────────────────────────────────

/* AN ENDING IS A HALL TIER, WHAT THE CAREER WAS, AND SOMETIMES A SECRET
   (NARRATIVE.md section 8). The tier comes off the legacy score and a vote
   seeded off the career, so a reload never changes it. */
const HOF_TIERS = {
  hof_first: 'First ballot Hall of Famer', hof_eventual: 'Hall of Famer, in time', hof_debate: 'Voted in after a debate',
  hof_snub: 'Snubbed by the Hall', hof_committee: 'In through the veterans committee', hof_none: 'Not a Hall of Famer',
};
const OUTCOMES = {
  lo_goat: 'In the GOAT debate', lo_statue: 'One-team legend, statue outside', lo_jersey: 'Number in the rafters',
  lo_ringless: 'The ringless great', lo_playoff_hero: 'Playoff hero', lo_cult_hero: 'Journeyman cult hero',
  lo_cut_short: 'What could have been', lo_bust: 'The bust', lo_redemption: 'The redemption story',
  lo_villain: 'The villain who was right', lo_elder: 'Beloved elder statesman', lo_sixth: 'The great sixth man',
  lo_stopper: 'The stopper', lo_overseas: 'A cup of coffee, then a legend abroad', lo_never: 'Never made the league',
  lo_glue: 'The glue guy with the rings', lo_hometown: 'Hometown hero', lo_superteam: 'The one who built it',
  lo_banned: 'Banned for life',
};
const SECRETS = {
  sx_full_circle: 'Full circle', sx_father_son: 'Passed the old man', sx_curse: 'The curse breaker',
  sx_dre: 'Two kids from camp', sx_ellis: 'The student', sx_apex: 'The one who came back',
  sx_town: 'The gym has your name', sx_mascot: 'The mascot\'s best friend', sx_comeback: 'Fifty and still splashing',
  sx_undrafted: 'Sixty names, not his',
};
const ENDING_COUNT = () => Object.keys(HOF_TIERS).length + Object.keys(OUTCOMES).length + Object.keys(SECRETS).length;
function hofTier(L, score, T) {
  const r = E.createSeededRNG(E.hashSeed(L.seed + ':hof'));
  const vote = r(), later = r();
  if (score >= HOF_AT[0]) return 'hof_first';
  if (score >= HOF_AT[1]) return 'hof_eventual';
  if (score >= HOF_AT[2]) {
    if (vote < 0.5) return 'hof_debate';
    return (T.rings || recall(L, 'record.broken')) && later < 0.45 ? 'hof_committee' : 'hof_snub';
  }
  return 'hof_none';
}
const hofIn = (tier) => tier === 'hof_first' || tier === 'hof_eventual' || tier === 'hof_debate' || tier === 'hof_committee';
function outcomesOf(L, T, score, tier, jersey) {
  const H = L.history, out = [];
  if (!H.length) {
    out.push((L.flags.overseasYears || 0) >= 2 ? 'lo_overseas' : 'lo_never');
    return out;
  }
  const clubs = new Set(H.map((h) => h.t)).size;
  const peak = Math.max.apply(null, H.map((h) => h.ovr));
  const d = L.draft || {};
  const inj = recall(L, 'inj.major');
  const p = personaOf(L);
  if (score >= GOAT_AT || (T.mvp >= 3 && T.rings >= 4)) out.push('lo_goat');
  if (routeOn(L, 'lifer') && hofIn(tier)) out.push('lo_statue');
  else if (jersey) out.push('lo_jersey');
  if (hofIn(tier) && !T.rings) out.push('lo_ringless');
  if (T.fmvp && (L.flags.g7 || 0) + (L.flags.buzzer || 0) + (L.flags.stops || 0) + (L.flags.ftIce || 0) >= 2) out.push('lo_playoff_hero');
  if (clubs >= 5 && (L.m.fame >= 40 || repOf(L).fans >= 60)) out.push('lo_cult_hero');
  if (inj && L.age <= 31 && peak >= 74 && !hofIn(tier)) out.push('lo_cut_short');
  if (d.pick && d.pick <= 14 && peak < 74) out.push('lo_bust');
  if (routeOn(L, 'bust') && (T.star || T.rings)) out.push('lo_redemption');
  if ((p === 'Villain' || p === 'Loose cannon' || p === 'Showman') && T.rings >= 1) out.push('lo_villain');
  if (routeOn(L, 'vet') && (p === "Pro's pro" || p === 'Face of the league' || p === 'Quiet assassin')) out.push('lo_elder');
  if (H.some((h) => (h.aw || []).indexOf('6moy') >= 0) || H.filter((h) => h.role === 'Sixth man').length >= 3) out.push('lo_sixth');
  if (T.dpoy >= 2) out.push('lo_stopper');
  if ((L.flags.overseasYears || 0) >= 2 && H.length <= 4) out.push('lo_overseas');
  if (T.rings >= 3 && !T.star) out.push('lo_glue');
  const home = homeClub(L);
  if (home && H.filter((h) => h.t === home).length >= Math.max(5, H.length / 2)) out.push('lo_hometown');
  if (routeOn(L, 'superteam') && T.rings) out.push('lo_superteam');
  if (L.flags.banned) out.push('lo_banned');
  return out;
}
function secretOf(L, T, tier, jersey) {
  const H = L.history, d = L.draft || {};
  const fam = (k) => !!recall(L, k);
  if (fam('legend.halftime.made') && hofIn(tier)) return 'sx_comeback';
  if (fam('arc.curse.broken')) return 'sx_curse';
  if ((fam('arc.apex.won') || fam('arc.apex.villain')) && T.rings) return 'sx_apex';
  if ((fam('arc.ellis.move') || fam('arc.ellis.hello')) && T.fmvp) return 'sx_ellis';
  if (L.origin === 'walkon' && tier === 'hof_first' && jersey) return 'sx_full_circle';
  if (L.origin === 'pro_son' && fam('origin.passed') && tier === 'hof_first') return 'sx_father_son';
  if (L.origin === 'small_town' && fam('town.stayed') && hofIn(tier)) return 'sx_town';
  if (fam('arc.camp.friends') && hofIn(tier) && L.rival && (L.rival.star >= 3 || L.rival.mvp)) return 'sx_dre';
  if (fam('arc.mascot.friends') && jersey && tier === 'hof_first') return 'sx_mascot';
  if (!d.pick && H.length && T.star) return 'sx_undrafted';
  return null;
}
function endingOf(L, T, score, jersey) {
  const tier = H_TIER(L, score, T);
  const outs = outcomesOf(L, T, score, tier, jersey);
  const sx = secretOf(L, T, tier, jersey);
  return {
    tier, tierName: HOF_TIERS[tier], hof: hofIn(tier), outcomes: outs, names: outs.map((k) => OUTCOMES[k]),
    secret: sx, secretName: sx ? SECRETS[sx] : null, routes: routesOf(L).map((k) => ROUTES[k][0]),
  };
}
const H_TIER = (L, score, T) => L.history.length && !L.flags.banned ? hofTier(L, score, T) : 'hof_none';

// ─── after basketball ───────────────────────────────────────────────────────

/* THE EPILOGUE (NARRATIVE.md section 8.4). The after card offers the paths
   this career has earned, then a short chapter is played and the career is
   over only once that is answered. */
const AFTER_PATHS = [
  ['head_coach', 'Head coach', 'A bench of your own.', (L) => L.rt.iq >= 70 || trait(L, 'coachable') || !!recall(L, 'v.coachy')],
  ['assistant', 'Assistant coach', 'Start in the film room. Work up.', () => true],
  ['gm', 'Front office', 'Build a team the way you wanted one.', (L) => L.rt.iq >= 66 || !!recall(L, 'arc.venture.won')],
  ['owner', 'Buy into a team', 'An ownership group wants your name and money.', (L) => L.cash >= 25],
  ['broadcast', 'Television', 'A desk, a suit, a microphone.', (L) => L.m.fame >= 45 || !!recall(L, 'media.pod')],
  ['league', 'League office', 'Rules, schedules, the players\' side.', (L) => !!recall(L, 'union.role')],
  ['college', 'Coach your old school', 'The campus never forgot you.', (L) => !!(L.amHist && L.amHist.some((h) => h.lvl === 'NCAA'))],
  ['hs', 'Coach high school at home', 'The gym where it started.', (L) => !!L.am || L.origin === 'small_town' || trait(L, 'loyal')],
  ['business', 'Business', 'Make the money work for you.', (L) => L.cash >= 6],
  ['actor', 'Hollywood', 'Your agent has a script.', (L) => !!recall(L, 'ent.movie') || L.m.fame >= 70],
  ['politics', 'Run for office', 'The city council seat at home is open.', (L) => L.m.fame >= 55 && !!recall(L, 'foundation')],
  ['podcast', 'The podcast', 'Three microphones and no filter.', (L) => !!recall(L, 'media.pod') || L.m.fame >= 50],
  ['comeback', 'One more comeback', 'You are not done. Probably.', (L) => L.age <= 37 && ovrOf(L) >= 64],
  ['family', 'Go home', 'Your family. Your town. Nothing to prove.', () => true],
];
function storyAfterCard(L) {
  const rng = E.createSeededRNG(E.hashSeed(L.seed + ':after'));
  const ban = !!L.flags.banned;
  const open = AFTER_PATHS.filter((p) => p[0] !== 'family' && (ban ? BAN_PATHS[p[0]] && (p[0] === 'podcast' || p[3](L)) : p[3](L))).sort(() => rng() - 0.5).slice(0, 4);
  open.push(AFTER_PATHS[AFTER_PATHS.length - 1]);
  return {
    id: 'after', kind: 'event', key: 'after', eyebrow: 'After basketball', scene: 'Home', title: 'What comes next?',
    text: "You're " + L.age + ', with ' + money(L.cash) + ' in the bank and the rest of your life ahead.',
    ctx: { paths: open.map((p) => p[0]) },
    options: open.map((p) => ({ label: p[1], hint: p[2] })),
  };
}
/* The answers to life after basketball (choose() runs them). */
ANSWER.after = function(L, card, i, opt, rng, beats, touch, touches) {
  let text = '', tone = '', made = null, won = null, shots = null, contest = null;
  if (card.ctx && card.ctx.paths) {
    const path = card.ctx.paths[i];
    L.final = legacy(L);
    L.final.path = path;
    L.final.after = AFTER_PATHS.find((p) => p[0] === path)[1] + '.';
    text = 'New city, new chapter.'; tone = 'gold';
    if (!dealNamed(L, 'post', 'ep_' + path)) finishLife(L, '');
    return { text, tone, made, won, shots, contest };
  }
  L.retired = true;
  L.phase = 'retired';
  L.final = legacy(L);
  L.final.after = chooseAfter(L, i, rng);
  text = L.final.after; tone = 'gold';
  logIt(L, text, 'gold');
  return { text, tone, made, won, shots, contest };
};
/* The career ends here, after the epilogue and, rarely, one last shot. */
function finishLife(L, text) {
  if (L.final && text) { L.final.epilogue = say(L, text); L.final.after = L.final.epilogue; }
  if (L.opt.legend && !recall(L, 'legend.halftime') && L.history.length >= 6 && rngAt(L, 'halftime')() < 0.04 && dealNamed(L, 'post', 'lg_one_more_shot')) return;
  L.retired = true;
  L.phase = 'retired';
  if (L.final) {
    const T = totals(L);
    L.final.ending = endingOf(L, T, L.final.score, L.final.jersey);
  }
}
