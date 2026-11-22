/*
 * test_analytics.mjs : College Fantasy and Commissioner Mode send their events, the site's way.
 *
 *   node cfb/build/test/test_analytics.mjs
 *
 * Both pages sent nothing until 2026-11-16 (the Advisor's review, approved by the owner). What is
 * held here, read off the files: the consent defaults come before the tag, the tag is the site's
 * one property, each page names its game, every event the Marketing ledger lists is sent, every
 * event carries the tier (platform-measuring), and no event carries anything about the player. No network, no browser.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
let fails = 0, passes = 0;
const ok = (label, cond, extra) => {
  if (cond) passes++; else fails++;
  console.log('  ' + (cond ? 'ok  ' : 'FAIL') + '  ' + label + (extra ? '   ' + extra : ''));
};

const PAGES = [
  { file: 'cfb/fantasy/index.html', game: 'College Fantasy', call: /ga\('([a-z_]+)'/g,
    tier: /o\.tier = tierNow\(\);/,
    events: ['fantasy_opened', 'fantasy_draw_used', 'fantasy_draft_done', 'fantasy_lineup_saved', 'fantasy_entered',
      'fantasy_swap', 'fantasy_live_opened'] },
  { file: 'cfb/commish/index.html', game: 'Commissioner Mode', call: /cfbCommishEvent\('([a-z_]+)'/g,
    tier: /o\.tier=typeof window\.cfbCommishTier==='function'/,
    events: ['commish_opened', 'commish_term_start', 'commish_season_played', 'commish_ruling', 'commish_term_renewed',
      'commish_term_done', 'commish_wall'] },
];

for (const p of PAGES) {
  console.log('\n' + p.file);
  const s = fs.readFileSync(path.join(ROOT, p.file), 'utf8');
  const consent = s.indexOf("gtag('consent','default'");
  const config = s.indexOf("gtag('config',id)");
  ok('the consent defaults come first, then the tag', consent > 0 && config > consent);
  ok('Europe waits for consent', /analytics_storage:'denied',region:\[/.test(s));
  ok("the site's one property", /window\.GA_ID='G-L29P5MRWKE'/.test(s));
  ok(`it names the game: ${p.game}`, s.includes(`gtag('set',{game_name:'${p.game}'})`));
  const sent = new Set([...s.matchAll(p.call)].map((m) => m[1]));
  for (const ev of p.events) ok(`sends ${ev}`, sent.has(ev));
  ok('every event carries the tier, so a guest is counted', p.tier.test(s));
  ok('and nothing it does not list', [...sent].every((e) => p.events.includes(e)), [...sent].join(','));
  /* The fields of every call, read as written. A name, an email or an account id is never one. */
  const calls = [...s.matchAll(new RegExp(p.call.source.replace('([a-z_]+)\'', '[a-z_]+\',\\s*\\{([^}]*)\\}'), 'g'))]
    .map((m) => m[1]);
  ok('no event carries the player', calls.every((c) => !/user|email|name|uid|account/i.test(c)),
    calls.filter((c) => /user|email|name|uid|account/i.test(c)).join(' | '));
}

console.log(fails ? `\n${fails} FAILED, ${passes} ok` : `\nall ${passes} ok`);
process.exit(fails ? 1 : 0);
