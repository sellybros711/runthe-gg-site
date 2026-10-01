/* THE FANTASY CHALLENGE'S LOOK, shared by the NFL page and the college page.
 *
 * Both pages carry their own <style> block, which holds the layout every checker measures:
 * the row heights, the reveal, the sheets, the [hidden] pairs. This file is the layer over
 * it. It is the presentation the two competitions share, so a change made here lands on
 * both at once instead of being made twice and drifting.
 *
 * WHY A SCRIPT AND NOT A STYLESHEET. A stylesheet beside a page caches exactly like a
 * script and carries a hand-written version, and scripts/check-cachebust.mjs reads a
 * <script src> and not a <link>. So the CSS rides in here, where its ?v= is checked. It is
 * loaded synchronously in <head>, right after the page's own <style>, so it is in place
 * before the first paint and it wins on order at equal specificity.
 *
 * NOTHING HERE MAY MOVE A CONTROL. Every checker on these pages measures where a button
 * lands and whether the board steps when somebody signs a man. So this file paints:
 * colour, light, borders, type. Where it does change a size it makes a control SMALLER,
 * never taller, which is the safe direction for every on-screen assertion.
 *
 * The one piece of markup it owns is the crest, because three places draw it (the header,
 * the home hero and the doors on the two front pages, which inline their own copy). */
