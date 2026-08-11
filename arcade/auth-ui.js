/*
 * auth-ui.js - the one sign-in surface for Run The Arcade.
 *
 * Include this (after supabase-js and auth.js) on any arcade page and it self-mounts:
 *   - injects a single account modal (sign in / create account / pick username / manage)
 *   - drops an account button into the page's .topbar (or wires an existing .mProf)
 *   - wires anything with [data-rtg-signin], and legacy "Sign in" links pointing at /
 *   - reflects the live RTG_AUTH state (signed-out -> "Sign in", signed-in -> your name)
 *
 * It drives window.RTG_AUTH (auth.js). Everything fails soft: with supabase-js blocked
 * the button still renders and the modal explains accounts are offline. No page markup
 * is required beyond including the two scripts; existing sign-in affordances are upgraded
 * in place so nothing needs to navigate to the home page to log in anymore.
 */
(function () {
  'use strict';

  var A = window.RTG_AUTH;
  if (!A) { return; }   // auth.js must load first

  var GOOGLE_G = '<svg width="17" height="17" viewBox="0 0 48 48" style="flex:0 0 auto" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.1 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.4c-.5 2.9-2.1 5.4-4.6 7.1l7.1 5.5c4.2-3.9 6.6-9.6 6.6-16.6z"/><path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.7-2.9-.7-4.6s.3-3.2.7-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.6 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.3 0 11.6-2.1 15.5-5.6l-7.1-5.5c-2 1.3-4.5 2.1-8.4 2.1-6.3 0-11.6-3.6-13.5-8.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>';
  var PERSON = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';

  var st = { mode: 'signin', busy: false, err: '', note: '' };
  var cur = A.state();       // last known auth state
  var chips = [];            // account buttons we injected / adopted

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function $(id) { return document.getElementById(id); }

  // ---------- styles ----------
  function injectStyles() {
    if ($('rtgauth-style')) return;
    var s = document.createElement('style');
    s.id = 'rtgauth-style';
    s.textContent = [
      '.rtgauth-scrim{position:fixed;inset:0;z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:max(24px,env(safe-area-inset-top)) 16px 24px;background:rgba(3,9,18,.66);backdrop-filter:blur(4px);overflow:auto;}',
      '.rtgauth-scrim[hidden]{display:none;}',
      '.rtgauth-sheet{width:100%;max-width:380px;margin:auto 0;background:var(--card,#0f1a2b);color:var(--ink,#eaf0f7);border:1px solid var(--line2,#22304a);border-radius:16px;padding:22px 20px;position:relative;box-shadow:0 30px 80px -20px rgba(0,0,0,.7);}',
      '.rtgauth-x{position:absolute;top:12px;right:12px;width:34px;height:34px;border-radius:50%;border:1px solid var(--line2,#22304a);background:var(--card2,#16233a);color:var(--ink,#eaf0f7);font-size:14px;cursor:pointer;}',
      '.rtgauth-h{font-family:var(--hero,inherit);font-weight:800;font-size:21px;margin:2px 0 4px;letter-spacing:.01em;}',
      '.rtgauth-lede{font-size:12.5px;color:var(--mut,#93a4bd);margin-bottom:15px;line-height:1.4;}',
      '.rtgauth-body input{width:100%;box-sizing:border-box;margin:0 0 9px;padding:12px 13px;border:1px solid var(--line2,#22304a);border-radius:9px;background:var(--card2,#16233a);color:var(--ink,#eaf0f7);font-size:15px;font-family:inherit;}',
      '.rtgauth-body input:focus{outline:none;border-color:var(--gold,#F2B632);}',
      '.rtgauth-go,.rtgauth-ghost,.rtgauth-gbtn{width:100%;box-sizing:border-box;appearance:none;border:0;border-radius:10px;padding:13px;min-height:48px;font-weight:800;font-size:14px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:9px;font-family:inherit;}',
      '.rtgauth-go{background:var(--gold,#F2B632);color:#20160a;}',
      '.rtgauth-go:hover{filter:brightness(1.05);} .rtgauth-go:disabled{opacity:.6;cursor:default;}',
      '.rtgauth-ghost{background:var(--card2,#16233a);color:var(--ink,#eaf0f7);border:1px solid var(--line2,#22304a);}',
      '.rtgauth-gbtn{background:#fff;color:#1f2430;border:1px solid #dadce0;}',
      '.rtgauth-danger{background:none;border:0;color:var(--red,#F0653A);font-weight:700;font-size:12px;cursor:pointer;text-decoration:underline;padding:6px;font-family:inherit;}',
      '.rtgauth-or{display:flex;align-items:center;gap:10px;color:var(--mut,#93a4bd);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin:12px 0;}',
      '.rtgauth-or::before,.rtgauth-or::after{content:"";flex:1;height:1px;background:var(--line,#1b2740);}',
      '.rtgauth-err{background:color-mix(in srgb,var(--red,#F0653A) 15%,transparent);color:var(--redT,#ff8a72);border:1px solid color-mix(in srgb,var(--red,#F0653A) 45%,transparent);border-radius:8px;padding:9px 11px;font-size:12.5px;font-weight:600;margin:0 0 9px;}',
      '.rtgauth-note{background:color-mix(in srgb,var(--green,#37C15A) 14%,transparent);color:var(--greenT,#7fe0a0);border-radius:8px;padding:9px 11px;font-size:12.5px;font-weight:600;margin:0 0 9px;}',
      '.rtgauth-swap{text-align:center;font-size:12.5px;color:var(--mut,#93a4bd);margin-top:13px;}',
      '.rtgauth-swap a{color:var(--gold,#F2B632);font-weight:700;cursor:pointer;}',
      '.rtgauth-fine{text-align:center;font-size:10.5px;color:var(--dim,#6b7d97);margin-top:11px;line-height:1.4;}',
      '.rtgauth-fine a{color:var(--mut,#93a4bd);}',
      '.rtgauth-me{display:flex;align-items:center;gap:11px;background:var(--card2,#16233a);border:1px solid var(--line2,#22304a);border-radius:12px;padding:12px 13px;margin-bottom:14px;}',
      '.rtgauth-av{flex:0 0 auto;width:40px;height:40px;border-radius:50%;background:var(--gold,#F2B632);color:#20160a;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:18px;font-family:var(--hero,inherit);}',
      '.rtgauth-me .u{font-weight:800;font-size:15px;} .rtgauth-me .e{font-size:11.5px;color:var(--mut,#93a4bd);}',
      '.rtgauth-nav{display:flex;gap:8px;margin-top:14px;}',
      '.rtgauth-nav a{flex:1;text-align:center;padding:11px 8px;border-radius:9px;border:1px solid var(--line2,#22304a);background:var(--card2,#16233a);color:var(--ink,#eaf0f7);font-weight:800;font-size:12px;text-decoration:none;}',
      '.rtgauth-nav a:hover{border-color:var(--gold,#F2B632);}',
      // topbar account button
      // min-width holds the chip's footprint: it mounts as "Sign in" and repaints
      // to a username when auth resolves (~500ms), and the width change used to
      // shove every other topbar button sideways - the arcade's single biggest
      // layout-shift source.
      '.rtgauth-chip{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:32px;min-width:92px;padding:0 11px;border-radius:9px;border:1px solid var(--line2,#22304a);background:var(--card2,#16233a);color:var(--ink,#eaf0f7);font-weight:800;font-size:12px;cursor:pointer;font-family:inherit;line-height:1;}',
      '.rtgauth-chip:hover{border-color:var(--gold,#F2B632);}',
      '.rtgauth-chip .rtgauth-cav{width:20px;height:20px;border-radius:50%;background:var(--gold,#F2B632);color:#20160a;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:11px;}',
      '.rtgauth-chip .rtgauth-clab{max-width:96px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '@media (max-width:430px){.rtgauth-chip{padding:0 8px;gap:0;min-width:40px;}.rtgauth-chip .rtgauth-clab{display:none;}}'
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  }

  // ---------- modal ----------
  function injectModal() {
    if ($('rtgauthScrim')) return;
    var d = document.createElement('div');
    d.className = 'rtgauth-scrim'; d.id = 'rtgauthScrim'; d.hidden = true;
    d.innerHTML =
      '<div class="rtgauth-sheet" role="dialog" aria-modal="true" aria-label="RunThe.GG account">' +
        '<button class="rtgauth-x" id="rtgauthX" type="button" aria-label="Close">✕</button>' +
        '<div class="rtgauth-h" id="rtgauthTitle"></div>' +
        '<div class="rtgauth-lede" id="rtgauthLede"></div>' +
        '<div class="rtgauth-body" id="rtgauthBody"></div>' +
      '</div>';
    document.body.appendChild(d);
    $('rtgauthX').onclick = close;
    d.addEventListener('click', function (e) { if (e.target === d) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !d.hidden) close(); });
  }

  function open(mode) {
    // signed-in with a name → the account panel; otherwise sign in / up / username
    if (mode === 'account' || (cur.signedIn && cur.name && !mode)) st.mode = 'account';
    else st.mode = mode || 'signin';
    st.err = ''; st.note = ''; st.busy = false;
    injectModal();   // the chip can be clicked before init() runs; build on demand
    $('rtgauthScrim').hidden = false;
    renderModal();
  }
  function close() { var s = $('rtgauthScrim'); if (s) s.hidden = true; }

  function renderModal() {
    var t = $('rtgauthTitle'), l = $('rtgauthLede'), b = $('rtgauthBody');
    if (!t) return;
    var m = st.mode, busy = st.busy;

    if (m === 'account') {
      t.textContent = 'Your account';
      l.textContent = 'One account. Your streaks, scores and Pro follow you into every RunThe.GG game.';
      var nm = cur.name || 'Player';
      // "Manage subscription" lives here (account plumbing), not on the hub -
      // shown only to cardholders; opens the member view of the card modal,
      // which hands off to the Stripe portal.
      var isPro = false;
      try { isPro = !!(window.RTGTokens && RTGTokens.isPro && RTGTokens.isPro()); } catch (e) {}
      b.innerHTML =
        '<div class="rtgauth-me"><div class="rtgauth-av">' + esc((nm.charAt(0) || 'P').toUpperCase()) + '</div>' +
          '<div><div class="u">' + esc(nm) + '</div>' + (cur.email ? '<div class="e">' + esc(cur.email) + '</div>' : '') + '</div></div>' +
        '<button class="rtgauth-ghost" id="rtgauthRename" type="button">Change username</button>' +
        '<div style="height:9px"></div>' +
        (isPro ? '<button class="rtgauth-ghost" id="rtgauthSub" type="button">Manage subscription</button><div style="height:9px"></div>' : '') +
        '<button class="rtgauth-ghost" id="rtgauthOut" type="button">Sign out</button>' +
        (st.err ? '<div class="rtgauth-err" style="margin-top:12px">' + esc(st.err) + '</div>' : '') +
        // quick navigation back into the arcade (the hub lists every game)
        '<div class="rtgauth-nav"><a href="/arcade/">🏠 Arcade home</a><a href="/arcade/archive/">🎟️ Your Vault</a></div>' +
        '<div style="text-align:center;margin-top:14px"><button class="rtgauth-danger" id="rtgauthDel" type="button">Delete account</button></div>';
      $('rtgauthRename').onclick = function () { st.mode = 'username'; st.err = ''; renderModal(); };
      var sub = $('rtgauthSub');
      if (sub) sub.onclick = function () { close(); if (window.RTGCard) RTGCard.paywall({}); };
      $('rtgauthOut').onclick = function () { run(function () { return A.signOut(); }, true); };
      $('rtgauthDel').onclick = onDelete;
      return;
    }

    if (m === 'username') {
      t.textContent = cur.name ? 'Change username' : 'Pick a username';
      l.textContent = 'This is how you show up on the leaderboards. 3–20 letters, numbers or _.';
      b.innerHTML =
        '<input type="text" id="rtgauthU" maxlength="20" placeholder="e.g. HoopsHana" autocomplete="off" value="' + esc(cur.name || '') + '">' +
        (st.err ? '<div class="rtgauth-err">' + esc(st.err) + '</div>' : '') +
        '<button class="rtgauth-go" id="rtgauthSaveU" type="button"' + (busy ? ' disabled' : '') + '>' + (busy ? 'Saving…' : 'Save username') + '</button>' +
        '<div style="height:9px"></div>' +
        '<button class="rtgauth-ghost" id="rtgauthUCancel" type="button">' + (cur.name ? 'Cancel' : 'Sign out') + '</button>';
      $('rtgauthSaveU').onclick = function () {
        var v = $('rtgauthU').value.trim();
        if (!/^[A-Za-z0-9_]{3,20}$/.test(v)) { st.err = 'Username: 3–20 letters, numbers or _.'; renderModal(); return; }
        run(function () { return A.setName(v); });
      };
      $('rtgauthUCancel').onclick = cur.name ? function () { st.mode = 'account'; renderModal(); } : function () { run(function () { return A.signOut(); }, true); };
      return;
    }

    if (m === 'reset') {
      t.textContent = 'Reset your password';
      l.textContent = 'Enter your account email and we’ll send a link to set a new password.';
      b.innerHTML =
        '<input type="email" id="rtgauthRe" placeholder="Email" autocomplete="email">' +
        (st.note ? '<div class="rtgauth-note">' + esc(st.note) + '</div>' : '') +
        (st.err ? '<div class="rtgauth-err">' + esc(st.err) + '</div>' : '') +
        '<button class="rtgauth-go" id="rtgauthReGo" type="button"' + (busy ? ' disabled' : '') + '>' + (busy ? 'Sending…' : 'Send reset link') + '</button>' +
        '<div style="height:9px"></div>' +
        '<button class="rtgauth-ghost" id="rtgauthReBack" type="button">Back to sign in</button>';
      $('rtgauthReGo').onclick = onReset;
      $('rtgauthReBack').onclick = function () { st.mode = 'signin'; st.err = ''; st.note = ''; renderModal(); };
      return;
    }

    if (m === 'newpass') {
      t.textContent = 'Set a new password';
      l.textContent = 'Choose a new password for your account. You’ll stay signed in on this device.';
      b.innerHTML =
        '<input type="password" id="rtgauthNp" placeholder="New password" autocomplete="new-password">' +
        '<input type="password" id="rtgauthNp2" placeholder="Confirm new password" autocomplete="new-password">' +
        (st.err ? '<div class="rtgauth-err">' + esc(st.err) + '</div>' : '') +
        '<button class="rtgauth-go" id="rtgauthNpGo" type="button"' + (busy ? ' disabled' : '') + '>' + (busy ? 'Saving…' : 'Update password') + '</button>';
      $('rtgauthNpGo').onclick = onNewPass;
      return;
    }

    // sign in / sign up
    var isUp = m === 'signup';
    t.textContent = isUp ? 'Create your account' : 'Welcome back';
    l.textContent = 'Free forever. One account works across every RunThe.GG game: Arcade, Football, Soccer, Golf and more.';
    b.innerHTML =
      '<button class="rtgauth-gbtn" id="rtgauthG" type="button"' + (busy ? ' disabled' : '') + '>' + GOOGLE_G + 'Continue with Google</button>' +
      '<div class="rtgauth-or">or</div>' +
      (isUp
        ? '<input type="text" id="rtgauthUp" maxlength="20" placeholder="Username" autocomplete="username">' +
          '<input type="email" id="rtgauthEm" placeholder="Email" autocomplete="email">'
        : '<input type="text" id="rtgauthId" placeholder="Username or email" autocomplete="username">') +
      '<input type="password" id="rtgauthPw" placeholder="Password" autocomplete="' + (isUp ? 'new-password' : 'current-password') + '">' +
      (st.note ? '<div class="rtgauth-note">' + esc(st.note) + '</div>' : '') +
      (st.err ? '<div class="rtgauth-err">' + esc(st.err) + '</div>' : '') +
      '<button class="rtgauth-go" id="rtgauthGo" type="button"' + (busy ? ' disabled' : '') + '>' + (busy ? '…' : (isUp ? 'Create free account' : 'Sign in')) + '</button>' +
      (isUp ? '' : '<div class="rtgauth-swap" style="margin-top:9px"><a id="rtgauthForgot">Forgot password?</a></div>') +
      '<div class="rtgauth-swap">' + (isUp ? 'Already have an account? <a id="rtgauthSwap">Sign in</a>' : 'New here? <a id="rtgauthSwap">Create one</a>') + '</div>' +
      '<div class="rtgauth-fine">By continuing you agree to our <a href="/terms.html">Terms</a> and <a href="/privacy.html">Privacy Policy</a>.</div>';
    $('rtgauthG').onclick = function () { run(function () { return A.signInGoogle(); }, true); };
    $('rtgauthSwap').onclick = function (e) { e.preventDefault(); st.mode = isUp ? 'signin' : 'signup'; st.err = ''; st.note = ''; renderModal(); };
    if (!isUp) { var f = $('rtgauthForgot'); if (f) f.onclick = function (e) { e.preventDefault(); st.mode = 'reset'; st.err = ''; st.note = ''; renderModal(); }; }
    $('rtgauthGo').onclick = onSubmit;
  }

  function onSubmit() {
    var isUp = st.mode === 'signup';
    var pw = $('rtgauthPw').value;
    if (isUp) {
      var u = $('rtgauthUp').value.trim(), em = $('rtgauthEm').value.trim();
      if (!/^[A-Za-z0-9_]{3,20}$/.test(u)) { st.err = 'Username: 3–20 letters, numbers or _.'; renderModal(); return; }
      if (!em || !pw) { st.err = 'Enter an email and password.'; renderModal(); return; }
      run(function () {
        return A.signUp(em, pw, u).then(function (r) {
          if (!r.error && r.needsConfirm) { st.mode = 'signin'; st.note = 'Account created. Check your email to confirm, then sign in.'; }
          return r;
        });
      });
    } else {
      var id = $('rtgauthId').value.trim();
      if (!id || !pw) { st.err = 'Enter your login and password.'; renderModal(); return; }
      run(function () { return A.signIn(id, pw); });
    }
  }

  // password reset: request the email. We show the same "check your inbox" note
  // whether or not the address has an account (never confirm an email exists).
  function onReset() {
    var em = $('rtgauthRe').value.trim();
    if (!em || em.indexOf('@') < 0) { st.err = 'Enter your account email.'; renderModal(); return; }
    if (st.busy) return;
    st.err = ''; st.note = ''; st.busy = true; renderModal();
    Promise.resolve(A.resetPassword(em)).then(function (r) {
      st.busy = false;
      if (r && r.error) { st.err = r.error; renderModal(); return; }
      st.note = 'If an account uses that email, a reset link is on its way. Check your inbox.';
      renderModal();
    }).catch(function () { st.busy = false; st.err = 'Could not send the email. Try again.'; renderModal(); });
  }

  // password reset: set the new password inside the recovery session (run() handles
  // the busy state and, on success, closes since you're already signed in).
  function onNewPass() {
    var p1 = $('rtgauthNp').value, p2 = $('rtgauthNp2').value;
    if (!p1 || p1.length < 6) { st.err = 'Password must be at least 6 characters.'; renderModal(); return; }
    if (p1 !== p2) { st.err = 'Those passwords don’t match.'; renderModal(); return; }
    run(function () { return A.updatePassword(p1); });
  }

  function onDelete() {
    if (!window.confirm('Delete your RunThe.GG account? This removes your profile, streaks and scores across every game and cannot be undone.')) return;
    run(function () {
      return A.deleteAccount().then(function (r) {
        if (r && r.ok) { st.note = ''; return { error: null }; }
        if (r && r.reason === 'active_subscription') return { error: 'Cancel your Pro subscription before deleting your account.' };
        if (r && r.reason) return { error: 'Could not delete the account right now.' };
        return r;
      });
    }, true);
  }

  // run an auth action with busy/error handling; closeOnDone for actions that resolve
  // the modal even without a session change (sign out, delete, oauth redirect).
  function run(fn, closeOnDone) {
    if (st.busy) return;
    st.err = ''; st.busy = true; renderModal();
    Promise.resolve().then(fn).then(function (r) {
      st.busy = false;
      if (r && r.error) { st.err = r.error; renderModal(); return; }
      cur = A.state();
      if (closeOnDone) { close(); return; }
      if (cur.signedIn && !cur.name) { st.mode = 'username'; renderModal(); return; }   // OAuth/new account needs a name
      if (cur.signedIn) { close(); return; }
      renderModal();   // e.g. signup awaiting email confirmation
    }).catch(function (e) {
      st.busy = false; st.err = (e && e.message) || 'Something went wrong.'; renderModal();
    });
  }

  // ---------- account controls in the page chrome ----------
  function makeChip() {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rtgauth-chip';
    btn.setAttribute('aria-label', 'Account');
    btn.onclick = function () { open(cur.signedIn ? 'account' : 'signin'); };
    paintChip(btn);   // never mount empty - it repaints when auth resolves
    return btn;
  }
  function paintChip(btn) {
    if (cur.signedIn) {
      var nm = cur.name || 'Account';
      btn.innerHTML = '<span class="rtgauth-cav">' + esc((nm.charAt(0) || 'P').toUpperCase()) + '</span><span class="rtgauth-clab">' + esc(nm) + '</span>';
      btn.setAttribute('aria-label', 'Signed in as ' + nm);
    } else {
      btn.innerHTML = PERSON + '<span class="rtgauth-clab">Sign in</span>';
      btn.setAttribute('aria-label', 'Sign in');
    }
  }
  function mountChips() {
    // The shared top banner (topbanner.js) owns the account control site-wide;
    // when it's present, don't also inject a topbar chip (avoids two profiles).
    if (window.RTG_HAS_BANNER) return;
    // 1) games: drop a chip into the .topbar, before the streak chip if there is one
    var bars = document.querySelectorAll('.topbar');
    for (var i = 0; i < bars.length; i++) {
      if (bars[i].querySelector('.rtgauth-chip')) continue;
      var chip = makeChip();
      var streak = bars[i].querySelector('.chip');
      if (streak) bars[i].insertBefore(chip, streak); else bars[i].appendChild(chip);
      chips.push(chip);
    }
    // 2) hub / anywhere: adopt an existing .mProf link as a chip
    var profs = document.querySelectorAll('.mProf');
    for (var j = 0; j < profs.length; j++) {
      var p = profs[j];
      if (p.dataset.rtgAdopted) continue;
      p.dataset.rtgAdopted = '1';
      p.addEventListener('click', function (e) { e.preventDefault(); open(cur.signedIn ? 'account' : 'signin'); });
      p.removeAttribute('href');
      p.style.cursor = 'pointer';
      chips.push({ _prof: p });
    }
  }
  function paintControls() {
    for (var i = 0; i < chips.length; i++) {
      if (chips[i]._prof) {
        chips[i]._prof.setAttribute('aria-label', cur.signedIn ? ('Signed in as ' + (cur.name || 'you')) : 'Sign in');
        chips[i]._prof.setAttribute('title', cur.signedIn ? (cur.name || 'Account') : 'Sign in');
      } else {
        paintChip(chips[i]);
      }
    }
    // fill any username slots and toggle [data-rtg-when]
    var slots = document.querySelectorAll('[data-rtg-authname]');
    for (var k = 0; k < slots.length; k++) slots[k].textContent = cur.name || '';
    var whens = document.querySelectorAll('[data-rtg-when]');
    for (var w = 0; w < whens.length; w++) {
      var want = whens[w].getAttribute('data-rtg-when');   // 'in' | 'out'
      whens[w].style.display = ((want === 'in') === !!cur.signedIn) ? '' : 'none';
    }
  }

  // wire explicit triggers + legacy "Sign in" links that point at the home page
  function wireTriggers() {
    var trig = document.querySelectorAll('[data-rtg-signin]');
    for (var i = 0; i < trig.length; i++) (function (el) {
      if (el.dataset.rtgWired) return; el.dataset.rtgWired = '1';
      el.addEventListener('click', function (e) { e.preventDefault(); open(cur.signedIn ? 'account' : 'signin'); });
    })(trig[i]);
    // legacy CTAs like <a href="/">Sign in to save your streak →</a>
    var links = document.querySelectorAll('a[href="/"], a[href="/index.html"]');
    for (var j = 0; j < links.length; j++) (function (el) {
      var txt = (el.textContent || '').toLowerCase();
      if (el.dataset.rtgWired || txt.indexOf('sign in') < 0) return;
      el.dataset.rtgWired = '1';
      el.addEventListener('click', function (e) { e.preventDefault(); open('signin'); });
    })(links[j]);
  }

  // ---------- init ----------
  function init() {
    injectStyles();
    injectModal();
    mountChips();
    wireTriggers();
    paintControls();
    A.onChange(function (s) {
      cur = s;
      paintControls();
      // Arrived via a reset link → jump straight to the "set a new password" step.
      if (s.recovery && st.mode !== 'newpass') open('newpass');
    });
    A.boot();
    window.RTGAuthUI = { open: open, close: close, state: function () { return cur; } };
  }
  // The account chip lands in a right-aligned button row, so mounting it on
  // DOMContentLoaded shoved every other topbar control sideways after first
  // paint. This script is loaded at the end of <body>, below the topbar, so
  // the markup it needs already exists: claim the slot during parse, before
  // anything has been painted. mountChips is idempotent, and the full init
  // still runs on DOMContentLoaded for any page that loads us from <head>.
  try { if (document.querySelector('.topbar')) { injectStyles(); mountChips(); } } catch (e) {}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
