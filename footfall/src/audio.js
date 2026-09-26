/* Sound: soft plucked notes on a pentatonic scale through a short echo, and the
 * sea as slowly breathing filtered noise.  The context starts on the first tap. */
"use strict";

let AC = null, master = null;
function initAudio() {
  if (AC || PROFILE.muted) return;
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = 0.8;
    const delay = AC.createDelay(); delay.delayTime.value = 0.27;
    const fb = AC.createGain(); fb.gain.value = 0.3;
    const wet = AC.createGain(); wet.gain.value = 0.35;
    master.connect(AC.destination);
    master.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(AC.destination);
    // the sea: brown-ish noise through a low-pass whose level swells
    const len = AC.sampleRate * 4, buf = AC.createBuffer(1, len, AC.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const src = AC.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = AC.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 500;
    const g = AC.createGain(); g.gain.value = 0.05;
    const lfo = AC.createOscillator(), lg = AC.createGain();
    lfo.frequency.value = 0.09; lg.gain.value = 0.035;
    lfo.connect(lg); lg.connect(g.gain);
    src.connect(lp); lp.connect(g); g.connect(AC.destination);
    src.start(); lfo.start();
  } catch { AC = null; }
}

const PENT = [0, 2, 4, 7, 9];
const pent = i => 261.63 * Math.pow(2, (Math.floor(i / 5) * 12 + PENT[((i % 5) + 5) % 5]) / 12);

// a plucked note: a fast attack, a warm triangle body and a quiet octave
function pluck(freq, vol = 0.05, dur = 0.9, delay = 0, type = "triangle") {
  if (!AC || PROFILE.muted) return;
  const t = AC.currentTime + delay;
  const o = AC.createOscillator(), o2 = AC.createOscillator(), g = AC.createGain(), g2 = AC.createGain();
  o.type = type; o.frequency.value = freq; o2.type = "sine"; o2.frequency.value = freq * 2;
  g2.gain.value = 0.3;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); o2.connect(g2); g2.connect(g); g.connect(master);
  o.start(t); o2.start(t); o.stop(t + dur); o2.stop(t + dur);
}
const arp = (steps, vol = 0.045, gap = 0.07, dur = 1) => steps.forEach((s, i) => pluck(pent(s), vol, dur, i * gap));

// a short filtered noise burst (a chop, a thud)
function thud(freq = 300, vol = 0.12, dur = 0.12) {
  if (!AC || PROFILE.muted) return;
  const len = Math.floor(AC.sampleRate * dur), buf = AC.createBuffer(1, len, AC.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = AC.createBufferSource(); src.buffer = buf;
  const f = AC.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = 1.2;
  const g = AC.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(master); src.start();
}

const sfx = {
  click: () => pluck(pent(7), 0.025, 0.25),
  build: () => { thud(220, 0.14); arp([5, 7, 9], 0.035, 0.05, 0.7); },
  chop: () => { thud(900, 0.1, 0.08); thud(500, 0.08, 0.1); },
  nope: () => { pluck(pent(1), 0.03, 0.3, 0, "square"); pluck(pent(0), 0.03, 0.4, 0.08, "square"); },
  dayStart: () => arp([3, 5, 7, 10], 0.035, 0.1, 1.4),
  work: () => arp([7, 9, 12], 0.03, 0.06, 0.8),
  night: () => { pluck(pent(0), 0.035, 2.4, 0, "sine"); pluck(pent(4), 0.03, 2.4, 0.15, "sine"); pluck(pent(7), 0.025, 2.4, 0.3, "sine"); },
  arrive: () => arp([10, 12, 14], 0.035, 0.06, 1),
  path: () => arp([5, 9, 12, 14, 17], 0.035, 0.09, 1.4),
  page: () => pluck(pent(9), 0.025, 0.5),
  milestone: () => arp([5, 7, 9, 12, 14, 17, 19], 0.045, 0.08, 1.8),
};
