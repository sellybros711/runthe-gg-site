/* What the clubs really wore, where a source could be read: the caps and the front numbers so far.
 *
 * CLUB_CHECK says which clubs.js colours match a palette and which do not. CAPS gives the cap (and
 * batting helmet) colour a side really wore in a scenario. A side with no entry wears the generic kit,
 * whose cap is the club's trim colour, as before. FRONT gives the number on the jersey's front for a
 * side whose real jersey carried one that day (people.js draws it under the club's words).
 *
 * Sources reachable from the build container (2026-10-21): statsapi.mlb.com has no colour data, and
 * web.archive.org, wikipedia.org, mlb.com, sportslogos.net and teamcolorcodes.com were refused. What
 * was reachable:
 *   REF_A  github.com/camdenk/mlbplotR, R/sysdata.rda (teams_colors_logos), branch main, read 2026-10-21.
 *   REF_B  github.com/jimniels/teamcolors, src/teams.json, branch master, read 2026-10-21 (older).
 * Both are third party compilations of the clubs' colours, not the clubs' own style guides.
 */

// clubs.js colours that match REF_A: all 30 except the Guardians' navy. REF_A has the Guardians at
// #0C2340 and clubs.js has #00385D, so that one is left as it was.
export const CLUB_CHECK = {
  unverified: { Guardians: 'primary #00385D is not in REF_A (#0C2340), left as it was' },
  source: 'REF_A, matched case-insensitively; REF_B agrees on 16 of 30 clubs and is older',
};
export const isVerified = (club) => !!club && !(club.nick in CLUB_CHECK.unverified);

const RED_NATS = '#AB0003', RED_STL = '#C41E3A';

/* side -> cap colour, for the two scenarios with a sourced cap. Other sides keep the generic cap. */
export const CAPS = {
  // 2011 World Series Game 6, Cardinals home: red cap (Baseball Hall of Fame record of a 2011 cap)
  'std-2011-ws6-feliz': { them: RED_STL },
  // 2019 NL Wild Card, Nationals home: red cap (MASN recap and sportslogos.net)
  'std-2019-nlwc-hader': { them: RED_NATS },
};

/** The cap (and batting helmet) colour a side really wore, or null for the generic kit. */
export function capFor(scenarioId, side) {
  const k = CAPS[scenarioId];
  return (k && k[side]) || null;
}

/* The number on the jersey's front, for the hitters' side of a scenario whose real jersey carried one
 * (the vault decision 2026-10-31-shut-the-door-hitter-looks; only sourced facts, 2026-10-21). Each of
 * the 30 clubs was checked for the scenarios its hitters appear in (the 13 that name the hitters'
 * club: clubs.js battingClub). The sources were read as web search excerpts on 2026-11-01 (the pages
 * themselves were refused from the build container), each named by its page:
 *   at     the wearer's side it sits on, under the club's words: 'L' his left, 'R' his right
 *   color  the number's colour, outline its trim (null: none); color null is the back number's colour
 * Clubs whose hitters wear words and no front number, and why:
 *   Mariners 2008 road: a 2008 road jersey has SEATTLE across the chest and the number on the back
 *     only (Goldin Auctions lot, 2008 Adrian Beltre game used road jersey).
 *   Blue Jays 2025 home: the number on the back only (mlb.com/bluejays, the home uniform).
 *   Phillies 2022 road: the number on the left sleeve (PhillyVoice, 2023-03-30); no source shows one
 *     on the front.
 *   Cardinals 2010, 2011, 2023; Yankees 2024; Padres 2023; Indians 2016: no source shows one.
 *   Diamondbacks 2001 and Reds 2025: the sources disagree or say nothing; left without until one does.
 */
const ROYAL_KC = '#004687', RED_MIN = '#D31145', NAVY_MIN = '#002B5C', RED_LA = '#EF3E42';
export const FRONT = {
  // 1988 World Series Game 1, Dodgers home: red numerals, about five inches, on the wearer's left
  // under the script, on the home jersey since 1952 (toddradom.com, "The Tale of the Dodgers' Red
  // Uniform Numbers"; cbssports.com, the history behind the Dodgers' and Astros' uniforms, 2017).
  // The red is REF_B's Dodgers red.
  'std-1988-ws1-eckersley': { them: { at: 'L', color: RED_LA, outline: null } },
  // 2011, Twins at Yankees, Twins road: the number on the road jersey's front since 1973, in red with
  // navy trim from 2010 (mlb.com/twins, road uniforms; sportslogos.net, Twins 2011 road uniform). The
  // side is not in either source: under the script on the wearer's left, as most clubs wear it.
  'std-2011-rivera-min': { them: { at: 'L', color: RED_MIN, outline: NAVY_MIN } },
  // 2019 NL Wild Card, Nationals home: the home whites carried a front number until 2024, just
  // below the wearer's right ribs, the curly W on his left chest (uni-watch.com, 2024-02-15, the
  // Nationals drop the home whites' front number; justbaseball.com, the Nationals' uniforms ranked).
  // Its colour is not in either source: the back number's.
  'std-2019-nlwc-hader': { them: { at: 'R', color: null, outline: null } },
  // 2025, Dodgers at Royals, Royals home: royal blue numbers on the white home jersey, the outline
  // gone since 2022 (sportslogos.net and uni-watch.com, 2021-11-20, the Royals' 2022 update), under
  // the word Royals (National Archives, Obama Library, a Royals home jersey, number 44). Side as the
  // Twins'.
  'std-2025-scott-kc': { them: { at: 'L', color: ROYAL_KC, outline: null } },
};

/** The front number a side really wore in a scenario ({ at, color, outline }), or null for none. */
export function frontFor(scenarioId, side) {
  const k = FRONT[scenarioId];
  return (k && k[side]) || null;
}
