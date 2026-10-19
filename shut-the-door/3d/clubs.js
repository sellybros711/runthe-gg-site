/* The 30 MLB clubs: the city, the nickname (the words on the chest), and the two club colours.
 *
 * Team colours are facts; the hex values here are approximations for a fan project. They were not
 * checked against each club's official palette, so verify them before launch. Names are the current
 * club names. SERIES names the other club in a World Series or Wild Card game, whose title does not
 * say it (the title names only the two clubs of a regular season game).
 *
 * Used by people.js (kitFor): the closer's club is the pack's pitcher.team, the hitters' club is the
 * other club of the scenario's title ("Dodgers at Royals, June 27, 2025") or of SERIES.
 */

export const CLUBS = [
  { city: 'Baltimore', nick: 'Orioles', pri: '#DF4601', sec: '#000000' },
  { city: 'Boston', nick: 'Red Sox', pri: '#BD3039', sec: '#0C2340' },
  { city: 'New York', nick: 'Yankees', pri: '#0C2340', sec: '#C4CED3' },
  { city: 'Tampa Bay', nick: 'Rays', pri: '#092C5C', sec: '#8FBCE6' },
  { city: 'Toronto', nick: 'Blue Jays', pri: '#134A8E', sec: '#E8291C' },
  { city: 'Chicago', nick: 'White Sox', pri: '#27251F', sec: '#C4CED4' },
  { city: 'Cleveland', nick: 'Guardians', pri: '#00385D', sec: '#E31937' },
  { city: 'Detroit', nick: 'Tigers', pri: '#0C2340', sec: '#FA4616' },
  { city: 'Kansas City', nick: 'Royals', pri: '#004687', sec: '#BD9B60' },
  { city: 'Minnesota', nick: 'Twins', pri: '#002B5C', sec: '#D31145' },
  { city: 'Houston', nick: 'Astros', pri: '#002D62', sec: '#EB6E1F' },
  { city: 'Los Angeles', nick: 'Angels', pri: '#BA0021', sec: '#003263' },
  { city: 'Oakland', nick: 'Athletics', pri: '#003831', sec: '#EFB21E' },
  { city: 'Seattle', nick: 'Mariners', pri: '#0C2C56', sec: '#005C5C' },
  { city: 'Texas', nick: 'Rangers', pri: '#003278', sec: '#C0111F' },
  { city: 'Atlanta', nick: 'Braves', pri: '#CE1141', sec: '#13274F' },
  { city: 'Miami', nick: 'Marlins', pri: '#00A3E0', sec: '#EF3340' },
  { city: 'New York', nick: 'Mets', pri: '#002D72', sec: '#FF5910' },
  { city: 'Philadelphia', nick: 'Phillies', pri: '#E81828', sec: '#002D72' },
  { city: 'Washington', nick: 'Nationals', pri: '#AB0003', sec: '#14225A' },
  { city: 'Chicago', nick: 'Cubs', pri: '#0E3386', sec: '#CC3433' },
  { city: 'Cincinnati', nick: 'Reds', pri: '#C6011F', sec: '#000000' },
  { city: 'Milwaukee', nick: 'Brewers', pri: '#12284B', sec: '#FFC52F' },
  { city: 'Pittsburgh', nick: 'Pirates', pri: '#27251F', sec: '#FDB827' },
  { city: 'St. Louis', nick: 'Cardinals', pri: '#C41E3A', sec: '#0C2340' },
  { city: 'Arizona', nick: 'Diamondbacks', pri: '#A71930', sec: '#E3D4AD' },
  { city: 'Colorado', nick: 'Rockies', pri: '#33006F', sec: '#C4CED4' },
  { city: 'Los Angeles', nick: 'Dodgers', pri: '#005A9C', sec: '#FFFFFF' },
  { city: 'San Diego', nick: 'Padres', pri: '#2F241D', sec: '#FFC425' },
  { city: 'San Francisco', nick: 'Giants', pri: '#FD5A1E', sec: '#27251F' },
];

// the other club of a World Series or Wild Card game (keyed by scenario id); `as` is the name the club
// wore on the chest at the time, when it has changed since
export const SERIES = {
  'std-1988-ws1-eckersley': { club: 'Los Angeles Dodgers' },
  'std-2001-ws7-rivera': { club: 'Arizona Diamondbacks' },
  'std-2011-ws6-feliz': { club: 'St. Louis Cardinals' },
  'std-2016-ws7-chapman': { club: 'Cleveland Guardians', as: 'Indians' },
  'std-2019-nlwc-hader': { club: 'Washington Nationals' },
  'std-2022-ws6-pressly': { club: 'Philadelphia Phillies' },
  'std-2024-ws5-buehler': { club: 'New York Yankees' },
  'std-2025-ws7-yamamoto': { club: 'Toronto Blue Jays' },
};

const norm = (s) => String(s || '').trim().toLowerCase();

/** The club a name points at: the full name ("Los Angeles Dodgers"), the nickname ("Dodgers") or a
    name ending in the nickname ("Oakland Athletics"). null when no club fits. */
export function clubNamed(name) {
  const n = norm(name);
  if (!n) return null;
  return CLUBS.find((c) => n === norm(`${c.city} ${c.nick}`) || n === norm(c.nick) || n.endsWith(` ${norm(c.nick)}`)) || null;
}

/** The hitters' club for a scenario: the title's other club, else the series table. null when neither
    says (the caller then uses a neutral kit with no words). */
export function battingClub(facts) {
  const pitch = clubNamed(facts.pitcher && facts.pitcher.team);
  const m = /^(.*?)\s+at\s+(.*?)(?:,|$)/i.exec(facts.title || '');
  if (m && pitch) {
    const a = clubNamed(m[1]), b = clubNamed(m[2]);
    if (a && a === pitch && b) return b;
    if (b && b === pitch && a) return a;
  }
  const s = SERIES[facts.scenarioId];
  const c = s ? clubNamed(s.club) : null;
  if (c && c !== pitch) return { ...c, as: s.as || null };
  return null;
}
