/* WHAT THE REAL FEEDS SEND, printed, for a machine that can reach them.
 *
 *   CFBD_KEY=... node cfb/build/fantasy/probe.mjs 2026 5
 *
 * Neither CFBD nor ESPN can be reached from the development sandbox (both are refused on
 * the CONNECT), so every builder for the college Fantasy Challenge would otherwise be
 * written against a shape remembered rather than seen. This prints a few rows of every
 * endpoint the mode reads, truncated, so the parsers are written against the real thing.
 * It writes nothing and about a dozen CFBD calls is the whole cost.
 */
const [season = '2026', week = '5'] = process.argv.slice(2);
const KEY = process.env.CFBD_KEY || '';
const CFBD = 'https://api.collegefootballdata.com';
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
  return s.length > n ? s.slice(0, n) + ` ...(${s.length} chars)` : s;
};

async function get(url, headers) {
  try {
    const r = await fetch(url, { headers });
    const t = await r.text();
    let j = null;
    try { j = JSON.parse(t); } catch { /* not json */ }
    return { status: r.status, j, t };
  } catch (e) {
    return { status: 0, j: null, t: String(e && e.message) };
  }
}

const cfbd = (p) => get(CFBD + p, { Authorization: `Bearer ${KEY}` });
const espn = (u) => get(u, UA);

function head(name, res) {
  console.log(`\n==== ${name}: HTTP ${res.status}`
    + (Array.isArray(res.j) ? ` rows=${res.j.length}` : ''));
}

const prev = String(Math.max(1, Number(week) - 1));
let gp = [];
if (KEY) {

let r = await cfbd(`/calendar?year=${season}`);
head('calendar', r); console.log(cut(r.j, 900));

r = await cfbd(`/games?year=${season}&week=${week}&classification=fbs`);
head('games', r);
const games = Array.isArray(r.j) ? r.j : [];
console.log(cut(games.slice(0, 2), 2400));

r = await cfbd(`/rankings?year=${season}&week=${week}`);
head('rankings', r); console.log(cut(r.j, 1400));

r = await cfbd(`/lines?year=${season}&week=${week}`);
head('lines', r); console.log(cut((Array.isArray(r.j) ? r.j : []).slice(0, 2), 1800));

r = await cfbd(`/games/players?year=${season}&week=${prev}&classification=fbs`);
head(`games/players week ${prev}`, r);
gp = Array.isArray(r.j) ? r.j : [];
if (gp[0]) {
  console.log('keys', Object.keys(gp[0]));
  const t0 = gp[0].teams && gp[0].teams[0];
  console.log('team keys', t0 && Object.keys(t0));
  for (const c of (t0 && t0.categories) || []) {
    console.log('  category', c.name, 'types', (c.types || []).map((x) => x.name).join(','),
      'sample', cut(c.types && c.types[0] && c.types[0].athletes && c.types[0].athletes[0], 200));
  }
}

r = await cfbd(`/roster?year=${season}&team=Georgia`);
head('roster Georgia', r); console.log(cut((Array.isArray(r.j) ? r.j : []).slice(0, 2), 900));

r = await cfbd(`/stats/player/season?year=${Number(season) - 1}&category=passing`);
head('stats/player/season last year passing', r); console.log(cut((Array.isArray(r.j) ? r.j : []).slice(0, 3), 900));

r = await cfbd(`/player/usage?year=${season}`);
head('player/usage', r); console.log(cut((Array.isArray(r.j) ? r.j : []).slice(0, 2), 900));

r = await cfbd(`/ratings/sp?year=${season}`);
head('ratings/sp', r); console.log(cut((Array.isArray(r.j) ? r.j : []).slice(0, 2), 900));

r = await cfbd(`/teams/fbs?year=${season}`);
head('teams/fbs', r); console.log(cut((Array.isArray(r.j) ? r.j : []).slice(0, 1), 900));

} else console.log('no CFBD_KEY: skipping CFBD');

