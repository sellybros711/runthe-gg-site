/* The Merge button: an admin merges an agent's PR from the Sky World, the same as merging it on GitHub.
 * SKY_MERGE_TOKEN is a token that can merge on the site repo and nothing more. Before it merges, every one of
 * these must hold, checked here on the server and never taken from the page:
 *   the caller is an admin (stumpire_testers.role = 'admin'); testers see the button's reason, never the button
 *   the PR is open, not a draft, and an agent's (its description ends "Agent: <id>", or its branch is an
 *     agent's chat's branch)
 *   every check on its head is complete and none failed, and GitHub says it merges cleanly
 *   its head is still the commit the page showed (so nothing pushed since is merged unseen)
 */
import { OWNER, SITE } from './github.js';

const API = 'https://api.github.com';
async function gh(env, method, path, body){
  const r = await fetch(API + path, { method, body: body ? JSON.stringify(body) : undefined, headers: { Authorization: 'Bearer ' + env.SKY_MERGE_TOKEN,
    'User-Agent': 'runthe-gg-skyworld', Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' } });
  const j = await r.json().catch(() => null); return { status: r.status, ok: r.ok, j }; }

export function refuse(why){ return { ok: false, why }; }
// pure, so the tests drive it: may this PR be merged now?
export function mayMerge(pr, runs, agentIds, chatBranches, sha){
  if (!pr || pr.state !== 'open') return refuse('not_open');
  if (pr.draft) return refuse('draft');
  if (sha && pr.head.sha !== sha) return refuse('changed');
  const line = /^Agent:\s*([a-z0-9-]+)\s*$/mi.exec(pr.body || ''), byLine = line && agentIds.includes(line[1]), byBranch = chatBranches.includes(pr.head.ref);
  if (!byLine && !byBranch) return refuse('not_an_agents_pr');
  if (!runs.length || runs.some(r => r.status !== 'completed')) return refuse('checks_running');
  if (runs.some(r => !['success', 'neutral', 'skipped'].includes(r.conclusion))) return refuse('checks_failing');
  if (pr.mergeable_state !== 'clean') return refuse('not_clean');
  return { ok: true };
}

export async function mergePR(env, n, sha, agentIds, chatBranches){
  const pr = await gh(env, 'GET', '/repos/' + OWNER + '/' + SITE + '/pulls/' + n);
  if (!pr.ok) return refuse('not_found');
  const runs = await gh(env, 'GET', '/repos/' + OWNER + '/' + SITE + '/commits/' + pr.j.head.sha + '/check-runs?per_page=100');
  const may = mayMerge(pr.j, (runs.j && runs.j.check_runs) || [], agentIds, chatBranches, sha);
  if (!may.ok) return may;
  const m = await gh(env, 'PUT', '/repos/' + OWNER + '/' + SITE + '/pulls/' + n + '/merge',
    { merge_method: 'merge', sha: pr.j.head.sha, commit_title: 'Merge pull request #' + n + ' from ' + pr.j.head.label });   // GitHub's own title: no tester's name in public history
  return m.ok ? { ok: true, sha: m.j.sha } : refuse('github_' + m.status);
}
