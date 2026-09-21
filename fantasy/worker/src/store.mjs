/* Everything the Worker writes, through PostgREST, with the service role.
 *
 * The service key bypasses RLS, which is why it lives in a Worker secret and
 * never anywhere a browser can reach. Nothing in this file is ever called from
 * a page.
 *
 *
 * THE WRITE ORDER IS THE DESIGN, AND IT IS THE OPPOSITE OF THE OBVIOUS ONE
 * ---------------------------------------------------------------------------
 * A poll run row is opened BEFORE the provider is called and closed after,
 * rather than written once at the end when we know how it went. That costs an
 * extra round trip per sweep and buys the only thing that makes a Sunday
 * morning debuggable: a sweep that hangs, crashes, or gets killed mid-flight
 * leaves a row saying it started and never finished.
 *
 * Written only on success, a Worker that dies every tick produces an empty
 * table, which reads exactly like a Worker that is not scheduled at all. The
 * brief calls a silent hot-path failure the worst outcome this system can
 * produce, and "no rows" is the silent version.
 */

const PREFER_IGNORE = 'resolution=ignore-duplicates,return=minimal';
const PREFER_MERGE = 'resolution=merge-duplicates,return=minimal';

export function makeStore({ url, serviceKey, fetchImpl = fetch, log = () => {} }) {
  if (!url || !serviceKey) throw new Error('makeStore: needs url and serviceKey');
  const base = String(url).replace(/\/+$/, '');

  async function rest(path, { method = 'GET', body = null, prefer = null, headers = {} } = {}) {
    const res = await fetchImpl(base + '/rest/v1' + path, {
      method,
      headers: {
        apikey: serviceKey,
        Authorization: 'Bearer ' + serviceKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
        ...headers,
      },
      body: body === null ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`supabase ${method} ${path} -> ${res.status} ${detail.slice(0, 300)}`);
    }
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  const rpc = (fn, args) => rest('/rpc/' + fn, { method: 'POST', body: args || {} });

  return {
    /* ------------------------------------------------------------------
     * The budget. Both halves, and the order matters.
     * ---------------------------------------------------------------- */

    /* Charged BEFORE the request. Atomic in the database, because two
       overlapping cron ticks are a thing that happens and a read-then-write
       here would let both pass a cap neither alone would break. */
    async spend(credits) {
      const r = await rpc('fantasy_budget_spend', { p_credits: credits });
      const row = Array.isArray(r) ? r[0] : r;
      if (!row) throw new Error('fantasy_budget_spend returned nothing');
      return {
        allowed: !!row.allowed,
        used: row.used_after,
        cap: row.cap_after,
        left: row.left_now,
      };
    },

    /* Reconciled after. Never lowers our own count: if we believe we spent
       more than the provider says, the higher number is the safer one to keep
       enforcing against, and the gap is a bug to find rather than a refund. */
    observe(usage) {
      if (!usage || (usage.remaining == null && usage.used == null)) return Promise.resolve();
      return rpc('fantasy_budget_observe', {
        p_remaining: usage.remaining, p_used: usage.used,
      }).catch((e) => log({ at: 'store.observe.failed', error: String(e.message || e) }));
    },

    /* ------------------------------------------------------------------
     * Poll runs: the freshness record and the failure log
     * ---------------------------------------------------------------- */

    /* A FAILURE HERE USED TO HAVE NOWHERE TO GO, AND THAT IS HOW A POLLER GOES
       QUIET WHILE REPORTING SUCCESS.

       Every caller wrapped this in `.catch(() => null)`, and closeRun opens
       with `if (id == null) return`, so a refused insert became a null, became
       a no-op, and the tick carried on and logged tick.done. Measured against
       the real thing: 184 successful ticks, zero errors, zero rows. The one
       table that records what the Worker is doing was the one table it could
       not write to, and nothing anywhere said so.

       So the refusal is logged HERE, once, rather than at four call sites that
       each have their own reason for not wanting to throw. It still returns
       null, because none of those callers can do anything useful with an
       exception; what changes is that the reason reaches the log, which is the
       one channel that does not depend on this table working. */
    async openRun({ eventId, markets, credits }) {
      try {
        const r = await rest('/fantasy_poll_runs', {
          method: 'POST',
          body: [{ event_id: eventId, markets, credits_charged: credits, ok: false }],
          prefer: 'return=representation',
        });
        const id = Array.isArray(r) && r[0] ? r[0].id : null;
        /* A 2xx THAT CARRIES NO ID IS NOT THE SAME FAILURE AS A REFUSAL, and
           telling them apart is the difference between a permissions problem
           and a Prefer header the server did not honour. */
        if (id == null) {
          log({ at: 'store.openRun.no_id', got: JSON.stringify(r || null).slice(0, 200) });
        }
        return id;
      } catch (e) {
        log({ at: 'store.openRun.failed', error: String(e.message || e) });
        return null;
      }
    },

    closeRun(id, patch) {
      if (id == null) return Promise.resolve();
      return rest('/fantasy_poll_runs?id=eq.' + encodeURIComponent(id), {
        method: 'PATCH',
        body: { finished_at: new Date().toISOString(), ...patch },
        prefer: 'return=minimal',
      }).catch((e) => log({ at: 'store.closeRun.failed', id, error: String(e.message || e) }));
    },

    /* When each event was last SUCCESSFULLY polled. This is what the ladder
       compares against, and it is deliberately read from the run log rather
       than from the snapshots: a poll that found no change writes no snapshot,
       so snapshots would say we had not looked when we had, and the ladder
       would poll again immediately and again after that. */
    async lastPollByEvent() {
      const rows = await rest('/fantasy_poll_runs'
        + '?select=event_id,started_at&ok=is.true&order=started_at.desc&limit=2000');
      const out = {};
      for (const r of rows || []) {
        if (r.event_id && out[r.event_id] === undefined) out[r.event_id] = Date.parse(r.started_at);
      }
      return out;
    },

    /* ------------------------------------------------------------------
     * The data
     * ---------------------------------------------------------------- */

    upsertEvents(events) {
      if (!events.length) return Promise.resolve();
      return rest('/fantasy_events?on_conflict=event_id', {
        method: 'POST',
        prefer: PREFER_MERGE,
        body: events.map((e) => ({
          event_id: e.event_id,
          season: e.season,
          week: e.week,
          commence_time: e.commence_time,
          home_team: e.home_team,
          away_team: e.away_team,
          updated_at: new Date().toISOString(),
        })),
      });
    },

    closeEvents(ids) {
      if (!ids.length) return Promise.resolve();
      return rest('/fantasy_events?event_id=in.(' + ids.map(encodeURIComponent).join(',') + ')', {
        method: 'PATCH',
        body: { polling_closed: true, updated_at: new Date().toISOString() },
        prefer: 'return=minimal',
      });
    },

    /* IGNORE DUPLICATES, which is where the idempotency actually lives. The
       unique key carries the book's own last_update, so re-polling an
       unchanged quote conflicts and writes nothing, and the pipeline is
       re-runnable over any window without duplicating a row. That is a
       property of the key rather than of this caller being careful, which is
       the difference between a guarantee and a habit.

       Returns nothing useful, so the caller cannot know how many rows were NEW
       without asking. It does not need to: rows_written on the run row is a
       count of rows OFFERED, and a sweep that offered forty and stored none is
       a market that has not moved, which is correct and uninteresting. */
    insertSnapshots(rows) {
      if (!rows.length) return Promise.resolve();
      const conflict = 'season,event_id,book,market,player_name_raw,book_last_update';
      return rest('/fantasy_odds_snapshots?on_conflict=' + conflict, {
        method: 'POST',
        prefer: PREFER_IGNORE,
        body: rows.map((r) => ({
          season: r.season, week: r.week, event_id: r.event_id,
          book: r.book, market: r.market,
          player_id: r.player_id,
          player_name_raw: r.player_name_raw,
          line: r.line,
          over_price: r.over_price,
          under_price: r.under_price,
          book_last_update: r.book_last_update,
          captured_at: r.captured_at,
          poll_id: r.poll_id,
          raw: r.raw ?? null,
        })),
      });
    },

    /* EVERY NAME WE COULD NOT RESOLVE, which the brief asks for by name. A
       dropped player and a player with genuinely no market look identical on
       screen, and only one of them is honest. */
    recordUnmatched(items) {
      if (!items.length) return Promise.resolve();
      return rest('/fantasy_unmatched_players?on_conflict=name_norm,market', {
        method: 'POST',
        prefer: PREFER_IGNORE,
        body: items.map((u) => ({
          name_raw: u.name_raw,
          name_norm: u.name_norm,
          market: u.market || null,
          event_id: u.event_id || null,
        })),
      });
    },

    /* The crosswalk, read once a sweep and held for the tick. Small: a week of
       NFL props touches a few hundred players. */
    async aliases() {
      const rows = await rest('/fantasy_player_aliases?select=alias_norm,player_id&limit=10000');
      const m = new Map();
      for (const r of rows || []) m.set(r.alias_norm, r.player_id);
      return m;
    },
  };
}
