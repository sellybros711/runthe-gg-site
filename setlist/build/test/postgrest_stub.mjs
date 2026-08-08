/* A stand-in for PostgREST, big enough to serve every request setlist/board.js
 * makes, backed by a real Postgres running the real
 * supabase/67_setlist_leaderboard.sql.
 *
 *   node setlist/build/test/postgrest_stub.mjs [port] [database]
 *
 * WHY NOT JUST MOCK fetch(). Because then the test would prove that board.js agrees
 * with a mock somebody wrote to match board.js. What is actually worth testing is
 * the seam: the URLs it builds, the operators it puts in them, the Content-Range it
 * reads a count out of, and the shape of the payload segue_submit_run() receives.
 * All of that has to survive contact with something that parses it independently,
 * and the validator on the other side has to be the real one.
 *
 * NOT A GENERAL PostgREST. It understands the handful of query shapes board.js
 * emits and answers anything else with a 400, which is the right failure: a new
 * query shape appearing here should break the test until it is understood, rather
 * than being silently served wrong.
 *
 * The bearer token stands in for the JWT: a uuid becomes auth.uid() for that
 * request, anything else is a guest. That is enough to exercise attribution,
 * claiming and the private attendance list without an auth server in the loop.
 */
import { createServer } from 'http';
import { execFileSync } from 'child_process';

const PORT = Number(process.argv[2] || 5556);
const DB = process.argv[3] || 'seguetest';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* TWO -c FLAGS, NOT TWO STATEMENTS IN ONE. They share a session, so set_config
   carries over, but psql prints each one's result separately and only the second is
   read. Both in one -c interleaves set_config's own output row with the answer. */
