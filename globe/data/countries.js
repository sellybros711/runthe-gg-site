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
    /* ---------------------------------------------------------------- Spain */
    {
      id: "ES", name: "Spain", region: "Europe", flag: "🇪🇸", capital: "Madrid",
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
      id: "DE", name: "Germany", region: "Europe", flag: "🇩🇪", capital: "Berlin",
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
      id: "GB", name: "United Kingdom", region: "Europe", flag: "🇬🇧", capital: "London",
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
      id: "PT", name: "Portugal", region: "Europe", flag: "🇵🇹", capital: "Lisbon",
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Portugal?", options: ["Porto", "Lisbon", "Faro", "Braga"], a: 1 },
          { cat: "trivia", type: "brain", q: "Portugal is famous for which fortified wine?", options: ["Sherry", "Port", "Marsala", "Madeira only"], a: 1 },
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
      id: "NL", name: "Netherlands", region: "Europe", flag: "🇳🇱", capital: "Amsterdam",
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
      id: "IE", name: "Ireland", region: "Europe", flag: "🇮🇪", capital: "Dublin",
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
      id: "SE", name: "Sweden", region: "Europe", flag: "🇸🇪", capital: "Stockholm",
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
      id: "NO", name: "Norway", region: "Europe", flag: "🇳🇴", capital: "Oslo",
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
      id: "CH", name: "Switzerland", region: "Europe", flag: "🇨🇭", capital: "Bern",
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
      id: "TR", name: "Turkey", region: "Europe/Asia", flag: "🇹🇷", capital: "Ankara",
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
      id: "RU", name: "Russia", region: "Europe", flag: "🇷🇺", capital: "Moscow",
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
      id: "PL", name: "Poland", region: "Europe", flag: "🇵🇱", capital: "Warsaw",
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
      id: "CN", name: "China", region: "Asia", flag: "🇨🇳", capital: "Beijing",
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
      id: "KR", name: "South Korea", region: "Asia", flag: "🇰🇷", capital: "Seoul",
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
      id: "VN", name: "Vietnam", region: "Asia", flag: "🇻🇳", capital: "Hanoi",
      tasks: {
        trivia: [
          { cat: "trivia", type: "brain", q: "What is the capital of Vietnam?", options: ["Ho Chi Minh City", "Hanoi", "Da Nang", "Hue"], a: 1 },
          { cat: "trivia", type: "brain", q: "Ha Long Bay is famous for its thousands of limestone…", options: ["Islands", "Waterfalls", "Caves only", "Glaciers"], a: 0 },
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
      id: "ID", name: "Indonesia", region: "Asia", flag: "🇮🇩", capital: "Jakarta",
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
      id: "PH", name: "Philippines", region: "Asia", flag: "🇵🇭", capital: "Manila",
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
      id: "SG", name: "Singapore", region: "Asia", flag: "🇸🇬", capital: "Singapore",
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
      id: "AE", name: "United Arab Emirates", region: "Middle East", flag: "🇦🇪", capital: "Abu Dhabi",
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
      id: "SA", name: "Saudi Arabia", region: "Middle East", flag: "🇸🇦", capital: "Riyadh",
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
      id: "IL", name: "Israel", region: "Middle East", flag: "🇮🇱", capital: "Jerusalem",
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
      id: "NP", name: "Nepal", region: "Asia", flag: "🇳🇵", capital: "Kathmandu",
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
      id: "ZA", name: "South Africa", region: "Africa", flag: "🇿🇦", capital: "Pretoria",
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
      id: "MA", name: "Morocco", region: "Africa", flag: "🇲🇦", capital: "Rabat",
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
      id: "NG", name: "Nigeria", region: "Africa", flag: "🇳🇬", capital: "Abuja",
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
      id: "TZ", name: "Tanzania", region: "Africa", flag: "🇹🇿", capital: "Dodoma",
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
      id: "ET", name: "Ethiopia", region: "Africa", flag: "🇪🇹", capital: "Addis Ababa",
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
      id: "US", name: "United States", region: "North America", flag: "🇺🇸", capital: "Washington, D.C.",
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
      id: "AR", name: "Argentina", region: "South America", flag: "🇦🇷", capital: "Buenos Aires",
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
      id: "PE", name: "Peru", region: "South America", flag: "🇵🇪", capital: "Lima",
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
      id: "CL", name: "Chile", region: "South America", flag: "🇨🇱", capital: "Santiago",
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
      id: "CO", name: "Colombia", region: "South America", flag: "🇨🇴", capital: "Bogotá",
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
      id: "CU", name: "Cuba", region: "North America", flag: "🇨🇺", capital: "Havana",
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
      id: "NZ", name: "New Zealand", region: "Oceania", flag: "🇳🇿", capital: "Wellington",
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
  ];
})();
