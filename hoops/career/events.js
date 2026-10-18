// ─── the events ─────────────────────────────────────────────────────────────

/* Every card the year can deal. `when` says whether it fits now, `weight` how
   often it comes up, and `options` are run off the card's own seeded draw.
   Each `run` returns the sentence the screen prints under the choice. Every
   person in here is a role, never a name. */
const ok = (rng, p) => rng() < clamp(p, 0.03, 0.97);

// ─── the press room ─────────────────────────────────────────────────────────

/* After the moments a career is remembered for, a microphone. It is Run The
 * Tour's press room arriving at a basketball career: every answer is a TONE,
 * because how you say it is what gets clipped, and the screen shows the tone
 * beside the words.
 *
 * Each tone moves a meter a little and moves the two axes your reputation is
 * read off: FANS (do people love watching you) and RESPECT (do the people
 * inside the game rate you). The persona on the identity card is read off
 * those two, never stored, so it cannot disagree with them.
 *
 * Small on purpose. A press conference is a story about the career and not a
 * lever on it: the biggest move is five points of fame, and check-career's
 * balance bands are measured with the press room in.
 */
const TONES = {
  humble: { name: 'Humble', d: { trust: 3, fame: 1 }, fans: 2, resp: 5 },
  team: { name: 'Team first', d: { trust: 4, morale: 2 }, fans: 2, resp: 5 },
  confident: { name: 'Confident', d: { fame: 3, morale: 2 }, fans: 4, resp: 1 },
  loyal: { name: 'Loyal', d: { trust: 2, morale: 2, fame: 1 }, fans: 5, resp: 2 },
  showman: { name: 'Showman', d: { fame: 4, morale: 2 }, fans: 6, resp: -3 },
  fiery: { name: 'Fiery', d: { morale: 4, fame: 2 }, fans: 4, resp: 0 },
  cold: { name: 'Ice cold', d: { trust: 2, fame: -1 }, fans: -5, resp: 4 },
  cocky: { name: 'Cocky', d: { fame: 5, trust: -3 }, fans: -6, resp: -6, risk: 0.45 },
};
/* What gets said about it afterwards. Two of each, picked by the card's own
   rng, so a reload reads the same line. */
const TONE_SAY = {
  humble: ['The clip goes around. People like you more for it.', 'Nobody writes a headline about it. The locker room notices.'],
  team: ['Your teammates repost it. The room is tight.', '{coach} plays it in the film session. Twice.'],
  confident: ['It plays well. You sound like you belong.', 'A good quote. It runs all day.'],
  loyal: ['The city puts it on a T-shirt by morning.', 'Season ticket renewals jump. Team owner {owner} sends flowers.'],
  showman: ["It's on every show by lunch. You're a lot of fun.", 'A meme by midnight. Your follower count doubles.'],
  fiery: ['The fans love the fire. The other team saves the clip.', "It's the quote of the week. Everybody has a take."],
  cold: ['Four words and you walk off. The league takes you seriously.', 'No smile. No soundbite. Scouts call it focus.'],
  cocky: ['Bold. It backs itself up, for now.', 'Half the league is angry. The other half is watching.'],
};
const TONE_BAD = ["It doesn't land. {topp} pins it to his locker.", 'It reads worse in print. {tvet} goes quiet on you for a week.'];

/* The topics, with the question and the answers. An answer is the words you
   say and the tone they are said in. */
const PRESSERS = {
  draft: { scene: 'Draft stage', title: 'A dozen microphones. How do you sound?', text: 'Your new hat is still crooked. A reporter leans in: "What does this team get in you?"',
    ans: [['humble', "A worker. I'll earn everything."], ['showman', 'A show. Buy your tickets now.'],
      ['cocky', 'The best player in this draft.'], ['cold', "Put me on the floor. That's my answer."]] },
  mvp: { scene: 'Press room', title: 'MVP. The trophy is heavy. So is the room.', text: 'Every seat is taken. First question, from the back: "Why you, this year?"',
    ans: [['team', 'My teammates made this easy.'], ['confident', 'I earned every single vote.'],
      ['cocky', "It wasn't close."], ['showman', 'Wait until next year.']] },
  title: { scene: 'The podium', title: 'Champions. What do you say?', text: 'Confetti in your hair, a cap on backwards. A microphone pushes through: "What does this one mean?"',
    ans: [['team', 'This is about every guy in that room.'], ['loyal', 'This city deserved it.'],
      ['cocky', 'Told you. Write it down.'], ['cold', 'We expected this. On to the next one.']] },
  finals_loss: { scene: 'Locker room', title: "The room's quiet. The cameras aren't.", text: 'Ten minutes after the buzzer, still in your jersey. A reporter asks: "What happened out there?"',
    ans: [['humble', 'They were better. Credit them.'], ['fiery', "We'll be back. Mark it."],
      ['team', "That's on me. Not my teammates."], ['cold', 'Next question.']] },
  ncaa: { scene: 'The podium', title: 'National champs. Then the microphones.', text: 'A piece of the net around your neck. A reporter shouts: "What\'s next for you?"',
    ans: [['team', 'Enjoying this with my guys.'], ['loyal', 'This school made me.'],
      ['confident', "The league. I'm ready."], ['cocky', 'Best player in the country. Any questions?']] },
};
const PRESS_EYEBROW = { draft: 'Draft night', mvp: 'MVP press conference', title: 'Champions', finals_loss: 'After the Finals', ncaa: 'National champions' };

function repOf(L) { return L.rep || (L.rep = { fans: 50, resp: 50 }); }
function moveRep(L, fans, resp) {
  const r = repOf(L);
  r.fans = clamp(r.fans + fans, 0, 100);
  r.resp = clamp(r.resp + resp, 0, 100);
}
/* The everyday choices that are also a public statement, as [fans, respect]
   per option. A press conference is a few times a career at most, so without
   these most players would never be anybody in particular. Kept in a table
   rather than on each option, so the event text above stays a story and this
   stays one place to read the reputation off. */
const EVENT_REP = {
  /* Your club's moments are public too: what you say when a star arrives or
     the club sells is said in front of everybody. */
  tm_lost_camp: [[0, 1], [1, 2], [-1, 1]], tm_lost_media: [[-2, 2], [3, -1], [-1, 1]], tm_retire_locker: [[1, 3], [0, 1], [1, 1]],
  tm_star_practice: [[1, 2], [-2, -2], [1, 2]], tm_star_presser: [[2, 1], [1, 2], [-3, -2]],
  tm_rook_camp: [[2, 3], [0, 2], [-1, -2]], tm_rook_drill: [[2, -1], [1, 3], [-2, -2]],
  tm_rebuild_office: [[3, 2], [-4, -2], [0, 1]], tm_rebuild_media: [[4, 1], [-1, 0], [-3, -1]], tm_allin_office: [[2, 1], [-1, -2], [0, 2]],
  tm_dl_buy: [[0, 2], [1, 2], [0, 0]], tm_dl_sell_room: [[1, 2], [-1, -1], [0, -1]], tm_dl_sell_phone: [[-3, -2], [3, 2], [0, 0]],
  tm_hot_start: [[1, 0], [0, 2], [2, -2]], tm_hot_target: [[2, -1], [-2, 1], [0, 2]],
  tm_cold_room: [[1, 3], [-1, -2], [-2, -2]], tm_cold_meeting: [[1, 2], [0, 2], [-2, -3]],
  tm_top_seed: [[1, 0], [-1, 1], [0, 2]], tm_race_meeting: [[1, 2], [0, 1], [0, 2]], tm_race_film: [[2, -1], [0, 2], [-2, -2]],
  hot_streak: [[-2, -3], [2, 4], [-2, 2]],
  stuck: [[0, 3], [2, -3], [0, 1]],
  film_session: [[0, 3], [0, -3], [1, 0]],
  online_beef: [[3, -4], [1, 1], [-2, 2]],
  ref_heat: [[2, -3], [0, 2]],
  heckler: [[-1, -4], [-1, 2], [4, 1]],
  charity: [[3, 2], [2, 2], [-2, -1]],
  podcast: [[3, -2], [-1, 1]],
  media_day: [[2, -2], [1, 3], [0, 1]],
  rap_album: [[3, -2], [-1, 0]],
  rival_trash: [[1, 3], [3, -3], [-2, 2]],
  docuseries: [[4, -2], [3, 0], [-3, 1]],
  teammate_fight: [[1, -4], [0, 3], [0, 2]],
  playoff_guarantee: [[3, -2], [-1, 2]],
  christmas: [[4, -2], [-1, 2]],
  superteam: [[-4, -2], [4, 2]],
  hometown_call: [[3, 1], [-1, 0]],
  local_ad: [[2, -1], [-1, 0]],
  mentor_rookie: [[1, 4], [0, -1]],
  young_star: [[1, 4], [0, 1], [-2, -2]],
};
/* Nine personas off a three by three of the two axes. */
const PERSONAS = [
  ['Villain', 'Low profile', 'Quiet assassin'],
  ['Loose cannon', 'Still writing it', "Pro's pro"],
  ['Showman', 'Fan favorite', 'Face of the league'],
];
function personaOf(L) {
  const r = repOf(L), band = (v) => v < 42 ? 0 : v > 58 ? 2 : 1;
  return PERSONAS[band(r.fans)][band(r.resp)];
}
function presserCard(L, topic) {
  const p = PRESSERS[topic];
  return {
    id: 'presser', kind: 'presser', key: 'presser:' + topic + ':' + L.year, topic,
    eyebrow: PRESS_EYEBROW[topic], scene: p.scene, title: p.title, text: p.text,
    options: p.ans.map((a) => ({ label: a[1], tone: a[0], hint: TONES[a[0]].name })),
  };
}
function choosePresser(L, card, opt, rng) {
  const t = TONES[opt.tone] || TONES.humble;
  bump(L, t.d);
  moveRep(L, t.fans, t.resp);
  L.flags.press = (L.flags.press || 0) + 1;
  if (t.risk && !ok(rng, 1 - t.risk)) {
    bump(L, { trust: -3, morale: -2 });
    moveRep(L, -2, -3);
    return { text: TONE_BAD[rng() < 0.5 ? 0 : 1], tone: 'bad' };
  }
  const lines = TONE_SAY[opt.tone] || TONE_SAY.humble;
  return { text: lines[rng() < 0.5 ? 0 : 1], tone: 'good' };
}
/* Text that states a fact reads the fact. A bench player's hot streak is not
   thirty a night, and a proposal says how long it has really been. */
