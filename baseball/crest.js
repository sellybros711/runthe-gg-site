/*
 * THE CREST, for Run The Diamond. A profile circle drawn rather than filled.
 * ============================================================================
 *
 * This is football/crest.js carried over to baseball, and the renderer (the layers, the size
 * rule, the measured centring, the tier seal and the honour rings) is that file's, unchanged.
 * What is baseball's own is everything that says which sport it is:
 *
 *   CLUBS         the thirty clubs playing today, out of RTD_ENGINE's TEAM_COLORS
 *   CLUB_PATTERN  one field per club, drawn from the same primitives football uses
 *   MARKS         twelve baseball shapes and the monogram, each opened by a baseball badge
 *   RING_BADGE    a title, back to back titles, and a season of 117 wins or more
 *   TIER_AT       the rank ladder, cut for a cabinet of about two hundred
 *   clubRung      read off this game's own run rows
 *
 * A COPY RATHER THAN A SHARED FILE, deliberately. football/crest.js reads PS_ENGINE and
 * PS_ACH at load and is live on the NFL game, and teaching it a second sport means every
 * baseball change is a change to a shipped football file. The cost is that a fix to the
 * renderer has to be made twice, and the note above each copy says so.
 *
 * NOTHING HERE TALKS TO THE NETWORK. `unlocks()` takes the rows and returns what that player
 * has earned; `crest()` takes a state and returns a string.
 *
 * Exposes window.RTD_CREST.
 */
