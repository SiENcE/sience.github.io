/* ------------------------------------------------------------------
 * game.js -- Spielablauf, Eingabe, Anzeige.
 *
 * Ein Zug besteht aus drei Dingen: ein Pfad wird gezogen, der Pfad
 * ergibt einen Buchstabenzug, und der Buchstabenzug wird gegen das
 * Woerterbuch gehalten. Alles andere hier ist Anzeige drumherum.
 * ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var PF = global.PixelFont;
  var Klang = global.Klang;
  var Woerter = global.Woerter;
  var Brett = global.Brett;

  var GOLD = '#ffd23f';
  var GOLD_MATT = '#9a7a26';
  var CYAN = '#5ce1ff';
  var ROT = '#ff4d6d';
  var CREME = '#eaf7d8';

  /* Jedes gefundene Wort bekommt eine eigene Umrandung, damit man auf
   * dem vollen Brett noch sieht, welche Kachel zu welchem Fund gehoert. */
  var WORTFARBEN = [
    '#ff4fd8', '#5ce1ff', '#ffd23f', '#7cff6b', '#ff9f45',
    '#b78bff', '#ff6b6b', '#5bffd0', '#ffe66d', '#77b6ff'
  ];

  var NAME = 'BEUTEZUG';
  var KOSTEN = { fehler: 5, tipp: 25, spicken: 10 };
  var SPEICHER = 'beutezug-v1';

  var el = {};
  var S = null;      /* der laufende Auftrag   */
  var L = null;      /* der laufende Beutezug  */

  /* ---------------------------------------------------------------- */
  /* Der Beutezug                                                      */
  /*                                                                   */
  /* Ein Auftrag allein ist keine Leistung -- erst die Serie ist eine. */
  /* Die Auszahlung wandert nach jedem geschafften Auftrag in den Topf */
  /* und bleibt dort im Risiko: weitermachen bringt mehr, kostet aber  */
  /* mehr, und wer den Topf leer wirtschaftet, fliegt mit nichts raus. */

  function neuerBeutezug(leicht) {
    L = {
      topf: 0,
      auftraege: 0,
      beginn: Date.now(),
      vorbei: false,
      leicht: !!leicht
    };
    starteLevel(0);
  }

  /* Was gerade auf dem Spiel steht: gesicherte Beute plus das, was im
   * laufenden Auftrag schon zusammengekommen ist. */
  function topf() {
    return L.topf + (S ? S.punkte : 0);
  }

  /* Die Gebühren wachsen mit jedem Auftrag. Genau daraus entsteht die
   * Entscheidung am Ende eines Auftrags: noch einer, oder abhauen? */
  function gebuehrenFaktor() {
    return S.gebuehrenfrei ? 0 : Math.max(1, S.levelNr);
  }

  /* Kinder und Erwachsene teilen sich die Bestenliste nicht -- die
   * Zahlen entstehen unter zu verschiedenen Bedingungen. */
  function listenSchluessel() {
    return (L && L.leicht) ? 'bestenlisteKinder' : 'bestenliste';
  }

  /* ---------------------------------------------------------------- */
  /* Kleinkram                                                         */

  function $(id) { return document.getElementById(id); }

  /* Wer im System "weniger Bewegung" eingestellt hat, bekommt die
   * Zierde nicht aufgedraengt -- das Spiel funktioniert ohne sie. */
  function sparsam() {
    return !!(global.matchMedia &&
      global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function schreib(ziel, text, opts) {
    return PF.write(ziel, text, opts);
  }

  function zahl(n, stellen) {
    var s = String(Math.max(0, Math.round(n)));
    while (s.length < stellen) s = '0' + s;
    return s;
  }

  function ladeStand() {
    try {
      return JSON.parse(localStorage.getItem(SPEICHER)) || {};
    } catch (e) {
      return {};
    }
  }

  function speichereStand(stand) {
    try {
      localStorage.setItem(SPEICHER, JSON.stringify(stand));
    } catch (e) { /* privater Modus, dann eben ohne Bestenliste */ }
  }

  /* ---------------------------------------------------------------- */
  /* Level aufbauen                                                    */

  function starteLevel(nummer, saat) {
    var leicht = !!(L && L.leicht);
    var auftrag = Woerter.level(nummer, leicht);
    var brett = null;
    var versuch = 0;
    var s = saat || Math.floor(Math.random() * 1e9);

    while (!brett && versuch < 25) {
      brett = Brett.baue(auftrag, s + versuch * 7717);
      versuch++;
    }
    if (!brett) {
      /* Sollte nie passieren -- der Generator schafft alle Auftraege.
       * Falls doch, lieber ein kleineres Brett als ein leeres. */
      auftrag = Woerter.level(0, leicht);
      brett = Brett.baue(auftrag, s);
    }

    S = {
      levelNr: nummer,
      saat: s,
      auftrag: auftrag,
      brett: brett,
      loesungen: Brett.alleLoesungen(brett, Woerter.DICT),
      ziele: auftrag.worte.slice(),
      gefundenZiele: new Set(),
      gefundenExtra: new Set(),
      punkte: 0,
      abzug: 0,
      angezeigt: L ? L.topf : 0,
      leicht: leicht,
      /* Der erste Auftrag ist zum Ueben: Tipp, Spicken und Fehlgriffe
       * kosten nichts. Ab dem zweiten wird abgerechnet -- im
       * Kindermodus nie. */
      gebuehrenfrei: nummer === 0 || leicht,
      felder: brett.buchstaben.map(function () {
        return { gedreht: false, farbe: null, tipp: false, kurz: 0, nurBuchstabe: false };
      }),
      auswahl: [],
      startFeld: -1,
      zieht: false,
      spicktGerade: false,
      frisch: null,
      fertig: false
    };

    /* Erst entscheiden, welche Kacheln gar kein Bild bekommen -- das
     * Brett wird danach gebaut, nicht nachtraeglich umgedreht. */
    waehleBuchstabenkacheln();
    baueBrettDom();
    zeichneAlles();
  }

  /*
   * Im Kindermodus tragen manche Kacheln gar kein Bild, sondern gleich
   * ihren Buchstaben. Das ist die eigentliche Lernhilfe: aus K_TZE
   * laesst sich die Katze erschliessen, und beim naechsten Mal erkennt
   * man das Bild von allein. Mit jedem Auftrag werden es weniger
   * Buchstaben und mehr Bilder.
   *
   * Ein Wort wird nie vollstaendig als Buchstaben hingelegt -- sonst
   * gaebe es daran nichts mehr zu entziffern.
   */
  function waehleBuchstabenkacheln() {
    var anteil = S.auftrag.buchstabenAnteil || 0;
    if (!anteil) return;

    var felder = S.brett.buchstaben.length;
    var indizes = [];
    for (var i = 0; i < felder; i++) indizes.push(i);

    for (var j = indizes.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var t = indizes[j]; indizes[j] = indizes[k]; indizes[k] = t;
    }

    indizes.slice(0, Math.round(felder * anteil)).forEach(function (index) {
      S.felder[index].nurBuchstabe = true;
    });

    S.ziele.forEach(function (wort) {
      var pfad = S.brett.pfade[wort];
      var offen = pfad.filter(function (index) {
        return !S.felder[index].nurBuchstabe;
      });
      if (offen.length) return;
      /* Ganz ohne Bild -- eine Kachel bekommt ihr Emoji zurueck. */
      var opfer = pfad[Math.floor(Math.random() * pfad.length)];
      S.felder[opfer].nurBuchstabe = false;
    });

    /* Eine Buchstabenkachel ist nichts, was noch aufgedeckt werden
     * muesste -- fuer die uebrige Mechanik gilt sie als offen. */
    S.felder.forEach(function (feld) {
      if (feld.nurBuchstabe) feld.gedreht = true;
    });
  }

  /* ---------------------------------------------------------------- */
  /* Brett zeichnen                                                    */

  function baueBrettDom() {
    var brett = S.brett;
    /* Am Rahmen gesetzt, nicht am Gitter: der Rahmen rechnet seine
     * Maximalbreite daraus aus, das Gitter erbt die Werte. */
    el.brettRahmen.style.setProperty('--spalten', brett.spalten);
    el.brettRahmen.style.setProperty('--zeilen', brett.zeilen);

    /* Alles ausser der Zugspur raeumen -- die liegt im Gitter und soll
     * einen Auftragswechsel ueberleben. */
    Array.prototype.slice.call(el.brett.children).forEach(function (kind) {
      if (kind !== el.spur) kind.remove();
    });

    S.kachelDom = new Array(brett.buchstaben.length);

    for (var i = 0; i < brett.buchstaben.length; i++) {
      var kachel = document.createElement('div');
      kachel.className = 'kachel';
      kachel.dataset.i = i;

      var dreh = document.createElement('div');
      dreh.className = 'dreh';

      var nurBuchstabe = S.felder[i].nurBuchstabe;

      var vorne = document.createElement('div');
      vorne.className = 'seite vorne';
      if (nurBuchstabe) {
        /* Diese Kachel hat gar kein Bild -- sie zeigt von Anfang an
         * ihren Buchstaben und wird auch nie umgedreht. */
        kachel.classList.add('buchstabenkachel');
        vorne.appendChild(PF.render(brett.buchstaben[i], {
          scale: 8, color: GOLD, box: 'base', shadow: '#2b1d00'
        }));
      } else {
        vorne.textContent = brett.kacheln[i].emoji;
      }

      var hinten = document.createElement('div');
      hinten.className = 'seite hinten';
      hinten.appendChild(PF.render(brett.buchstaben[i], {
        scale: 8, color: GOLD, box: 'base', shadow: '#2b1d00'
      }));

      dreh.appendChild(vorne);
      dreh.appendChild(hinten);
      kachel.appendChild(dreh);

      /* Fuer Vorlesewerkzeuge: Bild plus Buchstabe, sonst ist die
       * Kachel nur ein sprachloses Viereck. */
      kachel.setAttribute('role', 'gridcell');
      kachel.setAttribute('aria-label', nurBuchstabe
        ? 'Buchstabe ' + brett.buchstaben[i]
        : brett.kacheln[i].name + ' – ' + brett.buchstaben[i]);

      /* Gestaffelter Einflug. Der Versatz laeuft diagonal, damit das
       * Brett von links oben nach rechts unten aufgebaut wirkt. */
      if (!sparsam()) {
        var spalte = i % brett.spalten;
        var zeile = Math.floor(i / brett.spalten);
        kachel.classList.add('rein');
        kachel.style.animationDelay = (spalte + zeile) * 22 + 'ms';
      }

      el.brett.appendChild(kachel);
      S.kachelDom[i] = kachel;
    }

    /* Die Klasse wieder abraeumen, sonst streitet sie sich spaeter mit
     * dem Anheben unter dem Zeiger. Die Liste wird festgehalten, damit
     * ein Auftragswechsel innerhalb der Frist nicht die frischen
     * Kacheln des naechsten Bretts erwischt. */
    var diese = S.kachelDom;
    setTimeout(function () {
      diese.forEach(function (k) {
        k.classList.remove('rein');
        k.style.animationDelay = '';
      });
    }, 1200);
  }

  function kachelMitte(index) {
    var k = S.kachelDom[index];
    return {
      x: k.offsetLeft + k.offsetWidth / 2,
      y: k.offsetTop + k.offsetHeight / 2
    };
  }

  /* Die Auswahl wird als eine einzige Kapsel gezeichnet: ein Rechteck
   * mit voll abgerundeten Enden, vom ersten zum letzten Feld gedreht.
   * Bei einem einzelnen Feld ergibt das einen Kreis. */
  function zeichneSpur() {
    var anzahl = S.auswahl.length;
    if (!anzahl) {
      el.spur.classList.remove('aktiv');
      return;
    }

    var a = kachelMitte(S.auswahl[0]);
    var b = kachelMitte(S.auswahl[anzahl - 1]);
    var dicke = S.kachelDom[S.auswahl[0]].offsetWidth * 0.94;
    var laenge = Math.hypot(b.x - a.x, b.y - a.y) + dicke;
    var winkel = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;

    var k = el.spurKapsel;
    k.setAttribute('x', -laenge / 2);
    k.setAttribute('y', -dicke / 2);
    k.setAttribute('width', laenge);
    k.setAttribute('height', dicke);
    k.setAttribute('rx', dicke / 2);
    k.setAttribute('transform',
      'translate(' + (a.x + b.x) / 2 + ' ' + (a.y + b.y) / 2 + ') rotate(' + winkel + ')');

    el.spur.classList.add('aktiv');
  }

  /* ---------------------------------------------------------------- */
  /* Anzeige rechts                                                    */

  function zeichneAlles() {
    schreib(el.titel, S.auftrag.titel, { scale: 4, color: GOLD, shadow: '#3a2a00' });
    if (S.leicht) {
      el.titel.appendChild(PF.render('KINDERMODUS', { scale: 2, color: CYAN }));
    }
    zeichneAuszahlung();
    zeichnePlan();
    zeichneFuss();
    zeichneSpur();
  }

  function zeichneAuszahlung() {
    schreib(el.auszahlung, zahl(S.angezeigt, 6), {
      scale: 6, color: GOLD, shadow: '#3a2a00'
    });
    if (S.abzug > 0) {
      el.abzug.hidden = false;
      schreib(el.abzug, 'ABZUG -' + S.abzug, { scale: 2, color: ROT });
    } else {
      el.abzug.hidden = true;
    }
  }

  function zeichnePlan() {
    el.plan.textContent = '';
    S.ziele.forEach(function (wort) {
      var gefunden = S.gefundenZiele.has(wort);
      var zeile = document.createElement('span');
      zeile.className = 'planwort'
        + (gefunden ? ' erledigt' : '')
        + (wort === S.frisch ? ' frisch' : '');
      zeile.appendChild(PF.render(wort, {
        scale: 3,
        color: gefunden ? GOLD_MATT : CREME,
        strike: gefunden,
        strikeColor: gefunden ? GOLD : CREME
      }));
      el.plan.appendChild(zeile);
    });

    var extra = S.gefundenExtra.size;
    schreib(el.extra, 'EXTRAWORTE ' + extra + '/' + moeglicheExtras(), {
      scale: 2, color: extra ? CYAN : '#4b7a55'
    });
  }

  function moeglicheExtras() {
    var n = 0;
    S.loesungen.forEach(function (w) {
      if (S.ziele.indexOf(w) === -1) n++;
    });
    return n;
  }

  function zeichneFuss() {
    var rest = S.ziele.length - S.gefundenZiele.size;
    schreib(el.rest, 'NOCH ' + rest, { scale: 2, color: rest ? CREME : GOLD });
    var faktor = gebuehrenFaktor();
    schreib(el.tippText,
      faktor ? 'TIPP ' + KOSTEN.tipp * faktor : 'TIPP GRATIS',
      { scale: 3, color: GOLD });
    schreib(el.spickenText,
      faktor ? 'SPICKEN ' + KOSTEN.spicken * faktor : 'SPICKEN GRATIS',
      { scale: 2, color: GOLD });
    schreib(el.menuText, 'MENÜ', { scale: 3, color: CREME });
  }

  /* ---------------------------------------------------------------- */
  /* Worte pruefen                                                     */

  function istWort(wort) {
    return wort.length >= 3 && Woerter.DICT.has(wort);
  }

  /* Eine Gebuehr mindert die Auszahlung und wird zugleich als Abzug
   * ausgewiesen, damit am Ende nachvollziehbar bleibt, wo der Gewinn
   * geblieben ist. Auf dem Uebungsauftrag kostet nichts etwas. */
  function gebuehr(betrag) {
    var faktor = gebuehrenFaktor();
    if (!faktor) return 0;

    betrag *= faktor;
    S.abzug += betrag;
    /* Darf den Auftrag ins Minus ziehen -- bezahlt wird aus dem Topf,
     * also auch aus der Beute frueherer Auftraege. */
    S.punkte -= betrag;

    if (topf() <= 0 && !L.vorbei) aufgeflogen();
    return betrag;
  }

  function punkteFuer(wort, istZiel) {
    var basis = wort.length * 10;
    var laengenBonus = Math.pow(Math.max(0, wort.length - 3), 2) * 5;
    var summe = basis + laengenBonus;
    return istZiel ? summe * 2 : summe;
  }

  function werteAus() {
    var pfad = S.auswahl.slice();
    if (pfad.length < 3) {
      leereAuswahl();
      return;
    }

    /* Gelesen wird in Zugrichtung. Liegt ein Wort rueckwaerts im Brett,
     * muss es auch rueckwaerts gezogen werden -- die Buchstaben sollen
     * in der richtigen Reihenfolge stehen, sonst waere jedes Palindrom
     * ein Zufallstreffer. */
    var wort = Brett.wortAusPfad(S.brett, pfad);

    if (!istWort(wort)) {
      gebuehr(KOSTEN.fehler);
      Klang.sfx.fehler();
      zittern();
      leereAuswahl();
      laufePunkteHoch();
      return;
    }

    var istZiel = S.ziele.indexOf(wort) !== -1;

    if ((istZiel && S.gefundenZiele.has(wort)) ||
        (!istZiel && S.gefundenExtra.has(wort))) {
      Klang.sfx.schon();
      blinke(pfad, '#7a8b7f');
      leereAuswahl();
      return;
    }

    var gewinn = punkteFuer(wort, istZiel);
    S.punkte += gewinn;

    if (istZiel) {
      S.gefundenZiele.add(wort);
      S.frisch = wort;
      var farbe = WORTFARBEN[(S.gefundenZiele.size - 1) % WORTFARBEN.length];
      dreheDauerhaft(pfad, farbe);
      Klang.sfx.treffer();
      blitzeRahmen();
      muenzenRegen(pfad);
    } else {
      S.gefundenExtra.add(wort);
      dreheKurz(pfad);
      Klang.sfx.extra();
    }

    zeigeGewinn(pfad, gewinn, istZiel);
    leereAuswahl();
    zeichnePlan();
    zeichneFuss();
    laufePunkteHoch();

    /* Das Aufblinken gilt nur fuer diesen einen Neuzugang. */
    S.frisch = null;

    if (S.gefundenZiele.size === S.ziele.length && !S.fertig) {
      S.fertig = true;
      setTimeout(levelGeschafft, 900 + pfad.length * 90);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Kachel-Animationen                                                */

  function dreheKachel(index, verzoegerung) {
    var k = S.kachelDom[index];
    k.style.transitionDelay = verzoegerung + 'ms';
    k.classList.add('gedreht');
    setTimeout(function () { Klang.sfx.dreh(verzoegerung / 90); }, verzoegerung);
  }

  function dreheDauerhaft(pfad, farbe) {
    pfad.forEach(function (index, i) {
      var feld = S.felder[index];
      if (!feld.farbe) {
        feld.farbe = farbe;
        S.kachelDom[index].style.setProperty('--wortfarbe', farbe);
      }
      S.kachelDom[index].classList.add('gefunden');
      if (!feld.gedreht) {
        feld.gedreht = true;
        dreheKachel(index, i * 90);
      }
    });
  }

  /* Extrawoerter zeigen sich nur kurz und klappen wieder zu. Gezaehlt
   * wird pro Kachel, weil sich zwei Funde ueberlappen koennen -- sonst
   * klappt der erste Zeitgeber eine Kachel zu, die der zweite noch
   * zeigen will. Gegen das Spicken muss hier nichts getan werden: das
   * dreht ueber eine Klasse am Brett und ist davon unabhaengig. */
  function dreheKurz(pfad) {
    pfad.forEach(function (index, i) {
      var feld = S.felder[index];
      if (feld.gedreht) return;

      feld.kurz = (feld.kurz || 0) + 1;
      dreheKachel(index, i * 80);

      setTimeout(function () {
        feld.kurz--;
        if (feld.kurz <= 0 && !feld.gedreht) {
          S.kachelDom[index].style.transitionDelay = '0ms';
          S.kachelDom[index].classList.remove('gedreht');
        }
      }, 1100 + i * 80);
    });
  }

  function blinke(pfad, farbe) {
    pfad.forEach(function (index) {
      var k = S.kachelDom[index];
      k.style.setProperty('--blinkfarbe', farbe);
      k.classList.add('blinkt');
      setTimeout(function () { k.classList.remove('blinkt'); }, 400);
    });
  }

  function zittern() {
    el.brettRahmen.classList.add('zittert');
    setTimeout(function () { el.brettRahmen.classList.remove('zittert'); }, 320);
  }

  function blitzeRahmen() {
    el.brettRahmen.classList.remove('blitzt');
    /* Reflow erzwingen, sonst startet dieselbe Animation nicht neu. */
    void el.brettRahmen.offsetWidth;
    el.brettRahmen.classList.add('blitzt');
    setTimeout(function () { el.brettRahmen.classList.remove('blitzt'); }, 500);
  }

  /* Muenzen aus der Mitte des gefundenen Wortes. Rein zur Freude. */
  function muenzenRegen(pfad) {
    if (sparsam()) return;

    var mitte = kachelMitte(pfad[Math.floor(pfad.length / 2)]);
    var anzahl = Math.min(20, 8 + pfad.length * 2);

    for (var i = 0; i < anzahl; i++) {
      var teil = document.createElement('div');
      teil.className = 'muenze';

      var winkel = (Math.PI * 2 * i) / anzahl + (Math.random() - 0.5) * 0.5;
      var weite = 45 + Math.random() * 75;

      teil.style.left = mitte.x + 'px';
      teil.style.top = mitte.y + 'px';
      teil.style.setProperty('--dx', Math.cos(winkel) * weite + 'px');
      /* Leichter Zug nach oben, damit es nach Auswurf aussieht und
       * nicht nach Explosion. */
      teil.style.setProperty('--dy', (Math.sin(winkel) * weite - 34) + 'px');
      teil.style.setProperty('--dreh', Math.round(Math.random() * 720 - 360) + 'deg');
      teil.style.setProperty('--dauer', (0.6 + Math.random() * 0.45).toFixed(2) + 's');

      el.brett.appendChild(teil);
      raeumeSpaeter(teil, 1200);
    }
  }

  function raeumeSpaeter(knoten, ms) {
    setTimeout(function () { knoten.remove(); }, ms);
  }

  function zeigeGewinn(pfad, gewinn, istZiel) {
    var mitte = kachelMitte(pfad[Math.floor(pfad.length / 2)]);
    var blase = document.createElement('div');
    blase.className = 'gewinnblase' + (istZiel ? ' ziel' : '');
    blase.appendChild(PF.render('+' + gewinn, {
      scale: istZiel ? 4 : 3,
      color: istZiel ? GOLD : CYAN,
      shadow: '#04150a'
    }));
    blase.style.left = mitte.x + 'px';
    blase.style.top = mitte.y + 'px';
    el.brett.appendChild(blase);
    setTimeout(function () { blase.remove(); }, 1200);
  }

  /* Der Zaehler zaehlt hoch statt zu springen -- das ist der halbe
   * Reiz eines Automaten. */
  function laufePunkteHoch() {
    if (S.zaehlerLaeuft) return;
    S.zaehlerLaeuft = true;
    var schritt = 0;

    (function tick() {
      if (!S) return;
      var ziel = Math.max(0, topf());
      var rest = ziel - S.angezeigt;
      if (Math.abs(rest) < 1) {
        S.angezeigt = ziel;
        S.zaehlerLaeuft = false;
        zeichneAuszahlung();
        return;
      }
      /* Laeuft in beide Richtungen -- Gebuehren zaehlen den Topf
       * genauso hoerbar herunter, wie Funde ihn hochzaehlen. */
      var schrittweite = Math.max(1, Math.ceil(Math.abs(rest) / 12));
      S.angezeigt += rest > 0 ? schrittweite : -schrittweite;
      if (schritt++ % 3 === 0) Klang.sfx.muenze(0);
      zeichneAuszahlung();
      requestAnimationFrame(tick);
    })();
  }

  /* ---------------------------------------------------------------- */
  /* Eingabe                                                           */

  function kachelUnter(x, y) {
    var ziel = document.elementFromPoint(x, y);
    if (!ziel) return -1;
    var kachel = ziel.closest ? ziel.closest('.kachel') : null;
    return kachel ? Number(kachel.dataset.i) : -1;
  }

  function markiere(index, an) {
    S.kachelDom[index].classList.toggle('gewaehlt', an);
  }

  function leereAuswahl() {
    S.auswahl.forEach(function (i) { markiere(i, false); });
    S.auswahl = [];
    S.startFeld = -1;
    zeichneSpur();

  }

  /*
   * Woerter liegen immer auf einer Geraden -- waagerecht, senkrecht
   * oder diagonal. Statt zu verlangen, dass der Finger die Felder genau
   * trifft, rastet die Auswahl ein: vom Startfeld zum Zielfeld wird der
   * Winkel genommen, auf den naechsten der acht Strahlen gerundet, und
   * die Strecke bis zur Zielentfernung markiert. Das laesst sich auch
   * mit dem Daumen bedienen.
   */
  function setzeAuswahlBis(zielFeld) {
    var spalten = S.brett.spalten;
    var zeilen = S.brett.zeilen;
    var start = S.startFeld;

    var dx = (zielFeld % spalten) - (start % spalten);
    var dy = Math.floor(zielFeld / spalten) - Math.floor(start / spalten);

    var neu;
    if (dx === 0 && dy === 0) {
      neu = [start];
    } else {
      var achtel = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
      var richtung = Brett.RICHTUNGEN[((achtel % 8) + 8) % 8];
      var laenge = Math.max(Math.abs(dx), Math.abs(dy)) + 1;

      /* Am Brettrand abschneiden statt die Auswahl fallen zu lassen. */
      var felder = null;
      while (laenge > 1 && !felder) {
        felder = Brett.strecke(start, richtung, laenge, spalten, zeilen);
        if (!felder) laenge--;
      }
      neu = felder || [start];
    }

    if (neu.length === S.auswahl.length &&
        neu[neu.length - 1] === S.auswahl[S.auswahl.length - 1]) {
      return;
    }

    var vorher = S.auswahl.length;
    S.auswahl.forEach(function (i) { markiere(i, false); });
    S.auswahl = neu;
    S.auswahl.forEach(function (i) { markiere(i, true); });

    if (neu.length > vorher) Klang.sfx.waehlen(neu.length);
    else if (neu.length < vorher) Klang.sfx.abwaehlen(neu.length);

    zeichneSpur();

  }

  function zugStart(ev) {
    if (S.fertig || el.overlay.classList.contains('offen')) return;
    var index = kachelUnter(ev.clientX, ev.clientY);
    if (index < 0) return;
    ev.preventDefault();
    Klang.wecke();
    S.zieht = true;
    /* Ohne Capture verliert man den Zug, sobald der Finger den Rand
     * streift. Nicht jeder Zeigertyp laesst sich fangen, daher weich. */
    try { el.brett.setPointerCapture(ev.pointerId); } catch (e) { /* egal */ }
    leereAuswahl();
    S.startFeld = index;
    setzeAuswahlBis(index);
  }

  function zugBewegung(ev) {
    if (!S.zieht || S.startFeld < 0) return;
    ev.preventDefault();
    var index = kachelUnter(ev.clientX, ev.clientY);
    if (index >= 0) setzeAuswahlBis(index);
  }

  function zugEnde(ev) {
    if (!S.zieht) return;
    S.zieht = false;
    try { el.brett.releasePointerCapture(ev.pointerId); } catch (e) { /* egal */ }
    werteAus();
  }

  /* ---------------------------------------------------------------- */
  /* Hilfen                                                            */

  function tipp() {
    if (S.fertig) return;
    var offen = S.ziele.filter(function (w) { return !S.gefundenZiele.has(w); });
    if (!offen.length) return;

    var wort = offen[Math.floor(Math.random() * offen.length)];
    var pfad = S.brett.pfade[wort];
    var verraten = pfad.filter(function (i) {
      return !S.felder[i].gedreht;
    }).slice(0, 2);
    if (!verraten.length) return;

    gebuehr(KOSTEN.tipp);

    verraten.forEach(function (index, i) {
      S.felder[index].tipp = true;
      S.kachelDom[index].classList.add('tipp');
      if (!S.felder[index].gedreht) dreheKachel(index, i * 120);
      S.felder[index].gedreht = true;
    });

    Klang.sfx.knopf();
    laufePunkteHoch();
  }

  function spicken() {
    if (S.spicktGerade || S.fertig) return;
    S.spicktGerade = true;
    gebuehr(KOSTEN.spicken);

    Klang.sfx.spicken();
    el.brett.classList.add('spickt');
    laufePunkteHoch();

    setTimeout(function () {
      el.brett.classList.remove('spickt');
      S.spicktGerade = false;
    }, 1600);
  }

  /* ---------------------------------------------------------------- */
  /* Auftrag beendet                                                   */

  function levelGeschafft() {
    Klang.sfx.fanfare();

    var bonus = Math.max(0, 200 - S.abzug);
    S.punkte += bonus;

    /* Die Beute des Auftrags wandert in den Topf. S.punkte wieder auf
     * null, damit topf() denselben Wert behaelt und der Zaehler nicht
     * springt. */
    L.topf = Math.max(0, topf());
    L.auftraege++;
    S.punkte = 0;
    laufePunkteHoch();

    oeffneOverlay(baueAbrechnung(bonus));
  }

  /* Topf leer: der Beutezug endet ohne Beute und ohne Eintrag. */
  function aufgeflogen() {
    L.vorbei = true;
    S.fertig = true;
    S.punkte = -L.topf;
    Klang.sfx.fehler();
    zittern();
    setTimeout(function () { oeffneOverlay(baueAufgeflogen()); }, 700);
  }

  /* Freiwilliger Ausstieg: die Summe zaehlt. */
  function haueAb() {
    L.vorbei = true;
    S.fertig = true;
    var summe = L.topf;
    if (schafftEsRein(summe)) {
      oeffneOverlay(baueNamensEingabe(summe));
    } else {
      oeffneOverlay(baueBestenliste(null, summe));
    }
  }

  function baueAbrechnung(bonus) {
    var box = document.createElement('div');
    box.className = 'dialog';

    var h = document.createElement('div');
    h.className = 'dialogtitel';
    h.appendChild(PF.render('COUP GELUNGEN', { scale: 5, color: GOLD, shadow: '#3a2a00' }));
    box.appendChild(h);

    var naechsterFaktor = Math.max(1, S.levelNr + 1);
    var zeilen = [
      ['GEFUNDEN', S.gefundenZiele.size + ' VON ' + S.ziele.length],
      ['EXTRAWORTE', String(S.gefundenExtra.size)],
      ['ABZUG', '-' + S.abzug],
      ['SAUBER-BONUS', '+' + bonus],
      ['AUFTRÄGE', String(L.auftraege)],
      ['IM TOPF', zahl(L.topf, 6)]
    ];

    var tabelle = document.createElement('div');
    tabelle.className = 'abrechnung';
    zeilen.forEach(function (paar, i) {
      var letzte = i === zeilen.length - 1;
      var links = document.createElement('span');
      links.appendChild(PF.render(paar[0], { scale: 2, color: letzte ? GOLD : CREME }));
      var rechts = document.createElement('span');
      rechts.appendChild(PF.render(paar[1], {
        scale: letzte ? 4 : 2, color: letzte ? GOLD : CREME
      }));
      tabelle.appendChild(links);
      tabelle.appendChild(rechts);
    });
    box.appendChild(tabelle);

    if (S.gefundenExtra.size) {
      var extraBox = document.createElement('div');
      extraBox.className = 'extraliste';
      Array.from(S.gefundenExtra).sort().forEach(function (w) {
        var s = document.createElement('span');
        s.appendChild(PF.render(w, { scale: 2, color: CYAN }));
        extraBox.appendChild(s);
      });
      box.appendChild(extraBox);
    }

    /* Die eigentliche Entscheidung des Spiels steht hier. */
    var warnung = document.createElement('div');
    warnung.className = 'hinweise';
    [
      ['NÄCHSTER AUFTRAG: GEBÜHREN MAL ' + naechsterFaktor, ROT],
      ['DER TOPF BLEIBT DABEI IM RISIKO.', CREME]
    ].forEach(function (zeile) {
      warnung.appendChild(PF.render(zeile[0], { scale: 2, color: zeile[1] }));
    });
    box.appendChild(warnung);

    box.appendChild(knopfReihe([
      ['WEITER', function () {
        schliesseOverlay();
        starteLevel(S.levelNr + 1);
      }],
      ['ABHAUEN ' + zahl(L.topf, 0), function () {
        schliesseOverlay();
        haueAb();
      }]
    ]));

    return box;
  }

  function baueAufgeflogen() {
    var box = document.createElement('div');
    box.className = 'dialog';

    var h = document.createElement('div');
    h.className = 'dialogtitel';
    h.appendChild(PF.render('AUFGEFLOGEN', { scale: 5, color: ROT, shadow: '#2a0008' }));
    box.appendChild(h);

    var text = document.createElement('div');
    text.className = 'hinweise';
    [
      ['DER TOPF IST LEER.', CREME],
      ['NACH ' + L.auftraege +
        (L.auftraege === 1 ? ' AUFTRAG' : ' AUFTRÄGEN') +
        ' OHNE BEUTE RAUS.', CREME],
      ['WER RECHTZEITIG ABHAUT, BEHÄLT SIE.', GOLD]
    ].forEach(function (zeile) {
      text.appendChild(PF.render(zeile[0], { scale: 2, color: zeile[1] }));
    });
    box.appendChild(text);

    box.appendChild(knopfReihe([
      ['NEUER BEUTEZUG', function () { schliesseOverlay(); neuerBeutezug(); }],
      ['BESTENLISTE', function () { oeffneOverlay(baueBestenliste()); }]
    ]));

    return box;
  }

  /* ---------------------------------------------------------------- */
  /* Bestenliste                                                       */

  var PLAETZE = 10;
  var TASTEN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  var eingabeHaken = null;

  function ladeListe() {
    var liste = ladeStand()[listenSchluessel()];
    return Array.isArray(liste) ? liste : [];
  }

  function schafftEsRein(summe) {
    if (summe <= 0) return false;
    var liste = ladeListe();
    return liste.length < PLAETZE || summe > liste[liste.length - 1].summe;
  }

  /* Traegt ein Ergebnis ein und gibt den erreichten Platz zurueck. */
  function trageEin(kuerzel, summe) {
    var liste = ladeListe();
    var eintrag = {
      name: kuerzel,
      summe: summe,
      auftraege: L.auftraege,
      datum: new Date().toISOString().slice(0, 10)
    };
    liste.push(eintrag);
    /* Bei Gleichstand bleibt der aeltere Eintrag oben -- sort() in V8
     * ist stabil, der neue wurde gerade erst angehaengt. */
    liste.sort(function (a, b) { return b.summe - a.summe; });
    liste = liste.slice(0, PLAETZE);

    var stand = ladeStand();
    stand[listenSchluessel()] = liste;
    speichereStand(stand);
    return liste.indexOf(eintrag);
  }

  function loeseEingabeHaken() {
    if (!eingabeHaken) return;
    document.removeEventListener('keydown', eingabeHaken, true);
    eingabeHaken = null;
  }

  /*
   * Die Nameneingabe wie am Automaten: drei Stellen, eine Tastatur zum
   * Antippen. Wer eine echte Tastatur hat, darf auch einfach tippen --
   * beides schreibt in dasselbe Kuerzel.
   */
  function baueNamensEingabe(summe) {
    var kuerzel = '';

    var box = document.createElement('div');
    box.className = 'dialog eingabe';

    var h = document.createElement('div');
    h.className = 'dialogtitel';
    h.appendChild(PF.render('IN DIE BESTENLISTE', {
      scale: 4, color: GOLD, shadow: '#3a2a00'
    }));
    box.appendChild(h);

    var summeZeile = document.createElement('div');
    summeZeile.className = 'mittig';
    summeZeile.appendChild(PF.render(zahl(summe, 6), {
      scale: 6, color: GOLD, shadow: '#3a2a00'
    }));
    box.appendChild(summeZeile);

    var unter = document.createElement('div');
    unter.className = 'mittig';
    unter.appendChild(PF.render(
      L.auftraege + (L.auftraege === 1 ? ' AUFTRAG' : ' AUFTRÄGE'),
      { scale: 2, color: CREME }));
    box.appendChild(unter);

    var schlitze = document.createElement('div');
    schlitze.className = 'schlitze';
    box.appendChild(schlitze);

    var tastatur = document.createElement('div');
    tastatur.className = 'tastatur';
    box.appendChild(tastatur);

    var knoepfe = document.createElement('div');
    knoepfe.className = 'dialogknoepfe';
    box.appendChild(knoepfe);

    function zeichneSchlitze() {
      schlitze.textContent = '';
      for (var i = 0; i < 3; i++) {
        var feld = document.createElement('div');
        feld.className = 'schlitz';
        if (i === kuerzel.length) feld.classList.add('dran');
        if (kuerzel[i]) {
          feld.appendChild(PF.render(kuerzel[i], {
            scale: 7, color: GOLD, box: 'base'
          }));
        }
        schlitze.appendChild(feld);
      }
    }

    function setze(zeichen) {
      if (kuerzel.length >= 3) return;
      kuerzel += zeichen;
      Klang.sfx.waehlen(kuerzel.length);
      zeichneSchlitze();
      zeichneKnoepfe();
    }

    function loesche() {
      if (!kuerzel.length) return;
      kuerzel = kuerzel.slice(0, -1);
      Klang.sfx.abwaehlen(kuerzel.length);
      zeichneSchlitze();
      zeichneKnoepfe();
    }

    function fertig() {
      if (kuerzel.length !== 3) return;
      loeseEingabeHaken();
      Klang.sfx.fanfare();
      var platz = trageEin(kuerzel, summe);
      oeffneOverlay(baueBestenliste({ neu: platz }));
    }

    function zeichneKnoepfe() {
      knoepfe.textContent = '';

      var weg = document.createElement('button');
      weg.className = 'knopf';
      weg.type = 'button';
      weg.appendChild(PF.render('LÖSCHEN', { scale: 3, color: CREME }));
      weg.addEventListener('click', loesche);
      knoepfe.appendChild(weg);

      var ok = document.createElement('button');
      ok.className = 'knopf' + (kuerzel.length === 3 ? '' : ' aus');
      ok.type = 'button';
      ok.disabled = kuerzel.length !== 3;
      ok.appendChild(PF.render('EINTRAGEN', {
        scale: 3, color: kuerzel.length === 3 ? GOLD : GOLD_MATT
      }));
      ok.addEventListener('click', fertig);
      knoepfe.appendChild(ok);
    }

    TASTEN.split('').forEach(function (zeichen) {
      var taste = document.createElement('button');
      taste.className = 'taste';
      taste.type = 'button';
      taste.appendChild(PF.render(zeichen, { scale: 3, color: CREME, box: 'base' }));
      taste.addEventListener('click', function () { setze(zeichen); });
      tastatur.appendChild(taste);
    });

    /* Echte Tastatur: Buchstaben und Ziffern schreiben, Backspace
     * loescht, Enter traegt ein. In der Capture-Phase, damit T und S
     * hier nicht als Tipp und Spicken durchschlagen. */
    box.einhaengen = function () {
      eingabeHaken = function (ev) {
        if (ev.key === 'Backspace') { ev.preventDefault(); loesche(); return; }
        if (ev.key === 'Enter') { ev.preventDefault(); fertig(); return; }
        var z = ev.key.toUpperCase();
        if (z.length === 1 && TASTEN.indexOf(z) !== -1) {
          ev.preventDefault();
          ev.stopPropagation();
          setze(z);
        }
      };
      document.addEventListener('keydown', eingabeHaken, true);
    };

    zeichneSchlitze();
    zeichneKnoepfe();
    return box;
  }

  /*
   * opts.neu       Platz des gerade eingetragenen Ergebnisses
   * opts.ausMenue  aus dem Menue geoeffnet, also nur zurueck
   */
  function baueBestenliste(opts) {
    opts = opts || {};
    var liste = ladeListe();

    var box = document.createElement('div');
    box.className = 'dialog';

    var h = document.createElement('div');
    h.className = 'dialogtitel';
    h.appendChild(PF.render(
      (L && L.leicht) ? 'BESTE KINDER' : 'BESTENLISTE',
      { scale: 5, color: GOLD, shadow: '#3a2a00' }));
    box.appendChild(h);

    if (!liste.length) {
      var leer = document.createElement('div');
      leer.className = 'mittig';
      leer.appendChild(PF.render('NOCH NICHTS ERBEUTET.', { scale: 2, color: CREME }));
      box.appendChild(leer);
    } else {
      var tafel = document.createElement('div');
      tafel.className = 'rangliste';
      liste.forEach(function (eintrag, i) {
        var zeile = document.createElement('div');
        zeile.className = 'rang' + (i === opts.neu ? ' neu' : '');
        var farbe = i === opts.neu ? GOLD : CREME;
        [
          String(i + 1) + '.',
          eintrag.name,
          zahl(eintrag.summe, 6),
          eintrag.auftraege + 'A'
        ].forEach(function (stueck) {
          var s = document.createElement('span');
          s.appendChild(PF.render(stueck, { scale: 3, color: farbe }));
          zeile.appendChild(s);
        });
        tafel.appendChild(zeile);
      });
      box.appendChild(tafel);
    }

    /* Wer es nicht in die Liste geschafft hat, soll sein Ergebnis
     * trotzdem sehen. */
    if (opts.neu === undefined && !opts.ausMenue && L && L.vorbei) {
      var eigen = document.createElement('div');
      eigen.className = 'hinweise';
      eigen.appendChild(PF.render('DIESER BEUTEZUG: ' + zahl(L.topf, 6),
        { scale: 2, color: CREME }));
      eigen.appendChild(PF.render('HAT NICHT GEREICHT.', { scale: 2, color: GOLD_MATT }));
      box.appendChild(eigen);
    }

    box.appendChild(knopfReihe(
      opts.ausMenue
        ? [['ZURÜCK', function () { oeffneOverlay(baueMenue()); }]]
        : [['NEUER BEUTEZUG', function () { schliesseOverlay(); neuerBeutezug(); }]]
    ));

    return box;
  }

  /* ---------------------------------------------------------------- */
  /* Overlay: Menue, Anleitung, Spickzettel                            */

  function knopfReihe(eintraege) {
    var reihe = document.createElement('div');
    reihe.className = 'dialogknoepfe';
    eintraege.forEach(function (paar) {
      var b = document.createElement('button');
      b.className = 'knopf';
      b.appendChild(PF.render(paar[0], { scale: 3, color: GOLD }));
      b.addEventListener('click', function () {
        Klang.sfx.knopf();
        paar[1]();
      });
      reihe.appendChild(b);
    });
    return reihe;
  }

  function oeffneOverlay(inhalt) {
    /* Jeder Dialogwechsel raeumt einen etwaigen Tastaturhaken der
     * Nameneingabe weg, sonst tippt man spaeter ins Leere. */
    loeseEingabeHaken();
    el.overlayInhalt.textContent = '';
    el.overlayInhalt.appendChild(inhalt);
    el.overlay.classList.add('offen');

    /* Erst jetzt darf sich ein Dialog verdrahten. Wuerde er das schon
     * beim Bauen tun, raeumte das loeseEingabeHaken() oben ihn gleich
     * wieder weg -- der Inhalt entsteht ja vor dem Aufruf. */
    if (typeof inhalt.einhaengen === 'function') inhalt.einhaengen();
  }

  function overlayOffen() {
    return el.overlay.classList.contains('offen');
  }

  function schliesseOverlay() {
    loeseEingabeHaken();
    el.overlay.classList.remove('offen');
    el.overlayInhalt.textContent = '';
  }

  function baueMenue() {
    var box = document.createElement('div');
    box.className = 'dialog';

    var h = document.createElement('div');
    h.className = 'dialogtitel';
    h.appendChild(PF.render('MENÜ', { scale: 5, color: GOLD, shadow: '#3a2a00' }));
    box.appendChild(h);

    var liste = ladeListe();
    var info = document.createElement('div');
    info.className = 'abrechnung';
    [
      ['IM TOPF', zahl(Math.max(0, topf()), 6)],
      ['AUFTRÄGE IM ZUG', String(L.auftraege)],
      ['BESTER BEUTEZUG', zahl(liste.length ? liste[0].summe : 0, 6)]
    ].forEach(function (paar) {
      var a = document.createElement('span');
      a.appendChild(PF.render(paar[0], { scale: 2, color: CREME }));
      var b = document.createElement('span');
      b.appendChild(PF.render(paar[1], { scale: 2, color: GOLD }));
      info.appendChild(a);
      info.appendChild(b);
    });
    box.appendChild(info);

    box.appendChild(knopfReihe([
      ['WEITER', schliesseOverlay],
      ['ANLEITUNG', function () { oeffneOverlay(baueAnleitung(true)); }],
      ['SPICKZETTEL', function () { oeffneOverlay(baueSpickzettel()); }]
    ]));

    /* "Neues Brett" gibt es bewusst nicht mehr: wer ein ungeliebtes
     * Brett neu wuerfeln darf, hat kein Risiko mehr zu tragen. Wer
     * aussteigen will, haut ab und sichert den Topf. */
    box.appendChild(knopfReihe([
      ['BESTENLISTE', function () { oeffneOverlay(baueBestenliste({ ausMenue: true })); }],
      [Klang.an ? 'TON: AN' : 'TON: AUS', function () {
        Klang.an = !Klang.an;
        oeffneOverlay(baueMenue());
      }]
    ]));

    /* Der Modus wird nicht umgeschaltet, sondern neu begonnen -- ein
     * halb gespielter Beutezug liesse sich sonst nicht vergleichen. */
    box.appendChild(knopfReihe([
      ['NEUER BEUTEZUG', function () {
        schliesseOverlay();
        neuerBeutezug(false);
      }],
      ['FÜR KINDER', function () {
        schliesseOverlay();
        neuerBeutezug(true);
      }]
    ]));

    return box;
  }

  /* Die wichtigste Huerde ist nicht die Wortsuche, sondern der Gedanke
   * dahinter: das Bild ist nicht die Antwort, das Bild ist ein
   * Buchstabe. Also steht genau das gross und zuerst da. */
  function baueAnleitung(zurueck) {
    var box = document.createElement('div');
    box.className = 'dialog anleitung';

    /* Der Spielname steht klein obendrueber wie der Schriftzug auf dem
     * Automatengehaeuse -- die Schlagzeile darunter hat den Auftritt. */
    var marke = document.createElement('div');
    marke.className = 'mittig marke';
    marke.appendChild(PF.render(NAME, { scale: 3, color: GOLD_MATT, tracking: 3 }));
    box.appendChild(marke);

    var kopf = document.createElement('div');
    kopf.className = 'schlagzeile';
    [['EMOJIS SIND', GOLD], ['BUCHSTABEN', CYAN], ['KEINE ANTWORT', GOLD]]
      .forEach(function (zeile) {
        kopf.appendChild(PF.render(zeile[0], {
          scale: 5, color: zeile[1], shadow: '#08220f'
        }));
      });
    box.appendChild(kopf);

    var beispiele = document.createElement('div');
    beispiele.className = 'beispiele';
    [['🍕', 'P'], ['🦁', 'L'], ['🚀', 'R']]
      .forEach(function (paar) {
        var spalte = document.createElement('div');
        spalte.className = 'beispiel';

        var bild = document.createElement('span');
        bild.className = 'beispielemoji';
        bild.textContent = paar[0];

        spalte.appendChild(bild);
        spalte.appendChild(PF.render('↓', { scale: 3, color: '#6fbf8a' }));
        spalte.appendChild(PF.render(paar[1], { scale: 5, color: CREME, box: 'base' }));
        beispiele.appendChild(spalte);
      });
    box.appendChild(beispiele);

    var satz = document.createElement('div');
    satz.className = 'mittig';
    satz.appendChild(PF.render('EIN EMOJI ALLEIN GEWINNT NICHTS.', { scale: 2, color: GOLD }));
    box.appendChild(satz);

    /* Kleine Nachstellung der Zugkapsel -- zeigt in einem Bild, was ein
     * Absatz Text nur umstaendlich erklaert. */
    var demo = document.createElement('div');
    demo.className = 'zugdemo';
    for (var i = 0; i < 3; i++) demo.appendChild(document.createElement('span'));
    var demoRahmen = document.createElement('div');
    demoRahmen.className = 'mittig';
    demoRahmen.appendChild(demo);
    box.appendChild(demoRahmen);

    var hinweise = document.createElement('div');
    hinweise.className = 'hinweise';
    [
      ['HALTEN UND IN EINEM ZUG DARÜBERZIEHEN –', CYAN],
      ['NICHT EINZELN ANTIPPEN.', CYAN],
      ['GERADE LINIEN: WAAGERECHT, SENKRECHT,', CREME],
      ['DIAGONAL. GELESEN WIRD IN ZUGRICHTUNG.', CREME],
      ['DER ERSTE AUFTRAG IST GRATIS – TIPP UND', CREME],
      ['SPICKEN KOSTEN AB AUFTRAG 2.', CREME],
      ['FÜR KINDER: EIN WORT, WAAGERECHT,', GOLD],
      ['VIELE KACHELN SCHON ALS BUCHSTABE.', GOLD]
    ].forEach(function (zeile) {
      hinweise.appendChild(PF.render(zeile[0], { scale: 2, color: zeile[1] }));
    });
    box.appendChild(hinweise);

    /* Beim ersten Besuch steht hier "LOS GEHT'S" und der Knopf schliesst;
     * aus dem Menue heraus fuehrt er zurueck ins Menue. */
    box.appendChild(knopfReihe(
      zurueck
        ? [['ZURÜCK', function () { oeffneOverlay(baueMenue()); }]]
        : [
            ['LOS GEHT\'S', schliesseOverlay],
            ['FÜR KINDER', function () {
              schliesseOverlay();
              neuerBeutezug(true);
            }]
          ]
    ));
    return box;
  }

  /* Welche Bilder liegen gerade auf dem Brett, und wofuer stehen sie?
   * Wer die Namen kennt, spielt doppelt so schnell. */
  function baueSpickzettel() {
    var box = document.createElement('div');
    box.className = 'dialog breit';

    var h = document.createElement('div');
    h.className = 'dialogtitel';
    h.appendChild(PF.render('SPICKZETTEL', { scale: 5, color: GOLD, shadow: '#3a2a00' }));
    box.appendChild(h);

    var gesehen = new Map();
    S.brett.kacheln.forEach(function (k) {
      if (!gesehen.has(k.emoji)) gesehen.set(k.emoji, k);
    });

    var liste = Array.from(gesehen.values()).sort(function (a, b) {
      return a.letter === b.letter ? a.name.localeCompare(b.name)
                                   : a.letter.localeCompare(b.letter);
    });

    var gitter = document.createElement('div');
    gitter.className = 'spickgitter';
    liste.forEach(function (k) {
      var zelle = document.createElement('div');
      zelle.className = 'spickzelle';

      var bild = document.createElement('span');
      bild.className = 'spickemoji';
      bild.textContent = k.emoji;

      var name = document.createElement('span');
      name.appendChild(PF.render(k.name, { scale: 2, color: CREME }));

      zelle.appendChild(bild);
      zelle.appendChild(name);
      gitter.appendChild(zelle);
    });
    box.appendChild(gitter);

    box.appendChild(knopfReihe([['ZURÜCK', function () { oeffneOverlay(baueMenue()); }]]));
    return box;
  }

  /* ---------------------------------------------------------------- */
  /* Start                                                             */

  function verdrahte() {
    el.brett.addEventListener('pointerdown', zugStart);
    el.brett.addEventListener('pointermove', zugBewegung);
    el.brett.addEventListener('pointerup', zugEnde);
    el.brett.addEventListener('pointercancel', zugEnde);
    el.brett.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    el.btnTipp.addEventListener('click', function () { Klang.sfx.knopf(); tipp(); });
    el.btnSpicken.addEventListener('click', function () { Klang.sfx.knopf(); spicken(); });
    el.btnMenu.addEventListener('click', function () {
      Klang.sfx.knopf();
      oeffneOverlay(baueMenue());
    });

    el.overlay.addEventListener('click', function (ev) {
      if (ev.target === el.overlay && !S.fertig) schliesseOverlay();
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') {
        if (overlayOffen()) {
          if (!S.fertig) schliesseOverlay();
        } else {
          oeffneOverlay(baueMenue());
        }
        return;
      }
      /* Kuerzel nur am Brett. Sonst tippt man in der Nameneingabe ein
       * T und loest statt dessen einen Tipp aus. */
      if (overlayOffen()) return;
      if (ev.key === 't' || ev.key === 'T') tipp();
      if (ev.key === 's' || ev.key === 'S') spicken();
    });

    global.addEventListener('resize', function () {
      if (S && S.auswahl.length) zeichneSpur();
    });
  }

  function los() {
    ['brett', 'brettRahmen', 'spur', 'spurKapsel', 'titel',
     'auszahlung', 'abzug', 'plan', 'extra', 'rest',
     'btnTipp', 'tippText', 'btnSpicken', 'spickenText', 'btnMenu', 'menuText',
     'lblAuszahlung', 'lblPlan', 'overlay', 'overlayInhalt'].forEach(function (id) {
      el[id] = $(id);
    });

    /* Beschriftungen aendern sich nie, also nur einmal setzen. */
    schreib(el.lblAuszahlung, 'AUSZAHLUNG', { scale: 2, color: CREME });
    schreib(el.lblPlan, 'GEWINNPLAN', { scale: 2, color: CREME });

    verdrahte();

    var stand = ladeStand();
    neuerBeutezug();

    /* Beim allerersten Besuch gleich erklaeren, worum es geht. */
    if (!stand.schonGespielt) {
      stand.schonGespielt = true;
      speichereStand(stand);
      oeffneOverlay(baueAnleitung());
    }
  }

  /* Kleiner Griff von aussen: praktisch zum Nachstellen einer Runde in
   * der Konsole und fuer die Tests in tools/. */
  global.Beutezug = {
    get zustand() { return S; },
    get lauf() { return L; },
    get topf() { return topf(); },
    starteLevel: starteLevel,
    neuerBeutezug: neuerBeutezug,
    bestenliste: ladeListe,
    kosten: KOSTEN
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', los);
  } else {
    los();
  }
})(window);
