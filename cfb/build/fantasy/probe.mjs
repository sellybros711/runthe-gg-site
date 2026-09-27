/* WHAT THE REAL FEEDS SEND, printed, for a machine that can reach them.
 *
 *   node cfb/build/fantasy/probe.mjs 2026 6
 *
 * ESPN cannot be reached from the development sandbox (refused on the CONNECT), so every
 * builder for the college Fantasy Challenge would otherwise be written against a shape
 * remembered rather than seen. This prints a few rows of every endpoint the mode reads,
 * truncated. `week` is the week about to be played; the one before it is read for a box
 * score. It writes nothing.
 */
const [season = '2026', week = '6'] = process.argv.slice(2);
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football';
const CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/college-football';
const UA = {
  accept: 'application/json, text/plain, */*',
  'accept-language': 'en-US,en;q=0.9',
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
    return { status: r.status, j, t };
  } catch (e) {
    return { status: 0, j: null, t: String(e && e.message) };
  }
}
const head = (name, res) => console.log(`\n==== ${name}: HTTP ${res.status}`);
const prev = String(Math.max(1, Number(week) - 1));

async function main() {
  /* Which forms of the url ESPN answers. The NFL one is the control: the live job reads it
     from these same runners every two minutes. */
  const tries = [
    'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=2026&seasontype=2&week=3',
    `${ESPN}/scoreboard`,
    `${ESPN}/scoreboard?dates=${season}&seasontype=2&week=${week}`,
    `${ESPN}/scoreboard?groups=80&dates=${season}&seasontype=2&week=${week}`,
    `${ESPN}/scoreboard?groups=80&week=${week}`,
    `${ESPN}/scoreboard?dates=20260926&groups=80`,
    `${ESPN}/scoreboard?dates=20260926&groups=80&limit=200`,
    'https://site.web.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?dates=20260926&groups=80',
    'https://site.api.espn.com/apis/v2/sports/football/college-football/scoreboard?dates=20260926',
    `${ESPN}/rankings`,
    `${ESPN}/teams/61/roster`,
    `${CORE}/events?dates=20260926&limit=5`,
  ];
  for (const u of tries) {
    const r = await get(u);
    const n = r.j && r.j.events ? r.j.events.length : (r.j && r.j.items ? r.j.items.length : '-');
    console.log(`try ${r.status} events=${n} ${u}`);
    if (r.status !== 200) console.log('   body', String(r.t).slice(0, 200));
  }
  const sb = await get(`${ESPN}/scoreboard?groups=80&dates=${season}&seasontype=2&week=${week}&limit=300`);
  head(`scoreboard week ${week}`, sb);
  const evs = (sb.j && sb.j.events) || [];
  console.log('events', evs.length);
  const lg = sb.j && sb.j.leagues && sb.j.leagues[0];
  console.log('calendar', cut(lg && lg.calendar, 1500));
  for (const ev of evs.slice(0, 2)) {
    const c = ev.competitions[0];
    console.log(cut({
      id: ev.id, date: ev.date, name: ev.name, week: ev.week, status: c.status,
      competitors: c.competitors.map((x) => ({
        id: x.id, homeAway: x.homeAway, curatedRank: x.curatedRank, records: x.records,
        team: x.team && { id: x.team.id, abbreviation: x.team.abbreviation,
          location: x.team.location, name: x.team.name, color: x.team.color,
          conferenceId: x.team.conferenceId },
      })),
      odds: c.odds, neutral: c.neutralSite, conf: c.conferenceCompetition,
      broadcasts: c.broadcasts,
    }, 3500));
  }
  const ranked = evs.filter((e) => e.competitions[0].competitors
    .some((x) => x.curatedRank && x.curatedRank.current <= 25));
  console.log('ranked games', ranked.length,
    'with odds', evs.filter((e) => e.competitions[0].odds).length);

  const rk = await get(`${ESPN}/rankings?season=${season}`);
  head('rankings', rk);
  console.log(cut(rk.j && rk.j.rankings && rk.j.rankings.map((x) => ({
    name: x.name, type: x.type, week: x.occurrence,
    first: x.ranks && x.ranks[0] && { current: x.ranks[0].current, points: x.ranks[0].points,
      team: x.ranks[0].team && { id: x.ranks[0].team.id, loc: x.ranks[0].team.location } },
  })), 1500));

  /* An upcoming game's summary, for any injuries block before kickoff. */
  const up = evs.find((e) => e.status && e.status.type && e.status.type.state === 'pre');
  if (up) {
    const s = await get(`${ESPN}/summary?event=${up.id}`);
    head(`summary upcoming ${up.id} ${up.name}`, s);
    console.log('keys', s.j && Object.keys(s.j));
    console.log('injuries', cut(s.j && s.j.injuries, 1500));
    console.log('pickcenter', cut(s.j && s.j.pickcenter, 800));
    console.log('predictor', cut(s.j && s.j.predictor, 500));
  }

  /* A finished game from the week before, for the box score. */
  const pb = await get(`${ESPN}/scoreboard?groups=80&dates=${season}&seasontype=2&week=${prev}&limit=300`);
  const pevs = (pb.j && pb.j.events) || [];
  head(`scoreboard week ${prev}`, pb);
  console.log('events', pevs.length, 'finished',
    pevs.filter((e) => e.status && e.status.type && e.status.type.state === 'post').length);
  const done = pevs.find((e) => e.status && e.status.type && e.status.type.state === 'post');
  if (done) {
    const s = await get(`${ESPN}/summary?event=${done.id}`);
    head(`summary ${done.id} ${done.name}`, s);
    console.log('keys', s.j && Object.keys(s.j));
    const pl = (s.j && s.j.boxscore && s.j.boxscore.players) || [];
    console.log('teams in box', pl.length, 'team', cut(pl[0] && pl[0].team, 300));
    for (const b of (pl[0] && pl[0].statistics) || []) {
      console.log('  block', b.name, 'keys', cut(b.keys, 300), 'labels', cut(b.labels, 200));
      console.log('    athlete', cut(b.athletes && b.athletes[0], 700));
    }
    console.log('injuries', cut(s.j && s.j.injuries, 800));
    console.log('header', cut(s.j && s.j.header && s.j.header.competitions, 800));

    const tid = done.competitions[0].competitors[0].team.id;
    for (const [name, url] of [
      ['team injuries', `${ESPN}/teams/${tid}/injuries`],
      ['core team injuries', `${CORE}/teams/${tid}/injuries`],
      ['core season team injuries', `${CORE}/seasons/${season}/teams/${tid}/injuries`],
    ]) {
      const r = await get(url);
      head(`${name} ${tid}`, r);
      console.log(cut(r.j || r.t, 900));
    }
    const ros = await get(`${ESPN}/teams/${tid}/roster`);
    head(`roster ${tid}`, ros);
    const groups = (ros.j && ros.j.athletes) || [];
    console.log('groups', cut(groups.map((g) => [g.position, g.items && g.items.length]), 400));
    const items = groups.flatMap((g) => g.items || []);
    console.log('first athlete', cut(items[0], 1500));
    const hurt = items.filter((a) => (a.injuries && a.injuries.length) || (a.status
      && a.status.type && a.status.type !== 'active'));
    console.log('athletes with an injury or a non active status', hurt.length,
      cut(hurt.slice(0, 3).map((a) => ({ id: a.id, name: a.displayName, pos: a.position
        && a.position.abbreviation, injuries: a.injuries, status: a.status })), 1500));
  }
  /* Is there a league wide injury list? */
  const li = await get(`${CORE}/injuries?limit=50`);
  head('core league injuries', li);
  console.log(cut(li.j || li.t, 600));
  console.log('\ndone');
}

main().catch((e) => { console.error(e); process.exit(1); });