(function(){
'use strict';

const E=window.RTD_ENGINE||null;

/* ============================================================
   THE COLOURWAYS, straight out of the engine rather than copied.
   [primary, secondary, contrast ink, nickname]

   A second table of thirty two hex pairs is a second table to keep in step with the first,
   and the first one already exists. E.teamColors also decides the `on` colour, which is the
   ink every mark is drawn in, so taking it from there means the crest and everything else
   in the game that writes on a club colour agree by construction.
   ============================================================ */
const CLUBS={};
/* THE THIRTY PLAYING TODAY, which is also what the franchise picker offers. The Athletics are
   keyed ATH in the franchise table and their colours are still filed under OAK. */
const CLUB_NAMES={
  ARI:'Diamondbacks',ATH:'Athletics',ATL:'Braves',BAL:'Orioles',BOS:'Red Sox',CHC:'Cubs',
  CHW:'White Sox',CIN:'Reds',CLE:'Guardians',COL:'Rockies',DET:'Tigers',HOU:'Astros',
  KCR:'Royals',LAA:'Angels',LAD:'Dodgers',MIA:'Marlins',MIL:'Brewers',MIN:'Twins',
  NYM:'Mets',NYY:'Yankees',PHI:'Phillies',PIT:'Pirates',SDP:'Padres',SEA:'Mariners',
  SFG:'Giants',STL:'Cardinals',TBR:'Rays',TEX:'Rangers',TOR:'Blue Jays',WSN:'Nationals'
};
/* The ink a mark is drawn in: white or near black, whichever reads on the primary. */
function inkOn(hex){ return lum(hex)>0.36?'#111418':'#ffffff'; }
function buildClubs(){
  const cur=(E&&E.CURRENT_FRANCHISES)||Object.keys(CLUB_NAMES);
  cur.forEach(function(k){
    const c=E&&E.teamColors?E.teamColors(k==='ATH'?'OAK':k):null;
    if(!c) return;
    CLUBS[k]=[c[0],c[1],inkOn(c[0]),CLUB_NAMES[k]||k];
  });
}
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
    note:'Your two letters. It stays the default forever and it is nobody\'s consolation prize.',
    tier:null, draw:function(){ return ''; } },

  /* THE BALL. Two seams bowing apart, each laced with a row of V stitches that point
     away from it, which is the detail that stops a circle with two lines on it from
     reading as a tennis ball. */
  ball:{ name:'The Ball', t:'The Ball', tier:'bronze',
    draw:function(f,a){
      let s='<circle cx="50" cy="50" r="38" fill="'+f+'"/>'+
        '<path d="M28 20 C44 36 44 64 28 80" fill="none" stroke="'+a+'" stroke-width="3.2" stroke-linecap="round"/>'+
        '<path d="M72 20 C56 36 56 64 72 80" fill="none" stroke="'+a+'" stroke-width="3.2" stroke-linecap="round"/>';
      for(let i=0;i<7;i++){
        const t=(i+0.5)/7, y=20+t*60;
        const x=28+3*(1-t)*(1-t)*t*0+ (function(){const u=1-t;return u*u*u*28+3*u*u*t*44+3*u*t*t*44+t*t*t*28;})()-28;
        s+='<path d="M'+(x+4.5).toFixed(1)+' '+(y-3.2).toFixed(1)+' l-4.5 3.2 l4.5 3.2" fill="none" stroke="'+a+'" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>';
        s+='<path d="M'+(100-x-4.5).toFixed(1)+' '+(y-3.2).toFixed(1)+' l4.5 3.2 l-4.5 3.2" fill="none" stroke="'+a+'" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>';
      }
      return s;
    } },

  /* THE CAP. Three-quarter view: a six panel crown with its seams running to the
     button, a band, and a brim that curves toward the camera with its underside shown. */
  cap:{ name:'The Cap', t:'The Cap', tier:'silver',
    draw:function(f,a){
      return '<path d="M14 64 C12 38 28 20 50 18 C70 17 84 30 86 52 L86 64 Z" fill="'+f+'"/>'+
        '<path d="M50 19 C44 30 42 46 42 64" fill="none" stroke="'+a+'" stroke-width="2.4"/>'+
        '<path d="M52 19 C62 30 68 44 70 64" fill="none" stroke="'+a+'" stroke-width="2.4"/>'+
        '<path d="M50 19 C34 28 24 44 22 64" fill="none" stroke="'+a+'" stroke-width="2" opacity=".7"/>'+
        '<ellipse cx="51" cy="18.5" rx="5" ry="3.2" fill="'+f+'" stroke="'+a+'" stroke-width="2"/>'+
        '<rect x="13" y="60" width="74" height="6" rx="2" fill="'+a+'"/>'+
        '<path d="M40 64 C58 60 84 60 96 66 C92 78 70 84 44 78 C38 76 36 68 40 64 Z" fill="'+f+'"/>'+
        '<path d="M44 76 C62 80 84 78 94 70" fill="none" stroke="'+a+'" stroke-width="2.4" stroke-linecap="round"/>';
    } },

  /* THE PENNANT. A long flag on a pole, with a bar at the hoist and a star, tied on
     at two points. October in one shape. */
  pennant:{ name:'The Pennant', t:'The Pennant', tier:'bronze',
    draw:function(f,a){
      return '<rect x="15" y="10" width="7" height="82" rx="3.5" fill="'+f+'"/>'+
        '<circle cx="18.5" cy="10" r="5" fill="'+f+'"/>'+
        '<path d="M22 20 L90 38 L22 58 Z" fill="'+f+'" stroke="'+f+'" stroke-width="3" stroke-linejoin="round"/>'+
        '<rect x="22" y="20" width="11" height="38" fill="'+a+'"/>'+
        poly(starPts(52,39,9,3.8,5,0),a)+
        '<rect x="13" y="23" width="11" height="4" rx="2" fill="'+a+'"/>'+
        '<rect x="13" y="51" width="11" height="4" rx="2" fill="'+a+'"/>';
    } },

  /* THE FIELD. The whole park from above: the fan of the outfield, the skin, the
     grass square inside it, the mound and four bags. */
  diamond:{ name:'The Field', t:'The Field', tier:'bronze',
    draw:function(f,a){
      return '<path d="M50 90 L10 50 A 57 57 0 0 1 90 50 Z" fill="'+f+'"/>'+
        '<path d="M50 84 L25 59 A 30 30 0 0 1 75 59 Z" fill="'+a+'"/>'+
        '<path d="M50 78 L36 64 L50 50 L64 64 Z" fill="'+f+'"/>'+
        '<circle cx="50" cy="64" r="3.6" fill="'+a+'"/>'+
        [[50,80],[34,64],[50,48],[66,64]].map(function(p){
          return '<rect x="'+(p[0]-3)+'" y="'+(p[1]-3)+'" width="6" height="6" fill="'+f+'" stroke="'+a+'" stroke-width="1.2" transform="rotate(45 '+p[0]+' '+p[1]+')"/>';
        }).join('')+
        '<path d="M50 90 L10 50 M50 90 L90 50" stroke="'+a+'" stroke-width="2" opacity=".6"/>';
    } },

  /* THE GLOVE. A fielder's mitt, palm on: four fingers in their stalls, a thumb, the
     web laced between them, and the pocket. The lacing is what makes it a glove and
     not a hand. */
  glove:{ name:'The Glove', t:'The Glove', tier:'gold',
    draw:function(f,a){
      /* the mitt, fingers fused into one rounded crown on the left, the thumb out to
         the right, the laced web filling the gap between them */
      let s='<path d="M32 90 C18 82 11 66 12 50 C13 34 20 20 32 14 C42 9 54 10 60 18 L62 36 L76 26 C83 22 91 27 90 36 C89 44 83 49 79 55 C81 71 74 84 62 90 Z" fill="'+f+'"/>'+
        /* the web: a lattice between the index finger and the thumb */
        '<path d="M60 18 L62 36 L76 26 C70 20 66 17 60 18 Z" fill="'+a+'"/>'+
        '<path d="M62 20 L66 32 M66 18.5 L69 29 M71 21 L72 27 M60.5 24 L72 22 M61.5 30 L74 25" stroke="'+f+'" stroke-width="1.7" stroke-linecap="round"/>'+
        /* the finger seams, radiating from the heel */
        '<path d="M20 26 C28 36 32 44 34 56 M30 15 C36 28 40 40 41 54 M44 11 C46 26 48 40 48 54 M57 14 C57 28 56 42 55 54" fill="none" stroke="'+a+'" stroke-width="2.4" stroke-linecap="round"/>'+
        /* the pocket and the heel */
        '<path d="M28 66 C38 76 56 76 70 62" fill="none" stroke="'+a+'" stroke-width="3" stroke-linecap="round"/>'+
        '<path d="M30 84 C42 91 56 91 64 86" fill="none" stroke="'+a+'" stroke-width="2.6" stroke-linecap="round"/>';
      /* lacing round the heel */
      [[22,74],[26,80],[18,64],[74,76],[78,68]].forEach(function(p){
        s+='<circle cx="'+p[0]+'" cy="'+p[1]+'" r="1.6" fill="'+a+'"/>';
      });
      return s;
    } },

  /* THE BATS. Two, crossed, tapered from barrel to handle, with grip tape at the
     knob, and a ball riding where they cross. */
  bats:{ name:'The Bats', t:'The Bats', tier:'silver',
    draw:function(f,a){
      const bat=function(rot){
        return '<g transform="rotate('+rot+' 50 54)">'+
          '<path d="M46.5 90 L47.6 56 C47.6 40 44.4 26 45.4 14 C46 7 54 7 54.6 14 C55.6 26 52.4 40 52.4 56 L53.5 90 Z" fill="'+f+'"/>'+
          '<rect x="44" y="88" width="12" height="5.5" rx="2.7" fill="'+f+'"/>'+
          '<path d="M47.2 70 L52.8 72 M47.3 75 L52.7 77 M47.4 80 L52.6 82" stroke="'+a+'" stroke-width="1.6"/>'+
          '<path d="M48.4 18 C48.4 30 49 40 49 50" stroke="'+a+'" stroke-width="1.4" opacity=".55" fill="none"/></g>';
      };
      return bat(-30)+bat(30)+
        '<circle cx="50" cy="30" r="11" fill="'+f+'" stroke="'+a+'" stroke-width="2"/>'+
        '<path d="M44 22 C47 27 47 33 44 38 M56 22 C53 27 53 33 56 38" fill="none" stroke="'+a+'" stroke-width="1.8"/>';
    } },

  /* HOME PLATE, with its depth: the white face and the edge below it, so it sits in
     the dirt rather than floating on it. */
  plate:{ name:'Home Plate', t:'Home Plate', tier:'gold',
    draw:function(f,a){
      return '<path d="M14 26 H86 V56 L50 84 L14 56 Z" fill="'+a+'"/>'+
        '<path d="M14 20 H86 V50 L50 78 L14 50 Z" fill="'+f+'"/>'+
        '<path d="M24 29 H76 V47 L50 67 L24 47 Z" fill="none" stroke="'+a+'" stroke-width="2.6" stroke-linejoin="round"/>';
    } },

  /* THE FLAME. Three tongues and a hot core. A run of days, which is what a streak is. */
  flame:{ name:'The Flame', t:'The Flame', tier:'gold',
    draw:function(f,a){
      return '<path d="M50 92 C28 92 16 78 17 60 C18 46 28 38 30 24 C38 32 40 40 40 46 C44 36 48 24 46 8 C62 18 72 34 70 48 C74 44 76 38 76 32 C84 42 86 54 84 64 C82 80 70 92 50 92 Z" fill="'+f+'"/>'+
        '<path d="M50 86 C38 86 31 78 32 68 C33 58 42 54 44 44 C52 50 54 56 53 62 C56 58 58 54 58 50 C64 56 67 64 66 71 C65 80 58 86 50 86 Z" fill="'+a+'"/>'+
        '<path d="M50 82 C45 82 42 78 43 74 C44 69 48 67 49 63 C54 67 57 71 56 75 C55 79 53 82 50 82 Z" fill="'+f+'"/>';
    } },

  /* THE STAR, faceted: every point split into a lit half and a shaded half, which is
     what turns a flat star into a struck one. */
  star:{ name:'The Star', t:'The Star', tier:'legend',
    draw:function(f,a){
      const outer=[],inner=[];
      for(let i=0;i<5;i++){
        const ao=(-90+i*72)*Math.PI/180, ai=(-90+36+i*72)*Math.PI/180;
        outer.push([50+42*Math.cos(ao),53+42*Math.sin(ao)]);
        inner.push([50+17*Math.cos(ai),53+17*Math.sin(ai)]);
      }
      let s=poly(starPts(50,53,42,17,5,0),f);
      for(let i=0;i<5;i++){
        const o=outer[i], ib=inner[(i+4)%5];
        s+='<path d="M50 53 L'+o[0].toFixed(1)+' '+o[1].toFixed(1)+' L'+ib[0].toFixed(1)+' '+ib[1].toFixed(1)+' Z" fill="'+a+'" opacity=".55"/>';
      }
      return s;
    } },

  /* THE TROPHY: a cup with two handles, a star struck on the bowl, a stem and a
     two-step plinth. */
  trophy:{ name:'The Trophy', t:'The Trophy', tier:'gold',
    draw:function(f,a){
      return '<path d="M26 16 C26 26 12 22 12 34 C12 46 26 50 32 50" fill="none" stroke="'+f+'" stroke-width="6" stroke-linecap="round"/>'+
        '<path d="M74 16 C74 26 88 22 88 34 C88 46 74 50 68 50" fill="none" stroke="'+f+'" stroke-width="6" stroke-linecap="round"/>'+
        '<path d="M24 12 H76 V28 C76 48 64 60 50 60 C36 60 24 48 24 28 Z" fill="'+f+'"/>'+
        '<rect x="24" y="12" width="52" height="5" fill="'+a+'"/>'+
        poly(starPts(50,34,11,4.5,5,0),a)+
        '<path d="M44 58 H56 L54 70 H46 Z" fill="'+f+'"/>'+
        '<rect x="34" y="70" width="32" height="7" rx="2" fill="'+f+'"/>'+
        '<rect x="26" y="78" width="48" height="11" rx="2.5" fill="'+f+'"/>'+
        '<rect x="34" y="82" width="32" height="3" rx="1.5" fill="'+a+'"/>';
    } },

  /* THE RING, a championship ring: the band, and a bezel big enough to carry a cut
     stone with its facets. */
  rings:{ name:'The Ring', t:'The Ring', tier:'gold',
    draw:function(f,a){
      return '<ellipse cx="50" cy="64" rx="27" ry="24" fill="none" stroke="'+f+'" stroke-width="9"/>'+
        '<path d="M27 72 C35 86 65 86 73 72" fill="none" stroke="'+a+'" stroke-width="2.2"/>'+
        '<path d="M24 34 L34 14 H66 L76 34 L66 48 H34 Z" fill="'+f+'"/>'+
        '<path d="M34 23 H66 L72 34 L64 42 H36 L28 34 Z" fill="'+a+'"/>'+
        '<path d="M36 23 L44 34 L36 42 M64 23 L56 34 L64 42 M44 34 H56 M50 23 L44 34 M50 23 L56 34 M50 42 L44 34 M50 42 L56 34" fill="none" stroke="'+f+'" stroke-width="1.6" stroke-linejoin="round"/>';
    } },

  /* THE CROWN: five points topped with pearls, a jewelled band, and an arch line
     inside so it reads as metal with depth rather than a zigzag. */
  crown:{ name:'The Crown', t:'The Crown', tier:'legend',
    draw:function(f,a){
      return '<path d="M12 72 L10 32 L28 48 L38 22 L50 44 L62 22 L72 48 L90 32 L88 72 Z" fill="'+f+'" stroke="'+f+'" stroke-width="2" stroke-linejoin="round"/>'+
        '<path d="M16 64 C30 58 70 58 84 64" fill="none" stroke="'+a+'" stroke-width="2.4"/>'+
        '<rect x="11" y="68" width="78" height="15" rx="3.5" fill="'+f+'"/>'+
        '<rect x="11" y="68" width="78" height="15" rx="3.5" fill="none" stroke="'+a+'" stroke-width="2"/>'+
        '<path d="M50 70.5 L55 75.5 L50 80.5 L45 75.5 Z" fill="'+a+'"/>'+
        '<circle cx="30" cy="75.5" r="3.4" fill="'+a+'"/><circle cx="70" cy="75.5" r="3.4" fill="'+a+'"/>'+
        '<circle cx="19" cy="75.5" r="2" fill="'+a+'"/><circle cx="81" cy="75.5" r="2" fill="'+a+'"/>'+
        [[10,32],[38,22],[62,22],[90,32]].map(function(p){
          return '<circle cx="'+p[0]+'" cy="'+(p[1]-3)+'" r="5" fill="'+f+'"/>';
        }).join('')+
        '<circle cx="50" cy="40" r="4.2" fill="'+a+'"/>';
    } }
};
const MARK_KEYS=['init','ball','pennant','diamond','cap','bats','glove','plate','flame',
  'trophy','rings','star','crown'];


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
   badge count climbs and it colours your name. Ten steps here
   rather than that game's five, and cut where this game's own
   players actually sit rather than at even fractions: see
   TIER_AT below. One number, one seal, nothing to pick.
   ============================================================ */
