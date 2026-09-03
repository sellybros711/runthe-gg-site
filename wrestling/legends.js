/* ============================================================
   RunTheRopes: Build-A-Wrestler Mentors (v1)
   ------------------------------------------------------------
   Legends of each era are MENTORS, not a draft pool. As your
   career progresses you unlock the right to train under them
   (gated by reputation + the era you came up in). Completing a
   mentorship is a multi-week career investment that pays out:
     • attr: a permanent boost to their signature strengths
     • move: you are TAUGHT their signature move

   Nothing here is purchasable. Mentorships are earned by
   climbing the card, exactly like attributes and moves.

   Attributes (0-100): power(po), technique(te), aerial(ae),
   charisma(ch), psychology(ps), toughness(to), stamina(st).
   rarity drives the reputation required to get in the door.
   ============================================================ */
window.RTR_ERAS = [
  { id:'golden',   name:'Golden Age',        years:'1984-1992', blurb:'Cartoon larger-than-life spectacle. Big men, bigger crowds.', accent:'#e0b341' },
  { id:'hardcore', name:'Hardcore Era',      years:'1993-1999', blurb:'Blood, tables and attitude. Anything goes.',                accent:'#C6392C' },
  { id:'ruthless', name:'Ruthless Aggression',years:'2000-2008',blurb:'Athletic, intense, main-event workhorses.',                 accent:'#7f9cc0' },
  { id:'modern',   name:'Modern Era',        years:'2009-now',  blurb:'Workrate, indie crossovers and global stars.',              accent:'#5bb083' },
  { id:'puro',     name:'Puroresu',          years:'Japan',     blurb:'Strong style. Stiff strikes, epic long-form matches.',      accent:'#d2687a' },
  { id:'lucha',    name:'Lucha Libre',       years:'Mexico',    blurb:'Masks, flight and family legacy.',                          accent:'#c79320' },
];

