/* Discovery from a small made up site and vault: every way a game is found, every status rule, one game
 * found several ways is one island, and what is not a game is left out. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { discover, keyOf } from '../discover.js';
import { layerOf } from '../layers.js';
import { kindOf } from '../kinds.js';
import { render } from '../build/pages.mjs';
import fs from 'node:fs';

const SITE = {
  'scripts/newsletter/games.json': JSON.stringify({ games: [{ dir: 'football', name: 'The Perfect Season' }, { dir: 'soccer', name: 'Run The Pitch' }] }),
  'football/CLAUDE.md': '# football', 'football/index.html': '<title>Ignored: because games.json names it</title>', 'football/engine.js': '', 'football/check-boss.mjs': '',
  'football/data/players.json': '', 'football/auth.js': '', 'football/brand/logo.png': '',
  'soccer/index.html': '<title>RunThePitch: x</title>', 'soccer/app.js': '',
  'hoops/CLAUDE.md': '#', 'hoops/index.html': '<title>Run The Floor: NBA</title><meta name="robots" content="noindex,nofollow">', 'hoops/career.js': '',
  'setlist/CLAUDE.md': '#', 'setlist/index.html': '<title>Segue | RunThe.GG</title>', 'setlist/scoring.js': '',
  'fumble/index.html': '<title>Fumble | prototype</title>',
  'Tour/index.html': '<meta http-equiv="refresh" content="0; url=/golf/">',
  'functions/_stumpire/README.md': '# Stumpire (testers only)', 'functions/_stumpire/game.js': '', 'functions/_stumpire/cookie.js': '',
  'functions/arcade/stumpire/[[path]].js': "import { verify } from '../../_stumpire/cookie.js'; import { x } from '../../_stumpire/db-supabase.js';",
  'functions/_arcadelab/README.md': '# Arcade Lab (testers only)', 'functions/_arcadelab/api.js': '',
  'functions/arcade/lab/[[path]].js': "import { a } from '../../_arcadelab/gate.js'; import { verify } from '../../_stumpire/cookie.js';",
  'functions/skyworld/[[path]].js': "import { verify } from '../_stumpire/cookie.js'; import { b } from '../_skyworld/db.js';",
  'functions/api/newsletter/subscribe.js': "no cookie here",
  'supabase/133_stumpire.sql': '', '.github/workflows/hoops-checks.yml': '', 'scripts/stripe/check-floor-money.mjs': ''
};
const VAULT = {
  'games/football/football-overview.md': '---\ntitle: Football\nsummary: The NFL game\n---',
  'games/hoops/hoops-overview.md': '---\ntitle: Run The Floor: what it is\nsummary: hoops\n---',
  'games/shut-the-door/shut-the-door-overview.md': '---\ntitle: Shut The Door\nsummary: The daily baseball game, you are the closer\n---',
  'games/new-thing/new-thing-overview.md': '---\ntitle: Brand New Thing\nsummary: Something with no sport\n---'
};
const src = { siteTree: async () => Object.keys(SITE), siteFile: async p => SITE[p] ?? null, vaultTree: async () => Object.keys(VAULT), vaultFile: async p => VAULT[p] ?? null,
  branches: async pre => ['claude/shut-the-door', 'claude/shut-the-door-ui', 'claude/other'].filter(b => b.startsWith(pre)),
  branchFiles: async b => b === 'claude/shut-the-door' ? ['shut-the-door/index.html', 'shut-the-door/engine.js', 'shut-the-door/check-pitches.mjs'] : [] };

test('every game is found, once, with the status its sources give it', async () => {
  const G = Object.fromEntries((await discover(src)).map(g => [g.id, g]));
  assert.deepEqual(Object.keys(G).sort(), ['arcadelab', 'football', 'hoops', 'newthing', 'setlist', 'shutthedoor', 'soccer', 'stumpire']);
  assert.equal(G.football.status, 'live'); assert.equal(G.football.name, 'The Perfect Season');
  assert.equal(G.soccer.status, 'live');
  assert.equal(G.stumpire.status, 'testers'); assert.equal(G.stumpire.name, 'Stumpire'); assert.equal(G.stumpire.where, '/arcade/stumpire/');
  assert.equal(G.arcadelab.status, 'testers'); assert.equal(G.arcadelab.name, 'Arcade Lab');
  assert.equal(G.setlist.status, 'unlisted'); assert.equal(G.setlist.name, 'Segue');
  assert.equal(G.hoops.status, 'dev'); assert.equal(G.hoops.name, 'Run The Floor');
  assert.equal(G.shutthedoor.status, 'dev'); assert.equal(G.shutthedoor.branch, 'claude/shut-the-door'); assert.match(G.shutthedoor.note, /branch/);
  assert.equal(G.newthing.name, 'Brand New Thing'); assert.equal(G.newthing.status, 'dev');
});

test('districts come from the files, including the ones named for the game elsewhere', async () => {
  const G = Object.fromEntries((await discover(src)).map(g => [g.id, g]));
  assert.deepEqual(G.football.layers, { engine: 1, checks: 1, data: 1, accounts: 1, art: 1, ui: 1 });
  assert.equal(G.hoops.layers.checks, 1, 'hoops-checks.yml'); assert.equal(G.hoops.layers.payments, 1, 'check-floor-money, named for the floor');
  assert.equal(G.stumpire.layers.accounts >= 1, true, 'its migration');
  assert.deepEqual(G.shutthedoor.layers, { ui: 1, engine: 1, checks: 1 });
});

test('each island gets its own landmark, else its sport, else the big top', async () => {
  const G = Object.fromEntries((await discover(src)).map(g => [g.id, g]));
  assert.equal(G.football.kind, 'football'); assert.equal(G.shutthedoor.kind, 'bullpen'); assert.equal(G.newthing.kind, 'bigtop');
  assert.equal(kindOf('newbasketballgame', 'A basketball game'), 'court'); assert.equal(kindOf('x', 'the college game'), 'college');
});

test('layers and keys', () => {
  assert.equal(keyOf('_last-shot'), 'lastshot');
  for (const [p, l] of [['hoops/check-badges.mjs', 'checks'], ['functions/api/stripe/webhook.js', 'payments'], ['hoops/auth.js', 'accounts'], ['supabase/10_accounts.sql', 'accounts'],
    ['cfb/data/teams.json', 'data'], ['golf/putt/hole3d.js', 'art'], ['mythiball/sprites/a.png', 'art'], ['hoops/career-ui.js', 'ui'], ['setlist/index.html', 'ui'], ['hoops/career.js', 'engine'], ['hoops/CLAUDE.md', null]])
    assert.equal(layerOf(p), l, p);
});

test('pages.js matches web/', () => {
  assert.equal(fs.readFileSync(new URL('../pages.js', import.meta.url), 'utf8'), render(), 'run node functions/_skyworld/build/pages.mjs');
});
