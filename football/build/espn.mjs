/* THE LIVE FEED, AND THE ONE SEAM IT COMES THROUGH.
 *
 * ESPN publishes an unauthenticated JSON scoreboard and it is the only free source of a
 * score WHILE a game is being played. nflverse, which everything else in this mode runs on,
 * is a research dataset: `games.csv` gets a final score some time after the whistle and
 * knows nothing at all about a game in its third quarter.
 *
 * ─── IT IS NOT A CONTRACT AND IS TREATED LIKE ONE ANYWAY ────────────────────────────
 *
 * There is no agreement behind this endpoint, no version in the url, and nobody to tell us
 * when it changes. So the rules are:
 *
 *   NOTHING IS READ FROM IT THAT WE ALREADY KNOW. It supplies a state, a quarter, a clock
 *     and two numbers. Every NAME on the screen comes from our own schedule, joined on
 *     ESPN's own event id, which `games.csv` carries in its `espn` column. ESPN writes WSH
 *     and LAR where the schedule writes WAS and LA, so a join by club code would have
 *     silently dropped two clubs a week and looked like two byes.
 *
 *   AN EVENT WE CANNOT MAKE SENSE OF IS DROPPED, never guessed at. A state that is not one
 *     of the three we draw, a competitor with no side, a score that is not a number: each
 *     one takes that game out of the answer and leaves the rest alone. The caller then
 *     falls back to the schedule for it, and the board shows a kickoff time instead of a
 *     wrong score.
 *
 *   IT MAY NEVER TAKE THE JOB RED. `fetchLive` resolves to an empty map on anything at all:
 *     a 500, a timeout, HTML where JSON was expected, a shape nobody recognises. The
 *     scoreboard is the picture beside the competition and not the competition, so a feed
 *     that goes dark must cost a stale panel and nothing else.
 *
 * ─── AND IT CANNOT BE REACHED FROM THE DEVELOPMENT SANDBOX ──────────────────────────
 *
 * `site.api.espn.com` is refused by this machine's egress proxy (403 on the CONNECT), so
 * NOTHING HERE HAS BEEN RUN AGAINST THE REAL FEED. That is worth saying plainly rather than
 * leaving somebody to infer it from a green test run:
 *
 *   what IS verified   the parser, against a saved payload, and every fallback path
 *   what is NOT        that ESPN sends a payload of that shape
 *
 * A hand written fixture can only ever prove the parser handles the shape it was told
 * about. The first real verification is a live run of `fantasy-live.yml`, which is why
 * `pickWeek` counts what it MATCHED and the caller logs it: a run that fetched two hundred
 * kilobytes and matched none of our sixteen games is the shape being wrong, and it says so
 * in the log rather than going quietly green with an empty scoreboard.
 */

/** Where a week's games live. `seasontype` 2 is the regular season. */
export const SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

const TIMEOUT_MS = 12000;

/* Three states and nothing else, because the page draws three things. A fourth arriving
   from the feed is an event we do not understand, and the schedule is a better answer than
   a guess. */
const STATES = new Set(['pre', 'in', 'post']);

const int = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
};

/**
 * One event out of the feed, or null if it is not one we can use.
 *
 * `status` is on the event on some payloads and on the competition on others, and both have
 * been seen in the wild, so both are read and the competition wins. That is not defensive
 * padding: reading only the event's copy is how a scoreboard ends up frozen at "pre" for a
 * whole afternoon with every other field perfect.
 */