const WORDNUM = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
const wordNum = (n) => WORDNUM[n] || String(n);
/* How many times this event has been dealt in this career, this one included.
   Only a story career counts; anything else reads as the first time. */
const times = (L, id) => Math.max(1, ((L.evlog || {})[id] || []).length);
function streakLine(L) {
  const ppg = L.season && L.season.gp ? perGame(L.season).pts : 10;
  const bar = Math.max(10, Math.round((ppg + 8) / 5) * 5);
  return bar + ' or more three straight nights.';
}
function yearsWith(L) {
  const n = Math.max(1, L.year - (lifeOf(L).since || L.year));
  return wordNum(n) + (n === 1 ? ' year' : ' years');
}
const EVENTS = {
  vet_mentor: {
    phases: ['early'], once: true, req: { seasons: [0, 0] }, weight: () => 4,
    tag: 'Locker room',
    title: '{tvet} wants a minute with you',
    text: () => '{tvet} has outlasted half the league. "Want to know how I\'m still here? Just ask."',
    options: [
      { label: 'Shadow him every day', hint: 'Learn it the long way', run: (L) => { bump(L, { iq: 2, eth: 6, trust: 4 }); arcStart(L, 'mentor', 'arc_mentor_2', 'off', 7, { n: say(L, '{tvet}') }); return 'Film at six, lift at seven. You learn more than you expected.'; } },
      { label: 'Ask him about money', hint: 'Think past the game', run: (L) => { bump(L, { cash: 0.2, iq: 1 }); L.flags.savvy = true; return 'He tells you what nobody told him. You open a real savings account.'; } },
      { label: 'Thank him, do your own thing', hint: 'Trust your own routine', run: (L) => { bump(L, { morale: 2 }); return 'He shrugs. There\'s always another rookie.'; } },
    ],
  },
  rookie_duty: {
    phases: ['early'], once: true, req: { seasons: [0, 0] }, weight: () => 3,
    tag: 'Team plane',
    title: 'Rookie duty: breakfast is on you',
    text: () => '{tvet} hands you the order: breakfast for the whole plane, every road trip. "Rookie pays. Always has."',
    options: [
      { label: 'Pay up and smile', hint: 'Earn the room', run: (L) => { bump(L, { trust: 6, cash: -0.05, morale: -2 }); return 'Forty breakfast sandwiches later, the locker room likes you.'; } },
      { label: 'Turn it into content', hint: 'Make it a bit', run: (L, r) => { if (ok(r, 0.6)) { bump(L, { fame: 6, trust: 2 }); return 'The video does numbers. Even {tvet} shares it.'; } bump(L, { fame: 3, trust: -6 }); return 'It does numbers. {tvet} isn\'t laughing.'; } },
      { label: 'Refuse to do it', hint: 'Pick a fight early', run: (L) => { bump(L, { trust: -8, morale: 3 }); return 'Bold. Your sneakers are full of ice the next morning.'; } },
    ],
  },
  night_out: {
    phases: ['early', 'mid', 'late'], when: () => true, weight: () => 3,
    tag: 'Group chat',
    title: 'Back-to-back tomorrow. Go out tonight?',
    text: () => '{tm} is organizing it and everybody\'s in. "One drink. Two, tops." You know how this ends.',
    options: [
      { label: 'Go out with the guys', hint: 'Live a little', run: (L, r) => { if (ok(r, 0.55)) { bump(L, { morale: 8, health: -4 }); return 'Great night, rough morning. You get through it.'; } bump(L, { morale: 4, health: -6, trust: -7, fame: 3 }); return 'Photos surface by breakfast. {gm} has seen them.'; } },
      { label: 'One drink, then home', hint: 'Show your face', run: (L) => { bump(L, { morale: 4, health: -1 }); return 'You show up, leave early and sleep fine. Best of both.'; } },
      { label: 'Stay in tonight', hint: 'Legs first', run: (L) => { bump(L, { iq: 1, health: 2, morale: -2 }); return 'Film and sleep. You play well the next night.'; } },
    ],
  },
  hot_streak: {
    phases: ['early', 'mid', 'late'], req: { minutes: [22, null] }, weight: () => 3,
    tag: 'Postgame',
    title: 'You\'re on fire. What do you say?',
    text: (L) => streakLine(L) + ' Now the cameras are crowding your locker.',
    options: [
      { label: 'Say you\'re the best here', hint: 'Feed the moment', run: (L, r) => { bump(L, { fame: 8, trust: -4 }); if (ok(r, 0.5)) { bump(L, { usage: 0.02 }); return '{coach} runs more plays for you. The bigs notice.'; } bump(L, { morale: -3 }); return 'It plays on every channel. {tm} and {tm2} stop passing to you.'; } },
      { label: 'Credit your teammates', hint: 'Share the spotlight', run: (L) => { bump(L, { trust: 5, morale: 4, win: 0.4 }); return 'The locker room loves it, and the ball moves a little faster.'; } },
      { label: 'Say nothing', hint: 'Let it speak', run: (L) => { bump(L, { fame: 2 }); return 'Headphones on, head down. The mystery only helps.'; } },
    ],
  },
  slump: {
    phases: ['early', 'mid', 'late'], req: { minutes: [14, null] }, weight: () => 3,
    tag: 'Practice gym',
    title: 'You can\'t buy a bucket. Now what?',
    text: () => 'A month of bricks. A guy behind the bench yells "shoot it, you bum." You heard it.',
    options: [
      { label: 'Shoot alone at midnight', hint: 'Grind it out', run: (L, r) => { bump(L, { health: -4 }); if (ok(r, 0.7)) { bump(L, { sho: 2, morale: 4 }); return 'Five hundred makes a night, and the stroke comes back.'; } bump(L, { morale: -4 }); return 'Tired legs, flat shots. It gets worse before it gets better.'; } },
      { label: 'Get to the rim instead', hint: 'Simplify your game', run: (L) => { bump(L, { fin: 1, usage: -0.01, perf: 0.4 }); return 'Layups and free throws until the jumper wakes up.'; } },
      { label: 'Keep shooting it', hint: 'Trust the stroke', run: (L, r) => { if (ok(r, 0.5)) { bump(L, { morale: 6, fame: 2 }); return 'Shooters shoot. It breaks open on the road.'; } bump(L, { morale: -6, trust: -3 }); return 'It doesn\'t break. {coach} shortens your leash.'; } },
    ],
  },
  coach_bench: {
    phases: ['early', 'mid'], when: (L) => L.season && L.season.role && L.season.role.starter && L.season.role.diff < 6, weight: () => 2,
    tag: 'Coach\'s office',
    title: 'Starter or sixth man?',
    text: () => 'The second unit needs a scorer, and {coach} thinks it\'s you. It sounds a lot like a demotion.',
    options: [
      { label: 'Take the sixth man job', hint: 'Team first', run: (L) => { bump(L, { trust: 10, min: -4, usage: 0.03 }); return 'You run the second unit. Sixth Man talk starts by March.'; } },
      { label: 'Push to keep starting', hint: 'Bet on yourself', run: (L, r) => { if (ok(r, 0.4)) { bump(L, { trust: -3 }); return 'He relents. You keep the spot, for now.'; } bump(L, { trust: -12, min: -5, morale: -6 }); return 'He does it anyway. Now you\'re benched and annoyed.'; } },
      { label: 'Ask for a trade', hint: 'Burn the bridge', run: (L) => { L.flags.tradeAsk = true; bump(L, { trust: -15, fame: 3 }); return '{agent}, your agent, makes the call. Word gets out by morning.'; } },
    ],
  },
  stuck: {
    phases: ['early', 'mid'], when: (L) => L.season && L.season.role && L.season.role.min < 18, weight: () => 4,
    tag: 'Practice',
    title: 'Stuck behind {blocker} on the depth chart',
    text: () => 'Twelve minutes a night, some nights none. You can sit and wait, or make some noise.',
    options: [
      { label: 'Outwork him in practice', hint: 'Earn it every day', run: (L, r) => { bump(L, { eth: 5, health: -3 }); if (ok(r, 0.55)) { bump(L, { trust: 10, min: 5 }); return '{coach} notices. Your minutes go up.'; } bump(L, { trust: 4 }); return 'He notices. Not enough yet.'; } },
      { label: 'Vent on a podcast', hint: 'Say it out loud', run: (L) => { bump(L, { fame: 6, trust: -12, morale: 3 }); return 'The clip goes everywhere. {tm} sends it to {gm}.'; } },
      { label: 'Ask for a G League stint', hint: 'Reps over pride', run: (L) => { bump(L, { fin: 1, sho: 1, iq: 1, min: -3, trust: 4 }); return 'Twenty games at thirty-five minutes. You come back sharper.'; } },
    ],
  },
  film_session: {
    phases: ['early', 'mid', 'late'], when: () => true, weight: () => 2,
    tag: 'Film room',
    title: 'The clip on the screen is you',
    text: () => 'You jogged back on defense. {coach} runs it back three times while the room goes quiet.',
    options: [
      { label: 'Own it', hint: 'Take the hit', run: (L) => { bump(L, { def: 1, trust: 6 }); return 'You say it\'s on you. It doesn\'t happen again.'; } },
      { label: 'Argue the scheme', hint: 'Defend yourself', run: (L, r) => { if (ok(r, 0.3)) { bump(L, { trust: 2 }); return 'You had a point. {coach} admits the scheme was wrong.'; } bump(L, { trust: -9 }); return 'Bad look. The assistants trade a glance.'; } },
      { label: 'Laugh it off', hint: 'Keep it light', run: (L) => { bump(L, { morale: 2, trust: -3 }); return 'The room laughs too. {coach} doesn\'t.'; } },
    ],
  },
  teammate_touches: {
    phases: ['mid', 'late'], req: { starter: true }, weight: () => 2,
    tag: 'Locker room',
    title: '{tco} wants more shots. Give them up?',
    text: () => '"I\'m open every time down," {tco} says. He\'s been telling {beat} the same thing.',
    options: [
      { label: 'Feed him more', hint: 'Keep him happy', run: (L) => { bump(L, { pla: 1, usage: -0.02, win: 0.5, trust: 3 }); return 'He gets his. The team wins four straight.'; } },
      { label: 'Talk it out privately', hint: 'Clear the air', run: (L, r) => { if (ok(r, 0.65)) { bump(L, { morale: 3, win: 0.3 }); return 'Dinner, honesty, a handshake. Fixed.'; } bump(L, { morale: -3 }); return 'He leaves dinner early. It lingers.'; } },
      { label: 'Ignore him', hint: 'Not your problem', run: (L) => { bump(L, { win: -0.6, morale: -2 }); return 'It festers. You can feel it in every huddle.'; } },
    ],
  },
  trade_rumor: {
    phases: ['mid'], when: (L) => !L.flags.tradeAsk && L.contract && L.contract.years >= 1, weight: (L) => clubNet(L, L.team) < -2 ? 4 : 1.5,
    tag: 'Your phone',
    title: 'Your name is in trade talks',
    /* On a story career the deadline is a real day that has already passed
       when this is dealt (tradeDeadline), so the talk is about the summer. */
    text: (L) => ('The deadline came and went. The rumors didn\'t. Every summer mock trade has your name in it.'),
    options: [
      { label: 'Tell them you want to stay', hint: 'Plant your flag', run: (L, r) => { bump(L, { trust: 6 }); return '{gm} says he hears you. Summer will tell.'; } },
      { label: 'Ask to go to a contender', hint: 'Chase a ring', run: (L, r) => { if (L.contract && L.contract.years >= 2) { L.flags.tradeAsk = true; bump(L, { trust: -6 }); return '{agent} makes the call. If it happens, it\'s this summer.'; } bump(L, { trust: -4 }); return 'You\'re a free agent this summer anyway. The call just annoys {gm}.'; } },
      { label: 'Keep quiet', hint: 'Let it play out', run: (L, r) => { return 'You let your game do the talking. The rumors fade by April.'; } },
    ],
  },
  tank: {
    phases: ['late'], when: (L) => L.season && (L.season.l - L.season.w) >= 10, weight: () => 4,
    tag: 'GM\'s office',
    title: 'The front office is playing for the lottery',
    text: () => '{gm} slides a minutes limit across the desk. "Rest of the year. It\'s for the future."',
    options: [
      { label: 'Go along with it', hint: 'Play the long game', run: (L) => { bump(L, { min: -6, health: 6, trust: 4 }); return 'Fewer minutes, fresher legs, smaller numbers.'; } },
      { label: 'Refuse and keep playing', hint: 'Compete anyway', run: (L) => { bump(L, { trust: -8, fame: 3, win: 0.4 }); return 'You play it out, and win them two games they didn\'t want.'; } },
      { label: 'Ask for a trade', hint: 'Win somewhere else', run: (L) => { L.flags.tradeAsk = true; bump(L, { trust: -10 }); return 'You want to win now, and they hear it.'; } },
    ],
  },
  injury_tweak: {
    phases: ['mid', 'late'], when: () => true, weight: (L) => L.m.health < 55 ? 4 : 1.5,
    tag: 'Trainer\'s room',
    title: 'Your hamstring grabs. Sit or play?',
    text: () => '{trainer} presses on it and frowns. "Not bad yet. Keep sprinting on it and it will be."',
    options: [
      { label: 'Play through it', hint: 'Tape it and go', run: (L, r) => { if (ok(r, 0.6)) { bump(L, { trust: 4, health: -4 }); return 'Taped up. It holds.'; } bump(L, { health: -10, risk: 0.05, perf: -0.5 }); return 'It gets worse. You\'re a step slow for weeks.'; } },
      { label: 'Sit out a week', hint: 'Rest it right', run: (L) => { bump(L, { health: 8, rest: 0.05 }); return 'A week off, and you\'re back to normal.'; } },
      { label: 'Get a second opinion', hint: 'Pay for peace of mind', run: (L) => { bump(L, { cash: -0.1, health: 5 }); return 'Dr. {doctor:last} costs a fortune. Good advice, though.'; } },
    ],
  },
  shoe_deal: {
    phases: ['pre', 'mid', 'off'], once: true, req: { fame: [55, null] }, weight: () => 4,
    tag: 'Agent\'s office',
    title: 'Two shoe companies want you. Which one?',
    text: () => 'One is the biggest brand in the world. The other will put your name on your own shoe.',
    options: [
      { label: 'Sign with the biggest brand', hint: 'Safe, huge money', run: (L) => { L.endorseBonus = (L.endorseBonus || 0) + 4; bump(L, { fame: 4 }); return 'Big money, and you\'re one of forty faces on their wall.'; } },
      { label: 'Get your own signature shoe', hint: 'Bet on your name', run: (L, r) => { L.endorseBonus = (L.endorseBonus || 0) + 2; bump(L, { fame: 9 }); if (ok(r, 0.5)) { L.endorseBonus += 3; return 'The first colorway sells out in an hour.'; } return 'Smaller check, your name on a box. Sales are fine.'; } },
      { label: 'Stay unsigned for now', hint: 'Wear what you want', run: (L) => { bump(L, { morale: 2 }); return 'You wear whatever you like. Nobody pays you for it.'; } },
    ],
  },
  local_ad: {
    phases: ['pre', 'early', 'off'], req: { fame: [25, null] }, weight: () => 2,
    tag: 'Car lot',
    title: 'A car dealership wants a commercial',
    text: () => '"Thirty seconds," the director says. "You hold a key, point at the camera, done."',
    options: [
      { label: 'Shoot the commercial', hint: 'Easy money', run: (L, r) => { bump(L, { cash: 0.25, fame: 2 }); if (ok(r, 0.35)) { bump(L, { fame: 4 }); return 'It\'s so bad it goes viral. Everybody quotes it.'; } return 'Easy money. Your mom, {mom}, loves it.'; } },
      { label: 'Pass on it', hint: 'Protect the brand', run: (L) => { bump(L, { morale: 1 }); return 'Your brand stays clean.'; } },
    ],
  },
  online_beef: {
    phases: ['early', 'mid', 'late'], req: { fame: [30, null] }, weight: () => 2,
    tag: 'Your phone',
    title: '{topp} called you overrated. Answer him?',
    text: () => 'He said it online, in front of everybody. You play him Friday.',
    options: [
      { label: 'Clap back online', hint: 'Win the thread', run: (L, r) => { bump(L, { fame: 6 }); if (ok(r, 0.5)) { bump(L, { morale: 6 }); return 'Your reply is funnier. The internet picks your side.'; } bump(L, { morale: -5 }); return 'He wins the thread, and it follows you for a week.'; } },
      { label: 'Answer him on Friday', hint: 'Let the game talk', run: (L, r) => { if (ok(r, 0.35 + (ovrOf(L) - 70) * 0.012)) { bump(L, { fame: 8, morale: 8, perf: 0.3 }); return 'You torch him, and never say a word.'; } bump(L, { morale: -6 }); return 'He gets the better of you. Now it\'s a thing.'; } },
      { label: 'Ignore it', hint: 'Rise above it', run: (L) => { bump(L, { trust: 2 }); return '{tvet} respects that.'; } },
    ],
  },
  ref_heat: {
    phases: ['early', 'mid', 'late'], when: () => true, weight: () => 1.5,
    tag: 'Courtside',
    title: 'Third straight no-call. Say something?',
    text: () => 'You got hammered on the drive again. Referee {ref} is right there, and he looks away.',
    options: [
      { label: 'Let him have it', hint: 'Worth a tech', run: (L, r) => { bump(L, { fame: 3, cash: -0.04 }); if (ok(r, 0.5 + hotTax(L))) { bump(L, { trust: -5 }); return 'Ejected and fined. The crowd loves you for it.'; } return 'A technical. Worth it, you decide.'; } },
      { label: 'Walk it off', hint: 'Bank the next call', run: (L) => { bump(L, { iq: 1 }); return 'You get the next call. Funny how that works.'; } },
    ],
  },
  heckler: {
    phases: ['mid', 'late'], req: { fame: [20, null] }, weight: () => 1.2,
    tag: 'Courtside',
    title: 'A courtside fan is going after your family',
    text: () => 'He\'s been at it all night, loud enough for the bench to hear. Security hasn\'t moved.',
    options: [
      { label: 'Confront him', hint: 'Stand up for them', run: (L, r) => { if (ok(r, 0.4 - hotTax(L))) { bump(L, { fame: 5, trust: -3 }); return 'Words only. He\'s banned, and you\'re a folk hero.'; } bump(L, { fame: 6, cash: -0.2, trust: -6, rest: 0.03 }); return 'It gets out of hand. You\'re suspended two games.'; } },
      { label: 'Tell security', hint: 'Handle it right', run: (L) => { bump(L, { trust: 3 }); return 'He\'s gone by the third quarter. The league backs you.'; } },
      { label: 'Wink and hit a three', hint: 'Answer with a splash', run: (L, r) => { if (ok(r, L.rt.sho / 120)) { bump(L, { fame: 6, morale: 5 }); return 'Splash. You blow him a kiss, and the clip is everywhere.'; } bump(L, { morale: -2 }); return 'Brick. He gets louder.'; } },
    ],
  },
  charity: {
    phases: ['pre', 'off', 'mid'], req: { cash: 0.5 }, weight: () => 2,
    tag: 'Back home',
    title: (L) => L.flags.gym ? 'The rec center back home is falling apart' : 'Your old high school gym is falling apart',
    text: () => 'Rain drips through the roof onto the court. They\'re asking if you can help.',
    options: [
      { label: 'Pay for a new gym', hint: 'Leave something behind', run: (L) => { const c = Math.min(L.cash * 0.5, 2.5); bump(L, { cash: -c, fame: 6, morale: 8 }); L.flags.gym = true; return arcStart(L, 'gym', 'arc_gym_2', 'off', 0, { kid: personName(L, 'campkid:' + L.year) }) ? 'Construction starts Monday. It opens next summer.' : 'Your name goes on the wall. The kids lose their minds.'; } },
      { label: 'Run a free camp', hint: 'Give your time', run: (L) => { bump(L, { fame: 3, morale: 5, health: -2 }); return 'Three hundred kids show up. One of them can really play.'; } },
      { label: 'Not right now', hint: 'Maybe next year', run: (L) => { bump(L, { morale: -2 }); return 'You tell yourself next year.'; } },
    ],
  },
  family_money: {
    phases: ['pre', 'off', 'early'], req: { cash: 1 }, weight: () => 2,
    tag: 'Your phone',
    title: 'Your cousin {cousin:first} needs money',
    text: (L) => times(L, 'family_money') > 1 ? 'He\'s short again, and it\'s a lot.' : 'He\'s in a jam, and it\'s a lot. "I\'ll pay you back, I swear."',
    options: [
      { label: 'Give him the money', hint: 'No questions asked', run: (L) => { bump(L, { cash: -Math.min(0.5, L.cash * 0.2), morale: 3 }); return 'Family is family. You\'ll hear from him again.'; } },
      { label: 'Set up a family trust', hint: 'Help, with rules', run: (L) => { bump(L, { cash: -Math.min(0.8, L.cash * 0.25), morale: 6 }); L.flags.savvy = true; return 'Structure and rules. Fewer awkward calls.'; } },
      { label: 'Say no', hint: 'Draw a line', run: (L) => { bump(L, { morale: -5 }); return 'Thanksgiving is quiet this year.'; } },
    ],
  },
  investment: {
    phases: ['pre', 'off'], req: { cash: 1.5 }, weight: () => 2,
    tag: 'Friend\'s pitch',
    title: (L) => times(L, 'investment') > 1 ? '{friend} is back with a new idea' : '{friend} from back home has a business idea',
    text: () => 'Streetwear, burgers or an app, it changes weekly. "I just need a partner," he says.',
    options: [
      { label: 'Go all in', hint: 'Big risk, big upside', run: (L, r) => { const st = Math.min(L.cash * 0.4, 4);
        if (!(L.arcs && L.arcs.venture)) {
          const good = ok(r, L.flags.savvy ? 0.6 : 0.5), boom = good && ok(r, 0.6);
          bump(L, { cash: -st });
          arcStart(L, 'venture', 'arc_venture_2', 'off', 1, { in: round1(st), more: round1(Math.max(0.2, st * 0.5)), good, boom });
          return 'You put in ' + money(round1(st)) + '. It opens in the spring.';
        }
        if (ok(r, L.flags.savvy ? 0.45 : 0.3)) { bump(L, { cash: st * 1.8, fame: 2 }); return 'It works. You\'re an owner now.'; } bump(L, { cash: -st, morale: -5 }); return 'It doesn\'t work. Neither does the friendship.'; } },
      { label: 'Put in a little', hint: 'Hedge your bet', run: (L, r) => { const st = Math.min(L.cash * 0.1, 1); if (ok(r, 0.45)) { bump(L, { cash: st * 1.5 }); return 'A small win and a good story.'; } bump(L, { cash: -st }); return 'Gone. Cheap lesson.'; } },
      { label: 'Pass on it', hint: 'Keep it simple', run: () => 'You keep the money, and you keep the friend.' },
    ],
  },
  podcast: {
    phases: ['off', 'pre'], once: true, req: { fame: [45, null], seasons: [2, null] }, weight: () => 1.5,
    tag: 'The studio',
    title: 'A network wants you to host a podcast',
    text: () => 'Weekly, unfiltered, good money. "Just be yourself," the producer says. That\'s the risk.',
    options: [
      { label: 'Start the podcast', hint: 'Say what you think', run: (L, r) => { bump(L, { fame: 8, cash: 0.4 }); if (ok(r, 0.3)) { bump(L, { trust: -8 }); return 'Episode six says too much about the front office. {gm} calls.'; } return 'It\'s a hit. Players start calling in.'; } },
      { label: 'Not while I\'m playing', hint: 'Ball comes first', run: (L) => { bump(L, { trust: 3 }); return '{gm} appreciates the focus.'; } },
    ],
  },
  body_care: {
    phases: ['pre', 'off'], once: true, req: { age: [27, null], cash: 1 }, weight: () => 3,
    tag: 'Your kitchen',
    title: '{guru}, a longevity coach, wants to rebuild you',
    text: () => 'Chef, sleep coach, cold tub, the works. "Your thirties can be your best years." It isn\'t cheap.',
    options: [
      { label: 'Buy the whole program', hint: 'Invest in your body', run: (L) => { bump(L, { cash: -Math.min(1.2, L.cash * 0.3), dur: 10, health: 10 }); L.flags.longevity = true; return 'You feel twenty-five. Your decline will come slower.'; } },
      { label: 'Just hire the chef', hint: 'Start with the food', run: (L) => { bump(L, { cash: -0.3, health: 6, dur: 4 }); return 'You eat better, and it helps.'; } },
      { label: 'Skip it, you\'re fine', hint: 'Trust what works', run: (L) => { bump(L, { morale: 1 }); return 'You\'re fine. For now.'; } },
    ],
  },
  load_mgmt: {
    phases: ['early', 'mid'], when: (L) => L.age >= 30 && L.season && L.season.role && L.season.role.starter, weight: () => 3,
    tag: 'Trainer\'s room',
    title: 'Rest on back-to-backs this year?',
    text: () => 'Dr. {doctor:last} has a plan: twelve games off. "You\'ll be fresher in April. Trust me."',
    options: [
      { label: 'Agree to the rest', hint: 'Save it for April', run: (L) => { bump(L, { rest: 0.15, health: 8 }); return 'You sit in a suit twelve times. Your knees thank you.'; } },
      { label: 'Refuse. Play every night.', hint: 'Old school', run: (L) => { bump(L, { fame: 3, health: -6, risk: 0.03, trust: 2 }); return 'The fans love it. Your body has notes.'; } },
    ],
  },
  mentor_rookie: {
    phases: ['early'], req: { age: [29, null], seasons: [6, null] }, weight: () => 2,
    tag: 'Practice',
    title: '{trook} follows you everywhere',
    text: (L) => { const p = L.people && L.people['trook:' + peopleKey(L, 'trook')]; return p && p.met < L.year ? 'Second year, and he still has your poster on his wall.' : 'The rookie grew up with your poster on his wall. Now he shows up to your lifts.'; },
    options: [
      { label: 'Take him under your wing', hint: 'Pass it on', run: (L) => { bump(L, { trust: 6, morale: 6, win: 0.3 }); return 'He gets better fast, and so does the team.'; } },
      { label: 'Let him learn the hard way', hint: 'Nobody helped you', run: (L) => { bump(L, { morale: -1 }); return 'That\'s how you learned.'; } },
    ],
  },
  contract_year: {
    phases: ['early'], req: { contract: [1, 1] }, weight: () => 4,
    tag: 'Training camp',
    title: 'Contract year. How do you play it?',
    text: () => 'Everybody knows your deal is up. Every shot feels like a negotiation.',
    options: [
      { label: 'Hunt your numbers', hint: 'Get paid', run: (L) => { bump(L, { usage: 0.03, win: -0.4, trust: -3 }); return 'You hunt shots. The stats look great.'; } },
      { label: 'Play winning basketball', hint: 'Team before money', run: (L) => { bump(L, { win: 0.5, trust: 5 }); return 'You do the little things. Front offices notice that too.'; } },
      { label: 'Protect your body', hint: 'Stay in one piece', run: (L) => { bump(L, { min: -3, health: 8, risk: -0.03 }); return 'Healthy in July is the whole point.'; } },
    ],
  },
  media_day: {
    phases: ['pre'], when: () => true, weight: () => 2,
    tag: 'Media day',
    title: 'Media day. What are your goals?',
    text: () => 'Twenty microphones and one question: what\'s this season about for you?',
    options: [
      { label: 'Say MVP', hint: 'Aim at the top', run: (L, r) => { bump(L, { fame: 6 }); if (ovrOf(L) >= 85) { bump(L, { morale: 4 }); return 'Nobody laughs. That\'s the point.'; } bump(L, { morale: -3 }); return 'A few people laugh. You remember who.'; } },
      { label: 'Say winning games', hint: 'The safe answer', run: (L) => { bump(L, { trust: 4 }); return '{gm} likes that answer.'; } },
      { label: 'Say staying healthy', hint: 'Honest and boring', run: (L) => { bump(L, { health: 2 }); return 'Boring. True.'; } },
    ],
  },
  /* Your club's own firing. It is the real carousel: the coach really goes,
     the assistant really runs the bench, and the answer is who the club
     hires. The two names on the buttons are real candidates. */
  coach_fired: {
    phases: ['mid'], weight: () => 2.5,
    when: (L) => { if (!L.season || L.season.l - L.season.w < 8 || !L.team) return false; const x = coachOf(L, L.team); return !!x && !x.interim && L.year - x.since >= 1; },
    queue: (L) => {
      const rng = rngAt(L, 'cfire');
      const out = fire(L, L.team, 0);
      const asst = weighted(rng, coachCandidates(L, L.team, true, rng), (y) => y.w);
      const bigs = coachCandidates(L, L.team, false, rng).filter((y) => y.n !== asst.n && !y.gen);
      const big = weighted(rng, bigs, (y) => y.w) || asst;
      const other = weighted(rng, bigs.filter((y) => y.n !== big.n), (y) => y.w) || asst;
      L.flags.search = { out: out ? out.n : '', asst, big, other };
      hire(L, L.team, asst, true);
    },
    tag: 'GM\'s office',
    title: 'The club fires {firedcoach}',
    text: () => '{interim} has the bench for now. General manager {gm} wants to know who you want next.',
    options: [
      { label: 'Back {interim}', hint: 'Keep things steady', run: (L) => { const x = coachOf(L, L.team); if (x) x.interim = 0; L.m.trust = 62; bump(L, { win: 0.4 }); return '{coach} gets the job, and he remembers who backed him.'; } },
      { label: 'Ask for {bigname}', hint: 'Swing for a big name', run: (L, r) => { const f = L.flags.search; if (ok(r, 0.5)) { hire(L, L.team, f.big, false); L.m.trust = 55; bump(L, { win: 1 }); return 'They land {coach}. Practices get serious.'; } hire(L, L.team, f.other, false); L.m.trust = 40; return 'They hire {coach} instead. He heard you asked for {bigname}.'; } },
      { label: 'Stay out of it', hint: 'Not your call', run: (L, r) => { const f = L.flags.search; if (r() < 0.5) { const x = coachOf(L, L.team); if (x) x.interim = 0; } else hire(L, L.team, f.other, false); L.m.trust = 50; return 'Not your job, literally. {gm} hands it to {coach}.'; } },
    ],
  },
  buzzer: {
    phases: ['early', 'mid', 'late'], req: { minutes: [24, null] }, weight: () => 2.5,
    tag: 'Final seconds',
    title: 'Down one, four seconds left. Your ball.',
    text: () => 'It\'s the regular season, but the building doesn\'t know that. Everybody\'s standing.',
    options: [
      { label: 'Step-back three', hint: 'Pure shooting', run: (L, r) => buzzer(L, r, 0.2 + (L.rt.sho - 50) * 0.0065) },
      { label: 'Attack the rim', hint: 'Speed and strength', run: (L, r) => buzzer(L, r, 0.24 + ((L.rt.fin + L.rt.ath) / 2 - 50) * 0.006) },
      { label: 'Draw a foul', hint: 'Out-think them', run: (L, r) => buzzer(L, r, 0.22 + (L.rt.iq - 50) * 0.006) },
    ],
  },
  olympics: {
    phases: ['off'], when: (L) => (L.year % 4 === 0) && ovrOf(L) >= 82, weight: () => 9,
    tag: 'Your phone',
    title: 'Team USA calls. Play this summer?',
    text: () => 'Twelve spots, and one is yours if you want it. The other choice is a summer off.',
    options: [
      { label: 'Go for gold', hint: 'Play for the flag', run: (L, r) => { bump(L, { health: -10, fame: 6 }); if (ok(r, 0.78)) { L.flags.olympic = (L.flags.olympic || 0) + 1; const h = L.history[L.history.length - 1]; if (h) h.aw.push('olympic'); logIt(L, 'Olympic gold.', 'gold'); return 'Gold. The anthem hits different.'; } return 'Silver. It stings for a long time.'; } },
      { label: 'Rest this summer', hint: 'Save your legs', run: (L) => { bump(L, { health: 6 }); return 'Your legs needed it.'; } },
    ],
  },
  superteam: {
    phases: ['off'], when: (L) => ovrOf(L) >= (82) && L.contract && L.contract.years >= 1 && clubNet(L, L.team) < (3), weight: (L) => (3),
    tag: 'Your phone',
    title: '{agent} has a contender on the line',
    text: () => '"Two stars there want a third," {agent} says. "They want you, and an answer this week."',
    options: [
      { label: 'Request the trade', hint: 'Chase the ring', run: (L, r) => { tradeNow(L, r, true); bump(L, { fame: 5, trust: 0 }); return 'It happens. The league calls it a superteam.'; } },
      { label: 'Stay loyal', hint: 'Build it here', run: (L) => { bump(L, { morale: 4, fame: 2, trust: 8 }); return 'You hang up. Your city notices.'; } },
    ],
  },
  rap_album: {
    phases: ['off'], once: true, req: { fame: [50, null] }, weight: () => 1,
    tag: 'The studio',
    title: 'You\'ve been making music. Release it?',
    text: () => 'A label heard the demos you play in the car. They want a full album.',
    options: [
      { label: 'Drop the album', hint: 'Go all the way', run: (L, r) => { if (ok(r, 0.3)) { bump(L, { fame: 10, cash: 0.6 }); return 'It charts. Nobody saw that coming.'; } bump(L, { fame: 4, morale: -3 }); return 'The reviews are brutal. The fans are kind.'; } },
      { label: 'Keep it for yourself', hint: 'Just for you', run: (L) => { bump(L, { morale: 3 }); return 'Some things are just for the car.'; } },
    ],
  },
  rehab_summer: {
    /* Asked after developStory() has already given the summer's health back, so it
       keys on the season that took it rather than on the meter. */
    phases: ['off'], when: (L) => !!(L.season && (L.season.out >= 12 || L.age >= 31)), weight: () => 3,
    tag: 'The offseason',
    title: 'Your body is tired. Rest or work?',
    text: () => 'Dr. {doctor:last} wants a quiet summer. {trainer}, your trainer, wants to get to work.',
    options: [
      { label: 'Rest all summer', hint: 'Heal first', run: (L) => { bump(L, { health: 14 }); return 'Sleep, swim, repeat.'; } },
      { label: 'Work anyway', hint: 'Never take a summer off', run: (L) => { bump(L, { health: -4, eth: 4, sho: 1 }); return 'You put the work in anyway. That\'s who you are.'; } },
    ],
  },  rival_trash: {
    phases: ['early', 'mid'], when: (L) => rivalOn(L) && L.m.fame >= 25, weight: () => 2.5,
    tag: 'Your phone',
    title: 'Your draft-class rival is talking',
    text: (L) => L.rival.name + ' says on a podcast that you were the wrong pick. There\'s video.',
    options: [
      { label: 'Answer on the court', hint: 'Make it personal', run: (L, r) => { if (ok(r, 0.45 + (ovrOf(L) - L.rival.ovr) * 0.04)) { bump(L, { fame: 7, morale: 6 }); L.flags.rivalWins = (L.flags.rivalWins || 0) + 1; return 'You see him in March. You win and outscore him by fifteen.'; } bump(L, { morale: -6 }); return 'You see him in March. He wins, and says so loudly.'; } },
      { label: 'Answer online', hint: 'Win the internet', run: (L, r) => { bump(L, { fame: 5, trust: -2 }); if (ok(r, 0.5)) return 'Your reply beats his podcast. The internet agrees.'; bump(L, { morale: -3 }); return 'He has better writers. It drags on for a week.'; } },
      { label: 'Say nothing', hint: 'Let him talk', run: (L) => { bump(L, { trust: 3 }); return '{tvet} tells you that was the right answer.'; } },
    ],
  },
  rival_tv: {
    phases: ['late'], when: (L) => rivalOn(L) && L.rival.ovr >= 74 && ovrOf(L) >= 74, weight: () => 2,
    tag: 'National TV',
    title: 'You and your rival, on national TV',
    text: (L) => 'The whole broadcast is about you and ' + L.rival.name + '. Every timeout cuts to the two of you.',
    options: [
      { label: 'Guard him yourself', hint: 'Take him personally', run: (L, r) => { if (ok(r, 0.35 + (L.rt.def - 70) * 0.02)) { bump(L, { fame: 6, def: 1 }); L.flags.rivalWins = (L.flags.rivalWins || 0) + 1; return 'He goes five for eighteen. You hear about it all week.'; } bump(L, { morale: -4 }); return 'He gets his: thirty-two, all on you.'; } },
      { label: 'Outscore him', hint: 'Make it a shootout', run: (L, r) => { if (ok(r, 0.4 + (ovrOf(L) - L.rival.ovr) * 0.04)) { bump(L, { fame: 8, morale: 6 }); L.flags.rivalWins = (L.flags.rivalWins || 0) + 1; return 'Forty to his twenty-six. The clip of you waving is everywhere.'; } bump(L, { morale: -5 }); return 'He wins the duel and the game.'; } },
      { label: 'Make it about the team', hint: 'Bigger than him', run: (L) => { bump(L, { trust: 4, win: 0.3 }); return 'A team win. The broadcast is disappointed.'; } },
    ],
  },
  meet_someone: {
    phases: ['off', 'pre'], req: { rel: 'single', age: [21, null] }, weight: () => 2.2,
    tag: 'Birthday dinner',
    title: 'Somebody across the table catches your eye',
    text: () => '{partner} is at {friend:first}\'s birthday dinner. They have no idea who you are, and you like that.',
    options: [
      { label: 'Ask them out', hint: 'Take your shot', run: (L, r) => { if (ok(r, 0.7)) { const f = lifeOf(L); f.rel = 'dating'; f.since = L.year; bump(L, { morale: 8 }); logIt(L, 'Met {partner}.', 'good'); relate(L, 'partner', 30, 'You met at a birthday dinner.'); return 'Dinner turns into a whole weekend. You\'re smitten.'; } bump(L, { morale: -2 }); lifeOf(L).pn = (lifeOf(L).pn || 0) + 1; return 'They\'re not interested. That hasn\'t happened in years.'; } },
      { label: 'Head home early', hint: 'Ball comes first', run: (L) => { bump(L, { eth: 2 }); return 'You go home early and watch film.'; } },
    ],
  },
  propose: {
    phases: ['off', 'pre'], when: (L) => lifeOf(L).rel === 'dating' && L.year - lifeOf(L).since >= 1, weight: () => 3,
    tag: 'Home',
    title: 'There\'s a ring in your pocket. Ask?',
    text: (L) => yearsWith(L) + ' with {partner}. The jeweler swears it\'s perfect.',
    options: [
      { label: 'Propose', hint: 'All in', run: (L, r) => { const f = lifeOf(L); if (ok(r, 0.85)) { f.rel = 'engaged'; bump(L, { morale: 10 }); logIt(L, 'Engaged to {partner}.', 'good'); relate(L, 'partner', 25, 'You proposed. Yes.'); return 'Yes, before you even finish the question.'; } f.rel = 'single'; bump(L, { morale: -12 }); const nm = say(L, '{partner}'); f.pn = (f.pn || 0) + 1; return nm + ' says they need time. Then they need space.'; } },
      { label: 'Not yet', hint: 'Wait for the moment', run: (L) => { bump(L, { morale: -1 }); return 'The ring goes back in the drawer.'; } },
    ],
  },
  wedding: {
    phases: ['off'], req: { rel: 'engaged' }, weight: () => 6,
    tag: 'Home',
    title: 'Big wedding or small one?',
    text: () => '{partner} has a guest list going. {tm} already has opinions about the DJ.',
    options: [
      { label: 'Throw the party of the year', hint: 'Go big', run: (L) => { lifeOf(L).rel = 'married'; bump(L, { cash: -Math.min(1.5, L.cash * 0.15), fame: 4, morale: 10 }); logIt(L, 'Married {partner}.', 'gold'); return 'Four hundred guests. The whole roster dances.'; } },
      { label: 'Keep it small', hint: 'Just family', run: (L) => { lifeOf(L).rel = 'married'; bump(L, { morale: 10 }); logIt(L, 'Married {partner}.', 'gold'); return 'Family only, on a beach. Perfect.'; } },
    ],
  },
  baby: {
    phases: ['off', 'pre'], when: (L) => lifeOf(L).rel === 'married' && lifeOf(L).kids < 4 && L.age <= 38, weight: () => 2,
    tag: 'Home',
    title: '{partner} wants to talk about kids',
    text: (L) => lifeOf(L).kids ? 'Another one? The house is already loud.' : 'You always said you wanted a big family.',
    options: [
      { label: 'Start a family', hint: 'Grow the house', run: (L) => {
        const f = lifeOf(L); f.kids++; bump(L, { morale: 10, health: -3 });
        /* A story career knows boy or girl, because only a son can be played next. */
        const boy = kidIsSon(L, f.kids - 1); if (Number.isFinite(f.sons) && boy) f.sons++;
        logIt(L, (f.kids === 1 ? 'Became a parent. ' : 'Welcomed kid number ' + f.kids + '. ') + (boy ? 'A boy.' : 'A girl.'), 'good');
        return (f.kids === 1 ? 'A baby ' : 'Kid number ' + f.kids + ', a baby ') + (boy ? 'boy' : 'girl') + ' by next summer. ' + (f.kids === 1 ? 'You learn to sleep in two-hour pieces.' : 'The house gets louder.'); } },
      { label: 'Wait until you retire', hint: 'Career first', run: (L) => { bump(L, { morale: -2 }); return 'You agree to wait. Mostly.'; } },
    ],
  },
  breakup: {
    phases: ['off', 'mid'], when: (L) => lifeOf(L).rel === 'dating' && (L.m.morale < 45 || L.m.fame > 70), weight: () => 1.5,
    tag: 'Home',
    title: 'Things aren\'t good at home',
    text: () => 'Road trips, cameras, the group chat. "It\'s too much," {partner} says.',
    options: [
      { label: 'Fight for it', hint: 'Worth saving', run: (L, r) => { if (ok(r, 0.55)) { bump(L, { morale: 4 }); return 'Counseling, a vacation, a long talk. You make it.'; } lifeOf(L).rel = 'single'; bump(L, { morale: -10 }); lifeOf(L).pn = (lifeOf(L).pn || 0) + 1; return 'It ends anyway, quietly.'; } },
      { label: 'Let it go', hint: 'Walk away clean', run: (L) => { lifeOf(L).rel = 'single'; bump(L, { morale: -6 }); lifeOf(L).pn = (lifeOf(L).pn || 0) + 1; return 'You move out in the offseason.'; } },
    ],
  },
  hometown_call: {
    phases: ['off'], once: true, when: (L) => homeClub(L) && L.team && L.team !== homeClub(L) && ovrOf(L) >= 74 && L.contract && L.contract.years >= 1, weight: () => 3,
    tag: 'Your phone',
    title: 'Your hometown club calls',
    text: (L) => 'The ' + E.teamName(homeClub(L)) + ' want you home. Your mom, {mom}, already said yes for you.',
    options: [
      { label: 'Go home', hint: 'Play for your city', run: (L) => { joinTeam(L, homeClub(L), true); bump(L, { morale: 15, fame: 5 }); L.flags.home = true; return 'They trade for you. Your old coach {hscoach} is at the press conference.'; } },
      { label: 'Stay where you are', hint: 'Unfinished business', run: (L) => { bump(L, { trust: 6, morale: -2 }); return 'Not yet. Maybe at the end.'; } },
    ],
  },
  docuseries: {
    phases: ['pre', 'off'], once: true, req: { fame: [60, null] }, weight: () => 2,
    tag: 'Agent\'s office',
    title: 'A streamer wants a season-long documentary',
    text: () => 'Cameras in your house, your locker and your car, for a whole season.',
    options: [
      { label: 'Let them in', hint: 'Show everything', run: (L, r) => { bump(L, { fame: 10, cash: 0.8 }); if (ok(r, 0.6)) return 'It\'s a hit. Your mom, {mom}, becomes a star.'; bump(L, { trust: -8, morale: -3 }); return 'Episode four shows a locker room fight. Nobody forgets.'; } },
      { label: 'Produce it yourself', hint: 'Control the story', run: (L) => { bump(L, { fame: 7, cash: 0.4 }); return 'You control the edit. It\'s a little flattering.'; } },
      { label: 'No cameras', hint: 'Keep it private', run: (L) => { bump(L, { trust: 3 }); return 'Your teammates appreciate it.'; } },
    ],
  },
  teammate_fight: {
    phases: ['early', 'mid'], req: { minutes: [18, null] }, weight: () => 1.6,
    tag: 'Practice',
    title: '{tm} shoves you. Everybody stops.',
    text: () => 'Hard foul, harder words. The whole gym is waiting to see what you do.',
    options: [
      { label: 'Shove him back', hint: 'Hold your ground', run: (L, r) => { if (ok(r, 0.4 - hotTax(L))) { bump(L, { trust: 2, morale: 3 }); return '{coach} steps in. You two are fine by dinner.'; } bump(L, { rest: 0.04, trust: -8, fame: 3 }); return 'It leaks. You both get suspended a game.'; } },
      { label: 'Walk away', hint: 'Be the adult', run: (L) => { bump(L, { trust: 4, morale: -2 }); return 'You go shoot at the other end. The room respects it.'; } },
      { label: 'Settle it in a scrimmage', hint: 'Let the game decide', run: (L, r) => { if (ok(r, 0.5 + (ovrOf(L) - 72) * 0.02)) { bump(L, { trust: 6, morale: 5 }); return 'You cook him for twenty minutes. Nobody shoves you again.'; } bump(L, { morale: -4 }); return 'He cooks you, and the practice video gets around.'; } },
    ],
  },
  young_star: {
    phases: ['pre'], once: true, when: (L) => L.age >= 31 && L.season && L.seasonsDone >= 8, weight: () => 3,
    tag: 'Training camp',
    title: 'The club drafted {trook} at your spot',
    text: () => 'A teenager, the number two pick, same position. {gm} says the kid needs minutes.',
    options: [
      { label: 'Mentor him', hint: 'Pass the torch', run: (L) => { bump(L, { trust: 8, min: -2, morale: 4, win: 0.3 }); return 'He listens. He takes your minutes and thanks you for them.'; } },
      { label: 'Make him earn it', hint: 'Not without a fight', run: (L, r) => { if (ok(r, 0.5 + (ovrOf(L) - 76) * 0.03)) { bump(L, { min: 2, fame: 3 }); return 'You keep the job another year.'; } bump(L, { min: -5, morale: -6 }); return 'He wins the job by January.'; } },
      { label: 'Ask to be moved', hint: 'Start somewhere else', run: (L) => { L.flags.tradeAsk = true; bump(L, { trust: -8 }); return 'You want to start somewhere, and you say so.'; } },
    ],
  },
  buyout: {
    phases: ['mid'], once: true, when: (L) => L.age >= 33 && L.team && clubNet(L, L.team) < 0 && L.contract && L.contract.years >= 1, weight: () => 3,
    tag: 'GM\'s office',
    title: 'Your club offers a buyout',
    text: () => 'Give back some money, walk as a free agent, and chase a ring this spring.',
    options: [
      { label: 'Take it, join a contender', hint: 'One last shot', run: (L, r) => { bump(L, { cash: -Math.min(1.5, L.cash * 0.1) }); tradeNow(L, r, true); L.contract = { years: 1, total: 1, salary: round1(capFor(L.year) * MIN_PCT), kind: 'min', start: L.year }; return 'You sign with a contender the next day.'; } },
      { label: 'Finish it out here', hint: 'See it through', run: (L) => { bump(L, { trust: 5, morale: -2 }); return 'Loyal to the end. The young guys watch how you work.'; } },
    ],
  },
  christmas: {
    phases: ['early'], req: { fame: [45, null], starter: true }, weight: () => 2,
    tag: 'Christmas Day',
    title: 'You\'re on the Christmas Day schedule',
    text: () => 'It\'s the biggest regular season stage there is. Every family in the country has it on.',
    options: [
      { label: 'Custom shoes, take over', hint: 'Own the stage', run: (L, r) => { if (ok(r, 0.35 + (ovrOf(L) - 75) * 0.025)) { bump(L, { fame: 8, morale: 6 }); return 'Thirty-eight points, and the shoes sell out by New Year.'; } bump(L, { fame: 2, morale: -4 }); return 'Cold night. The shoes were nice.'; } },
      { label: 'Just play your game', hint: 'Keep it normal', run: (L) => { bump(L, { trust: 3, win: 0.2 }); return 'A win in front of everybody. That\'s the gift.'; } },
    ],
  },
  agent_pitch: {
    phases: ['off'], once: true, when: (L) => L.seasonsDone >= 3 && L.agent !== 'power', weight: () => 2,
    tag: 'Dinner meeting',
    title: '{newagent} from a power agency wants you',
    text: () => '"Bigger deals, bigger shoe money," {newagent} says. "We take four percent. Worth every point."',
    options: [
      { label: 'Switch agents', hint: 'Chase the big money', run: (L) => { const old = say(L, '{agent}'); L.agent = 'power'; bump(L, { morale: 2 }); logIt(L, 'Signed with {agent} of a power agency.', ''); return old + ' takes it personally.'; } },
      { label: 'Stay with {agent}', hint: 'Loyalty matters', run: (L) => { bump(L, { morale: 3 }); return '{agent} cries on the phone. Good tears.'; } },
    ],
  },
  playoff_guarantee: {
    phases: ['late'], when: (L) => L.season && L.season.seed && L.season.seed <= 8 && L.m.fame >= 35, weight: () => 2.5,
    tag: 'Media scrum',
    title: 'Can you win the series? Say it.',
    text: () => '{reporter} asks if you can win the first round. The cameras lean in.',
    options: [
      { label: 'Guarantee it', hint: 'Put it on record', run: (L, r) => { bump(L, { fame: 6 }); if (ok(r, 0.55)) { bump(L, { win: 0.5, morale: 4 }); return 'The room goes quiet. Your teammates love it.'; } bump(L, { morale: -3, trust: -3 }); return 'The other team pins the quote on their wall.'; } },
      { label: 'One game at a time', hint: 'Nothing they can use', run: (L) => { bump(L, { trust: 3 }); return 'Boring. Correct.'; } },
    ],
  },
  /* THE RELATIONSHIP WEB. Each of these is dealt off a meter in the person
     ledger, so it only comes to a career that earned it. */
  agent_rift: {
    phases: ['off'], when: (L) => relOf(L, 'agent') <= -20, weight: 4,
    tag: 'Agent\'s office',
    title: '{agent} wants a word',
    text: () => '"You stopped listening to me," {agent} says. "I have other clients, you know."',
    options: [
      { label: 'Make it right', hint: 'Patch it up', run: (L) => { relate(L, 'agent', 35, 'You patched it up over dinner.'); bump(L, { morale: 2 }); return 'Dinner and an apology. {agent} picks up on the first ring again.'; } },
      { label: 'Fire your agent', hint: 'Fresh start', run: (L) => { const old = say(L, '{agent}'); L.agent = L.agent === 'power' ? 'boutique' : 'power'; relate(L, 'agent', 10, 'He took you on after the split.'); logIt(L, 'Fired ' + old + '. Signed with {agent}.', ''); return old + ' is out. {agent} starts Monday.'; } },
    ],
  },
  mom_game: {
    phases: ['early', 'mid'], once: true, req: { team: true }, when: (L) => relOf(L, 'mom') >= 25, weight: 2.5,
    tag: 'Your phone',
    title: '{mom} wants to see you play',
    text: () => '"Front row, just once," {mom} says. She\'s never seen a game in your building.',
    options: [
      { label: 'Fly her out this week', hint: 'Make her night', run: (L) => { bump(L, { cash: -0.05, morale: 8 }); relate(L, 'mom', 20, 'She saw you play from the front row.'); return 'Front row. She cheers every free throw, even theirs.'; } },
      { label: 'After the season', hint: 'Not the right time', run: (L) => { relate(L, 'mom', -5); return 'She says that\'s fine. It\'s mostly fine.'; } },
    ],
  },
  beat_feature: {
    phases: ['pre'], once: true, req: { team: true }, when: (L) => relOf(L, 'beat') >= 15, weight: 3,
    tag: 'Training camp',
    title: '{beat} wants to write a long feature',
    text: () => 'Three days with you: your family, your town, your work. "The real story," {beat} says.',
    options: [
      { label: 'Open up to him', hint: 'Let people in', run: (L) => { bump(L, { fame: 6 }); relate(L, 'beat', 20, 'He wrote your long feature.'); return 'It runs Sunday. Your mom reads it twice.'; } },
      { label: 'Keep it to basketball', hint: 'Stay guarded', run: (L) => { bump(L, { fame: 2 }); relate(L, 'beat', 5); return 'A good story. Not the one he wanted.'; } },
    ],
  },
  critic_segment: {
    phases: ['mid'], req: { fame: [35, null] }, when: (L) => relOf(L, 'critic') <= -10, weight: 3,
    tag: 'TV studio',
    title: '{critic} spends a whole segment on you',
    text: () => 'Eleven minutes, a graphic with your face on it, and one word: fraud.',
    options: [
      { label: 'Go on his show', hint: 'Face him directly', run: (L, r) => { if (ok(r, 0.5)) { relate(L, 'critic', 30, 'You went on his show and won the room.'); bump(L, { fame: 6 }); return 'You\'re funny and calm. He admits you have a point.'; } relate(L, 'critic', -15, 'You went on his show. It went badly.'); bump(L, { fame: 3, morale: -5 }); return 'He talks over you for ten minutes. It goes viral for him.'; } },
      { label: 'Answer with a win', hint: 'Let the box score talk', run: (L) => { bump(L, { win: 0.3, trust: 2 }); return 'Thirty and a win the next night. He moves on to somebody else.'; } },
    ],
  },
  bff_call: {
    phases: ['off'], when: (L) => { const b = bestMate(L); return !!(b && L.year - b.met >= 2); }, weight: 3, rarity: 'uncommon',
    tag: 'Your phone',
    title: '{bff} calls late',
    text: () => 'Your closest teammate. It\'s late, and he just wants to talk.',
    options: [
      { label: 'Stay up and talk', hint: 'Be there for him', run: (L) => { relate(L, 'bff', 15, 'You talked until three in the morning.'); bump(L, { morale: 6, health: -2 }); return 'Two hours, about everything except basketball.'; } },
      { label: 'Call him tomorrow', hint: 'You need sleep', run: (L) => { relate(L, 'bff', -5); return 'You forget. He doesn\'t mention it.'; } },
    ],
  },
  /* The setup of the feud arc. A real player on another club in the league
     (an invented one before it), named once and kept. */
  feud_start: {
    phases: ['early', 'mid'], req: { seasons: [1, null], fame: [25, null], minutes: [18, null] }, weight: 1.2, rarity: 'uncommon',
    queue: (L) => arcStart(L, 'feud', null, 'early', 1, { n: realOpp(L, 'foe:' + L.year) || personName(L, 'foe:' + L.year) }),
    tag: 'Your phone',
    title: '{foe} calls you soft',
    text: () => 'He said it on his podcast, by name. The clip is in your phone forty times.',
    options: [
      { label: 'Answer on the floor', hint: 'Circle the date', run: (L) => { arcGo(L, 'feud', 'arc_feud_2', 'early', 1); relate(L, 'foe', -15, 'He called you soft.'); return 'You find his team on next season\'s schedule. December.'; } },
      { label: 'Answer online', hint: 'Hit back now', run: (L) => { arcGo(L, 'feud', 'arc_feud_2', 'early', 1); relate(L, 'foe', -25, 'You went at him online.'); bump(L, { fame: 4 }); return 'Your reply does numbers. He answers in an hour.'; } },
      { label: 'Let it go', hint: 'Starve it', run: (L) => { arcEnd(L, 'feud', 'ignored'); bump(L, { trust: 2 }); return 'He tries twice more, then finds somebody else.'; } },
    ],
  },
  /* The two April cards of a story career. The regular season is over, so
     these are about what is left: the playoffs, or the summer. */
  playoff_eve: {
    phases: ['late'], when: (L) => !!(L.season && L.season.po && !L.season.po.out), weight: 3,
    tag: 'Film room',
    title: 'The playoffs start Saturday',
    text: () => '{coach} wants you guarding their best player. That\'s a lot to ask of your legs.',
    options: [
      { label: 'Take the assignment', hint: 'Stop their best', run: (L) => { bump(L, { def: 1, win: 0.3, health: -2 }); remember(L, 'po.stopper', L.year); return 'You fall asleep to their film.'; } },
      { label: 'Save your legs for scoring', hint: 'Score instead', run: (L) => { bump(L, { perf: 0.3, trust: -3 }); return 'He gives the job to {tvet}, and notes who asked.'; } },
    ],
  },
  exit_interview: {
    phases: ['late'], when: (L) => !!(L.season && L.season.po && L.season.po.out), weight: 3,
    tag: 'GM\'s office',
    title: 'Exit interview. What do you tell {gm}?',
    text: () => '{gm} has your season on one page. "So," he says. "Tell me about next year."',
    options: [
      { label: 'Promise a big summer', hint: 'Put it on you', run: (L) => { bump(L, { eth: 4, trust: 4 }); arcStart(L, 'promise', 'arc_promise_2', 'pre', 1, { ovr: ovrOf(L) }); return 'He writes it down. So do you.'; } },
      { label: 'Ask for roster help', hint: 'Put it on him', run: (L) => { bump(L, { trust: -2 }); const again = !!recall(L, 'asked.help'); remember(L, 'asked.help', L.year); return again ? 'He says he\'s working on it. He said that last time too.' : 'He says he\'s working on it.'; } },
      { label: 'Blame the system', hint: 'Point fingers', run: (L) => { bump(L, { trust: -8, fame: 2 }); remember(L, 'blamed.system', L.year); return '{beat} has it on the site by lunch.'; } },
    ],
  },
};

