/* Every game we have built, worked out from where the games really are. Never a hand kept list.
 *
 * A game is any of: a line in scripts/newsletter/games.json, a top level folder with its own
 * CLAUDE.md, a gated page Function (one that checks the tester cookie), or a folder in the vault's
 * games/. The same game found several ways is one game: they meet on a key, the name with
 * everything but letters and digits taken out (last-shot, _lastshot and lastshot are one).
 *
 * Its status, by the first rule that holds:
 *   live       in games.json (it goes there the day it goes on the home page)
 *   testers    served by a gated page Function
 *   unlisted   a public folder whose page is not noindexed
 *   dev        anything else, including a game that so far lives only on a branch
 *
 * Two islands are places, not games (status hub): RunThe.GG itself, and Marketing.
 *
 * discover(src) takes a source (github.js in production, a fixture in the tests):
 *   src.siteTree()           every file path on the site's main
 *   src.siteFile(path)       a file's text on main, or null
 *   src.vaultTree()          every file path on the vault's main
 *   src.vaultFile(path)      a file's text, or null
 *   src.branches(prefix)     site branch names starting with prefix
 *   src.branchFiles(branch)  the paths a branch changes from main
 */
import { countLayers } from './layers.js';
import { kindOf, OWN } from './kinds.js';

export const keyOf = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const SELF = 'skyworld';
// sub folder names that say nothing about which game they belong to
const PLAIN = /^(build|data|test|tests|docs|public|page|assets|fonts|design|home|images|img|icons|art|src|lib|shared|web|roster|rosters|content|games|prompts)$/;
const STOP = new Set(['run', 'the', 'game', 'games', 'and', 'what', 'perfect', 'season', 'daily', 'tour', 'testers', 'only', 'mode']);
const PALETTE = ['#2f6fd0', '#b8342a', '#3aa05a', '#1d3550', '#a86ad8', '#ff8a2a', '#ff5a7a', '#d8a83a', '#7a5cff', '#e5483a',
  '#2e8b57', '#ff7a1a', '#c03a8a', '#6a4a9a', '#3f7fd5', '#16a3a3', '#8a6a3a', '#d84a8a'];
