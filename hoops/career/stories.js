// ── origins (NARRATIVE.md 7.1) ──

story({
  /* Small-town unknown */
  ori_town_paper: { at: 'hs_sum hs', req: { origin: 'small_town', grade: [10, 11] }, w: 4, tag: 'The town paper',
    t: 'The town paper wants a story', x: 'The {town} weekly has never covered a sophomore. They want a photo at the county gym.',
    o: [O('Give the interview', { fame: 4, morale: 3 }, 'Front page, above the fold. Your mom buys twenty copies.', { sub: 'Enjoy the spotlight', set: 'town.paper', rel: [['hscoach', 10, 'You made the paper.']] }),
      O('Let the season talk', { eth: 3 }, 'They run a box score instead. You like it better.', { sub: 'Stay humble' })] },
  ori_county_gym: { at: 'hs', req: { origin: 'small_town' }, w: 3, tag: 'The county gym',
    t: 'The janitor hands you a key', x: 'The county gym opens at five if you have a key. "Lock up when you\'re done," he says.',
    o: [O('Be there at five', { sho: 2, def: 1, health: -4 }, 'Three hundred shots before school, every day. It shows by March.', { sub: 'Early mornings, real work' }),
      O('Sleep until seven', { health: 4, morale: 3 }, 'You keep the key on your ring anyway.', { sub: 'Growing bodies need rest' })] },
  ori_scout_lost: { at: 'hs_sum', req: { origin: 'small_town', mem: ['town.paper'] }, w: 4, tag: 'Summer',
    t: 'The showcase, or the town game?', x: "Every scout who matters will be at a showcase two states away. The town game's the same weekend.",
    o: [O('Drive to the showcase', { fame: 6, cash: -0.02 }, 'Nine hours each way. A scout writes your name down twice.', { sub: 'Chase the scouts', do: (L) => { if (L.am) L.am.rstock = (L.am.rstock || 0) + 0.7; } }),
      O('Stay for the town game', { morale: 6 }, 'The whole town comes. You score 31. Nobody here forgets it.', { sub: 'Play for home', set: 'town.stayed' })] },
  ori_town_return: { at: 'off', req: { origin: 'small_town', seasons: [3, null] }, w: 3, rar: 'uncommon', tag: 'Back home', cb: 'town.stayed',
    t: 'The town wants you back for a day', x: "They're naming the county gym after somebody. Everybody hopes it's you.",
    o: [O('Go home for it', { morale: 8, fame: 2 }, 'Your name goes up over the door. The key still works.', { sub: 'Be there in person', set: 'town.gym', rel: [['hscoach', 20, 'The gym has your name now.']] }),
      O('Send a check and a video', { cash: -0.3, morale: 2 }, 'They name it after you anyway. You watch the video twice.', { sub: 'Love from a distance' })] },

  /* Big-city prodigy */
  ori_mixtape_famous: { at: 'hs_sum hs', req: { origin: 'big_city', grade: [10, 10] }, w: 5, tag: 'Your phone',
    t: 'Your mixtape has a million views', x: "You're fifteen, and strangers at the park call your name.",
    o: [O('Post another one', { fame: 8, morale: 4 }, 'Two million. Grown men want to guard you at the park.', { sub: 'Ride the wave', set: 'city.mixtape' }),
      O('Go quiet until the season', { trust: 4, eth: 3 }, 'The views keep climbing anyway. You stay in the gym.', { sub: 'Let it simmer' })] },
  ori_city_rivalry: { at: 'hs', req: { origin: 'big_city' }, w: 3, tag: 'The crosstown school',
    t: 'Transfer to the crosstown school?', x: 'Their coach wants you. Better gym, better schedule, a TV game. "We\'ll make you a star," he says.',
    o: [O('Transfer', { fame: 5, trust: -4 }, 'Half your neighborhood stops talking to you. The other half buys tickets.', { sub: 'Bigger stage, burned bridges', set: 'city.switched', rel: [['hscoach', -25, 'You left for the crosstown school.']] }),
      O('Stay with your guys', { morale: 6, trust: 6 }, 'You beat them twice that season. It beats any TV game.', { sub: 'Loyalty first', rel: [['hscoach', 15, 'You stayed.']] })] },
  ori_runner_offer: { at: 'hs_off', req: { origin: 'big_city', mem: ['city.mixtape'], grade: [11, 12] }, w: 4, rar: 'uncommon', tag: 'The parking lot',
    t: 'A man in a nice car wants to help', x: "He calls himself an uncle. He's got an envelope and a school already picked out for you.",
    o: [O('Take the envelope', { cash: 0.05, morale: -2 }, 'It feels like a loan you never agreed to.', { sub: 'Easy money, hidden strings', set: 'city.runner', p: 0.7, no: { fx: { fame: -6, trust: -6 }, s: 'Somebody saw. A booster investigation follows your name for a year.', set: 'city.runner' } }),
      O('Hand it back', { morale: 4 }, "He smiles like he's heard no before. He doesn't call again.", { sub: 'Stay clean', rel: [['mom', 15, 'You turned down the envelope.']] })] },
  ori_city_mural: { at: 'off', req: { origin: 'big_city', stars: [1, null] }, w: 4, tag: 'The corner store',
    t: 'The city wants to paint you', x: 'A mural on the side of the corner store where you grew up. Forty feet tall.',
    o: [O('Pose for it', { fame: 5, morale: 6 }, 'Forty feet of you, ball on your hip. Kids take pictures with it every day.', { sub: 'Own the wall', set: 'city.mural' }),
      O('Ask them to paint the park', { morale: 4, trust: 2 }, "New rims and fresh paint. The park's full every night.", { sub: 'Give it back' })] },

  /* Son of a former pro */
  ori_fathers_number: { at: 'hs_sum', req: { origin: 'pro_son', grade: [10, 10] }, w: 6, tag: 'Equipment room',
    t: 'Wear his number?', x: (L) => '{father} wore ' + (L.parent && L.parent.num != null ? '#' + L.parent.num : 'it') + ' for ' + yearsWord(fatherYears(L)) + '. Everybody in the gym knows it.',
    o: [O('Wear his number', { fame: 5, morale: -2 }, 'Every coach in the stands says his name before yours.', { sub: 'Carry the legacy', set: 'son.number', do: (L) => { if (L.parent && L.parent.num != null) L.num = L.parent.num; } }),
      O('Pick your own', { morale: 5 }, "He laughs and says he'd have done the same.", { sub: 'Make your own name', rel: [['dad', 10, 'You picked your own number.']] })] },
  ori_fathers_coach: { at: 'hs_off', req: { origin: 'pro_son', grade: [11, 12] }, w: 4, tag: 'Your phone',
    t: "Your father's old coach calls", x: 'He coaches a college now. "I owe your father one," he says.',
    o: [O('Hear him out', { trust: 4, morale: 2 }, 'He talks about your father for an hour. Then about you for ten minutes.', { sub: 'Old ties' }),
      O('Say you want your own road', { morale: 5, eth: 2 }, "Your father hears about it. He's quiet for a day. Then proud.", { sub: 'Your own way', set: 'son.ownway', rel: [['dad', -5]] })] },
  ori_father_courtside: { at: 'pre', req: { origin: 'pro_son', seasons: [1, 2] }, w: 5, tag: 'Opening night',
    t: '{father} wants a seat behind the bench', x: (L) => 'Opening night. He played in this league for ' + yearsWord(fatherYears(L)) + ". He's never sat behind your bench.",
    o: [O('Get him the seat', { morale: 6, fame: 2 }, 'The broadcast finds him twice. He cries both times.', { sub: 'Let him see it', rel: [['dad', 20, 'He sat behind your bench on opening night.']] }),
      O('Ask him to watch at home', { morale: 2, trust: 2 }, 'He understands. He texts you after every quarter.', { sub: 'Fewer nerves' })] },
  ori_passed_father: { at: 'off', when: (L) => L.origin === 'pro_son' && !recall(L, 'origin.passed') && totals(L).pts > ((recall(L, 'origin.father') || {}).v || 9e9), w: 9, tag: 'Your phone',
    t: 'You just passed your father', x: (L) => 'Career points: ' + totals(L).pts + '. {father} finished with ' + recall(L, 'origin.father').v + '.',
    o: [O('Call him first', { morale: 10 }, "He answers on the first ring. He already knew. He'd been counting.", { sub: 'Share it with him', set: 'origin.passed', rel: [['dad', 25, 'You passed his career points and called him first.']] }),
      O('Say nothing', { fame: 3 }, '{beat} writes it up anyway. Your father frames the column.', { sub: 'Let it be', set: 'origin.passed' })] },

  /* A legacy career (Phase E): the father is a career this account played. */
  leg_rafters: { at: 'pre', req: { seasons: [1, 3] }, when: (L) => !!(L.parent && L.parent.jersey && L.team === L.parent.jersey), w: 9, tag: 'Your home floor',
    t: 'His number hangs in the rafters', x: (L) => '{father}\'s #' + L.parent.num + ' hangs over the floor you play on now.',
    o: [O('Look up at it every night', { morale: 5, fame: 2 }, 'Before every tip. Nobody on the team says a word about it.', { sub: 'A nightly reminder', set: 'son.rafters' }),
      O('Never look up', { eth: 3, trust: 2 }, 'Eyes on the rim. You can feel it up there anyway.', { sub: 'Eyes on today', set: 'son.rafters' })] },
  leg_old_club: { at: 'pre', req: { seasons: [1, 2] }, when: (L) => !!(L.parent && L.team && L.parent.jersey !== L.team && L.parent.clubs.indexOf(L.team) >= 0), w: 8, tag: 'The hallway',
    t: 'Your father played here', x: "{tvet} shows you a team photo in the hallway. Your father's in the second row.",
    o: [O('Send him a picture of it', { morale: 4 }, 'He sends back nine exclamation points.', { sub: 'Make his day', rel: [['dad', 10, 'You sent him the old team photo.']] }),
      O('Keep walking', { trust: 2 }, "Nobody here needs a reminder. You'll make your own photo.", { sub: 'Your own team' })] },
  leg_compared: { at: 'off', req: { seasons: [1, 3] }, when: (L) => !!L.parent, w: 7, tag: 'The TV debate',
    t: 'Everybody compares you to him', x: '{critic} puts your numbers next to {father}\'s at the same age. Now everybody wants your answer.',
    o: [O("Say you'll pass him", { fame: 4, morale: -2 }, 'The clip goes everywhere. So does the pressure.', { sub: 'Bold, and loud', set: 'son.vow' }),
      O("Say there's only one of him", { trust: 3, morale: 3 }, 'Your father calls that night. He liked that answer.', { sub: 'Humble and true', rel: [['dad', 12, 'You said there is only one of him.']] })] },
  leg_hall_night: { at: 'off', req: { seasons: [2, 12] }, when: (L) => !!(L.parent && L.parent.hof), w: 4, tag: 'Hall of Fame',
    t: 'They want you at his Hall night', x: "The Hall's showing a film about {father}, and they've asked you to speak.",
    o: [O('Speak', { fame: 5, morale: 6 }, 'You keep it short. The room stands anyway.', { sub: 'Say it out loud', rel: [['dad', 15, 'You spoke at his Hall night.']] }),
      O('Sit with him and listen', { morale: 4 }, "He holds your hand the whole film. He's never done that.", { sub: 'His night, not yours' })] },

  /* Late growth spurt */
  ori_six_inches: { at: 'hs_sum', req: { origin: 'growth', grade: [10, 11] }, w: 6, tag: 'Summer',
    t: 'You grew six inches', x: "Nothing fits. They're moving you under the basket, but you still think like a guard.",
    o: [O('Keep playing guard', { pla: 2, sho: 1 }, 'A guard who sees over everybody. Scouts start asking questions.', { sub: 'Be a mismatch', set: 'growth.guard' }),
      O('Move inside', { reb: 3, def: 2, pla: -1 }, 'You learn the post in a month. You miss having the ball.', { sub: 'Use the height', set: 'growth.big' })] },
  ori_clumsy_year: { at: 'hs', req: { origin: 'growth' }, w: 4, tag: 'Warmups',
    t: "Your body doesn't know itself yet", x: 'You trip over the baseline in warmups. Twice. The student section noticed.',
    o: [O('Yoga and footwork, every day', { ath: 2, health: 2 }, "By spring you move like you've always been this tall.", { sub: 'Slow and steady' }),
      O('Play through it', { health: -5, morale: -2 }, 'Your knees ache all season. It passes. Mostly.', { sub: "It'll sort itself out" })] },
  ori_new_position: { at: 'col col_pre', req: { origin: 'growth' }, w: 3, tag: 'Practice',
    t: 'The coaches want to move you', x: 'One more position over. "Your height\'s wasted where you are," an assistant says.',
    o: [O('Embrace the move', { reb: 2, def: 1, trust: 6 }, 'It takes a month. Then it takes over the conference.', { sub: 'Trust the staff' }),
      O('Fight to stay', { morale: 3, trust: -5 }, 'You keep the spot. The coaches keep asking.', { sub: 'Trust yourself' })] },
  ori_old_jersey: { at: 'off', req: { origin: 'growth', seasons: [4, null] }, w: 2, tag: 'Home',
    t: 'Your mom found your eighth grade jersey', x: "It wouldn't fit your arm now. She's holding it up, laughing.",
    o: [O('Frame it', { morale: 5 }, "It goes up in the hallway. Guests don't believe it's yours.", { sub: 'Keep the memory' }),
      O('Give it to a kid at camp', { morale: 4, fame: 1 }, 'He wears it to every practice. It fits him fine.', { sub: 'Pass it on' })] },

  /* International prospect */
  ori_u17: { at: 'hs_sum', req: { origin: 'intl', grade: [10, 11] }, w: 5, tag: 'Your phone',
    t: 'The under-17 national team calls', x: 'A summer tournament for the country you grew up in. {abroad} would be watching on TV.',
    o: [O('Play for them', { fame: 5, health: -4, iq: 2 }, 'You lead the tournament in assists. Home watches every game.', { sub: 'Play for home', set: 'intl.u17' }),
      O('Stay and train', { sho: 2, def: 1 }, "You watch on a laptop. It's harder than you thought.", { sub: 'Keep building' })] },
  ori_language: { at: 'hs col', req: { origin: 'intl' }, w: 3, tag: 'The huddle',
    t: 'The playbook is a second language', x: 'You know every play. In a timeout, though, the English comes too fast to follow.',
    o: [O('A tutor every night', { iq: 2, morale: -2 }, "By February you're joking with teammates. In English.", { sub: 'Learn it properly' }),
      O('Let the game talk', { morale: 3 }, "You learn the word for every action anyway. It's enough.", { sub: 'Hoops is universal' })] },
  ori_homesick: { at: 'early', req: { origin: 'intl', seasons: [0, 0] }, w: 4, tag: 'Your apartment',
    t: 'December is long this far from home', x: "The food's wrong. The time difference means calls home at midnight.",
    o: [O('Fly your family over', { cash: -0.1, morale: 8 }, 'Your mother cooks for the whole team. The vets adopt you.', { sub: 'Bring home here', rel: [['mom', 15, 'She flew over in your rookie December.']] }),
      O('Tough it out', { morale: -4, eth: 3 }, 'You find a restaurant that gets it almost right. You go every Sunday.', { sub: 'Grow up fast' })] },
  ori_federation: { at: 'off', req: { origin: 'intl', seasons: [3, null] }, w: 3, rar: 'uncommon', tag: 'Your phone',
    t: 'The national federation wants your summer', x: 'A qualifying window. "The country needs you," the federation president says.',
    o: [O('Play every summer', { fame: 5, health: -6 }, '{abroad} throws you a parade. Your knees file a complaint.', { sub: 'Flag first', set: 'intl.flag' }),
      O('Skip this window', { health: 6 }, 'The federation president says something sharp to the papers. It blows over.', { sub: 'Save your body', set: 'intl.fedfeud' })] },

  /* Prep school transfer */
  ori_prep_dorm: { at: 'hs_sum', req: { origin: 'prep', grade: [10, 10] }, w: 6, tag: 'The dorm',
    t: 'Your roommate has a trust fund', x: 'His father owns buildings. You own two pairs of shoes.',
    o: [O('Get to know him', { morale: 3, iq: 1 }, "He's better company than you expected. His father asks about you.", { sub: 'Keep an open mind', set: 'prep.roommate' }),
      O('Ask for a single', { iq: 2, morale: -2 }, 'A room the size of a closet. You study a lot.', { sub: 'Keep to yourself' })] },
  ori_prep_investor: { at: 'off', req: { origin: 'prep', mem: ['prep.roommate'], seasons: [2, null] }, w: 4, rar: 'uncommon', tag: 'Your phone',
    t: "Your old roommate's father calls", x: 'He wants to put money behind something with your name on it. "Let\'s build something real," he says.',
    o: [O('Take the meeting', { cash: 0.4, morale: 3 }, 'A clean deal with a lawyer in the room. It grows every year.', { sub: 'Smart money', set: 'arc.venture.won' }),
      O('Keep it friendly', { morale: 2 }, 'He sends a fruit basket every Christmas anyway.', { sub: 'No business with friends' })] },
  ori_hometown_resent: { at: 'off', req: { origin: 'prep', seasons: [1, null] }, w: 3, tag: 'Hometown radio',
    t: 'Home says you forgot it', x: 'A radio host back home keeps calling you the one who left at fourteen.',
    o: [O('Run a camp back home', { morale: 6, cash: -0.1 }, 'Three hundred kids show up. The radio host brings his son.', { sub: 'Show them you care', set: 'prep.home' }),
      O('Let it go', { morale: -3 }, 'It stings more than you let on.', { sub: 'Not worth the fight' })] },

  /* Multi-sport athlete */
  ori_two_sport: { at: 'hs_sum', req: { origin: 'multi', grade: [10, 11] }, w: 6, tag: 'The hallway',
    t: 'Football or basketball?', x: "The football coach says you could start at quarterback. The basketball coach doesn't say anything. He just looks at you.",
    o: [O('Basketball only', { sho: 2, pla: 1 }, "The football coach won't talk to you in the hallway for a month.", { sub: 'All in on hoops' }),
      O('Play both', { ath: 2, health: -6, fame: 3 }, "Friday nights and Saturday mornings. You're tired and very good at two things.", { sub: 'Why choose?', set: 'multi.both' })] },
  ori_draft_mlb: { at: 'predraft', req: { origin: 'multi' }, w: 6, tag: 'Your phone',
    t: 'A baseball team drafts you anyway', x: 'Twentieth round. "The offer stands if basketball doesn\'t work out," their scout says.',
    o: [O('Tell them no, for good', { morale: 4, trust: 2 }, 'The jersey they sent goes in your closet. It stays there.', { sub: 'Hoops or nothing' }),
      O('Keep the door open', { morale: 2 }, '{agent} files the letter. Just in case.', { sub: 'A backup plan', set: 'multi.mlb' })] },
  ori_football_coach: { at: 'off', req: { origin: 'multi', seasons: [2, null] }, w: 3, rar: 'uncommon', tag: 'Your phone',
    t: 'A football coach wants a tryout', x: "He's seen your high school film. He thinks you're wasting a gift.",
    o: [O('Laugh and decline', { morale: 3 }, 'You send him a signed ball. A basketball.', { sub: 'Flattered, not tempted' }),
      O('Throw for him once', { fame: 6, health: -3 }, 'Sixty yards on a line. The clip runs for a week.', { sub: 'Just for fun', set: 'multi.throw' })] },

  /* Overlooked walk-on type */
  ori_cut_varsity: { at: 'hs_sum', req: { origin: 'walkon', grade: [10, 10] }, w: 6, tag: 'The gym door',
    t: 'Cut from varsity', x: "Freshman year. Your name wasn't on the list taped to the door.",
    o: [O('Ask {hscoach:last} why', { iq: 2, trust: 6 }, 'He tells you. You fix every word of it by the next tryout.', { sub: 'Hear it straight', set: 'walkon.asked', rel: [['hscoach', 15, 'You asked him why he cut you.']] }),
      O('Just outwork everybody', { def: 2, eth: 4 }, 'You make the team the next year. Nobody outworks you.', { sub: 'Let it fuel you' })] },
  ori_managers_job: { at: 'col_pre', req: { origin: 'walkon', cyear: [1, 1] }, w: 5, tag: 'The gym',
    t: 'They need a team manager', x: 'Towels, water, rebounding for the starters. But it gets you in the gym every day.',
    o: [O('Take the job', { def: 2, iq: 2, morale: -2 }, 'You rebound for the stars all fall. You guard them in pickup.', { sub: 'Any way in', set: 'walkon.mgr' }),
      O('Keep your pride', { morale: 3 }, "You find another gym. It's a worse gym.", { sub: 'Not a towel boy' })] },
  ori_jersey_99: { at: 'off', req: { origin: 'walkon', seasons: [5, null] }, w: 3, tag: 'Equipment room',
    t: 'Number ninety-nine', x: 'The number nobody wanted when you got here. Kids in the stands wear it now.',
    o: [O('Keep wearing it', { morale: 6, fame: 2 }, 'It sells more than any number on the roster.', { sub: "It's yours now", set: 'walkon.99' }),
      O('Give it to a rookie', { morale: 4, trust: 3 }, 'He asks why. You tell him the whole story.', { sub: 'Pass it down' })] },
});

// ── high school and the summer circuit (NARRATIVE.md 7.2) ──

