/* ------------------------------------------------------------------
 * audio.js -- Chiptune ohne Dateien.
 *
 * Alles wird zur Laufzeit aus Rechteck- und Dreieckschwingungen
 * gebaut, damit das Spiel eine einzelne HTML-Datei plus Skripte bleibt
 * und offline genauso klingt wie online.
 * ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var ctx = null;
  var master = null;
  var an = true;

  /* Halbtonabstaende einer Durtonleiter, Basis A3. */
  function note(halbton) {
    return 220 * Math.pow(2, halbton / 12);
  }

  function start() {
    if (ctx) return ctx;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
    return ctx;
  }

  /* Browser starten den Audiokontext erst nach einer echten Eingabe.
   * Deshalb wird bei jedem Ton geweckt statt beim Laden. */
  function wecke() {
    if (!ctx) start();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function ton(opts) {
    if (!an) return;
    var c = wecke();
    if (!c) return;

    var t0 = c.currentTime + (opts.nach || 0);
    var dauer = opts.dauer || 0.09;
    var osc = c.createOscillator();
    var gain = c.createGain();

    osc.type = opts.typ || 'square';
    osc.frequency.setValueAtTime(opts.hz, t0);
    if (opts.bisHz) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.bisHz), t0 + dauer);
    }

    var spitze = opts.laut === undefined ? 0.5 : opts.laut;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(spitze, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dauer);

    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dauer + 0.02);
  }

  function rauschen(opts) {
    if (!an) return;
    var c = wecke();
    if (!c) return;
    var dauer = opts.dauer || 0.12;
    var laenge = Math.floor(c.sampleRate * dauer);
    var puffer = c.createBuffer(1, laenge, c.sampleRate);
    var daten = puffer.getChannelData(0);
    for (var i = 0; i < laenge; i++) {
      daten[i] = (Math.random() * 2 - 1) * (1 - i / laenge);
    }
    var quelle = c.createBufferSource();
    quelle.buffer = puffer;
    var filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = opts.hz || 1200;
    var gain = c.createGain();
    gain.gain.value = opts.laut === undefined ? 0.25 : opts.laut;
    quelle.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    quelle.start(c.currentTime + (opts.nach || 0));
  }

  var SFX = {
    /* Kachel kommt in die Auswahl -- Tonhoehe steigt mit der Laenge,
     * damit man den Zug auch hoert und nicht nur sieht. */
    waehlen: function (index) {
      ton({ hz: note(Math.min(24, index * 2)), dauer: 0.055, laut: 0.32 });
    },
    abwaehlen: function (index) {
      ton({ hz: note(Math.max(0, index * 2 - 3)), dauer: 0.045, laut: 0.22, typ: 'triangle' });
    },
    /* Eine Kachel dreht sich um. */
    dreh: function (index) {
      ton({ hz: note(12 + index * 2), dauer: 0.07, laut: 0.3, typ: 'square' });
      rauschen({ hz: 2400, dauer: 0.05, laut: 0.08, nach: 0.01 });
    },
    /* Wort aus dem Gewinnplan. */
    treffer: function () {
      [0, 4, 7, 12, 16].forEach(function (h, i) {
        ton({ hz: note(12 + h), dauer: 0.16, laut: 0.4, nach: i * 0.055, typ: 'square' });
      });
    },
    /* Wort, das nicht im Gewinnplan stand, aber trotzdem zaehlt. */
    extra: function () {
      [0, 7].forEach(function (h, i) {
        ton({ hz: note(12 + h), dauer: 0.11, laut: 0.3, nach: i * 0.06, typ: 'triangle' });
      });
    },
    /* Kein Wort. Kurz, tief, unmissverstaendlich. */
    fehler: function () {
      ton({ hz: 150, bisHz: 70, dauer: 0.2, laut: 0.35, typ: 'sawtooth' });
    },
    /* Wort war schon gefunden -- kein Fehler, aber auch kein Gewinn. */
    schon: function () {
      ton({ hz: 320, dauer: 0.07, laut: 0.22, typ: 'triangle' });
      ton({ hz: 300, dauer: 0.09, laut: 0.2, typ: 'triangle', nach: 0.08 });
    },
    muenze: function (i) {
      ton({ hz: note(24), dauer: 0.03, laut: 0.14, nach: (i || 0) * 0.02, typ: 'square' });
    },
    knopf: function () {
      ton({ hz: 520, dauer: 0.04, laut: 0.28, typ: 'square' });
    },
    /* Auftrag erledigt. */
    fanfare: function () {
      [0, 4, 7, 12, 7, 12, 16, 19].forEach(function (h, i) {
        ton({ hz: note(12 + h), dauer: 0.18, laut: 0.42, nach: i * 0.1, typ: 'square' });
      });
    },
    spicken: function () {
      ton({ hz: note(19), bisHz: note(31), dauer: 0.25, laut: 0.25, typ: 'triangle' });
    }
  };

  global.Klang = {
    sfx: SFX,
    wecke: wecke,
    get an() { return an; },
    set an(wert) {
      an = !!wert;
      if (an) wecke();
    }
  };
})(window);
