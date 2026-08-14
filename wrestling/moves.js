/* ============================================================
   RunTheRopes — Build-A-Wrestler: Move Catalogue (v1)
   ------------------------------------------------------------
   Every move in the game is EARNED in career mode — never bought.
   You unlock a move when you meet BOTH gates:
     • the governing attribute threshold (req.attr / req.val)
     • category mastery, which grows by USING that category in matches

   8 categories × 5 tiers:
     T1 Fundamentals · T2 Refined · T3 Advanced · T4 Signature · T5 Finisher

   Fields: dmg (match impact), pop (crowd reaction), stam (stamina cost),
   risk (injury/botch exposure).
   ============================================================ */
window.RTR_MOVE_CATS = [
  { id:'strike',   name:'Strikes',        attr:'po', icon:'👊', blurb:'Punches, chops, kicks and knees.' },
  { id:'slam',     name:'Slams & Throws', attr:'po', icon:'💥', blurb:'Body slams, powerbombs, drivers.' },
  { id:'suplex',   name:'Suplexes',       attr:'te', icon:'🔄', blurb:'Amateur-rooted throws and bridges.' },
  { id:'submission',name:'Submissions',   attr:'te', icon:'🔒', blurb:'Holds that end matches without a pin.' },
  { id:'aerial',   name:'High-Flying',    attr:'ae', icon:'🦅', blurb:'Top-rope offence and dives.' },
  { id:'technical',name:'Chain & Counters',attr:'ps',icon:'🧠', blurb:'Ring IQ: reversals, counters, transitions.' },
  { id:'hardcore', name:'Hardcore',       attr:'to', icon:'🪑', blurb:'Brawling, weapons, punishment.' },
  { id:'showman',  name:'Showmanship',    attr:'ch', icon:'🎤', blurb:'Taunts, crowd work, theatrics.' },
];
window.RTR_TIERS = [
  { t:1, name:'Fundamentals', mastery:0,   color:'#b3a794' },
  { t:2, name:'Refined',      mastery:70,  color:'#6aa7c4' },
  { t:3, name:'Advanced',     mastery:200, color:'#5bb083' },
  { t:4, name:'Signature',    mastery:420, color:'#b08ac6' },
  { t:5, name:'Finisher',     mastery:750, color:'#e0b341' },
];

