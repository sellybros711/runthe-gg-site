/* THE POINTS WHILE A GAME IS BEING PLAYED, off ESPN's box score.
 *
 * nflverse is what this mode settles on and it is a research dataset: its weekly player
 * file gets a game's rows some HOURS after the whistle, and on a Thursday night that meant
 * the board read 0.0 for every entrant for the whole game and most of the night after it.
 * Reported by the site's owner with a screenshot, the first Thursday the mode was live.
 *
 * ESPN's per game summary carries the box score as the game goes, so this reads it and
 * turns each man's line into half PPR. THAT NUMBER IS PROVISIONAL AND IS NEVER WHAT PAYS.
 * It is written to `fantasy_results` only for a club nflverse has not written yet, and the
 * moment nflverse has a club's rows they replace these by upsert. A week is only ever
 * marked final off nflverse (`weekly-results.mjs`), so settlement never reads a number
 * that came from here.
 *
 * ─── WHAT IT CANNOT SEE ─────────────────────────────────────────────────────────────
 *
 * Two point conversions. nflverse's standard points count them and a box score does not,
 * so a man who scores one reads two points low until nflverse lands. Said rather than
 * guessed at: the play by play would answer it and is a second feed to go wrong.
 *
 * ─── IT IS KEYED ON ESPN'S OWN ATHLETE ID ───────────────────────────────────────────
 *
 * Never on a name. `players.csv` carries `espn_id` beside `gsis_id`, which is the id the
 * pool and `fantasy_results` use, so the join is one lookup. A man with no crosswalk row
 * is skipped, which costs his live points and nothing else.
 *
 * NOTHING HERE CAN BE REACHED FROM THE DEVELOPMENT SANDBOX (site.api.espn.com is refused
 * on the CONNECT), so the parser is tested against a saved shape in
 * `test/test_box.mjs` and the first real verification is a run of fantasy-live.yml. The
 * line to read in its log is `box:`.
 */
import { playLine } from './weekly-results.mjs';

export const SUMMARY = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary';
const TIMEOUT_MS = 12000;
const say = (...a) => process.stderr.write(a.join(' ') + '\n');

/* One number out of a box cell. "1,024" is a real way to write a yard count and "--" is a
   real way to write nothing. */
const cell = (v) => {
  if (v == null) return 0;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};

/* EACH STAT IS FOUND BY ITS KEY, AND BY ITS LABEL WHEN THE KEY IS NOT THERE. Both have
   been seen on this payload, and neither is a contract, so a column is never found by its
   POSITION: ESPN has added a column to the passing line before, and a position based read
   would have quietly paid a man's yards per attempt as his touchdowns. */
const WANT = {
  passing:   { yds: ['passingYards', 'YDS'], td: ['passingTouchdowns', 'TD'],
               int: ['interceptions', 'INT'] },
  rushing:   { yds: ['rushingYards', 'YDS'], td: ['rushingTouchdowns', 'TD'] },
  receiving: { rec: ['receptions', 'REC'], yds: ['receivingYards', 'YDS'],
               td: ['receivingTouchdowns', 'TD'] },
  fumbles:   { lost: ['fumblesLost', 'LOST'] },
  kickReturns: { td: ['kickReturnTouchdowns', 'TD'] },
  puntReturns: { td: ['puntReturnTouchdowns', 'TD'] },
};

function column(block, [key, label]) {
  const keys = Array.isArray(block.keys) ? block.keys : [];
  let i = keys.indexOf(key);
  if (i < 0) {
    const labels = Array.isArray(block.labels) ? block.labels : [];
    i = labels.indexOf(label);
  }
  return i;
}

/**
 * Every man in one game's box score, keyed on his ESPN athlete id.
 *
 * @returns {Map<string, object>} the counting stats this mode scores on, in nflverse's own
 *          column names so `playLine` and the points are the same arithmetic either way.
 */
