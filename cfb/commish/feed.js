/*
 * feed.js - what the internet says about what you just did.
 *
 * The room reacts in nine rows of numbers, which is the ledger's view of a ruling and not
 * anybody's experience of one. A commissioner does not find out how a decision went by
 * reading a weighted average. They find out on a Tuesday morning from people who are
 * furious in public.
 *
 * So: a short feed, three posts, after a ruling and after a season. It is the one place in
 * this mode allowed to be funny, and the one place where the sport sounds like the sport
 * rather than like a governance document.
 *
 * NOBODY REAL IS IN HERE, AND THAT IS A HARD LINE, not a preference.
 *
 *   No real reporter, coach, athletic director, player or broadcaster is named, quoted or
 *   alluded to closely enough to be recognizable. Every account below is invented.
 *
 *   No account posts AS a real school, conference or network. A fictional fan account may
 *   talk ABOUT Alabama, which is the same use of a real institution the rest of this game
 *   already makes; an account called "Alabama Football" posting a statement would be
 *   somebody's real organization saying something it never said.
 *
 *   Nothing here is dressed as a real platform. No bird, no blue app chrome, no screenshot
 *   of somebody else's product. It is a feed in this game's own clothes, which is both
 *   safer and better looking than a counterfeit of a website everyone has seen.
 *
 * That is the same rule docket.js already states as "no named people", carried into the one
 * part of the mode where it would have been easiest to break.
 *
 * DETERMINISTIC. Same world, same ruling, same three posts, because the reaction screen is
 * repainted whenever the player comes back to it and a feed that reshuffles itself is a feed
 * nobody trusts. The engagement counts come off the same seed, so the loudest ruling of a
 * term really is the one with the biggest numbers under it.
 *
 * Headless and dependency-free. Browser: window.PS_CFB_FEED. Node: require('./feed.js').
 */
