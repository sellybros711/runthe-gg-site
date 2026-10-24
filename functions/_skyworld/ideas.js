/* The Advisor Agent's suggestions, for the Ideas page. It writes one note a week in the vault,
 * agents/advisor/suggestions/YYYY-MM-DD-week.md, in the format its spec fixes (agents/advisor/advisor-spec.md):
 *
 *   ## A short title
 *   - category: players | games | ads | revenue | product
 *   - impact: high | medium | low
 *   - effort: small | medium | large
 *   - for: <agent id, or owner>
 *   - verdict: new | yes | no | later | done
 *
 *   The body: why, what first, the evidence.
 *
 * The newest four weeks are read (five calls to GitHub) and kept for ten minutes. */
import { githubSource } from './github.js';

const DIR = 'agents/advisor/suggestions/', WEEKS = 4;
const FIELDS = ['category', 'impact', 'effort', 'for', 'verdict'];

export function parseWeek(md, path){
  const date = (/(\d{4}-\d{2}-\d{2})-week\.md$/.exec(path) || [])[1] || null;
  const title = ((/^title:\s*(.+)$/m.exec(md) || [])[1] || '').trim();
  const summary = ((/^summary:\s*(.+)$/m.exec(md) || [])[1] || '').trim();
  const body = md.replace(/^---[\s\S]*?\n---\n/, '');
  const items = [];
  for (const part of body.split(/^## /m).slice(1)) {
    const lines = part.split('\n'), it = { title: lines.shift().trim() }, rest = [];
    for (const l of lines) { const m = /^-\s*(category|impact|effort|for|verdict):\s*(.+?)\s*$/i.exec(l); if (m && !rest.length) it[m[1].toLowerCase()] = m[2].toLowerCase(); else rest.push(l); }
    for (const f of FIELDS) if (!it[f]) it[f] = f === 'verdict' ? 'new' : '';
    it.body = rest.join('\n').trim();
    if (it.title) items.push(it);
  }
  return { date, title, summary, items };
}

export async function readIdeas(src){
  const paths = (await src.vaultTree()).filter(p => p.startsWith(DIR) && /\d{4}-\d{2}-\d{2}-week\.md$/.test(p)).sort().reverse().slice(0, WEEKS);
  const weeks = [];
  for (const p of paths) { const md = await src.vaultFile(p); if (md) weeks.push(parseWeek(md, p)); }
  return weeks;
}

export async function ideas(env, opt = {}){
  const cache = opt.cache === undefined ? (globalThis.caches && caches.default) : opt.cache, key = 'https://skyworld.cache/ideas/v1';
  if (cache) { const hit = await cache.match(key); if (hit) return hit.json(); }
  const out = { asOf: new Date().toISOString(), weeks: await readIdeas(opt.source || githubSource(env, { cache: null })) };
  if (cache) await cache.put(key, new Response(JSON.stringify(out), { headers: { 'Cache-Control': 'max-age=600' } }));
  return out;
}
