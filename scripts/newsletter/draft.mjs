/* The drafting agent. Reads what shipped since the last issue, has Claude write
 * the newsletter, and saves it for a person to approve. It never sends to the list:
 * send.mjs does that, in a separate job that waits for the approval.
 *
 *   node scripts/newsletter/draft.mjs            (in CI: .github/workflows/newsletter.yml)
 *
 * env:
 *   ANTHROPIC_API_KEY                          required
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE        where the last issue left off (optional:
 *                                              without them it reads the last 30 days)
 *   RESEND_API_KEY                             to mail the preview (optional)
 *   NEWSLETTER_PREVIEW_TO                      default runthegames@outlook.com
 *   NEWSLETTER_POSTAL_ADDRESS                  printed in the footer (see send.mjs)
 *   SINCE                                      a commit or tag to start from, overriding the above
 *   NOTES                                      what you want said, in your words; it leads
 *   OUT                                        output directory, default newsletter-draft
 *
 * ONLY COMMITS THAT TOUCH A LAUNCHED GAME ARE READ. games.json is that list. This
 * repo carries several unreleased games, and a commit about one of them must not
 * turn into a paragraph in somebody's inbox, so the filter is on the paths a
 * commit changed rather than on anything the model is asked to avoid.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { ALL, renderHtml, renderText, scrub } from './render.mjs';

const env = process.env;
const OUT = env.OUT || 'newsletter-draft';
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 << 20 }).trim();

async function lastIssueSha() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) return null;
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/newsletter_issues?select=commit_sha&order=sent_at.desc&limit=1`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE}` },
  });
  if (!r.ok) throw new Error(`reading newsletter_issues: ${r.status} ${await r.text()}`);
  const rows = await r.json();
  return (rows[0] && rows[0].commit_sha) || null;
}

function commitsSince(base) {
  const range = base ? [`${base}..HEAD`] : ['--since=30.days'];
  const raw = git('log', '--no-merges', '--date=short', '--name-only', '--format=%x1e%h%x1f%ad%x1f%s%x1f%b%x1f', ...range);
  const dirs = ALL.map((g) => g.dir);
  const out = [];
  for (const rec of raw.split('\x1e').filter((r) => r.trim())) {
    const [sha, date, subject, bodyRaw, filesRaw] = rec.split('\x1f');
    const files = (filesRaw || '').split('\n').map((f) => f.trim()).filter(Boolean);
    const games = [...new Set(files.map((f) => f.split('/')[0]).filter((d) => dirs.includes(d)))];
    if (!games.length) continue;
    const body = (bodyRaw || '').replace(/Co-Authored-By:.*|Claude-Session:.*/g, '').trim().slice(0, 1200);
    out.push({ sha, date, subject, body, games });
  }
  return out;
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['subject', 'preheader', 'intro', 'sections', 'outro'],
  properties: {
    subject: { type: 'string', description: 'Email subject, under 60 characters.' },
    preheader: { type: 'string', description: 'One line shown after the subject in the inbox list, under 90 characters.' },
    intro: { type: 'string', description: 'Two or three short sentences.' },
    sections: {
      type: 'array',
      description: 'One per game that got something worth telling a player about, biggest first. At most five.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['game', 'headline', 'body'],
        properties: {
          game: { type: 'string', enum: ALL.map((g) => g.name) },
          headline: { type: 'string', description: 'Under 70 characters.' },
          body: { type: 'string', description: 'Two to four short sentences for a player.' },
        },
      },
    },
    outro: { type: 'string', description: 'One or two sentences to sign off.' },
  },
};

const SYSTEM = `You write the RunThe.GG release newsletter. RunThe.GG is a free site of browser sports games. Readers are players who asked for an email when something big ships.

Write about what a PLAYER will notice: new games, new modes, new features, big changes to how a game plays or looks. Leave out fixes nobody would notice, internal tooling, tests, data refreshes, cache versions, checkers and anything about how the code works. If a change was a bug a player would have hit, one short line saying it is fixed is fine.

Use only the facts in the commits you are given. Never invent a feature, a number, a date or a quote. If the commits do not support a claim, leave the claim out. Only write about the games you are given.

Voice: a friendly sports fan talking to a friend. Short sentences, contractions, plain words. Hype is for genuinely big moments only. No emoji. Never use an em dash or an en dash; use a comma, a colon, a full stop or parentheses instead.`;

async function main() {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
  const base = env.SINCE || await lastIssueSha();
  const commits = commitsSince(base);
  const head = git('rev-parse', 'HEAD');
  console.log(`reading ${commits.length} commits since ${base || 'the last 30 days'} (head ${head.slice(0, 7)})`);
  if (!commits.length && !env.NOTES) {
    throw new Error('nothing shipped to a launched game since the last issue, and no NOTES were given');
  }

  const games = ALL.map((g) => `- ${g.name} (${g.dir === 'index.html' ? 'the home page' : g.dir + '/'})`).join('\n');
  const log = commits.map((c) => `[${c.date}] ${c.games.join(', ')}: ${c.subject}\n${c.body}`).join('\n\n').slice(0, 150000);
  const user = `The games you may write about:\n${games}\n\n`
    + (env.NOTES ? `The owner's notes for this issue. Lead with these:\n${env.NOTES}\n\n` : '')
    + `What shipped since the last issue, as commit messages (the directory names say which game each touched):\n\n${log || '(no commits: write from the notes alone)'}`;

  const client = new Anthropic();
  const res = await client.beta.messages.create({
    model: 'claude-opus-5',
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    messages: [{ role: 'user', content: user }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
  });
  if (res.stop_reason === 'refusal') throw new Error(`the model declined: ${JSON.stringify(res.stop_details)}`);
  if (res.stop_reason === 'max_tokens') throw new Error('the draft ran out of room');
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const { issue, dashes } = scrub(JSON.parse(text));
  if (!issue.sections.length) throw new Error('the draft has no sections');

  const postal = env.NEWSLETTER_POSTAL_ADDRESS || '[postal address goes here before sending]';
  const html = renderHtml(issue, { postal });
  const txt = renderText(issue, { postal });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/issue.json`, JSON.stringify({ ...issue, commit_sha: head, commits: commits.length }, null, 2));
  writeFileSync(`${OUT}/issue.html`, html);
  writeFileSync(`${OUT}/issue.txt`, txt);
  console.log(`subject: ${issue.subject}`);
  console.log(`${issue.sections.length} sections; ${dashes} dash(es) replaced`);

  if (env.RESEND_API_KEY) {
    const to = env.NEWSLETTER_PREVIEW_TO || 'runthegames@outlook.com';
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.NEWSLETTER_FROM || 'RunThe.GG <news@runthe.gg>',
        to: [to],
        subject: `[PREVIEW] ${issue.subject}`,
        html: html.replaceAll('{{UNSUB_URL}}', 'https://runthe.gg/'),
        text: txt.replaceAll('{{UNSUB_URL}}', 'https://runthe.gg/'),
      }),
    });
    if (!r.ok) throw new Error(`preview email failed: ${r.status} ${await r.text()}`);
    console.log(`preview mailed to ${to}`);
  }
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
