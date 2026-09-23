/* ------------------------------------------------------------------
 * i18n.js -- die Sprachen.
 *
 * Das Spiel kennt zwei Arten von Text, und nur eine davon steht hier:
 * die Oberflaeche. Alphabet, Woerterbuch und Auftragstitel sind Daten
 * und liegen in emoji.js und words.js, jeweils pro Sprache -- ein
 * englisches Brett braucht nicht nur englische Knoepfe, sondern ein
 * anderes Alphabet (die Katze ist ein C, nicht ein K) und ein anderes
 * Woerterbuch.
 *
 * Wer die Sprache umstellt, ruft `Sprache.setze`. Die anderen Module
 * haengen sich mit `Sprache.folgt` daran -- so gibt es genau eine
 * Stelle, die weiss, welche Sprache gerade laeuft, und keine, die eine
 * andere fragen muesste.
 *
 * Der Spielname bleibt in jeder Sprache BEUTEZUG. Er ist die Marke auf
 * dem Automatengehaeuse, kein Wort, das uebersetzt werden will.
 * ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var CODES = ['de', 'en'];
  var VORGABE = 'de';

  /* In der eigenen Sprache geschrieben: wer die Oberflaeche nicht
   * lesen kann, erkennt trotzdem, welcher Knopf der seine ist. */
  var NAMEN = { de: 'DEUTSCH', en: 'ENGLISH' };

  var TEXTE = {
    de: {
      'seitentitel': 'BEUTEZUG – die Emoji-Wortjagd',
      'marke-unterzeile': 'DIE EMOJI-WORTJAGD',

      'aria-spielbrett': 'Spielbrett',
      'aria-gewinnplan': 'Gewinnplan',
      'aria-aktionen': 'Spielaktionen',
      'aria-buchstabe': 'Buchstabe {b}',
      'aria-kachel': '{name} – {b}',

      'auszahlung': 'AUSZAHLUNG',
      'gewinnplan': 'GEWINNPLAN',
      'kindermodus': 'KINDERMODUS',
      'auftrag-titel': '{n} · {titel}',
      'einsatz': 'EINSATZ -{n}',
      'extraworte-zaehler': 'EXTRAWORTE {a}/{b}',
      'noch': 'NOCH {n}',
      'tipp': 'TIPP {n}',
      'tipp-gratis': 'TIPP GRATIS',
      'spicken': 'SPICKEN {n}',
      'spicken-gratis': 'SPICKEN GRATIS',
      'menue': 'MENÜ',

      'coup-gelungen': 'COUP GELUNGEN',
      'gefunden': 'GEFUNDEN',
      'von': '{a} VON {b}',
      'extraworte': 'EXTRAWORTE',
      'einsatz-zeile': 'EINSATZ',
      'sauber-bonus': 'SAUBER-BONUS',
      'auftraege': 'AUFTRÄGE',
      'im-topf': 'IM TOPF',
      'naechster-einsatz': 'NÄCHSTER AUFTRAG: TIPP {t}, SPICKEN {s}',
      'naechste-neuerung': 'ALS NÄCHSTES: {was}',
      'topf-im-risiko': 'DER TOPF BLEIBT DABEI IM RISIKO.',
      'alarm-bonus': 'ALARM-BONUS',
      'alarm-angebot': 'NÄCHSTER AUFTRAG MIT ALARM? {s} SEKUNDEN.',
      'alarm-regel': 'RECHTZEITIG: DOPPELTE BEUTE. ERWISCHT: HALBER TOPF WEG.',
      'mit-alarm': 'MIT ALARM',
      'alarm-titel': 'ALARM!',
      'alarm-los': '{s} SEKUNDEN FÜR DOPPELTE BEUTE.',
      'alarm-uhr': 'ALARM {zeit}',
      'erwischt': 'ERWISCHT',
      'erwischt-alarm': 'DER ALARM HAT DICH ERWISCHT.',
      'erwischt-haelfte': 'AUF DER FLUCHT BLEIBT DER HALBE TOPF LIEGEN.',
      'im-topf-war': 'IM TOPF WAR',
      'gerettet': 'GERETTET',
      'weiter': 'WEITER',
      'abhauen': 'ABHAUEN {n}',

      'aufgeflogen': 'AUFGEFLOGEN',
      'topf-leer': 'DER TOPF IST LEER.',
      'raus-nach-eins': 'NACH EINEM AUFTRAG OHNE BEUTE RAUS.',
      'raus-nach-viele': 'NACH {n} AUFTRÄGEN OHNE BEUTE RAUS.',
      'rechtzeitig': 'WER RECHTZEITIG ABHAUT, BEHÄLT SIE.',

      'neuer-beutezug': 'NEUER BEUTEZUG',
      'bestenliste': 'BESTENLISTE',
      'beste-kinder': 'BESTE KINDER',
      'hauptmenue': 'HAUPTMENÜ',

      'in-die-bestenliste': 'IN DIE BESTENLISTE',
      'auftraege-eins': '1 AUFTRAG',
      'auftraege-viele': '{n} AUFTRÄGE',
      'loeschen': 'LÖSCHEN',
      'eintragen': 'EINTRAGEN',
      'nichts-erbeutet': 'NOCH NICHTS ERBEUTET.',
      'auftraege-kurz': '{n}A',
      'dieser-beutezug': 'DIESER BEUTEZUG: {n}',
      'nicht-gereicht': 'HAT NICHT GEREICHT.',
      'zurueck': 'ZURÜCK',

      'weiter-spielen': 'WEITER SPIELEN',
      'erwachsene': 'ERWACHSENE',
      'fuer-kinder': 'FÜR KINDER',
      'was-erwachsene': ['ERWACHSENE: HUNDERT AUFTRÄGE, JEDER',
                         'ETWAS SCHWERER. HILFEN KOSTEN EINSATZ.'],
      'was-kinder': ['FÜR KINDER: WÖRTER ZUM LESENLERNEN,',
                     'VIELE KACHELN ZEIGEN IHREN BUCHSTABEN.'],
      'anleitung': 'ANLEITUNG',
      'ton-an': 'TON: AN',
      'ton-aus': 'TON: AUS',
      'sprache': 'SPRACHE: {name}',
      'sprache-neustart': 'EIN SPRACHWECHSEL BEGINNT NEU.',

      'weiter-spiel': 'WEITER',
      'spickzettel': 'SPICKZETTEL',
      'auftraege-im-zug': 'AUFTRÄGE IM ZUG',
      'bester-beutezug': 'BESTER BEUTEZUG',

      'jedes-bild': 'JEDES BILD IST',
      'ein-buchstabe': 'EIN BUCHSTABE',
      'name-anfang': 'UND ZWAR DER, MIT DEM SEIN NAME ANFÄNGT.',
      'name-anfang-kinder': 'DER ERSTE BUCHSTABE VON SEINEM NAMEN.',
      'beispielwort': [['🏠', 'HAUS', 'H'], ['⌚', 'UHR', 'U'],
                       ['👃', 'NASE', 'N'], ['🐬', 'DELFIN', 'D']],
      'beispielwort-ergebnis': 'DAS WORT: {wort}',
      /* Die Schritte der Anleitung: Ueberschrift und Absatz. Den
       * Umbruch macht der Bildschirm, nicht die Tabelle -- ein Absatz
       * ist zu lang, um ihn fuer jede Breite vorzubrechen. */
      'anleitung-erwachsene': [
        ['ZIEHEN', 'FINGER AUFS ERSTE BILD LEGEN UND BIS ZUM LETZTEN ZIEHEN. ' +
          'IMMER GERADEAUS – DIE AUSWAHL RASTET VON SELBST EIN.'],
        ['GEWINNPLAN', 'UNTER DEM BRETT STEHEN DIE GESUCHTEN WÖRTER. SIE ZAHLEN ' +
          'DOPPELT. JEDES ANDERE ECHTE WORT ZÄHLT AUCH.'],
        ['HILFE', 'TIPP DECKT ZWEI BILDER AUF, SPICKEN ZEIGT KURZ ALLE BUCHSTABEN. ' +
          'AB AUFTRAG 2 KOSTEN HILFEN UND FEHLZÜGE EINSATZ – UND DER STEIGT: ' +
          'ANFANGS KOSTET EIN TIPP EIN HALBES WORT, SPÄTER MEHR, ALS DAS WORT ' +
          'EINBRINGT. HILFE IST EIN NOTGROSCHEN, KEINE ABKÜRZUNG.'],
        ['DER TOPF', 'DIE BEUTE WANDERT IN DEN TOPF. NACH JEDEM AUFTRAG: WEITER ' +
          'ODER ABHAUEN. ABHAUEN BEENDET DEN BEUTEZUG, UND DER TOPF KOMMT IN DIE ' +
          'BESTENLISTE. WER DEN TOPF MIT EINSATZ LEER SPIELT, FLIEGT AUF UND ' +
          'BEHÄLT NICHTS.'],
        ['ALARM', 'AB AUFTRAG 50 BIETET JEDER FÜNFTE EINEN ALARM AN. WER IHN ' +
          'ANNIMMT, SPIELT GEGEN DIE UHR UM DOPPELTE BEUTE. ERWISCHT ER DICH, ' +
          'BLEIBT DER HALBE TOPF LIEGEN – UND DER BEUTEZUG IST VORBEI.'],
        ['100 AUFTRÄGE', 'ES FÄNGT KLEIN AN. ALLE PAAR AUFTRÄGE KOMMT ETWAS NEUES: ' +
          'RÜCKWÄRTS, SCHRÄG, KÖDER, VERDECKTE WÖRTER.']
      ],
      /* Fuer Kinder: kurze Saetze, Woerter aus der ersten Klasse, und
       * nichts ueber Geld -- im Kindermodus kostet nichts etwas. Jeder
       * Satz beginnt auf einer neuen Zeile: wer gerade lesen lernt,
       * findet den Anfang eines Satzes sonst nicht wieder. */
      'anleitung-kinder': [
        ['SUCHEN', 'UNTEN STEHEN DIE WÖRTER.', 'DIE SUCHST DU.'],
        ['LESEN', 'DIE WÖRTER STEHEN VON LINKS NACH RECHTS.',
          'SPÄTER AUCH VON OBEN NACH UNTEN.'],
        ['ZIEHEN', 'LEG DEINEN FINGER AUF DAS ERSTE BILD.',
          'ZIEH BIS ZUM LETZTEN BILD.', 'DANN LOSLASSEN.'],
        ['RICHTIG!', 'STIMMT DAS WORT?', 'DANN DREHEN SICH DIE BILDER UM.'],
        ['HILFE', 'MANCHE KACHELN ZEIGEN SCHON IHREN BUCHSTABEN.',
          'TIPP UND SPICKEN HELFEN DIR.', 'DAS KOSTET NICHTS.']
      ],
      'los-gehts': 'LOS GEHT\'S',

      /* Die Neuerungen der Stufenleiter (words.js). Jede hat eine
       * Ueberschrift und einen Satz, der sagt, was sie bedeutet. */
      'neu-mehr-worte': 'MEHR WÖRTER',
      'neu-mehr-worte-info': 'IM GEWINNPLAN STEHT EIN WORT MEHR.',
      'neu-groesser': 'GRÖSSERES BRETT',
      'neu-groesser-info': 'MEHR KACHELN, MEHR VERSTECKE.',
      'neu-laenger': 'LÄNGERE WÖRTER',
      'neu-laenger-info': 'DIE GESUCHTEN WÖRTER WERDEN LÄNGER.',
      'neu-runter': 'NEU: VON OBEN NACH UNTEN',
      'neu-runter-info': 'MANCHE WÖRTER STEHEN SENKRECHT.',
      'neu-kreuzen': 'NEU: KREUZUNGEN',
      'neu-kreuzen-info': 'ZWEI WÖRTER KÖNNEN SICH EINE KACHEL TEILEN.',
      'neu-rueckwaerts': 'NEU: RÜCKWÄRTS',
      'neu-rueckwaerts-info': 'MANCHE WÖRTER LAUFEN VON RECHTS NACH LINKS.',
      'neu-rauf': 'NEU: VON UNTEN NACH OBEN',
      'neu-rauf-info': 'MANCHE WÖRTER LAUFEN NACH OBEN.',
      'neu-schraeg': 'NEU: SCHRÄG',
      'neu-schraeg-info': 'MANCHE WÖRTER LAUFEN SCHRÄG NACH UNTEN.',
      'neu-schraeg-rauf': 'NEU: SCHRÄG NACH OBEN',
      'neu-schraeg-rauf-info': 'SCHRÄGE WÖRTER LAUFEN JETZT AUCH BERGAUF.',
      'neu-alle-richtungen': 'ALLE RICHTUNGEN',
      'neu-alle-richtungen-info': 'AUCH SCHRÄG KANN ES JETZT RÜCKWÄRTS GEHEN.',
      'neu-koeder': 'NEU: KÖDER',
      'neu-koeder-info': 'FALSCHE WORTANFÄNGE LIEGEN ALS FALLE BEREIT.',
      'neu-mehr-koeder': 'MEHR KÖDER',
      'neu-mehr-koeder-info': 'NOCH MEHR FALSCHE FÄHRTEN IM BRETT.',
      'neu-dichter': 'DICHTERES BRETT',
      'neu-dichter-info': 'DIE ÜBRIGEN BILDER ÄHNELN DEN GESUCHTEN.',
      'neu-verdeckt': 'NEU: VERDECKT',
      'neu-verdeckt-info': 'EIN WORT IM PLAN ZEIGT NUR SEINEN ANFANG.',
      'neu-mehr-verdeckt': 'MEHR VERDECKT',
      'neu-mehr-verdeckt-info': 'NOCH EIN WORT ZEIGT NUR SEINEN ANFANG.',
      'neu-blind': 'BLINDFLUG',
      'neu-blind-info': 'JEDES WORT ZEIGT NUR NOCH SEINEN ANFANG.',
      'neu-knoten': 'NEU: KNOTEN',
      'neu-knoten-info': 'DIE WÖRTER KREUZEN SICH, WO ES NUR GEHT.',
      'neu-weniger-buchstaben': 'WENIGER BUCHSTABEN',
      'neu-weniger-buchstaben-info': 'MEHR KACHELN ZEIGEN NUR IHR BILD.'
    },

    en: {
      'seitentitel': 'BEUTEZUG – the Emoji Word Hunt',
      'marke-unterzeile': 'THE EMOJI WORD HUNT',

      'aria-spielbrett': 'Game board',
      'aria-gewinnplan': 'Paytable',
      'aria-aktionen': 'Game actions',
      'aria-buchstabe': 'Letter {b}',
      'aria-kachel': '{name} – {b}',

      'auszahlung': 'PAYOUT',
      'gewinnplan': 'PAYTABLE',
      'kindermodus': 'KIDS MODE',
      'auftrag-titel': '{n} · {titel}',
      'einsatz': 'STAKE -{n}',
      'extraworte-zaehler': 'BONUS WORDS {a}/{b}',
      'noch': '{n} TO GO',
      'tipp': 'HINT {n}',
      'tipp-gratis': 'HINT FREE',
      'spicken': 'PEEK {n}',
      'spicken-gratis': 'PEEK FREE',
      'menue': 'MENU',

      'coup-gelungen': 'JOB DONE',
      'gefunden': 'FOUND',
      'von': '{a} OF {b}',
      'extraworte': 'BONUS WORDS',
      'einsatz-zeile': 'STAKE',
      'sauber-bonus': 'CLEAN BONUS',
      'auftraege': 'JOBS',
      'im-topf': 'IN THE POT',
      'naechster-einsatz': 'NEXT JOB: HINT {t}, PEEK {s}',
      'naechste-neuerung': 'COMING UP: {was}',
      'topf-im-risiko': 'THE POT STAYS AT RISK.',
      'alarm-bonus': 'ALARM BONUS',
      'alarm-angebot': 'NEXT JOB WITH ALARM? {s} SECONDS.',
      'alarm-regel': 'IN TIME: DOUBLE LOOT. CAUGHT: HALF THE POT IS GONE.',
      'mit-alarm': 'WITH ALARM',
      'alarm-titel': 'ALARM!',
      'alarm-los': '{s} SECONDS FOR DOUBLE LOOT.',
      'alarm-uhr': 'ALARM {zeit}',
      'erwischt': 'CAUGHT',
      'erwischt-alarm': 'THE ALARM CAUGHT YOU.',
      'erwischt-haelfte': 'HALF THE POT IS LEFT BEHIND ON THE RUN.',
      'im-topf-war': 'POT BEFORE',
      'gerettet': 'SAVED',
      'weiter': 'CARRY ON',
      'abhauen': 'CASH OUT {n}',

      'aufgeflogen': 'BUSTED',
      'topf-leer': 'THE POT IS EMPTY.',
      'raus-nach-eins': 'OUT AFTER ONE JOB WITH NOTHING.',
      'raus-nach-viele': 'OUT AFTER {n} JOBS WITH NOTHING.',
      'rechtzeitig': 'CASH OUT IN TIME AND YOU KEEP IT.',

      'neuer-beutezug': 'NEW HEIST',
      'bestenliste': 'HIGH SCORES',
      'beste-kinder': 'BEST KIDS',
      'hauptmenue': 'MAIN MENU',

      'in-die-bestenliste': 'NEW HIGH SCORE',
      'auftraege-eins': '1 JOB',
      'auftraege-viele': '{n} JOBS',
      'loeschen': 'DELETE',
      'eintragen': 'SUBMIT',
      'nichts-erbeutet': 'NOTHING STOLEN YET.',
      'auftraege-kurz': '{n}J',
      'dieser-beutezug': 'THIS HEIST: {n}',
      'nicht-gereicht': 'NOT ENOUGH.',
      'zurueck': 'BACK',

      'weiter-spielen': 'KEEP PLAYING',
      'erwachsene': 'GROWN-UPS',
      'fuer-kinder': 'FOR KIDS',
      'was-erwachsene': ['GROWN-UPS: A HUNDRED JOBS, EACH',
                         'A LITTLE HARDER. HELP COSTS STAKE.'],
      'was-kinder': ['FOR KIDS: WORDS FOR LEARNING TO READ,',
                     'MANY TILES SHOW THEIR LETTER.'],
      'anleitung': 'HOW TO PLAY',
      'ton-an': 'SOUND: ON',
      'ton-aus': 'SOUND: OFF',
      'sprache': 'LANGUAGE: {name}',
      'sprache-neustart': 'CHANGING LANGUAGE STARTS OVER.',

      'weiter-spiel': 'RESUME',
      'spickzettel': 'CHEAT SHEET',
      'auftraege-im-zug': 'JOBS THIS HEIST',
      'bester-beutezug': 'BEST HEIST',

      'jedes-bild': 'EVERY PICTURE IS',
      'ein-buchstabe': 'A LETTER',
      'name-anfang': 'THE ONE ITS OWN NAME STARTS WITH.',
      'name-anfang-kinder': 'THE FIRST LETTER OF ITS NAME.',
      'beispielwort': [['🐬', 'DOLPHIN', 'D'], ['🦉', 'OWL', 'O'], ['🎁', 'GIFT', 'G']],
      'beispielwort-ergebnis': 'THE WORD: {wort}',
      'anleitung-erwachsene': [
        ['DRAG', 'PUT YOUR FINGER ON THE FIRST PICTURE AND DRAG TO THE LAST. ' +
          'ALWAYS IN A STRAIGHT LINE – IT SNAPS INTO PLACE.'],
        ['PAYTABLE', 'THE WANTED WORDS ARE LISTED BELOW THE BOARD. THEY PAY ' +
          'DOUBLE. ANY OTHER REAL WORD COUNTS TOO.'],
        ['HELP', 'HINT TURNS OVER TWO PICTURES, PEEK SHOWS ALL LETTERS FOR A ' +
          'MOMENT. FROM JOB 2 ON, HELP AND MISSES COST STAKE – AND IT RISES: AT ' +
          'FIRST A HINT COSTS HALF A WORD, LATER MORE THAN THE WORD PAYS. HELP ' +
          'IS AN EMERGENCY FUND, NOT A SHORTCUT.'],
        ['THE POT', 'YOUR LOOT GOES INTO THE POT. AFTER EACH JOB: CARRY ON OR ' +
          'CASH OUT. CASHING OUT ENDS THE HEIST AND PUTS THE POT ON THE HIGH ' +
          'SCORES. SPEND THE POT DOWN TO ZERO AND YOU ARE BUSTED WITH NOTHING.'],
        ['ALARM', 'FROM JOB 50, EVERY FIFTH JOB OFFERS AN ALARM. TAKE IT AND YOU ' +
          'RACE THE CLOCK FOR DOUBLE LOOT. IF IT CATCHES YOU, HALF THE POT IS ' +
          'LEFT BEHIND – AND THE HEIST IS OVER.'],
        ['100 JOBS', 'IT STARTS SMALL. EVERY FEW JOBS SOMETHING NEW TURNS UP: ' +
          'BACKWARDS, DIAGONAL, DECOYS, HIDDEN WORDS.']
      ],
      'anleitung-kinder': [
        ['FIND', 'THE WORDS ARE AT THE BOTTOM.', 'LOOK FOR THEM.'],
        ['READ', 'THE WORDS GO FROM LEFT TO RIGHT.',
          'LATER ALSO FROM TOP TO BOTTOM.'],
        ['DRAG', 'PUT YOUR FINGER ON THE FIRST PICTURE.',
          'SLIDE TO THE LAST ONE.', 'THEN LET GO.'],
        ['WELL DONE!', 'IS THE WORD RIGHT?', 'THEN THE PICTURES TURN AROUND.'],
        ['HELP', 'SOME TILES ALREADY SHOW THEIR LETTER.',
          'HINT AND PEEK HELP YOU.', 'THEY ARE FREE.']
      ],
      'los-gehts': 'LET\'S GO',

      'neu-mehr-worte': 'MORE WORDS',
      'neu-mehr-worte-info': 'ONE MORE WORD ON THE PAYTABLE.',
      'neu-groesser': 'BIGGER BOARD',
      'neu-groesser-info': 'MORE TILES, MORE HIDING PLACES.',
      'neu-laenger': 'LONGER WORDS',
      'neu-laenger-info': 'THE WANTED WORDS GET LONGER.',
      'neu-runter': 'NEW: TOP TO BOTTOM',
      'neu-runter-info': 'SOME WORDS NOW RUN DOWNWARDS.',
      'neu-kreuzen': 'NEW: CROSSINGS',
      'neu-kreuzen-info': 'TWO WORDS MAY SHARE A TILE.',
      'neu-rueckwaerts': 'NEW: BACKWARDS',
      'neu-rueckwaerts-info': 'SOME WORDS RUN FROM RIGHT TO LEFT.',
      'neu-rauf': 'NEW: BOTTOM TO TOP',
      'neu-rauf-info': 'SOME WORDS NOW RUN UPWARDS.',
      'neu-schraeg': 'NEW: DIAGONAL',
      'neu-schraeg-info': 'SOME WORDS RUN DIAGONALLY DOWN.',
      'neu-schraeg-rauf': 'NEW: DIAGONAL UP',
      'neu-schraeg-rauf-info': 'DIAGONAL WORDS NOW CLIMB UPWARDS TOO.',
      'neu-alle-richtungen': 'EVERY DIRECTION',
      'neu-alle-richtungen-info': 'DIAGONALS CAN RUN BACKWARDS NOW.',
      'neu-koeder': 'NEW: DECOYS',
      'neu-koeder-info': 'FALSE WORD STARTS ARE LAID AS TRAPS.',
      'neu-mehr-koeder': 'MORE DECOYS',
      'neu-mehr-koeder-info': 'EVEN MORE FALSE TRAILS ON THE BOARD.',
      'neu-dichter': 'DENSER BOARD',
      'neu-dichter-info': 'THE OTHER PICTURES LOOK LIKE THE WANTED ONES.',
      'neu-verdeckt': 'NEW: HIDDEN WORD',
      'neu-verdeckt-info': 'ONE PAYTABLE WORD SHOWS ONLY ITS START.',
      'neu-mehr-verdeckt': 'MORE HIDDEN',
      'neu-mehr-verdeckt-info': 'ONE MORE WORD SHOWS ONLY ITS START.',
      'neu-blind': 'FLYING BLIND',
      'neu-blind-info': 'EVERY WORD SHOWS ONLY ITS START.',
      'neu-knoten': 'NEW: KNOTS',
      'neu-knoten-info': 'WORDS CROSS WHEREVER THEY CAN.',
      'neu-weniger-buchstaben': 'FEWER LETTERS',
      'neu-weniger-buchstaben-info': 'MORE TILES SHOW ONLY THEIR PICTURE.'
    }
  };

  var aktiv = VORGABE;
  var hoerer = [];

  function kennt(code) {
    return CODES.indexOf(code) !== -1;
  }

  /* Was der Browser eingestellt hat, sofern wir es sprechen. Alles
   * andere bekommt Englisch -- das versteht im Zweifel mehr als
   * Deutsch, und die Wahl steht ja im Hauptmenue. */
  function erkenne() {
    var wunsch = [];
    var nav = global.navigator;
    if (nav) {
      if (nav.languages && nav.languages.length) {
        wunsch = Array.prototype.slice.call(nav.languages);
      } else if (nav.language) {
        wunsch = [nav.language];
      }
    }
    for (var i = 0; i < wunsch.length; i++) {
      var code = String(wunsch[i]).slice(0, 2).toLowerCase();
      if (kennt(code)) return code;
    }
    return 'en';
  }

  function setze(code) {
    if (!kennt(code) || code === aktiv) return aktiv;
    aktiv = code;
    hoerer.forEach(function (fn) { fn(aktiv); });
    return aktiv;
  }

  /* Alphabet, Woerterbuch und Brett haengen sich hier ein, statt dass
   * jeder Aufrufer daran denken muesste, drei Module umzustellen. */
  function folgt(fn) {
    hoerer.push(fn);
    fn(aktiv);
  }

  function fuelle(vorlage, werte) {
    if (!werte) return vorlage;
    return String(vorlage).replace(/\{(\w+)\}/g, function (ganz, name) {
      return werte[name] === undefined ? ganz : String(werte[name]);
    });
  }

  function roh(schluessel) {
    var tisch = TEXTE[aktiv] || {};
    if (tisch[schluessel] !== undefined) return tisch[schluessel];
    /* Eine Luecke faellt so beim Spielen auf und nicht erst im
     * Fehlerprotokoll -- check-i18n.js faengt sie vorher ab. */
    var heim = TEXTE[VORGABE][schluessel];
    return heim === undefined ? schluessel : heim;
  }

  function t(schluessel, werte) {
    var wert = roh(schluessel);
    return fuelle(Array.isArray(wert) ? wert.join(' ') : wert, werte);
  }

  /* Mehrzeiliger Text bleibt mehrzeilig: wo der Umbruch sitzt, ist eine
   * Entscheidung der Sprache, nicht des Layouts. */
  function zeilen(schluessel, werte) {
    var wert = roh(schluessel);
    return (Array.isArray(wert) ? wert : [wert]).map(function (zeile) {
      return fuelle(zeile, werte);
    });
  }

  global.Sprache = {
    CODES: CODES,
    NAMEN: NAMEN,
    TEXTE: TEXTE,
    kennt: kennt,
    erkenne: erkenne,
    setze: setze,
    folgt: folgt,
    aktiv: function () { return aktiv; },
    name: function (code) { return NAMEN[code || aktiv]; },
    t: t,
    zeilen: zeilen,
    /* Die naechste Sprache im Kreis -- der Knopf im Hauptmenue
     * schaltet weiter, statt eine Liste aufzuklappen. Bei drei
     * Sprachen bleibt das richtig, bei zehn wird daraus eine Liste. */
    naechste: function (code) {
      var i = CODES.indexOf(code || aktiv);
      return CODES[(i + 1) % CODES.length];
    }
  };
})(window);
