/* Trade Analyzer at /fantasy/trade.
 *
 * NEVER SERVED DIRECTLY. See fantasy/app/hub.js and
 * functions/api/fantasy/app.js for why this file is only reachable through a
 * server-verified endpoint.
 *
 * A PLACEHOLDER, AND IT SAYS SO ON THE SCREEN. The route, the gate and the
 * delivery path are real and tested; the tool is not built. A shell that
 * looked finished and showed nothing would be the exact dishonesty this
 * product is meant to be the opposite of, so it names what is missing.
 */
export function render(doc) {
  doc.title = 'Trade Analyzer';
  doc.head.querySelectorAll('style').forEach((n) => n.remove());
  const s = doc.createElement('style');
  s.textContent = `
    body{margin:0;min-height:100vh;padding:28px 16px;color:#eaf1f8;
      background:linear-gradient(180deg,#0b1a2c,#081120);
      font-family:'Archivo',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;}
    .wrap{max-width:720px;margin:0 auto}
    a{color:#66D3DE}
    h1{font-size:26px;margin:0 0 10px}
    p{color:#9bb0c6;font-size:14.5px;line-height:1.6;margin:0 0 12px}
    .eyebrow{font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;
      color:#6f829a;margin:0 0 6px}`;
  doc.head.appendChild(s);
  doc.body.className = '';
  doc.body.innerHTML = `
    <div class="wrap">
      <p class="eyebrow"><a href="/fantasy">Run The Fantasy League</a></p>
      <h1>Trade Analyzer</h1>
      <p>Not built yet. The route, the gate and the delivery path work, which
         is what this page is currently proving.</p>
      <p>Deliberately after Start / Sit. They share the projection core and it gets proven on the simpler tool first.</p>
    </div>`;
}