story({
  rv_meet: { at: 'hs_sum', req: { grade: [10, 11], rank: [1, 400] }, w: 5, tag: 'Summer camp',
    t: "A kid at camp won't stop talking", x: '{dre}. Your age, your size, and louder than both of you put together.',
    o: [O('Shake his hand', { morale: 3 }, 'He talks through the whole handshake. You end up laughing.', { sub: 'Friendly start', set: 'camp.met', start: ['camp', 'arc_camp_2', 'hs_sum', 1, { tone: 'friendly' }], rel: [['dre', 15, 'You met at camp and shook hands.']] }),
      O('Talk back', { fame: 2, morale: 2 }, 'The whole camp stops to watch. Neither of you backs down.', { sub: 'Match his energy', set: 'camp.met', start: ['camp', 'arc_camp_2', 'hs_sum', 1, { tone: 'hot' }], rel: [['dre', -15, 'You traded trash talk at camp.']] })] },
  aau_two_brands: { at: 'hs_sum', req: { grade: [10, 11], rank: [1, 250] }, w: 4, tag: 'Summer',
    t: 'Two shoe circuits want you', x: '{aau} runs a team on one of them. The other team flies you to tournaments.',
    o: [O('Play for {aau}', { morale: 4, trust: 3 }, 'His gym smells like old sneakers. He knows every scout by name.', { sub: 'Old-school loyalty', set: 'aau.vickers', start: ['aau', 'arc_aau_2', 'hs_sum', 1], rel: [['aau', 20, 'You chose his team.']] }),
      O('Take the flights', { fame: 4 }, 'Hotels, team gear, a bigger stage. {aau} wishes you luck.', { sub: 'Bigger stage', set: 'aau.other', rel: [['aau', -5]] })] },
  nil_first_check: { at: 'hs_off', req: { rank: [1, 150], grade: [11, 12] }, w: 4, tag: 'The dealership',
    t: 'A car dealer wants you in an ad', x: 'The biggest dealership in {town}. Thirty seconds of filming and a check.',
    o: [O('Film the ad', { cash: 0.03, fame: 3 }, 'You point at a truck and smile. The whole school quotes it.', { sub: 'Easy money', set: 'nil.hs' }),
      O('Wait for college', { eth: 2 }, "He says the offer stands. It doesn't, but that's fine.", { sub: 'Bigger checks later' })] },
  visit_host: { at: 'hs_off', req: { grade: [11, 11], rank: [1, 300] }, w: 3, rar: 'uncommon', tag: 'Official visit',
    t: 'Your visit host has party plans', x: 'A party off campus. "Every recruit goes," he says, grinning.',
    o: [O('Go for an hour', { morale: 4 }, "Somebody takes a photo. You don't think about it again.", { sub: 'Fit in', start: ['visit', 'arc_visit_2', 'hs_sum', 0] }),
      O('Head back to the hotel', { trust: 3 }, 'You watch film with the coaches instead. They notice.', { sub: 'Stay focused' })] },
  hs_dad_coach: { at: 'hs', req: { grade: [10, 12] }, w: 2, tag: 'The bleachers',
    t: "Your dad's coaching from the stands", x: 'Every possession. The whole gym can hear him, and so can the refs.',
    o: [O('Talk to him after', { morale: 3 }, 'He promises to sit quieter. He makes it a week.', { sub: 'Have the talk', rel: [['dad', 5]] }),
      O('Tune it out', { iq: 1 }, "You learn to hear only {hscoach:last}. It's a useful skill.", { sub: 'Block out the noise' })] },
  hs_ranking_drop: { at: 'hs_off', when: (L) => L.am && L.am.rank > 200 && L.am.grade >= 11, w: 3, tag: 'Your phone',
    t: 'You fell in the rankings', x: "A recruiting site moved you down. The comments aren't kind.",
    o: [O('Read every comment', { morale: -5, eth: 4 }, "You screenshot the worst one. It's your phone background now.", { sub: 'Use it as fuel' }),
      O('Delete the app', { morale: 3 }, 'You go to the gym instead. It does more for you.', { sub: 'Protect your head' })] },
  hs_first_dunk: { at: 'hs', when: (L) => L.rt.ath >= 55 && L.am && L.am.grade <= 11, w: 3, tag: 'Game night',
    t: 'A breakaway with nobody back', x: "You've never dunked in a game. The student section knows it.",
    o: [O('Go up with two hands', { fame: 4, morale: 6 }, 'Rim rattling. Your phone has nine hundred notifications by morning.', { sub: 'Now or never', p: (L) => clamp(0.35 + (L.rt.ath - 55) * 0.03, 0.2, 0.9), no: { fx: { morale: -3 }, s: 'Off the back iron. The bench covers their faces. You laugh too.' } }),
      O('Lay it in', { trust: 2 }, 'Two points. {hscoach:last} nods. The students boo, a little.', { sub: 'Take the sure thing' })] },
  hs_all_american: { at: 'hs_off', req: { grade: [12, 12], rank: [1, 30] }, w: 6, tag: 'All-star game',
    t: 'The Crown Classic', x: "The all-star game for the country's best seniors. Every phone in America's watching.",
    o: [O('Shoot your shot', { fame: 6 }, 'Twenty-two points and a crossover that goes around the internet.', { sub: 'Show out', p: 0.55, no: { fx: { fame: 2 }, s: "Four of fifteen. Somebody else wins MVP. It's still a great week." } }),
      O('Make the right pass', { trust: 4, iq: 1 }, 'Eleven assists. The college coaches in the stands like that more.', { sub: 'Play it right' })] },
  hs_injury_senior: { at: 'hs', req: { grade: [12, 12] }, w: 2, rar: 'uncommon', tag: "The trainer's room",
    t: 'Your ankle rolled in January', x: 'Senior year. "Two weeks if you rest it," the trainer says.',
    o: [O('Rest it', { health: 6 }, 'Two weeks on the bench. That hurts more than the ankle.', { sub: 'Play it safe', set: 'inj.hs' }),
      O('Tape it and play', { health: -8, fame: 2 }, 'You play the rivalry game on one leg and win it.', { sub: 'Senior year comes once', set: 'inj.hs' })] },
  hs_state_parade: { at: 'hs_off', when: (L) => L.season && L.season.tourney && L.season.tourney.champ, w: 9, tag: 'Main Street',
    t: 'The town throws you a parade', x: 'State champions. A fire truck, a marching band and every kid in {town}.',
    o: [O('Ride on the fire truck', { morale: 8, fame: 3 }, "You throw candy for two miles. Your arm's sore for a week.", { sub: 'Front and center', set: 'hs.parade' }),
      O('Walk with the band', { morale: 6 }, "You walk next to the drummers. It's the loudest day of your life.", { sub: 'With the people', set: 'hs.parade' })] },
  hs_reclass_offer: { at: 'hs_off', when: (L) => L.am && L.am.grade === 11 && L.am.rank <= 45 && L.age <= 17, w: 5, rar: 'uncommon', tag: "Counselor's office",
    t: 'Skip senior year and go early?', x: "Your credits are done. Reclassify and you're in college this fall, a year younger in the draft.",
    o: [O('Reclassify', { fame: 4 }, "Paperwork, a summer course and a lot of goodbyes. You're a freshman in August.", { sub: 'Get there faster', do: (L) => { remember(L, 'route.reclass', true); L.am.grade = 12; if (!L.am.college) L.pending.push(commitCard(L)); logIt(L, 'Reclassified to graduate a year early.', 'gold'); } }),
      O('Stay with your class', { morale: 4 }, 'One more year at home. Senior night with the guys you grew up with.', { sub: 'Finish what you started' })] },
  hs_grades_warning: { at: 'hs', when: (L) => L.am && L.am.grade >= 11 && L.rt.iq < 55, w: 3, tag: 'Study hall',
    t: 'One more bad test and you sit', x: 'Chemistry. The eligibility letter is already on {hscoach:last}\'s desk.',
    o: [O('Get a tutor', { iq: 2, morale: -2 }, 'Four nights a week with {tutor}. A B minus. You frame it.', { sub: 'Do it right', rel: [['mom', 10]] }),
      O('Cram the night before', { morale: 2 }, 'A C. Eligible. Barely.', { sub: 'Roll the dice', p: 0.6, no: { fx: { trust: -6, morale: -6 }, s: 'A D. You sit two games. The team loses both.' } })] },
  hs_coach_son2: { at: 'hs', when: (L) => L.am && L.am.grade === 10, w: 2, tag: 'Practice',
    t: 'A senior wants your minutes', x: "He's waited three years for this. You're fifteen and starting ahead of him.",
    o: [O('Earn them every day', { def: 1, eth: 3 }, "He makes you better in practice. By February you're friends.", { sub: 'Win it fair' }),
      O('Let {hscoach:last} sort it out', { morale: 2 }, "He starts you. The senior doesn't talk to you until graduation.", { sub: 'Not your call' })] },

  // ── college (7.3) ──
  col_captain: { at: 'col_pre', req: { cyear: [3, 4] }, w: 4, tag: 'The locker room',
    t: 'The team votes you captain', x: 'Fourteen votes. The fifteenth was yours, cast for somebody else.',
    o: [O('Lead out loud', { trust: 6, morale: 4 }, 'You run the huddles. The freshmen follow you everywhere.', { sub: 'Be the voice', set: 'col.captain' }),
      O('Lead by example', { eth: 4, trust: 4 }, 'First in, last out. It works just the same.', { sub: 'Let the work talk', set: 'col.captain' })] },
  col_senior_night: { at: 'col_mar', req: { cyear: [4, 4] }, w: 8, tag: 'Senior night',
    t: "It's senior night", x: 'Four years at {school}. Your family walks you out to center court.',
    o: [O('Give a speech', { morale: 8, fame: 3 }, 'You thank the managers by name. The arena loses it.', { sub: 'Say goodbye properly', set: 'col.senior' }),
      O('Just play', { morale: 6 }, 'Twenty-eight points. You leave the floor to a standing ovation.', { sub: 'Let the game say it', set: 'col.senior' })] },
  col_coach_yells: { at: 'col', w: 3, tag: 'The film room',
    t: 'Film session, and the clip is you', x: "The head coach runs it back five times. The room's dead silent.",
    o: [O('Take it', { trust: 6, def: 1 }, 'You never make that mistake again. He notices.', { sub: 'Swallow your pride' }),
      O('Fire back', { trust: -8, morale: 3 }, 'Your teammates stare at the floor. You sit the first half Saturday.', { sub: 'Stand up for yourself' })] },
  col_return_senior: { at: 'col_off', when: (L) => L.am && L.am.cyear === 3 && projectedPick(L, L.am.stock || 0) > 25, w: 4, tag: 'Decision time',
    t: 'The mocks have you in the second round', x: 'One more year could change that. Or nothing could.',
    o: [O('Ask the staff what they hear', { iq: 1 }, "They say come back. Of course they'd say that.", { sub: 'Trust your coaches' }),
      O('Ask an agent, unofficially', { fame: 1 }, "You're not supposed to talk to agents yet. You learn a lot anyway.", { sub: 'Bend the rules' })] },
  col_portal_new_coach: { at: 'col_pre', req: { route: 'portal' }, w: 6, tag: 'Practice',
    t: 'New school, new system', x: 'Everything you knew is wrong here. Different sets, different words, a different voice.',
    o: [O('Learn it all', { iq: 3, trust: 6 }, "By November you're the one teaching it to freshmen.", { sub: 'Be a sponge' }),
      O('Play your way', { fame: 2, trust: -5 }, 'You score, so he lets you. For now.', { sub: 'Trust your game' })] },
  col_portal_old_team: { at: 'col', req: { route: 'portal' }, w: 6, tag: 'Road game',
    t: 'Your old school is on the schedule', x: "Their fans made a sign with your face on it. It isn't kind.",
    o: [O('Make them regret it', { fame: 4 }, 'Thirty points in their building. Their coach shakes your hand anyway.', { sub: 'Settle the score', p: (L) => clamp(0.4 + (ovrOf(L) - 55) * 0.03, 0.2, 0.85), set: 'col.portalrevenge', no: { fx: { morale: -5 }, s: 'Five for nineteen. Their student section chants your name. Not nicely.' } }),
      O('Play it like any game', { trust: 4 }, 'A quiet sixteen points and a win. Better that way.', { sub: 'Keep it cool' })] },
  col_injury: { at: 'col', w: 2, rar: 'uncommon', tag: "The trainer's room",
    t: 'Something popped in practice', x: 'The trainer calls it a stress fracture. Six weeks, or take a medical redshirt.',
    o: [O('Rehab and come back', { health: -6 }, 'Back for March. Not all the way back.', { sub: 'Chase this season', set: 'inj.col' }),
      O('Take the redshirt', { health: 15, iq: 2 }, 'A year to heal and learn. You come back stronger.', { sub: 'Play the long game', set: ['inj.col', 'col.redshirt'] })] },
  walkon_practice_squad: { at: 'col_pre col', req: { route: 'walkon' }, w: 8, tag: 'Scout team',
    t: 'You guard the starters every day', x: "Scout team. You learn every opponent's plays and run them against your own guys.",
    o: [O('Make every practice a game', { def: 3, eth: 3, health: -4 }, 'A starter shoves you after a charge. The staff smiles.', { sub: 'Earn their respect', start: ['walkon', 'arc_walkon_2', 'col_off', 0, { grit: 1 }] }),
      O('Learn the whole system', { iq: 3 }, 'You know the playbook better than the point guard.', { sub: 'Get smarter', start: ['walkon', 'arc_walkon_2', 'col_off', 0] })] },
  nil_bidding: { at: 'col_off', req: { cyear: [1, 3] }, when: (L) => L.am && ovrOf(L) >= 56, w: 3, rar: 'uncommon', tag: 'Your phone',
    t: 'A collective will double your NIL money', x: "If you transfer. They've put the number in writing.",
    o: [O('Stay loyal', { trust: 6, morale: 2 }, 'Your own collective matches half. The fans love you for it.', { sub: 'Ride with your school', start: ['nil', 'arc_nil_2', 'col_pre', 1] }),
      O('Ask your school to match', { cash: 0.08 }, 'They match. Now everybody knows you asked.', { sub: 'Leverage, at a cost', start: ['nil', 'arc_nil_2', 'col_pre', 1, { asked: 1 }] })] },
  coach_rumor: { at: 'hs_off', when: (L) => L.am && L.am.college && L.am.grade === 12, w: 3, rar: 'uncommon', tag: 'Your phone',
    t: 'The man who recruited you might leave', x: 'Rumor sites say the man who recruited you is interviewing for an NBA job.',
    o: [O('Call him', { trust: 3 }, "He says he's not going anywhere. He says it fast.", { sub: 'Go straight to him', start: ['coachleft', 'arc_coachleft_2', 'col_pre', 1, { called: 1 }] }),
      O('Wait and see', {}, 'You hear nothing for a month. Then you hear everything.', { sub: 'Stay out of it', start: ['coachleft', 'arc_coachleft_2', 'col_pre', 1] })] },

  // ── the other roads (alt slot: overseas, G League, juco, prep, gap, rec) ──
  abr_first_practice: { at: 'alt', req: { route: 'intl' }, w: 8, tag: 'Day one abroad',
    t: 'Grown men test you on day one', x: "A thirty-three-year-old forward elbows you on every screen. He's smiling while he does it.",
    o: [O('Elbow him back', { fame: 2, def: 1 }, "He grins. By next week he's picking you first in drills.", { sub: 'Earn it now' }),
      O('Laugh it off', { morale: 3 }, 'He keeps doing it. You learn to set your feet.', { sub: 'Pick your battles' })] },
  abr_derby: { at: 'alt', req: { route: 'intl' }, w: 6, tag: 'Derby day',
    t: 'The derby comes down to one shot', x: 'Drums, flares and fourteen thousand fans who hate the other team more than they love you. Tie game.',
    o: [O('Take the last shot', { fame: 5 }, 'It goes in. They carry you off the floor.', { sub: 'Want the moment', p: (L) => clamp(0.45 + clutchBonus(L), 0.2, 0.8), set: 'abr.derby', no: { fx: { morale: -4 }, s: 'It rims out. The other side sets off a flare in your honor.' } }),
      O('Feed the old pro', { trust: 5 }, 'He hits it. The bench mobs you both.', { sub: 'Trust experience' })] },
  abr_coach: { at: 'alt', req: { route: 'intl' }, w: 4, tag: 'Practice',
    t: 'Your new coach trusts veterans', x: 'Twelve minutes a night. "Here, you earn it," he tells you.',
    o: [O('Earn it', { def: 2, eth: 3 }, 'Twenty minutes a night by February.', { sub: 'Patience pays' }),
      O('Have your agent call', { trust: -6, fame: 1 }, "He plays you more. He doesn't talk to you more.", { sub: 'Force the issue' })] },
  glid_paycheck: { at: 'alt', req: { route: 'gl' }, w: 8, tag: 'Payday',
    t: 'Your first paycheck', x: "You're eighteen, and it's more money than your parents make in a year.",
    o: [O('Save most of it', { cash: 0.3 }, 'A boring account with a good number in it.', { sub: 'Future you says thanks', set: 'money.saved' }),
      O('Buy your mom a car', { cash: -0.05, morale: 8 }, 'She cries in the dealership parking lot.', { sub: 'Family first', rel: [['mom', 25, 'You bought her a car with your first check.']] })] },
  glid_vet: { at: 'alt', req: { route: 'gl' }, w: 6, tag: 'The team bus',
    t: 'A thirty-one-year-old takes you in', x: '{tvet} has played on four continents. "You remind me of me," he says.',
    o: [O('Listen to everything', { iq: 3 }, 'He teaches you to rest on the road and read a scouting report.', { sub: 'Soak it up', rel: [['tvet', 25, 'He looked after you in the G League.']] }),
      O('Keep your distance', { morale: 1 }, "He shrugs. There's always another kid.", { sub: 'Do it your way' })] },
  juco_gym: { at: 'alt', req: { route: 'juco' }, w: 8, tag: 'Juco practice',
    t: 'Two-a-days in a gym with no air', x: "Practice here runs like it's 1985. Nobody in this gym was recruited.",
    o: [O('Outwork the whole gym', { ath: 2, def: 2, health: -5 }, 'You lose eight pounds in a month. D1 coaches start calling.', { sub: 'Earn your way out', start: ['juco', 'arc_juco_2', 'hs_off', 0] }),
      O('Do enough', { morale: 2 }, "You lead the team in scoring. Nobody's calling yet.", { sub: 'Save something' })] },
  juco_bus: { at: 'alt', req: { route: 'juco' }, w: 5, tag: 'The team bus',
    t: 'A nine-hour bus ride', x: "A Tuesday game in a town with one hotel, and the bus heat's broken.",
    o: [O('Watch film on your phone', { iq: 2 }, 'You learn their whole offense by the state line.', { sub: 'Use the time' }),
      O('Sleep', { health: 4 }, 'You wake up with a sore neck and thirty points in you.', { sub: 'Rest up' })] },
  prep_new_coach: { at: 'alt', req: { route: 'prep' }, w: 8, tag: 'The prep gym',
    t: 'A coach who sent forty players to college', x: '"Give me a year and I\'ll fix your jumper," he says.',
    o: [O('Let him rebuild it', { sho: 3, morale: -2 }, 'Ugly for two months. Then pure.', { sub: 'Short pain, long gain' }),
      O('Work on your body instead', { ath: 2, health: 4 }, 'Twelve pounds of muscle. Scouts notice before you score.', { sub: 'Get stronger' })] },
  gap_alone: { at: 'alt', req: { route: 'gap' }, w: 8, tag: 'Private gym',
    t: 'Just you and a trainer', x: 'No team, no schedule. The mock drafts are starting to forget your name.',
    o: [O('Post your workouts', { fame: 6 }, 'A million views a week. Scouts watch too.', { sub: 'Stay visible', set: 'gap.brand' }),
      O('Stay quiet and work', { sho: 2, iq: 2 }, "Nobody knows what you're doing. You like it that way.", { sub: 'Head down', set: 'gap.quiet' })] },
  gap_forgotten: { at: 'alt', req: { route: 'gap' }, w: 6, tag: 'Your phone',
    t: 'You dropped off a mock draft', x: "Out of the first round on the biggest site. Your phone's quiet.",
    o: [O('Call a trainer you trust', {}, 'He gets you a workout with an NBA team. Then two.', { sub: 'Make it happen', do: (L) => { L.am.stock = (L.am.stock || 0) + 0.5; } }),
      O('Ignore it', { morale: 2 }, "You're in the gym when it updates. You don't check.", { sub: 'Mocks are noise' })] },
  rec_day_job: { at: 'alt', req: { route: 'rec' }, w: 8, tag: 'The warehouse',
    t: 'The warehouse wants you on nights', x: "Overtime pay. But it'd mean giving up the rec league.",
    o: [O('Take the shifts', { cash: 0.02, morale: -4 }, 'Good money. Your jumper gets rusty.', { sub: 'Pay the bills' }),
      O('Keep your nights free', { sho: 2, morale: 3 }, "You're broke and in the best shape of your life.", { sub: 'Bet on yourself' })] },
  rec_proam: { at: 'alt', req: { route: 'rec' }, w: 6, tag: 'The park downtown',
    t: 'A pro-am at the big park downtown', x: "Real pros play here in the summer. A scout's sitting on the top row.",
    o: [O('Go right at the pros', { fame: 8 }, 'Fifty-four points. The clip is everywhere by morning.', { sub: 'Swing big', p: (L) => clamp(0.3 + (ovrOf(L) - 50) * 0.03, 0.15, 0.7), set: 'rec.viral', do: (L) => { if (recall(L, 'rec.viral')) L.flags.stock = (L.flags.stock || 0) + 3; },
      no: { fx: { morale: -3 }, s: 'A good night, not a great one. The scout leaves at halftime.' } }),
      O('Play your game', { iq: 1 }, 'Twenty-two and nine. A coach asks for your number.', { sub: 'Stay steady' })] },
});

storyArcs({
  arc_camp_2: { at: 'hs_sum', stage: 'am', tag: 'Summer camp',
    t: 'Same camp, same kid', x: (L) => '{dre} is back.' + (arcData(L, 'camp').tone === 'hot' ? " He hasn't forgotten what you said." : ' He waves from across the gym.') + ' The scouts put you on each other.',
    o: [O('Guard him every possession', { def: 2, fame: 3 }, 'He gets his. You get more. The scouts write both names down.', { sub: 'Make it a duel', go: ['camp', 'arc_camp_3', 'dn', 2] }),
      O('Room with him', { morale: 4 }, "He talks until three in the morning. He's funny. You didn't expect that.", { sub: 'Make a friend', go: ['camp', 'arc_camp_3', 'dn', 2], rel: [['dre', 20, 'You roomed together at camp.']] })] },
  arc_camp_3: { at: 'dn', stage: 'nba', when: (L) => !!L.rival && L.rival.name === CAST.dre, tag: 'Draft night',
    t: '{dre} hears his name too', x: (L) => 'Draft night. He goes ' + (L.rival.pick < (L.draft.pick || 61) ? 'before' : 'after') + ' you. He finds you backstage.',
    o: [O('Hug him', { morale: 5 }, 'Two kids from camp. Both in the league.', { sub: 'You made it together', go: ['camp', 'arc_camp_4', 'early', 1], rel: [['dre', 20, 'You hugged on draft night.']] }),
      O("Say you'll see him soon", { fame: 2 }, 'He laughs. He knows exactly what you mean.', { sub: 'A friendly warning', go: ['camp', 'arc_camp_4', 'early', 1], rel: [['dre', -5]] })] },
  arc_camp_4: { at: 'early', stage: 'nba', req: { team: true, rival: true }, tag: 'National TV',
    t: 'You and {dre}, on national TV', x: 'The first time the two kids from camp share an NBA floor in a big game.',
    o: [O('Win the matchup', { fame: 5 }, 'You outscore him. He hugs you anyway.', { sub: 'Bragging rights', p: (L) => clamp(0.4 + (ovrOf(L) - L.rival.ovr) * 0.05, 0.1, 0.9), end: ['camp', 'won'], no: { fx: { morale: -4 }, s: 'He gets you. He brings it up at every All-Star weekend.', end: ['camp', 'lost'] } }),
      O('Trade jerseys after', { morale: 6 }, 'Framed in both your houses by Christmas.', { sub: 'Mark the moment', end: ['camp', 'friends'], rel: [['dre', 25, 'You traded jerseys after your first NBA matchup.']] })] },
  arc_aau_2: { at: 'hs_sum', stage: 'am', tag: 'The AAU gym',
    t: '{aau} got paid for you', x: 'A shoe company gave him a bonus for signing you. He tells you himself.',
    o: [O('Thank him for telling you', { trust: 4 }, 'He says the money keeps the gym open. You believe him.', { sub: 'Respect the honesty', end: ['aau', 'loyal'], rel: [['aau', 20, 'You stayed when you found out about the money.']] }),
      O('Ask for a cut', { cash: 0.01 }, 'He gives you one, quietly. Neither of you mentions it again.', { sub: 'Get yours', end: ['aau', 'cut'], rel: [['aau', -10]] }),
      O('Switch teams', { fame: 3 }, "He doesn't try to stop you.", { sub: 'Walk away', end: ['aau', 'left'], rel: [['aau', -30, 'You left his team.']] })] },
  arc_visit_2: { at: 'hs_sum', stage: 'am', tag: 'Message board',
    t: 'The photo from the party', x: "It's on a message board. Nothing in it is bad. It just looks bad.",
    o: [O('Call the staff and explain', { trust: 4 }, "He laughs. He's seen worse. The offer stands.", { sub: 'Own it early', end: ['visit', 'fine'] }),
      O('Say nothing', { morale: -2 }, 'One school drops you quietly. You never find out why.', { sub: 'Hope it fades', end: ['visit', 'cost'], do: (L) => { if (L.am) L.am.rstock = (L.am.rstock || 0) - 0.4; } })] },
  arc_nil_2: { at: 'col_pre', stage: 'am', when: (L) => !!(L.am && L.am.level === 'col'), tag: 'Campus',
    t: 'The collective wants appearances', x: (L) => arcData(L, 'nil').asked ? 'You asked for more money. Now they want more back. Car washes, autograph tables and a gala, every weekend in October.' : 'Car washes, autograph tables and a gala. Every weekend in October.',
    o: [O('Do them all', { fame: 4, health: -4 }, 'You sign four thousand things. Your hand cramps in practice.', { sub: 'Earn every dollar', end: ['nil', 'paid'] }),
      O('Do half', { trust: 2 }, 'They grumble. They pay anyway.', { sub: 'Protect your time', end: ['nil', 'half'] })] },
  arc_coachleft_2: { at: 'col_pre', stage: 'am', when: (L) => !!(L.am && L.am.level === 'col' && L.am.cyear <= 2), tag: 'Practice',
    t: 'The man who recruited you is gone', x: (L) => arcData(L, 'coachleft').called ? "He told you to your face he wasn't going anywhere. He took the NBA job. The new staff didn't recruit you." : "He took the NBA job. The new staff didn't recruit you.",
    o: [O('Win over the new staff', { trust: 6, eth: 3 }, "You're the first one in on their first day.", { sub: 'Start fresh', end: ['coachleft', 'stayed'] }),
      O('Ask for your release', { morale: 2 }, "They grant it. You're in the portal before practice starts.", { sub: 'Find a new home', end: ['coachleft', 'left'], do: (L) => { L.pending.unshift(portalCard(L)); } })] },
  arc_walkon_2: { at: 'col_off', stage: 'am', tag: 'Practice',
    t: 'Practice ends early. Everybody sits.', x: (L) => arcData(L, 'walkon').grit ? 'The head coach is holding an envelope. He says your name. The starter who shoved you is grinning.' : 'The head coach is holding an envelope. He says your name. The point guard who asks you the plays starts clapping.',
    o: [O('Open it in front of everybody', { morale: 10, fame: 3 }, 'A scholarship. The whole team piles on you.', { sub: 'Share the moment', end: ['walkon', 'schol'], set: 'walkon.schol', log: 'Earned a scholarship.' }),
      O('Ask to open it alone', { morale: 8 }, 'A scholarship. You call home from the parking lot.', { sub: 'Keep it private', end: ['walkon', 'private'], set: 'walkon.schol', log: 'Earned a scholarship.' })] },
  arc_juco_2: { at: 'hs_off', stage: 'am', tag: 'Juco practice',
    t: 'A D1 coach drove nine hours to see you', x: "He watches one practice. Then he asks for your mom's number.",
    o: [O("Tell him you're ready", { morale: 6 }, "He offers before he's out of the parking lot.", { sub: 'Jump at it', end: ['juco', 'offer'], do: (L) => { L.am.rstock = (L.am.rstock || 0) + 0.6; L.am.rank = nationalRank(L); L.pending = L.pending.filter((c) => c.id !== 'commit'); L.pending.push(commitCard(L)); } }),
      O('Ask about playing time first', { iq: 1 }, "He promises nothing. You like that he doesn't lie.", { sub: 'Know the deal', end: ['juco', 'honest'] })] },
});

// ── pre-draft and draft night (NARRATIVE.md 7.4) ──

