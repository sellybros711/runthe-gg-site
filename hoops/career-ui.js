/* Run The Floor: the Career screens.
 *
 * The rules live in career.js and this file only draws them. It talks to the
 * page through window.RTF_PAGE, the same way modes-ui.js does, and its
 * stylesheet is injected from here for that file's reason: the markup and the
 * rules that dress it belong to one release.
 *
 * ONE SCREEN, THREE VIEWS. #s-car is the whole mode: the builder before a
 * career, the life while one is running, and the Hall of Fame card once it is
 * over. The front page's hero (#career in index.html) is painted from here
 * too, because only this file knows what a career is.
 *
 * THE CAREER IS ON THE ACCOUNT. It is one key, `rtf.life.v1`, and that key is
 * a slot on the shelf (hoops/cloud.js MODE_KEYS), written through
 * RTF_MODES_UI.write so a career started on a phone carries on on a laptop.
 * The browser copy is written first and synchronously, the way every other
 * save in this game is.
 */
(function(){
'use strict';

var E = window.RTF_ENGINE, C = window.RTF_CAREER;
var P = window.RTF_PAGE;
/* The Arena Arcade kit (career-kit.js) draws every surface here. It is a
   sibling script like this one, so a page that has this file has that one. */
var K = window.RTF_KIT;
if (!E || !C || !P || !K) return;

var KEY = 'rtf.life.v1';
var $ = function(id){ return document.getElementById(id); };
var esc = P.esc;
var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches;

// ─── storage ────────────────────────────────────────────────────────────────

/* { cur: the career in progress or null, hof: the finished ones, newest first }. */
function load(){
  try {
    var v = JSON.parse(localStorage.getItem(KEY) || 'null');
    /* Every career that comes off disk is migrated before anything reads it,
       and `last` (the finished career's Hall card) is kept: it used to be
       dropped here, which lost the board row a reload should still show. */
    if (v && typeof v === 'object') return backfill({ cur: v.cur ? C.migrate(v.cur) : null, hof: Array.isArray(v.hof) ? v.hof : [], last: v.last || null,
      vault: v.vault && typeof v.vault === 'object' ? v.vault : null, arc: Array.isArray(v.arc) ? v.arc : null });
  } catch (e) {}
  return backfill({ cur: null, hof: [] });
}
/* THE VAULT (Phase E) rides in the same slot. `arc` is every finished career
   as a short entry, newest first, kept long after its full Hall card falls
   off the twenty on `hof`; `vault` is every ending, road, origin and
   challenge this account has found, with when. A slot written before either
   existed builds them from the Hall cards it has, once. */
var ARC_MAX = 200;
function backfill(st){
  if (!st.arc) st.arc = (st.hof || []).map(compact);
  if (!st.vault) { st.vault = {}; (st.hof || []).slice().reverse().forEach(function(c){ vaultAdd(st, c); }); }
  return st;
}
var S = null;
function store(){ if (!S) S = load(); return S; }
function save(){
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
  var M = window.RTF_MODES_UI;
  if (M && M.write) M.write(KEY);
}
/* After a pull from the shelf, what is in memory was read from the old copy. */
function reload(){
  if (onScreen()) return;
  S = null;
  renderHero();
}
function onScreen(){ var el = $('s-car'); return !!(el && el.classList.contains('active')); }


/* What the Vault keeps of a career, and the father a son is built from. */
function cardId(c){ return String(c.id || (c.name + ':' + (c.at || c.from))); }
function compact(c){
  var T = c.totals || {}, e = c.ending || null;
  return { id: cardId(c), parent: c.parent || null, gen: c.gen || 1, name: c.name, num: c.num, pos: c.pos, from: c.from, to: c.to, age: c.age,
    verdict: c.verdict, score: c.score, hof: !!(e && HOF_IN[e.tier]),
    tier: e ? e.tierName : '', pts: T.pts || 0, seasons: T.seasons || 0, rings: T.rings || 0, star: T.star || 0, mvp: T.mvp || 0,
    teams: (c.teams || []).slice(0, 8), jersey: c.jersey || null, c1: c.c1, c2: c.c2, look: c.look || null, at: c.at || 0,
    diff: c.diff || null, ch: c.ch || null, sons: sonsIn(c) };
}
/* Every Vault key a card earns: t tier, o outcome, s secret, r road, g origin,
   c a challenge met. A card from before the ids were kept is read back
   through the names, which are the catalog's own. */
function inv(obj, pickName){ var o = {}; for (var k in obj) o[pickName ? pickName(obj[k]) : obj[k]] = k; return o; }
var HOF_IN = { hof_first: 1, hof_eventual: 1, hof_debate: 1, hof_committee: 1 };
var INV = null;
function invs(){
  if (!INV) INV = { t: inv(C.HOF_TIERS || {}), o: inv(C.OUTCOMES || {}), s: inv(C.SECRETS || {}),
    r: inv(C.ROUTES || {}, function(x){ return x[0]; }), g: inv(C.ORIGINS || {}, function(x){ return x.name; }) };
  return INV;
}
function vaultKeys(c){
  var out = [], ids = c.ids, e = c.ending, I = invs();
  if (ids) {
    if (ids.tier) out.push('t:' + ids.tier);
    (ids.outs || []).forEach(function(k){ out.push('o:' + k); });
    if (ids.secret) out.push('s:' + ids.secret);
    (ids.routes || []).forEach(function(k){ out.push('r:' + k); });
    if (ids.origin) out.push('g:' + ids.origin);
  } else if (e) {
    if (e.tier || I.t[e.tierName]) out.push('t:' + (e.tier || I.t[e.tierName]));
    (e.names || []).forEach(function(n){ if (I.o[n]) out.push('o:' + I.o[n]); });
    if (e.secretName && I.s[e.secretName]) out.push('s:' + I.s[e.secretName]);
    (e.routes || []).forEach(function(n){ if (I.r[n]) out.push('r:' + I.r[n]); });
    if (c.origin && I.g[c.origin]) out.push('g:' + I.g[c.origin]);
  }
  if (c.ch && c.ch.met) out.push('c:' + c.ch.id);
  return out;
}
function vaultAdd(st, c){
  var fresh = [];
  vaultKeys(c).forEach(function(k){ if (!st.vault[k]) { st.vault[k] = c.at || 1; fresh.push(k); } });
  return fresh;
}

// ─── the stylesheet ─────────────────────────────────────────────────────────

var CSS = [
/* The screen is a kit root on the arena floor. It breaks out of the 660px
   wrap on a desktop, where the player card holds the left column and the
   decision the right. */
'#s-car{padding:2px 0 0;}',
'#s-car.k-root{color:var(--k-ink);}',
'@media (min-width:920px){.wrap:has(#s-car.active){max-width:1040px;}}',
'.cr-grid{display:block;}',
'@media (min-width:920px){.cr-grid{display:grid;grid-template-columns:minmax(0,400px) minmax(0,1fr);gap:20px;align-items:start;}',
'  .cr-side{position:sticky;top:64px;}}',
/* THE TOP BAR. The title, where you are in one line under it, and four square
   pixel buttons each wearing its word. */
'.cr-top{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:6px 10px;margin:2px 0 12px;}',
'.cr-topl{display:contents;}',
'.cr-top .cr-hud{grid-column:1/-1;grid-row:2;margin-top:0;}',
'.cr-top .k-h1{font-size:28px;line-height:1;margin:0;}',
'.cr-hud{display:flex;flex-wrap:wrap;gap:2px 8px;align-items:baseline;margin-top:5px;font:700 11.5px/1.25 var(--k-f-text);color:var(--k-ink-2);}',
'.cr-hud b{font:400 9px/1.3 var(--k-f-pixel);color:var(--k-accent);letter-spacing:.04em;text-transform:uppercase;}',
'.cr-topbtns{display:flex;gap:4px;flex-wrap:nowrap;justify-content:flex-end;flex:none;}',
'.cr-topbtns .k-btn{min-height:40px;padding:8px 10px;font-size:12px;}',
'.cr-sec{margin:0 0 14px;}',
'.cr-sec > .k-eyebrow{margin:0 0 8px;}',
/* the identity card */
'.cr-id{margin:0 var(--k-px) 14px;}',
'.cr-id .k-stage{height:240px;}',
'@media (max-width:519px){.cr-id .k-stage{height:216px;}.cr-id .k-id .k-hero{font-size:28px;}}',
'.cr-id .k-id{left:52%;}',
'.cr-id .k-id .k-hero{font-size:30px;line-height:.95;overflow-wrap:anywhere;}',
'.cr-id .k-id .k-tag{white-space:normal;line-height:1.5;text-align:left;}',
'.cr-id .cr-lines{display:grid;gap:3px;padding:10px var(--k-s-4) 0;background:var(--k-panel);}',
'.cr-id .cr-nick{margin:0 0 6px;font:400 10px/1.4 var(--k-f-pixel);color:var(--k-gold);letter-spacing:.04em;}',
'.cr-id .k-strip{gap:8px;border-top:0;}',
'.cr-id .cr-lines + .k-strip{padding-top:10px;}',
'.cr-id .k-stage + .cr-lines{border-top:3px solid var(--k-frame);}',
'.cr-id .k-strip .k-tag{white-space:normal;line-height:1.5;}',
'.cr-id .k-actor img.rtf-baller{display:block;filter:drop-shadow(0 6px 0 rgba(5,7,13,.55));}',
'.cr-id .k-set img{display:block;}',
'.cr-id .k-ovr .k-num{font-size:30px;}',
'@media (max-width:380px){.cr-id .k-id .k-hero{font-size:26px;}}',
/* meters */
'.cr-meters{margin:0 var(--k-px) 14px;padding:6px 4px;}',
/* the site rounds every button; the kit draws pixel corners */
'#s-car button,#s-car input,#cr-sheet button{border-radius:0;}',
'.cr-meters.k-meters{grid-template-columns:repeat(4,minmax(0,1fr));}',
'.cr-meters .k-tip{width:200px;}',
'.cr-m-health{--k-pip:var(--k-good);}.cr-m-morale{--k-pip:var(--k-accent);}.cr-m-fame{--k-pip:var(--k-gold);}.cr-m-trust{--k-pip:var(--k-trust);}',
/* the three facts */
'.cr-facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0 var(--k-px) 14px;}',
'.cr-fact{padding:10px;background:var(--k-panel);box-shadow:0 -2px 0 0 var(--k-frame),0 2px 0 0 var(--k-frame),-2px 0 0 0 var(--k-frame),2px 0 0 0 var(--k-frame);margin:2px;min-width:0;}',
'.cr-fact .k{display:block;font:800 10px var(--k-f-text);letter-spacing:.12em;text-transform:uppercase;color:var(--k-ink-3);}',
'.cr-fact b{display:block;font-family:var(--k-f-pixel);font-size:12px;line-height:1.2;margin:7px 0 5px;color:var(--k-ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
'.cr-fact small{display:block;font-size:11.5px;line-height:1.35;color:var(--k-ink-2);}',
/* the stage: what just happened, then what is next */
'.cr-stage{margin:0 0 14px;}',
'.cr-stage > *{margin-bottom:12px;}',
'.cr-beats{list-style:none;margin:0 var(--k-px) 12px;padding:4px 0;}',
'.cr-beats li{position:relative;padding:8px 10px 8px 28px;font-size:14.5px;line-height:1.45;color:var(--k-ink);border-top:1px dashed rgba(143,160,214,.18);}',
'.cr-beats li:first-child{border-top:0;}',
'.cr-beats li:before{content:"";position:absolute;left:8px;top:14px;width:8px;height:8px;background:var(--k-ink-3);}',
'.cr-beats li.good:before{background:var(--k-good);}',
'.cr-beats li.bad:before{background:var(--k-bad);}',
'.cr-beats li.gold{color:var(--k-gold);font-weight:700;}',
'.cr-beats li.gold:before{background:var(--k-gold);box-shadow:0 0 0 2px #2a2412;}',
'.cr-beats.k-in li{animation:k-in var(--k-m-move) var(--k-e-move) both;}',
'.cr-result .k-what{font-size:15px;line-height:1.5;}',
'.cr-result .cr-you{font:800 11px var(--k-f-text);letter-spacing:.12em;text-transform:uppercase;color:var(--k-ink-3);}',
'.cr-result.good{--cr-tone:var(--k-good);}.cr-result.bad{--cr-tone:var(--k-bad);}.cr-result.gold{--cr-tone:var(--k-gold);}',
'.cr-result{box-shadow:0 calc(var(--k-px)*-1) 0 0 var(--cr-tone,var(--k-frame)),0 var(--k-px) 0 0 var(--cr-tone,var(--k-frame)),calc(var(--k-px)*-1) 0 0 0 var(--cr-tone,var(--k-frame)),var(--k-px) 0 0 0 var(--cr-tone,var(--k-frame));}',
'.cr-result li span{min-width:0;}',
/* the rows a press moved, two to a line so a long receipt does not push the next card off the screen */
'.cr-result ul{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:16px;}',
'.cr-result li{font-size:12.5px;}',
/* the contest table: one row an entrant, names give way before scores do */
'.cr-ct{display:grid;gap:2px;font-size:12.5px;}',
'.cr-ct-r{display:grid;grid-template-columns:minmax(0,1fr) 3.4em 3.4em;gap:8px;align-items:center;padding:5px 8px;background:rgba(143,160,214,.07);color:var(--k-ink-2);}',
'.cr-ct-r span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
'.cr-ct-r span+span{text-align:right;font-variant-numeric:tabular-nums;}',
'.cr-ct-r b{display:inline-block;min-width:1.4em;font-family:var(--k-f-pixel);font-size:9px;color:var(--k-ink-3);}',
'.cr-ct-r i{font-style:normal;color:var(--k-ink-3);}',
'.cr-ct-h{background:none;padding-top:0;padding-bottom:2px;font:800 10px var(--k-f-text);letter-spacing:.12em;text-transform:uppercase;color:var(--k-ink-3);}',
'.cr-ct-r.you{color:var(--k-ink);font-weight:700;box-shadow:inset 3px 0 0 var(--k-accent);}',
'.cr-ct-r.win b,.cr-ct-r.win span+span+span{color:var(--k-gold);}',
/* THE CALL. A decision is the one thing on this screen the game waits on, so
   it does not wear the feed's panel. It is a lit card of its own: an orange
   frame and glow, a band naming where you are (the locker room, your bank
   app) and when, a title in the display face, and each answer a raised tile
   with a numbered key, a line saying what the choice is really about, and an
   arrow. A clutch card is the same card in gold. */
'.cr-card{--cr-edge:var(--k-accent);--cr-edge-ink:var(--k-accent-ink);position:relative;padding:0;overflow:hidden;',
'  background:radial-gradient(120% 70% at 50% 0%,rgba(255,122,26,.16),rgba(255,122,26,0) 60%),linear-gradient(180deg,#1c1424,#120f1d 55%,#0d0c17);',
'  box-shadow:0 0 0 2px var(--cr-edge),0 0 0 4px #05070d,0 0 28px rgba(255,122,26,.28),0 14px 30px rgba(3,5,10,.6);}',
'.cr-card.clutch{--cr-edge:var(--k-gold);--cr-edge-ink:#1a1303;background:radial-gradient(120% 70% at 50% 0%,rgba(255,206,64,.2),rgba(255,206,64,0) 60%),linear-gradient(180deg,#221c10,#141019 60%,#0d0c17);',
'  box-shadow:0 0 0 2px var(--cr-edge),0 0 0 4px #05070d,0 0 30px rgba(255,206,64,.3),0 14px 30px rgba(3,5,10,.6);}',
'.cr-grip{display:none;}',
'.cr-band{display:flex;align-items:center;gap:8px;padding:8px 14px;background:var(--cr-edge);color:var(--cr-edge-ink);',
'  font:400 9px/1.2 var(--k-f-pixel);letter-spacing:.06em;text-transform:uppercase;}',
'.cr-band .k-icon,.cr-band svg{flex:none;}',
'.cr-band .cr-scene{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
'.cr-band .cr-when{margin-left:auto;flex:none;font:800 10px var(--k-f-text);letter-spacing:.14em;opacity:.75;}',
'.cr-cbody{padding:14px 16px 16px;}',
'.cr-card .k-h1{font-size:30px;line-height:1.02;margin:0 0 8px;color:#fff;text-shadow:0 2px 0 #05070d;}',
'#cr-card-h:focus{outline:none;}',
'.cr-card .cr-cbody > p{margin:0 0 12px;color:#d9dcef;font-size:15px;line-height:1.5;}',
/* The narrator: one line in the game's own voice, above the title. */
'.cr-card .cr-cbody > p.cr-lead{margin:0 0 6px;color:#ffb36b;font-size:13px;line-height:1.4;font-style:italic;}',
'.cr-card .k-opts{gap:8px;counter-reset:none;}',
'.cr-choice{position:relative;min-height:58px;padding:11px 40px 11px 12px;align-items:center;background:linear-gradient(180deg,#232c4c,#1a2140);',
'  box-shadow:inset 0 0 0 2px #34416f,inset 0 -4px 0 rgba(0,0,0,.28);transition:box-shadow var(--k-m-snap),background var(--k-m-snap),transform var(--k-m-snap);}',
'.cr-choice .k-key{width:28px;height:28px;font-size:11px;margin:0;background:var(--cr-edge,var(--k-accent));color:var(--cr-edge-ink,var(--k-accent-ink));box-shadow:0 3px 0 #05070d;}',
'.cr-choice .cr-ol{font:700 16px/1.25 var(--k-f-text);color:#fff;}',
'.cr-choice small{font:600 12.5px/1.35 var(--k-f-text);color:#a9b2d6;margin-top:2px;}',
'.cr-choice::after{content:"";position:absolute;right:14px;top:50%;width:9px;height:9px;margin-top:-5px;border:solid var(--cr-edge,var(--k-accent));border-width:3px 3px 0 0;transform:rotate(45deg);opacity:.85;}',
'.cr-hasros{display:flex;gap:4px;align-items:stretch;}',
'.cr-hasros .cr-choice{flex:1 1 auto;min-width:0;padding-right:12px;}',
'.cr-hasros .cr-choice::after{display:none;}',
'.cr-ros{flex:0 0 62px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:6px 4px;border:0;background:linear-gradient(180deg,#232c4c,#1a2140);color:var(--k-ink-2);font:700 10px/1 var(--k-f-text);letter-spacing:.06em;text-transform:uppercase;cursor:pointer;}',
'.cr-ros:hover,.cr-ros:focus-visible{color:#fff;box-shadow:inset 0 0 0 2px var(--cr-edge,var(--k-accent));outline:none;}',
'.cr-rot-ros li{grid-template-columns:2.2em minmax(0,1fr) 2.4em 3.6em;}',
'.cr-ros-h{padding-left:12px;}',
'.cr-ros-deal{margin:-6px 0 10px;color:var(--k-ink-2);}',
'#cr-sheet .cr-rot-ros{max-height:52vh;overflow:auto;}',
'.cr-choice:hover,.cr-choice.is-hover,.cr-choice:focus-visible{background:linear-gradient(180deg,#2b3660,#202a4f);box-shadow:inset 0 0 0 2px var(--cr-edge,var(--k-accent)),inset 0 -4px 0 rgba(0,0,0,.28);outline:none;}',
'.cr-choice:active,.cr-choice.is-pressed{transform:translateY(2px);box-shadow:inset 0 0 0 2px var(--cr-edge,var(--k-accent));}',
/* The answers of a card that has just arrived fade up from .55 while they are
   armed (see arm()). Opacity only, so nothing moves under the thumb. */
'#s-car .cr-arming{opacity:.55;cursor:default;}',
'#s-car .cr-choice,#s-car #cr-next{transition:opacity .22s ease-out;}',
'@media (prefers-reduced-motion:reduce){#s-car .cr-choice,#s-car #cr-next{transition:none;}}',
'.cr-card .k-opts li{animation:cr-opt-in 260ms var(--k-e-move) both;}',
'.cr-card .k-opts li:nth-child(2){animation-delay:50ms;}.cr-card .k-opts li:nth-child(3){animation-delay:100ms;}.cr-card .k-opts li:nth-child(4){animation-delay:150ms;}.cr-card .k-opts li:nth-child(n+5){animation-delay:200ms;}',
'@keyframes cr-opt-in{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}',
/* THE DECISION TRAY. On a phone the card on top is docked to the bottom of the
   screen, always in the same place, with the feed behind it as context. It is
   the same element as the inline card, so every reader of #cr-card and
   .cr-choice is untouched. Capped at 45% of the screen, or it is a modal again,
   and it scrolls inside itself past that. The page is padded by the tray's own
   measured height (--cr-tray) so nothing in the column hides behind it. */
'@media (max-width:719px){',
'  #s-car .cr-card{position:fixed;left:0;right:0;bottom:0;z-index:20;margin:0;max-height:45vh;max-height:45dvh;overflow-y:auto;overscroll-behavior:contain;',
'    padding:0 0 env(safe-area-inset-bottom,0px);animation:none;',
'    box-shadow:0 -2px 0 0 var(--cr-edge),0 -4px 0 0 #05070d,0 -16px 34px rgba(255,122,26,.22),0 -24px 40px rgba(3,5,10,.7);}',
'  #s-car .cr-card.clutch{box-shadow:0 -2px 0 0 var(--cr-edge),0 -4px 0 0 #05070d,0 -16px 34px rgba(255,206,64,.25),0 -24px 40px rgba(3,5,10,.7);}',
'  #s-car .cr-grip{display:block;position:absolute;top:5px;left:50%;width:34px;height:4px;margin-left:-17px;background:var(--cr-edge-ink);opacity:.45;}',
'  #s-car .cr-band{padding:13px 14px 7px;}',
'  #s-car .cr-cbody{padding:11px 14px 12px;}',
'  #s-car .cr-card .k-h1{font-size:24px;margin-bottom:6px;}',
'  #s-car .cr-card .cr-cbody > p{margin:0 0 10px;font-size:14px;line-height:1.45;}',
'  #s-car .cr-card .cr-cbody > p.cr-lead{margin:0 0 4px;font-size:12.5px;line-height:1.35;}',
'  #s-car .cr-card .cr-cbody > p.cr-clamp{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}',
'  #s-car .cr-card .k-opts{gap:7px;}',
'  #s-car .cr-card .cr-choice{min-height:52px;padding-top:9px;padding-bottom:9px;}',
'  #s-car .cr-card .cr-choice .cr-ol{font-size:15px;}',
/* the feed behind the tray dims as it reaches it, so the card reads as on top */
'  #s-car.cr-has-tray::before{content:"";position:fixed;left:0;right:0;bottom:var(--cr-tray,0px);height:84px;z-index:19;pointer-events:none;background:linear-gradient(180deg,rgba(5,7,13,0),rgba(5,7,13,.78));}',
'  #s-car .cr-tray-rise{animation:cr-tray-rise 200ms var(--k-e-move) both;}',
'  #s-car .cr-tray-swap > *{animation:cr-tray-swap 180ms ease-out both;}',
'  #s-car.cr-has-tray .cr-main{padding-bottom:calc(var(--cr-tray,0px) + 12px);}',
'  #s-car.screen.active{animation-name:cr-scrin;}',
'}',
'.cr-more{margin:-4px 0 10px;padding:4px 0;background:none;border:0;color:var(--k-accent);font:800 11px var(--k-f-text);letter-spacing:.12em;text-transform:uppercase;cursor:pointer;}',
'.cr-more[hidden]{display:none;}',
'@keyframes cr-tray-rise{from{transform:translateY(100%);}to{transform:none;}}',
'@keyframes cr-tray-swap{from{opacity:0;}to{opacity:1;}}',
/* A position:fixed tray inside a transformed screen is positioned against the
   screen, not the window, so the career screen enters on opacity alone. */
'@keyframes cr-scrin{from{opacity:0;}to{opacity:1;}}',
/* the receipt's moved rows, folded on a phone to one line you can open */
'.cr-rows > summary{cursor:pointer;list-style:none;font-size:12.5px;color:var(--k-ink-2);padding:6px 0 2px;}',
'.cr-rows > summary::-webkit-details-marker{display:none;}',
'.cr-rows > summary b{color:var(--k-accent);font:800 10px var(--k-f-text);letter-spacing:.12em;text-transform:uppercase;margin-left:6px;}',
'.cr-rows[open] > summary b.op{display:none;}.cr-rows:not([open]) > summary b.cl{display:none;}',
'.cr-rows > summary .up{color:var(--k-good);}.cr-rows > summary .down{color:var(--k-bad);}',
'@media (prefers-reduced-motion:reduce){#s-car .cr-tray-rise,#s-car .cr-tray-swap > *,.cr-card .k-opts li{animation:none;}}',
'.cr-acts{display:flex;gap:4px;flex-wrap:wrap;margin:0;}',
'.cr-acts .k-btn{flex:1 1 0;min-width:120px;font-size:12.5px;padding:10px;}',
/* the action the thumb reaches: pinned to the bottom of the column */
'.cr-dock{position:sticky;bottom:0;z-index:5;padding:10px 0 calc(10px + env(safe-area-inset-bottom,0px));margin:0 -2px;',
'  background:linear-gradient(180deg,rgba(10,13,24,0),var(--k-floor) 34%);}',
'.cr-dock[hidden]{display:none;}',
'.cr-dock .k-btn{margin-bottom:6px;}',
/* draft night */
'.cr-draft{position:relative;overflow:hidden;padding:0;text-align:center;}',
'.cr-draft .cr-dset{position:absolute;inset:0;display:flex;justify-content:center;opacity:.55;}',
'.cr-draft .cr-dset img{height:100%;width:auto;}',
'.cr-draft .cr-din{position:relative;padding:22px 14px;background:linear-gradient(180deg,rgba(5,7,13,.35),rgba(5,7,13,.8));}',
'.cr-draft .tick{font-family:var(--k-f-pixel);font-size:9px;line-height:1.7;color:var(--k-ink-2);min-height:32px;text-transform:uppercase;}',
'.cr-draft .pk{font-family:var(--k-f-pixel);font-size:44px;line-height:1;margin:12px 0;color:var(--k-team-ink);text-shadow:4px 4px 0 var(--k-shade);}',
'.cr-draft .tm{font-family:var(--k-f-display);font-size:30px;text-transform:uppercase;line-height:1;}',
/* ratings, season, tabs */
'.cr-rt{display:grid;gap:7px;}',
'.cr-rt .k-row{grid-template-columns:100px minmax(0,1fr) 28px 34px;}',
'@media (min-width:560px) and (max-width:919px){.cr-rt.cr-two{grid-template-columns:1fr 1fr;column-gap:22px;}}',
'.cr-rt .k-row.is-key span:first-child:after{content:"";display:inline-block;width:5px;height:5px;margin-left:6px;vertical-align:2px;background:var(--k-good);}',
'.cr-tabs{margin:0 0 12px;}',
'.cr-tabs .k-tab{min-width:0;font-size:11px;letter-spacing:.08em;}',
/* ONE ROW OF TABS, each an icon over its word. Seven tabs were three rows of
   text on a phone; one row scrolls sideways and reads like a game menu. */
'.cr-tabsec{position:relative;}',
'.cr-tabsec.k-more-r::after{content:"";position:absolute;top:14px;right:14px;width:28px;height:52px;pointer-events:none;background:linear-gradient(90deg,rgba(17,22,40,0),var(--k-panel));}',
/* the rotation: one row a player, names give way before numbers do */
'.cr-rot{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:2px;}',
'.cr-rot li{display:grid;grid-template-columns:2em minmax(0,1fr) 2.4em 3.4em 2.8em 2.8em;gap:8px;align-items:center;padding:6px 8px;background:rgba(143,160,214,.07);font-size:13px;color:var(--k-ink-2);}',
'.cr-rot .who{min-width:0;display:grid;}',
'.cr-rot .who b,.cr-rot .who small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
'.cr-rot .who b{color:var(--k-ink);font-weight:600;}',
'.cr-rot .who small{color:var(--k-ink-3);font-size:11px;}',
'.cr-rot .v{text-align:right;font-variant-numeric:tabular-nums;}',
'.cr-rot .v.ovr{font-family:var(--k-f-pixel);font-size:11px;color:var(--k-ink);}',
'.cr-rot .n{font-family:var(--k-f-pixel);font-size:9px;color:var(--k-ink-3);}',
'.cr-rot li.you{box-shadow:inset 3px 0 0 var(--k-accent);background:rgba(255,140,40,.10);}',
'.cr-rot li.you .who b{font-weight:800;}',
'.cr-rot li.dnp{opacity:.6;}',
'.cr-rot li.cr-rot-h,.cr-rot li.cr-rot-sep{background:none;padding-top:8px;padding-bottom:2px;font:800 10px var(--k-f-text);letter-spacing:.12em;text-transform:uppercase;color:var(--k-ink-3);}',
'.cr-rot li.cr-rot-sep{display:block;}',
'.cr-rot-line{margin:10px 0 0;}',
/* six tabs are two rows of three on a phone */
'@media (max-width:519px){.cr-tabs.k-tabs:not(.k-itabs){display:grid;grid-template-columns:repeat(3,minmax(0,1fr));}}',
/* the people around you: a name, who they are, a meter that runs both ways */
'.cr-ppl{list-style:none;margin:0;padding:0;}',
'.cr-ppl li{display:grid;grid-template-columns:minmax(0,1fr) 96px;gap:4px 12px;padding:9px 0;border-top:1px solid rgba(143,160,214,.12);}',
'.cr-ppl li:first-child{border-top:0;}',
'.cr-ppl b{display:block;font-size:14px;color:var(--k-ink);}',
'.cr-ppl small{display:block;font-size:12px;color:var(--k-ink-3);}',
'.cr-ppl .note{grid-column:1/-1;font-size:12.5px;color:var(--k-ink-2);}',
'.cr-rel{position:relative;align-self:center;height:10px;background:var(--k-panel-2);box-shadow:0 0 0 2px var(--k-frame);}',
'.cr-rel i{position:absolute;top:0;bottom:0;}',
'.cr-rel i.up{left:50%;background:var(--k-good);}',
'.cr-rel i.dn{right:50%;background:var(--k-bad);}',
'.cr-rel:after{content:"";position:absolute;left:50%;top:-3px;bottom:-3px;width:2px;background:var(--k-ink-3);}',
/* legacy */
'.cr-leg{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:0 0 12px;}',
'.cr-leg div{padding:10px 6px;text-align:center;background:var(--k-panel-2);}',
'.cr-leg b{display:block;font-family:var(--k-f-pixel);font-size:9px;line-height:1.5;color:var(--k-ink);overflow-wrap:anywhere;}',
'.cr-leg span{display:block;margin-top:5px;font:800 9px var(--k-f-text);letter-spacing:.1em;text-transform:uppercase;color:var(--k-ink-3);}',
'.cr-list{list-style:none;margin:0;padding:0;}',
'.cr-list li{font-size:13.5px;line-height:1.45;padding:6px 0;border-top:1px solid rgba(143,160,214,.12);color:var(--k-ink-2);}',
'.cr-list li:first-child{border-top:0;}',
'.cr-list li.met{color:var(--k-good);}',
'.cr-list li .yr{display:inline-block;min-width:44px;color:var(--k-ink-3);font-family:var(--k-f-pixel);font-size:8px;}',
/* the news */
'.cr-feed{list-style:none;margin:0;padding:0;max-height:460px;overflow:auto;}',
'.cr-feed li{padding:8px 0;border-top:1px solid rgba(143,160,214,.12);font-size:13.5px;line-height:1.45;color:var(--k-ink);}',
'.cr-feed li:first-child{border-top:0;}',
'.cr-feed .src{display:block;font:800 9px var(--k-f-text);letter-spacing:.12em;text-transform:uppercase;color:var(--k-ink-3);margin-bottom:2px;}',
'.cr-feed li.debate{color:var(--k-ink-2);font-style:italic;}',
'.cr-st2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}',
'.cr-st-h{font:800 10px var(--k-f-text);letter-spacing:.12em;text-transform:uppercase;color:var(--k-ink-3);}',
'.cr-st{list-style:none;margin:4px 0 0;padding:0;font-size:12.5px;}',
'.cr-st li{display:flex;justify-content:space-between;gap:6px;padding:2px 0;color:var(--k-ink-2);border-top:1px solid rgba(143,160,214,.08);}',
'.cr-st li:nth-child(6),.cr-st li:nth-child(10){border-top-color:rgba(143,160,214,.35);}',
'.cr-st li span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
'.cr-st .v{font-variant-numeric:tabular-nums;}',
'.cr-st li.you,.cr-tx li.you{color:var(--k-ink);font-weight:700;}',
'.cr-tx{max-height:340px;}',
'.cr-picks{line-height:1.6;}',
'.cr-picks .owe{color:var(--k-ink-3);}',
'.cr-race{width:100%;margin:0 0 12px;}',
'.cr-race tr.you td{color:var(--k-gold);font-weight:800;}',
'.cr-known{display:flex;flex-wrap:wrap;gap:6px;padding:0 var(--k-s-4) 12px;background:var(--k-panel);}',
'.cr-known .k-tag{white-space:normal;line-height:1.5;}',
'.cr-log{list-style:none;margin:0;padding:0;max-height:440px;overflow:auto;}',
'.cr-log li{font-size:13.5px;line-height:1.45;padding:7px 0;border-top:1px solid rgba(143,160,214,.12);color:var(--k-ink-2);display:flex;gap:10px;}',
'.cr-log li .yr{flex:0 0 44px;color:var(--k-ink-3);font-family:var(--k-f-pixel);font-size:8px;line-height:2.3;}',
'.cr-log li.gold{color:var(--k-gold);}',
'.cr-log li.good{color:var(--k-ink);}',
'.cr-tbl tr.champ td{color:var(--k-gold);}',
/* a table becomes a list of cards on a phone, so nothing scrolls sideways */
'@media (max-width:519px){',
'  .cr-tblw{overflow:visible;}',
'  .cr-tbl thead{display:none;}',
'  .cr-tbl,.cr-tbl tbody{display:block;}',
'  .cr-tbl tr{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px 8px;padding:10px 2px;border-bottom:1px solid rgba(143,160,214,.14);}',
'  .cr-tbl td{display:block;padding:0;border:0;text-align:left;white-space:normal;}',
'  .cr-tbl td:before{content:attr(data-l);display:block;font:800 9px var(--k-f-text);letter-spacing:.1em;text-transform:uppercase;color:var(--k-ink-3);}',
'  .cr-tbl td.cr-wide{grid-column:span 2;}',
'  .cr-tbl.cr-vs tr{grid-template-columns:repeat(3,minmax(0,1fr));}',
'}',
'.cr-vs td.win{color:var(--k-good);font-weight:800;}',
'.cr-aw{display:flex;flex-direction:column;gap:8px;}',
'.cr-awgrid{display:flex;flex-wrap:wrap;gap:8px;}',
/* No frame round an icon: at 7 by 7 cells a 2px border was a second outline
   round the icon's own, and the two together were most of what the eye saw.
   The tile is a soft tint of the icon's own colour, and the level is a short
   bar under it rather than a ring round it. */
'.cr-awi{position:relative;width:54px;height:54px;display:grid;place-items:center;background:var(--k-panel-2);background:color-mix(in srgb,var(--ic,#b8c3e6) 15%,var(--k-panel-2));border:0;cursor:pointer;padding:0;}',
'.cr-awi:after{content:"";position:absolute;left:14px;right:14px;bottom:3px;height:3px;background:var(--lv,transparent);}',
'.cr-awi-pro{--lv:#c9a23a;}.cr-awi-col{--lv:#4f73b8;}.cr-awi-hs{--lv:#2e8a62;}',
'.cr-awi.on{outline:2px solid var(--k-ink);outline-offset:1px;}',
'.cr-awi i{position:absolute;right:-6px;top:-6px;min-width:18px;height:18px;padding:0 4px;background:#ff7a1a;color:#0b0e1a;font:700 11px/18px var(--k-f-pixel);font-style:normal;text-align:center;border:2px solid #0b0e1a;}',
'.cr-awcap{font-size:13px;color:var(--k-ink-2);min-height:18px;}',
'.cr-aw .k-tag{white-space:normal;line-height:1.5;}',
'.cr-tot{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:0 0 14px;}',
'.cr-tot div{padding:10px 4px;text-align:center;background:var(--k-panel-2);}',
'.cr-tot b{display:block;font-family:var(--k-f-pixel);font-size:12px;line-height:1.3;color:var(--k-ink);}',
'.cr-tot span{display:block;margin-top:5px;font:800 9px var(--k-f-text);letter-spacing:.1em;text-transform:uppercase;color:var(--k-ink-3);}',
'.cr-sub{font:800 11px var(--k-f-text);letter-spacing:.14em;text-transform:uppercase;color:var(--k-ink-3);margin:18px 0 8px;}',
'.cr-rivalpic{display:flex;align-items:center;gap:10px;}',
'.cr-rivalpic .rtf-baller{flex:0 0 auto;}',
'.cr-rivalwho{font-size:13.5px;color:var(--k-ink-2);margin:0 0 6px;}',
'.cr-lifeline{font-size:13.5px;color:var(--k-ink-2);margin:14px 0 0;}',
'.cr-lifeline b{color:var(--k-ink);}',
/* the Hall of Fame card */
'.cr-final{position:relative;overflow:hidden;padding:0;margin:var(--k-px) var(--k-px) 16px;text-align:center;}',
'.cr-final .cr-hset{position:absolute;inset:0;display:flex;justify-content:center;opacity:.5;}',
'.cr-final .cr-hset img{height:100%;width:auto;}',
'.cr-final .cr-hin{position:relative;padding:22px 16px;background:linear-gradient(180deg,rgba(5,7,13,.2),rgba(5,7,13,.86) 55%,var(--k-panel));}',
'.cr-final .eye{font-family:var(--k-f-pixel);font-size:9px;color:var(--k-gold);text-transform:uppercase;}',
'.cr-final .v{font-family:var(--k-f-display);font-size:44px;line-height:.95;margin:10px 0 8px;text-transform:uppercase;color:#fff;text-shadow:4px 4px 0 var(--k-shade);}',
'.cr-final .nm{font-family:var(--k-f-pixel);font-size:9px;line-height:1.7;color:var(--k-ink-2);}',
'.cr-final p{margin:10px auto 0;max-width:34em;color:var(--k-ink-2);}',
'.cr-final p.cr-col{color:var(--k-ink);font-weight:700;}',
'.cr-final .rtf-baller{display:block;margin:4px auto 6px;filter:drop-shadow(0 6px 0 rgba(5,7,13,.55));}',
'.cr-final .cr-tot{margin:16px 0 0;}',
'.cr-final .cr-aw{align-items:center;margin-top:14px;}.cr-final .cr-awgrid{justify-content:center;}',
'.cr-aw.cr-awrow{flex-direction:row;flex-wrap:wrap;}',
'.cr-epi p{margin:0 0 12px;font-size:14.5px;line-height:1.5;}',
'.cr-epi p:last-child{margin:0;}',
'.cr-epi .cr-secret{color:var(--k-gold);font-weight:800;}',
'.cr-epi .cr-secret .k{color:var(--k-gold);}',
'.cr-road{margin:0 0 12px;font-size:14px;line-height:1.5;color:var(--k-ink-2);}',
'.cr-roadbox{margin:0 0 12px;}.cr-roadbox .cr-list{margin:0;}',
'.cr-reveal li{animation:cr-roadin .4s steps(4,end) both;}',
'@keyframes cr-roadin{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;}}',
'@media (prefers-reduced-motion:reduce){.cr-reveal li{animation:none;}}',
'details.cr-roadbox > summary,details.cr-rtfold > summary{cursor:pointer;list-style:none;margin:0;min-height:28px;display:flex;align-items:center;}',
'details.cr-roadbox > summary::-webkit-details-marker,details.cr-rtfold > summary::-webkit-details-marker{display:none;}',
'details.cr-roadbox > summary:after,details.cr-rtfold > summary:after{content:"+";margin-left:auto;font:normal 12px var(--k-f-pixel);color:var(--k-ink-3);}',
'details.cr-roadbox[open] > summary:after,details.cr-rtfold[open] > summary:after{content:"-";}',
'details.cr-roadbox[open] > summary,details.cr-rtfold[open] > summary{margin-bottom:8px;}',
'.cr-rtsum{margin-left:auto;margin-right:10px;font:700 12px var(--k-f-text);letter-spacing:0;text-transform:none;color:var(--k-ink-2);}',
/* Phase E: the legacy banner, the story, the Vault */
'.cr-son{margin:0 0 12px;}.cr-son p{margin:6px 0 0;font-size:14px;line-height:1.45;}',
'.cr-gen{display:flex;align-items:center;gap:8px;margin:-4px 0 10px;font:800 11px var(--k-f-text);letter-spacing:.12em;text-transform:uppercase;color:var(--k-gold);}',
'.cr-story h3.cr-sub:first-of-type{margin-top:4px;}',
'.cr-story p{margin:4px 0 10px;font-size:14.5px;line-height:1.55;color:var(--k-ink);}',
'.cr-sonbtn{margin:0 0 14px;}',
'.cr-chres{margin:0 var(--k-px) 12px;}.cr-chres p{margin:6px 0 0;font-size:14px;}',
'.cr-easy{margin:0 var(--k-px) 12px;}',
'.cr-found{margin:0 var(--k-px) 12px;}.cr-found .cr-aw{margin-top:8px;}',
'.cr-vsum{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;margin:0 var(--k-px) 14px;}',
'.cr-vsum .k-num{font-size:26px;color:var(--k-gold);}',
'.cr-vbar{flex:1 1 140px;height:10px;background:var(--k-panel-3);box-shadow:0 0 0 2px var(--k-frame);}',
'.cr-vbar i{display:block;height:100%;background:var(--k-gold);transform-origin:left;}',
/* A long section of the Hall card is a fold, so the verdict and the buttons
   are the first screen and the season table is one tap away. */
/* the Vault's shelves: a name, a count and a bar, folded when empty and long */
'.cr-shelf{margin:0 0 6px;}',
'.cr-shelf > summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:10px;padding:10px 2px;border-top:2px solid var(--k-frame);}',
'.cr-shelf:first-child > summary{border-top:0;}',
'.cr-shelf > summary::-webkit-details-marker{display:none;}',
'.cr-shelf > summary::after{content:"+";font:400 11px var(--k-f-pixel);color:var(--k-accent);}',
'.cr-shelf[open] > summary::after{content:"-";}',
'.cr-shn{font:800 11px var(--k-f-text);letter-spacing:.12em;text-transform:uppercase;color:var(--k-ink-2);}',
'.cr-shc{font:400 9px var(--k-f-pixel);color:var(--k-gold);white-space:nowrap;}',
'.cr-shbar{flex:1 1 60px;height:6px;}',
'.cr-back .k-ico{}',
'@media (max-width:359px){.cr-top .k-h1{font-size:24px;}}',
'.cr-vgrid{list-style:none;margin:6px 0 14px;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px;}',
'.cr-vgrid li{display:flex;align-items:center;gap:8px;min-height:40px;padding:6px 8px;font:700 12.5px/1.25 var(--k-f-text);background:var(--k-panel-2);box-shadow:0 0 0 2px var(--k-frame);}',
'.cr-vgrid li.got{color:var(--k-ink);box-shadow:0 0 0 2px var(--k-gold);}',
'.cr-vgrid li.no{color:var(--k-ink-3);}',
'.cr-arc{list-style:none;margin:0;padding:0;}',
'.cr-arc li{border-top:1px solid rgba(143,160,214,.12);}.cr-arc li:first-child{border-top:0;}',
'.cr-aentry{display:flex;align-items:center;gap:12px;width:100%;min-height:56px;padding:6px 4px;background:none;border:0;color:var(--k-ink);text-align:left;cursor:pointer;font:inherit;}',
'button.cr-aentry:hover,button.cr-aentry:focus-visible{background:var(--k-panel-2);}',
'.cr-aentry.big{padding:10px 0;}',
'.cr-apic{flex:0 0 44px;display:flex;justify-content:center;}.cr-aentry.big .cr-apic{flex-basis:88px;}',
'.cr-apic img{height:64px;width:auto;}.cr-aentry.big .cr-apic img{height:128px;}',
'.cr-awho{min-width:0;display:grid;gap:2px;}.cr-awho b{font-size:15px;}.cr-awho small{font-size:12px;color:var(--k-ink-2);}',
'.cr-tree,.cr-tree ul{list-style:none;margin:0;padding:0;}',
'.cr-tree ul{margin-left:22px;padding-left:12px;border-left:3px solid var(--k-frame);}',
'.cr-tree{margin:0 0 14px;}',
'.cr-lockbox{display:grid;justify-items:start;gap:10px;padding:6px 0;}.cr-lockbox p{margin:0;font-size:14px;line-height:1.5;}',
'.cr-opt .cr-pro{margin-left:6px;vertical-align:2px;font-size:10px;}',
'.cr-opt.cr-locked b{color:var(--k-ink-2);}',
'.cr-epi .k{display:block;font:800 10px var(--k-f-text);letter-spacing:.14em;text-transform:uppercase;color:var(--k-ink-3);margin-bottom:3px;}',
'.cr-place{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 var(--k-px) 14px;font-size:14px;color:var(--k-ink-2);}',
'.cr-place b{color:var(--k-ink);}',
'.cr-place[hidden]{display:none;}',
'.cr-place .k-btn{flex:0 0 auto;min-height:40px;font-size:12px;padding:8px 12px;}',
'.cr-btnrow{display:flex;gap:4px;flex-wrap:wrap;margin:0 0 16px;}',
'.cr-btnrow .k-btn{flex:1 1 160px;}',
/* sheets */
'#cr-sheet .k-sheet h3{margin:0 0 4px;}',
'#cr-sheet .cash{font-size:14px;color:var(--k-ink-2);margin:0 0 14px;}',
'.cr-actrow{display:flex;gap:10px;align-items:center;padding:12px 0;border-top:1px solid rgba(143,160,214,.14);}',
'.cr-actrow > div{flex:1 1 auto;min-width:0;}',
'.cr-actrow b{display:block;font-size:15px;}',
'.cr-actrow small{display:block;color:var(--k-ink-2);font-size:12.5px;line-height:1.4;}',
'.cr-actrow .k-btn{flex:0 0 auto;min-height:42px;font-size:12px;padding:8px 12px;}',
/* the builder */
'.cr-build .lab{display:block;margin:18px 0 8px;}',
'.cr-build .cr-intro{margin:0;color:var(--k-ink-2);font-size:14px;}',
'.cr-name{display:flex;gap:6px;}',
'.cr-name input{flex:1 1 auto;min-width:0;font:700 16px var(--k-f-text);color:var(--k-ink);background:var(--k-panel-2);border:0;padding:12px;margin:2px;',
'  box-shadow:0 -2px 0 0 var(--k-frame),0 2px 0 0 var(--k-frame),-2px 0 0 0 var(--k-frame),2px 0 0 0 var(--k-frame);}',
'.cr-name input:focus{outline:2px solid var(--k-gold);outline-offset:3px;}',
'.cr-name .cr-num{flex:0 0 64px;text-align:center;font-family:var(--k-f-pixel);font-size:14px;}',
'.cr-name .k-btn{margin:2px;min-height:46px;}',
'.cr-arc{margin:0 0 14px;padding:12px;background:var(--k-panel-2);}',
'.cr-archead{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin:0 0 8px;}',
'.cr-archead b{white-space:nowrap;font-family:var(--k-f-pixel);font-size:10px;letter-spacing:.06em;color:var(--k-ink);text-transform:uppercase;}',
'.cr-archead span{font:600 11.5px var(--k-f-text);color:var(--k-ink-3);text-align:right;}',
'.cr-arcbars{display:flex;align-items:flex-end;gap:2px;height:96px;padding-top:18px;border-bottom:1px solid var(--k-ink-3);}',
'.cr-arcb{position:relative;flex:1 1 0;min-width:0;height:100%;display:flex;align-items:flex-end;padding:0;border:0;background:transparent;cursor:pointer;}',
'.cr-arcb span{display:block;width:100%;background:#e8660f;border-radius:4px 4px 0 0;}',
'.cr-arcb.am span{background:#5b8fe6;}',
'.cr-arcb:hover span,.cr-arcb:focus-visible span,.cr-arcb.on span{box-shadow:0 0 0 2px var(--k-ink);}',
'.cr-arcb:focus-visible{outline:none;}',
'.cr-arcb em{position:absolute;left:50%;transform:translateX(-50%);top:-17px;font:normal 9px var(--k-f-pixel);color:var(--k-ink);white-space:nowrap;pointer-events:none;}',
'.cr-arcb .cr-arcring{position:absolute;left:50%;width:9px;height:9px;margin-left:-5px;top:-4px;border:2px solid var(--k-ink);border-radius:50%;pointer-events:none;}',
'.cr-arcb.pk .cr-arcring{top:-28px;}',
'.cr-arcx{display:flex;justify-content:space-between;margin-top:4px;font:600 11px var(--k-f-text);color:var(--k-ink-3);}',
'.cr-arcleg{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:6px;font:600 11.5px var(--k-f-text);color:var(--k-ink-2);}',
'.cr-arcleg:empty{display:none;}',
'.cr-arcleg i{display:inline-block;width:10px;height:10px;margin-right:5px;vertical-align:-1px;background:#e8660f;border-radius:2px;}',
'.cr-arcleg i.am{background:#5b8fe6;}',
'.cr-arcleg i.ring{background:transparent;border:2px solid var(--k-ink);border-radius:50%;}',
'.cr-arccap{margin:8px 0 0;font:600 13px/1.4 var(--k-f-text);color:var(--k-ink);min-height:1.4em;}',
'.cr-namehint{margin:6px 2px 0;min-height:1.35em;font:600 12.5px/1.4 var(--k-f-text);color:var(--k-ink-3);}',
'.cr-namehint.bad{color:var(--k-warn);}',
'.cr-namefix{display:inline-block;margin:4px 0 0;padding:4px 8px;border:0;font:800 12px var(--k-f-text);color:var(--k-accent-ink);background:var(--k-accent);cursor:pointer;}',
'.cr-namefix:focus-visible{outline:2px solid var(--k-gold);outline-offset:2px;}',
'.cr-chips{display:flex;gap:4px;flex-wrap:wrap;}',
'.cr-size{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;}',
'.cr-step{display:grid;grid-template-columns:auto 1fr auto;grid-template-rows:auto auto;align-items:center;gap:4px 6px;}',
'.cr-step .k-label{grid-column:1/-1;}',
'.cr-step .k-btn{min-width:40px;min-height:44px;padding:0;font-size:20px;}',
'.cr-step output{text-align:center;white-space:nowrap;font:700 16px var(--k-f-text);font-variant-numeric:tabular-nums;color:var(--k-ink);}',
'.cr-chips .k-chip{flex:1 1 0;min-width:52px;}',
'.cr-opts{display:grid;grid-template-columns:1fr 1fr;gap:8px;}',
'@media (max-width:379px){.cr-opts{grid-template-columns:1fr;}}',
'.cr-opt{display:block;width:100%;text-align:left;cursor:pointer;border:0;padding:12px;margin:2px;color:var(--k-ink);background:var(--k-panel-2);font:inherit;',
'  box-shadow:0 -2px 0 0 var(--k-frame),0 2px 0 0 var(--k-frame),-2px 0 0 0 var(--k-frame),2px 0 0 0 var(--k-frame);transition:background var(--k-m-quick);}',
'.cr-opt:hover{background:var(--k-panel-3);}',
'.cr-opt b{display:block;font-size:14.5px;font-weight:800;margin-bottom:3px;}',
'.cr-opt small{display:block;font-size:12.5px;color:var(--k-ink-2);line-height:1.4;}',
'.cr-opt.on{background:#2a2412;box-shadow:0 -2px 0 0 var(--k-gold),0 2px 0 0 var(--k-gold),-2px 0 0 0 var(--k-gold),2px 0 0 0 var(--k-gold);}',
'.cr-opt.on b:before{content:"";display:inline-block;width:6px;height:6px;margin-right:7px;background:var(--k-gold);vertical-align:2px;}',
'.cr-preview{display:grid;grid-template-columns:auto minmax(0,1fr);gap:14px;align-items:center;margin:18px 0 6px;}',
'.cr-preview .cr-pfig{position:relative;width:132px;height:176px;overflow:hidden;background:var(--k-floor);}',
'.cr-preview .cr-pfig .k-px{position:absolute;left:50%;top:0;transform:translateX(-50%);height:100%;width:auto;}',
'.cr-preview .cr-pfig .rtf-baller{position:absolute;left:50%;bottom:4px;transform:translateX(-50%);}',
'.cr-preview .cr-povr{margin:0 0 10px;}',
'.cr-preview .cr-povr .k-num{font-size:28px;margin-right:8px;}',
'@media (max-width:419px){.cr-preview{grid-template-columns:1fr;}.cr-preview .cr-pfig{width:100%;}}',
'.cr-town{margin:12px 0 0;font-size:14px;color:var(--k-ink);font-weight:700;}',
'.cr-grade{font-size:13px;color:var(--k-ink-2);margin:8px 0 16px;}',
'.cr-grade b{color:var(--k-gold);}',
/* the builder in steps: the player on top, four tabs, a pinned start */
'.cr-build .cr-preview{grid-template-columns:96px minmax(0,1fr);gap:12px;align-items:start;margin:0 0 12px;}',
'.cr-build .cr-preview .cr-pfig{width:96px;height:140px;}',
'.cr-build .cr-pside{min-width:0;}',
'.cr-build .cr-povr{display:flex;align-items:baseline;gap:6px;margin:0 0 6px;}',
'.cr-build .cr-povr .k-num{font-size:26px;margin:0;}',
'.cr-ceil{margin-left:auto;font:800 11px var(--k-f-text);letter-spacing:.08em;text-transform:uppercase;color:var(--k-ink-2);}',
'.cr-ceil b{color:var(--k-gold);}',
'.cr-build .cr-rt{gap:3px;}',
'.cr-build .cr-rt .k-row{grid-template-columns:84px minmax(0,1fr) 22px 0;font-size:11.5px;min-height:0;}',
'.cr-build .cr-rt .k-row .k-delta{display:none;}',
'.cr-steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;margin:0 0 4px;}',
'.cr-stab{display:flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:0 4px;border:0;cursor:pointer;font:800 12.5px var(--k-f-text);color:var(--k-ink-2);background:var(--k-panel-2);}',
'.cr-stab i{font:normal 8px var(--k-f-pixel);color:var(--k-ink-3);}',
'.cr-stab.on{color:#160b02;background:var(--k-gold);}',
'.cr-stab.on i{color:#160b02;}',
'.cr-stab:focus-visible{outline:2px solid var(--k-gold);outline-offset:2px;}',
'.cr-pane[hidden]{display:none;}',
'.cr-pane > .lab:first-child,.cr-pane > .cr-intro:first-child{margin-top:14px;}',
'.cr-pane > .cr-look{margin-top:14px;}',
'.cr-opts.cr-pick{grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;}',
'.cr-opts.cr-pick .cr-opt{padding:10px;min-height:44px;}',
'.cr-opts.cr-pick .cr-opt b{font-size:13px;margin:0;}',
'.cr-opts.cr-pick .cr-opt small{display:none;}',
'.cr-look.cr-look-nofig{display:block;}',
'.cr-look.cr-look-nofig > div:first-child{position:static;padding:0;background:none;}',
'.cr-look-nofig .cr-sw{gap:2px;}',
'.cr-look-nofig .cr-sw button.dot{width:30px;height:30px;margin:2px;}',
'.cr-build .cr-preview .cr-pfig.cr-zoom .rtf-baller{bottom:auto;top:-4px;}',
'.cr-look-nofig [aria-label="Facial hair color"] button.dot{width:26px;height:26px;}',
'.cr-look-nofig [aria-label="Facial hair color"] button:first-child{padding:6px 8px;}',
'.cr-look-nofig .cr-sw button{padding:6px 9px;}',
'.cr-cta{position:sticky;bottom:0;z-index:5;display:flex;gap:6px;margin:16px -16px -16px;padding:10px 16px calc(10px + env(safe-area-inset-bottom));background:linear-gradient(180deg,rgba(13,17,32,.86),#0d1120 40%);}',
'.cr-cta #cr-go{flex:1 1 auto;margin:0;font-size:15px;padding:0 10px;}',
'.cr-cta #cr-bnext{flex:0 0 auto;margin:0;min-height:52px;display:inline-flex;align-items:center;gap:8px;}',
'@media (min-width:720px){.cr-opts.cr-pick{grid-template-columns:repeat(3,minmax(0,1fr));}}',
/* the look chooser (the options are the sprite\'s and are not changed here) */
'.cr-look{display:grid;grid-template-columns:auto minmax(0,1fr);gap:14px;align-items:start;}',
'.cr-look > div:first-child{position:sticky;top:64px;padding:8px;background:var(--k-panel-2);}',
'.cr-lrow{margin:0 0 10px;}',
'.cr-lrow .k{display:block;margin:0 0 6px;}',
'.cr-sw{display:flex;flex-wrap:wrap;gap:4px;}',
'.cr-sw button{min-height:36px;min-width:0;padding:6px 10px;margin:2px;font:700 12.5px var(--k-f-text);cursor:pointer;color:var(--k-ink-2);background:var(--k-panel-2);border:0;',
'  box-shadow:0 -2px 0 0 var(--k-frame),0 2px 0 0 var(--k-frame),-2px 0 0 0 var(--k-frame),2px 0 0 0 var(--k-frame);}',
'.cr-sw button.on{color:var(--k-ink);background:#2a2412;box-shadow:0 -2px 0 0 var(--k-gold),0 2px 0 0 var(--k-gold),-2px 0 0 0 var(--k-gold),2px 0 0 0 var(--k-gold);}',
'.cr-sw button.dot{width:32px;height:32px;min-height:0;padding:0;}',
'.cr-sw button.dot.on{box-shadow:0 -3px 0 0 var(--k-gold),0 3px 0 0 var(--k-gold),-3px 0 0 0 var(--k-gold),3px 0 0 0 var(--k-gold);}',
'.cr-gear summary{cursor:pointer;font:800 12px var(--k-f-text);letter-spacing:.1em;text-transform:uppercase;color:var(--k-ink-2);margin:4px 0 10px;min-height:32px;}',
'@media (max-width:379px){.cr-look{grid-template-columns:1fr;}.cr-look > div:first-child{position:static;text-align:center;}}',
/* the player, drawn (hoops/baller.js), always at a whole-number scale */
'img.rtf-baller{image-rendering:pixelated;image-rendering:crisp-edges;}',
'.ch-cur .rtf-baller{flex:0 0 auto;height:80px;width:auto;margin:-8px 0 -10px -2px;}',
'@media (prefers-reduced-motion:reduce){.cr-beats.k-in li{animation:none;}}',
'/* ═══ THE VISUAL LEAP ═══════════════════════════════════════════════════════',
'   Every Career screen stands in the same arena: a fixed backdrop lit in the',
'   club of colours, menu panels with a lit top edge and a hard pixel drop, a',
'   header strip on every section, LED scoreboards for the numbers that change,',
'   cartridge tabs, a timeline for the story, a trophy case for the awards, a',
'   ceremony for the Hall card, a plaque wall for the Vault and a podium for',
'   the builder. Pixel only: hard edges, stepped shadows, no blur on a frame. */',
'#s-car.active::after{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;',
'  background:radial-gradient(90% 55% at 50% -8%,color-mix(in srgb,var(--k-team-ring) 38%,transparent),transparent 72%),',
'  radial-gradient(70% 45% at 100% 105%,rgba(255,122,26,.10),transparent 70%),',
'  repeating-linear-gradient(0deg,rgba(255,255,255,.018) 0 2px,transparent 2px 4px),',
'  linear-gradient(180deg,#0d1226 0%,#090c19 55%,#06080f 100%);}',
'#s-car{position:relative;}',
'/* the top bar: a title plate with the club colour under it */',
'#s-car .cr-top{position:relative;padding:4px 0 12px;margin-bottom:14px;}',
'#s-car .cr-top::after{content:"";position:absolute;left:0;right:0;bottom:0;height:4px;background:linear-gradient(90deg,var(--k-team-ring) 0 34%,var(--k-accent) 34% 46%,transparent 46%),repeating-linear-gradient(90deg,rgba(143,160,214,.28) 0 4px,transparent 4px 8px);}',
'#s-car .cr-top .k-h1{font-size:34px;letter-spacing:.02em;color:#fff;text-shadow:3px 3px 0 color-mix(in srgb,var(--k-team-1) 70%,#05070d),0 0 18px color-mix(in srgb,var(--k-team-ring) 40%,transparent);}',
'#s-car .cr-hud{gap:6px;}',
'#s-car .cr-hud b{padding:4px 7px;background:#05070d;color:#ffb347;text-shadow:0 0 6px rgba(255,150,40,.6);box-shadow:inset 0 0 0 2px #2a1a08;}',
'#s-car .cr-hud span{padding:3px 7px;background:rgba(143,160,214,.10);color:var(--k-ink);box-shadow:inset 0 0 0 2px rgba(143,160,214,.16);}',
'#s-car .k-ib{background:linear-gradient(180deg,#2a3560,#1a2142 60%,#141a33);box-shadow:inset 0 0 0 2px #3a4777,inset 0 2px 0 rgba(255,255,255,.12),0 3px 0 #05070d;}',
'#s-car .k-ib:hover,#s-car .k-ib:focus-visible{box-shadow:inset 0 0 0 2px var(--k-accent),inset 0 2px 0 rgba(255,255,255,.12),0 3px 0 #05070d;}',
'/* menu panels: a lit top edge, a darker foot and a hard pixel drop */',
'#s-car .k-panel:where(:not(.cr-card)),#cr-sheet .k-sheet{background:linear-gradient(180deg,#171e3a 0%,#11162b 46%,#0e1225 100%);}',
'#s-car .k-panel:where(:not(.cr-card)){box-shadow:0 calc(var(--k-px)*-1) 0 0 var(--k-frame),0 var(--k-px) 0 0 var(--k-frame),calc(var(--k-px)*-1) 0 0 0 var(--k-frame),var(--k-px) 0 0 0 var(--k-frame),inset 0 2px 0 rgba(255,255,255,.07),0 calc(var(--k-px) + 5px) 0 0 rgba(3,5,10,.75);margin-bottom:18px;}',
'#s-car .k-panel:where(:not(.cr-card)).k-team{box-shadow:0 calc(var(--k-px)*-1) 0 0 var(--k-team-ring),0 var(--k-px) 0 0 var(--k-team-ring),calc(var(--k-px)*-1) 0 0 0 var(--k-team-ring),var(--k-px) 0 0 0 var(--k-team-ring),inset 0 2px 0 rgba(255,255,255,.07),0 calc(var(--k-px) + 5px) 0 0 rgba(3,5,10,.75);}',
'#s-car .k-panel:where(:not(.cr-card)).k-gold{box-shadow:0 calc(var(--k-px)*-1) 0 0 var(--k-gold),0 var(--k-px) 0 0 var(--k-gold),calc(var(--k-px)*-1) 0 0 0 var(--k-gold),var(--k-px) 0 0 0 var(--k-gold),inset 0 2px 0 rgba(255,236,170,.12),0 calc(var(--k-px) + 5px) 0 0 rgba(3,5,10,.75),0 0 26px rgba(255,209,102,.16);}',
'/* a section of heading is a strip across the top of its panel */',
'#s-car .cr-sec > .k-eyebrow,#s-car details.cr-sec > summary.k-eyebrow{margin:calc(var(--k-s-4)*-1) calc(var(--k-s-4)*-1) 12px;padding:10px 14px 10px 16px;min-height:40px;',
'  background:linear-gradient(90deg,color-mix(in srgb,var(--k-team-ring) 28%,#0a0e1c),#0a0e1c 70%);box-shadow:inset 4px 0 0 var(--k-team-ring),inset 0 -2px 0 rgba(143,160,214,.14);color:#fff;font-size:9px;letter-spacing:.08em;}',
'#s-car details.cr-sec:not([open]) > summary.k-eyebrow{margin-bottom:calc(var(--k-s-4)*-1);}',
'#s-car .k-panel.k-tight.cr-sec > .k-eyebrow{margin:calc(var(--k-s-3)*-1) calc(var(--k-s-3)*-1) 10px;}',
'#s-car .cr-rtsum{color:#ffb347;font-weight:800;}',
'/* THE HERO: a player select card. The club of number stands huge behind him,',
'   the club\'s stripes run behind his name, and the overall is a shield. */',
'#s-car .cr-id{background:#0b0f1f;}',
'#s-car .cr-id .k-stage{height:262px;}',
'@media (max-width:519px){#s-car .cr-id .k-stage{height:236px;}}',
'#s-car .cr-bignum{position:absolute;left:30%;bottom:-34px;transform:translateX(-50%);font:400 230px/1 var(--k-f-display);letter-spacing:-.02em;color:color-mix(in srgb,var(--k-team-1) 30%,transparent);-webkit-text-stroke:2px color-mix(in srgb,var(--k-team-ring) 45%,transparent);opacity:.9;pointer-events:none;user-select:none;}',
'@media (max-width:519px){#s-car .cr-bignum{font-size:200px;bottom:-30px;}}',
'#s-car .cr-stripes{position:absolute;right:-40px;top:0;bottom:0;width:62%;pointer-events:none;opacity:.5;',
'  background:repeating-linear-gradient(112deg,transparent 0 22px,color-mix(in srgb,var(--k-team-1) 70%,transparent) 22px 40px,transparent 40px 46px,color-mix(in srgb,var(--k-team-2) 45%,transparent) 46px 52px);',
'  -webkit-mask:linear-gradient(90deg,transparent,#000 40%);mask:linear-gradient(90deg,transparent,#000 40%);}',
'#s-car .cr-id .k-scrim-r{background:linear-gradient(270deg,rgba(5,7,13,.86) 0,rgba(5,7,13,.5) 38%,rgba(5,7,13,0) 64%);}',
'#s-car .cr-id .k-id .k-hero{font-size:36px;color:#fff;text-shadow:3px 3px 0 color-mix(in srgb,var(--k-team-1) 80%,#05070d),5px 5px 0 #05070d;}',
'@media (max-width:519px){#s-car .cr-id .k-id .k-hero{font-size:31px;}}',
'#s-car .cr-shield{right:14px;bottom:16px;width:86px;padding:11px 0 10px;text-align:center;background:linear-gradient(180deg,color-mix(in srgb,var(--k-team-1) 80%,#000),#070a14);',
'  box-shadow:0 -3px 0 0 var(--k-gold),0 3px 0 0 var(--k-gold),-3px 0 0 0 var(--k-gold),3px 0 0 0 var(--k-gold),0 8px 0 0 #05070d,0 0 22px rgba(255,209,102,.25);}',
'#s-car .cr-shield::before{content:"";position:absolute;left:0;right:0;top:0;height:3px;background:rgba(255,255,255,.28);}',
'#s-car .cr-id .cr-shield .k-num{font-size:30px;color:#fff;text-shadow:3px 3px 0 #05070d;}',
'#s-car .cr-id .cr-shield .k-pix{display:block;margin-top:5px;color:var(--k-gold);}',
'#s-car .cr-id .cr-lines{background:linear-gradient(180deg,#0e1328,#11162b);padding-top:12px;}',
'#s-car .k-spec > div{background:#090c18;box-shadow:inset 3px 0 0 var(--k-team-ring),inset 0 0 0 1px rgba(143,160,214,.12);padding:7px 9px;}',
'#s-car .k-spec dt{font:400 7px/1.4 var(--k-f-pixel);letter-spacing:.06em;color:color-mix(in srgb,var(--k-team-ink) 80%,#fff);}',
'#s-car .k-spec dd{font-size:14px;margin-top:4px;}',
'#s-car .cr-id .k-strip{background:#0e1226;}',
'/* THE HUD: four bars in a 2 by 2, an icon, the word, the number, and ten',
'   bevelled cells, the way a fighting game shows a life bar. */',
'#s-car .cr-meters.k-meters{grid-template-columns:1fr 1fr;gap:8px;padding:10px;background:linear-gradient(180deg,#0c1124,#090d1c);}',
'#s-car .cr-meters .k-meter{display:grid;grid-template-columns:auto minmax(0,1fr) auto;grid-template-areas:"ic mk mv" "pp pp pp";align-items:center;gap:6px 8px;padding:8px 10px 9px;cursor:pointer;',
'  background:rgba(255,255,255,.025);box-shadow:inset 0 0 0 2px rgba(143,160,214,.14),inset 0 -3px 0 rgba(0,0,0,.3);}',
'#s-car .cr-meters .k-meter > .k-ico{grid-area:ic;}',
'#s-car .cr-meters .k-mk{grid-area:mk;font-size:8px;color:var(--k-ink-2);text-align:left;}',
'#s-car .cr-meters .k-mv{grid-area:mv;font-size:12px;color:#fff;}',
'#s-car .cr-meters .k-pips{grid-area:pp;display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:2px;padding:2px;background:#05070d;}',
'#s-car .cr-meters .k-pips i{width:auto;height:11px;background:#1a2038;box-shadow:inset 0 -2px 0 rgba(0,0,0,.35);}',
'#s-car .cr-meters .k-pips i.on{background:var(--k-pip);box-shadow:inset 0 2px 0 rgba(255,255,255,.35),inset 0 -2px 0 rgba(0,0,0,.3);}',
'/* THE SCOREBOARD: the record, the line and the bank in lit digits */',
'#s-car .cr-fact{position:relative;padding:10px 10px 11px;background:radial-gradient(rgba(255,255,255,.05) 1px,transparent 1.4px) 0 0/4px 4px,#05070d;',
'  box-shadow:0 -2px 0 0 #2a3150,0 2px 0 0 #2a3150,-2px 0 0 0 #2a3150,2px 0 0 0 #2a3150,inset 0 0 0 2px #000,0 6px 0 rgba(3,5,10,.7);}',
'#s-car .cr-fact .k{font:400 7px/1.4 var(--k-f-pixel);letter-spacing:.06em;color:var(--k-ink-3);}',
'#s-car .cr-fact b{font-size:15px;color:#ffb347;text-shadow:0 0 8px rgba(255,140,40,.7),0 0 1px #ffd9a6;margin:9px 0 6px;}',
'#s-car .cr-fact small{color:var(--k-ink-2);}',
'/* the story so far: a timeline */',
'#s-car .cr-beats{position:relative;padding:8px 6px 8px 4px;}',
'#s-car .cr-beats li{border-top:0;padding:7px 10px 7px 34px;}',
'#s-car .cr-beats li::after{content:"";position:absolute;left:15px;top:0;bottom:0;width:2px;background:rgba(143,160,214,.22);}',
'#s-car .cr-beats li:first-child::after{top:16px;}#s-car .cr-beats li:last-child::after{bottom:auto;height:16px;}',
'#s-car .cr-beats li:only-child::after{display:none;}',
'#s-car .cr-beats li:before{left:11px;top:12px;width:10px;height:10px;z-index:1;box-shadow:0 0 0 3px #11162b;}',
'/* the action at the thumb: a lit arcade button */',
'#s-car .cr-dock{background:linear-gradient(180deg,rgba(7,9,18,0),#070912 40%);}',
'#s-car .k-btn:not(.k-sec):not(.k-quiet):not(:disabled){background:linear-gradient(180deg,#ffa04d 0%,#ff7a1a 45%,#f26a0c 100%);text-shadow:0 1px 0 rgba(255,255,255,.35);}',
'#s-car .cr-next{overflow:hidden;font-size:18px;letter-spacing:.1em;}',
'#s-car .cr-next::after{content:"";position:absolute;top:0;bottom:0;left:-40%;width:24%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.35),transparent);animation:cr-shine 3.6s ease-in-out infinite;}',
'@keyframes cr-shine{0%,62%{left:-40%;}100%{left:130%;}}',
'@media (prefers-reduced-motion:reduce){#s-car .cr-next::after{display:none;}}',
'#s-car .k-btn.k-sec{background:linear-gradient(180deg,#26305a,#1a2142);}',
'/* cartridge tabs */',
'#s-car .cr-tabsec{padding-top:0;}',
'#s-car .cr-tabsec .k-itabs{margin:0 calc(var(--k-s-4)*-1) 14px;padding:8px 8px 0;gap:4px;background:#080b16;border-bottom:3px solid var(--k-team-ring);}',
'#s-car .k-itabs .k-itab{flex:1 0 auto;min-width:66px;color:var(--k-ink-3);background:linear-gradient(180deg,#1b2242,#131934);box-shadow:inset 0 0 0 2px #262f57,inset 0 2px 0 rgba(255,255,255,.06);}',
'#s-car .k-itabs .k-itab:hover{color:#fff;}',
'#s-car .k-itabs .k-itab[aria-selected="true"]{color:#fff;background:linear-gradient(180deg,#34437a,#222c55);box-shadow:inset 0 3px 0 var(--k-team-ring),inset 0 0 0 2px #3c4b85;}',
'#s-car .k-itabs .k-itab[aria-selected="true"]::after{display:none;}',
'#s-car .cr-tabsec.k-more-r::after{top:8px;background:linear-gradient(90deg,rgba(8,11,22,0),#080b16);}',
'/* the Story tab: a timeline of years */',
'#s-car .cr-log li{border-top:0;padding:8px 6px;margin:0 0 3px;background:rgba(255,255,255,.025);box-shadow:inset 3px 0 0 rgba(143,160,214,.2);}',
'#s-car .cr-log li.gold{box-shadow:inset 3px 0 0 var(--k-gold);background:rgba(255,209,102,.06);}',
'#s-car .cr-log li.good{box-shadow:inset 3px 0 0 var(--k-good);}',
'#s-car .cr-log li.bad{box-shadow:inset 3px 0 0 var(--k-bad);}',
'#s-car .cr-log li .yr{flex:0 0 46px;padding:3px 0;text-align:center;line-height:1.4;background:#05070d;color:#ffb347;align-self:flex-start;}',
'/* seasons: the arc on a grid, and every season a card */',
'#s-car .cr-arc{background:#080b16;box-shadow:inset 0 0 0 2px rgba(143,160,214,.14);}',
'#s-car .cr-arcbars{background:repeating-linear-gradient(0deg,rgba(143,160,214,.10) 0 1px,transparent 1px 25%);border-bottom:2px solid var(--k-ink-3);}',
'#s-car .cr-arcb span{border-radius:0;background:linear-gradient(180deg,#ff9a3d,#e8660f 70%,#b04a06);box-shadow:inset 2px 0 0 rgba(255,255,255,.18);}',
'#s-car .cr-arcb.am span{background:linear-gradient(180deg,#8db3f2,#5b8fe6 70%,#3a64b0);}',
'#s-car .cr-arcb.pk span{box-shadow:inset 2px 0 0 rgba(255,255,255,.18),0 0 0 2px var(--k-gold);}',
'#s-car .cr-arcb em{color:var(--k-gold);}',
'@media (max-width:519px){',
'  #s-car .cr-tbl tr{margin:0 0 6px;padding:10px 10px;border-bottom:0;background:rgba(255,255,255,.03);box-shadow:inset 3px 0 0 var(--k-team-ring),inset 0 0 0 1px rgba(143,160,214,.1);}',
'  #s-car .cr-tbl tr.champ{box-shadow:inset 3px 0 0 var(--k-gold),inset 0 0 0 1px rgba(255,209,102,.35);background:rgba(255,209,102,.05);}',
'  #s-car .cr-tbl td:before{font:400 7px/1.6 var(--k-f-pixel);letter-spacing:.04em;}',
'  #s-car .cr-tbl td{color:var(--k-ink);font-weight:600;}',
'}',
'/* LED tiles: the totals, the legacy row, the rotation head */',
'#s-car .cr-tot div,#s-car .cr-leg div{background:radial-gradient(rgba(255,255,255,.05) 1px,transparent 1.4px) 0 0/4px 4px,#05070d;box-shadow:inset 0 0 0 2px #232a47;}',
'#s-car .cr-tot b,#s-car .cr-leg b{color:#ffb347;text-shadow:0 0 8px rgba(255,140,40,.6);}',
'/* the team: an overall wears its tier */',
'#s-car .cr-rot li.cr-rot-r{background:rgba(255,255,255,.03);box-shadow:inset 0 0 0 1px rgba(143,160,214,.08);}',
'#s-car .cr-rot li.you{background:rgba(255,140,40,.12);box-shadow:inset 3px 0 0 var(--k-accent),inset 0 0 0 1px rgba(255,140,40,.3);}',
'#s-car .cr-rot .v.ovr{justify-self:end;min-width:30px;padding:4px 0;text-align:center;font-size:10px;color:#05070d;background:#8fa0d6;box-shadow:inset 0 -2px 0 rgba(0,0,0,.25);}',
'#s-car .cr-rot .v.ovr.tier-a{background:#ffd166;}#s-car .cr-rot .v.ovr.tier-b{background:#3ecf8e;}#s-car .cr-rot .v.ovr.tier-c{background:#7fb2ff;}',
'#s-car .cr-rot li.cr-rot-sep{margin-top:6px;color:var(--k-gold);}',
'/* the trophy case: icons on lit shelves behind glass */',
'#s-car .cr-aw:not(.cr-awrow):not(.cr-known){padding:10px 10px 6px;background:linear-gradient(180deg,rgba(120,170,255,.05),rgba(0,0,0,0) 40%),#070a14;box-shadow:inset 0 0 0 2px #2a2214,inset 0 0 0 4px #4a3520;}',
'#s-car .cr-aw:not(.cr-awrow):not(.cr-known) .cr-awgrid{padding-bottom:2px;background:repeating-linear-gradient(180deg,transparent 0 55px,#8a5c34 55px 58px,#5a3a1e 58px 62px);}',
'#s-car .cr-awi{box-shadow:inset 0 2px 0 rgba(255,255,255,.08);}',
'#s-car .cr-awcap{color:var(--k-gold);font-weight:700;}',
'/* the people: a face for every name */',
'#s-car .cr-ppl li{grid-template-columns:36px minmax(0,1fr) 92px;align-items:center;padding:10px 0;}',
'#s-car .cr-ppl .note{grid-column:2/-1;}',
'#s-car .cr-ava{width:36px;height:36px;display:grid;place-items:center;font:400 10px var(--k-f-pixel);color:#fff;background:linear-gradient(180deg,#3a4677,#26305a);box-shadow:inset 0 0 0 2px #4a5c99,inset 0 -3px 0 rgba(0,0,0,.3);}',
'#s-car .cr-ava.good{background:linear-gradient(180deg,#2f8a63,#1d5c42);box-shadow:inset 0 0 0 2px #3ecf8e,inset 0 -3px 0 rgba(0,0,0,.3);}',
'#s-car .cr-ava.bad{background:linear-gradient(180deg,#8a3434,#5c1f1f);box-shadow:inset 0 0 0 2px #ff6b6b,inset 0 -3px 0 rgba(0,0,0,.3);}',
'/* the news: every item a clipping */',
'#s-car .cr-feed li{border-top:0;margin:0 0 6px;padding:9px 11px;background:rgba(255,255,255,.03);box-shadow:inset 0 0 0 1px rgba(143,160,214,.1);}',
'#s-car .cr-feed .src{display:table;margin:0 0 5px;padding:3px 6px;font:400 7px/1.4 var(--k-f-pixel);color:#05070d;background:var(--k-trust);}',
'#s-car .cr-feed li.you{box-shadow:inset 3px 0 0 var(--k-accent),inset 0 0 0 1px rgba(255,140,40,.25);}',
'#s-car .cr-list li{border-top:0;margin:0 0 3px;padding:7px 8px;background:rgba(255,255,255,.025);}',
'#s-car .cr-list li .yr{padding:2px 4px;background:#05070d;color:#ffb347;text-align:center;margin-right:8px;}',
'#s-car .cr-sub{display:flex;align-items:center;gap:8px;color:#fff;font:400 9px/1.5 var(--k-f-pixel);letter-spacing:.06em;}',
'#s-car .cr-sub::after{content:"";flex:1;height:2px;background:repeating-linear-gradient(90deg,rgba(143,160,214,.3) 0 4px,transparent 4px 8px);}',
'/* THE HALL CARD: a ceremony. Gold rays turn behind him, the verdict is cast',
'   in gold and his name is on a ribbon. */',
'#s-car .cr-final{background:#07091a;}',
'#s-car .cr-rays{position:absolute;left:50%;top:-180px;width:720px;height:720px;margin-left:-360px;pointer-events:none;opacity:.32;',
'  background:repeating-conic-gradient(from 0deg,rgba(255,209,102,.55) 0 6deg,transparent 6deg 18deg);',
'  -webkit-mask:radial-gradient(circle,#000 0,#000 18%,transparent 58%);mask:radial-gradient(circle,#000 0,#000 18%,transparent 58%);animation:cr-spin 60s linear infinite;}',
'#s-car .k-panel.k-team .cr-rays{background:repeating-conic-gradient(from 0deg,color-mix(in srgb,var(--k-team-ring) 70%,transparent) 0 6deg,transparent 6deg 18deg);opacity:.26;}',
'@keyframes cr-spin{to{transform:rotate(360deg);}}',
'@media (prefers-reduced-motion:reduce){#s-car .cr-rays{animation:none;}}',
'#s-car .cr-final .cr-hin{background:linear-gradient(180deg,rgba(5,7,13,.1),rgba(5,7,13,.78) 50%,#0b0f22);}',
'#s-car .cr-final .eye{display:inline-block;padding:6px 10px;background:#05070d;box-shadow:inset 0 0 0 2px var(--k-gold);color:var(--k-gold);}',
'#s-car .cr-final .v{font-size:54px;color:#fff3c4;text-shadow:3px 3px 0 #8a5a00,6px 6px 0 #05070d,0 0 26px rgba(255,209,102,.45);}',
'#s-car .k-panel.k-team .cr-final .v,#s-car .cr-final.k-team .v{color:#fff;text-shadow:3px 3px 0 color-mix(in srgb,var(--k-team-1) 80%,#05070d),6px 6px 0 #05070d,0 0 22px color-mix(in srgb,var(--k-team-ring) 50%,transparent);}',
'#s-car .cr-final .nm span{display:inline-block;padding:7px 18px;color:var(--k-team-on);background:var(--k-team-1);box-shadow:inset 0 0 0 2px rgba(0,0,0,.25);',
'  clip-path:polygon(0 0,100% 0,96% 50%,100% 100%,0 100%,4% 50%);}',
'#s-car .cr-final .rtf-baller{filter:drop-shadow(0 8px 0 rgba(5,7,13,.6)) drop-shadow(0 0 16px rgba(255,209,102,.25));}',
'#s-car .cr-final p.cr-col{display:inline-block;margin:8px 4px 0;padding:5px 10px;font-size:13.5px;background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px rgba(143,160,214,.2);}',
'#s-car .cr-epi p{position:relative;margin:0 0 8px;padding:10px 12px 10px 14px;background:#090c18;box-shadow:inset 3px 0 0 var(--k-gold),inset 0 0 0 1px rgba(255,209,102,.15);}',
'#s-car .cr-epi .k{font:400 7px/1.6 var(--k-f-pixel);color:var(--k-gold);letter-spacing:.06em;margin-bottom:5px;}',
'#s-car #cr-share{font-size:17px;min-height:56px;}',
'/* THE VAULT: a plaque wall. What you found is cast in gold; what you have',
'   not is a dark empty slot with a lock in it. */',
'#s-car .cr-vsum{padding:14px 16px;background:radial-gradient(120% 140% at 0% 0%,rgba(255,209,102,.14),transparent 60%),#0b0f22;}',
'#s-car .cr-vsum .k-num{font-size:34px;text-shadow:3px 3px 0 #6a4600,0 0 14px rgba(255,209,102,.4);}',
'#s-car .cr-vbar{height:14px;background:#05070d;box-shadow:0 0 0 2px #3a3018;}',
'#s-car .cr-vbar i{background:repeating-linear-gradient(90deg,#ffd166 0 6px,#e8b440 6px 8px);box-shadow:inset 0 2px 0 rgba(255,255,255,.35);}',
'#s-car .cr-shbar{height:8px;}',
'#s-car .cr-shelf > summary{padding:12px 4px 12px 10px;border-top:0;margin-top:6px;background:linear-gradient(90deg,rgba(255,209,102,.07),transparent 70%);box-shadow:inset 3px 0 0 var(--k-gold);}',
'#s-car .cr-vgrid{padding:10px 8px 12px;background:#070912;box-shadow:inset 0 -6px 0 #4a2f18,inset 0 -8px 0 #6b4526;}',
'#s-car .cr-sec > .cr-tabs:not(.k-itabs){margin:0 calc(var(--k-s-4)*-1) 14px;margin-top:calc(var(--k-s-4)*-1);padding:8px 8px 0;gap:4px;background:#080b16;border-bottom:3px solid var(--k-gold);}',
'#s-car .cr-sec > .cr-tabs:not(.k-itabs) .k-tab{color:var(--k-ink-3);background:linear-gradient(180deg,#1b2242,#131934);box-shadow:inset 0 0 0 2px #262f57;}',
'#s-car .cr-sec > .cr-tabs:not(.k-itabs) .k-tab[aria-selected="true"]{color:#fff;background:linear-gradient(180deg,#4a3c14,#2a210a);box-shadow:inset 0 3px 0 var(--k-gold),inset 0 0 0 2px #5c4a18;}',
'#s-car .cr-sec > .cr-tabs:not(.k-itabs) .k-tab[aria-selected="true"]::after{display:none;}',
'#s-car .cr-vgrid li{min-height:42px;}',
'#s-car .cr-vgrid li.got{color:#fff3c4;background:linear-gradient(180deg,#5c4614,#3a2c0c 60%,#2a2008);box-shadow:inset 0 0 0 2px var(--k-gold),inset 0 2px 0 rgba(255,236,170,.4),0 3px 0 #05070d;text-shadow:0 1px 0 #000;}',
'#s-car .cr-vgrid li.no{color:#58628a;background:#05070d;box-shadow:inset 0 3px 0 rgba(0,0,0,.6),inset 0 0 0 2px #1a2036;}',
'#s-car .cr-vgrid li.no .k-ico{opacity:.5;}',
'#s-car .cr-aentry{padding:8px 6px;margin:0 0 4px;background:rgba(255,255,255,.025);box-shadow:inset 0 0 0 1px rgba(143,160,214,.1);}',
'/* THE BUILDER: a player select screen. He stands on a lit podium, and the',
'   four steps are a track you move along. */',
'#s-car .cr-build .cr-pfig{background:#05070d;box-shadow:inset 0 0 0 2px var(--k-team-ring),0 4px 0 #05070d;}',
'#s-car .cr-build .cr-pfig::before{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;background:radial-gradient(60% 50% at 50% 0%,rgba(255,236,196,.28),transparent 70%);}',
'#s-car .cr-build .cr-pfig::after{content:"";position:absolute;left:12%;right:12%;bottom:2px;height:12px;z-index:0;background:radial-gradient(50% 50% at 50% 50%,color-mix(in srgb,var(--k-team-ring) 70%,transparent),transparent 72%);}',
'#s-car .cr-build .cr-pfig .rtf-baller{z-index:2;}',
'#s-car .cr-build .cr-povr .k-num{color:#fff;text-shadow:3px 3px 0 color-mix(in srgb,var(--k-team-1) 80%,#05070d);}',
'#s-car .cr-steps{position:relative;gap:6px;padding:4px 0 8px;}',
'#s-car .cr-stab{position:relative;background:linear-gradient(180deg,#1b2242,#131934);box-shadow:inset 0 0 0 2px #262f57,0 3px 0 #05070d;}',
'#s-car .cr-stab i{display:inline-grid;place-items:center;width:18px;height:18px;background:#05070d;color:var(--k-ink-2);}',
'#s-car .cr-stab.on{color:#160b02;background:linear-gradient(180deg,#ffe08c,#ffd166 60%,#e8b440);box-shadow:inset 0 0 0 2px #fff0bf,0 3px 0 #6a4600;}',
'#s-car .cr-stab.on i{background:#160b02;color:#ffd166;}',
'#s-car .cr-opt{background:linear-gradient(180deg,#1d2546,#151b36);}',
'#s-car .cr-opt.on{background:linear-gradient(180deg,#3a3014,#241d0c);}',
'#s-car .cr-build .lab{display:flex;align-items:center;gap:8px;font:400 8px/1.5 var(--k-f-pixel);color:#fff;letter-spacing:.06em;}',
'#s-car .cr-build .lab::after{content:"";flex:1;height:2px;background:repeating-linear-gradient(90deg,rgba(143,160,214,.3) 0 4px,transparent 4px 8px);}',
'#s-car .cr-name input{background:#05070d;}',
'#s-car .cr-cta{background:linear-gradient(180deg,rgba(7,9,18,0),#070912 40%);}',
'/* sheets wear the same plate */',
'#cr-sheet .k-sheet{box-shadow:0 -3px 0 0 var(--k-team-ring),inset 0 2px 0 rgba(255,255,255,.06);}',
].join('\n');
(function(){
  if (document.getElementById('cr-css')) return;
  var st = document.createElement('style');
  st.id = 'cr-css';
  st.textContent = CSS;
  document.head.appendChild(st);
})();

// ─── pieces ─────────────────────────────────────────────────────────────────

function skin(code){
  if (!code) return { primary: '#2b3242', secondary: '#c9ccd6', bg: '#2b3242', on: '#fff' };
  return E.clubSkin ? E.clubSkin(code) : { primary: '#2b3242', secondary: '#c9ccd6', bg: '#2b3242', on: '#fff' };
}
/* His look: the one he chose, or one off his seed for a career started
   before looks existed. baller.js is the only reader of what is in it. */
function lookOf(L){
  var B = window.RTF_BALLER;
  if (L && L.look && Object.keys(L.look).length) return L.look;
  return B ? B.lookFor(L ? L.seed : 'x') : {};
}
/* The player, drawn, in whatever he is wearing right now. Falls back to the
   jersey below if baller.js did not load, so the card is never empty. */
function portrait(L, o){
  var B = window.RTF_BALLER;
  if (!B) return jersey(L);
  var k = C.colorsOf(L);
  o = o || {};
  return B.img(lookOf(L), { c1: k.primary, c2: k.secondary, num: L.num, age: L.age, pose: o.pose || 'stand', scale: o.scale || 3 });
}
/* A jersey in the club's colours with your number on it. The fallback
   picture, and the shape the hero used before the player was drawn. */
function jersey(L){
  var k = L && C.colorsOf ? C.colorsOf(L) : skin(null);
  var num = L && L.num != null ? L.num : '';
  return '<svg class="cr-jersey" viewBox="0 0 64 70" aria-hidden="true">'
    + '<path d="M14 4 L24 4 Q32 14 40 4 L50 4 L60 14 L54 26 L50 24 L50 66 L14 66 L14 24 L10 26 L4 14 Z" fill="' + k.primary + '" stroke="' + k.secondary + '" stroke-width="2.5" stroke-linejoin="round"/>'
    + '<path d="M24 4 Q32 14 40 4" fill="none" stroke="' + k.secondary + '" stroke-width="3"/>'
    + '<text x="32" y="50" text-anchor="middle" font-family="Anton, Impact, sans-serif" font-size="24" fill="' + k.secondary + '" stroke="rgba(0,0,0,.35)" stroke-width=".6">' + esc(String(num)) + '</text>'
    + '</svg>';
}
function money(m){ return C.money(m); }
function teamName(c){ return c ? E.teamName(c) : 'No club'; }
/* A scout's letter for the ceiling, because the number would be a promise. */
function grade(L){
  var gap = L.pot;
  return gap >= 92 ? 'A+' : gap >= 88 ? 'A' : gap >= 84 ? 'B+' : gap >= 80 ? 'B' : gap >= 76 ? 'C+' : 'C';
}
function seasonTag(y){ return (y - 1) + '-' + String(y).slice(2); }
function tag(text, cls){ return '<span class="k-tag' + (cls ? ' ' + cls : '') + '">' + esc(text) + '</span>'; }

/* Which room the player card stands in. The stage follows the life: a high
   school gym, a college arena, a hall abroad, the G League, the league. */
function stageKind(L){
  var a = L && L.am;
  if (a && C.isAm && C.isAm(L)) return a.level === 'hs' ? 'hs' : a.level === 'col' ? 'col' : a.route === 'intl' ? 'intl' : 'gl';
  return 'nba';
}
function setArt(kind, c1, c2, seed){ return K.img(K.room(kind, 132, 80, { c1: c1, c2: c2, spotAt: 0.3, seed: seed }), 3); }

// ─── the builder ────────────────────────────────────────────────────────────

var form = null;
function freshForm(){
  var seed = String(Math.floor(Math.random() * 1e9));
  var B = window.RTF_BALLER;
  return { seed: seed, name: C.randomName(seed), num: Math.floor(Math.random() * 100), pos: 'SF', arch: 'sf_wing', bg: 'oad', start: proOpen() ? 'hs' : 'gen',
    origin: '', legend: true, look: B ? B.lookFor(seed) : {}, diff: 'normal', challenge: '', ht: 79, wt: C.wtFor(79) };
}
/* A new position keeps the kind of player and the size where it still fits:
   the archetype on the same base, and the height and weight pulled into the
   new position's range. */
function setPos(p){
  var was = C.ARCHES[form.arch] || {}, keys = C.archesFor(p);
  form.pos = p;
  if (keys.indexOf(form.arch) < 0) form.arch = keys.filter(function(k){ return C.ARCHES[k].base === (was.base || form.arch); })[0] || keys[0];
  var z = C.POS_SIZE[p];
  if (!(form.ht >= z.ht[0] && form.ht <= z.ht[1])) form.ht = z.mid;
  fitWt();
}
function fitWt(){ var r = C.wtRange(form.ht); if (!(form.wt >= r[0] && form.wt <= r[1])) form.wt = C.wtFor(form.ht); }
/* What the size does, in one line: read off the same tilt the engine adds. */
function sizeLine(){
  var t = C.sizeTilt(form.pos, form.ht, form.wt), name = { reb: 'rebounding', def: 'defense', fin: 'finishing', ath: 'athleticism', pla: 'playmaking', sho: 'shooting' };
  var up = [], down = [];
  Object.keys(t).sort(function(a, b){ return Math.abs(t[b]) - Math.abs(t[a]); }).forEach(function(k){ var v = Math.round(t[k]); if (v > 0) up.push('+' + v + ' ' + name[k]); else if (v < 0) down.push(v + ' ' + name[k]); });
  if (!up.length && !down.length) return 'Right in the middle for a ' + C.POS_NAME[form.pos].toLowerCase() + '. No trade-offs.';
  var z = C.POS_SIZE[form.pos], dh = form.ht - z.mid, dw = form.wt - C.wtFor(form.ht);
  var big = dh > 0 || dw > 0 ? ' Big bodies break down sooner.' : dw < 0 ? ' A light frame holds up a little better.' : '';
  return (up.length ? up.slice(0, 3).join(', ') + '. ' : '') + (down.length ? down.slice(0, 3).join(', ') + '.' : '') + big;
}
/* RUN THE FLOOR PRO IS WHAT PLAYS THE ROAD (PLAN.md Phase E). A guest and a
   free account start on draft night from a road generated for them, a new one
   every career; Pro can start at fifteen. Asked of modes-ui.js, which owns the
   purchase, so a lapse or PRO_LIVE off is decided in one place. A career
   already started is never taken away: the gate is this screen's start button. */
function proOpen(){ var M = window.RTF_MODES_UI; return !!(M && M.proOpen && M.proOpen()); }
function askPro(why){ var M = window.RTF_MODES_UI; if (M && M.openPro) M.openPro(why); }
function lifeOpts(){
  return { seed: form.seed, name: form.name, num: form.num, pos: form.pos, arch: form.arch, bg: form.bg, start: form.start, look: form.look, league: league(), ht: form.ht, wt: form.wt,
    origin: form.origin || undefined, legend: form.legend !== false, parent: form.parent || undefined, parentLeague: form.parentLeague || undefined,
    diff: form.diff || 'normal', challenge: form.challenge || undefined };
}
/* The look chooser, shared by the builder and the Look sheet mid-career. The
   options are the sprite's own (baller.js) and are listed, never changed. */
function lookRows(look, c1, c2, num, noFig){
  var B = window.RTF_BALLER;
  if (!B) return '';
  var L = B.normal(look);
  var chips = function(key, list){
    return '<div class="cr-lrow"><span class="k k-label">' + key[1] + '</span><div class="cr-sw" role="group" aria-label="' + key[1] + '">' + list.map(function(x){
      var on = String(L[key[0]]) === String(x[0]);
      return '<button type="button" data-lk="' + key[0] + '" data-lv="' + x[0] + '" class="' + (on ? 'on' : '') + '" aria-pressed="' + on + '">' + esc(x[1]) + '</button>';
    }).join('') + '</div></div>';
  };
  var dots = function(key, cols){
    return '<div class="cr-lrow"><span class="k k-label">' + key[1] + '</span><div class="cr-sw" role="group" aria-label="' + key[1] + '">' + cols.map(function(c, i){
      var on = L[key[0]] === i;
      return '<button type="button" class="dot' + (on ? ' on' : '') + '" data-lk="' + key[0] + '" data-lv="' + i + '" style="background:' + c + '" aria-pressed="' + on + '" aria-label="' + key[1] + ' ' + (i + 1) + '"></button>';
    }).join('') + '</div></div>';
  };
  /* Facial hair colour is its own choice, shown once there is facial hair to
     colour. Match is the natural colour that goes with the hair. */
  var bcRow = L.beard === 'none' ? '' : '<div class="cr-lrow"><span class="k k-label">Facial hair color</span><div class="cr-sw" role="group" aria-label="Facial hair color">'
    + '<button type="button" data-lk="bc" data-lv="auto" class="' + (L.bc < 0 ? 'on' : '') + '" aria-pressed="' + (L.bc < 0) + '">Match</button>'
    + B.HAIR_COLORS.map(function(x, i){
      var on = L.bc === i;
      return '<button type="button" class="dot' + (on ? ' on' : '') + '" data-lk="bc" data-lv="' + i + '" style="background:' + x[1] + '" aria-pressed="' + on + '" aria-label="Facial hair color ' + (i + 1) + '"></button>';
    }).join('') + '</div></div>';
  return '<div class="cr-look' + (noFig ? ' cr-look-nofig' : '') + '">' + (noFig ? '' : '<div>' + B.img(L, { c1: c1, c2: c2, num: num, scale: 3 }) + '</div>') + '<div>'
    + dots(['skin', 'Skin'], B.SKINS)
    + chips(['hair', 'Hair'], B.HAIRS)
    + dots(['hc', 'Hair color'], B.HAIR_COLORS.map(function(x){ return x[1]; }))
    + chips(['beard', 'Facial hair'], B.BEARDS)
    + bcRow
    + '<details class="cr-gear"' + (gearOpen ? ' open' : '') + '><summary>Gear and build</summary>'
    + chips(['band', 'Headband'], B.BANDS)
    + chips(['sleeve', 'Arm sleeve'], B.SLEEVES)
    + chips(['shoes', 'Shoes'], B.SHOES)
    + chips(['build', 'Build'], B.BUILDS)
    + '</details></div></div>';
}
/* The gear fold stays the way it was left: a press redraws the chooser. */
var gearOpen = false;
function wireLook(root, look, onChange){
  var g = root.querySelector('.cr-gear');
  if (g) g.ontoggle = function(){ gearOpen = g.open; };
  root.querySelectorAll('[data-lk]').forEach(function(b){
    b.onclick = function(){
      var k = b.getAttribute('data-lk'), v = b.getAttribute('data-lv');
      if (v === 'auto') delete look[k];
      else look[k] = k === 'skin' || k === 'hc' || k === 'bc' ? +v : v;
      onChange();
    };
  });
}
/* The builder's preview is the career the start button would make: the road
   generated, or the sophomore. A generated road is a few milliseconds. */
var PV = { k: null, L: null };
function preview(){
  var o = lifeOpts();
  /* Only what changes the career is in the key: the name, the number and the
     look are laid over the same career, so typing does not replay a road. */
  var k = [o.seed, o.pos, o.arch, o.start, o.origin, o.legend, o.parent ? o.parent.id : '', o.diff, o.challenge, o.ht, o.wt].join('|');
  if (PV.k !== k) { PV.k = k; PV.L = form.start === 'hs' ? C.newLife(o) : C.generateRoad(o); }
  var L = PV.L;
  L.name = String(form.name || '') || L.name; L.num = form.num; L.look = C.cleanLook(form.look);
  return L;
}
var LEAGUE = null;
/* TODAY'S ROSTERS (data/rosters.json): the clubs as they stand for the season a
   career joins, refreshed by a workflow and fetched no-cache with no ?v=,
   because a bot rewrites it under one name. Until it has answered, a league is
   seeded without it and not kept, so the first career started after it lands
   joins the real clubs. No file, or a stale one, is the data's last season. */
var ROSTERS = null, ROSTERS_DONE = false;
function loadRosters(){
  if (ROSTERS_DONE || loadRosters.asked) return;
  loadRosters.asked = true;
  /* The real ratings and salaries (data/ratings.json) ride on the rosters.
     Without them a man is read off his box scores, as before. */
  var done = function(j){ ROSTERS = j && j[0] && j[0].clubs ? j[0] : null; if (ROSTERS && j[1] && j[1].men) ROSTERS.ratings = j[1]; ROSTERS_DONE = true; LEAGUE = null; };
  var get = function(u){ return fetch(u, { cache: 'no-cache' }).then(function(r){ return r.ok ? r.json() : null; }, function(){ return null; }); };
  try {
    Promise.all([get('data/rosters.json'), get('data/ratings.json')]).then(done, function(){ done(null); });
  } catch (e) { done(null); }
}
loadRosters();
function league(){
  if (LEAGUE) return LEAGUE;
  var d = P.data;
  if (!d || !d.allPlayers) return null;
  var rows = [];
  for (var k in d.allPlayers) rows.push(d.allPlayers[k]);
  var lg = C.seedLeague(rows, ROSTERS);
  if (ROSTERS_DONE) LEAGUE = lg;
  return lg;
}
function rtRows(L, prev, fill){
  var w = C.WEIGHTS[L.pos];
  return C.RATINGS.map(function(k){
    var d = prev && prev[k] != null ? C.show(L.rt[k]) - C.show(prev[k]) : 0;
    return '<div class="k-row' + (w[k] >= 0.2 ? ' is-key' : '') + '"><span>' + C.RATING_NAME[k] + '</span>'
      + K.bar(C.show(L.rt[k]), w[k] >= 0.2 ? 'var(--k-good)' : null, fill && d !== 0)
      + '<span class="k-v">' + C.show(L.rt[k]) + '</span>'
      + '<span class="k-delta ' + (d > 0 ? 'up' : d < 0 ? 'down' : '') + '">' + (d ? (d > 0 ? '+' : '') + d : '') + '</span></div>';
  }).join('');
}

/* The road a generated career took, as a short list. In the builder it says
   that New draws another. */
function roadHtml(L, builder){
  var lines = C.roadStory ? C.roadStory(L) : [];
  if (!lines.length) return '';
  var list = '<ul class="cr-list">' + lines.map(function(t){ return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
  /* In the career it is a fold, one line until it is opened: it is history,
     and on a phone it stood between the player and the card he has to answer. */
  /* THE ROAD IS A REVEAL. The builder never shows it: it is played the moment
     the career starts, and the first screen of the career opens on it, line
     by line. After the first press it folds to one line, because by then it
     is history. */
  if (!builder) {
    var rev = !!stage.reveal;
    if (rev) list = '<ul class="cr-list cr-reveal">' + lines.map(function(t, i){ return '<li style="animation-delay:' + (i * 0.35).toFixed(2) + 's">' + esc(t) + '</li>'; }).join('') + '</ul>';
    return '<details class="k-panel k-tight cr-roadbox' + (rev ? ' k-in' : '') + '" id="cr-roadbox"' + (rev ? ' open' : '') + '><summary class="k-eyebrow">' + K.iconHtml('clip', 2) + (rev ? 'Your road to the draft' : 'How you got here') + '</summary>' + list + '</details>';
  }
  return '<div class="k-panel k-tight cr-roadbox" id="cr-roadbox">' + list
    + '<p class="k-small" style="margin:8px 0 0">Played for you. Press New for another road.</p></div>';
}
/* Difficulty and a challenge (Phase E). A challenge that fixes the difficulty
   holds the chips where it put them. */
function setHtml(){
  if (!C.DIFFS) return '';
  var fixed = form.challenge && C.CHALLENGES[form.challenge] && C.CHALLENGES[form.challenge].diff;
  var dk = fixed || form.diff || 'normal';
  var diff = C.DIFF_KEYS.map(function(k){ var on = dk === k;
    return '<button class="k-chip' + (on ? ' on' : '') + '" data-diff="' + k + '" aria-pressed="' + on + '"' + (fixed && !on ? ' disabled' : '') + '>' + esc(C.DIFFS[k].name) + '</button>'; }).join('');
  var ch = C.CHALLENGES[form.challenge];
  var list = '<button class="cr-opt' + (!form.challenge ? ' on' : '') + '" data-ch="" aria-pressed="' + !form.challenge + '"><b>No challenge</b><small>Just a career.</small></button>'
    + C.CHALLENGE_KEYS.map(function(k){ var c = C.CHALLENGES[k], on = form.challenge === k, got = !!store().vault['c:' + k];
      return '<button class="cr-opt' + (on ? ' on' : '') + '" data-ch="' + k + '" aria-pressed="' + on + '"><b>' + esc(c.name) + (got ? ' ' + K.iconHtml('check', 1) : '') + '</b><small>' + esc(c.blurb) + '</small></button>'; }).join('');
  return '<span class="lab k-label">Difficulty</span><div class="cr-chips" id="cr-diff" role="group" aria-label="Difficulty">' + diff + '</div>'
    + '<p class="cr-town">' + esc(C.DIFFS[dk].blurb) + '</p>'
    + '<details class="cr-gear cr-chal"' + (form.challenge || chOpen ? ' open' : '') + '><summary>' + (ch ? 'Challenge: ' + esc(ch.name) : 'Play a challenge') + '</summary>'
    + '<div class="cr-opts" id="cr-ch">' + list + '</div></details>';
}
var chOpen = false;
/* Height and weight: two steppers inside the position's range, and a line
   saying what the size buys and costs. */
function sizeHtml(){
  var z = C.POS_SIZE[form.pos], r = C.wtRange(form.ht);
  var step = function(id, label, val, lo, hi, dn, up){
    return '<div class="cr-step" role="group" aria-label="' + label + '"><span class="k-label">' + label + '</span>'
      + '<button type="button" class="k-btn k-sec" data-size="' + dn + '"' + (lo ? ' disabled' : '') + ' aria-label="' + label + ' down">-</button>'
      + '<output id="' + id + '" aria-live="polite">' + val + '</output>'
      + '<button type="button" class="k-btn k-sec" data-size="' + up + '"' + (hi ? ' disabled' : '') + ' aria-label="' + label + ' up">+</button></div>';
  };
  return '<span class="lab k-label">Height and weight</span><div class="cr-size">'
    + step('cr-ht', 'Height', C.heightText(form.ht), form.ht <= z.ht[0], form.ht >= z.ht[1], 'ht:-1', 'ht:1')
    + step('cr-wt', 'Weight', form.wt + ' lb', form.wt <= r[0], form.wt >= r[1], 'wt:-5', 'wt:5')
    + '</div><p class="cr-town" id="cr-sizeline">' + esc(sizeLine()) + '</p>';
}
function buildView(){
  if (!form) { form = freshForm(); bstep = 'player'; }
  if (C.archesFor(form.pos).indexOf(form.arch) < 0 || !(form.ht > 0)) setPos(form.pos);
  var L = preview(), k = C.colorsOf(L);
  var pos = C.POS.map(function(p){ var on = form.pos === p; return '<button class="k-chip' + (on ? ' on' : '') + '" data-pos="' + p + '" aria-pressed="' + on + '">' + p + '</button>'; }).join('');
  var arch = C.archesFor(form.pos).map(function(key){ var a = C.ARCHES[key], on = form.arch === key;
    return '<button class="cr-opt' + (on ? ' on' : '') + '" data-arch="' + key + '" aria-pressed="' + on + '"><b>' + esc(a.name) + '</b><small>' + esc(a.blurb) + '</small></button>'; }).join('');
  var archOn = C.ARCHES[form.arch];
  var road = form.start === 'hs', pro = proOpen();
  var starts = '<button class="cr-opt' + (road ? ' on' : '') + (pro ? '' : ' cr-locked') + '" data-start="hs" aria-pressed="' + road + '"><b>High school'
    + (pro ? '' : ' <span class="k-tag k-gold cr-pro">Pro</span>') + '</b><small>Age 15. Play recruiting, college and March yourself.</small></button>'
    + '<button class="cr-opt' + (!road ? ' on' : '') + '" data-start="gen" aria-pressed="' + !road + '"><b>Draft night</b><small>Your road to the draft is played for you. A new one every career.</small></button>';
  var rv = road && C.roadView ? C.roadView(L) : null;
  /* Where you are from (Phase D). Left on Surprise me, the seed draws one and
     the line under the chips says which. */
  var ori = '';
  if (form.parent) {
    var fp = form.parent;
    ori = '<div class="k-panel k-tight k-gold cr-son"><div class="k-eyebrow">' + K.iconHtml('tree', 2) + 'A legacy career</div>'
      + '<p><b>Son of ' + esc(fp.name) + '.</b> ' + esc(fp.verdict) + '. ' + fp.pts.toLocaleString('en-US') + ' points over ' + fp.seasons + (fp.seasons === 1 ? ' season.' : ' seasons.') + '</p>'
      + '<p class="k-small">You start in ' + (L.year - 1) + ', years after he retired. Pass his ' + fp.pts.toLocaleString('en-US') + ' points if you can.</p></div>';
  } else if (C.ORIGIN_KEYS) {
    var any = !form.origin;
    ori = '<span class="lab k-label">Where you are from</span><div class="cr-opts cr-pick" id="cr-origin" role="group" aria-label="Where you are from">'
      + '<button class="cr-opt' + (any ? ' on' : '') + '" data-origin="" aria-pressed="' + any + '"><b>Surprise me</b><small>One of these, drawn for you.</small></button>'
      + C.ORIGIN_KEYS.map(function(o){ var on = form.origin === o; return '<button class="cr-opt' + (on ? ' on' : '') + '" data-origin="' + o + '" aria-pressed="' + on + '"><b>' + esc(C.ORIGINS[o].name) + '</b><small>' + esc(C.ORIGINS[o].blurb) + '</small></button>'; }).join('')
      + '</div>' + (any && L.origin ? '<p class="cr-town" id="cr-origin-line">Drawn: <b>' + esc(C.ORIGINS[L.origin].name) + '.</b> ' + esc(C.ORIGINS[L.origin].blurb) + '</p>'
        : !any ? '<p class="cr-town">' + esc(C.ORIGINS[form.origin].blurb) + '</p>' : '')
      + '<span class="lab k-label">Legend moments</span><div class="cr-chips" id="cr-legend" role="group" aria-label="Legend moments">'
      + '<button class="k-chip' + (form.legend ? ' on' : '') + '" data-legend="1" aria-pressed="' + !!form.legend + '">On</button>'
      + '<button class="k-chip' + (!form.legend ? ' on' : '') + '" data-legend="0" aria-pressed="' + !form.legend + '">Off</button></div>'
      + '<p class="cr-town">Rare, larger than life stories. Off keeps every story grounded.</p>';
  }
  var B = window.RTF_BALLER;
  /* FOUR SHORT STEPS, NOT ONE LONG FORM. On a phone the builder was four and
     a half screens of scrolling with the start button at the bottom. Now the
     player is always on top (the figure, the overall and every rating, so a
     change in any step shows at once), the steps are tabs, and the start
     button is pinned to the foot of the screen: a career can start from any
     step. Every step stays in the page and the others are hidden, so nothing
     a step holds is ever lost by moving between them. */
  var steps = [['player', 'Player'], ['look', 'Look'], ['story', 'Story'], ['start', 'Start']];
  var si = 0; steps.forEach(function(x, i){ if (x[0] === bstep) si = i; });
  var tabs = '<div class="cr-steps" role="tablist" aria-label="Build your player">' + steps.map(function(x, i){
    var on = x[0] === bstep;
    return '<button type="button" role="tab" class="cr-stab' + (on ? ' on' : '') + '" data-bstep="' + x[0] + '" aria-selected="' + on + '"><i>' + (i + 1) + '</i>' + x[1] + '</button>';
  }).join('') + '</div>';
  var pane = function(id, html){ return '<div class="cr-pane" role="tabpanel" data-pane="' + id + '"' + (id === bstep ? '' : ' hidden') + '>' + html + '</div>'; };
  var next = steps[si + 1];
  var goText = road ? (pro ? 'Start your sophomore year' : 'Get Pro to start in high school') : 'Go to the draft combine';
  return '<div class="cr-top"><div class="cr-topl"><h2 class="k-h1">' + (form.parent ? 'Your son' : 'New career') + '</h2><div class="cr-hud"><b>Step ' + (si + 1) + ' of ' + steps.length + '</b><span>' + esc(steps[si][1]) + '</span></div></div><div class="cr-topbtns">'
    + (form.parent ? '<button class="k-btn k-quiet" id="cr-noson" type="button">Not a son</button>' : '')
    + ib('cr-vault', 'vault', 'Vault') + ib('cr-home', 'home', 'Home', { attr: 'aria-label="Home"' }) + '</div></div>'
    + '<div class="k-panel cr-build">'
    /* On the Look step the figure is drawn at twice the size and framed on the
       head and shoulders, because hair is what is being chosen there. */
    + '<div class="cr-preview"><div class="cr-pfig' + (bstep === 'look' ? ' cr-zoom' : '') + '">' + setArt(stageKind(L), k.primary, k.secondary, form.seed)
    + (B ? B.img(lookOf(L), { c1: k.primary, c2: k.secondary, num: form.num, age: L.age, pose: bstep === 'look' ? 'stand' : 'ball', scale: bstep === 'look' ? 4 : 2 }) : '') + '</div>'
    + '<div class="cr-pside"><div class="cr-povr"><span class="k-num">' + C.show(C.ovrOf(L)) + '</span><span class="k-label">Overall</span>'
    + '<span class="cr-ceil">Ceiling <b>' + grade(L) + '</b></span></div>'
    + '<div class="cr-rt k-rows">' + rtRows(L, null, false) + '</div></div></div>'
    + (form.parent ? ori : '')
    + tabs
    + pane('player', '<span class="lab k-label">Name and number</span>'
      + '<div class="cr-name"><input id="cr-name" maxlength="28" value="' + esc(form.name) + '" aria-label="Player name" aria-describedby="cr-namehint" placeholder="Blank picks one for you" autocomplete="off">'
      + '<input id="cr-num" class="cr-num" inputmode="numeric" maxlength="2" value="' + form.num + '" aria-label="Jersey number">'
      + '<button class="k-btn k-sec" id="cr-dice" type="button" aria-label="New random name">New</button></div>'
      + '<p class="cr-namehint" id="cr-namehint" aria-live="polite">' + nameHint(form.name) + '</p>'
      + '<span class="lab k-label">Position</span><div class="cr-chips" id="cr-pos" role="group" aria-label="Position">' + pos + '</div>'
      + sizeHtml()
      + '<span class="lab k-label">Your game as a ' + esc(C.POS_NAME[form.pos].toLowerCase()) + '</span><div class="cr-opts cr-pick" id="cr-arch">' + arch + '</div>'
      + (archOn ? '<p class="cr-town">' + esc(archOn.blurb) + '</p>' : ''))
    + pane('look', lookRows(form.look, k.primary, k.secondary, form.num, true))
    + pane('story', (form.parent ? '' : ori) + setHtml())
    + pane('start', '<p class="cr-intro">Your player is made up. The schools and the league are real.</p>'
      + '<span class="lab k-label">Where it starts</span><div class="cr-opts" id="cr-start">' + starts + '</div>'
      + (road ? '<p class="cr-town">' + esc(rv.what) + ' at ' + esc(rv.where) + '. ' + esc(rv.sub) + '.</p>'
        : '<p class="cr-town">Your road to the draft is played the moment you start. You see how it went at the combine.</p>')
      + '<p class="cr-grade">Scouts grade your ceiling <b>' + grade(L) + '</b>. Age ' + L.age + '. How high you go is up to you.</p>')
    + '<div class="cr-cta">' + (next ? '<button class="k-btn k-sec" id="cr-bnext" type="button" data-bstep="' + next[0] + '">' + next[1] + ' ' + K.iconHtml('arrow', 1) + '</button>' : '')
    + '<button class="k-btn k-block k-big" id="cr-go">' + goText + '</button></div>'
    + '</div>';
}
/* THE NAME IS SAID BEFORE THE CAREER STARTS, not found missing at the end.
   The Career board takes a name made of letters, spaces, an apostrophe, a
   stop or a hyphen (C.boardName, which is the board's own rule), and files
   anything else as no name. The builder used to take whatever was typed and
   say nothing, so "Big Mike 23" played a whole career and then was nobody
   on the board. A blank name is fine and is picked at random, so the line
   says that too. The press offers the cleaned name rather than refusing. */
function nameHint(v){
  var n = String(v || '').replace(/\s+/g, ' ').trim();
  if (!n) return 'Leave it blank and we pick a name.';
  if (!C.boardName || C.boardName(n)) return '';
  var c = C.cleanName ? C.cleanName(n) : '';
  return 'The Career board takes letters, spaces, periods, hyphens and apostrophes. This name will not show there.'
    + (c && C.boardName(c) ? ' <button class="cr-namefix" type="button" data-fix="' + esc(c) + '">Use ' + esc(c) + '</button>' : '');
}
function paintNameHint(){
  var h = $('cr-namehint');
  if (!h) return;
  var html = form ? nameHint(form.name) : '';
  if (h.innerHTML !== html) { h.innerHTML = html; wireNameHint(); }
  h.classList.toggle('bad', !!form && !!String(form.name || '').trim() && !!C.boardName && !C.boardName(String(form.name).replace(/\s+/g, ' ').trim()));
}
function wireNameHint(){
  var f = document.querySelector('#cr-namehint .cr-namefix');
  if (f) f.onclick = function(){ form.name = f.getAttribute('data-fix'); var nm = $('cr-name'); if (nm) nm.value = form.name; paintNameHint(); };
}
var bstep = 'player';
function wireBuild(){
  var root = $('s-car');
  var nm = $('cr-name'), nu = $('cr-num');
  if (nm) nm.oninput = function(){ form.name = nm.value; paintNameHint(); };
  paintNameHint();
  if (nu) nu.oninput = function(){ var v = nu.value.replace(/\D/g, '').slice(0, 2); nu.value = v; form.num = v === '' ? 0 : +v; };
  $('cr-dice').onclick = function(){ var s = String(Math.floor(Math.random() * 1e9)); form.seed = s; form.name = C.randomName(s); render(); };
  root.querySelectorAll('[data-pos]').forEach(function(b){ b.onclick = function(){ setPos(b.getAttribute('data-pos')); render(); }; });
  root.querySelectorAll('[data-size]').forEach(function(b){ b.onclick = function(){
    var p = b.getAttribute('data-size').split(':'), z = C.POS_SIZE[form.pos];
    if (p[0] === 'ht') { form.ht = Math.max(z.ht[0], Math.min(z.ht[1], form.ht + +p[1])); fitWt(); }
    else { var r = C.wtRange(form.ht); form.wt = Math.max(r[0], Math.min(r[1], form.wt + +p[1])); }
    render();
  }; });
  root.querySelectorAll('[data-arch]').forEach(function(b){ b.onclick = function(){ form.arch = b.getAttribute('data-arch'); render(); }; });
  root.querySelectorAll('[data-origin]').forEach(function(b){ b.onclick = function(){ form.origin = b.getAttribute('data-origin'); render(); }; });
  root.querySelectorAll('[data-diff]').forEach(function(b){ b.onclick = function(){ form.diff = b.getAttribute('data-diff'); render(); }; });
  root.querySelectorAll('[data-ch]').forEach(function(b){ b.onclick = function(){ form.challenge = b.getAttribute('data-ch'); chOpen = true; render(); }; });
  var cg = root.querySelector('.cr-chal'); if (cg) cg.ontoggle = function(){ chOpen = cg.open; };
  root.querySelectorAll('[data-legend]').forEach(function(b){ b.onclick = function(){ form.legend = b.getAttribute('data-legend') === '1'; render(); }; });
  root.querySelectorAll('[data-start]').forEach(function(b){ b.onclick = function(){
    var v = b.getAttribute('data-start');
    if (v === 'hs' && !proOpen()) { askPro('career'); return; }
    form.start = v; render();
  }; });
  root.querySelectorAll('[data-bstep]').forEach(function(b){ b.onclick = function(){
    bstep = b.getAttribute('data-bstep'); render();
    var t = root.querySelector('.cr-steps');
    if (t && t.getBoundingClientRect().top < 0) t.scrollIntoView({ block: 'start' });
  }; });
  $('cr-home').onclick = goHome;
  $('cr-vault').onclick = openVault;
  var ns = $('cr-noson');
  if (ns) ns.onclick = function(){ form = null; render(); };
  wireLook(root, form.look, render);
  $('cr-go').onclick = function(){
    if (form.start === 'hs' && !proOpen()) { askPro('career'); return; }
    if (form.parent && !proOpen()) { askPro('family'); return; }
    var name = String(form.name || '').replace(/\s+/g, ' ').trim() || C.randomName(form.seed);
    var o = lifeOpts(); o.name = name;
    var L = form.start === 'hs' ? C.newLife(o) : C.generateRoad(o);
    store().cur = L;
    var gen = form.start !== 'hs';
    form = null;
    stage = { beats: [], result: null, reveal: gen };
    save();
    K.wipe();
    render();
    window.scrollTo(0, 0);
  };
}

// ─── the life ───────────────────────────────────────────────────────────────

/* What the last press produced, which is not saved: a reload starts from the
   card on top rather than replaying the sentence that led to it. `delta` is
   what that press moved, read once by the next paint for the pulses, the
   count-up and the rating deltas, and then dropped, so a tab press does not
   replay them. */
var stage = { beats: [], result: null, draft: null };
var tab = 'log';
function snap(L){ return { ovr: C.show(C.ovrOf(L)), m: Object.assign({}, L.m), rt: Object.assign({}, L.rt), team: L.team }; }

var TIPS = {
  health: ['Health', 'Your body. Under 40 and injuries come more often and last longer. Rest and treatment bring it back.'],
  morale: ['Morale', 'How you feel about where you are. Losing, benchings and drama pull it down. Happy players play better.'],
  fame: ['Fame', 'How big your name is. It drives endorsements, All-Star votes and what the media asks you.'],
  trust: ['Coach', 'How much your coach believes in you. It decides your minutes and your role.'],
};
var METER_ICON = { health: 'heart', morale: 'face', fame: 'star', trust: 'whistle', cash: 'cash' };

function idCard(L){
  var v = C.view(L), k = C.colorsOf(L);
  var ct = L.contract;
  var rv = C.roadView(L);
  var club = rv ? rv.what + (rv.level === 'High school' ? ' at ' + rv.where : '')
    : L.team ? teamName(L.team) : (L.draft && !L.draft.team ? 'Undrafted' : 'Draft prospect');
  /* A spec sheet rather than loose lines: each fact has a label, so the eye
     finds the contract without reading the coach's name first. */
  var spec = [];
  spec.push(['Age', String(L.age)]);
  if (v.role) spec.push(['Role', v.role.label]);
  if (rv) spec.push(['Level', rv.sub]);
  if ((L.team || rv) && v.coach) spec.push(['Coach', v.coach]);
  if (!rv && ct && ct.kind !== 'overseas') spec.push(['Contract', money(ct.salary) + ' · ' + ct.years + (ct.years === 1 ? ' yr left' : ' yrs left')]);
  if (L.season && L.season.goal && C.GOALS[L.season.goal]) spec.push(['Chasing', C.GOALS[L.season.goal][0]]);
  var cs = C.challengeOf ? C.challengeOf(L) : null;
  if (cs) spec.push(['Challenge', cs.name + ' · ' + (cs.met ? 'Done' : cs.out ? 'Out of reach' : cs.prog)]);
  if (L.opt && L.opt.diff) spec.push(['Difficulty', C.DIFFS[L.opt.diff].name]);
  var per = C.personaOf ? C.personaOf(L) : '';
  var strip = tag(L.pos + ' · ' + C.ARCHES[L.arch].name, 'k-team') + tag('#' + L.num + (L.ht ? ' · ' + C.heightText(L.ht) + ' ' + L.wt : ''))
    + (per && per !== 'Still writing it' ? '<span class="k-tag k-gold cr-persona" title="How the league sees you">' + esc(per) + '</span>' : '');
  return '<div class="k-panel k-team k-card-player cr-id">'
    + '<div class="k-stage"><div class="k-set">' + setArt(stageKind(L), k.primary, k.secondary, L.seed) + '</div>'
    + '<div class="cr-bignum" aria-hidden="true">' + esc(String(L.num)) + '</div><div class="cr-stripes" aria-hidden="true"></div>'
    + '<div class="k-teamwash"></div><div class="k-scrim-r"></div>'
    + '<div class="k-actor">' + portrait(L, { pose: L.team || rv ? 'ball' : 'stand', scale: 3 }) + '</div>'
    + '<div class="k-id"><h3 class="k-hero">' + esc(L.name) + '</h3>' + tag(club, 'k-team')
    + '</div><div class="k-ovr cr-shield"><span class="k-num" id="cr-ovr">' + C.show(v.ovr) + '</span><span class="k-pix">OVR</span></div></div>'
    + '<div class="cr-lines">' + (L.nick ? '<p class="cr-nick">"' + esc(L.nick) + '"</p>' : '')
    + '<dl class="k-spec cr-spec">' + spec.map(function(x){ return '<div><dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd></div>'; }).join('') + '</dl></div>'
    + '<div class="k-strip">' + strip + '</div>' + knownHtml(L) + '</div>';
}
/* What the career has shown: revealed traits (with the reason on hover and
   for a screen reader), the signature move and the skill badges. */
/* Traits, the signature move and the skill badges are icons too, read the
   same way the awards are: tap one for its name. */
/* Every trait and badge has a picture of its own, drawn for what it means
   (career-kit.js ICON16): a buzzer clock for Clutch, a piggy bank for the
   Saver, a backboard for the Glass cleaner, a ball on the rise for Board man.
   Two of them sharing one picture is two things a player cannot tell apart. */
var TRAIT_ICON = { clutch: ['clock', '#f4f1e8'], coachable: ['whistle', '#c9d2e3'], injuryProne: ['bandage', '#e9c39b'], lateBloomer: ['sprout', '#3ecf8e'],
  lockerVoice: ['megaphone', '#ff7a1a'], gymRat: ['dumbbell', '#8f9bb8'], hothead: ['angry', '#e5483f'], bigStage: ['spotlight', '#fff1a8'], ironMan: ['anvil', '#8f9bb8'],
  filmJunkie: ['film', '#c9d2e3'], spender: ['bag', '#e5483f'], saver: ['piggy', '#f29ab0'], showman: ['tophat', '#9b7bea'], loyal: ['home', '#c98b4e'], mercenary: ['moneybag', '#c9a15a'] };
var BADGE_ICON = { deadeye: ['target', '#e5483f'], floorgen: ['play', '#1e8c5b'], lockdown: ['lock', '#ffc94a'], glass: ['board', '#cfe4ff'], finisher: ['dunk', '#e2762a'],
  flight: ['wings', '#7fb2ff'], brain: ['bulb', '#fff1a8'], bucket: ['bucket', '#c9d2e3'], dimes: ['dime', '#e2762a'], boards: ['grab', '#e2762a'] };
function iconTile(ic, name, cls){
  return '<button type="button" class="cr-awi ' + (cls || '') + '" style="--ic:' + (ic[1] || '#b8c3e6') + '" data-aw="' + esc(name) + '" title="' + esc(name) + '" aria-label="' + esc(name) + '">' + (K.badgeHtml ? K.badgeHtml(ic[0], ic[1]) : K.iconHtml(ic[0], 6, ic[1])) + '</button>';
}
function knownHtml(L){
  var out = [];
  (C.TRAITS || []).forEach(function(k){ var t = L.traits && L.traits[k]; if (t && t.known) out.push(iconTile(TRAIT_ICON[k] || ['star', '#ffd166'], C.TRAIT_NAME[k] + (t.why ? '. ' + t.why : ''), 'cr-awi-pro')); });
  if (L.sig) out.push(iconTile(['bolt', '#ffc94a'], 'Signature move: ' + L.sig.name, 'cr-awi-col'));
  (C.badgeList ? C.badgeList(L) : []).forEach(function(b){ out.push(iconTile(BADGE_ICON[b.k] || ['medal', '#b8c3e6'], 'Badge: ' + b.name, 'cr-awi-hs')); });
  return out.length ? '<div class="cr-known cr-aw" aria-label="Known for"><span class="cr-awgrid">' + out.join('') + '</span><span class="cr-awcap" aria-live="polite">Tap one to see what it is.</span></div>' : '';
}
function meters(L, d){
  var m = L.m;
  var one = function(key){
    var t = TIPS[key], val = m[key], was = d && d.m ? d.m[key] : val;
    var cls = val > was ? ' is-up' : val < was ? ' is-down' : '';
    return '<button type="button" class="k-meter k-has-tip cr-m-' + key + cls + '" aria-label="' + t[0] + ' ' + val + ' of 100. ' + esc(t[1]) + '">'
      + K.iconHtml(METER_ICON[key], 2) + '<span class="k-pips">' + K.pips(val) + '</span>'
      + '<span class="k-mv">' + val + '</span><span class="k-mk">' + t[0] + '</span>'
      + '<span class="k-tip' + (key === 'health' ? ' k-left' : key === 'trust' ? ' k-right' : '') + '" role="tooltip"><b>' + t[0] + '</b>' + esc(t[1]) + '</span></button>';
  };
  return '<div class="k-panel k-tight k-meters cr-meters">' + one('health') + one('morale') + one('fame') + one('trust') + '</div>';
}
function facts(L){
  var s = L.season, v = C.view(L);
  var rec = s ? s.w + '-' + s.l : '-';
  var recSub = s ? seasonTag(s.year) + (s.g ? ' · game ' + s.g : ' · not started') : (L.year ? seasonTag(L.year) : '');
  var line = v.line ? v.line.pts + ' pts' : '-';
  var lineSub = v.line ? v.line.reb + ' reb · ' + v.line.ast + ' ast' : 'This season';
  return '<div class="cr-facts">'
    + '<div class="cr-fact"><span class="k">Record</span><b>' + rec + '</b><small>' + esc(recSub) + '</small></div>'
    + '<div class="cr-fact"><span class="k">Your line</span><b>' + line + '</b><small>' + lineSub + '</small></div>'
    + thirdFact(L)
    + '</div>';
}

/* The third fact is the one that matters at this stage of a life: the class
   ranking in high school, the mock draft in college, the money after. */
function thirdFact(L){
  var a = L.am, lv = a && L.stage !== 'nba' ? a.level : null;
  if (lv === 'hs') return '<div class="cr-fact"><span class="k">Ranking</span><b>' + (a.rank > 600 ? '-' : '#' + a.rank) + '</b><small>' + (a.rank > 600 ? 'Unranked' : C.starsOf(a.rank) + ' stars') + '</small></div>';
  if (lv === 'col') {
    var p = C.projectedPick(L, a.stock || 0);
    return '<div class="cr-fact"><span class="k">Mock draft</span><b>' + (p <= 60 ? C.ordinal(p) : '-') + '</b><small>NIL ' + money(L.cash) + '</small></div>';
  }
  return '<div class="cr-fact"><span class="k">Bank</span><b>' + money(L.cash) + '</b><small>' + money(L.earned) + ' earned</small></div>';
}

/* A decision. Numbered so a keyboard can answer it (1 to 4), and the hint
   under each answer is the consequence, written plainly. */
function cardHtml(L, c, fresh){
  var cls = c.kind === 'clutch' ? ' clutch k-gold' : c.kind === 'fa' ? ' fa' : '';
  var opts = c.options.map(function(o, i){
    /* An answer that is a club carries a second, smaller button: the club's
       roster, so a man can see who he would be playing with before he signs. */
    var ros = o.club && C.clubView ? '<button type="button" class="cr-ros" data-ros="' + i + '" aria-label="See the ' + esc(o.club) + ' roster">' + K.iconHtml('clip', 2) + '<span>Roster</span></button>' : '';
    return '<li' + (ros ? ' class="cr-hasros"' : '') + '><button class="k-opt cr-choice" data-i="' + i + '"' + (i < 9 ? ' aria-keyshortcuts="' + (i + 1) + '"' : '') + '>'
      + '<span class="k-key" aria-hidden="true">' + (i + 1) + '</span><span><span class="cr-ol">' + esc(o.label) + '</span>' + (o.hint ? '<small>' + esc(o.hint) + '</small>' : '') + '</span></button>' + ros + '</li>';
  }).join('');
  /* On a phone the card is the tray: it rises once when a decision arrives
     and fades its contents when one replaces another, and never moves when a
     redraw keeps the same card. */
  var key = cardKey(c), motion = '';
  if (trayMode()) motion = !trayKey ? ' cr-tray-rise' : trayKey !== key ? ' cr-tray-swap' : '';
  else if (fresh) motion = ' k-in';
  trayKey = key;
  /* The band: where you are, then when. A card with no place of its own says
     the date where the place would be. */
  var when = c.eyebrow || 'Your call';
  var scene = c.scene ? c.scene : when;
  var icon = c.kind === 'clutch' ? 'ball' : sceneIcon(scene);
  return '<div class="k-panel k-decision cr-card' + cls + motion + '" id="cr-card" role="group" aria-labelledby="cr-card-h">'
    + '<span class="cr-grip" aria-hidden="true"></span>'
    + '<div class="cr-band">' + K.iconHtml(icon, 2) + '<span class="cr-scene">' + esc(scene) + '</span>' + (c.scene ? '<span class="cr-when">' + esc(when) + '</span>' : '') + '</div>'
    + '<div class="cr-cbody">' + (c.lead ? '<p class="cr-lead" id="cr-card-lead">' + esc(c.lead) + '</p>' : '') + '<h3 class="k-h1" id="cr-card-h">' + esc(c.title) + '</h3>'
    + (c.text ? '<p class="cr-clamp" id="cr-card-p">' + esc(c.text) + '</p><button type="button" class="cr-more" id="cr-card-more" hidden>More</button>' : '')
    + '<ol class="k-opts">' + opts + '</ol></div></div>';
}
/* An icon for the place, read off the words in it. */
var SCENE_ICONS = [[/plane|road|flight|hotel|airport|bus/i, 'plane'], [/home|house|kitchen|mom|family|couch|living/i, 'home'],
  [/bank|agent|office|contract|money|sponsor|deal|bill/i, 'cash'], [/media|press|mic|podcast|interview|studio|camera|tv|show/i, 'mic'],
  [/trainer|doctor|hospital|rehab|medical|treatment|surgery/i, 'heart'], [/draft|stage|green room/i, 'star'],
  [/phone|text|dm|group chat|feed|timeline/i, 'share'], [/shoe|sneaker|store|mall/i, 'shoe'], [/trophy|award|banquet|parade|hall/i, 'trophy']];
function sceneIcon(s){ for (var i = 0; i < SCENE_ICONS.length; i++) if (SCENE_ICONS[i][0].test(s || '')) return SCENE_ICONS[i][1]; return 'whistle'; }
/* The tray is a phone layout: a wide screen has room, so the card stays in
   the column. */
var trayKey = null;
function trayMode(){ return !(window.matchMedia && window.matchMedia('(min-width:720px)').matches); }
function cardKey(c){ return (c.key || c.id || '') + '|' + c.title; }
/* After a paint: pad the column by the tray's real height, and offer More
   only when the setup really is cut. */
function fitTray(){
  var root = $('s-car'), card = $('cr-card');
  if (!root) return;
  var on = !!(card && trayMode() && getComputedStyle(card).position === 'fixed');
  root.classList.toggle('cr-has-tray', on);
  if (!card) trayKey = null;
  if (!on) { root.style.removeProperty('--cr-tray'); return; }
  root.style.setProperty('--cr-tray', Math.ceil(card.getBoundingClientRect().height) + 'px');
  var p = $('cr-card-p'), more = $('cr-card-more');
  if (p && more) {
    more.hidden = !(p.classList.contains('cr-clamp') && p.scrollHeight > p.clientHeight + 2);
    more.onclick = function(){ p.classList.remove('cr-clamp'); more.hidden = true; fitTray(); };
  }
}
var trayRO = window.ResizeObserver ? new ResizeObserver(function(){ fitTray(); }) : null;
window.addEventListener('resize', function(){ if (onScreen && onScreen()) fitTray(); });
function beatsHtml(list, fresh){
  if (!list || !list.length) return '';
  return '<ul class="k-panel k-tight cr-beats' + (fresh ? ' k-in' : '') + '">' + list.map(function(b, i){
    return '<li class="' + (b.tone || '') + '" style="animation-delay:' + (REDUCED ? 0 : i * 90) + 'ms">' + esc(b.text) + '</li>';
  }).join('') + '</ul>';
}
/* The receipt: what you chose, what happened, and what it moved. */
function resultHtml(r, fresh){
  if (!r) return '';
  var rows = (r.diff || []).map(function(x){
    var v = x.money ? (x.d > 0 ? '+' : '-') + money(Math.abs(x.d)) : (x.d > 0 ? '+' : '') + x.d;
    var ic = METER_ICON[x.k] || (x.d > 0 ? 'up' : 'down');
    return '<li>' + K.iconHtml(ic, 2) + '<span>' + esc(x.k === 'trust' ? 'Coach trust' : x.label) + '</span><b class="' + (x.d > 0 ? 'up' : 'down') + '">' + v + '</b></li>';
  }).join('');
  return '<div class="k-panel k-receipt cr-result ' + (r.tone || '') + (fresh ? ' k-in' : '') + '" aria-live="polite">'
    + '<div class="k-eyebrow">' + K.iconHtml('check', 2) + 'What changed</div>'
    + '<div class="cr-you">You: ' + esc(r.label) + '</div><p class="k-what">' + esc(r.text) + '</p>'
    + contestHtml(r.contest)
    + rowsFold(r.diff || [], rows) + '</div>';
}
/* On a phone the rows a press moved fold to one line (the first three, then
   how many more), so the receipt above the tray stays short. Open on a wide
   screen, where there is room. */
function rowsFold(diff, rows){
  if (!rows) return '';
  if (!trayMode()) return '<ul>' + rows + '</ul>';
  var bit = function(x){
    var v = x.money ? (x.d > 0 ? '+' : '-') + money(Math.abs(x.d)) : (x.d > 0 ? '+' : '') + x.d;
    return esc(x.k === 'trust' ? 'Trust' : x.label) + ' <span class="' + (x.d > 0 ? 'up' : 'down') + '">' + v + '</span>';
  };
  var line = diff.slice(0, 3).map(bit).join(' · ') + (diff.length > 3 ? ' · ' + (diff.length - 3) + ' more' : '');
  return '<details class="cr-rows"><summary>' + line + '<b class="op">Show</b><b class="cl">Hide</b></summary><ul>' + rows + '</ul></details>';
}
/* A Saturday contest: who was in it, round one, the final, and where you
   finished. Out in round one is a hyphen in the final column. */
function contestHtml(c){
  if (!c || !c.rows) return '';
  var head = '<div class="cr-ct-r cr-ct-h" role="row"><span role="columnheader">The field</span><span role="columnheader">Rd 1</span><span role="columnheader">Final</span></div>';
  return '<div class="cr-ct" role="table" aria-label="' + esc(c.name) + ' results">' + head + c.rows.map(function(x){
    return '<div class="cr-ct-r' + (x.you ? ' you' : '') + (x.place === 1 ? ' win' : '') + '" role="row">'
      + '<span role="cell"><b>' + x.place + '</b>' + esc(x.you ? 'You' : x.n) + ' <i>' + esc(x.club) + '</i></span>'
      + '<span role="cell">' + x.r1 + '</span><span role="cell">' + (x.f == null ? '-' : x.f) + '</span></div>';
  }).join('') + '</div>';
}
function draftHtml(L, d){
  if (!d) return '';
  var k = skin(d.team);
  return '<div class="k-panel k-team cr-draft" id="cr-draftbox" data-c1="' + k.primary + '" data-c2="' + k.secondary + '">'
    + '<div class="cr-dset">' + setArt('nba', k.primary, k.secondary, 'draft' + d.pick) + '</div><div class="cr-din">'
    + '<div class="tick" id="cr-tick">' + esc(C.say ? C.say(L, '{commish}') : 'The commissioner') + ' steps up</div>'
    + '<div class="pk" id="cr-pk">#' + d.pick + '</div>'
    + '<div class="tm" id="cr-tm">' + esc(teamName(d.team)) + '</div></div></div>';
}

function stageHtml(L, fresh){
  var out = '';
  if (L.opt && L.opt.gen && !L.draft && L.stage === 'nba') out += roadHtml(L, false);
  if (stage.draft) out += draftHtml(L, stage.draft);
  out += resultHtml(stage.result, fresh);
  out += beatsHtml(stage.beats, fresh);
  if (L.pending.length) out += cardHtml(L, L.pending[0], fresh);
  var tk = stage.tick && window.RTF_TICKER ? window.RTF_TICKER.strip(stage.tick) : '';
  if (L.pending.length) out += tk;
  else {
    var acts = C.actsOpen(L);
    if (acts.length) {
      out += '<div class="cr-acts">';
      if (acts.some(function(a){ return a.id === 'coach'; })) out += btnAct(acts, 'coach');
      if (acts.some(function(a){ return a.id === 'trade'; })) out += btnAct(acts, 'trade');
      out += '<button class="k-btn k-sec" id="cr-off">Off the court</button></div>';
    }
    out += tk;
  }
  return '<div class="cr-stage" id="cr-stage">' + out + '</div>';
}
function btnAct(acts, id){
  var a = acts.filter(function(x){ return x.id === id; })[0];
  return '<button class="k-btn k-sec" data-act="' + id + '"' + (a.ok ? '' : ' disabled') + '>' + esc(a.name) + (a.used ? ' (done)' : '') + '</button>';
}
/* The one action when nothing is asked, where the thumb is. */
function dockHtml(L){
  if (L.pending.length) return '';
  var lab = C.nextLabel(L);
  if (!lab) return '';
  return '<div class="cr-dock" id="cr-dock"><button class="k-btn k-block k-big cr-next" id="cr-next">' + esc(lab) + '</button></div>';
}

/* The ratings are a fold on a phone, so the decision card and the season
   numbers come first. It opens itself when a press has just moved a rating,
   stays the way it was left otherwise, and is always open on a wide screen. */
var rtOpen = false;
function ratingsHtml(L, d){
  var moved = !!(d && d.rt && C.RATINGS.some(function(k){ return d.rt[k] != null && d.rt[k] !== L.rt[k]; }));
  var wide = window.matchMedia && window.matchMedia('(min-width:720px)').matches;
  var open = wide || rtOpen || moved;
  return '<details class="k-panel cr-sec cr-rtfold"' + (open ? ' open' : '') + '><summary class="k-eyebrow">' + K.iconHtml('up', 2) + 'Ratings'
    + '<span class="cr-rtsum">' + C.show(C.ovrOf(L)) + ' OVR · Ceiling ' + grade(L) + '</span></summary>'
    + '<p class="k-small" style="margin:0 0 10px">Green counts most at ' + esc(L.pos) + '. Ceiling ' + grade(L) + '.</p>'
    + '<div class="cr-rt cr-two k-rows">' + rtRows(L, d && d.rt, !!d) + '</div></details>';
}
function tabsHtml(L){
  var body = '';
  if (tab === 'log') {
    var log = L.log.slice().reverse().slice(0, 160);
    body = '<ul class="cr-log">' + log.map(function(e){ return '<li class="' + (e.tone || '') + '"><span class="yr">' + e.y + '</span><span>' + esc(e.t) + '</span></li>'; }).join('') + '</ul>';
  } else if (tab === 'team' && C.rotationOf && C.rotationOf(L)) body = teamHtml(L);
  else if (tab === 'seasons') body = seasonsTable(L);
  else if (tab === 'people') body = peopleHtml(L);
  else if (tab === 'legacy') body = legacyHtml(L);
  else if (tab === 'news') body = newsHtml(L);
  else body = trophies(L);
  var TI = { log: 'clip', team: 'shirt', seasons: 'chart', trophies: 'trophy', people: 'people', legacy: 'crown', news: 'paper' };
  var t = function(id, name){ var on = tab === id; return '<button class="k-tab k-itab" role="tab" aria-selected="' + on + '" data-tab="' + id + '">' + K.iconHtml(TI[id], 2) + '<span>' + name + '</span></button>'; };
  return '<div class="k-panel cr-sec cr-tabsec"><div class="k-tabs k-itabs cr-tabs" role="tablist">' + t('log', 'Story') + (L.opt && L.opt.story && C.rotationOf && C.rotationOf(L) ? t('team', 'Team') : '') + t('seasons', 'Seasons') + t('trophies', 'Trophies')
    + (L.opt && L.opt.story ? t('people', 'People') + t('legacy', 'Legacy') + t('news', 'News') : '') + '</div>'
    + '<div role="tabpanel">' + body + '</div></div>';
}
/* YOUR CLUB: the thirteen in rotation order, where you stand, and the
   minutes. A teammate's points are an estimate at this season's minutes (see
   rotationOf); yours are the season you are playing. */
function teamHtml(L){
  var R = C.rotationOf(L), s = L.season, pg = s && s.gp ? C.perGame(s) : null;
  var ord = function(n){ var v = n % 100, x = ['th', 'st', 'nd', 'rd']; return n + (x[(v - 20) % 10] || x[v] || x[0]); };
  var head = '<div class="cr-leg"><div><b>' + ord(R.rank) + '</b><span>In the rotation</span></div>'
    + '<div><b>' + R.min + '</b><span>' + (R.played ? 'Minutes a night' : 'Minutes planned') + '</span></div>'
    + '<div><b>' + esc(R.slot ? 'Start ' + R.slot : R.role) + '</b><span>Your role</span></div></div>';
  var line = esc(teamName(R.club)) + (s && s.gp ? ' · ' + s.w + '-' + s.l : '') + (pg ? ' · You: ' + pg.pts + ' points, ' + pg.reb + (pg.reb === 1 ? ' rebound, ' : ' rebounds, ') + pg.ast + (pg.ast === 1 ? ' assist' : ' assists') : '');
  var rows = R.list.map(function(x, i){
    var pts = x.you ? (pg ? pg.pts : '-') : x.min > 0 ? x.pts : '-';
    var sep = i === 5 ? '<li class="cr-rot-sep" aria-hidden="true">Bench</li>' : '';
    var at = x.slot && x.slot !== x.pos ? x.pos + ', playing ' + x.slot : x.pos || '';
    return sep + '<li class="cr-rot-r' + (x.you ? ' you' : '') + (x.min <= 0 ? ' dnp' : '') + '"><span class="n">' + (x.slot || i + 1) + '</span>'
      + '<span class="who"><b>' + esc(x.you ? x.n + ' (you)' : x.n) + '</b><small>' + esc(at) + ' · ' + x.age + (x.pg ? ' · Pot ' + x.pg : '') + (x.yrs != null ? ' · ' + (x.yrs <= 1 ? 'expiring' : x.yrs + ' yrs') : '') + ' · ' + esc(x.role) + '</small></span>'
      + '<span class="v ovr' + (x.ovr != null ? ' ' + ovrTier(C.show(x.ovr)) : '') + '">' + (x.ovr != null ? C.show(x.ovr) : '-') + '</span><span class="v pay">' + (x.pay ? money(x.pay) : '-') + '</span><span class="v">' + (x.min > 0 ? x.min : '-') + '</span><span class="v">' + pts + '</span></li>';
  }).join('');
  return head + '<p class="k-small cr-rot-line">' + line + '</p>'
    + '<ol class="cr-rot" aria-label="Rotation"><li class="cr-rot-h" aria-hidden="true"><span class="n"></span><span class="who">Starters</span><span class="v">Ovr</span><span class="v pay">Pay</span><span class="v">Min</span><span class="v">Pts</span></li>' + rows + '</ol>'
    + picksHtml(L, R.club);
}
/* An overall wears its tier, the way a ratings card colours it. */
function ovrTier(o){ return o >= 90 ? 'tier-a' : o >= 84 ? 'tier-b' : o >= 78 ? 'tier-c' : 'tier-d'; }
/* The club's draft picks, four drafts out, and the firsts it has traded away. */
function picksHtml(L, c){
  var P = C.picksText ? C.picksText(L, c) : null;
  if (!P || !P.have) return '';
  return '<h3 class="cr-sub">Draft picks</h3><p class="k-small cr-picks">' + (P.have.length ? esc(P.have.join(' · ')) : 'None left.')
    + (P.owe.length ? '<br><span class="owe">Owed: ' + esc(P.owe.join(' · ')) + '</span>' : '') + '</p>';
}
/* The people a career has met, closest and furthest first. */
function peopleHtml(L){
  var P = Object.keys(L.people || {}).map(function(k){ return L.people[k]; });
  if (!P.length) return '<p class="k-small">Nobody yet. Give it a season.</p>';
  P.sort(function(a, b){ return Math.abs(b.rel) - Math.abs(a.rel) || b.met - a.met; });
  return '<ul class="cr-ppl">' + P.slice(0, 24).map(function(p){
    var w = Math.min(50, Math.abs(p.rel) / 2), last = p.notes && p.notes.length ? p.notes[p.notes.length - 1] : null;
    var word = p.rel >= 60 ? 'Close' : p.rel >= 20 ? 'Good' : p.rel > -20 ? 'Fine' : p.rel > -60 ? 'Cold' : 'Bad blood';
    var ini = String(p.n).split(/\s+/).map(function(w){ return w.charAt(0); }).join('').slice(0, 2).toUpperCase();
    return '<li><span class="cr-ava ' + (p.rel >= 20 ? 'good' : p.rel <= -20 ? 'bad' : '') + '" aria-hidden="true">' + esc(ini) + '</span><div><b>' + esc(p.n) + '</b><small>' + esc(p.role) + ' · since ' + p.met + '</small></div>'
      + '<div class="cr-rel" role="img" aria-label="' + esc(word) + ', ' + p.rel + '"><i class="' + (p.rel >= 0 ? 'up' : 'dn') + '" style="width:' + w + '%"></i></div>'
      + (last ? '<div class="note">' + last[0] + ': ' + esc(last[1]) + '</div>' : '') + '</li>';
  }).join('') + '</ul>';
}
/* Where the career stands with the Hall, what it chased, what it keeps. */
function legacyHtml(L){
  var v = C.legacyView(L), G = L.goals || [], M = C.memories ? C.memories(L) : [];
  var out = '<div class="cr-leg"><div><b>' + esc(v.rung) + '</b><span>Today</span></div>'
    + '<div><b>' + (v.next ? '+' + v.next.need : 'Top') + '</b><span>' + esc(v.next ? 'To ' + v.next.name : 'Of the ladder') + '</span></div>'
    + '<div><b>' + v.hof + '%</b><span>Hall chance</span></div></div>';
  if (C.routesOf && C.storyOn(L)) {
    var road = [L.origin ? C.ORIGINS[L.origin].name : null].concat(C.routesOf(L).map(function(k){ return C.ROUTES[k][0]; })).filter(Boolean);
    if (road.length) out += '<h3 class="cr-sub">Your road</h3><p class="cr-road">' + esc(road.join(' · ')) + '</p>';
  }
  if (v.watch.length) out += '<h3 class="cr-sub">Records watch</h3><ul class="cr-list">' + v.watch.map(function(w){ return '<li>' + w.left.toLocaleString('en-US') + ' ' + esc(w.word) + ' to ' + w.m.toLocaleString('en-US') + '.</li>'; }).join('') + '</ul>';
  if (G.length) out += '<h3 class="cr-sub">Goals · ' + G.filter(function(g){ return g.met; }).length + ' of ' + G.length + ' met</h3><ul class="cr-list">'
    + G.slice().reverse().slice(0, 10).map(function(g){ return '<li class="' + (g.met ? 'met' : '') + '"><span class="yr">' + g.y + '</span>' + esc(C.GOALS[g.k][0]) + (g.met ? '. Done.' : '. Missed.') + '</li>'; }).join('') + '</ul>';
  if (M.length) out += '<h3 class="cr-sub">Moments</h3><ul class="cr-list">' + M.map(function(m){ return '<li><span class="yr">' + m.y + '</span>' + esc(m.t) + '</li>'; }).join('') + '</ul>';
  return out;
}
/* The news: the MVP ladder while a season is on, then the feed, newest first. */
function newsHtml(L){
  var s = L.season, out = '';
  if (s && s.race && s.race.length) {
    out += '<h3 class="cr-sub" style="margin-top:0">MVP ladder · the break</h3><table class="k-table cr-race"><tbody>'
      + s.race.map(function(x){ return '<tr class="' + (x.you ? 'you' : '') + '"><td>' + x.rank + '</td><td>' + esc(x.n) + '</td><td>' + esc(x.club ? E.TEAM_NAMES[x.club] || x.club : '') + '</td></tr>'; }).join('') + '</tbody></table>';
  }
  out += leagueHtml(L);
  var F = (L.feed || []).slice().reverse().slice(0, 60);
  if (!F.length) return out + '<p class="k-small">Nothing written about you yet.</p>';
  return out + '<ul class="cr-feed">' + F.map(function(f){ return '<li class="' + (f.k === 'debate' ? 'debate' : '') + '"><span class="src">' + esc(f.s) + ' · ' + f.y + '</span>' + esc(f.t) + '</li>'; }).join('') + '</ul>';
}
/* The league office: last season's standings and every move, folded so the
   news still leads. */
function leagueHtml(L){
  if (!C.leagueTable) return '';
  var out = '', st = C.leagueTable(L), tx = C.transactions(L);
  if (st) {
    var col = function(name, list){ return '<div><b class="cr-st-h">' + name + '</b><ol class="cr-st">' + list.map(function(r){
      return '<li class="' + (r[0] === L.team ? 'you' : '') + '"><span>' + esc(E.TEAM_NAMES[r[0]] || r[0]) + '</span><span class="v">' + r[1] + '-' + r[2] + '</span></li>'; }).join('') + '</ol></div>'; };
    out += '<details class="k-fold"><summary>Standings · ' + (st.y - 1) + '-' + String(st.y).slice(2) + '</summary><div class="cr-st2">' + col('East', st.E) + col('West', st.W) + '</div></details>';
  }
  if (tx.length) out += '<details class="k-fold"><summary>Transactions · ' + tx.length + '</summary><ul class="cr-feed cr-tx">' + tx.slice(0, 60).map(function(x){
    var mine = L.team && x.c && x.c.indexOf(L.team) >= 0;
    return '<li class="' + (mine ? 'you' : '') + '"><span class="src">' + esc(TX_KIND[x.k] || 'Move') + ' · ' + x.y + '</span>' + esc(x.t) + '</li>'; }).join('') + '</ul></details>';
  return out;
}
var TX_KIND = { trade: 'Trade', fa: 'Free agency', deal: 'Re-signed', draft: 'Draft', retire: 'Retired' };
function td(l, v, cls){ return '<td data-l="' + l + '"' + (cls ? ' class="' + cls + '"' : '') + '>' + v + '</td>'; }
/* YOUR ARC. The Seasons tab was a table, which answers any one season and
   hides the shape of a career: when it took off, when it peaked, how long it
   held. So above the table every season played is one column, oldest on the
   left, as tall as the overall you finished it at, on a zero baseline so a
   column twice as tall is twice the number. Before the league is blue and the
   NBA is orange (validated against this panel for colour blindness), the peak
   wears its number, and a title season carries a ring above it: a SHAPE, so
   no fact here rests on colour alone. Every column is a button, and a tap
   says which season it was in the line under the strip. The table stays,
   because it is the readable view of the same numbers. Drawn from history
   the career already keeps, so it moves nothing the season reads. */
function arcHtml(L){
  var cols = (L.amHist || []).map(function(h){
    return { y: h.y, am: true, o: C.show(h.ovr), who: h.school, pts: h.pts, ring: /champion/i.test(h.finish || '') };
  }).concat((L.history || []).map(function(h){
    return { y: h.y, am: false, o: C.show(h.ovr), who: h.t ? E.TEAM_NAMES[h.t] || h.t : '', pts: h.pts, ring: h.po === 'Champion' };
  })).filter(function(c){ return c.o != null && !isNaN(c.o); });
  if (cols.length < 2) return '';
  var peak = 0;
  cols.forEach(function(c, i){ if (c.o > cols[peak].o) peak = i; });
  var both = cols.some(function(c){ return c.am; }) && cols.some(function(c){ return !c.am; });
  var bars = cols.map(function(c, i){
    var cap = seasonTag(c.y) + ' · ' + (c.who || '') + ' · ' + c.o + ' OVR · ' + c.pts + ' a night' + (c.ring ? ' · Champion' : '') + (i === peak ? ' · Your peak' : '');
    return '<button type="button" class="cr-arcb' + (c.am ? ' am' : '') + (i === peak ? ' pk' : '') + '" data-arc-cap="' + esc(cap) + '" aria-label="' + esc(cap) + '">'
      + (i === peak ? '<em>' + c.o + '</em>' : '') + (c.ring ? '<i class="cr-arcring" aria-hidden="true"></i>' : '')
      + '<span style="height:' + Math.max(4, Math.min(100, c.o)).toFixed(0) + '%"></span></button>';
  }).join('');
  var first = cols[0], last = cols[cols.length - 1];
  return '<div class="cr-arc"><div class="cr-archead"><b>Your arc</b><span>Overall by season. Tap one.</span></div>'
    + '<div class="cr-arcbars" role="group" aria-label="Overall each season">' + bars + '</div>'
    + '<div class="cr-arcx"><span>' + seasonTag(first.y) + '</span><span>' + seasonTag(last.y) + '</span></div>'
    + '<div class="cr-arcleg">' + (both ? '<span><i class="am"></i>Before the league</span><span><i></i>NBA</span>' : '')
    + (cols.some(function(c){ return c.ring; }) ? '<span><i class="ring"></i>Title</span>' : '') + '</div>'
    + '<p class="cr-arccap" aria-live="polite">Peak: ' + cols[peak].o + ' in ' + seasonTag(cols[peak].y) + (cols[peak].who ? ', ' + esc(cols[peak].who) : '') + '.</p></div>';
}
document.addEventListener('click', function(e){
  var b = e.target && e.target.closest && e.target.closest('.cr-arcb');
  if (!b) return;
  var wrap = b.closest('.cr-arc'), cap = wrap && wrap.querySelector('.cr-arccap');
  if (!cap) return;
  wrap.querySelectorAll('.cr-arcb.on').forEach(function(x){ x.classList.remove('on'); });
  b.classList.add('on');
  cap.textContent = b.getAttribute('data-arc-cap') + '.';
});
function seasonsTable(L){
  var am = amTable(L.amHist || []);
  var arc = arcHtml(L);
  if (!L.history.length) return am ? arc + am : '<p class="k-small">No seasons yet.</p>';
  var rows = L.history.slice().reverse().map(function(h){
    return '<tr class="' + (h.po === 'Champion' ? 'champ is-best' : '') + '">' + td('Season', seasonTag(h.y)) + td('Team', esc(h.t ? E.TEAM_NAMES[h.t] || h.t : '-'), 'cr-wide')
      + td('OVR', C.show(h.ovr)) + td('GP', h.gp) + td('PTS', h.pts) + td('REB', h.reb) + td('AST', h.ast)
      + td('Record', h.w + '-' + h.l) + td('Finish', esc(h.po), 'cr-wide') + '</tr>';
  }).join('');
  return arc + '<div class="cr-tblw k-tablewrap"><table class="k-table cr-tbl"><thead><tr><th>Season</th><th>Team</th><th>OVR</th><th>GP</th><th>PTS</th><th>REB</th><th>AST</th><th>Record</th><th>Finish</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
    + (am ? '<h3 class="cr-sub">Before the league</h3>' + am : '');
}
/* High school, college and a pro year, newest first. */
function amTable(list){
  if (!list.length) return '';
  var rows = list.slice().reverse().map(function(h){
    var fin = h.finish || '-';
    if (h.seed) fin = h.seed + ' seed · ' + fin;
    return '<tr class="' + (/champion/i.test(fin) ? 'champ is-best' : '') + '">' + td('Season', seasonTag(h.y)) + td('School', esc(h.school), 'cr-wide')
      + td('OVR', C.show(h.ovr)) + td('GP', h.gp) + td('PTS', h.pts) + td('REB', h.reb) + td('AST', h.ast)
      + td('Record', h.w + '-' + h.l) + td('Finish', esc(fin), 'cr-wide') + '</tr>';
  }).join('');
  return '<div class="cr-tblw k-tablewrap"><table class="k-table cr-tbl"><thead><tr><th>Season</th><th>School</th><th>OVR</th><th>GP</th><th>PTS</th><th>REB</th><th>AST</th><th>Record</th><th>Finish</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}
function awardCounts(L){
  var n = {};
  /* A generated road (free, draft night) is backstory, so its high school and
     college hardware is not on the shelf. A road you played (Pro) is. */
  var am = L.opt && L.opt.gen ? [] : (L.amHist || []);
  L.history.concat(am).forEach(function(h){ (h.aw || []).forEach(function(a){ n[a] = (n[a] || 0) + 1; }); });
  var order = ['champ', 'mvp', 'fmvp', 'an1', 'an2', 'an3', 'dpoy', 'star', 'roy', '6moy', 'mip', 'scor', 'ad1', 'ad2', 'olympic',
    'c_champ', 'c_npoy', 'c_mop', 'c_aa1', 'c_aa2', 'c_f4', 'c_fr', 'c_cpoy', 'c_allconf', 'hs_state', 'hs_mrbb', 'hs_aag', 'hs_allstate'];
  return order.filter(function(k){ return n[k]; }).map(function(k){ return { k: k, n: n[k], name: C.AWARD_NAME[k] }; });
}
/* AN AWARD IS AN ICON, not a sentence. A wall of pills was too much to read,
   so each award is its picture, colored for its tier, with a count in the
   corner. Tap one and its name shows under the shelf. */
var AW_ICON = {
  champ: ['trophy', '#ffc94a'], mvp: ['crown', '#ffc94a'], fmvp: ['starcup', '#ffc94a'], an1: ['med1', '#ffc94a'],
  an2: ['med2', '#c9d2e3'], an3: ['med3', '#d08a4a'], dpoy: ['shield', '#7fb2ff'], star: ['star', '#ffc94a'],
  roy: ['sprout', '#3ecf8e'], '6moy': ['six', '#ffc94a'], mip: ['chart', '#3ecf8e'], scor: ['flame', '#ff7a1a'],
  ad1: ['shield', '#c9d2e3'], ad2: ['shield', '#d08a4a'], olympic: ['torch', '#ffc94a'],
  c_champ: ['trophy', '#7fb2ff'], c_npoy: ['crown', '#7fb2ff'], c_mop: ['star', '#7fb2ff'], c_aa1: ['med1', '#7fb2ff'],
  c_aa2: ['med2', '#9fb6d8'], c_f4: ['net', '#e2762a'], c_fr: ['sprout', '#7fb2ff'], c_cpoy: ['crown', '#9fb6d8'], c_allconf: ['medal', '#5fc4c4'],
  hs_state: ['trophy', '#d08a4a'], hs_mrbb: ['crown', '#3ecf8e'], hs_aag: ['star', '#3ecf8e'], hs_allstate: ['medal', '#3ecf8e'],
};
function awardTags(aw){
  var tiles = aw.map(function(a){
    var ic = AW_ICON[a.k] || ['medal', '#ffd166'];
    var lvl = /^c_/.test(a.k) ? 'col' : /^hs_/.test(a.k) ? 'hs' : 'pro';
    var name = (a.n > 1 ? a.n + 'x ' : '') + a.name;
    return '<button type="button" class="cr-awi cr-awi-' + lvl + '" style="--ic:' + (ic[1] || '#b8c3e6') + '" data-aw="' + esc(name) + '" title="' + esc(name) + '" aria-label="' + esc(name) + '">'
      + (K.badgeHtml ? K.badgeHtml(ic[0], ic[1]) : K.iconHtml(ic[0], 6, ic[1])) + (a.n > 1 ? '<i>' + a.n + '</i>' : '') + '</button>';
  }).join('');
  return '<span class="cr-awgrid">' + tiles + '</span><span class="cr-awcap" aria-live="polite">Tap a badge to see what it is.</span>';
}
document.addEventListener('click', function(e){
  var b = e.target && e.target.closest && e.target.closest('.cr-awi');
  if (!b) return;
  var wrap = b.closest('.cr-aw'), cap = wrap && wrap.querySelector('.cr-awcap');
  if (!cap) return;
  wrap.querySelectorAll('.cr-awi.on').forEach(function(x){ x.classList.remove('on'); });
  b.classList.add('on');
  cap.textContent = b.getAttribute('data-aw');
});
function totalsHtml(T, second){
  return '<div class="cr-tot">'
    + '<div><b>' + T.pts.toLocaleString('en-US') + '</b><span>Points</span></div>'
    + (second || '<div><b>' + T.reb.toLocaleString('en-US') + '</b><span>Rebounds</span></div><div><b>' + T.ast.toLocaleString('en-US') + '</b><span>Assists</span></div>')
    + '<div><b>' + T.rings + '</b><span>Rings</span></div></div>';
}
function trophies(L){
  var T = C.totals(L);
  var aw = awardCounts(L);
  var chips = aw.length ? '<div class="cr-aw">' + awardTags(aw) + '</div>' : '<p class="k-small">Nothing yet. Go get something.</p>';
  return totalsHtml(T) + chips + rivalHtml(L)
    + '<p class="cr-lifeline">Off the floor: <b>' + esc(C.lifeLine(L)) + '</b></p>';
}
/* You against the man drafted next to you. */
function rivalHtml(L){
  var r = L.rival;
  if (!r) return '';
  var T = C.totals(L);
  var row = function(lab, a, b){ return '<tr>' + td('', lab) + td('You', a.toLocaleString('en-US'), a > b ? 'win' : '') + td(esc(r.name.split(' ').slice(-1)[0]), b.toLocaleString('en-US'), b > a ? 'win' : '') + '</tr>'; };
  var last = r.seasons[r.seasons.length - 1];
  var B = window.RTF_BALLER, rk = last && E.clubSkin ? E.clubSkin(last.team) : null;
  var pic = B ? B.img(B.lookFor(r.name), { c1: rk ? rk.primary : '#2b3242', c2: rk ? rk.secondary : '#c9ccd6', num: B.hash(r.name) % 99, scale: 1, still: true }) : '';
  return '<h3 class="cr-sub">Your rival</h3>'
    + '<div class="cr-rivalpic">' + pic + '<p class="cr-rivalwho"><b>' + esc(r.name) + '</b>, drafted ' + C.ordinal(r.pick) + '. '
    + (r.retired ? 'Retired.' : last ? E.teamName(last.team) + ', ' + last.pts + ' a night last season.' : 'Rookie year ahead.') + '</p></div>'
    + '<table class="k-table cr-tbl cr-vs"><thead><tr><th></th><th>You</th><th>' + esc(r.name.split(' ').slice(-1)[0]) + '</th></tr></thead><tbody>'
    + row('Points', T.pts, r.pts) + row('All-Star', T.star, r.star) + row('MVP', T.mvp, r.mvp) + row('Rings', T.rings, r.rings)
    + '</tbody></table>';
}

/* A pixel icon button with its word under it: four of them fit beside the
   title on a phone, and nobody has to guess what a square does. */
function ib(id, icon, word, more){
  return '<button class="k-ib cr-ib' + (more && more.cls ? ' ' + more.cls : '') + '" id="' + id + '" type="button"' + (more && more.attr ? ' ' + more.attr : '') + '>'
    + K.iconHtml(icon, 2) + '<span>' + esc(word) + '</span>' + (more && more.dot ? '<i aria-hidden="true"></i>' : '') + '</button>';
}
/* WHERE YOU ARE, in one line under the title: the season and the game, or
   the summer, then the club and its record. */
function hud(L){
  var s = L.season, rv = C.roadView(L);
  var when = s ? seasonTag(s.year) + (s.g ? ' · Game ' + s.g : ' · Preseason') : L.year ? 'Summer ' + (L.year - 1) : '';
  var where = rv ? rv.what : L.team ? (E.TEAM_NAMES && E.TEAM_NAMES[L.team] ? teamName(L.team).split(' ').slice(-1)[0] : teamName(L.team)) + (s ? ' ' + s.w + '-' + s.l : '') : 'Draft prospect';
  return '<div class="cr-hud"><b>' + esc(when) + '</b><span>' + esc(where) + '</span></div>';
}
function lifeView(L, d){
  var SC = window.RTF_SCENES, SN = window.RTF_SOUND;
  return '<div class="cr-top"><div class="cr-topl"><h2 class="k-h1">Career</h2>' + hud(L) + '</div><div class="cr-topbtns">'
    + (window.RTF_BALLER ? ib('cr-lookbtn', 'shirt', 'Look') : '')
    + (SC ? ib('cr-scenes', 'film', 'Scenes', { cls: 'cr-scn', dot: 1, attr: 'aria-pressed="' + SC.on() + '" title="Scenes ' + (SC.on() ? 'on' : 'off') + '"' }) : '')
    + (SC && SN ? ib('cr-sound', SN.on() ? 'sound' : 'mute', SN.on() ? 'Sound' : 'Muted', { cls: 'cr-snd', attr: 'aria-pressed="' + SN.on() + '" aria-label="Sound in scenes, ' + (SN.on() ? 'on' : 'off') + '"' }) : '')
    + ib('cr-home', 'home', 'Home', { cls: 'cr-home', attr: 'aria-label="Home"' }) + '</div></div>'
    + '<div class="cr-grid"><div class="cr-side">' + idCard(L) + meters(L, d) + '</div>'
    + '<div class="cr-main">' + stageHtml(L, !!d) + facts(L) + ratingsHtml(L, d) + tabsHtml(L)
    + (L.phase === 'after' ? '' : '<button class="k-btn k-quiet k-block" id="cr-quit">Retire now</button>')
    + dockHtml(L) + '</div></div>';
}

function wireLife(L, d){
  var root = $('s-car');
  var rf = root.querySelector('.cr-rtfold');
  if (rf) rf.ontoggle = function(){ if (!(window.matchMedia && window.matchMedia('(min-width:720px)').matches)) rtOpen = rf.open; };
  $('cr-home').onclick = goHome;
  var lb = $('cr-lookbtn');
  if (lb) lb.onclick = openLook;
  var sb = $('cr-scenes');
  if (sb) sb.onclick = function(){ var SC = window.RTF_SCENES; SC.setOn(!SC.on()); render(); };
  var sn = $('cr-sound');
  if (sn) sn.onclick = function(){ var SN = window.RTF_SOUND; SN.setOn(!SN.on()); if (SN.on()) SN.cue('chime'); render(); };
  var nx = $('cr-next');
  if (nx) nx.onclick = function(){ doStep(); };
  root.querySelectorAll('.cr-choice').forEach(function(b){
    b.onclick = function(){ doChoose(+b.getAttribute('data-i')); };
  });
  root.querySelectorAll('[data-ros]').forEach(function(b){
    b.onclick = function(){ openRoster(+b.getAttribute('data-ros')); };
  });
  root.querySelectorAll('[data-act]').forEach(function(b){ b.onclick = function(){ doAct(b.getAttribute('data-act')); }; });
  root.querySelectorAll('[data-tab]').forEach(function(b){ b.onclick = function(){ tab = b.getAttribute('data-tab'); render(); var t = root.querySelector('[data-tab="' + tab + '"]'); if (t) t.focus(); }; });
  /* The tab row scrolls sideways on a phone: the chosen tab is brought into it,
     and a fade on the right says there is more while there is. */
  var strip = root.querySelector('.k-itabs');
  if (strip) {
    var on = strip.querySelector('[aria-selected="true"]'), sec = strip.parentNode;
    if (on && on.offsetLeft + on.offsetWidth > strip.clientWidth) strip.scrollLeft = on.offsetLeft - 8;
    var edge = function(){ sec.classList.toggle('k-more-r', strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 4); };
    strip.onscroll = edge; edge();
  }
  var off = $('cr-off');
  if (off) off.onclick = openOff;
  var q = $('cr-quit');
  if (q) q.onclick = function(){ openRetire(L); };
  K.wireTips(root);
  var dr = $('cr-draftbox');
  if (dr) K.theme(dr, dr.getAttribute('data-c1'), dr.getAttribute('data-c2'));
  if (d && d.ovr != null && d.ovr !== C.show(C.ovrOf(L))) K.countUp($('cr-ovr'), C.show(C.ovrOf(L)), { from: d.ovr, ms: 700 });
  if (stage.draft) animateDraft();
  fitTray();
  var tc = $('cr-card');
  if (trayRO) { trayRO.disconnect(); if (tc) trayRO.observe(tc); }
}
function openRetire(L){
  openSheet('<h3 class="k-h1">Retire now?</h3><p class="cash">The career ends here and goes in your Hall of Fame. There is no coming back.</p>'
    + '<div class="cr-btnrow"><button class="k-btn" id="cr-retire-yes" type="button">Retire</button><button class="k-btn k-sec" id="cr-sheet-x" type="button">Keep playing</button></div>', 'Retire now?');
  $('cr-sheet-x').onclick = closeOff;
  $('cr-retire-yes').onclick = function(){
    closeOff();
    var before = snap(L);
    var beats = C.retireNow(L);
    if (L.retired) return finish();
    stage = { beats: beats, result: null, draft: null, delta: before };
    save();
    render();
    scrollStage();
  };
}

/* Answer the card on top with a number key, the way the options are labelled.
   Never while typing, while a sheet is open or while a scene is playing. */
var kbd = false;
function onKey(e){
  /* A held key repeats, and every repeat used to answer the next card: one
     second of holding 1 answered both combine interviews, the workout and
     the agent before any of them was on screen. A key answers once per press. */
  if (e.repeat || !onScreen() || e.ctrlKey || e.metaKey || e.altKey) return;
  var t = e.target, tn = t && t.tagName;
  if (tn === 'INPUT' || tn === 'TEXTAREA' || tn === 'SELECT') return;
  var sh = $('cr-sheet');
  if (sh && !sh.hidden) return;
  var SC = window.RTF_SCENES;
  if (SC && SC.isOpen && SC.isOpen()) return;
  if (window.RTF_TICKER && window.RTF_TICKER.isOpen()) return;
  var L = store().cur;
  if (!L || !L.pending.length) return;
  var n = parseInt(e.key, 10);
  if (!(n >= 1 && n <= L.pending[0].options.length)) return;
  e.preventDefault();
  var b = document.querySelector('.cr-choice[data-i="' + (n - 1) + '"]');
  if (b) b.classList.add('is-pressed');
  kbd = true;
  doChoose(n - 1);
}
document.addEventListener('keydown', onKey);

/* Every press redraws the screen, which drops focus on the floor. A keyboard
   or screen reader user is put back where the next thing is: the heading of
   the card on top (so it is read out, and Tab reaches the answers), or the
   next button. Never on a mouse or touch press, and never with a scroll. */
function refocus(was){
  if (!was) return;
  var t = $('cr-card-h') || $('cr-next');
  if (!t) return;
  if (t.id === 'cr-card-h') t.setAttribute('tabindex', '-1');
  try { t.focus({ preventScroll: true }); } catch (e) { t.focus(); }
}
/* A NEW CARD ARRIVES UNDER THE SAME THUMB. On a phone the card on top is a
   tray docked to the bottom of the screen, so the next card's first answer is
   drawn exactly where the last one was pressed, in the same frame. A quick
   double tap (about 110ms between taps) answered the next card unseen on a
   quarter of cards, and a double tap on Next played two stretches of the
   season. So after a TOUCH or MOUSE press the fresh answers and the Next
   button are disabled for ARM_MS: long enough to swallow the second tap of a
   double tap, short enough that nobody reading reaches it. Disabled rather than
   a timestamp the click handler checks, because a disabled button is what a
   person can see (it fades in) and what an automated click waits on. A
   keyboard press is not armed: focus moves to the next card's heading, and
   the held key is the repeat check in onKey. */
var ARM_MS = 320, armT = 0;
function arm(){
  var root = $('s-car');
  if (!root) return;
  var els = root.querySelectorAll('.cr-choice, #cr-next');
  if (!els.length) return;
  els.forEach(function(b){ b.disabled = true; b.classList.add('cr-arming'); });
  clearTimeout(armT);
  armT = setTimeout(function(){
    els.forEach(function(b){ b.disabled = false; b.classList.remove('cr-arming'); });
  }, ARM_MS);
}
function kbdFocus(){ var a = document.activeElement, r = $('s-car'); return !!(a && r && r.contains(a) && a.matches && a.matches(':focus-visible')); }
function doStep(){
  var L = store().cur;
  if (!L) return;
  var before = snap(L), kb = kbdFocus();
  var was = { phase: L.phase, poDone: L.season && L.season.po ? L.season.po.results.length : 0 };
  var res = C.step(L);
  stage = { beats: res.beats || [], result: null, draft: null, delta: before };
  var TK = window.RTF_TICKER, SC = window.RTF_SCENES;
  stage.tick = TK ? TK.dataFor(L, was, res.beats) : null;
  var d = (res.beats || []).filter(function(b){ return b.kind === 'draft' && b.pick; })[0];
  if (d) stage.draft = { pick: d.pick, team: d.team };
  if (L.retired) return finish();
  save();
  render();
  /* A stretch of games goes by on the live ticker first, then whatever
     moment it produced is told. */
  if (stage.tick && TK && SC && SC.on()) {
    TK.play(stage.tick, { done: function(){ if (!scene(res)) { scrollStage(); refocus(kb); if (!kb) arm(); } } });
    return;
  }
  if (!scene(res)) { scrollStage(); refocus(kb); if (!kb) arm(); }
}
function doChoose(i){
  var L = store().cur;
  if (!L) return;
  var before = snap(L), kb = kbd || kbdFocus();
  kbd = false;
  var res = C.choose(L, i);
  if (!res) return;
  stage = { beats: res.beats || [], result: res, draft: null, delta: before };
  if (L.retired) return finish();
  save();
  render();
  if (!scene(res)) { scrollStage(); refocus(kb); if (!kb) arm(); }
}

/* ─── scenes (hoops/scenes.js) ───────────────────────────────────────────
   After the engine moves, the moment it produced is told as a scene, and a
   decision it put on the table (a press conference, Game 7, signing day) is
   asked inside it. The screen behind is already redrawn, so a scene closed
   or skipped leaves the plain card there to answer. A card is put in a scene
   once, and not again after a reload. */
var seenCard = {};
function scene(res){
  var SC = window.RTF_SCENES, L = store().cur;
  if (!SC || !SC.on() || !L) return false;
  var beats;
  try { beats = SC.chain(L, res, seenCard); } catch (e) { return false; }
  if (!beats || !beats.length) return false;
  var b = SC.build(L, null, null);
  try {
    SC.play(beats, b.ctx, {
      card: function(){
        var L2 = store().cur, c = L2 && L2.pending[0];
        return c && SC.PRESENTABLE.indexOf(c.id) >= 0 ? c : null;
      },
      choose: function(n, extra){
        var L2 = store().cur;
        if (!L2) return null;
        var before = snap(L2);
        var r = C.choose(L2, n, extra);
        if (!r) return null;
        stage = { beats: r.beats || [], result: r, draft: null, delta: before };
        if (!L2.retired) { save(); render(); }
        return r;
      },
      follow: function(r){
        var L2 = store().cur;
        if (!L2 || L2.retired) return [];
        try { return SC.chain(L2, r, seenCard); } catch (e) { return []; }
      },
      done: function(){
        var L2 = store().cur;
        if (L2 && L2.retired) { finish(); return; }
        render();
        scrollStage();
      },
    });
  } catch (e) { return false; }
  return true;
}

/* ─── the Look sheet, mid-career ─────────────────────────────────────────── */
function openLook(){
  var L = store().cur;
  if (!L || !window.RTF_BALLER) return;
  var look = Object.assign({}, window.RTF_BALLER.normal(lookOf(L)));
  var k = C.colorsOf(L);
  var first = true;
  var draw = function(){
    var html = '<h3 class="k-h1">Your look</h3><p class="cash">How you look on the floor and in every scene.</p>'
      + lookRows(look, k.primary, k.secondary, L.num)
      + '<div class="cr-btnrow" style="margin:14px 0 0"><button class="k-btn" id="cr-look-save" type="button">Save</button><button class="k-btn k-sec" id="cr-sheet-x" type="button">Cancel</button></div>';
    if (first) { openSheet(html, 'Your look'); first = false; }
    else $('cr-sheet').querySelector('.in').innerHTML = html;
    var sh = $('cr-sheet');
    wireLook(sh, look, draw);
    $('cr-look-save').onclick = function(){ C.setLook(L, look); save(); closeOff(); render(); };
    $('cr-sheet-x').onclick = closeOff;
  };
  draw();
}
function doAct(id){
  var L = store().cur;
  if (!L) return;
  var before = snap(L);
  var res = C.act(L, id);
  if (!res) return;
  closeOff();
  stage = { beats: [], result: res, draft: null, delta: before };
  save();
  render();
  scrollStage();
}
/* The stage is where the eye goes after a press, not the top of the page. */
function scrollStage(){
  var st = $('cr-stage');
  if (!st) return;
  var r = st.getBoundingClientRect();
  /* A decision is what the eye has to land on: if its first answer would
     sit below the fold, the screen moves to it even when the stage itself
     starts on screen. */
  /* In the tray the answers are pinned on screen already, so the page only
     has to bring what happened into view above it. */
  var ch = trayMode() && document.querySelector('#s-car.cr-has-tray') ? null : st.querySelector('.cr-choice'), cr = ch ? ch.getBoundingClientRect() : null;
  var low = cr && cr.bottom > window.innerHeight - 24;
  if (r.top < 60 || r.top > window.innerHeight * 0.55 || low) {
    /* When a receipt and the beats stand above the card, the stage top is
       further up than the answers can afford: the answers win. */
    var to = low ? Math.max(window.scrollY + r.top - 70, window.scrollY + cr.bottom - window.innerHeight * 0.7) : window.scrollY + r.top - 70;
    window.scrollTo({ top: Math.max(0, to), behavior: REDUCED ? 'auto' : 'smooth' });
  }
}

/* Draft night counts through the picks before yours, then lands. */
function animateDraft(){
  var d = stage.draft, tick = $('cr-tick'), pk = $('cr-pk'), tm = $('cr-tm');
  if (!d || !tick || REDUCED) return;
  var L = store().cur;
  var order = C.draftOrder(L);
  var n = 1;
  pk.style.visibility = 'hidden'; tm.style.visibility = 'hidden';
  var step = Math.max(28, Math.min(90, 1400 / Math.max(1, d.pick)));
  var t = setInterval(function(){
    if (!document.body.contains(tick)) { clearInterval(t); return; }
    if (n >= d.pick) {
      clearInterval(t);
      tick.textContent = 'With the ' + C.ordinal(d.pick) + ' pick';
      pk.style.visibility = ''; tm.style.visibility = '';
      stage.draft = null;
      return;
    }
    tick.textContent = 'Pick ' + n + ': the ' + (E.TEAM_NAMES[order[n - 1]] || order[n - 1]) + ' are on the clock';
    n++;
  }, step);
}

// ─── off the court ──────────────────────────────────────────────────────────

/* One sheet for everything off the main line: a phone gets it from the
   bottom, a desktop a centred modal, and focus stays inside it. */
var dlg = null;
function openSheet(html, label){
  var sh = $('cr-sheet');
  sh.querySelector('.in').innerHTML = html;
  if (dlg) { dlg = null; }
  dlg = K.dialog(sh, { label: label, onClose: function(){ dlg = null; } });
  K.wireTips(sh);
}
function openOff(){
  var L = store().cur;
  if (!L) return;
  var acts = C.actsOpen(L).filter(function(a){ return a.id !== 'coach' && a.id !== 'trade'; });
  openSheet('<h3 class="k-h1">Off the court</h3><p class="cash">In the bank: <b>' + money(L.cash) + '</b>. One of each a season.</p>'
    + acts.map(function(a){
      return '<div class="cr-actrow"><div><b>' + esc(a.name) + '</b><small>' + esc(a.blurb) + (a.cost ? ' · ' + money(a.cost) : '') + '</small></div>'
        + '<button class="k-btn' + (a.ok ? '' : ' k-sec') + '" data-oact="' + a.id + '"' + (a.ok ? '' : ' disabled') + '>' + (a.used ? 'Done' : 'Do it') + '</button></div>';
    }).join('')
    + '<button class="k-btn k-sec k-block" id="cr-sheet-x" style="margin-top:12px">Close</button>', 'Off the court');
  var sh = $('cr-sheet');
  sh.querySelectorAll('[data-oact]').forEach(function(b){ b.onclick = function(){ doAct(b.getAttribute('data-oact')); }; });
  $('cr-sheet-x').onclick = closeOff;
}
/* A CLUB'S ROSTER, from a card that offers it: who is there, best first,
   with you placed where your overall puts you, and the same answer as the
   card one press away. */
function openRoster(i){
  var L = store().cur, c = L && L.pending && L.pending[0], o = c && c.options[i];
  if (!o || !o.club) return;
  var V = C.clubView(L, o.club);
  if (!V) return;
  var ord = function(n){ var v = n % 100, x = ['th', 'st', 'nd', 'rd']; return n + (x[(v - 20) % 10] || x[v] || x[0]); };
  var rows = V.list.map(function(m){
    return '<li><span class="n">' + esc(m.pos || '') + '</span><span class="who"><b>' + esc(m.n) + '</b><small>' + m.age + (m.pg ? ' · Pot ' + m.pg : '') + (m.yrs != null ? ' · ' + (m.yrs <= 1 ? 'expiring' : m.yrs + ' yrs') : '') + '</small></span>'
      + '<span class="v ovr">' + C.show(m.ovr) + '</span><span class="v pay">' + (m.pay ? money(m.pay) : '-') + '</span></li>';
  });
  var you = '<li class="you"><span class="n">' + esc(L.pos || '') + '</span><span class="who"><b>' + esc(L.name) + ' (you)</b><small>' + L.age + '</small></span><span class="v ovr">' + C.show(V.me) + '</span><span class="v pay">' + (o.hint && /\$[\d.]+M/.test(o.hint) ? o.hint.match(/\$[\d.]+M/)[0] : '-') + '</span></li>';
  rows.splice(Math.min(V.at - 1, rows.length), 0, you);
  var k = skin(V.club);
  openSheet('<h3 class="k-h1 cr-ros-h" style="border-left:6px solid ' + k.primary + '">' + esc(teamName(V.club)) + '</h3>'
    + '<p class="cash">' + esc(V.tier) + (V.coach ? ' · Coach ' + esc(V.coach) : '') + '. You would be their ' + (V.at === 1 ? '<b>best</b> player' : '<b>' + ord(V.at) + '</b> best player') + '.</p>'
    + (o.hint ? '<p class="k-small cr-ros-deal">' + esc(o.hint) + '</p>' : '')
    + '<ol class="cr-rot cr-rot-ros" aria-label="Roster"><li class="cr-rot-h" aria-hidden="true"><span class="n"></span><span class="who">Player</span><span class="v">Ovr</span><span class="v pay">Pay</span></li>' + rows.join('') + '</ol>'
    + '<div class="cr-btnrow" style="margin:14px 0 0"><button class="k-btn" id="cr-ros-go" type="button">' + esc(o.label) + '</button><button class="k-btn k-sec" id="cr-sheet-x" type="button">Back</button></div>', teamName(V.club) + ' roster');
  $('cr-ros-go').onclick = function(){ closeOff(); doChoose(i); };
  $('cr-sheet-x').onclick = closeOff;
}
function closeOff(){
  if (dlg) { var d = dlg; dlg = null; d.close(); return; }
  var sh = $('cr-sheet'); if (sh) sh.hidden = true;
}

// ─── the end ────────────────────────────────────────────────────────────────

/* One line about the road, for the Hall of Fame card and the share. */
function collegeOf(L){
  var col = (L.amHist || []).filter(function(h){ return h.lvl === 'NCAA'; });
  if (!col.length) {
    var pro = (L.amHist || []).filter(function(h){ return h.lvl !== 'HS'; })[0];
    return pro ? (pro.lvl === 'Overseas' ? 'Turned pro overseas out of high school' : 'Went to the G League out of high school') : '';
  }
  var schools = [];
  col.forEach(function(h){ if (schools.indexOf(h.school) < 0) schools.push(h.school); });
  var titles = col.filter(function(h){ return (h.aw || []).indexOf('c_champ') >= 0; }).length;
  var yrs = col.length === 1 ? 'One and done at ' : col.length + ' years at ';
  return yrs + (schools.length > 2 ? schools.slice(0, -1).join(', ') + ' and ' + schools[schools.length - 1] : schools.join(' and ')) + (titles ? '. National champion' : '');
}

/* The league a son starts in, kept small: the slot is half a megabyte for
   everything. The news flags only stop a headline twice and are left. */
function trimLeague(lg){
  var o = {};
  for (var k in lg) if (k !== 'news' && k !== 'rost' && k !== 'rostY' && k !== 'lines' && k !== 'pool' && k !== 'fa' && k !== 'fo') o[k] = lg[k];
  if (o.figs) o.figs = o.figs.filter(function(f){ return !f.gone; });
  if (o.champs) { var ks = Object.keys(o.champs).sort().slice(-40), c = {}; ks.forEach(function(y){ c[y] = o.champs[y]; }); o.champs = c; }
  return JSON.parse(JSON.stringify(o));
}
/* A finished career leaves the slot and goes on the shelf of Hall of Fame
   cards, so the next one can start while this one is still on screen. */
function finish(){
  var st = store(), L = st.cur;
  if (!L) return;
  var f = L.final || C.legacy(L);
  var teams = [];
  L.history.forEach(function(h){ if (h.t && teams.indexOf(h.t) < 0) teams.push(h.t); });
  var kc = C.colorsOf(L);
  var card = { name: L.name, num: L.num, pos: L.pos, verdict: f.verdict, blurb: f.blurb, score: f.score,
    look: lookOf(L), c1: kc.primary, c2: kc.secondary, age: L.age, persona: C.personaOf ? C.personaOf(L) : '',
    from: L.history.length ? L.history[0].y : L.year, to: L.history.length ? L.history[L.history.length - 1].y : L.year,
    teams: teams, totals: f.totals, awards: awardCounts(L), history: L.history, amHist: L.amHist || [], college: collegeOf(L),
    after: f.after || '', jersey: f.jersey || null, rival: f.rival || null, life: f.life || '',
    sons: C.sonsOf ? C.sonsOf(L) : 0,
    nick: f.nick || null, traits: f.traits || null, sig: f.sig || null, badges: f.badges || null, moments: f.moments || null, goals: f.goals || null,
    team: teams[teams.length - 1] || null, at: Date.now(),
    origin: f.origin || null, epilogue: f.epilogue || '',
    ending: f.ending ? { tier: f.ending.tier, tierName: f.ending.tierName, names: f.ending.names || [], secretName: f.ending.secretName || null, routes: f.ending.routes || [] } : null,
    /* Phase E: who this was, whose son, the story, the Vault ids, and the
       league as he left it for a son to start in. */
    id: String(L.seed), parent: L.parent ? L.parent.id : null, gen: L.parent ? (L.parent.gen || 1) + 1 : 1,
    story: C.careerStory ? C.careerStory(L) : null,
    ids: f.ending ? { tier: f.ending.tier, outs: f.ending.outcomes || [], secret: f.ending.secret || null,
      routes: C.routesOf ? C.routesOf(L) : [], origin: L.origin || null } : null,
    lg: C.leagueEnd && C.storyOn(L) ? trimLeague(C.leagueEnd(L)) : null,
    diff: L.opt && L.opt.diff ? L.opt.diff : null,
    ch: C.challengeOf && C.challengeOf(L) ? { id: L.challenge, met: C.challengeOf(L).met } : null };
  var easy = card.diff === 'easy';
  /* The badges, through the page's one feat writer, so a Career badge is
     kept on the account the way every other mode's is. */
  var BD = window.RTF_BADGES;
  /* AN EASY CAREER IS FOR THE STORY: no badges and no board. It is still
     kept in the Vault, which records what happened rather than ranks it. */
  if (!easy && BD && BD.careerFeats && C.featSummary && P.feats && L.history.length) P.feats(BD.careerFeats(C.featSummary(L)));
  var sum = C.boardSummary && !easy ? C.boardSummary(L) : null;
  st.hof.unshift(card);
  if (st.hof.length > 20) st.hof.length = 20;
  st.arc = (st.arc || []).filter(function(a){ return a.id !== card.id; });
  st.arc.unshift(compact(card));
  if (st.arc.length > ARC_MAX) st.arc.length = ARC_MAX;
  card.found = vaultAdd(st, card);
  st.cur = null;
  st.last = card;
  save();
  render();
  window.scrollTo(0, 0);
  if (sum) fileCareer(card, sum);
  else if (!easy && L.flags && L.flags.banned && L.history.length) { card.board = { banned: true }; save(); paintPlace(card); }
  ceremony(L, card);
}
/* The career ends on a stage: the Hall of Fame for a Hall of Famer, the
   press room for everybody else. Told, never asked: there is nothing left
   to decide. */
function ceremony(L, card){
  var SC = window.RTF_SCENES;
  if (!SC || !SC.on() || !L.history.length) return;
  try {
    var b = SC.build(L, null, null);
    var hof = card.score >= 55;
    b.ctx.from = card.from; b.ctx.to = card.to; b.ctx.verdict = card.verdict; b.ctx.blurb = card.blurb;
    var beats = hof ? SC.SCENES.hall.map(function(x){
      var o = {}; for (var k in x) o[k] = x[k];
      o.tx = typeof x.tx === 'function' ? x.tx(b.ctx) : x.tx; return o;
    }) : [{ who: 'hollis', room: 'studio', pic: 'me', pose: 'suit', tx: card.verdict + '. ' + card.blurb }];
    SC.play(beats, b.ctx, {});
  } catch (e) {}
}

/* ─── the Career board ──────────────────────────────────────────────────────
   A career that reached the league is filed once, when it ends
   (supabase/130_hoops_careers.sql). The board is optional like everywhere in
   this game: every call fails soft to null and the Hall card never waits for
   it. The row's id is kept ON THE CARD, which rides in the life slot, so it
   is on the account and a guest's careers can be claimed on sign in. */
function BB(){ return P.board ? P.board() : null; }
function signedIn(){ var a = P.auth && P.auth(); return !!(a && a.state && a.state().signedIn); }
function fileCareer(card, sum){
  var B = BB();
  if (!B || !B.submitCareer) return;
  var guest = !signedIn();
  B.submitCareer(sum).then(function(id){
    if (!id) {
      card.board = { off: true, migration: !!B.needsMigration };
      save(); paintPlace(card);
      return;
    }
    card.board = { id: id, guest: guest };
    save(); paintPlace(card);
  });
}
/* Where the career sits, asked fresh every time the card is drawn, because
   the field keeps growing after it was filed. */
function paintPlace(card){
  var el = $('cr-place');
  if (!el || store().last !== card) return;
  var b = card.board;
  if (!b) { el.hidden = true; return; }
  if (b.banned) { el.hidden = false; el.innerHTML = '<span>Banned for life. Not on the Career board.</span>'; return; }
  if (b.off) {
    el.hidden = false;
    el.innerHTML = '<span>' + (b.migration ? 'The Career board is not set up on this site yet.' : 'Career board not reachable right now. This career still counts here.') + '</span>';
    return;
  }
  var B = BB();
  el.hidden = false;
  el.innerHTML = '<span>On the Career board.</span><button class="k-btn k-sec" id="cr-board">See the board</button>';
  wireBoardBtn();
  if (!B || !B.careerPlace) return;
  B.careerPlace(card.score).then(function(pl){
    if (!pl || store().last !== card || !$('cr-place')) return;
    var total = Math.max(pl.total, pl.place);
    el.innerHTML = '<span><b>' + ordinal(pl.place) + '</b> of ' + total.toLocaleString('en-US') + (total === 1 ? ' career' : ' careers')
      + (b.guest && !signedIn() ? '. On the board as Guest. Sign in to put your name on it.' : '.') + '</span>'
      + '<button class="k-btn k-sec" id="cr-board">See the board</button>';
    wireBoardBtn();
  });
}
function wireBoardBtn(){
  var b = $('cr-board');
  if (b) b.onclick = function(){ if (P.openBoard) P.openBoard({ door: 'career' }); };
}
function ordinal(n){
  var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
/* Every career this browser or this account filed, for the board's own
   marking of your rows. */
function boardIds(){
  var st = store(), ids = {};
  (st.hof || []).concat(st.last ? [st.last] : []).forEach(function(c){ if (c && c.board && c.board.id) ids[c.board.id] = 1; });
  return ids;
}
/* A career finished signed out, taken over on the way in. */
function claimGuests(){
  if (!signedIn()) return;
  var B = BB(), st = store(), any = false;
  if (!B || !B.claimCareer) return;
  (st.hof || []).concat(st.last ? [st.last] : []).forEach(function(c){
    if (!c || !c.board || !c.board.id || !c.board.guest) return;
    c.board.guest = false;
    any = true;
    B.claimCareer(c.board.id);
  });
  if (any) save();
}

function finalView(card){
  var T = card.totals;
  var gp = Math.max(1, T.gp);
  var hof = card.score >= 55;
  var aw = card.awards && card.awards.length ? '<div class="cr-aw">' + awardTags(card.awards) + '</div>' : '';
  var hist = { history: card.history || [], amHist: card.amHist || [] };
  var B = window.RTF_BALLER;
  return '<div class="cr-top"><div class="cr-topl"><h2 class="k-h1">Career over</h2><div class="cr-hud"><b>' + card.from + '-' + card.to + '</b><span>' + esc(card.name) + '</span></div></div><div class="cr-topbtns">' + ib('cr-vault2', 'vault', 'Vault') + ib('cr-home', 'home', 'Home', { cls: 'cr-home', attr: 'aria-label="Home"' }) + '</div></div>'
    + (card.parent ? '<p class="cr-gen">' + K.iconHtml('tree', 2) + ' Generation ' + (card.gen || 2) + '</p>' : '')
    + '<div class="k-panel ' + (hof ? 'k-gold' : 'k-team') + ' cr-final">'
    + '<div class="cr-hset">' + setArt('nba', hof ? '#a8761c' : card.c1, hof ? '#ffd166' : card.c2, 'hall' + card.name) + '</div><div class="cr-rays" aria-hidden="true"></div><div class="cr-hin">'
    + (B && card.look ? B.img(card.look, { c1: card.c1, c2: card.c2, num: card.num, age: card.age, pose: card.totals && card.totals.rings ? 'trophy' : 'suit', scale: 3 }) : '')
    + '<div class="eye">' + (hof ? 'The Hall of Fame' : 'The verdict') + '</div><div class="v">' + esc(card.verdict) + '</div>'
    + '<div class="nm"><span>' + esc(card.name) + ' · #' + esc(String(card.num)) + ' · ' + card.from + '-' + card.to + '</span></div>'
    + '<p>' + esc(card.blurb) + '</p>'
    + (card.nick ? '<p class="cr-col">They called you ' + esc(card.nick) + '.</p>' : '')
    + (card.persona && card.persona !== 'Still writing it' ? '<p class="cr-col">The league knew you as: ' + esc(card.persona) + '.</p>' : '')
    + (card.college ? '<p class="cr-col">' + esc(card.college) + '</p>' : '')
    + (card.jersey ? '<p class="cr-col">Your #' + esc(String(card.num)) + ' hangs in the rafters for the ' + esc(E.TEAM_NAMES[card.jersey] || card.jersey) + '.</p>' : '')
    + totalsHtml(T, '<div><b>' + (T.pts / gp).toFixed(1) + '</b><span>A game</span></div><div><b>' + T.seasons + '</b><span>' + (T.seasons === 1 ? 'Season' : 'Seasons') + '</span></div>')
    + aw + '</div></div>'
    + '<div class="cr-btnrow"><button class="k-btn" id="cr-share">Share it</button><button class="k-btn k-sec" id="cr-again">New career</button></div>'
    + (canFather(card) ? '<button class="k-btn k-sec k-block cr-sonbtn" id="cr-son" type="button">' + K.iconHtml('tree', 2) + ' Play as your son' + (proOpen() ? '' : ' <span class="k-tag k-gold cr-pro">Pro</span>') + '</button>' : '')
    + (card.after || card.rival || card.life || card.ending ? '<div class="k-panel cr-sec cr-epi">'
      + (card.ending && card.ending.secretName ? '<p class="cr-secret"><span class="k">A secret ending</span>' + esc(card.ending.secretName) + '</p>' : '')
      + (card.ending ? '<p><span class="k">The Hall</span>' + esc(card.ending.tierName) + '</p>' : '')
      + (card.ending && card.ending.names.length ? '<p><span class="k">Remembered as</span>' + esc(card.ending.names.join(' · ')) + '</p>' : '')
      + (card.origin || (card.ending && card.ending.routes.length) ? '<p><span class="k">The road</span>' + esc([card.origin].concat(card.ending ? card.ending.routes : []).filter(Boolean).join(' · ')) + '</p>' : '')
      + (card.epilogue ? '<p><span class="k">Years later</span>' + esc(card.epilogue) + '</p>'
        : card.after ? '<p><span class="k">After basketball</span>' + esc(card.after) + '</p>' : '')
      + (card.rival ? '<p><span class="k">Your rival</span>' + esc(card.rival.name) + ': ' + card.rival.pts.toLocaleString('en-US') + ' points, '
        + card.rival.star + 'x All-Star, ' + card.rival.rings + (card.rival.rings === 1 ? ' ring.' : ' rings.')
        + (card.totals.pts > card.rival.pts ? ' You had the better career.' : ' He had the better career.') + '</p>' : '')
      + (card.life ? '<p><span class="k">Off the floor</span>' + esc(card.life) + '.</p>' : '')
      + (card.traits && (card.traits.length || card.sig) ? '<p><span class="k">Known for</span>' + esc(card.traits.concat(card.sig ? [card.sig] : []).join(' · ')) + '.</p>' : '')
      + (card.moments && card.moments.length ? '<p><span class="k">Moments</span></p><ul class="cr-list">' + card.moments.map(function(m){ return '<li><span class="yr">' + m.y + '</span>' + esc(m.t) + '</li>'; }).join('') + '</ul>' : '')
      + '</div>' : '')
    + '<div class="k-panel k-tight cr-place" id="cr-place" hidden></div>'
    + (card.ch && C.CHALLENGES && C.CHALLENGES[card.ch.id] ? '<div class="k-panel k-tight ' + (card.ch.met ? 'k-gold' : '') + ' cr-chres"><div class="k-eyebrow">' + K.iconHtml(card.ch.met ? 'check' : 'lock', 2) + 'Challenge · ' + esc(C.CHALLENGES[card.ch.id].name) + '</div><p>' + (card.ch.met ? 'Met. It is in the Vault.' : 'Not met. ' + esc(C.CHALLENGES[card.ch.id].blurb)) + '</p></div>' : '')
    + (card.diff === 'easy' ? '<p class="k-small cr-easy">Played on Easy. Not on the Career board and no badges.</p>' : '')
    + foundHtml(card)
    + storyHtml(card.story)
    + '<details class="k-panel cr-sec k-fold"><summary class="k-eyebrow">' + K.iconHtml('up', 2) + 'Season by season<span class="k-foldn">' + T.seasons + '</span></summary>' + seasonsTable(hist) + '</details>';
}
function shareText(card){
  var T = card.totals;
  var bits = [card.name + ': ' + card.verdict + '.', T.pts.toLocaleString() + ' points over ' + T.seasons + ' seasons.'];
  if (T.rings) bits.push(T.rings + (T.rings === 1 ? ' ring.' : ' rings.'));
  if (T.mvp) bits.push(T.mvp + 'x MVP.');
  if (T.star) bits.push(T.star + 'x All-Star.');
  if (card.college) bits.push(card.college + '.');
  return 'Run The Floor · Career\n' + bits.join(' ') + '\nLive your own NBA life: ' + P.SHARE_URL;
}
/* THE SHARE CARD (Phase E): the Hall card as a trading card, 540 by 756, in
   the kit's colours with the player drawn at a whole-number scale. Only what
   the card already says is on it. */
function drawCard(card){
  var B = window.RTF_BALLER, T = card.totals || {};
  var W = 540, H = 756, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  var x = cv.getContext('2d');
  var hof = card.ending ? HOF_IN[card.ending.tier] : card.score >= 55;
  var edge = hof ? '#ffd166' : (card.c2 || '#c9ccd6');
  x.fillStyle = '#0a0d18'; x.fillRect(0, 0, W, H);
  x.fillStyle = edge; x.fillRect(12, 12, W - 24, H - 24);
  x.fillStyle = '#111629'; x.fillRect(20, 20, W - 40, H - 40);
  var g = x.createLinearGradient(0, 20, 0, 420);
  g.addColorStop(0, card.c1 || '#2b3242'); g.addColorStop(1, '#111629');
  x.fillStyle = g; x.fillRect(20, 20, W - 40, 400);
  x.fillStyle = 'rgba(5,7,13,.35)';
  for (var i = 0; i < 30; i++) x.fillRect(20, 20 + i * 14, W - 40, 6);
  x.textAlign = 'center';
  x.fillStyle = '#ffd166'; x.font = '14px "Press Start 2P", monospace';
  x.fillText('RUN THE FLOOR · CAREER', W / 2, 54);
  if (B && card.look) {
    var fig = B.canvas(card.look, { c1: card.c1, c2: card.c2, num: card.num, age: card.age, pose: T.rings ? 'trophy' : 'suit', scale: 5 });
    x.imageSmoothingEnabled = false;
    x.drawImage(fig, (W - fig.width) / 2, 82);
  }
  var fit = function(t, max, size, face){ var n = size; do { x.font = n + 'px ' + face; n -= 2; } while (x.measureText(t).width > max && n > 12); };
  x.fillStyle = '#eef2f9';
  fit(String(card.name).toUpperCase(), W - 80, 52, '"Anton", Impact, sans-serif');
  x.fillText(String(card.name).toUpperCase(), W / 2, 466);
  x.fillStyle = '#b8c3e6'; x.font = '600 18px "Archivo", system-ui, sans-serif';
  x.fillText('#' + card.num + ' · ' + card.pos + ' · ' + card.from + '-' + card.to + (card.gen > 1 ? ' · Generation ' + card.gen : ''), W / 2, 496);
  x.fillStyle = hof ? '#ffd166' : '#ff7a1a';
  fit(String(card.verdict).toUpperCase(), W - 80, 34, '"Anton", Impact, sans-serif');
  x.fillText(String(card.verdict).toUpperCase(), W / 2, 540);
  var cells = [[(T.pts || 0).toLocaleString('en-US'), 'Points'], [String(T.rings || 0), 'Rings'], [String(T.star || 0), 'All-Star'], [String(T.mvp || 0), 'MVP']];
  var cw = (W - 80) / 4;
  cells.forEach(function(c, k){
    var cx = 40 + cw * k;
    x.fillStyle = '#18203a'; x.fillRect(cx + 4, 566, cw - 8, 86);
    x.fillStyle = '#eef2f9'; x.font = '18px "Press Start 2P", monospace';
    fit(c[0], cw - 20, 18, '"Press Start 2P", monospace');
    x.fillText(c[0], cx + cw / 2, 608);
    x.fillStyle = '#8fa0d6'; x.font = '800 13px "Archivo", system-ui, sans-serif';
    x.fillText(c[1].toUpperCase(), cx + cw / 2, 636);
  });
  var foot = card.ending ? card.ending.tierName + (card.ending.secretName ? ' · ' + card.ending.secretName : '') : '';
  if (foot) { x.fillStyle = '#b8c3e6'; fit(foot, W - 80, 18, '600 18px "Archivo", system-ui, sans-serif'); x.fillText(foot, W / 2, 684); }
  x.fillStyle = '#8fa0d6'; x.font = '12px "Press Start 2P", monospace';
  x.fillText(String(P.SHARE_URL || 'runthe.gg/hoops').replace(/^https?:\/\//, '').replace(/\/$/, ''), W / 2, 718);
  return cv;
}
function shareCard(card){
  var text = shareText(card);
  var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  ready.then(function(){
    var cv = null;
    try { cv = drawCard(card); } catch (e) { if (window.console) console.error('career card failed to draw', e); }
    if (!cv || !cv.toBlob || !P.shareImage) { P.shareText(text); return; }
    cv.toBlob(function(blob){ P.shareImage(text, blob); }, 'image/png');
  });
}
function wireFinal(card){
  $('cr-home').onclick = goHome;
  var sb = $('cr-son'); if (sb) sb.onclick = function(){ startSon(card); };
  $('cr-vault2').onclick = openVault;
  $('cr-again').onclick = function(){ store().last = null; save(); form = null; K.wipe(); render(); window.scrollTo(0, 0); };
  $('cr-share').onclick = function(){ shareCard(card); };
  paintPlace(card);
}


// ─── the Vault (Phase E) ────────────────────────────────────────────────────

/* The written story, one heading a chapter. */
function storyHtml(story){
  if (!story || !story.length) return '';
  return '<details class="k-panel cr-sec cr-story k-fold"><summary class="k-eyebrow">' + K.iconHtml('clip', 2) + 'Your story<span class="k-foldn">' + story.length + ' chapters</span></summary>'
    + story.map(function(x){ return '<h3 class="cr-sub">' + esc(x.h) + '</h3><p>' + esc(x.p) + '</p>'; }).join('') + '</details>';
}
/* What this career put in the Vault for the first time. */
function foundHtml(card){
  var f = card.found;
  if (!f || !f.length) return '';
  return '<div class="k-panel k-tight k-gold cr-found"><div class="k-eyebrow">' + K.iconHtml('vault', 2) + 'New in the Vault</div><div class="cr-aw cr-awrow">'
    + f.map(function(k){ return '<span class="k-tag k-gold">' + esc(vaultName(k)) + '</span>'; }).join('') + '</div></div>';
}
function vaultName(k){
  var t = k.slice(0, 1), id = k.slice(2);
  if (t === 't') return (C.HOF_TIERS || {})[id] || id;
  if (t === 'o') return (C.OUTCOMES || {})[id] || id;
  if (t === 's') return (C.SECRETS || {})[id] || id;
  if (t === 'r') return ((C.ROUTES || {})[id] || [id])[0];
  if (t === 'g') return ((C.ORIGINS || {})[id] || { name: id }).name;
  if (t === 'c') return ((C.CHALLENGES || {})[id] || { name: id }).name;
  return id;
}
/* The shelves, in the order a career meets them. */
function vaultShelves(){
  var sh = [
    { k: 'g', name: 'Where you came from', ids: C.ORIGIN_KEYS || [] },
    { k: 'r', name: 'The road', ids: Object.keys(C.ROUTES || {}) },
    { k: 't', name: 'The Hall', ids: Object.keys(C.HOF_TIERS || {}) },
    { k: 'o', name: 'Remembered as', ids: Object.keys(C.OUTCOMES || {}) },
    { k: 's', name: 'Secret endings', ids: Object.keys(C.SECRETS || {}), secret: true },
  ];
  if (C.CHALLENGE_KEYS) sh.push({ k: 'c', name: 'Challenges', ids: C.CHALLENGE_KEYS });
  return sh;
}
function vaultCount(st){
  var have = 0, all = 0;
  vaultShelves().forEach(function(s){ s.ids.forEach(function(id){ all++; if (st.vault[s.k + ':' + id]) have++; }); });
  return { have: have, all: all };
}
var view = null, vtab = 'endings', vopen = null;
function openVault(){ view = 'vault'; vopen = null; closeOff(); render(); window.scrollTo(0, 0); }
function vaultView(){
  var st = store(), n = vaultCount(st);
  var t = function(id, name){ var on = vtab === id; return '<button class="k-tab" role="tab" aria-selected="' + on + '" data-vtab="' + id + '">' + name + '</button>'; };
  var body = vtab === 'careers' ? careersHtml(st) : vtab === 'family' ? familyHtml(st) : endingsHtml(st);
  return '<div class="cr-top"><div class="cr-topl"><h2 class="k-h1">The Vault</h2><div class="cr-hud"><b>' + Math.round(100 * n.have / Math.max(1, n.all)) + '% found</b><span>Every ending you have reached</span></div></div><div class="cr-topbtns">' + ib('cr-vback', 'back', 'Back', { cls: 'cr-back' }) + ib('cr-home', 'home', 'Home', { attr: 'aria-label="Home"' }) + '</div></div>'
    + '<div class="k-panel k-tight cr-vsum"><span class="k-num">' + n.have + '</span><span>of ' + n.all + ' found</span>'
    + '<span class="cr-vbar" aria-hidden="true"><i style="width:' + Math.round(100 * n.have / Math.max(1, n.all)) + '%"></i></span>'
    + '<span class="k-small">' + st.arc.length + (st.arc.length === 1 ? ' career played' : ' careers played') + '</span></div>'
    + '<div class="k-panel cr-sec"><div class="k-tabs cr-tabs" role="tablist">' + t('endings', 'Endings') + t('careers', 'Careers') + t('family', 'Family') + '</div>'
    + '<div role="tabpanel">' + body + '</div></div>';
}
function endingsHtml(st){
  return vaultShelves().map(function(sh){
    var have = sh.ids.filter(function(id){ return st.vault[sh.k + ':' + id]; }).length;
    /* A shelf is a fold with its own bar: open while it has something on it
       or is short, so the first look is what you found, not a wall of locks. */
    var open = have > 0 || (sh.ids.length <= 10 && !sh.secret);
    /* What you found comes first on its shelf. */
    var ids = sh.ids.filter(function(id){ return st.vault[sh.k + ':' + id]; }).concat(sh.ids.filter(function(id){ return !st.vault[sh.k + ':' + id]; }));
    return '<details class="cr-shelf"' + (open ? ' open' : '') + '><summary><span class="cr-shn">' + esc(sh.name) + '</span><span class="cr-shc">' + have + ' / ' + sh.ids.length + '</span>'
      + '<span class="cr-vbar cr-shbar" aria-hidden="true"><i style="width:' + Math.round(100 * have / Math.max(1, sh.ids.length)) + '%"></i></span></summary><ul class="cr-vgrid">' + ids.map(function(id){
      var got = !!st.vault[sh.k + ':' + id], nm = vaultName(sh.k + ':' + id);
      return '<li class="' + (got ? 'got' : 'no') + '">' + K.iconHtml(got ? (sh.k === 's' ? 'star' : 'check') : 'lock', 1)
        + '<span>' + (got || !sh.secret ? esc(nm) : 'Secret') + '</span>' + (got ? '' : '<span class="sr-only"> (not found yet)</span>') + '</li>';
    }).join('') + '</ul></details>';
  }).join('');
}
function fullCard(id){ var h = store().hof || []; for (var i = 0; i < h.length; i++) if (cardId(h[i]) === id) return h[i]; return null; }
function arcEntry(id){ var a = store().arc || []; for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }
function careersHtml(st){
  if (!st.arc.length) return '<p class="k-small">No finished careers yet. Every one you play ends up here.</p>';
  if (vopen) {
    var a = arcEntry(vopen);
    if (a) {
      var c = fullCard(a.id);
      return '<button class="k-btn k-quiet" id="cr-vlist" type="button">All careers</button>' + entryHtml(a, true)
        + (canFather(a) ? '<button class="k-btn k-sec k-block cr-sonbtn" data-son="' + esc(a.id) + '" type="button">' + K.iconHtml('tree', 2) + ' Play as his son' + (proOpen() ? '' : ' <span class="k-tag k-gold cr-pro">Pro</span>') + '</button>' : '')
        + (c && c.story ? storyHtml(c.story) : '<p class="k-small">The full story is kept for your last twenty careers.</p>');
    }
  }
  return '<ul class="cr-arc">' + st.arc.map(function(a){ return '<li>' + entryHtml(a, false) + '</li>'; }).join('') + '</ul>';
}
function entryHtml(a, big){
  var B = window.RTF_BALLER;
  var pic = B && a.look ? B.img(a.look, { c1: a.c1, c2: a.c2, num: a.num, age: a.age, pose: a.rings ? 'trophy' : 'suit', scale: big ? 2 : 1, still: true }) : '';
  var inner = '<span class="cr-apic">' + pic + '</span><span class="cr-awho"><b>' + esc(a.name) + '</b>'
    + '<small>' + a.from + '-' + a.to + ' · ' + a.pts.toLocaleString('en-US') + ' pts' + (a.rings ? ' · ' + a.rings + (a.rings === 1 ? ' ring' : ' rings') : '') + '</small>'
    + '<small>' + esc(a.verdict) + (a.gen > 1 ? ' · Generation ' + a.gen : '') + '</small></span>';
  return big ? '<div class="cr-aentry big">' + inner + '</div>' : '<button class="cr-aentry" type="button" data-arc="' + esc(a.id) + '">' + inner + '</button>';
}
/* THE FAMILY TREE is Run The Floor Pro's. A family is every career linked by
   `parent`, drawn from the oldest down; a career with no son yet is a tree of
   one and is not drawn, because a tree of one is the careers list. */
function familyHtml(st){
  if (!proOpen()) {
    return '<div class="cr-lockbox">' + K.iconHtml('lock', 3) + '<p><b>The family tree is Pro.</b> When a career ends, play as his son. He starts years later, in the league his father left, with his father\'s points to chase.</p>'
      + '<button class="k-btn" id="cr-fampro" type="button">Get Run The Floor Pro</button></div>';
  }
  var by = {}, ids = {};
  st.arc.forEach(function(a){ ids[a.id] = a; });
  st.arc.forEach(function(a){ if (a.parent && ids[a.parent]) (by[a.parent] = by[a.parent] || []).push(a); });
  var roots = st.arc.filter(function(a){ return (!a.parent || !ids[a.parent]) && by[a.id]; });
  if (!roots.length) return '<p class="k-small">No families yet. Finish a career, then press Play as your son.</p>';
  var node = function(a){
    var kids = (by[a.id] || []).slice().sort(function(x, y){ return x.from - y.from; });
    return '<li>' + entryHtml(a, false) + (kids.length ? '<ul>' + kids.map(node).join('') + '</ul>' : '') + '</li>';
  };
  return roots.map(function(r){ return '<ul class="cr-tree">' + node(r) + '</ul>'; }).join('');
}
function wireVault(){
  var root = $('s-car');
  $('cr-home').onclick = goHome;
  $('cr-vback').onclick = function(){ view = null; render(); window.scrollTo(0, 0); };
  root.querySelectorAll('[data-vtab]').forEach(function(b){ b.onclick = function(){ vtab = b.getAttribute('data-vtab'); vopen = null; render(); var t = root.querySelector('[data-vtab="' + vtab + '"]'); if (t) t.focus(); }; });
  root.querySelectorAll('[data-arc]').forEach(function(b){ b.onclick = function(){ vtab = 'careers'; vopen = b.getAttribute('data-arc'); render(); window.scrollTo(0, 0); }; });
  root.querySelectorAll('[data-son]').forEach(function(b){ b.onclick = function(){ var id = b.getAttribute('data-son'); startSon(fullCard(id) || arcEntry(id)); }; });
  var l = $('cr-vlist'); if (l) l.onclick = function(){ vopen = null; render(); };
  var fp = $('cr-fampro'); if (fp) fp.onclick = function(){ askPro('family'); };
}
/* Play as his son: the builder, with the father on it. Pro, asked first. A
   full Hall card carries the league he left; an older entry starts the son
   in a league played forward from the data's own year. */
/* A son is the son of a former pro, so his father has to have played, and
   he has to have had a son. A card filed before sons were counted reads its
   life line, which names the kids; without kids there is no son. */
function sonsIn(c){
  if (!c) return 0;
  if (typeof c.sons === 'number') return c.sons;
  var m = /(\d+) (?:son|kid)/.exec(c.life || '');
  return m ? +m[1] : 0;
}
function canFather(c){ return !!c && ((c.totals ? c.totals.seasons : c.seasons) || 0) > 0 && sonsIn(c) > 0; }
function startSon(c){
  if (!canFather(c)) return;
  if (!proOpen()) { askPro('family'); return; }
  var a = c.totals ? compact(c) : c;
  var seed = String(Math.floor(Math.random() * 1e9));
  var B = window.RTF_BALLER;
  var look = B ? B.lookFor(seed) : {};
  if (a.look) { look.skin = a.look.skin; look.hc = a.look.hc; }
  var last = String(a.name).trim().split(/\s+/).slice(-1)[0];
  form = { seed: seed, name: C.randomName(seed).split(' ')[0] + ' ' + last, num: Math.floor(Math.random() * 100), pos: a.pos || 'SF', arch: C.archesFor(a.pos || 'SF')[0], bg: 'oad', ht: C.POS_SIZE[a.pos || 'SF'].mid, wt: C.wtFor(C.POS_SIZE[a.pos || 'SF'].mid),
    start: 'hs', origin: '', legend: true, look: look,
    parent: { id: a.id, name: a.name, num: a.num, pos: a.pos, pts: a.pts, seasons: a.seasons, score: a.score, verdict: a.verdict,
      rings: a.rings, star: a.star, hof: a.hof, clubs: a.teams || [], jersey: a.jersey, gen: a.gen || 1, end: a.to, age: a.age },
    parentLeague: c.lg || null };
  var st = store();
  st.last = null;
  save();
  view = null;
  K.wipe();
  render();
  window.scrollTo(0, 0);
}

// ─── the screen ─────────────────────────────────────────────────────────────

var lastTeam = null;
function render(){
  var root = $('s-car');
  if (!root) return;
  var st = store();
  if (!root.querySelector('#cr-body')) {
    root.classList.add('k-root');
    root.innerHTML = '<div id="cr-body"></div><div class="k-scrim" id="cr-sheet" hidden><div class="k-sheet in"></div></div>';
  }
  var body = $('cr-body');
  /* A career saved before rosters rode on the life gets the real ones now,
     as long as it was opened on the same season of data. */
  var lg = league();
  if (st.cur && st.cur.league && !st.cur.league.roster && lg && lg.roster && st.cur.league.latest === lg.latest) {
    st.cur.league.roster = lg.roster;
    if (lg.rs) st.cur.league.rs = lg.rs;
  }
  /* The screen wears the club's colours, and a move to a new one is a wipe
     in the new colours rather than a silent repaint. */
  var col = st.cur ? C.colorsOf(st.cur) : st.last ? { primary: st.last.c1, secondary: st.last.c2 } : null;
  K.theme(root, col ? col.primary : null, col ? col.secondary : null);
  var team = st.cur ? st.cur.team : null;
  if (st.cur && lastTeam && team && team !== lastTeam) { K.wipe(); K.toast(K.iconHtml('home', 2) + '<span>Welcome to the ' + esc(teamName(team)) + '.</span>', 'k-gold'); }
  lastTeam = team;
  if (view === 'vault') { body.innerHTML = vaultView(); wireVault(); }
  else if (st.cur) {
    var d = stage.delta || null;
    stage.delta = null;
    body.innerHTML = lifeView(st.cur, d);
    wireLife(st.cur, d);
  }
  else if (st.last) { body.innerHTML = finalView(st.last); wireFinal(st.last); }
  else { body.innerHTML = buildView(); wireBuild(); }
  /* The chip in the top bar says who you are mid-career and nothing otherwise:
     it sits beside the Career button, and a second "Career" there reads as
     the same button twice. */
  if (P.bar) P.bar(st.cur ? st.cur.name.split(' ').slice(-1)[0] + ' · ' + C.show(C.ovrOf(st.cur)) : '');
}
function open(){
  if (!league()) { P.toast('The league is still loading.'); return; }
  S = null;
  view = null;
  stage = { beats: [], result: null, draft: null };
  lastTeam = null;
  P.show('s-car');
  render();
}
function goHome(){ closeOff(); P.goHome(); }

// ─── the front page ─────────────────────────────────────────────────────────

/* The hero card is static markup in index.html, so the dock can find its
   button at boot. This fills it in: a career in progress says who and where,
   none says what the mode is. */
function renderHero(){
  var st = store(), L = st.cur;
  var cur = $('ch-cur'), say = $('ch-say'), go = $('b-career'), best = $('ch-best'), path = $('ch-path');
  if (!go) return;
  /* The door stands in the same pixel arena the mode is played in, in the
     colours of the career in progress (or the league's orange). */
  var hero = $('career');
  if (hero) {
    var hk = L ? C.colorsOf(L) : { primary: '#ff7a1a', secondary: '#ffd166' };
    var art = K.room(L ? stageKind(L) : 'nba', 132, 80, { c1: hk.primary, c2: hk.secondary, spotAt: 0.6, seed: 'hero' });
    var set = hero.querySelector('.ch-set');
    if (!set) { set = document.createElement('div'); set.className = 'ch-set'; set.setAttribute('aria-hidden', 'true'); hero.insertBefore(set, hero.firstChild); }
    if (set.getAttribute('data-src') !== art.url) { set.innerHTML = '<img src="' + art.url + '" alt="" draggable="false">'; set.setAttribute('data-src', art.url); }
  }
  if (L && !L.retired) {
    var k = C.colorsOf(L);
    var v = C.view(L);
    var rv = C.roadView(L);
    var where = rv ? rv.what + (rv.level === 'High school' ? ' at ' + rv.where : '') : L.team ? teamName(L.team) : 'Draft prospect';
    var when = L.season ? seasonTag(L.season.year) + ' · ' + L.season.w + '-' + L.season.l : (L.year ? 'Summer of ' + (L.year - 1) : '');
    cur.innerHTML = portrait(L, { pose: 'ball', scale: 2 }) + '<div><b>' + esc(L.name) + '</b><span>' + esc(where) + '</span><span>Age ' + L.age + ' · ' + esc(when) + '</span></div>'
      + '<div class="o"><b>' + C.show(v.ovr) + '</b><span>OVR</span></div>';
    cur.style.setProperty('--c1', k.primary);
    cur.hidden = false;
    if (say) say.hidden = true;
    if (path) path.hidden = true;
    go.textContent = 'Continue your career';
  } else {
    cur.hidden = true;
    if (say) say.hidden = false;
    if (path) path.hidden = false;
    go.textContent = 'Start your career';
  }
  var top = st.hof.slice().sort(function(a, b){ return b.score - a.score; })[0];
  if (best) {
    best.hidden = !top;
    if (top) best.innerHTML = 'Your best: <b>' + esc(top.name) + '</b>, ' + esc(top.verdict) + '. ' + st.hof.length + (st.hof.length === 1 ? ' career' : ' careers') + ' played.';
  }
  go.disabled = !league();
  go.onclick = open;
  /* The card answers a press anywhere on it, the way the puzzle cards do. The
     button stays the one focusable control, so a keyboard and a screen reader
     meet a single door rather than a button nested in a button. */
  if (hero) {
    hero.classList.toggle('live', !go.disabled);
    var chip = $('ch-chip');
    if (chip) chip.textContent = L && !L.retired ? 'Continue' : 'Play';
    hero.onclick = function(e){
      if (go.disabled || (e.target.closest && e.target.closest('button,a,input,select'))) return;
      open();
    };
  }
}

window.RTF_CAREER_UI = {
  open: open,
  renderHero: renderHero,
  reload: reload,
  /* For the page's dock and for check-career.mjs. */
  KEY: KEY,
  state: function(){ return store(); },
  /* check-career.mjs only: draw a given press's aftermath over the card on
     top and scroll the way a real press does, so the fold can be asked about
     the tallest receipt rather than whichever one a random career deals. */
  paintPress: function(st){ stage = st; render(); scrollStage(); },
  boardIds: boardIds,
  /* check-career.mjs only: the road the start button would play, which the
     builder deliberately never shows. */
  previewRoad: function(){ return form && form.start !== 'hs' && C.roadStory ? C.roadStory(preview()) : []; },
  openVault: function(){ open(); openVault(); },
  /* check-career.mjs only: the share card for the Hall card on screen. */
  drawCard: function(){ var l = store().last; return l ? drawCard(l) : null; },
  /* modes-ui.js calls this when Pro arrives or goes, so the builder redraws. */
  proChanged: function(){ if (onScreen() && !store().cur && !store().last) { if (form && form.start === 'hs' && !proOpen()) form.start = 'gen'; render(); } },
};

function boot(){
  var a = P.auth && P.auth();
  if (a && a.onChange && !boot.wired) { boot.wired = true; a.onChange(claimGuests); claimGuests(); }
  renderHero();
  if (!league()) { setTimeout(boot, 250); return; }
  renderHero();
}
boot();
})();
