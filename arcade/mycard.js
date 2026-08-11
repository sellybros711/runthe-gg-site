/* mycard.js — "Your Arcade Card": the player's personal dashboard.
 *
 * Opens from the top banner's tokens/Unlimited chip on any arcade page. It's a
 * designed membership-card face plus the stats that used to live on the hub's
 * left rail: current + best streak, the next-drop countdown, today's ticket
 * progress, lifetime achievements, most-played games, and a button into the
 * Vault (archive). Non-members get an upgrade CTA; guests get a sign-in nudge.
 *
 * Self-contained: reads localStorage the same way the hub does, so it works on
 * every page without server calls. window.RTGMyCard = { open, close }.
 */
(function () {
  'use strict';
  var LS = window.localStorage;
  function g(k, d) { try { return LS.getItem(k) || d; } catch (e) { return d; } }
  function pad(n) { return String(n).padStart(2, '0'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function T() { return window.RTGTokens || null; }
  function A() { return window.RTG_AUTH || null; }

  // Our own icon set (no stock emoji): monochrome, square-cut, currentColor —
  // same family as RTGIcons. Sized by their container.
  var ICN = {
    flame: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.5 1.6s.8 2.3.8 4.2c0 1.8-1.2 3.3-3 3.3S8.2 7.6 8.2 5.8c0-.4 0-.8.1-1.2C5.6 6.5 4 9.4 4 12.5 4 17.2 7.8 21 12.5 21S21 17.2 21 12.5c0-4.8-3.6-8.8-7.5-10.9z"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2l-6.1 3.4 1.4-6.8L2.2 9.1l6.9-.8z"/></svg>',
    target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/></svg>',
    pad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="7" width="20" height="10" rx="5"/><path d="M6 12h3M7.5 10.5v3" stroke-linecap="round"/><circle cx="16" cy="11" r="1.1" fill="currentColor" stroke="none"/><circle cx="18.5" cy="13.5" r="1.1" fill="currentColor" stroke="none"/></svg>',
    ticket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-4z"/><path d="M15 6v12" stroke-dasharray="2 2"/></svg>'
  };

  function todayStr() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  // ---- stats, mirroring the hub's localStorage reads ----
  var GAME_META = {
    table:      { name: 'Number Game',   href: '/arcade/table/',      tone: 'var(--goldT,#F2B632)' },
    match:      { name: 'Daily Match',   href: '/arcade/match/',      tone: 'var(--blueT,#5C8CFF)' },
    career:     { name: 'Career Path',   href: '/arcade/career/',     tone: 'var(--greenT,#48D17A)' },
    oddone:     { name: 'Odd One Out',   href: '/arcade/oddone/',     tone: 'var(--violetT,#B79BF6)' },
    rankit:     { name: 'Rank It',       href: '/arcade/rankit/',     tone: 'var(--pinkT,#F778AE)' },
    almamater:  { name: 'Alma Mater',    href: '/arcade/almamater/',  tone: 'var(--goldT,#F2B632)' },
    guess:      { name: 'Guess the Player', href: '/arcade/guess/',   tone: 'var(--coralT,#F06A5F)' },
    crossword:  { name: 'Daily Crossword', href: '/arcade/crossword/', tone: 'var(--newsT,#9CADC0)' },
    wordsearch: { name: 'Word Search',   href: '/arcade/wordsearch/', tone: 'var(--tealT,#37C5D5)' }
  };

  function stats() {
    var cur = parseInt(g('grid_match_streak', '0'), 10) || 0;
    var best = parseInt(g('grid_best_streak', '0'), 10) || 0;
    function j(k) { try { return JSON.parse(g(k, '{}')) || {}; } catch (e) { return {}; } }
    var cw = j('rtg:cw:v1'), ws = j('rtg:ws:v1'), gs = j('rtg:guess:v1'), ts = j('rtg:table:v1'),
        os = j('rtg:oddone:v1'), rs = j('rtg:career:v1'), ks = j('rtg:rankit:v2'), as = j('rtg:almamater:v1');
    cur = Math.max(cur, cw.streak | 0, ws.streak | 0, gs.streak | 0, ts.streak | 0, os.streak | 0, rs.streak | 0, ks.streak | 0, as.streak | 0);
    best = Math.max(best, cur, cw.bestStreak | 0, gs.bestStreak | 0);

    var t = todayStr();
    var mr = null; try { mr = JSON.parse(g('grid_match_result_' + t, 'null')); } catch (e) {}
    var done = {
      table: ts.lastDone === t, match: !!mr, career: rs.lastDone === t, oddone: os.lastDone === t,
      rankit: ks.lastDone === t, almamater: as.lastDone === t, guess: gs.lastDone === t,
      crossword: cw.lastDone === t, wordsearch: ws.lastDone === t
    };
    var punched = 0; for (var k in done) if (done.hasOwnProperty(k) && done[k]) punched++;

    var life = (T() && T().lifetime) ? T().lifetime() : { plays: {}, perfect: 0 };
    var totalPlays = 0, most = null, mostN = 0;
    for (var gk in life.plays) if (life.plays.hasOwnProperty(gk)) {
      var n = life.plays[gk] || 0; totalPlays += n;
      if (n > mostN) { mostN = n; most = gk; }
    }

    // best single runs from the run-style games (Number / Career / Odd One / Alma)
    function bestRun(sv) { return Math.max(sv.best | 0, (sv.last && sv.last.run) | 0); }
    var topRun = Math.max(bestRun(ts), bestRun(rs), bestRun(os), bestRun(as));

    var vault = 0;
    try {
      var launch = (window.RTGArchive && RTGArchive.LAUNCH) || '2026-07-22';
      vault = Math.max(0, Math.floor((Date.now() - Date.parse(launch)) / 864e5));
    } catch (e) {}

    return { cur: cur, best: best, punched: punched, perfect: life.perfect | 0,
      totalPlays: totalPlays, most: most, mostPlays: life.plays || {}, topRun: topRun, vault: vault };
  }

  function tierInfo() {
    var t = T();
    var isCard = !!(t && t.hasCard && t.hasCard());
    var signed = !!(t && t.signedIn && t.signedIn());
    var st = (A() && A().state) ? A().state() : null;
    var name = (st && st.name) ? st.name : (signed ? 'Player' : 'Guest');
    return { isCard: isCard, signed: signed, name: name };
  }

  function flameTier(cur) {
    return cur <= 0 ? 'cold' : cur <= 2 ? 'warm' : cur <= 6 ? 'hot' : cur < 30 ? 'blaze' : 'icon';
  }

  // ---- styles ----
  function injectStyles() {
    if (document.getElementById('rtgmcard-style')) return;
    var s = document.createElement('style'); s.id = 'rtgmcard-style';
    s.textContent = [
      '.rtgmc-scrim{position:fixed;inset:0;z-index:9998;display:flex;align-items:flex-start;justify-content:center;padding:max(20px,env(safe-area-inset-top)) 16px 24px;background:rgba(3,9,18,.68);backdrop-filter:blur(5px);overflow:auto;}',
      '.rtgmc-scrim[hidden]{display:none;}',
      '.rtgmc-sheet{width:100%;max-width:400px;margin:auto 0;background:var(--card,#10233A);color:var(--ink,#F4F7FB);border:1px solid var(--line2,#22304a);border-radius:20px;padding:16px 16px 18px;position:relative;box-shadow:0 34px 90px -22px rgba(0,0,0,.75);}',
      '.rtgmc-x{position:absolute;top:12px;right:12px;z-index:3;width:34px;height:34px;border-radius:50%;border:1px solid var(--line2,#22304a);background:var(--card2,#162B44);color:var(--ink,#F4F7FB);font-size:14px;cursor:pointer;}',
      // card face
      '.rtgmc-face{position:relative;overflow:hidden;border-radius:16px;padding:16px 16px 15px;',
        'background:linear-gradient(135deg,#12203a 0%,#1c2c4d 46%,#241a3f 100%);border:1px solid color-mix(in srgb,var(--gold,#F2B632) 34%,var(--line2,#22304a));}',
      '.rtgmc-face.card{border-color:color-mix(in srgb,var(--gold,#F2B632) 62%,transparent);box-shadow:0 0 0 1px color-mix(in srgb,var(--gold,#F2B632) 22%,transparent) inset;}',
      // holographic sheen
      '.rtgmc-face::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:.5;background:linear-gradient(115deg,transparent 30%,rgba(120,200,255,.10) 45%,rgba(255,180,90,.12) 55%,transparent 70%);}',
      '.rtgmc-brand{display:flex;align-items:center;gap:8px;margin-bottom:12px;position:relative;z-index:1;}',
      '.rtgmc-brand img{width:26px;height:26px;border-radius:7px;display:block;}',
      '.rtgmc-brand .bt{font-family:var(--hero,inherit);font-weight:400;letter-spacing:.14em;text-transform:uppercase;font-size:12px;color:color-mix(in srgb,var(--gold,#F2B632) 88%,#fff);}',
      '.rtgmc-brand .bt .sub{display:block;font-family:var(--f,inherit);font-weight:800;letter-spacing:.06em;font-size:9px;color:var(--mut,#A9B8CB);margin-top:1px;}',
      '.rtgmc-who{display:flex;align-items:center;gap:12px;position:relative;z-index:1;}',
      '.rtgmc-av{flex:0 0 auto;width:46px;height:46px;border-radius:12px;display:grid;place-items:center;font-family:var(--hero,inherit);font-weight:400;font-size:24px;color:#fff;background:linear-gradient(135deg,var(--coral,#F06A5F),#F0913C);}',
      '.rtgmc-who .nm{min-width:0;line-height:1.15;}',
      '.rtgmc-who .nm b{display:block;font-weight:900;font-style:italic;font-size:20px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.rtgmc-who .nm .badge{display:inline-flex;align-items:center;gap:5px;margin-top:4px;font-size:9.5px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;padding:3px 9px;border-radius:999px;}',
      '.rtgmc-who .nm .badge.card{color:#20160a;background:linear-gradient(90deg,var(--gold,#F2B632),#F0913C);}',
      '.rtgmc-who .nm .badge.free{color:var(--ink,#F4F7FB);background:color-mix(in srgb,#fff 12%,transparent);border:1px solid var(--line2,#22304a);}',
      // streak strip inside the face
      '.rtgmc-streak{display:flex;align-items:center;gap:14px;margin-top:14px;position:relative;z-index:1;}',
      '.rtgmc-flame{flex:0 0 auto;width:44px;height:44px;border-radius:12px;display:grid;place-items:center;color:var(--toneT,var(--coralT,#F06A5F));',
        'background:color-mix(in srgb,var(--tone,var(--coral,#F06A5F)) 18%,transparent);border:1px solid color-mix(in srgb,var(--tone,var(--coral,#F06A5F)) 44%,transparent);}',
      '.rtgmc-streak[data-tier="cold"]{--tone:#7C8DA3;--toneT:#A9B8CB;} .rtgmc-streak[data-tier="cold"] .rtgmc-flame{border-style:dashed;}',
      '.rtgmc-streak[data-tier="warm"]{--tone:#F06A5F;--toneT:#F06A5F;}',
      '.rtgmc-streak[data-tier="hot"]{--tone:#F2B632;--toneT:#F2B632;}',
      '.rtgmc-streak[data-tier="blaze"]{--tone:#F0384E;--toneT:#F0653A;}',
      '.rtgmc-streak[data-tier="icon"]{--tone:#F2B632;--toneT:#F2B632;} .rtgmc-streak[data-tier="icon"] .rtgmc-flame{box-shadow:0 0 18px -3px color-mix(in srgb,var(--gold,#F2B632) 60%,transparent);}',
      '.rtgmc-streak .big{line-height:.9;} .rtgmc-streak .big .n{font-family:var(--hero,inherit);font-weight:400;font-size:38px;color:#fff;font-variant-numeric:tabular-nums;}',
      '.rtgmc-streak .big .c{display:block;font-size:9px;font-weight:900;letter-spacing:.13em;text-transform:uppercase;color:var(--toneT,#F06A5F);margin-top:3px;}',
      '.rtgmc-streak .best{margin-left:auto;text-align:right;}',
      '.rtgmc-streak .best .n{font-family:var(--hero,inherit);font-weight:400;font-size:24px;color:var(--mut,#A9B8CB);}',
      '.rtgmc-streak .best .c{display:block;font-size:8.5px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:var(--dim,#7C8DA3);margin-top:2px;}',
      // next drop row + ticket progress
      '.rtgmc-drop{display:flex;align-items:center;gap:10px;margin-top:12px;padding:11px 13px;border-radius:12px;background:var(--card2,#162B44);border:1px solid var(--line,rgba(244,247,251,.08));}',
      '.rtgmc-drop .lbl{font-size:9.5px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:var(--mut,#A9B8CB);}',
      '.rtgmc-drop .sub{display:block;font-size:11px;font-weight:700;color:var(--dim,#7C8DA3);margin-top:2px;}',
      '.rtgmc-drop .t{margin-left:auto;font-family:var(--hero,inherit);font-weight:400;font-size:22px;letter-spacing:.03em;color:var(--tealT,#37C5D5);font-variant-numeric:tabular-nums;}',
      // section heads
      '.rtgmc-h{font-size:10px;font-weight:900;letter-spacing:.13em;text-transform:uppercase;color:var(--mut,#A9B8CB);margin:16px 2px 9px;}',
      // achievements grid
      '.rtgmc-ach{display:grid;grid-template-columns:1fr 1fr;gap:9px;}',
      '.rtgmc-ach .a{display:flex;align-items:center;gap:9px;padding:10px 11px;border-radius:11px;background:var(--card2,#162B44);border:1px solid var(--line,rgba(244,247,251,.08));}',
      '.rtgmc-ach .a .ic{width:20px;height:20px;flex:0 0 auto;display:inline-flex;}',
      '.rtgmc-ach .a .ic svg{width:100%;height:100%;display:block;}',
      '.rtgmc-who .nm .badge svg{width:12px;height:12px;display:block;}',
      '.rtgmc-btn.vault .tkic{display:inline-flex;width:18px;height:18px;color:var(--goldT,#F2B632);}',
      '.rtgmc-btn.vault .tkic svg{width:100%;height:100%;}',
      '.rtgmc-ach .a .v{font-family:var(--hero,inherit);font-weight:400;font-size:19px;color:var(--ink,#F4F7FB);line-height:1;}',
      '.rtgmc-ach .a .k{display:block;font-size:9.5px;font-weight:800;letter-spacing:.04em;color:var(--mut,#A9B8CB);margin-top:2px;}',
      // most played bars
      '.rtgmc-mp{display:flex;flex-direction:column;gap:7px;}',
      '.rtgmc-mp .row{display:flex;align-items:center;gap:9px;font-size:12px;font-weight:800;color:var(--ink,#F4F7FB);}',
      '.rtgmc-mp .row .lab{flex:0 0 96px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.rtgmc-mp .row .bar{flex:1;height:8px;border-radius:999px;background:var(--card2,#162B44);overflow:hidden;}',
      '.rtgmc-mp .row .bar i{display:block;height:100%;border-radius:999px;background:var(--tc,#F06A5F);}',
      '.rtgmc-mp .row .ct{flex:0 0 auto;font-variant-numeric:tabular-nums;color:var(--mut,#A9B8CB);font-weight:900;font-size:11px;min-width:20px;text-align:right;}',
      '.rtgmc-empty{font-size:12.5px;color:var(--mut,#A9B8CB);line-height:1.5;padding:2px 2px 4px;}',
      // action buttons
      '.rtgmc-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;box-sizing:border-box;margin-top:10px;min-height:48px;padding:12px 14px;border-radius:12px;font-family:inherit;font-weight:900;font-size:14px;cursor:pointer;border:0;text-decoration:none;}',
      '.rtgmc-btn.vault{color:var(--ink,#F4F7FB);background:var(--card2,#162B44);border:1.5px solid var(--line2,#22304a);}',
      '.rtgmc-btn.vault:hover{border-color:var(--gold,#F2B632);} .rtgmc-btn.vault b{color:var(--goldT,#F2B632);}',
      '.rtgmc-btn.go{color:#20160a;background:linear-gradient(90deg,var(--gold,#F2B632),#F0913C);box-shadow:0 10px 22px -12px rgba(240,145,60,.8);}',
      '.rtgmc-btn.go:hover{filter:brightness(1.05);}',
      '.rtgmc-btn.signin{color:#fff;background:linear-gradient(90deg,var(--coral,#F06A5F),#F0913C);}',
      '.rtgmc-btn small{font-weight:800;font-size:10.5px;letter-spacing:.04em;opacity:.85;}',
      '.rtgmc-sub{display:block;width:100%;margin-top:9px;background:none;border:0;color:var(--mut,#A9B8CB);font:800 12px var(--f,inherit);cursor:pointer;text-decoration:underline;text-underline-offset:3px;text-align:center;}',
      '@media (max-width:420px){ .rtgmc-streak .big .n{font-size:34px;} }'
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  }

  var scrim = null, cdTimer = null;

  function build() {
    if (scrim) return;
    injectStyles();
    scrim = document.createElement('div');
    scrim.className = 'rtgmc-scrim'; scrim.id = 'rtgmcScrim'; scrim.hidden = true;
    scrim.innerHTML = '<div class="rtgmc-sheet" role="dialog" aria-modal="true" aria-label="Your Arcade Card">' +
      '<button class="rtgmc-x" id="rtgmcX" type="button" aria-label="Close">✕</button>' +
      '<div id="rtgmcBody"></div></div>';
    document.body.appendChild(scrim);
    document.getElementById('rtgmcX').onclick = close;
    scrim.addEventListener('click', function (e) { if (e.target === scrim) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && scrim && !scrim.hidden) close(); });
  }

  function tickCd() {
    var el = document.getElementById('rtgmcCd'); if (!el) return;
    var n = new Date();
    var ms = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 0, 0) - n;
    var s = Math.max(0, Math.floor(ms / 1000));
    el.textContent = Math.floor(s / 3600) + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60);
  }

  function render() {
    var body = document.getElementById('rtgmcBody'); if (!body) return;
    var s = stats(), ti = tierInfo();
    var tier = flameTier(s.cur);
    var initial = esc((ti.name.charAt(0) || 'P').toUpperCase());
    var ICON = 'https://runthe.gg/arcade/assets/arcade-icon.png?v=2';

    // achievements: only genuinely-earned tiles (plus best streak, always shown)
    var ach = [];
    ach.push([ICN.flame, s.best, s.best === 1 ? 'Best streak (day)' : 'Best streak (days)', 'var(--goldT,#F2B632)']);
    if (s.perfect > 0) ach.push([ICN.star, s.perfect, s.perfect === 1 ? 'Perfect day' : 'Perfect days', 'var(--goldT,#F2B632)']);
    if (s.topRun > 0) ach.push([ICN.target, s.topRun, 'Best run', 'var(--coralT,#F06A5F)']);
    ach.push([ICN.pad, s.totalPlays, s.totalPlays === 1 ? 'Game played' : 'Games played', 'var(--tealT,#37C5D5)']);

    // most played (top 4 by lifetime plays)
    var mp = [];
    for (var k in s.mostPlays) if (s.mostPlays.hasOwnProperty(k) && GAME_META[k]) mp.push([k, s.mostPlays[k] || 0]);
    mp.sort(function (a, b) { return b[1] - a[1]; });
    mp = mp.filter(function (x) { return x[1] > 0; }).slice(0, 4);
    var maxN = mp.length ? mp[0][1] : 1;

    var out = '<div class="rtgmc-face' + (ti.isCard ? ' card' : '') + '">' +
      '<div class="rtgmc-brand"><img src="' + ICON + '" alt=""><span class="bt">Arcade Card<span class="sub">runthe.gg/arcade</span></span></div>' +
      '<div class="rtgmc-who"><div class="rtgmc-av">' + initial + '</div>' +
        '<div class="nm"><b>' + esc(ti.name) + '</b>' +
          (ti.isCard ? '<span class="badge card">' + ICN.ticket + 'Member · Unlimited</span>'
            : ti.signed ? '<span class="badge free">Free account</span>'
            : '<span class="badge free">Guest</span>') +
        '</div></div>' +
      '<div class="rtgmc-streak" data-tier="' + tier + '">' +
        '<span class="rtgmc-flame"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.5 1.6s.8 2.3.8 4.2c0 1.8-1.2 3.3-3 3.3S8.2 7.6 8.2 5.8c0-.4 0-.8.1-1.2C5.6 6.5 4 9.4 4 12.5 4 17.2 7.8 21 12.5 21S21 17.2 21 12.5c0-4.8-3.6-8.8-7.5-10.9z"/></svg></span>' +
        '<span class="big"><span class="n">' + s.cur + '</span><span class="c">Day streak</span></span>' +
        '<span class="best"><span class="n">' + s.best + '</span><span class="c">Best</span></span>' +
      '</div></div>';

    // next drop + today's punches
    out += '<div class="rtgmc-drop">' +
      '<div><span class="lbl">Next drop</span><span class="sub">' + s.punched + ' / 9 punched today</span></div>' +
      '<span class="t" id="rtgmcCd">--:--:--</span></div>';

    out += '<div class="rtgmc-h">Achievements</div><div class="rtgmc-ach">' +
      ach.map(function (a) { return '<div class="a"><span class="ic" style="color:' + a[3] + '">' + a[0] + '</span><div><span class="v">' + a[1] + '</span><span class="k">' + esc(a[2]) + '</span></div></div>'; }).join('') +
      '</div>';

    out += '<div class="rtgmc-h">Most played</div>';
    if (mp.length) {
      out += '<div class="rtgmc-mp">' + mp.map(function (x) {
        var m = GAME_META[x[0]]; var pct = Math.max(8, Math.round(x[1] / maxN * 100));
        return '<a class="row" href="' + m.href + '" style="color:inherit"><span class="lab">' + esc(m.name) + '</span>' +
          '<span class="bar"><i style="width:' + pct + '%;background:' + m.tone + '"></i></span>' +
          '<span class="ct">' + x[1] + '</span></a>';
      }).join('') + '</div>';
    } else {
      out += '<div class="rtgmc-empty">Play a few games and your favorites show up here.</div>';
    }

    // actions
    out += '<a class="rtgmc-btn vault" href="/arcade/archive/"><span class="tkic">' + ICN.ticket + '</span><b>Enter your Vault · ' + s.vault + ' days available</b></a>';
    if (ti.isCard) {
      out += '<button class="rtgmc-sub" type="button" id="rtgmcManage">Manage subscription</button>';
    } else if (ti.signed) {
      out += '<button class="rtgmc-btn go" type="button" id="rtgmcBuy">Get the Arcade Card<small>Unlimited plays · every past day</small></button>';
    } else {
      out += '<button class="rtgmc-btn signin" type="button" id="rtgmcSignup">Create free account<small>3 plays a day · save your streak</small></button>' +
        '<button class="rtgmc-sub" type="button" id="rtgmcSignin">Already have an account? Sign in</button>';
    }

    body.innerHTML = out;

    var buy = document.getElementById('rtgmcBuy');
    if (buy) buy.onclick = function () { close(); if (window.RTGCard && RTGCard.paywall) RTGCard.paywall({ reason: 'upsell' }); };
    var mng = document.getElementById('rtgmcManage');
    if (mng) mng.onclick = function () { close(); if (window.RTGCard && RTGCard.paywall) RTGCard.paywall({}); };
    var su = document.getElementById('rtgmcSignup');
    if (su) su.onclick = function () { close(); if (window.RTGAuthUI) RTGAuthUI.open('signup'); };
    var si = document.getElementById('rtgmcSignin');
    if (si) si.onclick = function () { close(); if (window.RTGAuthUI) RTGAuthUI.open('signin'); };

    tickCd();
  }

  function open() {
    build();
    render();
    scrim.hidden = false;
    if (cdTimer) clearInterval(cdTimer);
    cdTimer = setInterval(tickCd, 1000);
  }
  function close() {
    if (scrim) scrim.hidden = true;
    if (cdTimer) { clearInterval(cdTimer); cdTimer = null; }
  }

  window.RTGMyCard = { open: open, close: close };
})();
