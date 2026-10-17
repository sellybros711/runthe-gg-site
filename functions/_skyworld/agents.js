/* Every agent, what it is doing now, where, and its open work. For the characters and their panels.
 *
 * The agents are found, never listed: a definition in the site's .claude/agents/<id>.md, or a folder in the
 * vault's agents/<id>/. A spec's `game:` says its home island.
 *
 * What each is doing comes from status/agents.json on the vault's `status` branch, written by the dispatcher
 * (dispatch/plan.mjs) from the owner's chats on its schedule. Where it is: the files its chat's branch changes
 * from main (the game by folder, the district by layer), else a game its chat names, else its home island.
 * Its open PRs: the head branch is its chat's branch, or the description ends "Agent: <id>". */
import { layerOf } from './layers.js';
import { OWNER, SITE, VAULT } from './github.js';

const API = 'https://api.github.com';
export const STATUS_BRANCH = 'status';

export function front(md, k){ const m = new RegExp('^' + k + ':\\s*(.+)$', 'm').exec(md || ''); return m ? m[1].trim() : null; }
export function nameOf(id, spec){ const t = spec && front(spec, 'title'); if (t) return t.replace(/\s+spec$/i, '').trim();
  return id.split('-').map(w => /^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(' ') + ' Agent'; }

// the agents: definitions on the site, folders in the vault, one each
export function registry(sitePaths, vaultPaths){
  const ids = new Set();
  for (const p of sitePaths) { const m = /^\.claude\/agents\/([a-z0-9-]+)\.md$/.exec(p); if (m) ids.add(m[1]); }
  for (const p of vaultPaths) { const m = /^agents\/([a-z0-9-]+)\//.exec(p); if (m) ids.add(m[1]); }
  return [...ids].sort().map(id => ({ id, spec: vaultPaths.includes('agents/' + id + '/' + id + '-spec.md') ? 'agents/' + id + '/' + id + '-spec.md' : null,
    log: vaultPaths.includes('agents/' + id + '/' + id + '-log.md') ? 'agents/' + id + '/' + id + '-log.md' : null, def: sitePaths.includes('.claude/agents/' + id + '.md') }));
}

const key = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
// a game for a list of paths: the folders each game lives in, and the words its other files are named by
export function gamePrefixes(g){ const out = [];
  if (g.where && g.where !== '/') out.push(g.where.replace(/^\//, ''));
  for (const f of g.found || []) { const m = /^(functions\/.+\/)\[\[path\]\]\.js$/.exec(f); if (m) out.push(m[1]); }
  if (g.status === 'testers') out.push('functions/_' + g.id + '/');
  return out; }
export function locate(files, games){
  const n = {};
  for (const f of files) { const l = layerOf(f); if (!l) continue;
    const g = games.find(x => gamePrefixes(x).some(p => f.startsWith(p))) || games.find(x => x.id !== 'site' && key(f).includes(x.id) && x.id.length > 3);
    const at = (g ? g.id : 'site') + '|' + l; n[at] = (n[at] || 0) + 1; }
  const best = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
  return best ? { game: best[0].split('|')[0], layer: best[0].split('|')[1], how: 'branch' } : null; }
export function named(text, games){ const t = key(text); if (!t) return null;
  const g = games.filter(x => x.status !== 'hub').sort((a, b) => key(b.name).length - key(a.name).length).find(x => t.includes(key(x.name)) || (x.id.length > 4 && t.includes(x.id)));
  return g ? { game: g.id, layer: null, how: 'named' } : null; }

async function gh(env, path, raw, token){
  const r = await fetch(API + path, { headers: { Authorization: 'Bearer ' + (token || env.SKY_GITHUB_TOKEN), 'User-Agent': 'runthe-gg-skyworld',
    Accept: raw ? 'application/vnd.github.raw' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
  if (r.status === 404) return null; if (!r.ok) throw new Error('github ' + r.status);
  return raw ? r.text() : r.json(); }
export function githubAgents(env){ return {
  siteTree: async () => ((await gh(env, '/repos/' + OWNER + '/' + SITE + '/git/trees/main?recursive=1')) || { tree: [] }).tree.filter(e => e.type === 'blob').map(e => e.path),
  vaultTree: async () => ((await gh(env, '/repos/' + OWNER + '/' + VAULT + '/git/trees/main?recursive=1')) || { tree: [] }).tree.filter(e => e.type === 'blob').map(e => e.path),
  vaultFile: p => gh(env, '/repos/' + OWNER + '/' + VAULT + '/contents/' + p + '?ref=main', true),
  status: async () => { const t = await gh(env, '/repos/' + OWNER + '/' + VAULT + '/contents/status/agents.json?ref=' + STATUS_BRANCH, true); try { return t ? JSON.parse(t) : null; } catch (e) { return null; } },
  branchFiles: async b => (((await gh(env, '/repos/' + OWNER + '/' + SITE + '/compare/main...' + encodeURIComponent(b))) || {}).files || []).map(f => f.filename),
  pulls: async () => (await gh(env, '/repos/' + OWNER + '/' + SITE + '/pulls?state=open&per_page=50')) || [],
  checks: async sha => { const r = await gh(env, '/repos/' + OWNER + '/' + SITE + '/commits/' + sha + '/check-runs?per_page=50'); return (r && r.check_runs) || []; },
  pull: n => gh(env, '/repos/' + OWNER + '/' + SITE + '/pulls/' + n)
}; }

function verdict(runs){ if (!runs.length) return 'none'; if (runs.some(r => r.status !== 'completed')) return 'running';
  if (runs.some(r => ['failure', 'timed_out', 'cancelled', 'action_required'].includes(r.conclusion))) return 'fail'; return 'pass'; }

/* src: the GitHub reader (githubAgents in production, a fixture in the tests). games: the world's games.
   The calls: two trees, one spec each (for its name and home game), the status file, one compare per chat
   with a branch, the open PRs and one check list per agent PR. Kept small: about 25 with a dozen agents. */
export async function readAgents(src, games, opt = {}){
  const [sitePaths, vaultPaths] = await Promise.all([src.siteTree(), src.vaultTree()]);
  const reg = registry(sitePaths, vaultPaths), status = (await src.status()) || { asOf: null, sessions: [] };
  const sessions = status.sessions || [], pulls = await src.pulls(), out = [];
  const gameKey = s => { const k = key(s); const g = games.find(x => x.id === k || key(x.name) === k); return g ? g.id : null; };
  for (const a of reg) {
    const spec = a.spec ? await src.vaultFile(a.spec) : null, game = spec && front(spec, 'game');
    const own = games.find(x => x.id === key(a.id));   // an agent named for a place lives there (Marketing)
    const home = own ? own.id : game && !['all', 'platform'].includes(game) ? (gameKey(game) || 'site') : 'site';
    const chat = sessions.filter(s => s.agent === a.id).sort((x, y) => String(y.updated).localeCompare(String(x.updated)))[0] || null;
    let at = null;
    if (chat && chat.branch && chat.branch !== 'main') at = locate(await src.branchFiles(chat.branch), games);
    if (!at && chat) at = named(chat.title + ' ' + (chat.summary || ''), games);
    if (!at) at = { game: home, layer: null, how: 'home' };
    const mine = pulls.filter(p => (chat && chat.branch && p.head && p.head.ref === chat.branch) || new RegExp('^Agent:\\s*' + a.id + '\\s*$', 'mi').test(p.body || ''));
    const prs = [];
    for (const p of mine.slice(0, 4)) { const checks = verdict(await src.checks(p.head.sha));
      // ready to merge: checks green, not a draft, and GitHub says it merges cleanly (one more call, only for a green PR)
      const full = checks === 'pass' && !p.draft && src.pull ? await src.pull(p.number) : null;
      prs.push({ n: p.number, title: p.title, url: p.html_url, checks, sha: p.head.sha, ready: !!(full && full.mergeable_state === 'clean'), conflict: !!(full && full.mergeable_state === 'dirty') }); }
    out.push({ id: a.id, name: nameOf(a.id, spec), summary: (spec && front(spec, 'summary')) || '', home, at, prs,
      chat: chat ? { id: chat.id, title: chat.title, state: chat.bucket || 'idle', summary: chat.summary || '', ask: chat.ask || null, updated: chat.updated, since: chat.since || chat.updated,
        link: 'https://claude.ai/code/' + chat.id } : null });
  }
  // chats that are no agent's but name a game, and are at work now (in the last three days): builders on that game's island
  const live = s => ['working', 'blocked', 'review_ready'].includes(s.bucket) && Date.now() - Date.parse(s.updated) < 3 * 864e5;
  const builders = sessions.filter(s => !s.agent && live(s)).map(s => ({ s, at: named(s.title + ' ' + (s.summary || ''), games) })).filter(x => x.at).map(({ s, at }) => ({
    id: 'chat-' + s.id.slice(-8), name: s.title, builder: true, home: at.game, at, prs: [],
    chat: { id: s.id, title: s.title, state: s.bucket || 'idle', summary: s.summary || '', ask: s.ask || null, updated: s.updated, since: s.since || s.updated, link: 'https://claude.ai/code/' + s.id } }));
  return { asOf: status.asOf, agents: out, builders };
}

// the last few runs from an agent's log: its lines that start "- "
export function lastRuns(md, n = 5){ return String(md || '').split('\n').filter(l => /^- /.test(l)).slice(0, n).map(l => l.slice(2).trim()); }
