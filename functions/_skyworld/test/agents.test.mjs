/* The agents (found, never listed), where each one is, its open PRs, and the task rules. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { registry, nameOf, locate, named, readAgents, lastRuns } from '../agents.js';
import { handle } from '../api.js';
import { clean, newId } from '../tasks.js';

const GAMES = [
  { id: 'site', name: 'RunThe.GG', status: 'hub', where: '/' },
  { id: 'golf', name: 'Run The Tour', status: 'live', where: '/golf/', found: ['golf/CLAUDE.md'] },
  { id: 'hoops', name: 'Run The Floor', status: 'dev', where: '/hoops/', found: ['hoops/CLAUDE.md'] },
  { id: 'stumpire', name: 'Stumpire', status: 'testers', where: '/arcade/stumpire/', found: ['functions/arcade/stumpire/[[path]].js'] },
  { id: 'shutthedoor', name: 'Shut The Door', status: 'dev', where: null, found: ['vault games/shut-the-door'] }
];

test('agents come from the site and the vault, one each, named by their spec', () => {
  const reg = registry(['.claude/agents/golf-course.md', '.claude/agents/store.md', 'golf/x.js'],
    ['agents/golf-course/golf-course-spec.md', 'agents/golf-course/golf-course-log.md', 'agents/rosters/rosters-audit.md', 'agents/README.md']);
  assert.deepEqual(reg.map(a => a.id), ['golf-course', 'rosters', 'store']);
  assert.equal(reg[0].spec, 'agents/golf-course/golf-course-spec.md'); assert.equal(reg[1].spec, null);
  assert.equal(nameOf('golf-course', '---\ntitle: Golf Course Agent spec\n---'), 'Golf Course Agent');
  assert.equal(nameOf('4th-and-what', null), '4th And What Agent');
});

test('where an agent is: the files its branch changes, else what its chat names', () => {
  assert.deepEqual(locate(['golf/putt/hole3d.js', 'golf/putt/render.js', 'golf/index.html'], GAMES), { game: 'golf', layer: 'art', how: 'branch' });
  assert.deepEqual(locate(['functions/_stumpire/game.js', 'functions/_stumpire/scoring.js'], GAMES), { game: 'stumpire', layer: 'engine', how: 'branch' });
  assert.equal(locate(['scripts/check-dashes.mjs'], GAMES).game, 'site');
  assert.equal(locate(['README.md'], GAMES), null);
  assert.deepEqual(named('Shut The Door game build', GAMES), { game: 'shutthedoor', layer: null, how: 'named' });
  assert.equal(named('Context', GAMES), null);
});

test('readAgents: the chat, the place, the PRs and their checks; and builders from chats that name a game', async () => {
  const src = {
    siteTree: async () => ['.claude/agents/golf-course.md', '.claude/agents/qa.md'],
    vaultTree: async () => ['agents/golf-course/golf-course-spec.md', 'agents/qa/qa-spec.md'],
    vaultFile: async p => p.includes('golf-course') ? '---\ntitle: Golf Course Agent spec\ngame: golf\nsummary: Holes.\n---' : '---\ntitle: QA Agent spec\ngame: all\n---',
    status: async () => ({ asOf: '2026-10-17T20:00:00Z', sessions: [
      { id: 'session_a', agent: 'golf-course', title: 'Golf Course Agent', bucket: 'working', summary: 'new holes', branch: 'claude/x', updated: '2026-10-17T19:00:00Z', since: '2026-10-17T18:00:00Z' },
      { id: 'session_old', agent: 'golf-course', title: 'Golf Course Agent (old)', bucket: 'completed', branch: 'main', updated: '2026-10-10T19:00:00Z' },
      { id: 'session_b', agent: null, title: 'Shut The Door game build', bucket: 'review_ready', branch: 'claude/shut-the-door', updated: new Date().toISOString() },
      { id: 'session_d', agent: null, title: 'Run The Floor career mode', bucket: 'completed', updated: new Date().toISOString() },
      { id: 'session_c', agent: null, title: 'Context', bucket: 'idle', updated: '2026-10-14T00:00:00Z' }] }),
    branchFiles: async b => b === 'claude/x' ? ['golf/putt/hole3d.js', 'golf/putt/sprites.png'] : [],
    pulls: async () => [{ number: 7, title: 'Holes', html_url: 'u7', head: { ref: 'claude/x', sha: 's7' }, body: '' },
      { number: 8, title: 'QA fix', html_url: 'u8', head: { ref: 'claude/y', sha: 's8' }, body: 'Fixes.\n\nAgent: qa\n' },
      { number: 9, title: 'Other', html_url: 'u9', head: { ref: 'claude/z', sha: 's9' }, body: '' }],
    checks: async sha => sha === 's7' ? [{ status: 'completed', conclusion: 'success' }] : [{ status: 'in_progress' }]
  };
  const r = await readAgents(src, GAMES);
  const gc = r.agents.find(a => a.id === 'golf-course'), qa = r.agents.find(a => a.id === 'qa');
  assert.equal(gc.name, 'Golf Course Agent'); assert.equal(gc.home, 'golf');
  assert.equal(gc.chat.id, 'session_a', 'the newest chat'); assert.equal(gc.chat.link, 'https://claude.ai/code/session_a');
  assert.deepEqual(gc.at, { game: 'golf', layer: 'art', how: 'branch' });
  assert.deepEqual(gc.prs, [{ n: 7, title: 'Holes', url: 'u7', checks: 'pass' }]);
  assert.equal(qa.chat, null); assert.equal(qa.home, 'site'); assert.deepEqual(qa.prs.map(p => [p.n, p.checks]), [[8, 'running']], 'found by its Agent line');
  assert.deepEqual(r.builders.map(b => [b.name, b.at.game]), [['Shut The Door game build', 'shutthedoor']]);
});

test('the last runs are the log\'s first lines', () => {
  assert.deepEqual(lastRuns('# Log\n\nNewest first.\n\n- one\n- two\n- three', 2), ['one', 'two']);
});

const deps = (role, more = {}) => ({ db: { role: async () => role, name: async () => 'sel' }, agents: async () => ({ agents: [] }), agent: async id => ({ id, runs: [] }),
  agentIds: async () => ['golf-course'], canTask: () => true, tasks: async () => ({ queued: [], log: [] }), queue: async t => ({ id: 'x', ...t }), ideas: async () => ({}), ...more });

test('a non-tester gets 404 on every agent and task route, the same as an unknown path', async () => {
  for (const role of [null, 'player'])
    for (const [m, p] of [['GET', 'agents'], ['GET', 'agent'], ['GET', 'tasks'], ['POST', 'task'], ['POST', 'agents'], ['DELETE', 'task']]) {
      const r = await handle({ method: m, path: p, cookieUid: 'u', query: { id: 'qa' }, body: { agent: 'golf-course', text: 'do it' } }, deps(role));
      assert.deepEqual(r, { status: 404, body: { error: 'not_found' } }, role + ' ' + m + ' ' + p); }
  assert.equal((await handle({ method: 'POST', path: 'task', cookieUid: null, body: { agent: 'golf-course', text: 'do it' } }, deps('tester'))).status, 404, 'no cookie');
});

test('a tester tasks a real agent; a bad agent or an empty task is refused; no vault token says so', async () => {
  const ok = await handle({ method: 'POST', path: 'task', cookieUid: 'u', body: { agent: 'golf-course', text: '  Add a windmill hole  ', game: 'golf', layer: 'art' } }, deps('tester'));
  assert.equal(ok.status, 200); assert.deepEqual(ok.body, { id: 'x', agent: 'golf-course', text: 'Add a windmill hole', place: { game: 'golf', layer: 'art' }, by: 'sel' });
  assert.equal((await handle({ method: 'POST', path: 'task', cookieUid: 'u', body: { agent: 'nobody', text: 'hello' } }, deps('tester'))).status, 400);
  assert.equal((await handle({ method: 'POST', path: 'task', cookieUid: 'u', body: { agent: 'golf-course', text: ' ' } }, deps('tester'))).status, 400);
  assert.deepEqual((await handle({ method: 'POST', path: 'task', cookieUid: 'u', body: { agent: 'golf-course', text: 'hello' } }, deps('admin', { canTask: () => false }))).body, { error: 'tasking_off' });
  assert.equal((await handle({ method: 'GET', path: 'agent', cookieUid: 'u', query: { id: '../x' } }, deps('tester'))).status, 404, 'an id is a plain name');
});

test('a task is trimmed and bounded, and its id sorts by time', () => {
  assert.equal(clean({ agent: 'a', text: 'x'.repeat(5000) }).text.length, 4000);
  assert.match(newId(Date.parse('2026-10-17T20:30:05Z')), /^20261017T203005-[a-z0-9]{5}$/);
});
