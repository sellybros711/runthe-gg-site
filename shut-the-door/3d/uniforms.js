/* What each club really wore, and how far the hex values in clubs.js have been checked.
 *
 * Two tables. CLUB_CHECK says which clubs.js colours were checked and against what. KITS says, per
 * scenario and side, which parts of the uniform differ from the generic kit (white at home, grey on
 * the road, the club's darker colour as trim) and the source for each. A side that has no entry here, or
 * an entry with no `cap`, wears the generic kit. Nothing here is a guess: where a source could not be
 * reached the kit stays generic and `basis` says "assumed".
 *
 * Sources reachable from the build container (2026-10-21): statsapi.mlb.com has no colour data, and
 * web.archive.org, wikipedia.org, mlb.com, sportslogos.net and teamcolorcodes.com were refused. What
 * was reachable:
 *   REF_A  github.com/camdenk/mlbplotR, R/sysdata.rda (teams_colors_logos), branch main, read 2026-10-21.
 *   REF_B  github.com/jimniels/teamcolors, src/teams.json, branch master, read 2026-10-21 (older).
 * Both are third party compilations of the clubs' colours, not the clubs' own style guides. Uniform facts
 * come from web search result text that quoted the pages named in each `basis`; the pages themselves
 * could not be opened.
 */

// clubs.js colours that match REF_A: all 30 except the Guardians' navy. REF_A has the Guardians at
// #0C2340 and clubs.js has #00385D; REF_B predates the name and has neither, so it stays unverified.
// The Dodgers' second colour is white, the jersey itself, which no palette lists.
export const CLUB_CHECK = {
  unverified: { Guardians: 'primary #00385D is not in REF_A (#0C2340), left as it was' },
  source: 'REF_A, matched case-insensitively; REF_B agrees on 16 of 30 clubs and is older',
};
export const isVerified = (club) => !!club && !(club.nick in CLUB_CHECK.unverified);

const RED_NATS = '#AB0003', RED_STL = '#C41E3A';

/* cap: the colour of the cap crown, which is also the batting helmet. basis: what the side wears. */
export const KITS = {
  'std-1988-ws1-eckersley': {
    us: { basis: 'assumed road grey (Athletics at Dodger Stadium); generic kit' },
    them: { basis: 'assumed home white; generic kit' },
  },
  'std-2001-ws7-rivera': {
    us: { basis: 'assumed road grey; generic kit' },
    them: { basis: 'assumed home white. The real 2001 home top was cream with purple pinstripes and the palette was purple, teal, copper and black (Wikipedia, as quoted by a web search). No hex was reachable, so the club entry (the 2007 sedona red) is NOT 2001 accurate' },
  },
  'std-2011-ws6-feliz': {
    us: { basis: 'road grey (Rangers road uniform 2009-2013, sportslogos.net and the Rangers history page on mlb.com, as quoted by a web search); cap left as the club blue' },
    them: { cap: RED_STL, basis: 'home white (Baseball Hall of Fame record of a Game 6 jersey, as quoted by a web search); red cap (Hall of Fame record of a 2011 World Series cap)' },
  },
  'std-2016-ws7-chapman': {
    us: { basis: 'assumed road grey; generic kit' },
    them: { basis: 'assumed home white. A search quoted cleveland.com saying the Indians wore their navy alternate often in the 2016 run, but not for Game 7, so nothing is changed' },
  },
  'std-2019-nlwc-hader': {
    us: { basis: 'road grey with navy and gold piping (Brewers road uniform 2000-2019, sportslogos.net, as quoted by a web search)' },
    them: { cap: RED_NATS, basis: 'home white with the red cap (MASN recap and sportslogos.net, as quoted by a web search)' },
  },
  'std-2022-ws6-pressly': {
    us: { basis: 'home white (Astros home whites, sportslogos.net news, as quoted by a web search)' },
    them: { basis: 'assumed road grey; generic kit. The Phillies cap is red but no 2022 source was reachable, so the helmet stays the darker club colour' },
  },
  'std-2024-ws5-buehler': {
    us: { basis: 'assumed road grey; generic kit' },
    them: { basis: 'home (pinstripes at home, mlb.com Yankees news, as quoted by a web search). Pinstripes are not drawn: plain white' },
  },
  'std-2025-diaz-cin': {
    us: { basis: 'road grey with a blue cap (Mets 2025 road uniform, SNY and Bleacher Report, as quoted by a web search)' },
    them: { basis: 'assumed home white; generic kit. The Reds cap is red but no current source was reachable, so the helmet stays black' },
  },
  'std-2025-scott-kc': {
    us: { basis: 'assumed road grey; generic kit' },
    them: { basis: 'assumed home white; generic kit' },
  },
  'std-2025-ws7-yamamoto': {
    us: { basis: 'assumed road grey; generic kit' },
    them: { basis: 'assumed home white; generic kit' },
  },
};

/** The cap (and batting helmet) colour a side really wore, or null for the generic kit. */
export function capFor(scenarioId, side) {
  const k = KITS[scenarioId];
  return (k && k[side] && k[side].cap) || null;
}
