#!/usr/bin/env node
/* Every indexable page must be able to carry an ad and must reach the policy pages.
 *
 * Two AdSense rejections were traced to pages that quietly failed one of these. The
 * whole Arcade, eleven pages, shipped with the Consent Mode defaults and the GA tag
 * but no adsbygoogle.js, so a third of the indexable site could not serve an ad; the
 * ten game pages also had no route to Privacy or Terms. Nothing failed loudly. The
 * pages looked finished, and the gap only turned up under a deliberate audit.
 *
 * So it is a check rather than a habit. A new game page that forgets the ad tag, or a
 * refactor that drops a footer link, fails here instead of surviving to the next review.
 *
 * WORD COUNT is measured with <script> and <style> stripped, which is the crawler's
 * view, NOT the reader's. A single-page game keeps every screen it can ever show in
 * the DOM, most of them display:none, and all of that text counts here. Treat the
 * number as "is there markup at all", never as "does this page read as substantial".
 * The only honest answer to the second question is a rendered browser.
 *
 *   node scripts/check-adsense.mjs
 *
 * Exits non-zero and names every offender.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'scripts', 'supabase', 'functions']);

const PUB = 'pagead2.googlesyndication.com';
const MIN_WORDS = 250;

/* Pages that are indexable but legitimately short. A contact page is a contact page;
 * padding it to clear an arbitrary floor would be the exact "written for the crawler"
 * move the floor exists to catch. Add to this list only with a reason. */
const SHORT_OK = new Set([
  'contact.html',            // a form and an address
  'soccer/contact.html',     // same, on the RunThePitch side
  'soccer/about.html',       // short by design, the long one is /about.html
]);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

const problems = [];
let checked = 0;

