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
      id: "JP", name: "Japan", region: "Asia", flag: "🇯🇵", capital: "Tokyo", ll: [35.7, 139.7],
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
      id: "BR", name: "Brazil", region: "South America", flag: "🇧🇷", capital: "Brasília", ll: [-15.8, -47.9],
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
      id: "IT", name: "Italy", region: "Europe", flag: "🇮🇹", capital: "Rome", ll: [41.9, 12.5],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "The Colosseum stands in which city?", options: ["Milan", "Venice", "Rome", "Turin"], a: 2 },
          { cat: "trivia", type: "brain", q: "Which of these is a famous Italian volcano?", options: ["Vesuvius", "Krakatoa", "Fuji", "Kilauea"], a: 0 },
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
      id: "EG", name: "Egypt", region: "Africa", flag: "🇪🇬", capital: "Cairo", ll: [30.0, 31.2],
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
      id: "FR", name: "France", region: "Europe", flag: "🇫🇷", capital: "Paris", ll: [48.9, 2.4],
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
      id: "AU", name: "Australia", region: "Oceania", flag: "🇦🇺", capital: "Canberra", ll: [-35.3, 149.1],
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
      id: "MX", name: "Mexico", region: "North America", flag: "🇲🇽", capital: "Mexico City", ll: [19.4, -99.1],
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
      id: "IN", name: "India", region: "Asia", flag: "🇮🇳", capital: "New Delhi", ll: [28.6, 77.2],
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
      id: "KE", name: "Kenya", region: "Africa", flag: "🇰🇪", capital: "Nairobi", ll: [-1.3, 36.8],
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
      id: "CA", name: "Canada", region: "North America", flag: "🇨🇦", capital: "Ottawa", ll: [45.4, -75.7],
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
      id: "GR", name: "Greece", region: "Europe", flag: "🇬🇷", capital: "Athens", ll: [38.0, 23.7],
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
      id: "TH", name: "Thailand", region: "Asia", flag: "🇹🇭", capital: "Bangkok", ll: [13.8, 100.5],
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
    /* ---------------------------------------------------------------- Spain */
    {
      id: "ES", name: "Spain", region: "Europe", flag: "🇪🇸", capital: "Madrid", ll: [40.4, -3.7],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Spain?", options: ["Barcelona", "Madrid", "Seville", "Valencia"], a: 1 },
          { cat: "trivia", type: "brain", q: "The Sagrada Família basilica is located in which city?", options: ["Madrid", "Barcelona", "Granada", "Bilbao"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Spain?", options: ["Peseta", "Pound", "Euro", "Franc"], a: 2 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "PAELLA", hint: "Saffron rice dish from Valencia" },
          { cat: "word", type: "brain", answer: "MADRID", hint: "Spain's capital city" },
        ],
        math: [
          { cat: "math", type: "brain", q: "A €9 tapas plate, order 3 for the table. Total?", options: ["€18", "€24", "€27", "€30"], a: 2 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Bilbao", value: 43 }, { label: "Barcelona", value: 41 }, { label: "Madrid", value: 40 }, { label: "Seville", value: 37 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the flamenco sequence", tiles: ["💃", "🥘", "🎸", "🐂", "🏰"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the flamenco light flashes green" }],
      },
    },
    /* -------------------------------------------------------------- Germany */
    {
      id: "DE", name: "Germany", region: "Europe", flag: "🇩🇪", capital: "Berlin", ll: [52.5, 13.4],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Germany?", options: ["Munich", "Hamburg", "Berlin", "Frankfurt"], a: 2 },
          { cat: "trivia", type: "brain", q: "The Oktoberfest beer festival is held in which city?", options: ["Berlin", "Munich", "Cologne", "Dresden"], a: 1 },
          { cat: "trivia", type: "brain", q: "The Brandenburg Gate is a landmark in which city?", options: ["Hamburg", "Stuttgart", "Berlin", "Bonn"], a: 2 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "BERLIN", hint: "Germany's capital city" },
          { cat: "word", type: "brain", answer: "PRETZEL", hint: "Knotted baked snack" },
        ],
        math: [
          { cat: "math", type: "brain", q: "A €6 stein of beer, buy 4 for friends. Total?", options: ["€18", "€24", "€28", "€30"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Hamburg", value: 53 }, { label: "Berlin", value: 52 }, { label: "Frankfurt", value: 50 }, { label: "Munich", value: 48 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the festival sequence", tiles: ["🍺", "🥨", "🏰", "🚗", "🌲"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the autobahn signal flashes green" }],
      },
    },
    /* -------------------------------------------------------- United Kingdom */
    {
      id: "GB", name: "United Kingdom", region: "Europe", flag: "🇬🇧", capital: "London", ll: [51.5, -0.1],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of the United Kingdom?", options: ["Manchester", "London", "Edinburgh", "Liverpool"], a: 1 },
          { cat: "trivia", type: "brain", q: "The prehistoric monument Stonehenge is located in which country?", options: ["France", "United Kingdom", "Ireland", "Spain"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which currency is used in the United Kingdom?", options: ["Euro", "Dollar", "Pound", "Krona"], a: 2 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "LONDON", hint: "The UK's capital city" },
          { cat: "word", type: "brain", answer: "THAMES", hint: "The river running through London" },
        ],
        math: [
          { cat: "math", type: "brain", q: "A £5 tube ticket, buy 3 for the group. Total?", options: ["£10", "£15", "£18", "£20"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Edinburgh", value: 56 }, { label: "Manchester", value: 53 }, { label: "Birmingham", value: 52 }, { label: "London", value: 51 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the royal sequence", tiles: ["🎡", "☂️", "🚌", "👑", "☕"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when Big Ben's light flashes green" }],
      },
    },
    /* ------------------------------------------------------------- Portugal */
    {
      id: "PT", name: "Portugal", region: "Europe", flag: "🇵🇹", capital: "Lisbon", ll: [38.7, -9.1],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Portugal?", options: ["Porto", "Lisbon", "Faro", "Braga"], a: 1 },
          { cat: "trivia", type: "brain", q: "Portugal is famous for which fortified wine?", options: ["Sherry", "Port", "Marsala", "Vermouth"], a: 1 },
          { cat: "trivia", type: "brain", q: "The Belém Tower stands in which city?", options: ["Lisbon", "Porto", "Coimbra", "Sintra"], a: 0 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "LISBON", hint: "Portugal's capital city" },
          { cat: "word", type: "brain", answer: "PORTO", hint: "Northern city famous for wine" },
        ],
        math: [
          { cat: "math", type: "brain", q: "A €7 pastel de nata box, buy 2. Total?", options: ["€12", "€14", "€16", "€21"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Porto", value: 41 }, { label: "Coimbra", value: 40 }, { label: "Lisbon", value: 39 }, { label: "Faro", value: 37 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the coastal sequence", tiles: ["🍷", "⛵", "🐟", "🏰", "🌊"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the tram light flashes green" }],
      },
    },
    /* ---------------------------------------------------------- Netherlands */
    {
      id: "NL", name: "Netherlands", region: "Europe", flag: "🇳🇱", capital: "Amsterdam", ll: [52.4, 4.9],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of the Netherlands?", options: ["Rotterdam", "The Hague", "Amsterdam", "Utrecht"], a: 2 },
          { cat: "trivia", type: "brain", q: "The Netherlands is famous for which spring flower?", options: ["Rose", "Tulip", "Orchid", "Lily"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which structure is a Dutch icon used to grind grain and pump water?", options: ["Windmill", "Lighthouse", "Ziggurat", "Aqueduct"], a: 0 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "TULIPS", hint: "Famous Dutch spring flowers" },
          { cat: "word", type: "brain", answer: "CANALS", hint: "Amsterdam's waterway network" },
        ],
        math: [
          { cat: "math", type: "brain", q: "A €8 bike rental, hire 3 bikes. Total?", options: ["€16", "€21", "€24", "€32"], a: 2 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Groningen", value: 53 }, { label: "Amsterdam", value: 52 }, { label: "Rotterdam", value: 51 }, { label: "Maastricht", value: 50 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the canal sequence", tiles: ["🌷", "🚲", "🧀", "⛵", "🪟"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the windmill light flashes green" }],
      },
    },
    /* --------------------------------------------------------------- Ireland */
    {
      id: "IE", name: "Ireland", region: "Europe", flag: "🇮🇪", capital: "Dublin", ll: [53.3, -6.3],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Ireland?", options: ["Cork", "Dublin", "Galway", "Limerick"], a: 1 },
          { cat: "trivia", type: "brain", q: "The Cliffs of Moher are found in which country?", options: ["Scotland", "Ireland", "Wales", "Iceland"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which three-leaved plant is a symbol of Ireland?", options: ["Shamrock", "Thistle", "Daffodil", "Ivy"], a: 0 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "DUBLIN", hint: "Ireland's capital city" },
          { cat: "word", type: "brain", answer: "EMERALD", hint: "Ireland is the '____ Isle'" },
        ],
        math: [
          { cat: "math", type: "brain", q: "A €4 scone, buy 5 for the table. Total?", options: ["€16", "€18", "€20", "€25"], a: 2 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Sligo", value: 54 }, { label: "Dublin", value: 53 }, { label: "Limerick", value: 52 }, { label: "Cork", value: 51 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the emerald sequence", tiles: ["🍀", "🎻", "🏰", "🌈", "🐑"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the clover light flashes green" }],
      },
    },
    /* ---------------------------------------------------------------- Sweden */
    {
      id: "SE", name: "Sweden", region: "Europe", flag: "🇸🇪", capital: "Stockholm", ll: [59.3, 18.1],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Sweden?", options: ["Gothenburg", "Malmö", "Stockholm", "Uppsala"], a: 2 },
          { cat: "trivia", type: "brain", q: "The pop group ABBA came from which country?", options: ["Norway", "Sweden", "Finland", "Denmark"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Sweden?", options: ["Euro", "Krona", "Mark", "Ruble"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "SWEDEN", hint: "Nordic country, capital Stockholm" },
          { cat: "word", type: "brain", answer: "VIKING", hint: "Norse seafaring warrior" },
        ],
        math: [
          { cat: "math", type: "brain", q: "100 kronor at 10 kronor = $1 is how many US dollars?", options: ["$5", "$10", "$20", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Kiruna", value: 67 }, { label: "Stockholm", value: 59 }, { label: "Gothenburg", value: 57 }, { label: "Malmö", value: 55 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the Nordic sequence", tiles: ["❄️", "🎿", "🛶", "🌲", "🦌"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the aurora light flashes green" }],
      },
    },
    /* ---------------------------------------------------------------- Norway */
    {
      id: "NO", name: "Norway", region: "Europe", flag: "🇳🇴", capital: "Oslo", ll: [59.9, 10.8],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Norway?", options: ["Bergen", "Oslo", "Trondheim", "Stavanger"], a: 1 },
          { cat: "trivia", type: "brain", q: "Norway's coastline is famous for its deep glacial…", options: ["Canyons", "Fjords", "Deltas", "Reefs"], a: 1 },
          { cat: "trivia", type: "brain", q: "The Northern Lights are best seen in which of these?", options: ["Norway", "Egypt", "Brazil", "India"], a: 0 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "FJORDS", hint: "Deep Norwegian sea inlets" },
          { cat: "word", type: "brain", answer: "NORWAY", hint: "Nordic country, capital Oslo" },
        ],
        math: [
          { cat: "math", type: "brain", q: "200 kroner at 10 kroner = $1 is how many US dollars?", options: ["$10", "$20", "$40", "$200"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Tromsø", value: 69 }, { label: "Trondheim", value: 63 }, { label: "Bergen", value: 60 }, { label: "Oslo", value: 59 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the fjord sequence", tiles: ["🏔️", "⛴️", "🐟", "❄️", "🌌"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the fjord beacon flashes green" }],
      },
    },
    /* ----------------------------------------------------------- Switzerland */
    {
      id: "CH", name: "Switzerland", region: "Europe", flag: "🇨🇭", capital: "Bern", ll: [46.9, 7.4],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Switzerland?", options: ["Zurich", "Geneva", "Bern", "Basel"], a: 2 },
          { cat: "trivia", type: "brain", q: "The Matterhorn is a peak in which mountain range?", options: ["Andes", "Alps", "Rockies", "Himalayas"], a: 1 },
          { cat: "trivia", type: "brain", q: "Switzerland is world-renowned for chocolate and…", options: ["Watches", "Diamonds", "Silk", "Tea"], a: 0 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "CHEESE", hint: "Swiss fondue is made of this" },
          { cat: "word", type: "brain", answer: "SWISS", hint: "Adjective for things from Switzerland" },
        ],
        math: [
          { cat: "math", type: "brain", q: "20 francs at 1 franc = $1.10 is roughly how many US dollars?", options: ["$18", "$22", "$25", "$30"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Basel", value: 47.6 }, { label: "Zurich", value: 47.4 }, { label: "Bern", value: 46.9 }, { label: "Lugano", value: 46.0 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the Alpine sequence", tiles: ["🏔️", "🍫", "⌚", "🧀", "🐄"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the Alpine light flashes green" }],
      },
    },
    /* ---------------------------------------------------------------- Turkey */
    {
      id: "TR", name: "Turkey", region: "Europe/Asia", flag: "🇹🇷", capital: "Ankara", ll: [39.9, 32.9],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Turkey?", options: ["Istanbul", "Ankara", "Izmir", "Antalya"], a: 1 },
          { cat: "trivia", type: "brain", q: "The Hagia Sophia and Blue Mosque are found in which city?", options: ["Ankara", "Istanbul", "Bursa", "Konya"], a: 1 },
          { cat: "trivia", type: "brain", q: "Cappadocia is famous for hot-air balloons over which landscape?", options: ["Coral reefs", "Fairy chimney rocks", "Ice fields", "Sand dunes"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "ISTANBUL", hint: "Turkey's largest city, on two continents" },
          { cat: "word", type: "brain", answer: "KEBAB", hint: "Grilled skewered meat dish" },
        ],
        math: [
          { cat: "math", type: "brain", q: "300 lira at 30 lira = $1 is how many US dollars?", options: ["$3", "$10", "$30", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Istanbul", value: 41 }, { label: "Ankara", value: 40 }, { label: "Izmir", value: 38 }, { label: "Antalya", value: 37 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the bazaar sequence", tiles: ["🕌", "🎈", "🍵", "🧿", "🌙"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the balloon burner flashes green" }],
      },
    },
    /* ---------------------------------------------------------------- Russia */
    {
      id: "RU", name: "Russia", region: "Europe", flag: "🇷🇺", capital: "Moscow", ll: [55.8, 37.6],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Russia?", options: ["St. Petersburg", "Moscow", "Kazan", "Sochi"], a: 1 },
          { cat: "trivia", type: "brain", q: "Red Square and the Kremlin are located in which city?", options: ["Moscow", "Kyiv", "Minsk", "Novosibirsk"], a: 0 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Russia?", options: ["Ruble", "Zloty", "Lira", "Krona"], a: 0 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "MOSCOW", hint: "Russia's capital city" },
          { cat: "word", type: "brain", answer: "KREMLIN", hint: "Fortified complex in Moscow" },
        ],
        math: [
          { cat: "math", type: "brain", q: "700 rubles at 70 rubles = $1 is how many US dollars?", options: ["$7", "$10", "$70", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "St. Petersburg", value: 60 }, { label: "Moscow", value: 56 }, { label: "Volgograd", value: 49 }, { label: "Sochi", value: 43 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the winter palace sequence", tiles: ["🏰", "❄️", "🪆", "🐻", "⛪"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the Kremlin bell flashes green" }],
      },
    },
    /* ---------------------------------------------------------------- Poland */
    {
      id: "PL", name: "Poland", region: "Europe", flag: "🇵🇱", capital: "Warsaw", ll: [52.2, 21.0],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Poland?", options: ["Kraków", "Warsaw", "Gdańsk", "Wrocław"], a: 1 },
          { cat: "trivia", type: "brain", q: "Wawel Castle is a landmark in which Polish city?", options: ["Warsaw", "Kraków", "Poznań", "Łódź"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which stuffed dumpling is a Polish staple?", options: ["Ravioli", "Pierogi", "Gyoza", "Momo"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "WARSAW", hint: "Poland's capital city" },
          { cat: "word", type: "brain", answer: "PIEROGI", hint: "Polish stuffed dumplings" },
        ],
        math: [
          { cat: "math", type: "brain", q: "40 zloty at 4 zloty = $1 is how many US dollars?", options: ["$4", "$10", "$40", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Gdańsk", value: 54 }, { label: "Warsaw", value: 52 }, { label: "Wrocław", value: 51 }, { label: "Kraków", value: 50 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the old town sequence", tiles: ["🏰", "🥟", "⛪", "🎻", "🌲"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the castle lamp flashes green" }],
      },
    },
    /* ----------------------------------------------------------------- China */
    {
      id: "CN", name: "China", region: "Asia", flag: "🇨🇳", capital: "Beijing", ll: [39.9, 116.4],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of China?", options: ["Shanghai", "Beijing", "Guangzhou", "Shenzhen"], a: 1 },
          { cat: "trivia", type: "brain", q: "The Great Wall is a landmark of which country?", options: ["Japan", "China", "Mongolia", "Korea"], a: 1 },
          { cat: "trivia", type: "brain", q: "The Forbidden City palace complex is in which city?", options: ["Xi'an", "Beijing", "Nanjing", "Chengdu"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "BEIJING", hint: "China's capital city" },
          { cat: "word", type: "brain", answer: "DRAGON", hint: "Mythical creature of Chinese festivals" },
        ],
        math: [
          { cat: "math", type: "brain", q: "70 yuan at 7 yuan = $1 is how many US dollars?", options: ["$7", "$10", "$70", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Beijing", value: 40 }, { label: "Xi'an", value: 34 }, { label: "Shanghai", value: 31 }, { label: "Guangzhou", value: 23 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the dynasty sequence", tiles: ["🐉", "🏯", "🏮", "🐼", "🍜"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the lantern flashes green" }],
      },
    },
    /* ----------------------------------------------------------- South Korea */
    {
      id: "KR", name: "South Korea", region: "Asia", flag: "🇰🇷", capital: "Seoul", ll: [37.6, 127.0],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of South Korea?", options: ["Busan", "Seoul", "Incheon", "Daegu"], a: 1 },
          { cat: "trivia", type: "brain", q: "Gyeongbokgung is a famous royal ____ in Seoul.", options: ["Bridge", "Palace", "Stadium", "Harbour"], a: 1 },
          { cat: "trivia", type: "brain", q: "Kimchi is a Korean dish of fermented…", options: ["Fish", "Vegetables", "Cheese", "Beans"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "SEOUL", hint: "South Korea's capital city" },
          { cat: "word", type: "brain", answer: "KIMCHI", hint: "Fermented cabbage side dish" },
        ],
        math: [
          { cat: "math", type: "brain", q: "13,000 won at 1,300 won = $1 is how many US dollars?", options: ["$1", "$10", "$13", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Seoul", value: 37.5 }, { label: "Daejeon", value: 36.3 }, { label: "Daegu", value: 35.9 }, { label: "Busan", value: 35.2 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the K-pop sequence", tiles: ["🏯", "🥬", "🎤", "🍜", "🌸"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the stage light flashes green" }],
      },
    },
    /* --------------------------------------------------------------- Vietnam */
    {
      id: "VN", name: "Vietnam", region: "Asia", flag: "🇻🇳", capital: "Hanoi", ll: [21.0, 105.8],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Vietnam?", options: ["Ho Chi Minh City", "Hanoi", "Da Nang", "Hue"], a: 1 },
          { cat: "trivia", type: "brain", q: "Ha Long Bay is famous for its thousands of limestone…", options: ["Islands", "Waterfalls", "Sand dunes", "Glaciers"], a: 0 },
          { cat: "trivia", type: "brain", q: "Which noodle soup is a Vietnamese classic?", options: ["Ramen", "Pho", "Laksa", "Udon"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "HANOI", hint: "Vietnam's capital city" },
          { cat: "word", type: "brain", answer: "NOODLE", hint: "The 'pho' soup is full of this" },
        ],
        math: [
          { cat: "math", type: "brain", q: "A bowl of pho is 50,000 dong. Two bowls cost?", options: ["70,000", "100,000", "150,000", "500,000"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Hanoi", value: 21 }, { label: "Da Nang", value: 16 }, { label: "Nha Trang", value: 12 }, { label: "Ho Chi Minh City", value: 11 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the delta sequence", tiles: ["🛶", "🍜", "🎋", "🏝️", "🌾"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the lantern light flashes green" }],
      },
    },
    /* ------------------------------------------------------------- Indonesia */
    {
      id: "ID", name: "Indonesia", region: "Asia", flag: "🇮🇩", capital: "Jakarta", ll: [-6.2, 106.8],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Indonesia?", options: ["Bali", "Jakarta", "Surabaya", "Bandung"], a: 1 },
          { cat: "trivia", type: "brain", q: "Borobudur, the world's largest Buddhist temple, is in Indonesia on which island?", options: ["Java", "Sumatra", "Borneo", "Sulawesi"], a: 0 },
          { cat: "trivia", type: "brain", q: "The Komodo dragon is native to which country?", options: ["Thailand", "Indonesia", "Philippines", "Malaysia"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "JAKARTA", hint: "Indonesia's capital city" },
          { cat: "word", type: "brain", answer: "ISLAND", hint: "Indonesia has thousands of these" },
        ],
        math: [
          { cat: "math", type: "brain", q: "150,000 rupiah at 15,000 rupiah = $1 is how many US dollars?", options: ["$1", "$10", "$15", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Medan", value: 3.5 }, { label: "Jakarta", value: -6 }, { label: "Surabaya", value: -7 }, { label: "Denpasar", value: -8 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the archipelago sequence", tiles: ["🏝️", "🐉", "🛕", "🌋", "🌊"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the volcano beacon flashes green" }],
      },
    },
    /* ----------------------------------------------------------- Philippines */
    {
      id: "PH", name: "Philippines", region: "Asia", flag: "🇵🇭", capital: "Manila", ll: [14.6, 121.0],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of the Philippines?", options: ["Cebu", "Manila", "Davao", "Boracay"], a: 1 },
          { cat: "trivia", type: "brain", q: "The Philippines is an archipelago of how many islands (approx.)?", options: ["Around 50", "Around 700", "Over 7,000", "Just 1"], a: 2 },
          { cat: "trivia", type: "brain", q: "Boracay is famous for its white-sand…", options: ["Deserts", "Beaches", "Glaciers", "Caves"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "MANILA", hint: "The Philippines' capital city" },
          { cat: "word", type: "brain", answer: "BEACHES", hint: "Boracay is famous for these" },
        ],
        math: [
          { cat: "math", type: "brain", q: "560 pesos at 56 pesos = $1 is how many US dollars?", options: ["$6", "$10", "$56", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Baguio", value: 16 }, { label: "Manila", value: 15 }, { label: "Cebu", value: 10 }, { label: "Davao", value: 7 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the island sequence", tiles: ["🏝️", "🌴", "🐠", "🛶", "☀️"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the beach beacon flashes green" }],
      },
    },
    /* ------------------------------------------------------------- Singapore */
    {
      id: "SG", name: "Singapore", region: "Asia", flag: "🇸🇬", capital: "Singapore", ll: [1.3, 103.8],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "The Merlion is the national symbol of which country?", options: ["Malaysia", "Singapore", "Thailand", "Indonesia"], a: 1 },
          { cat: "trivia", type: "brain", q: "Marina Bay Sands, with its rooftop pool, is a landmark in which city?", options: ["Singapore", "Dubai", "Hong Kong", "Bangkok"], a: 0 },
          { cat: "trivia", type: "brain", q: "'Gardens by the Bay' with its Supertrees is found in…", options: ["Tokyo", "Singapore", "Seoul", "Manila"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "MERLION", hint: "Singapore's lion-fish mascot" },
          { cat: "word", type: "brain", answer: "MARINA", hint: "___ Bay Sands hotel" },
        ],
        math: [
          { cat: "math", type: "brain", q: "S$27 split between 3 friends costs each…", options: ["S$7", "S$9", "S$12", "S$27"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these Southeast Asian cities north → south", dir: "north", unit: "",
            items: [{ label: "Bangkok", value: 14 }, { label: "Kuala Lumpur", value: 3 }, { label: "Singapore", value: 1.3 }, { label: "Jakarta", value: -6 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the skyline sequence", tiles: ["🦁", "🌆", "🌳", "🍜", "🎡"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the marina light flashes green" }],
      },
    },
    /* --------------------------------------------------- United Arab Emirates */
    {
      id: "AE", name: "United Arab Emirates", region: "Middle East", flag: "🇦🇪", capital: "Abu Dhabi", ll: [24.5, 54.4],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of the United Arab Emirates?", options: ["Dubai", "Abu Dhabi", "Sharjah", "Al Ain"], a: 1 },
          { cat: "trivia", type: "brain", q: "The Burj Khalifa, the world's tallest building, is in which city?", options: ["Abu Dhabi", "Dubai", "Doha", "Riyadh"], a: 1 },
          { cat: "trivia", type: "brain", q: "The artificial Palm Jumeirah islands are found in…", options: ["Dubai", "Abu Dhabi", "Muscat", "Manama"], a: 0 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "DUBAI", hint: "UAE city of the Burj Khalifa" },
          { cat: "word", type: "brain", answer: "DESERT", hint: "Sandy landscape covering the UAE" },
        ],
        math: [
          { cat: "math", type: "brain", q: "37 dirham at 3.7 dirham = $1 is how many US dollars?", options: ["$3.70", "$10", "$37", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these Emirati cities by population, largest → smallest", dir: "desc", unit: "M",
            items: [{ label: "Dubai", value: 3.5 }, { label: "Sharjah", value: 1.8 }, { label: "Abu Dhabi", value: 1.5 }, { label: "Al Ain", value: 0.8 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the skyline sequence", tiles: ["🏙️", "🐫", "🏝️", "🕌", "🌇"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the tower light flashes green" }],
      },
    },
    /* ---------------------------------------------------------- Saudi Arabia */
    {
      id: "SA", name: "Saudi Arabia", region: "Middle East", flag: "🇸🇦", capital: "Riyadh", ll: [24.7, 46.7],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Saudi Arabia?", options: ["Jeddah", "Riyadh", "Mecca", "Medina"], a: 1 },
          { cat: "trivia", type: "brain", q: "The holy city of Mecca is located in which country?", options: ["Jordan", "Saudi Arabia", "Egypt", "Iraq"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Saudi Arabia?", options: ["Dirham", "Riyal", "Dinar", "Rial"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "RIYADH", hint: "Saudi Arabia's capital city" },
          { cat: "word", type: "brain", answer: "CAMEL", hint: "Desert 'ship' animal" },
        ],
        math: [
          { cat: "math", type: "brain", q: "A riyal is fixed near $0.27. About how much are 40 riyals?", options: ["$5", "$11", "$27", "$40"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Tabuk", value: 28 }, { label: "Riyadh", value: 25 }, { label: "Mecca", value: 21 }, { label: "Jizan", value: 17 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the desert sequence", tiles: ["🐫", "🏜️", "🕌", "🌴", "⭐"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the desert sun flashes green" }],
      },
    },
    /* ---------------------------------------------------------------- Israel */
    {
      id: "IL", name: "Israel", region: "Middle East", flag: "🇮🇱", capital: "Jerusalem", ll: [31.8, 35.2],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Israel?", options: ["Tel Aviv", "Jerusalem", "Haifa", "Eilat"], a: 1 },
          { cat: "trivia", type: "brain", q: "The Dead Sea is famous because swimmers do what easily?", options: ["Sink", "Float", "Freeze", "Dive deep"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Israel?", options: ["Shekel", "Pound", "Dinar", "Lira"], a: 0 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "ISRAEL", hint: "Middle Eastern country, capital Jerusalem" },
          { cat: "word", type: "brain", answer: "HAIFA", hint: "Israeli port city on Mount Carmel" },
        ],
        math: [
          { cat: "math", type: "brain", q: "36 shekels at 3.6 shekels = $1 is how many US dollars?", options: ["$3.60", "$10", "$36", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Haifa", value: 32.8 }, { label: "Tel Aviv", value: 32.1 }, { label: "Jerusalem", value: 31.8 }, { label: "Eilat", value: 29.5 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the old city sequence", tiles: ["🕍", "🕌", "⛪", "🌊", "🏜️"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the old city lamp flashes green" }],
      },
    },
    /* ----------------------------------------------------------------- Nepal */
    {
      id: "NP", name: "Nepal", region: "Asia", flag: "🇳🇵", capital: "Kathmandu", ll: [27.7, 85.3],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Nepal?", options: ["Pokhara", "Kathmandu", "Lalitpur", "Biratnagar"], a: 1 },
          { cat: "trivia", type: "brain", q: "Mount Everest, Earth's highest peak, sits on Nepal's border in which range?", options: ["Alps", "Himalayas", "Andes", "Rockies"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Nepal?", options: ["Rupee", "Taka", "Baht", "Kyat"], a: 0 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "EVEREST", hint: "The world's highest mountain" },
          { cat: "word", type: "brain", answer: "NEPAL", hint: "Himalayan country, capital Kathmandu" },
        ],
        math: [
          { cat: "math", type: "brain", q: "1,300 rupees at 130 rupees = $1 is how many US dollars?", options: ["$1", "$10", "$13", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Pokhara", value: 28.2 }, { label: "Kathmandu", value: 27.7 }, { label: "Birgunj", value: 27.0 }, { label: "Biratnagar", value: 26.5 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the Himalayan sequence", tiles: ["🏔️", "🚩", "🛕", "🧗", "🌄"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the summit beacon flashes green" }],
      },
    },
    /* ---------------------------------------------------------- South Africa */
    {
      id: "ZA", name: "South Africa", region: "Africa", flag: "🇿🇦", capital: "Pretoria", ll: [-25.7, 28.2],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "Table Mountain overlooks which South African city?", options: ["Johannesburg", "Cape Town", "Durban", "Pretoria"], a: 1 },
          { cat: "trivia", type: "brain", q: "A wildlife-viewing trip to see the 'Big Five' is called a…", options: ["Safari", "Cruise", "Trek", "Regatta"], a: 0 },
          { cat: "trivia", type: "brain", q: "Which currency is used in South Africa?", options: ["Rand", "Shilling", "Cedi", "Naira"], a: 0 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "SAFARI", hint: "A wildlife-watching expedition" },
          { cat: "word", type: "brain", answer: "DIAMOND", hint: "Precious gem South Africa is known for" },
        ],
        math: [
          { cat: "math", type: "brain", q: "180 rand at 18 rand = $1 is how many US dollars?", options: ["$8", "$10", "$18", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Pretoria", value: -25.7 }, { label: "Johannesburg", value: -26.2 }, { label: "Durban", value: -29.9 }, { label: "Cape Town", value: -33.9 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the safari sequence", tiles: ["🦁", "🐘", "🦓", "⛰️", "💎"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the safari beacon flashes green" }],
      },
    },
    /* --------------------------------------------------------------- Morocco */
    {
      id: "MA", name: "Morocco", region: "Africa", flag: "🇲🇦", capital: "Rabat", ll: [34.0, -6.8],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Morocco?", options: ["Casablanca", "Rabat", "Marrakech", "Fez"], a: 1 },
          { cat: "trivia", type: "brain", q: "The world's largest hot desert, bordering Morocco, is the…", options: ["Gobi", "Sahara", "Kalahari", "Mojave"], a: 1 },
          { cat: "trivia", type: "brain", q: "The lively old walled market quarters of Moroccan cities are called…", options: ["Medinas", "Fjords", "Plazas", "Piers"], a: 0 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "SAHARA", hint: "Vast desert bordering Morocco" },
          { cat: "word", type: "brain", answer: "TAGINE", hint: "Slow-cooked Moroccan stew (and its pot)" },
        ],
        math: [
          { cat: "math", type: "brain", q: "100 dirham at 10 dirham = $1 is how many US dollars?", options: ["$1", "$10", "$100", "$1000"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Tangier", value: 35.8 }, { label: "Rabat", value: 34.0 }, { label: "Casablanca", value: 33.6 }, { label: "Marrakech", value: 31.6 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the medina sequence", tiles: ["🕌", "🐫", "🫖", "🏜️", "🧵"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the lantern light flashes green" }],
      },
    },
    /* --------------------------------------------------------------- Nigeria */
    {
      id: "NG", name: "Nigeria", region: "Africa", flag: "🇳🇬", capital: "Abuja", ll: [9.1, 7.5],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Nigeria?", options: ["Lagos", "Abuja", "Kano", "Ibadan"], a: 1 },
          { cat: "trivia", type: "brain", q: "Lagos is best described as Nigeria's…", options: ["Capital", "Largest city", "Smallest town", "Mountain resort"], a: 1 },
          { cat: "trivia", type: "brain", q: "Nigeria's booming film industry is nicknamed…", options: ["Bollywood", "Nollywood", "Hollywood", "Lollywood"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "LAGOS", hint: "Nigeria's largest city" },
          { cat: "word", type: "brain", answer: "NIGERIA", hint: "West African country, capital Abuja" },
        ],
        math: [
          { cat: "math", type: "brain", q: "15,000 naira at 1,500 naira = $1 is how many US dollars?", options: ["$1", "$10", "$15", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Kano", value: 12 }, { label: "Abuja", value: 9 }, { label: "Ibadan", value: 7 }, { label: "Lagos", value: 6 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the market sequence", tiles: ["🥁", "🎬", "🌍", "🛶", "🌴"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the market lamp flashes green" }],
      },
    },
    /* -------------------------------------------------------------- Tanzania */
    {
      id: "TZ", name: "Tanzania", region: "Africa", flag: "🇹🇿", capital: "Dodoma", ll: [-6.2, 35.7],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "Mount Kilimanjaro, Africa's highest peak, is located in which country?", options: ["Kenya", "Tanzania", "Uganda", "Ethiopia"], a: 1 },
          { cat: "trivia", type: "brain", q: "The Serengeti is famous for its great migration of…", options: ["Penguins", "Wildebeest", "Reindeer", "Salmon"], a: 1 },
          { cat: "trivia", type: "brain", q: "Zanzibar is a tropical island of which country?", options: ["Tanzania", "Kenya", "Mozambique", "Madagascar"], a: 0 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "ZANZIBAR", hint: "Tanzania's spice island" },
          { cat: "word", type: "brain", answer: "SWAHILI", hint: "Widely spoken East African language" },
        ],
        math: [
          { cat: "math", type: "brain", q: "25,000 shillings at 2,500 shillings = $1 is how many US dollars?", options: ["$1", "$10", "$25", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Mwanza", value: -2.5 }, { label: "Arusha", value: -3.4 }, { label: "Dodoma", value: -6.2 }, { label: "Dar es Salaam", value: -6.8 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the savanna sequence", tiles: ["🦁", "🏔️", "🦓", "🏝️", "🌅"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the savanna sun flashes green" }],
      },
    },
    /* -------------------------------------------------------------- Ethiopia */
    {
      id: "ET", name: "Ethiopia", region: "Africa", flag: "🇪🇹", capital: "Addis Ababa", ll: [9.0, 38.7],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Ethiopia?", options: ["Dire Dawa", "Addis Ababa", "Mekelle", "Hawassa"], a: 1 },
          { cat: "trivia", type: "brain", q: "Ethiopia is often called the birthplace of which beverage?", options: ["Tea", "Coffee", "Wine", "Cocoa"], a: 1 },
          { cat: "trivia", type: "brain", q: "The Great Rift Valley cuts across which country?", options: ["Ethiopia", "Morocco", "Ghana", "Senegal"], a: 0 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "COFFEE", hint: "Beverage said to originate in Ethiopia" },
          { cat: "word", type: "brain", answer: "HIGHLAND", hint: "Ethiopia's elevated plateau terrain" },
        ],
        math: [
          { cat: "math", type: "brain", q: "550 birr at 55 birr = $1 is how many US dollars?", options: ["$5", "$10", "$55", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Mekelle", value: 13.5 }, { label: "Dire Dawa", value: 9.6 }, { label: "Addis Ababa", value: 9.0 }, { label: "Hawassa", value: 7.0 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the coffee sequence", tiles: ["☕", "🌄", "🛕", "🌿", "🌅"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the coffee light flashes green" }],
      },
    },
    /* -------------------------------------------------------- United States */
    {
      id: "US", name: "United States", region: "North America", flag: "🇺🇸", capital: "Washington, D.C.", ll: [38.9, -77.0],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of the United States?", options: ["New York", "Washington, D.C.", "Los Angeles", "Chicago"], a: 1 },
          { cat: "trivia", type: "brain", q: "The Statue of Liberty stands in the harbour of which city?", options: ["Boston", "New York", "Miami", "Seattle"], a: 1 },
          { cat: "trivia", type: "brain", q: "The Grand Canyon was carved by which river?", options: ["Mississippi", "Colorado", "Hudson", "Rio Grande"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "LIBERTY", hint: "The Statue of ____ in New York" },
          { cat: "word", type: "brain", answer: "CANYON", hint: "The Grand ____ in Arizona" },
        ],
        math: [
          { cat: "math", type: "brain", q: "A $12 burger, buy 4 for the family. Total?", options: ["$36", "$44", "$48", "$52"], a: 2 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Seattle", value: 47 }, { label: "Chicago", value: 42 }, { label: "New York", value: 41 }, { label: "Miami", value: 26 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the landmark sequence", tiles: ["🗽", "🦅", "🏔️", "🎬", "🌉"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the traffic signal flashes green" }],
      },
    },
    /* ------------------------------------------------------------- Argentina */
    {
      id: "AR", name: "Argentina", region: "South America", flag: "🇦🇷", capital: "Buenos Aires", ll: [-34.6, -58.4],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Argentina?", options: ["Córdoba", "Buenos Aires", "Rosario", "Mendoza"], a: 1 },
          { cat: "trivia", type: "brain", q: "The passionate dance that originated in Argentina is the…", options: ["Salsa", "Tango", "Samba", "Waltz"], a: 1 },
          { cat: "trivia", type: "brain", q: "Patagonia, at Argentina's southern end, is known for its…", options: ["Deserts", "Glaciers & mountains", "Rainforests", "Coral reefs"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "TANGO", hint: "Passionate Argentine dance" },
          { cat: "word", type: "brain", answer: "PAMPAS", hint: "Argentina's vast grassy plains" },
        ],
        math: [
          { cat: "math", type: "brain", q: "9,000 pesos at 900 pesos = $1 is how many US dollars?", options: ["$1", "$10", "$90", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Salta", value: -24.8 }, { label: "Córdoba", value: -31.4 }, { label: "Buenos Aires", value: -34.6 }, { label: "Ushuaia", value: -54.8 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the tango sequence", tiles: ["💃", "🥩", "⚽", "🏔️", "🧉"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the tango light flashes green" }],
      },
    },
    /* ------------------------------------------------------------------ Peru */
    {
      id: "PE", name: "Peru", region: "South America", flag: "🇵🇪", capital: "Lima", ll: [-12.0, -77.0],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Peru?", options: ["Cusco", "Lima", "Arequipa", "Trujillo"], a: 1 },
          { cat: "trivia", type: "brain", q: "Machu Picchu was built by which ancient civilization?", options: ["Maya", "Inca", "Aztec", "Olmec"], a: 1 },
          { cat: "trivia", type: "brain", q: "Machu Picchu sits high in which mountain range?", options: ["Andes", "Alps", "Atlas", "Rockies"], a: 0 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "LLAMA", hint: "Woolly Andean pack animal" },
          { cat: "word", type: "brain", answer: "CEVICHE", hint: "Peru's citrus-cured raw fish dish" },
        ],
        math: [
          { cat: "math", type: "brain", q: "38 soles at 3.8 soles = $1 is how many US dollars?", options: ["$3.80", "$10", "$38", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Piura", value: -5 }, { label: "Lima", value: -12 }, { label: "Cusco", value: -13.5 }, { label: "Arequipa", value: -16 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the Inca sequence", tiles: ["🦙", "🏔️", "🛕", "🌽", "🎶"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the Andean beacon flashes green" }],
      },
    },
    /* ----------------------------------------------------------------- Chile */
    {
      id: "CL", name: "Chile", region: "South America", flag: "🇨🇱", capital: "Santiago", ll: [-33.4, -70.7],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Chile?", options: ["Valparaíso", "Santiago", "Concepción", "Antofagasta"], a: 1 },
          { cat: "trivia", type: "brain", q: "The Atacama, one of the driest places on Earth, is a ____ in Chile.", options: ["Forest", "Desert", "Lake", "Swamp"], a: 1 },
          { cat: "trivia", type: "brain", q: "Chile is a long, narrow country running along which mountain range?", options: ["Andes", "Alps", "Urals", "Atlas"], a: 0 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "SANTIAGO", hint: "Chile's capital city" },
          { cat: "word", type: "brain", answer: "ATACAMA", hint: "Chile's famously dry desert" },
        ],
        math: [
          { cat: "math", type: "brain", q: "9,000 pesos at 900 pesos = $1 is how many US dollars?", options: ["$1", "$10", "$90", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Arica", value: -18.5 }, { label: "Santiago", value: -33.4 }, { label: "Concepción", value: -36.8 }, { label: "Punta Arenas", value: -53.0 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the Andean sequence", tiles: ["🏔️", "🏜️", "🍷", "🌊", "⭐"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the desert star flashes green" }],
      },
    },
    /* -------------------------------------------------------------- Colombia */
    {
      id: "CO", name: "Colombia", region: "South America", flag: "🇨🇴", capital: "Bogotá", ll: [4.7, -74.1],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Colombia?", options: ["Medellín", "Bogotá", "Cali", "Cartagena"], a: 1 },
          { cat: "trivia", type: "brain", q: "Colombia is one of the world's top producers of which bean?", options: ["Cocoa", "Coffee", "Soy", "Vanilla"], a: 1 },
          { cat: "trivia", type: "brain", q: "The walled colonial port of Cartagena sits on which sea?", options: ["Caribbean", "Baltic", "Mediterranean", "Red"], a: 0 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "BOGOTA", hint: "Colombia's capital city" },
          { cat: "word", type: "brain", answer: "EMERALD", hint: "Green gem Colombia is famed for" },
        ],
        math: [
          { cat: "math", type: "brain", q: "40,000 pesos at 4,000 pesos = $1 is how many US dollars?", options: ["$1", "$10", "$40", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Barranquilla", value: 11 }, { label: "Medellín", value: 6 }, { label: "Bogotá", value: 4.7 }, { label: "Cali", value: 3.4 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the coffee sequence", tiles: ["☕", "💚", "🌴", "🏰", "🎶"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the coffee light flashes green" }],
      },
    },
    /* ------------------------------------------------------------------ Cuba */
    {
      id: "CU", name: "Cuba", region: "North America", flag: "🇨🇺", capital: "Havana", ll: [23.1, -82.4],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Cuba?", options: ["Santiago de Cuba", "Havana", "Camagüey", "Holguín"], a: 1 },
          { cat: "trivia", type: "brain", q: "Cuba is famous for its vintage 1950s American…", options: ["Cars", "Trains", "Planes", "Bicycles"], a: 0 },
          { cat: "trivia", type: "brain", q: "Which hand-rolled product is a famous Cuban export?", options: ["Cigars", "Silk", "Watches", "Diamonds"], a: 0 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "HAVANA", hint: "Cuba's capital city" },
          { cat: "word", type: "brain", answer: "SALSA", hint: "Lively Cuban dance & music style" },
        ],
        math: [
          { cat: "math", type: "brain", q: "A classic-car tour is 24 pesos, split by 3 riders. Each pays?", options: ["6", "8", "12", "24"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Havana", value: 23.1 }, { label: "Santa Clara", value: 22.4 }, { label: "Camagüey", value: 21.4 }, { label: "Santiago de Cuba", value: 20.0 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the Havana sequence", tiles: ["🚗", "🎺", "🌴", "🚬", "💃"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the classic car light flashes green" }],
      },
    },
    /* ----------------------------------------------------------- New Zealand */
    {
      id: "NZ", name: "New Zealand", region: "Oceania", flag: "🇳🇿", capital: "Wellington", ll: [-41.3, 174.8],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of New Zealand?", options: ["Auckland", "Wellington", "Christchurch", "Queenstown"], a: 1 },
          { cat: "trivia", type: "brain", q: "Milford Sound, a dramatic fiord, is a landmark of which country?", options: ["Australia", "New Zealand", "Chile", "Norway"], a: 1 },
          { cat: "trivia", type: "brain", q: "The flightless kiwi bird is a national symbol of which country?", options: ["New Zealand", "Australia", "Fiji", "Samoa"], a: 0 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "MAORI", hint: "Indigenous people of New Zealand" },
          { cat: "word", type: "brain", answer: "KIWI", hint: "New Zealand's flightless national bird" },
        ],
        math: [
          { cat: "math", type: "brain", q: "NZ$32 at NZ$1.6 = $1 is how many US dollars?", options: ["$16", "$20", "$32", "$40"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Auckland", value: -36.8 }, { label: "Wellington", value: -41.3 }, { label: "Christchurch", value: -43.5 }, { label: "Dunedin", value: -45.9 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the kiwi sequence", tiles: ["🥝", "🐑", "🏔️", "🏉", "🌊"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "Tap when the fiord beacon flashes green" }],
      },
    },
    /* ------------------------------------------------------------- Finland */
    {
      id: "FI", name: "Finland", region: "Europe", flag: "🇫🇮", capital: "Helsinki", ll: [60.2, 24.9],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Finland?", options: ["Oslo", "Stockholm", "Helsinki", "Tallinn"], a: 2 },
          { cat: "trivia", type: "brain", q: "Finland is often called the Land of a Thousand what?", options: ["Rivers", "Lakes", "Mountains", "Islands"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Finland?", options: ["Krona", "Euro", "Markka", "Ruble"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "SAUNA", hint: "Finnish steam bath" },
          { cat: "word", type: "brain", answer: "HELSINKI", hint: "Finland's capital city" },
        ],
        math: [
          { cat: "math", type: "brain", q: "€45 at €0.9 = $1 is how many US dollars?", options: ["$40", "$45", "$50", "$55"], a: 2 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Rovaniemi", value: 66.5 }, { label: "Oulu", value: 65.0 }, { label: "Tampere", value: 61.5 }, { label: "Helsinki", value: 60.2 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the sauna sequence", tiles: ["🧖", "🌲", "❄️", "🦌", "🏒"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React when the sauna timer signal fires" }],
      },
    },
    /* ------------------------------------------------------------- Denmark */
    {
      id: "DK", name: "Denmark", region: "Europe", flag: "🇩🇰", capital: "Copenhagen", ll: [55.7, 12.6],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "The Little Mermaid statue sits in the harbour of which capital?", options: ["Oslo", "Stockholm", "Copenhagen", "Amsterdam"], a: 2 },
          { cat: "trivia", type: "brain", q: "The LEGO toy brick was invented in which country?", options: ["Sweden", "Germany", "Denmark", "Netherlands"], a: 2 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Denmark?", options: ["Euro", "Krone", "Krona", "Zloty"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "VIKING", hint: "Seafaring Norse raider of old" },
          { cat: "word", type: "brain", answer: "LEGO", hint: "Danish plastic building brick" },
        ],
        math: [
          { cat: "math", type: "brain", q: "kr140 at kr7 = $1 is how many US dollars?", options: ["$10", "$20", "$70", "$140"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Aalborg", value: 57.0 }, { label: "Aarhus", value: 56.2 }, { label: "Copenhagen", value: 55.7 }, { label: "Odense", value: 55.4 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the harbour sequence", tiles: ["⚓", "🧜‍♀️", "🚲", "🧱", "🍺"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the harbour signal" }],
      },
    },
    /* ------------------------------------------------------------- Belgium */
    {
      id: "BE", name: "Belgium", region: "Europe", flag: "🇧🇪", capital: "Brussels", ll: [50.8, 4.4],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "The Atomium monument is located in which capital?", options: ["Amsterdam", "Brussels", "Paris", "Berlin"], a: 1 },
          { cat: "trivia", type: "brain", q: "Belgium is world-famous for producing which sweet treat?", options: ["Chocolate", "Marzipan", "Nougat", "Fudge"], a: 0 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Belgium?", options: ["Franc", "Euro", "Guilder", "Mark"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "WAFFLE", hint: "Belgian griddled batter treat" },
          { cat: "word", type: "brain", answer: "TINTIN", hint: "Famous Belgian comic reporter" },
        ],
        math: [
          { cat: "math", type: "brain", q: "€36 at €0.9 = $1 is how many US dollars?", options: ["$32", "$36", "$40", "$44"], a: 2 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Antwerp", value: 51.2 }, { label: "Ghent", value: 51.0 }, { label: "Brussels", value: 50.8 }, { label: "Charleroi", value: 50.4 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the waffle sequence", tiles: ["🧇", "🍫", "🍟", "🍺", "🎨"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React when the comic-strip signal fires" }],
      },
    },
    /* ------------------------------------------------------------- Austria */
    {
      id: "AT", name: "Austria", region: "Europe", flag: "🇦🇹", capital: "Vienna", ll: [48.2, 16.4],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Austria?", options: ["Munich", "Vienna", "Zurich", "Prague"], a: 1 },
          { cat: "trivia", type: "brain", q: "Composer Mozart was born in which country?", options: ["Germany", "Austria", "Switzerland", "Italy"], a: 1 },
          { cat: "trivia", type: "brain", q: "The Schönbrunn Palace is a landmark of which capital?", options: ["Berlin", "Budapest", "Vienna", "Prague"], a: 2 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "VIENNA", hint: "Austria's capital city" },
          { cat: "word", type: "brain", answer: "STRUDEL", hint: "Rolled Austrian pastry" },
        ],
        math: [
          { cat: "math", type: "brain", q: "€24 at €0.8 = $1 is how many US dollars?", options: ["$24", "$30", "$36", "$48"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Linz", value: 48.3 }, { label: "Vienna", value: 48.2 }, { label: "Innsbruck", value: 47.3 }, { label: "Graz", value: 47.1 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the alpine sequence", tiles: ["🎻", "🏔️", "🥨", "🏰", "☕"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the opera-house signal" }],
      },
    },
    /* ------------------------------------------------------------- Czechia */
    {
      id: "CZ", name: "Czechia", region: "Europe", flag: "🇨🇿", capital: "Prague", ll: [50.1, 14.4],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "The medieval Charles Bridge crosses the river in which capital?", options: ["Vienna", "Prague", "Budapest", "Warsaw"], a: 1 },
          { cat: "trivia", type: "brain", q: "The Pilsner style of beer originated in which country?", options: ["Germany", "Belgium", "Czechia", "Austria"], a: 2 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Czechia?", options: ["Euro", "Zloty", "Koruna", "Forint"], a: 2 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "PRAGUE", hint: "Czechia's capital city" },
          { cat: "word", type: "brain", answer: "PILSNER", hint: "Pale lager born in Bohemia" },
        ],
        math: [
          { cat: "math", type: "brain", q: "Kč240 at Kč24 = $1 is how many US dollars?", options: ["$5", "$10", "$24", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Liberec", value: 50.8 }, { label: "Prague", value: 50.1 }, { label: "Ostrava", value: 49.8 }, { label: "Brno", value: 49.2 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the castle sequence", tiles: ["🏰", "🍺", "🕰️", "🌉", "🎭"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React when the clock-tower signal fires" }],
      },
    },
    /* ------------------------------------------------------------- Hungary */
    {
      id: "HU", name: "Hungary", region: "Europe", flag: "🇭🇺", capital: "Budapest", ll: [47.5, 19.0],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "The river Danube divides which capital into Buda and Pest?", options: ["Vienna", "Belgrade", "Budapest", "Bratislava"], a: 2 },
          { cat: "trivia", type: "brain", q: "Goulash is a traditional stew from which country?", options: ["Poland", "Hungary", "Romania", "Austria"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Hungary?", options: ["Euro", "Forint", "Leu", "Koruna"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "GOULASH", hint: "Hungarian paprika stew" },
          { cat: "word", type: "brain", answer: "BUDAPEST", hint: "Hungary's capital city" },
        ],
        math: [
          { cat: "math", type: "brain", q: "Ft3000 at Ft300 = $1 is how many US dollars?", options: ["$3", "$10", "$30", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Miskolc", value: 48.1 }, { label: "Debrecen", value: 47.6 }, { label: "Budapest", value: 47.5 }, { label: "Szeged", value: 46.3 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the thermal-bath sequence", tiles: ["♨️", "🌉", "🌶️", "🍲", "🎻"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the riverboat signal" }],
      },
    },
    /* ------------------------------------------------------------- Romania */
    {
      id: "RO", name: "Romania", region: "Europe", flag: "🇷🇴", capital: "Bucharest", ll: [44.4, 26.1],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "The region of Transylvania, linked to Dracula legends, is in which country?", options: ["Hungary", "Romania", "Bulgaria", "Serbia"], a: 1 },
          { cat: "trivia", type: "brain", q: "The Carpathian Mountains stretch across which country?", options: ["Romania", "Greece", "Portugal", "Ireland"], a: 0 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Romania?", options: ["Lev", "Leu", "Euro", "Dinar"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "DRACULA", hint: "Transylvanian vampire count" },
          { cat: "word", type: "brain", answer: "CASTLE", hint: "Bran fortress tourists visit" },
        ],
        math: [
          { cat: "math", type: "brain", q: "lei45 at lei4.5 = $1 is how many US dollars?", options: ["$4", "$10", "$45", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Iași", value: 47.2 }, { label: "Cluj-Napoca", value: 46.8 }, { label: "Timișoara", value: 45.8 }, { label: "Bucharest", value: 44.4 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the castle sequence", tiles: ["🏰", "🦇", "🏔️", "🐺", "🌲"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React when the castle beacon fires" }],
      },
    },
    /* ------------------------------------------------------------- Ukraine */
    {
      id: "UA", name: "Ukraine", region: "Europe", flag: "🇺🇦", capital: "Kyiv", ll: [50.5, 30.5],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Ukraine?", options: ["Minsk", "Kyiv", "Warsaw", "Chisinau"], a: 1 },
          { cat: "trivia", type: "brain", q: "The 1986 Chernobyl nuclear disaster occurred in which country?", options: ["Russia", "Belarus", "Ukraine", "Poland"], a: 2 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Ukraine?", options: ["Ruble", "Hryvnia", "Zloty", "Leu"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "KYIV", hint: "Ukraine's capital city" },
          { cat: "word", type: "brain", answer: "BORSCHT", hint: "Beetroot soup of the region" },
        ],
        math: [
          { cat: "math", type: "brain", q: "₴400 at ₴40 = $1 is how many US dollars?", options: ["$4", "$10", "$40", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Kyiv", value: 50.5 }, { label: "Kharkiv", value: 50.0 }, { label: "Lviv", value: 49.8 }, { label: "Odesa", value: 46.5 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the wheat-field sequence", tiles: ["🌻", "🌾", "⛪", "🕊️", "🟦"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the harvest signal" }],
      },
    },
    /* ------------------------------------------------------------- Croatia */
    {
      id: "HR", name: "Croatia", region: "Europe", flag: "🇭🇷", capital: "Zagreb", ll: [45.8, 16.0],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "The walled coastal city of Dubrovnik is in which country?", options: ["Italy", "Croatia", "Greece", "Montenegro"], a: 1 },
          { cat: "trivia", type: "brain", q: "Croatia has a long coastline along which sea?", options: ["Baltic Sea", "Adriatic Sea", "Black Sea", "Aegean Sea"], a: 1 },
          { cat: "trivia", type: "brain", q: "What is the capital of Croatia?", options: ["Split", "Zagreb", "Rijeka", "Zadar"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "ZAGREB", hint: "Croatia's capital city" },
          { cat: "word", type: "brain", answer: "ADRIATIC", hint: "Sea along Croatia's coast" },
        ],
        math: [
          { cat: "math", type: "brain", q: "€18 at €0.9 = $1 is how many US dollars?", options: ["$16", "$18", "$20", "$22"], a: 2 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Zagreb", value: 45.8 }, { label: "Rijeka", value: 45.3 }, { label: "Split", value: 43.5 }, { label: "Dubrovnik", value: 42.6 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the coastal sequence", tiles: ["🏰", "⛵", "🌊", "🐬", "🏝️"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React when the lighthouse signal fires" }],
      },
    },
    /* ------------------------------------------------------------- Iceland */
    {
      id: "IS", name: "Iceland", region: "Europe", flag: "🇮🇸", capital: "Reykjavik", ll: [64.1, -21.9],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Iceland?", options: ["Oslo", "Reykjavik", "Nuuk", "Bergen"], a: 1 },
          { cat: "trivia", type: "brain", q: "Iceland is famous for volcanoes and which spouting hot-water jets?", options: ["Waterfalls", "Geysers", "Fjords", "Glaciers"], a: 1 },
          { cat: "trivia", type: "brain", q: "The Blue Lagoon geothermal spa is a landmark of which country?", options: ["Norway", "Iceland", "Finland", "Greenland"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "GEYSER", hint: "Spouting hot spring" },
          { cat: "word", type: "brain", answer: "VOLCANO", hint: "Erupting mountain, common here" },
        ],
        math: [
          { cat: "math", type: "brain", q: "kr1400 at kr140 = $1 is how many US dollars?", options: ["$5", "$10", "$14", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Akureyri", value: 65.7 }, { label: "Reykjavik", value: 64.1 }, { label: "Keflavik", value: 64.0 }, { label: "Vik", value: 63.4 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the volcanic sequence", tiles: ["🌋", "♨️", "🧊", "🐋", "🌌"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the geyser signal" }],
      },
    },
    /* ------------------------------------------------------------ Slovakia */
    {
      id: "SK", name: "Slovakia", region: "Europe", flag: "🇸🇰", capital: "Bratislava", ll: [48.1, 17.1],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Slovakia?", options: ["Prague", "Vienna", "Bratislava", "Budapest"], a: 2 },
          { cat: "trivia", type: "brain", q: "The High Tatras mountain range lies in Slovakia and which neighbour?", options: ["Poland", "Austria", "Ukraine", "Germany"], a: 0 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Slovakia?", options: ["Koruna", "Euro", "Forint", "Zloty"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "DANUBE", hint: "River through Bratislava" },
          { cat: "word", type: "brain", answer: "CASTLE", hint: "Bratislava's hilltop fortress" },
        ],
        math: [
          { cat: "math", type: "brain", q: "€35 at €0.7 = $1 is how many US dollars?", options: ["$35", "$42", "$50", "$70"], a: 2 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Žilina", value: 49.2 }, { label: "Prešov", value: 49.0 }, { label: "Košice", value: 48.7 }, { label: "Bratislava", value: 48.1 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the mountain sequence", tiles: ["🏔️", "🏰", "🌲", "🐻", "🌉"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React when the mountain beacon fires" }],
      },
    },
    /* ------------------------------------------------------------ Bulgaria */
    {
      id: "BG", name: "Bulgaria", region: "Europe", flag: "🇧🇬", capital: "Sofia", ll: [42.7, 23.3],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "Bulgaria is a leading world producer of oil from which flower?", options: ["Lavender", "Rose", "Jasmine", "Tulip"], a: 1 },
          { cat: "trivia", type: "brain", q: "What is the capital of Bulgaria?", options: ["Sofia", "Plovdiv", "Varna", "Burgas"], a: 0 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Bulgaria?", options: ["Leu", "Lev", "Euro", "Dinar"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "SOFIA", hint: "Bulgaria's capital city" },
          { cat: "word", type: "brain", answer: "YOGURT", hint: "Cultured dairy staple here" },
        ],
        math: [
          { cat: "math", type: "brain", q: "лв20 at лв2 = $1 is how many US dollars?", options: ["$2", "$10", "$20", "$40"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Ruse", value: 43.9 }, { label: "Varna", value: 43.2 }, { label: "Sofia", value: 42.7 }, { label: "Plovdiv", value: 42.2 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the rose sequence", tiles: ["🌹", "🏔️", "🏖️", "⛪", "🍶"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the seaside signal" }],
      },
    },
    /* -------------------------------------------------------------- Serbia */
    {
      id: "RS", name: "Serbia", region: "Europe", flag: "🇷🇸", capital: "Belgrade", ll: [44.8, 20.5],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Serbia?", options: ["Zagreb", "Belgrade", "Sarajevo", "Skopje"], a: 1 },
          { cat: "trivia", type: "brain", q: "Serbia was formerly the largest republic of which country?", options: ["Czechoslovakia", "Yugoslavia", "USSR", "Austria-Hungary"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Serbia?", options: ["Dinar", "Euro", "Lev", "Kuna"], a: 0 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "BELGRADE", hint: "Serbia's capital city" },
          { cat: "word", type: "brain", answer: "DANUBE", hint: "River meeting the Sava here" },
        ],
        math: [
          { cat: "math", type: "brain", q: "din1200 at din120 = $1 is how many US dollars?", options: ["$5", "$10", "$12", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Subotica", value: 46.1 }, { label: "Novi Sad", value: 45.3 }, { label: "Belgrade", value: 44.8 }, { label: "Niš", value: 43.3 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the fortress sequence", tiles: ["🏰", "🌉", "🎶", "🍇", "⛪"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React when the fortress signal fires" }],
      },
    },
    /* ------------------------------------------------------------ Malaysia */
    {
      id: "MY", name: "Malaysia", region: "Asia", flag: "🇲🇾", capital: "Kuala Lumpur", ll: [3.1, 101.7],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "The Petronas Twin Towers are a landmark of which capital?", options: ["Jakarta", "Bangkok", "Kuala Lumpur", "Singapore"], a: 2 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Malaysia?", options: ["Baht", "Ringgit", "Rupiah", "Peso"], a: 1 },
          { cat: "trivia", type: "brain", q: "The island of Borneo, shared by Malaysia, is famous for which great ape?", options: ["Gorilla", "Chimpanzee", "Orangutan", "Gibbon"], a: 2 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "BORNEO", hint: "Rainforest island Malaysia shares" },
          { cat: "word", type: "brain", answer: "RINGGIT", hint: "Malaysia's currency" },
        ],
        math: [
          { cat: "math", type: "brain", q: "RM40 at RM4 = $1 is how many US dollars?", options: ["$4", "$10", "$40", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "George Town", value: 5.4 }, { label: "Ipoh", value: 4.6 }, { label: "Kuala Lumpur", value: 3.1 }, { label: "Johor Bahru", value: 1.5 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the rainforest sequence", tiles: ["🌴", "🦧", "🏙️", "🌺", "🍜"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the skyline signal" }],
      },
    },
    /* ------------------------------------------------------------ Pakistan */
    {
      id: "PK", name: "Pakistan", region: "Asia", flag: "🇵🇰", capital: "Islamabad", ll: [33.7, 73.0],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Pakistan?", options: ["Karachi", "Lahore", "Islamabad", "Peshawar"], a: 2 },
          { cat: "trivia", type: "brain", q: "K2, the world's second-highest mountain, lies on the border of Pakistan and which country?", options: ["India", "China", "Afghanistan", "Nepal"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Pakistan?", options: ["Rupee", "Taka", "Rial", "Afghani"], a: 0 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "LAHORE", hint: "Pakistan's cultural capital city" },
          { cat: "word", type: "brain", answer: "INDUS", hint: "Great river of Pakistan" },
        ],
        math: [
          { cat: "math", type: "brain", q: "Rs2800 at Rs280 = $1 is how many US dollars?", options: ["$10", "$28", "$100", "$280"], a: 0 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Peshawar", value: 34.0 }, { label: "Islamabad", value: 33.7 }, { label: "Lahore", value: 31.5 }, { label: "Karachi", value: 24.9 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the mountain sequence", tiles: ["🏔️", "🕌", "🏏", "🐫", "🌙"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the mountain-pass signal" }],
      },
    },
    /* ---------------------------------------------------------- Bangladesh */
    {
      id: "BD", name: "Bangladesh", region: "Asia", flag: "🇧🇩", capital: "Dhaka", ll: [23.8, 90.4],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Bangladesh?", options: ["Kolkata", "Dhaka", "Chittagong", "Khulna"], a: 1 },
          { cat: "trivia", type: "brain", q: "The Sundarbans mangrove forest of Bangladesh is home to which big cat?", options: ["Lion", "Leopard", "Bengal Tiger", "Jaguar"], a: 2 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Bangladesh?", options: ["Rupee", "Taka", "Kyat", "Rupiah"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "DHAKA", hint: "Bangladesh's capital city" },
          { cat: "word", type: "brain", answer: "BENGAL", hint: "Region and bay to the south" },
        ],
        math: [
          { cat: "math", type: "brain", q: "Tk1100 at Tk110 = $1 is how many US dollars?", options: ["$10", "$11", "$100", "$110"], a: 0 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Rangpur", value: 25.7 }, { label: "Rajshahi", value: 24.4 }, { label: "Dhaka", value: 23.8 }, { label: "Chittagong", value: 22.3 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the delta sequence", tiles: ["🐅", "🚣", "🌊", "🍛", "🛕"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the river-delta signal" }],
      },
    },
    /* ----------------------------------------------------------- Sri Lanka */
    {
      id: "LK", name: "Sri Lanka", region: "Asia", flag: "🇱🇰", capital: "Colombo", ll: [6.9, 79.9],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "Sri Lanka is one of the world's largest exporters of which drink?", options: ["Coffee", "Tea", "Cocoa", "Wine"], a: 1 },
          { cat: "trivia", type: "brain", q: "Sri Lanka was formerly known by which name?", options: ["Burma", "Ceylon", "Siam", "Malaya"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Sri Lanka?", options: ["Rupee", "Taka", "Rupiah", "Baht"], a: 0 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "CEYLON", hint: "Old name for Sri Lanka" },
          { cat: "word", type: "brain", answer: "COLOMBO", hint: "Sri Lanka's largest city" },
        ],
        math: [
          { cat: "math", type: "brain", q: "Rs600 at Rs300 = $1 is how many US dollars?", options: ["$2", "$3", "$6", "$60"], a: 0 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Jaffna", value: 9.7 }, { label: "Kandy", value: 7.3 }, { label: "Colombo", value: 6.9 }, { label: "Galle", value: 6.0 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the tea-garden sequence", tiles: ["🍵", "🐘", "🌴", "🏝️", "🪷"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the harbour signal" }],
      },
    },
    /* ------------------------------------------------------------ Cambodia */
    {
      id: "KH", name: "Cambodia", region: "Asia", flag: "🇰🇭", capital: "Phnom Penh", ll: [11.6, 104.9],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "The vast temple complex of Angkor Wat is located in which country?", options: ["Thailand", "Cambodia", "Vietnam", "Laos"], a: 1 },
          { cat: "trivia", type: "brain", q: "What is the capital of Cambodia?", options: ["Siem Reap", "Phnom Penh", "Battambang", "Vientiane"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Cambodia?", options: ["Baht", "Riel", "Dong", "Kip"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "ANGKOR", hint: "Ancient temple city here" },
          { cat: "word", type: "brain", answer: "KHMER", hint: "Cambodia's people and language" },
        ],
        math: [
          { cat: "math", type: "brain", q: "៛40000 at ៛4000 = $1 is how many US dollars?", options: ["$4", "$10", "$40", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Siem Reap", value: 13.4 }, { label: "Battambang", value: 13.1 }, { label: "Phnom Penh", value: 11.6 }, { label: "Sihanoukville", value: 10.6 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the temple sequence", tiles: ["🛕", "🌾", "🚣", "🐒", "🌴"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the temple-gate signal" }],
      },
    },
    /* ------------------------------------------------------------- Myanmar */
    {
      id: "MM", name: "Myanmar", region: "Asia", flag: "🇲🇲", capital: "Naypyidaw", ll: [19.8, 96.1],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "Myanmar was formerly known by which name?", options: ["Siam", "Burma", "Malaya", "Ceylon"], a: 1 },
          { cat: "trivia", type: "brain", q: "The golden Shwedagon Pagoda towers over which city?", options: ["Bangkok", "Yangon", "Hanoi", "Vientiane"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Myanmar?", options: ["Baht", "Kyat", "Dong", "Riel"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "YANGON", hint: "Myanmar's largest city" },
          { cat: "word", type: "brain", answer: "PAGODA", hint: "Tiered Buddhist tower" },
        ],
        math: [
          { cat: "math", type: "brain", q: "K21000 at K2100 = $1 is how many US dollars?", options: ["$10", "$21", "$100", "$210"], a: 0 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Mandalay", value: 22.0 }, { label: "Naypyidaw", value: 19.8 }, { label: "Bago", value: 17.3 }, { label: "Yangon", value: 16.8 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the pagoda sequence", tiles: ["🛕", "🌾", "🐘", "🎈", "🌅"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the pagoda signal" }],
      },
    },
    /* ---------------------------------------------------------- Kazakhstan */
    {
      id: "KZ", name: "Kazakhstan", region: "Asia", flag: "🇰🇿", capital: "Astana", ll: [51.2, 71.4],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Kazakhstan?", options: ["Almaty", "Astana", "Tashkent", "Bishkek"], a: 1 },
          { cat: "trivia", type: "brain", q: "Kazakhstan is the world's largest country that is fully what?", options: ["Desert", "Landlocked", "Arctic", "Tropical"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Kazakhstan?", options: ["Ruble", "Tenge", "Som", "Manat"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "ASTANA", hint: "Kazakhstan's capital city" },
          { cat: "word", type: "brain", answer: "STEPPE", hint: "Vast grassland plain here" },
        ],
        math: [
          { cat: "math", type: "brain", q: "₸4500 at ₸450 = $1 is how many US dollars?", options: ["$4", "$10", "$45", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Astana", value: 51.2 }, { label: "Karaganda", value: 49.8 }, { label: "Almaty", value: 43.2 }, { label: "Shymkent", value: 42.3 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the steppe sequence", tiles: ["🐎", "🦅", "🏙️", "🌾", "🚀"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the launch-pad signal" }],
      },
    },
    /* ---------------------------------------------------------- Uzbekistan */
    {
      id: "UZ", name: "Uzbekistan", region: "Asia", flag: "🇺🇿", capital: "Tashkent", ll: [41.3, 69.2],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "The Silk Road city of Samarkand is located in which country?", options: ["Iran", "Uzbekistan", "Turkmenistan", "Afghanistan"], a: 1 },
          { cat: "trivia", type: "brain", q: "What is the capital of Uzbekistan?", options: ["Samarkand", "Bukhara", "Tashkent", "Khiva"], a: 2 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Uzbekistan?", options: ["Tenge", "Som", "Manat", "Rial"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "SAMARKAND", hint: "Ancient Silk Road city here" },
          { cat: "word", type: "brain", answer: "TASHKENT", hint: "Uzbekistan's capital city" },
        ],
        math: [
          { cat: "math", type: "brain", q: "120,000 so'm at 12,000 = $1 is how many US dollars?", options: ["$10", "$12", "$100", "$120"], a: 0 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Tashkent", value: 41.3 }, { label: "Bukhara", value: 39.8 }, { label: "Samarkand", value: 39.7 }, { label: "Termez", value: 37.2 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the Silk Road sequence", tiles: ["🕌", "🐫", "🧵", "🍶", "🌇"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the bazaar signal" }],
      },
    },
    /* ---------------------------------------------------------------- Iran */
    {
      id: "IR", name: "Iran", region: "Asia", flag: "🇮🇷", capital: "Tehran", ll: [35.7, 51.4],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "Iran was historically known by which name?", options: ["Persia", "Mesopotamia", "Anatolia", "Arabia"], a: 0 },
          { cat: "trivia", type: "brain", q: "The ancient ruins of Persepolis are located in which country?", options: ["Iraq", "Iran", "Turkey", "Syria"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Iran?", options: ["Dinar", "Rial", "Lira", "Dirham"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "PERSIA", hint: "Historic name for Iran" },
          { cat: "word", type: "brain", answer: "TEHRAN", hint: "Iran's capital city" },
        ],
        math: [
          { cat: "math", type: "brain", q: "500,000 rials at 50,000 = $1 is how many US dollars?", options: ["$1", "$5", "$10", "$100"], a: 2 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Tabriz", value: 38.1 }, { label: "Tehran", value: 35.7 }, { label: "Isfahan", value: 32.7 }, { label: "Shiraz", value: 29.6 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the Persian sequence", tiles: ["🕌", "🐆", "🌹", "🍶", "🏺"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the palace-gate signal" }],
      },
    },
    /* ---------------------------------------------------------------- Iraq */
    {
      id: "IQ", name: "Iraq", region: "Asia", flag: "🇮🇶", capital: "Baghdad", ll: [33.3, 44.4],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "Iraq covers ancient Mesopotamia, the land between the Tigris and which river?", options: ["Nile", "Euphrates", "Jordan", "Indus"], a: 1 },
          { cat: "trivia", type: "brain", q: "What is the capital of Iraq?", options: ["Basra", "Mosul", "Baghdad", "Kirkuk"], a: 2 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Iraq?", options: ["Dinar", "Rial", "Lira", "Riyal"], a: 0 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "BAGHDAD", hint: "Iraq's capital city" },
          { cat: "word", type: "brain", answer: "TIGRIS", hint: "River through Baghdad" },
        ],
        math: [
          { cat: "math", type: "brain", q: "ID13000 at ID1300 = $1 is how many US dollars?", options: ["$10", "$13", "$100", "$130"], a: 0 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Mosul", value: 36.3 }, { label: "Kirkuk", value: 35.5 }, { label: "Baghdad", value: 33.3 }, { label: "Basra", value: 30.5 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the ancient-river sequence", tiles: ["🏛️", "🌊", "🐪", "🕌", "📜"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the river signal" }],
      },
    },
    /* -------------------------------------------------------------- Taiwan */
    {
      id: "TW", name: "Taiwan", region: "Asia", flag: "🇹🇼", capital: "Taipei", ll: [25.0, 121.5],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "The Taipei 101 skyscraper is a landmark of which territory?", options: ["Hong Kong", "Taiwan", "Singapore", "Macau"], a: 1 },
          { cat: "trivia", type: "brain", q: "Taiwan was historically known to Europeans by which name?", options: ["Formosa", "Ceylon", "Cathay", "Siam"], a: 0 },
          { cat: "trivia", type: "brain", q: "What is the capital of Taiwan?", options: ["Kaohsiung", "Taichung", "Taipei", "Tainan"], a: 2 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "TAIPEI", hint: "Taiwan's capital city" },
          { cat: "word", type: "brain", answer: "FORMOSA", hint: "Old European name for Taiwan" },
        ],
        math: [
          { cat: "math", type: "brain", q: "NT$320 at NT$32 = $1 is how many US dollars?", options: ["$3", "$10", "$32", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Taipei", value: 25.0 }, { label: "Taichung", value: 24.1 }, { label: "Tainan", value: 23.0 }, { label: "Kaohsiung", value: 22.6 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the night-market sequence", tiles: ["🏙️", "🥟", "🧋", "🏮", "⛩️"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the market-stall signal" }],
      },
    },
    /* ---------------------------------------------------------- Azerbaijan */
    {
      id: "AZ", name: "Azerbaijan", region: "Asia", flag: "🇦🇿", capital: "Baku", ll: [40.4, 49.9],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "The capital Baku sits on the shore of which sea?", options: ["Black Sea", "Caspian Sea", "Aral Sea", "Red Sea"], a: 1 },
          { cat: "trivia", type: "brain", q: "Azerbaijan is nicknamed the Land of what, due to its natural gas flames?", options: ["Ice", "Fire", "Silk", "Gold"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Azerbaijan?", options: ["Manat", "Tenge", "Som", "Lari"], a: 0 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "BAKU", hint: "Azerbaijan's capital city" },
          { cat: "word", type: "brain", answer: "CASPIAN", hint: "Sea on Azerbaijan's coast" },
        ],
        math: [
          { cat: "math", type: "brain", q: "₼17 at ₼1.7 = $1 is how many US dollars?", options: ["$7", "$10", "$17", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Ganja", value: 40.7 }, { label: "Sumqayit", value: 40.6 }, { label: "Baku", value: 40.4 }, { label: "Lankaran", value: 38.8 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the flame-tower sequence", tiles: ["🔥", "🛢️", "🌊", "🕌", "🏙️"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the flame-tower signal" }],
      },
    },
    /* ------------------------------------------------------------- Georgia */
    {
      id: "GE", name: "Georgia", region: "Asia", flag: "🇬🇪", capital: "Tbilisi", ll: [41.7, 44.8],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "Georgia is cited as one of the oldest regions in the world to produce which drink?", options: ["Beer", "Wine", "Whisky", "Coffee"], a: 1 },
          { cat: "trivia", type: "brain", q: "What is the capital of Georgia?", options: ["Batumi", "Kutaisi", "Tbilisi", "Yerevan"], a: 2 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Georgia?", options: ["Manat", "Lari", "Dram", "Ruble"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "TBILISI", hint: "Georgia's capital city" },
          { cat: "word", type: "brain", answer: "CAUCASUS", hint: "Mountain range across Georgia" },
        ],
        math: [
          { cat: "math", type: "brain", q: "₾27 at ₾2.7 = $1 is how many US dollars?", options: ["$7", "$10", "$27", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Kutaisi", value: 42.3 }, { label: "Tbilisi", value: 41.7 }, { label: "Batumi", value: 41.6 }, { label: "Rustavi", value: 41.5 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the vineyard sequence", tiles: ["🍇", "🍷", "🏔️", "⛪", "🌊"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the vineyard signal" }],
      },
    },
    /* --------------------------------------------------------------- Qatar */
    {
      id: "QA", name: "Qatar", region: "Middle East", flag: "🇶🇦", capital: "Doha", ll: [25.3, 51.5],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "Which country hosted the 2022 FIFA World Cup?", options: ["UAE", "Qatar", "Saudi Arabia", "Kuwait"], a: 1 },
          { cat: "trivia", type: "brain", q: "What is the capital of Qatar?", options: ["Dubai", "Doha", "Manama", "Muscat"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Qatar?", options: ["Dinar", "Riyal", "Dirham", "Rial"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "DOHA", hint: "Qatar's capital city" },
          { cat: "word", type: "brain", answer: "QATAR", hint: "This Gulf peninsula nation" },
        ],
        math: [
          { cat: "math", type: "brain", q: "QR36 at QR3.6 = $1 is how many US dollars?", options: ["$3", "$10", "$36", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Al Ruwais", value: 26.1 }, { label: "Al Khor", value: 25.7 }, { label: "Doha", value: 25.3 }, { label: "Al Wakrah", value: 25.2 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the desert sequence", tiles: ["🏙️", "🐫", "⚽", "🏜️", "🛢️"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the stadium signal" }],
      },
    },
    /* -------------------------------------------------------------- Kuwait */
    {
      id: "KW", name: "Kuwait", region: "Middle East", flag: "🇰🇼", capital: "Kuwait City", ll: [29.4, 48.0],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Kuwait?", options: ["Doha", "Manama", "Kuwait City", "Riyadh"], a: 2 },
          { cat: "trivia", type: "brain", q: "Kuwait's wealth is built largely on exporting which resource?", options: ["Gold", "Oil", "Diamonds", "Copper"], a: 1 },
          { cat: "trivia", type: "brain", q: "The Kuwaiti dinar is often cited as the world's highest-valued unit of what?", options: ["Currency", "Weight", "Distance", "Time"], a: 0 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "KUWAIT", hint: "This oil-rich Gulf nation" },
          { cat: "word", type: "brain", answer: "DINAR", hint: "Kuwait's high-valued currency" },
        ],
        math: [
          { cat: "math", type: "brain", q: "With KD1 ≈ $3.25, about how many dollars is KD4?", options: ["$4", "$7", "$13", "$40"], a: 2 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Kuwait City", value: 29.4 }, { label: "Ahmadi", value: 29.1 }, { label: "Wafra", value: 28.6 }, { label: "Nuwaiseeb", value: 28.4 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the oilfield sequence", tiles: ["🛢️", "🏙️", "🐫", "🌊", "🕌"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the oil-derrick signal" }],
      },
    },
    /* -------------------------------------------------------------- Jordan */
    {
      id: "JO", name: "Jordan", region: "Middle East", flag: "🇯🇴", capital: "Amman", ll: [31.9, 35.9],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "The ancient rock-carved city of Petra is a famous landmark of which country?", options: ["Egypt", "Jordan", "Israel", "Syria"], a: 1 },
          { cat: "trivia", type: "brain", q: "The Dead Sea, the lowest point on land, borders Jordan and which country?", options: ["Egypt", "Israel", "Lebanon", "Iraq"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Jordan?", options: ["Dinar", "Pound", "Shekel", "Lira"], a: 0 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "PETRA", hint: "Rose-red rock-carved city" },
          { cat: "word", type: "brain", answer: "AMMAN", hint: "Jordan's capital city" },
        ],
        math: [
          { cat: "math", type: "brain", q: "With JD1 ≈ $1.4, about how many dollars is JD10?", options: ["$10", "$14", "$70", "$140"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Irbid", value: 32.6 }, { label: "Amman", value: 31.9 }, { label: "Karak", value: 31.2 }, { label: "Aqaba", value: 29.5 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the desert-canyon sequence", tiles: ["🏜️", "🐫", "🏛️", "🧂", "⛺"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the canyon signal" }],
      },
    },
    /* ------------------------------------------------------------- Lebanon */
    {
      id: "LB", name: "Lebanon", region: "Middle East", flag: "🇱🇧", capital: "Beirut", ll: [33.9, 35.5],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "The national flag of Lebanon features which tree?", options: ["Palm", "Cedar", "Olive", "Oak"], a: 1 },
          { cat: "trivia", type: "brain", q: "What is the capital of Lebanon?", options: ["Tripoli", "Beirut", "Sidon", "Byblos"], a: 1 },
          { cat: "trivia", type: "brain", q: "The Roman temple ruins at Baalbek are located in which country?", options: ["Syria", "Lebanon", "Jordan", "Turkey"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "BEIRUT", hint: "Lebanon's capital city" },
          { cat: "word", type: "brain", answer: "CEDAR", hint: "Tree on the Lebanese flag" },
        ],
        math: [
          { cat: "math", type: "brain", q: "With $1 ≈ 90,000 Lebanese pounds, 180,000 pounds is how many dollars?", options: ["$1", "$2", "$9", "$18"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Tripoli", value: 34.4 }, { label: "Byblos", value: 34.1 }, { label: "Beirut", value: 33.9 }, { label: "Tyre", value: 33.3 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the cedar sequence", tiles: ["🌲", "🏛️", "🌊", "🍋", "⛰️"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the harbourfront signal" }],
      },
    },
    /* ---------------------------------------------------------------- Oman */
    {
      id: "OM", name: "Oman", region: "Middle East", flag: "🇴🇲", capital: "Muscat", ll: [23.6, 58.4],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "Oman is historically famous for producing which fragrant resin?", options: ["Frankincense", "Amber", "Camphor", "Myrrh"], a: 0 },
          { cat: "trivia", type: "brain", q: "Oman is ruled by a leader holding which title?", options: ["King", "Emir", "Sultan", "Sheikh"], a: 2 },
          { cat: "trivia", type: "brain", q: "What is the capital of Oman?", options: ["Muscat", "Salalah", "Nizwa", "Sohar"], a: 0 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "MUSCAT", hint: "Oman's capital city" },
          { cat: "word", type: "brain", answer: "OMAN", hint: "This Arabian sultanate" },
        ],
        math: [
          { cat: "math", type: "brain", q: "With OR1 ≈ $2.6, about how many dollars is OR5?", options: ["$5", "$8", "$13", "$26"], a: 2 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Sohar", value: 24.4 }, { label: "Muscat", value: 23.6 }, { label: "Nizwa", value: 22.9 }, { label: "Salalah", value: 17.0 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the frankincense sequence", tiles: ["🕌", "🐫", "🏜️", "🌊", "🪔"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the harbour fort signal" }],
      },
    },
    /* --------------------------------------------------------------- Ghana */
    {
      id: "GH", name: "Ghana", region: "Africa", flag: "🇬🇭", capital: "Accra", ll: [5.6, -0.2],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "Ghana was formerly a British colony known by which name?", options: ["Ivory Coast", "Gold Coast", "Slave Coast", "Grain Coast"], a: 1 },
          { cat: "trivia", type: "brain", q: "Ghana is one of the world's top producers of which crop, used to make chocolate?", options: ["Coffee", "Cocoa", "Sugar", "Vanilla"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Ghana?", options: ["Naira", "Cedi", "Franc", "Rand"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "ACCRA", hint: "Ghana's capital city" },
          { cat: "word", type: "brain", answer: "COCOA", hint: "Bean grown for chocolate here" },
        ],
        math: [
          { cat: "math", type: "brain", q: "₵120 at ₵12 = $1 is how many US dollars?", options: ["$10", "$12", "$100", "$120"], a: 0 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Tamale", value: 9.4 }, { label: "Kumasi", value: 6.7 }, { label: "Accra", value: 5.6 }, { label: "Takoradi", value: 4.9 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the cocoa sequence", tiles: ["🍫", "🥁", "🌊", "⚽", "🪘"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the coastal-fort signal" }],
      },
    },
    /* ------------------------------------------------------- Côte d'Ivoire */
    {
      id: "CI", name: "Côte d'Ivoire", region: "Africa", flag: "🇨🇮", capital: "Yamoussoukro", ll: [6.8, -5.3],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "Côte d'Ivoire is the world's largest producer of which crop?", options: ["Coffee", "Cocoa", "Rubber", "Cotton"], a: 1 },
          { cat: "trivia", type: "brain", q: "Abidjan, the largest city of Côte d'Ivoire, lies on the coast of which body of water?", options: ["Red Sea", "Atlantic Ocean", "Indian Ocean", "Mediterranean Sea"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Côte d'Ivoire?", options: ["Naira", "CFA Franc", "Cedi", "Dirham"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "ABIDJAN", hint: "Largest city of Côte d'Ivoire" },
          { cat: "word", type: "brain", answer: "COCOA", hint: "Top export crop here" },
        ],
        math: [
          { cat: "math", type: "brain", q: "CFA6000 at CFA600 = $1 is how many US dollars?", options: ["$6", "$10", "$60", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Korhogo", value: 9.5 }, { label: "Bouaké", value: 7.7 }, { label: "Yamoussoukro", value: 6.8 }, { label: "Abidjan", value: 5.4 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the cocoa-coast sequence", tiles: ["🍫", "🌴", "⚽", "🥁", "🌊"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the lagoon signal" }],
      },
    },
    /* ------------------------------------------------------------- Senegal */
    {
      id: "SN", name: "Senegal", region: "Africa", flag: "🇸🇳", capital: "Dakar", ll: [14.7, -17.5],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "Dakar sits near the westernmost point of which continent?", options: ["Europe", "Africa", "Asia", "South America"], a: 1 },
          { cat: "trivia", type: "brain", q: "What is the capital of Senegal?", options: ["Bamako", "Dakar", "Conakry", "Banjul"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Senegal?", options: ["CFA Franc", "Naira", "Cedi", "Dirham"], a: 0 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "DAKAR", hint: "Senegal's capital city" },
          { cat: "word", type: "brain", answer: "SENEGAL", hint: "This West African nation" },
        ],
        math: [
          { cat: "math", type: "brain", q: "CFA3000 at CFA600 = $1 is how many US dollars?", options: ["$3", "$5", "$30", "$50"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Saint-Louis", value: 16.0 }, { label: "Touba", value: 14.9 }, { label: "Dakar", value: 14.7 }, { label: "Ziguinchor", value: 12.6 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the coastal sequence", tiles: ["🥜", "🌊", "🥁", "🛶", "🏝️"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the harbour signal" }],
      },
    },
    /* ------------------------------------------------------------- Algeria */
    {
      id: "DZ", name: "Algeria", region: "Africa", flag: "🇩🇿", capital: "Algiers", ll: [36.8, 3.1],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "Algeria is the largest country by area on which continent?", options: ["Asia", "Africa", "Europe", "South America"], a: 1 },
          { cat: "trivia", type: "brain", q: "Most of southern Algeria is covered by which desert?", options: ["Kalahari", "Sahara", "Gobi", "Namib"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Algeria?", options: ["Dirham", "Dinar", "Franc", "Pound"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "ALGIERS", hint: "Algeria's capital city" },
          { cat: "word", type: "brain", answer: "SAHARA", hint: "Vast desert in the south" },
        ],
        math: [
          { cat: "math", type: "brain", q: "DA1350 at DA135 = $1 is how many US dollars?", options: ["$10", "$13", "$100", "$135"], a: 0 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Algiers", value: 36.8 }, { label: "Constantine", value: 36.4 }, { label: "Oran", value: 35.7 }, { label: "Tamanrasset", value: 22.8 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the Sahara sequence", tiles: ["🏜️", "🐫", "🕌", "🛢️", "🌊"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the desert-outpost signal" }],
      },
    },
    /* ------------------------------------------------------------- Tunisia */
    {
      id: "TN", name: "Tunisia", region: "Africa", flag: "🇹🇳", capital: "Tunis", ll: [36.8, 10.2],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "The ruins of the ancient city of Carthage lie near the capital of which country?", options: ["Libya", "Tunisia", "Algeria", "Morocco"], a: 1 },
          { cat: "trivia", type: "brain", q: "This North African nation's capital and largest city is which of these?", options: ["Sfax", "Sousse", "Tunis", "Bizerte"], a: 2 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Tunisia?", options: ["Dirham", "Dinar", "Franc", "Lira"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "TUNIS", hint: "Tunisia's capital city" },
          { cat: "word", type: "brain", answer: "CARTHAGE", hint: "Ancient city near Tunis" },
        ],
        math: [
          { cat: "math", type: "brain", q: "DT30 at DT3 = $1 is how many US dollars?", options: ["$3", "$10", "$30", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Bizerte", value: 37.3 }, { label: "Tunis", value: 36.8 }, { label: "Sousse", value: 35.8 }, { label: "Sfax", value: 34.7 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the medina sequence", tiles: ["🕌", "🫒", "🏜️", "🌊", "🏺"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the medina-gate signal" }],
      },
    },
    /* -------------------------------------------------------------- Uganda */
    {
      id: "UG", name: "Uganda", region: "Africa", flag: "🇺🇬", capital: "Kampala", ll: [0.3, 32.6],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "Uganda borders Lake Victoria, from which flows the source of which great river?", options: ["Congo", "Nile", "Zambezi", "Niger"], a: 1 },
          { cat: "trivia", type: "brain", q: "Uganda is a famous destination for trekking to see which endangered animal?", options: ["Mountain Gorilla", "Panda", "Orangutan", "Polar Bear"], a: 0 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Uganda?", options: ["Rand", "Shilling", "Cedi", "Naira"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "KAMPALA", hint: "Uganda's capital city" },
          { cat: "word", type: "brain", answer: "GORILLA", hint: "Ape trekked to see here" },
        ],
        math: [
          { cat: "math", type: "brain", q: "USh37000 at USh3700 = $1 is how many US dollars?", options: ["$10", "$37", "$100", "$370"], a: 0 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Gulu", value: 2.8 }, { label: "Kampala", value: 0.3 }, { label: "Entebbe", value: 0.1 }, { label: "Mbarara", value: -0.6 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the safari sequence", tiles: ["🦍", "🌊", "🌍", "🐘", "🌿"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the lakeside signal" }],
      },
    },
    /* ------------------------------------------------------------ Zimbabwe */
    {
      id: "ZW", name: "Zimbabwe", region: "Africa", flag: "🇿🇼", capital: "Harare", ll: [-17.8, 31.0],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "Victoria Falls, one of the world's largest waterfalls, lies on the border of Zimbabwe and which country?", options: ["Zambia", "Botswana", "Mozambique", "South Africa"], a: 0 },
          { cat: "trivia", type: "brain", q: "Victoria Falls is formed by which river?", options: ["Nile", "Zambezi", "Limpopo", "Congo"], a: 1 },
          { cat: "trivia", type: "brain", q: "What is the capital of Zimbabwe?", options: ["Bulawayo", "Harare", "Mutare", "Gweru"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "HARARE", hint: "Zimbabwe's capital city" },
          { cat: "word", type: "brain", answer: "ZAMBEZI", hint: "River of Victoria Falls" },
        ],
        math: [
          { cat: "math", type: "brain", q: "If a falls tour costs $45 and you pay with a $100 note, how much change?", options: ["$45", "$55", "$65", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Harare", value: -17.8 }, { label: "Mutare", value: -19.0 }, { label: "Gweru", value: -19.5 }, { label: "Bulawayo", value: -20.2 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the waterfall sequence", tiles: ["💦", "🌊", "🐘", "🪨", "🌈"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the waterfall signal" }],
      },
    },
    /* ---------------------------------------------------------- Mozambique */
    {
      id: "MZ", name: "Mozambique", region: "Africa", flag: "🇲🇿", capital: "Maputo", ll: [-25.9, 32.6],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "Mozambique's official language is which European language?", options: ["French", "Portuguese", "Spanish", "English"], a: 1 },
          { cat: "trivia", type: "brain", q: "Mozambique has a long coastline on which ocean?", options: ["Atlantic", "Indian", "Pacific", "Southern"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Mozambique?", options: ["Rand", "Metical", "Kwanza", "Escudo"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "MAPUTO", hint: "Mozambique's capital city" },
          { cat: "word", type: "brain", answer: "METICAL", hint: "Mozambique's currency" },
        ],
        math: [
          { cat: "math", type: "brain", q: "MT640 at MT64 = $1 is how many US dollars?", options: ["$6", "$10", "$64", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Pemba", value: -13.0 }, { label: "Nampula", value: -15.1 }, { label: "Beira", value: -19.8 }, { label: "Maputo", value: -26.0 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the coastal sequence", tiles: ["🦐", "🌊", "🏝️", "🐠", "🌴"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the seaside signal" }],
      },
    },
    /* ---------------------------------------------------------- Madagascar */
    {
      id: "MG", name: "Madagascar", region: "Africa", flag: "🇲🇬", capital: "Antananarivo", ll: [-18.9, 47.5],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "Madagascar is world-famous as the only natural home of which primate?", options: ["Lemur", "Gorilla", "Orangutan", "Baboon"], a: 0 },
          { cat: "trivia", type: "brain", q: "Madagascar is a large island in which ocean?", options: ["Atlantic", "Indian", "Pacific", "Arctic"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Madagascar?", options: ["Ariary", "Rand", "Franc", "Shilling"], a: 0 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "LEMUR", hint: "Primate unique to this island" },
          { cat: "word", type: "brain", answer: "BAOBAB", hint: "Thick-trunked tree here" },
        ],
        math: [
          { cat: "math", type: "brain", q: "Ar45000 at Ar4500 = $1 is how many US dollars?", options: ["$10", "$45", "$100", "$450"], a: 0 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Antsiranana", value: -12.3 }, { label: "Mahajanga", value: -15.7 }, { label: "Antananarivo", value: -18.9 }, { label: "Toliara", value: -23.4 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the rainforest sequence", tiles: ["🦎", "🌴", "🐒", "🦋", "🌺"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the rainforest signal" }],
      },
    },
    /* ------------------------------------------------------------ Cameroon */
    {
      id: "CM", name: "Cameroon", region: "Africa", flag: "🇨🇲", capital: "Yaoundé", ll: [3.9, 11.5],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "Cameroon's national football team is nicknamed the Indomitable what?", options: ["Eagles", "Lions", "Elephants", "Stars"], a: 1 },
          { cat: "trivia", type: "brain", q: "What is the capital of Cameroon?", options: ["Douala", "Yaoundé", "Bamenda", "Garoua"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Cameroon?", options: ["Naira", "CFA Franc", "Cedi", "Rand"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "YAOUNDE", hint: "Cameroon's capital city" },
          { cat: "word", type: "brain", answer: "DOUALA", hint: "Cameroon's largest port city" },
        ],
        math: [
          { cat: "math", type: "brain", q: "CFA1800 at CFA600 = $1 is how many US dollars?", options: ["$3", "$6", "$18", "$30"], a: 0 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Maroua", value: 10.6 }, { label: "Garoua", value: 9.3 }, { label: "Douala", value: 4.1 }, { label: "Yaoundé", value: 3.9 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the safari sequence", tiles: ["🦁", "⚽", "🌋", "🌴", "🥁"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the pitch-side signal" }],
      },
    },
    /* -------------------------------------------------------------- Angola */
    {
      id: "AO", name: "Angola", region: "Africa", flag: "🇦🇴", capital: "Luanda", ll: [-8.8, 13.2],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "Angola's official language is which European language?", options: ["French", "Portuguese", "Spanish", "English"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Angola?", options: ["Metical", "Kwanza", "Rand", "Escudo"], a: 1 },
          { cat: "trivia", type: "brain", q: "Angola's economy relies heavily on oil and which precious gemstones?", options: ["Emeralds", "Diamonds", "Rubies", "Sapphires"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "LUANDA", hint: "Angola's capital city" },
          { cat: "word", type: "brain", answer: "KWANZA", hint: "Angola's currency" },
        ],
        math: [
          { cat: "math", type: "brain", q: "Kz8300 at Kz830 = $1 is how many US dollars?", options: ["$10", "$83", "$100", "$830"], a: 0 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Luanda", value: -8.8 }, { label: "Huambo", value: -12.8 }, { label: "Lubango", value: -14.9 }, { label: "Namibe", value: -15.2 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the coastal sequence", tiles: ["🛢️", "💎", "🌊", "🥁", "🌴"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the harbour signal" }],
      },
    },
    /* ----------------------------------------------------------- Guatemala */
    {
      id: "GT", name: "Guatemala", region: "North America", flag: "🇬🇹", capital: "Guatemala City", ll: [14.6, -90.5],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "The ancient Maya pyramids of Tikal are located in which country?", options: ["Mexico", "Guatemala", "Honduras", "Belize"], a: 1 },
          { cat: "trivia", type: "brain", q: "Guatemala's currency is named after which national bird?", options: ["Toucan", "Quetzal", "Macaw", "Condor"], a: 1 },
          { cat: "trivia", type: "brain", q: "What is the capital of Guatemala?", options: ["Antigua", "Quetzaltenango", "Guatemala City", "Cobán"], a: 2 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "TIKAL", hint: "Great Maya ruin here" },
          { cat: "word", type: "brain", answer: "QUETZAL", hint: "National bird and currency" },
        ],
        math: [
          { cat: "math", type: "brain", q: "Q75 at Q7.5 = $1 is how many US dollars?", options: ["$7", "$10", "$75", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Cobán", value: 15.5 }, { label: "Quetzaltenango", value: 14.8 }, { label: "Guatemala City", value: 14.6 }, { label: "Escuintla", value: 14.3 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the Mayan sequence", tiles: ["🛕", "🌋", "🦜", "🌽", "🥑"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the temple-step signal" }],
      },
    },
    /* ---------------------------------------------------------- Costa Rica */
    {
      id: "CR", name: "Costa Rica", region: "North America", flag: "🇨🇷", capital: "San José", ll: [9.9, -84.1],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "Costa Rica is notable for having abolished which national institution in 1948?", options: ["Its Army", "Its Currency", "Its Parliament", "Its Taxes"], a: 0 },
          { cat: "trivia", type: "brain", q: "What is the capital of Costa Rica?", options: ["Liberia", "San José", "Cartago", "Limón"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Costa Rica?", options: ["Peso", "Colón", "Quetzal", "Balboa"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "COLON", hint: "Costa Rica's currency" },
          { cat: "word", type: "brain", answer: "TOUCAN", hint: "Big-billed rainforest bird" },
        ],
        math: [
          { cat: "math", type: "brain", q: "₡5000 at ₡500 = $1 is how many US dollars?", options: ["$5", "$10", "$50", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Liberia", value: 10.6 }, { label: "La Fortuna", value: 10.5 }, { label: "San José", value: 9.9 }, { label: "Golfito", value: 8.6 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the rainforest sequence", tiles: ["🦥", "🌴", "🦜", "🌋", "☕"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the canopy signal" }],
      },
    },
    /* -------------------------------------------------------------- Panama */
    {
      id: "PA", name: "Panama", region: "North America", flag: "🇵🇦", capital: "Panama City", ll: [9.0, -79.5],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "The Panama Canal connects the Atlantic Ocean to which other ocean?", options: ["Indian", "Pacific", "Arctic", "Southern"], a: 1 },
          { cat: "trivia", type: "brain", q: "The Panama Canal was built to save ships from sailing around which continent?", options: ["Africa", "South America", "Australia", "Antarctica"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which currency, alongside the US dollar, is used in Panama?", options: ["Colón", "Balboa", "Quetzal", "Peso"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "BALBOA", hint: "Panama's local currency" },
          { cat: "word", type: "brain", answer: "PANAMA", hint: "This canal-crossed nation" },
        ],
        math: [
          { cat: "math", type: "brain", q: "A ship pays an $80 toll and hands over $200. How much change?", options: ["$100", "$120", "$180", "$200"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Colón", value: 9.4 }, { label: "Panama City", value: 9.0 }, { label: "David", value: 8.4 }, { label: "Santiago", value: 8.1 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the canal sequence", tiles: ["🚢", "🌊", "⚓", "🌴", "🦜"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the lock-gate signal" }],
      },
    },
    /* -------------------------------------------------- Dominican Republic */
    {
      id: "DO", name: "Dominican Republic", region: "North America", flag: "🇩🇴", capital: "Santo Domingo", ll: [18.5, -69.9],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "The Dominican Republic shares the island of Hispaniola with which country?", options: ["Cuba", "Haiti", "Jamaica", "Puerto Rico"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which sport is hugely popular and a major export of talent in the Dominican Republic?", options: ["Cricket", "Baseball", "Rugby", "Ice Hockey"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which currency is used in the Dominican Republic?", options: ["Peso", "Balboa", "Colón", "Gourde"], a: 0 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "BASEBALL", hint: "Beloved national sport here" },
          { cat: "word", type: "brain", answer: "MERENGUE", hint: "Lively Dominican dance music" },
        ],
        math: [
          { cat: "math", type: "brain", q: "RD$600 at RD$60 = $1 is how many US dollars?", options: ["$6", "$10", "$60", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Puerto Plata", value: 19.8 }, { label: "Santiago", value: 19.5 }, { label: "La Vega", value: 19.2 }, { label: "Santo Domingo", value: 18.5 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the Caribbean sequence", tiles: ["⚾", "🏝️", "🌴", "🥁", "🌊"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the beachfront signal" }],
      },
    },
    /* ------------------------------------------------------------- Jamaica */
    {
      id: "JM", name: "Jamaica", region: "North America", flag: "🇯🇲", capital: "Kingston", ll: [18.0, -76.8],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "Jamaica is the birthplace of which music genre, made famous by Bob Marley?", options: ["Reggae", "Salsa", "Calypso", "Samba"], a: 0 },
          { cat: "trivia", type: "brain", q: "Sprinter Usain Bolt, the fastest man ever, is from which country?", options: ["Trinidad", "Jamaica", "Bahamas", "Barbados"], a: 1 },
          { cat: "trivia", type: "brain", q: "What is the capital of Jamaica?", options: ["Montego Bay", "Kingston", "Ocho Rios", "Spanish Town"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "REGGAE", hint: "Music genre born in Jamaica" },
          { cat: "word", type: "brain", answer: "KINGSTON", hint: "Jamaica's capital city" },
        ],
        math: [
          { cat: "math", type: "brain", q: "J$1500 at J$150 = $1 is how many US dollars?", options: ["$10", "$15", "$100", "$150"], a: 0 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Montego Bay", value: 18.5 }, { label: "Ocho Rios", value: 18.4 }, { label: "Mandeville", value: 18.0 }, { label: "Kingston", value: 17.9 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the reggae sequence", tiles: ["🎵", "🏝️", "🌴", "🥁", "☕"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the beach-party signal" }],
      },
    },
    /* ------------------------------------------------------------- Ecuador */
    {
      id: "EC", name: "Ecuador", region: "South America", flag: "🇪🇨", capital: "Quito", ll: [-0.2, -78.5],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "The Galápagos Islands, famed for unique wildlife, belong to which country?", options: ["Peru", "Ecuador", "Chile", "Colombia"], a: 1 },
          { cat: "trivia", type: "brain", q: "Ecuador takes its name from its location on which imaginary line?", options: ["Equator", "Prime Meridian", "Tropic of Cancer", "Arctic Circle"], a: 0 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Ecuador?", options: ["Sol", "US Dollar", "Peso", "Sucre"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "QUITO", hint: "Ecuador's capital city" },
          { cat: "word", type: "brain", answer: "GALAPAGOS", hint: "Wildlife islands off Ecuador" },
        ],
        math: [
          { cat: "math", type: "brain", q: "Ecuador uses US dollars. A hat costs $12 and you pay $20 — how much change?", options: ["$6", "$8", "$10", "$12"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Ibarra", value: 0.4 }, { label: "Quito", value: -0.2 }, { label: "Guayaquil", value: -2.2 }, { label: "Cuenca", value: -2.9 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the Galápagos sequence", tiles: ["🐢", "🦎", "🌋", "🐧", "🏝️"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the equator-line signal" }],
      },
    },
    /* ------------------------------------------------------------- Bolivia */
    {
      id: "BO", name: "Bolivia", region: "South America", flag: "🇧🇴", capital: "La Paz", ll: [-16.5, -68.1],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "The Salar de Uyuni, the world's largest salt flat, is located in which country?", options: ["Chile", "Bolivia", "Peru", "Argentina"], a: 1 },
          { cat: "trivia", type: "brain", q: "Bolivia shares Lake Titicaca, a high-altitude lake, with which country?", options: ["Peru", "Chile", "Brazil", "Ecuador"], a: 0 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Bolivia?", options: ["Sol", "Boliviano", "Peso", "Guaraní"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "ANDES", hint: "Mountain range across Bolivia" },
          { cat: "word", type: "brain", answer: "TITICACA", hint: "High lake shared with Peru" },
        ],
        math: [
          { cat: "math", type: "brain", q: "Bs70 at Bs7 = $1 is how many US dollars?", options: ["$7", "$10", "$70", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "La Paz", value: -16.5 }, { label: "Cochabamba", value: -17.4 }, { label: "Sucre", value: -19.0 }, { label: "Potosí", value: -19.6 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the salt-flat sequence", tiles: ["🧂", "🏔️", "🦙", "🌄", "🛖"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the salt-flat signal" }],
      },
    },
    /* ------------------------------------------------------------- Uruguay */
    {
      id: "UY", name: "Uruguay", region: "South America", flag: "🇺🇾", capital: "Montevideo", ll: [-34.9, -56.2],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "Uruguay hosted and won the very first FIFA World Cup in which decade?", options: ["1910s", "1930s", "1950s", "1970s"], a: 1 },
          { cat: "trivia", type: "brain", q: "What is the capital of Uruguay?", options: ["Salto", "Montevideo", "Paysandú", "Colonia"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Uruguay?", options: ["Guaraní", "Peso", "Real", "Sol"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "URUGUAY", hint: "This South American nation" },
          { cat: "word", type: "brain", answer: "ASADO", hint: "Grilled beef feast here" },
        ],
        math: [
          { cat: "math", type: "brain", q: "$U450 at $U45 = $1 is how many US dollars?", options: ["$10", "$45", "$100", "$450"], a: 0 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Salto", value: -31.4 }, { label: "Paysandú", value: -32.3 }, { label: "Montevideo", value: -34.9 }, { label: "Punta del Este", value: -35.0 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the football sequence", tiles: ["⚽", "🥩", "🧉", "🌊", "🐎"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the pitch signal" }],
      },
    },
    /* ------------------------------------------------------------ Paraguay */
    {
      id: "PY", name: "Paraguay", region: "South America", flag: "🇵🇾", capital: "Asunción", ll: [-25.3, -57.6],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "Paraguay's currency shares its name with which indigenous language spoken there?", options: ["Quechua", "Guaraní", "Aymara", "Mapuche"], a: 1 },
          { cat: "trivia", type: "brain", q: "The huge Itaipú hydroelectric dam is shared by Paraguay and which country?", options: ["Argentina", "Brazil", "Bolivia", "Uruguay"], a: 1 },
          { cat: "trivia", type: "brain", q: "What is the capital of Paraguay?", options: ["Encarnación", "Asunción", "Concepción", "Ciudad del Este"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "GUARANI", hint: "Language and currency here" },
          { cat: "word", type: "brain", answer: "ASUNCION", hint: "Paraguay's capital city" },
        ],
        math: [
          { cat: "math", type: "brain", q: "₲70000 at ₲7000 = $1 is how many US dollars?", options: ["$7", "$10", "$70", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Concepción", value: -23.4 }, { label: "Asunción", value: -25.3 }, { label: "Ciudad del Este", value: -25.5 }, { label: "Encarnación", value: -27.3 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the river sequence", tiles: ["🌊", "⚡", "🌿", "🧉", "🐆"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the riverbank signal" }],
      },
    },
    /* ----------------------------------------------------------- Venezuela */
    {
      id: "VE", name: "Venezuela", region: "South America", flag: "🇻🇪", capital: "Caracas", ll: [10.5, -66.9],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "Angel Falls, the world's highest uninterrupted waterfall, is located in which country?", options: ["Brazil", "Venezuela", "Colombia", "Guyana"], a: 1 },
          { cat: "trivia", type: "brain", q: "Venezuela holds some of the world's largest reserves of which resource?", options: ["Gold", "Oil", "Coal", "Uranium"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Venezuela?", options: ["Sol", "Bolívar", "Peso", "Real"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "CARACAS", hint: "Venezuela's capital city" },
          { cat: "word", type: "brain", answer: "ORINOCO", hint: "Major Venezuelan river" },
        ],
        math: [
          { cat: "math", type: "brain", q: "Bs130 at Bs13 = $1 is how many US dollars?", options: ["$10", "$13", "$100", "$130"], a: 0 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Maracaibo", value: 10.7 }, { label: "Caracas", value: 10.5 }, { label: "Valencia", value: 10.2 }, { label: "Ciudad Bolívar", value: 8.1 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the waterfall sequence", tiles: ["💦", "🌊", "🛢️", "🏞️", "🦜"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the cascade signal" }],
      },
    },
    /* ---------------------------------------------------------------- Fiji */
    {
      id: "FJ", name: "Fiji", region: "Oceania", flag: "🇫🇯", capital: "Suva", ll: [-18.1, 178.4],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "Fiji is an island nation located in which ocean?", options: ["Atlantic", "Pacific", "Indian", "Arctic"], a: 1 },
          { cat: "trivia", type: "brain", q: "Fiji is world-renowned for its national team in which sport?", options: ["Cricket", "Rugby", "Basketball", "Cycling"], a: 1 },
          { cat: "trivia", type: "brain", q: "What is the capital of Fiji?", options: ["Nadi", "Suva", "Lautoka", "Labasa"], a: 1 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "SUVA", hint: "Fiji's capital city" },
          { cat: "word", type: "brain", answer: "FIJI", hint: "This Pacific island nation" },
        ],
        math: [
          { cat: "math", type: "brain", q: "FJ$22 at FJ$2.2 = $1 is how many US dollars?", options: ["$2", "$10", "$22", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Labasa", value: -16.4 }, { label: "Lautoka", value: -17.6 }, { label: "Nadi", value: -17.8 }, { label: "Suva", value: -18.1 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the island sequence", tiles: ["🏝️", "🌊", "🐠", "🥥", "🏉"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the reef signal" }],
      },
    },
    /* --------------------------------------------------- Papua New Guinea */
    {
      id: "PG", name: "Papua New Guinea", region: "Oceania", flag: "🇵🇬", capital: "Port Moresby", ll: [-9.5, 147.2],
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "Papua New Guinea is famous for having the world's greatest diversity of what?", options: ["Volcanoes", "Languages", "Deserts", "Glaciers"], a: 1 },
          { cat: "trivia", type: "brain", q: "Papua New Guinea shares the island of New Guinea with which country?", options: ["Australia", "Indonesia", "Philippines", "Malaysia"], a: 1 },
          { cat: "trivia", type: "brain", q: "Which currency is used in Papua New Guinea?", options: ["Kina", "Dollar", "Peso", "Vatu"], a: 0 },
        ],
        word: [
          { cat: "word", type: "brain", answer: "KINA", hint: "Papua New Guinea's currency" },
          { cat: "word", type: "brain", answer: "MORESBY", hint: "Part of the capital's name" },
        ],
        math: [
          { cat: "math", type: "brain", q: "K30 at K3 = $1 is how many US dollars?", options: ["$3", "$10", "$30", "$100"], a: 1 },
        ],
        spatial: [
          { cat: "spatial", type: "brain", q: "Order these cities north → south", dir: "north", unit: "",
            items: [{ label: "Wewak", value: -3.6 }, { label: "Madang", value: -5.2 }, { label: "Lae", value: -6.7 }, { label: "Port Moresby", value: -9.5 }] },
        ],
        memory: [{ cat: "memory", type: "reflex", prompt: "Memorise the rainforest sequence", tiles: ["🐦", "🌴", "🌺", "🥥", "🌊"] }],
        reflex: [{ cat: "reflex", type: "reflex", prompt: "React at the highland signal" }],
      },
    },
  ];
})();
