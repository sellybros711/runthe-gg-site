/*
 * scene.js - the parts of the job that happen to you rather than on your desk.
 *
 * EVERY SCREEN IN THIS MODE IS A DOCUMENT. A folder, a briefing, a report card, nine rows of
 * a room. That is right for the work and it is the whole of what the mode had, so the things
 * that ought to land as EVENTS landed as paragraphs: a conference folding, a lawsuit being
 * filed, the morning you were given the job. Each of those arrived as a card you scrolled
 * past on the way to a button.
 *
 * A SCENE IS THE OPPOSITE OF A DOCUMENT. One picture, one speaker, one line at a time, and
 * nothing else on the screen. It takes forty seconds and it cannot be skimmed, which is the
 * point: the beats that are supposed to feel like something get a form that makes you sit
 * through them, and the desk gets to stay a desk.
 *
 * ---- WHO IS ALLOWED TO SPEAK ----
 *
 * NO REAL PERSON EVER SAYS ANYTHING HERE, and that is a harder line than it looks, because
 * the obvious way to build this is the way the sports-simulator next door builds it: a
 * photograph of a broadcaster everybody knows, their name in their network's colour, and a
 * sentence they never said. It is extremely effective and it is putting words in a living
 * person's mouth. This file does not do it and never will.
 *
 * What it does instead is the thing the docket already found works. Somebody in Row 11. A
 * beat writer who has covered one locker room since before any of them were born. A morning
 * radio host with three hours to fill. An archetype with a specific enough life is funnier
 * and more useful than a borrowed celebrity, because it can be written to the moment.
 *
 * THE ONE EXCEPTION IS YOUR OWN STAFF, who are named, and are named because they recur. The
 * chief of staff is in the room on day one of the term and on the morning it ends, and a
 * person you see nine times needs something to call them. They are invented, they work for
 * you, and nobody could mistake them for a real employee of a real conference.
 *
 * ---- WHAT A SCENE COSTS ----
 *
 * NOTHING. A scene never moves a meter, never moves a bloc and never writes the ledger. It
 * is the mode's one purely expressive form, and keeping it free is what lets it fire on a
 * moment that has already been paid for elsewhere: the lawsuit that lands as a scene is the
 * same lawsuit that arrives on the desk as a crisis item, and the ruling is where the cost
 * is. A scene that also charged you would be charging twice for one event.
 *
 * Headless and dependency-free. Browser: window.PS_CFB_SCENE. Node: require('./scene.js').
 */
