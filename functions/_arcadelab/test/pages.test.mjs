import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, PAGE_FILES } from '../build/pages.mjs';
import { GAMES } from '../registry.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.join(ROOT, '../..');

test('pages.js is up to date with its sources', () => {
  assert.equal(fs.readFileSync(path.join(ROOT, 'pages.js'), 'utf8'), render(), 'run node functions/_arcadelab/build/pages.mjs');
});

test('no lab game is listed anywhere public', () => {
  const pub = ['arcade/index.html', 'arcade/tokens.js', 'arcade/nav.js', 'sitemap.xml', 'robots.txt', 'index.html',
    'scripts/newsletter/games.json'].map(f => [f, fs.existsSync(path.join(REPO, f)) ? fs.readFileSync(path.join(REPO, f), 'utf8') : '']);
  for (const g of Object.values(GAMES)) for (const [f, src] of pub) {
    assert.ok(!src.includes(g.name), g.name + ' named in ' + f);
    assert.ok(!src.includes(g.path), g.path + ' linked from ' + f);
  }
  assert.ok(!fs.existsSync(path.join(REPO, 'arcade/lab')), 'no static copy under arcade/lab');
});

test('every page shell is noindexed and names its tester status', () => {
  for (const f of Object.values(PAGE_FILES)) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.match(s, /<meta name="robots" content="noindex, nofollow">/);
    assert.match(s, /TESTERS ONLY/);
  }
});

test('nothing in game logic reaches for Math.random', () => {
  for (const f of ['shared/seed.js', 'games/rollball/sim.js', 'games/rollball/config.js', 'api.js'])
    assert.ok(!/Math\.random\s*\(/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')), f);
});
