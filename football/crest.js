/*
 * THE CREST: one profile circle, drawn rather than filled.
 * ============================================================================
 *
 * What ships today is a `<span>` with a background colour, two letters and an inset box
 * shadow. Three CSS properties, and it looks like three CSS properties. This file replaces
 * that one circle with a small inline SVG built by one function, and then hangs five layers
 * off it, each of which is earned rather than picked from a list:
 *
 *   1  COLOURWAY   your club's colours, in three rungs, per club
 *   1b PATTERN     that club's own field, unlocked by winning a title with it
 *   2  MARK        one shape inside the crest, chosen from the ones you have unlocked
 *   3  TIER SEAL   struck into the rim, derived from how much of the cabinet you own
 *   4  RING        the outer rim, automatic, for the honours worth an outer rim
 *
 * NOTHING HERE TALKS TO THE NETWORK. `unlocks()` takes the run rows careerLoad already
 * fetched and returns what that player has earned; `crest()` takes a state object and
 * returns a string. Both are pure, so the header, a board row, the podium and a share
 * image can all call them and cannot disagree with each other.
 *
 * THE SIZE RULE IS ENFORCED HERE, NOT BY THE CALLERS. Below 40px a crest is colourway and
 * mark only: the pattern, the tier seal and the ring treatments are detail, and on a board
 * row at 26px detail is a smudge. Every caller forgetting that rule once is how the board
 * ends up with twenty smudges, so the renderer refuses instead of trusting.
 *
 * Browser only, and deliberately: markOffset() below measures shapes with the real layout
 * engine rather than trusting a bounding box.
 *
 * Exposes window.PS_CREST.
 */
(function(){
'use strict';

const E=window.PS_ENGINE||null;

/* ============================================================
   THE COLOURWAYS, straight out of the engine rather than copied.
   [primary, secondary, contrast ink, nickname]

   A second table of thirty two hex pairs is a second table to keep in step with the first,
   and the first one already exists. E.teamColors also decides the `on` colour, which is the
   ink every mark is drawn in, so taking it from there means the crest and everything else
   in the game that writes on a club colour agree by construction.
   ============================================================ */
const CLUBS={};
(function(){
  const src=(E&&E.TEAM_COLORS)||{};
  Object.keys(src).forEach(function(k){
    const c=E.teamColors(k);
    CLUBS[k]=[c.primary,c.secondary,c.on,E.nickname?E.nickname(k):k];
  });
})();

/* ---- colour maths, so the gradient stops are the club colour moved in luminance only ---- */
function rgbOf(h){
  h=String(h).replace('#','');
  if(h.length===3) h=h.split('').map(function(x){return x+x;}).join('');
  return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];
}
function hexOf(a){
  return '#'+a.map(function(x){
    return Math.max(0,Math.min(255,Math.round(x))).toString(16).padStart(2,'0');
  }).join('');
}
function lum(h){
  const [r,g,b]=rgbOf(h).map(function(v){ v/=255;
    return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4); });
  return 0.2126*r+0.7152*g+0.0722*b;
}
function cr(a,b){
  const L1=Math.max(lum(a),lum(b)), L2=Math.min(lum(a),lum(b));
  return (L1+0.05)/(L2+0.05);
}
function mix(a,b,t){
  const A=rgbOf(a),B=rgbOf(b);
  return hexOf([0,1,2].map(function(i){ return A[i]+(B[i]-A[i])*t; }));
}
function patColour(base,sec,ink){
  /* THE DIRECTION IS THE WHOLE THING.

     The first attempt mixed the club's secondary TOWARD THE FIELD until the mark was safe on
     top of it. That works when the field is dark, and it is hopeless when the field is light:
     mixing toward the field converges on the field, so a Chiefs gold or a Lions silver ended
     up as a slightly different red or a slightly different blue. Measured at 1.45 to 1.53
     against the field, which is another way of writing "invisible".

     This mixes AWAY FROM THE MARK instead. Same guarantee, opposite direction, and it
     converges on something you can see rather than on nothing. Then two clamps: far enough
     from the field to register, not so far that it stops being a background. */
  const away=lum(ink)>0.4?'#000000':'#ffffff';
  let c=sec;
  for(let t=0;t<=1.0001;t+=0.02){ c=mix(sec,away,t); if(cr(ink,c)>=3.6) break; }
  let g=0;
  while(cr(c,base)<1.75&&g++<40) c=mix(c,away,0.05);
  g=0;
  while(cr(c,base)>3.4&&g++<40){
    const n=mix(c,base,0.05);
    if(cr(ink,n)<3.6) break;   /* the mark always wins */
    c=n;
  }
  return c;
}

const lift=function(c,t){ return mix(c,'#ffffff',t); };

/* THE INK, AND HOW FAR THE FIELD IS ALLOWED TO SWING.

   The shipped avatar is a FLAT fill, and on a flat fill the club's own `on` colour is right:
   dark ink on Miami teal measures 4.74 against white's 3.95. The lit field in this proposal
   broke that, and measuring against the flat primary hid it. Across the real gradient the
   same dark ink drops to 2.48 at the sunk end while white holds 2.73. Same for the Chargers
   and the Panthers: three mid luminance clubs where the field swings past the ink.

   So two things are decided together rather than separately:
     1. TAKE THE INK WITH THE BETTER WORST CASE across the whole field, not the better
        average and not the better reading against a flat swatch that is not what is drawn.
     2. SHRINK THE SWING until that worst case clears 3.0, with a floor so the crest still
        looks lit rather than flat. A gradient that costs the mark its legibility is not
        worth having, and no club needs the full range to look minted. */
function fieldInk(base,on){
  const range=function(k){ return [mix(base,'#ffffff',0.26*k), mix(base,'#000000',0.34*k)]; };
  const worst=function(c,k){ const r=range(k); return Math.min(cr(c,r[0]),cr(c,r[1])); };
  const pick=worst('#ffffff',1)>worst(on,1)?'#ffffff':on;
  let k=1;
  while(k>0.34&&worst(pick,k)<3.0) k-=0.06;
  return { ink:pick, k:k };
}
const sink=function(c,t){ return mix(c,'#000000',t); };

/* ============================================================
   THE MARKS. Primitives on a 100 unit grid centred on 50,50,
   matched by ink on the page rather than by bounding box.
   Each returns SVG children, given a fill and an accent.
   ============================================================ */
function poly(pts,fill,extra){
  return '<polygon points="'+pts.map(function(p){return p[0].toFixed(2)+','+p[1].toFixed(2);})
    .join(' ')+'" fill="'+fill+'"'+(extra||'')+'/>';
}
function starPts(cx,cy,rOut,rIn,n,rot){
  const out=[];
  for(let i=0;i<n*2;i++){
    const r=i%2?rIn:rOut, a=(Math.PI/n)*i-Math.PI/2+(rot||0);
    out.push([cx+Math.cos(a)*r,cy+Math.sin(a)*r]);
  }
  return out;
}
/* A stroked arc between two angles, in degrees, clockwise, y down. The facemask is built
   from these, which is what lets it stay concentric with the crown at any thickness. */
const DEG=Math.PI/180;
function arcBand(cx,cy,r,a0,a1,w,col,op){
  const x0=cx+r*Math.cos(a0*DEG), y0=cy+r*Math.sin(a0*DEG);
  const x1=cx+r*Math.cos(a1*DEG), y1=cy+r*Math.sin(a1*DEG);
  return '<path d="M'+x0.toFixed(2)+' '+y0.toFixed(2)+'A'+r+' '+r+' 0 '+
    (Math.abs(a1-a0)>180?1:0)+' 1 '+x1.toFixed(2)+' '+y1.toFixed(2)+
    '" fill="none" stroke="'+col+'" stroke-width="'+w+'" stroke-linecap="round"'+
    (op!==undefined?' opacity="'+op+'"':'')+'/>';
}