/* ESPN, which needs no key. */
r = await espn(`${ESPN}/scoreboard?groups=80&dates=${season}&seasontype=2&week=${week}&limit=300`);
head('espn scoreboard', r);
const evs = (r.j && r.j.events) || [];
console.log('events', evs.length);
const ev0 = evs[0];
if (ev0) {
  const c = ev0.competitions[0];
  console.log(cut({ id: ev0.id, date: ev0.date, name: ev0.name, status: c.status,
    competitors: c.competitors.map((x) => ({ id: x.id, homeAway: x.homeAway, team: x.team && {
      id: x.team.id, abbreviation: x.team.abbreviation, location: x.team.location,
      displayName: x.team.displayName, conferenceId: x.team.conferenceId }, curatedRank: x.curatedRank,
      score: x.score })), odds: c.odds, venue: c.venue && c.venue.fullName,
      neutral: c.neutralSite, conf: c.conferenceCompetition }, 3200));
  console.log('ranked games', evs.filter((e) => e.competitions[0].competitors.some((x) => x.curatedRank
    && x.curatedRank.current <= 25)).length, 'with odds', evs.filter((e) => e.competitions[0].odds).length);
}
const rk = await espn(`${ESPN}/rankings`);
head('espn rankings', rk);
console.log(cut(rk.j && rk.j.rankings && rk.j.rankings.map((x) => ({ name: x.name, type: x.type,
  first: x.ranks && x.ranks[0] && { current: x.ranks[0].current, team: x.ranks[0].team && {
    id: x.ranks[0].team.id, loc: x.ranks[0].team.location } } })), 1200));

/* A finished game from last week, for the box score and the injuries block. */
r = await espn(`${ESPN}/scoreboard?groups=80&dates=${season}&seasontype=2&week=${prev}&limit=300`);
const done = ((r.j && r.j.events) || []).find((e) => e.status && e.status.type
  && e.status.type.state === 'post');
if (done) {
  const s = await espn(`${ESPN}/summary?event=${done.id}`);
  head(`espn summary ${done.id} ${done.name}`, s);
  console.log('summary keys', s.j && Object.keys(s.j));
  const pl = s.j && s.j.boxscore && s.j.boxscore.players;
  if (pl && pl[0]) {
    for (const b of pl[0].statistics || []) {
      console.log('  block', b.name, 'keys', cut(b.keys, 200), 'labels', cut(b.labels, 200),
        'athlete', cut(b.athletes && b.athletes[0], 500));
    }
  }
  console.log('injuries', cut(s.j && s.j.injuries, 1200));
  /* Is CFBD's athlete id ESPN's? The join the live scoring rests on. */
  const espnIds = new Map();
  for (const t of pl || []) for (const b of t.statistics || []) {
    for (const a of b.athletes || []) espnIds.set(String(a.athlete.id), a.athlete.displayName);
  }
  const cfGame = gp.find((g) => String(g.id) === String(done.id));
  console.log('cfbd game with the same id as the espn event:', !!cfGame);
  if (cfGame) {
    let same = 0, tot = 0; const miss = [];
    for (const t of cfGame.teams) for (const c of t.categories) for (const ty of c.types) {
      for (const a of ty.athletes) {
        tot++;
        if (espnIds.has(String(a.id))) same++; else if (miss.length < 5) miss.push([a.id, a.name]);
      }
    }
    console.log(`athlete ids shared: ${same} of ${tot}`, cut(miss, 300));
  }
  const tid = done.competitions[0].competitors[0].team.id;
  const inj = await espn(`${ESPN}/teams/${tid}/injuries`);
  head(`espn team ${tid} injuries`, inj); console.log(cut(inj.j, 900));
  const inj2 = await espn(`${CORE}/teams/${tid}/injuries`);
  head(`espn core team ${tid} injuries`, inj2); console.log(cut(inj2.j, 900));
  const ros = await espn(`${ESPN}/teams/${tid}/roster`);
  head(`espn team ${tid} roster`, ros);
  const ath = ros.j && ros.j.athletes;
  console.log('roster groups', cut(ath && ath.map && ath.map((g) => g.position || g.items?.length), 300));
  const first = ath && ath[0] && (ath[0].items ? ath[0].items[0] : ath[0]);
  console.log('roster athlete', cut(first, 900));
}
console.log('\ndone');
