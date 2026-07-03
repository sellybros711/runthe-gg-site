/* ============================================================================
   RunTheGlobe — country task bank (seed pool)
   ----------------------------------------------------------------------------
   Data-only. Loaded before the engine as window.GLOBE_COUNTRIES.

   Schema (per GDD v1 §17, adapted for the playable engine):
     country: { id, name, region, flag(emoji), capital, tasks:{ <cat>:[task,...] } }
     task:    { cat, type:'brain'|'reflex'|'hybrid', prompt, ...kind-specific }

   The engine derives the interactive "kind" and the miss-penalty from `cat`
   (see PENALTY / KIND maps in index.html), so tasks here never repeat those.

   Category -> kind mapping used by the engine:
     trivia  -> mcq        (q, options[], a=correct index)
     math    -> mcq        (q, options[], a)          — currency / ordering framed as choice
     spatial -> order      (q, items[{label,value}], dir, unit) — order-by-stat
     memory  -> sequence   (prompt, tiles[emoji])     — engine generates the sequence to repeat
     reflex  -> reaction   (prompt)                   — reaction-window tap, engine-driven
     word    -> scramble   (answer, hint)             — unscramble letters

   This is a SEED pool (12 countries) proving the pipeline end to end. GDD §12
   targets ~40-50 countries at launch and ~100 long-term, ~27 tasks each; content
   authoring scales by appending entries here with the same shape — no engine
   changes required.
   ========================================================================== */
