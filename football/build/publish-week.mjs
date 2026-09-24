/* THE SERVER'S COPY OF A WEEK, AS SQL ON STDOUT.
 *
 *   node football/build/publish-week.mjs --season 2026 --week 3            the board
 *   node football/build/publish-week.mjs --season 2026 --week 3 --results  what it scored
 *   node football/build/publish-week.mjs --season 2026 --week 3 | psql "$SUPABASE_DB_URL"
 *
 * `supabase/109_fantasy_challenge.sql` holds the week, the prices and the results, and the
 * reason it holds them is in that file's header: the client sends six ids and nothing else,
 * so the cap, the lock, the shape and whether a man was even on the board are all answered
 * from rows rather than from anything a page said. This is what puts the rows there.
 *
 * ─── IT EMITS SQL RATHER THAN CONNECTING ─────────────────────────────────────────────
 *
 * The workflow already has `psql` and `SUPABASE_DB_URL`, which is how every other Supabase
 * job on this repo reaches the database, so a client library here would be a second way in
 * and a dependency this build does not otherwise have. Text on stdout is also the version
 * somebody can READ before it runs, and paste by hand on a week the workflow missed.
 *
 * ─── ONE TRANSACTION, WHICH IS WHAT MAKES THE ORDER NOT MATTER ───────────────────────
 *
 * The week row is what OPENS entries, and a week open with no prices refuses every lineup
 * as "somebody who is not on this week's board", which is a true sentence about the wrong
 * thing. The week is written FIRST because the prices carry a foreign key to it, so the
 * other order simply fails; what stops the gap being reachable is the transaction, not the
 * order. A publish that dies half way leaves the week exactly as shut as it was.
 *
 * ─── THE CAP AND THE SLOTS COME OFF THE ENGINE, NOT OUT OF THIS FILE ─────────────────
 *
 * `draft.js` is what the page drafts against, so it is what an entry has to be legal under.
 * `108_hoops_leaderboard.sql` writes its engine's constants out as SQL literals and its own
 * header records the cost of that drift; here the week row carries them and there is one
 * copy. Change `CAP_MUSD` and the next publish moves the server with the page.
 *
 * ─── RE-RUNNABLE, BECAUSE A WEEK GETS REBUILT ────────────────────────────────────────
 *
 * The Tuesday job runs again if it is re-dispatched, a stat correction re-scores a week, and
 * a board is rebuilt when a club's Sunday changes. Every statement is an upsert, so
 * publishing twice is publishing once. What it must never do is DELETE a price that entries
 * already name, so prices are added and updated and never removed: an entry stores ids, and
 * a price row that vanished would make a submitted lineup unreadable.
 */

import fs from 'fs';
import path from 'path';
import { DATA_DIR } from './lib.mjs';

/* Loaded rather than copied. The file is a browser IIFE that also does module.exports. */
const DRAFT = (await import('../fantasy/draft.js')).default
  || (await import('../fantasy/draft.js'));

/** Postgres string literal. Ids and positions are nflverse's and never carry a quote,
 *  which is exactly why this is here rather than trusted. */
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
/** A money or points figure, to two places, with anything non-finite refused loudly. */
const n2 = (v, what) => {
  const x = Number(v);
  if (!Number.isFinite(x)) throw new Error(`${what} is not a number: ${v}`);
  return x.toFixed(2);
};

