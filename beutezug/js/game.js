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
  var Sprache = global.Sprache;

  var GOLD = '#ffd23f';
  var GOLD_MATT = '#9a7a26';
  var CYAN = '#5ce1ff';
  var ROT = '#ff4d6d';
  var CREME = '#fff3d6';

  /* Jedes gefundene Wort bekommt eine eigene Umrandung, damit man auf
   * dem vollen Brett noch sieht, welche Kachel zu welchem Fund gehoert. */
  var WORTFARBEN = [
    '#ff4fd8', '#5ce1ff', '#ffd23f', '#7cff6b', '#ff9f45',
    '#b78bff', '#ff6b6b', '#5bffd0', '#ffe66d', '#77b6ff'
  ];

  var NAME = 'BEUTEZUG';
  /* Der Mittelpunkt, der in einem verdeckten Wort fuer jeden noch
   * unbekannten Buchstaben steht. Als Zeichencode, damit die Quelle
   * reines ASCII bleibt. */
  var MASKE = String.fromCharCode(0xb7);
  /* Ein Zug ohne Wort kostet 5 mal den Faktor (faktorFuer). Tipp und
   * Spicken haben keinen festen Preis mehr, siehe hilfePreise(). */
  var KOSTEN = { fehler: 5 };
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

  /* Fehlzuege und der Sauber-Bonus wachsen in Zehnerschritten mit:
   * auf Auftrag 12 kostet ein Fehlzug 10, auf Auftrag 60 kostet er 30. */
  function faktorFuer(nummer) {
    return 1 + Math.floor(nummer / 10);
  }

  /*
   * Was Hilfe kostet, haengt daran, was der Auftrag einbringt -- nicht
   * an einem festen Satz. Sonst lohnt sie sich immer: wer jedes Wort per
   * Tipp aufdeckt, verdient trotzdem, und Spicken zeigt fuer ein paar
   * Muenzen das ganze Brett.
   *
   * Der Tipp kostet einen Anteil dessen, was ein gesuchtes Wort im
   * Schnitt bringt: auf den ersten Auftraegen die Haelfte, ab Auftrag 25
   * das ganze Wort, spaeter bis zum Eindreiviertelfachen. Wer dann jedes
   * Wort ertippt, zahlt drauf. Spicken zeigt alles auf einmal und kostet
   * darum einen Anteil der ganzen Auszahlung: ein Zehntel am Anfang, bis
   * sechs Zehntel am Ende -- dreimal Spicken frisst ab Auftrag 30 mehr,
   * als das Brett einbringt.
   *
   * Hilfe bleibt damit erlaubt, aber sie ist ein Notgroschen und keine
   * Abkuerzung mehr. Der Preis steht fest, sobald der Auftrag steht, und
   * die Abrechnung davor nennt ihn schon.
   */
  function hilfePreise(nummer, worte) {
    var summe = worte.reduce(function (a, w) { return a + punkteFuer(w, true); }, 0);
    var tippAnteil = Math.min(1.75, 0.5 + nummer / 50);
    var spickAnteil = 0.1 + nummer / 200;
    return {
      tipp: aufFuenf(summe * tippAnteil / worte.length),
      spicken: aufFuenf(summe * spickAnteil)
    };
  }

  function aufFuenf(betrag) {
    return Math.max(5, Math.round(betrag / 5) * 5);
  }

  /* Kinder und Erwachsene teilen sich die Bestenliste nicht -- die
   * Zahlen entstehen unter zu verschiedenen Bedingungen. Und Sprachen
   * teilen sie auch nicht: ein englisches Brett bringt andere Woerter
   * und andere Extrafunde. Deutsch behaelt die alten Schluessel, damit
   * bereits erspielte Listen nicht verschwinden. */
  function listenSchluessel(leicht) {
    var basis = leicht ? 'bestenlisteKinder' : 'bestenliste';
    var code = Sprache.aktiv();
    return code === 'de' ? basis : basis + '-' + code;
  }

  /* ---------------------------------------------------------------- */
  /* Sprache                                                           */
  /*                                                                   */
  /* Die Sprache steckt nicht nur in den Knoepfen: dieselbe Katze ist  */
  /* im Deutschen ein K und im Englischen ein C, und das Woerterbuch   */
  /* ist ein voellig anderes. Ein Wechsel kann darum kein laufendes    */
  /* Brett behalten -- er beginnt einen neuen Beutezug.                */

  function setzeSprache(code) {
    Sprache.setze(code);
    document.documentElement.lang = Sprache.aktiv();
    document.title = text('seitentitel');
    beschrifteAutomat();
  }

  /* Von Hand gewaehlt heisst: ab jetzt gilt die Wahl und nicht mehr,
   * was der Browser eingestellt hat. Ohne Wahl folgt das Spiel weiter
   * dem System -- wer sein Telefon auf Englisch stellt, soll das Spiel
   * nicht auf Deutsch wiederfinden. */
  function merkeSprache(code) {
    var stand = ladeStand();
    if (stand.sprache === code) return;
    stand.sprache = code;
    speichereStand(stand);
  }

  /* ---------------------------------------------------------------- */
  /* Kleinkram                                                         */

  function $(id) { return document.getElementById(id); }

  /* Jeder Text, den ein Spieler liest, kommt hier durch. Kurz benannt,
   * weil es sonst der haeufigste Aufruf der Datei waere. */
  function text(schluessel, werte) {
    return Sprache.t(schluessel, werte);
  }

  function textZeilen(schluessel, werte) {
    return Sprache.zeilen(schluessel, werte);
  }

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

  /* mitAlarm: der Spieler hat am Ende des vorigen Auftrags den Alarm
   * angenommen. Er gilt nur, wenn dieser Auftrag auch einen anbietet. */
  function starteLevel(nummer, saat, mitAlarm) {
    stoppeAlarm();
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
      preise: hilfePreise(nummer, auftrag.worte),
      felder: brett.buchstaben.map(function () {
        return { gedreht: false, farbe: null, tipp: false, kurz: 0, nurBuchstabe: false };
      }),
      auswahl: [],
      startFeld: -1,
      zieht: false,
      spicktGerade: false,
      frisch: null,
      fertig: false,
      /* Was die Funde dieses Auftrags eingebracht haben, ohne Einsatz --
       * das verdoppelt ein bestandener Alarm. */
      beute: 0,
      alarm: (mitAlarm && auftrag.alarm && !leicht) ? {
        dauer: auftrag.alarm * 1000,
        verbraucht: 0,
        zuletzt: Date.now(),
        sekunde: null,
        erwischt: false
      } : null
    };

    /* Erst entscheiden, welche Kacheln gar kein Bild bekommen -- das
     * Brett wird danach gebaut, nicht nachtraeglich umgedreht. */
    waehleBuchstabenkacheln();
    baueBrettDom();
    zeichneAlles();
    kuendigeAn();
    starteAlarm();
  }

  /* ---------------------------------------------------------------- */
  /* Alarm                                                             */
  /*                                                                   */
  /* Ab Auftrag 50 bietet jeder fuenfte einen Alarm an (words.js). Wer */
  /* ihn annimmt, spielt gegen die Uhr: rechtzeitig fertig heisst      */
  /* doppelte Beute, erwischt heisst, auf der Flucht bleibt der halbe  */
  /* Topf liegen -- und mit der anderen Haelfte ist der Beutezug zu    */
  /* Ende. Die Uhr steht, solange ein Dialog offen oder die Seite      */
  /* versteckt ist: wer ins Menue schaut, sieht das Brett ohnehin      */
  /* nicht, und ein Anruf soll keinen Topf kosten.                     */

  var alarmUhr = null;

  function starteAlarm() {
    stoppeAlarm();
    if (!S.alarm) return;
    S.alarm.zuletzt = Date.now();
    alarmUhr = setInterval(alarmTick, 200);
  }

  function stoppeAlarm() {
    clearInterval(alarmUhr);
    alarmUhr = null;
  }

  function alarmRest() {
    return Math.max(0, S.alarm.dauer - S.alarm.verbraucht);
  }

  function alarmTick() {
    var A = S && S.alarm;
    if (!A || S.fertig) {
      stoppeAlarm();
      return;
    }
    var jetzt = Date.now();
    /* Hoechstens eine Sekunde pro Schlag: schlaeft das Geraet, ohne
     * die Seite zu verstecken, soll die Uhr nicht einfach springen. */
    if (!overlayOffen() && !document.hidden) {
      A.verbraucht += Math.min(1000, jetzt - A.zuletzt);
    }
    A.zuletzt = jetzt;

    var sekunde = Math.ceil(alarmRest() / 1000);
    if (sekunde !== A.sekunde) {
      A.sekunde = sekunde;
      zeichneAlarm();
      if (sekunde > 0 && sekunde <= 10) Klang.sfx.tick();
    }
    if (alarmRest() <= 0) erwischt();
  }

  /* Die Uhr steht im Titelschild, der ablaufende Balken ueber dem
   * Brett. Beides wird zu Beginn des Auftrags gesetzt, damit der Kopf
   * seine Hoehe nicht mitten im Spiel aendert. */
  function zeichneAlarm() {
    var A = S.alarm;
    el.alarm.hidden = !A;
    el.brettRahmen.classList.toggle('alarm', !!A);
    if (!A) return;
    var rest = alarmRest();
    var sekunden = Math.ceil(rest / 1000);
    var zeit = Math.floor(sekunden / 60) + ':' + ('0' + (sekunden % 60)).slice(-2);
    var knapp = sekunden <= 15;
    el.alarm.classList.toggle('knapp', knapp && !A.erwischt);
    schreib(el.alarm, text('alarm-uhr', { zeit: zeit }),
      { scale: 1.75, color: knapp ? '#ffffff' : GOLD });
    el.brettRahmen.style.setProperty('--alarmrest', (rest / A.dauer * 100) + '%');
  }

  function erwischt() {
    stoppeAlarm();
    S.fertig = true;
    L.vorbei = true;
    S.zieht = false;
    S.alarm.erwischt = true;
    leereAuswahl();
    zeichneAlarm();

    var vorher = Math.max(0, topf());
    var gerettet = Math.floor(vorher / 2);
    L.topf = gerettet;
    S.punkte = 0;

    Klang.sfx.sirene();
    zittern();
    laufePunkteHoch();
    setTimeout(function () { oeffneOverlay(baueErwischt(vorher, gerettet)); }, 900);
  }

  function baueErwischt(vorher, gerettet) {
    var box = document.createElement('div');
    box.className = 'dialog';

    var h = document.createElement('div');
    h.className = 'dialogtitel';
    h.appendChild(PF.render(text('erwischt'),
      { scale: 5, color: ROT, shadow: '#2a0008' }));
    box.appendChild(h);

    var hinweis = document.createElement('div');
    hinweis.className = 'hinweise';
    [
      [text('erwischt-alarm'), CREME],
      [text('erwischt-haelfte'), GOLD]
    ].forEach(function (zeile) {
      hinweis.appendChild(PF.render(zeile[0], { scale: 2, color: zeile[1] }));
    });
    box.appendChild(hinweis);

    var tabelle = document.createElement('div');
    tabelle.className = 'abrechnung';
    [
      [text('im-topf-war'), zahl(vorher, 6), CREME, 2],
      [text('gerettet'), zahl(gerettet, 6), GOLD, 4]
    ].forEach(function (zeile) {
      var links = document.createElement('span');
      links.appendChild(PF.render(zeile[0], { scale: 2, color: zeile[2] }));
      var rechts = document.createElement('span');
      rechts.appendChild(PF.render(zeile[1], { scale: zeile[3], color: zeile[2] }));
      tabelle.appendChild(links);
      tabelle.appendChild(rechts);
    });
    box.appendChild(tabelle);

    /* Die gerettete Haelfte zaehlt wie ein Abhauen: sie kommt in die
     * Bestenliste, wenn sie reicht. */
    box.appendChild(knopfReihe([[text('bestenliste'), haueAb]]));
    return box;
  }

  /*
   * Bringt ein Auftrag etwas Neues, steht es zu Beginn ueber dem Brett:
   * was sich aendert, und in einem Satz, was das heisst. Ohne diese
   * Ansage waere "manche Worte liegen rueckwaerts" eine Falle, keine
   * Stufe. Die Tafel faengt keine Zeiger ab -- wer schon losziehen will,
   * zieht durch sie hindurch, und mit dem ersten Zug ist sie weg.
   */
  function kuendigeAn() {
    clearTimeout(kuendigeAn.uhr);
    var neu = S.auftrag.neu;
    el.neuigkeit.textContent = '';
    el.neuigkeit.classList.remove('zeigt');
    /* Ein angenommener Alarm wird genauso angesagt. Auf eine Sprosse
     * mit Neuerung faellt er nie, also gibt es nur eine Ansage. */
    var titel = S.alarm ? text('alarm-titel') : neu ? text('neu-' + neu) : null;
    var info = S.alarm ? text('alarm-los', { s: S.auftrag.alarm })
      : neu ? text('neu-' + neu + '-info') : null;
    if (!titel) {
      el.neuigkeit.hidden = true;
      return;
    }
    el.neuigkeit.appendChild(PF.render(titel,
      { scale: 2.5, color: S.alarm ? ROT : GOLD, shadow: '#3a2a00' }));
    el.neuigkeit.appendChild(PF.render(info, { scale: 1.5, color: CREME }));
    el.neuigkeit.hidden = false;
    passeAn(el.neuigkeit);
    void el.neuigkeit.offsetWidth;
    el.neuigkeit.classList.add('zeigt');
    kuendigeAn.uhr = setTimeout(beendeAnkuendigung, 3600);
  }

  function beendeAnkuendigung() {
    clearTimeout(kuendigeAn.uhr);
    el.neuigkeit.classList.remove('zeigt');
    kuendigeAn.uhr = setTimeout(function () { el.neuigkeit.hidden = true; }, 400);
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
        ? text('aria-buchstabe', { b: brett.buchstaben[i] })
        : text('aria-kachel', {
            name: brett.kacheln[i].name, b: brett.buchstaben[i]
          }));

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
  /* Spielpult                                                         */

  function zeichneAlles() {
    /* Bei hundert Stufen ist die Nummer der Fortschritt; der Titel
     * allein wiederholt sich, sobald die Themen einmal durch sind. */
    schreib(el.titel, text('auftrag-titel',
      { n: S.levelNr + 1, titel: S.auftrag.titel }), { scale: 1.5, color: CREME });
    if (S.leicht) {
      el.titel.appendChild(PF.render(text('kindermodus'), { scale: 1.5, color: CYAN }));
    }
    /* Gemessen wird an der Tafel: #titel selbst ist so breit wie sein
     * Inhalt und wuesste nie, dass der zu breit ist. */
    zeichneAlarm();
    passeAn(el.titel.parentNode);
    zeichneAuszahlung();
    zeichnePlan();
    zeichneFuss();
    zeichneSpur();
  }

  function zeichneAuszahlung() {
    schreib(el.auszahlung, zahl(S.angezeigt, 6), {
      scale: 3.5, color: GOLD, shadow: '#3a2a00'
    });
    if (S.einsatz > 0) {
      el.einsatz.hidden = false;
      schreib(el.einsatz, text('einsatz', { n: S.einsatz }), { scale: 1.5, color: ROT });
    } else {
      el.einsatz.hidden = true;
    }
  }

  function zeichnePlan() {
    el.plan.textContent = '';
    S.ziele.forEach(function (wort) {
      var gefunden = S.gefundenZiele.has(wort);
      /* Ein verdecktes Wort zeigt nur seinen Anfangsbuchstaben und
       * wie lang es ist. Gefunden wird es dann ganz ausgeschrieben --
       * das ist die Belohnung. Auch das Vorlesewerkzeug bekommt nur
       * die Maske, sonst waere es ein Spickzettel. */
      var anzeige = (!gefunden && S.auftrag.verdeckt.indexOf(wort) !== -1)
        ? wort.charAt(0) + new Array(wort.length).join(MASKE)
        : wort;
      var zeile = document.createElement('span');
      zeile.className = 'planwort'
        + (gefunden ? ' erledigt' : '')
        + (anzeige !== wort ? ' verdeckt' : '')
        + (wort === S.frisch ? ' frisch' : '');
      zeile.appendChild(PF.render(anzeige, {
        scale: 1.75,
        color: gefunden ? GOLD_MATT : CREME,
        strike: gefunden,
        strikeColor: gefunden ? GOLD : CREME
      }));
      el.plan.appendChild(zeile);
    });

    el.gewinnplan.style.setProperty('--fortschritt',
      (S.gefundenZiele.size / S.ziele.length * 100) + '%');
    var extra = S.gefundenExtra.size;
    schreib(el.extra, text('extraworte-zaehler', { a: extra, b: moeglicheExtras() }), {
      scale: 1.5, color: extra ? CYAN : '#a3b6ac'
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
    schreib(el.rest, text('noch', { n: rest }),
      { scale: 1.5, color: rest ? CREME : GOLD });
    var gratis = S.einsatzfrei;
    schreib(el.tippText,
      gratis ? text('tipp-gratis') : text('tipp', { n: S.preise.tipp }),
      { scale: 2, color: GOLD });
    schreib(el.spickenText,
      gratis ? text('spicken-gratis') : text('spicken', { n: S.preise.spicken }),
      { scale: 2, color: GOLD });
    schreib(el.menuText, text('menue'), { scale: 2, color: '#17171c' });

    /* Die drei Aktionen teilen sich auch auf dem Telefon eine Zeile. */
    passeAn(el.btnTipp);
    passeAn(el.btnSpicken);
    passeAn(el.btnMenu);
    passeSpielfeldAn();
  }

  /* Der Platz fuer Karten ergibt sich aus den echten Textzeilen, nicht
   * aus einer geratenen Seitenleistenhoehe. Im Querformat darf die
   * Seite scrollen, bevor die Karten unlesbar klein werden. */
  function passeSpielfeldAn() {
    var stil = getComputedStyle(el.automat);
    var rahmen = getComputedStyle(el.brettRahmen);
    var rest = global.innerHeight - px(stil.paddingTop) - px(stil.paddingBottom) -
      el.kopf.offsetHeight - el.gewinnplan.offsetHeight - el.aktionen.offsetHeight -
      px(stil.rowGap) * 3 - px(rahmen.paddingTop) - px(rahmen.paddingBottom);
    el.brettRahmen.style.setProperty('--hoehe', Math.max(220, rest) + 'px');
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
    if (S.einsatzfrei || !betrag) return 0;

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
      zahleEinsatz(KOSTEN.fehler * faktorFuer(S.levelNr));
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
    S.beute += gewinn;

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

    feiereTreffer(pfad);
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

  function feiereTreffer(pfad) {
    if (sparsam()) return;
    el.beuteAnzeige.classList.remove('kassiert');
    void el.beuteAnzeige.offsetWidth;
    el.beuteAnzeige.classList.add('kassiert');
    setTimeout(function () { el.beuteAnzeige.classList.remove('kassiert'); }, 500);
    pfad.forEach(function (index, i) {
      var kachel = S.kachelDom[index];
      kachel.classList.add('jubel');
      kachel.style.animationDelay = i * 45 + 'ms';
      setTimeout(function () {
        kachel.classList.remove('jubel');
        kachel.style.animationDelay = '';
      }, 500 + i * 45);
    });
  }

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
    if (!el.neuigkeit.hidden) beendeAnkuendigung();
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

    zahleEinsatz(S.preise.tipp);

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
    zahleEinsatz(S.preise.spicken);

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

    /* Der Sauber-Bonus waechst mit dem Einsatz: wer auf Stufe 60 ohne
     * Hilfe durchkommt, hat mehr riskiert als auf Stufe 2. */
    var bonus = Math.max(0, 200 * faktorFuer(S.levelNr) - S.einsatz);
    /* Rechtzeitig vor dem Alarm fertig: die Beute der Funde zaehlt
     * doppelt. Einsatz und Sauber-Bonus bleiben, was sie sind. */
    var alarmBonus = S.alarm ? S.beute : 0;
    stoppeAlarm();
    S.punkte += bonus + alarmBonus;

    /* Die Beute des Auftrags wandert in den Topf. S.punkte wieder auf
     * null, damit topf() denselben Wert behaelt und der Zaehler nicht
     * springt. */
    L.topf = Math.max(0, topf());
    L.auftraege++;
    S.punkte = 0;
    laufePunkteHoch();

    oeffneOverlay(baueAbrechnung(bonus, alarmBonus));
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

  function baueAbrechnung(bonus, alarmBonus) {
    var box = document.createElement('div');
    box.className = 'dialog';

    var h = document.createElement('div');
    h.className = 'dialogtitel';
    h.appendChild(PF.render(text('coup-gelungen'),
      { scale: 5, color: GOLD, shadow: '#3a2a00' }));
    box.appendChild(h);

    var naechster = Woerter.level(S.levelNr + 1, S.leicht);
    var naechstePreise = hilfePreise(S.levelNr + 1, naechster.worte);
    var zeilen = [
      [text('gefunden'),
        text('von', { a: S.gefundenZiele.size, b: S.ziele.length })],
      [text('extraworte'), String(S.gefundenExtra.size)],
      [text('einsatz-zeile'), '-' + S.einsatz],
      [text('sauber-bonus'), '+' + bonus]
    ].concat(S.alarm ? [[text('alarm-bonus'), '+' + alarmBonus]] : [], [
      [text('auftraege'), String(L.auftraege)],
      [text('im-topf'), zahl(L.topf, 6)]
    ]);

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

    /* Die eigentliche Entscheidung des Spiels steht hier -- und dazu
     * gehoert, was der naechste Auftrag Neues bringt. Wer weiss, dass
     * jetzt Koeder kommen, haut vielleicht lieber ab. Kinder setzen
     * nichts, also steht bei ihnen nur die Neuerung. */
    var warnung = document.createElement('div');
    warnung.className = 'hinweise';
    var hinweisZeilen = [];
    if (naechster.neu) {
      hinweisZeilen.push([text('naechste-neuerung',
        { was: text('neu-' + naechster.neu) }), CYAN]);
    }
    /* Bietet der naechste Auftrag einen Alarm an, wird hier gewaehlt:
     * ohne ihn weiter, mit ihm um doppelte Beute, oder gleich abhauen.
     * Die Regel steht dabei, denn genau sie macht die Wahl. */
    var alarm = !S.leicht && naechster.alarm;
    if (alarm) {
      hinweisZeilen.push([text('alarm-angebot', { s: naechster.alarm }), GOLD]);
      hinweisZeilen.push([text('alarm-regel'), CREME]);
    }
    if (!S.leicht) {
      hinweisZeilen.push([text('naechster-einsatz',
        { t: naechstePreise.tipp, s: naechstePreise.spicken }), ROT]);
      if (!alarm) hinweisZeilen.push([text('topf-im-risiko'), CREME]);
    }
    hinweisZeilen.forEach(function (zeile) {
      warnung.appendChild(PF.render(zeile[0], { scale: 2, color: zeile[1] }));
    });
    if (hinweisZeilen.length) box.appendChild(warnung);

    function weiter(mitAlarm) {
      return function () {
        schliesseOverlay();
        starteLevel(S.levelNr + 1, undefined, mitAlarm);
      };
    }
    var abhauen = [text('abhauen', { n: zahl(L.topf, 0) }), function () {
      schliesseOverlay();
      haueAb();
    }];

    if (alarm) {
      box.appendChild(knopfReihe([
        [text('weiter'), weiter(false)],
        [text('mit-alarm'), weiter(true)]
      ]));
      box.appendChild(knopfReihe([abhauen]));
    } else {
      box.appendChild(knopfReihe([[text('weiter'), weiter(false)], abhauen]));
    }

    return box;
  }

  function baueAufgeflogen() {
    var box = document.createElement('div');
    box.className = 'dialog';

    var h = document.createElement('div');
    h.className = 'dialogtitel';
    h.appendChild(PF.render(text('aufgeflogen'),
      { scale: 5, color: ROT, shadow: '#2a0008' }));
    box.appendChild(h);

    var hinweis = document.createElement('div');
    hinweis.className = 'hinweise';
    [
      [text('topf-leer'), CREME],
      [L.auftraege === 1 ? text('raus-nach-eins')
                         : text('raus-nach-viele', { n: L.auftraege }), CREME],
      [text('rechtzeitig'), GOLD]
    ].forEach(function (zeile) {
      hinweis.appendChild(PF.render(zeile[0], { scale: 2, color: zeile[1] }));
    });
    box.appendChild(hinweis);

    box.appendChild(knopfReihe([
      [text('neuer-beutezug'), function () {
        var wieder = leichterModus();
        schliesseOverlay();
        neuerBeutezug(wieder);
      }],
      [text('bestenliste'), function () { oeffneOverlay(baueBestenliste()); }]
    ]));

    box.appendChild(knopfReihe([
      [text('hauptmenue'), function () { oeffneOverlay(baueStartschirm()); }]
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
    h.appendChild(PF.render(text('in-die-bestenliste'), {
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
      L.auftraege === 1 ? text('auftraege-eins')
                        : text('auftraege-viele', { n: L.auftraege }),
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
      weg.appendChild(PF.render(text('loeschen'), { scale: 3, color: CREME }));
      weg.addEventListener('click', loesche);
      knoepfe.appendChild(weg);

      var ok = document.createElement('button');
      ok.className = 'knopf' + (kuerzel.length === 3 ? '' : ' aus');
      ok.type = 'button';
      ok.disabled = kuerzel.length !== 3;
      ok.appendChild(PF.render(text('eintragen'), {
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
      text(leicht ? 'beste-kinder' : 'bestenliste'),
      { scale: 5, color: GOLD, shadow: '#3a2a00' }));
    box.appendChild(h);

    if (!liste.length) {
      var leer = document.createElement('div');
      leer.className = 'mittig';
      leer.appendChild(PF.render(text('nichts-erbeutet'), { scale: 2, color: CREME }));
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
          text('auftraege-kurz', { n: eintrag.auftraege })
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
      eigen.appendChild(PF.render(text('dieser-beutezug', { n: zahl(L.topf, 6) }),
        { scale: 2, color: CREME }));
      eigen.appendChild(PF.render(text('nicht-gereicht'), { scale: 2, color: GOLD_MATT }));
      box.appendChild(eigen);
    }

    /* Zwei Listen, ein Dialog -- sonst muesste man raten, wo die Zahl
     * gelandet ist, die man gerade eingetragen hat. */
    if (opts.zurueck) {
      box.appendChild(knopfReihe([
        [text(leicht ? 'bestenliste' : 'beste-kinder'), function () {
          oeffneOverlay(baueBestenliste({ zurueck: opts.zurueck, leicht: !leicht }));
        }],
        [text('zurueck'), function () { oeffneOverlay(opts.zurueck()); }]
      ]));
    } else {
      /* "NEUER BEUTEZUG" heisst: noch einer wie der gerade beendete.
       * Wer aus dem Kindermodus kommt, will nicht ungefragt bei den
       * Erwachsenen landen. */
      box.appendChild(knopfReihe([
        [text('neuer-beutezug'), function () {
          var wieder = leichterModus();
          schliesseOverlay();
          neuerBeutezug(wieder);
        }],
        [text('hauptmenue'), function () { oeffneOverlay(baueStartschirm()); }]
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
   * Die Canvas-Schrift wird in festen Bildschirmpixeln gezeichnet.
   * Beim Bauen weiss ein Dialog seine Breite noch nicht -- also wird
   * erst gemessen, wenn er haengt, und dann nachgesetzt.
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
    while (skala > 1 && gesamt * skala > platz) skala = Math.max(1, skala - 0.25);

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

    var satz = roh.text;
    var tracking = (o.tracking === undefined) ? 1 : o.tracking;
    /* Schatten und Polster kosten Breite, ohne Text zu sein. */
    var zuschlag = (o.shadow ? 1 : 0) + (o.pad || 0) * 2;
    /* Verkleinert wird nach dem laengsten Wort, nicht nach dem
     * laengsten Satz: ein Satz darf umbrechen, ein Wort nicht. Sonst
     * steht ueber dem Hauptmenue "BEUTEZU" und darunter "G". */
    var breitestes = 0;
    satz.split(/\s+/).forEach(function (wort) {
      breitestes = Math.max(breitestes, PF.measure(wort, tracking));
    });
    var skala = o.scale || 3;
    while (skala > 1 && (breitestes + zuschlag) * skala > platz) skala = Math.max(1, skala - 0.25);
    o.scale = skala;

    var zeilen = PF.wrap(satz, platz / skala - zuschlag, tracking);
    var ersatz;

    if (zeilen.length < 2) {
      ersatz = PF.render(zeilen[0], o);
    } else {
      ersatz = document.createElement('div');
      ersatz.className = 'pfblock';
      /* Vorgelesen wird der Satz am Stueck, nicht Zeile fuer Zeile. */
      ersatz.setAttribute('role', 'img');
      ersatz.setAttribute('aria-label',
        o.label !== undefined ? o.label : satz);
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
    unter.appendChild(PF.render(text('marke-unterzeile'), {
      scale: 2, color: GOLD_MATT, tracking: 2
    }));
    box.appendChild(unter);

    if (spielLaeuft()) {
      box.appendChild(knopfReihe([[text('weiter-spielen'), schliesseOverlay]]));
    }

    box.appendChild(knopfReihe([
      [text('erwachsene'), function () { schliesseOverlay(); neuerBeutezug(false); }],
      [text('fuer-kinder'), function () { schliesseOverlay(); neuerBeutezug(true); }]
    ]));

    /* Was die beiden Knoepfe unterscheidet, und zwar in dem, was man
     * beim Spielen merkt: wo die Woerter liegen und was es kostet.
     * Der Knopf heisst nach der Zielgruppe, nicht nach dem Spiel --
     * "BEUTEZUG" stand vorher neben "FÜR KINDER" und las sich wie
     * zwei verschiedene Spiele statt wie zwei Schwierigkeiten. */
    [
      [textZeilen('was-erwachsene'), CREME],
      [textZeilen('was-kinder'), CYAN]
    ].forEach(function (block) {
      var was = document.createElement('div');
      was.className = 'hinweise';
      block[0].forEach(function (zeile) {
        was.appendChild(PF.render(zeile, { scale: 2, color: block[1] }));
      });
      box.appendChild(was);
    });

    box.appendChild(knopfReihe([
      [text('anleitung'), function () { oeffneOverlay(baueAnleitung(baueStartschirm)); }],
      [text('bestenliste'), function () {
        oeffneOverlay(baueBestenliste({ zurueck: baueStartschirm }));
      }]
    ]));

    /* Ton und Sprache sind beides Schalter am Automatengehaeuse: sie
     * aendern nicht, was gespielt wird, sondern wie es klingt und in
     * welcher Sprache es dasteht. Die Sprache steht nur hier, weil ein
     * Wechsel den Beutezug neu beginnt -- mitten im Spiel waere das
     * ein Knopf, der Beute vernichtet. */
    box.appendChild(knopfReihe([
      [text(Klang.an ? 'ton-an' : 'ton-aus'), function () {
        Klang.an = !Klang.an;
        oeffneOverlay(baueStartschirm());
      }],
      [text('sprache', { name: Sprache.name() }), wechselSprache]
    ]));

    if (spielLaeuft()) {
      var warnung = document.createElement('div');
      warnung.className = 'hinweise';
      warnung.appendChild(PF.render(text('sprache-neustart'),
        { scale: 2, color: GOLD_MATT }));
      box.appendChild(warnung);
    }

    return box;
  }

  /* Ein Sprachwechsel taucht das ganze Spiel um: anderes Alphabet,
   * anderes Woerterbuch, andere Auftraege. Das Brett hinter dem
   * Hauptmenue wird darum neu gebaut, bevor es jemand zu sehen
   * bekommt -- und der Schirm gleich mit, damit er sich selbst in der
   * neuen Sprache beschriftet. */
  function wechselSprache() {
    var neu = Sprache.naechste();
    setzeSprache(neu);
    merkeSprache(neu);
    neuerBeutezug(leichterModus());
    oeffneOverlay(baueStartschirm());
  }

  function baueMenue() {
    var box = document.createElement('div');
    box.className = 'dialog';
    box.fest = dialogFest;

    var h = document.createElement('div');
    h.className = 'dialogtitel';
    h.appendChild(PF.render(text('menue'), { scale: 5, color: GOLD, shadow: '#3a2a00' }));
    box.appendChild(h);

    var liste = ladeListe();
    var info = document.createElement('div');
    info.className = 'abrechnung';
    [
      [text('im-topf'), zahl(Math.max(0, topf()), 6)],
      [text('auftraege-im-zug'), String(L.auftraege)],
      [text('bester-beutezug'), zahl(liste.length ? liste[0].summe : 0, 6)]
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
      [text('weiter-spiel'), schliesseOverlay],
      [text('anleitung'), function () { oeffneOverlay(baueAnleitung(baueMenue)); }],
      [text('spickzettel'), function () { oeffneOverlay(baueSpickzettel()); }]
    ]));

    /* "Neues Brett" gibt es bewusst nicht mehr: wer ein ungeliebtes
     * Brett neu wuerfeln darf, hat kein Risiko mehr zu tragen. Wer
     * aussteigen will, haut ab und sichert den Topf. */
    box.appendChild(knopfReihe([
      [text('bestenliste'), function () {
        oeffneOverlay(baueBestenliste({ zurueck: baueMenue }));
      }],
      [text(Klang.an ? 'ton-an' : 'ton-aus'), function () {
        Klang.an = !Klang.an;
        oeffneOverlay(baueMenue());
      }]
    ]));

    /* Der Modus wird nicht umgeschaltet, sondern neu begonnen -- ein
     * halb gespielter Beutezug liesse sich sonst nicht vergleichen.
     * "NEUER BEUTEZUG" heisst dabei: noch einer wie dieser. Wer den
     * Modus wechseln will, geht ueber das Hauptmenue. */
    box.appendChild(knopfReihe([
      [text('neuer-beutezug'), function () {
        var leicht = leichterModus();
        schliesseOverlay();
        neuerBeutezug(leicht);
      }],
      [text('hauptmenue'), function () { oeffneOverlay(baueStartschirm()); }]
    ]));

    return box;
  }

  /*
   * Die Anleitung gibt es zweimal: fuer Erwachsene und fuer Kinder. Ein
   * Kind in der ersten Klasse braucht kurze Saetze, die es selbst lesen
   * kann, und keinen Topf und keinen Einsatz -- die gibt es fuer Kinder
   * ja gar nicht. Ein Erwachsener will wissen, was ihn Hilfe kostet und
   * wann er abhauen sollte. Beides auf eine Seite zu schreiben hiess,
   * dass jeder die Haelfte ueberlesen musste.
   *
   * Oben stehen die beiden Reiter, darunter das, was fuer beide gilt:
   * die Regel "Bild ist Buchstabe", gross und zuerst, weil sie die
   * eigentliche Huerde ist. Gezeigt wird sie an einem ganzen Wort --
   * vier Bilder, ihre Namen, ihre Buchstaben, und die Zugkapsel darum.
   * Das erklaert Regel und Geste in einem Bild. Danach kommen die
   * Schritte des jeweiligen Modus, nummeriert und linksbuendig, damit
   * man sie der Reihe nach lesen kann.
   *
   * zurueck: der Dialog, aus dem heraus geoeffnet wurde -- als Bauer,
   * nicht als fertiger Knoten, damit er beim Zurueckgehen frische
   * Zahlen zeigt. Ohne ihn ist das der allererste Besuch, und dann
   * startet der Knopf unten den Modus, dessen Reiter gerade offen ist.
   *
   * leicht: welcher Reiter offen ist. Ohne Angabe der des laufenden
   * Beutezugs -- wer mitten im Kinderspiel fragt, meint die Kinder.
   */
  function baueAnleitung(zurueck, leicht) {
    if (leicht === undefined) leicht = leichterModus();

    var box = document.createElement('div');
    box.className = 'dialog anleitung';
    box.fest = dialogFest;

    var marke = document.createElement('div');
    marke.className = 'mittig marke';
    marke.appendChild(PF.render(NAME, { scale: 3, color: GOLD_MATT, tracking: 3 }));
    box.appendChild(marke);

    /* Die Reiter. Ein Wechsel baut die Seite neu, statt Teile zu
     * verstecken -- so misst passeAn() nur, was auch zu sehen ist. */
    var reiter = document.createElement('div');
    reiter.className = 'reiter';
    reiter.setAttribute('role', 'tablist');
    [[false, 'erwachsene'], [true, 'fuer-kinder']].forEach(function (paar) {
      var aktiv = paar[0] === leicht;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'knopf reiterknopf' + (aktiv ? ' aktiv' : '');
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', aktiv ? 'true' : 'false');
      b.appendChild(PF.render(text(paar[1]),
        { scale: 2, color: aktiv ? '#17171c' : GOLD }));
      b.addEventListener('click', function () {
        if (aktiv) return;
        Klang.sfx.knopf();
        oeffneOverlay(baueAnleitung(zurueck, paar[0]));
      });
      reiter.appendChild(b);
    });
    box.appendChild(reiter);

    var kopf = document.createElement('div');
    kopf.className = 'schlagzeile';
    [[text('jedes-bild'), GOLD], [text('ein-buchstabe'), CYAN]]
      .forEach(function (zeile) {
        kopf.appendChild(PF.render(zeile[0], {
          scale: 4, color: zeile[1], shadow: '#08220f'
        }));
      });
    kopf.appendChild(PF.render(text(leicht ? 'name-anfang-kinder' : 'name-anfang'),
      { scale: 2, color: CREME }));
    box.appendChild(kopf);

    box.appendChild(baueWortbeispiel());

    /* Die Schritte: eine Ueberschrift und darunter der Text; wo er
     * umbricht, entscheidet die Breite des Bildschirms. Kinder bekommen
     * groessere Schrift -- sie lesen noch Buchstabe fuer Buchstabe. */
    var schritte = document.createElement('ol');
    schritte.className = 'schritte' + (leicht ? ' fuer-kinder' : '');
    textZeilen(leicht ? 'anleitung-kinder' : 'anleitung-erwachsene')
      .forEach(function (schritt, i) {
        var li = document.createElement('li');
        li.className = 'schritt';
        var kopfzeile = document.createElement('div');
        kopfzeile.className = 'schrittkopf';
        var nummer = document.createElement('span');
        nummer.className = 'schrittnummer';
        nummer.appendChild(PF.render(String(i + 1), { scale: 2, color: '#17171c' }));
        kopfzeile.appendChild(nummer);
        kopfzeile.appendChild(PF.render(schritt[0],
          { scale: leicht ? 2.5 : 2.25, color: leicht ? CYAN : GOLD }));
        li.appendChild(kopfzeile);
        /* Erwachsene lesen einen Absatz, Kinder Satz fuer Satz: bei
         * ihnen steht jeder Satz als eigener Eintrag in der Tabelle
         * und beginnt auf einer neuen Zeile. */
        schritt.slice(1).forEach(function (satz) {
          li.appendChild(PF.render(satz, { scale: leicht ? 2 : 1.75, color: CREME }));
        });
        schritte.appendChild(li);
      });
    box.appendChild(schritte);

    box.appendChild(knopfReihe(
      zurueck
        ? [[text('zurueck'), function () { oeffneOverlay(zurueck()); }]]
        : [[text('los-gehts'), function () {
            schliesseOverlay();
            if (leicht !== leichterModus()) neuerBeutezug(leicht);
          }]]
    ));
    return box;
  }

  /* Ein ganzes Wort als Beispiel: jedes Bild mit seinem Namen und dem
   * Buchstaben, den der Name ergibt, und die Zugkapsel um die Bilder,
   * wie sie auf dem Brett aussieht. Darunter das Wort, das dabei
   * herauskommt. Das Wort gehoert der Sprache -- HUND ist auf Englisch
   * kein Wort, und die Bilder dafuer hiessen dort anders. */
  function baueWortbeispiel() {
    var teile = textZeilen('beispielwort');
    var rahmen = document.createElement('div');
    rahmen.className = 'wortbeispiel';

    /* Jede Spalte haelt Bild, Name und Buchstabe zusammen; die Kapsel
     * liegt dahinter und ist genau so hoch wie die Bilderzeile. Spalten
     * statt eines Gitters mit festen Plaetzen, weil passeAn() eine zu
     * breite Zeile durch ein neues Canvas ersetzt -- und das kennt die
     * Platzangaben des alten nicht. */
    var reihe = document.createElement('div');
    reihe.className = 'beispielreihe';

    var kapsel = document.createElement('div');
    kapsel.className = 'beispielkapsel';
    kapsel.setAttribute('aria-hidden', 'true');
    reihe.appendChild(kapsel);

    teile.forEach(function (teil) {
      var spalte = document.createElement('div');
      spalte.className = 'beispielspalte';
      var bild = document.createElement('span');
      bild.className = 'beispielemoji';
      bild.textContent = teil[0];
      spalte.appendChild(bild);
      spalte.appendChild(PF.render(teil[1], { scale: 1.5, color: CREME }));
      spalte.appendChild(PF.render(teil[2], { scale: 4, color: GOLD, box: 'base' }));
      reihe.appendChild(spalte);
    });
    rahmen.appendChild(reihe);

    var wort = teile.map(function (teil) { return teil[2]; }).join('');
    var ergebnis = document.createElement('div');
    ergebnis.className = 'mittig';
    ergebnis.appendChild(PF.render(text('beispielwort-ergebnis', { wort: wort }),
      { scale: 2.5, color: CYAN }));
    rahmen.appendChild(ergebnis);
    return rahmen;
  }

  /* Welche Bilder liegen gerade auf dem Brett, und wofuer stehen sie?
   * Wer die Namen kennt, spielt doppelt so schnell. */
  function baueSpickzettel() {
    var box = document.createElement('div');
    box.className = 'dialog breit';
    box.fest = dialogFest;

    var h = document.createElement('div');
    h.className = 'dialogtitel';
    h.appendChild(PF.render(text('spickzettel'),
      { scale: 5, color: GOLD, shadow: '#3a2a00' }));
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

    box.appendChild(knopfReihe([
      [text('zurueck'), function () { oeffneOverlay(baueMenue()); }]
    ]));
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
      passeAn(el.titel.parentNode);
      passeAn(el.btnTipp);
      passeAn(el.btnSpicken);
      passeAn(el.btnMenu);
      passeSpielfeldAn();
      /* Gedreht wird das Telefon mitten im Dialog. Der Neuaufbau
       * kaeme dafuer zu spaet -- also nachmessen, solange er steht. */
      if (overlayOffen()) passeAn(el.overlayInhalt.firstElementChild);
    });
  }

  /* Die Schilder am Gehaeuse: Marke, Auszahlung, Gewinnplan und die
   * Vorlesenamen der drei Bereiche. Sie aendern sich nur, wenn die
   * Sprache wechselt -- also genau dann neu gesetzt. */
  function beschrifteAutomat() {
    if (!el.marke) return;
    schreib(el.marke, NAME, { scale: 3.5, color: CREME });
    schreib(el.lblAuszahlung, text('auszahlung'), { scale: 1.5, color: CREME });
    schreib(el.lblPlan, text('gewinnplan'), { scale: 1.5, color: CREME });
    el.brett.setAttribute('aria-label', text('aria-spielbrett'));
    el.gewinnplan.setAttribute('aria-label', text('aria-gewinnplan'));
    el.aktionen.setAttribute('aria-label', text('aria-aktionen'));
  }

  function los() {
    ['automat', 'kopf', 'gewinnplan', 'aktionen', 'beuteAnzeige',
         'brett', 'brettRahmen', 'spur', 'spurKapsel', 'titel', 'marke',
     'auszahlung', 'einsatz', 'plan', 'extra', 'rest',
     'btnTipp', 'tippText', 'btnSpicken', 'spickenText', 'btnMenu', 'menuText',
     'lblAuszahlung', 'lblPlan', 'neuigkeit', 'alarm', 'overlay', 'overlayInhalt'].forEach(function (id) {
      el[id] = $(id);
    });

    verdrahte();

    var stand = ladeStand();
    var erstesMal = !stand.schonGespielt;

    /* Ohne eigene Wahl folgt das Spiel dem Browser. Erst wer im
     * Hauptmenue umschaltet, legt sich fest. */
    setzeSprache(stand.sprache || Sprache.erkenne());

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
    kosten: KOSTEN,
    /* Ohne Beutezug daneben waere das eine halbe Umstellung: Knoepfe
     * neu, Brett noch alt. */
    sprache: function (code) {
      setzeSprache(code);
      merkeSprache(Sprache.aktiv());
      neuerBeutezug(leichterModus());
      return Sprache.aktiv();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', los);
  } else {
    los();
  }
})(window);