const MARKS={
  init:{ name:'The Monogram', got:true, t:'The Monogram',
    note:'Your two letters, which is what the crest shows today. It stays the default forever and it is nobody\'s consolation prize.',
    rare:'1.00', tier:null, draw:function(){ return ''; } },

  /* THE SIGNAL. A referee with both arms straight up. The stripes are what make it a ref
     rather than a person cheering, and they are the only reason it reads at 26px. */
  signal:{ name:'The Signal', got:true, t:'The Signal',
    note:'Average a winning margin of 17 points or more. He had his arms up all year.',
    rare:'0.03', tier:'legend',
    draw:function(f,a){
      return '<circle cx="50" cy="20" r="10.5" fill="'+f+'"/>'+
        '<path d="M39 36h22c5 0 9 4 9 9v22H30V45c0-5 4-9 9-9z" fill="'+f+'"/>'+
        '<rect x="41" y="41" width="4.5" height="26" fill="'+a+'"/>'+
        '<rect x="54" y="41" width="4.5" height="26" fill="'+a+'"/>'+
        '<rect x="24" y="6" width="9.5" height="34" rx="4.7" fill="'+f+
          '" transform="rotate(-13 28 24)"/>'+
        '<rect x="66.5" y="6" width="9.5" height="34" rx="4.7" fill="'+f+
          '" transform="rotate(13 71 24)"/>'+
        '<rect x="36" y="67" width="10" height="24" rx="4" fill="'+f+'"/>'+
        '<rect x="54" y="67" width="10" height="24" rx="4" fill="'+f+'"/>';
    } },

  /* THE TICKET. It replaced a stadium, which no amount of tier divisions could stop reading
     as an eye, and then as a beetle. */
  ticket:{ name:'The Ticket', got:false, t:'The Ticket',
    note:'Play One Franchise with all 32 clubs. You have had a seat everywhere.',
    rare:'0.004', tier:'legend',
    draw:function(f,a){
      return '<path d="M14 32h72v14a8 8 0 0 0 0 16v14H14V62a8 8 0 0 0 0-16z" fill="'+f+'"/>'+
        [34,46,58,70].map(function(y){
          return '<rect x="56" y="'+y+'" width="3" height="8" rx="1.5" fill="'+a+'"/>';
        }).join('')+
        '<rect x="24" y="46" width="24" height="6" rx="3" fill="'+a+'"/>'+
        '<rect x="24" y="58" width="16" height="6" rx="3" fill="'+a+'"/>';
    } },

  /* THE CLIPBOARD. Taller than it is wide, which is what keeps it off the wall, and the clip
     on top is the tell. */
  clipboard:{ name:'The Clipboard', got:false, t:'The Clipboard',
    note:'Go perfect in the Trade Machine. Every call on the sheet was the right one.',
    rare:'0.003', tier:'legend',
    draw:function(f,a){
      return '<rect x="26" y="20" width="48" height="66" rx="5" fill="'+f+'"/>'+
        '<rect x="40" y="11" width="20" height="14" rx="4" fill="'+f+'"/>'+
        '<path d="M36 40 L46 50 M46 40 L36 50" stroke="'+a+
          '" stroke-width="4.4" stroke-linecap="round"/>'+
        '<circle cx="61" cy="45" r="6" fill="none" stroke="'+a+'" stroke-width="4.4"/>'+
        '<path d="M36 64 h28" stroke="'+a+'" stroke-width="4.4" stroke-linecap="round"/>'+
        '<path d="M56 58 l8 6 -8 6" fill="none" stroke="'+a+
          '" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>';
    } },

  /* THE CONTROLLER. The badge is called "Video game numbers", so the object is the joke.

     Four buttons in a diamond rather than two: it is the strongest single cue that a shape is
     a game controller, and it is what keeps this off the headset, which is the only other mark
     here with a body and two lobes. The headset's lobes sit at the SIDES and this one's grips
     point DOWN, which is what separates them at 26px. */
  pad:{ name:'The Controller', got:false, t:'The Controller',
    note:'Build a team rated 100 or better. The cabinet calls that one Video game numbers, and this is what those look like.',
    rare:'0.007', tier:'legend',
    draw:function(f,a){
      return '<path d="M30 32h40c11 0 18 8 20 18l5 24c2 9-4 16-12 16-7 0-12-5-16-11l-6-9H39l-6 9'+
        'c-4 6-9 11-16 11-8 0-14-7-12-16l5-24c2-10 9-18 20-18z" fill="'+f+'"/>'+
        '<rect x="26" y="50" width="21" height="6.5" rx="3.2" fill="'+a+'"/>'+
        '<rect x="33.2" y="43" width="6.5" height="21" rx="3.2" fill="'+a+'"/>'+
        '<circle cx="70" cy="43" r="4.4" fill="'+a+'"/>'+
        '<circle cx="70" cy="61" r="4.4" fill="'+a+'"/>'+
        '<circle cx="61" cy="52" r="4.4" fill="'+a+'"/>'+
        '<circle cx="79" cy="52" r="4.4" fill="'+a+'"/>';
    } },

  /* THE UPRIGHTS. Posts rise ABOVE the crossbar and nowhere else, which is the detail an
     earlier pass got wrong and the reason it read as a letter H. */
  posts:{ name:'The Uprights', got:true, t:'The Uprights',
    note:'Go 17-0 in the regular season. Straight through, every week.',
    rare:'0.11', tier:'gold',
    draw:function(f,a){
      return '<rect x="25" y="14" width="7.5" height="34" rx="3.7" fill="'+f+'"/>'+
        '<rect x="67.5" y="14" width="7.5" height="34" rx="3.7" fill="'+f+'"/>'+
        '<rect x="25" y="42" width="50" height="7.5" rx="3.7" fill="'+f+'"/>'+
        '<rect x="46.2" y="49" width="7.6" height="26" rx="3.8" fill="'+a+'"/>'+
        '<rect x="32" y="75" width="36" height="7.5" rx="3.7" fill="'+a+'"/>';
    } },

  /* THE TOWEL, thrown in. A penalty flag was drawn twice for this slot and came out as a
     paintbrush both times: a knot with cloth trailing off it IS a brush, and with no yellow
     there is nothing left to say otherwise. */
  egg:{ name:'Goose Egg', got:true, t:'Goose Egg',
    note:'Lose every game in a season. The cabinet calls this one The 2008 Lions, and it is worth wearing precisely because it is not an achievement.',
    rare:'0.008', tier:'gold',
    draw:function(f,a){
      return '<path d="M50 12c17 0 28 22 28 41 0 20-12 33-28 33s-28-13-28-33c0-19 11-41 28-41z" fill="'+f+'"/>'+
        '<path d="M22 54 L34 48 L40 58 L52 50 L58 60 L70 53 L78 58" fill="none" stroke="'+a+
          '" stroke-width="5" stroke-linejoin="miter"/>';
    } },

  headset:{ name:'The Headset', got:true, t:'The Headset',
    note:'Win a title in the Trade Machine. You did not draft that team, you assembled it from the war room.',
    rare:'0.06', tier:'gold',
    draw:function(f){
      return '<path d="M20 56a30 30 0 0 1 60 0" fill="none" stroke="'+f+'" stroke-width="9"/>'+
        '<rect x="11" y="50" width="19" height="28" rx="9.5" fill="'+f+'"/>'+
        '<rect x="70" y="50" width="19" height="28" rx="9.5" fill="'+f+'"/>'+
        '<path d="M30 74 Q46 90 60 84" fill="none" stroke="'+f+'" stroke-width="5.5"/>'+
        '<circle cx="62" cy="83" r="6" fill="'+f+'"/>';
    } },

  /* THE RAFTERS. Three championship banners on a beam, one per title.

     It replaced a down marker, drawn three ways: two stakes with a chain, one stake with a
     board and a trailing chain, and the down indicator on its own. All three read as a
     signpost, and that is not a drawing problem. Strip the orange and the numeral off a down
     marker and a sign on a pole is all that is left. Banners say the thing directly, and
     three of them say three. */
  rafters:{ name:'The Rafters', got:false, t:'The Rafters',
    note:'Win titles in three straight seasons. One banner each, and they do not come down.',
    rare:'0.006', tier:'legend',
    draw:function(f,a){
      let s='<rect x="10" y="12" width="80" height="9" rx="4" fill="'+f+'"/>';
      [[19,44],[42,54],[65,44]].forEach(function(p,i){
        s+='<path d="M'+p[0]+' 21h16v'+p[1]+'l-8-9-8 9z" fill="'+f+'"/>'+
          '<rect x="'+(p[0]+3)+'" y="'+(30+i*2)+'" width="10" height="5" rx="2.5" fill="'+a+'"/>';
      });
      return s;
    } },

  wall:{ name:'The Wall', got:false, t:'The Wall',
    note:'Win a title with a drafted defense. The cabinet already calls that one Defense wins championships.',
    rare:'0.041', tier:'gold',
    draw:function(f,a){
      let s='<rect x="18" y="24" width="64" height="52" rx="5" fill="'+f+'"/>'+
        '<rect x="18" y="40" width="64" height="3.4" fill="'+a+'"/>'+
        '<rect x="18" y="56" width="64" height="3.4" fill="'+a+'"/>';
      [[50,24,16],[34,40,16],[66,40,16],[50,56,16]].forEach(function(p){
        s+='<rect x="'+(p[0]-1.7)+'" y="'+p[1]+'" width="3.4" height="'+p[2]+'" fill="'+a+'"/>';
      });
      return s;
    } },

  /* THE TROPHY. A football on a plinth, deliberately generic: the shape the sport uses, not
     a replica of the one somebody owns. */
  trophy:{ name:'The Trophy', got:true, t:'The Trophy',
    note:'Win a One Franchise title. One club, one January, one of these.',
    rare:'0.19', tier:'bronze',
    draw:function(f,a){
      return '<g transform="rotate(-14 50 30)">'+
        '<ellipse cx="50" cy="28" rx="24" ry="14.5" fill="'+f+'"/>'+
        '<rect x="41" y="26.5" width="18" height="2.8" rx="1.4" fill="'+a+'"/>'+
        [43.5,48,52.5,57].map(function(x){
          return '<rect x="'+x+'" y="22.5" width="2.8" height="11" rx="1.4" fill="'+a+'"/>';
        }).join('')+'</g>'+
        '<rect x="44" y="44" width="12" height="14" fill="'+f+'"/>'+
        '<rect x="31" y="58" width="38" height="10" rx="2.5" fill="'+f+'"/>'+
        '<rect x="24" y="68" width="52" height="12" rx="3" fill="'+f+'"/>';
    } },

  /* THE CROWN. Five points with orbs on the tips and a jewelled band. Three plain points
     read as a zigzag at 26px; the orbs are what make it a crown at any size. It is the
     grandest thing in the set on purpose, because it is for the rarest thing in the game.

     ALSO THE ONLY MARK THAT SPANS BOTH MODES, which is why it partly answers the defense
     gap below: a perfect season counts whichever side of the ball you drafted. */
  crown:{ name:'The Crown', got:false, t:'The Crown',
    note:'Go 20-0, on offense or on defense. Seventeen and then three more, with nothing dropped anywhere.',
    rare:'0.009', tier:'legend',
    draw:function(f,a){
      return '<polygon points="12,70 12,32 26,46 38,26 50,44 62,26 74,46 88,32 88,70" fill="'+f+'"/>'+
        '<rect x="12" y="66" width="76" height="14" rx="4" fill="'+f+'"/>'+
        [26,38,50,62,74].map(function(x){
          return '<circle cx="'+x+'" cy="73" r="3.6" fill="'+a+'"/>';
        }).join('')+
        [[12,32],[38,26],[62,26],[88,32]].map(function(p){
          return '<circle cx="'+p[0]+'" cy="'+p[1]+'" r="4.4" fill="'+f+'"/>';
        }).join('');
    } },

  /* THE UNDERDOG. A PAW PRINT, and the road here is the useful part.

     Six attempts at a dog's FACE, every one of which failed as a composition rather than as a
     drawing. Wide floppy ears read as a bear. Pointed ears read unmistakably as a cat. Ears
     growing straight out of the skull read as a lamb. And a round nose centred between two
     round eyes with a smile under it is a clown, which is what was shipping.

     THE LESSON IS ABOUT FACES, NOT ABOUT DOGS. A face is the least forgiving thing an icon set
     can contain, because the read is set by millimetres of relative position between four or
     five small features, and every one of those failures came from moving a feature rather
     than from drawing one badly. At 26 pixels there is no room to correct it.

     A paw says the same thing with no features to arrange: one heel pad and four toes, and
     there is no arrangement of those five shapes that turns into something else. It is the
     only mark in the set that is equally crisp at 96 and at 26. A bone and a sitting dog in
     profile both work too and are drawn in the lab if this ever wants replacing. */
  dog:{ name:'The Underdog', got:false, t:'The Underdog',
    note:'Win the title from a wild card seed. You were not supposed to be there.',
    rare:'0.019', tier:'gold',
    draw:function(f){
      return '<path d="M50 52c13 0 23 9 23 19 0 9-7 15-23 15s-23-6-23-15c0-10 10-19 23-19z" fill="'+f+'"/>'+
        '<ellipse cx="26" cy="40" rx="9" ry="11.5" fill="'+f+'" transform="rotate(-18 26 40)"/>'+
        '<ellipse cx="42" cy="27" rx="8.5" ry="11.5" fill="'+f+'" transform="rotate(-7 42 27)"/>'+
        '<ellipse cx="58" cy="27" rx="8.5" ry="11.5" fill="'+f+'" transform="rotate(7 58 27)"/>'+
        '<ellipse cx="74" cy="40" rx="9" ry="11.5" fill="'+f+'" transform="rotate(18 74 40)"/>';
    } }
};
const MARK_KEYS=['init','pad','posts','egg','signal','rafters','wall','headset',
  'clipboard','ticket','crown','trophy','dog'];