export function poolSQL(pool, { cap, slots }) {
  const { season, week } = pool;
  if (!Number.isFinite(season) || !Number.isFinite(week)) {
    throw new Error('the pool file has no season or week');
  }
  if (!pool.locks_at || Number.isNaN(Date.parse(pool.locks_at))) {
    throw new Error('the pool file has no lock time');
  }
  if (!Array.isArray(pool.pool) || !pool.pool.length) {
    throw new Error('the pool file has no players in it');
  }
  /* A pool with nobody at one of the slots would publish a week no lineup can be legal in,
     and the refusal a drafter would meet is "somebody who is not on this week's board",
     which says nothing about the real fault. */
  for (const pos of new Set(slots)) {
    const have = pool.pool.filter((m) => m.position === pos).length;
    const want = slots.filter((s) => s === pos).length;
    if (have < want) {
      throw new Error(`the board has ${have} ${pos} and a lineup needs ${want}`);
    }
  }

  const out = [];
  out.push('begin;');
  out.push('');
  out.push(`-- ${season} week ${week}: ${pool.pool.length} men, locks ${pool.locks_at}`);
  /*
   * A WEEK SOMEBODY HAS DRAFTED AGAINST MUST NOT BE REPRICED, and until now that was a
   * sentence in a comment with nothing keeping it.
   *
   * Every statement below is an UPSERT, so a second run of the Tuesday job against a week
   * that is already out rewrites `cap_musd` and all 400-odd prices under every lineup that
   * has been entered. Their stored `spend` was checked against the old numbers and is then
   * a total of a board that no longer exists, and nothing anywhere throws: the entries are
   * still there, still legal looking, and quietly measured against a different game.
   *
   * IT WENT FROM ANNOYING TO FATAL WHEN THE CAP STARTED MOVING. Re-emitting slightly
   * different prices under one cap was survivable. `PRICE_PROJ_W` moved the cap from $90M
   * to $110M, so a rebuild of a published week now hands its entrants a budget they never
   * drafted with.
   *
   * SO THE SQL REFUSES, rather than the script, because the script has no database to ask
   * and the SQL is what actually runs. This is the one place in the mode that fails CLOSED,
   * for the reason 109 gives: there is a prize, so a wrongly allowed write costs more than
   * a wrongly refused one. A week nobody has entered republishes freely, which is what a
   * Tuesday rebuild before anybody has drafted actually is.
   */
  out.push(`do $$`);
  out.push(`begin`);
  out.push(`  if exists (select 1 from public.fantasy_entries`);
  out.push(`              where season = ${season} and week = ${week}) then`);
  out.push(`    raise exception `);
  out.push(`      'week ${week} of ${season} already has entries, so its prices and cap `
    + `must not move. Publish a week before anybody drafts it, or not at all.';`);
  out.push(`  end if;`);
  out.push(`end $$;`);
  out.push('');
  /* The prices below reference this row, so it has to exist before them. On a REBUILD it
     already does and this restates it, which is right: the lock can move if the schedule
     moved, and the men and their prices are the same board being restated under it. */
  out.push(`insert into public.fantasy_weeks (season, week, locks_at, cap_musd, slots)`);
  out.push(`  values (${season}, ${week}, ${q(pool.locks_at)}::timestamptz, `
    + `${n2(cap, 'the cap')}, array[${slots.map(q).join(',')}]::text[])`);
  out.push(`  on conflict (season, week) do update set`);
  out.push(`    locks_at = excluded.locks_at, cap_musd = excluded.cap_musd,`);
  out.push(`    slots = excluded.slots, built_at = now();`);
  out.push('');

  const vals = pool.pool.map((m) => {
    if (!m.player_id || !m.position) throw new Error(`a row has no id or position: ${m.name}`);
    return `  (${season},${week},${q(m.player_id)},${q(m.position)},`
      + `${n2(m.price_musd, m.name + "'s price")},${n2(m.proj, m.name + "'s projection")})`;
  });
  out.push('insert into public.fantasy_prices '
    + '(season, week, player_id, pos, price_musd, proj) values');
  out.push(vals.join(',\n'));
  out.push('  on conflict (season, week, player_id) do update set');
  out.push('    pos = excluded.pos, price_musd = excluded.price_musd, proj = excluded.proj;');
  out.push('');
  out.push('commit;');
  return out.join('\n') + '\n';
}

