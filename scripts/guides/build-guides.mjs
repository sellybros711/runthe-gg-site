#!/usr/bin/env node
/* The guides at runthe.gg/guides/: original articles for players, one page each, and a hub.
 *
 * WHY THEY EXIST. AdSense turned runthe.gg down on 2026-08-31 for "Low value content". The
 * site is mostly game screens with little text a reviewer can read, and the How to play pages
 * were already there. The guides are the written content: specific, built on the games' real
 * numbers, and well away from any game control, which also makes them the safest place on the
 * site for a display ad. The owner's rules (2026-10-24, the Ads Agent's chat):
 *
 *   - Reached from the home page footer only. No game screen, menu or play area links here.
 *   - Written by the Marketing Agent, fact checked by each game's agent, approved by the owner
 *     one draft at a time. This script only lays them out.
 *
 * HOW. Each approved draft is a markdown file in guides/src/<slug>.md with front matter (slug,
 * title, description, game, play_url). This turns it into guides/<slug>.html in the look of
 * about.html, and writes guides/index.html listing every guide. The markdown it reads is a
 * small subset on purpose: ## headings, paragraphs, - and 1. lists, **bold** and [text](url). Anything
 * else is an error, so a draft never ships with stray syntax showing.
 *
 * Every number a guide states is pinned in guides/numbers.json to the code it comes from, and
 * scripts/guides/check-guides.mjs holds the pins and holds these pages to their sources.
 *
 *   node scripts/guides/build-guides.mjs          write the pages
 *   node scripts/guides/build-guides.mjs --check  exit 1 if a page is not what its source builds
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SRC = path.join(ROOT, 'guides', 'src');
const OUT = path.join(ROOT, 'guides');
const SITE = 'https://runthe.gg';

const GAME_NAME = {
  football: 'The Perfect Season', cfb: 'College Football: Perfect Season', golf: 'Run The Tour',
  soccer: 'RunThePitch', baseball: 'Run The Diamond', arcade: 'Run The Arcade',
};
const GAME_ORDER = ['football', 'cfb', 'baseball', 'golf', 'soccer', 'arcade'];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(s, where) {
  let t = esc(s);
  t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, txt, href) => {
    if (!/^(\/|https:\/\/)/.test(href)) throw new Error(`${where}: link "${href}" must start with / or https://`);
    return `<a href="${href}">${txt}</a>`;
  });
  if (/[*`_]{1,}\S/.test(t.replace(/<[^>]+>/g, ''))) {
    const left = t.replace(/<[^>]+>/g, '').match(/[*`]+/);
    if (left) throw new Error(`${where}: markdown the builder does not handle: "${s.slice(0, 60)}"`);
  }
  return t;
}

export function parse(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: no front matter`);
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim().replace(/^"(.*)"$/, '$1');
  }
  for (const k of ['slug', 'title', 'description', 'game', 'play_url']) {
    if (!meta[k]) throw new Error(`${file}: front matter has no ${k}`);
  }
  if (!GAME_NAME[meta.game]) throw new Error(`${file}: unknown game "${meta.game}"`);
  if (path.basename(file, '.md') !== meta.slug) throw new Error(`${file}: the file name must be the slug`);
  /* The draft's "## Numbers" table is for the people checking it. It is not published: the
     pins in guides/numbers.json are what keeps those numbers true. */
  const body = m[2].replace(/\n## Numbers\n[\s\S]*$/, '\n');
  return { meta, body };
}

