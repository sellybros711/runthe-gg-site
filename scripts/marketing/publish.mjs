#!/usr/bin/env node
/* Publishes the approved social posts in marketing/queue/. Merging a post into main IS the approval.

   node scripts/marketing/publish.mjs --check      validate every queued post (CI runs this on a PR)
   node scripts/marketing/publish.mjs              publish what is due, as a DRY RUN unless live
   MARKETING_LIVE=true node scripts/marketing/publish.mjs    publish for real (the workflow sets it)

   A post is one markdown file: a header, then the text.

     ---
     channel: x                  x, facebook, instagram, reddit or newsletter
     publish_at: 2026-10-20T16:00:00Z
     link: https://runthe.gg/football/
     image: https://runthe.gg/football/og.png     instagram needs one; it must be a public URL
     subreddit: r/fantasyfootball                 reddit only
     title: A post title                          reddit only
     ---
     The post text.

   x, facebook and instagram are published here when they fall due. reddit and newsletter are never
   published by this script: Reddit removes automated self-promotion, and the newsletter has its own
   reviewed workflow. They are listed so the owner sees what to post by hand.

   A published post moves to marketing/published/ with the result appended; the workflow commits
   that. A failed post stays in the queue and fails the run, so GitHub emails the owner. A channel
   whose secrets are missing is skipped out loud, never failed, so the workflow can sit dormant until
   the accounts are connected. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const QUEUE = path.join(ROOT, 'marketing/queue'), DONE = path.join(ROOT, 'marketing/published');
const CHECK = process.argv.includes('--check');
const LIVE = process.env.MARKETING_LIVE === 'true';
const CHANNELS = ['x', 'facebook', 'instagram', 'reddit', 'newsletter'];
const AUTO = ['x', 'facebook', 'instagram'];
const env = process.env;
// X charges per post, and a post carrying a link costs about 13 times a plain one ($0.20 against
// $0.015, 2026-10). The owner's budget (2026-10-15): at most this many X posts with a link in any one
// week, Monday to Sunday UTC. The rest are plain text that points to the link in the bio.
const X_LINK_POSTS_PER_WEEK = 3;
// Built from code points so this file obeys the rule it enforces (check-dashes reads escapes too).
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]|&(m|n)dash;`);

function parse(file) {
  const text = fs.readFileSync(file, 'utf8');
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { file, text, error: 'no --- header' };
  const fm = {};
  for (const ln of m[1].split(/\r?\n/)) { const kv = /^([a-z_]+):\s*(.*)$/.exec(ln); if (kv) fm[kv[1]] = kv[2].trim(); }
  return { file, text, fm, body: m[2].trim() };
}

/* What a post must be before it can go anywhere. The same rules the site holds its own copy to. */
function problems(p) {
  const out = [], fm = p.fm || {};
  if (p.error) return [p.error];
  if (!CHANNELS.includes(fm.channel)) out.push(`channel must be one of ${CHANNELS.join(', ')}`);
  if (!fm.publish_at || isNaN(Date.parse(fm.publish_at))) out.push('publish_at must be a date and time, e.g. 2026-10-20T16:00:00Z');
  if (!p.body) out.push('the post has no text');
  if (DASHES.test(p.text)) out.push('contains an em or en dash');
  if (/[\u201C\u201D\u2018]/.test(p.body)) out.push('contains a curly quote (paste artifact)');
  for (const u of [fm.link, fm.image].filter(Boolean)) if (!/^https:\/\//.test(u)) out.push(`not an https URL: ${u}`);
  if (fm.channel === 'x') {
    // X counts every link as 23 characters
    const len = p.body.replace(/https?:\/\/\S+/g, 'x'.repeat(23)).length + (fm.link && !p.body.includes(fm.link) ? 24 : 0);
    if (len > 280) out.push(`too long for X: ${len} of 280 characters`);
  }
  if (fm.channel === 'instagram' && !fm.image) out.push('instagram needs an image (a public https URL)');
  if (fm.channel === 'instagram' && p.body.length > 2200) out.push('too long for an Instagram caption (2200)');
  if (fm.channel === 'reddit' && (!fm.subreddit || !fm.title)) out.push('reddit needs a subreddit and a title');
  return out;
}

// ---- X: OAuth 1.0a user context, POST /2/tweets ---------------------------------------------------
const pct = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
export function oauthSignature(method, url, params, consumerSecret, tokenSecret) {
  const base = [method.toUpperCase(), pct(url), pct(Object.keys(params).sort().map((k) => `${pct(k)}=${pct(params[k])}`).join('&'))].join('&');
  return crypto.createHmac('sha1', `${pct(consumerSecret)}&${pct(tokenSecret)}`).update(base).digest('base64');
}
async function postX(p) {
  const url = 'https://api.x.com/2/tweets';
  const o = { oauth_consumer_key: env.X_API_KEY, oauth_nonce: crypto.randomBytes(16).toString('hex'), oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)), oauth_token: env.X_ACCESS_TOKEN, oauth_version: '1.0' };
  o.oauth_signature = oauthSignature('POST', url, o, env.X_API_SECRET, env.X_ACCESS_SECRET);
  const auth = 'OAuth ' + Object.keys(o).sort().map((k) => `${pct(k)}="${pct(o[k])}"`).join(', ');
  const text = p.fm.link && !p.body.includes(p.fm.link) ? `${p.body}\n\n${p.fm.link}` : p.body;
  const r = await fetch(url, { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`X answered ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return `https://x.com/i/web/status/${j.data.id}`;
}

// ---- Facebook Page and Instagram: the Graph API ----------------------------------------------------
const GRAPH = 'https://graph.facebook.com/v21.0';
async function graph(pathPart, params) {
  const r = await fetch(`${GRAPH}/${pathPart}`, { method: 'POST', body: new URLSearchParams(params) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`Meta answered ${r.status}: ${JSON.stringify(j.error || j).slice(0, 300)}`);
  return j;
}
async function postFacebook(p) {
  const j = await graph(`${env.META_PAGE_ID}/feed`, { message: p.body, ...(p.fm.link ? { link: p.fm.link } : {}), access_token: env.META_PAGE_TOKEN });
  return `https://facebook.com/${j.id}`;
}
async function postInstagram(p) {
  const caption = p.fm.link && !p.body.includes(p.fm.link) ? `${p.body}\n\n${p.fm.link.replace(/^https:\/\//, '')}` : p.body;
  const c = await graph(`${env.IG_USER_ID}/media`, { image_url: p.fm.image, caption, access_token: env.META_PAGE_TOKEN });
  const j = await graph(`${env.IG_USER_ID}/media_publish`, { creation_id: c.id, access_token: env.META_PAGE_TOKEN });
  return `instagram media ${j.id}`;
}
const SEND = { x: postX, facebook: postFacebook, instagram: postInstagram };
const NEEDS = { x: ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'], facebook: ['META_PAGE_ID', 'META_PAGE_TOKEN'], instagram: ['IG_USER_ID', 'META_PAGE_TOKEN'] };

// ---- run --------------------------------------------------------------------------------------------
const posts = fs.existsSync(QUEUE) ? fs.readdirSync(QUEUE).filter((f) => f.endsWith('.md') && f !== 'README.md').sort().map((f) => parse(path.join(QUEUE, f))) : [];
let bad = 0;
for (const p of posts) { const e = problems(p); if (e.length) { bad++; console.log(`INVALID ${path.basename(p.file)}: ${e.join('; ')}`); } }

// The week counts what already went out, so a later batch cannot top a week back up past the cap.
const hasLink = (p) => p.fm && p.fm.channel === 'x' && (p.fm.link || /https?:\/\//.test(p.body));
const weekOf = (iso) => { const d = new Date(Date.parse(iso)); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const sent = fs.existsSync(DONE) ? fs.readdirSync(DONE).filter((f) => f.endsWith('.md')).map((f) => parse(path.join(DONE, f))) : [];
const linkWeeks = {};
for (const p of [...posts, ...sent]) if (hasLink(p) && !isNaN(Date.parse(p.fm.publish_at))) (linkWeeks[weekOf(p.fm.publish_at)] ||= []).push(path.basename(p.file));
for (const [wk, names] of Object.entries(linkWeeks)) if (names.length > X_LINK_POSTS_PER_WEEK) {
  bad++; console.log(`OVER BUDGET week of ${wk}: ${names.length} X posts with a link, the limit is ${X_LINK_POSTS_PER_WEEK} (${names.join(', ')}). Drop the link from the rest.`);
}
if (CHECK) { console.log(bad ? `\n${bad} post(s) need fixing.` : `${posts.length} queued post(s) valid.`); process.exit(bad ? 1 : 0); }

const now = Date.now();
let failed = 0;
for (const p of posts) {
  if (problems(p).length) continue;
  const name = path.basename(p.file), ch = p.fm.channel;
  if (Date.parse(p.fm.publish_at) > now) continue;
  // A post more than a day overdue is held, never sent: switching publishing on (or a long outage)
  // must not dump a backlog of stale posts into a feed at once. Re-date it to publish it.
  if (now - Date.parse(p.fm.publish_at) > 24 * 3600e3) { console.log(`STALE    ${name}: more than a day past its publish_at, so not sent. Re-date it to publish.`); continue; }
  if (!AUTO.includes(ch)) { console.log(`BY HAND  ${name}: ${ch} posts are never published automatically. Post it yourself.`); continue; }
  const missing = NEEDS[ch].filter((k) => !env[k]);
  if (missing.length) { console.log(`SKIPPED  ${name}: ${ch} is not connected (missing ${missing.join(', ')}).`); continue; }
  if (!LIVE) { console.log(`DRY RUN  ${name}: would publish to ${ch}. Set the repo variable MARKETING_LIVE to true to go live.`); continue; }
  try {
    const where = await SEND[ch](p);
    fs.mkdirSync(DONE, { recursive: true });
    fs.writeFileSync(path.join(DONE, name), `${p.text.trimEnd()}\n\n<!-- published ${new Date().toISOString()} at ${where} -->\n`);
    fs.unlinkSync(p.file);
    console.log(`POSTED   ${name}: ${where}`);
  } catch (e) { failed++; console.log(`FAILED   ${name}: ${e.message}`); }
}
process.exit(failed || bad ? 1 : 0);
