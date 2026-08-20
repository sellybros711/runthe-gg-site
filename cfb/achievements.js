/*
 * achievements.js - the trophy case for College Football: Perfect Season.
 *
 * DERIVED, NEVER STORED. No badge is written down. Every one is recomputed from the rows
 * the game keeps for finished runs, which buys two things worth having: a badge cannot
 * drift out of step with the history it claims to describe, and adding a new one to the
 * catalog lights it up retroactively for seasons already played.
 *
 * WHERE THE ROWS LIVE, AND THE HONEST LIMIT OF IT. The NFL game derives its cabinet from
 * leaderboard rows tied to an account, so a badge survives a cleared browser or a new
 * phone. This game has no account, so the rows sit in local storage instead. That is the
 * one real difference and it cuts the way you would expect: clear the browser and the
 * history goes with it. Everything downstream of the rows is the same design, so if an
 * account ever arrives here the rows can move and nothing else has to change.
 *
 * ROWS HAVE HOLES. Fields have been added over time, so a test that reads one has to treat
 * a missing value as "not known" rather than as zero. has() below is the guard, and a test
 * that cannot know its answer returns false rather than guessing.
 *
 * Headless and dependency-free, so the catalog can be tested in node against real rows.
 * Browser: window.PS_CFB_ACH. Node: require('./achievements.js').
 */