/* ============================================================
   THE PINS. Struck metal, and the metal is the cabinet tier.
   ============================================================ */
/* ============================================================
   THE TIER, WHICH IS NOT A CHALLENGE.

   This slot was a rack of pins, one per rare badge, that you
   picked from. Two things were wrong with it. It was a second
   achievement system bolted to the side of the one the game
   already has, and it made the rarest thing on the crest a
   CHOICE, so two players with the same cabinet could look
   nothing alike for no reason.

   So it is an account tier instead, derived and never equipped,
   exactly the way RunThePitch does it: your tier climbs as your
   badge count climbs and it colours your name. Same five steps,
   same 0/25/50/75/100 thresholds, same idea of a floor before
   you are ranked at all. One number, one seal, nothing to pick.
   ============================================================ */
/* THE DENOMINATOR IS READ, NOT WRITTEN DOWN. The mock counted the cabinet once and put 387
   in a constant. The cabinet grows: every badge added to achievements.js would move every
   player's tier without anybody touching this file, and it would do it silently, because a
   tier that drifts down looks exactly like a tier that was never earned. So it is asked of
   the catalog that is actually installed, every time. */
function achTotal(){
  const A=window.PS_ACH;
  return (A&&A.CATALOG&&A.CATALOG.length)||387;
}
const BRONZE_MIN=5;       /* below this you are unranked, and the crest says nothing */

const TIERS=[
  { id:'bronze', name:'Bronze', a:'#F6CE98', b:'#7a481f', mid:'#C77B3A', edge:'#5e2f0f', pips:1 },
  { id:'silver', name:'Silver', a:'#ffffff', b:'#7f868d', mid:'#CFD3D8', edge:'#48525f', pips:2 },
  { id:'gold',   name:'Gold',   a:'#FFF7C2', b:'#9a6c12', mid:'#F4C430', edge:'#6b4703', pips:3 },
  { id:'legend', name:'Legend', a:'#ffffff', b:'#8fd0ff', mid:'#cdeeff', edge:'#1d4e73', pips:0, star:true },
  { id:'goat',   name:'GOAT',   a:'#FFD24A', b:'#FFC0E6', mid:'#FFF2A0', edge:'#6b4703', pips:0, star:true, halo:true }
];
/* The same shape as the soccer game's tierFromBadges: GOAT is every badge, the four steps
   below it are quarters of the total, and under the floor there is no tier at all. */
function tierFromBadges(b){
  b=+b||0;
  const total=achTotal();
  if(b>=total) return TIERS[4];
  if(b<BRONZE_MIN) return null;
  return TIERS[Math.min(3,Math.floor((b*4)/total))];
}
function tierAt(id){ return TIERS.filter(function(t){ return t.id===id; })[0]||null; }
/* What the next step costs, for the "62 to Gold" line. */
function nextTierAt(i){
  const total=achTotal();
  return i>=3?total:Math.ceil(((i+1)*total)/4);
}

/* The glyph inside the seal. Chevrons count the first three steps, a star takes over at
   Legend. All of it is gravy: at 40px the METAL is the signal and the glyph is texture. */
function tierGlyph(t,col){
  if(t.star){
    return poly(starPts(50,50,30,12,5,0),col)+
      (t.halo?'<circle cx="50" cy="50" r="42" fill="none" stroke="'+col+'" stroke-width="7"/>':'');
  }
  let s='';
  for(let i=0;i<t.pips;i++){
    const y=30+i*20;
    s+='<path d="M22 '+(y+16)+' L50 '+y+' L78 '+(y+16)+'" fill="none" stroke="'+col+
      '" stroke-width="11" stroke-linejoin="miter" stroke-linecap="butt"/>';
  }
  return s;
}

const RINGS=[
  /* THE ONE PLACE THIS FILE SPELLS THINGS THE GAME'S WAY. Everything else here is a
     comment and can say colour; `t` is printed on screen, and the rest of the page says
     color. A picker that switches spelling halfway down reads as two people wrote it. */
  { id:'club', name:'Club colors', got:true, t:'Just your club colors',
    note:'The default, and thirty two of them. This is the layer that already ships.',
    rare:'1.00', tier:null },
  { id:'gold', name:'The Ring', got:true, t:'The Ring',
    note:'Won a title. The club secondary is still there, in full, with the gold added outside it.',
    rare:'0.24', tier:'gold' },
  { id:'btb', name:'Back to Back', got:false, t:'Back to Back',
    note:'Win titles in two straight seasons. A highlight travels the outer ring. Two in a row is hard enough that it should catch the light.',
    rare:'0.014', tier:'legend', animated:true },
  { id:'perfect', name:'Perfect', got:false, t:'Perfect',
    note:'Go 20-0. Gold, and the light never stops going round it.',
    rare:'0.009', tier:'legend', animated:true }
];

/* ============================================================
   THE PATTERNS, ONE PER CLUB.

   The generic set this replaced (hash marks, yard lines, mow
   bands) was the same eight shapes handed round thirty two
   clubs in different colours. It looked like a system and it
   said nothing about anybody.

   This is ELEVEN PRIMITIVES AND THIRTY TWO CONFIGURATIONS.
   Every club points at a primitive and gives it numbers, and
   the primitive draws in that club's own secondary. So a
   pattern is specific to one club without being artwork, and
   the whole per club cost is the config line below.

   ON PURPOSE, AND IT MATTERS: none of these is a club's logo.
   They are jersey elements, city motifs and animal markings
   drawn as abstract geometry. Reproducing thirty two marks
   somebody else owns would be a different project with a
   different kind of risk, and it is not this one.
   ============================================================ */
