import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, suggest } from '../matcher.js';
import { key, tokens, similarity } from '../normalize.js';

const id = (text, ctx) => { const r = resolve({ text }, ctx); assert.equal(r.status, 'match', text + ' => ' + JSON.stringify(r)); return r.id; };

test('normalization folds case, accents, punctuation and suffixes', () => {
  assert.equal(key('LeBron James'), key('lebron   JAMES'));
  assert.equal(key('José Ramírez'), 'joseramirez');
  assert.equal(key("Shaquille O'Neal"), 'shaquilleoneal');
  assert.equal(key('C.J. Stroud'), key('CJ Stroud'));
  assert.equal(key('C J Stroud'), key('CJ Stroud'));
  assert.equal(key('Ken Griffey Jr.'), key('Ken Griffey'));
  assert.equal(key('JuJu Smith-Schuster'), key('JuJu Smith Schuster'));
  assert.deepEqual(tokens('Defence centre'), ['defense', 'center']);
});

test('an exact name and a tapped id resolve', () => {
  assert.equal(id('Peyton Manning'), 'nfl-peyton-manning-1990');
  assert.deepEqual(resolve({ entityId: 'nfl-peyton-manning-1990' }), { status: 'match', id: 'nfl-peyton-manning-1990', via: 'id' });
  assert.equal(resolve({ entityId: 'nope-not-real' }).status, 'nopitch');
});

test('aliases: nicknames, initials, former and maiden names, old team names', () => {
  assert.equal(id('Shaq'), 'nba-shaquille-oneal-1990');
  assert.equal(id('Lew Alcindor'), 'nba-kareem-abdul-jabbar-1960');
  assert.equal(id('Ron Artest'), id('Metta World Peace'));
  assert.equal(id('Ochocinco'), id('Chad Johnson'));
  assert.equal(id('Mike Stanton'), 'mlb-giancarlo-stanton-2000');
  assert.equal(id('A-Rod'), 'mlb-alex-rodriguez-1990');
  assert.equal(id('Seattle SuperSonics', { type: 'team' }), 'team-nba-thunder');
  assert.equal(id('Oakland Raiders', { type: 'team' }), 'team-nfl-raiders');
});

test('accents and suffixes in what is typed', () => {
  const r = id('Jose Ramirez', { league: 'MLB' });
  assert.equal(id('José Ramírez', { league: 'MLB' }), r);
  assert.equal(id('ken griffey jr'), 'mlb-ken-griffey-jr-1980');
  assert.equal(id('Ken Griffey Sr.'), 'mlb-ken-griffey-sr-1970');
});

test('ambiguity goes to the picker, never a guess', () => {
  const r = resolve({ text: 'Manning' }, { league: 'NFL' });
  assert.equal(r.status, 'picker');
  const names = r.options.map(o => o.name);
  assert.ok(names.includes('Peyton Manning') && names.includes('Eli Manning'));
  assert.deepEqual(names, [...names].sort(), 'picker options are alphabetical');
  assert.ok(r.options.every(o => o.tag), 'every option carries a disambiguation tag');
  assert.equal(resolve({ text: 'Ken Griffey' }).status, 'picker');
  assert.equal(resolve({ text: 'Chris Johnson' }, { league: 'NFL' }).status, 'picker');
  assert.equal(resolve({ text: 'Washington Senators' }, { type: 'team' }).status, 'picker');
});

test('league and type narrow candidates, which is public information', () => {
  assert.equal(id('Giants', { league: 'MLB', type: 'team' }), 'team-mlb-sfgiants');
  assert.equal(id('Giants', { league: 'NFL', type: 'team' }), 'team-nfl-giants');
});

test('order free and fuzzy matching', () => {
  assert.equal(id('James LeBron'), 'nba-lebron-james-2000');
  assert.equal(id('lebron jmaes'), 'nba-lebron-james-2000');
  assert.equal(id('Patrik Mahomes'), id('Patrick Mahomes'));
  assert.ok(similarity('mahomes', 'mahomse') > 0.8);
});

test('text that is nobody is a no pitch', () => {
  assert.equal(resolve({ text: 'zzqqxx vvbbnn' }).status, 'nopitch');
  assert.equal(resolve({ text: '' }).status, 'nopitch');
  assert.equal(resolve({ text: 'Smith' }).status, 'nopitch', 'a surname naming too many people asks for more');
});

test('typeahead searches the whole dataset, alphabetically', () => {
  const s = suggest('peyt');
  assert.ok(s.length > 1);
  assert.deepEqual(s.map(x => x.name), [...s.map(x => x.name)].sort());
  assert.ok(s.some(x => x.id === 'nfl-peyton-manning-1990'));
  assert.equal(suggest('p').length, 0);
  assert.ok(suggest('shaq').some(x => x.id === 'nba-shaquille-oneal-1990'), 'aliases are searchable');
});