/* THE DENOMINATOR IS READ, NOT WRITTEN DOWN. The mock counted the cabinet once and put 387
   in a constant. The cabinet grows: every badge added to achievements.js would move every
   player's tier without anybody touching this file, and it would do it silently, because a
   tier that drifts down looks exactly like a tier that was never earned. So it is asked of
   the catalog that is actually installed, every time. */
/* AND IT MOVES ON ITS OWN NOW. Dynasty and Full Team keep their badges out of the catalog
   until their LIVE flags say the modes have launched, so this number steps up on the day one
   of them does. That is the behaviour that is wanted: GOAT means every badge in the game, and
   the game got bigger. Only the fallback below is written down, and it is only ever used when
   achievements.js failed to load at all, which is a state where the badge count is zero and
   the denominator changes nothing anybody sees. */
function achTotal(){
  const A=window.RTD_ACH;
  return (A&&A.CATALOGUE&&A.CATALOGUE.length)||206;
}
/* WHERE THE NINE STEPS ARE CUT, in badges, measured rather than divided.

   THEY USED TO BE NINTHS OF THE CATALOG: 43 apart, Silver 1 at 129, Gold 1 at 258, and the
   ladder ran all the way to 387. Against 376 real players wearing a rank that came out as
   two live rungs and seven decorative ones. Silver 1 and Silver 2 held 239 of them, 64% of
   everybody, and Gold 1, Gold 2, Gold 3 held nobody at all. Not "few". Zero, with the rung
   below holding 29, because a badge count near 258 is not a thing this cabinet produces:
   the deepest player on the board, at 1011 drafts, was still Silver 3.

   The thresholds below are cut from that distribution joined to drafts played, so a rank is
   a length of career rather than a fraction of a number:

     Bronze 1   0    your first draft
     Bronze 2   45   about 2 drafts
     Bronze 3   80   about 5
     Silver 1   110  about 13
     Silver 2   138  about 26
     Silver 3   165  about 55
     Gold 1     195  about 130
     Gold 2     225  about 280
     Gold 3     250  about 440

   The draft counts are the MEDIAN player at that badge count and nothing stronger. The
   spread around them is enormous: the query found somebody at 3071 drafts still sitting in
   the same band as somebody at 77, because past roughly 200 badges what is left is specific
   rosters rather than volume, and grinding does not get you there.

   ABSOLUTE NUMBERS, NOT FRACTIONS, and the comment above about the growing cabinet is the
   reason rather than an argument against. Ninths meant every badge added to achievements.js
   moved the whole board DOWN a fraction of a step, and a rank that goes backwards is a rank
   somebody earned and then lost to a release note. Absolute steps drift the other way: a
   bigger cabinet makes the ladder slightly cheaper, which costs nothing anybody can feel.
   Only GOAT stays proportional, because GOAT is not a threshold, it is every badge there is.

   REFIT, DO NOT NUDGE. These came out of one query against the live board. If the cabinet
   changes shape, run it again rather than moving one number:
     select coalesce(crest_tier,'(none)'), count(*) from profiles group by 1; */
