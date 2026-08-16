/* ============================================================
   RunTheRopes: Ratings Corrections Overlay (v0.3)
   ------------------------------------------------------------
   roster.js holds the raw v0.1 tier-estimated import. This file
   layers auditable accuracy corrections on top of it, applied at
   career creation. Keeping corrections separate (rather than
   rewriting the raw import) makes every retune reviewable and
   reversible: the "canonical dataset + versioned corrections"
   model from the design doc.

   Coverage (v0.3): a deep pass across ALL eight promotions.
   - Ages are real (approx., 2026). The raw import randomized them.
   - Headline stats (inRing/psych/ent/phys/overness) recalibrated
     toward kayfabe workrate / character / physical reputation.
   Rating philosophy (0-100):
     inRing   = match quality/workrate: elite 88-96, great 82-88,
               strong 74-82, solid 64-74, limited <64.
     psych    = ring IQ/storytelling: masters 86-94, strong 76-86,
               average 64-76, low <64.
     ent      = charisma/mic/character: top 90-96, great 82-90,
               good 72-82, average 60-72, weak <60.
     phys     = power/athleticism/durability.
     overness = promotion-relative popularity; light touch.
   Only changed fields are listed. A handful of very obscure /
   lower-card names are left at v0.1 (tune them in the Editor).
   Known data quirks: a duplicate "Dominik Mysterio" and
   "Jordynne Grace" appear across promotions in the raw import, and
   a few placeholder lower-card names, left as-is (rename/retune
   in the Editor if you want to diverge from the source).
   ============================================================ */
