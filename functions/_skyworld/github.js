/* The discovery source over GitHub's API, read with the read only token SKY_GITHUB_TOKEN. The token stays in
 * the Function. Nothing here is cached: world.js caches the finished world instead, because a cache lookup is a
 * call too, and a request may make only so many. */

export const OWNER = 'sellybros711', SITE = 'runthe-gg-site', VAULT = 'runthe-gg-kb';
const API = 'https://api.github.com';

export function githubSource(env){
  async function call(path, raw){
    const r = await fetch(API + path, { headers: { Authorization: 'Bearer ' + env.SKY_GITHUB_TOKEN, 'User-Agent': 'runthe-gg-skyworld',
      Accept: raw ? 'application/vnd.github.raw' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('github ' + r.status + ' ' + path);
    return raw ? r.text() : r.json();
  }
  const tree = async repo => { const t = await call('/repos/' + OWNER + '/' + repo + '/git/trees/main?recursive=1'); return t ? t.tree.filter(e => e.type === 'blob').map(e => e.path) : []; };
  const file = (repo, p) => call('/repos/' + OWNER + '/' + repo + '/contents/' + p.split('/').map(encodeURIComponent).join('/') + '?ref=main', true);
  return {
    siteTree: () => tree(SITE),
    siteFile: p => file(SITE, p),
    vaultTree: () => tree(VAULT),
    vaultFile: p => file(VAULT, p),
    async branches(prefix){ const r = await call('/repos/' + OWNER + '/' + SITE + '/git/matching-refs/heads/' + prefix); return (r || []).map(x => x.ref.replace('refs/heads/', '')).sort(); },
    async branchFiles(b){ const r = await call('/repos/' + OWNER + '/' + SITE + '/compare/main...' + encodeURIComponent(b)); return ((r && r.files) || []).map(f => f.filename); }
  };
}
