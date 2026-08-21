/* THE SEED. Twenty-two team-seasons, entered by hand, so the engine has
 * something to run against before the real pipeline has ever been run.
 *
 * READ THIS BEFORE YOU TRUST A NUMBER IN HERE.
 *
 * The win share splits and the per-game lines below are entered from memory and
 * rounded. They are the right size and the right shape, which is all the engine
 * needs to be calibrated, and they are NOT the published figures. Nothing in
 * this file should ever be shown to a player as a fact about a real season, and
 * the moment fetch-nba.mjs has run once, every row here is replaced by data
 * pulled from the source rather than recalled.
 *
 * WHY IT EXISTS AT ALL. Basketball-Reference is blocked from the development
 * sandbox and open from GitHub's runners, which is the same split the player
 * register documents and the reason its parsers are tested against fixtures
 * instead of a live fetch. Without a seed the game cannot be opened, clicked, or
 * balanced until a workflow has run, and an engine nobody can play is an engine
 * nobody can tell is wrong.
 *
 * WHAT WAS CHOSEN AND WHY. Twenty-two of the best team-seasons the league has
 * had, spread from 1972 to 2023 so every era is drawable, each one taken deep
 * enough that a board has real choices on it rather than one star and five
 * names. That spread is doing a job: the chemistry links (same club, same
 * season, same college, same draft class) only have anything to find if the
 * data holds actual teammates and actual classmates, and the fit model only has
 * an era to translate between if the data spans several.
 *
 * A ROW IS:
 *   [ id, name, positions, offensive WS, defensive WS,
 *     points, rebounds, assists, field goal attempts, three-point attempts,
 *     blocks, steals, college, draft year ]
 *
 * THE LAST FOUR STATS ARE WHAT MAKE IT A BASKETBALL GAME rather than a game
 * about a single value number, so they are worth saying what each one is for:
 *
 *   field goal attempts   how many shots this man needs. Six players who each
 *                         took twenty of them cannot all take twenty on the
 *                         same team, and the engine charges for it.
 *   three-point attempts  spacing, measured against what HIS OWN era shot, so a
 *                         1972 guard is not punished for a line that did not
 *                         exist yet. See ERA_CONTEXT in engine.js.
 *   blocks                rim protection, which is an anchor and not a sum.
 *   steals                perimeter defense and turnovers created.
 *
 * Positions are semicolon separated and read by the slot eligibility table in
 * engine.js. College is null for anyone who did not play college basketball,
 * and draft year is null for anyone who went undrafted; both are chemistry
 * inputs, so a null is a link that correctly never fires.
 */

