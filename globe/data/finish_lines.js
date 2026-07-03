/* ============================================================================
   RunTheGlobe — Finish Line Pool (Round 9 / the Final)  — GDD v1 §11
   ----------------------------------------------------------------------------
   Data-only. Loaded before the engine as window.GLOBE_FINISH_LINES.

   The Final always ends at a location drawn from this pool. Per the GDD build
   note, every entry is tagged at data-entry time with a recognizability signal
   so the pool can be weighted/filtered later WITHOUT a re-tagging pass:

     tier: 3 = globally iconic · 2 = well known · 1 = regional / domestic
     global_landmark: boolean  (convenience flag, == tier >= 3)

   `country` links an entry to a country id in countries.js when one of the
   seed-pool countries hosts it, so the Final can reuse that country's task bank.
   When null, the engine falls back to a task drawn from the global pool. As the
   country pool grows (GDD §12), backfill more of these links — safe either way
   (an unknown id just falls back).

   Inspired by (not reproducing) the kinds of places long-running race finales
   have used. The real US show's finish lines skew domestic (many mid-size US
   cities); that heritage is represented here as tier-1 entries and tagged so an
   all-domestic Final can be down-weighted if it ever feels off-brand for a game
   called RunTheGlobe (GDD §11). Broad by design for long-term replay variety;
   expand by appending entries with the same shape.
   ========================================================================== */