function bodyHtml(body, where) {
  const out = [];
  let list = null, tag = 'ul', para = [];
  /* A list item may carry one level of sub items, written two spaces in ("  - "). */
  const li = (it) => `        <li>${inline(it.text, where)}` +
    (it.kids.length ? '\n          <ul>\n' + it.kids.map((k) => `            <li>${inline(k, where)}</li>`).join('\n') + '\n          </ul>\n        ' : '') + '</li>';
  const flushP = () => { if (para.length) { out.push(`      <p>${inline(para.join(' '), where)}</p>`); para = []; } };
  const flushL = () => { if (list) { out.push(`      <${tag}>\n` + list.map(li).join('\n') + `\n      </${tag}>`); list = null; } };
  for (const line of body.split('\n')) {
    if (/^##\s+/.test(line)) { flushP(); flushL(); out.push(`      <h2>${inline(line.replace(/^##\s+/, ''), where)}</h2>`); }
    else if (/^(- |\d+\. )/.test(line)) {
      /* "- " is a bulleted list, "1. " a numbered one (a ranking, an order of steps). */
      const t = /^- /.test(line) ? 'ul' : 'ol';
      flushP(); if (list && tag !== t) flushL();
      tag = t; (list = list || []).push({ text: line.replace(/^(- |\d+\. )/, ''), kids: [] });
    }
    else if (/^ {2}- /.test(line)) {
      if (!list) throw new Error(`${where}: a sub item with no item above it: "${line.trim().slice(0, 60)}"`);
      list[list.length - 1].kids.push(line.replace(/^ {2}- /, ''));
    }
    else if (!line.trim()) { flushP(); flushL(); }
    else if (/^(#|\||>)/.test(line)) throw new Error(`${where}: markdown the builder does not handle: "${line.slice(0, 60)}"`);
    else { flushL(); para.push(line.trim()); }
  }
  flushP(); flushL();
  return out.join('\n\n');
}

/* The head, the consent defaults (Europe first, then everywhere) before the ad tag, and the
   footer are about.html's, so check-adsense reads a guide the way it reads every other page. */
function page({ title, description, url, h1, sub, main, cta }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}: RunThe.GG</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="RunThe.GG">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:image" content="https://runthe.gg/assets/runthegames-og_1200x630.png?v=4">
  <meta name="theme-color" content="#06182e">
  <link rel="icon" href="/assets/runthegames-icon_48.png?v=5" sizes="any">
  <link rel="apple-touch-icon" sizes="180x180" href="/assets/runthegames-icon_180.png?v=5">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@400;600;700;900&display=swap" rel="stylesheet">
  <style>
    :root{--bg:#0a1626;--card:#122a44;--cardb:#1e3d5c;--ink:#eaf1f8;--mut:#93a7bd;--coral:#F85858;--teal:#66D3DE;--green:#6EE84E;}
    *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
    html,body{margin:0;padding:0;}
    body{font-family:'Archivo',system-ui,-apple-system,sans-serif;line-height:1.6;color:var(--ink);
      min-height:100vh;overflow-x:hidden;-webkit-font-smoothing:antialiased;
      background:
        radial-gradient(1100px 520px at 50% -8%, rgba(102,211,222,.16), transparent 60%),
        radial-gradient(900px 460px at 88% 4%, rgba(248,88,88,.12), transparent 55%),
        linear-gradient(180deg,#0b1a2c 0%, var(--bg) 46%, #081120 100%);
      background-attachment:fixed;}
    .wrap{max-width:680px;margin:0 auto;padding:26px 18px 56px;}
    .mast{text-align:center;margin:4px 0 22px;}
    .mast img{display:block;width:100%;max-width:440px;height:auto;margin:0 auto;filter:drop-shadow(0 6px 26px rgba(0,0,0,.45));}
    .crumb{font-size:12.5px;color:#6f829a;margin:0 0 10px;}
    .crumb a{color:#9db2c8;text-decoration:none;font-weight:700;}
    .card{background:linear-gradient(180deg,var(--card),#0f2338);border:1px solid var(--cardb);border-radius:10px;padding:24px 22px 28px;}
    h1{font-family:'Anton',Impact,sans-serif;font-weight:400;text-transform:uppercase;letter-spacing:.02em;
      font-size:clamp(28px,7.5vw,42px);line-height:1.05;margin:0 0 8px;}
    .sub{font-weight:900;color:var(--teal);text-transform:uppercase;letter-spacing:2px;font-size:11.5px;margin:0 0 18px;}
    h2{font-family:'Anton',Impact,sans-serif;font-weight:400;text-transform:uppercase;letter-spacing:.5px;
      font-size:18px;margin:26px 0 8px;display:flex;align-items:center;color:var(--ink);}
    h2:before{content:"";width:10px;height:10px;background:var(--green);border-radius:2px;margin-right:10px;flex:0 0 auto;}
    .card p,.card li{font-size:15px;color:var(--mut);}
    .card p{margin:0 0 14px;}
    .card ul,.card ol{margin:0 0 14px;padding-left:20px;}
    .card li{margin:0 0 6px;}
    .card b{color:var(--ink);font-weight:800;}
    .card a{color:var(--teal);font-weight:700;text-decoration:none;}
    .card a:hover{text-decoration:underline;}
    .list{list-style:none;padding:0;margin:0;}
    .list li{border-top:1px solid rgba(255,255,255,.08);padding:14px 0;margin:0;}
    .list li:first-child{border-top:0;}
    .list .t{display:block;font-size:16px;}
    .list .d{display:block;font-size:14px;color:var(--mut);}
    .play-row{margin-top:24px;text-align:center;}
    .cta{display:inline-block;background:linear-gradient(180deg,#FF6B6B,#F04A44);color:#fff!important;font-weight:800;
      text-transform:uppercase;letter-spacing:.5px;font-size:15px;padding:13px 26px;border-radius:7px;
      text-decoration:none!important;box-shadow:0 8px 22px -12px rgba(248,88,88,.9);}
    .foot{margin-top:28px;text-align:center;font-size:12.5px;color:#6f829a;line-height:2;}
    .foot a{color:#9db2c8;text-decoration:none;font-weight:700;}
    .foot a:hover{color:var(--ink);}
    .foot .sep{margin:0 7px;color:#3c4c60;}
  </style>
  <script>
  window.dataLayer=window.dataLayer||[];
  window.gtag=window.gtag||function(){dataLayer.push(arguments);};
  /* Europe (EEA, UK, Switzerland): analytics waits for consent too, until the certified CMP answers. */
  gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',region:['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','IS','LI','NO','GB','CH'],wait_for_update:500});
  gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'granted',wait_for_update:500});
  </script>
  <script>
  window.GA_ID='G-L29P5MRWKE';
  (function(){var id=window.GA_ID;if(!id||id.indexOf('G-')!==0||/X{4,}/.test(id))return;
    window.dataLayer=window.dataLayer||[];window.gtag=function(){dataLayer.push(arguments);};
    gtag('js',new Date());gtag('set',{game_name:'Guides'}); gtag('config',id);
    var s=document.createElement('script');s.async=true;
    s.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(id);
    document.head.appendChild(s);})();
  </script>
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5952069078178257"
       crossorigin="anonymous"></script>
</head>
<body>
  <div class="wrap">
    <div class="mast"><a href="/"><img src="/assets/wm-stacked.png?v=1" alt="Run The Games" width="1200" height="431" /></a></div>

    <main class="card">
${h1}
      <p class="sub">${sub}</p>

${main}
${cta ? `
      <div class="play-row">
        ${cta}
      </div>` : ''}
    </main>

    <footer class="foot">
      <a href="/">Home</a><span class="sep">·</span>
      <a href="/guides/">Guides</a><span class="sep">·</span>
      <a href="/about.html">About</a><span class="sep">·</span>
      <a href="/privacy.html">Privacy</a><span class="sep">·</span>
      <a href="/terms.html">Terms</a><span class="sep">·</span>
      <a href="/disclaimer.html">Disclaimer</a><span class="sep">·</span>
      <a href="/contact.html">Contact</a>
    </footer>
  </div>
</body>
</html>
`;
}

export function sources() {
  if (!fs.existsSync(SRC)) return [];
  return fs.readdirSync(SRC).filter((f) => f.endsWith('.md')).sort().map((f) => parse(path.join(SRC, f)));
}

/* Returns { 'guides/<file>': html } for every page the sources build. */
export function build() {
  const guides = sources();
  const files = {};
  for (const { meta, body } of guides) {
    const where = `guides/src/${meta.slug}.md`;
    files[`guides/${meta.slug}.html`] = page({
      title: meta.title, description: meta.description, url: `${SITE}/guides/${meta.slug}.html`,
      h1: `      <p class="crumb"><a href="/guides/">Guides</a> · ${GAME_NAME[meta.game]}</p>\n      <h1>${inline(meta.title, where)}</h1>`,
      sub: `A guide to ${esc(GAME_NAME[meta.game])}`,
      main: bodyHtml(body, where),
      cta: `<a class="cta" href="${meta.play_url}">Play ${esc(GAME_NAME[meta.game])}</a>`,
    });
  }
  const byGame = GAME_ORDER.map((g) => [g, guides.filter((x) => x.meta.game === g)]).filter(([, l]) => l.length);
  const hubMain = [
    `      <p>Guides to the games on RunThe.GG, written for players. Each one explains how a game really works: the rules, the numbers the game plays by, and what wins. Every number in a guide is the number the game uses today.</p>`,
    `      <p>The games are free and run in your browser on a phone or a computer. Read a guide, then play.</p>`,
    ...byGame.map(([g, list]) => `      <h2>${esc(GAME_NAME[g])}</h2>\n      <ul class="list">\n` +
      list.map(({ meta }) => `        <li><a class="t" href="/guides/${meta.slug}.html">${esc(meta.title)}</a><span class="d">${esc(meta.description)}</span></li>`).join('\n') +
      '\n      </ul>'),
  ].join('\n\n');
  files['guides/index.html'] = page({
    title: 'Guides', description: 'Guides to every game on RunThe.GG: how the rules, the numbers and the strategy really work, written for players.',
    url: `${SITE}/guides/`, h1: '      <h1>Guides</h1>', sub: 'How the games really work', main: hubMain,
    cta: '<a class="cta" href="/">Browse the games</a>',
  });
  return files;
}

/* The sitemap's guide entries live between two markers and are written from the sources, so a
   new guide is never left out of it and a removed one never lingers. */
const SITEMAP = path.join(ROOT, 'sitemap.xml');
export function sitemapWith(xml, today) {
  const keep = new Map([...xml.matchAll(/<url><loc>(https:\/\/runthe\.gg\/guides\/[^<]*)<\/loc><lastmod>([^<]*)<\/lastmod>/g)].map((m) => [m[1], m[2]]));
  const urls = [`${SITE}/guides/`, ...sources().map(({ meta }) => `${SITE}/guides/${meta.slug}.html`)];
  const lines = urls.map((u, i) => `  <url><loc>${u}</loc><lastmod>${keep.get(u) || today}</lastmod><priority>${i ? '0.5' : '0.6'}</priority></url>`);
  return xml.replace(/( *<!-- guides:start[^\n]*-->\n)[\s\S]*?( *<!-- guides:end -->)/, (m, a, b) => a + lines.join('\n') + (lines.length ? '\n' : '') + b);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = build();
  const xml = fs.readFileSync(SITEMAP, 'utf8');
  files['sitemap.xml'] = sitemapWith(xml, new Date().toISOString().slice(0, 10));
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const [rel, html] of Object.entries(files)) {
    const abs = path.join(ROOT, rel);
    const now = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
    if (now === html) continue;
    if (check) { console.error(`stale: ${rel} is not what its source builds. Run node scripts/guides/build-guides.mjs`); stale++; }
    else { fs.writeFileSync(abs, html); console.log(`wrote ${rel}`); }
  }
  for (const f of fs.readdirSync(OUT).filter((f) => f.endsWith('.html'))) {
    if (!files[`guides/${f}`] && f !== 'sitemap.xml') { console.error(`orphan: guides/${f} has no source in guides/src`); stale++; }
  }
  if (stale) process.exit(1);
  console.log(`guides: ${Object.keys(files).length} pages ${check ? 'match their sources' : 'up to date'}`);
}
