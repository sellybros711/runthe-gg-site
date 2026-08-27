/*
 * fallout.js - what happened next.
 *
 * A RULING USED TO END WITH NINE NUMBERS MOVING. The room answered, the meters ticked, and
 * the mode went back to the office. Everything that happened in this sport happened inside a
 * spreadsheet, which is a strange way to run a game about the most publicly ridiculous
 * institution in American life.
 *
 * So a ruling can now have a tail. A booster commissions a statue. A congressman enters your
 * decision into the record and it turns out being agreed with is worse. A message board is
 * right six hours early. Somebody sells a shirt. Somebody sues. A mascot appears outside the
 * building and nobody can establish who he is.
 *
 * ABSURD IS NOT THE SAME AS UNGROUNDED, and this file lives or dies on the difference. Every
 * one of these has happened, nearly happened, or is one bad Tuesday from happening, because
 * a sport where a coach has been fined for a helicopter and a mascot has been ejected from a
 * game does not need anything invented. The joke is the sport. It only lands if the writing
 * plays it straight, which is why none of these have a punchline in them: they are minutes,
 * written by somebody who was in the room and is not enjoying it.
 *
 * IT HAS TO COST OR PAY SOMETHING. A tail with no effects is a joke pinned to the screen,
 * and the second time a player sees one they will learn it is decoration and stop reading.
 * Everything here moves the ledger, in the same units a ruling does and about a third as far,
 * and the effects are folded into the ruling's own edit BEFORE the room answers, so the
 * numbers on the reaction screen are the numbers including this. A player who reads the card
 * understands the meters; a player who skips it sees a ruling that landed slightly differently
 * than the desk forecast, which is exactly what the desk was honest about forecasting.
 *
 * DETERMINISTIC PER RULING, so a term replays identically and a tail is a thing that happened
 * rather than a thing that might have.
 *
 * Headless and dependency-free. Browser: window.PS_CFB_FALLOUT. Node: require('./fallout.js').
 */