export function readBox(json) {
  const out = new Map();
  const teams = json && json.boxscore && Array.isArray(json.boxscore.players)
    ? json.boxscore.players : [];
  for (const t of teams) {
    const blocks = t && Array.isArray(t.statistics) ? t.statistics : [];
    for (const b of blocks) {
      const want = b && WANT[b.name];
      if (!want) continue;
      const cols = {};
      for (const [k, pair] of Object.entries(want)) cols[k] = column(b, pair);
      for (const a of Array.isArray(b.athletes) ? b.athletes : []) {
        const id = a && a.athlete && a.athlete.id != null ? String(a.athlete.id) : null;
        if (!id || !Array.isArray(a.stats)) continue;
        const v = (k) => (cols[k] >= 0 ? cell(a.stats[cols[k]]) : 0);
        const m = out.get(id) || {
          name: (a.athlete.displayName || '').trim(),
          passing_yards: 0, passing_tds: 0, passing_interceptions: 0,
          rushing_yards: 0, rushing_tds: 0,
          receptions: 0, receiving_yards: 0, receiving_tds: 0,
          fumbles_lost: 0, special_teams_tds: 0,
        };
        if (b.name === 'passing') {
          m.passing_yards += v('yds'); m.passing_tds += v('td');
          m.passing_interceptions += v('int');
        } else if (b.name === 'rushing') {
          m.rushing_yards += v('yds'); m.rushing_tds += v('td');
        } else if (b.name === 'receiving') {
          m.receptions += v('rec'); m.receiving_yards += v('yds'); m.receiving_tds += v('td');
        } else if (b.name === 'fumbles') {
          m.fumbles_lost += v('lost');
        } else {
          m.special_teams_tds += v('td');
        }
        out.set(id, m);
      }
    }
  }
  return out;
}

/* nflverse's standard scoring, which is what `fantasy_points` is, plus half a point a
   catch. Written out rather than imported because nflverse ships the total and never the
   rule: this is the one place the rule exists, and `test_box.mjs` holds it to nflverse's
   own `fantasy_points` on real rows. */
export function halfFromBox(m) {
  return m.passing_yards * 0.04 + m.passing_tds * 4 - m.passing_interceptions * 2
    + m.rushing_yards * 0.1 + m.rushing_tds * 6
    + m.receiving_yards * 0.1 + m.receiving_tds * 6
    - m.fumbles_lost * 2 + m.special_teams_tds * 6
    + m.receptions * 0.5;
}

const round1 = (x) => Math.round(x * 10) / 10;

/**
 * The provisional scores for every man in these box scores, keyed on the pool's id.
 *
 * @param {Map<string,object>[]} boxes  from `readBox`, one a game
 * @param {Map<string,string>}   xwalk  ESPN athlete id to gsis id
 * @param {Set<string>}          skip   gsis ids nflverse already scored, which win
 */
export function boxScores(boxes, xwalk, skip = new Set()) {
  const scores = {};
  let unmapped = 0;
  for (const box of boxes) {
    for (const [espn, m] of box) {
      const id = xwalk.get(espn);
      if (!id) { unmapped++; continue; }
      if (skip.has(id)) continue;
      scores[id] = [round1(halfFromBox(m)), playLine(m)];
    }
  }
  return { scores, unmapped };
}

/** ESPN athlete id to gsis id, off nflverse's own `players.csv` rows. */
export function crosswalk(rows) {
  const out = new Map();
  for (const r of rows) {
    const e = r.espn_id == null ? '' : String(r.espn_id).trim();
    const g = r.gsis_id == null ? '' : String(r.gsis_id).trim();
    /* players.csv writes some ids as floats ("4361307.0"), so the trailing zero is not a
       different athlete. */
    if (e && g) out.set(e.replace(/\.0+$/, ''), g);
  }
  return out;
}

async function getJSON(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    /* The same headers as the scoreboard, for the reason espn.mjs gives: a self identifying
       bot user agent was answered 403 on every request. */
    const res = await fetch(url, {
      signal: ctl.signal, redirect: 'follow',
      headers: {
        accept: 'application/json, text/plain, */*',
        'accept-language': 'en-US,en;q=0.9',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
          + ' (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      },
    });
    if (!res.ok) { say(`  box: HTTP ${res.status} on ${url}`); return null; }
    return await res.json();
  } catch (e) {
    say(`  box: ${e && e.message ? e.message : String(e)}`);
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** One box score a game, for the ESPN event ids asked for. A game that fails is skipped. */
export async function fetchBoxes(ids) {
  const out = [];
  for (const id of ids) {
    const j = await getJSON(`${SUMMARY}?event=${encodeURIComponent(id)}`);
    if (j) out.push(readBox(j));
  }
  return out;
}
