/* Turning a provider payload into rows, and nothing else.
 *
 * PURE ON PURPOSE. No fetch, no database, no clock. It takes the JSON the odds
 * API returned and gives back the rows fantasy_odds_snapshots wants, plus a
 * list of everything it could not make sense of.
 *
 * That split is what makes the hard part testable. Parsing is where a provider
 * schema change lands, and a schema change is silent: the request succeeds,
 * the JSON is valid, and the parser quietly finds nothing. A parser that also
 * did the fetching could only be checked against the live API, which means it
 * could only be checked by spending credits, which means in practice it would
 * not be checked.
 *
 *
 * IT NEVER THROWS ON BAD DATA, AND IT NEVER DROPS IT SILENTLY EITHER
 * ---------------------------------------------------------------------------
 * A single malformed outcome must not cost the other forty in the same
 * response, so nothing here aborts. But the brief is explicit that an
 * unmatched or unparseable player gets LOGGED rather than dropped, because a
 * missing row and a dropped row look identical on screen: both are a player
 * with no projection, and one of those is honest.
 *
 * So every rejection lands in `skipped` with a reason, and the caller writes
 * them to fantasy_unmatched_players. A parse that returns forty rows and
 * twelve skips is a working day. A parse that returns zero rows and zero skips
 * is a schema change, and the sweep treats it as an error rather than as a
 * quiet afternoon.
 */

/* The shape the provider sends, for the next person reading this:
 *
 *   {
 *     id: "...", sport_key: "americanfootball_nfl",
 *     commence_time: "2026-09-27T17:00:00Z",
 *     home_team: "...", away_team: "...",
 *     bookmakers: [{
 *       key: "draftkings", title: "DraftKings", last_update: "...",
 *       markets: [{
 *         key: "player_reception_yds", last_update: "...",
 *         outcomes: [
 *           { name: "Over",  description: "Ja'Marr Chase", price: -115, point: 61.5 },
 *           { name: "Under", description: "Ja'Marr Chase", price: -105, point: 61.5 }
 *         ]
 *       }]
 *     }]
 *   }
 *
 * THE PLAYER IS IN `description`, NOT IN `name`. `name` is Over or Under. That
 * is the single most surprising thing about this payload and the one a reader
 * assumes the other way round. Anytime touchdown is the exception: there the
 * outcome names are Yes and No.
 */

/* Normalising a name for matching. Lowercase, strip punctuation, collapse
 * whitespace, drop a generational suffix.
 *
 * SUFFIXES ARE DROPPED AND THAT IS A REAL RISK, taken deliberately. CLAUDE.md
 * records this repo already shipping a bug where two people sharing a name
 * were folded into one record and a player emailed in about it. Here the
 * normalised name is only ever a LOOKUP KEY into a crosswalk that resolves to
 * one id; it is never itself the identity. Marvin Harrison and Marvin Harrison
 * Jr. normalise the same and must be told apart by the crosswalk, which knows
 * their teams and positions. If that crosswalk is ever bypassed and this
 * string used as an identity, that bug comes straight back. */
export function normName(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\.?\b/g, ' ')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Markets with no line, where the price IS the whole quote. */
const NO_LINE = new Set(['player_anytime_td', 'player_1st_td', 'player_last_td']);

/* Which outcome is the "over" side, by market. Yardage and counts say Over and
 * Under; touchdown markets say Yes and No. Both are folded to over/under here
 * so everything downstream has one shape to reason about. */
function side(marketKey, outcomeName) {
  const n = String(outcomeName || '').toLowerCase();
  if (n === 'over' || n === 'yes') return 'over';
  if (n === 'under' || n === 'no') return 'under';
  return null;
}

/* Parse one event's odds into snapshot rows.
 *
 * `capturedAt` is passed in rather than read from the clock, so a re-parse of a
 * stored raw payload reproduces the same rows. That is the idempotency the
 * brief asks for, and it only holds if nothing in here calls Date.now(). */
