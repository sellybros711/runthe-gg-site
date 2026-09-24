/* Run The Diamond: achievements and streaks.
 *
 * Derive-everything design: the game persists only compact per-season rows;
 * every badge, streak, and career stat is recomputed from those rows on
 * demand. A newly-added badge lights up retroactively, and no badge can drift
 * out of sync with the history it describes.
 *
 * Browser: window.RTD_ACH. Node: require('./achievements.js').
 * A run row (written by index.html recordRun) looks like:
 *   { ts, wins, losses, titleWon, madePlayoffs, seedLabel, isGOAT, beatRecord,
 *     rating, allTimeRank, chemPct, spend, respins, efficiency, archetype,
 *     chemLinks, era, franchise, division, capSurvivor, cuts, staff,
 *     tradeMachine, trades, daily, eliminatedWS, picks:[{ i, s, t, slot, w }] }
 * Rows have holes (fields added over time), so tests treat missing as
 * "unknown", never as a hard zero.
 *
 * A BADGE MAY ONLY ASK ABOUT SOMETHING THAT REACHES A ROW. That is the whole
 * constraint on this file and it is what makes the cabinet retroactive: a run's
 * shape is stored once and every shelf is a question about it. The game knows
 * far more than this while it is being played (who was on the mound in game 140,
 * which offer was declined) and none of that is written down, so no badge asks.
 *
 * AND A BADGE HAS TO BE REACHABLE. `check-badges.mjs` plays real runs through
 * run.js across every mode and every way of drafting, turns each into the row
 * this file would store, and names anything nothing lit. The hoops catalog is
 * why: its first draft asked for three things that game could not produce, and
 * NOTHING FAILED, because a badge nobody can earn throws no error and breaks no
 * test. Two lists excuse a rung the bots cannot reach, GRIND for more of a
 * proved thing and SKILL for a feat no bot is good enough for, and neither is a
 * free pass.
 */
