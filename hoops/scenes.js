/* Run The Floor: the broadcast layer.
 *
 * Run The Tour plays the moments a golf career is remembered for as scenes: a
 * room, a cast of broadcasters, a line typed out a few letters at a time, and
 * a decision asked in the middle of it. This is that layer arriving at a
 * basketball career. Draft night is a stage and a podium, a ring is confetti
 * on the floor, Game 7 is the last shot with the building on its feet, and a
 * press conference is a microphone and four ways to answer it.
 *
 * NOTHING HERE DECIDES ANYTHING. Every outcome is career.js's. A scene is told
 * after the engine has moved, off the beats it returned, and a decision in a
 * scene is the engine's own pending card, answered through the same
 * C.choose() the plain card uses. So a scene skipped, closed or switched off
 * leaves the career exactly where it was: the card is still on the table
 * underneath, and the screen behind the overlay is the ordinary one.
 *
 * THE BROADCASTERS ARE INVENTED, AND EVERYBODY ELSE IS WHO THE CAREER SAYS.
 * Every broadcaster and outlet here is made up. The coach on the plate is
 * the real coach of your club, or the generated coach of your school, and the
 * commissioner is generated with the rest of the career's people: both come
 * from career.js (C.myCoach, C.say), so a scene and a card always name the
 * same man. check-career reads this file for every real player's name: a
 * real person reaches a scene through the career, never typed in here.
 *
 * THE PLAYER IS THE PICTURE AND THE WORLD IS THE VOICE, which is Run The
 * Tour's rule: nobody but you is drawn, apart from your draft-class rival,
 * who is invented too. The only words you say are the answers you chose.
 */