for (const file of walk(ROOT).sort()) {
  const rel = path.relative(ROOT, file);
  const src = fs.readFileSync(file, 'utf8');

  // noindexed pages are exempt: redirect stubs, OG templates, unlisted prototypes
  if (/name=["']robots["'][^>]*noindex/i.test(src)) continue;
  checked++;

  const fail = (msg) => problems.push(`${rel}: ${msg}`);

  if (!src.includes(PUB)) fail('no AdSense publisher tag');

  /* Consent Mode defaults, and they must run BEFORE the ad tag. privacy.html
   * promises no advertising cookie is set before the CMP answers, and a page
   * that loads adsbygoogle.js with no defaults in front of it breaks that
   * promise silently. Two pages shipped without this while the check only
   * looked for the ad tag, which is why the ordering is asserted too. */
  const consent = src.indexOf("consent','default'");
  if (consent === -1) fail('no Consent Mode defaults');
  else {
    if (!/analytics_storage:'granted'/.test(src)) {
      fail("analytics_storage is not 'granted' (the page goes dark in GA4 outside the EEA)");
    }
    const adTag = src.indexOf(PUB);
    if (adTag !== -1 && adTag < consent) fail('AdSense tag loads before the Consent Mode defaults');

    /* Europe gets its own default, with analytics denied too: GA4 sets cookies, and in the
     * EEA, the UK and Switzerland a cookie waits for consent. The worldwide default above
     * keeps analytics granted everywhere else. Added 2026-10-24 (agents/ads/ in the vault). */
    const europe = src.match(/gtag\('consent','default',\{[^}]*analytics_storage:'denied',region:\[([^\]]*)\]/);
    if (!europe) fail('no Europe Consent Mode default (analytics_storage denied, with a region list)');
    else {
      for (const cc of ['DE', 'FR', 'IE', 'NO', 'GB', 'CH']) {
        if (!europe[1].includes(`'${cc}'`)) fail(`the Europe consent default leaves out ${cc}`);
      }
      if (adTag !== -1 && adTag < europe.index) fail('AdSense tag loads before the Europe consent default');
    }
  }
  if (!/rel=["']canonical["']/i.test(src)) fail('no canonical');
  if (!/<title>\s*\S/i.test(src)) fail('no title');
  if (!/name=["']description["'][^>]*content=["']\s*\S/i.test(src)) fail('no meta description');

  /* The root pages link relatively (href="privacy.html"), the game pages absolutely
   * (href="/privacy.html"). Both resolve, so match the href itself rather than a
   * leading slash. A page that is itself the target does not need to link to itself.
   *
   * <noscript> is stripped first, and that is the whole point of this block. The golf
   * page passed for weeks on a policy link that existed ONLY inside <noscript>: every
   * visitor and every crawler that runs JavaScript, which includes Googlebot, saw a
   * page with no route to the policy pages at all. A link a reader cannot reach is
   * not a link. This still cannot see a footer built at runtime by JavaScript, so it
   * is a floor and not a proof; the rendered check is a browser. */
  const visible = src.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  for (const page of ['privacy', 'terms']) {
    if (rel.endsWith(`${page}.html`)) continue;
    const linked = new RegExp(`href=["'][^"']*\\b${page}\\.html`, 'i').test(visible);
    if (!linked) fail(`no link to ${page}.html outside <noscript>`);
  }

  if (!SHORT_OK.has(rel)) {
    const words = src
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z#0-9]+;/gi, ' ')
      .split(/\s+/)
      .filter((w) => /[a-z]/i.test(w)).length;
    if (words < MIN_WORDS) fail(`only ${words} words of markup text (floor ${MIN_WORDS})`);
  }
}

// Anything listed in the sitemap must actually exist and must not be noindexed.
const sitemap = path.join(ROOT, 'sitemap.xml');
if (fs.existsSync(sitemap)) {
  const urls = [...fs.readFileSync(sitemap, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const url of urls) {
    let rel = url.replace(/^https?:\/\/runthe\.gg\//, '');
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    const target = path.join(ROOT, rel);
    if (!fs.existsSync(target)) {
      problems.push(`sitemap.xml: ${url} does not resolve to a file`);
    } else if (/name=["']robots["'][^>]*noindex/i.test(fs.readFileSync(target, 'utf8'))) {
      problems.push(`sitemap.xml: ${url} is listed but the page is noindexed`);
    }
  }
}

if (!fs.existsSync(path.join(ROOT, 'ads.txt'))) problems.push('ads.txt is missing');

/* NO AD EVER TOUCHES PLAY (the owner's rule, 2026-10-26: "the ads never impact someone's
 * gameplay while they're playing"). A real ad unit, one whose slot id is not all zeros, may
 * sit only on pages a player reads, never on a page a player plays. Game pages keep their
 * slots as placeholders, which their initialisers refuse to start. Moving a game slot to a
 * real id means adding that page here, and that is the owner's decision, made only after
 * the slot is measured at least 150px from every game control at every width it shows.
 * Auto ads must stay off in the AdSense dashboard; this check cannot see that, so it also
 * fails on the page-level switch that would turn it on from code. */
/* Game pages whose start screen may carry one menu ad (the owner's call, 2026-10-26). */
/* Pages the owner asked to carry one unit at the bottom of every screen (2026-10-27): the unit sits
 * under all the screens in a data-ad-zone="page" block and is started once per load. The Fantasy
 * Challenge is a weekly lineup, not a live game, so nothing on it is played in real time. */
const PAGE_ZONE_PAGES = new Set(['football/fantasy/index.html']);
const MENU_ZONE_PAGES = new Set(['football/index.html', 'cfb/index.html', 'baseball/index.html', 'soccer/index.html']);
/* Pages whose draft screen carries one pinned banner (the owner, 2026-10-28, live immediately):
 * built by draftAd() when the draft opens and emptied when it is left. Only a unit made inside
 * draftAd(), on a page whose show() calls draftAd(), is allowed on a play screen. */
const DRAFT_ZONE_PAGES = new Set(['football/index.html', 'cfb/index.html', 'baseball/index.html']);
/* The functions allowed to build a live unit on each page where people play, each one called from
 * that page's screen switch so it builds on entering its screen and removes on leaving. Run The
 * Pitch's tournament ad and desktop rails are the owner's calls (2026-10-28). */
const BUILDERS = {
  'football/index.html': ['draftAd', 'seasonAd'],
  'cfb/index.html': ['draftAd', 'seasonAd'],
  'baseball/index.html': ['draftAd', 'seasonAd'],
  'soccer/index.html': ['stageAd', 'railAds'],
};
/* The text of the named function's body, from its header to its closing brace at column 0. */
function fnBody(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) return null;
  const end = src.indexOf('\n}', start);
  return end < 0 ? null : [start, end + 2];
}
const READ_ONLY_PAGES = [/^index\.html$/, /^arcade\/index\.html$/, /^guides\/[^/]+\.html$/, /^[a-z]+\/how-to-play\.html$/];
function walkCode(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkCode(p, out);
    else if (/\.(html|js)$/.test(e.name)) out.push(p);
  }
  return out;
}
for (const file of walkCode(ROOT)) {
  const rel = path.relative(ROOT, file);
  const src = fs.readFileSync(file, 'utf8');
  if (/enable_page_level_ads/.test(src)) problems.push(`${rel}: turns on page-level (Auto) ads from code`);
  if (READ_ONLY_PAGES.some((re) => re.test(rel))) continue;
  /* The one exception on a game page: a unit inside the start screen's menu zone
   * (data-ad-zone="menu"), which the page starts only on its start screen and REMOVES the
   * moment any other screen opens. Such a page must carry that removal (menuAd) and its
   * initialiser must skip the zone, or the unit could load behind a game. */
  const real = [...src.matchAll(/data-ad-slot=["'](\d+)["']|AD_SLOT\s*=\s*['"](\d+)['"]/g)]
    .filter((m) => !/^0+$/.test(m[1] || m[2]))
    .filter((m) => !(PAGE_ZONE_PAGES.has(rel) && /data-ad-zone="page"[^>]*>\s*<span[^>]*>[^<]*<\/span>\s*<ins[^>]*$/.test(src.slice(Math.max(0, m.index - 400), m.index))))
    .filter((m) => !(MENU_ZONE_PAGES.has(rel) && /data-ad-zone="menu"[^>]*>\s*<span[^>]*>[^<]*<\/span>\s*<ins[^>]*$/.test(src.slice(Math.max(0, m.index - 400), m.index))))
    /* A unit made in code for a results screen or a leaderboard: only inside adUnitInto(), on a
     * page whose show() calls screenAds(), which builds it when that screen opens and empties it
     * when it closes (the owner's rule, 2026-10-27). */
    .filter((m) => {
      const builders = BUILDERS[rel];
      if (!builders) return true;
      return !builders.some((fn) => {
        const b = fnBody(src, fn);
        return b && new RegExp(`^\\s+${fn}\\(\\w+\\);`, 'm').test(src) && m.index >= b[0] && m.index < b[1];
      });
    })
    .filter((m) => !(MENU_ZONE_PAGES.has(rel) && /function adUnitInto\(host\)\{\s*host\.innerHTML='[^']*$/.test(src.slice(Math.max(0, m.index - 400), m.index)) && /^\s+screenAds\(\w+\);/m.test(src)))
    .map((m) => m[1] || m[2]);
  if (real.length) problems.push(`${rel}: a real ad slot (${real.join(', ')}) on a page where people play. Game slots stay placeholders`);
  /* A PINNED BANNER IS A STICKY AD (AdSense Ad formats FAQ, read 2026-10-29): 300px wide or less, never
   * the 728x90. So a draft or season banner is sized 300px or narrower at every width. */
  if (DRAFT_ZONE_PAGES.has(rel)) {
    for (const m of src.matchAll(/\.(?:draft|season)-ad(?:\[data-ad-zone\])? ins\.adsbygoogle\{[^}]*width:(\d+)px/g)) {
      if (+m[1] > 300) problems.push(`${rel}: a pinned banner is ${m[1]}px wide. AdSense allows a sticky ad 300px wide or less`);
    }
  }
  if (rel === 'soccer/index.html') {
    if (/data-ad-zone="stage"/.test(src) && !/^\s+stageAd\(\w+\);/m.test(src)) problems.push(`${rel}: has a tournament ad but showScreen() does not call stageAd() to remove it on leaving`);
    for (const m of src.matchAll(/\.rail-ad ins\.adsbygoogle\{[^}]*width:(\d+)px/g)) if (+m[1] > 300) problems.push(`${rel}: a rail is ${m[1]}px wide`);
  }
  if (DRAFT_ZONE_PAGES.has(rel) && /data-ad-zone="draft"/.test(src) && !/^\s+draftAd\(\w+\);/m.test(src)) problems.push(`${rel}: has a draft banner but show() does not call draftAd() to remove it on leaving the draft`);
  if (MENU_ZONE_PAGES.has(rel)) {
    if (/function adUnitInto\(/.test(src)) {
      const body = (src.match(/function screenAds\([\s\S]*?\n\}/) || [''])[0];
      const CALL = /adUnitInto\((?!host\))[^)\s]+\)/g;   // a call with an argument, not the definition or a comment's ()
      const calls = (src.match(CALL) || []).length;
      const inside = (body.match(CALL) || []).length;
      if (!body) problems.push(`${rel}: adUnitInto() makes a live unit but there is no screenAds() to own it`);
      else if (calls !== inside) problems.push(`${rel}: adUnitInto() is called outside screenAds(), so a unit could load on a play screen`);
    }
    if (!/function menuAd\(/.test(src) || !/^\s+menuAd\(\w+\);/m.test(src)) problems.push(`${rel}: has a menu ad zone but show() does not call menuAd() to remove it when play starts`);
    if (/querySelectorAll\('ins\.adsbygoogle'\)/.test(src) && !/closest\('\[data-ad-zone\]'\)\) continue/.test(src)) problems.push(`${rel}: the initialiser must skip the menu ad zone (menuAd starts it on the start screen only)`);
  }
}

/* ONE NAMED UNIT PER PLACEMENT (the owner's rule, 2026-10-27: "if we add an ad, we also go and do
 * this so that we can track all of them"). Every ad spot has its own unit in AdSense, so the Ad
 * units report says which spot earns and which does not. scripts/ad-units.json is the list. A slot
 * the list does not have, a slot on a page the list does not name for it, a retired slot, a unit
 * used twice on one page (unless it is a 'many' unit), a 'planned' unit already in the code and a
 * 'live' unit the code no longer carries each fail here. Adding a spot is three things in one
 * commit: the unit made in AdSense, its id in the list, and the code. */
const REG = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/ad-units.json'), 'utf8'));
const bySlot = new Map(Object.entries(REG.units).map(([name, u]) => [u.slot, { name, ...u }]));
const retired = new Map(Object.entries(REG.retired || {}).map(([name, u]) => [u.slot, name]));
const seen = new Map();   // unit name -> pages it was found on
const owns = (where, rel) => where.some((w) => (w.endsWith('/') ? rel.startsWith(w) : rel === w));
for (const file of walkCode(ROOT)) {
  const rel = path.relative(ROOT, file);
  const src = fs.readFileSync(file, 'utf8');
  const count = new Map();
  for (const m of src.matchAll(/data-ad-slot=["'](\d+)["']|AD_SLOT\s*=\s*['"](\d+)['"]/g)) {
    const slot = m[1] || m[2];
    if (/^0+$/.test(slot)) continue;
    if (retired.has(slot)) { problems.push(`${rel}: uses the retired unit ${retired.get(slot)} (${slot}). Give the spot its own unit`); continue; }
    const u = bySlot.get(slot);
    if (!u) { problems.push(`${rel}: ad slot ${slot} is not in scripts/ad-units.json. Make a named unit for the spot and record it`); continue; }
    if (!owns(u.where, rel)) { problems.push(`${rel}: carries ${u.name} (${slot}), which ad-units.json keeps to ${u.where.join(', ')}. Each spot gets its own unit`); continue; }
    count.set(u.name, (count.get(u.name) || 0) + 1);
    if (!seen.has(u.name)) seen.set(u.name, []);
    seen.get(u.name).push(rel);
  }
  /* A page that builds its units in code keeps the ids in a table (golf's GAD_UNIT = {career: '...'}).
   * Each id in such a table is one placement, counted the same way. */
  for (const t of src.matchAll(/\b[A-Z_]*(?:UNIT|SLOT)[A-Z_]*\s*=\s*\{([^}]*)\}/g)) {
    for (const m of t[1].matchAll(/['"](\d{6,})['"]/g)) {
      const slot = m[1];
      if (/^0+$/.test(slot)) continue;
      const u = bySlot.get(slot);
      if (retired.has(slot)) problems.push(`${rel}: uses the retired unit ${retired.get(slot)} (${slot}). Give the spot its own unit`);
      else if (!u) problems.push(`${rel}: ad slot ${slot} is not in scripts/ad-units.json. Make a named unit for the spot and record it`);
      else if (!owns(u.where, rel)) problems.push(`${rel}: carries ${u.name} (${slot}), which ad-units.json keeps to ${u.where.join(', ')}. Each spot gets its own unit`);
      else { count.set(u.name, (count.get(u.name) || 0) + 1); if (!seen.has(u.name)) seen.set(u.name, []); seen.get(u.name).push(rel); }
    }
  }
  /* GOLF builds its results and home units in code (golf/index.html, the GAD block). gadMount() runs at
   * the end of every render and removes the unit when its screen goes; gadDrop() removes it (never hides
   * it); opening Putt Putt drops it before the course loads. */
  if (/\bGAD_UNIT\s*=/.test(src)) {
    if (!/function gadDrop\(/.test(src)) problems.push(`${rel}: builds golf ads but has no gadDrop() to remove them`);
    if (!/^\s*try\{ gadMount\(\); \}/m.test(src)) problems.push(`${rel}: render() must call gadMount(), which removes the ad when its screen goes`);
    if (!/function openPutt\([^)]*\)\{[^}]*gadDrop\(\)/.test(src)) problems.push(`${rel}: openPutt() must drop the ad before Putt Putt opens`);
  }
  for (const [name, n] of count) if (n > 1 && !REG.units[name].many) problems.push(`${rel}: uses ${name} ${n} times. One placement, one unit`);
}
for (const [name, u] of Object.entries(REG.units)) {
  const found = seen.has(name);
  if (u.status === 'live' && !found) problems.push(`ad-units.json: ${name} is live but no page carries it. Mark it planned or retired`);
  if (u.status === 'planned' && found) problems.push(`ad-units.json: ${name} is in ${seen.get(name).join(', ')} but still marked planned. Mark it live`);
}

if (problems.length) {
  console.error(`AdSense readiness: ${problems.length} problem(s) across ${checked} indexable pages\n`);
  for (const p of problems) console.error('  ' + p);
  console.error('\nSee the header of scripts/check-adsense.mjs for what each check is for.');
  process.exit(1);
}

console.log(`AdSense readiness: ${checked} indexable pages, all clean.`);