/* BASEBALL'S LADDER. Football's thresholds were cut from its live board against a cabinet of
   about four hundred. This cabinet is about two hundred, and nobody has worn a baseball rank
   yet, so these are football's steps scaled to the catalogue. REFIT against real profiles
   once there are some: select crest_tier, count(*) from rtd_profiles group by 1. */
const TIER_AT=[0,24,42,58,73,87,103,119,132];

/* TEN RANKS, THREE METALS AND A STAR.

   Five steps was too coarse for a cabinet of nearly four hundred: the gap between Bronze and
   Silver was ninety badges, which is most of a year, and nothing moved on the crest for any
   of it. Three chevrons inside each metal turns one long climb into nine short ones, and the
   chevron count is the rank, which is why it goes 1, 2, 3 and not a different glyph each
   time. GOAT keeps the star because it is the only rank that means every badge in the game,
   and a star is the only shape here that is not a count of something. */
const METAL={
  bronze:{ a:'#F6CE98', b:'#7a481f', mid:'#C77B3A', edge:'#5e2f0f' },
  silver:{ a:'#ffffff', b:'#7f868d', mid:'#CFD3D8', edge:'#48525f' },
  gold:  { a:'#FFF7C2', b:'#9a6c12', mid:'#F4C430', edge:'#6b4703' }
};
const TIERS=[];
[['bronze','Bronze'],['silver','Silver'],['gold','Gold']].forEach(function(m){
  for(let n=1;n<=3;n++){
    const t={ id:m[0]+n, name:m[1]+' '+n, metal:m[0], pips:n };
    Object.keys(METAL[m[0]]).forEach(function(k){ t[k]=METAL[m[0]][k]; });
    TIERS.push(t);
  }
});
TIERS.push({ id:'goat', name:'GOAT', metal:'goat',
  a:'#FFD24A', b:'#FFC0E6', mid:'#FFF2A0', edge:'#6b4703', pips:0, star:true, holo:true });

