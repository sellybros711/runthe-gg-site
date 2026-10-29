/* The Sportegories engine and live check, loaded once per isolate for the
 * server. Two routes use it: Sportegories' own challenges, and Stumpire's,
 * which borrow the same Wikidata reading (livecheck.js) because the two games
 * share one vocabulary of teams, positions, awards and colleges.
 *
 * The game's data is read from the deployment's own static file rather than
 * bundled, so the server always judges against the library the page shipped
 * with, and a route that never needs it never pays for it. */
import SP from '../../arcade/sportegories.js';
import LC from '../../arcade/livecheck.js';

let ready = null;

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

/* context: a Pages Function context (env.ASSETS serves the static file). */
export async function loadEngine(context) {
  if (!ready) {
    ready = (async () => {
      const url = new URL('/arcade/sportegories-data.js', context.request.url);
      const res = context.env && context.env.ASSETS ? await context.env.ASSETS.fetch(url) : await fetch(url);
      if (!res.ok) throw new Error('data ' + res.status);
      SP.setData(parseData(await res.text()));
      LC.setEngine(SP);
      return { SP, LC };
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}
