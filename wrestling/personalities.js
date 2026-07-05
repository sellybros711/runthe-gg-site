/* ============================================================
   RunTheRopes — Free Agents, Legends & Managers (v0.1)
   ------------------------------------------------------------
   A curated talent pool layered into the free-agent market at
   career start. Three kinds, all signable by any promotion:

   - role:'wrestler'  — notable free agents / part-timers you can
                        sign and book like anyone else.
   - role:'manager'   — famous mouthpieces (Heyman, Callis, Cornette…)
                        who don't wrestle but can be paired with a
                        wrestler or a stable to boost their segments,
                        heat, and overness. canGM ones can also run
                        your company for a passive bonus.
   - retired legends  — modelled as role:'manager' with retired:true;
                        they can't wrestle but make elite managers/GMs.

   Fields mirror the worker schema so they drop straight into the
   pool. mgrBonus (0-100) drives a manager's on-screen effect.
   Fantasy pool — availability is kayfabe, tune freely in the Editor.
   (Out of respect, recently-passed figures are omitted.)
   ============================================================ */
window.RTR_PERSONALITIES = [
  // ---------------- Free-agent wrestlers ----------------
  { id:'fa01', name:'Brock Lesnar',   tier:'elite', align:'heel',    inRing:76, psych:80, ent:76, phys:96, overness:90, age:48, salary:60000, role:'wrestler' },
  { id:'fa02', name:'Malakai Black',  tier:'upper', align:'heel',    inRing:82, psych:78, ent:78, phys:74, overness:74, age:40, salary:24000, role:'wrestler' },
  { id:'fa03', name:'Karrion Kross',  tier:'mid',   align:'heel',    inRing:66, psych:64, ent:76, phys:82, overness:62, age:40, salary:18000, role:'wrestler' },
  { id:'fa04', name:'Matt Riddle',    tier:'mid',   align:'face',    inRing:78, psych:66, ent:70, phys:74, overness:62, age:39, salary:17000, role:'wrestler' },
  { id:'fa05', name:'Scarlett',       tier:'lower', align:'heel',    inRing:54, psych:56, ent:72, phys:62, overness:56, age:34, salary:12000, role:'wrestler' },

  // ---------------- Retired legends (manager / GM) ----------------
  { id:'leg01', name:'Stone Cold Steve Austin', tier:'legend', align:'tweener', inRing:0, psych:70, ent:96, phys:0, overness:96, age:61, salary:30000, role:'manager', retired:true, canGM:true,  mgrBonus:88 },
  { id:'leg02', name:'The Rock',                tier:'legend', align:'heel',    inRing:0, psych:74, ent:98, phys:0, overness:97, age:53, salary:32000, role:'manager', retired:true, canGM:true,  mgrBonus:90 },
  { id:'leg03', name:'The Undertaker',          tier:'legend', align:'tweener', inRing:0, psych:82, ent:88, phys:0, overness:92, age:60, salary:26000, role:'manager', retired:true, canGM:true,  mgrBonus:84 },
  { id:'leg04', name:'Triple H',                tier:'legend', align:'heel',    inRing:0, psych:88, ent:84, phys:0, overness:88, age:56, salary:28000, role:'manager', retired:true, canGM:true,  mgrBonus:86 },
  { id:'leg05', name:'Shawn Michaels',          tier:'legend', align:'face',    inRing:0, psych:86, ent:90, phys:0, overness:86, age:60, salary:24000, role:'manager', retired:true, canGM:true,  mgrBonus:82 },
  { id:'leg06', name:'John Cena',               tier:'legend', align:'face',    inRing:0, psych:78, ent:94, phys:0, overness:94, age:48, salary:30000, role:'manager', retired:true, canGM:true,  mgrBonus:88 },
  { id:'leg07', name:'Batista',                 tier:'legend', align:'face',    inRing:0, psych:66, ent:82, phys:0, overness:82, age:56, salary:20000, role:'manager', retired:true, canGM:false, mgrBonus:78 },
  { id:'leg08', name:'Kurt Angle',              tier:'legend', align:'tweener', inRing:0, psych:82, ent:80, phys:0, overness:80, age:57, salary:20000, role:'manager', retired:true, canGM:true,  mgrBonus:80 },
  { id:'leg09', name:'Sting',                   tier:'legend', align:'face',    inRing:0, psych:76, ent:82, phys:0, overness:82, age:66, salary:18000, role:'manager', retired:true, canGM:false, mgrBonus:78 },
  { id:'leg10', name:'Booker T',                tier:'legend', align:'face',    inRing:0, psych:72, ent:82, phys:0, overness:76, age:60, salary:16000, role:'manager', retired:true, canGM:true,  mgrBonus:76 },
  { id:'leg11', name:'Mick Foley',              tier:'legend', align:'face',    inRing:0, psych:84, ent:86, phys:0, overness:80, age:60, salary:16000, role:'manager', retired:true, canGM:true,  mgrBonus:80 },
  { id:'leg12', name:'Goldberg',                tier:'legend', align:'face',    inRing:0, psych:58, ent:80, phys:0, overness:82, age:59, salary:18000, role:'manager', retired:true, canGM:false, mgrBonus:74 },
  { id:'leg13', name:'Ric Flair',               tier:'legend', align:'heel',    inRing:0, psych:88, ent:92, phys:0, overness:88, age:76, salary:18000, role:'manager', retired:true, canGM:true,  mgrBonus:90 },

  // ---------------- Professional managers ----------------
  { id:'mgr01', name:'Paul Heyman',       tier:'manager', align:'heel',    inRing:0, psych:82, ent:94, phys:0, overness:84, age:60, salary:20000, role:'manager', retired:false, canGM:true,  mgrBonus:96 },
  { id:'mgr02', name:'Don Callis',        tier:'manager', align:'heel',    inRing:0, psych:78, ent:84, phys:0, overness:70, age:62, salary:15000, role:'manager', retired:false, canGM:true,  mgrBonus:86 },
  { id:'mgr03', name:'Jim Cornette',      tier:'manager', align:'heel',    inRing:0, psych:84, ent:82, phys:0, overness:66, age:64, salary:12000, role:'manager', retired:false, canGM:true,  mgrBonus:84 },
  { id:'mgr04', name:'Jimmy Hart',        tier:'manager', align:'heel',    inRing:0, psych:72, ent:80, phys:0, overness:62, age:81, salary:9000,  role:'manager', retired:false, canGM:false, mgrBonus:78 },
  { id:'mgr05', name:'Prince Nana',       tier:'manager', align:'heel',    inRing:0, psych:66, ent:78, phys:0, overness:58, age:46, salary:9000,  role:'manager', retired:false, canGM:false, mgrBonus:76 },
  { id:'mgr06', name:'Stokely Hathaway',  tier:'manager', align:'heel',    inRing:0, psych:68, ent:80, phys:0, overness:56, age:36, salary:9000,  role:'manager', retired:false, canGM:false, mgrBonus:78 },
];