(function () {
  'use strict';

  /* ---------------- small helpers ---------------- */

  const has = (v) => v !== null && v !== undefined;
  const num = (v) => (has(v) ? Number(v) : null);
  const isTrue = (v) => v === true || v === 1 || v === 't' || v === 'true';

  /* A local calendar day, as YYYY-MM-DD. Local rather than UTC on purpose: a streak is a
     human habit, so "today" has to mean the player's today and not Greenwich's. */
  function dayKey(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const p = (n) => (n < 10 ? '0' + n : String(n));
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  const dayNumber = (key) => {
    const parts = key.split('-').map(Number);
    return Math.floor(Date.UTC(parts[0], parts[1] - 1, parts[2]) / 86400000);
  };
  const decadeOf = (season) => Math.floor(Number(season) / 10) * 10;

  /* ---------------- streaks ---------------- */

  /*
   * DAILY PLAY STREAK, counted in days on which at least one season was finished rather
   * than in seasons, so five runs in one evening is one day and cannot be farmed.
   *
   * The streak stays alive through today until a whole day is missed: if the last day
   * played was yesterday it still stands and today is the day to keep it. Counting only
   * from today would read zero every morning until you played, which teaches a player that
   * the number is noise.
   */
  function playStreak(dayKeys, todayKey) {
    if (!dayKeys.length) return { current: 0, best: 0, lastPlayed: null, playedToday: false };
    const days = dayKeys.slice().sort();
    const nums = days.map(dayNumber);
    let best = 1, run = 1;
    for (let i = 1; i < nums.length; i++) {
      run = nums[i] === nums[i - 1] + 1 ? run + 1 : 1;
      if (run > best) best = run;
    }
    const today = dayNumber(todayKey);
    const last = nums[nums.length - 1];
    let current = 0;
    if (last === today || last === today - 1) {
      current = 1;
      for (let i = nums.length - 1; i > 0; i--) {
        if (nums[i - 1] === nums[i] - 1) current++; else break;
      }
    }
    return { current, best, lastPlayed: days[days.length - 1], playedToday: last === today };
  }

  /* Titles back to back, counted in seasons rather than days. Rows arrive oldest first, so
     "current" is the tail of the list. */
  function titleStreak(rowsAsc) {
    let best = 0, run = 0;
    for (const r of rowsAsc) {
      if (isTrue(r.title_won)) { run++; if (run > best) best = run; } else run = 0;
    }
    return { current: run, best };
  }

  /* ---------------- the context every test reads ---------------- */

  /*
   * Built once and handed to every test, because forty tests each walking the row list is
   * forty walks. `resolve` turns a stored pick ("id|season") back into that player so a
   * roster test can ask about schools, seasons, positions and hardware. With no player data
   * to hand the roster-shaped fields come back empty and those tests answer false rather
   * than throwing.
   *
   * HOW MANY SEASONS IS NOT HOW MANY ROWS. The board hands back the most recent five
   * hundred along with how many there really are, so a career of six hundred arrives here
   * as five hundred rows. Counting rows would cap "finish 500 seasons" at exactly the
   * fetch size and put "finish 1,000" out of reach for everybody. opts.total is the
   * server's own count where there is one; local history has none and must not invent
   * one, because a history trimmed at four hundred has genuinely forgotten the rest.
   */
  function buildContext(rows, resolve, nowIso, opts) {
    const asc = rows.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const todayKey = dayKey(nowIso || new Date().toISOString()) || '1970-01-01';
    const dayKeys = [];
    const seenDays = Object.create(null);
    for (const r of asc) {
      const k = r.created_at ? dayKey(r.created_at) : null;
      if (k && !seenDays[k]) { seenDays[k] = 1; dayKeys.push(k); }
    }

    const runs = asc.map((r) => {
      let roster = [];
      if (resolve && Array.isArray(r.picks)) {
        roster = r.picks.map((k) => resolve(k)).filter(Boolean);
        if (roster.length !== r.picks.length) roster = [];
      }
      return { row: r, roster };
    });

    const titles = asc.filter((r) => isTrue(r.title_won));
    const awardsOf = (p) => (Array.isArray(p.awards) ? p.awards : []);
    const badgesOf = (p) => (Array.isArray(p.badges) ? p.badges : []);

    /* Everyone ever signed, across every season, for the collection badges.
       Built once here because a dozen tests reading it is a dozen walks otherwise. */
    const careerSchools = new Set(), careerStates = new Set(), careerConferences = new Set();
    const careerSeasons = new Set(), careerPlayers = new Set(), careerTeamSeasons = new Set();
    const careerBadges = new Set(), heismanNames = new Set();
    /* HOW MANY SEASONS EACH MAN HAS PLAYED FOR YOU, which the sets above cannot answer:
       they know he was signed and not how often. Counted per RUN rather than per pick,
       because a roster can only hold him once anyway and a second count would be a bug
       rather than a second season. */
    const playerRuns = new Map();
    for (const x of runs) {
      for (const p of x.roster) {
        if (p.player_id) {
          const k = String(p.player_id);
          playerRuns.set(k, (playerRuns.get(k) || 0) + 1);
        }
        if (p.school) careerSchools.add(p.school);
        if (p.home_state) careerStates.add(p.home_state);
        if (p.conference) careerConferences.add(p.conference);
        if (has(p.season)) careerSeasons.add(Number(p.season));
        if (p.player_id) careerPlayers.add(String(p.player_id));
        if (p.team_season_id) careerTeamSeasons.add(p.team_season_id);
        for (const b of badgesOf(p)) careerBadges.add(b);
        /* By NAME rather than by row, because a man who won it once can appear in the
           data for more than one season and the collection counts winners. */
        if (p.name && awardsOf(p).some((a) => /heisman/i.test(a))) heismanNames.add(p.name);
      }
    }

    /* The longest run of consecutive seasons that answer true. Seasons, not days: this
       is the shape behind "made the playoff five years running", where the gap that
       breaks it is a season that missed and not a day nobody played. */
    const runStreak = (fn) => {
      let best = 0, run = 0;
      for (const r of asc) { if (fn(r)) { run++; if (run > best) best = run; } else run = 0; }
      return best;
    };

    /* Never below the rows in hand: a stale or wrong count must not make a career look
       smaller than the seasons already on the table. */
    const claimed = opts && opts.total != null ? Number(opts.total) : null;
    const total = claimed !== null && isFinite(claimed)
      ? Math.max(claimed, rows.length) : rows.length;

    return {
      rows: asc,
      runs,
      total,
      titles,
      dayKeys,
      todayKey,
      play: playStreak(dayKeys, todayKey),
      title: titleStreak(asc),
      best: (col) => {
        const vals = asc.map((r) => num(r[col])).filter((v) => v !== null);
        return vals.length ? Math.max.apply(null, vals) : null;
      },
      least: (col) => {
        const vals = asc.map((r) => num(r[col])).filter((v) => v !== null);
        return vals.length ? Math.min.apply(null, vals) : null;
      },
      any: (fn) => asc.some(fn),
      count: (fn) => asc.filter(fn).length,
      anyRoster: (fn) => runs.some((x) => x.roster.length > 0 && fn(x.roster, x.row)),
      countRoster: (fn) => runs.filter((x) => x.roster.length > 0 && fn(x.roster, x.row)).length,
      /* Did any single roster ever hold a player carrying this statistical badge.
         The regexes are anchored at the call site, because "Led FBS in passing yards"
         and "2nd in FBS in passing yards" are different achievements. */
      anyBadge: (re) => runs.some((x) => x.roster.some((p) => badgesOf(p).some((b) => re.test(b)))),
      runStreak,
      careerSchools,
      careerStates,
      careerConferences,
      careerSeasons,
      careerPlayers,
      playerRuns,
      /* The most seasons any single man has played for you. */
      mostSeasonsWith: () => {
        let best = 0;
        playerRuns.forEach((n) => { if (n > best) best = n; });
        return best;
      },
      careerTeamSeasons,
      careerBadges,
      heismanNames,
      awardsOf,
      badgesOf,
      has, isTrue, num,
    };
  }

  /* ---------------- the catalog ----------------
     tier drives the color only: bronze, silver, gold, legend.
     group drives which shelf it sits on in the trophy case. */
  const A = (id, name, desc, tier, group, test) => ({ id, name, desc, tier, group, test });

  /* Ten team-seasons a college football fan can place from the id alone. Each one has a
     badge of its own below and they are counted together for the collector's badge, so
     the list lives here once rather than being written out twice. */
  const LANDMARKS = ['USC-2005', 'Texas-2005', 'Boise State-2006', 'Auburn-2010',
    'Florida State-2013', 'Louisville-2016', 'Oklahoma-2018', 'LSU-2019',
    'Georgia-2022', 'Michigan-2023'];
  /* Every home code in the recruiting data that is not a US state or DC: four Canadian
     provinces, two Bahamian islands and New South Wales. Forty-nine players in all, and
     they are listed rather than detected because "not one of the fifty" is a rule that
     would quietly take in Washington DC and turn a passport into a border. */
  const OVERSEAS = ['ON', 'AB', 'BC', 'PQ', 'BS', 'NSW', 'GB'];
  const fromTeamSeason = (c, id) => c.anyRoster((ros) => ros.some((p) => p.team_season_id === id));

  /* Nine seasons a fan can picture, told by the MAN rather than by the team. The landmark
     badges above are team-seasons: any player off 2005 USC earns The Bush push. These ask
     for one specific person in one specific year, which is a harder thing to be dealt and
     a better thing to be handed. Each is a badge of its own below and they are counted
     together for the collector, so the list lives here once. */
  const LANDMARK_PLAYERS = [
    ['Tim Tebow', 2007], ['Michael Crabtree', 2008], ['Robert Griffin III', 2011],
    ['Johnny Manziel', 2012], ['Marcus Mariota', 2014], ['Derrick Henry', 2015],
    ['Baker Mayfield', 2017], ['Travis Hunter', 2024], ['Ashton Jeanty', 2024],
  ];
  const fromPlayerSeason = (c, name, season) =>
    c.anyRoster((ros) => ros.some((p) => p.name === name && Number(p.season) === season));
  /* The name a fan would use to say two players are related, which is everything after the
     first word. Suffixes ride along: "Jr." is part of how that man is said out loud, and a
     rule that cut it would call a father and son the same man. */
  const surnameOf = (n) => {
    const parts = String(n || '').trim().split(/\s+/);
    return parts.length > 1 ? parts.slice(1).join(' ') : '';
  };

  const CATALOG = [
    /* --- getting started --- */
    A('first_run', 'Signing day', 'Finish your first season.', 'bronze', 'Milestones',
      (c) => c.total >= 1),
    A('runs_10', 'Regular', 'Finish 10 seasons.', 'bronze', 'Milestones', (c) => c.total >= 10),
    A('runs_50', 'Tenured', 'Finish 50 seasons.', 'silver', 'Milestones', (c) => c.total >= 50),
    A('runs_100', 'Century of seasons', 'Finish 100 seasons.', 'gold', 'Milestones', (c) => c.total >= 100),
    A('runs_250', 'Lifer', 'Finish 250 seasons.', 'legend', 'Milestones', (c) => c.total >= 250),

    /* --- winning --- */
    A('bowl_first', 'Bowl eligible', 'Reach a bowl game.', 'bronze', 'Winning',
      (c) => c.any((r) => isTrue(r.bowl))),
    A('bowl_win', 'Bowl champions', 'Win a bowl game.', 'bronze', 'Winning',
      (c) => c.any((r) => isTrue(r.bowl_won))),
    A('playoff_first', 'In the field', 'Make the College Football Playoff.', 'silver', 'Winning',
      (c) => c.any((r) => isTrue(r.made_playoffs))),
    A('title_first', 'National champions', 'Win the national championship.', 'silver', 'Winning',
      (c) => c.titles.length >= 1),
    A('title_5', 'Dynasty', 'Win 5 national championships.', 'gold', 'Winning',
      (c) => c.titles.length >= 5),
    A('title_25', 'Bear Bryant numbers', 'Win 25 national championships.', 'legend', 'Winning',
      (c) => c.titles.length >= 25),
    A('perfect', 'Perfect season', 'Go unbeaten and win it all.', 'legend', 'Winning',
      (c) => c.any((r) => isTrue(r.perfect))),
    A('perfect_2', 'Twice untouchable', 'Put together two perfect seasons.', 'legend', 'Winning',
      (c) => c.count((r) => isTrue(r.perfect)) >= 2),
    A('runner_up', 'One game short', 'Lose the national championship game.', 'silver', 'Winning',
      (c) => c.any((r) => String(r.eliminated_in || '') === 'CFP Championship')),
    A('undefeated_no_ring', 'Unbeaten, uncrowned',
      'Go unbeaten in the regular season and still not win it all.', 'gold', 'Winning',
      (c) => c.any((r) => has(r.reg_losses) && Number(r.reg_losses) === 0 && !isTrue(r.perfect))),
    A('cinderella', 'Cinderella', 'Win the title from the 9 seed or lower.', 'legend', 'Winning',
      (c) => c.any((r) => isTrue(r.title_won) && has(r.seed) && Number(r.seed) >= 9)),
    A('bye_ring', 'Rested and ready', 'Win the title as a top-four seed.', 'gold', 'Winning',
      (c) => c.any((r) => isTrue(r.title_won) && has(r.seed) && Number(r.seed) <= 4)),
    /* Eleven wins is now always enough, so the old wording could never be earned.
       Thirteenth is the seat right outside the room. */
    A('snubbed', 'Snubbed', 'Finish 13th or 14th in the country and miss the playoff.',
      'silver', 'Winning',
      (c) => c.any((r) => has(r.national_rank) && !isTrue(r.made_playoffs)
        && Number(r.national_rank) >= 13 && Number(r.national_rank) <= 14)),
    A('title_10', 'Blue blood', 'Win 10 national championships.', 'gold', 'Winning',
      (c) => c.titles.length >= 10),
    A('perfect_5', 'Era of fear', 'Put together five perfect seasons.', 'legend', 'Winning',
      (c) => c.count((r) => isTrue(r.perfect)) >= 5),
    A('playoff_10', 'Fixture in the field', 'Make the playoff 10 times.', 'silver', 'Winning',
      (c) => c.count((r) => isTrue(r.made_playoffs)) >= 10),
    A('playoff_25', 'Playoff mainstay', 'Make the playoff 25 times.', 'gold', 'Winning',
      (c) => c.count((r) => isTrue(r.made_playoffs)) >= 25),
    A('reg_perfect', 'Won out', 'Finish the regular season 12-0.', 'silver', 'Winning',
      (c) => c.any((r) => has(r.reg_losses) && Number(r.reg_losses) === 0)),
    A('seed_one', 'The favorite', 'Enter the playoff as the No. 1 seed.', 'silver', 'Winning',
      (c) => c.any((r) => isTrue(r.made_playoffs) && has(r.seed) && Number(r.seed) === 1)),
    A('seed_12_ring', 'Last team in', 'Win the title as the No. 12 seed.', 'legend', 'Winning',
      (c) => c.any((r) => isTrue(r.title_won) && has(r.seed) && Number(r.seed) === 12)),

    /* --- bowl season ---
       The tier rides on every row; WHICH bowl is only on rows written locally,
       because the board does not record the name. A named-bowl badge therefore
       lights from seasons played on this device, which the has() guard makes an
       honest "not known" rather than a wrong "no" for older rows. */
    A('bowl_ny6_win', 'New Year\'s kings', 'Win a New Year\'s Six bowl.', 'gold', 'Bowls',
      (c) => c.any((r) => isTrue(r.bowl_won) && r.bowl_tier === 'ny6')),
    A('bowl_major_win', 'January hardware', 'Win a major bowl.', 'silver', 'Bowls',
      (c) => c.any((r) => isTrue(r.bowl_won) && r.bowl_tier === 'major')),
    A('bowl_minor_win', 'Any given December', 'Win a minor bowl.', 'bronze', 'Bowls',
      (c) => c.any((r) => isTrue(r.bowl_won) && r.bowl_tier === 'minor')),
    A('bowl_rose', 'The Granddaddy', 'Win the Garland Bowl.', 'gold', 'Bowls',
      (c) => c.any((r) => isTrue(r.bowl_won) && r.bowl_key === 'garland_bowl')),
    A('bowl_sugar', 'Sweet finish', 'Win the Cane Bowl.', 'gold', 'Bowls',
      (c) => c.any((r) => isTrue(r.bowl_won) && r.bowl_key === 'cane_bowl')),
    A('bowl_orange', 'Miami nights', 'Win the Sunshine Bowl.', 'gold', 'Bowls',
      (c) => c.any((r) => isTrue(r.bowl_won) && r.bowl_key === 'sunshine_bowl')),
    A('bowl_cotton', 'Big in Texas', 'Win the Prairie Bowl.', 'gold', 'Bowls',
      (c) => c.any((r) => isTrue(r.bowl_won) && r.bowl_key === 'prairie_bowl')),
    A('bowl_fiesta', 'Desert crown', 'Win the Mesa Bowl.', 'gold', 'Bowls',
      (c) => c.any((r) => isTrue(r.bowl_won) && r.bowl_key === 'mesa_bowl')),
    A('bowl_peach', 'Georgia on top', 'Win the Orchard Bowl.', 'gold', 'Bowls',
      (c) => c.any((r) => isTrue(r.bowl_won) && r.bowl_key === 'orchard_bowl')),
    A('ny6_sweep', 'The full six', 'Win all six New Year\'s Six bowls across your seasons.',
      'legend', 'Bowls',
      (c) => new Set(c.rows.filter((r) => isTrue(r.bowl_won) && r.bowl_tier === 'ny6'
        && r.bowl_key && r.bowl_key !== 'runthegg').map((r) => r.bowl_key)).size >= 6),
    A('house_bowl', 'House invitation', 'Play in the RunThe.GG Bowl.', 'gold', 'Bowls',
      (c) => c.any((r) => r.bowl_key === 'runthegg')),
    A('house_bowl_win', 'House money', 'Win the RunThe.GG Bowl.', 'legend', 'Bowls',
      (c) => c.any((r) => isTrue(r.bowl_won) && r.bowl_key === 'runthegg')),
    A('bowl_wins_5', 'Trophy shelf', 'Win 5 bowl games.', 'silver', 'Bowls',
      (c) => c.count((r) => isTrue(r.bowl_won)) >= 5),
    A('bowl_wins_15', 'Bowl dynasty', 'Win 15 bowl games.', 'gold', 'Bowls',
      (c) => c.count((r) => isTrue(r.bowl_won)) >= 15),

    /* --- the poll --- */
    A('ranked_first', 'Ranked', 'Finish a season inside the top 25.', 'bronze', 'The poll',
      (c) => c.any((r) => has(r.national_rank) && Number(r.national_rank) <= 25)),
    A('rank_one', 'Number one', 'Finish a season ranked first in the country.', 'gold', 'The poll',
      (c) => c.any((r) => has(r.national_rank) && Number(r.national_rank) === 1)),
    A('sig_win', 'Signature win', 'Beat a ranked team.', 'bronze', 'The poll',
      (c) => c.any((r) => has(r.sig_wins) && Number(r.sig_wins) >= 1)),
    A('sig_4', 'Gauntlet', 'Beat four ranked teams in one season.', 'gold', 'The poll',
      (c) => c.any((r) => has(r.sig_wins) && Number(r.sig_wins) >= 4)),
    A('giant_killer', 'Giant killer', 'Beat a team ranked in the top five.', 'gold', 'The poll',
      (c) => c.any((r) => has(r.best_win_rank) && Number(r.best_win_rank) <= 5)),
    A('conf_champ', 'Playoff bound', 'Reach the College Football Playoff.', 'silver', 'The poll',
      (c) => c.any((r) => isTrue(r.made_playoffs))),
    A('rank_top10', 'Top ten finish', 'Finish a season ranked in the top ten.', 'silver', 'The poll',
      (c) => c.any((r) => has(r.national_rank) && Number(r.national_rank) <= 10)),
    A('sig_6', 'Murderers\' row', 'Beat six ranked teams in one season.', 'legend', 'The poll',
      (c) => c.any((r) => has(r.sig_wins) && Number(r.sig_wins) >= 6)),
    A('giant_no1', 'Kingslayer', 'Beat the No. 1 team in the country.', 'legend', 'The poll',
      (c) => c.any((r) => has(r.best_win_rank) && Number(r.best_win_rank) === 1)),

    /* --- the conferences ---
       run_mode is 'free' or 'conf:SEC' and so on, the same string the board
       stores, so these light whether the rows are local or the account's. */
    A('conf_season', 'League play', 'Finish a conference draft season.', 'bronze', 'The conferences',
      (c) => c.any((r) => /^conf:/.test(String(r.run_mode || '')))),
    A('conf_title', 'League and country', 'Win the title in a conference draft.', 'gold', 'The conferences',
      (c) => c.any((r) => isTrue(r.title_won) && /^conf:/.test(String(r.run_mode || '')))),
    A('conf_sec', 'SEC crown', 'Win the title in an SEC draft.', 'gold', 'The conferences',
      (c) => c.any((r) => isTrue(r.title_won) && r.run_mode === 'conf:SEC')),
    A('conf_bigten', 'Big Ten crown', 'Win the title in a Big Ten draft.', 'gold', 'The conferences',
      (c) => c.any((r) => isTrue(r.title_won) && r.run_mode === 'conf:Big Ten')),
    A('conf_big12', 'Big 12 crown', 'Win the title in a Big 12 draft.', 'gold', 'The conferences',
      (c) => c.any((r) => isTrue(r.title_won) && r.run_mode === 'conf:Big 12')),
    A('conf_acc', 'ACC crown', 'Win the title in an ACC draft.', 'gold', 'The conferences',
      (c) => c.any((r) => isTrue(r.title_won) && r.run_mode === 'conf:ACC')),
    A('conf_pac12', 'Pac-12 crown', 'Win the title in a Pac-12 draft.', 'gold', 'The conferences',
      (c) => c.any((r) => isTrue(r.title_won) && r.run_mode === 'conf:Pac-12')),
    A('conf_grand', 'Every league', 'Win the title in all five conference drafts.', 'legend', 'The conferences',
      (c) => new Set(c.rows.filter((r) => isTrue(r.title_won) && /^conf:/.test(String(r.run_mode || '')))
        .map((r) => r.run_mode)).size >= 5),

    /* --- roster craft --- */
    /* THE IDS NO LONGER CARRY THE NUMBER. These two thresholds have moved twice
       already, once when the cap came down and again when the hundred was
       re-anchored to the best team a player can actually draft, and each move
       orphaned an id. They are named for what they mean instead, so the next
       re-tune is a number and not a rename.
       Measured over 500 seasons drafted by taking the highest scorer on every
       board, on the rating with no ceiling under it: p50 80, p75 89, p90 94,
       p99 101, best 103. So 90 is better than three drafts in four and 100 is
       better than ninety-eight of them. */
    A('rating_loaded', 'Loaded', 'Build a team rated 90 or better.', 'silver', 'Roster craft',
      (c) => (c.best('overall') || 0) >= 90),
    A('rating_videogame', 'Video game numbers', 'Build a team rated 100 or better.',
      'legend', 'Roster craft',
      (c) => (c.best('overall') || 0) >= 100),
    /* A BADGE THAT COULD NOT BE EARNED. This was "+10% chemistry or better" and the
       engine clamps chemistry at +8%, on a curve that only approaches it: the best a
       legal roster reaches is +7.9%, and only by taking all six men from one program.
       Measured rather than reasoned, over every school in the data with the running-back
       cap and the budget enforced. Three rungs now, anchored on that measurement: the
       median roster gets about +2.5%, so +4% is a deliberate build and +7% is close to
       the ceiling. The id changed with the number because nobody could ever have held
       the old one, so there is no cabinet to disturb. */
    A('chem_built', 'They just click', 'Finish a season with +4% chemistry or better.',
      'silver', 'Roster craft',
      (c) => { const b = c.best('chemistry_pct'); return b !== null && b >= 4; }),
    A('chem_deep', 'Same page', 'Finish a season with +6% chemistry or better.', 'gold', 'Roster craft',
      (c) => { const b = c.best('chemistry_pct'); return b !== null && b >= 6; }),
    A('chem_max', 'Brothers in arms', 'Finish a season with +7% chemistry or better.',
      'legend', 'Roster craft',
      (c) => { const b = c.best('chemistry_pct'); return b !== null && b >= 7; }),
    A('chem_negative_ring', 'Strangers with rings', 'Win the title with negative chemistry.',
      'gold', 'Roster craft',
      (c) => c.any((r) => isTrue(r.title_won) && has(r.chemistry_pct) && Number(r.chemistry_pct) < 0)),
    A('perfect_draft', 'Nothing left on the board', 'Draft the best possible roster from your six spins.',
      'legend', 'Roster craft', (c) => (c.best('perfect_pct') || 0) >= 100),
    /* Both of these are a share of the budget, and the budget came down to $11M,
       so both came down with it. Under the old $14M cap they were 79% and 57% of
       it; $8.5M and $6.5M are the same two fractions of $11M. Left as they were,
       "under $11M" would have been every title ever won. */
    A('bargain_ring', 'Collective on a budget', 'Win the title spending under $8.5M.',
      'gold', 'Roster craft',
      (c) => c.any((r) => isTrue(r.title_won) && has(r.spend_musd) && Number(r.spend_musd) < 8.5)),
    A('shoestring', 'Walk-ons', 'Finish a season having spent under $6.5M.', 'silver', 'Roster craft',
      (c) => c.any((r) => has(r.spend_musd) && Number(r.spend_musd) < 6.5)),
    A('no_respin_ring', 'Took what it gave', 'Win the title without a single re-spin.',
      'gold', 'Roster craft',
      (c) => c.any((r) => isTrue(r.title_won) && has(r.respins) && Number(r.respins) === 0)),
    A('all_respin_ring', 'Worth every penny', 'Win the title after using every re-spin.',
      'gold', 'Roster craft',
      (c) => c.any((r) => isTrue(r.title_won) && has(r.respins) && Number(r.respins) >= 3)),
    A('no_chem_playoff', 'Six strangers', 'Make the playoff with zero chemistry.',
      'silver', 'Roster craft',
      (c) => c.any((r) => isTrue(r.made_playoffs) && has(r.chemistry_pct) && Number(r.chemistry_pct) === 0)),
    A('splash', 'Splash signing', 'Sign a player who cost $4M or more.', 'bronze', 'Roster craft',
      (c) => c.anyRoster((ros) => ros.some((p) => Number(p.price_musd) >= 4))),
    A('bargain_six', 'Bargain bin', 'Field six players who each cost $1.5M or less.',
      'silver', 'Roster craft',
      (c) => c.anyRoster((ros) => ros.every((p) => Number(p.price_musd) <= 1.5))),

    /* --- who you signed, read off the six players themselves --- */
    A('heisman', 'Heisman winner', 'Sign a Heisman Trophy winner.', 'gold', 'The roster',
      (c) => c.anyRoster((ros) => ros.some((p) => c.awardsOf(p).some((a) => /heisman/i.test(a))))),
    A('heisman_2', 'Two of them', 'Field two Heisman winners at once.', 'legend', 'The roster',
      (c) => c.anyRoster((ros) =>
        ros.filter((p) => c.awardsOf(p).some((a) => /heisman/i.test(a))).length >= 2)),
    A('led_fbs', 'Led the nation', 'Sign a player who led FBS in something.', 'silver', 'The roster',
      (c) => c.anyRoster((ros) => ros.some((p) => c.badgesOf(p).some((b) => /^led fbs/i.test(b))))),
    A('one_school', 'Company men', 'Field six players from a single school.', 'gold', 'The roster',
      (c) => c.anyRoster((ros) => new Set(ros.map((p) => p.school)).size === 1)),
    A('six_schools', 'Six different helmets', 'Field six players from six different schools.',
      'silver', 'The roster',
      (c) => c.anyRoster((ros) => new Set(ros.map((p) => p.school)).size === 6)),
    A('same_team_season', 'Reunion', 'Field two players from the very same team and season.',
      'silver', 'The roster',
      (c) => c.anyRoster((ros) => {
        const seen = Object.create(null);
        for (const p of ros) {
          const k = p.school + '|' + p.season;
          if (seen[k]) return true;
          seen[k] = 1;
        }
        return false;
      })),
    A('one_decade', 'Period piece', 'Field six players from a single decade.', 'silver', 'The roster',
      (c) => c.anyRoster((ros) => new Set(ros.map((p) => decadeOf(p.season))).size === 1)),
    A('three_decades', 'Across the ages', 'Field players from three different decades.',
      'gold', 'The roster',
      (c) => c.anyRoster((ros) => new Set(ros.map((p) => decadeOf(p.season))).size >= 3)),
    A('one_season', 'Class of one year', 'Field six players from the same season.', 'gold', 'The roster',
      (c) => c.anyRoster((ros) => new Set(ros.map((p) => Number(p.season))).size === 1)),
    A('six_states', 'National recruiting', 'Field six players from six different home states.',
      'gold', 'The roster',
      (c) => c.anyRoster((ros) => {
        const st = ros.map((p) => p.home_state).filter(Boolean);
        return st.length === ros.length && new Set(st).size === 6;
      })),
    A('founding_class', 'Founding class', 'Sign a player from the 2005 season.', 'bronze', 'The roster',
      (c) => c.anyRoster((ros) => ros.some((p) => Number(p.season) === 2005))),
    A('heisman_ring', 'Heisman house', 'Win the title with a Heisman winner on the roster.',
      'gold', 'The roster',
      (c) => c.anyRoster((ros, row) => isTrue(row.title_won)
        && ros.some((p) => c.awardsOf(p).some((a) => /heisman/i.test(a))))),
    A('one_conference', 'League loyal', 'Field six players all from one conference.',
      'silver', 'The roster',
      (c) => c.anyRoster((ros) => {
        const cf = ros.map((p) => p.conference).filter(Boolean);
        return cf.length === ros.length && new Set(cf).size === 1;
      })),
    A('five_conferences', 'Coast to coast', 'Field players from five different conferences at once.',
      'gold', 'The roster',
      (c) => c.anyRoster((ros) => new Set(ros.map((p) => p.conference).filter(Boolean)).size >= 5)),
    A('decade_2000s', 'Mid-2000s mixtape', 'Field six players all from the 2000s.',
      'silver', 'The roster',
      (c) => c.anyRoster((ros) => ros.every((p) => decadeOf(p.season) === 2000))),
    A('decade_2010s', 'The 2010s squad', 'Field six players all from the 2010s.',
      'silver', 'The roster',
      (c) => c.anyRoster((ros) => ros.every((p) => decadeOf(p.season) === 2010))),
    A('decade_2020s', 'Modern era', 'Field six players all from the 2020s.',
      'silver', 'The roster',
      (c) => c.anyRoster((ros) => ros.every((p) => decadeOf(p.season) === 2020))),
    A('schools_25', 'Recruiting footprint', 'Sign players from 25 different schools across your seasons.',
      'silver', 'The roster', (c) => c.careerSchools.size >= 25),
    A('schools_75', 'Everywhere man', 'Sign players from 75 different schools across your seasons.',
      'gold', 'The roster', (c) => c.careerSchools.size >= 75),
    A('states_20', 'All-American map', 'Sign players from 20 different home states across your seasons.',
      'gold', 'The roster', (c) => c.careerStates.size >= 20),

    /* --- streaks --- */
    A('streak_3', 'Getting into it', 'Play on 3 days in a row.', 'bronze', 'Streaks',
      (c) => c.play.best >= 3),
    A('streak_7', 'Every day this week', 'Play on 7 days in a row.', 'silver', 'Streaks',
      (c) => c.play.best >= 7),
    A('streak_30', 'A month straight', 'Play on 30 days in a row.', 'legend', 'Streaks',
      (c) => c.play.best >= 30),
    A('btb', 'Back to back', 'Win the title in two straight seasons.', 'gold', 'Streaks',
      (c) => c.title.best >= 2),
    A('three_peat', 'Three-peat', 'Win the title in three straight seasons.', 'legend', 'Streaks',
      (c) => c.title.best >= 3),
    A('streak_14', 'A fortnight', 'Play on 14 days in a row.', 'gold', 'Streaks',
      (c) => c.play.best >= 14),
    A('triple_day', 'Triple header', 'Finish three seasons in one day.', 'bronze', 'Streaks',
      (c) => {
        const per = Object.create(null);
        for (const r of c.rows) {
          const k = r.created_at ? dayKey(r.created_at) : null;
          if (k && (per[k] = (per[k] || 0) + 1) >= 3) return true;
        }
        return false;
      }),

    /* ==========================================================================
       THE HISTORY SHELF, and the rungs above what was already here.

       Everything in the roster section below keys off something that really
       happened: a Heisman, a season that led the country in a category, a league
       that no longer exists, a team a fan can name from the year alone. The rule
       is the one this file has always had, and it is worth restating because it
       has been broken here four times: A BADGE THAT CANNOT BE EARNED IS WORSE
       THAN NO BADGE. Three Heisman badges sat dead in this catalog for months
       because the awards join had never been run against the shipped player file,
       and a fourth asked for chemistry the engine clamps below.

       So every simultaneous-roster badge added here was solved against the real
       pool before it was written down: six slots, at most two running backs, at
       most two players from any one team-season, and the $11M cap. Two ideas died
       in that check and are not here. Three Heisman winners at once is $11.2M
       against an $11M cap, the three cheapest being Troy Smith, Travis Hunter and
       Mark Ingram, and no arrangement of the other three spots makes it fit.
       Three running backs on the field is forbidden outright by POSITION_MAX.
       ========================================================================== */

    /* --- the Heisman --- */
    A('heisman_qb', 'Stiff-arm pose', 'Sign a Heisman-winning quarterback.', 'silver', 'The roster',
      (c) => c.anyRoster((ros) => ros.some((p) => p.position === 'QB'
        && c.awardsOf(p).some((a) => /heisman/i.test(a))))),
    A('heisman_rb', 'Heisman in the backfield', 'Sign a Heisman-winning running back.',
      'gold', 'The roster',
      (c) => c.anyRoster((ros) => ros.some((p) => p.position === 'RB'
        && c.awardsOf(p).some((a) => /heisman/i.test(a))))),
    A('heisman_wr', 'Heisman on the outside', 'Sign a Heisman-winning receiver.', 'gold', 'The roster',
      (c) => c.anyRoster((ros) => ros.some((p) => p.position === 'WR'
        && c.awardsOf(p).some((a) => /heisman/i.test(a))))),
    /* Across your seasons rather than at once, because the cap stops even three from
       sharing a roster: collecting them is the only way to gather them. */
    A('heisman_5', 'Heisman collector', 'Sign 5 different Heisman winners across your seasons.',
      'gold', 'The roster', (c) => c.heismanNames.size >= 5),
    A('heisman_10', 'Half the ballot', 'Sign 10 different Heisman winners across your seasons.',
      'legend', 'The roster', (c) => c.heismanNames.size >= 10),
    A('heisman_all', 'Every stiff-arm', 'Sign all 20 Heisman winners in the game.',
      'legend', 'The roster', (c) => c.heismanNames.size >= 20),
    A('heisman_perfect', 'Heisman, unbeaten', 'Go unbeaten with a Heisman winner on the roster.',
      'legend', 'The roster',
      (c) => c.anyRoster((ros, r) => isTrue(r.perfect)
        && ros.some((p) => c.awardsOf(p).some((a) => /heisman/i.test(a))))),
    A('heisman_led', 'Hardware everywhere',
      'Field a Heisman winner and a player who led the country, at the same time.',
      'legend', 'The roster',
      (c) => c.anyRoster((ros) => ros.some((p) => c.awardsOf(p).some((a) => /heisman/i.test(a)))
        && ros.some((p) => c.badgesOf(p).some((b) => /^Led FBS in/.test(b))))),

    /* --- led the country --- */
    A('led_pass', 'Best arm in the country', 'Sign a player who led FBS in passing yards.',
      'silver', 'The roster', (c) => c.anyBadge(/^Led FBS in passing yards$/)),
    A('led_rush', 'Best legs in the country', 'Sign a player who led FBS in rushing yards.',
      'silver', 'The roster', (c) => c.anyBadge(/^Led FBS in rushing yards$/)),
    A('led_rec', 'Best hands in the country', 'Sign a player who led FBS in receiving yards.',
      'silver', 'The roster', (c) => c.anyBadge(/^Led FBS in receiving yards$/)),
    A('led_pass_td', 'Touchdown machine', 'Sign a player who led FBS in passing touchdowns.',
      'silver', 'The roster', (c) => c.anyBadge(/^Led FBS in passing TDs$/)),
    A('led_rush_td', 'Goal line king', 'Sign a player who led FBS in rushing touchdowns.',
      'silver', 'The roster', (c) => c.anyBadge(/^Led FBS in rushing TDs$/)),
    A('led_rec_td', 'End zone regular', 'Sign a player who led FBS in receiving touchdowns.',
      'silver', 'The roster', (c) => c.anyBadge(/^Led FBS in receiving TDs$/)),
    A('led_catches', 'Chain mover', 'Sign a player who led FBS in catches.',
      'silver', 'The roster', (c) => c.anyBadge(/^Led FBS in catches$/)),
    /* Checked: the cheapest three cost $10.3M together, so the other three spots have
       to come off the very bottom of the market. It fits, but only just. */
    A('triple_crown', 'Triple crown',
      'Field players who led FBS in passing, rushing and receiving yards at the same time.',
      'legend', 'The roster',
      (c) => c.anyRoster((ros) => {
        const hit = (re) => ros.some((p) => c.badgesOf(p).some((b) => re.test(b)));
        return hit(/^Led FBS in passing yards$/) && hit(/^Led FBS in rushing yards$/)
          && hit(/^Led FBS in receiving yards$/);
      })),
    A('led_three', 'Three of the best',
      'Field three players at once who each led the country in something.', 'gold', 'The roster',
      (c) => c.anyRoster((ros) => ros.filter((p) =>
        c.badgesOf(p).some((b) => /^Led FBS in/.test(b))).length >= 3)),
    A('podium_three', 'Podium sweep',
      'Field three players at once who each finished top three in the country in something.',
      'silver', 'The roster',
      (c) => c.anyRoster((ros) => ros.filter((p) =>
        c.badgesOf(p).some((b) => /^(Led|2nd in|3rd in) FBS/.test(b))).length >= 3)),
    A('led_five_kinds', 'Led it all',
      'Sign players who led the country in five different categories across your seasons.',
      'gold', 'The roster',
      (c) => [...c.careerBadges].filter((b) => /^Led FBS in/.test(b)).length >= 5),

    /* --- the round numbers a fan knows --- */
    A('four_thousand', 'Four thousand', 'Sign a 4,000-yard passer.', 'bronze', 'The roster',
      (c) => c.anyBadge(/^4,000 yard season$/)),
    A('fifteen_hundred', 'Fifteen hundred', 'Sign a 1,500-yard rusher.', 'bronze', 'The roster',
      (c) => c.anyBadge(/^1,500 yard season$/)),
    A('twelve_hundred', 'Twelve hundred', 'Sign a 1,200-yard receiver.', 'bronze', 'The roster',
      (c) => c.anyBadge(/^1,200 yards receiving$/)),
    A('eighty_catches', 'Eighty grabs', 'Sign an 80-catch receiver.', 'bronze', 'The roster',
      (c) => c.anyBadge(/^80 catches$/)),
    A('thirty_five_td', 'Thirty-five', 'Sign a passer with 35 touchdown throws.',
      'bronze', 'The roster', (c) => c.anyBadge(/^35 TD passes$/)),
    A('fifteen_td', 'Fifteen scores', 'Sign a player with 15 touchdowns.', 'bronze', 'The roster',
      (c) => c.anyBadge(/^15 touchdowns$/)),
    A('milestone_six', 'Nothing but numbers',
      'Field six players who have all hit a statistical milestone.', 'gold', 'The roster',
      (c) => c.anyRoster((ros) => ros.length >= 6 && ros.every((p) => c.badgesOf(p).length > 0))),
    A('badges_15', 'Statistician',
      'Collect 15 different statistical feats on players you have signed.', 'gold', 'The roster',
      (c) => c.careerBadges.size >= 15),

    /* --- leagues that no longer exist, and one that barely did --- */
    /* 2009 Cincinnati is the ONLY Big East team-season in the game, ten players deep. The
       wheel can land on it, and a year re-spin can be aimed at it, and almost nobody will
       ever think to. That is the badge. */
    A('big_east', 'The last Big East team',
      'Sign a player from 2009 Cincinnati, the only Big East team in the game.',
      'legend', 'The roster',
      (c) => c.anyRoster((ros) => ros.some((p) => p.conference === 'Big East'))),
    A('wac', 'Western frontier', 'Sign a player from the old Western Athletic Conference.',
      'gold', 'The roster',
      (c) => c.anyRoster((ros) => ros.some((p) => p.conference === 'Western Athletic'))),
    A('pac10', 'Before the twelve', 'Sign a player from the old Pac-10.', 'silver', 'The roster',
      (c) => c.anyRoster((ros) => ros.some((p) => p.conference === 'Pac-10'))),
    A('realignment', 'Realignment', 'Field a Pac-10 player and a Pac-12 player at the same time.',
      'gold', 'The roster',
      (c) => c.anyRoster((ros) => ros.some((p) => p.conference === 'Pac-10')
        && ros.some((p) => p.conference === 'Pac-12'))),
    A('independent', 'No league needed', 'Sign an FBS Independent.', 'bronze', 'The roster',
      (c) => c.anyRoster((ros) => ros.some((p) => p.conference === 'FBS Independents'))),
    A('maction', 'MACtion', 'Sign a Mid-American player.', 'gold', 'The roster',
      (c) => c.anyRoster((ros) => ros.some((p) => p.conference === 'Mid-American'))),
    A('sunbelt', 'Sun Belt surprise', 'Sign a Sun Belt player.', 'gold', 'The roster',
      (c) => c.anyRoster((ros) => ros.some((p) => p.conference === 'Sun Belt'))),
    A('cusa', 'Conference USA', 'Sign a Conference USA player.', 'gold', 'The roster',
      (c) => c.anyRoster((ros) => ros.some((p) => p.conference === 'Conference USA'))),
    A('mwc', 'Mountain time', 'Sign a Mountain West player.', 'silver', 'The roster',
      (c) => c.anyRoster((ros) => ros.some((p) => p.conference === 'Mountain West'))),
    A('aac', 'American made', 'Sign an American Athletic player.', 'silver', 'The roster',
      (c) => c.anyRoster((ros) => ros.some((p) => p.conference === 'American Athletic'))),
    A('conf_career_10', 'Ten leagues deep',
      'Sign players from 10 different conferences across your seasons.', 'gold', 'The roster',
      (c) => c.careerConferences.size >= 10),
    A('conf_career_all', 'Nobody left out',
      'Sign a player from all 14 conferences in the game.', 'legend', 'The roster',
      (c) => c.careerConferences.size >= 14),

    /* --- eras --- */
    A('season_2025', 'Freshest legs', 'Sign a player from the 2025 season.', 'bronze', 'The roster',
      (c) => c.anyRoster((ros) => ros.some((p) => Number(p.season) === 2025))),
    A('span_20', 'Twenty years apart',
      'Field a 2005 player and a 2025 player at the same time.', 'gold', 'The roster',
      (c) => c.anyRoster((ros) => ros.some((p) => Number(p.season) === 2005)
        && ros.some((p) => Number(p.season) === 2025))),
    A('seasons_10', 'A decade of tape', 'Sign players from 10 different seasons.',
      'silver', 'The roster', (c) => c.careerSeasons.size >= 10),
    A('seasons_all', 'Every year on file',
      'Sign a player from all 21 seasons in the game.', 'legend', 'The roster',
      (c) => c.careerSeasons.size >= 21),

    /* --- where they are from --- */
    A('state_three', 'Recruiting pipeline', 'Field three players from the same home state.',
      'bronze', 'The roster',
      (c) => c.anyRoster((ros) => {
        const n = Object.create(null);
        for (const p of ros) {
          if (p.home_state && (n[p.home_state] = (n[p.home_state] || 0) + 1) >= 3) return true;
        }
        return false;
      })),
    A('state_six', 'One state, one team', 'Field six players from the same home state.',
      'legend', 'The roster',
      (c) => c.anyRoster((ros) => {
        const st = ros.map((p) => p.home_state).filter(Boolean);
        return st.length === ros.length && new Set(st).size === 1;
      })),
    A('states_40', 'Forty states', 'Sign players from 40 different home states.',
      'legend', 'The roster', (c) => c.careerStates.size >= 40),
    /* Not "outside the fifty states", which would take in the forty-one players from
       Washington DC and make a badge about a border out of a badge about a passport. */
    A('overseas', 'Passport recruit',
      'Sign a player who grew up outside the United States.', 'gold', 'The roster',
      (c) => c.anyRoster((ros) => ros.some((p) => OVERSEAS.indexOf(p.home_state) >= 0))),

    /* --- helmets --- */
    A('schools_50', 'Fifty helmets', 'Sign players from 50 different schools.',
      'gold', 'The roster', (c) => c.careerSchools.size >= 50),
    A('schools_all', 'The whole country', 'Sign a player from all 83 schools in the game.',
      'legend', 'The roster', (c) => c.careerSchools.size >= 83),
    A('blue_bloods', 'Blue blood tour',
      'Sign a player from Alabama, Ohio State, Michigan, Notre Dame, USC, Texas and Oklahoma.',
      'gold', 'The roster',
      (c) => ['Alabama', 'Ohio State', 'Michigan', 'Notre Dame', 'USC', 'Texas', 'Oklahoma']
        .every((s) => c.careerSchools.has(s))),
    A('players_100', 'Hundred signings', 'Sign 100 different players.', 'silver', 'The roster',
      (c) => c.careerPlayers.size >= 100),
    A('players_500', 'Five hundred signings', 'Sign 500 different players.',
      'gold', 'The roster', (c) => c.careerPlayers.size >= 500),

    /* --- teams a fan can name from the year alone --- */
    A('ts_usc_2005', 'The Bush push', 'Sign a player from 2005 USC.', 'gold', 'The roster',
      (c) => fromTeamSeason(c, 'USC-2005')),
    A('ts_texas_2005', 'Fourth and five', 'Sign a player from 2005 Texas.', 'gold', 'The roster',
      (c) => fromTeamSeason(c, 'Texas-2005')),
    A('ts_boise_2006', 'Statue of Liberty', 'Sign a player from 2006 Boise State.',
      'gold', 'The roster', (c) => fromTeamSeason(c, 'Boise State-2006')),
    A('ts_auburn_2010', 'Cam\'s year', 'Sign a player from 2010 Auburn.', 'gold', 'The roster',
      (c) => fromTeamSeason(c, 'Auburn-2010')),
    A('ts_fsu_2013', 'Famous Jameis', 'Sign a player from 2013 Florida State.',
      'gold', 'The roster', (c) => fromTeamSeason(c, 'Florida State-2013')),
    A('ts_louisville_2016', 'Lamar\'s Heisman year', 'Sign a player from 2016 Louisville.',
      'gold', 'The roster', (c) => fromTeamSeason(c, 'Louisville-2016')),
    A('ts_oklahoma_2018', 'Air raid at its peak', 'Sign a player from 2018 Oklahoma.',
      'gold', 'The roster', (c) => fromTeamSeason(c, 'Oklahoma-2018')),
    A('ts_lsu_2019', 'The best offense there was', 'Sign a player from 2019 LSU.',
      'gold', 'The roster', (c) => fromTeamSeason(c, 'LSU-2019')),
    A('ts_georgia_2022', 'Back to back in Athens', 'Sign a player from 2022 Georgia.',
      'gold', 'The roster', (c) => fromTeamSeason(c, 'Georgia-2022')),
    A('ts_michigan_2023', 'The team, the team, the team', 'Sign a player from 2023 Michigan.',
      'gold', 'The roster', (c) => fromTeamSeason(c, 'Michigan-2023')),
    A('landmarks_5', 'Chasing history',
      'Sign a player from five of the game\'s landmark teams.', 'legend', 'The roster',
      (c) => LANDMARKS.filter((id) => c.careerTeamSeasons.has(id)).length >= 5),
    A('landmarks_all', 'Every landmark',
      'Sign a player from all ten of the game\'s landmark teams.', 'legend', 'The roster',
      (c) => LANDMARKS.every((id) => c.careerTeamSeasons.has(id))),

    /* --- what the formation looks like --- */
    A('two_te', 'Twelve personnel', 'Field two tight ends at once.', 'silver', 'The roster',
      (c) => c.anyRoster((ros) => ros.filter((p) => p.position === 'TE').length >= 2)),
    A('four_wr', 'Air raid', 'Field four receivers at once.', 'silver', 'The roster',
      (c) => c.anyRoster((ros) => ros.filter((p) => p.position === 'WR').length >= 4)),
    A('two_backs', 'Two-back set', 'Field two running backs at once.', 'bronze', 'The roster',
      (c) => c.anyRoster((ros) => ros.filter((p) => p.position === 'RB').length >= 2)),
    A('all_four_positions', 'One of everything',
      'Field a quarterback, a running back, a receiver and a tight end at once.',
      'bronze', 'The roster',
      (c) => c.anyRoster((ros) => ['QB', 'RB', 'WR', 'TE']
        .every((pos) => ros.some((p) => p.position === pos)))),
    A('qb_and_target', 'The connection',
      'Field a quarterback and a receiver off the very same team and season.',
      'silver', 'The roster',
      (c) => c.anyRoster((ros) => ros.some((p) => p.position === 'QB'
        && ros.some((q) => (q.position === 'WR' || q.position === 'TE')
          && q.team_season_id === p.team_season_id)))),

    /* --- more milestones --- */
    A('runs_5', 'Second year', 'Finish 5 seasons.', 'bronze', 'Milestones', (c) => c.total >= 5),
    A('runs_25', 'Settled in', 'Finish 25 seasons.', 'bronze', 'Milestones', (c) => c.total >= 25),
    A('runs_500', 'Emeritus', 'Finish 500 seasons.', 'legend', 'Milestones', (c) => c.total >= 500),
    A('runs_1000', 'A thousand Septembers', 'Finish 1,000 seasons.', 'legend', 'Milestones',
      (c) => c.total >= 1000),

    /* --- more winning --- */
    A('win_9', 'Winning season', 'Finish a season with 9 wins or more.', 'bronze', 'Winning',
      (c) => c.any((r) => has(r.wins) && Number(r.wins) >= 9)),
    A('win_12', 'Twelve-win season', 'Finish a season with 12 wins or more.', 'silver', 'Winning',
      (c) => c.any((r) => has(r.wins) && Number(r.wins) >= 12)),
    A('losses_five', 'Rebuilding year', 'Finish a season with 5 losses or more.', 'bronze', 'Winning',
      (c) => c.any((r) => has(r.losses) && Number(r.losses) >= 5)),
    A('title_3', 'Three rings', 'Win 3 national championships.', 'silver', 'Winning',
      (c) => c.titles.length >= 3),
    A('title_50', 'Half a century of titles', 'Win 50 national championships.', 'legend', 'Winning',
      (c) => c.titles.length >= 50),
    A('one_slip', 'One slip', 'Win the title after losing a regular-season game.',
      'silver', 'Winning',
      (c) => c.any((r) => isTrue(r.title_won) && has(r.reg_losses) && Number(r.reg_losses) >= 1)),
    A('runner_up_3', 'Always the bridesmaid', 'Lose the national championship game three times.',
      'gold', 'Winning',
      (c) => c.count((r) => String(r.eliminated_in || '') === 'CFP Championship') >= 3),
    A('out_first_round', 'One and done', 'Go out in the first round of the playoff.',
      'bronze', 'Winning',
      (c) => c.any((r) => String(r.eliminated_in || '') === 'CFP First Round')),
    A('out_quarter', 'Quarterfinal exit', 'Go out in the quarterfinals.', 'bronze', 'Winning',
      (c) => c.any((r) => String(r.eliminated_in || '') === 'CFP Quarterfinal')),
    A('out_semi', 'One game from the final', 'Go out in the semifinals.', 'silver', 'Winning',
      (c) => c.any((r) => String(r.eliminated_in || '') === 'CFP Semifinal')),
    A('every_exit', 'Every way to go out',
      'Be knocked out in all four playoff rounds across your seasons.', 'gold', 'Winning',
      (c) => ['CFP First Round', 'CFP Quarterfinal', 'CFP Semifinal', 'CFP Championship']
        .every((round) => c.any((r) => String(r.eliminated_in || '') === round))),
    A('perfect_10', 'Ten perfect seasons', 'Put together ten perfect seasons.', 'legend', 'Winning',
      (c) => c.count((r) => isTrue(r.perfect)) >= 10),
    A('unbeaten_reg_5', 'Five times unbeaten', 'Finish the regular season 12-0 five times.',
      'gold', 'Winning',
      (c) => c.count((r) => has(r.reg_losses) && Number(r.reg_losses) === 0) >= 5),
    A('playoff_50', 'Fifty trips', 'Make the playoff 50 times.', 'gold', 'Winning',
      (c) => c.count((r) => isTrue(r.made_playoffs)) >= 50),

    /* --- more bowl season ---
       Same caveat as the block above: WHICH bowl is only on rows written locally,
       because the board does not record the name. */
    A('bowl_lose', 'Wrong end of December', 'Lose a bowl game.', 'bronze', 'Bowls',
      (c) => c.any((r) => isTrue(r.bowl) && has(r.bowl_won) && !isTrue(r.bowl_won))),
    A('bowl_tiers_all', 'All three tiers', 'Win a bowl at every tier.', 'silver', 'Bowls',
      (c) => ['ny6', 'major', 'minor']
        .every((t) => c.any((r) => isTrue(r.bowl_won) && r.bowl_tier === t))),
    A('bowl_spud', 'Blue turf', 'Win the Spud Bowl.', 'gold', 'Bowls',
      (c) => c.any((r) => isTrue(r.bowl_won) && r.bowl_key === 'spud_bowl')),
    A('bowl_diamond', 'Last flight of the year', 'Win the Diamond Head Bowl.', 'gold', 'Bowls',
      (c) => c.any((r) => isTrue(r.bowl_won) && r.bowl_key === 'diamond_head_bowl')),
    A('bowl_paradise', 'Palm trees past the end zone', 'Win the Paradise Bowl.', 'gold', 'Bowls',
      (c) => c.any((r) => isTrue(r.bowl_won) && r.bowl_key === 'paradise_bowl')),
    A('bowl_salute', 'Anchors aweigh', 'Win the Salute Bowl.', 'gold', 'Bowls',
      (c) => c.any((r) => isTrue(r.bowl_won) && r.bowl_key === 'salute_bowl')),
    A('bowl_commonwealth', 'Off the green wall', 'Win the Commonwealth Bowl.', 'gold', 'Bowls',
      (c) => c.any((r) => isTrue(r.bowl_won) && r.bowl_key === 'commonwealth_bowl')),
    A('bowl_frontera', 'Shadow of the Franklins', 'Win the Frontera Bowl.', 'gold', 'Bowls',
      (c) => c.any((r) => isTrue(r.bowl_won) && r.bowl_key === 'frontera_bowl')),
    A('bowl_ballpark', 'Football in the Bronx', 'Win the Ballpark Bowl.', 'gold', 'Bowls',
      (c) => c.any((r) => isTrue(r.bowl_won) && r.bowl_key === 'ballpark_bowl')),
    A('bowls_played_10', 'Bowl season regular', 'Play in 10 different bowls.', 'silver', 'Bowls',
      (c) => new Set(c.rows.filter((r) => r.bowl_key).map((r) => r.bowl_key)).size >= 10),
    A('bowl_names_10', 'Ten different trophies', 'Win 10 different bowls.', 'gold', 'Bowls',
      (c) => new Set(c.rows.filter((r) => isTrue(r.bowl_won) && r.bowl_key)
        .map((r) => r.bowl_key)).size >= 10),
    A('bowl_names_20', 'Twenty different trophies', 'Win 20 different bowls.', 'legend', 'Bowls',
      (c) => new Set(c.rows.filter((r) => isTrue(r.bowl_won) && r.bowl_key)
        .map((r) => r.bowl_key)).size >= 20),
    A('bowl_wins_30', 'Bowl institution', 'Win 30 bowl games.', 'legend', 'Bowls',
      (c) => c.count((r) => isTrue(r.bowl_won)) >= 30),

    /* --- more of the poll --- */
    A('rank_25', 'Last one in the poll', 'Finish a season ranked 25th.', 'bronze', 'The poll',
      (c) => c.any((r) => has(r.national_rank) && Number(r.national_rank) === 25)),
    A('rank_top5', 'Top five finish', 'Finish a season ranked in the top five.',
      'silver', 'The poll',
      (c) => c.any((r) => has(r.national_rank) && Number(r.national_rank) <= 5)),
    A('rank_2', 'Second best', 'Finish a season ranked second in the country.',
      'silver', 'The poll',
      (c) => c.any((r) => has(r.national_rank) && Number(r.national_rank) === 2)),
    A('rank1_5', 'Five times number one', 'Finish first in the country 5 times.',
      'gold', 'The poll',
      (c) => c.count((r) => has(r.national_rank) && Number(r.national_rank) === 1) >= 5),
    A('rank1_25', 'Nobody else gets a turn', 'Finish first in the country 25 times.',
      'legend', 'The poll',
      (c) => c.count((r) => has(r.national_rank) && Number(r.national_rank) === 1) >= 25),
    A('top10_10', 'Perennial contender', 'Finish in the top ten 10 times.', 'gold', 'The poll',
      (c) => c.count((r) => has(r.national_rank) && Number(r.national_rank) <= 10) >= 10),
    A('best_win_top3', 'Big scalp', 'Beat a team ranked in the top three.', 'gold', 'The poll',
      (c) => c.any((r) => has(r.best_win_rank) && Number(r.best_win_rank) <= 3)),

    /* --- more of the conferences --- */
    A('conf_seasons_10', 'League regular', 'Finish 10 conference draft seasons.',
      'bronze', 'The conferences',
      (c) => c.count((r) => /^conf:/.test(String(r.run_mode || ''))) >= 10),
    A('conf_all_played', 'Toured the country', 'Play a draft in all five conferences.',
      'silver', 'The conferences',
      (c) => new Set(c.rows.filter((r) => /^conf:/.test(String(r.run_mode || '')))
        .map((r) => r.run_mode)).size >= 5),
    A('conf_playoff', 'League in the field', 'Make the playoff in a conference draft.',
      'bronze', 'The conferences',
      (c) => c.any((r) => isTrue(r.made_playoffs) && /^conf:/.test(String(r.run_mode || '')))),
    A('conf_bowl', 'League bowl win', 'Win a bowl in a conference draft.',
      'bronze', 'The conferences',
      (c) => c.any((r) => isTrue(r.bowl_won) && /^conf:/.test(String(r.run_mode || '')))),
    A('conf_perfect', 'Perfect in league play', 'Put together a perfect season in a conference draft.',
      'legend', 'The conferences',
      (c) => c.any((r) => isTrue(r.perfect) && /^conf:/.test(String(r.run_mode || '')))),
    A('conf_titles_10', 'League dynasty', 'Win 10 titles in conference drafts.',
      'gold', 'The conferences',
      (c) => c.count((r) => isTrue(r.title_won) && /^conf:/.test(String(r.run_mode || ''))) >= 10),

    /* --- more roster craft --- */
    A('rating_stacked', 'Stacked', 'Build a team rated 95 or better.', 'gold', 'Roster craft',
      (c) => (c.best('overall') || 0) >= 95),
    A('perfect_pct_90', 'Nearly optimal',
      'Draft 90% of the best possible roster from your six spins.', 'silver', 'Roster craft',
      (c) => (c.best('perfect_pct') || 0) >= 90),
    A('spend_under_5', 'Pocket change', 'Finish a season having spent under $5M.',
      'gold', 'Roster craft',
      (c) => { const l = c.least('spend_musd'); return l !== null && l < 5; }),
    A('spend_all', 'Every last dollar', 'Finish a season having spent $10.9M or more.',
      'bronze', 'Roster craft',
      (c) => { const b = c.best('spend_musd'); return b !== null && b >= 10.9; }),
    A('bargain_ultra', 'Under a million a man',
      'Field six players who each cost $1M or less.', 'gold', 'Roster craft',
      (c) => c.anyRoster((ros) => ros.length >= 6 && ros.every((p) => Number(p.price_musd) <= 1))),
    A('two_splash', 'Two big cheques', 'Field two players who each cost $4M or more.',
      'gold', 'Roster craft',
      (c) => c.anyRoster((ros) => ros.filter((p) => Number(p.price_musd) >= 4).length >= 2)),
    A('no_respin_perfect', 'Trusted the wheel', 'Put together a perfect season with no re-spins.',
      'legend', 'Roster craft',
      (c) => c.any((r) => isTrue(r.perfect) && has(r.respins) && Number(r.respins) === 0)),

    /* --- more streaks --- */
    A('streak_60', 'Two months straight', 'Play on 60 days in a row.', 'legend', 'Streaks',
      (c) => c.play.best >= 60),
    A('day_5', 'Marathon', 'Finish five seasons in one day.', 'silver', 'Streaks',
      (c) => {
        const per = Object.create(null);
        for (const r of c.rows) {
          const k = r.created_at ? dayKey(r.created_at) : null;
          if (k && (per[k] = (per[k] || 0) + 1) >= 5) return true;
        }
        return false;
      }),
    A('day_10', 'All day', 'Finish ten seasons in one day.', 'gold', 'Streaks',
      (c) => {
        const per = Object.create(null);
        for (const r of c.rows) {
          const k = r.created_at ? dayKey(r.created_at) : null;
          if (k && (per[k] = (per[k] || 0) + 1) >= 10) return true;
        }
        return false;
      }),
    A('four_peat', 'Four in a row', 'Win the title in four straight seasons.', 'legend', 'Streaks',
      (c) => c.title.best >= 4),
    A('five_peat', 'Five in a row', 'Win the title in five straight seasons.', 'legend', 'Streaks',
      (c) => c.title.best >= 5),
    A('playoff_streak_5', 'Always in the field', 'Make the playoff five seasons running.',
      'gold', 'Streaks', (c) => c.runStreak((r) => isTrue(r.made_playoffs)) >= 5),
    A('playoff_streak_10', 'Never out of it', 'Make the playoff ten seasons running.',
      'legend', 'Streaks', (c) => c.runStreak((r) => isTrue(r.made_playoffs)) >= 10),
    A('bowl_streak_10', 'Ten straight Decembers', 'Reach a bowl ten seasons running.',
      'gold', 'Streaks', (c) => c.runStreak((r) => isTrue(r.bowl)) >= 10),
    A('rank_streak_10', 'Ten years ranked', 'Finish in the top 25 ten seasons running.',
      'gold', 'Streaks',
      (c) => c.runStreak((r) => has(r.national_rank) && Number(r.national_rank) <= 25) >= 10),

    /* --- nine seasons told by the man, not the team ---
       The landmark badges further up ask for anybody off a famous roster. These ask for
       one person in one year, which the wheel has to hand you on purpose. */
    A('man_tebow', 'Tebow in 07', 'Sign Tim Tebow\'s 2007 season, the first sophomore to win it.',
      'gold', 'The roster', (c) => fromPlayerSeason(c, 'Tim Tebow', 2007)),
    A('man_crabtree', 'One second left',
      'Sign Michael Crabtree\'s 2008 season at Texas Tech.', 'gold', 'The roster',
      (c) => fromPlayerSeason(c, 'Michael Crabtree', 2008)),
    A('man_rg3', 'Baylor\'s first', 'Sign Robert Griffin III\'s 2011 season.', 'gold', 'The roster',
      (c) => fromPlayerSeason(c, 'Robert Griffin III', 2011)),
    A('man_manziel', 'Johnny Football',
      'Sign Johnny Manziel\'s 2012 season, the first freshman to win it.', 'gold', 'The roster',
      (c) => fromPlayerSeason(c, 'Johnny Manziel', 2012)),
    A('man_mariota', 'Mariota\'s year', 'Sign Marcus Mariota\'s 2014 season at Oregon.',
      'gold', 'The roster', (c) => fromPlayerSeason(c, 'Marcus Mariota', 2014)),
    A('man_henry', 'Every single carry',
      'Sign Derrick Henry\'s 2015 season, all 395 carries of it.', 'gold', 'The roster',
      (c) => fromPlayerSeason(c, 'Derrick Henry', 2015)),
    A('man_mayfield', 'Planting the flag', 'Sign Baker Mayfield\'s 2017 season.',
      'gold', 'The roster', (c) => fromPlayerSeason(c, 'Baker Mayfield', 2017)),
    A('man_hunter', 'Both ways',
      'Sign Travis Hunter\'s 2024 season, the one he played on offense and defense.',
      'gold', 'The roster', (c) => fromPlayerSeason(c, 'Travis Hunter', 2024)),
    A('man_jeanty', 'The Boise blur', 'Sign Ashton Jeanty\'s 2024 season.',
      'gold', 'The roster', (c) => fromPlayerSeason(c, 'Ashton Jeanty', 2024)),
    A('man_all', 'The whole highlight reel',
      'Sign all nine of the seasons a fan can picture, across your career.',
      'legend', 'The roster',
      (c) => LANDMARK_PLAYERS.every(([n, y]) => fromPlayerSeason(c, n, y))),

    /* --- the shape of the six, for its own sake --- */
    A('same_surname', 'Same name, no relation',
      'Field two players who share a surname.', 'silver', 'The roster',
      (c) => c.anyRoster((ros) => {
        const seen = Object.create(null);
        for (const p of ros) {
          const s = surnameOf(p.name).toLowerCase();
          if (!s) continue;
          if (seen[s] && seen[s] !== String(p.player_id)) return true;
          seen[s] = String(p.player_id);
        }
        return false;
      })),
    A('same_initial', 'Alphabet soup',
      'Field six players from six schools that all start with the same letter.',
      'gold', 'The roster',
      (c) => c.anyRoster((ros) => {
        const schools = ros.map((p) => p.school).filter(Boolean);
        if (schools.length !== ros.length || new Set(schools).size !== 6) return false;
        return new Set(schools.map((s) => s[0].toUpperCase())).size === 1;
      })),
    A('no_names', 'Nobody you have heard of',
      'Field six players with no award and no statistical badge between them.',
      'silver', 'The roster',
      (c) => c.anyRoster((ros) => ros.length === 6
        && ros.every((p) => c.awardsOf(p).length === 0 && c.badgesOf(p).length === 0))),
    A('six_conferences', 'Six different leagues',
      'Field six players from six different conferences.', 'gold', 'The roster',
      (c) => c.anyRoster((ros) => {
        const cf = ros.map((p) => p.conference).filter(Boolean);
        return cf.length === ros.length && new Set(cf).size === 6;
      })),
    A('six_straight_years', 'Six straight years',
      'Field six players from six consecutive seasons.', 'gold', 'The roster',
      (c) => c.anyRoster((ros) => {
        const ys = ros.map((p) => Number(p.season)).filter((y) => isFinite(y));
        if (ys.length !== ros.length || new Set(ys).size !== 6) return false;
        return Math.max.apply(null, ys) - Math.min.apply(null, ys) === 5;
      })),
    /* THE BADGE THAT WAS WRITTEN AND THEN MEASURED AWAY. "Your cheapest signing outscored
       your most expensive" is the best sentence a draft can produce and it cannot be an
       honest badge here, because price is derived from production: the best man in the
       game at the minimum price averages 4.4, and only three price points above the floor
       hold anybody who scores less than that. It would have meant "your $0.3M man beat
       your $0.6M man" while saying something else, which is worse than not existing. */
    A('qb_ran_it', 'He ran it himself',
      'Sign a quarterback who gained more on the ground than through the air.',
      'silver', 'The roster',
      (c) => c.anyRoster((ros) => ros.some((p) => String(p.position).toUpperCase() === 'QB'
        && has(p.rush_ppg) && has(p.pass_ppg) && Number(p.rush_ppg) > Number(p.pass_ppg)))),
    A('then_and_now', 'Then and now',
      'Field two players from the same school fifteen seasons apart.', 'gold', 'The roster',
      (c) => c.anyRoster((ros) => {
        const by = Object.create(null);
        for (const p of ros) {
          if (!p.school || !has(p.season)) continue;
          const y = Number(p.season);
          const e = by[p.school] || (by[p.school] = { lo: y, hi: y });
          if (y < e.lo) e.lo = y;
          if (y > e.hi) e.hi = y;
          if (e.hi - e.lo >= 15) return true;
        }
        return false;
      })),
    A('your_guy', 'Your guy',
      'Sign the same player in ten different seasons.', 'gold', 'The roster',
      (c) => c.mostSeasonsWith() >= 10),

    /* --- two more the results screen can answer --- */
    A('talent_wasted', 'All that talent',
      'Miss the playoff with a team rated 95 or better.', 'silver', 'Roster craft',
      (c) => c.any((r) => !isTrue(r.made_playoffs) && has(r.overall) && Number(r.overall) >= 95)),
    A('heisman_2_ring', 'Two winners, one ring',
      'Win the title with two Heisman winners on the roster.', 'legend', 'The roster',
      (c) => c.anyRoster((ros, row) => isTrue(row.title_won)
        && ros.filter((p) => c.awardsOf(p).some((a) => /heisman/i.test(a))).length >= 2)),
  ];

  const TIER_ORDER = { bronze: 0, silver: 1, gold: 2, legend: 3 };
  const GROUPS = ['Milestones', 'Winning', 'Bowls', 'The poll', 'The conferences',
    'Roster craft', 'The roster', 'Streaks'];

  /*
   * Evaluate the whole catalog. A test that throws counts as not earned rather than
   * taking the trophy case down with it: a badge is decoration, and a broken one must not
   * cost somebody the whole panel.
   */
  function evaluate(rows, resolve, nowIso, opts) {
    const list = Array.isArray(rows) ? rows : [];
    const ctx = buildContext(list, resolve, nowIso, opts);
    const earned = [], locked = [];
    for (const a of CATALOG) {
      let ok = false;
      try { ok = !!a.test(ctx); } catch (e) { ok = false; }
      (ok ? earned : locked).push(a);
    }
    return {
      earned, locked, total: CATALOG.length,
      play: ctx.play, title: ctx.title,
      stats: {
        runs: ctx.total,
        /* How many rows this evaluation actually walked, which is not always `runs`: a
           capped fetch knows the true total from the server and holds only the most recent
           of them. Anything expressed as a RATE has to divide by this rather than by the
           total, or a career of six hundred seasons reads as a 10% playoff rate because
           only five hundred were counted. */
        shown: ctx.rows.length,
        titles: ctx.titles.length,
        playoffs: ctx.count((r) => isTrue(r.made_playoffs)),
        bestRank: (function () {
          const vals = ctx.rows.map((r) => num(r.national_rank)).filter((v) => v !== null);
          return vals.length ? Math.min.apply(null, vals) : null;
        })(),
        /* THREE MORE, because the career row read four numbers where the NFL game reads
           six, and the three it was missing are the ones a player checks: how good was my
           best team, what is my best record, and how many perfect seasons. All three come
           off the same walk this function is already doing. */
        perfect: ctx.count((r) => isTrue(r.perfect)),
        bestOverall: (function () {
          const vals = ctx.rows.map((r) => num(r.overall)).filter((v) => v !== null);
          return vals.length ? Math.max.apply(null, vals) : null;
        })(),
        /* Most wins, then fewest losses. Not the board's score, which tie-breaks on point
           difference: rowFromBoard does not keep point_diff, and a career headline that
           disagreed with the board over which 12-1 was better would be worse than one that
           does not try to rank them at all. */
        bestRec: (function () {
          let best = null;
          for (const r of ctx.rows) {
            const w = num(r.wins), l = num(r.losses);
            if (w === null || l === null) continue;
            if (!best || w > best.w || (w === best.w && l < best.l)) best = { w, l };
          }
          return best ? best.w + '-' + best.l : null;
        })(),
      },
    };
  }

  const api = { CATALOG, GROUPS, TIER_ORDER, evaluate, playStreak, titleStreak, dayKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.PS_CFB_ACH = api;
})();