'use strict';
(function () {

const TIERS = { bronze: 'bronze', silver: 'silver', gold: 'gold', legend: 'legend' };

/* An achievement: id, name, description, tier (color), group (shelf), test. */
function A(id, name, desc, tier, group, test) {
  return { id, name, desc, tier, group, test };
}

/* A shelf, written once instead of on every row of it. The group is the only
   thing every badge on a shelf has in common, so it is the only thing worth
   factoring out: a badge's NAME is the whole of what a player reads, and a
   generated one reads like a receipt. */
function shelf(group, list) {
  return list.map(([id, name, desc, tier, test]) => A(id, name, desc, tier, group, test));
}

const GROUPS = ['Milestones', 'Winning', 'October', 'The all-time list',
  'Roster craft', 'The roster', 'The modes', 'The daily', 'Streaks'];

// Helpers over a single row -----------------------------------------------
const decadeOf = (s) => Math.floor(s / 10) * 10;
const uniq = (arr) => [...new Set(arr)];
function picks(row) { return Array.isArray(row.picks) ? row.picks : []; }
function warOf(p) { return (p && typeof p.w === 'number' && isFinite(p.w)) ? p.w : null; }

/* Every decade the pool holds. Written out here rather than read off the engine
   because this file is loaded on its own by the checkers, and a shelf that went
   quiet when engine.js was absent would be a cabinet depending on a file it does
   not need. check-badges.mjs asserts the two lists agree. */
const DECADES = [1900, 1910, 1920, 1930, 1940, 1950, 1960, 1970, 1980, 1990,
  2000, 2010, 2020];
const DECADE_NAME = (d) => d + 's';

/* THE SEVEN WAYS TO PLAY, and Classic is derived rather than flagged: a run that
   is none of the six is the quick draft, so a seventh flag on the row would be a
   second copy of an answer the other six already give.
   Six of these were recorded on the row from the day each mode shipped and not
   one badge asked about any of them, which is this cabinet's own version of a
   door nobody built: the data was there and the shelf was not. */
const MODES = [
  ['classic', 'Classic'],
  ['era', 'Eras Draft'],
  ['franchise', 'One Franchise'],
  ['division', 'Division Draft'],
  ['survivor', 'Salary Cap Survivor'],
  ['staff', 'All-Time Staff'],
  ['trade', 'The Trade Machine'],
];
function modeKeyOf(r) {
  if (r.era) return 'era';
  if (r.franchise) return 'franchise';
  if (r.division) return 'division';
  if (r.capSurvivor) return 'survivor';
  if (r.staff) return 'staff';
  if (r.tradeMachine) return 'trade';
  return 'classic';
}
/* The daily is NOT one of the seven. It is a Classic draft on a pinned seed, so
   filing it as a mode of its own would take every daily out of the Classic count
   and leave a player who only plays the daily with an empty Classic shelf. */

// ── the catalogue ─────────────────────────────────────────────────────────
const CATALOGUE = [].concat(

shelf('Milestones', [
  ['first_run', 'Play ball', 'Finish your first season.', 'bronze', (c) => c.n >= 1],
  ['runs_5', 'Settling in', 'Finish 5 seasons.', 'bronze', (c) => c.n >= 5],
  ['runs_10', 'Regular', 'Finish 10 seasons.', 'bronze', (c) => c.n >= 10],
  ['runs_25', 'Everyday player', 'Finish 25 seasons.', 'silver', (c) => c.n >= 25],
  ['runs_50', 'Skipper', 'Finish 50 seasons.', 'silver', (c) => c.n >= 50],
  ['runs_100', 'A hundred summers', 'Finish 100 seasons.', 'gold', (c) => c.n >= 100],
  ['runs_150', 'Lifer', 'Finish 150 seasons.', 'legend', (c) => c.n >= 150],
  ['runs_250', 'Franchise fixture', 'Finish 250 seasons.', 'legend', (c) => c.n >= 250],
  ['cwins_500', 'Five hundred', 'Win 500 games across every season.', 'bronze',
    (c) => c.careerWins >= 500],
  ['cwins_1000', 'Four figures', 'Win 1,000 games across every season.', 'silver',
    (c) => c.careerWins >= 1000],
  ['cwins_2500', 'Twenty-five hundred', 'Win 2,500 games across every season.', 'gold',
    (c) => c.careerWins >= 2500],
  ['cwins_5000', 'Five thousand', 'Win 5,000 games across every season.', 'gold',
    (c) => c.careerWins >= 5000],
  ['cwins_10000', 'Ten thousand', 'Win 10,000 games across every season.', 'legend',
    (c) => c.careerWins >= 10000],
  ['all_modes', 'Tried everything', 'Finish a season in all seven ways to play.', 'gold',
    (c) => MODES.every(([k]) => (c.modeRuns[k] || 0) >= 1)],
  ['all_modes_oct', 'October everywhere', 'Reach October in all seven ways to play.', 'legend',
    (c) => MODES.every(([k]) => (c.modeOct[k] || 0) >= 1)],
]),

shelf('Winning', [
  ['win_82', 'Over .500', 'Win 82 games in a season.', 'bronze', (c) => c.best.wins >= 82],
  ['win_85', 'In the race', 'Win 85 games in a season.', 'bronze', (c) => c.best.wins >= 85],
  ['win_90', '90 wins', 'Win 90 games in a season.', 'bronze', (c) => c.best.wins >= 90],
  ['win_95', 'Ninety-five', 'Win 95 games in a season.', 'silver', (c) => c.best.wins >= 95],
  ['win_100', 'Hundred-win club', 'Win 100 games in a season.', 'silver', (c) => c.best.wins >= 100],
  ['win_105', 'Runaway', 'Win 105 games in a season.', 'gold', (c) => c.best.wins >= 105],
  ['win_110', 'Juggernaut', 'Win 110 games in a season.', 'gold', (c) => c.best.wins >= 110],
  ['tie_record', 'Immortal', 'Match the all-time record (116 wins).', 'legend',
    (c) => c.rows.some((r) => r.beatRecord)],
  ['goat', 'Greatest of all time', 'Win 117 games or more, the best ever.', 'legend',
    (c) => c.rows.some((r) => r.isGOAT)],
  ['win_title', 'World Series Champions', 'Win the World Series.', 'gold',
    (c) => c.titles >= 1],
  ['title_2', 'Dynasty', 'Win the title in two different seasons.', 'gold',
    (c) => c.titles >= 2],
  ['title_3', 'Three rings', 'Win the title three times.', 'gold', (c) => c.titles >= 3],
  ['title_5', 'Five rings', 'Win the title five times.', 'legend', (c) => c.titles >= 5],
  ['title_10', 'Ten rings', 'Win the title ten times.', 'legend', (c) => c.titles >= 10],
  ['lose_100', 'Rebuilding year', 'Lose 100 games in a season.', 'bronze',
    (c) => c.worst.losses >= 100],
  ['lose_110', 'Not our year', 'Lose 110 games in a season.', 'silver',
    (c) => c.worst.losses >= 110],
  /* Both ends of the same season, which is the shape of a career rather than of
     one run: the point is that you kept going after the bad one. */
  ['both_ends', 'Feast and famine', 'Win 100 in one season and lose 100 in another.', 'silver',
    (c) => c.best.wins >= 100 && c.worst.losses >= 100],
]),

shelf('October', [
  ['made_playoffs', 'October baseball', 'Reach the playoffs.', 'bronze',
    (c) => c.octobers >= 1],
  ['oct_5', 'Perennial', 'Reach the playoffs 5 times.', 'bronze', (c) => c.octobers >= 5],
  ['oct_10', 'Regular in October', 'Reach the playoffs 10 times.', 'silver', (c) => c.octobers >= 10],
  ['oct_25', 'October is yours', 'Reach the playoffs 25 times.', 'gold', (c) => c.octobers >= 25],
  ['oct_50', 'Fifty Octobers', 'Reach the playoffs 50 times.', 'legend', (c) => c.octobers >= 50],
  ['seed_division', 'Division winner', 'Take a division title and the bye with it.', 'bronze',
    (c) => c.rows.some((r) => r.seedLabel === 'Division winner')],
  ['seed_wildcard', 'In by a game', 'Reach October as a wild card.', 'bronze',
    (c) => c.rows.some((r) => r.seedLabel === 'Wild card')],
  ['wildcard_title', 'Cinderella', 'Win it all as a wild card.', 'legend',
    (c) => c.rows.some((r) => r.titleWon && r.seedLabel === 'Wild card')],
  ['runner_up', 'So close', 'Lose in the World Series.', 'silver',
    (c) => c.wsLosses >= 1],
  ['runner_up_3', 'Always the bridesmaid', 'Lose the World Series three times.', 'gold',
    (c) => c.wsLosses >= 3],
  ['title_and_loss', 'Both sides of it', 'Win a World Series and lose one.', 'silver',
    (c) => c.titles >= 1 && c.wsLosses >= 1],
]),

shelf('The all-time list', [
  ['rank_top1000', 'On the list', 'Build a top-1000 team of all time.', 'bronze',
    (c) => c.bestRank != null && c.bestRank <= 1000],
  ['rank_top500', 'Top 500', 'Build a top-500 team of all time.', 'bronze',
    (c) => c.bestRank != null && c.bestRank <= 500],
  ['rank_top100', 'Top 100', 'Build a top-100 team of all time.', 'bronze',
    (c) => c.bestRank != null && c.bestRank <= 100],
  ['rank_top50', 'Top 50', 'Build a top-50 team of all time.', 'silver',
    (c) => c.bestRank != null && c.bestRank <= 50],
  ['rank_top10', 'Top 10', 'Build a top-10 team of all time.', 'gold',
    (c) => c.bestRank != null && c.bestRank <= 10],
  ['rank_top3', 'Podium', 'Build a top-3 team of all time.', 'legend',
    (c) => c.bestRank != null && c.bestRank <= 3],
  ['rank_one', 'Greatest ever assembled', 'Build the number one team of all time.', 'legend',
    (c) => c.bestRank != null && c.bestRank <= 1],
  /* Thresholds follow what the rating MEANS, re-measured over 390 drafts after
     teamRating() was re-anchored on what a draft can actually produce. 80 is a
     roster that reaches October 97 times in a hundred and turns up in 16% of
     drafts; 90 wins 104 games, always plays in October, takes the title one year
     in five, and turns up in 1.3%.

     THE TWO OLDEST RUNGS MOVED BECAUSE THE SCALE DID, not because either was
     mistuned. On the old anchors nothing ever exceeded 71.4, so 55 and 70 were a
     silver and a legend; against a scale whose top is now reachable they would
     have been handed out for an ordinary draft. A badge is DERIVED from stored
     rows, so one left too loose cannot be tightened later without stripping it
     off everybody who already has it. */
  ['rating_60', 'A real club', 'Field a team rated 60 or better.', 'bronze',
    (c) => c.best.rating >= 60],
  ['rating_70', 'Contender', 'Field a team rated 70 or better.', 'bronze',
    (c) => c.best.rating >= 70],
  ['rating_loaded', 'Loaded', 'Field a team rated 80 or better.', 'silver',
    (c) => c.best.rating >= 80],
  ['rating_85', 'Stacked', 'Field a team rated 85 or better.', 'gold',
    (c) => c.best.rating >= 85],
  ['rating_paper', 'Best on paper', 'Field a team rated 90 or better.', 'legend',
    (c) => c.best.rating >= 90],
  ['rating_95', 'Nothing better exists', 'Field a team rated 95 or better.', 'legend',
    (c) => c.best.rating >= 95],
]),

shelf('Roster craft', [
  ['eff_60', 'Reading the board', 'Draft at 60% efficiency.', 'bronze',
    (c) => c.best.efficiency >= 60],
  ['eff_75', 'Good eye', 'Draft at 75% efficiency.', 'bronze',
    (c) => c.best.efficiency >= 75],
  ['eff_85', 'Front office', 'Draft at 85% efficiency.', 'silver',
    (c) => c.best.efficiency >= 85],
  ['efficient', 'Sharp scout', 'Draft at 90% efficiency.', 'silver',
    (c) => c.best.efficiency >= 90],
  ['eff_95', 'Almost nothing missed', 'Draft at 95% efficiency.', 'gold',
    (c) => c.best.efficiency >= 95],
  ['perfect_draft', 'Nothing left on the board', 'Draft at 98% efficiency.', 'legend',
    (c) => c.best.efficiency >= 98],
  ['chem_4', 'They get along', 'Reach +4% chemistry.', 'bronze', (c) => c.best.chemPct >= 4],
  ['chem_7', 'Good room', 'Reach +7% chemistry.', 'bronze', (c) => c.best.chemPct >= 7],
  ['chem_10', 'Clubhouse magic', 'Reach +10% chemistry.', 'silver', (c) => c.best.chemPct >= 10],
  ['chem_12', 'They would run through a wall', 'Reach +12% chemistry.', 'gold',
    (c) => c.best.chemPct >= 12],
  ['chem_14', 'One mind', 'Reach +14% chemistry.', 'legend', (c) => c.best.chemPct >= 14],
  /* THE OLD THRESHOLD WAS $210M AND THE CAP IS $170M, so this asked every title
     winner for something the cap already guaranteed: a second copy of "win the
     title", wearing gold. It was written when the cap was $245M. Retuned rather
     than left, and that is not the strip-retroactively rule being broken: that
     rule protects a badge somebody earned by doing the thing, and nobody has ever
     earned this one by doing anything.

     $160M IS WHAT THE MEASUREMENT ALLOWS, and the first replacement was $140M,
     which no title in the pool reaches. Over 1,750 played seasons the 26 title
     rosters spent a minimum of $147.8M and a median of $168.9M: the cap binds, so
     winning cheap is a narrow thing rather than a big one. $160M leaves $10M of
     the cap unspent, which is a league-minimum slot, and it is about a fifth of
     titles. A badge is not allowed to name a saving the game cannot make. */
  ['bargain_title', 'Moneyball', 'Win the title spending under $160M.', 'gold',
    (c) => c.rows.some((r) => r.titleWon && r.spend != null && r.spend < 160)],
  ['no_respin_title', 'No do-overs', 'Win the title using no re-spins.', 'gold',
    (c) => c.rows.some((r) => r.titleWon && (r.respins || 0) === 0)],
  /* THREE IS THE CEILING, not a number picked to be hard: CONSTANTS.MAX_RESPINS
     is 3, so the first draft of this rung asked for five and was unearnable by
     arithmetic. That is the hoops catalogue's own mistake, made again, on the
     first day this shelf existed, and check-badges.mjs found it in one run.
     It holds the two together now, so raising the constant is the only way to
     raise this. */
  ['respin_3', 'Not this lot', 'Use all three re-spins in one draft.', 'bronze',
    (c) => c.rows.some((r) => (r.respins || 0) >= 3)],
  ['respin_title', 'Worth the money', 'Win the title having used all three re-spins.', 'gold',
    (c) => c.rows.some((r) => r.titleWon && (r.respins || 0) >= 3)],
  /* One badge a shape, because the six are the whole of what detectArchetype can
     answer and a roster wears exactly one of them. */
  ['arch_no_weak_links', 'No weak links', 'Field a roster with no weak links.', 'bronze',
    (c) => c.archetypes.has('no_weak_links')],
  ['arch_one_man_show', 'One-man show', 'Field a roster built around one player.', 'bronze',
    (c) => c.archetypes.has('one_man_show')],
  ['arch_balanced', 'Balanced contender', 'Field a balanced contender.', 'silver',
    (c) => c.archetypes.has('balanced')],
  ['arch_aces_wild', 'Aces wild', 'Field a roster that spends big on the arms.', 'silver',
    (c) => c.archetypes.has('aces_wild')],
  ['arch_murderers_row', "Murderers' Row", "Field a Murderers' Row roster.", 'gold',
    (c) => c.archetypes.has('murderers_row')],
  ['arch_all', 'Every kind of team', 'Field all six roster shapes.', 'legend',
    (c) => ['no_weak_links', 'one_man_show', 'balanced', 'aces_wild', 'murderers_row', 'mixed']
      .every((k) => c.archetypes.has(k))],
  ['murderers_row', "Murderers' Row champions", "Win the title with a Murderers' Row roster.", 'legend',
    (c) => c.titleArchetypes.has('murderers_row')],
]),

shelf('The roster', [
  ['decades_3', 'Across the years', 'Field players from three different decades.', 'bronze',
    (c) => c.best.decades >= 3],
  ['decades_5', 'Five decades', 'Field players from five different decades.', 'bronze',
    (c) => c.best.decades >= 5],
  ['century', 'A century of the game', 'Field players from six different decades.', 'silver',
    (c) => c.best.decades >= 6],
  ['decades_8', 'Eight decades', 'Field players from eight different decades.', 'gold',
    (c) => c.best.decades >= 8],
  ['decades_10', 'The whole game', 'Field players from ten different decades.', 'legend',
    (c) => c.best.decades >= 10],
  ['clubs_12', 'Twelve badges', 'Field twelve players from twelve different clubs.', 'silver',
    (c) => c.best.clubs >= 12],
  ['one_franchise_4', 'Four of a kind', 'Field four players from one franchise.', 'bronze',
    (c) => c.best.oneClub >= 4],
  ['one_franchise', 'Company men', 'Field six players from one franchise.', 'silver',
    (c) => c.best.oneClub >= 6],
  /* ASKED OF A RUN THAT WAS NOT LOCKED TO A CLUB, because One Franchise fields
     twelve of them by definition: unqualified, this would be a gold badge for
     pressing a mode button. The six-man rung above it predates that mode and is
     left alone, since a badge cannot be tightened without stripping it. */
  ['one_franchise_8', 'The whole club', 'Field eight players from one franchise in an open draft.',
    'gold', (c) => c.rows.some((r) => {
      if (r.franchise) return false;
      const t = {}; picks(r).forEach((p) => { t[p.t] = (t[p.t] || 0) + 1; });
      return Object.values(t).some((n) => n >= 8);
    })],
  ['one_season', 'Time capsule', 'Field three players from one exact season.', 'silver',
    (c) => c.best.oneSeason >= 3],
  ['one_season_4', 'That summer', 'Field four players from one exact season.', 'gold',
    (c) => c.best.oneSeason >= 4],
  ['one_season_5', 'The whole infield', 'Field five players from one exact season.', 'legend',
    (c) => c.best.oneSeason >= 5],
  ['deadball', 'Dead-ball era', 'Draft a player from before 1920.', 'bronze',
    (c) => c.rows.some((r) => picks(r).some((p) => p.s < 1920))],
  ['first_season', 'Where it starts', 'Draft a season from 1901 or 1902.', 'silver',
    (c) => c.rows.some((r) => picks(r).some((p) => p.s <= 1902))],
  ['last_season', 'Yesterday', 'Draft a season from the last five years.', 'bronze',
    (c) => c.rows.some((r) => picks(r).some((p) => p.s >= 2021))],
  ['pick_8', 'A real year', 'Draft an 8 WAR season.', 'bronze',
    (c) => c.best.pickWar >= 8],
  ['legend_pick', 'Inner circle', 'Draft a 10 WAR season.', 'silver',
    (c) => c.best.pickWar >= 10],
  ['pick_12', 'One of the best there has been', 'Draft a 12 WAR season.', 'gold',
    (c) => c.best.pickWar >= 12],
  ['picks_8_three', 'Three of them', 'Field three 8 WAR seasons at once.', 'legend',
    (c) => c.rows.some((r) => picks(r).filter((p) => (warOf(p) || 0) >= 8).length >= 3)],
  ['roster_war_40', 'Forty wins above', 'Field a roster worth 40 WAR.', 'bronze',
    (c) => c.best.rosterWar >= 40],
  ['roster_war_48', 'Forty-eight', 'Field a roster worth 48 WAR.', 'silver',
    (c) => c.best.rosterWar >= 48],
  ['roster_war_55', 'Fifty-five', 'Field a roster worth 55 WAR.', 'legend',
    (c) => c.best.rosterWar >= 55],
  ['floor_2', 'No passengers', 'Field twelve players who were all worth 2 WAR.', 'gold',
    (c) => c.best.floorWar >= 2],
  /* One badge a link type. There are six and the most any roster carried over
     1,750 played seasons is four, so there is deliberately no "all six" rung: the
     double-play combo and the battery both need a same-season pairing at named
     positions, and the family link needs two men out of a curated list. */
  ['link_era', 'Same era', 'Build a roster linked by the years they played.', 'bronze',
    (c) => c.linkTypes.has('era')],
  ['link_franchise', 'Same shirt', 'Link two players by the club they both played for.', 'bronze',
    (c) => c.linkTypes.has('franchise')],
  ['link_reunion', 'Reunion', 'Field two team-mates from the same season.', 'silver',
    (c) => c.linkTypes.has('reunion')],
  ['link_dp', 'Turn two', 'Field a real double-play combination.', 'gold',
    (c) => c.linkTypes.has('dp_combo')],
  ['link_battery', 'Batterymates', 'Field a real catcher and pitcher pairing.', 'gold',
    (c) => c.linkTypes.has('battery')],
  ['family', 'Keeping it in the family', 'Draft two players from the same family.', 'legend',
    (c) => c.linkTypes.has('family')],
]).concat(
  /* A COLLECTION RATHER THAN A LADDER: thirteen decades, one badge each, lit by
     drafting anybody from that decade in any mode. It is the one shelf a player
     can deliberately complete, and it is what makes the whole pool worth walking
     rather than only the seasons the wheel keeps offering. */
  DECADES.map((d) => A('dec_' + d, DECADE_NAME(d),
    'Draft a player from the ' + DECADE_NAME(d) + '.',
    d < 1920 ? 'silver' : 'bronze', 'The roster',
    (c) => c.decadesDrafted.has(d)))
).concat([
  A('dec_all', 'Every decade there is',
    'Draft a player from all thirteen decades.', 'legend', 'The roster',
    (c) => DECADES.every((d) => c.decadesDrafted.has(d))),
]),

shelf('The modes', MODES.reduce((out, [key, label]) => out.concat([
  ['mode_' + key, label, 'Finish a season in ' + label + '.', 'bronze',
    (c) => (c.modeRuns[key] || 0) >= 1],
  ['mode_' + key + '_10', label + ' regular', 'Finish 10 seasons in ' + label + '.', 'silver',
    (c) => (c.modeRuns[key] || 0) >= 10],
  ['mode_' + key + '_oct', label + ' in October', 'Reach the playoffs in ' + label + '.', 'silver',
    (c) => (c.modeOct[key] || 0) >= 1],
  ['mode_' + key + '_title', label + ' champions', 'Win the World Series in ' + label + '.', 'gold',
    (c) => (c.modeTitles[key] || 0) >= 1],
]), [])).concat(
  /* The Eras draft is thirteen different pools, so it gets the same treatment the
     decade collection gets: one badge a decade, lit by finishing a season in it. */
  DECADES.map((d) => A('eras_' + d, 'The ' + DECADE_NAME(d) + ' all-stars',
    'Finish an Eras Draft season in the ' + DECADE_NAME(d) + '.', 'bronze', 'The modes',
    (c) => c.erasPlayed.has(DECADE_NAME(d))))
).concat(shelf('The modes', [
  ['eras_all', 'Thirteen decades deep', 'Finish an Eras Draft season in all thirteen decades.',
    'legend', (c) => DECADES.every((d) => c.erasPlayed.has(DECADE_NAME(d)))],
  ['div_all', 'The whole league', 'Finish a Division Draft in all six divisions.', 'gold',
    (c) => c.divisionsPlayed.size >= 6],
  ['fran_5', 'Five clubs', 'Play One Franchise with five different clubs.', 'bronze',
    (c) => c.franchisesPlayed.size >= 5],
  ['fran_15', 'Fifteen clubs', 'Play One Franchise with fifteen different clubs.', 'silver',
    (c) => c.franchisesPlayed.size >= 15],
  ['fran_30', 'Thirty clubs', 'Play One Franchise with thirty different clubs.', 'legend',
    (c) => c.franchisesPlayed.size >= 30],
  ['surv_clean', 'Under the number', 'Finish Salary Cap Survivor without cutting anybody.', 'gold',
    (c) => c.rows.some((r) => r.capSurvivor && (r.cuts || 0) === 0)],
  ['surv_cut', 'Somebody has to go', 'Cut a player in Salary Cap Survivor.', 'bronze',
    (c) => c.best.cuts >= 1],
  ['surv_cut_3', 'Fire sale', 'Cut three players in one Salary Cap Survivor season.', 'silver',
    (c) => c.best.cuts >= 3],
  ['surv_cut_5', 'Nothing left to sell', 'Cut five players in one Salary Cap Survivor season.', 'gold',
    (c) => c.best.cuts >= 5],
  ['surv_clean_oct', 'Held it together', 'Reach October in Salary Cap Survivor with nobody cut.',
    'legend', (c) => c.rows.some((r) => r.capSurvivor && (r.cuts || 0) === 0 && r.madePlayoffs)],
  ['trade_1', 'Deal done', 'Accept a trade in The Trade Machine.', 'bronze',
    (c) => c.best.trades >= 1],
  ['trade_3', 'Worked all three windows', 'Accept a trade at all three deadlines.', 'silver',
    (c) => c.best.trades >= 3],
  ['trade_stand_pat', 'Stood pat', 'Reach October in The Trade Machine without accepting a trade.',
    'gold', (c) => c.rows.some((r) => r.tradeMachine && (r.trades || 0) === 0 && r.madePlayoffs)],
  /* 90 AND NOT 70 BECAUSE THE SCALE MOVED, not because the badge was mistuned.
     On the old anchors the best staff anybody reached was 77, so 70 was a little
     better than a median good draft; against a scale whose top is now reachable
     a median good draft is 92, and 70 would be handed out for turning up. */
  ['staff_90', 'A staff for the ages', 'Field an All-Time Staff rated 90 or better.', 'gold',
    (c) => c.rows.some((r) => r.staff && (r.rating || 0) >= 90)],
])),

shelf('The daily', [
  ['daily_1', "Today's draft", 'Finish a daily.', 'bronze', (c) => c.daily.runs >= 1],
  ['daily_10', 'Ten dailies', 'Finish 10 dailies.', 'bronze', (c) => c.daily.runs >= 10],
  ['daily_25', 'Twenty-five dailies', 'Finish 25 dailies.', 'silver', (c) => c.daily.runs >= 25],
  ['daily_50', 'Fifty dailies', 'Finish 50 dailies.', 'gold', (c) => c.daily.runs >= 50],
  ['daily_100', 'A hundred dailies', 'Finish 100 dailies.', 'legend', (c) => c.daily.runs >= 100],
  ['daily_oct', 'October on the daily', 'Reach the playoffs on a daily.', 'bronze',
    (c) => c.daily.octobers >= 1],
  ['daily_title', 'The best draft of the day', 'Win the World Series on a daily.', 'gold',
    (c) => c.daily.titles >= 1],
  ['daily_90', 'Ninety on the daily', 'Win 90 games on a daily.', 'silver',
    (c) => c.daily.bestWins >= 90],
  ['daily_100w', 'A hundred on the daily', 'Win 100 games on a daily.', 'gold',
    (c) => c.daily.bestWins >= 100],
  ['daily_rating_80', 'Best six of the day', 'Field a daily team rated 80 or better.', 'gold',
    (c) => c.daily.bestRating >= 80],
  /* The daily streak is counted off the days dailies were FINISHED ON, the same
     way the play streak is. The page keeps its own streak in localStorage for the
     card on the front screen; this one is derived from rows, so it survives that
     key being cleared and cannot disagree with the history it is drawn from. */
  ['daily_streak_3', 'Three days running', 'Finish the daily three days in a row.', 'bronze',
    (c) => c.daily.streak.best >= 3],
  ['daily_streak_7', 'A week of dailies', 'Finish the daily seven days in a row.', 'silver',
    (c) => c.daily.streak.best >= 7],
  ['daily_streak_14', 'A fortnight', 'Finish the daily fourteen days in a row.', 'gold',
    (c) => c.daily.streak.best >= 14],
  ['daily_streak_30', 'A month of dailies', 'Finish the daily thirty days in a row.', 'legend',
    (c) => c.daily.streak.best >= 30],
]),

shelf('Streaks', [
  ['streak_2', 'Back tomorrow', 'Play two days in a row.', 'bronze', (c) => c.play.best >= 2],
  ['streak_3', 'On a roll', 'Play three days in a row.', 'bronze', (c) => c.play.best >= 3],
  ['streak_5', 'Five straight', 'Play five days in a row.', 'bronze', (c) => c.play.best >= 5],
  ['streak_7', 'Week straight', 'Play seven days in a row.', 'silver', (c) => c.play.best >= 7],
  ['streak_14', 'A fortnight straight', 'Play fourteen days in a row.', 'silver', (c) => c.play.best >= 14],
  ['streak_30', 'A month straight', 'Play 30 days in a row.', 'gold', (c) => c.play.best >= 30],
  ['streak_60', 'Two months straight', 'Play 60 days in a row.', 'legend', (c) => c.play.best >= 60],
  ['streak_100', 'A hundred days', 'Play 100 days in a row.', 'legend', (c) => c.play.best >= 100],
  ['btb_title', 'Back-to-back', 'Win the title two seasons running.', 'gold', (c) => c.title.best >= 2],
  ['threepeat', 'Three-peat', 'Win the title three seasons running.', 'legend', (c) => c.title.best >= 3],
  ['fourpeat', 'Four in a row', 'Win the title four seasons running.', 'legend', (c) => c.title.best >= 4],
  ['oct_streak_2', 'Back in October', 'Reach the playoffs two seasons running.', 'bronze',
    (c) => c.october.best >= 2],
  ['oct_streak_3', 'A window', 'Reach the playoffs three seasons running.', 'silver',
    (c) => c.october.best >= 3],
  ['oct_streak_5', 'A run of them', 'Reach the playoffs five seasons running.', 'gold',
    (c) => c.october.best >= 5],
  ['oct_streak_10', 'A decade of Octobers', 'Reach the playoffs ten seasons running.', 'legend',
    (c) => c.october.best >= 10],
])

);

// Streak engines ----------------------------------------------------------
/* THE KEY IS PADDED AND THAT IS NOT TIDINESS. playStreak sorts these as STRINGS
   and then reads consecutive pairs, so unpadded keys sort lexicographically:
   2026-1-1, 2026-1-10, 2026-1-11 ... 2026-1-19, 2026-1-2, 2026-1-20. Every month
   is walked in that order, so the gap between the 19th and the 2nd is minus
   seventeen days and the count resets there.
   Measured with the old key, FORTY CONSECUTIVE DAYS OF PLAY REPORTED A BEST
   STREAK OF TEN. Nothing threw. The streak rendered, it was a plausible number,
   and the only symptom was that "A month straight" could not be earned by
   playing for a month. Found by check-badges.mjs, which is the whole reason that
   file plays a day per run rather than stamping them all with now.
   Padded, the key also parses as ISO, so the difference between two of them is
   exactly 24 hours rather than 23 on the day a clock goes forward. */
function dayKey(ts) {
  const d = new Date(ts);
  const p = (n) => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/* Daily-play streak counted in distinct local calendar days on which at least
 * one season finished (five runs one evening = one day, can't be farmed).
 * Alive if the last-played day was today or yesterday. */
function playStreak(rows, nowTs) {
  const days = uniq(rows.map((r) => dayKey(r.ts))).sort();
  if (!days.length) return { current: 0, best: 0, playedToday: false };
  let best = 1, cur = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1]), d = new Date(days[i]);
    const gap = Math.round((d - prev) / 86400000);
    if (gap === 1) cur++; else cur = 1;
    if (cur > best) best = cur;
  }
  const today = dayKey(nowTs || Date.now());
  const yest = dayKey((nowTs || Date.now()) - 86400000);
  const last = days[days.length - 1];
  const current = (last === today || last === yest) ? cur : 0;
  return { current, best, playedToday: last === today };
}

