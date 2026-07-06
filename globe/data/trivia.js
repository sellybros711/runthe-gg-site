/* ============================================================================
   RunTheGlobe — supplementary trivia bank
   ----------------------------------------------------------------------------
   Richer, varied trivia keyed by country id: athletes/celebrities, culture,
   history, landmarks, inventions, geography. Merged into each country's
   tasks.trivia at load (see index.html).

   RULE: the correct answer is NEVER the country's own name (that's a giveaway
   when you already know where you are). Answers are specific facts — a dish, a
   person, a sport, a landmark, a number, a neighbour.

   Shape:  ID: [ { q, options:[a,b,c,d], a: <index of correct> }, ... ]
   Only facts we're confident about are included; coverage expands over time.
   ========================================================================== */
(function () {
  "use strict";
  window.GLOBE_TRIVIA = {
    JP: [
      { q: "Which dish of vinegared rice and raw fish comes from Japan?", options: ["Sushi", "Kimchi", "Pho", "Dim sum"], a: 0 },
      { q: "Japan's high-speed 'bullet train' is known as the…?", options: ["Shinkansen", "TGV", "Maglev", "Amtrak"], a: 0 },
      { q: "Which company, maker of the PlayStation, is Japanese?", options: ["Sony", "Samsung", "Nokia", "Lenovo"], a: 0 },
    ],
    BR: [
      { q: "Which world-famous street festival is held in Rio?", options: ["Carnival", "Oktoberfest", "Diwali", "Mardi Gras"], a: 0 },
      { q: "Rio's giant hilltop statue is called Christ the…?", options: ["Redeemer", "Saviour", "Eternal", "Merciful"], a: 0 },
      { q: "Football legend Pelé is considered one of the greatest in which sport?", options: ["Football", "Basketball", "Tennis", "Rugby"], a: 0 },
    ],
    IT: [
      { q: "Which dish originated in Naples?", options: ["Pizza", "Sushi", "Tacos", "Curry"], a: 0 },
      { q: "Who painted the Sistine Chapel ceiling?", options: ["Michelangelo", "Picasso", "Van Gogh", "Monet"], a: 0 },
      { q: "The Colosseum, an ancient amphitheatre, stands in which city?", options: ["Rome", "Athens", "Cairo", "Madrid"], a: 0 },
    ],
    EG: [
      { q: "The pyramids were built as tombs for which rulers?", options: ["Pharaohs", "Emperors", "Sultans", "Tsars"], a: 0 },
      { q: "Which river, the longest in Africa, flows through Egypt?", options: ["Nile", "Congo", "Niger", "Zambezi"], a: 0 },
      { q: "Ancient Egyptians wrote using picture symbols called…?", options: ["Hieroglyphs", "Cuneiform", "Runes", "Kanji"], a: 0 },
    ],
    FR: [
      { q: "The Tour de France is a famous event in which sport?", options: ["Cycling", "Sailing", "Skiing", "Rowing"], a: 0 },
      { q: "The Louvre displays which da Vinci portrait?", options: ["Mona Lisa", "The Scream", "Guernica", "The Kiss"], a: 0 },
      { q: "Which flaky pastry is a classic French breakfast?", options: ["Croissant", "Bagel", "Pretzel", "Scone"], a: 0 },
    ],
    AU: [
      { q: "Which pouched animal is an icon of Australia?", options: ["Kangaroo", "Llama", "Panda", "Bison"], a: 0 },
      { q: "The world's largest coral reef, off Australia, is the Great…?", options: ["Barrier Reef", "Blue Hole", "Atoll", "Lagoon"], a: 0 },
      { q: "Sydney's sail-shaped landmark is the Sydney…?", options: ["Opera House", "Tower Bridge", "Guggenheim", "Louvre"], a: 0 },
    ],
    MX: [
      { q: "Which folded tortilla dish comes from Mexico?", options: ["Taco", "Sushi", "Falafel", "Dumpling"], a: 0 },
      { q: "'Día de los Muertos' means Day of the…?", options: ["Dead", "Sun", "Harvest", "Kings"], a: 0 },
      { q: "Which ancient civilization built pyramids at Teotihuacan?", options: ["Aztec", "Roman", "Viking", "Zulu"], a: 0 },
    ],
    IN: [
      { q: "In which Indian city is the Taj Mahal?", options: ["Agra", "Mumbai", "Chennai", "Jaipur"], a: 0 },
      { q: "Which festival of lights is celebrated across India?", options: ["Diwali", "Hanukkah", "Carnival", "Songkran"], a: 0 },
      { q: "Which sport, played with a bat and wickets, is hugely popular in India?", options: ["Cricket", "Baseball", "Hockey", "Golf"], a: 0 },
    ],
    KE: [
      { q: "Kenya produces many world champions in which sport?", options: ["Distance running", "Swimming", "Skiing", "Fencing"], a: 0 },
      { q: "Millions of wildebeest crossing the Mara is called the Great…?", options: ["Migration", "Flood", "Rut", "Thaw"], a: 0 },
      { q: "A Kenyan safari famously seeks which group of animals?", options: ["The Big Five", "Penguins", "Polar bears", "Koalas"], a: 0 },
    ],
    CA: [
      { q: "Which sport played on ice is Canada's national winter game?", options: ["Ice hockey", "Cricket", "Sumo", "Handball"], a: 0 },
      { q: "Which leaf appears on Canada's flag?", options: ["Maple", "Oak", "Palm", "Fig"], a: 0 },
      { q: "The huge waterfalls on the Canada–US border are called…?", options: ["Niagara Falls", "Victoria Falls", "Angel Falls", "Iguazu Falls"], a: 0 },
    ],
    GR: [
      { q: "The ancient Olympic Games were revived from which country's tradition?", options: ["Greek", "Roman", "Persian", "Egyptian"], a: 0 },
      { q: "The Parthenon temple sits atop which Athens hill?", options: ["The Acropolis", "The Forum", "The Kremlin", "The Alhambra"], a: 0 },
      { q: "In Greek myth, who was king of the gods on Mount Olympus?", options: ["Zeus", "Odin", "Ra", "Thor"], a: 0 },
    ],
    TH: [
      { q: "Thailand's water-splashing New Year festival is called…?", options: ["Songkran", "Holi", "Diwali", "Obon"], a: 0 },
      { q: "Which spicy Thai soup is flavoured with lemongrass?", options: ["Tom yum", "Miso", "Borscht", "Gazpacho"], a: 0 },
      { q: "Bangkok is famous for its ornate Buddhist temples called…?", options: ["Wats", "Pagodas", "Mosques", "Basilicas"], a: 0 },
    ],
    ES: [
      { q: "The tradition of the afternoon nap in Spain is the…?", options: ["Siesta", "Fiesta", "Tapas", "Sangria"], a: 0 },
      { q: "Which artist from Spain co-founded Cubism?", options: ["Picasso", "Michelangelo", "Rembrandt", "Warhol"], a: 0 },
      { q: "The unfinished Sagrada Família church is in which Spanish city?", options: ["Barcelona", "Madrid", "Seville", "Valencia"], a: 0 },
    ],
    DE: [
      { q: "Munich's famous autumn beer festival is called…?", options: ["Oktoberfest", "Carnival", "Mardi Gras", "Vappu"], a: 0 },
      { q: "Which luxury car brand is German?", options: ["Mercedes-Benz", "Ferrari", "Toyota", "Volvo"], a: 0 },
      { q: "The wall that divided Berlin fell in which decade?", options: ["1980s", "1950s", "2000s", "1920s"], a: 0 },
    ],
    GB: [
      { q: "The clock tower by London's Parliament is nicknamed…?", options: ["Big Ben", "The Shard", "The Gherkin", "Old Faithful"], a: 0 },
      { q: "Which band from Liverpool included John Lennon?", options: ["The Beatles", "ABBA", "U2", "Queen"], a: 0 },
      { q: "Who wrote the plays Hamlet and Macbeth?", options: ["Shakespeare", "Dickens", "Tolstoy", "Homer"], a: 0 },
    ],
    PT: [
      { q: "Which mournful style of folk music comes from Portugal?", options: ["Fado", "Flamenco", "Tango", "Reggae"], a: 0 },
      { q: "The custard tart 'pastel de …' is a Portuguese treat.", options: ["Nata", "Crema", "Leche", "Fromage"], a: 0 },
      { q: "Which explorer sailed from Portugal to reach India by sea?", options: ["Vasco da Gama", "Columbus", "Magellan", "Cook"], a: 0 },
    ],
    NL: [
      { q: "Which flowers are the Netherlands most famous for growing?", options: ["Tulips", "Roses", "Orchids", "Sunflowers"], a: 0 },
      { q: "Traditional Dutch structures that harness wind are…?", options: ["Windmills", "Lighthouses", "Aqueducts", "Pagodas"], a: 0 },
      { q: "Which painter of 'The Starry Night' was Dutch?", options: ["Van Gogh", "Monet", "Dalí", "Vermeer"], a: 0 },
    ],
    IE: [
      { q: "Which holiday on March 17 celebrates Ireland's patron saint?", options: ["St. Patrick's Day", "Bastille Day", "Thanksgiving", "May Day"], a: 0 },
      { q: "The dark stout beer Guinness originated in which city?", options: ["Dublin", "London", "Munich", "Prague"], a: 0 },
      { q: "Irish folklore features a small shoemaker fairy called a…?", options: ["Leprechaun", "Troll", "Gnome", "Pixie"], a: 0 },
    ],
    SE: [
      { q: "Which famous pop group hails from Sweden?", options: ["ABBA", "Queen", "U2", "BTS"], a: 0 },
      { q: "Which flat-pack furniture giant is Swedish?", options: ["IKEA", "Bosch", "Nestlé", "Lego"], a: 0 },
      { q: "The Nobel Prizes are awarded mainly in which Swedish city?", options: ["Stockholm", "Oslo", "Geneva", "Vienna"], a: 0 },
    ],
    NO: [
      { q: "Deep sea inlets carved by glaciers, common in Norway, are called…?", options: ["Fjords", "Deltas", "Bays", "Canyons"], a: 0 },
      { q: "Seafaring warriors from medieval Norway were the…?", options: ["Vikings", "Samurai", "Legionnaires", "Cossacks"], a: 0 },
      { q: "Norway lies partly in the Arctic, famous for the Northern…?", options: ["Lights", "Star", "Winds", "Passage"], a: 0 },
    ],
    CH: [
      { q: "Which mountain range covers much of Switzerland?", options: ["The Alps", "The Andes", "The Rockies", "The Urals"], a: 0 },
      { q: "Switzerland is world-famous for making which sweet treat?", options: ["Chocolate", "Marzipan", "Baklava", "Mochi"], a: 0 },
      { q: "Precise Swiss timepieces are known as Swiss…?", options: ["Watches", "Compasses", "Bells", "Scales"], a: 0 },
    ],
    TR: [
      { q: "Istanbul uniquely straddles which two continents?", options: ["Europe & Asia", "Africa & Asia", "Europe & Africa", "Asia & Oceania"], a: 0 },
      { q: "The former cathedral-mosque in Istanbul is the Hagia…?", options: ["Sophia", "Maria", "Irene", "Lucia"], a: 0 },
      { q: "Which strong Turkish drink is served in tiny cups?", options: ["Turkish coffee", "Espresso", "Matcha", "Chai latte"], a: 0 },
    ],
    RU: [
      { q: "The colourful onion-domed cathedral on Red Square is St. …?", options: ["Basil's", "Peter's", "Paul's", "Mark's"], a: 0 },
      { q: "Which country launched the first human into space?", options: ["Soviet Union", "United States", "China", "France"], a: 0 },
      { q: "Which Russian lake is the deepest in the world?", options: ["Lake Baikal", "Lake Victoria", "Lake Como", "Loch Ness"], a: 0 },
    ],
    PL: [
      { q: "Which Polish-born scientist won Nobel Prizes for work on radioactivity?", options: ["Marie Curie", "Rosalind Franklin", "Ada Lovelace", "Jane Goodall"], a: 0 },
      { q: "Which hearty stuffed dumplings are a Polish staple?", options: ["Pierogi", "Ravioli", "Gnocchi", "Wontons"], a: 0 },
      { q: "Which Polish astronomer proposed that Earth orbits the Sun?", options: ["Copernicus", "Galileo", "Newton", "Kepler"], a: 0 },
    ],
    CN: [
      { q: "The Great Wall was built to defend against invaders from the…?", options: ["North", "South", "Sea", "West"], a: 0 },
      { q: "Which round-faced bear is native to China's bamboo forests?", options: ["Giant panda", "Sloth bear", "Polar bear", "Koala"], a: 0 },
      { q: "Ancient China is credited with inventing paper, gunpowder and the…?", options: ["Compass", "Telescope", "Steam engine", "Light bulb"], a: 0 },
    ],
    KR: [
      { q: "The globally popular music genre from South Korea is called…?", options: ["K-pop", "J-rock", "Reggaeton", "Grime"], a: 0 },
      { q: "Which fermented spicy cabbage is a Korean staple?", options: ["Kimchi", "Sauerkraut", "Miso", "Hummus"], a: 0 },
      { q: "Which electronics giant that makes Galaxy phones is South Korean?", options: ["Samsung", "Sony", "Huawei", "Nokia"], a: 0 },
    ],
    VN: [
      { q: "Which noodle soup is a signature dish of Vietnam?", options: ["Pho", "Ramen", "Laksa", "Udon"], a: 0 },
      { q: "The traditional Vietnamese conical hat is called the nón…?", options: ["Lá", "Sombrero", "Beret", "Fez"], a: 0 },
      { q: "Ha Long Bay is famous for thousands of towering limestone…?", options: ["Islands", "Dunes", "Glaciers", "Reefs"], a: 0 },
    ],
    ID: [
      { q: "Which giant lizard is native to the islands of Indonesia?", options: ["Komodo dragon", "Iguana", "Gila monster", "Tuatara"], a: 0 },
      { q: "Which Indonesian island is a famous surfing and temple destination?", options: ["Bali", "Sicily", "Crete", "Zanzibar"], a: 0 },
      { q: "Indonesia is the world's largest country made entirely of…?", options: ["Islands", "Deserts", "Mountains", "Rainforest"], a: 0 },
    ],
    PH: [
      { q: "Filipino icon Manny Pacquiao is a world champion in which sport?", options: ["Boxing", "Basketball", "Sprinting", "Swimming"], a: 0 },
      { q: "The Philippines is made up of roughly how many islands?", options: ["7,000+", "50", "500", "20"], a: 0 },
      { q: "Which sweet purple yam is a popular Filipino dessert flavour?", options: ["Ube", "Taro", "Matcha", "Mango"], a: 0 },
    ],
    SG: [
      { q: "Singapore's mythical lion-fish statue is called the…?", options: ["Merlion", "Sphinx", "Griffin", "Chimera"], a: 0 },
      { q: "The 'Gardens by the Bay' are famous for giant artificial…?", options: ["Supertrees", "Waterfalls", "Pyramids", "Windmills"], a: 0 },
      { q: "Singapore is often described as a city-…?", options: ["State", "Island only", "Region", "Province"], a: 0 },
    ],
    AE: [
      { q: "The world's tallest building, the Burj Khalifa, is in which city?", options: ["Dubai", "Doha", "Riyadh", "Cairo"], a: 0 },
      { q: "The UAE's palm-shaped man-made islands are called Palm…?", options: ["Jumeirah", "Verde", "Springs", "Cove"], a: 0 },
      { q: "The UAE sits on which peninsula?", options: ["Arabian", "Iberian", "Balkan", "Korean"], a: 0 },
    ],
    SA: [
      { q: "Millions of Muslims make the Hajj pilgrimage to which holy city?", options: ["Mecca", "Cairo", "Jerusalem", "Istanbul"], a: 0 },
      { q: "Saudi Arabia is the world's largest exporter of what?", options: ["Oil", "Coffee", "Tea", "Cotton"], a: 0 },
      { q: "Much of Saudi Arabia is covered by what kind of terrain?", options: ["Desert", "Rainforest", "Tundra", "Glacier"], a: 0 },
    ],
    IL: [
      { q: "The extremely salty lake where you float easily is the … Sea.", options: ["Dead", "Red", "Black", "Caspian"], a: 0 },
      { q: "Jerusalem is a holy city for Judaism, Christianity and…?", options: ["Islam", "Buddhism", "Hinduism", "Shinto"], a: 0 },
      { q: "The Jewish festival of lights is called…?", options: ["Hanukkah", "Diwali", "Ramadan", "Lent"], a: 0 },
    ],
    NP: [
      { q: "The world's highest mountain, Everest, lies on the border of Nepal and…?", options: ["China", "India", "Bhutan", "Pakistan"], a: 0 },
      { q: "Which mountain range contains most of the world's tallest peaks?", options: ["Himalayas", "Andes", "Alps", "Rockies"], a: 0 },
      { q: "Nepal's flag is unusual because its shape is…?", options: ["Two stacked triangles", "A perfect square", "A circle", "A pentagon"], a: 0 },
    ],
    ZA: [
      { q: "Which leader became South Africa's first Black president in 1994?", options: ["Nelson Mandela", "Desmond Tutu", "Kofi Annan", "Jomo Kenyatta"], a: 0 },
      { q: "The flat-topped mountain overlooking Cape Town is called…?", options: ["Table Mountain", "Sugarloaf", "Kilimanjaro", "Uluru"], a: 0 },
      { q: "South Africa has how many official languages?", options: ["11", "2", "1", "5"], a: 0 },
    ],
    MA: [
      { q: "A traditional Moroccan open-air market is called a…?", options: ["Souk", "Bazaar-mall", "Piazza", "Plaza"], a: 0 },
      { q: "Morocco's slow-cooked stew is named after its cone-lid pot, the…?", options: ["Tagine", "Wok", "Paella", "Fondue"], a: 0 },
      { q: "Morocco lies just across a narrow strait from which continent?", options: ["Europe", "Asia", "South America", "Antarctica"], a: 0 },
    ],
    NG: [
      { q: "Nigeria is the most populous country on which continent?", options: ["Africa", "Asia", "Europe", "South America"], a: 0 },
      { q: "Nigeria's booming film industry is nicknamed…?", options: ["Nollywood", "Bollywood", "Hollywood", "Chollywood"], a: 0 },
      { q: "Nigerian legend Fela Kuti pioneered which music genre?", options: ["Afrobeat", "Reggae", "Jazz", "Samba"], a: 0 },
    ],
    US: [
      { q: "The Statue of Liberty was a gift to the US from which country?", options: ["France", "Britain", "Spain", "Italy"], a: 0 },
      { q: "Which US city is nicknamed the 'Big Apple'?", options: ["New York", "Chicago", "Boston", "Miami"], a: 0 },
      { q: "Which American astronaut was the first person to walk on the Moon?", options: ["Neil Armstrong", "Buzz Aldrin", "Yuri Gagarin", "John Glenn"], a: 0 },
    ],
    AR: [
      { q: "The passionate partnered dance from Argentina is the…?", options: ["Tango", "Salsa", "Flamenco", "Waltz"], a: 0 },
      { q: "Argentine superstars Messi and Maradona are legends of which sport?", options: ["Football", "Tennis", "Rugby", "Polo"], a: 0 },
      { q: "Argentine cuisine is famous for grilled beef known as…?", options: ["Asado", "Barbacoa", "Teriyaki", "Tandoori"], a: 0 },
    ],
    PE: [
      { q: "The famous Inca citadel high in the Andes is Machu…?", options: ["Picchu", "Pichu", "Pacha", "Chan"], a: 0 },
      { q: "Which ancient empire was centered in Peru?", options: ["Inca", "Aztec", "Maya", "Roman"], a: 0 },
      { q: "Peru is a top producer of which staple crop, with thousands of varieties?", options: ["Potatoes", "Rice", "Wheat", "Corn"], a: 0 },
    ],
    CL: [
      { q: "Chile is an unusually long, thin country along which ocean?", options: ["Pacific", "Atlantic", "Indian", "Arctic"], a: 0 },
      { q: "The driest non-polar desert on Earth, in Chile, is the…?", options: ["Atacama", "Sahara", "Gobi", "Mojave"], a: 0 },
      { q: "The mysterious giant stone heads (Moai) are on Chile's … Island.", options: ["Easter", "Christmas", "Coco", "Galápagos"], a: 0 },
    ],
    CO: [
      { q: "Colombia is one of the world's largest producers of which drink crop?", options: ["Coffee", "Tea", "Cocoa", "Barley"], a: 0 },
      { q: "Which Colombian author wrote 'One Hundred Years of Solitude'?", options: ["Gabriel García Márquez", "Pablo Neruda", "Jorge Luis Borges", "Isabel Allende"], a: 0 },
      { q: "Which dance-heavy music genre has strong Colombian roots?", options: ["Cumbia", "Fado", "Polka", "Blues"], a: 0 },
    ],
    CU: [
      { q: "Which style of dance music originated in Cuba?", options: ["Salsa", "Tango", "Flamenco", "Waltz"], a: 0 },
      { q: "Cuba is world-famous for hand-rolled…?", options: ["Cigars", "Carpets", "Watches", "Chocolate"], a: 0 },
      { q: "Cuba is the largest island in which sea?", options: ["Caribbean", "Mediterranean", "Baltic", "Aegean"], a: 0 },
    ],
    NZ: [
      { q: "Which fantasy film trilogy was famously shot across New Zealand?", options: ["The Lord of the Rings", "Harry Potter", "Star Wars", "Pirates of the Caribbean"], a: 0 },
      { q: "The indigenous people of New Zealand are the…?", options: ["Māori", "Aboriginals", "Inuit", "Zulu"], a: 0 },
      { q: "New Zealand's flightless national-symbol bird is the…?", options: ["Kiwi", "Emu", "Dodo", "Puffin"], a: 0 },
    ],
    FI: [
      { q: "Which wildly popular mobile game was created in Finland?", options: ["Angry Birds", "Candy Crush", "Temple Run", "Fruit Ninja"], a: 0 },
      { q: "A traditional Finnish steam bath is called a…?", options: ["Sauna", "Spa", "Hammam", "Onsen"], a: 0 },
      { q: "Finnish Lapland is often called the home of which festive figure?", options: ["Santa Claus", "The Tooth Fairy", "Cupid", "Jack Frost"], a: 0 },
    ],
    DK: [
      { q: "Which iconic interlocking-brick toy was invented in Denmark?", options: ["LEGO", "Playmobil", "K'nex", "Meccano"], a: 0 },
      { q: "'The Little Mermaid' fairy tale was written by Hans Christian…?", options: ["Andersen", "Grimm", "Perrault", "Dahl"], a: 0 },
      { q: "The Danish concept of cozy contentment is called…?", options: ["Hygge", "Zen", "Ubuntu", "Feng shui"], a: 0 },
    ],
    BE: [
      { q: "Belgium is especially famous for making which sweet food?", options: ["Chocolate", "Marzipan", "Baklava", "Toffee"], a: 0 },
      { q: "Crispy fried potato sticks and this breakfast treat share Belgium's fame — the Belgian…?", options: ["Waffle", "Pretzel", "Bagel", "Crumpet"], a: 0 },
      { q: "Brussels, Belgium's capital, hosts the headquarters of the…?", options: ["European Union", "United Nations", "World Bank", "Red Cross"], a: 0 },
    ],
    AT: [
      { q: "Which composer was born in Salzburg, Austria?", options: ["Mozart", "Beethoven", "Bach", "Chopin"], a: 0 },
      { q: "Which mountain range dominates Austria?", options: ["The Alps", "The Carpathians", "The Pyrenees", "The Urals"], a: 0 },
      { q: "The film 'The Sound of Music' is set in which Austrian city?", options: ["Salzburg", "Vienna", "Graz", "Linz"], a: 0 },
    ],
    CZ: [
      { q: "Which style of pale lager originated in the Czech city of Plzeň?", options: ["Pilsner", "Stout", "Porter", "Ale"], a: 0 },
      { q: "Prague's medieval astronomical clock is famous for its hourly…?", options: ["Figurine parade", "Cannon fire", "Fireworks", "Bell divers"], a: 0 },
      { q: "Prague sits on which river?", options: ["Vltava", "Danube", "Rhine", "Seine"], a: 0 },
    ],
    HU: [
      { q: "Which paprika-spiced stew is Hungary's national dish?", options: ["Goulash", "Borscht", "Bouillabaisse", "Ramen"], a: 0 },
      { q: "Budapest is split by which river into 'Buda' and 'Pest'?", options: ["Danube", "Rhine", "Volga", "Elbe"], a: 0 },
      { q: "Ernő Rubik, inventor of the Rubik's Cube, was a professor of what?", options: ["Architecture", "Chemistry", "Music", "Medicine"], a: 0 },
    ],
    UA: [
      { q: "The 1986 Chernobyl disaster involved which kind of power plant?", options: ["Nuclear", "Coal", "Hydro", "Solar"], a: 0 },
      { q: "Ukraine's fertile black soil makes it a top exporter of what?", options: ["Wheat", "Coffee", "Bananas", "Rubber"], a: 0 },
      { q: "Which sea borders southern Ukraine?", options: ["Black Sea", "Baltic Sea", "Red Sea", "Caspian Sea"], a: 0 },
    ],
    HR: [
      { q: "Dubrovnik's old town was used as 'King's Landing' in which TV series?", options: ["Game of Thrones", "The Crown", "Vikings", "Rome"], a: 0 },
      { q: "Croatia has a long coastline along which sea?", options: ["Adriatic", "Baltic", "Black", "Aegean"], a: 0 },
      { q: "Which item of formal menswear is said to originate from Croatia?", options: ["The necktie", "The top hat", "The waistcoat", "The cufflink"], a: 0 },
    ],
    IS: [
      { q: "Iceland is famous for volcanoes and natural hot-water spouts called…?", options: ["Geysers", "Sand dunes", "Coral reefs", "Rainforests"], a: 0 },
      { q: "Iceland's famous Blue Lagoon spa is fed by what kind of water?", options: ["Geothermal", "Glacial melt", "Rainwater", "Seawater only"], a: 0 },
      { q: "Iceland's capital, the world's northernmost, is…?", options: ["Reykjavík", "Oslo", "Helsinki", "Nuuk"], a: 0 },
    ],
    RO: [
      { q: "The Transylvania region is famously linked to which fictional character?", options: ["Dracula", "Frankenstein", "The Mummy", "King Kong"], a: 0 },
      { q: "Which mountain range arcs through Romania?", options: ["Carpathians", "Alps", "Pyrenees", "Apennines"], a: 0 },
      { q: "Romania's language is a Romance language most similar to…?", options: ["Italian", "German", "Russian", "Greek"], a: 0 },
    ],
    PK: [
      { q: "K2, the world's second-highest mountain, lies on the border of Pakistan and…?", options: ["China", "India", "Nepal", "Iran"], a: 0 },
      { q: "Nobel laureate Malala Yousafzai is famous for championing what?", options: ["Girls' education", "Climate action", "Free press", "Space travel"], a: 0 },
      { q: "Which sport is by far the most popular in Pakistan?", options: ["Cricket", "Ice hockey", "Baseball", "Rugby"], a: 0 },
    ],
    MY: [
      { q: "Kuala Lumpur's iconic twin skyscrapers are the … Towers.", options: ["Petronas", "Marina", "Sears", "Taipei"], a: 0 },
      { q: "The pungent spiky fruit famous in Malaysia is the…?", options: ["Durian", "Lychee", "Mango", "Guava"], a: 0 },
      { q: "Malaysia is split between the Malay Peninsula and part of which island?", options: ["Borneo", "Java", "Sumatra", "Bali"], a: 0 },
    ],
    LK: [
      { q: "The teardrop-shaped island of Sri Lanka lies off the coast of which country?", options: ["India", "Thailand", "Kenya", "Australia"], a: 0 },
      { q: "Sri Lanka is one of the world's leading exporters of which drink?", options: ["Tea", "Coffee", "Wine", "Cocoa"], a: 0 },
      { q: "Sri Lanka sits in which ocean?", options: ["Indian", "Pacific", "Atlantic", "Arctic"], a: 0 },
    ],
    IR: [
      { q: "The ancient ruins of Persepolis belong to which historic empire?", options: ["Persian", "Roman", "Ottoman", "Mughal"], a: 0 },
      { q: "Iran was historically known by which other name?", options: ["Persia", "Mesopotamia", "Anatolia", "Arabia"], a: 0 },
      { q: "Fine hand-knotted rugs, a famed Iranian craft, are called Persian…?", options: ["Carpets", "Silks", "Tiles", "Vases"], a: 0 },
    ],
    JO: [
      { q: "Petra, the rose-red city, was carved into rock by which ancient people?", options: ["Nabataeans", "Vikings", "Aztecs", "Mongols"], a: 0 },
      { q: "Jordan borders the salty lake known as the … Sea.", options: ["Dead", "Red", "Black", "Caspian"], a: 0 },
      { q: "Jordan lies mostly on which peninsula's northern edge?", options: ["Arabian", "Iberian", "Balkan", "Anatolian"], a: 0 },
    ],
    GH: [
      { q: "Ghana was the first sub-Saharan nation to gain independence — on which continent?", options: ["Africa", "Asia", "Europe", "Oceania"], a: 0 },
      { q: "Ghana is a major exporter of which bean used to make chocolate?", options: ["Cocoa", "Coffee", "Soy", "Vanilla"], a: 0 },
      { q: "Ghana's coast lies along which body of water?", options: ["Atlantic Ocean", "Indian Ocean", "Red Sea", "Mediterranean"], a: 0 },
    ],
    DZ: [
      { q: "Algeria is Africa's largest country by area, mostly covered by which desert?", options: ["Sahara", "Kalahari", "Gobi", "Namib"], a: 0 },
      { q: "Algeria sits on which sea's southern shore?", options: ["Mediterranean", "Red", "Black", "Caspian"], a: 0 },
      { q: "Algeria's northern neighbours across the sea are on which continent?", options: ["Europe", "Asia", "South America", "Australia"], a: 0 },
    ],
    TN: [
      { q: "Which sci-fi franchise filmed desert scenes in Tunisia?", options: ["Star Wars", "Star Trek", "Jurassic Park", "The Matrix"], a: 0 },
      { q: "The ancient city of Carthage, near Tunis, was a great rival of which empire?", options: ["Rome", "Greece", "Egypt", "Persia"], a: 0 },
      { q: "Tunisia is the northernmost country on which continent?", options: ["Africa", "Europe", "Asia", "South America"], a: 0 },
    ],
    EC: [
      { q: "The Galápagos Islands are named after which animal that lives there?", options: ["Giant tortoise", "Iguana", "Penguin", "Albatross"], a: 0 },
      { q: "Ecuador is named after which imaginary line that crosses it?", options: ["The Equator", "The Tropic of Cancer", "The Prime Meridian", "The Arctic Circle"], a: 0 },
      { q: "Charles Darwin's study of Galápagos finches helped shape which theory?", options: ["Evolution", "Gravity", "Relativity", "Plate tectonics"], a: 0 },
    ],
    BO: [
      { q: "The Salar de Uyuni in Bolivia is the world's largest natural flat of what?", options: ["Salt", "Sand", "Ice", "Mud"], a: 0 },
      { q: "Bolivia shares the high-altitude Lake Titicaca with which neighbour?", options: ["Peru", "Chile", "Brazil", "Paraguay"], a: 0 },
      { q: "Bolivia's city of La Paz is famous for being extremely…?", options: ["High-altitude", "Below sea level", "Coastal", "Tropical island"], a: 0 },
    ],
    UY: [
      { q: "Uruguay hosted and won the very first FIFA World Cup in which sport?", options: ["Football", "Rugby", "Cricket", "Baseball"], a: 0 },
      { q: "Uruguay sits between Argentina and which larger neighbour?", options: ["Brazil", "Chile", "Peru", "Bolivia"], a: 0 },
      { q: "Like its neighbours, Uruguay enjoys grilled-meat feasts called…?", options: ["Asado", "Luau", "Clambake", "Fondue"], a: 0 },
    ],
    JM: [
      { q: "Jamaican sprinter Usain Bolt holds the world record in which event?", options: ["100 metres", "Marathon", "Long jump", "Hurdles"], a: 0 },
      { q: "Which music genre did Jamaica's Bob Marley make world-famous?", options: ["Reggae", "Jazz", "Blues", "Soul"], a: 0 },
      { q: "Jamaica is an island nation in which sea?", options: ["Caribbean", "Mediterranean", "Baltic", "Coral"], a: 0 },
    ],
    GT: [
      { q: "The jungle pyramids of Tikal in Guatemala were built by which civilization?", options: ["Maya", "Aztec", "Inca", "Olmec"], a: 0 },
      { q: "Guatemala lies on which continent?", options: ["North America", "South America", "Africa", "Asia"], a: 0 },
      { q: "Guatemala's landscape is dotted with dozens of what geological features?", options: ["Volcanoes", "Glaciers", "Fjords", "Geysers"], a: 0 },
    ],
    CR: [
      { q: "Costa Rica is celebrated worldwide for protecting its rainforest…?", options: ["Biodiversity", "Oil fields", "Ski resorts", "Vineyards"], a: 0 },
      { q: "Costa Rica famously abolished which national institution in 1948?", options: ["Its army", "Its currency", "Its parliament", "Its schools"], a: 0 },
      { q: "The Costa Rican phrase for 'pure life' is…?", options: ["Pura vida", "La dolce vita", "Carpe diem", "Hakuna matata"], a: 0 },
    ],
    PA: [
      { q: "Ships crossing the Panama Canal are raised and lowered by structures called…?", options: ["Locks", "Dams", "Piers", "Bridges"], a: 0 },
      { q: "The Panama Canal connects the Atlantic to which ocean?", options: ["Pacific", "Indian", "Arctic", "Southern"], a: 0 },
      { q: "Panama forms a narrow land bridge between North and which continent?", options: ["South America", "Africa", "Asia", "Europe"], a: 0 },
    ],
    VE: [
      { q: "Angel Falls in Venezuela is the world's highest what?", options: ["Waterfall", "Volcano", "Geyser", "Dam"], a: 0 },
      { q: "Venezuela holds some of the world's largest reserves of what?", options: ["Oil", "Gold", "Diamonds", "Coal"], a: 0 },
      { q: "Venezuela sits on the northern coast of which continent?", options: ["South America", "Africa", "North America", "Asia"], a: 0 },
    ],
    ET: [
      { q: "Ethiopia is often cited as the birthplace of which popular drink?", options: ["Coffee", "Tea", "Cocoa", "Cola"], a: 0 },
      { q: "Ethiopia is famous as one of the few African nations never fully…?", options: ["Colonized", "Inhabited", "Mapped", "Named"], a: 0 },
      { q: "Ethiopian athletes dominate which Olympic sport?", options: ["Distance running", "Boxing", "Rowing", "Judo"], a: 0 },
    ],
    TZ: [
      { q: "Mount Kilimanjaro, in Tanzania, is the highest peak on which continent?", options: ["Africa", "Asia", "Europe", "South America"], a: 0 },
      { q: "The spice island of Zanzibar sits in which ocean?", options: ["Indian", "Atlantic", "Pacific", "Arctic"], a: 0 },
      { q: "The Serengeti is famous for the yearly migration of which animal?", options: ["Wildebeest", "Reindeer", "Bison", "Camel"], a: 0 },
    ],
    RS: [
      { q: "Tennis great Novak Djokovic, from Serbia, is a champion in which sport?", options: ["Tennis", "Golf", "Football", "Skiing"], a: 0 },
      { q: "Belgrade, Serbia's capital, sits where the Sava meets which river?", options: ["Danube", "Rhine", "Volga", "Seine"], a: 0 },
      { q: "Serbia is located on which European peninsula?", options: ["Balkan", "Iberian", "Scandinavian", "Italian"], a: 0 },
    ],
  };
})();
