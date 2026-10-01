/* Sends an approved draft to everyone on the list. Run by the `send` job in
 * .github/workflows/newsletter.yml, which only starts after a person approves it.
 *
 * env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE   the list, and where the issue is recorded
 *   RESEND_API_KEY                        the sender
 *   NEWSLETTER_POSTAL_ADDRESS             REQUIRED. US law (CAN-SPAM) wants a physical
 *                                         postal address in every newsletter; a P.O. box
 *                                         or a registered mailbox is fine. It refuses to
 *                                         send without one rather than print a placeholder.
 *   SITE_URL                              default https://runthe.gg (the unsubscribe link)
 *   DRAFT                                 directory holding issue.json, default newsletter-draft
 *   RUN_ID                                makes a re-run of the same job send nothing twice
 *
 * EVERY EMAIL IS ITS OWN, because every one carries that reader's unsubscribe link,
 * both in the footer and in the List-Unsubscribe header Gmail and Outlook turn into
 * their one-click button. Resend's batch endpoint takes a hundred at a time.
 */
import { readFileSync } from 'node:fs';
import { renderHtml, renderText } from './render.mjs';

const env = process.env;
const DRAFT = env.DRAFT || 'newsletter-draft';
const SITE = (env.SITE_URL || 'https://runthe.gg').replace(/\/+$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function need(k) { if (!env[k]) throw new Error(`${k} is not set`); return env[k]; }

async function subscribers() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${need('SUPABASE_URL')}/rest/v1/newsletter_subscribers?status=eq.active&select=email,unsub_token&order=id`, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE}`, Range: `${from}-${from + 999}` },
    });
    if (!r.ok) throw new Error(`reading subscribers: ${r.status} ${await r.text()}`);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

async function main() {
  need('SUPABASE_SERVICE_ROLE'); need('RESEND_API_KEY');
  const postal = need('NEWSLETTER_POSTAL_ADDRESS');
  const issue = JSON.parse(readFileSync(`${DRAFT}/issue.json`, 'utf8'));
  const html = renderHtml(issue, { postal });
  const text = renderText(issue, { postal });
  const list = await subscribers();
  console.log(`sending "${issue.subject}" to ${list.length} subscriber(s)`);
  if (!list.length) { console.log('nobody to send to'); return; }

  let sent = 0;
  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100).map((s) => {
      const unsub = `${SITE}/api/newsletter/unsubscribe?t=${s.unsub_token}`;
      return {
        from: env.NEWSLETTER_FROM || 'RunThe.GG <news@runthe.gg>',
        reply_to: env.NEWSLETTER_REPLY_TO || 'runthegames@outlook.com',
        to: [s.email],
        subject: issue.subject,
        html: html.replaceAll('{{UNSUB_URL}}', unsub),
        text: text.replaceAll('{{UNSUB_URL}}', unsub),
        headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      };
    });
    const r = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `rtg-news-${env.RUN_ID || issue.commit_sha}-${i}`,
      },
      body: JSON.stringify(chunk),
    });
    if (!r.ok) throw new Error(`batch at ${i} failed: ${r.status} ${await r.text()} (${sent} already sent)`);
    sent += chunk.length;
    console.log(`  ${sent}/${list.length}`);
    await sleep(600);
  }

  const rec = await fetch(`${env.SUPABASE_URL}/rest/v1/newsletter_issues`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_SERVICE_ROLE, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ subject: issue.subject, commit_sha: issue.commit_sha, recipients: sent }),
  });
  if (!rec.ok) console.warn(`sent, but could not record the issue: ${rec.status} ${await rec.text()}`);
  console.log(`done: ${sent} sent`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
