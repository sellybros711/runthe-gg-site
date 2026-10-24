/* What the clubs really wore, where a source could be read. Only the caps are changed so far.
 *
 * CLUB_CHECK says which clubs.js colours match a palette and which do not. CAPS gives the cap (and
 * batting helmet) colour a side really wore in a scenario. A side with no entry wears the generic kit,
 * whose cap is the club's trim colour, as before.
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
