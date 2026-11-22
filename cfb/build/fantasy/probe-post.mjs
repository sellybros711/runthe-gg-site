/* WHAT ESPN SENDS FOR THE POSTSEASON, printed, for a machine that can reach it.
 *
 *   node cfb/build/fantasy/probe-post.mjs 2025
 *
 * The Playoff Fantasy is built on ESPN's postseason feed (seasontype 3), which the weekly
 * build never reads. This prints, for a finished postseason, how the Playoff games are told
 * apart from the other bowls, which round each is, the seeds, the odds, and the box score
 * of one game. It writes nothing.
 */
const [season = '2025'] = process.argv.slice(2);
const ESPN = 'https://site.web.api.espn.com/apis/site/v2/sports/football/college-football';
const UA = {
  accept: 'application/json, text/plain, */*',
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    + ' (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
};
const cut = (v, n = 1600) => {
  const s = JSON.stringify(v);
  if (s === undefined) return 'undefined';
  return s.length > n ? s.slice(0, n) + ` ...(${s.length} chars)` : s;
};
async function get(url) {
  try {
    const r = await fetch(url, { headers: UA });
    const t = await r.text();
    let j = null;
    try { j = JSON.parse(t); } catch { /* not json */ }
    return { status: r.status, j };
  } catch (e) {
    return { status: 0, j: null, why: String(e && e.message) };
  }
}

for (const [label, q] of [
  ['postseason, week 1', `dates=${season}&seasontype=3&week=1`],
  ['postseason, no week', `dates=${season}&seasontype=3`],
  ['postseason, FBS only', `groups=80&dates=${season}&seasontype=3&week=1`],
]) {
  const r = await get(`${ESPN}/scoreboard?${q}&limit=300`);
  const evs = (r.j && r.j.events) || [];
  console.log(`\n==== ${label}: HTTP ${r.status}, ${evs.length} events ${r.why || ''}`);
  if (r.j && r.j.leagues) console.log('calendar', cut(r.j.leagues[0] && r.j.leagues[0].calendar, 1200));
  for (const e of evs) {
    const c = (e.competitions || [])[0] || {};
    const notes = (c.notes || []).map((n) => n.headline).join(' | ');
    const teams = (c.competitors || []).map((t) => `${t.homeAway}:${t.team && t.team.abbreviation}`
      + `(rank ${t.curatedRank && t.curatedRank.current}, seed ${t.seed ?? '-'}, score ${t.score}, winner ${t.winner})`);
    console.log(`  ${e.id} ${e.date} ${(c.status && c.status.type && c.status.type.state) || '?'}`
      + ` | ${notes || '(no notes)'} | type ${cut(c.type, 80)} | ${teams.join(' v ')}`
      + ` | odds ${c.odds ? cut(c.odds[0] && { d: c.odds[0].details, s: c.odds[0].spread, o: c.odds[0].overUnder,
        ml: [c.odds[0].homeTeamOdds && c.odds[0].homeTeamOdds.moneyLine, c.odds[0].awayTeamOdds && c.odds[0].awayTeamOdds.moneyLine] }, 200) : 'none'}`);
  }
  const cfp = evs.find((e) => /playoff|cfp/i.test(JSON.stringify(((e.competitions || [])[0] || {}).notes || [])));
  if (cfp) {
    console.log('\n  one Playoff game, competition keys:', Object.keys(cfp.competitions[0]).join(','));
    console.log('  competitor keys:', Object.keys(cfp.competitions[0].competitors[0]).join(','));
    console.log('  event keys:', Object.keys(cfp).join(','), '| season', cut(cfp.season, 200));
  }
}

/* One finished Playoff game's box score, to see the stat rows match the weekly ones. */
const r = await get(`${ESPN}/scoreboard?dates=${season}&seasontype=3&week=1&limit=300`);
const done = ((r.j && r.j.events) || []).find((e) => /playoff|cfp/i.test(JSON.stringify(e.competitions[0].notes || []))
  && e.competitions[0].status.type.state === 'post');
if (done) {
  const s = await get(`${ESPN}/summary?event=${done.id}`);
  console.log(`\n==== summary ${done.id}: HTTP ${s.status}`);
  const b = s.j && s.j.boxscore;
  console.log('players groups', b && b.players && b.players.length,
    'first team stat names', cut(b && b.players && b.players[0].statistics.map((x) => x.name), 400));
}

/* This season, before the bracket is set: does ESPN list the Playoff games yet? */
const now = await get(`${ESPN}/scoreboard?dates=${Number(season) + 1}&seasontype=3&week=1&limit=300`);
const nevs = (now.j && now.j.events) || [];
console.log(`\n==== ${Number(season) + 1} postseason so far: HTTP ${now.status}, ${nevs.length} events`);
for (const e of nevs.slice(0, 15)) {
  const c = e.competitions[0];
  console.log(`  ${e.id} ${e.date} | ${(c.notes || []).map((n) => n.headline).join(' | ') || '(no notes)'} | ${e.name}`);
}
