/* ------------------------------------------------------------------
 * emoji.js -- das Alphabet.
 *
 * Jede Kachel auf dem Brett ist ein Emoji, das fuer den ersten
 * Buchstaben seines eigenen Namens steht: die Pizza ist ein P, der
 * Loewe ein L, die Rakete ein R.
 *
 * Aufgenommen wird nur, was eindeutig benennbar ist -- eine Kachel, die
 * niemand benennen kann, ist eine Kachel, mit der niemand buchstabiert.
 * Wo zwei deutsche Namen gleich nahe liegen (Delfin/Delphin), gewinnt
 * der gelaeufigere; wo der naheliegende Name mit einem anderen
 * Buchstaben beginnt (die Eule gehoert zum E, nicht zum U), taucht das
 * Emoji nur dort auf, damit dasselbe Bild nie zwei Buchstaben bedeutet.
 * ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var ALPHABET = {
    A: [['🍎', 'APFEL'], ['🐒', 'AFFE'], ['⚓', 'ANKER'], ['🐜', 'AMEISE'],
        ['🦅', 'ADLER'], ['🥑', 'AVOCADO'], ['👽', 'ALIEN'], ['🍍', 'ANANAS'],
        ['🚗', 'AUTO'], ['👁️', 'AUGE']],
    B: [['🍌', 'BANANE'], ['🐻', 'BÄR'], ['🌳', 'BAUM'], ['📖', 'BUCH'],
        ['🚌', 'BUS'], ['🐝', 'BIENE'], ['🍞', 'BROT'], ['🌼', 'BLUME'],
        ['✏️', 'BLEISTIFT'], ['🦫', 'BIBER'], ['⚡', 'BLITZ'], ['🏔️', 'BERG'],
        ['🍐', 'BIRNE'], ['👓', 'BRILLE'], ['🥨', 'BREZEL']],
    C: [['💻', 'COMPUTER'], ['🤡', 'CLOWN'], ['🥐', 'CROISSANT'],
        ['🍹', 'COCKTAIL'], ['🧁', 'CUPCAKE']],
    D: [['🐬', 'DELFIN'], ['🦕', 'DINOSAURIER'], ['🐉', 'DRACHE'], ['🍩', 'DONUT'],
        ['💎', 'DIAMANT'], ['🦡', 'DACHS'], ['🚿', 'DUSCHE'], ['🥫', 'DOSE'],
        ['🪁', 'DRACHEN']],
    E: [['🥚', 'EI'], ['🐘', 'ELEFANT'], ['🍦', 'EIS'], ['🦆', 'ENTE'],
        ['🌍', 'ERDE'], ['🍓', 'ERDBEERE'], ['🪣', 'EIMER'], ['🦌', 'ELCH'],
        ['🐿️', 'EICHHÖRNCHEN'], ['🦉', 'EULE'], ['🧊', 'EISWÜRFEL']],
    F: [['🐟', 'FISCH'], ['🔥', 'FEUER'], ['🦊', 'FUCHS'], ['🪶', 'FEDER'],
        ['🦶', 'FUSS'], ['🚲', 'FAHRRAD'], ['🦇', 'FLEDERMAUS'], ['🚩', 'FAHNE'],
        ['🪟', 'FENSTER'], ['🦩', 'FLAMINGO'], ['🎬', 'FILM'], ['🧯', 'FEUERLÖSCHER']],
    G: [['🎸', 'GITARRE'], ['🦒', 'GIRAFFE'], ['👻', 'GEIST'], ['🎁', 'GESCHENK'],
        ['🥒', 'GURKE'], ['🍴', 'GABEL'], ['💰', 'GELD'], ['🪿', 'GANS'],
        ['🎻', 'GEIGE'], ['🧠', 'GEHIRN']],
    H: [['🏠', 'HAUS'], ['🐕', 'HUND'], ['🖐️', 'HAND'], ['❤️', 'HERZ'],
        ['🔨', 'HAMMER'], ['🐔', 'HUHN'], ['🎩', 'HUT'], ['🍯', 'HONIG'],
        ['🚁', 'HUBSCHRAUBER'], ['🐹', 'HAMSTER'], ['🦈', 'HAI'], ['🧤', 'HANDSCHUH'],
        ['👜', 'HANDTASCHE'], ['🦞', 'HUMMER']],
    I: [['🦔', 'IGEL'], ['🏝️', 'INSEL'], ['🪲', 'INSEKT']],
    J: [['🃏', 'JOKER'], ['🕹️', 'JOYSTICK'], ['👖', 'JEANS'],
        ['🧥', 'JACKE'], ['🤹', 'JONGLEUR'], ['🪀', 'JOJO']],
    K: [['🐱', 'KATZE'], ['🎂', 'KUCHEN'], ['👑', 'KRONE'], ['🥝', 'KIWI'],
        ['🦘', 'KÄNGURU'], ['🐨', 'KOALA'], ['🧀', 'KÄSE'], ['🍒', 'KIRSCHE'],
        ['🕯️', 'KERZE'], ['🐄', 'KUH'], ['🦀', 'KREBS'], ['📷', 'KAMERA'],
        ['🐪', 'KAMEL'], ['🥔', 'KARTOFFEL'], ['🥕', 'KAROTTE'], ['☕', 'KAFFEE'],
        ['🧭', 'KOMPASS'], ['🍪', 'KEKS']],
    L: [['🦁', 'LÖWE'], ['💡', 'LAMPE'], ['🪜', 'LEITER'], ['🚂', 'LOKOMOTIVE'],
        ['🔊', 'LAUTSPRECHER'], ['🚚', 'LASTWAGEN'], ['🏮', 'LAMPION'],
        ['🍭', 'LOLLI'], ['📏', 'LINEAL']],
    M: [['🌙', 'MOND'], ['🐭', 'MAUS'], ['🥛', 'MILCH'], ['🧲', 'MAGNET'],
        ['🎤', 'MIKROFON'], ['🥭', 'MANGO'], ['🧜', 'MEERJUNGFRAU'], ['🌽', 'MAIS'],
        ['🏍️', 'MOTORRAD'], ['🦟', 'MÜCKE'], ['🧱', 'MAUER'], ['🔪', 'MESSER'],
        ['🎭', 'MASKEN']],
    N: [['👃', 'NASE'], ['🪺', 'NEST'], ['🥜', 'NUSS'], ['🍜', 'NUDELN'],
        ['🦏', 'NASHORN'], ['🪡', 'NADEL'], ['🌃', 'NACHT'], ['🔢', 'NUMMERN'],
        ['🎶', 'NOTEN']],
    O: [['🐙', 'OKTOPUS'], ['🍊', 'ORANGE'], ['🫒', 'OLIVE'], ['👂', 'OHR'],
        ['🦦', 'OTTER']],
    P: [['🍕', 'PIZZA'], ['🐧', 'PINGUIN'], ['🐼', 'PANDA'], ['🐴', 'PFERD'],
        ['🍑', 'PFIRSICH'], ['🌴', 'PALME'], ['🍟', 'POMMES'], ['🧩', 'PUZZLE'],
        ['🦚', 'PFAU'], ['🥞', 'PFANNKUCHEN'], ['🍿', 'POPCORN'], ['🍄', 'PILZ'],
        ['🐩', 'PUDEL'], ['🫑', 'PAPRIKA'], ['🎹', 'PIANO'], ['📯', 'POSTHORN']],
    Q: [['🪼', 'QUALLE'], ['⬜', 'QUADRAT']],
    R: [['🚀', 'RAKETE'], ['🌈', 'REGENBOGEN'], ['🤖', 'ROBOTER'], ['💍', 'RING'],
        ['🌹', 'ROSE'], ['🍚', 'REIS'], ['📻', 'RADIO'], ['🐀', 'RATTE'],
        ['🌧️', 'REGEN'], ['🎒', 'RUCKSACK'], ['🛞', 'RAD'], ['🐛', 'RAUPE'],
        ['🎡', 'RIESENRAD']],
    S: [['☀️', 'SONNE'], ['⭐', 'STERN'], ['🐍', 'SCHLANGE'], ['🧦', 'SOCKE'],
        ['🚢', 'SCHIFF'], ['🐌', 'SCHNECKE'], ['⛄', 'SCHNEEMANN'], ['🕷️', 'SPINNE'],
        ['🧽', 'SCHWAMM'], ['🌻', 'SONNENBLUME'], ['🐑', 'SCHAF'], ['❄️', 'SCHNEEFLOCKE'],
        ['🧂', 'SALZ'], ['🔑', 'SCHLÜSSEL'], ['🦋', 'SCHMETTERLING'], ['✂️', 'SCHERE'],
        ['👟', 'SCHUH'], ['🥪', 'SANDWICH'], ['🐷', 'SCHWEIN'], ['🎷', 'SAXOFON'],
        ['🕸️', 'SPINNENNETZ']],
    T: [['🐯', 'TIGER'], ['🍅', 'TOMATE'], ['🎺', 'TROMPETE'], ['🎫', 'TICKET'],
        ['🔭', 'TELESKOP'], ['📞', 'TELEFON'], ['🚕', 'TAXI'], ['🧸', 'TEDDY'],
        ['🌮', 'TACO'], ['🚪', 'TÜR'], ['🍵', 'TEE'], ['🪘', 'TROMMEL'],
        ['🦃', 'TRUTHAHN']],
    U: [['🛸', 'UFO'], ['⌚', 'UHR'], ['🚇', 'U-BAHN'], ['🩲', 'UNTERHOSE']],
    V: [['🐦', 'VOGEL'], ['🌋', 'VULKAN'], ['🏐', 'VOLLEYBALL'], ['🚐', 'VAN'],
        ['🪻', 'VEILCHEN'], ['🧛', 'VAMPIR']],
    W: [['🍉', 'WASSERMELONE'], ['🐋', 'WAL'], ['🌊', 'WELLE'], ['🐺', 'WOLF'],
        ['🎲', 'WÜRFEL'], ['💧', 'WASSER'], ['🌾', 'WEIZEN'], ['🍷', 'WEIN'],
        ['🪱', 'WURM'], ['🦝', 'WASCHBÄR'], ['☁️', 'WOLKE'], ['🌭', 'WÜRSTCHEN'],
        ['🧺', 'WÄSCHEKORB'], ['⏰', 'WECKER']],
    X: [['❌', 'X'], ['✖️', 'X-ZEICHEN']],
    Y: [['🧘', 'YOGA'], ['🛥️', 'YACHT']],
    Z: [['🦓', 'ZEBRA'], ['🧟', 'ZOMBIE'], ['🍋', 'ZITRONE'], ['🧅', 'ZWIEBEL'],
        ['🐐', 'ZIEGE'], ['🚆', 'ZUG'], ['🦷', 'ZAHN'], ['🎪', 'ZIRKUS'],
        ['🧙', 'ZAUBERER'], ['🎯', 'ZIELSCHEIBE']]
  };

  /* Ungefaehre Buchstabenhaeufigkeit im Deutschen, fuer die Fuellkacheln.
   * Q, X und Y bleiben absichtlich selten -- ein Brett voller Exoten ist
   * ein Brett, auf dem nichts zu finden ist. */
  var WEIGHT = {
    A: 65, B: 19, C: 27, D: 51, E: 174, F: 17, G: 30, H: 48, I: 76, J: 3,
    K: 15, L: 35, M: 25, N: 98, O: 25, P: 7, Q: 1, R: 70, S: 73, T: 62,
    U: 44, V: 7, W: 19, X: 1, Y: 1, Z: 11
  };

  var LETTERS = Object.keys(ALPHABET);

  /* Ein Eimer voller Buchstaben, in dem haeufige oefter vorkommen.
   * Ziehen heisst dann einfach: einen Zettel herausgreifen. */
  var WEIGHTED_POOL = (function () {
    var pool = [];
    LETTERS.forEach(function (letter) {
      var n = Math.max(1, Math.round(WEIGHT[letter] / 3));
      for (var i = 0; i < n; i++) pool.push(letter);
    });
    return pool;
  })();

  function tileFor(letter, rng) {
    var bucket = ALPHABET[letter];
    if (!bucket || !bucket.length) {
      return { emoji: '❔', name: 'UNBEKANNT', letter: letter };
    }
    var r = rng ? rng() : Math.random();
    var pick = bucket[Math.floor(r * bucket.length) % bucket.length];
    return { emoji: pick[0], name: pick[1], letter: letter };
  }

  function randomLetter(rng) {
    var r = rng ? rng() : Math.random();
    return WEIGHTED_POOL[Math.floor(r * WEIGHTED_POOL.length) % WEIGHTED_POOL.length];
  }

  global.EmojiAlphabet = {
    ALPHABET: ALPHABET,
    LETTERS: LETTERS,
    WEIGHT: WEIGHT,
    tileFor: tileFor,
    randomLetter: randomLetter
  };
})(window);
