/* ------------------------------------------------------------------
 * pixelfont.js -- eine 5x7-Bitmapschrift, gezeichnet auf <canvas>.
 *
 * Die Oberflaeche soll wie ein Automat von 1987 aussehen, und Webfonts
 * sind unzuverlaessig, wenn die Seite direkt von der Festplatte geoeffnet
 * wird. Also werden die Buchstaben aus Bitmaps gezeichnet: jede Glyphe
 * besteht aus sieben Zeilen zu fuenf Bit, niedrigstes Bit = rechts.
 *
 * Die Zelle ist 9 Zeilen hoch: Zeile 0-1 ist Platz fuer Umlautpunkte,
 * der Buchstabe selbst sitzt auf Zeile 2-8. So bleibt die Grundlinie
 * gleich, egal ob "MENU" oder "MENUE" mit Umlaut gesetzt wird.
 * ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var GLYPHS = {
    'A': [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
    'B': [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
    'C': [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
    'D': [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
    'E': [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
    'F': [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
    'G': [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
    'H': [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
    'I': [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
    'J': [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
    'K': [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
    'L': [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
    'M': [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
    'N': [0x11, 0x19, 0x19, 0x15, 0x13, 0x13, 0x11],
    'O': [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
    'P': [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
    'Q': [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
    'R': [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
    'S': [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
    'T': [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
    'U': [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
    'V': [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
    'W': [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
    'X': [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
    'Y': [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
    'Z': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
    'ß': [0x0c, 0x12, 0x12, 0x1c, 0x12, 0x12, 0x1c],
    '0': [0x0e, 0x13, 0x13, 0x15, 0x19, 0x19, 0x0e],
    '1': [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
    '2': [0x0e, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1f],
    '3': [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
    '4': [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
    '5': [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
    '6': [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
    '7': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
    '8': [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
    '9': [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
    ' ': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    '-': [0x00, 0x00, 0x00, 0x1f, 0x00, 0x00, 0x00],
    /* Gedanken- und Geviertstrich sehen bei fuenf Pixeln Breite aus wie
     * der Bindestrich -- Hauptsache, sie fallen nicht als "?" auf. */
    '–': [0x00, 0x00, 0x00, 0x1f, 0x00, 0x00, 0x00],
    '—': [0x00, 0x00, 0x00, 0x1f, 0x00, 0x00, 0x00],
    '+': [0x00, 0x04, 0x04, 0x1f, 0x04, 0x04, 0x00],
    '=': [0x00, 0x00, 0x1f, 0x00, 0x1f, 0x00, 0x00],
    '_': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1f],
    '.': [0x00, 0x00, 0x00, 0x00, 0x00, 0x0c, 0x0c],
    ',': [0x00, 0x00, 0x00, 0x00, 0x0c, 0x04, 0x08],
    ':': [0x00, 0x0c, 0x0c, 0x00, 0x0c, 0x0c, 0x00],
    '!': [0x04, 0x04, 0x04, 0x04, 0x04, 0x00, 0x04],
    '?': [0x0e, 0x11, 0x01, 0x02, 0x04, 0x00, 0x04],
    "'": [0x04, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00],
    '/': [0x01, 0x01, 0x02, 0x04, 0x08, 0x10, 0x10],
    '(': [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
    ')': [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
    '[': [0x0e, 0x08, 0x08, 0x08, 0x08, 0x08, 0x0e],
    ']': [0x0e, 0x02, 0x02, 0x02, 0x02, 0x02, 0x0e],
    '<': [0x01, 0x02, 0x04, 0x08, 0x04, 0x02, 0x01],
    '>': [0x10, 0x08, 0x04, 0x02, 0x04, 0x08, 0x10],
    '*': [0x00, 0x15, 0x0e, 0x1f, 0x0e, 0x15, 0x00],
    '#': [0x0a, 0x1f, 0x0a, 0x0a, 0x1f, 0x0a, 0x00],
    '%': [0x11, 0x01, 0x02, 0x04, 0x08, 0x10, 0x11],
    '↓': [0x04, 0x04, 0x04, 0x04, 0x15, 0x0e, 0x04],
    '·': [0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00],
    '•': [0x00, 0x0e, 0x1f, 0x1f, 0x1f, 0x0e, 0x00],
    '□': [0x00, 0x1f, 0x11, 0x11, 0x11, 0x1f, 0x00]
  };

  /* Umlaute erben ihre Grundform und bekommen zwei Punkte obendrauf. */
  var UMLAUT = { 'Ä': 'A', 'Ö': 'O', 'Ü': 'U' };
  var DOTS = 0x0a;

  var GW = 5;          /* Glyphenbreite in Fontpixeln */
  var GH = 7;          /* Hoehe der Grundform         */
  var TOP = 2;         /* Zeilen ueber der Grundform  */
  var CELL_H = GH + TOP;

  function baseFor(ch) {
    var up = ch.toUpperCase();
    if (UMLAUT[up]) return GLYPHS[UMLAUT[up]];
    return GLYPHS[up] || GLYPHS[ch] || GLYPHS['?'];
  }

  function hasDots(ch) {
    return !!UMLAUT[ch.toUpperCase()];
  }

  /* Breite in Fontpixeln (nicht Bildschirmpixeln). */
  function measure(text, tracking) {
    text = String(text);
    if (!text.length) return 0;
    var t = (tracking === undefined) ? 1 : tracking;
    return text.length * GW + (text.length - 1) * t;
  }

  /*
   * Bricht `text` an den Leerzeichen um, so dass keine Zeile breiter
   * wird als `maxFontPx` Fontpixel. Weil jede Glyphe gleich breit ist,
   * reicht dafuer eine Zeichenzahl -- kein Nachmessen Wort fuer Wort.
   *
   * Ein Wort, das allein schon nicht passt, wird hart getrennt: eine
   * haessliche Trennung ist immer noch besser als eine Zeile, die aus
   * dem Bildschirm laeuft.
   */
  function wrap(text, maxFontPx, tracking) {
    var t = (tracking === undefined) ? 1 : tracking;
    var proZeile = Math.max(1, Math.floor((maxFontPx + t) / (GW + t)));
    var zeilen = [];

    String(text).split(/\s+/).forEach(function (wort) {
      if (!wort) return;
      while (wort.length > proZeile) {
        zeilen.push(wort.slice(0, proZeile));
        wort = wort.slice(proZeile);
      }
      if (!wort.length) return;
      var letzte = zeilen.length - 1;
      if (letzte >= 0 && zeilen[letzte].length + 1 + wort.length <= proZeile) {
        zeilen[letzte] += ' ' + wort;
      } else {
        zeilen.push(wort);
      }
    });

    return zeilen.length ? zeilen : [''];
  }

  /*
   * Zeichnet `text` in ein frisches Canvas.
   *   scale     Bildschirmpixel pro Fontpixel        (Vorgabe 3)
   *   color     Farbe der gesetzten Pixel            (Vorgabe Gold)
   *   tracking  Fontpixel zwischen den Glyphen       (Vorgabe 1)
   *   shadow    Farbe eines 1px-Schlagschattens      (Vorgabe keiner)
   *   strike    waagerechter Balken durch den Text   (Vorgabe false)
   *   box       'full' = 9 Zeilen (Umlaute passen),
   *             'base' = nur die 7 Zeilen der Grundform
   */
  function render(text, opts) {
    opts = opts || {};
    var scale = opts.scale || 3;
    var color = opts.color || '#ffd23f';
    var tracking = (opts.tracking === undefined) ? 1 : opts.tracking;
    var shadow = opts.shadow || null;
    var pad = (opts.pad === undefined) ? 0 : opts.pad;
    var base = opts.box === 'base';

    text = String(text);
    var wpx = measure(text, tracking);
    var hpx = base ? GH : CELL_H;
    var top = base ? 0 : TOP;
    var off = shadow ? 1 : 0;

    var cv = document.createElement('canvas');
    cv.width = Math.max(1, (wpx + off + pad * 2) * scale);
    cv.height = Math.max(1, (hpx + off + pad * 2) * scale);
    var ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    function stamp(dx, dy, fill) {
      ctx.fillStyle = fill;
      var penX = pad + dx;
      for (var i = 0; i < text.length; i++) {
        var ch = text[i];
        var rows = baseFor(ch);
        for (var r = 0; r < GH; r++) {
          var bits = rows[r];
          if (!bits) continue;
          for (var c = 0; c < GW; c++) {
            if (bits & (1 << (GW - 1 - c))) {
              ctx.fillRect((penX + c) * scale, (pad + dy + top + r) * scale, scale, scale);
            }
          }
        }
        if (!base && hasDots(ch)) {
          for (var d = 0; d < GW; d++) {
            if (DOTS & (1 << (GW - 1 - d))) {
              ctx.fillRect((penX + d) * scale, (pad + dy) * scale, scale, scale);
            }
          }
        }
        penX += GW + tracking;
      }
    }

    if (shadow) stamp(1, 1, shadow);
    stamp(0, 0, color);

    if (opts.strike) {
      ctx.fillStyle = opts.strikeColor || color;
      ctx.fillRect(0, (pad + top + 3) * scale, (wpx + off) * scale, scale);
    }

    cv.className = 'pf' + (opts.className ? ' ' + opts.className : '');
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', opts.label !== undefined ? opts.label : text);

    /* Das Canvas merkt sich, woraus es entstanden ist. Auf engen
     * Bildschirmen wird eine Zeile spaeter neu gesetzt, und dazu
     * braucht es die Vorlage -- aus Pixeln liest sie niemand zurueck. */
    cv.pfText = text;
    cv.pfOpts = opts;
    return cv;
  }

  /* Ersetzt den Inhalt eines Elements durch gesetzten Text. */
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
    GLYPHS: GLYPHS,
    UMLAUT: UMLAUT,
    CELL_W: GW,
    CELL_H: CELL_H,
    BASE_H: GH
  };
})(window);