const PRIM={
  stripes:function(o,c){
    return '<g transform="rotate('+(o.angle||0)+' 50 50)">'+(o.bands||[]).map(b=>
      '<rect x="-60" y="'+b[0]+'" width="220" height="'+b[1]+'" fill="'+c+'"/>').join('')+'</g>';
  },
  bars:function(o,c){
    const h=o.h||[30,52,40,64,36,48,58,34], w=100/h.length;
    return h.map((v,i)=>'<rect x="'+(i*w+1)+'" y="'+(100-v)+'" width="'+(w-2)+'" height="'+v+
      '" fill="'+c+'"/>').join('');
  },
  chevrons:function(o,c){
    const n=o.n||4, w=o.w||11, sp=o.sp||26, drop=o.drop||28;
    let s='';
    for(let i=0;i<n;i++) s+='<path d="M-16 '+(-18+i*sp+drop)+' L50 '+(-18+i*sp)+' L116 '+
      (-18+i*sp+drop)+'" fill="none" stroke="'+c+'" stroke-width="'+w+'" stroke-linejoin="miter"/>';
    return '<g transform="rotate('+(o.angle||0)+' 50 50)">'+s+'</g>';
  },
  zigzag:function(o,c){
    const rows=o.rows||3, amp=o.amp||16, per=o.per||30, w=o.w||10;
    let s='';
    for(let r=0;r<rows;r++){
      const y0=(o.top||10)+r*(o.gap!==undefined?o.gap:30);
      const ph=o.phase||0;
      let d='M'+(-30+ph)+' '+y0;
      for(let x=-30+ph;x<134;x+=per) d+=' L'+(x+per/2)+' '+(y0-amp)+' L'+(x+per)+' '+y0;
      s+='<path d="'+d+'" fill="none" stroke="'+c+'" stroke-width="'+w+'" stroke-linejoin="miter"/>';
    }
    return s;
  },
  stars:function(o,c){
    return (o.at||[[50,50,26]]).map(p=>poly(starPts(p[0],p[1],p[2],
      p[2]*((o.pts||5)===6?.56:.42),o.pts||5,o.rot||0),c)).join('');
  },
  scales:function(o,c){
    const r=o.r||18, w=o.w||7, rows=o.rows||4;
    let s='';
    for(let i=0;i<rows;i++){
      const y=(o.top||10)+i*(r*(o.pack||0.92));
      for(let x=(i%2?-r:0);x<128;x+=r*2)
        s+='<path d="M'+(x-r)+' '+y+'a'+r+' '+r+' 0 0 0 '+(r*2)+' 0" fill="none" stroke="'+c+
          '" stroke-width="'+w+'" stroke-linecap="butt"/>';
    }
    return s;
  },
  spots:function(o,c){
    const step=o.step||24, r=o.r||7;
    let s='';
    for(let y=-2;y<110;y+=step) for(let x=(((y+2)/step)%2?-2:step/2-2);x<110;x+=step)
      s+='<ellipse cx="'+x+'" cy="'+y+'" rx="'+r+'" ry="'+(r*.76)+'" fill="'+c+'"/>';
    return s;
  },
  claws:function(o,c){
    const n=o.n||4, sp=o.sp||24, len=o.len||70, bend=o.bend||10;
    let s='';
    for(let i=0;i<n;i++){
      const x=(o.x0||8)+i*sp, y=50-len/2;
      const w=(o.w||11)*(o.vary?[1,.62,1.18,.72,1.05,.8][i%6]:1);
      s+='<path d="M'+x+' '+y+' q'+(bend*(o.vary?(i%2?-1:1):1))+' '+(len/2)+' 0 '+len+
        '" fill="none" stroke="'+c+'" stroke-width="'+w+'" stroke-linecap="round"/>';
    }
    return '<g transform="rotate('+(o.angle||14)+' 50 50)">'+s+'</g>';
  },
  arcs:function(o,c){
    const rs=o.rs||[18,30,42], w=o.w||8;
    const a0=o.a0!==undefined?o.a0:200, a1=o.a1!==undefined?o.a1:-20;
    let s='';
    (o.at||[[50,54]]).forEach(p=>rs.forEach(r=>{ s+=arcBand(p[0],p[1],r,a0,a1,w,c); }));
    return s;
  },
  grid:function(o,c){
    const step=o.step||22, w=o.w||6;
    let s='';
    if(o.knots) for(let y=-6;y<112;y+=step) for(let x=-6;x<112;x+=step)
      s+='<circle cx="'+x+'" cy="'+y+'" r="'+(w*0.95)+'" fill="'+c+'"/>';
    for(let i=-6;i<9;i++)
      s+='<rect x="'+(i*step)+'" y="-60" width="'+w+'" height="230" fill="'+c+
        '" transform="rotate(45 50 50)"/><rect x="'+(i*step)+'" y="-60" width="'+w+
        '" height="230" fill="'+c+'" transform="rotate(-45 50 50)"/>';
    return s;
  },
  /* A spiral, for a horn. Nested arcs could never be one: an arc has a constant radius and
     the whole point of a horn is that the radius grows as it turns. */
  spiral:function(o,c){
    const turns=o.turns||1.5, r0=o.r0||3, r1=o.r1||24, w=o.w||7, steps=72;
    return (o.at||[[50,50]]).map(function(p,idx){
      const flip=o.mirror&&idx%2?-1:1;
      let d='';
      for(let i=0;i<=steps;i++){
        const t=i/steps, ang=(o.a0||0)+turns*360*t, r=r0+(r1-r0)*t;
        d+=(i?' L':'M')+(p[0]+flip*r*Math.cos(ang*DEG)).toFixed(2)+' '+
          (p[1]+r*Math.sin(ang*DEG)).toFixed(2);
      }
      return '<path d="'+d+'" fill="none" stroke="'+c+'" stroke-width="'+w+
        '" stroke-linecap="round" stroke-linejoin="round"/>';
    }).join('');
  },
  /* A real crescent: a disc with an offset disc taken out of it. The old version stacked
     three concentric arcs and read as rings, which is a different object. */
  crescent:function(o,c,u){
    const r=o.r||40, dx=o.dx||20, dy=o.dy||-8, r2=o.r2||36;
    return '<mask id="cr'+u+'"><circle cx="50" cy="50" r="'+r+'" fill="#fff"/>'+
      '<circle cx="'+(50+dx)+'" cy="'+(50+dy)+'" r="'+r2+'" fill="#000"/></mask>'+
      '<circle cx="50" cy="50" r="'+r+'" fill="'+c+'" mask="url(#cr'+u+')"/>';
  },
  /* A suspension span: one catenary and the hangers under it. */
  cables:function(o,c){
    const w=o.w||6, top=o.top||18, sag=o.sag||40, deck=o.deck||72;
    let s='<path d="M-12 '+top+' Q50 '+(top+sag)+' 112 '+top+'" fill="none" stroke="'+c+
      '" stroke-width="'+w+'" stroke-linecap="butt"/>'+
      /* the deck, which is what the hangers hang the road off */
      '<rect x="-12" y="'+deck+'" width="124" height="'+(w*0.9)+'" fill="'+c+'"/>'+
      /* and the two towers */
      '<rect x="8" y="'+(top-6)+'" width="'+(w*0.9)+'" height="'+(deck-top+12)+'" fill="'+c+'"/>'+
      '<rect x="'+(92-w*0.9)+'" y="'+(top-6)+'" width="'+(w*0.9)+'" height="'+(deck-top+12)+'" fill="'+c+'"/>';
    for(let i=1;i<8;i++){
      const t=i/8, x=-12+124*t;
      const y=(1-t)*(1-t)*top+2*(1-t)*t*(top+sag)+t*t*top;
      s+='<rect x="'+(x-w*0.3)+'" y="'+y+'" width="'+(w*0.6)+'" height="'+(deck-y)+'" fill="'+c+'"/>';
    }
    return s;
  },
  bolts:function(o,c){
    return (o.at||[[30,30,.66]]).map(p=>'<g transform="translate('+p[0]+' '+p[1]+') scale('+
      p[2]+') translate(-50 -50)">'+poly([[57,16],[28,56],[45,56],[41,86],[72,44],[55,44]],c)+
      '</g>').join('');
  }
};

/* ============================================================
   ORGANIC PRIMITIVES.

   Everything above is made of rects, perfect arcs and regular
   polygons, which is exactly right for a flag, a bridge or a
   jersey stripe. It is exactly wrong for an animal. A claw is
   not a piece of wire, a feather is not a semicircle, and a
   jaguar's spots are not a grid of ellipses.

   Three things separate these from the geometric set:
     TAPER      a real mark is thin, thick, thin along its run
     ASYMMETRY  the two sides of a curve are not the same curve
     JITTER     no two are identical, and none of it is random
                at runtime: the wobble is a hash of the index, so
                the same crest draws the same way forever
   ============================================================ */
function rnd(i){ const x=Math.sin(i*127.1+311.7)*43758.5453; return x-Math.floor(x); }
const P2=(a)=>a[0].toFixed(2)+' '+a[1].toFixed(2);

/* A curved ribbon whose width grows and shrinks along its length. This one function is what
   turns a stroke into a claw mark, a tiger stripe and a feather barb. */
