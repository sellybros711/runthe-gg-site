/*
 * store.js : the Run The Bundle store, in one place, for every game that sells it.
 *
 * WHY THIS IS SHARED AND NOT COPIED. It is a PAYMENT surface. Two copies of a price, a term
 * or a product list is two chances to tell a customer something the other page contradicts,
 * and the one that is wrong is whichever was edited second. The Arcade Card line is the
 * example that already bit: it is twelve months, everything else in the bundle is permanent,
 * and a sheet claiming "lifetime access" over all four is false about the more expensive
 * product. That sentence now exists once.
 *
 * Same argument the arcade ad makes at /assets/arcade-ad.js: one look and one set of facts
 * for every page that shows it.
 *
 *   RTG_STORE.html(opts)        the offer, as markup. opts.signedOut swaps the two button
 *                               labels for their sign-in-first versions.
 *   RTG_STORE.wire(root, fns)   binds the two buy buttons found inside `root`. fns.buy is
 *                               called with 'perfect-season' or 'run-the-bundle'.
 *
 * IT BRINGS ITS OWN CSS and injects it once, so a page only has to load the file. Every
 * colour and face comes from the site's design tokens (--ink, --panel, --line, --fn, --fd
 * and the rest), which both games already define, so the store takes each page's palette
 * rather than fighting it.
 *
 * WHAT IT DOES NOT DO is decide who sees it, take money, or know what the visitor owns. The
 * host asks those and frames the answer: The Perfect Season shows this in a bottom sheet
 * with a Close under it, Commish Simulator shows it on its door.
 */
