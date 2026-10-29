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
     image: https://runthe.gg/football/og.png     a still, by public URL (the exception now)
     video: marketing/clips/2026-10-16-football.mp4   a clip from record.mjs, committed with the post
     subreddit: r/fantasyfootball                 reddit only
     title: A post title                          reddit only
     ---
     The post text.

   x, facebook and instagram are published here when they fall due. reddit and newsletter are never
   published by this script: Reddit removes automated self-promotion, and the newsletter has its own
   reviewed workflow. They are listed so the owner sees what to post by hand.

   VIDEO FIRST (the owner's call, 2026-10-15). Most posts are a clip of the game being played with a
   one line caption. `video:` is a path in this repo, made by scripts/marketing/record.mjs and merged
   in the same PR as the post. X gets the file uploaded. Instagram (as a Reel) and the Facebook Page
   fetch it by URL from the deployed site, so it must be on main and deployed before publish_at:
   queue video posts at least an hour out. A video post's caption is twenty words at most, not
   counting links or "link in bio", and no post may use a phrase from AI_TELLS. The brand note in the
   knowledge base (agents/marketing/marketing-brand.md) is where those rules come from.

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
// Where the deployed site serves a committed clip from. Instagram and Facebook fetch it here.
const SITE = env.MARKETING_SITE || 'https://runthe.gg';
const VIDEO_MAX_WORDS = 20;
// Cloudflare Pages will not deploy a file over 25 MiB, and a clip that big is far too long anyway.
const VIDEO_MAX_BYTES = 25 * 1024 * 1024;
// Instagram takes a Reel of 3 to 90 seconds. X and Facebook take longer, so Instagram sets the range.
const VIDEO_SECONDS = [3, 90];
// Phrases that make a caption read as written by a machine (marketing-brand.md, "No AI tells").
// Matched case-insensitively on word boundaries. The brand note also bans three adjectives in a row
// and a question followed by its own answer; a checker cannot tell those from honest copy, so the
// owner's review is the check for them.
const AI_TELLS = ['ready to', "whether you're", 'whether you are', 'introducing', 'get ready', 'dive in',
  'level up', 'unleash', 'elevate', 'experience', 'immersive', 'seamless', 'game-changer', 'game changer',
  'game-changing', 'look no further', "here's the thing", 'revolutionary', 'ultimate'];
const wordsOf = (s) => s.replace(/https?:\/\/\S+/g, ' ').replace(/\blink in (the )?bio\b/gi, ' ')
  .split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));

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
  if (fm.channel === 'instagram' && !fm.image && !fm.video) out.push('instagram needs a video (or an image by public https URL)');
  if (fm.image && fm.video) out.push('a post is a video or an image, not both');
  if (fm.video) {
    out.push(...videoProblems(fm.video));
    const n = wordsOf(p.body).length;
    if (n > VIDEO_MAX_WORDS) out.push(`a video caption is ${VIDEO_MAX_WORDS} words at most, this is ${n}`);
  }
  // The list holds no regex syntax, so the phrases go in as they are.
  for (const t of AI_TELLS) if (new RegExp(`(^|[^\\p{L}])${t}($|[^\\p{L}])`, 'iu').test(p.body.replace(/\u2019/g, "'"))) out.push(`reads as machine-written: "${t}"`);
  if (/!{2,}/.test(p.body)) out.push('a stack of exclamation marks');
  if ((p.body.match(/\p{Extended_Pictographic}/gu) || []).length > 1) out.push('one emoji at most');
  if (/^[^\n:]{2,60}:\s/.test(p.body) && !/^\d/.test(p.body)) out.push('opens with a headline and a colon');
  if (fm.channel === 'instagram' && p.body.length > 2200) out.push('too long for an Instagram caption (2200)');
  if (fm.channel === 'reddit' && (!fm.subreddit || !fm.title)) out.push('reddit needs a subreddit and a title');
  return out;
}

// ---- the clip ---------------------------------------------------------------------------------------
/* Reads what the platforms reject a clip for (length, size, codec) straight out of the MP4 boxes, so
   the check needs no ffprobe and runs the same on a phone-approved PR as it does here. */
