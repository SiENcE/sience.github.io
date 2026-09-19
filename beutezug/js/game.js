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
    merkeModus(L.leicht);
    starteLevel(0);
  }

  /* Der zuletzt gespielte Modus. Er entscheidet, welches Brett beim
   * naechsten Start hinter dem Hauptmenue liegt -- und er ist die
   * Vorgabe, wenn ein Beutezug ohne ausdrueckliche Wahl beginnt. */
  function merkeModus(leicht) {
    var stand = ladeStand();
    if (!!stand.kinderModus === !!leicht) return;
    stand.kinderModus = !!leicht;
    speichereStand(stand);
  }

  /* Der Modus des laufenden Beutezugs -- gebraucht ueberall dort, wo
   * "noch einer" gemeint ist und nicht "einer wie beim ersten Start". */
  function leichterModus() {
    return !!(L && L.leicht);
  }

  /* Was gerade auf dem Spiel steht: gesicherte Beute plus das, was im
   * laufenden Auftrag schon zusammengekommen ist. */
  function topf() {
    return L.topf + (S ? S.punkte : 0);
  }

  /* Der Einsatz waechst mit jedem Auftrag. Genau daraus entsteht die
   * Entscheidung am Ende eines Auftrags: noch einer, oder abhauen? */
  function einsatzFaktor() {
    return S.einsatzfrei ? 0 : Math.max(1, S.levelNr);
  }

  /* Kinder und Erwachsene teilen sich die Bestenliste nicht -- die
   * Zahlen entstehen unter zu verschiedenen Bedingungen. */
  function listenSchluessel(leicht) {
    return leicht ? 'bestenlisteKinder' : 'bestenliste';
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
      einsatz: 0,
      angezeigt: L ? L.topf : 0,
      leicht: leicht,
      /* Der erste Auftrag ist zum Ueben: Tipp, Spicken und Fehlgriffe
       * kosten nichts. Ab dem zweiten wird abgerechnet -- im
       * Kindermodus nie. */
      einsatzfrei: nummer === 0 || leicht,
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
    /* Gemessen wird an der Tafel: #titel selbst ist so breit wie sein
     * Inhalt und wuesste nie, dass der zu breit ist. */
    passeAn(el.titel.parentNode);
    zeichneAuszahlung();
    zeichnePlan();
    zeichneFuss();
    zeichneSpur();
  }

  function zeichneAuszahlung() {
    schreib(el.auszahlung, zahl(S.angezeigt, 6), {
      scale: 6, color: GOLD, shadow: '#3a2a00'
    });
    if (S.einsatz > 0) {
      el.einsatz.hidden = false;
      schreib(el.einsatz, 'EINSATZ -' + S.einsatz, { scale: 2, color: ROT });
    } else {
      el.einsatz.hidden = true;
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
    var faktor = einsatzFaktor();
    schreib(el.tippText,
      faktor ? 'TIPP ' + KOSTEN.tipp * faktor : 'TIPP GRATIS',
      { scale: 3, color: GOLD });
    schreib(el.spickenText,
      faktor ? 'SPICKEN ' + KOSTEN.spicken * faktor : 'SPICKEN GRATIS',
      { scale: 2, color: GOLD });
    schreib(el.menuText, 'MENÜ', { scale: 3, color: CREME });

    /* Auf einem schmalen Telefon ist "TIPP GRATIS" in scale 3 breiter
     * als der Knopf, und der schiebt MENÜ aus dem Bild. */
    passeAn(el.btnTipp);
    passeAn(el.btnMenu);
  }

  /* ---------------------------------------------------------------- */
  /* Worte pruefen                                                     */

  function istWort(wort) {
    return wort.length >= 3 && Woerter.DICT.has(wort);
  }

  /* Ein Einsatz mindert die Auszahlung und wird zugleich ausgewiesen,
   * damit am Ende nachvollziehbar bleibt, wo der Gewinn geblieben ist.
   * Auf dem Uebungsauftrag setzt man nichts. */
  function zahleEinsatz(betrag) {
    var faktor = einsatzFaktor();
    if (!faktor) return 0;

    betrag *= faktor;
    S.einsatz += betrag;
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
      zahleEinsatz(KOSTEN.fehler);
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
      /* Laeuft in beide Richtungen -- ein Einsatz zaehlt den Topf
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

    zahleEinsatz(KOSTEN.tipp);

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
    zahleEinsatz(KOSTEN.spicken);

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

    var bonus = Math.max(0, 200 - S.einsatz);
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
      oeffneOverlay(baueBestenliste());
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
      ['EINSATZ', '-' + S.einsatz],
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
      ['NÄCHSTER AUFTRAG: EINSATZ MAL ' + naechsterFaktor, ROT],
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
      ['NEUER BEUTEZUG', function () {
        var wieder = leichterModus();
        schliesseOverlay();
        neuerBeutezug(wieder);
      }],
      ['BESTENLISTE', function () { oeffneOverlay(baueBestenliste()); }]
    ]));

    box.appendChild(knopfReihe([
      ['HAUPTMENÜ', function () { oeffneOverlay(baueStartschirm()); }]
    ]));

    return box;
  }

  /* ---------------------------------------------------------------- */
  /* Bestenliste                                                       */

  var PLAETZE = 10;
  var TASTEN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  var eingabeHaken = null;

  function ladeListe(leicht) {
    var liste = ladeStand()[listenSchluessel(
      arguments.length ? leicht : leichterModus())];
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
    stand[listenSchluessel(leichterModus())] = liste;
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
   * opts.neu      Platz des gerade eingetragenen Ergebnisses
   * opts.zurueck  Bauer des Dialogs, aus dem heraus geblaettert wurde;
   *               fehlt er, ist das der Schluss eines Beutezugs
   * opts.leicht   welche der beiden Listen -- sonst die des Laufs
   */
  function baueBestenliste(opts) {
    opts = opts || {};
    var leicht = opts.leicht === undefined ? leichterModus() : !!opts.leicht;
    var liste = ladeListe(leicht);

    var box = document.createElement('div');
    box.className = 'dialog';
    box.fest = dialogFest;

    var h = document.createElement('div');
    h.className = 'dialogtitel';
    h.appendChild(PF.render(
      leicht ? 'BESTE KINDER' : 'BESTENLISTE',
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
        /* pfreihe: die vier Spalten suchen sich eine gemeinsame
         * Schriftgroesse, statt jede fuer sich zu schrumpfen. */
        zeile.className = 'rang pfreihe' + (i === opts.neu ? ' neu' : '');
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
    if (opts.neu === undefined && !opts.zurueck && L && L.vorbei) {
      var eigen = document.createElement('div');
      eigen.className = 'hinweise';
      eigen.appendChild(PF.render('DIESER BEUTEZUG: ' + zahl(L.topf, 6),
        { scale: 2, color: CREME }));
      eigen.appendChild(PF.render('HAT NICHT GEREICHT.', { scale: 2, color: GOLD_MATT }));
      box.appendChild(eigen);
    }

    /* Zwei Listen, ein Dialog -- sonst muesste man raten, wo die Zahl
     * gelandet ist, die man gerade eingetragen hat. */
    if (opts.zurueck) {
      box.appendChild(knopfReihe([
        [leicht ? 'BESTENLISTE' : 'BESTE KINDER', function () {
          oeffneOverlay(baueBestenliste({ zurueck: opts.zurueck, leicht: !leicht }));
        }],
        ['ZURÜCK', function () { oeffneOverlay(opts.zurueck()); }]
      ]));
    } else {
      /* "NEUER BEUTEZUG" heisst: noch einer wie der gerade beendete.
       * Wer aus dem Kindermodus kommt, will nicht ungefragt bei den
       * Erwachsenen landen. */
      box.appendChild(knopfReihe([
        ['NEUER BEUTEZUG', function () {
          var wieder = leichterModus();
          schliesseOverlay();
          neuerBeutezug(wieder);
        }],
        ['HAUPTMENÜ', function () { oeffneOverlay(baueStartschirm()); }]
      ]));
    }

    return box;
  }

  /* ---------------------------------------------------------------- */
  /* Overlay: Menue, Anleitung, Spickzettel                            */

  /* Manche Dialoge sind kein Zwischenstopp, sondern der Ort, an dem das
   * Spiel gerade steht: das Hauptmenue vor dem ersten Zug, die
   * Abrechnung nach dem letzten. Sie gehen nur ueber einen ihrer
   * Knoepfe weg -- ein Klick daneben oder Esc laesst sie stehen. */
  var dialogFest = false;

  function darfWeg() {
    return !dialogFest && !(S && S.fertig);
  }

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

  /* ----------------------------------------------------------------
   * Enge Bildschirme
   *
   * Die Pixelschrift wird in festen Bildschirmpixeln gezeichnet: eine
   * Zeile mit 42 Zeichen in scale 2 ist 502px breit und haengt auf
   * einem 320px-Telefon links und rechts heraus. Beim Bauen weiss ein
   * Dialog seine Breite noch nicht -- also wird erst gemessen, wenn er
   * haengt, und dann nachgesetzt.
   *
   * Nachgesetzt wird in dieser Reihenfolge: erst umbrechen, und nur
   * wenn nicht einmal eine einzelne Glyphe in die Breite passt,
   * verkleinern. Umgekehrt herum waere die Anleitung auf dem Telefon
   * zwar vollstaendig da, aber zu klein zum Lesen -- und gelesen wird
   * sie von jemandem, der das Spiel noch nicht kennt.
   */

  function px(wert) {
    var n = parseFloat(wert);
    return isNaN(n) ? 0 : n;
  }

  /* Wieviel Platz hat eine Zeile an dieser Stelle? Gemessen wird nicht
   * am Elternteil: ein Flexkind richtet sich nach seinem Inhalt und
   * meldet die bereits zu grosse Breite brav zurueck. Also zaehlt der
   * Dialog, abzueglich aller Polster und Raender auf dem Weg dorthin. */
  function platzFuer(cv, wurzel) {
    var s = getComputedStyle(wurzel);
    var w = wurzel.clientWidth - px(s.paddingLeft) - px(s.paddingRight);
    for (var n = cv.parentNode; n && n !== wurzel; n = n.parentNode) {
      var p = getComputedStyle(n);
      w -= px(p.paddingLeft) + px(p.paddingRight) +
           px(p.borderLeftWidth) + px(p.borderRightWidth);
    }
    return Math.max(PF.CELL_W, Math.floor(w));
  }

  /* Breite einer Vorlage in Fontpixeln. Schatten und Polster zaehlen
   * mit: sie kosten Breite, ohne Text zu sein. */
  function fontBreite(roh) {
    var o = roh.opts || {};
    var tracking = (o.tracking === undefined) ? 1 : o.tracking;
    return PF.measure(roh.text, tracking) +
      (o.shadow ? 1 : 0) + (o.pad || 0) * 2;
  }

  /* Wie breit waere diese Zeile, wenn sie ungebremst gesetzt wuerde?
   * Nicht offsetWidth fragen: ein `max-width: 100%` im Stylesheet
   * staucht das Canvas vorher und meldet brav "passt" zurueck -- das
   * Ergebnis waere eine gequetschte, unscharfe Zeile statt einer
   * umgebrochenen. */
  function sollBreite(roh) {
    return fontBreite(roh) * ((roh.opts || {}).scale || 3);
  }

  /* Die Vorlage einer Stelle: das, woraus sie urspruenglich entstand. */
  function rohVon(stelle) {
    return stelle.pfRoh ||
      (stelle.pfText ? { text: stelle.pfText, opts: stelle.pfOpts } : null);
  }

  /* Eine Reihe setzt mehrere Stuecke nebeneinander -- die Bestenliste
   * etwa Platz, Kuerzel, Summe und Auftraege. Vier Spalten in vier
   * verschiedenen Groessen saehen aus wie ein Fehler, also sucht die
   * Reihe eine Groesse fuer alle: die groesste, in der ihre Stuecke
   * zusammen noch nebeneinander passen. */
  function passeReiheAn(reihe) {
    var stuecke = Array.prototype.slice
      .call(reihe.querySelectorAll('canvas.pf'));
    if (!stuecke.length) return;

    var rohs = [];
    for (var i = 0; i < stuecke.length; i++) {
      var roh = rohVon(stuecke[i]);
      if (!roh) return;
      rohs.push(roh);
    }

    var s = getComputedStyle(reihe);
    var platz = reihe.clientWidth - px(s.paddingLeft) - px(s.paddingRight) -
      px(s.columnGap) * (stuecke.length - 1);

    var skala = 1;
    var gesamt = 0;
    rohs.forEach(function (r) {
      skala = Math.max(skala, (r.opts || {}).scale || 3);
      gesamt += fontBreite(r);
    });
    while (skala > 1 && gesamt * skala > platz) skala--;

    stuecke.forEach(function (cv, k) {
      var o = {};
      Object.keys(rohs[k].opts || {}).forEach(function (n) {
        o[n] = rohs[k].opts[n];
      });
      o.scale = skala;
      var neu = PF.render(rohs[k].text, o);
      neu.pfRoh = rohs[k];
      cv.parentNode.replaceChild(neu, cv);
    });
  }

  /* Setzt eine Zeile neu -- immer aus der Vorlage, nie aus dem, was
   * gerade dasteht. Wer das Telefon zurueckdreht, bekommt so seine
   * lange Zeile wieder, statt auf dem engen Umbruch sitzenzubleiben.
   *
   * Aus einer Zeile koennen mehrere werden, und die stecken in einem
   * eigenen Kaestchen: sonst zerfiele der Satz im Flexkasten der
   * Hinweise in lauter gleichberechtigte Zeilen, und die Abstaende
   * zwischen den Saetzen stimmten nicht mehr. */
  function setzeNeu(alt, roh, platz) {
    var o = {};
    Object.keys(roh.opts || {}).forEach(function (k) { o[k] = roh.opts[k]; });

    var text = roh.text;
    var tracking = (o.tracking === undefined) ? 1 : o.tracking;
    /* Schatten und Polster kosten Breite, ohne Text zu sein. */
    var zuschlag = (o.shadow ? 1 : 0) + (o.pad || 0) * 2;
    /* Verkleinert wird nach dem laengsten Wort, nicht nach dem
     * laengsten Satz: ein Satz darf umbrechen, ein Wort nicht. Sonst
     * steht ueber dem Hauptmenue "BEUTEZU" und darunter "G". */
    var breitestes = 0;
    text.split(/\s+/).forEach(function (wort) {
      breitestes = Math.max(breitestes, PF.measure(wort, tracking));
    });
    var skala = o.scale || 3;
    while (skala > 1 && (breitestes + zuschlag) * skala > platz) skala--;
    o.scale = skala;

    var zeilen = PF.wrap(text, platz / skala - zuschlag, tracking);
    var ersatz;

    if (zeilen.length < 2) {
      ersatz = PF.render(zeilen[0], o);
    } else {
      ersatz = document.createElement('div');
      ersatz.className = 'pfblock';
      /* Vorgelesen wird der Satz am Stueck, nicht Zeile fuer Zeile. */
      ersatz.setAttribute('role', 'img');
      ersatz.setAttribute('aria-label',
        o.label !== undefined ? o.label : text);
      zeilen.forEach(function (zeile) {
        var teil = PF.render(zeile, o);
        teil.removeAttribute('role');
        teil.removeAttribute('aria-label');
        teil.setAttribute('aria-hidden', 'true');
        ersatz.appendChild(teil);
      });
    }

    ersatz.pfRoh = roh;
    alt.parentNode.replaceChild(ersatz, alt);
  }

  /* Einmal ueber alles, was unter `wurzel` gesetzt ist. Die Liste wird
   * vorab eingefroren, weil sie sich unter der Hand aendert.
   *
   * `wurzel` muss der naechste Kasten mit einer festen Breite sein --
   * fuer einen Dialog der Dialog selbst, fuer einen Knopf der Knopf. */
  function passeAn(wurzel) {
    if (!wurzel || !wurzel.querySelectorAll) return;

    /* Zuerst die Reihen: sie setzen mehrere Stuecke auf einmal neu. */
    Array.prototype.slice
      .call(wurzel.querySelectorAll('.pfreihe')).forEach(passeReiheAn);

    Array.prototype.slice
      .call(wurzel.querySelectorAll('canvas.pf, .pfblock'))
      .forEach(function (stelle) {
        if (!stelle.parentNode) return;
        /* Die Zeilen in einem Kaestchen gehoeren dem Kaestchen. */
        if (stelle.parentNode.classList.contains('pfblock')) return;
        /* Und die Stuecke einer Reihe gehoeren der Reihe. */
        if (stelle.parentNode.closest('.pfreihe')) return;

        var roh = rohVon(stelle);
        if (!roh) return;

        var platz = platzFuer(stelle, wurzel);
        /* Was noch nie angefasst wurde und passt, bleibt, wie es ist. */
        if (!stelle.pfRoh && sollBreite(roh) <= platz) return;
        setzeNeu(stelle, roh, platz);
      });
  }

  function oeffneOverlay(inhalt) {
    /* Jeder Dialogwechsel raeumt einen etwaigen Tastaturhaken der
     * Nameneingabe weg, sonst tippt man spaeter ins Leere. */
    loeseEingabeHaken();
    dialogFest = !!inhalt.fest;
    el.overlayInhalt.textContent = '';
    el.overlayInhalt.appendChild(inhalt);
    el.overlay.classList.add('offen');

    /* Erst sichtbar, dann messbar: jetzt steht fest, wie breit der
     * Dialog wirklich ist. */
    passeAn(inhalt);

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
    dialogFest = false;
    el.overlay.classList.remove('offen');
    el.overlayInhalt.textContent = '';
  }

  /* Laeuft gerade ein Beutezug, in den sich zurueckkehren lohnt? Das
   * frisch gebaute Brett hinter dem Hauptmenue zaehlt nicht -- erst
   * wer etwas gefunden oder verloren hat, hat etwas zu verlieren. */
  function spielLaeuft() {
    return !!(S && !S.fertig && L &&
      (L.auftraege > 0 || S.gefundenZiele.size > 0 || S.einsatz > 0));
  }

  /*
   * Das Hauptmenue: beim Start und nach jedem beendeten Beutezug.
   * Es traegt die einzige Entscheidung, die vor dem Spiel steht --
   * fuer wen ist die Runde. Bisher fiel die nebenbei im Menue, und
   * jeder Weg zurueck ins Spiel landete stillschweigend wieder bei
   * den Erwachsenen.
   */
  function baueStartschirm() {
    var box = document.createElement('div');
    box.className = 'dialog anleitung';
    /* Kein Klick daneben, kein Esc: hinter diesem Schirm liegt ein
     * Brett, das noch niemand gewaehlt hat. */
    box.fest = true;

    var marke = document.createElement('div');
    marke.className = 'mittig';
    marke.appendChild(PF.render(NAME, { scale: 6, color: GOLD, shadow: '#3a2a00' }));
    box.appendChild(marke);

    var unter = document.createElement('div');
    unter.className = 'mittig marke';
    unter.appendChild(PF.render('DIE EMOJI-WORTJAGD', {
      scale: 2, color: GOLD_MATT, tracking: 2
    }));
    box.appendChild(unter);

    if (spielLaeuft()) {
      box.appendChild(knopfReihe([['WEITER SPIELEN', schliesseOverlay]]));
    }

    box.appendChild(knopfReihe([
      ['ERWACHSENE', function () { schliesseOverlay(); neuerBeutezug(false); }],
      ['FÜR KINDER', function () { schliesseOverlay(); neuerBeutezug(true); }]
    ]));

    /* Was die beiden Knoepfe unterscheidet, und zwar in dem, was man
     * beim Spielen merkt: wo die Woerter liegen und was es kostet.
     * Der Knopf heisst nach der Zielgruppe, nicht nach dem Spiel --
     * "BEUTEZUG" stand vorher neben "FÜR KINDER" und las sich wie
     * zwei verschiedene Spiele statt wie zwei Schwierigkeiten. */
    [
      [['ERWACHSENE: WÖRTER IN JEDER RICHTUNG,',
        'AUCH RÜCKWÄRTS. HILFEN KOSTEN EINSATZ.'], CREME],
      [['FÜR KINDER: EIN WORT VON LINKS,',
        'VIELE KACHELN ZEIGEN IHREN BUCHSTABEN.'], CYAN]
    ].forEach(function (block) {
      var was = document.createElement('div');
      was.className = 'hinweise';
      block[0].forEach(function (zeile) {
        was.appendChild(PF.render(zeile, { scale: 2, color: block[1] }));
      });
      box.appendChild(was);
    });

    box.appendChild(knopfReihe([
      ['ANLEITUNG', function () { oeffneOverlay(baueAnleitung(baueStartschirm)); }],
      ['BESTENLISTE', function () {
        oeffneOverlay(baueBestenliste({ zurueck: baueStartschirm }));
      }]
    ]));

    box.appendChild(knopfReihe([
      [Klang.an ? 'TON: AN' : 'TON: AUS', function () {
        Klang.an = !Klang.an;
        oeffneOverlay(baueStartschirm());
      }]
    ]));

    return box;
  }

  function baueMenue() {
    var box = document.createElement('div');
    box.className = 'dialog';
    box.fest = dialogFest;

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
      ['ANLEITUNG', function () { oeffneOverlay(baueAnleitung(baueMenue)); }],
      ['SPICKZETTEL', function () { oeffneOverlay(baueSpickzettel()); }]
    ]));

    /* "Neues Brett" gibt es bewusst nicht mehr: wer ein ungeliebtes
     * Brett neu wuerfeln darf, hat kein Risiko mehr zu tragen. Wer
     * aussteigen will, haut ab und sichert den Topf. */
    box.appendChild(knopfReihe([
      ['BESTENLISTE', function () {
        oeffneOverlay(baueBestenliste({ zurueck: baueMenue }));
      }],
      [Klang.an ? 'TON: AN' : 'TON: AUS', function () {
        Klang.an = !Klang.an;
        oeffneOverlay(baueMenue());
      }]
    ]));

    /* Der Modus wird nicht umgeschaltet, sondern neu begonnen -- ein
     * halb gespielter Beutezug liesse sich sonst nicht vergleichen.
     * "NEUER BEUTEZUG" heisst dabei: noch einer wie dieser. Wer den
     * Modus wechseln will, geht ueber das Hauptmenue. */
    box.appendChild(knopfReihe([
      ['NEUER BEUTEZUG', function () {
        var leicht = leichterModus();
        schliesseOverlay();
        neuerBeutezug(leicht);
      }],
      ['HAUPTMENÜ', function () { oeffneOverlay(baueStartschirm()); }]
    ]));

    return box;
  }

  /* Die wichtigste Huerde ist nicht die Wortsuche, sondern der Gedanke
   * dahinter: das Bild ist nicht die Antwort, das Bild ist ein
   * Buchstabe. Also steht genau das gross und zuerst da -- und zwar
   * ausgeschrieben, denn "Emojis sind Buchstaben, keine Antwort" war
   * ein Merksatz fuer jemanden, der die Regel schon kennt. Ein Kind
   * braucht sie ausbuchstabiert: das Bild heisst PIZZA, PIZZA faengt
   * mit P an, also ist die Kachel ein P.
   *
   * zurueck: der Dialog, aus dem heraus geoeffnet wurde -- als Bauer,
   * nicht als fertiger Knoten, damit er beim Zurueckgehen frische
   * Zahlen zeigt. Ohne ihn ist das der allererste Besuch, und dann
   * steht unten nicht "ZURÜCK", sondern die Wahl. */
  function baueAnleitung(zurueck) {
    var box = document.createElement('div');
    box.className = 'dialog anleitung';
    box.fest = dialogFest;

    /* Der Spielname steht klein obendrueber wie der Schriftzug auf dem
     * Automatengehaeuse -- die Schlagzeile darunter hat den Auftritt. */
    var marke = document.createElement('div');
    marke.className = 'mittig marke';
    marke.appendChild(PF.render(NAME, { scale: 3, color: GOLD_MATT, tracking: 3 }));
    box.appendChild(marke);

    var kopf = document.createElement('div');
    kopf.className = 'schlagzeile';
    [['JEDES BILD IST', GOLD], ['EIN BUCHSTABE', CYAN]]
      .forEach(function (zeile) {
        kopf.appendChild(PF.render(zeile[0], {
          scale: 5, color: zeile[1], shadow: '#08220f'
        }));
      });
    kopf.appendChild(PF.render('UND ZWAR DER, MIT DEM SEIN NAME ANFÄNGT.',
      { scale: 2, color: CREME }));
    box.appendChild(kopf);

    /* Der Name steht mit unter dem Bild. Ohne ihn muss man die Regel
     * schon kennen, um das Beispiel zu verstehen -- und genau die soll
     * es ja erst zeigen. */
    var beispiele = document.createElement('div');
    beispiele.className = 'beispiele';
    [['🍕', 'PIZZA', 'P'], ['🦁', 'LÖWE', 'L'], ['🚀', 'RAKETE', 'R']]
      .forEach(function (paar) {
        var spalte = document.createElement('div');
        spalte.className = 'beispiel';

        var bild = document.createElement('span');
        bild.className = 'beispielemoji';
        bild.textContent = paar[0];

        spalte.appendChild(bild);
        spalte.appendChild(PF.render(paar[1], { scale: 2, color: CREME }));
        spalte.appendChild(PF.render('↓', { scale: 3, color: '#6fbf8a' }));
        spalte.appendChild(PF.render(paar[2], { scale: 5, color: GOLD, box: 'base' }));
        beispiele.appendChild(spalte);
      });
    box.appendChild(beispiele);

    var satz = document.createElement('div');
    satz.className = 'mittig';
    satz.appendChild(PF.render('ERST MEHRERE BILDER ERGEBEN EIN WORT.',
      { scale: 2, color: GOLD }));
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
      ['ZIEH MIT DEM FINGER ÜBER MEHRERE BILDER.', CYAN],
      ['GEDRÜCKT HALTEN – NICHT EINZELN TIPPEN.', CYAN],
      ['IMMER GERADEAUS: QUER, RUNTER, SCHRÄG.', CREME],
      ['STIMMT DAS WORT, KLINGELT DIE KASSE.', CREME],
      ['RECHTS STEHT, WELCHE WÖRTER GESUCHT SIND.', CREME],
      ['STECKST DU FEST, HILFT TIPP ODER SPICKEN.', GOLD],
      ['AB AUFTRAG 2 KOSTEN SIE EINSATZ.', GOLD],
      ['FÜR KINDER: EIN WORT VON LINKS NACH', CYAN],
      ['RECHTS, UND NICHTS KOSTET ETWAS.', CYAN]
    ].forEach(function (zeile) {
      hinweise.appendChild(PF.render(zeile[0], { scale: 2, color: zeile[1] }));
    });
    box.appendChild(hinweise);

    /* Beim ersten Besuch steht hier "LOS GEHT'S" und der Knopf
     * schliesst; sonst fuehrt er dahin zurueck, wo man herkam. */
    box.appendChild(knopfReihe(
      zurueck
        ? [['ZURÜCK', function () { oeffneOverlay(zurueck()); }]]
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
    box.fest = dialogFest;

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
      if (ev.target === el.overlay && darfWeg()) schliesseOverlay();
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') {
        if (overlayOffen()) {
          if (darfWeg()) schliesseOverlay();
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
      /* Gedreht wird das Telefon mitten im Dialog. Der Neuaufbau
       * kaeme dafuer zu spaet -- also nachmessen, solange er steht. */
      if (overlayOffen()) passeAn(el.overlayInhalt.firstElementChild);
    });
  }

  function los() {
    ['brett', 'brettRahmen', 'spur', 'spurKapsel', 'titel',
     'auszahlung', 'einsatz', 'plan', 'extra', 'rest',
     'btnTipp', 'tippText', 'btnSpicken', 'spickenText', 'btnMenu', 'menuText',
     'lblAuszahlung', 'lblPlan', 'overlay', 'overlayInhalt'].forEach(function (id) {
      el[id] = $(id);
    });

    /* Beschriftungen aendern sich nie, also nur einmal setzen. */
    schreib(el.lblAuszahlung, 'AUSZAHLUNG', { scale: 2, color: CREME });
    schreib(el.lblPlan, 'GEWINNPLAN', { scale: 2, color: CREME });

    verdrahte();

    var stand = ladeStand();
    var erstesMal = !stand.schonGespielt;
    if (erstesMal) {
      stand.schonGespielt = true;
      speichereStand(stand);
    }

    /* Hinter dem Startdialog liegt schon ein Brett -- ein Automat, der
     * dunkel dasteht, sieht kaputt aus. Gespielt wird es erst, wenn im
     * Hauptmenue jemand einen Modus waehlt; bis dahin ist es Kulisse
     * im zuletzt gespielten Modus. */
    neuerBeutezug(!!stand.kinderModus);

    /* Beim allerersten Besuch gleich erklaeren, worum es geht -- die
     * Anleitung nennt die beiden Modi selbst, ein Hauptmenue davor
     * waere eine Frage ohne Grundlage. */
    oeffneOverlay(erstesMal ? baueAnleitung() : baueStartschirm());
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