/* Consecutive seasons, in play order, satisfying a test. Written once because
 * the title run and the October run are the same question about two fields. */
function runStreak(rows, test) {
  let best = 0, cur = 0;
  for (const r of rows) {
    if (test(r)) { cur++; if (cur > best) best = cur; } else cur = 0;
  }
  return { current: cur, best };
}

function titleStreak(rows) { return runStreak(rows, (r) => !!r.titleWon); }

// Evaluation --------------------------------------------------------------
function buildCtx(rows, nowTs) {
  const best = {
    wins: 0, rating: 0, efficiency: 0, chemPct: -100,
    pickWar: 0, rosterWar: 0, decades: 0, clubs: 0, oneClub: 0, oneSeason: 0,
    floorWar: 0, cuts: 0, trades: 0,
  };
  const worst = { wins: Infinity, losses: 0 };
  let bestRank = null, titles = 0, octobers = 0, wsLosses = 0, careerWins = 0;
  const modeRuns = {}, modeTitles = {}, modeOct = {};
  const erasPlayed = new Set(), divisionsPlayed = new Set(), franchisesPlayed = new Set();
  const decadesDrafted = new Set(), linkTypes = new Set();
  const archetypes = new Set(), titleArchetypes = new Set();
  const dailyRows = [];
  const dailyBest = { wins: 0, rating: 0 };
  let dailyTitles = 0, dailyOct = 0;

  for (const r of rows) {
    if ((r.wins || 0) > best.wins) best.wins = r.wins;
    if ((r.wins != null ? r.wins : Infinity) < worst.wins) worst.wins = r.wins;
    if ((r.losses || 0) > worst.losses) worst.losses = r.losses;
    /* A STAFF IS NOT A TEAM AND IS NOT ON THE SAME SCALE. Every rung of the
       rating shelf says "field a team", and staffRating is anchored on what a
       twelve-arm staff produces rather than on what a roster does: the two share
       a range and mean different things, which staffRating's own header says in
       as many words. While the staff scale's top was dead at 76 that cost
       nothing, because a staff run could never be anybody's best number. Once
       both ends were anchored, a sensible staff draft medians 92 and would have
       handed out every rung up to "Best on paper" for pressing the obvious
       button twelve times. `staff_90` is the rung that asks about a staff, and
       it reads r.staff for exactly this reason. */
    if (!r.staff && (r.rating || 0) > best.rating) best.rating = r.rating;
    if ((r.efficiency || 0) > best.efficiency) best.efficiency = r.efficiency;
    if ((r.chemPct != null ? r.chemPct : -100) > best.chemPct) best.chemPct = r.chemPct;
    if (r.allTimeRank != null && (bestRank == null || r.allTimeRank < bestRank)) bestRank = r.allTimeRank;
    if ((r.cuts || 0) > best.cuts) best.cuts = r.cuts;
    if ((r.trades || 0) > best.trades) best.trades = r.trades;

    careerWins += (r.wins || 0);
    if (r.titleWon) titles++;
    if (r.madePlayoffs) octobers++;
    if (r.eliminatedWS) wsLosses++;

    const mode = modeKeyOf(r);
    modeRuns[mode] = (modeRuns[mode] || 0) + 1;
    if (r.titleWon) modeTitles[mode] = (modeTitles[mode] || 0) + 1;
    if (r.madePlayoffs) modeOct[mode] = (modeOct[mode] || 0) + 1;
    if (r.era) erasPlayed.add(r.era);
    if (r.division) divisionsPlayed.add(r.division);
    if (r.franchise) franchisesPlayed.add(r.franchise);
    if (r.archetype) {
      archetypes.add(r.archetype);
      if (r.titleWon) titleArchetypes.add(r.archetype);
    }
    for (const l of (r.chemLinks || [])) linkTypes.add(l);

    /* One walk of the picks, because twelve of them times four hundred rows times
       two hundred badges is the one place this file could get slow enough to
       notice on a phone. Every roster-shaped question is answered here. */
    const ps = picks(r);
    if (ps.length) {
      const byClub = {}, bySeason = {};
      let sum = 0, top = 0, floor = Infinity, known = 0;
      const decs = new Set();
      for (const p of ps) {
        byClub[p.t] = (byClub[p.t] || 0) + 1;
        bySeason[p.s] = (bySeason[p.s] || 0) + 1;
        if (p.s != null) decs.add(decadeOf(p.s));
        const w = warOf(p);
        if (w != null) { sum += w; known++; if (w > top) top = w; if (w < floor) floor = w; }
      }
      for (const d of decs) decadesDrafted.add(d);
      if (decs.size > best.decades) best.decades = decs.size;
      const clubs = Object.keys(byClub).length;
      if (clubs > best.clubs) best.clubs = clubs;
      const mClub = Math.max.apply(null, Object.values(byClub));
      if (mClub > best.oneClub) best.oneClub = mClub;
      const mSeason = Math.max.apply(null, Object.values(bySeason));
      if (mSeason > best.oneSeason) best.oneSeason = mSeason;
      if (top > best.pickWar) best.pickWar = top;
      if (sum > best.rosterWar) best.rosterWar = sum;
      /* The floor is a claim about the WHOLE roster, so a row with a pick whose
         WAR was never recorded cannot answer it. Missing is unknown, never zero. */
      if (known === ps.length && floor > best.floorWar) best.floorWar = floor;
    }

    if (r.daily) {
      dailyRows.push(r);
      if ((r.wins || 0) > dailyBest.wins) dailyBest.wins = r.wins;
      if ((r.rating || 0) > dailyBest.rating) dailyBest.rating = r.rating;
      if (r.titleWon) dailyTitles++;
      if (r.madePlayoffs) dailyOct++;
    }
  }
  if (!isFinite(worst.wins)) worst.wins = 0;

  return {
    rows, n: rows.length, best, worst, bestRank,
    titles, octobers, wsLosses, careerWins,
    modeRuns, modeTitles, modeOct,
    erasPlayed, divisionsPlayed, franchisesPlayed,
    decadesDrafted, linkTypes, archetypes, titleArchetypes,
    daily: {
      runs: dailyRows.length, titles: dailyTitles, octobers: dailyOct,
      bestWins: dailyBest.wins, bestRating: dailyBest.rating,
      streak: playStreak(dailyRows, nowTs),
    },
    play: playStreak(rows, nowTs),
    title: runStreak(rows, (r) => !!r.titleWon),
    october: runStreak(rows, (r) => !!r.madePlayoffs),
  };
}

