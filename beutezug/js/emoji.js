/* ------------------------------------------------------------------
 * emoji.js -- die Alphabete.
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
 *
 * Das Alphabet ist der Teil des Spiels, der am wenigsten uebersetzbar
 * ist: dieselbe Katze ist im Deutschen ein K und im Englischen ein C.
 * Jede Sprache bekommt darum ihre eigene Zuordnung -- dieselben Bilder,
 * neu sortiert -- und ihre eigene Buchstabenhaeufigkeit fuer die
 * Fuellkacheln. Innerhalb einer Sprache gilt weiter: ein Emoji, ein
 * Buchstabe.
 * ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var ALPHABETE = {};
  var GEWICHTE = {};

  ALPHABETE.de = {
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

  /*
   * Englisch: dieselben Bilder, neu einsortiert. Die Umsortierung ist
   * der eigentliche Inhalt dieser Tabelle -- aus der KATZE wird CAT,
   * aus dem LÖWEN LION (der bleibt beim L), aus der KRONE wird QUEEN,
   * weil es fuer das Q sonst kein Bild gibt. Q, X, Y und Z sind hier
   * so knapp wie im Deutschen; darum bleiben sie in der Haeufigkeit
   * unten selten.
   *
   * Fuenf Bilder kommen neu dazu, weil sie erst im Englischen einen
   * Buchstaben tragen, der sonst leer bliebe: UMBRELLA, UNICORN, YARN,
   * ZERO und QUESTION.
   */
  ALPHABETE.en = {
    A: [['🍎', 'APPLE'], ['⚓', 'ANCHOR'], ['🐜', 'ANT'], ['🥑', 'AVOCADO'],
        ['👽', 'ALIEN'], ['⏰', 'ALARM']],
    B: [['🍌', 'BANANA'], ['🐻', 'BEAR'], ['📖', 'BOOK'], ['🚌', 'BUS'],
        ['🐝', 'BEE'], ['🍞', 'BREAD'], ['🦫', 'BEAVER'], ['🦡', 'BADGER'],
        ['🪣', 'BUCKET'], ['🚲', 'BICYCLE'], ['🦇', 'BAT'], ['🧠', 'BRAIN'],
        ['🐦', 'BIRD'], ['🧺', 'BASKET'], ['🧱', 'BRICKS'], ['🦋', 'BUTTERFLY']],
    C: [['💻', 'COMPUTER'], ['🤡', 'CLOWN'], ['🥐', 'CROISSANT'], ['🍹', 'COCKTAIL'],
        ['🧁', 'CUPCAKE'], ['🚗', 'CAR'], ['🥫', 'CAN'], ['🐱', 'CAT'],
        ['🎂', 'CAKE'], ['🧀', 'CHEESE'], ['🍒', 'CHERRY'], ['🕯️', 'CANDLE'],
        ['🐄', 'COW'], ['🦀', 'CRAB'], ['📷', 'CAMERA'], ['🐪', 'CAMEL'],
        ['🥕', 'CARROT'], ['☕', 'COFFEE'], ['🧭', 'COMPASS'], ['🍪', 'COOKIE'],
        ['🥒', 'CUCUMBER'], ['🌽', 'CORN'], ['☁️', 'CLOUD'], ['🐛', 'CATERPILLAR'],
        ['🎪', 'CIRCUS']],
    D: [['🐬', 'DOLPHIN'], ['🦕', 'DINOSAUR'], ['🐉', 'DRAGON'], ['🍩', 'DONUT'],
        ['💎', 'DIAMOND'], ['🦆', 'DUCK'], ['🦌', 'DEER'], ['🐕', 'DOG'],
        ['🚪', 'DOOR'], ['🪘', 'DRUM'], ['🎲', 'DICE']],
    E: [['🥚', 'EGG'], ['🐘', 'ELEPHANT'], ['🌍', 'EARTH'], ['🦅', 'EAGLE'],
        ['👁️', 'EYE'], ['👂', 'EAR'], ['🧯', 'EXTINGUISHER']],
    F: [['🐟', 'FISH'], ['🔥', 'FIRE'], ['🦊', 'FOX'], ['🪶', 'FEATHER'],
        ['🦶', 'FOOT'], ['🚩', 'FLAG'], ['🦩', 'FLAMINGO'], ['🎬', 'FILM'],
        ['🌼', 'FLOWER'], ['🍴', 'FORK'], ['🍟', 'FRIES'], ['🎡', 'FERRIS WHEEL']],
    G: [['🎸', 'GUITAR'], ['🦒', 'GIRAFFE'], ['👻', 'GHOST'], ['🎁', 'GIFT'],
        ['🪿', 'GOOSE'], ['👓', 'GLASSES'], ['🧤', 'GLOVE'], ['🐐', 'GOAT']],
    H: [['🏠', 'HOUSE'], ['🖐️', 'HAND'], ['❤️', 'HEART'], ['🔨', 'HAMMER'],
        ['🐔', 'HEN'], ['🎩', 'HAT'], ['🍯', 'HONEY'], ['🚁', 'HELICOPTER'],
        ['🐹', 'HAMSTER'], ['👜', 'HANDBAG'], ['🦔', 'HEDGEHOG'], ['🐴', 'HORSE'],
        ['🌭', 'HOT DOG']],
    I: [['🏝️', 'ISLAND'], ['🪲', 'INSECT'], ['🧊', 'ICE'], ['🍦', 'ICE CREAM']],
    J: [['🃏', 'JOKER'], ['🕹️', 'JOYSTICK'], ['👖', 'JEANS'], ['🧥', 'JACKET'],
        ['🤹', 'JUGGLER'], ['🪼', 'JELLYFISH']],
    K: [['🥝', 'KIWI'], ['🦘', 'KANGAROO'], ['🐨', 'KOALA'], ['🪁', 'KITE'],
        ['🔑', 'KEY'], ['🔪', 'KNIFE']],
    L: [['🦁', 'LION'], ['💡', 'LAMP'], ['🪜', 'LADDER'], ['🚂', 'LOCOMOTIVE'],
        ['🔊', 'LOUDSPEAKER'], ['🏮', 'LANTERN'], ['🍭', 'LOLLIPOP'],
        ['⚡', 'LIGHTNING'], ['🦞', 'LOBSTER'], ['🍋', 'LEMON']],
    M: [['🌙', 'MOON'], ['🐭', 'MOUSE'], ['🥛', 'MILK'], ['🧲', 'MAGNET'],
        ['🎤', 'MICROPHONE'], ['🥭', 'MANGO'], ['🧜', 'MERMAID'], ['🏍️', 'MOTORBIKE'],
        ['🦟', 'MOSQUITO'], ['🎭', 'MASKS'], ['🐒', 'MONKEY'], ['💰', 'MONEY'],
        ['🏔️', 'MOUNTAIN'], ['🍄', 'MUSHROOM']],
    N: [['👃', 'NOSE'], ['🪺', 'NEST'], ['🥜', 'NUT'], ['🍜', 'NOODLES'],
        ['🪡', 'NEEDLE'], ['🌃', 'NIGHT'], ['🔢', 'NUMBERS'], ['🎶', 'NOTES']],
    O: [['🐙', 'OCTOPUS'], ['🍊', 'ORANGE'], ['🫒', 'OLIVE'], ['🦦', 'OTTER'],
        ['🦉', 'OWL'], ['🧅', 'ONION']],
    P: [['🍕', 'PIZZA'], ['🐧', 'PENGUIN'], ['🐼', 'PANDA'], ['🍑', 'PEACH'],
        ['🌴', 'PALM'], ['🧩', 'PUZZLE'], ['🦚', 'PEACOCK'], ['🥞', 'PANCAKE'],
        ['🍿', 'POPCORN'], ['🐩', 'POODLE'], ['🫑', 'PEPPER'], ['🎹', 'PIANO'],
        ['📯', 'POSTHORN'], ['✏️', 'PENCIL'], ['🍐', 'PEAR'], ['🍍', 'PINEAPPLE'],
        ['🥨', 'PRETZEL'], ['🥔', 'POTATO'], ['🐷', 'PIG']],
    Q: [['❓', 'QUESTION'], ['👑', 'QUEEN']],
    R: [['🚀', 'ROCKET'], ['🌈', 'RAINBOW'], ['🤖', 'ROBOT'], ['💍', 'RING'],
        ['🌹', 'ROSE'], ['🍚', 'RICE'], ['📻', 'RADIO'], ['🐀', 'RAT'],
        ['🌧️', 'RAIN'], ['🎒', 'RUCKSACK'], ['📏', 'RULER'], ['🦏', 'RHINO'],
        ['🦝', 'RACCOON']],
    S: [['☀️', 'SUN'], ['⭐', 'STAR'], ['🐍', 'SNAKE'], ['🧦', 'SOCK'],
        ['🚢', 'SHIP'], ['🐌', 'SNAIL'], ['⛄', 'SNOWMAN'], ['🕷️', 'SPIDER'],
        ['🧽', 'SPONGE'], ['🌻', 'SUNFLOWER'], ['🐑', 'SHEEP'], ['❄️', 'SNOWFLAKE'],
        ['🧂', 'SALT'], ['✂️', 'SCISSORS'], ['👟', 'SHOE'], ['🥪', 'SANDWICH'],
        ['🎷', 'SAXOPHONE'], ['🕸️', 'SPIDERWEB'], ['🚿', 'SHOWER'], ['🦈', 'SHARK'],
        ['🐿️', 'SQUIRREL'], ['🍓', 'STRAWBERRY'], ['⬜', 'SQUARE']],
    T: [['🐯', 'TIGER'], ['🍅', 'TOMATO'], ['🎺', 'TRUMPET'], ['🎫', 'TICKET'],
        ['🔭', 'TELESCOPE'], ['📞', 'TELEPHONE'], ['🚕', 'TAXI'], ['🧸', 'TEDDY'],
        ['🌮', 'TACO'], ['🍵', 'TEA'], ['🦃', 'TURKEY'], ['🌳', 'TREE'],
        ['🚚', 'TRUCK'], ['🚆', 'TRAIN'], ['🦷', 'TOOTH'], ['🎯', 'TARGET']],
    U: [['🛸', 'UFO'], ['🚇', 'UNDERGROUND'], ['🩲', 'UNDERPANTS'],
        ['☂️', 'UMBRELLA'], ['🦄', 'UNICORN']],
    V: [['🌋', 'VOLCANO'], ['🏐', 'VOLLEYBALL'], ['🚐', 'VAN'], ['🪻', 'VIOLET'],
        ['🧛', 'VAMPIRE'], ['🎻', 'VIOLIN']],
    W: [['🍉', 'WATERMELON'], ['🐋', 'WHALE'], ['🌊', 'WAVE'], ['🐺', 'WOLF'],
        ['💧', 'WATER'], ['🌾', 'WHEAT'], ['🍷', 'WINE'], ['🪱', 'WORM'],
        ['🪟', 'WINDOW'], ['🛞', 'WHEEL'], ['⌚', 'WATCH'], ['🧙', 'WIZARD']],
    X: [['❌', 'X'], ['✖️', 'X-MARK']],
    Y: [['🧘', 'YOGA'], ['🛥️', 'YACHT'], ['🪀', 'YOYO'], ['🧶', 'YARN']],
    Z: [['🦓', 'ZEBRA'], ['🧟', 'ZOMBIE'], ['0️⃣', 'ZERO']]
  };

  /* Ungefaehre Buchstabenhaeufigkeit der Sprache, fuer die Fuellkacheln.
   * Q, X und Y bleiben absichtlich selten -- ein Brett voller Exoten ist
   * ein Brett, auf dem nichts zu finden ist. */
  GEWICHTE.de = {
    A: 65, B: 19, C: 27, D: 51, E: 174, F: 17, G: 30, H: 48, I: 76, J: 3,
    K: 15, L: 35, M: 25, N: 98, O: 25, P: 7, Q: 1, R: 70, S: 73, T: 62,
    U: 44, V: 7, W: 19, X: 1, Y: 1, Z: 11
  };

  GEWICHTE.en = {
    A: 82, B: 15, C: 28, D: 43, E: 127, F: 22, G: 20, H: 61, I: 70, J: 2,
    K: 8, L: 40, M: 24, N: 67, O: 75, P: 19, Q: 1, R: 60, S: 63, T: 91,
    U: 28, V: 10, W: 24, X: 1, Y: 20, Z: 1
  };

  var LETTERS = Object.keys(ALPHABETE.de);

  /* Ein Eimer voller Buchstaben, in dem haeufige oefter vorkommen.
   * Ziehen heisst dann einfach: einen Zettel herausgreifen. Pro Sprache
   * einmal gefuellt, beim ersten Zug in dieser Sprache. */
  var eimer = {};

  function pool(code) {
    if (eimer[code]) return eimer[code];
    var gewicht = GEWICHTE[code];
    var liste = [];
    LETTERS.forEach(function (letter) {
      var n = Math.max(1, Math.round(gewicht[letter] / 3));
      for (var i = 0; i < n; i++) liste.push(letter);
    });
    eimer[code] = liste;
    return liste;
  }

  var aktiv = 'de';

  function setzeSprache(code) {
    if (ALPHABETE[code]) aktiv = code;
    return aktiv;
  }

  function alphabet() {
    return ALPHABETE[aktiv];
  }

  function tileFor(letter, rng) {
    var bucket = alphabet()[letter];
    if (!bucket || !bucket.length) {
      return { emoji: '❔', name: 'UNBEKANNT', letter: letter };
    }
    var r = rng ? rng() : Math.random();
    var pick = bucket[Math.floor(r * bucket.length) % bucket.length];
    return { emoji: pick[0], name: pick[1], letter: letter };
  }

  function randomLetter(rng) {
    var liste = pool(aktiv);
    var r = rng ? rng() : Math.random();
    return liste[Math.floor(r * liste.length) % liste.length];
  }

  global.EmojiAlphabet = {
    ALPHABETE: ALPHABETE,
    GEWICHTE: GEWICHTE,
    LETTERS: LETTERS,
    alphabet: alphabet,
    gewichte: function () { return GEWICHTE[aktiv]; },
    setzeSprache: setzeSprache,
    sprache: function () { return aktiv; },
    tileFor: tileFor,
    randomLetter: randomLetter
  };

  if (global.Sprache) global.Sprache.folgt(setzeSprache);
})(window);
