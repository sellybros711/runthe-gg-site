/* Run The Floor: the live ticker.
 *
 * A stretch of the season used to arrive as one line: "At the break: 31-24".
 * This plays it: the games go by on a scoreboard a few a second, the record
 * climbs, your line keeps a running average, and the nights worth stopping
 * for (a career high, a triple-double, forty) stop the clock for a beat.
 * Speed is yours: 1x, 2x, 4x, or skip to the end.
 *
 * NOTHING HERE IS INVENTED. Every game on it is a game career.js played:
 * the opponent, home or away, the result and your line come off
 * L.season.box, which the engine writes as it plays the stretch without
 * drawing anything extra from its seeded rng. There is no score, because
 * the engine settles a game on its odds rather than its points, and a
 * scoreline made up for the ticker would be the one thing on it that was
 * not true. Playoff series show their games the same way.
 *
 * It is a broadcast, so it only plays with scenes on, and reduced motion
 * shows the finished board at once. window.RTF_TICKER: play(data, opts),
 * strip(data), dataFor(L, before).
 */
(function(){
'use strict';
var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches;
var E = window.RTF_ENGINE;
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

var CSS = [
'.tk{position:fixed;inset:0;z-index:89;display:flex;flex-direction:column;justify-content:center;align-items:center;background:rgba(3,5,10,.94);color:#f1f3f8;font-family:var(--body,system-ui);padding:calc(14px + env(safe-area-inset-top,0px)) 14px calc(14px + env(safe-area-inset-bottom,0px));}',
'.tk[hidden]{display:none;}',
'.tk-box{width:min(100%,560px);background:#0b0f1d;padding:14px;box-shadow:0 -3px 0 0 var(--c1),0 3px 0 0 var(--c1),-3px 0 0 0 var(--c1),3px 0 0 0 var(--c1),0 0 0 6px #05070d;}',
'.tk .tk-top{display:flex;align-items:center;gap:8px;margin:0 0 12px;background:none;border:0;border-radius:0;padding:0;}',
'.tk-live{display:inline-flex;align-items:center;gap:6px;font-family:var(--k-f-pixel,"Press Start 2P",var(--display,Impact));font-size:8px;text-transform:uppercase;padding:6px 7px;background:#05070d;}',
'.tk-live i{width:6px;height:6px;background:#ff4b4b;box-shadow:0 0 8px #ff4b4b;animation:tkLive 1.2s steps(2) infinite;}',
'@keyframes tkLive{50%{opacity:.3}}',
'.tk-lab{flex:1 1 auto;min-width:0;font-family:var(--k-f-display,var(--display,Impact));font-size:20px;letter-spacing:.03em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
'.tk-bug{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin:0 0 12px;}',
'.tk-bug div{background:#05070d;padding:8px 6px;text-align:center;}',
'.tk-bug b{display:block;font-family:var(--k-f-display,var(--display,Impact));font-weight:400;font-size:clamp(22px,7vw,32px);line-height:1;color:#ffd166;font-variant-numeric:tabular-nums;}',
'.tk-bug small{display:block;margin-top:4px;font-family:var(--k-f-pixel,var(--display,Impact));font-size:7px;text-transform:uppercase;color:#8fa0d6;}',
'.tk-strip{display:flex;flex-wrap:wrap;gap:3px;margin:0 0 10px;min-height:20px;}',
'.tk-g{width:15px;height:15px;background:#1a2138;position:relative;}',
'.tk-g.w{background:#3ecf8e;box-shadow:inset 0 3px 0 0 #8ff0c2,inset 0 -2px 0 0 #1e8c5b;}',
'.tk-g.l{background:#e5483f;box-shadow:inset 0 3px 0 0 #ff9b92,inset 0 -2px 0 0 #8e2420;}',
'.tk-g.out{opacity:.45;}',
'.tk-g.key:after{content:"";position:absolute;left:5px;top:-5px;width:5px;height:3px;background:#ffd166;}',
'.tk-g.new{animation:tkPop .18s steps(2) both;}',
'@keyframes tkPop{from{transform:scale(1.6)}to{transform:none}}',
'.tk-now{min-height:46px;display:flex;align-items:center;gap:10px;padding:8px 10px;background:#05070d;margin:0 0 12px;font-size:14px;line-height:1.35;}',
'.tk-now b{font-family:var(--k-f-display,var(--display,Impact));font-weight:400;font-size:18px;letter-spacing:.03em;text-transform:uppercase;}',
'.tk-now.key{box-shadow:inset 4px 0 0 0 #ffd166;}',
'.tk-now.key b{color:#ffd166;}',
'.tk-wire{overflow:hidden;white-space:nowrap;font-size:12.5px;color:#cdd6f4;background:#05070d;padding:6px 0;margin:0 0 12px;}',
'.tk-wire span{display:inline-block;padding-left:100%;animation:tkWire 14s steps(140) infinite;}',
'.tk-wire[hidden]{display:none;}',
'@keyframes tkWire{to{transform:translateX(-100%)}}',
'.tk-ctl{display:flex;gap:6px;}',
'.tk-ctl button{flex:1 1 0;min-height:44px;border:0;border-radius:0;background:#18203a;color:#fff;font-family:var(--k-f-pixel,"Press Start 2P",var(--display,Impact));font-size:9px;text-transform:uppercase;box-shadow:0 -2px 0 0 #2d3a66,0 2px 0 0 #2d3a66,-2px 0 0 0 #2d3a66,2px 0 0 0 #2d3a66;cursor:pointer;}',
'.tk-ctl button[aria-pressed="true"]{background:#ffd166;color:#05070d;}',
'.tk-ctl button.go{flex:1.6 1 0;}',
'.tk-ctl button.go.fin{background:#ffd166;color:#05070d;}',
'.tk-ctl button:focus-visible{outline:2px solid #fff;outline-offset:3px;}',
'.cr-tk{margin:12px 0 0;}',
'.cr-tk .tk-strip{margin:6px 0 0;}',
'/* the playoffs: an arena lit in your colours, a board of its own, the bracket */',
'.tk.tk-big{justify-content:flex-start;overflow-y:auto;background:radial-gradient(ellipse 80% 42% at 50% -6%,color-mix(in srgb,var(--c1) 55%,transparent),transparent 72%),radial-gradient(ellipse 60% 30% at 50% 108%,color-mix(in srgb,var(--c1) 28%,transparent),transparent 70%),#03050a;}',
'.tk.tk-big:before{content:"";position:fixed;inset:0;pointer-events:none;background:repeating-linear-gradient(105deg,transparent 0 46px,rgba(255,255,255,.035) 46px 50px,transparent 50px 120px);mask-image:linear-gradient(#000,transparent 60%);-webkit-mask-image:linear-gradient(#000,transparent 60%);}',
'.tk-big .tk-box{position:relative;width:min(100%,640px);margin:auto 0;background:#080b16;box-shadow:0 -4px 0 0 var(--c1),0 4px 0 0 var(--c1),-4px 0 0 0 var(--c1),4px 0 0 0 var(--c1),0 0 0 7px #05070d,0 0 60px color-mix(in srgb,var(--c1) 45%,transparent);}',
'.tk-big .tk-lab{font-size:16px;color:#cdd6f4;}',
'.tks{position:relative;background:linear-gradient(#0d1226,#070a14);padding:10px;margin:0 0 10px;box-shadow:inset 0 0 0 2px #1d2547;}',
'.tks-ban{display:flex;align-items:center;gap:10px;margin:0 0 10px;}',
'.tks-tag{flex:0 0 auto;font-family:var(--k-f-pixel,"Press Start 2P",monospace);font-size:8px;text-transform:uppercase;color:#fff;background:#d62d3a;padding:7px 8px 6px;box-shadow:0 3px 0 0 #7a121b;}',
'.tks-tt{min-width:0;}',
'.tks-tt small{display:block;font-family:var(--k-f-pixel,"Press Start 2P",monospace);font-size:7px;text-transform:uppercase;color:#8fa0d6;margin:0 0 4px;}',
'.tks-tt strong{display:block;font-family:var(--k-f-display,var(--display,Impact));font-weight:400;font-size:clamp(24px,7vw,34px);line-height:.95;text-transform:uppercase;letter-spacing:.02em;color:#fff;}',
'.tks-mu{position:relative;display:grid;grid-template-columns:1fr auto 1fr;align-items:stretch;gap:8px;}',
'.tks-tm{position:relative;background:var(--tc);color:#fff;padding:8px 8px 7px;box-shadow:inset 0 3px 0 0 rgba(255,255,255,.22),inset 0 -4px 0 0 rgba(0,0,0,.32);overflow:hidden;text-shadow:0 2px 0 rgba(0,0,0,.45);}',
'.tks-tm:after{content:"";position:absolute;right:-10px;bottom:-10px;width:38px;height:38px;background:var(--to);opacity:.35;transform:rotate(45deg);}',
'.tks-tm i{font-style:normal;font-family:var(--k-f-pixel,"Press Start 2P",monospace);font-size:8px;opacity:.9;}',
'.tks-tm b{display:block;font-family:var(--k-f-display,var(--display,Impact));font-weight:400;font-size:clamp(26px,8vw,36px);line-height:1;letter-spacing:.02em;}',
'.tks-tm small{display:block;font-size:11px;font-weight:700;opacity:.92;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
'.tks-tm.me{box-shadow:inset 0 3px 0 0 rgba(255,255,255,.22),inset 0 -4px 0 0 rgba(0,0,0,.32),0 0 0 2px #fff;}',
'.tks-sc{display:flex;align-items:center;gap:6px;padding:0 2px;}',
'.tks-sc b{font-family:var(--k-f-display,var(--display,Impact));font-weight:400;font-size:clamp(44px,14vw,62px);line-height:.9;color:#ffd166;font-variant-numeric:tabular-nums;text-shadow:0 3px 0 #6b4a00;}',
'.tks-sc i{font-style:normal;font-family:var(--k-f-pixel,"Press Start 2P",monospace);font-size:6px;text-transform:uppercase;color:#8fa0d6;writing-mode:vertical-rl;transform:rotate(180deg);}',
'.tks-sc.bump b{animation:sbBump .3s steps(3);}',
'@keyframes sbBump{0%{transform:scale(1.35)}100%{transform:none}}',
'.tks-g{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin:10px 0 0;}',
'.tks-c{background:#05070d;padding:5px 2px 4px;text-align:center;box-shadow:inset 0 0 0 1px #1f2747;}',
'.tks-c small,.tks-c em{display:block;font-style:normal;font-family:var(--k-f-pixel,"Press Start 2P",monospace);font-size:6px;text-transform:uppercase;color:#8fa0d6;}',
'.tks-c span{display:block;height:14px;margin:4px auto;width:70%;background:#141b33;}',
'.tks-c.w span{background:#3ecf8e;box-shadow:inset 0 3px 0 0 #8ff0c2,inset 0 -2px 0 0 #1e8c5b;}',
'.tks-c.l span{background:#e5483f;box-shadow:inset 0 3px 0 0 #ff9b92,inset 0 -2px 0 0 #8e2420;}',
'.tks-c.new span{animation:tkPop .22s steps(2) both;}',
'.tks-c.next{box-shadow:inset 0 0 0 2px #ffd166;animation:sbNext .7s steps(2) infinite;}',
'@keyframes sbNext{50%{box-shadow:inset 0 0 0 2px transparent}}',
'.tks-c.na{opacity:.28;}',
'.tks-stamp{position:absolute;left:23%;top:58%;white-space:nowrap;z-index:2;font-family:var(--k-f-display,var(--display,Impact));font-size:19px;line-height:1;text-transform:uppercase;letter-spacing:.04em;padding:5px 8px 3px;border:3px solid currentColor;transform:translate(-50%,-50%) rotate(-7deg);background:rgba(5,7,13,.9);animation:sbStamp .35s steps(3) both;}',
'.tks-stamp[hidden]{display:none;}',
'@keyframes sbStamp{0%{transform:translate(-50%,-50%) rotate(-7deg) scale(2.2);opacity:0}100%{transform:translate(-50%,-50%) rotate(-7deg)}}',
'.tks.won .tks-stamp{color:#3ecf8e;}.tks.lost .tks-stamp{color:#ff6b62;}',
'.tks.lost .tks-tm.me{filter:grayscale(.65) brightness(.8);}',
'.tk-big .tk-now.tense{box-shadow:inset 4px 0 0 0 #ffd166;background:linear-gradient(90deg,rgba(255,209,102,.16),#05070d 60%);}',
'.tk-big .tk-now.tense b{color:#ffd166;animation:tkLive 1s steps(2) infinite;}',
'.tk-big .tk-now.bad{box-shadow:inset 4px 0 0 0 #e5483f;}.tk-big .tk-now.bad b{color:#ff8a82;}',
'.tk-bkw{background:#05070d;padding:8px 6px 9px;margin:0 0 10px;box-shadow:inset 0 0 0 1px #1a2240;}',
'.tkb-head{display:grid;grid-template-columns:3.32fr 1.1fr 3.32fr;font-family:var(--k-f-pixel,"Press Start 2P",monospace);font-size:7px;text-transform:uppercase;color:#8fa0d6;margin:0 0 6px;}',
'.tkb-head span:last-child{text-align:right;}.tkb-head .mid{text-align:center;color:#ffd166;}',
'.tkb{display:grid;grid-template-columns:1.32fr 1fr 1fr 1.1fr 1fr 1fr 1.32fr;gap:3px;min-height:150px;}',
'.tkb-col{display:flex;flex-direction:column;justify-content:space-around;gap:4px;min-width:0;}',
'.tkb-x{position:relative;background:#0c1124;box-shadow:inset 0 0 0 1px #222b50;padding:1px;}',
'.tkb-x.you{box-shadow:inset 0 0 0 1px var(--c1),0 0 0 1px var(--c1);}',
'.tkb-x.live{animation:bkLive 1s steps(2) infinite;}',
'@keyframes bkLive{50%{box-shadow:inset 0 0 0 1px #ff4b4b,0 0 0 1px #ff4b4b}}',
'.tkb-x.pop{animation:bkPop .34s steps(3) both;}',
'@keyframes bkPop{0%{transform:scale(1.28);box-shadow:0 0 0 2px #ffd166}100%{transform:none}}',
'.tkb-t{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:2px;height:14px;padding:0 2px 0 4px;font-size:9.5px;line-height:1;letter-spacing:0;color:#dfe5f7;position:relative;}',
'.tkb-t:before{content:"";position:absolute;left:0;top:2px;bottom:2px;width:2px;background:var(--tc);}',
'.tkb-t.tbd:before{display:none;}',
'.tkb-t i{font-style:normal;font-size:7px;color:#7b88b3;padding-left:2px;}',
'.tkb-t b{font-weight:800;overflow:hidden;white-space:nowrap;}',
'.tkb-t em{font-style:normal;font-weight:800;font-variant-numeric:tabular-nums;color:#ffd166;}',
'.tkb-t.l{opacity:.38;}.tkb-t.w b{color:#fff;}',
'.tkb-t.me{background:color-mix(in srgb,var(--c1) 45%,transparent);}',
'.tkb-t.tbd{background:repeating-linear-gradient(90deg,#151c36 0 3px,transparent 3px 6px);height:14px;opacity:.6;}',
'.tkb-mid{justify-content:center;align-items:stretch;gap:6px;}',
'.tkb-cup{display:block;width:30px;height:30px;margin:0 auto;image-rendering:pixelated;opacity:.45;filter:grayscale(.4);}',
'.tkb.crowned .tkb-cup{opacity:1;filter:drop-shadow(0 0 8px #ffd166);animation:cupGlow 1.6s steps(4) infinite alternate;}',
'@keyframes cupGlow{to{filter:drop-shadow(0 0 2px #ffd166)}}',
'.tkb-x.fin{box-shadow:inset 0 0 0 1px #c9962a,0 0 0 1px #6b4a00;background:linear-gradient(#1d1708,#0c0a05);}',
'.tkb-x.fin .tkb-t.w{background:linear-gradient(90deg,rgba(255,209,102,.4),transparent);}',
'.tkb-x.fin .tkb-t.ch b{color:#ffd166;}',
'/* the play-in */',
'.tkp-list{display:grid;gap:6px;}',
'.tkp-g{background:#0c1124;box-shadow:inset 0 0 0 1px #222b50;padding:6px 7px;}',
'.tkp-g.you{box-shadow:inset 0 0 0 2px var(--c1);}',
'.tkp-g.live{animation:bkLive 1s steps(2) infinite;}',
'.tkp-g.pop{animation:bkPop .3s steps(3) both;}',
'.tkp-h{display:flex;justify-content:space-between;align-items:baseline;gap:6px;margin:0 0 4px;}',
'.tkp-h span{font-family:var(--k-f-display,var(--display,Impact));font-size:15px;text-transform:uppercase;letter-spacing:.03em;}',
'.tkp-h small{font-family:var(--k-f-pixel,"Press Start 2P",monospace);font-size:6px;text-transform:uppercase;color:#8fa0d6;}',
'.tkp-t{display:grid;grid-template-columns:16px 1fr auto;align-items:center;gap:6px;height:22px;padding:0 6px;position:relative;font-weight:800;font-size:14px;}',
'.tkp-t:before{content:"";position:absolute;left:0;top:3px;bottom:3px;width:3px;background:var(--tc);}',
'.tkp-t i{font-style:normal;font-family:var(--k-f-pixel,"Press Start 2P",monospace);font-size:8px;color:#8fa0d6;text-align:right;}',
'.tkp-t em{font-style:normal;font-family:var(--k-f-pixel,"Press Start 2P",monospace);font-size:7px;color:#7b88b3;}',
'.tkp-t.me{background:color-mix(in srgb,var(--c1) 40%,transparent);}',
'.tkp-t.w:after{content:"W";position:absolute;right:-2px;top:4px;font-family:var(--k-f-pixel,"Press Start 2P",monospace);font-size:7px;color:#05070d;background:#3ecf8e;padding:3px 3px 2px;}',
'.tkp-t.w em{visibility:hidden;}',
'.tkp-t.l{opacity:.36;text-decoration:line-through;text-decoration-thickness:2px;}',
'.tkp-other{margin:10px 0 0;}',
'.tkp-row{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin:4px 0 0;}',
'.tkp-g.sm{padding:3px 4px;}.tkp-g.sm .tkp-t{height:15px;font-size:10.5px;grid-template-columns:10px 1fr;}',
'.tkp-g.sm .tkp-t.w:after{display:none;}',
'/* the Finals: the same board in gold */',
'.tk.tk-fin{background:radial-gradient(ellipse 85% 46% at 50% -6%,rgba(255,209,102,.5),transparent 72%),radial-gradient(ellipse 60% 30% at 50% 108%,rgba(201,150,42,.3),transparent 70%),#050402;}',
'.tk-fin .tk-box{background:#0e0b05;box-shadow:0 -4px 0 0 #ffd166,0 4px 0 0 #c9962a,-4px 0 0 0 #e3b347,4px 0 0 0 #e3b347,0 0 0 7px #2a1d05,0 0 0 9px #ffd166,0 0 80px rgba(255,209,102,.45);}',
'.tk-glow{position:fixed;left:50%;top:-30vh;width:160vmax;height:160vmax;margin-left:-80vmax;pointer-events:none;background:repeating-conic-gradient(from 0deg,rgba(255,209,102,.10) 0 6deg,transparent 6deg 18deg);mask-image:radial-gradient(circle,#000 10%,transparent 55%);-webkit-mask-image:radial-gradient(circle,#000 10%,transparent 55%);animation:tkSpin 40s linear infinite;}',
'@keyframes tkSpin{to{transform:rotate(360deg)}}',
'.tks.gold{background:linear-gradient(#21190a,#0c0905);box-shadow:inset 0 0 0 2px #c9962a,inset 0 0 0 4px #3a2a08;}',
'.tks.gold .tks-tt small{color:#e3c27a;}',
'.tks.gold .tks-tt strong{background:linear-gradient(180deg,#fff3c4 0%,#ffd166 45%,#c9962a 55%,#ffe08a 100%);-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:none;filter:drop-shadow(0 2px 0 #4a3200);}',
'.tks.gold .tks-c{box-shadow:inset 0 0 0 1px #5a4310;background:#0b0803;}',
'.tks.gold .tks-c small,.tks.gold .tks-c em{color:#c9a65a;}',
'.tks.gold.won .tks-stamp{color:#ffd166;background:rgba(20,14,3,.9);}',
'.tks-cup{flex:0 0 auto;width:40px;height:40px;image-rendering:pixelated;filter:drop-shadow(0 0 10px rgba(255,209,102,.7));}',
'.tk-fin .tk-lab{color:#ffd166;}',
'.tk-fin .tk-live{color:#ffd166;}',
'.tk-fin .tk-ctl button[aria-pressed="true"],.tk-fin .tk-ctl button.go.fin{background:linear-gradient(#ffe08a,#e3b347);}',
'.tks-champ{display:flex;align-items:center;gap:12px;margin:10px 0 0;padding:10px;background:linear-gradient(90deg,rgba(255,209,102,.22),rgba(255,209,102,.04));box-shadow:inset 0 0 0 2px #c9962a;animation:bkPop .4s steps(3) both;}',
'.tks-champ[hidden]{display:none;}',
'.tks-champ small{display:block;font-family:var(--k-f-pixel,"Press Start 2P",monospace);font-size:7px;text-transform:uppercase;color:#e3c27a;margin:0 0 4px;}',
'.tks-champ strong{display:block;font-family:var(--k-f-display,var(--display,Impact));font-weight:400;font-size:clamp(26px,8vw,36px);line-height:1;text-transform:uppercase;color:#ffd166;text-shadow:0 2px 0 #4a3200,0 0 18px var(--tc);}',
'.tks.rest .tks-tag{background:#3a4470;box-shadow:0 3px 0 0 #1c2240;}',
'.tk-conf{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:2;}',
'.tk-conf i{position:absolute;top:-12px;width:7px;height:10px;animation:tkFall 2.6s linear both;}',
'@keyframes tkFall{0%{transform:translateY(0) rotate(0)}100%{transform:translateY(110vh) rotate(540deg)}}',
'.tk-sline{font-size:13px;line-height:1.4;margin:4px 0 0;}',
'.tk-sline.gold{color:#ffd166;font-weight:800;}',
'.cr-tk.tk-goldp{box-shadow:inset 0 0 0 2px #c9962a;}',
'.tkb-col:not(.r0) .tkb-t i{display:none;}',
'@media (max-width:380px){.tkb-t{font-size:9px;padding:0 2px}.tkb-t i{display:none}.tks-tm small{font-size:10px}}',
'@media (prefers-reduced-motion:reduce){.tk-glow,.tkb-x.live,.tkb-x.pop,.tkp-g.live,.tkp-g.pop,.tks-c.next,.tks-stamp,.tks-sc.bump b,.tkb.crowned .tkb-cup,.tk-big .tk-now.tense b,.tks-champ{animation:none}}',
'@media (prefers-reduced-motion:reduce){.tk-live i,.tk-g.new,.tk-wire span{animation:none}.tk-wire span{padding-left:0;white-space:normal}}',
].join('\n');
function cssOnce(){
  if (document.getElementById('tk-css')) return;
  var st = document.createElement('style'); st.id = 'tk-css'; st.textContent = CSS; document.head.appendChild(st);
}
function nick(c){ return E && E.TEAM_NAMES ? E.TEAM_NAMES[c] || c : c; }

/* What the last press played, read off the season the engine left. `before`
   is the record before the press, so the board starts where it was.

   Four boards, in rising order of occasion: a stretch of the season (rs),
   the play-in (pi), a playoff round (po), and the rest of the bracket once
   you are out of it (rest). The playoffs carry the whole bracket, read off
   RTF_CAREER.bracketOf, which is the engine's own: your series are the ones
   you played and every other series is the one it played around you. */
function dataFor(L, before, beats){
  var s = L.season;
  if (!s || !L.team || L.stage !== 'nba') return null;
  var news = (beats || []).filter(function(b){ return b.kind === 'news'; }).map(function(b){ return b.text.replace(/^Around the league: /, ''); });
  var team = s.team || L.team;
  var colors = skinOf(team);
  if (before && before.phase !== L.phase && (L.phase === 'early' || L.phase === 'mid' || L.phase === 'late') && s.box && s.box.length) {
    var games = s.box.map(function(g){ return { n: g[0], opp: g[1], home: !!g[2], won: !!g[3], pts: g[4], reb: g[5], ast: g[6], out: g[4] < 0 }; });
    var w = 0, l = 0; games.forEach(function(g){ if (g.won) w++; else l++; });
    var best = 0;
    games.forEach(function(g){ if (!g.out && g.pts > best) best = g.pts; });
    games.forEach(function(g){ g.key = !g.out && (g.pts >= 40 || (g.pts >= 30 && g.pts === best) || (g.pts >= 10 && g.reb >= 10 && g.ast >= 10)); });
    return { kind: 'rs', label: 'Games ' + games[0].n + ' to ' + games[games.length - 1].n, team: team, c1: colors.primary, c2: colors.secondary,
      w0: s.w - w, l0: s.l - l, games: games, news: news };
  }
  var po = s.po, C = window.RTF_CAREER;
  if (!before || !po || !(before.phase === 'po' || before.phase === 'late')) return null;
  var bk = null;
  try { bk = C && C.bracketOf ? C.bracketOf(L) : null; } catch (e) { bk = null; }
  var base = { team: team, c1: colors.primary, c2: colors.secondary, news: news, bk: bk };
  var results = po.results || [];
  var fresh = results.slice(before.poDone || 0);
  /* The play-in: the press that leaves the regular season for a 7 to 10 seed. */
  if (bk && bk.piWent && before.phase === 'late' && !fresh.length && !po.cur) {
    return ext(base, { kind: 'pi', label: 'The play-in', games: bk.pi[bk.cf], other: bk.pi[bk.cf === 'East' ? 'West' : 'East'], through: !po.out, seed: po.seed });
  }
  /* The press that files the season: the bracket finishes without you. */
  if (L.phase === 'off') {
    if (!bk || bk.champ == null) return null;
    var lastR = results.length ? results[results.length - 1] : null;
    if (lastR && lastR.won && lastR.round === 3) return null;
    var from = !lastR ? 0 : lastR.games && lastR.games.length === 7 ? lastR.round : lastR.round + 1;
    var plan = planOf(bk, from, 3, -1);
    if (!plan.anim.length) return null;
    return ext(base, { kind: 'rest', label: bk.missed ? 'The playoffs without you' : 'The rest of the playoffs', shown: plan.shown, anim: plan.anim, missed: bk.missed });
  }
  /* A round: your series, then the rest of the round around it. */
  var series = [];
  fresh.forEach(function(r){ series.push({ round: r.round, opp: r.opp, games: r.games || [], won: r.won, over: true }); });
  if (po.cur && po.cur.games && po.cur.games.length) series.push({ round: po.cur.round, opp: po.cur.opp, games: po.cur.games.slice(), over: false, home: po.cur.home });
  if (!series.length) return null;
  var mine = series[series.length - 1];
  var d = ext(base, { kind: 'po', label: ROUND[mine.round] || 'The playoffs', series: series, round: mine.round, finals: mine.round === 3 });
  if (bk) {
    var prev = results[results.length - (mine.over ? 2 : 1)];
    var r0 = prev && prev.round === mine.round - 1 && prev.games && prev.games.length === 7 ? mine.round - 1 : mine.round;
    var p2 = planOf(bk, r0, mine.round, mine.round);
    d.shown = p2.shown; d.anim = p2.anim; d.you = youKey(bk, mine.round);
  }
  /* Who had the court, by the engine's own rule: the better seed in a
     conference, the better record in the Finals. */
  var recs = s.recs || {};
  if (mine.home != null) d.home = !!mine.home;
  else if (mine.round === 3) d.home = ((recs[team] || {}).w || 0) >= ((recs[mine.opp] || {}).w || 0);
  else d.home = bk ? (bk.seedOf[team] || 99) < (bk.seedOf[mine.opp] || 99) : true;
  return d;
}
function ext(a, b){ var o = {}, k; for (k in a) o[k] = a[k]; for (k in b) o[k] = b[k]; return o; }
function skinOf(c){
  var k = E && E.clubSkin ? E.clubSkin(c) : null;
  return k ? { primary: k.primary, secondary: k.secondary, on: k.on || '#fff' } : { primary: '#2b3242', secondary: '#c9ccd6', on: '#fff' };
}
var ROUND = ['First round', 'Second round', 'Conference finals', 'The Finals'];
var ROUND_BIG = ['First Round', 'Conference Semifinals', 'Conference Finals', 'NBA Finals'];

/* ─── the bracket ─────────────────────────────────────────────────────────── */
function bkKey(cf, r, i){ return r === 3 ? 'F' : cf.charAt(0) + r + i; }
function roundKeys(bk, r){
  if (r === 3) return ['F'];
  var out = [];
  ['West', 'East'].forEach(function(cf){ (bk.conf[cf][r] || []).forEach(function(x, i){ out.push(bkKey(cf, r, i)); }); });
  return out;
}
function seriesAt(bk, k){
  if (k === 'F') return bk.finals;
  var cf = k.charAt(0) === 'W' ? 'West' : 'East';
  return bk.conf[cf][+k.charAt(1)][+k.charAt(2)];
}
function youKey(bk, r){
  if (r === 3) return bk.finals && bk.finals.you ? 'F' : null;
  var row = bk.conf[bk.cf][r] || [];
  for (var i = 0; i < row.length; i++) if (row[i].you) return bkKey(bk.cf, r, i);
  return null;
}
function matchOf(bk, r){ var k = youKey(bk, r); return k ? seriesAt(bk, k) : null; }
/* What is on the board from the first frame, and what is revealed in turn.
   `cur` is the round whose series of yours the board above is playing, so
   the bracket leaves it to the board; -1 when there is none. */
function planOf(bk, from, to, cur){
  var shown = {}, anim = [];
  for (var r = 0; r <= 3; r++) roundKeys(bk, r).forEach(function(k){
    var x = seriesAt(bk, k);
    if (!x) return;
    if (x.you && r === cur) return;
    if (r < from || (x.you && x.w != null)) { shown[k] = 1; return; }
    if (r <= to && x.w != null) anim.push(k);
  });
  return { shown: shown, anim: anim };
}
/* Is this seat known yet: round one always, later rounds once the series
   that feeds it has been revealed. */
function seatKnown(bk, st, k, slot){
  if (k === 'F') return !!st.shown[slot === 0 ? 'W20' : 'E20'];
  var r = +k.charAt(1), i = +k.charAt(2), cf = k.charAt(0);
  if (r === 0) return true;
  return !!st.shown[cf + (r - 1) + (2 * i + slot)];
}
function teamCell(bk, st, k, x, slot){
  var c = slot === 0 ? x.a : x.b;
  if (c == null || !seatKnown(bk, st, k, slot)) return '<div class="tkb-t tbd"><i></i><b></b><em></em></div>';
  var rev = !!st.shown[k], lv = st.live && st.live.k === k;
  var sc = rev ? (slot === 0 ? x.sa : x.sb) : lv ? (slot === 0 ? st.live.sa : st.live.sb) : '';
  var cls = 'tkb-t' + (c === bk.team ? ' me' : '') + (rev ? (x.w === c ? ' w' : ' l') : '') + (c === bk.champ && rev && k === 'F' ? ' ch' : '');
  var sk = skinOf(c);
  return '<div class="' + cls + '" style="--tc:' + sk.primary + '"><i>' + (bk.seedOf[c] || '') + '</i><b>' + esc(c) + '</b><em>' + sc + '</em></div>';
}
function boxHtml(bk, st, k){
  var x = seriesAt(bk, k);
  if (!x) return '<div class="tkb-x"></div>';
  var cls = 'tkb-x' + (st.shown[k] ? ' done' : '') + (st.pop === k ? ' pop' : '') + (st.live && st.live.k === k ? ' live' : '') + (x.you ? ' you' : '') + (k === 'F' ? ' fin' : '');
  return '<div class="' + cls + '" data-k="' + k + '">' + teamCell(bk, st, k, x, 0) + teamCell(bk, st, k, x, 1) + '</div>';
}
function colHtml(bk, st, cf, r){
  return '<div class="tkb-col r' + r + '">' + (bk.conf[cf][r] || []).map(function(x, i){ return boxHtml(bk, st, bkKey(cf, r, i)); }).join('') + '</div>';
}
function bracketHtml(bk, st){
  return '<div class="tkb-head"><span>West</span><span class="mid">Finals</span><span>East</span></div>'
    + '<div class="tkb' + (st.shown.F ? ' crowned' : '') + '">' + colHtml(bk, st, 'West', 0) + colHtml(bk, st, 'West', 1) + colHtml(bk, st, 'West', 2)
    + '<div class="tkb-col tkb-mid">' + trophy('tkb-cup') + boxHtml(bk, st, 'F') + '</div>'
    + colHtml(bk, st, 'East', 2) + colHtml(bk, st, 'East', 1) + colHtml(bk, st, 'East', 0) + '</div>';
}
/* The trophy, in pixels. */
function trophy(cls){
  var px = [
    '..gggggggg..', 'gggGGGGGgggg', 'g.gGGGGGgg.g', 'g.gGGGGGgg.g', '.ggGGGGGggg.', '...gGGGgg...',
    '....gGgg....', '.....gg.....', '.....gg.....', '....gggg....', '...gggggg...', '..ddddddd...',
  ];
  var r = '';
  px.forEach(function(row, y){ for (var x = 0; x < row.length; x++) { var ch = row.charAt(x); if (ch === '.') continue;
    r += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="' + (ch === 'G' ? '#fff3c4' : ch === 'd' ? '#8a5a12' : '#ffd166') + '"/>'; } });
  return '<svg class="' + cls + '" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true">' + r + '</svg>';
}
function sentence(bk, k){
  var x = seriesAt(bk, k);
  var w = x.w, lsr = w === x.a ? x.b : x.a;
  var ws = w === x.a ? x.sa : x.sb, ls = w === x.a ? x.sb : x.sa;
  return 'The ' + nick(w) + ' beat the ' + nick(lsr) + ', ' + ws + '-' + ls + '.';
}

/* The finished board, for the screen behind with scenes off. Small, and it
   goes under the card, so it never pushes an answer below the fold. */
function strip(d){
  cssOnce();
  if (!d) return '';
  if (d.kind === 'rs') {
    return '<div class="cr-tk k-panel"><div class="k-eyebrow">' + esc(d.label) + '</div><div class="tk-strip" role="img" aria-label="' + esc(sumOf(d)) + '">'
      + d.games.map(function(g){ return '<i class="tk-g ' + (g.won ? 'w' : 'l') + (g.out ? ' out' : '') + (g.key ? ' key' : '') + '" title="' + esc(gameLine(g)) + '"></i>'; }).join('') + '</div></div>';
  }
  if (d.kind === 'pi') {
    return '<div class="cr-tk k-panel"><div class="k-eyebrow">The play-in</div>' + d.games.map(function(g){
      return '<div class="tk-sline">' + esc(PI_LAB[g.k]) + ': the ' + esc(nick(g.w)) + ' beat the ' + esc(nick(g.w === g.a ? g.b : g.a)) + '.</div>';
    }).join('') + '</div>';
  }
  if (d.kind === 'rest') {
    return '<div class="cr-tk k-panel tk-goldp"><div class="k-eyebrow">' + esc(d.label) + '</div><div class="tk-sline">' + esc(sentence(d.bk, 'F').replace(/^The /, 'Finals: the ')) + '</div><div class="tk-sline gold">Champions: the ' + esc(nick(d.bk.champ)) + '.</div></div>';
  }
  return '<div class="cr-tk k-panel' + (d.finals ? ' tk-goldp' : '') + '">' + d.series.map(function(sr){
    return '<div class="k-eyebrow">' + esc(ROUND[sr.round] || 'Series') + ' vs ' + esc(nick(sr.opp)) + '</div><div class="tk-strip">' + sr.games.map(function(g){ return '<i class="tk-g ' + (g ? 'w' : 'l') + '"></i>'; }).join('') + '</div>';
  }).join('') + '</div>';
}
var PI_LAB = { '7v8': 'Seven v eight', '9v10': 'Nine v ten', last: 'Last game in' };
var PI_SUB = { '7v8': 'Winner is the 7 seed', '9v10': 'Loser goes home', last: 'Winner is the 8 seed' };
function gameLine(g){
  var where = (g.home ? 'vs ' : 'at ') + nick(g.opp);
  if (g.out) return 'Game ' + g.n + ' ' + where + ': ' + (g.won ? 'won' : 'lost') + '. You sat.';
  var pl = function(n, w){ return n + ' ' + w + (n === 1 ? '' : 's'); };
  return 'Game ' + g.n + ' ' + where + ': ' + (g.won ? 'won' : 'lost') + '. ' + pl(g.pts, 'point') + ', ' + pl(g.reb, 'rebound') + ', ' + pl(g.ast, 'assist') + '.';
}
function sumOf(d){
  var w = 0, l = 0; d.games.forEach(function(g){ if (g.won) w++; else l++; });
  return d.label + ': ' + w + ' and ' + l + '.';
}

var ov = null, live = null;
function keys(e){
  if (!live) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); live.skip(); }
  else if (e.key === 'Enter' || e.key === ' ') { if (document.activeElement && document.activeElement.closest && document.activeElement.closest('.tk-ctl') && !document.activeElement.classList.contains('go')) return; e.preventDefault(); e.stopPropagation(); live.go(); }
}
document.addEventListener('keydown', keys, true);

/* ─── the big boards: the play-in, a playoff round, the rest of the bracket ──
   The season goes by a few games a second on a plain board. The playoffs
   are a broadcast: an arena lit in your colours, your series on a board of
   its own a game at a time, and the whole bracket underneath filling in as
   the round is played around you. The Finals are the same board in gold.
   Everything shown is what the engine played; the waits are the only thing
   added, and a game that can end a series gets a beat before it. */
var HOMES = [1, 1, 0, 0, 1, 0, 1];
function confetti(){
  if (REDUCED) return '';
  var cols = ['#ffd166', '#fff3c4', '#e5483f', '#3ecf8e', '#7aa2ff', '#ffffff'], h = '';
  for (var i = 0; i < 44; i++) {
    var x = (i * 37) % 100, dl = ((i * 53) % 90) / 30, du = 2.2 + ((i * 29) % 15) / 10;
    h += '<i style="left:' + x + '%;background:' + cols[i % cols.length] + ';animation-delay:' + dl.toFixed(2) + 's;animation-duration:' + du.toFixed(2) + 's"></i>';
  }
  return '<div class="tk-conf" aria-hidden="true">' + h + '</div>';
}
function plate(bk, c, me){
  var sk = skinOf(c);
  return '<div class="tks-tm' + (me ? ' me' : '') + '" style="--tc:' + sk.primary + ';--to:' + sk.secondary + '"><i>' + (bk && bk.seedOf[c] ? bk.seedOf[c] : '') + '</i><b>' + esc(c) + '</b><small>' + esc(nick(c)) + '</small></div>';
}
function playBig(d, opts, ctl){
  var bk = d.bk, st = { shown: ext({}, d.shown || {}), live: null, pop: null };
  var fin = d.kind === 'po' && d.finals;
  ov.className = 'tk tk-big tk-' + d.kind + (fin ? ' tk-fin' : '');
  var items = [];
  var body = '';
  var mine = d.kind === 'po' ? d.series[d.series.length - 1] : null;
  if (d.kind === 'po') {
    var cf = bk ? bk.cf : '';
    body += '<div class="tks' + (fin ? ' gold' : '') + '" id="tks">'
      + '<div class="tks-ban">' + (fin ? trophy('tks-cup') : '<span class="tks-tag">Playoffs</span>') + '<div class="tks-tt"><small>' + esc(fin ? 'For the title' : cf ? cf + 'ern Conference' : 'The playoffs') + '</small><strong>' + esc(ROUND_BIG[mine.round] || 'Playoffs') + '</strong></div></div>'
      + '<div class="tks-mu">' + plate(bk, d.team, true) + '<div class="tks-sc"><b id="tks-a">0</b><i>Series</i><b id="tks-b">0</b></div>' + plate(bk, mine.opp, false) + '<div class="tks-stamp" id="tks-stamp" hidden></div></div>'
      + '<div class="tks-g" id="tks-g">' + [0, 1, 2, 3, 4, 5, 6].map(function(gi){
        var h = d.home ? HOMES[gi] : 1 - HOMES[gi];
        return '<div class="tks-c" data-g="' + gi + '"><small>G' + (gi + 1) + '</small><span></span><em>' + (h ? 'Home' : 'Away') + '</em></div>';
      }).join('') + '</div></div>';
  } else if (d.kind === 'pi') {
    var oc = bk.cf === 'East' ? 'West' : 'East';
    body += '<div class="tks pi"><div class="tks-ban"><span class="tks-tag">Do or die</span><div class="tks-tt"><small>' + esc(bk.cf) + 'ern Conference</small><strong>The Play-In</strong></div></div>'
      + '<div class="tkp-list">' + d.games.map(function(g, i){ return piCard(bk, g, 'pi' + i); }).join('') + '</div>'
      + '<div class="tkp-other"><div class="k-eyebrow">' + esc(oc) + '</div><div class="tkp-row">' + (d.other || []).map(function(g, i){ return piCard(bk, g, 'po' + i, true); }).join('') + '</div></div></div>';
  } else {
    body += '<div class="tks rest" id="tks"><div class="tks-ban"><span class="tks-tag">' + (d.missed ? 'Watching' : 'Out') + '</span><div class="tks-tt"><small>' + esc(bk.year - 1) + '-' + String(bk.year).slice(2) + ' playoffs</small><strong>Who wins it all</strong></div></div>'
      + '<div class="tks-champ" id="tks-champ" hidden></div></div>';
  }
  var hasBk = !!bk && d.kind !== 'pi';
  ov.innerHTML = (fin ? '<div class="tk-glow" aria-hidden="true"></div>' : '') + '<div class="tk-box"><div class="tk-top"><span class="tk-live"><i></i>Live</span><span class="tk-lab">' + esc(d.kind === 'po' ? (ROUND[mine.round] || 'Playoffs') + ' vs ' + nick(mine.opp) : d.label) + '</span></div>'
    + body + '<div class="tk-now" id="tk-now" aria-live="polite"><span>' + (d.kind === 'rest' ? 'The bracket plays on.' : 'Tip-off.') + '</span></div>'
    + (hasBk ? '<div class="tk-bkw" id="tk-bk"></div>' : '')
    + (d.news && d.news.length ? '<div class="tk-wire"><span>' + esc('Around the league: ' + d.news.join('   ·   ')) + '</span></div>' : '')
    + '<div class="tk-ctl"><button type="button" data-sp="1" aria-pressed="true">1x</button><button type="button" data-sp="2" aria-pressed="false">2x</button><button type="button" data-sp="4" aria-pressed="false">4x</button><button type="button" class="go" id="tk-go">Skip</button></div></div>';
  var $ = function(id){ return ov.querySelector('#' + id); };
  function paint(){ if (hasBk) $('tk-bk').innerHTML = bracketHtml(bk, st); }
  function say(html, cls){ var n = $('tk-now'); n.className = 'tk-now' + (cls ? ' ' + cls : ''); n.innerHTML = html; }
  paint();

  if (d.kind === 'po') {
    /* A series from the round before that finished after yours (a Game 7
       you were in decided it on a card) lands first: it had to happen for
       this round to exist. */
    var earlier = (d.anim || []).filter(function(k){ return (k === 'F' ? 3 : +k.charAt(1)) < mine.round; });
    var sameRd = (d.anim || []).filter(function(k){ return earlier.indexOf(k) < 0; });
    earlier.forEach(function(k){
      items.push({ ms: 620, fn: function(){ st.shown[k] = 1; st.pop = k; paint(); say('<b>' + esc(ROUND_BIG[k === 'F' ? 3 : +k.charAt(1)]) + '</b><span>' + esc(sentence(bk, k)) + '</span>'); } });
    });
    var w = 0, l = 0, gs = mine.games;
    gs.forEach(function(g, gi){
      var h = d.home ? HOMES[gi] : 1 - HOMES[gi];
      if (w === 3 || l === 3) {
        var pre = w === 3 && l === 3 ? '<b>Game 7</b><span>' + esc('Everything on one night.') + '</span>'
          : w === 3 ? '<b>Game ' + (gi + 1) + '</b><span>' + esc('Up ' + w + '-' + l + '. One more and you are through.') + '</span>'
          : '<b>Game ' + (gi + 1) + '</b><span>' + esc('Down ' + w + '-' + l + '. Win or go home.') + '</span>';
        items.push({ pre: true, ms: 1100, fn: function(){ say(pre, 'tense'); var c = ov.querySelector('.tks-c[data-g="' + gi + '"]'); if (c) c.classList.add('next'); } });
      }
      if (g) w++; else l++;
      var ww = w, ll = l, last = gi === gs.length - 1;
      items.push({ ms: last && mine.over ? 1300 : 700, fn: function(){
        var c = ov.querySelector('.tks-c[data-g="' + gi + '"]');
        if (c) { c.classList.remove('next'); c.classList.add(g ? 'w' : 'l', 'new'); }
        $('tks-a').textContent = ww; $('tks-b').textContent = ll;
        var a = $('tks-a').parentNode; a.classList.remove('bump'); void a.offsetWidth; a.classList.add('bump');
        if (d.you) { st.live = { k: d.you, sa: seriesAt(bk, d.you).a === d.team ? ww : ll, sb: seriesAt(bk, d.you).a === d.team ? ll : ww }; st.pop = null; paint(); }
        var where = h ? 'at home' : 'on the road';
        var lead = ww > ll ? 'Up ' + ww + '-' + ll : ww < ll ? 'Down ' + ww + '-' + ll : 'Tied ' + ww + '-' + ll;
        if (ww === 4 || ll === 4) say('<span>' + esc('Game ' + (gi + 1) + ': ' + (g ? 'a win ' : 'a loss ') + where + '.') + '</span>');
        else say('<span>' + esc('Game ' + (gi + 1) + ': ' + (g ? 'a win ' : 'a loss ') + where + '. ' + lead + '.') + '</span>');
      } });
    });
    if (mine.over) {
      items.push({ ms: fin && mine.won ? 1900 : 1200, fn: function(){
        var sb = $('tks'), stamp = $('tks-stamp');
        sb.classList.add(mine.won ? 'won' : 'lost');
        ov.querySelectorAll('.tks-c').forEach(function(c){ if (!c.classList.contains('w') && !c.classList.contains('l')) c.classList.add('na'); });
        stamp.hidden = false;
        stamp.textContent = mine.won ? (fin ? 'Champions' : 'Series won') : 'Eliminated';
        if (d.you) { st.live = null; st.shown[d.you] = 1; st.pop = d.you; paint(); }
        var tw = mine.games.filter(Boolean).length, tl = mine.games.length - tw;
        say(mine.won ? '<b>' + (fin ? 'NBA champions' : 'Through') + '</b><span>' + esc((fin ? 'The title, ' : 'Beat the ' + nick(mine.opp) + ', ') + tw + '-' + tl + '.') + '</span>'
          : '<b>Season over</b><span>' + esc('The ' + nick(mine.opp) + ' win it, ' + tl + '-' + tw + '.') + '</span>', mine.won ? 'key' : 'bad');
        if (fin && mine.won) { ov.insertAdjacentHTML('beforeend', confetti()); }
      } });
    } else items.push({ ms: 900, fn: function(){ say('<b>Game 7</b><span>' + esc('Three apiece. It comes down to you.') + '</span>', 'tense key'); } });
    sameRd.forEach(function(k){
      items.push({ ms: 520, fn: function(){ st.shown[k] = 1; st.pop = k; paint(); say('<span>' + esc('Around the bracket: ' + sentence(bk, k)) + '</span>'); } });
    });
    items.push({ ms: 0, fn: function(){
      var tw = mine.games.filter(Boolean).length, tl = mine.games.length - tw;
      if (!mine.over) say('<b>Game 7</b><span>' + esc('It comes down to you.') + '</span>', 'tense key');
      else if (mine.won && mine.round < 3) say('<b>Through</b><span>' + esc('Next: the ' + ROUND_BIG[mine.round + 1] + '.') + '</span>', 'key');
      else if (mine.won) say('<b>NBA champions</b><span>' + esc('The title, ' + tw + '-' + tl + '.') + '</span>', 'key');
      else say('<b>Season over</b><span>' + esc('The ' + nick(mine.opp) + ' win it, ' + tl + '-' + tw + '.') + '</span>', 'bad');
    } });
  } else if (d.kind === 'pi') {
    var allG = d.games.map(function(g, i){ return { g: g, id: 'pi' + i, mineG: g.a === d.team || g.b === d.team }; })
      .concat((d.other || []).map(function(g, i){ return { g: g, id: 'po' + i, other: true }; }));
    allG.forEach(function(o){
      if (o.mineG) items.push({ pre: true, ms: 1000, fn: function(){ var c = $(o.id); if (c) c.classList.add('live'); say('<b>' + esc(PI_LAB[o.g.k]) + '</b><span>' + esc('The ' + nick(o.g.a) + ' host the ' + nick(o.g.b) + '. ' + PI_SUB[o.g.k] + '.') + '</span>', 'tense'); } });
      items.push({ ms: o.other ? 420 : o.mineG ? 1100 : 700, fn: function(){
        var c = $(o.id); if (!c) return;
        c.classList.remove('live'); c.classList.add('done', 'pop');
        c.querySelectorAll('.tkp-t').forEach(function(t){ t.classList.add(t.getAttribute('data-c') === o.g.w ? 'w' : 'l'); });
        if (!o.other) {
          var you = o.mineG ? (o.g.w === d.team ? 'You win it.' : 'You lose it.') : '';
          say('<span>' + esc(PI_LAB[o.g.k] + ': the ' + nick(o.g.w) + ' beat the ' + nick(o.g.w === o.g.a ? o.g.b : o.g.a) + '. ' + you) + '</span>', o.mineG ? (o.g.w === d.team ? 'key' : 'bad') : '');
        }
      } });
    });
    items.push({ ms: 0, fn: function(){
      if (!d.through) { say('<b>Season over</b><span>' + esc('Out in the play-in.') + '</span>', 'bad'); return; }
      var m = matchOf(bk, 0), opp = m ? (m.a === d.team ? m.b : m.a) : null;
      say('<b>In as the ' + d.seed + ' seed</b><span>' + esc(opp ? 'Next: the ' + nick(opp) + ', the ' + (bk.seedOf[opp] || '') + ' seed.' : 'On to the first round.') + '</span>', 'key');
    } });
  } else {
    var lastR = -1;
    (d.anim || []).forEach(function(k){
      var r = k === 'F' ? 3 : +k.charAt(1);
      if (k === 'F') {
        items.push({ pre: true, ms: 1500, fn: function(){
          ov.classList.add('tk-fin');
          $('tks').classList.add('gold');
          var x = seriesAt(bk, 'F');
          say('<b>The NBA Finals</b><span>' + esc('The ' + nick(x.a) + ' and the ' + nick(x.b) + '.') + '</span>', 'tense');
        } });
        items.push({ ms: 1800, fn: function(){
          st.shown.F = 1; st.pop = 'F'; paint();
          var c = $('tks-champ'), sk = skinOf(bk.champ);
          c.hidden = false;
          c.innerHTML = trophy('tks-cup') + '<div><small>Champions</small><strong style="--tc:' + sk.primary + '">The ' + esc(nick(bk.champ)) + '</strong></div>';
          say('<span>' + esc('The Finals: ' + sentence(bk, 'F')) + '</span>', 'key');
        } });
        return;
      }
      if (r !== lastR) { lastR = r; items.push({ pre: true, ms: 700, fn: function(){ say('<b>' + esc(ROUND_BIG[r]) + '</b>'); } }); }
      items.push({ ms: 480, fn: function(){ st.shown[k] = 1; st.pop = k; paint(); say('<b>' + esc(ROUND_BIG[r]) + '</b><span>' + esc(sentence(bk, k)) + '</span>'); } });
    });
  }
  ctl.run(items);
}
function piCard(bk, g, id, small){
  var row = function(c){
    var sk = skinOf(c);
    return '<div class="tkp-t' + (c === bk.team ? ' me' : '') + '" data-c="' + c + '" style="--tc:' + sk.primary + '"><i>' + (bk.seedOf[c] || '') + '</i><b>' + esc(small ? c : nick(c)) + '</b>' + (small ? '' : '<em>' + esc(c) + '</em>') + '</div>';
  };
  var you = g.a === bk.team || g.b === bk.team;
  return '<div class="tkp-g' + (small ? ' sm' : '') + (you ? ' you' : '') + '" id="' + id + '">' + (small ? '' : '<div class="tkp-h"><span>' + esc(PI_LAB[g.k]) + '</span><small>' + esc(PI_SUB[g.k]) + '</small></div>') + row(g.a) + row(g.b) + '</div>';
}

/* Play a stretch or a round. opts.done() when it is closed. */
function play(d, opts){
  cssOnce();
  opts = opts || {};
  if (!d) { if (opts.done) opts.done(); return null; }
  if (live) live.drop();
  if (!ov) { ov = document.createElement('div'); ov.className = 'tk'; ov.id = 'tkov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Live'); document.body.appendChild(ov); }
  ov.style.setProperty('--c1', d.c1);
  ov.style.setProperty('--c2', d.c2 || '#fff');
  ov.hidden = false;
  document.documentElement.style.overflow = 'hidden';
  if (d.kind !== 'rs' && d.bk) return playRun(d, opts);
  ov.className = 'tk';
  var speed = 1, i = 0, timer = 0, ended = false;
  var rs = d.kind === 'rs';
  var items = rs ? d.games : [];
  if (!rs) d.series.forEach(function(sr){ sr.games.forEach(function(g, k){ items.push({ series: sr, k: k, won: !!g }); }); });
  ov.innerHTML = '<div class="tk-box"><div class="tk-top"><span class="tk-live"><i></i>Live</span><span class="tk-lab">' + esc(d.label) + '</span></div>'
    + '<div class="tk-bug">' + (rs
      ? '<div><b id="tk-rec">' + d.w0 + '-' + d.l0 + '</b><small>' + esc(nick(d.team)) + '</small></div><div><b id="tk-ppg">-</b><small>Your points</small></div><div><b id="tk-gp">0</b><small>Games</small></div>'
      : '<div><b id="tk-rec">0-0</b><small>Series</small></div><div><b id="tk-opp">-</b><small>Opponent</small></div><div><b id="tk-gp">0</b><small>Games</small></div>')
    + '</div><div class="tk-strip" id="tk-strip" aria-hidden="true"></div>'
    + '<div class="tk-now" id="tk-now" aria-live="polite"><span>Tip-off.</span></div>'
    + (d.news && d.news.length ? '<div class="tk-wire"><span>' + esc('Around the league: ' + d.news.join('   ·   ')) + '</span></div>' : '')
    + '<div class="tk-ctl"><button type="button" data-sp="1" aria-pressed="true">1x</button><button type="button" data-sp="2" aria-pressed="false">2x</button><button type="button" data-sp="4" aria-pressed="false">4x</button><button type="button" class="go" id="tk-go">Skip</button></div></div>';
  var $ = function(id){ return ov.querySelector('#' + id); };
  var pts = 0, gp = 0, w = d.w0 || 0, l = d.l0 || 0, sw = 0, sl = 0, curSr = null;
  function show(g){
    var cell = document.createElement('i');
    if (rs) {
      cell.className = 'tk-g new ' + (g.won ? 'w' : 'l') + (g.out ? ' out' : '') + (g.key ? ' key' : '');
      if (g.won) w++; else l++;
      if (!g.out) { pts += g.pts; gp++; }
      $('tk-rec').textContent = w + '-' + l;
      $('tk-ppg').textContent = gp ? (pts / gp).toFixed(1) : '-';
      $('tk-gp').textContent = String(w + l - (d.w0 + d.l0));
      var now = $('tk-now');
      now.className = 'tk-now' + (g.key ? ' key' : '');
      now.innerHTML = g.key
        ? '<b>' + (g.pts >= 10 && g.reb >= 10 && g.ast >= 10 ? 'Triple-double' : g.pts + ' points') + '</b><span>' + esc(gameLine(g)) + '</span>'
        : '<span>' + esc(gameLine(g)) + '</span>';
    } else {
      if (g.series !== curSr) { curSr = g.series; sw = 0; sl = 0; $('tk-strip').innerHTML = ''; $('tk-opp').textContent = g.series.opp; ov.querySelector('.tk-lab').textContent = (ROUND[g.series.round] || 'Playoffs') + ' vs ' + nick(g.series.opp); }
      cell.className = 'tk-g new ' + (g.won ? 'w' : 'l');
      if (g.won) sw++; else sl++;
      $('tk-rec').textContent = sw + '-' + sl;
      $('tk-gp').textContent = String(sw + sl);
      var fin = (sw === 4 || sl === 4);
      var now2 = $('tk-now');
      now2.className = 'tk-now' + (fin ? ' key' : '');
      now2.innerHTML = fin ? '<b>' + (sw === 4 ? 'Series won' : 'Series over') + '</b><span>' + esc((sw === 4 ? 'Through, ' : 'Out, ') + sw + '-' + sl + ' against the ' + nick(g.series.opp) + '.') + '</span>'
        : '<span>' + esc('Game ' + (sw + sl) + ': ' + (g.won ? 'a win.' : 'a loss.') + ' ' + sw + '-' + sl + ' in the series.') + '</span>';
    }
    $('tk-strip').appendChild(cell);
  }
  function step(){
    if (ended) return;
    if (i >= items.length) return end();
    var g = items[i++];
    show(g);
    var key = rs ? g.key : (g.series && (i === items.length || items[i].series !== g.series));
    var base = rs ? 150 : 520;
    timer = setTimeout(step, (key ? base * 7 : base) / speed);
  }
  function end(){
    if (ended) return;
    ended = true; clearTimeout(timer);
    while (i < items.length) show(items[i++]);
    var go = $('tk-go');
    go.textContent = 'Continue';
    go.classList.add('fin');
    ov.querySelector('.tk-live').innerHTML = 'Final';
    try { go.focus({ preventScroll: true }); } catch (e) {}
  }
  function close(){
    clearTimeout(timer);
    ov.hidden = true; ov.innerHTML = ''; ov.className = 'tk';
    document.documentElement.style.overflow = '';
    live = null;
    if (opts.done) opts.done();
  }
  ov.querySelectorAll('[data-sp]').forEach(function(b){
    b.onclick = function(){ speed = +b.getAttribute('data-sp'); ov.querySelectorAll('[data-sp]').forEach(function(x){ x.setAttribute('aria-pressed', String(x === b)); }); };
  });
  $('tk-go').onclick = function(){ if (ended) close(); else end(); };
  live = { drop: function(){ ended = true; clearTimeout(timer); live = null; }, skip: function(){ if (ended) close(); else end(); }, go: function(){ if (ended) close(); else end(); }, close: close };
  if (REDUCED) end();
  else { try { $('tk-go').focus({ preventScroll: true }); } catch (e) {} timer = setTimeout(step, 450); }
  return live;
}
/* The big boards share one clock: each item is a beat with its own wait,
   and Skip plays every beat left at once, the waits before a big game
   (`pre`) dropped. */
function playRun(d, opts){
  var speed = 1, i = 0, timer = 0, ended = false, items = [];
  var ctl = { run: function(list){ items = list; } };
  playBig(d, opts, ctl);
  var $ = function(id){ return ov.querySelector('#' + id); };
  function step(){
    if (ended) return;
    if (i >= items.length) return end();
    var it = items[i++];
    it.fn();
    timer = setTimeout(step, (it.ms || 0) / speed);
  }
  function end(){
    if (ended) return;
    ended = true; clearTimeout(timer);
    while (i < items.length) { var it = items[i++]; if (!it.pre) it.fn(); }
    var go = $('tk-go');
    go.textContent = 'Continue';
    go.classList.add('fin');
    ov.querySelector('.tk-live').innerHTML = 'Final';
    try { go.focus({ preventScroll: true }); } catch (e) {}
  }
  function close(){
    clearTimeout(timer);
    ov.hidden = true; ov.innerHTML = ''; ov.className = 'tk';
    document.documentElement.style.overflow = '';
    live = null;
    if (opts.done) opts.done();
  }
  ov.querySelectorAll('[data-sp]').forEach(function(b){
    b.onclick = function(){ speed = +b.getAttribute('data-sp'); ov.querySelectorAll('[data-sp]').forEach(function(x){ x.setAttribute('aria-pressed', String(x === b)); }); };
  });
  $('tk-go').onclick = function(){ if (ended) close(); else end(); };
  live = { drop: function(){ ended = true; clearTimeout(timer); live = null; }, skip: function(){ if (ended) close(); else end(); }, go: function(){ if (ended) close(); else end(); }, close: close };
  if (REDUCED) end();
  else { try { $('tk-go').focus({ preventScroll: true }); } catch (e) {} timer = setTimeout(step, 600); }
  return live;
}
window.RTF_TICKER = { play: play, strip: strip, dataFor: dataFor, isOpen: function(){ return !!(ov && !ov.hidden); } };
})();