/* GOAT is every badge. Below it the nine steps are the table above.

   THERE IS NO FLOOR ANY MORE. There was one, at five badges, and it never did the job it was
   written for: a single finished draft is already sixteen badges, so the only accounts it
   ever caught were ones with no runs at all, which have no row on any board to draw a seal
   on. What it did instead was leave a signed-in player's own profile showing a rank strip
   that said "not ranked yet" at a moment when nothing was wrong. Everybody who has an
   account starts at Bronze 1 and climbs from there. */
function tierFromBadges(b){
  b=+b||0;
  if(b>=achTotal()) return TIERS[9];
  let i=0;
  while(i+1<TIER_AT.length&&b>=TIER_AT[i+1]) i++;
  return TIERS[i];
}
function tierAt(id){ return TIERS.filter(function(t){ return t.id===id; })[0]||null; }
/* What the next step costs, for a "24 to Silver 1" line. */
function nextTierAt(i){
  return i>=TIER_AT.length-1?achTotal():TIER_AT[i+1];
}

/* The glyph inside the seal. Chevrons count the rank inside the metal, and the star belongs
   to GOAT alone.

   NO RING OF ITS OWN, at any rank. The star used to carry one, and a ring drawn on a badge
   that is struck into the rim of a circle reads as a ring around the circle: the tier looked
   like it was decorating the club's edge rather than sitting on it. The tier is the little
   disc and nothing else.

   The stack is NOT centred by these coordinates and does not try to be. One chevron, two and
   three have three different ink heights, and the offset that centres each is measured off
   the rendered shape below, the same way every mark is. */