(function(){
'use strict';

var E = window.RTF_ENGINE, C = window.RTF_CAREER, B = window.RTF_BALLER;
/* The Arena Arcade kit draws the rooms as pixel sets. Without it the rooms
   fall back to the CSS sets below, so a blocked kit never blanks a scene. */
var K = window.RTF_KIT;
if (!E || !C || !B) return;

var KEY = 'rtf.scenes.v1';
var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches;
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function on(){ try { return localStorage.getItem(KEY) !== 'off'; } catch (e) { return true; } }
function setOn(v){ try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch (e) {} }

// ─── the cast ───────────────────────────────────────────────────────────────

var OUTLETS = {
  night: { name: 'Hardwood Tonight', c: '#f0782d' },
  wire: { name: 'The Floor Wire', c: '#6aa9ff' },
  studio: { name: 'The Paint Room', c: '#c06bff' },
  pod: { name: 'Off the Glass', c: '#3ddc97' },
  prep: { name: 'Rising Rim', c: '#f2c14e' },
  timeline: { name: 'The Timeline', c: '#9aa4b2' },
  team: { name: 'Locker room', c: '#c9ccd6' },
  phone: { name: 'Incoming call', c: '#3ddc97' },
  home: { name: 'Off the clock', c: '#9fb6ff' },
  office: { name: 'Front office', c: '#c9a23a' },
};
var CAST = {
  vance: { name: 'Rocco Vance', role: 'Play-by-play', outlet: 'night' },
  bell: { name: 'Amara Bell', role: 'Sideline reporter', outlet: 'wire' },
  hollis: { name: 'Jerome Hollis', role: 'Studio analyst', outlet: 'studio' },
  sato: { name: 'Priya Sato', role: 'Numbers', outlet: 'studio' },
  whit: { name: 'Dex Whitlow', role: 'Host', outlet: 'pod' },
  kim: { name: 'June Kimura', role: 'Press room', outlet: 'wire' },
  greer: { name: 'Tasha Greer', role: 'Prep scout', outlet: 'prep' },
  commish: { name: function(c){ return c.commish; }, role: 'Commissioner', outlet: 'night' },
  coach: { name: function(c){ return c.coach; }, role: function(c){ return c.level === 'NBA' ? 'Head coach, ' + c.nick : 'Your coach'; }, outlet: 'team' },
  feed: { name: 'The Timeline', role: 'Fan reaction', outlet: 'timeline' },
  /* The people a trade reaches you through. All invented: the career names
     them (career.js tradePeople), never this file. */
  narr: { name: '', role: '', outlet: 'home' },
  agent: { name: function(c){ return c.agent; }, role: 'Your agent', outlet: 'phone' },
  oldgm: { name: function(c){ return c.oldgm; }, role: function(c){ return 'General manager, ' + c.fromNick; }, outlet: 'office' },
  newgm: { name: function(c){ return c.newgm; }, role: function(c){ return 'General manager, ' + c.toNick; }, outlet: 'office' },
  fam: { name: function(c){ return c.fam; }, role: function(c){ return c.famRole === 'mom' ? 'Mom' : 'At home'; }, outlet: 'home' },
  vet: { name: function(c){ return c.vet; }, role: function(c){ return 'Veteran, ' + c.nick; }, outlet: 'team' },
  mate: { name: function(c){ return c.oldmate; }, role: function(c){ return 'Teammate, ' + c.fromNick; }, outlet: 'team' },
};

/* Fan handles, invented, for the feed. */
var HANDLES = ['@fadeawayfran', '@courtside_carla', '@benchmob_mike', '@splashzone88', '@glasscleaner_t', '@nightcapnina',
  '@bucketsbelow', '@hoopsdad_92', '@and1andy', '@lobcityleah', '@backdoor_bo', '@pumpfakepat'];

// ─── the stylesheet ─────────────────────────────────────────────────────────

var CSS = [
'.scov{position:fixed;inset:0;z-index:90;display:flex;flex-direction:column;background:#06080d;color:#f1f3f8;font-family:var(--body,system-ui);-webkit-tap-highlight-color:transparent;user-select:none;}',
'.scov[hidden]{display:none;}',
'.sc-stage{position:relative;flex:1 1 auto;min-height:0;overflow:hidden;}',
'.sc-room{position:absolute;inset:0;transition:opacity .35s ease;}',
'.sc-room.out{opacity:0;}',
'.sc-cast{position:absolute;left:0;right:0;top:58px;bottom:6%;display:flex;justify-content:center;align-items:flex-end;gap:4%;z-index:3;pointer-events:none;}',
'.sc-cast img{height:min(46vh,320px);max-height:100%;width:auto;image-rendering:pixelated;filter:drop-shadow(0 6px 10px rgba(0,0,0,.45));transition:opacity .3s,transform .3s;}',
'.sc-cast img.dim{opacity:.5;transform:scale(.94);}',
'.sc-cast img.in{animation:scIn .45s ease-out both;}',
'@keyframes scIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}',
'.sc-front{position:absolute;inset:0;z-index:4;pointer-events:none;}',
'.sc-hud{position:absolute;top:0;left:0;right:0;z-index:6;display:flex;align-items:center;gap:10px;padding:calc(10px + env(safe-area-inset-top,0px)) 12px 8px;background:linear-gradient(180deg,rgba(0,0,0,.6),transparent);}',
'.sc-out{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;flex:0 0 auto;font-family:var(--k-f-pixel,monospace);font-size:8px;text-transform:uppercase;padding:7px 8px;background:#05070d;color:#fff;box-shadow:0 -2px 0 0 var(--oc,#888),0 2px 0 0 var(--oc,#888),-2px 0 0 0 var(--oc,#888),2px 0 0 0 var(--oc,#888);}',
'.sc-out i{width:6px;height:6px;background:#ff4b4b;box-shadow:0 0 8px #ff4b4b;animation:scLive 1.4s ease-in-out infinite;}',
'@keyframes scLive{50%{opacity:.35}}',
'.sc-when{flex:1 1 auto;min-width:0;font-size:11.5px;color:rgba(255,255,255,.75);font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
'.sc-skip{flex:0 0 auto;background:#05070d;border:0;color:#fff;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:9px 12px;border-radius:0;min-height:40px;box-shadow:0 -2px 0 0 var(--k-frame,#2d3a66),0 2px 0 0 var(--k-frame,#2d3a66),-2px 0 0 0 var(--k-frame,#2d3a66),2px 0 0 0 var(--k-frame,#2d3a66);}',
'.sc-skip[hidden]{display:none;}',
'.sc-cap{position:relative;z-index:5;flex:0 0 auto;max-height:52vh;overflow:auto;padding:14px 16px calc(14px + env(safe-area-inset-bottom,0px));background:var(--k-panel,#111629);box-shadow:0 -3px 0 0 var(--oc,#f0782d),0 -6px 0 0 #05070d;}',
'.sc-who{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin:0 0 6px;}',
'.sc-who b{font-family:var(--k-f-display,var(--display,Impact));font-weight:400;font-size:19px;letter-spacing:.02em;text-transform:uppercase;color:var(--oc,#fff);}',
'.sc-who span{font-family:var(--k-f-pixel,monospace);font-size:8px;letter-spacing:.02em;text-transform:uppercase;color:var(--k-ink-3,#8fa0d6);}',
'.sc-tx{font-size:16.5px;line-height:1.5;min-height:3em;margin:0;}',
'.sc-tx .q{font-style:italic;}',
'.sc-caret{display:inline-block;margin-left:1px;animation:scLive .8s steps(1) infinite;color:var(--oc,#fff);}',
'.sc-tap{margin:10px 0 0;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.4);font-weight:800;text-align:right;}',
'.sc-tap[hidden]{display:none;}',
'.sc-q h3{font-family:var(--display,Impact);font-weight:400;font-size:21px;text-transform:uppercase;line-height:1.1;margin:0 0 4px;}',
'.sc-q .eye{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--oc,#f0782d);font-weight:900;}',
'.sc-q p{margin:0 0 10px;color:rgba(255,255,255,.75);font-size:14.5px;line-height:1.45;}',
'.sc-ch{display:flex;flex-direction:column;gap:7px;}',
'.sc-ch button{text-align:left;background:var(--k-panel-2,#18203a);border:0;color:#fff;padding:12px 13px;margin:2px;border-radius:0;font-weight:700;font-size:15px;line-height:1.35;min-height:52px;box-shadow:0 -2px 0 0 var(--k-panel-3,#202a4a),0 2px 0 0 var(--k-panel-3,#202a4a),-2px 0 0 0 var(--k-panel-3,#202a4a),2px 0 0 0 var(--k-panel-3,#202a4a);}',
'.sc-ch button:hover{background:var(--k-panel-3,#202a4a);}','.sc-ch button:focus-visible{outline:2px solid var(--k-gold,#ffd166);outline-offset:3px;}',
'.sc-ch button small{display:block;font-weight:500;font-size:12.5px;color:rgba(255,255,255,.6);margin-top:2px;}',
'.sc-ch button .tone{display:inline-block;font-family:var(--k-f-pixel,monospace);font-size:8px;text-transform:uppercase;color:#0b0f18;background:var(--oc,#f0782d);padding:4px 6px;margin:0 0 6px;}',
'.sc-feed{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:7px;}',
'.sc-feed li{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:11px;padding:8px 10px;font-size:14px;line-height:1.4;animation:scIn .35s ease-out both;}',
'.sc-feed li b{display:block;font-size:12px;color:rgba(255,255,255,.6);font-weight:800;margin-bottom:1px;}',
'.sc-feed li small{display:block;font-size:11px;color:rgba(255,255,255,.4);margin-top:3px;}',
/* rooms */
'.rm-arena{background:radial-gradient(60% 50% at 50% 0,rgba(255,255,255,.08),transparent 70%),linear-gradient(#090c14,#141a28 58%,#000 58%);}',
'.rm-arena .crowd{position:absolute;left:0;right:0;top:12%;height:46%;background:radial-gradient(circle,rgba(255,255,255,.26) 1.4px,transparent 2px) 0 0/10px 9px,radial-gradient(circle,var(--c1) 1.6px,transparent 2.2px) 5px 4px/10px 9px;opacity:.55;-webkit-mask:linear-gradient(transparent,#000 30%);mask:linear-gradient(transparent,#000 30%);}',
'.rm-arena .crowd.loud{animation:scCrowd .5s steps(2) infinite;}',
'@keyframes scCrowd{50%{transform:translateY(-2px);opacity:.75}}',
'.rm-arena .board{position:absolute;left:50%;top:7%;transform:translateX(-50%);width:min(38%,240px);aspect-ratio:2.2;border-radius:8px;background:#05070b;border:3px solid var(--c1);box-shadow:0 0 30px rgba(0,0,0,.6),0 0 22px var(--c1);display:flex;align-items:center;justify-content:center;font-family:var(--display,Impact);font-size:clamp(18px,4.4vw,34px);letter-spacing:.06em;color:#ffd36b;text-shadow:0 0 10px rgba(255,190,60,.7);}',
'.rm-arena .floor{position:absolute;left:-10%;right:-10%;bottom:0;height:44%;background:repeating-linear-gradient(90deg,#c68b4d 0 5.5%,#bd8244 5.5% 11%);clip-path:polygon(16% 0,84% 0,100% 100%,0 100%);}',
'.rm-arena .floor:before{content:"";position:absolute;left:30%;right:30%;top:22%;height:44%;border:3px solid rgba(255,255,255,.75);border-radius:50%;}',
'.rm-arena .floor:after{content:"";position:absolute;left:0;right:0;top:0;height:7%;background:var(--c1);}',
'.rm-arena .beam{position:absolute;top:-10%;width:30%;height:90%;background:linear-gradient(180deg,rgba(255,240,200,.18),transparent 80%);clip-path:polygon(40% 0,60% 0,100% 100%,0 100%);}',
'.rm-press{background:linear-gradient(rgba(231,234,240,.55),rgba(207,212,222,.7)),radial-gradient(circle,var(--c1) 0 5px,transparent 6px) 0 0/38px 38px,radial-gradient(circle,var(--c2) 0 3px,transparent 4px) 19px 19px/38px 38px,linear-gradient(#e7eaf0,#cfd4de);}',
'.rm-press .table{position:absolute;left:4%;right:4%;bottom:0;height:24%;z-index:4;background:linear-gradient(#1b2130,#10141d);border-top:4px solid var(--c1);}',
'.rm-press .table:after{content:"";position:absolute;left:38%;right:38%;top:22%;height:30%;background:#f4f4f1;border-radius:3px;box-shadow:inset 0 -6px 0 var(--c1);}',
'.rm-press .mic{position:absolute;bottom:22%;z-index:5;width:7px;height:16%;background:#2a2e38;border-radius:3px;}',
'.rm-press .mic:before{content:"";position:absolute;left:-5px;top:-14px;width:17px;height:20px;border-radius:7px;background:#3a3f4b;box-shadow:inset 0 0 0 2px #555b68;}',
'.rm-press .flash{position:absolute;width:42px;height:42px;border-radius:50%;background:radial-gradient(#fff,rgba(255,255,255,0) 70%);opacity:0;animation:scFlash 2.6s infinite;}',
'@keyframes scFlash{0%,86%,100%{opacity:0}88%{opacity:1}}',
'.rm-draft{background:radial-gradient(70% 60% at 50% 100%,rgba(80,120,255,.25),transparent 70%),linear-gradient(#030512,#0b1636 70%,#05070f 70%);}',
'.rm-draft .screen{position:absolute;left:50%;top:7%;transform:translateX(-50%);width:min(70%,460px);aspect-ratio:3.2;border-radius:6px;background:linear-gradient(135deg,var(--c1),#05070f);border:2px solid rgba(255,255,255,.3);display:flex;align-items:center;justify-content:center;font-family:var(--display,Impact);font-size:clamp(18px,4.6vw,38px);letter-spacing:.08em;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.5);}',
'.rm-draft .stage{position:absolute;left:0;right:0;bottom:0;height:30%;background:linear-gradient(#1a2445,#0a0f20);border-top:3px solid rgba(160,190,255,.4);}',
'.rm-draft .beam{position:absolute;top:0;width:34%;height:100%;background:linear-gradient(180deg,rgba(170,200,255,.22),transparent 85%);clip-path:polygon(44% 0,56% 0,100% 100%,0 100%);}',
'.rm-draft .podium{position:absolute;right:12%;bottom:6%;z-index:4;width:14%;height:30%;background:linear-gradient(#2a3555,#151c33);border:2px solid rgba(160,190,255,.35);border-radius:4px 4px 0 0;}',
'.rm-studio{background:linear-gradient(135deg,#120a1f,#05060c);}',
'.rm-studio .screens{position:absolute;left:6%;right:6%;top:10%;height:44%;display:grid;grid-template-columns:repeat(3,1fr);gap:3%;}',
'.rm-studio .screens i{border-radius:6px;background:linear-gradient(135deg,var(--oc,#c06bff),#0b0f18 75%);opacity:.65;border:1px solid rgba(255,255,255,.18);}',
'.rm-studio .screens i:nth-child(2){background:repeating-linear-gradient(90deg,transparent 0 14%,rgba(255,255,255,.55) 14% 19%),linear-gradient(#0b0f18,#0b0f18);background-size:100% 70%,100% 100%;background-position:0 100%,0 0;background-repeat:no-repeat;}',
'.rm-studio .logo{position:absolute;left:50%;top:58%;transform:translateX(-50%);font-family:var(--display,Impact);letter-spacing:.14em;font-size:clamp(14px,3.4vw,22px);color:var(--oc,#c06bff);opacity:.55;white-space:nowrap;}',
'.rm-studio .desk{position:absolute;left:8%;right:8%;bottom:0;height:22%;z-index:4;background:linear-gradient(#232a3d,#0d111a);border-top:3px solid var(--oc,#c06bff);border-radius:14px 14px 0 0;}',
'.rm-gym{background:repeating-linear-gradient(0deg,transparent 0 18px,rgba(0,0,0,.25) 18px 20px),repeating-linear-gradient(90deg,#8d3b2c 0 40px,#7f3426 40px 42px),#8d3b2c;}',
'.rm-gym .banner{position:absolute;top:6%;width:13%;height:26%;background:var(--c1);clip-path:polygon(0 0,100% 0,100% 75%,50% 100%,0 75%);box-shadow:inset 0 -10px 0 var(--c2);}',
'.rm-gym .bleach{position:absolute;left:0;right:0;top:36%;height:26%;background:repeating-linear-gradient(0deg,#5a6070 0 10px,#3a3f4b 10px 13px);}',
'.rm-gym .floor{position:absolute;left:0;right:0;bottom:0;height:40%;background:repeating-linear-gradient(90deg,#d9a463 0 6%,#cf995a 6% 12%);}',
'.rm-gym .floor:after{content:"";position:absolute;left:0;right:0;top:0;height:6%;background:var(--c1);}',
'.rm-locker{background:linear-gradient(#1a1f2b,#0f131b);}',
'.rm-locker .lockers{position:absolute;left:0;right:0;top:8%;height:62%;background:repeating-linear-gradient(90deg,var(--c1) 0 17%,#0c0f16 17% 18%);opacity:.75;}',
'.rm-locker .lockers:after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent 0 12px,rgba(0,0,0,.2) 12px 14px);}',
'.rm-locker .bench{position:absolute;left:10%;right:10%;bottom:12%;height:5%;z-index:4;background:#6b4a2b;border-radius:3px;}',
'.rm-hall{background:radial-gradient(50% 60% at 50% 30%,rgba(255,215,120,.35),transparent 70%),repeating-linear-gradient(90deg,#2a2212 0 9%,#3a2f18 9% 11%,#2a2212 11% 20%),#1d170c;}',
'.rm-hall .floor{position:absolute;left:0;right:0;bottom:0;height:26%;background:linear-gradient(#5a4a26,#2a2212);border-top:3px solid #e8b33c;}',
'.rm-hall .plaque{position:absolute;left:50%;top:6%;transform:translateX(-50%);padding:6px 14px;border:2px solid #e8b33c;border-radius:6px;background:rgba(0,0,0,.4);font-family:var(--display,Impact);letter-spacing:.12em;color:#ffd36b;font-size:clamp(14px,3.6vw,22px);white-space:nowrap;}',
'.sc-pix{overflow:hidden;background:#05070d;}',
'.sc-pset{position:absolute;left:50%;top:var(--hud,58px);transform:translateX(-50%);}',
'.sc-pfront{z-index:4;}',
'.sc-pfront .sc-pset{clip-path:inset(var(--cut) 0 0 0);}',
'.scov:has(.sc-pix) .sc-hud{background:#05070d;box-shadow:0 3px 0 0 #0b0e1a;}',
'.sc-pset img{display:block;width:100%;height:100%;image-rendering:pixelated;image-rendering:crisp-edges;}',
'.sc-pboard{position:absolute;left:50%;transform:translateX(-50%);padding:calc(var(--px,4px)*1.5) calc(var(--px,4px)*3);background:#05070d;color:#ffd36b;font-family:var(--k-f-pixel,"Press Start 2P",monospace);font-size:max(9px,calc(var(--px,4px)*2.2));line-height:1;white-space:nowrap;text-shadow:0 0 6px rgba(255,190,60,.6);',
'  box-shadow:0 calc(var(--px,4px)*-1) 0 0 var(--c1),0 var(--px,4px) 0 0 var(--c1),calc(var(--px,4px)*-1) 0 0 0 var(--c1),var(--px,4px) 0 0 0 var(--c1);}',
'.sc-pboard.sc-pscreen{background:transparent;box-shadow:none;color:#fff;text-shadow:calc(var(--px,4px)*.6) calc(var(--px,4px)*.6) 0 rgba(0,0,0,.6);font-size:max(11px,calc(var(--px,4px)*3.4));}',
'.sc-pboard.sc-pgold{background:#2a2212;color:#ffd166;box-shadow:0 calc(var(--px,4px)*-1) 0 0 #e8b33c,0 var(--px,4px) 0 0 #e8b33c,calc(var(--px,4px)*-1) 0 0 0 #e8b33c,var(--px,4px) 0 0 0 #e8b33c;}',
'.sc-pboard.sc-plogo{background:transparent;box-shadow:none;color:var(--oc);text-shadow:none;opacity:.85;}',
'.sc-pflash{position:absolute;inset:0;pointer-events:none;background:radial-gradient(60% 40% at 50% 0,rgba(255,236,196,.18),transparent 70%);animation:scLive 1.2s steps(2) infinite;}',
'.sc-cast img{image-rendering:pixelated;image-rendering:crisp-edges;}',
'.sc-confetti{position:absolute;inset:0;z-index:5;pointer-events:none;overflow:hidden;}',
'.sc-court{position:absolute;left:0;right:0;bottom:0;top:var(--hud,58px);z-index:5;}',
'.sc-shot{pointer-events:none;}',
'.sc-tape{position:absolute;left:50%;top:calc(var(--hud,58px) + 8px);transform:translateX(-50%);z-index:6;width:min(88%,360px);background:rgba(5,7,13,.92);padding:8px 10px;box-shadow:0 -2px 0 0 #ffd166,0 2px 0 0 #ffd166,-2px 0 0 0 #ffd166,2px 0 0 0 #ffd166;font-family:var(--k-f-pixel,"Press Start 2P",var(--display,Impact));font-size:9px;text-transform:uppercase;}',
'.sc-tape .tp-h{display:flex;justify-content:space-between;align-items:baseline;gap:6px;margin:0 0 6px;}',
'.sc-tape .tp-h b{font-family:var(--k-f-display,var(--display,Impact));font-weight:400;font-size:18px;color:#fff;letter-spacing:.02em;}',
'.sc-tape .tp-h span{color:#ffd166;font-size:7px;}',
'.sc-tape .tp-r{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;padding:5px 0;border-top:2px solid #1d2440;}',
'.sc-tape .tp-r span{color:#cdd6f4;}','.sc-tape .tp-r span:last-child{text-align:right;}',
'.sc-tape .tp-r span.w{color:#3ecf8e;}','.sc-tape .tp-r i{font-style:normal;color:#8fa0d6;font-size:7px;}',
'.sc-confetti i{position:absolute;top:-8%;width:8px;height:12px;animation:scFall linear infinite;}',
'@keyframes scFall{to{transform:translateY(120vh) rotate(540deg)}}',
'@media (prefers-reduced-motion:reduce){.sc-pflash{animation:none}.sc-confetti,.rm-press .flash{display:none}.sc-cast img.in,.sc-feed li{animation:none}.rm-arena .crowd.loud{animation:none}}',
'@media (min-width:760px){.sc-cap{max-width:720px;margin:0 auto;width:100%;}}',
].join('\n');
function cssOnce(){
  if (document.getElementById('sc-css')) return;
  var st = document.createElement('style'); st.id = 'sc-css'; st.textContent = CSS; document.head.appendChild(st);
}

// ─── rooms ──────────────────────────────────────────────────────────────────

/* A pixel room: the kit's 132 by 80 set, scaled by a whole number so every
   cell is the same size, big enough to cover the stage and cropped from the
   middle. Text on a board or a screen sits in the set's own coordinates. */
var PIX_ROOM = { arena: 1, press: 1, draft: 1, studio: 1, gym: 1, locker: 1, hall: 1, home: 1, office: 1, hotel: 1 };
function pixKind(room, c){
  if (room === 'arena') return c.level === 'College' ? 'col' : c.level === 'High school' ? 'hs' : c.level === 'Pro' ? 'gl' : 'nba';
  if (room === 'gym') return 'hs';
  return room;
}
/* Sets with furniture in front of the speaker (a press table, a studio desk):
   the same picture is laid over the cast, cut to the furniture, so whoever is
   talking stands behind it. The share is where the furniture starts. */
var FRONT = { press: '74%', studio: '67%' };
function pixRoomHTML(room, c){
  var kind = pixKind(room, c);
  var col1 = room === 'studio' ? c.oc : room === 'hall' ? '#a8761c' : c.c1, col2 = room === 'hall' ? '#ffd166' : c.c2;
  var lab = '';
  if (c.board && (kind === 'nba' || kind === 'col' || kind === 'gl')) lab = '<span class="sc-pboard" style="top:calc(var(--px) * 1)">' + esc(c.board) + '</span>';
  else if (c.board && kind === 'hs') lab = '<span class="sc-pboard" style="top:calc(var(--px) * 6)">' + esc(c.board) + '</span>';
  else if (kind === 'draft') lab = '<span class="sc-pboard sc-pscreen" style="top:calc(var(--px) * 13)">' + esc(c.board || 'DRAFT') + '</span>';
  else if (kind === 'hall') lab = '<span class="sc-pboard sc-pgold" style="top:calc(var(--px) * 3)">' + esc(c.board || 'HALL OF FAME') + '</span>';
  else if (kind === 'studio' && c.outlet) lab = '<span class="sc-pboard sc-plogo" style="bottom:calc(var(--px) * 2)">' + esc(c.outlet) + '</span>';
  return '<div class="sc-room sc-pix rm-' + room + '" style="--c1:' + c.c1 + ';--c2:' + c.c2 + ';--oc:' + c.oc + '">'
    + '<div class="sc-pset" data-kind="' + kind + '" data-c1="' + col1 + '" data-c2="' + col2 + '" data-seed="' + room + '">'
    + '<img class="k-px" alt="" draggable="false">' + lab + '</div>'
    + (FRONT[kind] ? '<div class="sc-front sc-pfront" style="--cut:' + FRONT[kind] + '"><div class="sc-pset"><img class="k-px" alt="" draggable="false"></div></div>' : '')
    + (c.loud ? '<i class="sc-pflash"></i>' : '') + '</div>';
}
/* The set is drawn at the stage's own shape, so a tall phone gets a tall room
   rather than a wide one blown up and cropped. One cell is a whole number of
   pixels, about a hundredth of the short side, close to the sprite's own. */
function fitPix(ov){
  var st = ov.querySelector('.sc-stage'), set = ov.querySelector('.sc-pset');
  if (!st) return;
  var W = st.clientWidth, H = st.clientHeight;
  if (!W || !H) return;
  /* The broadcast bar sits over the top of the stage, so the set starts under
     it and nothing on the set's wall is hidden by it. */
  var hud = ov.querySelector('.sc-hud'), hh = hud ? hud.offsetHeight : 58;
  ov.style.setProperty('--hud', hh + 'px');
  if (set) {
    H = Math.max(80, H - hh);
    var k = Math.max(3, Math.round(Math.min(W, H) / 100));
    var cw = Math.ceil(W / k), ch = Math.ceil(H / k);
    var key = cw + 'x' + ch;
    if (set.getAttribute('data-at') !== key) {
      var art = K.room(set.getAttribute('data-kind'), cw, ch, { c1: set.getAttribute('data-c1'), c2: set.getAttribute('data-c2'), spotAt: 0.5, seed: set.getAttribute('data-seed') });
      set.querySelector('img').src = art.url;
      set.setAttribute('data-at', key);
    }
    set.style.width = (cw * k) + 'px'; set.style.height = (ch * k) + 'px';
    set.style.setProperty('--px', k + 'px');
    var fr = ov.querySelector('.sc-pfront .sc-pset');
    if (fr) { fr.querySelector('img').src = set.querySelector('img').src; fr.style.width = set.style.width; fr.style.height = set.style.height; }
  }
  var imgs = ov.querySelectorAll('.sc-cast img');
  var top = 58, room = Math.max(64, Math.min(H * 0.94 - top, 330));
  var ks = Math.max(1, Math.floor(room / 64));
  for (var i = 0; i < imgs.length; i++) { imgs[i].style.height = (64 * ks) + 'px'; imgs[i].style.width = (44 * ks) + 'px'; imgs[i].style.maxHeight = 'none'; }
}
function roomHTML(room, c){
  if (K && PIX_ROOM[room]) return pixRoomHTML(room, c);
  var v = 'style="--c1:' + c.c1 + ';--c2:' + c.c2 + '"';
  switch (room) {
    case 'arena':
      return '<div class="sc-room rm-arena" ' + v + '><div class="crowd' + (c.loud ? ' loud' : '') + '"></div><i class="beam" style="left:4%"></i><i class="beam" style="right:4%"></i>'
        + '<div class="board">' + esc(c.board || '') + '</div><div class="floor"></div></div>';
    case 'press': {
      var mics = '';
      for (var m = 0; m < 3; m++) mics += '<i class="mic" style="left:' + (44 + m * 5) + '%"></i>';
      var fl = '';
      if (!REDUCED) for (var f = 0; f < 6; f++) fl += '<i class="flash" style="left:' + (8 + f * 15) + '%;top:' + (30 + (f % 3) * 12) + '%;animation-delay:' + (f * 0.43).toFixed(2) + 's"></i>';
      return '<div class="sc-room rm-press" ' + v + '>' + fl + '<div class="sc-front"><div class="table"></div>' + mics + '</div></div>';
    }
    case 'draft':
      return '<div class="sc-room rm-draft" ' + v + '><i class="beam" style="left:8%"></i><i class="beam" style="right:8%"></i>'
        + '<div class="screen">' + esc(c.board || 'DRAFT') + '</div><div class="stage"></div><div class="sc-front"><div class="podium"></div></div></div>';
    case 'studio':
      return '<div class="sc-room rm-studio" style="--oc:' + c.oc + '"><div class="screens"><i></i><i></i><i></i></div><div class="logo">' + esc(c.outlet || '') + '</div><div class="sc-front"><div class="desk"></div></div></div>';
    case 'gym': {
      var bn = '';
      for (var b = 0; b < 4; b++) bn += '<i class="banner" style="left:' + (8 + b * 23) + '%"></i>';
      return '<div class="sc-room rm-gym" ' + v + '>' + bn + '<div class="bleach"></div><div class="floor"></div></div>';
    }
    case 'locker':
      return '<div class="sc-room rm-locker" ' + v + '><div class="lockers"></div><div class="sc-front"><div class="bench"></div></div></div>';
    case 'hall':
      return '<div class="sc-room rm-hall"><div class="plaque">' + esc(c.board || 'HALL OF FAME') + '</div><div class="floor"></div></div>';
    default:
      return '<div class="sc-room rm-studio" style="--oc:' + c.oc + '"></div>';
  }
}
function confettiHTML(c){
  if (REDUCED) return '';
  var out = '', cols = [c.c1, c.c2, '#e8b33c', '#ffffff'];
  for (var i = 0; i < 46; i++) {
    out += '<i style="left:' + ((i * 37) % 100) + '%;background:' + cols[i % 4] + ';animation-duration:' + (2.2 + (i % 7) * 0.35).toFixed(2) + 's;animation-delay:' + (-(i % 11) * 0.31).toFixed(2) + 's"></i>';
  }
  return '<div class="sc-confetti">' + out + '</div>';
}

// ─── the context a scene is told in ─────────────────────────────────────────

function last(name){ var p = String(name || '').trim().split(/\s+/); return p[p.length - 1] || name; }
function ctxOf(L, extra){
  var k = C.colorsOf(L);
  var team = L.team || (L.draft && L.draft.team) || null;
  var rv = C.roadView ? C.roadView(L) : null;
  var c = {
    L: L, name: L.name, last: last(L.name), num: L.num, look: L.look || B.lookFor(L.seed), age: L.age,
    c1: k.primary, c2: k.secondary, year: L.year, team: team,
    teamName: team ? E.teamName(team) : '', nick: team ? (E.TEAM_NAMES[team] || team) : '',
    school: L.am && L.am.college ? L.am.college : (L.am && L.am.hs ? L.am.hs.name : ''),
    level: rv ? rv.level : 'NBA', persona: C.personaOf ? C.personaOf(L) : '',
    rival: L.rival || null,
    coach: C.myCoach ? C.myCoach(L) : '', commish: C.say ? C.say(L, '{commish}') : '',
  };
  if (L.final && L.final.jersey) {
    var jk = E.clubSkin ? E.clubSkin(L.final.jersey) : null;
    c.jerseyName = E.teamName(L.final.jersey); c.jc1 = jk ? jk.primary : c.c1; c.jc2 = jk ? jk.secondary : c.c2;
  }
  for (var x in extra || {}) c[x] = extra[x];
  return c;
}
function T(tx, c){ var n = 0; while (typeof tx === 'function' && n++ < 4) tx = tx(c); return tx; }
/* One of a few lines, the same one for the whole showing. */
function vary(list){ return function(c){ return list[(c.vseed || 0) % list.length]; }; }

// ─── the scenes ─────────────────────────────────────────────────────────────

/* A scene is a list of beats: { who, room, pic, pose, tx, loud, confetti,
   board, feed }. `pic` is me, rival, both or none. The intro beats for a
   decision (a press conference, Game 7, signing day) are in CARD_INTROS,
   keyed on the engine's card id, and the decision itself is appended by the
   player, so the words on the buttons are always the engine's. */
var SCENES = {
  draft: [
    { who: 'commish', room: 'draft', pic: null, board: function(c){ return 'DRAFT ' + (c.year - 1); },
      tx: function(c){ return 'With the ' + C.ordinal(c.pick) + ' pick in the ' + (c.year - 1) + ' draft, the ' + c.teamName + ' select...'; } },
    { who: 'commish', room: 'draft', pic: 'me', pose: 'cap', shot: 'jersey', board: function(c){ return c.nick.toUpperCase(); },
      tx: function(c){ return c.name + '.'; } },
    { who: 'vance', room: 'draft', pic: 'me', pose: 'cap', shot: 'jersey', board: function(c){ return c.nick.toUpperCase(); },
      tx: vary([
        function(c){ return 'He walks across the stage in a ' + c.nick + ' cap. Somewhere a family is losing its mind.'; },
        function(c){ return 'The handshake, the hat, the photo. ' + c.last + ' is a ' + c.nick.replace(/s$/, '') + '.'; },
      ]) },
  ],
  undrafted: [
    { who: 'bell', room: 'locker', pic: 'me', pose: 'suit',
      tx: function(c){ return 'Sixty names. Not ' + c.last + '. The suit stays on until the phone rings.'; } },
    { who: 'whit', room: 'studio', pic: null, tx: 'Undrafted is a door, not a wall. Ask anybody who walked through it.' },
  ],
  /* A FIRST NBA NIGHT IS WHERE YOU ARE ON THE DEPTH CHART. pickScene picks
     one off the role the engine gave you: a starter is introduced, a rotation
     player checks in off the bench, the end of the bench waves a towel and
     waits, and a two-way rookie opens the season in the G League. A
     checking-in-on-opening-night scene for an undrafted two-way player was
     the bug report. */
  debut_start: [
    { who: 'narr', room: 'locker', pic: 'me', pose: 'stand', name: function(c){ return c.home ? '6:58 PM' : '7:04 PM'; }, role: 'Opening night',
      tx: vary([
        function(c){ return 'Your name is on the whiteboard in the starting five. ' + c.vet.split(' ')[0] + ' taps it twice on his way out.'; },
        function(c){ return 'Tape, shoes, tape again. ' + c.vet.split(' ')[0] + ' sits down next to you. "Breathe. They pay you for the fourth quarter, not the first minute."'; },
      ]) },
    { who: 'vance', room: 'arena', pic: 'me', pose: 'ball', shot: 'debut', loud: true, board: function(c){ return '#' + c.num; },
      tx: function(c){ return c.home ? 'And starting, from ' + c.from + '. Number ' + c.num + '. ' + c.name + '!' : 'On the road for his first one. ' + c.name + ' starts. The boos are a compliment.'; } },
    { who: 'bell', room: 'arena', pic: 'me', pose: 'stand', board: function(c){ return '#' + c.num; },
      tx: function(c){ return c.fam ? c.fam + ' is in section 112 with a sign nobody can read from here.' : 'Somebody back home has this on a phone propped against a cereal box.'; } },
  ],
  debut_bench: [
    { who: 'narr', room: 'arena', pic: 'me', pose: 'stand', name: 'First quarter', role: 'Opening night',
      tx: vary([
        function(c){ return 'Four minutes left in the first. ' + c.coach + ' looks down the bench and says your name.'; },
        function(c){ return 'First timeout. An assistant taps your knee. You are in.'; },
      ]) },
    { who: 'vance', room: 'arena', pic: 'me', pose: 'ball', shot: 'debut', board: function(c){ return '#' + c.num; },
      tx: vary([
        function(c){ return 'Checking in for the ' + c.nick + ', the rookie. ' + c.name + '. Number ' + c.num + '.'; },
        function(c){ return 'Here comes ' + c.last + ' off the bench. First NBA minutes. Let\'s see what he\'s got.'; },
      ]) },
    { who: 'bell', room: 'arena', pic: 'me', pose: 'stand', board: function(c){ return '#' + c.num; },
      tx: function(c){ return c.older ? 'He took the long way here. ' + c.age + ' years old, first minute in the league.' : 'His first touch goes right back out. Nerves. The second one goes in.'; } },
  ],
  debut_dnp: [
    { who: 'narr', room: 'arena', pic: 'me', pose: 'stand', name: 'Opening night', role: 'End of the bench',
      tx: vary([
        function(c){ return 'You are in uniform. You are not in the game. Forty-eight minutes of standing up for timeouts.'; },
        function(c){ return 'Fifteenth man. You get a towel and the best seat in the house.'; },
      ]) },
    { who: 'vet', room: 'locker', pic: 'me', pose: 'stand',
      tx: function(c){ return 'Hey. I sat for a month my first year. Stay ready so you don\'t have to get ready.'; } },
    { who: 'narr', room: 'arena', pic: 'me', pose: 'ball', shot: 'debut', name: function(c){ return c.when; }, role: 'Garbage time',
      tx: function(c){ return 'Up ' + c.margin + ' with three minutes left, the crowd starts chanting your name before ' + c.coach + ' even looks down the bench. You check in. Your first NBA bucket counts the same as any other.'; } },
  ],
  debut_gl: [
    { who: 'narr', room: 'arena', pic: 'me', pose: 'stand', name: 'Opening night', role: 'G League',
      tx: vary([
        function(c){ return 'The ' + c.nick + ' open the season without you. You watch it on a laptop in a hotel near the G League arena.'; },
        function(c){ return 'Two-way life. The big club opens at home. You open in a gym that seats three thousand, and two thousand came.'; },
      ]) },
    { who: 'narr', room: 'arena', pic: 'me', pose: 'ball', name: 'G League', role: 'Week one',
      tx: function(c){ return 'Thirty-four minutes a night down here. Every one of them gets cut up and sent to the front office.'; } },
    { who: 'agent', room: 'hotel', pic: 'me', pose: 'up',
      tx: function(c){ return 'It\'s ' + c.agent.split(' ')[0] + '. Pack a bag. The ' + c.nick + ' are short a body tomorrow and they asked for you.'; } },
  ],
  title: [
    { who: 'vance', room: 'arena', pic: 'me', pose: 'up', loud: true, confetti: true, shot: 'title', board: 'CHAMPIONS',
      tx: function(c){ return 'The ' + c.nick + ' are champions! ' + c.last + ' is on the scorer\'s table with both arms up.'; } },
    { who: 'bell', room: 'arena', pic: 'me', pose: 'trophy', confetti: true, board: 'CHAMPIONS',
      tx: function(c){ return c.fmvp ? 'Finals MVP too. He has not let go of the trophy and nobody is asking him to.' : 'The trophy comes down the line. ' + c.last + ' holds it like it might leave.'; } },
  ],
  ring2: [
    { who: 'vance', room: 'arena', pic: 'me', pose: 'trophy', loud: true, confetti: true, shot: 'title', board: 'CHAMPIONS',
      tx: function(c){ return 'Ring number ' + c.ring + ' for ' + c.last + '. This is starting to look like a habit.'; } },
  ],
  finals_loss: [
    { who: 'vance', room: 'arena', pic: 'me', pose: 'stand', board: 'FINAL',
      tx: function(c){ return 'The other bench pours onto the floor. ' + c.last + ' stands at half court and watches them celebrate.'; } },
  ],
  g7_make: [
    { who: 'vance', room: 'arena', pic: 'me', pose: 'up', loud: true, board: 'GAME 7',
      tx: vary(['BANG! At the buzzer! Series over!', 'Rises, fires... GOT IT! Ballgame! Series!']) },
    { who: 'hollis', room: 'studio', pic: null, tx: function(c){ return 'Every kid in a driveway counts down from three. ' + c.last + ' just did it for real.'; } },
  ],
  g7_miss: [
    { who: 'vance', room: 'arena', pic: 'me', pose: 'stand', board: 'GAME 7',
      tx: 'Off the rim. The horn. The building goes quiet all at once.' },
    { who: 'coach', room: 'locker', pic: 'me', pose: 'stand', tx: 'I would give you that shot again tomorrow. Every time.' },
  ],
  mvp: [
    { who: 'hollis', room: 'studio', pic: null, tx: function(c){ return 'It is official. ' + c.name + ' is the Most Valuable Player.'; } },
    { who: 'sato', room: 'draft', pic: 'me', pose: 'trophy', shot: 'award', tx: function(c){ return c.line ? c.line + ' a night. The numbers made the case. The tape closed it.' : 'The numbers made the case. The tape closed it.'; } },
  ],
  allstar: [
    { who: 'hollis', room: 'arena', pic: 'me', pose: 'ball', shot: 'allstar', loud: true, board: 'ALL-STAR', tx: function(c){ return 'First All-Star nod for ' + c.name + '. The coaches saw it before the fans did.'; } },
  ],
  ncaa: [
    { who: 'vance', room: 'arena', pic: 'me', pose: 'up', loud: true, confetti: true, shot: 'title', board: 'NATIONAL CHAMPS',
      tx: function(c){ return c.school + ' is national champion! ' + c.last + ' is climbing the ladder with scissors.'; } },
  ],
  state: [
    { who: 'greer', room: 'gym', pic: 'me', pose: 'up', confetti: true, shot: 'title',
      tx: function(c){ return c.school + ' wins state. The whole town is on the floor. ' + c.last + ' is somewhere in the middle of it.'; } },
  ],
  /* A TRADE IS TOLD THE WAY IT REACHES YOU, and that is almost never a
     podium. pickScene picks one of these off when it happened and how, and
     every one of them ends on trade_arrive, in the new colours. */
  trade_home: [
    { who: 'narr', room: 'home', pic: 'me', pose: 'stand', name: '11:42 PM', role: 'Home',
      tx: vary([
        function(c){ return 'The house is quiet. ' + (c.famRole === 'mom' ? 'Your mom is staying the week.' : c.fam + ' fell asleep on the couch an hour ago.') + ' Your phone lights up the ceiling.'; },
        function(c){ return 'You are halfway through a movie you will never finish. The phone buzzes on the table. Then again. Then again.'; },
      ]) },
    { who: 'agent', room: 'home', pic: 'me', pose: 'sad1',
      tx: function(c){ return 'It\'s ' + c.agent.split(' ')[0] + '. You sitting down? The ' + c.fromNick + ' just traded you to the ' + c.toNick + '.'; } },
    { who: 'agent', room: 'home', pic: 'me', pose: 'sad1',
      tx: function(c){ return (c.back ? c.back + ' goes the other way. ' : '') + 'It\'s done. There is a flight at nine. I\'m sorry nobody called you first.'; } },
    { who: 'fam', room: 'home', pic: 'me', pose: 'stand',
      tx: vary([
        function(c){ var w = c.city || 'The ' + c.toNick; return c.famRole === 'mom' ? 'Baby. ' + w + '? Okay. Okay. I\'ll help you pack.' : c.kids ? (c.city ? c.city + '? ' : '') + 'What do we tell the kids?' : (c.city ? 'So we\'re moving to ' + c.city + '. Tonight?' : 'So we\'re moving. Tonight?'); },
        function(c){ return c.famRole === 'mom' ? 'They don\'t know what they just gave away. Go show them.' : 'Hey. Look at me. They wanted you. That\'s what this means.'; },
      ]) },
  ],
  trade_practice: [
    { who: 'narr', room: 'locker', pic: 'me', pose: 'stand', name: '10:15 AM', role: 'Shootaround', club: 'from',
      tx: function(c){ return 'A staffer walks onto the floor and waits by the baseline. Everybody stops. Everybody knows what that means.'; } },
    { who: 'oldgm', room: 'office', pic: 'me', pose: 'stand', club: 'from',
      tx: function(c){ return 'Close the door. I wanted you to hear it from me. We traded you to the ' + c.toNick + '.'; } },
    { who: 'oldgm', room: 'office', pic: 'me', pose: 'sad1', club: 'from',
      tx: function(c){ return (c.back ? 'We get ' + c.back + '. ' : '') + 'It was a basketball decision. It wasn\'t about you. Thank you for everything.'; } },
    { who: 'mate', room: 'locker', pic: 'me', pose: 'stand', club: 'from',
      tx: vary([
        function(c){ return 'Your stuff is already in a bag. ' + c.oldmate.split(' ')[0] + ' is sitting on it. "Go kill it over there. Just not against us."'; },
        function(c){ return c.oldmate.split(' ')[0] + ' is waiting at your locker. A hug. "You were the best part of this place. Don\'t forget to call."'; },
      ]) },
  ],
  trade_road: [
    { who: 'narr', room: 'hotel', pic: 'me', pose: 'stand', name: '1:08 AM', role: 'Road trip', club: 'from',
      tx: function(c){ return 'Hotel room. A knock at the door. The traveling secretary, holding a plane ticket and a sad smile.'; } },
    { who: 'oldgm', room: 'hotel', pic: 'me', pose: 'sad1', club: 'from',
      tx: function(c){ return 'Sorry about the hour. Deadline\'s at three. We sent you to the ' + c.toNick + (c.back ? ' for ' + c.back : '') + '. You don\'t play tomorrow.'; } },
    { who: 'agent', room: 'hotel', pic: 'me', pose: 'stand',
      tx: function(c){ return 'I heard twenty minutes ago. Get some sleep. The ' + c.toNick + ' want you for the stretch run, and they mean it.'; } },
  ],
  trade_leak: [
    { who: 'narr', room: 'home', pic: 'me', pose: 'stand', name: '9:47 PM', role: 'Home',
      tx: function(c){ return 'You are on the couch scrolling. Your name is on the screen before your phone rings.'; } },
    { who: 'feed', room: 'home', pic: 'me', pose: 'sad1', tx: '',
      feed: function(c){ return [
        { h: '@thefloorwire', t: 'Sources: the ' + c.fromNick + ' are trading ' + c.name + ' to the ' + c.toNick + (c.back ? ' for ' + c.back : '') + '.', likes: 4100 + (c.vseed || 0) * 13 },
        { h: HANDLES[(c.vseed || 0) % HANDLES.length], t: c.fromNick + ' fans in shambles right now.', likes: 380 + (c.vseed || 0) },
      ]; } },
    { who: 'agent', room: 'home', pic: 'me', pose: 'stand',
      tx: function(c){ return 'I know. I know. It leaked before they called me. It\'s real. Pack light, you can send for the rest.'; } },
  ],
  trade_ask: [
    { who: 'narr', room: 'home', pic: 'me', pose: 'stand', name: '2:30 PM', role: 'The summer',
      tx: 'You asked out in the spring. The phone has been face down on the counter ever since.' },
    { who: 'agent', room: 'home', pic: 'me', pose: 'up',
      tx: function(c){ return 'You got your wish. You\'re a ' + c.toNick.replace(/s$/, '') + '. They gave up real stuff for you, so make them right.'; } },
  ],
  trade_arrive: [
    { who: 'newgm', room: 'office', pic: 'me', pose: 'suit',
      tx: vary([
        function(c){ return 'Welcome to ' + (c.city || 'the ' + c.toNick) + '. We have wanted you for a year. Your locker is ready.'; },
        function(c){ return 'Big day for us. You make us better the second you walk in. Let\'s go to work.'; },
        function(c){ return 'Glad you\'re here. We traded for who you are, not who you were. Show us.'; },
      ]) },
    { who: 'bell', room: 'arena', pic: 'me', pose: 'ball', board: function(c){ return c.toNick.toUpperCase(); },
      tx: function(c){ return 'First practice with the ' + c.toNick + '. New jersey. ' + (c.num ? 'Number ' + c.num + ', if he can keep it.' : 'Same game.'); } },
  ],
  milestone: [
    { who: 'sato', room: 'studio', pic: 'me', pose: 'ball', tx: function(c){ return c.text + ' Only a few have been there.'; } },
  ],
  retire: [
    { who: 'kim', room: 'press', pic: 'me', pose: 'suit', tx: function(c){ return c.name + ' steps to the podium in a suit and no jersey. Everybody knows why.'; } },
    { who: 'hollis', room: 'studio', pic: null, tx: function(c){ return c.verdict ? 'The word around the league: ' + c.verdict.toLowerCase() + '.' : 'An era ends.'; } },
  ],
  hall: [
    { who: 'vance', room: 'hall', pic: 'me', pose: 'suit', shot: 'hall', board: 'HALL OF FAME',
      tx: function(c){ return 'Enshrined. ' + c.name + ', ' + c.from + ' to ' + c.to + '.'; } },
    { who: 'hollis', room: 'hall', pic: 'me', pose: 'suit', board: 'HALL OF FAME', tx: function(c){ return c.blurb || 'A career for the ages.'; } },
  ],
  /* The night the ring is handed out and a banner goes up, the first home
     game after a title. */
  ring_night: [
    { who: 'vance', room: 'arena', pic: 'me', pose: 'stand', shot: 'ring', loud: true, board: 'RING NIGHT',
      tx: function(c){ return 'Ring night. The lights go down and the ' + c.nick + ' raise a banner for ' + (c.year - 1) + '.'; } },
    { who: 'bell', room: 'arena', pic: 'me', pose: 'stand', shot: 'ring', loud: true, board: 'RING NIGHT',
      tx: function(c){ return c.last + ' gets the loudest one. He puts the ring on and does not take it off for warmups.'; } },
  ],
  /* A number going to the rafters, told on the way out of a career. */
  rafters: [
    { who: 'vance', room: 'arena', pic: 'me', pose: 'suit', shot: 'rafters', loud: true, board: function(c){ return '#' + c.num; },
      tx: function(c){ return 'Number ' + c.num + ' goes up. Nobody in ' + (c.jerseyName || 'the building') + ' will wear it again.'; } },
  ],
  /* Draft night's other half: the man you will be measured against. */
  tape: [
    { who: 'sato', room: 'studio', pic: 'both', pose: 'cap', tape: true,
      tx: function(c){ return c.rival ? 'Same class. ' + c.rival.name + ' went ' + C.ordinal(c.rival.pick) + '. Remember the name. You will hear it for fifteen years.' : ''; } },
  ],
  rival_mvp: [
    { who: 'whit', room: 'studio', pic: 'rival', pose: 'trophy', tx: function(c){ return c.rival.name + ' wins MVP. You came into the league together. Just saying.'; } },
  ],
};
/* Until you land, you are still in the old club's colours: every beat of a
   trade scene before trade_arrive is set at the club you are leaving. */
['trade_home', 'trade_practice', 'trade_road', 'trade_leak', 'trade_ask'].forEach(function(id){ SCENES[id].forEach(function(b){ b.club = 'from'; }); });
/* What is said before a decision is put to you. */
var CARD_INTROS = {
  presser: function(card, c){ return [{ who: c.level === 'College' ? 'greer' : 'kim', room: 'press', pic: 'me', pose: card.topic === 'draft' ? 'cap' : card.topic === 'title' || card.topic === 'mvp' ? 'trophy' : 'stand',
    tx: card.topic === 'finals_loss' ? 'The microphones are on. Nobody wants to go first.' : 'The microphones are on. Here we go.' }]; },
  clutch: function(card, c){ return [{ who: 'vance', room: 'arena', pic: 'me', pose: 'ball', loud: true, board: 'GAME 7',
    tx: function(){ return 'Game 7. Tied. Seven seconds left. The ball is in ' + c.last + '\'s hands and nobody in the building is sitting down.'; } }]; },
  amclutch: function(card, c){ return [{ who: c.level === 'High school' ? 'greer' : 'vance', room: c.level === 'High school' ? 'gym' : 'arena', pic: 'me', pose: 'ball', loud: true,
    board: 'TIED', tx: function(){ return 'Tied. Last possession. Everybody knows who is getting the ball.'; } }]; },
  offers: function(card, c){ return [{ who: 'greer', room: 'gym', pic: 'me', pose: 'stand', tx: 'The offers are on the table. Every coach in the gym is pretending not to look at you.' }]; },
  commit: function(card, c){ return [{ who: 'greer', room: 'gym', pic: 'me', pose: 'stand', tx: 'Decision day. The hats are on the table. The cameras are rolling.' }]; },
  signing: function(card, c){ return [{ who: 'greer', room: 'gym', pic: 'me', pose: 'stand', tx: 'Signing day. The pen is right there.' }]; },
  declare: function(card, c){ return [{ who: 'hollis', room: 'studio', pic: 'me', pose: 'stand', tx: function(){ return 'The deadline is here. Does ' + c.last + ' stay, or is he gone?'; } }]; },
  after: function(card, c){ return [{ who: 'kim', room: 'press', pic: 'me', pose: 'suit', tx: 'One last question. What comes next?' }]; },
};
CARD_INTROS.moment = function(card, c){ return [{ who: 'vance', room: 'arena', pic: 'me', pose: 'ball', loud: true, board: 'LIVE',
  tx: card.text || 'It comes down to this.' }]; };
var PRESENTABLE = Object.keys(CARD_INTROS);

/* ─── playable moments (hoops/court.js) ─────────────────────────────────
   A Game 7 option, a tournament tie and every moment card is played on the
   court rather than read: the choice is still the engine's card, the press
   on the meter is a touch handed to the engine with it, and what the court
   shows next is what the engine said. */
var PLAY_CLOCK = { buzzer: ['Q4', '0:04'], ft: ['Q4', '0:02'], stop: ['Q4', '0:12'], poster: ['Q3', '4:51'], block: ['Q3', '1:38'] };
function playSpec(card, n, c){
  var CT = window.RTF_COURT;
  if (!CT) return null;
  var L = c.L, rt = L.rt || {};
  var kind = null, rating = 60, rn = 'Touch';
  if (card.id === 'clutch' || card.id === 'amclutch') {
    kind = CT.CLUTCH_KIND[n];
    var R = [[rt.sho, 'Shooting'], [Math.round(((rt.fin || 60) + (rt.ath || 60)) / 2), 'Finishing'], [Math.round(((rt.sho || 60) + (rt.iq || 60)) / 2), 'Touch'], [rt.pla, 'Playmaking']][n] || [60, 'Touch'];
    rating = R[0]; rn = R[1];
  } else if (card.id === 'moment') {
    kind = card.ctx && card.ctx.plays ? card.ctx.plays[n] : null;
    var RM = { buzzer: [rt.sho, 'Shooting'], ft: [rt.sho, 'Shooting'], poster: [rt.ath, 'Athleticism'], block: [rt.def, 'Defense'], stop: [rt.def, 'Defense'] }[kind];
    if (RM) { rating = RM[0]; rn = RM[1]; }
  }
  if (!kind) return null;
  var opp = card.ctx && card.ctx.opp, ok = opp && E.clubSkin ? E.clubSkin(opp) : null;
  var clock = card.id === 'moment' ? PLAY_CLOCK[kind] || ['Q4', '0:09'] : card.id === 'clutch' ? ['Q4', '0:09'] : ['Q4', '0:07'];
  var home = c.team ? c.team : (c.school || 'HOME').replace(/[^A-Za-z ]/g, '').split(' ').map(function(w){ return w[0]; }).join('').slice(0, 3).toUpperCase();
  var room = c.level === 'College' ? 'col' : c.level === 'High school' ? 'hs' : c.level === 'Pro' ? 'gl' : 'nba';
  var calls = {
    three: ['BANG! At the buzzer!', 'Off the rim.'], mid: ['Fadeaway... GOT IT!', 'Short.'], drive: ['HAMMER DOWN!', 'Rolls off.'], pass: ['The open man... YES!', 'Off the rim.'],
    buzzer: ['At the horn! BANG!', 'Off the back iron.'], ft: ['Two for two. Ice.', 'Both off.'], poster: ['ON HIS HEAD!', 'Offensive foul.'], block: ['PINNED!', 'A step late.'], stop: ['STOP! Ballgame!', 'He buries it.'],
  }[kind];
  return { kind: kind, rating: rating || 60, rateName: rn, room: room, c1: c.c1, c2: c.c2, oc: ok ? ok.primary : '#3a4566', confetti: card.id !== 'moment',
    me: { look: c.look, c1: c.c1, c2: c.c2, num: c.num, age: c.age },
    bug: { home: home || 'YOU', away: opp || 'OPP', period: clock[0], clock: clock[1] },
    pressure: card.id === 'moment' ? 0.4 : 1,
    intro: kind === 'stop' || kind === 'block' ? 'Here he comes.' : kind === 'ft' ? 'Two shots.' : 'Clock running.',
    makeCall: calls[0], missCall: calls[1], halfCall: 'One of two.' };
}

/* The fans, after you answer. Three posts, picked by the tone and the seed. */
var FEED = {
  up: ['{last} said what he said and I respect it', 'running this clip back all week', 'that is my guy. no notes', 'put it on a shirt', '{last} gets it'],
  down: ['who asked {last}', 'save it for the court', 'this is going to age badly', 'somebody take the microphone away', 'humble yourself {last}'],
  mid: ['ok {last}', 'the podium version of a bounce pass', 'fair enough honestly', 'boring but correct', 'he is not wrong'],
};
var TONE_FEED = { humble: 'up', team: 'up', loyal: 'up', confident: 'mid', showman: 'up', fiery: 'mid', cold: 'mid', cocky: 'down' };
function feedFor(tone, c, bad){
  var bank = bad ? FEED.down : FEED[TONE_FEED[tone] || 'mid'];
  var mixd = bank.concat(tone === 'cocky' && !bad ? FEED.up.slice(0, 2) : []);
  var out = [];
  for (var i = 0; i < 3; i++) {
    var t = mixd[(c.vseed + i * 3) % mixd.length].replace('{last}', c.last);
    out.push({ h: HANDLES[(c.vseed + i * 5) % HANDLES.length], t: t, likes: ((c.vseed * (i + 3)) % 900 + 40) * (i === 0 ? 7 : 1) });
  }
  return out;
}

/* ─── which scene, from what the engine just did ──────────────────────────
   A step's beats or a choice's result. The first match wins, in the order a
   fan would rank the moments. */
/* Which way a trade reaches you, off when it happened and how. Seeded on the
   career and the year, so a reload tells the same story. */
function tradeScene(b, L){
  var to = b.to || L.team, from = b.from || '';
  var toNick = E.TEAM_NAMES[to] || to, fromNick = from ? (E.TEAM_NAMES[from] || from) : 'club';
  var tm = E.team ? E.team(to) : null, city = (tm && tm.city) || '';
  var x = { from: from, to: to, back: b.back || '', fromNick: fromNick, toNick: toNick, city: city,
    oldgm: b.oldgm || 'The general manager', newgm: b.newgm || 'The general manager', agent: b.agent || 'Your agent',
    fam: b.fam || 'Mom', famRole: b.famRole || 'mom', kids: b.kids || 0, oldmate: b.oldmate || 'Your teammate' };
  var fk = from && E.clubSkin ? E.clubSkin(from) : null;
  if (fk) { x.fc1 = fk.primary; x.fc2 = fk.secondary; x.teamName = fromNick + ' to ' + toNick; }
  var n = B.hash(L.seed + ':trade:' + L.year + ':' + to);
  var pool = b.how === 'ask' ? ['trade_ask']
    : b.when === 'summer' ? ['trade_home', 'trade_leak', 'trade_home']
      : b.when === 'deadline' ? ['trade_road', 'trade_practice', 'trade_home', 'trade_leak']
        : ['trade_practice', 'trade_home', 'trade_leak'];
  if (!from) pool = ['trade_ask'];
  return { id: pool[n % pool.length], x: x, then: 'trade_arrive' };
}
/* The first night, told from where the engine put you. Nothing here decides
   anything: the role is already set, and this reads it. */
function debutScene(L){
  var r = (L.season && L.season.role) || {}, ct = L.contract || {};
  var n = B.hash(L.seed + ':debut');
  var x = { home: n % 2 === 0, vet: C.say ? C.say(L, '{tvet}') : '', agent: C.say ? C.say(L, '{agent}') : 'Your agent',
    older: L.age >= 24, from: (L.am && L.am.college) || (C.say ? C.say(L, '{town}') : 'home'),
    margin: 18 + n % 15, when: ['Game 4', 'Game 6', 'Game 9', 'Game 11'][n % 4] };
  var life = L.life || {};
  if (life.pn && (life.rel === 'married' || life.rel === 'engaged')) x.fam = C.say ? C.say(L, '{partner}') : '';
  else if (n % 3) x.fam = 'Your mom';
  if (ct.tw) { x.level = 'Pro'; return { id: 'debut_gl', x: x }; }
  if (r.starter) return { id: 'debut_start', x: x };
  if (r.min != null && r.min < 12) return { id: 'debut_dnp', x: x };
  return { id: 'debut_bench', x: x };
}
function pickScene(res, L){
  if (!res) return null;
  var beats = (res.beats || []).slice();
  var has = function(k, f){ return beats.filter(function(b){ return b.kind === k && (!f || f(b)); })[0]; };
  /* Game 7, read off the choice that decided it. */
  if (res.card && (res.card.id === 'clutch' || res.card.id === 'amclutch')) {
    var made = res.tone === 'gold';
    var champ = has('champ');
    if (champ && res.card.id === 'clutch') return { id: champ.ring > 1 ? 'ring2' : 'title', pre: made ? 'g7_make' : null, x: { ring: champ.ring, fmvp: champ.fmvp } };
    if (champ && champ.level === 'ncaa') return { id: 'ncaa', pre: made ? 'g7_make' : null };
    if (champ && champ.level === 'hs') return { id: 'state', pre: made ? 'g7_make' : null };
    return { id: made ? 'g7_make' : 'g7_miss' };
  }
  var b;
  if ((b = has('champ'))) {
    if (b.level === 'ncaa') return { id: 'ncaa' };
    if (b.level === 'hs') return { id: 'state' };
    return { id: b.ring > 1 ? 'ring2' : 'title', x: { ring: b.ring, fmvp: b.fmvp } };
  }
  if ((b = has('draft'))) return b.pick ? { id: 'draft', x: { pick: b.pick }, then: L.rival ? 'tape' : null } : { id: 'undrafted' };
  if ((b = has('award', function(x){ return x.award === 'mvp'; }))) {
    var v = C.view(L);
    return { id: 'mvp', x: { line: v.line ? v.line.pts + ' points' : '' } };
  }
  if (has('finals_loss')) return { id: 'finals_loss' };
  if ((b = has('award', function(x){ return x.award === 'star' && x.n === 1; }))) return { id: 'allstar' };
  if ((b = has('trade'))) return tradeScene(b, L);
  if ((b = has('retire'))) return { id: 'retire', x: { verdict: L.final && L.final.verdict }, then: L.final && L.final.jersey ? 'rafters' : null };
  if ((b = has('milestone'))) return { id: 'milestone', x: { text: b.text } };
  if ((b = has('rival', function(x){ return /wins MVP/.test(x.text); })) && L.rival) return { id: 'rival_mvp' };
  /* Ring night: the first press of a season after a title, once. */
  var h0 = L.history && L.history[L.history.length - 1];
  if ((b = has('role')) && L.stage === 'nba' && h0 && h0.aw && h0.aw.indexOf('champ') >= 0 && h0.t === L.team && L.flags && L.flags.ringNight !== L.year) { L.flags.ringNight = L.year; return { id: 'ring_night' }; }
  if ((b = has('role')) && L.seasonsDone === 0 && L.stage === 'nba' && !(L.flags && L.flags.debutSeen)) { L.flags.debutSeen = 1; return debutScene(L); }
  return null;
}

// ─── the player ─────────────────────────────────────────────────────────────

var ov = null, live = null;

/* Plays a list of beats. A beat with `choice` puts the engine's pending card
   (opts.card()) to you, and opts.choose(i) answers it and hands back the
   result, from which the answer, the reaction and the feed are added on the
   spot. opts.follow(res) can add more: the title after a Game 7 winner, and
   the podium after the title. */
function play(beats, ctx, opts){
  opts = opts || {};
  cssOnce();
  if (live) live.stop(true);
  if (!ov) {
    ov = document.createElement('div');
    ov.className = 'scov'; ov.id = 'scov';
    ov.innerHTML = '<div class="sc-stage"><div class="sc-rooms"></div><div class="sc-cast"></div><div class="sc-conf"></div>'
      + '<div class="sc-hud"><span class="sc-out"><i></i><span></span></span><span class="sc-when"></span><button class="sc-skip" type="button">Skip</button></div></div>'
      + '<div class="sc-cap"><div class="sc-who"><b></b><span></span></div><div class="sc-body"></div><p class="sc-tap">Tap to continue</p></div>';
    document.body.appendChild(ov);
    /* The caption grows and shrinks with what it says (a decision is taller
       than a line), so the set is refitted whenever the stage changes size. */
    var stg = ov.querySelector('.sc-stage');
    if (window.ResizeObserver) new ResizeObserver(function(){ if (!ov.hidden) fitPix(ov); }).observe(stg);
    else window.addEventListener('resize', function(){ if (ov && !ov.hidden) fitPix(ov); });
  }
  ov.hidden = false;
  document.documentElement.style.overflow = 'hidden';
  var $ = function(s){ return ov.querySelector(s); };
  var list = beats.slice(), i = 0, timer = null, typing = false, choosing = false, room = null, roomName = 'studio', castKey = '', done = false, playing = false, moment = null;
  ctx.vseed = ctx.vseed != null ? ctx.vseed : B.hash(ctx.L.seed + ':' + ctx.L.year + ':' + (ctx.sceneId || '')) % 997;

  function stopType(){ if (timer) { clearInterval(timer); timer = null; } }
  function finish(){
    if (done) return;
    done = true; stopType();
    if (moment) { moment.stop(); moment = null; }
    clearShot(); setTape({});
    var ch = ov.querySelector('.sc-court'); if (ch) ch.parentNode.removeChild(ch);
    ov.hidden = true;
    document.documentElement.style.overflow = '';
    $('.sc-rooms').innerHTML = ''; $('.sc-cast').innerHTML = ''; $('.sc-conf').innerHTML = '';
    live = null;
    if (opts.done) opts.done();
  }
  function setRoom(bt){
    var r = bt.room || roomName;
    roomName = r;
    var oc = OUTLETS[CAST[bt.who] ? CAST[bt.who].outlet : 'night'].c;
    /* A beat set at the club you are leaving wears that club's colours. */
    var k1 = bt.club === 'from' && ctx.fc1 ? ctx.fc1 : ctx.c1, k2 = bt.club === 'from' && ctx.fc2 ? ctx.fc2 : ctx.c2;
    var key = r + '|' + T(bt.board, ctx) + '|' + (bt.loud ? 1 : 0) + '|' + (r === 'studio' ? oc : '') + '|' + k1;
    if (key !== room) {
      room = key;
      var on2 = OUTLETS[CAST[bt.who] ? CAST[bt.who].outlet : 'night'];
      $('.sc-rooms').innerHTML = roomHTML(r, { c1: k1, c2: k2, oc: oc, level: ctx.level, loud: bt.loud, board: T(bt.board, ctx), outlet: on2 ? on2.name.toUpperCase() : '' });
    }
    $('.sc-conf').innerHTML = bt.confetti ? confettiHTML(ctx) : '';
    fitPix(ov);
  }
  function setCast(bt){
    var old = bt.club === 'from' && ctx.fc1;
    var k = (bt.pic || '') + '|' + (bt.pose || '') + '|' + (old ? 'from' : '');
    var el = $('.sc-cast');
    if (k === castKey) {
      var imgs = el.querySelectorAll('img');
      for (var n = 0; n < imgs.length; n++) imgs[n].classList.toggle('dim', bt.who !== 'me' && bt.pic === 'both' && n === 0);
      return;
    }
    castKey = k;
    var html = '';
    var me = function(){ return B.img(ctx.look, { c1: old ? ctx.fc1 : ctx.c1, c2: old ? ctx.fc2 : ctx.c2, num: ctx.num, pose: bt.pose || 'stand', age: ctx.age, scale: 6 }, 'in'); };
    var rv = function(){
      var r = ctx.rival, last = r && r.seasons && r.seasons[r.seasons.length - 1];
      var k2 = last && E.clubSkin ? E.clubSkin(last.team) : { primary: '#2b3242', secondary: '#c9ccd6' };
      return B.img(B.lookFor(r ? r.name : 'rival'), { c1: k2.primary, c2: k2.secondary, num: r ? (B.hash(r.name) % 99) : 0, pose: bt.pose || 'stand', scale: 6 }, 'in');
    };
    if (bt.pic === 'me') html = me();
    else if (bt.pic === 'rival') html = rv();
    else if (bt.pic === 'both') html = rv() + me();
    el.innerHTML = html;
    fitPix(ov);
  }
  /* A beat with a shot plays it on the court player (hoops/court.js): the
     same room, the man moving through it. The shot carries on across beats
     that name the same shot, so the caption can change while he walks. */
  var shotKey = '', shotLive = null;
  function clearShot(){
    if (shotLive) { shotLive.stop(); shotLive = null; }
    var h = ov.querySelector('.sc-shot'); if (h) h.parentNode.removeChild(h);
    $('.sc-cast').style.visibility = '';
    shotKey = '';
  }
  function setShot(bt){
    var CT = window.RTF_COURT;
    var key = bt.shot && CT ? bt.shot : '';
    if (key === shotKey) return;
    clearShot();
    if (!key) return;
    shotKey = key;
    var host = document.createElement('div');
    host.className = 'sc-court sc-shot';
    $('.sc-stage').appendChild(host);
    $('.sc-cast').style.visibility = 'hidden';
    var x = {}; for (var k in ctx) x[k] = ctx[k];
    for (var k2 in bt.sx || {}) if (bt.sx[k2] != null) x[k2] = bt.sx[k2];
    shotLive = CT.ceremony(host, key, x, { room: pixKind(bt.room || roomName, ctx), me: { look: ctx.look, c1: ctx.c1, c2: ctx.c2, num: ctx.num, age: ctx.age } });
    if (!shotLive) clearShot();
  }
  /* Tale of the tape: you and your draft-class rival, side by side, on the
     same five lines. Both men are invented, so both are drawn. */
  function setTape(bt){
    var t = ov.querySelector('.sc-tape');
    if (!bt.tape || !ctx.rival) { if (t) t.parentNode.removeChild(t); return; }
    if (t) return;
    var r = ctx.rival, L = ctx.L, me = C.ovrOf ? C.ovrOf(L) : 0;
    var rows = [['OVR', me, r.ovr], ['Ceiling', L.pot, r.pot], ['Pick', L.draft && L.draft.pick || '-', r.pick], ['Age', L.age, r.age], ['Position', L.pos, r.pos]];
    var el = document.createElement('div');
    el.className = 'sc-tape';
    el.innerHTML = '<div class="tp-h"><b>' + esc(ctx.last) + '</b><span>Tale of the tape</span><b>' + esc(last(r.name)) + '</b></div>'
      + rows.map(function(rw){ var a = +rw[1], b2 = +rw[2], lead = isFinite(a) && isFinite(b2) && a !== b2 ? (rw[0] === 'Pick' || rw[0] === 'Age' ? (a < b2 ? 0 : 1) : (a > b2 ? 0 : 1)) : -1;
        return '<div class="tp-r"><span class="' + (lead === 0 ? 'w' : '') + '">' + esc(rw[1]) + '</span><i>' + esc(rw[0]) + '</i><span class="' + (lead === 1 ? 'w' : '') + '">' + esc(rw[2]) + '</span></div>'; }).join('');
    $('.sc-stage').appendChild(el);
  }
  function plate(bt){
    var who = bt.who === 'me' ? { name: ctx.name, role: 'Number ' + ctx.num, outlet: 'team' } : (CAST[bt.who] || CAST.vance);
    var out = OUTLETS[who.outlet] || OUTLETS.night;
    ov.style.setProperty('--oc', bt.who === 'me' ? ctx.c2 : out.c);
    $('.sc-out span').textContent = bt.who === 'me' ? 'Live' : out.name;
    $('.sc-who b').textContent = T(bt.name != null ? bt.name : who.name, ctx) || '';
    $('.sc-who span').textContent = T(bt.role != null ? bt.role : who.role, ctx) || '';
  }
  function paint(){
    var bt = list[i];
    stopType();
    choosing = false;
    setRoom(bt); setCast(bt); setShot(bt); setTape(bt); plate(bt);
    $('.sc-when').textContent = ctx.when || '';
    var body = $('.sc-body');
    $('.sc-skip').hidden = false;
    if (bt.choice) return paintChoice(bt);
    var full = T(bt.tx, ctx) || '';
    var feed = bt.feed ? '<ul class="sc-feed">' + bt.feed.map(function(p){ return '<li><b>' + esc(p.h) + '</b>' + esc(p.t) + '<small>' + p.likes.toLocaleString('en-US') + ' likes</small></li>'; }).join('') + '</ul>' : '';
    var cls = bt.quote ? ' q' : '';
    if (REDUCED || !full) {
      body.innerHTML = '<p class="sc-tx' + cls + '">' + esc(full) + '</p>' + feed;
      typing = false;
      $('.sc-tap').hidden = false;
      return;
    }
    body.innerHTML = '<p class="sc-tx' + cls + '"></p>';
    var tx = body.querySelector('.sc-tx'), shown = 0;
    typing = true;
    $('.sc-tap').hidden = true;
    timer = setInterval(function(){
      shown += 2;
      if (shown >= full.length) {
        stopType(); typing = false;
        tx.textContent = full;
        if (feed) body.insertAdjacentHTML('beforeend', feed);
        $('.sc-tap').hidden = false;
        return;
      }
      tx.innerHTML = esc(full.slice(0, shown)) + '<span class="sc-caret">|</span>';
    }, 18);
    bt._full = full; bt._feed = feed;
  }
  function paintChoice(bt){
    var card = opts.card && opts.card();
    if (!card) { advance(); return; }
    choosing = true;
    $('.sc-skip').hidden = true;
    $('.sc-tap').hidden = true;
    var tones = card.id === 'presser';
    $('.sc-body').innerHTML = '<div class="sc-q"><div class="eye">' + esc(card.eyebrow || '') + '</div><h3>' + esc(card.title) + '</h3>'
      + (card.text ? '<p>' + esc(card.text) + '</p>' : '')
      + '<div class="sc-ch">' + card.options.map(function(o, n){
        return '<button type="button" data-i="' + n + '">' + (tones && o.hint ? '<span class="tone">' + esc(o.hint) + '</span><br>' : '')
          + esc(tones ? '"' + o.label + '"' : o.label) + (!tones && o.hint ? '<small>' + esc(o.hint) + '</small>' : '') + '</button>';
      }).join('') + '</div></div>';
    $('.sc-body').querySelectorAll('[data-i]').forEach(function(btn){
      btn.onclick = function(e){
        e.stopPropagation();
        if (!choosing) return;
        choosing = false;
        var n = +btn.getAttribute('data-i');
        var spec = playSpec(card, n, ctx);
        if (spec) return playMoment(card, n, spec);
        var res = opts.choose ? opts.choose(n) : null;
        var tail = aftermath(card, card.options[n], res).concat(opts.follow && res ? opts.follow(res) || [] : []);
        list.splice.apply(list, [i + 1, 0].concat(tail));
        advance();
      };
    });
  }
  /* The court takes the stage, the meter takes the caption. The engine is
     asked once, at the press, and everything after is its answer. */
  function playMoment(card, n, spec){
    var host = document.createElement('div');
    host.className = 'sc-court';
    $('.sc-stage').appendChild(host);
    $('.sc-cast').style.visibility = 'hidden';
    var body = $('.sc-body');
    body.innerHTML = '<div class="sc-q"><div class="eye">' + esc(card.options[n].label) + '</div></div>';
    playing = true;
    var res = null;
    moment = window.RTF_COURT.moment(host, Object.assign({ ctlHost: body }, spec), {
      resolve: function(q){
        res = opts.choose ? opts.choose(n, { touch: q }) : null;
        var m = res ? res.made : false;
        return { made: m == null ? res && res.tone === 'gold' : m };
      },
      done: function(){
        playing = false;
        if (moment) { moment.stop(); moment = null; }
        if (host.parentNode) host.parentNode.removeChild(host);
        $('.sc-cast').style.visibility = '';
        castKey = ''; room = null;
        var tail = aftermath(card, card.options[n], res).concat(opts.follow && res ? opts.follow(res) || [] : []);
        list.splice.apply(list, [i + 1, 0].concat(tail));
        advance();
      },
    });
  }
  function aftermath(card, opt, res){
    var out = [];
    if (!res) return out;
    if (card.id === 'presser') {
      out.push({ who: 'me', room: 'press', pic: 'me', pose: CARD_INTROS.presser(card, ctx)[0].pose, tx: '"' + opt.label + '"', quote: true });
      out.push({ who: 'hollis', room: 'studio', pic: null, tx: res.text });
      out.push({ who: 'feed', room: 'studio', pic: null, tx: 'The Timeline has thoughts.', feed: feedFor(opt.tone, ctx, res.tone === 'bad') });
      var pr = C.personaOf ? C.personaOf(ctx.L) : '';
      if (pr && pr !== ctx.persona) out.push({ who: 'whit', room: 'studio', pic: 'me', pose: 'stand', tx: 'New word on ' + ctx.last + ' around the league: ' + pr.toLowerCase() + '.' });
      return out;
    }
    if (card.id === 'clutch' || card.id === 'amclutch') return out;   /* the scene that follows tells it */
    out.push({ who: CARD_INTROS[card.id] ? CARD_INTROS[card.id](card, ctx)[0].who : 'bell', room: CARD_INTROS[card.id] ? CARD_INTROS[card.id](card, ctx)[0].room : 'studio',
      pic: 'me', pose: 'stand', tx: res.text || opt.label });
    return out;
  }
  function advance(){
    if (choosing || playing) return;
    var bt = list[i];
    if (typing && bt) {
      stopType(); typing = false;
      var body = $('.sc-body');
      body.innerHTML = '<p class="sc-tx' + (bt.quote ? ' q' : '') + '">' + esc(bt._full) + '</p>' + (bt._feed || '');
      $('.sc-tap').hidden = false;
      return;
    }
    i++;
    if (i >= list.length) { finish(); return; }
    paint();
  }
  /* Skip never skips a decision: it jumps to the next one, or out. */
  function skip(e){
    if (e) e.stopPropagation();
    for (var k = i + 1; k < list.length; k++) if (list[k].choice) { i = k; paint(); return; }
    if (playing || (list[i] && list[i].choice)) return;
    finish();
  }
  ov.querySelector('.sc-stage').onclick = advance;
  ov.querySelector('.sc-cap').onclick = function(e){ if (e.target.closest('button')) return; advance(); };
  $('.sc-skip').onclick = skip;
  ov.onkeydown = null;
  live = { stop: function(silent){ if (silent) { done = true; stopType(); live = null; } else finish(); }, skip: skip, advance: advance };
  paint();
  return live;
}
function keys(e){
  if (!live || !ov || ov.hidden) return;
  if (e.key === 'Escape') { e.preventDefault(); live.skip(); }
  else if (e.key === ' ' || e.key === 'Enter') { if (document.activeElement && document.activeElement.closest && document.activeElement.closest('.sc-ch')) return; e.preventDefault(); live.advance(); }
}
document.addEventListener('keydown', keys);

/* The beats for a moment, then the intro and the decision for whatever card
   the engine has put on the table, so a draft night runs straight into the
   podium and a title runs straight into the press room. */
function build(L, pick, card){
  var c = ctxOf(L, pick ? pick.x : null);
  c.sceneId = pick ? pick.id : card ? card.key : '';
  if (L.final) { c.verdict = L.final.verdict; c.blurb = L.final.blurb; }
  c.when = (c.level === 'NBA' ? (c.year - 1) + '-' + String(c.year).slice(2) : c.level + ' · ' + c.year) + (c.teamName && c.level === 'NBA' ? ' · ' + c.teamName : c.school ? ' · ' + c.school : '');
  var beats = [];
  if (pick && pick.pre && SCENES[pick.pre]) beats = beats.concat(SCENES[pick.pre]);
  if (pick && SCENES[pick.id]) beats = beats.concat(SCENES[pick.id]);
  if (pick && pick.then && SCENES[pick.then]) beats = beats.concat(SCENES[pick.then]);
  if (card && CARD_INTROS[card.id]) {
    var intro = CARD_INTROS[card.id](card, c);
    beats = beats.concat(intro, [{ who: intro[0].who, room: intro[0].room, pic: 'me', pose: intro[0].pose, choice: true }]);
  }
  /* Every line is resolved here, against this moment's own context, so a
     scene chained onto another (the title after a Game 7 winner) tells its
     own facts rather than the first scene's. */
  c.vseed = B.hash(L.seed + ':' + L.year + ':' + c.sceneId) % 997;
  beats = beats.map(function(b){ var o = {}; for (var k in b) o[k] = b[k]; o.tx = T(b.tx, c); o.board = T(b.board, c); if (b.feed) o.feed = T(b.feed, c);
    /* A shot is played against this moment's own facts too (the pick on
       draft night, the award at the podium), not the scene's opening ones. */
    if (b.shot) o.sx = { pick: c.pick, award: c.sceneId === 'mvp' ? 'Most Valuable Player' : c.award, teamName: c.teamName, nick: c.nick, year: c.year, num: c.num, from: c.from, to: c.to };
    return o; });
  return { beats: beats, ctx: c };
}
/* What follows a decision made in a scene: the moment it produced, then the
   next decision if the engine put one on the table. `seen` keeps a card from
   being put twice. */
function chain(L, res, seen){
  var pick = pickScene(res, L);
  var card = L.pending[0];
  var present = card && PRESENTABLE.indexOf(card.id) >= 0 && !(seen && seen[card.key]) ? card : null;
  if (present && seen) seen[present.key] = 1;
  if (!pick && !present) return [];
  return build(L, pick, present).beats;
}

window.RTF_SCENES = {
  CAST: CAST, OUTLETS: OUTLETS, SCENES: SCENES, CARD_INTROS: CARD_INTROS, PRESENTABLE: PRESENTABLE,
  on: on, setOn: setOn, pickScene: pickScene, build: build, chain: chain, play: play, ctxOf: ctxOf, feedFor: feedFor,
  isOpen: function(){ return !!(ov && !ov.hidden); },
};
})();