story({
  pre_interview_trap: { at: 'predraft', w: 5,
    tag: 'Combine interview', t: 'Who\'s the best player in this draft?', x: '{exec} leans back in the interview room. "And if it isn\'t you, why not?"',
    o: [O('Say it\'s you, and mean it', { fame: 2 }, 'He writes something down. You hope it\'s a compliment.', { sub: 'Bet on yourself', p: 0.6, set: 'pre.interview', no: { fx: { morale: -2 }, s: 'He writes something down and frowns. Word gets out that you\'re arrogant.' } }),
      O('Name somebody else and explain', { iq: 1, trust: 4 }, 'He loves the scouting report. He asks you to stay for lunch.', { sub: 'Show you can scout', set: 'pre.interview' }),
      O('Crack a joke', { morale: 3 }, 'He laughs and the room loosens up. Half the teams love it.', { sub: 'Read the room' })] },
  pre_medical: { at: 'predraft', when: (L) => !!(recall(L, 'inj.hs') || recall(L, 'inj.col') || L.dur < 52), w: 5,
    tag: 'Your phone', t: 'A team doctor flagged your knee.', x: 'Something showed up on the scan. By lunch, every team in the draft knows about it.',
    o: [O('Release your full records', { trust: 4 }, 'Every second opinion says it\'s nothing. Most teams relax.', { sub: 'Nothing to hide', do: (L) => { L.flags.stock = (L.flags.stock || 0) - 0.5; } }),
      O('Say nothing', { morale: -2 }, 'Two teams take you off their boards. You never find out which two.', { sub: 'Let them wonder', do: (L) => { L.flags.stock = (L.flags.stock || 0) - 1.5; } })] },
  pre_shooting_coach: { at: 'predraft', when: (L) => L.rt.sho < 58, w: 4,
    tag: 'The gym', t: 'Rebuild your jumper before the draft?', x: 'A shooting coach swears he can fix your release in six weeks. "Or I break it," he admits.',
    o: [O('Rebuild the shot', { sho: 3 }, 'A new release. It looks better. It still feels strange in your hands.', { sub: 'Higher ceiling, real risk', p: 0.6, no: { fx: { sho: -1, morale: -4 }, s: 'It\'s worse at workouts. You go back to the old one.' } }),
      O('Keep the shot you have', { morale: 2 }, 'You make it work in workouts. Teams see exactly who you are.', { sub: 'Trust what got you here' })] },
  pre_green_room: { at: 'predraft', when: (L) => projectedPick(L) <= 22, w: 5,
    tag: 'Your phone', t: 'The league wants you in the green room.', x: 'A table by the stage, cameras on you until your name is called. Or you could watch from home.',
    o: [O('Take the green room seat', { fame: 3 }, 'You get a suit fitted. Your mom buys a new dress.', { sub: 'Be seen on the night', set: 'dn.greenroom' }),
      O('Watch from home', { morale: 3 }, 'A cookout in the backyard. If the call comes, it comes there.', { sub: 'Family over cameras', set: 'dn.home' })] },
  pre_workout_heat: { at: 'predraft', w: 3,
    tag: 'Pre-draft workouts', t: 'Six workouts in eight days?', x: 'Six cities, six gyms, six rooms full of scouts. By Thursday your legs are gone.',
    o: [O('Push through all six', { fame: 2, health: -6 }, 'Your last workout is your best. Somebody important notices.', { sub: 'Show them your motor', do: (L) => { L.flags.stock = (L.flags.stock || 0) + 0.6; } }),
      O('Cancel two of them', { health: 6 }, 'Those two teams are offended. Your legs aren\'t.', { sub: 'Save your legs' })] },
  dn_mom_hug: { at: 'dn', req: { drafted: true }, w: 5,
    tag: 'Draft night', t: 'The camera finds your mom.', x: 'She hasn\'t stopped crying since {commish} said your name. She\'s waiting for you.',
    o: [O('Hug her for a long time', { morale: 8, fame: 2 }, 'The clip runs on every highlight show. You don\'t care one bit.', { sub: 'This one\'s for her', rel: [['mom', 20, 'The hug on draft night.']] }),
      O('Make her laugh', { morale: 6 }, 'She swats your arm on live TV. Everybody watching laughs too.', { sub: 'Keep it light', rel: [['mom', 15]] })] },
  dn_hometown: { at: 'dn', when: (L) => !!(L.draft && L.draft.team && homeClub(L) === L.draft.team), w: 9,
    tag: 'Draft night', t: 'Your hometown team just picked you.', x: 'The arena where you watched games as a kid is screaming your name.',
    o: [O('Wave to the section you sat in', { fame: 4, morale: 8 }, 'Section 112, upper row. They\'re all on their feet.', { sub: 'Soak in the moment', set: 'dn.home.pick' }),
      O('Call your old coach', { morale: 6 }, 'He picks up before it even rings.', { sub: 'Thank who got you here', rel: [['hscoach', 25, 'You called him on draft night.']] })] },
  dn_stash: { at: 'dn', req: { pick: [36, 60] }, w: 4,
    tag: 'Draft night', t: 'Play a year in Europe first?', x: 'Second round. The {club} want you overseas for a season while they hold your rights.',
    o: [O('Go to Europe for a year', { iq: 2 }, 'A one-year deal abroad. They\'ll call you next summer.', { sub: 'Grow out of the spotlight', do: (L) => {
        L.flags.rights = L.team; remember(L, 'route.stash', true); L.flags.overseas = (L.flags.overseas || 0) + 1;
        L.team = null; L.season = null; L.contract = { years: 1, total: 1, salary: 0.8, kind: 'overseas', start: L.year };
        L.pending = L.pending.filter((c) => c.id !== 'goal' && c.id !== 'training');
        logIt(L, 'Stashed overseas for a season.', ''); } }),
      O('Ask to come over now', { trust: 2 }, 'They agree. Fifteenth man, but you\'re in the league.', { sub: 'Take your shot today' })] },
  dn_slide: { at: 'dn', when: (L) => !!(recall(L, 'dn.greenroom') && L.draft && (L.draft.pick || 61) >= 18), w: 9,
    tag: 'The green room', t: 'The green room empties around you.', x: (L) => 'You were a lottery projection. Now it\'s pick ' + (L.draft.pick || 'sixty') + '. The camera never leaves your face.',
    o: [O('Smile through it', { morale: -4, trust: 4 }, 'People notice the grace. Your old teammates send long texts.', { sub: 'Show some class', set: 'dn.slide' }),
      O('Write the picks down', { eth: 6, fame: 2 }, 'Every team that passed. You keep the list in your locker.', { sub: 'Never forget', set: ['dn.slide', 'dn.list'] })] },

  // ── rookie and early career (7.5) ──
  money_first_buy: { at: 'pre early', req: { seasons: [0, 1] }, when: (L) => L.contract && L.contract.salary >= 2, w: 5,
    tag: 'Your bank app', t: 'Your first real paycheck just hit.', x: 'Seven figures, after taxes. Your cousin already has a car picked out for you.',
    o: [O('Buy the car you always wanted', { cash: -0.3, morale: 6 }, 'It\'s ridiculous. You love it.', { sub: 'You earned it', start: ['money', 'arc_money_2', 'off', 1, { kind: 'car' }] }),
      O('Buy your mom a house', { cash: -0.8, morale: 8 }, 'Four bedrooms and a porch. She can\'t stop touching the walls.', { sub: 'Family first', set: 'family.house', start: ['money', 'arc_money_2', 'off', 1, { kind: 'house' }], rel: [['mom', 30, 'You bought her a house.']] }),
      O('Hire a financial adviser', { cash: 0.1 }, 'Index funds and a budget. Boring. Smart.', { sub: 'Make it last', start: ['money', 'arc_money_2', 'off', 1, { kind: 'adviser' }] })] },
  r_card_game: { at: 'early', req: { seasons: [0, 1] }, tags: 'locker', w: 3,
    tag: 'Team plane', t: 'Get dealt into the card game?', x: 'The back of the plane has a game going. {tm} waves you over. The stakes aren\'t small.',
    o: [O('Play a few hands', { morale: 4, cash: -0.02 }, 'You lose a little. You learn a lot about everybody.', { sub: 'Get to know the guys', rel: [['tm', 15, 'You played cards on the plane.']] }),
      O('Get some sleep', { health: 3 }, 'You land fresh. {tm} calls you boring.', { sub: 'Rest comes first', rel: [['tm', -3]] })] },
  r_jersey_number: { at: 'pre', req: { seasons: [1, 2] }, w: 2,
    tag: 'The equipment room', t: 'A veteran has your number.', x: '{tvet} wore it first. He hints he might sell it, for the right price.',
    o: [O('Buy it from him', { cash: -0.05, morale: 5 }, 'A watch and a dinner. He tells the story at every stop.', { sub: 'Keep your number', rel: [['tvet', 15, 'You bought his number off him.']] }),
      O('Pick a new number', { morale: 2 }, 'A new number for a new start.', { sub: 'New team, new digits' })] },
  r_wall: { at: 'mid', req: { seasons: [0, 0], minutes: [16, null] }, tags: 'court', w: 4,
    tag: 'The trainer\'s room', t: 'You just hit the rookie wall.', x: 'Game fifty-five. Your legs feel like somebody else\'s.',
    o: [O('Rest and sleep more', { health: 6, min: -1 }, 'Two weeks of real sleep. You come out of it.', { sub: 'Recover now', start: ['wall', 'arc_wall_2', 'off', 0, { rested: 1 }] }),
      O('Grind through it', { health: -6, eth: 3 }, 'You play through it. Your shot doesn\'t come with you.', { sub: 'Earn your stripes', start: ['wall', 'arc_wall_2', 'off', 0] })] },
  r_vet_tests: { at: 'early', req: { seasons: [0, 0] }, tags: 'locker', w: 3,
    tag: 'Road trip', t: 'The vets send you on a coffee run.', x: '{tvet} wants eight orders at five in the morning. In Denver. In January.',
    o: [O('Get the coffee', { trust: 3, morale: -1 }, 'Eight orders, all correct. They start calling you by name.', { sub: 'Pay your dues', start: ['room', 'arc_room_2', 'mid', 0], rel: [['tvet', 10]] }),
      O('Send it back with a joke', { morale: 2 }, 'Half of them laugh. The other half remember.', { sub: 'Push back a little', start: ['room', 'arc_room_2', 'mid', 0, { joke: 1 }] })] },
  sl_first_game: { at: 'dn', req: { seasons: [0, 0] }, w: 3,
    tag: 'Summer League', t: 'Summer League tips off next week.', x: 'Las Vegas in July. Your first game in your new colors, and every scout is watching.',
    o: [O('Hunt your shot', { fame: 4 }, 'Twenty-six points in your first game. The clip makes the rounds.', { sub: 'Make a splash', p: (L) => clamp(0.35 + (ovrOf(L) - 60) * 0.04, 0.15, 0.85), set: 'sl.good', no: { fx: { morale: -3 }, s: 'Five for eighteen. You learn that Vegas gyms run hot.' } }),
      O('Run the team', { trust: 5, iq: 1 }, 'You run the plays they asked for. The coaches love the tape.', { sub: 'Show them you listen' })] },
  sig_game: { at: 'mid', req: { seasons: [0, 4], minutes: [24, null] }, when: (L) => !!(L.season && L.season.hi && L.season.hi.pts >= 32), tags: 'court', w: 6,
    tag: 'Your phone', t: 'You just had your first signature game.', x: (L) => L.season.hi.pts + ' points. Your phone hasn\'t stopped buzzing in two days.',
    o: [O('Do every interview', { fame: 8, morale: 3 }, 'A morning show, a podcast and a magazine shoot, all in one week.', { sub: 'Ride the wave', start: ['sig', 'arc_sig_2', 'late', 0, { loud: 1 }] }),
      O('One interview, then the gym', { trust: 4, eth: 3 }, 'You tell {beat} it was one night. Then you go shoot.', { sub: 'Stay hungry', start: ['sig', 'arc_sig_2', 'late', 0] })] },
  r_road_roommate: { at: 'early mid', req: { seasons: [0, 2] }, tags: 'locker', w: 1, rar: 'uncommon',
    tag: 'Team hotel', t: 'Your road roommate snores. Loudly.', x: '{trook} sleeps like a chainsaw. Every hotel, every night.',
    o: [O('Buy him a mouthguard', { cash: -0.01, morale: 3 }, 'It works. He swears you saved his career.', { sub: 'Fix it together', rel: [['trook', 15, 'You fixed his snoring.']] }),
      O('Ask for your own room', { health: 3 }, 'You sleep great. He\'s a little hurt.', { sub: 'Protect your sleep', rel: [['trook', -5]] })] },
  r_rookie_month: { at: 'early', req: { seasons: [0, 0] }, when: (L) => !!(L.season && perGame(L.season).pts >= 14), tags: 'court', w: 5,
    tag: 'The locker room', t: 'You\'re Rookie of the Month.', x: 'November belongs to you. The league sends over a plaque with your name on it.',
    o: [O('Give it to your mom', { morale: 6 }, 'It goes on her mantel, next to your fourth grade spelling bee trophy.', { sub: 'She earned it too', rel: [['mom', 10]] }),
      O('Put it in your locker', { fame: 2, eth: 2 }, 'A reminder to keep going. There\'s a lot of season left.', { sub: 'A reminder, not a trophy' })] },
  promise_broken: { at: 'dn', when: (L) => !!(lovedBy(L) && L.draft && L.draft.team && lovedBy(L) !== L.draft.team), w: 7,
    tag: 'Draft night', t: 'They said you were their guy.', x: (L) => 'The ' + nick(lovedBy(L)) + ' told your agent you were their guy. Then they took somebody else.',
    o: [O('Remember it', { eth: 4 }, 'You write the date on a strip of tape inside your shoe.', { sub: 'Hold the grudge', start: ['promise2', 'arc_promise2_2', 'early', 1, { club: 0 }], do: (L) => { arcData(L, 'promise2').club = lovedBy(L); } }),
      O('Let it go', { morale: 3 }, 'Business. You mean it. Mostly.', { sub: 'It\'s just business', set: 'promise.forgiven' })] },
});

storyArcs({
  arc_money_2: { at: 'off', stage: 'nba',
    tag: 'Home', t: 'A year after the first big buy.', x: (L) => ({ car: 'The car has eleven thousand miles on it. Now your cousins want to borrow it.', house: 'Your mom planted a garden. Now your cousins want rooms.', adviser: 'Your adviser sends the year-end statement. It\'s up.' }[arcData(L, 'money').kind] || 'A year later.'),
    o: [O('Set some rules', { trust: 2, cash: 0.1 }, 'A family meeting and a budget. Some hurt feelings. Much better money.', { sub: 'Protect the money', end: ['money', 'rules'], rel: [['cousin', -10]] }),
      O('Say yes to everybody', { cash: -0.4, morale: 4 }, 'Everybody\'s happy. Your bank account is less happy.', { sub: 'Family can\'t hear no', end: ['money', 'yes'], rel: [['cousin', 15]] })] },
  arc_wall_2: { at: 'off', stage: 'nba',
    tag: 'The trainer\'s room', t: '{trainer} has a plan for your summer.', x: (L) => arcData(L, 'wall').rested ? 'You rested through the wall and came out of it. "Now we build on that," she says.' : 'She watched you grind through the wall. "Your body needs a different summer," she says.',
    o: [O('Follow it to the letter', { ath: 2, health: 10, dur: 4 }, 'Sleep tracking, a new diet, no pickup. You come back a different player.', { sub: 'Trust the science', end: ['wall', 'broke'], rel: [['trainer', 25, 'You followed her plan after the rookie wall.']] }),
      O('Do your own summer', { sho: 1 }, 'You work hard. Just not the way she said.', { sub: 'You know your body', end: ['wall', 'own'], rel: [['trainer', -5]] })] },
  arc_room_2: { at: 'mid', stage: 'nba', req: { team: true },
    tag: 'Team dinner', t: 'The veterans decide about you.', x: (L) => arcData(L, 'room').joke ? 'A February team dinner. They haven\'t forgotten the coffee joke.' : 'February. A team dinner. They\'ve saved you a seat.',
    o: [O('Sit with them', { trust: 5, morale: 6 }, '{tvet} gives a toast. You\'re one of them now.', { sub: 'Join the inner circle', end: ['room', 'accepted'], rel: [['tvet', 20, 'The room accepted you.']] }),
      O('Sit with the young guys', { morale: 3 }, 'They nod. The room never fully opens up to you.', { sub: 'Stick with your crew', end: ['room', 'outside'] })] },
  arc_sig_2: { at: 'late', stage: 'nba',
    tag: 'The film room', t: 'Every team has your film now.', x: (L) => arcData(L, 'sig').loud ? 'April. Everybody saw the interviews. So did every defense.' : 'April. Defenses spent two months studying your big night.',
    o: [O('Study what they took away', { iq: 2 }, 'They sit on your right hand. You spend the summer on your left.', { sub: 'Adjust and grow', end: ['sig', 'sustained'] }),
      O('Keep doing what worked', { fame: 2 }, 'It still works. Sometimes.', { sub: 'Don\'t overthink it', end: ['sig', 'onenight'] })] },
  arc_promise2_2: { at: 'early', stage: 'nba', req: { team: true }, when: (L) => !!arcData(L, 'promise2').club && L.team !== arcData(L, 'promise2').club,
    tag: 'National TV', t: 'The team that broke its promise.', x: (L) => 'The ' + nick(arcData(L, 'promise2').club) + ' on national TV. The tape is still in your shoe.',
    o: [O('Make them pay', { fame: 5 }, 'Thirty-one points. You stare at their bench the whole fourth quarter.', { sub: 'Settle the score', p: (L) => clamp(0.35 + (ovrOf(L) - 66) * 0.04, 0.15, 0.85), end: ['promise2', 'revenge'], no: { fx: { morale: -4 }, s: 'Seven points. They win by twenty. The tape stays in your shoe.', end: ['promise2', 'grudge'] } }),
      O('Shake their GM\'s hand', { trust: 4, morale: 3 }, 'He admits they made a mistake. You already knew that.', { sub: 'Be the bigger man', end: ['promise2', 'forgiven'] })] },
});

// ── the prime (NARRATIVE.md 7.6) ──

const meRank = (L) => { const r = L.season && L.season.race; const m = r && r.find((x) => x.you); return m ? m.rank : 99; };
story({
  td_unhappy: { at: 'mid', req: { seasons: [2, null], team: true }, when: (L) => L.m.morale < 55 && L.season && L.season.w < L.season.l && L.contract && L.contract.years >= 1, w: 4,
    tag: 'The locker room', t: 'You want out. Do you say it?', x: 'Losing again. You haven\'t said a word in public. Yet.',
    o: [O('Tell {gm} privately', { trust: -4 }, 'He listens. He says he\'ll try. Then it goes quiet.', { sub: 'Keep it in the building', start: ['trade', 'arc_trade_2', 'late', 0, { loud: 0 }], rel: [['gm', -10, 'You asked him for a trade.']] }),
      O('Say it on the record', { fame: 5, trust: -12 }, '{beat} has it by the end of the night.', { sub: 'Force their hand', start: ['trade', 'arc_trade_2', 'late', 0, { loud: 1 }], rel: [['gm', -25, 'You asked out in public.']] }),
      O('Keep quiet and play', { morale: -2, trust: 4 }, 'You say the right things. You mean about half of them.', { sub: 'Ride it out' })] },
  bb_rumor: { at: 'early', req: { seasons: [3, null], fame: [45, null], team: true }, w: 2, rar: 'uncommon',
    tag: 'Your phone', t: 'Your name is in blockbuster talks.', x: 'Three teams, nine players. Your name is the biggest one on the list.',
    o: [O('Call {gm}', { trust: 3 }, 'He says there\'s nothing to it. He\'s said that before.', { sub: 'Get the truth', start: ['bb', 'arc_bb_2', 'mid', 0, { asked: 1 }] }),
      O('Act like you didn\'t hear', { morale: -2 }, 'Every reporter in the building asks. You say nothing seven times.', { sub: 'Stay above it', start: ['bb', 'arc_bb_2', 'mid', 0] })] },
  max_eligible: { at: 'mid', req: { seasons: [3, null], ovr: [80, null], team: true }, when: (L) => !!(L.contract && L.contract.years <= 2), w: 4,
    tag: 'Agent\'s office', t: 'You\'re eligible for the max.', x: 'Your next deal could be the biggest in franchise history. Talks start in July.',
    o: [O('Tell {agent:first} you want every dollar', { fame: 3 }, 'He smiles. He already has the spreadsheet open.', { sub: 'Get paid', start: ['max', 'arc_max_2', 'off', 0, { ask: 'max' }] }),
      O('Say you\'ll take less to win', { trust: 6, morale: 2 }, 'The front office loves it. {agent:first} doesn\'t.', { sub: 'Help build a winner', start: ['max', 'arc_max_2', 'off', 0, { ask: 'less' }], rel: [['agent', -10]] }),
      O('Say you\'ll look around', { fame: 4, trust: -6 }, 'Every team with cap space starts clearing it.', { sub: 'Test the market', start: ['max', 'arc_max_2', 'off', 0, { ask: 'walk' }] })] },
  cs_target: { at: 'mid', req: { seasons: [4, null], ovr: [80, null], team: true }, when: (L) => clubNet(L, L.team) > -2 && !recall(L, 'arc.costar.landed'), w: 3, rar: 'uncommon',
    tag: 'Your phone', t: 'A star hits free agency this summer.', x: (L) => personName(L, 'costar') + ' wants a winner. You could recruit him yourself.',
    o: [O('Start recruiting now', { fame: 3 }, 'Dinner in his city on the off day. It goes well.', { sub: 'Make it personal', start: ['costar', 'arc_costar_2', 'off', 0, { n: 0, warm: 1 }], do: (L) => { arcData(L, 'costar').n = personName(L, 'costar'); } }),
      O('Let the front office handle it', { trust: 3 }, 'They make the pitch. You stay out of it.', { sub: 'Stay in your lane', start: ['costar', 'arc_costar_2', 'off', 0, { n: 0 }], do: (L) => { arcData(L, 'costar').n = personName(L, 'costar'); } })] },
  touch_tension: { at: 'early', req: { seasons: [3, null], starter: true, ovr: [72, null] }, tags: 'locker', w: 2, rar: 'uncommon',
    tag: 'The locker room', t: '{tco} is counting shots.', x: 'Yours and his. "The gap keeps getting bigger," he says.',
    o: [O('Talk it out with him', { trust: 3 }, 'It goes fine. You think.', { sub: 'Clear the air', start: ['touch', 'arc_touch_2', 'mid', 0] }),
      O('Take more shots', { fame: 3, usage: 0.02 }, 'You score more. He talks less.', { sub: 'It\'s your team', start: ['touch', 'arc_touch_2', 'mid', 0, { more: 1 }], rel: [['tco', -15, 'You kept shooting.']] }),
      O('Feed him for a week', { win: 0.3 }, 'He scores thirty twice. Then he wants more.', { sub: 'Keep him happy', start: ['touch', 'arc_touch_2', 'mid', 0], rel: [['tco', 10]] })] },
  lm_rest: { at: 'early', req: { age: [29, null], team: true, starter: true }, w: 2, rar: 'uncommon',
    tag: 'Training staff', t: 'Sit out a national TV game?', x: 'It\'s a back-to-back. The science says rest. The people who bought tickets disagree.',
    o: [O('Sit it out', { health: 8 }, 'You watch in a suit. The crowd boos the announcement.', { sub: 'Save your body', start: ['lm', 'arc_lm_2', 'mid', 0, { sat: 1 }] }),
      O('Play anyway', { health: -6, fame: 2 }, 'Forty minutes. Your hamstring files a complaint.', { sub: 'Give the fans a show', start: ['lm', 'arc_lm_2', 'mid', 0] })] },
  snub: { at: 'mid', req: { seasons: [2, null], ovr: [79, null], team: true }, when: (L) => !!(L.season && !L.season.allstar && perGame(L.season).pts >= 21), w: 6,
    tag: 'Your phone', t: 'Snubbed from the All-Star team.', x: (L) => perGame(L.season).pts + ' a night and no All-Star nod. The internet is angrier than you are.',
    o: [O('Post a workout clip at midnight', { fame: 4, morale: 2 }, 'No caption. Two million views.', { sub: 'Let it fuel you', start: ['snub', 'arc_snub_2', 'mid', 1, { clip: 1 }] }),
      O('Say nothing', { eth: 3, trust: 3 }, 'You spend the long weekend in the gym.', { sub: 'Let your game talk', start: ['snub', 'arc_snub_2', 'mid', 1] })] },
  shoe_meeting: { at: 'off', req: { seasons: [4, null], fame: [62, null], ovr: [80, null] }, w: 4,
    tag: 'Shoe company HQ', t: 'A signature shoe of your own?', x: '{shoeexec} slides a mockup across the table. "Your name on the box. Your story on the tongue."',
    o: [O('Tell them your origin story', { morale: 4 }, 'He records every word. The designers start sketching.', { sub: 'Make it mean something', start: ['shoe', 'arc_shoe_2', 'pre', 1, { story: 1 }], rel: [['shoeexec', 20, 'You told him your story for the shoe.']] }),
      O('Ask for the biggest check', { cash: 0.5 }, 'He pays it. The shoe will be whatever they want.', { sub: 'Take the money', start: ['shoe', 'arc_shoe_2', 'pre', 1] })] },
  mvp_ladder: { at: 'mid', req: { team: true }, when: (L) => meRank(L) <= 3, w: 7,
    tag: 'Morning shows', t: 'You\'re on the MVP ladder.', x: (L) => 'Third, second, first, depending on the morning show. ' + (meRank(L) === 1 ? 'Today you\'re first.' : 'Today you\'re ' + ordinal(meRank(L)) + '.'),
    o: [O('Chase the stat line', { usage: 0.03, fame: 4 }, 'You average thirty-two in March.', { sub: 'Win the argument', start: ['mvp', 'arc_mvp_2', 'late', 0, { how: 'stats' }] }),
      O('Make it about winning', { win: 0.5, trust: 4 }, 'Eleven wins in twelve games.', { sub: 'Team first', start: ['mvp', 'arc_mvp_2', 'late', 0, { how: 'wins' }] }),
      O('Ignore it and stay healthy', { health: 6 }, 'You sit two back-to-backs. The voters notice.', { sub: 'Think about May', start: ['mvp', 'arc_mvp_2', 'late', 0, { how: 'rest' }] })] },
  pf_label: { at: 'off', when: (L) => { const h = L.history[L.history.length - 1]; return !!h && h.seed && h.seed <= 2 && /R1|R2|First Round|Conference Semifinals/.test(h.po || '') && h.y === L.year; }, w: 6,
    tag: 'Sports talk', t: 'Out early as a top seed.', x: '{critic} calls you a regular season player. It\'ll be on the shows all summer.',
    o: [O('Answer it next May', { eth: 4 }, 'You say nothing. You go to work.', { sub: 'Let results talk', start: ['pf', 'arc_pf_2', 'late', 1] }),
      O('Answer it now', { fame: 3, morale: -2 }, 'A long post. It just makes things louder.', { sub: 'Fire back', start: ['pf', 'arc_pf_2', 'late', 1, { post: 1 }] })] },
  dy_ego: { at: 'pre', when: (L) => { const H = L.history; return H.length >= 2 && H.slice(-2).every((h) => (h.aw || []).indexOf('champ') >= 0); }, w: 9,
    tag: 'Media day', t: 'Two in a row. Who gets the credit?', x: 'Every interview asks about three. {tco} wants more of the credit.',
    o: [O('Give him the credit', { trust: 6, morale: 3 }, 'He softens. The room holds together.', { sub: 'Keep the group together', start: ['dynasty', 'arc_dynasty_2', 'off', 0, { kept: 1 }], rel: [['tco', 20, 'You gave him the credit during the dynasty.']] }),
      O('Remind everybody whose team it is', { fame: 4 }, 'True. Not helpful.', { sub: 'Own your legacy', start: ['dynasty', 'arc_dynasty_2', 'off', 0], rel: [['tco', -20, 'You reminded him whose team it was.']] })] },
  cy_pressure: { at: 'mid', req: { team: true }, when: (L) => !!(L.contract && L.contract.years === 1 && L.age <= 30 && L.contract.kind !== 'rookie'), w: 3,
    tag: 'Your phone', t: 'It\'s a contract year.', x: 'Every box score is a negotiation now. {agent:first} texts after every game.',
    o: [O('Block it out', { eth: 3 }, 'You turn your phone off on game days.', { sub: 'Just play' }),
      O('Hunt numbers', { usage: 0.02, trust: -3 }, 'Your stats go up. The ball moves less.', { sub: 'Pad the resume' })] },
  bad_contract: { at: 'off', req: { seasons: [5, null] }, when: (L) => !!(L.contract && L.contract.salary >= capFor(L.year) * 0.1 && ovrOf(L) < 80), w: 6,
    tag: 'Sports talk', t: 'Worst contract in the league?', x: '{critic} made a list. You\'re on it. Third.',
    o: [O('Laugh it off on air', { fame: 3, morale: 2 }, 'You read the list out loud on a podcast. It helps.', { sub: 'Own the joke' }),
      O('Get in the gym', { eth: 5, health: -2 }, 'You spend the summer proving a list wrong.', { sub: 'Prove him wrong' })] },
  cameo_movie: { at: 'off', req: { fame: [60, null] }, w: 3,
    tag: 'Your phone', t: 'A director wants you in a movie.', x: 'Two lines in a comedy. You\'d play, of all things, a basketball player.',
    o: [O('Do the movie', { fame: 5, cash: 0.1 }, 'You\'re not good. You\'re very funny.', { sub: 'Try something new', set: 'ent.movie' }),
      O('Pass on it', { trust: 2 }, 'You watch it on a plane. It\'s fine without you.', { sub: 'Stay focused' })] },
  fashion_week: { at: 'off', req: { fame: [68, null], big: true }, w: 3,
    tag: 'Fashion week', t: 'A front row seat at fashion week?', x: 'A designer wants you in the front row, and maybe a line of your own.',
    o: [O('Go to the shows', { fame: 5, morale: 4 }, 'Photos everywhere. A capsule collection by spring.', { sub: 'Build your brand', set: 'ent.fashion' }),
      O('Train instead', { eth: 3 }, 'You send the rookie instead. He\'s never been happier.', { sub: 'The work comes first' })] },
  game_cover: { at: 'off', req: { fame: [78, null], stars: [2, null] }, w: 4,
    tag: 'Agent\'s office', t: 'Your face on a video game cover?', x: 'Court Kings, the biggest basketball game there is, wants you on the box.',
    o: [O('Say yes', { fame: 6, cash: 0.3 }, 'Kids play as you in every living room. You lose with yourself online.', { sub: 'Be every kid\'s pick', set: 'ent.cover' }),
      O('Ask for your mom on the back', { fame: 4, morale: 6 }, 'They agree. She shows everybody at church.', { sub: 'Share the spotlight', set: 'ent.cover' })] },
  union_voice: { at: 'off', req: { seasons: [5, null], team: true }, when: (L) => trait(L, 'lockerVoice') || repOf(L).resp >= 60, w: 3,
    tag: 'Players union', t: 'The players want you in the union.', x: 'Vice president. Summer meetings and a seat at the table.',
    o: [O('Run for it', { trust: 4, fame: 2 }, 'You win by twelve votes. Your summers get shorter.', { sub: 'Have a voice', set: 'union.role' }),
      O('Back somebody else', { morale: 2 }, 'You campaign for {tvet}. He wins.', { sub: 'Support from the side' })] },
  foundation: { at: 'off', req: { seasons: [3, null], cash: 3 }, w: 2, rar: 'uncommon',
    tag: 'Home', t: 'Time to start a foundation?', x: 'Your accountant says it\'s time. Your mom says it\'s past time.',
    o: [O('Fund schools back home', { cash: -0.6, morale: 6 }, 'Two hundred laptops by September.', { sub: 'Start with the kids', set: 'foundation', rel: [['mom', 15]] }),
      O('Build courts in every park', { cash: -0.5, fame: 3 }, 'New rims and new lights in twelve parks.', { sub: 'Give back to the game', set: 'foundation' }),
      O('Start a scholarship', { cash: -0.7, morale: 5 }, 'Ten kids a year. The first class writes you letters.', { sub: 'Change a few lives', set: 'foundation' })] },
  social_mistake: { at: 'early mid off', req: { fame: [50, null] }, w: 2, rar: 'uncommon',
    tag: 'Your phone', t: 'A late night post you regret.', x: 'You were angry. You were tired. You hit send.',
    o: [O('Delete it and apologize', { trust: 2, fame: -2 }, 'Gone in ten minutes. Screenshots are forever. It fades.', { sub: 'Own the mistake' }),
      O('Double down', { fame: 5, trust: -8 }, 'It trends for two days. Then {gm} calls.', { sub: 'Stand your ground' })] },
  social_win: { at: 'off', req: { fame: [35, null] }, w: 1, rar: 'uncommon',
    tag: 'Your phone', t: 'A sick kid wears your jersey.', x: 'His nurse posted it. He\'s nine, and he says you\'re his favorite player.',
    o: [O('Visit him', { morale: 8, fame: 4 }, 'Two hours of video games. You lose on purpose. He knows.', { sub: 'Show up in person' }),
      O('Send a video and some gear', { morale: 4, fame: 2 }, 'He watches it eleven times. His nurse counts.', { sub: 'Something he can keep' })] },
  family_courtside: { at: 'early', req: { kids: [1, null], team: true }, w: 3,
    tag: 'Courtside', t: 'Your kid\'s coming to a game.', x: 'Front row. Noise-canceling headphones. Your jersey, down to the knees.',
    o: [O('Wave every timeout', { morale: 8 }, 'The broadcast catches it. Kids wave back from every seat.', { sub: 'Be a parent tonight' }),
      O('Lock in for them', { fame: 2 }, 'A big night. You point at the front row after the last bucket.', { sub: 'Give them a show' })] },
});

