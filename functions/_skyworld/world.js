/* The world model, worked out from GitHub and kept for ten minutes, so a new game's island rises
 * within ten minutes of the commit that makes it. */
import { discover } from './discover.js';
import { githubSource } from './github.js';

export async function buildWorld(env, opt = {}){
  const cache = opt.cache === undefined ? (globalThis.caches && caches.default) : opt.cache, key = 'https://skyworld.cache/world/v1';
  if (cache) { const hit = await cache.match(key); if (hit) return hit.json(); }
  const games = await discover(opt.source || githubSource(env, { cache: null }));   // one cached answer, not one per call
  const w = { asOf: new Date().toISOString(), games };
  if (cache) await cache.put(key, new Response(JSON.stringify(w), { headers: { 'Cache-Control': 'max-age=600' } }));
  return w;
}

/* The Putt Putt renderer's own versions, read from the pages that load them, so a Golf release
 * never needs a change here. golf/index.html loads putt/<file>.js?v=N; Segue's stage imports pxhd. */
export async function artVersions(fetchAsset){
  const out = {};
  try { const g = await (await fetchAsset('/golf/index.html')).text(); for (const m of g.matchAll(/putt\/(putt|land|hole3d)\.js\?v=(\d+)/g)) out[m[1]] = m[2]; } catch (e) {}
  try { const s = await (await fetchAsset('/setlist/stage.js')).text(); const m = /pxhd\.js\?v=(\d+)/.exec(s); if (m) out.pxhd = m[1]; } catch (e) {}
  return out;
}
