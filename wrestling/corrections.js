/* ============================================================
   RunTheRopes — Ratings Corrections Overlay (v0.2)
   ------------------------------------------------------------
   roster.js holds the raw v0.1 tier-estimated import. This file
   layers auditable accuracy corrections on top of it, applied at
   career creation. Keeping corrections separate (rather than
   rewriting the raw import) makes every retune reviewable and
   reversible — the "canonical dataset + versioned corrections"
   model from the design doc.

   Only changed fields are listed per worker; anything omitted
   keeps its roster.js value. Ages are real (approx., 2026).
   Headline stats (inRing/psych/ent/phys/overness) are recalibrated
   toward kayfabe workrate/character reputation. Still a living
   estimate — tune freely in the in-game Editor.
   ============================================================ */
window.RTR_CORRECTIONS = {
  // ---------- WWE ----------
  w0001: { age:40, inRing:85, psych:83, ent:92, phys:80, overness:91 }, // Cody Rhodes
  w0002: { age:40, inRing:83, psych:88, ent:90, phys:82, overness:93 }, // Roman Reigns
  w0003: { age:39, inRing:90, psych:86, ent:88, phys:82, overness:91 }, // Seth Rollins
  w0004: { age:47, inRing:82, psych:88, ent:94, phys:68, overness:92 }, // CM Punk
  w0005: { age:38, inRing:88, psych:87, ent:74, phys:85, overness:85 }, // Gunther
  w0006: { age:29, inRing:84, psych:80, ent:82, phys:84, overness:90 }, // Rhea Ripley
  w0007: { age:36, inRing:82, psych:74, ent:80, phys:88, overness:84 }, // Bianca Belair
  w0008: { age:33, inRing:82, psych:74, ent:76, phys:86, overness:80 }, // Jacob Fatu
  w0009: { age:40, inRing:80, psych:78, ent:88, phys:78, overness:90 }, // Jey Uso
  w0010: { age:40, inRing:78, psych:76, ent:76, phys:78, overness:74 }, // Jimmy Uso
  w0011: { age:43, inRing:78, psych:74, ent:78, phys:84, overness:78 }, // Damian Priest
  w0012: { age:40, inRing:84, psych:82, ent:84, phys:86, overness:82 }, // Drew McIntyre
  w0013: { age:43, inRing:74, psych:72, ent:88, phys:74, overness:80 }, // LA Knight
  w0014: { age:45, inRing:86, psych:92, ent:84, phys:76, overness:84 }, // Randy Orton
  w0015: { age:31, inRing:78, psych:74, ent:80, phys:76, overness:78 }, // Liv Morgan
  w0016: { age:35, inRing:90, psych:82, ent:66, phys:82, overness:80 }, // IYO SKY
  w0017: { age:28, inRing:82, psych:72, ent:74, phys:88, overness:82 }, // Bron Breakker
  w0018: { age:41, inRing:82, psych:86, ent:86, phys:74, overness:84 }, // Sami Zayn
  w0019: { age:44, inRing:84, psych:80, ent:76, phys:74, overness:78 }, // Finn Balor
  w0020: { age:41, inRing:84, psych:86, ent:88, phys:80, overness:82 }, // Kevin Owens
  w0021: { age:32, inRing:74, psych:70, ent:70, phys:80, overness:80 }, // Solo Sikoa
  w0022: { age:28, inRing:68, psych:66, ent:82, phys:66, overness:82 }, // Dominik Mysterio
  w0023: { age:51, inRing:78, psych:88, ent:74, phys:58, overness:82 }, // Rey Mysterio
  w0024: { age:36, inRing:82, psych:80, ent:76, phys:72, overness:78 }, // Bayley
  w0025: { age:38, inRing:82, psych:82, ent:88, phys:78, overness:86 }, // Becky Lynch
  w0026: { age:34, inRing:82, psych:74, ent:70, phys:78, overness:78 }, // Stephanie Vaquer
  w0027: { age:26, inRing:76, psych:70, ent:78, phys:76, overness:78 }, // Tiffany Stratton
  w0028: { age:33, inRing:66, psych:66, ent:74, phys:88, overness:76 }, // Jade Cargill
  w0029: { age:28, inRing:74, psych:66, ent:72, phys:76, overness:58 }, // Austin Theory
  w0030: { age:37, inRing:74, psych:66, ent:64, phys:82, overness:66 }, // Bronson Reed
  w0031: { age:39, inRing:84, psych:74, ent:70, phys:74, overness:58 }, // Chad Gable
  w0032: { age:30, inRing:80, psych:66, ent:60, phys:74, overness:58 }, // Dragon Lee
  w0043: { age:40, inRing:82, psych:74, ent:70, phys:74, overness:66 }, // Penta
  w0044: { age:34, inRing:84, psych:72, ent:66, phys:80, overness:66 }, // Rey Fenix
  w0046: { age:47, inRing:78, psych:80, ent:74, phys:78, overness:66 }, // Sheamus
  w0050: { age:31, inRing:86, psych:76, ent:72, phys:84, overness:64 }, // Ilja Dragunov
  w0054: { age:45, inRing:80, psych:78, ent:78, phys:66, overness:70 }, // Shinsuke Nakamura
  // ---------- AEW ----------
  w0103: { age:40, inRing:84, psych:88, ent:88, phys:80, overness:88 }, // Jon Moxley
  w0104: { age:32, inRing:96, psych:84, ent:82, phys:84, overness:88 }, // Will Ospreay
  w0105: { age:29, inRing:82, psych:86, ent:94, phys:74, overness:88 }, // MJF
  w0106: { age:44, inRing:96, psych:94, ent:82, phys:78, overness:86 }, // Bryan Danielson
  w0107: { age:42, inRing:94, psych:92, ent:84, phys:74, overness:86 }, // Kenny Omega
  w0108: { age:35, inRing:88, psych:82, ent:82, phys:80, overness:84 }, // Swerve Strickland
  w0109: { age:30, inRing:84, psych:82, ent:88, phys:74, overness:84 }, // Toni Storm
  w0110: { age:33, inRing:82, psych:80, ent:82, phys:76, overness:84 }, // Mercedes Mone
  w0111: { age:52, inRing:82, psych:90, ent:88, phys:66, overness:80 }, // Adam Copeland
  w0112: { age:34, inRing:86, psych:80, ent:76, phys:80, overness:80 }, // Hangman Page
  w0113: { age:55, inRing:74, psych:90, ent:88, phys:62, overness:80 }, // Chris Jericho
  w0114: { age:52, inRing:74, psych:86, ent:84, phys:64, overness:76 }, // Christian Cage
  w0115: { age:45, inRing:88, psych:82, ent:74, phys:90, overness:76 }, // Claudio Castagnoli
  w0116: { age:32, inRing:82, psych:78, ent:80, phys:80, overness:82 }, // Darby Allin
  w0117: { age:46, inRing:82, psych:86, ent:84, phys:78, overness:78 }, // Samoa Joe
  w0118: { age:38, inRing:92, psych:92, ent:74, phys:80, overness:86 }, // Kazuchika Okada
};
