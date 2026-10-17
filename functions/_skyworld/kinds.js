/* Which landmark an island gets: the game's own, else its sport read from its name and its notes,
 * else the big top. The landmarks themselves are drawn by web/m/landmarks.js; a new one is a builder
 * there and a line here. */
export const OWN = { football:'football', cfb:'college', golf:'green', baseball:'ballpark', soccer:'pitch', arcade:'arcade', setlist:'stage',
  stumpire:'umpire', arcadelab:'lab', lastshot:'court', '4thandwhat':'chains', hoops:'arena', mythiball:'ruins', wrestling:'ring', shutthedoor:'bullpen' };
const SPORT = [[/basket|hoop|nba|court/i, 'court'], [/college|cfb/i, 'college'], [/baseball|diamond|mlb|closer|bullpen/i, 'ballpark'],
  [/football|nfl|gridiron/i, 'football'], [/golf|putt/i, 'green'], [/soccer|world cup|futbol/i, 'pitch'], [/wrestl|ropes/i, 'ring'],
  [/music|setlist|concert|band/i, 'stage'], [/arcade|quiz|trivia|puzzle/i, 'arcade']];
export const KINDS = ['hq', 'broadcast', 'football', 'college', 'green', 'ballpark', 'pitch', 'arcade', 'stage', 'umpire', 'lab', 'court', 'chains', 'arena', 'ruins', 'ring', 'bullpen', 'bigtop'];
export function kindOf(key, text){ if (OWN[key]) return OWN[key]; for (const [re, k] of SPORT) if (re.test(text || '')) return k; return 'bigtop'; }