// ─── the people around you ──────────────────────────────────────────────────

/* A RIVAL FROM YOUR DRAFT CLASS. He is invented, like you, and he is drafted
   near you, so every season there is somebody your career is measured
   against. His seasons are drawn off a curve rather than played, because he
   exists to be compared with and nothing in the league runs through him. */
const RIVAL_FIRST = ['Terrence', 'Damon', 'Kobi', 'Jaylen', 'Desmond', 'Rico', 'Lamar', 'Tariq', 'Bryce', 'Keon',
  'Moses', 'Isaac', 'Dorian', 'Aaron', 'Javon', 'Corey', 'Emeka', 'Andrei', 'Felix', 'Royce'];
const RIVAL_LAST = ['Holloway', 'Stanfield', 'Mbeki', 'Carraway', 'Lindqvist', 'Prescott', 'Obiora', 'Brannigan',
  'Delacroix', 'Ruffin', 'Tillman', 'Varga', 'Kincaid', 'Osei', 'Pemberton', 'Lockhart', 'Winslow', 'Achebe'];

function makeRival(L, myPick) {
  const rng = rngAt(L, 'rival');
  let name = pick(rng, RIVAL_FIRST) + ' ' + pick(rng, RIVAL_LAST);
  if (name === L.name) name = pick(rng, RIVAL_FIRST) + ' Okafor-' + pick(rng, RIVAL_LAST);
  /* The kid from camp is the rival on draft night too. */
  if (recall(L, 'camp.met') && L.name !== CAST.dre) name = CAST.dre;
  const p = myPick ? clamp(myPick + (rng() < 0.5 ? -1 : 1) * (1 + Math.floor(rng() * 3)), 1, 60) : 1 + Math.floor(rng() * 14);
  const o = ovrOf(L);
  L.rival = {
    name, pos: pick(rng, POS), team: pick(rng, CLUBS.filter((c) => c !== L.team)), pick: p,
    age: L.age + (rng() < 0.5 ? 0 : 1), ovr: clamp(Math.round(o + norm(rng) * 2.5), 45, 80),
    pot: clamp(Math.round(L.pot + norm(rng) * 5), 60, 97), seasons: [], retired: false,
    star: 0, mvp: 0, rings: 0, pts: 0, gp: 0,
  };
  /* On a story career two men are never taken with one pick, and the rival
     goes to the club that really picks there. */
  const R = L.rival;
  if (myPick && R.pick === myPick) R.pick = myPick === 1 ? 2 : myPick - 1;
  const c = draftOrder(L)[R.pick - 1];
  if (c && c !== L.team) R.team = c;
}
function rivalSeason(L, beats) {
  const r = L.rival;
  if (!r || r.retired) return;
  const rng = rngAt(L, 'rivalyr');
  const gap = Math.max(0, r.pot - r.ovr);
  r.ovr = clamp(Math.round(r.ovr + gap * (GROW[r.age] || 0) * (0.8 + rng() * 0.6) - (DECLINE[r.age] || (r.age >= 38 ? 6 : 0)) * (0.7 + rng() * 0.6)), 40, 98);
  const pts = round1(clamp((r.ovr - 58) * 0.85 + norm(rng) * 2, 2, 34));
  const gp = Math.round(clamp(76 - Math.max(0, r.age - 30) * 3 + norm(rng) * 6, 30, 82));
  const aw = [];
  if (r.ovr + norm(rng) * 2 >= 87) { aw.push('star'); r.star++; }
  if (r.ovr >= 92 && rng() < 0.12) { aw.push('mvp'); r.mvp++; }
  if (rng() < clamp(0.03 + (r.ovr - 75) * 0.004, 0.01, 0.12)) { aw.push('champ'); r.rings++; }
  if (rng() < 0.12) r.team = pick(rng, CLUBS.filter((c) => c !== r.team));
  r.seasons.push({ y: L.year, age: r.age, team: r.team, ovr: r.ovr, pts, gp, aw });
  r.pts += Math.round(pts * gp); r.gp += gp;
  const first = r.name.split(' ')[0];
  if (aw.indexOf('mvp') >= 0) beats.push({ kind: 'rival', text: 'Your draft-class rival, ' + r.name + ', wins MVP.', tone: '' });
  else if (aw.indexOf('champ') >= 0) beats.push({ kind: 'rival', text: r.name + ' wins a ring with the ' + nick(r.team) + '.', tone: '' });
  else if (aw.indexOf('star') >= 0 && r.star === 1) beats.push({ kind: 'rival', text: first + ' makes his first All-Star team.', tone: '' });
  r.age++;
  if ((r.age >= 34 && (r.ovr < 68 || rng() < 0.25)) || r.age >= 39) {
    r.retired = true;
    beats.push({ kind: 'rival', text: r.name + ' retires. ' + r.pts.toLocaleString('en-US') + ' points.', tone: '' });
    logIt(L, 'Your draft-class rival ' + r.name + ' retired.', '');
  }
}
const rivalOn = (L) => !!(L.rival && !L.rival.retired);

