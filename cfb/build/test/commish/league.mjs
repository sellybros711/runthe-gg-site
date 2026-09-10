/* THE TEAM FILE THE MODE ACTUALLY OPENS ON, resolved the same way the page resolves it.
 *
 * Commish prefers cfb/data/cfb_fbs.json, which is the whole division, and falls back to the
 * draft game's cfb_team_seasons.json, which is seventy power schools. A suite that hard-coded
 * the fallback would be testing a league no player is ever served: the two files differ by
 * sixty-six schools and five conferences, and every property worth asserting here (who fills
 * the bracket, whether a conference can be starved, whether a schedule can be built at all)
 * is a property of the LEAGUE rather than of the engine in the abstract.
 *
 * Kept beside the page's own loader on purpose. If one changes which file wins, the other has
 * to change with it, or the suite goes green against a league that is not being played.
 */
import fs from 'fs';
import path from 'path';

const POWERS = ['SEC', 'Big Ten', 'ACC', 'Big 12'];

export function leagueTeams(ROOT) {
  const full = path.join(ROOT, 'cfb/data/cfb_fbs.json');
  if (fs.existsSync(full)) {
    const rows = JSON.parse(fs.readFileSync(full, 'utf8'));
    const cur = rows.filter((t) => t.season === 2025);
    const g5 = cur.filter((t) => !POWERS.includes(t.conference)).length;
    /* The same two numbers the page checks before trusting it. */
    if (cur.length >= 110 && g5 >= 50) return rows;
    console.log('  note: cfb_fbs.json looks wrong, testing against the draft game file');
  }
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'cfb/data/cfb_team_seasons.json'), 'utf8'));
}