function ribbon(ax,ay,cx,cy,bx,by,w0,wm,w1,fill){
  const nrm=(px,py,qx,qy)=>{ const dx=qx-px,dy=qy-py,L=Math.hypot(dx,dy)||1; return [-dy/L,dx/L]; };
  const nA=nrm(ax,ay,cx,cy), nB=nrm(cx,cy,bx,by);
  let nC=[(nA[0]+nB[0])/2,(nA[1]+nB[1])/2];
  const L=Math.hypot(nC[0],nC[1])||1; nC=[nC[0]/L,nC[1]/L];
  const o=(x,y,n,w)=>[x+n[0]*w/2,y+n[1]*w/2];
  return '<path d="M'+P2(o(ax,ay,nA,w0))+' Q'+P2(o(cx,cy,nC,wm))+' '+P2(o(bx,by,nB,w1))+
    ' L'+P2(o(bx,by,nB,-w1))+' Q'+P2(o(cx,cy,nC,-wm))+' '+P2(o(ax,ay,nA,-w0))+
    ' Z" fill="'+fill+'"/>';
}

/* A pointed oval with unequal sides, which is the difference between a feather and a lens. */
function leaf(cx,cy,w,h,rot,fill,lean){
  const k=lean===undefined?1:lean;
  return '<path d="M0 '+(-h)+' C '+(w*k)+' '+(-h*.34)+' '+(w*.72*k)+' '+(h*.46)+' 0 '+h+
    ' C '+(-w*.7)+' '+(h*.42)+' '+(-w*.94)+' '+(-h*.3)+' 0 '+(-h)+' Z" fill="'+fill+
    '" transform="translate('+cx+' '+cy+') rotate('+rot+')"/>';
}

/* A closed shape through jittered points, smoothed by running the curve THROUGH the
   midpoints and using each point as the control. Lobed, not elliptical. */
function blob(cx,cy,r,seed,fill,squash){
  const n=8, pts=[];
  for(let i=0;i<n;i++){
    const a=(Math.PI*2/n)*i+rnd(seed*3+i)*0.35;
    const rr=r*(0.7+0.62*rnd(seed*7+i));
    pts.push([cx+Math.cos(a)*rr, cy+Math.sin(a)*rr*(squash||0.84)]);
  }
  const mid=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
  let d='M'+P2(mid(pts[n-1],pts[0]));
  for(let i=0;i<n;i++) d+=' Q'+P2(pts[i])+' '+P2(mid(pts[i],pts[(i+1)%n]));
  return '<path d="'+d+' Z" fill="'+fill+'"/>';
}

const ORGANIC={
  /* Rows of overlapping feather tips, each one leaning slightly differently. */
  feathers:function(o,c){
    const r=o.r||16, rows=o.rows||5, lean=o.lean||0;
    let s='';
    for(let i=0;i<rows;i++){
      const y=(o.top||6)+i*r*(o.pack||1.05);
      for(let j=0,x=(i%2?-r*0.9:0);x<118;x+=r*1.8,j++){
        const k=i*13+j;
        s+=leaf(x,y,r*(0.74+0.16*rnd(k)),r*(0.88+0.2*rnd(k+5)),
          180+lean+(rnd(k+9)-0.5)*13,c,0.72+0.46*rnd(k+3));
      }
    }
    return s;
  },

  /* Tapered slashes. Thin, thick, thin, with the bend and the weight varying down the row.
     Claw marks, tiger stripes and anything else an animal leaves behind. */
  slashes:function(o,c){
    const n=o.n||4, sp=o.sp||24, len=o.len||70, w=o.w||13;
    let s='';
    for(let i=0;i<n;i++){
      const k=i*17+3;
      const x=(o.x0||10)+i*sp+(rnd(k)-0.5)*(o.wob||6);
      const y0=50-len/2+(rnd(k+2)-0.5)*(o.wob||6);
      const y1=y0+len*(0.82+0.34*rnd(k+4));
      const bend=(o.bend||14)*(0.6+0.8*rnd(k+6))*(o.alt&&i%2?-1:1);
      const wm=w*(0.62+0.66*rnd(k+8));
      s+=ribbon(x,y0,x+bend,(y0+y1)/2,x+bend*0.15,y1,w*0.12,wm,w*0.1,c);
    }
    return '<g transform="rotate('+(o.angle||12)+' 50 50)">'+s+'</g>';
  },

  /* Lobed spots, offset row to row, no two the same shape. */
  blobs:function(o,c){
    const step=o.step||26, r=o.r||9;
    let s='', k=0;
    for(let y=-4;y<112;y+=step)
      for(let x=((Math.round((y+4)/step))%2?-6:step/2-6);x<112;x+=step)
        s+=blob(x+(rnd(k)-0.5)*7,y+(rnd(k+1)-0.5)*7,r*(0.72+0.56*rnd(k+2)),++k,c);
    return s;
  },

  /* A wing: feathers radiating from one corner in rows, each one turned to point away from
     where the wing joins. The first version put the origin in the middle of the bottom edge
     and used the sine to place the row, which folded the fan downward and buried the whole
     thing in the lower left. It is polar now, and the leaf is rotated to its own angle. */
  wing:function(o,c){
    const rows=o.rows||4, per=o.per||5, ox=o.cx||16, oy=o.cy||98;
    let s='';
    for(let i=0;i<rows;i++){
      const R=(o.r0||26)+i*(o.gap||20), len=(o.len||17)+i*(o.grow||4);
      for(let j=0;j<per;j++){
        const k=i*11+j;
        const a=(o.a0||-86)+j*((o.spread||78)/(per-1));
        const rad=a*Math.PI/180;
        s+=leaf(ox+Math.cos(rad)*R, oy+Math.sin(rad)*R, len*0.36, len,
          a+90+(rnd(k)-0.5)*12, c, 0.72+0.5*rnd(k+2));
      }
    }
    return s;
  },

  /* A wave with a curled crest, which is what a wave looks like and an arc does not. */
  waves:function(o,c){
    const rows=o.rows||4, per=o.per||44, w=o.w||9;
    let s='';
    for(let i=0;i<rows;i++){
      const y=(o.top||14)+i*(o.gap||24);
      for(let x=-30;x<128;x+=per){
        const k=i*7+Math.round(x);
        s+=ribbon(x,y,x+per*0.34,y-(o.amp||17)*(0.8+0.4*rnd(k)),x+per*0.72,y-2,
          w*0.25,w,w*0.9,c);
        /* the curl the crest throws forward */
        s+=ribbon(x+per*0.72,y-2,x+per*0.86,y-(o.amp||17)*0.55,x+per*0.66,y-(o.amp||17)*0.34,
          w*0.9,w*0.6,w*0.12,c);
      }
    }
    return s;
  }
};
Object.keys(ORGANIC).forEach(function(k){ PRIM[k]=ORGANIC[k]; });


/* ============================================================
   FIELD NATIVE PRIMITIVES.

   Eight clubs were all being drawn by `stripes` at different
   angles, which is how a system starts looking like one texture
   in thirty two colourways. These three break that up, and two
   of them are things that only exist on a football field.
   ============================================================ */
PRIM.hashes=function(o,c){
  /* The sideline hash marks. Short ticks, in rows, exactly as they are painted. */
  const step=o.step||15, len=o.len||11, w=o.w||4.2;
  let s='';
  for(let y=2;y<106;y+=step){
    s+='<rect x="-10" y="'+y+'" width="120" height="'+(w*0.55)+'" fill="'+c+'"/>';
    for(let x=4;x<106;x+=step) s+='<rect x="'+x+'" y="'+(y+6)+'" width="'+w+'" height="'+len+
      '" rx="'+(w/2)+'" fill="'+c+'"/>';
  }
  return s;
};
PRIM.snow=function(o,c){
  /* Flurries. Buffalo is the one club whose weather is part of its identity. */
  const n=o.n||46;
  let s='';
  for(let i=0;i<n;i++){
    const x=rnd(i*3+1)*112-6, y=rnd(i*7+5)*112-6, r=1.6+rnd(i*11+3)*4.4;
    s+='<circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="'+r.toFixed(2)+'" fill="'+c+'"/>';
  }
  return s;
};
PRIM.sunburst=function(o,c){
  /* Rays from a point, alternating long and short. Nothing else in the thirty two is radial,
     and Miami is the one city whose sun is as much of a cliche as its water. */
  const n=o.n||16, cx=o.cx||50, cy=o.cy||52, r0=o.r0||14, r1=o.r1||78;
  let s='';
  for(let i=0;i<n;i++){
    const a=(360/n)*i, len=r1*(i%2?0.72:1);
    s+='<polygon points="'+
      (cx-(o.w||7)/2).toFixed(2)+','+cy+' '+(cx+(o.w||7)/2).toFixed(2)+','+cy+' '+
      cx+','+(cy-len).toFixed(2)+
      '" fill="'+c+'" transform="rotate('+a+' '+cx+' '+cy+')"/>';
  }
  return s+'<circle cx="'+cx+'" cy="'+cy+'" r="'+r0+'" fill="'+c+'"/>';
};
PRIM.columns=function(o,c){
  /* A colonnade. Even shafts with a capital and a base, which is a different object from
     a stripe even though both are vertical. */
  const n=o.n||5, w=o.w||10, gap=100/n;
  let s='';
  for(let i=0;i<n;i++){
    const x=i*gap+(gap-w)/2;
    s+='<rect x="'+x+'" y="26" width="'+w+'" height="52" fill="'+c+'"/>'+
      '<rect x="'+(x-2.4)+'" y="20" width="'+(w+4.8)+'" height="7" rx="2" fill="'+c+'"/>'+
      '<rect x="'+(x-2.4)+'" y="77" width="'+(w+4.8)+'" height="7" rx="2" fill="'+c+'"/>';
  }
  return s;
};

