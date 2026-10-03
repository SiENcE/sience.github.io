/* Shared game rules, also used by the dependency-free tests. */
(function (root, factory) {
  const core = factory();
  if (typeof module === "object" && module.exports) module.exports = core;
  else root.Wiese = core;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  /*
   * How each letter sounds at the start of a German word (Anlaut), not its
   * name: "mmm" instead of "Emm". Browser voices can only spell letter names,
   * so sounds are human recordings in audio/laute/<letter>.wav (imported from
   * KDE's KLettres by tools/import-klettres.cjs; see audio/laute/QUELLE.md).
   * "say" and "example" help adults who read aloud and the file-less fallback.
   */
  const LAUTE = {
    A: { say: "aaa", example: "Apfel" },
    B: { say: "b (kurz)", example: "Ball" },
    C: { say: "k wie Clown – oder z wie Circus", example: "Clown" },
    D: { say: "d (kurz)", example: "Dose" },
    E: { say: "eee", example: "Esel" },
    F: { say: "fff", example: "Fisch" },
    G: { say: "g (kurz)", example: "Gabel" },
    H: { say: "h (gehaucht)", example: "Hase" },
    I: { say: "iii", example: "Igel" },
    J: { say: "jjj", example: "Jacke" },
    K: { say: "k (kurz)", example: "Katze" },
    L: { say: "lll", example: "Löwe" },
    M: { say: "mmm", example: "Maus" },
    N: { say: "nnn", example: "Nase" },
    O: { say: "ooo", example: "Oma" },
    P: { say: "p (kurz)", example: "Pilz" },
    Q: { say: "kw", example: "Qualle" },
    R: { say: "rrr", example: "Rose" },
    S: { say: "sss (summend)", example: "Sonne" },
    T: { say: "t (kurz)", example: "Tiger" },
    U: { say: "uuu", example: "Ufo" },
    V: { say: "fff wie Vogel – oder w wie Vase", example: "Vogel" },
    W: { say: "www", example: "Wal" },
    X: { say: "ks", example: "Xylofon" },
    Y: { say: "üüü wie Typ – oder j wie Yak", example: "Yak" },
    Z: { say: "ts", example: "Zebra" },
  };
  // Never asked as a sound: several sounds (C, V, Y) or letter combinations
  // (Q = kw, X = ks); the recordings of these say the letter name.
  const AMBIGUOUS_LAUTE = "CQVXY";
  // Pressing a letter that can make the same sound also counts as right.
  const SAME_SOUND = { F: "V", W: "V", K: "C", Z: "C", J: "Y" };
  const ROUND_GOAL = 3;
  const ROUND_MAX_TASKS = 6;

  const ACTIVITIES = [
    { id: "type", icon: "⌨️", title: "Hören & tippen", color: "peach" },
    { id: "initial", icon: "🦊", title: "Anlaut-Detektiv", color: "mint" },
    { id: "blend", icon: "🪄", title: "Laute-Zauber", color: "rose" },
    { id: "merk", icon: "🧠", title: "Merkwörter", color: "yellow" },
    { id: "missing", icon: "🧩", title: "Wer fehlt?", color: "yellow" },
    { id: "neighbor", icon: "🐛", title: "ABC-Nachbarn", color: "sky" },
    { id: "order", icon: "🔤", title: "ABC-Werkstatt", color: "lavender" },
    {
      id: "memory",
      icon: "🎒",
      title: "Wörter-Rucksack",
      color: "rose",
      together: true,
    },
    {
      id: "echo",
      icon: "🦜",
      title: "Quatschwort-Echo",
      color: "lavender",
      together: true,
    },
    {
      id: "movement",
      icon: "👏",
      title: "Mitmach-Spiel",
      color: "peach",
      together: true,
    },
  ];

  // Every game gets gradually harder. Each first-try success climbs one step.
  const LEVELS = {
    type: [
      { range: "ABCDEFGH", keys: 5, label: "A–H, 5 Tasten" },
      { range: "ABCDEFGH", keys: 7, label: "A–H, alle Tasten" },
      { range: "IJKLMNOP", keys: 6, label: "I–P, 6 Tasten" },
      { range: "QRSTUVWXYZ", keys: 6, label: "Q–Z, 6 Tasten" },
      { range: ALPHABET, keys: 8, label: "ganzes ABC, 8 Tasten" },
      { range: ALPHABET, keys: 12, label: "ganzes ABC, 12 Tasten" },
      { range: ALPHABET, keys: 18, label: "ganzes ABC, 18 Tasten" },
      { range: ALPHABET, keys: 26, label: "ganzes ABC, alle Tasten" },
      {
        range: ALPHABET,
        keys: 26,
        lower: true,
        label: "kleine Buchstaben, alle Tasten",
      },
      {
        range: "BPDTGKMNFWLR",
        keys: 26,
        label: "ähnliche Laute (B/P, D/T, G/K …)",
      },
    ],
    order: [
      { count: 3, range: "ABCDEFGHIJKLM", label: "3 Buchstaben, A–M" },
      { count: 4, range: "ABCDEFGHIJKLM", label: "4 Buchstaben, A–M" },
      { count: 4, range: ALPHABET, label: "4 Buchstaben, ganzes ABC" },
      { count: 5, range: ALPHABET, label: "5 Buchstaben" },
      { count: 3, gaps: true, range: ALPHABET, label: "3 mit Lücken" },
      { count: 4, gaps: true, range: ALPHABET, label: "4 mit Lücken" },
      { count: 3, reverse: true, range: ALPHABET, label: "3 rückwärts" },
      { count: 4, reverse: true, range: ALPHABET, label: "4 rückwärts" },
      { count: 5, gaps: true, range: ALPHABET, label: "5 mit Lücken" },
    ],
    neighbor: [
      { dir: "after", range: "ABCDEFGHIJKLM", choices: 3, label: "danach, A–M" },
      { dir: "after", range: ALPHABET, choices: 3, label: "danach, ganzes ABC" },
      { dir: "before", range: "ABCDEFGHIJKLM", choices: 3, label: "davor, A–M" },
      { dir: "before", range: ALPHABET, choices: 3, label: "davor, ganzes ABC" },
      { dir: "mixed", range: ALPHABET, choices: 3, label: "davor oder danach" },
      { dir: "mixed", range: ALPHABET, choices: 4, label: "gemischt, 4 Karten" },
      { dir: "between", range: ALPHABET, choices: 4, label: "dazwischen" },
      { dir: "any", range: ALPHABET, choices: 5, label: "alles, 5 Karten" },
    ],
    missing: [
      { length: 4, gaps: 1, choices: 3, label: "4er-Reihe, 1 Lücke" },
      { length: 5, gaps: 1, choices: 3, label: "5er-Reihe, 1 Lücke" },
      { length: 6, gaps: 1, choices: 4, label: "6er-Reihe, 1 Lücke" },
      { length: 5, gaps: 2, choices: 4, label: "5er-Reihe, 2 Lücken" },
      { length: 6, gaps: 2, choices: 4, label: "6er-Reihe, 2 Lücken" },
      { length: 7, gaps: 2, choices: 5, label: "7er-Reihe, 2 Lücken" },
      { length: 7, gaps: 3, choices: 5, label: "7er-Reihe, 3 Lücken" },
      { length: 8, gaps: 3, choices: 6, label: "8er-Reihe, 3 Lücken" },
    ],
    initial: [
      { choices: 3, picture: true, far: true, label: "3 Karten mit Bild" },
      { choices: 3, picture: true, label: "3 Karten mit Bild, gemischt" },
      { choices: 4, picture: true, label: "4 Karten mit Bild" },
      { reverse: true, choices: 3, label: "Laut hören, Bild wählen" },
      { choices: 3, picture: false, label: "3 Karten ohne Bild" },
      {
        choices: 4,
        picture: true,
        confusable: true,
        label: "4 Karten, ähnliche Laute",
      },
      {
        reverse: true,
        choices: 4,
        confusable: true,
        label: "Laut hören, 4 Bilder, ähnliche Laute",
      },
      { choices: 4, picture: false, label: "4 Karten ohne Bild" },
      {
        choices: 4,
        picture: false,
        confusable: true,
        label: "ohne Bild, ähnliche Laute",
      },
    ],
    // Shorter pauses between the sounds make blending easier.
    blend: [
      { min: 3, max: 3, choices: 3, gap: 250, label: "3 Laute, 3 Bilder" },
      { min: 3, max: 4, choices: 3, gap: 300, label: "3–4 Laute" },
      {
        min: 4,
        max: 4,
        choices: 3,
        similar: true,
        gap: 350,
        label: "4 Laute, ähnliche Wörter",
      },
      { min: 4, max: 5, choices: 4, gap: 400, label: "4–5 Laute, 4 Bilder" },
      {
        min: 5,
        max: 6,
        choices: 4,
        similar: true,
        gap: 450,
        label: "5–6 Laute, ähnliche Wörter",
      },
      {
        min: 3,
        max: 4,
        choices: 3,
        written: true,
        gap: 400,
        label: "Wörter lesen statt Bilder",
      },
      {
        min: 4,
        max: 6,
        choices: 4,
        written: true,
        similar: true,
        gap: 450,
        label: "lesen, ähnliche Wörter",
      },
    ],
    // Special letters are learned through whole words (Merkwörter).
    merk: [
      { rules: ["qu"], label: "Qu: Qualle, quaken" },
      { rules: ["vf"], label: "V klingt wie F: Vogel, Vater" },
      { rules: ["x"], label: "x klingt wie ks: Taxi, Hexe" },
      { rules: ["c"], label: "C klingt wie K: Clown, Cola" },
      { rules: ["yi"], label: "y am Ende: Baby, Pony" },
      { rules: ["vf", "vw"], label: "V wie F oder W: Vogel, Vase" },
      { rules: ["c", "cz", "yi", "yu", "yj"], label: "C und Y gemischt" },
      { rules: ["qu", "vf", "vw", "x", "c", "cz", "yi", "yu", "yj"], label: "alle Merkwörter" },
      {
        rules: ["qu", "vf", "vw", "x", "c", "cz", "yi", "yu", "yj"],
        picture: false,
        label: "alle Merkwörter, ohne Bild",
      },
    ],
    memory: [
      { length: 2, label: "2 Wörter" },
      { length: 3, label: "3 Wörter" },
      { length: 2, reverse: true, label: "2 Wörter rückwärts" },
      { length: 4, label: "4 Wörter" },
      { length: 3, reverse: true, label: "3 Wörter rückwärts" },
      { length: 5, label: "5 Wörter" },
      { length: 4, reverse: true, label: "4 Wörter rückwärts" },
    ],
    echo: [
      { syllables: 2, label: "2 Silben" },
      { syllables: 3, label: "3 Silben" },
      { syllables: 2, clusters: true, label: "2 Silben, schwierige Laute" },
      { syllables: 4, label: "4 Silben" },
      { syllables: 3, clusters: true, label: "3 Silben, schwierige Laute" },
      { syllables: 5, label: "5 Silben" },
      { syllables: 2, words: 2, clusters: true, label: "2 Quatschwörter" },
    ],
    movement: [
      { length: 2, label: "2 Bewegungen" },
      { length: 3, label: "3 Bewegungen" },
      { length: 4, label: "4 Bewegungen" },
      { length: 3, reverse: true, label: "3 Bewegungen rückwärts" },
      { length: 5, label: "5 Bewegungen" },
      { length: 4, reverse: true, label: "4 Bewegungen rückwärts" },
    ],
  };

  const WORDS = [
    { word: "Maus", initial: "M", icon: "🐭" },
    { word: "Mond", initial: "M", icon: "🌙" },
    { word: "Fisch", initial: "F", icon: "🐟" },
    { word: "Feder", initial: "F", icon: "🪶" },
    { word: "Sonne", initial: "S", icon: "☀️" },
    { word: "Seife", initial: "S", icon: "🧼" },
    { word: "Ball", initial: "B", icon: "⚽" },
    { word: "Banane", initial: "B", icon: "🍌" },
    { word: "Hase", initial: "H", icon: "🐰" },
    { word: "Hund", initial: "H", icon: "🐶" },
    { word: "Nase", initial: "N", icon: "👃" },
    { word: "Nuss", initial: "N", icon: "🌰" },
    { word: "Lampe", initial: "L", icon: "💡" },
    { word: "Löwe", initial: "L", icon: "🦁" },
    { word: "Rose", initial: "R", icon: "🌹" },
    { word: "Rakete", initial: "R", icon: "🚀" },
    { word: "Apfel", initial: "A", icon: "🍎" },
    { word: "Affe", initial: "A", icon: "🐒" },
    { word: "Igel", initial: "I", icon: "🦔" },
    { word: "Insel", initial: "I", icon: "🏝️" },
    { word: "Oma", initial: "O", icon: "👵" },
    { word: "Ohr", initial: "O", icon: "👂" },
    { word: "Uhr", initial: "U", icon: "🕒" },
    { word: "Ufo", initial: "U", icon: "🛸" },
    { word: "Ente", initial: "E", icon: "🦆" },
    { word: "Elefant", initial: "E", icon: "🐘" },
    { word: "Tiger", initial: "T", icon: "🐯" },
    { word: "Tasse", initial: "T", icon: "☕" },
    { word: "Kuh", initial: "K", icon: "🐮" },
    { word: "Katze", initial: "K", icon: "🐱" },
    { word: "Dose", initial: "D", icon: "🥫" },
    { word: "Dino", initial: "D", icon: "🦕" },
    { word: "Wolke", initial: "W", icon: "☁️" },
    { word: "Wal", initial: "W", icon: "🐳" },
    { word: "Pilz", initial: "P", icon: "🍄" },
    { word: "Pinguin", initial: "P", icon: "🐧" },
    { word: "Gabel", initial: "G", icon: "🍴" },
    { word: "Giraffe", initial: "G", icon: "🦒" },
    { word: "Zebra", initial: "Z", icon: "🦓" },
    { word: "Zitrone", initial: "Z", icon: "🍋" },
  ];
  // Letters whose sounds are easily mixed up; used as harder distractors.
  const CONFUSABLE = {
    M: "N",
    N: "M",
    B: "P",
    P: "B",
    D: "T",
    T: "D",
    F: "W",
    W: "F",
    G: "K",
    K: "G",
    I: "E",
    E: "I",
    O: "U",
    U: "O",
    S: "Z",
    Z: "S",
    L: "R",
    R: "L",
    A: "O",
    H: "A",
  };
  /*
   * Words for blending sounds. "sounds" lists one recorded Laut per letter as
   * they are heard (Mond → M-O-N-T), using only unambiguous sounds and avoiding
   * sch, ch, ei, au, eu.
   */
  const BLEND_WORDS = [
    { word: "Oma", sounds: "OMA", icon: "👵" },
    { word: "Opa", sounds: "OPA", icon: "👴" },
    { word: "Ufo", sounds: "UFO", icon: "🛸" },
    { word: "Hut", sounds: "HUT", icon: "🎩" },
    { word: "Bus", sounds: "BUS", icon: "🚌" },
    { word: "Lok", sounds: "LOK", icon: "🚂" },
    { word: "Wal", sounds: "WAL", icon: "🐳" },
    { word: "Ball", sounds: "BAL", icon: "⚽" },
    { word: "Affe", sounds: "AFE", icon: "🐒" },
    { word: "Lama", sounds: "LAMA", icon: "🦙" },
    { word: "Sofa", sounds: "SOFA", icon: "🛋️" },
    { word: "Nase", sounds: "NASE", icon: "👃" },
    { word: "Rose", sounds: "ROSE", icon: "🌹" },
    { word: "Hose", sounds: "HOSE", icon: "👖" },
    { word: "Dose", sounds: "DOSE", icon: "🥫" },
    { word: "Hase", sounds: "HASE", icon: "🐰" },
    { word: "Limo", sounds: "LIMO", icon: "🥤" },
    { word: "Lupe", sounds: "LUPE", icon: "🔍" },
    { word: "Igel", sounds: "IGEL", icon: "🦔" },
    { word: "Mond", sounds: "MONT", icon: "🌙" },
    { word: "Dino", sounds: "DINO", icon: "🦕" },
    { word: "Kiwi", sounds: "KIWI", icon: "🥝" },
    { word: "Brot", sounds: "BROT", icon: "🍞" },
    { word: "Ente", sounds: "ENTE", icon: "🦆" },
    { word: "Hund", sounds: "HUNT", icon: "🐶" },
    { word: "Pilz", sounds: "PILZ", icon: "🍄" },
    { word: "Gabel", sounds: "GABEL", icon: "🍴" },
    { word: "Zebra", sounds: "ZEBRA", icon: "🦓" },
    { word: "Tiger", sounds: "TIGER", icon: "🐯" },
    { word: "Krone", sounds: "KRONE", icon: "👑" },
    { word: "Blume", sounds: "BLUME", icon: "🌼" },
    { word: "Salat", sounds: "SALAT", icon: "🥗" },
    { word: "Kamel", sounds: "KAMEL", icon: "🐪" },
    { word: "Wolke", sounds: "WOLKE", icon: "☁️" },
    { word: "Tomate", sounds: "TOMATE", icon: "🍅" },
    { word: "Banane", sounds: "BANANE", icon: "🍌" },
    { word: "Rakete", sounds: "RAKETE", icon: "🚀" },
    { word: "Melone", sounds: "MELONE", icon: "🍉" },
    { word: "Pinsel", sounds: "PINSEL", icon: "🖌️" },
    { word: "Ananas", sounds: "ANANAS", icon: "🍍" },
  ];
  /*
   * C, Q, V, X and Y have no sound of their own, so children learn them as
   * Merkwörter: words spelled differently than they sound. "spelled" marks the
   * part to find in brackets. Rules: "text" is shown; "speech" is spoken and
   * may name letters (Fau, Iks …) – the only place letter names are used,
   * because these spellings cannot be heard.
   */
  const MERK_GROUPS = { qu: "Qu", v: "V", x: "X", c: "C", y: "Y" };
  const MERK_RULES = {
    qu: {
      group: "qu",
      text: "Nach Q kommt immer ein u: Man hört „kw“ und schreibt Qu.",
      speech: "Man hört kw und schreibt Kuh U.",
    },
    vf: {
      group: "v",
      text: "Man hört „f“, schreibt aber V. Das muss man sich merken: Vogel, Vater, vier.",
      speech: "Man hört f, schreibt aber Fau. Das muss man sich merken.",
    },
    vw: {
      group: "v",
      text: "Hier klingt V wie W – so wie in Vase, Vulkan und Video.",
      speech: "Hier klingt das Fau wie ein We.",
    },
    x: {
      group: "x",
      text: "Man hört „ks“ und schreibt x: Taxi, Hexe, Box.",
      speech: "Man hört ks und schreibt Iks.",
    },
    c: {
      group: "c",
      text: "In Wörtern aus anderen Sprachen schreibt man oft C, obwohl man „k“ hört.",
      speech: "Man hört k, schreibt aber Zeh.",
    },
    cz: {
      group: "c",
      text: "In Cent klingt C wie Z.",
      speech: "Hier klingt das Zeh wie Zett.",
    },
    yi: {
      group: "y",
      text: "Am Ende hört man „i“, schreibt aber y: Baby, Pony, Handy.",
      speech: "Am Ende hört man i, schreibt aber Ypsilon.",
    },
    yu: {
      group: "y",
      text: "Hier hört man „ü“, schreibt aber y: Pyramide, Zylinder.",
      speech: "Hier hört man ü, schreibt aber Ypsilon.",
    },
    yj: {
      group: "y",
      text: "In Yoga klingt Y wie J.",
      speech: "Hier klingt das Ypsilon wie Jott.",
    },
  };
  const MERK_WORDS = [
    { spelled: "[Qu]adrat", icon: "🟥", rule: "qu", choices: ["Qu", "K", "Kw"] },
    { spelled: "[Qu]atsch", icon: "🤪", rule: "qu", choices: ["Qu", "K", "Kw"] },
    { spelled: "[qu]aken", icon: "🐸", rule: "qu", choices: ["qu", "k", "kw"] },
    { spelled: "[Qu]iz", icon: "❓", rule: "qu", choices: ["Qu", "K", "Kw"] },
    { spelled: "[V]ogel", icon: "🐦", rule: "vf", choices: ["V", "F", "W"] },
    { spelled: "[V]ater", icon: "👨", rule: "vf", choices: ["V", "F", "W"] },
    { spelled: "[v]ier", icon: "4️⃣", rule: "vf", choices: ["v", "f", "w"] },
    { spelled: "[V]orsicht", icon: "⚠️", rule: "vf", choices: ["V", "F", "W"] },
    { spelled: "[V]ulkan", icon: "🌋", rule: "vw", choices: ["V", "W", "F"] },
    { spelled: "[V]ase", icon: "🏺", rule: "vw", choices: ["V", "W", "F"] },
    { spelled: "[V]ampir", icon: "🧛", rule: "vw", choices: ["V", "W", "F"] },
    { spelled: "[V]ideo", icon: "📹", rule: "vw", choices: ["V", "W", "F"] },
    { spelled: "Ta[x]i", icon: "🚕", rule: "x", choices: ["x", "ks", "chs"] },
    { spelled: "He[x]e", icon: "🧙", rule: "x", choices: ["x", "ks", "chs"] },
    { spelled: "Bo[x]", icon: "📦", rule: "x", choices: ["x", "ks", "chs"] },
    { spelled: "Ni[x]e", icon: "🧜", rule: "x", choices: ["x", "ks", "chs"] },
    { spelled: "A[x]t", icon: "🪓", rule: "x", choices: ["x", "ks", "chs"] },
    { spelled: "[C]lown", icon: "🤡", rule: "c", choices: ["C", "K", "G"] },
    { spelled: "[C]omputer", icon: "💻", rule: "c", choices: ["C", "K", "G"] },
    { spelled: "[C]ola", icon: "🥤", rule: "c", choices: ["C", "K", "G"] },
    { spelled: "[C]amping", icon: "⛺", rule: "c", choices: ["C", "K", "G"] },
    { spelled: "[C]ent", icon: "🪙", rule: "cz", choices: ["C", "Z", "S"] },
    { spelled: "Bab[y]", icon: "👶", rule: "yi", choices: ["y", "i", "ie"] },
    { spelled: "Pon[y]", icon: "🐴", rule: "yi", choices: ["y", "i", "ie"] },
    { spelled: "Hand[y]", icon: "📱", rule: "yi", choices: ["y", "i", "ie"] },
    { spelled: "Tedd[y]", icon: "🧸", rule: "yi", choices: ["y", "i", "ie"] },
    { spelled: "Part[y]", icon: "🎉", rule: "yi", choices: ["y", "i", "ie"] },
    { spelled: "P[y]ramide", icon: "🔺", rule: "yu", choices: ["y", "ü", "i"] },
    { spelled: "Z[y]linder", icon: "🎩", rule: "yu", choices: ["y", "ü", "i"] },
    { spelled: "[Y]oga", icon: "🧘", rule: "yj", choices: ["Y", "J", "I"] },
  ];
  const MEMORY_WORDS = [
    "Hund",
    "Ball",
    "Sonne",
    "Maus",
    "Buch",
    "Baum",
    "Auto",
    "Hut",
    "Apfel",
    "Blume",
    "Katze",
    "Brot",
    "Schuh",
    "Fisch",
    "Bett",
    "Stern",
    "Tisch",
    "Vogel",
  ];
  const MOVES = [
    { word: "Klatschen", icon: "👏" },
    { word: "Winken", icon: "👋" },
    { word: "Arme hoch", icon: "🙌" },
    { word: "Stampfen", icon: "🦶" },
    { word: "Drehen", icon: "🔄" },
    { word: "Hüpfen", icon: "🐇" },
    { word: "Nicken", icon: "🙂" },
    { word: "Auf die Knie klopfen", icon: "🦵" },
  ];
  const ECHO_CONSONANTS = "mnlfstpkbdr";
  const ECHO_CLUSTERS = ["bl", "br", "fl", "fr", "kl", "kr", "pl", "pr", "tr", "gr"];
  const ECHO_VOWELS = "aeiou";
  const ECHO_REAL_WORDS = new Set([
    "sofa",
    "kino",
    "lama",
    "tomate",
    "salami",
    "pute",
    "rose",
    "dose",
    "nase",
    "made",
    "limo",
    "tube",
    "lupe",
    "pudel",
  ]);

  const CROPS = [
    {
      id: "carrot",
      name: "Möhre",
      plural: "Möhren",
      icon: "🥕",
      cost: 1,
      grow: 60000,
      yield: 2,
      full: 20,
      joy: 5,
      unlock: 0,
    },
    {
      id: "salad",
      name: "Salat",
      plural: "Salatköpfe",
      icon: "🥬",
      cost: 2,
      grow: 120000,
      yield: 2,
      full: 30,
      joy: 8,
      unlock: 6,
    },
    {
      id: "strawberry",
      name: "Erdbeere",
      plural: "Erdbeeren",
      icon: "🍓",
      cost: 3,
      grow: 180000,
      yield: 3,
      full: 12,
      joy: 25,
      unlock: 15,
    },
    {
      id: "pumpkin",
      name: "Kürbis",
      plural: "Kürbisse",
      icon: "🎃",
      cost: 4,
      grow: 300000,
      yield: 2,
      full: 50,
      joy: 15,
      unlock: 30,
    },
    {
      id: "apple",
      name: "Apfel",
      plural: "Äpfel",
      icon: "🍎",
      cost: 5,
      grow: 300000,
      yield: 4,
      full: 25,
      joy: 20,
      unlock: 60,
    },
  ];
  const BEDS = [0, 0, 0, 10, 40, 80];
  const DECOR = [
    { at: 20, icon: "🦋", name: "Ein Schmetterling", x: 30, y: 30 },
    { at: 25, icon: "🌻", name: "Eine Sonnenblume", x: 88, y: 62 },
    { at: 50, icon: "🐞", name: "Ein Glückskäfer", x: 12, y: 82 },
    { at: 75, icon: "🍄", name: "Ein Pilzhaus", x: 8, y: 66 },
    { at: 100, icon: "🏡", name: "Momos Häuschen", x: 80, y: 50 },
    { at: 150, icon: "🌈", name: "Ein Regenbogen", x: 50, y: 18 },
  ];
  const UNLOCKS = [
    ...CROPS.filter((crop) => crop.unlock > 0).map((crop) => ({
      at: crop.unlock,
      icon: crop.icon,
      name: `${crop.name}-Samen`,
    })),
    ...BEDS.filter((at) => at > 0).map((at) => ({
      at,
      icon: "🟫",
      name: "Ein neues Beet",
    })),
    ...DECOR.map(({ at, icon, name }) => ({ at, icon, name })),
  ].sort((a, b) => a.at - b.at);
  const PET_DECAY = { full: 3, joy: 2 }; // points per hour
  const PET_PETTING_LIMIT = 60;

  function shuffle(items, random = Math.random) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  function pick(items, random) {
    return items[Math.floor(random() * items.length)];
  }
  function alphabetical(letters) {
    return [...letters].sort(
      (a, b) => ALPHABET.indexOf(a) - ALPHABET.indexOf(b),
    );
  }
  function maxLevel(mode) {
    return LEVELS[mode].length - 1;
  }
  function clampLevel(mode, level) {
    const value = Number.isInteger(level) ? level : 0;
    return Math.max(0, Math.min(maxLevel(mode), value));
  }
  function helpSegment(letters) {
    const indexes = [...letters].map((x) => ALPHABET.indexOf(x));
    const from = Math.max(0, Math.min(...indexes) - 1);
    const to = Math.min(25, Math.max(...indexes) + 1);
    return ALPHABET.slice(from, to + 1);
  }
  // The closest letters around a position make believable distractors.
  function nearLetters(index, exclude, count = 6) {
    return [...ALPHABET]
      .filter((x) => !exclude.includes(x))
      .sort(
        (a, b) =>
          Math.abs(ALPHABET.indexOf(a) - index) -
          Math.abs(ALPHABET.indexOf(b) - index),
      )
      .slice(0, count);
  }
  function withChoices(answers, distractors, count, random) {
    const extra = shuffle(
      [...new Set(distractors)].filter((x) => !answers.includes(x)),
      random,
    ).slice(0, count - answers.length);
    return shuffle([...answers, ...extra], random);
  }
  function echoWord(config, random) {
    let word;
    do {
      const parts = [];
      for (let i = 0; i < config.syllables; i++) {
        let syllable;
        do {
          const start =
            config.clusters && i === 0
              ? pick(ECHO_CLUSTERS, random)
              : config.clusters && random() < 0.35
                ? pick(ECHO_CLUSTERS, random)
                : pick([...ECHO_CONSONANTS], random);
          syllable = start + pick([...ECHO_VOWELS], random);
        } while (syllable === parts.at(-1));
        parts.push(syllable);
      }
      word = parts;
    } while (ECHO_REAL_WORDS.has(word.join("")));
    return word;
  }
  const capitalize = (text) => text[0].toUpperCase() + text.slice(1);

  function makeQuestion(mode, level = 0, previous = null, random = Math.random) {
    if (!LEVELS[mode]) throw new Error("Unbekanntes Spiel: " + mode);
    const config = LEVELS[mode][clampLevel(mode, level)];
    for (let attempt = 0; attempt < 8; attempt++) {
      const question = generate(mode, config, previous, random);
      const same =
        mode === "merk"
          ? question.word === previous?.word
          : question.answer === previous?.answer;
      if (!previous || !same)
        return { ...question, mode, level: clampLevel(mode, level) };
    }
    return {
      ...generate(mode, config, null, random),
      mode,
      level: clampLevel(mode, level),
    };
  }
  function generate(mode, config, previous, random) {
    if (mode === "type") {
      const clear = (letters) =>
        [...letters].filter((x) => !AMBIGUOUS_LAUTE.includes(x));
      const answer = pick(
        clear(config.range).filter((x) => x !== previous?.answer),
        random,
      );
      const keys =
        config.keys >= 26
          ? [...ALPHABET]
          : alphabetical([
              answer,
              ...shuffle(
                clear(config.range).filter((x) => x !== answer),
                random,
              ).slice(0, config.keys - 1),
            ]);
      const laut = LAUTE[answer];
      return {
        answer,
        keys,
        accept: [...(SAME_SOUND[answer] || "")].filter((x) => keys.includes(x)),
        lower: Boolean(config.lower),
        speech: { laut: answer },
        cue: `Laut: „${laut.say}“ wie am Anfang von „${laut.example}“`,
      };
    }
    if (mode === "order") {
      const source = config.range;
      let letters;
      do {
        if (config.gaps) {
          const span = Math.min(source.length, config.count * 3);
          const start = Math.floor(random() * (source.length - span + 1));
          const picked = shuffle([...Array(span).keys()], random)
            .slice(0, config.count)
            .sort((a, b) => a - b);
          letters = picked.map((i) => source[start + i]);
        } else {
          const start = Math.floor(
            random() * (source.length - config.count + 1),
          );
          letters = [...source.slice(start, start + config.count)];
        }
      } while (
        config.gaps &&
        ALPHABET.indexOf(letters.at(-1)) - ALPHABET.indexOf(letters[0]) ===
          config.count - 1
      );
      const ordered = config.reverse ? [...letters].reverse() : letters;
      let cards = shuffle(ordered, random);
      if (cards.join("") === ordered.join(""))
        cards = [...cards.slice(1), cards[0]];
      return {
        answer: ordered.join(""),
        cards,
        reverse: Boolean(config.reverse),
        help: helpSegment(letters),
      };
    }
    if (mode === "neighbor") {
      let dir = config.dir;
      if (dir === "mixed") dir = random() < 0.5 ? "after" : "before";
      if (dir === "any") dir = pick(["after", "before", "between"], random);
      let pool = [...config.range];
      if (dir === "after") pool = pool.filter((x) => x !== "Z");
      if (dir === "before") pool = pool.filter((x) => x !== "A");
      if (dir === "between") pool = pool.filter((x) => x !== "A" && x !== "Z");
      const target = pick(
        pool.filter((x) => x !== previous?.target),
        random,
      );
      const index = ALPHABET.indexOf(target);
      const answer =
        dir === "after"
          ? ALPHABET[index + 1]
          : dir === "before"
            ? ALPHABET[index - 1]
            : target;
      const question = {
        dir,
        target,
        answer,
        choices: withChoices(
          [answer],
          nearLetters(ALPHABET.indexOf(answer), [answer, target]),
          config.choices,
          random,
        ),
        help: helpSegment([target, answer]),
      };
      if (dir === "between") {
        question.left = ALPHABET[index - 1];
        question.right = ALPHABET[index + 1];
        question.target = `${question.left}${question.right}`;
      }
      return question;
    }
    if (mode === "missing") {
      const start = Math.floor(random() * (26 - config.length + 1));
      const row = [...ALPHABET.slice(start, start + config.length)];
      const holes = shuffle([...row.keys()], random)
        .slice(0, config.gaps)
        .sort((a, b) => a - b);
      const answers = holes.map((i) => row[i]);
      const outside = nearLetters(
        start + Math.floor(config.length / 2),
        row,
        Math.max(4, config.choices),
      );
      return {
        answer: answers.join(""),
        answers,
        row: row.map((letter, i) => (holes.includes(i) ? null : letter)),
        full: row.join(""),
        choices: withChoices(answers, outside, config.choices, random),
        help: row.join(""),
      };
    }
    if (mode === "merk") {
      const item = pick(
        MERK_WORDS.filter(
          (x) => config.rules.includes(x.rule) && x.spelled.replace(/[[\]]/g, "") !== previous?.word,
        ),
        random,
      );
      const [, before, answer, after] = item.spelled.match(/^(.*)\[(.+)\](.*)$/);
      const word = before + answer + after;
      return {
        word,
        before,
        after,
        answer,
        icon: item.icon,
        picture: config.picture !== false,
        choices: shuffle(item.choices, random),
        rule: item.rule,
        group: MERK_RULES[item.rule].group,
        speech: word,
        cue: `Wort: „${word}“ – Lösung: ${answer}`,
      };
    }
    if (mode === "initial" && config.reverse) {
      // Hear a sound, pick the picture that starts with it.
      const item = pick(
        WORDS.filter((x) => x.word !== previous?.word),
        random,
      );
      const others = shuffle(
        WORDS.filter((x) => x.initial !== item.initial),
        random,
      );
      const twin = config.confusable
        ? others.find((x) => x.initial === CONFUSABLE[item.initial])
        : null;
      const pictures = [item];
      for (const other of twin ? [twin, ...others] : others)
        if (
          pictures.length < config.choices &&
          !pictures.some((x) => x.initial === other.initial)
        )
          pictures.push(other);
      return {
        ...item,
        reverse: true,
        answer: item.initial,
        pictures: shuffle(pictures, random),
        speech: { laut: item.initial },
        cue: `Laut: „${LAUTE[item.initial].say}“ – Lösung: ${item.word}`,
      };
    }
    if (mode === "blend") {
      const fits = (x) =>
        x.sounds.length >= config.min && x.sounds.length <= config.max;
      const item = pick(
        BLEND_WORDS.filter((x) => fits(x) && x.word !== previous?.answer),
        random,
      );
      // Similar words share sounds in the same places (Rose, Hose, Dose).
      const likeness = (x) =>
        [...x.sounds].filter((sound, i) => item.sounds[i] === sound).length +
        (x.sounds.slice(-3) === item.sounds.slice(-3) ? 2 : 0);
      let pool = shuffle(
        BLEND_WORDS.filter(
          (x) =>
            x !== item && Math.abs(x.sounds.length - item.sounds.length) <= 1,
        ),
        random,
      );
      if (config.similar)
        pool = [...pool.sort((a, b) => likeness(b) - likeness(a)).slice(0, 5)];
      const choices = shuffle(
        [item, ...shuffle(pool, random).slice(0, config.choices - 1)],
        random,
      );
      return {
        answer: item.word,
        icon: item.icon,
        sounds: [...item.sounds],
        written: Boolean(config.written),
        choices: choices.map(({ word, icon }) => ({ word, icon })),
        gap: config.gap,
        speech: [...item.sounds].map((laut, dot) => ({
          laut,
          dot,
          gap: config.gap,
        })),
        cue: `Laute: ${[...item.sounds].map((x) => LAUTE[x].say.split(" ")[0]).join(" – ")} (Wort: ${item.word})`,
      };
    }
    if (mode === "initial") {
      const item = pick(
        WORDS.filter((x) => x.word !== previous?.word),
        random,
      );
      const initials = [...new Set(WORDS.map((x) => x.initial))].filter(
        (x) => x !== item.initial,
      );
      const twin = CONFUSABLE[item.initial];
      const pool = config.far
        ? initials.filter((x) => x !== twin && CONFUSABLE[x] !== item.initial)
        : initials;
      let choices = withChoices([item.initial], pool, config.choices, random);
      if (config.confusable && twin && !choices.includes(twin))
        choices = shuffle(
          [item.initial, twin, ...choices.filter((x) => x !== item.initial)].slice(
            0,
            config.choices,
          ),
          random,
        );
      return {
        ...item,
        answer: item.initial,
        picture: config.picture,
        choices,
        speech: item.word,
        cue: `Wort: „${item.word}“`,
      };
    }
    if (mode === "memory") {
      const words = shuffle(MEMORY_WORDS, random).slice(0, config.length);
      const expected = config.reverse ? [...words].reverse() : words;
      return {
        words,
        expected,
        reverse: Boolean(config.reverse),
        speech: words.join(". ") + ".",
        answer: expected.join(" – "),
        cue: `Vorlesen: ${words.join(", ")}`,
      };
    }
    if (mode === "echo") {
      const words = Array.from({ length: config.words || 1 }, () =>
        echoWord(config, random),
      );
      const text = words.map((parts) => capitalize(parts.join(""))).join(" ");
      return {
        answer: text,
        parts: words.map((parts) => parts.join(" – ")),
        speech: text,
        cue: `Vorlesen: ${text}`,
      };
    }
    if (mode === "movement") {
      const moves = shuffle(MOVES, random).slice(0, config.length);
      const expected = config.reverse ? [...moves].reverse() : moves;
      return {
        moves,
        expected,
        reverse: Boolean(config.reverse),
        speech: moves.map((x) => x.word).join(". ") + ".",
        answer: expected.map((x) => x.word).join(" – "),
        cue: `Vorlesen: ${moves.map((x) => x.word).join(", ")}`,
      };
    }
    throw new Error("Unbekanntes Spiel: " + mode);
  }

  /*
   * Dynamic progression after each solved task:
   * - solved on the first try: one step harder, so the child notices variety;
   * - solved after mistakes: a similar task on the same step;
   * - two such tasks in a row: one step easier again.
   */
  function progress(mode, level, firstTry, missStreak = 0) {
    const current = clampLevel(mode, level);
    if (firstTry) {
      const next = Math.min(current + 1, maxLevel(mode));
      return {
        level: next,
        missStreak: 0,
        change: next > current ? "up" : "same",
      };
    }
    const streak = missStreak + 1;
    if (streak >= 2 && current > 0)
      return { level: current - 1, missStreak: 0, change: "down" };
    return { level: current, missStreak: streak, change: "repeat" };
  }
  function roundFinished(hits, tasks) {
    return hits >= ROUND_GOAL || tasks >= ROUND_MAX_TASKS;
  }

  function defaultLevels() {
    return Object.fromEntries(ACTIVITIES.map((x) => [x.id, 0]));
  }
  function defaultState() {
    return {
      version: 2,
      stars: 0,
      totalStars: 0,
      rounds: 0,
      levels: defaultLevels(),
      lastPlayed: {},
      pet: { full: 40, joy: 60, updatedAt: 0 },
      food: {},
      plots: BEDS.map(() => ({ crop: null })),
      settings: { voice: "", rate: 0.8, autoSpeak: true, lowercase: false },
      stats: defaultStats(),
    };
  }
  const isCount = (value) => Number.isSafeInteger(value) && value >= 0;
  const isTime = (value) => Number.isFinite(value) && value >= 0;
  function sanitizePlot(raw) {
    const crop = CROPS.find((item) => item.id === raw?.crop);
    if (!crop) return { crop: null };
    return {
      crop: crop.id,
      step: raw.step === 1 ? 1 : 0,
      phase: ["dry", "growing", "ripe"].includes(raw.phase) ? raw.phase : "dry",
      since: isTime(raw.since) ? raw.since : 0,
    };
  }
  function sanitizeState(raw) {
    const state = defaultState();
    if (!raw || typeof raw !== "object" || ![1, 2].includes(raw.version))
      return state;
    for (const key of ["stars", "totalStars", "rounds"])
      if (isCount(raw[key])) state[key] = Math.min(raw[key], 1000000);
    // Version 1 only had one star counter: it is both balance and lifetime total.
    if (raw.version === 1) state.totalStars = state.stars;
    state.totalStars = Math.max(state.totalStars, state.stars);
    if (raw.levels && typeof raw.levels === "object")
      for (const mode of Object.keys(LEVELS))
        state.levels[mode] = clampLevel(mode, raw.levels[mode]);
    if (raw.lastPlayed && typeof raw.lastPlayed === "object")
      for (const mode of Object.keys(LEVELS))
        if (isTime(raw.lastPlayed[mode]))
          state.lastPlayed[mode] = raw.lastPlayed[mode];
    if (raw.pet && typeof raw.pet === "object")
      for (const key of ["full", "joy", "updatedAt"])
        if (isTime(raw.pet[key]))
          state.pet[key] = key === "updatedAt" ? raw.pet[key] : Math.min(100, raw.pet[key]);
    if (raw.food && typeof raw.food === "object")
      for (const crop of CROPS)
        if (isCount(raw.food[crop.id]) && raw.food[crop.id] > 0)
          state.food[crop.id] = Math.min(raw.food[crop.id], 999);
    if (Array.isArray(raw.plots))
      state.plots = state.plots.map((_, i) => sanitizePlot(raw.plots[i]));
    if (raw.settings && typeof raw.settings === "object") {
      if (typeof raw.settings.voice === "string")
        state.settings.voice = raw.settings.voice.slice(0, 500);
      if ([0.65, 0.8, 0.95].includes(raw.settings.rate))
        state.settings.rate = raw.settings.rate;
      for (const key of ["autoSpeak", "lowercase"])
        if (typeof raw.settings[key] === "boolean")
          state.settings[key] = raw.settings[key];
    }
    state.stats = sanitizeStats(raw.stats);
    return state;
  }

  /*
   * Learning statistics for the parents' report. Aggregated counters only, so
   * storage stays small: per game, per sound (heard games) and per ABC letter,
   * per day. "ok" always means "solved on the first try".
   */
  const STATS_DAYS = 90;
  const STATS_RECENT = 20;
  const STATS_LEVEL_POINTS = 40;
  const SOUND_GAMES = ["type", "initial"];
  const ABC_GAMES = ["missing", "neighbor", "order"];
  const AREAS = [
    { id: "hearing", title: "Laute hören", games: ["type", "initial", "blend"] },
    { id: "abc", title: "ABC & Reihenfolge", games: ABC_GAMES },
    { id: "spelling", title: "Merkwörter", games: ["merk"] },
    {
      id: "memory",
      title: "Merken & Nachsprechen",
      games: ["memory", "echo", "movement"],
    },
  ];
  function defaultStats() {
    return { games: {}, sounds: {}, abc: {}, merk: {}, days: {} };
  }
  function dayKey(time) {
    const date = new Date(time);
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  const isLetter = (key) => typeof key === "string" && /^[A-Z]$/.test(key);
  const count = (value, max = 1000000) =>
    isCount(value) ? Math.min(value, max) : 0;
  function sanitizeStats(raw) {
    const stats = defaultStats();
    if (!raw || typeof raw !== "object") return stats;
    for (const mode of Object.keys(LEVELS)) {
      const game = raw.games?.[mode];
      if (!game || typeof game !== "object") continue;
      stats.games[mode] = {
        tasks: count(game.tasks),
        ok: Math.min(count(game.ok), count(game.tasks)),
        mistakes: count(game.mistakes),
        ms: count(game.ms, 1e12),
        recent: (Array.isArray(game.recent) ? game.recent : [])
          .filter((x) => x === 0 || x === 1)
          .slice(-STATS_RECENT),
        levels: (Array.isArray(game.levels) ? game.levels : [])
          .filter(
            (x) =>
              Array.isArray(x) &&
              isTime(x[0]) &&
              Number.isInteger(x[1]) &&
              x[1] >= 0 &&
              x[1] <= maxLevel(mode),
          )
          .map(([time, level]) => [time, level])
          .slice(-STATS_LEVEL_POINTS),
        last: isTime(game.last) ? game.last : 0,
      };
    }
    for (const kind of ["sounds", "abc"])
      for (const [letter, entry] of Object.entries(raw[kind] || {})) {
        if (!isLetter(letter) || !entry || typeof entry !== "object") continue;
        const clean = {
          seen: count(entry.seen),
          ok: Math.min(count(entry.ok), count(entry.seen)),
        };
        if (kind === "sounds") {
          clean.wrong = {};
          for (const [other, n] of Object.entries(entry.wrong || {}))
            if (isLetter(other) && other !== letter && count(n))
              clean.wrong[other] = count(n);
        }
        stats[kind][letter] = clean;
      }
    for (const group of Object.keys(MERK_GROUPS)) {
      const entry = raw.merk?.[group];
      if (entry && typeof entry === "object")
        stats.merk[group] = {
          seen: count(entry.seen),
          ok: Math.min(count(entry.ok), count(entry.seen)),
        };
    }
    const days = Object.keys(raw.days || {})
      .filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(key))
      .sort()
      .slice(-STATS_DAYS);
    for (const key of days) {
      const day = raw.days[key];
      if (!day || typeof day !== "object") continue;
      stats.days[key] = {
        tasks: count(day.tasks),
        ok: Math.min(count(day.ok), count(day.tasks)),
        ms: count(day.ms, 86400000),
      };
    }
    return stats;
  }
  /*
   * Records one solved task. task = { mode, level (after progression),
   * firstTry, mistakes, ms, letters: asked sounds/letters, confusions:
   * [[asked, chosen], …] }.
   */
  function recordTask(state, task, now) {
    const stats = state.stats;
    const ok = task.firstTry ? 1 : 0;
    const game = (stats.games[task.mode] ||= {
      tasks: 0,
      ok: 0,
      mistakes: 0,
      ms: 0,
      recent: [],
      levels: [],
      last: 0,
    });
    const ms = Math.min(Math.max(0, task.ms || 0), 180000);
    game.tasks++;
    game.ok += ok;
    game.mistakes += task.mistakes || 0;
    game.ms += ms;
    game.recent = [...game.recent, ok].slice(-STATS_RECENT);
    game.last = now;
    if (!game.levels.length && task.startLevel != null)
      game.levels.push([now, task.startLevel]);
    if (game.levels.at(-1)?.[1] !== task.level)
      game.levels = [...game.levels, [now, task.level]].slice(-STATS_LEVEL_POINTS);
    const kind = SOUND_GAMES.includes(task.mode)
      ? "sounds"
      : ABC_GAMES.includes(task.mode)
        ? "abc"
        : null;
    if (kind)
      for (const letter of new Set(task.letters || [])) {
        if (!isLetter(letter)) continue;
        const entry = (stats[kind][letter] ||=
          kind === "sounds" ? { seen: 0, ok: 0, wrong: {} } : { seen: 0, ok: 0 });
        entry.seen++;
        entry.ok += ok;
      }
    if (kind === "sounds")
      for (const [asked, chosen] of task.confusions || [])
        if (isLetter(asked) && isLetter(chosen) && asked !== chosen && stats.sounds[asked])
          stats.sounds[asked].wrong[chosen] = (stats.sounds[asked].wrong[chosen] || 0) + 1;
    if (task.mode === "merk" && MERK_GROUPS[task.group]) {
      const entry = (stats.merk[task.group] ||= { seen: 0, ok: 0 });
      entry.seen++;
      entry.ok += ok;
    }
    const key = dayKey(now);
    const day = (stats.days[key] ||= { tasks: 0, ok: 0, ms: 0 });
    day.tasks++;
    day.ok += ok;
    day.ms += ms;
    const keys = Object.keys(stats.days).sort();
    for (const old of keys.slice(0, Math.max(0, keys.length - STATS_DAYS)))
      delete stats.days[old];
  }

  const CONFUSION_TIPS = {
    BP: "B und P: Hand vor den Mund halten – bei P spürt man einen Luftstoß, bei B kaum.",
    DT: "D und T: Bei T pustet die Zunge kräftig, D klingt weicher.",
    GK: "G und K: K ist hart und gehaucht, G weich und summend.",
    MN: "M und N: Bei M sind die Lippen geschlossen, bei N offen.",
    FW: "F und W: F zischt ohne Stimme, bei W summt die Stimme mit (Hand an den Hals).",
    EI: "E und I: Beim I lächelt der Mund breit, beim E ist er etwas offener.",
    OU: "O und U: Beim U werden die Lippen spitzer und kleiner als beim O.",
    SZ: "S und Z: Z ist ein kurzes „ts“, S ein langes Summen.",
    LR: "L und R: Bei L liegt die Zunge oben an den Zähnen, R kratzt hinten im Hals.",
  };
  const AREA_TIPS = {
    hearing:
      "Laute gemeinsam dehnen und hören: „Mmmaus – was hörst du am Anfang?“ Wörter langsam in Laute zerlegen und wieder zusammenziehen.",
    abc: "Das ABC-Lied singen, eine Buchstabenleiste aufhängen und Nachbarn zeigen lassen: „Wer kommt nach F?“",
    spelling:
      "Merkwörter auf Kärtchen schreiben, den besonderen Buchstaben farbig markieren und jeden Tag einmal gemeinsam lesen.",
    memory:
      "Merkspiele im Alltag: Einkaufsliste mit 3–4 Dingen merken, „Ich packe meinen Koffer“ spielen.",
  };
  const rate = (ok, total) => (total ? ok / total : null);

  /* Everything the parents' report shows, computed from the stored state. */
  function buildReport(state, now = Date.now()) {
    const stats = state.stats;
    const dayMs = 86400000;
    const lastDays = (from, length) =>
      Array.from({ length }, (_, i) => {
        const key = dayKey(now - (from + length - 1 - i) * dayMs);
        const day = stats.days[key] || { tasks: 0, ok: 0, ms: 0 };
        return { key, ...day };
      });
    const sum = (days, field) => days.reduce((total, day) => total + day[field], 0);
    const week = lastDays(0, 7);
    const previousWeek = lastDays(7, 7);
    const activity = lastDays(0, 14);
    const totalTasks = Object.values(stats.games).reduce((t, g) => t + g.tasks, 0);
    const kpis = {
      tasks: sum(week, "tasks"),
      tasksBefore: sum(previousWeek, "tasks"),
      rate: rate(sum(week, "ok"), sum(week, "tasks")),
      rateBefore: rate(sum(previousWeek, "ok"), sum(previousWeek, "tasks")),
      minutes: Math.round(sum(week, "ms") / 60000),
      minutesBefore: Math.round(sum(previousWeek, "ms") / 60000),
      activeDays: activity.filter((day) => day.tasks > 0).length,
      totalTasks,
      totalStars: state.totalStars,
      rounds: state.rounds,
    };
    const games = ACTIVITIES.map((activity) => {
      const game = stats.games[activity.id];
      const recent = game?.recent || [];
      let trend = null;
      if (recent.length >= 10) {
        const half = Math.floor(recent.length / 2);
        const before = recent.slice(0, half).reduce((a, b) => a + b, 0) / half;
        const after =
          recent.slice(half).reduce((a, b) => a + b, 0) / (recent.length - half);
        trend = after - before > 0.15 ? "up" : before - after > 0.15 ? "down" : "flat";
      }
      return {
        id: activity.id,
        title: activity.title,
        icon: activity.icon,
        together: Boolean(activity.together),
        level: state.levels[activity.id],
        maxLevel: maxLevel(activity.id),
        levelLabel: LEVELS[activity.id][state.levels[activity.id]].label,
        tasks: game?.tasks || 0,
        recentRate: recent.length >= 3 ? rate(recent.reduce((a, b) => a + b, 0), recent.length) : null,
        trend,
        history: (game?.levels || []).map(([, level]) => level),
        minutes: Math.round((game?.ms || 0) / 60000),
        last: game?.last || state.lastPlayed[activity.id] || 0,
      };
    });
    const areas = AREAS.map((area) => {
      const recent = area.games.flatMap((id) => stats.games[id]?.recent || []);
      const members = games.filter((game) => area.games.includes(game.id));
      return {
        id: area.id,
        title: area.title,
        tasks: members.reduce((total, game) => total + game.tasks, 0),
        rate: recent.length >= 5 ? rate(recent.reduce((a, b) => a + b, 0), recent.length) : null,
        progress:
          members.reduce((total, game) => total + game.level / game.maxLevel, 0) /
          members.length,
      };
    });
    const letters = (kind) => {
      const entries = Object.entries(stats[kind]).map(([letter, entry]) => ({
        letter,
        seen: entry.seen,
        rate: rate(entry.ok, entry.seen),
      }));
      return {
        strong: entries
          .filter((x) => x.seen >= 3 && x.rate >= 0.85)
          .sort((a, b) => b.rate - a.rate || b.seen - a.seen || a.letter.localeCompare(b.letter)),
        weak: entries
          .filter((x) => x.seen >= 2 && x.rate < 0.6)
          .sort((a, b) => a.rate - b.rate || b.seen - a.seen || a.letter.localeCompare(b.letter)),
      };
    };
    const pairs = {};
    for (const [asked, entry] of Object.entries(stats.sounds))
      for (const [chosen, n] of Object.entries(entry.wrong || {})) {
        const key = [asked, chosen].sort().join("");
        pairs[key] = (pairs[key] || 0) + n;
      }
    const confusions = Object.entries(pairs)
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5)
      .map(([key, n]) => ({ a: key[0], b: key[1], count: n }));
    const sounds = { ...letters("sounds"), confusions };
    const abc = letters("abc");
    const merk = Object.entries(MERK_GROUPS)
      .filter(([group]) => stats.merk[group]?.seen)
      .map(([group, title]) => ({
        group,
        title,
        seen: stats.merk[group].seen,
        rate: rate(stats.merk[group].ok, stats.merk[group].seen),
      }));

    const strengths = [];
    const focus = [];
    const tips = [];
    for (const area of areas) {
      if (area.rate == null) continue;
      if (area.rate >= 0.8)
        strengths.push(`${area.title}: ${Math.round(area.rate * 100)} % beim ersten Versuch richtig.`);
      else if (area.rate < 0.6) {
        focus.push(`${area.title}: nur ${Math.round(area.rate * 100)} % beim ersten Versuch richtig.`);
        tips.push(AREA_TIPS[area.id]);
      }
    }
    for (const game of games) {
      if (game.trend === "up") strengths.push(`${game.title}: wird gerade deutlich sicherer.`);
      if (game.trend === "down") focus.push(`${game.title}: zuletzt mehr Fehler als vorher.`);
    }
    if (sounds.strong.length)
      strengths.push(`Sichere Laute: ${sounds.strong.slice(0, 8).map((x) => x.letter).join(", ")}.`);
    if (sounds.weak.length) {
      focus.push(`Laute zum Üben: ${sounds.weak.slice(0, 6).map((x) => x.letter).join(", ")}.`);
      tips.push(
        `Übt die Laute ${sounds.weak.slice(0, 4).map((x) => `„${LAUTE[x.letter].say.split(" ")[0]}“ wie ${LAUTE[x.letter].example}`).join(", ")} – lang gedehnt und mit Anlaut-Wörtern.`,
      );
    }
    for (const pair of confusions) {
      focus.push(`Verwechselt ${pair.a} und ${pair.b} (${pair.count}×).`);
      tips.push(
        CONFUSION_TIPS[pair.a + pair.b] ||
          `${pair.a} und ${pair.b} werden noch verwechselt: beide Laute nebeneinander sprechen und vergleichen.`,
      );
    }
    if (abc.weak.length)
      focus.push(`Im ABC noch unsicher: ${abc.weak.slice(0, 6).map((x) => x.letter).join(", ")}.`);
    const merkWeak = merk.filter((x) => x.seen >= 2 && x.rate < 0.6);
    const merkStrong = merk.filter((x) => x.seen >= 3 && x.rate >= 0.85);
    if (merkStrong.length)
      strengths.push(`Merkwörter mit ${merkStrong.map((x) => x.title).join(", ")} sitzen.`);
    if (merkWeak.length) {
      focus.push(`Merkwörter mit ${merkWeak.map((x) => x.title).join(", ")} noch unsicher.`);
      for (const weak of merkWeak)
        tips.push(
          Object.values(MERK_RULES).find((rule) => rule.group === weak.group).text,
        );
    }
    const stale = games.filter(
      (game) => !game.together && game.tasks > 0 && now - game.last > 7 * dayMs,
    );
    if (stale.length)
      tips.push(`Länger nicht gespielt: ${stale.map((game) => game.title).join(", ")}. Ab und zu wiederholen festigt das Gelernte.`);
    const unplayed = games.filter((game) => !game.together && game.tasks === 0);
    if (totalTasks >= 5 && unplayed.length)
      tips.push(`Noch nicht ausprobiert: ${unplayed.map((game) => game.title).join(", ")}.`);
    return {
      enoughData: totalTasks >= 5,
      kpis,
      activity,
      games,
      areas,
      sounds,
      abc,
      merk,
      strengths,
      focus,
      tips: [...new Set(tips)],
    };
  }

  /* Momo, the garden pet. Needs fade slowly, but Momo never gets ill or leaves. */
  function petAt(pet, now) {
    if (!pet.updatedAt || now <= pet.updatedAt) return { ...pet, updatedAt: now };
    const hours = (now - pet.updatedAt) / 3600000;
    return {
      full: Math.max(0, pet.full - hours * PET_DECAY.full),
      joy: Math.max(0, pet.joy - hours * PET_DECAY.joy),
      updatedAt: now,
    };
  }
  function petMood(pet) {
    if (pet.full < 30) return "hungry";
    if (pet.joy < 30) return "sad";
    if (pet.full >= 70 && pet.joy >= 70) return "happy";
    return "ok";
  }
  function feedPet(state, cropId, now) {
    const crop = CROPS.find((item) => item.id === cropId);
    if (!crop || !(state.food[cropId] > 0)) return "none";
    const pet = petAt(state.pet, now);
    if (pet.full >= 95) {
      state.pet = pet;
      return "full";
    }
    state.food[cropId]--;
    if (!state.food[cropId]) delete state.food[cropId];
    state.pet = {
      ...pet,
      full: Math.min(100, pet.full + crop.full),
      joy: Math.min(100, pet.joy + crop.joy),
    };
    return "eaten";
  }
  function cuddlePet(state, now) {
    const pet = petAt(state.pet, now);
    state.pet = {
      ...pet,
      joy: pet.joy >= PET_PETTING_LIMIT ? pet.joy : Math.min(PET_PETTING_LIMIT, pet.joy + 4),
    };
  }
  function cheerPet(state, now, amount = 10) {
    const pet = petAt(state.pet, now);
    state.pet = { ...pet, joy: Math.min(100, pet.joy + amount) };
  }

  /* Garden beds: plant → water → sprout → water → ripe → harvest. */
  function bedCount(totalStars) {
    return BEDS.filter((at) => totalStars >= at).length;
  }
  function availableCrops(totalStars) {
    return CROPS.filter((crop) => totalStars >= crop.unlock);
  }
  function plotAt(plot, now) {
    if (!plot.crop || plot.phase !== "growing") return plot;
    const crop = CROPS.find((item) => item.id === plot.crop);
    if (now - plot.since < crop.grow / 2) return plot;
    if (plot.step === 0)
      return { ...plot, step: 1, phase: "dry", since: plot.since + crop.grow / 2 };
    return { ...plot, phase: "ripe", since: plot.since + crop.grow / 2 };
  }
  function plotProgress(plot, now) {
    if (!plot.crop) return 0;
    const current = plotAt(plot, now);
    if (current.phase === "ripe") return 1;
    const crop = CROPS.find((item) => item.id === current.crop);
    const within =
      current.phase === "growing"
        ? Math.min(1, (now - current.since) / (crop.grow / 2))
        : 0;
    return (current.step + within) / 2;
  }
  function plant(state, index, cropId, now) {
    const crop = availableCrops(state.totalStars).find((x) => x.id === cropId);
    if (!crop || index >= bedCount(state.totalStars)) return "locked";
    if (state.plots[index].crop) return "busy";
    if (state.stars < crop.cost) return "stars";
    state.stars -= crop.cost;
    state.plots[index] = { crop: crop.id, step: 0, phase: "dry", since: now };
    return "planted";
  }
  function water(state, index, now) {
    const plot = plotAt(state.plots[index], now);
    if (!plot.crop || plot.phase !== "dry") {
      state.plots[index] = plot;
      return "no";
    }
    state.plots[index] = { ...plot, phase: "growing", since: now };
    return "watered";
  }
  function harvest(state, index, now) {
    const plot = plotAt(state.plots[index], now);
    if (plot.phase !== "ripe") {
      state.plots[index] = plot;
      return null;
    }
    const crop = CROPS.find((item) => item.id === plot.crop);
    state.food[crop.id] = (state.food[crop.id] || 0) + crop.yield;
    state.plots[index] = { crop: null };
    return crop;
  }

  function newlyUnlocked(before, after) {
    return UNLOCKS.filter((item) => item.at > before && item.at <= after);
  }
  function nextUnlock(totalStars) {
    return UNLOCKS.find((item) => item.at > totalStars) || null;
  }
  function recommendedGame(state) {
    const solo = ACTIVITIES.filter((x) => !x.together);
    return [...solo].sort(
      (a, b) => (state.lastPlayed[a.id] || 0) - (state.lastPlayed[b.id] || 0),
    )[0].id;
  }

  return {
    ALPHABET,
    LAUTE,
    AMBIGUOUS_LAUTE,
    ACTIVITIES,
    LEVELS,
    WORDS,
    BLEND_WORDS,
    MERK_WORDS,
    MERK_RULES,
    MERK_GROUPS,
    CONFUSABLE,
    CROPS,
    BEDS,
    DECOR,
    UNLOCKS,
    ROUND_GOAL,
    ROUND_MAX_TASKS,
    shuffle,
    maxLevel,
    clampLevel,
    makeQuestion,
    progress,
    roundFinished,
    defaultState,
    sanitizeState,
    petAt,
    petMood,
    feedPet,
    cuddlePet,
    cheerPet,
    bedCount,
    availableCrops,
    plotAt,
    plotProgress,
    plant,
    water,
    harvest,
    newlyUnlocked,
    nextUnlock,
    recommendedGame,
    dayKey,
    recordTask,
    buildReport,
  };
});
