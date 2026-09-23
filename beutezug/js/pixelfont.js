/* ------------------------------------------------------------------
 * pixelfont.js -- glatte Canvas-Schrift ohne externe Schriftdateien.
 *
 * Der historische API-Name bleibt, damit Anzeige und Umbruch dieselbe
 * Messung nutzen. Systemschriften funktionieren auch direkt per file://.
 * ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var SCHRIFT = '800 8px Arial, Helvetica, sans-serif';
  var messung;
  var breiten = {};

  function kontext() {
    if (!messung) {
      messung = document.createElement('canvas').getContext('2d');
      messung.font = SCHRIFT;
    }
    return messung;
  }

  function breite(zeichen) {
    if (breiten[zeichen] === undefined) {
      breiten[zeichen] = kontext().measureText(zeichen).width;
    }
    return breiten[zeichen];
  }

  function abstand(tracking) {
    return (tracking === undefined ? 1 : tracking) * 0.3;
  }

  function measure(text, tracking) {
    text = String(text).toUpperCase();
    var summe = 0;
    for (var i = 0; i < text.length; i++) summe += breite(text.charAt(i));
    return summe + Math.max(0, text.length - 1) * abstand(tracking);
  }

  function wrap(text, maxFontPx, tracking) {
    var zeilen = [];
    var aktuell = '';
    String(text).split(/\s+/).forEach(function (wort) {
      if (!wort) return;
      var versuch = aktuell ? aktuell + ' ' + wort : wort;
      if (measure(versuch, tracking) <= maxFontPx) {
        aktuell = versuch;
        return;
      }
      if (aktuell) zeilen.push(aktuell);
      aktuell = '';
      while (wort && measure(wort, tracking) > maxFontPx) {
        var ende = 1;
        while (ende < wort.length && measure(wort.slice(0, ende + 1), tracking) <= maxFontPx) ende++;
        zeilen.push(wort.slice(0, ende));
        wort = wort.slice(ende);
      }
      aktuell = wort;
    });
    if (aktuell) zeilen.push(aktuell);
    return zeilen.length ? zeilen : [''];
  }

  function render(text, opts) {
    opts = opts || {};
    text = String(text);
    var anzeige = text.toUpperCase();
    var skala = opts.scale || 3;
    var polster = opts.pad || 0;
    var schatten = opts.shadow ? 1 : 0;
    var grundform = opts.box === 'base';
    var hoehe = grundform ? 7 : 10;
    var weite = measure(text, opts.tracking);
    var w = Math.max(1, Math.ceil((weite + schatten + polster * 2) * skala));
    var h = Math.max(1, Math.ceil((hoehe + schatten + polster * 2) * skala));
    var dichte = global.devicePixelRatio || 1;
    var cv = document.createElement('canvas');
    cv.width = Math.ceil(w * dichte);
    cv.height = Math.ceil(h * dichte);
    cv.style.setProperty('--schrift-breite', w + 'px');
    var ctx = cv.getContext('2d');
    ctx.scale(dichte * skala, dichte * skala);
    ctx.font = SCHRIFT;
    ctx.textBaseline = 'alphabetic';

    function zeichne(dx, dy, farbe) {
      ctx.fillStyle = farbe;
      var x = polster + dx;
      for (var i = 0; i < anzeige.length; i++) {
        var zeichen = anzeige.charAt(i);
        ctx.fillText(zeichen, x, polster + dy + (grundform ? 6.4 : 8));
        x += breite(zeichen) + abstand(opts.tracking);
      }
    }

    if (opts.shadow) zeichne(0.5, 0.5, opts.shadow);
    zeichne(0, 0, opts.color || '#ffd23f');
    if (opts.strike) {
      ctx.fillStyle = opts.strikeColor || opts.color || '#ffd23f';
      ctx.fillRect(polster, polster + (grundform ? 3.4 : 5), weite, 0.6);
    }

    cv.className = 'pf' + (opts.className ? ' ' + opts.className : '');
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', opts.label !== undefined ? opts.label : text);
    cv.pfText = text;
    cv.pfOpts = opts;
    return cv;
  }

  function write(el, text, opts) {
    if (!el) return null;
    var cv = render(text, opts);
    el.textContent = '';
    el.appendChild(cv);
    return cv;
  }

  global.PixelFont = {
    render: render,
    write: write,
    measure: measure,
    wrap: wrap,
    CELL_W: 5,
    CELL_H: 10,
    BASE_H: 7
  };
})(window);
