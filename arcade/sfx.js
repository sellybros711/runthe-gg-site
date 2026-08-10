/* RunTheGrid shared SFX + haptics.
   Sound is OFF by default; the choice persists in runthegrid_sound (shared across
   the suite). Tones are synthesized with WebAudio (no assets, CSP-safe). Haptics
   fire independently of the sound preference and are inert on desktop. */
(function () {
  'use strict';
  var KEY = 'runthegrid_sound';
  var pref; try { pref = localStorage.getItem(KEY); } catch (e) {}
  var on = pref === 'on';                 // default OFF
  var ctx = null;

  function ac() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    return ctx;
  }
  function tone(freq, dur, type, vol, when) {
    if (!on) return;
    var a = ac(); if (!a) return;
    var t0 = a.currentTime + (when || 0);
    var o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol || 0.14, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (dur || 0.12));
    o.connect(g); g.connect(a.destination);
    o.start(t0); o.stop(t0 + (dur || 0.12) + 0.03);
  }
  function vibe(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }

  function syncBtn(b) {
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.setAttribute('title', on ? 'Sound on' : 'Sound off');
    b.setAttribute('aria-label', on ? 'Sound on, tap to mute' : 'Sound off, tap to unmute');
    b.classList.toggle('snd-on', on);
    b.classList.toggle('snd-off', !on);
  }
  function syncAll() {
    var list = document.querySelectorAll('[data-sound-toggle]');
    for (var i = 0; i < list.length; i++) syncBtn(list[i]);
  }

  var API = {
    isOn: function () { return on; },
    set: function (v) {
      on = !!v;
      try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) {}
      if (on) { ac(); tone(660, 0.09, 'triangle', 0.12); tone(880, 0.10, 'triangle', 0.10, 0.05); }
      syncAll();
      return on;
    },
    toggle: function () { return API.set(!on); },
    // --- game cues ---
    place: function () { tone(300, 0.05, 'sine', 0.09); },
    key:   function () { tone(440, 0.025, 'square', 0.045); },
    lock:  function () { tone(523, 0.10, 'triangle', 0.13); tone(784, 0.14, 'triangle', 0.11, 0.06); vibe(18); },
    soft:  function () { tone(340, 0.14, 'sine', 0.10); },            // "true, but not the answer" — gentle, not punishing
    wrong: function () { tone(180, 0.20, 'sawtooth', 0.11); tone(120, 0.24, 'sawtooth', 0.10, 0.02); vibe(55); },
    win:   function () { nudge(); [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.20, 'triangle', 0.16, i * 0.11); }); vibe([25, 40, 25, 40, 70]); },
    haptic: vibe
  };

  // One-time nudge: sound ships muted, so the very first win fires silently
  // for everyone. Point at the speaker button once, then never again.
  function nudge() {
    if (on) return;
    try { if (localStorage.getItem('runthegrid_sound_nudged')) return; localStorage.setItem('runthegrid_sound_nudged', '1'); } catch (e) { return; }
    var el = document.createElement('div');
    el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:24px;z-index:10001;background:var(--card,#10233A);color:var(--ink,#F4F7FB);border:1px solid var(--line2,rgba(255,255,255,.2));border-radius:12px;padding:11px 16px;font:800 12.5px/1.4 system-ui,sans-serif;box-shadow:0 10px 30px -8px rgba(0,0,0,.5);max-width:88vw;text-align:center;';
    el.textContent = '🔇 Sound is off — tap the speaker up top to feel the wins';
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 5000);
  }

  function wire() {
    var list = document.querySelectorAll('[data-sound-toggle]');
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (b._sndWired) continue; b._sndWired = true;
      syncBtn(b);
      b.addEventListener('click', function (e) { e.preventDefault(); API.toggle(); });
    }
  }
  if (document.readyState !== 'loading') wire();
  else document.addEventListener('DOMContentLoaded', wire);

  window.RTGSound = API;
})();