(function(){
  var css = [
    /* ---- the ground ----
       A stadium at night: one wash of light from above, and yard lines too faint to read
       as anything but a field. The lines are a repeating gradient on the body, so they
       cost nothing to draw and never move. */
    'body{background-image:',
    '  radial-gradient(1100px 520px at 50% -200px, rgba(240,201,107,.13), transparent 70%),',
    '  radial-gradient(700px 420px at 0% 30%, rgba(59,130,246,.08), transparent 70%),',
    '  radial-gradient(800px 500px at 100% 100%, rgba(239,68,68,.08), transparent 70%),',
    '  repeating-linear-gradient(180deg, transparent 0 139px, rgba(255,255,255,.022) 139px 140px)}',

    /* ---- the header ---- */
    '.top{padding:2px 0 4px}',
    '.mark{display:inline-flex;align-items:center;gap:9px;font-size:20px}',
    '.crest{flex:0 0 auto;width:30px;height:30px;filter:drop-shadow(0 4px 10px rgba(240,201,107,.25))}',
    '.top a{display:inline-flex;align-items:center;padding:7px 11px;border-radius:999px;',
    '  border:1px solid var(--line);background:rgba(255,255,255,.03);font-size:11px}',

    /* ---- cards ----
       A gold hairline across the top of every card, which is the prize's colour and the
       one thing every screen of this mode now shares. Positioned on a pseudo element so
       it adds no height. */
    '.card{position:relative;border-color:rgba(255,255,255,.09);',
    '  background:linear-gradient(180deg,#1a2440 0%,#121a2e 60%,#0e1526 100%)}',
    '.card:after{content:"";position:absolute;left:18px;right:18px;top:0;height:1px;',
    '  background:linear-gradient(90deg,transparent,rgba(240,201,107,.55),transparent);pointer-events:none}',
    '.eyebrow{color:#8ea0bb}',

    /* ---- buttons ----
       The primary keeps its red, because red is this mode's "you have not entered" on
       the front page door. It gains a lit edge and a sheen that crosses it on hover.
       The quiet ones were the same height as the button that matters and read as four
       equal choices: they are slimmer and darker now. */
    '.btn{border:1px solid rgba(255,255,255,.16);box-shadow:0 14px 30px -14px rgba(239,68,68,.65),',
    '  0 3px 10px -4px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.18)}',
    '.btn.blue{box-shadow:0 14px 30px -14px rgba(59,130,246,.65),0 3px 10px -4px rgba(0,0,0,.6),',
    '  inset 0 1px 0 rgba(255,255,255,.18)}',
    '.btn:after{content:"";position:absolute;top:0;bottom:0;left:-60%;width:40%;',
    '  background:linear-gradient(100deg,transparent,rgba(255,255,255,.22),transparent);',
    '  transform:skewX(-18deg);pointer-events:none;opacity:0}',
    '@media (hover:hover) and (prefers-reduced-motion:no-preference){',
    '  .btn:not(.quiet):not(:disabled):hover:after{opacity:1;animation:fcSheen .9s ease}}',
    '@keyframes fcSheen{from{left:-60%}to{left:130%}}',
    '.btn.quiet{padding:13px 16px;font-size:14px;background:rgba(255,255,255,.035);',
    '  border:1px solid rgba(255,255,255,.12);color:#b6c3d6;box-shadow:none}',
    '.btn.quiet:hover{border-color:rgba(255,255,255,.24);color:var(--ink)}',
    '.btn:disabled{filter:saturate(.4)}',

    /* ---- the home hero ---- */
    '.hero{overflow:hidden;padding:18px 16px 16px;',
    '  background:radial-gradient(360px 200px at 12% -60px, rgba(255,255,255,.12), transparent 70%),',
    '    radial-gradient(360px 200px at 88% -60px, rgba(255,255,255,.10), transparent 70%),',
    '    linear-gradient(180deg,#1d2a48 0%,#131c33 50%,#0d1426 100%)}',
    /* The trophy behind the title. Huge, faint and cut off by the card, so it reads as a
       watermark rather than as an icon competing with the heading. */
    '.hero-cup{position:absolute;right:-26px;top:-8px;width:170px;height:170px;opacity:.10;',
    '  pointer-events:none}',
    '.hero-cup .hc{display:block;width:100%;height:100%}',
    '.hero > :not(.hero-cup){position:relative}',
    '.hero-h{font-size:clamp(36px,11.5vw,52px);line-height:.92;margin-top:8px}',
    '.hero-h em{font-style:normal;color:var(--gold)}',
    '@supports ((-webkit-background-clip:text) or (background-clip:text)){',
    '  .hero-h em{background:linear-gradient(180deg,#fff2c9 0%,#f0c96b 55%,#c9902b 100%);',
    '    -webkit-background-clip:text;background-clip:text;color:transparent}}',
    /* SIX CHIPS, ONE A SLOT. The lineup the reader is about to build, drawn in the same
       colours every chip on the draft board wears, so the first screen teaches the shape. */
    '.rack{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px;margin:16px 0 2px}',
    '.rack span{display:flex;flex-direction:column;align-items:center;justify-content:center;',
    '  height:44px;border-radius:10px;font-family:var(--fn);font-size:12px;font-weight:800;',
    '  letter-spacing:.06em;color:#fff;border:1px solid rgba(255,255,255,.14);',
    '  box-shadow:inset 0 1px 0 rgba(255,255,255,.25),0 6px 14px -8px rgba(0,0,0,.8)}',
    '.rack span i{font-style:normal;font-size:8.5px;letter-spacing:.1em;opacity:.8;margin-top:1px}',
    '.rack .QB{background:linear-gradient(180deg,#ff3d62,#c4062c)}',
    '.rack .RB{background:linear-gradient(180deg,#3fd57a,#159646)}',
    '.rack .WR{background:linear-gradient(180deg,#3aa8ff,#0a6fd1)}',
    '.rack .TE{background:linear-gradient(180deg,#ffae2e,#c77a00)}',
    /* How a week goes, in three numbered steps. */
    '.steps{list-style:none;margin:16px 0 0;padding:0;display:flex;flex-direction:column;gap:10px}',
    '.steps li{display:flex;gap:11px;align-items:flex-start}',
    '.steps li > b{flex:0 0 26px;height:26px;border-radius:50%;display:grid;place-items:center;',
    '  font-family:var(--fd);font-weight:400;font-size:14px;color:#1a1204;',
    '  background:linear-gradient(180deg,#ffe7a8,#d9a13a);box-shadow:0 0 0 3px rgba(240,201,107,.14)}',
    '.steps li > span{font-size:14px;line-height:1.38;color:#aab8cc}',
    '.steps li > span strong{display:block;font-family:var(--fn);font-size:13px;font-weight:800;',
    '  letter-spacing:.06em;text-transform:uppercase;color:var(--ink)}',
    /* The facts as tiles rather than a rail: when it locks, what you have to spend, and
       how many of your five drafts are made. */
    '.tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:16px 0 4px}',
    '.tiles > div{padding:10px 10px 9px;border-radius:12px;background:rgba(6,10,20,.55);',
    '  border:1px solid rgba(255,255,255,.08);min-width:0}',
    '.tiles .eyebrow{font-size:9.5px;letter-spacing:.14em}',
    '.tiles b{display:block;margin-top:3px;font-family:var(--fd);font-weight:400;font-size:23px;',
    '  line-height:1;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;',
    '  text-overflow:ellipsis}',
    '.tiles .t-lock b{color:#fca5a5}',
    '.tiles .t-cap b{color:var(--gold)}',
    '.hero .stack{margin-top:16px}',
    /* The prize, said once and loudly, under the button. */
    '.prize{display:flex;align-items:center;gap:11px;margin-top:14px;padding:11px 13px;',
    '  border-radius:12px;border:1px solid rgba(240,201,107,.35);',
    '  background:linear-gradient(90deg,rgba(240,201,107,.14),rgba(240,201,107,.03))}',
    '.prize svg{flex:0 0 28px;width:28px;height:28px}',
    '.prize span{font-size:13.5px;line-height:1.35;color:#e9dcbb}',
    '.prize span b{color:var(--gold);font-weight:800}',

    /* ---- the draft ---- */
    '.rail{background:linear-gradient(180deg,rgba(26,35,58,.95),rgba(16,22,38,.95));',
    '  border-color:rgba(255,255,255,.09);position:relative;overflow:hidden}',
    /* WHAT IS LEFT OF THE CAP, as a bar under the money. Drawn by a transform so a signing
       costs the compositor and not a layout. */
    '.capbar{position:absolute;left:0;right:0;bottom:0;height:3px;background:rgba(255,255,255,.06)}',
    '.capbar i{position:absolute;inset:0;transform-origin:left;',
    '  background:linear-gradient(90deg,#f0c96b,#22c55e);transition:transform .32s cubic-bezier(.2,.9,.3,1)}',
    '.slot{position:relative;background:rgba(255,255,255,.025);border-color:rgba(255,255,255,.08);',
    '  border-top:2px solid var(--sc,rgba(255,255,255,.12))}',
    '.slot.sQB{--sc:var(--qb)} .slot.sRB{--sc:var(--rb)} .slot.sWR{--sc:var(--wr)} .slot.sTE{--sc:var(--te)}',
    '.slot.done{background:linear-gradient(180deg,rgba(34,197,94,.14),rgba(34,197,94,.05))}',
    '.slot.now{box-shadow:0 0 0 1px var(--gold),0 0 14px -4px rgba(240,201,107,.6)}',
    '.man{background:linear-gradient(180deg,#18213a,#121a2d);border-color:rgba(255,255,255,.08);',
    '  box-shadow:0 8px 18px -14px rgba(0,0,0,.9)}',
    '@media (hover:hover){.man:not(:disabled):not(.poor):not(.hurt):hover{border-color:rgba(240,201,107,.45)}}',
    '.pos{box-shadow:inset 0 1px 0 rgba(255,255,255,.25)}',
    '.cost b{color:#fff}',
    '.man.poor{background:transparent}',

    /* ---- the five, reviewed ---- */
    '.lineup{background:linear-gradient(180deg,#1a2440,#111a2e);border-color:rgba(255,255,255,.09);',
    '  box-shadow:0 10px 22px -16px rgba(0,0,0,.9);transition:border-color .15s ease,box-shadow .15s ease}',
    '.lineup .pj{color:var(--ink)}',
    '.lineup.pick{border-color:var(--gold);box-shadow:0 0 0 1px var(--gold) inset,',
    '  0 0 24px -8px rgba(240,201,107,.55)}',
    '.lineup.pick .hd b{color:var(--gold)}',
    '.lineup.pick .pj{color:var(--gold)}',

    /* ---- the entry ---- */
    '#s-in .big{background:linear-gradient(180deg,#fff,#c9d4e5);-webkit-background-clip:text;',
    '  background-clip:text;color:transparent;font-size:56px}',
    '#in-head{color:var(--ink)}',
    '#in-roster{padding:8px 10px;border-radius:12px;background:rgba(6,10,20,.45);',
    '  border:1px solid rgba(255,255,255,.07)}',
    '.roster .rrow{padding:3px 0}',
    '.rrow .rp{box-shadow:inset 0 1px 0 rgba(255,255,255,.25)}',

    /* ---- the live screen ----
       The tabs are one segmented control rather than three pills, and they hold one line
       each at 360, which the pills did not. */
    '.tabs{gap:4px;padding:4px;border-radius:999px;background:rgba(6,10,20,.6);',
    '  border:1px solid rgba(255,255,255,.08)}',
    '.tabs button{border:0;padding:9px 6px;font-size:10.5px;letter-spacing:.06em;white-space:nowrap}',
    '.tabs button.on{background:linear-gradient(180deg,#2a3a5e,#1d2944);color:#fff;',
    '  box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 4px 12px -6px rgba(0,0,0,.9)}',
    '.brow{background:rgba(255,255,255,.03)}',
    /* Silver and bronze beside the leader's green, once there are points to rank. */
    '.brow .bp.pl1{color:var(--gold)} .brow .bp.pl2{color:#d5dde8} .brow .bp.pl3{color:#e0a271}',
    '.brow.lead .bp.pl1{color:var(--green)}',
    '.erow{background:rgba(255,255,255,.03);padding:8px 9px;margin-bottom:3px}',
    '.brow.lead{background:linear-gradient(90deg,rgba(34,197,94,.20),rgba(34,197,94,.05))}',
    '.gm{background:linear-gradient(180deg,#18213a,#121a2d);border-color:rgba(255,255,255,.08)}',
    '.gm.live{box-shadow:0 0 0 1px rgba(239,68,68,.25),0 0 18px -8px rgba(239,68,68,.5)}',
    '.pwk button.on{background:linear-gradient(180deg,#f0c96b,#c9902b);border-color:transparent;',
    '  color:#1a1204;font-weight:700}',
    '.lastwk{background:linear-gradient(180deg,rgba(26,35,58,.9),rgba(16,22,38,.9));',
    '  border-color:rgba(255,255,255,.1)}',
    '.ibox{background:linear-gradient(180deg,#1b2641,#10182b);border-color:rgba(255,255,255,.12)}',

    '@media (prefers-reduced-motion:reduce){.capbar i{transition:none}}'
  ].join('\n');
  var s = document.createElement('style');
  s.id = 'fc-skin';
  s.textContent = css;
  (document.head || document.documentElement).appendChild(s);

  /* THE CREST: a trophy on a shield. Solid colours and no gradient ids, because it is
     drawn more than once on a page and two gradients sharing an id paint each other. */
  window.FC_CREST = function(cls){
    return '<svg class="' + (cls || 'crest') + '" viewBox="0 0 32 32" aria-hidden="true">'
      + '<path d="M16 1.8 28.4 6v9.4c0 7.4-5.3 12.6-12.4 15-7.1-2.4-12.4-7.6-12.4-15V6Z" '
      + 'fill="#141d33" stroke="#f0c96b" stroke-width="1.8"/>'
      + '<path d="M11 8.6h10v4.2a5 5 0 0 1-10 0Z" fill="#f0c96b"/>'
      + '<path d="M11 9.8H8.6a2.6 2.6 0 0 0 2.9 3.8M21 9.8h2.4a2.6 2.6 0 0 1-2.9 3.8" '
      + 'fill="none" stroke="#f0c96b" stroke-width="1.4"/>'
      + '<rect x="15" y="17.4" width="2" height="2.8" fill="#d9a13a"/>'
      + '<rect x="11.8" y="20.2" width="8.4" height="2.4" rx="1" fill="#f0c96b"/></svg>';
  };
  /* Painted into every element that asks for it, once the markup is there. */
  function crests(){
    var els = document.querySelectorAll('[data-crest]');
    for (var i = 0; i < els.length; i++){
      if (els[i].firstChild && els[i].firstChild.nodeName === 'svg') continue;
      els[i].insertAdjacentHTML('afterbegin', window.FC_CREST(els[i].getAttribute('data-crest')));
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', crests);
  else crests();
})();