storyArcs({
  arc_trade_2: { at: 'late', stage: 'nba', req: { team: true },
    tag: 'Your phone', t: 'Your trade request leaked.', x: (L) => arcData(L, 'trade').loud ? 'It was never private. {beat} has the list of teams you\'d accept.' : '{beat} has it now. Somebody in the building talked.',
    o: [O('Confirm it', { fame: 4, trust: -6 }, 'No going back now. The summer will decide.', { sub: 'No turning back', go: ['trade', 'arc_trade_3', 'off', 0] }),
      O('Walk it back', { trust: 3, morale: -4 }, 'You say you\'re happy here. Nobody believes it.', { sub: 'Patch things up', go: ['trade', 'arc_trade_3', 'off', 0], do: (L) => { arcData(L, 'trade').back = 1; } })] },
  arc_trade_3: { at: 'off', stage: 'nba', req: { team: true },
    tag: 'GM\'s office', t: 'Your trade request, settled.', x: 'It\'s draft week. {gm} calls you into his office.',
    o: [O('Hear him out', {}, '', { sub: 'See what he has', do: (L, r) => {
        const d = arcData(L, 'trade');
        if (!d.back && ok(r, 0.6)) { tradeNow(L, r, true); arcEnd(L, 'trade', 'traded'); bump(L, { morale: 8 }); return 'Done. The ' + nick(L.team) + ' want you. You fly out tomorrow.'; }
        arcEnd(L, 'trade', 'stayed'); bump(L, { morale: -4, trust: 4 }); return 'No deal. He asks you to give it one more year.'; } }),
      O('Tell him you\'ve changed your mind', { trust: 8, morale: 2 }, 'He shakes your hand. A fresh start, in the same building.', { sub: 'Make it work here', end: ['trade', 'reconciled'], rel: [['gm', 20, 'You took back the trade request.']] })] },
  arc_bb_2: { at: 'mid', stage: 'nba', req: { team: true },
    tag: 'Trade deadline', t: 'It\'s trade deadline day.', x: (L) => arcData(L, 'bb').asked ? '{gm} told you there was nothing to it. It\'s Thursday at noon and your phone is face down anyway.' : 'Thursday at noon. You never asked anybody. Your phone is face down on the table.',
    o: [O('Pick up the phone', {}, '', { sub: 'Face it head on', do: (L, r) => {
        if (ok(r, 0.45)) { const from = L.team; tradeNow(L, r); arcData(L, 'bb').from = from; arcGo(L, 'bb', 'arc_bb_3', 'early', 1); return 'You\'ve been traded to the ' + nick(L.team) + '. You find out from the screen.'; }
        arcEnd(L, 'bb', 'stayed'); bump(L, { morale: 3 }); return 'Noon passes. Nobody called. You exhale.'; } }),
      O('Go to practice', { trust: 3 }, '', { sub: 'Keep your routine', do: (L, r) => {
        if (ok(r, 0.35)) { const from = L.team; tradeNow(L, r); arcData(L, 'bb').from = from; arcGo(L, 'bb', 'arc_bb_3', 'early', 1); return 'Practice stops. Somebody calls your name. You\'re on the ' + nick(L.team) + ' now.'; }
        arcEnd(L, 'bb', 'stayed'); return 'Nobody pulls you out of anything. You\'re staying.'; } })] },
  arc_bb_3: { at: 'early', stage: 'nba', req: { team: true }, when: (L) => !!arcData(L, 'bb').from && L.team !== arcData(L, 'bb').from,
    tag: 'Your old arena', t: 'Back in your old building.', x: (L) => 'The ' + nick(arcData(L, 'bb').from) + ' play a tribute video for you in the first timeout.',
    o: [O('Tap your chest', { morale: 6, fame: 2 }, 'A standing ovation. Then you drop thirty on them.', { sub: 'Thank them', end: ['bb', 'thrived'] }),
      O('Stay locked in', { trust: 3 }, 'You barely look up. You win by twelve.', { sub: 'All business tonight', end: ['bb', 'thrived'] })] },
  arc_max_2: { at: 'off', stage: 'nba',
    tag: 'Contract signing', t: 'The money talks are done.', x: (L) => { const a = arcData(L, 'max').ask; return a === 'less' ? 'You took less. The front office spent the difference on a shooter.' : a === 'walk' ? 'You looked around. Four teams flew in for meetings.' : 'Every dollar. The biggest deal in franchise history.'; },
    o: [O('Buy the whole staff dinner', { trust: 4, cash: -0.05 }, 'Equipment managers, video guys, the chef. Everybody eats.', { sub: 'Share the moment', end: ['max', 'generous'], do: (L) => { if (arcData(L, 'max').ask === 'less' && L.team) L.league.net[L.team] = (L.league.net[L.team] || 0) + 1; } }),
      O('Get back in the gym', { eth: 3 }, 'The deal\'s done. Earning it starts tomorrow.', { sub: 'Now go earn it', end: ['max', 'signed'] })] },
  arc_costar_2: { at: 'off', stage: 'nba', req: { team: true },
    tag: 'Your house', t: 'The recruiting meeting.', x: (L) => '{costar} comes to your house.' + (arcData(L, 'costar').warm ? ' He remembers the dinner.' : ' He\'s never been here before.'),
    o: [O('Pitch him on a ring', {}, '', { sub: 'Sell the dream', do: (L, r) => {
        const d = arcData(L, 'costar');
        if (ok(r, d.warm ? 0.55 : 0.4)) { arcEnd(L, 'costar', 'landed'); remember(L, 'arc.costar.landed', true); L.league.net[L.team] = (L.league.net[L.team] || 0) + 2.5; relate(L, 'costar', 30, 'He signed after the meeting at your house.'); bump(L, { morale: 8, fame: 4 }); logIt(L, 'Recruited ' + d.n + ' to the ' + nick(L.team) + '.', 'gold'); return 'He signs the next morning. Now you\'ve got help.'; }
        arcEnd(L, 'costar', 'spurned'); bump(L, { morale: -5 }); return 'He goes somewhere else. He calls to tell you himself.'; } }),
      O('Let him decide in peace', { trust: 3 }, '', { sub: 'No pressure', do: (L, r) => {
        if (ok(r, 0.3)) { arcEnd(L, 'costar', 'landed'); remember(L, 'arc.costar.landed', true); L.league.net[L.team] = (L.league.net[L.team] || 0) + 2.5; bump(L, { morale: 8 }); return 'He signs. He says you were the only one who didn\'t pressure him.'; }
        arcEnd(L, 'costar', 'spurned'); return 'He signs elsewhere. He says you were the only one who didn\'t push.'; } })] },
  arc_touch_2: { at: 'mid', stage: 'nba', req: { team: true },
    tag: 'Sports talk', t: 'Your beef with {tco} is on TV.', x: (L) => arcData(L, 'touch').more ? 'A camera caught {tco} yelling at you during a timeout.' : '{critic} spent ten minutes on you and {tco}.',
    o: [O('Own it', { trust: 4 }, 'You say it\'s on you. He hears about it.', { sub: 'Take the heat', go: ['touch', 'arc_touch_3', 'off', 0], rel: [['tco', 10]] }),
      O('Deny everything', { fame: 2 }, 'Nobody believes either of you.', { sub: 'Nothing to see here', go: ['touch', 'arc_touch_3', 'off', 0] })] },
  arc_touch_3: { at: 'off', stage: 'nba',
    tag: 'Exit meetings', t: 'You and {tco}, settled.', x: 'The season\'s over. One of you could be moved this summer.',
    o: [O('Take him to dinner', { morale: 4 }, 'Three hours. You leave as friends. Real ones.', { sub: 'Fix it for real', end: ['touch', 'friends'], rel: [['tco', 30, 'You settled it over dinner.']] }),
      O('Tell the front office to choose', { trust: -4 }, 'They choose you. He\'s traded at the draft.', { sub: 'Make them pick', end: ['touch', 'traded'], rel: [['tco', -20, 'The front office chose you over him.']] })] },
  arc_lm_2: { at: 'mid', stage: 'nba',
    tag: 'Sports talk', t: '{critic} calls you soft.', x: (L) => arcData(L, 'lm').sat ? 'Ten minutes on the rest night. He said "soft" nine times.' : 'He says you\'ll be broken down by May.',
    o: [O('Say nothing', { eth: 2 }, 'The clip goes around. You let May answer it.', { sub: 'Let May answer', go: ['lm', 'arc_lm_3', 'late', 0] }),
      O('Call into his show', { fame: 4 }, 'You\'re calm and funny. He\'s got nothing.', { sub: 'Face him live', go: ['lm', 'arc_lm_3', 'late', 0], rel: [['critic', -10, 'You called into his show.']] })] },
  arc_lm_3: { at: 'late', stage: 'nba',
    tag: 'Practice', t: 'April. How are the legs?', x: 'The playoffs start Saturday. Everybody wants to know how you feel.',
    o: [O('Tell the truth', {}, '', { sub: 'Be honest', do: (L) => { const fresh = L.m.health >= 60; arcEnd(L, 'lm', fresh ? 'fresh' : 'tired'); bump(L, fresh ? { morale: 5 } : { morale: -3 }); return fresh ? 'Fresh. You say so, and you mean it.' : 'Honestly? Tired. {critic} plays the clip twice.'; } }),
      O('Say you feel great', { fame: 1 }, 'Everybody says that in April.', { sub: 'Give nothing away', end: ['lm', 'fine'] })] },
  arc_snub_2: { at: 'mid', stage: 'nba', req: { team: true },
    tag: 'All-Star voting', t: 'A year after the snub.', x: (L) => L.season && L.season.allstar ? (arcData(L, 'snub').clip ? 'The All-Star votes are in. You made it. Your midnight clip from last year is going around again.' : 'The All-Star votes are in. You made it. You never said a word about last year.') : (arcData(L, 'snub').clip ? 'The All-Star votes are in. Again, no. Your midnight clip is every troll\'s reply.' : 'The All-Star votes are in. Again, no.'),
    o: [O('Read the list', {}, '', { sub: 'Face it', do: (L) => { const inN = !!(L.season && L.season.allstar); arcEnd(L, 'snub', inN ? 'answered' : 'chip'); bump(L, inN ? { morale: 8 } : { eth: 4 }); return inN ? 'You screenshot it. Then you delete the screenshot. No need.' : 'The chip on your shoulder gets heavier. You like the weight.'; } }),
      O('Don\'t look', { eth: 2 }, '', { sub: 'It doesn\'t matter', do: (L) => { arcEnd(L, 'snub', L.season && L.season.allstar ? 'answered' : 'chip'); return 'Your mom texts you either way.'; } })] },
  arc_shoe_2: { at: 'pre', stage: 'nba',
    tag: 'Shoe company HQ', t: 'The first sample shoe is here.', x: (L) => arcData(L, 'shoe').story ? 'The tongue has a map of {town} on it.' : 'It\'s very shiny. You\'re not sure it\'s you.',
    o: [O('Wear it on opening night', { fame: 4 }, 'The cameras find your feet all night.', { sub: 'Debut it big', go: ['shoe', 'arc_shoe_3', 'mid', 0] }),
      O('Ask for one more round of changes', { morale: 2 }, '{shoeexec} sighs. The new version is better.', { sub: 'Get it right', go: ['shoe', 'arc_shoe_3', 'mid', 0], do: (L) => { arcData(L, 'shoe').better = 1; } })] },
  arc_shoe_3: { at: 'mid', stage: 'nba',
    tag: 'Launch day', t: 'Your shoe drops tonight.', x: 'All-Star weekend. Stores open at midnight.',
    o: [O('Go to the flagship store', { fame: 3 }, '', { sub: 'Meet the fans', do: shoeLaunch }),
      O('Watch the numbers from home', { health: 2 }, '', { sub: 'Keep your distance', do: shoeLaunch })] },
  arc_mvp_2: { at: 'late', stage: 'nba',
    tag: 'Sports talk', t: 'The MVP debate is about you.', x: (L) => 'April. {critic} and two former players argue about you for an hour. They keep coming back to the ' + ({ stats: 'numbers', wins: 'wins', rest: 'games you missed' }[arcData(L, 'mvp').how] || 'numbers') + '.',
    o: [O('Watch it', { morale: -1 }, 'You turn it off at the half hour mark.', { sub: 'Know what they think', end: ['mvp', 'watched'] }),
      O('Go to sleep', { health: 2 }, 'The voters will do what they do.', { sub: 'Out of your hands', end: ['mvp', 'slept'] })] },
  arc_pf_2: { at: 'late', stage: 'nba',
    tag: 'Practice', t: 'The playoffs are almost here.', x: (L) => arcData(L, 'pf').post ? 'Your long post from last summer is the top reply under every preview. The playoffs start Saturday.' : 'Last spring\'s label is still there. You never answered it. The playoffs start Saturday.',
    o: [O('Embrace it', { morale: 3 }, 'You tell the room this is the year. You mean it.', { sub: 'Make it fuel', end: ['pf', 'embraced'] }),
      O('Tune it out', { eth: 2 }, 'Headphones on. Same routine.', { sub: 'Same old routine', end: ['pf', 'tuned'] })] },
  arc_dynasty_2: { at: 'off', stage: 'nba',
    tag: 'Front office', t: 'The summer after the dynasty question.', x: (L) => arcData(L, 'dynasty').kept ? 'The core is together. {tco} is still here.' : 'The front office is taking calls about {tco}.',
    o: [O('Fight to keep the group', { trust: 4 }, 'They keep it together. One more run.', { sub: 'One more run', end: ['dynasty', 'kept'] }),
      O('Let the business happen', { morale: -2 }, 'They move him for younger legs. It\'s the right call. It still hurts.', { sub: 'Trust the front office', end: ['dynasty', 'broke'] })] },
});

// ── adversity (NARRATIVE.md 7.7) ──

story({
  inj_comeback: { at: 'off', when: (L) => { const m = recall(L, 'inj.major'); return !!m && m.y === L.year; }, w: 9,
    tag: 'The trainer\'s room', t: 'How do you come back from this?', x: 'Surgery is behind you. {trainer} lays out three ways to spend the summer.',
    o: [O('Take the slow road', { health: 14, ath: -1 }, 'Nine months, no shortcuts. Opening night is the goal.', { sub: 'No shortcuts', start: ['comeback', 'arc_comeback_2', 'early', 1, { path: 'slow' }], rel: [['trainer', 15, 'You took the slow road back.']] }),
      O('Push to be ready early', { health: 4 }, 'Ahead of schedule. Everybody says so. You hope so.', { sub: 'Get back fast', start: ['comeback', 'arc_comeback_2', 'early', 1, { path: 'fast' }] }),
      O('Try an experimental treatment', { cash: -0.4, health: 8 }, 'A clinic overseas. It costs a fortune. It looks promising.', { sub: 'Pricey, but promising', start: ['comeback', 'arc_comeback_2', 'early', 1, { path: 'new' }] })] },
  md_sore: { at: 'mid', req: { seasons: [2, null], team: true }, when: (L) => L.m.health < 85, w: 2, rar: 'uncommon',
    tag: 'The trainer\'s room', t: 'The soreness won\'t go away.', x: 'Your hip has ached for six weeks. The team doctor calls it tightness.',
    o: [O('Trust the team doctor', { health: -3 }, 'Ice and stretching. It gets a little better.', { sub: 'Go with the staff', start: ['md', 'arc_md_2', 'off', 0, { second: 0 }] }),
      O('Get a second opinion', { cash: -0.05, trust: -3 }, 'A specialist you pay for yourself. The team isn\'t thrilled.', { sub: 'Protect yourself', start: ['md', 'arc_md_2', 'off', 0, { second: 1 }] })] },
  cc_counsel: { at: 'mid off', req: { seasons: [2, null] }, when: (L) => (L.evlog && (L.evlog.slump || []).length >= 2 && L.m.morale < 55) || L.m.morale < 30, w: 3,
    tag: 'Home', t: 'Something\'s off, and it isn\'t your jumper.', x: 'You aren\'t sleeping. Games feel like tests you didn\'t study for.',
    o: [O('Talk to someone', { morale: 10 }, 'Once a week, all season. It\'s the best decision of your career.', { sub: 'Ask for help', set: 'cc.help', start: ['cc', 'arc_cc_2', 'pre', 1] }),
      O('Work through it alone', { eth: 3, morale: -2 }, 'Longer hours in the gym. It helps a little.', { sub: 'Handle it yourself', start: ['cc', 'arc_cc_2', 'pre', 1, { alone: 1 }] })] },
  lr_split: { at: 'early', req: { seasons: [2, null], team: true }, when: (L) => L.season && L.season.w < L.season.l, tags: 'locker', w: 2, rar: 'uncommon',
    tag: 'The locker room', t: 'The locker room has split in two.', x: 'Vets on one side, young guys on the other. {tvet} and {trook} have stopped talking.',
    o: [O('Call a players-only meeting', { trust: 3 }, 'You book a room for after practice.', { sub: 'Step up and lead', start: ['rift', 'arc_rift_2', 'mid', 0, { led: 1 }] }),
      O('Stay out of it', { morale: -2 }, 'It doesn\'t go away on its own.', { sub: 'Not your fight', start: ['rift', 'arc_rift_2', 'mid', 0] })] },
  susp_flagrant: { at: 'early mid', req: { team: true }, when: (L) => trait(L, 'hothead') || L.m.morale < 30, tags: 'court', w: 3,
    tag: 'The court', t: 'Flagrant two. You\'re gone.', x: 'He undercut you on a layup. You got up swinging. Ejected.',
    o: [O('Apologize after the game', { trust: 4, cash: -0.05 }, 'A one game suspension. The league notes the apology.', { sub: 'Own it', set: 'susp.games' }),
      O('Defend what you did', { fame: 3, trust: -6, cash: -0.1 }, 'Two games. {critic} has a field day.', { sub: 'He had it coming', set: 'susp.games', rel: [['critic', -5]] })] },
  susp_curfew: { at: 'mid', req: { team: true }, when: (L) => !!(L.evlog && L.evlog.night_out), w: 1, rar: 'uncommon',
    tag: 'Team hotel', t: 'You missed curfew.', x: 'Three in the morning on a road trip. Security has the time stamp.',
    o: [O('Own it to the team', { trust: 2, min: -2 }, 'One game. You tell the room before the coaches can.', { sub: 'Face the music', set: 'susp.curfew' }),
      O('Blame the hotel', { trust: -8, min: -3 }, 'Nobody buys it. Two games.', { sub: 'Try to wriggle out', set: 'susp.curfew' })] },
  boo_night: { at: 'mid', req: { team: true, seasons: [2, null] }, when: (L) => !!(L.season && L.season.w < L.season.l - 6), w: 3,
    tag: 'Home court', t: 'Your own fans are booing you.', x: 'It\'s your building and your fans, and every missed shot gets booed.',
    o: [O('Cup your ear', { fame: 4, trust: -4 }, 'They boo louder. You score on the next three trips.', { sub: 'Give it right back', start: ['boo', 'arc_boo_2', 'off', 0, { loud: 1 }] }),
      O('Clap along with them', { morale: -2, trust: 3 }, 'You agree with them, and it takes the sting out of the place.', { sub: 'Show them you get it', start: ['boo', 'arc_boo_2', 'off', 0] }),
      O('Tune it out', { eth: 2 }, 'Imaginary headphones on. It\'s still loud.', { sub: 'Block out the noise', start: ['boo', 'arc_boo_2', 'off', 0] })] },
  tv_take: { at: 'early', req: { fame: [55, null], seasons: [1, null] }, w: 3,
    tag: 'Sports talk', t: '{critic} says you\'re overrated.', x: 'Hot Take Hour. Your face on a graphic with "overrated" stamped in red.',
    o: [O('Respond online', { fame: 4 }, 'Three words. It gets more views than his show.', { sub: 'Clap back', start: ['tv', 'arc_tv_2', 'off', 0, { clap: 1 }], rel: [['critic', -15, 'You clapped back online.']] }),
      O('Ignore him', { eth: 2 }, 'He keeps talking. That\'s his job.', { sub: 'Don\'t feed it', start: ['tv', 'arc_tv_2', 'off', 0] })] },
  sonny_pitch: { at: 'off', req: { seasons: [1, 6] }, when: (L) => L.agent !== 'power', w: 3,
    tag: 'Agent\'s office', t: '{sonny} wants to represent you.', x: 'Two phones, a nice watch, a lot of promises. "Your endorsements are worth double," he says.',
    o: [O('Let him run your endorsements', { morale: 3, fame: 2 }, 'He gets you a magazine cover by September.', { sub: 'Chase the money', start: ['sonny', 'arc_sonny_2', 'off', 1], set: 'agent.sonny', rel: [['sonny', 25, 'He took over your endorsements.']] }),
      O('Ask {maya} about him', { iq: 1 }, 'She says nothing bad. She says it carefully.', { sub: 'Get a second read', rel: [['maya', 15, 'You asked her about Sonny.']] }),
      O('Tell him no', { trust: 1 }, 'He leaves his card. Two cards, actually.', { sub: 'Trust your gut' })] },
  hf_drives_you: { at: 'hs_sum', req: { grade: [10, 11] }, w: 4,
    tag: 'Summer ball', t: '{friend} finally has a car.', x: 'It has one working door. He drives you to every AAU game anyway.',
    o: [O('Pay him back in gas money', { cash: -0.01, morale: 4 }, 'He refuses. You leave it in the cupholder anyway.', { sub: 'Square things up', set: 'friend.tavi', start: ['tavi', 'arc_tavi_2', 'off', 3], rel: [['friend', 25, 'He drove you to every AAU game.']] }),
      O('Promise him something bigger', { morale: 5 }, '"When you make it," he says. He means it as a joke.', { sub: 'Remember who helped', set: ['friend.tavi', 'friend.promise'], start: ['tavi', 'arc_tavi_2', 'off', 3], rel: [['friend', 30, 'You promised him something when you made it.']] })] },
  money_broke: { at: 'off', req: { seasons: [3, null] }, when: (L) => L.earned > 5 && L.cash < L.earned * 0.3, w: 6,
    tag: 'Adviser\'s office', t: 'Your adviser wants a meeting.', x: 'The numbers are bad. You\'ve earned a lot. You\'ve kept very little.',
    o: [O('Listen and cut back', { cash: 0.6, morale: -4 }, 'A smaller house. Fewer cars. A real plan.', { sub: 'Fix it now', set: 'money.warned' }),
      O('Ignore it', { morale: 2 }, 'You\'ll figure it out next season. Probably.', { sub: 'Worry about it later', set: 'money.ignored', do: (L) => { L.cash = round1(Math.max(0, L.cash - 0.4)); } })] },
  money_generational: { at: 'off', req: { seasons: [8, null], cash: 30 }, w: 5,
    tag: 'Accountant\'s office', t: 'You have generational money now.', x: 'Your accountant says your great-grandkids will never need to work.',
    o: [O('Set up a trust', { morale: 6 }, 'Lawyers, signatures and peace of mind.', { sub: 'Think long term', set: 'money.gen' }),
      O('Buy something ridiculous', { cash: -2, fame: 3 }, 'A vineyard. You don\'t drink wine.', { sub: 'You only live once', set: 'money.splurge' })] },
  hs_jersey_return: { at: 'off', req: { seasons: [7, null], stars: [1, null] }, w: 4,
    tag: 'Your old school', t: 'Your high school is retiring your number.', x: 'A Friday night in {town}. Your old coach is holding the frame.',
    o: [O('Fly home for it', { morale: 10, fame: 2 }, 'The gym\'s sold out. Your coach cries before you do.', { sub: 'Be there in person', set: 'hs.numret', rel: [['hscoach', 30, 'He held the frame when they retired your number.']] }),
      O('Send your family', { morale: 4 }, 'Your mom gives the speech. It\'s better than yours would have been.', { sub: 'Let them stand in', set: 'hs.numret' })] },
  mom_house: { at: 'off', req: { seasons: [1, 4] }, when: (L) => !recall(L, 'family.house') && L.cash >= 2, w: 4,
    tag: 'Home', t: 'Your mom still lives in the old place.', x: 'Two bedrooms, and the heat doesn\'t always work.',
    o: [O('Buy her a house', { cash: -1.2, morale: 10 }, 'She picks a yellow one with a porch. She cries on the porch.', { sub: 'Family first', set: 'family.house', rel: [['mom', 30, 'You bought her a house.']] }),
      O('Fix up the old one', { cash: -0.3, morale: 6 }, 'New heat, new roof. She refuses to move anyway.', { sub: 'Respect her wishes', rel: [['mom', 15]] })] },
  heckler_lou: { at: 'mid', req: { team: true, seasons: [1, null] }, tags: 'court', w: 2, rar: 'uncommon',
    tag: 'Front row', t: 'The same heckler, every game.', x: '{fan} has heckled you since your first game here. Tonight it\'s your free throws.',
    o: [O('Make both and wink', { fame: 2 }, 'He laughs. Then he picks on somebody else.', { sub: 'Win him over', start: ['lou', 'arc_lou_2', 'off', 4, { wink: 1 }], rel: [['fan', 10, 'You winked at him after two free throws.']] }),
      O('Give him a look', { trust: -1 }, 'He loves it. Now he has material.', { sub: 'Let him know', start: ['lou', 'arc_lou_2', 'off', 4], rel: [['fan', -5]] })] },
});

