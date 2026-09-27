/* THE COLLEGE FANTASY CHALLENGE'S ONE WAY TO ESPN.
 *
 * Every number this mode prices, scores or shows comes through here: the week's schedule,
 * the betting lines, the rankings, each game's box score and each team's roster. There is no
 * CFBD in it, deliberately: the repo carries no CFBD key, and ESPN's own feeds answer all of
 * it without one.
 *
 * ─── TWO HOSTS, AND THE FIRST ONE REFUSES SOME RUNNERS ──────────────────────────────
 *
 * `site.api.espn.com` answered "Access Denied" (an Akamai 403, HTML rather than JSON) to a
 * GitHub runner on 2026-09-27, the NFL scoreboard included, while the NFL live job on a
 * different runner was reading that same url every two minutes. So the block is by runner
 * ADDRESS, and a job is a coin toss on which address it gets. `site.web.api.espn.com` serves
 * the same paths and answered the runner the other host refused. So it is asked first, and
 * the other is the fallback. Found by `probe.mjs`, which prints both.
 *
 * ─── NOTHING HERE MAY TAKE A JOB RED BY ITSELF ──────────────────────────────────────
 *
 * `getJSON` resolves to null on anything at all. The caller decides what a missing answer
 * costs: the pool build refuses to publish a board it could not read, and the live job skips
 * a tick. That split is the NFL feed's own rule (`football/build/espn.mjs`).
 */
import { readEvent } from '../../../football/build/espn.mjs';
import { readBox, halfFromBox } from '../../../football/build/espn-box.mjs';
import { playLine } from '../../../football/build/weekly-results.mjs';

export { readEvent, readBox, halfFromBox, playLine };

const PATH = '/apis/site/v2/sports/football/college-football';
export const HOSTS = ['https://site.web.api.espn.com', 'https://site.api.espn.com'];
const TIMEOUT_MS = 15000;
const say = (...a) => process.stderr.write(a.join(' ') + '\n');

const HEADERS = {
  accept: 'application/json, text/plain, */*',
  'accept-language': 'en-US,en;q=0.9',
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    + ' (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
};

async function once(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: HEADERS });
    if (!res.ok) return { status: res.status, j: null };
    return { status: res.status, j: await res.json() };
  } catch (e) {
    return { status: 0, j: null, why: e && e.message ? e.message : String(e) };
  } finally {
    clearTimeout(t);
  }
}

/** One path, asked of each host in turn until one answers with JSON. Null if none does. */
export async function getJSON(rel) {
  const tried = [];
  for (const host of HOSTS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await once(host + PATH + rel);
      if (r.j) return r.j;
      tried.push(`${host.replace('https://', '')} ${r.status || r.why}`);
      /* A 403 or a 404 is an answer, and asking the same host again gets the same one. */
      if (r.status === 403 || r.status === 404) break;
      await new Promise((ok) => setTimeout(ok, 800));
    }
  }
  say(`  espn: nothing for ${rel} (${tried.join(', ')})`);
  return null;
}

/* ─── the week ────────────────────────────────────────────────────────────────────── */

/** FBS is ESPN's group 80. `limit` is high because a busy Saturday is over sixty games. */
export async function scoreboardWeek(season, week) {
  return getJSON(`/scoreboard?groups=80&dates=${season}&seasontype=2&week=${week}&limit=300`);
}

export async function scoreboardDay(yyyymmdd) {
  return getJSON(`/scoreboard?groups=80&dates=${yyyymmdd}&limit=300`);
}

export async function summary(eventId) {
  return getJSON(`/summary?event=${encodeURIComponent(eventId)}`);
}

export async function roster(teamId) {
  return getJSON(`/teams/${encodeURIComponent(teamId)}/roster`);
}

/** The calendar of regular season weeks off a scoreboard payload: [{week, start, end}]. */
export function calendarOf(json) {
  const lg = json && json.leagues && json.leagues[0];
  const cal = (lg && Array.isArray(lg.calendar)) ? lg.calendar : [];
  const reg = cal.find((c) => String(c.value) === '2') || cal[0];
  const out = [];
  for (const e of (reg && reg.entries) || []) {
    const w = Number(e.value);
    if (!Number.isFinite(w)) continue;
    out.push({ week: w, start: e.startDate, end: e.endDate, label: e.label });
  }
  return out;
}

/*
 * ONE GAME, AS THIS MODE NEEDS IT: who, when, how good, and what the market thinks.
 *
 * `readEvent` (the NFL reader) supplies the state, the clock and the score and drops an event
 * it cannot make sense of. What is added here is everything a slate is chosen on and a
 * projection is built from. Rank 99 is ESPN's word for unranked and is read as no rank.
 */