export const SEED_TEAM_SEASONS = [
  { t: 'CHI', s: 1996, record: '72-10', players: [
    ['jordami01', 'Michael Jordan',  'SG;G;GF', 15.9, 4.5, 30.4,  6.6, 4.3, 22.6, 3.2, 0.5, 2.2, 'North Carolina', 1984],
    ['pippesc01', 'Scottie Pippen',  'SF;F;GF',  5.3, 3.7, 19.4,  6.4, 5.9, 16.0, 3.8, 0.6, 1.7, 'Central Arkansas', 1987],
    ['rodmade01', 'Dennis Rodman',   'PF;F;FC',  2.4, 4.1,  5.5, 14.9, 2.5,  4.3, 0.3, 0.4, 0.6, 'Southeastern Oklahoma State', 1986],
    ['kukocto01', 'Toni Kukoc',      'SF;F;GF',  4.9, 1.7, 13.1,  4.0, 3.5, 10.3, 2.5, 0.4, 0.8, null, 1990],
    ['harpero01', 'Ron Harper',      'PG;SG;G',  2.2, 2.2,  7.4,  2.7, 2.6,  6.1, 1.3, 0.3, 1.3, 'Miami (OH)', 1986],
    ['longllu01', 'Luc Longley',     'C;FC',     1.7, 1.6,  9.1,  5.1, 1.9,  7.6, 0.0, 0.8, 0.4, 'New Mexico', 1991],
    ['kerrst01',  'Steve Kerr',      'PG;G',     3.9, 1.1,  8.4,  1.3, 2.3,  6.0, 2.9, 0.1, 0.6, 'Arizona', 1988],
    ['wennibi01', 'Bill Wennington', 'C;FC',     1.5, 1.0,  5.3,  2.7, 0.6,  4.5, 0.0, 0.2, 0.3, "St. John's", 1985],
  ]},

  { t: 'GSW', s: 2016, record: '73-9', players: [
    ['curryst01', 'Stephen Curry',    'PG;G',    13.8, 4.1, 30.1, 5.4, 6.7, 20.2, 11.2, 0.2, 2.1, 'Davidson', 2009],
    ['greendr01', 'Draymond Green',   'PF;F;FC',  5.4, 5.7, 14.0, 9.5, 7.4, 10.5,  3.7, 1.4, 1.5, 'Michigan State', 2012],
    ['thompkl01', 'Klay Thompson',    'SG;G;GF',  5.9, 2.5, 22.1, 3.8, 2.1, 17.3,  8.1, 0.6, 0.8, 'Washington State', 2011],
    ['bogutan01', 'Andrew Bogut',     'C;FC',     2.4, 3.0,  5.4, 7.0, 2.3,  4.0,  0.0, 1.6, 0.5, 'Utah', 2005],
    ['barneha02', 'Harrison Barnes',  'SF;F;GF',  2.7, 1.8, 11.7, 4.9, 1.8,  9.0,  3.2, 0.2, 0.6, 'North Carolina', 2012],
    ['iguodan01', 'Andre Iguodala',   'SF;F;GF',  3.1, 2.1,  7.0, 4.0, 3.4,  5.6,  2.4, 0.3, 1.1, 'Arizona', 2004],
    ['livinsh01', 'Shaun Livingston', 'PG;G',     2.3, 1.3,  6.3, 2.1, 1.8,  5.1,  0.0, 0.3, 0.5, null, 2004],
    ['barbole01', 'Leandro Barbosa',  'SG;G',     2.0, 0.8,  6.4, 1.5, 1.1,  5.2,  1.6, 0.1, 0.5, null, 2003],
  ]},

  { t: 'GSW', s: 2017, record: '67-15', players: [
    ['curryst01', 'Stephen Curry',    'PG;G',     9.8, 2.8, 25.3, 4.5, 6.6, 18.3, 10.0, 0.2, 1.8, 'Davidson', 2009],
    ['duranke01', 'Kevin Durant',     'SF;PF;F',  8.4, 3.6, 25.1, 8.3, 4.8, 16.5,  5.0, 1.6, 1.1, 'Texas', 2007],
    ['thompkl01', 'Klay Thompson',    'SG;G;GF',  5.6, 2.4, 22.3, 3.7, 2.1, 17.6,  7.6, 0.5, 0.8, 'Washington State', 2011],
    ['greendr01', 'Draymond Green',   'PF;F;FC',  3.4, 5.5, 10.2, 7.9, 7.0,  8.4,  3.4, 1.4, 2.0, 'Michigan State', 2012],
    ['iguodan01', 'Andre Iguodala',   'SF;F;GF',  2.9, 2.2,  7.6, 4.0, 3.4,  5.9,  2.4, 0.5, 1.0, 'Arizona', 2004],
    ['pachuza01', 'Zaza Pachulia',    'C;FC',     2.2, 1.4,  6.1, 5.9, 1.9,  4.6,  0.0, 0.3, 0.8, null, null],
    ['livinsh01', 'Shaun Livingston', 'PG;G',     2.1, 1.3,  5.1, 1.8, 1.8,  4.2,  0.0, 0.2, 0.5, null, 2004],
    ['mcgeeja01', 'JaVale McGee',     'C;FC',     2.6, 1.3,  6.1, 3.2, 0.4,  4.1,  0.0, 0.9, 0.3, 'Nevada', 2008],
  ]},

  { t: 'LAL', s: 1987, record: '65-17', players: [
    ['johnsma02', 'Magic Johnson',       'PG;G',   12.5, 3.4, 23.9, 6.3, 12.2, 16.4, 1.1, 0.4, 1.7, 'Michigan State', 1979],
    ['abdulka01', 'Kareem Abdul-Jabbar', 'C;FC',    4.6, 2.8, 17.5, 6.7,  2.6, 13.3, 0.0, 1.2, 0.6, 'UCLA', 1969],
    ['worthja01', 'James Worthy',        'SF;F;GF', 6.1, 2.3, 19.4, 5.7,  2.8, 14.6, 0.1, 0.7, 1.1, 'North Carolina', 1982],
    ['scottby01', 'Byron Scott',         'SG;G',    5.4, 1.9, 17.0, 3.4,  3.4, 13.0, 1.9, 0.3, 1.5, 'Arizona State', 1983],
    ['coopemi01', 'Michael Cooper',      'SG;SF;GF',3.4, 2.5, 10.5, 3.0,  4.5,  8.0, 2.9, 0.5, 1.2, 'New Mexico', 1978],
    ['greenac01', 'A.C. Green',          'PF;F;FC', 4.0, 2.5, 10.8, 7.8,  1.1,  7.5, 0.1, 0.6, 0.9, 'Oregon State', 1985],
    ['thompmy01', 'Mychal Thompson',     'C;PF;FC', 1.4, 1.2, 10.1, 5.2,  1.1,  7.9, 0.0, 0.7, 0.5, 'Minnesota', 1978],
  ]},

  { t: 'BOS', s: 1986, record: '67-15', players: [
    ['birdla01',  'Larry Bird',      'SF;PF;F', 11.7, 4.2, 25.8, 9.8, 6.8, 19.0, 2.3, 0.6, 2.0, 'Indiana State', 1978],
    ['mchalke01', 'Kevin McHale',    'PF;F;FC',  7.7, 3.5, 21.3, 8.1, 2.7, 14.9, 0.0, 1.7, 0.4, 'Minnesota', 1980],
    ['parisro01', 'Robert Parish',   'C;FC',     5.5, 3.6, 16.1, 9.5, 1.8, 11.9, 0.0, 1.4, 0.8, 'Centenary', 1976],
    ['johnsde01', 'Dennis Johnson',  'PG;SG;G',  3.3, 2.8, 15.6, 3.4, 5.8, 12.4, 0.6, 0.4, 1.2, 'Pepperdine', 1976],
    ['aingeda01', 'Danny Ainge',     'SG;PG;G',  4.6, 1.8, 10.7, 2.9, 5.1,  8.4, 1.2, 0.1, 1.2, 'BYU', 1981],
    ['waltobi01', 'Bill Walton',     'C;FC',     3.3, 2.4,  7.6, 6.8, 2.1,  5.6, 0.0, 1.3, 0.4, 'UCLA', 1974],
    ['sichtje01', 'Jerry Sichting',  'PG;G',     2.5, 0.9,  6.5, 1.3, 2.5,  5.0, 0.2, 0.0, 0.6, 'Purdue', 1979],
    ['wedmasc01', 'Scott Wedman',    'SF;F;GF',  1.3, 0.7,  8.0, 2.4, 1.0,  6.6, 1.0, 0.2, 0.5, 'Colorado', 1974],
  ]},

  { t: 'LAL', s: 2001, record: '56-26', players: [
    ['onealsh01', "Shaquille O'Neal", 'C;FC',    10.2, 4.7, 28.7, 12.7, 3.7, 20.2, 0.0, 2.8, 0.6, 'LSU', 1992],
    ['bryanko01', 'Kobe Bryant',     'SG;G;GF',  7.4, 3.0, 28.5,  5.9, 5.0, 22.2, 3.4, 0.6, 1.7, null, 1996],
    ['horryro01', 'Robert Horry',    'PF;SF;F',  2.1, 2.4,  5.4,  4.6, 1.8,  4.8, 2.4, 0.9, 1.0, 'Alabama', 1992],
    ['fishede01', 'Derek Fisher',    'PG;G',     1.9, 1.2, 11.5,  2.0, 2.6,  9.4, 3.6, 0.1, 1.2, 'Arkansas-Little Rock', 1996],
    ['foxri01',   'Rick Fox',        'SF;F;GF',  1.9, 1.7,  9.1,  4.2, 2.8,  7.3, 1.6, 0.3, 0.9, 'North Carolina', 1991],
    ['grantho01',  'Horace Grant',    'PF;F;FC',  2.0, 2.3,  8.5,  6.6, 1.4,  6.9, 0.0, 0.8, 0.8, 'Clemson', 1987],
    ['shawbr01',  'Brian Shaw',      'PG;SG;G',  1.2, 1.0,  5.5,  2.6, 2.7,  4.9, 1.5, 0.2, 0.5, 'UC Santa Barbara', 1988],
  ]},

  { t: 'MIA', s: 2013, record: '66-16', players: [
    ['jamesle01', 'LeBron James',    'SF;PF;F', 14.6, 4.7, 26.8, 8.0, 7.3, 17.8, 3.3, 0.9, 1.7, null, 2003],
    ['wadedw01',  'Dwyane Wade',     'SG;G;GF',  6.0, 2.9, 21.2, 5.0, 5.1, 15.3, 0.8, 0.8, 1.9, 'Marquette', 2003],
    ['boshch01',  'Chris Bosh',      'C;PF;FC',  5.5, 2.9, 16.6, 6.8, 1.7, 12.7, 1.4, 1.4, 0.9, 'Georgia Tech', 2003],
    ['allenra02', 'Ray Allen',       'SG;G',     4.3, 1.3, 10.9, 2.7, 1.7,  8.3, 4.4, 0.1, 0.7, 'Connecticut', 1996],
    ['chalmma01', 'Mario Chalmers',  'PG;G',     3.0, 1.6,  8.6, 2.2, 3.5,  6.9, 3.1, 0.1, 1.5, 'Kansas', 2008],
    ['battish01', 'Shane Battier',   'SF;PF;F',  2.7, 1.8,  6.6, 2.6, 1.2,  5.1, 4.0, 0.4, 0.9, 'Duke', 2001],
    ['anderch01', 'Chris Andersen',  'C;FC',     2.5, 1.6,  4.9, 4.1, 0.5,  3.0, 0.0, 1.0, 0.4, null, null],
    ['hasleud01', 'Udonis Haslem',   'PF;F;FC',  0.9, 1.2,  3.9, 5.2, 0.6,  3.7, 0.0, 0.3, 0.4, 'Florida', null],
  ]},

  { t: 'DET', s: 1989, record: '63-19', players: [
    ['thomais01', 'Isiah Thomas',   'PG;G',     4.5, 2.4, 18.2, 3.4, 8.3, 15.0, 1.7, 0.2, 1.7, 'Indiana', 1981],
    ['dumarjo01', 'Joe Dumars',     'SG;PG;G',  4.9, 2.3, 17.2, 2.4, 5.7, 13.1, 0.6, 0.1, 1.1, 'McNeese State', 1985],
    ['rodmade01', 'Dennis Rodman',  'PF;SF;F',  4.2, 4.7,  9.0, 9.4, 1.2,  6.5, 0.1, 0.9, 0.7, 'Southeastern Oklahoma State', 1986],
    ['laimbbi01', 'Bill Laimbeer',  'C;FC',     4.5, 3.2, 13.7, 9.6, 1.8, 11.0, 1.0, 0.4, 0.6, 'Notre Dame', 1979],
    ['aguirma01', 'Mark Aguirre',   'SF;F;GF',  2.2, 1.1, 15.5, 3.5, 1.9, 12.0, 0.6, 0.2, 0.5, 'DePaul', 1981],
    ['sallejo01','John Salley',    'PF;C;FC',  2.3, 2.2,  6.9, 4.6, 1.1,  5.1, 0.0, 1.3, 0.6, 'Georgia Tech', 1986],
    ['johnsvi01', 'Vinnie Johnson', 'SG;G',     2.2, 1.0, 13.8, 2.9, 3.3, 11.6, 0.3, 0.2, 0.8, 'Baylor', 1979],
    ['edwarja01', 'James Edwards',  'C;FC',     1.7, 0.9,  7.4, 3.1, 0.6,  6.3, 0.0, 0.4, 0.2, 'Washington', 1977],
  ]},

  { t: 'UTA', s: 1998, record: '62-20', players: [
    ['malonka01', 'Karl Malone',      'PF;F;FC', 11.7, 4.7, 27.0, 10.3, 3.9, 19.4, 0.1, 0.9, 1.2, 'Louisiana Tech', 1985],
    ['stockjo01', 'John Stockton',    'PG;G',     7.1, 2.5, 12.0,  2.7, 8.5,  8.4, 1.6, 0.2, 1.6, 'Gonzaga', 1984],
    ['hornaje01', 'Jeff Hornacek',    'SG;PG;G',  5.7, 1.9, 14.2,  2.9, 3.0, 10.0, 2.3, 0.1, 1.4, 'Iowa State', 1986],
    ['russebr01', 'Bryon Russell',    'SF;F;GF',  3.0, 2.0, 11.4,  4.4, 1.6,  8.5, 2.7, 0.3, 1.2, 'Long Beach State', 1993],
    ['ostergr01', 'Greg Ostertag',    'C;FC',     2.2, 2.5,  7.2,  7.5, 0.5,  5.3, 0.0, 1.9, 0.4, 'Kansas', 1995],
    ['eisleho01', 'Howard Eisley',    'PG;G',     2.3, 1.2,  7.4,  1.5, 3.5,  6.0, 1.4, 0.1, 0.6, 'Boston College', 1994],
    ['carran01',  'Antoine Carr',     'PF;C;FC',  1.6, 0.8,  7.0,  2.4, 0.7,  5.6, 0.0, 0.6, 0.3, 'Wichita State', 1983],
    ['andersh01', 'Shandon Anderson', 'SG;SF;GF', 2.1, 1.0,  7.2,  2.9, 1.4,  5.4, 0.5, 0.2, 0.8, 'Georgia', 1996],
  ]},

  { t: 'SAS', s: 2014, record: '62-20', players: [
    ['leonaka01', 'Kawhi Leonard',  'SF;F;GF',  5.2, 3.4, 12.8, 6.2, 2.0,  9.5, 2.7, 0.8, 1.7, 'San Diego State', 2011],
    ['duncati01', 'Tim Duncan',     'C;PF;FC',  4.9, 4.1, 15.1, 9.7, 3.0, 12.1, 0.0, 1.9, 0.6, 'Wake Forest', 1997],
    ['parketo01', 'Tony Parker',    'PG;G',     5.8, 1.6, 16.7, 2.3, 5.7, 13.0, 0.9, 0.1, 0.5, null, 2001],
    ['ginobma01', 'Manu Ginobili',  'SG;G;GF',  4.9, 1.8, 12.3, 3.0, 4.3,  9.3, 3.9, 0.2, 1.0, null, 1999],
    ['splitti01', 'Tiago Splitter', 'C;FC',     3.1, 2.2,  8.2, 5.0, 1.2,  5.5, 0.0, 0.7, 0.6, null, 2007],
    ['diawbo01',  'Boris Diaw',     'PF;SF;F',  2.8, 1.8,  9.1, 4.1, 2.8,  6.9, 1.9, 0.4, 0.5, null, 2003],
    ['greenda02','Danny Green',     'SG;SF;GF', 3.2, 2.0,  9.1, 3.4, 1.5,  7.0, 4.7, 0.9, 1.0, 'North Carolina', 2009],
    ['millspa02','Patty Mills',     'PG;G',     3.7, 1.2, 10.2, 2.1, 1.8,  8.2, 4.4, 0.1, 0.8, "Saint Mary's", 2009],
  ]},

  { t: 'BOS', s: 2008, record: '66-16', players: [
    ['garneke01', 'Kevin Garnett',    'PF;C;FC', 7.2, 5.5, 18.8, 9.2, 3.4, 14.0, 0.1, 1.3, 1.4, null, 1995],
    ['piercpa01', 'Paul Pierce',      'SF;F;GF', 7.2, 2.8, 19.6, 5.1, 4.5, 14.2, 4.1, 0.5, 1.3, 'Kansas', 1998],
    ['allenra02', 'Ray Allen',        'SG;G',    5.9, 2.1, 17.4, 3.7, 3.1, 13.8, 5.7, 0.2, 0.9, 'Connecticut', 1996],
    ['rondora01', 'Rajon Rondo',      'PG;G',    3.5, 2.6, 10.6, 4.2, 5.1,  8.4, 0.5, 0.2, 1.7, 'Kentucky', 2006],
    ['perkike01', 'Kendrick Perkins', 'C;FC',    2.2, 2.3,  6.9, 6.1, 1.3,  5.0, 0.0, 1.5, 0.4, null, 2003],
    ['poseyja01', 'James Posey',      'SF;F;GF', 2.8, 1.9,  7.4, 4.4, 1.5,  5.4, 3.4, 0.3, 0.8, 'Xavier', 1999],
    ['houseed01', 'Eddie House',      'PG;SG;G', 2.3, 0.7,  7.5, 1.6, 1.3,  6.2, 3.0, 0.1, 0.5, 'Arizona State', 2000],
    ['powele01',  'Leon Powe',        'PF;F;FC', 1.9, 1.0,  7.9, 4.1, 0.5,  5.4, 0.0, 0.3, 0.5, 'California', 2006],
  ]},

  { t: 'HOU', s: 1994, record: '58-24', players: [
    ['olajuha01', 'Hakeem Olajuwon',  'C;FC',     8.2, 6.2, 27.3, 11.9, 3.6, 20.9, 0.2, 3.7, 1.6, 'Houston', 1984],
    ['thorpot01', 'Otis Thorpe',      'PF;F;FC',  4.7, 2.6, 14.0, 10.6, 2.0, 10.0, 0.0, 0.5, 0.9, 'Providence', 1984],
    ['maxweve01', 'Vernon Maxwell',   'SG;G',     2.0, 1.2, 13.4,  2.8, 3.8, 12.3, 4.6, 0.2, 1.4, 'Florida', 1988],
    ['smithke01', 'Kenny Smith',      'PG;G',     3.9, 1.3, 12.8,  1.9, 4.2,  9.5, 3.1, 0.1, 1.0, 'North Carolina', 1987],
    ['horryro01', 'Robert Horry',     'SF;PF;F',  2.2, 2.1,  9.9,  5.4, 2.4,  8.4, 2.0, 1.0, 1.5, 'Alabama', 1992],
    ['cassesa01', 'Sam Cassell',      'PG;G',     2.3, 1.1,  6.7,  1.7, 2.5,  5.6, 1.1, 0.1, 0.8, 'Florida State', 1993],
    ['eliema01',  'Mario Elie',       'SG;SF;GF', 2.7, 1.2,  8.5,  2.9, 1.9,  6.2, 1.4, 0.2, 0.9, 'American International', 1985],
    ['herreca01', 'Carl Herrera',     'PF;F;FC',  1.3, 1.1,  6.2,  4.1, 0.9,  5.0, 0.0, 0.5, 0.6, 'Houston', 1990],
  ]},

  { t: 'TOR', s: 2019, record: '58-24', players: [
    ['leonaka01', 'Kawhi Leonard',    'SF;F;GF',  7.0, 2.9, 26.6, 7.3, 3.3, 18.8, 4.5, 0.4, 1.8, 'San Diego State', 2011],
    ['siakapa01', 'Pascal Siakam',    'PF;F;FC',  5.4, 3.0, 16.9, 6.9, 3.1, 12.0, 2.7, 0.7, 0.9, 'New Mexico State', 2016],
    ['lowryky01', 'Kyle Lowry',       'PG;G',     4.5, 2.6, 14.2, 4.8, 8.7, 10.8, 6.3, 0.4, 1.4, 'Villanova', 2006],
    ['gasolma01', 'Marc Gasol',       'C;FC',     2.1, 2.5,  9.1, 6.6, 3.9,  7.2, 3.4, 0.9, 0.9, null, 2007],
    ['vanvlfr01', 'Fred VanVleet',    'PG;G',     3.2, 1.8, 11.0, 2.6, 4.8,  9.2, 5.3, 0.3, 0.9, 'Wichita State', null],
    ['ibakase01', 'Serge Ibaka',      'C;PF;FC',  4.2, 2.5, 15.0, 8.1, 1.3, 11.4, 1.7, 1.4, 0.4, null, 2008],
    ['greenda02','Danny Green',       'SG;SF;GF', 4.6, 2.1, 10.3, 4.0, 1.6,  7.1, 5.4, 0.7, 0.9, 'North Carolina', 2009],
    ['powelno01', 'Norman Powell',    'SG;G;GF',  2.5, 1.0,  8.6, 2.3, 1.5,  6.5, 2.4, 0.2, 0.8, 'UCLA', 2015],
  ]},

  { t: 'MIL', s: 2021, record: '46-26', players: [
    ['antetgi01', 'Giannis Antetokounmpo', 'PF;F;FC', 6.9, 3.5, 28.1, 11.0, 5.9, 18.0, 3.6, 1.2, 1.2, null, 2013],
    ['middlkh01', 'Khris Middleton',       'SF;F;GF', 4.9, 2.1, 20.4,  6.0, 5.4, 15.3, 5.5, 0.2, 1.1, 'Texas A&M', 2012],
    ['holidjr01', 'Jrue Holiday',          'PG;G',    3.6, 2.4, 17.7,  4.5, 6.1, 13.7, 4.6, 0.6, 1.6, 'UCLA', 2009],
    ['lopezbr01', 'Brook Lopez',           'C;FC',    2.6, 2.3, 12.3,  5.0, 1.1,  9.4, 5.6, 1.5, 0.6, 'Stanford', 2008],
    ['portibo01', 'Bobby Portis',          'PF;C;FC', 3.3, 1.4, 11.4,  7.1, 1.2,  8.4, 2.9, 0.4, 0.6, 'Arkansas', 2015],
    ['connapa01', 'Pat Connaughton',       'SG;SF;GF',2.2, 1.1,  5.7,  4.4, 1.4,  4.8, 3.1, 0.3, 0.5, 'Notre Dame', 2015],
    ['divindo01', 'Donte DiVincenzo',      'SG;G',    1.8, 1.2, 10.4,  5.8, 3.1,  8.7, 4.6, 0.2, 1.1, 'Villanova', 2018],
    ['tuckepj01', 'P.J. Tucker',           'PF;F;FC', 0.7, 1.1,  4.4,  3.2, 0.9,  3.7, 2.4, 0.3, 0.7, 'Texas', 2006],
  ]},

  { t: 'DEN', s: 2023, record: '53-29', players: [
    ['jokicni01', 'Nikola Jokic',              'C;FC',   10.7, 4.2, 24.5, 11.8, 9.8, 14.8, 2.4, 0.7, 1.3, null, 2014],
    ['murraja01', 'Jamal Murray',              'PG;G',    3.8, 1.8, 20.0,  4.1, 6.2, 15.6, 5.7, 0.3, 1.0, 'Kentucky', 2016],
    ['portemi01', 'Michael Porter Jr.',        'SF;F;GF', 3.7, 1.8, 17.4,  5.5, 1.3, 12.8, 5.6, 0.5, 0.6, 'Missouri', 2018],
    ['gordoaa01', 'Aaron Gordon',              'PF;F;FC', 4.2, 2.4, 16.3,  6.6, 3.0, 10.9, 2.2, 0.8, 0.8, 'Arizona', 2014],
    ['caldwke01', 'Kentavious Caldwell-Pope',  'SG;G',    3.5, 1.9, 10.8,  2.4, 2.4,  7.9, 4.4, 0.3, 1.4, 'Georgia', 2013],
    ['brownbr01', 'Bruce Brown',               'SG;SF;GF',2.6, 1.5, 11.5,  4.1, 3.4,  8.6, 2.7, 0.4, 0.8, 'Miami (FL)', 2018],
    ['braunch01', 'Christian Braun',           'SG;G;GF', 1.5, 0.8,  4.7,  2.5, 0.8,  3.6, 1.2, 0.2, 0.4, 'Kansas', 2022],
    ['greenje02','Jeff Green',                 'PF;F;FC', 1.8, 0.8,  7.8,  2.5, 1.0,  5.5, 1.3, 0.3, 0.4, 'Georgetown', 2007],
  ]},

  { t: 'DET', s: 2004, record: '54-28', players: [
    ['billuch01', 'Chauncey Billups',   'PG;G',     6.1, 2.3, 16.9,  3.5, 5.7, 12.6, 4.5, 0.2, 1.0, 'Colorado', 1997],
    ['hamilri01', 'Richard Hamilton',   'SG;G',     4.2, 1.8, 17.6,  3.5, 4.0, 14.6, 1.1, 0.2, 1.0, 'Connecticut', 1999],
    ['wallabe01', 'Ben Wallace',        'C;PF;FC',  3.0, 6.5,  9.5, 12.4, 1.7,  7.6, 0.0, 3.0, 1.8, 'Virginia Union', null],
    ['wallara01', 'Rasheed Wallace',    'PF;C;FC',  1.1, 1.1, 13.7,  6.9, 1.7, 11.4, 2.6, 1.5, 0.9, 'North Carolina', 1995],
    ['princta01', 'Tayshaun Prince',    'SF;F;GF',  3.1, 2.3, 10.3,  4.8, 2.3,  8.4, 1.4, 0.7, 0.8, 'Kentucky', 2002],
    ['willico02','Corliss Williamson', 'PF;F;FC',  2.6, 1.1,  9.4,  3.1, 0.8,  7.2, 0.0, 0.3, 0.5, 'Arkansas', 1995],
    ['okurme01', 'Mehmet Okur',         'C;PF;FC',  2.0, 1.4,  9.6,  5.9, 1.1,  7.5, 1.1, 0.5, 0.5, null, 2001],
    ['hunteli01','Lindsey Hunter',      'PG;SG;G',  0.9, 1.0,  4.7,  1.6, 1.6,  4.6, 1.3, 0.1, 1.1, 'Jackson State', 1993],
  ]},

  { t: 'PHI', s: 1983, record: '65-17', players: [
    ['malonmo01', 'Moses Malone',     'C;FC',     9.5, 5.8, 24.5, 15.3, 1.3, 18.0, 0.1, 2.0, 1.1, null, 1974],
    ['ervinju01', 'Julius Erving',    'SF;F;GF',  6.4, 3.2, 21.4,  6.8, 3.7, 15.9, 0.5, 1.8, 1.6, 'Massachusetts', 1972],
    ['toneyan01', 'Andrew Toney',     'SG;G',     3.7, 1.3, 19.7,  2.5, 4.5, 14.7, 0.5, 0.2, 1.1, 'Louisiana-Lafayette', 1980],
    ['cheekma01', 'Maurice Cheeks',   'PG;G',     5.2, 2.8, 12.5,  3.0, 6.9,  9.1, 0.2, 0.3, 2.3, 'West Texas A&M', 1978],
    ['jonesbo01', 'Bobby Jones',      'PF;SF;F',  3.8, 2.8,  9.0,  4.5, 1.9,  6.3, 0.0, 1.1, 1.0, 'North Carolina', 1974],
    ['iavarma01', 'Marc Iavaroni',    'PF;F;FC',  1.5, 1.1,  5.7,  3.5, 1.0,  4.4, 0.0, 0.3, 0.5, 'Virginia', 1978],
    ['richacl01', 'Clint Richardson', 'SG;PG;G',  1.4, 0.8,  6.4,  2.2, 2.2,  5.3, 0.0, 0.2, 0.7, 'Seattle', 1979],
  ]},

  { t: 'DAL', s: 2011, record: '57-25', players: [
    ['nowitdi01', 'Dirk Nowitzki',     'PF;F;FC',  7.3, 2.3, 23.0, 7.0, 2.6, 16.1, 2.0, 0.6, 0.5, null, 1998],
    ['terryja01', 'Jason Terry',       'SG;PG;G',  4.3, 1.7, 15.8, 2.1, 4.1, 12.4, 5.1, 0.2, 1.0, 'Arizona', 1999],
    ['kiddja01',  'Jason Kidd',        'PG;G',     4.0, 2.9,  7.9, 4.4, 8.2,  6.6, 4.5, 0.3, 1.7, 'California', 1994],
    ['chandty01', 'Tyson Chandler',    'C;FC',     4.6, 3.6, 10.1, 9.4, 0.4,  5.6, 0.0, 1.1, 0.5, null, 2001],
    ['mariosh01', 'Shawn Marion',      'SF;PF;F',  3.0, 2.4, 12.5, 6.9, 1.3,  9.9, 0.6, 0.5, 0.9, 'UNLV', 1999],
    ['bareajo01', 'J.J. Barea',        'PG;G',     2.4, 1.0,  9.5, 2.0, 3.9,  7.7, 1.9, 0.1, 0.5, 'Northeastern', null],
    ['stojape01', 'Peja Stojakovic',   'SF;F;GF',  1.0, 0.4,  8.6, 2.2, 1.0,  6.9, 3.9, 0.1, 0.4, null, 1996],
    ['stevede01', 'DeShawn Stevenson', 'SG;G',     1.2, 0.8,  5.0, 1.7, 1.0,  4.2, 2.6, 0.1, 0.5, null, 2000],
  ]},

  { t: 'HOU', s: 2018, record: '65-17', players: [
    ['hardeja01', 'James Harden',      'SG;PG;G', 12.1, 3.3, 30.4,  5.4, 8.8, 20.1, 10.0, 0.7, 1.8, 'Arizona State', 2009],
    ['paulch01',  'Chris Paul',        'PG;G',     6.5, 2.9, 18.6,  5.4, 7.9, 14.2,  6.6, 0.2, 1.7, 'Wake Forest', 2005],
    ['capelca01', 'Clint Capela',      'C;FC',     6.2, 3.7, 13.9, 10.8, 0.9,  8.8,  0.0, 1.9, 0.8, null, 2014],
    ['arizatr01', 'Trevor Ariza',      'SF;F;GF',  2.8, 2.3, 11.7,  4.4, 1.6,  9.5,  6.6, 0.3, 1.4, 'UCLA', 2004],
    ['gordoer01', 'Eric Gordon',       'SG;G',     3.5, 1.5, 18.0,  2.5, 2.2, 14.3,  8.7, 0.4, 0.6, 'Indiana', 2008],
    ['tuckepj01', 'P.J. Tucker',       'PF;F;FC',  2.3, 2.1,  6.2,  5.6, 1.2,  5.2,  3.7, 0.3, 1.0, 'Texas', 2006],
    ['mbahalu01', 'Luc Mbah a Moute',  'SF;PF;F',  2.1, 1.5,  7.5,  3.0, 0.7,  5.9,  2.4, 0.4, 1.0, 'UCLA', 2008],
    ['anderry01', 'Ryan Anderson',     'PF;C;FC',  1.6, 0.8,  9.3,  5.0, 1.1,  7.5,  5.2, 0.4, 0.4, 'California', 2008],
  ]},

  { t: 'LAL', s: 1972, record: '69-13', players: [
    ['westje01',  'Jerry West',       'PG;SG;G',  9.5, 3.0, 25.8,  4.2, 9.7, 20.0, 0.0, 0.5, 2.6, 'West Virginia', 1960],
    ['chambwi01', 'Wilt Chamberlain', 'C;FC',     6.5, 7.0, 14.8, 19.2, 4.0, 10.2, 0.0, 3.0, 0.7, 'Kansas', 1959],
    ['goodrga01', 'Gail Goodrich',    'SG;PG;G',  8.4, 2.0, 25.9,  3.4, 4.5, 20.6, 0.0, 0.2, 1.4, 'UCLA', 1965],
    ['hairsha01', 'Happy Hairston',   'PF;F;FC',  4.2, 2.8, 13.1, 13.1, 2.2,  9.8, 0.0, 0.5, 1.0, 'NYU', 1964],
    ['mcmilji01', 'Jim McMillian',    'SF;F;GF',  4.2, 1.8, 18.8,  6.5, 2.8, 15.5, 0.0, 0.3, 1.1, 'Columbia', 1970],
    ['robinfl01', 'Flynn Robinson',   'PG;G',     1.8, 0.6,  7.2,  1.3, 1.8,  6.4, 0.0, 0.1, 0.5, 'Wyoming', 1965],
    ['rileypa01', 'Pat Riley',        'SG;G;GF',  0.7, 0.5,  6.7,  1.6, 1.2,  6.0, 0.0, 0.1, 0.6, 'Kentucky', 1967],
  ]},

  { t: 'CLE', s: 2016, record: '57-25', players: [
    ['jamesle01', 'LeBron James',        'SF;PF;F',  9.6, 4.0, 25.3, 7.4, 6.8, 17.6, 3.7, 0.6, 1.4, null, 2003],
    ['irvinky01', 'Kyrie Irving',        'PG;G',     3.7, 1.2, 19.6, 3.0, 4.7, 16.2, 4.5, 0.3, 1.1, 'Duke', 2011],
    ['loveke01',  'Kevin Love',          'PF;C;FC',  4.5, 2.4, 16.0, 9.9, 2.4, 12.7, 5.3, 0.5, 0.8, 'UCLA', 2008],
    ['thomptr01', 'Tristan Thompson',    'C;PF;FC',  3.4, 3.0,  7.8, 9.0, 0.8,  5.7, 0.0, 0.6, 0.6, 'Texas', 2011],
    ['smithjr01', 'J.R. Smith',          'SG;G;GF',  2.9, 1.5, 12.4, 2.8, 1.7,  9.9, 6.0, 0.3, 1.1, null, 2004],
    ['shumpim01', 'Iman Shumpert',       'SG;SF;GF', 1.2, 1.3,  5.4, 2.9, 1.4,  4.8, 2.4, 0.3, 1.0, 'Georgia Tech', 2011],
    ['fryech01',  'Channing Frye',       'PF;C;FC',  1.5, 0.7,  7.5, 3.2, 0.8,  5.5, 3.1, 0.5, 0.4, 'Arizona', 2005],
    ['dellama01', 'Matthew Dellavedova', 'PG;G',     1.6, 1.0,  7.5, 1.9, 4.4,  6.0, 3.2, 0.1, 0.6, "Saint Mary's", null],
  ]},

  { t: 'ORL', s: 1995, record: '57-25', players: [
    ['onealsh01', "Shaquille O'Neal",   'C;FC',    9.6, 4.5, 29.3, 11.4, 2.7, 19.9, 0.0, 2.4, 0.9, 'LSU', 1992],
    ['hardaan01', 'Anfernee Hardaway', 'PG;SG;G', 7.8, 3.1, 20.9,  4.4, 7.2, 15.8, 2.4, 0.3, 1.7, 'Memphis', 1993],
    ['grantho01',  'Horace Grant',      'PF;F;FC', 4.9, 3.7, 12.8,  9.7, 2.4,  9.5, 0.0, 1.2, 1.1, 'Clemson', 1987],
    ['anderni01', 'Nick Anderson',     'SG;SF;GF',5.4, 2.0, 15.8,  5.4, 3.7, 11.9, 4.3, 0.5, 1.6, 'Illinois', 1989],
    ['scottde01', 'Dennis Scott',      'SF;F;GF', 2.7, 1.0, 12.9,  2.9, 2.1, 10.3, 5.7, 0.3, 0.8, 'Georgia Tech', 1990],
    ['shawbr01',  'Brian Shaw',        'PG;SG;G', 1.1, 0.9,  5.9,  2.5, 3.1,  5.4, 2.0, 0.2, 0.6, 'UC Santa Barbara', 1988],
    ['royaldo01', 'Donald Royal',      'SF;F;GF', 1.5, 0.9,  7.1,  3.2, 1.1,  4.7, 0.0, 0.2, 0.6, 'Notre Dame', 1987],
  ]},
];

/* Flatten the table into one row per player-season, which is the shape the
   pricing step and the engine both read. */
export function seedPlayerSeasons() {
  const out = [];
  for (const ts of SEED_TEAM_SEASONS) {
    for (const row of ts.players) {
      const [i, n, ep, ow, dw, pts, reb, ast, fga, tpa, blk, stl, col, dr] = row;
      out.push({
        i, n,
        s: ts.s,
        t: ts.t,
        pp: ep.split(';')[0],
        ep,
        ow, dw,
        w: Math.round((ow + dw) * 10) / 10,
        pts, reb, ast, fga, tpa, blk, stl,
        col: col || null,
        dr: dr || null,
      });
    }
  }
  return out;
}