storyArcs({
  arc_comeback_2: { at: 'early', stage: 'nba', req: { team: true },
    tag: 'Home court', t: 'Your comeback game.', x: (L) => ({ slow: 'Nine months to the day.', fast: 'Ahead of schedule, everybody says.', new: 'The treatment worked. You think.' }[arcData(L, 'comeback').path] || '') + ' The building stands when you check in.',
    o: [O('Attack the rim', {}, '', { sub: 'Test it right away', do: (L, r) => {
        const d = arcData(L, 'comeback'); const p = d.path === 'slow' ? 0.75 : d.path === 'new' ? 0.6 : 0.5;
        if (ok(r, p)) { arcEnd(L, 'comeback', 'full'); bump(L, { morale: 10, fame: 4 }); return 'Your first dunk in a year. The bench empties.'; }
        arcEnd(L, 'comeback', 'reinvent'); bump(L, { ath: -2, iq: 2, morale: -2 }); return 'The burst isn\'t all the way back. You\'ll have to play smarter now.'; } }),
      O('Ease in', { trust: 3 }, 'Fourteen minutes. Smart. You\'re back.', { sub: 'Play it smart', end: ['comeback', 'eased'] })] },
  arc_md_2: { at: 'off', stage: 'nba',
    tag: 'The doctor\'s office', t: 'The scan comes back.', x: (L) => arcData(L, 'md').second ? 'The specialist was right. It was never just tightness.' : 'A new scan after the season. It was never just tightness.',
    o: [O('Fix it now', {}, '', { sub: 'Deal with it', do: (L) => { const early = arcData(L, 'md').second; arcEnd(L, 'md', early ? 'early' : 'late'); bump(L, early ? { health: 10 } : { health: 4, ath: -2 }); return early ? 'Caught early. A small procedure and a full summer.' : 'A bigger fix than it needed to be. You lose some burst.'; } }),
      O('Talk to the team about it', { trust: -3 }, 'A long meeting. Everybody\'s sorry. Nobody says it.', { sub: 'Clear the air', end: ['md', 'talked'], rel: [['gm', -10, 'The misdiagnosed hip.']] })] },
  arc_cc_2: { at: 'pre', stage: 'nba',
    tag: 'Training camp', t: 'Camp opens. You feel different.', x: (L) => arcData(L, 'cc').alone ? 'The summer of long hours helped. Some.' : 'A summer of honest conversations. You feel lighter.',
    o: [O('Tell your teammates about it', { trust: 6, morale: 6 }, 'Two of them come to you that week with their own stuff.', { sub: 'Open up', end: ['cc', 'growth'] }),
      O('Keep it to yourself', { morale: 4 }, 'You feel better. That\'s enough.', { sub: 'Some things stay private', end: ['cc', 'quiet'] })] },
  arc_rift_2: { at: 'mid', stage: 'nba', req: { team: true },
    tag: 'The locker room', t: 'The players-only meeting.', x: (L) => arcData(L, 'rift').led ? 'Your meeting. Forty minutes. Raised voices, then quiet ones.' : 'Somebody else called it. Everybody looks at you anyway.',
    o: [O('Say the hard thing', { trust: 4 }, '', { sub: 'Lead from the front', do: (L, r) => { if (ok(r, arcData(L, 'rift').led ? 0.65 : 0.45)) { arcEnd(L, 'rift', 'leader'); bump(L, { win: 0.6, morale: 6 }); return 'You win six of the next seven. The room is yours now.'; } arcEnd(L, 'rift', 'scapegoat'); bump(L, { trust: -6, morale: -4 }); return 'It leaks. Now you\'re the story.'; } }),
      O('Just listen', { iq: 1 }, 'You hear things you didn\'t know. Some of them about you.', { sub: 'Hear everybody out', end: ['rift', 'listened'] })] },
  arc_boo_2: { at: 'off', stage: 'nba',
    tag: 'Around town', t: 'The summer after the boos.', x: (L) => arcData(L, 'boo').loud ? 'The ear cup is a meme. Half the city loves it.' : 'The city wants to know if you even want to be here.',
    o: [O('Run a free camp in the city', { morale: 6, cash: -0.05 }, 'A thousand kids. Their parents cheer the loudest.', { sub: 'Win them back', end: ['boo', 'won'] }),
      O('Say nothing until opening night', { eth: 3 }, 'The first home game will answer it, either way.', { sub: 'Answer on the court', end: ['boo', 'waited'] })] },
  arc_tv_2: { at: 'off', stage: 'nba',
    tag: 'TV studio', t: '{critic} wants you on his show.', x: (L) => arcData(L, 'tv').clap ? 'Hot Take Hour, in studio. Your three words are on the screen behind his chair. He\'s never been fair.' : 'Hot Take Hour, in studio. He promises to be fair. He\'s never been fair.',
    o: [O('Go on the show', {}, '', { sub: 'Face him', do: (L, r) => { if (ok(r, 0.55 + (L.m.fame - 50) * 0.005 - (arcData(L, 'tv').clap ? 0.1 : 0))) { arcEnd(L, 'tv', 'truce'); relate(L, 'critic', 25, 'You went on his show and won.'); bump(L, { fame: 5, morale: 4 }); return 'You\'re funny and calm. By the end he\'s laughing. A truce, on air.'; } arcEnd(L, 'tv', 'feud'); relate(L, 'critic', -20, 'You went on his show and it went badly.'); bump(L, { fame: 3, morale: -4 }); return 'He ambushes you with a clip. Now the feud lives forever.'; } }),
      O('Turn him down', { trust: 2 }, 'He calls you scared on air. You\'re on vacation.', { sub: 'Not worth it', end: ['tv', 'declined'] })] },
  arc_sonny_2: { at: 'off', stage: 'nba',
    tag: 'Agent\'s office', t: '{sonny} made a side deal.', x: 'A shoe company paid him to steer you their way. It\'s in a court filing.',
    o: [O('Fire him', { trust: 4 }, 'You hire {maya} the same week. She hates surprises. You love that.', { sub: 'Cut ties', end: ['sonny', 'fired'], rel: [['sonny', -40, 'You fired him over the side deal.'], ['maya', 25, 'You hired her after Sonny.']] }),
      O('Hear his side', { morale: -2 }, '', { sub: 'Give him a chance', do: (L, r) => { if (ok(r, 0.5)) { arcEnd(L, 'sonny', 'saved'); bump(L, { cash: 0.6 }); return 'He turns the mess into a better deal. You don\'t ask how.'; } arcEnd(L, 'sonny', 'sunk'); bump(L, { cash: -0.8, fame: -3 }); return 'It gets worse. A settlement and a lot of headlines.'; } })] },
  arc_tavi_2: { at: 'off', stage: 'nba',
    tag: 'Home', t: '{friend} wants a job.', x: (L) => (recall(L, 'friend.promise') ? 'You promised him something when you made it. ' : '') + 'He wants on the payroll. Driver, assistant, anything.',
    o: [O('Hire him', { cash: -0.1, morale: 4 }, 'He\'s late twice the first week. He\'s also the only one who tells you the truth.', { sub: 'Keep him close', go: ['tavi', 'arc_tavi_3', 'off', 3], do: (L) => { arcData(L, 'tavi').job = 1; } }),
      O('Help him start a business', { cash: -0.4 }, 'A barbershop near your old court. He cuts your hair before every playoff run.', { sub: 'Help him stand alone', go: ['tavi', 'arc_tavi_3', 'off', 3], do: (L) => { arcData(L, 'tavi').biz = 1; } }),
      O('Say no', { morale: -4 }, 'He says he understands. He calls less.', { sub: 'Keep business separate', end: ['tavi', 'cut'], rel: [['friend', -30, 'You said no when he asked for a job.']] })] },
  arc_tavi_3: { at: 'off', stage: 'nba',
    tag: 'Home', t: '{friend} has news.', x: (L) => arcData(L, 'tavi').biz ? 'The barbershop just opened a second location.' : 'He wants to know if he can be more than your driver.',
    o: [O('Make him a partner', { cash: -0.2, morale: 8 }, 'Your names side by side on the paperwork. He frames the first page.', { sub: 'Build it together', end: ['tavi', 'partner'], rel: [['friend', 30, 'He became your business partner.']] }),
      O('Ask him to be your best man', { morale: 10 }, 'He laughs, then he cries, then he says yes.', { sub: 'Brothers for life', end: ['tavi', 'bestman'], rel: [['friend', 40, 'You asked him to be your best man.']] })] },
  arc_lou_2: { at: 'off', stage: 'nba', when: (L) => !!L.team,
    tag: 'Fan mail', t: '{fan} wrote you a letter.', x: (L) => arcData(L, 'lou').wink ? 'He\'s heckled you for years. Since the wink he cheers more than he heckles. He has a stub for every game.' : 'He\'s heckled you for years. The look you gave him is framed in his kitchen. He has every stub.',
    o: [O('Invite him to practice', { morale: 6, fame: 2 }, 'He can\'t talk the whole time. First time ever.', { sub: 'Bring him inside', end: ['lou', 'friends'], rel: [['fan', 30, 'You invited him to practice.']] }),
      O('Write him back', { morale: 4 }, 'Two lines. He laminates it.', { sub: 'A small gesture', end: ['lou', 'letter'], rel: [['fan', 20]] })] },
});

// ── answers that come back (the owner's call, 2026-10-16) ──

/* An answer is remembered so that something later can turn on it. Each card
   here is dealt only to a career that gave one particular answer years
   before, opens with that memory (`cb`), and plays out differently because of
   it. Every answer a career remembers is read somewhere: here, by an arc, or
   as a callback line (CALLBACKS), and check-story holds that. */
story({
  pay_broke_mate: { at: 'off', req: { seasons: [5, null] }, when: (L) => !!(recall(L, 'money.saved') || recall(L, 'money.gen') || recall(L, 'money.warned')), w: 3, rar: 'uncommon',
    tag: 'Your phone', t: '{tm} is broke.', x: 'He made more than you some years. He asks how you still have yours.',
    o: [O('Sit down with him and your adviser', { trust: 5, morale: 4 }, 'Three hours and a spreadsheet. He sends you a photo of his first budget.', { sub: 'Teach him what you learned', set: 'pay.broke.helped', rel: [['tm', 25, 'You showed him how to keep his money.']] }),
      O('Lend him the money', { cash: -0.5, morale: 2 }, 'He says he\'ll pay you back by Christmas.', { sub: 'Help him now', set: 'pay.broke.lent', rel: [['tm', 15, 'You lent him money.']] })] },
  pay_money_gone: { at: 'off', req: { mem: ['money.ignored'], seasons: [6, null] }, when: (L) => L.cash < L.earned * 0.3, w: 5, cb: 'money.ignored',
    tag: 'Adviser\'s office', t: 'The money is running out.', x: 'Your adviser doesn\'t sit down this time. He slides a single page across the desk.',
    o: [O('Sell the houses', { cash: 0.8, morale: -6 }, 'Two houses and a boat. It hurts. It works.', { sub: 'Fix it for real', set: 'money.fixed' }),
      O('Sign for the most money you can', { morale: -2 }, 'You tell {agent:first} money comes first now. He understands.', { sub: 'Chase the check', set: 'money.chase' })] },
  pay_rookie_star: { at: 'mid', req: { mem: ['mentored.rookie'], seasons: [4, null], team: true }, w: 4, cb: 'mentored.rookie',
    tag: 'Your phone', t: 'The kid you mentored said your name.', x: 'On a podcast, the rookie you mentored is asked who taught him to be a pro. He doesn\'t even think about it.',
    o: [O('Text him congrats', { morale: 6 }, 'He sends back a picture of the two of you at his first camp.', { sub: 'Keep it simple' }),
      O('Go on the podcast with him', { morale: 4, fame: 3 }, 'An hour of stories about his first camp. The clip of him doing your voice goes everywhere.', { sub: 'Be there for it', set: 'pay.rookie.pod' })] },
  pay_rebuild_done: { at: 'pre', req: { mem: ['rebuild.stayed'], seasons: [3, null], team: true }, when: (L) => { const m = recall(L, 'rebuild.stayed'); return !!m && L.year - m.y >= 2 && clubNet(L, L.team) >= 2; }, w: 6, cb: 'rebuild.stayed',
    tag: 'Training camp', t: 'The kids you raised can play now.', x: 'You stayed when they tore it down. Now the kids you raised are good, and the preseason picks say so.',
    o: [O('Tell the room it\'s time', { morale: 6, trust: 4 }, 'You remind them of the bad years. Nobody wants to go back.', { sub: 'Lead them', set: 'pay.rebuild.led' }),
      O('Let the young guys talk', { trust: 6 }, 'They run camp. You run the second unit. It works.', { sub: 'Hand it over' })] },
  pay_dn_list: { at: 'mid', req: { mem: ['dn.list'], team: true, seasons: [1, 6] }, w: 4, cb: 'dn.list',
    tag: 'The locker room', t: 'A team on the list is in town.', x: 'One of those teams is in town tonight. The list is taped inside your locker.',
    o: [O('Drop forty on them', { fame: 4, morale: 4 }, '', { sub: 'Make them pay', p: (L) => clamp(0.3 + (ovrOf(L) - 70) * 0.02, 0.1, 0.7), set: 'pay.list.forty', no: { fx: { morale: -2 }, s: 'You press all night. Eleven points. The list stays taped up.' } }),
      O('Cross them off quietly', { eth: 3 }, 'A good game and a win. You draw one line through their name.', { sub: 'Let it go' })] },
  pay_fed_olympics: { at: 'off', req: { seasons: [3, null] }, when: (L) => L.year % 4 === 0 && !!(recall(L, 'intl.flag') || recall(L, 'intl.fedfeud')), w: 6,
    tag: 'Your phone', t: 'The Olympic roster is out.', x: (L) => recall(L, 'intl.flag') ? 'You played for your country every summer. The federation names you captain.' : 'You skipped a national team window once. The federation left you off the roster.',
    o: [O('Make the call home', { morale: 5 }, '', { sub: 'Say something', do: (L) => { if (recall(L, 'intl.flag')) { bump(L, { fame: 4 }); return 'Your mom cries on the phone. The whole country is watching in August.'; } bump(L, { morale: -6 }); return 'You call the federation president. He doesn\'t pick up.'; } }),
      O('Post about it', { fame: 2 }, '', { sub: 'Go public', do: (L) => recall(L, 'intl.flag') ? 'A photo in the national jersey. Your most liked post ever.' : 'A long post about loyalty. It starts a week of arguments back home.' })] },
  /* The rookie who writes at 2 a.m. writes to the vet who asked for help
     himself, or who once took a rookie under his wing. */
  pay_cc_dm: { at: 'off', req: { seasons: [3, null] }, when: (L) => !!(recall(L, 'cc.help') || recall(L, 'arc.cc.growth') || recall(L, 'mentored.rookie') || recall(L, 'arc.mentor2.mentor') || recall(L, 'arc.mentor2.both')), w: 5, cb: 'cc.help',
    tag: 'Your phone', t: 'A rookie DMs you at 2 a.m.', x: (L) => recall(L, 'cc.help') || recall(L, 'arc.cc.growth') ? 'He can\'t sleep. He saw you talk about getting help once. He asks if it really works.' : 'He can\'t sleep. He says you\'re the only vet who ever asked how he was doing.',
    o: [O('Call him right now', { morale: 6, trust: 4 }, 'An hour on the phone. By the end he\'s laughing.', { sub: 'Pay it forward', set: 'pay.cc.called' }),
      O('Send him a counselor\'s number', { morale: 3 }, 'He sends back a thumbs up. A month later, a longer message.', { sub: 'Point him the right way' })] },
  pay_captain_home: { at: 'off', req: { seasons: [4, null] }, when: (L) => !!(recall(L, 'col.captain') || recall(L, 'col.senior')), w: 3, rar: 'uncommon',
    tag: 'Your phone', t: '{school} wants to hang your jersey.', x: 'Your old coach calls. They want you back for a night in February.',
    o: [O('Fly in for it', { morale: 8, fame: 2 }, 'The students chant the old chant. Your old managers are in the front row.', { sub: 'Be there in person', set: 'pay.jersey.home' }),
      O('Send a video', { morale: 2 }, 'Ninety seconds from a hotel room. They play it twice.', { sub: 'You\'re in season' })] },
  pay_bet_talk: { at: 'pre', req: { mem: ['bet.reported'], seasons: [4, null] }, w: 4, cb: 'bet.reported',
    tag: 'Rookie orientation', t: '{commish} wants you at rookie orientation.', x: 'A talk on gambling. You\'re the only player who ever called security.',
    o: [O('Give the talk', { trust: 6, fame: 2 }, 'You tell them about the text at noon. The room is quiet the whole time.', { sub: 'Tell them how it starts', set: 'pay.bet.talk' }),
      O('Pass', { morale: 2 }, 'You say you\'d rather leave it in the past. {commish} understands.', { sub: 'Keep it behind you' })] },
});

// ── late career (NARRATIVE.md 7.9) ──

