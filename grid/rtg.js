/* RunTheGrid — shared hub state (streak · stats · account-ready).
 *
 * Both games (Daily Crossword, Daily Match) load this ONE module and share
 * everything through it, so there is a single RunTheGrid streak and one place
 * that will later sync to a RunThe.GG account. Static, dependency-free.
 *
 *   <script src="/grid/rtg.js"></script>
 *
 * A day counts toward the streak if you finish EITHER game that day. Each game
 * also keeps its own best time / stats. Everything lives under one localStorage
 * key so it moves together and is easy to sync later.
 *
 * API:
 *   RTG.today()                      -> "YYYY-MM-DD" (local)
 *   RTG.get()                        -> full state (read-only snapshot)
 *   RTG.getStreak()                  -> current combined streak (number)
 *   RTG.playedToday(game)            -> bool, has `game` been completed today
 *   RTG.gameStats(game)             -> { bestTime, plays, lastDay, ... }
 *   RTG.recordPlay(game, result)     -> updates streak + game stats, returns state
 *        result: { win?:true, timeSec?:number, ...extra }  (extra is merged into
 *        that day's record, e.g. {moves} for Match)
 *   RTG.onChange(fn)                 -> subscribe to state changes (fn(state))
 *
 * Games known to the hub: "crossword", "match".
 */
(function (global) {
  "use strict";
  var KEY = "rtg:v1";

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function dayStr(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function today() { return dayStr(new Date()); }
  function yesterdayOf(iso) { var d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() - 1); return dayStr(d); }

  function fresh() {
    return {
      v: 1,
      streak: 0,        // consecutive days a RunTheGrid game was completed
      best: 0,          // best streak ever
      lastDay: null,    // last day ANY game was completed
      coins: 0,         // shared reward currency (future)
      account: null,    // RunThe.GG account id once signed in (future sync)
      games: {},        // per-game: { bestTime, plays, lastDay, days:{date:result} }
    };
  }

  function load() {
    try {
      var s = JSON.parse(global.localStorage.getItem(KEY));
      if (s && s.v === 1) { s.games = s.games || {}; return s; }
    } catch (e) {}
    return fresh();
  }
  function save(s) { try { global.localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }

  var listeners = [];
  function emit(s) { listeners.forEach(function (fn) { try { fn(s); } catch (e) {} }); }

  var RTG = {
    KEY: KEY,
    today: today,
    get: function () { return load(); },
    getStreak: function () { return load().streak; },

    gameStats: function (game) {
      var g = load().games[game];
      return g || { bestTime: null, plays: 0, lastDay: null, days: {} };
    },

    playedToday: function (game) {
      var g = load().games[game];
      return !!(g && g.days && g.days[today()]);
    },

    /* Record a completed daily play. Streak bumps at most once per day (first
       game finished that day). Idempotent per game+day: replaying the same day
       won't double-count, but a faster time still updates the best. */
    recordPlay: function (game, result) {
      result = result || {};
      var s = load(), t = today();
      var g = s.games[game] || (s.games[game] = { bestTime: null, plays: 0, lastDay: null, days: {} });
      var firstForGameToday = !(g.days && g.days[t]);

      // combined streak: advance only the first time ANY game is finished today
      if (s.lastDay !== t) {
        s.streak = (s.lastDay === yesterdayOf(t)) ? (s.streak + 1) : 1;
        s.lastDay = t;
        if (s.streak > s.best) s.best = s.streak;
      }

      // per-game stats
      if (firstForGameToday) g.plays += 1;
      g.lastDay = t;
      g.days = g.days || {};
      g.days[t] = Object.assign({ win: result.win !== false }, result);
      if (typeof result.timeSec === "number" && result.timeSec >= 0) {
        g.bestTime = (g.bestTime == null) ? result.timeSec : Math.min(g.bestTime, result.timeSec);
      }

      save(s); emit(s);
      return s;
    },

    /* Reward hook (future): grant shared coins. */
    addCoins: function (n) { var s = load(); s.coins = (s.coins || 0) + (n | 0); save(s); emit(s); return s.coins; },

    onChange: function (fn) { if (typeof fn === "function") listeners.push(fn); },
  };

  global.RTG = RTG;
})(typeof window !== "undefined" ? window : this);
