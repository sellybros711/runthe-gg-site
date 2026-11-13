/* WHICH QUARTERBACK STARTS FOR EACH TEAM, read off the box scores this mode already keeps.
 *
 * The owner, 2026-11-12, on the NFL board: a backup quarterback priced above the starter,
 * and "Feels like there needs to be a little more rhyme and reason and thought into the
 * rankings." Then: "Do the same for college football fantasy." The NFL fix reads nflverse's
 * depth chart. College football has no chart this mode can reach: nflverse covers only the
 * NFL, no CFBD key is set, and ESPN's college rosters carry no depth, no injuries and no
 * status (the probe of 2026-09-27: the out and suspended groups empty, every athlete
 * active). So the rule is what the box scores can honestly say, and no more:
 *
 *   THE STARTER IS THE MAN WHO LED HIS TEAM IN PASSING IN ITS LATEST GAME. Passing yards,
 *   because the season store keeps yards, touchdowns and picks but not attempts.
 *
 *   AND THE TEAM'S REGULAR STARTER STAYS TOO, UNLESS HE HAS BEEN BENCHED. "Regular" is the
 *   man who led its passing in the most games this season (a tie goes to the more recent).
 *   The owner, 2026-11-12: "If a player missed 2 games but is coming back, their price
 *   should be based on what it was as a starter." The box scores cannot say he is coming
 *   back, so a regular who is simply ABSENT stays, however many games, priced on his starts
 *   and wearing the MISSED chip. What the box scores CAN say is a benching: since his last
 *   start he has played behind the new man, in a box score with under half the leader's
 *   passing yards. Then he is a backup. Cases off the week 11 board:
 *     Ohio State: Julian Sayin led seven, then is in neither of the last two box scores, and
 *       Luke Fahey led both. Absent, so both start.
 *     Florida: Aaron Philo led six, then threw for 26 behind Tramell Jones Jr.'s 172 in
 *       week 9. Benched, so only Jones starts.
 *     Indiana: Josh Hoover threw for 119 to Grant Wilson's 156 in week 9. Not under half,
 *       so a blowout or a knock and not a lost job. Both start.
 *     Kansas: Cole Ballard led one game while Isaiah Marshall was out, and Marshall led the
 *       next. Marshall is the regular and the latest, so Ballard is a backup.
 *   Two quarterbacks from one team is fine when the data cannot tell them apart.
 *
 *   A TEAM THE STORE CANNOT SPEAK FOR SAYS NOTHING, and nobody of its comes off. Before the
 *   store holds the week just played (a box score was missing, or it is week 1), or a team
 *   whose latest stored game is more than two weeks back. The safe direction is the board
 *   as it was, which is the NFL rule for a stale chart.
 *
 * WHAT IT CANNOT SEE, said rather than implied: a quarterback named the starter during the
 * week (he reads as a backup until he has led a game), whether an absent regular is hurt,
 * benched or coming back (he stays), and a benching announced before kickoff. The swap covers what the data cannot: any man can be
 * swapped before his game.
 *
 * Pure, off the season store, so the Monday build and the mid-week job read one answer.
 */

/* The passing yards column of a stored row (season.mjs: id, team, game, pts, line, stats). */
const PASS_YDS = 5;
/* Under this share of the leader's passing yards, a regular who played was playing behind. */
export const BEHIND_SHARE = 0.5;

/**
 * @returns {{ ready: boolean, teams: Map<string, { starters: Set<string>, latest: string }>,
 *            starts: Map<string, { n: number, pts: number }>, starter: Set<string> }}
 *   `teams` holds only the teams the store can speak for. `starts` is each starter's games
 *   as his team's passing leader, all season, and the points he scored in them.
 */
export function quarterbacks(store, week) {
  const teams = new Map(), starts = new Map(), starter = new Set();
  const out = { ready: false, teams, starts, starter };
  if (!(week > 1) || !store || !store.weeks || !store.weeks[String(week - 1)]) return out;
  out.ready = true;

  /* Every team's games, in kickoff order, with who led its passing and who was in its box. */
  const games = new Map();
  for (const w of Object.keys(store.weeks).map(Number).filter((x) => x < week)) {
    const wk = store.weeks[String(w)];
    const box = new Map();
    for (const r of wk.rows) {
      const k = r[2] + '|' + r[1];
      if (!box.has(k)) box.set(k, []);
      box.get(k).push(r);
    }
    for (const [gid, hid, aid, , , kick] of wk.games) {
      for (const tid of [hid, aid]) {
        const rows = box.get(gid + '|' + tid) || [];
        let lead = null;
        for (const r of rows) {
          const y = Number(r[PASS_YDS]) || 0;
          if (y <= 0) continue;
          if (!lead || y > Number(lead[PASS_YDS])
            || (y === Number(lead[PASS_YDS]) && String(r[0]) < String(lead[0]))) lead = r;
        }
        if (!games.has(tid)) games.set(tid, []);
        games.get(tid).push({ gid, w, kick: String(kick), lead: lead ? String(lead[0]) : null,
          leadYds: lead ? Number(lead[PASS_YDS]) : 0, pts: lead ? Number(lead[3]) || 0 : 0,
          yds: new Map(rows.map((r) => [String(r[0]), Number(r[PASS_YDS]) || 0])) });
      }
    }
  }

  for (const [tid, gs] of games) {
    gs.sort((a, b) => a.kick.localeCompare(b.kick));
    for (const g of gs) {
      if (!g.lead) continue;
      const s = starts.get(g.lead) || { n: 0, pts: 0 };
      s.n++; s.pts += g.pts; starts.set(g.lead, s);
    }
    const last = gs[gs.length - 1];
    if (!last || !last.lead || last.w < week - 2) continue;
    const set = new Set([last.lead]);
    /* The regular: most games led this season, the more recent on a tie. */
    const tally = new Map();
    gs.forEach((g, i) => {
      if (!g.lead) return;
      const t = tally.get(g.lead) || { n: 0, at: -1 };
      t.n++; t.at = i; tally.set(g.lead, t);
    });
    let regular = null, best = null;
    for (const [id, t] of tally) {
      if (!best || t.n > best.n || (t.n === best.n && t.at > best.at)) { regular = id; best = t; }
    }
    if (regular && regular !== last.lead) {
      const after = gs.slice(best.at + 1);
      const benched = after.some((g) => g.yds.has(regular)
        && g.yds.get(regular) < BEHIND_SHARE * g.leadYds);
      if (!benched) set.add(regular);
    }
    teams.set(tid, { starters: set, latest: last.lead });
    for (const id of set) starter.add(id);
  }
  return out;
}

/**
 * The quarterbacks on a board who are not starting: a QB whose team the store speaks for and
 * who is not one of its starters. A starter for any team stays.
 */
export function backupQBs(roles, men) {
  const out = new Set();
  if (!roles || !roles.ready) return out;
  for (const m of men) {
    if (m.position !== 'QB' || roles.starter.has(m.player_id)) continue;
    if (roles.teams.has(m.team_id)) out.add(m.player_id);
  }
  return out;
}