/* THIRTY TWO CONFIGURATIONS. `n` is the name, `why` is the reference, and every one of them
   is a real thing about that club: what is on the sleeve, what is on the city's flag, what the
   animal leaves behind. No logos. */
const CLUB_PATTERN={
  ARI:{n:'Feather tips',layers:[{k:'feathers',o:{r:14,rows:7,pack:1,lean:7}}]},
  ATL:{n:'Open wing',layers:[{k:'wing',o:{rows:4,per:6,len:18,grow:5,r0:26,gap:21}}]},
  BAL:{n:'Feathered field',layers:[{k:'feathers',o:{r:13,rows:7,pack:1,lean:-6}}]},
  BUF:{n:'Flurries',why:'Buffalo. The only club whose weather is half its identity.',
    layers:[{k:'snow',o:{n:52}}]},
  CAR:{n:'Claw marks',layers:[{k:'slashes',o:{n:4,sp:22,angle:14,w:12,len:60,bend:13,x0:14,wob:7}}]},
  CHI:{n:'City flag',why:'The Chicago flag: two bars, four six pointed stars, in that order.',
    layers:[{k:'stripes',o:{bands:[[13,9],[78,9]]}},
    {k:'stars',o:{pts:6,at:[[18,50,13],[39,50,13],[61,50,13],[82,50,13]]}}]},
  CIN:{n:'Tiger stripes',why:'The one club whose jersey is the animal rather than a picture of it.',
    layers:[{k:'slashes',o:{n:6,sp:16,angle:4,w:11,len:88,bend:12,x0:6,wob:9,alt:true}}]},
  CLE:{n:'The bare stripe',layers:[{k:'stripes',o:{angle:90,bands:[[42,16]]}}]},
  DAL:{n:'Star field',layers:[{k:'stars',o:{at:[[24,24,15],[76,24,15],[50,50,19],[24,76,15],[76,76,15]]}}]},
  DEN:{n:'Mountain range',why:'The ridge line off the jersey shoulder, and the one out the window.',
    layers:[{k:'zigzag',o:{rows:3,amp:20,per:34,w:9,top:22,gap:28}}]},
  DET:{n:'Claw slashes',layers:[{k:'slashes',o:{n:3,sp:27,angle:20,w:15,len:68,bend:15,x0:18,wob:6}}]},
  GB:{n:'Hash marks',why:'The oldest field in the league, painted the way every field is.',
    layers:[{k:'hashes',o:{step:16,len:11,w:4.4}}]},
  HOU:{n:'Lone star',layers:[{k:'stars',o:{at:[[50,50,40]]}}]},
  IND:{n:'Horseshoes',layers:[{k:'arcs',o:{at:[[50,62]],rs:[20,36],w:10,a0:186,a1:-6}}]},
  JAX:{n:'Spots',layers:[{k:'blobs',o:{step:27,r:10}}]},
  KC:{n:'Arrowheads',layers:[{k:'chevrons',o:{n:5,sp:22,w:9,drop:22,angle:180}}]},
  LAC:{n:'Bolts',why:'The helmet bolt, scattered across the field instead of centred on it.',
    layers:[{k:'bolts',o:{at:[[24,26,.56],[62,44,.56],[34,74,.56],[80,82,.44]]}}]},
  LAR:{n:'Horns',layers:[{k:'spiral',o:{at:[[27,42],[73,42]],turns:1.45,r0:3,r1:25,w:8,a0:150,mirror:true}}]},
  LV:{n:'Silver mesh',layers:[{k:'grid',o:{step:24,w:6}}]},
  MIA:{n:'Sunburst',why:'Miami. The one city whose sun is as much of a cliche as its water.',
    layers:[{k:'sunburst',o:{n:16,w:8,r0:13,r1:80}}]},
  MIN:{n:'Braid',layers:[{k:'zigzag',o:{rows:4,amp:14,per:28,w:8,top:16,gap:25}},
    {k:'zigzag',o:{rows:4,amp:-14,per:28,w:8,top:16,gap:25,phase:14}}]},
  NE:{n:'Flag',layers:[{k:'stripes',o:{bands:[[56,9],[71,9],[86,9]]}},
    {k:'stars',o:{at:[[24,24,14],[52,18,14],[78,28,14],[36,46,12],[66,48,12]]}}]},
  NO:{n:'Crescent',layers:[{k:'crescent',o:{r:42,r2:38,dx:22,dy:-10}}]},
  NYG:{n:'Skyline',layers:[{k:'bars',o:{h:[34,58,44,74,38,66,50,30]}}]},
  NYJ:{n:'Jet trails',layers:[{k:'stripes',o:{angle:-58,bands:[[14,6],[31,6],[48,6],[65,6],[82,6]]}}]},
  PHI:{n:'Wing feathers',layers:[{k:'wing',o:{rows:4,per:6,len:17,grow:5,r0:24,gap:20,a0:-92,spread:88}}]},
  PIT:{n:'Sleeve stripes',why:'The three sleeve stripes, held at the angle a sleeve actually sits.',
    layers:[{k:'stripes',o:{angle:-24,bands:[[29,12],[46,6],[57,12]]}}]},
  SEA:{n:'Coastal angles',layers:[{k:'zigzag',o:{rows:4,amp:16,per:28,w:10,top:12,gap:26}}]},
  SF:{n:'Bridge cables',why:'The suspension, not the towers. Everybody draws the towers.',
    layers:[{k:'cables',o:{w:7,top:16,sag:44,deck:70}}]},
  TB:{n:'Rigging',why:'Ship rigging, as the knotted lattice it actually is.',
    layers:[{k:'grid',o:{step:26,w:6,knots:true}}]},
  TEN:{n:'Tri star',why:'Three stars off the Tennessee flag, kept at the spacing the flag gives them.',
    layers:[{k:'stars',o:{at:[[50,26,19],[28,64,19],[72,64,19]]}}]},
  WAS:{n:'Colonnade',why:'Washington, as the row of columns the city is built out of.',
    layers:[{k:'columns',o:{n:5,w:10}}]}
};

/* Draw a club's pattern: look up the config, run each layer's primitive. */
function clubPatternSVG(club,base,sec,ink,u){
  const cfg=CLUB_PATTERN[club];
  if(!cfg) return '';
  const c=patColour(base,sec,ink);
  return cfg.layers.map(function(L,i){ return PRIM[L.k](L.o||{},c,u+'l'+i); }).join('');
}

/* THE COLOURWAY LADDER. Rung 0 is a player who has never committed to a club, and it has
   to be a real design rather than a broken one. */
const SLATE=['#2b3550','#5b6b8c','#e8eefb','No club'];
const RUNGS=[
  { n:0, t:'No club yet', d:'Generic slate. No club colors at all, and it should still look like it was designed.' },
  { n:1, t:'Play a draft with it', d:'The club primary is yours. The ring stays neutral.' },
  { n:2, t:'Make the playoffs with it', d:'The club secondary unlocks and becomes the ring.' },
  { n:3, t:'Win the Super Bowl with it', d:'That club\'s own pattern unlocks.' }
];

/* ============================================================
   CENTRING, MEASURED RATHER THAN EYEBALLED.

   Every mark is hand placed on the 100 unit grid, and hand
   placed means several of them were not centred: the key sat
   nearly four units right of middle because its teeth only
   stick out one way, the crown three units low because its
   base is solid and its points are not, the banner three units
   right because the pole is at one end.

   Nudging fifteen sets of coordinates would fix today's set and
   guarantee the sixteenth mark is wrong again. So the renderer
   measures instead: each mark is drawn once into an offscreen
   SVG, its rendered box is read back, and the offset that puts
   that box in the middle is cached against the mark id.

   getBoundingClientRect rather than getBBox on purpose. getBBox
   returns the geometric box and ignores stroke width, and half
   this set is strokes: the wheel's rim, the anchor's flukes,
   the key's bow, the whole of Goose Egg. Measuring the geometry
   and not the ink would leave every one of those off centre in
   the other direction.
   ============================================================ */
const SVGNS='http://www.w3.org/2000/svg';
let MEASURE=null;
const CENTRE={};
function markOffset(id){
  if(CENTRE[id]) return CENTRE[id];
  const m=MARKS[id];
  if(!m||id==='init') return (CENTRE[id]={x:0,y:0});
  if(!MEASURE){
    MEASURE=document.createElementNS(SVGNS,'svg');
    MEASURE.setAttribute('viewBox','0 0 100 100');
    MEASURE.setAttribute('width','100');
    MEASURE.setAttribute('height','100');
    /* Offscreen and invisible, but NOT display:none: a box with no layout measures zero. */
    MEASURE.style.cssText='position:absolute;left:-9999px;top:0;visibility:hidden';
    document.body.appendChild(MEASURE);
  }
  MEASURE.innerHTML='<g>'+m.draw('#ffffff','#888888','ms'+id)+'</g>';
  const g=MEASURE.firstChild;
  const a=g.getBoundingClientRect(), b=MEASURE.getBoundingClientRect();
  if(!a.width||!a.height) return (CENTRE[id]={x:0,y:0});
  return (CENTRE[id]={
    x:50-((a.left-b.left)+a.width/2),
    y:50-((a.top-b.top)+a.height/2)
  });
}

