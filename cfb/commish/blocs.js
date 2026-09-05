/*
 * blocs.js - who is in the room, and what they think of what you just did.
 *
 * NINE, AND NINE IS A DECISION. Football President reacts with four blocs and Fantasy
 * President with thirty-two. Four is too few for college football, where the whole story is
 * that the SEC and the Big Ten want different things from the ACC and the Big 12 and all
 * four want something different from everybody who is not in them. Thirty-two is a spreadsheet
 * on a phone. Nine is the number where a coalition is a real count you can hold in your head.
 *
 * NOBODY WRITES NINE REACTIONS PER DOCKET ITEM. A ruling emits a push along the eight axes
 * in ledger.js; a bloc holds a weight on each; what it thinks is those multiplied. So a new
 * item on the docket arrives with nine opinions already formed, in character, and the
 * hundredth item costs the same to write as the first. The alternative is authoring 9 x 120
 * reactions by hand, which is how a mode like this quietly stops having new content.
 *
 * A WEIGHT IS A CHARACTER. The SEC's is not "likes money" in the abstract, it is: money
 * matters three times what tradition does, being told what to do costs more than either,
 * and paying players is a cost before it is anything else. Read down a column and it should
 * be recognizably that bloc arguing at a real meeting.
 *
 * MEMORY, WHICH IS THE PART THAT MAKES IT A ROOM RATHER THAN A CALCULATOR. A bloc that has
 * been on the losing end of the last three rulings reacts harder to the fourth, in both
 * directions: it is angrier at another loss and more relieved by a win. Without it every
 * beat is independent and a player can take the same bloc apart forever at the same price.
 *
 * Headless and dependency-free. Browser: window.PS_CFB_BLOCS. Node: require('./blocs.js').
 */
