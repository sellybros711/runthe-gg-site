/* 4th and What: how a snap feels. Sound and the buzz.
 *
 * The owner, 2026-11-13: sound on by default, with a mute button. Every sound
 * is made here with Web Audio (noise through filters, a few tones), so there
 * is nothing to download. Nothing plays until the first tap (Snap it unlocks
 * it), which is what phones require anyway.
 *
 *   crowd     the crowd under the play, swelling as it goes
 *   snap      the ball off the centre's hands
 *   throw     a whoosh
 *   catch     the pop of the ball in his hands
 *   hit       a tackle or a sack
 *   whistle   the play is over
 *   chains    the measurement: the chain rattles
 *   roar      a first down or a touchdown (bigger for a touchdown)
 *   groan     stopped
 *
 * The buzz (navigator.vibrate) is phones that have it: Android, not iPhone.
 * The choice is kept on the device ('faw_sound'): on unless switched off.
 *
 * Plain script: window.FAW_FEEL.
 */
(function (root) {
  'use strict';
  var KEY = 'faw_sound';
  var on = true; try { on = localStorage.getItem(KEY) !== 'off'; } catch (e) {}
  var ac = null, master = null, noiseBuf = null, crowd = null;

  function ctx() {
    if (ac) return ac;
    var AC = root.AudioContext || root.webkitAudioContext; if (!AC) return null;
    ac = new AC(); master = ac.createGain(); master.gain.value = 0.7; master.connect(ac.destination);
    var n = ac.sampleRate * 2; noiseBuf = ac.createBuffer(1, n, ac.sampleRate);
    var d = noiseBuf.getChannelData(0), b = 0;
    for (var i = 0; i < n; i++) { var w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.35 + b * 2.2; }
    return ac;
  }
  /* call from a tap: phones only start audio inside one */
  function unlock() { if (!on) return; var a = ctx(); if (a && a.state === 'suspended') a.resume(); }

  function noise(dur, f, q, gain, type, attack, sweepTo) {
    var a = ctx(); if (!a) return;
    var s = a.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    var fl = a.createBiquadFilter(); fl.type = type || 'bandpass'; fl.frequency.value = f; fl.Q.value = q || 1;
    var g = a.createGain(), t = a.currentTime;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + (attack || 0.01)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (sweepTo) fl.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    s.connect(fl); fl.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  function tone(f, dur, gain, type, to, vib) {
    var a = ctx(); if (!a) return;
    var o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    if (vib) { var l = a.createOscillator(), lg = a.createGain(); l.frequency.value = vib; lg.gain.value = f * 0.06; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur); }
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }

  function crowdOn() {
    var a = ctx(); if (!a || crowd) return;
    var s = a.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    var fl = a.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = 900; fl.Q.value = 0.6;
    var g = a.createGain(); g.gain.value = 0.0001; g.gain.exponentialRampToValueAtTime(0.09, a.currentTime + 0.6);
    s.connect(fl); fl.connect(g); g.connect(master); s.start();
    crowd = { s: s, g: g, f: fl };
  }
  /* the crowd leans in as the play goes: 0 at the snap, 1 at the end */
  function crowdLevel(k) { if (!crowd || !ac) return; var v = 0.08 + 0.12 * Math.max(0, Math.min(1, k)); crowd.g.gain.setTargetAtTime(v, ac.currentTime, 0.15); crowd.f.frequency.setTargetAtTime(800 + 700 * k, ac.currentTime, 0.2); }
  function crowdOff(after) {
    if (!crowd || !ac) return; var c = crowd; crowd = null;
    c.g.gain.setTargetAtTime(0.0001, ac.currentTime + (after || 0), 0.5); c.s.stop(ac.currentTime + (after || 0) + 3);
  }

  var SOUNDS = {
    crowd: crowdOn,
    snap: function () { noise(0.09, 260, 1.2, 0.5, 'lowpass', 0.005); tone(110, 0.08, 0.25, 'sine', 60); },
    throw: function () { noise(0.35, 1200, 0.8, 0.12, 'bandpass', 0.08, 3000); },
    catch: function () { noise(0.07, 1800, 2, 0.6, 'bandpass', 0.003); tone(520, 0.06, 0.15, 'triangle', 300); },
    hit: function () { noise(0.22, 180, 0.9, 0.9, 'lowpass', 0.004, 80); tone(70, 0.18, 0.5, 'sine', 40); },
    whistle: function () { tone(2900, 0.45, 0.12, 'sine', 2700, 28); },
    chains: function () { for (var i = 0; i < 6; i++) setTimeout(function () { noise(0.05, 4200, 4, 0.18, 'bandpass', 0.002); }, i * 70 + Math.random() * 30); },
    roar: function (big) { noise(big ? 2.6 : 1.6, 1100, 0.5, big ? 0.55 : 0.4, 'bandpass', 0.25, 1600); if (big) noise(2.2, 2400, 0.7, 0.2, 'bandpass', 0.3); },
    groan: function () { noise(1.4, 700, 0.6, 0.3, 'bandpass', 0.2, 260); }
  };
  function play(kind, arg) { if (!on) return; try { var a = ctx(); if (!a || a.state !== 'running') return; SOUNDS[kind] && SOUNDS[kind](arg); } catch (e) {} }
  function buzz(p) { if (!on) return; try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }

  function set(v) {
    on = !!v; try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) {}
    if (!on) crowdOff(); else unlock();
    render();
  }
  function render() { var b = document.getElementById('bSound'); if (!b) return; b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', on ? 'Sound on' : 'Sound off'); b.classList.toggle('off', !on); }

  /* the snap's events, as they happen (play.js calls this) */
  function event(e) {
    switch (e.kind) {
      case 'throw': case 'checkdown': play('throw'); break;
      case 'catch': play('catch'); buzz(25); break;
      case 'sack': case 'fumble': play('hit'); buzz([40, 30, 40]); break;
      case 'broken': play('hit'); break;
      case 'incomplete': case 'throwaway': play('whistle'); break;
      case 'td': play('whistle'); break;
    }
  }
  /* the end of the snap: the crowd's answer */
  function result(res) {
    crowdOff(0.4);
    if (res.outcome === 'down' || res.outcome === 'oob') play('hit');
    setTimeout(function () {
      if (res.outcome === 'touchdown') { play('roar', true); buzz([60, 40, 60, 40, 120]); }
      else if (res.win) { play('roar'); buzz([50, 40, 80]); }
      else { play('groan'); buzz(120); }
    }, 120);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var b = document.getElementById('bSound');
    if (b) b.addEventListener('click', function () { set(!on); });
    render();
  });
  render();

  root.FAW_FEEL = { unlock: unlock, play: play, buzz: buzz, crowdLevel: crowdLevel, crowdOff: crowdOff, event: event, result: result, set: set, on: function () { return on; } };
})(typeof window !== 'undefined' ? window : this);
