/**
 * 08-fbs.mjs - every FBS team, for Commish Simulator.
 *
 *   CFBD_KEY=... node cfb/build/08-fbs.mjs
 *
 * WHY THIS EXISTS. cfb_team_seasons.json is built for the main game, which drafts a roster
 * out of great historical seasons, so lib.mjs filters it down to the power conferences plus a
 * hand-picked list of famous Group of Five years. That is exactly right for a draft and
 * exactly wrong for a league: Commish plays a season with the schools in that file, which is
 * SEVENTY, of which sixty-seven are the four power conferences.
 *
 * So the Group of Five is a bloc in that mode with a vote, a fourteen per cent share of the
 * money and a voice at every meeting, arguing about access to a playoff none of its schools
 * can physically enter. There is an item on the docket about an unbeaten outsider ranked
 * fourteenth and the only teams that can trigger it are two Pac-12 leftovers and Notre Dame.
 *
 * This writes the whole division instead. Same fields the season engine already reads, no
 * player slots (Commish never drafts anybody), and the same twenty-one seasons of history the
 * main file carries, because churn.js regresses a programme toward ITS OWN level and a school
 * with a single season in the file has no level to regress to.
 *
 * THE KEY NEVER TOUCHES THE REPO. It is read from the environment for the length of one run.
 * See .github/workflows/cfb-fbs.yml, which is the way to run this: GitHub holds the key
 * encrypted as a repository secret and the job pushes the data file back.
 *
 * WHAT IT WRITES. cfb/data/cfb_fbs.json, which Commish loads in preference to
 * cfb_team_seasons.json and falls back from cleanly when it is not there. The main game does
 * not read it and is unaffected by any of this.
 */
import fs from 'fs';
import path from 'path';
import { cfbdFetchRetry, mean, stdev, round } from './lib.mjs';

/* TWENTY-ONE SEASONS, THE SAME SPAN AS THE MAIN FILE, and the span is not a matter of taste.
   Two things need it. churn.js regresses a programme toward its own level, and one year is
   not a level, it is a fluke waiting to be frozen. And a term can OPEN in an earlier year:
   taking office in 2011 is supposed to hand you a sport where the Pac-12 is twelve teams and
   Texas is in the Big 12, because stopping what happened next is the whole reason to start
   there. A first draft of this file began at 2015 on the theory that eleven seasons is enough
   history, which is true of the first requirement and silently deletes the second. */
const SEASONS = [];
for (let y = 2005; y <= 2025; y++) SEASONS.push(y);
const CURRENT = 2025;

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = path.join(ROOT, 'cfb/data/cfb_fbs.json');

/* The four that hold a vote in the mode, so the file can be checked at a glance. */
const POWERS = new Set(['SEC', 'Big Ten', 'ACC', 'Big 12']);