story({
  v_smaller_role: { at: 'pre', req: { age: [32, null], team: true }, when: (L) => { const h = L.history[L.history.length - 1]; return !!h && ovrOf(L) < h.ovr; }, w: 4,
    tag: 'Training camp', t: 'They want you coming off the bench.', x: 'The camp depth chart has your name lower than it was last year.',
    o: [O('Accept the role', { trust: 8, morale: -2, min: -3 }, 'You run the second unit like a coach.', { sub: 'Lead the second unit', set: 'v.role' }),
      O('Fight for minutes', { eth: 4, health: -3 }, 'You win the job back for a month. Then the young legs win it.', { sub: 'You\'re not done yet', set: 'v.role' }),
      O('Ask to be moved', { trust: -6 }, '{gm} says he\'ll see. He means no.', { sub: 'Find minutes elsewhere', set: 'v.role', rel: [['gm', -10]] })] },
  v_ring_chase: { at: 'off', req: { age: [33, null], rings: [0, 0], team: true }, when: (L) => !!(L.contract && L.contract.years >= 1) && clubNet(L, L.team) < 2, w: 4,
    tag: 'Agent\'s office', t: 'No ring, and time is running out.', x: 'A contender would take you for the minimum. Going means walking away from money.',
    o: [O('Take the buyout and chase it', { morale: 6 }, '', { sub: 'Ring over money', do: (L, r) => { tradeNow(L, r, true); L.contract = { years: 1, total: 1, salary: round1(capFor(L.year) * MIN_PCT), kind: 'min', start: L.year + 1 }; remember(L, 'route.ringchase', true); logIt(L, 'Took the minimum to chase a ring with the ' + nick(L.team) + '.', 'gold'); return 'You sign with the ' + nick(L.team) + ' for the minimum. They\'ve got a real shot.'; } }),
      O('Stay where you are', { trust: 6, morale: -2 }, 'Loyalty. It might be the right call. It might not.', { sub: 'Loyalty matters', set: 'v.stayed' })] },
  mr_rookie: { at: 'pre', req: { age: [31, null], team: true, seasons: [7, null] }, w: 4,
    tag: 'Training camp', t: 'The team just drafted your replacement.', x: '{rookie2} is twenty and plays your position. Your old poster is his lock screen.',
    o: [O('Take him under your wing', { trust: 6, morale: 3 }, 'You teach him to rest, read a scouting report and handle {beat}.', { sub: 'Pass it on', start: ['mentor2', 'arc_mentor2_2', 'mid', 0, { teach: 1 }], rel: [['rookie2', 25, 'You took him under your wing.']], set: 'route.vet' }),
      O('Make him earn it', { eth: 3 }, 'You guard him every practice. He gets better fast.', { sub: 'Iron sharpens iron', start: ['mentor2', 'arc_mentor2_2', 'mid', 0], rel: [['rookie2', 5]] })] },
  v_milestone: { at: 'mid', req: { team: true, age: [30, null] }, when: (L) => { const T = totals(L); return [10000, 15000, 20000, 25000, 30000].some((m) => T.pts < m && T.pts >= m - 900); }, w: 5,
    tag: 'The arena', t: 'A big milestone is close.', x: (L) => { const T = totals(L); const m = [10000, 15000, 20000, 25000, 30000].find((x) => T.pts < x && T.pts >= x - 900); return (m - T.pts) + ' points to ' + m.toLocaleString('en-US') + '. Everybody\'s counting.'; },
    o: [O('Chase it', { usage: 0.02, fame: 2 }, 'You get it in March, on a pull-up. They stop the game.', { sub: 'Get it done', set: 'v.chase' }),
      O('Let it come to you', { trust: 4 }, 'It comes on a free throw in a blowout. Perfect.', { sub: 'Don\'t force it', set: 'v.waited' })] },
  v_rival_last: { at: 'mid', req: { rival: true, age: [33, null], team: true }, w: 6,
    tag: 'The arena', t: 'Probably the last time you face him.', x: '{rival} and you, one more time. The whole arena knows it.',
    o: [O('Trade jerseys after', { morale: 8 }, 'You both hold up each other\'s jersey for the cameras.', { sub: 'Honor the rivalry', set: 'rival.last', rel: [['rival', 20, 'You swapped jerseys the last time you played.']] }),
      O('Beat him one last time', { fame: 3 }, 'You hit the dagger. He laughs about it in the handshake.', { sub: 'Get the last word', set: 'rival.last' })] },
  v_hair_grey: { at: 'pre', req: { age: [33, 34] }, w: 3,
    tag: 'Picture day', t: 'Is that a grey hair?', x: '{trook} spots it on picture day. The whole locker room knows by lunch.',
    o: [O('Leave it', { morale: 3 }, 'You call it experience. They call you Unc.', { sub: 'Wear it proudly', rel: [['trook', 10]] }),
      O('Dye it', { fame: 1 }, 'They find the box in the trash. Worse.', { sub: 'Stay young' })] },
  v_bench_coach: { at: 'mid', req: { age: [33, null], team: true }, when: (L) => trait(L, 'lockerVoice') || L.rt.iq >= 72, tags: 'court', w: 4,
    tag: 'Timeout', t: 'You get the clipboard.', x: 'A timeout in a blowout. You\'re told to draw something up.',
    o: [O('Draw a play for the rookie', { trust: 6, morale: 4 }, 'He scores. The bench loses it. So does the whole staff.', { sub: 'Set somebody up', set: ['v.coachy', 'route.vet'] }),
      O('Hand it back with a smile', { morale: 2 }, 'He laughs. He asks again in March.', { sub: 'Not your job yet', set: 'v.coachy' })] },
  fw_announce: { at: 'pre', req: { age: [35, null], team: true }, w: 5,
    tag: 'Training camp', t: 'Is this your last season?', x: 'Your body is telling you so. You haven\'t said it out loud yet.',
    o: [O('Announce it', { fame: 6, morale: 6 }, 'A press conference. A farewell season. Every road arena has a gift waiting.', { sub: 'Say goodbye properly', start: ['farewell', 'arc_farewell_2', 'mid', 0], do: (L) => { L.flags.farewell = L.year; remember(L, 'fw.announced', true); } }),
      O('Keep it quiet', { eth: 2 }, 'You\'ll decide in the summer. Like always.', { sub: 'Decide later' })] },

  // ── playoffs and the league (7.10, 7.11) ──
  po_road: { at: 'late', when: (L) => !!(L.season && L.season.seed >= 6 && L.season.seed <= 8), w: 1, rar: 'uncommon',
    tag: 'Team plane', t: 'You open the playoffs on the road.', x: 'Lower seed. A hostile building on Saturday. The team plane leaves Thursday.',
    o: [O('Say it\'s the same game', { trust: 4, win: 0.2 }, 'They believe it. Mostly.', { sub: 'Keep everyone calm' }),
      O('Embrace being the villain', { fame: 2, morale: 3 }, 'You walk in waving. Their fans hate it. You love it.', { sub: 'Feed off the hate' })] },
  po_hurt: { at: 'late', when: (L) => L.m.health < 72 && !!(L.season && L.season.seed && L.season.seed <= 10), w: 4,
    tag: 'The trainer\'s room', t: 'You\'re not healthy for the playoffs.', x: 'Something\'s wrong in your ankle. The team doctor says you could make it worse.',
    o: [O('Play through it', { health: -6, fame: 3, win: 0.2 }, 'You tape it twice and play. It hurts for a month after.', { sub: 'It\'s the playoffs' }),
      O('Sit out Game 1', { health: 8, win: -0.2 }, 'You watch in a suit. It\'s the hardest game of your career.', { sub: 'Get right first' })] },
  po_elim_presser: { at: 'off', when: (L) => { const h = L.history[L.history.length - 1]; return !!h && h.y === L.year && /R1|R2|CF|Finals/.test(h.po || ''); }, w: 2,
    tag: 'Exit interviews', t: 'Cleaning out your locker.', x: 'The season ended a week ago. {press} has the last questions.',
    o: [O('Take the blame', { trust: 6, fame: -1 }, 'The room respects it. {beat} writes it up kindly.', { sub: 'Protect your guys' }),
      O('Look ahead', { morale: 3 }, 'You talk about the summer. Nobody quotes it.', { sub: 'Turn the page' })] },
  lg_cup: { at: 'early', req: { team: true }, when: (L) => clubNet(L, L.team) > 2, w: 2, rar: 'uncommon',
    tag: 'Las Vegas', t: 'The in-season tournament final.', x: 'December in Las Vegas. A cup, prize money and a court painted gold.',
    o: [O('Take it seriously', { fame: 3, health: -3 }, '', { sub: 'Go win a trophy', do: (L, r) => { if (ok(r, 0.5)) { bump(L, { cash: 0.3, morale: 6 }); remember(L, 'lg.cup', true); return 'You win the cup. The prize money buys the whole staff a vacation.'; } bump(L, { morale: -3 }); return 'You lose the final by two. A strange December hurt.'; } }),
      O('Treat it like any game', { health: 2 }, 'You lose the final. You\'re fresh in April.', { sub: 'Save it for April' })] },
  lg_deadline_day: { at: 'mid', req: { team: true, seasons: [1, null] }, when: (L) => clubNet(L, L.team) > 3 && (!L.season || !L.season.deadline || (L.season.deadline.mode === 'buy' && !L.season.deadline.got)), w: 1, rar: 'uncommon',
    tag: 'Front office', t: 'The front office is still buying.', x: 'The deadline passed with no deal. Now they want a veteran off the buyout market. What does the team need?',
    o: [O('Ask for a shooter', { win: 0.4 }, 'They get one. Your driving lanes open up.', { sub: 'Open up the floor' }),
      O('Ask for a defender', { win: 0.4, def: 1 }, 'They get one. You finally get a night off from the best scorer.', { sub: 'Lighten your load' })] },
  lg_lockout: { at: 'off', req: { seasons: [2, null] }, when: (L) => !recall(L, 'lg.lockout') && L.year % 11 === 3, w: 4, rar: 'rare',
    tag: 'Players union', t: 'The league is in a lockout.', x: 'The owners and the players can\'t agree. The gyms are closed.',
    o: [O('Join the bargaining table', { trust: 3, fame: 2 }, 'You sit in on the meetings. It\'s boring and important.', { sub: 'Fight for the players', set: ['lg.lockout', 'union.role'] }),
      O('Play overseas for a month', { cash: 0.2, iq: 1 }, 'A month in a league you\'ve never heard of. Then it ends.', { sub: 'Stay sharp somewhere', set: 'lg.lockout' })] },
  lg_expansion: { at: 'off', req: { seasons: [3, null], team: true }, when: (L) => !recall(L, 'lg.expansion') && L.year % 13 === 5, w: 4, rar: 'rare',
    tag: 'Your phone', t: 'Two expansion teams are coming.', x: 'Each club can protect eight players. You\'re waiting to see the list.',
    o: [O('Call {gm}', { trust: 2 }, 'He says you\'re protected before you finish the question.', { sub: 'Ask straight out', set: 'lg.expansion' }),
      O('Wait for the list', { morale: -2 }, 'You\'re protected. You read it four times anyway.', { sub: 'Keep your cool', set: 'lg.expansion' })] },
  lg_rule_change: { at: 'off', req: { seasons: [2, null] }, when: (L) => !recall(L, 'lg.rule') && L.year % 7 === 2, w: 3, rar: 'uncommon',
    tag: 'League memo', t: 'The league just changed a rule.', x: 'No more hand checking on the perimeter. Officials will call it tight.',
    o: [O('Learn to defend without your hands', { def: 1, iq: 1 }, 'A summer of slides and angles.', { sub: 'Adapt on defense', set: 'lg.rule' }),
      O('Attack it on offense', { fin: 1 }, 'Free throws for everybody. You plan to take most of them.', { sub: 'Use it to score', set: 'lg.rule' })] },
  lg_new_arena: { at: 'off', req: { team: true, seasons: [3, null] }, when: (L) => !recall(L, 'lg.arena') && L.year % 9 === 4, w: 3, rar: 'rare',
    tag: 'The new arena', t: 'The team is building a new arena.', x: 'The club moves downtown next season. Your face is on the construction fence.',
    o: [O('Help design the locker room', { morale: 4 }, 'A barber chair, a cold tub and a lot of space.', { sub: 'Build it right', set: 'lg.arena' }),
      O('Keep something from the old place', { morale: 6 }, 'They give you the scorer\'s table chair. It goes in your garage.', { sub: 'Hold on to history', set: 'lg.arena' })] },
  lg_lottery_show: { at: 'off', req: { team: true }, when: (L) => clubNet(L, L.team) < -4 && L.history.length >= 1 && L.history[L.history.length - 1].seed > 10, w: 3,
    tag: 'Lottery night', t: 'Ping pong balls pick your next teammate.', x: 'Your team has the third-best odds. The lottery show is tonight.',
    o: [O('Watch with the staff', { trust: 3 }, '', { sub: 'Be part of it', do: (L, r) => { if (ok(r, 0.3)) { L.league.net[L.team] = (L.league.net[L.team] || 0) + 1.5; bump(L, { morale: 6 }); return 'Number one. The room erupts. A future star is coming.'; } return 'Fifth. Fine. Somebody good will still be there.'; } }),
      O('Watch from the golf course', { morale: 2 }, 'You find out from forty texts at once.', { sub: 'Out of your hands' })] },
});

storyArcs({
  arc_mentor2_2: { at: 'mid', stage: 'nba', req: { team: true },
    tag: 'Practice', t: '{rookie2} is taking your minutes.', x: (L) => arcData(L, 'mentor2').teach ? 'The things you taught him are working. Against you.' : 'He plays like he has something to prove. To you.',
    o: [O('Keep teaching him', { trust: 6, min: -2 }, 'He thanks you on the broadcast. By name.', { sub: 'Build his future', go: ['mentor2', 'arc_mentor2_3', 'off', 0], do: (L) => { arcData(L, 'mentor2').kind = 'mentor'; } }),
      O('Compete for every minute', { eth: 4, health: -3 }, 'Practices turn into wars. You both get better.', { sub: 'Don\'t go quietly', go: ['mentor2', 'arc_mentor2_3', 'off', 0], do: (L) => { arcData(L, 'mentor2').kind = 'rival'; } })] },
  arc_mentor2_3: { at: 'off', stage: 'nba',
    tag: 'Your phone', t: 'The handoff.', x: '{rookie2} made his first All-Star ballot. He calls you before anyone else.',
    o: [O('Tell him he earned it', { morale: 8 }, 'He says you earned half of it.', { sub: 'Let him have it', end: ['mentor2', 'mentor'], rel: [['rookie2', 25, 'He called you first.']] }),
      O('Tell him you\'re not done yet', { fame: 2, eth: 3 }, 'He laughs. He knows you mean it.', { sub: 'Still got it', end: ['mentor2', 'both'] })] },
  arc_farewell_2: { at: 'mid', stage: 'nba',
    tag: 'Road trip', t: 'The farewell tour.', x: 'Every road arena plays a video. The gifts pile up in the equipment room.',
    o: [O('Stop and thank every crowd', { fame: 5, morale: 8 }, 'A rocking chair, a surfboard, a painting of you as a kid.', { sub: 'Soak it all in', go: ['farewell', 'arc_farewell_3', 'late', 0] }),
      O('Keep your head down and win', { win: 0.4 }, 'You wave once a night. Then you go to work.', { sub: 'One last push', go: ['farewell', 'arc_farewell_3', 'late', 0] })] },
  arc_farewell_3: { at: 'late', stage: 'nba',
    tag: 'Home court', t: 'Your last home game.', x: 'April. Your number is painted on the floor. Your family is in the front row.',
    o: [O('Speak to the crowd', { morale: 10, fame: 4 }, 'Four minutes. You thank the ushers by name.', { sub: 'Say thank you', end: ['farewell', 'speech'], log: 'Played the last home game of a farewell season.' }),
      O('Walk off slowly', { morale: 8 }, 'You touch the floor on the way out. They don\'t stop cheering.', { sub: 'Let the moment speak', end: ['farewell', 'quiet'], log: 'Played the last home game of a farewell season.' })] },
});

/* Arc nodes whose answer is decided by what happened, not by the button: two
   ways to meet it, one result. Declared so the arc tables can name them. */
function shoeLaunch(L, r) {
  const d = arcData(L, 'shoe'); const p = 0.35 + (d.story ? 0.15 : 0) + (d.better ? 0.1 : 0) + (L.m.fame - 60) * 0.01;
  if (ok(r, p)) { arcEnd(L, 'shoe', 'soldout'); L.endorseBonus = (L.endorseBonus || 0) + 4; bump(L, { fame: 5 }); return 'Sold out in nine minutes. The line wraps around the block.'; }
  if (ok(r, 0.5)) { arcEnd(L, 'shoe', 'cult'); L.endorseBonus = (L.endorseBonus || 0) + 1.5; return 'Slow sales at first. Then collectors find it. Now it\'s a cult shoe.'; }
  arcEnd(L, 'shoe', 'flop'); return 'It sits on the shelf. You wear it anyway.'; }
function cursePlay(L) { arcGo(L, 'curse', 'arc_curse_3', 'off', 0); return 'Whatever happens, the city\'s going to say it was the curse.'; }
function curseVerdict(L) { const h = L.history[L.history.length - 1]; if (h && h.po === 'Champion') { arcEnd(L, 'curse', 'broken'); remember(L, 'legend.cursebroken', true); bump(L, { fame: 8, morale: 10 }); return 'They rename a street after you. The curse is over.'; } arcEnd(L, 'curse', 'held'); bump(L, { morale: -3 }); return 'The curse wins this one. The city says next year.'; }

// ── the legend layer (NARRATIVE.md 7.12) ──

/* A SPORTS MOVIE, NOT A FANTASY NOVEL. Rare, a little heightened, every person
   in it invented, and all of it gone when the legend switch is off. */
story({
  lg_ellis_summer: { at: 'hs_sum col_off', legend: true, w: 3, rar: 'rare',
    tag: 'The park', t: 'An old man at the park.', x: '{ellis}. Nobody knows how old he is. He watches you for an hour, then says one word: "Again."',
    o: [O('Run it again', { iq: 2, fin: 2 }, 'He teaches you a move that\'s on no tape. A hesitation that shouldn\'t work.', { sub: 'Do what he says', set: 'legend.ellis', start: ['ellis', 'arc_ellis_2', 'late', 3] }),
      O('Ask who he is', { morale: 2 }, 'He laughs and walks off. The next day he\'s back on the same bench.', { sub: 'Find out more', set: 'legend.ellis', start: ['ellis', 'arc_ellis_2', 'late', 3, { asked: 1 }] })] },
  lg_lucky: { at: 'early mid', legend: true, req: { team: true }, w: 2, rar: 'rare',
    tag: 'The locker room', t: 'A lucky pair of socks.', x: 'You wore them in the best game of your life. You\'ve worn them every game since.',
    o: [O('Believe in them', { morale: 6 }, 'You win nine straight. You don\'t wash them. The training room is concerned.', { sub: 'Trust the magic', set: 'legend.lucky', start: ['lucky', 'arc_lucky_2', 'late', 0, { faith: 1 }] }),
      O('Laugh at yourself', { morale: 2 }, 'You wear them anyway. Just in case.', { sub: 'They\'re just socks', set: 'legend.lucky', start: ['lucky', 'arc_lucky_2', 'late', 0] })] },
  lg_curse: { at: 'pre', legend: true, req: { team: true, seasons: [3, null] }, when: (L) => clubNet(L, L.team) > 1 && !L.history.some((h) => h.t === L.team && (h.aw || []).indexOf('champ') >= 0), w: 2, rar: 'rare',
    tag: 'Sports radio', t: 'Is the team really cursed?', x: (L) => 'The city believes the ' + nick(L.team) + ' are cursed. An old radio host blames a traded goat.',
    o: [O('Say curses aren\'t real', { trust: 2 }, 'The city laughs. Nervously.', { sub: 'Stay rational', set: 'legend.curse', start: ['curse', 'arc_curse_2', 'late', 0] }),
      O('Visit the old radio host', { fame: 3 }, 'He gives you a list of rituals. You do two of them.', { sub: 'Respect the curse', set: 'legend.curse', start: ['curse', 'arc_curse_2', 'late', 0, { ritual: 1 }] })] },
  lg_cult_movie: { at: 'off', legend: true, req: { mem: ['ent.movie'] }, w: 4, rar: 'uncommon',
    tag: 'Midnight screening', t: 'Your movie is a cult classic.', x: 'The bad comedy with your two lines. College kids quote it at midnight screenings.',
    o: [O('Show up at a screening', { fame: 6, morale: 6 }, 'You do your line live. The theater shakes.', { sub: 'Lean into it', set: 'legend.cult' }),
      O('Pretend it never happened', { morale: 2 }, 'It keeps happening without you.', { sub: 'Keep your dignity', set: 'legend.cult' })] },
  lg_dre9: { at: 'off', legend: true, req: { rival: true, seasons: [4, null] }, when: (L) => !!L.rival && L.rival.name === CAST.dre, w: 4, rar: 'rare',
    tag: 'Home', t: 'An old team photo turns up.', x: 'Your mom finds a photo of you at nine, third row. The kid next to you is {dre}.',
    o: [O('Send it to him', { morale: 8 }, 'He calls at midnight. Neither of you remembered. Neither of you can stop laughing.', { sub: 'Share the moment', set: 'legend.dre9', rel: [['dre', 25, 'You found the team photo from when you were nine.']] }),
      O('Save it for the speech', { morale: 4 }, 'You put it in a drawer marked "someday."', { sub: 'Someday it\'ll matter', set: 'legend.dre9' })] },
  lg_lazlo: { at: 'off', legend: true, req: { team: true, seasons: [3, null] }, w: 2, rar: 'rare',
    tag: 'Press conference', t: 'A billionaire just bought the team.', x: (L) => '{lazlo} now owns the ' + nick(L.team) + '. He wore a cape to his first press conference.',
    o: [O('Take his call', { fame: 2 }, 'He wants you in the new uniform he designed. It has tassels.', { sub: 'Meet the new boss', set: 'legend.lazlo', start: ['lazlo', 'arc_lazlo_2', 'mid', 1, { met: 1 }] }),
      O('Let {agent:first} take it', { trust: 1 }, 'He sends a gift basket shaped like you.', { sub: 'Keep your distance', set: 'legend.lazlo', start: ['lazlo', 'arc_lazlo_2', 'mid', 1] })] },
  lg_midnight: { at: 'off', legend: true, req: { seasons: [1, null] }, w: 2, rar: 'rare',
    tag: 'The park', t: 'A pickup game at midnight.', x: 'You can\'t sleep. There\'s a game under the lights at the park near the hotel.',
    o: [O('Play in a hoodie', { morale: 8, fame: 5 }, 'Nobody recognizes you for six games. Then somebody films it.', { sub: 'Just hoop', set: 'legend.midnight' }),
      O('Just watch', { morale: 4 }, 'An old man on the bench says you look like a pro. You say thanks.', { sub: 'Enjoy the game', set: 'legend.midnight' })] },
  lg_mascot: { at: 'mid', legend: true, req: { team: true }, w: 2, rar: 'rare',
    tag: 'Road game', t: 'The mascot started it.', x: '{mascot}, the other team\'s mascot, mocks your free throw routine. Every single time.',
    o: [O('Mock him back', { fame: 4 }, 'You do his dance after a three. The crowd adores it.', { sub: 'Game on', set: 'legend.mascot', start: ['mascot', 'arc_mascot_2', 'off', 1, { war: 1 }] }),
      O('Give him a high five', { morale: 4 }, 'He freezes. Then he hugs you. A legend begins.', { sub: 'Kill him with kindness', set: 'legend.mascot', start: ['mascot', 'arc_mascot_2', 'off', 1] })] },
  lg_apex: { at: 'off', legend: true, req: { ovr: [76, null], seasons: [3, null], age: [25, 32] }, w: 5, rar: 'rare',
    tag: 'Agent\'s office', t: 'A rival league is offering double.', x: 'The Apex League. New teams, new money, one season. They want a face.',
    o: [O('Jump for a season', { cash: 6, fame: 6, trust: -20 }, 'You sign. The league office is furious. Your phone is on fire.', { sub: 'Take the money and run', set: 'legend.apex', start: ['apex', 'arc_apex_2', 'early', 1] }),
      O('Stay in the NBA', { trust: 8, morale: 2 }, 'You say no on a podcast. The number leaks anyway.', { sub: 'Loyal to the league' })] },
  lg_dream: { at: 'off', legend: true, when: (L) => { const h = L.history[L.history.length - 1]; return !!h && h.y === L.year && /R2|CF|Finals/.test(h.po || ''); }, w: 8, rar: 'rare',
    tag: 'Your bedroom', t: 'The same dream, every night.', x: 'Ever since the loss. The same shot. The same rim.',
    o: [O('In the dream, shoot it again', { morale: 6 }, 'It goes in. You wake up smiling. You\'re in the gym by five.', { sub: 'Take the shot', set: 'legend.dream' }),
      O('In the dream, pass it', { iq: 2, morale: 4 }, 'Your teammate hits it. You wake up and call him.', { sub: 'Trust your guy', set: 'legend.dream' })] },
  lg_fortune: { at: 'early', legend: true, req: { seasons: [0, 2], team: true }, w: 2, rar: 'rare',
    tag: 'New Orleans', t: 'A fortune teller on a road trip.', x: 'A storefront near the hotel in New Orleans. She reads your palm and says one number.',
    o: [O('Ask what it means', { morale: 3 }, '"You\'ll know." You don\'t know. Yet.', { sub: 'Know your fate', set: 'legend.fortune' }),
      O('Laugh and leave a tip', { morale: 2 }, 'She calls after you: "Wear it."', { sub: 'Shrug it off', set: 'legend.fortune' })] },
  lg_mask: { at: 'off', legend: true, req: { seasons: [2, null], fame: [40, null] }, w: 2, rar: 'rare',
    tag: 'Streetball tour', t: 'A streetball tour, in a mask?', x: 'A summer tour of city parks. A masked player nobody can identify. It could be you.',
    o: [O('Put on the mask', { fame: 6, morale: 8, health: -3 }, 'Twelve cities. The internet has theories. None of them are you. Until one is.', { sub: 'Play for the love', set: 'legend.mask' }),
      O('Leave it to somebody else', { health: 3 }, 'You watch the clips. You\'re pretty sure you know who it is.', { sub: 'Rest your legs' })] },
  lg_comet: { at: 'pre', legend: true, req: { seasons: [2, null], team: true }, w: 1, rar: 'rare',
    tag: 'Training camp', t: 'Everything you throw up goes in.', x: 'You haven\'t missed in four days. The coaches stop counting.',
    o: [O('Ride it', { sho: 4, fin: 2, fame: 4 }, 'A season where the rim looks as wide as an ocean.', { sub: 'Shoot without fear', set: 'legend.comet', start: ['comet', 'arc_comet_2', 'off', 0, { loud: 1 }] }),
      O('Don\'t talk about it', { sho: 3, fin: 2 }, 'You tell nobody. You keep shooting.', { sub: 'Don\'t jinx it', set: 'legend.comet', start: ['comet', 'arc_comet_2', 'off', 0] })] },
  lg_ghost: { at: 'mid', legend: true, req: { age: [33, null], team: true }, w: 2, rar: 'rare',
    tag: 'Home court', t: 'A stranger in your old jersey.', x: 'Every home game for ten years. Same seat, same faded jersey, your rookie number. Nobody knows his name.',
    o: [O('Send him a signed ball', { morale: 6 }, 'He\'s gone before the usher gets there. The seat is empty.', { sub: 'A quiet thank you', set: 'legend.ghost' }),
      O('Find him after the game', { morale: 4 }, 'He shakes your hand: "Thank you for all of it." Then he\'s gone.', { sub: 'Meet him face to face', set: 'legend.ghost' })] },
  lg_exhibition: { at: 'off', legend: true, req: { age: [30, null], stars: [1, null] }, w: 6, rar: 'rare',
    tag: 'TV special', t: 'A game against the legends.', x: 'A TV network invents a one-night game. Today\'s stars against a team of old greats.',
    o: [O('Play it like Game 7', { fame: 6, health: -4 }, 'You win by one. The old guys argue about the last call for a year.', { sub: 'Show them respect', set: 'legend.exhibition' }),
      O('Enjoy the night', { morale: 8 }, 'You trade stories on the bench. You lose. You don\'t care.', { sub: 'Soak it up', set: 'legend.exhibition' })] },
  lg_four_point: { at: 'off', legend: true, req: { seasons: [3, null] }, when: (L) => L.rt.sho >= 70 && !recall(L, 'legend.four'), w: 2, rar: 'rare',
    tag: 'League memo', t: 'The league tries a four-point line.', x: 'Thirty-two feet out. One season, as an experiment.',
    o: [O('Practice it all summer', { sho: 2, fame: 4 }, 'You hit nine in the first month. They extend the experiment.', { sub: 'Own the new line', set: 'legend.four' }),
      O('Ignore it', { iq: 1 }, 'You keep taking good shots. Others don\'t.', { sub: 'Stick to good shots', set: 'legend.four' })] },
  lg_relocation: { at: 'off', legend: true, req: { team: true, seasons: [5, null] }, when: (L) => clubNet(L, L.team) < -3, w: 2, rar: 'rare',
    tag: 'Downtown', t: 'They might move the team.', x: '{lazlo} has a stadium plan in another city. The fans are marching downtown.',
    o: [O('March with them', { fame: 6, morale: 6, trust: -4 }, 'Ten thousand people, and you at the front. The plan dies in a month.', { sub: 'Stand with the city', set: 'legend.relocation' }),
      O('Stay out of it', { trust: 2 }, 'The plan dies anyway. Some fans remember you stayed quiet.', { sub: 'Not your fight', set: 'legend.relocation' })] },
});