function hash(s){ let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

function titleName(html){ const m = /<title>([^<]*)<\/title>/i.exec(html || ''); if (!m) return null; const t = m[1].split(/[:|]/)[0].trim(); return t || null; }
function headName(md){ const m = /^#\s+(.+)$/m.exec(md || ''); return m ? m[1].replace(/\(.*?\)/g, '').split(':')[0].trim() || null : null; }
function front(md, k){ const m = new RegExp('^' + k + ':\\s*(.+)$', 'm').exec(md || ''); return m ? m[1].trim() : null; }

export async function discover(src){
  const paths = await src.siteTree(), has = new Set(paths);
  const vpaths = await src.vaultTree();
  const games = new Map();
  const get = (id) => { const k = keyOf(id); if (!games.has(k)) games.set(k, { key:k, id, found:[], files:[] }); return games.get(k); };

  // 1. live, from the newsletter list
  let gj = null; try { gj = JSON.parse(await src.siteFile('scripts/newsletter/games.json') || 'null'); } catch (e) { gj = null; }
  for (const g of (gj && gj.games) || []) { const o = get(g.dir); o.dir = g.dir; o.live = true; o.liveName = g.name; o.found.push('games.json'); }

  // 2. a top level folder with its own CLAUDE.md
  const tops = new Set(paths.filter(p => /^[^/]+\/CLAUDE\.md$/.test(p)).map(p => p.split('/')[0]));
  for (const d of tops) { const o = get(d); o.dir = o.dir || d; o.found.push(d + '/CLAUDE.md'); }

  // 3. a gated page Function: functions/<route>/[[path]].js that reads the tester cookie
  for (const p of paths) {
    const m = /^functions\/((?!_|api\/)[^[]+?)\/\[\[path\]\]\.js$/.exec(p); if (!m) continue;
    const route = m[1]; if (keyOf(route) === SELF) continue;
    const text = await src.siteFile(p) || '';
    if (!/_stumpire\/cookie\.js/.test(text)) continue;
    const privs = [...text.matchAll(/\.\.\/_([a-z0-9]+)\//g)].map(x => x[1]);
    const priv = privs.find(n => n !== 'stumpire') || 'stumpire';
    const o = get(priv); o.route = '/' + route + '/'; o.priv = '_' + priv; o.gated = true; o.found.push(p);
  }

  // 4. a folder in the vault's games/
  const vdirs = new Set(vpaths.filter(p => /^games\/[^/]+\/[^/]+\.md$/.test(p)).map(p => p.split('/')[1]));
  for (const d of vdirs) { const o = get(d); o.vault = d; o.found.push('vault games/' + d); }

  for (const o of games.values()) {
    // what it is called, reading only what is needed (a request may make only so many calls)
    const needHtml = o.dir && has.has(o.dir + '/index.html') && (!o.live || !o.liveName);
    const html = needHtml ? await src.siteFile(o.dir + '/index.html') : null;
    let name = o.liveName || titleName(html);
    const needOv = o.vault && (!name || !OWN[o.key]);
    const ov = needOv ? await src.vaultFile('games/' + o.vault + '/' + o.vault + '-overview.md') : null;
    name = name || (ov && (front(ov, 'title') || '').split(':')[0].trim());
    if (!name && o.priv && has.has('functions/' + o.priv + '/README.md')) name = headName(await src.siteFile('functions/' + o.priv + '/README.md'));
    o.name = name || o.id; o.html = html;
    o.summary = (ov && front(ov, 'summary')) || '';
    // the words its other files are named by: its id, its name, its own sub folders
    const words = new Set([o.key, keyOf(o.id), ...(o.dir ? [keyOf(o.dir)] : []), ...(o.priv ? [keyOf(o.priv)] : []),
      ...o.name.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3 && !STOP.has(w))]);
    if (o.dir) { const sub = new RegExp('^' + o.dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/([^/.]+)/');   // one pattern per game, not one per path
      for (const p of paths) { const m = sub.exec(p); if (m && m[1].length > 3 && !PLAIN.test(m[1])) words.add(keyOf(m[1])); } }
    o.words = [...words].filter(Boolean);
    // its files on main
    const mine = p => (o.dir && p.startsWith(o.dir + '/')) || (o.priv && p.startsWith('functions/' + o.priv + '/')) || (o.route && p.startsWith('functions' + o.route));
    const named = p => /^(supabase|\.github\/workflows|scripts|functions\/api)\//.test(p) && o.words.some(w => w.length >= 3 && keyOf(p.split('/').slice(1).join('/')).includes(w));
    o.files = paths.filter(p => mine(p) || named(p));
    // a game with nothing on main: what its branch would add
    if (!o.dir && !o.route) {
      const br = (await src.branches('claude/' + (o.vault || o.id))) || [];
      if (br.length) { o.branch = br[0]; const bf = (await src.branchFiles(br[0])) || []; o.files = bf;
        if (bf.some(p => /^functions\/(?!_|api\/)[^[]+\/\[\[path\]\]\.js$/.test(p))) o.gatedOnBranch = true; }
    }
    o.layers = countLayers(o.files);
    o.status = o.live ? 'live' : o.gated ? 'testers' : (o.dir && o.html && !/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html)) ? 'unlisted' : 'dev';
    o.note = o.branch ? (o.gatedOnBranch ? 'testers, not merged yet' : 'on a branch, not merged yet') : '';
    if (o.gatedOnBranch) o.status = 'testers';
    o.kind = kindOf(o.key, o.name + ' ' + o.summary);
    o.col = PALETTE[hash(o.key) % PALETTE.length];
  }
  const out = [...games.values()].map(o => ({ id:o.key, name:o.name, status:o.status, note:o.note, kind:o.kind, col:o.col, layers:o.layers,
    where:o.route || (o.dir ? '/' + o.dir + '/' : null), branch:o.branch || null, found:o.found }))
    .sort((a, b) => a.name.localeCompare(b.name));

  /* Two places that are not games, read from the site the same way. The home island is the landing page and
     everything the games share: the files at the root, assets/, and every shared script, workflow, API and
     migration no game claims. Marketing is marketing/ and the scripts and workflows named for it. */
  const claimed = new Set([].concat(...[...games.values()].map(o => o.files)));
  const mkt = paths.filter(p => /^marketing\//.test(p) || (/^(scripts|\.github\/workflows)\//.test(p) && /marketing/i.test(p)));
  mkt.forEach(p => claimed.add(p));
  const site = paths.filter(p => !claimed.has(p) && (!p.includes('/') || /^assets\//.test(p) || /^(scripts|\.github\/workflows|functions\/api|supabase)\//.test(p)));
  const place = (id, name, kind, files) => ({ id, name, status:'hub', note:'', kind, col:PALETTE[hash(id) % PALETTE.length], layers:countLayers(files), where:id === 'site' ? '/' : '/' + id + '/', branch:null, found:['the site'] });
  if (has.has('index.html')) out.unshift(place('site', 'RunThe.GG', 'hq', site));
  if (mkt.length) out.splice(1, 0, place('marketing', 'Marketing', 'broadcast', mkt));
  return out;
}