/* A LIFE OFF THE FLOOR. The person you meet, the wedding, the kids. Each of
   them has a generated name ({partner}, keyed on `pn`, so a new relationship
   is a new person), and every one moves morale
   more than it moves anything about basketball, which is the BitLife half. */
function lifeOf(L) { return L.life || (L.life = { rel: 'single', kids: 0, since: 0 }); }
function lifeLine(L) {
  const f = lifeOf(L);
  const who = say(L, '{partner}');
  const rel = f.rel === 'married' ? 'Married to ' + who : f.rel === 'engaged' ? 'Engaged to ' + who : f.rel === 'dating' ? 'Dating ' + who : 'Single';
  if (f.kids) {
    const b = sonsOf(L), g = f.kids - b, parts = [];
    if (b) parts.push(b + (b === 1 ? ' son' : ' sons'));
    if (g) parts.push(g + (g === 1 ? ' daughter' : ' daughters'));
    return rel + ', ' + parts.join(' and ');
  }
  return rel + (f.kids ? ', ' + f.kids + (f.kids === 1 ? ' kid' : ' kids') : '');
}
/* Boy or girl, off the seed and the birth order, so it is never stored and
   never moves another draw. A save can carry a count instead (sons), which
   wins: it is what the page and the checker set. */
function kidIsSon(L, i) { return (E.hashSeed(String(L.seed) + ':kid:' + i) & 1) === 1; }
function sonsOf(L) {
  const f = lifeOf(L);
  if (Number.isFinite(f.sons)) return Math.max(0, Math.min(f.sons, f.kids || 0));
  let n = 0; for (let i = 0; i < (f.kids || 0); i++) if (kidIsSon(L, i)) n++;
  return n;
}