export function parseEventOdds(payload, { capturedAt, season, week, pollId = null } = {}) {
  const rows = [];
  const skipped = [];
  const note = (why, detail) => skipped.push({ why, ...detail });

  if (!payload || typeof payload !== 'object') {
    note('payload_not_an_object', { got: typeof payload });
    return { rows, skipped, eventId: null };
  }
  const eventId = payload.id || null;
  if (!eventId) {
    note('no_event_id', {});
    return { rows, skipped, eventId: null };
  }

  const books = Array.isArray(payload.bookmakers) ? payload.bookmakers : [];
  if (!books.length) note('no_bookmakers', { eventId });

  for (const book of books) {
    const bookKey = book && book.key;
    if (!bookKey) { note('book_has_no_key', { eventId }); continue; }
    const markets = Array.isArray(book.markets) ? book.markets : [];

    for (const market of markets) {
      const mk = market && market.key;
      if (!mk) { note('market_has_no_key', { eventId, book: bookKey }); continue; }

      /* The book's own timestamp for this quote is the idempotency key in
         fantasy_odds_snapshots. Falling back to the market's, then to the
         poll's own capturedAt, because the column is NOT NULL and a provider
         that omits it must not cost us the row. Recorded as a skip note when
         it happens, since a provider that stops sending last_update turns
         every re-poll into a new row and the table grows fast. */
      let upd = market.last_update || book.last_update || null;
      if (!upd) {
        note('no_last_update', { eventId, book: bookKey, market: mk });
        upd = capturedAt;
      }

      const outcomes = Array.isArray(market.outcomes) ? market.outcomes : [];
      /* Group by player and line, because a row carries BOTH prices. Books
         quote alternate lines for the same player in the same market, so the
         key has to include the point or the two lines collapse into one row
         and the second silently overwrites the first. */
      const byKey = new Map();
      for (const o of outcomes) {
        const player = NO_LINE.has(mk) ? o.description : o.description;
        if (!player) {
          note('outcome_has_no_player', { eventId, book: bookKey, market: mk, name: o.name });
          continue;
        }
        const s = side(mk, o.name);
        if (!s) {
          note('unknown_outcome_side', { eventId, book: bookKey, market: mk, name: o.name, player });
          continue;
        }
        if (typeof o.price !== 'number' || !Number.isFinite(o.price)) {
          note('price_not_a_number', { eventId, book: bookKey, market: mk, player, price: o.price });
          continue;
        }
        const point = NO_LINE.has(mk) ? null : (typeof o.point === 'number' ? o.point : null);
        if (!NO_LINE.has(mk) && point === null) {
          note('no_line_on_a_market_that_needs_one', { eventId, book: bookKey, market: mk, player });
          continue;
        }

        const k = `${player}\u0000${point === null ? '' : point}`;
        if (!byKey.has(k)) byKey.set(k, { player, point, over: null, under: null });
        const slot = byKey.get(k);
        if (slot[s] !== null) {
          note('duplicate_side', { eventId, book: bookKey, market: mk, player, side: s });
          continue;
        }
        slot[s] = o.price;
      }

      for (const q of byKey.values()) {
        /* A ONE SIDED QUOTE CANNOT BE DE-VIGGED and must not be stored as
           though it could. Removing the margin needs both prices; with one,
           the implied probability still carries the whole vig and any
           projection built on it is biased by several points with nothing on
           screen to say so. An anytime touchdown market quoted Yes only is the
           common case, and it is a skip rather than a row. */
        if (q.over === null || q.under === null) {
          note('one_sided_quote', {
            eventId, book: bookKey, market: mk, player: q.player,
            has: q.over !== null ? 'over' : 'under',
          });
          continue;
        }
        rows.push({
          season, week, event_id: eventId,
          book: bookKey,
          market: mk,
          player_id: null,              // filled by the crosswalk, never here
          player_name_raw: q.player,
          player_name_norm: normName(q.player),
          line: q.point,
          over_price: q.over,
          under_price: q.under,
          book_last_update: upd,
          captured_at: capturedAt,
          poll_id: pollId,
        });
      }
    }
  }

  return { rows, skipped, eventId };
}

/* The event list endpoint, which is a different and much simpler payload and
 * costs no credits. It is what tells the ladder when kickoff is. */
export function parseEvents(payload, season, week) {
  const out = [];
  const skipped = [];
  if (!Array.isArray(payload)) {
    skipped.push({ why: 'events_payload_not_an_array', got: typeof payload });
    return { events: out, skipped };
  }
  for (const e of payload) {
    if (!e || !e.id || !e.commence_time) {
      skipped.push({ why: 'event_missing_id_or_kickoff', id: e && e.id });
      continue;
    }
    const ms = Date.parse(e.commence_time);
    if (!Number.isFinite(ms)) {
      skipped.push({ why: 'unparseable_kickoff', id: e.id, commence_time: e.commence_time });
      continue;
    }
    out.push({
      event_id: e.id,
      season,
      week,
      commenceMs: ms,
      commence_time: new Date(ms).toISOString(),
      home_team: e.home_team || '',
      away_team: e.away_team || '',
    });
  }
  return { events: out, skipped };
}
