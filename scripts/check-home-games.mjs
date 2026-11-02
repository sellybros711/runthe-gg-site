#!/usr/bin/env node
/* check-home-games.mjs
 *
 * The home page lists its games in a dozen places, and each is written by hand:
 * the meta description, the og and twitter text, the WebSite description and the
 * ItemList in the JSON-LD, the FAQ (its HTML and its JSON-LD copy), the footer,
 * a feature card and a filter chip count per game, and the Play today list.
 * A launch touches all of them and a miss breaks nothing, so nobody sees it.
 * The meta description left out Run The Diamond for days after it launched.
 *
 * scripts/newsletter/games.json is the list of live games. This holds
 * index.html to it, in both directions:
 *
 *   1. every live game appears in every one of those places
 *   2. the filter chips count what the cards hold
 *   3. no game that has not launched is named or linked on the page
 *
 * A game goes on games.json the day it goes on the home page, so a game on one
 * and not the other fails here.
 *
 *   node scripts/check-home-games.mjs
 *
 * No network, no secrets.
 */
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const html = readFileSync(root + 'index.html', 'utf8');
const games = JSON.parse(readFileSync(root + 'scripts/newsletter/games.json', 'utf8')).games;

// What each live game is called on the page, and the word a short blurb uses for it.
// A new live game has to be added here, and the check fails until it is.
const KNOWN = {
  football: { name: 'The Perfect Season', kw: 'NFL', sport: 'football' },
  cfb: { name: 'College Football', kw: 'college', sport: 'football' },
  baseball: { name: 'Run The Diamond', kw: 'MLB', sport: 'baseball' },
  golf: { name: 'Run The Tour', kw: 'golf', sport: 'golf' },
  soccer: { name: 'Run The Pitch', kw: 'World Cup', sport: 'soccer' },
  arcade: { name: 'Run The Arcade', kw: 'puzzle', sport: 'puzzles' },
};

// Games that exist in the repo and are not launched. None may be named or linked here.
const UNLAUNCHED = /\b(Stumpire|Arcade Lab|Last Shot|4th and What|Run The Floor|MythiBall|Wrestling|Basketball|Shut The Door|Segue)\b/i;
const UNLAUNCHED_HREF = /href="\/(hoops|wrestling|mythiball|4th-and-what|shut-the-door|setlist|last-shot|fumble|pitch|watch)(\/|")/i;

const problems = [];
const fail = (m) => problems.push(m);

// ---- the pieces of the page -------------------------------------------------
const attr = (re, label) => {
  const m = re.exec(html);
  if (!m) { fail(`index.html has no ${label}`); return ''; }
  return m[1];
};
const metaDesc = attr(/<meta name="description" content="([^"]*)"/, 'meta description');
const ogDesc = attr(/<meta property="og:description" content="([^"]*)"/, 'og:description');
const twDesc = attr(/<meta name="twitter:description" content="([^"]*)"/, 'twitter:description');

const ldBlocks = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)<\/script>/g)].map((m) => m[1]);
let graph = [];
for (const b of ldBlocks) {
  try { const j = JSON.parse(b); graph = graph.concat(j['@graph'] || [j]); } catch { fail('a JSON-LD block on the home page does not parse'); }
}
const site = graph.find((n) => n['@type'] === 'WebSite') || {};
const list = graph.find((n) => n['@type'] === 'ItemList') || { itemListElement: [] };
const faq = graph.find((n) => n['@type'] === 'FAQPage') || { mainEntity: [] };
const ldSiteDesc = site.description || '';
const ldListUrls = list.itemListElement.map((i) => i.url);
const ldFaqNow = (faq.mainEntity.find((q) => /what games can i play/i.test(q.name)) || {}).acceptedAnswer?.text || '';
const ldFaqKind = (faq.mainEntity.find((q) => /what kind of games/i.test(q.name)) || {}).acceptedAnswer?.text || '';

const faqHtml = (re) => {
  const m = re.exec(html);
  return m ? m[1] : '';
};
const htmlFaqNow = faqHtml(/<summary>What games can I play right now\?<\/summary><p>([\s\S]*?)<\/p>/);
const htmlFaqKind = faqHtml(/<summary>What kind of games are on RunThe\.GG\?<\/summary><p>([\s\S]*?)<\/p>/);
const footerGames = (/<h4>Games<\/h4>\s*<ul>([\s\S]*?)<\/ul>/.exec(html) || [, ''])[1];
const todayList = (/<ul class="today-list">([\s\S]*?)<\/ul>/.exec(html) || [, ''])[1];
const howStep = (/<b>Pick a game\.<\/b>([\s\S]*?)<\/span>/.exec(html) || [, ''])[1];

