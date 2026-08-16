/* ============================================================
   RunTheRopes: Build-A-Wrestler Cosmetics, Packs & Store (v1)
   ------------------------------------------------------------
   Everything here is drawn procedurally by the pixel renderer,
   no image assets. Items unlock via the Pro Shop (coins) or by
   opening packs earned through your career.

   slots: hair | face | mask | attire | boots | acc | pattern
   rarity: common | rare | epic | legendary
   ============================================================ */
window.RTR_RARITY = {
  common:    { label:'Common',    color:'#b3a794', odds:0.62, price:1200,  shards:1 },
  rare:      { label:'Rare',      color:'#6aa7c4', odds:0.26, price:4500,  shards:3 },
  epic:      { label:'Epic',      color:'#b08ac6', odds:0.10, price:12000, shards:8 },
  legendary: { label:'Legendary', color:'#e0b341', odds:0.02, price:30000, shards:20 },
};

window.RTR_PACKS = [
  { id:'p_base',   name:'Locker Room Pack', price:8000,  n:3, floor:'common', boost:0,    blurb:'3 items. Standard gear pulls.' },
  { id:'p_elite',  name:'Main Event Pack',  price:22000, n:4, floor:'rare',   boost:0.18, blurb:'4 items, at least one Rare+.' },
  { id:'p_legend', name:'Hall of Fame Pack',price:55000, n:5, floor:'epic',   boost:0.42, blurb:'5 items, at least one Epic+.' },
];