// helper shorthand for bonus objects: {po,te,ae,ch,ps,to,st}
window.RTR_LEGENDS = [
  // ================= GOLDEN AGE =================
  { id:'l_hogan', name:'Terry Bollea', era:'golden', rarity:'legendary',
    attr:{label:'Crowd Whisperer', b:{ch:14,po:10,to:6}}, move:{name:'Leg Drop', kind:'finisher', dmg:82, pop:95, style:'power'} },
  { id:'l_savage', name:'Randy Poffo', era:'golden', rarity:'legendary',
    attr:{label:'Elbow From the Heavens', b:{ch:12,ps:10,ae:8}}, move:{name:'Flying Elbow Drop', kind:'finisher', dmg:80, pop:92, style:'aerial'} },
  { id:'l_andre', name:'André Roussimoff', era:'golden', rarity:'legendary',
    attr:{label:'The Eighth Wonder', b:{po:18,to:12}}, move:{name:'Giant Splash', kind:'finisher', dmg:88, pop:84, style:'power'} },
    { id:'l_piper', name:'Roderick Toombs', era:'golden', rarity:'epic',
    attr:{label:'Loudmouth Mic Work', b:{ch:16,ps:8}}, move:{name:'Sleeper Hold', kind:'finisher', dmg:68, pop:74, style:'technical'} },
  { id:'l_steamboat', name:'Richard Blood', era:'golden', rarity:'epic',
    attr:{label:'The Dragon', b:{te:12,ps:12,ae:6}}, move:{name:'Flying Crossbody', kind:'signature', dmg:66, pop:76, style:'aerial'} },
  { id:'l_flair', name:'Richard Fliehr', era:'golden', rarity:'legendary',
    attr:{label:'Sixty-Minute Ring IQ', b:{ps:18,ch:12,te:6}}, move:{name:'Figure-Four Leglock', kind:'finisher', dmg:72, pop:88, style:'technical'} },
  { id:'l_dibiase', name:'Ted DiBiase', era:'golden', rarity:'rare',
    attr:{label:'Money Heel', b:{ch:10,ps:8,te:5}}, move:{name:'Cobra Clutch', kind:'finisher', dmg:70, pop:70, style:'technical'} },
  { id:'l_perfect', name:'Curt Hennig', era:'golden', rarity:'rare',
    attr:{label:'Perfect Execution', b:{te:12,ps:7,st:5}}, move:{name:'Fisherman Suplex', kind:'finisher', dmg:74, pop:72, style:'technical'} },
  { id:'l_jake', name:'Aurelian Smith Jr.', era:'golden', rarity:'rare',
    attr:{label:'Psychology Master', b:{ps:16,ch:6}}, move:{name:'DDT', kind:'finisher', dmg:72, pop:80, style:'technical'} },
  { id:'l_bulldog', name:'David Smith', era:'golden', rarity:'rare',
    attr:{label:'Powerhouse Athlete', b:{po:11,st:7,te:5}}, move:{name:'Running Powerslam', kind:'finisher', dmg:74, pop:70, style:'power'} },
  { id:'l_demolition', name:'Bill Eadie and Barry Darsow', era:'golden', rarity:'common',
    attr:{label:'Tag Team Brawler', b:{po:8,to:8}}, move:{name:'Decapitation Elbow', kind:'signature', dmg:62, pop:58, style:'power'} },

  // ================= HARDCORE ERA =================
  { id:'l_austin', name:'Steve Austin', era:'hardcore', rarity:'legendary',
    attr:{label:'Beer-Soaked Anarchy', b:{ch:18,to:10,ps:8}}, move:{name:'Stunner', kind:'finisher', dmg:84, pop:99, style:'brawl'} },
  { id:'l_rock', name:'Dwayne Johnson', era:'hardcore', rarity:'legendary',
    attr:{label:'Electric on the Mic', b:{ch:20,ps:8,po:6}}, move:{name:'Uranage Slam', kind:'finisher', dmg:80, pop:96, style:'power'} },
  { id:'l_taker', name:'Mark Calaway', era:'hardcore', rarity:'legendary',
    attr:{label:'Graveyard Presence', b:{ps:14,po:12,to:10}}, move:{name:'Kneeling Piledriver', kind:'finisher', dmg:88, pop:94, style:'power'} },
  { id:'l_hbk', name:'Michael Hickenbottom', era:'hardcore', rarity:'legendary',
    attr:{label:'Mr. Main Event', b:{ps:14,te:10,ae:10,ch:6}}, move:{name:'Superkick', kind:'finisher', dmg:82, pop:93, style:'strike'} },
  { id:'l_bret', name:'Bret Hart', era:'hardcore', rarity:'legendary',
    attr:{label:'Technical Excellence', b:{te:18,ps:12}}, move:{name:'Inverted Cloverleaf', kind:'finisher', dmg:76, pop:88, style:'technical'} },
  { id:'l_foley', name:'Mick Foley', era:'hardcore', rarity:'epic',
    attr:{label:'Hardcore Legend', b:{to:20,ps:10,ch:6}}, move:{name:'Mandible Claw', kind:'finisher', dmg:70, pop:82, style:'brawl'} },
  { id:'l_hhh', name:'Paul Levesque', era:'hardcore', rarity:'epic',
    attr:{label:'Backstage Politician', b:{ps:14,po:10,ch:8}}, move:{name:'Double Underhook Facebuster', kind:'finisher', dmg:80, pop:86, style:'technical'} },
  { id:'l_kane', name:'Glenn Jacobs', era:'hardcore', rarity:'epic',
    attr:{label:'Fire and Brimstone', b:{po:14,to:12}}, move:{name:'Chokeslam', kind:'finisher', dmg:82, pop:80, style:'power'} },
  { id:'l_rvd', name:'Robert Szatkowski', era:'hardcore', rarity:'epic',
    attr:{label:'Educated Feet', b:{ae:16,st:8,to:6}}, move:{name:'Diving Frog Splash', kind:'finisher', dmg:80, pop:86, style:'aerial'} },
  { id:'l_sabu', name:'Terry Brunk', era:'hardcore', rarity:'rare',
    attr:{label:'Homicidal Daredevil', b:{ae:12,to:14}}, move:{name:'Arabian Facebuster', kind:'signature', dmg:68, pop:72, style:'aerial'} },
  { id:'l_dudleys', name:'Mark LoMonaco and Devon Hughes', era:'hardcore', rarity:'rare',
    attr:{label:'Table Enthusiasts', b:{po:9,to:9}}, move:{name:'Double-Team Cutter', kind:'finisher', dmg:76, pop:78, style:'power'} },
  { id:'l_benoit', name:'Dean Simon', era:'hardcore', rarity:'rare',
    attr:{label:'Man of 1,000 Holds', b:{te:16,ps:6}}, move:{name:'Texas Cloverleaf', kind:'finisher', dmg:70, pop:64, style:'technical'} },

  // ================= RUTHLESS AGGRESSION =================
  { id:'l_cena', name:'John Cena', era:'ruthless', rarity:'legendary',
    attr:{label:'Marathon Main Eventer', b:{ch:16,po:12,st:8}}, move:{name:'Fireman\'s Carry Slam', kind:'finisher', dmg:82, pop:92, style:'power'} },
  { id:'l_orton', name:'Randy Orton', era:'ruthless', rarity:'legendary',
    attr:{label:'Strike From Nowhere', b:{ps:16,te:8,ch:8}}, move:{name:'Jumping Cutter', kind:'finisher', dmg:84, pop:94, style:'strike'} },
  { id:'l_eddie', name:'Eddie Guerrero', era:'ruthless', rarity:'legendary',
    attr:{label:'Crafty Veteran', b:{ch:14,te:12,ps:10}}, move:{name:'Frog Splash', kind:'finisher', dmg:80, pop:92, style:'aerial'} },
  { id:'l_angle', name:'Kurt Angle', era:'ruthless', rarity:'legendary',
    attr:{label:'Amateur Credentials', b:{te:20,st:8,to:6}}, move:{name:'Ankle Lock', kind:'finisher', dmg:78, pop:86, style:'technical'} },
  { id:'l_batista', name:'David Bautista', era:'ruthless', rarity:'epic',
    attr:{label:'Powerhouse Presence', b:{po:18,ch:6}}, move:{name:'Sitout Powerbomb', kind:'finisher', dmg:84, pop:82, style:'power'} },
  { id:'l_edge', name:'Adam Copeland', era:'ruthless', rarity:'epic',
    attr:{label:'Opportunist', b:{ps:12,ch:10,te:8}}, move:{name:'Spear', kind:'finisher', dmg:80, pop:86, style:'strike'} },
  { id:'l_jeff', name:'Jeff Hardy', era:'ruthless', rarity:'epic',
    attr:{label:'Daredevil', b:{ae:16,ch:10,to:8}}, move:{name:'Flipping Senton', kind:'finisher', dmg:80, pop:88, style:'aerial'} },
  { id:'l_rey', name:'Oscar Gutierrez', era:'ruthless', rarity:'legendary',
    attr:{label:'Master of the Ropes', b:{ae:20,te:8,ch:8}}, move:{name:'Tiger Feint Kick', kind:'finisher', dmg:74, pop:92, style:'aerial'} },
  { id:'l_shelton', name:'Shelton Benjamin', era:'ruthless', rarity:'rare',
    attr:{label:'Freak Athlete', b:{ae:10,te:10,st:6}}, move:{name:'T-Bone Suplex', kind:'signature', dmg:70, pop:66, style:'technical'} },
  { id:'l_booker', name:'Booker Huffman', era:'ruthless', rarity:'rare',
    attr:{label:'Five-Time Champion', b:{ch:10,te:8,st:6}}, move:{name:'Scissors Kick', kind:'signature', dmg:68, pop:72, style:'strike'} },
  { id:'l_jbl', name:'John Layfield', era:'ruthless', rarity:'rare',
    attr:{label:'Self-Proclaimed God', b:{po:10,ch:9,ps:6}}, move:{name:'Running Lariat', kind:'finisher', dmg:76, pop:74, style:'strike'} },
  { id:'l_cm', name:'Phil Brooks', era:'ruthless', rarity:'epic',
    attr:{label:'Straight Talk', b:{ch:14,ps:10,te:8}}, move:{name:'Fireman\'s Carry Knee', kind:'finisher', dmg:78, pop:88, style:'strike'} },

  // ================= MODERN =================
  // Mentors are the real people, not their trademarked ring characters. A wrestler
  // trains under the human being. The stage names on modern-era workers are almost
  // universally owned by their promotions.
  { id:'l_bryan', name:'Bryan Danielson', era:'modern', rarity:'legendary',
    attr:{label:'Crowd Chant', b:{te:18,ps:12,st:8}}, move:{name:'Running Knee', kind:'finisher', dmg:80, pop:92, style:'strike'} },
  { id:'l_seth', name:'Colby Lopez', era:'modern', rarity:'legendary',
    attr:{label:'Architect', b:{te:12,ae:12,ch:10}}, move:{name:'Stomp', kind:'finisher', dmg:82, pop:88, style:'strike'} },
  { id:'l_roman', name:'Joe Anoa\'i', era:'modern', rarity:'legendary',
    attr:{label:'Family Business', b:{ch:16,po:12,ps:10}}, move:{name:'Spear', kind:'finisher', dmg:84, pop:92, style:'power'} },
  { id:'l_becky', name:'Rebecca Quin', era:'modern', rarity:'legendary',
    attr:{label:'The Standard', b:{ch:16,te:10,ps:8}}, move:{name:'Fujiwara Armbar', kind:'finisher', dmg:74, pop:88, style:'technical'} },
  { id:'l_charlotte', name:'Ashley Fliehr', era:'modern', rarity:'epic',
    attr:{label:'Second Generation', b:{te:12,po:10,ch:8}}, move:{name:'Natural Selection', kind:'finisher', dmg:76, pop:80, style:'technical'} },
  { id:'l_aj', name:'Allen Jones', era:'modern', rarity:'legendary',
    attr:{label:'Effortless', b:{te:14,ae:14,ps:8}}, move:{name:'Belly-to-Back Facebuster', kind:'finisher', dmg:80, pop:86, style:'technical'} },
  { id:'l_omega', name:'Tyson Smith', era:'modern', rarity:'legendary',
    attr:{label:'Match Perfectionist', b:{ps:14,te:12,ae:10,st:8}}, move:{name:'Electric Chair Driver', kind:'finisher', dmg:88, pop:90, style:'power'} },
  { id:'l_mox', name:'Jonathan Good', era:'modern', rarity:'epic',
    attr:{label:'Unscripted', b:{to:16,ch:10,ps:6}}, move:{name:'Double Arm DDT', kind:'finisher', dmg:80, pop:82, style:'brawl'} },
  { id:'l_ospreay', name:'William Ospreay', era:'modern', rarity:'legendary',
    attr:{label:'Aerial Precision', b:{ae:22,te:10,st:8}}, move:{name:'Back Elbow Strike', kind:'finisher', dmg:84, pop:88, style:'strike'} },
  { id:'l_gunther', name:'Walter Hahn', era:'modern', rarity:'epic',
    attr:{label:'Chop Heavy', b:{po:14,ps:12,to:8}}, move:{name:'Powerbomb', kind:'finisher', dmg:82, pop:80, style:'power'} },
  { id:'l_rhea', name:'Demi Bennett', era:'modern', rarity:'epic',
    attr:{label:'Dominant Presence', b:{po:14,ch:10,to:8}}, move:{name:'Lifting Side Slam', kind:'finisher', dmg:80, pop:84, style:'power'} },
  { id:'l_mjf', name:'Maxwell Friedman', era:'modern', rarity:'epic',
    attr:{label:'Generational Heat', b:{ch:20,ps:10}}, move:{name:'Double Underhook Piledriver', kind:'finisher', dmg:74, pop:82, style:'technical'} },

  // ================= PURORESU =================
  { id:'l_misawa', name:'Mitsuharu Misawa', era:'puro', rarity:'legendary',
    attr:{label:'King\'s Road', b:{ps:18,to:12,st:10}}, move:{name:'Sit-Out Side Driver', kind:'finisher', dmg:86, pop:88, style:'power'} },
  { id:'l_kobashi', name:'Kenta Kobashi', era:'puro', rarity:'legendary',
    attr:{label:'Absolute Fighting Spirit', b:{to:18,po:12,st:10}}, move:{name:'Inverted Valley Driver', kind:'finisher', dmg:92, pop:90, style:'power'} },
  { id:'l_inoki', name:'Kanji Inoki', era:'puro', rarity:'epic',
    attr:{label:'Strong Style Origin', b:{ps:14,te:12}}, move:{name:'Enzuigiri', kind:'signature', dmg:68, pop:74, style:'strike'} },
  { id:'l_tanahashi', name:'Hiroshi Tanahashi', era:'puro', rarity:'legendary',
    attr:{label:'The Ace', b:{ch:14,ps:14,te:10}}, move:{name:'Top-Rope Frog Splash', kind:'finisher', dmg:80, pop:90, style:'aerial'} },
  { id:'l_okada', name:'Kazuchika Okada', era:'puro', rarity:'legendary',
    attr:{label:'Money Match', b:{ps:18,te:12,ch:8}}, move:{name:'Short-Arm Lariat', kind:'finisher', dmg:84, pop:92, style:'strike'} },
  { id:'l_naito', name:'Tetsuya Naito', era:'puro', rarity:'epic',
    attr:{label:'Unbothered', b:{ch:14,ps:10,te:8}}, move:{name:'Corkscrew Reverse DDT', kind:'finisher', dmg:80, pop:84, style:'technical'} },
  { id:'l_shibata', name:'Katsuyori Shibata', era:'puro', rarity:'epic',
    attr:{label:'Stiff Striker', b:{to:16,te:10}}, move:{name:'PK (Penalty Kick)', kind:'finisher', dmg:78, pop:78, style:'strike'} },
  { id:'l_liger', name:'Keiichi Yamada', era:'puro', rarity:'epic',
    attr:{label:'Junior Heavyweight King', b:{ae:16,te:12}}, move:{name:'Shooting Star Press', kind:'finisher', dmg:78, pop:84, style:'aerial'} },
  { id:'l_zsj', name:'Lucas Eatwell', era:'puro', rarity:'epic',
    attr:{label:'Submission Technician', b:{te:20,ps:8}}, move:{name:'Michinoku Driver', kind:'finisher', dmg:76, pop:78, style:'technical'} },
  { id:'l_ishii', name:'Tomohiro Ishii', era:'puro', rarity:'rare',
    attr:{label:'Brick Wall', b:{to:18,po:8}}, move:{name:'Brainbuster', kind:'finisher', dmg:78, pop:76, style:'power'} },
  { id:'l_suzuki', name:'Minoru Suzuki', era:'puro', rarity:'epic',
    attr:{label:'King of Pancrase', b:{te:14,to:12,ps:8}}, move:{name:'Gotch-Style Piledriver', kind:'finisher', dmg:82, pop:80, style:'technical'} },
  { id:'l_hashimoto', name:'Shinya Hashimoto', era:'puro', rarity:'rare',
    attr:{label:'Destroyer Kicks', b:{po:10,to:12}}, move:{name:'Vertical Drop DDT', kind:'signature', dmg:72, pop:70, style:'strike'} },

  // ================= LUCHA LIBRE =================
  { id:'l_santo', name:'Rodolfo Guzman', era:'lucha', rarity:'legendary',
    attr:{label:'The Silver Legend', b:{ch:18,ps:12,te:8}}, move:{name:'La De a Caballo', kind:'finisher', dmg:74, pop:94, style:'technical'} },
  { id:'l_blueDemon', name:'Blue Demon', era:'lucha', rarity:'epic',
    attr:{label:'Lucha Icon', b:{ch:12,te:10,to:6}}, move:{name:'Tope Suicida', kind:'signature', dmg:66, pop:78, style:'aerial'} },
  { id:'l_perro', name:'Pedro Aguayo', era:'lucha', rarity:'epic',
    attr:{label:'Rudo Brawler', b:{to:14,ch:10}}, move:{name:'Senton Bomb', kind:'finisher', dmg:74, pop:76, style:'aerial'} },
      { id:'l_dragon', name:'Yoshihiro Asai', era:'lucha', rarity:'epic',
    attr:{label:'Eight Belts', b:{te:14,ae:12}}, move:{name:'Asai Moonsault', kind:'signature', dmg:70, pop:78, style:'aerial'} },
  { id:'l_juvi', name:'Eduardo Gonzalez', era:'lucha', rarity:'rare',
    attr:{label:'Explosive Flyer', b:{ae:14,ch:8}}, move:{name:'450 Splash', kind:'finisher', dmg:76, pop:76, style:'aerial'} },
  { id:'l_psicosis', name:'Dionicio Castellanos', era:'lucha', rarity:'rare',
    attr:{label:'Reckless Flyer', b:{ae:13,to:8}}, move:{name:'Guillotine Legdrop', kind:'signature', dmg:68, pop:68, style:'aerial'} },
        { id:'l_dosCaras', name:'Dos Caras', era:'lucha', rarity:'rare',
    attr:{label:'Technical Lucha', b:{te:14,ps:6}}, move:{name:'Reverse Figure Four', kind:'signature', dmg:68, pop:66, style:'technical'} },
];