(function (root) {
  'use strict';

  var B = root.PS_CFB_BLOCS || (typeof require === 'function' ? require('./blocs.js') : null);

  /* ---- THE SETS ----
     A scene needs somewhere to be. These are ids; the page draws them, because a backdrop is
     a picture and a picture belongs where the pixels are. Named here so a scene can only ask
     for one that exists and a guard can walk them. */
  var SETS = ['studio', 'radio', 'paper', 'office', 'ballroom', 'stadium', 'court'];

  /* ---- THE CAST ----
     `name` is what goes on the chyron and `role` is the small grey line under it. A speaker
     also carries the set it is usually found in, so a scene that does not say otherwise still
     has somewhere to be.

     THE BLOCS ARE NOT LISTED HERE. They already exist with names and colours in blocs.js, and
     a second list of them is a second list to keep in step. `speaker()` resolves a bloc id
     through that file and a cast id through this one. */
  var CAST = {
    /* Your own people. Named, because they recur, and invented, which the header explains. */
    chief: { name: 'Dana Whitlock', role: 'Your chief of staff', c: '#f5b301', set: 'office' },
    counsel: { name: 'Marcus Vail', role: 'Counsel to the office', c: '#818cf8', set: 'office' },
    /* The press, never named, on the same principle the docket and the podium run on. */
    anchor: { name: 'The Saturday panel', role: 'National broadcast', c: '#ec4899', set: 'studio' },
    radio: { name: 'The morning show', role: 'Sports radio, and it is all they have', c: '#38bdf8', set: 'radio' },
    wire: { name: 'The wire', role: 'Filed at 6:02, no adjectives', c: '#94a3b8', set: 'paper' },
    beat: { name: 'A beat writer', role: 'Has covered one school for eleven years', c: '#22d3ee', set: 'paper' },
    student: { name: 'A student paper', role: 'The same age as the players', c: '#a78bfa', set: 'ballroom' },
    /* And the two nobody in this office can call back. */
    judge: { name: 'The court', role: 'Middle District, and it does not care about football', c: '#f87171', set: 'court' },
    crowd: { name: 'Somebody in Row 11', role: 'Has had four beers and an opinion', c: '#38bdf8', set: 'stadium' },
  };

  /* One speaker, resolved from either list. Anything unknown comes back as the wire rather
     than as nothing, because a scene that half draws is worse than one that draws plainly. */
  function speaker(id) {
    if (CAST[id]) return { id: id, name: CAST[id].name, role: CAST[id].role, c: CAST[id].c, set: CAST[id].set };
    var b = B && B.BY_ID ? B.BY_ID[id] : null;
    if (b) return { id: id, name: b.name, role: 'In the room', c: null, set: 'office' };
    return { id: 'wire', name: CAST.wire.name, role: CAST.wire.role, c: CAST.wire.c, set: 'paper' };
  }

  /* ---- reading the world ----
     Same helpers the questions use, kept short because a scene's job is to be about one
     thing. Anything that needs a paragraph of arithmetic to set up is a docket item. */
  /* Which league has folded SINCE you took the job. Null when none has, when the world
     cannot say, or when the only dead leagues were dead on arrival. */
  function goneOnYourWatch(w, sit) {
    var was = w && w.start && w.start.live;
    if (!was || !was.length || !sit || !sit.gone) return null;
    for (var i = 0; i < sit.gone.length; i++) {
      if (was.indexOf(sit.gone[i]) >= 0) return sit.gone[i];
    }
    return null;
  }

  var pct = function (n) { return Math.round((n || 0) * 100) + '%'; };
  var bn = function (n) { return '$' + (Math.round((n || 0) * 100) / 100).toFixed(2) + 'B'; };

  /* ---- THE SCENES ----
     `lines` is the whole of a scene. Each line is a speaker, a sentence and optionally a set
     of its own, and the page walks them one at a time.

     A LINE IS ONE BREATH. Two sentences at most and usually one. The form is a chyron under a
     picture and it is read at the speed somebody says it, so a paragraph in that slot is a
     paragraph nobody finishes.

     `when` gates on the world exactly the way a docket item does. `once` means the scene fires
     a single time in a term and the world remembers it. */
  var SCENES = [

    /* ================================================================
       THE MORNING YOU GET THE JOB.
       Replaces nothing: the intro screen still states what the job is and what it is graded
       on, because that is a rubric and a rubric belongs in writing. This is the forty seconds
       after you accept it, which the mode had no form for at all.
       ================================================================ */
    {
      id: 'take-office',
      once: true,
      when: function (w, L, sit) { return !!(sit && sit.firstYear) && (w.beat || 0) === 0; },
      lines: [
        { who: 'wire', set: 'paper',
          say: 'College football has a commissioner. One office, one desk, and a five year term.' },
        { who: 'wire', set: 'paper',
          say: 'Nobody has ever held this job, because until this morning it did not exist.' },
        { who: 'anchor',
          say: 'Four conferences, a hundred and thirty six schools, and one person is now '
            + 'responsible for all of it.' },
        { who: 'radio',
          say: 'My phone has not stopped since six. Not one caller thinks this is a good idea.' },
        { who: 'chief', set: 'office',
          say: 'Morning. Your first meeting moved to nine and the second one is a lawsuit.' },
        { who: 'chief', set: 'office',
          say: 'Two of the four leagues can end your term with a phone call. You will want to '
            + 'know which two.' },
        { who: 'chief', set: 'office',
          say: 'Everything that reaches this desk got here because nobody underneath us would '
            + 'touch it. That is the job.' },
      ],
    },

    /* ================================================================
       THE FIRST LAWSUIT.
       Fires on the beat the legal fuse goes off, before the crisis item lands on the desk.
       The ruling is where the cost is; this is the letter arriving.
       ================================================================ */
    {
      id: 'first-filing',
      once: true,
      when: function (w, L, sit) {
        return !!(sit && sit.lit && sit.lit.indexOf('legal') >= 0);
      },
      lines: [
        { who: 'wire', set: 'paper',
          say: 'Forty one pages were filed this morning in a district none of us could find on '
            + 'a map.' },
        { who: 'counsel', set: 'office',
          say: 'I have read it twice. The first sixteen pages are quotes from our own memos.' },
        { who: 'counsel', set: 'office',
          say: 'Two conferences have already told their people, in writing, that the rule was '
            + 'not their idea.' },
        { who: 'judge', set: 'court',
          say: 'The court has a date in eleven months and no interest whatsoever in the '
            + 'football calendar.' },
        { who: 'chief', set: 'office',
          say: 'It is on your desk. Whatever you do about it, do it before somebody else '
            + 'announces what you are doing about it.' },
      ],
    },

    /* ================================================================
       A LEAGUE GOES UNDER.
       The map already shows it. Nothing said it out loud.
       ================================================================ */
    {
      id: 'league-gone',
      once: false,
      cool: 18,
      /* A LEAGUE THAT DIED ON YOUR WATCH, which is not the same list as the leagues that
         are dead. The Pac-12 is two schools and a lawsuit in the data this mode starts
         from, so `sit.gone` is never empty and a scene gated on it alone opened day one of
         every term with a eulogy for something that folded before the player arrived.
         `world.start.live` is the leagues that were standing when the job was taken. A term
         saved before that field existed cannot tell, and does not fire: a cutscene that
         might be about the wrong thing is worse than one that does not play. */
      when: function (w, L, sit) { return !!goneOnYourWatch(w, sit); },
      cast: function (w, L, sit) { return { conf: goneOnYourWatch(w, sit) }; },
      lines: [
        { who: 'wire', set: 'paper',
          say: function (c) {
            return 'The ' + c.conf + ' has voted to dissolve. The vote was unanimous and it took '
              + 'four minutes.';
          } },
        { who: 'beat', set: 'paper',
          say: function (c) {
            return 'I have covered the ' + c.conf + ' for nineteen years. There is nobody left '
              + 'in the building to call.';
          } },
        { who: 'crowd', set: 'stadium',
          say: 'My grandfather went to that game. Where does that go now. Where does it go.' },
        { who: 'chief', set: 'office',
          say: 'The schools will land somewhere. The league does not get to land anywhere.' },
      ],
    },

    /* ================================================================
       SOMEBODY WITH A VOTE HAS STOPPED LISTENING.
       The strip on the office draws this as red crossing a line. This is the phone call that
       put it there.
       ================================================================ */
    {
      id: 'they-turned',
      once: false,
      cool: 12,
      when: function (w, L, sit) {
        var angry = L && L.coalition ? L.coalition(w) : [];
        return angry.length >= 2;
      },
      cast: function (w, L) {
        var angry = L.coalition(w);
        return { a: (B.BY_ID[angry[0]] || {}).name || angry[0],
          b: (B.BY_ID[angry[1]] || {}).name || angry[1], n: angry.length };
      },
      lines: [
        { who: 'wire', set: 'paper',
          say: function (c) {
            return c.a + ' and ' + c.b + ' held a call this evening that this office was not '
              + 'told about.';
          } },
        { who: 'anchor',
          say: 'Nobody is saying the word yet. Everybody has looked up how the word works.' },
        { who: 'chief', set: 'office',
          say: function (c) {
            return c.n + ' of them are past the line now. You need one of them back and I do '
              + 'not much mind which.';
          } },
      ],
    },

    /* ================================================================
       SOMEBODY WON IT.
       The bracket is on the year in review and it is a table. This is the confetti.
       ================================================================ */
    {
      id: 'champion',
      once: false,
      cool: 8,
      when: function (w, L, sit) {
        return !!(sit && sit.previous && sit.previous.champion) && (w.beat || 0) === 0;
      },
      cast: function (w, L, sit) {
        return { champ: sit.previous.champion, year: sit.previous.year,
          teams: (w.playoff && w.playoff.teams) || 12 };
      },
      lines: [
        { who: 'crowd', set: 'stadium',
          say: 'I have waited my entire life for this and I am going to be honest with you, I '
            + 'have not been to bed.' },
        { who: 'anchor',
          say: function (c) {
            return c.champ + ' are national champions. A ' + c.teams + ' team field and they '
              + 'came through all of it.';
          } },
        { who: 'chief', set: 'office',
          say: function (c) {
            return 'Confetti is down. The ' + c.year + ' season is closed and eleven athletic '
              + 'directors want a meeting about the format.';
          } },
      ],
    },

    /* ================================================================
       THE PLAYERS GET PAID FOR THE FIRST TIME.
       The single biggest thing this office can do, and it used to be a number changing in a
       tile.
       ================================================================ */
    {
      id: 'first-share',
      once: true,
      when: function (w) { return (w.labour && w.labour.revShare || 0) >= 0.02; },
      cast: function (w) { return { share: w.labour.revShare, pool: w.money.pool }; },
      lines: [
        { who: 'wire', set: 'paper',
          say: function (c) {
            return 'For the first time, college football will pay the people who play it. '
              + pct(c.share) + ' of ' + bn(c.pool) + ', starting next year.';
          } },
        { who: 'student', set: 'ballroom',
          say: 'I have been asking this question for three years and I did not have a follow-up '
            + 'ready.' },
        { who: 'radio',
          say: 'Somebody is going to call in and tell me this ruins it. He has called four '
            + 'times already.' },
        { who: 'chief', set: 'office',
          say: 'Eleven presidents have asked where it comes from. I have told them it comes '
            + 'from the top.' },
      ],
    },

    /* ================================================================
       THE LAST MORNING.
       Two endings and they are different scenes. Fires from the ending screen rather than
       from a beat, so `when` is never true on its own.
       ================================================================ */
    {
      id: 'served',
      once: true,
      manual: true,
      when: function () { return false; },
      lines: [
        { who: 'wire', set: 'paper',
          say: 'The first commissioner of college football leaves office today, having served '
            + 'the full term.' },
        { who: 'anchor',
          say: 'Whatever you think of the five years, somebody has to be second and they '
            + 'inherit all of it.' },
        { who: 'chief', set: 'office',
          say: 'Box is by the door. I put the four numbers on top so you can see what you did '
            + 'with them.' },
        { who: 'chief', set: 'office',
          say: 'It was a good five years to be in this building. Go and watch a game like a '
            + 'person.' },
      ],
    },
    {
      id: 'removed',
      once: true,
      manual: true,
      when: function () { return false; },
      lines: [
        { who: 'wire', set: 'paper',
          say: 'The commissioner has been removed. The statement is two sentences long and one '
            + 'of them is about the search.' },
        { who: 'anchor',
          say: 'They had the release written before the meeting. That is the part that tells '
            + 'you when this was actually decided.' },
        { who: 'crowd', set: 'stadium',
          say: 'Good. Now put it back the way it was. All of it. Every bit of it.' },
        { who: 'chief', set: 'office',
          say: 'For what it is worth, three of the things they removed you over were right.' },
      ],
    },
    /* ================================================================
       WHAT A RULING LOOKS LIKE FROM OUTSIDE THE BUILDING.

       These do not gate on the world and never turn up on their own. A docket option names
       one, and it plays between the ruling and the room: the numbers have already moved, the
       room has already answered, and this is the twenty seconds in between where the thing
       you decided actually happens to somebody.

       THE CAST IS THE DOCKET ITEM'S, not one of these scenes' own. A raid knows which two
       schools moved because the item that moved them worked it out, and a second copy of
       that arithmetic here would be a second chance to disagree with the map. Every line
       reads it defensively, because an item's cast is its own shape and a scene attached to
       the wrong one must go quiet rather than print a hole.
       ================================================================ */
    {
      id: 'r-raid', manual: true, when: function () { return false; },
      lines: [
        { who: 'wire', set: 'paper',
          say: function (c) {
            var who = c && c.schools && c.schools.length
              ? c.schools.join(' and ') : 'Two schools';
            return who + ' are leaving. The releases went out four minutes apart and said the '
              + 'same thing.';
          } },
        { who: 'beat', set: 'paper',
          say: function (c) {
            return 'I have been in the ' + ((c && c.from) || 'league') + ' office all evening. '
              + 'Nobody has come out and the lights are on.';
          } },
        { who: 'crowd', set: 'stadium',
          say: 'Ninety years. Ninety years of that game and it is a scheduling agreement now.' },
        { who: 'anchor',
          say: function (c) {
            return 'The ' + ((c && c.to) || 'other league') + ' is now the largest thing in '
              + 'American sport that is not a professional league.';
          } },
      ],
    },
    {
      id: 'r-union', manual: true, when: function () { return false; },
      lines: [
        { who: 'wire', set: 'paper',
          say: 'College football has recognised a players association. The vote was taken at '
            + 'sixty one schools and it was not close.' },
        { who: 'Players', set: 'ballroom',
          say: 'We are not asking any more. We are across the table and there is a table.' },
        { who: 'counsel', set: 'office',
          say: 'Everything after this is bargaining. That is not a warning, it is a '
            + 'description.' },
        { who: 'radio',
          say: 'Half my callers think this is the end of it. The other half are nineteen.' },
      ],
    },
    {
      id: 'r-deal', manual: true, when: function () { return false; },
      lines: [
        { who: 'wire', set: 'paper',
          say: function (c, w) {
            return 'Signed. ' + (w && w.money ? bn(w.money.pool) + ' a year' : 'A decade of money')
              + ', and every Saturday in it belongs to somebody now.';
          } },
        { who: 'anchor',
          say: 'Somewhere in this contract is the sentence that decides what time your team '
            + 'plays for the next ten years.' },
        { who: 'chief', set: 'office',
          say: 'Eleven athletic directors have already spent it. Two of them called before the '
            + 'ink.' },
      ],
    },
    {
      id: 'r-format', manual: true, when: function () { return false; },
      lines: [
        { who: 'wire', set: 'paper',
          say: function (c, w) {
            return 'The field is ' + ((w && w.playoff && w.playoff.teams) || 'bigger')
              + ' teams. It was twelve for about as long as it took everybody to get used to '
              + 'twelve.';
          } },
        { who: 'crowd', set: 'stadium',
          say: 'We are in it. I do not care how, I do not care who else is, we are in it.' },
        { who: 'beat', set: 'paper',
          say: 'The best regular season in sport just got a little less load bearing. Ask me '
            + 'in November whether that matters.' },
      ],
    },
    {
      id: 'r-bowls', manual: true, when: function () { return false; },
      lines: [
        { who: 'wire', set: 'paper',
          say: 'The tie-ins are gone. Sixteen bowl games have no contract and about six weeks '
            + 'to find out what they are for.' },
        { who: 'crowd', set: 'stadium',
          say: 'We drove eleven hours to that thing every year. Every year. My dad is in that '
            + 'stadium in a photograph.' },
        { who: 'chief', set: 'office',
          say: 'Four cities have written in. One of them enclosed the attendance figures going '
            + 'back to 1974.' },
      ],
    },
    {
      id: 'r-gambling-out', manual: true, when: function () { return false; },
      lines: [
        { who: 'wire', set: 'paper',
          say: 'College football has cut itself off from the betting industry entirely. No '
            + 'other league in the country has done it.' },
        { who: 'anchor',
          say: 'That is a great deal of money to leave on a table you are also standing on.' },
        { who: 'crowd', set: 'stadium',
          say: 'Thank you. Genuinely. My kid is nineteen and plays and he was getting messages.' },
        { who: 'counsel', set: 'office',
          say: 'It is still legal in forty states. We can decline the money. We cannot decline '
            + 'the market.' },
      ],
    },

    /* ================================================================
       AND THREE MORE THE SPORT PRODUCES ON ITS OWN.
       ================================================================ */
    {
      id: 'two-am',
      cool: 20,
      when: function (w, L, sit) {
        var r = (w && w.rules) || {};
        return !!(sit && sit.inSeason) && (r.clock !== 'running' || r.overtime !== 'twopoint');
      },
      lines: [
        { who: 'wire', set: 'paper',
          say: 'The game finished at 2:11 in the morning on the east coast. It kicked off at '
            + 'eight.' },
        { who: 'crowd', set: 'stadium',
          say: 'There were maybe four hundred of us left. I have work. I am forty one years '
            + 'old.' },
        { who: 'radio',
          say: 'Best football anybody has seen all year and nobody east of Denver watched the '
            + 'end of it.' },
        { who: 'chief', set: 'office',
          say: 'The rule you wrote did that. Not the network, not the officials. The rule.' },
      ],
    },
    {
      id: 'left-out',
      cool: 20,
      when: function (w, L, sit) {
        return !!(sit && sit.outsider && sit.week && sit.week >= 10);
      },
      cast: function (w, L, sit) {
        return { school: sit.outsider.school, conf: sit.outsider.conference,
          bids: (w.playoff && w.playoff.autobids) || 0 };
      },
      lines: [
        { who: 'wire', set: 'paper',
          say: function (c) {
            return c.school + ' is unbeaten and outside the four biggest leagues, which is a '
              + 'sentence this sport has never handled well.';
          } },
        { who: 'anchor',
          say: function (c) {
            return 'There are ' + c.bids + ' automatic bids. Everything after that is twelve '
              + 'people in a hotel in Texas.';
          } },
        { who: 'crowd', set: 'stadium',
          say: 'We have not lost. Say the thing you need us to do and we will do it. Say it.' },
      ],
    },
    {
      id: 'sold-it',
      once: true,
      when: function (w) {
        var b = (w && w.brand) || {};
        return !!(b.playoff && b.patch && b.trophy);
      },
      lines: [
        { who: 'anchor',
          say: 'There is a company name on the playoff, on the jersey and on the trophy. All '
            + 'three, in the same season.' },
        { who: 'student', set: 'ballroom',
          say: 'I counted eleven on the walk in. I stopped counting at the door.' },
        { who: 'chief', set: 'office',
          say: 'Every one of them pays for something real. That is true and it is not an '
            + 'answer.' },
      ],
    },
  ];

  var BY_ID = {};
  SCENES.forEach(function (s) { BY_ID[s.id] = s; });

  /* ---- picking one ----
     A SCENE IS NOT THE DOCKET AND DOES NOT COMPETE WITH IT. At most one plays per beat, the
     gate has to be true, and anything already seen stays seen. `cool` is beats before a
     repeatable scene may fire again, because "a league has folded" is true for the rest of
     the term and nobody wants that cutscene nine times. */
  function seenOf(world) { return (world && world.scenes) || {}; }

  function eligible(world, L, sit) {
    var seen = seenOf(world);
    var now = L && L.beatOf ? L.beatOf(world) : 0;
    return SCENES.filter(function (s) {
      if (s.manual) return false;
      if (s.once && seen[s.id] != null) return false;
      if (!s.once && seen[s.id] != null && now - seen[s.id] < (s.cool || 12)) return false;
      try {
        if (s.when && !s.when(world, L, sit || null)) return false;
        if (s.cast && !s.cast(world, L, sit || null)) return false;
      } catch (e) { return false; }
      return true;
    });
  }

  /* The one to play, which is the first eligible in declaration order. Not weighted and not
     random: these are events, the order they are written in is the order they matter in, and
     two of them coming due on the same beat is a thing that should resolve the same way every
     time it happens. */
  function next(world, L, sit) {
    var pool = eligible(world, L, sit);
    return pool.length ? pool[0] : null;
  }

  function castOf(scene, world, L, sit) {
    return scene && scene.cast ? scene.cast(world, L, sit || null) : null;
  }
  /* A LINE SEES THE CAST AND THE WORLD. The cast is what the moment is about and the world is
     what the sport looks like at the moment it happens, and a ruling's scene needs the second
     one: it plays AFTER the edit, so "the field is sixteen teams" is a fact it can read
     rather than a number it has to be handed. The first version had no world and the format
     scene said "The field is bigger teams", because a docket item with no cast handed it
     nothing and the fallback was a word rather than a number. */
  function text(v, cast, world) { return typeof v === 'function' ? v(cast, world) : v; }

  /* One scene, resolved into what the page draws: a flat list of {who, name, role, c, set,
     say}. Resolving here rather than in the page means the guards can read exactly what a
     player would see. */
  function framesOf(scene, cast, world) {
    if (!scene) return [];
    return (scene.lines || []).map(function (ln) {
      var sp = speaker(ln.who);
      return { who: sp.id, name: sp.name, role: sp.role, c: sp.c,
        set: ln.set || sp.set || 'office', say: String(text(ln.say, cast, world) || '') };
    });
  }

  /* Every string a scene can produce, for the width and prose guards, against a cast shaped
     like the real thing. */
  var SAMPLE = { conf: 'Pac-12', a: 'SEC', b: 'The presidents', n: 3, champ: 'Texas',
    year: 2027, teams: 12, share: 0.15, pool: 1.3,
    /* The ruling scenes read a DOCKET item's cast, so the sample has to carry those shapes
       too or the guards walk half the lines against nothing. */
    school: 'Boise State', bids: 5, from: 'SEC', to: 'Big Ten',
    schools: ['South Carolina', 'Tennessee'] };
  /* A world shaped like one a scene could be played against, so the guards see the same
     strings a player would rather than the fallbacks. */
  var SAMPLE_WORLD = { playoff: { teams: 16, autobids: 5 }, money: { pool: 1.42 },
    labour: { revShare: 0.15 }, rules: {}, brand: {}, posture: {} };
  function saysOf(scene) {
    return framesOf(scene, SAMPLE, SAMPLE_WORLD).map(function (f) { return f.say; });
  }

  var api = { SCENES: SCENES, BY_ID: BY_ID, CAST: CAST, SETS: SETS,
    speaker: speaker, eligible: eligible, next: next, castOf: castOf, framesOf: framesOf,
    text: text, saysOf: saysOf };
  root.PS_CFB_SCENE = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