// Cosmetic catalogue. `v` is the value the renderer reads for that slot.
window.RTR_COSMETICS = [
  // ---------- HAIR ----------
  { id:'h_short',   slot:'hair', name:'Short Crop',      rarity:'common', v:'short',   owned:true },
  { id:'h_bald',    slot:'hair', name:'Bald',            rarity:'common', v:'bald',    owned:true },
  { id:'h_buzz',    slot:'hair', name:'Buzz Cut',        rarity:'common', v:'buzz',    owned:true },
  { id:'h_long',    slot:'hair', name:'Long Hair',       rarity:'common', v:'long',    owned:true },
  { id:'h_pony',    slot:'hair', name:'Ponytail',        rarity:'rare',   v:'pony'  },
  { id:'h_mullet',  slot:'hair', name:'Business/Party',  rarity:'rare',   v:'mullet'},
  { id:'h_spiky',   slot:'hair', name:'Spiked Up',       rarity:'rare',   v:'spiky' },
  { id:'h_afro',    slot:'hair', name:'Afro',            rarity:'rare',   v:'afro'  },
  { id:'h_mohawk',  slot:'hair', name:'Mohawk',          rarity:'epic',   v:'mohawk'},
  { id:'h_topknot', slot:'hair', name:'Top Knot',        rarity:'epic',   v:'topknot'},
  { id:'h_flames',  slot:'hair', name:'Flame Mane',      rarity:'legendary', v:'flames'},

  // ---------- FACE / PAINT ----------
  { id:'f_none',    slot:'face', name:'Clean',           rarity:'common', v:'none',   owned:true },
  { id:'f_beard',   slot:'face', name:'Beard',           rarity:'common', v:'beard',  owned:true },
  { id:'f_stache',  slot:'face', name:'Moustache',       rarity:'common', v:'stache', owned:true },
  { id:'f_goatee',  slot:'face', name:'Goatee',          rarity:'rare',   v:'goatee'},
  { id:'f_warrior', slot:'face', name:'War Paint',       rarity:'epic',   v:'warrior'},
  { id:'f_skull',   slot:'face', name:'Skull Paint',     rarity:'epic',   v:'skull' },
  { id:'f_tribal',  slot:'face', name:'Tribal Paint',    rarity:'legendary', v:'tribal'},

  // ---------- MASKS ----------
  { id:'m_none',    slot:'mask', name:'No Mask',         rarity:'common', v:'none',   owned:true },
  { id:'m_lucha',   slot:'mask', name:'Lucha Mask',      rarity:'rare',   v:'lucha' },
  { id:'m_half',    slot:'mask', name:'Half Mask',       rarity:'rare',   v:'half'  },
  { id:'m_hood',    slot:'mask', name:'Executioner Hood',rarity:'epic',   v:'hood'  },
  { id:'m_demon',   slot:'mask', name:'Demon Mask',      rarity:'legendary', v:'demon'},

  // ---------- ATTIRE ----------
  { id:'a_trunks',  slot:'attire', name:'Classic Trunks',rarity:'common', v:'trunks', owned:true },
  { id:'a_tights',  slot:'attire', name:'Full Tights',   rarity:'common', v:'tights', owned:true },
  { id:'a_singlet', slot:'attire', name:'Singlet',       rarity:'rare',   v:'singlet'},
  { id:'a_tank',    slot:'attire', name:'Tank Top',      rarity:'rare',   v:'tank'  },
  { id:'a_jacket',  slot:'attire', name:'Entrance Jacket',rarity:'epic',  v:'jacket'},
  { id:'a_duster',  slot:'attire', name:'Long Coat',     rarity:'legendary', v:'duster'},

  // ---------- BOOTS ----------
  { id:'b_short',   slot:'boots', name:'Low Boots',      rarity:'common', v:'short',  owned:true },
  { id:'b_tall',    slot:'boots', name:'Tall Boots',     rarity:'common', v:'tall',   owned:true },
  { id:'b_sneak',   slot:'boots', name:'Wrestling Shoes',rarity:'rare',   v:'sneak' },
  { id:'b_pads',    slot:'boots', name:'Padded Kickers', rarity:'epic',   v:'pads'  },

  // ---------- ACCESSORIES ----------
  { id:'x_none',    slot:'acc', name:'None',             rarity:'common', v:'none',   owned:true },
  { id:'x_wrist',   slot:'acc', name:'Wrist Tape',       rarity:'common', v:'wrist',  owned:true },
  { id:'x_elbow',   slot:'acc', name:'Elbow Pads',       rarity:'rare',   v:'elbow' },
  { id:'x_shades',  slot:'acc', name:'Shades',           rarity:'rare',   v:'shades'},
  { id:'x_chain',   slot:'acc', name:'Chain',            rarity:'epic',   v:'chain' },
  { id:'x_cape',    slot:'acc', name:'Cape',             rarity:'epic',   v:'cape'  },
  { id:'x_belt',    slot:'acc', name:'Title Belt',       rarity:'legendary', v:'belt'},

  // ---------- GEAR PATTERNS ----------
  { id:'g_solid',   slot:'pattern', name:'Solid',        rarity:'common', v:'solid',  owned:true },
  { id:'g_stripe',  slot:'pattern', name:'Side Stripe',  rarity:'common', v:'stripe', owned:true },
  { id:'g_split',   slot:'pattern', name:'Split Colour', rarity:'rare',   v:'split' },
  { id:'g_flame',   slot:'pattern', name:'Flames',       rarity:'epic',   v:'flame' },
  { id:'g_stars',   slot:'pattern', name:'Stars',        rarity:'epic',   v:'stars' },
  { id:'g_gold',    slot:'pattern', name:'Gold Trim',    rarity:'legendary', v:'gold'},
];

