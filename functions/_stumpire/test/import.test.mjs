import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sources } from '../build/import-search.mjs';

test('the Wikipedia source follows redirects, skips disambiguation pages, and floors the missing', async () => {
  const list = [
    { id: 'nba-mj', n: 'Michael Jordan', s: 'NBA', k: 'p' },     // "(basketball)" redirects to the real article
    { id: 'nfl-cj', n: 'Chris Johnson', s: 'NFL', k: 'p' },      // "(American football)" is a disambiguation page
    { id: 'mlb-nobody', n: 'Nobody Atall', s: 'MLB', k: 'p' },   // no article at all
    ...Array.from({ length: 98 }, (_, i) => ({ id: 'x' + i, n: 'Player ' + i, s: 'MLB', k: 'p' }))
  ];
  const VIEWS = { 'Michael Jordan': 1000000, 'Chris Johnson': 5000 };
  for (let i = 0; i < 98; i++) VIEWS['Player ' + i] = 100 + i * 10;
  const real = globalThis.fetch;
  globalThis.fetch = async url => {
    const u = new URL(String(url));
    const J = b => new Response(JSON.stringify(b), { status: 200 });
    if (u.hostname === 'en.wikipedia.org') {
      const titles = u.searchParams.get('titles').split('|');
      const pages = {}, redirects = [];
      titles.forEach((t, i) => {
        if (t === 'Michael Jordan (basketball)') { redirects.push({ from: t, to: 'Michael Jordan' }); pages[i] = { title: 'Michael Jordan' }; }
        else if (t === 'Chris Johnson (American football)') pages[i] = { title: t, pageprops: { disambiguation: '' } };
        else if (VIEWS[t]) pages[i] = { title: t };
        else pages[-1 - i] = { title: t, missing: '' };
      });
      return J({ query: { redirects, pages } });
    }
    const t = decodeURIComponent(u.pathname.split('/')[9]).replace(/_/g, ' ');
    return VIEWS[t] ? J({ items: Array.from({ length: 60 }, () => ({ views: VIEWS[t] })) }) : new Response('', { status: 404 });
  };
  try {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stump-wp-'));
    const out = await sources.wikipedia(list, { cacheDir: dir, concurrency: 4 });
    assert.equal(out['nba-mj'], 1000000, 'the redirect counts as the real article');
    assert.equal(out['nfl-cj'], 5000, 'a disambiguation page falls through to the plain title');
    assert.equal(out['mlb-nobody'], 110, 'no article: the 1st percentile of those found');
    assert.equal(Object.keys(out).length, list.length);
  } finally { globalThis.fetch = real; }
});
