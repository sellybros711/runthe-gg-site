const path = require('path'); const fs = require('fs'); const http = require('http');
const pw = require('/opt/node-tools/node_modules/playwright');
// Renders stadium-only stills for the title screen background. Dev tool, not shipped.
// node shut-the-door/lab/home-stills/run.cjs <specs.json> [out-dir]   (out-dir defaults to this folder)
const ROOT = path.resolve(__dirname, '../../..');
const H = __dirname;
const OUT = process.argv[3] ? path.resolve(process.argv[3]) : H;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.hdr': 'application/octet-stream', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = rel.startsWith('/__h/') ? path.join(H, rel.slice(5)) : path.join(ROOT, rel);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  const specs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console', m.text().slice(0, 200)); });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(`http://127.0.0.1:${port}/__h/harness.html`);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 120000 });
  for (const s of specs) {
    const t0 = Date.now();
    const url = await page.evaluate(([spec, w, h]) => window.render(spec, w, h), [s.spec, s.w, s.h]);
    fs.writeFileSync(path.join(OUT, s.name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
    console.log(s.name, Date.now() - t0, 'ms');
  }
  await browser.close(); server.close();
});
