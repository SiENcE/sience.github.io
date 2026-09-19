/* ------------------------------------------------------------------
 * words.js -- das Woerterbuch und die Auftraege.
 *
 * Bewusst ohne Umlaute und ohne Eszett: auf dem Brett gibt es nur die
 * 26 Buchstaben A-Z, fuer die es auch eindeutige Emojis gibt. Ein Ä als
 * Kachel waere ein Ratespiel, kein Wortspiel. Woerter wie LOEWE oder
 * STRASSE stehen deshalb nicht drin -- dafuer reichlich anderes.
 * ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var LIST_3 = [
    'ABO ALL ALS ALT AMT ARM ART ASS AUS BAD BAR BAU BEI BIS BOT BUS DAS DEM DEN',
    'DER DES DIE DIR DOM DUO EHE EIN EIS ENG ERZ FAN FEE FIT GAS GEL GUT HAT HER',
    'HIN HOF HUT ICH IHM IHN IHR IST JOB KAM KLO KUH KUR LAG LEG LID LOB LOS MAI',
    'MAL MAN MIR MIT MUT NAH NEU NIE NOT NUN NUR OHR OMA OPA ORT OST PER PIN POP',
    'PRO RAD RAT RAU REH ROT RUF RUM SEE SEI SIE SOG TAG TAL TAT TEE TON TOP TOR',
    'TUN UHR UNS VAN VOM VON VOR WAR WAS WEG WEH WEM WEN WER WIE WIR ZEH ZOO ZUG'
  ].join(' ');

  var LIST_4 = [
    'ABER ACHT ADER AKTE ALLE ALSO ALTE AMEN ARME ARZT AUCH AUGE AUTO BACH BAHN',
    'BALD BALL BANK BART BAUM BEIN BERG BETT BIER BILD BLAU BLEI BOOT BORD BUCH',
    'BUND BURG CODE DACH DAMM DANK DANN DARF DEIN DENN DICK DIES DING DOCH DORF',
    'DORT DRAN DREI DUFT EBEN ECHT ECKE EDEL EHER EIER EILE EINS ENDE ENGE ERBE',
    'ERDE ERST ESEL ETWA EULE FACH FAHR FALL FAST FAUL FEIN FELD FEST FLUG FORM',
    'FRAU FREI FROH FUSS GANS GANZ GARN GAST GEHT GELB GELD GERN GING GOLD GRAB',
    'GRAD GRAS GRAU GURT GUTE HAAR HALB HALS HALT HAND HANG HART HASE HAST HAUS',
    'HAUT HEER HEFT HEIL HEIM HELD HELL HEMD HERR HERZ HIER HOCH HOHE HOLZ HORN',
    'HOSE HUND HUPE IDEE IHRE IRRE JAGD JAHR JEDE JENE JUNG KALT KAMM KANN KARO',
    'KAUF KEIN KERN KIND KINO KLAR KLEE KLUG KNIE KOCH KOHL KOPF KORB KORN KRAN',
    'KRUG KURS KURZ LAGE LAMM LAND LANG LASS LAUB LAUF LAUT LEER LEGT LEID LEIM',
    'LESE LIEB LIED LIST LOCH LOHN LOSE LUFT LUST MACH MAHL MAIS MALT MANN MARK',
    'MAST MEER MEHL MEHR MEIN MILD MINE MIST MOND MOOS MORD MUND MUSS NACH NAHE',
    'NAME NASE NEIN NEST NETT NETZ NEUE NORD NOTE NULL NUSS OBEN OBST OFEN OHNE',
    'OPER PAAR PACK PARK PASS PECH PELZ PFAD PILZ PLAN PLUS POST PULT RAND RANG',
    'RAST RATE RAUM REDE REIF REIN REIS REST RING ROCK ROHR ROSE ROST ROTE RUHE',
    'RUND SAAL SACK SAFT SAGE SALZ SAND SATT SATZ SEHR SEIN SEIT SIEB SIEG SINN',
    'SITZ SOHN SOLL SPUR STAB STAR STEG STIL TAGE TANZ TAUB TEIL TEST TIER TOLL',
    'TRAF TREU TUCH TURM UFER VASE VIEL VIER VOLK VOLL WAHL WAHR WALD WAND WARM',
    'WART WEIN WEIT WELT WERK WERT WIND WINK WIRD WIRT WITZ WOHL WOLF WORT ZAHL',
    'ZAHN ZEIT ZELT ZEUG ZIEL ZINN ZOLL ZWEI'
  ].join(' ');

  var LIST_5 = [
    'ABEND ACKER ADLER AFFEN AKTEN ALARM ALTER AMPEL ANGEL ANGST ANKER APFEL ARMEE',
    'ASCHE ATLAS AUGEN BADEN BANDE BAUCH BAUER BEIDE BEINE BERGE BESEN BESTE BEUTE',
    'BIENE BIRNE BITTE BLATT BLEIB BLICK BLIND BLOCK BLUME BLUSE BODEN BOGEN BOHNE',
    'BOMBE BOOTE BRAUN BRAUT BREIT BRETT BRIEF BRUST BUCHE DACHS DAMEN DAMIT DANKE',
    'DATEN DAUER DECKE DEGEN DICHT DIEBE DINGE DRAHT DRANG DREHT DUNST DURST EBENE',
    'ECKEN EIMER EINEN EISEN ELFEN ENDET ENGEL ENTEN ERBSE ERDEN ERNST ERNTE ESSEN',
    'EULEN FADEN FAHRT FALLE FALTE FARBE FASER FEDER FEHLT FEIER FERNE FESTE FEUER',
    'FILME FINDE FIRMA FISCH FLAUM FLOTT FLUSS FOLGE FORST FRAGE FUNKE GABEL GASSE',
    'GEBET GEIGE GEIST GIPFEL GLANZ GLEIS GNADE GRUND HAFEN HAFER HAKEN HALLE HASEN',
    'HEIDE HERDE HEXEN HONIG HORDE HOTEL HUNDE IDEEN IMKER INSEL JACKE JAHRE JEDER',
    'KABEL KAMEL KAMIN KAMPF KANAL KANTE KARTE KASSE KATZE KEGEL KERZE KETTE KISTE',
    'KLAGE KLANG KLEID KLIMA KOMET KONTO KOPIE KRAFT KRANZ KREIS KREUZ KRIEG KRONE',
    'KUGEL KUNDE KUNST KURVE LADEN LAGER LAMPE LAUBE LAUNE LEBEN LEDER LEGEN LEISE',
    'LEUTE LICHT LIEBE LINIE LINKE LISTE LOBEN LOGIK MACHT MAGEN MALER MARKT MASKE',
    'MASSE MAUER MEILE MENGE METER MIETE MILCH MITTE MONAT MOTOR MUSIK NABEL NACHT',
    'NADEL NAGEL NARBE NASEN NATUR NEBEL NEBEN NEFFE NETZE NOTEN NUDEL OASEN OBERE',
    'OHREN OLIVE ONKEL OPFER ORDEN ORGEL OSTEN OTTER PAKET PALME PASTE PERLE PFAHL',
    'PFEIL PFERD PFLUG PILOT PILZE PLANE PLATZ POLIZEI PREIS PROBE PUDEL PUNKT PUPPE',
    'RABEN RADIO RAMPE RASEN RATTE RAUCH RAUPE REGAL REGEL REGEN REICH REIHE REISE',
    'RIESE RINDE RINGE RIPPE ROBBE ROLLE ROSEN RUDER RUHIG RUNDE SAGEN SAITE SALAT',
    'SALBE SAMEN SCHAF SCHUH SEELE SEGEL SEIDE SEITE SITTE SOCKE SONNE SORGE SPALT',
    'SPIEL STADT STAHL STAMM STAND STARK STATT STAUB STEIN STERN STIEL STIER STILL',
    'STIRN STOCK STOFF STROM STUBE STUFE STUHL STURM SUPPE TAFEL TANNE TANTE TASSE',
    'TASTE TAUBE TEICH TEILE TEUER TIEFE TIERE TISCH TITEL TONNE TRAUM TRICK TRUHE',
    'UHREN UMWEG UNTEN VATER VIELE VOGEL WAAGE WACHE WAFFE WAGEN WANGE WANNE WAREN',
    'WEBER WEGEN WEIDE WEISE WELLE WENDE WERKE WESEN WESTE WIESE WINDE WITWE WOCHE',
    'WOLKE WOLLE WUNDE WURST ZANGE ZEBRA ZEILE ZELTE ZEUGE ZIEGE ZUNGE ZWECK ZWERG'
  ].join(' ');

  var LIST_6 = [
    'ABENDE ABSICHT ACKERN AMPELN ANGELN ANKERN ARBEIT',
    'BAHNEN BAUERN BEAMTE BEBEN BERGEN BESSER BEUTEL BILDER BLICKE BLUMEN',
    'BOHNEN BRAUEN BRIEFE DANKEN DAUMEN DECKEL',
    'DECKEN DEUTEN DICHTE DIENST DONNER DRINGEN DUNKEL EIMERN EISERN ELEFANT',
    'ENGELN ENTERN ERNTEN ESSIG FABRIK FAHNEN FALTEN FAMILIE FARBEN',
    'FEDERN FEIERN FELDER FELSEN FENSTER FERIEN FEUERN FIGUREN FINDEN FISCHE FLAMME',
    'FLASCHE FLIEGE FLUCHT FOLGEN FORMEN FORSCHER FRAGEN FRAUEN FREUND FRIEDE',
    'FRISCH FRUCHT FUNKEN GABELN GARTEN GEDULD GEFAHR GEGEND GEHEIM GEHIRN GELDER',
    'GERADE GESANG GESTERN GEWICHT GIPFEL GITTER GLAUBE GLOCKE GOLDEN GRABEN GRENZE',
    'GRUPPE HAMMER HANDEL HAUFEN HEIMAT HELFEN HEMDEN HERBST HIMMEL HIRSCH HOFFEN',
    'HUNGER HUSTEN INSELN JAGDEN JUGEND KABELN KAFFEE KAMERA KAMMER KANTEN KARTEN',
    'KASTEN KELLER KERZEN KETTEN KINDER KIRCHE KISTEN KLEIDER KLINGE KNOCHEN KNOTEN',
    'KOCHEN KOFFER KOHLEN KRAGEN KRANKE KRATZER KREIDE KREISE KUCHEN KUGELN KUNDEN',
    'KUPFER LAGERN LAMPEN LANDEN LAPPEN LASTEN LATERNE LEDERN LEHRER LEITER',
    'LICHTER LIEBEN LIEDER LINIEN LISTEN LOCKEN MAGNET MANTEL MARKEN MAUERN MEISTER',
    'MELDEN MESSER METALL MINUTE MODELL MORGEN MOTOREN MUSTER MUTTER NADELN NAGELN',
    'NATTER NEBELN NERVEN NESTER NIEDER NUDELN ORDNER ORGELN PAKETE PALMEN',
    'PANZER PAPIER PARTIE PERLEN PFEILE PFERDE PILOTEN PLATTE PLATZE PORTAL',
    'POSTEN PROBEN PUNKTE PUPPEN QUELLE RAHMEN RAKETE RASSEL REGELN REGNEN REIFEN',
    'REISEN RETTEN RIEGEL RINGEN RIPPEN RITTER ROLLEN ROSTIG RUDERN SAITEN SALATE',
    'SATTEL SAUBER SCHAFE SCHALE SCHARF SCHEIN SCHERE SCHIFF SCHILD SCHIRM SCHLAF',
    'SCHLAG SCHMAL SCHNEE SCHREI SCHUHE SCHULD SCHULE SCHUTZ SCHWAN SEGELN SEITEN',
    'SESSEL SIEBEN SILBER SINGEN SOCKEN SOMMER SONNEN SORGEN SPATEN SPIEGEL SPIELE',
    'SPITZE SPRUNG STANGE STEINE STELLE STERNE STIMME STOFFE STRAND STRICH',
    'STUFEN STUNDE SUCHEN TAFELN TANZEN TASCHE TASTEN TAUBEN TEICHE TELLER',
    'TEPPICH TIEFEN TISCHE TOMATE TONNEN TREPPE TRETEN TRESOR TROPFEN',
    'TRUHEN TUNNEL WACHEN WAFFEN WANGEN WANNEN WARTEN WASSER WECKER',
    'WEIZEN WELLEN WELTEN WERFEN WESTEN WETTER WIESEN WINKEL WINTER WIRKEN WOCHEN',
    'WOLKEN WUNDER WURZEL ZAHLEN ZANGEN ZAUBER ZEIGEN ZEITEN ZIEGEL ZIMMER ZIRKUS',
    'ZUCKER ZUNGEN'
  ].join(' ');

  var LIST_7_PLUS = [
    'ABSICHT ANGRIFF ANTWORT ARBEITER AUSGANG BAHNHOF BALKONE BEAMTER BERGWERK',
    'BILDUNG BLITZEN BRIEFEN BRUNNEN DIAMANT DIENSTE DONNERN DRACHEN EICHHORN',
    'EINFACH ELEFANT ERDBEERE FAHRRAD FAMILIE FENSTER FLAMMEN FLASCHE FORSCHER',
    'FREIHEIT FREUNDE GALERIE GEDANKE GEDULDIG GEFAHREN GEHEIMNIS',
    'GEMISCHT GESCHENK GESICHT GEWICHT GEWITTER GITARRE GLOCKEN',
    'GRENZEN HANDSCHUH HOFFNUNG INSEKTEN KAMINE KAROTTE KARTOFFEL',
    'KASTANIE KIRSCHEN KLEIDER KNOCHEN KOMPASS KONZERT LATERNE LEINWAND LIEFERUNG',
    'MASCHINE MEISTER MINUTEN MOMENTE NACHBAR NACHRICHT NASHORN PAPIERE PINGUIN',
    'PLANETEN POLIZEI PROBLEME PYRAMIDE RAKETEN REGENBOGEN RICHTER SCHACHTEL',
    'SCHATTEN SCHICHT SCHIENE SCHLANGE SCHLOSS SCHMETTERLING SCHNECKE SCHRANK',
    'SCHREIBEN SCHRIFT SCHRITT SCHWAMM SCHWEIN SPIEGEL SPINNEN STEMPEL',
    'TEPPICH TIGERN TROMMEL VEILCHEN VERBAND VERSTECK VORHANG WASCHBAR WERKZEUG',
    'ZEICHEN ZITRONE ZWIEBEL'
  ].join(' ');

  /* Alltagswoerter, vor allem das, was Kinder zuerst lesen: Tiere,
   * Essen, Schulsachen. Beim Bauen des Kindermodus ist aufgefallen, dass
   * im Woerterbuch ausgerechnet BROT, MAUS und ENTE fehlten. */
  var LIST_ALLTAG = [
    'AFFE AMEISE BANANE BROT BUTTER DELFIN DRACHE ENTE FINGER FLIEGE FUCHS',
    'GIRAFFE HAI HEXE HUHN IGEL KAKAO KAMEL KAROTTE KATER KEKS KLEBER KOALA',
    'KRAKE KREBS MAPPE MAUS PANDA PAUSE PFEFFER PINGUIN PIZZA PLANET PRINZ',
    'QUALLE RAKETE RANZEN RAUPE RUTSCHE SCHAUKEL SPINNE STIFT TIGER TORTE',
    'WESPE WURM ZITRONE ZWIEBEL'
  ].join(' ');

  var DICT = (function () {
    var set = new Set();
    [LIST_3, LIST_4, LIST_5, LIST_6, LIST_7_PLUS, LIST_ALLTAG].forEach(function (chunk) {
      chunk.split(/\s+/).forEach(function (w) {
        w = w.trim().toUpperCase();
        if (w.length >= 3 && /^[A-Z]+$/.test(w)) set.add(w);
      });
    });
    return set;
  })();

  /* Die Auftraege. `worte` landen garantiert auf dem Brett, alles andere
   * aus dem Woerterbuch zaehlt als Extrawort. */
  var LEVELS = [
    {
      titel: 'KLEINE KASSE',
      spalten: 7, zeilen: 8,
      worte: ['GELD', 'KASSE', 'BEUTE', 'BANK']
    },
    {
      titel: 'SICHERE HAND',
      spalten: 8, zeilen: 9,
      worte: ['LEISE', 'RIEGEL', 'SCHLOSS', 'WECKER', 'BEUTE']
    },
    {
      titel: 'NACHTSCHICHT',
      spalten: 8, zeilen: 10,
      worte: ['WACHE', 'SCHATTEN', 'LAMPE', 'DIEBE', 'NACHT', 'STILL']
    },
    {
      titel: 'DIE GALERIE',
      spalten: 8, zeilen: 10,
      worte: ['BILD', 'RAHMEN', 'LEINWAND', 'KUNST', 'ALARM', 'GALERIE']
    },
    {
      titel: 'TRESORLAUF',
      spalten: 8, zeilen: 11,
      worte: ['TRESOR', 'STAHL', 'PANZER', 'FLUCHT', 'CODE', 'SCHLOSS', 'RIEGEL']
    },
    {
      titel: 'DER GROSSE COUP',
      spalten: 8, zeilen: 11,
      worte: ['DIAMANT', 'MASKE', 'FLUCHT', 'GOLD', 'BEUTE', 'PLAN', 'VERSTECK']
    }
  ];

  /*
   * Der Kindermodus (ab etwa der zweiten Klasse).
   *
   * Drei Dinge sind hier anders, und alle drei aus demselben Grund --
   * ein Kind soll das Prinzip "Bild ist Buchstabe" ueben, nicht an der
   * Suche scheitern:
   *   - `richtungen: ['rechts']` legt jedes Wort waagerecht von links
   *     nach rechts. Kein Rueckwaerts, kein Diagonal.
   *   - `aufgedeckt` zeigt einen Teil der Kacheln gleich als Buchstabe.
   *     Aus K_TZE laesst sich die Katze erschliessen -- das lehrt die
   *     Zuordnung, statt sie abzufragen.
   *   - Kleines Brett, kurze Woerter, kein Einsatz.
   */
  /*
   * Die Steigerung ist der eigentliche Entwurf: der erste Auftrag hat
   * ein einziges Wort auf einem kleinen Brett, auf dem fast alles schon
   * als Buchstabe dasteht -- also beinahe ein gewoehnliches
   * Buchstabengitter. Von da an werden es mehr Worte, groessere Bretter
   * und weniger Buchstaben, bis am Ende fast nur noch Bilder liegen.
   *
   * `buchstabenAnteil` ist der Anteil der Kacheln ganz ohne Emoji.
   */
  var KINDER = [
    { titel: 'EIN TIER', spalten: 5, zeilen: 5, buchstabenAnteil: 0.60,
      worte: ['HUND'] },
    { titel: 'ZWEI TIERE', spalten: 5, zeilen: 5, buchstabenAnteil: 0.55,
      worte: ['KATZE', 'MAUS'] },
    { titel: 'AUF DEM HOF', spalten: 6, zeilen: 6, buchstabenAnteil: 0.50,
      worte: ['KUH', 'HUHN', 'ENTE'] },
    { titel: 'BEI UNS ZU HAUSE', spalten: 6, zeilen: 6, buchstabenAnteil: 0.45,
      worte: ['HAUS', 'TISCH', 'BETT'] },
    { titel: 'LECKER', spalten: 6, zeilen: 6, buchstabenAnteil: 0.40,
      worte: ['BROT', 'MILCH', 'APFEL'] },
    { titel: 'DRAUSSEN', spalten: 7, zeilen: 7, buchstabenAnteil: 0.35,
      worte: ['BAUM', 'BLUME', 'SONNE', 'REGEN'] },
    { titel: 'VON KOPF BIS FUSS', spalten: 7, zeilen: 7, buchstabenAnteil: 0.30,
      worte: ['HAND', 'FUSS', 'NASE', 'AUGE'] },
    { titel: 'IN DER SCHULE', spalten: 7, zeilen: 7, buchstabenAnteil: 0.25,
      worte: ['BUCH', 'HEFT', 'TAFEL', 'STIFT'] },
    { titel: 'IM ZOO', spalten: 7, zeilen: 8, buchstabenAnteil: 0.20,
      worte: ['AFFE', 'ZEBRA', 'TIGER', 'ROBBE', 'PFERD'] },
    { titel: 'UNTERWEGS', spalten: 8, zeilen: 8, buchstabenAnteil: 0.15,
      worte: ['AUTO', 'BUS', 'ZUG', 'SCHIFF', 'RAD'] },
    { titel: 'GROSSE TIERE', spalten: 8, zeilen: 8, buchstabenAnteil: 0.12,
      worte: ['ELEFANT', 'GIRAFFE', 'PINGUIN', 'KAMEL', 'KOALA'] }
  ].map(function (auftrag) {
    auftrag.richtungen = ['rechts'];
    auftrag.leicht = true;
    return auftrag;
  });

  /* Nach dem letzten Auftrag geht es endlos weiter: zufaellige Worte
   * aus dem Woerterbuch, Brett und Anzahl wachsen langsam mit. */
  var ENDLOS_POOL = Array.from(DICT).filter(function (w) {
    return w.length >= 5 && w.length <= 8;
  });

  function zufallsLevel(nummer, rng) {
    var r = rng || Math.random;
    var anzahl = Math.min(8, 5 + Math.floor((nummer - LEVELS.length) / 3));
    var worte = [];
    var versuche = 0;
    while (worte.length < anzahl && versuche < 500) {
      versuche++;
      var w = ENDLOS_POOL[Math.floor(r() * ENDLOS_POOL.length)];
      if (worte.indexOf(w) === -1) worte.push(w);
    }
    return {
      titel: 'FREIE WILDBAHN ' + (nummer - LEVELS.length + 1),
      spalten: 8,
      zeilen: 11,
      worte: worte
    };
  }

  /* Der Endlosnachschub fuer Kinder: dieselben vertrauten Worte, auf
   * der zuletzt erreichten Stufe. */
  var KINDER_POOL = (function () {
    var gesehen = {};
    KINDER.forEach(function (a) {
      a.worte.forEach(function (w) {
        if (w.length <= 8) gesehen[w] = true;
      });
    });
    return Object.keys(gesehen);
  })();

  function kinderZufall(nummer, rng) {
    var r = rng || Math.random;
    var worte = [];
    var versuche = 0;
    while (worte.length < 5 && versuche < 300) {
      versuche++;
      var w = KINDER_POOL[Math.floor(r() * KINDER_POOL.length)];
      if (worte.indexOf(w) === -1) worte.push(w);
    }
    return {
      titel: 'NOCH MEHR ' + (nummer - KINDER.length + 1),
      spalten: 8,
      zeilen: 8,
      richtungen: ['rechts'],
      buchstabenAnteil: 0.12,
      leicht: true,
      worte: worte
    };
  }

  function level(nummer, leicht) {
    if (leicht) {
      return nummer < KINDER.length ? KINDER[nummer] : kinderZufall(nummer);
    }
    if (nummer < LEVELS.length) return LEVELS[nummer];
    return zufallsLevel(nummer);
  }

  global.Woerter = {
    DICT: DICT,
    LEVELS: LEVELS,
    KINDER: KINDER,
    level: level,
    zufallsLevel: zufallsLevel,
    kennt: function (wort) { return DICT.has(String(wort).toUpperCase()); }
  };
})(window);