(function () {
  'use strict';

  /* money    is more money moving, and toward the top of the sport unless aimed elsewhere
     access   is an easier path to the playoff for somebody who did not have one
     autonomy is a conference keeping its own decisions
     cost     is what the members have to pay out
     tradition is rivalries, sane kickoff times, the things people already love
     inventory is games worth televising
     labour   is better for the players
     exposure is MORE legal and political trouble, which is why nearly every weight on it
              is negative. The two that are not belong to the people who do the suing.  */
  const BLOCS = [
    {
      id: 'SEC', name: 'SEC', vote: 2,
      about: 'Holds the inventory and knows it. Wants more of everything and to be asked first.',
      w: { money: 3.0, access: -0.8, autonomy: 2.6, cost: -2.0, tradition: 1.0, inventory: 1.4, labour: -1.0, exposure: -0.8 },
    },
    {
      id: 'Big Ten', name: 'Big Ten', vote: 2,
      about: 'The other one that can end you. Wants parity with the SEC and its presidents kept calm.',
      w: { money: 2.8, access: -0.6, autonomy: 2.4, cost: -1.6, tradition: 0.6, inventory: 1.6, labour: -0.4, exposure: -1.4 },
    },
    {
      id: 'ACC', name: 'ACC', vote: 1,
      about: 'Survival. Everything is read as whether it makes leaving easier or staying bearable.',
      w: { money: 2.4, access: 1.2, autonomy: 1.2, cost: -1.8, tradition: 1.2, inventory: 0.8, labour: -0.4, exposure: -0.6 },
    },
    {
      id: 'Big 12', name: 'Big 12', vote: 1,
      about: 'Wants a seat and a bid, and to not be spoken about in the same sentence as the Group of Five.',
      w: { money: 2.2, access: 1.8, autonomy: 1.0, cost: -1.4, tradition: 0.6, inventory: 0.8, labour: -0.2, exposure: -0.4 },
    },
    {
      id: 'Group of Five', name: 'Group of Five', vote: 0.5,
      about: 'Access before money, because money without access never arrives.',
      w: { money: 1.6, access: 3.0, autonomy: 0.4, cost: -1.0, tradition: 0.8, inventory: 0.2, labour: 0.4, exposure: 0.6 },
    },
    {
      id: 'Networks', name: 'The networks', vote: 0,
      about: 'Pays for all of it. Wants windows, inventory and one negotiation.',
      w: { money: 0.6, access: 0.2, autonomy: -1.2, cost: 0.0, tradition: 0.8, inventory: 3.2, labour: 0.0, exposure: -1.0 },
    },
    {
      id: 'Players', name: 'The players', vote: 0,
      about: 'Money, health, and the freedom to leave. Has more leverage every year.',
      w: { money: 0.2, access: 0.8, autonomy: 0.0, cost: 1.2, tradition: -0.4, inventory: -0.6, labour: 3.4, exposure: 0.4 },
    },
    {
      id: 'Presidents', name: 'The presidents', vote: 1.5,
      about: 'Cover and cost control. Anything that ends in a deposition is the whole problem.',
      w: { money: 1.0, access: 0.6, autonomy: 0.8, cost: -2.4, tradition: 0.6, inventory: -0.2, labour: -0.6, exposure: -3.0 },
    },
    {
      id: 'Fans', name: 'The fans', vote: 0,
      about: 'Rivalries, tradition, kickoff at a sane hour. Reads efficiency as an insult.',
      w: { money: -0.8, access: 1.4, autonomy: 0.4, cost: 0.0, tradition: 3.2, inventory: 0.6, labour: 0.6, exposure: -0.2 },
    },
  ];

  const BY_ID = {};
  BLOCS.forEach((b) => { BY_ID[b.id] = b; });

  /* Scale, so a normal ruling moves a bloc a handful of points rather than half the bar.
     Set against the docket: an ordinary item pushes one or two axes by 1 or 2, and a
     sport-changing one pushes four axes by 3. */
  const GAIN = 0.9;
  /* How hard memory bites. A bloc that has lost the last three reacts about 40% harder. */
  const MEMORY = 0.14;
  const MEMORY_MAX = 3;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /* How the last few rulings went for one bloc, as a count of losses minus wins, capped.
     Read off the world's own history rather than stored, so it cannot drift out of step
     with what actually happened and there is nothing extra to serialise. */
  function grudge(world, blocId) {
    const rows = (world.history || []).slice(-MEMORY).reverse();
    let n = 0;
    for (const row of rows) {
      const felt = dot(BY_ID[blocId].w, row.effects || {});
      if (felt < -0.5) n++;
      else if (felt > 0.5) n--;
    }
    return clamp(n, -MEMORY_MAX, MEMORY_MAX);
  }

  function dot(weights, effects) {
    let t = 0;
    for (const axis in weights) t += weights[axis] * (effects[axis] || 0);
    return t;
  }

  /* WHAT THE WHOLE ROOM THINKS, in one call, because that is how it is shown: nine answers
     at once rather than a queue of nine cards. Returns a row per bloc with the number, where
     it leaves them, and the one line they say.

     `edit.aimed` is the part that only one bloc feels. Money moving is not money moving in
     general, it is money moving TO somebody, and a rule that guarantees the Group of Five a
     bid is not the same push for the SEC. Without it every ruling reads as weather. */
  /* `soften` is the note being read: a map of bloc id to a positive amount, built by
     note.js from the words a paid ruling rode in with. Applied after memory and before the
     quote is chosen, so the mood, the number and the line all describe the softened
     reaction rather than the one the note talked them down from. One-directional by
     construction here as well as there: it can only shrink a negative delta toward zero,
     never past it, so a memo cannot turn a loss into applause. */
  function react(world, edit, soften) {
    const fx = (edit && edit.effects) || {};
    const aimed = (edit && edit.aimed) || {};
    return BLOCS.map((b) => {
      const own = Object.assign({}, fx);
      for (const axis in aimed[b.id] || {}) own[axis] = (own[axis] || 0) + aimed[b.id][axis];
      const raw = dot(b.w, own);
      /* Memory amplifies rather than shifts: it never turns a win into a loss, it only
         changes how much the bloc cares that it happened. */
      const g = grudge(world, b.id);
      let delta = raw * GAIN * (1 + Math.abs(g) * MEMORY * (g > 0 === raw < 0 ? 1 : 0.5));
      let read = false;
      if (soften && soften[b.id] > 0 && delta < 0) {
        delta = Math.min(0, delta + soften[b.id]);
        read = true;
      }
      const was = world.blocs[b.id] == null ? 50 : world.blocs[b.id];
      const now = clamp(was + delta, 0, 100);
      return {
        id: b.id, name: b.name, vote: b.vote,
        delta: Math.round(delta * 10) / 10,
        was: Math.round(was), now: Math.round(now),
        mood: moodOf(now),
        read: read,
        /* `own` is this bloc's own push, aimed effects included, which is what lets the line
           be about the thing that moved rather than only about how much. The seed is the
           world's clock plus the bloc, so a beat replays word for word and two blocs never
           pick the same index out of two different pools. */
        /* WALKED, NOT SAMPLED, and that is the whole of the fix. The seed used to be a hash of
           the clock, so the index into a three line pool was effectively random and a random
           draw from three repeats about a third of the time: a player watched the fans say
           "best thing to come out of a conference room since the two point conversion" over
           and over and reported that the room says it every time it is pleased.

           A ruling counter plus a per bloc offset makes consecutive picks from the same pool
           consecutive INDEXES, so a pool of five is five different sentences before any of
           them comes back, and two blocs still start in different places. It is just as
           deterministic: the same beat replays word for word, because the counter is the
           length of the history and the offset is a hash of the id. */
        say: line(b, delta, now, own,
          (hash(b.id) + ((world.history || []).length)) >>> 0, g),
      };
    });
  }

  /* The deltas alone, in the shape ledger.applyOutcome takes. */
  function deltas(world, edit) {
    const out = {};
    react(world, edit).forEach((r) => { out[r.id] = r.delta; });
    return out;
  }

  function moodOf(v) {
    if (v >= 70) return 'with you';
    if (v >= 50) return 'along for now';
    if (v >= 30) return 'unhappy';
    if (v >= 15) return 'hostile';
    return 'gone';
  }

  /* ONE LINE, AND IT IS THE BLOC TALKING, NOT A NARRATOR. Five bands of feeling by five
     voices is twenty-five short strings, which is the cheapest thing in this file and the
     part a player actually reads.
     THIS IS ALSO THE SEAM FOR THE LANGUAGE MODEL, if that fork is taken later: a generated
     line would replace exactly this function and nothing else, and when the model is not
     there these are what shows. See the plan doc. */
  /* ---------------- what they say ----------------
     NINE BLOCS SAYING ONE FIXED SENTENCE EACH PER MOOD is how this started, and forty-five
     lines run out in about ten minutes: the SEC said "we have other options and everybody
     knows it" every single time it was annoyed, all term, which stops being a room and
     becomes a vending machine.

     Two things fix that, and they are different fixes.

     BREADTH. Every mood is a pool rather than a line, picked deterministically from the
     world's own clock, so the same beat replays identically and a term does not repeat
     itself. That alone is the difference between a bloc and a status light.

     SPECIFICITY, which matters more. A reaction should be about WHAT YOU DID, not merely
     about how much they liked it. `on` holds lines keyed to the axis that actually drove
     the reaction, so the SEC losing money says something about money and the fans losing a
     rivalry say something about the rivalry. The band pools are the fallback for a ruling
     with no single dominant push, which is most of the small ones.

     GOOD AND BAD, NOT UP AND DOWN. An axis pool is split by whether the bloc LIKED which way
     it went, never by the direction itself, because those are opposites for half the room:
     access going up is a gift to the Group of Five and a tax on the SEC. Splitting on the
     sign of the bloc's own contribution makes a tonally wrong line impossible to write.

     THE LANGUAGE IS THE SPORT'S. Cupcakes, bag men, the portal, the third Saturday, noon
     kicks, a nine o'clock eastern kickoff in Pullman, the band, the bowl tie-in nobody
     wants. A commissioner sim written in press-release English is a spreadsheet with a
     logo on it.

     STILL NO NAMED PEOPLE. A bloc speaks and an institution pushes. Nobody in this file is
     a real coach, athletic director or reporter, and nothing here is a quote anybody said. */

  const VOICE = {
    SEC: {
      bands: [
        ['This is what we pay for.',
          'You have finally read the room correctly. Do it again.',
          'We will be difficult about something else. Enjoy the afternoon.',
          'Put it in writing before somebody in this room reconsiders.',
          'Correct. Now do not revisit it in March when somebody complains.',
          'No notes. Write that down, it will not happen often.'],
        ['Fine. We will take it.',
          'We can live with this. Do not read that as enthusiasm.',
          'Nobody here is thrilled. Nobody is calling a lawyer either.',
          'Acceptable. We have lost worse meetings than this one.',
          'We will not fight this one. We are saving it.',
          'It is a decision, and this office has made worse ones this month.'],
        ['We were not consulted.',
          'We found out about this the way everybody else did, which is the part we mind.',
          'Interesting call, given whose television money keeps those lights on.',
          'We will remember the process here longer than the decision.',
          'Somebody should have called first. Somebody always should have called first.',
          'Our presidents read about it in the paper. That is the part that stings.'],
        ['We have other options and everybody knows it.',
          'We have had very good years without this office. Several of them.',
          'Ask us again in the spring. The answer will cost more.',
          'You are welcome to run the sport. You are running it without us.',
          'We are polling our members, and you will not enjoy the results.',
          'The next version of this conversation happens on our terms.'],
        ['We are done talking to this office.',
          'We will schedule our own January. Thank you for your time.',
          'There is a version of this sport that does not have you in it. It is drawn up.',
          'Our lawyers, our networks and our presidents are already on the same call.',
          'We have stopped returning the calls. Read that however you like.',
          'There is a meeting this week that you are not in.'],
      ],
      /* THE TWO THINGS A ROOM SAYS THAT A MOOD BAND CANNOT. `relief` is an unhappy bloc
         acknowledging a win without forgiving anything; `grudge` is a content one being
         let down. Without them a bloc sitting at forty printed an angry sentence beside a
         green plus one, which is the same contradiction the themed lines were guarded
         against and the more common one, because standing moves slowly and deltas do not. */
      /* THE THIRD LOSS RUNNING. `grudge` in this file has always counted a streak and
         nothing in the mode has ever SAID it: a bloc on the wrong end of four rulings in
         a row reacted harder, which the player felt as a bigger number and never once
         heard about. A room that remembers out loud is the difference between a model
         and an argument. */
      streak: [
        'That is three in a row and we have counted every one of them.',
        'This office has a pattern and it points away from the people paying for the sport.',
        'We have stopped treating these as individual decisions.',
      ],
      relief: [
        'Noted. It does not undo the last three meetings.',
        'A win for us, which after this year we are counting individually.',
        'Fine. Keep going and we will stop drafting the other plan.',
        'We can put that in the win column. It is a short column this year.',
      ],
      grudge: [
        'We were with you until that.',
        'That is the first thing out of that office we have had to think about.',
        'Careful. We have been patient and it is not a renewable resource.',
        'We had been prepared to call this a good term. Had been.',
      ],
      on: {
        money: {
          good: ['Our number went up. Keep going.',
            'That is the first sensible thing to come out of that building all year.',
            'Good. Now do the same thing for the January windows.'],
          bad: ['That is our money and you just spent it on somebody else.',
            'You took it out of our pocket and called it fairness.',
            'We generate it. We would like to be in the room when it is divided.'],
        },
        autonomy: {
          good: ['Our house, our rules. That is all we ever asked.',
            'Good. We do not need a permission slip to schedule in November.'],
          bad: ['We do not need this office deciding what happens in Tuscaloosa.',
            'You have just made yourself a party to every argument we have.',
            'This conference was winning national titles before that job existed.'],
        },
        cost: {
          good: ['Somebody else is paying for it. Excellent.',
            'A rule that costs us nothing. We did not think you had it in you.'],
          bad: ['That bill lands on sixteen athletic departments, not on you.',
            'Our members will fund that out of the same budget that buys the buses.'],
        },
        inventory: {
          good: ['More games worth watching. We can sell that on Monday.',
            'Good. Give us the window and we will fill it.'],
          bad: ['You just cut games nobody was tired of watching.',
            'Fewer Saturdays that matter is fewer Saturdays we get paid for.'],
        },
      },
    },

    'Big Ten': {
      bands: [
        ['Our presidents will be pleased, which is the hardest audience there is.',
          'That is parity. We will say so publicly and mean it.',
          'Sensible. We will not make you regret agreeing with us.',
          'Fair, funded and defensible. Three for three, which never happens.',
          'We can take that to eighteen campuses and not lose a single one.',
          'That is what a commissioner is for. We do not say it often.'],
        ['Workable.',
          'We will take it back to the campuses and it will survive the room.',
          'Not what we asked for. Close enough to sign.',
          'It holds. It does not inspire anybody, and it holds.',
          'We have signed off on worse and called it a triumph.',
          'Our directors will grumble and vote for it anyway.'],
        ['That is not parity and everybody in here can count.',
          'We are being asked to fund a system built for somebody else.',
          'We came out of that meeting further behind than we went in.',
          'The arithmetic in that room did not include us.',
          'Somebody will ask us in January why we agreed to this. We did not.'],
        ['We will be looking at our own arrangements.',
          'There is a network that would take our inventory tomorrow. They have said so.',
          'Our schools did not join a conference to be the second call.',
          'Our television partners have started asking what our options are.',
          'We built the biggest thing in this sport. We can build another.',
          'The Rose Bowl was ours before this office existed. Remember that.'],
        ['This office no longer speaks for us.',
          'We will announce our own postseason and you will read about it.',
          'Eighteen presidents, one vote, and it is not going your way.',
          'We are not attending the next one. Send the minutes.',
          'Our presidents have voted and the vote was not close.',
          'You will find out what we are doing when everybody else does.'],
      ],
      /* THE TWO THINGS A ROOM SAYS THAT A MOOD BAND CANNOT. `relief` is an unhappy bloc
         acknowledging a win without forgiving anything; `grudge` is a content one being
         let down. Without them a bloc sitting at forty printed an angry sentence beside a
         green plus one, which is the same contradiction the themed lines were guarded
         against and the more common one, because standing moves slowly and deltas do not. */
      /* THE THIRD LOSS RUNNING. `grudge` in this file has always counted a streak and
         nothing in the mode has ever SAID it: a bloc on the wrong end of four rulings in
         a row reacted harder, which the player felt as a bigger number and never once
         heard about. A room that remembers out loud is the difference between a model
         and an argument. */
      streak: [
        'Three of these now. Our presidents have started keeping a list, and so have we.',
        'Every meeting this year has gone the same way and it is not the way we came in asking for.',
        'There is a version of this where we stop attending.',
      ],
      relief: [
        'Better. Our presidents will want to see two more like it.',
        'That helps. It does not settle anything.',
        'One meeting in the right direction. We have a long memory for the other kind.',
        'That is closer to what we asked for than anything else this year.',
      ],
      grudge: [
        'We were prepared to support this office. That made it harder.',
        'One of those is a mistake. Two is a pattern and we count.',
        'That will be raised at our meetings and not by us.',
        'We came in supportive. You are spending that down quickly.',
      ],
      on: {
        money: {
          good: ['That is a number our presidents can defend at a board meeting.',
            'Fair split. We will not pretend to be unhappy about it.'],
          bad: ['We are the largest footprint in the sport and we just got the smaller half.',
            'Somebody has to explain that number to eighteen boards. It will not be us.'],
        },
        autonomy: {
          good: ['Our conference, our calendar. Good.',
            'We can live with any rule we wrote ourselves.'],
          bad: ['We did not vote to hand this office our scheduling.',
            'Every campus lawyer in this conference just opened a new file.'],
        },
        inventory: {
          good: ['More primetime. Our partners will be delighted.',
            'That is a noon window, a late window and a night game. Good work.'],
          bad: ['You just deleted a television window we already sold.',
            'Fewer games is fewer rights fees. That math does not move.'],
        },
        exposure: {
          good: ['Cleaner than what we had. Our counsel is nodding.',
            'That one will not end up in front of a judge. Rare.'],
          bad: ['We have general counsel on this call and she is not happy.',
            'Our presidents do not do depositions. That is the whole rule.'],
        },
      },
    },

    ACC: {
      bands: [
        ['That buys us time, and time is the only thing we were short of.',
          'We can recruit against that. Thank you.',
          'Our members will read this as a reason to stay. Finally.',
          'The first good news anybody has brought this conference in years.',
          'Our members can look at that and see a reason to stay put.',
          'We will take a year with no emergency calls. Thank you.'],
        ['We can live with it.',
          'It is not a fix. It is not a funeral either.',
          'We will take a year where nothing gets worse.',
          'Nothing broke today. In this conference that counts.',
          'It buys a season. We will spend it well.',
          'We would have asked for more. We did not expect to get this.'],
        ['Our members will read this as a reason to leave.',
          'Every school we are worried about just got a talking point.',
          'You have handed the schools with exit lawyers a reason to call them.',
          'The schools with lawyers just added a slide to their deck.',
          'That is one more reason to leave, and we are short of reasons to stay.',
          'We will spend the spring explaining this to nine athletic directors.'],
        ['Our lawyers are already reading it. So are theirs.',
          'The grant of rights is the only thing holding this together and you just tested it.',
          'Two of our schools took that meeting before the ink dried.',
          'Two of our members have already asked what the exit costs.',
          'The grant of rights was never as strong as everybody pretended.',
          'We are one bad ruling from being a map with holes in it.'],
        ['There may not be an ACC to consult next year.',
          'You can address the remaining nine of us in writing.',
          'When this conference comes apart, this is the meeting people will point at.',
          'There is a version of next year with six of us in it.',
          'Our members are talking to each other without us on the call.',
          'You have run out of conference to negotiate with.'],
      ],
      /* THE TWO THINGS A ROOM SAYS THAT A MOOD BAND CANNOT. `relief` is an unhappy bloc
         acknowledging a win without forgiving anything; `grudge` is a content one being
         let down. Without them a bloc sitting at forty printed an angry sentence beside a
         green plus one, which is the same contradiction the themed lines were guarded
         against and the more common one, because standing moves slowly and deltas do not. */
      /* THE THIRD LOSS RUNNING. `grudge` in this file has always counted a streak and
         nothing in the mode has ever SAID it: a bloc on the wrong end of four rulings in
         a row reacted harder, which the player felt as a bigger number and never once
         heard about. A room that remembers out loud is the difference between a model
         and an argument. */
      streak: [
        'Every one of these lands on us and there are not many of us left.',
        'Three in a row. Two of our schools have stopped pretending they are staying.',
        'We came into this term hanging on. You have not helped once.',
      ],
      relief: [
        'We will take it. We are not in a position to be proud about it.',
        'That is a lifeline, and we are aware of what a lifeline is.',
        'Good. Now do six more before somebody\'s lawyer finishes reading the exit clause.',
        'Every one of these buys us a month. We need about forty.',
      ],
      grudge: [
        'We had one good thing going and you touched it.',
        'That is a phone call two of our schools are going to make tonight.',
        'We were nearly comfortable. Nearly.',
        'That is the one thing we could not afford this week.',
      ],
      on: {
        money: {
          good: ['That closes some of the gap. Some of it.',
            'Our schools will notice that number. So will their boosters.'],
          bad: ['The gap was already the whole problem. You widened it.',
            'Every dollar of that is a recruiting pitch against us.'],
        },
        access: {
          good: ['A path is a pitch. We can sell a path.',
            'Our champion getting in is the difference between a league and a bowl tie-in.'],
          bad: ['Narrow it further and our best season stops meaning anything.',
            'You just told our members that winning this conference is not enough.'],
        },
        cost: {
          good: ['Our members can afford that, which is not nothing these days.',
            'A rule that does not cost us anything is a rule we can pass.'],
          bad: ['Half our athletic departments are already running a deficit.',
            'That bill closes an olympic sport somewhere. It always does.'],
        },
        tradition: {
          good: ['Those games are what our brand is. Keep them.',
            'Good. Some of those rivalries predate the forward pass.'],
          bad: ['You just spent a hundred years of somebody\'s November.',
            'Our fans do not travel for an efficiency. They travel for the old things.'],
        },
      },
    },

    'Big 12': {
      bands: [
        ['A seat at last.',
          'That is the first time this conference has been treated as a peer. We noticed.',
          'Good. Now say the same thing in public with a camera on.',
          'For once we are in the sentence rather than the footnote.',
          'That is the ruling we have been asking three commissioners for.',
          'We will hold you to it, and we will thank you in public first.'],
        ['Acceptable.',
          'We will take it, and we will still be asking for more in the spring.',
          'Not a win. Not the usual.',
          'More than the usual, which is not the same as enough.',
          'We can sell that to our schools without a long meeting.',
          'Nothing to celebrate. Nothing to appeal either.'],
        ['We are being lumped in again.',
          'We are not the Group of Five and we are tired of the sentence that says we are.',
          'Somebody drew a line and put us on the wrong side of it. Again.',
          'We are a power conference on the letterhead and nowhere else today.',
          'Every one of these costs us a recruit we will never hear about.',
          'The fourth share of everything, forever, is not a business.'],
        ['We will look after ourselves.',
          'This conference has been written off twice and is still here. Try a third time.',
          'We have expansion targets and a phone. Do not make us use both.',
          'We have been left for dead before and we are still scheduling games.',
          'There are four schools in other leagues who take our calls now.',
          'You are pricing us out and calling it a formula.'],
        ['We are not participating in this.',
          'You can hold the meeting. We will read the minutes.',
          'The last office that treated us like this does not exist any more.',
          'We will make our own arrangements and announce them on our own day.',
          'This conference has outlived two of these offices already.',
          'Do not send us the agenda. We are not coming.'],
      ],
      /* THE TWO THINGS A ROOM SAYS THAT A MOOD BAND CANNOT. `relief` is an unhappy bloc
         acknowledging a win without forgiving anything; `grudge` is a content one being
         let down. Without them a bloc sitting at forty printed an angry sentence beside a
         green plus one, which is the same contradiction the themed lines were guarded
         against and the more common one, because standing moves slowly and deltas do not. */
      /* THE THIRD LOSS RUNNING. `grudge` in this file has always counted a streak and
         nothing in the mode has ever SAID it: a bloc on the wrong end of four rulings in
         a row reacted harder, which the player felt as a bigger number and never once
         heard about. A room that remembers out loud is the difference between a model
         and an argument. */
      streak: [
        'Third time. We are starting to think it is deliberate.',
        'Nobody in this league expects anything from that office any more.',
        'We have been on the wrong end of every ruling this year. Every single one.',
      ],
      relief: [
        'Better than the usual. We are not sending a thank you card.',
        'Progress, from a very low base, and we know exactly how low.',
        'Something went our way for once. We will believe it in November.',
        'That is the sort of thing we joined this league expecting.',
      ],
      grudge: [
        'We were on your side this morning.',
        'That is a step backwards and we did not have many to spare.',
        'Do not do that again. We have been very reasonable.',
        'We had stopped bracing for these. That was a mistake.',
      ],
      on: {
        money: {
          good: ['That number moves the needle for every school in this league.',
            'Our schools can build with that. Actually build.'],
          bad: ['We are already the fourth number on that page. You made it smaller.',
            'That is a coordinator we cannot afford now. Multiply it by sixteen.'],
        },
        access: {
          good: ['Our champion gets in. That is the whole ballgame for us.',
            'A guaranteed seat turns every November game in this league into an event.'],
          bad: ['We win twelve games and get told to wait. Explain that to Ames.',
            'You have made our conference title a participation trophy.'],
        },
        cost: {
          good: ['A rule we can afford is a rule we can support.',
            'That we can do without going to the board.'],
          bad: ['Our budgets are not their budgets and this rule was written for theirs.',
            'The two biggest leagues will pay that out of petty cash. We will not.'],
        },
        autonomy: {
          good: ['We will handle our own house, thank you.',
            'Good. We know what works in this footprint better than you do.'],
          bad: ['We just gave up something we may want back in two years.',
            'That decision belonged in this league, not in that building.'],
        },
      },
    },

    'Group of Five': {
      bands: [
        ['A real path. Finally.',
          'Somewhere in Boise a whole athletic department is standing up right now.',
          'Twenty years of being told to schedule better, and today it actually meant something.',
          'Somebody in this office finally looked at a map of the whole country.',
          'We will tell sixty athletic directors tonight and none of them will sleep.',
          'That is the difference between a sport and a closed shop. You chose right.'],
        ['Better than nothing.',
          'We will take the crumb. We would like it noted that it is a crumb.',
          'It is progress. Slow, but the arrow is the right way.',
          'We will take it and keep asking. That has always been the job.',
          'It is not the door. It is a crack, and we have gone through smaller.',
          'Our schools have survived on less than this for thirty years.'],
        ['We play the same sport under the same rules and get a different answer every time.',
          'Another rule written by people who have never played on a Tuesday.',
          'We generate the upsets that sell your postseason and are paid for none.',
          'The word access keeps appearing in rulings that reduce it.'],
        ['We are filing.',
          'There is an antitrust lawyer in this conference who has been waiting years for this.',
          'You have made us a farm system with a marching band.',
          'Our presidents have started using the word cartel in writing.',
          'Sixty schools, one set of rules, and two of them get to write it.',
          'We are documenting all of this. Somebody will want it eventually.'],
        ['We will see you in front of a judge.',
          'Congress has asked us to come and explain the sport. We are going to.',
          'Sixty schools, one exhibit, and your name on the front of it.',
          'We are not scheduling your buy games any more. Find somebody else.',
          'There is a subcommittee that would love to hear about today.',
          'We would rather play each other than be a rounding error.'],
      ],
      /* THE TWO THINGS A ROOM SAYS THAT A MOOD BAND CANNOT. `relief` is an unhappy bloc
         acknowledging a win without forgiving anything; `grudge` is a content one being
         let down. Without them a bloc sitting at forty printed an angry sentence beside a
         green plus one, which is the same contradiction the themed lines were guarded
         against and the more common one, because standing moves slowly and deltas do not. */
      /* THE THIRD LOSS RUNNING. `grudge` in this file has always counted a streak and
         nothing in the mode has ever SAID it: a bloc on the wrong end of four rulings in
         a row reacted harder, which the player felt as a bigger number and never once
         heard about. A room that remembers out loud is the difference between a model
         and an argument. */
      streak: [
        'Three in a row, and the last one was the one you promised would be different.',
        'There is a filing cabinet in this conference with your name on the folder.',
        'We stopped hoping about two meetings ago.',
      ],
      relief: [
        'We will take it and we will still be in front of a judge about the rest.',
        'A crumb, gratefully received, and please note the word crumb.',
        'That helps about four of our schools. There are sixty of us.',
        'Good. Now say it again when the power four are in the room.',
      ],
      grudge: [
        'We were starting to think this office was different.',
        'That is the part where it always goes wrong for us.',
        'We had hope for about a season. That is longer than usual.',
        'For a moment there we were being treated as part of the sport.',
      ],
      on: {
        access: {
          good: ['One guaranteed bid. That is all we ever asked for and you gave it.',
            'An undefeated season now leads somewhere. That is a different sport for us.'],
          bad: ['Undefeated and outside again. There is no way to coach around that.',
            'You just told sixty schools that their season is a scrimmage.',
            'The gap just got wider.',
            'Our best season in a decade would still not clear that bar.'],
        },
        money: {
          good: ['That funds a weight room in about forty places.',
            'That number is a rounding error to them and a decade to us.'],
          bad: ['They are arguing over the eighth slice. We are asking to see the pie.',
            'We take the guarantee game money because you left us nothing else.'],
        },
        cost: {
          good: ['Something we can actually pay for. Write more of those.',
            'A rule that does not price us out. That is new.'],
          bad: ['That rule ends non-revenue sports at schools you have never visited.',
            'You have written a check with our athletic departments.'],
        },
        tradition: {
          good: ['Somebody remembered that we have rivalries too.',
            'Those games sell out here. That should count for something.'],
          bad: ['Our traditions apparently do not make the list.',
            'A Tuesday night in November is not a tradition, it is what you left us.'],
        },
      },
    },

    Networks: {
      bands: [
        ['That is a product we can sell.',
          'Our sales team just stopped worrying about the fourth quarter of the year.',
          'That is three hours we can charge premium for. Thank you.',
          'Our affiliates will run that promo unpaid. That is how good it is.',
          'You just created a night. Nobody in this sport creates nights.'],
        ['We can work with it. That is not praise.',
          'It is not what we would have drawn up. It is sellable.',
          'We will make it work. We always do, and it always costs somebody something.',
          'It is sellable. It is not the pitch we wanted to make.',
          'Nobody will love it. Everybody will buy it.',
          'Our sales team will find a way. They resent it, and they do it.'],
        ['This devalues the inventory.',
          'You have turned appointment television into background noise.',
          'A game nobody has to watch is a game nobody watches.',
          'Nobody in that room has ever had to sell anything.',
          'We are the only people in this building who have to make a number.'],
        ['The next deal will reflect this.',
          'Every one of these decisions shows up in the number at renewal.',
          'We are not paying premium money for a Saturday you have hollowed out.',
          'The renewal conversation will be shorter and colder than the last one.',
          'There is a number in our model for this and it is going down.',
          'We are already looking at what else we could put on instead.'],
        ['We are not bidding on that.',
          'Take it to somebody else and see what they say. We will wait.',
          'You can have the sport you want or the check. Not both.',
          'We will let the rights lapse and see who else turns up.',
          'You have made this a distribution problem rather than a sports one.',
          'Our board has asked whether this sport is still a growth line.'],
      ],
      /* THE TWO THINGS A ROOM SAYS THAT A MOOD BAND CANNOT. `relief` is an unhappy bloc
         acknowledging a win without forgiving anything; `grudge` is a content one being
         let down. Without them a bloc sitting at forty printed an angry sentence beside a
         green plus one, which is the same contradiction the themed lines were guarded
         against and the more common one, because standing moves slowly and deltas do not. */
      /* THE THIRD LOSS RUNNING. `grudge` in this file has always counted a streak and
         nothing in the mode has ever SAID it: a bloc on the wrong end of four rulings in
         a row reacted harder, which the player felt as a bigger number and never once
         heard about. A room that remembers out loud is the difference between a model
         and an argument. */
      streak: [
        'Three decisions in a row that made the product worse. We are keeping a note.',
        'Every one of these costs us something. They add up before the renewal does.',
        'We are going to have a very short conversation about the next deal.',
      ],
      relief: [
        'That helps the number. It does not fix the number.',
        'Sellable. We will still be having a difficult conversation at renewal.',
        'Good for one Saturday. We buy the whole fall.',
        'That is one Saturday improved. There are thirteen of them.',
      ],
      grudge: [
        'We were happy. Please understand how rare that is.',
        'That comes out of something we had already sold. It shows up later.',
        'One of those is fine. We are going to count them.',
        'We had this season priced. It is worth less than it was this morning.',
      ],
      on: {
        inventory: {
          good: ['More games that matter in more windows. That is the entire business.',
            'That is three additional nights we can put a number on.',
            'Give us that window and we will make it the biggest night of the fall.'],
          bad: ['You just deleted inventory we had already sold to advertisers.',
            'Fewer meaningful games is a smaller check. It is not complicated.',
            'You have taken a game people would have watched and made it a formality.',
            'Half of that slate is now a rating we cannot sell against.',
            'We paid for drama. That ruling takes it off the schedule.'],
        },
        autonomy: {
          good: ['One conversation instead of eleven. Thank you.',
            'A single negotiation is worth real money to everybody in this room.'],
          bad: ['Now we have to negotiate that eleven separate times.',
            'Every conference doing its own thing is how a sport gets cheap.'],
        },
        exposure: {
          good: ['Nothing there that a standards department will ring about.',
            'Clean. Our lawyers can approve that in an afternoon.'],
          bad: ['We do not want to be broadcasting a lawsuit in progress.',
            'Advertisers ask about that sort of thing now. They did not use to.'],
        },
        tradition: {
          good: ['That is a ratings event and always has been. Protect it.',
            'People set their year by things like that. So do we.'],
          bad: ['You have touched something people plan their year around.',
            'What you just changed was worth a point of rating on its own.'],
        },
      },
    },

    Players: {
      bands: [
        ['Somebody finally listened.',
          'That is the first rule in a while that was written with us in the room.',
          'Guys are texting each other about this right now, and not to complain.',
          'Somebody in that room asked what it is like to be twenty and ranked.',
          'First thing all year that makes the season easier rather than longer.',
          'We have been asking for exactly that since before most of us got here.'],
        ['It is a start.',
          'We will take it. We are not going to pretend it is finished.',
          'Better than last year, which is a low bar and still a bar.',
          'We will take it. We are still counting the things it does not fix.',
          'It helps the guys after us more than it helps us. That is fine.',
          'Nobody is celebrating. Nobody is walking out either.'],
        ['We are being talked about, not to.',
          'Nine groups in that room and none of them puts on a helmet.',
          'You just made a decision about our bodies and our calendar without us.',
          'Everybody in that room gets paid to decide what happens to our knees.',
          'They keep saying student athlete and never once ask a student athlete.'],
        ['We are organizing.',
          'There are guys on this call who have already spoken to a labour lawyer.',
          'Every one of these decisions makes the case for us better.',
          'There are guys on this team who have already signed something.',
          'We are the only ones in this sport who cannot say no to anything.',
          'The room decided. The room does not play on Saturday.'],
        ['We will bargain, or we will sit.',
          'Ask yourself what a championship weekend looks like with nobody on the field.',
          'You do not have a sport without us. That has always been true.',
          'There is a group chat with four thousand players in it and it is angry.',
          'You will find out what a walkout looks like in November.',
          'Every one of us can leave. Watch what happens if we all do it at once.'],
      ],
      /* THE TWO THINGS A ROOM SAYS THAT A MOOD BAND CANNOT. `relief` is an unhappy bloc
         acknowledging a win without forgiving anything; `grudge` is a content one being
         let down. Without them a bloc sitting at forty printed an angry sentence beside a
         green plus one, which is the same contradiction the themed lines were guarded
         against and the more common one, because standing moves slowly and deltas do not. */
      /* THE THIRD LOSS RUNNING. `grudge` in this file has always counted a streak and
         nothing in the mode has ever SAID it: a bloc on the wrong end of four rulings in
         a row reacted harder, which the player felt as a bigger number and never once
         heard about. A room that remembers out loud is the difference between a model
         and an argument. */
      streak: [
        'Third one. We are not asking any more, we are organizing.',
        'Every ruling this year has been about us and none of them has been with us.',
        'There is a lawyer on this call now. There did not use to be.',
      ],
      relief: [
        'That is one thing. There is a list.',
        'We noticed. It does not change that we are not in the room.',
        'Something, finally, and about a decade after it should have been obvious.',
        'We will take the win. We would rather have had the meeting.',
      ],
      grudge: [
        'We were listening. That is the part that stings.',
        'Right up until that line, somebody was actually paying attention.',
        'Take a step forward and a step back and call it a process.',
        'We were beginning to think somebody in there was on our side.',
      ],
      on: {
        labour: {
          good: ['That is money and time that actually reaches a locker room.',
            'A real share, in writing. That is what we came for.',
            'Guys who were going to leave in December are staying now.'],
          bad: ['You want the revenue of a professional league and the labour costs of a club team.',
            'We are the only people in that room who are not paid to be in it.',
            'Another year of being told we are students on a Tuesday and inventory on a Saturday.'],
        },
        cost: {
          good: ['Somebody is finally paying for the thing they sell.',
            'That cost lands on the people making the money. Good.'],
          bad: ['They will find that money by cutting something we use.',
            'The first thing to go will be a walk-on scholarship. It always is.'],
        },
        access: {
          good: ['More teams playing meaningful football is more of us on tape.',
            'A wider field means more guys get seen. That matters to a career.'],
          bad: ['A smaller field means half the country stops playing for anything in October.',
            'You just shortened a lot of seasons that pay for a lot of futures.'],
        },
        inventory: {
          good: ['More exposure, if you are one of the guys who gets it.',
            'Fine, as long as somebody counts the bodies as well as the windows.'],
          bad: ['Another game is another week of hits. Somebody should say that out loud.',
            'You added games to a calendar nobody asked us about.'],
        },
      },
    },

    Presidents: {
      bands: [
        ['Defensible. That matters more than anybody in this room admits.',
          'We can put that in front of a board and a faculty senate on the same day.',
          'Nothing there that ends up in a subpoena. Thank you.',
          'Our athletic departments can run a season under that without a special meeting.',
          'Our counsel read it twice and had nothing to add. That is a first.',
          'We can defend that to a board without a rehearsal.'],
        ['We can explain this.',
          'It will survive a trustees meeting. Not comfortably, but it will survive.',
          'We would have written it differently. We will not fight it.',
          'It will pass a committee. Slowly, and it will pass.',
          'We can live inside that. Our budgets cannot live inside much.',
          'No institution here is going to break over this one.'],
        ['This ends up in a courtroom.',
          'Somebody is going to be deposed about this and it will be one of us.',
          'You have created a fact pattern. That is what they call it afterwards.',
          'The football team is eight percent of this campus and a hundred percent of the risk.',
          'We will be answering questions about that ruling under oath eventually.',
          'Every one of these ends up in a filing with our name on it.'],
        ['We have a fiduciary problem.',
          'Our institutions have obligations that have nothing to do with football.',
          'General counsel has advised us not to be in the room the next time this is discussed.',
          'Our boards are asking why athletics keeps arriving as a liability.',
          'The faculty senate has put this on an agenda. That never goes well.',
          'We govern universities. This office keeps handing us football problems.'],
        ['A vote is being scheduled.',
          'This is now a governance matter and governance is what we do.',
          'Two of us have been asked to testify. We are going to be honest.',
          'There are trustees asking whether this university needs a football team at all.',
          'The next conversation about this happens in front of a committee.',
          'Some of our institutions are reconsidering the whole arrangement.'],
      ],
      /* THE TWO THINGS A ROOM SAYS THAT A MOOD BAND CANNOT. `relief` is an unhappy bloc
         acknowledging a win without forgiving anything; `grudge` is a content one being
         let down. Without them a bloc sitting at forty printed an angry sentence beside a
         green plus one, which is the same contradiction the themed lines were guarded
         against and the more common one, because standing moves slowly and deltas do not. */
      /* THE THIRD LOSS RUNNING. `grudge` in this file has always counted a streak and
         nothing in the mode has ever SAID it: a bloc on the wrong end of four rulings in
         a row reacted harder, which the player felt as a bigger number and never once
         heard about. A room that remembers out loud is the difference between a model
         and an argument. */
      streak: [
        'Three of these in a row and every one has our institutions on the hook.',
        'This is now a pattern and a pattern is what a plaintiff calls a policy.',
        'The board has asked how many more of these there are going to be.',
      ],
      relief: [
        'That reduces the exposure. It does not remove it.',
        'Our counsel is marginally happier. That is the highest praise available here.',
        'Helpful. We remain the ones who get deposed.',
        'That narrows the exposure. Our counsel will still not sign anything.',
      ],
      grudge: [
        'We were comfortable. We are now merely calm.',
        'That reopens something we thought had been closed.',
        'One paragraph in that has our counsel writing an email.',
        'We had that risk closed out. It is open again and it is bigger.',
      ],
      on: {
        exposure: {
          good: ['That closes a door that has been open for years. Good.',
            'Our counsel signed off in one reading. That has never happened.'],
          bad: ['That is a lawsuit with a filing date, not a risk.',
            'You have written the plaintiff\'s opening statement for them.',
            'Every one of these lands on a university, not on a conference office.'],
        },
        cost: {
          good: ['A number our budgets can carry. That is the rarest thing you can hand us.',
            'We can fund that without touching the academic side. Barely.'],
          bad: ['That comes out of a university budget, and universities are not football teams.',
            'You have just made every athletic department a line item somebody will attack.',
            'Somewhere that closes a swimming program. It always closes a swimming program.'],
        },
        money: {
          good: ['Revenue we can point at when the faculty asks what this is for.',
            'That helps. Institutions are not flush.'],
          bad: ['The revenue goes down and the obligations do not. We have seen this film.'],
        },
        autonomy: {
          good: ['Decisions belong on campuses. We have always said so.',
            'Good. We answer to a board, not to a conference office.'],
          bad: ['You have taken a decision that belongs to the institutions.',
            'Our charters do not have a commissioner in them.'],
        },
      },
    },

    Fans: {
      bands: [
        ['This is the sport we grew up on.',
          'For once somebody in a suit remembered why any of us watch.',
          'Best thing to come out of a conference room since the two point conversion.',
          'They actually left something alone. Mark the calendar.',
          'First ruling in years that sounds like it came from somebody who watches.',
          'Somebody in there has been to a game. You can tell.'],
        ['We will get used to it.',
          'It is not the end of the world. It is not why we started watching either.',
          'Fine. We complained about the last one too and here we still are.',
          'It is fine. We say that every year and we are always still here.',
          'Not what we wanted. Not worth the argument either.',
          'We will grumble in September and forget about it by October.'],
        ['Nobody asked for this.',
          'Every year they take one more thing that was free and put a price on it.',
          'Somebody in a boardroom heard the word tradition and reached for a calculator.',
          'Another thing that used to be simple and now needs an explainer.',
          'They keep asking us to love a sport they keep rearranging.',
          'Nobody in that room has ever paid for a ticket to anything.'],
        ['You are ruining it.',
          'My grandfather sat in that stadium. He would not recognize the schedule.',
          'Half the reason we watched is gone and they are calling it growth.',
          'The season we grew up with is a thing you have to explain to a child.',
          'We are the only ones in this who never get a vote.'],
        ['We will find something else on.',
          'Enjoy the sport. We will be at a high school game on Friday.',
          'You finally did it. The tickets are for sale and nobody is buying.',
          'We are done. Not angry, just done.',
          'There is a high school field three miles away with real people in it.',
          'The sport we loved is a thing they sell now. We noticed when it stopped.'],
      ],
      /* THE TWO THINGS A ROOM SAYS THAT A MOOD BAND CANNOT. `relief` is an unhappy bloc
         acknowledging a win without forgiving anything; `grudge` is a content one being
         let down. Without them a bloc sitting at forty printed an angry sentence beside a
         green plus one, which is the same contradiction the themed lines were guarded
         against and the more common one, because standing moves slowly and deltas do not. */
      /* THE THIRD LOSS RUNNING. `grudge` in this file has always counted a streak and
         nothing in the mode has ever SAID it: a bloc on the wrong end of four rulings in
         a row reacted harder, which the player felt as a bigger number and never once
         heard about. A room that remembers out loud is the difference between a model
         and an argument. */
      streak: [
        'Three in a row. At what point is somebody going to ask us anything?',
        'Every single one of these has made going to a game worse.',
        'We have been saying the same thing all year and it is going very well.',
      ],
      relief: [
        'Credit where it is due. We are still angry about the kickoff times.',
        'Fine, that one was good. Do not let it go to your head.',
        'One good decision. We have been counting the other kind since 2010.',
        'That one was for us. We are not going to pretend it was not.',
      ],
      grudge: [
        'We were having such a nice year.',
        'You had us. You genuinely had us.',
        'One of these always shows up in February to remind us who runs it.',
        'We were enjoying this. That is the last time we do that.',
      ],
      on: {
        tradition: {
          good: ['That game is back. That is all anybody wanted.',
            'The rivalry survives, the band plays, the world keeps turning.',
            'Somebody in that room has actually been to a game. Thank you.'],
          bad: ['That is a hundred years old and you spent it for a television deal.',
            'They will put something cheaper in its place and call it a solution.',
            'You cannot buy these things back once you have spent them. Ask the Big Eight.',
            'Everything we grew up with is on later, on a channel fewer people have.'],
        },
        access: {
          good: ['More teams alive in November is more reasons to care in September.',
            'Our school actually has a road in now. That is the whole point.'],
          bad: ['Two teams matter by October and the rest of us are watching a scrimmage.',
            'You just made most of the season an exhibition and put it behind a paywall.'],
        },
        money: {
          good: ['Fine, as long as some of it reaches the stadium we sit in.',
            'Spend it on the concourse. Have you seen the concourse?'],
          bad: ['Every one of these meetings ends with somebody else getting richer.',
            'They found more money and it still costs ninety dollars to park.'],
        },
        labour: {
          good: ['Pay them. They are why we are there.',
            'Good. Anybody who watched a kid play through a torn labrum knew this was coming.'],
          bad: ['These are twenty-year-olds and the adults in the room are the problem.',
            'Nobody is buying a jersey to support a conference office.'],
        },
        inventory: {
          good: ['More football is more football. We are simple people.',
            'Give us the noon game and the night game and we will be there for both.'],
          bad: ['They cut a Saturday and will still ask us to renew the season tickets.',
            'Fewer games, same price. Somebody do the math for me.'],
        },
      },
    },
  };

  /* A SMALL DETERMINISTIC HASH, so a bloc's line is stable for a given beat and does not
     resample every time the screen repaints. The preview and the ruling that follows it must
     land on the same sentence or the forecast is lying about something that costs nothing to
     get right. */
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h;
  }

  /* WHICH AXIS ACTUALLY DROVE THIS, which is not the same as which axis moved most: a huge
     push on an axis a bloc does not care about drives nothing. It is the largest term of the
     dot product, so the sign of it IS whether they liked it, and an axis line chosen this way
     cannot come out tonally backwards. */
  function driver(bloc, own) {
    let best = null, bestMag = 0;
    for (const axis in bloc.w) {
      const term = bloc.w[axis] * (own[axis] || 0);
      if (Math.abs(term) > bestMag) { bestMag = Math.abs(term); best = axis; }
    }
    return { axis: best, term: best ? bloc.w[best] * (own[best] || 0) : 0, mag: bestMag };
  }

  /* The push has to be big enough that a themed line is honest about it. Below this a ruling
     is a nudge and the mood pool says it better than a sentence about money would. */
  const DRIVEN = 1.2;

  /* HOW MANY DIFFERENT SENTENCES A POOL HAS TO BE ABLE TO PRODUCE. Four, because the index
     walks rather than samples now: four consecutive rulings out of the same pool are four
     different lines, and a themed pool fires perhaps five or six times across a whole term. */
  const VARIETY = 4;

  function line(bloc, delta, now, own, seed, streak) {
    const voice = VOICE[bloc.id] || VOICE.Fans;
    /* Which pool is mostly where they have ENDED UP, nudged by which way they just moved,
       because a bloc at 70 that has just been hurt should not sound delighted. */
    let band = now >= 70 ? 0 : now >= 50 ? 1 : now >= 30 ? 2 : now >= 15 ? 3 : 4;
    /* THE NUDGE IS NOT SYMMETRIC, AND THAT IS THE POINT OF IT. It exists so a bloc at 70 that
       has just been hurt does not sound delighted, which is the downward case. Applying the
       same threshold upward meant a bloc sitting at fifty, moved less than two points, got
       the most euphoric sentence in its pool: "best thing to come out of a conference room
       since the two point conversion", for a nudge.

       A room is easier to sour than to delight, which is true of this one and of every other
       one. So a bad move promotes at 1.5 and a good move has to clear 2.5. */
    if (delta < -1.5) band = Math.min(4, band + 1);
    else if (delta > 2.5) band = Math.max(0, band - 1);

    let pool = voice.bands[band];

    /* A STREAK OUTRANKS A MOOD. Three losses running is the single most human thing this room
       can notice and it was the one thing it could not say: `grudge` has counted the streak
       since the file was written, and all it ever did was make the number bigger. */
    if (streak != null && streak >= 3 && delta < -0.6 && voice.streak && voice.streak.length) {
      const n = (typeof seed === 'number' ? seed : hash(bloc.id)) >>> 0;
      return voice.streak[n % voice.streak.length];
    }

    /* WHERE THEY STAND AND WHAT JUST HAPPENED CAN DISAGREE, and the bands only know the
       first. A bloc sitting at forty is displeased, and if this ruling helped them the screen
       printed a displeased sentence beside a green plus one: "you have handed the schools
       with exit lawyers a reason to call them", at plus one point one.

       That is the same contradiction the themed lines are guarded against and it is the more
       common one, because standing moves slowly and a delta does not. So the two moments a
       mood band cannot express get their own words: an unhappy bloc acknowledging a win
       without forgiving anything, and a content one being let down. */
    if (band >= 2 && delta >= 1.0 && voice.relief && voice.relief.length) {
      pool = voice.relief;
    } else if (band <= 1 && delta <= -1.0 && voice.grudge && voice.grudge.length) {
      pool = voice.grudge;
    }
    /* WHAT THE MOOD ALONE WOULD HAVE SAID, kept because a themed pool below may need to borrow
       from it. Captured here, after relief and grudge have had their say, so what it borrows
       is never a sentence that fights the number. */
    const base = pool;

    /* THE EXTREMES KEEP THEIR OWN WORDS. A bloc that is finished with you should sound
       finished with you, not deliver a considered note about television inventory, so the
       themed lines only apply through the three middle moods. A themed line beats relief and
       grudge when it fits, because it is the more specific thing to say. */
    if (own && band > 0 && band < 4) {
      const d = driver(bloc, own);
      const themed = d.axis && voice.on && voice.on[d.axis];
      /* THE DRIVER HAS TO AGREE WITH THE VERDICT. One axis being the largest single term does
         NOT mean it decided the outcome: opening the playoff up pushes the Big Ten's
         inventory hardest of anything in the ruling, and it is still a net loss for them once
         access and money are counted. Choosing the line off the driver alone printed "more
         primetime, our partners will be delighted" beside a red minus zero point seven.

         So the themed pool is only used when the axis that drove it and the number the player
         is reading say the same thing, and a ruling that nets out near nothing gets a mood
         line rather than a confident one about television. */
      if (themed && d.mag >= DRIVEN && Math.abs(delta) >= 0.6 && (d.term > 0) === (delta > 0)) {
        const side = d.term > 0 ? themed.good : themed.bad;
        /* PADDED UP TO A FLOOR, FROM THE POOL THIS ONE JUST DISPLACED. Seventy-four of the
           themed pools hold exactly two lines, and two lines walked is A, B, A, B, which reads
           as repetition every bit as loudly as one line did. The bands were widened to six for
           the same reason; doing that to seventy-four themed pools by hand is a hundred and
           fifty sentences, and most of them would be a worse way of saying the two that are
           already there.

           So a short themed pool borrows from `base`, which is whatever the mood alone would
           have said in this exact situation, and the specific line still comes up about half
           the time. Borrowing from `base` rather than from the band matters: relief and grudge
           exist precisely because the band CONTRADICTS the delta in those two cases, and
           padding out of the band there would put an angry sentence beside a green number,
           which is the fault they were written to fix. */
        if (side && side.length) {
          pool = side.length >= VARIETY
            ? side
            : side.concat(base.slice(0, VARIETY - side.length));
        }
      }
    }
    const n = (typeof seed === 'number' ? seed : hash(bloc.id)) >>> 0;
    return pool[n % pool.length];
  }

  /* ---------------- who is actually talking ----------------
     A BLOC IS NOT A PERSON AND THE ROOM READ LIKE MINUTES. Every quote on the desk was
     attributed to an institution: "The SEC: whatever this costs, it is not coming out of our
     distribution." That is accurate and it is nobody speaking. A room of nine institutions
     saying "we" is a press release with nine paragraphs.

     So a voice gets a SPEAKER: a role, not a name. An athletic director in the SEC, a fourth
     year safety, somebody in the student section. It is the same bloc underneath, with the
     same weights and the same chip beside it, and the only thing that changes is that
     somebody is in the chair.

     NOBODY IDENTIFIABLE, WHICH IS A NARROWER RULE THAN IT SOUNDS. "A coach in the SEC" is a
     role held by sixteen people and names none of them. "Alabama's head coach" is a role held
     by exactly one living man, so putting an invented sentence in it is using his name with
     extra steps, and it is the thing this file's rule has always been about. Where a school
     is named the role has to stay plural or anonymous: an assistant, the compliance office,
     somebody in the athletic department.

     DETERMINISTIC PER BEAT, off the same hash everything else here uses, so a term replays
     with the same people in it and a screenshot is reproducible.

     SHORT, BECAUSE THE DESK GIVES A SPEAKER TWO LINES. The attribution and the quote share
     one flow, so every character spent here is a character taken off the sentence. The first
     set of these ran to twenty-seven characters ("a Big Ten athletic director") and pushed
     twenty-eight of the two hundred and seventy-three lines onto a third row. "AD" is not a
     compression, it is what everybody in this sport actually says. test_desk measures every
     line in the docket, so this stays honest. */
  const SPEAKERS = {
    SEC: ['an SEC AD', 'a coach in the SEC', 'an SEC assistant'],
    'Big Ten': ['a Big Ten AD', 'a Big Ten coach', 'a Big Ten deputy'],
    ACC: ['an ACC AD', 'an ACC coach', 'an ACC deputy'],
    'Big 12': ['a Big 12 AD', 'a Big 12 coach', 'a Big 12 deputy'],
    'Group of Five': ['a Sun Belt AD', 'a Mountain West coach', 'a MAC AD'],
    Networks: ['a network exec', 'a rights holder', 'a Saturday producer'],
    Players: ['a starting safety', 'a starting QB', 'a player rep'],
    Presidents: ['a school president', 'a chancellor', 'a faculty rep'],
    Fans: ['a ticket holder', 'a radio caller', 'somebody in row 11'],
  };
  /* AND THE SAME ROLES WITH A SCHOOL ON THEM, for items that carry one. All of these are
     plural or anonymous on purpose: an assistant, a trustee, a supporter. */
  const AT_SCHOOL = {
    SEC: ['an assistant at ', 'a deputy AD at '],
    'Big Ten': ['an assistant at ', 'a deputy AD at '],
    ACC: ['an assistant at ', 'a deputy AD at '],
    'Big 12': ['an assistant at ', 'a deputy AD at '],
    'Group of Five': ['an assistant at ', 'a deputy AD at '],
    Presidents: ['a trustee at ', 'the provost at '],
    Fans: ['a supporter of ', 'a fan of '],
  };

  /* `cast` is whatever the item is about, so a school on it is the school being argued over.
     `salt` separates two speakers from the same bloc in one room and keeps a beat stable. */
  function speaker(blocId, cast, salt) {
    const pool = SPEAKERS[blocId];
    if (!pool) return null;
    const n = hash(String(blocId) + '|' + String(salt || ''));
    const school = cast && (cast.school || cast.a
      || (cast.team && cast.team.school) || null);
    const atPool = AT_SCHOOL[blocId];
    /* A NAMED SCHOOL IS WORTH SPENDING THE CHARACTERS ON, sometimes. Roughly a third of the
       time, so the room does not turn into the same construction nine times over, and never
       when the name would push the line past what the box holds. */
    if (school && atPool && (n % 3) === 0) {
      /* UNSIGNED, because `hash` returns values above 2^31 and a signed shift on one of
         those is negative, which indexes the pool at minus one and prints "undefinedAlabama"
         at a reader. */
      const built = atPool[(n >>> 3) % atPool.length] + school;
      if (built.length <= 26) return built;
    }
    return pool[n % pool.length];
  }

  /* AT_SCHOOL IS EXPORTED SO THE WIDTH GUARD CAN ENUMERATE THE WORST CASE. The desk gives a
     speaker two lines, and which speaker a voice draws depends on a hash of the item id and
     on whether the item carries a school. A guard that measures one of those and calls it
     safe is the guard that already failed once: it went on rendering bloc names ("The SEC",
     seven characters) for a room that had stopped drawing them. See test_desk.mjs. */
  const publicAPI = { BLOCS, BY_ID, GAIN, MEMORY, VARIETY, VOICE, react, deltas, grudge, dot, moodOf, line, driver, hash,
    SPEAKERS, AT_SCHOOL, speaker };
  if (typeof module !== 'undefined' && module.exports) module.exports = publicAPI;
  if (typeof window !== 'undefined') window.PS_CFB_BLOCS = publicAPI;
})();