export function readEvent(ev) {
  if (!ev || typeof ev !== 'object') return null;
  const id = ev.id == null ? null : String(ev.id);
  if (!id) return null;

  const comp = Array.isArray(ev.competitions) && ev.competitions[0] ? ev.competitions[0] : {};
  const st = comp.status || ev.status || {};
  const type = st.type || {};
  const state = typeof type.state === 'string' ? type.state.toLowerCase() : '';
  if (!STATES.has(state)) return null;

  let away = null, home = null;
  const cs = Array.isArray(comp.competitors) ? comp.competitors : [];
  for (const c of cs) {
    if (!c || typeof c !== 'object') continue;
    if (c.homeAway === 'home') home = c;
    else if (c.homeAway === 'away') away = c;
  }
  /* A competition with no two sides to it is not a football game. */
  if (!away || !home) return null;

  const period = int(st.period);
  /* OVERTIME IS DERIVED FROM THE QUARTER AND NEVER FROM THE WORD "OT" IN A SENTENCE.
     `type.detail` is display text, it has been spelled at least two ways, and it is not
     something to key a stored boolean on. A finished game past the fourth went to
     overtime, and that is arithmetic. */
  const over = state === 'post' && period != null ? period > 4 : null;

  /* BEFORE KICKOFF A SCORE IS NOT NIL-NIL, IT IS NOTHING. ESPN sends "0" and "0" for a game
     on Thursday morning, and stored as a scoreline the board would say Atlanta and Green
     Bay were level. This is `next-week.mjs`'s own trap ("Number('') is 0") arriving from
     the other side. */
  const as = state === 'pre' ? null : int(away.score);
  const hs = state === 'pre' ? null : int(home.score);
  /* ONE SIDE OF A SCORELINE IS NOT A SCORELINE. A game that is being played and whose score
     will not parse is dropped whole, so the board falls back to its kickoff time. Kept, it
     would print a number beside a blank, which reads as the page being broken rather than
     as the feed being. */
  if (state !== 'pre' && (as == null || hs == null)) return null;

  return {
    espn: id,
    state,
    /* A GAME THAT IS NOT BEING PLAYED HAS NO CLOCK, at either end of it. A finished one is
       obvious. A game on Thursday morning is the one that had to be looked at: the feed
       answers period 0 and "0:00" for it, which stored is a pre-game row carrying a quarter
       and a clock, and any reader drawing "Q0 0:00" beside a kickoff time is drawing
       something true of nothing. */
    period: state === 'in' ? period : null,
    clock: state === 'in'
      ? (typeof st.displayClock === 'string' && st.displayClock ? st.displayClock : null)
      : null,
    away_score: as,
    home_score: hs,
    overtime: over,
  };
}

/** Every usable event of a payload, keyed on its ESPN id. */
export function readScoreboard(json) {
  const out = new Map();
  const evs = json && Array.isArray(json.events) ? json.events : [];
  for (const ev of evs) {
    const got = readEvent(ev);
    if (got) out.set(got.espn, got);
  }
  return out;
}

/* ─── the fetch ───────────────────────────────────────────────────────────────────── */

const say = (...a) => process.stderr.write(a.join(' ') + '\n');

async function getJSON(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      redirect: 'follow',
      /* Asked for as a browser would, because an unauthenticated public endpoint is
         entitled to refuse a client that will not say what it is. */
      headers: { accept: 'application/json', 'user-agent': 'runthe.gg/1.0 (+https://runthe.gg)' },
    });
    if (!res.ok) { say(`  espn: HTTP ${res.status} on ${url}`); return null; }
    return await res.json();
  } catch (e) {
    say(`  espn: ${e && e.message ? e.message : String(e)}`);
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * A week's live scores, keyed on ESPN event id.
 *
 * TWO WAYS OF ASKING, AND THE SECOND IS NOT BELT AND BRACES. The week form is one request
 * for the whole slate and is what should normally answer. It is also the form most likely to
 * be wrong in a way nobody here can test, because the season's week numbering is ESPN's
 * rather than ours: an off-by-one, a different `seasontype` boundary, or a season that is
 * addressed by its own year rather than the calendar one all come back as a perfectly valid
 * payload full of the wrong games. That is not an error, it is a MISS, and the only thing
 * that can see it is the count of our own event ids in the answer.
 *
 * So when the week form matches none of the games we are asking about, the days are asked
 * for directly. A date is not a numbering convention and cannot be off by one.
 *
 * @param {string[]} ids   the ESPN event ids we care about, off our own schedule
 * @param {string[]} days  the days those games are played, as YYYYMMDD in Eastern
 */
export async function fetchLive({ season, week, ids, days }) {
  const want = new Set((ids || []).filter(Boolean).map(String));
  const keep = (map) => {
    const out = new Map();
    for (const [k, v] of map) if (want.has(k)) out.set(k, v);
    return out;
  };

  const byWeek = await getJSON(`${SCOREBOARD}?dates=${season}&seasontype=2&week=${week}`);
  if (byWeek) {
    const got = keep(readScoreboard(byWeek));
    if (got.size) return { live: got, how: 'week' };
    say(`  espn: the week request matched none of our ${want.size} games. Asking by day.`);
  }

  const out = new Map();
  for (const d of days || []) {
    const j = await getJSON(`${SCOREBOARD}?dates=${d}`);
    if (!j) continue;
    for (const [k, v] of keep(readScoreboard(j))) out.set(k, v);
  }
  return { live: out, how: out.size ? 'day' : 'none' };
}
