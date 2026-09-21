/* The hub at /fantasy.
 *
 * NEVER SERVED DIRECTLY. functions/fantasy/[[path]].js answers 404 for every
 * path under /fantasy, so this file is reachable only through
 * /api/fantasy/app?view=hub, which verifies a Supabase session against the
 * allowlist before it sends a byte. See that endpoint's header.
 *
 * It is a module with one export. The gate imports it from a Blob URL and
 * calls render(), which takes the document apart and rebuilds it: the body it
 * arrives in is the site's own 404 page, and leaving any of that behind would
 * mean a member reading "That page took a mulligan" above their tools.
 */

/* The site's palette, as used by 404.html and the homepage. Copied rather than
 * imported because this site has no shared stylesheet and no design tokens
 * module: every page carries its own <style>. Copying is the convention here,
 * not a shortcut past one. */
const CSS = `
  :root {
    --bg-1:#0b1a2c; --bg-2:#081120; --ink:#eaf1f8; --dim:#9bb0c6; --dim-2:#6f829a;
    --line:rgba(255,255,255,.16); --panel:rgba(255,255,255,.04);
    --cyan:#66D3DE; --green:#6EE84E; --warn:#f0a44a; --bad:#e8604e;
  }
  * { box-sizing:border-box; }
  body {
    margin:0; min-height:100vh; padding:0 16px 64px;
    font-family:'Archivo',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
    background:linear-gradient(180deg,var(--bg-1),var(--bg-2)); color:var(--ink);
  }
  .wrap { max-width:720px; margin:0 auto; }
  header { padding:28px 0 8px; }
  .eyebrow {
    font-size:11.5px; letter-spacing:.14em; text-transform:uppercase;
    color:var(--dim-2); margin:0 0 6px;
  }
  h1 { font-size:30px; line-height:1.15; margin:0 0 8px; letter-spacing:.01em; }
  .lede { color:var(--dim); font-size:15px; line-height:1.6; margin:0 0 4px; }

  .tools { display:grid; gap:12px; margin:24px 0 0; }
  a.tool {
    display:block; padding:16px 18px; border-radius:12px; text-decoration:none;
    border:1px solid var(--line); background:var(--panel); color:var(--ink);
  }
  a.tool:hover { border-color:var(--cyan); }
  a.tool[aria-disabled="true"] { opacity:.55; pointer-events:none; }
  .tool h2 { font-size:17px; margin:0 0 4px; }
  .tool p { font-size:13.5px; color:var(--dim); margin:0; line-height:1.55; }
  .tag {
    display:inline-block; margin-left:8px; padding:2px 7px; border-radius:999px;
    font-size:10.5px; letter-spacing:.08em; text-transform:uppercase;
    border:1px solid var(--line); color:var(--dim-2); vertical-align:2px;
  }

  .strip {
    margin:24px 0 0; padding:12px 14px; border-radius:10px;
    border:1px solid var(--line); background:var(--panel);
    font-size:12.5px; color:var(--dim); line-height:1.6;
  }
  .strip b { color:var(--ink); font-weight:700; }
  .dot { display:inline-block; width:7px; height:7px; border-radius:50%; margin-right:7px; }
  .ok   .dot { background:var(--green); }
  .warn .dot { background:var(--warn); }
  .bad  .dot { background:var(--bad); }

  footer { margin:32px 0 0; font-size:11.5px; color:var(--dim-2); line-height:1.7; }
  footer a { color:var(--dim); }
`;

/* WHAT THE SHELL SAYS ABOUT FRESHNESS BEFORE THERE IS ANY DATA TO BE FRESH.
 *
 * The brief puts freshness on every screen and says a stale number must look
 * stale. The trap is that a screen with no data at all reads as a screen whose
 * data is fine, because there is nothing on it looking wrong. So the hub
 * carries the state of the pipeline itself from the very first version, and it
 * says "nothing has run yet" rather than showing an empty page.
 *
 * Three states, not two, which is the shape this repo's auth clients already
 * use: never run, ran and failed, ran and worked. "No answer yet" and "the
 * answer is bad" need different sentences. */
function pipelineStrip(state) {
  if (!state) {
    return `<div class="strip warn"><span class="dot"></span>
      <b>The odds pipeline has not run yet.</b> Nothing here is live.
      Nothing is polling, so no number on any tool would be a market price.</div>`;
  }
  return `<div class="strip ok"><span class="dot"></span>
      <b>Last successful pull ${esc(state.ago)}.</b>
      ${esc(String(state.credits))} of ${esc(String(state.cap))} credits used this month.</div>`;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

export function render(doc) {
  doc.title = 'Run The Fantasy League';

  const style = doc.createElement('style');
  style.textContent = CSS;

  /* The 404 body arrives with its own <style> in the head and its own markup
     in the body. Both go. Replacing only the body would leave the 404's rules
     cascading over this page, and they set a flex centring on body that would
     put the whole hub in the middle of the viewport. */
  doc.head.querySelectorAll('style').forEach((n) => n.remove());
  doc.head.appendChild(style);

  doc.body.className = '';
  doc.body.innerHTML = `
    <div class="wrap">
      <header>
        <p class="eyebrow">RunThe.GG</p>
        <h1>Run The Fantasy League</h1>
        <p class="lede">Projections built from live sportsbook lines. When a line
          moves, the number moves. Not on a Thursday content cycle.</p>
      </header>

      <div class="tools">
        <a class="tool" href="/fantasy/start-sit">
          <h2>Start / Sit<span class="tag">in build</span></h2>
          <p>Who scores more, and how often. A probability and an expected
             margin, not a ranking.</p>
        </a>
        <a class="tool" href="/fantasy/trade" aria-disabled="true">
          <h2>Trade Analyzer<span class="tag">not started</span></h2>
          <p>What a trade does to your championship odds, and to your
             variance. Built after Start / Sit.</p>
        </a>
      </div>

      ${pipelineStrip(null)}

      <footer>
        Private development build. Not linked, not indexed, and gated on an
        account allowlist.<br>
        Player data from <a href="https://github.com/nflverse" rel="noopener">nflverse</a>,
        used under CC BY 4.0. Odds via The Odds API.
      </footer>
    </div>`;
}
