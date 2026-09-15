/* A dry ball is never DRAWN in the water, and never rolls across it.
 *
 *   (nohup python3 -m http.server 8099 &)
 *   node golf/check-water.mjs
 *
 * Owner: "balls that are bouncing off of water or bouncing in water. The ball should either avoid the
 * water altogether or it goes in the water and the player takes a drop."
 *
 * The engine already decides the water: a shot that finds it carries lie 'water' and is followed by a
 * penalty drop, and the score comes out of that. Everything here is about the DRAWING, which is
 * computed from geometry the engine never saw, so the two can disagree and nothing throws.
 *
 * WHAT IS MEASURED, against the shape the PAINTER fills blue (g.wet), not against the plain ellipse:
 *
 *   REST    where the ball stops. A dry lie drawn in a pond is the ball sitting on water.
 *   LAND    where it touches down. A dry lie landing in a pond is the bounce the owner saw.
 *   ROLL    the straight line from land to rest. Both ends can be dry with the pond in between, which
 *           is a ball rolling ACROSS water, and no endpoint test can see it.
 *
 * The roll is the one nothing had ever looked at. The other two were guarded, against a pond that was
 * a plain ellipse pushed out to 1.06 of its radius, while the painted shore modulates out to 1.30 of
 * it: every bulge between those two numbers was land to the tracer and water to the painter.
 *
 * Holes are generated, not stated: every hole of every daily course, at four skill levels, through the
 * real dShotSeq and the real hvPlots.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const HOST = process.env.HOST || 'http://localhost:8099';
const SRC = ROOT + '/golf/index.html';
const PROBE = ROOT + '/golf/__test_water.html';

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++;
  console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + JSON.stringify(x).slice(0, 230) : '')); };
const head = (t) => console.log('\n' + t + '\n' + '-'.repeat(t.length));
const pct = (n, d) => (100 * n / Math.max(1, d)).toFixed(2) + '%';

const HOOK = `
window.__W = {
  sweep(){
    var out={holes:0, wet:0, shots:0, dry:0, restIn:0, landIn:0, rollIn:0, ex:[], worst:0,
             hzd:0, hzdIn:0, hzdEx:[], drops:0, dropIn:0};
    var keys=Object.keys(DAILY_COURSES);
    var skills=[46, 66, 82, 94];
    for(var si=0; si<skills.length; si++){
      var sk={}; CATS.forEach(function(c){ sk[c.k]=skills[si]; });
      for(var ci=0; ci<keys.length; ci++){
        var ck=keys[ci], holes=(DAILY_COURSES[ck]||{}).holes||[];
        for(var h=0; h<holes.length; h++){
          var par=holes[h][0], yards=holes[h][1]||400;
          var seedN=(dHash(ck||'x')^Math.imul((h|0)+1,0x9e3779b1))>>>0;
          var g; try{ g=hvGeom(seedN, par, yards, ck, h); }catch(e){ continue; }
          out.holes++;
          if(!g.water && !g.creek) continue;
          out.wet++;
          // every score this hole can post, so the sweep sees the shot shapes the mode really makes
          for(var strokes=Math.max(1,par-2); strokes<=par+3; strokes++){
            var rng=mulberry32(((seedN^Math.imul(strokes+1,0x85ebca6b)^Math.imul(si+1,0x27d4eb2f))>>>0));
            var shots; try{ shots=dShotSeq(par,yards,strokes,rng,sk,{}); }catch(e){ continue; }
            if(!shots||!shots.length) continue;
            var plots; try{ plots=hvPlots(g, shots, seedN); }catch(e){ continue; }
            for(var i=0;i<plots.length;i++){
              var p=plots[i], s=shots[i]||{};
              out.shots++;
              /* THE OTHER HALF OF THE OWNER'S SENTENCE. A shot the engine put IN the water has to be
                 drawn in it, or the penalty stroke on the card has nothing on screen to explain it. The
                 nearest-dry-ground search must never touch one of these, and the drop that follows must
                 land on grass. */
              if(s.lie==='water'){ out.hzd++;
                if(p.rest && g.wet(p.rest[0],p.rest[1], -1)) out.hzdIn++;
                else if(out.hzdEx.length<3) out.hzdEx.push({course:ck, hole:h+1, rest:p.rest});
                continue; }
              if(s.lie==='drop' || p.k==='pen'){ out.drops++;
                if(p.rest && g.wet(p.rest[0],p.rest[1])) out.dropIn++;
                continue; }
              out.dry++;
              var rIn=p.rest && g.wet(p.rest[0],p.rest[1]);
              var lIn=p.land && g.wet(p.land[0],p.land[1]);
              // the ROLL, sampled along its length: both ends dry with the pond between them is a ball
              // rolling over water, and it is invisible to any test of the two endpoints
              var rollIn=false, deepest=0;
              if(p.land && p.rest){
                // six samples a yard: the test has to be STRICTER than the guard it is checking, or a
                // thin arm of a pond between two of the guard's samples reads as a pass
                var N=Math.max(32, Math.ceil(Math.hypot(p.rest[0]-p.land[0], p.rest[1]-p.land[1])*6));
                for(var t=0;t<=N;t++){
                  var f=t/N, x=p.land[0]+(p.rest[0]-p.land[0])*f, y=p.land[1]+(p.rest[1]-p.land[1])*f;
                  if(g.wet(x,y)){ rollIn=true; deepest++; }
                }
              }
              if(rIn) out.restIn++;
              if(lIn) out.landIn++;
              if(rollIn) out.rollIn++;
              if(deepest>out.worst) out.worst=deepest;
              if((rIn||lIn||rollIn) && out.ex.length<6)
                out.ex.push({course:ck, hole:h+1, par:par, k:p.k, lie:s.lie||null,
                  rest:rIn?1:0, land:lIn?1:0, roll:rollIn?1:0});
            }
          }
        }
      }
    }
    return out;
  },
  /* THE SHAPE THE TRACER TESTS AGAINST THE SHAPE THE PAINTER FILLS. One function serves both now, so
     this samples the pond's own neighbourhood and reports how far the painted shore actually reaches,
     which is the number the old plain-ellipse guard was blind to. */
  shore(){
    var keys=Object.keys(DAILY_COURSES), maxR=0, minR=9, n=0;
    for(var ci=0; ci<keys.length; ci++){
      var ck=keys[ci], holes=(DAILY_COURSES[ck]||{}).holes||[];
      for(var h=0; h<holes.length; h++){
        var seedN=(dHash(ck||'x')^Math.imul((h|0)+1,0x9e3779b1))>>>0;
        var g; try{ g=hvGeom(seedN, holes[h][0], holes[h][1]||400, ck, h); }catch(e){ continue; }
        if(!g.water) continue;
        n++;
        for(var a=0;a<64;a++){
          var th=a/64*6.283, x=g.water.x+Math.cos(th)*g.water.rx, y=g.water.y+Math.sin(th)*g.water.ry;
          var m=g.wMod(x,y);
          if(m>maxR) maxR=m; if(m<minR) minR=m;
        }
      }
    }
    return {ponds:n, maxR:+maxR.toFixed(3), minR:+minR.toFixed(3)};
  }
};
`;

function buildProbe() {
  const src = fs.readFileSync(SRC, 'utf8');
  const re = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m, best = null;
  while ((m = re.exec(src))) { if (!best || m[1].length > best[1].length) best = m; }
  const at = best.index + best[0].length - '</script>'.length;
  fs.writeFileSync(PROBE, src.slice(0, at) + '\n' + HOOK + '\n' + src.slice(at));
}

const run = async () => {
  buildProbe();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.addInitScript(() => { try { localStorage.setItem('bag_tour_done', 'true'); } catch (e) {} });
  await page.goto(HOST + '/golf/__test_water.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('!!window.__W', null, { timeout: 20000 });

  head('the pond the player sees is not the ellipse');
  const sh = await page.evaluate(() => window.__W.shore());
  console.log(`    ${sh.ponds} ponds, sampled around each one`);
  console.log(`    the painted shore reaches ${sh.maxR.toFixed(2)} of the ellipse radius and pulls in to ${sh.minR.toFixed(2)}`);
  ok('the shore really does bulge past the old 1.06 guard, which is why this file exists',
    sh.maxR > 1.06, sh.maxR);

  const r = await page.evaluate(() => window.__W.sweep());
  await browser.close();

  head('the sample');
  console.log(`    ${r.holes} holes, ${r.wet} of them with a pond or a creek`);
  console.log(`    ${r.shots} plotted shots, ${r.dry} of them on a DRY lie`);
  ok('there is enough of it to measure', r.dry > 5000, r.dry);

  head('a dry ball is never drawn in the water');
  console.log(`    resting in the painted water: ${r.restIn}   (${pct(r.restIn, r.dry)})`);
  console.log(`    touching down in it:          ${r.landIn}   (${pct(r.landIn, r.dry)})`);
  console.log(`    rolling across it:            ${r.rollIn}   (${pct(r.rollIn, r.dry)})`);
  if (r.ex.length) console.log(`    e.g. ${JSON.stringify(r.ex.slice(0, 3))}`);
  ok('no dry shot comes to rest in the water', r.restIn === 0, { n: r.restIn, examples: r.ex.filter(e => e.rest).slice(0, 3) });
  ok('none touches down in it either, so nothing bounces on a pond',
    r.landIn === 0, { n: r.landIn, examples: r.ex.filter(e => e.land).slice(0, 3) });
  ok('and none rolls across it between the two',
    r.rollIn === 0, { n: r.rollIn, examples: r.ex.filter(e => e.roll).slice(0, 3) });

  head('and a ball that DOES find the water is drawn in it');
  console.log(`    shots the engine put in a hazard: ${r.hzd}, drawn in the painted water: ${r.hzdIn}   (${pct(r.hzdIn, r.hzd)})`);
  console.log(`    penalty drops: ${r.drops}, of those drawn in the water: ${r.dropIn}`);
  ok('there are some, so the case is really being exercised', r.hzd > 200, r.hzd);
  ok('a water ball is in the water, not nudged onto the bank by the dry-ball guard',
    r.hzdIn / Math.max(1, r.hzd) > 0.97, { in: r.hzdIn, of: r.hzd, examples: r.hzdEx });
  ok('and the drop that follows it is on grass', r.dropIn === 0, r.dropIn);

  head('page errors');
  ok('none', errs.length === 0, errs.slice(0, 2));
};

try { await run(); } finally { try { fs.unlinkSync(PROBE); } catch (e) {} }
console.log('\n' + (bad ? bad + ' FAILED' : 'all good'));
process.exit(bad ? 1 : 0);