(function (root) {
  'use strict';
  if (root.RTG_STORE) return;              // a page that includes it twice

  /* The college game's full name. A product name rather than a heading, so it is spelled
     here rather than read off whichever host happens to be drawing the store. The football
     page keeps its own copy for its mode cards; if the two ever disagree the one a BUYER
     sees is this one. */
  var CFB_NAME = 'The Perfect Season: College Football';

  var esc = function (v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  var CSS = '  .pw-hero{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:13px 0 4px}\n' +
    '  .pw-tile{border:1px solid var(--line);border-radius:12px;padding:11px 7px 10px;text-align:center;\n' +
    '    background:linear-gradient(180deg,rgba(251,191,36,.09),rgba(255,255,255,.02))}\n' +
    '  /* BIGGER, BECAUSE THE ART IS NOW WORTH THE ROOM. 28px was sized for line icons and it is\n' +
    '     the size a favicon is: solid shapes with an inset detail need the space or the detail\n' +
    '     closes up. */\n' +
    '  .pw-tile svg{width:40px;height:40px;display:block;margin:0 auto;\n' +
    '    filter:drop-shadow(0 2px 5px rgba(0,0,0,.45))}\n' +
    '  .pw-tile b{display:block;font-family:var(--fn);font-size:10.5px;letter-spacing:.07em;\n' +
    '    text-transform:uppercase;margin-top:7px;line-height:1.15;color:var(--ink)}\n' +
    '  .pw-tile i{display:block;font-style:normal;font-size:11px;color:var(--dim-2);\n' +
    '    margin-top:3px;line-height:1.25}\n' +
    '  /* A PURCHASE AS A CARD, so the two can be compared side by side rather than one being\n' +
    '     the offer and the other a footnote under it. */\n' +
    '  .pw-tier{border:1px solid var(--line-2);border-radius:14px;padding:13px 13px 12px;margin-top:11px;\n' +
    '    background:var(--panel)}\n' +
    '  .pw-tier.best{border-color:rgba(251,191,36,.5);\n' +
    '    background:linear-gradient(180deg,rgba(251,191,36,.10),var(--panel))}\n' +
    '  /* THE HEADER ROW IS THE SAME HEIGHT ON BOTH CARDS whether or not it carries a tag. The\n' +
    '     "Best value" pill is 19px against a bare name\'s 16px, so without this the two price\n' +
    '     rows below sit three pixels out of step with each other, which is exactly enough to\n' +
    '     stop them reading as a pair and not enough for anybody to see why. */\n' +
    '  .pw-th{display:flex;align-items:center;gap:8px;min-height:19px}\n' +
    '  .pw-name{font-family:var(--fn);font-size:11px;letter-spacing:.12em;text-transform:uppercase;\n' +
    '    color:var(--dim)}\n' +
    '  .pw-tier.best .pw-name{color:#fbbf24}\n' +
    '  .pw-tag{margin-left:auto;font-family:var(--fn);font-size:9px;letter-spacing:.1em;\n' +
    '    text-transform:uppercase;font-weight:800;padding:3px 8px;border-radius:999px;\n' +
    '    background:linear-gradient(135deg,#fde047,#f59e0b);color:#3b2600}\n' +
    '  /* BOTH PRICES IN THE SAME PLACE, WHICH THEY WERE NOT.\n' +
    '     The price used to sit in the header row, pushed to the right edge by margin-left:auto.\n' +
    '     That works on a card whose header holds nothing else and fails on the one that does:\n' +
    '     Run The Bundle\'s "Best value" tag already owned the right slot, so its price dropped to\n' +
    '     a line of its own. The result was $19.99 hard right on one card and $34.99 hard left on\n' +
    '     the next, and a reader comparing two numbers had to go and find each one.\n' +
    '     Now both sit on their own line directly under the name, left aligned, so the eye runs\n' +
    '     down a single edge: name, price, what you get, button, twice. That costs the Premium\n' +
    '     card one line back, which is the trade, and it is the right way round. The saving is a\n' +
    '     shorter sheet or a legible one. */\n' +
    '  .pw-cost{display:flex;align-items:baseline;gap:9px;margin:8px 0 2px;flex-wrap:wrap}\n' +
    '  /* TABULAR FIGURES so the two prices are the same shape as well as the same place: in the\n' +
    '     proportional cut, the 1 in $19.99 is half the width of the 3 in $34.99 and the numbers\n' +
    '     stop lining up exactly where somebody is trying to compare them. */\n' +
    '  .pw-cost b{font-family:var(--fd);font-size:28px;line-height:1;font-weight:400;color:var(--ink);\n' +
    '    font-variant-numeric:tabular-nums}\n' +
    '  /* WHAT THIS ACCOUNT IS, in two letters more than it needs. Drawn only when there is a true\n' +
    '     answer: see acctTier(), which returns nothing at all for a signed out visitor and for one\n' +
    '     whose ownership has not come back yet. */\n' +
    '  .pw-pill{display:inline-block;font-style:normal;margin-left:8px;vertical-align:3px;\n' +
    '    font-family:var(--fn);\n' +
    '    font-size:9px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;\n' +
    '    padding:2px 7px;border-radius:999px}\n' +
    '  .pw-pill.free{background:rgba(255,255,255,.08);color:var(--dim);\n' +
    '    box-shadow:inset 0 0 0 1px var(--line)}\n' +
    '  .pw-pill.pro{background:linear-gradient(135deg,#fde047,#f59e0b);color:#3b2600}\n' +
    '  .pw-was{font-size:13.5px;color:var(--dim-2);text-decoration:line-through;\n' +
    '    font-variant-numeric:tabular-nums}\n' +
    '  /* THE SAVING IS A CHIP, not loose green text. It is the one thing in the price row that is\n' +
    '     not a price, and as bare text at the same baseline it read as a third number to work out.\n' +
    '     A pill says "label" at a glance, and it answers the gold pill in the header above it. */\n' +
    '  .pw-save{font-size:10px;font-weight:800;color:#4ade80;font-family:var(--fn);letter-spacing:.07em;\n' +
    '    text-transform:uppercase;padding:3px 8px;border-radius:999px;align-self:center;\n' +
    '    background:rgba(74,222,128,.13);box-shadow:inset 0 0 0 1px rgba(74,222,128,.34)}\n' +
    '  /* WHICH GAME EACH LINE COMES FROM, IN THAT GAME\'S OWN COLOUR. The colour code is\n' +
    '     the dot plus the name in the same hue, and it is what makes Run The Bundle read\n' +
    '     as buying things in four places rather than as one long list of nouns.\n' +
    '\n' +
    '     A BULLET RATHER THAN A RAIL DOWN THE SIDE. Owner\'s call, and the rail had a\n' +
    '     real problem behind the preference: a 2px line the full height of a three line\n' +
    '     block is a lot of coloured ink for a label, and four of them stacked read as a\n' +
    '     table with borders rather than as a list of things you get. A dot is the same\n' +
    '     information at a fraction of the weight.\n' +
    '\n' +
    '     THE DOT IS DRAWN, NOT A BULLET CHARACTER, because a real bullet inherits the\n' +
    '     font\'s own size and baseline and lands in a different place in every one of the\n' +
    '     four rows depending on what follows it.\n' +
    '\n' +
    '     LAID OUT AS A GRID so the name, the item and the term all hang off the same\n' +
    '     left edge in column two, which is what makes it a bullet list rather than a dot\n' +
    '     with three lines drifting under it. Two columns, and every child is pinned to\n' +
    '     the second: the dot is the only thing in the first.\n' +
    '\n' +
    '     THIS BLOCK SHIPPED ONCE WITH NO RULE AT ALL, which is the failure mode a class\n' +
    '     rename has. The trim that shortened this sheet replaced .pw-src with .pw-line\n' +
    '     and took the old CSS with it, so every line went on setting --gc and nothing\n' +
    '     read it: four identical grey paragraphs and no error anywhere. The colours are\n' +
    '     measured, and the note on PW_GAME says what against. */\n' +
    '  .pw-line{display:grid;grid-template-columns:7px 1fr;column-gap:10px;margin-top:11px}\n' +
    '  .pw-line:before{content:"";grid-column:1;grid-row:1;width:7px;height:7px;\n' +
    '    border-radius:999px;background:var(--gc);\n' +
    '    /* Centred on the cap height of the 10px uppercase name above it, whose line box\n' +
    '       is 12px, rather than on the line box itself: uppercase type sits high in its\n' +
    '       own leading and a dot centred on the box reads low against it. */\n' +
    '    margin-top:2px}\n' +
    '  .pw-line b{display:block;font-family:var(--fn);font-size:10px;letter-spacing:.09em;\n' +
    '    text-transform:uppercase;font-weight:800;color:var(--gc);line-height:1.2}\n' +
    '  .pw-line b,.pw-line span,.pw-line i{grid-column:2}\n' +
    '  .pw-line span{display:block;font-size:12.5px;color:var(--ink);margin-top:3px;line-height:1.35}\n' +
    '  /* SOMETHING IN THE BUNDLE THAT HAS RUN OUT. Shown rather than hidden: a line that vanishes\n' +
    '     on its own expiry date reads as a thing going missing from a receipt, which is the\n' +
    '     opposite of what a receipt is for. The dot and the name go quiet instead, so "you had\n' +
    '     this" sits legibly beside "you have this" without either being mistaken for the other. */\n' +
    '  .pw-line.ended:before{opacity:.3}\n' +
    '  .pw-line.ended b{opacity:.45}\n' +
    '  .pw-line.ended span{color:var(--dim)}\n' +
    '  /* THE DATE LINE, on the receipt and never in the store. The same block does both jobs, so\n' +
    '     the third line is simply absent where there is nothing bought yet to date. */\n' +
    '  .pw-line i{display:block;font-style:normal;font-size:11px;color:var(--dim-2);margin-top:3px;\n' +
    '    line-height:1.3}\n' +
    '  /* The header of the Pro page: the pill the profile already uses, with the one sentence\n' +
    '     that says what being Pro actually gets you, on the same line as it. */\n' +
    '  .pfpro-h{display:flex;align-items:center;gap:10px;margin-top:12px}\n' +
    '  .pfpro-h .pw-pill{margin-left:0;vertical-align:0}\n' +
    '  .pfpro-h span{font-size:12.5px;color:var(--dim-2);line-height:1.35}\n' +
    '  .pw-note{font-size:12px;color:var(--dim-2);margin:13px 0 12px;line-height:1.4}\n' +
    '  /* THE BEST VALUE CARD GETS THE GOLD BUTTON. Both tiers shipped with the same red one,\n' +
    '     which is the house colour for the primary action and cannot be the primary action\n' +
    '     twice: two identical buttons a thumb apart is a choice presented as a coin toss. The\n' +
    '     badge, the border and the button are now one thing. */\n' +
    '  .pw-tier.best .btn{background:linear-gradient(135deg,#fbbf24 0%,#e08c07 100%);color:#3b2600}\n' +
    '  .pw-tier.best .btn:before{background:linear-gradient(180deg,rgba(255,255,255,.34),transparent)}\n' +
    '  .pw-foot{font-size:12px;color:var(--dim-2);text-align:center;margin:13px 0 0;line-height:1.4}\n' +
    '  /* TWO ACROSS ON EVERY PHONE, THREE ONLY WHERE THREE FIT. This was 360px, which put every\n' +
    '     handset made in the last decade into the three column layout, and the names outgrew it:\n' +
    '     a viewport sweep at 10px steps with three columns forced found TRADE MACHINE wrapping to\n' +
    '     two lines at every width up to 420px and COMMISSIONER clipping up to 400px. A wrapped\n' +
    '     name pushes that tile\'s description down twelve pixels while its neighbours stay put, so\n' +
    '     the row reads as a mistake rather than a layout.\n' +
    '     WHY 449 AND NOT 429, which is the last width that actually fails. At 430px the three\n' +
    '     names fit with about two pixels to spare on TRADE MACHINE, which is not a margin, it is\n' +
    '     a coincidence. 450px is the first width with real room (roughly eight pixels), so the\n' +
    '     switch waits for it. Renaming a tile to something longer moves both numbers.\n' +
    '     MEASURE THIS WITH THE REAL FACES LOADED. Anton and Archivo are Google webfonts, and the\n' +
    '     generic sans a headless browser falls back to is far wider: the first sweep of this said\n' +
    '     three columns failed up to 450px, which was the fallback face talking. */\n' +
    '  @media (max-width:449px){\n' +
    '    .pw-hero{grid-template-columns:1fr 1fr}\n' +
    '    .pw-tile:last-child{grid-column:1 / -1}\n' +
    '  }';

  var styled = false;
  function ensureStyle() {
    if (styled) return;
    styled = true;
    var el = document.createElement('style');
    el.id = 'rtg-store-css';
    el.textContent = CSS;
    (document.head || document.documentElement).appendChild(el);
  }
  /* AT LOAD, AND NOT ONLY WHEN THE OFFER IS DRAWN.
     This block styles more than the offer. It carries .pw-pill, which the profile puts
     beside an account name, and .pw-line and .pfpro-h, which are the whole of the Your Pro
     access receipt. None of those goes through html() or art(), and game() never injected
     anything, so an OWNER was exactly the visitor who could reach them without the CSS: a
     customer who has bought and is therefore never shown the pitch card opens their own
     receipt and gets four unstyled paragraphs and a bare word where the pill should be.
     Nothing throws and nothing looks broken enough to report, which is why it stood.
     A page that loads this file is a page that shows one of these things, so the lazy
     injection was buying nothing and costing that. */
  ensureStyle();

  var pwUid = 0;
  const PW_ART={
    /* DYNASTY: a trophy, because the mode is measured in what you won over years. */
    trophy:'<path fill="{g}" d="M15 7h18v9.5a9 9 0 0 1-18 0Z"/>'+
      '<path fill="{g}" opacity=".5" d="M15 10.5h-4.5A6.5 6.5 0 0 0 17 17v-3.2a3.3 3.3 0 0 1-2-3.3Z"/>'+
      '<path fill="{g}" opacity=".5" d="M33 10.5h4.5A6.5 6.5 0 0 1 31 17v-3.2a3.3 3.3 0 0 0 2-3.3Z"/>'+
      '<path fill="{g}" d="M21.8 25.5h4.4V31h-4.4Z"/>'+
      '<path fill="{g}" d="M15.5 31h17a2 2 0 0 1 2 2v3.5h-21V33a2 2 0 0 1 2-2Z"/>'+
      '<path fill="#2a1a02" opacity=".34" d="M24 10.5l1.7 3.5 3.8.5-2.8 2.7.7 3.8-3.4-1.8-3.4 1.8.7-3.8-2.8-2.7 3.8-.5Z"/>',
    /* THE TRADE MACHINE: two arrows going opposite ways, which is what a trade is.
       THE SILHOUETTE TEST THE CLIPBOARD BELOW PAID FOR. A pair of CURVED arrows chasing each
       other round a circle is the reload glyph and nothing else, at any size. Two straight
       arrows passing has no such twin: it is the exchange mark, and it says swap before it
       says anything. The shaft of each one is set against the other's head so the pair reads
       as one movement rather than two signs stacked.
       A club crest used to live at this key, for a Franchise tile that no longer exists.
       Franchise is a kind of dynasty, so it sits under the trophy now. */
    swap:'<rect x="7" y="13" width="24" height="6" rx="3" fill="{g}"/>'+
      '<path fill="{g}" d="M29 8l13 8-13 8Z"/>'+
      '<rect x="17" y="29" width="24" height="6" rx="3" fill="{g}"/>'+
      '<path fill="{g}" d="M19 24L6 32l13 8Z"/>'+
      '<rect x="11" y="14.6" width="9" height="2.8" rx="1.4" fill="#2a1a02" opacity=".32"/>'+
      '<rect x="28" y="30.6" width="9" height="2.8" rx="1.4" fill="#2a1a02" opacity=".32"/>',
    /* COMMISSIONER: a clipboard.
       THIS IS THE THIRD ATTEMPT AND THE OTHER TWO ARE WORTH RECORDING. A stroked bracket was
       unreadable at this size, twice. A whistle was drawn next and rendered, at 40px and at
       3x, as an unmistakable PADLOCK: a round body with an arch over the top is a shackle, and
       no amount of tuning the spout changes what the silhouette says first. A clipboard has no
       such twin, and "run a league" is an admin job rather than a tournament. */
    clipboard:'<rect x="9" y="8" width="30" height="34" rx="4.5" fill="{g}"/>'+
      '<rect x="18" y="4" width="12" height="8" rx="3.2" fill="{g}"/>'+
      '<rect x="20.4" y="6.4" width="7.2" height="3.2" rx="1.6" fill="#2a1a02" opacity=".4"/>'+
      '<rect x="14" y="18" width="20" height="3.4" rx="1.7" fill="#2a1a02" opacity=".38"/>'+
      '<rect x="14" y="25" width="20" height="3.4" rx="1.7" fill="#2a1a02" opacity=".38"/>'+
      '<rect x="14" y="32" width="12" height="3.4" rx="1.7" fill="#2a1a02" opacity=".38"/>',
    /* The little mark on the three prompt cards. */
    star:'<path fill="{g}" d="M24 6.5l5.3 10.8 11.9 1.7-8.6 8.4 2 11.8L24 33.6l-10.6 5.6 2-11.8-8.6-8.4 11.9-1.7Z"/>'
  };
  /* ONE GRADIENT PER DRAWING, because an id is a document-wide name and the star is on screen
     three times at once: a shared id makes every copy after the first point at the same def,
     which works until the first one is removed from the DOM and the rest go black. */
  function pwArt(k){
    const id='pwg'+(++pwUid);
    return '<svg viewBox="0 0 48 48" aria-hidden="true">'+
      '<defs><linearGradient id="'+id+'" x1="0" y1="0" x2="0.35" y2="1">'+
        '<stop offset="0" stop-color="#fde68a"/><stop offset="0.55" stop-color="#f5b022"/>'+
        '<stop offset="1" stop-color="#d97706"/></linearGradient></defs>'+
      PW_ART[k].replace(/\{g\}/g,'url(#'+id+')')+'</svg>';
  }
  const pwTile=(k,name,line)=>'<div class="pw-tile">'+pwArt(k)+'<b>'+esc(name)+'</b>'+
    '<i>'+esc(line)+'</i></div>';
  const PW_GAME={
    ps:{name:'The Perfect Season',c:'#f87171'},
    cfb:{name:CFB_NAME,c:'#10b981'},
    arcade:{name:'Run The Arcade',c:'#FF8A3D'},
    tour:{name:'Run The Tour',c:'#22b8cf'}
  };
  /* THE COMPACT GROUP. The tiles at the top of the sheet already say what each mode IS, so a
     tick list underneath repeating "Dynasty Mode. Unlimited runs" is the same sentence twice
     in one screen. This keeps the thing the tiles cannot say, which is WHICH GAME each one
     comes out of, and says it in one line. */
  /* AND FOR HOW LONG, WHICH IS THE THING THIS SHEET GOT WRONG.
   *
   * The lede promised "one payment, lifetime access" over BOTH cards, and one item in Run The
   * Bundle is not lifetime: the Arcade Card is twelve months. So the strongest claim on the
   * screen was false about the more expensive product, which is the one direction a pricing
   * claim must never be wrong in.
   *
   * The fix is not to delete the word. Three of the four things really are permanent and that
   * is worth saying. It is to put the term on the LINE rather than over the sheet, so each row
   * says what it is and how long it lasts, and the two bundles can be compared on it. */
  const pwGroupText=(key,text,term)=>{
    const g=PW_GAME[key];
    return '<div class="pw-line" style="--gc:'+g.c+'"><b>'+esc(g.name)+'</b>'+
      '<span>'+esc(text)+'</span>'+(term?'<i>'+esc(term)+'</i>':'')+'</div>';
  };

  /* THE OFFER. Both cards in the order they are meant to be compared: the cheaper one first,
     so the second reads as "and also", which is what Best value has to mean. */
  function storeHTML(opts) {
    ensureStyle();
    var o = opts || {};
    var WORTH = 80, RTB = 34.99;
    return '<div class="eyebrow gold">Pro</div>'+
    '<h2 class="display" style="font-size:27px;margin:4px 0 0">Go Pro</h2>'+
    '<p class="dim" style="font-size:13.5px;line-height:1.45;margin:7px 0 0">'+
    /* NO BLANKET TERM UP HERE ANY MORE. "One payment" is true of both bundles and is the
    thing worth leading with. "Lifetime access" was not true of both, and each line
    below now carries its own term instead. */
    'Unlimited dynasty runs, no daily limit, and every Pro mode. '+
    'One payment. No subscription.</p>'+
    '<div class="pw-hero">'+
    /* NO SEASON COUNT ON THE DYNASTY TILE. This read "25 seasons, one job" until recently,
    and there is no ceiling: the 25 was DYNASTY_MAX_SEASONS, a loop guard in the balance
    simulator that nothing in the mode ever read. It is gone from the engine, and this
    tile was the last place the number survived, on the purchase screen, which is the
    worst place on the site to be wrong about what somebody is buying. */
    /* FRANCHISE IS NOT ITS OWN TILE. It is a dynasty with the pool locked to one club,
    bought by the same unlock and ranked on the same ladder, so it sits under the trophy
    with the open one. That freed the middle tile for the mode a paying customer
    actually feels the limit on: the Trade Machine is live to every signed in player and
    Dynasty is invisible to everybody off the tester list, so the row used to promote
    two doors most readers cannot open and stay quiet about the one they can. Buying
    ps_premium switches the Trade Machine's daily meter off. See dailyOn(). */
    pwTile('trophy','Dynasty','Endless arcade mode')+
    pwTile('swap','Trade Machine','Unlimited runs')+
    pwTile('clipboard','Commissioner','Can you save College Football?')+
    '</div>'+

    '<div class="pw-tier">'+
    '<div class="pw-th"><span class="pw-name">Premium Bundle</span></div>'+
    '<div class="pw-cost"><b>$19.99</b></div>'+
    /* THE TRADE MACHINE IS NAMED HERE BECAUSE IT IS PROMOTED ABOVE. The hero row sells
    unlimited Trade Machine runs and this is the itemised list of what the money buys,
    so leaving it off would advertise a thing and then not sell it. It is a real part of
    the product rather than a nice side effect: dailyOn() stops metering the moment
    ps_premium is owned. */
    pwGroupText('ps','Dynasty, Franchise and unlimited Trade Machine','Lifetime access')+
    pwGroupText('cfb','Commissioner Mode','Lifetime access')+
    '<button class="btn" id="b-buy-ps" style="width:100%;margin-top:14px">'+
    (o.signedOut?'Sign in to go Pro':'Go Pro')+'</button>'+
    '</div>'+

    '<div class="pw-tier best">'+
    '<div class="pw-th"><span class="pw-name">Run The Bundle</span>'+
    '<span class="pw-tag">Best value</span></div>'+
    '<div class="pw-cost"><b>$'+RTB.toFixed(2)+'</b>'+
    '<span class="pw-was">$'+WORTH+'</span>'+
    '<span class="pw-save">Save $'+Math.round(WORTH-RTB)+'</span></div>'+
    '<p class="pw-note" style="margin:9px 0 2px">Everything above, plus two more games.</p>'+
    /* "Everything above" carries the two Lifetime access lines with it, so the two lines
    this card adds have to say plainly that they are not that. The Arcade Card is twelve
    months and then it stops. It is still not a subscription: nothing renews it and
    nothing charges again, which is the half a buyer is actually anxious about. */
    pwGroupText('arcade','1 year of the Arcade Card','12 months. It does not renew.')+
    pwGroupText('tour','100,000 coins and one Tour Pack','Tour is the mid pack tier. Yours to spend.')+
    '<button class="btn" id="b-buy-rtb" style="width:100%;margin-top:14px">'+
    (o.signedOut?'Sign in to get it':'Get Run The Bundle')+'</button>'+
    '</div>'+

    '<p class="pw-foot">Either one makes your account Pro. '+
    'Secure checkout by Stripe.</p>';
  }

  /* The two buttons, bound inside whatever the host put them in. Scoped to `root` rather
     than looked up by id on the document: Commish Simulator draws this into a screen that
     is already in the page, and a document-wide lookup is the wrong element the first time
     any host shows the store twice. */
  function wire(rootEl, fns) {
    var f = fns || {};
    var ps = rootEl.querySelector('#b-buy-ps');
    var rtb = rootEl.querySelector('#b-buy-rtb');
    if (ps && f.buy) ps.onclick = function () { f.buy('perfect-season', ps); };
    if (rtb && f.buy) rtb.onclick = function () { f.buy('run-the-bundle', rtb); };
  }

  /*
   * THE TWO PIECES A HOST STILL NEEDS ON ITS OWN.
   *
   * art() draws one of the gold marks. The football page's home prompt card uses the star,
   * which is not part of the offer but is the same gradient, and one implementation of that
   * gradient is the point (see the note on pwArt's id counter).
   *
   * game() is the colour and display name of one of the four games. The Your Pro access
   * receipt lists what an account owns in the same colour coding the offer uses, so the two
   * screens agree about which game a line belongs to.
   *
   * BOTH ARE EXPORTED BECAUSE THE PAGE ALREADY CALLED THEM. Moving the store out and leaving
   * pwArt('star') and PW_GAME behind on the page threw "pwArt is not defined" at boot, on
   * exactly the accounts that see the prompt card, and took the whole game down to the
   * loading screen. Nothing in the store itself was wrong; the two lines that stayed were.
   */
  function art(k) { ensureStyle(); return pwArt(k); }
  function game(k) { return PW_GAME[k] || null; }

  root.RTG_STORE = { html: storeHTML, wire: wire, art: art, game: game, CFB_NAME: CFB_NAME };
})(typeof self !== 'undefined' ? self : this);