export function gameOf(ev) {
  const live = readEvent(ev);
  if (!live) return null;
  const comp = ev.competitions[0];
  const side = (ha) => {
    const c = comp.competitors.find((x) => x.homeAway === ha);
    const t = c.team || {};
    const r = c.curatedRank && Number(c.curatedRank.current);
    return {
      id: String(t.id || c.id),
      abbr: t.abbreviation || '',
      school: t.location || t.shortDisplayName || t.displayName || '',
      name: t.name || '',
      color: t.color || null,
      alt: t.alternateColor || null,
      conf: t.conferenceId == null ? null : String(t.conferenceId),
      rank: Number.isFinite(r) && r >= 1 && r <= 25 ? r : null,
    };
  };
  const odds = Array.isArray(comp.odds) && comp.odds[0] ? comp.odds[0] : null;
  const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  return {
    ...live,
    id: live.espn,
    kick: ev.date || comp.date || null,
    neutral: !!comp.neutralSite,
    home: side('home'),
    away: side('away'),
    /* THE SPREAD IS THE HOME SIDE'S LINE. `"details": "NMSU -1.5"` came with `spread: -1.5`
       on a game New Mexico State was hosting, so a negative number is the home side
       favoured. Read against the probe's own payload, not remembered. */
    spread: odds ? num(odds.spread) : null,
    total: odds ? num(odds.overUnder) : null,
    tv: (comp.broadcasts || []).flatMap((b) => b.names || []).slice(0, 2),
  };
}

export function gamesOf(json) {
  const out = [];
  for (const ev of (json && json.events) || []) {
    const g = gameOf(ev);
    if (g) out.push(g);
  }
  return out;
}

/** What each side is expected to score, off the total and the home side's spread. */
export function implied(g) {
  if (g.total == null || g.spread == null) return null;
  return { home: (g.total - g.spread) / 2, away: (g.total + g.spread) / 2 };
}

/*
 * A BOX SCORE, AS ROWS THIS MODE KEEPS: one a man who did something on offence or on a
 * return. Keyed on ESPN's athlete id, which is the same id CFBD uses and the same id the
 * college game's own player data carries (Lamar Jackson is 3916387 in both), so the season
 * to date, the prior and the live points all join on one key and never on a name.
 */
export function boxRows(json) {
  const box = readBox(json);
  const teams = (json && json.boxscore && json.boxscore.players) || [];
  const teamOf = new Map();
  for (const t of teams) {
    const tid = t && t.team && t.team.id != null ? String(t.team.id) : null;
    for (const b of (t && t.statistics) || []) {
      for (const a of b.athletes || []) {
        if (a && a.athlete && a.athlete.id != null) teamOf.set(String(a.athlete.id), tid);
      }
    }
  }
  const out = [];
  for (const [id, m] of box) {
    const touched = m.passing_yards || m.passing_tds || m.passing_interceptions
      || m.rushing_yards || m.rushing_tds || m.receptions || m.receiving_yards
      || m.receiving_tds || m.fumbles_lost || m.special_teams_tds;
    /* A punter and a man who made one tackle are in the box too. Nobody drafts them. */
    if (!touched) continue;
    out.push({
      id, team: teamOf.get(id) || null, name: m.name,
      pts: Math.round(halfFromBox(m) * 10) / 10,
      line: playLine(m),
      s: [m.passing_yards, m.passing_tds, m.passing_interceptions, m.rushing_yards,
        m.rushing_tds, m.receptions, m.receiving_yards, m.receiving_tds, m.fumbles_lost,
        m.special_teams_tds],
    });
  }
  return out;
}

/* The stat order in `s`, written once so the season totals and the line agree. */
export const STAT_KEYS = ['passing_yards', 'passing_tds', 'passing_interceptions',
  'rushing_yards', 'rushing_tds', 'receptions', 'receiving_yards', 'receiving_tds',
  'fumbles_lost', 'special_teams_tds'];

/*
 * A ROSTER, AS POSITIONS AND WHO IS UNAVAILABLE.
 *
 * ESPN files a college roster in groups, and two of them are what the NFL gets from its
 * weekly injury report: `injuredReserveOrOut` and `suspended`. College football publishes no
 * league wide report, so these groups and the site's own ruling list are the whole of what
 * this mode can know before a game. A man in either group is off the board.
 */
export function rosterOf(json) {
  const out = new Map();
  for (const g of (json && json.athletes) || []) {
    const group = String(g.position || '');
    const off = /injured|out|suspend/i.test(group);
    for (const a of g.items || []) {
      if (!a || a.id == null) continue;
      const pos = a.position && (a.position.abbreviation || a.position.name);
      const inj = Array.isArray(a.injuries) && a.injuries[0] ? a.injuries[0] : null;
      out.set(String(a.id), {
        name: a.displayName || a.fullName || '',
        pos: pos ? String(pos).toUpperCase() : null,
        jersey: a.jersey || null,
        year: a.experience && (a.experience.abbreviation || a.experience.displayValue) || null,
        off: off ? (/suspend/i.test(group) ? 'suspended' : 'out') : null,
        inj: inj ? {
          status: inj.status || (inj.type && inj.type.description) || null,
          detail: (inj.details && (inj.details.type || inj.details.detail)) || inj.shortComment || null,
        } : null,
      });
    }
  }
  return out;
}