storyArcs({
  arc_ellis_2: { at: 'late', stage: 'nba', legend: true, req: { team: true },
    tag: 'Courtside', t: '{ellis} is in the building.', x: (L) => arcData(L, 'ellis').asked ? 'Courtside, in a tracksuit, years after the park. You never learned who he is. It\'s the night before the playoffs.' : 'Courtside, in a tracksuit, years after the park. You still use the move he taught you. It\'s the night before the playoffs.',
    o: [O('Use his move tonight', { fin: 2, fame: 3 }, 'The hesitation. It works. He nods once and leaves at halftime.', { sub: 'Show him you listened', end: ['ellis', 'move'] }),
      O('Go say hello', { morale: 8 }, 'He says, "Again." You laugh until your teammates stare.', { sub: 'Pay your respects', end: ['ellis', 'hello'] })] },
  arc_lucky_2: { at: 'late', stage: 'nba', legend: true,
    tag: 'The laundry room', t: 'Your lucky socks are ruined.', x: (L) => arcData(L, 'lucky').faith ? 'The night before the playoffs, the laundry service washed them. They shrank. You believed in those socks.' : 'The night before the playoffs, the laundry service washed them. They shrank. You always said they were just socks.',
    o: [O('Find another pair, fast', { morale: -4 }, 'You make the equipment manager drive to three stores.', { sub: 'Don\'t risk the streak', end: ['lucky', 'lost'] }),
      O('Decide it was always you', { morale: 6, iq: 1 }, 'You play in new socks. You play great.', { sub: 'Believe in yourself', end: ['lucky', 'you'] })] },
  arc_curse_2: { at: 'late', stage: 'nba', legend: true,
    tag: 'Playoff week', t: 'The playoffs, and the curse.', x: (L) => (arcData(L, 'curse').ritual ? 'You did the rituals. ' : '') + 'The whole city is holding its breath.',
    o: [O('Just play', {}, '', { sub: 'Ignore the noise', do: cursePlay }),
      O('Wear the old jersey to warmups', { fame: 2 }, '', { sub: 'Honor the history', do: cursePlay })] },
  arc_curse_3: { at: 'off', stage: 'nba', legend: true,
    tag: 'Sports radio', t: 'The curse, one more summer.', x: (L) => { const h = L.history[L.history.length - 1]; return h && h.po === 'Champion' ? 'You won it. The radio host cries on air.' : 'Not this year. The radio host has a new theory.'; },
    o: [O('Read what the city says', {}, '', { sub: 'Take it all in', do: curseVerdict }),
      O('Turn off the radio', { morale: 1 }, '', { sub: 'Tune it out', do: curseVerdict })] },
  arc_lazlo_2: { at: 'mid', stage: 'nba', legend: true, req: { team: true },
    tag: 'Owner\'s suite', t: '{lazlo} has a demand.', x: (L) => arcData(L, 'lazlo').met ? 'He thinks you\'re friends now. He wants you to sing the anthem at the rivalry game. It\'s not in your contract.' : 'You\'ve never met him. He wants you to sing the anthem at the rivalry game. It\'s not in your contract.',
    o: [O('Sing it', { fame: 6, morale: 4 }, 'You\'re not good. The building sings with you. It\'s beautiful.', { sub: 'Humor the boss', end: ['lazlo', 'sang'], rel: [['lazlo', 25, 'You sang the anthem.']] }),
      O('Politely refuse', { trust: 3 }, 'He sends a gold-plated basketball and a note: "Next time."', { sub: 'Know your limits', end: ['lazlo', 'refused'], rel: [['lazlo', -10]] })] },
  arc_mascot_2: { at: 'off', stage: 'nba', legend: true,
    tag: 'Fan mail', t: '{mascot} wrote you a letter.', x: (L) => arcData(L, 'mascot').war ? 'He says the feud was the best year of his life. He wants a rematch.' : 'He says you were the only player who ever high fived him.',
    o: [O('Make peace on camera', { fame: 4, morale: 6 }, 'A truce at midcourt. He gives you his tail. You keep it forever.', { sub: 'End it nicely', end: ['mascot', 'friends'] }),
      O('Give him the rematch', { fame: 5 }, 'The dance-off goes viral. You lose. On purpose.', { sub: 'One more round', end: ['mascot', 'rivals'] })] },
  arc_apex_2: { at: 'early', stage: 'nba', legend: true, req: { team: true },
    tag: 'Road arenas', t: 'Back in the NBA.', x: 'The Apex League folded after one season. Every arena boos you this December.',
    o: [O('Win them back slowly', { trust: 6, eth: 4 }, 'By March, they mostly stop.', { sub: 'Earn it back', end: ['apex', 'won'] }),
      O('Embrace the villain role', { fame: 6, morale: 2 }, 'You cup your ear in every road building. It becomes your thing.', { sub: 'Lean into the boos', end: ['apex', 'villain'] })] },
  arc_comet_2: { at: 'off', stage: 'nba', legend: true,
    tag: 'The gym', t: 'The hot streak is over.', x: (L) => arcData(L, 'comet').loud ? 'The summer after the season where nothing missed. Everybody saw it, so everybody asks where it went. Your shot feels normal again.' : 'The summer after the season where nothing missed. You never said a word about it. Your shot feels normal again.',
    o: [O('Chase it back', { sho: -2, eth: 4 }, 'It never fully comes back. Chasing it makes you better anyway.', { sub: 'Never settle', end: ['comet', 'chased'] }),
      O('Be grateful for it', { sho: -2, morale: 6 }, 'One season like that is more than most players ever get.', { sub: 'Cherish what happened', end: ['comet', 'grateful'] })] },
});

/* WILD PATHS. Asked for by the owner: decisions with a little chaos in them,
   good and bad, starting from a bookie asking whether to bet your under.
   Every person in them is invented. Each is dealt once a career, rare enough
   to land as a story somebody tells rather than as a weekly event.
   THE BET CAN END A CAREER, and that is the one place a card does: a ban is
   flagged in the summer (L.flags.banned) and newYear retires the career
   before the next camp. A banned career files no Hall tier, keeps its numbers,
   and is offered only the lives after basketball a banned player could have. */
const BAN_PATHS = { business: 1, actor: 1, podcast: 1, family: 1 };
function banIt(L) {
  L.flags.banned = L.year;
  remember(L, 'bet.banned', true);
  bump(L, { fame: -12, trust: -30, morale: -10 });
  logIt(L, 'Banned for life by the league over a bet on your own game.', 'bad');
  /* Every brand walks the same day (deals.js). */
  for (const x of dealsNow(L)) { x.until = L.year - 1; x.dropped = L.year; }
}
function burgerVerdict(L, r) {
  if (ok(r, 0.5)) { arcEnd(L, 'burger', 'won'); bump(L, { cash: 7, fame: 3 }); return 'A national chain buys you out for triple. Your mom gets a lifetime card.'; }
  arcEnd(L, 'burger', 'lost'); bump(L, { cash: 0.5, fame: -2, morale: -3 });
  return 'A health inspector, a viral video, forty closed doors. You lose most of it.';
}
function soccerVerdict(L, r) {
  if (ok(r, 0.45)) { arcEnd(L, 'soccer', 'won'); bump(L, { cash: 3, fame: 6, morale: 8 }); return 'They score in the ninetieth minute. You cry into a scarf.'; }
  arcEnd(L, 'soccer', 'lost'); bump(L, { morale: 3 });
  return 'A late goal goes the wrong way. The pub sings your name anyway.';
}
story({
  wp_bet: { at: 'early mid', req: { team: true, seasons: [1, null] }, w: 0.22, rar: 'rare',
    tag: 'Your phone', t: '{bookie:first} wants to know about tonight', x: '{bookie} is a friend of {friend:first}\'s. He texts at noon: should he bet your under tonight?',
    o: [O('Tell him yes', { cash: 0.25 }, 'You score six. Somebody across town buys a boat.', { sub: 'Easy money', set: 'bet.yes',
      start: ['bet', 'arc_bet_2', 'off', 0], rel: [['bookie', 15, 'You told him to bet your under.']] }),
      O('Tell him to lose your number', { morale: 1 }, 'You block him. You sleep fine.', { sub: 'Not a chance', rel: [['bookie', -15, 'You told him to lose your number.']] }),
      O('Call league security', { trust: 4, fame: 2 }, '{bookie:first} is arrested in March. {commish} thanks you by name.', { sub: 'Report it', set: 'bet.reported',
        rel: [['bookie', -40, 'You reported him.'], ['friend', -10, 'You reported his guy.']] })] },
  wp_burger: { at: 'off', req: { seasons: [2, null], fame: [30, null] }, when: (L) => L.cash >= 4, w: 2.2, rar: 'uncommon',
    tag: 'Your agent', t: 'A burger chain wants your name on a sandwich', x: 'Triple patty, hot honey, your number on the box. Or you could buy in.',
    o: [O('Eat one on camera', { fame: 4, cash: 0.4, health: -2 }, 'You eat two. The clip outdraws your best game.', { sub: 'Be the face' }),
      O('Buy forty locations', { cash: -3 }, 'You own forty restaurants now. Your mom wants a tour.', { sub: 'Own the whole chain', set: 'biz.burger', start: ['burger', 'arc_burger_2', 'off', 1] }),
      O('Pass', { health: 1 }, 'You stay on the meal plan. {trainer:first} is proud of you.', { sub: 'Stay lean' })] },
  wp_soccer: { at: 'off', req: { seasons: [3, null] }, when: (L) => L.cash >= 8, w: 1.6, rar: 'rare',
    tag: 'An English pub', t: 'A fourth division soccer club is for sale', x: 'Three thousand seats, a leaky roof, a hundred years of losing. The fans already love you.',
    o: [O('Buy it', { cash: -5, fame: 3 }, 'You own a soccer club. You still don\'t understand offside.', { sub: 'Why not', set: 'biz.soccer', start: ['soccer', 'arc_soccer_2', 'off', 1] }),
      O('Send a signed jersey instead', { morale: 2 }, 'They hang it in the pub, next to the dartboard.', { sub: 'Support from afar' })] },
  wp_coin: { at: 'off', req: { seasons: [1, null] }, w: 0.9, rar: 'uncommon',
    tag: 'A Miami yacht', t: 'A coin with your face on it', x: 'A man in sunglasses wants to launch a coin. Your face, your name, his math.',
    o: [O('Launch it', null, '', { sub: 'To the moon', set: 'biz.coin', p: 0.3,
      fx: { cash: 5, fame: 3 }, s: 'It moons. You sell at the top, mostly by accident.',
      no: { fx: { cash: -2, fame: -4, trust: -3 }, s: 'It goes to zero in nine days. Fans want refunds.' } }),
      O('Ask how it works', { morale: 1 }, 'He can\'t explain it. The coin launches without you and dies.', { sub: 'Read the fine print' }),
      O('Report him', { trust: 2, fame: 1 }, 'He is indicted by spring. You were right.', { sub: 'Smell a scam' })] },
  wp_rocket: { at: 'off', req: { seasons: [3, null], fame: [50, null] }, w: 1.6, rar: 'rare',
    tag: 'The launch pad', t: 'A billionaire has one seat left on his rocket', x: 'Eleven minutes at the edge of space, one week before camp. {trainer:first} has opinions.',
    o: [O('Go to space', { fame: 8, morale: 6, health: -2 }, 'You spin a ball in zero gravity. Four hundred million views.', { sub: 'Once in a lifetime', set: 'fun.space' }),
      O('Stay on the ground', { health: 2 }, 'You watch the launch from the gym. Somebody else dunks in space.', { sub: 'Protect the legs' })] },
  wp_album: { at: 'off', req: { seasons: [1, null] }, w: 0.9, rar: 'uncommon',
    tag: 'Midnight studio', t: 'A producer wants to make your rap album', x: 'Twelve tracks, two features, a cover shot at the free throw line.',
    o: [O('Drop the album', null, '', { sub: 'Go all in', set: 'fun.album', p: (L) => 0.25 + L.m.fame / 200,
      fx: { fame: 6, cash: 1 }, s: 'It goes gold. Your teammates know every word.',
      no: { fx: { fame: 2, morale: -4 }, s: 'Critics destroy it. The locker room plays it ironically. Constantly.' } }),
      O('Make one song for your mom', { morale: 4 }, 'She plays it at every family dinner. Twice.', { sub: 'Keep it small' }),
      O('Stick to basketball', { morale: 1 }, 'The producer finds a quarterback instead.', { sub: 'Not your lane' })] },
  wp_wrestle: { at: 'off', req: { seasons: [2, null], fame: [35, null] }, w: 1.6, rar: 'rare',
    tag: 'Pro wrestling', t: 'A wrestling show wants you in the ring', x: 'One night, sixty thousand fans. The script has you hitting a man with a folding chair.',
    o: [O('Take the chair shot', { fame: 7, health: -3 }, 'The building loses its mind. Your knee files a complaint.', { sub: 'Commit to the bit', set: 'fun.wrestle' }),
      O('Sit ringside', { fame: 3, morale: 3 }, 'A wrestler throws water on you. Best night of your summer.', { sub: 'Watch up close' }),
      O('Say no', { trust: 2 }, '{gm} sends a thank you text. Nothing else.', { sub: 'Protect the body' })] },
  wp_burner: { at: 'mid', req: { seasons: [2, null], fame: [30, null] }, w: 0.6, rar: 'uncommon',
    tag: 'The internet', t: 'Somebody found your burner account', x: 'An account with nine followers has defended you four hundred times. The internet thinks it\'s you.',
    o: [O('Deny everything', null, '', { sub: 'Not me', p: 0.5,
      fx: { fame: 1 }, s: 'The story dies by Friday. You log off. For now.',
      no: { fx: { fame: -3, trust: -2 }, s: 'It posts again during your press conference.' } }),
      O('Own it', { fame: 4, morale: 2 }, 'You change the bio to "yes, it\'s me." Ten million followers by dinner.', { sub: 'Lean in' }),
      O('Delete it', { morale: -1 }, 'It disappears. The screenshots don\'t.', { sub: 'Make it go away' })] },
});
storyArcs({
  arc_bet_2: { at: 'off', stage: 'nba',
    tag: 'Your front door', t: 'Two men in suits. FBI.', x: 'Seven in the morning. They have your texts with {bookie:first}. They want to talk.',
    o: [O('Lawyer up and say nothing', null, '', { sub: 'Fight it', p: 0.5,
      fx: { fame: -4, trust: -6 }, s: 'The case stalls on a technicality. You keep your job. Barely.', end: ['bet', 'escaped'],
      no: { s: 'The texts are enough. {commish} bans you for life.', end: ['bet', 'banned'], do: (L) => { banIt(L); } } }),
      O('Tell them everything', null, '', { sub: 'Cooperate', p: 0.7,
        fx: { fame: -8, trust: -10, cash: -1 }, s: 'A long suspension and a fine. Your career survives.', end: ['bet', 'suspended'],
        no: { s: 'They believe you. {commish} bans you for life anyway.', end: ['bet', 'banned'], do: (L) => { banIt(L); } } })] },
  arc_burger_2: { at: 'off', stage: 'nba',
    tag: 'The board meeting', t: 'The burger chain, a year later', x: 'Forty locations, one year in. {agent:first} has the numbers in a folder.',
    o: [O('Open the folder', null, '', { sub: 'Face the numbers', do: burgerVerdict }),
      O('Let {agent:first} read it out', null, '', { sub: 'Brace yourself', do: burgerVerdict })] },
  arc_soccer_2: { at: 'off', stage: 'nba',
    tag: 'Matchday', t: 'Your soccer club\'s biggest day', x: 'Last game of the season. Win, and they go up a division.',
    o: [O('Fly over and watch', { morale: 2 }, '', { sub: 'Be in the stands', do: soccerVerdict }),
      O('Watch on your phone', null, '', { sub: 'Hide in the locker room', do: soccerVerdict })] },
});

/* APRIL, SEPTEMBER AND THE SUMMER. A sweep of sixty careers found the same
   four cards winning every April (the playoff assignment, the exit interview,
   a hamstring, a guarantee), because almost nothing else could be dealt
   between the last regular season game and the first playoff game, and every
   September offered nothing but the training card and the goal. These are
   the moments those weeks actually hold, each read off where the season
   stands, and each dealt once a career. */
