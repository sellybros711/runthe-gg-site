/* ============================================================================
   RunTheGlobe — Finish Line Pool (Round 9 / the Final)  — GDD v1 §11
   ----------------------------------------------------------------------------
   Data-only. Loaded before the engine as window.GLOBE_FINISH_LINES.

   The Final always ends at a location drawn from this pool. Per the GDD build
   note, every entry is tagged at data-entry time with a recognizability signal
   so the pool can be weighted/filtered later WITHOUT a re-tagging pass:

     tier: 3 = globally iconic · 2 = well known · 1 = regional / domestic
     global_landmark: boolean  (convenience flag == tier >= 3)

   `country` links an entry to a country id in countries.js when one exists, so
   the Final can reuse that country's task bank. When null, the engine falls back
   to a task drawn from the global pool.

   Inspired by (not reproducing) the kinds of places long-running race finales
   have used. Starts intentionally broad for replay variety (GDD prefers a full
   pool over a small curated one); expand by appending entries.
   ========================================================================== */
(function () {
  "use strict";

  var F = [
    { id: "FL_NYC", city: "New York City", country: null, region: "North America", flag: "🗽", landmark: "the Statue of Liberty", tier: 3 },
    { id: "FL_PAR", city: "Paris", country: "FR", region: "Europe", flag: "🗼", landmark: "the Eiffel Tower", tier: 3 },
    { id: "FL_TOK", city: "Tokyo", country: "JP", region: "Asia", flag: "🗾", landmark: "the Rainbow Bridge", tier: 3 },
    { id: "FL_RIO", city: "Rio de Janeiro", country: "BR", region: "South America", flag: "⛰️", landmark: "Christ the Redeemer", tier: 3 },
    { id: "FL_ROM", city: "Rome", country: "IT", region: "Europe", flag: "🏛️", landmark: "the Colosseum", tier: 3 },
    { id: "FL_CAI", city: "Giza", country: "EG", region: "Africa", flag: "🔺", landmark: "the Great Pyramids", tier: 3 },
    { id: "FL_SYD", city: "Sydney", country: "AU", region: "Oceania", flag: "🌉", landmark: "the Sydney Opera House", tier: 3 },
    { id: "FL_ATH", city: "Athens", country: "GR", region: "Europe", flag: "🏛️", landmark: "the Acropolis", tier: 3 },
    { id: "FL_AGR", city: "Agra", country: "IN", region: "Asia", flag: "🕌", landmark: "the Taj Mahal", tier: 3 },
    { id: "FL_LON", city: "London", country: null, region: "Europe", flag: "🎡", landmark: "Tower Bridge", tier: 3 },
    { id: "FL_HKG", city: "Hong Kong", country: null, region: "Asia", flag: "🌆", landmark: "Victoria Harbour", tier: 2 },
    { id: "FL_IST", city: "Istanbul", country: null, region: "Europe/Asia", flag: "🕌", landmark: "the Blue Mosque", tier: 2 },
    { id: "FL_DUB", city: "Dubai", country: null, region: "Middle East", flag: "🏙️", landmark: "the Burj Khalifa", tier: 2 },
    { id: "FL_CPT", city: "Cape Town", country: null, region: "Africa", flag: "⛰️", landmark: "Table Mountain", tier: 2 },
    { id: "FL_BKK", city: "Bangkok", country: "TH", region: "Asia", flag: "🛕", landmark: "the Grand Palace", tier: 2 },
    { id: "FL_MEX", city: "Mexico City", country: "MX", region: "North America", flag: "🏛️", landmark: "the Zócalo", tier: 2 },
    { id: "FL_NRB", city: "Nairobi", country: "KE", region: "Africa", flag: "🦁", landmark: "Nairobi National Park", tier: 1 },
    { id: "FL_YYZ", city: "Toronto", country: "CA", region: "North America", flag: "🗼", landmark: "the CN Tower", tier: 2 },
    { id: "FL_SFO", city: "San Francisco", country: null, region: "North America", flag: "🌉", landmark: "the Golden Gate Bridge", tier: 3 },
    { id: "FL_SIN", city: "Singapore", country: null, region: "Asia", flag: "🌳", landmark: "Gardens by the Bay", tier: 2 },
  ];

  F.forEach(function (f) { f.global_landmark = f.tier >= 3; });
  window.GLOBE_FINISH_LINES = F;
})();