function evaluate(rows, nowTs) {
  rows = Array.isArray(rows) ? rows : [];
  const ctx = buildCtx(rows, nowTs);
  const earned = [], locked = [];
  for (const a of CATALOGUE) {
    let got = false;
    try { got = !!a.test(ctx); } catch (_) { got = false; }
    (got ? earned : locked).push(a);
  }
  return {
    earned, locked, total: CATALOGUE.length,
    play: ctx.play, title: ctx.title,
    stats: {
      runs: rows.length,
      titles: ctx.titles,
      playoffs: ctx.octobers,
      bestWins: ctx.best.wins,
      bestRank: ctx.bestRank,
      bestRating: Math.round(ctx.best.rating),
    },
  };
}

/* Which badge ids are newly earned by adding newRow to prevRows. */
function newlyEarned(prevRows, newRow, nowTs) {
  const before = new Set(evaluate(prevRows, nowTs).earned.map((a) => a.id));
  const after = evaluate(prevRows.concat([newRow]), nowTs).earned;
  return after.filter((a) => !before.has(a.id));
}

const api = {
  CATALOGUE, GROUPS, TIERS, MODES, DECADES,
  evaluate, newlyEarned, buildCtx, playStreak, titleStreak, runStreak, modeKeyOf,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.RTD_ACH = api;
})();
