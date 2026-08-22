/* ideas.js - the board behind /ideas/.
 *
 * THERE IS NO NEW ACCOUNT SYSTEM HERE, and no new session handling either. The page
 * loads /arcade/auth.js, which is already the shared RunThe.GG account module for a page
 * that is not a game, and /arcade/topbanner.js and /arcade/auth-ui.js, which are already
 * the site header and the sign-in sheet. Reading the board needs no account at all.
 *
 * OPTIONAL IN THE SAME WAY board.js IS. If the supabase-js CDN is blocked or the tables
 * are not there yet, the page says so in one line and shows nothing else. It is a board
 * of text; there is no offline mode worth writing for it.
 */
(function () {
  'use strict';

  var SB_URL = 'https://jcrrxqfpdelrmvjuihnm.supabase.co';
  var SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjcnJ4cWZwZGVscm12anVpaG5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3OTY5NjIsImV4cCI6MjA5NjM3Mjk2Mn0.wyjoZpa2yRW-l38-KMGqBvEgTlW9v1KheNye7csWAlM';
  var REST = SB_URL + '/rest/v1/';

  function A() { return window.RTG_AUTH || null; }
  /* The signed-in player's own token, so auth.uid() is them inside the RPCs. The apikey
     header stays the anon key either way, which is what PostgREST wants; only the bearer
     changes. Same shape football/board.js uses and for the same reason. */
  function headers(extra) {
    var tok = (A() && A().token && A().token()) || SB_ANON;
    var h = { apikey: SB_ANON, Authorization: 'Bearer ' + tok,
              'Content-Type': 'application/json' };
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
  }

  /* ---------------------------------------------------------------------------
     THE GAMES, IN ONE LIST. The order is the order of the chips, and it is not
     alphabetical: it is roughly how many people play each one, so the busiest board is
     the shortest reach. `slug` matches ideas_game_ok() in 92_ideas_board.sql; a name here
     that is not in that function is a chip that can be picked and never posted to.
     --------------------------------------------------------------------------- */
  var GAMES = [
    { slug: 'nfl',       name: 'The Perfect Season',      short: 'NFL',       color: '#ff0a3b' },
    { slug: 'cfb',       name: 'Perfect Season: College', short: 'CFB',       color: '#10b981' },
    { slug: 'arcade',    name: 'Run The Arcade',          short: 'Arcade',    color: '#f0913c' },
    { slug: 'golf',      name: 'RunTheTour',              short: 'Golf',      color: '#38bdf8' },
    { slug: 'soccer',    name: 'RunThePitch',             short: 'Soccer',    color: '#22c55e' },
    { slug: 'hoops',     name: 'Run The Floor',           short: 'Hoops',     color: '#f97316' },
    { slug: 'baseball',  name: 'Baseball',                short: 'Baseball',  color: '#f59e0b' },
    { slug: 'wrestling', name: 'Wrestling',               short: 'Wrestling', color: '#e11d48' },
    { slug: 'setlist',   name: 'Segue',                   short: 'Setlist',   color: '#8b5cf6' },
    { slug: 'site',      name: 'Site-wide',               short: 'Site',      color: '#9bb0c6' }
  ];
  var BY_SLUG = {};
  GAMES.forEach(function (g) { BY_SLUG[g.slug] = g; });

  var SORTS = {
    top: { label: 'Top',     order: 'score.desc,created_at.desc' },
    new: { label: 'New',     order: 'created_at.desc' },
    planned: { label: 'Planned', order: 'score.desc,created_at.desc', status: 'planned' },
    mine: { label: 'Mine',   order: 'created_at.desc', mine: true }
  };

  var state = { game: 'all', sort: 'top', rows: null, votes: {}, busy: false, err: null };

  /* ---------------------------------------------------------------------------
     THE GAME COMES FROM THE URL, so a link out of a game lands on that game's board
     rather than on All and a hunt. /ideas/#nfl is the whole contract, which keeps the
     link in each game a plain href with nothing to keep in step.
     --------------------------------------------------------------------------- */
  function gameFromHash() {
    var h = (location.hash || '').replace(/^#/, '').toLowerCase();
    return BY_SLUG[h] ? h : 'all';
  }

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };

  function ago(iso) {
    var t = Date.parse(iso); if (!t) return '';
    var s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 90) return 'just now';
    var m = s / 60; if (m < 60) return Math.round(m) + ' min ago';
    var h = m / 60; if (h < 24) return Math.round(h) + (Math.round(h) === 1 ? ' hour ago' : ' hours ago');
    var d = h / 24; if (d < 7) return Math.round(d) + (Math.round(d) === 1 ? ' day ago' : ' days ago');
    var w = d / 7; if (w < 5) return Math.round(w) + (Math.round(w) === 1 ? ' week ago' : ' weeks ago');
    return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  /* ---------------------------------------------------------------------------
     LOADING
     --------------------------------------------------------------------------- */
  function load() {
    state.busy = true; state.err = null; paint();
    var s = SORTS[state.sort] || SORTS.top;
    var q = REST + 'ideas_public?select=*&order=' + encodeURIComponent(s.order) + '&limit=100';
    if (state.game !== 'all') q += '&game=eq.' + encodeURIComponent(state.game);
    if (s.status) q += '&status=eq.' + encodeURIComponent(s.status);
    var me = A() && A().state && A().state().userId;
    if (s.mine) {
      /* "Mine" with nobody signed in is an empty list, not everybody's list. Asked for
         explicitly rather than left to the filter, because a missing user id would
         silently drop the clause and show the whole board under the word Mine. */
      if (!me) { state.rows = []; state.busy = false; paint(); return; }
      q += '&user_id=eq.' + encodeURIComponent(me);
    }
    fetch(q, { headers: headers() })
      .then(function (r) {
        if (!r.ok) return r.json().catch(function () { return null; })
          .then(function (b) { throw new Error((b && b.message) || ('HTTP ' + r.status)); });
        return r.json();
      })
      .then(function (rows) {
        state.rows = rows || []; state.busy = false;
        paint();
        loadMyVotes();
      })
      .catch(function (e) {
        state.busy = false;
        state.err = /Failed to fetch|NetworkError/i.test(e.message)
          ? 'The board is not reachable right now.'
          : (/ideas_public/.test(e.message) ? 'The ideas board is not set up on this project yet.'
                                            : e.message);
        paint();
      });
  }

  /* WHICH ARROW TO LIGHT. A second request rather than a join, because the view is world
     readable and this is not: idea_votes only ever returns your own rows, and folding a
     per-viewer answer into a shared read is how a cache ends up serving one person's
     votes to everybody. */
  function loadMyVotes() {
    var me = A() && A().state && A().state().userId;
    if (!me || !state.rows || !state.rows.length) return;
    var ids = state.rows.map(function (r) { return r.id; }).join(',');
    fetch(REST + 'idea_votes?select=idea_id,dir&idea_id=in.(' + ids + ')', { headers: headers() })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        state.votes = {};
        (rows || []).forEach(function (v) { state.votes[v.idea_id] = v.dir; });
        paint();
      })
      .catch(function () {});
  }

  /* ---------------------------------------------------------------------------
     VOTING. Optimistic, because a vote that takes a round trip to light up feels
     broken, and reconciled from what the server actually returns.
     --------------------------------------------------------------------------- */
  function vote(id, dir) {
    if (!(A() && A().state && A().state().signedIn)) { openSignIn(); return; }
    var row = null;
    for (var i = 0; i < state.rows.length; i++) if (state.rows[i].id === id) row = state.rows[i];
    if (!row) return;
    var was = state.votes[id] || 0;
    /* Clicking the arrow you already picked takes the vote back, which is what every
       board with arrows does and none of them say. The server takes 0 as a real
       argument, so this is one call either way rather than a delete and an insert. */
    var next = (was === dir) ? 0 : dir;
    state.votes[id] = next;
    row.score = (row.score || 0) - was + next;
    paint();
    fetch(REST + 'rpc/ideas_vote', {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ p_idea: id, p_dir: next })
    })
      .then(function (r) {
        if (!r.ok) throw new Error('refused');
        return r.json();
      })
      .then(function (score) {
        if (typeof score === 'number') { row.score = score; paint(); }
      })
      .catch(function () {
        /* Put it back exactly as it was. A vote that looked like it landed and did not is
           worse than one that visibly failed. */
        state.votes[id] = was;
        row.score = (row.score || 0) - next + was;
        paint();
      });
  }

  function openSignIn() {
    if (window.RTGAuthUI && RTGAuthUI.open) RTGAuthUI.open('signin');
  }
  function openAccount() {
    var st = A() && A().state ? A().state() : null;
    if (window.RTGAuthUI && RTGAuthUI.open) RTGAuthUI.open(st && st.signedIn ? 'account' : 'signin');
  }

  var PERSON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/>' +
               '<path d="M4 21a8 8 0 0 1 16 0"/></svg>';

  /* THE SAME FOUR STATES THE ARCADE HEADER HAS, and for the same reasons written up there.
     A signed-in account with no username yet is ordinary, and telling that person to sign
     in sends them to sign in again. And nothing says "Sign in" until auth has actually
     ANSWERED: `resolved` is the flag for that, because `ready` is true the instant the
     client is constructed and long before getSession returns. */
  function paintAccount() {
    var b = document.getElementById('ic-acct');
    if (!b) return;
    var st = A() && A().state ? A().state() : null;
    if (st && st.signedIn && st.name) {
      b.innerHTML = '<span>' + esc(st.name) + '</span>';
      b.setAttribute('aria-label', 'Signed in as ' + st.name);
    } else if (st && st.signedIn) {
      b.innerHTML = PERSON + '<span>Account</span>';
      b.setAttribute('aria-label', 'Your account');
    } else if (st && st.resolved) {
      b.innerHTML = PERSON + '<span>Sign in</span>';
      b.setAttribute('aria-label', 'Sign in');
    } else {
      b.innerHTML = PERSON;
      b.setAttribute('aria-label', 'Your account');
    }
  }

  /* ---------------------------------------------------------------------------
     POSTING
     --------------------------------------------------------------------------- */
  function submit(game, title, body, done) {
    fetch(REST + 'rpc/ideas_post', {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ p_game: game, p_title: title, p_body: body })
    })
      .then(function (r) {
        return r.json().catch(function () { return null; }).then(function (b) {
          if (!r.ok) throw new Error((b && b.message) || 'That did not go through.');
          return b;
        });
      })
      .then(function () { done(null); })
      .catch(function (e) { done(e.message || 'That did not go through.'); });
  }

  /* ---------------------------------------------------------------------------
     PAINTING
     --------------------------------------------------------------------------- */
  var UP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15 L12 8 L18 15"/></svg>';
  var DN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9 L12 16 L18 9"/></svg>';

  function chips() {
    var out = '<button class="ic-chip' + (state.game === 'all' ? ' on' : '') +
              '" data-game="all">All ideas</button>';
    GAMES.forEach(function (g) {
      out += '<button class="ic-chip' + (state.game === g.slug ? ' on' : '') +
             '" data-game="' + g.slug + '"><span class="sw" style="background:' + g.color +
             '"></span>' + esc(g.name) + '</button>';
    });
    return out;
  }

  function card(r) {
    var g = BY_SLUG[r.game];
    var mine = state.votes[r.id] || 0;
    var tags = '';
    /* The game tag only in the All view: in a game's own board every row is that game and
       a tag on all of them says nothing. */
    if (state.game === 'all' && g) {
      tags += '<span class="ic-tag" style="color:' + g.color + ';border-color:' + g.color +
              '55;background:' + g.color + '14">' + esc(g.short) + '</span>';
    }
    if (r.status === 'planned') tags += '<span class="ic-tag planned">Planned</span>';
    if (r.status === 'shipped') tags += '<span class="ic-tag shipped">Shipped</span>';
    if (r.status === 'declined') tags += '<span class="ic-tag declined">Not planned</span>';

    var who = esc(r.author_name || 'Someone');
    /* Stored initials win, the same way they do on every leaderboard: they are already
       validated to one or two of A-Z0-9 by the database. The fallback is the first two
       letters of the name, which is what the games do when a profile has none. */
    var init = esc((r.author_initials || who.slice(0, 2)).toUpperCase());
    var av = '<span class="ic-pfp">' + init + '</span>';

    return '<div class="ic-card">' +
      '<div class="ic-vote">' +
        '<button class="ic-up' + (mine === 1 ? ' on' : '') + '" data-vote="1" data-id="' + r.id +
          '" aria-label="Upvote">' + UP + '</button>' +
        '<span class="ic-score' + ((r.score || 0) >= 25 ? ' hot' : '') + '">' + (r.score || 0) + '</span>' +
        '<button class="ic-dn' + (mine === -1 ? ' on' : '') + '" data-vote="-1" data-id="' + r.id +
          '" aria-label="Downvote">' + DN + '</button>' +
      '</div>' +
      '<div class="ic-body">' +
        '<div class="ic-titlerow"><span class="ic-title">' + esc(r.title) + '</span>' + tags + '</div>' +
        (r.body ? '<p class="ic-desc">' + esc(r.body) + '</p>' : '') +
        '<div class="ic-meta">' + av + '<span class="ic-who">' + who + '</span>' +
          '<span class="ic-dot">&middot;</span><span>' + esc(ago(r.created_at)) + '</span>' +
          '<span class="ic-dot">&middot;</span><span>' + votes(r) + '</span>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function votes(r) {
    var n = (r.up_count || 0) + (r.down_count || 0);
    return n + (n === 1 ? ' vote' : ' votes');
  }

  function paint() {
    var host = document.getElementById('ic-list');
    var chipHost = document.getElementById('ic-chips');
    var sortHost = document.getElementById('ic-sorts');
    if (!host) return;

    if (chipHost) chipHost.innerHTML = chips();
    if (sortHost) {
      sortHost.innerHTML = Object.keys(SORTS).map(function (k) {
        return '<button class="ic-sort' + (state.sort === k ? ' on' : '') +
               '" data-sort="' + k + '">' + SORTS[k].label + '</button>';
      }).join('');
    }

    var st = A() && A().state ? A().state() : null;
    paintAccount();
    var prompt = document.getElementById('ic-signprompt');
    /* Shown only once auth has ANSWERED. Painting "sign in to vote" at a signed-in player
       for the half second before getSession returns is the same flicker the Arcade header
       had, and auth.js exposes `resolved` now precisely so this does not repeat it. */
    if (prompt) prompt.hidden = !(st && st.resolved && !st.signedIn);

    if (state.err) {
      host.innerHTML = '<p class="ic-empty">' + esc(state.err) + '</p>';
      return;
    }
    if (state.busy && !state.rows) {
      host.innerHTML = '<p class="ic-empty">Loading ideas...</p>';
      return;
    }
    if (!state.rows || !state.rows.length) {
      host.innerHTML = '<p class="ic-empty">' + (state.sort === 'mine'
        ? 'You have not posted an idea yet.'
        : 'Nothing here yet. Be the first to suggest something.') + '</p>';
      return;
    }
    host.innerHTML = state.rows.map(card).join('');
  }

  /* ---------------------------------------------------------------------------
     THE FORM
     --------------------------------------------------------------------------- */
  function openForm() {
    var st = A() && A().state ? A().state() : null;
    if (!(st && st.signedIn)) { openSignIn(); return; }
    var sheet = document.getElementById('ic-sheet');
    var sel = document.getElementById('ic-f-game');
    sel.innerHTML = GAMES.map(function (g) {
      return '<option value="' + g.slug + '">' + esc(g.name) + '</option>';
    }).join('');
    /* Pre-picked to the board you are looking at, which is nearly always the one you
       mean. On All it stays on the first entry rather than guessing. */
    if (state.game !== 'all') sel.value = state.game;
    document.getElementById('ic-f-title').value = '';
    document.getElementById('ic-f-body').value = '';
    document.getElementById('ic-f-err').textContent = '';
    sheet.hidden = false;
    setTimeout(function () { document.getElementById('ic-f-title').focus(); }, 30);
  }
  function closeForm() { document.getElementById('ic-sheet').hidden = true; }

  /* ---------------------------------------------------------------------------
     WIRING
     --------------------------------------------------------------------------- */
  function boot() {
    state.game = gameFromHash();

    /* ONE DELEGATED HANDLER for a list that is rebuilt on every paint. Binding per card
       would leak a listener a repaint, and this list repaints on every vote. */
    document.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-game],[data-sort],[data-vote]') : null;
      if (!t) return;
      if (t.hasAttribute('data-game')) {
        state.game = t.getAttribute('data-game');
        /* The hash follows the chip, so the board you are looking at is the board you
           can send somebody. replaceState rather than a hash write, which would scroll. */
        try {
          history.replaceState(null, '', state.game === 'all' ? location.pathname
                                                              : location.pathname + '#' + state.game);
        } catch (err) {}
        load(); return;
      }
      if (t.hasAttribute('data-sort')) { state.sort = t.getAttribute('data-sort'); load(); return; }
      if (t.hasAttribute('data-vote')) {
        vote(+t.getAttribute('data-id'), +t.getAttribute('data-vote'));
      }
    });

    window.addEventListener('hashchange', function () {
      var g = gameFromHash();
      if (g !== state.game) { state.game = g; load(); }
    });

    document.getElementById('ic-new').addEventListener('click', openForm);
    document.getElementById('ic-f-x').addEventListener('click', closeForm);
    document.getElementById('ic-f-cancel').addEventListener('click', closeForm);
    document.getElementById('ic-signin').addEventListener('click', openSignIn);
    document.getElementById('ic-acct').addEventListener('click', openAccount);

    document.getElementById('ic-f-post').addEventListener('click', function () {
      var btn = this;
      var game = document.getElementById('ic-f-game').value;
      var title = document.getElementById('ic-f-title').value.trim();
      var body = document.getElementById('ic-f-body').value.trim();
      var err = document.getElementById('ic-f-err');
      if (title.length < 4) { err.textContent = 'Give the idea a title.'; return; }
      btn.disabled = true; err.textContent = '';
      submit(game, title, body, function (msg) {
        btn.disabled = false;
        if (msg) { err.textContent = msg; return; }
        closeForm();
        /* Land on the board the idea went to, sorted New, so the thing just written is
           the first thing on screen. Dropping somebody back on Top after they post means
           hunting for their own idea to check it worked. */
        state.game = game; state.sort = 'new';
        try {
          history.replaceState(null, '', location.pathname + '#' + game);
        } catch (e) {}
        load();
      });
    });

    /* Repaint when the account resolves or changes: the sign-in prompt, the lit arrows
       and the Mine tab all depend on it. */
    if (A() && A().onChange) A().onChange(function () { paint(); loadMyVotes(); });

    load();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})();