function tierGlyph(t,col){
  if(t.star) return poly(starPts(50,50,32,13,5,0),col);
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
    note:'The default, and thirty of them.',
    rare:'1.00', tier:null },
  { id:'gold', name:'The Ring', got:true, t:'The Ring',
    note:'Win a World Series. The club secondary is still there, in full, with the gold added outside it.',
    rare:'0.24', tier:'gold' },
  { id:'btb', name:'Back to Back', got:false, t:'Back to Back',
    note:'Win the World Series two seasons running. A highlight travels the outer ring.',
    rare:'0.014', tier:'legend', animated:true },
  { id:'perfect', name:'The Greatest', got:false, t:'The Greatest',
    note:'Win 117 games or more in a season. Gold, and the light never stops going round it.',
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
  ARI:{n:'Desert ridges',layers:[{k:'zigzag',o:{rows:3,amp:18,per:32,w:9,top:24,gap:28}}]},
  ATH:{n:'Sash',layers:[{k:'stripes',o:{angle:-32,bands:[[38,14],[58,6]]}}]},
  ATL:{n:'Sleeve bands',layers:[{k:'stripes',o:{angle:0,bands:[[30,8],[44,8],[58,8]]}}]},
  BAL:{n:'Feathered field',layers:[{k:'feathers',o:{r:13,rows:7,pack:1,lean:-6}}]},
  BOS:{n:'Scoreboard',why:'The hand turned board in left field, as the grid of slots it is.',
    layers:[{k:'grid',o:{step:22,w:5}}]},
  CHC:{n:'Ivy',why:'The outfield wall, which is leaves before it is brick.',
    layers:[{k:'blobs',o:{step:24,r:10}}]},
  CHW:{n:'Pinstripes',layers:[{k:'stripes',o:{angle:90,bands:[[14,3],[32,3],[50,3],[68,3],[86,3]]}}]},
  CIN:{n:'Sleeve stripes',layers:[{k:'stripes',o:{angle:0,bands:[[36,10],[54,10]]}}]},
  CLE:{n:'Lake chop',layers:[{k:'zigzag',o:{rows:4,amp:10,per:24,w:7,top:16,gap:24}}]},
  COL:{n:'Front range',why:'The mountains beyond the right field wall.',
    layers:[{k:'zigzag',o:{rows:3,amp:22,per:34,w:9,top:24,gap:28}}]},
  DET:{n:'Tiger stripes',layers:[{k:'slashes',o:{n:4,sp:22,angle:16,w:13,len:66,bend:14,x0:14,wob:7}}]},
  HOU:{n:'Lone star',layers:[{k:'stars',o:{at:[[50,50,40]]}}]},
  KCR:{n:'Fountains',why:'A city of fountains, and a ballpark with one in the outfield.',
    layers:[{k:'arcs',o:{at:[[50,72]],rs:[16,28,40],w:7,a0:200,a1:-20}}]},
  LAA:{n:'Halo',layers:[{k:'arcs',o:{at:[[50,50]],rs:[34],w:8,a0:0,a1:359}}]},
  LAD:{n:'Script sweep',layers:[{k:'stripes',o:{angle:-18,bands:[[46,9]]}}]},
  MIA:{n:'Sunburst',layers:[{k:'sunburst',o:{n:16,w:8,r0:13,r1:80}}]},
  MIL:{n:'Barley',layers:[{k:'chevrons',o:{n:5,sp:22,w:8,drop:20}}]},
  MIN:{n:'Twin rivers',layers:[{k:'zigzag',o:{rows:2,amp:12,per:30,w:8,top:34,gap:28}}]},
  NYM:{n:'Skyline',layers:[{k:'bars',o:{h:[34,58,44,74,38,66,50,30]}}]},
  NYY:{n:'Pinstripes',why:'The most famous stripes in the sport, and the only thing on the uniform that has never changed.',
    layers:[{k:'stripes',o:{angle:90,bands:[[10,2.5],[26,2.5],[42,2.5],[58,2.5],[74,2.5],[90,2.5]]}}]},
  PHI:{n:'Keystone',layers:[{k:'chevrons',o:{n:4,sp:24,w:9,drop:22,angle:180}}]},
  PIT:{n:'Bridges',why:'A city of bridges, and the one past the outfield wall.',
    layers:[{k:'cables',o:{w:7,top:16,sag:44,deck:70}}]},
  SDP:{n:'Sunset',layers:[{k:'arcs',o:{at:[[50,92]],rs:[20,34,48],w:8,a0:180,a1:0}}]},
  SEA:{n:'Compass',layers:[{k:'stars',o:{at:[[50,50,40]],pts:4}}]},
  SFG:{n:'Bay swell',layers:[{k:'zigzag',o:{rows:4,amp:12,per:30,w:8,top:14,gap:26}}]},
  STL:{n:'Birds on the bat',layers:[{k:'feathers',o:{r:15,rows:6,pack:1.05,lean:8}}]},
  TBR:{n:'Rays',layers:[{k:'sunburst',o:{n:10,w:7,r0:18,r1:80}}]},
  TEX:{n:'Lone star, barred',layers:[{k:'stripes',o:{angle:90,bands:[[0,30]]}},{k:'stars',o:{at:[[62,50,24]]}}]},
  TOR:{n:'Northern lattice',layers:[{k:'grid',o:{step:26,w:6,knots:true}}]},
  WSN:{n:'Colonnade',layers:[{k:'columns',o:{n:5,w:10}}]}
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
  { n:2, t:'Reach October with it', d:'The club secondary unlocks and becomes the ring.' },
  { n:3, t:'Win the World Series with it', d:'That club\'s own pattern unlocks.' }
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

/* Draw one lump of SVG on the 100 grid, read back where the ink actually landed, and return
   the offset that puts the middle of that ink at 50,50. Everything drawn inside a circle on
   this page goes through here: the marks, and the chevrons and star in the tier seal. */
function measureOffset(svg){
  if(!MEASURE){
    MEASURE=document.createElementNS(SVGNS,'svg');
    MEASURE.setAttribute('viewBox','0 0 100 100');
    MEASURE.setAttribute('width','100');
    MEASURE.setAttribute('height','100');
    /* Offscreen and invisible, but NOT display:none: a box with no layout measures zero. */
    MEASURE.style.cssText='position:absolute;left:-9999px;top:0;visibility:hidden';
    document.body.appendChild(MEASURE);
  }
  MEASURE.innerHTML='<g>'+svg+'</g>';
  const g=MEASURE.firstChild;
  const a=g.getBoundingClientRect(), b=MEASURE.getBoundingClientRect();
  if(!a.width||!a.height) return {x:0,y:0};
  return {
    x:50-((a.left-b.left)+a.width/2),
    y:50-((a.top-b.top)+a.height/2)
  };
}
function markOffset(id){
  if(CENTRE[id]) return CENTRE[id];
  const m=MARKS[id];
  if(!m||id==='init') return (CENTRE[id]={x:0,y:0});
  return (CENTRE[id]=measureOffset(m.draw('#ffffff','#888888','ms'+id)));
}
/* THE SEAL'S GLYPH, MEASURED THE SAME WAY, and it needed it more than the marks did. One
   chevron sat at the top of the disc, two straddled the middle and three hung off the
   bottom, because they are stacked from a fixed y and their ink height changes with the
   count. Every one of the ten now sits in the middle of its own disc. */
const GCENTRE={};
function glyphOffset(t){
  if(GCENTRE[t.id]) return GCENTRE[t.id];
  return (GCENTRE[t.id]=measureOffset(tierGlyph(t,'#ffffff')));
}

/* ============================================================
   THE RENDERER. One function, one string, any size.
   ============================================================ */
let UID=0;
function crest(o){
  o=o||{};
  const size=o.size||64;
  const club=CLUBS[o.club]?o.club:'NYY';
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
  /* THE SEAL IS THE ONE PIECE OF DETAIL THAT SURVIVES THE BOARD ROW, and it earns the
     exception. A pattern and a ring treatment are texture, and at 26px texture is a smudge.
     A rank is a fact about the person whose name is next to it, and the METAL carries it on
     its own: bronze, silver, gold and the holographic one are four different colours before
     they are four different glyphs. So the seal draws wherever the crest does, and the glyph
     inside it is what obeys the size rule instead. */
  const tier=o.tier?tierAt(o.tier):null;
  /* Chevrons and stars at 26px are mush, and mush over the mark is worse than nothing: it
     costs the shape that says WHO this is to say something the colour already said. */
  const sealGlyph=rich;
  /* THE HONOUR RING DRAWS AT EVERY SIZE, for the reason the seal does. It was gated to 40px
     with the pattern on the grounds that both are texture, and that was wrong about this
     one: a pattern is a surface treatment and this is a gold band around the outside, which
     is the single most visible thing on a 26px disc rather than the least. What it says is
     also a fact about the person and not a decoration: a title, two in a row, a perfect
     season. Dropping it on the board meant it never appeared on the board, which is the one
     screen where you are looking at other people. */
  const ringId=o.ring||'club';
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
    const place='translate(50 50) scale(.83) translate(-50 -50) translate('+off.x.toFixed(2)+' '+off.y.toFixed(2)+')';
    /* DEPTH, which is most of the difference between a stamped badge and a sticker.
       A soft copy of the mark sits under it, and the ink is lit from above: a
       gradient from the ink to a touch toward the field. Both are detail, so they
       obey the size rule, and a board row keeps the flat mark it can read. */
    let fill=ink;
    if(rich&&!flat){
      defs+='<linearGradient id="mi'+u+'" x1="0" y1="0" x2="0" y2="1">'+
        '<stop offset="0" stop-color="'+ink+'"/><stop offset="1" stop-color="'+mix(ink,base,.2)+'"/></linearGradient>';
      fill='url(#mi'+u+')';
      body+='<g transform="translate(0 2.4) '+place+'" opacity=".32">'+MARKS[markId].draw('#000','#000',u+'s')+'</g>';
    }
    body+='<g transform="'+place+'" '+
      'opacity="'+(flat?'1':'.97')+'">'+MARKS[markId].draw(fill,accent,u)+'</g>';
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
    /* WHERE THE SEAL SITS IS MEASURED, NOT CHOSEN, and these three numbers are the answer
       to one question: how far out and how big can it be without covering a single pixel of
       the mark or the monogram underneath it.

       It used to sit at 75,75 with a radius of 17.5, which left 0.88 units of clearance to
       the nearest ink and therefore covered eighteen units of it. On a monogram that is the
       second letter with a metal disc through it.

       The measurement is a pixel test, not a bounding box: each mark is rasterized at four
       device pixels per unit, diffed against the same crest with an empty monogram to get
       the mark's own ink, and every painted pixel's distance to a candidate centre is taken.
       A box would have been wrong by a wide margin here, because the paw and the crown both
       have an empty lower right corner that their box does not know about.

       Two constraints cross at 51.25 units out along the diagonal, and that crossing is what
       fixes all three numbers:
         push it further out and the 100 box clips it   (max radius 50 - d/root2)
         pull it in and the crown and the pad reach it  (clearance grows about 0.9 a unit)
       At the crossing there is room for 12.25 and it is drawn at 12, which leaves a quarter
       of a unit in hand and puts the separator's outer edge at 99.7 of 100.

       ONE SIZE AT EVERY SIZE now. The old pair existed because a seal that covered the mark
       covered proportionally more of a small one, and a seal that covers nothing has no
       reason to change. */
    const pr=12, px=86.2, py=86.2;
    /* The two decorative strokes were absolute, tuned against a radius of 17.5, and at 12
       they read as a thick band and a bright bar rather than an edge and a highlight. */
    const pk=pr/17.5;
    const go=sealGlyph?glyphOffset(tier):{x:0,y:0};
    if(tier.holo){
      /* GOAT is the only holographic one, and it is holographic because it is the only one
         that means every badge in the game. This is what makes it special now that the ring
         it used to carry is gone. */
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
      /* A HAIRLINE, NOT A RING. This separator was three units wide, which at the seal's
         position on the rim painted a dark arc across the club's own edge: the tier read as
         something done to the circle rather than a badge sitting on it. It is now just wide
         enough to stop the seal touching the field it sits on. */
      '<circle cx="'+px+'" cy="'+py+'" r="'+(pr+1.5)+'" fill="#000" fill-opacity=".42"/>'+
      '<circle cx="'+px+'" cy="'+py+'" r="'+pr+'" fill="url(#p'+u+')"/>'+
      '<circle cx="'+px+'" cy="'+py+'" r="'+pr+'" fill="none" stroke="'+tier.edge+
        '" stroke-opacity=".55" stroke-width="'+(1.6*pk).toFixed(2)+'"/>'+
      /* the highlight that makes it struck metal rather than a coloured dot */
      '<path d="M'+(px-pr*.72)+' '+(py-pr*.34)+'a'+pr+' '+pr+' 0 0 1 '+(pr*1.44)+' 0" '+
        'fill="none" stroke="#ffffff" stroke-opacity=".42" stroke-width="'+(2.4*pk).toFixed(2)+
        '" stroke-linecap="round"/>'+
      /* The glyph fills more of a smaller seal: at .9 of a radius of 12 three chevrons are
         mush even on the profile, which is the one place they are meant to be readable. */
      (sealGlyph
        ?'<g transform="translate('+px+' '+py+') scale('+(pr/50*1.06)+') translate(-50 -50) '+
          'translate('+go.x.toFixed(2)+' '+go.y.toFixed(2)+')">'+
          tierGlyph(tier,tier.edge)+'</g>'
        :'')+
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
  ball:'first_run',          /* Play ball */
  pennant:'made_playoffs',   /* October baseball */
  diamond:'fran_5',          /* Five clubs */
  cap:'runs_50',             /* Skipper */
  bats:'win_100',            /* Hundred-win club */
  glove:'link_dp',           /* Turn two */
  plate:'rating_85',         /* Stacked */
  flame:'streak_30',         /* A month straight */
  trophy:'win_title',        /* World Series Champions */
  rings:'title_3',           /* Three rings */
  star:'rating_95',          /* Nothing better exists */
  crown:'goat'               /* Greatest of all time */
};

/* ring id -> the badge that grants it. Rings are AUTOMATIC: the best one earned is worn,
   there is nothing to pick, and that is what keeps them meaning what they say. */
const RING_BADGE=[
  { id:'perfect', badge:'goat' },       /* 117 wins or more */
  { id:'btb',     badge:'btb_title' },  /* titles in two straight seasons */
  { id:'gold',    badge:'win_title' }   /* a World Series */
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
  return clubRungs(rows)[club]||0;
}
/* One Franchise is the only mode that picks a club, so a row with `franchise` set is one
   season with that club. The run row is camelCase (madePlayoffs, titleWon) because it is
   the page's own, and a board row is snake_case, so both are read. */
function clubRungs(rows){
  const out={};
  (rows||[]).forEach(function(r){
    if(!r||!r.franchise) return;
    const k=r.franchise;
    let v=Math.max(out[k]||0,1);
    if(isTrue(r.madePlayoffs)||isTrue(r.made_playoffs)) v=Math.max(v,2);
    if(isTrue(r.titleWon)||isTrue(r.title_won)) v=3;
    out[k]=v;
  });
  return out;
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
  const A=window.RTD_ACH;
  const a=A&&A.CATALOGUE?A.CATALOGUE.filter(function(x){ return x.id===id; })[0]:null;
  return a?{ name:a.name, desc:a.desc, tier:a.tier }
          :{ name:null, desc:'', tier:null };
}

/* NO ENGINE, NO CREST. Every colourway in this file comes from E.TEAM_COLORS, so without it
   there is not one club to draw and crest() would throw on the first call. The page treats a
   missing PS_CREST as "draw the flat disc", which is exactly the right answer here, so the
   file declines to exist rather than existing and failing. */
buildClubs();
if(!Object.keys(CLUBS).length) return;

window.RTD_CREST={
  crest:crest, unlocks:unlocks, markUnlock:markUnlock, clubRung:clubRung, clubRungs:clubRungs,
  MARKS:MARKS, MARK_KEYS:MARK_KEYS, MARK_BADGE:MARK_BADGE,
  RINGS:RINGS, RUNGS:RUNGS, TIERS:TIERS, RING_BADGE_BY_ID:RING_BADGE_BY_ID,
  tierFromBadges:tierFromBadges, tierAt:tierAt, nextTierAt:nextTierAt, achTotal:achTotal,
  CLUB_PATTERN:CLUB_PATTERN, CLUBS:CLUBS, CLUB_NAMES:CLUB_NAMES
};

})();