function mp4Info(buf) {
  const boxes = (s, e) => {
    const out = [];
    for (let i = s; i + 8 <= e;) {
      let size = buf.readUInt32BE(i), head = 8;
      const type = buf.toString('latin1', i + 4, i + 8);
      if (size === 1) { size = Number(buf.readBigUInt64BE(i + 8)); head = 16; } else if (size === 0) size = e - i;
      if (size < head || i + size > e) break;
      out.push({ type, start: i + head, end: i + size });
      i += size;
    }
    return out;
  };
  const moov = boxes(0, buf.length).find((b) => b.type === 'moov');
  if (!moov) return null;
  const avc = buf.indexOf('avc1', moov.start, 'latin1');
  const info = { seconds: 0, width: 0, height: 0, avc: avc !== -1 && avc < moov.end };
  for (const b of boxes(moov.start, moov.end)) {
    if (b.type === 'mvhd') {
      const v1 = buf[b.start] === 1;
      const scale = buf.readUInt32BE(b.start + (v1 ? 20 : 12));
      const dur = v1 ? Number(buf.readBigUInt64BE(b.start + 24)) : buf.readUInt32BE(b.start + 16);
      info.seconds = scale ? dur / scale : 0;
    }
    if (b.type === 'trak') for (const t of boxes(b.start, b.end)) if (t.type === 'tkhd') {
      const at = t.start + (buf[t.start] === 1 ? 88 : 76);
      const w = buf.readUInt32BE(at) / 65536, h = buf.readUInt32BE(at + 4) / 65536;
      if (w && h && !info.width) { info.width = w; info.height = h; }
    }
  }
  return info;
}
function videoProblems(rel) {
  if (!/^marketing\/clips\/[a-z0-9._-]+\.mp4$/.test(rel)) return [`video must be a path like marketing/clips/name.mp4, not ${rel}`];
  const f = path.join(ROOT, rel);
  if (!fs.existsSync(f)) return [`video not found: ${rel} (commit the clip with the post)`];
  const buf = fs.readFileSync(f), out = [];
  if (buf.length > VIDEO_MAX_BYTES) out.push(`video is ${(buf.length / 1048576).toFixed(1)} MB, the limit is ${VIDEO_MAX_BYTES / 1048576}`);
  const m = mp4Info(buf);
  if (!m) return [...out, `video is not a readable MP4: ${rel}`];
  if (!m.avc) out.push('video must be H.264 (record.mjs writes it that way)');
  if (m.seconds < VIDEO_SECONDS[0] || m.seconds > VIDEO_SECONDS[1]) out.push(`video is ${m.seconds.toFixed(1)}s, Instagram takes ${VIDEO_SECONDS.join(' to ')}s`);
  if (m.width > m.height) out.push(`video is landscape (${m.width}x${m.height}); clips are phone-shaped`);
  return out;
}
const videoUrl = (rel) => `${SITE}/${rel}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- X: OAuth 1.0a user context, POST /2/tweets ---------------------------------------------------
const pct = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
export function oauthSignature(method, url, params, consumerSecret, tokenSecret) {
  const base = [method.toUpperCase(), pct(url), pct(Object.keys(params).sort().map((k) => `${pct(k)}=${pct(params[k])}`).join('&'))].join('&');
  return crypto.createHmac('sha1', `${pct(consumerSecret)}&${pct(tokenSecret)}`).update(base).digest('base64');
}
/* One signed request. OAuth 1.0a signs the query and a form body, never a JSON or multipart one. */
async function xFetch(method, url, { query = {}, form, json, multipart } = {}) {
  const o = { oauth_consumer_key: env.X_API_KEY, oauth_nonce: crypto.randomBytes(16).toString('hex'), oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)), oauth_token: env.X_ACCESS_TOKEN, oauth_version: '1.0' };
  o.oauth_signature = oauthSignature(method, url, { ...o, ...query, ...(form || {}) }, env.X_API_SECRET, env.X_ACCESS_SECRET);
  const headers = { Authorization: 'OAuth ' + Object.keys(o).sort().map((k) => `${pct(k)}="${pct(o[k])}"`).join(', ') };
  let body;
  if (form) body = new URLSearchParams(form);
  if (json) { body = JSON.stringify(json); headers['Content-Type'] = 'application/json'; }
  if (multipart) { body = new FormData(); for (const [k, v] of Object.entries(multipart)) body.append(k, v); }
  const qs = Object.keys(query).length ? '?' + new URLSearchParams(query) : '';
  const r = await fetch(url + qs, { method, headers, body });
  const j = await r.json().catch(() => ({}));
  return { r, j };
}
const xFail = (what, { r, j }) => new Error(`X ${what} answered ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);

/* Uploads a clip in chunks and waits for X to finish processing it. X's documentation and its
   developers disagree (2026-10) on whether the v2 upload endpoints take OAuth 1.0a keys, so this
   tries v2 first and falls back to the v1.1 upload endpoint when v2 refuses the credentials. */