(function () {
  "use strict";

  var F = [
    /* ---------------------------------------------------------- North America */
    { id: "FL_NYC", city: "New York City",   country: null, region: "North America", flag: "🗽", landmark: "the Statue of Liberty", tier: 3 },
    { id: "FL_SFO", city: "San Francisco",   country: null, region: "North America", flag: "🌉", landmark: "the Golden Gate Bridge", tier: 3 },
    { id: "FL_LAX", city: "Los Angeles",     country: null, region: "North America", flag: "🎬", landmark: "the Hollywood Sign", tier: 2 },
    { id: "FL_CHI", city: "Chicago",         country: null, region: "North America", flag: "🌆", landmark: "the lakefront skyline", tier: 2 },
    { id: "FL_LAS", city: "Las Vegas",       country: null, region: "North America", flag: "🎰", landmark: "the Strip", tier: 2 },
    { id: "FL_HNL", city: "Honolulu",        country: null, region: "North America", flag: "🏝️", landmark: "Waikiki Beach", tier: 2 },
    { id: "FL_DCA", city: "Washington, D.C.",country: null, region: "North America", flag: "🏛️", landmark: "the National Mall", tier: 2 },
    { id: "FL_SEA", city: "Seattle",         country: null, region: "North America", flag: "🗼", landmark: "the Space Needle", tier: 2 },
    { id: "FL_MIA", city: "Miami",           country: null, region: "North America", flag: "🌴", landmark: "South Beach", tier: 2 },
    { id: "FL_NOL", city: "New Orleans",     country: null, region: "North America", flag: "🎷", landmark: "the French Quarter", tier: 1 },
    { id: "FL_BOS", city: "Boston",          country: null, region: "North America", flag: "⚾", landmark: "Boston Common", tier: 1 },
    { id: "FL_DEN", city: "Denver",          country: null, region: "North America", flag: "🏔️", landmark: "the Rockies gateway", tier: 1 },
    { id: "FL_AUS", city: "Austin",          country: null, region: "North America", flag: "🎸", landmark: "the Congress Ave. bats", tier: 1 },
    { id: "FL_NSH", city: "Nashville",       country: null, region: "North America", flag: "🎶", landmark: "Broadway's honky-tonks", tier: 1 },
    { id: "FL_ATL", city: "Atlanta",         country: null, region: "North America", flag: "🍑", landmark: "Centennial Olympic Park", tier: 1 },
    { id: "FL_YYZ", city: "Toronto",         country: "CA", region: "North America", flag: "🗼", landmark: "the CN Tower", tier: 2 },
    { id: "FL_YVR", city: "Vancouver",       country: "CA", region: "North America", flag: "🌲", landmark: "Stanley Park", tier: 2 },
    { id: "FL_YUL", city: "Montréal",        country: "CA", region: "North America", flag: "⛪", landmark: "Old Montréal", tier: 1 },
    { id: "FL_MEX", city: "Mexico City",     country: "MX", region: "North America", flag: "🏛️", landmark: "the Zócalo", tier: 2 },
    { id: "FL_CUN", city: "Cancún",          country: "MX", region: "North America", flag: "🏖️", landmark: "the Caribbean shore", tier: 1 },

    /* --------------------------------------------------------------- Europe */
    { id: "FL_PAR", city: "Paris",           country: "FR", region: "Europe", flag: "🗼", landmark: "the Eiffel Tower", tier: 3 },
    { id: "FL_ROM", city: "Rome",            country: "IT", region: "Europe", flag: "🏛️", landmark: "the Colosseum", tier: 3 },
    { id: "FL_VEN", city: "Venice",          country: "IT", region: "Europe", flag: "🚤", landmark: "the Grand Canal", tier: 3 },
    { id: "FL_ATH", city: "Athens",          country: "GR", region: "Europe", flag: "🏛️", landmark: "the Acropolis", tier: 3 },
    { id: "FL_SNT", city: "Santorini",       country: "GR", region: "Europe", flag: "🌅", landmark: "the caldera cliffs", tier: 2 },
    { id: "FL_LON", city: "London",          country: null, region: "Europe", flag: "🎡", landmark: "Tower Bridge", tier: 3 },
    { id: "FL_BCN", city: "Barcelona",       country: null, region: "Europe", flag: "⛪", landmark: "the Sagrada Família", tier: 3 },
    { id: "FL_AMS", city: "Amsterdam",       country: null, region: "Europe", flag: "🚲", landmark: "the canal ring", tier: 2 },
    { id: "FL_BER", city: "Berlin",          country: null, region: "Europe", flag: "🏛️", landmark: "the Brandenburg Gate", tier: 2 },
    { id: "FL_PRG", city: "Prague",          country: null, region: "Europe", flag: "🌉", landmark: "Charles Bridge", tier: 2 },
    { id: "FL_VIE", city: "Vienna",          country: null, region: "Europe", flag: "🏰", landmark: "Schönbrunn Palace", tier: 2 },
    { id: "FL_LIS", city: "Lisbon",          country: null, region: "Europe", flag: "🚋", landmark: "the Belém Tower", tier: 2 },
    { id: "FL_DBV", city: "Dubrovnik",       country: null, region: "Europe", flag: "🧱", landmark: "the old city walls", tier: 2 },
    { id: "FL_MOW", city: "Moscow",          country: null, region: "Europe", flag: "⛪", landmark: "Red Square", tier: 3 },
    { id: "FL_REY", city: "Reykjavík",       country: null, region: "Europe", flag: "⛪", landmark: "Hallgrímskirkja", tier: 1 },
    { id: "FL_STO", city: "Stockholm",       country: null, region: "Europe", flag: "🚢", landmark: "Gamla Stan", tier: 1 },

    /* ----------------------------------------------------------------- Asia */
    { id: "FL_TOK", city: "Tokyo",           country: "JP", region: "Asia", flag: "🗾", landmark: "the Rainbow Bridge", tier: 3 },
    { id: "FL_KYO", city: "Kyoto",           country: "JP", region: "Asia", flag: "⛩️", landmark: "Fushimi Inari's gates", tier: 2 },
    { id: "FL_AGR", city: "Agra",            country: "IN", region: "Asia", flag: "🕌", landmark: "the Taj Mahal", tier: 3 },
    { id: "FL_BOM", city: "Mumbai",          country: "IN", region: "Asia", flag: "🌊", landmark: "the Gateway of India", tier: 2 },
    { id: "FL_JAI", city: "Jaipur",          country: "IN", region: "Asia", flag: "🏰", landmark: "the Amber Fort", tier: 1 },
    { id: "FL_BKK", city: "Bangkok",         country: "TH", region: "Asia", flag: "🛕", landmark: "the Grand Palace", tier: 2 },
    { id: "FL_HKG", city: "Hong Kong",       country: null, region: "Asia", flag: "🌆", landmark: "Victoria Harbour", tier: 2 },
    { id: "FL_SIN", city: "Singapore",       country: null, region: "Asia", flag: "🌳", landmark: "Gardens by the Bay", tier: 2 },
    { id: "FL_PEK", city: "Beijing",         country: null, region: "Asia", flag: "🧱", landmark: "the Great Wall gateway", tier: 3 },
    { id: "FL_SHA", city: "Shanghai",        country: null, region: "Asia", flag: "🏙️", landmark: "the Bund", tier: 2 },
    { id: "FL_SEL", city: "Seoul",           country: null, region: "Asia", flag: "🏯", landmark: "Gyeongbokgung Palace", tier: 2 },
    { id: "FL_DPS", city: "Bali",            country: null, region: "Asia", flag: "🌴", landmark: "the Ubud rice terraces", tier: 2 },
    { id: "FL_HLB", city: "Ha Long Bay",     country: null, region: "Asia", flag: "⛰️", landmark: "the limestone karsts", tier: 2 },
    { id: "FL_KTM", city: "Kathmandu",       country: null, region: "Asia", flag: "🛕", landmark: "the Boudhanath Stupa", tier: 1 },

    /* ---------------------------------------------------------- Middle East */
    { id: "FL_DXB", city: "Dubai",           country: null, region: "Middle East", flag: "🏙️", landmark: "the Burj Khalifa", tier: 2 },
    { id: "FL_IST", city: "Istanbul",        country: null, region: "Europe/Asia", flag: "🕌", landmark: "the Blue Mosque", tier: 2 },
    { id: "FL_JRS", city: "Jerusalem",       country: null, region: "Middle East", flag: "🕍", landmark: "the Old City", tier: 3 },
    { id: "FL_AUH", city: "Abu Dhabi",       country: null, region: "Middle East", flag: "🕌", landmark: "the Sheikh Zayed Mosque", tier: 2 },
    { id: "FL_PET", city: "Petra",           country: null, region: "Middle East", flag: "🏜️", landmark: "the Treasury facade", tier: 3 },

    /* --------------------------------------------------------------- Africa */
    { id: "FL_GIZ", city: "Giza",            country: "EG", region: "Africa", flag: "🔺", landmark: "the Great Pyramids", tier: 3 },
    { id: "FL_CPT", city: "Cape Town",       country: null, region: "Africa", flag: "⛰️", landmark: "Table Mountain", tier: 2 },
    { id: "FL_NBO", city: "Nairobi",         country: "KE", region: "Africa", flag: "🦁", landmark: "Nairobi National Park", tier: 1 },
    { id: "FL_RAK", city: "Marrakech",       country: null, region: "Africa", flag: "🕌", landmark: "Jemaa el-Fnaa", tier: 2 },
    { id: "FL_VFA", city: "Victoria Falls",  country: null, region: "Africa", flag: "💦", landmark: "the falls' edge", tier: 2 },
    { id: "FL_ZNZ", city: "Zanzibar",        country: null, region: "Africa", flag: "🏝️", landmark: "Stone Town", tier: 1 },

    /* -------------------------------------------------------- South America */
    { id: "FL_RIO", city: "Rio de Janeiro",  country: "BR", region: "South America", flag: "⛰️", landmark: "Christ the Redeemer", tier: 3 },
    { id: "FL_MPU", city: "Machu Picchu",    country: null, region: "South America", flag: "🏔️", landmark: "the citadel ruins", tier: 3 },
    { id: "FL_BUE", city: "Buenos Aires",    country: null, region: "South America", flag: "💃", landmark: "the Obelisco", tier: 2 },
    { id: "FL_IGU", city: "Iguazú Falls",    country: null, region: "South America", flag: "💦", landmark: "the Devil's Throat", tier: 2 },
    { id: "FL_CTG", city: "Cartagena",       country: null, region: "South America", flag: "🧱", landmark: "the walled old town", tier: 1 },
    { id: "FL_SCL", city: "Santiago",        country: null, region: "South America", flag: "🏔️", landmark: "the Andean skyline", tier: 1 },

    /* -------------------------------------------------------------- Oceania */
    { id: "FL_SYD", city: "Sydney",          country: "AU", region: "Oceania", flag: "🌉", landmark: "the Sydney Opera House", tier: 3 },
    { id: "FL_AKL", city: "Auckland",        country: null, region: "Oceania", flag: "🗼", landmark: "the Sky Tower", tier: 1 },
    { id: "FL_ZQN", city: "Queenstown",      country: null, region: "Oceania", flag: "🏔️", landmark: "Lake Wakatipu", tier: 1 },
    { id: "FL_BOB", city: "Bora Bora",       country: null, region: "Oceania", flag: "🏝️", landmark: "the lagoon", tier: 2 },
  ];

  F.forEach(function (f) { f.global_landmark = f.tier >= 3; });
  window.GLOBE_FINISH_LINES = F;
})();