(function () {
  "use strict";

  window.GLOBE_COUNTRIES = [
    /* ---------------------------------------------------------------- Japan */
    {
      id: "JP", name: "Japan", region: "Asia", flag: "🇯🇵", capital: "Tokyo",
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Japan?", options: ["Osaka", "Kyoto", "Tokyo", "Sapporo"], a: 2 },
          { cat: "trivia", type: "brain", q: "Mount Fuji is what type of landform?", options: ["Glacier", "Volcano", "Canyon", "Fjord"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Japan?", options: ["Won", "Yuan", "Yen", "Baht"], a: 2 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "TOKYO", hint: "Japan's capital city" },
          { cat: "word", type: "brain", answer: "SUSHI", hint: "Vinegared-rice dish" },
        ],
        math: [
          { cat: "math", type: "brain", q: "¥1,500 at ¥150 = $1 is how many US dollars?", options: ["$5", "$10", "$15", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these Japanese cities north → south", dir: "north", unit: "",
            items: [{ label: "Sapporo", value: 43 }, { label: "Tokyo", value: 36 }, { label: "Osaka", value: 35 }, { label: "Naha", value: 26 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the lantern sequence", tiles: ["🏮", "⛩️", "🗾", "🎌", "🍣"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap the moment the bullet-train signal turns green" }],
      },
    },
    /* -------------------------------------------------------------- Brazil */
    {
      id: "BR", name: "Brazil", region: "South America", flag: "🇧🇷", capital: "Brasília",
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "Which river runs through Brazil?", options: ["Nile", "Amazon", "Danube", "Mekong"], a: 1 },
          { cat: "trivia", type: "brain", q: "The Christ the Redeemer statue overlooks which city?", options: ["São Paulo", "Salvador", "Rio de Janeiro", "Recife"], a: 2 },
          { cat: "trivia", type: "brain", q: "What language is official in Brazil?", options: ["Spanish", "Portuguese", "French", "Italian"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "SAMBA", hint: "Brazilian dance & music style" },
          { cat: "word", type: "brain", answer: "AMAZON", hint: "The great rainforest river" },
        ],
        math: [
          { cat: "math", type: "brain", q: "R$50 at R$5 = $1 converts to how many US dollars?", options: ["$5", "$10", "$25", "$250"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order by population, largest → smallest", dir: "desc", unit: "M",
            items: [{ label: "São Paulo", value: 12 }, { label: "Rio", value: 6.7 }, { label: "Brasília", value: 3 }, { label: "Manaus", value: 2.2 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the carnival sequence", tiles: ["🎭", "🥁", "🦜", "⚽", "🌴"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap on the beat when the drum flashes green" }],
      },
    },
    /* ---------------------------------------------------------------- Italy */
    {
      id: "IT", name: "Italy", region: "Europe", flag: "🇮🇹", capital: "Rome",
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "The Colosseum stands in which city?", options: ["Milan", "Venice", "Rome", "Turin"], a: 2 },
          { cat: "trivia", type: "brain", q: "Which of these is a famous Italian volcano?", options: ["Vesuvius", "Krakatoa", "Fuji", "Etna's rival"], a: 0 },
          { cat: "trivia", type: "brain", q: "Venice is famous for its…", options: ["Deserts", "Canals", "Ski jumps", "Geysers"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "PIZZA", hint: "Naples' most famous export" },
          { cat: "word", type: "brain", answer: "VENICE", hint: "City of canals" },
        ],
        math: [
          { cat: "math", type: "brain", q: "A €12 pizza split 4 ways costs each person…", options: ["€2", "€3", "€4", "€6"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Milan", value: 45 }, { label: "Rome", value: 41 }, { label: "Naples", value: 40 }, { label: "Palermo", value: 38 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the piazza sequence", tiles: ["🍝", "🏛️", "🚤", "🍕", "⛲"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the espresso light flashes green" }],
      },
    },
    /* --------------------------------------------------------------- Egypt */
    {
      id: "EG", name: "Egypt", region: "Africa", flag: "🇪🇬", capital: "Cairo",
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "The Great Pyramids sit near which city?", options: ["Luxor", "Giza", "Alexandria", "Aswan"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which river is Egypt built around?", options: ["Congo", "Niger", "Nile", "Zambezi"], a: 2 },
          { cat: "trivia", type: "brain", q: "Ancient Egyptian writing used…", options: ["Runes", "Hieroglyphs", "Cuneiform", "Kanji"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "SPHINX", hint: "Lion-bodied Giza guardian" },
          { cat: "word", type: "brain", answer: "PHARAOH", hint: "Ancient Egyptian ruler" },
        ],
        math: [
          { cat: "math", type: "brain", q: "A pyramid has 4 triangular faces. How many edges meet at its apex?", options: ["3", "4", "5", "8"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these Nile cities from the delta (north) → south", dir: "north", unit: "",
            items: [{ label: "Alexandria", value: 31 }, { label: "Cairo", value: 30 }, { label: "Luxor", value: 25 }, { label: "Aswan", value: 24 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the tomb sequence", tiles: ["🐪", "🔺", "𓂀", "🏜️", "⚱️"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the desert sun flashes green" }],
      },
    },
    /* --------------------------------------------------------------- France */
    {
      id: "FR", name: "France", region: "Europe", flag: "🇫🇷", capital: "Paris",
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "The Eiffel Tower is in which city?", options: ["Lyon", "Nice", "Paris", "Bordeaux"], a: 2 },
          { cat: "trivia", type: "brain", q: "Which museum houses the Mona Lisa?", options: ["The Louvre", "The Prado", "The Uffizi", "The Tate"], a: 0 },
          { cat: "trivia", type: "brain", q: "France shares a border with which country?", options: ["Portugal", "Spain", "Greece", "Ireland"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "PARIS", hint: "The City of Light" },
          { cat: "word", type: "brain", answer: "LOUVRE", hint: "Home of the Mona Lisa" },
        ],
        math: [
          { cat: "math", type: "brain", q: "A €18 ticket, buy 3 for a group. Total?", options: ["€36", "€48", "€54", "€60"], a: 2 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities west → east", dir: "west", unit: "",
            items: [{ label: "Brest", value: -4 }, { label: "Paris", value: 2 }, { label: "Lyon", value: 4 }, { label: "Nice", value: 7 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the café sequence", tiles: ["🗼", "🥐", "🎨", "🧀", "🚄"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the metro signal flashes green" }],
      },
    },
    /* ------------------------------------------------------------- Australia */
    {
      id: "AU", name: "Australia", region: "Oceania", flag: "🇦🇺", capital: "Canberra",
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Australia?", options: ["Sydney", "Melbourne", "Canberra", "Perth"], a: 2 },
          { cat: "trivia", type: "brain", q: "The Great Barrier Reef lies off which coast?", options: ["South", "West", "Northeast", "Central"], a: 2 },
          { cat: "trivia", type: "brain", q: "Which animal is native to Australia?", options: ["Kangaroo", "Panda", "Reindeer", "Bison"], a: 0 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "SYDNEY", hint: "Home of a famous Opera House" },
          { cat: "word", type: "brain", answer: "OUTBACK", hint: "The vast interior wilderness" },
        ],
        math: [
          { cat: "math", type: "brain", q: "A$30 at A$1.5 = $1 is how many US dollars?", options: ["$15", "$20", "$45", "$60"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities west → east", dir: "west", unit: "",
            items: [{ label: "Perth", value: 116 }, { label: "Adelaide", value: 138 }, { label: "Melbourne", value: 145 }, { label: "Sydney", value: 151 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the outback sequence", tiles: ["🦘", "🐨", "🏄", "🌊", "🎭"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the reef beacon flashes green" }],
      },
    },
    /* --------------------------------------------------------------- Mexico */
    {
      id: "MX", name: "Mexico", region: "North America", flag: "🇲🇽", capital: "Mexico City",
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Mexico?", options: ["Cancún", "Mexico City", "Guadalajara", "Tijuana"], a: 1 },
          { cat: "trivia", type: "brain", q: "Chichén Itzá was built by which civilization?", options: ["Inca", "Aztec/Maya", "Roman", "Viking"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which dish originates from Mexico?", options: ["Sushi", "Tacos", "Pierogi", "Falafel"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "TACOS", hint: "Folded tortilla street food" },
          { cat: "word", type: "brain", answer: "CANCUN", hint: "Caribbean-coast resort city" },
        ],
        math: [
          { cat: "math", type: "brain", q: "200 pesos at 20 pesos = $1 is how many US dollars?", options: ["$5", "$10", "$20", "$40"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order by population, largest → smallest", dir: "desc", unit: "M",
            items: [{ label: "Mexico City", value: 9.2 }, { label: "Guadalajara", value: 1.5 }, { label: "Monterrey", value: 1.1 }, { label: "Cancún", value: 0.9 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the fiesta sequence", tiles: ["🌮", "🌵", "🎸", "🏛️", "🌶️"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the fiesta light flashes green" }],
      },
    },
    /* ----------------------------------------------------------------- India */
    {
      id: "IN", name: "India", region: "Asia", flag: "🇮🇳", capital: "New Delhi",
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "The Taj Mahal is located in which city?", options: ["Mumbai", "Agra", "Jaipur", "Chennai"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which river is considered sacred in India?", options: ["Ganges", "Thames", "Rhine", "Volga"], a: 0 },
          { cat: "trivia", type: "brain", q: "What is the capital of India?", options: ["Mumbai", "Kolkata", "New Delhi", "Bengaluru"], a: 2 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "MUMBAI", hint: "India's largest coastal city" },
          { cat: "word", type: "brain", answer: "CURRY", hint: "Spiced sauce dish" },
        ],
        math: [
          { cat: "math", type: "brain", q: "800 rupees at 80 rupees = $1 is how many US dollars?", options: ["$8", "$10", "$16", "$80"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "New Delhi", value: 28 }, { label: "Mumbai", value: 19 }, { label: "Bengaluru", value: 13 }, { label: "Chennai", value: 13 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the bazaar sequence", tiles: ["🕌", "🐘", "🌶️", "🪷", "🚂"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the market lamp flashes green" }],
      },
    },
    /* ----------------------------------------------------------------- Kenya */
    {
      id: "KE", name: "Kenya", region: "Africa", flag: "🇰🇪", capital: "Nairobi",
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Kenya?", options: ["Mombasa", "Nairobi", "Kisumu", "Nakuru"], a: 1 },
          { cat: "trivia", type: "brain", q: "The Maasai Mara is famous for its…", options: ["Ski slopes", "Wildlife safaris", "Vineyards", "Ice caves"], a: 1 },
          { cat: "trivia", type: "brain", q: "Kenya sits on which continent?", options: ["Asia", "Africa", "Europe", "South America"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "SAFARI", hint: "A wildlife-watching expedition" },
          { cat: "word", type: "brain", answer: "NAIROBI", hint: "Kenya's capital" },
        ],
        math: [
          { cat: "math", type: "brain", q: "A safari drive is 90 min. How many drives fit in 6 hours?", options: ["2", "3", "4", "6"], a: 2 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these animals by weight, heaviest → lightest", dir: "desc", unit: "kg",
            items: [{ label: "Elephant", value: 6000 }, { label: "Rhino", value: 2300 }, { label: "Lion", value: 190 }, { label: "Gazelle", value: 60 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the savanna sequence", tiles: ["🦁", "🐘", "🦒", "🌍", "🌅"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the savanna sun flashes green" }],
      },
    },
    /* ----------------------------------------------------------------- Canada */
    {
      id: "CA", name: "Canada", region: "North America", flag: "🇨🇦", capital: "Ottawa",
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Canada?", options: ["Toronto", "Ottawa", "Vancouver", "Montreal"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which leaf features on Canada's flag?", options: ["Oak", "Maple", "Palm", "Fern"], a: 1 },
          { cat: "trivia", type: "brain", q: "Niagara Falls sits on the border with which country?", options: ["Mexico", "USA", "Greenland", "Iceland"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "TORONTO", hint: "Canada's largest city" },
          { cat: "word", type: "brain", answer: "MAPLE", hint: "The syrup — and the flag — tree" },
        ],
        math: [
          { cat: "math", type: "brain", q: "C$40 at C$1.25 = $1 is how many US dollars?", options: ["$25", "$32", "$40", "$50"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities west → east", dir: "west", unit: "",
            items: [{ label: "Vancouver", value: -123 }, { label: "Calgary", value: -114 }, { label: "Toronto", value: -79 }, { label: "Montreal", value: -73 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the north sequence", tiles: ["🍁", "🏒", "🦫", "🏔️", "⛸️"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the aurora flashes green" }],
      },
    },
    /* ---------------------------------------------------------------- Greece */
    {
      id: "GR", name: "Greece", region: "Europe", flag: "🇬🇷", capital: "Athens",
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "The Parthenon crowns which city?", options: ["Athens", "Sparta", "Thebes", "Corinth"], a: 0 },
          { cat: "trivia", type: "brain", q: "The ancient Olympics began in which country?", options: ["Italy", "Greece", "Egypt", "Turkey"], a: 1 },
          { cat: "trivia", type: "brain", q: "Santorini is a Greek…", options: ["Mountain", "Island", "River", "Desert"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "ATHENS", hint: "Greece's capital" },
          { cat: "word", type: "brain", answer: "OLYMPUS", hint: "Mythical mountain of the gods" },
        ],
        math: [
          { cat: "math", type: "brain", q: "The first modern Olympics were in 1896. How many years to 1996?", options: ["50", "80", "100", "120"], a: 2 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these islands by size, largest → smallest", dir: "desc", unit: "km²",
            items: [{ label: "Crete", value: 8336 }, { label: "Rhodes", value: 1401 }, { label: "Corfu", value: 610 }, { label: "Santorini", value: 76 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the Aegean sequence", tiles: ["🏛️", "🫒", "⚓", "🏺", "☀️"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the Aegean sun flashes green" }],
      },
    },
    /* -------------------------------------------------------------- Thailand */
    {
      id: "TH", name: "Thailand", region: "Asia", flag: "🇹🇭", capital: "Bangkok",
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Thailand?", options: ["Phuket", "Bangkok", "Chiang Mai", "Pattaya"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Thailand?", options: ["Baht", "Yen", "Ringgit", "Dong"], a: 0 },
          { cat: "trivia", type: "brain", q: "Thailand is located in which region?", options: ["East Africa", "Southeast Asia", "Central Europe", "The Andes"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "BANGKOK", hint: "Thailand's capital" },
          { cat: "word", type: "brain", answer: "TEMPLE", hint: "A 'wat' is this kind of building" },
        ],
        math: [
          { cat: "math", type: "brain", q: "350 baht at 35 baht = $1 is how many US dollars?", options: ["$5", "$10", "$35", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Chiang Mai", value: 19 }, { label: "Bangkok", value: 14 }, { label: "Surat Thani", value: 9 }, { label: "Phuket", value: 8 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the market sequence", tiles: ["🛕", "🐘", "🌶️", "🛶", "🏝️"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the tuk-tuk light flashes green" }],
      },
    },
  ];
})();