// req.val = governing attribute minimum. Mastery gate comes from the tier table.
const M = (id,cat,tier,name,dmg,pop,stam,risk,val)=>({id,cat,tier,name,dmg,pop,stam,risk,val});
window.RTR_MOVES = [
  // ================= STRIKES (power) =================
  M('s1a','strike',1,'Forearm Smash',      18,10, 4,0.02,0),
  M('s1b','strike',1,'Knife-Edge Chop',    20,14, 4,0.02,0),
  M('s1c','strike',1,'Body Kick',          19,11, 4,0.02,0),
  M('s2a','strike',2,'Running Elbow',      28,20, 6,0.03,38),
  M('s2b','strike',2,'European Uppercut',  27,18, 5,0.03,38),
  M('s2c','strike',2,'Roundhouse Kick',    30,24, 7,0.04,42),
  M('s3a','strike',3,'Discus Lariat',      42,34, 9,0.05,54),
  M('s3b','strike',3,'Superkick',          44,42, 8,0.04,56),
  M('s3c','strike',3,'Running Knee Strike',43,36, 9,0.05,55),
  M('s4a','strike',4,'Spinning Backfist',  55,50,11,0.06,66),
  M('s4b','strike',4,'Rolling Elbow',      57,54,11,0.06,68),
  M('s4c','strike',4,'Shining Wizard',     56,52,12,0.07,67),
  M('s5a','strike',5,'Buzzsaw Kick',       74,76,15,0.08,78),
  M('s5b','strike',5,'Lariat From Hell',   78,80,16,0.09,80),
  M('s5c','strike',5,'Knockout Knee',      80,84,16,0.09,82),

  // ================= SLAMS & THROWS (power) =================
  M('m1a','slam',1,'Body Slam',            18,10, 5,0.02,0),
  M('m1b','slam',1,'Scoop Slam',           19,11, 5,0.02,0),
  M('m1c','slam',1,'Hip Toss',             16, 9, 4,0.02,0),
  M('m2a','slam',2,'Sidewalk Slam',        29,18, 7,0.03,40),
  M('m2b','slam',2,'Spinebuster',          32,24, 8,0.04,44),
  M('m2c','slam',2,'Fireman\'s Carry Slam',30,20, 7,0.03,42),
  M('m3a','slam',3,'Powerslam',            44,32,10,0.05,56),
  M('m3b','slam',3,'Chokeslam',            48,40,11,0.06,60),
  M('m3c','slam',3,'Michinoku Driver',     46,36,10,0.06,58),
  M('m4a','slam',4,'Powerbomb',            60,56,13,0.08,70),
  M('m4b','slam',4,'Death Valley Driver',  58,52,12,0.07,68),
  M('m4c','slam',4,'Uranage',              57,50,12,0.07,67),
  M('m5a','slam',5,'Jackhammer',           78,78,16,0.10,80),
  M('m5b','slam',5,'Package Piledriver',   84,84,17,0.13,84),
  M('m5c','slam',5,'Burning Hammer',       90,92,19,0.16,88),

  // ================= SUPLEXES (technique) =================
  M('x1a','suplex',1,'Snap Suplex',        20,12, 5,0.02,0),
  M('x1b','suplex',1,'Vertical Suplex',    21,13, 6,0.02,0),
  M('x1c','suplex',1,'Belly-to-Belly',     20,12, 5,0.02,0),
  M('x2a','suplex',2,'German Suplex',      32,26, 8,0.04,42),
  M('x2b','suplex',2,'Northern Lights',    29,22, 7,0.03,40),
  M('x2c','suplex',2,'Exploder Suplex',    33,27, 8,0.04,44),
  M('x3a','suplex',3,'Dragon Suplex',      46,38,10,0.06,58),
  M('x3b','suplex',3,'Tiger Suplex',       45,36,10,0.06,57),
  M('x3c','suplex',3,'Half-Nelson Suplex', 44,34, 9,0.05,55),
  M('x4a','suplex',4,'Bridging Dragon',    58,54,12,0.07,68),
  M('x4b','suplex',4,'Release German x3',  60,58,14,0.08,70),
  M('x4c','suplex',4,'Blue Thunder Bomb',  57,52,12,0.07,67),
  M('x5a','suplex',5,'Perfect-Plex',       76,78,15,0.08,79),
  M('x5b','suplex',5,'Emerald Flowsion',   84,86,17,0.11,84),
  M('x5c','suplex',5,'Tiger Driver \'91',  88,90,18,0.15,87),

  // ================= SUBMISSIONS (technique) =================
  M('u1a','submission',1,'Headlock',       12, 8, 3,0.01,0),
  M('u1b','submission',1,'Arm Wringer',    13, 8, 3,0.01,0),
  M('u1c','submission',1,'Chinlock',       12, 7, 3,0.01,0),
  M('u2a','submission',2,'Boston Crab',    26,20, 6,0.02,40),
  M('u2b','submission',2,'Armbar',         25,18, 5,0.02,38),
  M('u2c','submission',2,'Abdominal Stretch',24,17,5,0.02,38),
  M('u3a','submission',3,'Figure-Four Leglock',40,36,8,0.03,54),
  M('u3b','submission',3,'Crossface',      42,38, 8,0.03,56),
  M('u3c','submission',3,'Ankle Lock',     41,35, 8,0.03,55),
  M('u4a','submission',4,'Sharpshooter',   54,56,10,0.04,66),
  M('u4b','submission',4,'Texas Cloverleaf',53,50,10,0.04,65),
  M('u4c','submission',4,'Triangle Choke', 52,48, 9,0.04,64),
  M('u5a','submission',5,'Walls of Jericho',72,74,13,0.05,78),
  M('u5b','submission',5,'Regal Stretch',  70,70,13,0.05,77),
  M('u5c','submission',5,'Anaconda Vice',  74,76,14,0.06,80),

  // ================= HIGH-FLYING (aerial) =================
  M('a1a','aerial',1,'Dropkick',           20,16, 5,0.03,0),
  M('a1b','aerial',1,'Crossbody',          19,15, 5,0.03,0),
  M('a1c','aerial',1,'Springboard Elbow',  21,17, 6,0.04,0),
  M('a2a','aerial',2,'Missile Dropkick',   31,28, 7,0.05,40),
  M('a2b','aerial',2,'Tope Suicida',       33,34, 8,0.07,44),
  M('a2c','aerial',2,'Diving Elbow Drop',  30,27, 7,0.05,42),
  M('a3a','aerial',3,'Frog Splash',        45,44,10,0.07,56),
  M('a3b','aerial',3,'Moonsault',          46,46,10,0.08,58),
  M('a3c','aerial',3,'Asai Moonsault',     44,45,10,0.09,57),
  M('a4a','aerial',4,'Swanton Bomb',       58,62,12,0.10,68),
  M('a4b','aerial',4,'Shooting Star Press',60,66,13,0.12,70),
  M('a4c','aerial',4,'450 Splash',         59,63,12,0.11,69),
  M('a5a','aerial',5,'Phoenix Splash',     76,82,15,0.14,80),
  M('a5b','aerial',5,'630 Splash',         80,86,16,0.17,83),
  M('a5c','aerial',5,'Imploding 450',      78,84,16,0.16,82),

  // ================= CHAIN & COUNTERS (psychology) =================
  M('c1a','technical',1,'Collar & Elbow Tie-Up',10,6,2,0.01,0),
  M('c1b','technical',1,'Wristlock Reversal',11, 7, 3,0.01,0),
  M('c1c','technical',1,'Drop Toe Hold',   14, 9, 3,0.01,0),
  M('c2a','technical',2,'Arm Drag Chain',  24,20, 5,0.02,40),
  M('c2b','technical',2,'Roll-Through Counter',26,24,5,0.02,42),
  M('c2c','technical',2,'Snapmare Sequence',22,18, 4,0.02,38),
  M('c3a','technical',3,'Mat Return Counter',38,34, 7,0.02,54),
  M('c3b','technical',3,'Victory Roll Pin',36,32, 6,0.02,52),
  M('c3c','technical',3,'Reversal Cradle', 39,36, 7,0.03,56),
  M('c4a','technical',4,'Counter Into Backslide',50,50,9,0.03,66),
  M('c4b','technical',4,'Signature Sequence',54,58,10,0.03,68),
  M('c4c','technical',4,'Rope-Assisted Counter',52,54,9,0.04,67),
  M('c5a','technical',5,'Perfect Counter Finish',70,76,12,0.04,78),
  M('c5b','technical',5,'Sunset Flip Powerbomb',73,78,13,0.06,80),
  M('c5c','technical',5,'Roll-Up Steal',   66,80,11,0.03,76),

  // ================= HARDCORE (toughness) =================
  M('h1a','hardcore',1,'Eye Rake',          8,10, 2,0.01,0),
  M('h1b','hardcore',1,'Choke on the Ropes',12,12, 3,0.01,0),
  M('h1c','hardcore',1,'Turnbuckle Smash', 16,14, 4,0.02,0),
  M('h2a','hardcore',2,'Chair Shot',       32,30, 6,0.06,40),
  M('h2b','hardcore',2,'Kendo Stick Flurry',30,32, 7,0.05,42),
  M('h2c','hardcore',2,'Ring Post Whip',   28,24, 6,0.05,38),
  M('h3a','hardcore',3,'Table Slam',       46,48, 9,0.10,56),
  M('h3b','hardcore',3,'Barbed Wire Rake', 44,46, 8,0.11,58),
  M('h3c','hardcore',3,'Ladder Drop',      47,50,10,0.12,57),
  M('h4a','hardcore',4,'Thumbtack Slam',   58,64,11,0.16,68),
  M('h4b','hardcore',4,'Dive Through Table',60,68,12,0.18,70),
  M('h4c','hardcore',4,'Chair-Assisted DDT',57,60,11,0.14,67),
  M('h5a','hardcore',5,'Elbow Drop Through Table',76,84,15,0.22,80),
  M('h5b','hardcore',5,'Con-Chair-To',     78,80,14,0.20,81),
  M('h5c','hardcore',5,'Cage Dive',        82,90,17,0.28,84),

  // ================= SHOWMANSHIP (charisma) =================
  M('w1a','showman',1,'Crowd Clap',         0,14, 1,0.00,0),
  M('w1b','showman',1,'Taunt',              0,12, 1,0.00,0),
  M('w1c','showman',1,'Point to the Sky',   0,13, 1,0.00,0),
  M('w2a','showman',2,'Signature Pose',     0,26, 2,0.00,38),
  M('w2b','showman',2,'Call for the Finish',4,30, 2,0.00,42),
  M('w2c','showman',2,'Play to the Hard Cam',0,28, 2,0.00,40),
  M('w3a','showman',3,'Hulk-Up Comeback',  12,46, 4,0.00,54),
  M('w3b','showman',3,'Kip-Up',             8,42, 3,0.00,52),
  M('w3c','showman',3,'Ten Punches in the Corner',20,48,5,0.01,56),
  M('w4a','showman',4,'Fired-Up Rally',    18,62, 5,0.00,66),
  M('w4b','showman',4,'Mic Drop Moment',    0,68, 3,0.00,68),
  M('w4c','showman',4,'Defiant No-Sell',   14,64, 5,0.01,67),
  M('w5a','showman',5,'Stare Down the House',0,86, 4,0.00,80),
  M('w5b','showman',5,'Championship Pose',  0,88, 4,0.00,82),
  M('w5c','showman',5,'Crowd Sing-Along',   6,92, 5,0.00,84),
];

// Everyone debuts knowing the fundamentals of the basics.
window.RTR_STARTER_MOVES = ['s1a','m1a','c1a','w1b'];
