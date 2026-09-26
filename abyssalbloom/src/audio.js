/* Sound: soft pentatonic chimes through a feedback delay, and a quiet drone.
 * Unchanged from the HD game; the context starts on the first tap. */
"use strict";

let AC = null, master = null;
function initAudio() {
  if (AC || S.muted) return;
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = 0.9;
    const delay = AC.createDelay(); delay.delayTime.value = 0.32;
    const fb = AC.createGain(); fb.gain.value = 0.38;
    const wet = AC.createGain(); wet.gain.value = 0.5;
    master.connect(AC.destination);
    master.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(AC.destination);
    // a very quiet two-note drone that breathes; each zone tunes it lower
    Z.drone.forEach((f, i) => {
      const v = i ? 0.012 : 0.018;
      const o = AC.createOscillator(), g = AC.createGain(), lfo = AC.createOscillator(), lg = AC.createGain();
      o.frequency.value = f; g.gain.value = v; lfo.frequency.value = 0.07 + Math.random() * 0.05; lg.gain.value = v * 0.8;
      lfo.connect(lg); lg.connect(g.gain); o.connect(g); g.connect(AC.destination); o.start(); lfo.start();
      drone.push(o);
    });
  } catch { AC = null; }
}
const drone = [];
// glide the drone to a zone's notes over a few seconds
function setDrone(z) {
  if (AC) drone.forEach((o, i) => o.frequency.setTargetAtTime(z.drone[i], AC.currentTime, 1.5));
}
const PENT = [0, 3, 5, 7, 10];
const pent = i => 220 * Math.pow(2, (Math.floor(i / 5) * 12 + PENT[i % 5]) / 12);
function chime(freq, vol = 0.05, dur = 1.2, type = "sine", delay = 0) {
  if (!AC || S.muted) return;
  const t = AC.currentTime + delay;
  const o = AC.createOscillator(), o2 = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.value = freq; o2.type = "triangle"; o2.frequency.value = freq * 2.005;
  const g2 = AC.createGain(); g2.gain.value = 0.25;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); o2.connect(g2); g2.connect(g); g.connect(master);
  o.start(t); o2.start(t); o.stop(t + dur); o2.stop(t + dur);
}
const arpeggio = (steps, vol) => steps.forEach((s, i) => chime(pent(s), vol, 1.6, "sine", i * 0.08));