const inPO = (L) => !!(L.season && L.season.po && !L.season.po.out);
const missedPO = (L) => !!(L.season && L.season.po && L.season.po.out && !(L.season.po.results || []).length);
const firstPO = (L) => inPO(L) && !L.history.some((h) => h.po && h.po !== 'Missed' && h.po !== 'Play-in');
const newHere = (L) => { const h = lastH(L); return !!(h && L.team && h.t !== L.team); };
story({
  apr_top_seed: { at: 'late', req: { team: true }, when: (L) => inPO(L) && L.season.seed === 1, w: 3,
    tag: 'Practice', t: 'Top seed. Home court all the way.', x: '{gm} says every home game sold out in under an hour.',
    o: [O('Tell the city to get loud', { fame: 3, morale: 3 }, 'The clip runs all week. Nobody sits down in Game 1.', { sub: 'Rally the fans' }),
      O('Say nothing about it', { trust: 3 }, '{beat} calls you boring. You\'re fine with boring.', { sub: 'Stay humble' })] },
  apr_underdog: { at: 'late', req: { team: true }, when: (L) => inPO(L) && L.season.seed >= 6, w: 3,
    tag: 'The locker room', t: 'Nobody\'s picking you.', x: 'Every panel on TV has you out in five. {tm} printed the predictions and taped them up.',
    o: [O('Leave them on the wall', { morale: 5, win: 0.2 }, 'You walk past them twice a day. So does everybody.', { sub: 'Use it as fuel' }),
      O('Tear them down', { trust: 2 }, '"Worry about us," you say. The room nods.', { sub: 'Focus on yourselves' })] },
  apr_playin: { at: 'late', req: { team: true }, when: (L) => inPO(L) && L.season.seed >= 7, w: 3,
    tag: 'The locker room', t: 'One game to get in.', x: 'The play-in is Tuesday. Lose and the season ends that night.',
    o: [O('Treat it like Game 7', { win: 0.2, health: -2 }, 'You sleep badly and play well. Mostly.', { sub: 'All in' }),
      O('Keep it loose', { morale: 4 }, 'Music on in the locker room. Nobody looks tight.', { sub: 'Stay relaxed' })] },
  apr_first_po: { at: 'late', req: { team: true }, when: (L) => firstPO(L), w: 4, rar: 'common',
    tag: 'Practice', t: 'Your first playoffs.', x: '{tvet} has played forty playoff games. He pulls you aside after practice.',
    o: [O('Ask him what changes', { iq: 1, trust: 2 }, '"Everything slows down," he says. "Then it speeds up."', { sub: 'Learn from him', rel: [['tvet', 10, 'He walked you through your first playoffs.']] }),
      O('Tell him you\'re ready', { fame: 1, morale: 2 }, 'He laughs. You\'ll find out Saturday.', { sub: 'Trust yourself' })] },
  apr_rematch: { at: 'late', req: { team: true }, when: (L) => { const h = lastH(L); return inPO(L) && !!h && h.t === L.team && h.po && ['R1', 'R2', 'CF', 'Finals'].indexOf(h.po) >= 0; }, w: 2,
    tag: 'Your phone', t: 'Last year still stings.', x: 'You kept the elimination game on your phone. You haven\'t watched it.',
    o: [O('Watch it tonight', { def: 1, morale: -2 }, 'Every mistake, twice. You\'re angry in a useful way.', { sub: 'Use the pain' }),
      O('Delete it', { morale: 4 }, 'New year. New bracket.', { sub: 'Fresh start' })] },
  apr_tickets: { at: 'late', req: { team: true }, when: (L) => inPO(L), w: 2,
    tag: 'Your phone', t: 'Everybody wants playoff tickets.', x: 'Forty texts from people you haven\'t heard from since high school.',
    o: [O('Buy them a whole section', { cash: -0.05, morale: 3 }, 'Two hundred seats in your colors. {mom} runs the group chat.', { sub: 'Share the moment' }),
      O('Turn your phone off', { health: 2, morale: 1 }, 'Silence. You sleep nine hours.', { sub: 'Protect your focus' })] },
  apr_speech: { at: 'late', req: { team: true, yearsHere: [2, null] }, when: (L) => inPO(L) && L.m.trust >= 50, w: 2,
    tag: 'The locker room', t: 'Will you talk before Game 1?', x: '{tm} asks you to say something to the team. It\'s the first time anybody has asked.',
    o: [O('Keep it to twelve words', { trust: 3, win: 0.2 }, 'The room is up before you finish.', { sub: 'Short and sharp', rel: [['tm', 8]] }),
      O('Let your play talk', { morale: 1 }, 'You nod at him. He gets it.', { sub: 'Lead by example' })] },
  apr_family: { at: 'late', req: { team: true }, when: (L) => inPO(L), w: 1.5,
    tag: 'Your phone', t: 'Your family\'s coming to Game 1.', x: '{mom} already booked the flight. Nobody asked you.',
    o: [O('Get them good seats', { morale: 4 }, 'Front row. She made a sign. It\'s enormous.', { sub: 'The more the merrier', rel: [['mom', 8]] }),
      O('Ask them to watch at home', { health: 1 }, 'She watches with the sound all the way up.', { sub: 'You need your focus', rel: [['mom', -4]] })] },
  apr_contract: { at: 'late', req: { team: true }, when: (L) => inPO(L) && !!L.contract && L.contract.years === 1 && L.contract.kind !== 'rookie', w: 2,
    tag: 'Agent\'s office', t: 'Your contract runs out in June.', x: '{agent} says every playoff game is worth money now.',
    o: [O('Block it out', { trust: 2 }, 'Basketball now. Money in July.', { sub: 'Basketball first' }),
      O('Go over the numbers', { morale: -2, fame: 1 }, 'He walks you through it. You sleep worse.', { sub: 'Know what\'s at stake' })] },
  apr_rest_up: { at: 'late', req: { team: true }, when: (L) => inPO(L) && L.season.seed <= 6 && L.m.health < 70, w: 3,
    tag: 'Training staff', t: 'Rest all the way to Game 1?', x: '{gm} wants you off the court until Saturday. No practice at all.',
    o: [O('Take the days off', { health: 10 }, 'Three days in the cold tub. You feel brand new.', { sub: 'Get your legs back' }),
      O('Practice anyway', { health: -4, eth: 2, trust: -2 }, 'You shoot alone at night. Nothing happens. This time.', { sub: 'Stay sharp' })] },
  apr_season_over: { at: 'late', req: { team: true }, when: (L) => missedPO(L), w: 3,
    tag: 'The locker room', t: 'The season is over.', x: 'No playoffs. {owner} came down to the locker room after the last game.',
    o: [O('Thank him for coming', { trust: 3 }, 'He asks what you need. You tell him.', { sub: 'Start a conversation' }),
      O('Go sign for the fans', { fame: 3, morale: 2 }, 'You sign until they turn the lights off.', { sub: 'Thank the people' })] },
  apr_lottery: { at: 'late', req: { team: true }, when: (L) => missedPO(L) && L.season.l > L.season.w + 10, w: 2,
    tag: 'Lottery night', t: 'Be the team\'s face at the lottery?', x: 'The draft lottery is next month. {gm} wants you there on TV, for luck.',
    o: [O('Go and wear the suit', { fame: 3 }, 'The camera finds you twice. You look nervous both times.', { sub: 'Be the lucky charm' }),
      O('Watch at home', { morale: 2 }, 'You watch with {mom}. She yells at a ping pong ball.', { sub: 'Not your thing' })] },
  apr_last_home: { at: 'late', req: { team: true, age: [33, null] }, w: 3,
    tag: 'Home', t: 'Was that your last home game?', x: 'Nobody said it. The crowd stood for a full minute when you checked out.',
    o: [O('Watch the clip again', { morale: 6 }, 'Twelve times. You don\'t cry until the ninth.', { sub: 'Let yourself feel it' }),
      O('Don\'t think about it', { morale: 2 }, 'You think about it all week anyway.', { sub: 'Not yet' })] },
  apr_awards: { at: 'late', req: { team: true, ovr: [84, null] }, when: (L) => !!L.season && L.season.w > L.season.l, w: 2,
    tag: 'Agent\'s office', t: 'Run an awards campaign?', x: '{agent} wants billboards near the voters and a website. "Everybody does it," he says.',
    o: [O('Run the campaign', { cash: -0.1, fame: 4 }, 'The billboards go up. Some voters roll their eyes.', { sub: 'Make your case' }),
      O('Let the season talk', { trust: 2 }, 'He sighs. Fine.', { sub: 'Stay above it' })] },

  sep_conditioning: { at: 'pre', req: { team: true }, w: 3,
    tag: 'Training camp', t: 'The conditioning test is Monday.', x: 'Seventeen sideline sprints, each under a minute. {trainer} holds the stopwatch.',
    o: [O('Show up in shape', { trust: 3 }, 'You win it. {tm} throws up in a trash can.', { sub: 'Set the tone', p: (L) => clamp(L.eth / 100 + 0.2, 0.3, 0.95), no: { fx: { trust: -3 }, s: 'You finish last. The whole gym hears about it.' } }),
      O('Ask to skip it', { trust: -2, health: 2 }, '{trainer} writes your name down. In red.', { sub: 'Save your legs' })] },
  sep_number: { at: 'pre', req: { team: true }, when: (L) => newHere(L), w: 3,
    tag: 'The equipment room', t: 'Your old number is taken.', x: '{tvet} has worn it here for six years.',
    o: [O('Pick a new number', { morale: 1 }, 'Fresh start, fresh number. The jersey looks right by October.', { sub: 'Start fresh' }),
      O('Offer to buy it', { cash: -0.05, fame: 1 }, 'He takes the money and a watch. Smart man.', { sub: 'Make it worth his while', rel: [['tvet', 6]] }),
      O('Ask him nicely', {}, 'He says no. Nicely.', { sub: 'Worth a shot', rel: [['tvet', 3]] })] },
  sep_new_home: { at: 'pre', req: { team: true }, when: (L) => newHere(L), w: 3,
    tag: 'House hunting', t: 'A loft downtown, or a house by the gym?', x: 'New city, new place to live. Your realtor has two options and wants an answer.',
    o: [O('Take the loft downtown', { fame: 2, morale: 2 }, 'Restaurants downstairs. Fans outside. You learn the side door.', { sub: 'Live in the city' }),
      O('Take the house by the gym', { health: 3, eth: 2 }, 'Quiet. Twelve minutes to practice. You get there first.', { sub: 'All about the work' })] },
  sep_captain: { at: 'pre', req: { team: true, yearsHere: [3, null], age: [25, null] }, when: (L) => L.m.trust >= 55, w: 3,
    tag: 'Training camp', t: 'They want you to be captain.', x: '{gm} says the room voted. It wasn\'t close.',
    o: [O('Accept it', { trust: 4, morale: 3 }, 'The C goes on the jersey. The room listens a little harder.', { sub: 'Lead the room' }),
      O('Hand it to {tvet}', { trust: 2 }, 'He\'s surprised. He won\'t forget it.', { sub: 'Respect your elders', rel: [['tvet', 12, 'You gave him the captaincy.']] })] },
  sep_rookies: { at: 'pre', req: { team: true, seasons: [4, null] }, w: 2,
    tag: 'Team plane', t: 'Do the rookies carry the bags?', x: '{trook} asks you if he really has to.',
    o: [O('Tell him yes', { trust: 1 }, 'He carries them all year. He complains the whole time.', { sub: 'Tradition matters', rel: [['trook', -3]] }),
      O('Carry your own', { morale: 2 }, 'The rookies notice. So does {tvet}.', { sub: 'Lead by example', rel: [['trook', 8]] })] },
  sep_trip: { at: 'pre', req: { team: true }, w: 2,
    tag: 'Preseason tour', t: 'Preseason games overseas.', x: 'Two games abroad. Long flights, packed arenas and a clinic every morning.',
    o: [O('Run the clinics', { fame: 3, health: -2 }, 'Two hundred kids a day. One of them crosses you over.', { sub: 'Grow the game' }),
      O('Sleep on the plane', { health: 3 }, 'You land fresh. Everybody else lands wrecked.', { sub: 'Save your energy' })] },
  sep_rankings: { at: 'pre', req: { team: true, seasons: [1, null] }, w: 2,
    tag: 'Your phone', t: 'The player rankings are out.', x: (L) => 'One outlet ranks you ' + ordinal(clamp(Math.round((97 - ovrOf(L)) * 5), 1, 150)) + ' in the league.',
    o: [O('Screenshot it', { morale: 2, eth: 2 }, 'It\'s your phone wallpaper by lunch.', { sub: 'Fuel for the year' }),
      O('Don\'t look', { morale: 1 }, '{tm} reads it to you anyway.', { sub: 'Ignore the noise' })] },
  sep_holdout: { at: 'pre', req: { team: true, fame: [55, null], ovr: [80, null] }, when: (L) => !!L.contract && L.contract.years >= 2, w: 2,
    tag: 'Agent\'s office', t: 'Hold out of training camp?', x: '{agent} says you\'re underpaid. He wants you to skip the first week of camp.',
    o: [O('Report on time', { trust: 4 }, 'You walk in first. {gm} notices.', { sub: 'Keep your word', rel: [['gm', 6]] }),
      O('Hold out a week', { trust: -8, fame: 3 }, 'A week of headlines. You report anyway. Nothing changes.', { sub: 'Make a point', rel: [['gm', -10, 'You held out of camp.']] })] },
  sep_jersey: { at: 'pre', req: { team: true, fame: [62, null] }, w: 2,
    tag: 'Team store', t: 'Your jersey is a top five seller.', x: 'The team store can\'t keep it on the shelf.',
    o: [O('Sign a hundred for charity', { fame: 2, morale: 3 }, 'They sell out in nine minutes.', { sub: 'Give back' }),
      O('Buy one for {mom}', { morale: 2 }, 'She wears it to church.', { sub: 'Keep it in the family' })] },
  sep_bet: { at: 'pre', req: { team: true }, w: 1.5,
    tag: 'Training camp', t: '{tm} wants a three-point bet.', x: 'Loser buys dinner for the whole team, every week of camp.',
    o: [O('Take the bet', { sho: 1, cash: -0.02 }, 'You win four weeks and lose one. He orders lobster.', { sub: 'Back your shot' }),
      O('Raise the stakes', { morale: 3, cash: -0.05 }, 'Now the whole staff eats too. You lose twice.', { sub: 'Make it hurt', rel: [['tm', 6]] })] },

  jun_parade: { at: 'off', req: { team: true }, when: (L) => !!(L.season && L.season.po && L.season.po.champ), w: 5, rar: 'common',
    tag: 'Parade day', t: 'The championship parade is Monday.', x: 'Two million people downtown. {tm} has the trophy and won\'t give it back.',
    o: [O('Grab the microphone', { fame: 6 }, 'You say four sentences. The city chants them all summer.', { sub: 'Speak for the city' }),
      O('Ride on top of the bus', { morale: 6 }, 'You wave until your arm stops working.', { sub: 'Soak it in' })] },
  jun_finals_loss: { at: 'off', req: { team: true }, when: (L) => { const h = lastH(L); return !!h && h.po === 'Finals'; }, w: 4,
    tag: 'Home', t: 'Watch the other team\'s parade?', x: 'Two wins short. Their parade is on every channel.',
    o: [O('Watch the whole thing', { eth: 4, morale: -2 }, 'Every float. You remember every face.', { sub: 'Remember this feeling' }),
      O('Go somewhere with no TV', { morale: 4, health: 3 }, 'A cabin, a lake and no signal.', { sub: 'Get away from it' })] },
  jun_draft_room: { at: 'off', req: { team: true, yearsHere: [2, null] }, w: 2,
    tag: 'The war room', t: 'The draft is Thursday.', x: '{gm} invites you into the war room.',
    o: [O('Go to the war room', { trust: 3 }, 'You meet the pick first. The kid is shaking.', { sub: 'Have a say' }),
      O('Watch from home', { morale: 2 }, 'You text the kid. He screenshots it.', { sub: 'Not your call' })] },
  jun_recruit: { at: 'off', req: { team: true, fame: [55, null] }, w: 2,
    tag: 'Your phone', t: 'Make the recruiting call?', x: '{gm} wants help landing a free agent. One call from you might decide it. It\'s midnight.',
    o: [O('Make the call', { trust: 4 }, 'He signs on the third day. He says you were the reason.', { sub: 'Close the deal', p: 0.6, no: { fx: { morale: -2 }, s: 'He signs somewhere else. He\'s nice about it.' } }),
      O('Stay out of it', {}, 'The front office handles it. Quietly.', { sub: 'Leave it to them' })] },
  jun_proam: { at: 'off', req: { team: true }, w: 2,
    tag: 'Pro-am league', t: 'A pro-am wants you for one night.', x: 'A hot gym, no air conditioning and a crowd packed along the baseline.',
    o: [O('Go and drop fifty', { fame: 4, health: -3 }, 'Fifty-one. The video has more views than your season.', { sub: 'Put on a show' }),
      O('Pass this year', { health: 2 }, 'They ask again in August.', { sub: 'Rest up' })] },
  jun_trip: { at: 'off', req: { seasons: [1, null] }, w: 2,
    tag: 'Group chat', t: 'Where does the summer go?', x: 'Your group chat has been fighting about it for a week.',
    o: [O('Go to the beach', { morale: 5, health: 2 }, 'Two weeks. You only check trade rumors twice a day.', { sub: 'Recharge' }),
      O('Go back home', { morale: 3 }, '{mom} cooks every night. You gain four pounds.', { sub: 'Family time', rel: [['mom', 6]] }),
      O('Go straight back to the gym', { eth: 3 }, 'The gym\'s empty in June. You like it that way.', { sub: 'No days off' })] },
  jun_hscoach: { at: 'off', req: { seasons: [3, null] }, w: 2,
    tag: 'Your old school', t: '{hscoach} is retiring.', x: 'Thirty years at your old high school. They want you at the dinner.',
    o: [O('Fly in and speak', { morale: 5, fame: 1 }, 'You get through it. Barely. He hugs you for a long time.', { sub: 'Honor him in person', rel: [['hscoach', 15, 'You spoke at his retirement dinner.']] }),
      O('Send a video', { morale: 1 }, 'They play it on a big screen. He watches it twice.', { sub: 'Show up from afar', rel: [['hscoach', 4]] })] },
  jun_scan: { at: 'off', req: { age: [28, null] }, w: 2,
    tag: 'The doctor\'s office', t: 'Dr. {doctor:last} wants a summer scan.', x: 'Knees, back and ankles. A full day in the tube.',
    o: [O('Get it done', { health: 4, cash: -0.02 }, 'Clean. Mostly. You get a list of stretches.', { sub: 'Better safe than sorry' }),
      O('Skip it', { morale: 1 }, 'You feel fine. You hope that\'s the same thing.', { sub: 'Trust your body' })] },
  jun_awards: { at: 'off', req: { team: true }, when: (L) => !!(L.season && L.season.awards.some((a) => a !== 'star' && a !== 'champ')), w: 3,
    tag: 'Awards show', t: 'The awards show is in Los Angeles.', x: 'You\'re on the list. Somebody has to wear a suit.',
    o: [O('Go and dress up', { fame: 4 }, 'The suit trends for a day. Nobody mentions the speech.', { sub: 'Enjoy the night' }),
      O('Watch from the couch', { morale: 2 }, 'You accept on video, in a hoodie.', { sub: 'Keep it casual' })] },
  jun_camp: { at: 'off', req: { seasons: [2, null] }, w: 2,
    tag: 'Youth camp', t: 'Your own youth camp.', x: 'Three hundred kids signed up in a day. They want you there every morning.',
    o: [O('Be there every morning', { fame: 3, morale: 4, health: -2 }, 'Three hundred kids. One of them can really play.', { sub: 'All the way in' }),
      O('Show up on the last day', { fame: 1 }, 'You hand out trophies. They scream anyway.', { sub: 'Save your summer' })] },
  jun_film_crew: { at: 'off', req: { fame: [45, null] }, w: 1.5,
    tag: 'The gym', t: 'Let a trainer film your workouts?', x: 'Five clips a week. His last client went viral twice.',
    o: [O('Let him film', { fame: 4 }, 'The clips do numbers. Other players start asking for him.', { sub: 'Grow your audience' }),
      O('Keep the gym private', { eth: 2 }, 'Nobody sees the work. It shows up in November.', { sub: 'Work in silence' })] },
});

storyFixed({
  lg_one_more_shot: { at: 'post', legend: true,
    tag: 'Charity night', t: 'Fifty years old, one shot at halftime.', x: 'A charity night at your old arena. They hand you a ball at half court.',
    o: [O('Shoot it', {}, '', { sub: 'One more time', do: (L, r) => { remember(L, 'legend.halftime', true); const made = ok(r, 0.22 + (L.rt.sho - 60) * 0.006); if (made) remember(L, 'legend.halftime.made', true); finishLife(L, made ? 'At fifty you hit it from half court. The arena loses its mind.' : 'At fifty you hit the front of the rim. They cheer anyway.'); return made ? 'Nothing but net. At fifty.' : 'Front rim. They cheer anyway.'; } }),
      O('Hand it to a kid courtside', {}, '', { sub: 'Pass it on', do: (L) => { remember(L, 'legend.halftime', true); finishLife(L, 'You handed the ball to a kid at halftime. He made it.'); return 'He makes it. You jump higher than he does.'; } })] },
});

// ── epilogues (NARRATIVE.md 8.4) ──

/* One card each, after the after card. Each answer is the last line of the
   career and finishes it. */
const EP = (t, x, a, b, tag) => ({ at: 'post', tag, t, x, o: [
  O(a[0], a[1] || {}, a[2], { sub: a[4], do: (L) => { finishLife(L, a[3]); return null; } }),
  O(b[0], b[1] || {}, b[2], { sub: b[4], do: (L) => { finishLife(L, b[3]); return null; } })] });
storyFixed({
  ep_head_coach: EP('A head coaching job of your own.', 'Three years as an assistant. Now a team wants you in the big chair.',
    ['Take the rebuilding job', {}, 'Young players and patience. In year four, they make the playoffs.', 'You took a rebuilding team to the playoffs as a head coach.', 'Build something real'],
    ['Take the contender', {}, 'Pressure from day one. You win a title in year two.', 'You won a title as a head coach.', 'Win right away'], 'Head coach'),
  ep_assistant: EP('Start in the film room.', 'You start as the fourth assistant, breaking down tape at two in the morning.',
    ['Stay patient', {}, 'Nine years. Then the front of the bench. Then the big chair.', 'You worked your way from the film room to a head coaching job.', 'Climb the ladder'],
    ['Become the development guy', {}, 'Every young star in the league wants your summer workouts.', 'Every young star in the league calls you in the summer.', 'Shape the next stars'], 'The film room'),
  ep_gm: EP('Run a front office?', 'An ownership group hands you the keys. They want a winner in five years.',
    ['Draft and develop', {}, 'Year five: a sixty-win team, and you drafted every starter.', 'You built a contender through the draft.', 'Grow it from scratch'],
    ['Trade for stars', {}, 'Two blockbusters in one summer. A title the next June.', 'You traded for stars and won a title as a general manager.', 'Go all in'], 'Front office'),
  ep_owner: EP('A seat in the owners\' meeting.', 'You buy a piece of a team. A big enough piece to have a vote.',
    ['Fight for the players', {}, 'The other owners don\'t love you. The players do.', 'The players trusted you as an owner.', 'Remember where you came from'],
    ['Learn the business first', {}, 'Ten quiet years. Then you own the controlling share.', 'You became the first former player to own a controlling share of a team.', 'Play the long game'], 'Owners meeting'),
  ep_broadcast: EP('A seat on the studio desk.', 'A national studio show. A suit, a monitor and three other loud people.',
    ['Be honest', {}, 'Your takes are fair and unpopular. Players text you thanks.', 'You became the honest voice on national television.', 'Tell it straight'],
    ['Be loud', { fame: 4 }, 'Ratings go up. {critic} calls you his rival.', 'You became the loudest voice in basketball television.', 'Chase the ratings'], 'TV studio'),
  ep_league: EP('A job at the league office.', 'Rules, schedules and the players\' side of every table.',
    ['Fix the schedule', {}, 'Fewer back-to-backs. Every trainer sends you flowers.', 'You fixed the schedule at the league office.', 'Save the players\' legs'],
    ['Run for union president', {}, 'You win in a landslide. Two labor deals and no lockouts.', 'You led the players\' union through two labor deals.', 'Lead the players'], 'League office'),
  ep_college: EP('Your old school is calling.', '{school} needs a head coach. The students already have the signs.',
    ['Take the job', {}, 'You sleep in the office the first year. By year three, March is yours again.', 'You came back to coach your old school.', 'Go back home'],
    ['Take it and recruit the neighborhood', {}, 'Every kid from home wants to play for you.', 'You coached your old school with a roster from your old neighborhood.', 'Bring your people with you'], 'Your old school'),
  ep_hs: EP('The gym where it all started.', 'Your old high school needs a coach. The gym still smells the same.',
    ['Coach the varsity', {}, 'State champions in year four. A fire truck parade, again.', 'You went home and won a state title as a coach.', 'Chase another title'],
    ['Run the youth program', {}, 'Every kid in {town} learns the game from you.', 'You taught every kid in your hometown to play.', 'Teach the little ones'], 'Your old gym'),
  ep_business: EP('Your name on the boardroom door.', 'A glass door, a long table and a room waiting to hear your plan.',
    ['Build something slowly', {}, 'Real estate and patience. A quiet empire.', 'You built a quiet empire after basketball.', 'Steady wins'],
    ['Bet big on one idea', {}, 'A sports drink with your face on it. It\'s everywhere in three years.', 'You bet everything on one idea after basketball, and it worked.', 'Swing for the fences'], 'The boardroom'),
  ep_actor: EP('Hollywood comes calling.', 'Your agent has a script. You\'d play a retired player. "Easy," he says.',
    ['Take the lead role', {}, 'You\'re better than anyone expected. Including you.', 'You became a real actor after basketball.', 'Step into the spotlight'],
    ['Produce instead', {}, 'A documentary about your hometown. It wins awards.', 'You produced a documentary about your hometown.', 'Tell other people\'s stories'], 'Hollywood'),
  ep_politics: EP('Run for city council back home?', 'The seat back home is open. People keep asking you to run.',
    ['Run for the seat', {}, 'You win by a lot. New courts in every ward.', 'You won a seat on the city council back home.', 'Serve your city'],
    ['Back someone better', {}, 'You campaign for a teacher. She wins.', 'You helped a teacher win the city council seat back home.', 'Lift someone else up'], 'City hall'),
  ep_podcast: EP('Start a podcast?', 'Three microphones in your basement. Your first guest is a former teammate.',
    ['Tell the real stories', {}, 'Locker room stories nobody\'s heard. It\'s number one in a month.', 'Your podcast became the most popular show in basketball.', 'Open the vault'],
    ['Keep it about the game', {}, 'Film breakdowns and long interviews. Coaches listen.', 'Coaches built practices around your podcast.', 'Teach the game'], 'Your basement'),
  ep_comeback: EP('One more comeback?', 'A year off, and your knees feel good. A team calls with a camp invite.',
    ['Go to camp', {}, 'You make the team. Eleven games. A standing ovation on the road.', 'You came back for one more short season after retiring.', 'One last ride'],
    ['Say no and smile', {}, 'You keep the voicemail. You play it at dinner parties.', 'You turned down one last comeback and kept the voicemail.', 'Go out on top'], 'Your phone'),
  ep_family: EP('Going home.', 'Your family. Your town. Nothing left to prove.',
    ['Coach your kids\' teams', {}, 'Saturday mornings in a cold gym. The best seat you\'ve ever had.', 'You went home and coached your kids on Saturday mornings.', 'Be there for them'],
    ['Disappear for a while', {}, 'A lake, a boat and no phone. You come back when you\'re ready.', 'You went home and found a quiet life.', 'Find some peace'], 'Home'),
});

/* The roads a story career can take out of high school besides college or a
   paycheck: each is a year away, then the draft or a second choice. */
const ALT_DONE = { juco: 'Enrolled at a junior college.', prep: 'Took a prep school year.', gap: 'Took a gap year to train for the draft.', rec: 'Stayed home to play rec league and work.' };
const ALT_SAY = { juco: 'A junior college two hours from home. Nobody here is famous.', prep: 'A boarding school with a coach who wins. One more year.',
  gap: 'No team. A trainer, a gym and a year.', rec: 'Days at the warehouse. Nights at the rec center. You keep playing.' };

/* Answers to the road's own cards. Null means the card is not one of these. */
function chooseAm(L, card, i, opt, rng, beats, touch) {
  switch (card.id) {
    case 'hs_summer': {
      if (i === 0) { bump(L, { fame: 5, health: -6, ath: 1 }); L.am.rstock = (L.am.rstock || 0) + 0.8; return { text: 'Twelve tournaments, four states, every scout. Your name is on the lists.', tone: 'good' }; }
      if (i === 1) {
        const focus = ARCHES[L.arch].tilt;
        const keys = Object.keys(focus).filter((k) => focus[k] > 0).slice(0, 2);
        const d = {};
        for (const k of keys) d[k] = 2 + Math.round(rng());
        d.eth = 3;
        bump(L, d);
        return { text: 'Five hundred shots a day. It shows in the first week.', tone: 'good' };
      }
      if (i === 2) { bump(L, { trust: 8, iq: 1, win: 0.6 }); return { text: 'Open gym every night. Your team is ready.', tone: 'good' }; }
      bump(L, { health: 12, dur: 2 }); return { text: 'You sleep ten hours a night and grow half an inch.', tone: '' };
    }
    case 'offers': {
      if (opt.school) {
        L.am.college = opt.school;
        bump(L, { morale: 6 });
        logIt(L, 'Committed to ' + opt.school + '.', 'gold');
        return { text: 'You pull on the hat. ' + opt.school + ' it is.', tone: 'gold' };
      }
      bump(L, { fame: 2 });
      return { text: 'You keep everybody waiting. Senior year decides it.', tone: '' };
    }
    case 'signing': {
      if (i === 0) { logIt(L, 'Signed with ' + L.am.college + '.', 'good'); return { text: 'Signed. ' + L.am.college + ' gets its ' + POS_NAME[L.pos].toLowerCase() + '.', tone: 'good' }; }
      L.am.college = null;
      L.pending.unshift(commitCard(L));
      bump(L, { fame: 3 });
      return { text: 'You decommit. Every coach who lost out calls back.', tone: '' };
    }
    case 'commit': {
      if (opt.route === 'walkon') {
        L.am.college = opt.school;
        L.am.route = 'college';
        L.am.walkon = true;
        remember(L, 'route.walkon', true);
        logIt(L, 'Walked on at ' + opt.school + '.', 'gold');
        return { text: 'No scholarship. A locker in the corner. You are in.', tone: 'good' };
      }
      if (opt.route && ALT_DONE[opt.route]) {
        L.am.route = opt.route;
        L.am.college = null;
        remember(L, 'route.' + opt.route, true);
        logIt(L, ALT_DONE[opt.route], 'gold');
        return { text: ALT_SAY[opt.route], tone: 'good' };
      }
      if (opt.route) {
        remember(L, 'route.' + opt.route, true);
        L.am.route = opt.route;
        L.am.college = null;
        logIt(L, opt.route === 'intl' ? 'Turned pro overseas out of high school.' : 'Signed with the G League out of high school.', 'gold');
        return { text: opt.route === 'intl' ? 'You sign a one-year deal overseas.' : 'You sign with the G League.', tone: 'gold' };
      }
      L.am.college = opt.school;
      L.am.route = 'college';
      if (SCHOOL_BY[opt.school] && (SCHOOL_BY[opt.school].tier === 'mid' || SCHOOL_BY[opt.school].tier === 'low')) remember(L, 'route.midmajor', true);
      logIt(L, 'Committed to ' + opt.school + '.', 'gold');
      bump(L, { morale: 6 });
      return { text: 'You pull on the hat. ' + opt.school + ' it is.', tone: 'gold' };
    }
    case 'declare': {
      if (i === 0) { L.am.declared = true; logIt(L, 'Declared for the draft.', 'gold'); return { text: 'You thank the fans. You hire an agent next week.', tone: 'gold' }; }
      if (i === 1) { bump(L, { trust: 6, morale: 2 }); return { text: 'One more year. The campus loses its mind.', tone: 'good' }; }
      L.pending.unshift(portalCard(L));
      return { text: 'Your name is in the portal by lunch.', tone: '' };
    }
    case 'portal': {
      if (opt.school) {
        const from = L.am.college;
        L.am.college = opt.school;
        L.m.trust = 50;
        remember(L, 'route.portal', true);
        logIt(L, 'Transferred from ' + from + ' to ' + opt.school + '.', 'gold');
        return { text: 'You transfer to ' + opt.school + '.', tone: 'gold' };
      }
      return { text: 'You pull your name out. You stay.', tone: '' };
    }
    case 'amclutch': {
      const o = clutchOptions(L, card.ctx && card.ctx.look)[i];
      const s = L.season, t = s.tourney;
      const made = rng() < touched(o.p, touch, L);
      t.waiting = false;
      if (duelOn(L) && t.cur && t.cur.p != null) {
        const rname = (t.kind === 'hs' ? HS_ROUNDS : NCAA_ROUNDS)[t.cur.r];
        const d = duelGame(L, t.cur.p, made, rng, card, i, beats, 'the ' + rname);
        if (made) { bump(L, { fame: 5 }); if (d.won) { L.am.winners = (L.am.winners || 0) + 1; clutchHit(L, beats); } }
        bump(L, { morale: (d.won ? 6 : -6) + (made ? 2 : -2) });
        logIt(L, rname + ': ' + (made ? (d.won ? 'hit the winner.' : 'hit the shot. They answered.') : d.won ? 'missed it. ' + ((card.ctx && card.ctx.mate) || 'The bench') + ' saved it.' : 'missed the last shot.'), d.won ? 'gold' : 'bad');
        endTourneyGame(L, t, t.cur, d.won, beats);
        t.cur = null;
        runTourney(L, beats);
        if (t.done) closeAm(L, beats);
        return { text: d.text, tone: made ? 'gold' : 'bad', made, won: d.won };
      }
      if (made) { L.am.winners = (L.am.winners || 0) + 1; bump(L, { fame: 6, morale: 8 }); clutchHit(L, beats); }
      else bump(L, { morale: -8 });
      const tx = made ? 'Good! You are going to remember that one for the rest of your life.' : 'No good. You sit on the floor for a long time.';
      logIt(L, (t.kind === 'hs' ? HS_ROUNDS : NCAA_ROUNDS)[t.cur.r] + ': ' + (made ? 'hit the winner.' : 'missed the last shot.'), made ? 'gold' : 'bad');
      endTourneyGame(L, t, t.cur, made, beats);
      t.cur = null;
      runTourney(L, beats);
      if (t.done) closeAm(L, beats);
      return { text: tx, tone: made ? 'gold' : 'bad', made };
    }
  }
  return null;
}

function newRoad(L, rng) {
  const town = pick(rng, HOMETOWNS);
  const [c1, c2] = pick(rng, HS_COLORS);
  L.stage = 'hs';
  L.am = { level: 'hs', grade: 10, cyear: 0, town, hs: { name: town + ' ' + pick(rng, HS_SUFFIX), net: round1(norm(rng) * 2.5), c1, c2 },
    rank: 0, rstock: 0, stock: 0, college: null, route: null, declared: false, offers: [] };
  L.amHist = [];
  L.am.rank = nationalRank(L);
  L.phase = 'hs_pre';
  newAmSeason(L, 'hs');
  L.pending.push(hsSummerCard(L));
}
