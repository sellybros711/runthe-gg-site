/*
 * achievements.js - the trophy case for College Football: Perfect Season.
 *
 * DERIVED, NEVER STORED. No badge is written down. Every one is recomputed from the rows
 * the game keeps for finished runs, which buys two things worth having: a badge cannot
 * drift out of step with the history it claims to describe, and adding a new one to the
 * catalogue lights it up retroactively for seasons already played.
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
 * Headless and dependency-free, so the catalogue can be tested in node against real rows.
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
   */
  function buildContext(rows, resolve, nowIso) {
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
       Built once here because three tests reading it is three walks otherwise. */
    const careerSchools = new Set(), careerStates = new Set();
    for (const x of runs) {
      for (const p of x.roster) {
        if (p.school) careerSchools.add(p.school);
        if (p.home_state) careerStates.add(p.home_state);
      }
    }

    return {
      rows: asc,
      runs,
      total: rows.length,
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
      careerSchools,
      careerStates,
      awardsOf,
      badgesOf,
      has, isTrue, num,
    };
  }

  /* ---------------- the catalogue ----------------
     tier drives the colour only: bronze, silver, gold, legend.
     group drives which shelf it sits on in the trophy case. */
  const A = (id, name, desc, tier, group, test) => ({ id, name, desc, tier, group, test });

  const CATALOGUE = [
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
    A('chem_10', 'They just click', 'Finish a season with +10% chemistry or better.', 'gold', 'Roster craft',
      (c) => (c.best('chemistry_pct') || 0) >= 10),
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
  ];

  const TIER_ORDER = { bronze: 0, silver: 1, gold: 2, legend: 3 };
  const GROUPS = ['Milestones', 'Winning', 'Bowls', 'The poll', 'The conferences',
    'Roster craft', 'The roster', 'Streaks'];

  /*
   * Evaluate the whole catalogue. A test that throws counts as not earned rather than
   * taking the trophy case down with it: a badge is decoration, and a broken one must not
   * cost somebody the whole panel.
   */
  function evaluate(rows, resolve, nowIso) {
    const list = Array.isArray(rows) ? rows : [];
    const ctx = buildContext(list, resolve, nowIso);
    const earned = [], locked = [];
    for (const a of CATALOGUE) {
      let ok = false;
      try { ok = !!a.test(ctx); } catch (e) { ok = false; }
      (ok ? earned : locked).push(a);
    }
    return {
      earned, locked, total: CATALOGUE.length,
      play: ctx.play, title: ctx.title,
      stats: {
        runs: ctx.total,
        titles: ctx.titles.length,
        playoffs: ctx.count((r) => isTrue(r.made_playoffs)),
        bestRank: (function () {
          const vals = ctx.rows.map((r) => num(r.national_rank)).filter((v) => v !== null);
          return vals.length ? Math.min.apply(null, vals) : null;
        })(),
      },
    };
  }

  const api = { CATALOGUE, GROUPS, TIER_ORDER, evaluate, playStreak, titleStreak, dayKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.PS_CFB_ACH = api;
})();