async function uploadXVideo(rel) {
  const bytes = fs.readFileSync(path.join(ROOT, rel)), CHUNK = 4 * 1024 * 1024;
  const chunks = [];
  for (let i = 0; i * CHUNK < bytes.length; i++) chunks.push(new Blob([bytes.subarray(i * CHUNK, (i + 1) * CHUNK)], { type: 'video/mp4' }));
  let id, info, status;
  const v2 = 'https://api.x.com/2/media/upload';
  const init = await xFetch('POST', `${v2}/initialize`, { json: { media_type: 'video/mp4', total_bytes: bytes.length, media_category: 'tweet_video' } });
  if (init.r.ok) {
    id = init.j.data.id;
    for (const [i, media] of chunks.entries()) {
      const a = await xFetch('POST', `${v2}/${id}/append`, { multipart: { media, segment_index: String(i) } });
      if (!a.r.ok) throw xFail('append', a);
    }
    const f = await xFetch('POST', `${v2}/${id}/finalize`);
    if (!f.r.ok) throw xFail('finalize', f);
    info = f.j.data && f.j.data.processing_info;
    status = async () => { const s = await xFetch('GET', v2, { query: { command: 'STATUS', media_id: id } }); if (!s.r.ok) throw xFail('status', s); return s.j.data && s.j.data.processing_info; };
  } else if ([401, 403, 404].includes(init.r.status)) {
    const v1 = 'https://upload.x.com/1.1/media/upload.json';
    const i1 = await xFetch('POST', v1, { form: { command: 'INIT', total_bytes: String(bytes.length), media_type: 'video/mp4', media_category: 'tweet_video' } });
    if (!i1.r.ok) throw xFail(`upload (v2 said ${init.r.status}, v1.1 said)`, i1);
    id = i1.j.media_id_string;
    for (const [i, media] of chunks.entries()) {
      const a = await xFetch('POST', v1, { multipart: { command: 'APPEND', media_id: id, segment_index: String(i), media } });
      if (!a.r.ok) throw xFail('append', a);
    }
    const f = await xFetch('POST', v1, { form: { command: 'FINALIZE', media_id: id } });
    if (!f.r.ok) throw xFail('finalize', f);
    info = f.j.processing_info;
    status = async () => { const s = await xFetch('GET', v1, { query: { command: 'STATUS', media_id: id } }); if (!s.r.ok) throw xFail('status', s); return s.j.processing_info; };
  } else throw xFail('upload', init);
  const until = Date.now() + 5 * 60e3;
  while (info && info.state !== 'succeeded') {
    if (info.state === 'failed') throw new Error(`X could not process the clip: ${JSON.stringify(info.error || info).slice(0, 300)}`);
    if (Date.now() > until) throw new Error('X was still processing the clip after five minutes');
    await sleep(Math.max(1, info.check_after_secs || 5) * 1000);
    info = await status();
  }
  return id;
}
async function postX(p) {
  const text = p.fm.link && !p.body.includes(p.fm.link) ? `${p.body}\n\n${p.fm.link}` : p.body;
  const json = { text };
  if (p.fm.video) json.media = { media_ids: [await uploadXVideo(p.fm.video)] };
  const res = await xFetch('POST', 'https://api.x.com/2/tweets', { json });
  if (!res.r.ok) throw xFail('post', res);
  return `https://x.com/i/web/status/${res.j.data.id}`;
}

// ---- Facebook Page and Instagram: the Graph API ----------------------------------------------------
const GRAPH = 'https://graph.facebook.com/v21.0';
async function graph(pathPart, params, host = GRAPH) {
  const r = await fetch(`${host}/${pathPart}`, { method: 'POST', body: new URLSearchParams(params) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`Meta answered ${r.status}: ${JSON.stringify(j.error || j).slice(0, 300)}`);
  return j;
}
async function graphGet(pathPart, params) {
  const r = await fetch(`${GRAPH}/${pathPart}?${new URLSearchParams(params)}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`Meta answered ${r.status}: ${JSON.stringify(j.error || j).slice(0, 300)}`);
  return j;
}
async function postFacebook(p) {
  if (p.fm.video) {
    // A Page video takes no link field, so the link rides in the description.
    const description = p.fm.link && !p.body.includes(p.fm.link) ? `${p.body}\n\n${p.fm.link}` : p.body;
    const j = await graph(`${env.META_PAGE_ID}/videos`, { file_url: videoUrl(p.fm.video), description, access_token: env.META_PAGE_TOKEN }, 'https://graph-video.facebook.com/v21.0');
    return `https://facebook.com/${j.id}`;
  }
  const j = await graph(`${env.META_PAGE_ID}/feed`, { message: p.body, ...(p.fm.link ? { link: p.fm.link } : {}), access_token: env.META_PAGE_TOKEN });
  return `https://facebook.com/${j.id}`;
}
async function postInstagram(p) {
  const caption = p.fm.link && !p.body.includes(p.fm.link) ? `${p.body}\n\n${p.fm.link.replace(/^https:\/\//, '').replace(/\?.*$/, '')}` : p.body;
  const media = p.fm.video
    ? { media_type: 'REELS', video_url: videoUrl(p.fm.video), share_to_feed: 'true' }
    : { image_url: p.fm.image };
  const c = await graph(`${env.IG_USER_ID}/media`, { ...media, caption, access_token: env.META_PAGE_TOKEN });
  // A Reel is fetched and processed before it can be published. That takes seconds to a few minutes.
  if (p.fm.video) for (let t = Date.now(); ;) {
    const s = await graphGet(c.id, { fields: 'status_code,status', access_token: env.META_PAGE_TOKEN });
    if (s.status_code === 'FINISHED') break;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error(`Instagram could not process the clip: ${s.status || s.status_code}`);
    if (Date.now() - t > 5 * 60e3) throw new Error('Instagram was still processing the clip after five minutes');
    await sleep(10e3);
  }
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