/* ============================================================
   THE RENDERER. One function, one string, any size.
   ============================================================ */
let UID=0;
function crest(o){
  o=o||{};
  const size=o.size||64;
  const club=CLUBS[o.club]?o.club:'KC';
  const c=CLUBS[club];
  /* THE COLOURWAY LADDER. rung 0 is slate, 1 unlocks the primary, 2 unlocks the secondary,
     3 unlocks the pattern. Resolving it HERE rather than at the callers is the same argument
     as the size rule: one place decides, and nothing downstream can render a colour the
     player has not earned. */
  const rung=o.rung===undefined?3:o.rung;
  const base=rung>=1?c[0]:SLATE[0];
  const second=rung>=2?c[1]:(rung>=1?SLATE[1]:SLATE[1]);
  const inkPick=rung>=1?fieldInk(c[0],c[2]):{ ink:SLATE[2], k:1 };
  /* forceInk exists for one strip on this page: the old behaviour, where the club's own
     contrast colour was used whatever the gradient did to it. Nothing else passes it. */
  const ink=o.forceInk?o.forceInk:(rung>=1?inkPick.ink:SLATE[2]);
  const flat=!!o.flat;
  /* THE SIZE RULE, enforced by the renderer rather than by every caller remembering it. */
  const rich=size>=40;
  /* The seal is detail, so the board row does not get one. Same rule as the pattern. */
  const tier=rich?(o.tier?tierAt(o.tier):null):null;
  const ringId=rich?(o.ring||'club'):'club';
  /* A pattern is detail, and detail is the first thing the board row cannot hold. Below
     40px every crest falls back to the plain lit field. It is also the club's OWN pattern
     or nothing: there is no picking somebody else's. */
  const patOn=rich&&rung>=3&&o.pattern!==false&&!!CLUB_PATTERN[club];
  const u='c'+(++UID);
  const rw=size>=90?3.4:size>=56?4.2:size>=40?5:5.6;   /* in viewBox units, so it scales */
  /* An outer gold ring is ADDED, so the club ring moves inward by exactly its width rather
     than being replaced by it. */
  const gBase=size>=90?3:size>=56?3.4:3.8;
  /* The doubled ring needs room for two hairlines AND the gap between them, or the two
     collapse into one fat gold band and the honour above it stops reading as different. */
  const gw=ringId==='club'?0:gBase;
  const R=50-gw-rw/2;

  let defs='';
  let body='';

  if(flat){
    /* Today: a flat fill and a hard inner ring, drawn here only for comparison. */
    body+='<circle cx="50" cy="50" r="50" fill="'+base+'"/>';
    if(second) body+='<circle cx="50" cy="50" r="'+R+'" fill="none" stroke="'+second+
      '" stroke-width="'+rw+'"/>';
  }else{
    /* The lit field: the club primary, moved in luminance only. */
    const gk=o.forceInk?1:inkPick.k;
    defs+='<radialGradient id="f'+u+'" cx="34%" cy="26%" r="86%">'+
      '<stop offset="0" stop-color="'+lift(base,.26*gk)+'"/>'+
      '<stop offset=".46" stop-color="'+base+'"/>'+
      '<stop offset="1" stop-color="'+sink(base,.34*gk)+'"/></radialGradient>';
    defs+='<clipPath id="k'+u+'"><circle cx="50" cy="50" r="50"/></clipPath>';
    body+='<circle cx="50" cy="50" r="50" fill="url(#f'+u+')"/>';
    /* THE PATTERN, under everything else. Drawn in the club's own
       secondary, so it is club specific by construction and needs no per club artwork. */
    if(patOn){
      /* No mask, no alpha. The pattern colour is already guaranteed against the mark by
         patColour, so it can be painted flat with hard edges, which is the whole difference
         between a pattern and a smudge. */
      body+='<g clip-path="url(#k'+u+')">'+clubPatternSVG(club,base,second,ink,u)+'</g>';
    }
    /* A soft inner shadow at the lower right, so the disc sits in the page. */
    defs+='<radialGradient id="s'+u+'" cx="50%" cy="50%" r="50%">'+
      '<stop offset=".74" stop-color="#000" stop-opacity="0"/>'+
      '<stop offset="1" stop-color="#000" stop-opacity=".3"/></radialGradient>';
    body+='<circle cx="50" cy="50" r="50" fill="url(#s'+u+')"/>';
  }

  /* ---- the mark, or the initials ---- */
  const markId=o.mark||'init';
  if(markId==='init'||!MARKS[markId]){
    body+='<text x="50" y="50" text-anchor="middle" dominant-baseline="central" '+
      'font-family="Archivo, system-ui, sans-serif" font-weight="800" font-size="38" '+
      'letter-spacing="1" fill="'+ink+'">'+(o.text||'MW')+'</text>';
  }else{
    /* The accent is the ink knocked back toward the field, so a cut reads as a cut and not
       as a second colour fighting the first. */
    const accent=mix(ink,base,.46);
    /* Every mark is drawn full bleed on the 100 grid and then held back off the rim by one
       scale, so no shape has to know how thick the ring is. The measured offset goes on the
       end, in the mark's own coordinate space, so a shape never has to be centred by hand. */
    const off=markOffset(markId);
    body+='<g transform="translate(50 50) scale(.83) translate(-50 -50) translate('+
      off.x.toFixed(2)+' '+off.y.toFixed(2)+')" '+
      'opacity="'+(flat?'1':'.97')+'">'+MARKS[markId].draw(ink,accent,u)+'</g>';
  }

  /* ---- THE SHEEN. A band of light crossing the face, above the field, the pattern and the
     mark, and below the rim. It is the same object the glint is: a highlight, not a moving
     part. It is detail, so it obeys the size rule, and its delay is derived from the crest's
     own id so a page of crests never flashes in unison. ---- */
  if(!flat&&rich){
    defs+='<linearGradient id="h'+u+'" x1="0" y1="0" x2="1" y2="0">'+
      '<stop offset="0" stop-color="#ffffff" stop-opacity="0"/>'+
      '<stop offset=".38" stop-color="#ffffff" stop-opacity=".3"/>'+
      '<stop offset=".62" stop-color="#ffffff" stop-opacity=".3"/>'+
      '<stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>';
    const delay=((UID*0.37)%1)*7.2;
    body+='<g clip-path="url(#k'+u+')"><g transform="rotate(18 50 50)">'+
      '<rect class="sheen" x="-84" y="-60" width="40" height="220" fill="url(#h'+u+')" '+
      'style="animation-delay:'+delay.toFixed(2)+'s"/></g></g>';
  }

  /* ---- the rings. THE CLUB RING IS DRAWN FIRST AND ALWAYS, whatever the honour. ---- */
  if(!flat){
    if(second) body+='<circle cx="50" cy="50" r="'+R+'" fill="none" stroke="'+second+
      '" stroke-width="'+rw+'"/>';
    if(ringId!=='club'){
      defs+='<linearGradient id="r'+u+'" x1="0" y1="0" x2="0" y2="1">'+
        '<stop offset="0" stop-color="#ffe89a"/><stop offset=".5" stop-color="#f7c948"/>'+
        '<stop offset="1" stop-color="#b8860b"/></linearGradient>';
      const gR=50-gw/2;
      /* THE TWO ANIMATED ONES. The ring itself is solid and still, exactly like the gold
         one below it. What travels is a single highlight around the rim, which is what
         light does to metal, and which nothing else on a web page does. */
      if(ringId==='btb'||ringId==='perfect'){
        /* Back to back glints on the club's own secondary, so it stays the club's ring and
           only the light is the honour. Perfect glints on gold, faster, and is the only
           thing in the system that gets both. */
        const stroke=ringId==='perfect'?('url(#r'+u+')'):(second||'#ffffff');
        body+='<circle cx="50" cy="50" r="'+gR+'" fill="none" stroke="'+stroke+
          '" stroke-width="'+gw+'"/>';
        /* Across the arc's own bounding box, so the highlight peaks at the middle of the
           arc and reaches nothing at either end. No dashes, no gaps, no seam. */
        defs+='<linearGradient id="g'+u+'" x1="0" y1="0" x2="1" y2="0">'+
          '<stop offset="0" stop-color="#ffffff" stop-opacity="0"/>'+
          '<stop offset=".5" stop-color="#ffffff" stop-opacity=".92"/>'+
          '<stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>';
        const at=function(d){ const a=d*Math.PI/180;
          return (50+gR*Math.cos(a)).toFixed(2)+' '+(50+gR*Math.sin(a)).toFixed(2); };
        body+='<g class="glint'+(ringId==='perfect'?' fast':'')+'" style="transform-origin:50% 50%">'+
          '<path d="M'+at(-128)+'A'+gR+' '+gR+' 0 0 1 '+at(-52)+'" fill="none" stroke="url(#g'+u+
          ')" stroke-width="'+gw+'"/></g>';
      }else{
        body+='<circle cx="50" cy="50" r="'+gR+'" fill="none" stroke="url(#r'+u+
          ')" stroke-width="'+gw+'"/>';
      }
    }
    /* THE RIM LIGHT. The same hairline on all thirty two, which is what rescues the four
       clubs whose secondary is #000000 without recolouring anybody. */
    body+='<circle cx="50" cy="50" r="'+(50-.7)+'" fill="none" stroke="#ffffff" '+
      'stroke-opacity=".14" stroke-width="1.4"/>';
  }

  /* ---- the tier seal, struck into the lower right rim ---- */
  if(tier){
    const px=75, py=75, pr=17.5;
    if(tier.halo){
      /* GOAT is the only holographic one, and it is holographic because it is the only one
         that means every badge in the game. */
      defs+='<linearGradient id="p'+u+'" x1="0" y1="0" x2="1" y2="1">'+
        '<stop offset="0" stop-color="#FFD24A"/><stop offset=".22" stop-color="#ffffff"/>'+
        '<stop offset=".44" stop-color="#FFE680"/><stop offset=".62" stop-color="#9FE0FF"/>'+
        '<stop offset=".8" stop-color="#FFC0E6"/><stop offset="1" stop-color="#FFF2A0"/></linearGradient>';
    }else{
      defs+='<linearGradient id="p'+u+'" x1="0" y1="0" x2="0" y2="1">'+
        '<stop offset="0" stop-color="'+tier.a+'"/>'+
        '<stop offset=".52" stop-color="'+tier.mid+'"/>'+
        '<stop offset="1" stop-color="'+tier.b+'"/></linearGradient>';
    }
    body+='<g>'+
      /* The separator that makes the seal sit ON the crest rather than in it. Translucent
         black rather than the page background: a crest gets dropped on the board panel, the
         sunk profile card and the raised card, and a hardcoded background colour would show
         as a wrong coloured halo on two of the three. */
      '<circle cx="'+px+'" cy="'+py+'" r="'+(pr+3)+'" fill="#000" fill-opacity=".5"/>'+
      '<circle cx="'+px+'" cy="'+py+'" r="'+pr+'" fill="url(#p'+u+')"/>'+
      '<circle cx="'+px+'" cy="'+py+'" r="'+pr+'" fill="none" stroke="'+tier.edge+
        '" stroke-opacity=".55" stroke-width="1.6"/>'+
      /* the highlight that makes it struck metal rather than a coloured dot */
      '<path d="M'+(px-pr*.72)+' '+(py-pr*.34)+'a'+pr+' '+pr+' 0 0 1 '+(pr*1.44)+' 0" '+
        'fill="none" stroke="#ffffff" stroke-opacity=".42" stroke-width="2.4" stroke-linecap="round"/>'+
      '<g transform="translate('+px+' '+py+') scale('+(pr/50*.9)+') translate(-50 -50)">'+
        tierGlyph(tier,tier.edge)+'</g>'+
    '</g>';
  }

  /* THE xmlns IS NOT OPTIONAL. Inline in an HTML document the browser infers it and the
     crest renders fine without it. The moment the same string is handed to an Image as a
     data URI, which is the whole share image path below, a missing xmlns fails the load
     silently: no error, no onerror in some browsers, just nothing. */
  return '<svg xmlns="http://www.w3.org/2000/svg" class="crest" width="'+size+'" height="'+
    size+'" viewBox="0 0 100 100" aria-hidden="true" style="width:'+size+'px;height:'+size+'px">'+
    (defs?'<defs>'+defs+'</defs>':'')+body+'</svg>';
}