/* A hometown for the NBA's own clubs, so a road career can be called home. */
const HOME_CLUB = { Baltimore: 'WAS', Chicago: 'CHI', Houston: 'HOU', Atlanta: 'ATL', Oakland: 'GSW', Philadelphia: 'PHI',
  Dallas: 'DAL', Indianapolis: 'IND', Memphis: 'MEM', Detroit: 'DET', Brooklyn: 'BRK', Charlotte: 'CHO', Milwaukee: 'MIL',
  Phoenix: 'PHO', 'New Orleans': 'NOP', Akron: 'CLE', Gary: 'CHI', Newark: 'BRK', Minneapolis: 'MIN', Raleigh: 'CHO',
  Louisville: 'IND', Compton: 'LAL' };
const homeClub = (L) => (L.am && HOME_CLUB[L.am.town]) || null;

// ─── milestones ─────────────────────────────────────────────────────────────

const MILESTONES = [['pts', [10000, 20000, 25000, 30000, 35000, 40000], 'points'], ['reb', [10000, 15000], 'rebounds'],
  ['ast', [5000, 10000], 'assists'], ['gp', [1000, 1300], 'games']];
function milestones(L, before, beats) {
  const now = totals(L);
  for (const [k, steps, word] of MILESTONES) {
    for (const m of steps) {
      if (before[k] < m && now[k] >= m) {
        const t = m.toLocaleString('en-US') + ' career ' + word + '.';
        beats.push({ kind: 'milestone', text: t, tone: 'gold' });
        logIt(L, t, 'gold');
        bump(L, { fame: 3 });
      }
    }
  }
}

