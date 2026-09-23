/* ------------------------------------------------------------------
 * board.js -- Brett bauen und Brett durchsuchen.
 *
 * Das Brett entsteht rueckwaerts: zuerst werden die gesuchten Woerter
 * als gerade Strecken hineingelegt (acht Richtungen, keine Knicke,
 * Kreuzungen auf gleichen Buchstaben je nach Auftrag verboten, erlaubt
 * oder gesucht), danach wird der Rest mit gewichteten Zufallsbuchstaben
 * aufgefuellt. So ist garantiert, dass jeder Auftrag ueberhaupt loesbar
 * ist.
 *
 * Was ein Auftrag ausser Brettgroesse und Worten noch mitbringen darf,
 * ist die Schwierigkeit: `richtungen`, `neueRichtung`, `kreuzen`,
 * `koeder` und `dichte`. Welcher Auftrag was bekommt, entscheidet die
 * Stufenleiter in words.js -- hier wird es nur gebaut.
 *
 * Gerade Strecken heisst auch: ein Wort kann rueckwaerts im Brett
 * liegen. Dann wird es eben von hinten nach vorne gezogen -- gelesen
 * wird immer in Zugrichtung.
 * ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var MAX_WORTLAENGE = 9;   /* Laengengrenze fuer die Suche */

  /* Im Uhrzeigersinn ab Osten, passend zum Winkel beim Einrasten. */
  var RICHTUNGEN = [
    [1, 0], [1, 1], [0, 1], [-1, 1],
    [-1, 0], [-1, -1], [0, -1], [1, -1]
  ];

  /* Ein Auftrag darf die Richtungen einschraenken, in denen seine Worte
   * liegen duerfen. Der Kindermodus nimmt nur 'rechts'. */
  var RICHTUNGSNAMEN = {
    rechts: 0, rechtsrunter: 1, runter: 2, linksrunter: 3,
    links: 4, linksrauf: 5, rauf: 6, rechtsrauf: 7
  };

  function erlaubteRichtungen(auftrag) {
    if (!auftrag.richtungen || !auftrag.richtungen.length) return RICHTUNGEN;
    return auftrag.richtungen.map(function (name) {
      var i = RICHTUNGSNAMEN[name];
      if (i === undefined) throw new Error('Unbekannte Richtung: ' + name);
      return RICHTUNGEN[i];
    });
  }

  /* Kleiner, schneller, aussaatfaehiger Zufall (mulberry32). Gleiche
   * Saat = gleiches Brett, praktisch zum Nachstellen von Fehlern. */
  function zufall(saat) {
    var a = saat >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function mische(liste, rng) {
    for (var i = liste.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = liste[i]; liste[i] = liste[j]; liste[j] = tmp;
    }
    return liste;
  }

  /* Nachbarn in acht Richtungen, als flache Indizes. */
  function nachbarnTabelle(spalten, zeilen) {
    var tabelle = new Array(spalten * zeilen);
    for (var y = 0; y < zeilen; y++) {
      for (var x = 0; x < spalten; x++) {
        var liste = [];
        for (var dy = -1; dy <= 1; dy++) {
          for (var dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            var nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= spalten || ny >= zeilen) continue;
            liste.push(ny * spalten + nx);
          }
        }
        tabelle[y * spalten + x] = liste;
      }
    }
    return tabelle;
  }

  function sindBenachbart(a, b, spalten) {
    var ax = a % spalten, ay = Math.floor(a / spalten);
    var bx = b % spalten, by = Math.floor(b / spalten);
    var dx = Math.abs(ax - bx), dy = Math.abs(ay - by);
    return (dx <= 1 && dy <= 1) && (dx + dy > 0);
  }

  /* Die Felder einer geraden Strecke, oder null, wenn sie ueber den
   * Rand laeuft. */
  function strecke(start, richtung, laenge, spalten, zeilen) {
    var x = start % spalten;
    var y = Math.floor(start / spalten);
    var felder = [];
    for (var i = 0; i < laenge; i++) {
      if (x < 0 || y < 0 || x >= spalten || y >= zeilen) return null;
      felder.push(y * spalten + x);
      x += richtung[0];
      y += richtung[1];
    }
    return felder;
  }

  /* Sucht eine Strecke fuer ein Wort. Alle Kombinationen aus Start und
   * Richtung werden gemischt durchprobiert: wenn ueberhaupt ein Platz
   * frei ist, wird er auch gefunden.
   *
   * `kreuzen` sagt, ob das Wort belegte Felder mitbenutzen darf, wenn
   * dort schon der passende Buchstabe liegt:
   *   false   nie -- jedes Wort hat seine eigenen Kacheln,
   *   true    wo es sich zufaellig ergibt,
   *   'mehr'  wo immer es geht: von allen Plaetzen gewinnt der mit den
   *           meisten geteilten Kacheln. Das macht das Brett zum Knoten.
   * Ganz auf einem anderen Wort darf ein Wort nie liegen -- ARM mitten
   * in ALARM waere kein zweiter Fund, sondern derselbe. */
  function findePfad(wort, buchstaben, spalten, zeilen, rng, richtungen, kreuzen) {
    richtungen = richtungen || RICHTUNGEN;
    var kandidaten = [];
    for (var feld = 0; feld < buchstaben.length; feld++) {
      for (var r = 0; r < richtungen.length; r++) kandidaten.push([feld, r]);
    }
    mische(kandidaten, rng);

    var bester = null;
    var besteTeile = -1;

    for (var k = 0; k < kandidaten.length; k++) {
      var felder = strecke(kandidaten[k][0], richtungen[kandidaten[k][1]],
                           wort.length, spalten, zeilen);
      if (!felder) continue;

      var passt = true;
      var geteilt = 0;
      for (var i = 0; i < felder.length; i++) {
        var da = buchstaben[felder[i]];
        if (da === null) continue;
        if (da !== wort[i] || kreuzen === false) { passt = false; break; }
        geteilt++;
      }
      if (!passt || geteilt === felder.length) continue;
      if (kreuzen !== 'mehr') return felder;
      if (geteilt > besteTeile) {
        bester = felder;
        besteTeile = geteilt;
      }
    }
    return bester;
  }

  /*
   * Koeder: der Anfang eines gesuchten Wortes, ohne seinen letzten
   * Buchstaben, auf freie Felder gelegt. Wer KASS liest, zieht los --
   * und muss erst merken, dass dort kein E folgt. Koeder teilen sich
   * keine Kachel mit einem Wort; sie sollen falsche Faehrten sein, keine
   * Abkuerzungen.
   */
  function legeKoeder(anzahl, worte, buchstaben, spalten, zeilen, rng, richtungen) {
    for (var i = 0; i < anzahl; i++) {
      var wort = worte[Math.floor(rng() * worte.length)];
      var stueck = wort.slice(0, Math.max(2, wort.length - 1));
      var pfad = findePfad(stueck, buchstaben, spalten, zeilen, rng, richtungen, false);
      if (!pfad) continue;
      for (var j = 0; j < pfad.length; j++) buchstaben[pfad[j]] = stueck[j];
    }
  }

  /*
   * Baut ein Brett fuer einen Auftrag.
   * Rueckgabe: { spalten, zeilen, buchstaben[], kacheln[], pfade{wort:[idx]} }
   */
  function baue(auftrag, saat) {
    var spalten = auftrag.spalten;
    var zeilen = auftrag.zeilen;
    var felder = spalten * zeilen;
    var nachbarn = nachbarnTabelle(spalten, zeilen);
    var richtungen = erlaubteRichtungen(auftrag);
    /* Fuehrt ein Auftrag eine Richtung neu ein, muss sie auch vorkommen:
     * eine angekuendigte Neuerung, die der Zufall weglaesst, waere keine.
     * Das laengste Wort bekommt sie, solange das Brett noch leer ist. */
    var neueRichtung = auftrag.neueRichtung
      ? erlaubteRichtungen({ richtungen: [auftrag.neueRichtung] })
      : null;

    /* Lange Woerter zuerst: die haben die wenigsten Moeglichkeiten und
     * sollen sich das Brett aussuchen duerfen, solange es leer ist. */
    var reihenfolge = auftrag.worte.slice().sort(function (a, b) {
      return b.length - a.length;
    });

    /* Die Fuellkacheln eines dichten Bretts kommen zum Teil aus den
     * gesuchten Woertern selbst. Dann liegen ueberall dieselben Bilder
     * wie im Gewinnplan, und das Auge findet keinen Anker mehr. */
    var dichte = auftrag.dichte || 0;
    var zielBuchstaben = auftrag.worte.join('');

    var buchstaben = null;
    var pfade = null;

    for (var versuch = 0; versuch < 400; versuch++) {
      var rng = zufall((saat || 1) * 7919 + versuch * 104729);
      buchstaben = new Array(felder).fill(null);
      pfade = {};
      var geschafft = true;

      for (var w = 0; w < reihenfolge.length; w++) {
        var wort = reihenfolge[w];
        var pfad = findePfad(wort, buchstaben, spalten, zeilen, rng,
          w === 0 && neueRichtung ? neueRichtung : richtungen, auftrag.kreuzen);
        if (!pfad) { geschafft = false; break; }
        for (var i = 0; i < pfad.length; i++) buchstaben[pfad[i]] = wort[i];
        pfade[wort] = pfad;
      }

      if (geschafft) {
        var fuellRng = zufall((saat || 1) * 31 + versuch);
        legeKoeder(auftrag.koeder || 0, reihenfolge, buchstaben,
          spalten, zeilen, fuellRng, richtungen);
        for (var f = 0; f < felder; f++) {
          if (buchstaben[f] !== null) continue;
          buchstaben[f] = fuellRng() < dichte
            ? zielBuchstaben[Math.floor(fuellRng() * zielBuchstaben.length)]
            : global.EmojiAlphabet.randomLetter(fuellRng);
        }
        break;
      }
      buchstaben = null;
    }

    if (!buchstaben) return null;

    /* Jetzt erst die Bilder. Zwei gleiche Emojis direkt nebeneinander
     * sehen nach Fehler aus, also wird dafuer neu gewuerfelt. */
    var bildRng = zufall((saat || 1) * 2654435761);
    var kacheln = new Array(felder);
    for (var k = 0; k < felder; k++) {
      var kachel = null;
      for (var t = 0; t < 8; t++) {
        kachel = global.EmojiAlphabet.tileFor(buchstaben[k], bildRng);
        var kollision = nachbarn[k].some(function (n) {
          return kacheln[n] && kacheln[n].emoji === kachel.emoji;
        });
        if (!kollision) break;
      }
      kacheln[k] = kachel;
    }

    return {
      spalten: spalten,
      zeilen: zeilen,
      buchstaben: buchstaben,
      kacheln: kacheln,
      pfade: pfade,
      nachbarn: nachbarn
    };
  }

  /* ---------------------------------------------------------------- */

  var trie = null;
  var trieQuelle = null;

  function baueTrie(woerter) {
    var wurzel = {};
    woerter.forEach(function (wort) {
      if (wort.length > MAX_WORTLAENGE) return;
      var knoten = wurzel;
      for (var i = 0; i < wort.length; i++) {
        var c = wort[i];
        knoten = knoten[c] || (knoten[c] = {});
      }
      knoten.$ = true;
    });
    return wurzel;
  }

  /* Alle Woerter, die auf diesem Brett ueberhaupt zu finden sind: von
   * jedem Feld aus acht Strahlen entlang, solange der Trie mitspielt.
   * Laeuft einmal pro Auftrag und dient nur der Anzeige "x von y".
   *
   * Vorwaerts und rueckwaerts sind hier zwei verschiedene Strahlen, also
   * findet ein Durchlauf beide Leserichtungen von selbst. */
  function alleLoesungen(brett, woerterbuch) {
    /* Der Trie wird an seinem Woerterbuch festgehalten, nicht bloss
     * einmal gebaut: ein Sprachwechsel schiebt ein anderes hier herein,
     * und mit dem alten Trie faende der Loeser dann deutsche Woerter in
     * einem englischen Brett. */
    if (!trie || trieQuelle !== woerterbuch) {
      trie = baueTrie(Array.from(woerterbuch));
      trieQuelle = woerterbuch;
    }

    var gefunden = new Set();
    var spalten = brett.spalten;
    var zeilen = brett.zeilen;

    for (var start = 0; start < brett.buchstaben.length; start++) {
      for (var r = 0; r < RICHTUNGEN.length; r++) {
        var richtung = RICHTUNGEN[r];
        var x = start % spalten;
        var y = Math.floor(start / spalten);
        var knoten = trie;
        var wort = '';

        for (var schritt = 0; schritt < MAX_WORTLAENGE; schritt++) {
          if (x < 0 || y < 0 || x >= spalten || y >= zeilen) break;
          var c = brett.buchstaben[y * spalten + x];
          knoten = knoten[c];
          if (!knoten) break;
          wort += c;
          if (knoten.$ && wort.length >= 3) gefunden.add(wort);
          x += richtung[0];
          y += richtung[1];
        }
      }
    }
    return gefunden;
  }

  /* Liest den Buchstabenzug eines Pfades ab. */
  function wortAusPfad(brett, pfad) {
    var s = '';
    for (var i = 0; i < pfad.length; i++) s += brett.buchstaben[pfad[i]];
    return s;
  }

  global.Brett = {
    baue: baue,
    alleLoesungen: alleLoesungen,
    wortAusPfad: wortAusPfad,
    sindBenachbart: sindBenachbart,
    strecke: strecke,
    zufall: zufall,
    RICHTUNGEN: RICHTUNGEN,
    MAX_WORTLAENGE: MAX_WORTLAENGE
  };
})(window);