(function (root) {
  'use strict';

  /* ---------------- the cast ----------------
     Twelve accounts, four of them neutral, six speaking for a bloc, two off to the side.
     `for` names the bloc an account is a partisan of, which is how a post gets chosen: the
     bloc that moved hardest gets its own fan account in the feed, so a ruling that guts the
     Group of Five is answered by somebody who cares about the Group of Five.

     A hue and a monogram each, so the feed is scannable as a column of faces rather than as
     a wall of text: the same identity channel the room rows use, applied to a different set
     of people. */
  const WHO = {
    wire: { name: 'The Wire Report', handle: 'thewirereport', tick: true, c: '#38bdf8', m: 'WR',
      kind: 'news' },
    numbers: { name: 'Numbers Only', handle: 'numbersonly', tick: true, c: '#a3e635', m: 'NO',
      kind: 'news' },
    column: { name: 'Press Box Poet', handle: 'pressboxpoet', c: '#f59e0b', m: 'PB',
      kind: 'take' },
    tv: { name: 'Saturday Night Lights', handle: 'satnightlights', tick: true, c: '#ec4899',
      m: 'SN', kind: 'take' },
    south: { name: 'Fourth And Bourbon', handle: 'fourthandbourbon', c: '#ef4444', m: 'FB',
      kind: 'fan', for: 'SEC' },
    midwest: { name: 'Corn Belt Football', handle: 'cornbeltfb', c: '#3b82f6', m: 'CB',
      kind: 'fan', for: 'Big Ten' },
    tobacco: { name: 'Tobacco Road Report', handle: 'tobaccoroadrpt', c: '#f97316', m: 'TR',
      kind: 'fan', for: 'ACC' },
    plains: { name: 'Wind And Wheat', handle: 'windandwheat', c: '#a855f7', m: 'WW',
      kind: 'fan', for: 'Big 12' },
    midmajor: { name: 'Mid Major Mafia', handle: 'midmajormafia', c: '#14b8a6', m: 'MM',
      kind: 'fan', for: 'Group of Five' },
    porch: { name: 'The Front Porch', handle: 'thefrontporch', c: '#38bdf8', m: 'FP',
      kind: 'fan', for: 'Fans' },
    /* An archetype rather than a person: no school, no number, no name. What a locker room
       sounds like when it is talking to itself, which is a thing that exists without any
       particular player having said any particular sentence. */
    locker: { name: 'Anonymous Starter', handle: 'anonstarter', c: '#eab308', m: 'AS',
      kind: 'fan', for: 'Players' },
    bagman: { name: 'Bag Man Weekly', handle: 'bagmanweekly', c: '#94a3b8', m: 'BM',
      kind: 'joke' },
  };
  const FAN_OF = {};
  for (const id in WHO) if (WHO[id].for) FAN_OF[WHO[id].for] = id;

  /* ---------------- what gets posted ----------------
     Keyed by what happened, so the feed is about the ruling rather than about the mood. The
     neutral accounts report and opine; the fan accounts are chosen by which bloc moved and
     are written to be recognizably that fanbase rather than a generic angry person. */

  const ON_AXIS = {
    money: {
      up: [
        { who: 'wire', say: 'The pool goes up. Every athletic director in the country is already on the phone about their share of it.' },
        { who: 'numbers', say: 'More money into the sport. Reminder: this is the fourth increase in six years and ticket prices have gone up in all six.' },
        { who: 'column', say: 'Every time this sport finds more money it finds a new way to argue about it by Thursday.' },
        { who: 'bagman', say: 'good news for me personally' },
      ],
      down: [
        { who: 'wire', say: 'Revenue coming out of the system. Expect the phrase "difficult conversations" in three press releases by Friday.' },
        { who: 'numbers', say: 'That is roughly one full coaching staff per athletic department, for anybody keeping track at home.' },
        { who: 'column', say: 'They found the one thing everyone in college football agrees on and took it away.' },
      ],
    },
    access: {
      up: [
        { who: 'wire', say: 'The field opens up. Somebody in a mid major athletic department is crying in a parking lot right now and they have earned it.' },
        { who: 'midmajor', say: 'SIXTY SCHOOLS JUST GOT A REASON TO PLAY IN NOVEMBER. I AM NOT CALMING DOWN.' },
        { who: 'tv', say: 'You want more meaningful November football? This is how you get more meaningful November football.' },
        { who: 'numbers', say: 'Teams now alive in the final week of November, projected: up 41 percent.' },
      ],
      down: [
        { who: 'wire', say: 'The field narrows. Sources say the smaller conferences were told, not asked.' },
        { who: 'midmajor', say: 'undefeated and outside. again. explain to me what we are supposed to do differently' },
        { who: 'column', say: 'A sport with 134 teams and a postseason built for about nine of them.' },
        { who: 'numbers', say: 'Teams mathematically eliminated before October 1, projected: 96.' },
      ],
    },
    autonomy: {
      up: [
        { who: 'wire', say: 'Conferences keep the call on this one. Four different leagues will now do four different things and we will all pretend that is fine.' },
        { who: 'column', say: 'Local control: the answer everyone loves until their rival gets an advantage from it.' },
      ],
      down: [
        { who: 'wire', say: 'The office takes this one off the conferences. Two of them found out when we did.' },
        { who: 'south', say: 'nobody elected this person. we were winning national titles when that job was a filing cabinet' },
        { who: 'column', say: 'Centralisation arrives in college football roughly once a decade and leaves within two.' },
      ],
    },
    cost: {
      up: [
        { who: 'wire', say: 'The bill for this lands on the athletic departments, which is a sentence that has ended three olympic sports this year already.' },
        { who: 'numbers', say: 'Athletic departments running a deficit last year: 96 of 134. That number is about to get worse.' },
        { who: 'tobacco', say: 'we are one bad TV cycle from losing our swim program and they keep writing rules like this' },
      ],
      down: [
        { who: 'wire', say: 'Costs come down. The presidents will be relieved, quietly, in a statement nobody reads.' },
        { who: 'numbers', say: 'First rule in two years that makes a mid tier athletic budget easier rather than harder.' },
      ],
    },
    tradition: {
      up: [
        { who: 'porch', say: 'THE GAME IS BACK. I am not crying, the tailgate is windy.' },
        { who: 'tv', say: 'Somebody in that room has actually sat in a stadium in November. You can tell.' },
        { who: 'column', say: 'It turns out you can just decide to keep the good thing. Astonishing.' },
      ],
      down: [
        { who: 'porch', say: 'they moved it to a Friday. a FRIDAY. my grandfather has had that Saturday circled since 1974' },
        { who: 'column', say: 'Another century old rivalry has been optimised. The spreadsheet is delighted.' },
        { who: 'tv', say: 'You cannot buy a rivalry. You can only cancel one. Ask anybody who used to be in the Big Eight.' },
        { who: 'bagman', say: 'sad day. anyway.' },
      ],
    },
    inventory: {
      up: [
        { who: 'tv', say: 'More windows, more football, more reasons to stay in on a Saturday. No notes.' },
        { who: 'numbers', say: 'Additional televised games under the new structure: 40 or so, most of them in the noon window.' },
        { who: 'wire', say: 'Networks are pleased. That is not a small thing when the next negotiation starts in eighteen months.' },
      ],
      down: [
        { who: 'tv', say: 'Fewer games. Somebody has to explain that to the people who bought the advertising.' },
        { who: 'wire', say: 'Inventory comes out of the deal. The next rights conversation just got harder for everybody.' },
      ],
    },
    labour: {
      up: [
        { who: 'locker', say: 'first time in four years a rule got written and my group chat was happy about it' },
        { who: 'wire', say: 'A real move on the player side. The lawyers who have been circling this for a decade will read it closely.' },
        { who: 'column', say: 'The sport spent thirty years insisting this was impossible and about nine months discovering it was paperwork.' },
        { who: 'bagman', say: 'well this is bad for the trunk of my car' },
      ],
      down: [
        { who: 'locker', say: 'they made a decision about our bodies and our December in a room with nine chairs and none of them ours' },
        { who: 'column', say: 'Every dollar in this sport is accounted for except the ones owed to the people generating it.' },
        { who: 'wire', say: 'Expect a filing. There is always a filing.' },
      ],
    },
    exposure: {
      up: [
        { who: 'wire', say: 'Two people in that room asked whether this was legal. They were told it was a policy question.' },
        { who: 'column', say: 'Congress has been looking for a reason to hold another hearing about college football. Here it is, gift wrapped.' },
        { who: 'numbers', say: 'Active lawsuits involving college athletics governance: it was already a number that needed a comma.' },
      ],
      down: [
        { who: 'wire', say: 'Cleaner than what it replaces. General counsels across the sport exhale.' },
        { who: 'column', say: 'A rule that will not end up in a deposition. Frame it.' },
      ],
    },
  };

  /* THE BLOC THAT MOVED HARDEST GETS ITS OWN VOICE, because a fanbase reacting is the part
     of this that reads as real. Written as people posting, not as a conference office. */
  const ON_BLOC = {
    SEC: {
      happy: [
        { who: 'south', say: 'good. next question' },
        { who: 'south', say: 'for once the meeting went the way the money says it should have' },
        { who: 'column', say: 'The SEC got what it wanted, which historically is what happens when the SEC wants something.' },
      ],
      angry: [
        { who: 'south', say: 'we generate the sport and we found out about this from a website' },
        { who: 'south', say: 'imagine telling the conference that fills the stadiums how to run a Saturday' },
        { who: 'wire', say: 'Sources describe the SEC response as "measured". Two other people in the room used a different word.' },
      ],
    },
    'Big Ten': {
      happy: [
        { who: 'midwest', say: 'parity achieved. we will now argue about something else within the hour' },
        { who: 'midwest', say: 'presidents happy, ADs happy, my group chat cautiously not furious. big day' },
        { who: 'wire', say: 'The Big Ten got the number it went in asking for, which has not been true of every meeting this year.' },
      ],
      angry: [
        { who: 'midwest', say: 'we have the biggest footprint in the sport and somehow always get the second half of the sandwich' },
        { who: 'midwest', say: 'eighteen schools, four time zones, zero say. cool system' },
        { who: 'wire', say: 'Big Ten sources are already using the phrase "our own arrangements", which is how these things start.' },
      ],
    },
    ACC: {
      happy: [
        { who: 'tobacco', say: 'a whole year where nothing got worse. we will take it and we will not ask questions' },
        { who: 'tobacco', say: 'you can actually recruit against this. small mercies' },
        { who: 'wire', say: 'A rare good week for the ACC, which is a sentence this desk has not typed in a while.' },
      ],
      angry: [
        { who: 'tobacco', say: 'every one of these gives two of our schools another reason to call a lawyer' },
        { who: 'tobacco', say: 'the grant of rights is holding this league together with tape and they keep pulling at the tape' },
        { who: 'wire', say: 'Two ACC schools took meetings about this before the vote. That is not a rumor any more.' },
      ],
    },
    'Big 12': {
      happy: [
        { who: 'plains', say: 'treated like a peer for the first time in a decade. noted. logged. framed.' },
        { who: 'plains', say: 'we get to be a league again instead of a waiting room. genuinely emotional about it' },
        { who: 'numbers', say: 'Big 12 teams alive in the final week of November under the new structure: nine, up from three.' },
      ],
      angry: [
        { who: 'plains', say: 'we are not the group of five and I am so tired of the sentence that puts us in it' },
        { who: 'plains', say: 'twelve wins and a conference title and we are still explaining ourselves in December' },
        { who: 'column', say: 'The Big 12 spends every winter proving it belongs at a table that keeps getting rebuilt without it.' },
      ],
    },
    'Group of Five': {
      happy: [
        { who: 'midmajor', say: 'a PATH. an actual PATH. somewhere in Boise a strength coach is doing donuts in the lot' },
        { who: 'midmajor', say: 'sixty schools just found out their season means something. read that back' },
        { who: 'tv', say: 'That is a mid week November game with actual stakes on it. We will take every one of those you can make.' },
        { who: 'wire', say: 'Group of Five athletic directors have spent two decades asking for that paragraph. They got it today.' },
      ],
      angry: [
        { who: 'midmajor', say: 'thirteen wins, a conference title and a bowl game in Boca. cool. very normal sport' },
        { who: 'midmajor', say: 'they are arguing about the eighth slice. we are still asking to see the pie.' },
        { who: 'wire', say: 'There is an antitrust attorney inside one of these leagues who has been waiting years for a paragraph like this.' },
      ],
    },
    Networks: {
      happy: [
        { who: 'tv', say: 'That is a product. We can sell that on Monday morning and twice on Tuesday.' },
        { who: 'tv', say: 'Give us the window and we will make it the biggest night of the fall.' },
        { who: 'wire', say: 'The rights holders are happy, which matters more eighteen months out from a negotiation than anybody admits.' },
      ],
      angry: [
        { who: 'tv', say: 'You have hollowed out a Saturday we already sold. That shows up in the next number.' },
        { who: 'wire', say: 'One rights holder has described the change internally as "a renegotiation event". That is a phrase with teeth.' },
      ],
    },
    Players: {
      happy: [
        { who: 'locker', say: 'somebody finally asked. that is the whole post' },
        { who: 'locker', say: 'guys who were putting their name in the portal in December are staying now. that is what this does' },
        { who: 'column', say: 'The players got something in writing. Thirty years of "we are looking into it" ended in an afternoon.' },
      ],
      angry: [
        { who: 'locker', say: 'we are students on a Tuesday and inventory on a Saturday and nobody in that room has to pick one' },
        { who: 'locker', say: 'add a game, add a week of hits, do not add a chair to the table. got it' },
        { who: 'column', say: 'The people who play the sport remain the only constituency in that room without a vote.' },
      ],
    },
    Presidents: {
      happy: [
        { who: 'wire', say: 'The presidents can defend this one to a board of trustees, which is the only review that has ever mattered to them.' },
        { who: 'column', say: 'A rule that survives a faculty senate. Nobody will thank anybody for it and it will hold for a decade.' },
      ],
      angry: [
        { who: 'wire', say: 'Two presidents have already asked their general counsel to put something in writing. That is how a vote starts.' },
        { who: 'column', say: 'You can run this sport past the coaches, the networks and the fans. You cannot run it past a university lawyer.' },
      ],
    },
    Fans: {
      happy: [
        { who: 'porch', say: 'somebody in a suit remembered why any of us watch. mark the date' },
        { who: 'porch', say: 'good rule. going to go buy an overpriced hot dog about it' },
        { who: 'tv', say: 'The people in the stadium got a win today. That happens about once a decade.' },
      ],
      angry: [
        { who: 'porch', say: 'every year they take one thing that was free and put a price on it' },
        { who: 'porch', say: 'ninety dollars to park and they are still finding new ways to make it worse' },
        { who: 'porch', say: 'I have had these seats for thirty-one years and I am one more of these away from a Friday night high school game' },
        { who: 'column', say: 'Nobody in that room has to sit in the traffic, buy the parking or explain the kickoff time to a nine year old.' },
      ],
    },
  };

  /* ---------------- the football itself ---------------- */
  const ON_SEASON = {
    champion: [
      { who: 'wire', say: '{champ} are national champions. {seedline}' },
      { who: 'tv', say: 'Confetti on {champ}. Whatever anybody thinks of the format, that was a season.' },
      { who: 'numbers', say: '{champ}, {record}, {seed} seed. The bracket did what a bracket does.' },
    ],
    cinderella: [
      { who: 'wire', say: '{champ} won it from the {seed} seed. Every argument that the field is too big just lost its best sentence.' },
      { who: 'midmajor', say: 'THE {seed} SEED. tell me again about protecting the integrity of the regular season' },
      { who: 'column', say: 'A {seed} seed wins the thing and half the sport spends January explaining why that is bad, actually.' },
    ],
    chalk: [
      { who: 'column', say: '{champ} were the best team in September and the best team in January. The bracket agreed with the preseason and everybody feels slightly cheated.' },
      { who: 'numbers', say: 'Top seed wins it. That is the outcome the committee model predicts and it is the outcome nobody buys a ticket for.' },
    ],
    blowouts: [
      { who: 'tv', say: 'That first round was not a broadcast, it was a chore. We need to talk about the field.' },
      { who: 'numbers', say: 'First round average margin: not close. The people arguing to shrink this thing just got their slide.' },
      { who: 'column', say: 'Nothing kills an argument for a bigger playoff faster than the playoff itself.' },
      { who: 'bagman', say: 'watched four games. saw about one.' },
    ],
    snub: [
      { who: 'wire', say: '{snub} finished {snubrecord} and did not make the field. That is the loudest team in the country this week.' },
      { who: 'porch', say: '{snub} at {snubrecord} and out. somebody is going to have to say that out loud on television' },
      { who: 'column', say: 'Every postseason produces one team whose whole year becomes a talking point. This year it is {snub}.' },
    ],
    grind: [
      { who: 'locker', say: 'that is four extra games for the guys who went the distance. somebody should count the bodies as well as the windows' },
      { who: 'column', say: 'The champion played a professional postseason on an amateur contract. That gap is the whole story of this decade.' },
    ],
    /* TWO ANGLES THE RECAP CANNOT TAKE, because season.js writes its notes off the bracket and
       these are about the audience. Without them a typical season had three triggers, all
       three were in the notes, and the feed spent its whole card repeating the card above it. */
    ratingsUp: [
      { who: 'tv', say: 'Best numbers this sport has done in years. Whatever else is going on, people are watching.' },
      { who: 'wire', say: 'An average game drew {per} million. The rights holders noticed before anybody in that office did.' },
      { who: 'column', say: 'The audience went up, which is the only argument that has ever worked in a negotiation with a network.' },
      { who: 'numbers', say: '{per}M an average game, up on the year. That is the number the next deal gets written against.' },
    ],
    ratingsDown: [
      { who: 'tv', say: 'The numbers are down and the schedule is the reason. We could name the week it started.' },
      { who: 'wire', say: 'An average game drew {per} million, down on the year. Somebody is going to have to explain that at renewal.' },
      { who: 'numbers', say: '{per}M an average game. Down. There is a version of this sport that used to draw more with worse teams.' },
      { who: 'porch', say: 'turns out when you move everything to a stream nobody has, fewer people watch it. wild' },
    ],
    bigGame: [
      { who: 'tv', say: '{bigGame} drew {bigViewers} million on its own. That is the game the whole year gets remembered for.' },
      { who: 'wire', say: 'The biggest audience of the season was {bigGame}. Worth remembering the next time somebody proposes moving it.' },
      { who: 'numbers', say: 'Most watched game of the year: {bigGame}, {bigViewers}M. Nothing else was close.' },
      { who: 'porch', say: '{bigGame}. that is why we do this. that is the whole reason.' },
    ],
    autobids: [
      { who: 'wire', say: 'The automatic bids you promised outnumber the conferences left to win them. Those seats went to at large teams instead.' },
      { who: 'midmajor', say: 'the guaranteed spots got guaranteed to somebody else. incredible work everybody' },
      { who: 'numbers', say: 'Promised automatic bids exceed the number of live conferences. This was foreseeable in about four seconds.' },
    ],
  };

  const ON_TERM = {
    removed: [
      { who: 'wire', say: 'The office is vacant. Two conferences moved together and that has always been all it takes.' },
      { who: 'column', say: 'They will hire somebody who promises to listen more. They always do. It lasts about a year.' },
      { who: 'bagman', say: 'a good commissioner is one who says yes. this one said things.' },
      { who: 'porch', say: 'well that was a term. genuinely could not tell you what the sport is now' },
    ],
    served: [
      { who: 'wire', say: 'A full term completed, which in this job is a result on its own.' },
      { who: 'column', say: 'The sport is different than it was. Whether it is better depends entirely on which of the nine chairs you were sitting in.' },
      { who: 'numbers', say: 'Rulings made, sport changed, room survived. That is the entire scorecard for this office.' },
    ],
  };

  /* WHEN THERE IS NOTHING SPECIFIC LEFT TO SAY, and split by how loud the room was, because
     the first draft answered a ruling that moved the fans eight points with "a quiet ruling,
     which in this sport means everybody is saving it up for the next one". A filler line that
     contradicts the nine numbers above it is worse than a blank space: it reads as the game
     not having noticed what the player just did. */
  const FILLER = {
    quiet: [
      { who: 'column', say: 'A quiet ruling, which in this sport means everybody is saving it up for the next one.' },
      { who: 'bagman', say: 'no notes. genuinely no notes. this affects nothing I do' },
      { who: 'wire', say: 'Passed without much argument. That usually means the argument is somewhere else on the calendar.' },
      { who: 'porch', say: 'sure. fine. wake me up in September' },
      { who: 'numbers', say: 'Effect on the four numbers anybody actually tracks: minimal.' },
      { who: 'tv', say: 'Nothing in there changes a broadcast. Back to you.' },
    ],
    loud: [
      { who: 'column', say: 'Everybody in that room went home with something to be annoyed about. That is usually the sign of a real decision.' },
      { who: 'wire', say: 'Reaction is running hot in about four different directions. Nobody has put out a statement yet, which tells you plenty.' },
      { who: 'bagman', say: 'phone has not stopped. six different people, six different problems, none of them mine' },
      { who: 'porch', say: 'the group chat has gone completely feral and it is a Tuesday' },
      { who: 'numbers', say: 'That is one of the larger single beat swings this office has produced. Whether that is good depends on the chair.' },
      { who: 'tv', say: 'We are going to be talking about that one for a while, and not all of it kindly.' },
    ],
  };

  /* ---------------- the machinery ---------------- */
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < String(str).length; i++) {
      h ^= String(str).charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h;
  }

  /* HOW LOUD IT WAS, 0 to 1, off how far the room actually moved. It sets the engagement
     numbers, which is the trick that makes the feed carry information rather than decoration:
     a term's biggest ruling really does have the biggest number under it, and the player can
     see that at a glance without reading a word. */
  function loudness(rows) {
    let top = 0, sum = 0;
    (rows || []).forEach((r) => { top = Math.max(top, Math.abs(r.delta || 0)); sum += Math.abs(r.delta || 0); });
    return Math.max(0, Math.min(1, (top / 12) * 0.6 + (sum / 45) * 0.4));
  }

  function count(base, loud, seed) {
    const jitter = 0.7 + ((seed % 60) / 100);
    return Math.max(11, Math.round(base * (0.15 + loud * 1.85) * jitter));
  }

  /* 4.2K rather than 4200, because that is how a number under a post is read. */
  function shortNum(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1000) return (n / 1000).toFixed(n < 10000 ? 1 : 0).replace(/\.0$/, '') + 'K';
    return String(n);
  }

  const AGO = ['1m', '3m', '7m', '12m', '24m', '41m', '1h', '2h'];

  function fill(say, vars) {
    return String(say).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? vars[k] : ''));
  }

  /* Draw without repeating an account, so three posts are three faces. */
  function draw(pool, seed, used, vars) {
    if (!pool || !pool.length) return null;
    for (let i = 0; i < pool.length; i++) {
      const p = pool[(seed + i) % pool.length];
      if (used[p.who]) continue;
      const said = fill(p.say, vars);
      if (!said.trim()) continue;
      used[p.who] = 1;
      return { who: p.who, say: said };
    }
    return null;
  }

  /* WHAT THE INTERNET SAID ABOUT A RULING. Three posts: one from whoever reports on the axis
     that moved, one from the fanbase that moved hardest, and one from the sidelines. The
     order is deliberate, because it is how the story actually reaches somebody: the news,
     then the people it happened to, then the guy with the take. */
  function onRuling(opts) {
    const o = opts || {};
    const rows = o.rows || [];
    const fx = (o.edit && o.edit.effects) || {};
    const seed = hash((o.year || 0) + '|' + (o.beat || 0) + '|' + (o.itemId || '') + '|' + (o.optionId || ''));
    const used = {};
    const out = [];

    /* The axis that moved most, which is what the reporting is about. */
    let axis = null, mag = 0;
    for (const a in fx) if (Math.abs(fx[a]) > mag) { mag = Math.abs(fx[a]); axis = a; }
    if (axis && mag >= 0.8 && ON_AXIS[axis]) {
      const p = draw(ON_AXIS[axis][fx[axis] > 0 ? 'up' : 'down'], seed, used);
      if (p) out.push(p);
    }

    /* The bloc that felt it most, which is who the second post belongs to. */
    let loudest = null, loudMag = 0;
    rows.forEach((r) => {
      if (Math.abs(r.delta || 0) > loudMag) { loudMag = Math.abs(r.delta || 0); loudest = r; }
    });
    if (loudest && loudMag >= 1.2 && ON_BLOC[loudest.id]) {
      const p = draw(ON_BLOC[loudest.id][loudest.delta > 0 ? 'happy' : 'angry'], seed >>> 3, used);
      if (p) out.push(p);
    }

    /* And the second loudest, if it went the other way, because a ruling that splits the room
       is the interesting kind and a feed that only shows one side hides that. */
    const split = rows
      .filter((r) => r !== loudest && Math.abs(r.delta || 0) >= 1.2
        && loudest && (r.delta > 0) !== (loudest.delta > 0))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
    if (out.length < 3 && split && ON_BLOC[split.id]) {
      const p = draw(ON_BLOC[split.id][split.delta > 0 ? 'happy' : 'angry'], seed >>> 5, used);
      if (p) out.push(p);
    }

    const loud = loudness(rows);
    while (out.length < 3) {
      const p = draw(loud > 0.5 ? FILLER.loud : FILLER.quiet, (seed >>> (7 + out.length)), used);
      if (!p) break;
      out.push(p);
    }
    return dress(out.slice(0, 3), loud, seed);
  }

  /* WHAT THE INTERNET SAID ABOUT A SEASON. Same shape, different triggers: the football is a
     bigger event than any single ruling and it gets the same three slots. */
  function onSeason(opts) {
    const o = opts || {};
    const sim = o.sim;
    if (!sim || !sim.bracket) return [];
    const champ = sim.bracket.champion;
    const team = champ && champ.team;
    const rounds = sim.bracket.rounds || [];
    const first = rounds[0] || [];
    const seed = hash('season|' + (o.year || 0) + '|' + (team ? team.school : ''));
    const used = {}, out = [];
    const vars = {
      champ: team ? team.school : 'The champion',
      record: team ? team.wins + '-' + team.losses : '',
      seed: champ ? ordinal(champ.seed) : '',
      seedline: champ && champ.seed > 4
        ? 'From the ' + ordinal(champ.seed) + ' seed, which is going to be the argument all winter.'
        : 'The bracket held.',
      snub: o.snub ? o.snub.school : '',
      snubrecord: o.snub ? o.snub.wins + '-' + o.snub.losses : '',
      per: sim.perGame ? sim.perGame.toFixed(2) : '',
      bigGame: '', bigViewers: '',
    };
    /* THE BIGGEST AUDIENCE OF THE YEAR, which is a fact about the season nothing else on the
       screen reports and which is downstream of every scheduling ruling the player made. */
    const all = (sim.games || []).concat(
      (sim.titles || []).map((t) => t.game).filter(Boolean),
      (sim.bracket && sim.bracket.rounds ? sim.bracket.rounds : []).reduce((t, r) => t.concat(r), []));
    const big = all.slice().sort((x, y) => (y.viewers || 0) - (x.viewers || 0))[0];
    if (big) {
      const a = big.a || (big.top && big.top.team), b2 = big.b || (big.bottom && big.bottom.team);
      if (a && b2) {
        vars.bigGame = a.school + ' and ' + b2.school;
        vars.bigViewers = (big.viewers || 0).toFixed(1);
      }
    }

    const blowouts = first.filter((g) => (g.margin || 0) >= 21).length;

    /* THE RECAP AND THE FEED WERE SAYING THE SAME THREE THINGS. The season notes above this
       card are written by season.js off the same events the feed picks from, so the year in
       review reported the automatic bids, the snub and the extra games in prose and then
       immediately reported all three again as posts. Two voices on one story is a feed; two
       voices on the SAME story, in order, is the game repeating itself.

       `said` is the list of verdicts the notes already covered. A trigger in it goes to the
       back of the queue rather than being banned, because a fan account shouting about the
       snub adds something a report cannot, and because on a quiet season everything is in
       `said` and the feed still has to fill three slots. */
    const said = {};
    (o.said || []).forEach((t) => { said[t] = 1; });
    const queue = [];
    const want = (tag, pool, salt) => queue.push({ tag: tag, pool: pool, salt: salt });

    /* Order of interest: the thing people will actually be arguing about on Monday. */
    if (o.autobidsUnmet > 0) want('autobids', ON_SEASON.autobids, 0);
    if (champ && champ.seed >= 8) want('cinderella', ON_SEASON.cinderella, 2);
    else if (champ && champ.seed === 1) want('chalk', ON_SEASON.chalk, 2);
    if (first.length && blowouts >= Math.ceil(first.length / 2)) want('blowouts', ON_SEASON.blowouts, 4);
    if (o.snub) want('snub', ON_SEASON.snub, 6);
    if (rounds.length >= 4) want('grind', ON_SEASON.grind, 8);
    /* The champion is always worth a post and is never in `said`, because the recap reports
       the bracket rather than remarking on it. */
    want('champion', ON_SEASON.champion, 10);
    if (vars.bigGame) want('bigGame', ON_SEASON.bigGame, 12);
    /* `o.trend` is this season's average against the term's, computed by the page because
       only it has the ratings history. */
    if (o.trend > 0.04) want('ratings', ON_SEASON.ratingsUp, 14);
    else if (o.trend < -0.04) want('ratings', ON_SEASON.ratingsDown, 14);

    /* Fresh first, then whatever the notes already covered. */
    queue.sort((a, b) => (said[a.tag] ? 1 : 0) - (said[b.tag] ? 1 : 0));
    queue.forEach((q) => {
      if (out.length >= 3) return;
      const p = draw(q.pool, seed >>> q.salt, used, vars);
      if (p) out.push(p);
    });
    while (out.length < 3) {
      const p = draw(ON_SEASON.champion, seed >>> (10 + out.length), used, vars);
      if (!p) break;
      out.push(p);
    }
    /* A season is the loudest thing that happens all year, so the numbers under it are too. */
    return dress(out.slice(0, 3), 0.92, seed);
  }

  function onTerm(opts) {
    const o = opts || {};
    const seed = hash('term|' + (o.year || 0) + '|' + (o.removed ? 'out' : 'served'));
    const used = {};
    const out = [];
    const pool = o.removed ? ON_TERM.removed : ON_TERM.served;
    for (let i = 0; i < 3; i++) {
      const p = draw(pool, seed >>> (i * 3), used);
      if (!p) break;
      out.push(p);
    }
    return dress(out, o.removed ? 1 : 0.7, seed);
  }

  const ordinal = (n) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st'
    : n % 10 === 2 && n % 100 !== 12 ? 'nd'
      : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');

  /* Attach the account, the timestamp and the numbers. Kept separate from choosing what gets
     said so a test can check the words without the decoration and vice versa. */
  function dress(posts, loud, seed) {
    return posts.map((p, i) => {
      const acct = WHO[p.who] || WHO.wire;
      const s = (seed >>> (i * 2)) >>> 0;
      const likes = count(2600, loud, s);
      return {
        who: p.who,
        name: acct.name,
        handle: acct.handle,
        tick: !!acct.tick,
        color: acct.c,
        mark: acct.m,
        kind: acct.kind,
        say: p.say,
        ago: AGO[(s + i) % AGO.length],
        likes: likes,
        reposts: Math.max(3, Math.round(likes * (0.16 + ((s % 13) / 100)))),
        replies: Math.max(2, Math.round(likes * (0.07 + ((s % 9) / 130)))),
      };
    });
  }

  const api = {
    WHO: WHO, FAN_OF: FAN_OF,
    ON_AXIS: ON_AXIS, ON_BLOC: ON_BLOC, ON_SEASON: ON_SEASON, ON_TERM: ON_TERM, FILLER: FILLER,
    onRuling: onRuling, onSeason: onSeason, onTerm: onTerm,
    loudness: loudness, shortNum: shortNum, hash: hash,
  };
  root.PS_CFB_FEED = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
