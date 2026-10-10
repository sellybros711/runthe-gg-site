/* Sportegories challenges (Cloudflare Pages Function)
 *
 * POST /api/sportegories-challenge   { answer, letter, cat, label }
 *   -> { verdict: 'upheld'|'denied'|'unsure'|'offline'|'refused'|'stale', msg }
 * GET  /api/sportegories-challenge?c=<label>&c=<label>...
 *   -> { rulings: [{ a: nameKey, c: label }] }   the upheld ones, for a card
 *
 * The ruling is functions/_sportegories/challenge.js; this file only wires it
 * to the game's own data, Wikidata and the memory table.
 *
 * The game's data is read from the deployment's own static file rather than
 * bundled, so the server always rules against exactly the library the page
 * was graded against. It is parsed once per isolate. Without the
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE secrets, or against a database
 * without 135, it still rules and simply remembers nothing.
 */
import SP from '../../arcade/sportegories.js';
import LC from '../../arcade/livecheck.js';
import { wikidata } from './player-check.js';
import { rule, supabaseMemory } from '../_sportegories/challenge.js';

let ready = null;

async function load(context) {
  if (!ready) {
    ready = (async () => {
      const url = new URL('/arcade/sportegories-data.js', context.request.url);
      const res = context.env && context.env.ASSETS ? await context.env.ASSETS.fetch(url) : await fetch(url);
      if (!res.ok) throw new Error('data ' + res.status);
      SP.setData(parseData(await res.text()));
      LC.setEngine(SP);
      return true;
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

/* The data file is `window.RTG_SPORTEGORIES_DATA = {...};` with JSON on the
   right, written by scripts/build-sportegories.mjs. A Worker cannot eval it,
   so the object is read as JSON. */
export function parseData(text) {
  const mark = 'RTG_SPORTEGORIES_DATA';
  const at = text.indexOf(mark);
  const open = text.indexOf('{', at);
  const close = text.lastIndexOf('}');
  if (at < 0 || open < 0 || close < open) throw new Error('data file shape');
  return JSON.parse(text.slice(open, close + 1));
}

export async function onRequestPost(context) {
  try {
    await load(context);
    let body = {};
    try { body = await context.request.json(); } catch (e) {}
    const out = await rule(body, { SP, LC, wiki: wikidata, db: supabaseMemory(context.env) });
    return json(out);
  } catch (e) {
    return json({ verdict: 'offline', msg: 'Couldn’t reach the record books. Try again in a minute.' }, 502);
  }
}

export async function onRequestGet(context) {
  try {
    const u = new URL(context.request.url);
    const labels = u.searchParams.getAll('c').map((s) => s.slice(0, 80)).slice(0, 12);
    const db = supabaseMemory(context.env);
    const rulings = db ? await db.upheld(labels) : [];
    return json({ rulings }, 200, 60);
  } catch (e) {
    return json({ rulings: [] });
  }
}

function json(obj, status, ttl) {
  const h = { 'content-type': 'application/json; charset=utf-8' };
  h['cache-control'] = ttl ? 'public, max-age=' + ttl : 'no-store';
  return new Response(JSON.stringify(obj), { status: status || 200, headers: h });
}