window.RTR_CORRECTIONS = {
  // ================= WWE =================
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
  w0026: { age:32, inRing:82, psych:74, ent:70, phys:78, overness:80 }, // Stephanie Vaquer
  w0027: { age:26, inRing:76, psych:70, ent:78, phys:76, overness:78 }, // Tiffany Stratton
  w0028: { age:33, inRing:66, psych:66, ent:74, phys:88, overness:76 }, // Jade Cargill
  w0029: { age:28, inRing:74, psych:66, ent:72, phys:76, overness:58 }, // Austin Theory
  w0030: { age:37, inRing:74, psych:66, ent:64, phys:82, overness:66 }, // Bronson Reed
  w0031: { age:39, inRing:84, psych:74, ent:70, phys:74, overness:58 }, // Chad Gable
  w0032: { age:30, inRing:80, psych:66, ent:60, phys:74, overness:58 }, // Dragon Lee
  w0033: { age:36, inRing:70, psych:64, ent:66, phys:70, overness:57 }, // Ethan Page
  w0034: { age:35, inRing:68, psych:62, ent:72, phys:70, overness:58 }, // Grayson Waller
  w0035: { age:42, inRing:66, psych:60, ent:66, phys:78, overness:57 }, // Ivar
  w0036: { age:41, inRing:66, psych:60, ent:60, phys:80, overness:57 }, // Erik
  w0037: { age:35, inRing:74, psych:66, ent:66, phys:70, overness:57 }, // JD McDonagh
  w0038: { age:35, inRing:74, psych:64, ent:70, phys:70, overness:59 }, // Ludwig Kaiser
  w0039: { age:35, inRing:72, psych:62, ent:70, phys:80, overness:60 }, // Montez Ford
  w0040: { age:35, inRing:64, psych:60, ent:60, phys:74, overness:55 }, // Angelo Dawkins
  w0041: { age:28, inRing:70, psych:64, ent:66, phys:82, overness:64 }, // Oba Femi
  w0042: { age:34, inRing:62, psych:62, ent:70, phys:80, overness:57 }, // Otis
  w0043: { age:40, inRing:80, psych:70, ent:70, phys:74, overness:66 }, // Penta
  w0044: { age:35, inRing:84, psych:70, ent:66, phys:80, overness:66 }, // Rey Fenix
  w0045: { age:40, inRing:74, psych:70, ent:66, phys:78, overness:64 }, // Rusev
  w0046: { age:47, inRing:78, psych:80, ent:74, phys:78, overness:66 }, // Sheamus
  w0047: { age:28, inRing:82, psych:66, ent:66, phys:72, overness:63 }, // Tyler Bate
  w0048: { age:32, inRing:80, psych:70, ent:64, phys:80, overness:60 }, // Pete Dunne
  w0049: { age:31, inRing:76, psych:66, ent:68, phys:72, overness:63 }, // Carmelo Hayes
  w0050: { age:32, inRing:86, psych:76, ent:72, phys:84, overness:64 }, // Ilja Dragunov
  w0051: { age:38, inRing:80, psych:74, ent:72, phys:70, overness:61 }, // Johnny Gargano
  w0052: { age:45, inRing:68, psych:70, ent:80, phys:68, overness:61 }, // The Miz
  w0053: { age:53, inRing:58, psych:64, ent:80, phys:56, overness:59 }, // R-Truth
  w0054: { age:45, inRing:80, psych:78, ent:78, phys:66, overness:70 }, // Shinsuke Nakamura
  w0055: { age:31, inRing:70, psych:62, ent:74, phys:72, overness:58 }, // Trick Williams
  w0056: { age:35, inRing:76, psych:66, ent:78, phys:72, overness:58 }, // Ricky Saints
  w0057: { age:27, inRing:82, psych:64, ent:66, phys:72, overness:63 }, // Nathan Frazer
  w0058: { age:31, inRing:80, psych:64, ent:66, phys:74, overness:55 }, // Axiom
  w0059: { age:34, inRing:64, psych:66, ent:78, phys:60, overness:64 }, // Alexa Bliss
  w0060: { age:36, inRing:70, psych:60, ent:62, phys:70, overness:58 }, // Michin
  w0061: { age:41, inRing:60, psych:60, ent:66, phys:86, overness:60 }, // Nia Jax
  w0062: { age:35, inRing:70, psych:60, ent:60, phys:80, overness:58 }, // Piper Niven
  w0063: { age:34, inRing:64, psych:62, ent:78, phys:66, overness:60 }, // Chelsea Green
  w0064: { age:31, inRing:82, psych:70, ent:66, phys:70, overness:63 }, // Giulia
  w0065: { age:29, inRing:78, psych:66, ent:64, phys:82, overness:66 }, // Jordynne Grace
  w0066: { age:27, inRing:70, psych:64, ent:72, phys:66, overness:60 }, // Mariah May
  w0067: { age:29, inRing:66, psych:60, ent:64, phys:64, overness:56 }, // Jacy Jayne
  w0068: { age:28, inRing:62, psych:60, ent:60, phys:66, overness:54 }, // Fallon Henley
  w0069: { age:29, inRing:62, psych:60, ent:60, phys:64, overness:54 }, // Kiana James
  w0070: { age:43, inRing:78, psych:70, ent:60, phys:70, overness:60 }, // Natalya
  w0071: { age:28, inRing:74, psych:64, ent:68, phys:70, overness:60 }, // Lyra Valkyria
  w0072: { age:31, inRing:56, psych:58, ent:70, phys:62, overness:52 }, // Maxxine Dupri
  w0073: { age:24, inRing:74, psych:64, ent:70, phys:62, overness:60 }, // Roxanne Perez
  w0074: { age:34, inRing:64, psych:60, ent:66, phys:82, overness:62 }, // Raquel Rodriguez
  w0075: { age:26, inRing:66, psych:56, ent:64, phys:74, overness:54 }, // Sol Ruca
  w0076: { age:31, inRing:64, psych:58, ent:60, phys:76, overness:56 }, // Ivy Nile
  w0077: { age:42, inRing:56, psych:60, ent:66, phys:58, overness:58 }, // Brie Bella
  w0078: { age:33, inRing:70, psych:66, ent:72, phys:56, overness:58 }, // Paige
  w0079: { age:40, inRing:70, psych:62, ent:58, phys:64, overness:44 }, // Akira Tozawa
  w0080: { age:34, inRing:58, psych:50, ent:52, phys:66, overness:42 }, // Bravo Americano
  w0081: { age:38, inRing:66, psych:60, ent:66, phys:64, overness:48 }, // El Grande Americano
  w0082: { age:34, inRing:60, psych:52, ent:56, phys:60, overness:42 }, // Rayo Americano
  w0083: { age:30, inRing:62, psych:54, ent:56, phys:64, overness:46 }, // Cruz Del Toro
  w0084: { age:34, inRing:64, psych:52, ent:56, phys:60, overness:44 }, // Joaquin Wilde
  w0085: { age:21, inRing:66, psych:52, ent:64, phys:70, overness:48 }, // Je'Von Evans
  w0086: { age:26, inRing:60, psych:50, ent:52, phys:74, overness:42 }, // Julius Creed
  w0087: { age:28, inRing:60, psych:50, ent:52, phys:76, overness:44 }, // Brutus Creed
  w0088: { age:37, inRing:60, psych:56, ent:74, phys:64, overness:52 }, // Joe Hendry
  w0091: { age:34, inRing:58, psych:50, ent:74, phys:58, overness:48 }, // Danhausen
  w0094: { age:40, inRing:60, psych:56, ent:62, phys:58, overness:40 }, // Matt Cardona
  w0097: { age:42, inRing:64, psych:58, ent:58, phys:66, overness:44 }, // Tama Tonga
  w0099: { age:40, inRing:64, psych:56, ent:60, phys:58, overness:42 }, // Candice LeRae
  w0102: { age:28, inRing:56, psych:46, ent:58, phys:74, overness:40 }, // Lash Legend

  // ================= AEW =================
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
  w0119: { age:30, inRing:90, psych:80, ent:76, phys:84, overness:78 }, // Konosuke Takeshita
  w0120: { age:33, inRing:82, psych:82, ent:80, phys:80, overness:80 }, // Jay White
  w0121: { age:37, inRing:88, psych:70, ent:70, phys:86, overness:74 }, // Ricochet
  w0122: { age:37, inRing:84, psych:78, ent:76, phys:82, overness:74 }, // Athena
  w0123: { age:37, inRing:80, psych:72, ent:70, phys:72, overness:74 }, // Hikaru Shida
  w0124: { age:30, inRing:76, psych:70, ent:72, phys:82, overness:72 }, // Jamie Hayter
  w0125: { age:24, inRing:78, psych:72, ent:70, phys:70, overness:70 }, // Julia Hart
  w0126: { age:26, inRing:80, psych:74, ent:70, phys:80, overness:70 }, // Kris Statlander
  w0127: { age:31, inRing:76, psych:72, ent:74, phys:80, overness:72 }, // Willow Nightingale
  w0128: { age:34, inRing:74, psych:72, ent:78, phys:68, overness:76 }, // Britt Baker
  w0129: { age:36, inRing:80, psych:76, ent:82, phys:70, overness:74 }, // Adam Cole
  w0130: { age:36, inRing:82, psych:74, ent:66, phys:72, overness:66 }, // Andrade El Idolo
  w0131: { age:31, inRing:82, psych:68, ent:66, phys:70, overness:60 }, // Bandido
  w0132: { age:38, inRing:70, psych:66, ent:64, phys:82, overness:58 }, // Brody King
  w0133: { age:37, inRing:76, psych:68, ent:62, phys:80, overness:58 }, // Buddy Matthews
  w0134: { age:35, inRing:76, psych:70, ent:60, phys:74, overness:62 }, // Cash Wheeler (FTR)
  w0135: { age:41, inRing:78, psych:72, ent:64, phys:72, overness:62 }, // Dax Harwood (FTR)
  w0136: { age:32, inRing:78, psych:66, ent:70, phys:64, overness:62 }, // Daniel Garcia
  w0137: { age:44, inRing:72, psych:84, ent:82, phys:70, overness:66 }, // Eddie Kingston
  w0138: { age:28, inRing:74, psych:64, ent:64, phys:72, overness:58 }, // Jack Perry
  w0139: { age:26, inRing:84, psych:70, ent:66, phys:78, overness:66 }, // Kyle Fletcher
  w0140: { age:48, inRing:64, psych:60, ent:58, phys:82, overness:54 }, // Lance Archer
  w0141: { age:38, inRing:82, psych:70, ent:62, phys:76, overness:60 }, // Josh Alexander
  w0142: { age:38, inRing:84, psych:70, ent:64, phys:78, overness:64 }, // PAC
  w0143: { age:42, inRing:72, psych:70, ent:66, phys:64, overness:55 }, // Rocky Romero
  w0144: { age:38, inRing:72, psych:66, ent:64, phys:70, overness:56 }, // Trent Beretta
  w0145: { age:37, inRing:66, psych:60, ent:60, phys:86, overness:56 }, // Wardlow
  w0146: { age:42, inRing:80, psych:70, ent:62, phys:72, overness:62 }, // Roderick Strong
  w0147: { age:29, inRing:74, psych:64, ent:56, phys:70, overness:52 }, // Wheeler Yuta
  w0148: { age:35, inRing:84, psych:64, ent:70, phys:76, overness:62 }, // Mike Bailey
  w0149: { age:28, inRing:82, psych:60, ent:64, phys:72, overness:60 }, // Komander
  w0150: { age:41, inRing:74, psych:74, ent:84, phys:66, overness:62 }, // Orange Cassidy
  w0151: { age:36, inRing:86, psych:74, ent:78, phys:72, overness:66 }, // Matthew Jackson
  w0152: { age:31, inRing:86, psych:70, ent:76, phys:72, overness:64 }, // Nicholas Jackson
  w0153: { age:31, inRing:62, psych:56, ent:60, phys:74, overness:52 }, // Marshall Von Erich
  w0154: { age:32, inRing:64, psych:58, ent:62, phys:72, overness:53 }, // Ross Von Erich
  w0155: { age:31, inRing:76, psych:72, ent:66, phys:64, overness:60 }, // Deonna Purrazzo
  w0156: { age:28, inRing:74, psych:64, ent:66, phys:60, overness:56 }, // Riho
  w0157: { age:34, inRing:72, psych:66, ent:66, phys:66, overness:57 }, // Ruby Soho
  w0158: { age:39, inRing:74, psych:70, ent:58, phys:66, overness:52 }, // Serena Deeb
  w0159: { age:26, inRing:72, psych:60, ent:66, phys:66, overness:55 }, // Skye Blue
  w0160: { age:39, inRing:74, psych:66, ent:70, phys:68, overness:59 }, // Thunder Rosa
  w0161: { age:31, inRing:74, psych:64, ent:70, phys:66, overness:56 }, // Yuka Sakazaki
  w0162: { age:33, inRing:74, psych:66, ent:72, phys:68, overness:59 }, // Mina Shirakawa
  w0163: { age:37, inRing:58, psych:56, ent:56, phys:80, overness:44 }, // Big Bill
  w0164: { age:62, inRing:58, psych:60, ent:64, phys:56, overness:46 }, // Billy Gunn
  w0165: { age:49, inRing:70, psych:60, ent:70, phys:88, overness:62 }, // Bobby Lashley
  w0166: { age:41, inRing:64, psych:52, ent:56, phys:86, overness:50 }, // Brian Cage
  w0167: { age:52, inRing:56, psych:60, ent:78, phys:60, overness:52 }, // MVP
  w0168: { age:50, inRing:76, psych:60, ent:60, phys:80, overness:50 }, // Shelton Benjamin
  w0169: { age:26, inRing:66, psych:56, ent:60, phys:70, overness:52 }, // Hook
  w0170: { age:27, inRing:70, psych:56, ent:56, phys:72, overness:44 }, // Kevin Knight

  // ================= TNA =================
  w0171: { age:41, inRing:76, psych:70, ent:74, phys:84, overness:72 }, // Moose
  w0172: { age:45, inRing:82, psych:74, ent:80, phys:70, overness:78 }, // Nic Nemeth
  w0173: { age:34, inRing:82, psych:72, ent:70, phys:74, overness:72 }, // Mike Santana
  w0174: { age:29, inRing:78, psych:66, ent:64, phys:82, overness:70 }, // Jordynne Grace (dup)
  w0175: { age:34, inRing:64, psych:62, ent:72, phys:80, overness:60 }, // A.J. Francis
  w0176: { age:41, inRing:76, psych:70, ent:60, phys:70, overness:56 }, // Eddie Edwards
  w0177: { age:48, inRing:74, psych:72, ent:70, phys:66, overness:58 }, // Frankie Kazarian
  w0178: { age:48, inRing:70, psych:74, ent:74, phys:60, overness:66 }, // Jeff Hardy
  w0179: { age:51, inRing:66, psych:74, ent:72, phys:60, overness:62 }, // Matt Hardy
  w0180: { age:39, inRing:82, psych:70, ent:74, phys:72, overness:58 }, // Mustafa Ali
  w0181: { age:34, inRing:76, psych:62, ent:64, phys:66, overness:54 }, // Rich Swann
  w0182: { age:21, inRing:78, psych:60, ent:64, phys:72, overness:60 }, // Leon Slater
  w0183: { age:33, inRing:64, psych:62, ent:62, phys:62, overness:56 }, // Alisha Edwards
  w0184: { age:27, inRing:78, psych:64, ent:66, phys:70, overness:58 }, // Masha Slamovich
  w0185: { age:32, inRing:68, psych:62, ent:70, phys:62, overness:54 }, // Tasha Steelz
  w0186: { age:26, inRing:66, psych:60, ent:64, phys:64, overness:52 }, // Xia Brookside
  w0187: { age:31, inRing:70, psych:60, ent:66, phys:74, overness:56 }, // Jody Threat
  w0189: { age:41, inRing:64, psych:56, ent:64, phys:68, overness:46 }, // Brian Myers
  w0190: { age:36, inRing:70, psych:56, ent:56, phys:66, overness:46 }, // Cedric Alexander
  w0193: { age:35, inRing:60, psych:56, ent:56, phys:60, overness:44 }, // Allie
  w0194: { age:29, inRing:56, psych:54, ent:56, phys:70, overness:44 }, // Indi Hartwell
  w0196: { age:40, inRing:64, psych:62, ent:60, phys:70, overness:46 }, // Rosemary

  // ================= AAA =================
  w0199: { age:28, inRing:90, psych:70, ent:76, phys:78, overness:74 }, // El Hijo del Vikingo
  w0201: { age:55, inRing:74, psych:82, ent:70, phys:64, overness:66 }, // Chavo Guerrero Jr.
  w0202: { age:41, inRing:72, psych:66, ent:70, phys:68, overness:58 }, // El Hijo de Dr. Wagner Jr.
  w0203: { age:44, inRing:70, psych:64, ent:64, phys:72, overness:53 }, // El Texano Jr.
  w0204: { age:30, inRing:80, psych:62, ent:64, phys:72, overness:56 }, // Octagon Jr.
  w0205: { age:38, inRing:66, psych:64, ent:70, phys:70, overness:60 }, // Psycho Clown
  w0206: { age:44, inRing:60, psych:58, ent:66, phys:74, overness:56 }, // Pagano
  w0207: { age:34, inRing:74, psych:60, ent:68, phys:62, overness:58 }, // Laredo Kid
  w0208: { age:40, inRing:74, psych:60, ent:70, phys:70, overness:56 }, // Drago

  // ================= ROH =================
  w0218: { age:39, inRing:70, psych:70, ent:80, phys:78, overness:66 }, // Dalton Castle
  w0219: { age:45, inRing:80, psych:82, ent:76, phys:76, overness:72 }, // Mercedes Martinez
  w0220: { age:39, inRing:74, psych:66, ent:66, phys:72, overness:60 }, // Matt Taven
  w0221: { age:35, inRing:72, psych:66, ent:58, phys:70, overness:54 }, // Anthony Henry
  w0222: { age:33, inRing:70, psych:60, ent:66, phys:66, overness:58 }, // Red Velvet
  w0223: { age:36, inRing:68, psych:62, ent:60, phys:70, overness:54 }, // Lady Frost

  // ================= NJPW =================
  w0229: { age:38, inRing:92, psych:92, ent:78, phys:80, overness:84 }, // Zack Sabre Jr.
  w0230: { age:49, inRing:80, psych:90, ent:84, phys:66, overness:82 }, // Hiroshi Tanahashi
  w0231: { age:37, inRing:80, psych:74, ent:70, phys:78, overness:74 }, // SANADA
  w0232: { age:39, inRing:72, psych:70, ent:70, phys:74, overness:70 }, // EVIL
  w0233: { age:50, inRing:84, psych:82, ent:74, phys:76, overness:74 }, // Tomohiro Ishii
  w0234: { age:38, inRing:82, psych:72, ent:70, phys:74, overness:72 }, // El Phantasmo
  w0235: { age:46, inRing:78, psych:74, ent:70, phys:72, overness:70 }, // Hirooki Goto
  w0236: { age:28, inRing:74, psych:66, ent:60, phys:74, overness:62 }, // Shota Umino
  w0237: { age:31, inRing:76, psych:62, ent:60, phys:72, overness:60 }, // Yota Tsuji
  w0238: { age:35, inRing:70, psych:66, ent:66, phys:78, overness:62 }, // Great-O-Khan
  w0239: { age:45, inRing:72, psych:66, ent:70, phys:66, overness:62 }, // Taichi
  w0240: { age:33, inRing:70, psych:58, ent:62, phys:66, overness:56 }, // Douki
  w0241: { age:31, inRing:62, psych:60, ent:60, phys:80, overness:60 }, // Hikuleo
  w0242: { age:34, inRing:74, psych:60, ent:60, phys:66, overness:56 }, // Robbie Eagles
  w0243: { age:43, inRing:70, psych:62, ent:60, phys:72, overness:56 }, // YOSHI-HASHI
  w0244: { age:47, inRing:58, psych:66, ent:78, phys:66, overness:58 }, // Toru Yano
  w0245: { age:42, inRing:78, psych:64, ent:58, phys:66, overness:60 }, // Taiji Ishimori
  w0246: { age:52, inRing:70, psych:70, ent:70, phys:58, overness:54 }, // TAKA Michinoku
  w0247: { age:27, inRing:66, psych:56, ent:52, phys:72, overness:48 }, // Yuya Uemura
  w0248: { age:29, inRing:64, psych:58, ent:60, phys:70, overness:46 }, // Ren Narita
  w0252: { age:32, inRing:64, psych:52, ent:56, phys:58, overness:46 }, // Atlantis Jr.

  // ================= Stardom =================
  w0253: { age:32, inRing:88, psych:82, ent:80, phys:80, overness:88 }, // Mayu Iwatani
  w0254: { age:26, inRing:78, psych:70, ent:68, phys:74, overness:74 }, // Momo Watanabe
  w0255: { age:28, inRing:76, psych:72, ent:74, phys:78, overness:78 }, // Saya Kamitani
  w0256: { age:25, inRing:82, psych:70, ent:78, phys:74, overness:78 }, // Suzu Suzuki
  w0257: { age:26, inRing:70, psych:64, ent:64, phys:74, overness:56 }, // Ami Sohrei
  w0258: { age:32, inRing:74, psych:64, ent:66, phys:64, overness:60 }, // Koguma
  w0259: { age:29, inRing:70, psych:62, ent:66, phys:66, overness:58 }, // Natsupoi
  w0260: { age:26, inRing:78, psych:66, ent:66, phys:66, overness:60 }, // Starlight Kid
  w0261: { age:23, inRing:82, psych:64, ent:64, phys:64, overness:62 }, // AZM
  w0262: { age:24, inRing:70, psych:58, ent:60, phys:66, overness:58 }, // Hanan

  // ================= TJPW =================
  w0268: { age:31, inRing:88, psych:80, ent:76, phys:82, overness:82 }, // Miyu Yamashita
  w0269: { age:32, inRing:80, psych:72, ent:72, phys:74, overness:70 }, // Shoko Nakajima
  w0270: { age:35, inRing:74, psych:74, ent:80, phys:72, overness:72 }, // Rika Tatsumi
  w0271: { age:34, inRing:80, psych:72, ent:74, phys:68, overness:72 }, // Mizuki
  w0272: { age:31, inRing:72, psych:64, ent:70, phys:66, overness:56 }, // Yuka Sakazaki (dup)
  w0273: { age:26, inRing:70, psych:60, ent:60, phys:80, overness:60 }, // Miu Watanabe
  w0274: { age:31, inRing:64, psych:60, ent:70, phys:70, overness:54 }, // Yuki Kamifuku
  w0275: { age:27, inRing:66, psych:62, ent:66, phys:62, overness:58 }, // Wakana Uehara
  w0276: { age:35, inRing:66, psych:64, ent:70, phys:68, overness:54 }, // Hyper Misao
  w0277: { age:26, inRing:70, psych:62, ent:62, phys:68, overness:58 }, // Suzume
  w0281: { age:24, inRing:58, psych:52, ent:64, phys:56, overness:44 }, // Yuki Arai

  // ---- deep cuts: remaining identifiable lower-card names (v0.3.1) ----
  w0089: { age:38, inRing:66, psych:54, ent:58, phys:66, overness:42 }, // Angel (Los Garza)
  w0090: { age:36, inRing:64, psych:52, ent:56, phys:64, overness:42 }, // Berto (Los Garza)
  w0092: { age:33, inRing:60, psych:54, ent:64, phys:58, overness:46 }, // Elton Prince (Pretty Deadly)
  w0093: { age:32, inRing:60, psych:54, ent:64, phys:58, overness:46 }, // Kit Wilson (Pretty Deadly)
  w0096: { age:34, inRing:58, psych:54, ent:52, phys:76, overness:44 }, // Talla Tonga
  w0098: { age:33, inRing:54, psych:50, ent:60, phys:60, overness:40 }, // B-Fab
  w0100: { age:26, inRing:58, psych:50, ent:54, phys:70, overness:40 }, // Kali Armstrong
  w0101: { age:25, inRing:60, psych:52, ent:58, phys:64, overness:42 }, // Lainey Reid
  w0188: { age:30, inRing:60, psych:54, ent:60, phys:64, overness:40 }, // BDE
  w0192: { age:36, inRing:58, psych:52, ent:60, phys:70, overness:46 }, // Ash by Elegance
  w0197: { age:34, inRing:62, psych:56, ent:56, phys:64, overness:44 }, // KiLynn King
  w0198: { age:31, inRing:60, psych:56, ent:54, phys:66, overness:42 }, // Lei Ying Lee
  w0224: { age:30, inRing:58, psych:52, ent:58, phys:60, overness:42 }, // Christyan Reid
  w0225: { age:34, inRing:62, psych:56, ent:56, phys:62, overness:44 }, // Trish Adora
  w0249: { age:24, inRing:66, psych:58, ent:56, phys:70, overness:46 }, // Kosei Fujita
  w0250: { age:31, inRing:66, psych:56, ent:54, phys:64, overness:48 }, // Master Wato
  w0251: { age:36, inRing:70, psych:58, ent:56, phys:66, overness:50 }, // Titan
  w0263: { age:35, inRing:70, psych:60, ent:64, phys:66, overness:52 }, // Saori Anou
  w0264: { age:23, inRing:64, psych:54, ent:56, phys:66, overness:48 }, // Rina
  w0265: { age:34, inRing:66, psych:58, ent:56, phys:64, overness:50 }, // Konami
  w0266: { age:26, inRing:60, psych:52, ent:60, phys:62, overness:46 }, // Waka Tsukiyama
  w0267: { age:26, inRing:62, psych:52, ent:54, phys:62, overness:46 }, // Yuna Mizumori
  w0278: { age:33, inRing:56, psych:56, ent:66, phys:60, overness:48 }, // Raku
  w0279: { age:29, inRing:62, psych:54, ent:52, phys:62, overness:44 }, // Yuki Aino
  w0280: { age:36, inRing:54, psych:54, ent:66, phys:56, overness:46 }, // Pom Harajuku
  w0283: { age:24, inRing:58, psych:52, ent:60, phys:62, overness:44 }, // Shino Suzuki
  w0285: { age:28, inRing:58, psych:52, ent:56, phys:62, overness:44 }, // Toga
};