// Colour swatches available to every wrestler (free: colour is expression, not paywalled)
window.RTR_PALETTE = {
  skin: ['#f3d3b3','#e8bd95','#d29b6e','#b2764a','#8a5533','#5d3a22'],
  hair: ['#241a12','#4a2f1b','#8a5a2b','#c99b3d','#e8dcc0','#b03a2e','#3b6ea5','#7a3f9d','#e0e0e0','#22c2a8'],
  gear: ['#C6392C','#e0b341','#2f7fbf','#3aa濃','#5bb083','#7a3f9d','#e07b39','#F4E8DB','#1a1a1a','#d2687a','#2fbfa8','#8a1c1c'],
  trim: ['#F4E8DB','#e0b341','#1a1a1a','#C6392C','#2fbfa8','#7a3f9d'],
};
// (sanitise any typo'd swatch at load, which keeps the picker safe)
window.RTR_PALETTE.gear = window.RTR_PALETTE.gear.filter(c=>/^#[0-9a-fA-F]{6}$/.test(c));

// ---------- expanded catalogue (v2): more of everything + two new slots ----------
window.RTR_COSMETICS.push(
  // HAIR
  { id:'h_dreads',  slot:'hair', name:'Dreadlocks',      rarity:'rare',      v:'dreads' },
  { id:'h_undercut',slot:'hair', name:'Undercut',        rarity:'rare',      v:'undercut' },
  { id:'h_wild',    slot:'hair', name:'Wild Mane',       rarity:'epic',      v:'wild' },
  { id:'h_horns',   slot:'hair', name:'Horned Crest',    rarity:'legendary', v:'hornhair' },
  // FACE
  { id:'f_mutton',  slot:'face', name:'Mutton Chops',    rarity:'rare',      v:'mutton' },
  { id:'f_scar',    slot:'face', name:'Scarred',         rarity:'epic',      v:'scar' },
  { id:'f_halfpaint',slot:'face',name:'Half Paint',      rarity:'epic',      v:'halfpaint' },
  { id:'f_venom',   slot:'face', name:'Venom Paint',     rarity:'legendary', v:'venom' },
  // MASK
  { id:'m_tiger',   slot:'mask', name:'Tiger Mask',      rarity:'epic',      v:'tiger' },
  { id:'m_skullm',  slot:'mask', name:'Bone Mask',       rarity:'epic',      v:'skullmask' },
  { id:'m_phantom', slot:'mask', name:'Phantom Mask',    rarity:'legendary', v:'phantom' },
  // ATTIRE
  { id:'a_shorts',  slot:'attire', name:'Fight Shorts',  rarity:'common',    v:'shorts', owned:true },
  { id:'a_vest',    slot:'attire', name:'Leather Vest',  rarity:'rare',      v:'vest' },
  { id:'a_bodysuit',slot:'attire', name:'Full Bodysuit', rarity:'epic',      v:'bodysuit' },
  { id:'a_armor',   slot:'attire', name:'Ring Armour',   rarity:'legendary', v:'armor' },
  // BOOTS
  { id:'b_wraps',   slot:'boots', name:'Foot Wraps',     rarity:'common',    v:'wraps', owned:true },
  { id:'b_platform',slot:'boots', name:'Platform Boots', rarity:'epic',      v:'platform' },
  { id:'b_gold',    slot:'boots', name:'Gilded Boots',   rarity:'legendary', v:'goldboot' },
  // ACCESSORIES
  { id:'x_kneepads',slot:'acc', name:'Knee Pads',        rarity:'common',    v:'knee', owned:true },
  { id:'x_bandana', slot:'acc', name:'Bandana',          rarity:'rare',      v:'bandana' },
  { id:'x_gloves',  slot:'acc', name:'Fingerless Gloves',rarity:'rare',      v:'gloves' },
  { id:'x_scarf',   slot:'acc', name:'Ring Scarf',       rarity:'epic',      v:'scarf' },
  { id:'x_wings',   slot:'acc', name:'Entrance Wings',   rarity:'legendary', v:'wings' },
  // PATTERNS
  { id:'g_bolt',    slot:'pattern', name:'Lightning',    rarity:'rare',      v:'bolt' },
  { id:'g_check',   slot:'pattern', name:'Checker',      rarity:'rare',      v:'check' },
  { id:'g_scales',  slot:'pattern', name:'Scales',       rarity:'epic',      v:'scales' },
  { id:'g_royal',   slot:'pattern', name:'Royal Trim',   rarity:'legendary', v:'royal' },

  // ---- NEW SLOT: TATTOOS ----
  { id:'t_none',    slot:'tattoo', name:'None',          rarity:'common',    v:'none', owned:true },
  { id:'t_sleeve',  slot:'tattoo', name:'Sleeve',        rarity:'rare',      v:'sleeve' },
  { id:'t_chest',   slot:'tattoo', name:'Chest Piece',   rarity:'rare',      v:'chest' },
  { id:'t_full',    slot:'tattoo', name:'Full Body Ink', rarity:'epic',      v:'full' },
  { id:'t_tribalink',slot:'tattoo',name:'Tribal Ink',    rarity:'legendary', v:'tribalink' },

  // ---- NEW SLOT: ENTRANCE AURA ----
  { id:'au_none',   slot:'aura', name:'No Aura',         rarity:'common',    v:'none', owned:true },
  { id:'au_spark',  slot:'aura', name:'Sparks',          rarity:'rare',      v:'spark' },
  { id:'au_smoke',  slot:'aura', name:'Smoke',           rarity:'rare',      v:'smoke' },
  { id:'au_flame',  slot:'aura', name:'Flame Aura',      rarity:'epic',      v:'flame' },
  { id:'au_storm',  slot:'aura', name:'Storm Aura',      rarity:'legendary', v:'storm' },
  { id:'au_halo',   slot:'aura', name:'Golden Halo',     rarity:'legendary', v:'halo' }
);
/* ---------- expanded catalogue (v3) ----------
   A launch-sized locker: every entry below is drawn by the renderer,
   so what you see in the shop is exactly what you wear in the ring. */
window.RTR_COSMETICS.push(
  // ---------- HAIR ----------
  { id:'h_slick',    slot:'hair', name:'Slicked Back',    rarity:'common',    v:'slick' },
  { id:'h_widow',    slot:'hair', name:'Widow’s Peak',rarity:'common',   v:'widow' },
  { id:'h_bun',      slot:'hair', name:'Fighter’s Bun',rarity:'rare',    v:'bun' },
  { id:'h_curls',    slot:'hair', name:'Loose Curls',     rarity:'rare',      v:'curls' },
  { id:'h_fauxhawk', slot:'hair', name:'Faux Hawk',       rarity:'rare',      v:'fauxhawk' },
  { id:'h_braids',   slot:'hair', name:'Twin Braids',     rarity:'epic',      v:'braids' },
  { id:'h_halfshave',slot:'hair', name:'Half Shave',      rarity:'epic',      v:'halfshave' },
  { id:'h_frosted',  slot:'hair', name:'Frosted Tips',    rarity:'epic',      v:'frosted' },
  { id:'h_waist',    slot:'hair', name:'Waist-Length Mane',rarity:'legendary',v:'waist' },

  // ---------- FACE ----------
  { id:'f_soul',     slot:'face', name:'Soul Patch',      rarity:'common',    v:'soul' },
  { id:'f_handlebar',slot:'face', name:'Handlebar Stache',rarity:'rare',      v:'handlebar' },
  { id:'f_fullbeard',slot:'face', name:'Full Beard',      rarity:'rare',      v:'fullbeard' },
  { id:'f_eyeblack', slot:'face', name:'Eye Black',       rarity:'rare',      v:'eyeblack' },
  { id:'f_crossface',slot:'face', name:'Cross Paint',     rarity:'epic',      v:'crossface' },
  { id:'f_visorp',   slot:'face', name:'Visor Paint',     rarity:'epic',      v:'visorpaint' },
  { id:'f_bloodied', slot:'face', name:'Crimson Mask',    rarity:'legendary', v:'bloodied' },
  { id:'f_mist',     slot:'face', name:'Green Mist',      rarity:'legendary', v:'mist' },

  // ---------- MASKS ----------
  { id:'m_jaguar',   slot:'mask', name:'Jaguar Mask',     rarity:'rare',      v:'jaguar' },
  { id:'m_wolf',     slot:'mask', name:'Wolf Mask',       rarity:'rare',      v:'wolf' },
  { id:'m_insect',   slot:'mask', name:'Hornet Mask',     rarity:'epic',      v:'insect' },
  { id:'m_bull',     slot:'mask', name:'Bull Mask',       rarity:'epic',      v:'bull' },
  { id:'m_crow',     slot:'mask', name:'Carrion Mask',    rarity:'legendary', v:'crow' },
  { id:'m_dragon',   slot:'mask', name:'Dragon Mask',     rarity:'legendary', v:'dragon' },
  { id:'m_samurai',  slot:'mask', name:'Samurai Menpo',   rarity:'legendary', v:'samurai' },

  // ---------- ATTIRE ----------
  { id:'a_crop',     slot:'attire', name:'Crop Top',      rarity:'common',    v:'crop' },
  { id:'a_sash',     slot:'attire', name:'Shoulder Sash', rarity:'rare',      v:'sash' },
  { id:'a_harness',  slot:'attire', name:'Strap Harness', rarity:'rare',      v:'harness' },
  { id:'a_hoodie',   slot:'attire', name:'Ring Hoodie',   rarity:'rare',      v:'hoodie' },
  { id:'a_gi',       slot:'attire', name:'Dojo Gi',       rarity:'epic',      v:'gi' },
  { id:'a_chaps',    slot:'attire', name:'Leather Chaps', rarity:'epic',      v:'chaps' },
  { id:'a_robe',     slot:'attire', name:'Entrance Robe', rarity:'legendary', v:'robe' },

  // ---------- BOOTS ----------
  { id:'b_barefoot', slot:'boots', name:'Barefoot',       rarity:'common',    v:'barefoot' },
  { id:'b_hightop',  slot:'boots', name:'High Tops',      rarity:'common',    v:'hightop' },
  { id:'b_combat',   slot:'boots', name:'Combat Boots',   rarity:'rare',      v:'combat' },
  { id:'b_cowboy',   slot:'boots', name:'Cowboy Boots',   rarity:'rare',      v:'cowboy' },
  { id:'b_steel',    slot:'boots', name:'Steel Toes',     rarity:'epic',      v:'steel' },
  { id:'b_spiked',   slot:'boots', name:'Spiked Boots',   rarity:'legendary', v:'spiked' },

  // ---------- ACCESSORIES ----------
  { id:'x_armband',  slot:'acc', name:'Arm Bands',        rarity:'common',    v:'armband' },
  { id:'x_necklace', slot:'acc', name:'Pendant',          rarity:'rare',      v:'necklace' },
  { id:'x_towel',    slot:'acc', name:'Neck Towel',       rarity:'rare',      v:'towel' },
  { id:'x_tassels',  slot:'acc', name:'Arm Tassels',      rarity:'rare',      v:'tassels' },
  { id:'x_visor',    slot:'acc', name:'Combat Visor',     rarity:'epic',      v:'visor' },
  { id:'x_facemask', slot:'acc', name:'Protective Mask',  rarity:'epic',      v:'facemask' },
  { id:'x_armorpad', slot:'acc', name:'Shoulder Plate',   rarity:'epic',      v:'armorpad' },
  { id:'x_spikes',   slot:'acc', name:'Spiked Pauldrons', rarity:'legendary', v:'spikes' },
  { id:'x_feather',  slot:'acc', name:'Feather Headdress',rarity:'legendary', v:'feather' },
  { id:'x_crown',    slot:'acc', name:'The Crown',        rarity:'legendary', v:'crown' },

  // ---------- PATTERNS ----------
  { id:'g_pinstripe',slot:'pattern', name:'Pinstripe',    rarity:'common',    v:'pinstripe' },
  { id:'g_polka',    slot:'pattern', name:'Polka Dots',   rarity:'rare',      v:'polka' },
  { id:'g_zigzag',   slot:'pattern', name:'Zig Zag',      rarity:'rare',      v:'zigzag' },
  { id:'g_camo',     slot:'pattern', name:'Camo',         rarity:'epic',      v:'camo' },
  { id:'g_gradient', slot:'pattern', name:'Fade',         rarity:'epic',      v:'gradient' },
  { id:'g_tigerst',  slot:'pattern', name:'Tiger Stripes',rarity:'legendary', v:'tigerstripe' },
  { id:'g_web',      slot:'pattern', name:'Web',          rarity:'legendary', v:'web' },

  // ---------- TATTOOS ----------
  { id:'t_neck',     slot:'tattoo', name:'Neck Ink',      rarity:'common',    v:'neck' },
  { id:'t_barbwire', slot:'tattoo', name:'Barbed Wire',   rarity:'rare',      v:'barbwire' },
  { id:'t_leg',      slot:'tattoo', name:'Leg Piece',     rarity:'rare',      v:'leg' },
  { id:'t_back',     slot:'tattoo', name:'Shoulder Piece',rarity:'epic',      v:'back' },
  { id:'t_kanji',    slot:'tattoo', name:'Kanji Chest',   rarity:'legendary', v:'kanji' },

  // ---------- AURAS ----------
  { id:'au_ice',     slot:'aura', name:'Frost Aura',      rarity:'rare',      v:'ice' },
  { id:'au_neon',    slot:'aura', name:'Neon Frame',      rarity:'rare',      v:'neon' },
  { id:'au_void',    slot:'aura', name:'Void Shroud',     rarity:'epic',      v:'void' },
  { id:'au_pyro',    slot:'aura', name:'Ringside Pyro',   rarity:'legendary', v:'pyro' },
  { id:'au_gilded',  slot:'aura', name:'Gilded Aura',     rarity:'legendary', v:'gilded' }
);

// duplicates convert to shards you can spend on any item of that rarity
window.RTR_SHARD_COST = { common:4, rare:8, epic:16, legendary:32 };
