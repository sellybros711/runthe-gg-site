/* sound.js: every noise in Shut The Door, made on the spot with the Web Audio API.

   Nothing is downloaded and nothing is sampled: the glove, the bat, the umpire and the crowd are
   filtered noise and oscillators built here. The umpire is a formant voice (a buzz through three
   vowel filters), never a recording. One 2 s noise buffer is made once at unlock and every sound
   reads it from a random offset, so a pitch only schedules nodes on the audio thread.

   The graph:  voices -> sfx -> comp -> master -> out
               crowd  -> crowdBus (ducked under the calls) -> comp

   The rules it keeps:
   - Silent until the first tap or key (the autoplay rules): no AudioContext before a gesture.
   - One switch (settings and the mound's speaker button). Off sets the master gain to 0 and stops
     the phone's buzz too. ui.js keeps the choice in std_ui_v1.sound.
   - Quiet when the tab is hidden: the context is suspended and resumed on return.

   window.STD_SFX: setOn(v) isOn() state() pitch(mph, ms, quick) pop(level, ms) crack(kind, ms)
   miss(ms) thud(ms) snap(ms) ump(word) roar(size) groan(size) cheer() bed(level) tick() chime(level)
   tap() tab() sting(outcome) buzz(pattern) */
(function () {
  'use strict';
  var ac = null, master = null, comp = null, sfx = null, crowdBus = null, NB = null;
  var on = true, gesture = false, bedNodes = null, bedLevel = 0;

  function ctx() {
    if (!on || !gesture || document.hidden) return null;
    if (!ac) {
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        comp = ac.createDynamicsCompressor();
        comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
        master = ac.createGain(); master.gain.value = 0.9;
        sfx = ac.createGain(); sfx.gain.value = 1;
        crowdBus = ac.createGain(); crowdBus.gain.value = 1;
        sfx.connect(comp); crowdBus.connect(comp); comp.connect(master); master.connect(ac.destination);
        var n = ac.sampleRate * 2; NB = ac.createBuffer(1, n, ac.sampleRate);
        var d = NB.getChannelData(0); for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { ac = null; return null; }
    }
    if (ac.state === 'suspended') { try { ac.resume(); } catch (e) {} }
    return ac;
  }

  /* ---- building blocks ---------------------------------------------------------------- */

  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  /* filtered noise: {type, f, f2, q, g, a, to} */
  function nz(t, dur, o) {
    var s = ac.createBufferSource(); s.buffer = NB; s.loop = true;
    var f = ac.createBiquadFilter(); f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.f, t); if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
    f.Q.value = o.q || 1;
    var g = ac.createGain(); env(g, t, o.a || 0.002, o.g, dur);
    s.connect(f); f.connect(g); g.connect(o.to || sfx);
    s.start(t, Math.random() * 1.8); s.stop(t + (o.a || 0.002) + dur + 0.05);
  }
  /* a tone: {type, f, f2, g, a, to} */
  function tone(t, dur, o) {
    var s = ac.createOscillator(); s.type = o.type || 'sine';
    s.frequency.setValueAtTime(o.f, t); if (o.f2) s.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
    var g = ac.createGain(); env(g, t, o.a || 0.002, o.g, dur);
    s.connect(g); g.connect(o.to || sfx); s.start(t); s.stop(t + (o.a || 0.002) + dur + 0.05);
  }
  function at(ms) { return ac.currentTime + 0.005 + (ms > 0 ? ms / 1000 : 0); }
  /* the crowd dips under a call, then comes back */
  function duck(t, depth, hold) {
    var g = crowdBus.gain; g.cancelScheduledValues(t);
    g.setTargetAtTime(1 - depth, t, 0.02); g.setTargetAtTime(1, t + hold, 0.25);
  }
  function run(fn) { return function () { if (!ctx()) return; try { fn.apply(null, arguments); } catch (e) {} }; }

  /* ---- the umpire: a formant voice -----------------------------------------------------
     A sawtooth at the voice's pitch through three band filters at the vowel's formants. Each part
     is [seconds, f0, F1, F2, F3, loudness]; the filters glide from one part to the next. */
  var V = { i: [300, 2300, 3000], r: [420, 1250, 1650], a: [780, 1220, 2500], ai: [380, 2150, 2900], o: [520, 880, 2450], u: [340, 900, 2300] };
  function voice(t, parts, loud, vib) {
    var src = ac.createOscillator(); src.type = 'sawtooth';
    var out = ac.createGain(); out.gain.setValueAtTime(0.0001, t);
    var fs = [0, 1, 2].map(function (k) {
      var f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = k === 0 ? 6 : 9;
      var fg = ac.createGain(); fg.gain.value = [1, 0.7, 0.35][k];
      src.connect(f); f.connect(fg); fg.connect(out); return f;
    });
    if (vib) {
      var lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 5.5; lg.gain.value = vib;
      lfo.connect(lg); lg.connect(src.frequency); lfo.start(t); lfo.stop(t + 2);
    }
    var x = t;
    parts.forEach(function (p, i) {
      var how = i === 0 ? 'setValueAtTime' : 'linearRampToValueAtTime', end = x + p[0];
      src.frequency[how](p[1], i === 0 ? x : end);
      for (var k = 0; k < 3; k++) fs[k].frequency[how](p[2 + k], i === 0 ? x : end);
      out.gain.linearRampToValueAtTime(loud * p[5], i === 0 ? x + 0.02 : end);
      x = end;
    });
    out.gain.linearRampToValueAtTime(0.0001, x + 0.06);
    out.connect(sfx); src.start(t); src.stop(x + 0.1);
    return x;
  }
  function say(word) {
    var t = at(0);
    if (word === 'ball' || word === 'ball4') {
      /* a ball: low and short, almost to himself. Ball four gets a touch more */
      tone(t, 0.025, { f: 110, g: 0.05 });
      voice(t + 0.02, [[0.04, 150, 500, 900, 2400, 0.6], [0.14, 135, 520, 880, 2450, 1], [0.08, 118, 480, 860, 2400, 0.5]], word === 'ball4' ? 0.22 : 0.13);
      return;
    }
    var k = word === 'k', hold = k ? 0.46 : 0.17, lift = k ? 300 : 265;
    duck(t, 0.55, k ? 0.9 : 0.45);
    /* "s" then "t": the hiss and the tap */
    nz(t, 0.085, { type: 'highpass', f: 4800, g: 0.16, a: 0.02 });
    nz(t + 0.09, 0.012, { type: 'bandpass', f: 3200, q: 2, g: 0.22 });
    /* "ee-RAI": the short lead in, the r, the big open vowel closing toward i */
    var end = voice(t + 0.1, [
      [0.05, 200, V.i[0], V.i[1], V.i[2], 0.5],
      [0.05, 215, V.r[0], V.r[1], V.r[2], 0.7],
      [0.06, lift, V.a[0], V.a[1], V.a[2], 1],
      [hold, lift - 25, V.a[0] - 40, V.a[1] + 80, V.a[2], 1],
      [0.08, 190, V.ai[0], V.ai[1], V.ai[2], 0.55],
    ], k ? 0.62 : 0.5, k ? 7 : 0);
    /* "k": the stop at the end */
    nz(end + 0.02, 0.018, { type: 'bandpass', f: 2100, q: 3, g: 0.26 });
    if (k) {
      /* the punch out: a whip of the arm and a fist into the air */
      nz(end - 0.12, 0.16, { type: 'bandpass', f: 600, f2: 2600, q: 1.4, g: 0.1, a: 0.06 });
      tone(end + 0.04, 0.16, { f: 120, f2: 48, g: 0.45 });
      nz(end + 0.04, 0.05, { type: 'lowpass', f: 700, g: 0.4 });
    }
  }

  /* ---- the crowd -------------------------------------------------------------------- */

  /* the bed: a rumble and a murmur of voices, both from the one noise buffer, swaying slowly */
  function bedStart() {
    var t = ac.currentTime, g = ac.createGain(); g.gain.value = 0.0001; g.connect(crowdBus);
    var parts = [[ 'lowpass', 420, 0.7, 0.5, 0.17 ], [ 'bandpass', 950, 1.1, 0.42, 0.31 ], [ 'bandpass', 1900, 2.5, 0.16, 0.53 ]].map(function (p) {
      var s = ac.createBufferSource(); s.buffer = NB; s.loop = true; s.playbackRate.value = 0.9 + Math.random() * 0.2;
      var f = ac.createBiquadFilter(); f.type = p[0]; f.frequency.value = p[1]; f.Q.value = p[2];
      var pg = ac.createGain(); pg.gain.value = p[3];
      var lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = p[4]; lg.gain.value = p[3] * 0.35;
      lfo.connect(lg); lg.connect(pg.gain);
      s.connect(f); f.connect(pg); pg.connect(g); s.start(t, Math.random()); lfo.start(t);
      return [s, lfo];
    });
    return { g: g, stop: function (w) { parts.forEach(function (p) { try { p[0].stop(w); p[1].stop(w); } catch (e) {} }); } };
  }
  function bed(level) {
    bedLevel = level;
    if (!ctx()) return;
    var t = ac.currentTime;
    if (level > 0 && !bedNodes) bedNodes = bedStart();
    if (!bedNodes) return;
    bedNodes.g.gain.cancelScheduledValues(t);
    bedNodes.g.gain.setTargetAtTime(Math.max(0.0001, 0.03 + level * 0.16), t, 0.6);
    if (level <= 0) { var b = bedNodes; bedNodes = null; b.g.gain.setTargetAtTime(0.0001, t, 0.4); b.stop(t + 2.5); }
  }
  /* a swell: size 0.3 an "ooh", 1 a strikeout, 1.6 the save */
  function roar(size) {
    var t = at(0), d = 1.4 + size * 1.2;
    nz(t, d, { type: 'bandpass', f: 800, f2: 1300, q: 0.8, g: 0.22 * size, a: 0.35 });
    nz(t, d * 0.8, { type: 'lowpass', f: 500, g: 0.2 * size, a: 0.25 });
    nz(t + 0.1, d * 0.7, { type: 'bandpass', f: 2400, q: 1.5, g: 0.06 * size, a: 0.3 });
    if (size >= 1) {
      /* two whistles from the stands */
      tone(t + 0.35, 0.5, { f: 2500, f2: 3100, g: 0.025, a: 0.08 });
      tone(t + 0.6, 0.6, { f: 2900, f2: 2300, g: 0.02, a: 0.1 });
    }
  }
  /* the groan: an "ohhh" falling away, many low voices through a dark filter */
  function groan(size) {
    var t = at(0), d = 1.3 + size * 0.5;
    for (var i = 0; i < 7; i++) {
      var f0 = 115 + Math.random() * 90;
      tone(t + Math.random() * 0.12, d, { type: 'sawtooth', f: f0, f2: f0 * 0.72, g: 0.012 * size, a: 0.25, to: groanF(t) });
    }
    nz(t, d, { type: 'bandpass', f: 650, f2: 380, q: 1.6, g: 0.16 * size, a: 0.3 });
  }
  function groanF(t) { var f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(800, t); f.frequency.linearRampToValueAtTime(420, t + 1.6); f.connect(crowdBus); return f; }
  /* the save: the roar, then hands, a few hundred claps as short bright bursts */
  function cheer() {
    roar(1.6);
    var t = at(150);
    for (var i = 0; i < 90; i++) {
      var w = t + Math.pow(Math.random(), 0.7) * 2.8;
      nz(w, 0.02 + Math.random() * 0.02, { type: 'bandpass', f: 1100 + Math.random() * 1500, q: 1.2, g: 0.05 + Math.random() * 0.07, to: crowdBus });
    }
  }

  /* ---- the result's sting: a short brass-like figure, bright for the save ------------- */
  function sting(outcome) {
    var t = at(0), f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400; f.Q.value = 0.7; f.connect(sfx);
    var notes = outcome === 'door_shut' ? [[0, 523.3], [0.09, 659.3], [0.18, 784], [0.3, 1046.5]]
      : outcome === 'tie_held' ? [[0, 523.3], [0.14, 784]]
      : [[0, 440], [0.16, 349.2], [0.32, 293.7]];
    var big = outcome === 'door_shut';
    notes.forEach(function (n, i) {
      var last = i === notes.length - 1, d = last ? (big ? 0.9 : 0.6) : 0.22;
      tone(t + n[0], d, { type: 'sawtooth', f: n[1], g: big ? 0.07 : 0.05, a: 0.012, to: f });
      tone(t + n[0], d, { type: 'triangle', f: n[1] * 2, g: big ? 0.035 : 0.02, a: 0.01, to: f });
    });
    if (big) tone(t + 0.3, 1.1, { f: 2093, g: 0.04, a: 0.01 });
  }

  /* ---- the pitch, the glove, the bat ---------------------------------------------------- */
  function pitch(mph, ms, quick) {
    var rel = at(ms), sp = quick ? 1.8 : 1;
    mph = mph > 50 ? mph : 92;
    /* the leg kick: a soft rising air sweep into the release */
    nz(Math.max(ac.currentTime + 0.005, rel - 0.38 / sp), 0.34 / sp, { type: 'bandpass', f: 260, f2: 900, q: 0.9, g: 0.05, a: 0.18 / sp });
    /* the release: a dry snap of the fingers off the seams */
    nz(rel, 0.025, { type: 'highpass', f: 3200, g: 0.2 });
    tone(rel, 0.04, { type: 'triangle', f: 950, f2: 520, g: 0.05 });
    /* the ball's whistle: higher and louder with speed, rising as it comes in */
    var fl = 18.44 / (mph * 0.447) / sp, fq = 1300 + (mph - 70) * 55, lv = 0.035 * Math.pow(mph / 95, 3);
    nz(rel + 0.02, fl * 0.92, { type: 'bandpass', f: fq, f2: fq * 1.2, q: 7, g: lv, a: fl * 0.75 });
  }
  /* level 2 a called strike (the big leather pop), 1 a strike or a catch, 0 a ball */
  function pop(level, ms) {
    var t = at(ms), k = [0.5, 0.75, 1][level] || 0.75;
    nz(t, 0.055, { type: 'lowpass', f: 900 + level * 500, g: 0.85 * k });
    tone(t, 0.11, { f: 160, f2: 52, g: 0.6 * k });
    nz(t, 0.012, { type: 'bandpass', f: 3400, q: 2, g: 0.3 * k });
    if (level === 2) { duck(t, 0.3, 0.2); tone(t, 0.18, { f: 90, f2: 40, g: 0.25 }); }
  }
  function crack(kind, ms) {
    var t = at(ms);
    if (kind === 'foul') { nz(t, 0.018, { type: 'highpass', f: 2600, g: 0.35 }); tone(t, 0.03, { type: 'triangle', f: 1300, g: 0.05 }); return; }
    if (kind === 'clean') {
      nz(t, 0.04, { type: 'highpass', f: 1600, g: 0.85 });
      nz(t, 0.05, { type: 'lowpass', f: 450, g: 0.35 });
      tone(t, 0.09, { type: 'triangle', f: 1950, f2: 1500, g: 0.16 });
      tone(t, 0.16, { f: 640, f2: 600, g: 0.12 });
      duck(t, 0.4, 0.15);
      return;
    }
    nz(t, 0.07, { type: 'bandpass', f: 700, q: 1.3, g: 0.55 });
    tone(t, 0.07, { f: 300, f2: 190, g: 0.2 });
  }
  function miss(ms) { nz(at(ms), 0.17, { type: 'bandpass', f: 380, f2: 1500, q: 1.1, g: 0.14, a: 0.07 }); }
  function thud(ms) { var t = at(ms); nz(t, 0.09, { type: 'lowpass', f: 380, g: 0.55 }); tone(t, 0.08, { f: 90, f2: 50, g: 0.3 }); }
  function snap(ms) { var t = at(ms); nz(t, 0.03, { type: 'highpass', f: 2700, g: 0.25 }); tone(t, 0.07, { type: 'triangle', f: 1500, f2: 900, g: 0.1 }); }

  /* ---- the meter and the taps ------------------------------------------------------------ */
  function tick() { tone(at(0), 0.018, { type: 'triangle', f: 1750, g: 0.07 }); }
  function chime(level) {
    var t = at(0), ns = level === 2 ? [1568, 2093, 2637] : [1568, 2093];
    ns.forEach(function (f, i) { tone(t + i * 0.045, 0.42, { f: f, g: 0.085, a: 0.004 }); tone(t + i * 0.045, 0.2, { f: f * 2.01, g: 0.02 }); });
  }
  function tap() { tone(at(0), 0.03, { f: 720, f2: 520, g: 0.045 }); }
  function tab() { var t = at(0); tone(t, 0.035, { type: 'triangle', f: 880, f2: 1250, g: 0.05 }); nz(t, 0.01, { type: 'highpass', f: 4000, g: 0.05 }); }

  /* a phone buzz only after the player has tapped the page: before that Chrome blocks the call
     and logs it as an error (the browser check's Survivor step caught it) */
  function canBuzz() {
    if (!navigator.vibrate) return false;
    const ua = navigator.userActivation;
    return !ua || ua.hasBeenActive;
  }

  /* ---- the switch, the gesture, the hidden tab ------------------------------------------- */
  function setOn(v) {
    on = !!v;
    if (!on) {
      if (master) { master.gain.cancelScheduledValues(0); master.gain.value = 0; }
      if (bedNodes) { bedNodes.stop(0); bedNodes = null; }
      try { if (canBuzz()) navigator.vibrate(0); } catch (e) {}
      return;
    }
    if (ctx()) { master.gain.cancelScheduledValues(0); master.gain.value = 0.9; if (bedLevel > 0) bed(bedLevel); }
  }
  function unlock() {
    if (gesture) return;
    gesture = true;
    ['pointerdown', 'keydown', 'touchend'].forEach(function (e) { document.removeEventListener(e, unlock, true); });
    if (ctx() && bedLevel > 0) bed(bedLevel);
  }
  ['pointerdown', 'keydown', 'touchend'].forEach(function (e) { document.addEventListener(e, unlock, true); });
  document.addEventListener('visibilitychange', function () {
    if (!ac) return;
    try { if (document.hidden) ac.suspend(); else if (on) ac.resume(); } catch (e) {}
  });

  window.STD_SFX = {
    setOn: setOn,
    isOn: function () { return on; },
    /* for the browser check: the switch, and the master gain the speakers get */
    state: function () { return { on: on, started: !!ac, gain: master ? master.gain.value : 0, ctx: ac ? ac.state : 'none' }; },
    pitch: run(pitch), pop: run(pop), crack: run(crack), miss: run(miss), thud: run(thud), snap: run(snap),
    ump: run(say), roar: run(roar), groan: run(groan), cheer: run(cheer), sting: run(sting),
    tick: run(tick), chime: run(chime), tap: run(tap), tab: run(tab),
    bed: function (level) { try { bed(level); } catch (e) {} },
    buzz: function (p) { if (!on || !canBuzz()) return; try { navigator.vibrate(p); } catch (e) {} },
  };
})();