async function main() {
  /* ---- who is in the division, and what they look like ---- */
  const teams = await cfbdFetchRetry('/teams/fbs', { year: CURRENT }, `fbs_teams_${CURRENT}.json`);
  const meta = new Map();
  for (const t of teams) {
    if (!t.school) continue;
    meta.set(t.school, {
      conference: t.conference || 'FBS Independents',
      abbreviation: t.abbreviation || t.school,
      color: t.color || '#64748b',
    });
  }
  process.stderr.write(`  ${meta.size} FBS teams in ${CURRENT}\n`);

  /* ---- every regular season game, aggregated per team-season ---- */
  const ts = new Map();
  const touch = (key) => {
    let e = ts.get(key);
    if (!e) { e = { scored: [], allowed: [], w: 0, l: 0, conf: '', vs: [] }; ts.set(key, e); }
    return e;
  };

  for (const season of SEASONS) {
    const games = await cfbdFetchRetry(
      '/games',
      { year: season, seasonType: 'regular', classification: 'fbs' },
      `games_${season}.json`,
    );
    for (const g of games) {
      if (g.homePoints == null || g.awayPoints == null) continue;
      const home = Number(g.homePoints), away = Number(g.awayPoints);
      if (isNaN(home) || isNaN(away)) continue;
      const h = touch(`${g.homeTeam}-${season}`);
      const a = touch(`${g.awayTeam}-${season}`);
      h.scored.push(home); h.allowed.push(away);
      a.scored.push(away); a.allowed.push(home);
      if (home > away) { h.w++; a.l++; } else if (away > home) { a.w++; h.l++; }
      h.conf = g.homeConference || h.conf;
      a.conf = g.awayConference || a.conf;
      /* WHO IT WAS AGAINST, kept per game so the schedule can be solved out below. About an
         eighth of these are against a school outside the division, which has no rating to
         average in; those are marked and dropped from the solve, exactly as Sports Reference
         does it, while still counting toward the record. */
      const bothFbs = meta.has(g.homeTeam) && meta.has(g.awayTeam);
      h.vs.push({ opp: g.awayTeam, margin: home - away, fbs: bothFbs });
      a.vs.push({ opp: g.homeTeam, margin: away - home, fbs: bothFbs });
    }
    process.stderr.write(`  games ${season}\n`);
  }

  /* ---- rows ---- */
  const rows = [];
  for (const [id, e] of ts) {
    const cut = id.lastIndexOf('-');
    const school = id.slice(0, cut);
    const season = Number(id.slice(cut + 1));
    /* A TEAM THAT PLAYED FOUR GAMES IS NOT A TEAM SEASON. Covid years and schools that moved
       up mid-decade produce these, and a two game sample z-scores into nonsense. */
    if (e.scored.length < 8) continue;
    const m = meta.get(school);
    /* WHAT THE MODE ACTUALLY READS AND NOTHING ELSE, because a page fetches this file over a
       phone connection. 02-teams.mjs carries a wider row and has to: the draft game shows a
       team season to a player and needs the mascot, the alternate colour, the display name.
       Commish shows a league table. It reads nine fields, and the ones it does not read are
       mostly per-SCHOOL rather than per-season, so carrying them costs the same bytes
       twenty-one times over. Written in full the file was 975KB for 2605 rows. Trimmed to what
       is read it is 568KB for the same 2605 rows.

       `record` and `srs` are the exception and are kept deliberately: neither is read by
       anything, and both are what a human needs to open this file and tell at a glance
       whether it is right. That has already mattered once. */
    rows.push({
      school,
      season,
      /* THE CONFERENCE THAT SEASON, from the games themselves, so a school that moved is in
         the league it actually played in, and the row for the current year is therefore also
         the current membership the mode starts a term with. */
      conference: e.conf || (m ? m.conference : 'FBS Independents'),
      abbreviation: m ? m.abbreviation : school,
      color: m ? m.color : '#64748b',
      record: `${e.w}-${e.l}`,
      pts_scored_mean: round(mean(e.scored), 2),
      pts_scored_sd: round(stdev(e.scored), 2),
      pts_allowed_mean: round(mean(e.allowed), 2),
      srs: 0,
      strength_z: 0,
    });
  }

  /* ---- how good a team actually was ----
     POINT DIFFERENTIAL DOES NOT KNOW WHO YOU PLAYED, and that is fatal once the whole
     division is in one file. 02-teams.mjs z-scores raw differential, which is defensible
     there because every school in that file is a power school with roughly the same
     schedule. Here it means a Mid-American team that wins its games by fifteen outranks an
     SEC team that wins by twelve, and the SEC team would beat it by twenty.

     Left alone it showed up at the end of the pipeline rather than here: undefeated Group of
     Five teams arrived at 1.57 a season against a real rate near a half, San Diego State took
     the seventh seed in the playoff having beaten nobody above z 0.5, and three of the twelve
     seats went outside the power four in a format that gives out about one.

     SO THE SCHEDULE IS SOLVED OUT. This is Sports Reference's SRS: a team's rating is its
     average margin plus the average rating of everybody it played, which is circular, so it
     is iterated to a fixed point. Beat a good team by three and you rate above somebody who
     beat a bad team by twenty.

     THE MARGIN IS CAPPED, because the fixed point does not care that the fourth quarter was
     played against walk-ons and a 70-0 would otherwise drag a whole conference up through the
     schedule terms. Twenty-eight is four scores: past it, nobody learns anything more. */
  const MARGIN_CAP = 28;
  const ITERATIONS = 60;
  for (const season of SEASONS) {
    const group = rows.filter((r) => r.season === season);
    if (group.length < 2) continue;
    const byId = new Map(group.map((r) => [r.school, r]));
    /* Only games between two teams in this file can be solved: an opponent outside the
       division has no rating to average in. */
    const sched = new Map();
    for (const r of group) {
      const e = ts.get(`${r.school}-${season}`);
      sched.set(r.school, (e ? e.vs : []).filter((g) => g.fbs && byId.has(g.opp))
        .map((g) => ({ opp: g.opp, margin: Math.max(-MARGIN_CAP, Math.min(MARGIN_CAP, g.margin)) })));
    }
    const rating = new Map(group.map((r) => [r.school, 0]));
    for (let it = 0; it < ITERATIONS; it++) {
      const next = new Map();
      for (const r of group) {
        const gs = sched.get(r.school);
        if (!gs.length) { next.set(r.school, rating.get(r.school)); continue; }
        let s = 0;
        for (const g of gs) s += g.margin + rating.get(g.opp);
        next.set(r.school, s / gs.length);
      }
      /* RECENTRED EVERY PASS. The fixed point is only defined up to an additive constant, and
         without this the whole league drifts off together and never settles. */
      const mu = mean([...next.values()]);
      for (const [k, v] of next) rating.set(k, v - mu);
    }
    for (const r of group) r.srs = round(rating.get(r.school), 2);
    /* Z WITHIN THE SEASON, so the file is on the same scale as 02-teams.mjs and churn.js can
       be fitted against either. */
    const s = stdev(group.map((r) => r.srs));
    const mu = mean(group.map((r) => r.srs));
    for (const r of group) r.strength_z = round(s ? (r.srs - mu) / s : 0, 3);
  }

  /* ---- refuse to write something broken ---- */
  const current = rows.filter((r) => r.season === CURRENT);
  const confs = {};
  current.forEach((r) => { confs[r.conference] = (confs[r.conference] || 0) + 1; });
  const g5 = current.filter((r) => !POWERS.has(r.conference)
    && r.conference !== 'FBS Independents').length;

  if (current.length < 110) {
    console.error(`REFUSING: only ${current.length} teams in ${CURRENT}. FBS has about 134.`);
    process.exit(1);
  }
  /* THE WHOLE POINT OF THIS FILE. Writing it without the Group of Five would leave the mode
     exactly where it started while looking like it had been fixed. */
  if (g5 < 50) {
    console.error(`REFUSING: only ${g5} teams outside the power conferences. That is the one `
      + 'thing this file exists to add.');
    process.exit(1);
  }
  if (rows.length < 900) {
    console.error(`REFUSING: ${rows.length} team-seasons is too little history for a `
      + 'programme level. churn.js regresses a school toward its own past and there is not '
      + 'enough past here.');
    process.exit(1);
  }

  rows.sort((a, b) => (a.season - b.season) || a.school.localeCompare(b.school));
  fs.writeFileSync(OUT, JSON.stringify(rows));

  console.log(`${rows.length} team-seasons, ${SEASONS[0]} to ${CURRENT}`);
  console.log(`${current.length} teams in ${CURRENT}, ${g5} of them outside the power four`);
  console.log('conferences:');
  Object.entries(confs).sort((a, b) => b[1] - a[1])
    .forEach(([c, n]) => console.log(`  ${String(n).padStart(3)}  ${c}`));
  const top = current.slice().sort((a, b) => b.strength_z - a.strength_z).slice(0, 5);
  console.log('best of ' + CURRENT + ': '
    + top.map((r) => `${r.school} ${r.record} z=${r.strength_z}`).join(', '));
}

main().catch((e) => { console.error(e); process.exit(1); });