if (!faq.mainEntity.length) fail('no FAQPage in the JSON-LD');
if (!htmlFaqNow) fail('the FAQ "What games can I play right now?" is missing from the HTML');
if (!ldFaqNow) fail('the FAQ "What games can I play right now?" is missing from the JSON-LD');

// ---- 1. every live game, everywhere -----------------------------------------
for (const g of games) {
  const k = KNOWN[g.dir];
  if (!k) { fail(`games.json lists "${g.dir}" and this check does not know it: add it to KNOWN in scripts/check-home-games.mjs`); continue; }
  const url = `https://runthe.gg/${g.dir}/`;
  const need = (where, text, what) => { if (!text.toLowerCase().includes(what.toLowerCase())) fail(`${k.name}: missing from ${where} (looked for "${what}")`); };

  need('the meta description', metaDesc, k.kw);
  need('og:description', ogDesc, k.name);
  need('twitter:description', twDesc, k.name);
  need('the WebSite description (JSON-LD)', ldSiteDesc, k.name);
  need('the FAQ "what games can I play" (HTML)', htmlFaqNow, k.name);
  need('the FAQ "what games can I play" (JSON-LD)', ldFaqNow, k.name);
  need('the FAQ "what kind of games" (HTML)', htmlFaqKind, k.name);
  need('the FAQ "what kind of games" (JSON-LD)', ldFaqKind, k.name);
  if (!ldListUrls.includes(url)) fail(`${k.name}: missing from the JSON-LD ItemList (${url})`);
  if (!footerGames.includes(`href="/${g.dir}/"`)) fail(`${k.name}: missing from the footer Games column`);
  if (!todayList.includes(`href="/${g.dir}/"`) && !html.includes(`<a class="feat-link" href="/${g.dir}/"`)) fail(`${k.name}: has neither a feature card nor a Play today row`);
  if (!html.includes(`<a class="feat-link" href="/${g.dir}/"`)) fail(`${k.name}: has no feature card in All games`);
  if (!new RegExp(`<article class="feat [^"]*"[^>]*data-sport="${k.sport}"[^>]*>\\s*<a class="feat-link" href="/${g.dir}/"`).test(html))
    fail(`${k.name}: its feature card is not tagged data-sport="${k.sport}"`);
}
// step one of How it works names the sports, not the games, so it is only checked for being there
if (!howStep) fail('"How it works" step one is missing');
if (ldListUrls.length !== games.length) fail(`the JSON-LD ItemList has ${ldListUrls.length} games and games.json has ${games.length}`);

// ---- 2. the filter chips count the cards ------------------------------------
const chips = [...html.matchAll(/data-f="([a-z]+)"[^>]*>[^<]*<span class="n">(\d+)<\/span>/g)].map((m) => [m[1], +m[2]]);
const cards = [...html.matchAll(/<article class="feat [^"]*"[^>]*data-sport="([a-z]+)"/g)].map((m) => m[1]);
for (const [f, n] of chips) {
  const have = f === 'all' ? cards.length : cards.filter((s) => s === f).length;
  if (have !== n) fail(`the "${f}" filter chip says ${n} and the page holds ${have} card${have === 1 ? '' : 's'}`);
}
const chipKeys = new Set(chips.map((c) => c[0]));
for (const s of new Set(cards)) if (!chipKeys.has(s)) fail(`cards are tagged "${s}" and there is no filter chip for it`);
if (cards.length !== games.length) fail(`the page has ${cards.length} feature cards and games.json has ${games.length} games`);

// ---- 3. nothing that has not launched ---------------------------------------
// Style and script bodies are code, not copy. The JSON-LD blocks are copy, so they stay.
const visible = html
  .replace(/<style[\s\S]*?<\/style>/g, '')
  .replace(/<script(?![^>]*application\/ld\+json)[\s\S]*?<\/script>/g, '');
const bad = UNLAUNCHED.exec(visible);
if (bad) fail(`the page names a game that has not launched: "${bad[0]}"`);
const badHref = UNLAUNCHED_HREF.exec(visible);
if (badHref) fail(`the page links to a game that has not launched: ${badHref[0]}`);

if (problems.length) {
  console.error(`home page and games.json disagree (${problems.length}):`);
  for (const p of problems) console.error('  ' + p);
  console.error('\nA game goes on games.json the day it goes on the home page. See platform/platform-home-page.md in the knowledge base.');
  process.exit(1);
}
console.log(`home page ok: ${games.length} live games, each in every list, chips match the cards, nothing unlaunched named`);
