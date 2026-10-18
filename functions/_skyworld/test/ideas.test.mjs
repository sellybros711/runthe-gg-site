/* The Advisor's weekly notes, read the way its spec writes them. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWeek, readIdeas } from '../ideas.js';

const WEEK = `---
title: Suggestions, week of 2026-10-20
game: all
area: agent
status: current
updated: 2026-10-20
summary: Daily habit loops, and one new game.
supersedes: []
---

# Suggestions, week of 2026-10-20

## A daily streak across every game
- category: players
- impact: high
- effort: medium
- for: golf-ui
- verdict: new

One streak for the whole site.

- a list in the body stays in the body

## Pocket GM
- category: games
- impact: medium
- effort: large
- for: owner
- verdict: yes

Run a team from your phone in ten taps a day. [source](https://example.com)
`;

test('a week reads into its suggestions, fields and bodies apart', () => {
  const w = parseWeek(WEEK, 'agents/advisor/suggestions/2026-10-20-week.md');
  assert.equal(w.date, '2026-10-20'); assert.equal(w.summary, 'Daily habit loops, and one new game.');
  assert.equal(w.items.length, 2);
  assert.deepEqual({ ...w.items[0], body: undefined }, { title: 'A daily streak across every game', category: 'players', impact: 'high', effort: 'medium', for: 'golf-ui', verdict: 'new', body: undefined });
  assert.match(w.items[0].body, /One streak for the whole site\.\n\n- a list in the body stays in the body/);
  assert.equal(w.items[1].verdict, 'yes');
});

test('a suggestion missing a field still reads, and its verdict is new', () => {
  const w = parseWeek('## Just a title\nA body.', 'x/2026-10-27-week.md');
  assert.equal(w.items[0].verdict, 'new'); assert.equal(w.items[0].category, ''); assert.equal(w.items[0].body, 'A body.');
});

test('the newest four weeks are read, newest first, and nothing else in the folder', async () => {
  const files = { 'agents/advisor/suggestions/2026-09-29-week.md': WEEK, 'agents/advisor/suggestions/2026-10-06-week.md': WEEK, 'agents/advisor/suggestions/2026-10-13-week.md': WEEK,
    'agents/advisor/suggestions/2026-10-20-week.md': WEEK, 'agents/advisor/suggestions/2026-10-27-week.md': WEEK, 'agents/advisor/suggestions/notes.md': 'x', 'agents/advisor/advisor-log.md': 'x' };
  let calls = 0; const src = { vaultTree: async () => { calls++; return Object.keys(files); }, vaultFile: async p => { calls++; return files[p]; } };
  const weeks = await readIdeas(src);
  assert.deepEqual(weeks.map(w => w.date), ['2026-10-27', '2026-10-20', '2026-10-13', '2026-10-06']);
  assert.equal(calls, 5, 'one tree and four files');
});