/*
 * THE SAME EMITTER WRITES A FINISHED WEEK AND A LIVE ONE, and that is deliberate rather
 * than a convenience. The live path runs this every few minutes during the games and the
 * Tuesday path runs it once at the end; two emitters would be two definitions of what a
 * result is, and the one that ran less often would be the one nobody noticed had drifted.
 * What differs is `res.final`, which comes off the SCHEDULE rather than off the stats.
 *
 * NOTHING SCORED YET IS A REAL STATE AND NOT AN ERROR. Before the Thursday kickoff, and for
 * the first minutes of it, nflverse has no rows for the week at all. An emitter that threw
 * there would take the live workflow red on every run until somebody scored, which is a
 * red tick for the one condition that is certain to happen every single week. It writes no
 * rows and still moves the clocks, because "we looked, and there was nothing" is exactly
 * what `checked_at` exists to record.
 */
export function resultsSQL(res) {
  const { season, week } = res;
  const ids = Object.keys(res.scores || {});

  const out = [];
  out.push('begin;');
  out.push('');
  out.push(`-- ${season} week ${week}: ${ids.length} men with a row, `
    + `${res.played} of ${res.games} games`
    + (res.final ? ', FINAL' : ', still being played'));
  if (ids.length) {
    out.push('insert into public.fantasy_results (season, week, player_id, half_ppr) values');
    out.push(ids.map((id) => `  (${season},${week},${q(id)},`
      + `${n2(res.scores[id][0], id + "'s points")})`).join(',\n'));
    out.push('  on conflict (season, week, player_id) do update set '
      + 'half_ppr = excluded.half_ppr;');
  } else {
    out.push('-- no man has a row yet, so there is nothing to upsert. The clocks still move.');
  }
  out.push('');
  /* ONE FUNCTION OWNS EVERY CLOCK ON THE WEEK, which is why this is a call rather than the
     `update ... set scored_at` it replaced. Whether the board actually MOVED is a question
     about the table after the write, not about what this file believes it just sent, and
     `fantasy_mark_results` is the only thing positioned to answer it. It also refuses to
     un-score a week that a final write has already settled, which the hand written update
     did on every partial run: a stat correction on the Tuesday would have put every screen
     back to "still being played". */
  out.push(`select * from public.fantasy_mark_results(`
    + `${season}, ${week}, ${Number(res.played)}, ${Number(res.games)}, `
    + `${res.final ? 'true' : 'false'});`);
  out.push('');
  out.push('commit;');
  return out.join('\n') + '\n';
}

/* ─── cli ──────────────────────────────────────────────────────────────────────────── */

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

if (process.argv[1] && process.argv[1].endsWith('publish-week.mjs')) {
  const season = Number(arg('--season', '2026'));
  const week = Number(arg('--week', '0'));
  const results = process.argv.includes('--results');
  const name = results ? `results_${season}_w${week}.json` : `weekly_${season}_w${week}.json`;
  const f = path.join(DATA_DIR, name);
  if (!fs.existsSync(f)) {
    /* A MISSING FILE IS AN ERROR AND NOT A QUIET NOTHING. Week one has no week zero to
       score, and the workflow answers that by not asking rather than by this exiting 0:
       a publisher that shrugged would let a real build failure through as a green run. */
    console.error(`${name} does not exist. Build it first.`);
    process.exit(1);
  }
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  process.stdout.write(results
    ? resultsSQL(j)
    /* THE WEEK'S OWN CAP AND NOT THE CONSTANT. What the server stores has to be the number
       the board on disk was drawn and priced for, because `fantasy_submit` checks a lineup
       against the row and the page drafts against the pool. Read off the constant, a
       republish of an older week would send TODAY's cap with YESTERDAY's prices, which is
       the one thing a published week must never do to itself. `capFor` falls back to the
       constant for a pool built before that key existed. */
    : poolSQL(j, { cap: DRAFT.capFor(j), slots: DRAFT.SLOTS }));
}