/* ============================================================
   WHAT THIS PLAYER HAS EARNED.

   Every unlock here is a badge the cabinet already evaluates. That is the whole design and
   it is worth being explicit about why: the alternative is a second copy of "did they go
   17-0" living in this file, and two copies of a rule is one rule and one bug waiting for
   the day they disagree. So the crest OWNS NO CONDITIONS. It reads earned badge ids out of
   the result achievements.js produced from the same rows, and the only thing it adds is
   which shape goes with which id.

   The one exception is the colourway ladder, which is not a badge because it is per club and
   there are thirty two of them. It is three flags read straight off the rows.
   ============================================================ */

/* mark id -> the badge that unlocks it. `null` is the monogram, which is nobody's
   consolation prize and is never locked. */
const MARK_BADGE={
  init:null,
  pad:'rating_100',            /* Video game numbers: build a team rated 100 or better */
  posts:'win_17',              /* Ran the table */
  egg:'winless',               /* The 2008 Lions */
  signal:'margin_17',          /* Running up the score */
  rafters:'title_streak_3',    /* Three-peat */
  wall:'def_ring',             /* Defense wins championships */
  headset:'trade_ring',        /* Deadline genius */
  clipboard:'trade_perfect',   /* Immaculate front office */
  ticket:'clubs_32',           /* Toured the league */
  crown:'perfect_1',           /* Perfect season */
  trophy:'title_1',            /* Champion */
  dog:'wildcard_ring'          /* Wild card run */
};

/* ring id -> the badge that grants it. Rings are AUTOMATIC: the best one earned is worn,
   there is nothing to pick, and that is what keeps them meaning what they say. */
const RING_BADGE=[
  { id:'perfect', badge:'perfect_1' },      /* go unbeaten and win it all */
  { id:'btb',     badge:'title_streak_2' }, /* titles in two straight seasons */
  { id:'gold',    badge:'title_1' }         /* a title */
];
/* The same table by id, because the picker asks "what does THIS one cost" and the loop above
   answers "which is the best one earned". Derived rather than written twice. */
const RING_BADGE_BY_ID={};
RING_BADGE.forEach(function(r){ RING_BADGE_BY_ID[r.id]=r.badge; });

/* THE LADDER, off the rows themselves.

   One Franchise is the only mode where you pick a club, so it is the only mode that can
   earn a club's colours: `run_mode === 'club'`. A row is one season with that club.

   Rung 1 is deliberately one draft rather than five. A colourway is the crest's identity
   and not a reward, and gating identity behind five sittings means a new player's first four
   runs are played by somebody who looks like nobody. There are two hard rungs above it. */
function clubRung(rows,club){
  if(!club) return 0;
  let rung=0;
  (rows||[]).forEach(function(r){
    if(!r||r.run_mode!=='club'||r.franchise!==club) return;
    if(rung<1) rung=1;
    if(isTrue(r.made_playoffs)&&rung<2) rung=2;
    if(isTrue(r.title_won)) rung=3;
  });
  return rung;
}
/* The database hands booleans back as true, 't' and 'true' depending on the path they came
   in by, which is why achievements.js has this function too. */
function isTrue(v){ return v===true||v===1||v==='t'||v==='true'||v==='1'; }

/*
 * Everything one player's crest needs, from the rows careerLoad already fetched and the
 * cabinet result those rows already produced.
 *
 * `res` may be null: a player whose defensive pool has not loaded, or whose cabinet threw,
 * still gets a crest. They get the monogram and no seal, which is true rather than empty.
 */
function unlocks(rows,res,club){
  const earned=new Set(((res&&res.earned)||[]).map(function(a){ return a.id; }));
  const marks=MARK_KEYS.filter(function(k){
    const b=MARK_BADGE[k];
    return !b||earned.has(b);
  });
  let ring='club';
  for(let i=0;i<RING_BADGE.length;i++){
    if(earned.has(RING_BADGE[i].badge)){ ring=RING_BADGE[i].id; break; }
  }
  const badges=((res&&res.earned)||[]).length;
  const t=tierFromBadges(badges);
  return {
    marks:marks, ring:ring, badges:badges, total:achTotal(),
    /* The whole earned list, not just the counts. The ring picker has to answer "do I have
       this one" for four rings rather than "which is my best", and recomputing that from
       rows a second time is a second place for it to be wrong. */
    earned:Array.from(earned),
    tier:t?t.id:null, rung:clubRung(rows,club), club:club||null
  };
}

/* The unlock line under a mark in the picker, taken from the badge itself rather than
   written out again here. Two copies of "win the title from a wild card seed" is two
   sentences to keep in step, and the badge's own wording is the one the player has already
   read in their cabinet. */
function markUnlock(key){
  const id=MARK_BADGE[key];
  if(!id) return { name:null, desc:'Yours from the start.', tier:null };
  const A=window.PS_ACH;
  const a=A&&A.CATALOG?A.CATALOG.filter(function(x){ return x.id===id; })[0]:null;
  return a?{ name:a.name, desc:a.desc, tier:a.tier }
          :{ name:null, desc:'', tier:null };
}

/* NO ENGINE, NO CREST. Every colourway in this file comes from E.TEAM_COLORS, so without it
   there is not one club to draw and crest() would throw on the first call. The page treats a
   missing PS_CREST as "draw the flat disc", which is exactly the right answer here, so the
   file declines to exist rather than existing and failing. */
if(!Object.keys(CLUBS).length) return;

window.PS_CREST={
  crest:crest, unlocks:unlocks, markUnlock:markUnlock, clubRung:clubRung,
  MARKS:MARKS, MARK_KEYS:MARK_KEYS, MARK_BADGE:MARK_BADGE,
  RINGS:RINGS, RUNGS:RUNGS, TIERS:TIERS, RING_BADGE_BY_ID:RING_BADGE_BY_ID,
  tierFromBadges:tierFromBadges, tierAt:tierAt, nextTierAt:nextTierAt, achTotal:achTotal,
  CLUB_PATTERN:CLUB_PATTERN, CLUBS:CLUBS
};

})();
