/* Turns an issue (the JSON the drafting agent writes) into the email.
 *
 * The model writes WORDS and nothing else. Every tag in the email comes from
 * this file and every word from the model is escaped on the way in, so a draft
 * cannot put markup, a script or a stray link into anybody's inbox. The only
 * links are the ones below: each section's game, taken from games.json by
 * name rather than from the model, and the unsubscribe link.
 *
 * {{UNSUB_URL}} is left in place and filled per recipient by send.mjs. The
 * preview gets a dummy.
 */
import { readFileSync } from 'node:fs';

const GAMES = JSON.parse(readFileSync(new URL('./games.json', import.meta.url), 'utf8'));
export const ALL = [...GAMES.games, GAMES.site];
const urlFor = (name) => (ALL.find((g) => g.name === name) || GAMES.site).url;

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* The site's copy has no em or en dashes (CLAUDE.md). The prompt asks for none;
   this is the backstop, and the preview reports how many it caught. */
export function scrub(issue) {
  let n = 0;
  const long = new RegExp('\\s*[' + String.fromCharCode(0x2014, 0x2013) + ']\\s*', 'g');
  const fix = (s) => String(s || '').replace(long, () => { n++; return ', '; });
  const out = {
    subject: fix(issue.subject), preheader: fix(issue.preheader), intro: fix(issue.intro), outro: fix(issue.outro),
    sections: (issue.sections || []).map((s) => ({ game: s.game, headline: fix(s.headline), body: fix(s.body) })),
  };
  return { issue: out, dashes: n };
}

export function renderHtml(issue, { postal }) {
  const para = (t) => esc(t).split(/\n{2,}/).map((p) =>
    `<p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#2b3445">${p.replace(/\n/g, '<br>')}</p>`).join('');
  const sections = issue.sections.map((s) => `
<tr><td style="padding:0 32px 26px">
  <div style="font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#2f9a1f;margin:0 0 6px">${esc(s.game)}</div>
  <div style="font-size:20px;font-weight:800;line-height:1.3;color:#0b1220;margin:0 0 8px">${esc(s.headline)}</div>
  ${para(s.body)}
  <a href="${esc(urlFor(s.game))}" style="display:inline-block;background:#46bd30;color:#05220b;font-weight:800;font-size:14px;text-decoration:none;padding:11px 18px;border-radius:10px">Play ${esc(s.game)}</a>
</td></tr>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(issue.subject)}</title></head>
<body style="margin:0;padding:0;background:#eef1f6">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(issue.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f6"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<tr><td style="background:#060a13;padding:26px 32px">
  <a href="https://runthe.gg/" style="text-decoration:none"><img src="https://runthe.gg/assets/wm-runthegg.png?v=1" width="170" alt="RunThe.GG" style="display:block;border:0;height:auto"></a>
  <div style="font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#8af06a;margin-top:14px">Release news</div>
</td></tr>
<tr><td style="padding:28px 32px 8px">
  <div style="font-size:26px;font-weight:900;line-height:1.2;color:#0b1220;margin:0 0 14px">${esc(issue.subject)}</div>
  ${para(issue.intro)}
</td></tr>
${sections}
<tr><td style="padding:0 32px 28px">${para(issue.outro)}</td></tr>
<tr><td style="padding:22px 32px;background:#f5f7fb;border-top:1px solid #e3e8f0;font-size:12px;line-height:1.6;color:#6b7890">
  You are getting this because you asked for RunThe.GG release news.
  <a href="{{UNSUB_URL}}" style="color:#6b7890">Unsubscribe</a> in one tap.<br>
  RunThe.GG · ${esc(postal)}
</td></tr>
</table></td></tr></table></body></html>`;
}

export function renderText(issue, { postal }) {
  const parts = [issue.subject, '', issue.intro, ''];
  for (const s of issue.sections) parts.push(`${s.game.toUpperCase()}: ${s.headline}`, s.body, `Play: ${urlFor(s.game)}`, '');
  parts.push(issue.outro, '', '---', 'Unsubscribe: {{UNSUB_URL}}', `RunThe.GG · ${postal}`);
  return parts.join('\n');
}