(function (root) {
  'use strict';

  /* HOW OFTEN. Every ruling is too much: the tail stops being a tail and becomes the screen,
     and forty of these read as a comedy routine rather than as a sport that keeps producing
     them. Never is what the mode already did. About one in three is the rate at which a
     player stops expecting one and is pleased each time. */
  var RATE = 0.34;

  /* A REAL NAME OR NOTHING. Most items carry a cast and the tail can use it; the ones that do
     not were printing "a compliance officer at a member school", which reads as a template
     that failed rather than as a sentence somebody wrote. `roll` puts a school from the actual
     membership on the context, so the fallback is a school that exists in this sport. */
  function school(ctx) {
    var c = ctx.cast || {};
    return c.school || c.a || (c.team && c.team.school) || (ctx.sit && ctx.sit.leader
      && ctx.sit.leader.school) || ctx.anySchool || 'a member school';
  }
  function other(ctx) {
    var c = ctx.cast || {};
    return c.b || (ctx.sit && ctx.sit.unbeaten && ctx.sit.unbeaten[1]
      && ctx.sit.unbeaten[1].school) || 'a conference rival';
  }
  function conf(ctx) {
    var c = ctx.cast || {};
    return c.conf || c.conference || (ctx.sit && ctx.sit.leader && ctx.sit.leader.conference)
      || 'one of the conferences';
  }
  /* WHICH WAY THE RULING WENT on an axis, so a tail can be about what was actually done
     rather than about the item it was done on. */
  function fx(ctx, axis) { return ((ctx.edit && ctx.edit.effects) || {})[axis] || 0; }
  function big(ctx, axis) { return Math.abs(fx(ctx, axis)) >= 2; }

  /* ---- the tails ----
     `when` may read the world, the situation, and the edit that is about to be applied.
     `weight` is relative within whatever is eligible. Effects are deliberately small. */
  var TAILS = [
    /* ---------------- the press ---------------- */
    {
      id: 'statue',
      weight: 2,
      when: function (w, sit) { return sit.standing != null && sit.standing >= 62; },
      head: 'A booster has commissioned a statue of you',
      body: function (ctx) {
        return 'Nine feet, bronze, paid for privately, and already installed outside a '
          + school(ctx) + ' facility without anybody asking this office. It does not look like '
          + 'you. It looks like a man who has been told bad news about a boat. It has its own '
          + 'account now and the account is funnier than you are.';
      },
      effects: { tradition: 1.2, exposure: -0.8 },
      aimed: { Fans: { tradition: 1.4 } },
    },
    {
      id: 'thirty-minutes',
      weight: 4,
      when: function () { return true; },
      head: 'It got thirty minutes on television',
      body: function (ctx) {
        return 'A half hour special, in prime time, about a decision that took eleven minutes '
          + 'to make. Twenty-eight of those minutes were two men shouting at each other and '
          + 'the other two were a graphic. Nobody involved read the ruling. The ratings were '
          + 'enormous.';
      },
      effects: { inventory: 1, exposure: -0.6, money: 0.4 },
      aimed: { Networks: { inventory: 1.4 } },
    },
    {
      id: 'leak',
      weight: 4,
      when: function () { return true; },
      head: 'A message board had it six hours early',
      body: function (ctx) {
        return 'Posted at four in the morning by an account with a picture of a bass on it, in '
          + 'a thread about parking. It was right. Every detail of it was right, including the '
          + 'dial. This office has eleven people in it and one of them talks to a man who '
          + 'fishes.';
      },
      effects: { exposure: -1.2, autonomy: -0.6 },
      aimed: { Presidents: { exposure: -1.4 } },
    },
    {
      id: 'impression',
      weight: 3,
      when: function () { return true; },
      head: 'A coach read it out loud in an impression of you',
      body: function (ctx) {
        return 'At a Monday press conference, in front of forty reporters, doing a voice. He '
          + 'read the whole second paragraph in it. Everybody in the room understood the voice '
          + 'was you and one of them asked him to do it again. He did it again.';
      },
      effects: { autonomy: -1, tradition: 0.6, inventory: 0.8 },
      aimed: { Fans: { tradition: 1.2 }, Presidents: { exposure: -0.8 } },
    },
    {
      id: 'shirt',
      weight: 4,
      when: function () { return true; },
      head: 'Somebody is selling the shirt',
      body: function (ctx) {
        return 'Within ninety minutes there was a shirt. By lunchtime there were four, one of '
          + 'them officially licensed by ' + school(ctx) + ', all of them quoting a sentence '
          + 'from the ruling out of context in a way that is much funnier than the sentence. '
          + 'The licensing revenue comes back to this sport, which is the part nobody enjoys.';
      },
      effects: { money: 0.6, tradition: 1, exposure: -0.4 },
      aimed: { Fans: { tradition: 1.2 } },
    },

    /* ---------------- the politics ---------------- */
    {
      id: 'congressional-record',
      weight: 3,
      when: function (w) { return (w.pressure.congress || 0) >= 12; },
      head: 'A congressman entered it into the record',
      body: function (ctx) {
        return 'He was FOR it. He read two pages of it into the Congressional Record, praised '
          + 'this office by name, and used the phrase "finally, some leadership". It has turned '
          + 'out that being agreed with by that particular member is considerably worse than '
          + 'being attacked by him, and three presidents have now called to say so carefully.';
      },
      effects: { exposure: -1.6, autonomy: -0.8 },
      aimed: { Presidents: { exposure: -1.6 } },
    },
    {
      id: 'governor',
      weight: 3,
      when: function () { return true; },
      head: 'A governor has an opinion',
      body: function (ctx) {
        return 'A sitting governor held a press conference about it, at a podium, with a flag '
          + 'behind him, in a state where ' + school(ctx) + ' is the largest employer in four '
          + 'counties. He announced a review. Nobody can determine what he would be reviewing '
          + 'or under what authority, and neither can his office.';
      },
      effects: { exposure: -1.4, access: 0.4 },
      aimed: { Presidents: { exposure: -1.2 } },
    },
    {
      id: 'state-bill',
      weight: 2,
      when: function (w) { return (w.pressure.legal || 0) >= 15; },
      head: 'Two states passed conflicting laws about it',
      body: function (ctx) {
        return 'One legislature has made your ruling mandatory within its borders. Another has '
          + 'made it illegal. Both bills were written in a fortnight, both passed nearly '
          + 'unanimously, and ' + conf(ctx) + ' has member institutions in both states. The '
          + 'lawyers have asked for a meeting and used the word "unprecedented" twice in one '
          + 'email.';
      },
      effects: { exposure: -2, cost: 1, autonomy: -1.2 },
      aimed: { Presidents: { exposure: -1.8 } },
    },

    /* ---------------- the room ---------------- */
    {
      id: 'walkout',
      weight: 3,
      when: function (w, sit, ctx) { return big(ctx, 'autonomy') && fx(ctx, 'autonomy') < 0; },
      head: 'Two of them walked out',
      body: function (ctx) {
        return 'Not dramatically. They collected their things, said thank you, and left before '
          + 'the vote, which under the bylaws does not affect anything and under every other '
          + 'consideration affects everything. One of them was photographed in the car park on '
          + 'the telephone, and the photograph is on the front of two newspapers.';
      },
      effects: { autonomy: -1, exposure: -1 },
      aimed: { SEC: { autonomy: -1.2 }, 'Big Ten': { autonomy: -1 } },
    },
    {
      id: 'unanimous',
      weight: 2,
      when: function (w, sit) { return sit.standing != null && sit.standing >= 70; },
      head: 'It went through unanimously and that is the worrying part',
      body: function (ctx) {
        return 'Nobody spoke against it. Nobody asked a question. The whole thing took four '
          + 'minutes and two of those were somebody finding the right document. A room that '
          + 'agrees this easily has either been convinced or has stopped bothering, and the '
          + 'minutes cannot tell you which.';
      },
      effects: { autonomy: 0.8, exposure: 0.6 },
      aimed: { Presidents: { autonomy: 0.8 } },
    },
    {
      id: 'minutes-leak',
      weight: 2,
      when: function () { return true; },
      head: 'Somebody recorded the meeting',
      body: function (ctx) {
        return 'Forty-one minutes of audio, published in full, in which two commissioners '
          + 'discuss a third commissioner\'s hair for longer than they discuss the ruling. It '
          + 'is not damaging. It is not even interesting. It is now the only thing anybody in '
          + 'this sport will talk about for eight days.';
      },
      effects: { exposure: -1.2, inventory: 0.6, autonomy: -0.4 },
      aimed: { Presidents: { exposure: -1.4 }, Fans: { tradition: 0.8 } },
    },

    /* ---------------- the money ---------------- */
    {
      id: 'sponsor-call',
      weight: 3,
      when: function (w, sit, ctx) { return fx(ctx, 'money') > 0; },
      head: 'A brand would like to attach itself to this',
      body: function (ctx) {
        return 'An eight figure offer arrived within a day, to put a name on the thing you '
          + 'just did. Not the sport, not the postseason: the RULING. They want to call it '
          + 'something. Their deck has four options and one of them is an acronym that spells a '
          + 'word.';
      },
      effects: { money: 1.4, tradition: -1, exposure: -0.4 },
      aimed: { Networks: { money: 1 }, Fans: { tradition: -1.2 } },
    },
    {
      id: 'donor-pulls',
      weight: 3,
      when: function (w, sit, ctx) { return fx(ctx, 'money') < 0 || fx(ctx, 'tradition') < -1.5; },
      head: 'A donor pulled a building',
      body: function (ctx) {
        return 'Nineteen million dollars, withdrawn by fax, for a facility at ' + school(ctx)
          + ' with the foundations already poured. The letter cites the ruling in its second '
          + 'sentence and the donor\'s grandson\'s playing time in its fourth, and the '
          + 'university has been asked not to release it, so it will be released.';
      },
      effects: { cost: 1.2, exposure: -1, money: -0.6 },
      aimed: { Presidents: { cost: -1.4 } },
    },
    {
      id: 'ticket-spike',
      weight: 3,
      when: function (w, sit, ctx) { return fx(ctx, 'inventory') > 0 || fx(ctx, 'access') > 1; },
      head: 'The secondary market went sideways',
      body: function (ctx) {
        return 'Resale prices for one November game went up eleven hundred per cent in an '
          + 'afternoon. A ticket that was ninety dollars on Monday is now more than a flight to '
          + 'get to it. Somebody who bought four in July has paid for a car. Everybody who '
          + 'actually wanted to go is now watching it on television.';
      },
      effects: { money: 1, inventory: 1, tradition: -1.2 },
      aimed: { Networks: { inventory: 1.2 }, Fans: { tradition: -1.4 } },
    },

    /* ---------------- the players ---------------- */
    {
      id: 'player-statement',
      weight: 4,
      when: function (w, sit, ctx) { return Math.abs(fx(ctx, 'labour')) >= 1; },
      head: 'The players put out a statement',
      body: function (ctx) {
        return 'Signed by three hundred and forty of them across every conference, drafted in a '
          + 'group chat over one night, and better written than anything this office has '
          + 'published in a decade. It is four paragraphs long. The third paragraph is the one '
          + 'everybody is quoting and it is about you specifically.';
      },
      effects: { labour: 0.8, exposure: -1.2 },
      aimed: { Players: { labour: 1.4 }, Presidents: { exposure: -1 } },
    },
    {
      id: 'walk-on',
      weight: 2,
      when: function (w, sit, ctx) { return fx(ctx, 'labour') > 0; },
      head: 'A walk-on became the story',
      body: function (ctx) {
        return 'A fourth string long snapper at ' + school(ctx) + ' explained the ruling on a '
          + 'podcast, correctly, in about ninety seconds, using an analogy about a pizza. It '
          + 'has been watched more times than the announcement was. He has an agent now. He is '
          + 'better at this than everybody this office employs to do it.';
      },
      effects: { labour: 0.6, inventory: 0.8, tradition: 0.6 },
      aimed: { Players: { labour: 1 }, Fans: { tradition: 0.8 } },
    },

    /* ---------------- the genuinely stupid ---------------- */
    {
      id: 'mascot-outside',
      weight: 2,
      when: function () { return true; },
      head: 'There is a mascot outside the building',
      body: function (ctx) {
        return 'He has been there since seven. He is in full costume. He is holding a sign '
          + 'about the ruling and he will not take the head off. Security cannot establish '
          + 'which school he is from, because the costume is not any of theirs, and a reporter '
          + 'has now been sent to find out.';
      },
      effects: { exposure: -0.6, tradition: 1, inventory: 0.8 },
      aimed: { Fans: { tradition: 1.4 } },
    },
    {
      id: 'barn',
      weight: 2,
      when: function () { return true; },
      head: 'It is painted on a barn',
      body: function (ctx) {
        return 'Somewhere off a state road in Kentucky, forty feet across, visible from the '
          + 'air, quoting the ruling and adding a word that is not in it. The farmer has given '
          + 'three interviews. The barn has a hashtag. Two airlines have adjusted an approach '
          + 'path and one of them says that is a coincidence.';
      },
      effects: { tradition: 1.2, exposure: -0.4 },
      aimed: { Fans: { tradition: 1.4 } },
    },
    {
      id: 'wikipedia',
      weight: 3,
      when: function () { return true; },
      head: 'Your page has been edited two thousand times',
      body: function (ctx) {
        return 'It has been locked, unlocked, and locked again. For four hours yesterday '
          + 'afternoon your occupation was listed as something this office will not repeat and '
          + 'your date of birth was 1834. Somebody has been very patiently restoring it and '
          + 'that person has now given an interview about it.';
      },
      effects: { exposure: -0.8, tradition: 0.6 },
      aimed: { Fans: { tradition: 0.8 } },
    },
    {
      id: 'named-after',
      weight: 2,
      when: function (w, sit) { return sit.standing != null && sit.standing >= 58; },
      head: 'Somebody named a child after you',
      body: function (ctx) {
        return 'Two, in fact, in the same week, in different states, both from families who '
          + 'wrote to say so. Neither of them is your first name. Both of them are your '
          + 'surname, as a first name, which is either the highest honor this sport can give '
          + 'a person or two decisions those children will be asked about for sixty years.';
      },
      effects: { tradition: 1, exposure: 0.4 },
      aimed: { Fans: { tradition: 1.2 } },
    },
    {
      id: 'goalposts',
      weight: 2,
      when: function (w, sit) { return sit.inSeason; },
      head: 'The goalposts went in the river',
      body: function (ctx) {
        return 'After Saturday, at ' + school(ctx) + ', both of them, carried about a mile and '
          + 'a half by an estimated four hundred people and put in the water. The athletic '
          + 'department has billed the student government. The student government has started a '
          + 'fundraiser. The fundraiser has raised nine times the cost of the goalposts.';
      },
      effects: { tradition: 1.4, cost: 0.4, exposure: -0.4 },
      aimed: { Fans: { tradition: 1.6 } },
    },
    {
      id: 'typo',
      weight: 3,
      when: function () { return true; },
      head: 'There is a typo in the ruling',
      body: function (ctx) {
        return 'One letter, in clause four, which changes a word into a different real word '
          + 'and changes the sentence into something between meaningless and obscene. It went '
          + 'out to every athletic department in the country and to eleven hundred reporters. '
          + 'The corrected version has been read by nobody.';
      },
      effects: { exposure: -1, autonomy: -0.4, tradition: 0.4 },
      aimed: { Presidents: { exposure: -1.2 }, Fans: { tradition: 0.8 } },
    },
    {
      id: 'ai-video',
      weight: 3,
      when: function () { return true; },
      head: 'There is a video of you saying something you did not say',
      body: function (ctx) {
        return 'It is not good. It is good enough. Ninety seconds of you announcing a version '
          + 'of this ruling that is considerably more aggressive than the actual one, in your '
          + 'voice, in an office that does not exist. Two local news stations ran it before '
          + 'anybody checked and one of them has not corrected it.';
      },
      effects: { exposure: -1.8, autonomy: -0.6 },
      aimed: { Presidents: { exposure: -1.6 } },
    },
    {
      id: 'song',
      weight: 2,
      when: function () { return true; },
      head: 'There is a country song about it',
      body: function (ctx) {
        return 'Three minutes and forty seconds, released within a week, currently the eleventh '
          + 'most played song in four states. The chorus is about this office. It is not '
          + 'complimentary and it is a genuinely good song, which is the part that is going to '
          + 'keep it alive for twenty years.';
      },
      effects: { tradition: 0.8, exposure: -1, inventory: 0.6 },
      aimed: { Fans: { tradition: 1.2 } },
    },
    {
      id: 'bowling',
      weight: 2,
      when: function () { return true; },
      head: 'A bowl game changed its name to be about this',
      body: function (ctx) {
        return 'A minor December bowl with an expiring sponsor has renamed itself after the '
          + 'ruling, as a joke, and sold out in an afternoon for the first time since 2011. '
          + 'The commissioner of the bowl has sent this office a thank you note and a hat. The '
          + 'hat has the ruling on it.';
      },
      effects: { money: 0.8, inventory: 1, tradition: -0.4 },
      aimed: { Networks: { inventory: 1 }, Fans: { tradition: 0.6 } },
    },

    /* ---------------- the ones with teeth ---------------- */
    {
      id: 'lawsuit',
      weight: 3,
      when: function (w, sit, ctx) { return fx(ctx, 'exposure') < -1 || (w.pressure.legal || 0) >= 20; },
      head: 'It was filed within the day',
      body: function (ctx) {
        return 'Forty-one pages, in a district that has not been friendly to this sport, on '
          + 'behalf of a plaintiff nobody in this office had heard of on Monday. The filing '
          + 'quotes the ruling nine times and quotes something said at media days eighteen '
          + 'months ago once, which is the sentence the lawyers keep going back to.';
      },
      effects: { exposure: -2, cost: 0.8 },
      aimed: { Presidents: { exposure: -1.8 } },
    },
    {
      id: 'loophole',
      weight: 3,
      when: function () { return true; },
      head: 'Somebody found the hole in it before Friday',
      body: function (ctx) {
        return 'A compliance officer at ' + school(ctx) + ' read clause seven properly and '
          + 'realized it permits the exact thing it was written to stop, provided you do it in '
          + 'a different order. She sent a polite email asking for confirmation. Four other '
          + 'schools have since asked the same question and none of them were polite.';
      },
      effects: { autonomy: -1, exposure: -0.8, cost: 0.6 },
      aimed: { SEC: { autonomy: 1 }, Presidents: { exposure: -1 } },
    },
    {
      id: 'copycat',
      weight: 3,
      when: function () { return true; },
      head: 'A professional league copied it',
      body: function (ctx) {
        return 'Within a month, nearly word for word, with an acknowledgement in a footnote '
          + 'nobody was supposed to read and a press release that does not mention this sport '
          + 'at all. It is the first time in living memory that anything has traveled in that '
          + 'direction and every president in the room has now mentioned it to you.';
      },
      effects: { autonomy: 1.2, tradition: 0.6, exposure: 0.6 },
      aimed: { Presidents: { autonomy: 1.2 } },
    },
    {
      id: 'immediate-reversal',
      weight: 2,
      when: function (w, sit) { return sit.shaky; },
      head: 'Two conferences say they will ignore it',
      body: function (ctx) {
        return conf(ctx) + ' and one other have published a joint statement saying they will '
          + 'proceed as though the ruling does not exist, pending "further clarification". '
          + 'There is no mechanism in the bylaws for what happens next. There has never needed '
          + 'to be one.';
      },
      effects: { autonomy: -2, exposure: -1.2 },
      aimed: { SEC: { autonomy: -1.4 }, 'Big Ten': { autonomy: -1.4 },
        Presidents: { exposure: -1.2 } },
    },
    /* ---------------- the one way door ---------------- */
    {
      id: 'came-back-elsewhere',
      weight: 3,
      when: function (w, sit) { return sit.splitRules && sit.doorShut.length > 0; },
      head: 'He came back, to the school you least wanted',
      body: function (ctx) {
        return 'Barred from returning in his own conference, eligible in the one next door, '
          + 'and he has signed with the team his old school plays in November. The graphic '
          + 'announcing it used his old jersey number. Both athletic directors have issued '
          + 'statements and one of them mentions this office by name.';
      },
      effects: { autonomy: -1.2, exposure: -1, access: -0.8 },
      aimed: { Players: { labour: 0.8 }, Presidents: { exposure: -1.2 } },
    },
    {
      id: 'eighty-men',
      weight: 3,
      when: function (w, sit) { return sit.reentry === 'closed'; },
      head: 'A newspaper found all eighty of them',
      body: function (ctx) {
        return 'Every player who declared, went undrafted and had nowhere to go back to. '
          + 'Eighty short interviews, one photograph each, published across four days as a '
          + 'series. Six of them are working night shifts. Two are back at the same high '
          + 'school they were recruited out of, coaching. It is very good journalism and it '
          + 'is about a rule with this office\'s name on it.';
      },
      effects: { exposure: -2, labour: -0.8, tradition: -0.6 },
      aimed: { Players: { labour: -1.4 }, Presidents: { exposure: -1.8 } },
    },
    {
      id: 'camp-cut',
      weight: 3,
      when: function (w, sit) { return sit.reentry === 'open'; },
      head: 'Nine of them were cut on the same afternoon',
      body: function (ctx) {
        return 'Professional camps broke on a Tuesday and by Thursday nine men who had said '
          + 'goodbye in April were back on college rosters, four of them at ' + school(ctx)
          + '\'s conference rivals. One walked into a team meeting he had a locker in fourteen '
          + 'weeks ago. Somebody filmed the room reacting and it is the best thing anybody has '
          + 'seen this year.';
      },
      effects: { inventory: 1.2, labour: 0.8, tradition: -1 },
      aimed: { Players: { labour: 1.2 }, Networks: { inventory: 1.4 }, Fans: { tradition: -1 } },
    },
    {
      id: 'the-locker',
      weight: 2,
      when: function (w, sit) { return sit.reentry !== 'closed'; },
      head: 'They never cleared out his locker',
      body: function (ctx) {
        return 'An equipment manager at ' + school(ctx) + ' left it exactly as it was in '
          + 'January, on the grounds that he had a feeling. He was right, and the photograph '
          + 'of that locker with the nameplate still on it has done more for the argument in '
          + 'favor of the open door than anything this office has ever published.';
      },
      effects: { tradition: 1.2, labour: 0.8 },
      aimed: { Fans: { tradition: 1.4 }, Players: { labour: 1 } },
    },
    /* ---------------- the venues and the names on them ---------------- */
    {
      id: 'sponsor-collapse',
      weight: 3,
      when: function (w, sit) { return sit.soldCount > 0; },
      head: 'The sponsor has stopped existing',
      body: function (ctx) {
        return 'Not gone quiet. Stopped existing. The chief executive is unreachable, the '
          + 'accounts are frozen, and the name is on eleven thousand square feet of signage '
          + 'this sport has already installed. Nobody in this office can work out whether the '
          + 'money that arrived in March is money this sport still has.';
      },
      effects: { money: -2, exposure: -1.8, cost: 1.2 },
      aimed: { Presidents: { money: -1.8, exposure: -1.6 }, Fans: { tradition: 1 } },
    },
    {
      id: 'the-roof',
      weight: 2,
      when: function (w, sit) { return !!sit.titleVenue; },
      head: 'The roof did not close',
      body: function (ctx) {
        var v = ctx.sit && ctx.sit.titleVenue;
        return 'A test run at ' + ((v && v.name) || 'the host stadium') + ' stopped the roof '
          + 'two thirds of the way across and left it there for nine hours. The building says '
          + 'it is a sensor. The building has said it is a sensor twice before. There is a '
          + 'forecast for the week of the game and everybody in this office has now looked at '
          + 'it more than once.';
      },
      effects: { exposure: -1.4, cost: 0.8 },
      aimed: { Presidents: { exposure: -1.4 }, Networks: { inventory: -0.8 } },
    },
    {
      id: 'city-parade',
      weight: 2,
      when: function (w, sit) { return !!sit.titleVenue; },
      head: 'The host city has planned a parade',
      body: function (ctx) {
        var v = ctx.sit && ctx.sit.titleVenue;
        return ((v && v.city) || 'The host city') + ' has committed to a parade, a fan '
          + 'festival, a week of free concerts and a light display on four bridges, none of '
          + 'which was in the bid and all of which they are paying for. Their tourism board '
          + 'has decided this is the week they become the city that does this. It is going to '
          + 'be enormous.';
      },
      effects: { inventory: 1.4, tradition: 1, money: 0.6 },
      aimed: { Fans: { tradition: 1.6 }, Networks: { inventory: 1.4 } },
    },
    {
      id: 'signage',
      weight: 2,
      when: function (w, sit) { return sit.soldCount > 0; },
      head: 'The signage went up with the wrong name on it',
      body: function (ctx) {
        return 'Every banner in the building, printed six weeks ago against a version of the '
          + 'deal that changed in the second week of negotiation. The sponsor is furious, the '
          + 'printer is insolvent, and a photograph of a man on a cherry picker taking down a '
          + 'forty foot letter has been the most shared image in this sport for two days.';
      },
      effects: { exposure: -1, money: -0.6, tradition: 0.8 },
      aimed: { Presidents: { exposure: -1.2 }, Fans: { tradition: 1.2 } },
    },
    {
      id: 'quiet',
      weight: 5,
      when: function () { return true; },
      head: 'Nothing happened at all',
      body: function (ctx) {
        return 'No statement, no lawsuit, no shirt. Two paragraphs on page four of one website '
          + 'and a single follow up question at a press conference on Thursday, which the coach '
          + 'answered in nine words. A ruling this office will be judged on in four years '
          + 'landed on a Tuesday and the sport went to lunch.';
      },
      effects: { exposure: 0.8 },
      aimed: { Presidents: { exposure: 0.6 } },
    },
  ];

  var BY_ID = {};
  TAILS.forEach(function (t) { BY_ID[t.id] = t; });

  /* WHAT HAPPENED NEXT, or null. Deterministic on the ruling: same term, same seed, same tail,
     because a consequence that reshuffles on reload is not a consequence.

     `ctx` is { itemId, optionId, cast, sit, edit }. `rng` is the term's own draw. */
  function roll(world, ctx, rng) {
    var sit = (ctx && ctx.sit) || {};
    var r = rng ? rng() : 0.5;
    if (r > RATE) return null;
    /* One real school off the membership, for the tails whose item had no cast to borrow. */
    ctx = ctx || {};
    if (!ctx.anySchool) {
      var names = Object.keys((world && world.membership) || {});
      if (names.length) ctx.anySchool = names[Math.floor((rng ? rng() : 0.5) * names.length) % names.length];
    }
    var pool = TAILS.filter(function (t) {
      try { return t.when(world, sit, ctx || {}); } catch (e) { return false; }
    });
    if (!pool.length) return null;
    /* NOT THE SAME ONE TWICE IN A TERM if anything else is available. The ledger's history
       does not record tails, so the world carries its own short list. */
    var seenList = (world && world.tails) || [];
    var fresh = pool.filter(function (t) { return seenList.indexOf(t.id) < 0; });
    var use = fresh.length ? fresh : pool;
    var total = use.reduce(function (t, x) { return t + (x.weight || 1); }, 0);
    var pickAt = (rng ? rng() : 0.5) * total;
    var chosen = use[use.length - 1];
    for (var i = 0; i < use.length; i++) {
      pickAt -= (use[i].weight || 1);
      if (pickAt <= 0) { chosen = use[i]; break; }
    }
    return {
      id: chosen.id,
      head: chosen.head,
      body: chosen.body(ctx || {}),
      effects: Object.assign({}, chosen.effects || {}),
      aimed: JSON.parse(JSON.stringify(chosen.aimed || {})),
    };
  }

  /* FOLD IT INTO THE RULING before the room answers, so the meters on the reaction screen are
     the meters including this. Two edits applied in sequence would deal the room two answers
     to one decision and print two sets of numbers for one press of a button. */
  function merge(edit, tail) {
    if (!tail) return edit;
    var out = {
      id: edit.id, label: edit.label,
      set: Object.assign({}, edit.set || {}),
      move: Object.assign({}, edit.move || {}),
      effects: Object.assign({}, edit.effects || {}),
      aimed: {},
      tail: tail.id,
    };
    for (var b in edit.aimed || {}) out.aimed[b] = Object.assign({}, edit.aimed[b]);
    for (var a in tail.effects) out.effects[a] = (out.effects[a] || 0) + tail.effects[a];
    for (var bl in tail.aimed) {
      out.aimed[bl] = out.aimed[bl] || {};
      for (var ax in tail.aimed[bl]) {
        out.aimed[bl][ax] = (out.aimed[bl][ax] || 0) + tail.aimed[bl][ax];
      }
    }
    for (var k in out.effects) out.effects[k] = Math.round(out.effects[k] * 100) / 100;
    if (edit.written) out.written = edit.written;
    return out;
  }

  var api = { TAILS: TAILS, BY_ID: BY_ID, roll: roll, merge: merge, RATE: RATE };
  root.PS_CFB_FALLOUT = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
