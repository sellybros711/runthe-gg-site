import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, MODULE_FILES } from '../build/pages.mjs';
import { PAGES, MODULES } from '../pages.js';
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

test('every page is noindexed and names who it is for, and every game has one', () => {
  for (const g of Object.values(GAMES)) {
    const s = PAGES[g.id];
    assert.ok(s, 'a page for ' + g.id);
    assert.match(s, /<meta name="robots" content="noindex, nofollow">/);
    assert.match(s, /TESTERS ONLY/);
    assert.ok(!/\{\{[A-Z]+\}\}/.test(s), 'the shell is filled in for ' + g.id);
    assert.ok(s.includes('/arcade/lab/m/games/' + g.dir + '/client.js'), g.id + ' loads its client');
    assert.ok(MODULES['games/' + g.dir + '/client.js'], g.id + ' client is served');
  }
  assert.match(PAGES.admin, /noindex, nofollow/); assert.match(PAGES.admin, /ADMINS ONLY/);
});

test('every relative import in a served module resolves to a served module', () => {
  for (const [f, src] of Object.entries(MODULES)) for (const m of src.matchAll(/from '(\.[^']+)'/g)) {
    const to = path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1]));
    assert.ok(MODULES[to] != null, f + ' imports ' + to);
  }
});

test('nothing in game logic reaches for Math.random', () => {
  const logic = MODULE_FILES.filter(f => !/client\.js$|kit\.js$|app\.js$/.test(f)).concat(['api.js', 'admin.js', 'content/whack.js', 'content/drop.js']);
  for (const f of logic) assert.ok(!/Math\.random\s*\(/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')), f);
});