const q = (setup, sql) => execFileSync('psql',
  ['-d', DB, '-tAq', '-v', 'ON_ERROR_STOP=1', '-c', setup, '-c', sql],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const lit = (v) => "'" + String(v).replace(/'/g, "''") + "'";

/* PostgREST's filter grammar, only the operators board.js actually uses. Anything
   else throws, so an unsupported filter is a loud failure rather than a silent
   full-table answer. */
function where(params) {
  const parts = [];
  for (const [col, raw] of params) {
    if (['select', 'order', 'limit', 'offset'].includes(col)) continue;
    if (!/^[a-z_]+$/.test(col)) throw new Error('bad column ' + col);
    const m = /^(gt|lt|gte|lte|eq|is|not)\.(.*)$/s.exec(raw);
    if (!m) throw new Error('bad filter ' + col + '=' + raw);
    const [, op, val] = m;
    if (op === 'not') {
      if (val !== 'is.null') throw new Error('unsupported not: ' + val);
      parts.push(col + ' is not null');
    } else if (op === 'is') {
      parts.push(col + ' is ' + (val === 'true' ? 'true' : val === 'false' ? 'false' : 'null'));
    } else {
      const sym = { gt: '>', lt: '<', gte: '>=', lte: '<=', eq: '=' }[op];
      parts.push(col + ' ' + sym + ' ' + lit(val));
    }
  }
  return parts.length ? ' where ' + parts.join(' and ') : '';
}

function orderBy(order) {
  if (!order) return '';
  const cols = order.split(',').map((piece) => {
    const [col, dir] = piece.split('.');
    if (!/^[a-z_]+$/.test(col)) throw new Error('bad order column ' + col);
    return col + (dir === 'asc' ? ' asc' : ' desc');
  });
  return ' order by ' + cols.join(', ');
}

const arr = (a) => a == null ? 'null' : 'array[' + a.map(lit).join(',') + ']::text[]';
const num = (v) => v == null ? 'null' : Number(v);

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (code, body, headers) => {
    res.writeHead(code, Object.assign({ 'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Expose-Headers': 'content-range' }, headers || {}));
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };
  if (req.method === 'OPTIONS') return send(204, '');

  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const uid = UUID.test(bearer) ? bearer : '';
  const asUser = (sql) => q(`select set_config('test.uid', ${lit(uid)}, false)`, sql)
    .trim().split('\n').pop().trim();

  const readBody = async () => {
    let raw = ''; for await (const c of req) raw += c;
    return JSON.parse(raw || '{}');
  };

  try {
    if (req.method === 'POST' && url.pathname === '/rest/v1/rpc/segue_submit_run') {
      const p = await readBody();
      /* POSITIONAL ARGUMENTS, so a parameter added to the function has to be added
         here too. PostgREST passes them by name and would not care; this cannot,
         and a missing one silently takes its default. */
      const args = [
        lit(p.p_band), num(p.p_total), num(p.p_song_pts), num(p.p_time_pts),
        num(p.p_flow_pts), num(p.p_breadth_pts), arr(p.p_cards), num(p.p_best_total),
        num(p.p_songs), num(p.p_segues), num(p.p_sandwiches), num(p.p_covers),
        num(p.p_jamcharts), num(p.p_bustouts), num(p.p_cooldowns),
        num(p.p_longest_sec), num(p.p_respins), num(p.p_seconds_used),
        arr(p.p_shows), arr(p.p_picks),
        p.p_rng_seed == null ? 'null' : lit(p.p_rng_seed),
      ].join(',');
      return send(200, Number(asUser(`select segue_submit_run(${args})`)));
    }

    if (req.method === 'POST' && url.pathname === '/rest/v1/rpc/segue_claim_run') {
      const p = await readBody();
      return send(200, asUser(`select segue_claim_run(${num(p.p_id)})`) === 't');
    }

    if (req.method === 'POST' && url.pathname === '/rest/v1/rpc/segue_sync_attended') {
      const p = await readBody();
      /* The function returns text[], which PostgREST renders as a JSON array. */
      const out = asUser(
        `select coalesce(to_jsonb(segue_sync_attended(${lit(p.p_band)}, ${arr(p.p_shows)}))::text, 'null')`);
      return send(200, JSON.parse(out));
    }

    if (req.method === 'POST' && url.pathname === '/rest/v1/rpc/segue_forget_attended') {
      const p = await readBody();
      return send(200,
        asUser(`select segue_forget_attended(${lit(p.p_band)}, ${lit(p.p_show)})`) === 't');
    }

    if (req.method === 'GET' && url.pathname === '/rest/v1/segue_runs') {
      const params = [...url.searchParams.entries()];
      const sel = url.searchParams.get('select') || '*';
      if (!/^[a-z_,]+$|^\*$/.test(sel)) throw new Error('bad select');
      const w = where(params);
      const lim = Number(url.searchParams.get('limit') || 100);
      const ord = orderBy(url.searchParams.get('order'));
      const wantCount = /count=exact/.test(req.headers.prefer || '');

      /* jsonb_agg, NOT json_agg: json_agg pretty-prints with a newline between
         elements, and reading the last line of that gets a fragment of the array. */
      const rows = JSON.parse(asUser(
        `select coalesce(jsonb_agg(t)::text,'[]') from ` +
        `(select ${sel} from segue_runs${w}${ord} limit ${lim}) t`
      ));

      const headers = {};
      if (wantCount) {
        const total = Number(asUser(`select count(*) from segue_runs${w}`));
        headers['Content-Range'] = `0-${Math.max(0, rows.length - 1)}/${total}`;
      }
      return send(200, rows, headers);
    }
    return send(404, { message: 'no route: ' + req.method + ' ' + url.pathname });
  } catch (e) {
    const msg = String((e && e.stderr) || (e && e.message) || e);
    /* Mirror how PostgREST surfaces a raised exception, so board.js's error handling
       is exercised on the shape it will actually meet. */
    return send(400, { code: 'P0001', message: msg.replace(/^psql:[^\n]*\n?/gm, '').trim() });
  }
}).listen(PORT, () => console.log('postgrest stub on :' + PORT + ' against ' + DB));
