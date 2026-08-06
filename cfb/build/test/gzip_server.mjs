/* A static server that gzips the way GitHub Pages gzips.
 *
 *   node cfb/build/test/gzip_server.mjs        serves the repo root on 8081
 *
 * Not a test. python3 -m http.server sends everything uncompressed, and the game
 * ships a 5MB player file that goes over the wire at 727K. Measuring a cold visit
 * against an uncompressed server measures a page nobody is served, so the launch
 * suite measures against this instead.
 */
import http from 'node:http';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
const ROOT=process.cwd();
const TYPES={'.html':'text/html','.js':'application/javascript','.json':'application/json',
  '.png':'image/png','.woff2':'font/woff2','.xml':'application/xml','.txt':'text/plain',
  '.webmanifest':'application/manifest+json','.csv':'text/csv','.svg':'image/svg+xml'};
http.createServer((req,res)=>{
  let u=decodeURIComponent(req.url.split('?')[0]);
  if(u.endsWith('/')) u+='index.html';
  const f=path.join(ROOT,u);
  if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end('no');}
  const ext=path.extname(f); const buf=fs.readFileSync(f);
  const compressible=/\.(html|js|json|xml|txt|csv|svg|webmanifest)$/.test(f);
  const h={'Content-Type':TYPES[ext]||'application/octet-stream','Cache-Control':'no-store'};
  if(compressible&&/gzip/.test(req.headers['accept-encoding']||'')){
    const gz=zlib.gzipSync(buf,{level:6});
    res.writeHead(200,Object.assign(h,{'Content-Encoding':'gzip','Content-Length':gz.length}));
    return res.end(gz);
  }
  res.writeHead(200,Object.assign(h,{'Content-Length':buf.length}));
  res.end(buf);
}).listen(8081,()=>console.log('gzip server on 8081'));