// ─── after basketball ───────────────────────────────────────────────────────

function chooseAfter(L, i, rng) {
  const T = totals(L);
  const big = T.star >= 3 || T.mvp || T.rings >= 2;
  let t = '';
  if (i === 0) t = L.rt.iq >= 72 && rng() < 0.6 ? (rng() < 0.4 ? 'You became a head coach and won a title from the sideline.' : 'You became a head coach.') : 'You became an assistant coach. The players swear by you.';
  else if (i === 1) t = L.m.fame >= 55 || big ? 'You became the voice of a national broadcast.' : 'You called games for your old club on local TV. Every night.';
  else if (i === 2) t = rng() < 0.45 + (L.rt.iq - 60) * 0.01 ? 'You became a general manager and built a contender.' : 'You ran scouting for a decade. Two of your picks made All-Star teams.';
  else if (i === 3) t = L.cash >= 20 && rng() < 0.5 ? 'You bought a piece of an NBA team.' : L.cash >= 3 ? 'You built a business. Restaurants first, then real estate.' : 'You opened a gym in your hometown.';
  else t = 'You went home. Now you coach your kids.';
  return t;
}

function buzzer(L, r, p) {
  if (ok(r, p + clutchBonus(L))) {
    if (L.season && L.season.l > 0) { L.season.w++; L.season.l--; }
    bump(L, { fame: 5, morale: 8, trust: 3 });
    L.flags.winners = (L.flags.winners || 0) + 1;
    clutchHit(L);
    return 'Splash. Ballgame. You\'re leading every highlight show tonight.';
  }
  bump(L, { morale: -4 });
  return 'Back iron. You\'ll see that one in your sleep.';
}
/* A trade forced by a card, mid-season or in a summer. On a story career the
   club that takes you is one with a use for you: a hole at your position
   counts as much as how good they are, and a real man goes back the other
   way, because nobody in this league is traded for nothing. */
function tradeNow(L, rng, contender) {
  const pool = CLUBS.filter((x) => x !== L.team);
  const to = (rostOf(L))
    ? weighted(rng, pool, (x) => (contender ? Math.max(0.2, clubNet(L, x) + 4) : 1) * (0.5 + needAt(L, x, L.pos)))
    : weighted(rng, pool, (x) => contender ? Math.max(0.2, clubNet(L, x) + 4) : 1);
  tradeTo(L, to, rng);
}
function tradeTo(L, to, rng) {
  const from = L.team;
  if (!to || to === from) return;
  joinTeam(L, to, true);
  if (from) { const b = swapBack(L, from, to, rng); if (b && TRADED) TRADED.back = b.n; }
  const s = L.season;
  if (s && s.g > 0 && s.g < GAMES) {
    /* The record follows the club, not the man: the new club's games so far. */
    const p = gameP(clubNet(L, to), true) - 0.03;
    s.w = clamp(Math.round(s.g * p + norm(rng) * 2), 0, s.g);
    s.l = s.g - s.w;
    s.team = to;
  }
}
