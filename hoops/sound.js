/* Run The Floor: the sound of a building.
 *
 * Asked for with one condition: sound only arrives with real animated
 * cutscenes, never a player standing there bouncing. So this file is only ever
 * called by the cutscene player and the playable moments in court.js, and
 * never by a menu, a card or a button.
 *
 * NOTHING IS LOADED. Every cue is synthesized with WebAudio from noise and
 * oscillators, so there are no audio files to fetch, cache or version. A cue
 * that sounds poor this way can be swapped for a small recording later behind
 * the same name.
 *
 * OFF BY DEFAULT, and the switch is remembered on the device (rtf.sound.v1).
 * A browser will not start an AudioContext before a press anyway, so the
 * context is made on the first cue after somebody has switched sound on, which
 * is always inside a press.
 *
 * window.RTF_SOUND: on(), setOn(v), cue(name, opts), crowd(level, seconds).
 */
(function(){
'use strict';
var KEY = 'rtf.sound.v1';
var ctx = null, master = null, noiseBuf = null;
function on(){ try { return localStorage.getItem(KEY) === 'on'; } catch (e) { return false; } }
function setOn(v){ try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch (e) {} if (!v && ctx) { try { ctx.suspend(); } catch (e) {} } }
function audio(){
  if (!on()) return null;
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    try { ctx = new AC(); } catch (e) { return null; }
    master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    var n = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
  return ctx;
}
/* A burst of filtered noise with an attack and a release. */
function noise(at, dur, type, freq, q, vol, attack){
  var src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  var f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 1;
  var g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + (attack || 0.01));
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(at, Math.random()); src.stop(at + dur + 0.05);
  return f;
}
function tone(at, dur, type, f0, f1, vol, attack){
  var o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, at);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, at + dur);
  var g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + (attack || 0.008));
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g); g.connect(master);
  o.start(at); o.stop(at + dur + 0.05);
}
var CUES = {
  /* the net: a soft high hiss that falls away */
  swish: function(t){ var f = noise(t, 0.32, 'bandpass', 5200, 0.8, 0.35, 0.02); f.frequency.exponentialRampToValueAtTime(2600, t + 0.3); },
  /* the rim: a metal ring, two partials, and the thud */
  clank: function(t){ tone(t, 0.5, 'triangle', 620, 560, 0.25); tone(t, 0.35, 'square', 1310, 1240, 0.06); noise(t, 0.08, 'lowpass', 600, 1, 0.3); },
  bounce: function(t){ tone(t, 0.12, 'sine', 140, 70, 0.5); noise(t, 0.05, 'lowpass', 900, 1, 0.15); },
  squeak: function(t){ tone(t, 0.09, 'sawtooth', 2400, 3100, 0.05, 0.005); tone(t + 0.07, 0.07, 'sawtooth', 2800, 2300, 0.04, 0.005); },
  buzzer: function(t){ tone(t, 0.9, 'sawtooth', 196, 0, 0.22, 0.01); tone(t, 0.9, 'square', 98, 0, 0.12, 0.01); },
  whistle: function(t){ var o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 3100; lfo.frequency.value = 38; lg.gain.value = 140; lfo.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.02); g.gain.setValueAtTime(0.18, t + 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g); g.connect(master); o.start(t); lfo.start(t); o.stop(t + 0.5); lfo.stop(t + 0.5); },
  flash: function(t){ noise(t, 0.06, 'highpass', 4000, 1, 0.12, 0.003); tone(t + 0.02, 0.12, 'sine', 3800, 1200, 0.03); },
  chime: function(t){ [659, 880, 1319].forEach(function(f, i){ tone(t + i * 0.12, 0.9, 'sine', f, 0, 0.12); }); },
  organ: function(t){ [262, 330, 392, 523].forEach(function(f, i){ tone(t + i * 0.1, 0.22, 'square', f, 0, 0.06); }); tone(t + 0.42, 0.45, 'square', 523, 0, 0.08); },
  thud: function(t){ tone(t, 0.25, 'sine', 90, 40, 0.6); noise(t, 0.12, 'lowpass', 400, 1, 0.3); },
  roar: function(t, o){ noise(t, (o && o.dur) || 2.4, 'bandpass', 900, 0.5, 0.32, 0.25); noise(t, (o && o.dur) || 2.4, 'lowpass', 400, 0.7, 0.2, 0.3); },
  /* a release in the gold of the meter: a bright two-note ding */
  perfect: function(t){ tone(t, 0.18, 'square', 1568, 0, 0.05); tone(t + 0.07, 0.3, 'square', 2093, 0, 0.05); },
  /* a hand on the ball: a slap and a little air */
  slap: function(t){ noise(t, 0.07, 'highpass', 1800, 1, 0.35, 0.003); tone(t, 0.08, 'sine', 220, 120, 0.25); },
  groan: function(t){ var f = noise(t, 1.4, 'bandpass', 700, 0.6, 0.2, 0.08); f.frequency.exponentialRampToValueAtTime(260, t + 1.3); },
};
function cue(name, opts){
  var c = audio();
  if (!c || !CUES[name]) return false;
  try { CUES[name](c.currentTime + ((opts && opts.delay) || 0), opts); } catch (e) { return false; }
  return true;
}
/* A crowd bed at three loudnesses, for as long as a scene asks. */
function crowd(level, seconds){
  var c = audio();
  if (!c) return false;
  var vol = level >= 3 ? 0.22 : level === 2 ? 0.12 : 0.05;
  try { noise(c.currentTime, seconds || 3, 'bandpass', 700, 0.4, vol, 0.4); } catch (e) { return false; }
  return true;
}
window.RTF_SOUND = { on: on, setOn: setOn, cue: cue, crowd: crowd, CUES: Object.keys(CUES) };
})();
